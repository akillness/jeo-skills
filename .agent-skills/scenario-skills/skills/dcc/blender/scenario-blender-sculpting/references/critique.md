# Critique rubric: judge a sculpt the way the experts do

Use after every stage, on the numbers (`S.stage_report`, `S.lower_face_report`, `S.profile_rhythm`)
and on the renders. The gate is the long-lens perspective view (`S.long_lens_render` or
`S.final_render`, 85 to 95 mm, front, profile, three-quarter, below): experts judge form through a
long lens, not orthographic (Morren BPAvvF8py1M 00:13:14; Kaspar uGde7HdmCa8 00:46:31).
`bx_review.review` silhouettes serve the silhouette pass and ortho landmark ratios. Open each image
before judging. When a number passes and the render looks wrong, the render wins (v2: plane cuts
flipped `lower_face_report` on a balloon jaw that still rendered as a gem facet). Then name ONE
weakest link, fix only that, re-render (Yan vB7kPWjBgQI 00:54:04). Stop a stage only when every
"blocker" line below is clear.

## Order of looking (never skip ahead)

1. **Silhouette** (black on white), front, profile, top, three-quarter: shape and gesture only
   (Kaspar YaVEJTLDD3Y 00:06:46; f-mx-Jfx9lA 00:26:01).
2. **Big planes under a neutral matcap, cavity off** (Henning Cmi0KoFtc-4 00:25:50): front plane vs
   side planes of face and skull, chin vs mouth area, cheek vs nasolabial (Morren BPAvvF8py1M
   00:12:27).
3. **From below and above**: nose-base triangle, nostril beans, mouth mound curvature, jawline,
   upper lip emerging from inside (Thelen gC3FG8-4lsU 00:10:36; Naydenov oY9XybQRxzQ 00:44:03);
   forward taper from the top (Thelen 00:01:11). Ryan King found his too-wide mouth, pointy chin and
   swollen lip only from a low angle [Km9JSdWTjVY 00:36:38].
4. **Long lens 85 to 95 mm** for proportions and form (Morren 00:13:14; Kaspar uGde7HdmCa8
   00:46:31); ortho front and side only for landmark ratios. A flat-shaded render
   (`final_render(mode="flat")`) reads planes; matcap with cavity finds bumps (Kaspar f-mx-Jfx9lA
   00:05:32).
5. **Lines and edges** (cavity on is fine here): crisp where bone or a fold is, soft into soft
   tissue.
6. **Zoom out**: the whole head at thumbnail size still reads as the intended character (Morren
   00:37:48).

## Stage 1: blockout (voxel about H/40)

| Check                          | Blocker when                                                                                                               | Source                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| components, non_manifold_edges | not 1 and 0 after the union                                                                                                | Reinhardt KURuPAVJ6hM 01:07:45                                                                  |
| faces                          | outside about 5k to 20k for a head                                                                                         | Morren (0.05 on a 2 m head), courses digest stage map                                           |
| scale_applied, mirror_max      | scale not (1,1,1); mirror above 1e-4 after `symmetrize`                                                                    | Reinhardt 00:27:17; Keelan Jon amVAlpxHp8k 00:26:35                                             |
| silhouette, front              | egg or balloon, pointed dome, features stuck on a big sphere                                                               | Morren 00:16:28; Naydenov oY9XybQRxzQ 00:15:26                                                  |
| silhouette, top                | head wider at the front than behind the ear                                                                                | Thelen 00:01:11; Keelan Jon 00:19:10                                                            |
| profile                        | neck missing or vertical under the skull; no forward lean                                                                  | Thelen 00:02:20; Naydenov 00:16:53                                                              |
| matcap                         | primitives read as separate lumps (stacked sausages, visor brow)                                                           | [added] blend them (Clay blend 0.08 to 0.15 H); nine smooth passes widened a seam only 4 % (P2) |
| stylization                    | the defining exaggeration is not visible yet in silhouette                                                                 | Yan vB7kPWjBgQI 00:01:09                                                                        |
| lower face form                | `lower_face_report(head, H)["ball"]` True, or cheek, jaw and jowl read as one sphere in the 90 mm profile or three-quarter | E2 evaluation; Zarins -3b7hDQUfIg 00:28:11 (gonial angle)                                       |
| jaw block                      | a flat front ahead of the mouth (a mask), or its top edge visible across the cheek (a panel)                               | v2 iterations 1 and 2                                                                           |
| cheekbone                      | a horizontal bar from eye to ear instead of a mass running from the ear down and forward                                   | Naydenov oY9XybQRxzQ 00:25:14; v2 iteration 1                                                   |

