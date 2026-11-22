# scenario-unreal-animation: agent procedures

Every procedure: goal, code, test path, status. Code runs inside the editor (Epic MCP Python
toolset, `ue_remote.PythonRemote().exec`, or a headless job through `ue_run.run_python`) unless
marked offline. Setup in every job:

```python
import glob, sys
import unreal
sys.path[:0] = ["<skills>/scenario-unreal-animation/scripts", "<skills>/scenario-unreal-expert/scripts"]
import ue_anim as A          # this skill
import ue_run, ue_review     # lead toolkit: jobs, captures
```

Status legend: **offline-tested** (passed `tests/code/unreal-animation/test_anim_offline.py`, 30
tests, 2026-09-24, v0.1), **not yet run in Unreal** (engine not installed; `[verify]` names resolved
at run time by candidates, misses in `A.MISSES`).

Headless runs from the agent side (system python3):

```python
import ue_run
res = ue_run.run_python("/abs/MyGame/MyGame.uproject", "/abs/tests/code/unreal-animation/job_character_audit.py",
                        timeout=1800)            # commandlet: no level, no rendering
print(res["ok"], res["result"], res["log"]["summary"])
```

Never point a saving commandlet at a project an open editor has loaded (write locks; ue_run
docstring).

---

## P0. Probe the engine (first run on any machine)

Goal: replace every `[verify]` with the names this build exposes.

```python
res = ue_run.run_python(UPROJECT, TESTS + "/job_00_anim_probe.py")
# archive/tests/unreal-animation/<stamp>/probe.json: classes, wanted methods, enums,
# Interchange pipeline properties, default pipeline asset paths, a.* console names
```

Also set Project Settings > Plugins > Python > Developer Mode once: it writes
`Intermediate/PythonStub/unreal.py`, the most reliable list of exposed names (version deltas, Python
section). Test: `tests/code/unreal-animation/job_00_anim_probe.py`. Status: not yet run in Unreal.

## P1. Import a character and its animations (Maya, Blender)

Goal: explicit options, one skeleton, curves clean at import. Contract expected from
scenario-maya-rigging (`game_skeleton_check`): one root at the origin, joints only, unique names,
cm, FBX 2020.2, one clip per file, triangulated in the DCC (FBX pipeline doc: exporter triangulation
gives random smoothing). Blender: Apply Unit, Add Leaf Bones off, watch the armature object becoming
an extra root [added].

```python
r = A.import_character("/abs/in/SK_Hero.fbx", "/Game/Characters/Hero")        # new <Mesh>_Skeleton
skel = "/Game/Characters/Hero/SK_Hero_Skeleton"
clips = A.import_animations(["/abs/in/Hero_Walk_Loop_F.fbx", "/abs/in/Hero_Run_Loop_F.fbx"],
                            "/Game/Characters/Hero/Anims", skel, sample_rate=None)  # None = 30 Hz bake
assert all(c["skeleton_ok"] for c in clips), clips   # a clip on a stray skeleton will not play
```

What it sets (Interchange 5.8 names, Python paths `[verify]`): Import Only Animations, Skeleton,
Import Skeletal Meshes, Import Morph Targets, Create Physics Asset, Import Animations, Import Bone
Tracks, Use 30Hz to Bake Bone Animation or Custom Bone Animation Sample Rate, do not import all-zero
curves, delete existing curves on reimport. It duplicates Epic's default assets pipeline to
`/Game/_Agent/Pipelines/` and points `override_pipelines` at it; if Interchange fails it falls back
to `AssetImportTask` with `FbxImportUI` (legacy names). Use T0 As Ref Pose and Update Skeleton
Reference Pose change shared data: only on purpose (import options doc). Generic batch imports
(props, textures) belong to scenario-unreal-pipeline-automation (`ue_pipeline.import_source`); this
procedure only adds the skeletal and animation options. Importer status (version deltas):
Interchange is production ready for asset import (5.5) and the default for FBX level import (5.6);
whether FBX asset import goes through Interchange by default in 5.8 is [verify]. The functions set
options on both routes and report which one ran (`route`).

**Project-wide import defaults** (Lake [00:06:50]: change defaults in config, not per asset; import
options doc: Do not import curves with 0 values for gameplay clips; one sample rate, 30 Hz default
or the project rate). People importing through the dialog then get the same options as the agent.

```python
cfg = "/abs/MyGame/Config"
print(A.apply_ini_plan(cfg, A.import_defaults_plan(sample_rate=None), dry_run=True)["changed"])  # review
A.apply_ini_plan(cfg, A.import_defaults_plan())        # backup in Saved/AgentBackups, then restart the editor
```

Legacy importer: `[/Script/UnrealEd.FbxAnimSequenceImportData]` in
`DefaultEditorPerProjectUserSettings.ini` (Lake edits the engine's
`BaseEditorPerProjectUserSettings.ini`; the project file, section and keys are [verify]).
Interchange: keep the duplicated pipeline `/Game/_Agent/Pipelines/PL_AnimOnly` (Do not import curves
with 0 values, Use 30Hz to Bake Bone Animation or Custom Bone Animation Sample Rate) and put it in
Project Settings > Engine > Interchange > Import Content stack (GUI; Python route [verify]). Test:
`job_character_audit.py` (option `fbx`); `t_import_defaults_and_root_motion_decision`. Status: ini
plan offline-tested; editor side not yet run in Unreal.

