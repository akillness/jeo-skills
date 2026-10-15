---
name: moneyprinter-turbo
description: >
  Operate harry0703/MoneyPrinterTurbo, the open-source one-click AI short video generation
  engine. Provide a video topic or keyword to automatically generate video scripts, match
  footage (local media, Pexels, Pixabay, or text-to-video via MiniMax H3, Seedance, Wan, MuAPI),
  synthesize speech (free Edge TTS, Azure, ElevenLabs, Gemini), generate and style subtitles,
  add background music, and render high-definition short videos (9:16, 16:9, 1:1) with optional
  multi-platform upload to TikTok, Instagram, and YouTube Shorts. Run via uv/CLI, WebUI, Docker,
  or agent automation. Use when the user asks to generate short videos from a topic, prompt, or
  keyword, batch-create AI video shorts, or automate faceless video channels. Triggers on:
  moneyprinter-turbo, MoneyPrinterTurbo, moneyprinter, topic to video, text to short video, ai
  short video generator, 一键短视频, edge-tts video, pexels video generator, batch shorts generation.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Universal on macOS, Linux, and Windows. Requires Python 3.11+ and FFmpeg on PATH. Recommended to
  run via `uv run` with the bundled `scripts/mpt_agent.py` helper. Free Edge TTS requires no API
  key. Stock footage search needs Pexels or Pixabay API keys. Optional AI video synthesis connects
  to MiniMax H3, Volcano Engine Seedance, Wan2GP, or MuAPI. MIT licensed.
metadata:
  category: creative-media
  subcategory: video
  interface: workflow
  tags: moneyprinter-turbo, ai-video, short-video, text-to-video, faceless-video, edge-tts, pexels, subtitles, automated-shorts, tiktok, reels, youtube-shorts
  platforms: Claude Code, Codex, OpenCode, Terminal
  version: "1.3"
  source: https://github.com/harry0703/MoneyPrinterTurbo
---

# MoneyPrinterTurbo — One-Click AI Short Video Generation

`moneyprinter-turbo` is an automated, one-click AI short video production pipeline.
Given a topic, keyword, or user-supplied script, it orchestrates the entire production flow:
generating a multi-paragraph script, sourcing matching stock or AI video clips, synthesizing
natural voice-over narration, generating styled subtitles, mixing background music, and rendering
an exported MP4 in vertical (9:16), landscape (16:9), or square (1:1) format.

It provides four execution surfaces: an automated Agent runner (`scripts/mpt_agent.py`),
a Python CLI, a local Streamlit WebUI (port 8501), and a FastAPI backend (port 8080).

## When to use this skill

- Generating finished short videos directly from a topic, keyword, or concept without existing footage.
- Automating faceless video creation for YouTube Shorts, Instagram Reels, or TikTok at scale.
- Generating voice-over narration using free, high-quality Edge TTS without an API key or account.
- Combining automated LLM scriptwriting with stock footage retrieval (Pexels, Pixabay) and BGM.
- Driving AI video generation models (MiniMax H3, Volcano Seedance, Wan, MuAPI) into coherent short videos.
- Running automated generation jobs from AI coding agents using the bundled `mpt_agent.py` helper.

## When NOT to use this skill

- Editing multi-take raw footage conversationally with coding agents → use [`video-use`](../video-use/SKILL.md).
- Extracting and reframing clips from existing long-form video or podcasts → use [`autoclip`](../autoclip/SKILL.md).
- Code-first programmable video compositions with React and Remotion → use [`video-production`](../video-production/SKILL.md).
- Affiliate marketing / e-commerce shopping shorts requiring strict platform compliance and disclosure → use [`shopping-shorts`](../shopping-shorts/SKILL.md).
- Cinematic desktop product promo videos with 2.5D camera recipe cards → use [`video-shotcraft`](../video-shotcraft/SKILL.md).

## Instructions

### Step 1: Preflight and helper invocation
MoneyPrinterTurbo can be run directly via the bundled helper script `scripts/mpt_agent.py`.
Verify that Python 3.11+ and FFmpeg are available, then execute via `uv`:

```bash
uv run --no-project --python 3.11 python scripts/mpt_agent.py --subject "<video topic>"
```

The helper checks for an existing MoneyPrinterTurbo installation or installs it under `~/MoneyPrinterTurbo`,
verifies dependencies, runs generation, and delivers the final MP4 path.

### Step 2: Handle configuration and API keys
MoneyPrinterTurbo requires an LLM for scriptwriting and keyword extraction:
- Free/BYOK providers: OpenAI, Claude, Gemini, DeepSeek, Kimi/Moonshot, Qwen, Ollama.
- Voice-over (TTS): Defaults to free Edge TTS (no API key needed); Azure, ElevenLabs, Gemini also supported.
- Video materials: Pexels API key (free), Pixabay (free), local folder media, or AI video generation keys.

When running `mpt_agent.py`, if credentials are missing, it emits an input request (`MPT_NEEDS_INPUT`).
Provide keys via environment variables or configure `config.toml`:
```bash
export MPT_LLM_PROVIDER="openai"
export MPT_LLM_API_KEY="sk-..."
export MPT_PEXELS_API_KEY="..."
```

### Step 3: Aspect ratio and language customization
Specify video orientation and language:
```bash
# Portrait 9:16 (Shorts/Reels/TikTok)
uv run --no-project --python 3.11 python scripts/mpt_agent.py \
  --subject "History of Coffee" \
  --aspect "9:16" \
  --language "en"

# Landscape 16:9 (Standard YouTube)
uv run --no-project --python 3.11 python scripts/mpt_agent.py \
  --subject "인공지능의 미래" \
  --aspect "16:9" \
  --language "ko"
```

### Step 4: Inspect result
On successful completion, the runner outputs:
```text
MPT_RESULT
VIDEO_FILE=/path/to/MoneyPrinterTurbo/storage/tasks/<task_id>/final-1.mp4
```
Verify the output MP4 exists and report the generated path and duration to the user.

## Examples

### Example 1: Create a 30-second science explainer short
User prompt:
> Make an automated 9:16 short video about why the ocean is blue using stock footage and voiceover.

Workflow:
1. Run the agent runner with subject "Why the ocean is blue":
   ```bash
   uv run --no-project --python 3.11 python scripts/mpt_agent.py \
     --subject "Why the ocean is blue" \
     --aspect "9:16"
   ```
2. The pipeline writes the narration script, fetches Pexels ocean clips, generates Edge TTS audio, adds subtitles and ambient BGM.
3. Deliver the rendered MP4 path to the user.

## Best practices

- **Leverage Edge TTS for zero-cost audio:** Edge TTS offers high-quality natural voices in dozens of languages without subscription or API rate limits.
- **Set specific topics:** Narrow, concrete topics ("Why leaves change color in autumn") yield much more accurate stock clip matching than broad queries ("Nature").
- **Review Seedance / AI video charges:** When connecting paid AI video generation backends (Seedance, MiniMax H3), confirm billing limits with the user before triggering batch renders.
- **Verify subtitle readability:** Preview output videos to ensure text contrast and safe zones (avoiding bottom navigation UI on TikTok/Shorts) are respected.

## References

- Supported Provider Matrix: [`references/provider-matrix.md`](references/provider-matrix.md)
- Official repository: [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)
- Agent runner script: [`scripts/mpt_agent.py`](scripts/mpt_agent.py)
