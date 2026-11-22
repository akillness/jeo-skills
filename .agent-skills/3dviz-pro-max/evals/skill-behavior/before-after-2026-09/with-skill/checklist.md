# with-skill run 1 — checklist results

Artifact: **Emberfall**, `src/` (8 buildings, terraced hillside, dusk). Generated 2026-09-08,
*before* the scaffold fix. Graded against
[`visual-anti-slop.md`](../../../../skills/3dviz-pro-max/templates/checklists/visual-anti-slop.md)
(17 items) and
[`inspection-per-frame.md`](../../../../skills/3dviz-pro-max/templates/checklists/inspection-per-frame.md)
(13 items). Both lists gained a motion/liveness item after this run exposed the gap; this scorecard
was re-scored against the current lists so all three runs sit on one scale. Every PNG named below
was opened. Self-graded, n=1 — see [`../README.md`](../README.md) for limits.

**Scale note (2026-09-09).**
**Item-9 note (2026-09-09).** Anti-slop item 9 gained a lightness floor: the 45 % saturation cap applies to pixels at HSL **L ≥ 0.2** and to surfaces, not to sky or emissives. Item 9 below was re-read from the same frame under the new wording; no other item was re-read and nothing was regenerated.
 `visual-anti-slop.md` gained item 17 (surface on the hero) when the kit quality tiers landed, so it is now **17 items** and the two checklists total **30** (17 + 13). This scorecard was re-scored on the 30-item scale by re-reading its existing frames; nothing was regenerated and no other item's verdict changed. Earlier /29, /28 and /26 totals for this run are superseded.

Grading conventions, applied identically to all three runs:

- **n-a** means the item's prescribed toggle or sweep was not run in this grading pass. Not a pass.
- Hue families and saturation come from the checklist's own posterise-to-eight test on the canvas
  region of `overview.png`, not from impression.
- Item 4 fails for a run if it fails in *any* graded frame.
- Items 16 and 17 are counted on the run's own declared hero, at the closest frame available.
- The "unexplained opt-out is a defect" rule is charged once, in the README's docs row.

## visual-anti-slop.md (17 items) — 12 pass · 4 fail · 1 n-a

**Combined with `inspection-per-frame.md` (13): 19 pass · 8 fail · 3 n-a out of 30.**

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | No single PointLight as key | pass | `src/rigs/lighting-sun.js` — key is a `DirectionalLight` (3.2) with a hemisphere fill and a rim; no `PointLight` in the project. |
| 2 | No untinted white ambient | pass | Hemisphere is sky `#6f8fc9` over ground `#5c4a38` (`src/rigs/lighting-sun.js`, ground overridden in `src/main.js`), `environmentIntensity` 0.25; no `#ffffff` ambient term. |
| 3 | Every light has a job | n-a | Light-removal test not run. |
| 4 | Hero at highest contrast | **fail** | `captures/beacon.png` — the beacon stump is a near-black mass filling the frame; the brightest region is the sky band behind it. The run's own `src/docs/validation-report.md` concedes this item. |
| 5 | Background never flat | pass | `captures/overview.png` — vertical gradient from dusk blue at the zenith to a warm horizon band; `src/scene.js` builds it as a `CanvasTexture`. |
| 6 | Fog and three depth layers | pass | `captures/terraces.png` — foreground cottage, midground store and smithy flue, far ridge washed to the horizon colour by `FogExp2` 0.0062. |
| 7 | Scale cue in frame | pass | `captures/terraces.png` — ladder, hoist beam and fence line; `src/docs/design-system.md` states doors 2.0 m, fox-folk 1.5 m, mill wheel 4.4 m. |
| 8 | ≤3 hue families + accent | pass | Posterise-to-8 on the canvas: orange 79.9 %, blue 12.0 %, yellow 8.1 % — three families, ember as the accent. |
| 9 | Non-focal saturation ≤45 % (L ≥ 0.2) | **pass** | Re-read 2026-09-09 under the item's new lightness floor. The band charged before, `#29210f` at 46.4 % S, sits at **11.0 % L** — below the floor, so it is reported and not charged. The re-read of the shipped PNG does not reproduce any band over the cap at all (highest **42.9 %**, `#5f4426`, at 26.1 % L; the drift from the published figure is the 256-colour re-encode). Was a **fail** on the pre-floor wording, and the narrowest of the four. |
| 10 | Bloom ≥1.0, emissives above | pass | `src/main.js` `LOOK.post.bloom` threshold 1.0 / strength 0.3 / radius 0.7; `captures/lane.png` — the mushroom lamp blooms, the plaster wall beside it does not. |
| 11 | Camera not dead-centre eye level | pass | `src/main.js` overview `[30, 24, 40]` → target `[-1, 6, 0]`: raised three-quarter, off-centre target. |
| 12 | FOV 35–50° | pass | `LOOK.camera.fovDeg = 40`. |
| 13 | ≥3 roughness values | pass | `src/materials.js` — 16 distinct roughness values (0.11 … 1.0). |
| 14 | No uniform grid or clones | pass | `captures/terraces.png` — `src/scatter.js` / `src/lanes.js` use `InstancedMesh` with per-instance position, rotation and hue jitter; the eight buildings differ by program, not by clone. |
| 15 | **Nothing that should move is frozen** | **fail** | `captures-uniform/capture-log.json` → `motion: {"interval_ms": 2000, "differs": false}` with identical `sha_before`/`sha_after` (`f327200d1cac…`); `capture.py --expect-motion` exits 5 with "Frames 2000 ms apart are identical; the scene is frozen". `captures-uniform/default.png` and `default-motion.png` are the same bytes. |
| 16 | **Detail ladder on the hero** | **fail** | Counted on `captures/beacon.png`, the run's declared hero. **Silhouette 2:** tapered stump, glowing crown. **Medium 3:** vertical slot openings, two platform ledges, the stair poles. **Fine 0:** an untextured near-black cone — no bevels, no edge wear, no per-instance variation. Fine band empty. The item postdates this run, so no counts are recorded in its `design-system.md`. |
| 17 | **Surface on the hero** | **fail** | `captures/beacon.png`, examined at 3x: the Ember Beacon is a near-black cone carrying a single albedo. The vertical slots and the two ledges are geometry, not surface — no grain, tile, weave or grit, no texture map anywhere in the project, and no darkening where the ledges meet the shaft. Only the ground shadow reads. A T1 hero by construction. The item postdates this run. |

