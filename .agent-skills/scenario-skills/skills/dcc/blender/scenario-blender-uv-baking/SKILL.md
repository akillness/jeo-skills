---
name: scenario-blender-uv-baking
description: "Use when UV unwrapping, placing seams, straightening or packing UVs, setting texel density, laying out UDIMs or mirrored UVs, or baking normal, AO, curvature, ID or displacement maps from a sculpt or high poly onto a low poly or retopo in Blender, including Multires bakes. Also when a bake has black or inverted patches, flat areas, cracks, seams, wavy lines or AO ghosts, bpy.ops.object.bake returns CANCELED, or uv.unwrap silently fails."
license: MIT
---

# UV unwrapping and baking

Expert-level UVs put seams where the texturing method can afford them, set texel density before
texture size, and pack with pixel-true padding. Expert bakes measure their projection distances
instead of guessing, and are judged in pixels and under a raking light, never eyeballed once. Every
stage below has a measurable gate that [`scripts/bx_uvbake.py`](scripts/bx_uvbake.py) computes. If a
sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).

## Stance (the expert delta)

- **Seams follow the texturing method.** Kaspar (2021, 2D painting): as few as possible, hidden
  under hair, clothes and inner limbs. Blender Studio guide (2024, same author): more seams rather
  than fewer when you paint in 3D or bake, because stretch costs more. Game bakes add a hard rule:
  every hard edge is a seam, or the normal map cracks (Lampel, Gambrell, On Mars 3D, Polycount).