## P2. Skeleton audit

```python
facts = A.skeletal_mesh_facts("/Game/Characters/Hero/SK_Hero")
v = A.import_audit(facts, bone_budget=None, expects_ik_bones=True, hero=False)
for i in v["issues"]:
    print(i["severity"], i["code"], i["message"])
```

Checks (offline-tested): one root, namespaces, duplicates, root at origin and orientation, unused
bones (no weights, parent of none weighted; IK bones kept), influences over 8 without unlimited
influences (Biava: render-only artifacts), over 12 on non-hero (DeVoe), influences increasing by
LOD, 800+ morphs, unit errors, missing mannequin IK bones, single LOD, no Physics Asset. Facts
routes: bones and parents through `SkeletonModifier` (5.4+) else AnimPose ref pose (no parents);
influences through `SkinWeightModifier` `[verify]`, else `max_influences` stays None and the check
moves to the GUI (Skeletal Mesh editor, select a vertex). Fixes: unused bones with the 5.8 Skeletal
Editor Bone Count Reduction (GUI, keeps parents up to root), or back to the DCC; extra procedural
bones belong in the Control Rig Construction Event (Biava [00:05:09]). Test:
`job_character_audit.py`; audit logic in `test_anim_offline.py::t_import_audit`. Status: logic
offline-tested, facts not yet run in Unreal.

## P3. Transfer decision

```python
src = A.skeletal_mesh_facts("/Game/Characters/UEFN_Mannequin/Meshes/SKM_UEFN_Mannequin")
d = A.transfer_method(src, facts)
print(d["method"], d["reason"])   # same_skeleton | compatible_skeleton | copy_pose_from_mesh | ik_retargeter
```

Richardson's ladder: same skeleton (translation retargeting modes), compatible skeletons (Skeleton
asset > Compatible Skeletons; 5.6 lets translation modes inherit from a compatible skeleton, off by
default), Copy Pose From Mesh (matching names only, ignores translation retargeting, unmatched bones
stay at ref pose) or Leader Pose (children cannot animate except in a post-process AnimBP), else IK
Retargeter. Test: `test_anim_offline.py::t_transfer_method`. Status: offline-tested.

## P4. IK Rig for the target

```python
rep = A.create_ik_rig("/Game/Characters/Hero/SK_Hero", "/Game/Characters/Hero/Rigs/IK_Hero")
if not rep["auto"]:                                    # auto template failed on custom names
    plan = A.biped_chain_plan(facts["bones"], facts["parents"])
    print(plan["unresolved"])                          # fix names by hand in the plan if needed
    rep = A.create_ik_rig("/Game/Characters/Hero/SK_Hero", "/Game/Characters/Hero/Rigs/IK_Hero_Manual", plan=plan)
rig = A.ik_rig_facts("/Game/Characters/Hero/Rigs/IK_Hero")
print(A.chain_map_check(rig["chains"])["issues"])
```

