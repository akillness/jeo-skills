# Retopology critique rubric

How the experts judge a retopo, turned into checks an agent runs on itself. Run the code checks
first, then render the two review sheets and walk the visual list in order. Score each section 0
(fails), 1 (works with visible problems), 2 (clean), and report every 0 or 1 with its cause.
Kaspar's own summary of what matters: "is it clean, is it all quads, does it subdivide well, do you
capture all of your forms and details, is it easy to rig ... vertex count has very little to do with
that" (Snow Live #4 [00:58:52]).

## 0. Setup for the review

```text
t   = R.topology_report(retopo, crease_attr="retopo_crease", hidden_group="hidden_ok")
f   = R.fidelity(retopo, sculpt, levels=2, target_mask=<region you meant to cover>)
ls  = R.loop_stats(retopo)
eye = R.loops_around(retopo, eye_center, eye_normal, max_radius=2.6 * eye_radius, corners=(inner, outer))
sheets: cage wire (front, right, threequarter, low) and the same views with a temporary
Subsurf level 2 in matcap; the sculpt in matcap from the same views for comparison.
```

Full, tested code: `procedures.md` P10.

## 1. Fit for purpose (budget and brief)

| Check                                            | Pass                                                                                                                                                                                                                                         | Source                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Face or triangle count vs the stated budget      | within budget; film: "the lowest necessary amount of loops"                                                                                                                                                                                  | Kaspar Live #4 [00:58:19]; SpeedChar ep23 [00:09:58] |
| Density follows detail and deformation, not area | face denser than body (game ~3x), flat or hidden areas sparse; uniform density fails a character. Edge-length CV is a hint only, never pass/fail: an unedited uniform remesh reads about 0.17 to 0.27, studio meshes 0.33 (hand base) to 0.8 | SpeedChar ep23 [00:34:34]; calibration               |
| Not over-dense                                   | "overly dense retopology" is the most common RetopoFlow problem                                                                                                                                                                              | Lampel [00:36:21]                                    |
| Surface details in maps, not loops               | no loops chasing small bumps, pores, muscle striations on an animation body                                                                                                                                                                  | Jamie Dunbar [00:17:15]; Dikko body [00:32:28]       |

## 2. Flow (wire sheet)

| Check                                   | Pass                                                                                                          | Source                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Rings around each eye and the mouth     | at least 3 closed rings each (`loops_around`), concentric, no spiral                                          | Dikko [00:04:49]; Kaspar BCON22 [00:08:29]            |
| Lid and lip parity                      | upper count = lower count (`corners=` in `loops_around`)                                                      | Dikko [00:04:16]; Kaspar BCON22 [00:46:37]            |
| Articulation (film face rig)            | lids, lips, brows: 3 main loops with 2 handle loops each, 2 eye corner loops                                  | Kaspar BCON22 [00:12:25]                              |
| Face frame, nasolabial loop, cheek grid | a loop framing jaw and forehead; one loop from over the nose around the chin; cheek a plain grid              | Dikko [00:02:34] [00:03:42]; Kaspar BCON22 [00:09:01] |
| Joints                                  | 3 loops over each bending part (elbow, knee, wrist, finger joints)                                            | Kaspar Live #4 [00:08:01], Live #5 [01:37:48]         |
| Body core (full characters)             | chest loop over the shoulder cap and hip loop exist; limb loops separated from torso loops                    | Dikko body [00:01:51] [00:26:03]                      |
| Loops close or end in still areas       | `loop_stats` spiral suspects not rising after an edit; no loop wrapping a limb                                | Kaspar Live #7 [01:23:34]                             |
| Limb midline straight                   | ring start vertices line up down the limb, no twist                                                           | Dikko body [01:28:03]                                 |
| Loops out of the face are budgeted      | loops leaving the face end in the framing loop, the chin frame, a nostril or a hole, not in the neck and ears | Kaspar Live #2 [00:03:03] [00:41:44]                  |

## 3. Poles

