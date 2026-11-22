# scenario-godot-animation: critique rubric

How to judge an animation setup (your own, a teammate's or a plan) before it ships. Score each line
0 to 3: 0 missing, 1 claimed without evidence, 2 evidence with gaps, 3 evidence a reader can
reproduce (a kit call, a number, a sheet). Any 0 or 1 on A1 to A5 blocks.

## A. Evidence (blocking)

| #   | Check                             | Pass looks like                                                                                                                       | How to check                                                |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A1  | Every track resolves              | 0 unresolved node, bone, property, method and animation paths                                                                         | `gd_anim.audit` flags, `share_library` `unresolved_tracks`  |
| A2  | Loops and RESET                   | every cycle loops; RESET exists and covers every animated path; `reset_on_save` on                                                    | audit flags; for imports `animation/import_rest_as_RESET`   |
| A3  | Feet do not slide                 | controller and BlendSpace speeds equal the measured no-slide speeds (within 2 percent), scaled by `motion_scale` on retargeted bodies | `anim_motion.gd:foot_speed`, or root motion travel per loop |
| A4  | The tree does what the brief says | scripted input gives the expected state sequence with times; no expression transition left at advance mode Enabled                    | `anim_tree.gd:drive` states list; tree audit                |
| A5  | Pose seen                         | contact sheet of exact times opened: T-pose rest front and side, each locomotion state, IK on its terrain, cutscene timeline          | `gd_anim.pose_sheet`; image checks ok                       |

## B. Godot 4.7 correctness

| #   | Check                                   | Red flag                                                                                     |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| B1  | Import keys exist in 4.7.2              | `retarget/rest_fixer/overwrite_axis` (use `retarget_method`), keys copied from 4.0 tutorials |
| B2  | BoneMap names the imported bones        | `mixamorig:` in a BoneMap; GeneralSkeleton with no Hips                                      |
| B3  | Modern modifier API                     | SkeletonIK3D, `_process_modification()`, `set_bone_global_pose_override` in new code         |
| B4  | Modifier results read at the right time | reading IK results from `_process` (returns the animated pose)                               |
| B5  | Deterministic blending understood       | unfiltered partial clip in a OneShot or Add node; humanoid without a T-pose rest             |
| B6  | Project settings                        | 3D project without Jolt, renderer not the brief's (`project.godot`)                          |

## C. Craft

| #   | Check         | 3 looks like                                                                                                                                           |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | Readable gait | contact poses, passing pose and arm counter-swing visible in an 8-phase side sheet; hips lowest just after heel strike                                 |
| C2  | Transitions   | crossfades 0.1 to 0.2 s on locomotion, 0.05 on landing; no pop between last and first key of neighboring clips                                         |
| C3  | Layering      | upper-body actions filtered; legs untouched during a wave or attack                                                                                    |
| C4  | IK feel       | feet within 2 cm of the ground on steps and slopes, knees bend forward, hips drop only for the lower foot, influence lowered while running or airborne |
| C5  | Camera        | spring arm with a sphere shape, never inside walls; cutscene cuts respect screen direction; the last cutscene frame matches the gameplay camera        |
| C6  | Tweens        | one tween per property, explicit ease and transition, killed or bound to the node                                                                      |

## D. Scoring the G5 baseline answer (tests/baseline/answers_G4-G6.md)

| Line | Score | Why                                                                                                                    |
| ---- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| A1   | 2     | track resolution named in the checks, but the BoneMap script maps only core bones and never verifies renaming happened |
| A2   | 1     | loop modes set by script; no RESET in the plan (an imported file has none by default)                                  |
| A3   | 2     | speeds measured from non-in-place clips with `motion_scale` (correct); no check on the retargeted body's scaled speed  |
| A4   | 2     | GUT state sequence planned; nothing about advance mode or simultaneous transitions                                     |
| A5   | 2     | captures planned, no exact-time seeking                                                                                |
| B1   | 0     | lists `retarget/rest_fixer/overwrite_axis`, which 4.7.2 does not have                                                  |
| B2   | 3     | uses `mixamorig_` (the sanitized name) in the BoneMap                                                                  |
| B4   | 1     | FootAlign "then rotates each foot" without saying where the result is read                                             |
| B5   | 1     | OneShot with a filter planned, but no word on the deterministic default                                                |
