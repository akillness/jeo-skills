# Geometry Nodes procedures (tested on Blender 5.2.1 LTS)

Every code block in this file ran headless on Blender 5.2.1 LTS on 2026-09-24 with
`blender --background --factory-startup --python-exit-code 1 --python <test>`. Raw-bpy blocks A to H
are copied from the test that asserts them; recipe blocks are the exact source of
`scripts/bx_gn.py`.

| Test script (tests/code/blender-geometry-nodes/) | Covers                                                                                                                                         | Result |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `test_00_verified_procedures.py`                 | Procedures A to H in raw bpy (the distiller's asserting script)                                                                                | ALL OK |
| `test_01_builder.py`                             | bx_gn core: identifiers, socket resolution, link validation, inputs, QA channel, join order, zones, layout, readers, assets, seeds, publishing | 32/32  |
| `test_02_recipes.py`                             | scatter, curve array (chain), repeat growth, with renders                                                                                      | 20/20  |
| `test_03_simulation.py`                          | particle drop simulation, cache, frame jump, calculate_to_frame, bake, rotated host, naive vs captured update, frame strip                     | 13/13  |
| `test_04_physics_assets.py`                      | Cloth Dynamics + Collider bundle, Custom Force closure, Custom Effector stages, Extra Sim Attributes                                           | 11/11  |

Renders written by the tests (open them when you rerun):
`archive/tests/geonodes/skill_out/recipe_scatter.png`, `recipe_chain.png`, `recipe_growth.png`,
`growth_review/review_sheet.png`, `recipe_particles.png`, `physics_cloth.png`.

## 0. Build rules for 5.2 (raw bpy)

1. `tree = bpy.data.node_groups.new(name, 'GeometryNodeTree')`; add `NodeGroupInput` /
   `NodeGroupOutput` yourself. `tree.is_modifier` defaults False but assigning the tree to a Nodes
   modifier works; `is_modifier = True` + `tree.asset_mark()` only to publish it [verified].
2. Interface:
   `tree.interface.new_socket(name, description="", in_out='INPUT'|'OUTPUT', socket_type='NodeSocketFloat', parent=panel)`,
   `new_panel(name, default_closed=True)`, `clear()`. Item props: `default_value`, `min_value`,
   `max_value`, `subtype` ('FACTOR', 'ANGLE', 'DISTANCE'), `dimensions` (2D vectors),
   `attribute_domain` (outputs), `default_attribute_name`, `hide_value`, `hide_in_modifier`,
   `force_non_field`, `structure_type`. `NodeSocketFloatFactor` is not a valid socket_type: use
   subtype [verified].
3. `tree.links.new(a, b)` returns None, silently, when a socket belongs to another tree [verified].
   Assert the return value.
4. Set node properties (`data_type`, `domain`, `operation`, `mode`, `input_type`) BEFORE touching
   sockets: they decide which sockets exist. Menus are sockets:
   `inputs['Mode'].default_value = 'Matrix'` (Transform Geometry), `'Length'` (Resample Curve).
5. Name lookup: 5.2.1 returns the available socket for Mix `inputs['A']` (A_Vector when data_type is
   VECTOR) [verified], but duplicate enabled names return the first: Cloth Dynamics has `Gravity`
   bool (Socket_5) and vector (Socket_3); Custom Effector has `Stage` menu (Socket_1) and string
   (Socket_2). Use identifiers. Math inputs are `Value`, `Value_001`, `Value_002` (use indices).
   Capture Attribute items are named by you but identified `Value` / `Attribute` (`_001` ...).
   Points node output is named `Points`, identified `Geometry`.
6. Zones: `zi.pair_with_output(zo)` for Simulation, Repeat, For Each Geometry Element, Closure.
   Items: `state_items`, `repeat_items`, `input_items` / `main_items` / `generation_items` (+
   `.domain`), closure `input_items` / `output_items`, Evaluate Closure `input_items` /
   `output_items`, Combine Bundle `bundle_items`, Capture Attribute `capture_items`. Types: FLOAT,
   INT, BOOLEAN, VECTOR, RGBA, ROTATION, MATRIX, STRING, GEOMETRY, BUNDLE, CLOSURE.
7. Zone membership is decided by links: a node is inside only when it connects into the zone output
   (Thommes 4.3 video 00:12:35).
8. Modifier inputs: `getattr(md.properties.inputs, item.identifier).value = v`, attribute mode
   `.type = 'ATTRIBUTE'; .attribute_name = "x"`; outputs
   `md.properties.outputs.<id>.attribute_name`. THEN `obj.update_tag()`: setting `.value` alone does
   not re-evaluate in 5.2.1 [verified].
9. Read results:
   `gs = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).evaluated_geometry()`; keep `gs`
   referenced while reading `.mesh`, `.curves`, `.pointcloud`, `.instances_pointcloud()` (attributes
   `instance_transform`, `.reference_index`, plus every point attribute carried onto the instances),
   `.instance_references()`, `.name`. The instance point cloud's `position` attribute reads zeros:
   use `instance_transform` [verified].
10. Compare bpy structs with `==`, never `is`: every attribute access returns a new Python wrapper
    (`md.node_group is md.node_group` can be False) [verified in a layout test].

## 1. bx_gn quick reference

```python
import sys; sys.path.append("<skill>/scripts"); import bx_gn as G
b = G.Builder("Name", geometry_in=True, geometry_out=True)   # rebuilds an existing tree in place
s = b.input("Density", "FLOAT", 10.0, min=0, max=None, subtype=None, panel="Group", description="",
            dimensions=None, single_value=False, default_attribute=None)   # -> Group Input socket
o = b.output("Mask", "FLOAT", domain="EDGE")                 # -> Group Output socket
n = b.node("Math", operation="MULTIPLY", ins={0: s, 1: 0.5}) # alias | bare name | bl_idname
b.set(n, "Value_001", 2.0); b.link(src, dst)                 # src: socket | node | (node, key)
zi, zo = b.zone("SIMULATION", items=[("VECTOR", "Velocity", "POINT")])
zi, zo = b.zone("REPEAT", items=[("BOOLEAN", "Tip")], iterations=s)
zi, zo = b.zone("FOREACH", domain="POINT", inputs=[("VECTOR", "Position")], generation=[("FLOAT", "H", "INSTANCE")])
zi, zo = b.zone("CLOSURE", inputs=[("FLOAT", "x")], outputs=[("FLOAT", "fx")])
b.items(node, "bundle_items" | "capture_items" | "input_items" | "output_items", [("TYPE", "name")])
j = b.join([a, c])                                            # output order = list order
b.output_geometry(src); tree = b.done()                       # zone check + layout
md = G.attach(obj, tree, name=None, inputs={"Density": 20, "Mask": "attr:weights"})
G.set_inputs(md, {...}); G.get_inputs(md); G.set_output_attribute(md, "Mask", "edge_mask")
G.check(md)          # {'ok', 'invalid_links', 'warnings', 'unpaired_zones', 'hard_refs', 'output_unlinked'}
G.stats(obj); G.attribute(obj, "name", "mesh"|"curves"|"pointcloud"|"instances"); G.positions(obj, comp, world)
G.instance_transforms(obj, world=False); G.world_bbox([objs]); G.time_eval(obj)
G.step(range(1, 61), fn); G.bake(obj); G.free_bake(obj)
G.append_group("Cloth Dynamics (Experimental)", "dynamics"); G.list_assets("essentials")
G.material("Name", (r, g, b)); G.snapshot([objs], "/abs/out.png", views=("threequarter", "top"), frames=[4, 12, 60])
```

## Procedure A: attribute pipeline to the shader (Thommes BCON22 00:09:19)

Edge Angle (Signed) x Scale stored on EDGE as `edge_mask`; the shader reads it with an Attribute
node. Rest-state variant: a GN modifier BEFORE the deformer stores Face Area as `rest_face_area`
(store to freeze); one AFTER divides the current Face Area by it (ratio < 1 compressed, > 1
stretched). Alternative to Store Named Attribute: a float group output with
`attribute_domain = 'EDGE'` named through `G.set_output_attribute` (test_01). Verified on 5.2.1:
`test_00_verified_procedures.py` block A (helpers first, used by A to H).

```python
import bpy, math
# ---- helpers
def new_tree(name, geo_in=True):
    t = bpy.data.node_groups.new(name, 'GeometryNodeTree')
    if geo_in:
        t.interface.new_socket("Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
    t.interface.new_socket("Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
    return t, t.nodes.new('NodeGroupInput'), t.nodes.new('NodeGroupOutput')

def link(t, a, b):
    l = t.links.new(a, b)
    assert l is not None, f"links.new returned None: {a.node.name}.{a.identifier} -> {b.node.name}.{b.identifier} (sockets from another tree?)"
    return l

def add_gn(ob, tree, name=None):
    md = ob.modifiers.new(name or tree.name, 'NODES'); md.node_group = tree; return md

def set_input(ob, md, socket_name, value):
    item = [i for i in md.node_group.interface.items_tree
            if i.item_type == 'SOCKET' and i.in_out == 'INPUT' and i.name == socket_name][0]
    getattr(md.properties.inputs, item.identifier).value = value
    ob.update_tag()                      # 5.2.1: setting the value alone does NOT re-evaluate

def evaluated(ob):
    return ob.evaluated_get(bpy.context.evaluated_depsgraph_get())

def qa(t, md):
    bad = [(l.from_node.name, l.from_socket.identifier, l.to_node.name, l.to_socket.identifier)
           for l in t.links if not l.is_valid]
    warn = [(w.type, w.message) for w in md.node_warnings]
    return bad, warn


for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
# ---- A. attribute pipeline (edge mask for the shader)
bpy.ops.mesh.primitive_cube_add(); cube = bpy.context.object
t, gi, go = new_tree("EdgeMask")
sc_ = t.interface.new_socket("Scale", in_out='INPUT', socket_type='NodeSocketFloat'); sc_.default_value = 1.0
ea = t.nodes.new('GeometryNodeInputMeshEdgeAngle')
mul = t.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
st = t.nodes.new('GeometryNodeStoreNamedAttribute'); st.data_type = 'FLOAT'; st.domain = 'EDGE'
st.inputs['Name'].default_value = "edge_mask"
link(t, ea.outputs['Signed Angle'], mul.inputs[0]); link(t, gi.outputs['Scale'], mul.inputs[1])
link(t, gi.outputs['Geometry'], st.inputs['Geometry']); link(t, mul.outputs[0], st.inputs['Value'])
link(t, st.outputs['Geometry'], go.inputs['Geometry'])
md = add_gn(cube, t)
set_input(cube, md, "Scale", 2.0)
a = evaluated(cube).data.attributes["edge_mask"]
assert a.domain == 'EDGE' and abs(a.data[0].value - math.pi) < 1e-3, a.data[0].value
assert qa(t, md) == ([], [])
print("A ok: edge_mask on EDGE =", round(a.data[0].value, 4))
```

## Procedure B: custom simulation with a float state (Thommes BCON23 00:11:12 to 00:16:11)

State item Temperature; the value into the Simulation Input is read on the first frame only; wire
input to output or it resets; expose the controller Object; step every frame. For irreversible
memory add a second state combined with Math MAXIMUM of previous and current (00:25:54); multiply
rates by Delta Time for frame-rate independence. Verified on 5.2.1: block B (300 K min, 1635 K max
after 30 frames).

```python
# ---- B. simulation zone with a float state (heating)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=20, y_subdivisions=20, size=2); grid = bpy.context.object
bpy.ops.object.empty_add(location=(0.5, 0.5, 0)); ctrl = bpy.context.object
t, gi, go = new_tree("Heat")
t.interface.new_socket("Controller", in_out='INPUT', socket_type='NodeSocketObject')   # expose, never hard-reference
sin = t.nodes.new('GeometryNodeSimulationInput'); sout = t.nodes.new('GeometryNodeSimulationOutput')
assert sin.pair_with_output(sout)
item = sout.state_items.new('FLOAT', "Temperature"); item.attribute_domain = 'POINT'
env = t.nodes.new('ShaderNodeValue'); env.outputs[0].default_value = 300.0          # initial state, read on first frame only
link(t, gi.outputs['Geometry'], sin.inputs['Geometry']); link(t, env.outputs[0], sin.inputs['Temperature'])
oi = t.nodes.new('GeometryNodeObjectInfo'); oi.transform_space = 'RELATIVE'
link(t, gi.outputs['Controller'], oi.inputs['Object'])
pos = t.nodes.new('GeometryNodeInputPosition')
dist = t.nodes.new('ShaderNodeVectorMath'); dist.operation = 'DISTANCE'
link(t, pos.outputs[0], dist.inputs[0]); link(t, oi.outputs['Location'], dist.inputs[1])
mr = t.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.5; mr.inputs['From Max'].default_value = 0.0
link(t, dist.outputs['Value'], mr.inputs['Value'])
rate = t.nodes.new('ShaderNodeMath'); rate.operation = 'MULTIPLY'; rate.inputs[1].default_value = 0.05
link(t, mr.outputs['Result'], rate.inputs[0])
mix = t.nodes.new('ShaderNodeMix'); mix.data_type = 'FLOAT'; mix.inputs['B'].default_value = 2000.0   # name lookup hits A_Float/B_Float
link(t, rate.outputs[0], mix.inputs['Factor']); link(t, sin.outputs['Temperature'], mix.inputs['A'])
link(t, mix.outputs['Result'], sout.inputs['Temperature']); link(t, sin.outputs['Geometry'], sout.inputs['Geometry'])
st = t.nodes.new('GeometryNodeStoreNamedAttribute'); st.inputs['Name'].default_value = "Temperature"
link(t, sout.outputs['Geometry'], st.inputs['Geometry']); link(t, sout.outputs['Temperature'], st.inputs['Value'])
link(t, st.outputs['Geometry'], go.inputs['Geometry'])
md = add_gn(grid, t)
set_input(grid, md, "Controller", ctrl)
scene = bpy.context.scene
for f in range(1, 31):                      # step every frame; a jump computes only ONE step
    scene.frame_set(f)
temps = [d.value for d in evaluated(grid).data.attributes["Temperature"].data]
assert min(temps) == 300.0 and 1600 < max(temps) < 1700, (min(temps), max(temps))
print("B ok: temperature min/max after 30 frames", round(min(temps), 1), round(max(temps), 1))
scene.frame_set(1)
```

## Procedure C: iterative topology operation with a repeat zone (Erindale 00:47:08)

Evaluate on Domain POINT > EDGE > POINT, Ceil, captured each iteration. Counts 1, 5, 13, 25 for 0 to
3 steps on an interior vertex. The builder version is in test_01 (same counts).
`primitive_grid_add(x_subdivisions=21)` gives 22 x 22 vertices in 5.2.1: compute the center index
from the real count. Verified on 5.2.1: block C.

```python
# ---- C. repeat zone (expand a selection over topology)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=21, y_subdivisions=21, size=2); g2 = bpy.context.object
t, gi, go = new_tree("ExpandSelection")
t.interface.new_socket("Steps", in_out='INPUT', socket_type='NodeSocketInt').default_value = 3
idx = t.nodes.new('GeometryNodeInputIndex')
cmp = t.nodes.new('FunctionNodeCompare'); cmp.data_type = 'INT'; cmp.operation = 'EQUAL'; cmp.inputs['B'].default_value = 253
link(t, idx.outputs[0], cmp.inputs['A'])
rin = t.nodes.new('GeometryNodeRepeatInput'); rout = t.nodes.new('GeometryNodeRepeatOutput'); assert rin.pair_with_output(rout)
rout.repeat_items.new('BOOLEAN', "Selection")
link(t, gi.outputs['Geometry'], rin.inputs['Geometry']); link(t, cmp.outputs[0], rin.inputs['Selection'])
link(t, gi.outputs['Steps'], rin.inputs['Iterations'])
d1 = t.nodes.new('GeometryNodeFieldOnDomain'); d1.domain = 'POINT'; d1.data_type = 'FLOAT'
d2 = t.nodes.new('GeometryNodeFieldOnDomain'); d2.domain = 'EDGE'; d2.data_type = 'FLOAT'
d3 = t.nodes.new('GeometryNodeFieldOnDomain'); d3.domain = 'POINT'; d3.data_type = 'FLOAT'
ceil = t.nodes.new('ShaderNodeMath'); ceil.operation = 'CEIL'
link(t, rin.outputs['Selection'], d1.inputs[0]); link(t, d1.outputs[0], d2.inputs[0])
link(t, d2.outputs[0], d3.inputs[0]); link(t, d3.outputs[0], ceil.inputs[0])
cap = t.nodes.new('GeometryNodeCaptureAttribute'); cap.domain = 'POINT'; cap.capture_items.new('BOOLEAN', "Sel")
link(t, rin.outputs['Geometry'], cap.inputs['Geometry']); link(t, ceil.outputs[0], cap.inputs['Sel'])
link(t, cap.outputs['Geometry'], rout.inputs['Geometry']); link(t, cap.outputs['Sel'], rout.inputs['Selection'])
st = t.nodes.new('GeometryNodeStoreNamedAttribute'); st.data_type = 'BOOLEAN'; st.inputs['Name'].default_value = "sel"
link(t, rout.outputs['Geometry'], st.inputs['Geometry']); link(t, rout.outputs['Selection'], st.inputs['Value'])
link(t, st.outputs['Geometry'], go.inputs['Geometry'])
md = add_gn(g2, t)
counts = []
for n in (0, 1, 2, 3):
    set_input(g2, md, "Steps", n)
    counts.append(sum(1 for d in evaluated(g2).data.attributes["sel"].data if d.value))
assert counts == [1, 5, 13, 25], counts          # diamond growth on an interior vertex (22x22 grid, index 253)
print("C ok: selected verts per step", counts)
```

## Procedure D: per-element generator with for-each (Thommes BCON24 00:28:54)

Field outside, single value inside; zone Index as the Random Value ID (the implicit ID field gives a
red link that `md.node_warnings` does not report: `G.check` lists it in `invalid_links`, test_01).
Generated geometry socket `Generation_0`; generated attributes need `item.domain` matching the
output (INSTANCE after Geometry to Instance). Prefer a field-based rewrite when performance matters.
Verified on 5.2.1: block D.

```python
# ---- D. for-each element zone (one object per point)
bpy.ops.mesh.primitive_plane_add(); host = bpy.context.object
t, gi, go = new_tree("ForEachCubes")
grd = t.nodes.new('GeometryNodeMeshGrid'); grd.inputs['Vertices X'].default_value = 3; grd.inputs['Vertices Y'].default_value = 3
fin = t.nodes.new('GeometryNodeForeachGeometryElementInput'); fout = t.nodes.new('GeometryNodeForeachGeometryElementOutput')
assert fin.pair_with_output(fout); fout.domain = 'POINT'
fout.input_items.new('VECTOR', "Position")                   # field outside, single value inside
link(t, grd.outputs['Mesh'], fin.inputs['Geometry']); link(t, t.nodes.new('GeometryNodeInputPosition').outputs[0], fin.inputs['Position'])
cb = t.nodes.new('GeometryNodeMeshCube'); cb.inputs['Size'].default_value = (0.3, 0.3, 0.3)
xf = t.nodes.new('GeometryNodeTransform')
rv = t.nodes.new('FunctionNodeRandomValue'); rv.inputs['Min'].default_value = 0.5; rv.inputs['Max'].default_value = 1.5
link(t, fin.outputs['Index'], rv.inputs['ID'])              # without this the implicit ID field makes an invalid (red) link
link(t, cb.outputs['Mesh'], xf.inputs['Geometry']); link(t, fin.outputs['Position'], xf.inputs['Translation'])
link(t, rv.outputs['Value'], xf.inputs['Scale'])
link(t, xf.outputs['Geometry'], fout.inputs['Generation_0'])
gn = t.nodes.new('GeometryNodeSetGeometryName'); gn.inputs['Name'].default_value = "Cubes"
link(t, fout.outputs['Generation_0'], gn.inputs['Geometry']); link(t, gn.outputs[0], go.inputs['Geometry'])
md = add_gn(host, t)
e = evaluated(host)
assert len(e.data.vertices) == 72 and e.evaluated_geometry().name == "Cubes"
assert qa(t, md) == ([], [])
print("D ok: 9 cubes, geometry name", e.evaluated_geometry().name)
```

## Procedure E: closure passed into a group (Johnny Matthews 00:07:57)

Evaluate Closure inside the group, Closure zone outside, both signatures created explicitly with the
same item names. A mismatch evaluates to 0 and reports `ERROR: Closure does not have output: "fx"`
in `md.node_warnings`. Index Switch / Menu Switch with `data_type = 'CLOSURE'` chooses among
closures. Verified on 5.2.1: block E; builder version in test_01.

```python
# ---- E. closure passed into a group (declarative pattern)
inner = bpy.data.node_groups.new("Graph", 'GeometryNodeTree')
inner.interface.new_socket("x", in_out='INPUT', socket_type='NodeSocketFloat')
inner.interface.new_socket("Function", in_out='INPUT', socket_type='NodeSocketClosure')
inner.interface.new_socket("f(x)", in_out='OUTPUT', socket_type='NodeSocketFloat')
igi, igo = inner.nodes.new('NodeGroupInput'), inner.nodes.new('NodeGroupOutput')
evc = inner.nodes.new('NodeEvaluateClosure'); evc.input_items.new('FLOAT', "x"); evc.output_items.new('FLOAT', "fx")
link(inner, igi.outputs['Function'], evc.inputs['Closure']); link(inner, igi.outputs['x'], evc.inputs['x'])
link(inner, evc.outputs['fx'], igo.inputs['f(x)'])
t, gi, go = new_tree("ClosureGraph")
pts = t.nodes.new('GeometryNodePoints'); pts.inputs['Count'].default_value = 50
xs = t.nodes.new('ShaderNodeMath'); xs.operation = 'MULTIPLY'; xs.inputs[1].default_value = 0.1
link(t, t.nodes.new('GeometryNodeInputIndex').outputs[0], xs.inputs[0])
grp = t.nodes.new('GeometryNodeGroup'); grp.node_tree = inner
cin = t.nodes.new('NodeClosureInput'); cout = t.nodes.new('NodeClosureOutput'); assert cin.pair_with_output(cout)
cout.input_items.new('FLOAT', "x"); cout.output_items.new('FLOAT', "fx")      # names must match the Evaluate Closure items
sine = t.nodes.new('ShaderNodeMath'); sine.operation = 'SINE'
link(t, cin.outputs['x'], sine.inputs[0]); link(t, sine.outputs[0], cout.inputs['fx'])
link(t, cout.outputs['Closure'], grp.inputs['Function']); link(t, xs.outputs[0], grp.inputs['x'])
cxyz = t.nodes.new('ShaderNodeCombineXYZ'); link(t, xs.outputs[0], cxyz.inputs['X']); link(t, grp.outputs['f(x)'], cxyz.inputs['Y'])
sp = t.nodes.new('GeometryNodeSetPosition'); link(t, pts.outputs[0], sp.inputs['Geometry']); link(t, cxyz.outputs[0], sp.inputs['Position'])
p2v = t.nodes.new('GeometryNodePointsToVertices'); link(t, sp.outputs[0], p2v.inputs[0]); link(t, p2v.outputs[0], go.inputs['Geometry'])
host.modifiers.clear(); md = add_gn(host, t)
vs = evaluated(host).data.vertices
assert max(abs(v.co.y - math.sin(v.co.x)) for v in vs) < 1e-5
cout.output_items[0].name = "y"                                   # deliberate signature mismatch
evaluated(host)
assert any("fx" in w.message for w in md.node_warnings)
cout.output_items[0].name = "fx"
print("E ok: closure evaluated inside group; mismatch reported in md.node_warnings")
```

## Procedure F: transform stacking with matrices (Matrix video 00:08:08 to 00:13:56)

Box origin at its bottom; Accumulate Field TRANSFORM on INSTANCE, Trailing (excludes self) into
Separate/Combine Transform with Instance Scale; each box sits exactly on the heights below.
Randomize the STEP transform (rotation, XY offset) for a lean that propagates. Verified on 5.2.1:
block F (z_i = sum of heights below within 1e-4).

```python
# ---- F. matrix stacking (Accumulate Field on transforms)
t, gi, go = new_tree("Stack")
t.interface.new_socket("Count", in_out='INPUT', socket_type='NodeSocketInt').default_value = 6
p = t.nodes.new('GeometryNodePoints'); link(t, gi.outputs['Count'], p.inputs['Count'])
box = t.nodes.new('GeometryNodeMeshCube')
lift = t.nodes.new('GeometryNodeTransform'); lift.inputs['Translation'].default_value = (0, 0, 0.5)   # origin at the bottom
link(t, box.outputs['Mesh'], lift.inputs['Geometry'])
iop = t.nodes.new('GeometryNodeInstanceOnPoints'); link(t, p.outputs[0], iop.inputs['Points']); link(t, lift.outputs[0], iop.inputs['Instance'])
rnd = t.nodes.new('FunctionNodeRandomValue'); rnd.data_type = 'FLOAT_VECTOR'
rnd.inputs['Min'].default_value = (1, 1, 0.05); rnd.inputs['Max'].default_value = (1.5, 1.5, 0.3)
link(t, rnd.outputs['Value'], iop.inputs['Scale'])
isc = t.nodes.new('GeometryNodeInputInstanceScale')
zonly = t.nodes.new('ShaderNodeVectorMath'); zonly.operation = 'MULTIPLY'; zonly.inputs[1].default_value = (0, 0, 1)
link(t, isc.outputs[0], zonly.inputs[0])
step = t.nodes.new('FunctionNodeCombineTransform'); link(t, zonly.outputs[0], step.inputs['Translation'])
acc = t.nodes.new('GeometryNodeAccumulateField'); acc.data_type = 'TRANSFORM'; acc.domain = 'INSTANCE'
link(t, step.outputs[0], acc.inputs['Value'])
sep = t.nodes.new('FunctionNodeSeparateTransform'); link(t, acc.outputs['Trailing'], sep.inputs[0])   # Trailing = previous boxes only
ct = t.nodes.new('FunctionNodeCombineTransform')
link(t, sep.outputs['Translation'], ct.inputs['Translation']); link(t, sep.outputs['Rotation'], ct.inputs['Rotation'])
link(t, isc.outputs[0], ct.inputs['Scale'])
sit = t.nodes.new('GeometryNodeSetInstanceTransform'); link(t, iop.outputs[0], sit.inputs['Instances']); link(t, ct.outputs[0], sit.inputs['Transform'])
link(t, sit.outputs[0], go.inputs['Geometry'])
host.modifiers.clear(); md = add_gn(host, t)
e = evaluated(host); gs = e.evaluated_geometry()      # keep gs alive, else the pointcloud is freed (ReferenceError)
ipc = gs.instances_pointcloud()
mats = [d.value for d in ipc.attributes['instance_transform'].data]
import mathutils
zs = [mathutils.Matrix(m).translation.z for m in mats]; hs = [mathutils.Matrix(m).to_scale().z for m in mats]
assert all(abs(zs[i] - sum(hs[:i])) < 1e-4 for i in range(len(zs)))
print("F ok: each box sits on the sum of the heights below it")
```

## Procedure G: gizmo-ready asset (Thommes BCON24 00:11:26, 4.3 video 00:03:20)

Gizmo Value linked from the same scaled value used for its Position, through the FIRST input of the
math node; gizmo Transform output joined into the geometry; artist-facing gizmos drive Group Input
sockets. A gizmo on a non-invertible source (Random Value) evaluates to `link.is_valid == False`.
Dragging is GUI only. Verified on 5.2.1: block G (wiring only).

```python
# ---- G. gizmo wiring (value must be invertible back to a source)
t, gi, go = new_tree("GizmoGrid", geo_in=False)
t.interface.new_socket("Size X", in_out='INPUT', socket_type='NodeSocketFloat').default_value = 2.0
g = t.nodes.new('GeometryNodeMeshGrid'); link(t, gi.outputs['Size X'], g.inputs['Size X'])
half = t.nodes.new('ShaderNodeMath'); half.operation = 'MULTIPLY'; half.inputs[1].default_value = 0.5
link(t, gi.outputs['Size X'], half.inputs[0])                   # driven value must be the FIRST input
pos3 = t.nodes.new('ShaderNodeCombineXYZ'); link(t, half.outputs[0], pos3.inputs['X'])
gz = t.nodes.new('GeometryNodeGizmoLinear'); gz.color_id = 'X'; gz.inputs['Direction'].default_value = (1, 0, 0)
lk = link(t, half.outputs[0], gz.inputs['Value']); link(t, pos3.outputs[0], gz.inputs['Position'])
j = t.nodes.new('GeometryNodeJoinGeometry')
link(t, g.outputs['Mesh'], j.inputs[0]); link(t, gz.outputs['Transform'], j.inputs[0])       # keeps gizmo attached after transforms
link(t, j.outputs[0], go.inputs['Geometry'])
host.modifiers.clear(); md = add_gn(host, t); evaluated(host)
bad_src = t.nodes.new('FunctionNodeRandomValue'); gz2 = t.nodes.new('GeometryNodeGizmoLinear')
lk2 = link(t, bad_src.outputs['Value'], gz2.inputs['Value']); evaluated(host)
assert lk.is_valid and not lk2.is_valid
t.nodes.remove(gz2); t.nodes.remove(bad_src)
print("G ok: gizmo on group input valid; gizmo on non-invertible source flagged is_valid=False")
```

## Procedure H: 5.2 cloth with collider and custom force (Thommes BCON26 00:01:43 to 00:08:30)

Append the dynamics assets (local copies), vertex group `Group` (the default Pin Group attribute),
collider object in its own collection with the Collider asset as its modifier, wrapper tree: Cloth
Dynamics group node, Named Attribute into Pin Group, collection into Effectors Collection, Custom
Force in a named Combine Bundle entry into Effectors. The builder version with a Custom Force
closure is Procedure N. Verified on 5.2.1: block H (no vertex inside the sphere after 30 frames).

```python
# ---- H. 5.2 physics: Cloth Dynamics asset + Collider + Custom Force bundle
import os
lib = os.path.join(bpy.utils.system_resource('DATAFILES'), "assets", "nodes", "geometry_nodes_dynamics_assets.blend")  # system_resource(path=<file>) returns ''
with bpy.data.libraries.load(lib, link=False) as (src, dst):
    dst.node_groups = ["Cloth Dynamics (Experimental)", "Collider", "Custom Force"]
cloth_ng, collider_ng, force_ng = dst.node_groups
bpy.ops.mesh.primitive_grid_add(x_subdivisions=20, y_subdivisions=20, size=2, location=(0, 0, 1.5)); cl = bpy.context.object
cl.vertex_groups.new(name="Group").add([v.index for v in cl.data.vertices if v.co.y > 0.99], 1.0, 'REPLACE')  # default Pin Group attribute
coll = bpy.data.collections.new("Colliders"); scene.collection.children.link(coll)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(0, -0.3, 0.8)); sph = bpy.context.object
for c in sph.users_collection: c.objects.unlink(sph)
coll.objects.link(sph)
add_gn(sph, collider_ng, "Collider")
t, gi, go = new_tree("ClothWrap")
cn = t.nodes.new('GeometryNodeGroup'); cn.node_tree = cloth_ng
link(t, gi.outputs['Geometry'], cn.inputs['Geometry']); link(t, cn.outputs['Geometry'], go.inputs['Geometry'])
t.interface.new_socket("Colliders", in_out='INPUT', socket_type='NodeSocketCollection')
link(t, gi.outputs['Colliders'], cn.inputs['Effectors Collection'])
na = t.nodes.new('GeometryNodeInputNamedAttribute'); na.inputs['Name'].default_value = "Group"
link(t, na.outputs['Attribute'], cn.inputs['Pin Group'])
force = t.nodes.new('GeometryNodeGroup'); force.node_tree = force_ng; force.inputs['Force'].default_value = (0, 0, 2.0)
bund = t.nodes.new('NodeCombineBundle'); bund.bundle_items.new('BUNDLE', "Updraft")   # named entries, many effectors
link(t, force.outputs['Force'], bund.inputs['Updraft']); link(t, bund.outputs['Bundle'], cn.inputs['Effectors'])
md = add_gn(cl, t)
set_input(cl, md, "Colliders", coll)
for f in range(1, 31):
    scene.frame_set(f)
c0 = sph.matrix_world.translation
wv = [cl.matrix_world @ v.co for v in evaluated(cl).data.vertices]
assert sum(1 for q in wv if (q - c0).length < 0.49) == 0
assert qa(t, md) == ([], [])
print("H ok: cloth settles over collider, no vertex inside; lowest z", round(min(q.z for q in wv), 3))
```

## Procedure I: the builder loop with QA (test_01)

```python
import bx_gn as G
b = G.Builder("Lift")
h = b.input("Height", "FLOAT", 0.0)
b.output_geometry(b.node("SetPosition", ins={"Geometry": b.geo_in,
                                             "Offset": b.node("CombineXYZ", ins={"Z": h})}))
md = G.attach(cube, b.done(), inputs={"Height": 3.0})       # tags the object: result updates
rep = G.check(md); assert rep["ok"], rep
G.set_inputs(md, {"Height": "attr:lift"})                   # vertex group drives a field input
```

What test_01 asserts beyond this: every alias in `NODE_IDS` instantiates (79); ambiguous names raise
with identifiers; cross-tree links raise; raw `.value` without `update_tag()` leaves the result
unchanged; `md["Socket_1"] = v` raises TypeError; the for-each implicit-ID red link is flagged and
fixed by the zone Index; a closure name mismatch is an ERROR warning; a hard-referenced Object Info
object is reported; `b.join` keeps list order (raw Blender reversed it); layout puts the output
rightmost with no overlap; world bbox includes instances while the evaluated `bound_box` does not;
`md.execution_time` is 0.0 headless; a float group output becomes a named EDGE attribute; Essentials
lists Scatter on Surface and Array; a rebuilt tree keeps its pointer; two Random Value nodes with
the same Seed correlate at 1.0; `is_modifier` + `asset_mark()` publish.

## Procedure J: scatter on a surface (test_02; Erindale 00:35:19 normal selection, Thommes BCON23 00:31:30 local space)

Density x mask (attribute or vertex group via `attr:`), slope limit against WORLD up (Compare,
Vector, Direction, LESS_EQUAL, Angle), upright (Align Rotation to Vector Z to world up) or
normal-aligned rotation, random spin around the local Z, random scale, pick among an Object and the
children of a Collection, per-instance `scatter_rand` for shaders, instances kept unless Realize.

```python
def _world_up_local(b):
    """(0,0,1) world expressed in the modified object's space: Self Object > Object Info >
    Invert Matrix > Transform Direction (Thommes: everything in GN is object-local)."""
    info = b.node("ObjectInfo", transform_space="ORIGINAL", ins={"Object": b.node("SelfObject")})
    inv = b.node("InvertMatrix", ins={"Matrix": (info, "Transform")})
    return b.node("TransformDirection", ins={"Direction": (0.0, 0.0, 1.0), "Transform": (inv, "Matrix")}), info, inv
def _seed_plus(b, seed, k):
    """Offset seeds per Random Value node: two nodes with the same ID and Seed return correlated values."""
    return b.node("IntegerMath", operation="ADD", ins={0: seed, 1: k})
def scatter_tree(name="BX Scatter"):
    """Scatter on a surface: density x mask (attribute/vertex group), world-up slope limit,
    upright or normal-aligned rotation with random spin, random scale, pick from an object
    and/or a collection, per-instance 'scatter_rand' attribute for shaders, optional realize.
    Instances stay instances by default (cheap; shaders read instance attributes)."""
    b = Builder(name)
    inst_obj = b.input("Instance", "OBJECT", description="object instanced on the points")
    inst_col = b.input("Instances", "COLLECTION", description="pick randomly among the children")
    dens = b.input("Density", "FLOAT", 10.0, min=0.0, description="points per square metre (object space)")
    mask = b.input("Density Mask", "FLOAT", 1.0, min=0.0, max=1.0, subtype="FACTOR",
                   description="0 to 1; switch to an attribute or vertex group with attr:NAME")
    slope = b.input("Max Slope", "FLOAT", math.radians(35.0), min=0.0, max=math.pi, subtype="ANGLE",
                    description="faces steeper than this (vs world up) get nothing")
    seed = b.input("Seed", "INT", 0)
    smin = b.input("Scale Min", "FLOAT", 0.8, min=0.0, panel="Transform")
    smax = b.input("Scale Max", "FLOAT", 1.2, min=0.0, panel="Transform")
    align = b.input("Align to Normal", "BOOL", False, panel="Transform",
                    description="off: upright in world (trees); on: follow the surface (rocks, moss)")
    spin = b.input("Random Spin", "FLOAT", 1.0, min=0.0, max=1.0, subtype="FACTOR", panel="Transform")
    realize = b.input("Realize", "BOOL", False, panel="Output")

    up, _, _ = _world_up_local(b)
    flat = b.node("Compare", data_type="VECTOR", mode="DIRECTION", operation="LESS_EQUAL",
                  ins={"A": b.node("Normal"), "B": up, "Angle": slope})
    density = b.node("Math", operation="MULTIPLY", ins={0: dens, 1: mask})
    dist = b.node("DistributePointsOnFaces", ins={"Mesh": b.geo_in, "Selection": flat, "Density": density,
                                                  "Seed": seed})
    upright = b.node("AlignRotationToVector", axis="Z", ins={"Vector": up})
    base_rot = b.node("Switch", input_type="ROTATION", ins={"Switch": align, "False": upright,
                                                             "True": (dist, "Rotation")})
    two_pi = b.node("Math", operation="MULTIPLY", ins={0: spin, 1: 2 * math.pi})
    ang = b.node("RandomValue", data_type="FLOAT", ins={"Min": 0.0, "Max": two_pi, "Seed": _seed_plus(b, seed, 1)})
    rot = b.node("RotateRotation", rotation_space="LOCAL",
                 ins={"Rotation": base_rot,
                      "Rotate By": b.node("EulerToRotation", ins={"Euler": b.node("CombineXYZ", ins={"Z": ang})})})
    scl = b.node("RandomValue", data_type="FLOAT", ins={"Min": smin, "Max": smax, "Seed": _seed_plus(b, seed, 2)})
    oi = b.node("ObjectInfo", transform_space="ORIGINAL", ins={"Object": inst_obj, "As Instance": True})
    ci = b.node("CollectionInfo", ins={"Collection": inst_col, "Separate Children": True, "Reset Children": True})
    pool = b.join([(oi, "Geometry"), ci])
    pick = b.node("RandomValue", data_type="INT", ins={"Min": 0, "Max": 9999, "Seed": _seed_plus(b, seed, 3)})
    iop = b.node("InstanceOnPoints", ins={"Points": dist, "Instance": pool, "Pick Instance": True,
                                          "Instance Index": pick, "Rotation": rot, "Scale": scl})
    rid = b.node("RandomValue", data_type="FLOAT", ins={"Seed": _seed_plus(b, seed, 4)})
    tagged = b.node("StoreNamedAttribute", data_type="FLOAT", domain="INSTANCE",
                    ins={"Geometry": iop, "Name": "scatter_rand", "Value": rid})
    real = b.node("RealizeInstances", ins={"Geometry": tagged})
    res = b.node("Switch", input_type="GEOMETRY", ins={"Switch": realize, "False": tagged, "True": real})
    b.output_geometry(b.join([b.geo_in, res]))
    return b.done()
```

Usage and gates (test_02): terrain 10 x 10 m with hills, density 12, `Density Mask = "attr:density"`
(weight 0 at -X to 1 at +X), Max Slope 30 degrees. Measured: 159 instances for 158.1 expected;
steepest host face under an instance 29.97 degrees; upright Z dot world Z > 0.9999; aligned Z dot
face normal 1.0; scale inside [0.7, 1.3]; mask split 5 left vs 58 right; 3 instance references;
flipped terrain gives 0 (world-space test).

```python
md = G.attach(terrain, G.scatter_tree(), inputs={"Instance": rock, "Instances": plants, "Density": 12.0,
              "Density Mask": "attr:density", "Max Slope": math.radians(30), "Seed": 3,
              "Scale Min": 0.7, "Scale Max": 1.3})
```

## Procedure K: array along a curve, a chain (test_02; Thommes BCON22 00:23:07 resample for even spacing)

Curve to Points in Length mode gives even spacing plus Tangent and Normal; two Align Rotation to
Vector nodes (X to tangent, then Z to normal pivoting on X) make the frame explicit; an alternating
roll around the tangent (Index floored-modulo 2 x angle) turns torus links into a chain.

```python
def curve_array_tree(name="BX Curve Array"):
    """Array an object along the modified curve at a fixed spacing: instance X along the tangent,
    Z along the curve normal, optional alternating twist around the tangent (chain links: 90
    degrees), random scale, keep or drop the curve, optional realize."""
    b = Builder(name)
    inst = b.input("Instance", "OBJECT")
    spacing = b.input("Spacing", "FLOAT", 0.25, min=0.001, subtype="DISTANCE")
    scale = b.input("Scale", "FLOAT", 1.0, min=0.0)
    rscale = b.input("Random Scale", "FLOAT", 0.0, min=0.0, max=1.0, subtype="FACTOR")
    twist = b.input("Alternate Twist", "FLOAT", 0.0, subtype="ANGLE", description="extra roll on every other instance")
    seed = b.input("Seed", "INT", 0)
    keep = b.input("Keep Curve", "BOOL", False, panel="Output")
    realize = b.input("Realize", "BOOL", False, panel="Output")

    pts = b.node("CurveToPoints", mode="LENGTH", ins={"Curve": b.geo_in, "Length": spacing})
    a1 = b.node("AlignRotationToVector", axis="X", ins={"Vector": (pts, "Tangent")})
    a2 = b.node("AlignRotationToVector", axis="Z", pivot_axis="X", ins={"Rotation": a1, "Vector": (pts, "Normal")})
    odd = b.node("Math", operation="FLOORED_MODULO", ins={0: b.node("Index"), 1: 2.0})
    roll = b.node("Math", operation="MULTIPLY", ins={0: odd, 1: twist})
    rot = b.node("RotateRotation", rotation_space="LOCAL",
                 ins={"Rotation": a2,
                      "Rotate By": b.node("EulerToRotation", ins={"Euler": b.node("CombineXYZ", ins={"X": roll})})})
    lo = b.node("Math", operation="SUBTRACT", ins={0: 1.0, 1: rscale})
    hi = b.node("Math", operation="ADD", ins={0: 1.0, 1: rscale})
    rnd = b.node("RandomValue", data_type="FLOAT", ins={"Min": lo, "Max": hi, "Seed": seed})
    s = b.node("Math", operation="MULTIPLY", ins={0: scale, 1: rnd})
    oi = b.node("ObjectInfo", transform_space="ORIGINAL", ins={"Object": inst, "As Instance": True})
    iop = b.node("InstanceOnPoints", ins={"Points": pts, "Instance": (oi, "Geometry"), "Rotation": rot, "Scale": s})
    real = b.node("RealizeInstances", ins={"Geometry": iop})
    arr = b.node("Switch", input_type="GEOMETRY", ins={"Switch": realize, "False": iop, "True": real})
    both = b.join([b.geo_in, arr])
    res = b.node("Switch", input_type="GEOMETRY", ins={"Switch": keep, "False": arr, "True": both})
    b.output_geometry(res)
    return b.done()
```

Measured on a Bezier circle of radius 2 (length 12.566) with spacing 0.44 and twist 90 degrees: 29
links; max radius error 0.004; instance X dot tangent 1.0; consecutive Z axes perpendicular (dot
0.0); Keep Curve adds the curves component; Realize gives 29 x 320 vertices.

## Procedure L: repeat-zone growth (test_02; Thommes BCON24 00:29:26 repeat = serial chain of the same operation)

Random faces (Random Value BOOLEAN, Probability) extrude individually along normalize(Normal +
Upward), the Top selection and a shrinking Step are carried as repeat items, tips are scaled by
Taper, then Subdivision Surface and smooth shading.

```python
def growth_tree(name="BX Growth"):
    """Repeat-zone growth: random faces extrude along (normal + upward bias) for N iterations,
    each step shorter (Taper) and each tip scaled down, then subdivided and smoothed.
    Face count grows linearly: faces = F0 + sides_per_face * selected * iterations."""
    b = Builder(name)
    iters = b.input("Iterations", "INT", 6, min=0, max=64)
    step0 = b.input("Step", "FLOAT", 0.25, min=0.0, subtype="DISTANCE")
    taper = b.input("Taper", "FLOAT", 0.8, min=0.05, max=1.0, subtype="FACTOR")
    prob = b.input("Probability", "FLOAT", 0.3, min=0.0, max=1.0, subtype="FACTOR")
    upward = b.input("Upward", "FLOAT", 0.5, description="bias of the growth direction toward +Z (object space)")
    seed = b.input("Seed", "INT", 0)
    level = b.input("Smooth Level", "INT", 1, min=0, max=3)

    start = b.node("RandomValue", data_type="BOOLEAN", ins={"Probability": prob, "Seed": seed})
    zi, zo = b.zone("REPEAT", items=[("BOOLEAN", "Tip"), ("FLOAT", "Step")], iterations=iters)
    b.set(zi, "Geometry", b.geo_in)
    b.set(zi, "Tip", start)
    b.set(zi, "Step", step0)
    bias = b.node("CombineXYZ", ins={"Z": upward})
    d = b.node("VectorMath", operation="NORMALIZE",
               ins={0: b.node("VectorMath", operation="ADD", ins={0: b.node("Normal"), 1: bias})})
    ex = b.node("ExtrudeMesh", mode="FACES", ins={"Mesh": (zi, "Geometry"), "Selection": (zi, "Tip"), "Offset": d,
                                                   "Offset Scale": (zi, "Step"), "Individual": True})
    sc = b.node("ScaleElements", domain="FACE", ins={"Geometry": ex, "Selection": (ex, "Top"), "Scale": taper})
    nxt = b.node("Math", operation="MULTIPLY", ins={0: (zi, "Step"), 1: taper})
    b.link(sc, (zo, "Geometry"))
    b.link((ex, "Top"), (zo, "Tip"))
    b.link(nxt, (zo, "Step"))
    sub = b.node("SubdivisionSurface", ins={"Mesh": (zo, "Geometry"), "Level": level})
    smooth = b.node("SetShadeSmooth", ins={"Geometry": sub})
    b.output_geometry(smooth)
    return b.done()
```

Measured on an icosphere (80 triangles): faces 80, 143, 206, 269, 332 for 0 to 4 iterations (21
selected triangles x 3 side quads per iteration); max radius 1.0, 1.279, 1.507, 1.692, 1.841 under
the geometric-series bound 1.886; 6 iterations at level 1: 1,752 faces, 0 non-manifold, 0 flipped
(`bx_audit.audit(obj, evaluated=True)`), 0.025 s. Visual note: neighboring faces extruded
individually start from a shared edge, so clusters form stars at the base; lower Probability if that
reads wrong.

## Procedure M: simulation zone, particle drop (test_03; Thommes BCON23 00:06:09 zone mechanics, BCON26 00:28:12 append order)

The state starts empty (nothing into the Simulation Input geometry); each step appends new points
AFTER the existing ones (`b.join([state, new])`) with a `pid`; semi-implicit Euler in world space
(Self Object matrices); ground contact with restitution and friction; position and velocity captured
together; icosphere instances outside the zone (instances carry `pid` and `velocity`).

```python
def particle_drop_tree(name="BX Particle Drop"):
    """Simulation zone: points emitted in a world-space box for N frames fall under world gravity,
    bounce on a world ground plane (restitution, friction) and settle. New points are appended
    at the END of the state (Join order), each with a stable 'pid'. Position and velocity are
    computed together in one Capture Attribute so neither reads the other's new value.
    Outputs the modified geometry plus icosphere instances (Material input)."""
    b = Builder(name)
    rate = b.input("Rate", "INT", 20, min=0, description="points emitted per frame")
    nframes = b.input("Emit Frames", "INT", 20, min=0)
    center = b.input("Emit Center", "VECTOR", (0.0, 0.0, 3.0), description="world space")
    size = b.input("Emit Size", "VECTOR", (2.0, 2.0, 0.5))
    grav = b.input("Gravity", "FLOAT", 9.81, panel="Physics")
    rest = b.input("Restitution", "FLOAT", 0.45, min=0.0, max=1.0, subtype="FACTOR", panel="Physics")
    fric = b.input("Friction", "FLOAT", 0.3, min=0.0, max=1.0, subtype="FACTOR", panel="Physics")
    ground = b.input("Ground Height", "FLOAT", 0.0, description="world Z", panel="Physics")
    rad = b.input("Radius", "FLOAT", 0.06, min=0.001, subtype="DISTANCE")
    seed = b.input("Seed", "INT", 0)
    mat = b.input("Material", "MATERIAL")

    info = b.node("ObjectInfo", transform_space="ORIGINAL", ins={"Object": b.node("SelfObject")})
    to_world = (info, "Transform")
    to_local = (b.node("InvertMatrix", ins={"Matrix": to_world}), "Matrix")
    zi, zo = b.zone("SIMULATION")        # nothing into zi Geometry: the state starts empty

    # emission, world-space box converted to object space
    frame = (b.node("SceneTime"), "Frame")
    emitting = b.node("Compare", data_type="FLOAT", operation="LESS_EQUAL", ins={"A": frame, "B": nframes})
    count = b.node("Switch", input_type="INT", ins={"Switch": emitting, "False": 0, "True": rate})
    fseed = b.node("Math", operation="MULTIPLY_ADD", ins={0: seed, 1: 7919.0, 2: frame})
    jitter = b.node("RandomValue", data_type="FLOAT_VECTOR",
                    ins={"Min": (-0.5, -0.5, -0.5), "Max": (0.5, 0.5, 0.5), "Seed": fseed})
    wpos = b.node("VectorMath", operation="MULTIPLY_ADD", ins={0: jitter, 1: size, 2: center})
    newp = b.node("Points", ins={"Count": count, "Position": b.node("TransformPoint", ins={"Vector": wpos,
                                                                                           "Transform": to_local}),
                                 "Radius": rad})
    born = b.node("Math", operation="SUBTRACT", ins={0: frame, 1: 1.0})
    pid = b.node("Math", operation="MULTIPLY_ADD", ins={0: born, 1: rate, 2: b.node("Index")})
    newp = b.node("StoreNamedAttribute", data_type="INT", domain="POINT",
                  ins={"Geometry": newp, "Name": "pid", "Value": pid})
    state = b.join([(zi, "Geometry"), newp])          # existing points first, new ones appended

    # integrate in world space (semi-implicit Euler), collide with the ground plane
    dt = (zi, "Delta Time")
    vel = b.node("NamedAttribute", data_type="FLOAT_VECTOR", ins={"Name": "velocity"})
    g = b.node("CombineXYZ", ins={"Z": b.node("Math", operation="MULTIPLY", ins={0: grav, 1: -1.0})})
    v1 = b.node("VectorMath", operation="MULTIPLY_ADD", ins={0: g, 1: dt, 2: (vel, "Attribute")})
    pw = b.node("TransformPoint", ins={"Vector": b.node("Position"), "Transform": to_world})
    p1 = b.node("VectorMath", operation="MULTIPLY_ADD", ins={0: v1, 1: dt, 2: pw})
    sp1 = b.node("SeparateXYZ", ins={"Vector": p1})
    floor = b.node("Math", operation="ADD", ins={0: ground, 1: rad})
    hit = b.node("Compare", data_type="FLOAT", operation="LESS_THAN", ins={"A": (sp1, "Z"), "B": floor})
    p_hit = b.node("CombineXYZ", ins={"X": (sp1, "X"), "Y": (sp1, "Y"), "Z": floor})
    p2 = b.node("Switch", input_type="VECTOR", ins={"Switch": hit, "False": p1, "True": p_hit})
    sv = b.node("SeparateXYZ", ins={"Vector": v1})
    keep = b.node("Math", operation="SUBTRACT", ins={0: 1.0, 1: fric})
    bounce = b.node("Math", operation="MULTIPLY", ins={0: (sv, "Z"), 1: b.node("Math", operation="MULTIPLY",
                                                                                ins={0: rest, 1: -1.0})})
    v_hit = b.node("CombineXYZ", ins={"X": b.node("Math", operation="MULTIPLY", ins={0: (sv, "X"), 1: keep}),
                                      "Y": b.node("Math", operation="MULTIPLY", ins={0: (sv, "Y"), 1: keep}),
                                      "Z": bounce})
    v2 = b.node("Switch", input_type="VECTOR", ins={"Switch": hit, "False": v1, "True": v_hit})
    cap = b.node("CaptureAttribute", domain="POINT")
    b.items(cap, "capture_items", [("VECTOR", "p"), ("VECTOR", "v")])
    b.set(cap, "Geometry", state)
    b.set(cap, "p", p2)
    b.set(cap, "v", v2)
    stv = b.node("StoreNamedAttribute", data_type="FLOAT_VECTOR", domain="POINT",
                 ins={"Geometry": (cap, "Geometry"), "Name": "velocity", "Value": (cap, "v")})
    setp = b.node("SetPosition", ins={"Geometry": stv, "Position": b.node("TransformPoint", ins={
        "Vector": (cap, "p"), "Transform": to_local})})
    b.link(setp, (zo, "Geometry"))

    ball = b.node("MeshIcoSphere", ins={"Radius": 1.0, "Subdivisions": 2})
    iop = b.node("InstanceOnPoints", ins={"Points": (zo, "Geometry"), "Instance": ball, "Scale": rad})
    shaded = b.node("SetMaterial", ins={"Geometry": iop, "Material": mat})
    b.output_geometry(b.join([b.geo_in, shaded]))
    return b.done()
```

Stepping facts measured in 5.2.1 (test_03):

- The first frame already runs the zone body: 12 points at frame 1 for Rate 12; count = Rate x
  min(frame, Emit Frames).
- Nothing below ground + radius at any frame (min 0.06 for radius 0.06); pid prefix identical frame
  to frame (append-only); mean speed 3.87 at frame 25, 0.19 at 60; all resting by frame 80.
- Stepping fills a memory cache: `frame_set(15)` after stepping to 80 replays frame 15 exactly.
- A jump past the cache computes ONE step: stepping to 10 then `frame_set(40)` gives the 120
  frame-10 points one step lower (mean z 2.65 to 2.55) instead of 240 mostly landed points.
- `bpy.ops.object.simulation_nodes_cache_calculate_to_frame(selected=True)` returns
  `{'PASS_THROUGH'}` headless and computes nothing (frame 45 afterwards = one step from frame 1).
  Use `G.step`.
- `G.bake(obj)` returns FINISHED (`md.bake_target == 'PACKED'`); afterwards a direct jump to frame
  50 equals the stepped frame 50.
- A host rotated 90 degrees about X still drops along world -Z and lands at world z = radius.
- Why one Capture Attribute: the same tree rewired naively (Store velocity, then Set Position
  reading it) reads the NEW velocity and double-counts gravity in flight: mean z 2.875 instead of
  2.923 at frame 5.

```python
md = G.attach(ground, G.particle_drop_tree(), inputs={"Rate": 12, "Emit Frames": 20, "Radius": 0.06,
              "Seed": 1, "Material": G.material("Ball", (0.9, 0.45, 0.1))})
res = G.step(range(1, 81), lambda f: len(G.instance_transforms(ground)))
G.bake(ground)
G.snapshot([ground], "/abs/out/particles.png", frames=[4, 12, 24, 60])
```

## Procedure N: 5.2 physics assets from the builder (test_04; Thommes BCON26)

Custom Force closure signature: inputs Geometry (GEOMETRY), To World Transform (MATRIX); outputs
Geometry, Selection (BOOLEAN), Force (VECTOR). Custom Effector Geometry Effector closure: inputs
Geometry, To World Transform; output Geometry. Stage menu items: Default, Pre-Simulation, Pre-Solve,
Post-Solve, Custom (read from the 5.2.1 assets).

```python
def cloth_tree(name, lift=None):
    b = G.Builder(name)
    colliders = b.input("Colliders", "COLLECTION")
    c = b.node("Group", node_tree=cloth_ng, ins={"Geometry": b.geo_in, "Effectors Collection": colliders,
                                                 "Pin Group": (b.node("NamedAttribute", ins={"Name": "Group"}),
                                                               "Attribute")})
    if lift is not None:
        # Custom Force in Closure mode: signature (Geometry, To World Transform) -> (Geometry, Selection, Force)
        f = b.node("Group", node_tree=force_ng, ins={"Mode": "Closure"})
        zi, zo = b.zone("CLOSURE", inputs=[("GEOMETRY", "Geometry"), ("MATRIX", "To World Transform")],
                        outputs=[("GEOMETRY", "Geometry"), ("BOOLEAN", "Selection"), ("VECTOR", "Force")])
        b.link((zi, "Geometry"), (zo, "Geometry"))
        b.set(zo, "Selection", True)
        b.set(zo, "Force", (0.0, 0.0, lift))
        b.link((zo, "Closure"), (f, "Closure"))
        bund = b.node("CombineBundle")
        b.items(bund, "bundle_items", [("BUNDLE", "Lift")])
        b.link((f, "Force"), (bund, "Lift"))
        b.link(bund, (c, "Effectors"))
    b.output_geometry((c, "Geometry"))
    return b.done()
```

```python
def ager(name, extra, stage, x):
    ob = cloth_obj(name, (x, 8, 2))
    b = G.Builder("W_" + name)
    c = b.node("Group", node_tree=cloth_ng, ins={"Geometry": b.geo_in, "Extra Sim Attributes": extra,
                                                 "Pin Group": (b.node("NamedAttribute", ins={"Name": "Group"}),
                                                               "Attribute")})
    e = b.node("Group", node_tree=eff_ng, ins={"Socket_1": stage})   # two inputs named Stage: menu Socket_1, string Socket_2
    zi, zo = b.zone("CLOSURE", inputs=[("GEOMETRY", "Geometry"), ("MATRIX", "To World Transform")],
                    outputs=[("GEOMETRY", "Geometry")])
    age = b.node("NamedAttribute", data_type="FLOAT", ins={"Name": "age"})
    st = b.node("StoreNamedAttribute", data_type="FLOAT", domain="POINT",
                ins={"Geometry": (zi, "Geometry"), "Name": "age",
                     "Value": b.node("Math", operation="ADD", ins={0: (age, "Attribute"), 1: 1.0})})
    b.link(st, (zo, "Geometry"))
    b.link((zo, "Closure"), (e, "Geometry Effector"))
    bund = b.node("CombineBundle")
    b.items(bund, "bundle_items", [("BUNDLE", "Ager")])
    b.link((e, "Effector"), (bund, "Ager"))
    b.link(bund, (c, "Effectors"))
    b.output_geometry((c, "Geometry"))
    return ob, G.attach(ob, b.done())
```

Measured (test_04): cloth over the sphere, 0 vertices inside after 30 frames, pinned row drift 0.5
mm; an upward 6.0 closure force leaves the cloth's lowest point at z 0.33 instead of -0.37. Extra
Sim Attributes, `age += 1` per step in a Custom Effector closure, 10 frames:

| Extra Sim Attributes | Stage          | age after frames 1..10                                     |
| -------------------- | -------------- | ---------------------------------------------------------- |
| ""                   | Post-Solve     | 1, 1, 1, ... (resets every step, no warning)               |
| "age"                | Post-Solve     | 1, 2, ..., 10                                              |
| "age"                | Pre-Solve      | 1, 2, ..., 10 (once per frame with the default 5 substeps) |
| "age"                | Pre-Simulation | 1, 1, 1, ... (runs on the first frame only)                |

Not re-tested here: sewing by editing the local Edge Length Constraint (Custom Length on Is Edge
Loose, 1 s ramp), tearing thresholds, Hair Dynamics on curves spawned mid-simulation. The ordering
rule they need is the one Procedure M verifies with `pid`.

## Procedure O: robustness probes (any tree)

```python
# world-space probe: flip or rotate the host, effects that mean "up" or "down" must follow the world
obj.rotation_euler = (math.pi, 0, 0); bpy.context.view_layer.update(); obj.update_tag()
flipped = len(G.instance_transforms(obj))          # scatter: 0 when the slope test is in world space
# resolution probe: trait selections scale with resolution, index selections jump
G.set_inputs(md, {"Resolution": 2 * base_res})
# timing: loops and simulations in hot paths
print(G.time_eval(obj))
```

## Node identifiers (verified to instantiate in 5.2.1)

`bx_gn.NODE_IDS` lists the aliases; bare names resolve by prefix (`SetPosition` ->
`GeometryNodeSetPosition`). Irregular ones worth remembering: Math `ShaderNodeMath`, Vector Math
`ShaderNodeVectorMath`, Map Range `ShaderNodeMapRange`, Mix `ShaderNodeMix`, Combine/Separate XYZ
`ShaderNodeCombineXYZ` / `ShaderNodeSeparateXYZ`, Value `ShaderNodeValue`, Noise
`ShaderNodeTexNoise`, Compare `FunctionNodeCompare`, Random Value `FunctionNodeRandomValue`, Integer
Math `FunctionNodeIntegerMath`, Align Rotation to Vector `FunctionNodeAlignRotationToVector`, Rotate
Rotation `FunctionNodeRotateRotation`, Multiply Matrices `FunctionNodeMatrixMultiply`, Evaluate on
Domain `GeometryNodeFieldOnDomain`, Evaluate at Index `GeometryNodeFieldAtIndex`, Transform Geometry
`GeometryNodeTransform`, Curve Tangent `GeometryNodeInputTangent`, Bounding Box
`GeometryNodeBoundBox`, Geometry Proximity `GeometryNodeProximity`, Get List Item
`GeometryNodeListGetItem`, zones `GeometryNodeSimulationInput/Output`,
`GeometryNodeRepeatInput/Output`, `GeometryNodeForeachGeometryElementInput/Output`,
`NodeClosureInput/Output`, `NodeEvaluateClosure`, `NodeCombineBundle`, `NodeSeparateBundle`, physics
`GeometryNodeXPBDSolver`, gizmos `GeometryNodeGizmoLinear/Dial/Transform`.
