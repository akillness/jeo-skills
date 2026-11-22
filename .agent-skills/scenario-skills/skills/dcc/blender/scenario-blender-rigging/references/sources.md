# Sources: scenario-blender-rigging

One entry per source video (grouped by expert). Timestamps are [hh:mm:ss] into the video. Blender
version on screen matters: anything recorded before 4.0 uses armature layers and bone groups (now
bone collections and per-bone colors).

## CGDive channel host (name not stated in the transcripts; Wayne Dixon calls him Toto) (CGDive, Blender Rigging Tuts)

Credential: rigging instructor, author of the free Rigging Isn't Scary course and the CGDive Academy
Rigify courses.

- **EASY Rigging with Blender Rigify: a Full Course** (FhF54DZY34U, 4:16:29, uploaded 2026-06-01,
  Blender 4.0, author says it also works in 5): https://www.youtube.com/watch?v=FhF54DZY34U
  - Best for: the fullest metarig-to-generated-rig Rigify workflow: fitting, generation errors and
    fixes, weighting, custom metarigs, UI and colors.
  - Best timestamps: [00:23:34] bone placement decides deformation, [00:57:37] fixing a "bone
    position disjoint" error, [01:30:26] weight-paint crash course, [03:35:23] bone collection UI
    rows.

- **Blender 5.2: NEW Rigging and Animation Features** (cERh1l2RtfU, 15:57, uploaded 2026-07-09,
  Blender 5.2 RC vs 5.1): https://www.youtube.com/watch?v=cERh1l2RtfU
  - Best for: a rigger-focused 5.2 changelog: what changed in bone creation, duplication and keying
    defaults.
  - Best timestamps: [00:00:28] Add Bone redo options, world-aligned Axes, [00:01:16] Duplicate and
    Rename for parallel chains, [00:02:28] improved Auto IK, [00:08:58] Only Insert Available now
    default on.

- **BEGINNER Blender Rigging Course (2026)** (Ldki5txSn5U, 54:19, uploaded 2026-04-08, Blender 4.x):
  https://www.youtube.com/watch?v=Ldki5txSn5U
  - Best for: the canonical build order for a first biped, with the three classic IK-leg bugs fixed
    inline.
  - Best timestamps: [00:07:48] leg chain placement, [00:17:46] IK leg setup, [00:22:15] foot sink
    and detach fixes, [00:29:54] root bone and deform flags.

- **NOVICE Blender Rigging Course (2026) [Reupload]** (FzQVpzXcFX0, 2:12:50, uploaded 2026-05-19,
  Blender 4.2+): https://www.youtube.com/watch?v=FzQVpzXcFX0
  - Best for: bone roll as a hinge-axis decision, wrist and shoulder twist mechanisms, the corrected
    preserve-volume mask, a bones-only face rig.
  - Best timestamps: [00:12:05] bone roll and hinge axis, [00:34:08] wrist twist with Damped Track
    override, [01:50:09] preserve-volume bulge fix, [02:01:01] face rig challenge.

- **University Level Rigging Course for Free! (2026)** (A147p_zDwO4, 8:21:01, uploaded 2026-05-26,
  Blender 4.3, 4.4 for slotted actions): https://www.youtube.com/watch?v=A147p_zDwO4
  - Best for: the single most complete manual biped build in the corpus, with reasons for every
    mechanism, twists, IK/FK, foot roll, DEF separation, mechanical arm, Action constraint, face.
  - Best timestamps: [01:07:02] IK/FK switch build, [01:41:17] six-pivot foot roll, [03:24:14] DEF
    bone separation pass, [06:12:07] Action constraint.

- **Rigging Sucks... but it makes your characters move!** (w8J_GnBYE8o, 18:33, uploaded 2025-03-28,
  Blender 4.x): https://www.youtube.com/watch?v=w8J_GnBYE8o
  - Best for: model check and the minimum-viable biped skeleton before any mechanism exists.
  - Best timestamps: [00:07:29] model check checklist, [00:08:02] armature at world origin, never
    moved, [00:14:35] parenting with Keep Offset, [00:16:01] automatic-weights bind order.

