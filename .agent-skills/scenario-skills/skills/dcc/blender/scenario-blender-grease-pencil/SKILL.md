---
name: scenario-blender-grease-pencil
description: "Use when drawing or animating with Grease Pencil in Blender 5.x from Python: 2D or 2.5D illustration, frame-by-frame animation, a cutout or part-based 2D character, strokes with pressure, filled shapes with holes, in-betweens and interpolation, onion skin, Line Art outlines, strokes on 3D meshes, NPR or hybrid motion graphics. Also when GP code fails (GPENCIL, frame.strokes, grease_pencil_modifiers), fills do not show, colors render dark, or draw brushes will not run from a script."
license: MIT
---

# Grease Pencil (v3, Blender 5.2)

Expert Grease Pencil work keeps every drawing editable and redrawable, puts meaning in the structure
(which object, which layer, which key) and judges the result in motion. The agent draws through the
data API (drawings are curves with attributes), builds characters the way 2D studios rig them, and
reviews rendered frames instead of a viewport it cannot flip. If a sibling skill named here is
missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to
install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas
and flag the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).
Shot planning, boards and animatics: scenario-blender-previs-storyboard. Mesh animation principles:
scenario-blender-animation.

Toolkit: [`scripts/bx_gp.py`](scripts/bx_gp.py) (tested on 5.2.1).
`import sys; sys.path.append("<this skill>/scripts"); import bx_gp as G`.

## Stance (the expert delta)

