# GUI paths: scenario-maya-rigging

Load when driving Maya's interface (a computer-use agent, or explaining a step to a human) instead
of, or next to, the scripted procedures. Menu names come from the Maya 2027 Help and the expert
videos (Maya 2020 to 2022 on screen); items marked [verify] may have moved. Menu set: Rigging (F3)
unless stated. macOS: the Help's Ctrl is Control and Alt is Option (version deltas). P numbers point
to `procedures.md`.

## Hotkeys used by the experts

| Key                     | Action                                               |
| ----------------------- | ---------------------------------------------------- |
| F3                      | Rigging menu set                                     |
| Ctrl+Space              | hide or show the UI (antCGi)                         |
| X / V / J (hold)        | snap to grid / point / rotate snap (15 deg steps)    |
| Insert (or D)           | move the pivot or a joint without its children       |
| G                       | repeat the last tool (Joint Tool again)              |
| P                       | parent (child first, parent last)                    |
| Ctrl+D, Ctrl+G          | duplicate, group                                     |
| H, Shift+H              | hide, show last hidden                               |
| Down / Up arrow         | pickwalk down / up (controller tags define the walk) |
| Ctrl+Shift+RMB          | gimbal manipulator option, symmetry marking menu     |
| Shift+RMB (object mode) | soften/harden edges, combine (model fixes)           |

## P1 Model intake

- Windows > Settings/Preferences > Preferences > Settings > Working Units: centimeter.
- Display > Grid options: lines every 100, subdivisions 1 (read heights in meters) (antCGi
  e74KphYwMww [00:03:24]).
- Modify > Freeze Transformations (reset options); Modify > Center Pivot; Edit > Delete by Type >
  History.
- Mesh > Transfer Attributes (UV Sets All, Sample Space World) to restore UVs after relaxing.

## P2 and P3 Skeleton

- Skeleton > Create Joints (options: Orientation, Secondary Axis World Orientation, Snap to
  Projected Center, Symmetry). Joints on edge loops, one click each; Insert to adjust; Enter to
  finish.
- Display > Transform Display > Local Rotation Axes (select root, Select > Hierarchy first).
- Skeleton > Orient Joint (options: Orient Joint to World, Primary Axis with negative option,
  Secondary Axis, Secondary Axis World Orientation, Auto orient secondary axis (2025), Orient
  children, Reorient the local scale axes; LRA buttons Toggle, Modify, Freeze). Freeze rotations
  first or it does nothing. Secondary Axis World Orientation must lie across the bones it orients:
  +Y suits a T-pose arm, not a leg or spine (use +Z) nor forward toes (antCGi FN05iGspldI
  [00:06:44]); orient legs and toes in separate passes.
- Manual LRA: Select by Component Type, right-click the "?" icon > Local Rotation Axes, rotate (E);
  then MEL `joint -e -zso;`.
- Skeleton > Mirror Joints (Mirror Across YZ, Mirror Function Behavior or Orientation, Search For
  `_l` Replace With `_r`).
- Skeleton > Set Preferred Angle (on the root); Skeleton > Assume Preferred Angle; Skeleton >
  Reroot.
- Joint labels: Attribute Editor > Joint > Joint Labeling (Side, Type, Other Type) or Skeleton >
  Joint Labeling [verify menu].
- Rotate order: Attribute Editor > Transform Attributes > Rotate Order (Channel Box shows it when
  set to show).
- Constrain > Point (Maintain Offset off) to put a joint at a midpoint, then delete the constraint;
  Modify > Match Transformations (mover first, target last).

## P5 Controls

- Create > NURBS Primitives > Circle (untick Interactive Creation), Create > Curve Tools > EP / CV
  Curve Tool for shapes.
