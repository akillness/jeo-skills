# Procedures (copyable, each with its live test and recorded result)

All run in Unity 6000.3.21f1 on macOS (Apple Silicon, Metal) on 2026-09-24, project
`tests/projects/unity-animation` (APFS clone of Base3D_URP, path with spaces), through
`tests/code/unity-animation/test_live_animation.py` (results in
`archive/tests/unity-animation/live_results.jsonl`). Humanoid content: Unity's GameplaySequenceDemo
sample shipped inside the Timeline package (`ua.sample_assets(P)`), so nothing is downloaded.

Header for every snippet:

```python
import sys
sys.path.insert(0, "<skills>/scenario-unity-expert/scripts"); sys.path.insert(0, "<skills>/scenario-unity-animation/scripts")
import ut_env, ut_run, ut_review, ut_animation as ua
P = ua.prepare("<project>/tests/projects/<skill>")   # clone Base3D_URP if missing + ua.install(P)
```

`ua.install(P)` copies the lead's AgentKit, `scripts/AgentKit/Animation/*.cs` into
`Assets/Editor/AgentKit/Animation/` (files whose header says `// REQUIRES: <package>` only when that
package is in packages-lock.json: a compile error in any assembly aborts every batch job) and
`scripts/Runtime/*.cs` into `Assets/AgentKitRuntime/Animation/` (Assembly-CSharp, so Timeline can
serialize the custom track).

Results below are the final full run of v0.2 (`archive/tests/unity-animation/live_run_3.log`: 16
offline tests OK, 15 live tests OK in 739 s with other agents' editors sharing the 6-editor cap;
test_04c and test_07b rerun after the last C# edits, `live_run_3b.log`, and test_06b after animating
the idle in its probe, `live_run_3c.log`, all OK with the same numbers). v0.1 results:
`live_run_2.log`.

## P0. Mixamo download settings (not run here: a website with a login, no API)

```python
ua.MIXAMO_DOWNLOAD["root_motion"]   # FBX for Unity, 30 fps, keyframe reduction none, In Place OFF, Character Arm Space raised, Without Skin
ua.MIXAMO_DOWNLOAD["in_place"]      # same, In Place ON (script-driven trees)
```

Sources: Ketra Games mNxEetKzc04 [00:02:31] to [00:03:38] (root motion, arm space), iHeartGameDev
_J8RPIaO2Lc [00:01:24] (30 fps, no keyframe reduction), BEZHVYk6Fa4 [00:12:54] (every clip on the
same Mixamo character, or Copy From Other fails). Name each FILE after its move: every take is
"mixamo.com" and the rules take roles from file names. A human or a computer-use agent clicks the
settings (`gui-paths.md`).

## P1. Pin the animation packages

```python
r = ut_run.run_method(P, "AgentKit.Animation.AnimPackages.Add",
                      {"packages": ["com.unity.cinemachine@3.1.7", "com.unity.animation.rigging@1.4.1"]},
                      quit=False, timeout=900)      # async job: Client.Add per id, polled on EditorApplication.update
ua.install(P)                                        # REQUIRES-gated jobs (Cinemachine, Rigging, Timeline) land now
assert all(v["ok"] for k, v in ua.pinned_packages(P).items() if k in ua.PINNED)
```

Unity calls: `UnityEditor.PackageManager.Client.Add("name@version")`, `AddRequest.Result.version`.
Offline alternative: `ua.pin_manifest(P)` writes explicit versions into `Packages/manifest.json`
(resolved at the next editor start). Test `test_01`. Result: pass, 17.8 s; lock Cinemachine 3.1.7,
Animation Rigging 1.4.1, Timeline 1.8.12, Splines 2.9.0 (dependency). Observed separately: a bare
`Client.Add("com.unity.cinemachine")` resolved 3.1.7 (registry latest) although the editor manifest
lists 2.10.7.

## P2. Humanoid import rules (scoped AssetPostprocessor, self-healing)

```python
s = ua.sample_assets(P)                        # or your own character + clip FBX paths
rules = ua.default_rules("DefaultMale.fbx", {
    "Nav-Accelerations": {"clips": [{"name": "Walk", "first": 31, "last": 67, "role": "locomotion"},
                                    {"name": "TurnLeft", "first": 222, "last": 275, "role": "turn"}]},
    "Turns_StartStop-Wk": {"clips": [{"name": "Idle", "first": 690, "last": 768, "role": "idle"}]},
    "JumpDown-Sprt_St": {"role": "jump"}})
r = ut_run.run_method(P, "AgentKit.Animation.AnimImport.ImportDrop",
                      {"dest": "Assets/Characters/Hero", "rules": rules, "character_src": s["character"],
                       "clip_srcs": list(s["clips"].values()), "texture_srcs": s["textures"],
                       "masks": ua.SAMPLE_IMPORT_MASKS}, timeout=900)     # masks built before the clips import
assert r["result"]["counts"]["error"] == 0, r["result"]["findings"]
a = ut_run.run_method(P, "AgentKit.Animation.AnimImport.AuditImports", {"folder": "Assets/Characters"})
```

