# scenario-godot-animation: procedures

Every procedure below was run live in Godot 4.7.2.stable on macOS (Forward+, Jolt Physics, project
`tests/projects/godot-animation/Anim3D`) through the scenario-godot-expert toolkit plus this skill's
kit. The test that re-runs it is named on each one: `tests/code/godot-animation/test_anim_live.py`
(A1 to A9 headless, W windowed). Evidence: `tests/live_evidence/godot-animation/live_<stamp>.json`
and the contact sheets next to it.

Setup for all of them:

```python
import sys
sys.path[:0] = ["<skills>/scenario-godot-expert/scripts", "<skills>/scenario-godot-animation/scripts"]
import gd_anim, gd_run
P = "path/to/project"
gd_anim.install_animkit(P)        # copies scripts/agentkit/animation/*.gd to res://addons/agentkit/animation/
```

Every kit call is `gd_anim.run_kit(P, module, method, args)` (headless unless noted). Godot exits 0
on script errors; read `ok`, `error` and `result` from the returned dict, never the exit code.

---

## P1. Build a test character without downloads

`gd_anim.build_rig(P, naming="profile" | "mixamo", scene="res://anim/hero.tscn", glb="", with_root=None, clips=True, scale=1.0)`

Builds a 23-bone humanoid (Root, Hips, spine chain, arms, legs, toes) in a T-pose rest with identity
bone rotations, a skinned box body (left side blue, right side orange, so mirrored errors show), and
baked clips: idle 2.0 s loop, walk 1.0 s loop (1.2 m/s, in place), run 0.66 s loop (3.5 m/s, in
place), jump_up 0.3 s, fall 0.6 s loop, land 0.35 s, wave 1.2 s (right arm only, on purpose),
walk_rm (walk with a Root position track, 1.2 m per loop) and RESET. Legs are solved analytically,
so foot positions are exact. `naming="mixamo"` names bones `mixamorig_Hips` and so on and omits
Root; `glb=` exports with GLTFDocument for import tests.

Run in Godot 4.7.2 on 2026-10-02: pass (A1). 23 bones; arm elevation in the rest 0.0 deg both sides;
walk t=0 left foot z 0.360 m, hips 0.883 m; the audit returns no flags once RESET carries the Root
key (the first run flagged `Armature/Skeleton3D:Root` missing from RESET; the rig was fixed).

## P2. Audit a character, a clip file or a tree

`gd_anim.audit(P, "res://x.glb" | "res://x.tscn", expect_loops=[...], in_place=[...], root_motion_bone="")`
and `run_kit(P, "anim_audit", "tree", {"scene": ...})`,
`run_kit(P, "anim_audit", "library", {"path": ...})`.

Reports per clip: length, loop mode, tracks by type, unresolved paths (node, bone, property, method,
animation), immutable tracks, root travel. Flags: a loop hint that does not loop, an in-place clip
that travels, no RESET, animated paths missing from RESET, a rest that is not a T-pose (arm
elevation above 20 deg), a skinned mesh whose skeleton path does not resolve, a GeneralSkeleton with
no Hips bone (a BoneMap that matched nothing), a tree whose player, base node, clips or root motion
track do not resolve, and advance conditions written as negations.

Run in Godot 4.7.2 on 2026-10-02: pass (A1, A2, A3, A4). It caught three real faults during this
work: the Root key missing from RESET, an imported file with no RESET, and a BoneMap that named
`mixamorig:Hips` while the skeleton had `mixamorig_Hips`.

## P3. Import settings without the Advanced Import dialog

1. Import once so the `.import` file exists: `gd_run.import_project(P)`.
2. Edit options:
   `gd_anim.set_import_options(P, "res://a.glb", params={...}, subresources={...}, importer="" | "animation_library", reimport=False)`.
   This runs `anim_import.gd:set_options`, which edits the `.import` through ConfigFile so a BoneMap
   resource is written the way the editor writes it.
3. Apply with a plain `gd_run.import_project(P)` (`--import`). `reimport=True` instead runs a
   headless editor job with `EditorFileSystem.reimport_files`.

Keys read from the 4.7.2 importer source and used live:

- `[params]`: `animation/fps` (30), `animation/import_rest_as_RESET` (false),
  `animation/remove_immutable_tracks` (true), `animation/trimming`,
  `nodes/import_as_skeleton_bones`.
