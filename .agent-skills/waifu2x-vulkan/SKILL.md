---
name: waifu2x-vulkan
description: >
  Operate Red2076-arch/waifu2x-image-upscaler-windows, a Vulkan GPU-accelerated image upscaler and photo denoiser powered by ncnn neural network runtimes across AMD, Intel, NVIDIA, and Apple Silicon. Use when upscaling anime artwork, cleaning JPEG compression artifacts, batch denoising photos, or automating image super-resolution without heavy CUDA or cloud dependencies. Do not use for diffusion generative image synthesis (route to image) or video temporal interpolation (route to media-video). Triggers on: waifu2x, waifu2x-vulkan, ncnn upscaler, image super-resolution, photo denoiser, Red2076-arch.
allowed-tools: Read Glob Grep Bash
compatibility: Vulkan 1.1+ GPU driver, waifu2x-ncnn-vulkan binary. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/Red2076-arch/waifu2x-image-upscaler-windows
  upstream_commit: 022f8f96aef4a63ffb2a3acf867d7a6aaa88b086
  pinned_at: "2026-11-27"
---
# Waifu2x Vulkan (`Red2076-arch/waifu2x-image-upscaler-windows`)

Source-pinned operator guide for `Red2076-arch/waifu2x-image-upscaler-windows` (MIT), providing verified instructions and offline preflight validation.

## When to use this skill

- Upscale and denoise images with Vulkan GPU-accelerated ncnn neural network models across Windows, Linux, and macOS.
- For complete trigger patterns: waifu2x, upscaler, vulkan, ncnn, denoiser, super-resolution, image-processing.
- Cross-routing boundaries: route out to `image`, `media-video`, `creative-media` where appropriate.

## Instructions

1. **Run offline preflight first** to confirm tool availability and pinned file integrity:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Verify installation channels & environment prerequisites**:
   - Binary release: `waifu2x-ncnn-vulkan` standalone release
   - Homebrew (macOS/Linux): `brew install waifu2x-ncnn-vulkan`
   - CLI usage: `waifu2x-ncnn-vulkan -i in.png -o out.png -s 2 -n 2 -m models-cunet`

3. **Execute verified workflows & operations**:
   - **Vulkan GPU Acceleration**: Hardware-accelerated neural inference without requiring proprietary NVIDIA CUDA drivers.
   - **ncnn Framework**: High-performance neural computing framework optimized for low memory overhead and edge GPUs.
   - **Model Flavors**: Includes `models-cunet` (optimal for 2D illustration line art) and `models-upconv_7_anime_style_art_rgb`.

4. **Gate sensitive mutating operations & respect boundaries**:
   - Performs super-resolution and denoising on existing images; does not generate images from text prompts.
   - Route out: Generative text-to-image synthesis -> `image`.

## References

- Pinned upstream summary and concepts: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
