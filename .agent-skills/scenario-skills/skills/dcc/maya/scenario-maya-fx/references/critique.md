# Critique rubric (scenario-maya-fx)

Judge the cache, never the live solve (SARKAMARI RhAxSgPpZww [00:19:32]). Every item has a
measurable side (run it) and a visual side (render or playblast it, open the image, write what you
see). An item passes only when both pass or the report states the exception and why (SARKAMARI
accepts small artifacts that motion blur hides in camera, [00:37:46]). Bars marked [added] are this
skill's defaults; the expert standard is the visual one.

## 0. Before looking at motion

| Check                    | Measure                                                          | Pass                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scale                    | `mx_fx.scale_report`                                             | solver size = real size, or a recorded art choice                                                                                                                    |
| Inputs                   | `cloth_topology_verdict`; the sim duplicate follows the original | no error; deviation < 0.01 cm                                                                                                                                        |
| Start state              | `nucleus_verdict`                                                | iterations > substeps; pre-roll >= 25 frames (50 preferred)                                                                                                          |
| Order of evaluation      | frames stepped from the start frame; GUI Play every frame        | no "frame change too large" in the log                                                                                                                               |
| Start frame and coverage | `sim_range_verdict`                                              | the sim's start frame (Bifrost default 1) exists in the timeline and evaluation begins there; cache and review reach the shot end (Nordenstam [00:56:23]; sim guide) |
| Restart after edits      | `sim_range_verdict(changed=...)`                                 | re-run from the start after a `geo_detail_size` or `time_step_size` change or a compound created or exploded (sim guide, Considerations)                             |

## 1. Cloth on a character (cape, garment, flag)

| Look at                   | Measure                                                                  | Visual: where and what                                                                           | Source                                             |
| ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Penetration               | `sim_report["penetration"]["action_max"]`                                | shot camera and a side camera; visible pokes through shoulders, back, legs                       | SARKAMARI [00:37:46]                               |
| Stretch                   | `stretch["max"]` <= 1.10 x rest [added]                                  | rubbery lengthening at the pin line and under the arms                                           | Jason hmuWr2nWSms [00:04:57]; SARKAMARI [00:24:16] |
| Standoff                  | `standoff` <= 2 x thickness [added]                                      | cloth floating off the body; Solver Display = Collision Thickness in the GUI                     | SARKAMARI [00:20:47]                               |
| Pops and explosions       | `motion["spikes"]`, `nan_frames` empty                                   | single-frame jumps when scrubbing the cache                                                      | doc, Tips [added bar]                              |
| Settle                    | `settle["fraction_of_reference"]` < 5% [added]                           | cloth still sliding when the action starts                                                       | SARKAMARI [00:05:26]                               |
| Stability across substeps | `convergence["max_rel"]`, coarse vs fine metrics                         | the fine run looks the same or better                                                            | SARKAMARI [00:29:57]; doc                          |
| Attachment                | pinned rows follow the input (under 0.5 cm, [added])                     | garment slides off shoulders or waist                                                            | Julan [00:07:10]; SARKAMARI [00:22:27]             |
| Weight and swing          | none                                                                     | against reference at the character's speed: heavy fabric lags and settles, light fabric flutters | SARKAMARI [00:36:39]                               |
| Folds                     | none                                                                     | wrinkle forms, armpit, back view, smooth preview on                                              | SARKAMARI [00:37:12]                               |
| Collar and shoulders      | none                                                                     | reads rigid like a real collar, not limp                                                         | SARKAMARI [00:34:51]                               |
| Constraint members        | `constraint_members_verdict`                                             | none on the output mesh; no Dependency Graph loop warning                                        | doc, Tips                                          |
| Cost                      | `timing_verdict` on seconds per frame (nucleus Timing Output in the GUI) | median under the brief's budget; slow frames explained                                           | doc, Timing Output                                 |

Render set: `mx_review.review` clay at the action start, the peak of motion and the last frame,
views side, back, threequarter; plus a playblast from the shot camera in the GUI.

## 2. Smoke, dust, mist (Aero)

| Look at            | Measure                                             | Visual                                                                                                               | Source                                      |
| ------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Scale and speed    | `scene_units_in_meters` vs `solver_scale(unit)`     | rise or spread speed plausible for the real size (a puff under a crate is fast and small)                            | Stamatelos [00:29:49]                       |
| Emitter conversion | `aero_source_verdict` on `emitter_facts`            | open or flat emitter in Shell, closed in Solid; Relative unless the size is known, an Absolute estimate under budget | Stamatelos [00:10:40] [00:12:48]; sim guide |
| Shape              | none                                                | rises or spreads, breaks up, dissipates; not a uniform lump or mushroom                                              | Jason cd3HgvM8sXg [00:03:12] [00:23:23]     |
| Style              | none                                                | smooth or wispy haze for dust and steam, fluffy for billows                                                          | Stamatelos [00:31:24]                       |
| Thin areas         | none                                                | voxels vanishing unnaturally in the tail (lower kill voxel fog threshold)                                            | Stamatelos [00:28:43]                       |
| Trails             | none                                                | stepped trails from a fast emitter (trail smoothness)                                                                | Stamatelos [00:17:23]                       |
| Collider gap       | none                                                | smoke floating above the floor (collider detail size)                                                                | Stamatelos [00:37:40]                       |
| Artifacts          | none                                                | jaggies or lines in the Arnold render; try tricubic before re-simulating                                             | sim guide                                   |
| Too smooth         | none                                                | missing small curls: sharpening, adaptivity bounds or `post_refine_aero` before a smaller detail size everywhere     | sim guide, Increase detail                  |
| Tail               | review frames include the last shot frame           | smoke still present, thinning naturally, not cut at the cache end                                                    | [added]                                     |
| Cache              | `file_sequence_report`: every frame, no growth jump | cache reads back in Read mode                                                                                        | graph doc; sim guide                        |
| Grids              | the file_cache property list                        | only fog density and velocity for render (plus temperature for fire)                                                 | Jason [00:28:35]                            |