- **RIGGING L1-2: The No.1 Rigging Tool** (s7h1ECHrcSw, 8:46, uploaded 2025-03-29, Blender 4.x):
  https://www.youtube.com/watch?v=s7h1ECHrcSw
  - Best for: the minimum leg IK recipe and its two classic failure fixes, foot sink and foot
    detach.
  - Best timestamps: [00:01:57] IK on the shin, chain length 2, [00:03:05] pole target and pole
    angle, [00:05:44] foot-sink fix, [00:06:26] foot-detach fix.

- **RIGGING L1-3: Solid Weight Painting Workflow** (tNW8uCs77MQ, 13:45, uploaded 2025-03-30, Blender
  4.x, around the 4.3 brush-asset change): https://www.youtube.com/watch?v=tNW8uCs77MQ
  - Best for: the core weight-paint recipe used 80% of the time, plus root bone and deform-flag
    hygiene before binding.
  - Best timestamps: [00:01:33] brush recipe, [00:03:12] fixing spill via Auto Normalize, [00:04:37]
    root bone, [00:05:37] deform flags before binding.

- **Animation Basics** (xZSeusPWx6s, 9:36, uploaded 2025-03-31, Blender 4.x):
  https://www.youtube.com/watch?v=xZSeusPWx6s
  - Best for: a fast rig-acceptance test, a four-pose walk cycle plus a traveling root.
  - Best timestamps: [00:01:22] four-pose walk keys, [00:02:27] Paste Pose Flipped, [00:08:05]
    Linear interpolation for constant-speed travel.

- **Horse Rigging Challenge** (Sz0FhxaTAvE, 7:19, uploaded 2025-04-01, Blender 4.x):
  https://www.youtube.com/watch?v=Sz0FhxaTAvE
  - Best for: proof the biped IK recipe transfers unchanged to a quadruped, only anatomy and pole
    direction differ.
  - Best timestamps: [00:01:05] chain build for a horse, [00:02:53] hind-leg pole points the
    opposite way, [00:04:44] hoof parenting and Copy Location fix.

- **Rigging FUNDAMENTALS** (q-PRGvE1ico, 18:02, uploaded 2025-04-02, Blender 4.x):
  https://www.youtube.com/watch?v=q-PRGvE1ico
  - Best for: where joints go, volume-centered rather than anatomical, and why bone roll must map to
    one hinge axis.
  - Best timestamps: [00:05:02] bone placement in the volume, [00:07:29] clavicle pushed into body
    depth, [00:12:28] roll rule for hinge joints.

- **IK, Fingers, Bone Roll** (QnCo0hzXKeQ, 16:07, uploaded 2025-04-03, Blender 4.x):
  https://www.youtube.com/watch?v=QnCo0hzXKeQ
  - Best for: the finger and thumb roll-unification test and the IK-target dependency-loop trap.
  - Best timestamps: [00:02:03] rotate all fingers on Z to test roll, [00:09:15] Clear Parent fully
    on the IK target, [00:10:21] pole angle reasoning.

- **RIGGING L2-3: Constraints - Your Secret Weapon** (HhhSjGqetjo, 18:32, uploaded 2025-04-04,
  Blender 4.x): https://www.youtube.com/watch?v=HhhSjGqetjo
  - Best for: the two canonical single-twist-bone recipes, forearm and upper arm, plus the
    World/World or Local/Local space rule.
  - Best timestamps: [00:03:13] forearm twist Copy Rotation, [00:06:16] Damped Track override
    reduces flipping, [00:14:26] shoulder twist Damped Track Head/Tail 1.

