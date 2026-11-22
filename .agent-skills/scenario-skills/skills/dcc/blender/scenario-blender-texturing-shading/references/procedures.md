# Tested procedures (Blender 5.2.1)

Every `python` block below was executed on Blender 5.2.1 LTS by
`tests/code/blender-texturing-shading/test_procedures_md.py` (headless, `--factory-startup`, fresh
file per block). Blocks marked `python gui` need a live window and were run by
`test_gui_texture_paint.py` instead. Larger behaviors were verified by the render tests named under
each procedure; their contact sheets are in `tests/code/blender-texturing-shading/out/`.

Blocks assume two names: `SKILL_SCRIPTS` = `<this skill>/scripts` and `TEX_DIR` = a folder holding a
downloaded texture set. Replace them with real paths.

---

## P1. PBR material from a downloaded texture set

Verified on 5.2.1. Test: `test_pbr.py` (ambientCG, Poly Haven and Substance naming, color spaces,
glTF export).

```python
import sys, bpy
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

maps = M.find_texture_set(TEX_DIR)             # {'base_color': ..., 'roughness': ..., 'normal': ..., 'height': ..., 'ao': ...}
bpy.ops.mesh.primitive_cube_add()
obj = bpy.context.active_object
mat = M.pbr_from_textures("Bricks", maps, uv_map="UVMap")   # sRGB on color, Non-Color on data, sockets by name
obj.data.materials.append(mat)
print(M.audit_material(mat, obj))              # [] when color spaces, UV maps, bump and emission are sane
```

What the builder does, so you can do it by hand when needed:

- Role from the END of the file name (`metal_plate_diff_1k` is base color, not metallic). `_nor_dx`
  / `NormalDX` sets the Normal Map node `convention = 'DIRECTX'` (5.1+).
- `orm` / `arm` / `OcclusionRoughnessMetallic`: one Non-Color image, Separate Color R = AO, G =
  Roughness, B = Metallic.
- Gloss maps are inverted into Roughness (`1 - gloss`).
- Height: bump only when there is no normal map (`height_as='auto'`); Bump Distance = `height_depth`
  in meters (what 0..1 of the map spans). A normal map plus bump is CHAINED (Normal Map output into
  the Bump Normal input), never added. `height_as='displacement'` wires true displacement and DROPS
  the normal map (Price: they encode the same relief; `audit_material` flags materials that use
  both), sets the height image to Cubic interpolation and `displacement_method = 'BOTH'`.
- AO: multiplied into base color at factor 1 by default (Price: scanned sets are flash-lit, AO
  restores the cavity shadow; optional under true displacement). For games use `ao_mode='gltf'`: a
  `glTF Material Output` group so the exporter writes a separate `occlusionTexture` (verified in the
  exported JSON); the default multiply still exported `baseColorTexture` (verified).
  `ao_mode='none'` to skip.
- Emission map: Emission Strength set to 1 (5.x default is 0).

Color-space fix for an existing material, by role of the socket it feeds:

```python
import bpy
bpy.ops.mesh.primitive_cube_add()
mat = bpy.data.materials.new("Fixme")
nt = mat.node_tree
p = nt.nodes["Principled BSDF"]
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.new("rough_2k", 64, 64)
nt.links.new(tex.outputs["Color"], p.inputs["Roughness"])

COLOR_SOCKETS = {"Base Color", "Emission Color", "Sheen Tint", "Coat Tint", "Specular Tint"}
for n in nt.nodes:
    if n.bl_idname == "ShaderNodeTexImage" and n.image:
        targets = {l.to_socket.name for l in n.outputs["Color"].links}
        n.image.colorspace_settings.name = "sRGB" if targets & COLOR_SOCKETS else "Non-Color"
print(tex.image.colorspace_settings.name)     # Non-Color
```

True displacement with a scanned set (Price's wall), verified in `test_price_masks.py` (normal map
dropped, Cubic, BOTH) and the block test:

