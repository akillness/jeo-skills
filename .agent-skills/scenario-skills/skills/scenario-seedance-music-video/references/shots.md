# Shots: conditioning, prompting, judging

The full Seedance parameter contract lives in the `scenario-seedance` skill; the live
`model_schema_get` always wins.

## Conditioning decides more than the prompt

In reference mode, frame one anchors to the base state of the reference world. On one build, four
separate paid attempts failed to open a shot on a required state through prompt wording: a plain
description, an explicit opening-state lock, reordering `referenceImages`, and reframing the motion
as a decay. Switching to first-frame mode fixed it on the first try.

So, per shot, before generating: the shot must open in a specific state, pass that state as `image`
(render it as a still first); the shot only has to carry identity, world, and palette, pass
`referenceImages`.

The side effect of reference mode is that independently generated shots each restart their own
evolution. Whatever was building across the sequence resets at every cut, and it reads as a
continuity error at exactly the loudest musical moments. When a state must carry across a cut,
render the outgoing frame's state as the next shot's first-frame `image`.

## Prompt shape that held up

Order matters less than presence. Every shot that worked had all five:

1. What each reference is for, by tag:
   `@image1 defines the world and the slab. @audio1 is timing only.` The tags address the reference
   arrays only. A first-frame `image` has nothing to tag, so name what the opening frame already
   shows and prompt the motion away from it.
2. The section's function and visual goal in one line: `the pulse enters. Visual goal: arrival.`
3. One dominant camera move and one dominant action. Two of either produces a mess.
4. The closing state, explicitly.
5. An exclusion list for the picture, and the sound named by its sources:
   `No people, no text, no captions, no logos, no watermarks. Diegetic sound only: wind, footsteps, room tone.`
   Never exclude sound in words: "no music" is what the audio filter reads. (`Silent footage.`
   instead when the shots run with `generateAudio: false`.)

Keep one shot to one idea. A prompt describing a sequence makes the model cut inside the clip.

## Judging results

Do not judge a clip from a sparse contact sheet: tiling every 40th frame makes a continuous camera
move look like a hard cut. Measure first: downscale to about 160x90, take the mean absolute
difference between consecutive frames, and only call it a cut when the value spikes far above the
clip's own baseline. The same trick turns any color-carried state into a number when shots have to
match.

The auto-caption on a returned asset describes what the model thinks it made and is often wrong. It
is not a substitute for watching the clip.

## Cost and transfer

- `model_run` with `dry_run: true` returns the estimate and creates no job; dry-run before a batch.
  Duration, resolution, and reference videos carry cost (the schema flags `cost_impact`); reference
  images and audio do not.
- Reference audio above about 100KB goes up with the multipart `upload_asset` flow: PUT each part
  with no added checksum headers, then `upload_asset_complete`.
- `asset_download` returns a download URL for any asset kind; its `format` parameter converts image
  formats only, so omit it for video and audio. Fetch with `curl -L`: the URL may redirect.
- `asset_get` carries a `url` too, plus measured `properties` (`duration`, `frameRate`, `nbFrames`,
  `width`, `height`, `codecName`). That is the cheap way to check a clip's real length before laying
  it into a timeline: a model asked for eight seconds does not always return exactly eight.
