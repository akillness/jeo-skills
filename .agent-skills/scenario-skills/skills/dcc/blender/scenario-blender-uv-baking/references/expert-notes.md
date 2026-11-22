# Expert notes: UV unwrapping and baking

The judgment behind SKILL.md, by expert, with source and timestamp. [added] = not stated by an
expert (my measurement or heuristic). [verified] = run in Blender 5.2.1 (test scripts in
`tests/code/blender-uv-baking/`, distiller probes in `archive/tests/uv_unwrapping/` and
`archive/tests/uv_snow_and_baking/`).

## Where experts disagree, and what decides

| Topic                      | Position A                                                                                                                       | Position B                                                                                                                                                             | Deciding condition                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| How many seams             | Kaspar 2021: "as few seams as possible, hide them" (_LI28r-Nk5g [00:34:00]; 8wmhYarIyjw [01:37:04])                              | Blender Studio guide 2024, same author: "more seams rather than less, stretching and uneven texel density is much more of an issue"                                    | 2D painting (Krita, image editor) makes every seam cost paint-over time: fewer. 3D painting, triplanar and baking: stretch costs more than seams (On Mars 3D dm3bBpZVmnE [00:26:18]). Games add mandatory seams on hard edges, and every seam duplicates vertices (Polycount).                                                                                                 |
| Unwrap method              | Lampel: Angle Based "almost always better", the manual's Conformal advice "not quite accurate" (KCKro3eGmLM [00:16:28])          | On Mars 3D and Gambrell: Conformal for hard surface (dm3bBpZVmnE [00:05:38]; HDURGTLNu2Q [01:03:04]); Morren: Minimum Stretch to finish heads (JwkgVckqGw4 [00:45:33]) | Island shape. Flat islands bounded by sharp-edge seams converge in every method; curved islands need Angle Based (angles) or Minimum Stretch (area). Measured on Suzanne: spread 2.08 / 5.89 / 1.38, angle error 9.6 / 10.4 / 12.9 deg for Angle Based / Conformal / Minimum Stretch [verified]. Conformal fails by area, not angle. `unwrap(method="BEST")` picks per island. |
| Symmetric UVs              | Film: symmetric halves (Mirror U + Flip UDIM) so textures can be mirrored in 2D (_LI28r-Nk5g [00:45:36]; 8wmhYarIyjw [01:57:37]) | Games: ignore symmetry, use the space; stack mirrored parts (8wmhYarIyjw [01:58:10]; Gambrell HDURGTLNu2Q [01:10:43])                                                  | 2D editability vs unique texel budget. Anything with asymmetric baked AO needs unique UVs (SpeedChar qFMwPSv5KwA [00:04:29], E6QMhGuhyoc [00:04:56]). Stacked copies are offset exactly 1 tile before baking (Polycount).                                                                                                                                                      |
| UDIM or texture sets       | Film creature: UDIMs in one material, per-region resolution (Hernandez 55sGQLX7iho [00:06:33]; Kaspar 3 tiles [00:14:44])        | Game truck: split materials into texture sets (Gambrell [01:25:24])                                                                                                    | Target renderer: engines consume one 0-1 set per material [added]; offline renderers read UDIMs.                                                                                                                                                                                                                                                                               |
| Texel density              | Uniform: a sharp part next to a blurry one "doesn't make any sense" (Gambrell [01:22:40])                                        | Deliberate priorities: eyes, head, hands denser than shirt (Kaspar xZsrMfCI1Wg [01:28:32]; SpeedChar [00:11:05])                                                       | Hero close-up areas vs tiled/procedural surfaces; measure per priority group, not globally.                                                                                                                                                                                                                                                                                    |
| Margin                     | Lampel: res/128 for games, less for film (KCKro3eGmLM [00:38:01])                                                                | On Mars 3D: 0.005-0.01 in Blender units (dm3bBpZVmnE [00:06:55]); 16 px at 2K (C_RqdNbYOjE [00:11:18])                                                                 | Different units. Blender's default Scaled margin is relative to island scale. For pixel-true padding use FRACTION: gap between islands = 2 x margin, border = margin [verified]. 16 px at 2K = res/128.                                                                                                                                                                        |
| Hard edges on the game low | All smooth ("Auto Smooth 180", SpeedChar qFMwPSv5KwA [00:48:50]); a fully smooth low "looks okay" (On Mars 3D [00:08:36])        | Hard edges with seams keep the normal map flat enough to survive compression (On Mars 3D [00:09:43])                                                                   | Compression and vertex budget. Hard edges only where there is a seam; film meshes are subdivided and smooth anyway.                                                                                                                                                                                                                                                            |
| Extrusion vs cage          | Extrusion only, 0.01 then 0.02 (Ryan King Zxl38NpPWdo [00:09:49])                                                                | Custom cage when one distance cannot fit (On Mars 3D [00:13:44]; Polycount)                                                                                            | Tight gaps (fingers, flat faces missed): cage. One distance fits: measured extrusion.                                                                                                                                                                                                                                                                                          |
| Bake precision             | 32-bit float for normal maps, "a lot higher detail" (Ryan King [00:07:33])                                                       | 32-bit float "good for films, not for games" (Abbitt LvFilHJfinU [00:18:25])                                                                                           | Bake in float (no banding), deliver 16-bit PNG (Polycount), 8-bit only at export. A float image saved as PNG is written 16-bit [verified].                                                                                                                                                                                                                                     |
| Separate high vs Multires  | Selected to Active from a separate sculpt (Ryan King)                                                                            | Multires on the game mesh, bake from Multires, "much quicker" (Abbitt [00:21:43])                                                                                      | Multires needs the low to be the Multires base (same topology). Retopologized sculpts, kitbashed highs, AI meshes: Selected to Active.                                                                                                                                                                                                                                         |
| Ray distance               | One global value, accept small artifacts (SpeedChar E6QMhGuhyoc [00:27:30])                                                      | Region texture sets baked with their own distance and composited (SpeedChar [00:28:04], rejected as hassle)                                                            | Cheap in code: bake regions with their own measured distances into one image with `use_clear` only on the first pass [verified accumulation, distiller probe_pairs.py].                                                                                                                                                                                                        |

