---
name: scenario-maya-deformation
description: 'Use when skinning a character in Maya ("bind skin", "fix the weights", weight painting, Skin Tools or ngSkinTools layers), when deformation looks wrong (pinching, candy-wrapper wrist, collapsing elbow or shoulder, volume loss, clothes poking through), when mirroring, copying or capping skin weights for Unreal or Unity, building blend shapes, corrective shapes or pose space deformation (Pose Editor on IK-driven joints), a face rig with shapes or joints, multiple skinClusters, Delta Mush or the ML Deformer, or running a range-of-motion deformation test.'
license: MIT
---

# Maya deformation (character TD)

Expert deformation is decided before the first weight: joint pivots and edge loops set what skinning
can do. Weights are then built region by region, judged in motion at extremes with numbers and
renders, and every fault is fixed where it originates. Stance: block rigid, diagnose, smooth and
shape, correct what weights cannot, and keep everything regenerable as data. If a sibling skill
named here is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the
user to install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool
schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-maya-expert (execution channel, review loop, 2027 version traps).

Module [`scripts/mx_skin.py`](scripts/mx_skin.py): weights IO, region blocking, masks, mirror,
transfer, ROM generator, deformation metrics, correctives, Skin Tools wrappers. **Status
(2026-09-24):** its pure-Python half ran offline (`test_mx_skin_offline.py`, all pass); every Maya
call is **not yet run in Maya** (tests: `tests/code/maya-deformation/run_all.sh`, via `mx_run.py`).
`import sys; sys.path.insert(0, "<skills>/scenario-maya-deformation/scripts"); import mx_skin as S`

## Stance (the expert delta)

- **Raw blocked weights are a rig test.** Assign every vertex 100% to its closest joint and pose: it
  "should look relatively close to your expected final result"; if not, fix pivots, placement or
  loops first. Smoothing a rig fault away: "don't do this in production" (Makauskas). Loops running
  along the wrist or ankle are the modeler's fault; volume loss at a clean elbow is the rig's
  (antCGi).
- **Fill the region, art-direct in the mask.** One layer per decision: twist joints get an even
  fill, the shape of shrug, shoulder and elbow lives in the mask, so re-smoothing twists never
  breaks the elbow (Jao). "Mask is not an actual influence", it is the layer's alpha (Makauskas).
  Headless, `S.block_regions` composites the same stack and writes once.
- **Judge in motion, one motion per test.** Calisthenics: keys every 10 frames, a pose on every
  second key, back to bind between, never bend and lower together (Makauskas); extreme and "weird"
  poses expose errors. ML pose data: one joint at a time in about 30 degree steps (Widup).
- **Smoothing is not free.** Sparse fingers lose volume: smooth the middle loops, then Sharpen
  (Makauskas). Measured here [added]: smoothing a 110 degree elbow cut stretch from 3.9x to 1.5x but
  collapsed the inner elbow (edge ratio 0.19). Deep bends need correctives, not more smoothing.
- **Skin Tools layers are an authoring state.** While layers exist, Maya blocks the classic paint,
  mirror, copy, hammer, set-max-influences and normalize tools; Delete Skin Layers keeps the
  evaluated weights and is the handoff step (Help). "It's still a normal Maya skin in the end"
  (Jao).
