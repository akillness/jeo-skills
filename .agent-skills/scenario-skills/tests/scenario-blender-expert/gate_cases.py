"""Builds the delivery-gate fixtures inside Blender and writes each verdict to JSON.

Run by test_live_gate.py:
  blender -b --factory-startup --python-exit-code 1 -P gate_cases.py -- <expert scripts> <out.json> <tmp dir>
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.geometry import tessellate_polygon

SCRIPTS, OUT, TMP = sys.argv[sys.argv.index("--") + 1:][:3]
sys.path.insert(0, SCRIPTS)
import bx_audit  # noqa: E402


def empty():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def box(name, dims, loc, scale=(1, 1, 1), flip=False, uv=True, material=True, extra=None):
    """A UV'd box with its own material; extra adds a detached box to the same mesh."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if uv:
        bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_cube(bm, size=1.0, calc_uvs=uv)
    bmesh.ops.scale(bm, vec=Vector(dims), verts=bm.verts)
    if extra:
        geom = bmesh.ops.create_cube(bm, size=1.0, calc_uvs=uv)["verts"]
        bmesh.ops.scale(bm, vec=Vector(extra[0]), verts=geom)
        bmesh.ops.translate(bm, vec=Vector(extra[1]), verts=geom)
    if flip:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if material:
        me.materials.append(bpy.data.materials.new("M_" + name))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location, ob.scale = loc, scale
    return ob


