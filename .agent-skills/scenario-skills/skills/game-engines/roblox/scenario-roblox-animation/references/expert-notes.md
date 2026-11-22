# Expert notes: animation and characters

Principles and judgment by source, with timestamps. Claims marked [added] are this skill's own,
checked in Studio 0.743 (test ids refer to `references/procedures.md`). Full source list:
`references/sources.md`.

## Suphi Kaner: IKControl and look replication (8fV-XOOj6O4)

- Treat the rig as a tree of joints. IKControl solves the chain from `ChainRoot` to `EndEffector`
  and rotates only those joints [00:02:21 to 00:05:48].
- Create IKControls from a server Script so every client gets them [00:18:56]. L9 confirms: a
  server-created IKControl acts on the client too.
- Keep IKControls disabled until needed, for example enable the hand IKs on `Humanoid.Seated`
  [00:18:56].
- `Pole` and `EndEffectorOffset` are hidden in the Properties window: set them from code [00:09:49].
- `IKControl.Priority` orders the solves: a higher priority solves later and wins. Give hands on a
  prop a higher priority than torso or head IKs [00:54:40].
- Head look-at: `Weight = 0.999`, not 1, so the neck gives up gracefully when the target passes
  behind [00:53:00].
- Replicate look direction cheaply: send only past an angle threshold and a minimum interval, plus
  one trailing send. The server stores a Player attribute; each client drives a local invisible
  target. About 1.8 KB/s drops to about 0.4 KB/s [00:28:44 to 00:52:26].
- His 2023 bugs (head floating, neck crash on death) may be fixed; re-test before working around
  them.

## Suphi Kaner: Motor6D.Transform (BRYp2-rdpXQ)

- `Transform` is applied in a deferred batch after PreSimulation, unlike C0 and C1, which apply at
  once [00:00:33]. The Motor6D reference confirms it.
- `Transform` does not replicate, so each side can show its own pose: tween on the client, snap on
  the server [00:02:12].
- Mass part motion through `Transform` was 2 to 3 ms cheaper than `BulkMoveTo` in his many-part test
  [00:17:21].
- [added] On R15 avatars in this build the joints are `AnimationConstraint`; its `C0` and `C1` are
  read-only (L1, L8). Procedural layers multiply into `Transform` in PreSimulation; a 45 degree neck
  layer held at 41.9 degrees on top of the playing tracks (L8).

## Suphi Kaner: client-side NPCs (JyMxrcqEzu8)

- The server decides where an NPC goes (an attribute); each client spawns, animates and pathfinds
  its own copy [00:07:20 to 00:19:02].
- Create the `Animator` under the client-made Humanoid and load through it [00:19:02].

## Mykaiju: Blender to Roblox skinned rig animation (NI7GXKLwk6U)

- Animate at 24 fps for in-game clips. The import keeps one key per frame, so 60 fps imports more
  than twice the keys [00:03:58 to 00:06:46].
- Roblox ignores animated scale: never key scale [00:08:42].
- Export only the armature for animation clips [00:23:45].
- FBX panel on screen: Object Types Armature, Scale 1.00, Apply Scalings All Local, Forward -Z, Up
  Y, Apply Unit on, Use Space Transform on, Apply Transform off, Key All Bones on, NLA Strips off,
  All Actions off, Force Start/End Keying on, Sampling Rate 1.00 [00:24:30, 00:25:51].
- Simplify 0, or IK-planted feet drift; Add Leaf Bones off. Both are spoken only [00:23:45 to
  00:27:07].
- Keep a base pose action at frame 0, copy the first key to the last frame so loops close, and give
  every action a Fake User [00:06:57, 00:07:20, 00:09:49].
- Foot shake after import means the scale round trip is off: copy Studio's scale number back to
  Blender and re-export [00:32:38].
- A rig floats after rescaling when the root bone origin is wrong: put it at the hips or below the
  lower bounding box; set HipHeight on playable rigs [00:34:54].
- After the first import Studio adds a `RBX_MICROBONE_NODES` folder to Workspace [00:29:02].
  AnimAudit reports it.
- A Custom skinned import ends as a Model whose root is `RootPart` (Part, Size 2, 2, 1) holding the
  bones, beside an `AnimationController` [00:35:47]. `AnimRig.prepareImport` wraps it in a
  `HumanoidRootPart` collider.
- Import the clip onto the selected rig, not the FBX's own model, which can ruin the model
  [00:30:00]; an All Actions export imports only the first action [00:25:26]; resetting the scale
  from Studio's dropdown broke his imports [00:27:28].
- Pass or fail without code: at 24 fps a 42-frame clip reads 1:18 and a 100-frame clip 4:04 in the
  Animation Editor [00:29:10, 00:30:43].
- [added] `blender_roblox_anim.py export` reproduces these settings headless. A re-import of its FBX
  has 10 bones, no `_end` leaf bones and 25 frames; the Blender default adds leaf bones (O4).

## Nisky: Blender animation for Roblox (EM9u4gIHoRg)

