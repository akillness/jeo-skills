# Tested procedures (Blender 5.2.1 LTS, headless)

Every block below ran on the installed Blender 5.2.1 with
`blender --background --factory-startup --python-exit-code 1 --python <test>`. Tests live in
`tests/code/blender-hard-surface/`:

| Test                           | What it proves                                                                                             | Result |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------ |
| `test_01_stack_and_cutters.py` | apply_scale, stack order and pin semantics, cutters, slice, stack_problems, game_version, collapse         | 26/26  |
| `test_02_shading_audit.py`     | every expert failure mode reproduced, detected, fixed or measured; failure gallery renders                 | 32/32  |
| `test_03_parts.py`             | three parts, both schools, audits and renders (writes `test_03_parts.blend`)                               | 12/12  |
| `test_04_game_routes.py`       | glTF round trip, planar dissolve, subD low, PzThree apply-one-level, segment halving (needs test_03 first) | 5/5    |
| `test_05_raw_snippets.py`      | the raw-bpy snippets of this file, no toolkit                                                              | 11/11  |

Renders and JSON: `archive/tests/hard_surface/skill_out/` (`parts/`, `failures/`, `sheet_*.png`).

## P0. Import and conventions

```python
import sys
sys.path.append("<skills>/scenario-blender-hard-surface/scripts")   # also puts scenario-blender-expert/scripts on the path
import bx_hardsurface as HS
```

World-space meters. Objects are expected at scale 1 (`HS.apply_scale`). Cutters go to a `Cutters`
collection, helper objects (normal sources) to `HS_Helpers`. The module never touches objects it was
not given.

## P1. School A part end to end: sci-fi panel

Verified on 5.2.1, `test_03_parts.py` (Panel_A: verdict empty, 5,676 tris, custom normals,
manifold).

```python
import bmesh, bpy
from mathutils import Vector

def cube(name, size, loc):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); ob.location = loc
    bpy.context.scene.collection.objects.link(ob); bpy.context.view_layer.update()
    return ob

P = cube("Panel_A", (0.6, 0.4, 0.06), (0, 0, 0))                       # top at z = 0.03
top = HS.find_edges(P, min_angle=80, inside=((-1, -1, 0.029), (1, 1, 0.031)))
HS.set_edge_attr(P, top, 1.0)                                           # design bevel on the top rim
HS.hard_surface_stack(P, micro_width=0.0015, micro_segments=3, design_width=0.012, design_segments=8)
for i, y in enumerate((-0.1, 0.1)):                                     # stadium pockets, 12 mm deep
    HS.make_cutter(P, "SLOT", (0.22, 0.05, 0.06), (-0.14, y, 0.03 - 0.012 + 0.03), vertices=12,
                   name=f"Panel_slot{i}")
for i in range(6):                                                      # vents, 8 mm deep, 4-segment corners
    HS.make_cutter(P, "BOX", (0.012, 0.12, 0.06), (0.08 + 0.03 * i, 0.08, 0.03 - 0.008 + 0.03),
                   chamfer=0.004, chamfer_segments=4, name=f"Panel_vent{i}")
HS.make_cutter(P, "CYLINDER", (0.1, 0.1, 0.06), (0.17, -0.1, 0.03 - 0.015 + 0.03), vertices=64,
               name="Panel_port")                                       # round port, 15 mm deep
HS.make_cutter(P, "CYLINDER", (0.04, 0.04, 0.03), (0.17, -0.1, 0.026 - 0.015), vertices=48,
               operation="UNION", name="Panel_boss")                    # boss, top 4 mm under the rim
groove = HS.make_cutter(P, "BOX", (0.7, 0.01, 0.006), (0, -0.2, 0), name="Panel_railgroove", add=False)
mi = groove.modifiers.new("Mirror", "MIRROR")                           # Gambrell: mirror the cutter
mi.use_axis = (False, True, False)
mi.mirror_object = P
HS.add_boolean(P, groove)
HS.make_cutter(P, "SLOT", (0.34, 0.004, 0.04), (-0.005, 0, 0.03 - 0.004 + 0.02), rotation_deg=(0, 0, 90),
               vertices=8, name="Panel_line")        # 4 x 4 mm line (> 2 x 1.5 mm bevel), ends 30 mm from the edge
r = HS.shading_audit(P)
print(HS.verdict(r))            # [] ; stack: Bevel_design, 12 booleans, Bevel_micro*, WeightedNormal*
```

