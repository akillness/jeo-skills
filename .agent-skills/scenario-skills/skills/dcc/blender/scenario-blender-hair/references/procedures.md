# Tested procedures (Blender 5.2.1 LTS)

Every procedure below was run on Blender 5.2.1 LTS (build 2026-08-25) with
`blender --background --factory-startup --python-exit-code 1 --python <test>` unless it says GUI.
Tests live in `tests/code/blender-hair/` (`run_all.sh` runs all of them). The helpers come from
`<skills>/scenario-blender-hair/scripts/bx_hair.py`. Each procedure shows the helper call, then the
raw bpy it wraps, so you can work without the module.

```python
import sys
sys.path.append("<project>/skills/scenario-blender-hair/scripts")
sys.path.append("<project>/skills/scenario-blender-expert/scripts")   # review() reuses bx_review
import bx_hair as H
```

Units are meters. Density counts curves per square meter of the surface mesh in its local space:
object scale is ignored (verified), so apply scale first.

---

## P1. Surface prep and UV check

Verified on 5.2.1 by `test_01_groom_headless.py`: a default sphere has 0 overlapping faces, and a
stacked grid shows 32 of 32.

```python
rep = H.uv_report(surface)      # {'uv_maps', 'active', 'uv_outside_0_1', 'overlap_faces', 'faces'}
assert rep["overlap_faces"] == 0
```

Raw equivalent. It needs Object Mode and the surface active. UV sync select must be off, or
`uv.select_overlap` selects nothing readable:

```python
import bmesh
ts = bpy.context.scene.tool_settings; sync = ts.use_uv_select_sync; ts.use_uv_select_sync = False
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.select_all(action="DESELECT")
bpy.ops.uv.select_overlap()
bm = bmesh.from_edit_mesh(surface.data)
overlap = sum(1 for f in bm.faces if all(l.uv_select_vert for l in f.loops))   # 5.x: BMLoop.uv_select_vert
bpy.ops.object.mode_set(mode="OBJECT"); ts.use_uv_select_sync = sync
```

- `uv_outside_0_1 > 0` is fine for UDIMs. Stacking is not (Schmidbauer).
- Mirrored UV layouts: merge the center seam (UV editor, Merge by Distance) before grooming.
- For a human hairstyle, grow on a separate hair cap split along the part (see P7). For animals,
  separate the mouth interior from the fur surface (Edit Mode, Separate, Selection).

## P2. Groom object, even roots, guides as data, attachment

Verified on 5.2.1 by `test_01_groom_headless.py`. It passes 25 checks: Poisson spacing is respected
(min nearest neighbor 0.01003 m at spacing 0.01), all roots fall inside the mask,
`surface_uv_coordinate` is written, roots sit on the surface with max distance 0.0, and flow_blend
0.5 gives guides at 45° to the normal.

```python
hair = H.new_groom(surface, "Hair")        # Empty Hair: parent, surface, UV map, Hair Dynamics
P, N = H.sample_roots(surface, spacing=0.01, mask="density_fur", threshold=0.5, seed=1)
H.add_guides(hair, P, N, length=0.03, points=2, flow=(0, 0, -1), flow_blend=0.5)
# flow may be callable(P, N) -> (n, 3), for example "away from the part": see P7
```

The raw equivalent (what `new_groom` and `add_guides` do):

```python
for o in bpy.context.selected_objects: o.select_set(False)
surface.select_set(True); bpy.context.view_layer.objects.active = surface
bpy.ops.object.curves_empty_hair_add()           # poll fails without an active mesh
hair = bpy.context.active_object                 # parented, surface + surface_uv_map set,
                                                 # pinned 'Hair Dynamics' (Mode 'Animation')
cv = hair.data
old = len(cv.points)
cv.add_curves([2] * n)                           # n new curves of 2 points
buf = np.empty(len(cv.points) * 3, np.float32)
cv.attributes["position"].data.foreach_get("vector", buf)
buf[old * 3:] = local_positions.ravel()          # hair.matrix_world.inverted() @ world
cv.attributes["position"].data.foreach_set("vector", buf)
with bpy.context.temp_override(object=hair, active_object=hair, selected_objects=[hair],
                               selected_editable_objects=[hair]):
    bpy.ops.curves.snap_curves_to_surface(attach_mode="NEAREST")   # writes surface_uv_coordinate
```

