# Procedures (tested on Blender 5.2.1 LTS)

Two layers:

1. **`scripts/bx_uvbake.py`**: the tested module (use it whenever you can import a file; it works
   headless and in a live session). Pipelines below. Tests:
   `tests/code/blender-uv-baking/test_uv_primitives.py` (primitives), `test_sheep_uv.py` and
   `test_sheep_bake.py` (Blender Studio sheep, CC-BY), `test_snippets.py` (this file's snippets).
2. **Raw bpy snippets** for when only inline code is possible. Every block tagged `# snippet:` is
   executed verbatim by `tests/code/blender-uv-baking/test_snippets.py` (it parses this file). Each
   block builds its own demo objects so it runs alone; replace the demo part with your objects.

Import pattern:

```
import sys; sys.path.append("<skills>/scenario-blender-uv-baking/scripts"); import bx_uvbake as ub
```

## Pipeline A: game hard-surface prop (verified, test_uv_primitives.py sections A, E, F, H)

```
ub.prepare_low(low)                                   # apply scale, smooth shading
ub.seams_from_sharp(low, angle_deg=30, mark_sharp=True)   # every hard edge a seam, sharps = seams
ub.cut_to_disks(low, view_dirs=[(0, -1, 0)])          # rings/closed parts get one hidden cut
ub.unwrap(low, method="BEST")                         # Conformal/Angle Based/Min Stretch per island
ub.straighten(low)                                    # grid-like islands, before any scaling
ub.normalize_texel_density(low, ub.TD_TARGETS["fps"], 2048)   # 1024 px/m, strict
ub.texture_size_for(low, 1024, 0.75)                  # does 2048 hold it? else 4096 or a second set
ub.pack(low, tex_res=2048, scale=False)               # keep density; fits_tile False = raise res/split
q = ub.uv_qa(low, 2048); print(ub.uv_verdict(q, "game"))
ub.prepare_low(low, sharp_from_uv_islands=True, triangulate=True)   # hard edges = island borders, ship tris
r = ub.bake_high_to_low(low, [high], out_dir, res=2048, maps=("NORMAL", "AO"), directx=False)
```

## Pipeline B: game character (verified on the sheep, test_sheep_uv.py, test_sheep_bake.py)

```
ub.seams_from_uv_islands(low)        # only if a layout exists: recover its seams (file seam flags may be retopo marks)
# or: ub.seams_from_groups(low, "FACE_SETS") / labels per face from your part segmentation
ub.cut_to_disks(low, view_dirs=[(0, -1, 0)])          # measured: islands with holes kept unless they stretch
u = ub.unwrap(low, method="BEST")
if u["folding_faces"]:                                 # a limb folded onto the body
    ub.seams_from_groups(low, "FACE_SETS", faces=u["folding_faces"]); ub.cut_to_disks(low); ub.unwrap(low, method="BEST")
w = ub.face_weights_from_vgroup(low, "head", 1.0, 1.5)   # or any per-face weights (face 1.5-2, soles 0.5)
ub.normalize_texel_density(low, None, 2048, weights=w)
ub.pack(low, tex_res=2048, allow_any=True)            # organic islands: free rotation allowed
ub.uv_layout_image(low, out + "/uv.png"); ub.checker_review([low], out); ub.distortion_review(low, out)
ub.prepare_low(low)
r = ub.bake_high_to_low(low, [sculpt], out, res=2048, maps=("NORMAL", "AO"))   # adaptive extrusion by default
ub.bake_review(low, [sculpt], r["paths"], out)        # LOOK at it
if r["sanity"]["NORMAL"]["problems"] or r["sanity"]["NORMAL"]["notes"]:
    ub.map_problem_review(low, r["paths"]["NORMAL"], out)   # where are the bad texels (Pipeline E)
ub.curvature_from_normal(r["paths"]["NORMAL"], out + "/curv.png", mask=ub.island_mask(low, 2048))
ub.bake_id(low, [sculpt], out, source="MATERIAL")     # or "OBJECT", or "ATTRIBUTE" + attribute="Col"
ub.hookup_maps(low, normal=r["paths"]["NORMAL"], ao=r["paths"]["AO"])
```

Results on the sheep (2,596-face retopo, 186k-face sculpt, 2048):
`archive/tests/uv_baking_skill/out_sheep_uv/results.json` and `out_sheep_bake/results.json` (renders
next to them).

## Pipeline C: film character, UDIMs and symmetry

- Tiles per region from the closest shot (Hernandez): head 1001, body 1002, hands 1003 (Kaspar). Per
  region: `ub.pack(obj, tex_res=4096, faces=region_faces)` (the region alone into 0-1), then
  `ub.move_to_tile(obj, region_faces, tile)`. Do not rely on `udim_source="CLOSEST_UDIM"` headless:
  it packed a region sitting in 1002 back into 1001 (verified, test_uv_primitives.py section M). Raw
  equivalent of the move: snippet `udim_offset`.
- Symmetric UVs: Mirror modifier with Mirror U + Flip UDIM, center line at u = tile + 0.5 (snippet
  `mirror_u_flip_udim`).
- QA: `ub.uv_qa(obj, 4096)` reports per-tile coverage, gap and `faces_crossing_tiles` (must be 0);
  use `profile="film"` in `uv_verdict`.
- UDIM bake target: snippet `udim_bake`.

## Pipeline D: Multires bake (Abbitt; verified on the sheep)

```
ub.bake_multires(obj, out, res=2048, types=("NORMALS", "DISPLACEMENT"), base_level=0)
```

Before: even base face sizes, UVs on the base, Conform Base if the sculpt moved the silhouette
(`bpy.ops.object.multires_base_apply(modifier="Multires", apply_heuristic=False)` is presumably
Conform Base; mapping not verified), shade smooth.

## Pipeline E: bake loop when the first bake is not clean (SpeedChar, automated)

1. Read `r["sanity"][kind]["problems"]` / `["notes"]`, `r["projection"]` (`miss_pct`,
   `wrong_part_pct`) and `r["adaptive"]["texel_share"]` (which extrusion each texel used).
2. `ub.map_problem_review(low, r["paths"]["NORMAL"], out)`: renders the low with bad texels painted
   red (inverted) and blue (missed). Look at where they are.
3. `ub.sweep_projection(low, highs, out)`: single-pass bakes at 0.35-1.4 x the measured extrusion.
   If the inverted share moves, the distance is the problem: use the best factor, a cage, or
   `adaptive=(...)` with more factors. If it does not move (sheep: 7.3-7.8% at every factor), low
   and high differ there: fit the low (SpeedChar's fitting pass), close holes in the high, give thin
   parts more low geometry, or bake that part separately.
4. Neighboring parts projecting into each other (fingers, ears, stacked parts):
   `ub.explode([[low_a, high_a], [low_b, high_b]])`, bake, `ub.unexplode(...)`; or bake each pair
   into the same image (snippet `per_pair_bake`).
5. Re-bake only the map being tuned, at 512, then the final resolution.
6. A hand-shaped cage (snippet `cage_object`) is the manual fallback. `ub.build_cage` (automatic) is
   EXPERIMENTAL: on the sheep it baked worse (9.5% inverted) than one measured distance (7.3%) and
   the adaptive bake (2.2%).

Verified numbers (test_sheep_bake.py): sculpt onto retopo, single pass 7.3% inverted, adaptive 2.2%;
retopo's own Multires level 3 as a separate high, single 7.5%, adaptive 1.2%, and the adaptive map
matches `bake_multires` (median texel difference 0.011, p95 0.19).

## Raw bpy snippets

### Unwrap with an explicit method and catch a silent failure

```python
# snippet: unwrap_explicit
import bpy, bmesh
import numpy as np
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8)      # demo: closed, no seams
obj = bpy.context.active_object
for e in obj.data.edges:
    e.use_seam = False
lay = obj.data.uv_layers.active
lay.uv.foreach_set("vector", np.zeros(len(obj.data.loops) * 2))       # zero first: a failed island stays zero
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
res = bpy.ops.uv.unwrap(method='ANGLE_BASED', fill_holes=True, margin=0.001)   # always pass method
bpy.ops.object.mode_set(mode='OBJECT')
lay = obj.data.uv_layers.active                                          # re-fetch: references go stale
uv = np.empty(len(obj.data.loops) * 2); lay.uv.foreach_get("vector", uv)
unsolved = np.ptp(uv.reshape(-1, 2), axis=0).max() < 1e-9
assert res == {'FINISHED'} and unsolved   # FINISHED, yet unsolved; without zeroing it keeps the OLD UVs, repacked
```

### Pin and re-unwrap (the headless Live Unwrap)

```python
# snippet: pin_reunwrap
import bpy, bmesh
bpy.ops.mesh.primitive_grid_add(x_subdivisions=6, y_subdivisions=6)   # demo
obj = bpy.context.active_object
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(obj.data); uvl = bm.loops.layers.uv.active
corner = min(bm.verts, key=lambda v: v.co.x + v.co.y)
for l in corner.link_loops:
    l[uvl].uv = (0.0, 0.0); l[uvl].pin_uv = True       # pin and place
bmesh.update_edit_mesh(obj.data)
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.0)    # pinned UVs stay exactly where placed
bm = bmesh.from_edit_mesh(obj.data); uvl = bm.loops.layers.uv.active
corner = min(bm.verts, key=lambda v: v.co.x + v.co.y)
assert all(l[uvl].uv.length < 1e-6 for l in corner.link_loops)
bpy.ops.uv.pin(clear=True)
bpy.ops.object.mode_set(mode='OBJECT')
```

### Pack with a pixel gap

```python
# snippet: pack_pixel_gap
import bpy
bpy.ops.mesh.primitive_cube_add()                      # demo: default cube UVs, 6 faces
obj = bpy.context.active_object
res, gap_px = 2048, 2048 / 128                          # Lampel: res/128 for games (16 px at 2K)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.seams_from_islands()
bpy.ops.uv.unwrap(method='CONFORMAL', margin=0.0)
bpy.ops.uv.average_islands_scale()
r = bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, rotate_method='CARDINAL',
                            scale=True, margin_method='FRACTION', margin=gap_px / (2 * res),
                            shape_method='CONCAVE')    # FRACTION m: gap 2m between islands, m to the border
bpy.ops.object.mode_set(mode='OBJECT')
uvs = [d.vector for d in obj.data.uv_layers.active.uv]
border_px = min(min(u.x, u.y, 1 - u.x, 1 - u.y) for u in uvs) * res
assert r == {'FINISHED'} and 6 <= border_px <= 10, border_px
```

### Selected-to-active bake with every setting explicit

```python
# snippet: s2a_bake
import bpy
bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32); high = bpy.context.active_object
d = high.modifiers.new("d", 'DISPLACE'); d.texture = bpy.data.textures.new("n", 'CLOUDS'); d.strength = 0.05
bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8); low = bpy.context.active_object
bpy.ops.object.shade_smooth()                            # demo ends; low has UVs, high is detailed
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 16    # >1 antialiases
img = bpy.data.images.new("low_normal", 512, 512, alpha=False, float_buffer=True)
img.colorspace_settings.name = 'Non-Color'
mat = low.active_material or bpy.data.materials.new("low_mat")
if not low.data.materials: low.data.materials.append(mat)
nt = mat.node_tree
node = nt.nodes.new("ShaderNodeTexImage"); node.image = img
for n in nt.nodes: n.select = False
node.select = True; nt.nodes.active = node              # 5.x: selected AND active, else CANCELED silently
bpy.ops.object.select_all(action='DESELECT')
high.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
r = bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True,
                        cage_extrusion=0.06, max_ray_distance=0.12,   # ray counts FROM the extruded start
                        margin=4, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES',
                        normal_space='TANGENT', normal_r='POS_X', normal_g='POS_Y', normal_b='POS_Z')
assert r == {'FINISHED'}, r                              # always assert: failures do not raise
img.filepath_raw = bpy.app.tempdir + "low_normal.png"; img.file_format = 'PNG'; img.save()   # 16-bit PNG
```

### AO bake: distance and occluders

```python
# snippet: ao_setup
import bpy
sc = bpy.context.scene
sc.world = sc.world or bpy.data.worlds.new("World")
low = bpy.context.active_object
sc.world.light_settings.distance = 0.2 * low.dimensions.length   # default is 10 units: far too big for props
keep = {low.name} | {o.name for o in bpy.context.selected_objects}
for o in sc.objects:                                   # every render-visible non-selected object occludes
    if o.name not in keep:
        o.hide_render = True
sc.cycles.samples = 128                                # AO is noisy; normals are fine at 16
assert sc.world.light_settings.distance < 10
```

### DirectX output (Unreal) and reading a DirectX map

```python
# snippet: directx
import bpy
b = bpy.context.scene.render.bake
b.normal_g = 'NEG_Y'                                    # bake writes G = 1 - G (DirectX, Y-)
mat = bpy.data.materials.new("read_dx")
nm = mat.node_tree.nodes.new("ShaderNodeNormalMap")
nm.convention = 'DIRECTX'                               # 5.1+: read a DirectX map in Blender
assert b.normal_g == 'NEG_Y' and nm.convention == 'DIRECTX'
b.normal_g = 'POS_Y'
```

### Multires bake

```python
# snippet: multires_bake
import bpy
bpy.ops.mesh.primitive_cube_add(); obj = bpy.context.active_object
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(island_margin=0.02); bpy.ops.object.mode_set(mode='OBJECT')
mr = obj.modifiers.new("Multires", 'MULTIRES')
for _ in range(3):
    bpy.ops.object.multires_subdivide(modifier="Multires", mode='CATMULL_CLARK')
bpy.ops.object.shade_smooth()                            # demo ends: base cube, round level 3
sc = bpy.context.scene; sc.render.engine = 'CYCLES'
mr.levels = 0; mr.render_levels = mr.total_levels      # low = viewport level, high = render level
img = bpy.data.images.new("mr_normal", 256, 256, float_buffer=True); img.colorspace_settings.name = 'Non-Color'
mat = bpy.data.materials.new("mr"); obj.data.materials.append(mat)
node = mat.node_tree.nodes.new("ShaderNodeTexImage"); node.image = img
for n in mat.node_tree.nodes: n.select = False
node.select = True; mat.node_tree.nodes.active = node
b = sc.render.bake; b.use_multires = True; b.type = 'NORMALS'; b.margin = 4; b.use_clear = True
assert bpy.ops.object.bake_image() == {'FINISHED'}      # no arguments: reads scene.render.bake
b.use_multires = False
```

### UDIM target that bakes

```python
# snippet: udim_bake
import bpy
img = bpy.data.images.new("body_udim", 256, 256, float_buffer=True, tiled=True)   # tile 1001
with bpy.context.temp_override(edit_image=img):
    bpy.ops.image.tile_add(number=1002, count=1, fill=True, width=256, height=256,
                           float=True, generated_type='BLANK')   # fill=True: tiles.new() alone = "Uninitialized image"
img.filepath_raw = bpy.app.tempdir + "body_udim.<UDIM>.exr"
assert [t.number for t in img.tiles] == [1001, 1002]
```

### Move a region to a UDIM tile

```python
# snippet: udim_offset
import bpy, bmesh
bpy.ops.mesh.primitive_cube_add(); obj = bpy.context.active_object     # demo
tile = 1002
du, dv = (tile - 1001) % 10, (tile - 1001) // 10
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(obj.data); uvl = bm.loops.layers.uv.active
for f in bm.faces:
    if f.normal.z > 0.5:                                   # demo region: the top face
        for l in f.loops:
            l[uvl].uv.x += du; l[uvl].uv.y += dv          # uv.move_on_axis needs a UV editor
bmesh.update_edit_mesh(obj.data); bpy.ops.object.mode_set(mode='OBJECT')
assert max(d.vector.x for d in obj.data.uv_layers.active.uv) > 1.0
```

### Mirror U + Flip UDIM (film symmetry)

```python
# snippet: mirror_u_flip_udim
import bpy
bpy.ops.mesh.primitive_monkey_add(); obj = bpy.context.active_object   # demo
m = obj.modifiers.new("Mirror", 'MIRROR')
m.use_axis[0] = True; m.use_bisect_axis[0] = True       # keep one half, mirror it
m.use_mirror_u = True; m.use_mirror_udim = True        # mirror each half around its own tile center
assert m.use_mirror_u and m.use_mirror_udim            # the center line must sit at u = tile + 0.5
```

### Offset a stacked copy one tile before baking

```python
# snippet: offset_stacked
import bpy, bmesh
bpy.ops.mesh.primitive_plane_add(); obj = bpy.context.active_object    # demo: one face
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(obj.data); uvl = bm.loops.layers.uv.active
for f in bm.faces:                                        # demo "duplicate" = every face here
    for l in f.loops:
        l[uvl].uv.x += 1.0                                # outside 0-1: the baker skips it, the shader
bmesh.update_edit_mesh(obj.data); bpy.ops.object.mode_set(mode='OBJECT')   # wraps, so it reads the same texels
assert min(d.vector.x for d in obj.data.uv_layers.active.uv) >= 1.0
```

### Custom cage object

```python
# snippet: cage_object
import bpy
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8); low = bpy.context.active_object   # demo
cage = low.copy(); cage.data = low.data.copy(); cage.name = low.name + "_cage"
bpy.context.scene.collection.objects.link(cage)
for v in cage.data.vertices:
    v.co += v.normal * 0.05                               # shrink by hand where parts are close (fingers)
cage.hide_render = True
b = bpy.context.scene.render.bake
b.use_cage = True; b.cage_object = cage                   # same topology and face order as the low
assert b.cage_object == cage
b.use_cage = False; b.cage_object = None
```

### Several high/low pairs into one image (Blender has no match-by-name)

```python
# snippet: per_pair_bake
import bpy
def bake_pairs(pairs, **kw):
    """pairs: [(low, [highs]), ...] sharing one bake image; clear only on the first pass."""
    for i, (low, highs) in enumerate(pairs):
        bpy.ops.object.select_all(action='DESELECT')
        for h in highs: h.select_set(True)
        low.select_set(True); bpy.context.view_layer.objects.active = low
        r = bpy.ops.object.bake(use_selected_to_active=True, use_clear=(i == 0), **kw)
        assert r == {'FINISHED'}, r
assert callable(bake_pairs)
```

### Game low: triangulate what you ship

```python
# snippet: triangulate
import bpy
bpy.ops.mesh.primitive_cube_add(); low = bpy.context.active_object     # demo
t = low.modifiers.new("Triangulate", 'TRIANGULATE')
t.keep_custom_normals = True                               # Gambrell's "Keep Normals"
t.quad_method = 'BEAUTY'                                    # whatever it is, export the same (apply or FBX use_triangles)
assert t.keep_custom_normals
```
