---
name: scenario-zbrush-pose-print
description: 'Use when posing a sculpt or preparing it for 3D printing in ZBrush: "pose this character", Transpose Master, TPoseMesh, Gizmo posing with masks, ZSphere rig, Proxy Pose, weapon in the hand, stretching after posing, "3D print this", 1/6 scale statue, miniature, resin or FDM, hollowing, wall thickness, drain holes, keys and pins, cutting into parts, 3D Print Hub, Scale Master, Decimation Master, STL or 3MF, size in millimeters.'
license: MIT
---

# ZBrush posing and 3D print

Expert level means a pose that stands and reads, transferred onto every SubTool without losing a
level, and print parts whose size, walls, fits and cavities were measured in millimeters on the
exported files. The stance: turn every decision into a number the agent can check (scale, point
order, joint angles, walls, gaps), keep the pose reversible, use strokes only for cleanup. If a
sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-zbrush-expert (bridge, stroke engine, review loop, 2026 traps).

## Stance (the expert delta)

- **Gaboury: scale is the first decision.** SubTool number one is a box at the client's size;
  nothing may clip out of it, and the whole tool resizes in one step because sizes change late (6 in
  with 15 points of articulation became 4 in with 8). Agent form: `brief_box`, `zb_print.envelope`,
  `set_export_scale(target_mm)`.
- **Munoz Gomez: pose at the lowest level, several SubTools through Transpose Master, the pose on a
  3D Layer.** Plates and carried props (weapon, shield, staff) stay IN the TPose mesh as rigid
  pieces (Auto Groups, one group per loose piece, masked whole); Move Topological clears
  intersections. Plouffe forbids deforming primitives, not moving them rigidly: never pull a carried
  prop out and re-place it with one rotation.
- **Maxon doc: two things destroy a transfer:** a partially hidden SubTool (Vertex Mismatch) and
  Gizmo 3D deformers on the TPose mesh (they reorder points; SubTools die on TPose>SubT). Pavlovich:
  "The order of the vertices is very important." Start from a clean project, save the ZPR while a
  TPose mesh exists (the Transpose Master data lives there).
- **Plouffe: parts that bend together need the same polygon size at level 1** (mask blur spreads per
  polygon). Re-place bolts and discs after bending. Spend detail only where the final size and
  viewing distance show it.
- **Pavlovich: DynaMesh without levels = Proxy Pose plus a ZSphere rig.** Location beats size,
  helpers hold volume, rotate only.
- **Gaboury: never hollow the 9M sculpt.** Shell a light DynaMesh copy (128 was enough for a 9 in
  car), keep its inner wall, Polish it, subtract it from the untouched detailed part in Live
  Boolean. Create Shell Thickness is not millimeters: measure.
- **Bennett (Hasbro): 1 mm minimum wall (0.85 mm was flagged), 0.5 mm edges, 0.12 mm fit offset for
  Formlabs parts;** thin walls are thickened from the inside so the outside does not change.
- **Gaboury: decimate by eye** (about 1M per mesh is plenty; 10k to 20k triangles can still print);
  masks on the detail that matters (face, hands) steer Decimation Master; pre-process again after
  any edit; vent every cup on SLA.

## Establish first

| Input                                                                 | Why it changes the plan                                                                                                                                                                          | Default when the brief is silent                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Process: resin (SLA, MSLA), FDM, molded or cast                       | walls, clearance, hollowing, shrink (Hasbro sculpts PVC at 104 %); molds add Hasbro's rules: touching fingers lock the mold, Group Front shows the parting line, Draw Draft Analysis shows draft | resin, direct print                                                                        |
| Size: ratio and real height, envelope W x H x D, base included or not | export scale, brief box, feature floor                                                                                                                                                           | 1/6 = standing height / 6 (1,800 mm gives 300 mm), measured on the rest pose               |
| Printer volume, slicer caps                                           | splits (Gaboury split a car for the Form 2 bed); polycount or file caps (his example: 50 MB)                                                                                                     | ask; report each part's size                                                               |
| Parts: one piece or kit, glued or pegged                              | cuts and keys (Carratala plans cuts while sculpting)                                                                                                                                             | natural breaks (collar, belt, cuffs, weapon at the hand), two keys per glued joint [added] |
| Pose source; alternate poses                                          | route and layers                                                                                                                                                                                 | one layer per pose                                                                         |
| Deliverable                                                           | STL has no units; 3MF declares them                                                                                                                                                              | STL and 3MF per part in mm, JSON report                                                    |

