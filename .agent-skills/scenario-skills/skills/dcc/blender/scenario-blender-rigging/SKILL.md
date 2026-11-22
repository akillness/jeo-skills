---
name: scenario-blender-rigging
description: 'Use when rigging a character, creature or prop in Blender through Python: "rig this character", Rigify metarig fitting or generation errors, automatic weights or "Bone Heat Weighting failed", weight painting fixes, clothes that do not follow, IK/FK switch, foot roll, twist bones, drivers and custom properties, corrective shape keys, a stylized face rig, ARKit 52 blend shapes or viseme shape keys for face capture, lip sync or a game engine, a mechanical or hard-surface rig, or testing how a rig deforms.'
license: MIT
---

# Blender rigging

Expert rigging means the rig is specified by bone placement, proven by deformation under stress
poses, and shaped around what the animator will actually use. The stance of every source expert:
place joints precisely, generate or build the simplest mechanism that works, then pose it, measure
it, render it and fix it before calling it done. If a sibling skill named here is missing from your
available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).

Module: [`scripts/bx_rig.py`](scripts/bx_rig.py) (tested on 5.2.1, headless and GUI).
`import sys; sys.path.append("<skills>/scenario-blender-rigging/scripts"); import bx_rig as R`.

## Stance (the expert delta)

- **Placement is the specification.** Joints sit in the center of the volume they move, not on the
  anatomical skeleton ("bones simulate bone, muscle and tissue"); knees and elbows get a slight
  pre-bend because the chain's curvature IS the IK plane; rolls put each hinge on one local axis so
  the animator uses one curve (CGDive; Demeter: the bend, not the roll, decided where his pole
  landed).
- **The metarig is the source, the generated rig is disposable.** Every fix goes into metarig bones,
  Rigify parameters or a post-generation script; regenerating keeps control names, so weights and
  animation survive (CGDive, Demeter, Ivan Cappiello).
- **Automatic weights fail silently.** `parent_set` returns FINISHED while a warning says bone heat
  failed; measure unweighted vertices and empty deform groups, and fall back to a voxel proxy plus
  Data Transfer (CGDive; verified). They also leak across the crotch and armpits: strip .L weights
  from the right half.
- **Weights are judged in motion, firm beats mushy.** Paint in pose or against a test animation;
  limit each seam to 2 or 3 bones ("bones fighting for influence"); slight intersection is better
  than rubbery transitions; rigid parts are assigned at 1.0, never painted (CGDive, Demeter, Dikko).
- **Everything that deforms together gets weights from the same source,** transferred and applied,
  so garments cannot drift while animating (Dikko, CGDive). [added, measured] Nearest-face suits
  parts that follow the skin; a part that hangs off it (skirt, coat tail, cape) takes
  `garment_mapping="ROBUST"`, which copies only close, aligned skin and inpaints the rest (P15). It
  applies to every garment in the `bind` call, and a tight one still copies whole.
- **Export decides the deformation tools.** Four twist bones per segment instead of Preserve Volume;
  Preserve Volume, Corrective Smooth and B-bones are Blender-only, which is why Rigify segments its
  DEF bones (CGDive, Ivan).
- **The animator is the client.** Cut features nobody uses, restrict only what breaks the rig, keep
  automated bones hand-animatable (constraint plus child, Mix Add, Transformation instead of
  drivers), stop when fit for purpose (Wayne Dixon, Demeter, CGDive).
- **Faces are per-character hybrids.** There is no generic stylized face (Demeter); production faces
  mix joints, ribbons, shape keys and lattices (Rik Schutte).

## Establish first

| Input                                         | Changes                                                                                            | Default when silent                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Target: Blender render vs game/FBX            | segmented DEF bones, max 4 influences, no Preserve Volume / Corrective Smooth / B-bone deformation | Blender-only keyframe animation                        |
| Character: biped, quadruped, mechanical, prop | metarig preset or custom samples; rigid islands                                                    | biped, Rigify                                          |
| Face need and style                           | none / Rigify face / bones + shape keys + on-face controls                                         | body rig + eye and jaw bones only                      |
| Fingers                                       | Rigify Human (fingers + face) vs Basic Human                                                       | Basic Human (CGDive: first rig)                        |
| Pose, pieces, scale                           | T or A pose, separate eyes/teeth/clothes, real scale                                               | measure; fix in the model check                        |
| Animator conventions                          | FK/IK defaults, side colors, finger controls                                                       | legs IK, arms FK, follow 0; left blue, right red (ask) |

## Choose the path

