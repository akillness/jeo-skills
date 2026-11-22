---
name: scenario-unity-animation
description: "Use when a Unity 6.3 task involves character animation or cameras: Mixamo or mocap humanoid import and retargeting, Animator Controllers, blend trees, layers and avatar masks, root motion, foot sliding, IK and Animation Rigging, Playables, Timeline cutscenes, custom tracks and markers, Cinemachine 3 cameras, camera jitter, flipping blends or cameras hitting walls; or when clips import with no animation, a character T-poses, an idle drifts, feet slide or the head misses its aim target."
license: MIT
---

# Unity animation (animator and technical animator)

Expert animation work in Unity is ordering and measurement: which layer, constraint, transition or
camera wins is decided by list order, and whether feet, aim and blends are right is decided by
numbers taken from the clips. An agent without the Animator, Timeline or Scene windows builds
everything from data (AnimatorController, TimelineAsset, Cinemachine and Rigging components), steps
it deterministically, measures it, and looks at contact sheets. Target: Unity 6000.3.21f1,
Cinemachine 3.1.7, Animation Rigging 1.4.1, Timeline 1.8.12. If a sibling skill named here is
missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to
install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas
and flag the gap.

**REQUIRED BACKGROUND:** scenario-unity-expert (channels, review loop, 6.3 traps). Toolkit:
[`scripts/ut_animation.py`](scripts/ut_animation.py) and C# jobs in
[`scripts/AgentKit/Animation/`](scripts/AgentKit/Animation/) (namespace `AgentKit.Animation`),
runtime code in [`scripts/Runtime/`](scripts/Runtime/). Install with `ut_animation.install(P)`.

## Stance (the expert delta)

1. **Order is behavior, everywhere.** Lower Animator layers win (iHeartGameDev, W0eRZGS6dhQ
   [00:05:04]); additive stops at the first Override [00:09:46]; transitions are uninterruptible by
   default, and with Ordered Interruption only transitions above the running one cut in, ties to
   list order (Catherine Proulx, Unity blog; measured: her None, ordered, unordered and same-frame
   cases reproduce). An interruption blends from a frozen snapshot pose (measured: 0 deg/s bone
   motion on the interruption frame): keep interrupting transitions short [added inference]. Rig
   constraints solve depth-first, spine before head or hand (Code Monkey, luBBz5oeR4Q [00:06:20];
   measured head error 0.0 vs 17.9 deg).
2. **Blend-tree coordinates are gameplay units.** Children at measured `averageSpeed` /
   `averageAngularSpeed`, not 0 / 0.5 / 1 (_J8RPIaO2Lc [00:16:30]); clamp the runtime parameter to
   the children's extents, or the edge pose holds while speed keeps rising [frame 00:13:38]. Script
   speed that disagrees with the clip slides the feet (Ketra Games, mNxEetKzc04 [00:00:32]; measured
   slide p50 0.19 vs 1.14 m/s).
3. **Idle is its own state when its pose differs from the walk** (no exit time on IsMoving), the
   tree starting at a slow walk (mNxEetKzc04 [00:08:54]). Idle at the tree origin is fine only for
   in-place clips driven by script speed (_J8RPIaO2Lc [00:04:24]).
4. **Root motion is decided per clip and per axis** (6.3 Manual): idle bakes rotation, Y and XZ;
   straight locomotion bakes rotation and Y; turns keep rotation; height-changing clips leave Y
   unbaked with Based Upon Feet, so blends do not float and a scripted jump does not add the clip's
   hip rise twice. **Based Upon never causes drift:** a baked axis has zero delta whatever it says;
   it only picks where the pose sits. Original keeps the file's facing and position (Ketra bakes
   Mixamo idles that way, no drift); Body Orientation re-centers mocap segments (measured over 30 s:
   both 0 m drift, Original faced 88 deg away and stood 2.43 m off; XZ unbaked drifted 0.246 m). One
   `CharacterController.Move(deltaPosition + y)` in `OnAnimatorMove`, never
   `deltaPosition * Time.deltaTime` [00:07:21]. `Animator.gravityWeight` is 1 on Y-baked clips, 0 on
   Y-unbaked ones, blended across transitions (Manual; measured, and 0 everywhere with root motion
   off).
