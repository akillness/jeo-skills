# Expert notes: principles and judgment by source

Distilled from `notes/animation-cinematics/` (15 videos, 6 docs, three digests). Timestamps are
`[hh:mm:ss]` in the video; `[frame hh:mm:ss]` means read from the frames, not the audio. `[added]`
marks this skill's own additions; `observed` marks facts measured on this Mac in Unity 6000.3.21f1
on 2026-09-24 (`tests/code/unity-animation/`).

## Unity 6.3 Manual: Root Motion, Mecanim performance, AnimatorController API

- Root motion is decided per clip and per axis in the import settings. Rotation: Bake Into Pose only
  when start and end orientation match (green light). Y: bake on almost every clip; height-changing
  clips leave it off and use Based Upon **Feet**, so the blend point stays at the lowest foot and
  nothing floats. XZ: bake on idles or tiny deltas accumulate into drift. `Animator.gravityWeight`
  is 1 with Y baked, 0 without, blended across transitions.
- Based Upon: Body Orientation (default, most mocap), Original (keyframed data, authored offsets),
  Offset for strafes where Body Orientation fails. It picks the reference the baked pose keeps; with
  Bake Into Pose on, the axis delta is identity or zero whatever it says, so it never causes drift.
  Drift comes from an unbaked axis.