```python
import sys, bpy
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

bpy.ops.mesh.primitive_plane_add(size=2.5)                 # one tile = the set's published physical size
wall = bpy.context.active_object
mat = M.pbr_from_textures("Wall", M.find_texture_set(TEX_DIR), uv_map="UVMap",
                          height_as="displacement", height_depth=0.2)   # Poliigon: 0.2 = fixed 20 cm range
wall.data.materials.append(mat)
sub = wall.modifiers.new("Subdiv", "SUBSURF")
sub.subdivision_type = "SIMPLE"                          # Catmull-Clark rounds the corners (Price)
sub.levels = sub.render_levels = 6
bpy.ops.object.shade_smooth()                            # faceted lumps otherwise
print(mat.displacement_method, mat.get("bx_note"), M.audit_material(mat, wall))
```

## P2. Principled BSDF v2 by name, and the traps

Verified on 5.2.1 (socket list and defaults probed).

```python
import bpy
mat = bpy.data.materials.new("V2")            # 5.x: already has Principled + Output, use_nodes is deprecated
p = mat.node_tree.nodes["Principled BSDF"]
print([s.name for s in p.inputs][:12])
p.inputs["Base Color"].default_value = (0.8, 0.3, 0.2, 1)
p.inputs["Roughness"].default_value = 0.55
p.inputs["Specular IOR Level"].default_value = 0.5      # old 'Specular'
p.inputs["Subsurface Weight"].default_value = 1.0       # old 'Subsurface'; no Subsurface Color any more
p.inputs["Subsurface Scale"].default_value = 0.02       # meters; radius = Scale x Subsurface Radius
p.inputs["Coat Weight"].default_value = 0.0             # old 'Clearcoat'
p.inputs["Emission Color"].default_value = (1, 0.5, 0.1, 1)
p.inputs["Emission Strength"].default_value = 2.0       # default 0: color alone does nothing
p.subsurface_method = "RANDOM_WALK_SKIN"
mat.surface_render_method = "DITHERED"                  # EEVEE; old blend_method
```

## P3. Box (triplanar) projection for meshes without usable UVs

Verified on 5.2.1, EEVEE and Cycles render the same. Test: `test_pbr.py` (ico sphere with no UV
map). Use for rigid props, rocks, AI-generated meshes before UVs exist. Not for deforming meshes:
Object coordinates swim under an armature (UV digest). A tangent-space normal map is interpreted in
the UV tangent frame, which box projection does not provide, so the builder drops the normal map and
uses the height as bump [added].

```python
import sys, bpy
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

maps = {k: v for k, v in M.find_texture_set(TEX_DIR).items() if k not in ("normal", "normal_dx")}
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4)
rock = bpy.context.active_object
mat = M.pbr_from_textures("Rock_Box", maps, projection="BOX", box_blend=0.25, scale=(1.5, 1.5, 1.5), height_depth=0.01)
rock.data.materials.append(mat)
print([n.projection for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeTexImage"])
```

## P4. Wear, dirt and color variation on any material

Verified on 5.2.1. Test: `test_wear.py` (mask sheet Cycles vs EEVEE, preview, value report) and
`tests/code/blender-texturing-shading/probes/probe_stochastic.py`.

```python
import sys, bpy
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

bpy.ops.mesh.primitive_cube_add()
crate = bpy.context.active_object
mat = M.get_material("Crate_Paint")
p = M.principled(mat)
p.inputs["Base Color"].default_value = (0.045, 0.11, 0.065, 1)     # green paint, linear
p.inputs["Roughness"].default_value = 0.5
crate.data.materials.append(mat)
nodes = M.add_wear(mat, edge_color=(0.62, 0.62, 0.63), edge_roughness=0.3, edge_metallic=1.0,
                   dirt_color=(0.04, 0.035, 0.03), dirt_amount=0.85, grunge_amount=0.3,
                   radius=0.04, wear_amount=0.6, cavity_dirt=0.5, noise_scale=10.0, grunge_scale=3.0)
print(sorted(nodes), [s.name for s in nodes["edge_wear"].outputs])
```

Measured behavior:

- `BX Edge Wear`: Edges = angle between the Bevel-node normal and the shading normal, kept where AO
  says the surface is open (convex); Wear = Edges plus stretched noise through a threshold (chips);
  Cavity = 1 - AO; Dirt = Cavity plus noise through a threshold. Radius is world units: 0.04 read
  well on a 1 m crate, 0.015 gave hairlines.
- EEVEE: Edges and Wear go to 0 (the Bevel node is Cycles-only), Cavity/Dirt differ (screen-space
  AO). Grunge and Variation match exactly (mean 0.0442 vs 0.044).
