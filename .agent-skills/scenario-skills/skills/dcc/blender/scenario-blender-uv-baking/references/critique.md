# Critique rubric: judging UVs and bakes like the experts

Use after every stage. Each line: what the expert looks at, the measurable proxy (`bx_uvbake`), and
severity. Severity: **block** = fix before the next stage; **fix** = fix before delivery; **note** =
mention, accept if the brief allows. Calibrate: a stage passes with notes; do not dramatize a note
into a block.

## A. Seams

| Look at                               | How the expert sees it                                                                                 | Proxy                                                                                                             | Pass                                                                                                         | Severity                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Seam visibility                       | Checker or stripes from the main camera; seams under hair, clothes, inner limbs, back (Kaspar, Morren) | `checker_review` views from the production camera; `cut_to_disks(view_dirs=...)` places cuts on faces facing away | No island border across the face, front torso or other hero area unless the brief uses 3D painting/triplanar | fix (film/2D paint), note (3D paint) |
| Hard edges vs seams (baked assets)    | Crack lines along edges after the bake (On Mars 3D, Lampel)                                            | `uv_qa()["sharp_edges_not_on_seams"]`                                                                             | 0                                                                                                            | block for game bakes                 |
| Closed shells, handles                | Unwrap fails or collapses                                                                              | `island_topology()["must_cut"]`; `unwrap()["unsolved_faces"]`                                                     | empty / 0                                                                                                    | block                                |
| Long tubes left uncut                 | Squashed, bent strips (Gambrell ring rule)                                                             | island density spread > 2 or angle p95 > 20 in the test unwrap (`cut_to_disks` does this)                         | cut once, hidden                                                                                             | fix                                  |
| Over-cutting                          | Slits, confetti islands, seams where nothing forced them                                               | island count vs part count; islands with < 10 faces; slivers in `uv_layout_image`                                 | Every seam has a reason: hidden, hard edge, tube, fold                                                       | note                                 |
| Symmetric seam placement (characters) | Left and right match (Kaspar Select Mirror)                                                            | compare seam edge sets mirrored in X                                                                              | Matches, unless the design is asymmetric                                                                     | note                                 |

## B. Unwrap and stretch

| Look at                                                             | Proxy                                                                             | Pass                                                                          | Severity             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------- |
| Angle stretch (skew) must stay out of yellow (Kaspar)               | `angle_err_p95_deg`                                                               | <= 15 deg organic, <= 3 deg flat hard-surface [added from 5.2.1 measurements] | fix above 20         |
| Area distribution even inside an island (checker squares same size) | `td_face_spread_p95_p05`; `distortion_review(metric="density")`                   | <= 2.0 organic, <= 1.25 hard surface                                          | fix                  |
| Folds (no flipped faces but the island covers itself)               | `unwrap()["folding_islands"]`, `self_overlapping_islands`                         | none                                                                          | block                |
| Flipped UVs                                                         | `flipped_faces`                                                                   | 0 (unless an intentional mirrored stack)                                      | block                |
| Straight grids straight (hard surface, garments, strands)           | axis-aligned share of island edges; stripes in the checker stay straight (Lampel) | >= 0.95 on islands meant to be grids                                          | fix                  |
| Orientation consistent (color grid letters upright)                 | checker render                                                                    | letters read the same way on neighboring islands                              | note (2D paint: fix) |

## C. Texel density

| Look at                               | Proxy                             | Pass                                                                   | Severity |
| ------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- | -------- |
| Density vs target                     | `texel_density()["px_per_m"]`     | within 10% of target (strict) or above (soft) (Huge Menace)            | fix      |
| Uniformity between islands            | `td_island_spread_p95_p05`        | <= 1.25 (Gambrell: 10-20% invisible), or the intended priority ratios  | fix      |
| Priorities follow the camera          | per-island TD vs the priority map | face/hands/front >= body >= back/soles/inner mouth (SpeedChar, Kaspar) | note     |
| Density across texture sets / objects | median TD per set                 | within 10%, higher set scaled down (Gambrell)                          | fix      |
| Consistent visual fidelity            | render with real textures         | texture content scale and sharpness match (Huge Menace [00:05:41])     | note     |

## D. Packing

| Look at                               | Proxy                                                                                   | Pass                                                                                                      | Severity                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Overlaps inside the baked tile        | `overlap_px_pct`, `overlapping_island_pairs`; cross-check `bpy.ops.uv.select_overlap()` | 0 (< 0.05% slit-tip slivers tolerated)                                                                    | block before baking                             |
| Padding                               | `min_gap_px`, `per_tile[...]["border_px"]`                                              | gap >= res/128, border >= gap/2                                                                           | fix                                             |
| Coverage                              | `per_tile[1001]["coverage"]`                                                            | >= 0.70, target 0.75 (Gambrell, Huge Menace); Blender's packer measured 0.55-0.62 on an organic character | note below 0.70 with the reason; fix below 0.50 |
| Islands inside the tile / tiles       | `tiles`, `faces_crossing_tiles`                                                         | game: [1001] only; UDIM: no face crosses a tile (Hernandez)                                               | block                                           |
| Straightened islands not tilted       | pack result `rotate`                                                                    | CARDINAL or AXIS_ALIGNED                                                                                  | fix                                             |
| Mirror-stacked layout going to a bake | `mirror_stacked_hint`                                                                   | offset +1 tile or unique UVs                                                                              | block for AO                                    |

