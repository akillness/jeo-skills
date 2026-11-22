---
name: scenario-kinetic-music-video
description: "Use when turning a song into a kinetic-typography or motion-design music video, lyric video, visualizer or K-pop style MV with Scenario, landscape or vertical 9:16 for TikTok, Reels and Shorts: a generated subject sheet, style frames and footage, plus a deterministic JavaScript/three.js engine for lyric type, mattes and tracked graphics timed to sung onsets. Also for revising, recutting or cutting teasers from such a video. Not for a brief-led launch film (scenario-kinetic-film)."
license: MIT
---

# Kinetic Music Video

A song goes in. A 1080p60 music video comes out, landscape for YouTube and X or vertical for TikTok,
Reels and Shorts: a motion designer's showreel cut to the track. Kinetic type, 2D and 3D graphics
and transitions land on the beats and sung syllables. Generated footage of the subject is woven
through it where the concept wants a performer. The approved master is the only soundtrack. Preserve
the original; an authorized audio edit produces a new, versioned master.

The work splits by what each tool does best:

- **Scenario** supplies what code can't: a consistent subject with real physics, choreography, hair
  and lip-sync, in whatever art style each section needs.
- **The JS engine** supplies what video models can't: exact typography, frame-exact timing to onsets
  and beats, infographics, compositing around the subject, and endless re-renders at zero generation
  cost.
- **Sub-agents** give each section a dedicated designer. A shared style bible and a verification
  loop keep them coherent.

Connection and the core generation loop: see the `scenario` skill in this repo. For a song-to-video
cut without the engine, see `scenario-seedance-music-video`. If a sibling skill named here is
missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to
install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas
and flag the gap.

Read `references/lessons.md` before starting. Every item in it cost real time or money once.
`references/motion_library.md` is the design menu.

## Before you start (ask once, then run)

- **Workspace:** the Scenario team and project (`teams_list`; ask if there is more than one).
- **Subject:**
  - Who or what performs: a character from reference images, a mascot, a product, the artist's own
    likeness (their own photos and consent only), or nobody (a pure motion-graphics or lyric video).
  - Footage share: performer-led, a mix (often about 60/40), or graphics only.
- **Look:**
  - Ask for references: images, videos or links for the mood, the motion and the **color**. Vague
    color asks without references drift to safe palettes.
  - Decide the 2-4 looks and which sections own which.
  - Ask what must never appear.
  - Defaults: generated footage shown clean (no filters on it), graphics layered on and around it, a
    fast and upbeat showreel energy.
- **Brand:** any logo, wordmark or credit. Use official files in their official colors, only where
  the director wants them.
- **Budget:** lean (6-10 video generations), moderate (12-20) or big. Price each paid step with
  `dry_run` (one run per distinct payload, then total) before spending. Relative anchors at 720p: a
  6 s clip costs about twenty style frames, a 10 s clip about thirty-five, and a full mixed video
  about five hundred. A 1080p clip measured about 2.5 times its 720p price, so settle the footage
  resolution before quoting.
- **Format:** one canvas per project, asked once: portrait 9:16 for TikTok, Reels or Shorts,
  landscape 16:9 for YouTube or X (unattended with no destination: landscape). It is `CANVAS` in
  `engine/timeline.js`, and style frames and footage are generated at that ratio, never cropped from
  the other. On portrait, check the destination's current length cap and plan the teaser as the
  platform cut when the song runs longer, or when you cannot check. Both ratios only on request: the
  code re-renders free with `--canvas` and most shots are windowed, but each shot that must fill the
  second frame (hook, lip-sync close-ups, finale) is paid again (`references/pipeline.md` §9). X
  caps standard accounts at 2:20, so plan a teaser.
- **Lyrics:** use them if supplied (they beat any transcript). Otherwise transcribe and flag the
  uncertain words at the end.

With no one around to answer, choose sensible defaults for the creative choices and write them into
TREATMENT.md. Do not default the money: with no stated budget or no explicit team and project, stop
before the first paid step and say what is missing.

## Workflow

### 1. Scaffold and analyze the song

Run `bash <skill>/scripts/scaffold.sh <song>` inside a new project folder (macOS on Apple Silicon or
Linux x86_64 with glibc 2.28+: the Python lock covers those two), then follow
`references/pipeline.md` §2:

