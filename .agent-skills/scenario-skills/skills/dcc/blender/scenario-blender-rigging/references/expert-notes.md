# Expert notes: scenario-blender-rigging

Judgment by expert, with source video id and timestamp. Experts: CGDive channel host (Rigify full
course FhF54DZY34U, 2026 courses Ldki5txSn5U / FzQVpzXcFX0 / A147p_zDwO4, "Rigging Isn't Scary"
lessons), Demeter Dzadik (Blender Studio rigger, CloudRig, f6im_0QVeuo), Rik Schutte (animator, Sony
Imageworks, Blender Studio, _Ov0pFIOpug), Ivan Cappiello (former Rigify maintainer, LLnXBvEnG7o),
Wayne Dixon (CG Cookie, AymxOGtJoew), Dikko (ljW9YJeA79E). [added] marks the skill author's
additions; [verified] facts were run in Blender 5.2.1.

## 1. Placement, roll, hierarchy

- **Model check first.** Centered at the origin, feet on the floor, facing -Y, about 1.8 m,
  transforms applied: "A huge number of rigging problems people ask me about are simply due to
  skipping the model check" (CGDive A147p_zDwO4 [00:03:17]). Two kinds of symmetry: general and true
  (vertex for vertex); Snap to Symmetry only on parts meant to be symmetric, never on an
  intentionally asymmetric body (Q21AZnAyOJA [00:07:03] to [00:08:03]). The armature is created at
  the origin and never moved in Object Mode while rigging, or Symmetrize breaks (FzQVpzXcFX0
  [00:31:47]).
- **Bones stand for bone, muscle and tissue.** Place them in the center of the volume they move;
  anatomy is a starting point (FzQVpzXcFX0 [00:05:34]). Spine pulled toward the middle of the body
  in side view instead of the S-curve (q-PRGvE1ico [00:05:02]); spine lengths evened out afterwards
  (A147p_zDwO4 [00:46:59]). Clavicle bone high and deep, buried between clavicle, traps and scapula
  (FhF54DZY34U [00:52:56], q-PRGvE1ico [00:07:29]); upper-arm head deep in the socket below the
  clavicle (q-PRGvE1ico [00:08:21]); head pivot "just below the ear" (q-PRGvE1ico [00:06:46]);
  finger bases at the knuckle line, deeper than the palm folds (QnCo0hzXKeQ [00:00:00]).
- **The bend is the IK specification.** Knees slightly forward, elbows slightly back, straight in
  the other view (CGDive FhF54DZY34U [00:50:42]); Demeter exaggerated Sintel's elbow bend until
  Rigify's pole landed behind, because roll changes did not fix the bend direction (f6im_0QVeuo
  [00:11:17], [00:11:49]). "In rigging, it is easier to bend something than to unbend it":
  straighten a drooping tail or close a mouth in the model before rigging (FhF54DZY34U [02:01:06]).
- **Roll is an animation-curve decision.** One local axis per hinge so the animator uses one F-curve
  ("your animator is going to hate you", q-PRGvE1ico [00:13:35]); rotating a new bone 180 deg in
  Front vs Side view gives opposite axes, so always look at the axes (q-PRGvE1ico [00:15:23]);
  fingers and thumb must curl on the same axis, roll the thumb 90 then 180 if it curls outward
  (QnCo0hzXKeQ [00:02:38]). Demeter's finger test: rotating each phalanx on local X must roll a
  clean fist with aligned knuckles, "regenerating the rig a million times" (f6im_0QVeuo [00:12:54]).
- **Hierarchy.** Every bone under one world-oriented root; audit by moving, rotating and scaling it
  (_6eyk1vembQ [00:22:01]). Disconnected parents are fine when connecting would move a pivot
  (QnCo0hzXKeQ [00:06:20]). Duplicated bones inherit their parent: clear parents and redo when
  confused (PdTOfJDdzgc [00:10:18]).
- [added, verified] Connected bones: setting a parent's tail moves the child's head; clear
  `use_connect` before re-parenting or the head jumps to the new parent's tail.

## 2. Rigify (CGDive, Demeter, Ivan Cappiello)

