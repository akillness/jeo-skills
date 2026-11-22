# Scene-agent brief (template)

Copy this to `AGENTS_BRIEF.md` in the project and fill in the `<…>` parts. Delete lines that don't
apply (for example the footage sections in an all-graphics video). Each scene agent gets a short
prompt: its section, times, lyrics, must-have ideas and clips, and an instruction to read this brief
first.

---

You are one of <N> motion designers. Each of you builds one section of a <duration> music video for
"<song>" by <artist>. It is rendered entirely in JavaScript (three.js + Canvas2D) by a deterministic
frame-stepping engine at 1080p60 on a <landscape 1920×1080 | portrait 1080×1920> canvas<, over
AI-generated footage of <subject>>.<If both ratios ship: your scene renders on both canvases, or the
lead gives you a portrait twin file.>

**The director's brief, in their words:** "<paste the key adjectives and asks: energy, pace, looks,
what to avoid>". Treat this as your showreel.

## Read first (in this order)

1. `STYLE.md`: the law (looks, palette, type, motion grammar, footage rules, bans).
2. `TREATMENT.md`: your section, its lyrics and must-haves, and the footage map.
3. `ENGINE_API.md`: the full API.
4. `analysis/research_*.md`: the technique library with timings, and the verified facts and strings
   for inserts. Only use verified numbers.
5. Your clips:
   `ffmpeg -i assets/clips/<clip>.mp4 -vf fps=4,scale=320:-2,tile=6x4 -frames:v 1 out/<id>/sheet_<clip>.jpg`,
   then Read it. Also look at one matte (`assets/video/<clip>/m_00050.png`).
6. `engine/scenes/_template.js` (and the lead's `_smoke.js`, if present): a working example of plate
   → type behind the subject → matte → tracked label.

## Ownership

- You own ONLY `engine/scenes/<id>.js`, plus an optional `engine/scenes/<id>/` helper folder and
  `assets/<id>/` for generated data.
- Don't edit `engine/main.js`, `canvas.js`, `core.js`, `plate.js`, `typekit.js`, `roto.js`,
  `timeline.js`, `scenes/hud.js` or anyone else's files. If you hit an engine bug, work around it
  locally and report it.
- **Deterministic only:** no `Math.random`, `Date`, `performance.now` or rAF timing. Use
  `E.rng(seed)`, `E.hash1`, `E.noise1/2`.
- **Performance:** at most ~35 ms per frame at 1080p. Cache in `load()`, at most 2 full-res 2D
  canvases redrawn per frame, and no allocation in hot loops.
- Don't generate new AI footage or images unless the lead asks. Procedural textures in code are
  fine.

## Footage rules

- **Footage is shown clean**: `E.drawPlate` only. No filter, glow, grain, outline, halftone, tint or
  grade on the subject's pixels. You may reframe, crop, mirror, cut, speed-ramp, mask into shapes,
  tile, or put the plate on a 3D card.
- **Plate fit per canvas:** draw every plate with `fit: E.plateFit(E, v)` (same options in
  `plateToScreen`), so a clip whose shape differs from the canvas is windowed, never cover-cropped
  to fill.
- **Integration:** every footage moment needs at least one graphic that is tracked to the subject,
  timed to its motion, continues a line or shape in the plate, or sits behind it via the matte. A
  plain "video + caption" is a failure.
- **Never a frozen frame.** Keep `localT` inside the clip's duration. Slot clips (lip-sync,
  beat-guided dances) use `local = t − slot` and aren't shifted; other clips can use any offset.
- **Never cover the face** during lip-sync. MID-layer type behind the subject must stay readable, so
  move it if a key letter is hidden.
- No cut-off heads (except a deliberate face ECU), and give full-body shots room.
- Clips: <clip · slot · one-line content with key moments in clip seconds · matte quality>.

## Lyric rules

- **Every word visible.** Every sung word is on screen at its onset, either as a designed hero or in
  the HUD subtitle (on by default). Set `E.hud.sub=false` only while you show the full line.
- **Impact on the onset.** The impact frame is `w.s`. Anticipation starts at most 4 frames earlier,
  and nothing lands late.
