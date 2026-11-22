# Critique rubric (judge your own animation work before calling it done)

Score every stage. A stage passes only when every measurable line passes and every visual line was
checked on a contact sheet you opened. Write the result into the handoff as Verified (with numbers
and sheet paths) or Assumed.

## 1. Import

| Check                 | Pass                                                                                             | How                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Rig type              | Humanoid where retargeting is needed; Generic by choice, with Root Node empty unless root motion | `AnimImport.AuditImports` `animation_type`, `avatar_setup`                                                      |
| Avatar                | character avatar valid and human; clips `human_motion`                                           | audit fields; `anim.avatar_invalid`, `anim.clip_not_human`                                                      |
| Clips exist           | no `anim.no_clips`, no `anim.copy_avatar_hierarchy_mismatch`                                     | the import log is the only place Unity reports it                                                               |
| Names                 | no "mixamo.com", "Take 001"                                                                      | `anim.default_clip_name`                                                                                        |
| Root settings by role | idle: rotation, Y, XZ baked; locomotion: rotation, Y; jump: Y off + Feet; turn: rotation free    | clip rows `lockRoot*`, `heightFromFeet`                                                                         |
| Roles                 | every clip got its role from a rule or its file name, never from the take name                   | no `anim.role_fallback`                                                                                         |
| Based Upon            | chosen for placement (the idle pose faces and stands on its GameObject), not against drift       | `LocomotionMetrics` with `clip`: `pose_yaw_offset_deg`, `pose_xz_offset_m`                                      |
| Standalone clips      | no bone-path `.anim` used with humanoids (a pre-conversion duplicate)                            | `AnimImport.AuditClips`: no `anim.generic_duplicate`; controller: no `anim.generic_clip_in_humanoid_controller` |
| Import masks          | fingers and IK goals masked on clips that do not use them (cost)                                 | clip rows `mask_type`, `mask_source`                                                                            |
| Scope                 | an FBX outside the rules folder stays as imported                                                | audit a control folder                                                                                          |
| Visual                | the same clip on the character: no hands through the body, no feet through the floor, no T-pose  | `SampleStates` sheet; `ClipProfile` `arm_drop` near 0 means a T-pose frame                                      |

## 2. Controller

| Check                         | Pass                                                                                                                   | How                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Static audit                  | `counts.error == 0`                                                                                                    | `AnimControllerBuilder.Audit`                                                                |
| Tree type fits the motion set | no Simple Directional with two motions per direction or 180 deg pairs; Cartesian for non-direction axes                | `tree.simple_directional_*`                                                                  |
| Coordinates                   | children at measured speeds (m/s, deg/s); runtime parameters inside the extents                                        | dump `pos` vs audit `average_speed`; `ua.blend_tree_checks(..., param_ranges)`               |
| Idle                          | own state (root motion or dissimilar pose), IsMoving without exit time                                                 | `tree.idle_in_locomotion` info                                                               |
| Layers                        | Override layers masked; no unmasked Override above Additive                                                            | `layer.*` findings                                                                           |
| Transitions                   | urgent exits above what they must cancel; no Any State to self                                                         | dump `priority`, `interruption`, `anim.any_state_to_self`                                    |
| Interruptions                 | the urgent trigger fired mid-transition wins; interrupting transitions short (the blend starts from a frozen snapshot) | `SampleStates` `events` + `trace`: final state, `next`, `bone_deg_s` 0 on the snapshot frame |
| Names                         | code uses the generated hash class                                                                                     | compile of `hash_class`                                                                      |

## 3. Motion quality

| Check              | Pass                                                                                        | How                                              |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Speed match        | measured ground speed within 5 % of the tree position                                       | `LocomotionMetrics.ground_speed`                 |
| Feet               | planted-contact slide p50 < 0.25 m/s; no burst in the first 0.5 s of walking                | `ua.foot_slide`, sheet of the start              |
| Mask               | masked bones unchanged between layer weight 0 and 1 (0.000 deg); driven bones change        | `SampleStates` bones                             |
| Loops              | no pop at the wrap (compare first and last sampled pose)                                    | two samples one clip length apart                |
| Idle drift         | under 1 cm and 0.5 deg over 30 s                                                            | `LocomotionMetrics` `clip`, 30 s                 |
| Vertical ownership | jump Y unbaked + Feet; `gravityWeight` 0 through it and blending back to 1 (root motion on) | `SampleStates` `root_motion: true`, `trace` `gw` |
| Visual             | weight shifts read, no floating in jump blends, no idle drift over 30 s                     | sheet at walk start, jump land, long idle        |

