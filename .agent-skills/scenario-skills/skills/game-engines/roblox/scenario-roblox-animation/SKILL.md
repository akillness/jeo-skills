---
name: scenario-roblox-animation
description: "Use when animating Roblox characters, NPCs or creatures: animation not playing, wrong animation wins, animation priority or weight, blending, animation events and markers, hit timing, import from Blender or FBX, custom rig or creature rig, Motor6D or AnimationConstraint joints, procedural animation, IKControl look-at or foot and hand IK, FaceControls and dynamic head expressions, replacing the default Animate animations, KeyframeSequence or CurveAnimation built in code, Animator replication, AnimationController NPCs, Character Controller Library abilities, adaptive animation for custom humanoids."
license: MIT
---

# Roblox animation and characters

Target line: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

Expert level here means every clip, layer, IK chain and face is proven in Studio by numbers: which
track wins each joint, when each marker fires, what the server sees, and that the stepped pose
matches its source. An agent cannot drive the Animation Editor, so it builds clips in code, steps
them in Edit, plays them in a playtest and measures joints and tracks before it calls anything done.
If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

## Stance (the expert delta)

1. **Avatar joints are `AnimationConstraint`, not `Motor6D`.** The Avatar Joint Upgrade made R15
   `C0` and `C1` read-only (L1, L8). Procedural motion multiplies into `Transform` in PreSimulation,
   which applies as a deferred batch and does not replicate (Suphi Kaner, BRYp2-rdpXQ 00:00:33).
   Code that looks joints up must accept both classes.
2. **Load through the `Animator`, from the side that owns the rig.** The owning client plays its
   character's tracks and the server sees them (L6); the server plays NPC tracks and clients see
   them (L7). `Humanoid:LoadAnimation` is deprecated.
3. **Priority partitions joints; keys claim them.** A higher priority wins only the joints it keys,
   and an identity key still claims its joint (L4). In clips built in code, parent Poses that are
   only on the path need Weight 0, or they override lower tracks [added] (L4).
4. **Time gameplay with markers, never waits.** Use one event name with a parameter (Develuper,
   d5GGIJJyMpg 00:02:52). `GetMarkerReachedSignal` fired within one frame (L6); `KeyframeReached`
   needs named keyframes (BrawlDev, zSK7bOoxuig 00:25:25).
5. **Faces play as clips, not property writes.** On a player's dynamic head, a `FaceControls` write
   or a finished tween reverts to 0 within 0.5 s, even with every track stopped [added] (L10, L16).
   A face clip holds, replicates, and survives the mood animation.
6. **IKControls are created on the server; look-at weight is 0.999.** At weight 1 the neck twists
   when the target passes behind; `IKControl.Priority` orders the solves; `Pole` is set from code
   (Suphi Kaner, 8fV-XOOj6O4 00:18:56, 00:53:00, 00:54:40).
7. **Blender clips are 24 fps, armature only, no scale keys.** Leaf bones, NLA strips and All
   Actions go off; Force Start/End Keying and Simplify 0 stay on (Mykaiju, NI7GXKLwk6U 00:23:45 to
   00:27:07). 60 fps doubles the keys for no gain in gameplay (Nisky, EM9u4gIHoRg 00:07:55).
8. **Temporary ids are test fixtures.** `RegisterKeyframeSequence` hashes and `active://` ids work
   in Studio only; the shipped game references published `rbxassetid://` ids owned by the experience
   owner (Animation Editor docs).

## Establish first

- **Rig kind.** R15 avatar (AnimationConstraint, BallSocket limits), custom part rig (Motor6D),
  skinned mesh (Bones), or AnimationController creature. Run P1 instead of guessing.
- **Who plays what.** Player clips on the client, NPC clips on the server, cosmetic layers locally.
- **Server Authority.** When on, an Animator keeps at most 8 active tracks, and tracks are looked up
  each tick with `GetTrackByAnimationId`, never cached.
- **Character Controller Library.** When on, movement comes from `ControllerManager` and abilities;
  ability callbacks never yield.
- **Faces.** Is there a dynamic head (`Head` has `FaceControls`)?
- **Motion source.** Blender FBX, a Scenario-generated rig or motion, the Animation Editor, or code.
- **Publishing owner.** User or group; clips must be published under the experience owner.
- Defaults: R15, Action for gameplay clips, Idle and Movement for locomotion, 24 fps, markers named
  after the event with a parameter.

## Procedure

Code for every step is in `references/procedures.md` (P1 to P15), with the test that ran it and its
numbers.

1. **Inspect the rig (P1).** Run `AnimRig.joints`, `AnimRig.tree` and `AnimRig.path` on the model.
   GATE: joint classes are known, every animated part has a path from the root, and an Animator
   exists.
2. **Build or bring the clips (P2, P3, P10).** Code clips use `AnimClip.keyframes` or
   `AnimClip.curves`, are registered with `AnimClip.register` and loaded with `AnimClip.load`, which
   waits for `Length > 0`. Blender clips go through `blender_roblox_anim.py` (audit, export, sample)
   and `AnimClip.fromSamples`. GATE: stepped joint angles match the keys within 0.3 degrees; Blender
   bone tails match within 0.01 studs.