5. **Automate import from one reference, scoped to a folder** (git-amend, V9_Z6hUOG_8): rig in
   `OnPreprocessModel`, clips in `OnPreprocessAnimation`, `GetVersion()` bumped on rule changes,
   never a reimport inside the callbacks. Roles come from file names or rules, never take names:
   every Mixamo take is "mixamo.com". Reference FBX sub-asset clips; a clip duplicated before the
   Humanoid switch keeps bone paths (BEZHVYk6Fa4 [00:12:03]; measured: it moved the humanoid 0.0
   deg, the post-switch copy 40.1 deg). Copy From Other on a different hierarchy imports zero clips,
   reported only in the import log (observed). Translation DoF is off by default [00:02:21].
6. **Masks make layers; reference poses make additive layers.** An Override layer without a mask
   replaces the whole body; an additive clip only works over its authored base pose (W0eRZGS6dhQ
   [00:05:33], [00:09:57]). Masks at import drop fingers and IK goals a clip does not need (Manual,
   cost).
7. **Cameras: one Brain, move targets, pick the rig by game type** (Unity CM3.1 series). Smart
   Update plus Late Update blends first on jitter (Brain doc). Third Person Follow for
   over-the-shoulder; FreeLook plus Camera Offset plus Deoccluder fight (u0a1F6BlczE [00:02:41]). A
   procedural Position Control overrides animation; never parent one to a mover (XTVzs4B1d7I
   [00:03:10]). Cameras on opposite sides blend through the target: CylindricalPosition hint
   (measured: none 0.5 m and up dot 0.0, Cylindrical 5.02 m and 0.995, IgnoreTarget alone still 0.5
   m) [00:13:32]. Deoccluder: Ignore Tag the player, glass on Transparent Layers; triggers never
   count (measured). Timeline overrides the Brain: priority is ignored until it stops (measured in
   Play mode).
8. **Timeline: tracks for continuous actions, markers for instants, Signals when there is no
   payload** (Ciro Continisio, gsEe0_o_934 [00:18:53]). A receiver gets every notification routed to
   it: type-check [frame 00:22:57]. Mixers run while scrubbing; spawn in `OnGraphStart`, destroy
   after [00:45:30].

## Establish first

Platform and frame budget (performance hands off numbers); 3D skeletal vs 2D sprites (sprites go to
scenario-unity-2d); rig type (Humanoid for retargeting and Mixamo, Generic when one skeleton and
cost matter; Generic root motion works through the Root Node); root motion (player feet quality) vs
in-place (NavMesh AI, tight speed control); content source: Mixamo (FBX for Unity, 30 fps, keyframe
reduction none, same Mixamo character, Without Skin for clips; root motion: In Place off, Character
Arm Space raised; mNxEetKzc04 [00:03:04], _J8RPIaO2Lc [00:01:24]), mocap takes to split, DCC; camera
style; CM2 already in the project?; cutscene length and branching. Defaults: Humanoid, root motion
for the player, CM 3.1.7, 30 fps Timeline, Input System.

## Workflow

1. **Packages.** `AnimPackages.Add` with
   `["com.unity.cinemachine@3.1.7", "com.unity.animation.rigging@1.4.1"]` (async, `quit=False`),
   then `ua.install(P)`. GATE: `ua.pinned_packages(P)` all ok.
2. **Import.** `ua.default_rules("Hero.fbx", files)` -> `AnimImport.ImportDrop` (rules JSON,
   character first, masks, heals hierarchy mismatches). Split takes with `AnimSampler.ClipProfile`.
   GATE: audit `counts.error == 0`, avatar valid and human, every clip `human_motion`, no
   `anim.role_fallback`, an FBX outside the folder still Generic; `AnimImport.AuditClips` no
   `anim.generic_duplicate`.
3. **Controller.** Spec -> `AnimControllerBuilder.Build` (masks, layers, `auto` tree positions,
   transitions with interruption settings, hash class). GATE: `counts.error == 0`; positions equal
   measured speeds; `ua.blend_tree_checks(tree, param_ranges)` clean; urgent exits proven with
   `ua.interruption_probe_spec`-style events in `SampleStates`.
