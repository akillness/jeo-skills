# with-skill run 2 — checklist results

Artifact: **Lanternfall**, `src/` (13 buildings on a river at lantern-night). Generated 2026-09-08
*after* the scaffold fix, from the same prompt and constraints as run 1. Graded against
[`visual-anti-slop.md`](../../../../skills/3dviz-pro-max/templates/checklists/visual-anti-slop.md)
(17 items, including the liveness and surface items) and
[`inspection-per-frame.md`](../../../../skills/3dviz-pro-max/templates/checklists/inspection-per-frame.md)
(13 items, including the new liveness item). Every PNG named below was opened. Self-graded, n=1 —
see [`../README.md`](../README.md) for limits.

**Scale note (2026-09-09).**
**Item-9 note (2026-09-09).** Anti-slop item 9 gained a lightness floor: the 45 % saturation cap applies to pixels at HSL **L ≥ 0.2** and to surfaces, not to sky or emissives. Item 9 below was re-read from the same frame under the new wording; no other item was re-read and nothing was regenerated.
 `visual-anti-slop.md` gained item 17 (surface on the hero) when the kit quality tiers landed, so it is now **17 items** and the two checklists total **30** (17 + 13). This scorecard was re-scored on the 30-item scale by re-reading its existing frames; nothing was regenerated and no other item's verdict changed. Earlier /29, /28 and /26 totals for this run are superseded.

Grading conventions, applied identically to all three runs:

- **n-a** means the item's prescribed toggle or sweep was not run in this grading pass. Not a pass.
- Hue families and saturation come from the checklist's own posterise-to-eight test on the canvas
  region of `overview.png`, not from impression.
- Item 4 fails for a run if it fails in *any* graded frame.
- Items 16 and 17 are counted on the run's own declared hero, at the closest frame available. Item 16 is charged here on `quay.png`,
  exactly as it was charged against run 1 on `beacon.png`.
- The "unexplained opt-out is a defect" rule is charged once, in the README's docs row.

## visual-anti-slop.md (17 items) — 13 pass · 3 fail · 1 n-a