- `hair.matrix_world` equals the surface's matrix after Empty Hair, so hair-local space is
  surface-local space.
- Hair Dynamics' Mode menu accepts `'Animation'` or `'Physics (Experimental)'`, nothing else.
- Edited the surface mesh in Edit Mode after grooming? The roots float (238 of 238 in the test).
  `H.snap_to_surface(hair, "DEFORM")` puts them back (0 off-surface afterwards). Use NEAREST after
  topology changes (Schmidbauer: works about 99% of the time).

## P3. Guide resolution and shaping

Verified on 5.2.1 by `test_01_groom_headless.py`: subdivide takes 2 points to 3, resample gives 15
with the attachment kept, and the helper modifier is applied and removed. Shrinkwrap is verified by
`test_04_cards.py`.

```python
H.subdivide_guides(hair, cuts=1)          # Edit Mode curves.subdivide, works headless (EDIT_CURVES)
H.resample_guides(hair, 15)               # Bystedt: 15 points for long human hair, applied
H.add_guides(hair, P, N, length=0.12, points=8, flow=f, flow_blend=0.8, droop=0.3)  # gravity sag
sw = H.add_asset(hair, "Shrinkwrap Hair Curves")                # Bystedt's non-destructive intersection fix
H.set_inputs(sw, {"Surface": head, "Offset Distance": 0.004, "Above Surface": 0.0})
```

Raw resample (what `resample_guides` builds): a GN group with Resample Curve (Count), added as a
NODES modifier, moved to index 0 and applied:

```python
md = hair.modifiers.new("BX Resample", "NODES"); md.node_group = ng   # Group In -> Resample Curve -> Group Out
md.properties.inputs.Socket_1.value = 15                                 # Count (identifier verified in test_09)
with bpy.context.temp_override(object=hair, active_object=hair):
    bpy.ops.object.modifier_move_to_index(modifier=md.name, index=0)
    bpy.ops.object.modifier_apply(modifier=md.name)
```

Brush substitutes, none of them strokes:

- Comb: a direction field in `add_guides`.
- Puff: `flow_blend` toward 0.
- Grow/Shrink: Trim Hair Curves with a mask, or per-curve `length`.
- Density brush: re-sample roots in the gap region and add guides there.
- Delete: rebuild the curves without the bad indices (Schmidbauer: "delete it and add a new one").

## P4. Asset modifiers and inputs

Verified on 5.2.1 by `test_01_groom_headless.py` and `test_02_asset_stack.py`. All 21 listed
modifier assets add. The Displace object 'Surface' resolves, unknown names raise with the list of
inputs, and evaluation is stale without update_tag (2,510 before the tag, 4,996 after).

```python
md = H.add_asset(hair, "Interpolate Hair Curves")          # lands above the pinned Hair Dynamics
H.set_inputs(md, {"Density": 20000.0, "Density Mask": "attr:density_fur", "Viewport Amount": 0.1})
print(H.get_inputs(md)); print(H.count(hair))             # count(full=True): Viewport Amount forced to 1
```

Raw equivalent:

```python
with bpy.context.temp_override(object=hair, active_object=hair, selected_objects=[hair]):
    bpy.ops.object.modifier_add_node_group(asset_library_type="ESSENTIALS", asset_library_identifier="",
        relative_asset_identifier="nodes/procedural_hair_node_assets.blend/NodeTree/Interpolate Hair Curves")
md = hair.modifiers.active                                # 2nd copy is named 'Interpolate Hair Curves.001'
md.properties.inputs.Input_15.value = 20000.0             # md["Input_15"] = v raises TypeError in 5.2
md.properties.inputs.Input_14.type = "ATTRIBUTE"; md.properties.inputs.Input_14.attribute_name = "density_fur"
hair.update_tag()                                         # REQUIRED before reading the evaluated result
ev = hair.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
print(len(ev.curves), len(ev.points))
```

