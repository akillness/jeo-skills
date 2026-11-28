# Upstream Provenance: `Red2076-arch/waifu2x-image-upscaler-windows`

- **Repository**: <https://github.com/Red2076-arch/waifu2x-image-upscaler-windows>
- **Pinned Commit**: `022f8f96aef4a63ffb2a3acf867d7a6aaa88b086` (`2026-11-27`)
- **License**: `MIT`
- **Primary Interface**: `cli`

## Installation & Setup Channels

- Binary release: `waifu2x-ncnn-vulkan` standalone release
- Homebrew (macOS/Linux): `brew install waifu2x-ncnn-vulkan`
- CLI usage: `waifu2x-ncnn-vulkan -i in.png -o out.png -s 2 -n 2 -m models-cunet`

## Key Architecture & Concepts

- **Vulkan GPU Acceleration**: Hardware-accelerated neural inference without requiring proprietary NVIDIA CUDA drivers.
- **ncnn Framework**: High-performance neural computing framework optimized for low memory overhead and edge GPUs.
- **Model Flavors**: Includes `models-cunet` (optimal for 2D illustration line art) and `models-upconv_7_anime_style_art_rgb`.

## Boundaries & Cross-Routing

- Performs super-resolution and denoising on existing images; does not generate images from text prompts.
- Route out: Generative text-to-image synthesis -> `image`.