**Combined with `inspection-per-frame.md` (13): 23 pass · 4 fail · 3 n-a out of 30.**

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | No single PointLight as key | pass | `src/rigs/lighting-night-lantern.js` — a moon `DirectionalLight` `#9fb4ff` draws silhouettes and ~25 lantern `PointLight`s at 60 cd (decay 2) carry the frame. No one light does everything, and `src/docs/design-system.md` states "there is no key" and why. |
| 2 | No untinted white ambient | pass | `HemisphereLight` `#16233f` sky over `#241a12` ground at 0.24; environment is the scene's own sky dome at 0.14. |
| 3 | Every light has a job | n-a | Light-removal test not run. |
| 4 | Hero at highest contrast | **fail** | `captures/quay.png` — the brightest mass is the blown-out plaster wall on the right, not the quay or the bridge. Bloom strength 0.5 clips it to near-white. The run's own `src/docs/validation-report.md` concedes item 4 for this view. |
| 5 | Background never flat | pass | `captures/overview.png` — two-stop gradient from `#070c18` at the zenith to `#1b2a4a` at the horizon; the far ridge is readable against it. |
| 6 | Fog and three depth layers | pass | `captures/terrace.png` — foreground mill and wheel, midground cottages, far bridge and water, with `FogExp2` 0.013 separating them. |
| 7 | Scale cue in frame | pass | `captures/quay.png` — doors, lamp posts and the bridge rail; the on-screen fineprint states doors 2.0 m, quay wall 1.25 m, ferry 4.5 m, lantern 0.35 m. The only run of the three that prints its scale cues to the viewer. |
| 8 | ≤3 hue families + accent | pass | Posterise-to-8 on the canvas: blue 72.7 %, violet 16.5 %, red 10.9 % — three families with lantern amber as the accent. |
| 9 | Non-focal saturation ≤45 % (L ≥ 0.2) | **pass** | Re-read 2026-09-09 under the item's new lightness floor. Same posterise: the five bands charged before (**100.0 %**, 90.5 %, 81.0 %, 71.4 %, 57.1 % S) all sit between **1.0 % and 4.1 % L**, below the floor, and so does every other band in the eight — the brightest is `#40281f` at 18.6 % L. **No band in this frame reaches the floor at all**, so item 9 has no surface to charge here and the caveat this scorecard already carried is now the rule. A pass by absence of measurable non-focal surface, not by demonstrated restraint: the frame is exactly as dark as it was. Was a **fail** on the pre-floor wording. |
| 10 | Bloom ≥1.0, emissives above | pass | `src/main.js` `LOOK.post.bloom` threshold 1.0 / strength 0.5 / radius 0.8, raised from the record's 0.9 *because* the checklist asks for ≥1.0 (`design-system.md` departure table). `captures/bridge.png` — lamps and their river streaks bloom; the dark quay deck beside them does not. Plaster is a non-emissive material (`src/village/materials.js`); the bright walls are lit, not glowing. |
| 11 | Camera not dead-centre eye level | pass | `src/main.js` overview `[-46, 28, 44]` → target `[4, 6, 6]`: 67 m out, 22 m up, off-centre target. |
| 12 | FOV 35–50° | pass | `LOOK.camera.fovDeg = 42`. |
| 13 | ≥3 roughness values | pass | 15 distinct values across `src/village/materials.js` (0.15 … 0.92), with the intended reading documented in that file's header (water 0.15, wet quay 0.30, plank 0.55, ground 0.62, roof 0.70, stone 0.78, plaster 0.84). |
| 14 | No uniform grid or clones | pass | `captures/overview.png` — `src/village/foliage.js` uses `InstancedMesh` with per-instance jitter; the 13 buildings vary in storeys, roof type and footprint. |
| 15 | **Nothing that should move is frozen** | **pass** | `captures/capture-log.json` → `motion: {"interval_ms": 2000, "differs": true}`; `captures/default.png` and `captures/default-motion.png` are different frames. Instrumented separately: 34 frames drawn in 3 s. |
| 16 | **Detail ladder on the hero** | **fail** | Counted on `captures/beacon.png`, the Ferryman's Beacon, which `design-system.md` names as the scene's hero. **Silhouette 2:** four-tier stepped profile, flared eaves. **Medium 3:** framed window openings, a doorway with a reveal, eave planes with real thickness. **Fine 1:** a hanging bracket on the second tier and a lip on the plinth — and the top tier blows to white at bloom 0.5, destroying whatever fine detail it carried. One feature in the fine band, against a bar of two. The item postdates this run. |
| 17 | **Surface on the hero** | **fail** | `captures/beacon.png`, examined at 3x: the concentric arc bands across the roofs are the bloom halo quantised by the 256-colour re-encode, not a material cue. Every roof and wall plane is one flat ochre albedo with no tile, shingle, grain or grit, and the eave-to-wall junctions differ only by face normal — there is no occlusion darkening at any joint. A T1 hero by construction. The item postdates this run. |

## inspection-per-frame.md — 10 pass · 1 fail · 2 n-a

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Console clean | pass | `captures/capture-log.json` — `console_errors: []`, `page_errors: []`. |
| 2 | Horizon or sky present | pass | `captures/overview.png`. |
| 3 | Three depth layers | pass | `captures/terrace.png` — see anti-slop 6. |
| 4 | Hero highest contrast | **fail** | `captures/quay.png` — see anti-slop 4. |
| 5 | Labels readable at 1280×720 | pass | Measured: `scrollHeight` 720 = `innerHeight` 720, canvas 944×720, **no page overflow**. The side panel scrolls internally, so `captures/click-1-reset.png` shows the panel scrolled to reach `#reset` while the canvas stays put — the opposite of run 1, where the whole page moved. All panel text is legible at 100 %. |
| 6 | No z-fighting | n-a | Orbit sweep not run. No coplanar flicker in the ten stills. |
| 7 | Hero not clipped by near plane | n-a | Zoom-to-`minDistance` test not run (kept n-a for all three runs so the scores stay comparable). |
| 8 | Nothing floats | pass | `captures/terrace.png` — contact shadows under every building, tree, mooring post and boat; the quay wall meets the water. |
| 9 | **Scene is alive** | **pass** | `capture.py --motion-check 2000 --expect-motion` exits 0 with `differs: true`. Moving: 2 lamp keepers walking authored routes, 2 river drakes (8 beads each), 3 lamp-moth clusters, 3 moored ferries, the mill wheel, lantern flicker and their river reflections (`src/village/creature-*.js`, `src/village/water.js`). |
| 10 | Controls change visible state | pass | Driven with Playwright, not read: `#pick-mill` sets `aria-pressed="true"`, fills the readout ("An undershot wheel, 4.4 m across…") and changes the frame; `#control` genuinely stops the scene (two frames 2.5 s apart identical while paused) and genuinely resumes it (frames differ again); `#reset` clears `aria-pressed` and changes the frame. Canvas picking also works — clicking the canvas selected "The Round Granary". |
| 11 | Reset restores the home view | pass | `captures/click-1-reset.png` — the canvas content matches `captures/overview.png` exactly; only the side panel is scrolled. |
| 12 | Reduced motion respected | pass | Emulated with Playwright `reduced_motion="reduce"`: two frames 2.5 s apart are byte-identical and the scene is readable, and `#control` resumes motion. |
| 13 | Frame time noted | pass | Measured here: **687.4 GL draw calls per frame**, 34 frames in 3 s (≈11.3 fps) at 1280×720, macOS arm64, headless Chromium, SwiftShader. The artifact's own report independently measured 89.6 ms median / 97.7 ms p90 and labelled it software-rendered. |