What the job does (`AnimImport.cs`): writes `AnimImportRules.json` in the folder (the postprocessor
only touches files under a folder holding one), imports the character first (`CreateFromThisModel`),
then the clips (`animationType = Human`, `avatarSetup = CopyFromOther`,
`sourceAvatar = <character avatar>` in `OnPreprocessModel`; clip split, rename and root flags by
role in `OnPreprocessAnimation`), declares `context.DependsOnSourceAsset(rules)` and
`DependsOnArtifact(character)` so edits reimport dependents, `GetVersion()` for rule changes. If the
import log of a clip holds "Copied Avatar Rig Configuration mis-match" (different hierarchy: the FBX
then has NO clip), it sets `files.<name>.avatar = "create"` and reimports; later drops keep that
entry. Role flags are `ModelImporterClipAnimation` properties from `ua.ROLE_FLAGS` (idle: rotation,
Y, XZ baked, Body Orientation and Center of Mass as the pose reference; locomotion: rotation and Y;
turn: rotation free; jump: Y free, Feet), plus `"mask": "<AvatarMask path>"` (maskType
CopyFromOther, the 6.3 Manual's cost cut for fingers and IK goals; the model declares a dependency
on the mask). Roles come from an explicit entry or a pattern on "<file name> <clip name>"; a clip no
rule matched gets the oneshot flags and an `anim.role_fallback` info (the take name alone never
decides: Mixamo takes are all "mixamo.com"). The callbacks never reimport; `GetVersion()` is bumped
when the rule code changes. Find usable segments of long takes first:

```python
p = ut_run.run_method(P, "AgentKit.Animation.AnimSampler.ClipProfile",
                      {"model": "Assets/Characters/Hero/DefaultMale.fbx", "clip": "Assets/.../Turns_StartStop-Wk.fbx::Turns_StartStop-Wk", "step": 0.2})
# rows: t, hips_speed (m/s), arm_drop (0 = T-pose arm, 1 = hanging), foot heights -> standing = hips_speed < 0.15 and arm_drop > 0.5
```

Test `test_02`. Result: pass. Character Human, CreateFromThisModel, avatar valid and human; the
forced Copy From Other on Stance.fbx failed with the mismatch and was healed; every clip human
motion; Victory-anim1 mask CopyFromOther `NoFingersHandIK.mask`; the deliberate IdleXZFree variant
flagged `anim.idle_xz_not_baked` (warn, 0 errors); measured Walk 1.078 m/s, Jog 3.514 m/s, TurnLeft
-1.713 rad/s (-98 deg/s), TurnRight 1.338 rad/s; JumpDown Y unbaked + Feet, TurnLeft rotation free,
Idle XZ baked; the same FBX outside the rules folder stayed Generic. ClipProfile found standing
segments at 5.0-6.2 s, 22.8-25.8 s ... of the 70 s start-stop take, and a T-pose calibration at
frames 0-30 of Nav-Accelerations.

## P2b. Standalone clips: duplicate on purpose, audit the copies

```python
ut_run.run_method(P, "AgentKit.Animation.AnimImport.DuplicateClip",
                  {"source": "Assets/Characters/Hero/Jump.fbx::Jump", "dest": "Assets/Characters/Hero/Edit/Jump.anim"})
a = ut_run.run_method(P, "AgentKit.Animation.AnimImport.AuditClips", {"folder": "Assets"})
# anim.generic_duplicate: a bone-path .anim (Transform curves, not human motion); anim.scale_curves: non-constant scale
```

Duplicate only a clip you must edit; otherwise reference the FBX sub-asset (`"path.fbx::Clip"`) so
reimports flow. `Object.Instantiate(clip)` freezes the curves the model had at that moment: from a
Generic import they are bone paths and stay so after the model becomes Humanoid (iHeartGameDev
BEZHVYk6Fa4 [00:12:03]). An existing `.anim` is archived to `_archive/` and updated in place
(`EditorUtility.CopySerialized`), so its GUID and controller references survive.
`AnimControllerBuilder` also flags `anim.generic_clip_in_humanoid_controller`. Unity calls:
`AnimationUtility.GetCurveBindings` (type `Transform` vs `Animator` muscle curves),
`AnimationClip.isHumanMotion`, `AnimationUtility.GetEditorCurve`, `AssetDatabase.CreateAsset`. Test
`test_04c`. Result: pass; the JumpDown take duplicated from a Generic import: 259 Transform curves,
0 muscle curves, not human motion, flagged; from the Humanoid import: 0 Transform, 130 muscle
curves, clean; played alone on the Humanoid lab character between 0.2 s and 1.5 s, the Generic copy
moved its bones 0.0 deg, the Humanoid copy 40.1 deg; a controller holding the Generic copy next to a
Humanoid idle raised `anim.generic_clip_in_humanoid_controller`.

## P3. AnimatorController with a 2D blend tree and layers, from a spec

```python
spec = ua.sample_controller_spec(imports="Assets/Characters/Hero", path="Assets/Characters/Hero/Hero.controller")
# parameters Speed, TurnRate, IsMoving, Jump; Idle state; Locomotion = FreeformCartesian2D on (Speed m/s, TurnRate deg/s)
# with "auto": "speed_angular_deg" (children placed from measured root motion); Any State -> JumpDown;
# UpperBody layer: Override, weight 0, Avatar Mask with Root, legs and foot IK off; hash_class generated
b = ut_run.run_method(P, "AgentKit.Animation.AnimControllerBuilder.Build", {"spec": spec})
assert b["result"]["counts"]["error"] == 0, b["result"]["findings"]
```

Core Unity calls (`AnimControllerBuilder.cs`):

