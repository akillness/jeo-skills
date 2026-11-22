"""Headless Blender pass that turns an AI-generated GLB into a Roblox-ready mesh, and measures it.

Run through rbx_assets.blender_prep(spec) (it checks machine load first), or directly:
    blender -b --factory-startup -P blender_roblox_prep.py -- spec.json

spec keys (all optional except input and out_dir):
    input, out_dir, name                 GLB in, folder out, base name of the outputs
    mode            "inspect" | "prep"    inspect only measures; prep fixes, exports and measures again
    weld            1e-5                  merge distance in source units (glTF splits vertices at UV seams)
    min_island_faces 0                    delete connected pieces with fewer faces (0 keeps all)
    fill_holes      false                 cap open boundaries (watertight); caps get no UVs
    max_tris        20000                 collapse-decimate above this (rigid accessory: 4000)
    yaw             0                     degrees about the up axis, applied before scaling
    scale           {"height": h} | {"max_dim": m} | {"width": w} | {"fit": [x, y, z], "fill": 0.92}
                    | {"opening": w, "band": [lo, hi], "cap": [x, y, z]}: hats; the narrower of the X and Z
                    widths of the vertices between lo and hi (fractions of the height above the bottom)
                    becomes w, so the crown clears the head; "cap" (the live accessory box) wins if smaller
                    sizes are Roblox studs on Roblox axes (Y up); 1 Blender unit = 1 stud
    pivot           "bottom" | "center"   bottom center at the origin (props) or bbox center (accessories)
    textures        {"color": 1024, "normal": 256, "roughness": 256, "metalness": 256} target sides
    opaque_color    false                 force ColorMap alpha to 1 (rigid accessories need opaque maps)
    metal_threshold null                  snap metalness to 0 or 1 at this value (0.5 is a sane default)
    max_hole_sides  64                    fill_holes caps only loops up to this many edges
    payload         true                  write <name>_mesh.json for the EditableMesh preview in Studio
    views           0                     render N Workbench views (front, right, back, top) to PNG

Writes <out_dir>/<name>_report.json: before/after stats, steps, files.
Coordinates: Blender (x, y, z) maps to Roblox (x, z, -y), a proper rotation, so winding is kept.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


def _spec() -> dict:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        raise SystemExit("usage: blender -b --factory-startup -P blender_roblox_prep.py -- spec.json")
    return json.loads(Path(argv[0]).read_text())


def _reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path: str) -> bpy.types.Object:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise SystemExit(f"no mesh in {path}")
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj["source_objects"] = len(meshes)
    return obj


def _components(bm) -> list[int]:
    """Face count per connected piece (faces linked through shared vertices)."""
    parent = list(range(len(bm.verts)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    bm.verts.index_update()
    for e in bm.edges:
        a, b = find(e.verts[0].index), find(e.verts[1].index)
        if a != b:
            parent[a] = b
    sizes: dict[int, int] = {}
    for f in bm.faces:
        r = find(f.verts[0].index)
        sizes[r] = sizes.get(r, 0) + 1
    return sorted(sizes.values(), reverse=True)


def _image_roles(obj) -> dict:
    """Map role -> bpy image by following links from each image node to the BSDF input it feeds."""
    roles: dict = {}
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "TEX_IMAGE" or not node.image:
                continue
            stack, seen = [(node, None)], set()
            while stack:
                n, out_name = stack.pop()
                for out in n.outputs:
                    for link in out.links:
                        to = link.to_node
                        key = (to.name, link.to_socket.name, out.name)
                        if key in seen:
                            continue
                        seen.add(key)
                        sock = link.to_socket.name
                        if to.type == "BSDF_PRINCIPLED":
                            ch = out.name if n.type == "SEPARATE_COLOR" else out_name
                            if sock == "Base Color":
                                roles.setdefault("color", node.image)
                            elif sock == "Metallic":
                                roles.setdefault("metalness_src", (node.image, ch))
                            elif sock == "Roughness":
                                roles.setdefault("roughness_src", (node.image, ch))
                            elif sock.startswith("Emission"):
                                roles.setdefault("emissive", node.image)
                            elif sock == "Alpha":
                                roles.setdefault("alpha", node.image)
                        elif to.type == "NORMAL_MAP":
                            roles.setdefault("normal", node.image)
                        else:
                            stack.append((to, out.name if n.type == "SEPARATE_COLOR" else out_name))
    # glTF packs roughness in G and metalness in B of one image (Separate Color outputs Green, Blue)
    return roles


def stats(obj, weld: float = 1e-5) -> dict:
    me = obj.data
    polys = me.polygons
    tris = sum(len(p.vertices) - 2 for p in polys)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(obj.matrix_world)
    raw_verts = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
    co = np.array([v.co[:] for v in bm.verts]) if bm.verts else np.zeros((1, 3))
    mn, mx = co.min(0), co.max(0)
    dims = mx - mn
    diag = float(np.linalg.norm(dims)) or 1.0
    edges = len(bm.edges)
    boundary = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    nonmanifold = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    wire = sum(1 for e in bm.edges if not e.link_faces)
    loose = sum(1 for v in bm.verts if not v.link_edges)
    zero_area = sum(1 for f in bm.faces if f.calc_area() < (diag * 1e-6) ** 2)
    comps = _components(bm)
    bm.free()
    uv = {"layers": len(me.uv_layers)}
    if me.uv_layers:
        a = np.zeros(len(me.loops) * 2)
        me.uv_layers[0].data.foreach_get("uv", a)
        a = a.reshape(-1, 2)
        uv["outside_01"] = int(((a < -1e-4) | (a > 1 + 1e-4)).any(axis=1).sum())
        uv["loops"] = int(len(a))
    vc = []
    for attr in me.color_attributes:
        n = len(attr.data)
        c = np.zeros(n * 4)
        attr.data.foreach_get("color", c)
        c = c.reshape(-1, 4)
        vc.append({"name": attr.name, "all_white": bool(np.all(c[:, :3] > 0.999)), "min_alpha": float(c[:, 3].min()) if n else 1.0})
    roles = _image_roles(obj)
    imgs = {}
    for role, val in roles.items():
        img = val[0] if isinstance(val, tuple) else val
        imgs[role] = {"name": img.name, "size": list(img.size), "channels": img.channels,
                      "channel": val[1] if isinstance(val, tuple) else None}
    return {
        "objects": int(obj.get("source_objects", 1)),
        "faces": len(polys), "tris": tris,
        "quads": sum(1 for p in polys if len(p.vertices) == 4),
        "ngons": sum(1 for p in polys if len(p.vertices) > 4),
        "verts_raw": raw_verts, "verts_welded": len(co) if raw_verts else 0,
        "edges": edges, "boundary_edges": boundary,
        "boundary_pct": round(100.0 * boundary / edges, 3) if edges else 0.0,
        "nonmanifold_edges": nonmanifold, "wire_edges": wire, "loose_verts": loose,
        "zero_area_faces": zero_area, "components": len(comps), "component_faces": comps[:12],
        # Roblox axes: X = x, Y = z (up), Z = -y
        "dims_studs": [round(float(dims[0]), 4), round(float(dims[2]), 4), round(float(dims[1]), 4)],
        "center": [round(float((mn[0] + mx[0]) / 2), 4), round(float((mn[2] + mx[2]) / 2), 4), round(float(-(mn[1] + mx[1]) / 2), 4)],
        "min_y": round(float(mn[2]), 4),
        "materials": len([s for s in obj.material_slots if s.material]),
        "uv": uv, "vertex_colors": vc, "images": imgs,
        "double_sided_materials": sum(1 for s in obj.material_slots if s.material and not s.material.use_backface_culling),
    }


def _bm_fix(obj, spec: dict, steps: list) -> None:
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=float(spec.get("weld", 1e-5)))
    steps.append({"step": "weld", "merged_verts": n0 - len(bm.verts)})
    loose_v = [v for v in bm.verts if not v.link_faces]
    loose_e = [e for e in bm.edges if not e.link_faces]
    bmesh.ops.delete(bm, geom=loose_e, context="EDGES")
    bmesh.ops.delete(bm, geom=[v for v in loose_v if v.is_valid], context="VERTS")
    diag = max((max(v.co[i] for v in bm.verts) - min(v.co[i] for v in bm.verts)) for i in range(3)) or 1.0
    nf = len(bm.faces)
    bmesh.ops.dissolve_degenerate(bm, dist=diag * 1e-6, edges=bm.edges[:])
    steps.append({"step": "clean", "loose_verts": len(loose_v), "loose_edges": len(loose_e), "degenerate_faces": nf - len(bm.faces)})
    keep = int(spec.get("min_island_faces", 0))
    if keep > 0:
        bm.verts.index_update()
        parent = list(range(len(bm.verts)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for e in bm.edges:
            a, b = find(e.verts[0].index), find(e.verts[1].index)
            if a != b:
                parent[a] = b
        groups: dict = {}
        for f in bm.faces:
            groups.setdefault(find(f.verts[0].index), []).append(f)
        small = [f for g in groups.values() if len(g) < keep for f in g]
        bmesh.ops.delete(bm, geom=small, context="FACES")
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        steps.append({"step": "drop_islands", "below_faces": keep, "faces_removed": len(small),
                      "pieces_removed": sum(1 for g in groups.values() if len(g) < keep)})
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    me.update()


def _boundary_loops(bm) -> list:
    """Ordered vertex lists of simple boundary loops (every vertex on exactly two boundary edges)."""
    adj: dict = {}
    for e in bm.edges:
        if e.is_boundary:
            a, b = e.verts
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)
    loops, seen = [], set()
    for start in adj:
        if start in seen or len(adj[start]) != 2:
            continue
        loop, prev, cur, ok = [start], None, start, True
        seen.add(start)
        while True:
            nxt = [v for v in adj[cur] if v is not prev]
            if len(adj[cur]) != 2 or not nxt:
                ok = False
                break
            prev, cur = cur, nxt[0]
            if cur is start:
                break
            if cur in seen:
                ok = False
                break
            seen.add(cur)
            loop.append(cur)
        if ok and len(loop) >= 3:
            loops.append(loop)
    return loops


def _cap_loops(bm, max_sides: int) -> int:
    new = []
    for loop in _boundary_loops(bm):
        if len(loop) > max_sides:
            continue
        try:
            new.append(bm.faces.new(loop))
        except ValueError:
            pass
    if new:
        bmesh.ops.triangulate(bm, faces=new)
    return len(new)


def _fill_holes(obj, spec: dict, steps: list, label: str = "fill_holes") -> None:
    """Cap pinholes left by AI meshes, then cut out and re-cap any edge shared by 3+ faces.
    bmesh.ops.holes_fill skipped most small loops on test meshes, so each simple loop gets a face."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=float(spec.get("weld_after", 1e-6)))
    before = sum(1 for e in bm.edges if e.is_boundary)
    nm_before = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    max_sides = int(spec.get("max_hole_sides", 64))
    capped = _cap_loops(bm, max_sides)
    cut = 0
    for _ in range(4):
        bad = [e for e in bm.edges if len(e.link_faces) > 2]
        if not bad:
            break
        faces = list({f for e in bad for v in e.verts for f in v.link_faces})
        cut += len(faces)
        bmesh.ops.delete(bm, geom=faces, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        capped += _cap_loops(bm, max_sides)
    lone = [f for f in bm.faces if all(e.is_boundary for e in f.edges)]  # cut-outs can strand single faces
    if lone:
        bmesh.ops.delete(bm, geom=lone, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    after = sum(1 for e in bm.edges if e.is_boundary)
    nm = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    steps.append({"step": label, "boundary_edges": before, "nonmanifold_before": nm_before,
                  "holes_capped": capped, "faces_cut": cut, "lone_faces_removed": len(lone),
                  "boundary_after": after, "nonmanifold_after": nm})


def _decimate(obj, max_tris: int, steps: list) -> None:
    for attempt in range(3):
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        if tris <= max_tris:
            return
        mod = obj.modifiers.new("rbx_decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        ratio = max(0.01, (max_tris * 0.97) / tris)
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        after = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        steps.append({"step": "decimate", "attempt": attempt + 1, "tris_before": tris, "tris_after": after,
                      "ratio": round(ratio, 4)})


def _triangulate(obj, steps: list) -> None:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    n = len(bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(obj.data)
    bm.free()
    steps.append({"step": "triangulate", "faces_before": n, "tris": len(obj.data.polygons)})


def _transform(obj, spec: dict, steps: list) -> None:
    me = obj.data
    yaw = float(spec.get("yaw", 0))
    if yaw:
        me.transform(Matrix.Rotation(math.radians(yaw), 4, "Z"))
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    mn, mx = co.min(0), co.max(0)
    d = mx - mn
    dr = np.array([d[0], d[2], d[1]])  # Roblox X, Y, Z sizes
    sc = spec.get("scale") or {}
    s = 1.0
    if "height" in sc:
        s = sc["height"] / dr[1]
    elif "width" in sc:
        s = sc["width"] / dr[0]
    elif "max_dim" in sc:
        s = sc["max_dim"] / dr.max()
    elif "fit" in sc:
        box = np.array(sc["fit"], dtype=float)
        s = float(sc.get("fill", 0.92)) * float(np.min(box / dr))
    opening = None
    if "opening" in sc:
        lo, hi = sc.get("band", [0.08, 0.2])
        f = (co[:, 2] - mn[2]) / max(d[2], 1e-9)
        band = co[(f >= lo) & (f <= hi)]
        if len(band):
            w = band.max(0) - band.min(0)
            opening = float(min(w[0], w[1]))
            s = float(sc["opening"]) / max(opening, 1e-9)
    capped = False
    if "cap" in sc:
        cap = np.array(sc["cap"], dtype=float)
        if np.any(dr * s > cap):
            s, capped = float(np.min(cap / dr)), True
    pivot = spec.get("pivot", "bottom")
    c = (mn + mx) / 2
    t = Matrix.Translation((-c[0], -c[1], -mn[2] if pivot == "bottom" else -c[2]))
    me.transform(Matrix.Scale(s, 4) @ t)
    me.update()
    steps.append({"step": "transform", "yaw": yaw, "scale": round(float(s), 6), "pivot": pivot,
                  "dims_before": [round(float(x), 4) for x in dr], "dims_after": [round(float(x * s), 4) for x in dr],
                  **({"opening_before": round(opening, 4), "opening_after": round(opening * s, 4)} if opening else {}),
                  **({"capped": True} if capped else {})})


def _strip_vertex_colors(obj, steps: list) -> None:
    names = [a.name for a in obj.data.color_attributes]
    for n in names:
        obj.data.color_attributes.remove(obj.data.color_attributes[n])
    steps.append({"step": "vertex_colors_removed", "names": names})


def _pixels(img) -> np.ndarray:
    a = np.zeros(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def _save(arr: np.ndarray, path: Path, side: int) -> dict:
    h, w = arr.shape[:2]
    img = bpy.data.images.new(path.stem, w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    if side and (w != side or h != side):
        img.scale(side, side)
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    out = {"path": str(path), "size": list(img.size)}
    bpy.data.images.remove(img)
    return out


def _set_pixels(img, px: np.ndarray, side: int) -> None:
    """Write pixels back to the source image and resize it, so the exported GLB carries the fixed map."""
    img.pixels.foreach_set(px.astype(np.float32).ravel())
    if side and tuple(img.size) != (side, side):
        img.scale(side, side)
    img.update()


def _textures(obj, spec: dict, out_dir: Path, name: str, steps: list) -> dict:
    sides = spec.get("textures") or {}
    roles = _image_roles(obj)
    files: dict = {}
    info: dict = {}
    if "color" in roles:
        px = _pixels(roles["color"])
        info["color_alpha_min"] = float(px[..., 3].min())
        if spec.get("opaque_color"):
            px[..., 3] = 1.0
        side = int(sides.get("color", 1024))
        files["color"] = _save(px, out_dir / f"{name}_color.png", side)
        _set_pixels(roles["color"], px, side)
    mr_img, mr_px = None, None
    for role, ch in (("roughness", 1), ("metalness", 2)):
        src = roles.get(f"{role}_src")
        if not src:
            continue
        img, channel = src
        if mr_img is not img:
            mr_img, mr_px = img, _pixels(img)
        idx = {"Red": 0, "Green": 1, "Blue": 2}.get(channel or "", ch)
        g = mr_px[..., idx]
        info[f"{role}_channel"] = channel
        info[f"{role}_mean"] = round(float(g.mean()), 4)
        if role == "metalness":
            # Roblox docs: metalness is 0 or 1 for most materials; in-between reads as a tinted coating
            info["metal_partial_fraction"] = round(float(((g > 0.1) & (g < 0.9)).mean()), 4)
            thr = spec.get("metal_threshold")
            if thr is not None:
                g[...] = (g >= float(thr)).astype(np.float32)
                info["metal_threshold"] = float(thr)
                info["metal_fraction_after"] = round(float(g.mean()), 4)
        gray = np.stack([g, g, g, np.ones_like(g)], axis=-1)
        files[role] = _save(gray, out_dir / f"{name}_{role}.png", int(sides.get(role, 256)))
    if mr_img is not None:
        _set_pixels(mr_img, mr_px, max(int(sides.get("roughness", 256)), int(sides.get("metalness", 256))))
    if "normal" in roles:
        px = _pixels(roles["normal"])
        info["normal_mean_rgb"] = [round(float(px[..., i].mean()), 3) for i in range(3)]
        side = int(sides.get("normal", 256))
        files["normal"] = _save(px, out_dir / f"{name}_normal.png", side)
        _set_pixels(roles["normal"], px, side)
    if "emissive" in roles:
        info["emissive_present"] = True
    steps.append({"step": "textures", **info})
    return files


def _mesh_payload(obj, path: Path) -> dict:
    """Unique positions plus per-corner UVs, in Roblox axes, for EditableMesh in Studio."""
    me = obj.data
    me.calc_loop_triangles()
    n = len(me.vertices)
    co = np.zeros(n * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    pos = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)
    lt = me.loop_triangles
    tri_v = np.zeros(len(lt) * 3, dtype=np.int64)
    tri_l = np.zeros(len(lt) * 3, dtype=np.int64)
    lt.foreach_get("vertices", tri_v)
    lt.foreach_get("loops", tri_l)
    uvs, uv_idx = np.zeros((0, 2)), np.zeros(len(tri_l), dtype=np.int64)
    if me.uv_layers:
        a = np.zeros(len(me.loops) * 2)
        me.uv_layers[0].data.foreach_get("uv", a)
        a = a.reshape(-1, 2)[tri_l]
        a[:, 1] = 1.0 - a[:, 1]  # Blender V points up; image rows (and Roblox UVs) start at the top
        a = np.round(a, 5)
        uvs, uv_idx = np.unique(a, axis=0, return_inverse=True)
    data = {
        "p": [round(float(x), 5) for x in pos.ravel()],
        "uv": [round(float(x), 5) for x in uvs.ravel()],
        "t": [int(x) for x in tri_v],
        "tu": [int(x) for x in uv_idx.ravel()],
        "size": [round(float(x), 5) for x in (pos.max(0) - pos.min(0))],
    }
    path.write_text(json.dumps(data, separators=(",", ":")))
    return {"path": str(path), "verts": n, "tris": len(lt), "uvs": int(len(uvs)), "bytes": path.stat().st_size}


def _render_views(obj, out_dir: Path, name: str, count: int) -> list:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = scene.render.resolution_y = 400
    scene.render.film_transparent = False
    scene.world = scene.world or bpy.data.worlds.new("w")
    co = np.zeros(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    c = (co.min(0) + co.max(0)) / 2
    r = float(np.linalg.norm(co.max(0) - co.min(0))) or 1.0
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = r * 1.1
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # Roblox front (-Z, the LookVector side) is Blender +Y; the camera sits on that side to see the front
    dirs = [("front", (0, 1, 0)), ("right", (1, 0, 0)), ("back", (0, -1, 0)), ("top", (0, 0, 1))][:count]
    out = []
    for label, d in dirs:
        v = np.array(d, dtype=float)
        cam.location = tuple(c + v * r * 2)
        if label == "top":
            cam.rotation_euler = (0.0, 0.0, math.pi)  # looking down, Roblox front at the bottom of the image
        else:
            cam.rotation_euler = Vector(tuple(-v)).to_track_quat("-Z", "Y").to_euler()
        p = out_dir / f"{name}_view_{label}.png"
        scene.render.filepath = str(p)
        bpy.ops.render.render(write_still=True)
        out.append(str(p))
    return out


def run(spec: dict) -> dict:
    _reset()
    out_dir = Path(spec["out_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    name = spec.get("name") or Path(spec["input"]).stem
    obj = import_glb(spec["input"])
    weld = float(spec.get("weld", 1e-5))
    report: dict = {"input": spec["input"], "name": name, "mode": spec.get("mode", "inspect"),
                    "before": stats(obj, weld), "steps": [], "files": {}}
    if report["mode"] == "prep":
        steps = report["steps"]
        _bm_fix(obj, spec, steps)
        if spec.get("fill_holes"):
            _fill_holes(obj, spec, steps)  # source loops are simple; decimation can make them complex
        _decimate(obj, int(spec.get("max_tris", 20000)), steps)
        _triangulate(obj, steps)
        if spec.get("fill_holes"):
            _fill_holes(obj, spec, steps, "repair_after_decimate")  # collapse can leave 3-face edges
        _transform(obj, spec, steps)
        _strip_vertex_colors(obj, steps)
        for slot in obj.material_slots:
            if slot.material:
                slot.material.use_backface_culling = True  # glTF doubleSided off: Roblox renders one side
        report["files"].update(_textures(obj, spec, out_dir, name, steps))
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        glb = out_dir / f"{name}_roblox.glb"
        bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                                  export_apply=True, export_yup=True, export_animations=False,
                                  export_skins=False, export_morph=False, export_vertex_color="NONE",
                                  export_cameras=False, export_lights=False)
        report["files"]["glb"] = {"path": str(glb), "bytes": glb.stat().st_size}
        report["after"] = stats(obj, weld)
        if spec.get("payload", True):
            report["files"]["payload"] = _mesh_payload(obj, out_dir / f"{name}_mesh.json")
    if int(spec.get("views", 0)):
        report["files"]["views"] = _render_views(obj, out_dir, name, int(spec["views"]))
    (out_dir / f"{name}_report.json").write_text(json.dumps(report, indent=1))
    print("RBX_PREP_REPORT " + str(out_dir / f"{name}_report.json"))
    return report


if __name__ == "__main__":
    run(_spec())
