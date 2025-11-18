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
                'torchvision is required but missing; install torchvision to proceed.'
            ) from exc
        module = types.ModuleType('torchvision.transforms.functional_tensor')
        module.rgb_to_grayscale = _tv_functional.rgb_to_grayscale
        sys.modules['torchvision.transforms.functional_tensor'] = module


_ensure_torchvision_compat()

try:
    import torch
    from realesrgan import RealESRGANer
    from basicsr.archs.rrdbnet_arch import RRDBNet
except ImportError as exc:  # pragma: no cover - surfaced during runtime
    print(
        "Missing Real-ESRGAN dependencies. Install with `pip install realesrgan basicsr`.",
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
    return parser.parse_args()


def find_images(root: Path) -> Iterable[Path]:
    """Find all image files recursively, preserving directory structure."""
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTS:
            yield path


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


def enhance_image(path: Path, upsampler: RealESRGANer, outscale: float) -> Image.Image:
    """Enhance single image using Real-ESRGAN."""
    print(f"  Enhancing {path.name}...")
    with Image.open(path) as img:
        img = img.convert("RGB")
        np_img = np.array(img)[:, :, ::-1]  # RGB -> BGR for Real-ESRGAN
    output, _ = upsampler.enhance(np_img, outscale=outscale)
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
    outscale: float,
    canvas_size: Tuple[int, int],
    background: Tuple[int, int, int],
    jpeg_quality: int,
) -> None:
    upscaled = enhance_image(src_path, upsampler, outscale)
    final_img = fit_on_canvas(upscaled, canvas_size, background)
    final_img.save(dst_path, format="JPEG", quality=jpeg_quality, optimize=True)


def main() -> None:
    args = parse_args()

    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()
    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory not found: {input_dir}")
    if not args.model_path.exists():
        raise FileNotFoundError(f"Model weights not found: {args.model_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    upsampler = build_upsampler(
        model_path=args.model_path.resolve(),
        model_scale=args.model_scale,
        tile=args.tile,
        tile_pad=args.tile_pad,
        pre_pad=args.pre_pad,
        use_half=args.use_half,
    )

    background = tuple(args.background)
    canvas_size = tuple(args.canvas_size)
    outscale = args.outscale

    total = 0
    failures = 0
    for idx, src_path in enumerate(find_images(input_dir), start=1):
        rel_path = src_path.relative_to(input_dir)
        dst_path = (output_dir / rel_path).with_suffix(".jpg")
        if args.skip_existing and dst_path.exists():
            print(f"[skip] {rel_path} already processed")
            continue
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            process_image(
                src_path=src_path,
                dst_path=dst_path,
                upsampler=upsampler,
                outscale=outscale,
                canvas_size=canvas_size,
                background=background,
                jpeg_quality=args.jpeg_quality,
            )
        except Exception as exc:  # pragma: no cover - runtime safety
            failures += 1
            print(f"[fail] {rel_path}: {exc}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
        else:
            total += 1
            print(f"[ok]   {rel_path} -> {dst_path.relative_to(output_dir)}")

        if args.clear_cache_interval and idx % args.clear_cache_interval == 0:
            torch.cuda.empty_cache()

    print(f"\n=== SUMMARY ===")
    print(f"Successfully processed: {total} images")
    if failures:
        print(f"Failed: {failures} images", file=sys.stderr)
    print(f"Output written to: {output_dir.resolve()}")


if __name__ == "__main__":
    main()