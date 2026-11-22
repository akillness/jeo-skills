---
name: scenario-blender-hair
description: "Use when grooming hair or fur in Blender with hair curves, such as a character hairstyle, animal fur, procedural fur in geometry nodes, or hair cards and mesh hair for games. Also covers the Essentials hair node assets (Interpolate, Clump, Curl, Frizz, Noise, Trim), density masks, bald spots, parting lines, strand shading in Cycles or EEVEE, and slow grooms. Use it too when a hair script misbehaves headless, for example stale modifier inputs or curve sculpt brushes that do nothing."
license: MIT
---

# Hair and fur grooming (hair curves, Blender 5.2)

Expert grooming means a few evenly spaced guides that set direction and silhouette. Stacked, masked
procedural layers add density, clumping, frizz, length variation and strays, judged in a lit render
at full density and in pose. Write guides as data (no curve brush stroke can be scripted in 5.2.1)
and make every look decision through the Essentials hair node-group assets. If a sibling skill named
here is missing from your available skills, load it with `skill_get` (Scenario MCP) or ask the user
to install it (https://github.com/scenario-labs/skills#install); unattended, proceed from tool
schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).

## Stance (the expert delta)

- **Guides get 2 points until every direction is right** (Schmidbauer). More points make combing
  tangle and clip. Use 3 for short fur, 8 only for long hair. Bystedt resamples long human hair to
  15 points before shaping.
- **Space guides evenly, and always mask Interpolate** (Schmidbauer). Children spawn over the whole
  surface, and a child far from any guide "does whatever". Gaps turn into bald spots that grow under
  deformation.
- **Density is counted per square meter and must be huge. Radius drops with it** (Thommes). Long fur
  uses 1,000,000/m² at about 0.2 mm radius. Work at a Viewport Amount of 4%.
- **Randomize per curve, not per point** (Thommes). Give 80% of strands no frizz. Strays are 10% of
  curves with strong noise.
- **Trim with Replace Length off plus a Random Offset** (Schmidbauer, Thommes). It is the cheapest
  realism gain. Mask it, or short-fur regions lose their guides and go bald.
- **Grow a human hairstyle on a separate hair cap split along the part** (Bystedt): body topology
  stops mattering, interpolation stops crossing the part. The part still needs extra density and a
  lift.
- **Shape works the same way on every asset**: 1 affects the tip only, 0 the whole strand, negative
  the roots. Use a negative Frizz Shape so curl and clump tips survive (Thommes, Bystedt).
- **Judge renders at full density, and in pose** (Thommes, Schmidbauer). A harsh mesh deformation
  "looks ten times worse" in the hair.

## Establish first

| Input        | Changes                                                                    | Default when the brief is silent                 |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------------------ |
| Target       | Cycles strands vs EEVEE or game cards                                      | Cycles strands (Principled Hair BSDF)            |
| Subject      | human hairstyle (hair cap, part) vs animal fur (body mesh, landmarks)      | follow the reference                             |
| Length class | points per guide, clump and curl layers                                    | short fur: 3 points, long: 8, long human: 15     |
| Deformation  | animated means Hair Dynamics (Animation) stays last, and you check in pose | animated                                         |
| Budget       | render curves, card triangles                                              | say the number: evaluated curves at full density |
| Reference    | same subspecies, season, ideally the same individual (Schmidbauer)         | ask for it; draw landmarks and flow first        |

Finish topology and non-overlapping UVs before grooming (hair binds to UV space) and apply scale:
density counts the mesh's local area (verified).

## Workflow

| Task                                                                                                                                | Headless                                         | Live session                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Curves object, surface binding, guides as data, snap, subdivide or resample, asset modifiers, inputs, masks, counts, renders, cards | yes ([`scripts/bx_hair.py`](scripts/bx_hair.py)) | yes, same code in Object Mode                                                                                                                                                                                   |
| Enter Sculpt Curves, activate the 11 curve brushes, set brush settings, `sculpt_curves.select_random`                               | n/a                                              | yes (`bx_gui.activate_brush("SCULPT_CURVES", "Comb")`)                                                                                                                                                          |
| Comb, Add, Density, Grow/Shrink, Pull Tips strokes                                                                                  | no                                               | **no**. `sculpt_curves.brush_stroke` has no exec, so `bx_gui.stroke("SCULPT_CURVES", ...)` returns PASS_THROUGH and changes nothing. Set the brush up and ask the user to stroke, or use the substitutes below. |