Two variants recorded in the same test, both flagged by the audit:

- the panel line as a 3 mm box running across the design-beveled rim: cut on curvature, and Clamp
  Overlap ratio 1.90, which narrowed the micro bevel on the whole panel (the closeups show thinner
  highlights everywhere); 3 mm is also exactly 2x the width, so the crossing and the gap add up;
- the line rounded with 6 segments per half circle (30-degree facets = the bevel angle limit):
  `beveled_narrow_facet_edges` 34, clamp 0.45, `clamp_culprits == ["Bool_PanelB_line"]`.

## P2. Cutter recipes

Verified on 5.2.1, `test_01`, `test_03`.

```python
# box, rounded vertical corners (4+ segments per 90 degrees keeps facets under a 30-degree bevel limit)
HS.make_cutter(target, "BOX", (0.3, 1.0, 0.3), (x, y, z), chamfer=0.03, chamfer_segments=6, name="Cut_slot")
# cylinder: vertex count now, half-segment phase by default (phase_deg=... to override)
HS.make_cutter(target, "CYLINDER", (0.12, 0.12, 0.5), (x, y, z), vertices=40, name="Cut_hole")
# horizontal cylinder (eye socket, grip bar): rotate the local Z axis
HS.make_cutter(target, "CYLINDER", (0.12, 0.12, 1.0), (x, y, z), rotation_deg=(0, 90, 0), name="Cut_eye")
# stadium slot, `vertices` per half circle (8+ at a 30-degree bevel limit)
HS.make_cutter(target, "SLOT", (0.2, 0.07, 0.12), (x, y, z), vertices=16, name="Cut_recess")
# union part (boss, grip bar): same call, operation="UNION"
# custom shape (washer for a ring groove): build it, then apply the checklist and wire it
w = washer("Groove", r_in=0.19, r_out=0.26, h=0.012, segments=48, phase=0.5)   # bmesh, see test_03
HS.as_cutter(w, target); HS.add_boolean(target, w)
# slice (Bool Tool's Slice): Difference on the target, Intersect on a single-user copy
piece = HS.slice_boolean(target, HS.make_cutter(target, "BOX", (0.02, 1, 1), (x, 0, 0), add=False))
```

`make_cutter` returns a cutter at scale 1, smooth shaded, linked only to `Cutters`,
`display_type='WIRE'`, `hide_render=True`, parented to the target with keep-transform, wired with
`solver='EXACT'` just after the last boolean and above the micro-bevel tail. Parented cutters follow
a moved target (verified). `HS.hide_cutters(target)` hides them in the viewport; booleans keep
evaluating (verified).

Copies share cutters: `game_version` and `slice_boolean` copies must stay in place (a moved copy
lost every cut in test_03). Use `HS.collapse` and move the collapsed mesh.

## P3. The stack by hand (no toolkit)

Verified on 5.2.1, `test_05_raw_snippets.py` R1 to R3.

```python
import bmesh, bpy, math
from mathutils import Matrix, Vector

bpy.ops.mesh.primitive_cube_add(size=1.0)
ob = bpy.context.active_object
ob.scale = (0.6, 0.4, 0.2)
ob.data.transform(Matrix.Diagonal(ob.scale.to_4d()))   # data-level Apply Scale (mesh not shared)
ob.scale = (1, 1, 1)
for p in ob.data.polygons:
    p.use_smooth = True

me = ob.data                                            # design bevel weights on the top rim
w = me.attributes.get("bevel_weight_edge") or me.attributes.new("bevel_weight_edge", "FLOAT", "EDGE")
for e in me.edges:
    a, b = (me.vertices[i].co for i in e.vertices)
    if a.z > 0.09 and b.z > 0.09:
        w.data[e.index].value = 1.0

d = ob.modifiers.new("Bevel_design", "BEVEL")
d.limit_method = "WEIGHT"; d.width = 0.02; d.segments = 8; d.miter_outer = "MITER_ARC"
m = ob.modifiers.new("Bevel_micro", "BEVEL")
m.limit_method = "ANGLE"; m.angle_limit = math.radians(30); m.width = 0.003; m.segments = 3
m.harden_normals = True; m.miter_outer = "MITER_ARC"            # Clamp Overlap stays on (default)
wn = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
wn.keep_sharp = True
wn.use_pin_to_last = True                              # pin bottom-up: WN first ...
m.use_pin_to_last = True                               # ... then the micro bevel

cut_me = bpy.data.meshes.new("Cut_slot")               # cutter: built at size, smooth, own collection
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=Vector((0.12, 0.6, 0.12)), verts=bm.verts)
vert_edges = [e for e in bm.edges if abs((e.verts[1].co - e.verts[0].co).normalized().z) > 0.99]
bmesh.ops.bevel(bm, geom=vert_edges, offset=0.02, segments=4, profile=0.5, affect="EDGES", clamp_overlap=True)
for f in bm.faces:
    f.smooth = True
bm.to_mesh(cut_me); bm.free()
cutter = bpy.data.objects.new("Cut_slot", cut_me)
cutter.location = (0, 0, 0.1)
cols = bpy.data.collections.get("Cutters") or bpy.data.collections.new("Cutters")
if cols.name not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(cols)
cols.objects.link(cutter)
cutter.display_type = "WIRE"; cutter.hide_render = True
cutter.parent = ob; cutter.matrix_parent_inverse = ob.matrix_world.inverted()

bo = ob.modifiers.new("Bool_slot", "BOOLEAN")          # lands above the pinned pair
bo.object = cutter; bo.operation = "DIFFERENCE"; bo.solver = "EXACT"
# stack: Bevel_design, Bool_slot, Bevel_micro, WeightedNormal ; evaluated mesh has custom normals
```

