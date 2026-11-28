# Upstream Provenance: `animede/h3-creator-studio`

- **Repository**: <https://github.com/animede/h3-creator-studio>
- **Pinned Commit**: `6ef2167bbab80a1e3da7b79fee0c4b3a24481d61` (`2026-11-27`)
- **License**: `Apache-2.0`
- **Primary Interface**: `cli`

## Installation & Setup Channels

- Python launch: `python start.py`
- GUI / Agent: Web UI or local API daemon
- Engine switching flag: `[gpu] stop_on_switch = true` for memory-constrained PCs

## Key Architecture & Concepts

- **Multi-Model Local Pipeline**: Orchestrates video generation, AI music composition, voice synthesis, and image generation within one studio.
- **Dynamic Memory Management (`stop_on_switch`)**: Unloads preceding model weights from VRAM and RAM prior to initializing the next inference phase.
- **Scene Timeline Architecture**: Assembles multiple AI video segments into complete music videos with synchronized audio tracks.

## Boundaries & Cross-Routing

- Requires high local disk capacity (~5-15GB per engine weight) and a dedicated GPU or Apple Silicon.
- Route out: Hosted cloud video APIs -> `media-video`; Pure audio mastering -> `audio`.
