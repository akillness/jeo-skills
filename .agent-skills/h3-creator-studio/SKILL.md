---
name: h3-creator-studio
description: >
  Operate animede/h3-creator-studio (YUZU Creator Studio), a local AI creative suite orchestrating text-to-video (MiniMax-H3), music generation (ACE-Step), voice synthesis (AivisSpeech), and image models with aggressive VRAM/RAM paging management for 8-96GB GPUs. Use when producing AI music videos, multi-scene video stories, automated prompt enhancement, or low-VRAM generation on consumer GPUs (e.g. RTX 3060 6GB) with dynamic engine unloading. Do not use for cloud commercial API video generation (route to media-video) or standalone audio mastering (route to audio). Triggers on: h3-creator-studio, yuzu creator studio, minimax-h3, ace-step music, local ai music video, low vram video, animede.
allowed-tools: Read Glob Grep Bash
compatibility: Python 3.10+, NVIDIA GPU 6GB+ VRAM (or Apple Silicon), ffmpeg. Preflight runs offline in Python 3.10+.
license: Apache-2.0
metadata:
  version: "1.0.0"
  source: https://github.com/animede/h3-creator-studio
  upstream_commit: 6ef2167bbab80a1e3da7b79fee0c4b3a24481d61
  pinned_at: "2026-11-27"
---
# H3 Creator Studio (`animede/h3-creator-studio`)

Source-pinned operator guide for `animede/h3-creator-studio` (Apache-2.0), providing verified instructions and offline preflight validation.

## When to use this skill

- Local AI creator studio orchestrating MiniMax-H3 video, ACE-Step music, and AivisSpeech with low-VRAM GPU management.
- For complete trigger patterns: h3-creator-studio, minimax-h3, video-generation, ace-step, music-video, low-vram, local-ai.
- Cross-routing boundaries: route out to `video`, `audio`, `media-video` where appropriate.

## Instructions

1. **Run offline preflight first** to confirm tool availability and pinned file integrity:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Verify installation channels & environment prerequisites**:
   - Python launch: `python start.py`
   - GUI / Agent: Web UI or local API daemon
   - Engine switching flag: `[gpu] stop_on_switch = true` for memory-constrained PCs

3. **Execute verified workflows & operations**:
   - **Multi-Model Local Pipeline**: Orchestrates video generation, AI music composition, voice synthesis, and image generation within one studio.
   - **Dynamic Memory Management (`stop_on_switch`)**: Unloads preceding model weights from VRAM and RAM prior to initializing the next inference phase.
   - **Scene Timeline Architecture**: Assembles multiple AI video segments into complete music videos with synchronized audio tracks.

4. **Gate sensitive mutating operations & respect boundaries**:
   - Requires high local disk capacity (~5-15GB per engine weight) and a dedicated GPU or Apple Silicon.
   - Route out: Hosted cloud video APIs -> `media-video`; Pure audio mastering -> `audio`.

## References

- Pinned upstream summary and concepts: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