```csharp
var ac = AnimatorController.CreateAnimatorControllerAtPath(path);          // or cleared in place (GUID kept)
ac.AddParameter("Speed", AnimatorControllerParameterType.Float);
ac.AddLayer("UpperBody");
var layers = ac.layers;                                                     // copies: edit, then assign back
layers[1].defaultWeight = 0f; layers[1].blendingMode = AnimatorLayerBlendingMode.Override; layers[1].avatarMask = mask;
ac.layers = layers;
var state = ac.CreateBlendTreeInController("Locomotion", out BlendTree tree, 0);
tree.blendType = BlendTreeType.FreeformCartesian2D; tree.blendParameter = "Speed"; tree.blendParameterY = "TurnRate";
tree.AddChild(walk, new Vector2(new Vector2(walk.averageSpeed.x, walk.averageSpeed.z).magnitude, walk.averageAngularSpeed * Mathf.Rad2Deg));
var t = idle.AddTransition(state); t.hasExitTime = false; t.duration = 0.15f;
t.interruptionSource = TransitionInterruptionSource.None; t.AddCondition(AnimatorConditionMode.If, 0, "IsMoving");
var mask = new AvatarMask(); mask.SetHumanoidBodyPartActive(AvatarMaskBodyPart.LeftLeg, false); AssetDatabase.CreateAsset(mask, maskPath);
```

Rebuilding copies the old controller to `_archive/` and rebuilds the same asset (never `MoveAsset`:
the GUID would leave with the archive and scenes would keep playing it, observed).
`AnimControllerBuilder.Audit` re-checks any controller: missing parameters, Simple Directional
drops, positions too close, unmasked Override layers, Override above Additive, Any State to self,
idle inside the tree, bone-path clips among humanoid clips; each transition's dump carries its
`priority` (list index, 0 highest). Keep runtime parameters inside the children's extents:
`ua.blend_tree_checks(tree, {"Speed": (0, max_speed)})` (iHeartGameDev _J8RPIaO2Lc [frame
00:13:38]). Code-driven alternative (Lost Relic Games, sprites; skeletal with a crossfade): states
without transitions plus the generated constants:
`animator.CrossFadeInFixedTime(HeroAnimIds.S_Base_Layer_Idle, 0.15f)`. Test `test_03`. Result: pass,
0 findings; Locomotion FreeformCartesian2D, Walk (1.078, 0), Jog (3.514, 0), TurnLeft (0.301,
-98.2), TurnRight (0.085, 76.7); UpperBody mask off Root, LeftLeg, RightLeg, LeftFootIK,
RightFootIK; hash class compiled. Negative control (a deliberately bad spec): all six rules fired
(`tree.simple_directional_same_direction`, `tree.simple_directional_180`, `anim.any_state_to_self`,
`transition.missing_parameter`, `layer.override_without_mask`, `layer.override_cancels_additive`).

## P3b. Transition interruption probe (who wins mid-transition)

```python
for key, src, ordered in (("none", "None", True), ("ordered", "Source", True), ("unordered", "Source", False)):
    ut_run.run_method(P, "AgentKit.Animation.AnimControllerBuilder.Build",
                      {"spec": ua.interruption_probe_spec(imports, "Assets/AnimLab/Probes/Interrupt_%s.controller" % key, src, ordered)})
r = ut_run.run_method(P, "AgentKit.Animation.AnimSampler.SampleStates", {"samples": [
    {"name": "ordered_high", "controller": "Assets/AnimLab/Probes/Interrupt_ordered.controller", "seconds": 0.9, "trace": True,
     "events": [{"t": 0.0, "triggers": ["GoB"]}, {"t": 0.2, "triggers": ["GoC"]}]}], "bones": ["LeftUpperArm"]})
# final "state"; trace rows: t, state, next, tr_t (transition progress), gw, bone_deg_s (first listed bone)
```

The same probe proves a real controller's urgent exits: build it, fire the running transition's
trigger, then the urgent one mid-blend, and assert the final state. Rules (Catherine Proulx, Unity
blog): uninterruptible by default; Current State + Ordered Interruption lets only transitions above
the running one on the source state cut in; unordered lets any; same-frame ties go to list order;
Next State lets the destination's transitions redirect. The interrupted blend starts from a frozen
snapshot: keep interrupting transitions short [added inference]. Test `test_04b`. Result: pass;
None: B for both GoC and GoD; ordered: GoC interrupts to C, GoD ignored (B); unordered: GoD
interrupts to D; GoD and GoC on one frame: C (list order); arm bone speed 32.1 deg/s the frame
before the interruption, 0.00 on the interruption frame (the snapshot), 109 deg/s the next frame.
Not probed: the Next State modes.

## P4. Lab scene, deterministic state sampling, mask check, captures

```python
ut_run.run_method(P, "AgentKit.Animation.AnimSampler.BuildLab",
                  {"model": "Assets/.../DefaultMale.fbx", "controller": "Assets/.../Hero.controller",
                   "textures": [...albedo pngs...]})     # checker ground, light, camera, Hero + CameraTarget child
walk = {"IsMoving": True, "Speed": 1.08, "TurnRate": 0}
r = ut_run.run_method(P, "AgentKit.Animation.AnimSampler.SampleStates", {
    "samples": [{"name": "walk", "params": walk, "seconds": 1.0},
                {"name": "walk_upperbody", "params": walk, "layer_weights": {"UpperBody": 1}, "seconds": 1.0},
                {"name": "jump", "triggers": ["Jump"], "seconds": 1.2}],
    "bones": ["LeftUpperLeg", "LeftUpperArm", "Head"], "capture": {"width": 480, "height": 640}}, graphics=True)
rev = ut_review.review_images([x["png"] for x in r["result"]["samples"]], sheet="sheet.png")   # then OPEN it
```

