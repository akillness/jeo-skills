# without-skill — checklist results

Artifact: **Emberhollow**, `src/` (13 structures, lantern-lit night hollow). Graded 2026-09-08
against [`visual-anti-slop.md`](../../../../skills/3dviz-pro-max/templates/checklists/visual-anti-slop.md)
(17 items) and [`inspection-per-frame.md`](../../../../skills/3dviz-pro-max/templates/checklists/inspection-per-frame.md)
(13 items). The agent that built this never saw either checklist; it is applied here only to score
all three runs on one scale, and it was re-scored after both lists gained a motion/liveness item. Every PNG named below was opened. Self-graded, n=1 — see [`../README.md`](../README.md).

**Scale note (2026-09-09).**
**Item-9 note (2026-09-09).** Anti-slop item 9 gained a lightness floor: the 45 % saturation cap applies to pixels at HSL **L ≥ 0.2** and to surfaces, not to sky or emissives. Item 9 below was re-read from the same frame under the new wording; no other item was re-read and nothing was regenerated.
 `visual-anti-slop.md` gained item 17 (surface on the hero) when the kit quality tiers landed, so it is now **17 items** and the two checklists total **30** (17 + 13). This scorecard was re-scored on the 30-item scale by re-reading its existing frames; nothing was regenerated and no other item's verdict changed. Earlier /29, /28 and /26 totals for this run are superseded.

Grading conventions, applied identically to all three runs:

- **n-a** means the check prescribes a toggle or sweep that was not run in this grading pass. It is
  not a pass.
- Saturation and hue-family counts come from the checklist's own posterise-to-eight test, run on the
  scene band of the default frame with the floating panels cropped out.
- The "unexplained opt-out is a defect" rule is charged once, in the README's docs row, rather than
  re-charged against every item it touches. This run ships no `design-system.md` at all, so on a
  strict reading every opt-out below is unexplained; that is stated once and not multiplied.

## visual-anti-slop.md (17 items) — 12 pass · 3 fail · 2 n-a

**Combined with `inspection-per-frame.md` (13): 21 pass · 5 fail · 4 n-a out of 30.**

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | No single PointLight as key | pass | `src/src/world/sky-and-light.js` — key is a `DirectionalLight` moon (`#9fc4ff`, 1.35) plus an ember directional (0.55); the single `PointLight` is a hearth accent at the square. |
| 2 | No untinted white ambient | pass | `HemisphereLight(0x6b7bb8, 0x3b2a20, 0.65)` — both hemispheres tinted, neither white. |
| 3 | Every light has a job | n-a | Light-removal test not run. |
| 4 | Hero at highest contrast | **fail** | `captures/default.png` — the largest bright area is the orange sunset glow on the top-left horizon, not the village. Passes in the selection frames (`captures/click-1-chips-button-nth-of-type-9.png`), fails in the establishing frame. |
| 5 | Background never flat | pass | `captures/default.png` — plum-to-ember vertical gradient with stars and an aurora band; `createSky`/`createStars`/`createAurora`. |
| 6 | Fog and three depth layers | pass | `captures/default.png` — near river bank, midground village and trees, far ridge desaturated by `FogExp2` 0.0068; the ridge reads as a separate plane. |
| 7 | Scale cue in frame | pass | `captures/default.png` — bridge railings, fence posts and cottage doors give a readable human scale. No stated dimension exists anywhere in the project, so the check can only be half-answered. |
| 8 | ≤3 hue families + accent | pass | Posterise-to-8 on the scene band: blue 58.1 %, violet 13.5 %, neutral 13.4 %, red 8.0 %, magenta 7.1 % — blue/violet/magenta read as one cool family plus a plum neighbour, with ember-red as the accent. Borderline, at the limit rather than under it. |
| 9 | Non-focal saturation ≤45 % (L ≥ 0.2) | **pass** | Re-read 2026-09-09 under the item's new lightness floor, same posterise on the same crop. The river band re-reads `#13273c` at **51.9 % S but 15.5 % L** (it was published as `#12263e`, 55.0 %, 16.3 % — the drift is the 256-colour re-encode of the shipped PNG, not a different frame), and a second band `#121d31` at 46.3 % S sits at 13.1 % L. Both are below the L 0.2 floor, so they are reported and not charged; **no band at L ≥ 0.2 clears 45 % S** (highest there: `#333846`, 15.7 % S). This item was a **fail** on the pre-floor wording. |
| 10 | Bloom ≥1.0, emissives above | n-a | No post stack: nothing in the project blooms, so the failure this item guards against cannot occur and the item cannot be scored. Windows and wisps use `emissiveIntensity` on standard materials only. |
| 11 | Camera not dead-centre eye level | pass | `src/src/systems/camera-rig.js` — raised three-quarter home view; `captures/default.png` looks down into the hollow. |
| 12 | FOV 35–50° | pass | `PerspectiveCamera(50, …)` — at the top of the band. |
| 13 | ≥3 roughness values | pass | 0.22, 0.8, 0.85, 0.92, 0.95, 0.98, 1.0 across `paperMaterial` / `glowMaterial` call sites. |
| 14 | No uniform grid or clones | pass | `captures/default.png` — trees vary in scale, rotation and tint from a seeded RNG; the 13 structures are individually authored across two building-kind modules. |
| 15 | **Nothing that should move is frozen** | **pass** | `captures-uniform/capture-log.json` → `motion: {"interval_ms": 2000, "differs": true}`; `capture.py --expect-motion` exits 0. Hoglets, wisps, the serpent, fireflies and the windmill sails all move. |
| 16 | **Detail ladder on the hero** | **fail** | Counted on `captures/click-1-chips-button-nth-of-type-9.png` (the Watch of Nine Bells) and `click-0-…-8.png` (the windmill). **Silhouette 2:** tapered tower with a tiered cap and finial; the windmill's sail cross. **Medium 1–2:** a gallery ring band and sail spars — the window openings are flat colour patches with no wall thickness. **Fine 0:** flat-shaded low-poly throughout, no bevels, no edge wear, no per-instance variation on the hero. The fine band is empty, so the item fails; there is also no `design-system.md` to record counts in. |
| 17 | **Surface on the hero** | **fail** | `captures/click-1-chips-button-nth-of-type-9.png`, examined at 3x on the Watch of Nine Bells: every facet is one flat jade albedo (the selection repaint), with no grain, tile, weave or grit on any face. The only darkening is the cast shadow and the selection ring on the ground; the gallery ring meets the shaft with no contact darkening at all. A T1 hero by construction. The item postdates this run. |