- `_subresources.nodes["PATH:Armature/Skeleton3D"]`: `retarget/bone_map`,
  `retarget/bone_renamer/rename_bones`, `retarget/bone_renamer/unique_node/make_unique`,
  `retarget/bone_renamer/unique_node/skeleton_name` ("GeneralSkeleton"), `retarget/remove_tracks/*`,
  `retarget/rest_fixer/retarget_method` (0 None, 1 Overwrite Axis, 2 Use Retarget Modifier; default
  1), `retarget/rest_fixer/normalize_position_tracks`, `retarget/rest_fixer/fix_silhouette/*`. There
  is no `retarget/rest_fixer/overwrite_axis` key in 4.7.2.
- `_subresources.animations["Name"]`: `settings/loop_mode` (0 none, 1 linear, 2 ping-pong),
  `save_to_file/enabled|path|keep_custom_tracks`, `slice_N/*`.
- Importer switch: `[remap] importer="animation_library"` gives an AnimationLibrary instead of a
  scene ("Import As: Animation Library").

Loop hints in clip names (scene importer, then GLTFDocument): the scene importer strips trailing
digits and underscores, then matches the suffixes `-loop`, `_loop`, `-cycle`, `_cycle` (any case),
sets linear loop and removes the suffix. GLTFDocument also loops names that begin or end with `loop`
or `cycle` and keeps the name. Dots become underscores.

Run in Godot 4.7.2 on 2026-10-02: pass (A2). `Walk-loop` imports as `Walk` (linear), `Idle_cycle` as
`Idle` (linear), `Land_LOOP` as `Land` (linear), `loop-Run` stays `loop-Run` and loops, `Wave.001`
becomes `Wave_001`, `Fall` stays none until `settings/loop_mode: 1`. A plain `--import` applied the
hand-edited `.import`. The default import has no RESET; `animation/import_rest_as_RESET: true` adds
one.

## P4. Retarget Mixamo-style clips to the humanoid profile

1. Read the bone names the importer will create. Godot replaces `:` and `/` in bone names with `_`
   (Skeleton3D refuses both), so `mixamorig:Hips` becomes `mixamorig_Hips`.
2. `run_kit(P, "anim_import", "make_bonemap", {"bones": names, "out": "res://anim/mixamo_bonemap.tres"})`
   or `{"scene": "res://a.glb"}`. It sanitizes names the same way, auto-detects the prefix, maps
   profile names first, then the Mixamo table, and returns `mapped`, `missing_required`,
   `sanitized_names`.
3. Set `retarget/bone_map` on `PATH:Armature/Skeleton3D` (P3) and reimport. Rename and unique-node
   default on: the skeleton becomes `%GeneralSkeleton`, every track reads
   `%GeneralSkeleton:LeftUpperLeg`.
4. Audit: no flags, skeleton path ends in GeneralSkeleton, bones renamed. Sample the same clip on
   the source rig and the retargeted one: `gd_anim.max_deviation(ref, got)`.

Run in Godot 4.7.2 on 2026-10-02: pass (A2). 22 bones mapped, no required bone missing;
`Skeleton3D.motion_scale` = 0.97 (the source hip height; Normalize Position Tracks stores Hips keys
in hip-height units); retargeted walk against the original rig: max deviation under 2 mm on Hips and
both feet. First attempt failed silently: a BoneMap built from the GLB names (`mixamorig:Hips`)
produced a GeneralSkeleton with nothing renamed and 112 unresolved tracks, no error printed. The kit
now sanitizes and the audit flags it.

## P5. One animation library, many bodies

1. Import the clip file with `importer="animation_library"` plus the same BoneMap (P3, P4).
2. Import each character with its own BoneMap (built from its own bone names).
3. `run_kit(P, "anim_setup", "share_library", {"character": ..., "library": ..., "library_name": "locomotion", "out": ..., "unique": False})`:
   adds an AnimationPlayer whose root is the character and reports unresolved tracks. Pass
   `unique: True` when per-character edits must not reach every user of the file.

Run in Godot 4.7.2 on 2026-10-02: pass (A3). Library clips share one track layout. A 1.15x taller
body (no Root, profile names) plays the library with 0 unresolved tracks; its `motion_scale` is
1.1155 (0.97 x 1.15); hips at t=0 are 1.0155 m (0.883 x 1.15) and the stride scales the same way, so
its no-slide walk speed is 1.38 m/s, not 1.2. Two instances whose players hold the same library
object played Walk and Idle independently (`anim_setup.gd:independence`). Pose sheet
`tall_walk_contact_sheet.png` opened: feet on the floor at every sampled time.