Each sample: `Animator.Rebind(); Update(0)`, set parameters and layer weights, fixed
`Animator.Update(1/60)` steps, then bones and a capture. Per sample: `events` [{t, params,
triggers}] fire mid-run; `trace: true` adds a row per frame; `controller` (a probe controller asset)
or `clip` (one clip alone, through a reused probe controller in `probe_dir`, default
`Assets/AgentKitProbes`) replaces the character's controller for that sample. Rows carry `state`,
`next_state`, `in_transition` and `gravity_weight` (reads 0 unless `root_motion: true`, observed).
Two traps are handled in `FindTarget`: Culling Mode forced to Always Animate (otherwise a batch job
writes no bone and every capture is the bind pose) and
`SkinnedMeshRenderer.forceMatrixRecalculationPerRender` (otherwise several captures in one editor
update show a stale mesh). Test `test_04`. Result: pass; states idle Idle, walk/jog/turn Locomotion,
jump JumpDown; mask: legs 0.000 deg difference, arms 7 to 13 deg; idle arm hangs (not a T-pose);
sheet `archive/tests/unity-animation/sheet_states.png` opened: walk, jog, turn and jump poses read,
the upper-body layer changes only arms and head.

## P4b. Vertical ownership: the gravityWeight trace

```python
r = ut_run.run_method(P, "AgentKit.Animation.AnimSampler.SampleStates", {"root_motion": True, "bones": ["LeftUpperArm"],
    "samples": [{"name": "idle", "params": {"IsMoving": False}, "seconds": 0.5},
                {"name": "jump", "triggers": ["Jump"], "seconds": 6.0, "trace": True}]})
# trace rows: gw = Animator.gravityWeight per frame
```

6.3 Manual (Root Transform Position (Y), Note): `gravityWeight` is 1 with Y baked, 0 without,
blended across transitions. Use it to decide who owns vertical motion around a height-changing clip
(`AgentRootMotionMover.vertical`, P9); read it with root motion on. Test `test_04b`. Result: pass;
idle 1; over the 0.1 s Any State -> JumpDown transition it ramped 1, 0.83, 0.67, 0.5, 0.33, 0.17,
then 0 through the Y-unbaked JumpDown, back to 1 over the 0.25 s exit to Idle; the same idle sampled
with root motion off read 0.

## P5. Root-motion speed and foot-slide metric

```python
m = ut_run.run_method(P, "AgentKit.Animation.AnimSampler.LocomotionMetrics",
                      {"params": walk, "seconds": 3, "fps": 60, "warmup": 1})          # root motion on
fs = ua.foot_slide(m["result"]["samples"])     # planted-contact horizontal speed (lower of foot and toes)
bad = ut_run.run_method(P, "AgentKit.Animation.AnimSampler.LocomotionMetrics",
                        {"params": walk, "seconds": 3, "script_speed": 2.2})            # in place, moved by a script
```

Test `test_05`. Result: pass; root-motion ground speed 1.107 m/s for a tree position of 1.078 (2.7
%); planted-contact slide p50 0.187 m/s with root motion, 0.183 with the script speed matched to the
clip, 1.139 at twice the speed.

## P5b. Idle drift and Based Upon, measured on the clip alone

```python
for clip in ("Idle", "IdleOriginal", "IdleXZFree"):     # ua.SAMPLE_FILE_RULES: same frames, one setting changed
    m = ut_run.run_method(P, "AgentKit.Animation.AnimSampler.LocomotionMetrics",
                          {"clip": imports + "/Turns_StartStop-Wk.fbx::" + clip, "seconds": 30, "fps": 30, "warmup": 0, "return_samples": False})
    # distance, final_yaw (drift of the GameObject), pose_yaw_offset_deg, pose_xz_offset_m (where the pose sits: Animator.bodyRotation/bodyPosition)
```

