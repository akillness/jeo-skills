"""Exports fixtures with every bx_export preset inside Blender, re-imports them, writes JSON.

Run by test_live_export.py:
  blender -b --factory-startup --python-exit-code 1 -P export_cases.py -- <export scripts> <out.json> <tmp dir>
"""

import json
import math
import os
import shutil
import sys
import zipfile

import bmesh
import bpy
from mathutils import Vector

SCRIPTS, OUT, TMP = sys.argv[sys.argv.index("--") + 1:][:3]
sys.path.insert(0, SCRIPTS)
import bx_export as bxe  # noqa: E402

STATIC = ("unity", "unreal", "print", "usd", "usdz", "gltf")
RIGGED = ("unity_skeletal", "unreal_skeletal", "roblox", "godot", "web")


def mesh(name, build):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")
    build(bm)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(bpy.data.materials.new("M_" + name))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def crate():
    """A 1.0 x 0.7 x 0.6 m box resting on the ground."""
    def build(bm):
        bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
        bmesh.ops.scale(bm, vec=(1.0, 0.7, 0.6), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(0, 0, 0.3), verts=bm.verts)
    return mesh("Crate", build)


def character():
    """A 2 m capsule skinned to a three-bone chain, with a shape key and one action."""
    def build(bm):
        bmesh.ops.create_cone(bm, segments=12, radius1=0.25, radius2=0.25, depth=2.0,
                              cap_ends=True, calc_uvs=True)
        bmesh.ops.translate(bm, vec=(0, 0, 1.0), verts=bm.verts)
        bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1],
                                  cuts=7, use_grid_fill=False)
    body = mesh("Body", build)
    arm = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Rig", arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    parent = None
    for i, (name, z0, z1) in enumerate((("Hips", 0.0, 0.8), ("Spine", 0.8, 1.5), ("Head", 1.5, 2.0))):
        b = arm.edit_bones.new(name)
        b.head, b.tail, b.parent = (0, 0, z0), (0, 0, z1), parent
        b.use_connect = parent is not None
        parent = b
    bpy.ops.object.mode_set(mode="OBJECT")
    for name, lo, hi in (("Hips", -1, 0.8), ("Spine", 0.8, 1.5), ("Head", 1.5, 3)):
        vg = body.vertex_groups.new(name=name)
        vg.add([v.index for v in body.data.vertices if lo <= v.co.z < hi], 1.0, "REPLACE")
    body.modifiers.new("Armature", "ARMATURE").object = rig
    body.parent = rig
    body.shape_key_add(name="Basis")
    key = body.shape_key_add(name="jawOpen")
    for v in key.data:
        if v.co.z > 1.8:
            v.co.x *= 1.3
    pb = rig.pose.bones["Spine"]
    for frame, angle in ((1, 0.0), (12, 0.6), (24, 0.0)):
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (angle, 0, 0)
        pb.keyframe_insert("rotation_euler", frame=frame)
    rig.animation_data.action.name = "Wave"
    return body, rig


def scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    c = crate()
    body, rig = character()
    rig.location.x = 2.0
    return c, body, rig


cases = {"exports": {}}
scene()
before = {"static": bxe.inspect_scene(["Crate"]), "rigged": bxe.inspect_scene(["Rig", "Body"])}
files = {}
for preset in STATIC + RIGGED:
    ext = bxe.PRESETS[preset][0]
    path = os.path.join(TMP, preset + ext)
    objs = ["Crate"] if preset in STATIC else ["Rig", "Body"]
    cases["exports"][preset] = bxe.export(path, preset, objs)
    files[preset] = path

# round_trip() itself: a background Blender, the open scene untouched.
rt = bxe.round_trip(files["godot"], ["Rig", "Body"], preset="godot")
cases["round_trip_godot"] = {"pass": rt["pass"], "diffs": rt["diffs"],
                             "scene_kept": "Crate" in bpy.data.objects}

# Roblox exports no animation unless asked: with bake_anim=True the clip travels, and
# round_trip() given the same override compares actions.
anim_fbx = os.path.join(TMP, "roblox_anim.fbx")
bxe.export(anim_fbx, "roblox", ["Rig", "Body"], bake_anim=True)
rt = bxe.round_trip(anim_fbx, ["Rig", "Body"], preset="roblox", bake_anim=True)
cases["roblox_anim"] = {"pass": rt["pass"], "diffs": rt["diffs"], "actions": rt["after"]["actions"]}
rt = bxe.round_trip(files["roblox"], ["Rig", "Body"], preset="roblox", bake_anim=True)
cases["roblox_no_anim"] = {"pass": rt["pass"], "diffs": rt["diffs"]}
try:
    bxe.lods("Body")
    cases["lods_skinned"] = "made"
