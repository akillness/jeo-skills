# Procedures: Grease Pencil v3 in Blender 5.2 (tested)

Every block below ran on Blender 5.2.1 LTS (`blender --background --factory-startup`) unless marked
GUI only. Raw-bpy blocks P1 to P8 are copied verbatim from
`tests/code/blender-grease-pencil/test_procedures.py` (between `# >>> Pn` and `# <<< Pn`), which
asserts their results. bx_gp recipes are exercised by `test_bx_gp_2d.py`, `test_bx_gp_25d.py` and,
in a live session, `test_gui_draw.py`. Outputs of the last runs:
`archive/tests/grease_pencil_skill/`.

Conventions: drawing plane XZ, camera at -Y looking +Y, meters, `radius` = half line width, material
colors scene-linear (bx_gp accepts sRGB hex).

## P1. Data model from scratch: object, layers, materials, strokes, fill with a hole

Verified on 5.2.1: `test_procedures.py` P1 (and pixel-checked in P2: hole shows the background, ring
shows linear 0.6 as sRGB 0.80).

```python
import bpy, math

sc = bpy.context.scene
gp = bpy.data.grease_pencils.new("Doodle")            # data: bpy.types.GreasePencil (v3)
ob = bpy.data.objects.new("Doodle", gp)               # ob.type == 'GREASEPENCIL'
sc.collection.objects.link(ob)

def gp_material(name, stroke=(0, 0, 0, 1), fill=(1, 1, 1, 1)):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if not m.is_grease_pencil:
        bpy.data.materials.create_gpencil_data(m)      # turns it into a GP material
    m.grease_pencil.color = stroke                     # scene-linear RGBA
    m.grease_pencil.fill_color = fill
    return m

gp.materials.append(gp_material("Ink"))                               # slot 0
gp.materials.append(gp_material("Skin", fill=(1.0, 0.6, 0.5, 1)))     # slot 1

fills = gp.layers.new("Fills")                        # first created = bottom of the stack
lines = gp.layers.new("Lines")
for L in gp.layers:
    L.use_lights = False                              # default True: flat colors render dark

ring = lambda r, n=48: [(r * math.cos(2 * math.pi * i / n), 0.0,
                         r * math.sin(2 * math.pi * i / n)) for i in range(n)]

d = fills.frames.new(1).drawing                       # frame -> drawing (curves + attributes)
d.add_strokes([48, 48])                               # two curves in one call
for s, r in zip(d.strokes, (1.0, 0.4)):
    for p, co in zip(s.points, ring(r)):
        p.position = co
    s.cyclic = True
    s.material_index = 1
    s.fill_id = 1          # != 0 fills; equal ids fill together (even-odd): the 0.4 ring is a hole
    s.hide_stroke = True   # fill only, the outline lives on the Lines layer

d = lines.frames.new(1).drawing
d.add_strokes([48])
s = d.strokes[0]           # helper objects: re-fetch after any add/remove, never cache
for p, co in zip(s.points, ring(1.0)):
    p.position = co
    p.radius = 0.03        # HALF the line width, meters
    p.opacity = 1.0
s.cyclic = True
d.tag_positions_changed()
```

Notes: attributes appear lazily (`position`, `curve_type` at creation; `radius`, `opacity`,
`cyclic`, `fill_id` when first written). Never call `drawing.attributes.new("radius", ...)` on a
drawing that already has strokes without filling the old points: they get radius 0 and vanish (use
`bx_gp.add_strokes`, which fills defaults first). Default radius while the attribute is absent:
0.01.

## P2. Stage, lighting and render settings

Verified on 5.2.1: `test_procedures.py` P2 (pixel samples asserted).

```python
cd = bpy.data.cameras.new("Cam")
cd.type = 'ORTHO'
cd.ortho_scale = 4.0                                  # frame width in meters (larger image side)
cam = bpy.data.objects.new("Cam", cd)
sc.collection.objects.link(cam)
cam.location = (0, -10, 0)
cam.rotation_euler = (math.radians(90), 0, 0)         # looks +Y at the XZ drawing plane
sc.camera = cam
sc.render.engine = 'BLENDER_EEVEE'                    # GP renders in EEVEE, Cycles and Workbench
sc.view_settings.view_transform = 'Standard'          # AgX shifts palette colors
sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
sc.world.color = (0.05, 0.05, 0.05)                   # ambient for LIT GP layers (not the node tree)
sc.render.resolution_x = sc.render.resolution_y = 400
sc.render.film_transparent = False                    # True: alpha background for compositing
sc.grease_pencil_settings.aa_samples = 8              # GP anti-aliasing (default 8)
sc.render.filepath = "//doodle.png"
```

