"""
bx_export: engine-ready exports from Blender 5.2, checked by re-importing them.

  import sys; sys.path.append("<skills>/scenario-blender-export/scripts"); import bx_export as bxe

  bxe.ground(["Crate"], width=0.9)                                # base center at the origin, real size
  bxe.export("/abs/out/Crate.fbx", "unity", objects=["Crate"])   # preset, then operator overrides
  bxe.round_trip("/abs/out/Crate.fbx", objects=["Crate"])         # re-import in a background Blender
  bxe.extra_maps(["Crate"], "/abs/out", "unity")                  # metallic/roughness maps an FBX drops
  bxe.glb_summary("/abs/out/crate.glb")                           # no Blender needed
  bxe.lods("Crate", ratios=(0.5, 0.25))                           # Crate_LOD0..2 under an empty
  bxe.collision("Crate", "unreal")                                # UCX_Crate_00; "godot": Crate-convcolonly

  # headless
  blender -b scene.blend --factory-startup --python-exit-code 1 -P bx_export.py -- \
          --preset godot --out /abs/crate.glb [--objects A B]
  blender -b --factory-startup --python-exit-code 1 -P bx_export.py -- \
          --batch /abs/in /abs/out --preset godot [--profile game]
  blender -b --factory-startup --python-exit-code 1 -P bx_export.py -- --inspect /abs/crate.glb

Every preset was exported and re-imported in Blender 5.2.1 by the family's live suite
(tests/scenario-blender-expert/test_live_export.py in the skills repository). Before Blender
5.2, export() skips the web preset's meshopt option and lists it in skipped_settings.
"""

import json
import os
import struct
import subprocess
import sys
import tempfile

try:
    import bpy
    from mathutils import Matrix, Vector
except ImportError:  # glb_summary() runs in plain Python
    bpy = None

HERE = os.path.dirname(os.path.abspath(__file__))
SKILLS = os.path.dirname(os.path.dirname(HERE))

_FBX = dict(use_selection=True, apply_unit_scale=True, use_mesh_modifiers=True,
            mesh_smooth_type="FACE", add_leaf_bones=False, path_mode="COPY", embed_textures=True,
            axis_forward="-Z", axis_up="Y")
_FBX_RIG = dict(object_types={"ARMATURE", "MESH"}, use_armature_deform_only=True, bake_anim=True,
                bake_anim_use_all_actions=True, bake_anim_use_nla_strips=False)
_GLB = dict(export_format="GLB", use_selection=True, export_yup=True, export_apply=True)

