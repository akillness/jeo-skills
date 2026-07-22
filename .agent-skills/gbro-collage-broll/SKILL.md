---
name: gbro-collage-broll
description: >
  Turn a 5-second voiceover script, opinion statement, or abstract concept into an editorial halftone paper-collage assemble-from-empty B-roll video. Use when the user requests "collage b-roll", "paper collage B-roll", "halftone collage", "collage video", "gbro-collage-broll", or asks to convert voiceover lines into animated editorial collage visual metaphors. Enforces a 3-gate approval workflow (metaphor confirmation -> still frame confirmation -> video generation via Gemini Omni Flash).
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Runs in Codex environment (Gate 2 depends on built-in image_gen). Requires Python >= 3.10, google-genai >= 2.10.0, GEMINI_API_KEY, and ffmpeg/ffprobe.
metadata:
  tags: video-generation, b-roll, paper-collage, halftone, gemini-omni-flash, editorial-animation
  version: "1.0"
---

# gbro Collage B-roll

把一句约 5 秒的口播压成一个 sharp visual idea，再做成高级编辑风纸拼贴组装动画。

## When to use this skill

Use this skill whenever:
- User asks for "collage b-roll", "paper collage B-roll", "halftone collage", "纸拼贴 b-roll", "半调拼贴", or "gbro-collage-broll".
- Converting voiceover lines or abstract concepts into editorial halftone paper-collage visual metaphors.
- Generating assemble-from-empty 9:16 vertical video clips via Gemini Omni Flash with strict 3-gate human approval.

When NOT to use this skill:
- User requires frame-by-frame exact layer manipulation, timeline editing, or transparent assets (use HyperFrames / HTML-based video renderers instead).
- User only wants video prompts without rendering final MP4 clips.
- User requests realistic human or product photoreal commercial footage.

## Instructions

### 1. Prerequisites & Environment Check

Before Gate 1, run the setup validator script:

```bash
bash .agent-skills/gbro-collage-broll/scripts/check_setup.sh
```

Ensure `GEMINI_API_KEY`, `ffmpeg`/`ffprobe`, Python >= 3.10, and `google-genai >= 2.10.0` (in `~/hyperframes-projects/.omni-venv`) are ready.

### 2. 3-Gate Approval Workflow

#### Gate 1: Visual Metaphor Approval
- Compress the ~5s script into one clear visual thesis (core meaning, emotion, action verb, 3–6 key objects, background/accent colors, assembly sequence).
- Output the metaphor proposal without generating images/videos, then STOP and await user approval.

#### Gate 2: Still Frame Approval
- After Gate 1 approval, write `visual-spec.json` and generate the 9:16 still frame via Codex `image_gen`.
- Generate contact sheet `still-contact-sheet.jpg` and write `gate2-qa.md`. STOP and await user approval before calling any video model.

#### Gate 3: Video Generation & QA
- After Gate 2 approval, prepare empty color first frame (`first-frame.png`) and target last frame (`last-frame.png`).
- Execute batch Gemini Omni Flash video generation using `scripts/generate_video.py` (defaulting to `gemini-omni-flash-preview`):

```bash
~/hyperframes-projects/.omni-venv/bin/python \
  .agent-skills/gbro-collage-broll/scripts/generate_video.py \
  --batch <project>/omni-jobs.json \
  --concurrency 3
```

- Convert output MP4 to silent format (`final-5s-noaudio.mp4`), run frame extraction contact sheets, and write `gate3-qa.md`.

## Examples

### Example 1: Single Line B-roll Request
Input:
> `collage b-roll: 很多人以为 AI 是来替你思考的，其实它更像一面镜子，会把你问题里的漏洞照出来。`

Workflow:
1. Gate 1 proposal:
   - 核心意思: AI 是照出漏洞的镜子而非替代思考
   - 隐喻: 放大镜与撕纸镜面透出光芒照亮排版漏字
   - 色彩: 芥末黄底，黑白半调，深红点色
2. Gate 2 generation & contact sheet review.
3. Gate 3 Omni Flash video generation & silent MP4 delivery.

## Best practices

1. **Strict 3-Gate Discipline**: Never skip Gate 1 or Gate 2. Stopping for human approval saves API cost and aligns aesthetic direction before running video models.
2. **Color Palette Diversity**: Do not default all clips to cobalt blue. Use orange, mustard yellow, dark purple, teal, or forest green based on semantics.
3. **Assemble-from-Empty Timing**: Ensure Image 1 is an empty color field and Image 2 is the exact completed frame so Omni Flash performs crisp stop-motion assemble animation.
4. **No Text/UI Clutter**: Keep still frames clean from readable letters, logos, watermarks, or UI artifacts.

## References

- Project repo: [https://github.com/pyang5166/gbro-collage-broll](https://github.com/pyang5166/gbro-collage-broll)
- Default Video Model: `gemini-omni-flash-preview`