## Posing without a mouse

The artists' default (Ctrl+click a polygroup, drag a Gizmo ring) is a canvas gesture. The SDK cannot
read mask data, and `press_key` is documented but marked "Does not work, hidden for now" in the
installed 2026 stub (with `canvas_click` it is reported unreliable, Maxon forum). Routes by
determinism:

| Route                                                             | When                                           | How                                                                                                                                                                        | Status                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A. Numeric external rig (Munoz Gomez's Blender route, made exact) | humanoids, extreme or many poses               | TPoseMesh, `export_tpose`, `loose_pieces` weighted rigidly to one bone each, scenario-blender-rigging poses by angle and returns the same order, `import_pose`, TPose>SubT | deterministic; guards tested offline                        |
| B. ZSphere rig by code                                            | in ZBrush, organic, or DynaMesh via Proxy Pose | joints from polygroup borders, `zs_build`, forward kinematics `zs_pose`                                                                                                    | FK tested; bound mesh following API edits [verify live_p02] |
| C. Whole-SubTool rigid moves                                      | a base, a stand, a prop added after posing     | `rotate_subtool_matrix` (X, Y, Z) plus `translate_subtool`, the carrier's whole transform, corrected from exports                                                          | math tested; signs [verify live_p03, p08]                   |
| D. Mask plus Gizmo or action line                                 | cleanup by a computer-use agent or a human     | Ctrl+click group, Alt pivot, drag                                                                                                                                          | weak for this agent                                         |

Weak without a human: gesture design, Plouffe's hand-painted gradient masks, large fold redesign.
Seam smoothing and Move Topological have agent forms in `procedures.md` P6, still [verify].

## Workflow

`zb_pose.call("name", ...)` runs inside ZBrush; `zb_print` runs on exported OBJs; full code in
[`references/procedures.md`](references/procedures.md).

0. **Intake.** Versioned ZTL, `inventory()`, target and envelope in mm. GATE: every SubTool named,
   unique, with points and levels.
1. **Scale.** `set_export_scale`, `export_parts`, `check_scale`, then `brief_box` (hidden while
   exporting). GATE: height within 0.5 % [added], one export scale on every part (a part appended
   from another ZTool arrives at another scale), `envelope` ok, named dimensions checked with
   `caliper`.
2. **Pose prep.** `clean_project` (ZTL saved, default project, Load Tool); polygroup every segment,
   plates and props left as loose pieces; `preflight_tpose`. GATE: preflight ok, density spread
   under 2x [added]. No levels: scenario-zbrush-retopology-export or Proxy Pose.
3. **Pose.** `tpose_mesh(layer=True, groups=True)` with props and plates visible, `export_tpose`
   (the order reference), `save_project`; route A or B, center first, parents before children,
   rotations only; no Gizmo deformers. GATE: `rigid_pieces` ok, `follows` puts each carried prop
   where its carrier took it (0.5 mm [added]), `piece_interference` empty or listed for P6,
   `tpose_to_subtools(expected, rest_obj)` passes its order guard and point counts, `rigid_delta`
   within 2 degrees of the plan [added], `balance` stands or a base is planned; review sheet:
   silhouette and weight read (Plouffe: an unstable pose "destroys the entire work").
4. **Fix deformation.** New layer at the top level. Seam first while the rest is protected (Munoz
   Gomez smooths and moves before clearing the mask); then volumes and folds re-sculpted for the new
   pose (tension from the stretched joint, compression on the inner bend [added]); re-place
   primitives; Move Topological on pieces; pose-specific detail on a pose-only layer, because layers
   blend linearly. GATE: `stretch_report` near the rest pose, `piece_interference` ok, Polyframe
   tiles.
5. **Breakdown.** Parts at natural breaks; merge what prints as one (Live Boolean union or DynaMesh
   on light copies: Hasbro engineers on decimated meshes). Molded: loops, parting line, draft. GATE:
   each part closed, fits the build volume.
6. **Hollow when asked.** `hollow_copy` (insert inside, DynaMesh about 128, Create Shell),
   `keep_inner_shell`, Live Boolean: detailed part start, inner shell, drain and vents subtract;
   thin ends stay solid. Too thin: move the cutter inward, never the outside. GATE: `thickness` p01
   at the wall target, no sealed cavity for resin, `outer_drift` ok, vents at cups.
7. **Cut and key.** Cutter QCube in Live Boolean or a polygroup split then Close Holes [added];
   `plan_keys`; socket = peg grown by 2 x clearance. GATE: `clearance` median at target, no
   interference; one key pair test-printed before the kit (Gaboury).
8. **Decimate.** Unique names; per-SubTool budgets, masks before Pre-process (`mask="cavity"`
   [added]), pre-process after any edit. GATE: faces within budget, `deviation` p99 under the
   printer's XY resolution [added], close-ups before and after.
9. **Deliver.** STL and 3MF per part in mm, `print_report(..., envelope_mm=...)`, a review tile at
   real size (detail under the process floor is backfilled, fused or left to paint: Hasbro). GATE:
   `print_report["ok"]`, every "to look at" item looked at, unit stated.

## Numbers

| Item                 | Value                                                          | Source                          |
| -------------------- | -------------------------------------------------------------- | ------------------------------- |
| Minimum wall         | 1 mm; 0.85 flagged                                             | Hasbro, PVC and Formlabs copies |
| Edges after trimming | 0.5 mm; about 0.2 mm floats away                               | Hasbro                          |
| Fit offset           | 0.12 mm (Formlabs); Inflate 2 gave it in his ZTool             | Hasbro, calibrate per ZTool     |
| Shell copy           | DynaMesh 64 too low, 128 enough (9 in car); Thickness 4 then 6 | Gaboury                         |
| From Thickness       | Min 1, Max 5 once scaled to mm                                 | Maxon doc                       |
| Decimation           | about 1M per mesh; 2.7M to 545k at 20 % unchanged; 8k faceted  | Gaboury                         |
| Decimation quality   | 40 to 100 % near identical, 2 to 40 % visible                  | Maxon doc                       |
| Scale with shrink    | height / 12 + 4 % for a 6 in PVC figure                        | Hasbro                          |
| Proxy Pose skin      | Adaptive Skin Density 1, DynaMesh Resolution 0                 | Pavlovich                       |

## Quality gates

- **Measured** (`zb_print` on OBJs in mm): watertight, volume, thin-wall share (0.2 % of samples
  [added]), sealed cavities, floating shells, height, envelope, one export scale, build volume,
  clearance, balance, faces, outer drift. Pose: point order, `rigid_pieces`, `follows`,
  `piece_interference`, `rigid_delta`, `stretch_report`.
- **Visual** (scenario-zbrush-expert `zb_review.review`, MatCap Gray, five views): gesture and
  balance; joints with Polyframe; primitives round; the grip closed around the handle; the brief box
  shown once; From Thickness on a copy; every listed spot; decimated close-ups. Judge with
  [`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                                                                   | What it looks like                                                | Fix                                                                                            |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Top-level pose, rough mask, mask cleared too early                        | stretched, overlapping polygons                                   | lowest level, blurred mask, Smooth and Move the seam before clearing (Munoz Gomez)             |
| Carried prop pulled out of the TPose mesh, turned by one angle afterwards | a sword beside a raised, bent hand; `interference` 0 still passes | keep it in the TPose mesh as a rigid piece; else the carrier's whole transform, gate `follows` |
| Partly hidden SubTool at TPoseMesh                                        | Vertex Mismatch                                                   | `preflight_tpose` (ShowPt on all)                                                              |
| Gizmo deformer on the TPose mesh                                          | destroyed SubTools; a point count check misses a reorder          | rotations or rigs; the order guard refuses the transfer                                        |
| Session closed with a TPose mesh, no ZPR                                  | no way back to the SubTools                                       | `save_project` right after TPoseMesh                                                           |
| Neutral-pose detail shown on the pose                                     | soft, stretched detail at bends                                   | refine on a pose-only layer (linear blend)                                                     |
| Create Shell numbers read as mm; insert touching the surface              | wrong walls; one joined piece                                     | measure `thickness`; insert inside, drain as a cutter                                          |
| Wall thickened from outside                                               | the sculpt drifts                                                 | move the cutter inward, check `outer_drift`                                                    |
| Mask or edit after Pre-process                                            | decimation ignores it                                             | pre-process again (the wrapper always does)                                                    |
| No clearance on keys                                                      | "20 discs to sand before noon" (Hasbro)                           | 0.12 mm offset, measured, test print                                                           |
| STL without a unit                                                        | 150 mm printed as 150 in                                          | say mm, or ship 3MF                                                                            |

## Handoffs

- **Receives** from scenario-zbrush-sculpting, scenario-zbrush-character-creature,
  scenario-zbrush-stylized or scenario-zbrush-hard-surface: a versioned ZTL with named SubTools,
  levels (or a DynaMesh for Proxy Pose), polygroups per part, the last review sheet; from
  scenario-zbrush-retopology-export, a projected stack when a sculpt had no levels.
- **Sends** to scenario-blender-rigging or scenario-maya-expert: the TPose OBJ and a plan (joints,
  angles, rigid pieces per bone), expecting the same vertex order back.
- **Delivers** posed sculpts (layers, ZTL, ZPR, sheets) to scenario-zbrush-paint-render; print
  packages (STL and 3MF in mm, report, sheets, part and key list) to the user or the printer.

## ZBrush 2026 notes

- Proxy Pose (2023.1) is in Tool > Geometry. Transpose Master still ships ("inactive after a file
  save" fixed in 2025.2); its data lives in the ZPR. The doc's clean project, DefaultCube.ZPR, is
  not in the 2026.2.1 install: `Lightbox/Projects/DefaultProject.ZPR` is used [verify].
- 3D Print Hub has Export to 3MF (errors fixed in 2026.2.1). Update Size Ratios and Scale Master Set
  Scene Scale open dialogs: use the export scale route.
- From Thickness (2026.2.1 labels Min Thickness, Max Thickness, Ball or Ray) asks "Too many
  polygons... proceed?" above Max Thickness Polygons; that note stalls the bridge, so
  `from_thickness` refuses first.
- Live Boolean drops UVs, creases, 3D layers and masks on the result: boolean the print copy.
  Decimation Master and Transpose Master are ZScript plugins: check that control returns (live_p01,
  p07). Cmd+W quits ZBrush on macOS.

## References

- `references/procedures.md`: bridge procedures with full code (scale and brief box, clean project,
  Transpose Master, three rig routes, fixes, hollow chain, keys, masked decimation, delivery). Load
  before driving ZBrush.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert with timestamps
  and deciding conditions. Load when planning a pose or a kit.
- `references/critique.md`: the rubric for pose, deformation and print parts. Load at every gate.
- [`references/gui-paths.md`](references/gui-paths.md): palettes, buttons, hotkeys for a
  computer-use agent or a human.
- [`references/sources.md`](references/sources.md): sources, credentials, timestamps, revisions.
- [`scripts/zb_pose.py`](scripts/zb_pose.py) (inside ZBrush) and
  [`scripts/zb_print.py`](scripts/zb_print.py) (agent side, numpy): offline tests in
  `tests/code/zbrush-pose-print/`; live tests `live_p01` to `live_p08` not yet run in ZBrush.