- **RIGGING L2-4: Foot and Hips Rig** (PdTOfJDdzgc, 17:40, uploaded 2025-04-05, Blender 4.x):
  https://www.youtube.com/watch?v=PdTOfJDdzgc
  - Best for: the nested-pivot foot roll, IK target through ball, toe, heel pivots, and the
    constraint-plus-child pattern.
  - Best timestamps: [00:01:07] hips flip via Switch Direction, [00:07:30] nested pivot parenting,
    [00:12:28] toe Damped Track to pivot, [00:13:43] constraint plus child pattern.

- **RIGGING L2-5: Bone Shapes / Widgets** (aj_ACAE7K8I, 19:09, uploaded 2025-04-06, Blender 4.2+):
  https://www.youtube.com/watch?v=aj_ACAE7K8I
  - Best for: the three-role bone collection system, control/deform/MCH, widget-building recipes,
    and the world-oriented root convention.
  - Best timestamps: [00:02:51] three bone roles into collections, [00:06:02] widget mesh recipes,
    [00:15:36] world-oriented root, [00:17:50] wire width and color coding.

- **RIGGING L2-6: What you don't know about Weight Painting** (6zGVAStZP50, 20:05, uploaded
  2025-04-07, Blender 4.x): https://www.youtube.com/watch?v=6zGVAStZP50
  - Best for: what automatic weights actually creates, the full undo-and-redo recipe, and the
    area-by-area priority list.
  - Best timestamps: [00:01:50] fully undoing automatic weights, [00:03:02] deform-flag audit,
    [00:11:51] crotch and hips "red pants", [00:18:02] rigid teeth and eye assignment.

- **Cool Rigging Hacks** (SSL4mBAVaQc, 9:43, uploaded 2025-04-08, Blender 4.x):
  https://www.youtube.com/watch?v=SSL4mBAVaQc
  - Best for: Corrective Smooth as "the magic modifier," subdivision-last ordering, Euler versus
    quaternion for hinge bones.
  - Best timestamps: [00:01:06] first, flawed, preserve-volume mask attempt, [00:04:06] Corrective
    Smooth, [00:04:36] subdivision must be last, [00:08:25] gimbal-lock risk on wide-freedom bones.

- **Fix bad deformations with one click (Preserve Volume FIX)** (n_waiAcd8xY, 2:30, uploaded
  2025-07-22, Blender 4.x): https://www.youtube.com/watch?v=n_waiAcd8xY
  - Best for: the corrected preserve-volume mask, a second Armature modifier with Multi Modifier
    plus a painted mask.
  - Best timestamps: [00:00:48] Multi Modifier mask setup, [00:01:24] painting the preserve group,
    [00:01:53] why the original method broke on root movement.

- **RIGGING L2-8: EASY Face Rigging that even Beginners can do** (ykB4gBQgFOU, 12:54, uploaded
  2025-04-09, Blender 4.x): https://www.youtube.com/watch?v=ykB4gBQgFOU
  - Best for: a minimal, fully bone-based face rig (jaw, eyes, lids, brows, mouth corners) buildable
    entirely from constraint data.
  - Best timestamps: [00:01:25] jaw and eye bone placement, [00:06:55] lids follow the eyeball at
    0.15 influence, [00:09:22] mouth corners follow the jaw at 0.5.

- **RIGGING L3-1: Serious Rigging!** (Q21AZnAyOJA, 58:02, uploaded 2025-04-10, Blender 4.3):
  https://www.youtube.com/watch?v=Q21AZnAyOJA
  - Best for: a real model-check pass on a flawed model, the twist-bone count rule (4 per segment)
    with falloff numbers.
  - Best timestamps: [00:03:43] model check pass, [00:22:25] twist-bone count rule, [00:26:39]
    forearm twist chain with falloff, [00:46:25] Rigify-like spine build.

- **RIGGING L3-2: IK-FK Switch** (1nkCc3IhTYs, 39:20, uploaded 2025-04-11, Blender 4.3):
  https://www.youtube.com/watch?v=1nkCc3IhTYs
  - Best for: the three-chain IK/FK architecture, stacked Copy Transforms, and wiring custom
    properties and drivers to switch them.
  - Best timestamps: [00:02:18] stacked Copy Transforms principle, [00:25:59] rig_settings bone and
    custom property, [00:35:58] wiring the IK/FK driver.