except ValueError as exc:
    cases["lods_skinned"] = str(exc)

# LODs and collision, exported together for Unity and Unreal.
bxe.lods("Crate", ratios=(0.5, 0.25))
cases["lods"] = bxe.inspect_scene([o for o in bpy.data.objects if o.name.startswith("Crate_LOD")])
lod_fbx = os.path.join(TMP, "lods.fbx")
bxe.export(lod_fbx, "unity", ["Crate", "Crate_LOD0", "Crate_LOD1", "Crate_LOD2"])
scene()
cases["collision_unreal"] = bxe.collision("Crate", "unreal")
cases["collision_godot"] = bxe.collision("Crate", "godot")
cases["collision_unity"] = bxe.collision("Crate", "unity")
ucx_fbx = os.path.join(TMP, "ucx.fbx")
bxe.export(ucx_fbx, "unreal", ["Crate", "UCX_Crate_00"])
scene()
cases["collision_godot_box"] = bxe.collision("Crate", "godot", "box")
scene()
cases["collision_godot_mesh"] = bxe.collision("Crate", "godot", "mesh")

cases["roundtrip"] = {}
for preset, path in files.items():
    after = bxe.inspect_file(path)
    kind = "static" if preset in STATIC else "rigged"
    cases["roundtrip"][preset] = {
        "diffs": bxe.compare(before[kind], after, bxe.CARRIES[preset], scale=bxe.SCALE.get(preset, 1.0)),
        "after": after,
    }
cases["lods_file"] = sorted(bxe.inspect_file(lod_fbx)["objects"])
cases["ucx_file"] = sorted(bxe.inspect_file(ucx_fbx)["objects"])
cases["glb_godot"] = bxe.glb_summary(files["godot"])
cases["glb_web"] = bxe.glb_summary(files["web"])
cases["usdz_members"] = zipfile.ZipFile(files["usdz"]).namelist()

# batch(): a folder holding the static GLB, gated and converted for Godot.
src = os.path.join(TMP, "batch_in")
os.makedirs(src)
os.replace(files["gltf"], os.path.join(src, "crate.glb"))
cases["batch"] = bxe.batch(src, os.path.join(TMP, "batch_out"), "godot")
shutil.copy(files["unity"], os.path.join(src, "crate.fbx"))
cases["batch_shared_stem"] = bxe.batch(src, os.path.join(TMP, "batch_out2"), "godot")
cases["batch_shared_stem_files"] = sorted(os.listdir(os.path.join(TMP, "batch_out2")))
# A review render, then its camera removed: the view layer keeps a None entry
# until its next update, and export() must still work.
bpy.ops.wm.read_factory_settings(use_empty=True)
crate()
cam = bpy.data.objects.new("ReviewCam", bpy.data.cameras.new("ReviewCam"))
sc = bpy.context.scene
sc.collection.objects.link(cam)
sc.camera = cam
sc.render.engine = "BLENDER_WORKBENCH"
sc.render.resolution_x = sc.render.resolution_y = 32
sc.render.filepath = os.path.join(TMP, "review.png")
bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(cam)
cases["after_render"] = bxe.export(os.path.join(TMP, "after_render.glb"), "godot", ["Crate"])["bytes"]

# lods() on a mesh under a moved, turned parent: every LOD keeps the mesh's world place, and
# the group takes the mesh's place under the parent.
def world_center(ob):
    return [round(sum((ob.matrix_world @ Vector(c))[k] for c in ob.bound_box) / 8, 4) for k in range(3)]


bpy.ops.wm.read_factory_settings(use_empty=True)
c = crate()
base = bpy.data.objects.new("Base", None)
bpy.context.scene.collection.objects.link(base)
base.location, base.rotation_euler = (3, 1, 0), (0, 0, 0.5)
c.parent = base
bpy.context.view_layer.update()
start = world_center(c)
r = bxe.lods("Crate", ratios=(0.5,))
bpy.context.view_layer.update()
cases["lods_parented"] = {"start": start, "group_parent": bpy.data.objects[r["group"]].parent.name,
                          "centers": {n: world_center(bpy.data.objects[n]) for n in r["tris"]}}