- Hair Dynamics comes from `nodes/geometry_nodes_dynamics_assets.blend`. Duplicated modifiers share
  one node group.
- Evaluation in `--background` applies Viewport Amount. In the test, 10% gave 249 curves against
  2,502 at full density.
- Reorder with `bpy.ops.object.modifier_move_to_index(modifier=..., index=...)` under the same
  temp_override.
- Quick Fur (`bpy.ops.object.quick_fur(density='MEDIUM', length=0.1, radius=0.001)`) builds Set Hair
  Curve Profile, Interpolate (Follow Surface Normal on), Noise, Frizz and Hair Dynamics, with 12
  points per guide. Its density scales with object size: 80,220/m² on a 10 cm sphere.

Input identifiers, all verified in 5.2.1 (use them when you do not use `H.set_inputs` names):

| Asset                   | Key inputs (identifier = default)                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interpolate Hair Curves | Resting Surface `Input_12`=True, Follow Surface Normal `Input_24`=False, Part by Mesh Islands `Input_26`=True, Interpolation Guides `Input_10`=4, Distance to Guides `Input_28`=0, Distribution Method `Socket_2`=Random, Density `Input_15`=10, Density Mask `Input_14`=1, Mask Texture `Input_19`, Viewport Amount `Input_17`=1, Seed `Input_16` |
| Set Hair Curve Profile  | Replace Radius `Input_6`=True, Radius `Input_3`=0.01, Shape `Input_2`=0.5, Factor Min `Input_4`=0, Factor Max `Input_5`=1                                                                                                                                                                                                                          |
| Clump Hair Curves       | Factor `Input_7`=1, Shape `Input_6`=0.5, Tip Spread `Input_10`=0, Clump Offset `Input_13`=0, Distance Falloff `Input_12`, Distance Threshold `Input_11`, Seed `Input_14`, Preserve Length `Input_15`, Guide Index `Input_16`, Guide Distance `Input_9`=0.1, Guide Mask `Input_19`=1, Existing Guide Map `Input_8`=True                             |
| Curl Hair Curves        | Factor `Input_2`, Subdivision `Input_5`=1, Curl Start `Input_6`=0.1, Radius `Input_7`=0.1, Factor Start `Input_9`=1, Factor End `Input_10`=1, Frequency `Input_11`=1, Random Offset `Input_16`=0.25, Seed `Input_15`, Guide Distance `Input_4`=0.1, Guide Mask `Input_18`=1, Existing Guide Map `Input_3`=True                                     |
| Hair Curves Noise       | Cumulative Offset `Input_10`=True, Factor `Input_3`, Distance `Input_14`=0.01, Shape `Input_2`=0.5, Scale `Input_11`=1, Scale along Curve `Input_12`=1, Offset per Curve `Input_13`=0, Seed `Input_8`, Preserve Length `Input_6`                                                                                                                   |
| Frizz Hair Curves       | Cumulative Offset `Input_10`=True, Factor `Input_3`, Distance `Input_11`=0.01, Shape `Input_2`=0.5, Seed `Input_8`, Preserve Length `Input_6`                                                                                                                                                                                                      |
| Trim Hair Curves        | Scale Uniform `Input_9`=False, Length Factor `Input_5`=1, Replace Length `Input_6`=True, Length `Input_2`=1.0, Mask `Input_7`=1, Random Offset `Input_4`=0, Pin at Parameter `Input_3`, Seed `Input_8`                                                                                                                                             |
| Rotate Hair Curves      | Factor `Input_5`, Axis `Input_3`, Angle `Input_2`=0, Random Offset `Input_6`=0.349 rad, Lock Ends `Input_8`                                                                                                                                                                                                                                        |
| Roll Hair Curves        | Factor `Input_10`, Subdivision `Input_13`, Variation Level `Input_11`=10, Roll Length `Input_2`=0.1, Roll Radius `Input_3`=0.05, Roll Depth `Input_9`, Roll Taper `Input_4`, Retain Overall Shape `Input_5`, Roll Direction `Input_7`, Random Orientation `Input_6`=0.5                                                                            |
| Shrinkwrap Hair Curves  | Surface Input Type `Socket_0`, Surface (object) `Input_2`, Factor `Input_5`, Offset Distance `Input_4`=0, Above Surface `Input_8`=0.5, Smoothing Steps `Input_6`, Lock Roots `Input_7`=True                                                                                                                                                        |
| Displace Hair Curves    | Factor `Input_3`, Shape `Input_8`, Object Space `Input_2`, Displace Vector `Input_9`, Surface Normal toggle `Socket_2`, Surface (object) `Input_4`, Surface UV Map `Input_6` (defaults to attribute `UVMap`), Surface Normal Distance `Input_7`                                                                                                    |
| Duplicate Hair Curves   | Amount `Input_2`=10, Viewport Amount `Input_4`, Radius `Input_5`=0.1, Distribution Shape `Input_7`, Tip Roundness `Input_8`, Even Thickness `Input_6`, Seed `Input_3`                                                                                                                                                                              |
| Hair Dynamics           | Mode `Socket_44`=Animation, Substeps `Socket_6`=10, Bendiness `Socket_20`=0.5, Root Bendiness `Socket_35`=0.2, Surface Collision `Socket_15`=False, Gravity `Socket_22`=True                                                                                                                                                                       |

