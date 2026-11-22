---
name: scenario-blender-texturing-shading
description: "Use when texturing, shading or look-developing in Blender: building a PBR material from a texture set, displacement, procedural materials, edge wear, dirt, grime, color variation, decals, box or triplanar mapping on meshes without UVs, stylized character skin (subsurface, pores), eyes and cornea, hand-painted stylized textures, texture painting or painting masks headless. Also when a material looks plastic, CG, waxy or blown out, color spaces are wrong, or EEVEE and Cycles disagree."
license: MIT
---

# Texturing and shading (Blender 5.2)

Expert shading is layered masks feeding physically plausible values: a clean base (scanned set or
flat colors), then contrasty black/white masks that place color, roughness, height and subsurface,
all editable in nodes. Values are judged under honest light in both engines, and baking comes last,
for portability. If a sibling skill named here is missing from your available skills, load it with
`skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).
Baking maps: scenario-blender-uv-baking. Lighting and final renders:
scenario-blender-lighting-rendering.

Toolkit: [`scripts/bx_materials.py`](scripts/bx_materials.py) (builders, headless painting, checks;
exercised by `tests/code/blender-texturing-shading/`).
`sys.path.append("<this skill>/scripts"); import bx_materials as M`.

## Stance (the expert delta)

- **Data maps are Non-Color, "not what looks better, what's correct"** (Price). Only base color and
  emission are sRGB.
- **Normal map OR displacement, never both** (Price, confirmed by Cycles lead Brecht): they encode
  the same relief. Displacement when heights will be combined or truly displaced; normal map for
  export and 8-bit safety.
- **Masks, not painted color.** Kaspar and Price build every effect as a grayscale mask into a Mix
  or HSV Factor; color lives in the A/B inputs. Masks need contrast (Color Ramp stops pulled in) or
  they barely show. The same masks drive roughness, height and SSS.
- **Realism: scanned set plus masks; stylized: procedural** (Price vs Kaspar and Ryan King). Kaspar
  strips photos to their pattern (blur plus grain extract) and adds grunge himself, and bakes at the
  end for portability (export, EEVEE load time), not for Cycles speed.
- **Micro detail in roughness, not bump**, for skin and hair (Kaspar); edit roughness through HSV
  Value, never by unplugging the map (Price). Specular stays 0.5. Bump Distance is the real height
  of the map's 0..1: lower Distance, not Strength (Kaspar).
- **Judge honestly:** Standard view, neutral mid-gray background, Base Color black to read
  roughness, a hard backlight and a light from below (Kaspar); grazing light for relief (Price);
  unlit for hand-painted albedo (Abbitt). EEVEE for iteration, Cycles as the truth, and they must
  match (Kaspar).
- **SSS follows anatomy** (Kaspar): high on ears, nose, lids, lips, fingertips; low over bone.
  Black/white mask, Map Range sets values.
- **Bevel, AO, Pointiness and Random Per Island are Cycles-only, and Bevel/AO are stochastic**
  [added, measured]: EEVEE shows no Bevel edges; thresholded live masks give 17 to 18% fractional
  metallic at any sample count. Bake before thresholding, or use vertex curvature.

## Establish first

| Input                                    | Changes                                                              | Default when silent                      |
| ---------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| Target: Cycles still, EEVEE, game engine | live Cycles-only nodes vs baked; AO in albedo (render) vs ORM (game) | Cycles finals, EEVEE side by side        |
| Style: realistic or stylized             | scanned set + grime vs procedural or hand-painted light              | stylized restraint (Kaspar)              |
| UVs and deformation                      | UV images vs box projection vs Object procedurals                    | rigid, no UVs: box; deforming: UV only   |
| Scale                                    | tile size, bump/displacement meters                                  | real meters, scale applied (all experts) |
| Texel budget, export                     | 2K to 4K hero paint, 4K to 8K large tiling surfaces                  | 2K hero prop, glTF ORM, OpenGL normals   |

## Workflow

1. **Base per part.** Prefixed materials, placeholders removed, `diffuse_color` set; values picked
   on the Diffuse Color pass (matcap made Kaspar's skin too pale). Apply scale. GATE:
   `M.value_report(objs)` clean.
2. **Base material.** Set: `M.pbr_from_textures(mat, M.find_texture_set(dir), uv_map=...)`: color
   spaces by role, AO multiplied at factor 1 (Price: restores the cavity shadow flash capture
   removes; `ao_mode="gltf"` for games), bump only without a normal map, `height_as="displacement"`
   drops the normal map and sets Cubic interpolation, Displacement and Bump, Scale 0.2 for Poliigon
   (fixed 20 cm range); add Simple subdivision and shade smooth. UV tile = the set's physical size.
   Rigid, no UVs: `projection="BOX"`. Procedural: Object coordinates (UV on deforming meshes), Noise
   Detail at most 5 (cost doubles per level, Price). GATE: `M.audit_material(mat, obj)` has no
   errors.
3. **Masks.** Kaspar's rule is mask frequency against vertex density: vertex colors for broad soft
   masks (and Price's environments: tiling UVs repeat image strokes, layouts change), images for
   fine or exported detail, UV bands for hems. Headless: `M.mask_from_points`,
   `M.write_vertex_values`, `M.smooth_attribute`, `M.curvature_attribute`, `M.TexelMap` +
   `M.project`. Price's Color Burn: soft mask (A) burned by a contrast-ramped height map (B) breaks
   the mask along bricks or into grout (procedures P18). GATE: render each mask as emission.
4. **Layers.** `M.add_wear(mat, edge_color=..., edge_roughness=..., edge_metallic=1)` adds
   variation, cavity/grunge dirt and chipped edges. Blend modes: Multiply darkens (grime, mold),
   Screen lightens (efflorescence, highlights; Add exceeds 1), Subtract on the height chain for
   spalling (Price). Chain order sets age (a decal before grime reads old). Decals: Alpha into
   Factor, Extension Clip (`M.add_decal`). GATE:
   `M.preview(objs, out, rigs=("studio", "roughness"))`: effects follow form and water paths,
   nothing uniform, repeats broken.
5. **Character specifics.** `M.stylized_skin(mat, obj=body)` (masks
   `col_brighter/col_darker/col_lips/col_sss/col_rough`); `M.stylized_eye` per eye object (origin at
   the eyeball center) plus `M.cornea_material` and `cornea.visible_shadow = False`; hair shine:
   Anisotropic with a Tangent on a strand-aligned UV map (Cycles only). GATE: `rigs=("backlit",)`:
   red glow on ears, nostrils, lips, fingers; front not waxy; sclera off-white.
6. **Stylized hand-painted light** (Abbitt): lighter top, darker bottom, Multiply in crevices,
   Screen on extremities. Headless: `M.painted_light(mat, obj)` from a curvature attribute, bake
   Emit, judge with `rigs=("unlit",)`.
7. **Painting, where masks cannot place it.** GUI: brushes are assets (`Paint Hard/Soft`,
   `Airbrush`, `Blur`, `Smear`, `Fill`, `Mask`); a factory 5.2 session paints BLACK until the brush
   and unified color are set; strokes project from the screen, so face the surface (Abbitt); Erase
   needs an alpha channel; bleed 8 to 12 px (Kaspar, Abbitt). Use `M.gui_texture_stroke()`: it
   forces a redraw (projection painting occludes with the depth buffer of the previous draw: a
   stroke issued in the setup call painted 162 texels in one run instead of about 14,000, full
   coverage in another) and resamples dabs. Headless: `M.TexelMap` + `M.paint_stroke` paints by
   world distance, seams included; `M.dilate`, then `M.save_image` (images are never saved with the
   .blend by a script). GATE: renders from views crossing seams.
8. **Lookdev check and bake.** `M.preview` (EEVEE and Cycles, studio, backlit, roughness),
   `M.value_report`, labeled frames and node groups (Kaspar, Price). Bake procedural channels via
   Emission, 30+ samples, validate by rebuilding from the maps (scenario-blender-uv-baking).

## Numbers

| Value                                 | Number                                                        | Source                                                             |
| ------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Dielectric albedo / metal reflectance | sRGB about 30 to 240 / 180 to 255; metallic 0 or 1            | ranges [added]; binary metallic: Ryan King, Price                  |
| Skin roughness                        | 0.68 to 0.72, rough zones 0.72 to 1, lips and mouth about 0.4 | Kaspar                                                             |
| Pores                                 | Voronoi Smooth F1 scales 100 and 200, noise mix 0.2 to 0.25   | Kaspar, on his UVs                                                 |
| Skin SSS scale (5.2)                  | 0.005 to 0.04 m                                               | measured on a 0.33 m head; Kaspar's v1 0.02 to 0.15 is waxy in 5.2 |
| Bump                                  | Distance about 0.001, Strength 0.1 to 0.2 for fabric          | Kaspar                                                             |
| Displacement                          | Scale 0.2 (Poliigon), Midlevel 0.5, Cubic, 16-bit source      | Price                                                              |
| Brick wall roughness                  | about 0.7                                                     | Price                                                              |
| Color tweak                           | Hue within 0.5 plus or minus 0.04                             | Price                                                              |
| Noise Detail                          | 5 or less                                                     | Price                                                              |
| Edge-wear Bevel radius                | 0.04 on a 1 m crate                                           | measured                                                           |
| Paint bleed / island margin           | 8 to 12 px / 0.01 to 0.05                                     | Kaspar, Abbitt                                                     |
| Painted height                        | 2K, 32-bit float, base 0.5, Non-Color                         | Kaspar; 0.5 gray base also Ryan King                               |
| Bake samples                          | 30 minimum                                                    | Kaspar                                                             |

## Quality gates

Measurable:

- `M.audit_material(mat, obj)`: color spaces by role, no image straight into Normal, explicit UV
  maps, Bump Distance at most 0.05, no Add Shader or raw summed normals, Emission Strength set, no
  gray constant metallic, normal map plus displacement flagged, non-Cubic displacement image, Noise
  Detail above 6, unsaved images.
- `M.value_report(objs)`: dielectric albedo within 30 to 243 sRGB (under 2% outside), metal above
  180, fractional metallic under 5% (live Bevel/AO wear exceeds it until baked), roughness std above
  0.01.
- Scale applied; color attributes named `col_*` and matching every Attribute node exactly (Kaspar,
  Price).

Visual: `M.preview` EEVEE vs Cycles nearly identical; roughness row shows breakup; backlit glow only
where flesh is thin; grazing light shows relief without terracing; repeats broken at distance;
per-layer mute renders each add something (Price); scale against a human reference.

## Common mistakes

| Mistake                                                      | Looks like                          | Fix                                 |
| ------------------------------------------------------------ | ----------------------------------- | ----------------------------------- |
| Data map left sRGB                                           | bent bump, wrong gloss              | Non-Color                           |
| Normal map and displacement together (Node Wrangler default) | doubled or broken relief            | keep one                            |
| Displacement with no geometry or Catmull-Clark               | nothing, or rounded corners         | Simple subdivision, shade smooth    |
| Pre-4.5 Bump Distance 1.0                                    | stepped, plastic                    | real height, about 0.001 to 0.01    |
| Emission Color set, Strength 0                               | no glow                             | Strength above 0                    |
| Kaspar's v1 SSS values in 5.2                                | waxy white ears                     | 0.005 to 0.04, check backlit        |
| Bevel wear or Pointiness in EEVEE or games                   | wear missing                        | bake, or `curvature_attribute`      |
| Threshold on live Bevel/AO for metallic                      | grainy gray borders                 | bake, then threshold                |
| Cornea shell in EEVEE, default thickness                     | iris magnified                      | Thickness 0 (`cornea_material`)     |
| Mask straight from Noise                                     | effect barely visible               | ramp or Map Range for contrast      |
| Stroke right after setup                                     | partial or no paint, varies per run | redraw first (`gui_texture_stroke`) |
| Paint color never set / new color attribute                  | black strokes / white mask          | set colors; write zeros first       |
| Box projection or Generated coords on a rig                  | texture swims                       | UV coordinates                      |

## Blender 5.2 notes

- Principled v2: Subsurface Weight/Scale (no Subsurface Color), Specular IOR Level, Transmission
  Weight, Coat, Emission Strength default 0. Sockets by name; Mix node by index (RGBA: A=6, B=7,
  Result=2).
- Color spaces `sRGB`, `Non-Color`, `Linear Rec.709`. Displacement node Scale default 0.01;
  `material.displacement_method` (not `material.cycles`); EEVEE displaces since 4.2 (Displacement
  and Bump).
- `use_nodes` deprecated; `surface_render_method` replaces `blend_method`; refraction needs
  `use_raytrace_refraction` plus scene ray tracing.
- EEVEE ignores anisotropy, Bevel, Pointiness, Random Per Island (verified). Random Walk SSS
  rescaled in 5.2. Musgrave is inside Noise.
- Brushes are assets; custom brushes need "Save Changes to Asset" (Abbitt); `image_brush_type`; Blur
  is `SOFTEN`; sample color `Shift+X`.
- `paint.vertex_color_dirt` works headless in Object mode; byte images store encoded values, float
  `Linear Rec.709` images convert to sRGB when saved as PNG.

## References

- [`references/procedures.md`](references/procedures.md): tested code for every stage (texture sets,
  displacement rule, box projection, wear, curvature, decals, skin, eyes, anisotropy, GUI and
  headless painting, high-pass, checks, camera-ray world, clay switch, painted light, Color Burn
  masks, physical UV scale).
- [`references/expert-notes.md`](references/expert-notes.md): reasoning per expert with timestamps
  and the disagreements with their deciding conditions.
- [`references/critique.md`](references/critique.md): rubric for judging your own renders and node
  trees.
- [`references/sources.md`](references/sources.md): every source video, credential, best timestamps.