Reordering a pinned stack (R2): `modifiers.move` silently refuses moves that involve pinned
modifiers.

```python
t = ob.modifiers.new("Triangulate", "TRIANGULATE"); t.keep_custom_normals = True   # lands above pins
for x in ob.modifiers:
    x.use_pin_to_last = False
ob.modifiers.move(ob.modifiers.find("Triangulate"), len(ob.modifiers) - 1)
for name in ("Triangulate", "WeightedNormal", "Bevel_micro"):   # re-pin from the bottom up
    ob.modifiers[name].use_pin_to_last = True
```

Smooth by Angle (R3, replaces Auto Smooth; optional when Harden Normals and WN are present):

```python
with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob],
                               selected_editable_objects=[ob]):
    bpy.ops.object.shade_auto_smooth(angle=math.radians(30))
# lands pinned at the top of the pinned group (above a pinned micro bevel, below the booleans)
```

`bmesh.ops.bevel` defaults are `segments=0, profile=0.0`: always pass both.

## P4. Gate after every cut

Verified on 5.2.1, `test_02_shading_audit.py` sections (c), (d), (k).

```python
c = HS.make_cutter(target, ...)
rep = HS.cutter_report(c, target)      # scale_applied, smooth, only_in_cutters, parented_to_target,
                                       # coplanar_faces, near_parallel_faces, thin_wall_faces/min/at, narrow_gap_faces/min,
                                       # near_miss_verts, beveled_narrow_facet_edges, pokes_out
cl = HS.clamp_probe(target)            # {"ratio": displacement / width, ...}; > 0.1 = clamping
if cl["ratio"] and cl["ratio"] > 0.1:
    print(HS.clamp_culprits(target))   # booleans whose removal ends the clamping
    print(HS.sliver_report(target)["per_boolean"])   # sub-width edges/faces next to beveled edges, with positions
HS.closeup(target, c.location, 0.1, "/abs/out/cut.png", mode="shiny")
```

Measured cases (micro width 0.02 on a 1 x 0.6 x 0.4 block unless noted):

| Case                                                                            | clamp ratio         | cutter_report             | Verdict                                                     |
| ------------------------------------------------------------------------------- | ------------------- | ------------------------- | ----------------------------------------------------------- |
| pocket floor 0.1 below the top                                                  | 0.0                 | clean                     | clean                                                       |
| pocket floor 1 mm below the top                                                 | 1.38                | near_parallel 1           | flagged                                                     |
| side wall 1.5 mm from the end face                                              | 1.36                | near_parallel 1           | flagged                                                     |
| same slot extended past the end                                                 | 0.0                 | clean                     | clean                                                       |
| eye-socket cylinder 3 mm under a sloped top (bevel 8 mm)                        | 0.0                 | thin_wall 7, min 3.0 mm   | flagged; visible notch in the top bevel                     |
| same, plus a support cut through the hole (plane moved between cutter vertices) | 1.16                |                           | worse: rim bevel collapsed                                  |
| eye lowered so the wall is 44 mm                                                | 0.0                 | clean                     | clean                                                       |
| groove 2.0 / 2.9 / 3.1 / 4.0 mm wide, micro 1.5 mm                              | 0.47 / 0.05 / 0 / 0 | narrow_gap on 2.0 and 2.9 | flagged / flagged (16 hard edges unbeveled) / clean / clean |
| 24-segment cylinder, slot rim 0.7 degrees from a facet edge                     | 3.80                |                           | the port elsewhere lost its rim bevel (3.8 mm displacement) |

