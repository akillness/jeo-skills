# GUI paths (for a computer-use agent or a human)

The same work as `procedures.md`, done in the editor windows. Menu names are Unity 6.3 with
Cinemachine 3.1, Animation Rigging 1.4 and Timeline 1.8; entries marked [verify] come from the
sources and were not clicked on this machine (the live tests drive the APIs, not the windows). Save
what you change: File > Save (scene), File > Save Project (assets).

## Packages

- Window > Package Management > Package Manager > Unity Registry: Cinemachine (choose 3.1.x, not
  2.10.x), Animation Rigging, Timeline. Samples tab: Cinemachine samples (one scene per camera
  type), Timeline Customization Samples, Animation Rigging samples [verify tab names].
- Scripted equivalent: `AnimPackages.Add` or `ut_animation.pin_manifest`.

## Mixamo (website, no API)

- Character: select or upload it, Download, Format FBX for Unity, Pose T-pose, With Skin.
- Each clip, ON THE SAME character: Format FBX for Unity, Skin Without Skin, Frames per Second 30,
  Keyframe Reduction none. Root motion (player): In Place unticked, Character Arm Space raised until
  the hands clear the hips. Script-driven trees: In Place ticked [verify labels: the site changes].
- Every take arrives named "mixamo.com": name the FILE after the move; the import rules rename the
  clip to the file name.

## Model import (Inspector of a selected FBX)

- Rig tab: Animation Type (None, Legacy, Generic, Humanoid); Avatar Definition (Create From This
  Model, Copy From Other Avatar + Source); Skin Weights; Optimize Game Objects (+ Extra Transforms
  to Expose); Configure... opens the Avatar window: Mapping (Clear, Automap, Load, Save), Pose
  (Reset, Sample Bind Pose, Enforce T-Pose), Muscles & Settings (Translation DoF), Apply, Done.
- Animation tab: clip list (+ to split a take, Start and End frames); Loop Time, Loop Pose (green
  light = loop match); Root Transform Rotation / Position (Y) / Position (XZ): Bake Into Pose, Based
  Upon (Original, Body Orientation, Center of Mass, Feet), Offset; Mirror; Curves (+ adds a curve
  that drives a Float parameter of the same name); Events; Mask (Definition: Copy From Other +
  Source = an Avatar Mask asset with fingers and IK goals off, or Create From This Model and click
  the Humanoid silhouette); Additive Reference Pose. Apply. Based Upon only chooses where the baked
  pose sits (preview: the character should face and stand on the origin); Bake Into Pose is what
  stops drift.
- The import log (red icon at the top of the importer when a rig error happened) is where "Copied
  Avatar Rig Configuration mis-match" appears.

## Animator Controller

- Project window > Create > Animation > Animator Controller; Create > Animation > Avatar Mask
  (Humanoid silhouette: click parts to exclude; Transform: Import Skeleton for extra bones) [verify
  nesting].
- Window > Animation > Animator: Parameters tab (+ Float, Int, Bool, Trigger), Layers tab (+, gear:
  Weight, Mask, Blending Override/Additive, Sync + Source Layer, Timing, IK Pass). Right-click the
  grid: Create State > Empty / From New Blend Tree; Make Transition; Set as Layer Default State.
- Transition Inspector: Has Exit Time, Exit Time, Fixed Duration, Transition Duration, Transition
  Offset, Interruption Source, Ordered Interruption, Conditions. Priority = order of the Transitions
  list in the source state's Inspector (drag to reorder). To see an interruption: Play mode,
  Animator window open on the character, fire the second trigger from the Parameters tab while the
  first transition's progress bar runs.