# preset: (extension, exporter operator, keyword arguments)
PRESETS = {
    # Unity 6.3, measured: a static mesh imports at scale 1, rotation 0.
    "unity": (".fbx", "export_scene.fbx", dict(
        _FBX, apply_scale_options="FBX_SCALE_ALL", bake_space_transform=True,
        object_types={"MESH", "EMPTY"}, bake_anim=False)),
    # Measured: scale 1, faces +Z, the armature node keeps a 270 degree X rotation.
    # bake_space_transform (documented as broken with armatures) does not remove it, and
    # Unity's Bake Axis Conversion turns the character to face -Z: leave both off.
    "unity_skeletal": (".fbx", "export_scene.fbx", dict(
        **_FBX, **_FBX_RIG, apply_scale_options="FBX_SCALE_ALL")),
    "unreal": (".fbx", "export_scene.fbx", dict(
        _FBX, apply_scale_options="FBX_SCALE_NONE", object_types={"MESH", "EMPTY"}, bake_anim=False)),
    "unreal_skeletal": (".fbx", "export_scene.fbx", dict(
        **_FBX, **_FBX_RIG, apply_scale_options="FBX_SCALE_NONE")),
    # Roblox Creator Hub export requirements: FBX Unit Scale, Copy + embed textures, no leaf bones.
    "roblox": (".fbx", "export_scene.fbx", dict(
        _FBX, apply_scale_options="FBX_SCALE_UNITS", object_types={"ARMATURE", "MESH"},
        use_armature_deform_only=True, bake_anim=False)),
    "godot": (".glb", "export_scene.gltf", dict(_GLB)),
    "gltf": (".glb", "export_scene.gltf", dict(_GLB)),
    # three.js reads EXT_meshopt_compression through MeshoptDecoder and WebP natively.
    "web": (".glb", "export_scene.gltf", dict(
        _GLB, export_image_format="WEBP", export_meshopt_compression_enable=True)),
    "usd": (".usdc", "wm.usd_export", dict(selected_objects_only=True)),
    "usdz": (".usdz", "wm.usd_export", dict(selected_objects_only=True, usdz_downscale_size="2048")),
    # STL has no unit and slicers read millimeters: 1 Blender meter becomes 1000.
    "print": (".stl", "wm.stl_export", dict(export_selected_objects=True, apply_modifiers=True,
                                             global_scale=1000.0)),
}
# Which presets carry armatures, actions, shape keys and image maps through the file.
CARRIES = {
    "unity": {"maps"}, "unreal": {"maps"}, "roblox": {"armature", "shape_keys", "maps"}, "print": set(),
    "unity_skeletal": {"armature", "actions", "shape_keys", "maps"},
    "unreal_skeletal": {"armature", "actions", "shape_keys", "maps"},
    "godot": {"armature", "actions", "shape_keys", "maps"},
    "gltf": {"armature", "actions", "shape_keys", "maps"},
    "web": {"armature", "actions", "shape_keys", "maps"}, "usd": {"shape_keys"}, "usdz": {"shape_keys"},
}
# Principled BSDF inputs whose image maps inspect_scene() lists and compare() checks.
MAP_INPUTS = ("Base Color", "Metallic", "Roughness", "Normal", "Emission Color")
# Presets that rescale on the way out: STL in millimeters.
SCALE = {"print": 1000.0}
# Preset settings an older exporter may lack, skipped there and reported. The glTF exporter
# gained meshopt in Blender 5.2. Any other missing setting raises: it can change the file.
OPTIONAL = {"export_meshopt_compression_enable"}
IMPORTERS = {
    ".glb": "import_scene.gltf", ".gltf": "import_scene.gltf", ".fbx": "import_scene.fbx",
    ".obj": "wm.obj_import", ".stl": "wm.stl_import", ".ply": "wm.ply_import",
    ".usd": "wm.usd_import", ".usda": "wm.usd_import", ".usdc": "wm.usd_import", ".usdz": "wm.usd_import",
}


def _op(path):
    module, name = path.split(".")
    return getattr(getattr(bpy.ops, module), name)


def _objects(objects):
    if objects is None:
        return [o for o in bpy.context.scene.objects if o.visible_get()]
    return [bpy.data.objects[o] if isinstance(o, str) else o for o in objects]


IMAGE_EXT = {"JPEG": ".jpg", "PNG": ".png", "TARGA": ".tga", "TARGA_RAW": ".tga", "TIFF": ".tif",
             "WEBP": ".webp", "BMP": ".bmp", "OPEN_EXR": ".exr", "HDR": ".hdr"}


def _name_packed_images():
    """glTF imports pack images with no path, named like "Image_0", and the FBX exporter
    names embedded media after them. Unity's Extract Textures then writes files without an
    extension and never imports them, so the model stays untextured. Returns what to restore."""
    named = []
    for img in bpy.data.images:
        if img.packed_file is not None and not os.path.splitext(img.filepath or img.name)[1]:
            named.append((img, img.filepath_raw))
            img.filepath_raw = ("//textures/" + bpy.path.clean_name(img.name)
                                + IMAGE_EXT.get(img.file_format, ".png"))
    return named


def _image_nodes(tree, seen):
    for n in tree.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            yield n
        elif n.type == "GROUP" and n.node_tree and n.node_tree not in seen:
            seen.add(n.node_tree)
            yield from _image_nodes(n.node_tree, seen)


def _pack_unsaved_images(objs, tmp):
    """The FBX exporter embeds a file's bytes, so an image made in Blender and never saved
    (GENERATED, a new bake target) or edited since (is_dirty) is missing or stale in the file,
    and pack() leaves a GENERATED image unpacked (Blender 5.2.1). Swaps in a packed copy of the
    current pixels under the same name; returns what to restore."""
    swaps, copies, seen = [], {}, set()
    mats = {s.material for o in objs if o.type == "MESH" for s in o.material_slots if s.material}
    for mat in mats:
        if not mat.node_tree:
            continue
        for n in _image_nodes(mat.node_tree, seen):
            img = n.image
            if img.packed_file is not None or not (img.source == "GENERATED" or img.is_dirty):
                continue
            if img not in copies:
                w, h = img.size
                px = [0.0] * (w * h * 4)
                img.pixels.foreach_get(px)
                name = img.name
                img.name = name + ".bx_original"
                cp = bpy.data.images.new(name, w, h, alpha=True)
                cp.pixels.foreach_set(px)
                cp.colorspace_settings.name = img.colorspace_settings.name
                cp.alpha_mode = img.alpha_mode
                cp.filepath_raw = os.path.join(tmp, bpy.path.clean_name(name) + ".png")
                cp.file_format = "PNG"
                cp.save()
                cp.pack()
                copies[img] = cp
            swaps.append((n, img))
            n.image = copies[img]
    return swaps, copies


