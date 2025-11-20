# RUNPOD_SERVER

Image upscaling server using Real-ESRGAN and GFPGAN.

## Setup

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Download Model Weights

The model weights are too large for GitHub. Download them separately:

- **RealESRGAN_x4plus.pth**: Place in `weights/` directory
  - Download from: https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth

- **GFPGAN weights**: Will be automatically downloaded when you run with `--face-enhance` flag

### 3. Run the Upscaler

```bash
python runpod_upscale.py --input-dir SCRAPED_IMAGES --output-dir upscaled --face-enhance
```

## GPU Support

For NVIDIA GPU acceleration, install PyTorch with CUDA:

```bash
pip uninstall -y torch torchvision torchaudio
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```