## P6. AnimationTree built in code, driven headless

`run_kit(P, "anim_tree", "build", {"scene": "res://anim/hero.tscn", "out": "res://anim/hero_tree.tscn", "speeds": {"idle": 0, "walk": 1.2, "run": 3.5}})`

Graph: BlendTree [ sm (StateMachine: Ground = BlendSpace1D idle/walk/run at the measured speeds with
`sync`, JumpUp, Fall, Land) to act (OneShot, in1 = wave, filter on the right arm) to ts (TimeScale)
to output ]. A child node `State` (`locomotion_state.gd`) holds `speed`, `on_floor`, `jump_pressed`;
`advance_expression_base_node` points at it. Transitions: Start to Ground (auto), Ground to JumpUp
`jump_pressed`, Ground to Fall `not on_floor and not jump_pressed`, JumpUp to Fall at end, Fall to
Land `on_floor`, Land to Ground at end. Every expression transition has
`advance_mode = ADVANCE_MODE_AUTO` (2).

Drive:
`run_kit(P, "anim_tree", "drive", {"scene": ..., "events": [[t, {"speed": 1.2}], [t, {"param": "parameters/sm/Ground/blend_position", "value": 1.2}], [t, {"travel": "Fall"}]], "duration": 5.0})`.
The tree runs in manual callback mode with `advance(1/60)`; the result lists each state change with
its time.

Run in Godot 4.7.2 on 2026-10-02: pass (A4). Sequence Ground, JumpUp 1.50 s, Fall 1.72 s, Land 2.20
s, Ground 2.42 s (Land 0.35 s minus 0.15 s crossfade), then walk off a ledge: Fall 3.50 s, Land 4.00
s, Ground 4.22 s. Traps measured:

- With `not on_floor` alone on Ground to Fall, a jump that sets `jump_pressed` and clears `on_floor`
  in the same frame goes straight to Fall (JumpUp skipped). Either guard the expression or give
  Ground to JumpUp `priority = 0`: the lower priority won in auto-advance too.
- With the default `advance_mode` (1, Enabled) the expressions never fire: the machine stays in
  Ground for 5 s with no error.
- `travel("Fall")` before the first `advance()` started the machine in Fall, no error.
- Tree parameters are per instance (blend 3.0 on one, 0.0 on the other), tree nodes are shared:
  changing `fadein_time` on one instance's OneShot changed it on the other (`tree_root` is the same
  object).
- The tree audit returns no flags; the player, base node and every clip resolve.

## P7. Upper-body layering: OneShot filter and the deterministic trap

`drive` with `"deterministic": true|false, "filter": true|false`, firing
`parameters/act/request = 1` (ONE_SHOT_REQUEST_FIRE) at 0.5 s while walking, sampling bones.

Run in Godot 4.7.2 on 2026-10-02: pass (A4, W). At 1.0 s:

- Filter on (either mode): left hand, left foot and hips identical to walk-only; right hand up at
  1.81 m.
- Filter off, `deterministic = true` (the AnimationTree default): every bone missing from the wave
  clip blends to RESET at full OneShot weight. Hips snap to 0.97 m, the left arm returns to the
  T-pose (left hand at 1.45 m), feet stop under the body.
- Filter off, `deterministic = false`: the missing bones are not written, so the legs freeze at the
  pose they had when the fade-in finished (left foot identical from 0.7 s to 1.4 s).
- Sheet `oneshot_filter_sheet.png` opened: filtered wave keeps walking; unfiltered snaps to a T-pose
  with one arm waving.

## P8. Root motion

`run_kit(P, "anim_motion", "root_motion", {"anim": "walk_rm", "track": "Armature/Skeleton3D:Root", "seconds": 3.0, "motion_scale": None, "body": True})`

Sets `root_motion_track` on the AnimationPlayer (AnimationMixer, so the same on AnimationTree),
advances manually, and moves a CharacterBody3D with
`velocity = (global_basis * get_root_motion_position()) / delta` then `move_and_slide()`.