| Rigify                                                                                                   | Manual / scripted rig                                                                                                                            |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Humans and animals with standard anatomy, many characters sharing controls, fast production-grade result | Unusual anatomy, mechanical parts, strict game-engine hierarchies, rigs that must stay small, or when the brief asks for a custom control scheme |
| `add_metarig` then `fit_metarig`, `generate`                                                             | `new_bone`, `twist_chain`, `fk_ik_switch`, `ik_chain`, `foot_roll`, `make_def_layer`, `organize`                                                 |
| Metarig types: arm exactly 3 bones, leg 4 + heel, spine 3+, super_copy 1 bone                            | DEF / MCH / CTRL: only DEF deforms, MCH is never animated, everything else is a control                                                          |

## Workflow

1. **Model check.** `R.model_check([body, *parts], fix=True)`: transforms applied (shape keys
   included), feet on Z=0, centered on X, facing -Y, about 1.8 m for an adult human. Apply Mirror
   modifiers or keep their mirror object. GATE: `model_check(...)["problems"] == []`.
2. **Landmarks.** `lm = R.landmarks(body, eyes=eyes)`: cross-sections find crotch, hips, ankle,
   neck, armpit, wrist; eye centers from the eye mesh; nose tip and chin from the face profile.
   Override any joint with `overrides={...}`. GATE: joint order sane, `lm["notes"]` empty or
   explained.
3. **Fit.** Rigify: `meta = R.add_metarig("basic"|"human")`, `R.fit_metarig(meta, lm)` (joints as
   shared points, pre-bends, hinge rolls, left side symmetrized; hands and face by similarity,
   coarse). Manual: build the deform skeleton with `new_bone` from the same landmarks. A body that
   must share an existing skeleton (clips, an engine skeleton, other characters) still gets its own
   rig and bind, then moves onto that skeleton (P16). GATE: `R.check_metarig(meta, body) == []` AND
   `R.placement_sheet([body, eyes], out, arm_obj=meta, views=("front","right","top"))` looked at;
   zoom the head with `center=`, `size=`.
4. **Face (Rigify Human).** Fit, then `R.upgrade_face(meta)` (irreversible; eyelid follow Z 0.3,
   bottom lip 0.9, Overwrite Widget Meshes on). Stylized hero face: bones for jaw, eyes, tongue plus
   shape keys instead (stage 7).
5. **Generate or build.** `rig, err = R.generate(meta)`; `err` is the first Rigify error line naming
   the bone ("Cannot connect chain - bone position is disjoint", "Expected 2 eye corners"): fix the
   metarig, regenerate. Manual: twist chains, FK/IK layers with settings properties, IK with solved
   pole angle, foot roll, symmetrize, `mirror_drivers`, `make_def_layer`, `organize`, widgets. GATE
   (manual): `static_cycles == []`, `cycle_check() == []`, `root_test < 1e-4`, FK and IK coincide at
   rest, pole error < 1e-3.
6. **Bind.**
   `rep = R.bind(rig, body, garments=[shirt, pants], rigid={eyes: None, teeth: "DEF-teeth.T"})`:
   auto weights, verification, proxy fallback, cross-side strip, garment transfer (applied), rigid
   islands, clean and normalize, Armature after Mirror and before Subdivision. GATE: `rep["ok"]`,
   `unweighted == 0`, no non-deform groups; for export `max_influences=4`.
7. **Range of motion.** `dr = R.deformation_report(rig, [body, *garments], R.RIGIFY_POSES)`,
   `R.flag_report(dr)`, `R.garment_depth(rig, body, garments)` (skirts and coats: add P15's knee
   lift), then `R.pose_sheet(...)` and `R.joint_sheet(...)` close-ups and LOOK at them. GATE: no
   leaks, no unexplained collapse, no garment sinking into the body, renders acceptable at armpit,
   elbow, wrist twist, groin, knee, collar.
8. **Fix, in this order.** Placement or roll problems: back to the metarig and regenerate. Weights:
   targeted data edits (`strip_opposite_side`, `assign_rigid`, `smooth_weights` with a vertex mask,
   `clean_weights`). Volume at deep bends: corrective shape keys (`volume_restore_targets`,
   `corrective_from_targets`, `corrective_driver`). Blender-only candy wrapper:
   `preserve_volume_mask`. Re-run stage 7 after every fix; re-check earlier poses (CGDive).
9. **Usability and delivery.** Controls visible with In Front off, widgets, side colors, MCH/DEF
   hidden, at least one Rigify UI row, `rig_ui.py` needs Auto Run in a GUI, switches exactly 0 or 1,
   rest pose clean, test action removed. Report numbers, renders and what was not verified.