## Prompt requirement (now covered by items 15 and 9, not counted twice)

| Requirement | Result | Evidence |
| --- | --- | --- |
| "add a few moving creatures" | **pass** | Verified at runtime by the tool's own liveness check and by frame-hash sampling, not by reading the source. |

## Attribution: is this the fix, or is it variance?

The two scaffold changes are present verbatim in this project and are the mechanism, not a
correlation:

- `src/main.js:66` — `const elapsed = previous === null ? step : timestamp - previous;`. Run 1 had
  `? 0 :` here, which handed `dt = 0` to the first frame after every idle. `src/scene.js:134` still
  reads `if (dt <= 0) return false;` — the same line that parked run 1's loop — so without the
  clamp this project would freeze identically.
- `src/main.js:49-50` — `const invalidate = () => loop?.invalidate();` passed into
  `createCameraRig`, and `src/rigs/camera-orbit-follow.js:16,27,29` accept and call it on
  `controls` events. Run 1's rig took no `invalidate`, so orbit input could not wake the loop.

Everything else (art direction, subject, palette, layout) is free variation between two independent
generations and cannot be attributed to the fix.

## Documents shipped with the artifact

`src/docs/design-system.md` (look statement; three named source records; an **eight-row departure
table** giving the record value, the value used and the reason for each), `src/docs/scene-spec.json`,
`src/docs/validation-report.md` (uses the new `--motion-check`, emulates reduced motion, measures
frame time, and concedes its own item-4 failure). No `README.md` — run 1 shipped one, this run did
not. No test suite, same as run 1.

The look is traceable to `knowledge.style-lantern-festival-riverside`,
`knowledge.lighting-mood-night-lantern` and `recipe.fantasy-village-diorama`. One of its departures
is explicitly driven by this evaluation's own checklist: bloom threshold raised 0.9 → 1.0 "because
anti-slop item 10 wants ≥ 1.0".

## Where this run is weak

- **Focus framing is still bad, and this is the one defect shared with run 1.**
  `captures/pick-mill-settled.png` (captured after a 5 s settle, so it is the resting frame, not a
  mid-tween one) puts the camera close enough that a roof mass fills the frame and the wheel is cut
  by the bottom edge. Run 1's equivalent, `../with-skill/captures/pick-mill-settled.png`, is worse —
  an anonymous flat roof plane — but both come from the same "distance = size × constant" heuristic.
  The 300 ms default settle in `capture.py` also means `click-0-pick-mill.png` is a mid-tween frame
  in both runs, which is a capture-tool default worth changing, not a scene defect.
- **The overview is very dark.** Large parts of `captures/overview.png` fall to near-black; the
  scene only reads where a lantern reaches. Defensible for the stated look, but it is why the
  saturation metric degenerates and why less of the village is legible than in either other run.
  Item 9's lightness floor (2026-09-09) stops charging the near-black bands; it does not make the
  frame more legible, and this bullet is the honest reading of that frame.
- **Bloom at strength 0.5 clips.** The beacon's top tier in `captures/beacon.png` and the wall in
  `captures/quay.png` blow to white and lose their form.
- **Still no tests**, and 13 buildings are described but nothing verifies the model.
