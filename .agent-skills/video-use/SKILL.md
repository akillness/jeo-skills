---
name: video-use
description: >
  Drive browser-use/video-use, the open-source conversational video editor for Claude Code,
  Codex, and coding agents. Drop raw footage into a directory and edit by natural language chat:
  transcribe and build packed phrase-level transcripts (takes_packed.md), cut filler words and
  dead space, auto color grade segments, apply 30ms audio fades at cuts, burn custom styled
  subtitles last in the filter chain, spawn animation overlays (HyperFrames, Remotion, Manim,
  PIL) via parallel sub-agents, self-evaluate cut boundaries with timeline_view before
  presentation, and persist session memory in project.md. Use when the user asks to edit raw
  video footage with Claude Code, cut filler words, color grade, burn subtitles, generate video
  overlays, or run conversational video editing. Triggers on: video-use, video use, edit video with
  Claude, conversational video editor, cut filler words, auto color grade, timeline_view,
  takes_packed.md, edit/final.mp4.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Universal for agents with shell and filesystem access (Claude Code, Codex, OpenCode).
  Requires Python (uv or pip), FFmpeg + ffprobe on PATH, and an ElevenLabs API key for
  Scribe verbatim word-level transcription. Node.js 22+ required if HyperFrames animation
  overlays are used. MIT licensed.
metadata:
  category: creative-media
  subcategory: video
  interface: workflow
  tags: video-use, video-editing, conversational-video, claude-code, ffmpeg, elevenlabs, transcript, subtitles, color-grading, overlays, remotion, hyperframes
  platforms: Claude Code, Codex, OpenCode, Terminal
  version: "1.0"
  source: https://github.com/browser-use/video-use
---

# Video Use — Conversational Video Editing with Coding Agents

`video-use` enables natural language conversational video editing through coding agents.
Instead of dumping thousands of raw video frames into the model context, it reads a compact
word-level transcript (`takes_packed.md`, ~12KB) derived from ElevenLabs Scribe, and drills into
visuals on demand via `timeline_view` (filmstrip + waveform + word labels PNG) only at decision points.

All user footage remains untouched. All outputs are written to `<videos_dir>/edit/`.

## When to use this skill

- Editing raw multi-take footage through natural conversation with Claude Code or Codex.
- Cutting out filler words (`umm`, `uh`, false starts) and dead space between takes.
- Auto color grading footage segments (warm cinematic, neutral punch, or custom FFmpeg chains).
- Applying clean audio cuts with 30ms audio fades at segment boundaries to prevent pops.
- Generating and burning custom styled subtitles (2-word uppercase chunks, karaoke, or lower thirds).
- Adding animated overlays generated via HyperFrames, Remotion, Manim, or PIL in parallel sub-agents.
- Persisting multi-session editing context and decisions in `<videos_dir>/edit/project.md`.

## When NOT to use this skill

- Converting long-form recordings (podcasts, webinars) into vertical 9:16 highlight clips with speaker tracking → use [`autoclip`](../autoclip/SKILL.md).
- Generating short-form videos from scratch using a topic or keyword with stock media and TTS → use [`moneyprinter-turbo`](../moneyprinter-turbo/SKILL.md).
- Building code-first React video compositions with Remotion from scratch → use [`video-production`](../video-production/SKILL.md).
- Creating product launch promo videos using 2.5D page camera recipe cards → use [`video-shotcraft`](../video-shotcraft/SKILL.md).
- Driving a native Rust nonlinear video editor GUI or MCP server → use [`filmcraft`](../filmcraft/SKILL.md) or [`palmier-pro`](../palmier-pro/SKILL.md).

## Instructions

### Step 1: Verify environment and prerequisites
1. Check that `ffmpeg` and `ffprobe` are installed and available on `PATH`.
2. Ensure `ELEVENLABS_API_KEY` is set in the environment or in `.env` at the `video-use` repository root.
3. Install dependencies via `uv sync` or `pip install -e .` inside the `video-use` workspace.
4. Verify user footage exists in a target folder:
   ```bash
   ls -la /path/to/raw/videos
   ```