## P5. Masks and density maps

Verified on 5.2.1 by `test_01_groom_headless.py`, `test_02_asset_stack.py` and
`test_07_density_maps.py`.

**Vertex group as Density Mask.** 796 children with the mask against 2,502 without. The surface
group reaches the children as a CURVE-domain attribute, so later assets can read it:

```python
H.set_inputs(interp, {"Density Mask": "attr:density_fur"})
H.set_inputs(noise, {"Factor": "attr:noise_strength"})   # tip motion 0.042 painted side vs 0.002 unpainted
```

**Bystedt's gray density map.** A weight of 0.5 halves the count (1,247 against 2,476). A white
stripe at the part on a 0.5 base adds density there only (1,418). Paint the base at 50% so you keep
headroom in both directions.

**Mask Texture (5.2).** This is an image in surface UV space that discards children after
distribution. Black on U > 0.5 left 1,237 of 2,476, with 0.8% leaking over the border:

```python
H.set_inputs(interp, {"Mask Texture": bpy.data.images["density_mask"]})
```

**Per-curve random masks (Thommes).** This is a small GN modifier placed right after Interpolate
that stores a CURVE-domain float:

```python
H.random_curve_mask(hair, "frizz_mask", threshold=0.8)            # 82% of curves at 0 in the test
H.random_curve_mask(hair, "stray_mask", threshold=0.9, hard=True) # 9.5% of curves at 1
H.set_inputs(frizz, {"Factor": "attr:frizz_mask"})                # masked curves moved 0.0, others 0.6 mm
```

The group is Random Value (FLOAT, ID = ID node, Seed) into Map Range (From Min = Threshold), with a
Compare (Greater Than) for the hard version. A Switch picks one, and Store Named Attribute (FLOAT,
CURVE, Name) writes it.

**Root-to-tip ramps (Thommes: curl frequency rises toward the tip).**

```python
H.along_curve_attr(hair, "curl_freq", root=1.0, tip=5.0)   # Spline Parameter -> Map Range -> POINT float
H.set_inputs(curl, {"Frequency": "attr:curl_freq"})
```

**Full-density preview patch.** In 5.2.1 Thommes' trick (a Mask modifier on the surface, render off)
does NOT reduce the children while Interpolate's Resting Surface is on (default). Verified: 2,526
curves with and without the Mask modifier, 538 with Resting Surface off. Use one of these instead:

- A temporary patch vertex group as the Density Mask (610 curves) with Viewport Amount 1.
- Resting Surface off while previewing, then back on.

