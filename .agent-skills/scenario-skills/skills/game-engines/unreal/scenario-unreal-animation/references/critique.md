# scenario-unreal-animation: self-critique rubric

Use at every gate and before delivery. Score each line 0 (fails), 1 (partly), 2 (meets). A delivery
needs no 0 on a line marked **gate** and a written reason for every 1. Measurable lines cite the
check that proves them; visual lines cite the frames looked at (paths). Never approve a capture that
`ue_review.image_checks` flags as all white or all black.

## A. Intake and skeleton

| #   | Line                                                                                         | Proof                                                             |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A1  | **gate** One root at the origin, no namespaces or duplicates, units right (height plausible) | `import_audit` no error                                           |
| A2  | Influences within 8 or unlimited influences enabled on purpose; non-hero near 12             | `import_audit` I08, I09; vertex inspection when facts are missing |
| A3  | No unused bones left "just in case"; procedural bones in the Control Rig Construction Event  | `import_audit` I07                                                |
| A4  | Every clip on the intended skeleton, one clip per file, curves clean at import               | `anim_content_audit` A07, A04, A05                                |
| A5  | Transfer method chosen from the ladder with a written reason                                 | `transfer_method` output                                          |

## B. Retarget

| #   | Line                                                                                                                                                           | Proof                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| B1  | **gate** Named retarget pose (not Default), aligned, snapped to ground, slight knee and elbow bend                                                             | retargeter asset, side screenshot of the pose                    |
| B2  | **gate** Op stack legal: Retarget Pose first if present, one Scale Source at the top, Run IK Rig enabled, Blend to Source on both legs when proportions differ | `op_stack_check` no error                                        |
| B3  | No target chain mapped to None; legs carry IK goals; 5.8 Foot chains present                                                                                   | `chain_map_check`                                                |
| B4  | **gate** Feet neither sink nor float, plants match the source on walk, run, turn, crouch, jump, a contact clip and a mocap clip                                | `compare_contact` per clip and foot                              |
| B5  | Contact frames looked at side and front; knees and elbows point right; props and hands stay on contact; pelvis height sane on crouch                           | contact sheet paths                                              |
| B6  | Batch used a hand-built retargeter; additive flags retained; Retarget Output Log clean                                                                         | batch report, `retarget_log_check`                               |
| B7  | Mocap filtered without visible lag on fast moves                                                                                                               | `filter_bones_check`, capture of a fast move                     |
| B8  | IK helper bones the gameplay reads (`ik_foot_l/r`, `ik_hand_gun`) exist on the target and are pinned; props pinned with relative scale                         | `ik_bone_pin_plan`, `op_stack_check` R16, capture with leg IK on |
| B9  | Runtime retargeter only: per-op LOD thresholds, Profile Ops timings on the target                                                                              | `op_stack_check(runtime=True)` R14, R17                          |
| B10 | One-off corrections live in an Additive Pose op, not in the base retarget pose or IK settings                                                                  | op stack listing                                                 |

## C. Locomotion