- `audio_analysis.py` writes stems and `engine/data/audio.json`: beats, downbeats, kick/snare/vocal
  onsets, and 60 fps envelopes. **Measure the tempo**; labels lie (a "130 BPM" song was 98 with
  double-time drums).
- `lyrics_align.py transcribe`, then hand-correct `analysis/lyrics.txt`, then
  `lyrics_align.py align` writes `engine/data/lyrics.json` with word onsets.
- Check timing by eye with `plot_lyrics.py`. Audition when playback is available; a spectrogram
  locates onsets but cannot prove pronunciation or musical continuity.

### 1a. Edit the soundtrack when requested

For pronunciation repairs, lyric changes, section replacements or structural cuts, read
[references/audio_editing.md](references/audio_editing.md). Use `scenario-ace-step` for its
Cover/Repaint contracts. Keep the current cut and master until a candidate is selected; preserve
audio outside the agreed window and rebuild affected timing data after applying it. A picture-only
revision reuses the approved soundtrack.

### 2. Research (parallel, background)

Launch two sub-agents with web access while you work on other things:

- **Culture:** for the song's subject, find recognizable events, memes and visual tropes, each with
  a verified fact, its iconic visual form, an insert idea and a short on-screen string.
- **Craft:** study the user's motion references (download them, contact-sheet them, read the
  frames), plus genre direction techniques. Extract timing numbers, color hex values and
  implementable JS moves. Measure each reference per section into `analysis/targets.json`
  ([references/dynamism.md](references/dynamism.md) §5).

Save the condensed results as `analysis/research_*.md`. Scene agents read them alongside
`references/motion_library.md`.

### 3. Concept, style bible and treatment

- **Give the video a spine.** The strongest concepts make the edit itself carry the song's meaning:
  a device that progresses through the whole video, for example a counter, clock or countdown that
  moves with the song while the cut rate or the looks escalate with it. The spine usually lives in
  the HUD counters.
- **STYLE.md** (the law):
  - a one-line concept and the spine
  - the footage rules (clean plate and the back/mid/front layers, or another policy)
  - the looks, each with ground, ink, accent, rendering rule and matching footage style
  - the palette with roles
  - 4-5 type roles with named fonts
  - lyric display rules
  - a motion grammar mapping beats to effects, with the cut density per section
  - the subject (identity, design details usable as graphic motifs)
  - brand rules, references and bans
- **TREATMENT.md:**
  - song facts and the energy map
  - the arc
  - the **hook for the first 3 seconds** (the strongest idea in the video, and it must work as a
    muted autoplay)
  - one row per section: time range on downbeats, lyrics, look, must-have ideas
  - a footage map (filled in as clips land)
- **PLAN.md:** a one-page version for the director to approve before you spend on footage
  (unattended, this is the stop point if the budget is unstated).

### 4. Subject, style frames and footage on Scenario

Skip this for a graphics-only video, apart from any stills or 3D props. Otherwise follow
`references/pipeline.md` §3-5:

- **Subject sheet:** a turnaround, expressions and callouts from the user's references. Look at it,
  then crop identity references from it.
- **Style frames:** one still per shot at the canvas ratio (an image model that takes reference
  images), in its section's look. Compose with negative space for type (on portrait, the face and
  the type space inside the safe band), on a set that composites (black void with rim light, flat
  color cyc, or white high-key). No text. In a lip-sync frame nothing covers the mouth (no mic, hand
  or prop): a covered mouth fails the sync check and is paid again. Contact-sheet them and get the
  look approved cheaply (unattended: proceed only inside a stated budget).
- **Footage routes:**
  - Image-to-video from the frame for actions.
  - A video model with reference images and reference audio, given a **synthesized beat track** for
    dances that lock to the song, then beat-warp.
  - **Audio-to-video** from a frame plus a vocal-stem slice for lip-sync. The alternative is
    reference-audio video plus a lip-sync correction model.
  - Code instead of generation for networks, charts, UI and particles.
- Never send the song to a video model. Turn the model's native audio off when its schema offers it
  (the render takes sound only from the master either way), and launch in waves within the team's
  concurrency ceiling (`jobs_wait` re-called with `pending_job_ids`, never `job_get`). Relaunch only
  a launch refused with 429 `parallel-custom-jobs`: it created no job, and dropping it leaves a hole
  in the cut.
- **Prep** every clip with `tools/prep_clip.sh`: frames, a subject matte (Apple Vision, with
  Scenario background removal as the fallback; see `references/pipeline.md` §5) and tracking
  (MediaPipe pose plus the matte bbox). Inspect the mattes. Write each clip's content, key moments,
  slot and matte quality into the footage map.