- [observed] 30 s of one idle segment alone, root motion on: Body Orientation and Original both 0 m
  and 0 deg drift; with Original the pose faced 88 deg away and stood 2.43 m off its GameObject (the
  actor's place in the capture volume); XZ left unbaked drifted 0.246 m. `Animator.gravityWeight`
  read 1 on idle and walk (Y baked), ramped linearly to 0 over the 0.1 s transition into the
  Y-unbaked jump, stayed 0 through it, ramped back to 1 over the 0.25 s exit; with Apply Root Motion
  off it read 0 on every clip.
- [observed] An Avatar Mask set at import (`maskType` CopyFromOther, fingers and hand IK goals off)
  applies through the rules file (`flags.mask`); the Manual's reason is cost: masked parts are not
  sampled.
- A clip curve drives the Float parameter of the same name; a script with `OnAnimatorMove` turns
  Apply Root Motion into "Handled by Script".
- Performance: no controller means no work; layer weight 0 skips the layer; Cull Completely plus
  Update When Offscreen off for invisible characters; hashes not strings; scale curves are expensive
  unless constant; Generic rigs: no Root Node unless root motion is used; Humanoid: mask IK goals
  and fingers you do not need; one unblended clip can be cheaper on the legacy Animation component.
- The whole controller is scriptable: `CreateAnimatorControllerAtPath`, `AddParameter`, `AddLayer`,
  `CreateBlendTreeInController`, `AddStateMachine`, `AddState`, `AddExitTransition`,
  `AddAnyStateTransition`, `AddEntryTransition`, `AddCondition`, `defaultState`; on synced layers
  use the "Effective" methods.
- [added, observed] Cull Completely is right in a game but wrong while an agent samples: with any
  culling mode other than Always Animate, `Animator.Update` in a batch job writes no transform
  (nothing was rendered, so the renderers count as invisible) and captures show the bind pose. The
  sampling jobs force Always Animate and never save it.

## Catherine Proulx (Unity animation team): transition interruptions

- Transitions are uninterruptible by default. Interruption Source Current State + Ordered
  Interruption (on by default): only transitions above the running one on the source state can cut
  in. Next State: the destination's transitions redirect. Same-frame ties always go to list order.
- An interrupted blend starts from a frozen snapshot pose, a deliberate performance choice: keep
  interrupting transitions short [added inference].
- [observed] A four-state probe (A->C, A->B 0.5 s interruptible, A->D; GoB then GoC or GoD at 0.2
  s): None ends in B whatever fires; Current State with Ordered Interruption: GoC (above) interrupts
  to C, GoD (below) is ignored; unordered: GoD interrupts to D; GoC and GoD on the same frame: C
  wins by list order. On the interruption frame the arm bone moved 0.00 deg/s (the snapshot), then
  the new blend ran.
- Judgment: urgent exits (hit, death, dodge) sit above the transitions they must cancel.

## Unity 6.3 Manual: Playables

- Every runtime animation is a PlayableGraph (the Animator, Timeline and the Rig Builder all build
  one). Destroy every graph (Unity logs an error otherwise); an output without a source does
  nothing; playing a parent un-pauses its children; pause then `SetTime` for deterministic
  scrubbing.
- Mixer weights are yours to keep summing to 1.
- [observed] After `DisconnectInput(i)` the empty input reads weight 1 again: set weights after
  disconnecting, not before.

## Ciro Continisio (Unity): Extending Timeline (blog 2018) and Unite Now 2020 (gsEe0_o_934)

- Data (PlayableAsset) separate from logic (PlayableBehaviour); bind the shared target on the track
  (`[TrackBindingType]`, arrives as `playerData`); blending is your code in `CreateTrackMixer`; the
  template pattern makes clip fields keyframeable without an Animator.
- Mixers run at edit time: whatever they write happens while scrubbing [blog, code comment];
  register driven properties (`GatherProperties`) so preview restores them [added].
- Track for a continuous action, marker for an instant [00:18:53]; Signal (emitter, asset, receiver)
  when there is no payload, a custom marker when the event carries data [00:13:13], [00:23:02]. A
  receiver gets every notification routed to it: type-check [frame 00:22:57].
- Reuse gameplay systems from Timeline so fixes propagate to cutscenes [00:30:49]; preview
  Play-mode-only systems with a labeled approximation [00:28:33]; a rewind clip loops open-ended
  battles inside a linear Timeline [00:31:19]; nested Timelines through Control Tracks and Initial
  Time to start anywhere [00:35:22], [00:41:12]; spawned objects created in `OnGraphStart`,
  destroyed when preview ends [00:45:30].
- [observed] Markers and Signals fire only on Playback evaluations (Play mode, or the Timeline
  window playing): a manual `PlayableGraph.Evaluate(dt)` scrub sends none. Clip root offsets are
  relative to the track: without matching offsets the character snapped back 7.2 m when the next
  clip began. A PlayableAsset or MonoBehaviour in a file named differently loses its script on
  reload and the track plays nothing.

## Cinemachine 3.1 manual (upgrade, Brain, State-Driven)

- CM3 is a data and API migration: back up; fix `using Unity.Cinemachine`, renamed types and `m_`
  fields; retype references to `CinemachineVirtualCameraBase`; run the Upgrader with Upgrade Entire
  Project (single object loses script references, animation tracks and Timeline bindings; no Undo);
  switch split-screen layers to Channels; enable Lens Mode Override with a default mode; delete
  leftover "cm" objects; define `CINEMACHINE_NO_CM2_SUPPORT`.
- Brain: Smart Update + Late Update blends (Fixed only for Fixed cameras that judder); Camera Cut
  Event resets temporal effects; priority chooses among activated cameras; Timeline overrides
  priority.
- State-Driven: a state shorter than Wait never activates its camera; Min holds a camera after the
  state changed; Standby Update Never breaks shot evaluation.
- [observed] A `Priority` written from an editor script is read in the camera's own `Update()`,
  which does not run in a batch job: call `Prioritize()` or the Brain keeps the old camera.
- [observed] Timeline overrides priority, in real Play mode: a camera raised to priority 100 stayed
  off for the whole 20 s cutscene (live cameras were the shots) and went live once the director
  stopped. In an edit-mode scrub the Brain kept the last shot camera live for 40 frames after
  `director.Stop()`: test handbacks in Play mode.

## Animation Rigging 1.3 manual (1.4.1 installed)

- Animator, Rig Builder on the same GameObject, one Rig per control rig on its own Rig Layer,
  constraints under it; solve order is depth-first hierarchy order; the rig lives beside the
  skeleton root; RigTransform on moved handles no constraint references.
- [observed] Evaluated alone in edit mode, the rig graph post-processes a default humanoid pose
  (hips at the root, body sunk to the waist): evaluate it in one graph with the Animator Controller
  (`RigBuilder.Build(graph)`).

## Nicky Boccuzzi (iHeartGameDev): layers (W0eRZGS6dhQ), retargeting (BEZHVYk6Fa4), 2D trees (_J8RPIaO2Lc)

- A layer without a mask replaces the whole body [00:05:33]; creating the mask is not enough, assign
  it [00:06:22]; lower layers win [00:05:04]; additive stops at the first Override [00:09:46];
  additive clips are deltas from a reference pose and break over a different base pose [00:09:57]; a
  two-key additive clip plus layer weight replaces a 30-frame clip [00:11:22]; Sync for variants
  driven by one weight (health) [00:12:46]; IK Pass enables `OnAnimatorIK` [00:14:47].
- Retargeting is the Avatar, not renamed bones [00:04:14]; duplicate clips after the Humanoid
  switch, not before [00:12:03]; without-skin clips use Copy From Other of the same character
  [00:12:54]; Optimize Game Objects late [00:07:22]; muscle limits fix big-armed characters
  [00:10:36].
- [observed] The duplicate trap, reproduced: the JumpDown take duplicated from a Generic import
  holds 259 Transform (bone-path) curves and moved the Humanoid lab character 0.0 deg; the same take
  duplicated from the Humanoid import holds 130 muscle curves and moved it 40.1 deg.
  `AnimImport.AuditClips` and the controller audit flag the first.
- Mixamo clips for script-driven trees: FBX for Unity, 30 fps, keyframe reduction none, Without
  Skin, In Place [00:01:24].
- 2D tree type by motion set: Simple Directional one motion per direction (drops walk/run on one
  axis, warns at 180 deg), Freeform Directional for walk and run per direction, Freeform Cartesian
  for axes that are not directions (angular vs linear speed), Direct for independent weights
  [00:06:46] to [00:09:46]; coordinates are gameplay units [00:16:30]; clamp parameters to the
  children's extents [frame 00:13:38]; a renamed parameter fails as "Hash N does not exist" [frame
  00:10:30].

