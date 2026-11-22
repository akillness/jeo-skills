# Critique rubric: scenario-blender-rigging

Run at every gate. Severity: **blocker** (rig unusable or silently wrong: fix before anything else),
**major** (an animator or a lead would send it back), **minor** (polish; note it in the report).
Numbers come from `bx_rig`; visual items need the named render opened with the image reader.
Thresholds marked [added] are the skill author's calibration on the test mannequin and Snow, not
expert numbers.

## A. Model and placement (before generating or binding)

| Check                    | Measure                                                                         | Pass                                                                                                                 | Severity                   | Source          |
| ------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------- |
| Model check              | `model_check(objs)["problems"]`                                                 | empty; about 1.8 m adult, feet Z=0, faces -Y                                                                         | blocker                    | CGDive          |
| Joints in the volume     | `check_metarig(meta, body)` "outside the mesh"; placement sheet front/right/top | spine, limbs, neck inside; spine near the body middle in side view                                                   | major                      | CGDive, Demeter |
| Knee and elbow pre-bend  | `bend_angle`; `check_metarig`                                                   | 1 to 15 deg, knee forward, elbow back, straight in the other view                                                    | blocker (IK direction)     | CGDive, Demeter |
| Hinge roll               | `check_metarig` "hinge not on local X"; `hinge` test pose bends the right way   | dot >= 0.98                                                                                                          | major                      | CGDive          |
| Chain integrity          | `check_metarig` "disjoint" and glue checks                                      | none                                                                                                                 | blocker (generation fails) | CGDive, Ivan    |
| Finger fist test (Human) | hinge every phalanx on local X in a render                                      | clean fist, knuckles aligned, thumb curls in                                                                         | major                      | Demeter         |
| Face fit (Human)         | head-zoom placement sheet                                                       | lids around the eyeball, lip bones mid-lip, corners coincident, jaw pivot at the hinge, nose and chin on the surface | major                      | CGDive          |
| Metarig scale and pose   | `check_metarig`                                                                 | scale 1, pose = rest                                                                                                 | blocker                    | CGDive          |

## B. Rig structure and usability

| Check                         | Measure                                                                                              | Pass                                                              | Severity                 | Source         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------ | -------------- |
| Generation                    | `generate()`                                                                                         | no error; metarig hidden; rig named consistently for regeneration | blocker                  | CGDive         |
| Deform hygiene                | only DEF bones deform; `weight_report()["non_deform_groups"]`                                        | empty                                                             | major                    | Wayne, CGDive  |
| Dependency cycles             | `static_cycles`, `cycle_check`                                                                       | none                                                              | blocker ("not optional") | CGDive         |
| Root follows everything       | `root_test`                                                                                          | error < 1e-4                                                      | blocker                  | CGDive         |
| IK                            | chain 2, pole angle error < 1e-3, target not in its chain, IK Y/Z locked on realistic hinges         | yes                                                               | major                    | CGDive, Wayne  |
| FK/IK                         | chains coincide at rest (< 1e-4); switches exactly 0 or 1; defaults set in the property UI           | yes                                                               | major                    | CGDive         |
| Drivers                       | all `is_valid`; left and right counts equal after Symmetrize                                         | yes                                                               | major                    | CGDive         |
| Controls visible and readable | render with In Front off; widgets outside the mesh, side colors, MCH/DEF hidden, UI row set (Rigify) | yes                                                               | minor to major           | CGDive, Wayne  |
| Manual control kept           | automated bones still keyable (constraint plus child, Mix Add, Transformation)                       | yes                                                               | major                    | CGDive         |
| Fit for purpose               | every feature is one the brief or animator needs                                                     | nothing gratuitous                                                | minor                    | Wayne, Demeter |

## C. Weights (numbers)