## E. Bake setup (before pressing bake)

| Look at                                             | Proxy                                                               | Pass                                                             | Severity    |
| --------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------- |
| Silhouette of low matches high (On Mars 3D, Abbitt) | `bx_audit.audit(low, high=...)` fidelity; `bake_review` silhouettes | no visible profile mismatch                                      | fix         |
| Low shading                                         | `flat_shaded_share`                                                 | smooth, hard edges only on seams                                 | block       |
| Low evaluated at the base                           | Multires/Subsurf render levels on the low                           | base level (bake uses render levels)                             | block       |
| Projection                                          | `measure_projection`: `miss_pct`, `wrong_part_pct`                  | miss < 2%, wrong part < 1%; else cage, explode or per-pair bakes | fix         |
| Moving or intersecting parts                        | parts within the ray distance of another part                       | exploded along one axis (SpeedChar) or baked per pair            | fix         |
| Target image                                        | Non-Color, float for normal/displacement, node selected AND active  | `bake_high_to_low` does it; raw code asserts FINISHED            | block       |
| Game low triangulated                               | Triangulate modifier or triangulated mesh                           | present if the engine gets triangles (Kaspar #3, Polycount)      | fix (games) |

## F. Baked maps

| Artifact (SpeedChar, On Mars 3D, Polycount)     | Signature in `bake_sanity` / image                                                    | Cause                                                                                         | Fix                                                                                         | Severity                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| Black or wildly colored patches                 | `inverted_pct` > 2 problem, 0.2-2 note (blue < 0.5); `map_problem_review` shows where | ray start inside or behind a part of the high; or low and high differ there                   | adaptive bake (default); if a sweep does not move it, fix geometry (fit, holes, thin parts) | block above 2% on visible areas |
| Flat areas where the high has detail            | `flat_exact_pct` high, map std tiny                                                   | max ray too short (counted from the extruded start), high not selected, low not at base level | recompute, check levels/selection                                                           | block                           |
| Detail from the wrong part (fingers, neighbors) | speckles near gaps; `wrong_part_pct`                                                  | ray too long, parts too close                                                                 | shorter ray, cage shrunk locally, explode, per-pair bakes                                   | fix                             |
| Crack lines along edges                         | discontinuity on hard edges                                                           | hard edge without seam                                                                        | seam it or smooth it                                                                        | block                           |
| Big gradients across flat faces                 | low-frequency ramps in the image                                                      | fully smooth low on a boxy asset                                                              | hard edges + seams at 90 deg corners                                                        | fix (games)                     |
| Wavy lines on cylinders                         | sinusoidal bands                                                                      | too few sides, averaged normals                                                               | 8+ sides, support edges, cage                                                               | fix                             |
| Straight line through a face                    | line along a quad diagonal                                                            | triangulation differs between bake and engine                                                 | triangulate before baking, ship that triangulation                                          | fix                             |
| One side's detail/AO on both sides              | AO ghost with no occluder                                                             | stacked or mirrored UVs inside 0-1                                                            | unique UVs or offset +1 tile                                                                | block for AO                    |
| Jagged fine detail                              | aliasing                                                                              | samples 1                                                                                     | 16 samples (Marmoset 16, SpeedChar 4x4)                                                     | fix                             |
| AO pure white / flat                            | `white_pct` > 85                                                                      | world AO distance too small                                                                   | distance ~ asset scale                                                                      | fix                             |
| AO black                                        | `black_pct` > 10                                                                      | render-visible object enclosing the surface                                                   | hide it from render (bake_high_to_low does)                                                 | block                           |
| Bumps lit from the wrong side in engine         | inverted green                                                                        | OpenGL vs DirectX                                                                             | `directx=True` for Unreal                                                                   | block                           |
| Seams visible in render                         | color jump at UV borders                                                              | too little padding, mip bleed, tangent mismatch, UVs edited after baking                      | margin 16 px at 2K, same tangent basis, never edit UVs after baking                         | fix                             |

## G. The visual pass (always, before saying done)

1. `uv_layout_image(obj, path, color="island")` and `color="density"`: islands spaced, no magenta,
   sensible sizes.
2. `checker_review([obj], out)`: squares square and even, letters readable, seams where the brief
   allows.
3. `distortion_review(obj, out, metric="angle")`: red only where unavoidable (corners, poles).
4. `bake_review(low, [high], maps, out)`: row 3 (low + maps) should read like row 1 (high) under the
   raking light: same forms, no dark islands, no cracks, no seams, silhouette unchanged (the bake
   cannot fix silhouette).
5. Open the normal and AO PNGs themselves: no black islands, no noise speckles, no hard color jumps
   inside islands.

Report what was measured, what was looked at, and what was not verified (engine import,
compression).