4. **Sample and look.** `AnimSampler.SampleStates` (Rebind, fixed `Animator.Update`; `events`,
   `trace`, per-sample `clip`/`controller`), `LocomotionMetrics` (`clip` for one clip alone). GATE:
   expected states; masked bones 0.000 deg; ground speed within 5 %; slide p50 < 0.25 m/s; idle 30 s
   drift < 1 cm; gravityWeight 0 through Y-unbaked clips (root motion on); sheet opened.
5. **Rigging.** `AnimRigging.BuildAimRig` then `AuditRigs`. GATE: head < 1 deg, hand < 1 cm, no
   `rig.solve_order`, frame looked at; one target moved, never rebound (`rig.runtime_rebind`); rig
   weight fades as the target goes behind (Htl7ysv10Qs [00:07:54], a Play-mode sample of
   `Rig.weight`).
6. **Cameras.** `AnimCinemachine.SetupCameras` (rigs, `blend_hint`, `deoccluder`), `AuditCameras`,
   `CameraProbe` (Manual Update; `obstacles`, occlusion linecast, `series`). GATE: live camera per
   event; `ua.camera_probe_checks` empty (no flip, no swing-through, no occluded or inside-geometry
   frames); `ua.jitter_metrics` reversal < 5 % [added]; audit 0 warn.
7. **Timeline.** `AnimTimeline.BuildCutscene`, `SampleCutscene` (scrub, frames), `PlayCutscene`
   (Play mode: markers, signals, live camera, handback), `AuditTimeline`. GATE: bindings; numeric
   blends; no root snap; markers and signals once; audit 0 warn; after the end the Brain's priority
   camera is live.
8. **Proof and code.** `AnimProcedural.RootMotionPlay` (one Move per frame),
   `ua.scan_csharp(Assets)` clean, numbers to scenario-unity-performance.

Procedures with full code and recorded results:
[`references/procedures.md`](references/procedures.md).

## Numbers

| Value                                    | Relative to                                     | Source                                         |
| ---------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| Clamp(0.1 x length, 0.1 s, 0.5 x length) | one-shot blend; blend out at length minus blend | fQzKJO-0dS8 [00:07:58]                         |
| 0.7 aim / 0.3 look                       | chest weight under a hand aim / a head look     | luBBz5oeR4Q [00:06:53]; Htl7ysv10Qs [00:08:59] |
| -100..100 deg                            | head aim limits, fade weight behind             | Htl7ysv10Qs [00:06:58]                         |
| Min 1 s, Wait 0                          | State-Driven camera against flickering states   | u0a1F6BlczE [00:09:32]                         |
| primary 2, fallback 1                    | ClearShot priorities                            | u0a1F6BlczE [00:14:53]                         |
| 30 fps, keyframe reduction none          | Mixamo download                                 | _J8RPIaO2Lc [00:01:24]                         |
| T < sqrt(4 k2 + k1^2) - k1               | second-order stability                          | KPoeNZZ6H4s [00:12:29]                         |
| 1.08 / 3.51 m/s, -98 / +77 deg/s         | Walk, Jog, turns of Unity's sample mocap        | observed                                       |
| 0 m vs 0.246 m                           | 30 s idle drift, XZ baked vs unbaked            | observed                                       |
| 0.5 m vs 5.02 m                          | closest camera approach, no hint vs Cylindrical | observed                                       |

## Quality gates

- **Measurable:** import audit and AuditClips clean; controller audit; mask check; speed within 5 %;
  slide p50; idle drift; rig errors; camera probe checks and jitter; Timeline bindings, events,
  audit; one Move per frame; C# scan.
- **Visual:** a contact sheet per stage judged with
  [`references/critique.md`](references/critique.md) (T-pose, feet in the floor, arms through the
  body, snaps, camera flips, framing); `ut_review` flags none.

## Common mistakes