The measurement behind stance 4: Based Upon picks the reference the baked pose keeps; Bake Into Pose
is what removes the delta (6.3 Manual). Choose Original for clips authored at the origin facing
forward (Mixamo, keyframed: Ketra Games bakes idles with Original on all three axes, mNxEetKzc04
[00:02:31]); Body Orientation / Center of Mass for segments cut from mocap takes. Test `test_05b`.
Result: pass; Idle (Body Orientation, Center of Mass): 0 m and 0 deg over 30 s, pose 3.0 deg and
0.018 m from its GameObject; IdleOriginal: 0 m and 0 deg, pose -88.2 deg and 2.43 m away (the
actor's place in the capture volume); IdleXZFree: 0.246 m of drift.

## P6. Cinemachine 3 rigs, audit and a deterministic probe

```python
rigs = [{"name": "CM_Follow", "type": "follow", "target": "Hero/CameraTarget", "priority": 10, "offset": [0, 0.6, -4.5]},
        {"name": "CM_Shoulder", "type": "third_person", "target": "Hero/CameraTarget", "priority": 5, "blend_hint": "CylindricalPosition"},
        {"name": "CM_Wide", "type": "fixed", "position": [6, 3, 6], "look_at": "Hero/CameraTarget"},
        {"name": "CM_Close", "type": "follow", "target": "Hero/CameraTarget", "offset": [0.7, 0.1, 2.4], "damping": [0, 0, 0]}]
ut_run.run_method(P, "AgentKit.Animation.AnimCinemachine.SetupCameras",
                  {"brain": {"default_blend": ["EaseInOut", 1.0], "custom_blends": [["CM_Follow", "CM_Close", "Cut", 0]]}, "rigs": rigs})
ut_run.run_method(P, "AgentKit.Animation.AnimCinemachine.AuditCameras", {})
p = ut_run.run_method(P, "AgentKit.Animation.AnimCinemachine.CameraProbe", {
    "events": [{"t": 1.5, "priorities": {"CM_Shoulder": 20}}, {"t": 3.5, "priorities": {"CM_Shoulder": 0}},
               {"t": 5.0, "priorities": {"CM_Close": 30}}],
    "seconds": 5.6, "fps": 60, "move_target": {"name": "Hero", "velocity": [0, 0, 1.1]},
    "animate": {"target": "Hero", "params": {"IsMoving": True, "Speed": 1.08}}, "captures": [1, 2, 3, 4, 5.2]}, graphics=True)
```

Rig options also: `blend_hint` ("None" or combined flags "CylindricalPosition, IgnoreTarget"),
`deoccluder` {collide_against, transparent_layers, ignore_tag, radius, strategy, damping,
damping_when_occluded, min_occlusion_time}, `camera_offset`. Probe options: `obstacles` [{name,
position, scale, layer, trigger}] spawned for the run and removed, `occlusion_layers` for the
per-frame linecast camera to target (`occluded_frames`), `inside_geometry_frames` (CheckSphere 0.1
m), `min_target_distance`, `series: true` for the target's screen position per frame (`vp_series`).
Core calls: `go.AddComponent<CinemachineCamera>()`, `cam.Target.TrackingTarget`, `cam.Priority = 10`
(implicit `PrioritySettings`), `AddComponent<CinemachineFollow>().FollowOffset`,
`TrackerSettings.PositionDamping`, `CinemachineRotationComposer`, `CinemachineThirdPersonFollow`
(`CameraDistance`, `CameraSide`, `AvoidObstacles.IgnoreTag`), `CinemachineOrbitalFollow` +
`CinemachineInputAxisController`, `CinemachineHardLookAt`; Brain `UpdateMethod = SmartUpdate`,
`BlendUpdateMethod = LateUpdate`, `DefaultBlend`, `CustomBlends`
(`CinemachineBlenderSettings.CustomBlend`). The probe sets `UpdateMethod = ManualUpdate`, calls
`brain.ManualUpdate(frame, 1/fps)` per step and restores it; after writing a priority it calls
`cam.Prioritize()` (the new value is otherwise read only in the camera's own `Update()`, which never
runs in a batch job, observed). Test `test_06`. Result: pass; Cinemachine 3.1.7, audit 0 errors (1
info: zero damping on the close-up camera, intended); live CM_Follow at 1.0 s, CM_Shoulder blending
at 2.0 s (EaseInOut 1 s, 1.5 to 2.5), CM_Follow again at 4.0 s (blending), CM_Close at 5.1 s with no
blend (custom Cut); target at viewport (0.50, 0.50) in steady follow; min up dot 0.99 (no flip);
sheet `sheet_camera.png` opened.

## P6b. Blend hints: measure the path of a blend

```python
for hint in ("None", "IgnoreTarget", "CylindricalPosition"):
    rigs = [{"name": n, "type": "fixed", "target": "Hero/CameraTarget", "look_at": "Hero/CameraTarget", "position": pos, "blend_hint": hint}
            for n, pos in (("CM_Behind", [0, 2, -5]), ("CM_Front", [0, 2, 5]))]
    ut_run.run_method(P, "AgentKit.Animation.AnimCinemachine.SetupCameras", {"brain": brain, "rigs": rigs})
    p = ut_run.run_method(P, "AgentKit.Animation.AnimCinemachine.CameraProbe", {"events": [{"t": 0, "priorities": {"CM_Behind": 70}},
                          {"t": 0.5, "priorities": {"CM_Front": 80}}], "seconds": 2, "fps": 60, "captures": [0.8, 1.0, 1.2]}, graphics=True)
    ua.camera_probe_checks(p["result"])     # cm.blend_flip (up dot < 0.95), cm.swing_through_target (closest < half the start distance)
```

A blend moves the one Unity camera from shot A to shot B (XTVzs4B1d7I [00:10:56]); positions lerp in
a straight line unless a hint says otherwise, so cameras on opposite sides of the target dive
through it. Hints are per camera and combine; set the same on both (XTVzs4B1d7I [00:13:32];
u0a1F6BlczE [00:20:49]). Test `test_06b`. Result: pass; no hint: closest 0.50 m, up dot 0.00 (over
the head, looking straight down: sheet `sheet_blend_hints.png` opened, frame 1.0 s; the idle plays
in every frame), checks `cm.blend_flip`, `cm.swing_through_target`; IgnoreTarget: 0.50 m, up dot
0.995 (the flip gone, the swing not); CylindricalPosition: 5.02 m throughout, up dot 0.995, no
finding.

## P6c. Deoccluder, occlusion and jitter

```python
deo = {"collide_against": "Everything", "transparent_layers": ["Glass"], "ignore_tag": "Player", "radius": 0.1}
ut_run.run_method(P, "AgentKit.Animation.AnimCinemachine.SetupCameras", {"rigs": [
    {"name": "CM_Player", "type": "follow", "target": "Hero/CameraTarget", "offset": [0, 0.6, -4.5], "deoccluder": deo}]})
p = ut_run.run_method(P, "AgentKit.Animation.AnimCinemachine.CameraProbe", {"events": [{"t": 0, "priorities": {"CM_Player": 90}}],
    "seconds": 0.5, "obstacles": [{"name": "Wall", "position": [0, 1.5, -2], "scale": [4, 4, 0.2], "layer": "Default"}],
    "occlusion_layers": ["Default"]}, graphics=True)
j = ut_run.run_method(P, "AgentKit.Animation.AnimCinemachine.CameraProbe", {"seconds": 3, "series": True,
    "move_target": {"name": "Hero", "velocity": [0, 0, 1.1]}})
ua.jitter_metrics(j["result"]["vp_series"][30:])     # reversal_fraction: target screen steps that flip sign
```

Only non-trigger colliders on Collide Against are obstacles (u0a1F6BlczE [00:11:18]); Transparent
Layers never block the view [00:12:26] but, kept in Collide Against, still stop the camera entering
them (package source 3.1.7: the raycasts use Collide Against minus Transparent Layers with triggers
ignored; the camera-radius check uses Collide Against). For a moving player, replace `obstacles`
with the real level and a `move_target` path: `occluded_frames` must be 0. Test `test_06b`. Result:
pass; follow camera at z -4.5, 0.2 m wall at z -2 on the hero's line: solid wall, camera pulled to z
-1.80 and 0 occluded frames; the wall on TransparentFX listed in Transparent Layers: camera stays at
-4.5; the wall as a trigger: stays; the TransparentFX wall with Transparent Layers empty: pulled to
-1.80; the same wall with the plain follow camera (no Deoccluder): target occluded on 31 of 31
frames. Jitter of the damped follow camera over a 1.1 m/s walk (Brain in Manual Update, fixed dt):
reversal fraction 0.0, target screen step p95 0.00004 viewport units per frame.

## P6d. Camera audit negative controls

`AnimTests.RefactorJobs.MakeCameraAuditNegScene` (test-only) copies the lab to `AuditNeg.unity` with
an Orbital Follow + Camera Offset + Deoccluder camera without an Ignore Tag, a follow camera
carrying an Animator, and a glass pane on TransparentFX. `AuditCameras` must report
`cm.freelook_offset_deoccluder` (u0a1F6BlczE [00:02:41]), `cm.deoccluder_no_ignore_tag` (u0a1F6BlczE
[00:10:45]), `cm.deoccluder_glass_blocks` (glass named layers with colliders on Collide Against and
no Transparent Layers) and `cm.procedural_overrides_animation` (XTVzs4B1d7I [00:03:10]). Test
`test_06b`. Result: pass; all four raised on the negative scene; the lab scene audits 0 errors and 0
warnings.

## P7. Timeline cutscene from code: build, scrub, play

```python
spec = {"path": "Assets/Cutscenes/Intro.playable", "director": "Cutscene", "fps": 30, "wrap": "None",
        "animation": {"target": "Hero", "clips": [
            {"motion": "<Imports>/Turns_StartStop-Wk.fbx::Idle", "start": 0, "duration": 4},
            {"motion": "<Imports>/Nav-Accelerations.fbx::Walk", "start": 3.5, "duration": 7, "blend_in": 0.5},
            {"motion": "<Imports>/Victory-anim1.fbx::Victory-anim1", "start": 10, "duration": 10, "blend_in": 0.5}]},
        "shots": [{"camera": "CM_Wide", "start": 0, "duration": 6}, {"camera": "CM_Follow", "start": 5, "duration": 7, "blend_in": 1},
                  {"camera": "CM_Close", "start": 12, "duration": 8}],
        "light": {"object": "Directional Light", "clips": [{"start": 0, "duration": 8, "intensity": 1},
                  {"start": 7, "duration": 7, "color": [1, 0.6, 0.3, 1], "intensity": 2, "blend_in": 1}]},
        "markers": [{"time": 4, "payload": "start_walk"}, {"time": 12, "payload": "close_up"}],
        "signal": {"time": 19.5, "asset": "Assets/Cutscenes/ReturnControl.signal"}}
b = ut_run.run_method(P, "AgentKit.Animation.AnimTimeline.BuildCutscene", spec)
s = ut_run.run_method(P, "AgentKit.Animation.AnimTimeline.SampleCutscene",
                      {"fps": 30, "captures": [1, 5.5, 8, 12.5, 16, 19.8], "track_objects": ["Hero"]}, graphics=True)
p = ut_run.run_method(P, "AgentKit.Animation.AnimTimeline.PlayCutscene", {"fps": 30}, quit=False, graphics=True)
```

Core calls: `ScriptableObject.CreateInstance<TimelineAsset>()`, `tl.editorSettings.frameRate = 30`,
`tl.CreateTrack<AnimationTrack>(null, name)`, `track.trackOffset = TrackOffset.ApplySceneOffsets`,
`track.CreateClip(clip)` with `start`, `duration`, `blendInDuration`;
`CreateTrack<CinemachineTrack>`, `CreateClip<CinemachineShot>()`,
`shot.VirtualCamera.exposedName = GUID.Generate().ToString(); director.SetReferenceValue(name, cam)`;
`CreateTrack<ActivationTrack>().CreateDefaultClip()`;
`tl.CreateMarkerTrack(); tl.markerTrack.CreateMarker<AgentMarker>(t)`;
`CreateTrack<SignalTrack>().CreateMarker<SignalEmitter>(t)` +
`SignalReceiver.AddReaction(asset, evt)` with `UnityEventTools.AddVoidPersistentListener`;
`director.SetGenericBinding(track, obj)`. Clip offsets are matched (`AnimTimeline.MatchOffsets`:
evaluate at each clip start, store the root pose in `AnimationPlayableAsset.position/rotation`,
restore the character). Scrub:
`director.timeUpdateMode = Manual; RebuildGraph(); Play(); playableGraph.Evaluate(1/fps)` +
`brain.ManualUpdate`. Markers and signals need Playback: `PlayCutscene` runs Play mode with
`Time.captureFramerate` (`AnimPlayMode.Run`, domain reload off for the run, restored after); copy
results inside the per-frame callback, because Play-mode objects are destroyed before the finish
callback runs (observed: the receiver read as null). Custom track (`Runtime/AgentLightTrack.cs`,
`AgentLightClip.cs`): template behavior, `ClipCaps.Blending`, mixer weighted sum (accumulate from
`Color.clear`, not `Color.black`), `GatherProperties` for preview; one ScriptableObject or
MonoBehaviour per file. Test `test_07`. Result: pass; 20 s, 30 fps, tracks Animation 3, Cinemachine
3, AgentLight 3, Markers 2, Signal; all bound; live CM_Wide at 1 s, CM_Follow at 8 s, CM_Close at 13
s; light intensity 1.500 at 7.5 s (middle of the 1 s overlap) and 1.1754 at 7.27 s where the
ease-in-out curve predicts 1.1758; no root snap (hero z 7.17 at 10 s, 7.1 at 11 s; it was -0.07
before offsets were matched); Play mode: markers `start_walk@4`, `close_up@12`, 1 signal, director
stopped after 600 frames; sheet `sheet_cutscene.png` opened (idle facing the wide camera, follow
from behind, close-up, dance in blue light).

## P7b. Timeline owns the Brain: priority, handback, audit

```python
p = ut_run.run_method(P, "AgentKit.Animation.AnimTimeline.PlayCutscene",
                      {"fps": 30, "priorities": {"CM_Shoulder": 100}, "after_stop_frames": 45}, quit=False, graphics=True)
# rows: live camera each second; live_after_stop: the camera the Brain picks once the director stopped
a = ut_run.run_method(P, "AgentKit.Animation.AnimTimeline.AuditTimeline", {"director": "Cutscene"})
```

Cinemachine 3.1 Brain doc: the Brain picks by priority, a Timeline overrides it and priority has no
effect under it. Design the handback: the gameplay camera with the highest priority goes live when
the Timeline ends (wrap None), blending with the Brain's default blend (measured; gaps between shots
were not probed). `AuditTimeline` checks: unbound tracks (error), Signal Emitters without an asset
(error) or without a reaction on the object they notify (warn), custom markers delivered where no
`INotificationReceiver` listens (warn; receivers get every notification: type-check), shots whose
camera does not resolve (error), cameras whose priority the Timeline will ignore (info), animation
tracks on procedural cameras (warn). Test `test_07b`. Result: pass; in Play mode with CM_Shoulder at
priority 100: live CM_Wide at 1 s, CM_Follow at 8 s, CM_Close at 13 s, CM_Shoulder never live during
the 20 s; after the director stopped: CM_Shoulder live, blend finished within 45 frames; markers and
signal unchanged; the edit-mode scrub with the same priority kept the shot cameras; `AuditTimeline`
on the cutscene: 0 errors, 0 warnings; the negative director (test-only `TimelineAuditNegative`)
raised `tl.signal_without_reaction`, `tl.marker_without_receiver`,
`tl.animation_on_procedural_camera`.