## 4. Rig

| Check     | Pass                                                                                                  | How                                          |
| --------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Structure | RigBuilder on the Animator object; Rig in a layer; Rig beside the skeleton                            | `AnimRigging.AuditRigs`                      |
| Order     | body constraints before head or hand                                                                  | `rig.solve_order` absent; head error < 1 deg |
| IK        | hand within 1 cm of a reachable target; elbow toward the hint                                         | `hand_error_m`, `elbow_side_dot > 0`         |
| Weight    | rig weight 0 when not aiming, eased to 1 over the intended time; fades as the head target goes behind | a PlayMode sample of `Rig.weight`            |
| Targets   | one target per constraint, moved; no constraint data rebound at runtime                               | `ua.scan_csharp`: no `rig.runtime_rebind`    |
| Visual    | no wrist or neck over-twist at extreme targets; natural body share (0.7 or 0.3)                       | side-view sheet with the target marker       |

## 5. Cameras

| Check            | Pass                                                                                                                                                                                       | How                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Package          | Cinemachine 3.1.x in packages-lock.json                                                                                                                                                    | `ua.pinned_packages`                                                       |
| Audit            | no CM2 components, a Brain, Smart + Late, input controller on orbits, Ignore Tag on avoidance and Deoccluder, no FreeLook + Camera Offset + Deoccluder, no Animator on a procedural camera | `AnimCinemachine.AuditCameras` 0 warn                                      |
| Switching        | live camera per event; blend length as defined; custom blends honored (Cut is instant)                                                                                                     | `CameraProbe` rows                                                         |
| Flips and swings | `min_up_dot > 0.95`; closest approach above half the start distance                                                                                                                        | `ua.camera_probe_checks`; CylindricalPosition on cameras around the target |
| Framing          | tracked target near its screen position in steady state                                                                                                                                    | probe `target_vp`                                                          |
| Occlusion        | target visible along the path; camera never inside geometry; glass and triggers ignored                                                                                                    | probe `obstacles` + `occluded_frames`, `inside_geometry_frames`            |
| Jitter           | target screen steps do not reverse frame to frame                                                                                                                                          | probe `series` -> `ua.jitter_metrics` reversal < 5 % [added threshold]     |
| Visual           | composition, damping feel, no jitter on moving targets                                                                                                                                     | probe captures                                                             |

## 6. Timeline

| Check      | Pass                                                                                                                   | How                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Bindings   | every output track bound (the Timeline marker track needs none)                                                        | `BuildCutscene.bindings`                                                                                       |
| Blends     | overlaps blend with the default ease-in-out (1.5 at the middle of 1 to 2)                                              | `SampleCutscene` light rows                                                                                    |
| Continuity | no root snap between clips (offsets matched)                                                                           | tracked object positions                                                                                       |
| Events     | markers and signals fire once, with payloads; every emitter has a reaction, every marker a receiver that type-checks   | `PlayCutscene`; `AuditTimeline` 0 warn; `ua.scan_csharp`                                                       |
| Handoff    | wrap None hands the character back to its controller and the camera back to the Brain's priority camera, without a pop | `PlayCutscene` `after_stop_frames`: `live_after_stop` (Play mode: an edit-mode scrub keeps the last shot live) |
| Visual     | shot rhythm, eyelines, framing in every shot, light cues                                                               | sheet at shot midpoints and blends                                                                             |

## 7. Code

| Check               | Pass                                                                                                                                              | How                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Traps in project C# | no one-Move violations, no `deltaPosition * deltaTime`, no unscoped or take-name import processors, no untyped `OnNotify`, no CM2 or legacy input | `ua.scan_csharp(Assets)` empty (read every hit: heuristics) |

## Verdict words

- **Pass**: all measurable lines pass and the sheets were opened.
- **Warn**: a line fails with a stated reason the user accepted (for example a stylized snap).
- **Fail**: any error finding, a T-pose or bind pose on a sheet, a head or hand off target, a camera
  flip or swing through the target, a missing marker, an idle that drifts.