## Stage 2: primary forms and landmarks (H/65 to H/100)

| Check                   | Blocker when                                                                                          | Source                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| faces                   | above about 100k before the shape review passes                                                       | Abbitt K7AJVx0H3Ec 00:28:11                                       |
| landmark ratios         | outside about ±5 % of the design table [added tolerance]                                              | SKILL.md Numbers                                                  |
| profile_rhythm          | fewer than chin out, in, lips out, in, nose out                                                       | Ryan King Km9JSdWTjVY 00:10:42                                    |
| eyes                    | marbles on a flat face; no socket between brow and cheek; eyeball poking through lids                 | Kaspar YaVEJTLDD3Y 01:00:04; Ryan King CbZChQoi46k 00:02:47       |
| jaw from below          | cheek and jaw one balloon, no jawline                                                                 | [example iteration 4]; Zarins -3b7hDQUfIg 00:28:11 (gonial angle) |
| face vs skull           | features too small for the head                                                                       | Naydenov 00:48:35                                                 |
| small landmarks         | nostrils, brows, eyes not indicated yet (they expose proportion errors the masses hide)               | Yan vB7kPWjBgQI 00:05:11                                          |
| lids and sockets        | sleepy (upper margin too low), a ring groove that reads as eye bags, lid cups sticking out in profile | v2 iterations 2 to 5                                              |
| hair                    | a helmet ledge, a beanie with worms, a bare headband above the forehead, a symmetric crown or flame   | v2 iterations 1 to 9; Yan 01:08:06                                |
| character cues          | the type does not read without the face: no hair, costume or prop                                     | Thelen 00:48:58; Naydenov 00:53:05                                |
| mouth                   | straight across instead of wrapping the head                                                          | Yan 00:08:00; Ryan King 00:16:33                                  |
| ears                    | glued flat, or flapping out at the bottom; start visible from the front                               | Naydenov 00:19:35, 00:23:59                                       |
| neighbors               | one part stylized alone (face vs neck, long face on a big skull)                                      | Yan 01:13:23, 00:35:38                                            |
| stretch_p95_over_median | above about 2.5 after grabs or moves: remesh                                                          | [added, from Reinhardt 00:52:28]                                  |

## Stage 3: secondary forms and lines (H/130 to H/235)

| Check             | Blocker when                                                      | Source                                                         |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| lines             | jagged, dotted, wobbly, or lost after the last remesh             | Abbitt 00:31:59; Reinhardt 01:08:49                            |
| crease resolution | fewer than 3 to 4 vertices across the crease radius               | Ryan King mgHsZZiyd54 00:16:00                                 |
| smoothing         | features melted by smoothing across forms                         | Thelen 00:24:17                                                |
| lids              | thick, missing, or the upper lid not covering the top of the iris | Ryan King Km9JSdWTjVY 00:22:34; Abbitt 9N87-yRR5aE 00:26:25    |
| nasolabial        | over-defined (ages the face) unless age is the brief              | Thelen 00:26:31                                                |
| attention         | a form that pops "like hey look at me" without a reason           | Yan 00:50:35                                                   |
| stroke placement  | a groove or scratch where no stroke was meant (nose, forehead)    | [example iterations 2 and 3: view-ray placement, P4]           |
| grazing creases   | parallel cracks beside the mouth or on the cheek side             | v2 iteration 6 (front projection on a grazing surface)         |
| plane restates    | a flat coin or facet with a rim                                   | region smaller than the plane's intersection; wrong mass (P14) |

## Stage 4 and later (detail, asymmetry, hand-off)