- **RIGGING L3-3: Improved Leg Rig** (ErR4RysRy0g, 59:54, uploaded 2025-04-12, Blender 4.3):
  https://www.youtube.com/watch?v=ErR4RysRy0g
  - Best for: a single-control foot roll, why Inherit Rotation off is a trap, and a robust two-bone
    limb-isolation method.
  - Best timestamps: [00:10:04] one-control roll with Limit Rotation, [00:20:30] IK axis lock,
    [00:29:28] follow method 2, parent/follow MCH pair, [00:41:19] Copy Driver to Selected after
    symmetrize.

- **RIGGING L3-4: Easy Hand Rig** (_6eyk1vembQ, 46:58, uploaded 2025-04-13, Blender 4.3):
  https://www.youtube.com/watch?v=_6eyk1vembQ
  - Best for: Rigify-style finger curl via a Transformation constraint (scale to rotation) instead
    of a driver, plus palm falloff automation.
  - Best timestamps: [00:08:52] scale-to-rotation curl, [00:17:58] palm falloff automation,
    [00:22:01] root parenting audit, [00:35:06] asymmetric alignment with X mirror off.

- **RIGGING L3-5: This makes using your Rig EASIER** (doRG4Sko7Kg, 1:02:25, uploaded 2025-04-14,
  Blender 4.3): https://www.youtube.com/watch?v=doRG4Sko7Kg
  - Best for: the full DEF-bone separation pass for clean game export, plus the DEF/MCH/CTRL
    collection plan.
  - Best timestamps: [00:05:49] duplicating deform bones into DEF, [00:16:33] rebuilding a logical
    DEF hierarchy, [00:42:22] widget Y-axis orientation, [00:49:11] Override Transform for a
    detaching widget.

- **RIGGING L3-6: Pro Weight Painting** (rf3NDKXYpTk, 54:19, uploaded 2025-04-15, Blender 4.3):
  https://www.youtube.com/watch?v=rf3NDKXYpTk
  - Best for: the remaining 20% of weight painting, Projected falloff, test-animation-driven fixes,
    exact-0.5 Mix-brush seams.
  - Best timestamps: [00:06:35] Projected falloff to paint through, [00:17:33] hip and crotch test
    animation, [00:33:28] Mix brush at weight 0.5 for exact seams.

- **RIGGING L3-7: Hard-Surface Weights** (BajO2vgto80, 30:12, uploaded 2025-04-16, Blender 4.3):
  https://www.youtube.com/watch?v=BajO2vgto80
  - Best for: what to do when Bone Heat weighting fails, splitting rigid parts, hardening weights
    with Levels plus Normalize All.
  - Best timestamps: [00:01:24] splitting and assigning rigid parts, [00:14:20] IK and Euler locks
    for hinge joints, [00:28:56] mandatory Normalize All after Levels.

- **RIGGING L3-8: Mechanical Rigging** (2XwZWJ_Hnac, 48:32, uploaded 2025-04-17, Blender 4.4):
  https://www.youtube.com/watch?v=2XwZWJ_Hnac
  - Best for: three equivalent ways to automate a mechanism (driver, Copy Rotation, Transformation
    constraint) and the full Action constraint workflow.
  - Best timestamps: [00:14:57] three automation options compared, [00:22:03] Action constraint
    theory, [00:42:42] Limit Location with Affect Transform.

- **Shapekeys for Beginners in 7 Minutes** (82R2SjUxH2s, 7:07, uploaded 2025-05-28, Blender 4.4
  era): https://www.youtube.com/watch?v=82R2SjUxH2s
  - Best for: the shape-key mechanics that matter for rigging, linear per-vertex offsets, additive
    mixing, overshoot ranges.
  - Best timestamps: [00:02:47] vertices move linearly from Basis, [00:03:21] mixing is additive,
    not averaging, [00:04:03] overshoot with Range Max/Min.