Run in Godot 4.7.2 on 2026-10-02: pass (A5). 1.200 m per loop for 3 loops; the body traveled 3.600 m
and stayed on the floor; the Root bone stayed at the origin in the pose (root motion is removed from
the pose). With `Skeleton3D.motion_scale = 1.15`, root motion is 1.38 m per loop: motion_scale
applies to root motion.

## P9. Measure the no-slide speed of an in-place clip

`run_kit(P, "anim_motion", "foot_speed", {"scene": ..., "anims": ["walk", "run"]})` seeks each clip
at 120 samples, keeps the samples where a foot is within 5 mm of its lowest height (planted), and
returns the median planted-foot speed. That is the speed the body must move for zero foot sliding:
use it for BlendSpace points and controller speeds.

Run in Godot 4.7.2 on 2026-10-02: pass (A6, A3). Walk 1.200 m/s, run 3.504 m/s (ground truth 1.2 and
3.5); the 1.15x body playing the shared library: 1.380 m/s.

## P10. Foot IK on steps, holes and slopes

`run_kit(P, "anim_ik", "legs", {"scene": ..., "anim": "idle", "time": 0.0, "ground": [{"pos": [x,y,z], "size": [x,y,z], "rot_x_deg": 0}], "influence": 1.0, "save": ""})`

Adds under Skeleton3D, in this order: `FootPlacer` (`foot_placer.gd`, a SkeletonModifier3D: ray down
from each animated foot, target = hit + ankle height + the clip's own swing lift, hips lowered by
the lowest negative correction, clamped at 0.35 m) then `LegIK` (TwoBoneIK3D, 2 settings: UpperLeg,
LowerLeg, Foot; target markers; pole markers 0.6 m in front of each knee; pole direction
`SECONDARY_DIRECTION_PLUS_Z` on the shin). Modifiers run in child order.

It reads the pose three ways: inside `modification_processed` (the IK result at 100 percent), in
`Skeleton3D.skeleton_updated` (the final pose after influence: the one to test) and from plain code
a frame later.

Run in Godot 4.7.2 on 2026-10-02: pass (A7, W). Final foot to target error under 0.1 mm in every
case. Step 0.2 m: left foot at 0.280 m, knee forward. Hole 0.15 m under the right foot: hips down
0.150 m, right foot at -0.070 m. 15 deg slope, walk t=0: front foot 0.0012 m, back foot 0.1619 m,
hips down 0.079 m. Influence 0: final foot at 0.080 m (the animated pose) while the read inside
`modification_processed` still says 0.280 m. Plain reads a frame later always return the animated
pose (modifier output is not kept in the bone poses). Sheets `ik_step_contact_sheet.png` and
`ik_slope_contact_sheet.png` opened: feet on the step and on the slope, knees bend forward.

## P11. Tweens: guard, deterministic stepping, await, subtween, stagger

`run_kit(P, "anim_tween", "tweens")`. Tweens are created, paused and advanced with `custom_step(dt)`
after one frame (it does nothing before the node is in a running tree).

Run in Godot 4.7.2 on 2026-10-02: pass (A8).

- Kill guard: tween A 0 to 100 over 1 s, at 0.5 s tween B back to 0 over 1 s, step 0.25 s more. With
  `if tw: tw.kill()` the value is 37.5. Without it both tweens write every step and the value is
  41.25; B also starts from A's latest write, not the value when B was asked for.
- `custom_step(0.5)` on a 2 s linear 0 to 10: 2.5; sine in-out: 1.4645 (exact formula). A 10 s step
  finishes the tween (value 10; it returned true on that finishing step).
- `tween_await(signal).set_timeout(4.0)` (new in 4.7): emitted at 1.0 s, the next callback ran at
  1.2 s (two 0.1 s steps later); never emitted, it ran at 4.00 s.
- `tween_subtween` (4.4): the parent's next step ran with the subtween's final value (2.0), so the
  subtween counts as one step.
- Stagger: `set_parallel(true)` plus `set_delay(0.05 * i)` on 0.2 s tweens gives 1.0, 0.75, 0.5,
  0.25, 0.0 at 0.2 s.

## P12. SpringArm3D camera against a wall

`run_kit(P, "anim_tween", "spring_arm", {"wall_z": 1.5, "length": 3.0, "radius": 0.2})`

