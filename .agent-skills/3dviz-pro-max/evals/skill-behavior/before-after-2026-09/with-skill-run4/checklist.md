# with-skill run 4 — checklist results

Artifact: **Lanternfall** (the run's own title — the same name run 2 chose, independently; the two
scenes are unrelated), `src/` (12 structures, riverside lantern festival at civil dusk). Generated
2026-09-09 from the same prompt and constraints as runs 1–3, by an agent that had the quality-tier
version of the skill: `tiers` on every blueprint, `host-probe.py`, the `design-context.py --host`
quality brief, `lodFor()`, the two Blender-baked T3 heroes, and anti-slop item 17.

**Scale note (2026-09-09).** `visual-anti-slop.md` is **17 items** (15 liveness, 16 detail ladder,
17 surface on the hero) and `inspection-per-frame.md` is 13, so every run is scored out of **30**.
Runs 1–3 and the baseline were re-scored on these 30 items from their existing frames; nothing was
regenerated. Unlike them, **this run's agent could read item 17** — the first that could.

**Capture note.**
**Item-9 note (2026-09-09).** Anti-slop item 9 gained a lightness floor: the 45 % saturation cap applies to pixels at HSL **L ≥ 0.2** and to surfaces, not to sky or emissives. Item 9 below was re-read from the same frame under the new wording; no other item was re-read and nothing was regenerated.
 The scored frames in `captures/` and `captures-uniform/` are **SwiftShader**, taken
by the grader with the same flags used for runs 1–3, so the comparison is like-for-like. The agent's
own inspection was done on GPU; a labelled GPU set with identical views sits in `captures-gpu/` and
**is not scored**. Every measurement below is the SwiftShader one unless it says otherwise.

Every PNG named below was opened. Self-graded, n=1 — see [`../README.md`](../README.md) for limits.

Grading conventions, applied identically to all five runs:

- **n-a** means the item's prescribed toggle or sweep was not run in this grading pass. Not a pass.
- Hue families, saturation and hero contrast come from measurements on the canvas region (944×720)
  of `overview.png`, not from impression.
- Item 4 fails for a run if it fails in *any* graded frame.
- Items 16 and 17 are counted on the run's own declared hero, at the closest frame available.
- The "unexplained opt-out is a defect" rule is charged once, in the README's docs row.

## visual-anti-slop.md (17 items) — 15 pass · 1 fail · 1 n-a