def _fed_by_image(sock):
    stack, seen = [lk.from_node for lk in sock.links], set()
    while stack:
        n = stack.pop()
        if n in seen:
            continue
        seen.add(n)
        if n.type == "TEX_IMAGE" and n.image:
            return True
        if n.type == "GROUP" and n.node_tree and next(_image_nodes(n.node_tree, set()), None):
            return True
        stack.extend(lk.from_node for i in n.inputs for lk in i.links)
    return False


def _principled(mat):
    tree = mat.node_tree if mat else None
    return next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if tree else None


def _maps(obj):
    """{material: the MAP_INPUTS an image feeds, directly or through other nodes}."""
    out = {}
    for s in obj.material_slots:
        bsdf = _principled(s.material)
        if bsdf:
            out[s.material.name] = [k for k in MAP_INPUTS if k in bsdf.inputs and _fed_by_image(bsdf.inputs[k])]
    return out


def export(path, preset, objects=None, **overrides):
    """Export `objects` (default: every visible object) with a preset. Children and the
    armature of a skinned mesh are not added for you: pass them. Returns a dict."""
    ext, op, kw = PRESETS[preset]
    if not path.lower().endswith(ext):
        raise ValueError(f"preset {preset!r} writes {ext} files")
    objs = _objects(objects)
    view = bpy.context.view_layer
    # An object removed after a render stays in view.objects as None until the next
    # update (Blender 5.2.1), and select_get() on it raises.
    view.update()
    keep = ([o for o in view.objects if o.select_get()], view.objects.active)
    for o in view.objects:
        o.select_set(o in objs)
    view.objects.active = objs[0] if objs else None
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    args = dict(kw, **overrides)
    # An override is passed as given, so a misspelled one still raises.
    known = _op(op).get_rna_type().properties.keys()
    skipped = sorted(k for k in kw if k in OPTIONAL and k not in known and k not in overrides)
    for k in skipped:
        del args[k]
    embed = ext == ".fbx" and args.get("embed_textures")
    tmp = tempfile.TemporaryDirectory() if embed else None
    swaps, copies = _pack_unsaved_images(objs, tmp.name) if embed else ([], {})
    named = _name_packed_images() if embed else []
    try:
        _op(op)(filepath=path, **args)
    finally:
        for img, old in named:
            img.filepath_raw = old
        for n, img in swaps:
            n.image = img
        for img, cp in copies.items():
            name = cp.name
            bpy.data.images.remove(cp)
            img.name = name
        if tmp:
            tmp.cleanup()
        for o in view.objects:
            o.select_set(o in keep[0])
        view.objects.active = keep[1]
    return {"path": path, "preset": preset, "bytes": os.path.getsize(path),
            "objects": [o.name for o in objs],
            "packed_unsaved_images": sorted(img.name for img in copies),
            "skipped_settings": skipped, "blender": bpy.app.version_string,
            "settings": {k: sorted(v) if isinstance(v, set) else v for k, v in args.items()}}