## P8. Second-order dynamics and the Playables one-shot graph

```python
ut_run.run_method(P, "AgentKit.Animation.AnimProcedural.SecondOrderCheck", {"f": 2, "zeta": 0.5, "r": 0, "fps": 60})
ua.simulate_second_order(2, 0.5, 0, [1/60]*600, [0.0] + [1.0]*599)       # same numbers in Python
ut_run.run_method(P, "AgentKit.Animation.AnimProcedural.GraphOneShotCheck",
                  {"idle": "<Imports>/Turns_StartStop-Wk.fbx::Idle", "walk": "<Imports>/Nav-Accelerations.fbx::Walk",
                   "oneshot": "<Imports>/JumpDown-Sprt_St.fbx::JumpDown-Sprt_St", "fps": 30})
```

Runtime: `SecondOrderDynamics` (k from f, zeta, r; k2 clamp), `AgentAnimationGraph` (PlayableGraph,
top and locomotion `AnimationMixerPlayable`, one-shot `AnimationClipPlayable`, `Tick(dt)` blends,
`Destroy()`). Test `test_08`. Result: pass; peak 1.14222 (zeta 0.5), 1.0 (zeta 1), anticipation
-0.557 (r -2), C# equal to Python to 1e-5; f 30 Hz with a 250 ms frame stays finite (and diverges in
Python without the clamp); graph: blend 0.57 s for the 5.7 s clip, weight-sum error 0, a second
PlayOneShot of the same clip ignored, slot empty after the clip, graph invalid after Destroy.