# A packed image with no path, as a glTF import leaves it: the FBX must name it with an
# extension, and the scene must keep its own path.
bpy.ops.wm.read_factory_settings(use_empty=True)
mat = crate().data.materials[0]
if mat.node_tree is None:
    mat.use_nodes = True
gen = bpy.data.images.new("gen", 8, 8)
gen.filepath_raw, gen.file_format = os.path.join(TMP, "gen.png"), "PNG"
gen.save()
img = bpy.data.images.load(os.path.join(TMP, "gen.png"))
img.pack()
img.filepath_raw, img.name = "", "Image_0"
tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = img
bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
bxe.export(os.path.join(TMP, "packed.fbx"), "unity", ["Crate"])
with open(os.path.join(TMP, "packed.fbx"), "rb") as f:
    data, rel, i = f.read(), set(), 0
while (i := data.find(b"RelativeFilenameS", i)) >= 0:
    n = int.from_bytes(data[i + 17:i + 21], "little")
    rel.add(data[i + 21:i + 21 + n].decode())
    i += 21 + n
cases["packed_fbx"] = {"relative": sorted(rel), "filepath_after": img.filepath_raw}

# An image made in Blender and never saved (a new bake target): the FBX must still embed
# it, and the scene must keep the image as it was.
bpy.ops.wm.read_factory_settings(use_empty=True)
mat = crate().data.materials[0]
if mat.node_tree is None:
    mat.use_nodes = True
gen = bpy.data.images.new("baked_albedo", 16, 16)
gen.generated_type = "UV_GRID"
tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = gen
bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
r = bxe.export(os.path.join(TMP, "generated.fbx"), "unity", ["Crate"])
with open(os.path.join(TMP, "generated.fbx"), "rb") as f:
    png_bytes = f.read().count(b"\x89PNG")
cases["generated_fbx"] = {
    "packed": r["packed_unsaved_images"],
    "png_bytes": png_bytes,
    "source_after": gen.source, "name_after": gen.name, "node_kept": tex.image == gen,
    "images_after": sorted(i.name for i in bpy.data.images),
}

# A control bone outside the deform hierarchy and a second, stored action.
scene()
rig = bpy.data.objects["Rig"]
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
ctrl = rig.data.edit_bones.new("Ctrl_Look")
ctrl.head, ctrl.tail, ctrl.use_deform = (0, -1, 1.8), (0, -1.3, 1.8), False
bpy.ops.object.mode_set(mode="OBJECT")
wave = rig.animation_data.action
rig.animation_data.action = None
pb = rig.pose.bones["Head"]
for frame, angle in ((1, 0.0), (24, 0.2)):
    pb.rotation_euler = (angle, 0, 0)
    pb.keyframe_insert("rotation_euler", frame=frame)
idle = rig.animation_data.action
idle.name, idle.use_fake_user = "Idle", True
rig.animation_data.action = wave
roblox_fbx = os.path.join(TMP, "roblox_ctrl.fbx")
bxe.export(roblox_fbx, "roblox", ["Rig", "Body"], bake_anim=True)
rt = bxe.round_trip(roblox_fbx, ["Rig", "Body"], preset="roblox", bake_anim=True)
cases["roblox_ctrl"] = {"pass": rt["pass"], "diffs": rt["diffs"], "roots": rt["after"]["objects"]["Rig"]["roots"],
                        "before_actions": rt["before"]["actions"]}
two_roots = os.path.join(TMP, "roblox_two_roots.fbx")
bxe.export(two_roots, "roblox", ["Rig", "Body"], use_armature_deform_only=False)
cases["roblox_two_roots"] = bxe.round_trip(two_roots, ["Rig", "Body"], preset="roblox",
                                           use_armature_deform_only=False)["diffs"]
