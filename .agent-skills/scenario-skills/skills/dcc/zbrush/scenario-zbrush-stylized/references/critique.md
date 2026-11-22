# Self-critique rubric: stylized characters, hair, collectibles

The agent judges its own output with this rubric at every gate. Each line gives what experts look
at, how the agent measures it, and the pass condition. Code thresholds tagged [added] are this
skill's defaults: calibrate them on reference silhouettes before trusting a borderline result. A
render always gets looked at; a number never replaces the look.

## 1. Design intent (before geometry)

| Look at                                                                                                   | Measure                                  | Pass                                                                              |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| The three reads: silhouette idea, secondary intent shapes, tertiary detail (Rakan [FRZtVXpAokc 00:08:53]) | written in the design sheet              | each read is one sentence the renders can be checked against                      |
| Knobs (Shane [t_gg7MIGSDM 00:25:08])                                                                      | targets in `head_checks` / `body_checks` | every break has a target and a reason; everything else stays at the real baseline |
| Story fit (Guillaume [UthCuDB1IEQ 00:42:30])                                                              | list of costume details                  | no detail contradicts the character                                               |

## 2. Proportions and landmarks

| Look at                                                                                             | Measure                                                 | Pass                                                                                                |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Cranium and jaw split at the eye line (Shane [02:04:29])                                            | `split_at_eye_line`                                     | within 0.05 of head height [added]                                                                  |
| Jaw corner under the ear, mid depth (Shane [02:05:53])                                              | `jaw_corner_depth`, `jaw_under_ear`                     | within 0.10 of head depth [added]                                                                   |
| Eyes on a curve from the top (Shane [02:06:27])                                                     | `canthus_recess`                                        | at least 0.10 of head depth [added]; the top render shows it                                        |
| Head sides taper toward the face, each side an arc (Shane [02:00:26], [02:11:58])                   | `head_taper` on a solo top render of the cranium        | taper at most 0.95 and sag at least 0.01 of depth on both sides [added]; the narrow end is the face |
| Eyes wrapped by lids, turned outward (Henning TpS0QdlfHWU [00:18:33]; Costa j5XLtLMN0P8 [00:29:10]) | perspective look render (scenario-zbrush-sculpting P17) | lids sit on an eyeball; the pupils diverge slightly, never a cross-eyed stare                       |
| Face thirds, eye line (Anatomy For Sculptors)                                                       | `face_thirds`, `eye_line`                               | within 0.05 of head height, or a recorded break                                                     |
| Leg split, hand drop, arm split (Shane)                                                             | `body_checks`                                           | at baseline or at the design target                                                                 |
| Posture of the masses (Shane [00:59:24])                                                            | side render                                             | pelvis forward, ribcage back, femur angled, tibia straight                                          |
| Landmarks read through the surface (Shane [01:10:33])                                               | three-quarter render                                    | hip point, knee, ankles, elbow, clavicles, neck vertebra visible as forms                           |

## 3. Silhouette and shape language

| Look at                                                 | Measure                                                  | Pass                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Reads from the back of the room (Rakan [00:05:00])      | `squint` at 64 and 128 px                                | the character idea and the big shapes survive                                |
| Distinct from siblings (Cedric [00:08:31])              | `lineup` IoU                                             | under 0.85 per pair [added]                                                  |
| S and C curves where the eye rests (Rakan [00:07:14])   | `shape_language`: `c_runs`, `s_pairs`, `curved_fraction` | curves dominate the contour; `annotate_shape` shows them where the eye lands |
| No long straight runs (Rakan [00:06:07])                | `straight_fraction`                                      | at most 0.25, bust base ignored with `ignore_bottom_frac` [added]            |
| No parallel lines (Rakan [00:06:07])                    | `parallel_pairs`                                         | none (within 5 degrees, facing, half overlap [added])                        |
| No noisy contour (Rakan [00:06:07])                     | `noise_per_1000px`                                       | at most 4 [added]                                                            |
| 70/30, not 50/50 (Rakan [00:16:37])                     | `band_breaks`, `split_check`                             | no main break in 0.45 to 0.55 [added band]                                   |
| Flare top, taper bottom (Rakan [00:07:46])              | front render of limbs, straps, tails                     | widths differ end to end; no tube shapes                                     |
| Rest versus detail (Rakan [00:06:40], Pablo [00:30:32]) | review sheet                                             | calm zones exist next to busy ones                                           |

## 4. Forms and planes