1. **Prepare the surface.** `H.uv_report(surface)`: stacked UVs make curves ignore the rig, UDIMs
   are fine, an unmerged mirror seam needs UV Merge by Distance (Schmidbauer). Humans: a hair cap
   split into islands along the part. Animals: separate the mouth interior. Masks: vertex groups
   (fast) or textures (detail on low-poly meshes). **GATE:** `overlap_faces == 0`, scale applied,
   one mask per region.
2. **Plan flow and objects.** Turn the draw-over into regions (vertex groups) with one flow
   direction each. Schmidbauer: one curves object per landmark (face, cheeks, ears, neck, body,
   tail, feet) for performance. Thommes: one object with masks. Bystedt: split front and back where
   combing one disturbs the other. **GATE:** written list of regions, flows, objects.
3. **Guides.** `hair = H.new_groom(surface)`, `P, N = H.sample_roots(surface, spacing, mask=...)`,
   `H.add_guides(hair, P, N, length, points=2, flow=..., flow_blend=...)` (snaps, writes
   `surface_uv_coordinate`). Later: `H.subdivide_guides` or `H.resample_guides(hair, 15)`. Brush
   substitutes: a direction field for Comb, `droop` for gravity, delete and re-add guides for
   Density and Add; Bystedt's "grow long, comb, shrink back" is long guides plus Trim. **GATE:** in
   `H.groom_report`, `roots_off_surface` and `spacing_gaps_2x` are 0 and `length_outliers` is 0. A
   guides-only render shows every direction right.
4. **Density.** Add Set Hair Curve Profile first, then Interpolate Hair Curves with a Density Mask.
   Bystedt paints 50% gray and 100% at the part, then remaps. The 5.2 Interpolate also takes a Mask
   Texture image. **GATE:** `H.count(hair)` (full density) is within budget, `root_area_fraction` is
   well under 0.5, and a render shows no bald spots.
5. **Procedural layers, each masked, A/B-tested by toggling `show_viewport` and rendering.**
   - Long fur (Thommes, preset `H.FUR_STACK_LONG`, applied with `H.build_stack`): Noise, Curl,
     strays, Frizz with negative shape, Clump, Clump 2, final Frizz (Cumulative off), Trim, Rotate.
   - Animal (Schmidbauer): Trim, Clump (cheeks, Tip Spread, Clump Offset), low Frizz, each with its
     own vertex group.
   - Human (Bystedt): Noise on guides (Cumulative off, Offset per Curve on), Roll at the tip only,
     then per population Interpolate, Profile, Clump on the groomed guides; wide and thin layers
     need different seeds.
   - Per-curve randomness: `H.random_curve_mask(hair, "frizz_mask", 0.8)` then input
     `"attr:frizz_mask"`; root-to-tip ramps: `H.along_curve_attr`. **GATE:** each layer earns its
     place in an A/B render.
6. **Part and hairline (human).** Leave Part by Mesh Islands on (default): in the test, 21% of
   children near the part crossed it with islands off and 0% with islands on. For the lift,
   `H.distance_weights(cap, "part_lift", "part", radius, "bump")` feeds Displace Hair Curves
   (Surface Normal on, small distance, Shape near 0, Factor `attr:part_lift`). **GATE:** in a top
   view there is no scalp gap at the part and the crown is not flat.
7. **Shading and render.** Use `H.hair_material(name, "CYCLES", melanin=(root, tip))` or `"EEVEE"`
   with explicit colors, then `H.setup_render(scene, engine, close_up)`. **GATE:**
   `H.review([surface, hair], out, engine)` passes
   [`references/critique.md`](references/critique.md).