- Animate at 24 fps; 60 looks computer-made for character animation [00:07:55].
- Import fails mostly because HumanoidRootPart is not anchored; his add-on warns about it
  [00:28:32].
- Duplicate rigs with Duplicate Collection, not copy and paste; auto-key records even in Object Mode
  [00:20:37, 00:24:16].
- Offset limbs along the kinetic chain by 2 to 3 frames to remove the robotic column look
  [00:13:11].
- A Stepped interpolation modifier on every F-curve gives a stop-motion look [00:17:50].

## Tycoon: hand animation habits (Yzf3iGZis7A)

- Keyframe offsetting: stagger limbs by a few frames along the chain [00:42:10].
- Easing: Quad In-Out by default; Back In-Out for anticipation and overshoot; Bounce and Elastic
  only on Out; strong exponential easings look robotic [00:29:22 to 00:37:00].
- Animated objects must keep their parents after setup, or the plugin's tracks break [00:06:54].
- Deciding condition with Nisky on frame rate: Moon Animator works at 60 fps for film; gameplay
  clips export at 24.

## BrawlDev: tracks and cameras (zSK7bOoxuig, FhCNvyuZ-mE)

- "My animation does nothing" is usually priority or rig type: default animations play at Core and
  Idle, so a custom clip needs Action or a deliberate priority [00:16:11].
- Use markers and `GetMarkerReachedSignal`, not `KeyframeReached` [00:25:25].
- His AdjustSpeed advice is outdated: the `speed` argument of `Play` sets the speed. L6:
  `AdjustSpeed(0.5)` before `Play(0.1, 1, 2)` gave Speed 2.
- `Humanoid:LoadAnimation` in his code is deprecated; load through the Animator.
- Cutscene cameras: set `CameraType = Scriptable` before writing `CFrame`, or the camera scripts
  override it [00:08:34].

## Develuper: animation events (d5GGIJJyMpg)

- Never time hits with `task.wait`; put an event on the impact frame [00:00:16].
- One event name with a parameter (`impact` with `heavy`) beats many event names [00:02:52].
- Debris belongs in a collision group that hits the world but not characters [00:05:01].
- [added] Markers fire within about one frame of their time at 60 Hz (L6: 266 ms for a 250 ms marker
  at speed 2), and they also fire in Edit stepping (L2).

## Roox4: procedural IK legs (DPpAsjUr278)

- Procedural walking is four steps: model, Motor6D rig, one IKControl per leg, raycast stepping
  [00:00:00].
- Each leg needs a Pole attachment; an AlignOrientation on the root tilts the body on slopes
  [00:04:21, 00:05:50].
- Procedurally driven parts go in their own folder with CanCollide off [00:00:15].
- His model has a part named HumanoidRootPart as PrimaryPart and a Humanoid with an Animator and
  HipHeight [00:00:15]; one IKControl per leg under the Humanoid with EndEffector the last leg part,
  Target a part in `IKTargets` (CanCollide, CanTouch, CanQuery off, Massless) and ChainRoot the
  first leg part [00:02:44]; raycast parts welded above each leg measure the step [00:03:49].
- [added] His stepping module is closed. `AnimIK.planSteps` (diagonal pairs, stride threshold) and
  `AnimIK.stepArc` replace it (characters.md, section 3).

## Roblox Tech Talks EP34: the new movement stack (w374VDNnido)

Speakers: Oren Jacob (senior director, engineering) and Vincent Petrella (manager, avatar motion).

- Humanoid plus the Animate script is a single-state locomotion machine; the new stack (animation
  graphs, Character Controller Library) is a superset, not a replacement [00:10:31, 00:17:44].
- Abilities run concurrently, so running, aiming and reloading coexist [00:21:11].
- A graph can replace another that implements the same parameters (movement state, speed, look
  direction) [00:24:05].
- Store motion as intent (hold a gun), not joint angles, so it survives other bodies [00:29:25].
- Treat all of it as beta in this build: `AnimationGraphDefinition` exists (L14), and the CCL is
  opt-in (L15).

## Roblox docs: Use Animations, IKControl, CCL, skinning, dynamic heads

- Humanoid rigs need an `Animator` under the Humanoid; other rigs need `AnimationController` with an
  `Animator` (Use Animations).
- Replace defaults on `CharacterAppearanceLoaded`: stop playing tracks with `Stop(0)`, then set
  `Animate.<state>.<Animation>.AnimationId` (Use Animations). L11 confirms the client picks up a
  server-side value change within 1 s.
- Idle variants are chosen with probability weight / sum of weights (Use Animations).
- IKControl needs `Type`, `EndEffector`, `Target` and `ChainRoot`; `ChainRoot` sets how much of the
  chain moves (IKControl).
- IK constraint attachments must match the joint's parts and C0/C1, under the same Model; wrist
  BallSocket `UpperAngle` 80 (IKControl).
- At most 4 bone influences per vertex; influence on `Root` or `HumanoidRootNode` is dropped on
  import (Skin a Humanoid Model).