## inspection-per-frame.md — 7 pass · 4 fail · 2 n-a

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Console clean | pass | `captures/capture-log.json` — `console_errors: []`, `page_errors: []`. |
| 2 | Horizon or sky present | pass | `captures/overview.png` — gradient sky and a visible horizon band. |
| 3 | Three depth layers | pass | `captures/terraces.png` — see anti-slop 6. |
| 4 | Hero highest contrast | **fail** | `captures/beacon.png` — see anti-slop 4. |
| 5 | Labels readable at 1280×720 | **fail** | The page overflows the viewport: measured `scrollHeight` 780 vs `innerHeight` 720, canvas 928×780 in a 1280×720 window. `captures/overview.png` cuts the panel's closing note mid-sentence ("Invented place. Nothing here is a historical or"), and `captures/click-1-reset.png` is a scrolled *page* — the canvas itself moves — because `#reset` sits below the fold. |
| 6 | No z-fighting | n-a | Orbit sweep not run (and not runnable here — see item 9). No coplanar flicker in the nine stills. |
| 7 | Hero not clipped by near plane | n-a | Zoom-to-`minDistance` test not run (kept n-a for all three runs so the scores stay comparable); here it is also not runnable, since the camera does not respond to pointer input. |
| 8 | Nothing floats | pass | `captures/terraces.png` — contact shadows under every building, tree and mushroom; buildings are bedded into the slope. |
| 9 | **Scene is alive** | **fail** | 17 animated actors are authored (3 residents on routes, 9 moths, 5 smoke puffs in `src/creatures.js`) and **none ever move.** `capture.py --motion-check 2000 --expect-motion` exits 5 with identical hashes; three separate 9 s sessions produced byte-identical frames; a wrapped `requestAnimationFrame` counted 0 frames after start-up; a 20-step pointer drag across the canvas changed nothing. Root cause in `src/main.js`: `createRenderLoop` sets `elapsed = previous === null ? 0 : …`, so the first frame after idle carries `dt = 0`, `creatures.update(0)` returns `false` (`src/creatures.js:124`) and the loop parks again — and `createCameraRig` is never handed an `invalidate`, so `OrbitControls` cannot wake it. A logic defect, not a headless artefact. |
| 10 | Controls change visible state | **fail** | Mixed, and the item fails on the mix. `captures/click-0-pick-mill.png` differs from `overview.png` and fills the panel; `#reset` restores the home framing. But `#control` ("Pause motion") only flips its own label — the scene draws no frames after start-up, so there is no motion to pause. Canvas picking exists in `src/selection.js` but cannot be exercised, because pointer input produces no redraw. |
| 11 | Reset restores the home view | pass | `captures/click-1-reset.png` reproduces the `overview.png` framing (same beacon, chimney and mill-wheel placement), displaced by the 60 px page scroll Playwright applied to reach the below-the-fold button; selection cleared, panel back to its empty state. |
| 12 | Reduced motion respected | pass | Emulated with Playwright `reduced_motion="reduce"`: two frames 2.5 s apart are byte-identical and the scene is readable. **Passes for the wrong reason** — this scene is still whether the preference is set or not. |
| 13 | Frame time noted | pass | Measured here: **2 frames drawn in total**, then 0 frames and 0 draw calls per 3 s window; ~1000 GL draw calls in the one measurable frame. macOS arm64, headless Chromium, SwiftShader. The artifact's own report records "not measured". |

## Prompt requirement (now covered by items 15 and 9, not counted twice)

| Requirement | Result | Evidence |
| --- | --- | --- |
| "add a few moving creatures" | **fail** | See item 9. Seventeen actors authored, zero moving. |

## Documents shipped with the artifact

`src/docs/design-system.md` (look statement, named source records, five explicit departures from
their defaults with reasons), `src/docs/scene-spec.json`, `src/docs/validation-report.md`,
`src/README.md`. The look is traceable to named catalog records —
`knowledge.lighting-mood-dusk-golden-hour`, `knowledge.style-ghibli-painterly-pastoral`,
`recipe.fantasy-village-diorama`, `knowledge.theme-fantasy-woodland`,
`knowledge.reasoning-settlement-function-variation`, `knowledge.inspectable-selection` — with each
departure argued rather than silently taken. No test suite was written.

## Selection and reset, driven directly

Driven with Playwright rather than read from the code: clicking `#pick-mill` fills the panel with
that building's program, inputs, outputs and site, sets `aria-pressed`, and tweens the camera in;
clicking `#reset` clears the selection and returns the home view.

The framing that tween lands on is poor, and it is poor at rest, not only mid-tween:
`captures/pick-mill-settled.png` was taken after a 5 s settle and shows an anonymous flat roof plane
filling most of the frame with the mill unreadable. (`captures/click-0-pick-mill.png` is a mid-tween
frame — `capture.py` defaults to a 300 ms settle against a 0.9 s tween. That default is worth
changing, but it is not the cause of the bad framing.) Run 2 lands the same class of shot from the
same "distance = size × constant" heuristic; see
[`../with-skill-run2/checklist.md`](../with-skill-run2/checklist.md).
