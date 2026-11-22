# Critique rubric: judge your own retopology, UVs and bake prep

How the source experts judge the work, turned into checks. Run the code first, then open the sheets
and walk the visual rows in order. Score each section 0 (fails), 1 (works with visible problems), 2
(clean) and report every 0 or 1 with its cause and the fix you will make. A blocker fails the whole
handoff, whatever the other scores. Thresholds marked [added] are this skill's defaults.

## 0. Setup

```python
rep = RU.retopo_report(mesh, source, openings=..., joints=..., cavities=..., regions=...)   # P9
uv  = RU.uv_report(mesh, map_size, smallest_mip, target_density, images_dir=out + "/uv",
                   profile="game" or "film", check_hard_edges=(profile == "game"))           # P15
dt  = RU.deform_test(mesh, chain, bends, review_dir=out + "/rom")  # per limb and face hinge  # P19
lid = RU.lid_check(head, eyeball)                                                            # P20
ov  = RU.overlap_review(low, high, out + "/overlap")                                         # P21
sheets: mx_review.review([mesh], ..., modes=("wire", "clay"), views=front, side, threequarter, low)
        the same views of the source in clay; a wire close-up of the face (focus);
        RU.checker_review in three views plus a close-up at the closest shot
```

## Blockers (any one fails the handoff)

- n-gons on a deforming or subdividing mesh (FlippedNormals 9N4rG5qHWgk [00:05:31]).
- `polyRetopo` left in history (Maya 2027 Help).
- Non-manifold, lamina, zero-area faces, flipped winding (`rep["verdict"]` errors).
- Center vertices drifting off 0 on a mirrored mesh (`rep["center_line"]`).
- Faces without UVs, folds or unintended overlaps (`uv["uv_audit"]`, `uv["verdict"]`).
- Padding under the lowest-mip requirement (`uv["padding"]["ok"]`).
- A face that deforms built by Retopologize without saying so in the report.
- A `topology` verdict from `deform_test` left unfixed (antCGi x07USYlvu2o [00:11:04] [00:17:37]).
- A lid vertex or edge midpoint inside the eyeball at rest or on the blink (`lid["fails"]` errors,
  antCGi [00:15:18]).

## 1. Fit for purpose

| Check                                 | Pass                                                                                                       | Source                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Budget                                | triangles within the lead's number; film: as high as needed and no higher                                  | FlippedNormals [00:13:46]; Polycount                         |
| Density follows deformation and shape | eyes, nose, ears denser than the cranium (`rep["edge_length_by_region"]`); back and top of the head sparse | FlippedNormals [00:21:10] [00:03:09]                         |
| Engine skin limit respected           | no extra spans that force a 5th influence at the mouth corner                                              | Jessica ZiYEO49B768 [00:59:24]                               |
| Neutral delivery                      | flat lids, flat mouth, relaxed A-pose, eyes forward                                                        | Jessica [01:00:30]; antCGi e74KphYwMww [00:07:39] [00:23:58] |

## 2. Face flow (wire close-up)

| Check                               | Pass                                                                                                                                       | Source                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Rings around each eye and the mouth | 3+ clean rings each (`rep["openings"][k]["clean_outer_rings"]`) [added count]; concentric, no spiral                                       | FlippedNormals sheets 3 to 5; Jessica [01:12:33]         |
| Lid and lip parity                  | upper count = lower count (`equal_halves`)                                                                                                 | FlippedNormals [00:21:41]; antCGi RlNnp4qQIrU [00:05:22] |
| Mouth                               | double circle at the lip edge, lengthwise loops meeting at the center, modeled flat                                                        | Jessica [01:28:31] [01:29:03]                            |
| Mouth-corner loop                   | runs up and back under the cheek, around the side of the head                                                                              | antCGi RlNnp4qQIrU [00:09:32]                            |
| Jaw                                 | one flat loop from lip corner to jaw corner, no shearing quads on cheek and jaw side                                                       | Jessica [01:30:10]                                       |
| Nasolabial and brow strips          | present as continuous strips; brows isolated on heavy-browed characters                                                                    | FlippedNormals [00:02:38]; Jessica [01:27:15]            |
| Face isolation                      | a loop around the whole face bounds facial controls                                                                                        | Jessica [01:26:20]                                       |
| Neck                                | flow along the sternocleidomastoid from the clavicle to the back of the skull; middle-neck edges run into the center line and the clavicle | antCGi RlNnp4qQIrU [00:37:43] [00:39:08]                 |
| Cavities                            | mouth bag, nostril recesses, eye pouch modeled                                                                                             | FlippedNormals [00:25:16] [00:27:22]                     |