- **Choose the corrective's space before sculpting.** Pre-deformation is "like fixing the original
  character's mesh" and holds in other poses; post-deformation fixes one posed result, in Transform
  Space when one joint owns the fix (faster, bounded by that joint's envelope) or Tangent Space when
  it follows the surface across joints (Help; the cross-joint reading is [added]). Extremes first,
  then in-betweens (Help). Engines: secondary joints driven by swing-twist pose fractions, each
  assigned to its LODs (Rudy).
- **Read the joint the rig actually moves.** Bind joints driven by IK/FK constraints or an
  offsetParentMatrix blend are posed through their controls. Pose Editor: create the interpolator
  without neutral poses, add the controller's driving attributes in Driver Settings, then Add
  Neutral Poses; Euler Twist when a wrist twists about the forearm (Help). Node readers use
  `dagLocalMatrix`, since an OPM drive leaves rotate at 0 [added].
- **Face: budget first, joints for rotation.** Ask for the joint and shape budget first; a neutral
  with lips slightly parted made skinning "night and day easier" (Burton). Eyes, lids and jaw stay
  on joints even in shape faces, and split shapes must sum exactly to their master (antCGi). The ML
  Deformer learns what you feed it: skin joints in the Control Collector, Delta Mush removed first,
  pose coverage over network size (Widup).

## Establish first

| Input                                   | Changes                                                                                     | Default when the brief is silent                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Target runtime                          | influence cap, DQ allowed, correctives as shapes or secondary joints, face shapes or joints | film-style in Maya: no cap while authoring, prune 0.01 at the end [added]; game: the engine's or lead's cap (Numbers) |
| Skeleton (scenario-maya-rigging)        | regions, twist chains, mirror rules, how bind joints are driven (constraint or OPM)         | bind joints only, rotations zero, L_/R_ names, twist joints in every limb section (3 to 5 in the sources)             |
| Mesh (scenario-maya-retopology-uv)      | bind method, shells                                                                         | Heat Map on a watertight single shell with joints inside; Geodesic Voxel for multi-piece or non-manifold              |
| Deformation brief                       | stylized squash (two clusters), clothing, face scope, hero vs background (ML Deformer)      | body plus clothing as separate skinned meshes; face = jaw, eyes and lids on joints                                    |
| Skin Tools API (`S.skin_tools_probe()`) | layered or plain path                                                                       | plain cluster with in-memory layers; real layers only when a person will paint them                                   |

## Workflow

1. **Intake gates.** `mx_validate.validate(profile="model")`, `mx_audit.verdict(r, symmetric=True)`,
   `S.bind_precheck(mesh, joints, method)`. GATE: no error lines, joints inside, transform frozen,
   no non-deformer history, X symmetry; face: lips apart, eye joint at the eyeball center (Burton).
2. **Bind, explicitly.** `S.bind(mesh, joints, method, skin_method=0, normalize=1)`: pass every
   flag, since cmds and UI defaults differ and the Help contradicts itself on `normalizeWeights`.
   GATE: `S.weights_verdict(S.audit_weights(...))` clean; `S.export_weights_json` backup (OpenMaya
   writes are not undoable).
3. **Block and diagnose.** `S.block_regions` with closest-bone regions, no smoothing; key
   calisthenics (`S.rom_schedule`, `S.key_rom`); `S.deformation_test`; `S.pose_snapshots` then
   `mx_review.review` headless and look. GATE: raw poses read close to the goal; faults go back to
   scenario-maya-rigging (pivots) or scenario-maya-retopology-uv (loops) with numbers and images.
4. **Regions, twists, masks.** Order: torso, clavicle and shoulder, upper arm, forearm, hand, thumb,
   fingers, head and neck, legs, feet (Makauskas). Twist chains as even ramps, masks as ranges along
   bones; with the API, `S.st_add_region_layer` and `S.st_flood`. Tune mask ranges, not vertices.
   GATE: audit clean, warnings shrink pose by pose, worst poses looked at.
5. **Mirror and shells.** `S.mirror_skin` (or the Skin Tools Mirror tab); clothing and accessories
   take the body under them (`S.copy_nearest`, `S.remap_by_closest`, volume smoothing limited to the
   shell). GATE: mirror error < 0.01, nothing unmatched, no penetration at rest.
6. **Full ROM.** Sections at mid-forearm and mid-upper-arm, bone volumes, folds, cross talk, rigid
   soles, clothing penetration; then combined "weird" poses and animator-style play; a GUI playblast
   when a session exists. GATE: no `error:`, every `warn:` fixed or explained,
   [`references/critique.md`](references/critique.md) at 2 or more.
7. **Correctives.** Candy wrapper: twist distribution, then DQ or weight-blended skinning. Deep
   bends: pick pre or post and the target space (stance), check `S.joint_drive(joint)` and pose
   through the controls when it is driven, then `S.solve_pre_corrective` from a posed sculpt plus
   `S.corrective_driver`, or the Pose Editor in the GUI (controller-driven order above; extremes
   first; Regularization from 0.01). GATE: 0 at rest, 1 at the pose reached through the controls,
   residual < 1e-3 cm; ROM rerun.
8. **Face, if in scope.** Shapes through the split generator (`S.split_targets`,
   `S.add_split_targets`), or a joint face with a zero rest pose (Burton); squash under tweaks as
   two clusters (`multi=True`, UV Pin reading cluster 1, group inverse into bindPreMatrix). GATE:
   split error < 1e-5, counts within budget, double-transform test passes.
9. **Finalize.** `S.delete_skin_layers`, `S.prune_and_limit` to the target cap, ROM rerun, weights
   JSON (plus layers JSON), `mx_validate.validate(profile="rig")`, a new saved version.

## Numbers

| Value                                                               | Relative to                                       | Source                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Keys every 10 frames, pose on every second key                      | calisthenics timing                               | Makauskas [00:03:01]                                                |
| 3 (Makauskas) or 5 (Jao) twist joints                               | per upper arm or forearm                          | [00:07:57], [00:17:13]                                              |
| Weight sum 1 within 1e-4                                            | every vertex, per cluster                         | normalization (Jao, Help)                                           |
| Prune below 0.01 [added]                                            | per weight; the Help cites 0.008 as insignificant | Help, Prune                                                         |
| Influence cap 4 [added], 2 on Burton's Unreal mobile                | per vertex, games only                            | Burton [00:51:55]                                                   |
| Edge ratio < 0.7 pinch, > 1.3 stretch [added]                       | posed vs bind edge length                         | digest thresholds                                                   |
| Section area < 0.7, perimeter < 0.8 [added]                         | mid-limb cross-section vs bind                    | candy wrapper; LBS at 50/50, 90 deg twist keeps 0.5 area (measured) |
| Volume change > 10% [added]                                         | region around its bone                            | Makauskas judges volume by eye                                      |
| Mirror difference < 0.01 [added]                                    | weight of a vertex vs its mirror                  |                                                                     |
| Regularization 0.01 to 1.0; 3 neutral poses (neutral, swing, twist) | Pose Editor                                       | Help                                                                |
| 30 degree steps; 1,500 to 2,000 poses per body; 12 to 20 per arm    | ML Deformer pose data                             | Widup [00:15:50] [00:37:08]                                         |
| 24 face joints                                                      | Burton's current-gen game face                    | [00:35:45]                                                          |

## Quality gates

Measurable (headless, `mx_run`): `S.weights_verdict` clean at the target cap; `S.deformation_test`
without `error:` (cross talk is impossible under pure skinning); warnings fixed or explained; mirror
error < 0.01; `penetration` increase 0 for clothing; correctives 0 at rest and 1 at the pose through
the controls; split error < 1e-5; `S.skin_layers_node(sc) == []` before handoff; re-imported JSON
reproduces the weights (diff < 1e-4). Visual: `S.pose_snapshots` of every ROM pose rendered with
`mx_review.review` (clay and wire, front and three-quarter, same cameras every iteration), or a GUI
playblast. Look at shrug and deltoid, elbow crease, wrist twist, fingers, groin and knee while
lifting the foot, feet, neck, clothing; faces: mouth corners, cheek squash, lids. Judge with
`references/critique.md`.

## Common mistakes

| Mistake                                                 | What it looks like                                        | Fix                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Smoothing over a bad pivot                              | wrist bump, neck lump that returns every pose             | move the joint (scenario-maya-rigging), re-block (Makauskas)                               |
| Edge counts read alone                                  | rigid weights show zero pinch while pieces interpenetrate | read folds, collapsed faces and severity (critique.md)                                     |
| Editing `maximumInfluences` on a live cluster           | custom weights silently reset                             | `S.prune_and_limit` (Help: `-mi` in edit mode wipes weights)                               |
| `copySkinWeights` with default flags                    | closestComponent association, XY mirror plane             | pass `surfaceAssociation`, `influenceAssociation`, `mirrorMode="YZ"`                       |
| Classic tools on a layered cluster                      | "blocked" errors, or weights overwritten later            | `S.delete_skin_layers` first, or the Skin Tools equivalents                                |
| Heat Map with end joints outside the mesh               | those joints get no weight                                | move joints inside or use geodesic after the precheck                                      |
| Test animation with combined motions                    | cannot tell which joint breaks                            | one motion per segment (`rom_schedule`)                                                    |
| Flood smoothing sparse fingers                          | sausage fingers, lost knuckles                            | smooth middle loops, Sharpen (Makauskas)                                                   |
| A mesh-level error sculpted as a post corrective        | the fix shows near one pose only                          | pre-deformation (`S.solve_pre_corrective`): it holds in every pose (Help)                  |
| Neutral poses created on an IK or constrained joint     | the Pose Editor cannot return to neutral or go to a pose  | no neutral poses at creation, Driver Settings > Controllers, then Add Neutral Poses (Help) |
| Pose reader on `.matrix` or `setAttr` on a driven joint | corrective stuck on or off; pose rejected or snapped back | `S.corrective_driver` (dagLocalMatrix); pose through the controls                          |
| Closed lips in the neutral                              | mirror and wrap transfers fail, lips stick                | lips slightly parted (Burton); split upper and lower proxies (Jao)                         |
| Overlapping split shapes                                | double motion at the corners                              | vertex ownership, difference shapes (raise not smile), sum test (antCGi)                   |
| Delta Mush left under an ML Deformer                    | the ML learns the smoothing                               | delete it before training (Widup)                                                          |
| Pinned controls reading the final mesh                  | dependency cycle                                          | UV Pin from skinCluster1.outputGeometry (Maya LC)                                          |

## Handoffs

- **Receives from scenario-maya-rigging:** bind skeleton (joints only, rotations zero, oriented,
  single root, L_/R_ names or labels), controls for the ROM, twist joints placed, and whether bind
  joints blend by constraint or offsetParentMatrix; `mx_validate(profile="rig")` clean. From
  scenario-maya-retopology-uv: mesh frozen at the origin, no history, symmetric, loops across every
  joint, UVs, face with lips apart and eyes in place.
- **Delivers to scenario-maya-animation:** a new rig version with layers deleted, weights and layers
  JSON, the ROM verdict JSON, the sheet or playblast looked at, what was not verified; referenced,
  never imported.
- **Delivers to scenario-maya-pipeline-scripting (game skins):** weights capped and pruned for the
  engine, bind skeleton only as influences, secondary joint list with LOD assignments, correctives
  as joints when the engine needs them; audit JSON for its FBX export check.
- **Sends back:** pivot and placement faults to scenario-maya-rigging, loop faults to
  scenario-maya-retopology-uv, each with the pose, numbers and image.

## Maya 2027 notes

- Skin Tools (ngSkinTools-based) is built in: Skin > Skin Tools; layers only after explicit
  initialization; Bind Skin's Initialize Skin Layers is off by default; the paint preference
  defaults to the classic tool.
- Scripting: `from ngSkinTools2 import api` (Developer Help, fetched 2026-09-24; not yet imported):
  `init_layers`, `Layers`, `assign_from_closest_joint`, `flood_weights` (acts on the component
  selection), `PaintModeSettings`, `NamedPaintTarget.MASK`, `export_json`, `import_json`.
- Skin > Smooth Skin Weights uses the Skin Tools algorithm and errors on multi-layer clusters; Rigid
  Bind menus are gone (bind with one influence); `performSkinCluster.mel` is removed.
- Several skinClusters per mesh need `skinCluster(multi=True)`; tool lists show the newest cluster
  first.
- `mlDeformer` command (2026), `dgaTension` for stretch analysis (2026.3), Apply Mesh Compare
  (2026); Bifrost 3.0 ships with 2027; old experimental rigging modules are incompatible.

## References

- [`references/procedures.md`](references/procedures.md): code per stage (P1 to P16) with status and
  test; when executing.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert, disagreements;
  when a decision needs its reasoning.
- `references/critique.md`: report reading, region checks, 0 to 3 rubric; before calling a stage
  done.
- [`references/gui-paths.md`](references/gui-paths.md): Skin Tools, Shape Editor, Pose Editor, ML
  Deformer menus; in the GUI.
- [`references/sources.md`](references/sources.md): sources, credentials, URLs, timestamps; to trace
  a claim.