- **Only closed shells and long tubes need extra cuts.** Morren: anything closed on itself needs one
  cut. Gambrell: cut every taped-paper ring once, hidden. But an island with holes (a face with eye
  holes, a washer) flattens fine. `cut_to_disks` test-unwraps it and cuts only if it stretches
  [added; cutting everything folded the sheep's big islands].
- **Unwrap method is a measurement, and 5.2 defaults to CONFORMAL.** Always pass `method=`. On
  Suzanne, Minimum Stretch gives the most even density (spread 1.38), Angle Based the best angles,
  and Conformal fails by area (5.89). On flat hard-surface islands all three converge.
  `unwrap(method="BEST")` picks per island and rejects islands that fold over themselves.
- **Density first, texture size second** (Huge Menace). Targets: FPS 10.24 px/cm, weapon 20.48,
  third person 5.12, top-down 2.56. Priority follows the camera: face, hands and front up; soles,
  inner mouth and back down (SpeedChar, Kaspar). Match texture sets by scaling the denser set down,
  never the other up (Gambrell).
- **Straighten, then equalize, then pack without tilting** (Lampel): Follow Active Quads from a
  truly rectangular quad, pin, re-unwrap the rest, pack with CARDINAL. Padding is a pixel number,
  res/128 (16 px at 2K), passed as FRACTION margin = gap/(2*res).
- **Measure the projection, never guess extrusion, and do not trust one global value.** Ryan King's
  0.01 then 0.02 was scene-specific. SpeedChar swept six values by hand, and the value that fixed
  the face broke the armpit ("when we fix something somewhere, some other problems occur",
  E6QMhGuhyoc [00:26:23]). Rays start on the low, and `max_ray_distance` counts from the extruded
  start. The adaptive bake keeps, per texel, the smallest extrusion that hits a front face. On the
  sheep it cut inverted texels from 7.5% to 1.2% [verified].
- **Unique UVs wherever baked lighting differs** (SpeedChar: an AO ghost means shared texels).
  Stacked or mirrored copies move exactly one tile out of 0-1 before the bake (Polycount), because
  inside 0-1 the last island baked wins.
- **A bake is judged in pixels and under light.** Blue < 0.5 means rays hit the far side. Exactly
  flat means rays missed. All-white AO means the distance is too small. Inverted pixels that do not
  move when extrusion changes point to a geometry problem, not a setting [verified on the sheep].
  Multires bakes cast no rays: on the same surface they gave 0.09% inverted texels.

## Establish first

| Input             | Changes                                      | Default when the brief is silent                         |
| ----------------- | -------------------------------------------- | -------------------------------------------------------- |
| Target            | seams, symmetry, UDIM vs sets, triangulation | game engine, one 0-1 set per material                    |
| Texturing method  | seam count and visibility                    | 3D painting/Substance: seams may show at the back        |
| Camera            | density and priorities                       | third person 512 px/m, closest view defines tiles        |
| Texture budget    | resolution, sets, UDIM count                 | 2048 per set; `texture_size_for` decides                 |
| Deformation       | seams off joints, tangent-space normals      | character: tangent space, unique UVs                     |
| High source       | Selected to Active vs Multires               | separate sculpt: Selected to Active                      |
| Engine convention | normal green channel                         | OpenGL (Blender, Unity, glTF); `directx=True` for Unreal |

## Workflow

1. **Pre-flight.** Apply scale (On Mars 3D: it "fixes the vast majority" of problems). Clear
   non-manifold geometry, doubles and back faces (SpeedChar). Decide on Mirror and Solidify
   modifiers. If UVs exist, compare `island_topology` with `uv_qa` islands: seam flags in files are
   often leftover retopology marks, so run `seams_from_uv_islands` (Lampel) before re-unwrapping.
   GATE: scale 1, `bx_audit` clean, topology table read.
2. **Seams.** Hard surface: `seams_from_sharp(obj, 30, mark_sharp=True)`. Organic: build part labels
   (head, ears, limbs, torso front and back, soles, inner mouth and eyelids per the Kaspar and
   Morren seam maps in [`references/expert-notes.md`](references/expert-notes.md)), then
   `seams_from_groups(obj, labels)`. Specific cuts: `seam_path(obj, v_a, v_b, view_dirs)`. Then
   `cut_to_disks(obj, view_dirs=[camera])`. GATE: `must_cut` empty; a checker render shows no seams
   across hero areas that the brief cannot afford.
3. **Unwrap.** `unwrap(obj, method="BEST")`, or the method the island type calls for. GATE:
   `unsolved_faces` 0 (the operator returns FINISHED even when it fails), `folding_islands` empty
   (else `seams_from_groups(..., faces=folding_faces)` and unwrap again), angle p95 at most 15 to 20
   deg.
4. **Straighten** grid-like islands (hard surface, garments, strands): `straighten(obj)` before any
   scaling. GATE: straight stripes in the checker.
5. **Texel density.** `normalize_texel_density(obj, target, res, weights)`, then
   `texture_size_for(obj, target)`. GATE: island spread within 10-20%, or the intended priority
   ratios.
6. **Pack.** `pack(obj, tex_res=res)`, with `scale=False` for a strict density and `allow_any=True`
   for organic islands. UDIM: pack each region, then `move_to_tile`. GATE: `uv_qa`: 0 overlaps, gap
   at least res/128, border at least gap/2, coverage at least 0.70 or an explained exception.
7. **Look.** `uv_layout_image`, `checker_review`, `distortion_review(metric="angle")`. Judge with
   [`references/critique.md`](references/critique.md).
8. **Bake prep.** `prepare_low(low, triangulate=game, sharp_from_uv_islands=hard_surface)`. Check
   the silhouette against the high (`bx_audit.audit(low, high=...)`). Explode interpenetrating or
   moving parts (`explode`, one axis). Run `measure_projection`: `miss_pct` under 2 and
   `wrong_part_pct` under 1, else use a cage, explode, or bake per pair.
9. **Bake.** `bake_high_to_low(low, highs, out, res=512)` first, then the final resolution. It uses
   adaptive extrusion by default and hides every other object from render. Multires:
   `bake_multires`. Extras: `bake_id`, `curvature_from_normal`. GATE: `sanity[...]["problems"]`
   empty (inverted texels under 2%, notes from 0.2%), 16-bit PNG. If inverted texels remain, run
   `map_problem_review` to see where. If `sweep_projection` shows they do not move with extrusion,
   fix the geometry (fit, holes, thin parts), not the numbers.
10. **Review and hook up.** `bake_review(low, highs, paths, out)`: the low with maps must read like
    the high under the raking light. Then `hookup_maps`. Report measured numbers and what was not
    verified.

## Numbers

| Value                                                                                  | Relative to                                      | Source                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| 10.24 / 20.48 / 5.12 / 2.56 px/cm                                                      | FPS world / FPS weapon / third person / top-down | Huge Menace [00:12:28]                        |
| 10-20% density mismatch invisible                                                      | between islands or sets                          | Gambrell [01:36:16]                           |
| coverage above 70%, 75% studio minimum                                                 | one 0-1 tile                                     | Gambrell [01:31:56], Huge Menace [00:16:27]   |
| island gap res/128 (8/16/32 px at 1K/2K/4K)                                            | texture resolution                               | Lampel [00:38:01], On Mars 3D [00:11:18]      |
| FRACTION margin m: gap 2m, border m                                                    | Blender pack                                     | verified                                      |
| bake margin res/128, 16 px at 2K                                                       | texture resolution                               | On Mars 3D, digest                            |
| cylinder sides: 6 min, 8 recommended                                                   | low poly silhouette                              | On Mars 3D [00:03:48]                         |
| samples: 16 for normals, 128 for AO, 1 only while iterating                            | antialiasing and noise                           | Gambrell/Marmoset 16, SpeedChar 4x4, verified |
| test bake 512, final 2048                                                              | iteration loop                                   | SpeedChar [00:59:09]                          |
| AO distance about 0.2 x bbox diagonal (default 10 units)                               | asset size                                       | [added], verified effect                      |
| angle error p95 at most 15 deg organic, 3 deg flat                                     | per corner                                       | [added] from 5.2.1 measurements               |
| Blender packer on an organic character: 55-62%                                         | 16 px gap at 2K                                  | measured on the sheep (several runs)          |
| inverted texels: single pass 7.3-7.8%, adaptive 2.2% (sculpt) / 1.2% (consistent high) | selected to active, sheep                        | measured                                      |
| 2048 bake, 186k-face high: one pass normal + AO 4.4 s, adaptive 25 s                   | Metal GPU, headless                              | measured                                      |

## Quality gates

Code: `q = uv_qa(obj, res)`, then `uv_verdict(q, "game" or "film", priorities=...)`.
`unwrap()["unsolved_faces"]` and `["folding_islands"]`. `measure_projection()`.
`bake_high_to_low()["sanity"]` (inverted, exact-flat, non-unit, AO black and white). Cross-check
overlaps with `bpy.ops.uv.select_overlap()` when in doubt; it agreed with the raster on the tests.

Visual: layout PNG (islands, magenta overlaps), color-grid checker from front, side, three-quarter
and the production camera (squares square, letters upright, seams hidden), angle and density heat
maps, `bake_review` sheet (high, low, low + maps), `map_problem_review` when sanity flags pixels.

## Common mistakes

| Mistake                                                    | Looks like                                  | Fix                                                                |
| ---------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `uv.unwrap()` without `method`                             | Conformal area distortion                   | pass `method=` or use `unwrap(method="BEST")`                      |
| Trusting FINISHED                                          | closed island keeps its old UVs, repacked   | zero the UVs first, check for zero-area faces (`unwrap()` does it) |
| Re-unwrapping without Seams from Islands                   | layout lost; retopology marks used as seams | `seams_from_uv_islands` first                                      |
| Cutting every island to a disk                             | slits, folded islands                       | measured `cut_to_disks` (default)                                  |
| Pack rotation ANY after straightening                      | tilted grids, jaggy lines                   | CARDINAL                                                           |
| Blender margin 0.005                                       | padding depends on island scale             | FRACTION, gap/(2*res)                                              |
| Target node active but not selected                        | bake returns CANCELED, no error             | select and activate; assert FINISHED                               |
| Low carries the sculpt as Multires                         | almost flat normal map                      | render levels 0 for the bake (bake_high_to_low does it)            |
| max_ray shorter than extrusion                             | 90% exactly flat map                        | ray = extrusion + inward depth                                     |
| One global extrusion on thin, close parts (ears on a head) | inverted patches, neighbors baked in        | adaptive bake (default), explode, or per-pair bakes                |
| Other objects render-visible during AO                     | black AO                                    | hide them from render; the active low never occludes               |
| Default AO distance 10                                     | AO all dark or flat                         | about 0.2 x asset diagonal                                         |
| Stacked UVs baked in 0-1                                   | one side's detail on both                   | unique UVs or `offset_stacked`                                     |
| Hard edge inside an island                                 | crack lines                                 | seam it, or `prepare_low(sharp_from_uv_islands=True)`              |
| Editing UVs after the bake                                 | seams, tangent mismatch                     | never; re-bake                                                     |

## Blender 5.2 notes

- `uv.unwrap` defaults to CONFORMAL. On failure it keeps the island's old UVs and repacks them. It
  has `use_weights`/`weight_group` (default group "uv_importance"): importance weights with Minimum
  Stretch. A weighted top half went from 31% to 74% of UV area [verified].
- Sync select is on by default (5.0). `BMLoopUV` only has `uv` and `pin_uv`. A `me.uv_layers[...]`
  reference goes stale after an Edit Mode toggle, so keep the name.
- `pack_islands(udim_source="CLOSEST_UDIM")` headless packed a region sitting in 1002 back into
  1001: pack first, then move. `uv.move_on_axis` needs a UV editor.
- Bake: the target must be selected AND active (5.0). Operator defaults differ from scene defaults
  (`use_clear` False vs True, EXTEND vs ADJACENT_FACES): pass everything. Selected to Active uses
  the low's render evaluation (Multires render_levels, shape keys). Multires settings live in
  `scene.render.bake.use_multires` with `object.bake_image()`. A float image saved as PNG is 16-bit.
  Normal Map node `convention` OPENGL/DIRECTX (5.1). UDIM tiles need `image.tile_add(fill=True)`.
- Auto Smooth is gone (4.1): smooth shading plus sharp edges; Triangulate "Keep Normals" is
  `keep_custom_normals`.

## References

- `references/expert-notes.md`: judgment by expert with timestamps, disagreements and deciding
  conditions, my 5.2.1 measurements. Load when choosing seams, density or a bake strategy.
- [`references/procedures.md`](references/procedures.md): tested pipelines (hard-surface, character,
  film/UDIM, Multires, bake-fix loop) and raw bpy snippets executed by the tests. Load before
  writing code.
- `references/critique.md`: rubric for seams, stretch, density, packing, bake setup and baked maps,
  with proxies and severity. Load at every gate.
- [`references/sources.md`](references/sources.md): videos, credentials, URLs, best timestamps, web
  references.
- `scripts/bx_uvbake.py`: the module (docstrings list every function).
