# with-skill run 3 — checklist results

Artifact: **Threadwater Hollow**, `src/` (10 structures, felted wool, golden hour, river gorge).
Generated 2026-09-08 from the same prompt and constraints as runs 1 and 2, by an agent that had the
kit-step version of `SKILL.md`.

**Scale note (2026-09-09).** `visual-anti-slop.md` gained item 17 (surface on the hero) when the kit quality tiers landed, so it is now **17 items** and the two checklists total **30** (17 + 13). This scorecard was re-scored on the 30-item scale by re-reading its existing frames; nothing was regenerated and no other item's verdict changed. Earlier /29, /28 and /26 totals for this run are superseded.

Every PNG named below was opened. Self-graded, n=1 — see [`../README.md`](../README.md) for limits.

Grading conventions, applied identically to all four runs:
**Item-9 note (2026-09-09).** Anti-slop item 9 gained a lightness floor: the 45 % saturation cap applies to pixels at HSL **L ≥ 0.2** and to surfaces, not to sky or emissives. Item 9 below was re-read from the same frame under the new wording; no other item was re-read and nothing was regenerated.


- **n-a** means the item's prescribed toggle or sweep was not run in this grading pass. Not a pass.
- Hue families, saturation and hero contrast come from measurements on the canvas region of
  `overview.png`, not from impression.
- Item 4 fails for a run if it fails in *any* graded frame.
- Items 16 and 17 are counted on the run's own declared hero, at the closest frame available.
- The "unexplained opt-out is a defect" rule is charged once, in the README's docs row.

## visual-anti-slop.md (17 items) — 14 pass · 2 fail · 1 n-a

