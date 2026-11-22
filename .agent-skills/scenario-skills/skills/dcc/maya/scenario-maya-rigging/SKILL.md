---
name: scenario-maya-rigging
description: 'Use when rigging a character, creature or prop in Maya: "rig this character", placing or orienting joints, Orient Joint doing nothing, IK/FK switch and matching, pole vector flips or elbow drift, space switching, foot roll, spline IK spine, offsetParentMatrix, blendMatrix or matrix rigging, controls and lockdown for animators, Quick Rig, HumanIK, AdvancedSkeleton or mGear, a game skeleton for Unreal or Unity, or a slow rig (parallel evaluation, profiling, GPU Override not kicking in).'
license: MIT
---

# Maya rigging

Expert rigging means every value is explained and every behavior measured: joints at real pivots
with computed orientation, controls at zero with their placement in offsetParentMatrix, IK/FK and
space switches that move nothing, and a rig that survives scale, distance, several characters per
shot and an animator keying everything. The rig is the output of a build script and data. If a
sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-maya-expert (execution channel, review loop, 2027 version traps).

Module [`scripts/mx_rig.py`](scripts/mx_rig.py)
(`sys.path.insert(0, "<skills>/scenario-maya-rigging/scripts"); import mx_rig as R`): not yet run in
Maya; its pure math passed offline (`test_rig_offline.py`). With Maya installed, run
`tests/code/maya-rigging/run_all.sh` and fix what `test_rig_probe` contradicts.

## Stance (the expert delta)

- **Clean values, one place for each.** Rotations zero at rest, orientation in jointOrient (or
  nowhere: Fragapane), control placement in offsetParentMatrix (antCGi; Maya Learning Channel). OPM
  composes, `world = local * OPM * dagParentWorld` (2027 transform node): feed `.matrix` for a
  relative drive, or multiply a `worldMatrix` by the DAG parent's `worldInverseMatrix`, then zero
  translate, rotate and jointOrient or they apply twice (Maya Learning Channel; antCGi's leg
  rotating backwards).