- Bevel and AO are sampled per render sample: a threshold on them averages to fractional values.
  Metallic driven through `GREATER_THAN` was 0% fractional at 1 spp and 17 to 18% at 16 and 128 spp.
  Bake Wear and Dirt to textures (scenario-blender-uv-baking, Emit bake) before thresholding for
  finals, EEVEE and games.
- Noise Texture `Fac` clusters around 0.5 (roughly 0.3 to 0.7): stretch it with Map Range before
  using it as a breakup, or the breakup is invisible.

## P5. Engine-independent curvature and dirt masks (no Bevel node)

Verified on 5.2.1. Tests: `test_wear.py` (EEVEE and Cycles identical, mean 0.3402 vs 0.3404),
`test_uvpaint.py` (rasterized into a texture).

```python
import sys, bpy
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

bpy.ops.mesh.primitive_monkey_add()
obj = bpy.context.active_object
obj.modifiers.new("s", "SUBSURF").levels = 2
bpy.ops.object.modifier_apply(modifier="s")
val = M.curvature_attribute(obj, name="col_curvature", smooth=1, contrast=6.0)   # 0.5 flat, >0.5 convex
mat = M.get_material("CurvatureView")
vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
vc.layer_name = "col_curvature"
mat.node_tree.links.new(vc.outputs["Color"], M.principled(mat).inputs["Base Color"])
obj.data.materials.append(mat)

# Blender's own cavity mask: works headless in OBJECT mode on the ACTIVE color attribute
a = obj.data.color_attributes.new("col_dirt", "BYTE_COLOR", "POINT")
obj.data.color_attributes.active_color = a
print(bpy.ops.paint.vertex_color_dirt(blur_strength=1.0, blur_iterations=1, clean_angle=3.14, dirt_angle=0.0, dirt_only=False, normalize=True))
```

Both depend on vertex density (like Pointiness). On a low poly, compute them on the high and bake,
or rasterize per texel with `M.vertex_values_to_texels` (P11).

## P6. Decal through a dedicated UV map (Kaspar's logo method)

Verified on 5.2.1. Test: `test_uvpaint.py` (logo on a sphere, render).

```python
import sys, bpy, numpy as np
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=64, ring_count=32)
ball = bpy.context.active_object
logo = bpy.data.images.new("logo", 128, 128, alpha=True)
a = np.zeros((128, 128, 4), dtype=np.float32)
a[40:88, 40:88] = (1, 1, 1, 1)                  # white square with alpha, stands in for a logo file
M.write_pixels(logo, a)
mat = M.get_material("BallPaint")
ball.data.materials.append(mat)
M.add_decal(mat, ball, logo, center=(0, -0.5, 0), normal=(0, -1, 0), up=(0, 0, 1), size=0.45)
print([u.name for u in ball.data.uv_layers])   # ['UVMap', 'decal']
```

Faces facing the decal get planar UVs; every other loop is parked outside 0..1 and the image node
uses Extension CLIP, so it reads alpha 0 there. For games, a separate decal mesh floating a
millimeter above the surface is the usual alternative [added].

## P7. Stylized skin (Kaspar, Snow #1, #2, #6, translated to Principled v2)

Verified on 5.2.1. Test: `test_skin.py` (EEVEE and Cycles, studio, backlit and roughness-only rigs;
two SSS ranges side by side).

```python
import sys, bpy, numpy as np
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

bpy.ops.mesh.primitive_monkey_add(size=0.24)          # human-scale head, ears at +-X
head = bpy.context.active_object
co = np.array([v.co for v in head.data.vertices])
ear = np.clip((np.abs(co[:, 0]) - 0.10) / 0.03, 0, 1)
M.write_vertex_values(head, "col_sss", np.maximum(0.25, ear))    # black/white mask, values set in nodes
M.smooth_attribute(head, "col_sss", iterations=3)                 # the headless blur brush
M.mask_from_points(head, "col_brighter", [((0, -0.12, -0.02), 0.05, 0.8)], smooth=2)
skin = M.stylized_skin("snow.skin", obj=head, coords="OBJECT", pore_scale=40.0)
head.data.materials.append(skin)
p = M.principled(skin)
print(p.subsurface_method, sorted(s.name for s in p.inputs if s.is_linked))
```