- **Tom Viguier (Andarta, Ewilan's Quest): the rig must never block redrawing.** One GP object per
  physical element (about 60 for a lead character), parented, mostly FK by object transforms; layers
  inside each element by graphic logic (line above color); sculpting as the deformer; no armature
  weight painting on drawings, because every redraw would need new weights.
- **Tom: interpolate only "sculpted" pairs.** Two keys interpolate cleanly only with the same
  number, order and color of strokes and the same points. Otherwise redraw, or "clip" to the nearest
  drawing instead of accepting distortion. Native interpolation ignores object animation: key
  transforms separately.
- **Falk David (GP module lead): fill is geometry, not material.** A stroke fills when
  `fill_id != 0`; strokes sharing an id fill together with even-odd holes; `hide_stroke` hides the
  outline. Material fill toggles are deprecated and holdout "eraser fills" (Grant Abbitt's 4.4
  method) are obsolete.
- **Grant Abbitt: the layer stack carries meaning and materials are paint buckets.** Lines on top, a
  shadow layer (Multiply, lowered opacity, masked by the fills) in between, fills at the bottom.
  Editing a material recolors every stroke using it. Lock what you are not editing: erasers and
  sculpt act on all unlocked layers.
- **Elijah Sheffield: predictable color first.** Standard view transform, flat unlit shading, white
  world. Verified trap: new layers have `use_lights=True`, and lit layers take their ambient from
  `World.color` (default 0.05), not from the world node tree, so a flat palette renders at about a
  quarter of its value.
- **Tom: multiplane discipline and layout first.** Every 2D element parallel to the camera, a camera
  that never changes axis, 3D only where it saves time; camera, cuts and parallax are settled in
  layout, not discovered in compositing. Between objects, depth decides who draws on top.
- **Michael Weigl: motion reveals the surface.** A painterly still breaks once it moves; judge 2.5D
  as a sequence. Sort groups of strokes (mesh islands), never individual strokes, and bake
  procedural output back to editable strokes.
- **Pablo Fournier (Blender Studio): design the shadows.** Replace blobby 3D shading with blocky,
  drawn light and shadow shapes (a light and a shadow material per part). Fills are flat: use many
  small fills on curved surfaces, not one big fill pushed forward.

## Establish first

| Input          | Changes                                                                                                                                  | Default when silent                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Deliverable    | still, frame-by-frame shot, cutout rig, hybrid motion graphics, 2.5D over 3D                                                             | frame-by-frame shot                                                                                        |
| Format         | resolution, fps, length                                                                                                                  | 1920 x 1080, 24 fps keyed on twos [added]; social motion graphics: 1080 x 1920, 12 fps, 60 frames (Elijah) |
| Look           | flat or lit, line system                                                                                                                 | flat (unlit layers, Standard); ink line with pressure taper                                                |
| Line system    | PEN constant width (matches Line Art, Elijah) or INK_PEN pressure on radius (cartoony, Grant) or PENCIL (pressure on radius and opacity) | INK_PEN                                                                                                    |
| Palette        | material colors                                                                                                                          | hex sRGB values, one material per paint bucket                                                             |
| Camera         | ortho multiplane or perspective                                                                                                          | ortho, front view, drawing plane XZ                                                                        |
| Who edits next | how much stays procedural                                                                                                                | a human animator: everything bakes to editable strokes                                                     |

## Workflow

1. **Stage and layout.** `cam = G.scene_2d(res, fps, frame_range, ortho_scale)` (ortho camera at -Y,
   Standard, background). Plan the multiplane: which elements are separate objects and their depth
   order. Compute `px = G.px_size()`; line width in pixels is `2 * radius / px`. GATE: a test render
   shows the frame; planned line widths are at least 1.5 px [added].
2. **Structure.** `G.new_object(name, layers=("Fills", "Shadow", "Lines"))` per element (bottom to
   top, unlit), parent parts, place origins at joints. `G.material(ob, name, stroke=hex, fill=hex)`
   once per bucket. GATE: `[l.name for l in ob.data.layers]` matches intent; `G.draw_order(objs)`
   lists front to back as designed.
3. **Draw.** Keys first: `d = G.key(ob, "Lines", frame)`. Lines:
   `G.add_stroke(d, G.smooth_path(control_pts), radius, pressure=G.taper(n), brush="INK_PEN", material=i)`;
   overlap then trim rather than landing ends exactly (Grant). Fills:
   `G.add_shape(d, outline, holes=[...], material=i)` on the Fills layer, outline on Lines. Bulk:
   `G.add_strokes(d, specs)` (3000 strokes in 0.04 s). Fix shapes with `G.grab`, `G.dissolve`,
   `G.edit_op(ob, "stroke_smooth", ...)`. GATE: `G.verdict(G.report(ob))` is clean and a
   full-resolution `G.render_frame` shows no gaps, leaks or overhangs.
4. **Color and shadow.** Shadow layer: `blend_mode='MULTIPLY'`, opacity lowered, `use_masks=True`,
   `mask_layers.add(fills)`; paint the shadow shape past the edge and let the mask clip it; design
   it blocky (Pablo). Lit look: `use_lights=True` plus `World.color` as ambient plus lamps
   (verified: a sun only scales value on a flat drawing, a point light gives a gradient). GATE:
   sampled pixels match the palette under Standard.
5. **Animate.** Replacement key `G.key(..., mode="blank")`, additive `mode="copy"`, hold or cycle
   `mode="instance"` / `G.cycle(...)`, end an exposure with `G.end_exposure`. Every visible layer
   needs a key at or before `frame_start` (Elijah). Cutout motion: key object transforms (FK).
   In-betweens: check `G.match(dA, dB)`, then
   `G.interpolate(ob, layer, frame, step=2, type, easing)` (native, segment around `frame`) or
   `G.inbetween(ob, layer, a, b, frames, spacing=[...] or ease=...)` for the animator's own spacing,
   `clip=True` when the pair is different. GATE: `G.exposures(ob, layer)` per layer,
   `G.render_strip(path, frames)` read left to right for timing and pops,
   `G.onion(path, frame, before, after)` for arcs and spacing.
6. **2.5D (optional).** Outlines: `G.lineart(source, radius=width_m)` (the modifier radius is the
   line width). Strokes on meshes: `G.project_to_surface(pts, mesh)` and discard strokes with missed
   or occluder-captured points (Pablo's failure modes). Relight:
   `G.relight(ob, canvas, light_dir, shadow, light)`. Procedural strokes: Geometry Nodes Curves to
   Grease Pencil with Instances as Layers off and a `fill_id` attribute, then apply to bake
   (procedures P7). Depth reorder without changing the image: `G.push_depth(ob, delta)`. GATE: a
   moving render (strip or playblast) where the surface does not read as 3D (Weigl) and fills do not
   poke through (Pablo).
7. **Deliver.** Render frames or video with the scene camera; keep the .blend editable (no applied
   procedural stage the animator still needs). GATE: every object's verdict clean, strip and final
   frames looked at, list what was not verified.

## Numbers

| Value                                                                | Meaning                                             | Source                    |
| -------------------------------------------------------------------- | --------------------------------------------------- | ------------------------- |
| `radius` = half line width (m)                                       | width px = 2 x radius / px_size                     | verified                  |
| px_size = ortho_scale / max(res_x, res_y)                            | ortho; perspective uses depth x 2 tan(fov/2) / res  | verified                  |
| 0.01 m                                                               | point radius while the `radius` attribute is absent | verified                  |
| Line Art `radius` default 0.0025 m                                   | is the line WIDTH: points get radius/2              | verified                  |
| Elijah's Line Art thickness 60 (4.x)                                 | about 0.006 m width in 5.2                          | [inferred]                |
| `use_lights` True, `World.color` 0.05                                | new layers render flat colors at about 25 % value   | verified                  |
| `set_uniform_thickness(thickness=t)`                                 | sets radius t/2                                     | verified                  |
| ~60 parts, ~100 rig versions, 2 weeks rig for a lead                 | Ewilan's Quest cutout scale                         | Tom                       |
| 12 fps, 60 frames, ortho scale 8, Subdivision 2 to 3 on shape meshes | hybrid motion graphics                              | Elijah                    |
| Stabilizer 40 px / 0.9 bundled, Elijah uses ~60 on demand            | only for long curves                                | Elijah, verified defaults |
| 1 light bounce                                                       | enough for stylized relighting                      | Weigl                     |
| GP anti-aliasing `aa_samples` 8                                      | scene.grease_pencil_settings                        | verified                  |

## Quality gates

Measurable (per object, every stage):

```python
for ob in gp_objects:
    print(ob.name, G.verdict(G.report(ob)))   # first key vs frame_start, lit-without-light,
                                             # invisible strokes, stray micro-strokes, sub-pixel lines,
                                             # fill/stroke alpha 0, empty masks; info: instances, unused materials
print(G.draw_order(gp_objects))               # front -> back vs the staging plan
print(G.match(dA, dB))                        # before any interpolation
```

Visual (open every image): `G.render_frame(path, f)` at full resolution for line quality, trims,
fill gaps and palette; `G.render_strip(path, range(a, b, 2))` for timing, holds and pops;
`G.onion(path, f, before, after)` for spacing and arcs (it includes object motion and modifiers,
which the viewport onion skin ignores, Falk and Rik); for 2.5D a sequence, never a still. Score
against [`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                                              | Looks like                                 | Fix                                                            |
| ---------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Layers left at `use_lights=True` with no lamps       | flat palette renders dark brown or gray    | `layer.use_lights=False`, or raise `World.color` and add lamps |
| Fill expected from the material                      | shape outline only                         | `stroke.fill_id=1`, `cyclic=True`; holes share the id          |
| `hide_stroke=True` with `fill_id=0`                  | stroke vanishes                            | give it a fill id or show the stroke                           |
| `attributes.new("radius")` on a drawing with strokes | existing strokes disappear (radius 0)      | fill defaults first (`G.add_strokes` does)                     |
| First key after frame_start                          | drawing pops in, empty frames at the start | key at frame_start (Elijah)                                    |
| Interpolating different drawings                     | smeared, twisted in-betweens               | `G.match`; redraw, resample, or clip (Tom)                     |
| Rigging drawings with armature weights               | every redraw breaks deformation            | object-level cutout, sculpt as deformer (Tom)                  |
| Stroke-level depth sorting                           | artist's layer order destroyed             | sort groups (objects or mesh islands) (Weigl)                  |
| One big fill on a curved surface                     | fill pokes through the mesh                | many small fills near the surface (Pablo)                      |
| Deleting stray points                                | stroke splits in two                       | `G.dissolve` keeps it continuous (Pablo)                       |
| Line Art radius set like a stroke radius             | outline half the intended weight           | Line Art radius = width = 2 x stroke radius                    |
| Judging 2.5D on a still                              | looks painterly, reads as 3D in motion     | render the sequence (Weigl)                                    |
| Calling draw brushes from a script                   | `Invalid operator call`, nothing drawn     | write strokes as data; see 5.2 notes                           |

## Blender 5.2 notes

- Types: object `GREASEPENCIL`, data `bpy.data.grease_pencils`;
  `layer.frames.new(n).drawing.add_strokes([...])`; old `frame.strokes`, `point.co`, `pressure`,
  `strength`, `GPENCIL` and `object.grease_pencil_modifiers` are gone. Modifiers are regular:
  `ob.modifiers.new(n, 'GREASE_PENCIL_NOISE')`, Line Art is `'LINEART'`.
- Stroke and point helpers are Python wrappers: re-fetch after adding or removing strokes, never
  cache them.
- `grease_pencil.brush_stroke` and `sculpt_paint` have no exec: called with a stroke list in a live
  session they log "Invalid operator call" and draw nothing (verified GUI); replayed mouse events
  via `event_simulate` also drew nothing. Draw and sculpt strokes are data; headless edit operators
  (`stroke_smooth`, `stroke_simplify`, `set_uniform_thickness`, `stroke_subdivide`, `outline`,
  `join_fills`, `set_curve_type`) run in Edit mode through `G.edit_op`. In a live session
  `G.gui_trim` (lasso Trim), `G.gui_erase_box` and `G.gui_reproject(type='SURFACE')` work with a
  3D-view override.
- `interpolate_sequence` runs headless on the active object and layer, fills only the segment around
  the current frame and inserts BREAKDOWN keys; easing via `type` and `easing`.
- `frames.new` or `frames.copy` onto an existing frame raises "Frame already exists";
  `get_frame_at(n)` returns the key exposed at n (None before the first key).
- `layer.mask_layers.add(layer)` is the 5.2 mask API; layer groups `gp.layer_groups.new`,
  `gp.layers.move_to_layer_group`; layers can parent to an object or bone (`layer.parent`,
  `parent_bone`) and carry their own transform.
- Line Art objects made by `object.grease_pencil_add(type='LINEART_OBJECT')` have lit layers;
  objects hidden from render are ignored by Line Art; `lineart_bake_strokes` bakes the whole scene
  range.
- GN Curves to Grease Pencil drops plain curves while Instances as Layers is on (default); Set
  Material alone no longer fills (5.1): store an INT `fill_id` on the curve domain.

## References

- [`references/expert-notes.md`](references/expert-notes.md): each expert's principles, judgment and
  disagreements with timestamps; load when making a style or pipeline decision.
- [`references/procedures.md`](references/procedures.md): tested raw-bpy procedures (P1 to P8) and
  bx_gp recipes (cutout character, frame-by-frame, interpolation, 2.5D); load before writing GP
  code.
- `references/critique.md`: the rubric for judging line, fill, staging, timing and 2.5D renders;
  load at every review gate.
- [`references/sources.md`](references/sources.md): the five source videos, what each is best for,
  best timestamps.