8. **Deformation.** Key 2 or 3 extreme poses and render each frame from the same camera. **GATE:**
   no bald spots or clipping in any pose.
9. **Games: cards.** Run `H.add_cards(hair, width, material=H.card_material(...))`, then convert a
   copy with `object.convert(target='MESH')` and export glTF. Put a textured hair cap under the
   cards. **GATE:** triangles within budget, UVs in the half tile for cards, roots on the scalp.

## Numbers

| Item                  | Value                                                                               | Relative to, source                        |
| --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| Guide points          | 2 while placing, 3 short fur, 8 long hair                                           | Schmidbauer [00:20:24], [00:21:34]         |
| Long human hair       | resample to 15 points                                                               | Bystedt [00:08:38]                         |
| Add brush length      | about 0.01 m for fur (default 0.3 m)                                                | Schmidbauer [00:17:59]                     |
| Density, human layer  | 5,000 per m² per clump population                                                   | Bystedt [00:17:28]                         |
| Density, long fur     | 1,000,000/m², radius 0.2 mm, viewport 4%                                            | Thommes [00:09:02], [00:16:44]             |
| Density map           | part 1.0, base 0.5, bald 0; ramp black stop just above 0.5                          | Bystedt [00:22:04], [00:23:46]             |
| Wide clumps           | Shape about 0.3, reduced Factor, groomed guides                                     | Bystedt [00:19:47]                         |
| Curl                  | Radius 2 cm, Curl Start 1, Random Offset 0.5, Guide Distance 1 cm, Guide Mask 0.2   | Thommes [00:12:04], [00:14:18]             |
| Sub-clumps            | Guide Distance 1 mm, Mask 0.1; layer 2: 4 mm, 0.25, Clump Offset 5 mm               | Thommes [00:16:12], [00:31:01]             |
| Frizz                 | 2 mm, negative Shape; final: -0.2, Cumulative off, on 20% of curves                 | Thommes [00:15:04], [00:32:08], [00:26:03] |
| Strays                | 10% of curves, Noise distance 5 mm                                                  | Thommes [00:30:28]                         |
| Trim, Rotate          | Replace Length off, Random Offset 5 mm; Rotate random 5°                            | Thommes [00:22:20]                         |
| Card subdivision      | 1 per 20 cm of card length                                                          | Bystedt g_ZIOafq4QU [00:05:08]             |
| Card and tube profile | arc: 1 segment flat, 3 preferred; tube: flat spiral, resolution 6, 1 turn, height 0 | Matsumoto [00:19:54], [00:22:40]           |
| Card UV width         | cards use half the tile of tubes                                                    | Matsumoto [00:31:27]                       |
| Coverage sanity       | density × π × radius²: 0.13 for Thommes' fur                                        | [added] check                              |

## Quality gates

In code:

```python
import sys; sys.path.append("<skills>/scenario-blender-hair/scripts"); import bx_hair as H
print(H.uv_report(surface))                 # overlap_faces == 0
rep = H.groom_report(hair); print(H.verdict(rep))   # [] or a list of fixes
print(H.count(hair))                        # full-density curves and points vs budget
print(H.card_stats(hair))                   # cards: tris, UV range
```

`groom_report` checks attachment UVs, roots on the surface, spacing gaps, length dents (over 50% off
neighbors), Hair Dynamics last, Trim Replace Length, unmasked Frizz or Noise, missing Density Mask,
radius vs density, Strand display, and a Cycles hair shader under EEVEE.

Visually: `H.review(objs, out, engine, views=("front", "threequarter", "top"))` renders a lit
full-density sheet with Thommes' rig (warm top fill, side key, cool rim, dark bluish world). Score
it with `references/critique.md`: bald spots, part coverage, clumps, strays, length variation, tips,
root-to-tip color, highlights.

## Common mistakes