## 3. Body and joints

| Check             | Pass                                                                                        | Source                                   |
| ----------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Joint loops       | 1 control + 2 support at elbows, knees, knuckles (`rep["joints"][k]["loops_in_band"] >= 3`) | Jessica [01:15:51] [01:17:34]            |
| Wrist, ankle      | loops across the wrist and around the ankle                                                 | antCGi x07USYlvu2o [00:11:04] [00:17:37] |
| Bony forms        | kneecap and elbow insets; thumb isolated with a loop around                                 | Jessica [01:14:44] [01:16:27] [01:18:38] |
| Shoulder and back | tube shoulder or deltoid isolation as the rig needs; scapula loop stops at the elbow        | Jessica [01:24:07] [01:24:41]            |
| Limb loops        | concentric, never spiraling down the limb                                                   | Jessica [01:12:33]                       |
| Symmetric parts   | combined into one mesh for mirrored weights                                                 | antCGi e74KphYwMww [00:24:32]            |

## 3b. Deformation-ready (pose sheets, `dt`, `lid`)

| Check       | Pass                                                                                                                                                                                                                                            | Source                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Whose fault | every failing bend classified: `topology` (loops along the joint, tilted over 20 degrees, fewer than 3 loops, pole in the band, spiral, joint loop under 0.8 of the ideal ring) fixed here; `rig` (volume lost at a clean hinge) sent as a note | antCGi x07USYlvu2o [00:10:27] [00:16:24] [00:20:21]              |
| Proof       | a topology fix beats the old mesh in `RU.compare_variants` under the same bends                                                                                                                                                                 | antCGi [00:16:24]                                                |
| Twist       | judged mid-limb (`kind="twist"`), never at the shoulder or wrist                                                                                                                                                                                | antCGi [00:08:40] [00:11:04]                                     |
| Face hinges | jaw open (and brow raise when it matters): band mean shear under 10 degrees [added]; the lip-corner-to-jaw loop flat                                                                                                                            | Jessica ZiYEO49B768 [01:13:06] [01:30:10]                        |
| Pose sheets | creases fall where anatomy creases; no pinching, surface artifacts or unnatural creases; jaw open shows loops flowing around and under the mouth                                                                                                | antCGi [00:16:24] [00:18:08] [00:19:35]                          |
| Lids        | fitted over the eyeball, border gap under 0.1 eyeball radius [added]; blink clear at vertices and edge midpoints                                                                                                                                | antCGi RlNnp4qQIrU [00:08:24]; x07USYlvu2o [00:15:18] [00:15:50] |
| Limits said | the report states that weights were a proxy and that the full ROM is scenario-maya-deformation's                                                                                                                                                | [added]                                                          |

## 4. Poles and triangles

| Check          | Pass                                                                                                                                | Source                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Pole placement | none on the first rings around eyes and mouth (`rep["poles_by_region"]`), none on the chest or joint bands; in folds or still areas | FlippedNormals [00:12:45]; antCGi QW8w15J00Ok [00:09:58] |
| Valence        | no 6+ poles unless justified (subd cage)                                                                                            | Pixar OpenSubdiv tips; mx_audit                          |
| Triangles      | only inside cavity spheres (`rep["triangles_outside_cavities"]["count"] == 0`) on deforming meshes                                  | FlippedNormals [00:03:41]                                |