## P6. Procedural stacks

**Long fur (Thommes).** Verified on 5.2.1 by `test_02_asset_stack.py`. On a 10 × 10 cm patch, 1M/m²
gave 10,021 curves (421 in the viewport at 4%), and a full-density evaluation took 0.44 s.

```python
mods = H.build_stack(hair, H.FUR_STACK_LONG)   # creates stray_mask / frizz_mask after Interpolate
H.set_inputs(hair.modifiers["Hair Curves Noise"], {"Factor": "attr:noise_strength"})
```

The order is Profile (0.2 mm), then Interpolate (1M, 4%), then the masks, then Noise, Curl, strays
Noise (10%, 5 mm), Frizz (negative), Clump (1 mm, 0.1), Clump (4 mm, 0.25, offset 5 mm), Frizz
(-0.2, 2 mm, Cumulative off, 20%), Trim (Replace Length off, 5 mm), Rotate (5°) and Hair Dynamics.
The preset marks its own guesses [added]: Curl Factor End 0.3, first Frizz Shape -0.5, Clump Shape
0.3. The talk says "much lower" or "negative" without a number there.

**Human hairstyle, two populations in one tree (Bystedt).** Verified on 5.2.1 by
`test_08_populations_pose.py`. Two populations joined gave 632 red and 596 blue curves, and Global
Density 0.5 halved the count (1,228 to 646).

```python
# guides: 15 points; guide-level shaping before interpolation
H.set_inputs(H.add_asset(hair, "Hair Curves Noise"), {"Cumulative Offset": False, "Offset per Curve": 1.0,
                                                      "Scale along Curve": 0.5, "Distance": 0.004})
H.set_inputs(H.add_asset(hair, "Roll Hair Curves"), {"Roll Length": 0.02, "Roll Radius": 0.004,
                                                     "Random Orientation": 1.0})   # tip curl only [values added]
# one GN tree: per population Interpolate -> Set Hair Curve Profile -> Clump -> Store 'pop_color'; Join
ng = bpy.data.node_groups.new("Hairstyle Populations", "GeometryNodeTree")
ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
gd = ng.interface.new_socket("Global Density", in_out="INPUT", socket_type="NodeSocketFloat"); gd.default_value = 1.0
ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
gi, go, join = ng.nodes.new("NodeGroupInput"), ng.nodes.new("NodeGroupOutput"), ng.nodes.new("GeometryNodeJoinGeometry")
def population(density, seed, clump_shape, clump_factor, color):
    it = ng.nodes.new("GeometryNodeGroup"); it.node_tree = bpy.data.node_groups["Interpolate Hair Curves"]
    mul = ng.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = density
    ng.links.new(gi.outputs["Global Density"], mul.inputs[0]); ng.links.new(mul.outputs[0], it.inputs["Density"])
    it.inputs["Seed"].default_value = seed
    ng.links.new(gi.outputs["Geometry"], it.inputs["Geometry"])
    pr = ng.nodes.new("GeometryNodeGroup"); pr.node_tree = bpy.data.node_groups["Set Hair Curve Profile"]
    pr.inputs["Radius"].default_value = 0.0003
    ng.links.new(it.outputs["Geometry"], pr.inputs["Geometry"])
    cl = ng.nodes.new("GeometryNodeGroup"); cl.node_tree = bpy.data.node_groups["Clump Hair Curves"]
    cl.inputs["Shape"].default_value = clump_shape; cl.inputs["Factor"].default_value = clump_factor
    cl.inputs["Seed"].default_value = seed
    ng.links.new(pr.outputs["Geometry"], cl.inputs["Geometry"])
    st = ng.nodes.new("GeometryNodeStoreNamedAttribute"); st.data_type = "FLOAT_COLOR"; st.domain = "CURVE"
    st.inputs["Name"].default_value = "pop_color"; st.inputs["Value"].default_value = color
    ng.links.new(cl.outputs["Geometry"], st.inputs["Geometry"]); ng.links.new(st.outputs["Geometry"], join.inputs["Geometry"])
population(5000.0, 1, 0.3, 0.5, (1, 0, 0, 1))    # wide clumps: Shape ~0.3, reduced Factor (Bystedt)
population(5000.0, 2, 0.05, 0.7, (0, 0, 1, 1))   # thin clumps: different seed
ng.links.new(join.outputs["Geometry"], go.inputs["Geometry"])
md = hair.modifiers.new("Hairstyle", "NODES"); md.node_group = ng
H.move(hair, md, [m.name for m in hair.modifiers].index("Hair Dynamics"))
```

