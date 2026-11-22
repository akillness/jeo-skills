# Critique rubric: scenario-maya-rigging

Load at every gate. Run the code checks first, then open the sheets or playblast and answer the
visual questions. A **blocker** stops the stage; a **fix** is done before delivery; a **note** goes
into the delivery report. Fragapane's standard applies throughout: every attribute and node in the
rig can be explained; nothing is there "because Maya wants it" (rfLEBgOEW1A [01:57:02]). Thresholds
marked [added] are this skill's defaults, not an expert's number.

## 1. Model intake (before any joint)

| Check                                                                                                | How                                                     | Severity                                           |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| cm, feet on y = 0, centered on X, height to spec, frozen                                             | `R.model_gate`, `mx_validate.validate(profile="model")` | blocker                                            |
| eyes modeled dead ahead, mirrored                                                                    | `model_gate(eyes=...)`, front render                    | fix before rigging (antCGi e74KphYwMww [00:08:14]) |
| loops at knuckles, elbows, knees, lids, lips; triangles out of deforming zones; mouth bag for a face | wire sheet front and side                               | send back to modeling as a list                    |
| arms raised enough to paint under                                                                    | front sheet                                             | note or send back                                  |

Ask: would antCGi rig this or send it back? "Don't be afraid to ask for changes" [00:26:19].

## 2. Placement

- Every joint sits at an articulation, on an edge loop, centered in the volume (projected center),
  spine joints exactly on x = 0 (antCGi fGacyVzJGIU [00:10:15] [00:13:11]). Look at joints over the
  wireframe front and side.
- Elbows pre-bent back, knees forward; `R.chain_plane` does not raise; the bend plane points where
  the joint really bends (AdvancedSkeleton mTB9Yh_sWKc [00:14:50]). Blocker if straight.
- Wrist decoupled from the palm; spine joint under the rib cage; hip at the femoral head (Fragapane
  [01:16:07]; antCGi [00:11:24]).
- Twist joints on the bone line, sharing the parent's orientation (antCGi [00:24:14]).
- Joint count within the budget; names match the target skeleton when engine animation is reused.

## 3. Orientation

| Check                                                   | Threshold                                                                                  | Severity                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| rotate at rest                                          | 0 within 1e-3 deg on every bind joint (`rig_check`)                                        | blocker (antCGi FN05iGspldI [00:07:16])       |
| child on the parent's aim axis                          | off-axis ratio below 1e-3 (`rig_check` missing_orient)                                     | blocker                                       |
| one bend axis per limb, positive rotation flexes        | Z axes parallel within 1e-6 [added]                                                        | fix                                           |
| end joints match the parent                             | jointOrient 0                                                                              | note                                          |
| mirrored positions                                      | within 1e-3 cm                                                                             | blocker                                       |
| mirror mode                                             | behavior on limbs, orientation on eyes and face                                            | fix                                           |
| rotate orders                                           | set on controls by main axis (twist inner, main outer); joints only for export conventions | fix (antCGi [00:25:42]; Fragapane [00:41:24]) |
| preferred angles set on the bent rest pose              | query `preferredAngle`                                                                     | note                                          |
| secondary world reference across every bone it oriented | no joint within 30 deg [added] of it (`R.sao_conflicts`; `orient_with_cmds` refuses)       | fix (antCGi FN05iGspldI [00:06:44])           |

Visual: local rotation axes displayed on a sheet or in the GUI (Display > Transform Display > Local
Rotation Axes): no mixed axes at wrist or foot; all digits curl on the same axis (antCGi
[00:08:10]).

## 4. Controls

- Every control at zero: translate and rotate 0, scale 1, placement in offsetParentMatrix
  (`rig_check` unfrozen). Blocker.
- Rotate order of each control equals its joint's; shapes readable outside the mesh, sized to
  select, colored by side; controller tags and pickwalk parents. Fix.
- No control's channels owned by a constraint the animator cannot see (keying a constrained channel
  adds a pairBlend, 2027 Help). Fix.
- OPM composition: `R.opm_audit(rig)` empty, i.e. no node with a connected offsetParentMatrix keeps
  translate, rotate or jointOrient (they apply twice), and no `worldMatrix` feeds the OPM of a node
  under a moving parent (world = local * OPM * dagParentWorld, 2027 transform node; MLC JOYMV-bQdlM
  [00:09:15] [00:10:27]; antCGi yls25bV-IZU [00:18:08]). Blocker.

## 5. IK/FK

| Check           | Threshold                                                                                                                       | Severity                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| neutral switch  | bind world matrices identical at 0 and 1 within 1e-3 (`neutral_switch_test`)                                                    | blocker (antCGi yls25bV-IZU [00:06:35])                                          |
| pole drift      | below 1e-3 cm; pole on the chain plane (`pole_report`)                                                                          | blocker                                                                          |
| no flip         | elbow stays on the pole side over the reachable range (`test_rig_ik` sweep)                                                     | blocker                                                                          |
| match both ways | after `ikfk_match` the bind pose moves less than 1e-2 cm [added]                                                                | fix                                                                              |
| visibility      | only the active mode's controls                                                                                                 | fix (antCGi [00:01:24])                                                          |
| settings host   | on the limb's parent space, not deep in the limb                                                                                | fix (Miquel Campos NfYAaK3wtQs [00:12:51])                                       |
| solver          | one solver node per character (`own_solver`); none shared with handles outside the rig (`rig_check` error)                      | fix; blocker when characters share shots (Fragapane [00:34:43]; 2027 IK solvers) |
| mid-blend       | FK and IK posed apart: `blend_sweep_test` path within max(1 deg, 5%) of the direct angle [added]; constraint blends on Shortest | fix (antCGi jXmK0Vl5iYA [00:32:51]); measure matrix blends, do not assume        |

