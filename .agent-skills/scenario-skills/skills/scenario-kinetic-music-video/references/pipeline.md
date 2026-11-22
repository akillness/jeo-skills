# Pipeline: commands and Scenario calls

## Contents

1. [Scaffold](#1-scaffold)
2. [Audio and lyrics](#2-audio-and-lyrics)
3. [Scenario: subject, style frames, assets](#3-scenario-subject-style-frames-assets)
4. [Scenario: footage routes](#4-scenario-footage-routes)
5. [Footage prep: frames, mattes, tracking, checks](#5-footage-prep-frames-mattes-tracking-checks)
6. [Engine and agents](#6-engine-and-agents)
7. [Assembly, grade and verification](#7-assembly-grade-and-verification)
8. [Delivery](#8-delivery)
9. [Two ratios from one project](#9-two-ratios-from-one-project)

## 1. Scaffold

```bash
bash <skill >/scripts/scaffold.sh /path/to/song.mp3 # run inside the new project folder
```

This creates `audio/master.*`, the `engine/` template, `tools/` (with the matte binary on macOS),
fonts, npm deps (three, playwright) and a Python 3.11 `.venv`. On a machine that already has a
project, you can symlink `.venv` and `node_modules` from it to save time.

## 2. Audio and lyrics

```bash
.venv/bin/python tools/audio_analysis.py audio/master.mp3                              # stems + engine/data/audio.json (prints BPM and downbeats)
.venv/bin/python tools/lyrics_align.py transcribe                                      # plain pass, also kept as analysis/lyrics_raw_plain.json
.venv/bin/python tools/lyrics_align.py transcribe --prompt "<names, jargon, acronyms>" # hinted pass (lyrics_raw_hints.json); align reads the latest
# → hand-write analysis/lyrics.txt (sections + corrected lines; the user's lyrics win if supplied)
.venv/bin/python tools/lyrics_align.py align analysis/lyrics.txt --no-fix <ACRONYMS >[--chant <section >: <WORD >]
# → stderr lists the words with no transcript match and the onsets they got: check those first in the plots
.venv/bin/python tools/plot_lyrics.py 1:12 20:30 ... # Read the PNGs; fix outliers by hand in lyrics.json
```

- **Verify the tempo.** Beat trackers and song-generation prompts can be off by a factor (a "130
  BPM" track measured 98 with double-time drums). Check the median beat dt against the kick
  envelope, and write the measured grid into TREATMENT.md.
- Treat lines you couldn't make out as guesses, and list them for the user at the end.
- **A repeated shout** (`--chant <section>:<WORD>`): write that section's words into `lyrics.txt` as
  sung. The aligner places one WORD per vocal peak between the lines around the section, at most as
  many as you wrote; an empty section takes every peak up to the next line, or to the song's end.

## 3. Scenario: subject, style frames, assets

- **Workspace.** Get the team and project with `teams_list`. If there is more than one, ask the
  user. Pass `team_id` and `project_id` on every call. Log every asset and job id in
  `analysis/jobs.md` as you go, because revisions need them.
- **Upload references.** Use the multipart flow:
  `upload_asset(file_name, content_type, kind, file_size)` returns a presigned URL.
  `curl -fsS -X PUT -T file '<url>'` (no checksum headers), then `upload_asset_complete(upload_id)`.
  Inline base64 is only for files under 100 KB.
- **Subject sheet first.** A subject can be a character, mascot, creature, band avatar or product.
  - Turn the user's reference images into a model sheet (turnaround, expressions, detail callouts)
    before any footage. Pick an image model that takes reference images (`recommend` with
    `capability: "img2img"`, then `model_schema_get`): pass the references through the model's
    reference-image field and ask for a wide, high-quality output, two takes when the budget allows
    and one per subject otherwise; a cameo subject gets its own sheet (field names and size caps
    from `model_schema_get`).
  - The prompt covers identity details, the outfit or materials, the rendering style with explicit
    NOTs (not Pixar, not chibi), the layout, and lighting that matches the video's sets.
  - Look at it. Crop identity references from it (face, full-body 3/4) with ffmpeg and upload them.
  - For a real person, use only their own photos with their consent. Never generate other real
    people.
- **Style frames: one per shot.** Before any video, generate a still at the canvas ratio (`CANVAS`:
  16:9, or 9:16 on a portrait project) for every planned shot in its section's look. Same model,
  with the sheet and an identity crop as references, the same ratio, high quality (fields from
  `model_schema_get`). Every prompt needs:
  - the look's art style, named explicitly ("drawn only with glowing gold light lines on pure
    black", "flat tangerine cyc", "B&W 35mm film")
  - composition that leaves **negative space for the type** ("framed on the right third, left two
    thirds empty"; on portrait, "face at about 40% of the frame height, empty space above it for
    type, nothing that must read in the bottom third"). On portrait, keep the face and the type
    space inside the safe band: platform UI covers roughly the top 14%, the bottom 35%, 6% on the
    left and 13% on the right (authoring-time values, the defaults of `E.SAFE`). The subject's body
    may run below it.
  - a set the compositor can use (black void with a hard rim light, a flat color cyc, or a white
    high-key set)
  - "No text, no letters, no logos" (all real type is done in code)
  - Contact-sheet all the frames and show the user before spending on video. A style frame is the
    cheapest paid step; price the video steps with `dry_run`, one run per distinct payload (clip
    length and resolution move the price), and total them. To quote the whole video before any
    spend, price the video payloads with an uploaded reference photo standing in for each frame: in
    the live test those quotes matched every video job's billed `cuCost`. Ask the user to approve
    the look and the total before launching; unattended, stop if no budget or no explicit team and
    project was given.
- **Props and 3D.** Image-to-3D (an untextured, low-face-count mesh is enough; read the options from
  the schema) gives a GLB for three.js (wireframe → solid reveals, a creature that peels off a
  page).
- Download with `asset_download` → `curl -L`. Always look at the results before going on.

## 4. Scenario: footage routes

Find current models with `recommend`, passing each lane's value as `capability` (`img2video`,
`audio2video`; a reference-image, reference-audio dance is `img2video` with the reference features;
lip-sync correction is `video2video`, with the job in the prompt) and read each schema with
`model_schema_get`. Pass a clip length through the `duration` argument, never in the prompt:
`recommend` read "under 10 s" there as a latency limit. Footage is generated at the canvas ratio:
image-to-video follows a 9:16 first frame where the schema says the frame sets the shape, other
routes take the ratio through the schema's aspect field, and a member that offers neither gets a new
`recommend`, never a cropped 16:9 clip. The parameters below are concepts, not payloads: the schema
wins. `dry_run` every distinct payload and total the quotes. Launch in waves within the team's
concurrency ceiling with `wait:false` (a top-level `model_run` argument, beside `parameters`), then
`jobs_wait` with the wave's job ids, re-called with `pending_job_ids` until none are pending. A
launch refused with 429 `parallel-custom-jobs` created no job: relaunch it in the next wave. A wait
timeout is not a failure: never relaunch on one, and never poll with `job_get`.

| shot                              | route                                                                                                                          | key params                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **any action from a style frame** | image-to-video                                                                                                                 | first frame, duration, resolution, the canvas ratio where the schema has an aspect field, native audio off                               |
| **dance locked to the song**      | reference-image and reference-audio video + a synthesized beat track                                                           | reference images (sheet, crop or frame), the beat track as reference audio, duration, the canvas ratio, native audio off; then beat-warp |
| **lip-sync** (preferred)          | audio-to-video from a style frame and a vocal slice                                                                            | first frame, the vocal slice as audio, resolution, the canvas ratio where the schema has one, an optional camera-motion preset           |
| **lip-sync** (alternative)        | reference-audio video with the vocal stem, then a lip-sync correction model (video and audio in, cut-off sync mode if offered) | measure with `lipsync_check.py`                                                                                                          |
| **a moment code does better**     | build it in JS instead (node networks, constellations, charts, UI, particles, any text)                                        | generated versions of these looked worse and were replaced                                                                               |

- **Prompt shape** (every good shot had these parts):
  1. what each `@image`/`@audio` input is for ("Animate this exact image, keep its exact art style
     of …")
  2. one dominant action, with timing cues in clip seconds if needed ("near the end she slowly
     closes her eyes")
  3. one camera move
  4. the set and light, held constant ("background stays pure black", "rim light stays constant")
  5. exclusions ("No text, no captions, no logos, no watermark, no other people. Silent footage.")
- **Synth beat track for dances:**
  `.venv/bin/python tools/synth_beat.py <slot> <dur> assets/audio_slices/<name>_beat.wav`. Upload it
  and say "@audio1 is a percussion timing guide: every hit lands exactly on the kicks and snares".
  The clip then belongs at song time `slot`.
- **Reference images keep a normal shape.** A full-body crop narrower than 0.4 (width over height)
  failed one member's reference check after `dry_run` had priced the payload without complaint. Pad
  tall crops toward the canvas ratio before uploading.
- **Vocal slices for lip-sync** come from the vocal stem as WAV (mp3 adds priming delay):
  `vocal_stem="$(.venv/bin/python tools/audio_paths.py)" && ffmpeg -i "$vocal_stem" -ss <slot> -t <dur> -ac 1 -ar 44100 -c:a pcm_s16le assets/audio_slices/<name>.wav`.
  The resolver reads the approved master from `engine/data/audio.json` and fails if its stem is
  missing. After an audio edit, regenerate affected slices from the new stem. The clip belongs at
  `slot`. Lip-sync prompts ask for "precise, expressive lip sync, strong mouth shapes on every
  syllable", with the mouth always visible and hands out of frame.
- **Never send the song itself** to a video model. Moderation rejects it, and `generateAudio:true`
  can reproduce the vocal and fail the job. Use beat tracks and vocal stems only.
- **Shot mix to plan:**
  - a hook close-up for frame 0
  - 2-3 lip-sync shots in different looks
  - 2-4 full-body dances or formations
  - a long-shot action (a sprint or leap)
  - a spin or signature move
  - a few "concept" shots that illustrate specific lyrics
  - a finale
  - Include full-body long shots as well as close-ups. About 17 frames, 17 videos and 6 lip-syncs
    came to about 6k CU at 720p; a 1080p portrait remake with 24 frames and 27 clips came to about
    15k.
- **Revisions:** a shot that doesn't work gets regenerated in a different look or replaced by code.
  Don't patch it with effects. For a bad cut-out (fine detail such as fingers on a keyboard, or hair
  on white), regenerate the shot in a style that keys cleanly (pixel art, flat color), or show the
  full plate inside a window.

## 5. Footage prep: frames, mattes, tracking, checks

```bash
bash tools/prep_clip.sh                       # every assets/clips/*.mp4 → assets/video/<clip>/ frames + m_*.png mattes + track.json
bash tools/prep_clip.sh lip_a dance_b         # or only some clips
.venv/bin/python tools/fixmatte.py <clip>     # flat color-cyc clips: union a chroma key with the Vision matte (keeps floor shadows out)
.venv/bin/python tools/fixmatte.py <clip> --white   # white high-key clips (not when the subject wears white: a white hoodie reads as background and the matte gets holes)
.venv/bin/python tools/beatwarp.py <clip> <slot>                                     # dance clips: meta.warp time remap onto the song's accents
.venv/bin/python tools/dance_sync_check.py assets/clips/<clip>.mp4 <slot>             # motion-onset vs beat correlation
.venv/bin/python tools/lipsync_check.py assets/clips/<clip>.mp4 assets/audio_slices/<vocal>.wav out/ls_<clip>.png
ffmpeg -i assets/clips/<clip>.mp4 -vf "fps=2,scale=320:-1,tile=6x4" -frames:v 1 out/sheet_<clip>.jpg   # then Read it
```

- **Mattes:** `tools/matte` uses Apple Vision's foreground-instance mask. It is free and takes about
  0.1 s per frame, writing 8-bit `m_#####.png` (white = subject).
  - Open a few mattes and check them over a bright color, especially hair, fingers and anything near
    a white background.
  - Matte sources, in order. Apple Vision first: free, fast and good on people. When `tools/matte`
    is missing (no macOS, or an unaccepted Xcode license blocks `swiftc`) or its matte fails on a
    clip (white subject on a white set, props, hair), use Scenario: `recommend` with `video2video`
    for video background removal, ask for a solid magenta background rather than transparency (a
    transparent request can come back in a container without alpha), `dry_run` it, run it on the
    clip's asset, `asset_download` the result, then
    `.venv/bin/python tools/matte_keyed.py <clip> <keyed.mp4> --force`. MediaPipe last:
    `.venv/bin/python tools/matte_fallback.py <clip> ...` is free but soft, keeps people and loses
    props and fine detail.
  - Rerun `fixmatte.py` on flat-cyc clips after replacing a matte, then `track.py`.
- **Pixel-art subjects:** soft mattes look dirty on pixel edges. Threshold to a hard binary mask on
  the pixel grid and add a 1-cell ink outline.
- **Tracking:** `track.py` writes MediaPipe pose (33 landmarks) plus the matte bbox, centroid, area
  and top point per frame. Pose fails on non-human subjects and on wide group shots, but the
  matte-derived fields still work.
- Write each clip's content, key moments (in clip time), slot and matte quality into TREATMENT.md's
  footage map. Agents work from it.

## 6. Engine and agents

Run `tools/track.py` after the mattes exist: it writes `box`, `c` and `top` from the matte, and a
clip tracked before them has pose only.

- **Before launching agents:**
  - Write STYLE.md and TREATMENT.md (see SKILL.md), and AGENTS_BRIEF.md from
    `references/agent_brief_template.md`. Copy ENGINE_API.md into the project.
  - Fill in `engine/timeline.js` (`CANVAS`, sections on downbeats with their `energy`, `HUD`,
    `POST`) and set `PAL` in `core.js`.
  - Write a tiny `_smoke.js`: plate → type behind the subject → matte → tracked label. Render one
    still and a 5 s clip, then run `av_sync_check.py`.
- **Launch** one `general-purpose` agent per section in a single message (background). Each prompt
  names its file, time range, lyrics, must-have ideas and footage, and says to read the brief first.
  Log the agent ids in `analysis/agents.md`, so revisions can resume them.
- **Review** each report as it arrives: build a contact sheet of its best stills and Read it. Fix
  engine-level problems yourself and tell every agent what changed.

## 7. Assembly, grade and verification

```bash
# render.mjs ends with "wrote <file> (<N> frames)": delivery_check.py takes that N (§8)
node tools/render.mjs --fps 60 --scale 1 --workers 3 --crf 17 --out out/final/v1.mp4 [--variant b] [--to <end >]
.venv/bin/python tools/av_sync_check.py out/final/v1.mp4 0                                          # expect audio 0.0 ms; visual 0..+1 frame
.venv/bin/python tools/dynamism_check.py gate out/final/v1.mp4 --json out/final/v1_dynamism.json    # per-section holds, still share, motion; flashes. Exit 1: fix first
ffmpeg -i out/final/v1.mp4 -vf "freezedetect=n=0.003:d=0.25" -map 0:v -f null - 2>&1 | grep freeze_ # frozen footage or graphics
ffmpeg -i out/final/v1.mp4 -vf "fps=2,scale=384:-1" -q:v 4 out/watch/f_%04d.jpg                     # then tile 8x5 per 20 s (`tools/sheet.py <out.jpg> <cols> <img>...`) and Read every sheet
```

- **Freezes:** check every hit from `freezedetect`. A held footage frame (a clip that ran out, or a
  slot clip shown before its slot) was rejected as "static". Intentional holds of pure graphics are
  fine if something still moves.
- **Dynamism:** a failing section lists its holds with song time, bar and beat. Fix it in its scene,
  re-render the range and gate it with `--only` and `--start` ([dynamism.md](dynamism.md) §7). Gate
  each variant's render too, with its `--variant`. Re-gating a render into the same `--json` needs
  `--force`.
- Check each section boundary at −1/0/+1 frames.
- **Portrait safe band:** for each 20 s window,
  `node tools/still.mjs --range <a>:<a+20>:1 --scale 0.5 --safe --dir out/safe/<a> --sheet safe --cols 5`,
  then Read each sheet. Every word, logo and face sits inside the dashed band; full-bleed footage
  and graphics may run behind it.
- Do a global look pass: a still sheet across all sections, then tune `POST`, the palette and the
  HUD theme before the final render.
- **Older project:** when revising a project scaffolded before motion blur (no `engine/blur.js`),
  copy the skill's `scripts/*.mjs` and `scripts/delivery_check.py` into `tools/`, and `main.js`,
  `blur.js`, `canvas.js`, `core.js`, `plate.js`, `typekit.js` and `scenes/hud.js` from
  `assets/engine/` into `engine/`. Reapply any engine fix the project made to them, then replace
  `ENGINE_API.md` with `references/engine_api.md`. Its old `render.mjs` drops `--blur` without a
  word, and §8 needs `delivery_check.py`.
- **Motion blur:** decide it in the look pass. Render the fastest 5 s twice at `--fps 60 --scale 1`,
  with `--blur` and without, and show the pair (unattended: leave it off, unless the user asked for
  blur where it helps; then judge the pair yourself and say why). Once approved, set
  `export const BLUR = { on: true }` in `engine/timeline.js`, so every later render carries it
  (`ENGINE_API.md`, Motion blur). Then run a sheet of frames at each hard cut inside a scene
  (`still.mjs --blur`): a double exposure there needs an `E.cut(t)`, and `render.mjs` lists the
  frames it had to render without blur.

## 8. Delivery

```bash
# 4K master, on request, first: the same cut at --scale 2 (render.mjs pins Level 5.2, caps the bitrate to it, and runs
# only as many workers as fit in memory)
node tools/render.mjs --fps 60 --scale 2 --workers 3 --crf 17 --out out/final/vN_4k.mp4
# SRC is what every encode below reads, FIT how it gets to 1080p
SRC=out/final/vN.mp4; FIT=()
# with a 4K master, every file below is made from it instead (portrait: scale=1080:-2:flags=lanczos):
# SRC=out/final/vN_4k.mp4; FIT=(-vf scale=-2:1080:flags=lanczos)
# landscape canvas: the X-ready file (YouTube takes the master itself)
ffmpeg -i "$SRC" "${FIT[@]}" -c:v libx264 -preset slow -level 4.2 -b:v 21M -maxrate 25M -bufsize 42M -pass 1 -an -f mp4 /dev/null
ffmpeg -i "$SRC" "${FIT[@]}" -c:v libx264 -preset slow -level 4.2 -b:v 21M -maxrate 25M -bufsize 42M -pass 2 -pix_fmt yuv420p -profile:v high -c:a aac -b:a 192k -ar 44100 -movflags +faststart out/final/vN_x_1080p60.mp4
# portrait canvas: one vertical upload for TikTok, Reels and Shorts (the platforms re-encode, so keep quality high)
ffmpeg -i "$SRC" "${FIT[@]}" -c:v libx264 -preset slow -level 4.2 -crf 17 -pix_fmt yuv420p -profile:v high -c:a aac -b:a 192k -ar 44100 -movflags +faststart out/final/vN_vertical_1080x1920.mp4
# teaser: END is the teaser length in seconds, FADE = END - 0.6
ffmpeg -i "$SRC" "${FIT[@]}" -t "$END" -af "afade=t=out:st=$FADE:d=0.6" -c:v libx264 -preset slow -level 4.2 -crf 17 -pix_fmt yuv420p -profile:v high -c:a aac -b:a 192k -ar 44100 -movflags +faststart out/final/vN_teaser.mp4
# last, every delivered file: --frames as render.mjs printed it on a master (vN.mp4, vN_4k.mp4), --max-mb 512 on the X file
.venv/bin/python tools/delivery_check.py out/final/vN.mp4 --frames <N>
.venv/bin/python tools/delivery_check.py out/final/vN_4k.mp4 --frames <N>
.venv/bin/python tools/delivery_check.py out/final/vN_x_1080p60.mp4 --max-mb 512
.venv/bin/python tools/delivery_check.py out/final/vN_vertical_1080x1920.mp4
.venv/bin/python tools/delivery_check.py out/final/vN_teaser.mp4
```

- **Vertical length:** platform caps on vertical uploads change often (Shorts, Reels and TikTok each
  set their own); check the target's current limit before the final render, and cut the teaser when
  the song runs longer.
- **Two ratios:** the renders are `vN_16x9.mp4` and `vN_9x16.mp4` (§9). Run each encode on its own
  canvas's render and carry the suffix into every output (`vN_9x16_vertical_1080x1920.mp4`,
  `vN_9x16_teaser.mp4`), so nothing collides.
- **Levels:** keep `-level 4.2` on the `-preset slow` encodes. Without it x264 signals Level 5.0 at
  1080p60, above what some phones and browsers decode; with it, x264 uses fewer reference frames.
- **Check every delivered file** with `delivery_check.py`: H.264 4:2:0, a level the frame needs and
  devices decode (4.2 at 1080p, 5.2 at 4K), the frame count, a clean decode, the audio track,
  faststart and the size. It warns when the busiest second outruns the level's bitrate. Hand over
  nothing that fails.
- **4K master:** only on request. `--scale 2` renders the same cut at 3840×2160 (2160×3840 on
  portrait); bloom, grain and scanlines keep their 1080p size.
  - Footage keeps its generated resolution (a 720p plate is upscaled 3×), so the gain is in type and
    graphics.
  - YouTube takes the 4K file; every other file is made from it at 1080p, as in the block above.
  - Before the long render, compare one still per section at `--scale 2` with `--scale 1`: a size
    that skips `E.SCALE` shows as a mismatch (`ENGINE_API.md`, Scene contract).
  - A 4K frame takes about 3 times as long, and a worker needs about 6.5 GB, so `render.mjs` runs
    one on 16 GB of RAM: budget 15 min (3 workers) to 45 min (one) for 2:00, about 2.5 times that
    with motion blur on (authoring-time estimates).
- **Name outputs distinctly.** macOS filenames are case-insensitive, so an encode named like its
  input with different case overwrites the input mid-encode.
- **Variants:** render each with `--variant`, and name the files by what differs (`_ending_b.mp4`).
- **Stills:** `node tools/still.mjs --t <times> --scale 1 --dir out/stills` gives lossless PNGs at
  the canvas size (1920×1080 or 1080×1920) straight from the engine; `--scale 2` with a 4K master.
  They stay sharp under motion blur unless you pass `--blur`.
- **Style sheet / making-of:** publish an artifact or doc with the palette, type, subject sheets,
  source-vs-final footage pairs, a frame index, the pipeline and the iteration count.

## 9. Two ratios from one project

Only when the user asks for both: one canvas is the default. Everything in code is shared, so the
analysis, lyrics, STYLE, TREATMENT, scenes and HUD render on the second canvas at no generation
cost. Footage is not.

- **Pick the primary canvas,** the platform that matters most, and set it as `CANVAS`. When the user
  names both without ranking them, ask; unattended, landscape. Style frames and footage are
  generated at its ratio, as in §3 and §4.
- **Per shot on the secondary canvas,** cheapest first:
  1. **Window it.** Play the primary clip whole inside the other frame (a band, a card, a split
     panel or a type window, per `motion_library.md` §5) and let graphics fill the rest. Free, and
     it reads as design.
  2. **Regenerate it** at the secondary ratio: a new style frame composed for that ratio (same
     references, same look), then the same footage route. It costs what the original cost, so
     `dry_run` it. Keep it for the shots that must fill the frame: the frame-0 hook, lip-sync
     close-ups and the finale.
- **Never cover-crop 16:9 to fill 9:16.** It keeps under a third of the width (608 of 1920 px on a
  1080p clip, 405 of 1280 on 720p), upscaled about 1.8 to 2.7 times, and it usually cuts the
  subject.
- **Budget:** quote both canvases before launching: the primary footage plus the regenerated shots.
  Tell the user which shots are windowed on which canvas.
- **Scenes:** every plate takes `fit: E.plateFit(E, v)` (and the same options in `plateToScreen`),
  which fills the frame when the clip matches the canvas and windows it when it does not;
  `drawPlate`'s own default is `cover`, which would crop. A regenerated shot is a new clip with its
  own prep (§5), picked by canvas in the same scene
  (`E.loadVideo(E.ORIENT === 'portrait' ? 'hook_v' : 'hook')`). Give a section a second scene file
  only when its layout diverges (a wide poster slam), and tag the pair in `TIMELINE`:
  `canvas: 'landscape'` on one, `canvas: 'portrait'` on the other.
- **Render and verify each canvas:**
  `node tools/render.mjs --fps 60 --scale 1 --workers 3 --crf 17 --out out/final/vN_16x9.mp4`, then
  the same with `--canvas portrait --out out/final/vN_9x16.mp4` (swap them when portrait is the
  primary). Run §7's checks on each file, the dynamism gate included (windowed plates move less of
  the frame), plus the safe-band sheets on the portrait one (`still.mjs --canvas portrait --safe`
  when the primary is landscape).
- **Deliver** one set per canvas, suffixed by ratio as in §8.