| #   | Line                                                                                                                                                                                        | Proof                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| C0  | Movement model tuned before authoring; clips follow the exported capsule path, chest within tolerance, stops end with the capsule                                                           | `capsule_match`, model values recorded                               |
| C1  | Architecture decision written with its deciding condition (coverage, responsiveness, control); capsule vs root-motion-driven decided with its condition (multiplayer vs single-player hero) | `decide_locomotion`                                                  |
| C2  | **gate** Every locomotion clip has root motion enabled; no moving clip without root displacement                                                                                            | `anim_content_audit` A08, `root_motion_check` M01, M05               |
| C3  | **gate** Movement model speeds match clip speeds per gait before any weight is touched                                                                                                      | `speed_parity`                                                       |
| C4  | Databases split per movement state, Chooser on cached enums, interrupt only on core state change, Brute Force for Chooser-column databases                                                  | `database_plan`, Chooser screenshot                                  |
| C5  | Coverage: starts and stops on both feet, refacing 90 and 180, arcs, strafes if designed; every start, stop, refacing start has its other-foot variant or a mirror table for this skeleton   | `motion_matching_coverage` (`foot_pairs_missing`)                    |
| C6  | Zero "no database" warnings while cycling every state in PIE                                                                                                                                | log scan                                                             |
| C7  | Rewind Debugger read on each transition frame (Active vs Continuing, channel breakdown); fixes went to data or tags, not global weights                                                     | notes with frame numbers                                             |
| C8  | Starts, stops, pivots, refacing turns at 0.25 timescale from a still camera: planted feet, weight shifts, immediate reaction; camera lag ruled out                                          | capture paths                                                        |
| C9  | Montages: root motion on, no root velocity in the blend-out window, capsule stays with the mesh                                                                                             | `montage_blend_out_check`, `show collision` capture                  |
| C10 | Double footsteps absent (Should Filter Notifies)                                                                                                                                            | PIE audio or notify log                                              |
| C11 | **gate** No duplicated schema, Pose History or traversal channel names a bone the target lacks; schema skeleton and mirror table are the target's                                           | `schema_bone_check`                                                  |
| C12 | Steering evaluates before Offset Root Bone and only while moving or in air; orientation warping inside the blend stack; offset root modes per state (Interpolate, Release, Accumulate)      | `procedural_order_check`, `offset_root_bone_modes`, wall-run capture |
| C13 | Traversal tails return through a JustTraversed locomotion database; montages blend out early                                                                                                | `database_plan`, capture of a vault run-out                          |

## D. IK and rigs

| #   | Line                                                                                                                                                                              | Proof                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| D1  | Foot IK on stairs and a slope: feet aligned, no hyperextension, no pop, no jitter standing; not relying on GASP 5.4 leg IK for ground adaptation (it only locks to IK foot bones) | captures, per-frame foot gap                     |
| D2  | Control Rig: setup in Construction, per-frame work in Forwards Solve, profiled in microseconds, LOD threshold for distance                                                        | profiler screenshot, node LOD value              |
| D3  | Rigs meant for Sequencer have a Backwards Solve and hold IK/FK switches without jitter                                                                                            | Bake To Control Rig lists the rig; scrub capture |

## E. Performance

| #   | Line                                                                                                                                                                                                                                                        | Proof                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| E1  | **gate** Numbers before and after in the same scene and path: `stat anim`, `stat unit`, Insights animation channel                                                                                                                                          | saved captures, `ue_stat.budget_check`                               |
| E2  | Every AnimBP multithreaded, zero Warn About Blueprint Usage warnings                                                                                                                                                                                        | `compile_and_scan`                                                   |
| E3  | Root Motion Mode chosen by its real reason (capsule-driven networking), and its game-thread cost budgeted: Everything AND Montages Only both update the AnimGraph on the game thread; No Root Motion Extraction where no root-motion montage plays [verify] | `root_motion_mode_check`, AnimBP CDO value, Insights game thread     |
| E4  | Only Tick Pose When Rendered default; allocator or URO, never both; allocator line at or under budget                                                                                                                                                       | ini diff, `allocator_config_check`, `a.Budget.Debug.Enabled` capture |
| E5  | Shared LOD Settings asset, hysteresis on every LOD, bone reduction, influences non-increasing                                                                                                                                                               | `lod_settings_check`, captures at distances                          |

## F. Characters (when in scope)

| #   | Line                                                                                                            | Proof                                            |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| F1  | **gate** MetaHuman in games uses the Optimized pipeline; Mac and mobile on cards; DNA and face LOD counts match | `metahuman_tier_check`                           |
| F2  | MetaHuman LODs auditioned at the game camera                                                                    | captures per LOD                                 |
| F3  | ML Deformer ROM covers shipped extremes; tested on a novel clip with the Ground Truth heat map                  | `ml_deformer_data_check`, heat map capture       |
| F4  | Cloth stable at the shipping substep count on sprint, turn, stop, crouch; reads as the intended fabric          | `cloth_config_check`, captures front, side, back |

## G. Honesty of the report

| #   | Line                                                                                           | Proof  |
| --- | ---------------------------------------------------------------------------------------------- | ------ |
| G1  | **gate** Every snippet not run in this engine is marked; every `[verify]` still open is listed | report |
| G2  | GUI steps done by computer use are named (Chooser rows, op settings, graph edits, ML training) | report |
| G3  | Numbers carry what they are relative to; [added] thresholds are named as such                  | report |