def inspect_scene(objects=None, all_actions=False):
    """What an engine would receive, measured in Blender: world size, scale, triangles,
    shape keys, image maps per material, bones and actions per object. all_actions: with
    `objects`, also count the actions stored for them (a slot named for the object), which FBX
    bake_anim_use_all_actions and the glTF exporter write as clips."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    objs = _objects(objects)
    if objects is None:
        actions = {a.name for a in bpy.data.actions}
    else:  # only what these objects play: their action, NLA strips and shape-key action
        actions = set()
        for o in objs:
            for ad in (o.animation_data, getattr(getattr(o.data, "shape_keys", None), "animation_data", None)):
                if ad:
                    actions |= {ad.action.name} if ad.action else set()
                    actions |= {s.action.name for t in ad.nla_tracks for s in t.strips if s.action}
        if all_actions:
            ids = {"OB" + o.name for o in objs}
            ids |= {"KE" + o.data.shape_keys.name for o in objs
                    if o.type == "MESH" and o.data.shape_keys}
            actions |= {a.name for a in bpy.data.actions
                        if any(s.identifier in ids for s in getattr(a, "slots", ()))}
    out = {"objects": {}, "actions": sorted(actions)}
    for o in objs:
        info = {"type": o.type, "scale": [round(s, 4) for s in o.matrix_world.to_scale()]}
        if o.type == "MESH":
            pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
            info["size"] = [round(max(p[k] for p in pts) - min(p[k] for p in pts), 4) for k in range(3)]
            me = o.evaluated_get(dg).to_mesh()
            info["tris"] = sum(len(p.vertices) - 2 for p in me.polygons)
            o.evaluated_get(dg).to_mesh_clear()
            keys = o.data.shape_keys
            info["shape_keys"] = [k.name for k in keys.key_blocks[1:]] if keys else []
            info["maps"] = _maps(o)
        elif o.type == "ARMATURE":
            info["bones"] = len(o.data.bones)
            info["deform_bones"] = sum(b.use_deform for b in o.data.bones)
            info["roots"] = [b.name for b in o.data.bones if b.parent is None]
        out["objects"][o.name] = info
    return out


def inspect_file(path):
    """Import a file into an empty scene and measure it (runs inside Blender)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _op(IMPORTERS[os.path.splitext(path)[1].lower()])(filepath=path)
    r = inspect_scene()
    r["file"], r["bytes"] = path, os.path.getsize(path)
    return r


def compare(before, after, carries=("armature", "actions", "shape_keys"), tol=0.001, scale=1.0,
            deform_only=False, clip_names=True):
    """Differences between two inspections, matched by object name. Empty when they agree.
    scale: what the preset multiplies sizes by (SCALE), so a millimeter STL compares clean.
    deform_only: the export left non-deforming bones out (use_armature_deform_only).
    clip_names: match clips by name; False when the FBX holds one take named for the scene."""
    diffs = []
    ab = after["objects"]
    for name, b in before["objects"].items():
        if b["type"] not in ("MESH", "ARMATURE") or (b["type"] == "ARMATURE" and "armature" not in carries):
            continue
        a = ab.get(name) or next((v for k, v in ab.items() if k.split(".")[0] == name and v["type"] == b["type"]), None)
        meshes = [v for v in ab.values() if v["type"] == "MESH"]
        if a is None and b["type"] == "MESH" and len(meshes) == 1 and \
                sum(v["type"] == "MESH" for v in before["objects"].values()) == 1:
            a = meshes[0]  # STL and OBJ importers name the object after the file
        if a is None:
            diffs.append(f"{name}: missing after the round trip")
            continue
        if b["type"] == "MESH":
            if any(abs(x * scale - y) > tol * scale for x, y in zip(sorted(b["size"]), sorted(a["size"]))):
                diffs.append(f"{name}: size {b['size']} became {a['size']}")
            if b["tris"] != a["tris"]:
                diffs.append(f"{name}: {b['tris']} triangles became {a['tris']}")
            if "shape_keys" in carries and set(b["shape_keys"]) - set(a["shape_keys"]):
                diffs.append(f"{name}: lost shape keys {sorted(set(b['shape_keys']) - set(a['shape_keys']))}")
            am = a.get("maps", {})
            for mat, socks in b.get("maps", {}).items() if "maps" in carries else ():
                got = am.get(mat) or next((v for k, v in am.items() if k.split(".")[0] == mat), [])
                lost = [k for k in socks if k not in got]
                if lost:
                    diffs.append(f"{name}: material {mat} lost its {', '.join(lost)} map{'s' * (len(lost) > 1)}")
        else:
            want = b.get("deform_bones", b["bones"]) if deform_only else b["bones"]
            if a["bones"] != want:
                diffs.append(f"{name}: {want} bones became {a['bones']}")
            if len(a.get("roots", ())) > 1:
                diffs.append(f"{name}: {len(a['roots'])} root bones {a['roots']}, engines want one")
            if any(abs(s - 1.0) > 1e-3 for s in a["scale"]):
                diffs.append(f"{name}: armature scale {a['scale']} after the round trip")
    if "actions" in carries and clip_names:
        # Importers rename clips (FBX: "Rig|Rig|Walk"), so match the source name inside.
        lost = [n for n in before["actions"] if not any(n in m for m in after["actions"])]
        if lost:
            diffs.append(f"actions lost: {lost}")
    elif "actions" in carries and len(after["actions"]) < len(before["actions"]):
        diffs.append(f"actions: {len(before['actions'])} became {len(after['actions'])}")
    return diffs