- **What Rigify is.** Building blocks, not one click: rig types assembled in a readable metarig that
  stores what to build and how pieces join (Ivan LLnXBvEnG7o [00:05:21]). The rig type sits on the
  first bone of a connected chain; names do not matter, connected parenting does (CGDive
  [02:41:21]); a chain continues until a branch, so the neck needs its own type or the head is
  swallowed by the spine (Demeter [00:09:07]). Name-based rigging is fragile ("never do that", Ivan
  [00:34:23]).
- **Choice of metarig.** Basic Human for a first rig (the full Human "is actually quite complex"),
  Human for fingers and face, Wolf for dogs, Basic Quadruped has no face or fingers (CGDive
  [00:48:27], [02:01:39], [02:05:31]). Pick leg types by anatomy: "you cannot rig a horse leg with
  the human arm" (Ivan [00:24:40]). Keep fitted metarigs in a library .blend and append them for
  similar characters; animation transfers because control names stay stable (Ivan [00:08:13],
  [01:13:24]).
- **Fitting rules.** Scale the metarig in Object Mode, apply scale; fit arms and fingers in Pose
  Mode and Apply Pose as Rest Pose, otherwise the generated rig differs in size or pose (CGDive
  [00:49:33], [01:14:47]). Move joints as units: "Always box select over their connection and move
  them like that. Never move them individually" (CGDive [01:16:24]). Face order: move the `face`
  parent in Y/Z only, center line first, surface bones with Snap to Face, lids aligned vertically,
  lip bones in the middle of the lip, jaw pivot "extremely important", eye bone centered on the
  eyeball's middle loop (CGDive [01:13:41] to [01:26:27]). Breast and pelvis bones only help
  automatic weights; delete them if you will paint the chest (CGDive [00:53:31]).
- **Face upgrade.** The Human metarig still ships the legacy monolithic face; Upgrade Face Rig after
  fitting, before generating; irreversible; extra lip bones only after it (CGDive [01:25:22],
  [02:21:50]; still true in 5.2.1 [verified]). Glue bones only work on exact overlaps with another
  control's head or tail (Ivan [00:50:25]).
- **Generation errors.** Almost all come from a joint that got separated: "bone position is
  disjoint" (neck or tail off the spine), "mouth corner counts differ" (lip ends apart), UI rows all
  0, broken collection references, a limb generating nothing because delete-then-undo stripped its
  rig type (restore with Copy Type & Parameters) (CGDive [00:57:37] to [03:48:17]). "That should
  take care of about 90% of possible generation issues" (CGDive [02:23:42]).
- **Tuning lives on the metarig.** The generated rig is overwritten on regeneration: eyelids follow
  Z about 0.3, jaw Bottom Lip Influence 0.9, inner mouth chains spherical falloff off with falloff
  0.4, B-Bone segments 1 on a distorting chin bone, Overwrite Widget Meshes on, eye bone size sets
  the eye target size and distance (CGDive [01:54:30] to [01:57:20]). Cosmetic tweaks with no
  parameter: a post-generation script (Demeter [00:31:30]). Roll the metarig bone to fix a widget's
  orientation (CGDive [03:57:18]).
- **Face weaknesses out of the box** (CGDive [01:52:46]): jaw opening without a nice expression
  until the pivot is right, hard to make a non-creepy smile, eye target too small and close, lower
  lids following the eye too much.
- **Organization.** Each component on its own collection, FK and tweak collections on the first bone
  of each component, a collection named `DEF` in the UI gives a deform-bones button for painting;
  for colors the top-most colored collection wins (CGDive [03:39:21], [03:55:07], [04:05:18]).
  Colors: Rigify's function colors, or left red / right blue / center yellow, "popular among
  professional animators"; ask the animator (CGDive [04:09:21], [04:13:46]). Demeter disables
  unified selection colors (f6im_0QVeuo [00:07:31]).
- **Studio iteration.** Generate early and often, toggle metarig and rig, pose constantly (Demeter
  [00:05:53], [00:11:49]). Cut what animators do not use: fist controls and IK fingers went (Demeter
  [00:14:33]). Hinge options that let the head stay upright while the torso rotates: "animators tend
  to ask for this" (Demeter [00:16:41]).
- **Pose-driven setups.** Rigify's action slots (ported from CloudRig): pose deform bones for "lips
  wide" in an action keyed at frames 0 and 10 with LINEAR interpolation, "you want it to be linear
  to what the animator is doing"; a Corrective slot with two triggers fixes combinations (Demeter
  [00:47:16], [00:52:14]).
