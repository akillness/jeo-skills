# Critique rubric: realistic characters and creatures

Use at every gate. Each row says what to measure in code, what to judge on which render, and how to
fix it. Metrics marked [added] are this skill's own translation of an expert rule and are not
calibrated: compare a stage with the previous stage, a before copy or a reference head exported the
same way, and let the renders decide. Severity: **blocker** (fix before the next stage: later stages
inherit it), **major** (fix in this stage), **minor** (note it, fix when passing by).

Standard renders:

- The review sheet: `zb_review.review`, MatCap Gray, with front, right (profile),
  `view_facing("-Y")` (below), three-quarter and back.
- A raking-light close-up per region.
- `blurred`, `thumbnail` (128 px) and `upside_down` copies of the front view.
- For skin: the three-light SSS render from scenario-zbrush-paint-render (portrait key, from below,
  flat front: Costa j5XLtLMN0P8 00:19:51, 00:31:12).

## 1. The face, in Kingslien's order (6wiDxO-ZADg)

Walk the steps in order and stop at the first failure: "almost everything that's right or wrong in
this face is also right or wrong back in the beginning" (01:37:20). Ears are not in his order: he
names them only as a premature detail (00:31:33).

| #   | Step                                                       | Measure                                                                  | Judge on                                                                                                                       | Fix (procedure)                                                                                                                                   | Severity |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Cranial versus facial mass (00:31:15-00:34:15)             | `brow_step_deg` small and the profile one smooth arc = egg [added]       | profile: the facial plane reads as a flat face set into the cranium ("Pacman"), not features on an egg                         | Move-only pushes on a budget, then clay (C2)                                                                                                      | blocker  |
| 2   | Facial plane (00:36:00)                                    | none reliable                                                            | three-quarter: the plane runs along cheek, zygoma, depressor anguli and brow                                                   | ClayBuildup Z 20 strokes on the plane border (C3)                                                                                                 | blocker  |
| 3   | Flat of the cheek (00:38:45)                               | two-line fit of the half section at zygoma height beats a circle [added] | front and three-quarter: a side plane going back in space                                                                      | short strokes on the side plane (C3)                                                                                                              | major    |
| 4   | Jaw (00:38:50, 00:46:42)                                   | gonial corner visible in `front_profile` [added]                         | profile: triangular jaw, back of the jaw sculpted, angle present                                                               | two-point strokes on jaw line and ramus (C3), Move (C4 A)                                                                                         | major    |
| 5   | Forehead box (00:40:39-00:42:58)                           | `forehead_box` below the previous stage [added]                          | front and top: a box that breaks down into the brow, separated from the round cranium                                          | TrimAdaptive Z 100, Focal Shift -83 on the front plane; bevel the corner at the external angular process                                          | major    |
| 6   | Maxilla cylinder, chin, jaw separation (00:43:31-00:46:42) | `maxilla_sagitta` above the previous stage [added]                       | below: the column round; front: a groove between cheek and muzzle                                                              | one long clay stroke per side with symmetry, rounding strokes, dig the chin (C3)                                                                  | blocker  |
| 7   | Nose (00:49:14-00:50:59)                                   | bridge narrower than the alar base on `front_section` [added]            | front and below: bridge smaller than the base; the procerus "capital" at the root                                              | masked or auto-masked Move pull; Size X on the base (C4)                                                                                          | major    |
| 8   | Nostril around the wing (00:54:07-00:57:33)                | none                                                                     | three-quarter and below: an alar facial juncture triangle; no bump, no cartoon hole                                            | two or three short strokes beside the wing, not on it, Imbed lowered                                                                              | minor    |
| 9   | Form-clue line around the wing (00:59:02)                  | none                                                                     | front against a before copy: more "form, shape, distinction" (01:00:38)                                                        | one line, then a trim stroke (C3 trim)                                                                                                            | minor    |
| 10  | Eye socket (01:03:55-01:09:00)                             | deepest orbit point in the upper half of the orbit [added]               | below: the infraorbital margin shows "a one curve and a two curve"; front: nasojugal groove with depth; eye high and protected | curved strokes whose ends hook into the orbit; remove any lump ("tumor")                                                                          | blocker  |
| 11  | Brow (01:09:55-01:11:45)                                   | `brow_step_deg` [added]                                                  | profile: superciliary arch with the orbit carved beneath; a small male hook; temporal line                                     | short carve strokes plus one temporal-line stroke                                                                                                 | major    |
| 12  | Mouth barrel (01:12:20-01:18:32)                           | `lip_dominance` > 0; `chin_slope_deg` > 0 ("quite sloped") [added]       | profile: upper lip over the lower; front: marionette line tucks the lower lip                                                  | ordered lines: mouth line (Standard, Dots, Z 25), lip planes, lower-lip columns, depressor nodule, marionette, upper-lip fiber line, five pillows | major    |
| 13  | Mouth corner as a donut (01:19:56)                         | none                                                                     | three-quarter: the corner is blended into chin and depressor anguli, not pasted on                                             | fan of short strokes out from the corner (Sculptris Pro off), then Inflat Z 10                                                                    | minor    |
| 14  | Masseter and cheek (01:22:46)                              | none                                                                     | front: cheek edges moved together, cheek not "resolved"                                                                        | strokes on the borders only                                                                                                                       | minor    |
| 15  | Malar line (01:24:31)                                      | none                                                                     | three-quarter: cheekbones read                                                                                                 | a band stroke, then a trim along its lower edge                                                                                                   | minor    |
| 16  | Upper lid (01:28:37)                                       | none                                                                     | front: one simplified lid line; small gap between lid lines; parts tucked up                                                   | one curved stroke per lid, a small upward Move                                                                                                    | major    |
| 17  | Nasolabial area and nostrils (01:33:42-01:36:13)           | nostrils inside the alar crease in the front silhouette [added]          | three-quarter: planes delimited from both sides, a trough kept; nostrils tucked under                                          | plane strokes from both borders, then a low blend                                                                                                 | major    |
| 18  | Process (00:20:29)                                         | `MoveBudget.report`: no retouched region, within budget                  | the stroke log                                                                                                                 | undo to the stage's morph target and replan                                                                                                       | major    |