def round_trip(path, objects=None, preset=None, **overrides):
    """Re-import an exported file in a background Blender (the open scene is untouched)
    and compare it with `objects` in this scene. overrides: the ones given to export(), so
    bake_anim=True on roblox also compares actions. Returns {"pass", "diffs", "before", "after"}."""
    carries = set(CARRIES.get(preset, ("armature", "actions", "shape_keys")))
    if overrides.get("bake_anim"):
        carries.add("actions")
    args = dict(PRESETS[preset][2], **overrides) if preset else dict(overrides)
    all_actions = args.get("bake_anim_use_all_actions", True)
    before = inspect_scene(objects, all_actions=all_actions)
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "inspect.json")
        run = subprocess.run([bpy.app.binary_path, "-b", "--factory-startup", "--python-exit-code", "1",
                              "-P", os.path.abspath(__file__), "--", "--inspect", path, "--json", out],
                             capture_output=True, text=True, timeout=600)
        if run.returncode != 0:
            raise RuntimeError(run.stdout[-2000:] + run.stderr[-2000:])
        with open(out) as f:
            after = json.load(f)
    diffs = compare(before, after, carries, scale=SCALE.get(preset, 1.0),
                    deform_only=args.get("use_armature_deform_only", False), clip_names=all_actions)
    return {"pass": not diffs, "diffs": diffs, "before": before, "after": after}


def glb_summary(path):
    """Read a .glb's JSON chunk: extensions, meshes, triangles, morph targets, skins,
    animations and image types. Plain Python, so it also runs outside Blender."""
    with open(path, "rb") as f:
        data = f.read()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError("not a glTF 2.0 binary")
    size, kind = struct.unpack_from("<I4s", data, 12)
    if kind != b"JSON":
        raise ValueError("first GLB chunk is not JSON")
    g = json.loads(data[20:20 + size])
    acc = g.get("accessors", [])
    tris, morphs = 0, {}
    for m in g.get("meshes", []):
        for p in m.get("primitives", []):
            if p.get("mode", 4) != 4:
                continue
            idx = p.get("indices")
            n = acc[idx]["count"] if idx is not None else acc[p["attributes"]["POSITION"]]["count"]
            tris += n // 3
        names = m.get("extras", {}).get("targetNames")
        if names:
            morphs[m.get("name", "")] = names
    return {
        "bytes": len(data),
        "extensions_used": g.get("extensionsUsed", []),
        "extensions_required": g.get("extensionsRequired", []),
        "nodes": len(g.get("nodes", [])), "meshes": len(g.get("meshes", [])), "triangles": tris,
        "morph_targets": morphs,
        "skins": [len(s.get("joints", [])) for s in g.get("skins", [])],
        "animations": [a.get("name", "") for a in g.get("animations", [])],
        "materials": len(g.get("materials", [])),
        "images": [i.get("mimeType", os.path.splitext(i.get("uri", ""))[1]) for i in g.get("images", [])],
    }


def ground(objects=None, height=None, width=None):
    """Bake each mesh's transform into its data, then move the meshes together so the center
    of their base sits at the origin, scaled to a real size: height (Z) or width (the longer
    horizontal side), in meters. Each mesh comes out unparented with an identity transform:
    the engine imports scale 1 with the pivot on the floor. Static meshes only."""
    if height and width:
        raise ValueError("give height or width, not both")
    objs = [o for o in _objects(objects) if o.type == "MESH"]
    for o in objs:
        if o.parent_type == "ARMATURE" or any(m.type == "ARMATURE" for m in o.modifiers):
            raise ValueError(f"{o.name} is skinned: ground() would move it off its armature")
    bpy.context.view_layer.update()
    worlds = {o: o.matrix_world.copy() for o in objs}
    for o, w in worlds.items():
        if o.data.users > 1:
            o.data = o.data.copy()
        o.parent = None
        o.data.transform(w, shape_keys=True)
        if w.determinant() < 0:  # a mirrored object: transform() keeps the winding
            o.data.flip_normals()
        o.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    pts = [Vector(c) for o in objs for c in o.bound_box]
    lo = Vector([min(p[k] for p in pts) for k in range(3)])
    hi = Vector([max(p[k] for p in pts) for k in range(3)])
    size = hi - lo
    s = height / size.z if height else width / max(size.x, size.y) if width else 1.0
    m = Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)))
    for o in objs:
        o.data.transform(m, shape_keys=True)
    bpy.context.view_layer.update()
    return {"objects": [o.name for o in objs], "scale": round(s, 6), "size": [round(v * s, 4) for v in size]}


