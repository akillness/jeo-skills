# scenario-kinetic-music-video (maintainer notes, not packaged)

## Origin

Sara Nemati own `kinetic-music-video` skill, built from the production of the Every Scenario music
video (and the kinetic music video it grew out of) and rewritten to be generic: any subject or none,
any looks, no project examples. Brought into this repository from the ZIP she exported on
2026-10-02.

## Edits for this repository

- Frontmatter reduced to `name`, `description` ("Use when", under 500 characters) and `license`; the
  name carries the `scenario-` prefix.
- Generative model names and ids removed (availability differs per team): lanes are named by
  capability and found with `recommend`. Parameter names are the ones that held at authoring time,
  with the schema as the authority.
- Credit amounts stated as relative costs, with `dry_run` before paid steps.
- En and em dashes replaced, scripts print usage when called without arguments, and the
  output-writing scripts refuse to replace an existing file without `--force`.
- Sibling references and the install invitation added; connection setup points to `scenario`.

## Portrait canvas

Added after import so the skill can serve vertical feeds. One canvas per project (`CANVAS` in the
timeline), with `--canvas` for a second ratio. `assets/engine/canvas.js` holds the presets, the 9:16
safe band (derived from the band `scenario-formats` and `scenario-video-ads` compose to, reading
their 6 to 13% per side as 6% left and 13% right, where the action rail sits), the per-canvas
timeline filter and `plateFit`. The HUD, the house subtitle and the scene template lay out inside
`E.SAFE`; every portrait-only behavior is gated off landscape.

