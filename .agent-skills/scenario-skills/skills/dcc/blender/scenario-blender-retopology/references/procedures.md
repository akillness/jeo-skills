# Retopology procedures (tested bpy, Blender 5.2.1)

Every block fenced as `python` below is executed, in order, in one namespace, by
`tests/code/blender-retopology/test_procedures.py` on the Blender Studio sheep sculpt
(`tests/fixtures/sheep_sculpt.blend`, 186k faces, object renamed `Sculpt`). Status of the last run
is printed per block. Blocks fenced as `python-gui` need a live Blender window (MCP bridge) and were
**not run headless**. The module functions are unit-tested separately in `test_units.py` (31 checks)
and `test_units_v2.py` (32 checks, the v2 additions), measured on the sheep in `test_sheep.py`
(`sheep_results.json`), and run end to end in `test_sheep_v2.py` (`sheep_v2_results.json`, compared
with the E1 run and Kaspar in `compare/`).

Order matters: later blocks reuse `sculpt`, `cage`, `ear`, `qf` from earlier ones.

## P0. Import (every session)

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

```python
import sys, math, bpy, bmesh
from mathutils import Vector
sys.path.append("<skills>/scenario-blender-retopology/scripts")   # also puts scenario-blender-expert/scripts on the path
import bx_retopo as R
import bx_review
import numpy as np
sculpt = bpy.data.objects["Sculpt"]
```

## P1. Inspect the source before planning

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

What changes the plan: holes, non-manifold input, scale, rotation, and whether the sculpt is
actually symmetric in its own local space.

```python
info = R.topology_report(sculpt)          # bx_audit + expert checks, local space
print({k: info[k] for k in ("faces", "non_manifold_edges", "boundary_loops", "sym_local_pct",
                            "self_intersections", "dimensions")})
holes = R.boundary_loops(sculpt)          # sheep: two 144-edge eye holes, local symmetry 21 % (posed)
print("rotation in world:", tuple(round(a, 3) for a in sculpt.rotation_euler))
```

Decision rules: `sym_local_pct` below ~90 means no Mirror modifier and no QuadriFlow symmetry for
the whole body (mirror only the parts that are symmetric, or symmetrize a copy of the sculpt first
if the design allows it). A rotated object is fine as long as the cage copies its transform (P2).
`non_manifold_edges` or loose parts in an AI mesh or scan: let `R.quadriflow` voxel-remesh it (P6),
or run `bx_sculpt.voxel_remesh` from scenario-blender-sculpting.

## P1b. Read the sculptor's face sets: a ready-made landmark map

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

Sculptors partition characters with face sets (`.sculpt_face_set`). On the sheep they give the eye
masks, nose, muzzle, both lips, the mouth opening, chin, ears, hooves and tail pieces: better
landmarks than any ellipse [added, E1 run]. Print the map, render it in color, then name each id
from its position and color.

```python
fsm = R.face_set_map(sculpt)       # {id: faces, area, center, min, max, components, neighbors}
for k, v in fsm.items():
    print(k, v["faces"], v["center"], v["components"], list(v["neighbours"])[:3])
out_fs = (bpy.path.abspath("//") if bpy.data.filepath else "/tmp") + "/facesets"
paths, palette = R.face_set_review(sculpt, out_fs, views=("front", "low"), focus=((0, -0.34, 0.42), 0.16), res=500)
lip_line = max((c for c in R.face_set_border(sculpt, 42) if c[1]), key=lambda c: len(c[0]))[0]   # mouth-opening set
ears = R.face_set_components(sculpt, 21)[:2]   # two touching-free pieces of one set (k-means on x split hooves wrongly)
print(len(lip_line), "lip-line vertices;", [len(e) for e in ears], "ear faces")
```

`face_set_border(sculpt, a, b)` gives the border against one other set; `face_verts(sculpt, faces)`
the vertices of a component.

## P2. The retopo stack (Kaspar Snow Live #1 [00:11:32], BCON22 frames 00:22:53 to 00:26:38)

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

Raw bpy, same as `R.setup_cage(sculpt, name=..., wrap="TARGET_PROJECT")`:

```python
cage = bpy.data.objects.new("GEO-sheep_retopo", bpy.data.meshes.new("GEO-sheep_retopo"))
sculpt.users_collection[0].objects.link(cage)
cage.matrix_world = sculpt.matrix_world.copy()   # Mirror X = the sculpt's own local X plane
m = cage.modifiers.new("Mirror", 'MIRROR')
m.use_clip = True; m.use_mirror_merge = True; m.merge_threshold = 0.001
sw = cage.modifiers.new("Shrinkwrap", 'SHRINKWRAP')
sw.target = sculpt; sw.wrap_method = 'TARGET_PROJECT'; sw.wrap_mode = 'ON_SURFACE'
ss = cage.modifiers.new("Subdivision", 'SUBSURF')
ss.levels = 2; ss.render_levels = 2; ss.show_in_editmode = False   # never build with subdiv on the cage
print([md.type for md in cage.modifiers])
```

Wrap choice: `TARGET_PROJECT` + On Surface for skin (Kaspar's default since Snow);
`NEAREST_SURFACEPOINT` is the simplest and safest on patch borders but can snap across thin gaps;
clothing shells or double-sided sculpts: `R.setup_cage(..., wrap="PROJECT")` sets both directions,
Above Surface and a Limit (Kaspar Live #7 [00:48:52]). Keep `offset = 0`: an offset fixes convex
areas and worsens cavities (Duha BCON23 [00:08:24]); fix volume with P9 instead.

GUI session only (visibility and hand snapping):

```python-gui
area = next(a for a in bpy.context.screen.areas if a.type == 'VIEW_3D')
ov = area.spaces.active.overlay
ov.show_retopology = True          # replaces Hidden Wire / In Front / Solidify tricks (3.6+)
ov.retopology_offset = 0.01        # default since 4.5
ts = bpy.context.scene.tool_settings
ts.use_snap = True; ts.snap_elements_individual = {'FACE_PROJECT'}; ts.use_mesh_automerge = True
```

## P3. Build a part from sculpt sections (limb, ear, tail, finger, horn)

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

Kaspar builds limbs from an 8-vertex circle centered inside the limb and adds three loops per joint
(Live #4 [00:06:54], [00:08:01]). Headless: stations along the part, `R.ring` slices the sculpt
perpendicular to the path and resamples each section to `n` vertices; `R.tube` bridges them. Here:
the sheep's right ear, stations = centers of horizontal sections.

```python
def part_stations(target, z_top, z_step, side, y_range, x_min=0.1, n_max=40, every=3):
    cent = []
    for k in range(n_max):
        z = z_top - z_step * k
        best = None
        for pts, closed in R.cross_section(target, (0, 0, z), (0, 0, 1)):
            c = sum(pts, Vector()) / len(pts)
            if closed and side * c.x > x_min and y_range[0] < c.y < y_range[1]:
                best = c
        if best is None:
            break
        cent.append(best)
    return cent[::every] + ([cent[-1]] if (len(cent) - 1) % every else [])

ear = R.setup_cage(sculpt, name="GEO-sheep_ear_R", mirror=False, subsurf=2)
st = part_stations(sculpt, 0.44, 0.004, +1, (-0.36, -0.22))
rings = R.tube(ear, sculpt, st, n=10, start_dir=(0, -1, 0))
tip = min(R.boundary_loops(ear), key=lambda lp: sum(ear.data.vertices[i].co.z for i in lp))
R.grid_fill(ear, tip, target=sculpt)      # even loop only; cap projected onto the ear tip
print(len(rings), "rings,", len(ear.data.polygons), "faces")
```

Joint loops for a limb with a known joint point (elbow, knee, wrist, finger joint):

```python
stations = R.joint_stations(start=(0, 0, -0.45), joint=(0, 0, 0.0), end=(0, 0, 0.45), n_before=2, n_after=2)
print([round(p.z, 3) for p in stations])   # ... -0.054, 0.0, 0.054 ...: the three joint loops
```

Plane sections fold where a part bends (a knee, a curled ear, a tail): for anything that bends use
P3b and P8 (geodesic contours). Landmarks come from renders plus ray casts:
`R.surface_point(sculpt, origin, direction)` (the agent's 3D cursor),
`R.volume_center(sculpt, point, direction)` (Kaspar's cursor snapped to Volume: midpoint across a
limb), `R.nearest_point(sculpt, co)`. Flat, curved parts (ears) whose section does not contain its
own centroid are handled by the nearest-centroid fallback in `ring`; check the wire render for
twisted rings.

## P3b. Limbs from geodesic contours (bends, caps, touching parts)

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

Plane sections fold at bends and P3's horizontal slices only suit one ear. Iso-contours of the
geodesic distance from the tip never cross and follow any bend (E1 run). `limb_profile` walks them,
finds the root (works on caps: the contour length climbs over the cap, stays flat along the limb,
then climbs for good onto the body; a short elbow bump does not count; an ear's narrow base wins)
and the joints (bends of the contour-centroid path). Touching parts: block the other piece's
vertices.

```python
core = (0.03, -0.12, 0.28)                       # a point on the chest
ear_profiles = []
for comp in ears:
    vv = R.face_verts(sculpt, comp)
    tip = R.limb_tip(sculpt, vv, core)           # farthest from the chest
    other = np.zeros(len(sculpt.data.vertices), bool)
    for c2 in ears:
        if c2 is not comp:
            other[R.face_verts(sculpt, c2)] = True
    pr = R.limb_profile(sculpt, tip, step=0.004, max_level=0.4, block=other)
    ear_profiles.append(pr)
    print("root", round(pr["root"], 3), "joints", pr["joints"], "levels", len(pr["levels"]))
```

Measured on the sheep: roots 0 to 2 cm from the levels a person read off the printed profiles (ears
0.25/0.24, legs 0.26/0.24/0.18/0.18 m); the curled tail is about 1.05 m long, so walk it with
`max_level=1.3`.

## P4. Freeze the Shrinkwrap, relax, keep the seam closed

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

"Duplicate and apply" (Kaspar, Dikko, CG Boost, Jamie Dunbar), raw bpy:

```python
with bpy.context.temp_override(object=ear, active_object=ear):
    bpy.ops.object.modifier_copy(modifier="Shrinkwrap")
    bpy.ops.object.modifier_apply(modifier="Shrinkwrap")    # "not first" info is expected
print([md.name for md in ear.modifiers])                    # a live copy stays: "Shrinkwrap.001"
```

`R.freeze(obj)` does the same, renames the copy back and re-pins center vertices to x = 0. Relax
(the Relax Slide substitute: tangential smoothing plus reprojection, boundary and crease-attribute
verts pinned, no jumps across thin parts):

```python
moved = R.relax(ear, sculpt, iterations=4, factor=0.3)
print("mean move last iteration", round(moved, 5))
```

Use relax on hand-built, rough layouts. Do not relax a QuadriFlow result globally: on the sheep it
left the fit unchanged and worsened coverage of the sculpt (mean 0.44 % to 0.55 % of size) because
extremities shrink.

GUI session, the real brush (Kaspar relaxes in Sculpt Mode with Relax Slide, subdivision off):

```python-gui
import bx_gui as G
bpy.context.view_layer.objects.active = cage
bpy.ops.object.mode_set(mode='SCULPT')
G.set_view("FRONT", frame=cage)
G.activate_brush("SCULPT", "Relax Slide")
G.stroke("SCULPT", [Vector(p) for p in points_on_cage], size=120, strength=0.5)
```

## P5. Annotations as data (not Mark Sharp / Mark Seam)

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

Kaspar marks seams on articulation loops and sharps on crease edges as reminders (Snow Live #1
[00:30:25]). Since 4.1 `sharp_edge` changes shading and `uv_seam` drives unwrapping, so store plans
in custom attributes. `R.relax` pins `retopo_crease` edges and `R.topology_report` counts poles on
them.

```python
me = ear.data
crease = me.attributes.new("retopo_crease", 'BOOLEAN', 'EDGE')
flags = [False] * len(me.edges)
ring_mid = set(rings[len(rings) // 2])
for e in me.edges:
    if e.vertices[0] in ring_mid and e.vertices[1] in ring_mid:
        flags[e.index] = True
crease.data.foreach_set("value", flags)
print("crease poles:", R.topology_report(ear)["crease_poles"])   # must stay 0
```

## P6. Auto start: QuadriFlow, with the traps handled, denser where the face is

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

```python
head_c, head_r = (0.0, -0.331, 0.43), 0.15       # from the head face sets' area-weighted center and extent
qf, qinfo = R.quadriflow(sculpt, 3600, symmetry=False, name="GEO-sheep_qf", density=[(head_c, head_r, 1.4)])
print(qinfo)   # sheep: 10 to 30 s; edge_ratio 1.3 to 1.5 = head edges that much shorter than the body's
odd = [lp for lp in R.boundary_loops(qf) if len(lp) % 2]
while len(odd) >= 2:                             # QuadriFlow's eye slits (3 edges): pair them up
    a_ = odd.pop(0)
    b_ = odd.pop(0)
    print("parity strip cut", R.parity_strip(qf, a_, b_), "edges")
```

What `R.quadriflow` handles, all verified on 5.2.1:

- Raw `bpy.ops.object.quadriflow_remesh` refuses the sheep sculpt ("needs to be manifold") although
  it is manifold: edges shorter than about 1e-4 fail its check. The copy is scaled to about 10
  units, remeshed, scaled back.
- `use_mesh_symmetry` defaults to True in the operator. Off here unless the mesh is symmetric about
  its local x = 0.
- It lands 10 to 20 % under the target; the target is corrected and rerun. It is not deterministic:
  the same call gave eye slits in one session and no holes in another; re-measure every time.
- Uniform density (the auto-remesh signature) has a remedy: `density=[(center, radius, factor)]`
  remeshes a copy inflated around the center by an invertible radial warp (`R.density_warp`, refuses
  a folding factor), maps it back and projects it. The E1 run used factor 1.8 (head edges 1.46x
  shorter). v2 settled on 1.4 with 3,600 faces: a denser head base only forced more ring reductions
  later (1.8/4,000 also left a leg socket unbuilt; 1.3/3,200 gave 6-poles).
- Parity: it closes small holes, sometimes into 3-edge slits. An all-quad mesh has an even total of
  boundary edges, so odd boundaries come in pairs, and every island cut around one slit then has an
  odd border (E1: 47 and 45) that no all-quad annulus can make even. `R.parity_strip` loop-cuts the
  shortest quad strip between two odd boundaries (+1 vertex on each). Do it BEFORE carving islands.
- Tried and rejected [added]: cutting the islands out of the sculpt copy first (QuadriFlow merged
  four holes into one with boundary preservation, returned ragged holes without); sharp edges along
  the planned curves (no loop within 6 mm of them).

## P7. Loops on the face: map lines first, then eye and mouth islands

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

Order matters because every carve flags its faces (`bx_keep` face attribute) and later cuts never
touch them. **1. Map lines as loops** (`carve_band`): the face frame around eyes and muzzle and the
nasolabial loop around nose and mouth (Dikko: "one loop over the nose around the chin", lip rings
nest inside; Kaspar's edge-flow layer). The curve is a geodesic offset of face sets
(`enclosing_contour`, `close=` fills fjords between features so the band cannot overlap itself),
checked on the SURFACE against every limb socket (the posed ear lies on the cheek: 3D distance
lies).

```python
fs_ids = R.face_sets(sculpt)


def verts_of(ids):
    return R.face_verts(sculpt, np.nonzero(np.isin(fs_ids, ids))[0])


frame, frame_v = R.enclosing_contour(sculpt, verts_of([6, 2, 3, 23, 42, 1, 26]), 0.012, return_verts=True, close=0.03)
clear = min(float(np.min(pr["field"][frame_v])) - pr["root"] for pr in ear_profiles)   # geodesic clearance
print("face frame clearance to the ear sockets", round(clear, 3))
if clear > 0.016:                                 # half a one-loop band, edge-length spacing
    fb = R.carve_band(qf, sculpt, frame, curve_verts=frame_v)
    print("face frame", fb["count"], "verts, borders", fb["borders"], "spacing", fb["spacing"])
    print("real loop on the curve:", R.find_loop_near(qf, frame, tol=0.4 * fb["spacing"]) is not None)
nl, nl_v = R.enclosing_contour(sculpt, verts_of([3, 23, 42, 1]), 0.006, return_verts=True, close=0.02)
nb = R.carve_band(qf, sculpt, nl, curve_verts=nl_v)
print("nasolabial", nb["count"], "real loop:", R.find_loop_near(qf, nl, tol=0.4 * nb["spacing"]) is not None)
```

Band rules (all measured on the sheep): the cut grows from the faces the curve crosses (chosen with
normal agreement, so an ear lying on the cheek is never cut) and widens itself until it is an
annulus whose two borders do not touch; the default count is the larger border's, so both reduction
strips put their poles on the base side and the loop itself stays clean; ring spacing defaults to
the local edge length and one ring is the default (a flow loop, exactly on the curve). Tight rings
are a crease: 3.5 mm spacing on 12 mm faces left a ridge across the forehead after subdivision; use
`rings=3, spacing=0.3 * edge` only for a real crease. On this sheep the gap between the eye masks
and the ear roots is about 3.4 cm, so the frame fits only as a one-loop band.

**2. Eye and mouth islands** (`carve_rings`): count as a range, split at the two corners (upper =
lower by construction), rings on geodesic iso-contours. Transition rings (for a reduction from the
border) are added outside the clean rings and carry its poles.

```python
eyes = []
for lp in R.boundary_loops(sculpt):              # the sculpt's own eye holes are the landmarks
    pts = [sculpt.data.vertices[i].co.copy() for i in lp]
    c = sum(pts, Vector()) / len(pts)
    nrm = sum((sculpt.data.vertices[i].normal for i in lp), Vector()).normalized()
    r = sum((p - c).length for p in pts) / len(pts)
    eyes.append((c, nrm, r, pts, min(pts, key=lambda p: abs(p.x)), max(pts, key=lambda p: abs(p.x))))
for c, nrm, r, pts, nasal, outer in eyes:
    out = R.carve_rings(qf, sculpt, c, nrm, radius=2.0 * r, rings=4, inner_points=pts, corners=(nasal, outer),
                        count=(18, 24))          # keep the border's count when it is inside the range
    la = R.loops_around(qf, c, nrm, max_radius=2.6 * r, corners=(nasal, outer))
    print("eye border", out["border"], "transition", out["transition"], "lerp fallback", out["lerp_fallback_levels"],
          "rings", [(d["verts"], d["sides"]) for d in la])
lip = [sculpt.data.vertices[i].co.copy() for i in lip_line]
lp_ = np.array([p[:] for p in lip])
mc = Vector(lp_.mean(0))
mn = Vector(np.linalg.svd(lp_ - lp_.mean(0))[2][2])
mn = -mn if mn.y > 0 else mn                     # the face looks down local -Y
m_a, m_b = min(lip, key=lambda p: p.x), max(lip, key=lambda p: p.x)
bvh_s = R.target_bvh(sculpt)


def on_lips(p):
    hit = bvh_s.find_nearest(p)
    return hit[2] is not None and int(fs_ids[hit[2]]) in (23, 1, 42) and hit[3] < 0.02


qm = qf.copy(); qm.data = qf.data.copy(); qm.name = "GEO-sheep_closed_mouth"   # for the 2-pole variant below
sculpt.users_collection[0].objects.link(qm)
mouth = R.carve_rings(qf, sculpt, mc, mn, radius=0.1, rings=4, inner_points=lip, corners=(m_a, m_b), count=(24, 30),
                      inside=on_lips)
print("mouth", mouth["border"], "->", mouth["count"], "sides", mouth["sides"], "units", mouth["units"])
```

What each option fixed, measured against the E1 run (v1 tools) on the same sculpt:

- `corners` + `count`: exact top/bottom parity on every clean ring of both eyes (E1: 46 to 48,
  drifting to 27/21). Count reductions are Lampel's 3-to-1 junctions (`R.bridge_reduce`): each unit
  turns 3 edges into 1 and costs 4 poles (two 3-poles in the strip, two 5-poles on the smaller
  ring); units never touch each other or the corners, and keep their 5-poles non-adjacent when the
  ring is long enough (Kaspar: separate adjacent 5-poles).
- Counts as ranges, measured on the sheep (`test_sheep_v2.py`): forcing Kaspar's eyes 18 / mouth 24
  and fixed tube counts gave pole density 9.5 % of faces; `count=(18, 24)`, `(24, 30)` and tube
  ranges kept most border counts (eyes 24, mouth 30, legs 10 to 14) and gave 5.7 % (Kaspar 5.2 %).
  Forcing 18/24 on the eyes and mouth alone costs 10 more units, 40 poles.
- Bands: the nasolabial loop cost 18 poles, the face frame 64 (two long staircase borders): the
  frame is optional, build it when the rig needs it.
- `ring_mode="geodesic"` (default): rings on iso-contours of t = d_in / (d_in + d_out); they follow
  the hanging upper lip (E1: coverage p95 1.69 to 1.14 %). `ring_mode="lerp"` is the old straight
  interpolation.
- Tried and rejected: letting the mouth island fill the whole nasolabial interior (rings of 24 over
  the nose became huge twisted faces; the rings were not star-shaped around the mouth center).

**Closed mouth: Kaspar's 2-pole corners.** A 2-pole at each mouth corner turns the upper-lip loop
into the lower lip so every added loop circles the mouth; it is ripped open later for the inner
mouth (Kaspar Snow #1 [00:22:38], #2 [01:55:24]). `slit=True` welds the inner ring's halves into
that closed lip line. An open mouth (the sheep, Kaspar's own sheep retopo) is the post-rip state:
same corner-split rings, the corner vertex is a regular boundary vertex.

```python
ms = R.carve_rings(qm, sculpt, mc, mn, radius=0.1, rings=4, inner_points=lip, corners=(m_a, m_b), count=(24, 30),
                   inside=on_lips, slit=True)
bmv = bmesh.new(); bmv.from_mesh(qm.data)
two = [v.co.copy() for v in bmv.verts if len(v.link_edges) == 2]
bmv.free()
print("closed mouth:", len(two), "2-poles, at the corners:",
      all(min((v - m_a).length, (v - m_b).length) < 0.01 for v in two), "slit vertices", len(ms["hole"]))
bpy.data.objects.remove(qm)
```

Also tested in `test_sheep_v2.py` and on a sphere in `test_units_v2.py`: exactly two valence-2
vertices, both at the lip corners.

## P8. Replace a limb the auto-remesh got wrong with a geodesic socket tube

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

`socket_tube` cuts the socket at the profile's root (trial cuts until exactly one new hole), puts
rings on the geodesic contours every `spacing`, three rings over each detected joint (Kaspar: 3
loops per joint), reduces from the socket border to `count` and grid-fills the tip.

```python
for pr in ear_profiles:
    res = R.socket_tube(qf, sculpt, pr, spacing=0.018, count=(16, 28))
    print("ear socket", res["border"], "->", res["ring_counts"][-1], "rings", len(res["rings"]) - 1, "cap", res["cap_faces"])
t = R.topology_report(qf)
print("quads", t["quads_pct"], "v6+", t["valence_6plus"], "rim poles", t["rim_poles"], "holes", t["boundary_loops"])
```

Straight parts can still use `R.tube(qf, sculpt, stations, first_loop=border)` after `R.cut_region`
(P3 stations). Sheep counts used: ears 20, legs 12 (Kaspar: legs 8 then 12), tail 24; spacing 1.4 cm
on legs, 1.8 on ears.

## P9. Volume: fit the subdivided surface (Duha), or Kaspar's Multires Apply Base

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

Snapped cage + subdivision = a surface that shrinks inside (sheep QuadriFlow cage: 87 % of the
subdivided surface inside the sculpt).

```python
res = R.fit_subdiv(qf, sculpt)       # gentle defaults: 6 iterations, step 0.6, smooth 0.6, clamp 0.25
print(res["before"]["mean_pct"], "->", res["after"]["mean_pct"], "% of size;",
      res["before"]["inside_pct"], "->", res["after"]["inside_pct"], "% inside")
```

`fit_subdiv` disables live Shrinkwrap modifiers (they would re-snap the cage); ship the fitted cage
with Mirror (if any) and Subdivision only. Kaspar's Apply Base trick, raw bpy (Snow Live #5
[02:09:01]); prerequisites: Mirror applied, Shrinkwrap and Subsurf removed, cage already on the
surface:

```python
mr_obj = ear.copy(); mr_obj.data = ear.data.copy(); mr_obj.name = "GEO-sheep_ear_R_multires"
sculpt.users_collection[0].objects.link(mr_obj)
for md in list(mr_obj.modifiers):
    mr_obj.modifiers.remove(md)
with bpy.context.temp_override(object=mr_obj, active_object=mr_obj):
    mr = mr_obj.modifiers.new("Multires", 'MULTIRES')
    for _ in range(2):                                   # Kaspar: 2 body, 3 head, hair, clothes
        bpy.ops.object.multires_subdivide(modifier="Multires", mode='CATMULL_CLARK')
    swd = mr_obj.modifiers.new("SW_detail", 'SHRINKWRAP')   # MUST sit after the Multires
    swd.target = sculpt
    bpy.ops.object.modifier_apply(modifier="SW_detail")      # lands on the multires levels
    mr.levels = 0
    bpy.ops.object.multires_base_apply(modifier="Multires", apply_heuristic=True)   # "Apply Base"
    mr_obj.modifiers.remove(mr_obj.modifiers["Multires"])
sub = mr_obj.modifiers.new("Subdivision", 'SUBSURF'); sub.levels = sub.render_levels = 2
print(R.fidelity(mr_obj, sculpt, levels=2, coverage=False)["inside_pct"], "% inside (overshoot if << 50)")
```

Measured on the sheep QuadriFlow cage (same cage for both): fit_subdiv 0.045 % mean error, 53 %
inside; Apply Base 0.112 %, 15 % inside (overshoot, as Kaspar warns in Live #6 [00:20:08]). Never
re-shrinkwrap after either.

## P10. Checks and review renders

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

```python
f = R.fidelity(qf, sculpt, levels=2)          # subdivided surface vs sculpt, plus coverage
ls = R.loop_stats(qf)                         # closed loops share, spiral suspects
t = R.topology_report(qf)
print({k: f[k] for k in ("mean_pct", "p95_pct", "max_pct", "inside_pct", "cov_p95_pct")}, ls,
      {k: t[k] for k in ("quads_pct", "valence_6plus", "rim_poles", "center_poles", "adjacent_e5",
                         "pole_density_pct", "edge_len_cv", "self_intersections")})
```

Review: the cage in wire (flow, rings, spirals, poles) and the subdivided surface in matcap (lumps,
pinching), same views as the sculpt:

```python
out = bpy.path.abspath("//") if bpy.data.filepath else "/tmp"
for md in qf.modifiers:
    md.show_render = False
sheet_cage = bx_review.review([qf], out + "/review_cage", views=("front", "right", "threequarter"), modes=("wire",), res=500)
tmp = qf.modifiers.new("_review_subd", 'SUBSURF'); tmp.levels = tmp.render_levels = 2
sheet_subd = bx_review.review([qf], out + "/review_subd2", views=("front", "right", "threequarter"), modes=("matcap",), res=500)
qf.modifiers.remove(tmp)
print(sheet_cage, sheet_subd)
```

The test redirects `out` to `archive/tests/retopo_skill/procedures_run/`. Open both sheets with the
image reader and judge with `critique.md`. On the sheep, the numbers alone were misleading: an
aggressively fitted hybrid scored 0.043 % mean error (Kaspar's cage: 0.24 %) and looked clearly
lumpier.

## P11. Game low poly finishing (SpeedChar, Lampel)

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

```python
low = qf.copy(); low.data = qf.data.copy(); low.name = "GEO-sheep_low"
sculpt.users_collection[0].objects.link(low)
for md in list(low.modifiers):
    low.modifiers.remove(md)
print("tris", R.tri_count(low))                              # compare with the budget table
moved = R.push_outside(low, sculpt, offset=0.002)            # slightly proud of the high (ep35)
split = R.triangulate_twisted(low, high=sculpt, angle=15)    # choose each twisted quad's diagonal
tri = low.modifiers.new("Triangulate", 'TRIANGULATE')        # same triangulation in baker and engine
tri.quad_method = 'BEAUTY'; tri.keep_custom_normals = True
print("pushed", moved, "split", split, "sharp without seam", R.hard_edges_without_seams(low))
out_fbx = (bpy.path.abspath("//") if bpy.data.filepath else "/tmp") + "/sheep_low.fbx"
with bpy.context.temp_override(selected_objects=[low], active_object=low):
    bpy.ops.export_scene.fbx(filepath=out_fbx, use_selection=True, use_mesh_modifiers=True,
                             use_triangles=True, mesh_smooth_type='FACE')
```

Hard edges: every hard edge must be a UV seam on a baked asset (On Mars 3D, Polycount, see
scenario-blender-uv-baking); after unwrapping,
`bpy.ops.uv.seams_from_islands(mark_seams=False, mark_sharp=True)` derives hard edges from islands.

## P12. Expression / deformation smoke test (Surface Deform follows shape keys)

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

```python
sd = ear.modifiers.new("ExprCheck", 'SURFACE_DEFORM')
sd.target = sculpt
with bpy.context.temp_override(object=ear, active_object=ear):
    bpy.ops.object.surfacedeform_bind(modifier=sd.name)
print("bound:", sd.is_bound)
# with expression shape keys on the sculpt: set key_blocks["Smile"].value = 1.0, render a
# subdivided matcap, check creases form on the reserved loops without pinching at poles
ear.modifiers.remove(sd)
```

## P13. Handoff hygiene (Kaspar Finale [01:56:19], [01:58:41])

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

```python
def handoff(obj):
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj],
                                   selected_editable_objects=[obj]):
        for md in list(obj.modifiers):
            if md.type != 'SUBSURF':
                bpy.ops.object.modifier_apply(modifier=md.name)
    me = obj.data
    for name in ("sharp_edge", "uv_seam", "retopo_crease"):      # annotation leftovers
        if name in me.attributes:
            me.attributes.remove(me.attributes[name])
    if not obj.material_slots:
        obj.data.materials.append(bpy.data.materials.new(obj.name + "_viewport"))
    assert obj.name.startswith("GEO-")
    return [md.type for md in obj.modifiers]

print(handoff(ear))
```

Also: transforms applied or agreed with the rigger, reused parts stripped of vertex groups and shape
keys, no intersections between body and clothing even where hidden, rig-prep shape keys (eyes
open/closed) delivered with the mesh, and the character must read with Subdivision hidden.

## P14. Finishing an AI-generated or scanned mesh (composition)

_Verified on 5.2.1 headless: `tests/code/blender-retopology/test_procedures.py` (python blocks);
python-gui blocks not run headless._

```python
def finish_generated_mesh(src, faces, deforming=False, landmarks=()):
    """Static, bake-only or background asset: auto path. Deforming: auto start plus
    carved rings at each (center, normal, radius) landmark, then the gentle subdiv fit."""
    obj, qi = R.quadriflow(src, faces, symmetry=R.topology_report(src)["sym_local_pct"] > 98)
    for c, nrm, rad in landmarks:
        R.carve_rings(obj, src, c, nrm, radius=rad, rings=3)
    fit = R.fit_subdiv(obj, src)
    return obj, {"quadriflow": qi, "fit_after_mean_pct": fit["after"]["mean_pct"],
                 "report": R.topology_report(obj), "loops": R.loop_stats(obj)}

gen, rep = finish_generated_mesh(sculpt, 2500)
print(rep["quadriflow"], rep["fit_after_mean_pct"], rep["report"]["quads_pct"], rep["loops"])
```

For a triangle-soup AI mesh `R.quadriflow` falls back to a voxel remesh (size 1/250 of the object,
or `voxel=`); bake textures from the ORIGINAL generated mesh onto the result
(scenario-blender-uv-baking), not from the voxel copy.