| Check           | Measure                                                                                    | Pass                 | Severity                           |
| --------------- | ------------------------------------------------------------------------------------------ | -------------------- | ---------------------------------- |
| Heat failure    | `weight_report`: `unweighted`, `empty_major`                                               | 0, []                | blocker                            |
| Cross-side leak | `deformation_report` leak on one-sided poses                                               | < 0.001 H [added]    | major                              |
| Normalization   | `sum_dev`                                                                                  | 0                    | minor in Blender, major for export |
| Influences      | `max_influences`, `over4`                                                                  | <= 4 for game export | major (export)                     |
| Rigid parts     | each rigid island exactly one group at 1.0; `rigid_check` < 1e-4                           | yes                  | major                              |
| Garments        | weights from the same source as the body, Data Transfer applied, no Armature before Mirror | yes                  | major                              |
| Garment depth   | `garment_depth` over the test poses, against the rest pose                                 | 0 over 5 mm [added]  | major                              |
| Symmetry        | `mirror_err` on symmetric meshes                                                           | < 0.05               | minor                              |
| Stack           | Armature after Mirror, before Subdivision / Corrective Smooth                              | yes                  | major                              |

## D. Deformation (numbers guide, renders decide)

Run `deformation_report` + `flag_report` on `RIGIFY_POSES` (or the rig's own library), then
`pose_sheet` and `joint_sheet` at every flagged pose. Joint band ratios below are [added]
calibrations: linear skinning on a clean mesh measured 0.47 (arm down, shoulder), 0.68 (elbow 120),
0.73 (knee 120).

| Pose                           | Look for (render)                                                 | Numbers                                  | Severity if bad         | Expert          |
| ------------------------------ | ----------------------------------------------------------------- | ---------------------------------------- | ----------------------- | --------------- |
| Arm down                       | chest caving, armpit crushed ("This is hideous")                  | shoulder band < 0.6                      | major                   | CGDive          |
| Arm up + clavicle 20 to 30 deg | deltoid bulge, shirt sleeve lifting off, back of shoulder tearing | bulge > 1.25, garment self-intersections | major                   | CGDive          |
| Elbow / knee 120               | pointy or collapsed joint, inner crease interpenetration          | band < 0.85                              | major (fix: corrective) | CGDive          |
| Wrist twist 80                 | candy wrapper, sudden twist at the wrist                          | band < 0.9                               | major                   | CGDive          |
| Leg forward / side             | groin collapse, butt loses volume, other leg moving               | leak, band                               | major                   | CGDive          |
| Squat (IK feet planted)        | feet sliding or sinking, knee popping, pants intersecting         | foot IK displacement 0                   | major                   | CGDive          |
| Spine twist / bend             | waist gaps, jacket hem breaking                                   | strain outside 0.5 to 1.6                | minor to major          | Demeter         |
| Head turn / nod                | collar clipping, face dragged by neck weights, teeth poking       | new self-intersections                   | major                   | CGDive          |
| Jaw open (face)                | chin distortion, teeth and tongue following                       |                                          | major                   | CGDive, Demeter |
| Blink, smile                   | lid zigzag, creepy smile, lower lid over-following                |                                          | major                   | CGDive          |
| Fist (Human)                   | knuckles misaligned, thumb through the palm                       |                                          | major                   | Demeter         |

Firm is acceptable: slight intersection with firm deformation beats rubbery weights (CGDive). A pose
outside the anatomical range is not a failure (CGDive: test the shoulder within about 20 to 30 deg).

## E. Correctives and faces

| Check                                                                                                                                      | Pass     | Severity       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------- |
| Corrective 0 at rest, 1 at the extreme, partial and late in between (e.g. 0.4 at 70 deg for a 40 to 115 deg ramp)                          | yes      | major          |
| Corrective driven from bones valid in IK and FK; ball joints from a swing-only bone                                                        | yes      | major          |
| Corrective render clean at the pose (no crease spikes, no bump outside the joint)                                                          | yes      | major          |
| Mirrored side exists and fires only on its side                                                                                            | yes      | major          |
| Face shapes: each 0 at rest, full travel gives 1, opposing keys never both on, L + R at 1 equals the symmetric shape, split seam invisible | yes      | major          |
| Combinations tested (smile + jaw open, blink + squint)                                                                                     | rendered | major          |
| On-face controls: locked channels, Limit Location with Affect Transform, depth on its own control for stylized faces                       | yes      | minor to major |

## F. Report honesty

- State the route taken (auto weights or proxy, and why), the numbers from `weight_report` and
  `flag_report`, and link the placement, pose and joint sheets.
- Say what was coarse or unverified: face fit from similarity, fingers not individually fitted,
  poses outside the tested library, GUI-only checks (rig UI panel with Auto Run, real brush
  painting).
- Never call a rig done without having opened a pose sheet and the joint close-ups.
