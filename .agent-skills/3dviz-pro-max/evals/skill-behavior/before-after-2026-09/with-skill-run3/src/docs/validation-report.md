# Threadwater Hollow: validation report

Date: 2026-09-08 · Build: working copy · Runtime: three@0.180.0, vite@7.1.5, postprocessing@6.39.4
Machine: macOS (darwin 25.5.0), node v24. Browser: headless Chromium via Playwright — **software
rasteriser (SwiftShader)**, so nothing here is a GPU performance measurement.

## Checks

| Check | Method | Result | Evidence |
| --- | --- | --- | --- |
| Build succeeds | `pnpm build` | pass — `dist/assets/index-B3wIqoAE.js 915.13 kB │ gzip: 243.58 kB`, built in 736 ms | terminal |
| Console clean | `capture.py` console + pageerror capture | 0 console errors, 0 page errors | `captures/capture-log.json` |
| All authored views render | `capture.py --all-views` | 5 named views + `default` | `captures/{overview,green,mill,tower,bridge}.png` |
| Scene is alive | `capture.py --motion-check 2000 --expect-motion` | `differs: true`, exit 0 | `captures/default-motion.png`, log `motion` |
| Controls change visible state | `capture.py --click "#control"` | label flips to "Resume motion", button goes accent | `captures/click-2-control.png` |
| Selection works | `capture.py --click "#pick-tower"` | button pressed, panel filled, ring + pin placed, camera tweens in | `captures/click-0-pick-tower.png` (earlier passes did the same for `#pick-mill` and `#pick-weaver`; those frames were not kept) |
| Reset restores home view and clears selection | `capture.py --click "#reset"` | overview framing back, marker gone, panel back to its hint | `captures/click-1-reset.png` |
| Reduced motion | Playwright `reduced_motion="reduce"` | starts still; control reads "Resume motion" from the first frame | `captures/reduced-motion.png` |
| Anti-slop checklist | `checklists/visual-anti-slop.md` | 16/16 with three recorded opt-outs | `docs/design-system.md` §9 |
| Per-frame inspection | `checklists/inspection-per-frame.md` | pass after two fix rounds | this file |
| Frame time | 100 rAF deltas, median / p95 | 219 ms / 232 ms **on SwiftShader** | not a GPU number; unmeasured on real hardware |

## What ran

1. `pnpm install`, then `pnpm build`.
2. `capture.py --dir dist --all-views --click "#pick-mill" --click "#pick-tower" --click "#reset"
   --click "#control" --motion-check 2000 --expect-motion --out captures` — three passes, one per
   fix round, the last with `#pick-tower`.
3. A Playwright probe for reduced motion, `window.__village.stats` and frame deltas.

## What was observed

The overview holds the village in a shallow bowl: cottages and stalls along a flat lane, the Moot
Hall and barn in the foreground, the mill on the west bank with its wheel over the gorge, the
bridge crossing at lane level, and Emberwatch Tower on the knoll behind, roughly twice any ridge
height. Warm key from the right, cool blue-violet sky above, long shadows running parallel across
the green — the warm/cool split the dusk profile asks for is present. Three depth layers read:
lane props, mill and gorge, hill rim. The lanterns are the only regions near clipping, and the
grayscale read puts the mill's lit gable and the tower shaft above the ground plane.

**Detail ladder on the hero (Threadwater Mill), counted in `captures/mill.png` and the pick-mill close-up of the second capture pass:**
silhouette 3 (overshot wheel and launder breaking the gable, hoist beam, ridge with stone piers);
medium 5 (recessed windows with wall thickness, loading door, exposed frame timbers, wheel rims /
spokes / paddles, stone base course); fine 3 (sill drip lines, peg heads on the frame, lapped roof
courses). Two per band is the bar; it clears it.

**Fixed during the run.**
1. *No scene at all* — the plot filter that keeps buildings out of the river discarded too many
   plots, and `planClearOfTheRiver` threw. Widened the plan to radius 24 / 14 plots and moved the
   river to x ≈ 12.5. Evidence: the first capture run's `Ready flag never became true`.
2. *One amber field* — fog at the profile's 0.02 flattened the 45 m overview into a single haze.
   Refitted to 0.0072. Compare capture pass 1's `overview.png` with the current one.
3. *A village green the colour of sand* — the profile's `#7f9b8e` sage is 14% saturation and went
   warm under the `#ffb46b` key. Added moss `#5f7a4f` as the ground.
4. *Bleached highlights* — the felt conversion lifted lightness (`l * 1.06 + 0.02`), which blew
   sills and ridge caps to white. Now `l * 0.97`, capped at 0.86.
5. *Selection ring as floating planks* — the ring scaled its dash geometry with its radius and sat
   at one flat height, so picking the mill scattered 2 m orange planks over the gorge. The radius
   now moves the stitches instead of scaling them, and each stitch is dropped onto `heightAt`.
6. *A control that lied* — under `prefers-reduced-motion` the scene started paused while the button
   still read "Pause motion". The label is now painted from the state at startup.

## What is uncertain

- **Performance.** Every frame here was drawn by a software rasteriser. The scene is heavy by
  construction: ~10 buildings of individually-meshed parts, sheen on every material (sheen is not
  cheap), a 190 × 190 terrain and a 2048 shadow map. It has not been measured on a real GPU or on
  any mobile device, and the draw-call count was not profiled.
- **Mid-tween click captures.** `capture.py` settles 300 ms after a click, but the focus tween runs
  900 ms, so a pick capture shows the camera on its way in rather than its final framing. The
  framing was checked by reading the tween's target distance, not by an observed final frame.
- **Mobile layout.** The panel collapses under a 760 px media query; that breakpoint was never
  rendered.
- **Colour on a wide-gamut display** was not checked; all frames were read as sRGB PNGs.
- **The `green` view** puts the camera 2.4 m up on the lane; whether the Moot Hall's far gable is
  clipped by a foreground roof at other aspect ratios was not tested.
- **No unit tests exist.** Determinism of the plan and the height field is asserted by construction
  (seeded RNG, integer-hash noise), not by a test.

## Captures

| File | View or action | Notes |
| --- | --- | --- |
| `captures/default.png` | first frame after `__sceneReady` | home view |
| `captures/default-motion.png` | same view 2 s later | differs — walkers, wheel, water |
| `captures/overview.png` | authored home view | the whole hollow, gorge and tower |
| `captures/green.png` | standing on the lane | door and figure scale cues |
| `captures/mill.png` | hero close view | detail-ladder count taken here |
| `captures/tower.png` | landmark | crenellations, string courses, banner |
| `captures/bridge.png` | the crossing | voussoirs, keystone, cutwater, water below |
| `captures/click-0-pick-tower.png` | after `#pick-tower` | selection state and marker |
| `captures/click-1-reset.png` | after `#reset` | home view back, selection cleared |
| `captures/click-2-control.png` | after `#control` | motion paused, label flipped |
| `captures/reduced-motion.png` | `prefers-reduced-motion` | still first frame |