## 5. Surface fit and silhouette

| Check                      | Pass                                                                                                                      | Source                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Deviation retopo to source | max under 10% of the mean edge length (`max_rel_edge`) [added]                                                            | digest candidate gate                         |
| Deviation source to retopo | no missed volume (ears, fingers, nose); `from_target` max read against the local edge length                              | [added]                                       |
| Silhouette                 | clay sheet of retopo and source match from every view; smoothed and mirrored read cleanly                                 | FlippedNormals [00:24:16]; On Mars [00:01:16] |
| Evenness                   | quads as square as possible; loose, not tight (`rep["audit"]["edge_len_cv"]` read with the region densities, never alone) | FlippedNormals [00:20:39] [00:02:07]          |

## 6. UV seams (checker sheets)

| Check                  | Pass                                                                                                          | Source                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Placement              | seams where the camera does not look and where the object has seams (under arms, back of legs, garment seams) | Maya 2027 Help; Paulino [00:05:16]; MLC [00:03:36] |
| Enough seams           | no shell that cannot lie flat (distortion hot spots)                                                          | MLC [00:02:07]                                     |
| Hard edges (game lows) | `uv["hard_edges_vs_seams"]`: 0 hard edges inside shells, 0 soft seams                                         | Polycount                                          |

## 7. Distortion and density

| Check        | Pass                                                                                                                                                                   | Source                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Even checker | squares roughly even and square on the body                                                                                                                            | MLC [00:09:51]                     |
| Numbers      | `uv["distortion"]["pct_area_outside_band"]` and `pct_area_aniso_over` near 0 (band 0.5 to 2, anisotropy 2) [added]; limb shells straightened by align + pin + optimize | MLC [00:04:49]                     |
| Density      | technical: every shell within 10% of the target (`density_off_target`) [added tolerance]; games: uniform base plus the planned head bias                               | Paulino [00:04:11]; MLC [00:10:57] |
| Close-up     | checker squares on the face small enough at the closest shot; blurred means more density                                                                               | Paulino [00:07:06]                 |

## 8. Packing

| Check       | Pass                                                                                              | Source                        |
| ----------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| Padding     | at least `mip_padding(map, smallest)` between shells and to borders                               | Maya 2027 Help                |
| Range       | 0-1 per set (games) or clean UDIM tiles with no shell across a border (film)                      | Polycount; mx_audit           |
| Stacking    | only mirrored shells, only in games, never where AO or a logo differs; offset 1 tile for the bake | Maya 2027 Help; Polycount     |
| Readability | shells upright, grouped, panels on pixel rows                                                     | Polycount                     |
| UDIM count  | no more tiles than the density needs (`udim_estimate`); per-tile resolution recorded              | Paulino [00:03:04] [00:05:48] |

## 9. Bake prep

| Check           | Pass                                                                                                                                    | Source                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Triangulation   | one bake copy used for baker and export                                                                                                 | Polycount                     |
| Cage            | the whole high inside the cage, or the low projected onto the high                                                                      | On Mars [00:17:45]            |
| Mirror          | whole mirrored model baked, mirrored UVs one tile over                                                                                  | Polycount                     |
| Round corners   | real edges on the low where the high is round                                                                                           | On Mars [00:12:50]            |
| Overlap renders | silhouettes of high and low differ under 2% per view [added]; no red (high outside the low) on corners and curvature in the diff images | On Mars [00:01:16] [00:07:27] |
| Tangent basis   | written in the package (MikkTSpace for Unreal and Unity)                                                                                | maya-version-deltas § 2.5     |

## Report format

Scores per section, blockers found, the numbers behind each (from `rep`, `dt`, `lid`, `uv`, `ov`),
the sheets opened, what the agent did not plan (face loops inherited from the base, parts left for a
human Quad Draw pass, a non-neutral source), and the fixes queued before handoff.
