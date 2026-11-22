# Emberfall: validation report

Date: 2026-09-08 · Build: working copy · Runtime: three@0.180.0, vite@7.1.5, postprocessing@6.39.4

## Checks

| Check | Method | Result | Evidence |
| --- | --- | --- | --- |
| Build succeeds | `pnpm build` | pass | `dist/assets/index-DdR4paXG.js 851.70 kB │ gzip: 221.51 kB ✓ built in 619ms` |
| Unit tests | none written | not run | no test suite in this artifact |
| Console clean | `capture.py` console + pageerror listeners | 0 console errors, 0 page errors | `captures/capture-log.json` |
| All authored views render | `capture.py --all-views` | 5 views + default, all `applied: true` | `captures/{overview,beacon,lane,millpond,terraces}.png` |
| Selection by list button | `--click "#pick-mill"`, `--click "#pick-beacon"` | panel fills with the model row, button `aria-pressed`, camera tweens in | `captures/click-0-pick-mill.png`, `captures/click-1-pick-beacon.png` |
| Pause control changes state | `--click "#control"` | label becomes "Resume motion" | `captures/click-2-control.png` |
| Reset restores home view + clears selection | `--click "#reset"` | framing matches `overview`, ring gone, panel back to empty state | `captures/click-3-reset.png` |
| Anti-slop checklist | `checklists/visual-anti-slop.md`, read against the captures | 13/14 hold; #4 partly fails in the `beacon` view | `design-system.md` §9 |
| Per-frame inspection | `checklists/inspection-per-frame.md` | 2 issues remain, see below | this file |
| Reduced motion | not emulated | not run | Chromium was launched with default preferences; the code path (`matchMedia` starts `paused = true`) was not observed |
| Frame time | not measured | not measured | no instrumentation added |

## What ran

1. `python3 scripts/search.py` and `scripts/resolve.py` for the style, lighting, theme, recipe,
   reasoning and interaction records listed in `scene-spec.json`.
2. `pnpm install` (three 0.180.0, vite 7.1.5, postprocessing 6.39.4), then `pnpm build`.
3. `capture.py --dir dist --all-views --settle-ms 1300 --click "#pick-mill" --click "#pick-beacon"
   --click "#control" --click "#reset" --out captures`, three times: once on the first build and
   once after each of two fix passes. Headless Chromium via Playwright, 1280x720, macOS arm64.
   All nine PNGs from the final run were opened and looked at.

## What was observed

**First pass.** The frame was one orange field: the lighting record's fog density of 0.02, honest
for a 20 m subject, erased every depth layer across a 62 m village. Three of five authored views
were inside or behind a building, the mill wheel's axle ran parallel to the wall instead of into
it, and the beacon's spiral stair read as planks floating off the tapering stump.

**Fix pass 1** (fog 0.0062, five views recomposed, emissive intensities lowered so the crown and
forge stopped clipping to white, buildings bedded into the slope rather than perched on tall
plinths, timber braces and ground sills added to the wall kit): depth layers separated, the
terraces and lanes became legible, the store on its staddle stones read from the west.

**Fix pass 2** (wheel rotated so the axle enters the wall, the beacon's helix replaced with a
straight keeper's stair, the landmark given a 15 m tree-free clearing, hemisphere fill 0.5 -> 0.8,
ground banding softened, selection focus approaching from outside the village): the wheel now
reads as a wheel dipping into the pond (`millpond.png`); the stump reads as a stump with a stair
(`overview.png`); tree silhouettes are shaded green rather than holes.

**What the final captures show.** `overview.png`: the whole settlement, lanes visibly reaching every
entrance, the beacon the brightest mass in frame, three depth layers (foreground mill, midground
terraces, far ridge). `terraces.png`: the Dry Store's lifted floor, hoist beam, pulley and ladder,
with the smithy flue and the hall's lit porch behind. `millpond.png`: the wheel face-on in the
water, reeds only at the waterline. `click-1-pick-beacon.png`: the crown, the ember stones and the
moths, with the panel showing that building's program, inputs and outputs.

## What is uncertain

- **Two weak views.** `beacon.png` looks at the stump's shaded north face, so the hero is a dark
  mass with only its crown bright - honest for a backlit dusk, but it fails anti-slop #4 in that
  one frame. `lane.png` sits close enough to a waymarker mushroom and the loft's eaves that both
  crowd the frame. Both are camera placements, not scene defects; the fix budget for this run was
  spent. A third pass would move `beacon` to the south-west (the stair side) and pull `lane` back
  about 4 m.
- **Reduced motion was not observed.** The code starts paused when `prefers-reduced-motion` is set,
  but no capture was taken with that preference emulated.
- **Performance was not measured** on any machine, and no mobile or narrow layout was rendered; the
  CSS breakpoint at 780 px was not exercised.
- **Colour** was judged on one display from PNGs; nothing here was checked on a wide-gamut screen.
- No frame is reported here that was not opened.

## Captures

| File | View or action | Notes |
| --- | --- | --- |
| `captures/default.png` | first frame after `__sceneReady` | same as the home view |
| `captures/overview.png` | authored overview (home) | whole village, lanes, beacon |
| `captures/beacon.png` | landmark from the north | shaded face; known weakness |
| `captures/lane.png` | eye height on the spine lane | crowded foreground; known weakness |
| `captures/millpond.png` | mill and waterwheel | the wheel meets the water |
| `captures/terraces.png` | west side | store, smithy flue, hall porch, stepped ground |
| `captures/click-0-pick-mill.png` | after `#pick-mill` | mid-tween; panel filled |
| `captures/click-1-pick-beacon.png` | after `#pick-beacon` | crown, ember stones, moths |
| `captures/click-2-control.png` | after `#control` | label flipped to "Resume motion" |
| `captures/click-3-reset.png` | after `#reset` | home framing restored, selection cleared |
