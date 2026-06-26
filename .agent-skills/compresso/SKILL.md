---
name: compresso
description: ">"
allowed-tools: Read Write Bash Grep Glob WebFetch
metadata:
  tags: compresso, compression, video-compression, image-compression, batch-compression, ffmpeg, tauri, offline, cross-platform, pngquant, jpegoptim, gifski
  platforms: Claude Code, Codex CLI, Gemini CLI, OpenCode
  keyword: compresso
  version: latest
  source: codeforreal1/compressO
  license: AGPL-3.0
---






# compresso — Offline Batch Video & Image Compression

> Free, open-source, fully offline desktop compression powered by FFmpeg, pngquant, jpegoptim, and gifski.

`CompressO` is a cross-platform desktop app (Tauri + React/Vite) for compressing, trimming, converting, and enriching video and image files — entirely on your local machine with no external calls.

## Installation

### Plugin (Claude Code)
```bash
claude plugin marketplace add codeforreal1/compressO
```

### Homebrew (macOS)
```bash
brew install --cask codeforreal1/tap/compresso
```

### Installer (all platforms)
Download from [github.com/codeforreal1/compressO/releases](https://github.com/codeforreal1/compressO/releases):

| Platform | Installer |
|----------|-----------|
| Debian/Ubuntu | `CompressO_amd64.deb` |
| Universal Linux | `CompressO_amd64.AppImage` |
| Apple Silicon | `CompressO_aarch64.dmg` |
| Intel Mac | `CompressO_x64.dmg` |
| Windows 64-bit | `CompressO_x64.msi` |

### Skill (any platform)
```bash
npx skills add https://github.com/akillness/jeo-skills --skill compresso
```

## When to use

- Compress a single video or batch of videos without uploading to a third-party service
- Reduce image file sizes (PNG → pngquant, JPEG → jpegoptim, GIF → gifski)
- Trim or split video content without a full video editor
- Convert between video/image formats via the FFmpeg pipeline
- Embed subtitles into video files locally
- Manage file metadata (title, author, date) during compression

## Do not use when

- You need cloud-based transcoding or CDN delivery → route to a managed video service
- You need programmatic FFmpeg scripting in CI/CD → call `ffmpeg` CLI directly
- You need advanced NLE editing (multi-track, color grading) → route to a full video editor
- You need streaming video packaging (HLS, DASH) → route to a dedicated packaging tool

## Key features

| Feature | Detail |
|---------|--------|
| **Batch compression** | Process multiple video and image files simultaneously |
| **Video trimming** | Trim start/end or split video into segments |
| **Format conversion** | Convert between common video and image formats |
| **Metadata management** | Update title, author, date metadata during compression |
| **Subtitle embedding** | Embed SRT/ASS subtitles into video files |
| **Advanced config** | Fine-grained video codec, bitrate, and audio settings |
| **100% offline** | No network calls; all processing is local |
| **Cross-platform** | Linux, macOS, Windows via Tauri |

## Technology stack

| Layer | Tech |
|-------|------|
| Desktop shell | Tauri (Rust) |
| Frontend | React + Vite |
| Video compression | FFmpeg |
| PNG compression | pngquant |
| JPEG compression | jpegoptim |
| GIF compression | gifski |

## Build from source

**Prerequisites**: Rust toolchain + Node.js + pnpm

```bash
git clone https://github.com/codeforreal1/compressO.git
cd compressO
pnpm install

# Development
pnpm tauri:dev      # full Tauri + React dev mode
pnpm vite:dev       # frontend only

# Production build
pnpm tauri:build    # output: src-tauri/target/release/bundle/
```

## Operating rules

1. Always prefer a pre-built installer for end-user machines; build from source only when the user needs a custom Tauri/Rust configuration
2. Confirm FFmpeg, pngquant, jpegoptim, and gifski are available on the system PATH before CLI-based compression workflows
3. Use batch mode for ≥ 3 files to avoid per-file startup overhead
4. Route subtitle embedding through CompressO's built-in flow rather than raw `ffmpeg -vf subtitles=…` for consistent output naming
5. Check the releases page for the latest DMG/MSI/AppImage before building from source

## Examples

```bash
# macOS install
brew install --cask codeforreal1/tap/compresso

# Linux install (AppImage)
chmod +x CompressO_amd64.AppImage && ./CompressO_amd64.AppImage

# Build from source (all platforms)
git clone https://github.com/codeforreal1/compressO.git
cd compressO && pnpm install && pnpm tauri:build
```

Source: [codeforreal1/compressO](https://github.com/codeforreal1/compressO) — AGPL-3.0 License