- Blend tree (double-click the state): Blend Type (1D, 2D Simple Directional, 2D Freeform
  Directional, 2D Freeform Cartesian, Direct), Parameters, Motion list (Pos X, Pos Y, Time Scale,
  Mirror), Compute Positions (Velocity XZ, Speed and Angular Speed...), the graph with the red dot
  to preview. The inspector warnings ("directions less than 180 degrees apart", "positions are too
  close") are what `AnimControllerBuilder.Audit` reproduces.
- Animator component: Controller, Avatar, Apply Root Motion ("Handled by Script" when OnAnimatorMove
  exists), Update Mode, Culling Mode.

## Animation Rigging

- Select the character root: Animation Rigging > Rig Setup (adds Rig Builder and a child Rig),
  Animation Rigging > Bone Renderer Setup; Animation Rigging > Align Transform (target onto a bone)
  [verify 1.4 menu names].
- Add Component > Animation Rigging > Multi-Aim Constraint / Two Bone IK Constraint (context menu:
  Auto Setup from Tip Transform). Rig Builder > Rig Layers list (order and active toggles). Scene
  view overlay for effectors (gizmos are Scene-view only).
- Solve order: drag constraint GameObjects in the Hierarchy (body above head and hand).

## Cinemachine 3

- GameObject > Cinemachine > Cinemachine Camera, Follow Camera, FreeLook Camera, Third Person Aim
  Camera, Dolly Camera with Spline, Dolly Cart with Spline, ClearShot Camera, State-Driven Camera,
  Sequencer Camera, Mixing Camera (select the target first: it becomes the Tracking Target).
- CinemachineCamera Inspector: Solo, Priority, Output Channel, Standby Update, Blend Hint (set the
  same hint on both cameras of a flipping pair: Cylindrical Position for cameras around the target),
  Lens, Tracking Target, Position Control / Rotation Control / Noise dropdowns, Add Extension
  (Deoccluder, Decollider, Confiner 2D/3D, FreeLook Modifier), Save During Play, Game View Guides.
- Cinemachine Deoccluder (extension): Collide Against, Ignore Tag (the player's tag), Transparent
  Layers (glass: keep it in Collide Against too), Minimum Distance From Target, Avoid Obstacles
  (Distance Limit, Minimum Occlusion Time, Camera Radius, Strategy Pull Camera Forward / Preserve
  Camera Height / Preserve Camera Distance, Maximum Effort, Smoothing Time, Damping, Damping When
  Occluded), Shot Quality Evaluation. Layers: Edit > Project Settings > Tags and Layers (add a Glass
  layer).
- Main Camera > Cinemachine Brain: Update Method, Blend Update Method, Default Blend, Custom Blends
  (Create Asset), Channel Mask, Lens Mode Override, Camera Cut Event.
- CM2 upgrade: the Upgrade button on a CinemachineVirtualCamera or FreeLook Inspector > Upgrade
  Entire Project (after retyping script references to `CinemachineVirtualCameraBase`; back up first,
  no Undo).
- Edit > Preferences > Cinemachine (global Save During Play, icons) [verify].

## Timeline

- Window > Sequencing > Timeline; select a GameObject and Create (adds a PlayableDirector and a
  .playable asset). Assets > Create > Timeline > Timeline / Signal [verify].
- Track header + (or right-click): Animation Track, Activation Track, Audio Track, Control Track,
  Signal Track, Playable Track, Cinemachine Track, custom tracks below the separator. Drag the bound
  object onto the track slot.
- Clip context menu: Match Offsets To Previous Clip (the scripted twin is
  `AnimTimeline.MatchOffsets`), Editing > Ease; overlap two clips to blend. Record button on a track
  for keyframing custom clip fields (template pattern).
- Markers: right-click the marker area above the tracks > Add Signal Emitter or a custom marker;
  Signal Receiver component on the bound object: Add Reaction.
- PlayableDirector: Playable, Update Method, Play On Awake, Wrap Mode (None, Hold, Loop), Initial
  Time.
- While a Timeline with a Cinemachine Track plays, the Brain's live camera comes from the track,
  whatever the priorities; Brain > Show Debug Text displays it. Check the handback to gameplay in
  Play mode: scrubbing in the Timeline window leaves the last shot live (observed through the API).

## Play mode settings touched by the jobs

- Edit > Project Settings > Editor > Enter Play Mode Settings ("When entering Play Mode": Reload
  Domain and Scene, Reload Scene only, ...). `AnimPlayMode.Run` switches to no domain reload for one
  run and restores it.