- **Improve Deformations with Shapekeys** (7fHpWhM4rtc, 19:47, uploaded 2025-05-29, Blender 4.4
  era): https://www.youtube.com/watch?v=7fHpWhM4rtc
  - Best for: the full corrective-shape recipe, sculpt in the bent pose, drive from the shared MCH
    bone, shape the driver curve.
  - Best timestamps: [00:04:26] driver from the MCH chain bone shared by IK and FK, [00:07:33]
    shaping the driver F-curve, [00:17:27] driving from a non-twisting bone for stability.

- **All-In-One FACE Rigging Tut for Blender** (gsS0qRztOPg, 1:14:26, uploaded 2025-06-06, Blender
  4.4 era): https://www.youtube.com/watch?v=gsS0qRztOPg
  - Best for: the most complete hybrid face rig here, bones for jaw/eyes/tongue plus about 16 shape
    keys, L/R splitting, on-face controls.
  - Best timestamps: [00:19:01] tongue squash-and-stretch chain, [00:23:33] shape creation order,
    [00:43:50] L/R shape-key splitting, [00:48:49] on-face SK_ controls and drivers.

- **What makes this the ULTIMATE Ball rig for Blender?** (HyD7dI0J_bA, 29:42, uploaded 2026-03-23,
  Blender likely 5.x): https://www.youtube.com/watch?v=HyD7dI0J_bA
  - Best for: a compact, fully specified rig, keeping rotation smooth under non-uniform stretch via
    a counter-rotation quaternion driver.
  - Best timestamps: [00:07:20] Stretch To plus Copy Rotation wiring, [00:08:29] counter-rotation
    quaternion driver, [00:19:37] dependency-loop diagnosis, [00:28:07] rescaling procedure.

- **The only addon you need for Rig UIs (NO Scripting!)** (AZF5DbR5iWU, 14:49, uploaded 2025-07-29,
  Blender 4.2 to 4.4): https://www.youtube.com/watch?v=AZF5DbR5iWU
  - Best for: packaging a rig UI with the free Bone Manager add-on, and the Register step that
    survives reopening the file.
  - Best timestamps: [00:01:26] tick collections and lay out UI rows, [00:04:47] export the UI as a
    Python script, [00:12:53] Register the text block.

- **Confused by Blender Updates? Watch this.** (DkhW50q0uAg, 14:16, uploaded 2025-07-10, spans 2.49
  through the 4.5 era): https://www.youtube.com/watch?v=DkhW50q0uAg
  - Best for: a translation table for reading pre-4.0 rigging tutorials in current Blender.
  - Best timestamps: [00:00:29] bone layers to bone collections, [00:01:49] bone groups to bone
    colors, [00:04:57] weight-paint click conventions since 4.0, [00:08:40] slotted actions
    explained.

## Demeter Dzadik (Blender, BCON22)

Credential: character rigger at the Blender Animation Studio (Rain, the Settlers characters, Sprite
Fright, Snow), author of CloudRig, EasyWeight and Pose Shape Keys.

- **Rigging with the Blender Studio tools** (f6im_0QVeuo, 53:37, uploaded 2022-10-29, Blender
  3.3/3.4 era): https://www.youtube.com/watch?v=f6im_0QVeuo
  - Best for: a real studio rigger's loop, metarig plus generator, EasyWeight hotkeys, and the
    action-constraint pose system with correctives.
  - Best timestamps: [00:05:53] generate early and often, [00:10:10] chain curvature decides the IK
    pole, [00:21:36] EasyWeight weight-paint keymap, [00:46:43] action-constraint pose setup with
    correctives.

## Rik Schutte (Blender, BCON25)

Credential: animator 10+ years (Sony Pictures Imageworks: Smallfoot, Vivo, Into the Spider-Verse;
Blender Studio since Sprite Fright), teaches a facial animation course at Animschool.

