---
name: scenario-minimax-video
description: "Use when generating or editing video with MiniMax Hailuo models on Scenario via MCP: text-to-video, image-to-video, first and last frame anchors, reference images, videos, or audio, native stereo audio, bracketed camera commands, extending a clip, inserting a new scene into one, or recasting the people in it from photos. Keywords: MiniMax, Hailuo 3.0, H3, H3 Max, Turbo, Extend Video, Insert Video, Recast, Hailuo 2.3, T2V, I2V, V2V, 2K."
license: MIT
---

# Scenario MiniMax Video

## Overview

MiniMax's Hailuo video family on Scenario has three kinds of member. H3 (Hailuo 3.0) folds text,
keyframe, and reference conditioning into one model and generates stereo audio in the same pass. The
H3 Max line splits that into single-mode members (text, image, reference, lip sync), each with a
faster Turbo twin on the first two. Three Max members edit a clip you already have instead of
generating one: Extend Video (with a Turbo twin), Insert Video, and Recast. The older Hailuo 2.3
pair carried a `deprecated` tag naming H3 as successor at authoring time. Discover members with
`search` and treat `model_schema_get` as the contract: they agree on almost nothing, not even the
spelling of a resolution.

Connection and the core loop: see the `scenario` skill in this repo; model-agnostic video work: the
`scenario-video` skill. If a sibling skill named here is missing from your available skills, load it
with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

## Quick reference

H3's mode follows from the inputs (names from the live schema):

| Mode         | Inputs                                                 | Behavior                                                                                 |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Text         | `prompt`                                               | `aspectRatio` honored (21:9 through 9:16, default `adaptive`)                            |
| First frame  | `firstFrameImage` (+ `prompt`)                         | shape follows the image; `aspectRatio` ignored                                           |
| First + last | `firstFrameImage` + `lastFrameImage`                   | `lastFrameImage` is valid only alongside `firstFrameImage`                               |
| Reference    | `referenceImages`, `referenceVideos`, `referenceAudio` | guides subject, style, motion, and voice, not forced frames; `aspectRatio` still applies |

Keyframes and references are mutually exclusive: neither frame combines with any reference array.
`referenceAudio` never rides alone; it requires at least one image or video reference. Reference
parameters are arrays even for one asset. At authoring time H3 took 9 reference images, 3 videos,
and 3 audio files (videos and audio each 2 to 15 seconds, and 2 to 15 seconds in total), 5 to 15
seconds of output, at `768P` or `2K`.

The 2.3 members take only `prompt` and `firstFrameImage`, plus a coupled pair: at authoring time 10
second `duration` was available only at `768p`, and `1080p` only at 6 seconds. Their
`promptOptimizer` (default true) rewrites the prompt before generation: leave it on for thin
prompts, switch it off when engineered wording must survive verbatim. H3 has no such switch, and
neither H3 nor 2.3 takes a `seed`.

## Picking the member

H3 is the one member that mixes modes in a single call, and, lip sync aside, the one generator that
reaches `2K`; it is also slow and expensive, and reference media adds more (reference videos bill
per second of uploaded footage). The Max text and image members cap at `768P` and take a `seed` and
a `promptExpansionMode` (`disabled`, `balanced`, `quality`); set it to `disabled` when engineered
wording must survive verbatim. Their Turbo twins share the same inputs and are the iteration tier:
draft at `480P` on Turbo, then spend the expensive member on the take you keep. A draft is a
composition and motion check, not a preview of the final pixels: a different member or resolution is
a new generation even with the same `seed`. `dry_run` the draft and the final payloads before a
batch. Re-discover a member before naming 2.3 for new work: deprecated members can disappear from
the catalog.

## Editing a clip you already have

These members take the existing video as `video` (any video asset id, generated or uploaded) and
bill only what they make or touch, so price each with `dry_run` on the real source.

| Member          | What it does                                     | Key inputs and caps at authoring time                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extend (+Turbo) | adds 1 to 15 s after the source                  | source 1.625 to 60 s, up to 50 MB, aspect 0.4 to 2.5; `output` `extended` returns source plus new footage, `continuation` the new footage behind a lead-in copied from the source (see Common mistakes); `referenceAudio` replaces the source soundtrack as the audio guide; `aspectRatio` other than `auto` crops; `480P` to `2K` |
| Insert Video    | a new 5 to 13 s scene, then the original resumes | `startTime` and `resumeTime` in source seconds (both required); `duration` is the new scene only; up to 9 `referenceImages` and 3 `referenceVideos`, billed by reference tokens; `colorMatch` on by default; `480p` or `768p`, lowercase                                                                                           |
| Recast          | swaps up to 4 people for new ones from photos    | source 5 to 30 s, no single shot over 15 s, billed per source second; `referenceImages` one photo per person, required, mapped left to right by default; `prompt` optional, to say who becomes whom; motion, camera, cuts, and audio are kept; `768P` or `1080P`                                                                   |