Canon ratios, from Anatomy For Sculptors, feed step 1. Check them with `head_ratio_check` on
landmarks from `profile_landmarks` or markers:

- crown to hairline 1/6 H;
- then three equal thirds;
- the lower third split in three;
- eyes at 1/2 H. Tolerance is plus or minus 5 percent of H [added]. Stylized heads: record which
  ratio is broken on purpose (`deliberate=`).

## 2. Costa's form evaluation (j5XLtLMN0P8 00:04:44)

Run it after every secondary stage and at delivery. It is visual; the derived images do the work.

| #   | Check                                                       | Image                                                                       | Pass when                                                                                                    |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Blur-eyed read (00:09:18)                                   | `blurred` front and profile                                                 | head shape, distances and planes right with no detail visible                                                |
| 2   | Context hierarchy (00:09:51)                                | region close-ups                                                            | in each region, the primary form dominates and small forms are subordinate                                   |
| 3   | Collision and ripple (00:12:26)                             | front and three-quarter                                                     | forms in an expression move together (a smile lifts the nose corner, nasolabial and lower lid into a squint) |
| 4   | Weight and age (00:14:10)                                   | three-quarter, from below                                                   | fat pads, bone landmarks and gravity match the chosen age; not every muscle shown                            |
| 5   | Subtlety and flow (00:17:12)                                | raking light                                                                | transitions flow; nothing "screams"                                                                          |
| 6   | Distance from the subject (00:17:26)                        | `thumbnail` and a 100 % crop                                                | detail density matches the shot, and the tertiary stays tight enough for specular                            |
| 7   | Physically accurate renders under several lights (00:19:51) | three-light SSS set                                                         | no volume looks off under any of the lights                                                                  |
| 8   | Refine the eye (00:20:24)                                   | early versus late sheets side by side; `upside_down` (Lfen-BSwWcE 00:29:26) | the model still reads as right when seen fresh                                                               |

"Injecting life" (00:24:07):

- mood and intention decided;
- gaze slightly up and aside;
- eyes 3 to 10 degrees outward (`eye_report`: no `cross_eyed_risk`);
- lighting that tells the story;
- the details that draw the eye (eyes, nasolabial, lips) are right;
- asymmetry present;
- a subtle pose.

## 3. Skin (J Hill HlHoIGE2Ocs; Costa Lfen-BSwWcE, j5XLtLMN0P8)