def _source(sock):
    """What feeds a Principled input: kind "const" (value), "image" (image, channel, factor), or
    "node" (type) for anything extra_maps() cannot read, such as a ramp or a math chain."""
    factor = 1.0
    while sock.is_linked:
        lk = sock.links[0]
        n = lk.from_node
        if n.type == "TEX_IMAGE" and n.image:
            return {"kind": "image", "image": n.image, "channel": 3 if lk.from_socket.name == "Alpha" else 0,
                    "factor": factor}
        if n.type == "SEPARATE_COLOR" and n.mode == "RGB" and n.inputs[0].is_linked:
            up = n.inputs[0].links[0].from_node
            if up.type == "TEX_IMAGE" and up.image:
                return {"kind": "image", "image": up.image,
                        "channel": ("Red", "Green", "Blue").index(lk.from_socket.name), "factor": factor}
        if n.type == "MATH" and n.operation == "MULTIPLY" and n.inputs[0].is_linked != n.inputs[1].is_linked:
            sock, const = (n.inputs[0], n.inputs[1]) if n.inputs[0].is_linked else (n.inputs[1], n.inputs[0])
            factor *= const.default_value
            continue
        return {"kind": "node", "type": n.type}
    return {"kind": "const", "value": sock.default_value}


def _plane(src, w, h, np):
    if src["kind"] == "const":
        return np.full(w * h, src["value"], np.float32)
    img, tmp = src["image"], None
    if tuple(img.size) != (w, h):
        img = tmp = img.copy()
        img.scale(w, h)
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    if tmp:
        bpy.data.images.remove(tmp)
    return np.clip(px[src["channel"]::4] * src["factor"], 0.0, 1.0)


def _write_png(path, w, h, planes, np):
    """8-bit PNG of the raw values, no color management: one plane is grayscale, four RGBA."""
    import zlib
    px = np.stack(planes, axis=1).reshape(h, w, len(planes))[::-1]  # Blender rows run bottom up
    px = np.round(np.clip(px, 0.0, 1.0) * 255).astype(np.uint8)
    raw = b"".join(b"\x00" + row.tobytes() for row in px)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    head = struct.pack(">IIBBBBB", w, h, 8, 0 if len(planes) == 1 else 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw, 6))
                + chunk(b"IEND", b""))
    return path


def extra_maps(objects, out_dir, engine="unity"):
    """Metallic and roughness as files to assign in the engine. An FBX keeps those maps only
    when an image links straight to the input, and a glTF import routes one packed image
    through Separate Color, so the FBX loses them. engine "unity":
    <material>_MetallicSmoothness.png, metallic in RGB and smoothness (1 - roughness) in alpha.
    Any other engine: <material>_Metallic.png and <material>_Roughness.png, 8-bit grayscale.
    Values are written raw (linear). Returns {"written": {material: [paths]}, "skipped": {material: reason}}."""
    import numpy as np
    os.makedirs(out_dir, exist_ok=True)
    out = {"written": {}, "skipped": {}}
    mats = {s.material for o in _objects(objects) if o.type == "MESH" for s in o.material_slots if s.material}
    for mat in sorted(mats, key=lambda m: m.name):
        bsdf = _principled(mat)
        if bsdf is None:
            out["skipped"][mat.name] = "no Principled BSDF"
            continue
        src = {k: _source(bsdf.inputs[k]) for k in ("Metallic", "Roughness")}
        odd = [f"{k} comes through a {s['type']} node" for k, s in src.items() if s["kind"] == "node"]
        if odd:
            out["skipped"][mat.name] = "; ".join(odd) + ": bake it to an image first"
            continue
        if all(s["kind"] == "const" for s in src.values()):
            out["skipped"][mat.name] = "no image map: type the values into the engine material"
            continue
        w, h = max((tuple(s["image"].size) for s in src.values() if s["kind"] == "image"),
                   key=lambda wh: wh[0] * wh[1])
        metal, rough = _plane(src["Metallic"], w, h, np), _plane(src["Roughness"], w, h, np)
        stem = os.path.join(out_dir, bpy.path.clean_name(mat.name))
        if engine == "unity":
            paths = [_write_png(stem + "_MetallicSmoothness.png", w, h, (metal, metal, metal, 1.0 - rough), np)]
        else:
            paths = [_write_png(stem + "_Metallic.png", w, h, (metal,), np),
                     _write_png(stem + "_Roughness.png", w, h, (rough,), np)]
        out["written"][mat.name] = paths
    return out