## Numbers

| Value                                                                                                                      | Relative to                      | Source                |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------- |
| Knee/elbow pre-bend 1 to 3 deg (fit: 1.2% of limb length, 2.7 deg); check 1 to 15                                          | chain in the bend view           | CGDive; check [added] |
| 4 twist bones, Copy Rotation 1.0 / 0.66 / 0.33 / 0.1 (thigh 0.05)                                                          | from the driving end             | CGDive                |
| IK chain length 2; IK Stretch 0.1; lock IK Y/Z on shin and forearm                                                         | IK bone                          | Wayne, CGDive         |
| Foot roll: heel X [-90, 0], toe X [0, 90], inside/outside Z one-sided                                                      | pivot local, roll 0, pointing up | CGDive (verified)     |
| Weight brush Add, strength 0.1 to 0.2, Auto Normalize; seams Mix 0.5 at strength 1                                         | Weight Paint                     | CGDive                |
| Clean near-zero weights before blurring (Demeter); limit 0.001 (CGDive), 0.01 in `bind` [added]; 4 influences for games    | per vertex                       | Demeter, CGDive       |
| Eyelid follow 0.15 (bone face); Rigify eyelid follow Z 0.3 (default 0.7); jaw bottom lip 0.9; mouth corners follow jaw 0.5 | face                             | CGDive                |
| Palm 0.5 / 0.25; elbow plate 0.2 of forearm rotation                                                                       | Copy Rotation Local, Mix Add     | CGDive                |
| Finger curl: Transformation Scale Z 0..1 to Rot Z 90..0 deg, Extrapolate                                                   | finger control                   | CGDive                |
| Action constraint: keys frames 1 and 10, LINEAR, max = measured control travel                                             | control local Y                  | CGDive, Demeter       |
| Shoulder test range about 20 to 30 deg of clavicle raise                                                                   | anatomy                          | CGDive                |
| Face: about 16 Stop Staring shapes; 52 ARKit for mocap                                                                     | shape keys                       | CGDive                |
| Proxy voxel H/180, then H/90, H/45                                                                                         | character height                 | [added, verified]     |
| Collapse < 0.85, bulge > 1.25 (joint band), leak > 0.001 H, strain 0.5 to 1.6                                              | rest                             | [added]               |

## Quality gates

Code (all in `bx_rig`): `check_metarig`, `weight_report` (unweighted, empty_major,
non_deform_groups, over4, sum_dev, mirror_err), `deformation_report` + `flag_report` (strain, joint
volume bands, cross-side leak, new self-intersections via bx_audit), `static_cycles`, `cycle_check`,
`root_test`, `twist_angles`, `solve_pole_angle`, `rigid_check`.

Visual: placement sheet (front, right, top; head zoom) before generating; pose sheet of
`RIGIFY_POSES` (front, right, three-quarter); joint close-ups (arm joints front/top/three-quarter,
others front/right/three-quarter) at every flagged pose. Look for armpit collapse, pointy or pinched
elbows and knees, candy-wrapper wrists, groin and butt volume, collar clipping, garments sliding or
intersecting, teeth and eyes lagging, widgets hidden inside the mesh. Numbers passed while a render
showed broken arms or crease spikes during testing: always open the render. Rubric:
[`references/critique.md`](references/critique.md).

## Face shapes for engines and capture

Face capture apps, engines and lip-sync tools find shape keys by exact name. A key named with the
wrong case (`JawOpen`) or still equal to the Basis animates nothing. Both survive FBX and glTF
export [verified], so the file looks complete.

- `R.SHAPE_SETS`: `"arkit"` (Apple's 52 names) and `"visemes"` (Meta Lipsync's 15, `sil` to `U`).
  Lists, sources and Roblox's 50 FACS poses:
  [`references/face-shapes.md`](references/face-shapes.md).
- `R.shape_set(face, "arkit", rename={"JawOpen": "jawOpen"})` renames, then adds each missing key at
  value 0 as a copy of the Basis, and returns the names it created. Existing keys keep their value:
  set every key to 0 before export, or the face deforms at rest.
- Sculpt the Left keys, then build each Right with `R.mirror_shape_key(face, n, n[:-4] + "Right")`
  for every `n` in `R.ARKIT_52` ending in `Left`.
- Before export, `R.shape_report(face, "arkit")`. GATE: `missing`, `wrong_case` and `side_conflicts`
  empty, `left_is == "+X"`.