def fender(name):
    """A closed 2.5 mm body panel, 1.6 by 0.7, cut by a wheel arch that wraps past half a circle,
    so the panel ends in a sharp tip either side of the opening."""
    thick, radius, cz, seg = 0.0025, 0.35, 0.3, 48
    tip = math.sqrt(radius ** 2 - cz ** 2)
    a0, a1 = math.atan2(-cz, -tip) % (2 * math.pi), math.atan2(-cz, tip)
    arch = [(radius * math.cos(a0 + (a1 - a0) * i / seg), cz + radius * math.sin(a0 + (a1 - a0) * i / seg))
            for i in range(seg + 1)]
    outline = [(-0.8, 0.0)] + arch + [(0.8, 0.0), (0.8, 0.7), (-0.8, 0.7)]
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    back = [bm.verts.new((x, -thick / 2, z)) for x, z in outline]
    front = [bm.verts.new((x, thick / 2, z)) for x, z in outline]
    for i, j, k in tessellate_polygon([[Vector((x, z, 0.0)) for x, z in outline]]):
        bm.faces.new((back[k], back[j], back[i]))
        bm.faces.new((front[i], front[j], front[k]))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        bm.faces.new((back[i], back[j], front[j], front[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.uv_layers.new(name="UVMap")
    me.materials.append(bpy.data.materials.new("M_" + name))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def crate(clean):
    """Body, label, handle, lid, bracket. Unclean: four planted defects, one per part."""
    empty()
    box("Body", (1.0, 0.7, 0.6), (0, 0, 0.3))
    if clean:
        box("Label", (0.44, 0.002, 0.16), (0, -0.3505, 0.32))
        box("Handle", (0.04, 0.30, 0.06), (0.51, 0, 0.42))
        box("Lid", (1.04, 0.74, 0.05), (0, 0, 0.623))
        box("Bracket", (0.12, 0.12, 0.06), (0.44, -0.29, 0.668))
    else:
        box("Label", (0.44, 0.002, 0.16), (0, -0.349, 0.32))  # front face on the body's
        box("Handle", (0.04, 0.30, 0.06), (0.54, 0, 0.42))  # 2 cm off the body
        box("Lid", (1, 1, 1), (0, 0, 0.623), scale=(1.04, 0.74, 0.05))  # scale left on
        box("Bracket", (0.12, 0.12, 0.06), (0.44, -0.29, 0.668), flip=True)  # inside out
    return [o.name for o in bpy.context.scene.objects]


def gate(names, profile="game"):
    return bx_audit.deliverable(names, profile=profile)


cases = {}
cases["crate_defects"] = gate(crate(clean=False))
cases["crate_clean"] = gate(crate(clean=True))

# The fixes SKILL.md documents, applied to the defect crate.
crate(clean=False)
lid = bpy.data.objects["Lid"]
lid.data.transform(Matrix.Diagonal(lid.scale).to_4x4())
lid.scale = (1, 1, 1)
bm = bmesh.new()
bm.from_mesh(bpy.data.objects["Bracket"].data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(bpy.data.objects["Bracket"].data)
bm.free()
bpy.data.objects["Label"].location.y -= 0.0015
bpy.data.objects["Handle"].location.x = 0.51
cases["crate_fixed"] = gate([o.name for o in bpy.context.scene.objects])
for profile in ("render", "print", "roblox"):
    cases[f"crate_clean_{profile}"] = gate(crate(clean=True), profile)

# The clean crate after a GLB round trip: seams split every vertex, the gate must weld them.
crate(clean=True)
glb = os.path.join(TMP, "crate.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB")
empty()
bpy.ops.import_scene.gltf(filepath=glb)
cases["crate_glb"] = gate([o.name for o in bpy.context.scene.objects if o.type == "MESH"])

# A 5 mm gap: past the contact tolerance, under the floating one.
crate(clean=True)
bpy.data.objects["Handle"].location.x = 0.525
cases["near_gap_game"] = gate([o.name for o in bpy.context.scene.objects])
cases["near_gap_print"] = gate([o.name for o in bpy.context.scene.objects], "print")

empty()
box("Hull", (1, 1, 1), (0, 0, 0.5), extra=((0.05, 0.05, 0.05), (0, 0, 1.3)))
cases["fragment"] = gate(["Hull"])

empty()
box("Shell", (1, 1, 1), (0, 0, 0.5))
box("Core", (0.2, 0.2, 0.2), (0, 0, 0.5))
cases["enclosed"] = gate(["Shell", "Core"])

# Parts that cross face to face, a rail across the post's side and a beam across its top: no
# vertex of either lies near the other part, and the hairline gap float rounding leaves between
# faces that meet (0.1 mm here, under the contact tolerance) hides them from the overlap test.
empty()
box("Post", (0.2, 0.2, 1.0), (0, 0, 0.5))
box("Rail", (1.5, 0.04, 0.08), (0.5, -0.1201, 0.7))
box("Beam", (2.0, 0.06, 0.1), (0.8, 0.05, 1.0501))
cases["crossing"] = gate(["Post", "Rail", "Beam"])

# A plate in the wheel arch of a 2.5 mm panel, 10 cm from the arch's sharp tip. The tip is the
# panel's nearest point, and the face BVHTree.find_nearest returns there can look away from the
# plate: the plate floats, it is not enclosed. The core above still is.
empty()
fender("Fender")
box("Plate", (0.01, 0.002, 0.01), (0.08, 0, 0.03))
cases["beside_thin_shell"] = gate(["Fender", "Plate"])

empty()
box("Mirror", (1, 1, 1), (0, 0, 0.5), scale=(-1, 1, 1))
cases["negative_scale"] = gate(["Mirror"])

empty()
ob = box("Doubled", (1, 1, 1), (0, 0, 0.5))
bm = bmesh.new()
bm.from_mesh(ob.data)
bm.faces.ensure_lookup_table()
bmesh.ops.duplicate(bm, geom=[bm.faces[0]])
bm.to_mesh(ob.data)
bm.free()
cases["double_faces"] = gate(["Doubled"])

empty()
ob = box("Open", (1, 1, 1), (0, 0, 0.5))
bm = bmesh.new()
bm.from_mesh(ob.data)
bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[0]], context="FACES_ONLY")
bm.to_mesh(ob.data)
bm.free()
cases["open_game"] = gate(["Open"])
cases["open_print"] = gate(["Open"], "print")

empty()
me = bpy.data.meshes.new("Dense")
bm = bmesh.new()
bm.loops.layers.uv.new("UVMap")
bmesh.ops.create_icosphere(bm, subdivisions=6, radius=0.5, calc_uvs=True)
bm.to_mesh(me)
bm.free()
me.materials.append(bpy.data.materials.new("M_Dense"))
bpy.context.scene.collection.objects.link(bpy.data.objects.new("Dense", me))
cases["dense_game"] = gate(["Dense"])
cases["dense_roblox"] = gate(["Dense"], "roblox")

empty()
box("Bare", (1, 1, 1), (0, 0, 0.5), uv=False, material=False)
cases["bare"] = gate(["Bare"])

empty()
ob = box("Painted", (1, 1, 1), (0, 0, 0.5), uv=False)
ob.active_material.use_nodes = True
ob.active_material.node_tree.nodes.new("ShaderNodeTexImage")
cases["textured_no_uv"] = gate(["Painted"])

# One face of a closed box reversed: it points into the part, an engine culls it.
empty()
ob = box("Flipped", (1, 1, 1), (0, 0, 0.5))
bm = bmesh.new()
bm.from_mesh(ob.data)
bm.faces.ensure_lookup_table()
bmesh.ops.reverse_faces(bm, faces=[bm.faces[0]])
bm.to_mesh(ob.data)
bm.free()
cases["flipped_face"] = gate(["Flipped"])

# The same defect on one of 2646 faces: a sliver hole, under 0.1% of the surface.
empty()
ob = box("Sliver", (1, 1, 1), (0, 0, 0.5))
bm = bmesh.new()
bm.from_mesh(ob.data)
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=20, use_grid_fill=True)
bm.faces.ensure_lookup_table()
bmesh.ops.reverse_faces(bm, faces=[bm.faces[100]])
bm.to_mesh(ob.data)
bm.free()
cases["sliver_game"] = gate(["Sliver"])
cases["sliver_print"] = gate(["Sliver"], "print")

# A flap folded back over its neighbour: mixed winding on the shared edge, both faces
# still facing up, as in generated meshes where open borders meet at a seam.
empty()
me = bpy.data.meshes.new("Folded")
bm = bmesh.new()
uv = bm.loops.layers.uv.new("UVMap")
v = [bm.verts.new(c) for c in ((0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0.6, 1, 0.002), (0.6, 0, 0.002))]
bm.faces.new((v[0], v[1], v[2], v[3]))
bm.faces.new((v[1], v[2], v[4], v[5]))
for f in bm.faces:
    for loop in f.loops:
        loop[uv].uv = (loop.vert.co.x, loop.vert.co.y)
bm.to_mesh(me)
bm.free()
me.materials.append(bpy.data.materials.new("M_Folded"))
bpy.context.scene.collection.objects.link(bpy.data.objects.new("Folded", me))
cases["folded"] = gate(["Folded"])

# A unit-scale part under a scaled parent: the engine still receives the scale, and the
# message names the parent, where applying it clears the gate.
empty()
root = bpy.data.objects.new("Root", None)
bpy.context.scene.collection.objects.link(root)
root.scale = (2, 2, 2)
ob = box("Child", (0.5, 0.5, 0.5), (0, 0, 0.25))
ob.parent = root
cases["parent_scale"] = gate(["Child"])
for o in (root, ob):
    o.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
cases["parent_scale_applied"] = gate(["Child"])

# No UV map on the base mesh, one written by Geometry Nodes: exporters write the evaluated
# mesh, so the gate reads UVs from it.
empty()
ob = box("NodesUV", (1, 1, 1), (0, 0, 0.5), uv=False)
ob.active_material.use_nodes = True
ob.active_material.node_tree.nodes.new("ShaderNodeTexImage")
ng = bpy.data.node_groups.new("StoreUV", "GeometryNodeTree")
ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
gi, go = ng.nodes.new("NodeGroupInput"), ng.nodes.new("NodeGroupOutput")
store = ng.nodes.new("GeometryNodeStoreNamedAttribute")
store.data_type, store.domain = "FLOAT2", "CORNER"
store.inputs["Name"].default_value = "UVMap"
ng.links.new(gi.outputs[0], store.inputs["Geometry"])
ng.links.new(ng.nodes.new("GeometryNodeInputPosition").outputs[0], store.inputs["Value"])
ng.links.new(store.outputs[0], go.inputs[0])
ob.modifiers.new("UV", "NODES").node_group = ng
cases["nodes_uv"] = gate(["NodesUV"])
cases["nodes_uv_base"] = bx_audit.deliverable(["NodesUV"], evaluated=False)

# The image texture sits two node groups deep: the material's top level holds only a group node.
empty()
ob = box("Grouped", (1, 1, 1), (0, 0, 0.5), uv=False)
ob.active_material.use_nodes = True
inner = bpy.data.node_groups.new("InnerTex", "ShaderNodeTree")
inner.nodes.new("ShaderNodeTexImage")
outer = bpy.data.node_groups.new("OuterTex", "ShaderNodeTree")
outer.nodes.new("ShaderNodeGroup").node_tree = inner
ob.active_material.node_tree.nodes.new("ShaderNodeGroup").node_tree = outer
cases["grouped_texture_no_uv"] = gate(["Grouped"])

# No faces to export: a mesh that starts empty, and a box a Weld modifier collapses to a point.
empty()
me = bpy.data.meshes.new("Void")
me.materials.append(bpy.data.materials.new("M_Void"))
bpy.context.scene.collection.objects.link(bpy.data.objects.new("Void", me))
cases["no_faces"] = gate(["Void"])
cases["no_faces_render"] = gate(["Void"], "render")
empty()
ob = box("Welded", (1, 1, 1), (0, 0, 0.5))
ob.modifiers.new("Collapse", "WELD").merge_threshold = 10.0
cases["emptied_by_modifier"] = gate(["Welded"])
cases["emptied_base"] = bx_audit.deliverable(["Welded"], evaluated=False)
box("Base", (1, 1, 1), (0, 0, 0.5))
cases["emptied_beside_a_part"] = gate(["Welded", "Base"])
# Scale on an object that exports nothing raises no transform finding beside no_faces.
empty()
for name, scale in (("Mirrored", (-1, 1, 1)), ("Scaled", (2, 2, 2))):
    box(name, (1, 1, 1), (0, 0, 0.5), scale=scale).modifiers.new("Collapse", "WELD").merge_threshold = 10.0
    cases["emptied_" + name.lower()] = gate([name])
# A part under the audit weld (1e-6 of the asset's diagonal) still exports its faces.
empty()
box("Base", (1, 1, 1), (0, 0, 0.5))
box("Speck", (1e-6, 1e-6, 1e-6), (0, 0, 1.0))
cases["speck_under_the_weld"] = gate(["Base", "Speck"])

# Pieces that each stand on the floor, one sunk 5 cm into it: given the ground they stand
# together, and a part off the floor floats even when it is the largest.
empty()
box("StoneA", (0.4, 0.3, 0.2), (-1, 0, 0.1))
box("StoneB", (0.3, 0.3, 0.2), (1, 0, 0.05))
cases["stones"] = gate(["StoneA", "StoneB"])
cases["stones_ground"] = bx_audit.deliverable(["StoneA", "StoneB"], ground=0.0)
box("Board", (2.0, 0.05, 1.0), (0, 0.5, 1.5))
cases["board_ground"] = bx_audit.deliverable(["StoneA", "StoneB", "Board"], ground=0.0)
# A part wholly under the floor does not stand on it, and a ground no part reaches warns.
box("Stray", (0.2, 0.2, 0.2), (0, 0, -10))
cases["stray_ground"] = bx_audit.deliverable(["StoneA", "StoneB", "Stray"], ground=0.0)
cases["stones_ground_missed"] = bx_audit.deliverable(["StoneA", "StoneB"], ground=5.0)
cases["one_part_ground"] = bx_audit.deliverable(["StoneA"], ground=0.0)
cases["one_part_ground_missed"] = bx_audit.deliverable(["StoneA"], ground=5.0)


def cli(*args):
    """Exit code of the bx_audit CLI run on the open scene."""
    argv, sys.argv = sys.argv, ["blender", "--", *args]
    try:
        bx_audit._cli()
    except SystemExit as stop:
        return stop.code
    finally:
        sys.argv = argv
    return None  # the CLI must exit with a code: None fails the test


cases["cli_ground"] = {flag: cli("--deliverable", "--objects", "StoneA", "StoneB", *extra)
                       for flag, extra in (("without", ()), ("with", ("--ground", "0")))}

with open(OUT, "w") as f:
    json.dump(cases, f, indent=1)
print("GATE CASES", len(cases))