## Julien Kaspar (Blender Studio), Snow UV lives and the 2024 UV guide

- Seams first for invisibility: under clothing, behind the hairline, inside lips, on the inner side
  of limbs; legs on the inner side are "the best place to hide seams of all" (_LI28r-Nk5g
  [00:10:01], [00:40:27]).
- Back-of-head seam stops where a shorter haircut would still hide it, to keep alternative
  hairstyles possible [00:13:04].
- Separate the sides of anything that wraps around (ears front and back), like a cube [00:36:45].
- Area stretch is the working view (distribution); angle stretch is the hard limit that must stay
  out of yellow [00:16:59], xZsrMfCI1Wg [00:38:33]. The overlay is relative and not UDIM aware: read
  uniformity per tile, not colors [01:15:03].
- Pins are the real relaxation tool: pin a few points, move them, let the solver re-flow; the UV
  relax brush is "just 2D", "not relaxing, it's smoothing" [00:50:33], [01:43:38], 8wmhYarIyjw
  [01:59:42]. Two pins per island lock position, rotation and scale through re-unwraps [01:40:04].
- Close eyes and mouth in UV space: unwrap with a closed-eye shape key, or pin the outer and inner
  eyelid loops and pull the inner ones together [00:51:44], [00:56:16].
- Live Unwrap "freaking out" means a missing seam, flipped faces, or overlapping pinned points
  (xZsrMfCI1Wg [00:17:28], [01:09:36]).
- Clothing UVs follow the sewing pattern and are straightened: "you don't have a shirt that has
  fabric patterns that move in a curve along the sleeve" (xZsrMfCI1Wg [00:53:19]). Retopology should
  already put a loop on every garment seam (8wmhYarIyjw [00:08:53]).
- Density is intentional and per tile: eyes, head, hands more than shirt (xZsrMfCI1Wg [01:28:32]).
- Film symmetry: Mirror modifier with Mirror U + Flip UDIM mirrors each half around its own tile
  center, so the center line must sit at u = tile + 0.5 (_LI28r-Nk5g [02:05:34]).
- UVs are judged at the highest subdivision level, "that's where the uvs need to look really good"
  [01:08:22].
