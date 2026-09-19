# Cover animator (~5s reveal → `og_video_url`)

Turn a finished launch cover (the one made per `references/app-cover.md`) into
a short reveal animation for the feed card's `og_video_url`: the hero scene
moves, the typography and plates fly in, and the last frame lands exactly on
the approved cover.

> **PERMISSION-GATED.** The cover video costs credits. OFFER it when publishing
> ("want a short cover video for the feed card?") and only generate it after
> the user says yes — never unprompted. Everything else in the publish gate
> (cover image, OG, favicon) ships without asking; the video is the one
> exception (see `references/app-flow.md` publish gate item 6).

## The trick: end-frame reveal

`seedance_2_0` accepts an end frame (`--end-image`). Pass the finished cover as
the END frame and describe the buildup — this guarantees the video finishes
pixel-perfect on the approved cover while the model invents the entrance. Do NOT
pass it as `--start-image` (that drifts away from the cover instead of revealing
it).

## Workflow

### 1. Read the cover's content

Use the **plain full-bleed cover** (`marketplace_cover_url` / `<name>_cover.png`),
NOT the OG version — the OG's frame and capsule confuse the motion model. (If
only an OG exists it still works; then instruct the model to keep the frame and
dots perfectly static.) Look at the image and note the hero subject, background,
title text, tagline, pill CTA, and logos — you'll reference these concretely in
the prompt.

### 2. Design the beats (~5s), all derived from the cover's actual content

1. **0–1.5s — scene alive, no text yet.** The hero scene exists and moves
   contextually: fur ripples, stars orbit, clouds drift, train lights flicker,
   camera pushes in slowly. Name the motion that fits THIS cover's subject.
2. **1.5–3.5s — text entrance.** The title pops/slides/bounces in (match the
   motion to the typography: pixel type snaps in block by block, chrome bubble
   letters inflate, condensed uppercase slams down), the tagline fades up, the
   pill CTA slides in with a soft bounce.
3. **3.5–5s — settle.** Micro-motion only; everything eases into the exact
   final composition (the end frame).

### 3. Generate

`--end-image` accepts a local file path (the CLI auto-uploads it) or the UUID of
a prior `higgsfield upload create`, so you can pass the cover file straight in.
Call `higgsfield generate create` once:

```bash
higgsfield generate create seedance_2_0 \
  --aspect_ratio auto --duration 5 --resolution 1080p --mode std \
  --generate_audio false --count 1 \
  --end-image <cover_file_or_upload_id> \
  --prompt "<see template>" --wait
```

`--generate_audio false` by default (feed cards autoplay muted); set `true` only
if the user asks for sound. Duration 5 unless the user wants another length
(4–15 supported). If a param is rejected, run `higgsfield model get seedance_2_0`
and use what it reports.

Prompt template — fill from your beat design, keep the ending anchor sentence:

> Premium 5-second motion cover reveal, smooth cinematic easing. The scene
> starts WITHOUT any text or plates: [SCENE AT START + CONTEXT MOTION — e.g.
> "the fluffy lime creature slowly rotates, its fur rippling in the light,
> stars drifting"]. Then the title "[TITLE TEXT]" [ENTRANCE MOTION matched to
> its typography], the tagline fades up beneath it, and the small rounded pill
> button slides in with a soft bounce. All elements ease precisely into their
> final positions and the video ends exactly on the provided end frame, holding
> still for the last moments. Subtle camera push-in, no flicker, no extra text,
> no new objects.

If animating an OG cover, append: "The solid color frame, corner dots and
capsule shape stay perfectly static at all times."

### 4. Wire into the app

With `--wait` the command blocks and prints the result; otherwise poll
`higgsfield generate wait <id>` / `higgsfield generate get <id>`. Take the mp4
and set it as `og_video_url` in `app/src/app-meta.json` — either the hosted
https URL directly, or download it into `app/public/` (e.g.
`app/public/cover-video.mp4`) and set `"og_video_url": "/cover-video.mp4"`.
Commit + deploy; the feed card picks it up on the next deploy. Review the
result: if the ending visibly drifts from the cover or extra text appears
mid-video, regenerate once naming the flaw (e.g., "the title must not change
after it lands").

For a standalone "animate this cover" request (not a publish), just save the
mp4 as `<name>_cover_anim.mp4` and show it.

## Deviations

The user's wishes win: other durations, with sound, animating the OG version,
looping intent (then ask for subtle motion and no big entrance), vertical
covers, `seedance_2_0_mini` for cheap drafts.