Recipe inside the builder (sources in expert-notes.md):

- Base color: start darker, brighten through `col_brighter`, darken through `col_darker`, lips mask
  removed from both, lips color on top.
- SSS: Subsurface Weight 1; `col_sss` stays black/white and a Map Range sets Subsurface Scale.
  Kaspar's v1 values were 0.02 to 0.15. In 5.2 (Random Walk rescaled) 0.02 to 0.15 made the ears of
  a 0.33 m head glow white-pink and waxy under a backlight; 0.005 to 0.04 gave the red glow he asks
  for (default, measured). Scale proportionally with the character.
- Roughness: base 0.68 to 0.72; pores from two Voronoi Smooth F1 textures (scale 100 and 200 on his
  UVs) mixed by a detail-0 noise, general noise mixed at about 0.2, pore centers glossier, cracks
  rougher; `col_rough` remapped to 0.72 to 1 (chin, brows); lips glossy (0.45 here; his tongue and
  teeth 0.4).
- Specular IOR Level stays 0.5: wetness is roughness.

Backlit SSS check: `M.preview([head, ...], out, rigs=("backlit",))` puts a strong area light
straight behind plus one from below (Kaspar's rig). Ears, nostrils, lids, lips and fingers should
glow red; forehead, jaw and palm center stay opaque.

## P8. Procedural eye and cornea

Verified on 5.2.1. Tests: `test_skin.py` (eyes on the head, cornea shadow per engine),
`tests/code/blender-texturing-shading/probes/probe_cornea.py` (EEVEE thickness variants).

```python
import sys, bpy
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

r = 0.012
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=r)   # origin = eyeball center
eye = bpy.context.active_object
bpy.ops.object.shade_smooth()
eye.data.materials.append(M.stylized_eye("eye.L", radius=r, forward="-Y", iris_color=(0.10, 0.20, 0.33)))
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=r * 1.04)
cornea = bpy.context.active_object
bpy.ops.object.shade_smooth()
cornea.data.materials.append(M.cornea_material("cornea"))
cornea.visible_shadow = False                  # Kaspar: the cornea casts no shadow
bpy.context.scene.eevee.use_raytracing = True
out = M.output_node(bpy.data.materials["cornea"])
print(out.inputs["Thickness"].is_linked, bpy.data.materials["cornea"].thickness_mode)   # True SLAB
```

Measured: with default thickness EEVEE refracts the shell as a solid glass ball and blows the iris
across the eye; Material Output Thickness 0 (SLAB or SPHERE) matches Cycles;
`use_raytrace_refraction = False` makes the eye vanish behind a probe reflection.
`visible_shadow = False` is honored by both engines (iris region brightness 0.59 to 0.76 in Cycles,
0.53 to 0.67 in EEVEE).

## P9. Anisotropic hair or brushed metal (Cycles only)

Verified on 5.2.1. Test: `test_skin.py` (aniso sheet): EEVEE renders the same material isotropic in
5.2, Cycles shows the stretched highlight. Kaspar kept a fake-anisotropy node group for EEVEE and a
separate Cycles output (Material Output `target`).

```python
import bpy
bpy.ops.mesh.primitive_uv_sphere_add()
mat = bpy.data.materials.new("HairShine")
nt = mat.node_tree
p = nt.nodes["Principled BSDF"]
p.inputs["Roughness"].default_value = 0.35
p.inputs["Anisotropic"].default_value = 1.0
t = nt.nodes.new("ShaderNodeTangent")
t.direction_type = "UV_MAP"
t.uv_map = "UVMap"                             # a UV map laid along the strand direction ('uv alignment')
nt.links.new(t.outputs["Tangent"], p.inputs["Tangent"])
streak = nt.nodes.new("ShaderNodeTexNoise")    # stands in for his painted streak texture
streak.inputs["Scale"].default_value = 8.0
rng = nt.nodes.new("ShaderNodeMapRange")
rng.inputs["To Max"].default_value = 0.5       # his rotation range 0..0.5
nt.links.new(streak.outputs["Fac"], rng.inputs["Value"])
nt.links.new(rng.outputs["Result"], p.inputs["Anisotropic Rotation"])
out = nt.nodes["Material Output"]
out.target = "CYCLES"                           # an EEVEE output with a fake setup can sit beside it
bpy.context.active_object.data.materials.append(mat)
```

## P10. Texture painting with real brushes (live GUI session)

GUI only, verified in `test_gui_texture_paint.py` (opens a window). Facts from that run:

- Factory 5.2: brush `Paint Hard`, color AND unified color black, `use_unified_color` True, seam
  bleed 2 px, mode `MATERIAL`.
- A stroke issued in the same call that set up the object, view or mode painted 162 texels in one
  run and full coverage (31,395) in another; resampled strokes after a redraw painted about 14,000
  every run. Projection painting occludes with the depth buffer of the last viewport draw, so what
  that draw contained decides the result. `M.gui_redraw()` forces a draw first.
- Scripted strokes paint one dab per point (the brush's spacing is not applied): 16 points over 740
  px left separate dots. `M.gui_texture_stroke()` resamples to 0.25 x brush diameter.
- Occlude, Backface Culling and Normal falloff off: one stroke painted 9,969 texels on the front AND
  9,969 on the back (Kaspar's through-the-clump hair streaks). With defaults: front only.
- `Blur` is image_brush_type `SOFTEN`; `Fill` floods the whole canvas (1,048,540 of 1,048,576
  texels).
- `paint.add_texture_paint_slot` (via `bx_gui.run`) creates the image node, links Base Color, image
  sRGB.
- Vertex-paint strokes through bx_gui were unreliable in the first tests (only strokes near the view
  center registered). Cause found and fixed in bx_gui on 2026-09-24: the exec path reads stroke
  `location` in object space and needs the point on the surface; `bx_gui.stroke()` now raycasts each
  point from the view and converts to object space. Re-verified in a GUI session: a 14-point
  `VERTEX_PAINT` stroke across an off-origin sphere painted its full width (55 vertices, local x
  -0.25 to +0.25). The numpy route (P7) stays the headless option and the one to use for exact,
  procedural masks.
- From the batch notes (Abbitt, Surfaced Studio, Ryan King): strokes project from the screen, so
  they stretch on faces angled away and vanish at edges: `set_view` square to the surface first.
  Erase brushes punch alpha and need an image with alpha; on opaque maps paint the base color back.
  Texture Slots mode `MATERIAL` paints every channel of every material;
  `add_texture_paint_slot(type='ROUGHNESS')` sets Non-Color itself, `type='BUMP'` wires a Bump node
  (batch probes). Face-selection paint mask: `mesh.use_paint_mask = True`; stencil mask image:
  `image_paint.use_stencil_layer`, `image_paint.stencil_image`. A custom textured brush needs white
  color, saturation 0, and "Save Changes to Asset". "Cannot paint" checklist: wrong object holds the
  paint icon, missing UVs, no image slot, an active stencil or mask image, a black brush texture,
  extreme stroke spacing.
- Bleed: Kaspar 8 px, Abbitt 12 px (default 2). Island margin 0.01 to 0.05, larger when the texture
  will be downscaled for a game.

```python gui
import sys, bpy
sys.path.append(EXPERT_SCRIPTS); sys.path.append(SKILL_SCRIPTS)
import bx_gui as G, bx_materials as M

ob = bpy.context.active_object                      # UV-mapped mesh with a material
img = M.new_image("tex_body_color", 2048, color=(0.5, 0.5, 0.5, 1), colorspace="sRGB")
nt = ob.active_material.node_tree
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
G.set_view("FRONT", frame=ob)
bpy.ops.object.mode_set(mode="TEXTURE_PAINT")
ip = bpy.context.tool_settings.image_paint
ip.mode, ip.canvas, ip.seam_bleed = "IMAGE", img, 8   # Kaspar: bleed 8 px
M.gui_texture_stroke([(-0.3, -1.0, 0.4), (0.3, -1.0, 0.4)], size=40, brush="Paint Hard", color=(0.8, 0.1, 0.1))
M.save_image(img, "/abs/path/tex_body_color.png")    # images are not saved with the .blend by default
```

## P11. Headless painting through UV space

Verified on 5.2.1. Test: `test_uvpaint.py`: strokes crossing UV seams stay continuous on a cube
corner and across a sphere's seam (painted_sheet.png); 512 px TexelMaps for a cube and a 64x32
sphere built in 0.36 s.

```python
import sys, bpy, numpy as np, tempfile, os
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=64, ring_count=32)
ball = bpy.context.active_object
tm = M.TexelMap(ball, 512)                               # world position/normal per texel
img = M.new_image("ball_color", 512, color=(0.45, 0.45, 0.45, 1), colorspace="sRGB")
arr = M.pixels(img)
ring = [(0.5 * np.sin(a) * 0.95, 0.5 * np.cos(a) * 0.95, 0.15) for a in np.linspace(0, 2 * np.pi, 40)]
M.paint_stroke(arr, tm, ring, radius=0.06, color=(0.9, 0.75, 0.1, 1), hardness=0.6)   # crosses the seam
M.write_pixels(img, M.dilate(arr, tm.valid, 8))
dust = M.project(tm, lambda P, N: np.clip((N[..., 2] - 0.4) / 0.4, 0, 1))             # up-facing = dust
mask = M.new_image("ball_dust", 512, colorspace="Non-Color")
d4 = np.ones((512, 512, 4), dtype=np.float32); d4[..., :3] = M.dilate(dust, tm.valid, 8)[..., None]
M.write_pixels(mask, d4)
out = tempfile.mkdtemp()
M.save_image(img, os.path.join(out, "ball_color.png"))
M.save_image(mask, os.path.join(out, "ball_dust.png"))
print(round(tm.coverage, 3))
```

Image value semantics (measured by writing 0.5 and reading the PNG): byte images store values as
encoded (0.5 becomes 128 whether sRGB or Non-Color); float images hold linear and a `Linear Rec.709`
float saved to PNG is converted to sRGB (0.5 becomes 0.735); a float Non-Color image saved to 16-bit
PNG keeps 0.5. Write alpha 1 into maps without real alpha: an RGB PNG save multiplies color by alpha
(0.5 with alpha 0.5 saved as 64).

## P12. Photo texture pattern extraction (Kaspar, Snow #4)

Verified on 5.2.1. Test: `test_uvpaint.py`: low-frequency std 0.129 to 0.018, pattern correlation
0.99.

```python
import sys, numpy as np
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

n = 256
y, x = np.mgrid[0:n, 0:n] / n
weave = 0.5 + 0.15 * np.sign(np.sin(2 * np.pi * x * 32) * np.sin(2 * np.pi * y * 32))
photo = np.clip(weave + 0.3 * np.sin(2 * np.pi * x) * np.cos(2 * np.pi * y), 0, 1)   # weave + baked light
detail = M.high_pass(photo, sigma=16)           # blur + grain extract: original - blur + 0.5
print(round(float(M.gaussian_blur(detail, 16).std()), 3))
```

Use the result as a Non-Color mask and bump; build color, grunge and wear procedurally on top.

## P13. Checks: audit, value report, previews

Verified on 5.2.1. Tests: `test_pbr.py` (a deliberately wrong material raises 8 findings; the good
one none), `test_wear.py`, `test_skin.py`.

```python
import sys, bpy, tempfile
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

bpy.ops.mesh.primitive_uv_sphere_add()
obj = bpy.context.active_object
mat = M.get_material("Check")
M.principled(mat).inputs["Metallic"].default_value = 0.5
obj.data.materials.append(mat)
print(M.audit_material(mat, obj))                          # flags the gray metallic
rep = M.value_report([obj], res=96, views=("front",))      # renders channels as emission to linear EXR
print(rep["problems"])
sheet = M.preview(mat, tempfile.mkdtemp(), engines=("BLENDER_EEVEE",), rigs=("studio",), res=160, samples=8)
print(sheet)
```

`preview` rigs: `studio` (key, fill, rim on neutral 0.18 gray, no gradient), `backlit` (Kaspar's SSS
test), `roughness` (studio with Base Color forced black and SSS off: reads roughness and bump
alone). Engines side by side catch EEVEE-only or Cycles-only nodes.

## P14. Camera-ray world for lookdev (Kaspar, Snow #7)

Verified on 5.2.1 (built and rendered in `test_procedures_md.py`).

```python
import bpy
w = bpy.context.scene.world
nt = w.node_tree
env = nt.nodes.new("ShaderNodeTexEnvironment")         # Environment Texture, not Image Texture, for an HDRI
lit = nt.nodes["Background"]
flat = nt.nodes.new("ShaderNodeBackground")
flat.inputs["Color"].default_value = (0.18, 0.18, 0.18, 1)
lp = nt.nodes.new("ShaderNodeLightPath")
mix = nt.nodes.new("ShaderNodeMixShader")
nt.links.new(env.outputs["Color"], lit.inputs["Color"])
nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
nt.links.new(lit.outputs["Background"], mix.inputs[1])
nt.links.new(flat.outputs["Background"], mix.inputs[2])
nt.links.new(mix.outputs["Shader"], nt.nodes["World Output"].inputs["Surface"])
```

The camera sees flat gray, the object is lit by the HDRI.

## P15. Global clay switch driven by one property (Kaspar, Snow finale)

Verified on 5.2.1. Keeps bump and normals (unlike `view_layer.material_override`).

```python
import bpy
ctrl = bpy.data.objects.new("lookdev_ctrl", None)
bpy.context.scene.collection.objects.link(ctrl)
ctrl["clay"] = 0.0
mat = bpy.data.materials.new("AnyMat")
nt = mat.node_tree
p = nt.nodes["Principled BSDF"]
mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
mix.inputs[7].default_value = (0.6, 0.6, 0.6, 1)       # B = clay gray (RGBA mode: A=inputs[6], B=inputs[7])
nt.links.new(mix.outputs[2], p.inputs["Base Color"])
d = mix.inputs[0].driver_add("default_value").driver
v = d.variables.new()
v.targets[0].id = ctrl
v.targets[0].data_path = '["clay"]'
d.expression = v.name
print(d.is_valid)
```

Add the same driven mix on Roughness (to 0.6) and Subsurface Weight (to 0) in every material;
`ctrl["clay"] = 1` turns the whole character to clay for the presentation turntable.

## P17. Hand-painted stylized light, procedurally (Grant Abbitt, 5.1 guide)

Verified on 5.2.1. Test: `test_painted_light.py` (unlit and studio rigs, EEVEE and Cycles; albedo
top third 0.216 vs bottom third 0.177 linear). Grant paints the light into the albedo for unlit game
shaders: lighter top, darker bottom, MULTIPLY in crevices, SCREEN on extremities, judged with no
lighting. The node version builds the same structure from masks; bake it (Emit) for the game, then
add hand details (cracks, lettering) on top in the GUI or with P11.

```python
import sys, bpy
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

bpy.ops.mesh.primitive_cube_add(size=1.0)
stone = bpy.context.active_object
stone.modifiers.new("s", "SUBSURF").levels = 3
bpy.ops.object.modifier_apply(modifier="s")
M.curvature_attribute(stone, smooth=2, contrast=6.0)      # engine-independent crevice/extremity masks
mat = M.get_material("stone_painted")
M.principled(mat).inputs["Base Color"].default_value = (0.18, 0.19, 0.2, 1)
stone.data.materials.append(mat)
M.painted_light(mat, obj=stone, top=1.15, bottom=0.8, crevice=0.45, highlight=0.4)
print([n.label for n in mat.node_tree.nodes if n.label])
```

Without a curvature attribute the builder falls back to the Bevel/AO group (Cycles only, bake before
use in EEVEE or a game). Preview with `M.preview(objs, out, rigs=("unlit", "studio"))`: `unlit`
routes Base Color through emission, Grant's "plug the image straight into the output" check.

GUI brush equivalents he uses (5.1): Fill brush with gradient (`brush.color_type = 'GRADIENT'`, drag
bottom to top in front view), Fill in MULTIPLY with black at strength about 0.1 per tap to darken
globally, a brush in SCREEN with near-white for edge highlights, MULTIPLY at strength about 0.25 for
crevices and cracks, Smear to soften a harsh line.

## P18. Environment grime from a numpy color-attribute mask plus Color Burn (Price)

Verified on 5.2.1. Test: `test_price_masks.py` (plain soft mask vs burned mask on a brick wall,
EEVEE and Cycles; the burned mold concentrates in the grout). Price paints the mask in vertex colors
(resolution = vertex count, he subdivides a wall with 20 cuts) because image painting on tiling UVs
repeats every stroke. Headless, the mask comes from a rule instead of strokes.

```python
import sys, bpy, numpy as np
sys.path.append(SKILL_SCRIPTS)
import bx_materials as M

bpy.ops.mesh.primitive_plane_add(size=2.0)
wall = bpy.context.active_object
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.subdivide(number_cuts=20)
bpy.ops.object.mode_set(mode="OBJECT")
co = np.array([v.co for v in wall.data.vertices])
M.write_vertex_values(wall, "black", np.clip(1 - (co[:, 1] + 1.0) / 0.9, 0, 1))   # mold rising from the bottom
M.smooth_attribute(wall, "black", 3)
mat = M.get_material("wall_grime")
wall.data.materials.append(mat)
nt = mat.node_tree
p = M.principled(mat)
attr = nt.nodes.new("ShaderNodeAttribute"); attr.attribute_name = "black"   # exact, case-sensitive name
height = nt.nodes.new("ShaderNodeTexNoise")          # stands in for the set's displacement map
ramp = nt.nodes.new("ShaderNodeValToRGB")            # contrast: scanned height sits in mid grays
ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = 0.35, 0.65
ramp.color_ramp.elements[0].color = (1, 1, 1, 1)     # flipped: low (grout) keeps the mask
ramp.color_ramp.elements[1].color = (0.55, 0.55, 0.55, 1)
nt.links.new(height.outputs["Fac"], ramp.inputs["Fac"])
burn = nt.nodes.new("ShaderNodeMix"); burn.data_type = "RGBA"; burn.blend_type = "BURN"
burn.inputs[0].default_value = 1.0
nt.links.new(attr.outputs["Fac"], burn.inputs[6])
nt.links.new(ramp.outputs["Color"], burn.inputs[7])
mold = nt.nodes.new("ShaderNodeMix"); mold.data_type = "RGBA"
mold.inputs[6].default_value = (0.3, 0.1, 0.07, 1)   # A: the existing base-color chain in a real material
mold.inputs[7].default_value = (0.008, 0.008, 0.007, 1)
nt.links.new(burn.outputs[2], mold.inputs[0])
nt.links.new(mold.outputs[2], p.inputs["Base Color"])
print(burn.blend_type, attr.attribute_name in wall.data.color_attributes)
```

Price's layering rules around it: keep painted values mid-range (burn detail shows only at mid and
low mask values); set the effect Mix to MULTIPLY and B's value becomes the opacity; efflorescence is
the same group with a flipped ramp in SCREEN; spalling is SUBTRACT on the height before the
Displacement node (factor about 0.14) plus brighter color in the same area; wetness is a Mix on
roughness toward about 0.35 by the same mask; label each group as you build it.

## P19. Physical UV scale for tiling sets (Price)

Verified on 5.2.1 (block test). One UV unit must equal the texture's published tile size in meters
on an object with applied scale.

```python
import bpy, bmesh
bpy.ops.mesh.primitive_plane_add(size=1.0)
wall = bpy.context.active_object
wall.scale = (10.0, 5.0, 1.0)
bpy.ops.object.transform_apply(scale=True)            # all experts: apply scale first
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.0)   # always pass method (5.2 default is CONFORMAL)
bm = bmesh.from_edit_mesh(wall.data)
uv = bm.loops.layers.uv.active
tile = 2.5                                            # meters per texture tile (vendor data)
us = [l[uv].uv.x for f in bm.faces for l in f.loops]
span_u = max(us) - min(us)                            # UV width of the 10 m side
k = (10.0 / tile) / span_u
for f in bm.faces:
    for l in f.loops:
        l[uv].uv *= k
bmesh.update_edit_mesh(wall.data)
bpy.ops.object.mode_set(mode="OBJECT")
xs = [d.vector.x for d in wall.data.uv_layers.active.uv]
print(round(max(xs) - min(xs), 3))                     # 4.0 tiles across the 10 m side
```

## P20. Baking procedural channels (pointer to scenario-blender-uv-baking)

Belongs to scenario-blender-uv-baking. The texturing-side rules: bake at the end for portability
(other software, EEVEE load time, game export), not for Cycles speed (Kaspar: Sprite Fright is
mostly procedural and unbaked); route each channel through an Emission shader and bake EMIT; 30
samples minimum for anything with high frequencies, never 1 for normals; disable Mask modifier
render visibility first; validate by rebuilding the material from the maps and rendering both side
by side (`M.preview` on both, or `M.value_report`). In 5.x the target image node must be selected
AND active or the bake silently returns CANCELED (UV digest).
