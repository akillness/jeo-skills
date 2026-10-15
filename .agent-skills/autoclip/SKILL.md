---
name: autoclip
description: >
  Operate artbyjazi/autoclip, the MIT-licensed local-first AI video clipper that turns long-form
  video into ranked, caption-burned, speaker-tracked 9:16 vertical clips. Run autoclip doctor to
  check ffmpeg-full (libass/libx264) and Python 3.11/3.12 dependencies, run autoclip clip
  <url|file> for end-to-end ingestion, Whisper transcription, LLM highlight detection (local
  Ollama or BYOK Anthropic/OpenAI/Gemini), MediaPipe face/speaker-tracked vertical reframing,
  animated caption styling (bold_pop, karaoke_fill, clean_lower, boxed), and multi-aspect export
  (9:16, 1:1, 16:9), or serve the local review web app (autoclip serve). Use when the user wants
  to convert long videos, podcasts, or webinars into vertical Shorts, Reels, or TikTok clips
  without uploading video to third-party servers. Triggers on: autoclip, auto clip, AI video
  clipper, podcast clipper, long to short video, vertical reframing, speaker tracking video, burn
  animated captions, youtube to shorts clipper.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Runs on macOS (Apple Silicon), Linux, and Windows. Requires Python 3.11 or 3.12 (not 3.13 due to
  MediaPipe wheels), and a full build of FFmpeg with libass and libx264 support (on macOS use
  `brew install ffmpeg-full`; plain Homebrew ffmpeg lacks libass). Node.js 20+ required to build
  the review frontend. Local transcription uses Whisper/CTranslate2; LLM selection runs offline
  with Ollama or BYOK (Anthropic, OpenAI, Gemini). MIT licensed.
metadata:
  category: creative-media
  subcategory: video
  interface: cli
  tags: autoclip, video-clipper, shorts, reels, tiktok, podcast-clips, local-first, whisper, mediapipe, speaker-tracking, captions, ffmpeg
  platforms: Claude Code, Codex, OpenCode, Terminal
  version: "1.0"
  source: https://github.com/artbyjazi/autoclip
---

# AutoClip — Local-First AI Video Clipper

`autoclip` is an open-source, local-first AI video clipper that converts long-form video
(podcasts, interviews, webinars, conference talks) into platform-ready 9:16 vertical clips
with speaker-tracked reframing and animated captions.

No cloud uploads, no watermarks, and no subscription fees. Only transcript text is sent to an LLM
for highlight detection; with a local Ollama model, zero data leaves the machine.

## When to use this skill

- Converting long YouTube videos, podcasts, webinars, or raw footage into vertical 9:16 clips for Shorts, Reels, or TikTok.
- Finding viral hooks and high-engagement moments in long audio/video files automatically.
- Reframing widescreen 16:9 footage into vertical 9:16 while tracking who is speaking using face detection (MediaPipe).
- Burning animated karaoke or bold pop captions directly into the output video without external tools.
- Operating the full pipeline locally with offline Whisper and Ollama for privacy or zero API costs.
- Managing clipping jobs via CLI (`autoclip clip`, `autoclip jobs`) or reviewing clips in the local web app (`autoclip serve`).

## When NOT to use this skill

- Conversational raw footage editing (cutting stumbles, color grading, overlay animations) → use [`video-use`](../video-use/SKILL.md).
- Generating short videos from scratch using prompts or stock footage without long-form source footage → use [`moneyprinter-turbo`](../moneyprinter-turbo/SKILL.md).
- Code-first programmable video compositions with Remotion → use [`video-production`](../video-production/SKILL.md).
- Offline video file compression, trimming, or format conversion without AI clipping → use [`compresso`](../compresso/SKILL.md).
- E-commerce / affiliate shopping shorts requiring platform compliance disclosure → use [`shopping-shorts`](../shopping-shorts/SKILL.md).

## Instructions

### Step 1: Preflight environment with doctor
Before running any clipping jobs, verify host prerequisites:
```bash
autoclip doctor
```
Check that:
- Python is 3.11 or 3.12 (Python 3.13 is unsupported by MediaPipe).
- FFmpeg includes `libass` for subtitle burning (`brew install ffmpeg-full` on macOS, not plain `ffmpeg`).
- Both `ffmpeg` and `ffprobe` are reachable on `PATH`.

### Step 2: Configure LLM highlight detection
AutoClip requires an LLM to rank transcript highlights. Choose either local or API:

**Option A: Local offline (Ollama)**
```bash
ollama pull llama3.1:8b
```

**Option B: API key (Stored in OS Keyring)**
```bash
autoclip config set-secret anthropic
# or: autoclip config set-secret openai
# or: autoclip config set-secret gemini
```

### Step 3: Run the clipping pipeline
Generate clips from a local video file or YouTube URL:
```bash
autoclip clip /path/to/long-podcast.mp4 --style bold_pop --aspect 9:16
```

Supported caption styles:
- `bold_pop`: Chunky white text, dark outline, spoken word grows and turns yellow.
- `karaoke_fill`: Words fill with accent color in sync with speech.
- `clean_lower`: Minimal lower-third subtitle without bounce animation.
- `boxed`: High-contrast text on solid background blocks.

All intermediate artifacts and exported clips are saved in `~/.autoclip/work/{job_id}/`.

### Step 4: Review and adjust clips
To inspect, preview, and trim clips visually:
```bash
autoclip serve
```
Open `http://localhost:8000` to review candidate clips, adjust caption text or timing, and download final MP4s.

## Examples

### Example 1: Extract 3 Shorts from an interview video
User prompt:
> Turn this 45-minute tech interview into 9:16 vertical clips with karaoke captions for YouTube Shorts.

Workflow:
1. Run `autoclip doctor` to ensure `ffmpeg-full` and Whisper runtime are healthy.
2. Ingest and clip:
   ```bash
   autoclip clip ./interview.mp4 --style karaoke_fill --aspect 9:16
   ```
3. Check generated jobs with `autoclip jobs` and verify exported MP4 files in `~/.autoclip/work/<job_id>/`.
4. Report clip titles, durations, and output paths to user.

## Best practices

- **Ensure full FFmpeg build:** Always check that FFmpeg has `libass`. If plain `ffmpeg` was installed on macOS via Homebrew, captions fail silently with `No such filter: ass`. Reinstall with `brew install ffmpeg-full`.
- **Match model to material:** A small 7B model finds obvious topic breaks, while a frontier model (Claude 3.5 Sonnet, GPT-4o) spots subtle narrative hooks and jokes with significantly higher accuracy.
- **Shot-independent cropping:** AutoClip detects scene cuts first and crops frames independently. Never force smooth camera pan interpolation across hard cuts.
- **Local storage cleanup:** Long video jobs produce audio WAVs, frame crops, and temporary segments under `~/.autoclip/work/`. Regularly clean up finished job folders after exporting.

## References

- CLI Reference and Commands: [`references/cli-reference.md`](references/cli-reference.md)
- Official repository: [artbyjazi/autoclip](https://github.com/artbyjazi/autoclip)