| Check                                                                                             | Measure                                                                                                     | Judge                                                                                                                                                                                                                        | Fix                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Pore scale fits age and sex (J Hill 00:15:05)                                                     | pore spacing in px per zone logged                                                                          | raking close-up of cheek and forehead against same-age reference                                                                                                                                                             | Surface Noise scale before Apply; smaller for young and female (C7)                                                |
| Region rules (Costa j5 00:41:28; J Hill 00:22:16)                                                 | none                                                                                                        | nose shallow and sparse with a polished tip; clogged pores are bumps; lids and lips clean; cheek pores spread                                                                                                                | Morph brush with the polygroup auto-mask on lids and lips; DragDot bumps (C7, C10)                                 |
| Direction (Costa 00:46:18; J Hill 00:17:38)                                                       | orientation of `connect_the_dots` segments versus the field                                                 | lines lie across the compression: perpendicular to the circular muscles around the mouth; circular on the lids; horizontal on the forehead; on creatures across each bend (throat, jaw hinge, joints) [added generalization] | rebuild chains with the right field (C10)                                                                          |
| Wrinkles are short and connected (Costa 00:46:50)                                                 | chain lengths within 2 to 4 segments                                                                        | no long, drawn lines; secondary folds around soft skin                                                                                                                                                                       | break chains, add a hierarchy of secondary folds                                                                   |
| Not plastic (J Hill 00:18:42)                                                                     | none                                                                                                        | highlights break up irregularly on cheeks and the nose tip                                                                                                                                                                   | beat-up at three sizes, push and pull (C11)                                                                        |
| Even pore depth (J Hill 00:16:10)                                                                 | depth histogram spread on a height crop [added]                                                             | pores not all the same depth                                                                                                                                                                                                 | Morph brush variation, heavy then dial back                                                                        |
| Lips (J Hill 00:24:10-00:27:23)                                                                   | none                                                                                                        | Dam_Standard sections; catching arcs in alternating directions and lengths with Y shapes; medium folds strong enough to break the silhouette                                                                                 | arc families, then Elastic volume between deep lines                                                               |
| Sharp enough for SSS (J Hill 00:34:53; FlippedNormals 0PaYUUvgwYM 00:19:49-00:20:22)              | `detail_survival` ratio at least 0.5 in the highlights, same camera and crop [added, uncalibrated]          | the sharp detail survives in the highlights of the SSS render                                                                                                                                                                | carve deeper than feels right with Standard or Dam_Standard; less soft micro relief                                |
| Brush order over detail (FlippedNormals TpS0QdlfHWU 00:07:44; Costa j5 00:52:22; J Hill 00:20:53) | stroke log: no ClayBuildup or Clay pass after the pore layer                                                | finished pores intact after later passes                                                                                                                                                                                     | Standard to enhance, cloned Elastic on Spray for direction, Elastic at very low intensity for volume between lines |
| Asymmetry (J Hill 00:29:42; Costa j5 00:35:03; FlippedNormals G2o6fdoACIQ 00:06:19)               | `asymmetry_report`: at least two big-form regions (nose tip, ear, lip corner, eye) broken, not only details | the face is believable, and it is a likeness when there is a subject                                                                                                                                                         | C12, big forms first                                                                                               |
| Stamps (Costa 00:39:01)                                                                           | one size per zone in the plan                                                                               | no repeated or mixed-size stamps side by side                                                                                                                                                                                | rotate by alternating drag direction; keep one size per zone                                                       |

## 4. Creatures