Clamp Overlap is global: the peak displacement (`worst_at`) is often not at the cause, hence
`clamp_culprits`.

## P5. Shading audit and triage loop

Verified on 5.2.1, `test_02` (a), (g), (h).

```python
r = HS.shading_audit(ob)
for line in HS.verdict(r):
    print(line)
# r["normals"]: smear_faces / smear_area_pct / smear_worst_deg (corner normals leaning off flat faces),
#   smoothed_hard_edges (dihedral 45 to 150 deg with continuous normals), folded_edges (> 150 deg)
# r["nonplanar_base_faces"], r["eval_flat_shaded_faces"], r["sharp_edges_on_smooth_surface"],
# r["cuts_on_curvature"], r["clamp"], r["clamp_culprits"], r["booleans"], r["cutters"], r["slivers"]
```

Measured smear on a slot box: no Harden and no WN 10 flat faces, worst 12.0 degrees; Harden only
0.02; WN only 1.91 (under the 3-degree tolerance); both 0.02. Shade Smooth with no bevel or WN: 12
hard edges smoothed across, 0 after `hard_surface_stack`. A flat-shaded cutter: flat-shaded faces in
the result and the cutter named.

## P6. Non-planar faces (Gambrell case 1)

Verified on 5.2.1, `test_02` (b).

```python
bad = HS.nonplanar_faces(ob)          # [(face index, deviation in meters)], tolerance 1e-4 x size
left = HS.flatten_faces(ob)           # projects vertices onto face planes, 5 passes; returns max deviation left
```

A box with one top corner raised 6 mm: 1 non-planar face (0.0015 m). With Harden and WN the corner
normals stayed consistent (smear metric 0), so the measurable gate here is planarity, not the normal
check; judge the stretch in a closeup. `flatten_faces` returned 0.0.

## P7. Cuts on curved surfaces (Gambrell case 2)

Verified on 5.2.1, `test_02` (f), (l); `test_03` barrels.

```python
print(HS.cuts_on_curvature(ob))       # [{"cutter": ..., "curved_faces_hit": n}], pre-boolean state incl. design bevel
dt = HS.transfer_normals(ob)          # after WN, distance-scoped, source = uncut curved faces
```

Raw settings (R7):

```python
dt = dome.modifiers.new("NormalTransfer", "DATA_TRANSFER")        # AFTER Weighted Normal
dt.object = src; dt.use_object_transform = True                   # src: clean uncut copy, smooth
dt.use_loop_data = True; dt.data_types_loops = {"CUSTOM_NORMAL"}
dt.loop_mapping = "POLYINTERP_LNORPROJ"; dt.mix_factor = 1.0
dt.use_max_distance = True; dt.max_distance = 1e-4 * max(dome.dimensions)   # only corners ON the skin
```

Measured normal error against the true surface (p95, degrees):

| Part                                        | Harden + WN | + transfer_normals | DT placed before WN |
| ------------------------------------------- | ----------- | ------------------ | ------------------- |
| 32 x 16 sphere, box port                    | 2.79        | 0.34               | 2.79 (no effect)    |
| 24-segment cylinder with design bevel, port | 3.26        | 0.07               | 3.26                |
| 48-segment cylinder, port                   | 0.61        | 0.07               | 0.61                |

No new smear on flat faces with the toolkit version. The cylinder cuts already looked clean without
it in shiny closeups; the sphere got visibly smoother. What failed first (recorded so nobody retries
it): scoping by vertex group (EXACT gives cutter-made vertices the target's weights, 1.0 measured,
so the port walls took the cylinder normals and shaded wrong); a source cropped around the cut (its
border normals made a seam); a whole-object source with sharp borders, and a curved-only source,
both let the cap corners on the design-bevel border take the strip normals (2 caps smeared, 7.4
degrees; fixed by also dropping the curved ring that meets a flat face smoothly); a plain smooth
source tilted the long side faces of the cylinder by 3.75 degrees where they meet the design-bevel
round (fixed by the source's own Weighted Normal, chosen automatically when neighboring face areas
differ more than 4x; a sphere keeps plain smoothing, where WN would give back the 2.79-degree
error).

