# Expert notes: scenario-maya-rigging

The depth behind SKILL.md, by expert, with the source video id and timestamp (full URLs in
`sources.md`). Per-source notes are in the project's `notes/rigging/`; nothing here was watched
beyond those transcripts and notes. Items marked [added] are this skill's own reasoning; [verify]
marks API details the probe test answers.

## 1. Raffaele Fragapane (Cult of Rig; Performance Technology Supervisor at Animal Logic)

### Joints, IK, skinning, precision (rfLEBgOEW1A, 2018)

- A joint is "just a transform" with attributes bolted on for drawing, IK and skinning; know what
  each one computes instead of following rules passed on like "superstition" [00:05:38] [00:17:29]
  [01:57:02].
- Learn to work without jointOrient and treat it as bad practice; live with it when a pipeline
  imposes it [00:16:24]. jointOrient is a pre-multiplied rotation; zeroing it has no speed or
  stability benefit [00:19:08]. "Fix orient" scripts only copy rotation into jointOrient and zero
  rotate [00:18:35].
- IK handle creation with default tooling pushes values into jointOrient and preferred angle; zero
  them or script it [00:22:37] to [00:24:55].
- Preferred angle is an IK-only sign bias. With an up vector a 2-bone chain is fully determined (two
  lengths and the root-to-effector distance), so it is not needed; it is for 3+ bones or no up
  vector [00:28:25] [00:36:25] [00:39:18]. Always give 2-bone IK an up vector ("which you probably
  should almost always have") [00:39:18].
- Rotate order does not matter on skinned joints (skinning uses matrices, not Euler values); it
  matters on controls [00:41:24].
- Maya shares one solver node per type between all handles; exporting handles with a character and
  loading several characters "can make a mess" [00:34:43] [00:52:33]. The 2027 doc's fix: extra
  solvers with `createNode`, one per character (`own_solver` in mx_rig).
- 3-bone legs: several valid solutions; his pattern solves once biased to the hip, once to the
  ankle, and blends [00:50:53]. Custom deterministic solvers are "pretty simple geometry"
  [01:03:18].
- Nobody gives animators raw joints and handles; controls drive the handle and the FK, the blend
  attribute feeds the handle [00:58:47]. Keying through the raw handle and FK joints gives
  double-keyed chains [00:56:01].
- Arm layout: root at the humerus, a joint just before the elbow, the radius just off it, the wrist;
  "always decouple" wrist and hand, the palm is a very different transform [01:15:35] [01:16:07].
- skinCluster consumes influence world matrices and bind pre-matrices only: "The skin cluster does
  not care that you have joints" [01:22:26] [01:30:55]. The bind pose is a set of matrices you can
  reset; never delete and recreate joints because of it [01:35:18] to [01:39:12].
- Separate the authoring rig (joints for paint tools) from the consumption rig the animator gets,
  which can drive the skinCluster from controls directly [01:12:37] [01:33:40]. Film only: engines
  skin to bones.
- Precision: move the rig 100,000 then 1,000,000 units away and upside down; the mesh "fries". Joint
  orient has nothing to do with it; world-space magnitude does. Fix: per influence,
  multMatrix(influence.worldMatrix, group.worldInverseMatrix) into the skinCluster, mesh under the
  same group; it breaks the paint tools, so switch spaces for painting [01:41:55] to [01:53:38]. "If
  you wiggle things in place you will never see issues" [01:53:38].
- segmentScaleCompensate uses inverseScale, connected from the parent's scale on parenting; he
  disconnects it for plain hierarchical scale [00:30:08] [00:40:26].

### Parallel evaluation (_0mb4wIZi80, 2018)

- "Parallel loves static data": animation curves tell the Evaluation Manager what changes; give each
  component a handful of function curves from the start; "if you have no function curves chances are
  your rig is going to be paralyzed terribly" [00:19:35] [00:20:14] [01:16:10]. Do not flat-key
  20,000 attributes either [01:16:44].
- Rig design in parallel is 2D packing: split components so independent work starts early (FK can
  start while the expensive foot roll runs); duplicating cheap math to remove a dependency wins
  [00:37:48] to [00:40:07].
- Serial rigs get slower on many-core, lower-clock CPUs; parallel rigs scale [00:41:13].
- One Python node collapses concurrency around it (GIL, unknowable side effects): "nothing will
  murder your performance like one of those" [00:54:03] [00:55:10]. The 2027 paper: Python plug-ins
  are Globally Serial by default; the advice stands.
- A pure MEL expression (reads its inputs, writes its outputs) costs about 43 microseconds and runs
  Globally Serial; one that calls `ls`, `getAttr` on other nodes or writes elsewhere becomes
  untrusted and stalls everything [01:06:43] to [01:10:31].
- `frozen` is a scheduling switch: never drive it from an animatable attribute (EG rebuild stutter
  or ignored); visibility switching invalidates too [01:17:18] to [01:19:00].
- "don't do Python, use expressions sparingly and don't loop unholy things through the graph"
  [01:23:31].

## 2. Antony Ward (antCGi; games veteran at Atari and EA, lead artist, animator and TA, author of Game Character Development with Maya)

### Model evaluation (e74KphYwMww, 2021)

- "Don't assume that because someone else has built the model that it's ready for animation"
  [00:01:42]. Check before rigging: cm [00:02:52]; height to the client spec (about 1.8 to 1.9 m
  here) [00:03:58]; feet exactly on the floor [00:04:34]; centered on X for symmetry and mirroring
  [00:05:44]; frozen [00:06:37]; pivots centered [00:07:09].
- Eyes modeled dead ahead, then frozen: eye controls in front of the face must aim straight;
  offsetting controls to match posed eyes breaks animation transfer [00:08:14].
- Topology first: open mouth and mouth bag for a face, loops at eyelids, lips, knuckles and knees,
  triangles out of deforming zones; send it back with a list; do not edit a client model without
  permission [00:10:30] to [00:13:48]. "You should never sacrifice how the model deforms"
  [00:22:50].
- Arms raised enough to paint under, palms down [00:23:24] to [00:24:32]; combine symmetric
  accessories so weights mirror [00:24:32] to [00:25:47].

### Skeleton against the Unreal mannequin (fGacyVzJGIU, 2021)

- A game skeleton "comes with its own set of rules": one hierarchy, a root at the world origin,
  engine names, a joint budget ("it pays to be frugal") [00:01:52] [00:06:48] [00:25:24].
- Follow the mannequin's names and joints when reusing its animations; otherwise "you can quite
  happily ignore the joint names and orientations and use your own setup" [00:01:52].
- Joints on edge loops, not between them [00:13:11]; spine joint just under the rib cage [00:11:24];
  spine centered exactly [00:10:15].
- Root: world oriented at the origin, "essentially a locator so the engine knows where the character
  is"; cog duplicated from it at the pelvis [00:17:22] to [00:18:30]. His deviation: pelvis and
  thighs both under cog, so pelvis moves only the upper body [00:25:24] (the UE4 mannequin has
  thighs under pelvis [added]).
- Twist joints: lower arm mid; upper arm top and mid (the top one stays with the shoulder, twist
  happens along the bicep); thigh the same; calf mid; wrist and foot twist added in Part 04
  [00:19:08] to [00:24:47]. Place them with a point constraint (keeps the orientation), not a parent
  constraint (blends orientations) [00:24:14]; `duplicate(parentOnly=True)` plus a computed midpoint
  does the same [added].
- Name clashes cause Unreal export errors [00:17:15].

### Rotational axes and rotate orders (FN05iGspldI, 2021)

- Verify orientation after placement; moving joints misaligns axes [00:01:51]. Root, cog, head, eyes
  and feet world oriented (feet: engine foot placement and walk cycles) [00:02:22] to [00:06:03].
- Orient Joint to World on a parented joint takes the parent's frame: unparent, orient, reparent
  [00:03:25].
- No rotation values before skinning and export [00:07:16] [00:10:14]; end joints reset to their
  parent [00:07:16].
- All digits curl on the same axis so one attribute makes a fist; fix the thumb's LRA, then
  `joint -e -zso` [00:08:10] to [00:10:14].
- Mirror Function Behavior for limbs (animation copies side to side); orientation mirroring makes
  "more work for the animators" [00:12:13]. Eyes: duplicate and negate translateX instead
  [00:13:20].
- "If you don't use Set Preferred Angle ... the elbow bends completely the wrong way" [00:15:18].
- Gimbal can only be reduced [00:16:46]; read rotate orders backwards [00:17:19]. Y-down table:
  default YXZ, elbows and knees YZX, twist ZXY, feet ZXY, head and eyes XYZ, shoulders, hips, cog
  unchanged [00:17:51] to [00:25:11]. "Make sure that your controls and any offset groups have the
  same rotation orders as the joints they control" [00:25:42].

### IK limbs (yls25bV-IZU, 2021)

- Neutral IK/FK switch must not move anything [00:06:35]; drift from the pole vector is removed with
  two locators 30 units behind the elbow, one under the IK elbow, nudging the pole until they
  coincide [00:06:35] to [00:09:19].
- Pole too close flips the arm; behind the arm it "twists to stay pointed" [00:05:36]. Show only the
  active mode's controls [00:01:24].
- Values into offsetParentMatrix so channels read zero [00:09:34]; wrist orient constraint from the
  IK control [00:09:53]; skin early to see weight issues [00:10:28].
- Quadruped leg: a spring-solver driver chain carrying an RP handle (thigh to calf) and an SC handle
  (calf to foot); the spring solver is "temperamental", RP is the stable fallback [00:12:28] to
  [00:18:08]. Load it with MEL `ikSpringSolver` [00:13:28]. Hock control translation to rotation
  through a multiplyDivide (-2, 2) [00:21:37] to [00:24:24].
- Leg root worldMatrix into the thigh joints' offsetParentMatrix; then zero translate, rotate and
  jointOrient, or the leg rotates backwards [00:17:02] to [00:18:08] [00:28:11].

### Space swapping (BFCggv0SV0s, 2021)

- Matrix nodes into offsetParentMatrix, "this more economical solution" [00:21:30]. Never blend to
  the target itself: the pole jumps to the wrist and the IK flips; blend to a locator under the
  target that stores the offset [00:05:18]. The locators are a feature: animators can move or
  animate them [00:06:58].
- Input Matrix holds the world state; copy the values in, because connecting then disconnecting
  leaves nothing [00:03:02] [00:03:36]. Two spaces: envelope; more: per-target weights from enum
  conditions, discrete 0/1 [00:11:35] to [00:18:10]. Set condition true 1, false 0 explicitly
  [00:18:10].

### Reverse foot (jXmK0Vl5iYA, 2021)

- One attribute from heel to ball to toe for walk cycles [00:05:32]; nodes, not set driven keys
  ("quite limiting") [00:16:14].
- Reverse joints aligned in top view or the roll is wrong [00:08:56]; heel pivot on the floor, moved
  back after testing [00:06:37] [00:25:13]; clean values on everything the network drives
  [00:09:28].
- Curves: ball = roll up to 25, then 50 - roll; toe = roll - 25; heel = roll below 0; clamp the ball
  when negative [00:17:58] to [00:27:29]. Bank by sign on inner and outer groups [00:27:30]. Toe
  flips during the IK/FK blend come from the constraint: interpolation Shortest [00:32:51].

### Final adjustments (DO6RztqbwzA, 2021)

- Scalability is "a fundamental part of rigging" [00:00:33]. Connect root scale only to groups that
  do not already inherit it [00:02:38]; multiply every stretch base length by root scaleY
  [00:04:50]; IK spine joints under a world-pivot scale group because segment scale compensate
  blocks propagation [00:06:31] to [00:07:36]; test 1.24 and 1.6, posed [00:05:56] [00:11:35].
- Animators "select the root control and then select its hierarchy to then set a key on the whole
  character": lock everything that is not a control [00:13:18]; FK elbows keep only their bend axis
  [00:17:55]; limb attribute holders point-constrained to the hand or foot bind joint [00:22:04].
- Selection sets, Tag as Controller (pickwalk, visibility mode), character set, limits footRoll
  -40..80 and footBank -60..60 [00:13:45] to [00:24:52]. "There's always something that gets missed"
  [00:25:29]. Physics-driven joints get no controls [00:26:18].
- His "GPU acceleration" claim for controller tags is imprecise: the 2027 parallel paper describes
  graph prepopulation.

### Spline IK spine (KiqpzKUJKt0, 2021)

- Own degree-3 EP curve snapped to the joints (auto curves shift joints) [00:05:40]; control joints
  skinned to the curve, not clusters [00:07:50]; spline IK ignores rotation of curve controls, wire
  twist: twist = shoulder - root, roll = root [00:10:49] to [00:16:43]; mid twist directly on ribbon
  joints with -1, -0.5, -0.25 [00:16:46] to [00:21:53]; quick-bind to test [00:23:20].

### Face joints (UpHKfUPyyBI, 2019)

- Lips as root-plus-tip pairs: roots inside the head, tips on the lip surface, so rotation arcs over
  the face [00:03:26] [00:06:59]; upper lip under head, lower under jaw [00:16:19].
- Face joints on both sides oriented the same way, unlike limbs [00:19:01]; cheeks and brows aligned
  to the surface with a temporary end joint [00:20:22]; mirrored surface-aligned joints re-oriented
  on the right with their own temporary ends [00:23:06].
- Orient Joint warns on rotated roots: freeze first [00:10:18]. Controls in front of the face, pivot
  on the joint [00:25:58].

### IK/FK matching (7R_0omGY-Ms, 2020)

- FK controls matched to IK joints; IK control to the FK wrist; one extra rig element for the pole:
  a locator under the FK elbow, and an ankle locator carrying the world-oriented IK foot orientation
  [00:02:46] to [00:08:41]. Helpers on the control rig, never the bind skeleton: "you want to keep
  the skeleton hierarchy as clean as possible to avoid problems during export" [00:05:04].

## 3. Maya Learning Channel (Autodesk)

- **Offset Parent Matrix (JOYMV-bQdlM, 2019, presenter Matt):** OPM applies a matrix before the
  node's own TRS: "define the local space of an object without needing to parent it, constrain it,
  or alter its pivot" [00:01:51] [00:02:40]. `worldMatrix` into OPM equals parent plus scale
  constraints with the channels free [00:05:20]. worldMatrix carries all parents: use `.matrix` for
  relative drives [00:09:15] [00:09:51]; pre-existing translation doubles, zero it [00:10:27]. 20
  joints removed from one hand [00:12:36].
- **Quick Rig (c538zkwxgTQ, 2016):** Quick Rig suits "a game or background character that wouldn't
  be looked at quite so closely"; hero characters get a custom rig [00:00:05]. One-Click misplaces
  effectors: delete the definition, Step-By-Step, Imperfect Mesh for meshes with holes, resolution
  256, fix and mirror guides, T-Stance Correction on for A-stance models [00:01:17] to [00:03:48].
  Auto-skin is "three-quarters of the way" [00:04:21]; rigid head features constrained and the head
  weighted to 1 [00:05:14].

## 4. Miquel Campos (mGear lead developer; rigging supervisor on ONI: Thunder God's Tale)

- **ONI (rDHTdhzKpvI, 2023):** "we serialize everything and we build clean every single time"
  [00:06:42]; standardization means anyone can open any asset [00:22:05]; hand-made exceptions built
  fast and imported into the standard build [00:21:32]; vanilla components, effort on deformation
  (RBF, correctives, delta mush, layered face) [00:39:46]; blendshapes "as a polishing stage, not as
  the base" [01:05:36]; chained blendshape layers "horrible" for performance, kept for iteration
  [01:07:48]; spine IK on FK, both active, no switch [01:11:16]; UI hosts only under the world
  control, proxies on the arm via callbacks [00:37:34] [00:38:06]; ask for final-aim notes from day
  one [00:18:14]; proportions tested with a crude rig first [00:16:35]; build order: joints before
  skin import [00:58:58].
- **Data Centric Rigging, parallel notes (NfYAaK3wtQs, 2018):** profile early and keep dated
  profiles [00:05:26]; attribute hosts parented under the limbs they control wait for the whole
  chain; moved under the root space: about 50 to 60 fps, 20 to 17 ms per frame [00:08:35] to
  [00:12:51]; "the golden rule ... is graph connections and hierarchy" [00:18:54]; with several
  characters parallel and GPU Override fill the gaps, so heavy single-rig optimization may not pay
  [00:18:22].

## 5. AdvancedSkeleton (official overview, mTB9Yh_sWKc, 2018; tool by Oyvind Nostdahl)

- The rig regenerates from the fit skeleton: Toggle Fit, edit, Rebuild; never edit the built rig
  [00:07:11]. A single deforming chain separate from the motion system simplifies binding and export
  [00:06:40].
- "Anything IK related is done by joint labels"; extra attributes add behavior [00:08:18]
  [00:09:31]. Controls at zero after build, fit rotations pushed into jointOrient [00:10:06].
- Show the pole vector plane; a nearly straight knee can bend backwards [00:14:15] to [00:16:30].
- Animation Tester keys every axis of every control for weight review [00:19:50]. Face as
  skinCluster plus layered blendShape; for engines, Convert to BlendShapes Only gives one
  skinCluster and one blendShape [00:31:29] [00:39:20].

## 6. Bungie (David Hunt, rigging tech art lead; Forrest Soderlind, Maya tech tools lead): Tools-Based Rigging in Destiny (U_4u0kbf-JE, GDC 2015)

- The rig is "a user interface to a deeper set of tools" [00:05:40]. Components on bone chains, not
  regions: "an FKIK component isn't defined as an arm it can be used on any three joint chain"
  [00:58:02].
- Chain markup attributes plus joint labels; "I'm not saying don't do a naming convention I'm saying
  don't rely on too much" [00:11:38] [00:12:12]. Meta network nodes with public and do-not-touch
  groups as the code interface [00:22:38] to [00:23:45].
- Prototype by hand, then "it's really important to take the next step of writing a script to
  generate it automatically" [00:22:06]. Components removable and retargetable without losing
  animation; no FKIK on every finger [00:25:27] [00:58:02].
- Deformation rig and control rig separate; referencing forbids DAG edits, so they "explant"
  [00:42:36] [00:43:40]; a Problem Spotter batch-checks thousands of files [00:45:21]. Pedestal is a
  sibling, not the top of the control hierarchy [00:18:16].

## 7. Official documentation (Maya 2027 Help, Using Parallel Maya 2027, Unreal and Unity docs)

- **Joints (2027):** matrix `[S] * [RO] * [R] * [JO] * [IS] * [T]`; jointOrient stored as a
  quaternion (set 360, read 0); `-orientJoint` ignored with rotations, no child or `-o`/`-so`; never
  mirror with scale -1; spline IK start joints flip past 90 degrees; never parent the spline curve
  under the start joint (cycle); do not use SC on a 2-bone chain; stiffness needs all joints of the
  chain; one shared solver per type.
- **Matrices (2027):** OPM is "an implicit parent inbetween Dag parent and local transformation";
  parentMatrix = dag parent world times OPM, so `world = local * OPM * dagParentWorld`
  (post-multiplied): a world matrix into OPM is world-correct only without a transforming parent or
  with inheritsTransform off; blendMatrix is "not a weighted average, but an ordered blend, where
  each successive matrix overrides the preceding matrices" (1, 1/2, 1/3 for equal thirds);
  parentMatrix (2025) normalizes target weights, stores a per-target Offset Matrix, Initialize
  Target Offset keeps the object at the Input Matrix when that target becomes the only influence,
  Snap Target Offset keeps it where it is; rotationFromMatrix assumes XYZ; keying a constrained
  object inserts a pairBlend; uvPin needs clean UVs, proximityPin does not.
- **HumanIK (2027):** 15 required nodes; no numbering gaps; strict T-stance ("Without a properly
  configured T-stance, the solvers will base all of their operations on faulty data"); Reference
  locator; segment scale compensate off.
- **mGear docs:** everything done on a built rig must be saved as data or a POST step; gimmick
  joints before skin import; turn off topological autoskin when lips come later.
- **Using Parallel Maya 2027:** make it right first (DG = Serial = Parallel); Serial is a debug
  mode; "remove coupling between parts of your rig"; static curves are excluded from the EG and
  changing them rebuilds it; controller tags with Include controllers in evaluation graph, two keys
  "each with slightly different values", locked static channels or the curve manager
  (`forceAnimatedCurves` none, controller, keyed, all; static curves plus curve manager: middle
  playback speed, parallel manipulation, no rebuild on keying) stop first-key invalidation;
  evaluator state is per session; Python plug-ins Globally Serial; `ikSystem` disables the EM with
  multi-chain IK; FBIK forces Serial; GPU Override thresholds 2000 (NVIDIA) and 500 (AMD) vertices
  (`MAYA_OPENCL_DEFORMER_MIN_VERTS`), 21 supported node types, exclusions (animated weightFunction,
  animated deltaMush smoothing attributes or original geometry, multi-geometry deformers with one
  CPU-bound geometry, animated topology, legacy Catmull-Clark smooth preview, back-face culling,
  unsupported streams), HUD "Enabled (0 k)" = nothing on the GPU, `deformerEvaluator -meshes` for
  the reason; animated `frozen` gives inconsistent frames. The 2027.2 release notes add a crash when
  scrubbing with GPU Override on (MAYA-141895).
- **Engines:** Unreal: the root joint is the skeletal mesh pivot; one animation per file;
  triangulate in Maya; FBX 2020.2. Unity: 4 influences by default, humanoid needs at least 15 bones
  in T-pose.

## 8. Disagreements and the deciding condition

| Topic                         | Position A                                                                  | Position B                                                                                                  | Decide by                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| jointOrient                   | antCGi: orientation in jointOrient, rotations frozen [FN05iGspldI 00:02:54] | Fragapane: work without it [rfLEBgOEW1A 00:16:24]                                                           | Pipeline: Orient Joint, Mirror Joints, HumanIK, auto-riggers and exporters assume jointOrient; use it there. Both agree: zero rotations, one place. `mx_rig` uses jointOrient. |
| Preferred angle               | antCGi: essential [FN05iGspldI 00:15:18]                                    | Fragapane: only a sign bias with a pole [00:28:25]                                                          | Always set it on the bent rest pose; it costs nothing.                                                                                                                         |
| SDK vs nodes                  | antCGi: nodes for the foot [jXmK0Vl5iYA 00:16:14]                           | SDKs shape non-linear curves (MLC's old finger poses occupied FK channels, JOYMV-bQdlM 00:07:22)            | Nodes for piecewise-linear, inspectable logic; SDK when an artist shapes a curve; either way drive a separate node, not the animator's channels.                               |
| Mirroring                     | Behavior for limbs [FN05iGspldI 00:12:13]                                   | Same orientation for eyes and face [UpHKfUPyyBI 00:19:01]                                                   | Behavior when poses copy left to right; orientation when both sides must move the same world way for the same value.                                                           |
| Primary axis                  | antCGi: Y down the bone, Z forward [fGacyVzJGIU 00:03:01]                   | Mannequin and Maya default: X down the bone                                                                 | Follow the target skeleton when reusing engine animation; otherwise one convention everywhere. The Y claim is uncited.                                                         |
| 3-segment legs                | Spring driver chain [yls25bV-IZU 00:12:56]                                  | Blend hip- and ankle-biased solutions [rfLEBgOEW1A 00:50:53]                                                | Spring for even compression, RP for stability; the blend needs custom math.                                                                                                    |
| Attribute host placement      | antCGi: point-constrain limb holders to the hand [DO6RztqbwzA 00:22:04]     | Miquel Campos: hosts out of the limb, near the root [NfYAaK3wtQs 00:12:51]                                  | Performance: `mx_rig` puts the settings control on the limb's parent space by default; the antCGi option exists.                                                               |
| Auto-rigger vs custom         | Quick Rig for background and simple game characters [c538zkwxgTQ 00:00:05]  | Custom for hero and cutscene; Bungie's own component system [U_4u0kbf-JE 00:05:40]                          | Camera distance, deformation bar, rig count, engine runtime needs, tools team.                                                                                                 |
| Framework on a hero show      | mGear vanilla components, effort on deformation [rDHTdhzKpvI 00:39:46]      | Bungie custom components with runtime twins [U_4u0kbf-JE 00:15:28]                                          | Whether the engine needs components that mirror runtime behavior.                                                                                                              |
| FK/IK                         | Animated switch per component [U_4u0kbf-JE 00:13:16]                        | Spine IK on FK, no switch [rDHTdhzKpvI 01:11:16]                                                            | Animator preference; retargeting needs.                                                                                                                                        |
| Optimize one rig              | Profile and fix hot spots [NfYAaK3wtQs 00:12:51]                            | With many characters the gains shrink [00:18:22]; ONI kept a slow face for iteration [rDHTdhzKpvI 01:07:48] | Characters per shot, schedule, animator frame rate.                                                                                                                            |
| Joints at all                 | Joints are the influences                                                   | Fragapane: a consumption rig can drop them [rfLEBgOEW1A 01:33:40]                                           | Film internal rigs only; games need joints.                                                                                                                                    |
| Tag as Controller             | antCGi: "GPU acceleration" [DO6RztqbwzA 00:15:47]                           | 2027 paper: evaluation graph prepopulation                                                                  | Trust the doc.                                                                                                                                                                 |
| Mid-blend flip fix            | antCGi: constraint interpolation Shortest [jXmK0Vl5iYA 00:32:51]            | a blendMatrix blend (matrix method) has no interpolation setting in any note                                | Constraint blends: Shortest. Matrix blends: measure the sweep (`blend_sweep_test`) instead of assuming [added].                                                                |
| Equal blend of several spaces | blendMatrix with 1, 1/2, 1/3 (2027 Help)                                    | parentMatrix node, normalized weights and offsets (2027 Help)                                               | parentMatrix when animators blend spaces continuously and need Snap Target Offset; blendMatrix with 0/1 conditions for discrete switches.                                      |

## 9. What changed for Maya 2027 (translate the old sources)

- Pre-2020 sources (Fragapane 2018, antCGi face 2019) predate offsetParentMatrix and the blend, aim
  and pick matrix nodes; parentMatrix (2025) postdates every video.
- 2026 renames: `addDoubleLinear` to `addDL`, `multiplyDoubleLinear` to `multiplyDL`,
  `pointMatrixMult` to `pointMatrixMultDL`; plain math names create unitless nodes. condition,
  plusMinusAverage, multiplyDivide, reverse and blendMatrix are not in the list.
- Orient Joint: Auto orient secondary axis and LRA buttons (2025); negative primary axes fixed in
  2027.1.
- Manipulation "always serial" (Fragapane 2018) is superseded: idle graph preparation, controller
  prepopulation, Manipulation Prevalidation. GPU Override since 2024 schedules deformers
  individually; uvPin and follicles no longer push a character off the GPU. 2027.2 known issue:
  crash scrubbing with GPU Override (disable it or the invisibility evaluator).
- Follicle ribbons: uvPin and proximityPin now. Trax: Time Editor. ngSkinTools: Skin Tools in 2027.
  PyMEL (Bungie): not bundled. ShotGrid: Flow Production Tracking. Profiler: Windows > General
  Editors > Profiler. mGear 2.x and 3.7 in the videos, mGear 4 current. UE4 mannequin in the course;
  UE5 Manny and Quinn differ [verify against the project].