**Combined with `inspection-per-frame.md` (13): 23 pass · 4 fail · 3 n-a out of 30.**

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | No single PointLight as key | pass | `src/rigs/lighting-sun.js` — key is a `DirectionalLight` `#ffb46b` at 3.2 with a hemisphere fill and a rim; the lantern `PointLight`s are practicals. |
| 2 | No untinted white ambient | pass | `HemisphereLight` `#6f8fc9` over `#4a3a2a` at 0.5 (`src/docs/design-system.md` §1); no white ambient term. |
| 3 | Every light has a job | n-a | Light-removal test not run. |
| 4 | Hero at highest contrast | **fail** | Measured on `captures/overview.png`, not judged by eye: mean luminance of the far hill band **158.1**, Chandler's House wall 149.4, village green 141.9 — all brighter than the declared hero, Threadwater Mill, whose pale wall reads **135.5** and whose gable reads 105.8. The run's own validation report claims "the grayscale read puts the mill's lit gable and the tower shaft above the ground plane"; the measurement contradicts it. Heavy golden-hour haze on the hills is the cause. |
| 5 | Background never flat | pass | `captures/tower.png` — graded sky from deep blue at the zenith through a warm horizon band. |
| 6 | Fog and three depth layers | pass | `captures/overview.png` — lane props and stalls, mill and gorge, hill rim, separated by fog at 0.0072 (refitted from the record's 0.02, recorded in the report). |
| 7 | Scale cue in frame | pass | `captures/green.png` — a five-bay hall with doors, mullioned windows and sills at human size; `captures/overview.png` carries walking figures and livestock. `design-system.md` states the tower at 10.5 m and the bridge span at 6 m. |
| 8 | ≤3 hue families + accent | pass | Posterise-to-8 on the canvas: orange 81.2 %, blue 12.7 %, neutral 6.2 % — two chromatic families plus neutral, with the dyed `#e2725b` red as the accent. |
| 9 | Non-focal saturation ≤45 % (L ≥ 0.2) | **pass** | Re-read 2026-09-09 under the item's new lightness floor; the verdict does not move. Same posterise: **no band over 45 % S** (highest 34.5 %, `#c7ad8c`), and unlike the other four runs every band here sits **above** the floor (L 33.5–66.5 %), so the floor changes nothing about this frame. It was the only run to pass this item on the pre-floor wording; under the floor all five pass, so this is no longer a point of difference. |
| 10 | Bloom ≥1.0, emissives above | pass | Threshold 1.0 with only lantern paper and the marker pin authored above it (`design-system.md` §9). `captures/overview.png` — the street lanterns bloom; the lit plaster walls beside them do not. |
| 11 | Camera not dead-centre eye level | pass | Home view `[27, 21, 33]` → target `[0, 1.4, 0]`: raised three-quarter. (The `green` named view *is* a flat frontal elevation at near eye level — worth noting, but item 11 is graded on the home view for all four runs.) |
| 12 | FOV 35–50° | pass | 45°, and the opt-out reasoning is recorded in `design-system.md` §9. |
| 13 | ≥3 roughness values | pass | 59 values — though 58 of them sit inside 0.86–1.0 because wool has no gloss, with the river at 0.22 as the deliberate exception. The narrowness is declared as an opt-out rather than hidden. |
| 14 | No uniform grid or clones | pass | `captures/overview.png` — `kits/nature/{tree-round,tree-conifer,rock-cluster,reeds}.js` and `kits/primitives/roof-tile-strip.js` use `InstancedMesh` with per-instance jitter; the ten structures are individually planned onto plots. |
| 15 | Nothing that should move is frozen | pass | Both capture passes log `motion: {"interval_ms": 2000, "differs": true}`; `--expect-motion` exits 0. Four procedural walkers, the mill wheel, water and lantern flicker. Instrumented separately: 15 frames drawn in 3 s. |
| 16 | **Detail ladder on the hero** | **pass** | Counted by me on `captures/pick-mill-settled.png` and `captures/mill.png`, not taken from the report. **Silhouette 3:** the overshot wheel breaking the gable line, the launder/chute, the projecting hoist beam. **Medium 5:** recessed windows with visible wall thickness, the upper loading door, exposed frame timbers and braces, the wheel's rim + spokes + paddles, the stone base course. **Fine 3:** separate sill drip strips with their own thickness, lapped roof courses in relief, peg heads at the brace joints. Clears two per band in every band. The three counts are recorded — in `src/docs/validation-report.md` rather than in `design-system.md` as the item asks, with §9 of `design-system.md` pointing there; a minor deviation, not a miss. |
| 17 | **Surface on the hero** | **fail** | `captures/mill.png`, examined at 3x. The relief is real and modelled — lapped roof courses, frame timbers and braces, a plank door with iron straps and peg heads — which is what item 16 rewards. The **surfaces** are not: the plaster panel between the timbers is one flat cream value with no grain or weave despite the declared felted-wool look, the roof planes carry no tile texture between the modelled laps, and the darkening at every joint is face shading and cast shadow rather than occlusion. The project ships no texture map and no baked AO; a T1 hero fails this item by construction, as the item says. |

## inspection-per-frame.md — 9 pass · 2 fail · 2 n-a

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Console clean | pass | `captures/capture-log.json` — `console_errors: []`, `page_errors: []`, on both passes. |
| 2 | Horizon or sky present | pass | `captures/tower.png`, `captures/overview.png`. |
| 3 | Three depth layers | pass | `captures/overview.png` — see anti-slop 6. |
| 4 | Hero highest contrast | **fail** | See anti-slop 4; measured. |
| 5 | Labels readable at 1280×720 | **fail** | The page overflows the viewport again: measured `scrollHeight` **833** vs `innerHeight` 720, canvas 944×**833**. 113 px of the canvas and the bottom of the side panel sit below the fold, so every capture here is the top 720 px of a taller canvas — which is why `captures/mill.png` cuts the mill's base. Run 2 had solved this (720 = 720, panel scrolling internally); run 3 regresses to run 1's failure mode. |
| 6 | No z-fighting | n-a | Orbit sweep not run. No coplanar flicker in the eleven stills. |
| 7 | Hero not clipped by near plane | n-a | Zoom-to-`minDistance` test not run (kept n-a for all four runs so the scores stay comparable). |
| 8 | Nothing floats | pass | `captures/overview.png` — contact shadows under every building, stall, tree, figure and animal; the mill's base course meets the bank. |
| 9 | Scene is alive | pass | `--motion-check 2000 --expect-motion` exits 0, `differs: true`, on both the main and the uniform pass. |
| 10 | Controls change visible state | pass | Driven with Playwright, not read: `#pick-mill` sets `aria-pressed="true"`, fills the readout ("STONE MILL, OVERSHOT WHEEL…") and changes the frame; `#control` genuinely stops the scene (two frames 2.5 s apart identical while paused) and genuinely resumes it; `#reset` clears `aria-pressed`. Canvas picking works — clicking the canvas selected "Dyer's Cottage" with its full readout. |
| 11 | Reset restores the home view | pass | `captures/click-1-reset.png` reproduces `captures/overview.png` framing exactly, marker gone, panel back to its hint. `#reset` sits above the fold here, so unlike run 1 no page scroll was needed to reach it. |
| 12 | Reduced motion respected | pass | Emulated with Playwright `reduced_motion="reduce"`: two frames 2.5 s apart byte-identical, scene readable, and `#control` resumes it. |
| 13 | Frame time noted | pass | Measured here: **4,773 GL draw calls per frame**, 15 frames in 3 s (**≈5.0 fps**) at 1280×720, macOS arm64, headless Chromium, SwiftShader. The artifact's own report independently measured 219 ms median / 232 ms p95 and labelled it software-rendered. This is the worst cost of the four runs by a wide margin — see below. |

## Prompt requirement (covered by items 15 and 9, not counted twice)

| Requirement | Result | Evidence |
| --- | --- | --- |
| "add a few moving creatures" | **pass** | Four procedural walkers (bipeds and quadrupeds from `kits/creatures/`), plus the mill wheel and water. Verified at runtime by the liveness check, not by reading source. |

## Documents shipped with the artifact

`src/docs/design-system.md` (look statement, two named source records, a departure table, and a §9
that records three deliberate opt-outs by item number), `src/docs/scene-spec.json`,
`src/docs/validation-report.md` (five named defects found and fixed during the run, the detail-ladder
counts, a frame-time measurement labelled as software-rendered), and `src/README.md`. **No tests** —
the third with-skill run in a row to write none.

The look is traceable to `knowledge.style-felt-wool` and `knowledge.lighting-mood-dusk-golden-hour`,
with kit blueprints named (timber-cottage, long-hall, market-stall, round-tower, watermill,
stone-bridge). The felt conceit is executed by one material pass (`src/felt-material-pass.js`)
rather than per-object, which is the cleanest look-implementation of the four runs.

## Where this run is weak

- **Cost.** 4,773 draw calls per frame and 5 fps under SwiftShader — 7× run 2's 687 and 2.5× the
  baseline's 1,928. The kit approach buys the detail ladder and pays for it here; nothing in the
  artifact's own report notices the draw-call count.
- **Layout regression.** 833 px of page in a 720 px window, undoing run 2's fix.
- **Hero contrast is a measured failure**, and the run's own report asserts the opposite. That is the
  one place its self-inspection overclaims.
- **Heavy haze.** Fog was refitted from 0.02 to 0.0072 during the run, but the overview still washes
  the mid-ground; the hills are brighter than the village.
- **The `green` named view is a flat frontal elevation** at near eye level — a documentation shot
  rather than a composed frame.