Render set: `mx_fx.volume_review` at the source start, two mid frames and the tail, one dim dome
from above; playblast of the Bifrost shape in the GUI for timing only.

## 3. Granular and MPM (snow, sand, dirt, MPM cloth)

| Look at           | Measure                                                 | Visual                                                         | Source                                                          |
| ----------------- | ------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Collider contact  | none                                                    | particles floating above the ground                            | Gast [00:02:39]                                                 |
| Break pattern     | debris ratio (negative firmness) if exposed [added]     | crack pattern, piece size, sliding, healing                    | Gast [00:59:33] [01:09:18]                                      |
| Energy balance    | `initial_firmness` vs v squared                         | shatters on contact (too soft) or bounces as a lump (too firm) | Gast [00:53:08] [00:54:47]                                      |
| Instability       | `max_voxel_movement` retries rare                       | none                                                           | sim guide                                                       |
| MPM cloth stretch | `stretch_stats` on the cached mesh                      | no rubber; flag stays on its side of the pole; tears ragged    | Jason hmuWr2nWSms [00:04:57] [00:31:55]; yo6y7cANfX0 [00:05:47] |
| Double sim        | no direct make-to-simulate link next to `constrain_mpm` | two cloths, one falling                                        | sim guide                                                       |

## 4. MASH scatter and motion graphics

| Look at                       | Measure                                                              | Visual                                                                           | Source                                                      |
| ----------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Needs a cache                 | `mash_cache_reasons`                                                 | none                                                                             | 2027 Help; Waters                                           |
| Count and cost                | point count, `polyEvaluate(repro, face=True)`                        | viewport stays interactive                                                       | Waters GzXUcjz-M4E [00:03:22]                               |
| Evenness                      | none                                                                 | clumps on small faces, gaps on big ones                                          | Waters 5UDr_nK9PSs [00:02:47]                               |
| Stability on deforming meshes | per-point displacement vs the mesh's max vertex displacement [added] | points jumping when scrubbing (the foot)                                         | Waters [00:03:53]                                           |
| Intersections                 | `overlaps` on Repro shells                                           | plants and props through each other in camera                                    | Waters Qb2ZGa0JBns [00:03:02]; wloCNbLRetQ [00:16:06]       |
| Variety                       | none                                                                 | visible repetition of scale or rotation; only one input object showing (ID node) | Jason ifSJalXbGfI [00:28:55]; Waters GzXUcjz-M4E [00:02:15] |
| Render readiness              | Repro display = Mesh, LOD camera = render camera                     | proxies or LOD popping in the render                                             | Waters GzXUcjz-M4E [00:05:38] [00:07:13]                    |
| Time offsets                  | Time Scale keyed without Simulated Time flagged                      | catch-up burst when speed ramps                                                  | Waters xeSxL472d8Q [00:03:25]                               |

## 5. Deliveries

| Deliverable         | Measure                                                                                                                                                                                    | Visual                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| nCache              | `ncache_verdict`: mcx, or mcc under 2 GB per file; cloth transform static (positions only)                                                                                                 | scrub the cache with the nucleus disabled                                                                   |
| Alembic to lighting | `alembic_check`: range with handles, one mesh per cached object, vertex count; UVs and color sets written; the body or inner layer the cloth collided with included (SARKAMARI [00:39:34]) | open the cache-only render scene, scrub, render a frame                                                     |
| VDB to lighting     | `file_sequence_report`; grid list                                                                                                                                                          | `volume_review` sheet                                                                                       |
| Game sprites        | `sprite_framing` ok on every frame; 64 x 512 px, 8 x 8                                                                                                                                     | emission and smoke passes separate cleanly; the effect never leaves the cell (Jason bp9ydYUCmx8 [00:18:34]) |
| USD to Unreal       | `usd_check_unreal` clean (up Z, meters per unit, fps, default prim, triangles, unique names)                                                                                               | engine import: plays without instability, normals right up close (Jason QMx97b19oHk [00:16:50] [00:29:14])  |

## 6. The report

State: versions of every file delivered; the numbers above with their bars; which renders or
playblasts were looked at and what they showed; exceptions accepted and why; what was not verified
(every [verify] path used). "Looks fine" without an image path is not a verdict.