## P9. Root motion into a CharacterController, in Play mode

```python
r = ut_run.run_method(P, "AgentKit.Animation.AnimProcedural.RootMotionPlay",
                      {"params": {"IsMoving": True, "Speed": 1.08}, "seconds": 3, "fps": 60}, quit=False, graphics=True)
```

Runtime `AgentRootMotionMover`: vertical speed in `Update`, one
`CharacterController.Move(deltaPosition + y)` in `OnAnimatorMove`,
`transform.rotation *= deltaRotation`. `vertical`: `Script` (gravity and jump from the component,
the clip's vertical root motion discarded: a scripted jump height with the jump clip imported Y
unbaked + Feet) or `ClipWhenUnbaked`
(`y = Lerp(deltaPosition.y, ySpeed * dt, animator.gravityWeight)`: a Y-unbaked drop or vault clip
moves the character vertically and hands back to gravity across the transition [added formula;
gravityWeight semantics from the 6.3 Manual, measured in P4b]). Test `test_09`. Result: pass;
Script: ground speed 1.107 m/s, exactly one Move per frame, grounded, state Locomotion;
ClipWhenUnbaked on the same Y-baked locomotion: same speed, one Move per frame, gravityWeight 1. Not
exercised: a real jump arc (the sample JumpDown clip drops below the flat lab floor).