- `empty` is the list of keys still to sculpt: report it when delivering placeholders, empty it for
  a final head. The `sil` viseme is the neutral face, so it always stays in `empty`.
- Sides: Apple's pages say "left eye" without saying whose, and its face coordinate space puts +X on
  the face's own left. Build Left keys on the character's left (+X, the `.L` side) and check one
  capture take before sculpting the whole set.
- Roblox dynamic heads take joint poses, one per frame from frame 1 with the neutral face on frame
  0, not shape keys.

## Common mistakes

| Mistake                                             | What it looks like                        | Fix                                     |
| --------------------------------------------------- | ----------------------------------------- | --------------------------------------- |
| Metarig scale or pose not applied                   | generated rig differs in size or pose     | apply scale, Apply Pose as Rest Pose    |
| Neck moved without the spine tip                    | "bone position is disjoint"               | move joints as units (`move_points`)    |
| Straight knee or elbow                              | IK bends sideways or backward             | pre-bend in the bend view               |
| Parented to the metarig                             | mesh follows nothing useful               | bind to the generated rig               |
| A body for shared clips left on its own skeleton    | the shared clips do not play on it        | bind, then move it onto the names (P16) |
| Heat failure unnoticed                              | mesh does not move                        | `weight_report`; proxy route            |
| Armature below Subdivision, or before Mirror        | slow; mirrored half copies the posed half | `armature_first`                        |
| Left thigh weights on the right leg                 | opposite side moves                       | `strip_opposite_side`                   |
| Eyes and teeth auto-weighted                        | drift, poke through                       | `assign_rigid`                          |
| Live Data Transfer on clothes                       | weights change while animating            | apply it                                |
| A loose skirt bound like a close-fitting garment    | it tears between the legs                 | `garment_mapping='ROBUST'`              |
| Driver on an animatable bone                        | channel cannot be keyed                   | Transformation or Copy Rotation Mix Add |
| Inherit Rotation off for isolation                  | root rotation breaks the limb             | follow bones (World Copy Loc/Rot/Scale) |
| IK target parented inside its chain                 | jitter, flips                             | clear parent; `static_cycles`           |
| Re-parenting a connected bone                       | head jumps to the new parent's tail       | `reparent` clears use_connect first     |
| Symmetrize expected to copy drivers; `.L.001` names | right side dead                           | `mirror_drivers`; `side_of`             |
| IK/FK left at 0.86                                  | mixed, unreadable deformation             | exactly 0 or 1                          |
| ARKit key misspelled or left at the Basis           | capture app or engine moves nothing       | `shape_set`, then `shape_report`        |

## Blender 5.2 notes

- Rigify ships disabled on factory startup (`enable_rigify`); the Human metarig still has the legacy
  face (upgrade it); Overwrite Widget Meshes still defaults off.
- Bone collections and per-bone colors replace layers and bone groups; `edit_bones.new()` joins no
  collection; pose selection is `pose.bones[n].select`.
- `parent_set` appends the Armature modifier last; weight operators (`vertex_group_smooth`,
  `_clean`) need Weight Paint mode headless; `bx_rig` does clean, normalize and limit on data
  instead.
- `shape_key_add` leaves new keys at value 1.0 in 5.2.1: set 0 before driving [verified].
  `VertexGroup.remove` with out-of-range indices crashes 5.2.1 [verified].
- Setting a parent's `tail` moves a connected child's `head`; `EditBone.transform` on a connected
  group double-moves shared ends [verified]: use `transform_bones`.
- Python drivers start with keys (0,0),(1,1); remap them (`remap_driver`). Action constraints pick
  the action slot automatically. Only Insert Available is on by default; `keyframe_insert` from
  Python is unaffected.
- Custom shapes: Affect Gizmo (`use_transform_at_custom_shape`), Use As Pivot
  (`use_transform_around_custom_shape`). 5.2 adds Duplicate and Rename and Add Bone align Axes.

## References

- [`references/procedures.md`](references/procedures.md): full tested code for each stage and the
  test script behind it; load before writing rig code.
- [`references/expert-notes.md`](references/expert-notes.md): judgment by expert (placement, Rigify
  internals, weighting, mechanisms, faces) with timestamps; load when a decision is not covered
  above.
- `references/critique.md`: the review rubric; load at every gate.
- [`references/face-shapes.md`](references/face-shapes.md): ARKit, viseme and Roblox FACS names with
  their sources; load when naming face shapes for an engine or capture app.
- [`references/sources.md`](references/sources.md): videos, experts, best timestamps.