## inspection-per-frame.md — 9 pass · 2 fail · 2 n-a

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Console clean | pass | `captures/capture-log.json` — `console_errors: []`, `page_errors: []`. |
| 2 | Horizon or sky present | pass | `captures/default.png`. |
| 3 | Three depth layers | pass | `captures/default.png` — see anti-slop 6. |
| 4 | Hero highest contrast | **fail** | `captures/default.png` — see anti-slop 4. |
| 5 | Labels readable at 1280×720 | pass | `captures/default.png` — measured `scrollHeight` 720 = `innerHeight` 720, canvas 1280×720, no overflow; the title, dossier and 13-chip roster are all fully legible at 100 %. |
| 6 | No z-fighting | n-a | Orbit sweep not run. No coplanar flicker visible in the five stills. |
| 7 | Hero not clipped by near plane | n-a | Zoom-to-minimum test not run. |
| 8 | Nothing floats | pass | `captures/click-0-chips-button-nth-of-type-8.png` — contact shadows under the mill, every tree, rock and mushroom. |
| 9 | **Scene is alive** | **pass** | `capture.py --motion-check 2000 --expect-motion` exits 0 with `differs: true` (`captures-uniform/capture-log.json`); `captures-uniform/default.png` and `default-motion.png` are different frames. Independently: three screenshots 2.5 s apart in one session gave three distinct hashes, and 41 frames were drawn in 3 s. |
| 10 | Controls change visible state | pass | Driven with Playwright: each roster chip changes the frame (`click-0…` mill vs `click-1…` beacon tower), sets `aria-pressed`, paints the building jade, drops a rotating ground ring and rewrites the dossier; `#reset-cam` and the `R` key both restore the home view. Canvas picking also works (pointerdown/up with a 6 px drag threshold in `src/src/systems/selection.js`). |
| 11 | Reset restores the home view | pass | `captures/click-2-reset-cam.png` matches the `captures/default.png` composition exactly (same ridge, bridge, windmill), ring gone, dossier back to the village summary. |
| 12 | Reduced motion respected | **fail** | Emulated with Playwright `reduced_motion="reduce"`: two frames 2.5 s apart still differ, so the scene keeps animating for a viewer who asked it not to. There is no reduced-motion code path anywhere in the project. This item was `n-a` in the first pass and is now a measured failure. |
| 13 | Frame time noted | pass | Measured here: **1928.5 GL draw calls per frame** over 128 frames, 41 frames in 3 s (≈13.7 fps) at 1280×720. macOS arm64, headless Chromium, SwiftShader. Slow, and the draw-call count is the reason. |

## Prompt requirement (now covered by items 15 and 9, not counted twice)

| Requirement | Result | Evidence |
| --- | --- | --- |
| "add a few moving creatures" | **pass** | Three hoglets walking closed Catmull-Rom routes with terrain-sampled height, five lantern wisps with comet tails, and a 14-segment paper serpent riding the aurora, plus fireflies and turning windmill sails (`src/src/systems/creatures.js`, `src/src/world/scenery.js`). Verified at runtime, not read: three screenshots 2.5 s apart in one session produced three distinct hashes. |

## Documents shipped with the artifact

None. No `design-system.md`, no `scene-spec.json`, no validation report, no README. The art
direction is stated only in the UI copy ("Lantern-lit paper village, cut at dusk") and in module
comments — a coherent concept, held consistently, but traceable to nothing outside the agent's own
head, and with no record of what was checked.

What it does ship instead: `src/scripts/smoke-test.mjs`, a headless harness that assembles the whole
world graph, runs 120 simulated animation ticks, and asserts building count, dossier completeness,
finite transforms and a flat village basin. The with-skill run wrote no tests at all.

## Where this run is structurally weaker

- 1928 draw calls per frame with no instancing and a fresh `MeshStandardMaterial` per call site
  (`paperMaterial` returns a new material every time). The with-skill run uses `InstancedMesh`
  scatter and a shared material module.
- No viewer contract: no `window.__sceneReady`, no named views. Capture needs
  `--ready-flag none --settle-ms 4000` and a guess at the right settle time, and there is no way for
  a later agent to ask for "the beacon view".
- Fixed full-window overlay panels sit on top of the scene rather than beside it; below 720 px wide
  the dossier is hidden outright (`@media (max-width: 720px) { #dossier { display: none } }`).
- The selection highlight recolours the whole building jade, which overrides its own material
  identity; the ground ring alone would have carried the affordance.