- Bones affect rendering only, not collision (Rigging).
- A dynamic head has 15 cages and 19 attachments; never change standard cage vertex counts (Dynamic
  Heads).
- CCL callbacks never yield, stay deterministic and never `Destroy`; input never goes in
  `StartsWhen` or `RunsWhile`; ability data lives in `abilityCtx.State` or `.Local` (Character
  Controller Library).

## Roblox docs: Server Authority techniques

- Never cache AnimationTracks under Server Authority: each tick,
  `animator:GetTrackByAnimationId(id)` and load only when it returns nil. Rollback makes cached
  tracks stale.
- At most 8 active animation tracks per Animator under Server Authority (version deltas, DevForum
  4727993).

## Roblox Learn: head validation and Auto Setup (OwhkWzSBnf0, Hp9pr2FpZa8)

- Validation projects landmarks through the head cage and checks five animations: left eye closed,
  right eye closed, mouth open, happy, sad, driven by 17 FACS poses [00:01:39, 00:04:16].
- Auto Setup fails "not dynamic enough" without a mouth bag and enough head vertices; A or T pose
  with limbs apart works best [00:03:38, 00:06:49].
- Auto Setup runs Marketplace validation; fix errors in the source and rerun [00:05:14].

## Jezixa: dynamic head from Blender (apZsJqsKdw4)

- Model the head in neutral pose: frame 0 does not override the rest pose in game [00:12:53].
- Face bones use rotation and location only, never scale [00:13:25].
- Join head meshes before UV; at most 4,000 triangles [00:06:30].
- Most validation failures come from the cage; rebuilding from a working cage is legitimate
  [00:14:06, 00:17:38].

## DatBoiEle: custom character as StarterCharacter (V0AtCS4wmig)

- Mixamo clips are downloaded in place, without root motion [00:01:09].
- He deletes the importer's `AnimationController` and `InitialPoses`, adds a Humanoid with an
  Animator and a `HumanoidRootPart` centered on the torso, welded to the mesh [00:05:26 to
  00:07:53].
- The model named `StarterCharacter` goes in StarterPlayer, with an `Animate` copy holding his ids
  [00:11:53 to 00:13:30]; HipHeight is raised until the feet touch the floor and is lost if changed
  during Play [00:13:30 to 00:14:43].
- [added] He sets the HumanoidRootPart's CanCollide off; this skill keeps it on and sizes it to the
  body, because bones never collide (Rigging docs).

## Performance sources on characters (VDO_amtWfDw, OCUZKJJR-TE, YWyJHwynM1M)

- Humanoids are heavy (animation, physics, memory, bandwidth) [VDO_amtWfDw 00:04:29]; watch the
  `updateInvalidatedFastClusters` tag for avatar and NPC density [00:06:07].
- A static NPC needs only an AnimationController with an Animator [OCUZKJJR-TE 00:07:29].
- Static NPCs get `EvaluateStateMachine` off and moving NPCs get unused HumanoidStateTypes disabled
  [YWyJHwynM1M 00:26:38]; keep `ClientAnimatorThrottling` on [00:32:00]; occlusion culling does not
  cull NPC characters [00:17:49]; per-frame movers go through one `BulkMoveTo` [00:27:51, 00:31:13].
- Improve performance docs: skinned MeshParts moving in a Model without a Humanoid force FastCluster
  rebuilds, and a Humanoid in the Model forces one cluster at a memory cost; size and scale changes
  rebuild FastClusters; play NPC animations on the client for crowds; pool NPCs.

## Peter McNeill, RDC 2025 (rwLEnBtXr30)

- NPC animation posing physics parts on the server can dominate server CPU. Radius-culling zombies
  (anchor them and disable their Animators outside combat range) halved server CPU in Dead Rails
  [00:09:24].

## Live findings that change the experts' advice [added]

- A face write, or a finished tween, on a player's dynamic head reverts to 0 within 0.5 s, even with
  every track stopped (L10, L16). The baseline approach (tween `FaceControls` per expression) fails;
  play a face clip or write every PreSimulation.
- A code-built KeyframeSequence needs Weight 0 on the parent Poses that are only on the path. With
  the default Weight 1 those parents override lower-priority tracks (L4: waist 0 instead of 30).
- A track loaded from a freshly registered id reports Length 0 and does not move until the clip has
  loaded (L2). Wait for `Length > 0`.
- Equal-priority tracks blend as a weighted mean, not by start order: two Action tracks at 90 and 60
  degrees gave 75 at equal weights and 84 at weights 1 and 0.25 (L4).
- `HumanoidRigDescription` joint mapping does not retarget a regular clip onto renamed parts: the
  renamed arm stayed at 0 (L14). Poses bind by part name.
- A pose binds by its name under the pose of its joint's Part0 or its parent bone; the path may
  start below the rig's root. A clip authored on a Custom import's raw rig (`RootPart` at its top)
  still plays after `AnimRig.prepareImport` wraps that root; a pose alone at the top of the clip, or
  under another name, stays at 0 (L17).