- **Hold until at least `w.e`.** Exit 3× faster than the entry, or hard-cut on the next beat.
- **Hierarchy:** 1-3 hero words per line. Never use the same type treatment on two consecutive
  lines.

## Motion rules

- Springs with overshoot for pops, ease-out for arrivals, in-out for morphs, linear only for
  counters and progress. UI never scales from 0.
- Kicks drive camera punch or shape hits, snares drive color or shape events, vocals drive type,
  bass drives glow. Use only 1-2 sync layers per moment.
- Cut density follows the section's energy in TREATMENT.md. A designed event lands on every beat.
- At least one "how did they do that" moment per section: type behind the subject, a line that
  leaves the footage and becomes type, a 3D object that comes out of a 2D drawing, a match cut on
  shape, or a tile explosion.
- Set `E.hud.theme` for your look (`'light'` on white or color frames).
- **Cuts and motion blur:** in `load()`, register every hard switch inside your section with
  `E.cut(t)`, and slams or whips with `E.fast` or `E.shutter` (ENGINE_API.md, Motion blur). Keep
  `render()` free of state between calls; it runs once per blur sample.
- **Lay out from `E.W`, `E.H` and `E.SAFE`,** never from 1920 or 1080 constants. On a portrait
  canvas, every word, logo and face stays inside `E.SAFE` (`motion_library.md` §10).

## Tools (run from the project root)

- **Stills and sheet:**
  `node tools/still.mjs --only <id>,hud --range <a>:<b>:<step> --scale 0.5 --dir out/<id>/it1 --sheet sheet --cols 4`,
  then Read the sheet. Use `--t 1.2,3.4` for exact times.
- **Preview with audio:**
  `node tools/render.mjs --only <id>,hud --from <a> --to <b> --fps 30 --scale 0.5 --out out/<id>/preview.mp4 --force`.
- **Perf:**
  `node tools/render.mjs --only <id> --from <a> --to <a+2> --fps 60 --scale 1 --out out/<id>/perf.mp4 --force`,
  and read the printed fps (it includes motion blur when the project has it on).
- **Freeze check:**
  `ffmpeg -i out/<id>/preview.mp4 -vf "freezedetect=n=0.003:d=0.25" -map 0:v -f null - 2>&1 | grep freeze_`.
- **Dynamism check:**
  `.venv/bin/python tools/dynamism_check.py gate out/<id>/preview.mp4 --only <id> --start <a>`: your
  section against its energy's targets and the flash limit (exit 0).
- A process boot takes about 10 s, so batch many times into one still call. Other agents render at
  the same time, so stay at scale 0.5 except for final checks.

## Required verification loop

1. **Plan first.** Write a beat-by-beat plan as a comment block at the top of your file: each lyric
   word with its onset (from `engine/data/lyrics.json`), the visual event, the layer
   (back/mid/front), and where each cut lands (from `engine/data/audio.json`).
2. **Build, then contact-sheet** the whole section at 0.25 s steps and critique it.
3. **Onset check:** stills at `w.s + 0.03` for every hero word (legible and at its peak) and at
   `w.s − 0.10` (not fully in yet).
4. **Preview mp4** at 30 fps with audio. Confirm the cuts land on beat frames, and run the freeze
   and dynamism checks.
5. **Iterate at least 3 times on the look:**
   - Would a top motion designer repost this?
   - Is there one focal point?
   - Is the face clear and the footage untouched?
   - Is the type hierarchy strong?
   - Is it too empty, too busy, or generic?
6. **Boundaries:** the first frame is a hard cut in and must be striking. Check the first and last 3
   frames.
7. **Safe band** (portrait canvas, or both ratios): a sheet with `--safe` (and `--canvas portrait`
   when the project's canvas is landscape). Nothing that must read sits outside the dashed band.

## Final report (to the lead)

- What you built, moment by moment (time → visual → layer), and which footage you used.
- Measured 1080p fps.
- Paths to your 4 best full-res stills (`--scale 1`).
- Engine issues, lyric-timing doubts, and freeze- and dynamism-check results.
