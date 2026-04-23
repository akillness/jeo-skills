# compresso — Offline Batch Video & Image Compression

> Free, open-source, fully offline desktop compression.

← [Back to README](../../README.md)

---

## What `compresso` owns

`compresso` is the skill for [CompressO](https://github.com/codeforreal1/compressO), a cross-platform desktop application (Tauri + React) for batch video and image compression — entirely offline, no cloud calls.

Use this skill when you need to:
- **Compress videos** in batch without uploading to third-party services
- **Compress images** (PNG via pngquant, JPEG via jpegoptim, GIF via gifski)
- **Trim or split** video content
- **Convert** between video/image formats
- **Embed subtitles** (SRT/ASS) into video files
- **Manage metadata** (title, author, date) during compression
- **Build from source** using Rust + Node.js + pnpm

## Installation

### Homebrew (macOS)
```bash
brew install --cask codeforreal1/tap/compresso
```

### Plugin (Claude Code)
```bash
claude plugin marketplace add codeforreal1/compressO
```

### Installer Downloads
Visit [releases](https://github.com/codeforreal1/compressO/releases):

| Platform | File |
|----------|------|
| Debian/Ubuntu | `CompressO_amd64.deb` |
| Universal Linux | `CompressO_amd64.AppImage` |
| Apple Silicon | `CompressO_aarch64.dmg` |
| Intel Mac | `CompressO_x64.dmg` |
| Windows 64-bit | `CompressO_x64.msi` |

### Build from Source
```bash
git clone https://github.com/codeforreal1/compressO.git
cd compressO
pnpm install
pnpm tauri:build
```

---

## Feature overview

| Feature | Description |
|---------|-------------|
| Batch compression | Process multiple files at once |
| Video trim/split | Trim start/end or split into segments |
| Format conversion | Convert between common video/image formats |
| Subtitle embedding | Embed SRT/ASS subtitles into video |
| Metadata management | Update title, author, date during compression |
| 100% offline | No network dependency |
| Cross-platform | Linux, macOS, Windows |

---

## Technology stack

- **Desktop**: Tauri (Rust)
- **Frontend**: React + Vite
- **Video**: FFmpeg
- **PNG**: pngquant
- **JPEG**: jpegoptim
- **GIF**: gifski

---

## Further reading

- [`.agent-skills/compresso/SKILL.md`](../../.agent-skills/compresso/SKILL.md)
- [codeforreal1/compressO](https://github.com/codeforreal1/compressO)
- [Releases page](https://github.com/codeforreal1/compressO/releases)