- **Why segmented DEF bones.** Bendy bones are "a crazy mind-blowing feature" but do not export;
  segmented deform bones behave similarly and export (Ivan [01:04:42]).

## 3. Manual rig architecture (CGDive, Level 3)

- **Three classes.** DEF (deform), MCH (mechanism, never animated), controls (everything else; no
  CTRL prefix, Wayne [00:08:24]). Separate DEF completely once deform bones are final: duplicate
  deformers as DEF-, one Copy Transforms each to the original (now a "connective" bone, never moved
  afterwards), deform flags become trivial, weight painting shows only DEF bones, and the DEF
  hierarchy can be rebuilt for engines (twists 2 to 4 under twist 1, hand under the first forearm
  twist) (A147p_zDwO4 [03:24:48] to [03:46:27]).
- **Layered limbs.** A main MCH chain with twists follows an FK or an IK copy through two Copy
  Transforms named FK and IK, the IK influence driven by a 0/1 property; mechanisms can be added per
  layer without touching the others (A147p_zDwO4 [01:10:56], [01:17:56]). Automate on the shared MCH
  layer so elbow caps and correctives work in both modes (A147p_zDwO4 [05:59:00]).
- **Twist chains.** 1 twist not enough, 2 insufficient, 3 nice, 4 really nice, more than 5
  invisible; Copy Rotation 1.0, 0.66, 0.33, about 0.1 from the driving end (thigh 0.05); forearm
  twists copy the hand Local/Local then Damped Track to it, because Damped Track never adds roll and
  so strips swing and keeps twist (A147p_zDwO4 [00:23:19], [00:29:33]; HhhSjGqetjo [00:07:56]).
  Upper-arm twists parented to the clavicle, Copy Location above Damped Track (Head/Tail 1), chained
  Copy Locations after disconnecting (connected parenting overrides Copy Location) (FzQVpzXcFX0
  [00:50:11], Q21AZnAyOJA [00:35:38]).
- **Spine.** Keep deform bones in logical orientation; flip copies as hips and chest controls, Copy
  Rotation Local/Local Mix Add to curl, torso parents both, torso under root (A147p_zDwO4 [00:49:17]
  to [00:57:21]).
- **IK.** Target fully unparented from the chain (a disconnected-but-parented target is a dependency
  loop), chain 2, pole offset and parented to the target for legs (a foot twist twists the leg) or
  to the clavicle for arms (hand rotation should not swing the elbow); pole angle is right when
  toggling IK does not move the rest pose (-89.1 deg on his arm); IK ignores Limit Rotation and
  locks, so lock IK Y/Z on shins and forearms (QnCo0hzXKeQ [00:09:15]; A147p_zDwO4 [02:27:17],
  [02:28:27], [01:59:15]). Arm IK target = a copy of the hand (same orientation) and the IK hand
  copies its transforms (A147p_zDwO4 [02:25:06]). IK where limbs touch something, FK where they
  swing (A147p_zDwO4 [00:58:37]).
- **Foot.** Six pivots under one roll control; pivots meant to be used one at a time, enforced by
  Copy Rotation plus one-sided Limit Rotation; the ball stays manual; the toe stays flat through a
  Damped Track helper with the animatable toe parented under it ("constraint plus child"); the roll
  control parented to the ankle control, never under a pivot it drives (A147p_zDwO4 [01:47:24] to
  [01:57:35]; PdTOfJDdzgc [00:13:10]).
- **Limb isolation.** Never Inherit Rotation off (it ignores the whole hierarchy including root);
  use a parent MCH (child of pelvis/clavicle) and a follow MCH (no parent) with World Copy
  Location/Rotation/Scale, the property driving only Copy Rotation; Copy Scale keeps root scaling
  (A147p_zDwO4 [01:40:44], [02:07:08], [02:09:53]). Defaults he ships: legs IK, arms FK, follow 0
  (A147p_zDwO4 [02:36:25]).