def lods(obj, ratios=(0.5, 0.25)):
    """Decimated copies named for Unity's LOD import (Name_LOD0 is the original), grouped
    under an empty called Name that takes the mesh's place under its parent. Static meshes
    only. Godot builds LODs at import. The group exports as a plain FBX Null (no LodGroup), and
    Unreal's "Import LODs" on it is unmeasured. The copies are decimated from a welded mesh."""
    import bmesh
    obj = bpy.data.objects[obj] if isinstance(obj, str) else obj
    if obj.parent_type == "ARMATURE" or any(m.type == "ARMATURE" for m in obj.modifiers):
        raise ValueError(f"{obj.name} is skinned: lods() makes static copies, which would lose the skinning")
    name, col = obj.name, obj.users_collection[0]
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    # The group takes the mesh's place in the hierarchy; the mesh keeps its world placement.
    group = bpy.data.objects.new(name + "_LODGroup", None)
    col.objects.link(group)
    group.parent, group.parent_type = obj.parent, obj.parent_type
    if obj.parent_type == "BONE":
        group.parent_bone = obj.parent_bone
    group.matrix_world = world
    bpy.context.view_layer.update()
    obj.name = f"{name}_LOD0"
    obj.parent = group
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_world = world
    group.name = name
    out = {obj.name: sum(len(p.vertices) - 2 for p in obj.data.polygons)}
    # A glTF import splits vertices at every UV seam, and Decimate opens those splits into
    # cracks. Only open-border vertices are welded (a millionth of the bounds' diagonal), so the
    # two sides of a double-sided card stay apart; the UVs stay per corner.
    welded = obj.data.copy()
    bm = bmesh.new()
    bm.from_mesh(welded)
    diag = (Vector(obj.bound_box[6]) - Vector(obj.bound_box[0])).length or 1.0
    bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if v.is_boundary], dist=diag * 1e-6)
    bm.to_mesh(welded)
    bm.free()
    try:
        for i, r in enumerate(ratios, 1):
            tmp = obj.copy()
            tmp.data = welded
            col.objects.link(tmp)
            try:
                mod = tmp.modifiers.new("lod", "DECIMATE")
                mod.ratio = r
                bpy.context.view_layer.update()
                me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
            finally:
                bpy.data.objects.remove(tmp)
            lod = bpy.data.objects.new(f"{name}_LOD{i}", me)
            col.objects.link(lod)
            lod.parent, lod.matrix_world = group, world
            out[lod.name] = sum(len(p.vertices) - 2 for p in me.polygons)
    finally:
        bpy.data.meshes.remove(welded)
    return {"group": group.name, "tris": out}


def collision(obj, engine, shape="convex", max_verts=64):
    """A collision mesh named for the engine's importer: Unreal UCX_ (convex) or UBX_ (box);
    Godot -convcolonly (convex, or the bounding box for "box": Godot 4.7 builds one convex
    shape from its 8 corners) or -colonly ("mesh": a trimesh, static bodies only). Unity and
    Roblox set colliders in the editor: None. A convex hull keeps at most `max_verts` of its
    vertices, spread over the shape: this toolkit's budget, not an engine limit. None keeps them
    all, and a dense full hull can come out with open edges."""
    import bmesh
    if max_verts is not None and max_verts < 4:
        raise ValueError("max_verts must be at least 4 (a closed hull), or None")
    obj = bpy.data.objects[obj] if isinstance(obj, str) else obj
    names = {("unreal", "convex"): f"UCX_{obj.name}_00", ("unreal", "box"): f"UBX_{obj.name}_00",
             ("godot", "convex"): f"{obj.name}-convcolonly", ("godot", "box"): f"{obj.name}-convcolonly",
             ("godot", "mesh"): f"{obj.name}-colonly"}
    if (engine, shape) not in names:
        return None
    bm = bmesh.new()
    bm.from_object(obj, bpy.context.evaluated_depsgraph_get())
    if shape == "box":
        lo = [min(v.co[k] for v in bm.verts) for k in range(3)]
        hi = [max(v.co[k] for v in bm.verts) for k in range(3)]
        bm.clear()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector([(lo[k] + hi[k]) / 2 + v.co[k] * (hi[k] - lo[k]) for k in range(3)])
    elif shape == "convex":
        hull = bmesh.ops.convex_hull(bm, input=bm.verts[:])
        bmesh.ops.delete(bm, geom=list(set(hull["geom_interior"]) | set(hull["geom_unused"])), context="VERTS")
        if max_verts is not None and len(bm.verts) > max_verts:
            # A dense mesh hulls into thousands of faces. Keep the hull vertices farthest from
            # those already kept, then hull them again: still convex, inside the full hull.
            pts = [v.co.copy() for v in bm.verts]
            keep = [max(range(len(pts)), key=lambda i: pts[i].x)]
            dist = [(p - pts[keep[0]]).length for p in pts]
            while len(keep) < max_verts:
                i = max(range(len(pts)), key=dist.__getitem__)
                keep.append(i)
                dist = [min(d, (p - pts[i]).length) for d, p in zip(dist, pts)]
            bm.clear()
            for i in keep:
                bm.verts.new(pts[i])
            hull = bmesh.ops.convex_hull(bm, input=bm.verts[:])
            bmesh.ops.delete(bm, geom=list(set(hull["geom_interior"]) | set(hull["geom_unused"])),
                             context="VERTS")
    me = bpy.data.meshes.new(names[(engine, shape)])
    bm.to_mesh(me)
    bm.free()
    col = bpy.data.objects.new(me.name, me)
    obj.users_collection[0].objects.link(col)
    col.matrix_world = obj.matrix_world.copy()
    col.display_type = "WIRE"
    return {"object": col.name, "faces": len(me.polygons), "verts": len(me.vertices)}