## P8. Mirror seam butterfly (Gambrell case 3)

Verified on 5.2.1 (props), `test_02` (j), `test_05` R4. The artifact itself was not reproduced.

```python
HS.mirror_seam_fix(ob)
# raw: bevel.face_strength_mode = "FSTR_AFFECTED"; wn.use_face_influence = True; wn.weight = 100
```

## P9. School B: case with a recessed handle

Verified on 5.2.1, `test_03` (Case_B: 14-face cage, 100% quads, 8 valence-3 poles, 4,032 tris at
level 2; grip 576).

```python
CB = cube("Case_B", (0.4, 0.25, 0.3), (1.0, 0.6, 0))
bm = bmesh.new(); bm.from_mesh(CB.data); bm.faces.ensure_lookup_table()
topf = max(bm.faces, key=lambda f: f.calc_center_median().z)
bmesh.ops.inset_region(bm, faces=[topf], thickness=0.09, depth=0.0)
ext = bmesh.ops.extrude_face_region(bm, geom=[topf])
bmesh.ops.translate(bm, vec=(0, 0, -0.06), verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)])
bmesh.ops.delete(bm, geom=[topf], context="FACES")     # extrude_face_region keeps the original face
bm.to_mesh(CB.data); bm.free()
a = CB.data.attributes.new("bevel_weight_edge", "FLOAT", "EDGE")
for e in CB.data.edges:
    p, q = (CB.data.vertices[i].co for i in e.vertices)
    vertical_outer = abs(p.x - q.x) < 1e-6 and abs(p.y - q.y) < 1e-6 and abs(abs(p.x) - 0.2) < 1e-6
    a.data[e.index].value = 1.0 if vertical_outer else 0.15   # round corners, crisp rims (lower = sharper)
HS.subd_stack(CB, support_width=0.04, levels=2)   # Bevel Weight 2 seg profile 1.0 > Subsurf, Keep Corners
# grip: a separate 12-segment subD cylinder (rileyb3d: dense details as their own object)
```

Gotcha: `extrude_face_region` leaves the original face in place: delete it or the cage is
non-manifold (checked: 0 non-manifold edges after the delete). The audit flags the 4 inset ring
faces as long rectangles (aspect over 2.5): only matters if the cage will be sculpted or subdivided
further (PzThree).

## P10. School B: barrel as a lathe cage

Verified on 5.2.1, `test_03` (Barrel_B: 314 faces, 99.4% quads, 2 flat n-gon caps, verdict empty,
25,728 tris at level 2).

```python
import math
def ring_mesh(name, profile, segments):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    rings = [[bm.verts.new((r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z))
              for i in range(segments)] for r, z in profile]
    for a, b in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

prof = [(0.2, -0.3), (0.2, -0.24), (0.2, -0.186), (0.19, -0.186), (0.19, -0.174), (0.2, -0.174),
        (0.2, -0.06), (0.2, 0.06), (0.2, 0.174), (0.19, 0.174), (0.19, 0.186), (0.2, 0.186),
        (0.2, 0.24), (0.2, 0.3)]                    # sharp profile; rings every ~0.06 keep quads squarer
BB = ring_mesh("Barrel_B", prof, 24)
w = BB.data.attributes.new("bevel_weight_edge", "FLOAT", "EDGE")
bm = bmesh.new(); bm.from_mesh(BB.data); bm.edges.ensure_lookup_table()
for e in bm.edges:
    if len(e.link_faces) == 2 and math.degrees(e.calc_face_angle(0.0)) > 60:
        zs = [v.co.z for v in e.verts]
        w.data[e.index].value = 1.0 if abs(abs(zs[0]) - 0.3) < 1e-6 else 0.1   # round caps, crisp grooves
bm.free()
HS.subd_stack(BB, support_width=0.02, levels=2)
```

## P11. Support loops, creases

Verified on 5.2.1, `test_05` R5, R6; `support_loops` in the module (bmesh bevel, even segments
enforced).