- Attribute Editor > Transform Attributes > Transform Offset Parent Matrix: Composition and Matrix
  tabs; right-click a field for Identity, Invert, Locked. "Move values down": copy the TRS into the
  Composition tab, zero the channels (antCGi yls25bV-IZU [00:09:34]). Node Editor drives: `.matrix`
  into Offset Parent Matrix for a relative drive; `worldMatrix` only when the driven node's parent
  never moves, otherwise through a multMatrix with the parent's `worldInverseMatrix`; then zero
  translate, rotate and Joint Orient (MLC JOYMV-bQdlM [00:09:15] [00:10:27]).
- Attribute Editor > Object Display > Drawing Overrides: Enable Overrides, RGB, color.
- Control > Tag as Controller; Control > Parent Controller (child first, parent last); Display >
  Show > Controllers (Viewport 2.0 filter).
- Channel Box: select channels, right-click > Lock and Hide Selected; Windows > General Editors >
  Channel Control for hidden channels.
- Modify > Edit Attribute: min and max (footRoll -40..80).
- Windows > Node Editor (Tab to create nodes; Input and Output connections buttons); Windows >
  General Editors > Connection Editor (Show Non-Keyable off).

## P6 and P7 IK and IK/FK

- Skeleton > Create IK Handle (options: Current solver Rotate Plane or Single Chain). Spring solver
  missing: MEL `ikSpringSolver` in the Script Editor (antCGi yls25bV-IZU [00:13:28]).
- Constrain > Pole Vector (control first, handle last); Constrain > Orient (control, then joint).
- IK/FK blend on a handle: the handle's Ik Blend attribute; Key > IK/FK Keys > Set IK/FK Key;
  Enable/Disable IK Solver (2027 Help, flip fix after FK).
- Matching by hand (antCGi 7R_0omGY-Ms): Modify > Match Transformations > Match Rotation (FK control
  first, IK joint last); IK control to the FK wrist; pole control to the locator under the FK elbow.
- Constraint interpolation: select the constraint node, Attribute Editor > Interpolation Type >
  Shortest (antCGi jXmK0Vl5iYA [00:32:51]). A blendMatrix-driven blend has no such menu: scrub the
  switch with FK and IK posed apart and watch for a spin (or run `R.blend_sweep_test`).
- One solver per character: the Create IK Handle tool reuses the scene's shared ikRPsolver; for a
  second character use the Script Editor, `createNode ikRPsolver -n heroA_ikRPsolver;` then connect
  `heroA_ikRPsolver.message` to each handle's `ikSolver` in the Connection Editor [verify attribute]
  (Fragapane rfLEBgOEW1A [00:34:43]; 2027 IK solvers).

## P8 Spaces

- Node Editor: Tab `blendMatrix`, Attribute Editor > Add New Item for each target; paste the
  control's world matrix into Input Matrix by hand (connecting then disconnecting leaves nothing,
  antCGi BFCggv0SV0s [00:03:36]).
- blendMatrix targets override in order: typing 1, 1, 1 in the three target weights gives the last
  target, not an average; equal thirds are 1, 0.5, 0.3333 (2027 Help).
- parentMatrix node (2025+), the normalized alternative: Attribute Editor > Manage Targets > Add
  Selected as Target; Initialize Target Offset (object stays at the Input Matrix location when that
  target alone drives it) or Snap Target Offset (object stays where it is now); per-target Weight,
  Target Matrix, Offset Matrix.

## P9 Spine

- Create > Curve Tools > EP Curve Tool, degree 3, hold V to snap to joints.
- Skeleton > Create IK Spline Handle (options: Auto Create Curve off, Auto Parent Curve off); select
  start joint, end joint, then the curve.
- Handle Attribute Editor > IK Solver Attributes > Advanced Twist Controls: Enable Twist Controls,
  World Up Type Object Rotation Up (Start/End), World Up Object and World Up Object 2.
- Skin > Bind Skin, Bind to: Selected Joints (control joints to curve).

## P10 Scale

- Connection Editor: root control scale to the skeleton group scale only (antCGi DO6RztqbwzA
  [00:03:11]).

## P11 Foot