3. **Layer and time (P4).** Set priorities, weights and fades; key only the joints each clip owns;
   put markers on contact frames. GATE: `AnimClip.tracks(animator)` shows the intended winner per
   joint, and each marker fires once per cycle.
4. **Preview in Edit (P5).** Call `AnimClip.settle` first: a clip that ended on its own still blends
   into the next one (P3). `rbx_animation.pose_sheet` steps a track with `Animator:StepAnimations`,
   captures each time and builds one contact sheet. GATE: read the sheet; the frame differences are
   above zero; `AnimRig.reset` leaves no posed joint before the place is saved.
5. **Playtest (P6, P8).** Play player clips from the client and NPC clips from the server; read the
   joints on both sides. GATE: the server finds the client's track, both sides report the same joint
   angle, and a capture shows the pose.
6. **Layers, IK and faces (P9, P12, P7).** Procedural offsets go into `Transform` in PreSimulation
   and skip when `Animator.EvaluationThrottled` is true. IK comes from `AnimIK.reach` and
   `AnimIK.lookAt`; faces from `AnimFace.clip`. GATE: the measured neck yaw, IK gap and face values
   on the server, plus a capture each.
7. **Defaults and audit (P13, P14).** Replace default animations through the `Animate` values; run
   `AnimAudit.all`. GATE: no error or warning finding; after a state change the client plays the new
   clip, checked by `Length` and joint angle, not by id.
8. **Publish list.** List every clip to publish, its priority, loop and markers, and the owner.
   GATE: no temporary id in shipped code (`AnimAudit` rule `temp-animation-id`).

## Numbers

| Value                          | Number                                                                           | Relative to                      |
| ------------------------------ | -------------------------------------------------------------------------------- | -------------------------------- |
| Priority order                 | Core < Idle < Movement < Action < Action2 < Action3 < Action4                    | `Enum.AnimationPriority`         |
| Default Animate tracks         | idle at Core, mood at Idle                                                       | L6, player avatar                |
| Fade                           | `Play(0.4)` ramps weight 0.25 per 0.1 s                                          | L4                               |
| Same-priority blend            | weighted mean: 90 and 60 degrees give 75 at equal weights, 84 at 1 and 0.25      | L4                               |
| Action at weight 0.5 over Idle | 60 degrees between 90 and 30                                                     | L4                               |
| Marker at 0.25 s of playback   | fired at 266 ms, frame 16.3 ms                                                   | L6, speed 2                      |
| Stopped and Ended              | 500 and 816 ms for a 0.5 s playback                                              | L6                               |
| Natural end, then a new clip   | old pose blends in for 0.25 to 0.375 s (31.8 instead of 22.5 degrees at 0.25 s)  | L3                               |
| First load                     | Length 0 at `LoadAnimation`, 14 ms to load in Edit                               | L2                               |
| Neck layer of 45 degrees       | 41.9 degrees on the joint, head 45.5 degrees off the root                        | L8                               |
| IK reach                       | hand 0.20 to 0.23 studs from a reachable target within 0.1 s, same on the client | L9                               |
| IK limits                      | 4.17 studs from an unreachable target; 1.13 at Weight 0.5                        | L9                               |
| IK SmoothTime 0.5              | gap 1.81 to 0.37 studs over 0.6 s                                                | L9                               |
| Look-at                        | Weight 0.999; head within 0.05 degrees of the target                             | L9; Suphi Kaner                  |
| Face write or tween            | back to 0 within 0.5 s                                                           | L10                              |
| Face clip                      | JawDrop 0.55 on client and server; the open mouth shows in the capture           | L10                              |
| Blender to Studio              | worst bone-tail error 0.0002 studs, 10 bones, 25 frames                          | L12                              |
| Skin weights                   | at most 4 influences per vertex                                                  | skinning docs                    |
| Server Authority               | at most 8 active tracks per Animator                                             | Server Authority docs            |
| Dynamic head                   | 4,000 triangles; validation checks 5 animations from 17 FACS poses               | specs; Roblox Learn, OwhkWzSBnf0 |

## Quality gates

Measurable:

- `AnimAudit.all(game)` returns no error and no warning (P14).
- Every track the code plays reports `Length > 0`, the intended priority and `WeightCurrent` 1 at
  rest (`AnimClip.tracks`).
- Each marker the code listens to fires once per cycle at its time, within one frame.
- Server and client report the same joint angles for replicated tracks.
- Blender exports pass `audit` with no finding, and P10's tail error is under 0.01 studs.
- `AnimRig.dirty` is empty on every rig before the place is saved.

Visual (contact sheets of at most 1,600 px, `rbx_review.contact_sheet`):

- Pose sheet of each clip at 4 to 6 times: silhouettes read, arcs, no interpenetration, closed loop.
- Playtest captures: player clip, NPC clip, IK reach with the target visible, face close-up next to
  a neutral capture.
- Judge with `references/critique.md`.

## Common mistakes