```python
HS.support_loops(ob, edge_indices, offset=0.005, segments=2)   # destructive holding edges, profile 1.0
# raw bevel-before-subdivision (Lampel):
sup = sb.modifiers.new("Support", "BEVEL")
sup.limit_method = "WEIGHT"; sup.width = 0.03; sup.segments = 2; sup.profile = 1.0
ss = sb.modifiers.new("Subdivision", "SUBSURF")
ss.levels = 2; ss.render_levels = 2; ss.uv_smooth = "PRESERVE_CORNERS"
# creases, small details only:
c = sb.data.attributes.get("crease_edge") or sb.data.attributes.new("crease_edge", "FLOAT", "EDGE")
c.data[0].value = 1.0                                          # Subdivision.use_creases is True by default
```

The weighted 0.5 m box kept 0.5 m under subdivision (support holds the shape).

## P12. Game routes

Verified on 5.2.1, `test_03`, `test_04`.

```python
g, tris = HS.game_version(ob, micro_segments=1, design_segments=2)   # in place; Triangulate keep custom normals, last
bpy.ops.export_scene.gltf(filepath="/abs/x.glb", export_format="GLB", use_selection=True,
                          export_apply=True, export_normals=True)       # select g first
```

- Barrel mid-poly: 7,308 tris (render stack) to 3,716 (1-segment micro, 2-segment design); glTF
  re-import matched 100% of (position, normal) pairs, custom normals present.
- Planar low poly from booleans (Augusto): collapse a stack without bevels, `DECIMATE`
  `decimate_type='DISSOLVE'`, `angle_limit=radians(1)`, `delimit={'SHARP','MATERIAL','SEAM'}`
  (values are a suggestion): 1,268 to 1,260 tris on the panel, manifold, same size. Little to gain
  on a boolean n-gon mesh; the big savings come from dropping bevel segments.
- Live segment halving (Ryuu's even segments): panel micro bevel 4 segments 7,266 tris, 2 segments
  4,166.
- SubD high to low (rileyb3d): same object at level 1: 25,728 to 6,432 tris; dissolve non-silhouette
  loops and bake in scenario-blender-uv-baking.
- Multires bake, Bevel-shader-node bake and painted 32-bit height (PzThree, Augusto): see
  scenario-blender-uv-baking; not run here.

## P13. PzThree iteration: apply one subdivision level per pass

Verified on 5.2.1, `test_04` (14 to 56 faces).

```python
col = bpy.data.collections.new("pass_1"); bpy.context.scene.collection.children.link(col)
it = cage.copy(); it.data = cage.data.copy(); it.name = cage.name + "_pass1"; col.objects.link(it)
ss = next(m for m in it.modifiers if m.type == "SUBSURF"); ss.levels = 1
with bpy.context.temp_override(object=it, active_object=it, selected_objects=[it]):
    bpy.ops.object.modifier_apply(modifier=ss.name)
# delete faces on the mirror plane first so edges do not taper (PzThree [00:12:00])
```

## P14. Review renders

Verified on 5.2.1, `test_03`, `test_02`; `test_05` R10 lists the matcaps.

```python
HS.review([ob], "/abs/out/dir", views=("front", "threequarter", "top", "low"),
          modes=("matcap", "hsgrey", "reflect", "wire"), res=560)     # evaluated copies, cutters never render
HS.closeup(ob, point, radius, "/abs/out/cut.png", direction=(-0.6, -1, 0.8), mode="shiny", res=480)
```

Modes: `matcap` (clay_studio), `normals` (check_normal+y), `wire`, `silhouette` from bx_review, plus
`shiny` (metal_carpaint), `reflect` (check_reflection_horizontal), `hsgrey` (hard_surface_gray),
`fullmetal`. `review` bakes the evaluated mesh into temporary objects, so the wire row shows the
real boolean topology (Exact's split edges across n-gons are normal).

## P15. Collapse for rigging or export (du Mont)

Verified on 5.2.1, `test_01`, `test_05` R9.

```python
col = HS.collapse(ob, "Part_collapsed")          # new object, modifiers baked, custom normals kept
# raw:
dg = bpy.context.evaluated_depsgraph_get()
baked = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
```

Keep the editable original hidden in its own collection (du Mont's "frogbot editable").

## Not run here

- Interactive tools (Bool Tool shortcuts, Add Cube tool on a surface, curve Draw, loop cut and
  slide): replaced by the calls above; `scene.ray_cast` gives a surface point and normal to place a
  cutter (digest).
- `bpy.ops.mesh.extrude_manifold`, `select_similar`, `select_edge_ring_multi`: op ids verified by
  the distiller, behavior not run.
- Sculpted damage on multires (PzThree): GUI with bx_gui, see scenario-blender-sculpting.