## P10. Aim rig and solve order

```python
for order in ("head_first", "body_first"):
    r = ut_run.run_method(P, "AgentKit.Animation.AnimRigging.BuildAimRig",
                          {"order": order, "chest_weight": 0.7, "aim_target": [1.2, 2.0, 2.5], "capture": {}, "save": True}, graphics=True)
    a = ut_run.run_method(P, "AgentKit.Animation.AnimRigging.AuditRigs", {})
```

Core calls: `root.AddComponent<RigBuilder>()`, child `Rig`,
`rigBuilder.layers.Add(new RigLayer(rig, true))`, `MultiAimConstraint.data` (`constrainedObject`,
`sourceObjects = new WeightedTransformArray(0) { new WeightedTransform(target, 1f) }`,
`aimAxis`/`upAxis` from `BestAxis` dot products, `limits`), `TwoBoneIKConstraint.data` (root, mid,
tip, target, hint), `SetSiblingIndex` for order; evaluation in ONE graph with the controller:
`AnimationPlayableOutput` + `AnimatorControllerPlayable`, `rigBuilder.Build(graph)`,
`SyncLayers()` + `graph.Evaluate(1/60)`; `rigBuilder.Clear(); graph.Destroy()`. Test `test_10`.
Result: pass; head error 0.0 deg body-first vs 17.9 deg head-first (chest error 7.5 deg at weight
0.7, the intended partial turn); left hand 0.000 m from its IK target; axes found Y / -X for chest
and head of DefaultMale; `rig.solve_order` reported for head-first only; sheet `sheet_rig.png`
opened: a debug laser along the head's aim axis (Code Monkey's stretched cube) runs through the
target sphere body-first and passes above it head-first.

## P11. Static scan of project C#

```python
ua.scan_csharp(os.path.join(P, "Assets"))   # findings with file:line; heuristics, read every hit
```

Rules: `motion.delta_times_dt`, `motion.two_moves` (Move in Update and OnAnimatorMove),
`anim.string_parameter` (Animator calls by string), `import.unscoped_postprocessor`,
`import.role_from_take_name`, `import.reimport_in_callback`, `timeline.notify_no_typecheck`,
`rig.runtime_rebind`, `cm.cm2_api`, `input.legacy`. Strings and comments are blanked before the code
rules run. Test: offline `test_scan_csharp` (fixtures, including a generalist's processor that keys
loop flags on `clip.name.Contains("Idle")` with an unguarded `OnPreprocessAnimation`: all three
import rules fire; the scoped version raises none) and `test_scan_skill_code_clean` (the skill's own
C# and the test project: 0 findings). Result: pass.

## Agent traps met while building these jobs (observed)

| Trap                                                 | What it looks like                                     | Fix                                                        |
| ---------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| several captures in one editor update                | mesh shows a stale pose while bones moved              | `forceMatrixRecalculationPerRender`                        |
| archiving an asset with MoveAsset                    | scenes keep playing the archived copy (the GUID moved) | copy to `_archive`, rebuild in place                       |
| custom Timeline classes in one file                  | clips play nothing after reload                        | one ScriptableObject or MonoBehaviour per file             |
| `??` on a Unity object                               | `MissingComponentException` after "get or add"         | `AnimUtil.GetOrAdd`                                        |
| reading Play-mode objects after Play mode exits      | results come back null                                 | copy values in the per-frame callback (`AnimPlayMode.Run`) |
| next Timeline clip not offset                        | character snaps back to the start                      | match offsets (`AnimationPlayableAsset.position/rotation`) |
| reading `gravityWeight` with Apply Root Motion off   | 0 on every clip                                        | sample with `root_motion: true`                            |
| checking the Timeline handback in an edit-mode scrub | the last shot camera stays live after `Stop()`         | `PlayCutscene` with `after_stop_frames`                    |

## Not run here (and why)

- The Cinemachine Upgrader (CM2 to CM3 data upgrade): a GUI button with no public API; the project
  has no CM2 content. Path in `gui-paths.md`.
- A device build: animation runs the same in players; performance numbers belong to
  scenario-unity-performance on the target device.
- PlayableGraph Visualizer: a separate little-maintained package; the jobs dump weights and states
  as numbers instead.