5.8 template layout (release notes): LeftLeg thigh to ankle with the IK goal at the ankle, LeftFoot
ball to toe; FBIK auto setup SubIterations 10, Goal ChainDepth 2; 17 templates plus Rigify and
Meshcapade. Pelvis: "Set Pelvis" (was Set Retarget Root). Chains mapped by name later: keep
IK_Mannequin chain names for Exact mapping (Richardson uses Exact "because I know exactly what I'm
working with"). Goals only on chains that need Blend to Source, Stride Warp or Speed Plant (doc).
FBIK fixes if goals misbehave (Control Rig doc values; IK Rig solver exposes similar settings
`[verify]`): `A.fbik_foot_defaults()`. Test: `job_retarget_pass.py`; plan logic
`t_biped_chain_plan_*`, `t_chain_map_check`. Status: plan offline-tested; controller calls not yet
run in Unreal.

## P5. IK Retargeter, built once, then templated

```python
r = A.create_retargeter("/Game/Characters/Hero/Rigs/RTG_UEFN_to_Hero",
                        "/Game/Characters/UEFN_Mannequin/Rigs/IK_UEFN_Mannequin",
                        "/Game/Characters/Hero/Rigs/IK_Hero",
                        source_mesh="/Game/Characters/UEFN_Mannequin/Meshes/SKM_UEFN_Mannequin",
                        target_mesh="/Game/Characters/Hero/SK_Hero")
print(r["steps"], r["gui_todo"])
ops = A.retargeter_facts("/Game/Characters/Hero/Rigs/RTG_UEFN_to_Hero")
print(A.op_stack_check(ops, proportions_differ=True, runtime=False)["issues"])
```

Order that decides contact (Richardson; 5.8 doc), set once, in the GUI where the controller does not
reach (`gui-paths.md`):

1. Retarget pose: new named pose (never Default), Auto Align, Snap Character to Ground, slight knee
   and elbow bend.
2. Scale Source at the top only if heights differ a lot; dial while watching IK goal debug draws.
3. Pelvis Motion: Floor Constraint Weight 1 with crotch offsets for shorter targets; Scale
   Horizontal and Vertical for stride and bounce.
4. FK Chains: Interpolated for spine and different bone counts, One to One for fingers, Translation
   Mode None.
5. Run IK Rig: legs enabled; sub-ops Blend to Source (Translation Alpha 1) on both legs, Floor
   Constraint with Use Foot and Use Toes (offsets default 10 cm), Stride Warp on legs only; Pole
   Vector Alignment op if knees twist.
6. Pin Bones: every mannequin IK helper bone the target has, so gameplay IK that reads them (GASP
   leg IK on `ik_foot_l/r`, weapon IK on `ik_hand_gun`) keeps working after retarget (IK Rig doc,
   Pin Bones; rigging digest 7). Pairs from
   `A.ik_bone_pin_plan(bones, A.mannequin_bone_map(bones, parents))` ([added] follow map:
   `ik_foot_l` to the foot, `ik_hand_gun` to the right hand, roots to the root); missing IK bones
   are added in the DCC or the Skeletal Editor first, the op cannot create them. Props: Copy Local
   Position with relative scale (`ik_hand_weapon` to `hand_r` doc example), then IK Blend to Source
   plus Scale Source for the hand contact (Richardson [00:30:23]-[00:32:42]).
7. Root Motion: Copy From Source Root for mannequin locomotion, Generate From Target Pelvis for
   mocap without root motion, Snap To Ground for in-place clips.
8. Remap Curves: Copy All Source Curves.
9. One-off corrections (legs spread on one character, a finger or neck offset): an Additive Pose op
   with a weight, placed where it acts (between FK and IK for fingers, neck, head), never edits to
   the base retarget pose or IK settings (Richardson [00:33:16]-[00:34:21]; op weighting was "not
   quite ready" in 5.6 [verify 5.8]). Gate: Retarget Output Log clean after swapping preview meshes
   (Window > Retarget Output Log; incompatibilities print there), `A.retarget_log_check(lines)` on
   the copied or saved log lines (log category names [verify]). Any retargeter that survives into
   shipping at runtime: per-op LOD thresholds on Run IK Rig, Filter Bones, Stretch Chains (sub-ops
   are skipped through Run IK Rig) and Profile Ops timings recorded on the target, passed as
   `op_stack_check(..., runtime=True, profile_ops_us={...})` (retargeting doc, Asset Settings and
   Retargeting Stack Framework; 5.7 notes). Save the tuned asset as `RTG_Template`; for each new
   character `A.create_retargeter(..., template="/Game/.../RTG_Template")` swaps target rig and
   mesh; incompatibilities print in the Retarget Output Log. One retargeter with Override Sets (5.8)
   replaces near-duplicates for gameplay states; `DuplicateRetargetOverrideSet()` is on the
   controller (5.8 notes, Python spelling `[verify]`). Test: `job_retarget_pass.py`; rules
   `t_op_stack_check`. Status: rules offline-tested; controller not yet run in Unreal.

## P6. Batch retarget and validate contact

```python
clips = ["/Game/.../M_Neutral_Walk_Loop_F", "/Game/.../M_Neutral_Run_Loop_F", "/Game/.../M_Neutral_Run_Reface_Start_F_L_180",
         "/Game/.../M_Crouch_Walk_Loop_F", "/Game/.../M_Neutral_Jump_Start", "/Game/.../M_Neutral_Mantle_1m",
         "/Game/Mocap/Hero/Mocap_Walk_Take03"]           # walk, run, turn, crouch, jump, contact, mocap
b = A.batch_retarget(clips, SRC_MESH, TGT_MESH, RTG, suffix="_Hero", retain_additive=True)
ratio = A.skeletal_mesh_facts(TGT_MESH)["height_cm"] / A.skeletal_mesh_facts(SRC_MESH)["height_cm"]
for s, t in zip(clips, b["created"]):
    sf = A.anim_clip_facts(s, bones=("root", "foot_l", "foot_r"))
    tf = A.anim_clip_facts(t, bones=("root", "foot_l", "foot_r"))
    for foot in ("foot_l", "foot_r"):
        v = A.compare_contact(A.foot_contact_metrics(sf["samples"][foot], sf["fps"]),
                              A.foot_contact_metrics(tf["samples"][foot], tf["fps"]), ratio, name=tf["name"] + " " + foot)
        print(v["ok"], [i["message"] for i in v["issues"]])
    print(A.root_motion_check(tf["samples"]["root"], tf["fps"], name=tf["name"], enabled=tf["root_motion"])["issues"])
```

5.8: RunBatchRetarget with FIKRetargetBatchOperationInputs and bRetainAdditiveFlags; fallback
`duplicate_and_retarget` (pre-5.8). Positions come from `anim_clip_facts` (AnimPose in component
space); never from `AnimationLibrary.get_bone_pose_for_frame` or `_for_time`, which return
parent-relative transforms [added, verify]. Batch with a hand-built retargeter, never an
auto-generated one (doc, Export Overrides). Tolerances in `foot_contact_metrics` and
`compare_contact` are [added] defaults (1 to 2 cm). Visual gate (latent job or live editor):

```python
seq = A.review_sequence(TGT_MESH, b["created"][0], "/Game/_Agent/Review/LS_Contact_Walk")["sequence"]
# add a side and a front CineCamera to the sequence (scenario-unreal-cinematics owns camera setup), then:
info = ue_review.render_still(seq, "/abs/archive/review/walk", frame=12)   # async; contact frame from the metrics
done = yield from ue_review.wait_render(info)                              # latent job; live editor: ue_review.wait_for_file(info["done_file"])
frames = sorted(glob.glob(info["out_dir"] + "/*.png") + glob.glob(info["out_dir"] + "/*.exr"))
print(ue_review.review_images(frames, sheet=info["out_dir"] + "/sheet.png"))  # image checks: not all white or all black
```

Look at contact frames side and front, characters side by side with the native in the middle (Jose
[00:35:47]), knees and elbows direction, props, pelvis height on crouch. Play several clips after
each change, toggling ops (Richardson [00:29:47], [00:32:08]). Test: `job_retarget_pass.py`; metrics
`t_foot_contact_and_compare`, `t_root_motion_check`. Status: metrics offline-tested; batch and
capture not yet run in Unreal.

## P7. Mocap from a third skeleton

1. Source IK Rig for the mocap skeleton (auto characterization covers many provider skeletons).
2. Separate `RTG_Mocap_to_Hero`: Filter Bones op (check with
   `A.filter_bones_check({"responsiveness": 0.5, "velocity_cutoff_hz": 20}, frame_rate)`), Stretch
   Chains if limb lengths must match, Root Motion Generate From Target Pelvis when the mocap root is
   static.
3. Validate as P6; `A.root_motion_check` flags a moving clip whose root does not move (hips-only
   mocap).
4. Stylized blocking from dense mocap (Sir Wade): bake to Control Rig, override layer below at
   weight 0, pass-through keys on golden frames, then weight 1 and constant keys. Agent substitute:
   pick frames at velocity extrema of key controls [added], key them on the override layer with
   `ControlRigSequencerLibrary.set_local_control_rig_transform(..., set_key=True)`, set constant
   interpolation, then `A.stepped_check` on sampled bones. Test: filter and stepped checks
   offline-tested; the rest not yet run in Unreal.

## P8. Animation content audit and cleanup

```python
eas = A._eas()
paths = eas.list_assets("/Game/Characters/Hero/Anims", recursive=True, include_folder=False)
facts = [A.anim_clip_facts(p, bones=("root",)) for p in paths if isinstance(unreal.load_asset(p), unreal.AnimSequence)]
v = A.anim_content_audit(facts, skeleton="/Game/Characters/Hero/SK_Hero_Skeleton", fps=30)
print(v["track_count_mode"], v["fix_in_engine"], v["fix_at_source"])
for clip in v["fix_in_engine"]:
    print(A.strip_curves(clip, dry_run=True))          # then dry_run=False after a snapshot
A.ensure_root_motion([f["path"] for f in facts if A.classify_clip(f["name"])["locomotion"]])
```

Lake: track count is a health signal (66 was right on his project, 89 and 159 meant problems); bone
tracks are best removed at the source, curves in engine. Change import defaults project-wide, not
per asset. ACL stays the default codec; editing a codec does not recompress until Compress is
pressed. Test: `job_locomotion_data.py`; `t_anim_content_audit`, `t_classify_clip`. Status: audit
offline-tested; facts and edits not yet run in Unreal.

## P8b. Movement model first, clips authored against it

Goal: clips that match what the capsule does, so selection problems are system problems, not
animation problems (GASP team, Tony, mhVp_cC9MLc [00:24:25]-[00:28:43]; DeVoe FLDXtAV7qsw
[00:06:27]-[00:08:40]). Applies to hand-keyed clips from Maya or Blender, and to mocap retimed to
the model.

1. Tune the movement model with rough or no animation until it plays well: speeds per gait and per
   direction (faster forward than sideways, slower backward), acceleration, braking. Character
   Movement Component values are a Blueprint or C++ edit owned by scenario-unreal-gameplay (property
   names [verify]); record the final values. GASP speeds when reusing GASP data: walk about 2,
   strafe 3.5, run 5 m/s; adding an intermediate speed means redoing every pivot and transition at
   that speed (GASP [01:27:17]).
2. Decide capsule-driven vs root-motion-driven now (DeVoe [00:07:33]); author clips with root motion
   either way, so they serve both (GASP clips do).
3. Record the capsule in PIE: 5.6+ Rewind Debugger > Trajectories dropdown > export (GUI); scripted
   substitute: Take Recorder from Python during a scripted PIE run with injected input
   (`unreal.TakeRecorderBlueprintLibrary` [verify]), then export the recorded track as FBX for the
   DCC.
4. Hand off to scenario-maya-animation or scenario-blender-animation: trajectory FBX (a locator on
   the capsule path), speeds per direction, stop spec, chest bone name on their rig
   (`A.mannequin_bone_map(...)["map"]["spine_05"]`), tolerance. Animator rules: "as mechanical as
   possible", root frame-exact on the path; chest (not hips) locked within tolerance so weight
   shifts survive; stops: the capsule halts in 5 frames, the capsule-relative root too, the body
   overshoots, steps back and settles within tolerance; stops on both feet and all phases (GASP
   [00:25:30]-[00:28:43]). Keep the root clean and the chest over it; non-bipeds drive the root from
   the center of mass (DeVoe [00:09:07]-[00:10:12], [00:38:21]).
5. On return, per clip, sample root and chest (`anim_clip_facts(bones=("root", chest))`) and compare
   with the exported capsule track resampled at the clip rate:
   ```python
   v = A.capsule_match(capsule_xyz, f["samples"]["root"], f["fps"], chest_frames=f["samples"][chest], name=f["name"])
   print(v["ok"], v["root_max_cm"], v.get("chest_max_cm"), v["capsule_stop"], v["root_stop"], [i["code"] for i in v["issues"]])
   ```
   then `A.speed_parity(model_speeds, measured)`. Tolerances (root 2 cm, chest 30 cm) are [added]
   defaults. Test: `t_capsule_match`, `t_chest_over_root_and_speed_parity`. Status: checks
   offline-tested; recording and export not yet run in Unreal.

## P9. Motion matching from GASP onto the character

1. Get GASP for 5.8 from Fab (Launcher > Library > Vault > Create Project), Migrate its content into
   the project; enable plugins through the lead toolkit, then restart:
   ```python
   import ue_env
   ue_env.enable_plugins(UPROJECT, ["PoseSearch", "Chooser", "AnimationWarping", "MotionWarping"])  # ids [verify]
   ```
2. Prototype with runtime retargeting (GASP doc): IK Retargeter from UEFN_Mannequin to the character
   (P5), entry `RTG_UEFN_to_{asset}` in `ABP_GenericRetarget` IKRetargeter_Map, child of
   `CBP_Sandbox_Character` with hidden mannequin mesh and a child mesh with the Component Tag (GUI
   steps in `gui-paths.md`).
3. Production: batch retarget the needed clips (P6), then plan the data:
   ```python
   names = [f["name"] for f in facts]
   print(A.motion_matching_coverage(names, strafing=True, states=("walk", "crouch"), mirrored=False)["missing"])
   plan = A.database_plan(names, chooser_columns=True)
   A.duplicate_assets([("/Game/Characters/UEFN_Mannequin/Animations/MotionMatchingData/Databases/<GASP db>",
                        "/Game/Characters/Hero/MM/" + d["name"]) for d in plan["databases"]])   # GASP names [verify]
   for d in plan["databases"]:
       print(A.set_database("/Game/Characters/Hero/MM/" + d["name"], clips=["/Game/Characters/Hero/Anims/" + c for c in d["clips"]],
                            search_mode="BRUTE_FORCE" if d["search_mode"] == "BruteForce" else None))
   ```
   Entry structs are `[verify]`: when `set_database` reports "add clips in the database editor", do
   it in the Asset Browser panel (GUI). Schemas: duplicate GASP's (channels are instanced objects);
   stops get their own schema with trajectory weighted higher. Coverage beyond the minimal set:
   `motion_matching_coverage(...)["foot_pairs_missing"]` lists every start, stop or refacing start
   without its other-foot variant (DeVoe [00:11:31]-[00:12:02]); mirroring through a mirror data
   table halves the authoring (GASP [00:59:22]). New capture: short shapes (hourglass, box, prism,
   diamond) covering 45, 90 and 135 degree permutations instead of dance cards; mocap for style,
   retimed within reason (a sprint cannot become a jog); build dense, prune to sparse, A/B (GASP
   [00:58:50]-[00:59:56], [01:30:27], [02:11:20]-[02:13:33]). 3b. **Remap every mannequin bone
   name** in the duplicated data. Duplicated schemas keep the mannequin names silently: the default
   Pose channel names `foot_l`, `foot_r`; GASP's Pose History samples feet, thighs, spine and
   pelvis; traversal channels read an attach bone present on all frames (motion matching doc,
   Mistakes and fixes; Jose [00:09:15]; GASP [01:42:02]).
   ```python
   mf = A.skeletal_mesh_facts("/Game/Characters/Hero/SK_Hero")
   bmap = A.mannequin_bone_map(mf["bones"], mf["parents"])
   for s in ["/Game/Characters/Hero/MM/PSS_Default_Hero", "/Game/Characters/Hero/MM/PSS_Stops_Hero"]:
       sf = A.schema_facts(s)
       v = A.schema_bone_check(sf["bones"], mf["bones"], bmap, schema_skeleton=sf["skeleton"],
                               target_skeleton=mf["skeleton"], mirror_table_skeleton=sf["mirror_table_skeleton"])
       print(s, v["remap"], v["unmapped"], [i["code"] for i in v["issues"]])
   ```
   Apply the remap in the schema editor (channel Bone fields) and set the schema's skeleton to the
   target (Python writes to instanced channels are [verify]); Pose History bones live on the
   AnimGraph node (Details, GUI, or 5.8 `BlueprintGraphEditor` [verify]); rebuild the mirror data
   table for the target skeleton; retargeted traversal clips need the attach bone on the target (add
   it or pin it). Chest checks use the mapped `spine_05`.
4. Tags for late tuning, not whole-database schema weights (Jose [00:18:28]); weights may still
   encode a design preference when coverage is low (step 6):
   ```python
   A.add_pose_search_tag(".../M_Neutral_Run_Reface_Start_F_L_180_Hero", "continuing_bias", 0.0, 0.4)
   A.add_pose_search_tag(".../M_Neutral_Run_Stop_F_Lfoot_Hero", "block_transition_in", 0.5, 0.3)
   ```
5. Chooser: duplicate `CHT_PoseSearchDatabases` and point rows at the new databases in the Chooser
   editor (rows are instanced structs, table UI).
6. Speed parity before any weight:
   `A.speed_parity({"walk": model_walk, "run": model_run}, measured)`. Weights then only express a
   preference between imperfect candidates when coverage is low (Sam, GASP [00:49:01]); late fixes
   go to tags. 6b. Motion Matching node guards and cost: Pose Jump Threshold Time (no jumps within
   the same asset closer than this), Pose Reselect History (no reselecting recent poses), Search
   Throttle Time (search less often); continuing pose bias also cuts searches. Search cost grows
   logarithmically with data, CPU only, spikier than blend spaces; spread characters across frames
   and threads (motion matching doc; GASP [01:24:26]-[01:25:36], [01:44:17]). No default values are
   given in the sources: read them from GASP's node.
7. Verify in PIE: cycle idle, walk, run, strafe, crouch, jump, traversal; the log must have zero "no
   database asset provided for motion matching"; record the Rewind Debugger (Tools > Debug) and read
   the transition frame: Active vs Continuing pose, Channel Breakdown. Timescale 0.25 still-camera
   captures of starts, stops, pivots, refacing starts. Small team or mobile: DeVoe's minimal set (12
   listed, 13 counted; 26 with strafing) plus the procedural nodes of P9b. A small set is not a
   reason for a state machine (GASP [01:21:06]). Test: `job_locomotion_data.py` (options `schemas`,
   `target_mesh`); `t_motion_matching_coverage`, `t_coverage_foot_pairs`,
   `t_database_plan_and_decision`, `t_mannequin_bone_map_and_schema_check`. Status: planning and
   checks offline-tested; asset edits and `schema_facts` not yet run in Unreal.

## P9b. Procedural nodes: steering, offset root bone, warping, foot placement

Graph work (AnimGraph and the Motion Matching node's blend stack): keep GASP's graph, read the node
order and settings (GUI, or 5.8 `BlueprintGraphEditor` on a copy [verify]), write them as a list and
check it:

```python
nodes = [{"name": "Motion Matching", "blend_stack": ["Orientation Warping", "Steering"]}, "Offset Root Bone", "Foot Placement"]
print(A.procedural_order_check(nodes, steering_states=["moving", "in_air"]))
for st in ("moving_ground", "stopped", "falling", "montage"):
    print(st, A.offset_root_bone_modes(st))
```

- Steering feeds Offset Root Bone, so it evaluates first; it lags root rotation toward the desired
  facing so keyboard input (0 to 1 instantly) stops thrashing selection (DeVoe
  [00:30:31]-[00:31:40]). Facing from the trajectory 0.5 s ahead (Jose [00:29:50]). Enable it only
  while moving or in air, else idles slide (GASP Enable Steering, motion matching doc).
- Offset Root Bone: translation Interpolate moving on the ground, Release when stopped, falling or
  in a montage; rotation Accumulate (turn in place, rotational starts), Release in montages; radius
  about 30 cm; translation half-life fast when stopped so stops end at the capsule center (GASP
  [01:51:44]-[01:55:09]; motion matching doc). No collision checks: the mesh clips into walls, so
  reduce the radius near walls or bend the trajectory (Jose [00:32:07]). Optional: without it,
  slightly more sliding and model and animation drift apart (Jose [00:32:39]).
- Orientation Warping per animation inside the blend stack, not on the blended pose; disable it on
  pivot corners by a curve read from the selected clip; switch steering setups by database tags
  (Jose [00:27:34]-[00:30:58]).
- Foot Placement with foot-lock curves generated by an Animation Modifier to cut sliding in arcs;
  mesh-space additive leans and look-at give intent with few clips (DeVoe [00:31:46]-[00:33:34]).
  GASP's lateral lean over-leans once arcs are in the databases (motion matching doc). Visual gate:
  running into a wall, stop at the capsule center, starts on keyboard input, arcs, each node toggled
  from the GASP widget (Anim Nodes toggles) to judge its contribution. Test:
  `t_offset_root_and_procedural_order`. Status: checks offline-tested; graph reading not yet run in
  Unreal.

## P10. State machine route (Lyra)

When `A.decide_locomotion(...)` returns `state_machine` or `hybrid`: migrate Lyra's
`AnimBP_Mannequin_Base`, `ALI_ItemAnimLayers`, `ABP_ItemAnimLayersBase`; retarget the clips (P6);
set Sequence Player and Blend Space variables on data-only child AnimBPs; distance matching for
starts, stops and lands, stride warping on cycles, orientation warping so 4 cardinal strafes cover
360 degrees; Turn Yaw curves baked with the Turn Yaw Anim Modifier (needs root motion enabled on the
source). Graph edits (states, transitions, aliases) are GUI; keep flat top-level state machines
reused through cached poses (Lake). Status: not yet run in Unreal.

## P11. Root motion and montages

```python
print(A.root_motion_mode_check(current_mode=None, multiplayer=True, montage_root_motion=True)["plan"])
# {'mode': 'ROOT_MOTION_FROM_MONTAGES_ONLY', 'graph_on_game_thread': True, ...}
A.animbp_settings("/Game/Characters/Hero/ABP_Hero", root_motion_mode="ROOT_MOTION_FROM_MONTAGES_ONLY")
mf = A.anim_clip_facts("/Game/Characters/Hero/Montages/AM_Vault", bones=("root",))
info = {"name": "AM_Vault", "length_s": 1.2, "blend_out_time": 0.25, "blend_out_trigger_time": -1, "enable_root_motion": True}
print(A.montage_blend_out_check(info, mf["samples"]["root"], mf["fps"]))
A.set_montage_blend_out("/Game/Characters/Hero/Montages/AM_Vault", 0.0)   # GASP's live fix
```

Game-thread cost, stated correctly: Root Motion from Everything AND Root Motion from Montages Only
both update the AnimGraph on the game thread instead of a worker (root motion doc verbatim; Lake
[00:13:18]; animation digest 10). Montages Only is the capsule-driven choice (networking, server
does not run animation, CMC handles root motion poorly: GASP [00:23:53]), not a threading
optimization: budget the game thread for every character using it and measure it in Insights. Crowds
or NPCs that never play root-motion montages: No Root Motion Extraction, which the doc wording
leaves on workers [inference, verify]. Whether the engine only moves the update while a root-motion
montage plays is [verify] in the installed engine (Insights, animation channel, game thread vs
worker tasks under each mode). In PIE: `show collision`, the capsule stays with the mesh instead of
the mesh drifting and snapping back; Walking and Falling ignore root motion Z (Flying applies it).
Multiplayer trajectories need the CMC's input acceleration replicated in C++ (GASP [01:36:57]): hand
to scenario-unreal-gameplay. Traversal (GASP [00:50:39]-[01:08:07], [02:14:39]-[02:22:32]): a
Chooser narrows candidates by action type, speed, obstacle height and depth to about two montages
(left and right foot); a callable Motion Match picks asset, start time and play rate among frames
marked by Pose Search Branch In; custom Blueprint channels read the ledge transform (5.8:
`...FromContext` overrides) against an unweighted attach bone in the clips; Motion Warping absorbs
the residual error. Tails: a notify state forces the montage to blend out early, and the clip's tail
(landing and run-out) sits in a locomotion database the Chooser enables when JustTraversed, so
follow-through plays yet the player steers at once; `database_plan` files `*_From_Traversal*` and
`*Vault*_Tail` names there. Test: `job_locomotion_data.py` (options `montages`, `anim_bp`,
`multiplayer`); `t_montage_blend_out`, `t_root_motion_mode_check`. Status: checks offline-tested;
edits not yet run in Unreal.

## P12. Control Rig foot IK (runtime) and replay

1. Prefer what ships, knowing its limits: GASP 5.4 leg IK only locks the feet to the IK foot bones,
   with no ground adaptation ("ground IK coming", GASP [00:15:00]; animation digest, Outdated)
   [verify what the current GASP ships]; it needs the IK helper bones pinned on a retargeted
   skeleton (P5 step 6). For slopes and stairs use the Foot Placement node (Animation Warping) or a
   Control Rig (step 2).
2. Custom rig: `rig = A.control_rig_from_mesh("/Game/Characters/Hero/SK_Hero")`. Graph logic [added
   unless cited]: per foot a trace from above the foot down, vertical offset to the hit, pelvis
   lowered by the largest downward offset, FBIK (root pelvis, feet effectors, Root Behavior Pin to
   Input, knee preferred angles, ankle limits from `A.fbik_foot_defaults()`; on a non-mannequin
   skeleton `fbik_foot_defaults(mannequin_like=False)` and re-derive the knee axis in the viewport,
   the Z 45 value is the mannequin's), feet rotated to the hit normal within limits, offsets
   smoothed over time, alpha faded when airborne. Setup that does not change per frame goes in the
   Construction Event (Biava).
3. Agent path for graph work: build the graph once (computer use, or take an existing rig), then
   Class Settings > Copy Python Script, and replay the script with new bone names; the Control Rig
   Python Log records every GUI edit as Python (Control Rig doc). Doc-confirmed calls:
   `rig.get_controller().add_unit_node(script_struct=unreal.RigUnit_...static_struct(), method_name="Execute", position=unreal.Vector2D(x, y))`,
   `rig.get_hierarchy_controller().add_bone(...)`, `rig.recompile_vm()`; the FBIK unit struct name
   `[verify]` (likely `RigUnit_PBIK`). Doc snippets have small bugs (unquoted names, missing
   parentheses, `EditorLevelLibrary`): fix before running.
4. Performance: profile (Class Settings > Enable Profiling, microseconds per node), set the Control
   Rig node LOD threshold in the AnimBP so distant characters skip it [added]; convert to a C++ rig
   unit only for hot runtime functions (60 vs 10 to 16 µs, LEGO Fortnite).
5. Verify: stairs and a 30 degree slope captures, foot-to-floor gap per frame (trace in the review
   level), no knee hyperextension, no pop onto a stair, no jitter standing. Status: not yet run in
   Unreal.

## P13. Bake Sequencer work to animation, and animation onto a rig

```python
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
ls = unreal.load_asset("/Game/Cine/LS_Shot010")
binding = ls.get_bindings()[0]
A.bake_to_anim_sequence(ls, binding, "/Game/Characters/Hero/Anims/Baked/Hero_Shot010", link=True)  # linked, re-bakes on edit
unreal.ControlRigSequencerLibrary.bake_to_control_rig(world, ls, rig_class, unreal.AnimSeqExportOption(), False, 0.001, binding)
```

Only rigs with a Backwards Solve appear in Bake To Control Rig. Use Warm Up Frames or Delay Before
Start when post-process AnimBP effects must settle. In Sequencer, constraints start at their
creation frame, the bottom active one wins, disable with the Active key, retime by deleting and
re-keying (Sir Wade); constrain to bones or spawnables rather than controls (Biava). Shot structure
belongs to scenario-unreal-cinematics. Status: calls doc-confirmed, not yet run in Unreal.

## P14. Animation performance pass

```python
import ue_run
res = ue_run.run_python(UPROJECT, TESTS + "/job_perf_defaults.py")      # dry run: lists ini changes
# after review: UE_ANIM_JOB={"apply": true, "anim_bps": ["/Game/Characters/Hero/ABP_Hero"]} then restart the editor
cfg = {"plugin_enabled": True, "component_class": "SkeletalMeshComponentBudgeted", "auto_calculate_significance": True,
       "auto_register": True, "enable_animation_budget_node": True, "cvar_enabled": True, "uro_enabled": False, "budget_ms": 1.0}
print(A.allocator_config_check(cfg))
print(A.lod_settings_check(lods_from_mesh, shared_settings_asset=True))
A.budget_console(budget_ms=1.0, enabled=True, debug=True)               # a.Budget.* in the running game world
```

Order (Lake; AnimBP doc): measure first (`stat anim`, `stat unit`, `stat unitgraph`,
`showdebug animation`, Insights with the Animation channel from the Trace widget); project defaults
(Only Tick Pose When Rendered; it does not cover placed Skeletal Mesh Actors); AnimBPs multithreaded
with Warn About Blueprint Usage, compile, fix every warning (graph work: math on pins into
thread-safe functions, reference chains into Property Access); NPCs on SkeletalMeshComponentBudgeted
(component class change is a Blueprint edit, or C++ `SetDefaultSubobjectClass`), Enable Animation
Budget on Begin Play plus `a.Budget.Enabled`; LOD Settings asset, hysteresis, bone lists, influences
8, 4, 1; fixed bounds only where the mesh stays inside; leader pose bounds on modular characters.
Re-measure the same path; `ue_stat.budget_check` on the captured frames; screenshots at several
distances. Test: `job_perf_defaults.py`; `t_ini_plan_and_apply`, `t_lod_and_allocator`. Status: ini
writer offline-tested on temp files; editor side not yet run in Unreal.

## P15. MetaHuman game tier

```python
A.metahuman_build("/Game/MetaHumans/Hero/Hero", quality="MEDIUM", pipeline="OPTIMIZED")   # doc Python
print(A.metahuman_tier_check({"platform": "mac", "pipeline_type": "optimized", "hair": "cards", "use": "hero",
                              "dna_lods": 8, "face_mesh_lods": 8}))
```

Then LODSync (Forced LOD -1, Min LOD per platform) and MetaHuman component thresholds (Facial
Animation LOD Threshold default 2, neck correctives and neck procedural rig have the biggest impact)
on the assembled Blueprint (property names `[verify]`); cards on Mac
(`r.HairStrands.UseCardsInsteadOfStrands 1` or groom Min LOD 3); audition LODs at the game camera
from LOD 2 on PS5-class; `stat anim`, `stat gpu` (catches a cinematic export), Insights in a Test
build on target. Upgrading from 5.7:
`ue_run.run_commandlet(UPROJECT, "ConvertLegacyDNAAssets", ["-PathFilter=/Game/MetaHumans", "-ResaveDNA", "-Verbose", "-DryRun"])`,
then without `-DryRun`, then re-assemble. Cloud texture and auto-rig requests need an interactive
Epic sign-in once. Test: `t_metahuman_cloth_filter_stepped`. Status: check offline-tested; build not
yet run in Unreal.

## P16. ML Deformer data preparation

1. ROM wider than the shipped animation on all three axes (animators put small rotations everywhere;
   a 20 degree clavicle ROM collapsed under a 70 degree cinematic). Compute shipped bounds by
   sampling clips with AnimPose (P8 facts) [added].
2. Training sim without gravity and inertia, 7 frames animate-in plus 3 settle per random pose
   (Fragapane and Stoneham).
3. `A.ml_deformer_data_check({...})`: equal frames and rate, vertex counts, 3,000 frames minimum
   (7,500 good), ROM covers bounds, no twist or helper inputs, 64 to 256 morphs.
4. In the asset (GUI): model chosen at creation (changing it wipes the session), Add All Animated
   Bones then remove twist and helpers, Local mode, 4 to 12 morphs per bone, 1,000 to 3,000
   iterations for a test, Train (toolbar), Testing mode on a novel clip with the Ground Truth heat
   map. The Deformer Graph must also be set on the Skeletal Mesh Component for runtime. Status:
   check offline-tested; training is a GUI action.

## P17. Cloth review

`A.cloth_config_check(cfg)` then captures of sprint, sharp turn, sudden stop, crouch from front,
side and back: clipping, over-stretch, pops at kinematic borders, tangling, fabric identity (Epic
China TA). Game path: panel cloth (production ready in 5.8), coarse sim mesh with adaptive remesh on
the max distance mask, backstop radius growing with distance, geodesic tethers with filtered ends,
velocity scale clamps, sphere self collision, kinematic collider only near. Dataflow graph edits are
GUI; runtime changes through the Cloth Outfit Interactor (Blueprint). Status: check offline-tested;
the rest not yet run in Unreal.

## P18. Capture loop for animation review

Latent job or live editor. Fixed cameras (side, front, three-quarter), same frames each iteration,
`ue_review.render_still` or `ue_review.screenshot_views`, then `ue_review.image_checks` (never
approve an all-white or all-black frame) and `ue_review.contact_sheet` for side-by-side review. For
locomotion in PIE: GASP widget timescale 0.25 and still camera; separate camera lag from animation
before retuning (GASP [01:46:01]). Score with `critique.md`. Status: lead toolkit calls, not yet run
in Unreal.
