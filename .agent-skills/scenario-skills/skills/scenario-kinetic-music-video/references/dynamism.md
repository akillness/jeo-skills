# Dynamism: measured gates and reference numbers

The eye adapts to holds after a few watches; the numbers do not. `tools/dynamism_check.py` measures
a render section by section against targets for each section's energy, and measures the user's
references so those targets come from them.

## Contents

1. [What it measures](#1-what-it-measures)
2. [Section energy](#2-section-energy)
3. [Targets](#3-targets)
4. [The gate](#4-the-gate)
5. [Measuring a reference](#5-measuring-a-reference)
6. [Flattening a phone-filmed screen](#6-flattening-a-phone-filmed-screen)
7. [Reading a failure](#7-reading-a-failure)

## 1. What it measures

Every input is resampled to a 60 fps clock and read at 320 px on its long side.

- **still**: a frame belongs to a run longer than 0.1 s in which nothing visibly changes. Each frame
  of the run differs from the one before and from the run's first frame on under 1.5% of its pixels
  (a gray difference over 12 of 255). At that size, its mean optical flow stays under 1 px from the
  frame before and under 0.25 px from the run's first frame.
- **still share**: the share of a section's frames that are still.
- **longest hold**: the longest run of still frames, to the frame.
- **median motion**: optical flow between consecutive distinct frames, averaged over textured or
  changing pixels, in px per 1/60 s on a 1920 px long side. Each value is a 0.5 s mean; the section
  reports their median.
- **cuts**: a change that neither the flow nor a whole-frame shift explains, over most of the frame
  or between frames that barely correlate (hard cuts, flashes, color swaps). A flash in and out is
  one cut: a cut back to the previous shot within 0.15 s does not count. Reported per 10 s and per
  bar (from `downbeats`).
- **flashes**: WCAG 2.x general flashes. A flash is a pair of opposing changes in the frame's mean
  relative luminance of 0.10 or more, where the darker state is under 0.80.

Why this method:

- A 24 fps clip in a 60 fps render repeats each frame 2 or 3 times, and more under a beat-warp
  slowdown. Compared frame to frame, it reads as mostly still. Repeated frames add no motion, and
  each 0.5 s window spans whole 24, 25 and 30 fps cycles, so footage and 60 fps graphics read on one
  scale.
- A faster move reads higher, never lower: a whip pan beyond the flow's range is measured as one
  whole-frame shift.
- A 1-frame glitch alternation or a shake never reads as still, since every step of it changes.
- A slow drift or push-in adds up from the run's first frame, so a move at a motion floor reads as
  moving, at 60 fps or as 24 or 25 fps footage. Grain on a hold does not add up, and the hold stays
  still.
- The frame mean catches full-frame flashes only. A flash on a small area passes unmeasured.

## 2. Section energy

- At each instant, the section is the lowest-`z` `TIMELINE` entry the engine draws there (a missing
  `z` counts as 0), in `engine/timeline.js`:
  - on the video's canvas, read from its shape, and the `--variant` (default `a`), as `main.js`
    filters them;
  - an entry covered everywhere by a lower one (a lyrics layer, a flash overlay) is never a section;
  - the HUD and entries ending at 9999 or later never are.
- `--only id,id` judges only those entries and skips the variant filter, as `render.mjs --only`
  does.
- Each entry may set `energy`, by the section's role in the song, never by a word describing it (an
  intro that builds is still `calm`):
  - `calm`: intro, verse, breakdown, a bridge that breathes on a long shot;
  - `mid`: pre-chorus, a second verse with footage;
  - `high`: chorus, drop, a build into a drop, chant;
  - `showcase`: a logo build, an end card, a character turn at 0.35-0.5× speed.
- An outro is `mid`, or `high` when it reprises the chorus at full arrangement. Split an end card
  inside it into its own `showcase` entry, with `file` naming the same scene.
- An untagged section takes its energy from the song: its mean `env.mix` in `audio.json` against the
  song's mean. Under 0.8 is calm, 1.15 or more is high, the rest is mid.
- A section that starts after the song ends (a silent extended end card) is `showcase`.
- The table prints where each energy came from (`timeline`, `span` or `audio`). Tag the entry when a
  guess is wrong.

## 3. Targets

Defaults, authoring-time starting points that no full production has calibrated yet:

| energy   | still share, max | longest hold, max | median motion, min |
| -------- | ---------------- | ----------------- | ------------------ |
| calm     | 50%              | 1.0 s             | 0.5                |
| mid      | 30%              | 1.0 s             | 1.0                |
| high     | 15%              | 0.5 s             | 2.0                |
| showcase | reported         | reported          | reported           |

- Everywhere, showcase and end card included: at most 3 flashes in any 1 s window.
- Cut density is reported, never failed. The gate warns when the mean cuts per bar does not climb
  from calm to mid to high.
- A passing gate never clears frozen footage under moving type: the frame-wide numbers miss it.
  `freezedetect` and the contact sheets still run.
- `analysis/targets.json`, when present, replaces defaults key by key, so the references set the
  bar. A key it omits keeps its default; `from` records each energy's source:

```json
{
  "high": { "still_max": 0.12, "hold_max_s": 0.45, "motion_min": 3.1 },
  "calm": { "hold_max_s": 1.2 },
  "from": { "high": "assets/refs/ref_a.mp4: chorus 45-62 s", "calm": "set by hand" }
}
```

## 4. The gate

```bash
.venv/bin/python tools/dynamism_check.py gate out/final/v1.mp4 --json out/final/v1_dynamism.json
.venv/bin/python tools/dynamism_check.py gate out/<id>/preview.mp4 --only <id> --start <a>   # a scene agent's preview
```

- Run it from the project root. It reads `engine/timeline.js` (through `node`) and
  `engine/data/audio.json`.
- `--start` is the song time of the video's first frame, as for a `render.mjs --from` render. Spans,
  holds and the JSON's times are all song times.
- Sections are clipped to the video. One with under 1 s left is reported, not judged. A stretch no
  section covers prints a `WARN gap`.
- `--span id=a:b[:energy]`, repeated, replaces the timeline sections.
- `--targets <file>` replaces `analysis/targets.json`.
- `--sheets <dir>` writes a 10 fps contact sheet of each failing hold, and of the second with the
  most flashes when the flash limit fails.
- `--json <file>` holds per-section metrics, every hold over 0.3 s with its bar and beat, every
  flash change, a per-second series and the method's thresholds.
- Missing folders for `--json` and `--sheets` are made. An existing `--json` or a non-empty
  `--sheets` needs `--force`, and a path it cannot write is refused, both before decoding.
- Exit 0: every judged section and the flash limit pass, warnings allowed. Exit 1: a gate failed.
  Exit 2: bad input (no video, no frames, no sections, an unknown energy or canvas tag) or a refused
  output.
- Gate every delivered render: each canvas and each variant (`--variant b`). A windowed plate fills
  about a third of a portrait frame, so the same motion changes less of it.
- A 30 fps half-scale preview reads like its master, but a flash shorter than 1/30 s exists only in
  the 60 fps master.
- On exit 1, fix the section and re-gate, with `--force` to replace the JSON. Unattended, stop after
  3 fix-and-re-gate rounds on a section, or when the next fix would pass the budget. Deliver and
  list the failing sections in the report.

## 5. Measuring a reference

The Craft agent in step 2 measures each motion reference the user gives:

1. Download it into `assets/refs/`. A phone filming a screen is flattened first (§6).
2. Find its sections by watching it, then measure them, naming each span's energy:
   `.venv/bin/python tools/dynamism_check.py measure assets/refs/ref_a.mp4 --span verse=12:30:calm --span chorus=45:62:high --write-targets analysis/targets.json --json analysis/refs/ref_a.json --sheets analysis/refs/ref_a`
   - Label each span with the energy of the user's song section it stands in for (verse, pre-chorus,
     chorus, drop: §2), never by how busy it looks.
3. Read the busiest and calmest sheets beside the numbers: they show what "fast" means there.
4. `--write-targets` writes each energy's targets from the loosest of its spans:
   - `still_max`: the still share plus 0.10;
   - `hold_max_s`: the longest hold times 1.25, at least 0.3 s;
   - `motion_min`: 0.7 times the median motion;
   - `from`: per energy, the reference and spans used.
5. A second reference adds its energies to the file. Replacing an energy already there needs
   `--force`.
6. Copy the numbers into `analysis/research_craft.md` next to the moves, so scene agents see them.

- `measure` never fails a video, and its times are video times.
- `WARN targets out of order` names each pair of energies where a target the gate will use loosens
  from calm to mid to high: `motion_min` falls, or `still_max` or `hold_max_s` rises. A key the file
  omits counts at its default (§3), marked `(default)`. Check the span labels first. When they hold,
  measure other spans for that energy, or set the key by hand.
- Burnt-in captions and platform UI count as motion. Keep them out with `--crop W:H:X:Y`.
- Take the register from a reference, never its frames, logo or script.

## 6. Flattening a phone-filmed screen

A phone filming a screen measures the hand, not the screen. `tools/rectify_screen.py` tracks the
camera on the static room around the screen and warps the screen flat:

```bash
.venv/bin/python tools/rectify_screen.py assets/refs/phone_a.mp4 assets/refs/ref_a.mp4 --check analysis/refs/ref_a_quad.jpg
```

- It finds the screen as the brightest changing quadrilateral over the 0.2 s after `--at` (default
  0), and prints the corners (top left, top right, bottom right, bottom left).
- Read the `--check` image: the frame at `--at` with the outline it found, beside that frame
  flattened. It is written before tracking, so a failed run leaves it too. When the outline misses a
  corner, or no screen is found, rerun with `--quad "x,y x,y x,y x,y"` read off that image and
  `--force`, which replaces the first run's files.
- A video inside the screen with black bars (a vertical video on a laptop, a letterboxed film): quad
  the video itself, not the whole screen.
- Black bars around the whole recording (a landscape clip posted as a vertical video) are skipped.
  Corners stay in pixels of the full frame, as the `--check` image shows them.
- `--band y0:y1` keeps a burnt-in caption band out of the tracking.
- The output is 1280x720, or 720x1280 for a tall screen, at `--fps` (default 30), from `--from` to
  `--to`. `--size WxH` overrides the size.
- It prints the share of frames it tracked. Under 80%, the room has too little texture or the screen
  fills the frame: flatten a steadier stretch.
- On a synthetic handheld clip, motion read off the flattened screen came within about 40% of the
  true content (reading high); read off the raw phone video, it came to under a third.

## 7. Reading a failure

- **A hold in a footage section:** a clip ran out, or a slot clip waits for its slot. Footage always
  plays live (`lessons.md`, direction defaults).
- **High still share in a type section:** words land and park. Keep them alive with a slow scale, a
  slide or a camera drift (`motion_library.md` §7).
- **A still lip-sync shot:** only the mouth moves, under 1.5% of the frame. Give the prompt a camera
  move, set a graphic on the vocal envelope beside the face, or cut the shot shorter.
- **Low motion in a high section:** the moves are too small for the energy. Raise the camera move or
  the cut density (`motion_library.md` §8); never add effects to the footage.
- **Flashes over the limit:** full-frame flashes on every 8th or 16th. Flash a shape, a word or a
  band instead, or swap between grounds of similar luminance.
- Fix the scene, re-render its range, and gate the preview with `--only` and `--start` before the
  full render.