| Look at                                                                    | Measure                                                            | Pass                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| Clear directional planes, creased turns (Guillaume [00:45:33], [00:46:42]) | MatCap Gray sheet, raking three-quarter                            | planes read as planes; turns are crisp, not mushy      |
| Contact shadows where forms tuck (Guillaume [00:47:50])                    | close-up render                                                    | overlaps visible at brow, nose, ears, scarf            |
| Surface dips (Plouffe [01:25:05])                                          | MatCap Metal01 sheet                                               | no wobbles on planes                                   |
| Planes survive subdivision (Guillaume [00:47:16]-[00:47:50])               | after `crease_planes` and Divide: Metal01 sheet and a grazing view | plane borders stay straight and crisp, not rounded off |
| Odd angles (Guillaume [00:44:57])                                          | top, bottom, back views                                            | relationships between forms still hold                 |

## 5. Hair

| Look at                                                             | Measure                                           | Pass                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Blockout reads as the hairstyle (Pablo [00:19:27])                  | squint of the fused blockout                      | flow and main chunks identifiable before any detail                                                  |
| Plan before sculpting (Pablo [00:17:46], Dan [frame 00:01:26])      | `overlay_paths` on front, right, top              | the back is planned; the part and hairline read                                                      |
| Clump flow (Pablo [00:26:10])                                       | `strand_report` kinds per view                    | designed C or S kinds read in the right and top views; no `noisy` clumps (kinks)                     |
| No parallel clumps [added application of Rakan]                     | `strand_report` parallel pairs                    | none                                                                                                 |
| Stroke evidence                                                     | `stroke_from_view` volumes                        | clump strokes add volume, crevice strokes remove it (70 percent or more)                             |
| Crevices deep enough to read as strands (Pablo [00:31:05])          | three-quarter render                              | readable separation, not scratches                                                                   |
| Stepped, crisp edges after ClayPolish (Pablo [00:35:02])            | close-up render                                   | clean planes, no lumps                                                                               |
| Attachment at the hairline and scalp (Pablo [00:28:56], [00:32:42]) | front and side close-ups                          | strands grow from the scalp, no floating shell edge                                                  |
| Strands round, clean, sharp (Dan [00:13:29])                        | strand close-up                                   | no smoothed or collapsed strands                                                                     |
| Fullness and clipping (Dan [00:26:57])                              | two MatCaps, the five review views (top included) | no unintended gaps, little clipping                                                                  |
| Budget                                                              | `strand_mesh_report`                              | one shell per strand (+ at most one dummy), faces per strand within the game budget, no thin strands |
| Parting from the top (Dan frames)                                   | top render                                        | clean part, strands radiating                                                                        |

## 6. Props and accessories (scarf, straps)

| Look at                                                     | Measure                                                  | Pass                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Tails as S or C, not twins                                  | `classify_polyline` on projected pixels, `strand_report` | S or C; no parallel pair                                                                         |
| Knot and band placement                                     | `split_check`                                            | off 50/50                                                                                        |
| Folds with a reason (Rakan [00:20:28])                      | render                                                   | folds start at pressure points or joints, mostly V shapes                                        |
| Weight where the brief wants it (stylized digest P1 step 7) | render                                                   | a scarf or cape that should hang does (Dynamics cloth drape, scenario-zbrush-character-creature) |

## 7. Value and color handoff

| Look at                                                           | Measure              | Pass                                                                     |
| ----------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| Grayscale read (Guillaume [00:59:20])                             | `value_check`        | no pure black or white pixels, highest-contrast cell inside the face box |
| Color held back (Guillaume [00:48:59])                            | render               | only lashes and pupils darker before the paint stage                     |
| Material IDs (Guillaume [00:54:14])                               | ID list              | one clearly different color per material                                 |
| Colors judged honestly (Pablo VRisbJQAaZw [00:23:40], [00:24:54]) | render on SkinShade4 | polypaint at the top level, read on the flat material, not a MatCap      |

## 8. Toy and collectible readiness

| Look at                                                                     | Measure                             | Pass                                                    |
| --------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| Neutral standing design without joints (Bennett [00:19:34])                 | render                              | approved before engineering                             |
| Thin features at print scale (Bennett [00:10:57], [00:48:28])               | `feature_check`                     | walls 1 mm or more, trimmed edges 0.5 mm or more        |
| Flyaways, closed loops, skirts (Bennett [00:20:41], [00:19:34], [00:18:30]) | close-ups                           | flyaways fused, no touching fingers, slits planned      |
| Scale stated (Bennett [00:17:51])                                           | handoff note                        | design mm, file mm and the file percentage written down |
| Detail at real size (Bennett [00:09:47], Carratala)                         | render at about real size on screen | nothing sculpted that the size cannot show              |

## Honesty checks before reporting

- Which numbers came from code, which from looking at renders, and which steps were not verified in
  ZBrush.
- Every deliberate break listed with its baseline.
- Any gate passed only by loosening a threshold is reported as such.
