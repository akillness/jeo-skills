# Lanternfall: validation report

Date: 2026-09-09 · Build: working copy · Runtime: three@0.180.0, vite@7.1.5, postprocessing@6.39.4

## Checks

| Check | Method | Result | Evidence |
| --- | --- | --- | --- |
| Build succeeds | `pnpm build` | pass — `✓ built in 672ms`, index 973 kB js + 2 GLB assets | terminal |
| Unit tests | none written | not run — no logic module worth a test harness in this pass | — |
| Console clean | `capture.py` console + pageerror hooks | 0 console errors, 0 page errors | `captures/capture-log.json` |
| All authored views render | `capture.py --all-views` | 7 named views + default + default-motion, all `applied: true` | `captures/*.png` |
| Scene is alive | `capture.py --motion-check 2000 --expect-motion` | `differs: true` | `captures/default-motion.png`, log `motion` |
| Controls change visible state | `--click "#pick-cottage-hero"`, `--click "#reset"`, `--click "#control"` | all three frames differ; selection focused the hero, reset restored the overview and cleared the panel | `captures/click-0-*.png`, `click-1-reset.png`, `click-2-control.png` |
| Reset restores the home view | capture after `#reset` | pass — composition identical to `overview.png` (pixels differ only where the water, lanterns and walkers moved) | `captures/click-1-reset.png` |
| Anti-slop checklist | `checklists/visual-anti-slop.md` | 14 of 17 verified from opened frames; 3 opt-outs recorded | `design-system.md` §10 |
| Per-frame inspection | `checklists/inspection-per-frame.md` | 2 defects found and not fixed (budget), listed below | this file |
| Reduced motion | not emulated in the capture run | not run | — |
| Frame time | not measured | not measured | — |

## What ran

1. `python3 scripts/host-probe.py --out host.json` → ceiling **T3** (Blender 5.2.1), capture mode gpu.
2. `python3 scripts/design-context.py "<objective>" --blueprints --look knowledge.style-lantern-festival-riverside --host host.json --delivery web-desktop` → quality brief, per-role tiers.
3. `python3 scripts/search.py` / `resolve.py` for the style and lighting records.
4. Scaffold, rigs, kits and docs copied out of the skill; `pnpm install`; `pnpm build`.
5. `capture.py --dir <build> --all-views --gpu --settle-ms 1400 --motion-check 2000 --expect-motion --click "#pick-cottage-hero" --click "#reset" --click "#control"` — three times: one generation pass and two fix passes. Headless Chromium, ANGLE Metal, Apple M4 Max, 1280×720 page (canvas 940×720).

## What was observed

Frames opened and read: `overview`, `square`, `bridge`, `mill`, `bluff`, `lane`, `cottage`,
`click-0-pick-cottage-hero`, `click-1-reset` (and their earlier versions from passes 1 and 2).

- **Composition.** `overview` reads as one village: cottages and market on the west terrace, the
  bridge across the middle, the watch tower on the bluff in the right third at roughly twice its
  neighbours' height. Three depth layers separate cleanly (lit foreground / bridge and river /
  fogged hills).
- **The signature technique works.** In `overview` and `mill` the lantern reflections are visible
  as broken warm streaks on the river; in `mill` they shimmer across the whole foreground.
- **Value structure.** Lanterns and reflections are the only near-clipping regions; walls, quay and
  ground sit in a mid band; the warm/cool split (lantern `#f2b25c` against `#5a4b7a` sky) holds in
  every view.
- **Scale cue.** A 1.75 m walking figure stands beside the stalls in `square`; 2.0 m doors,
  0.94 m barrels and 0.35 m lanterns are all readable there.
- **Hero at T3.** `click-0-pick-cottage-hero` shows the baked cottage at ~8 m: silhouette band —
  gable, chimney, ridge line; medium band — individual tile courses, a recessed window with sill,
  corner timbers, door; fine band — bevelled arrises catching the lamp, plaster grain, baked
  occlusion darkening the eaves and reveals. Two or more features per band: pass (anti-slop 16).
  The surface cue is grain in the plaster plus tile-edge shadow, with contact darkening under the
  eaves and at the ground line (anti-slop 17).
- **Nothing floats.** Every building sits on a levelled terrain pad; the rim directional casts the
  ground shadows visible under the stalls and cart in `square`.
- **Fixes made and the frames that show them.** Pass 1 → 2: fill 0.35→0.80, rim 0.40→0.85, fog
  0.021→0.016, water lightened and the mirror widened to 1024, lantern emissive 3.0→1.8 (the pass-1
  `square` frame was almost entirely black and the pass-1 lanterns clipped white). Pass 2 → 3:
  moved the mill, cottage and tower lantern posts so their subjects are lit, moved the two animals
  onto the west lane, and re-aimed five views that were inside geometry or too close.

## What is uncertain / known defects

1. **`lane` view is unusable.** Its camera sits inside the two-storey river house, so the frame is
   near-black. Diagnosed but not fixed: the fix budget (two self-fix passes) was spent. The two
   quadruped walkers are therefore **not verified in any capture** — they are known to exist and to
   animate (the walkers' `animate` returns true and feeds the liveness check), but no opened frame
   shows them clearly.
2. **`cottage` close-up is blocked.** Lantern post 9 stands on the sight line and its lamp over-
   exposes the plaster at 1.5 m. The hero's detail ladder was read from
   `click-0-pick-cottage-hero` instead, which frames the same building cleanly.
3. **Selection ring not visually confirmed.** The panel state, `aria-pressed` and the camera focus
   are confirmed in `click-0-pick-cottage-hero`; the ground ring itself is out of that frame.
4. **Not measured:** frame time, draw calls, triangle count. **Not run:** reduced-motion emulation,
   mobile layout, colour on a wide-gamut display, any non-Apple GPU.
5. The bridge parapet and spandrel coursing read as a dark lattice at distance rather than as
   stone; more light on the deck, or a T3 bake of the bridge, would settle it.

## Captures

| File | View or action | Notes |
| --- | --- | --- |
| `captures/default.png` | first frame after ready | identical framing to `overview` |
| `captures/default-motion.png` | 2 s later | differs — liveness pass |
| `captures/overview.png` | home view | village, bridge, landmark, river reflections |
| `captures/square.png` | market at eye level | stalls, cart, crates, a walking figure |
| `captures/bridge.png` | quay | reeds, water, parapet, tower behind |
| `captures/mill.png` | across the river | wheel silhouette, lantern reflections on the water |
| `captures/bluff.png` | east bank | tower crown, crenellations, guildhall |
| `captures/lane.png` | west lane | **defective — camera inside a building** |
| `captures/cottage.png` | hero close-up | **defective — lantern post on the sight line** |
| `captures/click-0-pick-cottage-hero.png` | after `#pick-cottage-hero` | hero at T3, panel filled |
| `captures/click-1-reset.png` | after `#reset` | home view restored, selection cleared |
| `captures/click-2-control.png` | after `#control` | motion paused |