Verified headless (Playwright's Chromium, software WebGL) with synthetic audio, lyrics and a
synthetic footage clip (frames, matte, tracking): landscape stills of both template branches
(footage and 3D) and the HUD, including a 150-character lyric line, are pixel-identical to the
pre-change engine at scales 1 and 0.5. Portrait and square stills were checked by eye with the safe
band outlined, and the error paths (bad canvas, bad timeline tag, an `--only` with nothing to
render) fail fast. `canvas.js` has a unit suite. Two plan-only application tests (portrait only;
both ratios) passed with notes.

A live application test then produced a full 1080p60 portrait video end to end (a 2:14 song, 24
style frames, 27 clips, 9 section agents, about 15k CU) and passed with notes. It found the portrait
subtitle running into the HUD counters, a `crop` that stretched plates, a `--chant` window with no
end, transcription passes overwriting each other, `still.mjs` keeping a stale sheet, and the doc
gaps behind a mic-covered lip-sync retake, the 720p-only cost anchors and a rejected reference crop.
All are fixed; `motion_library.md` §10 notes one production behind its portrait rules.

## Dynamism gate

Added so a render is held to numbers per section, not to an eye that adapts after a few watches.
`scripts/dynamism_check.py` gates a render and measures references; `scripts/rectify_screen.py`
flattens a phone-filmed screen first, since a reference often arrives as a phone filming a TV or a
laptop, and motion read off that raw video measures the hand.

How the measurement was chosen, all on synthetic clips encoded with libx264:

- **A 60 fps clock and distinct frames.** Each picture of 24 fps footage repeats 2 or 3 times in a
  60 fps render, so frame-to-frame differences read a live clip as mostly still. A first design
  compared frames 0.1 s apart. It fixed the repeats, but its flow saturated near 12 px per frame and
  then fell as speed rose: pans at 18 to 96 px per frame all read 4 to 6. A 1-frame toggle or a
  3-frame shake also compared identical phases and read fully still. The script now runs optical
  flow between consecutive distinct frames, skips repeats, and averages 0.5 s windows (whole 24, 25
  and 30 fps cycles).
- **Flow range.** OpenCV's dense flow pyramid stops at 32 rows, which capped it near 16 px at the
  320 px analysis size. A 1/8-size pass seeds it, and a whole-frame shift catches whip pans beyond
  that. Constant pans from 3 to 192 px per frame read strictly increasing, within 7% of true at
  native 60 fps and within 8% as 24 fps footage.
- **Still runs at frame resolution.** Fixed 0.1 s steps read a 0.60 s hold as 0.5 s, which passed
  the high limit. Runs now end on the frame, and a 0.60 s hold reads 0.60 s. The still test uses a
  gray difference of 12, not 24: at 24, a 6 px per frame pan of 24 fps footage over soft texture
  read 44% still.
- **Slow moves add up.** A still run first ended only on per-pair flow of 1 px or a pixel change.
  Sub-pixel drifts at the calm (0.5) and mid (1.0) motion floors then split into short runs that all
  read 100% still, and a 10% push-in over 2 s read 97% still. A run now also ends once the flow from
  its first frame reaches 0.25 px at 320.
  - The limit was 0.4 first. 24 or 25 fps footage shows only 2 new pictures in a 0.1 s run, about
    0.4 px at the calm floor, so a calm drift and a 10% push-in read 12 to 93% still there.
  - At 0.25, both read 0% still at 15, 23.976, 24, 25, 29.97, 30 and 60 fps drawn at twice the
    analysis size, and at 24, 25 and 60 fps rendered at 1920 x 1080. Drawn at 320 itself, a drift
    still read up to 23% still at 24 and 25 fps (53% at 15): libx264 holds some of its sub-pixel
    steps.
  - Gaussian grain of sigma 1 to 3 gray levels on a hold measured 0.01 to 0.17 px from the run's
    first frame and reads 100% still. CRF 23 smooths grain past the pixel test: there, sigma 3.4 to
    4 read 70 to 100% still at 0.25, and sigma 3.4 only 70 to 83% at 0.2, so the limit stops at
    0.25. At CRF 12, the pixel test breaks a hold from sigma 3.8, as before.
  - That flow call runs only once the per-pair steps since the run began sum to half the limit, so a
    clean hold or a fast move never pays for it.
- **Decoded size.** ffprobe reports a phone clip's coded size, before its rotation tag. A portrait
  clip stored landscape read as a landscape canvas, with 45% less motion. The size now comes from a
  decoded frame, as in `rectify_screen.py`.
- **A flash is one cut.** Cut frames within 3 frames of each other merged, so a white flash of 4 or
  more frames (2 in a 30 fps preview) read as two cuts. A cut back to the previous shot within 0.15
  s now ends the same cut; a strobe counts one cut per flash.
- **Flashes follow WCAG 2.x general flashes:** a pair of opposing changes of 10% relative luminance,
  the darker state under 0.80, on the frame mean, at most 3 per second everywhere. Counting each
  change as a flip would have failed a white flash on every beat at 120 BPM; the pair reading allows
  it and still fails full-frame 8ths.
- **Speed.** Flow runs on every distinct pair, in 4 threads. A 10 s 1080p60 test pattern measured in
  about 1 s (3 s on one thread) on an M-series Mac at authoring time.

Default targets are uncalibrated: they were checked on synthetic fixtures only, never on a real
render. Calm allows a 1.0 s hold, not more, because the quality bar says no static frames.
Calibration is pre-registered for the next live `/skills:validate` run, which gates every section of
its render:

- An approved section that fails: loosen that energy's default to its measured value with the
  `--write-targets` margins (still + 0.10, hold × 1.25, motion × 0.7).
- A section the grader calls static that passes: tighten that energy's default to its measured
  value.
- Approved sections pass and static ones fail: keep the defaults, and drop the "uncalibrated" hedge
  once a second production agrees.
- A flash failure is never loosened: the limit is a safety rule, not taste.

`rectify_screen.py` on a synthetic handheld clip (zoom 3%, drift 14 x 9 px, a caption band):

- manual corners: mean error 1.3 of 255 against the true screen content;
- auto detection: corners within 5 px, error 2.8 of 255, 100% of frames tracked;
- median motion: 4.7 on the true content, 6.5 off the flattened screen, 1.4 off the raw phone clip.

Known limits:

- The numbers are frame-wide. Frozen footage under moving type passes, and a lip-sync close-up where
  only the mouth moves reads still; `freezedetect`, the contact sheets and dynamism.md §7 cover
  them.
- Flashes on part of the frame are not measured.
- Auto screen detection needs a screen brighter than the room. A live `/skills:validate` run filmed
  black bars around a vertical video: the room outscored the screen, and its outline filled the
  frame. Such an outline now exits "no screen found", after writing the `--check` frame. Quadding
  the video itself tracked 100% of frames.
- The same clip inside black bars (a landscape recording posted as a vertical video) outlined the
  whole recording and failed on texture, with no `--quad` hint. Detection now crops the bars first,
  and the clip exits "no screen found" as it does without them.
- `--write-targets` takes span energies as given. Labeling spans by how busy they look once held a
  calm section to more motion than a mid one, so `measure` warns when targets run out of order. It
  checks the targets the gate will use: a calm-and-high file still meets the default mid.
- Sections come from `node` evaluating `engine/timeline.js` as a `data:` URL module. A timeline with
  relative imports falls back to a file URL, which needs a Node that detects ES modules in the
  project's typeless `package.json` (20.19+ or 22.7+).
- `scaffold.sh` copies the scripts into `tools/` on every run, but its `cp -n` keeps an existing
  project's `ENGINE_API.md` and `AGENTS_BRIEF.md`, and rerunning it reinstalls the environment. So
  SKILL.md step 6 tells a revision of an older project what to copy by hand: the brief is filled in
  per project, so only its dynamism check is added.

## 4K master

`--scale 2` reuses the canvas: layouts already scale with `E.SCALE`. Three things did not, and each
fix applies above scale 1 only, so the shader text and the encoder arguments at scale 1 or below are
unchanged.

- **Bloom:** UnrealBloomPass blurs in texels of its own targets, so at 4K the glow reached half as
  far. It now runs at the scale-1 size. Its bright pass then read only the middle of each 4×4 block,
  so it averages the block with four bilinear taps instead: without them, thin lines pulse as they
  move.
  - The engine supplies that bright pass whole instead of patching three's shader text, which a
    reformatting release would break with no CI test to notice (the repository installs no three).
    It relies only on the uniforms UnrealBloomPass feeds, and boot refuses `--scale` above 1 if one
    goes missing. Seven 4K stills match the text-patched version byte for byte.
- **Grain and scanlines** keep 1080p cells (string substitution in the final shader).
- **Encoder:** above 1080p, `-level` from H.264 Table A-1, a VBV cap from that level, and
  `-threads 4`; `render.mjs` caps the workers to memory and refuses a 4K master past Level 5.2.
  - CRF alone has no ceiling. On a real project with grain 0.06 over footage, 3 s of 4K60 at CRF 17
    peaked at 296.6 Mb/s in its busiest second, against the 300 Mb/s Level 5.2 High allows.
  - The cap is the level's Main MaxBR (80% of the High limit) with a buffer of a quarter of it, so
    no second inside a chunk passes the High limit. The same 3 s then peaked at 262.2 Mb/s (252.7
    average), at 41.5 dB against the uncapped file.

Evidence (an M-series Mac, ANGLE Metal, three 0.186.1, ffmpeg 7.1.1, a synthetic project with a
footage plate, matte and tracking, 2D and 3D type, grain, scanlines and the HUD):

- **Unchanged at scale 1 or below:** stills of every frame at scales 0.5 and 1, plus square and
  portrait, are pixel-identical to the previous engine. Four `render.mjs` files (960×540 at 30 fps
  on 2 workers, 1920×1080 at 60, 540×540 at 30, 1080×1920 at 60) are byte-identical.
  - Chrome's GPU canvas rasterizes large or scaled glyph edges with ±1 differences from run to run,
    in the old engine as in the new. The comparison runs with `--disable-accelerated-2d-canvas` (3
    of 3 repeat runs identical), so a difference can only come from the engine.
- **Moving thin lines** (0.5 to 1.5 px wide, half a 1080p pixel per frame), per-frame halo energy
  against 1080p: within 0.6% with the fix, up to 148% off with the bloom resized alone, 129% off
  with no fix. Area-downscaled PSNR against 1080p: 39.3, 27.9 and 24.2 dB.
- **Grain:** 4K grain is constant over 2×2 cells and correlates 0.79 with the 1080p pattern (−0.04
  before), the rest being 8-bit rounding near black.
- **Levels:** `h264Level` matched x264 medium's own pick in 30 cases from 176×144 to 5120×2880, so
  the pin changes no bytes at 4K60; a vitest case reruns that on CI's ffmpeg. With `-preset slow`,
  x264 signals 5.0 at 1080p60 on its own; `-level 4.2` makes it drop to 4 reference frames.
- **Cost:** a 4K frame took 3.3 times as long. Peak footprint per worker (Chrome, its GPU process
  and x264) was 2.5 GB at 1080p and 5.3 GB at 4K; `workerGB` adds about a gigabyte for real footage
  caches.
- **three 0.187.0**, which main moved to while this work was open, on 2026-11-07: the bloom,
  composer and shader addons are byte-identical to 0.186.1. On a real project with footage, mattes,
  3D type, bloom, grain and scanlines, 9 stills at scales 1 and 2, and 3 with blur, are
  byte-identical on both versions; at 0.5, one pixel of one still differs by one level. Repeat runs
  were identical on each version.
- **Older project:** on a project made before the portrait canvas, the `pipeline.md` §7 copy without
  `canvas.js` crashed the page, since `main.js` imports it. With it, a landscape still matched the
  old engine at 48 dB. The same project's 4K stills showed the per-section check working: its
  `THREE.LineSegments` edges stay one device pixel wide, so they glowed less than at 1080p.

## Motion blur

In-engine GPU accumulation, opt-in per project (`BLUR` in timeline.js).

- **Design:** `renderTime` keeps the frame pass as it was. When `blur.js` plans sample times, the
  blurred layers render again at each, every composite is added into a float32 target, and the sum
  divided by n replaces the frame's composite before bloom and the final shader, which run once.
  `render.mjs` still grabs one JPEG per frame.
  - Exact for static content: each composite is half-float, a sum of up to 24 equal half values is
    exact in float32, and dividing by n restores the value.
  - Sharp layers (`blur: false`, the HUD) keep the frame pass's render target in every sample. Every
    blend mode is linear in the layer below, so this is exact too.
  - The shutter opens at the frame time, so nothing shows before its onset. A cut inside it slides
    it back, never before the previous cut.
  - Cuts: entry bounds, `E.cut`, and word switches (`w.s - LEAD`). Without them, a hero word swapped
    on its onset showed both words in one frame of the fixture. Beats are opt-in: a cut per beat
    shifts the streak on about one frame per beat.
  - `trackAt` replays the frame pass by call order, per layer. Recomputing from the sample time
    crosses clip frames; matching by clip time first picked the wrong call when a clamped label's
    time coincided with a slow-motion one (a `blur.test.ts` case pins it). One order across layers
    let a sharp layer's calls, or `prepare()`'s, shift a blurred layer onto another call's landmark
    (`core.test.ts` cases pin both).
  - A sample drawing a clip that `prepare()` did not advance (an undeclared switch inside a scene)
    makes the frame fall back to its frame pass, copied aside before the samples.
  - Without `EXT_float_blend` the sum ping-pongs between two float targets, bit-identical to
    blending.
  - Off by default: existing projects render unchanged, 8 samples cost about 2.2 to 2.5 times the
    render time, and the director approves the look on sharp previews.
- **Default samples, 4 against 8:** type moving 2400 px/s and a box spinning 9 rad/s, 180° at 60
  fps, against 64 samples on the moving band. 4 samples: 34.9 dB mean, 31.0 worst, with visible
  copies on the type. 8: 41.5 and 37.7. 12: 45.6 and 41.9. No blur: 21.0. Frame time with the PNG
  grab: 79 ms without blur, 122 at 4, 195 at 8, 265 at 12. Hence 8, with `E.fast` for slams.
- **Byte-identity protocol** (headless Chrome, ANGLE Metal, `--disable-accelerated-2d-canvas`, the
  synthetic project of the 4K evidence above):
  - Blur off: every frame of the 6 s project at scales 0.5 and 1, square and portrait, matches the
    previous engine, and the four `render.mjs` files are byte-identical.
  - Static content with blur on: 90 of 90 frames identical to blur off at 1080p and 5 of 5 at 4K,
    with float blending and with the ping-pong path; SwiftShader the same on 3 frames.
  - Labels tracked at clip time t, t/2 and a clamp: 180 of 180 frames identical with 8 samples; 32
    differ without the replay.
  - An undeclared clip switch: that frame comes out identical to blur off and `render.mjs` lists it;
    with `E.cut`, it blurs and its plate matches blur off.
  - A scene throwing inside a sample: the frame state comes back, and the next frame matches a clean
    run.
  - To rerun it, render frames through `window.renderFrame` with the old and the new engine and
    compare hashes; the vitest suites cover the planning, not the pixels.
- **Not covered:** camera moves made with `E.post` (punch, shake, rot) stay sharp, and roto
  materials or custom textures are not checked for stale clips.

## What the record does not cover

- The skill is the creator's own document, not distilled here, so it does not follow the house
  layout for recipe skills: its `references/lessons.md` plays the Common mistakes role.
- Costs are the production's observed relative prices, not live quotes.
- The engine and scripts need Node with Playwright, ffmpeg and a Python environment
  (`scripts/scaffold.sh` builds it); the matte tool needs macOS (Apple Vision).
- Tests cover the dependency-light scripts, the dynamism and rectify scripts on synthetic clips,
  `canvas.js`, `blur.js`, the clip and tracking logic in `core.js`, `render_lib.mjs` and
  `delivery_check.py`; the rest need the full environment and generated footage.
- The 4K path and motion blur were checked on synthetic projects only, not yet in a live application
  test.

## Supply chain

What the setup and analysis scripts fetch, and how each source is pinned:

- **npm**: exact direct versions and a v3 lock with integrity hashes, installed with
  `npm ci --ignore-scripts`.
- **Python**: `assets/python/<platform>.txt` pins every package, transitives included, by version
  and SHA-256, wheels only. Installing builds nothing, so no build backend or compiler toolchain is
  fetched. Each run rebuilds `.venv` from the lock alone, with no `ensurepip`, so no unlocked pip.
  Only macOS arm64 and Linux x86_64 (manylinux 2.28, so glibc 2.28+) have locks: on Linux aarch64,
  `demucs` needs `sphn`, which has no wheel there, and its source build fetched a Rust toolchain and
  failed.
- **beat-this**: PyPI 1.1.0. Its provenance attestation names CPJKU/beat_this commit
  `ad7974846029835307ba19a3d5cefbf40b243041` (tag v1.1.0), and the wheel's package files are
  identical to that commit. uv refuses a Git requirement in hash-checking mode, so the attested
  wheel is how the commit is pinned.
- **Fonts**: google/fonts at one commit. Each file the scaffold downloads, and its family's
  `OFL.txt`, is checked against SHA-256. A mismatch removes the download and stops the scaffold.
  Files already in `assets/fonts/` are kept as they are, unchecked.
- **beat_this checkpoint**: `audio_analysis.py` downloads `final0` once into `models/`, checks its
  SHA-256 on every run, and passes the local path, which beat_this loads with `weights_only`. Given
  only the name, beat_this would fetch it unverified and unpickle it.
- **Whisper**: `lyrics_align.py` loads `Systran/faster-whisper-large-v3` at a fixed Hugging Face
  commit.

Regenerate the locks after any change to `requirements.in`, with uv 0.13.0: run the command in each
lock's header, moving `--exclude-newer` to the date you resolve on. The offline checks in
`tests/scenario-kinetic-music-video/test_python_lock.py` run in `pnpm test`.
`.github/workflows/kinetic-locks.yml` re-resolves both Python locks to prove they reproduce, then
installs each on its platform and imports the tools' modules. It also installs the npm lock with
`npm ci --ignore-scripts` and imports its three packages.

Verified on 2026-10-29, with no Scenario calls:

- The real scaffold ran in a `node:22-bookworm` container (linux/amd64, uv 0.13.0) and natively on
  macOS arm64: fonts, licenses, `npm ci`, the hashed Python install, every import, and
  `audio_analysis.py` on a synthetic 120 BPM click track (read back as 120 BPM).
- A tampered checkpoint was rejected and removed. The test suites cover a tampered font.
- The scaffold's test suite checks the platform choice, the hashed wheels-only install, and that a
  font mismatch installs nothing.

Remaining gaps:

- `uv venv --python 3.11` downloads a managed CPython when none is installed. uv verifies it against
  checksums built into uv, but uv itself, Node, npm, ffmpeg, Chrome, and swiftc are the user's.
- Demucs downloads `htdemucs` weights from `dl.fbaipublicfiles.com`, checked only against the short
  hash prefix in the file name, then unpickles them.
- The Whisper commit pins which files are fetched; whether huggingface_hub verifies their content
  was not checked.
- MediaPipe's legacy solutions ship their models inside the hashed wheel; nothing else downloads at
  run time as far as the scripts show.