def batch(src, dst, preset, profile="game", gate=True):
    """Every model file in `src`: import, run the delivery gate, export with `preset`,
    re-import and compare. Writes dst/report.json and returns it. Headless only."""
    if gate:
        sys.path.append(os.path.join(SKILLS, "scenario-blender-expert", "scripts"))
        import bx_audit
    ext = PRESETS[preset][0]
    os.makedirs(dst, exist_ok=True)
    report = {"preset": preset, "profile": profile, "files": {}}
    models = [fn for fn in sorted(os.listdir(src)) if os.path.splitext(fn)[1].lower() in IMPORTERS]
    stems = [os.path.splitext(fn)[0] for fn in models]
    for fn in models:
        stem, e = os.path.splitext(fn)
        # hero.fbx and hero.glb would both write hero<ext>: keep the source format in the name.
        name = stem + ext if stems.count(stem) == 1 else f"{stem}_{e[1:].lower()}{ext}"
        r = report["files"][fn] = {"out": name}
        try:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            _op(IMPORTERS[e.lower()])(filepath=os.path.join(src, fn))
            meshes = [o.name for o in bpy.context.scene.objects if o.type == "MESH"]
            if gate and meshes:
                g = bx_audit.deliverable(meshes, profile=profile)
                r["gate"] = {"pass": g["pass"], "errors": g["errors"], "warnings": len(g["warnings"])}
            before = inspect_scene()
            out = os.path.join(dst, name)
            ex = export(out, preset)
            r["export"] = ex["bytes"]
            if ex["skipped_settings"]:
                r["skipped_settings"] = ex["skipped_settings"]
            r["diffs"] = compare(before, inspect_file(out), CARRIES[preset], scale=SCALE.get(preset, 1.0),
                                 deform_only=PRESETS[preset][2].get("use_armature_deform_only", False))
        except Exception as exc:  # one bad file must not stop the folder
            r["failed"] = f"{type(exc).__name__}: {exc}"
    with open(os.path.join(dst, "report.json"), "w") as f:
        json.dump(report, f, indent=1)
    return report


def _cli():
    import argparse
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="bx_export.py")
    ap.add_argument("--preset", choices=sorted(PRESETS))
    ap.add_argument("--out", help="export the scene (or --objects) to this file")
    ap.add_argument("--objects", nargs="+")
    ap.add_argument("--batch", nargs=2, metavar=("SRC", "DST"), help="convert every model in SRC")
    ap.add_argument("--profile", default="game", help="delivery-gate profile for --batch")
    ap.add_argument("--inspect", help="import a file into an empty scene and measure it")
    ap.add_argument("--json", help="also write the result here")
    a = ap.parse_args(argv)
    if a.inspect:
        r = inspect_file(a.inspect)
    elif a.batch:
        r = batch(a.batch[0], a.batch[1], a.preset, profile=a.profile)
    else:
        r = export(a.out, a.preset, a.objects)
    text = json.dumps(r, indent=1)
    if a.json:
        with open(a.json, "w") as f:
            f.write(text)
    print(text)


if __name__ == "__main__":
    _cli()