## Ketra Games: root motion with a CharacterController (mNxEetKzc04)

- One system owns displacement: `OnAnimatorMove` ->
  `v = animator.deltaPosition; v.y = ySpeed * Time.deltaTime; controller.Move(v)` [00:07:21],
  [00:07:59].
- Idle bakes all three root axes, Based Upon Original; walk and run bake rotation and Y [00:02:31],
  [00:04:47]; idle out of the tree, slow walk at the low end, IsMoving without exit time [00:08:54].
- Root-motion downloads: In Place off, Character Arm Space raised so the arms clear the body,
  Without Skin on the same character [00:02:31] to [00:03:38].
- Claims root motion needs Humanoid [00:00:51]: contradicted by the 6.3 Manual (Generic root motion
  through the Root Node, at extra cost).
- [observed] Script speed equal to the measured clip speed was as clean as root motion on a straight
  walk (slide p50 0.18 vs 0.19 m/s); the difference shows once speed varies or turns.

## Adam Myhre (git-amend): import postprocessor (V9_Z6hUOG_8), Playables (fQzKJO-0dS8), CM3.1 (4xd37R1spKw)

- Golden reference FBX, `OnPreprocessModel` before `OnPreprocessAnimation`, copy the reference's
  human description, fall back to Generic if the reference is missing, rename "mixamo.com" clips to
  the file name, Translation DoF is off by default [00:02:21] to [00:14:09]. Avoid the internal
  `ModelImporterEditor` reflection and forced reimports inside callbacks; bump `GetVersion()` and
  declare dependencies on the rules and the reference so edits reimport [added].
- [added, from the blind grade of a generalist answer] Two processor bugs that look right: loop and
  bake flags chosen by `clip.name.Contains("Idle")` when every Mixamo take is named "mixamo.com"
  (all clips get the same flags), and an `OnPreprocessAnimation` with no folder guard (every FBX in
  the project). `ua.scan_csharp` flags both, plus reimports inside callbacks.
- Playables: top mixer (locomotion, one-shot), complementary weights, blend = clamp(10 %, 0.1 s,
  half the clip), guard/interrupt/destroy discipline, disable the Animator's own controller when a
  controller runs inside your graph [00:06:26] to [00:13:25].
