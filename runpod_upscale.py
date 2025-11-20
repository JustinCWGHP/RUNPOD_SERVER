#!/usr/bin/env python
"""Batch upscale images with Real-ESRGAN and export 2048x2048 JPEGs on a white canvas.

Example (inside your RunPod pod):
    python scripts/runpod_upscale.py --input-dir images --output-dir output \
        --model-path /workspace/Real-ESRGAN/weights/RealESRGAN_x4plus.pth
"""

from __future__ import annotations

import argparse
import sys
import traceback
import types
from pathlib import Path
from typing import Iterable, Tuple

import numpy as np
from PIL import Image


# Temporary shim for torchvision>=0.15 where functional_tensor moved.
# basicsr still imports torchvision.transforms.functional_tensor, so we provide a proxy.
def _ensure_torchvision_compat() -> None:
    try:
        import torchvision.transforms.functional_tensor  # type: ignore  # noqa: F401
    except ModuleNotFoundError:
        try:
            from torchvision.transforms import functional as _tv_functional
        except ImportError as exc:  # pragma: no cover - environment guard
            raise ImportError(
                "torchvision is required but missing; install torchvision to proceed."
            ) from exc
        module = types.ModuleType("torchvision.transforms.functional_tensor")
        module.rgb_to_grayscale = _tv_functional.rgb_to_grayscale
        sys.modules["torchvision.transforms.functional_tensor"] = module


_ensure_torchvision_compat()

try:
    import torch
    from realesrgan import RealESRGANer
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from gfpgan import GFPGANer
except ImportError as exc:  # pragma: no cover - surfaced during runtime
    print(
        "Missing Real-ESRGAN dependencies. Install with `pip install -r requirements.txt`.",
        file=sys.stderr,
    )
    raise

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp", ".heic"}
LANCZOS = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upscale images with Real-ESRGAN and fit them on a 2048x2048 white background.",
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path("images"),
        help="Directory containing source images (preserves nested folders).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("upscaled"),
        help="Directory where processed JPEGs will be written.",
    )
    parser.add_argument(
        "--model-path",
        type=Path,
        default=Path("weights/RealESRGAN_x4plus.pth"),
        help="Path to the Real-ESRGAN model weights (.pth).",
    )
    parser.add_argument(
        "--model-scale",
        type=int,
        default=4,
        help="Upscaling factor the model was trained for (e.g. 4 for x4).",
    )
    parser.add_argument(
        "--outscale",
        type=float,
        default=4.0,
        help="Desired upscale factor passed to Real-ESRGAN (default matches model-scale).",
    )
    parser.add_argument(
        "--max-outscale",
        type=float,
        default=16.0,
        help="Upper bound for automatic per-image upscale adjustments; set <=0 to disable.",
    )
    parser.add_argument(
        "--tile",
        type=int,
        default=0,
        help="Tile size for tiled inference (0 disables tiling; use e.g. 512 to reduce VRAM usage).",
    )
    parser.add_argument(
        "--tile-pad",
        type=int,
        default=10,
        help="Padding size for tiled inference overlap.",
    )
    parser.add_argument(
        "--pre-pad",
        type=int,
        default=0,
        help="Pre-padding size applied before inference (helps avoid border artifacts).",
    )
    parser.add_argument(
        "--use-half",
        action="store_true",
        help="Use FP16 inference (saves VRAM on modern NVIDIA GPUs).",
    )
    parser.add_argument(
        "--canvas-size",
        type=int,
        nargs=2,
        default=(2048, 2048),
        metavar=("WIDTH", "HEIGHT"),
        help="Final canvas size (default: 2048 2048).",
    )
    parser.add_argument(
        "--background",
        type=int,
        nargs=3,
        default=(255, 255, 255),
        metavar=("R", "G", "B"),
        help="Background color used when padding (default: white).",
    )
    parser.add_argument(
        "--jpeg-quality",
        type=int,
        default=95,
        help="JPEG quality (0-100).",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip processing if the destination file already exists.",
    )
    parser.add_argument(
        "--clear-cache-interval",
        type=int,
        default=0,
        help="Call torch.cuda.empty_cache() after this many images (0 disables).",
    )
    parser.add_argument(
        "--face-enhance",
        action="store_true",
        help="Use GFPGAN to enhance faces (downloads GFPGAN weights if missing).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most N images (0 processes all). Handy for smoke tests.",
    )
    return parser.parse_args()


def find_images(root: Path) -> Iterable[Path]:
    """Find all image files recursively, preserving directory structure."""
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTS:
            yield path


def determine_outscale(
    src_size: Tuple[int, int],
    base_outscale: float,
    canvas_size: Tuple[int, int],
    max_outscale: float,
) -> float:
    """Ensure the Real-ESRGAN stage enlarges small images enough to cover the canvas."""
    src_w, src_h = src_size
    if src_w <= 0 or src_h <= 0:
        raise ValueError("Source image has invalid dimensions")

    required_scale = max(canvas_size[0] / src_w, canvas_size[1] / src_h)
    outscale = max(base_outscale, required_scale)
    if max_outscale > 0:
        outscale = min(outscale, max_outscale)
    return outscale


def build_upsampler(
    model_path: Path,
    model_scale: int,
    tile: int,
    tile_pad: int,
    pre_pad: int,
    use_half: bool,
) -> RealESRGANer:
    model = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_block=23,
        num_grow_ch=32,
        scale=model_scale,
    )
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu" and use_half:
        print("CUDA not available; disabling half precision.", file=sys.stderr)
        use_half = False

    if torch.cuda.is_available():
        print(f"Using device: {device} (GPU: {torch.cuda.get_device_name()})")
        print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    else:
        print(f"Using device: {device}")

    return RealESRGANer(
        scale=model_scale,
        model_path=str(model_path),
        model=model,
        tile=tile,
        tile_pad=tile_pad,
        pre_pad=pre_pad,
        half=use_half,
        device=device,
    )