- Games triangulate the low before baking so baked shading matches the engine (8wmhYarIyjw
  [00:26:11]).
- Align UVs to form flow (hair strands, stitches) on a secondary UV map if not on the main one; turn
  Live Unwrap off first, it is stored in the Scene (8wmhYarIyjw [01:28:42], [02:00:58]).

## Jonathan Lampel (BCON23)

- "Every sharp edge has to be a seam" on assets that get baked normals; otherwise the normal map
  glitches, because the texture needs overshoot at the island edge (KCKro3eGmLM [00:19:55]).
- Seams from Islands before re-unwrapping a projection or primitive UV, or its islands are lost
  [00:09:56]. [verified on the sheep: the file's seam flags were retopology region marks (23 seam
  islands, 16 of them rings) while the UV layout had 11 islands; `seams_from_uv_islands` recovers
  the real seams.]
- Straightening recipe: straighten one quad, make it active, Follow Active Quads on the grid region,
  pin, unwrap the rest so it relaxes around the pinned grid [00:30:09]-[00:33:32]. Straight islands
  read cleanly at lower resolution and pack tighter [00:29:03], [00:48:14]. [verified headless:
  torus edges axis-aligned 1.6% to 100%.]
- Pack with Cardinal or Axis-Aligned rotation after straightening; Any tilts them [00:35:49].
  Average Islands Scale before packing "most of the time" [00:34:43].
- Margin about res/128 for games because mipmaps bleed; film needs less [00:37:29]-[00:38:01].
- Live Unwrap silently resets hand-tuned islands anywhere on the object when a seam is added
  [00:21:56].
- Sub-D meshes stretch at seams with the default UV Smooth "Keep Boundaries": use Keep Corners and
  Junctions (On Mars 3D prefers All), or unwrap with Use Subdivision Surface at the render level
  [00:23:24], [00:17:34].
- Pack by material (texture set), not by object [00:38:59].

## Jim Morren (CG Boost)

- Decomposition: every shape is a cube, cylinder, ring or sphere; cut the caps off and down the
  length of anything cylindrical (JwkgVckqGw4 [00:17:53]).
- Through-holes must be seamed or the unwrap "squeezes through these holes" [00:38:27].
- The active face for Follow Active Quads must already be rectangular, or the whole island skews
  [00:24:17].
- Sphere poles: seam the pole fans, straighten the quads, pin, re-solve the triangles
  [00:30:14]-[00:31:52].
- Head seam map: eyelid interior, mouth interior behind the lips, ear bases, jawline to ear, ear to
  ear at the back hairline, neck ring and a lengthwise neck seam at the back; the face stays
  seam-free [00:47:16]-[00:51:37].
- Eyes: a back-disc seam alone unwraps inside out; add a meridian seam far back. Scale the iris up,
  the back of the eye down [00:55:26]-[00:57:05].
- Mirror U gives the mirrored copy unique UVs if the source islands stay on one half [00:57:36].
- "You're going to have stretching regardless of what you do" [00:25:21].

## On Mars 3D (UV 2026, bakes 2024)

- Applying scale "will fix probably the vast majority of your issues"; rectangular checkers on a
  clean unwrap mean unapplied scale (dm3bBpZVmnE [00:02:20], [00:19:31]). [verified: unwrap and
  Average Islands Scale work in object space; a 2x unapplied scale halves the density.]
- Parts with thickness need the inner wall cut too [00:11:30].
- "You cannot minimize distortion without UV seams" [00:25:16]. The most common bad island is one
  missed edge [00:18:26].
- Silhouette first: the bake only fakes surface slope; check the low against the high in flat
  lighting (C_RqdNbYOjE [00:01:02]). Cylinders: 4 sides fail, 6 bare minimum, 8 recommended, 16
  clean [00:03:48].
- Every hard edge needs a UV seam, or black and white crack lines appear [00:05:17], [00:08:04]. A
  fully smooth low pushes gradients that break under compression [00:08:36].
- Padding 16 px at 2K [00:11:18]. Moving parts bake exploded, or neighbors' AO is baked in
  [00:12:36]. Custom cage when the automatic distance misses a face [00:13:44]. Match high and low
  by name to stop intersecting parts contaminating each other [00:17:46].