- Node Editor: condition, plusMinusAverage, multiplyDivide; Modify > Add Attribute on the foot
  control (a locked enum as a divider, then footRoll, footBank, heelTwist, toeTwist, toeTap).
- Skeleton > Create IK Handle, Single Chain, ankle to ball and ball to toe.

## P12 Review

- Windows > Playblast options (or Windows > Playblast): image sequence, 50% or 100%, show ornaments
  off; Display > Heads Up Display > Evaluation for the mode and GPU Override.
- AdvancedSkeleton > Tools > Animation Tester (range of motion keys) when AdvancedSkeleton is
  installed.

## P13 Lockdown and sets

- Outliner filter field `*_ctrl`; Create > Sets > Quick Select Set; Control > Create Character Set
  (legacy clip workflow; Time Editor is current).

## P14 Performance (GUI only)

- Windows > Settings/Preferences > Preferences > Settings > Animation: Evaluation mode (DG, Serial,
  Parallel), GPU Override, Include controllers in evaluation graph.
- Windows > General Editors > Profiler: Record, play the range with Playback Speed Play every frame,
  Stop; Category, Thread and CPU views; look for long bars, gaps and `opaqueTaskEvaluation` (cycle
  clusters); Edit > Save Recording with a dated name (Miquel Campos NfYAaK3wtQs [00:05:26]).
- Windows > General Editors > Evaluation Toolkit [verify path]: modes, scheduling types, evaluators,
  Analysis Mode, GPU Override diagnostics.
- Select a control, then the Node Editor or Hypergraph and select downstream to see what it drives
  (Fragapane _0mb4wIZi80 [00:22:21]).
- Before profiling, key the controls (a keyless rig is mostly left out of the Evaluation Graph); tag
  controls (Control > Tag as Controller) and tick Include controllers in evaluation graph so first
  keys stop invalidating the graph (Using Parallel Maya 2027, Reduce Graph Rebuild). Curve manager
  has no menu item in the paper: Script Editor, `cmds.evaluator(name="curveManager", enable=True)`
  (session only).
- GPU Override check: Preferences > Settings > Animation > GPU Override on, Viewport 2.0, Display >
  Heads Up Display > Evaluation. "Enabled (0 k)" means nothing is on the GPU; then MEL
  `deformerEvaluator -meshes;` prints a chain or the reason per mesh, `deformerEvaluator -chains;`
  the active chains. Maya 2027.2: scrubbing with GPU Override on can crash (known issue); turn it
  off, or the invisibility evaluator, while scrubbing. Smooth preview meshes: Attribute Editor >
  Smooth Mesh > Subdivision Method OpenSubdiv Catmull-Clark with OpenCL Acceleration (legacy Maya
  Catmull-Clark stays on the CPU).
- Evaluator settings made in the Evaluation Toolkit or by script last for the session only (not
  saved in the scene).

## P15 Game export (handed to scenario-maya-pipeline-scripting)

- File > Game Exporter > Animation Clips (clips with start and end, Export Selected or an Object
  Set); File > Export Selection > FBX (Animation, Bake Animation, Skins, Blend Shapes; FBX 2020.2
  for Unreal).
- Skin > Bake Deformers to Skin Weights for engines limited to skinCluster data.

## Auto-riggers

- Skeleton > Quick Rig (also Windows > Animation Editors > Quick Rig): One-Click or Step-By-Step
  (Geometry, Guides with Embed Method and Resolution, User Adjustment of Guides with Mirror,
  Character Generation with T-Stance Correction and Skeleton and Control Rig, Skinning).
- Windows > Animation Editors > HumanIK: Create Character Definition, map cells (green when valid),
  Control > Create Control Rig.
- mGear > Shifter > Guide Manager, Build From Selection (F7 in the mGear docs' hotkeys), Settings >
  Custom Steps; mGear > Rigbits > RBF Manager [verify mGear 4 menus].
- AdvancedSkeleton shelf: Build, Toggle Fit, Rebuild; Face > Pre, Build Advanced Face; Convert to
  BlendShapes Only before game export.
