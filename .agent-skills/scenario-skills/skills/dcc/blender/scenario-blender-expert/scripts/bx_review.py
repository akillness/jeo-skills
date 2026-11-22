"""
bx_review: the renders an agent looks at instead of orbiting a viewport.

Experts judge a model by turning it: silhouette first, then big planes under a
matcap, then edge flow in wireframe. This module renders exactly that, headless-safe
(Workbench engine), into one labelled contact sheet the agent opens with its image
reader. It never touches the user's scene settings: objects are linked into a
temporary scene that is removed afterwards.

  import sys; sys.path.append("<skill>/scripts"); import bx_review
  sheet = bx_review.review([obj], "/abs/out/dir")                       # all defaults
  sheet = bx_review.review([obj], out, views=("front", "side"), modes=("silhouette",))
  sheet = bx_review.review([obj], out, culling=True)  # back faces hidden, as engines draw
  bx_review.playblast("/abs/out/shot.mp4")        # scene camera, frame range, Workbench
  bx_review.turntable(obj, "/abs/out/turn.mp4", frames=72)

headless:
  blender --background scene.blend --python bx_review.py -- --objects Head,Eyes --out /abs/dir [--culling 1]

Modes:  silhouette (black on white: reads shape and gesture only)
        matcap     (clay_studio matcap: reads planes and forms)
        wire       (clay + dark wireframe overlay: reads topology; skipped above 250k faces)
        normals    (check_normal+y matcap: reveals shading breaks and flipped normals)
Views:  front, back, left, right, top, threequarter (perspective, 50 mm), and
        low (three-quarter from below, catches jaw/chin and under-plane problems)
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

VIEW_DIRS = {
    "front": Vector((0, -1, 0)),
    "back": Vector((0, 1, 0)),
    "right": Vector((1, 0, 0)),
    "left": Vector((-1, 0, 0)),
    "top": Vector((0, 0, 1)),
    "threequarter": Vector((-0.7, -1.0, 0.35)).normalized(),
    "low": Vector((0.8, -1.0, -0.45)).normalized(),
}
PERSPECTIVE = {"threequarter", "low"}
WIRE_FACE_LIMIT = 250_000


def _world_bbox(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        eo = o.evaluated_get(dg)
        pts += [eo.matrix_world @ Vector(c) for c in eo.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def _look_at(cam, target, direction, dist):
    cam.location = target + direction * dist
    fwd = (target - cam.location).normalized()
    up = Vector((0, 0, 1)) if abs(fwd.z) < 0.99 else Vector((0, 1, 0))
    right = fwd.cross(up).normalized()
    up = right.cross(fwd)
    rot = Matrix((right, up, -fwd)).transposed()
    cam.rotation_euler = rot.to_euler()


def _extent(corners, center, direction):
    """Half-size of the bbox seen from `direction` (square frame) and its half-depth."""
    fwd = -direction
    up = Vector((0, 0, 1)) if abs(fwd.z) < 0.99 else Vector((0, 1, 0))
    right = fwd.cross(up).normalized()
    up = right.cross(fwd)
    rel = [c - center for c in corners]
    half = max(max(abs(r.dot(right)) for r in rel), max(abs(r.dot(up)) for r in rel))
    depth = max(abs(r.dot(fwd)) for r in rel)
    return max(half, 1e-4), depth


def _sample_points(objs, limit=20000):
    """World-space vertex positions of the evaluated objects (subsampled): framing from
    real geometry, because bbox corners overshoot badly in diagonal views."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        if o.type != "MESH":
            continue
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        n = len(me.vertices)
        step = max(1, n // max(1, limit // max(1, len(objs))))
        mw = eo.matrix_world
        pts += [mw @ me.vertices[i].co for i in range(0, n, step)]
        eo.to_mesh_clear()
    return pts


def _persp_distance(points, center, direction, tan_half):
    """Smallest camera distance along `direction` at which every point fits the frame."""
    fwd = -direction
    up = Vector((0, 0, 1)) if abs(fwd.z) < 0.99 else Vector((0, 1, 0))
    right = fwd.cross(up).normalized()
    up = right.cross(fwd)
    need = 0.0
    for p in points:
        r = p - center
        toward_cam = r.dot(direction)
        need = max(need, abs(r.dot(right)) / tan_half + toward_cam,
                   abs(r.dot(up)) / tan_half + toward_cam)
    return max(need, 1e-3)


def _face_count(o):
    return len(o.data.polygons) if o.type == "MESH" else 0


def _setup_scene(objs, res):
    sc = bpy.data.scenes.new("BX_Review")
    for o in objs:
        sc.collection.objects.link(o)
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.media_type = "IMAGE"
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Standard"
    sc.display.shading.show_cavity = False
    world = bpy.data.worlds.new("BX_Review_World")
    sc.world = world
    cam_data = bpy.data.cameras.new("BX_Review_Cam")
    cam = bpy.data.objects.new("BX_Review_Cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam, world


def _cleanup(sc, cam, world):
    cam_data = cam.data
    bpy.data.objects.remove(cam)
    if cam_data.users == 0:
        bpy.data.cameras.remove(cam_data)
    bpy.data.scenes.remove(sc)
    bpy.data.worlds.remove(world)


def _set_mode(sc, world, mode, objs, wires, culling=False):
    sh = sc.display.shading
    sh.show_backface_culling = culling
    for w in wires:
        w.hide_render = mode != "wire"
    if mode == "silhouette":
        sh.light, sh.color_type = "FLAT", "SINGLE"
        sh.single_color = (0.0, 0.0, 0.0)
        world.color = (1.0, 1.0, 1.0)
    elif mode in ("matcap", "normals"):
        sh.light, sh.color_type = "MATCAP", "SINGLE"
        sh.studio_light = "clay_studio.exr" if mode == "matcap" else "check_normal+y.exr"
        sh.single_color = (0.8, 0.8, 0.8)
        world.color = (0.18, 0.18, 0.18)
    elif mode == "wire":
        sh.light, sh.color_type = "STUDIO", "OBJECT"
        sh.studio_light = "Default"
        for o in objs:
            o.color = (0.75, 0.75, 0.75, 1.0)
        for w in wires:
            w.color = (0.02, 0.02, 0.02, 1.0)
        world.color = (0.25, 0.25, 0.25)
    if culling and mode != "silhouette":
        world.color = (1.0, 0.0, 1.0)  # a hole where a face points inward reads at a glance


def _make_wires(sc, objs):
    wires = []
    for o in objs:
        if o.type != "MESH" or _face_count(o) > WIRE_FACE_LIMIT or not o.data.edges:
            continue
        w = bpy.data.objects.new(o.name + "_BXwire", o.data)
        w.matrix_world = o.matrix_world
        # copy deforming/generating modifiers so the cage matches what is rendered
        for m in o.modifiers:
            if m.type in {"MIRROR", "ARMATURE", "SHRINKWRAP"}:
                nm = w.modifiers.new(m.name, m.type)
                for prop in m.bl_rna.properties:
                    if not prop.is_readonly and prop.identifier not in {"name", "type"}:
                        try:
                            setattr(nm, prop.identifier, getattr(m, prop.identifier))
                        except Exception:
                            pass
        verts, edges = o.data.vertices, o.data.edges
        n = min(len(edges), 5000)
        mean = sum((verts[e.vertices[0]].co - verts[e.vertices[1]].co).length
                   for e in list(edges)[:n]) / n * max(o.matrix_world.to_scale())
        wm = w.modifiers.new("BXwire", "WIREFRAME")
        wm.thickness = mean * 0.08
        wm.use_replace = True
        wm.use_even_offset = False
        sc.collection.objects.link(w)
        wires.append(w)
    return wires


def _tile(paths, rows, cols, out, labels):
    """Compose PNGs into one sheet with numpy (Blender ships numpy; no PIL needed)."""
    import numpy as np
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p, check_existing=False)
        w, h = im.size
        a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
        imgs.append(a)
        bpy.data.images.remove(im)
    h, w = imgs[0].shape[:2]
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for i, a in enumerate(imgs):
        r, c = divmod(i, cols)
        # images are stored bottom-up; row 0 goes at the top of the sheet
        y0 = (rows - 1 - r) * h
        sheet[y0:y0 + h, c * w:(c + 1) * w] = a
    out_img = bpy.data.images.new("BX_sheet", cols * w, rows * h, alpha=True)
    out_img.pixels = sheet.ravel()
    out_img.filepath_raw = out
    out_img.file_format = "PNG"
    out_img.save()
    bpy.data.images.remove(out_img)
    with open(os.path.splitext(out)[0] + "_legend.txt", "w") as f:
        f.write("rows x cols (top-left first):\n" + "\n".join(labels))
    return out


def review(objs, out_dir, views=("front", "right", "threequarter", "back"),
           modes=("silhouette", "matcap", "wire"), res=800, margin=1.12, focus=None, culling=False):
    """Render modes x views and return the contact sheet path (rows = modes, cols = views).
    objs: objects or their names.
    culling: hide back faces, as game engines draw them, on a magenta background, so faces
    pointing inward show as holes. Compare with a sheet rendered without it.
    focus: close-up framing instead of the whole object: ((x, y, z), radius) in world
    space, e.g. focus=(eye_center, 0.06) to inspect eye loops. The rest of the mesh stays
    in the render (no cropping, no temporary copies); the camera just frames that sphere."""
    # Names too, as bx_audit takes them: an agent passing the gate's list here hit a TypeError.
    objs = [bpy.data.objects[o] if isinstance(o, str) else o for o in objs if o is not None]
    os.makedirs(out_dir, exist_ok=True)
    sc, cam, world = _setup_scene(objs, res)
    wires = _make_wires(sc, objs) if "wire" in modes else []
    lo, hi = _world_bbox(objs)
    center = (lo + hi) / 2
    corners = _sample_points(objs) or [Vector((x, y, z)) for x in (lo.x, hi.x)
                                       for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    if focus is not None:
        fc, fr = Vector(focus[0]), float(focus[1])
        center = fc
        corners = [fc + Vector(d) * fr for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0),
                                                  (0, -1, 0), (0, 0, 1), (0, 0, -1))]
    paths, labels = [], []
    try:
        for mode in modes:
            if mode == "wire" and not wires:
                continue
            _set_mode(sc, world, mode, objs, wires, culling)
            for view in views:
                d = VIEW_DIRS[view]
                half, depth = _extent(corners, center, d)
                if view in PERSPECTIVE:
                    cam.data.type, cam.data.lens = "PERSP", 50
                    fov = 2 * math.atan(cam.data.sensor_width / (2 * cam.data.lens))
                    dist = _persp_distance(corners, center, d, math.tan(fov / 2) / margin)
                else:
                    cam.data.type = "ORTHO"
                    cam.data.ortho_scale = 2 * half * margin
                    dist = depth * 4 + 1.0
                cam.data.clip_start, cam.data.clip_end = dist * 0.01, dist * 10
                _look_at(cam, center, d, dist)
                p = os.path.join(out_dir, f"{mode}_{view}.png")
                sc.render.filepath = p
                bpy.ops.render.render(write_still=True, scene=sc.name)
                paths.append(p)
                labels.append(f"{mode} / {view}")
        rows = len(paths) // len(views)
        sheet = _tile(paths, rows, len(views), os.path.join(out_dir, "review_sheet.png"), labels)
    finally:
        for w in wires:
            bpy.data.objects.remove(w)
        _cleanup(sc, cam, world)
    return sheet