- **Hands.** Finger control: rotate = rotate, scale = curl (Rigify convention); base phalanx Copy
  Rotation Mix Add (parenting would scale the finger); middle and distal phalanges Transformation
  constraint Scale Z 0..1 to Rotation Z 90..0 with Extrapolate, because a driver would lock manual
  rotation (_6eyk1vembQ [00:08:07] to [00:12:42]). Palm bones 0.5 and 0.25 from both outer palms; "5
  deg is already kind of extreme", no limits (_6eyk1vembQ [00:17:58], [00:20:14]).
- **Custom properties** on a pose bone of a dedicated settings bone (visible in the N panel in Pose
  Mode), step 1, exactly 0 or 1 in production; renaming a property breaks every driver path
  (A147p_zDwO4 [01:24:04], [01:36:25], [04:58:05]).
- **Symmetry.** Build one side, Symmetrize; after renames delete the other side and resymmetrize the
  whole limb; Symmetrize does not copy drivers; pose-mode X mirror is name-based, edit-mode X mirror
  enforces geometry (ErR4RysRy0g [00:41:19]; _6eyk1vembQ [00:44:39]). Delete plus a single undo can
  bring bones back without constraints and properties: undo further and verify, undo steps 256
  (ErR4RysRy0g [00:39:18]; untested in 5.2).
- **Widgets.** Wire meshes in a hidden collection, local Y = bone length, wire width 2, shape where
  the animator expects to grab (foot rectangle at the sole), Override Transform to draw chest and
  hips shapes at the deforming bones, move the bone (pole distance, settings location) rather than
  offsetting the shape (aj_ACAE7K8I; doRG4Sko7Kg [00:45:12], [00:49:11], [00:51:00]).

## 4. Weighting

- **Recipe.** Blend Add, weight 1, strength about 0.2 (0.1 to 0.15 for blending), Auto Normalize
  always ("probably the most important option"), mirror only on truly symmetric meshes, Front Faces
  Only off, Zero Weights Active; click add, Ctrl subtract, Shift blur; "weight painting is just a
  lot of clicking" (CGDive tNW8uCs77MQ [00:02:06], 6zGVAStZP50 [00:14:40]; Demeter uses only Add,
  Subtract, Blur [00:23:46]).
- **Judge in pose.** Demeter paints with the character posed (f6im_0QVeuo [00:24:51]); CGDive scrubs
  a test animation (stride, full split, back kick, crouch, arm down/forward/up with the shoulder
  raised about 20 to 30 deg) and re-checks earlier poses after every change (rf3NDKXYpTk [00:13:25],
  [00:23:28], [00:53:23]); Dikko keys a test animation (ljW9YJeA79E [00:42:16]).
- **Where auto weights fail.** Waist (Demeter [00:20:33]), torso under the arm and chin (CGDive
  Ldki5txSn5U [00:28:13]), armpit/chest, crotch "red pants", heel, collar (6zGVAStZP50). Chest
  compression came from arm twists leaking onto the torso (rf3NDKXYpTk [00:28:02]). The upper arm
  has no business on the lower torso (CGDive FhF54DZY34U [01:34:30]).
- **Principles.** Hard over soft: "having your weights a little bit harder, which creates
  intersection between the geometry, is better than having too smooth weights" (FzQVpzXcFX0
  [01:43:01]). Limit each area to 2 or 3 bones: "multiple bones are fighting for influence"
  (rf3NDKXYpTk [00:20:27]). Lock finished groups, mask the work area (rf3NDKXYpTk [00:16:21]). Exact
  seams between overlapping meshes with a Mix brush at 0.5, strength 1 (0.75 neck / 0.25 chest also
  good) (rf3NDKXYpTk [00:34:02], [00:46:47]). Join meshes to paint across them; weights survive join
  and separate (rf3NDKXYpTk [00:43:11]).