Run in Godot 4.7.2 on 2026-10-02: pass (A8). Free arm: `get_hit_length()` 3.0, camera local z 3.0.
Wall face at 1.5 m: sphere cast r 0.2 gives 1.299 m (radius plus margin short of the wall); ray cast
gives 1.500 m (the camera sits on the wall plane: use a shape so the near plane stays out of the
geometry).

## P13. A 20 s cutscene as one AnimationPlayer

`run_kit(P, "anim_cutscene", "build", {"hero": "res://anim/hero.tscn", "out": "res://anim/cutscene.tscn"})`
then `run_kit(P, "anim_cutscene", "run", {"callback_mode_method": 1, "section": []})`.

Tracks (7): `Hero:position` (linear; 0 to 6 m over 0 to 5 s and 6 to 12 m over 14 to 19 s, which is
the walk clip's 1.2 m/s), an Animation track on `Hero/AnimationPlayer` (walk, idle, wave, idle,
walk, idle), `CamA:position` and `CamA:rotation_degrees` (cubic dolly), discrete `CamA:current` and
`CamB:current` cuts at 8 s and 14 s (outgoing camera track first), a method track on `Director`
(`cutscene_director.gd`: disable_gameplay at 0, say at 8 and 10.5, enable_gameplay at 19.9), markers
intro 0, talk 8, outro 14, end 20.

Run in Godot 4.7.2 on 2026-10-02: pass (A9, W).

- Every track path resolves; `animation_finished` fired at 20.0; method calls at 0.0, 8.0, 10.5,
  19.9 in order with `callback_mode_method` Immediate.
- Checkpoints: 9 s CamB and hero `wave`; 15 s CamA, hero `walk`, z 7.2 m; gameplay off until 19.9 s.
- Trap: with the default Deferred method mode and a loop that never yields a frame (a headless test,
  a skipped cutscene), all four calls landed at 20.0 together. With one frame per step they landed
  on time (the first at 0.0167 s).
- `play_section_with_markers("cutscene", "talk", "outro")` played 8.0 to 14.0 and made only the two
  `say` calls.
- Sheet `cutscene_contact_sheet.png` (8 frames, the scene's own cameras, `views=["scene"]`) opened:
  walk, stop, wave on the over-the-shoulder camera, cut back, walk away. The first camera keys
  missed the hero after 15 s; the rotation keys were fixed and re-captured.

## P15. The SKILL.md code blocks

`tests/code/godot-animation/jobs/skill_snippets.gd` runs the transition helper and the TwoBoneIK3D
block from SKILL.md verbatim.

Run in Godot 4.7.2 on 2026-10-02: pass (S). The helper's Ground to Fall expression fired (Ground,
Fall); the IK block put the left foot on a 0.2 m step at 0.280 m, right foot 0.080 m.
`var side := ["Left", "Right"][i]` fails to parse ("Cannot infer the type"), hence the typed
declaration.

## P14. Pose and timeline captures (windowed)

`gd_anim.pose_sheet(P, scene, anim, times=[...], views=["front", "left", "three_quarter"] | ["scene"], size=(320, 320), driver="player" | "tree", params={...}, stage=True, extra={"frame": "Armature", "player": "CutscenePlayer"})`

Seeks exact times (or advances the tree in fixed steps), frames the rest bounds from bookmark views
or uses the scene's camera, adds a light, ambient and a checker floor when the scene has none, saves
one PNG per time and view, runs `gd_review.image_checks`, and builds a contact sheet. Then open the
sheet. Real-time capture (`gd_run.capture_sequence`) samples whatever frame the clock lands on; use
this for animation review.

Run in Godot 4.7.2 on 2026-10-02: pass (W). Seven sheets, all image checks ok, all opened: RESET
T-pose front, side and three-quarter (left side blue on +X); walk at 8 phases (knees forward, arms
counter-swing, feet alternate); tall walk; OneShot filter comparison; IK step and slope; cutscene.

---

## P16. Round 2: pose persistence, foot rotation after IK, capture mode, find_track cache, one-shot gate

Added 2026-10-02 after blind grading. Jobs (headless): `tests/code/godot-animation/jobs/r2_anim.gd`
(with `r2_gate.gd`), `r2_persist.gd` (with `r2_spin.gd`), `r2_classes.gd`. Kit file:
`scripts/agentkit/animation/pose_persist.gd`.

