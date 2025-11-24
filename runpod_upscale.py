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
import concurrent.futures
import torch.multiprocessing as mp

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
        except ImportError:
            # If torchvision is missing, we can't do much, but we shouldn't crash at module level
            return
        module = types.ModuleType("torchvision.transforms.functional_tensor")
        module.rgb_to_grayscale = _tv_functional.rgb_to_grayscale
        sys.modules["torchvision.transforms.functional_tensor"] = module


# Call compat shim immediately if possible
_ensure_torchvision_compat()

# Note: We do NOT import torch/realesrgan/gfpgan here to avoid heavy startup cost in workers.

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp", ".heic"}
LANCZOS = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS

# Global variables for worker processes
worker_upsampler = None
worker_face_enhancer = None


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
        "--overwrite",
        action="store_true",
        help="Overwrite existing files (default: skip existing).",
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
    parser.add_argument(
        "--last",
        type=int,
        default=0,
        help="Process only the last N images (sorted alphabetically).",
    )
    parser.add_argument(
        "--low-vram",
        action="store_true",
        help="Optimize for 8GB VRAM (sets tile=512, use_half=True, clear_cache=5).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of parallel worker processes (default: 1).",
    )
    return parser.parse_args()


def find_images(root: Path) -> Iterable[Path]:
    """Find all image files recursively, preserving directory structure."""
    images = []
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTS:
            images.append(path)
    # Sort for deterministic ordering (crucial for --last)
    return sorted(images)


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
):
    # Local import to avoid top-level overhead
    import torch
    from realesrgan import RealESRGANer
    from basicsr.archs.rrdbnet_arch import RRDBNet

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


def build_face_enhancer(upsampler, model_scale: int):
    """Optionally load GFPGAN; fall back gracefully if weights are unavailable."""
    try:
        from gfpgan import GFPGANer
        device = upsampler.device if hasattr(upsampler, "device") else "cuda"
        return GFPGANer(
            model_path="https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.3.pth",
            upscale=model_scale,
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=None,
            device=device,
        )
    except Exception as exc:  # pragma: no cover - runtime safety
        print(f"GFPGAN could not be initialized: {exc}", file=sys.stderr)
        return None


def enhance_image(
    image: Image.Image,
    name: str,
    upsampler,
    face_enhancer,
    outscale: float,
) -> Image.Image:
    """Enhance single image using Real-ESRGAN and optional GFPGAN."""
    img = image.convert("RGB")
    np_img = np.array(img)[:, :, ::-1]  # RGB -> BGR for Real-ESRGAN
    output, _ = upsampler.enhance(np_img, outscale=outscale)

    if face_enhancer is not None:
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
    upsampler,
    face_enhancer,
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