- Detail density matches the camera: nothing smaller than the game camera or texel density resolves
  (Naydenov DZ0T4bcchcs 00:03:17, 00:20:39); breakup varies in scale and spacing (Reinhardt
  01:43:05).
- Asymmetry is intentional and on a shape key; basis neutral and symmetric (Thelen 00:38:27; Kaspar
  f-mx-Jfx9lA 00:09:44; `procedures.md` P11).
- The expression reads at the delivery framing: a mouth corner moved about 1/8 of the mouth width
  (measured: 8 mm on a 65 mm mouth read at both framings, 2 mm at neither); check pixels with
  `S.framing`.
- Expression tests do not reveal proportion errors (eyes, brows, teeth); fix any in the neutral, not
  in each key (Kaspar f-mx-Jfx9lA 00:10:49).
- Every high-poly part closed; normal-map-only details inside the silhouette; one object per future
  material color (Naydenov LFjXmRvQpxs 00:11:38, 00:46:38; PkQ2wD8t_f0 00:02:13).

## Character-level questions (after every stage, answer in one line each)

1. Does it read as the brief at thumbnail size (sex, age, type, attitude)? (Kaspar f-mx-Jfx9lA
   00:00:33; Zarins 00:29:51)
2. Which single exaggeration defines it, and do the neighbors follow it? (Yan 01:13:23)
3. Is there structure under the skin (skull, tissue over teeth), not a blob? (Zarins 00:00:40;
   Thelen 00:11:45)
4. Is it harmonious (jaw vs cheekbones, eye size vs face length)? (Thelen 00:44:02)
5. Are the character cues there (hair, costume, prop), and do they frame the face rather than
   compete with it? (Yan 01:08:06)
6. What is the weakest link now? Fix only that.

## Reporting

State per stage: voxel/H, faces, components, mirror error, profile rhythm, the renders looked at
(paths), the weakest link found and what was done, and what was NOT verified (for example "lid
thickness not judged at 90 mm", "GUI strokes not run"). Never call a sculpt stage done without
having opened its renders.

## Lessons from the evaluation runs (2026-09-24) [eval]

Three fresh agents sculpted the same brief (stylized adventurer bust) with and without this skill;
these are what the renders showed, not expert quotes.

- A single tilted hairline half-space reads as a garrison cap from the side; build the hairline as a
  function of azimuth (sideburn, over the ear, down behind it to the nape), and ramp the quiff up
  from the hairline over about 0.12 H instead of a z-only thickness ramp (vertical wall).
- Gaze carries attitude as much as the mouth: mirrored eyeballs cannot glance; aim two eyes.
- Lid margin is an attitude dial that depends on the brow: under a heavy brow shelf 20 to 27 degrees
  read as staring, about 19 degrees relaxed and confident.
- Brow angle is an expression dial: outer ends drooping read worried, inner heads low read
  villainous; keep them level on a neutral basis.
- The 100k stage-3 gate is for a head; state it per head area or as voxel/H when the bust includes
  shoulders (128k at H/160 was fine).
- Silhouette holes: `lower_face_report` and `profile_rhythm` passed while the nose was attached at
  only two points; probe a ray grid per view before calling a stage done.
- Run `bx_audit` self-intersections after the last remesh: thin ear details fold after remesh plus
  relax; a local volume-preserving smooth fixes them.
- Big stylized noses need a side wall to the cheek (nasal base mass); a cone plus a tip sphere
  floats in profile.
- Costume is quick and robust as an offset shell of the head's own SDF grid, cut by half-spaces.
- Grooves (`Clay.stroke(op="sub")`): narrow reads as scratches, wide and shallow as lumps, uniform
  and parallel as stripes; deep at the start and fading along the flow reads as locks.
- OpenVDB `to_object` can leave one non-manifold edge at H/110; the next `remesh_stage` clears it.
- The skill's structure worked as written in the second run: the jaw-block recipe kept the lower
  face from reading as a ball (sphere rms 0.15 to 0.26 vs 0.057 to 0.082 for known balloons), and
  the 1/8-of-mouth-width smile rule read clearly (7.8 mm, 28 px at 1600 px).