| Mistake                                                | What it looks like                                           | Fix                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Guides at the brush default of 8 points while blocking | tangles, clipping, fights while combing                      | 2 points, raise later (Schmidbauer)                                  |
| Interpolate without a Density Mask                     | hair in the mouth or eyes, drifting children far from guides | vertex-group mask; separate the mouth interior                       |
| Uneven guide spacing                                   | bald spots, worse in pose                                    | `sample_roots` spacing; check `spacing_gaps_2x`                      |
| High density at default radius                         | a solid mass or "a mess"                                     | Profile first, about 0.2 mm at 1M/m² (Thommes)                       |
| Trim at defaults                                       | every strand becomes 1 m long                                | Replace Length off (Thommes)                                         |
| Positive Frizz on curls or clumps                      | curl tips destroyed, fuzzy clump tips                        | negative Shape, Cumulative Offset off on the final Frizz             |
| Duplicated layer with the same seed                    | wide and thin clumps stack identically                       | change seed and frequency (Bystedt)                                  |
| Straight tips                                          | "bad CG hair"                                                | Roll Hair Curves at the tip only (Bystedt)                           |
| Surface edited after grooming                          | floating or sunken roots                                     | `snap_to_surface(hair, "DEFORM")`, or NEAREST after topology changes |
| Judging at 4% viewport density                         | uniform clumps and equal lengths unnoticed                   | render at full density                                               |
| Principled Hair BSDF in EEVEE                          | dark and flat (measured 0.09 vs 0.26 center luminance)       | Principled BSDF with explicit colors                                 |
| Scripting a Comb stroke                                | nothing happens, PASS_THROUGH                                | write positions, or hand the stroke to the user                      |

## Blender 5.2 notes

- Empty Hair and Quick Fur add a pinned **Hair Dynamics** modifier (Mode `Animation` or
  `Physics (Experimental)`). It replaces the old Surface Deform and moves roots with the deforming
  surface (shape keys and armature verified). Keep it last.
- Interpolate has no Surface or UV Map inputs; it reads the curves object's surface. Newer inputs
  are Part by Mesh Islands, Follow Surface Normal, Mask Texture and Resting Surface (on). With
  Resting Surface on, Thommes' "Mask modifier on the surface" patch preview has no effect. Use a
  patch vertex group as the Density Mask instead, or turn Resting Surface off while previewing.
- Modifier inputs are set with `md.properties.inputs.<id>.value` or `.type = 'ATTRIBUTE'`. Headless,
  evaluation stays stale until `obj.update_tag()`. `H.set_inputs` resolves UI names and tags for
  you. Background evaluation applies Viewport Amount, so use `H.count(full=True)`.
- Brushes are assets: Snake Hook is **Pull Tips**, Selection Paint is **Select**; Add defaults to 8
  points, 0.3 m; settings in `brush.curves_sculpt_settings`.
- Factory `render.hair_type` is `STRAND`: use `STRIP` with `hair_subdiv >= 1`. Cycles shapes:
  `RIBBONS`, `THICK`, `THICK_LINEAR`. "Curves Info" is `ShaderNodeHairInfo`; Principled Hair offers
  Chiang and Huang. Hair Curves Noise writes `resolution` 12, which curves render with since 5.0.
- Cards: Curve to Mesh has a Scale input (4.5), and Arc Resolution counts points. EEVEE alpha uses
  `surface_render_method = 'DITHERED'`. Keep the GeometrySet alive when reading
  `obj.evaluated_geometry().mesh`.
- Quick Fur density scales with object size (MEDIUM on a 10 cm sphere: 80,220/m², 12 points per
  guide).

## References

- [`references/expert-notes.md`](references/expert-notes.md): load for judgment calls, per expert
  with timestamps (human hairstyle, animal fur, procedural fur, cards, mesh hair).
- [`references/procedures.md`](references/procedures.md): load before writing code. It has full
  tested procedures P1 to P8 with raw bpy equivalents of the `bx_hair` calls.
- `references/critique.md`: load when reviewing a render or report, as the scoring rubric.
- [`references/sources.md`](references/sources.md): load to cite or re-watch a source, with the best
  timestamps.
- `scripts/bx_hair.py`: the toolkit (tested on 5.2.1). Tests are in `tests/code/blender-hair/`.