- The asset groups must exist locally first. `H.add_asset` on a throwaway curves object appends
  them, or use `bpy.data.libraries.load`.
- Read `pop_color` in the shader with an Attribute node to see each population (Bystedt's debug
  colors).
- Alternative without a tree: `twin = hair.copy()` shares the Curves data, so both objects use the
  same guides and each gets its own stack. Verified: the twin evaluated 362 curves.

**Animal regional stack (Schmidbauer).** Verified on 5.2.1 by `test_09_animal_regions.py`. Each
masked effect acted inside its painted region and barely outside it. Tip motion inside vs outside:
Trim 1.0 mm vs 0.06 mm, Clump 7.3 mm vs 0.4 mm, Frizz 1.2 mm vs 0.09 mm. Tip Spread is a distance in
meters: 0.2 threw 3 cm tips 19 cm. Use one curves object per landmark, and give each effect its own
vertex group on the shared body mesh:

```python
H.set_inputs(H.add_asset(fur, "Interpolate Hair Curves"), {"Density": 200000.0, "Density Mask": "attr:body_fur"})  # density [added]
H.set_inputs(H.add_asset(fur, "Trim Hair Curves"), {"Replace Length": False, "Random Offset": 0.002, "Mask": "attr:length_fur"})
H.set_inputs(H.add_asset(fur, "Clump Hair Curves"), {"Factor": "attr:clump", "Tip Spread": 0.002, "Clump Offset": 0.001})
H.set_inputs(H.add_asset(fur, "Frizz Hair Curves"), {"Factor": "attr:frizz", "Distance": 0.001})
```

The distances in that block are [added] starting points for a cat-size animal; the talk gives no
numbers for them. Tune them in renders.

## P7. Part and hairline (Bystedt)

Verified on 5.2.1 by `test_05_parting.py`. The cap splits into 2 islands. With Part by Mesh Islands
off, 21% of children near the part crossed it; with it on, 0%. The parting lift raised mid-strand
height near the part from 9.6 mm to 13.7 mm.

```python
import bmesh
bm = bmesh.new(); bm.from_mesh(cap.data)
part_edges = [e for e in bm.edges if all(abs(v.co.x) < 1e-6 for v in e.verts)]   # the part line
bmesh.ops.split_edges(bm, edges=part_edges); bm.to_mesh(cap.data); bm.free()      # 2 islands
# 'part' vertex group on the line (weight 1), then guides combed away from it:
flow = lambda P, N: np.stack([np.sign(P[:, 0]), np.zeros(len(P)), -0.6 * np.ones(len(P))], 1)
H.add_guides(hair, P, N, length=0.12, points=8, flow=flow, flow_blend=0.85, droop=0.3)
interp = H.add_asset(hair, "Interpolate Hair Curves")          # Part by Mesh Islands is on by default
H.distance_weights(cap, "part_lift", "part", radius=0.03, profile="bump")   # 0 on the line, 1 at r/2, 0 at r
disp = H.add_asset(hair, "Displace Hair Curves")
H.set_inputs(disp, {"Surface Normal": True, "Surface": cap, "Surface Normal Distance": 0.006,
                    "Shape": 0.05, "Factor": "attr:part_lift"})
```