| Check                                                            | Source                                                 | Judge                                                                                                                                                    | Fix                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Story, then biology, then cool                                   | Berger PcuC8K-bz44 00:04:24                            | every feature has a reason (riding, feeding, habitat)                                                                                                    | cut features that break the story, even pretty ones (the dorsal spines, 00:25:21)                       |
| Earth-like metaphor at the broad strokes, alien details up close | Berger 00:14:13                                        | the silhouette reads as a known animal type; close-ups reward the eye                                                                                    | push the metaphor in the masses and keep the alien in the tertiary                                      |
| Blended references, no seams                                     | Berger 00:12:33                                        | you cannot tell where one animal ends                                                                                                                    | re-blend at the mass level                                                                              |
| Open and closed mouth                                            | Berger 00:20:53                                        | both states resolved, no articulation problem                                                                                                            | jaw on a layer (C6)                                                                                     |
| Grayscale for anatomy approval                                   | Berger 00:37:47                                        | the anatomy reads in gray, without color                                                                                                                 | review in MatCap Gray; color is a separate approval                                                     |
| Scale flow                                                       | Henning TuRIf92oMCY 00:00:34                           | scales follow the muscles and cross over where muscles cross                                                                                             | re-stamp with the right flow angle per region (C9)                                                      |
| Individual yet unified                                           | Henning 00:07:10                                       | each scale separate, the patch a unity; no tiling, no stamp border; some scales lifted                                                                   | unify by hand with Standard; mid-frequency lift (C9, C11)                                               |
| Alpha tested while built                                         | Henning 00:14:15, 00:21:52                             | at least three test stamps on the model during the tile build (about 11, 26, 41 minutes); dots taller than any detail (`dots_check`) or `recenter_alpha` | test, read (soft? uniform? tiling? border?), fix the tile (C8)                                          |
| Hero close-up                                                    | Starkie (Maxon interview)                              | each scale has depth and form, with no overlaps                                                                                                          | per-scale placement, not a tiled patch                                                                  |
| Tusks, spikes, horns                                             | Starkie; Pablo TN9ARiC_82w                             | bone or rock with hard broken edges; cracks staged large to small; tapered, twisted, not obviously repeated; attached to the skull                       | `crack_tree` levels played largest first; radial detail (8, 5, 3) on the straight tube, then bend (C17) |
| Rest zones                                                       | Lazov AQsmWcXLxk8 00:31:12; Rakan FRZtVXpAokc 00:06:40 | rich areas against clean rest areas                                                                                                                      | clean the rest zones; concentrate detail                                                                |
| Expression                                                       | Lazov 00:23:40                                         | the eyes and brow carry it                                                                                                                               | small targeted moves at the brow                                                                        |
| Asymmetry                                                        | Lazov 00:56:58-00:58:04; J Hill 00:29:42               | the big forms are not mirrored: skull mass, one orbit rim, the jaw corner, a nostril, a horn; scars and broken scales come on top                        | `asymmetry_report`; C12                                                                                 |
| Silhouette                                                       | Lazov 00:28:36; Berger 00:33:48                        | interesting, never flat; schooling creatures survive repetition                                                                                          | reshape the masses; tile a thumbnail to check repetition [added]                                        |

## 5. Bodies (Eaton Ale6SXXbJMM; Anatomy For Sculptors)

- **Force chain.** Only the muscles in the force chain are tense; the antagonists are soft. A
  generalist's "super bodybuilder deltoid" is the error (00:13:39-00:15:29). Judge on a
  three-quarter back render.
- **Landmarks first.** Sternum, clavicle, acromion, spine of the scapula, C7, iliac crest, ASIS,
  PSIS, deltoid insertion (00:35:59-00:44:08). They read as depressions on a muscular body and as
  bumps on a lean one (A4S).
- **Scapula.** About 30 degrees of rotation at 90 degrees of humerus elevation (`scapula_check`).
- **Straight active muscles.** They run point to point; check from under the armpit (00:54:07).
- **A4S ratios:**
  - adult hand length = chin to hairline;
  - middle finger = half the hand;
  - deltoid tuberosity a bit above mid-humerus;
  - the butt never wider than the hips (greater trochanter).
- **Hands.** Arched palm, knuckles not aligned, square fingers, webbing between them (A4S).

## 6. Cloth

| Check                                                        | Measure                                           | Judge                                                                                   | Fix                                                    |
| ------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Tension points identifiable (Grassetti gNx4v0WVVHo 00:00:31) | pins in the plan                                  | every fold family relates to a pin                                                      | re-plan from pins (C13)                                |
| No fold ends alone (00:02:35)                                | `free_endpoints` = 0                              | raking light: folds end in folds, seams, hems or edges                                  | `snap_free_ends`                                       |
| Never even (00:03:08)                                        | `evenness` of lengths and spacings > 0.05 [added] | heavier and overlapping near the pin, relaxing away from it                             | taper segments, vary counts                            |
| Type matches tightness (00:04:26)                            | `fold_type_for` per region                        | drop on loose areas, zigzag between two holds, X on tight compressed bands, Y at splits | change the family                                      |
| Reads from every side (00:12:06)                             | none                                              | back and profile renders                                                                | sculpt pass after any sim                              |
| Sim stretch (Pavlovich m5O_sBag_iA 00:14:54)                 | area drift under 5 percent [added]                | PolyFrame at contact points: no long polygons                                           | more iterations or less gravity; a smaller mesh        |
| Gap and penetration (nqoCyOME8Jo 00:06:40)                   | none                                              | Transparency: garment close to the body, not inside                                     | Collision Inflate lower; resolution about 1024; Recalc |
| Fabric weight (m5O_sBag_iA 00:17:59)                         | Firmness logged                                   | silk: many folds; leather: few, thick folds                                             | Firmness 1 to 2 or 5 to 6                              |