**Combined with `inspection-per-frame.md` (13): 25 pass · 2 fail · 3 n-a out of 30.**

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | No single PointLight as key | pass | `src/scene.js` + `src/rigs/lighting-night-lantern.js` — there is no key: a `DirectionalLight` rim `#8a7bb8` at 0.85 (the only wide shadow caster), a tinted `HemisphereLight` at 0.8, and 12 lantern `PointLight`s at 34–75 cd carrying the frame. `design-system.md` §1 says "no key — a cluster of practicals" and why. |
| 2 | No untinted white ambient | pass | `HemisphereLight('#5a4b7a', '#2a1f1a', 0.8)` — both hemispheres tinted, neither white; no `AmbientLight` anywhere. |
| 3 | Every light has a job | n-a | Light-removal test not run (kept n-a for all five runs). |
| 4 | Hero at highest contrast | **fail** | Measured on `captures/overview.png`, not judged by eye. The declared hero is the Ferryman's cottage; located by pausing motion and diffing a selected against an unselected overview frame, its selection ring shows at x 221–233, y 389–419 — **the hero is almost entirely occluded in the establishing frame**. Mean luminance of the hero's zone **41.1**, against the two-storey river house wall at **86.6**, the sky band at **67.7** and the far hills at **43.8**. The run states this opt-out in `design-system.md` §10 ("the brightest regions are the lantern papers … the hero is the highest-contrast *building*"), which stops it being an unexplained opt-out but does not make the item pass. Item 4 has now failed in all five runs. |
| 5 | Background never flat | pass | `captures/overview.png` — `world/sky.js` `gradientSky` runs `#1b2a4a` zenith → `#5a4b7a` horizon → `#2a2233` ground, and the gradient is visible above the hills; the same texture is PMREM'd into `scene.environment` at 0.55. |
| 6 | Fog and three depth layers | pass | `captures/bluff.png` and `overview.png` — `FogExp2 #3a3560` at 0.016 (refitted from the record's 0.045, recorded in the departure table). Foreground terrace, bridge/river band, fogged hills: grayscale band means 11.7 / 36.0 / 43.8 with the sky at 67.7 — three separated planes. Fog on/off toggle not run; passed on the same basis as runs 1–3. |
| 7 | Scale cue in frame | pass | `captures/square.png` — a 1.75 m walking figure beside the stalls, 2.0 m doors, a 0.94 m barrel and 0.35 m lanterns; `design-system.md` §4 states each dimension. |
| 8 | ≤3 hue families + accent | pass | Posterise-to-8 on the canvas region of `overview.png`: all eight bands sit at H 244.6–282.9 — one cool blue-violet family — with the lantern warm (`#f2b25c`) too small a share to enter the eight. One family plus one accent, comfortably inside the cap. |
| 9 | Non-focal saturation ≤45 % (L ≥ 0.2) | **pass** | Re-read 2026-09-09 under the item's new lightness floor. Same posterise: the four bands charged before — `#04020b` **69.2 % S**, `#050411` **61.9 %**, `#0b081f` **59.0 %**, `#130e29` **49.1 %**, together 51.1 % of the canvas — sit at **2.5 %, 4.1 %, 7.6 % and 10.8 % L**, all below the floor. The bands that do reach the floor are `#624a6d` (19.1 % S, L 35.9 %) and `#412e51` (27.6 % S, L 24.9 %), both far under the cap. This is the degenerate case the run-2 scorecard and this one both recorded; the floor fixes the item, not the frame. Was a **fail** on the pre-floor wording. |
| 10 | Bloom ≥1.0, emissives above | pass | `main.js` `LOOK.post.bloom` threshold **1.0**, strength 0.28, radius 0.6; lantern paper `emissiveIntensity` 1.8 and the nine embers 3.0 are the only surfaces authored above it (lowered from the record's 3.0 for the paper because it clipped white — in the departure table). `captures/bridge.png` — the lamps and their river streaks bloom; the plaster wall and quay deck beside them do not. |
| 11 | Camera not dead-centre eye level | pass | Home view `[-21, 18, 31]` → target `[3, 1.5, -2]`: 18 m up, target off-centre. |
| 12 | FOV 35–50° | pass | `LOOK.camera.fovDeg = 42`, inside the band; noted anyway in `design-system.md` §10. |
| 13 | ≥3 roughness values | pass | 50 distinct values across `world/` and the kit modules, 0.14 (river ripple) to 1.0, with the intended reading tabulated in `design-system.md` §6 (water 0.14, ironwork 0.35–0.5, tile ~0.7, plaster ~0.85, terrain 0.97). |
| 14 | No uniform grid or clones | pass | `captures/overview.png` and `square.png` — 64 far-field canopy lobes in one `InstancedMesh` with per-instance position/rotation/scale/hue jitter; the three market stalls are the same blueprint at different seeds and stripe counts (the panel names one of them "the same kit at seed 5 and ten stripes: a different stall, not a clone"); the 12 structures differ in kit, storeys and footprint. |
| 15 | **Nothing that should move is frozen** | **pass** | `captures-uniform/capture-log.json` → `motion: {"interval_ms": 2000, "differs": true}`; `capture.py --expect-motion` exits 0 in SwiftShader. Water ripples, seven swaying lanterns, the mill wheel, nine embers, two figures and two animals. |
| 16 | **Detail ladder on the hero** | **pass** | Counted by me on `captures/pick-cottage-settled.png` (the hero framed after a 5 s settle), not taken from the report. **Silhouette 3:** two-bay gable with a ridge line, the chimney breaking it, the projecting entry lean-to. **Medium 5:** lapped tile courses in relief, recessed windows with sills and reveals, a plank door with its frame, corner and mid-wall timbers, the chimney cap. **Fine 3:** baked tile mottling that varies course to course, dark contact seams at every lap, a drip line under each sill. Clears two per band in every band. The three counts are recorded in `src/docs/validation-report.md` rather than in `design-system.md` as the item asks, with §4 naming the hero — the same minor deviation run 3 made. |
| 17 | **Surface on the hero** | **pass** | **The first pass on this item in the evaluation.** `captures/pick-cottage-settled.png`, examined at 3×. The hero is the Blender-baked **T3** `timber-cottage-t3.glb`. Named surface cue: **tile** — each roof course carries its own mottled grain rather than one flat red, with a dark seam along every lap; the plaster carries a soft grain and the sill and door boards show timber direction. Contact darkening: baked occlusion under the eaves, down both sides of every corner timber and along the underside of each sill, present where the geometry meets and absent on the open faces — occlusion, not a cast shadow. The `cottage` named view, which was meant to be the 1.5 m close-up, is unusable (a lantern post on the sight line and the lamp blowing out the plaster, the run's own defect #2), so the item is judged on the selection frame and this is stated rather than glossed. |

## inspection-per-frame.md — 10 pass · 1 fail · 2 n-a

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Console clean | pass | `captures/capture-log.json` — `console_errors: []`, `page_errors: []`, in the SwiftShader pass and in the GPU pass. |
| 2 | Horizon or sky present | pass | `captures/overview.png` — see anti-slop 5. |
| 3 | Three depth layers | pass | `captures/bluff.png` — foreground guildhall and lamp, tower and conifers, fogged ridge. See anti-slop 6 for the measured band means. |
| 4 | Hero highest contrast | **fail** | See anti-slop 4: hero zone 41.1 against 86.6 for the brightest wall, and the hero is occluded in the establishing frame. |
| 5 | Labels readable at 1280×720 | pass | Measured: `scrollHeight` **720** = `innerHeight` 720, `scrollWidth` 1280 = `innerWidth`, canvas **944×720**, no page overflow. The panel scrolls internally. **This closes run 3's regression** — the whole canvas is above the fold, so no capture here is the top slice of a taller page. All panel type is legible at 100 %. |
| 6 | No z-fighting | n-a | Orbit sweep not run. No coplanar flicker in the twelve stills. |
| 7 | Hero not clipped by near plane | n-a | Zoom-to-`minDistance` test not run (kept n-a for all five runs so the scores stay comparable). Note separately, and **not** scored here: two named views put the camera inside or against geometry — see "Where this run is weak". |
| 8 | Nothing floats | pass | `captures/pick-cottage-settled.png` and `square.png` — the rim directional casts contact shadows under the hero, the cart, the crates, the barrels and the stalls; every building sits on a levelled terrain pad. |
| 9 | **Scene is alive** | **pass** | `capture.py --motion-check 2000 --expect-motion` exits 0 with `differs: true` in the method-identical pass (`captures-uniform/capture-log.json`, `eeba3a8a…` → `6233c8ab…`), and again in the named-view pass and the GPU pass. |
| 10 | Controls change visible state | pass | Driven with Playwright, not read: `#pick-cottage-hero` sets `aria-pressed="true"`, fills the readout ("Ferryman's cottage · timber-cottage · built at T3 …") and changes the frame; a pointer click on the canvas at (0.42, 0.62) selects a different building and rewrites the panel ("Cloth stall · market-stall · built at T2"), so canvas picking works; `#control` genuinely stops the scene (two frames 2.5 s apart byte-identical while paused, label flips to "Resume motion") and genuinely resumes it; `#reset` clears the selection and restores the home view. |
| 11 | Reset restores the home view | pass | `captures/click-1-reset.png` reproduces `captures/overview.png` framing exactly — same terrace, bridge and tower — with the panel back to "Nothing selected"; pixels differ only where water, lanterns and walkers moved. |
| 12 | Reduced motion respected | pass | Emulated with Playwright `reduced_motion="reduce"`: two frames 2.5 s apart are byte-identical and the frame is readable. `main.js` starts `paused = matchMedia('(prefers-reduced-motion: reduce)').matches`, so `dt` is held at 0 from the first frame. |
| 13 | Frame time noted | pass | The artifact writes "**not measured**" for frame time, draw calls and triangles in `design-system.md` §9 and `validation-report.md`, which the item explicitly allows (run 1 was passed on the same basis). Measured here instead: **7,242 GL draw calls and ~882,000 triangles per drawn frame, 7 drawn frames in 3 s (≈2.3 fps), median 450 ms**, at 1280×720, macOS arm64, headless Chromium, SwiftShader. On the labelled GPU set the same scene draws 7,485 calls and ~894,000 triangles per drawn frame at **46.3 drawn fps** (median 24.7 ms). The artifact's own claim that "the scene renders at 60 fps in a headless Chromium on an M4 Max" is **not supported** — it never read a counter, and the measurement is 46 fps on GPU and 2.3 fps in the renderer every published run is compared in. |

## Prompt requirement (covered by items 15 and 9, not counted twice)

| Requirement | Result | Evidence |
| --- | --- | --- |
| "add a few moving creatures" | **pass, with a caveat the run states itself** | Two walking figures and two quadrupeds from `kits/creatures/`, plus the wheel, water and embers. The figures are visible in `captures/square.png`; the two animals are **not clearly visible in any frame**, because the `lane` view that was meant to show them is defective. Liveness is proved; the animals are proved only from source and from the walkers' `animate` return. |

## Documents shipped with the artifact

`src/docs/design-system.md` (149 lines: look statement, a six-row departure table with a measured
reason each, §5 the **quality brief** with the tier of every object class and why it departs, and §10
three opt-outs by item number), `src/docs/scene-spec.json`, `src/docs/validation-report.md` (what ran,
what was observed, five named uncertainties including the two defects it did not fix), `src/README.md`
and `src/host.json` + `src/design-context.json` — the probe and brief output, committed. **No tests**
— the fourth with-skill run in a row to write none, against a baseline that wrote one.

The look is traceable to `knowledge.style-lantern-festival-riverside` and
`knowledge.lighting-mood-night-lantern`, with kit blueprints named per object in §5 and the tier each
was built at. This is the first run whose documentation states a tier per object class and the host
it was built on — the thing phase 9 added — and it is the most complete self-documentation of the
five.

## Where this run is weak

- **Cost is the worst of the five.** 7,242 draw calls and 882 k triangles per drawn frame at **2.3
  fps** under SwiftShader — 1.5× run 3's 4,773 and 3.8× the baseline's 1,928 — and the artifact
  never measured it, writing "not measured" while also asserting 60 fps. The T2 surface pass and the
  12 practicals with a shadow-casting rim are the plausible cost; nothing in the workflow asked.
- **Two named views out of seven are unusable, and only one and a half are admitted.** `lane` is a
  near-black frame with the camera inside the two-storey river house (the run reports it). `cottage`,
  the intended hero close-up, is blocked by a lantern post that also blows out the plaster (the run
  reports it). **`square` is not reported at all**: a T2 plaster wall standing at the near plane
  fills the canvas from x≈582 to 944 — **37.5 % of the frame** — at mean luminance 170 against 69
  for the rest of the frame. Three of seven authored views are damaged by camera placement, and the
  run's own report calls `square` clean. Since 2026-09-09 `capture.py` measures this: on these same
  frames it flags `lane` **near-black** (luma mean 0.025, 92 % of pixels under 0.06) and both `square`
  and `cottage` **flat-occluder** (`square` 22 % of the canvas width in a vertically flat band at a
  0.33 luma gap; `cottage` a bright block over 35 % of the canvas at a 0.56 gap) while leaving all
  four undamaged views of this run, and every view of the other four runs, usable. It catches the
  wall in `cottage`, not the lantern post in front of it.
- **The hero is occluded in the establishing frame.** Its selection ring is a 12 px sliver in
  `overview.png`; a viewer opening the scene cannot see the object the design system calls the hero.
- **Item 9 no longer fails, because the item changed, not the frame.** The floor added on
  2026-09-09 (cap applies at L ≥ 0.2) stops charging this run's four near-black bands, exactly as it
  stops charging run 2's five and the baseline's river. The scene's own saturation is unchanged.
- **One unsupported performance claim** (60 fps), the same class of overclaim run 3 made about hero
  contrast — different subject, same failure to measure before asserting.