skel = os.path.join(TMP, "skeletal_ctrl.fbx")
bxe.export(skel, "unity_skeletal", ["Rig", "Body"])
rt = bxe.round_trip(skel, ["Rig", "Body"], preset="unity_skeletal")
cases["skeletal_ctrl"] = {"pass": rt["pass"], "diffs": rt["diffs"], "actions": rt["after"]["actions"]}
active_only = os.path.join(TMP, "skeletal_active_only.fbx")
bxe.export(active_only, "unity_skeletal", ["Rig", "Body"], bake_anim_use_all_actions=False)
rt = bxe.round_trip(active_only, ["Rig", "Body"], preset="unity_skeletal", bake_anim_use_all_actions=False)
cases["skeletal_active_only"] = {"pass": rt["pass"], "diffs": rt["diffs"]}

cases["spine_angle_deg"] = round(math.degrees(0.6), 1)


# Maps: a generated GLB packs metallic (B) and roughness (G) in one image, which the glTF
# importer routes through Separate Color. The FBX exporter drops both; extra_maps() writes them.
def image(name, rgba):
    img = bpy.data.images.new(name, 8, 8, alpha=True)
    img.pixels.foreach_set(list(rgba) * 64)
    img.filepath_raw, img.file_format = os.path.join(TMP, name + ".png"), "PNG"
    img.save()
    bpy.data.images.remove(img)
    out = bpy.data.images.load(os.path.join(TMP, name + ".png"))
    out.colorspace_settings.name = "Non-Color"
    return out


def link_image(nt, img, socket, through=None):
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    if through is None:
        nt.links.new(tex.outputs["Color"], bsdf.inputs[socket])
    else:
        nt.links.new(tex.outputs["Color"], through.inputs[0])
        nt.links.new(through.outputs[socket[1]], bsdf.inputs[socket[0]])


def first_pixel(path):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"
    px = [round(v, 3) for v in img.pixels[:4]]
    bpy.data.images.remove(img)
    return px


bpy.ops.wm.read_factory_settings(use_empty=True)
nt = crate().data.materials[0]
if nt.node_tree is None:
    nt.use_nodes = True
nt = nt.node_tree
link_image(nt, image("albedo", (0.8, 0.4, 0.2, 1.0)), "Base Color")
sep = nt.nodes.new("ShaderNodeSeparateColor")
mr = image("metal_rough", (1.0, 0.25, 0.75, 1.0))
link_image(nt, mr, ("Roughness", "Green"), through=sep)
nt.links.new(sep.outputs["Blue"], next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED").inputs["Metallic"])
src_glb = os.path.join(TMP, "maps_src.glb")
bxe.export(src_glb, "gltf", ["Crate"])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src_glb)
cases["maps_gltf_import"] = bxe.inspect_scene(["Crate"])["objects"]["Crate"]["maps"]
fbx = os.path.join(TMP, "maps.fbx")
bxe.export(fbx, "unity", ["Crate"])
cases["maps_fbx"] = bxe.round_trip(fbx, ["Crate"], preset="unity")["diffs"]
bxe.export(os.path.join(TMP, "maps.glb"), "godot", ["Crate"])
cases["maps_glb"] = bxe.round_trip(os.path.join(TMP, "maps.glb"), ["Crate"], preset="godot")["diffs"]
unity = bxe.extra_maps(["Crate"], os.path.join(TMP, "maps_unity"), "unity")
roblox = bxe.extra_maps(["Crate"], os.path.join(TMP, "maps_roblox"), "roblox")
cases["extra_maps"] = {os.path.basename(p): first_pixel(p)
                       for r in (unity, roblox) for ps in r["written"].values() for p in ps}
def png_type(path):
    """PNG color type: 0 grayscale (Roblox asks for single-channel maps), 6 RGBA."""
    with open(path, "rb") as f:
        return f.read(26)[25]


cases["extra_maps_png_type"] = {os.path.basename(p): png_type(p)
                                for r in (unity, roblox) for ps in r["written"].values() for p in ps}
# The same maps linked straight to their inputs travel in the FBX.
nt = bpy.data.objects["Crate"].active_material.node_tree
for socket, path in zip(("Metallic", "Roughness"), roblox["written"]["M_Crate"]):
    link_image(nt, bpy.data.images.load(path), socket)
bxe.export(fbx, "unity", ["Crate"])
cases["maps_fbx_direct"] = bxe.round_trip(fbx, ["Crate"], preset="unity")["diffs"]