- CM3: cameras are component sets; `[SaveDuringPlay]` on your own scripts; global events on
  `CinemachineCore` filtered by `IncomingCamera`; custom auto dolly through
  `SplineAutoDolly.ISplineAutoDolly`; the single-object upgrade breaks typed references on screen
  [00:07:18].

## Hugo Cardoso (Code Monkey): weapon aiming (luBBz5oeR4Q); Asbjørn Thirslund (Brackeys): Animation Rigging (Htl7ysv10Qs)

- Spine aim above hand aim, body weight about 0.7 [00:06:20], [00:06:53]; axes are rig-specific
  (read in Local mode, or by dot products [added]); off-hand Two Bone IK target and hint under the
  weapon hand [00:08:33]; lerp `Rig.weight` on aim start and stop [00:11:46].
- Brackeys: one Rig per body region; head limits -100..100 and fade behind [00:06:58]; move targets,
  never reassign them at runtime (job data) [00:13:41]. His head-above-chest example is the order
  Code Monkey shows failing: follow body first (measured 0.0 vs 17.9 deg).

## Lost Relic Games: code-driven Animator (nBkiSJ5z-hE)

- For sprite flipbooks: states without transitions, one guarded `ChangeAnimationState`, name
  constants, priority by guards [00:04:18], [00:14:04]. `GetCurrentAnimatorStateInfo` read on the
  frame of `Play` still describes the previous state [frame 00:16:17]. For skeletal characters the
  same pattern needs `CrossFadeInFixedTime` [added].

## t3ssel8r: second-order dynamics (KPoeNZZ6H4s)

- f, zeta, r instead of raw coefficients; SmoothDamp is zeta 1; semi-implicit Euler; stable only
  while T < sqrt(4 k2 + k1^2) - k1: sub-step or clamp k2 [00:12:29]. Smaller f on the head gives
  free secondary motion [00:06:33]. [observed] C# and Python implementations agree to 1e-5 (peak
  1.14222 at zeta 0.5; anticipation dip -0.557 at r -2).

## Unity official Cinemachine 3.1 series: camera types (XTVzs4B1d7I), player cameras (u0a1F6BlczE)

- Any procedural Position Control overrides animation and scripts [00:03:10]; no procedural camera
  parented to a moving object (exception: Position None under a Spline Cart) [00:03:42]; some
  damping, never zero by default [00:05:19]; equal priority: the last activated wins [00:11:30];
  custom blends asset, blend hints (Ignore Target, Cylindrical Position) [00:13:32]; Sequencer for
  simple sequences, Timeline for complex cutscenes [00:16:31]; State-Driven Min against thrash
  [00:18:04].
- [observed] Blend hints on two fixed cameras 10 m apart on opposite sides of the hero (1 s
  EaseInOut): no hint, the camera lerped to 0.5 m above the head and looked straight down (up dot
  0.0); CylindricalPosition orbited at 5.02 m (up dot 0.995); IgnoreTarget alone stopped the flip
  (0.995) but still passed 0.5 m from the target.
- Rig by game: Third Person Follow (shoulder, first person, reticle; rotation by your controller),
  FreeLook (orbit; Cinemachine rotates), Position Composer + Pan Tilt, Overhead [00:02:07];
  occlusion: Third Person Follow avoidance with Ignore Tag, Deoccluder with Transparent Layers,
  Decollider for RTS, ClearShot with shot quality [00:10:45] to [00:18:01]; RTS: move an empty
  target, Position Composer 20, Pan Tilt tilt 40, Decollider 4 [00:16:55].
- Obstacles are only non-trigger colliders [00:11:18]; Transparent Layers for windows [00:12:26];
  damping into collisions trades smoothness for clipping [00:11:18].
- [observed, and read in the 3.1.7 package source] Deoccluder raycasts use Collide Against minus
  Transparent Layers and ignore triggers; its camera-radius check uses Collide Against alone, so
  glass in both is seen through yet never entered. Follow camera at z -4.5 behind the hero, 0.2 m
  wall at z -2: solid wall pulled it to z -1.80; the same wall on a Transparent layer, or as a
  trigger, left it at -4.5; the Transparent-layer wall with Transparent Layers empty pulled it in.
  Without a Deoccluder the linecast camera to target was blocked on every frame.