- Keep guides off the part line itself; the test dropped roots within 4 mm of it.
- The render still shows scalp at the part (Bystedt: "at the center line it's very hard to get
  enough coverage"). Add density there: a white stripe in the density map (P5).
- Not scripted here: Bystedt's root snap onto the part line, where roots within a distance move onto
  the line. As a GN sketch: Object Info of the line mesh, Geometry Proximity with target Edges, Set
  Position on root points mixed by a factor. Not run.

## P8. Shading, render settings, review

Verified on 5.2.1 by `test_03_shading_render.py` on 37,648 curves. Render times were 4.4 s for
Cycles at 24 samples and 384 px on CPU, and 1.3 to 2.3 s for EEVEE.

```python
m = H.hair_material("Fur", "CYCLES", melanin=(0.85, 0.45), uv_noise=0.3)   # Principled Hair (Chiang, melanin)
m = H.hair_material("Fur", "EEVEE", root_color=(0.05, 0.025, 0.012), tip_color=(0.4, 0.2, 0.08))
H.assign_material(hair, m)
H.setup_render(bpy.context.scene, "CYCLES", close_up=False)   # STRIP + subdiv; THICK curves for close-ups
sheet = H.review([surface, hair], "/abs/out", engine="CYCLES", views=("front", "threequarter", "top"), res=512)
```

Raw material graph:

- Curves Info (`ShaderNodeHairInfo`) Intercept goes to a Mix (RGBA, root color to tip color) or to a
  Map Range for melanin.
- Curves Info Random goes to a Map Range for roughness 0.25 to 0.4.
- Cycles: `ShaderNodeBsdfHairPrincipled` with `parametrization='MELANIN'` or `'COLOR'`. EEVEE:
  `ShaderNodeBsdfPrincipled` Base Color.
- Surface-mapped variation (Thommes): Attribute `surface_uv_coordinate` into a Noise Texture,
  blended with Mix Soft Light.
- Mix node sockets must be addressed by identifier (`A_Color`, `B_Color`, `Result_Color`,
  `Factor_Float`). `inputs["A"]` returns the hidden float socket.

Measured center luminance for the same groom: 0.255 for Principled Hair in Cycles, 0.092 for
Principled Hair in EEVEE, and 0.498 for Principled BSDF in EEVEE. So use Principled BSDF with
explicit colors under EEVEE. The review rig:

- A warm area fill from the top, a small side key and a cool rim.
- A world of RGB (0.03, 0.04, 0.06).
- Energies scale with the framing distance squared.
- The user's scene is left untouched.

## P9. Pose check (Schmidbauer)

Verified on 5.2.1 by `test_01_groom_headless.py` and `test_08_populations_pose.py`. With a shape
key, roots followed at a mean radius of 0.1558 against 0.156 expected. With Hair Dynamics disabled
they stayed at 0.1199. On an armature-posed frame, roots stayed on the deformed cap within 1.7e-8.

```python
scene.frame_set(10)                                   # a keyed extreme pose
sheet = H.review([body, fur], out, engine="EEVEE", views=("right",), frame=10)   # review renders that frame
```

Check 2 or 3 extreme poses from the same camera, looking for bald spots, stretching gaps and
clipping. Keep Hair Dynamics (Animation) last in the stack.

## P10. Hair cards and tubes for games (Bystedt, Matsumoto)

Verified on 5.2.1 by `test_04_cards.py` (12 checks):

- Cards: tris = guides × 11 × 3 × 2.
- UVs: U 0 to 0.5, V 0 to 1.
- Roots on the scalp within 1.9e-8.
- Root faces along the scalp: mean |normal · surface normal| 0.957.
- Tubes: tris = guides × 11 × 6 × 2, U 0 to 1.
- `object.convert` keeps `UVMap` as a UV layer, and the glTF export (cards plus cap) was 301 KB.

```python
mat = H.card_material("Card")                      # procedural strand stand-in [added], or image=baked_plate
md = H.add_cards(hair, width=0.02, material=mat, segments=3, resample=12, root_scale=1.0, tip_scale=0.3)
print(H.card_stats(hair))                          # {'tris', 'uv_min', 'uv_max', ...}
H.set_inputs(md, {"Tubes": True})                  # close-ups or bald spots (Matsumoto)
# export: work on a copy, drop Hair Dynamics, convert
dup = hair.copy(); dup.data = hair.data.copy(); bpy.context.collection.objects.link(dup)
dup.modifiers.remove(dup.modifiers["Hair Dynamics"])
for o in bpy.context.selected_objects: o.select_set(False)
dup.select_set(True); bpy.context.view_layer.objects.active = dup
bpy.ops.object.convert(target="MESH")
bpy.ops.export_scene.gltf(filepath="/abs/cards.glb", use_selection=True, export_format="GLB")
```

What `cards_group()` builds ('BX Hair Cards'), in order:

1. Resample Curve (count).
2. Set Curve Normal with Mode `Free` and Normal from Sample Nearest Surface of the surface normals,
   so the card lies on the scalp (Bystedt).
3. Capture Attribute of Spline Parameter on the curve (V).
4. The profile: an arc of angle Bend centered on +X and shifted so its apex sits on the curve, or a
   flat Spiral for tubes (resolution 6, 1 rotation, height 0, start radius = end radius; Matsumoto).
   A Switch picks one, and a Capture of Spline Parameter on the profile gives U.
5. Curve to Mesh, with Scale = root-to-tip taper (the 4.5+ Scale input).
6. Store Named Attribute FLOAT2, CORNER, `UVMap` = (U × 0.5 for cards or × 1 for tubes, V).
7. Set Shade Smooth, then Set Material.
8. Set Position of the V < 1e-4 row onto Geometry Proximity (Faces) of the surface. This runs last
   (Matsumoto).

5.2 gotchas met while building it:

- Capture Attribute has a Selection input, so address items by name.
- Arc Resolution counts points (segments + 1).
- `obj.evaluated_geometry().mesh` is freed when the GeometrySet is not kept in a variable.
- A stored FLOAT2 CORNER attribute named `UVMap` works directly in the material UV Map node and
  survives conversion, so no extra output attribute is needed.

Not scripted (expert features to add when needed): Bystedt's snap-if-inside push-out, normal
transfer from the head, color and UV transfer from the scalp at the card root, card variants
instanced per curve, and 1 subdivision per 20 cm (set `resample` from the length instead). Also not
scripted: Matsumoto's strand-plate bake (orthographic camera over a groomed plane; passes normal,
depth, AO, position, alpha; depth remapped). Render it with the same review tools, but it has no
test here.