- **Cleanup habits.** Near-zero weights of far bones make blur explode: Clean Vertex Groups, then
  blur with the deform-bones subset (the default smooths only the active group, "pretty much always
  not what you want") (Demeter [00:27:03], [00:39:10]). Smooth does nothing where a bone has zero
  influence: add a little first (CGDive FhF54DZY34U [02:36:28]). Levels with a negative offset
  hardens, then Normalize All with Lock Active off (BajO2vgto80 [00:28:23]).
- **Silent failure.** "Bone Heat Weighting: failed to find solution for one or more bones" appears
  only in the status bar and the mesh does not move (CGDive FhF54DZY34U [01:29:49], BajO2vgto80
  [00:00:33]). Fixes: scale 100x and re-weight (CGDive [02:24:16], partial on a bad mesh
  [verified]); a low-poly cage with a span at every joint, weighted and transferred (Dikko
  [00:23:01]); rigid parts assigned manually (BajO2vgto80 [00:01:24]); Voxel Heat Diffuse add-on
  (paid, merges close appendages; Dikko [00:45:32]). [added, verified] Voxel-remeshed proxy + Data
  Transfer, coarser voxels if the source has holes.
- **Clothes and accessories.** Auto weights on separate pieces fail by proximity (bands slide, rings
  slide, hands pull the shirt); transfer from the same cage or body to every piece, apply the Data
  Transfer, smooth all pieces with the same settings (Dikko [00:35:34] to [00:43:54]; CGDive
  whiskers FhF54DZY34U [02:30:39]). Detail meshes riding the body: Surface Deform (Demeter
  [00:02:09]).
- **Rigid parts.** Eyes, teeth, lashes, hard-surface islands: Remove from All Groups, assign 1.0 to
  one bone (CGDive FhF54DZY34U [01:42:31], 6zGVAStZP50 [00:18:02]); tongue on a shared mesh: Assign
  Automatic From Bones with only tongue vertices and bones selected (FhF54DZY34U [01:45:56]). With a
  Mirror modifier, a group named exactly `DEF-eye.R` is filled by vertex-group mirroring (Demeter
  [00:29:50]).
- **Deform flags** audited before (re)binding: root, IK targets and poles deforming pull the heel
  (tNW8uCs77MQ [00:05:37]). Undo automatic weights completely: clear parent, delete Armature
  modifiers, delete all groups (6zGVAStZP50 [00:01:50]). Parent With Empty Groups adds new deform
  bones without wiping painted weights (ykB4gBQgFOU [00:03:02]).
- **Modifier stack.** Armature above Subdivision (Demeter [00:20:00], Dikko [00:03:40]). Corrective
  Smooth: "unironically though I do recommend corrective smooth even for production", disabled while
  painting (Demeter [00:45:37]); Blender-only (CGDive SSL4mBAVaQc [00:04:06]).
- **Preserve Volume.** Fixes candy wrappers, bulges armpits and hips; confine it with a second
  Armature modifier without it, Multi Modifier on, painted `preserve` mask; the older inverted-group
  method distorts when the root moves (CGDive n_waiAcd8xY [00:00:48], [00:01:53]). Support bones
  improve auto weights for quick jobs but add groups to manage (rf3NDKXYpTk [00:02:50]).

## 5. Corrective shape keys

- Shape keys are linear offsets from the Basis and they add, which is what makes combinations work
  (82R2SjUxH2s [00:02:47], [00:03:21]). Make them after modeling, rigging and weights (82R2SjUxH2s
  [00:00:28]). A corrective only needs to look right in its pose: "Outside of it, it's nonsense"
  (7fHpWhM4rtc [00:03:05]).
- Drive from the bone active in both IK and FK (MCH main chain), shape the driver curve with a flat
  start so it kicks in late and reaches exactly 1 at the extreme, `-var` when roll makes the value
  negative, and drive ball joints from a swing-only bone (the first upper-arm twist) to avoid flips
  under twist (7fHpWhM4rtc [00:04:26], [00:08:40], [00:12:51], [00:18:02]).
- Sculpting in the posed state needs the Armature modifier shown in Edit Mode / on cage (7fHpWhM4rtc
  [00:02:29]); Pose Shape Keys (Demeter's add-on) duplicates the posed mesh, you sculpt, it writes
  the rest-space key and drivers (Rik _Ov0pFIOpug [00:15:27]). [added, verified] Headless
  equivalent: inverse skinning through the measured Jacobian, then smooth the displacement (the
  Smooth-brush pass) or the crease spikes.

## 6. Faces

- **Choose by purpose and style.** Rigify face for realistic or mildly stylized characters and many
  characters; hybrid bones + shapes for a stylized hero that must stay on model; action-constraint
  face for studios with a generator (digest synthesis of CGDive, Demeter, Rik). Shape keys are the
  industry standard for faces; Stop Staring set (about 16 shapes) for hand animation, 52 ARKit
  shapes for capture (CGDive gsS0qRztOPg [00:00:33], [00:01:08]). Jaw and eyes as bones (gsS0qRztOPg
  [00:01:40]).
- **Rik Schutte's production face (Storm).** Never one technique: joints, a lip ribbon guide (an
  extracted edge loop, "just weighted geometry"), pose-space correctives, lattices for squash and
  puffs (_Ov0pFIOpug [00:07:45], [00:11:24]). Three-curve "football" weight profile: sharp corner
  falloff, overlapping linear middles, clean shapes from weights alone (_Ov0pFIOpug [00:18:52]). Lip
  bones Stretch To the ribbon, eyelid bones Damped Track (constant length, they stay on the
  eyeball), guide bones pinned by Copy Location to one-vertex groups (_Ov0pFIOpug [00:21:43],
  [00:25:09], [00:46:37]). Brow and cheek shapes authored with weights on a temporary armature, only
  correctives sculpted, left side built then mirrored (_Ov0pFIOpug [00:30:48], [00:31:22]). Lock the
  depth axis on brow and mouth-corner controls and give depth its own control (_Ov0pFIOpug
  [00:34:11]). Widgets that ride the skin through Override Transform on a helper bone, which breaks
  the widget-drives-shape cycle; trade-off: F-curves then mix rotation and translation (_Ov0pFIOpug
  [00:39:32], [00:45:25]). Collections global / local / micro follow the animation workflow
  (_Ov0pFIOpug [00:47:11]).
- **Demeter.** There is no generic stylized face: "good luck ... I tried and I failed" (f6im_0QVeuo
  [00:34:46]). A single ring of lip bones cannot make a good smile: add an outer ring; lower lip
  fully to the jaw and upper lip to the head first, then lip bones with Multi-Paint; rotate the jaw
  open and paint so the mouth vertices visibly jump to the jaw; Sphere falloff when the view is
  inside the mesh (f6im_0QVeuo [00:36:25] to [00:43:27]).
- **CGDive bone face.** Lids follow the eye at about 0.15 (Copy Rotation Local, Mix Add), mouth
  corners follow the jaw at 0.5 through an MCH jaw copy, eye master + target with Damped Track, jaw
  master moved instead of rotated (ykB4gBQgFOU [00:06:55], [00:09:22]; A147p_zDwO4 [07:22:52]). Eye
  targets too close make the eyes react too fast (A147p_zDwO4 [07:29:45]); extend half-sphere eyes
  so extreme rotations do not show the edge (gsS0qRztOPg [00:11:21]).
- **CGDive shape-key face.** Wide follows the teeth horseshoe; smile sculpted on top of wide at 1;
  brows down as its own key (the skull), inner-brow-down seeded from inner-up at -1 via New Shape
  From Mix, which copies the whole MIX, so isolate the source first; test combinations (smile + jaw
  open) (gsS0qRztOPg [00:27:34] to [00:47:20]). L/R split with smoothed half-face groups on
  duplicated keys (gsS0qRztOPg [00:44:32]). On-face SK- bones flipped so the useful move is +Y, one
  bone drives several keys by axis and sign (`var` smile, `-var` frown, clamped by the key range),
  Limit Location with Affect Transform, right side width needs `-var` (gsS0qRztOPg [00:55:59] to
  [01:02:12]).
- **Rigify face** needs the parameter tuning in section 2; eyelids "are always problematic": isolate
  the upper lid, paint lightly on the outer lid bone to remove the zigzag (CGDive FhF54DZY34U
  [01:40:44]). Collar clipping into the neck: light positive weight on the first neck bone
  (FhF54DZY34U [01:49:53]).

## 7. Mechanical and special rigs

- Fundamentals are "no different": pivot, roll, weights; hinge joints XYZ Euler with Y/Z locked (FK)
  and IK locks (IK) (2XwZWJ_Hnac [00:00:32]; BajO2vgto80 [00:05:30], [00:14:20]). Split hard parts
  into islands and assign each to one bone; a slight pinch from an unsmoothed two-group seam reads
  as a hard part under soft material (BajO2vgto80 [00:01:24], [00:07:08]).
- Before automating, "ask yourself, is it worth it?" (2XwZWJ_Hnac [00:13:37]). Three equal ways to
  automate an elbow plate at 20% of the forearm: driver (locks the channel), Copy Rotation influence
  0.2 Mix Add, Transformation 0..100 to 0..20 deg (2XwZWJ_Hnac [00:14:57] to [00:20:40]).
- Action constraint: AC_ action, keys 1 and 10, all Linear, fake user, unlinked from the rig, target
  local Y with max = measured control travel, constrained bones stay animatable; Limit Location with
  Affect Transform or a control dragged past its limit "goes dead" (2XwZWJ_Hnac [00:24:24],
  [00:40:08], [00:43:48]).
- Clean control-bone vertex groups: lock the DEF groups, delete unlocked (2XwZWJ_Hnac [00:05:29]).
- Ball rig: never rotate a scaled (stretched) bone, rotate a clean bone below the stretch; Euler for
  multi-turn spins; a quaternion counter-rotation (X/Y/Z = source, W = -source) cancels a parent
  rotation exactly; cancel inconsistencies are "a clear sign of a dependency loop" (HyD7dI0J_bA
  [00:17:50], [00:24:00], [00:19:37]; counter-rotation verified).
- Turret aim widget: Damped Track back to the turret creates a cycle; put the tracking on an MCH
  copy and show it through the control's Override Transform (Wayne AymxOGtJoew [00:38:28] to
  [00:42:21]).