- **Facial Rigging for Stylized Character Animation** (_Ov0pFIOpug, 49:32, uploaded 2025-09-17,
  Blender 4.5 / 5.0 alpha): https://www.youtube.com/watch?v=_Ov0pFIOpug
  - Best for: a production hybrid face-rig architecture (bones plus ribbon guides plus shape keys
    plus lattices) from Blender Studio's Storm, and a dependency-cycle-free widget trick.
  - Best timestamps: [00:17:44] mouth ribbon-guide architecture, [00:18:52] three-curve weight
    falloff principle, [00:25:09] eyelid Damped Track versus lip Stretch To, [00:38:58]
    override-transform widget breaks a dependency cycle.

## Ivan Cappiello (Blender, BCON24)

Credential: co-founder of an Italian animation studio (features, TV, VFX), former Rigify maintainer
(2016 to 2019) and designer of Rigify's rig types, including the original modular face.

- **Rigify: past, present and future of Blender rigging** (LLnXBvEnG7o, 1:13:44, uploaded
  2024-10-24, Blender 4.2/4.3 era slides): https://www.youtube.com/watch?v=LLnXBvEnG7o
  - Best for: the design logic behind Rigify's building-block metarigs, why the modular face
    replaced the fragile name-based one, and what glue/anchor bones require.
  - Best timestamps: [00:05:21] Rigify as building blocks, not one click, [00:34:23] why name-based
    rigging is fragile, [00:43:31] anchors and glue bones explained, [00:50:25] glue exactness
    requirement.

## Wayne Dixon (Blender, BCON25)

Credential: animation and rigging instructor at CG Cookie, freelance animator and rigger, maintainer
of the Bone Widget add-on.

- **Rigging Cheat Codes** (AymxOGtJoew, 52:31, uploaded 2025-09-19, Blender 4.5):
  https://www.youtube.com/watch?v=AymxOGtJoew
  - Best for: rigging fundamentals framed as beginner mistakes: naming, constraint stack order,
    intermediary parents, IK pitfalls, override transforms.
  - Best timestamps: [00:06:17] the three bone roles, [00:21:44] constraint stack evaluates top to
    bottom, [00:25:48] intermediary-parent pattern, [00:38:28] override transform to break a cycle.

## Dikko (YouTube)

Credential: character artist and rigging tutor (Australian YouTube educator).

- **Character Rigging in Blender 12: Weight Painting Tips** (ljW9YJeA79E, 1:00:22, about 52 minutes
  of content, uploaded 2021-09-10, Blender 2.93 era): https://www.youtube.com/watch?v=ljW9YJeA79E
  - Best for: a "block with absolutes then smooth" weighting strategy, and a low-poly cage whose
    weights transfer identically to every clothing piece.
  - Best timestamps: [00:12:25] block absolutes, leave joints unpainted, [00:23:01] low-poly cage
    design, [00:28:55] Data Transfer modifier workflow, [00:45:00] Voxel Heat Diffuse Skinning
    shortcut.

## Coverage gaps

Writer's assessment, based on what the notes' "Value" lines flag as thin or absent:

- Quadruped and non-human Rigify beyond the wolf, cat and horse presets named in passing: no note
  fits a full animal metarig end to end, only a dog face crossover inside the human course.
- Game-engine export and retargeting: DEF hierarchies are built "likely compatible with Unity
  humanoid" but no note walks an actual FBX export or engine-side retarget.
- Cloth, hair and secondary jiggle motion: only the 5.2 XPBD Cloth/Hair Dynamics modifiers are
  mentioned in passing; no spring-bone or physics-driven secondary-motion technique is taught.
- Motion-capture retargeting and cleanup: ARKit's 52 blendshapes are named as a capture target, but
  no note covers driving a rig from live mocap or retargeting between skeletons.
- Non-destructive rig regeneration at production scale is discussed at the design level (Ivan
  Cappiello) but never demonstrated hands-on.