```gdscript
# Foot rotation after TwoBoneIK3D: copy the ground tilt from an align node (rotation only).
var copy := CopyTransformModifier3D.new()
skeleton.add_child(copy)                                   # after FootPlacer and LegIK
copy.setting_count = 1
copy.set_apply_bone_name(0, "LeftFoot")
copy.set_reference_type(0, BoneConstraint3D.REFERENCE_TYPE_NODE)
copy.set_reference_node(0, copy.get_path_to(left_foot_align))   # a Node3D rotated to the ground normal
copy.set_copy_position(0, false); copy.set_copy_scale(0, false); copy.set_copy_rotation(0, true)
```

```gdscript
# Persist modifier output across frames (only when modifiers own the pose).
const PP = preload("res://addons/agentkit/animation/pose_persist.gd")
var r := PP.new(); r.role = PP.Role.RESTORE; skeleton.add_child(r)     # first
# ... your modifiers ...
var s := PP.new(); s.role = PP.Role.SNAPSHOT; skeleton.add_child(s)    # last
```

```gdscript
# Capture update mode: blend from the live value to the first key.
anim.value_track_set_update_mode(t, Animation.UPDATE_CAPTURE)
player.play_with_capture(&"move")
```

```gdscript
# find_track cache: one dictionary per clip layout.
var cache := {}
for i in anim.get_track_count(): cache[anim.track_get_path(i)] = i
```

```gdscript
# Gate a one-shot on animation_finished plus a flag (r2_gate.gd).
func hurt() -> void: busy = true; ap.play(&"hurt")
func locomotion() -> void:
	if busy: return
	if ap.current_animation != &"walk": ap.play(&"walk")
# ap.animation_finished.connect(func(n): if n == &"hurt": busy = false)
```

Run in Godot 4.7.2 on 2026-10-02: **pass**. Evidence
`tests/live_evidence/godot-animation/p16_round2.json`.

- CopyTransformModifier3D on `ik_slope.tscn` (idle, 15 deg align node): foot rotation error to the
  align node 12.12 deg with IK only, 0.0 deg with the copy; foot position error to the IK target
  3e-8 m before and 2e-8 m after (the copy does not move the foot).
- PosePersist: a modifier adding 5 deg to Spine each frame read 5.0 deg every frame without
  persistence and 60.0 deg after 12 frames with RESTORE first and SNAPSHOT last.
- Capture: a property at 5 with one key of 10 at 0.5 s read 7.5 at 0.25 s and 10.0 at 0.5 s.
- find_track: 22 tracks, 2,000 passes (44,000 lookups): 1,741 to 1,851 us against 1,483 to 1,502 us
  for a dictionary, about 1.2x, four runs. Fair Fight's 1.5 to 3x was on larger rigs; not reproduced
  here.
- Gate: "hurt" (0.4 s) stayed current at frames 5 and 20 although `locomotion()` ran every frame;
  walk resumed by frame 29; the flag ended false.
- 4.7.2 classes: CopyTransformModifier3D, AimModifier3D, ConvertTransformModifier3D (all
  BoneConstraint3D, per-index settings with `set_amount`, `set_apply_bone_name`,
  `set_reference_type`, `set_reference_node`) and LookAtModifier3D exist.
- Not run: Bezier-track blending and method tracks in the editor preview (docs claims), BlendSpace2D
  range bias (2D), Rigify export (Blender side), Apply Root Scale on a scaled source.

## Not yet run

- Real Mixamo FBX through ufbx: needs an Adobe account download; the Mixamo naming, the `:`
  sanitizing, loop hints and retargeting were run on a generated glTF instead.
- RetargetModifier3D at runtime and `retarget_method = 2` (Use Retarget Modifier): not exercised;
  the import used the default (1, Overwrite Axis).
- CopyTransformModifier3D, LookAtModifier3D, FABRIK3D, CCDIK3D and the IterateIK3D `deterministic`
  switch: API read from the 4.7.2 class reference only.
- BlendSpace2D strafing set and `blend_mode` Discrete or Carry: not built.
- AnimationTree in `ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS` inside a running CharacterBody3D
  controller with input: the tree was advanced manually.
- Audio tracks in the cutscene, and the Dialogue Manager addon flow (Nathan Hoad): not installed
  here.
- Every Animation panel, AnimationTree graph and Advanced Import dialog step in `gui-paths.md`: the
  GUI editor takes focus on this Mac, so none was clicked through.