## 8. Fundamentals as pitfalls (Wayne Dixon)

- Three roles: control, deform, mechanism; deform is on by default, turn it off everywhere else
  (AymxOGtJoew [00:06:17]). Name everything, never leave .001 (it breaks the L/R rhythm, batch
  renames and scripts) (AymxOGtJoew [00:09:48]).
- "If your rig is fit for purpose, you're done"; restrict only what breaks the rig or does nothing;
  do not add a floor constraint the animator must fight (AymxOGtJoew [00:10:53], [00:13:03]).
- Constraint stacks evaluate top to bottom; midpoint = Copy Location 1.0 then 0.5 ([00:22:16]; for n
  targets use 1, 1/2, 1/3 [added, verified]). A constrained bone cannot be animated: "Give it a
  parent, constrain the parent" ([00:28:31]). IK traps: constraint on the wrong bone, target inside
  the chain, chain length 0 climbs the hierarchy, IK Stretch 0.1 is "always fine" ([00:33:24] to
  [00:37:14]).

## 9. Disagreements and the deciding condition

| Topic                      | Positions                                                                                                                                                                                         | Decide by                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Face system                | Rigify modular face (CGDive, Ivan); hand-built face with action constraints (Demeter); hybrid bones + ribbon + shape keys + lattices (Rik); bones + ~16 shape keys + on-face controls (CGDive L3) | realism and number of characters vs a stylized hero that must stay on model; mocap (ARKit) vs hand animation |
| Twist                      | 1 twist + Preserve Volume (CGDive L2) vs 4 twists (L3)                                                                                                                                            | export or thick limbs: chains                                                                                |
| Colors                     | function colors (Rigify) vs left red/right blue (CGDive Rigify course, L1/L2) vs left blue/right red (CGDive L3)                                                                                  | ask the animator; keep one convention per rig                                                                |
| Finger controls            | master curls, scale to curl (CGDive) vs plain FK only (Demeter)                                                                                                                                   | crowd/fast animation vs feature animators posing fingers                                                     |
| Connect Chain on neck/tail | on in presets vs off (CGDive: small tweak, sometimes problems)                                                                                                                                    | keep on only with an exactly coincident joint                                                                |
| Weight blocking            | absolutes then smooth (Dikko) vs low-strength touch-ups (CGDive) vs painting in pose (Demeter)                                                                                                    | from scratch or dense mesh vs fixing auto weights                                                            |
| Accessories                | Surface Deform (Demeter) vs transfer from body/cage and apply (Dikko, CGDive)                                                                                                                     | loose detail vs tight clothing                                                                               |
| Pose-driven deformation    | action constraints (Demeter) vs pose-space shape keys, no action constraints (Rik)                                                                                                                | bone-based vs shape-key-based faces                                                                          |
| Limb isolation             | Mix Add with Local With Parent (one bone fewer) vs follow bone with World constraints (CGDive's choice)                                                                                           | the trusted, root-safe version: follow bone                                                                  |