def playblast(out_path, scene=None, res_pct=50, color_type="MATERIAL"):
    """Workbench movie of the scene camera over the frame range (works headless)."""
    sc = scene or bpy.context.scene
    r = sc.render
    saved = (r.engine, r.filepath, r.resolution_percentage, r.image_settings.media_type,
             sc.display.shading.color_type, sc.view_settings.view_transform)
    try:
        r.engine = "BLENDER_WORKBENCH"
        sc.display.shading.color_type = color_type
        sc.view_settings.view_transform = "Standard"
        r.resolution_percentage = res_pct
        r.image_settings.media_type = "VIDEO"      # 5.x: must precede FFMPEG
        r.image_settings.file_format = "FFMPEG"
        r.ffmpeg.format, r.ffmpeg.codec = "MPEG4", "H264"
        r.filepath = out_path
        bpy.ops.render.render(animation=True, scene=sc.name)
    finally:
        (r.engine, r.filepath, r.resolution_percentage, media,
         sc.display.shading.color_type, sc.view_settings.view_transform) = saved
        r.image_settings.media_type = media
    return out_path


def turntable(obj, out_path, frames=72, res=720, mode="matcap"):
    """360-degree matcap turntable of one object, rendered in a temporary scene."""
    sc, cam, world = _setup_scene([obj], res)
    _set_mode(sc, world, mode, [obj], [])
    lo, hi = _world_bbox([obj])
    center, radius = (lo + hi) / 2, max((hi - lo).length / 2, 1e-3)
    pivot = bpy.data.objects.new("BX_pivot", None)
    sc.collection.objects.link(pivot)
    pivot.location = center
    cam.parent = pivot
    cam.data.type, cam.data.lens = "PERSP", 50
    fov = 2 * math.atan(cam.data.sensor_width / (2 * cam.data.lens))
    dist = radius * 1.2 / math.sin(fov / 2)
    _look_at(cam, Vector((0, 0, 0)), Vector((0, -1, 0.2)).normalized(), dist)
    sc.frame_start, sc.frame_end = 1, frames
    pivot.rotation_euler = (0, 0, 0)
    pivot.keyframe_insert("rotation_euler", index=2, frame=1)
    pivot.rotation_euler = (0, 0, 2 * math.pi * (frames - 1) / frames)
    pivot.keyframe_insert("rotation_euler", index=2, frame=frames)
    for fc in _fcurves(pivot):
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"
    try:
        sc.render.image_settings.media_type = "VIDEO"
        sc.render.image_settings.file_format = "FFMPEG"
        sc.render.ffmpeg.format, sc.render.ffmpeg.codec = "MPEG4", "H264"
        sc.render.filepath = out_path
        bpy.ops.render.render(animation=True, scene=sc.name)
    finally:
        act = pivot.animation_data.action if pivot.animation_data else None
        bpy.data.objects.remove(pivot)
        if act:
            bpy.data.actions.remove(act)
        _cleanup(sc, cam, world)
    return out_path


def _fcurves(obj):
    """F-curves of an object's action on Blender 5.x (slotted actions) and 4.x."""
    ad = obj.animation_data
    if not ad or not ad.action:
        return []
    act = ad.action
    if hasattr(ad, "action_slot") and ad.action_slot is not None and hasattr(act, "layers"):
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(act, ad.action_slot)
        return list(cb.fcurves) if cb else []
    return list(getattr(act, "fcurves", []))


def _cli():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = dict(zip(argv[::2], argv[1::2]))
    objs = [bpy.data.objects[n] for n in args["--objects"].split(",")]
    views = tuple(args.get("--views", "front,right,threequarter,back").split(","))
    modes = tuple(args.get("--modes", "silhouette,matcap,wire").split(","))
    print("SHEET", review(objs, args["--out"], views=views, modes=modes, res=int(args.get("--res", 800)),
                         culling=args.get("--culling", "0") == "1"))


if __name__ == "__main__":
    _cli()