# ground(): a mirrored, turned, scaled mesh under a moved parent.
bpy.ops.wm.read_factory_settings(use_empty=True)
c = crate()
root = bpy.data.objects.new("Root", None)
bpy.context.scene.collection.objects.link(root)
root.location = (5, 0, 1)
c.parent = root
c.location, c.rotation_euler, c.scale = (1, 2, 3), (0, 0, 0.7), (2, -1, 0.5)
g = bxe.ground(["Crate"], width=0.5)
bpy.context.view_layer.update()
pts = [c.matrix_world @ v.co for v in c.data.vertices]
mid = sum((v.co for v in c.data.vertices), Vector()) / len(c.data.vertices)
cases["ground"] = {
    "result": g, "parent": c.parent.name if c.parent else None,
    "identity": c.matrix_world == c.matrix_world.Identity(4),
    "min_z": round(min(p.z for p in pts), 5),
    "center_xy": [round((min(p[k] for p in pts) + max(p[k] for p in pts)) / 2, 5) for k in (0, 1)],
    "outward": all((f.center - mid).dot(f.normal) > 0 for f in c.data.polygons),
}
scene()
try:
    bxe.ground(["Body"])
    cases["ground_skinned"] = "moved"
except ValueError as exc:
    cases["ground_skinned"] = str(exc)


# A sphere through GLB, split at its UV seams as every glTF import is: its LODs must stay
# closed once welded, and its convex hull must keep to the vertex budget and stay closed.
def open_edges(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    n = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    bm.free()
    return n


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32)
sphere_glb = os.path.join(TMP, "sphere.glb")
bpy.ops.export_scene.gltf(filepath=sphere_glb)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sphere_glb)
s = next(o for o in bpy.data.objects if o.type == "MESH")
cases["seam_split_verts"] = len(s.data.vertices)
r = bxe.lods(s.name, ratios=(0.5, 0.25))
cases["seam_lods"] = {n: open_edges(bpy.data.objects[n]) for n in r["tris"]}
cases["seam_meshes"] = len(bpy.data.meshes)
hull = bxe.collision(s, "unreal")
cases["seam_hull"] = dict(hull, open=open_edges(bpy.data.objects[hull["object"]]))
cases["hull_too_small"] = []
for n in (3, 0):
    try:
        bxe.collision(s, "unreal", max_verts=n)
        cases["hull_too_small"].append("made")
    except ValueError as exc:
        cases["hull_too_small"].append(str(exc))


# A double-sided card (a grid and its reversed copy on the same points): the weld must not fuse
# the two sides, or every LOD loses its back.
def card(bm):
    bmesh.ops.create_grid(bm, x_segments=20, y_segments=20, size=1.0)
    back = bmesh.ops.duplicate(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:])
    bmesh.ops.reverse_faces(bm, faces=[g for g in back["geom"] if isinstance(g, bmesh.types.BMFace)])


bpy.ops.wm.read_factory_settings(use_empty=True)
mesh("Card", card)
r = bxe.lods("Card", ratios=(0.5,))
cases["card_sides"] = {n: [sum(1 for p in bpy.data.objects[n].data.polygons if (p.normal.z > 0) == up)
                           for up in (True, False)] for n in r["tris"]}

# An optional preset setting the running exporter lacks (meshopt before Blender 5.2) is
# skipped and reported. The same name as an override still raises, and so does a missing
# setting outside bxe.OPTIONAL.
bpy.ops.wm.read_factory_settings(use_empty=True)
crate()
bxe.PRESETS["probe"] = (".glb", "export_scene.gltf", dict(bxe._GLB, no_such_setting=True))
try:
    bxe.export(os.path.join(TMP, "probe0.glb"), "probe", ["Crate"])
    cases["probe_required"] = "exported"
except TypeError as exc:
    cases["probe_required"] = str(exc)
bxe.OPTIONAL.add("no_such_setting")
probe = bxe.export(os.path.join(TMP, "probe.glb"), "probe", ["Crate"])
cases["probe"] = {"skipped": probe["skipped_settings"], "bytes": probe["bytes"],
                  "settings": sorted(probe["settings"])}
try:
    bxe.export(os.path.join(TMP, "probe2.glb"), "gltf", ["Crate"], no_such_setting=True)
    cases["probe_override"] = "exported"
except TypeError as exc:
    cases["probe_override"] = str(exc)
bxe.OPTIONAL.discard("no_such_setting")
del bxe.PRESETS["probe"]

with open(OUT, "w") as f:
    json.dump(cases, f, indent=1)
print("EXPORT CASES", len(cases))