### Step 2: Ingest and transcribe footage
1. Run parallel batch transcription on the directory:
   ```bash
   python helpers/transcribe_batch.py /path/to/raw/videos
   ```
2. Pack raw transcript JSONs into phrase-level markdown:
   ```bash
   python helpers/pack_transcripts.py --edit-dir /path/to/raw/videos/edit
   ```
3. Read `takes_packed.md` (~12KB) to inspect verbal takes, speaker turns, and silence gaps.

### Step 3: Converse and propose strategy
1. Discuss the material with the user: target duration, target aspect ratio (16:9 vs 9:16), pacing feel, must-keep moments, and visual aesthetic.
2. Formulate a 4–8 sentence editing strategy covering take choices, cut plan, subtitle style, and overlay slots.
3. **Wait for user confirmation** before generating cut lists or rendering.

### Step 4: Execute edit and hard correctness rules
Produce `edl.json` and render clips adhering strictly to production correctness rules:
- **Rule 1 (Subtitles Last):** Subtitles are burned LAST in the filter chain after all overlays.
- **Rule 2 (Lossless Concat):** Per-segment extract with grading → lossless `-c copy` concat.
- **Rule 3 (Audio Fades):** Add 30ms audio fades at every segment boundary (`afade=t=in:st=0:d=0.03,afade=t=out:st={dur-0.03}:d=0.03`).
- **Rule 4 (Overlay PTS):** Shift overlay start via `setpts=PTS-STARTPTS+T/TB`.
- **Rule 5 (Master SRT):** Align subtitle timestamps to output timeline offsets (`output_time = word.start - segment_start + segment_offset`).
- **Rule 6 (Word-boundary Snap):** Snap every cut point to a word boundary; never cut inside a spoken word.
- **Rule 7 (Cut Padding):** Apply 30–200ms padding around cut edges to absorb ASR drift.

Render draft preview:
```bash
python helpers/render.py /path/to/raw/videos/edit/edl.json -o /path/to/raw/videos/edit/preview.mp4 --preview --build-subtitles
```

### Step 5: Self-evaluate rendered output
Before presenting the final video:
1. Run `timeline_view.py` on the **rendered output** at cut boundaries (±1.5s window).
2. Inspect for visual jump cuts, waveform spikes (audio pops), or subtitle masking.
3. Verify integrated audio loudness via FFmpeg `ebur128`.
4. Fix any defect and re-render (capped at 3 self-eval iterations).

## Examples

### Example 1: Full-take talking head cleanup
User prompt:
> Here is my 3-take YouTube tutorial footage. Cut out all stumbles and pauses, make it concise, add clean yellow subtitles, and export final.mp4.

Workflow:
1. Run `transcribe_batch.py` on the footage folder.
2. Read `takes_packed.md`, select the best take for each section, and list cut boundaries at silences ≥ 0.4s.
3. Present the 5-bullet editing plan to user.
4. On approval, generate `edl.json` with 30ms audio fades and word-snapped cuts.
5. Render `edit/final.mp4` with styled subtitles and confirm audio/visual continuity.

## Best practices

- **Never frame-dump:** Never feed thousands of video frames into LLM context. Rely on `takes_packed.md` and call `timeline_view.py` only at ambiguous pauses or retake forks.
- **Keep source footage immutable:** Never overwrite original camera files. All edits, EDL files, and intermediate clips belong in `<videos_dir>/edit/`.
- **Preserve emotional punchlines:** Do not trim reactions or laughs immediately after a speaker finishes a sentence. The reaction is part of the beat.
- **Persistent project memory:** Append session summaries, approved cut decisions, and user preferences to `project.md` so follow-up sessions maintain continuity.

## References

- Hard production rules: [`references/hard-rules.md`](references/hard-rules.md)
- Official repository: [browser-use/video-use](https://github.com/browser-use/video-use)
