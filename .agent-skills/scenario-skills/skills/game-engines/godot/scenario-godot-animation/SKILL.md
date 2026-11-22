---
name: scenario-godot-animation
description: "Use when animating characters or scenes in Godot 4.7: AnimationPlayer clips and RESET, AnimationTree state machines and blend spaces built in code, Mixamo or glTF import, loop settings, BoneMap retargeting and shared animation libraries, root motion, foot sliding, foot IK with TwoBoneIK3D or custom SkeletonModifier3D, tweens, SpringArm3D cameras, cutscenes; or when a character T-poses, slides, floats, freezes mid-blend or a transition never fires."
license: MIT
---

# Godot animation (animator and technical animator)

Target: Godot 4.7.2.stable, macOS, Forward+ with Jolt Physics. Every procedure in
[`references/procedures.md`](references/procedures.md) was run live in 4.7.2 on 2026-10-02 against a
procedurally built humanoid, so nothing needs a download.

## Stance

- **Measure motion, do not eyeball it.** A walk has one correct ground speed: the speed at which the
  planted foot stops sliding. Measure it from the clip (`anim_motion.gd:foot_speed`) and use that
  number for BlendSpace points and the controller. On a retargeted body the speed scales with
  `Skeleton3D.motion_scale` (a 1.15x body walked 1.38 m/s on a 1.2 m/s clip).
- **Code decides, the animation layer presents.** Gameplay owns velocity and state; the
  AnimationTree only reads them through advance expressions or parameters. The controller must still
  work with the tree removed (Fair Fight, jzuvd0Lstuw 00:05:46).
- **Look at exact times.** Seek or step to fixed times and open a contact sheet
  (`gd_anim.pose_sheet`). Real-time captures land on random frames.
- **A layer must say which bones it owns.** Partial clips do not stay partial: glTF export pads
  every clip with every animated joint, and an unfiltered OneShot under the default deterministic
  blending snaps every unlisted bone to RESET. Filters, not missing tracks, define layers.
- **Choose the driver per motion.** Velocity-driven locomotion with in-place clips keeps control
  responsive; root motion suits one-shot moves (dodge, climb, vault) where the feet must stay
  planted [added]. A tree suits a normal locomotion set; very large move sets or many procedural
  layers favor code plus SkeletonModifier3D layers (the experts disagree: Fair Fight against trees,
  xpoPfUKI9tw; RiftOfNostaria, Bitlytic and Chris for them). Tweens for runtime values with unknown
  starts, AnimationPlayer for authored multi-property curves (Queble, KUyQzjpRsU8 00:01:48).