| Mistake                                       | What it looks like                                    | Fix                                                    |
| --------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| sampling with Culling Mode not Always Animate | batch captures show the bind pose                     | the sampler forces Always Animate (observed)           |
| flags chosen from take names                  | every Mixamo clip gets the same loop and bake flags   | roles from file names or rules; rename clips           |
| unscoped import processor                     | every FBX in the project turns Humanoid               | a rules file or an `assetPath` guard; `ua.scan_csharp` |
| jump clip with root Y baked                   | floats in blends; hip rise added to the scripted jump | Y unbaked, Based Upon Feet                             |
| `.anim` duplicated before the Humanoid switch | the clip plays on no humanoid                         | re-duplicate after, or reference the FBX clip          |
| Copy From Other on a different hierarchy      | FBX imports with no clips, console silent             | read the import log; own avatar per file (observed)    |
| Based Upon blamed for drift                   | idle slides away over loops                           | bake XZ; Based Upon only places the pose               |
| parameter past the tree extents               | speed rises, animation does not                       | clamp to the children                                  |
| head constraint above the chest               | head misses its target                                | body first in sibling order                            |
| cameras on opposite sides, no hint            | blend dives through the head and flips                | CylindricalPosition on both                            |
| glass or triggers treated as walls            | camera jumps in front of windows                      | Transparent Layers; triggers are ignored               |
| priority raised during a cutscene             | nothing changes until it ends                         | Timeline owns the Brain                                |
| `Priority` set from an editor script          | Brain keeps the old camera                            | `cam.Prioritize()` (observed)                          |
| scrubbing to test markers or the handback     | no marker fires; last shot stays live                 | `PlayCutscene` (observed)                              |
| `OnNotify` without a type check               | reacts to every marker                                | `if (n is MyMarker m)`                                 |
| Optimize Game Objects applied early           | scene instance vanishes                               | apply late, before shipping (BEZHVYk6Fa4 [00:07:22])   |

More agent traps (GUID moves on archive, one class per file, `??` on Unity objects, Play-mode
reads): `references/procedures.md`.

## Handoffs

- **Receives:** character FBX and clips from scenario-blender-export, scenario-maya-expert or
  scenario-3d; input actions from scenario-unity-architecture; locomotion speeds, NavMesh agents and
  gameplay events from scenario-unity-gameplay; import-pipeline conventions from
  scenario-unity-pipeline-automation.
- **Delivers:** to scenario-unity-gameplay the controller, parameter contract (Speed m/s, TurnRate
  deg/s, IsMoving, Jump), hash class, root-motion mover (vertical source); to
  scenario-unity-rendering-lighting camera cuts (reset temporal effects on Camera Cut) and Timeline
  light tracks; to scenario-unity-performance Animator counts, culling modes, import masks, Optimize
  Game Objects late; to scenario-unity-vfx Signals and Activation tracks. Packet: project, jobs,
  audit JSON, sheets, metrics, Verified and Assumed lists.

## Unity 6.3 notes

- The 6000.3.21f1 manifest lists Cinemachine 2.10.7; a bare `Client.Add` resolved 3.1.7 (observed):
  pin anyway. CM3 is `Unity.Cinemachine`, `CinemachineCamera` plus components; CM2 upgrade = retype
  to `CinemachineVirtualCameraBase`, then Upgrade Entire Project (no Undo). In 6.6 CM3, Timeline and
  Animation Rigging become core.
- Timeline 1.8: `editorSettings.frameRate`. 6.3 adds `Animator.ResetControllerState`. Obsolete
  `ModelImporter` members become errors in 6.5.
- Templates run the Input System only; entering Play mode reloads the domain (Play-mode jobs switch
  it off for the run).

## References

- [`references/expert-notes.md`](references/expert-notes.md): principles and judgment by expert,
  with source and timestamp.
- `references/procedures.md`: every job with args, the Unity calls behind it, live test and result.
- `references/critique.md`: the rubric to judge rigs, blends, feet, cameras and cutscenes.
- [`references/gui-paths.md`](references/gui-paths.md): windows and menus for the same work.
- [`references/sources.md`](references/sources.md): every source, credential, URL, best timestamps,
  revision history.