## Josh Gambrell (Blender Bros)

- Unwrap the low, not the high (HDURGTLNu2Q [00:02:22]). Apply form-defining Booleans, delete
  bakeable ones [00:06:01]. Low-poly bevels always one segment; rounded low bevels bake badly,
  "especially with ambient occlusion" [00:08:12].
- Ring rule: "imagine a piece of paper taped together, cut it somewhere and flatten it" [01:12:17].
- Overlap identical parts never seen together (Array, half-deleted Mirror); keep visible neighbors
  and tires unique [01:15:03], [01:15:36], [01:20:28].
- Split into texture sets when one 4K set gives big checkers; balance area; each set costs VRAM
  [01:24:51], [01:38:24]. Coverage above 70% [01:31:56].
- Match density across sets by scaling the higher set down: "we can always scale in, but we can't
  scale out"; 10-20% is not noticeable [01:35:11], [01:36:16].
- Triangulate (Keep Normals) before an external bake; `_low` / `_high` names for name matching
  [01:41:07], [01:44:25].
- Correction [added]: he says DirectX for Unity [01:52:36]; Unity uses OpenGL (Y+), Unreal DirectX
  (Y-) (Polycount swizzle table).

## Tristan (Huge Menace), texel density

- Density = texture pixels per unit of surface, independent of screen size (sR1sAWWT2x8 [00:00:47]).
  Consistent density is not consistent fidelity [00:05:41].
- Game targets: first person 10.24 px/cm (1024 px/m), first-person weapon 20.48, third person 5.12,
  top-down 2.56 [00:12:28]. Team decisions, "not gospel" [00:13:03].
- Density first, texture size second: step the size up until the islands fit [00:15:30]. When space
  is left: strict target, soft target (scale up to fill), atlas, change object scale, non-square
  texture; "most game studios require at least 75% of UV space to be utilized"
  [00:16:15]-[00:17:44].
- Delete faces that are never seen [00:10:13].

## Juan Hernandez (CG Boost), UDIMs

- UDIMs are just a UV offset; tile = 1001 + u + 10 v (55sGQLX7iho [00:02:05]). The one rule: no
  island crosses a tile border [00:05:54].
- Tile count from the closest camera, not ambition; one 4K beats sixteen, but sixteen 4K beat one
  16K [00:03:46], [00:07:05].
- Tiling micro-detail (weave, pores) belongs in the shader as tiling maps, not baked [00:15:54].

## Ryan King, baseline bake

- The face gets the biggest island; hidden areas way down (Zxl38NpPWdo [00:05:16]). High and low in
  the same place [00:06:32].
- Extrusion fixes black or wrong patches where the sculpt pokes outside the low; use "the smallest
  number that you need", too much makes extruded parts overlap [00:09:49], [00:11:32]. [added,
  verified: on the sheep, hand-picked 0.02 m / 0.05 m and the measured 0.033 m / 0.066 m gave the
  same ~7.3% inverted texels, and a sweep from 0.012 to 0.046 m did not move it; the bad texels sat
  in eye sockets, ear rims, hoof soles and the rear cut, where this retopo and this sculpt differ.
  When extrusion does not change the artifact, fix the geometry, not the number.]

## Grant Abbitt, Multires bake in 5.x

- Even out base face sizes before Multires: detail density follows face size (LvFilHJfinU
  [00:02:39]). Linear subdivision keeps a hard form [00:03:33].
- Bake from Multires compares viewport level (low) to render level (high): set viewport to 0;
  Conform Base rather than Apply Base, which distorts [00:19:32]. Check the level-0 silhouette; if
  the sculpt moved a lot, bake from level 1 [00:20:06]. [verified: equal levels bake a near-flat
  map.]
- Displacement bake is more useful as a cavity/roughness mask than as displacement on a game asset
  [00:23:52].

## Nikolay Naydenov (SpeedChar, Gameloft), production frame

- Texture budget first: one 2048 for head, body, teeth, eyes; the weapon on half a 1K (mcEcWwcPtmA
  [00:00:00]). Overlaps are "a no-no" in unique UVs [00:05:17]. Checker: "mostly squares and most
  squares the same size" [00:09:34].