- **Silent failures are the norm here.** A BoneMap naming bones that do not exist, an expression
  transition at advance mode Enabled, a missing RESET key: each produced no error in 4.7.2. Audit
  after every import and every tree change. If a sibling skill named here is missing from your
  available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
  (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
  the gap.

## Establish first

Ask once, then run:

1. Source of motion: Mixamo or other FBX, Blender glTF, mocap, hand-keyed in Godot, procedural only.
2. Rig: humanoid (SkeletonProfileHumanoid fits) or custom; T-pose or A-pose rest; real Root bone or
   not.
3. Locomotion model: velocity-driven (in-place clips) or root motion; target speeds if the design
   fixes them.
4. Layers needed: upper-body actions, aim or look-at, foot IK on uneven ground, hit reactions.
5. Characters sharing clips, and their height range.
6. Cutscenes: length, camera count, whether gameplay must be frozen, dialogue system in use.
7. Physics tick, renderer and target hardware (for IK and modifier cost).

## Workflow with gates

1. **Kit and project.** `gd_anim.install_animkit(P)`; confirm `project.godot` has Jolt for 3D and
   the brief's renderer. Gate: the kit's jobs return `ok`.
2. **Import.** Name cycles with a loop hint (`Walk-loop`), import once, then set options in the
   `.import` file (`gd_anim.set_import_options`, P3) and run `--import`. Turn on
   `animation/import_rest_as_RESET`. Gate: `gd_anim.audit` has no flags; every cycle loops; RESET
   exists.
3. **Retarget.** Build the BoneMap from the imported bone names (`anim_import.gd:make_bonemap`, P4);
   `:` becomes `_` on import. Gate: skeleton is `%GeneralSkeleton`, bones renamed, sampled poses
   within 2 mm of the source.
4. **Share.** Import clips As Animation Library, give each body its own BoneMap, attach with
   `anim_setup.gd:share_library` (P5). Gate: 0 unresolved tracks, identical track layout.
5. **Speeds.** `foot_speed` per cycle and per body (P9). Gate: controller and BlendSpace speeds
   within 2 percent.
6. **Tree.** Build in code ([`anim_tree.gd`](scripts/agentkit/animation/anim_tree.gd), P6):
   BlendTree root, StateMachine inside, BlendSpace1D with sync, OneShot with a filter, TimeScale.
   Gate: `drive` with scripted input gives the expected state list and times; tree audit clean. The
   transition helper that passed the drive test:

   ```gdscript
   static func transition(expr: String, at_end: bool, xfade: float) -> AnimationNodeStateMachineTransition:
       var t := AnimationNodeStateMachineTransition.new()
       t.xfade_time = xfade
       t.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO   # default Enabled never auto-fires
       if at_end:
           t.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END
       if expr != "":
           t.advance_expression = expr        # read on tree.advance_expression_base_node
       return t
   # sm.add_transition(&"Ground", &"Fall", transition("not on_floor and not jump_pressed", false, 0.2))
   ```

   Drive it from gameplay with `tree.set("parameters/sm/Ground/blend_position", speed)` and the
   state node's properties; fire actions with
   `tree.set("parameters/act/request", AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)`.

7. **Layers and IK.** OneShot filters (P7), FootPlacer plus TwoBoneIK3D (P10). Gate: foot within 2
   cm of the target on a step, a hole and a 15 deg slope, read in `skeleton_updated`. Modifiers run
   in child order, so the placer (targets and hips) goes before the solver:

   ```gdscript
   var ik := TwoBoneIK3D.new()
   skeleton.add_child(ik)                       # after FootPlacer
   ik.setting_count = 2
   for i in 2:
       var side: String = ["Left", "Right"][i]   # := cannot infer from an array index
       ik.set_root_bone_name(i, side + "UpperLeg")
       ik.set_middle_bone_name(i, side + "LowerLeg")
       ik.set_end_bone_name(i, side + "Foot")
       ik.set_target_node(i, ik.get_path_to(targets[i]))
       ik.set_pole_node(i, ik.get_path_to(knee_poles[i]))      # 0.6 m in front of the knee
       ik.set_pole_direction(i, SkeletonModifier3D.SECONDARY_DIRECTION_PLUS_Z)
   skeleton.skeleton_updated.connect(_check_feet)   # final pose, after every modifier and influence
   ```

   Lower `influence` while running and set it to 0 in the air, so authored motion shows through
   (Lukky, MbaPDWfbNLo 00:09:30).

8. **Camera and cutscene.** SpringArm3D with a sphere shape (P12); one AnimationPlayer timeline
   (P13). Gate: call order and times, camera at checkpoints, `animation_finished`, section playback.
9. **Look.** Pose sheets: T-pose front and side, 8 walk phases, each state, IK terrain, cutscene
   timeline (P14). Gate: every sheet opened and described.

## Expert checklist (state these in the plan)

- **Modifier output is rolled back every frame** (Fair Fight XFZQNsFejwk 00:02:04; P10 reads the
  animated pose a frame later). Fine for post effects; when modifiers own the pose, put
  [`pose_persist.gd`](scripts/agentkit/animation/pose_persist.gd) with role RESTORE first and
  SNAPSHOT last: an incremental 5 deg modifier then reached 60 deg in 12 frames instead of staying
  at 5 (P16). RESTORE overrides the animation, so never use it on top of a playing clip.
- **IK solves position only.** TwoBoneIK3D left the foot 12.1 deg off a 15 deg slope; a
  `CopyTransformModifier3D` after it (rotation only, reference type Node, an align node with the
  ground tilt) brought it to 0.0 deg without moving the foot (P16; Lukky MbaPDWfbNLo 00:07:49).
- **Deterministic IK** solves from scratch each frame; a one-iteration chain needs the angle limit
  at the full 180 deg (Lukky 00:04:46). `deterministic` defaults to false on IterateIK3D; turn it on
  for stepping legs (MeroDev 17xi4vDqQJk 00:02:28).
- **Bezier and property tracks cannot blend** (docs): the tree blends value, position, rotation and
  scale tracks.
- **Call Method tracks do not run in the editor preview** (docs): test them in a run (P13).
- **Capture update mode** blends from the current value to the first key: a property at 5 with a key
  10 at 0.5 s read 7.5 at 0.25 s under `play_with_capture` (P16).
- **Cache `find_track`** in a path-to-index map when scripts sample many tracks: Fair Fight measured
  1.5 to 3x on large rigs (XFZQNsFejwk 00:04:03 to 00:06:45); on the 22-track test rig in GDScript,
  1.2x (P16). It needs one track layout across clips, so turn off
  `animation/remove_immutable_tracks`.
- **Gate one-shots** on `animation_finished` plus a flag, or the next frame's locomotion call
  replaces the hit clip (DevWorm GMyw3eHDw7s 00:22:58). Measured: "hurt" held for its 0.4 s, then
  walk resumed (P16).
- **Blender source.** Rigify Limb Segments 1 and Game Friendly single root before export (CoderNunk
  0wMONEpEXpQ 00:00:19, 00:01:23). `nodes/apply_root_scale` (default true) bakes import scale into
  meshes and clips, root stays at 1 (docs).
- **BlendSpace2D** for 4-way sprites: points at plus or minus 1, axis range plus or minus 1.1 so
  diagonals snap to left and right; 2D up is negative Y (Chris WrMORzl3g1U 00:09:20, 00:13:09).

## Numbers

| What                                           | Value                                                                                | Source                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| Human walk, run ground speed                   | about 1.2 to 1.5 m/s walk, 3 to 4 m/s jog [added]                                    | measure the clip instead (P9) |
| No-slide speed measured                        | walk 1.200, run 3.504 m/s on clips built for 1.2 and 3.5                             | P9                            |
| Foot-slide tolerance                           | planted foot under 0.1 m/s; speeds within 2 percent [added]                          | baseline G5, P9               |
| Locomotion crossfade                           | 0.1 to 0.2 s; landing 0.05 s; Land to Ground at end with 0.15 s                      | P6                            |
| Import FPS                                     | 30 (default `animation/fps`)                                                         | importer                      |
| `motion_scale` after Normalize Position Tracks | source hip height (0.97 m test rig)                                                  | P4                            |
| IK foot error                                  | under 2 cm required, under 0.1 mm measured                                           | P10                           |
| FootPlacer ray                                 | 0.5 m above to 1.0 m below the animated foot; hips drop clamp 0.35 m                 | P10                           |
| Spring arm                                     | sphere r 0.2 stops 0.2 m plus margin 0.01 m short of a wall                          | P12                           |
| IterateIK3D defaults                           | max_iterations 4, min_distance 0.001, angular_delta_limit 2 deg, deterministic false | class reference               |
| Tween stagger                                  | 0.05 s per item, 0.2 s per tween                                                     | P11; aagPe4dvM2M 00:04:04     |
| Modifier cost                                  | Fair Fight halved a 2 ms overlay with incremental global transforms                  | XFZQNsFejwk 00:14:07          |

## Quality gates

Score with [`references/critique.md`](references/critique.md); record each live check as "run in
Godot 4.7.2 on <date>: pass, key numbers" and mark anything not run "not yet run" with the reason.
Blocking: every track resolves; cycles loop and RESET covers every animated path; speeds match the
measured no-slide speeds; the tree passes a scripted drive; a pose sheet was opened. Also: no
`overwrite_axis` or other keys missing from 4.7.2 in `.import` edits; no SkeletonIK3D in new code;
IK results read in `skeleton_updated` or `modification_processed`, never from `_process`.

## Common mistakes

- **BoneMap with `mixamorig:` names.** Godot imports `mixamorig_Hips`; the map matches nothing, the
  skeleton is still renamed GeneralSkeleton, every library track fails to resolve, and nothing is
  printed. Build the map from imported names; the audit flags a GeneralSkeleton with no Hips.
- **Expression transitions left at advance mode Enabled.** They never fire. Set `ADVANCE_MODE_AUTO`
  (2) on every transition driven by an expression or condition.
- **Two auto transitions true in one frame.** A jump that clears `on_floor` went Ground to Fall,
  skipping JumpUp. Guard the expression (`not on_floor and not jump_pressed`) or give the jump
  transition priority 0.
- **Unfiltered OneShot or Add with a partial clip.** Deterministic (the AnimationTree default):
  unlisted bones go to RESET, the character T-poses. Non-deterministic: they freeze. Filter the
  node.
- **No RESET.** Imported files have none by default; blends and saved scenes then start from rest or
  zero. `animation/import_rest_as_RESET`, or author RESET upstream (Blargis, ghYilg9cq-I 00:02:39).
- **Reading IK results in `_process`.** You get the animated pose. Read in
  `Skeleton3D.skeleton_updated` (final, after influence) or in the modifier's
  `modification_processed` (100 percent, before influence).
- **Root motion on Hips.** It wobbles; insert a real Root (FinePointCGI, fq0hR2tIsRk 00:04:35).
  Velocity is `basis * get_root_motion_position() / delta`.
- **Speed constants on retargeted bodies.** A taller body has a longer stride through
  `motion_scale`; re-measure per body.
- **Tweens without a kill guard.** Two tweens on one property both write every frame (Queble,
  KUyQzjpRsU8 00:02:54). Keep a reference and `kill()` it.
- **Method tracks in a headless or skipped cutscene.** Default Deferred calls wait for a frame; a
  loop that never yields fires them all at the end. Use Immediate, or yield frames.
- **Editing tree nodes at runtime.** They are shared by every instance of the scene; per-character
  values belong in `parameters/...`.
- **Ray-only spring arm.** The camera lands on the wall plane; give the arm a sphere shape.

- **Cameras keyed without a look target.** A cutscene camera whose rotation keys drift lost the hero
  for the last 5 s; check framing on the timeline sheet, not on the first and last key.
- **Library loaded on a body with its own clips.** Skip Import on the second character's
  AnimationPlayer so only the shared library plays (Quilled, nb6uSeEZFCI 00:04:36).

## Handoffs

- **scenario-godot-expert:** run protocol, `gd_run`, capture and review tools. Read it first.
- **scenario-godot-gameplay:** the CharacterBody3D controller and the state the tree reads; hitboxes
  from method tracks.
- **scenario-godot-3d-world:** collision layers for FootPlacer and spring arm; IK test geometry.
- **scenario-godot-pipeline-automation:** batch import and `.import` edits at scale, CI runs.
- **scenario-godot-ui, scenario-godot-vfx, scenario-godot-audio:** menu motion beyond tweens;
  effects and sounds keyed from clips and cutscenes.
- **scenario-godot-performance-export:** modifier and tree cost on target hardware.
- _*blender-* skills:_* Root bone, Rigify Game Friendly export, NLA push-down, loop hints at the
  source.

## Godot 4.7 notes

- IK family since 4.6 on SkeletonModifier3D: TwoBoneIK3D, FABRIK3D, CCDIK3D, JacobianIK3D,
  SplineIK3D; settings are per index (`set_root_bone_name(i, ...)`, `set_target_node(i, path)`,
  `set_pole_node`, `set_pole_direction`). SkeletonIK3D is deprecated.
- Custom modifiers override `_process_modification_with_delta(delta)`; `_process_modification()` is
  deprecated. Do not apply `influence` yourself.
- `retarget/rest_fixer/retarget_method` (0 None, 1 Overwrite Axis default, 2 Use Retarget Modifier)
  replaces any `overwrite_axis` key; RetargetModifier3D exists for runtime retargeting (not run
  here).
- `tween_await(signal).set_timeout(s)` is new in 4.7; `tween_subtween` since 4.4.
- Animation markers and `play_section_with_markers` (4.3+); `Animation.length` is a double in 4.7;
  animation names are StringName.
- AnimationMixer is the base of AnimationPlayer and AnimationTree: `root_motion_track`,
  `deterministic` (false on the player, true on the tree), `callback_mode_process`,
  `callback_mode_method`.
- Observed in 4.7.2 (P6): `priority` (lower wins) also decides between auto transitions that are
  true in the same frame, not only `travel()` paths; `travel()` called before the first `advance()`
  starts the machine in that state without error; a transition's default `advance_mode` is Enabled
  (travel only).
- Observed (P10): `modification_processed` reports the modifier's result before `influence`;
  `skeleton_updated` gives the blended final pose; outside both, bone poses read as animated.
- Observed (P3): a hand-edited `.import` is applied by a plain `--import`; loop-hint suffixes are
  stripped from clip names, a `loop` prefix is kept; `.` in clip names becomes `_`.
- Skeleton3D refuses `:` and `/` in bone names; its error string for that is malformed in 4.7.2
  (logged in `tests/OPEN_ISSUES.md`).

## References

- [`references/procedures.md`](references/procedures.md) (P1 to P16, live results, not yet run),
  [`expert-notes.md`](references/expert-notes.md) (attributed claims), `critique.md` (rubric, scored
  G5 baseline), [`gui-paths.md`](references/gui-paths.md) (editor clicks),
  [`sources.md`](references/sources.md).
- [`scripts/gd_anim.py`](scripts/gd_anim.py): Python helpers (install, run, rig, pose sheets, audit,
  GLB edits, `.import` edits, bone sampling).
- [`scripts/agentkit/animation/`](scripts/agentkit/animation/): `anim_rig`, `anim_audit`,
  `anim_capture`, `anim_import`, `anim_setup`, `anim_tree`, `anim_motion`, `anim_ik`, `anim_tween`,
  `anim_cutscene`, plus [`foot_placer.gd`](scripts/agentkit/animation/foot_placer.gd),
  [`locomotion_state.gd`](scripts/agentkit/animation/locomotion_state.gd),
  [`cutscene_director.gd`](scripts/agentkit/animation/cutscene_director.gd), `pose_persist.gd`.
- Tests: `tests/code/godot-animation/test_anim_live.py` (A1 to A9, W) and `test_anim_offline.py`.