- **Compute, never eyeball.** `-orientJoint` silently skips joints with rotations or no child (2027
  cmds.joint); a secondary world axis along the bone is ill-defined (antCGi's toes). `R.joint_chain`
  computes jointOrient from positions; a pole on the chain plane adds zero drift
  (`R.pole_vector_position`) [added].
- **The animator defines done.** Zero pop switching IK/FK at neutral, only the active mode visible,
  everything else locked because animators "select hierarchy and key all", limits at breaking
  points, behavior mirroring on limbs, same orientation on eyes and face (antCGi).
- **Matrices before constraint stacks, and know the blend.** OPM, blendMatrix and pickMatrix keep
  channels free (Maya Learning Channel cut 20 joints from one hand). blendMatrix is an ordered
  stack, each target overriding the ones before (equal thirds: 1, 1/2, 1/3); parentMatrix (2025)
  normalizes and stores per-target offsets (2027 Help). Spaces blend offset targets, never the space
  itself, or the IK flips (antCGi).
- **The built rig is disposable.** Guides, build script, serialized weights and settings; fixes go
  back into the data (Miquel Campos, mGear: "we serialize everything and we build clean every single
  time"; Bungie). Metadata and joint labels, not names, identify chains (Bungie). A skinCluster
  reads only influence world matrices and bindPreMatrix: reset the bind pose, never rebuild joints
  for it (Fragapane).
- **Structure decides speed.** The Evaluation Graph leaves static curves out and rebuilds at the
  first differing key; without curves a rig "is going to be paralyzed terribly" (Fragapane; Using
  Parallel Maya 2027). Split components so cheap global work finishes early, even by duplicating
  cheap math (Fragapane); no Python nodes, scene-querying expressions or driven `frozen`; hosts out
  of the limbs (Miquel Campos); DG, Serial and Parallel agree before optimizing.
- **Test at the extremes.** Scale 1.24 and 1.6 (antCGi), a million units away and upside down
  (Fragapane), three referenced characters, a quick bind while building (antCGi).
- **Deformation skeleton apart from the control rig.** Engines see joints, skin and blendshapes
  only: one root at the origin, engine names, a joint budget (antCGi, Unreal and Unity docs,
  Bungie).

## Establish first

| Input                  | Changes                                                                                                                                                             | Default when silent ([added] unless attributed)                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Target                 | film keyframe rig vs engine skeleton (names, axes, influences, one root)                                                                                            | feature keyframe rig, custom                                          |
| Camera distance, style | auto-rigger or custom; twist and corrective joints; stylized: crude proportion rig and art-direction paintovers first, final-aim notes from day one (Miquel Campos) | hero: custom; crowd: Quick Rig                                        |
| Skeleton convention    | reusing engine animation needs its names and hierarchy                                                                                                              | X down the bone, bend on local Z, positive Z flexes                   |
| Animator conventions   | IK/FK default, spaces, colors, pickers                                                                                                                              | arms FK, legs IK; spaces world, cog, chest, head; ask                 |
| Shot load              | characters per shot, dense meshes                                                                                                                                   | three referenced characters                                           |
| Face, mocap, budget    | face to scenario-maya-deformation; HumanIK; joint and influence counts                                                                                              | jaw, eyes, aim control; ask the lead (antCGi: "it pays to be frugal") |

## Choose the path

| Quick Rig + HumanIK                                                                                                                                                        | AdvancedSkeleton                                                                                           | mGear Shifter                                                                            | Custom (`mx_rig`)                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| biped facing +Z; game or background character "not looked at closely" (Maya Learning Channel); HumanIK when animation is retargeted (2027 Help); 15 nodes, strict T-stance | body plus face from a fit skeleton, rebuilt by toggling fit; engine export via Convert to BlendShapes Only | many characters, a team, Unreal exporter; confirm a 2027 build for the OS first [verify] | hero rig, strict engine skeleton, rigs the agent must rebuild and verify: this workflow |

## Workflow

1. **Gate the model.** `mx_validate.validate(profile="model")` clean; cm; height to spec (about
   180); feet at y = 0; centered on X; frozen; eyes dead ahead; loops at knuckles, elbows, knees;
   mouth bag for a face (antCGi). Send problems back as a list; never edit a client model unasked.
   GATE: no fail; wire sheet looked at.
2. **Place joints** at pivots on edge loops: spine joint under the rib cage (antCGi), wrist
   decoupled from the palm (Fragapane), elbows pre-bent back, knees forward; the first upper-arm and
   thigh twist joint stays at the top with the shoulder or hip, mid twist joints are placed by
   position so they keep the parent's orientation (antCGi). GATE: `R.chain_plane` does not raise on
   any limb; joints over wireframe looked at.
3. **Build and orient.** `R.joint_chain(spec, parent, up="plane")` for limbs,
   `up=(0, 0, 1), up_axis="y"` for spine and neck, `world=[...]` for root, cog, head, eyes and feet
   (antCGi: animators, engine foot placement), `end_aim=` for clavicles; existing skeletons:
   `R.orient_with_cmds` ('zup' for legs and spine). `R.mirror_chain`: behavior for limbs,
   orientation for eyes and face; rotate orders on controls (`R.rotate_order(twist, main)`;
   Fragapane); `R.set_preferred_angles(root)`. GATE: `R.rig_check(joints=bind)` clean; mirror within
   1e-3 cm; all digits curl on one axis and sign, thumb fixed, so one attribute makes a fist
   (antCGi).
4. **Hand the bind skeleton to scenario-maya-deformation** (it binds while you build controls):
   joints only, one hierarchy, labels, `rig_check` JSON.
5. **Control rig.**
   `R.ikfk_limb(bind[:3], name, rig_parent, ctrl_parent, own_solver=char + "_ikRPsolver")`: handles
   of a type share one solver node, so several characters in a scene conflict (Fragapane: "can make
   a mess"; 2027 Help). Legs: `extra=[ball, toe], orient_end=False`, then `R.reverse_foot` with
   `R.foot_pivots_from_mesh`; spine P9; `R.space_switch(ctrl, [None, cog, chest], names=[...])`;
   `R.ikfk_match(meta, to="fk"|"ik", key=True)` uses stored offsets (antCGi instead adds a pole
   locator under the FK elbow and an ankle locator oriented like the IK foot). GATE:
   `R.neutral_switch_test` and pole drift below 1e-3; `R.space_test` as expected; FK and IK posed
   apart, `R.blend_sweep_test` finds no flip; roll sweep plants heel, ball, toe in turn; no
   shared-solver error; controls at zero.
6. **Scale and stretch.** Root scale only on groups that do not inherit it; stretch base lengths
   times root scaleY; IK spine joints under a world-pivot scale group, as segmentScaleCompensate
   blocks scale (antCGi). GATE: `R.scale_test` at 1.24 and 1.6, neutral and stretched, below 1e-3
   cm.
7. **Lock down.** `R.lockdown`; FK hinges keep their bend axis; limits; controller tags; selection
   sets. GATE: `R.lockdown_audit` and `R.opm_audit(rig)` empty; the rig still works.
8. **Performance.** Key first (`R.rom_keys`, two different values per used attribute): a keyless rig
   profiles fast and lies. `R.eval_census(rig)`, `R.eval_ab(bind, meshes, frames)`;
   `R.prepare_eval_graph(root=rig)` tags every control (with the animator's Preferences > Settings >
   Animation > Include controllers in evaluation graph, first keys stop rebuilding the graph) and
   turns on the curve manager for the session. `R.gpu_override_census(meshes)`, then the GUI
   Evaluation HUD must show a non-zero k count, else `deformerEvaluator -meshes` says why. Profile
   DG, Serial, Parallel and GPU Override with 1 and 3 referenced characters; keep dated profiles
   (Miquel Campos). GATE: no census error; modes agree within 1e-5; each dense mesh on the GPU or
   its reason written.
9. **Review.** `R.rom_keys`, then `mx_review.playblast` (GUI) or `R.pose_review` (headless);
   `R.precision_test` at shot distances; [`references/critique.md`](references/critique.md). GATE:
   frames looked at; elbows, knees, shoulders, wrists, feet read right.
10. **Deliver.** New version, `validate(profile="rig")` clean, test JSON, playblast, what was not
    verified.

## Numbers

| Value                                                                                                            | Relative to     | Source                   |
| ---------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------ |
| Twist joints: upper arm 2 (top, mid), lower arm 1, thigh 2, calf 1, plus wrist and foot                          | bone            | antCGi                   |
| Pole locator 30 units out by hand; computed pole distance = longer segment                                       | elbow           | antCGi; [added]          |
| Switch, drift, scale error below 1e-3 cm; mid-blend path within max(1 deg, 5%) of the direct angle               | bind joints     | [added] gates            |
| Foot break 25 deg: ball = roll to 25, then 50 - roll; toe = roll - 25; limits footRoll -40..80, footBank -60..60 | footRoll        | antCGi                   |
| Mid spine twist falloff 1, 0.5, 0.25                                                                             | ribbon joints   | antCGi                   |
| Precision: problems at 1e5 units, flicker at 1e6                                                                 | rig top node    | Fragapane                |
| Hosts out of limbs: 20 to 17 ms per frame                                                                        | one character   | Miquel Campos            |
| GPU Override: over 2000 vertices (NVIDIA), 500 (AMD); `MAYA_OPENCL_DEFORMER_MIN_VERTS`, 0 sends all              | per mesh        | Using Parallel Maya 2027 |
| blendMatrix equal shares: 1, 1/2, 1/3 ...; counting the inputMatrix: 1/2, 1/3 ...                                | ordered stack   | 2027 Help; [added]       |
| HumanIK 15 nodes; Unity 4 influences; Unreal FBX 2020.2                                                          | engine contract | docs                     |

## Quality gates

Code (`mx_rig`): `rig_check` (rest rotations, orientation, controls, poles, shared solvers, OPM
doubling, evaluation census, lockdown), `neutral_switch_test`, `blend_sweep_test`, `space_test`,
`scale_test`, `precision_test`, `eval_ab`, `gpu_override_census`, `game_skeleton_check`;
scenario-maya-expert's `validate(profile="rig")`.

Visual: placement over wireframe front and side; ROM playblast of every control axis, front, side
and three-quarter; foot roll scrubbed; scaled rig in an extreme pose. Look for knee pop, elbow
flips, candy-wrapper wrists, collapsing shoulders, sliding feet.

## Common mistakes

| Mistake                                                                       | What it looks like                                         | Fix                                                                                             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Orient Joint on a joint with rotations                                        | nothing changes, no error                                  | freeze rotations first, or `R.joint_chain`                                                      |
| Secondary world axis along the bone ('yup' on a leg, world Z on forward toes) | thigh and calf axes disagree                               | an axis across the bone; `R.orient_with_cmds` refuses it                                        |
| Straight elbow or knee                                                        | IK bends the wrong way or backwards                        | pre-bend, rebuild, set preferred angle                                                          |
| Pole off the chain plane; pole too close                                      | elbow drifts when constrained; arm flips as the hand moves | `R.pole_vector_position`; move it farther behind                                                |
| worldMatrix into OPM under a moving parent, or values left under an OPM drive | double transform, reversed rotation                        | parent's worldInverseMatrix or `.matrix`; `R.bake_to_opm`; `R.opm_audit`                        |
| Equal blendMatrix weights for an average                                      | the last target wins                                       | 1, 1/2, 1/3, or a parentMatrix node                                                             |
| Blending to a space's own matrix                                              | control snaps onto the target, IK flips                    | offset targets (`R.space_switch`)                                                               |
| Handles on the scene's shared solver                                          | referenced characters conflict; one edit changes every rig | `own_solver` per character                                                                      |
| Settings host inside the limb                                                 | slow playback (node-level cycle)                           | host on the limb's parent space                                                                 |
| Flip mid IK/FK blend                                                          | toes or wrist spin halfway                                 | constraint blend: interpType Shortest (antCGi); matrix blend: measure with `R.blend_sweep_test` |
| Profiling a keyless rig                                                       | numbers collapse once animated; stutter on first keys      | keys first; controller tags plus prepopulation                                                  |
| GPU Override HUD "Enabled (0 k)"                                              | nothing deforms on the GPU                                 | `R.gpu_override_census`, `deformerEvaluator -meshes`                                            |
| Scale wired twice, or stretch not normalized                                  | double scaling; limbs stretch when the rig scales          | scale non-inheriting groups only; base length times root scaleY                                 |
| Groups, handles, locators unlocked                                            | "key all" breaks the rig                                   | `R.lockdown`                                                                                    |
| Spline curve under its start joint; helpers under bind joints                 | dependency cycle; engine export errors                     | keep both outside the bind skeleton                                                             |

## Handoffs

- **Receives** from scenario-maya-modeling or scenario-maya-retopology-uv: a mesh passing
  `validate(profile="model")`, cm, Y-up, facing +Z, feet at y = 0, centered, frozen, symmetric,
  pre-bent limbs, eyes forward.
- **Delivers to scenario-maya-deformation:** the bind skeleton (joints only, one root, oriented,
  rotations zero, labels), `rig_check` JSON, and whether bind joints blend by constraint or through
  OPM (its pose readers depend on it); receives weights as data and correctives to reconnect.
- **Delivers to scenario-maya-animation:** the rig to reference, controls at zero and tagged,
  `validate(profile="rig")` clean, switch list, ROM playblast, known limits.
- **Game rigs to scenario-maya-pipeline-scripting:** `game_skeleton_check` clean, bind blends by
  constraint unless an OPM export was proven; they export the FBX.

## Maya 2027 notes

- 2026 renames: `addDL`, `multiplyDL`, `pointMatrixMultDL`; plain math names create unitless nodes;
  condition, multiplyDivide, reverse, blendMatrix unchanged.
- parentMatrix (2025) has Snap and Initialize Target Offset; `axisFromMatrix` replaces the per-axis
  nodes.
- Orient Joint: negative primary axes fixed in 2027.1; Auto orient secondary axis since 2025.
- `ikHandle` lists only RP, SC and spline; load spring and 2-bone solvers first. FBIK forces Serial:
  use HumanIK.
- GPU Override: 2027.2 known issue, a crash when scrubbing with it on (disable it or the
  invisibility evaluator); the paper covers OpenCL on AMD and NVIDIA only, so read the HUD on Apple
  GPUs [verify]. Evaluator settings are per session, not saved in the scene.
- Skin Tools layers block classic weight tools until deleted (scenario-maya-deformation). PySide6
  only; PyMEL is not bundled.

## References

- [`references/procedures.md`](references/procedures.md): code per stage and its test; before
  writing rig code.
- [`references/expert-notes.md`](references/expert-notes.md): judgment by expert, disagreements;
  when a decision is not covered here.
- `references/critique.md`: the rubric; at every gate.
- [`references/gui-paths.md`](references/gui-paths.md): menus, Profiler, HUD; when driving the GUI.
- [`references/sources.md`](references/sources.md): sources, URLs, timestamps.