## P11. Live session: brush setup and hand-off (GUI)

GUI only. Verified by `test_06_gui_curves_sculpt.py`, run as
`blender --factory-startup --python ...` with a window and 7 checks.

```python
import bx_gui as G
bpy.ops.object.mode_set(mode="SCULPT_CURVES")              # curves object active
G.activate_brush("SCULPT_CURVES", "Add")                   # Add, Comb, Delete, Density, Grow/Shrink, Pinch,
cs = bpy.context.scene.tool_settings.curves_sculpt.brush.curves_sculpt_settings   # Puff, Pull Tips, Select, Slide, Smooth
cs.points_per_curve = 2; cs.curve_length = 0.01            # Schmidbauer
cs.use_length_interpolate = cs.use_shape_interpolate = cs.use_point_count_interpolate = True   # Bystedt
G.activate_brush("SCULPT_CURVES", "Comb")
bpy.context.scene.tool_settings.curves_sculpt.brush.falloff_shape = "PROJECTED"   # Bystedt: reaches the far side
bpy.context.scene.tool_settings.curves_sculpt.use_symmetry_x = True
# now ask the user to stroke; G.stroke("SCULPT_CURVES", ...) returns {'PASS_THROUGH'} and changes nothing
```

In 5.2.1 `sculpt_curves.brush_stroke` has no exec: the console logs "Invalid operator call".
`INVOKE_DEFAULT` returns RUNNING_MODAL and waits for a real mouse. `--enable-event-simulate` with
`Window.event_simulate` produced no strokes either, for curves or for mesh sculpt, so strokes need a
person. What does work from code in that mode is `sculpt_curves.select_random`, `select_grow` and
every Object-Mode procedure above.
