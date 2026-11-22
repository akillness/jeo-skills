# Critique rubric: judging Grease Pencil output like a 2D lead

Use at every gate. Each item says what the experts look at, how the agent checks it (code or
render), and what failing looks like. Severity: **block** (fix before the next stage), **fix** (fix
before delivery), **note** (mention, fix if cheap). Run the code checks first, then open the
renders.

```python
for ob in gp_objects: print(ob.name, G.verdict(G.report(ob)))
G.render_frame("/abs/review/f.png", f)                        # full resolution
G.render_strip("/abs/review/strip.png", range(a, b + 1, 2), cols=6, res_pct=30)
G.onion("/abs/review/onion.png", f, before=(f - 2,), after=(f + 2,))
```

## 1. Structure and editability

| Check                                                                                                            | How                                                                 | Fail                                                                              | Severity |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| One object per physical element that moves or changes depth; layers inside by graphic role (Tom)                 | list objects and `[l.name for l in ob.data.layers]`                 | 200 layers in one object, or a part that must go behind another living on a layer | block    |
| Nothing blocks redrawing: no armature weights on drawings, procedural stages baked or kept optional (Tom, Weigl) | modifiers per object; `GREASE_PENCIL_ARMATURE` on a hand-drawn part | the animator cannot select and redraw a part                                      | block    |
| Layer order: Lines above Shadow above Fills (Grant)                                                              | `report()["layers"]`                                                | lines under fills, shadow on top of lines                                         | block    |
| Materials as buckets: one per color, no duplicates, no unused (Grant)                                            | `report()["info"]` unused materials; compare colors                 | three identical greens, recolor edits miss strokes                                | fix      |
| Keys cover the range: every visible layer keyed at or before frame_start (Elijah)                                | `verdict` "first key"                                               | drawing pops in, empty first frames                                               | block    |
| Instances are intended (editing one edits all)                                                                   | `report()["info"]` instanced drawings                               | a "fix" on one frame silently changes a cycle                                     | note     |

## 2. Line quality

| Check                                                                                                    | How                                                       | Fail                                                           | Severity |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| Line width readable at output size                                                                       | `verdict` sub-pixel lines; width px = 2 r / `G.px_size()` | hairlines, lines vanishing on downscale                        | block    |
| One line system: drawn lines match Line Art weight (Elijah); Line Art radius = width = 2 x stroke radius | compare radii; render crop                                | outline thin next to drawn details                             | fix      |
| Pressure taper on INK_PEN lines, constant on PEN lines, consistently per character                       | inspect radius profile, render                            | blunt sausage lines where taper was intended, or random widths | fix      |
| Ends: overlap then trim, no overhangs left, no gaps at joins (Grant)                                     | full-res render zoomed on joins                           | line ends poking past a crossing, gaps where lines should meet | fix      |
| Smooth curves, no facets or wobble (Elijah's "no facets"; smooth_path or `edit_op("stroke_smooth")`)     | render at 100 %; roughness of second differences          | polygonal corners on round shapes                              | fix      |
| No stray micro-strokes (Grant's cleanup)                                                                 | `verdict` stray micro-stroke                              | dots and slivers                                               | fix      |
| Heavier lines where momentum peaks (Elijah, impact frames)                                               | strip at the hit frame                                    | uniform weight on an impact                                    | note     |

## 3. Fills and color

| Check                                                                                             | How                                                         | Fail                                                     | Severity |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- | -------- |
| Intended fills have `fill_id != 0`, holes share the outer id (Falk)                               | `drawing_stats()["fill_ids"]`; `verdict` invisible strokes  | outline only, hole filled solid                          | block    |
| No gap between fill and line (Grant zooms for this after sculpting)                               | full-res render crop at edges                               | background showing between fill and line                 | fix      |
| Palette matches targets under Standard (Elijah)                                                   | sample pixels vs hex values; `view_transform == "Standard"` | shifted hues under AgX, dark colors                      | block    |
| Lighting intended: flat look has unlit layers; lit look has `World.color` ambient and lamps       | `verdict` lit-without-light                                 | a flat palette rendered at a quarter of its value        | block    |
| Shadows read as designed shapes, masked to the fill, Multiply with lowered opacity (Grant, Pablo) | render; `layer.mask_layers`, blend mode                     | blobby soft 3D shading, shadow spilling outside the body | fix      |
| 2.5D fills do not poke through canvas meshes; many small fills rather than one big one (Pablo)    | render from the shot camera and one off angle               | fill slicing through the surface                         | fix      |

## 4. Staging and depth

| Check                                                                                                            | How                                                        | Fail                                                           | Severity |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| Front/behind order matches the plan                                                                              | `G.draw_order(objs)`                                       | arm drawn over the body when it should pass behind             | block    |
| Multiplane discipline: elements parallel to the camera, camera axis fixed, unless the brief wants 3D moves (Tom) | object rotations vs camera; camera keys                    | flats seen edge-on, parallax that reveals cards                | fix      |
| Everything the shot needs is inside the frame with margin; nothing drawn off screen (Tom's layout lesson)        | render with passepartout or overscan; bbox vs camera frame | cut-off limbs, background plates too small for the camera move | block    |
| Depth reorders do not change the image (perspective: `push_depth`)                                               | before/after render alpha diff                             | part visibly shrinks when sent behind                          | fix      |

## 5. Timing, spacing and in-betweens

| Check                                                                        | How                                    | Fail                                                  | Severity |
| ---------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- | -------- |
| Interpolated pairs are "sculpted" (Tom)                                      | `G.match` before every interpolation   | twisted or smeared in-betweens                        | block    |
| Different drawings clipped or redrawn, never forced (Tom's clip mode)        | strip                                  | mush between two unrelated poses                      | block    |
| Spacing follows intent (ease in/out, charted spacing), arcs on the onion     | `G.onion`, `inbetween(spacing=...)`    | even spacing everywhere, drawings popping off the arc | fix      |
| Object motion keyed with the drawings (native interpolation ignores it, Tom) | object F-curves exist where parts move | parts sliding under a static drawing                  | fix      |
| Repeated actions vary: blinks, hits, raindrops offset (Elijah)               | key frame lists; strip                 | metronome timing                                      | note     |
| Effects end with an empty key, not a hidden dot (Elijah's "better way")      | `G.exposures`                          | leftover dots, effect lingering                       | fix      |

## 6. 2.5D and hybrid

| Check                                                                                                | How                                            | Fail                                                   | Severity |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ | -------- |
| Surface stays unreadable in motion (Weigl)                                                           | render a sequence, never a still               | the 3D form reads through the strokes once it moves    | block    |
| Projected strokes sit on their mesh; strokes with missed or occluder-captured points dropped (Pablo) | `project_to_surface` lists; distance to canvas | strokes floating off the silhouette or stuck to a hand | block    |
| Artist layer order preserved after sorting (Weigl)                                                   | layer stack per object; draw order of groups   | strokes interleaving across parts                      | fix      |
| Detail density coherent with distance (Weigl's LOD)                                                  | strip of a dolly move                          | far objects crawling with strokes                      | note     |
| Hybrid 3D parts read as drawn (Pablo, Tom)                                                           | render                                         | CG shading visible among drawn parts                   | fix      |

## 7. Delivery evidence

- Verdicts for every GP object, the strip, one full-resolution frame and, for animation, the onion
  at the busiest frame.
- State what was not checked (for example LOD transitions, GUI-only operations, onion skin in the
  viewport).