Visual: the arm in a range of IK positions from front and top: elbow direction stable, no pop at
full extension, wrist level when the body moves.

## 6. Spaces

- Each enum value makes the control follow exactly its space; world follows nothing (`space_test`).
  Blocker.
- Continuous multi-space blends use ordered weights (1, 1/2, 1/3) or a parentMatrix node, never
  equal numbers typed into blendMatrix (the last target wins; 2027 Help). Fix.
- Rest pose unchanged in every space; the control keeps its distance from the target (never snaps
  onto it, antCGi BFCggv0SV0s [00:05:18]). Blocker.
- Switching during animation does not pop (`switch_space`). Fix.

## 7. Foot

- footRoll sweep -40..80: heel, then ball, then toe tip planted in turn, no jump at 0 or at the
  break; bank rocks around the correct edge both ways; limits set (antCGi jXmK0Vl5iYA; DO6RztqbwzA
  [00:24:19]). Blocker for walk cycles.
- Pivots on the floor, aligned heel to toe in top view; all pivot channels at zero. Fix.
- Visual: scrub the roll in a side playblast: no sliding at the contact, the ankle rises smoothly,
  the knee does not pop.

## 8. Spine and neck

- Joints do not move when the spline is created (shift reported by `test_rig_spine`; below 0.05 cm
  is the goal [added]). Fix.
- Each control twists and bends its own region; top stays still when the base twists (antCGi
  KiqpzKUJKt0 [00:14:52]); no dependency cycle. Fix.
- Visual: side and front playblast of a bend and a twist: smooth falloff, no kink at the chest.

## 9. Scale, stretch, precision

| Check                                        | Threshold                                                 | Severity                                          |
| -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| scale 1.24 and 1.6, neutral and stretched    | below 1e-3 cm after dividing by the factor (`scale_test`) | blocker (antCGi DO6RztqbwzA [00:05:56])           |
| stretch reaches the control beyond reach     | below 1e-2 cm                                             | fix                                               |
| distance test at the shot's largest distance | deviation below 0.01 cm [added] (`precision_test`)        | note, or localize the skin (Fragapane [01:53:38]) |

## 10. Animator proofing

- Select everything under the rig and key: only control channels take keys (`lockdown_audit` empty).
  Blocker (antCGi [00:13:18]).
- FK hinges keep only their bend axis; attribute ranges limited where the rig breaks; selection sets
  exist; the rig is referenced cleanly (no namespace-dependent names). Fix.
- A control an animator will want for a pose automation cannot reach is added (Miquel Campos
  rDHTdhzKpvI [00:50:15]). Note.

## 11. Performance

| Check                    | Threshold                                                                                                                                                                                                 | Severity                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| census                   | no untrusted expressions, Python nodes, driven frozen, ikMCsolver, FBIK in the rig (`eval_census`)                                                                                                        | blocker                                              |
| correctness across modes | DG, Serial, Parallel within 1e-5 (`eval_ab`)                                                                                                                                                              | blocker (Using Parallel Maya 2027)                   |
| animation curves         | profiling done with animated curves (`census["curves"]["animated"]` not empty), a few per component, not flat keys on everything                                                                          | fix (Fragapane _0mb4wIZi80 [00:20:14] [01:16:10])    |
| graph prepopulation      | every control tagged; Include controllers in evaluation graph or the curve manager named in the delivery notes                                                                                            | fix (Using Parallel Maya 2027, Reduce Graph Rebuild) |
| playback                 | measured in the GUI per mode with 1 and 3 characters, dated profiles saved                                                                                                                                | note with numbers (Miquel Campos [00:05:26])         |
| GPU Override             | `gpu_override_census` eligible for every mesh over 2000 (NVIDIA) or 500 (AMD) vertices, or the reason listed; HUD shows a non-zero k count in the GUI; 2027.2 scrubbing crash and Apple GPU status stated | note (Using Parallel Maya 2027)                      |

## 12. Game skeleton

- `game_skeleton_check` clean: one root at the origin, world oriented; joints only below it; unique
  names without namespaces; budget; required names; influences within the engine limit. Blocker.
- Bind blends by constraint unless the FBX round trip of OPM-driven joints was proven
  (`test_rig_game`). Blocker for export.
- Physics joints without controls; engine-side names and sockets agreed with the lead. Note.

## 13. The delivery report (honesty)

- States the numbers of every gate above that ran, the frames or sheets looked at, and what was not
  verified (for example "GPU Override not tested: headless run", "face not rigged: model has no
  mouth bag").
- Never "done" without a look at a range-of-motion playblast or pose sheets (scenario-maya-expert
  loop). Never "verified on 2027" for code whose test did not run.