- Non-manifold edges, stray faces, back faces break unwraps: clean before UVs (mcEcWwcPtmA
  [00:25:07]; qFMwPSv5KwA [00:36:13]).
- Texel priority follows the camera: face front, chest front, arms, upper glove big; back of neck,
  soles, glove underside small; reversed for behind-the-back cameras (qFMwPSv5KwA [00:11:05],
  [00:25:22]).
- Material name = texture set = texture file name (qFMwPSv5KwA [00:47:46]). Test bake at 512, final
  2048 with 4x4 anti-aliasing [00:59:09].
- Diagnosis table (E6QMhGuhyoc): black triangle = UV overlap [00:01:36]; AO ghost where nothing
  occludes = shared UVs [00:04:56]; straight line in the normal map = triangulation mismatch
  [00:18:37]; skew or misses = ray distance [00:21:25]. Fixing the distance for the face broke the
  armpit: "when we fix something somewhere, some other problems occur" [00:26:23]. UVs are "almost
  never final" [00:07:41].
- Explode along one axis only (Z) so reassembly is exact (speedchar digest, 6MccOhJZXPQ [00:01:06]).

## My measurements in 5.2.1 [added, verified]

- `uv.unwrap` returns FINISHED on a closed mesh without seams, prints "Unwrap failed to solve 1 of 1
  island(s)" only on the console, and keeps the island's previous UVs, rotated and repacked into the
  tile (affine fit residual 3e-8). It looks like a valid layout. Zero the UVs before unwrapping and
  look for zero-area faces after; `unwrap()` does this.
- Cutting every island to a topological disk over-cuts: on the sheep the studio's big islands with
  openings folded into slits. Islands with holes flatten fine when they are flat enough (a washer:
  spread 1.0, 0 cuts); `cut_to_disks` now test-unwraps them and cuts only when density spread > 2 or
  angle p95 > 20 deg.
- Angle Based folded a 1,180-face body island over itself by 1.2% of its pixels with zero flipped
  faces (global overlap); Minimum Stretch folded it by 0.02%. `unwrap(method="BEST")` penalizes
  folds.
- Blender's packer, 16 px gap at 2K, organic character islands: 55-62% coverage (CONCAVE, CARDINAL
  or ANY). Experts' 70-80% needs a dedicated packer (UVPackmaster: Gambrell 85-87%), straightened
  islands or hand packing.
- Selected to Active evaluates the low with its RENDER settings: a low carrying the sculpt as
  Multires (render level 3) bakes an almost flat map regardless of its viewport level.
- AO in Selected to Active: the active low never occludes (an inflated low enclosing the high
  changed mean AO 0.805 to 0.801); the selected highs occlude whether or not they are hidden from
  render; every other render-visible object occludes (a cube in front of the face darkened it).
- One global extrusion cannot serve a character with thin, close parts. On the sheep, single-pass
  selected-to-active left 7.3-7.8% inverted texels at every extrusion from 1.2 to 4.6 cm. That held
  even against the retopo's own Multires level 3 (7.5%), a high that matches the low by
  construction, while `bake_multires` on the same data gave 0.09%. Per-texel adaptive extrusion
  (smallest extrusion that hits a front face, from five passes) gave 2.2% and 1.2%, and matched the
  Multires bake (median texel difference 0.011). This is SpeedChar's rejected per-region idea
  (E6QMhGuhyoc [00:28:04]), done per pixel.
- An automatic cage (push out past the high, capped at half the free space to the next surface)
  baked worse (9.5%) than one distance; kept as `build_cage`, marked experimental.
- The sheep retopo carries a "body pose" shape key at 1.0: the bake uses that posed shape. Applying
  a Shrinkwrap for a fitting pass needs the key mix applied first
  (`shape_key_remove(all=True, apply_mix=True)`), or the modifier refuses and clearing keys reverts
  to the unposed basis.
- The distiller's nearest-point cage estimate (from every high vertex to the low) is inflated by
  high parts the low does not cover (the sheep's tail); measuring along the low's normals is not.
- A layer reference `me.uv_layers[...]` taken before an Edit Mode round trip becomes stale and can
  resolve to another attribute (`.corner_edge`); keep the layer name.