Lighting facts [verified]: with `use_lights=True`, a layer is lit by lamps plus an ambient equal to
`World.color` (the world's viewport color), not the Background node; the default 0.05 renders a flat
palette at about 25 % value. A sun on a flat drawing only scales value; a point light gives a
gradient. EEVEE, Cycles and Workbench render unlit GP with identical colors.

## P3. Timing: blank, additive, instanced and empty keys, native interpolation

Verified on 5.2.1: `test_procedures.py` P3 (keys `[1, 3, 5, 7, 9, 17, 21]`, 3 to 7 BREAKDOWN, frame
17 shares frame 1's drawing, 21 empty).

```python
L = gp.layers["Lines"]
f1 = L.frames[0].frame_number                         # 1
L.frames.copy(f1, 9)                                  # additive start: an independent copy
d9 = L.get_frame_at(9).drawing
for p in d9.strokes[0].points:                        # 'sculpt' the copy: same strokes and points
    x, y, z = p.position
    p.position = (x * 1.3, y, z * 0.8)
d9.tag_positions_changed()
L.frames.copy(f1, 17, instance_drawing=True)          # hold / cycle: shares frame 1's drawing
L.frames.new(21)                                      # empty key: the layer shows nothing from 21
bpy.context.view_layer.objects.active = ob
gp.layers.active = L
sc.frame_set(1)
bpy.ops.grease_pencil.interpolate_sequence(           # runs headless, only the segment 1 -> 9
    step=2, layers='ACTIVE', type='SINE', easing='EASE_IN_OUT', exclude_breakdowns=True)
keys = [(f.frame_number, f.keyframe_type, len(f.drawing.strokes), f.drawing.user_count)
        for f in sorted(L.frames, key=lambda f: f.frame_number)]
```

Notes: `interpolate_sequence` fills only the segment around the current frame (verified with keys 1,
9, 17: from frame 1 only 3, 5, 7 were made). `frames.new` or `frames.copy` onto an existing frame
raises. `layer.get_frame_at(n)` is the key exposed at n. Removing the source of an instance keeps
the drawing alive in the instance.

## P4. Masked Multiply shadow layer (Grant Abbitt) and layer groups

Verified on 5.2.1: `test_procedures.py` P4; the mask clipping was checked by render in
`test_bx_gp_2d.py` (`frame_01.png`: the shadow ellipse drawn past the body is clipped to it).

```python
shadow = gp.layers.new("Shadow")                      # new layers go on top ...
gp.layers.move(shadow, 'DOWN')                        # ... so move it between Fills and Lines
shadow.use_lights = False
shadow.blend_mode = 'MULTIPLY'                        # REGULAR HARDLIGHT ADD SUBTRACT MULTIPLY DIVIDE
shadow.opacity = 0.5
shadow.use_masks = True
shadow.mask_layers.add(gp.layers["Fills"])            # 5.2 API: only visible where Fills has paint
grp = gp.layer_groups.new("Body")                     # groups: hide / lock / organize parts
for name in ("Fills", "Shadow", "Lines"):
    gp.layers.move_to_layer_group(gp.layers[name], grp)
stack = [l.name for l in gp.layers]                   # bottom -> top
```

## P5. Modifiers are regular object modifiers

Verified on 5.2.1: `test_procedures.py` P5. Other types: `GREASE_PENCIL_` +
`COLOR TINT OPACITY TIME TEXTURE ARRAY LENGTH MIRROR MULTIPLY SIMPLIFY SUBDIV ENVELOPE OUTLINE HOOK OFFSET SMOOTH LATTICE DASH ARMATURE SHRINKWRAP VERTEX_WEIGHT_PROXIMITY VERTEX_WEIGHT_ANGLE`,
plus `LINEART` [enum verified].

```python
noise = ob.modifiers.new("Wobble", 'GREASE_PENCIL_NOISE')
thick = ob.modifiers.new("Weight", 'GREASE_PENCIL_THICKNESS')
thick.thickness_factor = 1.5
build = ob.modifiers.new("Reveal", 'GREASE_PENCIL_BUILD')   # write-on over time
mods = [(m.name, m.type) for m in ob.modifiers]
for m in list(ob.modifiers):
    ob.modifiers.remove(m)
```

## P6. Line Art object from the add operator, baked to strokes

Verified on 5.2.1: `test_procedures.py` P6.

```python
bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0)
src = bpy.context.active_object                       # active object = Line Art source
bpy.ops.object.grease_pencil_add(type='LINEART_OBJECT')
la_ob = bpy.context.active_object
la = next(m for m in la_ob.modifiers if m.type == 'LINEART')
la.radius = 0.01                                      # = line WIDTH in meters (points get radius/2)
sc.frame_start = sc.frame_end = 1                     # bake covers the whole scene range
bpy.ops.object.lineart_bake_strokes()                 # modifier output -> editable keyframes
baked = {l.name: [f.frame_number for f in l.frames] for l in la_ob.data.layers}
```

Notes [verified]: the generated points get radius = modifier radius / 2, so the modifier radius is
the line width (to match a drawn stroke of radius r use 2r). Objects hidden from render are ignored.
Layers made by this operator are lit (`use_lights=True`): set False for colored flat lines. The bake
covers the whole scene frame range. After baking, the modifier is still listed.

## P7. Procedural strokes with a fill from Geometry Nodes, baked to editable layers (Weigl's bridge)

Verified on 5.2.1: `test_procedures.py` P7 (one layer `Layer`, `fill_id` 1, radius 0.03 carried
over); render of the same graph in `archive/tests/grease_pencil/probe4c_render.png` (distiller).

```python
gp = bpy.data.grease_pencils.new("Proc")
ob = bpy.data.objects.new("Proc", gp)
sc.collection.objects.link(ob)
mat = bpy.data.materials.new("ProcFill")
bpy.data.materials.create_gpencil_data(mat)
mat.grease_pencil.fill_color = (1.0, 0.8, 0.05, 1)
gp.materials.append(mat)
ng = bpy.data.node_groups.new("CurvesToGP", 'GeometryNodeTree')
ng.interface.new_socket("Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
ng.interface.new_socket("Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
N, Lk = ng.nodes, ng.links
gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
circ = N.new('GeometryNodeCurvePrimitiveCircle')
circ.inputs['Radius'].default_value = 1.5
rad = N.new('GeometryNodeSetCurveRadius')
rad.inputs['Radius'].default_value = 0.03                     # carried over as point radius
xf = N.new('GeometryNodeTransform')
xf.inputs['Rotation'].default_value = (math.radians(90), 0, 0)  # XY curve -> XZ drawing plane
c2g = N.new('GeometryNodeCurvesToGreasePencil')
c2g.inputs['Instances as Layers'].default_value = False       # True (default) drops plain curves
setm = N.new('GeometryNodeSetMaterial')
setm.inputs['Material'].default_value = mat
fid = N.new('GeometryNodeStoreNamedAttribute')
fid.data_type, fid.domain = 'INT', 'CURVE'
fid.inputs['Name'].default_value = 'fill_id'                  # 5.1+: material alone no longer fills
fid.inputs['Value'].default_value = 1
Lk.new(circ.outputs['Curve'], rad.inputs['Curve'])
Lk.new(rad.outputs['Curve'], xf.inputs['Geometry'])
Lk.new(xf.outputs['Geometry'], c2g.inputs['Curves'])
Lk.new(c2g.outputs[0], setm.inputs['Geometry'])
Lk.new(setm.outputs['Geometry'], fid.inputs['Geometry'])
Lk.new(fid.outputs['Geometry'], go.inputs[0])
ob.modifiers.new("GN", 'NODES').node_group = ng
bpy.context.view_layer.objects.active = ob
bpy.ops.object.modifier_apply(modifier="GN")          # bake to editable layers (named 'Layer')
for L in gp.layers:
    L.use_lights = False
```

Other GP nodes [verified ids]: `GeometryNodeGreasePencilToCurves` (Layers as Instances),
`GeometryNodeMergeLayers`, `GeometryNodeSetGreasePencilColor` (mode STROKE or FILL),
`GeometryNodeSetGreasePencilDepth`, `GeometryNodeSetGreasePencilSoftness`.

## P8. Layer parented to an object, layer transforms

Verified on 5.2.1: `test_procedures.py` P8 (properties set and read back; the evaluated effect on
points was not asserted).

```python
hand = bpy.data.objects.new("HandCtrl", None)         # an empty, a bone owner, any object
sc.collection.objects.link(hand)
lay = gp.layers[0]
lay.parent = hand                                     # the layer follows the empty
# lay.parent = armature_ob; lay.parent_bone = "hand.R"   # or a bone
hand.location = (1.0, 0, 0)
bpy.context.view_layer.update()
lay.translation = (0.0, 0.0, 0.5)                     # layers also carry their own transform
```

Use: several parts inside ONE GP object that must still move separately (they can then mask each
other, which separate objects cannot). Tom Viguier's cutout uses separate objects instead because
depth order must animate.

---

## bx_gp recipes

R1 runs as is: `test_procedures.py` extracts it from this file and executes it. R2 to R7 are
excerpts of the named test scripts, where the full context (objects they act on) lives.

### R1. Part-based cutout character (Tom Viguier's architecture)

Verified on 5.2.1: this block is executed by `test_procedures.py` (R1); the full character with
face, blink, mouth, donut and animation is `test_bx_gp_2d.py` (renders `2d/frame_01.png`,
`2d/strip_1_to_23.png`).

```python
import math, sys
sys.path.append("<skill>/scripts")                            # scenario-blender-grease-pencil/scripts
import bx_gp as G
cam = G.scene_2d(res=(1080, 1080), fps=12, frame_range=(1, 24), ortho_scale=6.0)
body = G.new_object("Body", layers=("Fills", "Shadow", "Lines"))       # bottom -> top, unlit
ink, mint = G.material(body, "Ink", stroke="#1d1b24"), G.material(body, "Mint", fill="#8fd3c8")
shade = G.material(body, "Shade", fill="#4a5a9c")
outline = G.smooth_path(G.xz([(0, 1.15), (0.85, 0.9), (1.2, 0), (1.1, -1), (0, -1.5),
                              (-1.1, -1), (-1.2, 0), (-0.85, 0.9)]), samples=10, closed=True)
G.add_shape(G.key(body, "Fills", 1), outline, material=mint)
G.add_shape(G.key(body, "Shadow", 1), G.ellipse(1.3, 1.9, center=(1.05, 0, -0.55), rot=0.25), material=shade)
sh = body.data.layers["Shadow"]
sh.blend_mode, sh.opacity, sh.use_masks = "MULTIPLY", 0.45, True
sh.mask_layers.add(body.data.layers["Fills"])                # drawn past the edge, clipped by the fill
G.add_stroke(G.key(body, "Lines", 1), outline, radius=0.028, material=ink, cyclic=True)

arm = G.new_object("ArmR", layers=("Fills", "Lines"), location=(1.05, -0.1, -0.15))  # origin = shoulder
arm.parent = body                                            # y=-0.1: in front of the body
feet = G.new_object("Feet", layers=("Fills", "Lines"), location=(-0.35, 0.05, -1.5)) # y=+0.05: behind
feet.parent = body
for part in (arm, feet):                                     # each part draws in its own object
    G.material(part, "Ink"); G.material(part, "Mint")
    G.add_shape(G.key(part, "Fills", 1), G.ellipse(0.35, 0.15, center=(0.35, 0, 0)), material=1)
    G.add_stroke(G.key(part, "Lines", 1), G.ellipse(0.35, 0.15, center=(0.35, 0, 0)), radius=0.022, cyclic=True)
# cutout motion = FK on object transforms, drawings stay editable
for f, deg in ((1, 0), (9, -38), (24, 0)):
    arm.rotation_euler = (0, math.radians(deg), 0); arm.keyframe_insert("rotation_euler", frame=f)
print(G.draw_order([body, arm, feet]))                       # front -> back
```

Front/behind changes: key the object's location along the camera axis, or `G.push_depth(ob, delta)`
which also compensates scale under a perspective camera (verified: silhouette unchanged, order
flipped, `test_bx_gp_25d.py`).

### R2. Frame-by-frame with holds, instances, cycles and a blink

Verified on 5.2.1: `test_bx_gp_2d.py` (blink on Face/Fills at 15, open again at 17 as an instance;
FX cycle).

```python
d_open = G.key(face, "Fills", 1)            # draw open eyes
d_shut = G.key(face, "Fills", 15)           # replacement drawing: closed eyes
G.key(face, "Fills", 17, mode="instance", source=1)       # open again, same drawing
G.cycle(fx, "FX", keys=[1, 3, 5], start=1, end=17, step=2)   # loop on twos as instances
G.end_exposure(fx, "FX", 19)                # blank key ends the effect (not an off-canvas dot)
print(G.exposures(face, "Fills"))           # [(frame, type, n_strokes, user_count)]
```

### R3. In-betweens with Tom's rule and the animator's spacing

Verified on 5.2.1: `test_bx_gp_2d.py` (native 1 -> 9 on twos; eased 9 -> 17 gives t = 0.156, 0.5,
0.844; the 17 -> 21 pair is refused, then clipped).

```python
print(G.match(dA, dB))                                       # copy / sculpted / different + reason
G.interpolate(face, "Mouth", 1, step=2)                      # native, BREAKDOWN keys 3, 5, 7
G.inbetween(face, "Mouth", 9, 17, frames=(11, 13, 15), ease="EASE_IN_OUT")
G.inbetween(face, "Mouth", 9, 17, frames=(11, 13, 15), spacing=[0.1, 0.35, 0.8])   # charted spacing
G.inbetween(face, "Mouth", 17, 21, frames=(19,), clip=True)  # different drawings: nearest key instead
```

To make two drawings interpolable, draw both from the same control structure and
`G.resample(points, n)` each stroke to the same count, in the same stroke order and materials.

### R4. Headless sculpt and eraser substitutes

Verified on 5.2.1: `test_bx_gp_25d.py` (smooth cut roughness 0.072 to 0.001;
`set_uniform_thickness(thickness=0.03)` gave radius 0.015; grab moved 23 points; dissolve 61 -> 58
points, still one stroke).

```python
G.edit_op(ob, "stroke_smooth", iterations=10, factor=1.0)
G.edit_op(ob, "set_uniform_thickness", thickness=0.03)       # thickness = width: radius 0.015
G.grab(d, center=(0, 0, 0), radius=0.4, offset=(0, 0, 0.3))  # sculpt Grab with falloff
G.dissolve(d, stroke_index=0, point_indices=[20, 21, 22])    # keeps the stroke continuous
```

### R5. Live session only: trim, box erase, reproject

GUI only, not run headless. Verified in a live 5.2.1 GUI by `test_gui_draw.py`: Trim cut the
overshoot at the crossing (bbox x max 1.0 -> 0.6), box erase removed 7 points, reproject SURFACE put
a circle on a sphere (y -0.79 to -0.80, expected -0.80).

```python
G.gui_trim(ob, lasso=[(0.7, 0, 3.15), (1.15, 0, 3.15), (1.15, 0, 2.85), (0.7, 0, 2.85)])
G.gui_erase_box(ob, (0.5, 0, 2.0), (0.7, 0, 2.3))
G.gui_reproject(ob, "SURFACE", frame_points=[(-1.2, 0, -4.2), (1.2, 0, -1.8)])
```

Not possible (verified GUI): `grease_pencil.brush_stroke` / `sculpt_paint` with a stroke list log
"Invalid operator call" (no exec) and draw nothing; replayed mouse events through
`Window.event_simulate` (Blender launched with `--enable-event-simulate`) drew nothing either,
batched or one event per 30 ms.

### R6. 2.5D: Line Art in pixels, strokes on a mesh, relight, depth

Verified on 5.2.1: `test_bx_gp_25d.py` (render `25d/sheet_25d.png`; 134 of 260 hatch strokes kept,
703 missed points and 28 occluder-captured points rejected; projected points 1.099 to 1.109 from the
center of a 1.1 sphere).

```python
px = G.px_size()
la = G.lineart(blob, radius=5 * px)                          # 5 px wide outline
hits, missed, captured = G.project_to_surface(flat_pts, canvas, offset=0.01)
if not missed and not captured:                              # Pablo: oblivion and occluder capture
    G.add_stroke(d, hits, radius=0.012, pressure=G.taper(len(hits)))
G.relight(hatch, canvas, light_dir=(-0.6, -0.5, 0.6), shadow="#27305e", light="#ffd166")
G.push_depth(disc, 1.0, persp_cam)                           # further back, same image
```

### R7. Review renders

Verified on 5.2.1: `test_bx_gp_2d.py` (`2d/strip_1_to_23.png`, `2d/onion_f5.png`,
`2d/lighting_sheet.png`).

```python
G.render_frame("/abs/f001.png", 1)                           # full res: line quality, gaps, palette
G.render_strip("/abs/strip.png", range(1, 24, 2), cols=4, res_pct=30)   # timing, pops
G.onion("/abs/onion.png", 5, before=(1, 3), after=(7, 9))   # arcs and spacing, with object motion
print(G.verdict(G.report(ob)))
```