| Check                                                       | Pass                                                                                                                                                                                                                                                                         | Source                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Valence                                                     | only 3 and 5; `valence_6plus == 0`; `valence2 == 0` in the final mesh                                                                                                                                                                                                        | Kaspar Live #7 [00:11:41]                                       |
| Placement                                                   | in low-movement areas (back of hand, between the collarbones, cheek), not near mouth corners' travel                                                                                                                                                                         | Kaspar BCON22 [00:43:49]; Live #5 [00:58:19]                    |
| Never on a crease loop, a shell rim or the face center line | `crease_poles == 0`, `rim_poles == 0`, `center_poles == 0`                                                                                                                                                                                                                   | Kaspar Live #1 [00:36:27], Live #3 [00:36:54]; Dikko [00:04:49] |
| No clusters                                                 | `adjacent_e5` low; no two diamonds touching (they make 6+ poles); report and justify every 6-pole (studio meshes carry 0 to 4)                                                                                                                                               | Kaspar Live #2 [00:53:13], Finale [01:04:16]; calibration       |
| Pole budget and placement [added]                           | pole density near the studio 5 %; none on lid/lip rings or crease loops (clean rings of `carve_rings` carry 0 by construction; check `poles_on_clean_rings` as in `test_sheep_v2.py`); reduction units (4 poles each) and staircase cut borders are the agent's pole sources | sheep v2: 9.5 % forced counts, 5.7 % with count ranges          |
| Map lines exist as loops [added]                            | every planned line (nasolabial, face frame, crease) has a real closed edge loop: `R.find_loop_near(obj, curve, tol)`; a ring carrying poles is not a loop (loop walks stop at poles)                                                                                         | sheep v2                                                        |
| Flow loops do not read as creases [added]                   | band rings about one edge apart; three tight rings make a ridge after subdivision (Kaspar: the closer they hug, the sharper the crease)                                                                                                                                      | sheep v2, 3.5 mm rings on 12 mm faces                           |
| Density                                                     | pole count / faces near the studio range (1.8 % head, ~5 % body)                                                                                                                                                                                                             | calibration                                                     |

## 4. Shape (subdivided matcap sheet vs sculpt)

| Check                            | Pass                                                                                                                                                                                     | Source                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Subdivided surface on the sculpt | `mean_pct` <= 0.3 %, `inside_pct` 40 to 60 % [added thresholds, Kaspar's sheep: 0.24 %, 47 %]                                                                                            | Duha [00:12:24]               |
| Coverage                         | `cov_p95_pct` <= 1 % over the region you meant to build (missing limbs and bridged-over cavities show here)                                                                              | [added]                       |
| Creases held                     | eyes, lips, nasolabial, chin, brow, ear helix, knuckles crisp after subdivision; crease loops centered in the crease                                                                     | Kaspar Live #1 [02:13:08]     |
| No lumps or pinching             | no ripples around poles on curved areas; no lumps on hooves, fingers, mouth. Numbers do not catch this: an aggressively fitted cage scored 0.043 % and looked worse than Kaspar's 0.24 % | Lampel [00:21:18]; sheep test |
| Volume                           | no shrunken limbs (`inside_pct` > 55 is shrink), no overshoot (< 40)                                                                                                                     | Kaspar Live #6 [00:14:27]     |
| Reads unsubdivided               | the cage alone still shows the character; this is what riggers and animators see                                                                                                         | Kaspar Finale [01:58:41]      |
| Silhouette (game)                | low-poly silhouette matches the high from the game camera; round parts not faceted                                                                                                       | SpeedChar ep24 [00:48:51]     |

## 5. Hygiene

| Check                    | Pass                                                                                                                                              | Source                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Face types               | `non_quads_visible == 0` (tris and n-gons only in the `hidden_ok` group); film: all quads                                                         | Kaspar Finale [00:12:53]                                |
| Manifold, normals, loose | non-manifold 0 except intended holes; flipped 0; loose 0; duplicates 0                                                                            | Lampel [00:36:54]                                       |
| Self-intersections       | no worse than the input's own contacts (Kaspar's sheep cage: 177 face pairs, where ears touch the head)                                           | calibration                                             |
| Mirror seam              | every center vertex at x = 0, no open edges on the seam after applying Mirror                                                                     | CG Boost [00:13:01]                                     |
| Handoff                  | modifiers applied except Subdivision, transforms clean, `GEO-` names, a material per object, annotation attributes removed, reused parts stripped | Kaspar Finale [01:56:19], Live #6 [01:37:02]            |
| Separate parts           | clothing derived from the body topology; no intersections even where the body is hidden; inner band kept at openings                              | Kaspar Live #6 [01:44:44], Finale [01:47:58] [01:49:42] |

## 6. Game-specific

| Check                    | Pass                                                                                          | Source                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Every edge has a job     | silhouette, shadow, material split or UV seam, else dissolve                                  | Lampel [00:34:32]                            |
| Triangulation controlled | no twisted quads left (`triangulate_twisted`), Triangulate modifier applied on export         | SpeedChar ep35 [00:10:18]; Lampel [00:12:45] |
| Deforming zones          | quads and no triangles at knuckles, elbows, knees, mouth, eyes; triangles fine on rigid parts | SpeedChar ep24 [00:00:32], ep26 [00:10:28]   |
| Proud of the high        | low poly slightly outside everywhere (`push_outside`)                                         | SpeedChar ep35 [00:21:30]                    |
| Hard edges               | every hard edge is a UV seam                                                                  | On Mars 3D [00:08:04]                        |
| Cavities                 | deep concavities (ear bowl) have geometry, not only the normal map                            | SpeedChar ep25 [00:39:02]                    |

## 7. Honesty of the report

State the method per part (planned, auto, carved, socketed tube), the numbers from sections 1 to 5,
the two sheets, and what was not done to expert level (articulation handles, expression creases,
pole routing). An auto-remesh sold as "animation-ready" fails this section regardless of its
numbers.