def build_face_enhancer(upsampler: RealESRGANer, model_scale: int) -> GFPGANer | None:
    """Optionally load GFPGAN; fall back gracefully if weights are unavailable."""
    try:
        device = upsampler.device if hasattr(upsampler, "device") else "cuda"
        return GFPGANer(
            model_path=None,
            upscale=model_scale,
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=upsampler,
            device=device,
        )
    except Exception as exc:  # pragma: no cover - runtime safety
        print(f"GFPGAN could not be initialized: {exc}", file=sys.stderr)
        return None


def enhance_image(
    image: Image.Image,
    name: str,
    upsampler: RealESRGANer,
    face_enhancer: GFPGANer | None,
    outscale: float,
) -> Image.Image:
    """Enhance single image using Real-ESRGAN and optional GFPGAN."""
    print(f"  Enhancing {name} (scale x{outscale:.2f})...")
    img = image.convert("RGB")
    np_img = np.array(img)[:, :, ::-1]  # RGB -> BGR for Real-ESRGAN
    output, _ = upsampler.enhance(np_img, outscale=outscale)

    if face_enhancer is not None:
        print("    Enhancing faces...")
        _, _, output = face_enhancer.enhance(
            output,
            has_aligned=False,
            only_center_face=False,
            paste_back=True,
        )

    output = output[:, :, ::-1]  # BGR -> RGB
    return Image.fromarray(output)


def fit_on_canvas(image: Image.Image, size: Tuple[int, int], background: Tuple[int, int, int]) -> Image.Image:
    target_w, target_h = size
    if target_w <= 0 or target_h <= 0:
        raise ValueError("Canvas dimensions must be positive")

    scale = min(target_w / image.width, target_h / image.height)
    new_w = max(1, int(round(image.width * scale)))
    new_h = max(1, int(round(image.height * scale)))

    resized = image.resize((new_w, new_h), resample=LANCZOS)
    canvas = Image.new("RGB", (target_w, target_h), color=tuple(background))
    offset_x = (target_w - new_w) // 2
    offset_y = (target_h - new_h) // 2
    canvas.paste(resized, (offset_x, offset_y))
    return canvas


def process_image(
    src_path: Path,
    dst_path: Path,
    upsampler: RealESRGANer,
    face_enhancer: GFPGANer | None,
    outscale: float,
    max_outscale: float,
    canvas_size: Tuple[int, int],
    background: Tuple[int, int, int],
    jpeg_quality: int,
) -> None:
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src_path) as source_img:
        dynamic_outscale = determine_outscale(
            src_size=source_img.size,
            base_outscale=outscale,
            canvas_size=canvas_size,
            max_outscale=max_outscale,
        )
        upscaled = enhance_image(source_img, src_path.name, upsampler, face_enhancer, dynamic_outscale)
    final_img = fit_on_canvas(upscaled, canvas_size, background)
    final_img.save(dst_path, format="JPEG", quality=jpeg_quality, optimize=True)


def main() -> int:
    args = parse_args()
    input_dir = args.input_dir
    output_dir = args.output_dir
    canvas_size = tuple(args.canvas_size)
    background = tuple(args.background)
    jpeg_quality = max(0, min(100, args.jpeg_quality))

    if not input_dir.exists():
        print(f"Input directory does not exist: {input_dir}", file=sys.stderr)
        return 1
    output_dir.mkdir(parents=True, exist_ok=True)

    upsampler = build_upsampler(
        model_path=args.model_path,
        model_scale=args.model_scale,
        tile=args.tile,
        tile_pad=args.tile_pad,
        pre_pad=args.pre_pad,
        use_half=args.use_half,
    )
    face_enhancer = None
    if args.face_enhance:
        face_enhancer = build_face_enhancer(upsampler, args.model_scale)
        if face_enhancer is None:
            print("Continuing without face enhancement.", file=sys.stderr)

    processed = 0
    failures = 0

    for idx, src_path in enumerate(find_images(input_dir), start=1):
        rel_path = src_path.relative_to(input_dir)
        dst_path = (output_dir / rel_path).with_suffix(".jpg")
        if args.skip_existing and dst_path.exists():
            print(f"[skip] {rel_path} already processed")
            continue
        if args.limit and processed >= args.limit:
            break

        try:
            process_image(
                src_path=src_path,
                dst_path=dst_path,
                upsampler=upsampler,
                face_enhancer=face_enhancer,
                outscale=args.outscale,
                max_outscale=args.max_outscale,
                canvas_size=canvas_size,
                background=background,
                jpeg_quality=jpeg_quality,
            )
        except Exception as exc:  # pragma: no cover - runtime safety
            failures += 1
            print(f"[fail] {rel_path}: {exc}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
        else:
            processed += 1
            print(f"[ok]   {rel_path} -> {dst_path.relative_to(output_dir)}")

        if args.clear_cache_interval and torch.cuda.is_available() and idx % args.clear_cache_interval == 0:
            torch.cuda.empty_cache()

    print("\n=== SUMMARY ===")
    print(f"Successfully processed: {processed} images")
    if failures:
        print(f"Failed: {failures} images", file=sys.stderr)
    print(f"Output written to: {output_dir.resolve()}")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