### 5. Engine and scene agents

- **Smoke-test first:**
  - Set `PAL` in `core.js`, and in `engine/timeline.js` set `CANVAS`, the sections on downbeats with
    their `energy`, `HUD` (title, mark, section codes, spine counters) and `POST` (neutral by
    default).
  - Write a tiny `_smoke.js`: plate → type behind the subject → matte → tracked label.
  - Render one still and a 5 s clip, then confirm audio and flashes line up with `av_sync_check.py`.
- **Brief the agents.** Fill in `AGENTS_BRIEF.md` from the template, then launch one background
  agent per section in a single message. Each gets its file, time range, lyrics, must-have ideas and
  clips, and reads AGENTS_BRIEF, STYLE, TREATMENT, ENGINE_API and the research first. Log the agent
  ids. For a teaser or anything under about 30 s, the lead may write the scenes itself and skip the
  research agents, PLAN.md and the per-section agents; keep the smoke test.
- **Deliver clips as they land.** Message the agent that needs each one ("clip ready: content, key
  moments, slot").
- **Review every report.** Contact-sheet the best stills and Read them. Fix engine-level problems
  yourself (they affect everyone) and tell the agents what changed.

### 6. Assemble, watch, iterate

- **Render the full cut** (3 workers, about 5 min for 2:00 on an M-series Mac, 2.5 times that with
  motion blur). Wait for it in the foreground (or poll until it prints `wrote`), then verify and
  deliver: never end the run mid-render or mid-encode, since a headless session that stops kills it.
- **Verify:**
  - `av_sync_check.py`: expect 0.0 ms audio and 0 to +1 frame visual. Below a correlation of about
    0.15 the visual lag means nothing (type leading by `E.LEAD` reads as up to -3 frames): check
    onset stills instead.
  - `dynamism_check.py gate` on each delivered render: exit 0. On exit 1, fix and re-gate (`--force`
    replaces its JSON); unattended, after 3 rounds on a section or at the budget, deliver and report
    the failing sections.
  - `freezedetect`: no frozen footage.
  - Contact sheets at 0.5 s steps, 20 s per sheet.
  - Every section boundary, frame by frame.
  - On portrait, `still.mjs --safe` sheets, 20 s each: no word, logo or face outside the outlined
    band.
- **Global look pass:** a still sheet across all sections, then tune `POST`, the palette and the HUD
  theme. Decide motion blur from an A/B of the fastest 5 s (`--blur`, `references/pipeline.md` §7;
  unattended: off unless the user asked for it, then judge the pair yourself).
- **Revisions:** map each director note (they arrive as timestamps) to its section and send it back
  to the owning agent via SendMessage. Resuming keeps its context. Fix a weak shot by replacing it
  with a new generation in a different look, or with code, never by adding effects. Offer
  alternatives as timeline `variant`s (render with `--variant b`) instead of guessing.
- **Older projects:** without `tools/dynamism_check.py`, copy it and `rectify_screen.py` from
  `<skill>/scripts/` into `tools/`, and add the template's dynamism check to `AGENTS_BRIEF.md`.
  Replace `ENGINE_API.md` with `references/engine_api.md` only when `engine/canvas.js` exists;
  otherwise add its `energy` line. Then tag each `TIMELINE` entry's `energy` from TREATMENT.md
  (`references/dynamism.md` §2).

### 7. Deliver

- **4K master:** only on request (`--scale 2`, `references/pipeline.md` §8), rendered first: every
  other file is made from it.
- **Videos:** a master, an upload file (landscape: the master for YouTube, an X-ready file under 512
  MB; portrait: the vertical upload in `references/pipeline.md` §8), a teaser (verse plus first
  chorus), plus one file per variant. With both canvases asked for, one set per canvas, suffixed
  `_16x9` and `_9x16`. Use distinct filenames, because macOS is case-insensitive.
- **Checks:** run `delivery_check.py` last, on every file.
- **Stills:** full-res PNGs rendered by the engine, never grabbed from the compressed video.
- **Style sheet / making-of:** publish it as an artifact or doc: palette, type, subject sheet,
  source-vs-final footage pairs, a frame index, the pipeline and iteration counts.
- **Report:** tell the user what was verified, which lyrics you guessed, and the CU spent, summed
  from this run's successful `jobs_wait` rows (`cuCost`, logged in `analysis/jobs.md`; a failed job
  is refunded but its row keeps a `cuCost`); `usage` is project-wide and includes other work.

