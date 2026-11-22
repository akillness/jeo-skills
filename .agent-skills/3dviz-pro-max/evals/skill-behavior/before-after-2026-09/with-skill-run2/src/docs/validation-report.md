# Lanternfall: validation report

Date: 2026-09-08 · Build: working copy · Runtime: three@0.180.0, vite@7.1.5, postprocessing@6.39.4

## Checks

| Check | Method | Result | Evidence |
| --- | --- | --- | --- |
| Build succeeds | `pnpm build` | pass — `dist/assets/index-Cm_hrQ4Z.js 840.85 kB │ gzip: 217.93 kB`, `✓ built in 616ms` | `dist/` |
| Unit tests | none written | not run — no solver or state machine worth a test beyond the selection path, which the click captures exercise | — |
| Console clean | `capture.py` console + pageerror listeners | 0 console errors, 0 page errors on all three capture runs | `captures/capture-log.json` |
| All authored views render | `capture.py --all-views` | 5 views + default + default-motion = 7 frames, all applied | `captures/overview.png`, `quay.png`, `bridge.png`, `terrace.png`, `beacon.png` |
| Scene is alive | `capture.py --motion-check 2000 --expect-motion` | `differs: true` | `captures/default-motion.png`, log `motion` |
| Controls change visible state | `capture.py --click "#pick-beacon" --click "#control" --click "#reset"` | selection lights the tower, drops the ring, fills the readout and tweens the camera; pause flips the label and stops motion; reset clears both | `captures/click-0-pick-beacon.png`, `click-1-control.png`, `click-2-reset.png` |
| Reset restores the home view | click capture compared with `overview.png` | pass — same framing, selection cleared | `captures/click-2-reset.png` |
| Anti-slop checklist | `checklists/visual-anti-slop.md` against the colour frames | 14/15; item 4 fails in the `quay` view only (see below), opt-outs in `design-system.md` §9 | `docs/design-system.md` |
| Per-frame inspection | `checklists/inspection-per-frame.md` on every PNG | pass with two open issues (below) | this file |
| Reduced motion | Playwright `reduced_motion="reduce"`, two frames 2 s apart | pass — frames byte-identical (still) and the scene is readable; `#control` resumes it | `captures/reduced-motion-a.png`, `-b.png`, `-resumed.png` |
| Frame time | 80 rendered frames timed in-page | 89.6 ms median, 97.7 ms p90 — **SwiftShader software rasteriser** in headless Chromium, not a GPU measurement | script output, not stored |

## What ran

1. `pnpm install`, `pnpm build` (three times: generation, fix 1, fix 2).
2. `python3 scripts/capture.py --dir dist --all-views --click "#pick-beacon" --click "#control" --click "#reset" --motion-check 2000 --expect-motion --settle-ms 1200 --out captures` after each build, headless Chromium at 1280×720 on macOS 15 (arm64), software rendering.
3. A short Playwright script for the reduced-motion and frame-time checks, writing into `captures/`.

Every frame named below was opened and looked at.

## What was observed

The first pass built and ran clean but was half-dark: the river rendered as a black hole (no
environment to reflect at night), the terraces and the far bank fell to flat black, the beacon's
lamp was hung *inside* its own top roof so the landmark was the darkest object in frame, the
selection ring blew out to white under bloom, and three of the five views were blocked by a
building or clipped the hero.

Fix 1 gave the water an environment and an emissive floor, lifted the moon and the hemisphere fill
for a 90 m valley, moved the beacon lamp onto the top tier's river-side eave, calmed the marker,
thickened the bridge deck and gave it stone abutments. Fix 2 reframed four views against a
projection of the actual layout and made the beacon lamp a 130 cd beacon.

After fix 2: `overview` reads as a settlement — three depth layers, the beacon lit and unclipped in
the right third, lantern pools along the quay, the bridge in the middle distance and the river
carrying reflections. `bridge` is the strongest frame: the segmental arch reads, and every lantern
is doubled on the water exactly as the style record's signature technique intends. `terrace` shows
the mill wheel, the stepped cottages and the kite loft against the hill. Selection works through
both paths (canvas raycast and panel button): `click-0-pick-beacon.png` shows the tower lit, the
gold ring on the ground, the button pressed and the readout filled, with the camera tweened to a
distance derived from the building's own size — a better frame than the authored `beacon` view.

## What is uncertain / still open

- **`beacon` view clips the tower and blows out the wall behind its lamp.** The camera sits 21 m
  from a 20 m tower and the 130 cd lamp is ~1 m off the wall. The selection tween frames the same
  building correctly, so the defect is the authored view, not the model. Left unfixed: the run's
  two-fix budget was spent.
- **`quay` view is dominated by the bridge deck and by one over-lit ferryhouse wall** (a quay pole
  stands 0.6 m from it). Anti-slop item 4 fails there. Same reason; the fix is to move that pole to
  offset ~12.2 and pull the camera west of the bridge.
- **Reduced-motion button label.** With `prefers-reduced-motion` the scene starts paused but
  `#control` still reads "Pause motion" until it is clicked. Inherited from the scaffold; cosmetic.
- **Performance is unmeasured on real hardware.** 89.6 ms/frame is SwiftShader. A GPU number needs a
  headed browser on a real machine; the light count (12 point lights, one shadow-casting) and the
  208×208 terrain are the things to watch.
- Mobile layout, wide-gamut colour and touch selection were not exercised.
- The Cormorant Mill sits just outside the left edge of the home view; it is covered by `terrace`.

## Captures

| File | View or action | Notes |
| --- | --- | --- |
| `captures/default.png` | first frame after ready | identical framing to `overview` |
| `captures/default-motion.png` | +2000 ms | differs from `default` — liveness proof |
| `captures/overview.png` | home view | hero right of centre, three depth layers |
| `captures/quay.png` | bridge approach | over-lit wall, item 4 open |
| `captures/bridge.png` | arch from downstream | reflection technique at its strongest |
| `captures/terrace.png` | north bank | mill, wheel, stepped cottages |
| `captures/beacon.png` | landmark close-up | clipped at the top, open issue |
| `captures/click-0-pick-beacon.png` | after `#pick-beacon` | selection state, ring, readout, camera tween |
| `captures/click-1-control.png` | after `#control` | motion paused, label flipped |
| `captures/click-2-reset.png` | after `#reset` | home view restored, selection cleared |
| `captures/reduced-motion-a.png` / `-b.png` | reduced motion, 2 s apart | byte-identical, readable |
| `captures/reduced-motion-resumed.png` | after `#control` under reduced motion | motion resumes |