## 7. Fur and hair (Pablo lgTA_ebLGDw; FiberMesh doc; Pavlovich QCcDTuDT2HM)

- **Coverage.** With a contrasting fill (Color > FillObject on the fibers) there are no gaps.
- **Roots.** No floating fibers and no cushion gap around the scalp; roots are pinned with Mask By
  Fibers before any simulation.
- **Groom.** It reads as intentional, with clumps and partings that read as a hairstyle.
- **Still a FiberMesh.** FiberUV enabled means grooming is still possible.
- **Polycount.** Within budget; Profile 1 unless exporting.

## 8. Game readiness (Rakan Khamash, Blizzard, FRZtVXpAokc)

- **"Say it or don't".** At `thumbnail` size, the character reads from the back of the room
  (00:02:16, 00:05:00).
- **Curves and lines.** S and C curves; no parallel lines; no noisy curves (00:06:07).
- **70/30.** Main breaks sit away from the middle; `split_ratio` flags 0.45 to 0.55 [added band].
- **Rest areas.** Rest areas exist, and details push the character's intent (00:08:53-00:10:32).
- **Blockout.** It is 90 to 95 percent of the low poly (00:21:37).
- **Loops and floaters.** Straps sit on loops; floaters stay separate; the face topology matches the
  shared template (vertex count equal before projecting).
- **Budget.** About 16k for a hero including hair variants (unit not stated in the audio; the
  research manifest reads it as triangles).

## 9. Stack and projection (J Hill HlHoIGE2Ocs; Costa Lfen-BSwWcE; FlippedNormals Zp07GW3rND0)

| Check                                                                  | Measure                                                                                                                                                                              | Judge                                                                                       | Fix                                                                       | Severity |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------- |
| Route chosen before the first Divide (J Hill 00:13:22; Costa 00:17:53) | `stack_check` ok for the driver: SDK only = regular to about 20 to 25M; computer use = 3 to 4 regular (top 1 to 2M) + 3 to 4 HD                                                      | none                                                                                        | replan; a 6 or 7-level regular stack stays regular                        | blocker  |
| Micro detail has a home (Costa 01:10:58)                               | SDK route: a tiled micro-displacement map requested from scenario-zbrush-paint-render                                                                                                | close-up render shows pore grain                                                            | add the tile to the handoff                                               | major    |
| Safety nets before Project All (00:02:13)                              | `zb_ops.project_all` result: `morph_target` stored, `layer` created, a checkpoint ZTL, no "safety net missing" warning                                                               | none                                                                                        | rerun with the defaults (`store_mt=True`, `layer=True`)                   | blocker  |
| Danger zones protected (00:01:41, 00:05:31)                            | interior polygroups (eyes, mouth, nostrils) masked before projecting                                                                                                                 | none                                                                                        | mask the grown interior polygroup (C19)                                   | major    |
| No spikes at any level (00:03:49, 00:07:10)                            | the lead's bbox gate (`gate.ok`) plus `spike_report` ok per polygroup at every level (interior spikes stay inside the bbox); displacement outliers against the pre-projection export | close-ups of lids, lips, nostrils, fingers, armpits, crotch at each level, layer at 0 and 1 | `zb_ops.morph_repair` or masked local reprojection, never smoothing (C19) | blocker  |
| Detail came back (retopology digest)                                   | `rx.projection_verdict`: bbox within 0.5 %, volume within 2 %                                                                                                                        | raking light: no soft patches                                                               | project again (Dist 0.1) or a local pass                                  | major    |

## 10. Report format (end of every stage)

```
stage: <name>   file: <versioned ZTL>   sheet: <path>
measured: <stack_check, points per level, layers ledger, spike_report per group, face_report deltas, asymmetry_report, alpha_check / dots_check, detail_survival, fold checks>
first failing step: <section and row> -> fix planned: <procedure>
not verified: <every [verify] the stage relied on>
```