Write an Extend prompt about what happens next, never a description of the source: the model already
sees it, and `enablePromptExpansion` (on by default) rewrites the prompt from the source to keep the
continuation consistent. Recast is the lane for re-shooting the same performance with a different
person; it keeps everything else, so it is the wrong tool for a new setting or style.

## Camera in brackets, motion in moderation

The whole family reads bracketed camera commands inline in the prompt: `[Push in]`, `[Pull out]`,
`[Pan left]`, `[Tilt up]`, `[Truck right]`, `[Pedestal up]`, `[Zoom out]`, `[Shake]`,
`[Tracking shot]`, `[Static shot]`. Up to three moves combine in one bracket
(`[Pan left, Pedestal up]`); separate brackets sequence them. Keep 2 or 3 motion cues per shot in
total: piling on moves invites background wobble and texture flicker. Image-to-video tends to drift
even unprompted, so lock statics explicitly ("Static camera, locked shot, tripod mounted").

Write the rest as natural prose, ordered camera, subject, action, scene, lighting and mood, style.
On H3, sound lives in the prompt too: describe dialogue lines, SFX, and ambience inline so they sync
to the action; no audio parameter exists to switch instead.

## Worked example: a character clip from reference stills

1. `search` with `target="models"`, `query="minimax hailuo"`, `public=true`. Prefer the newest
   non-deprecated hit, e.g. `model_minimax-h3` (a live hit at authoring time: re-discover each
   session).
2. `model_schema_get` with that id: modes, caps, and allowed values before anything else.
3. `upload_asset` two clean, evenly lit character stills (see the `scenario` skill) to get asset
   ids.
4. `model_run` with that `model_id`, `dry_run=true`, and the exact
   `parameters={"prompt": "[Tracking shot] The scout from the reference images sprints across a rooftop at dusk, coat snapping in the wind, warm rim light, footsteps and distant traffic in the audio, cinematic realism.", "referenceImages": ["asset_a", "asset_b"], "duration": 8, "resolution": "2K", "aspectRatio": "16:9"}`
   for the cost estimate; re-estimate after changing duration, resolution, or the reference count.
5. Repeat `model_run` with `wait=false`, then `jobs_wait` with the returned job id, re-called with
   `pending_job_ids` on timeout, never a second `model_run`; H3 at 2K commonly runs several minutes.
6. `asset_display` the output and review it with sound on: dialogue and SFX sync are part of what
   you paid for.

## Common mistakes

- Combining `firstFrameImage` with a reference array: keyframes and references never mix.
- Passing `referenceAudio` alone: it requires at least one image or video reference.
- Sending `lastFrameImage` without `firstFrameImage`: the pair anchors both endpoints or neither.
- Expecting `aspectRatio` to win over a first frame: the shape follows the image.
- Carrying one member's values to another: H3 spells resolutions `768P` and `2K`, the Max generators
  other than lip sync stop at `768P`, Insert spells `480p` and `768p` in lowercase, and Recast
  offers only `768P` and `1080P`.
- Sending Recast a clip with a single shot over 15 seconds, or one under 5: cut it first (the
  `scenario-video-editing` skill).
- Pricing Recast on the output: it bills every second of the source, so trim the source to the part
  that needs the new people.
- Expecting either Extend output to be new footage only: `extended` returns the source plus the
  continuation, and `continuation` opens on a copy of the source's last 1.625 s (39 frames at 24 fps
  in two authoring-time runs), then new footage that ran a little past the request (2 s gave 2.1 s,
  3 s gave 3.5 s, each billed as requested). For pieces assembled later (the
  `scenario-video-assembly` skill), take `continuation` and cut from `startTime` 1.7: the cut tool
  steps by 0.1 s and 1.6 keeps a source frame (the `scenario-video-editing` skill).
- Stacking camera moves: past 2 or 3 cues the background wobbles and textures flicker.