## Quality bar

- **Every word shows on time.** Each sung word is visible at its onset (as a hero or in the subtitle
  track), and hero words peak on the onset frame.
- **Integration, not decoration.** Every footage moment has a graphic that reacts to it (behind via
  the matte, tracked to it, timed to its move, or continuing its shapes). The footage pixels are
  untouched.
- **No static frames.** Footage always plays live, and something always moves.
- **One focal point per frame.** Type frames the subject and never covers the face.
  Behind-the-subject type still reads. On portrait, every word, logo and face sits inside the safe
  band.
- **Section variance.** Mix the looks, 2D and 3D, poster slams and quiet subtitles. Never use the
  same type treatment on two consecutive lines. Cut density climbs with the song's energy, and
  showcase moments (logo, end card) get time.
- **Photosensitivity.** At most 3 full-frame flashes per second, end card included (WCAG flashes:
  pairs of opposing luminance changes).
- **Watch it yourself** before calling it done, then take a second look at the first 3 seconds.

## Files in this skill

- Setup and analysis: [scaffold.sh](scripts/scaffold.sh),
  [audio_analysis.py](scripts/audio_analysis.py), [lyrics_align.py](scripts/lyrics_align.py),
  [plot_lyrics.py](scripts/plot_lyrics.py)
- Locked npm dependencies scaffold.sh copies into new projects:
  [package.json](assets/npm/package.json), [package-lock.json](assets/npm/package-lock.json)
- Hashed, wheels-only Python locks scaffold.sh installs, one per platform:
  [macos-arm64.txt](assets/python/macos-arm64.txt),
  [linux-x86_64.txt](assets/python/linux-x86_64.txt), resolved from
  [requirements.in](assets/python/requirements.in)
- Approved-master stem lookup for transcription, plots and vocal slices:
  [audio_paths.py](scripts/audio_paths.py)
- Footage generation helpers: [synth_beat.py](scripts/synth_beat.py),
  [beatwarp.py](scripts/beatwarp.py)
- Footage prep: [prep_clip.sh](scripts/prep_clip.sh), [prep_video.py](scripts/prep_video.py),
  [matte.swift](scripts/matte.swift), [fixmatte.py](scripts/fixmatte.py),
  [matte_keyed.py](scripts/matte_keyed.py), [matte_fallback.py](scripts/matte_fallback.py),
  [track.py](scripts/track.py)
- Sync checks: [lipsync_check.py](scripts/lipsync_check.py),
  [dance_sync_check.py](scripts/dance_sync_check.py), [av_sync_check.py](scripts/av_sync_check.py)
- Dynamism: [dynamism_check.py](scripts/dynamism_check.py),
  [rectify_screen.py](scripts/rectify_screen.py) (flattens a phone-filmed screen),
  [references/dynamism.md](references/dynamism.md)
- Rendering and review: [render.mjs](scripts/render.mjs), [render_lib.mjs](scripts/render_lib.mjs),
  [still.mjs](scripts/still.mjs), [serve.mjs](scripts/serve.mjs), [sheet.py](scripts/sheet.py),
  [delivery_check.py](scripts/delivery_check.py)
- Engine, copied by scaffold.sh: [index.html](assets/engine/index.html),
  [main.js](assets/engine/main.js), [blur.js](assets/engine/blur.js),
  [canvas.js](assets/engine/canvas.js), [core.js](assets/engine/core.js),
  [plate.js](assets/engine/plate.js), [roto.js](assets/engine/roto.js),
  [typekit.js](assets/engine/typekit.js), [hud.js](assets/engine/scenes/hud.js), plus
  [timeline.template.js](assets/timeline.template.js) and
  [scene.template.js](assets/scene.template.js)
- [references/pipeline.md](references/pipeline.md): every command and Scenario call, step by step
- [references/engine_api.md](references/engine_api.md): the scene contract and the full `E` API
  (canvas and safe band, plates, mattes, tracking, post, HUD, variants)
- [references/motion_library.md](references/motion_library.md): looks, type system, 40 techniques,
  integration ideas, transitions, timing, easing, sync and cut density
- [references/agent_brief_template.md](references/agent_brief_template.md): the brief each scene
  agent reads
- [references/lessons.md](references/lessons.md): production gotchas and direction defaults that
  held