def init_worker(
    model_path: Path,
    model_scale: int,
    tile: int,
    tile_pad: int,
    pre_pad: int,
    use_half: bool,
    use_face_enhance: bool,
) -> None:
    """Initialize models in the worker process."""
    global worker_upsampler, worker_face_enhancer
    
    # Limit threads to prevent CPU thrashing when running many workers
    import os
    os.environ["OMP_NUM_THREADS"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    
    try:
        import cv2
        cv2.setNumThreads(1)
    except ImportError:
        pass
    
    # Ensure compatibility patches are applied in worker
    _ensure_torchvision_compat()
    
    print(f"Initializing worker {mp.current_process().name}...", flush=True)
    worker_upsampler = build_upsampler(
        model_path=model_path,
        model_scale=model_scale,
        tile=tile,
        tile_pad=tile_pad,
        pre_pad=pre_pad,
        use_half=use_half,
    )
    
    if use_face_enhance:
        worker_face_enhancer = build_face_enhancer(worker_upsampler, model_scale)


def ensure_weights_exist(model_path: Path, face_enhance: bool, model_scale: int) -> None:
    """Pre-download/verify weights in the main process to avoid race conditions."""
    print("Verifying model weights...", flush=True)
    
    if not model_path.exists():
        print(f"Warning: Real-ESRGAN model not found at {model_path}", file=sys.stderr)
    
    if face_enhance:
        print("Ensuring GFPGAN weights are present (fast check)...", flush=True)
        try:
            # Common path for gfpgan weights
            import gfpgan
            gfpgan_path = Path(gfpgan.__file__).parent / "weights" / "GFPGANv1.3.pth"
            
            if not gfpgan_path.exists():
                print(f"Downloading GFPGAN weights to {gfpgan_path}...", flush=True)
                # Fallback to the heavy init ONLY if file is missing.
                from gfpgan import GFPGANer
                class DummyUpsampler:
                    device = "cpu"
                
                GFPGANer(
                    model_path="https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.3.pth",
                    upscale=model_scale,
                    arch="clean",
                    channel_multiplier=2,
                    bg_upsampler=DummyUpsampler(), # type: ignore
                    device="cpu",
                )
            else:
                print(f"GFPGAN weights found at {gfpgan_path}, skipping heavy init.", flush=True)
                
        except Exception as exc:
            print(f"Weight verification warning: {exc}", file=sys.stderr)


def process_image_task(
    src_path: Path,
    dst_path: Path,
    outscale: float,
    max_outscale: float,
    canvas_size: Tuple[int, int],
    background: Tuple[int, int, int],
    jpeg_quality: int,
) -> Tuple[str, bool, str]:
    """Worker task to process a single image using global models."""
    global worker_upsampler, worker_face_enhancer
    
    if worker_upsampler is None:
        return str(src_path), False, "Worker not initialized"

    try:
        process_image(
            src_path=src_path,
            dst_path=dst_path,
            upsampler=worker_upsampler,
            face_enhancer=worker_face_enhancer,
            outscale=outscale,
            max_outscale=max_outscale,
            canvas_size=canvas_size,
            background=background,
            jpeg_quality=jpeg_quality,
        )
        return str(src_path), True, ""
    except Exception as exc:
        return str(src_path), False, str(exc)


def main() -> int:
    args = parse_args()
    input_dir = args.input_dir
    output_dir = args.output_dir
    canvas_size = tuple(args.canvas_size)
    background = tuple(args.background)
    jpeg_quality = max(0, min(100, args.jpeg_quality))

    # Apply Low VRAM overrides
    if args.low_vram:
        print("Low VRAM mode enabled: forcing tile=512, half=True, clear_cache=5")
        args.tile = 512
        args.use_half = True
        if args.clear_cache_interval == 0:
            args.clear_cache_interval = 5

    if not input_dir.exists():
        print(f"Input directory does not exist: {input_dir}", file=sys.stderr)
        return 1
    output_dir.mkdir(parents=True, exist_ok=True)

    # Collect images
    all_images = list(find_images(input_dir))
    if args.last > 0:
        all_images = all_images[-args.last:]
        print(f"Processing only the last {len(all_images)} images.")
    
    # Filter out already processed if not overwriting
    tasks = []
    for src_path in all_images:
        rel_path = src_path.relative_to(input_dir)
        dst_path = (output_dir / rel_path).with_suffix(".jpg")
        
        if not args.overwrite and dst_path.exists():
            print(f"[skip] {rel_path} already processed")
            continue
        
        tasks.append((src_path, dst_path))

    if not tasks:
        print("No images to process.")
        return 0

    # Pre-check weights
    ensure_weights_exist(args.model_path, args.face_enhance, args.model_scale)

    print(f"Processing {len(tasks)} images with {args.workers} workers...", flush=True)

    # Set start method to spawn for CUDA compatibility
    try:
        mp.set_start_method('spawn', force=True)
    except RuntimeError:
        pass

    processed_count = 0
    failures = 0

    # If workers=1, run in main process to avoid overhead/complexity
    if args.workers <= 1:
        # Initialize models once
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

        for i, (src_path, dst_path) in enumerate(tasks, start=1):
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
                print(f"[{i}/{len(tasks)}] [ok] {src_path.name}", flush=True)
                processed_count += 1
            except Exception as exc:
                failures += 1
                print(f"[{i}/{len(tasks)}] [fail] {src_path.name}: {exc}", file=sys.stderr, flush=True)
            
            if args.clear_cache_interval and i % args.clear_cache_interval == 0:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

    else:
        # Parallel execution
        with concurrent.futures.ProcessPoolExecutor(
            max_workers=args.workers,
            initializer=init_worker,
            initargs=(
                args.model_path,
                args.model_scale,
                args.tile,
                args.tile_pad,
                args.pre_pad,
                args.use_half,
                args.face_enhance,
            ),
        ) as executor:
            future_to_path = {
                executor.submit(
                    process_image_task,
                    src_path,
                    dst_path,
                    args.outscale,
                    args.max_outscale,
                    canvas_size,
                    background,
                    jpeg_quality,
                ): src_path
                for src_path, dst_path in tasks
            }

            for i, future in enumerate(concurrent.futures.as_completed(future_to_path), start=1):
                src_path = future_to_path[future]
                try:
                    path_str, success, error_msg = future.result()
                    if success:
                        print(f"[{i}/{len(tasks)}] [ok] {Path(path_str).name}", flush=True)
                        processed_count += 1
                    else:
                        failures += 1
                        print(f"[{i}/{len(tasks)}] [fail] {Path(path_str).name}: {error_msg}", file=sys.stderr, flush=True)
                except Exception as exc:
                    failures += 1
                    print(f"[{i}/{len(tasks)}] [fail] {src_path.name}: {exc}", file=sys.stderr, flush=True)

    print("\n=== SUMMARY ===")
    print(f"Successfully processed: {processed_count} images")
    if failures:
        print(f"Failed: {failures} images", file=sys.stderr)
    print(f"Output written to: {output_dir.resolve()}")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