| Mistake                                           | Symptom                                                                          | Fix                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Clip at Core or Idle                              | plays but the default idle wins                                                  | Action for gameplay clips                                                                 |
| Action clip keys the legs                         | legs freeze while walking                                                        | key only the joints the clip owns                                                         |
| Code-built clip with Weight 1 parents             | upper body overrides idle and walk                                               | Weight 0 on path-only Poses (`AnimClip.keyframes`)                                        |
| Playing right after a fresh register              | nothing moves, `Length` 0                                                        | `AnimClip.load` waits for `Length > 0`                                                    |
| `C0` writes on avatar joints                      | "Property is read only"                                                          | multiply into `Transform` in PreSimulation                                                |
| `FindFirstChildOfClass("Motor6D")` on R15         | nil on upgraded avatars                                                          | `AnimRig.joint` accepts both classes                                                      |
| Tweening `FaceControls`                           | expression flashes, then neutral                                                 | `AnimFace.clip` played on the Animator                                                    |
| `task.wait` for hit timing                        | hits drift with speed and lag                                                    | markers with parameters                                                                   |
| Preview left posed in Edit                        | saved place shows the pose                                                       | `AnimRig.reset(rig)`                                                                      |
| `rig.HumanoidRootPart` on a Custom skinned import | nil: the importer names the root `RootPart` (2 x 2 x 1), and bones never collide | `AnimRig.prepareImport`; clips authored before it still bind (`references/characters.md`) |
| Measuring right after another clip ended          | first 0.3 s blends toward the old end pose                                       | `AnimClip.settle` in Edit; deliberate fades in game                                       |
| Checking a replaced default by its id             | id matches while the old clip plays                                              | check `Length` and the joint after a state change                                         |
| 60 fps or scale keys in Blender                   | heavy clips, scale ignored                                                       | 24 fps, rotation and location only                                                        |
| LookAt Weight 1                                   | neck twists when the target is behind                                            | 0.999                                                                                     |
| Shipping a temporary id                           | works in Studio, fails live                                                      | publish under the experience owner                                                        |
| Animator created on a client for a shared rig     | others never see it                                                              | create it on the server                                                                   |

## Handoffs

- **Receives from scenario-roblox-assets:** imported rigs and skinned meshes, including rigged
  characters and motions generated by scenario-3d. Motions arrive as FBX or Blender files and go
  through P10; rigs arrive as Models that P1 inspects.
- **Delivers to scenario-roblox-gameplay:** clips with markers at contact frames and their
  parameters; gameplay owns the hitboxes, state and NPC behavior that call them.
- **Delivers to scenario-roblox-vfx-audio:** marker names and times for footsteps, impacts and
  trails.
- **Works with scenario-roblox-networking:** look direction replication, Server Authority track
  rules, client-only cosmetic layers.
- **Works with scenario-roblox-performance:** Animator counts, NPC culling (anchor and disable
  Animators out of range, RDC 2025 rwLEnBtXr30 00:09:24), `stepAnimation` cost.
- **Works with scenario-roblox-architecture:** where animation controllers live (client modules for
  player characters, server services for NPCs).
- **Asks the user** to publish the listed clips; agents never upload.

## Current Roblox notes

- Avatar Joint Upgrade: R15 avatars spawn with 15 AnimationConstraint joints and 14
  BallSocketConstraints (L1).
- `Workspace.AuthorityMode` is not readable from plugin-level Luau (RobloxScript capability): ask
  the user whether Server Authority is on.
- Character Controller Library is opt-in. With it off, `require("@rbx/AvatarAbilities")` never
  returns on the client and returns a table on the server (L15).
- Adaptive Animation: `HumanoidRigDescription:AutoRig` needs RobloxScript capability; joint mapping
  and T-pose are set in the Adaptive Animation tool (GUI). Mapping joints from code did not retarget
  a clip onto renamed parts (L14).
- `AnimationGraphDefinition` exists; graphs are edited in the Graph Editor (GUI).
- The Animation Editor opens from Avatar > Clip Editor in the current UI.

## References

- [`references/procedures.md`](references/procedures.md): P1 to P15 with full code, test ids and
  results.
- [`references/characters.md`](references/characters.md): Custom skinned import to a rig, player and
  NPC playback scripts, creature foot planting, dynamic head cages and validation, FBX import
  checks, character cost.
- [`references/expert-notes.md`](references/expert-notes.md): principles by expert, with timestamps.
- [`references/critique.md`](references/critique.md): the rubric for judging animation work.
- [`references/gui-paths.md`](references/gui-paths.md): Animation Editor, import, faces and beta
  toggles for a human or computer-use agent.
- [`references/sources.md`](references/sources.md): every source with credentials and timestamps.
- [`scripts/rbx_animation.py`](scripts/rbx_animation.py): kit inlining, Blender wrapper, sample
  loader, Edit pose sheets.
- [`scripts/blender_roblox_anim.py`](scripts/blender_roblox_anim.py): headless Blender test rig,
  audit, FBX export, re-import and samples.
- [`scripts/agentkit/animation/`](scripts/agentkit/animation/): AnimRig, AnimClip, AnimAudit, AnimIK
  and AnimFace Luau modules.
