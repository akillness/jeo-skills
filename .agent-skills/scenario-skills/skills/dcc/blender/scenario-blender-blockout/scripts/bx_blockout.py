"""
bx_blockout: build and audit helpers for a camera-locked blockout whose playblast
guides a render-to-real video pass.

Runs inside Blender: in the user's session through the Scenario Blender Plugin's
execute_python, or in a headless helper on a saved copy. Each call is sized for one
live tool call on a blockout scene (a few hundred objects, a few hundred frames).
Every builder is get-or-create by name, so a call can run again after a timeout, and
reuses only datablocks it made itself: a name already taken by the user's own work
raises instead of being rebuilt.
Audits return plain dicts and lists for the agent to read; nothing here renders.

  import sys; sys.path.insert(0, "<absolute path of this skill>/scripts")
  for m in ("bx_blockout", "bx_kits"): sys.modules.pop(m, None)  # Blender keeps old imports
  import bx_blockout as B
  B.guard(expected_file="/abs/shot.blend", scene="BLK_plaza")   # first line of every call
  B.lock_format(fps=24, seconds=8)                              # 1..192, 1920x1080 at 100 %
  hero = B.proxy_figure("red_walker", 1.75, (0, 0, 0), facing_deg=90, rgb=B.PALETTE["red"])
  rig = B.rail_camera("s1", [(-6, -4, 1.5), (0, -4.2, 1.5), (6, -4, 1.5)],
                      follow=hero, target_offset=(0, 0, 1.2), lens=35)
  B.key_rail(rig["dolly"], [(1, 0.0), (200, 1.0)])               # last key past the end
  B.bind_cuts([(1, rig["camera"])])
  B.audit_framing({"CAM_s1": [hero]})                            # [] means every sample passed
  B.cut_list()                                                   # rows for the hand-off sheet

Conventions: meters, Z up, ground at z = 0, figures face local -Y, cameras use a
36 mm sensor width. Identity colors go on both the object color (Solid shading,
color type Object, which the plugin's own Blockout also uses) and a material
(color type Material, Workbench renders), so either view shows a one-color proxy.
A bx_kits kit carries several colors on one object and shows them only in Material.
"""

import math
import os
import tempfile

import bmesh
import bpy
from bpy_extras import anim_utils
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

# One saturated color per character or tracked element. A hero takes the color the brief puts
# on them, red when it names none.
PALETTE = {
    "red": (0.80, 0.05, 0.05),
    "blue": (0.05, 0.18, 0.85),
    "green": (0.05, 0.60, 0.12),
    "yellow": (0.90, 0.72, 0.04),
    "purple": (0.50, 0.07, 0.78),
    "cyan": (0.04, 0.75, 0.80),
}
NEUTRAL = (0.42, 0.42, 0.42)  # environment grays sit between 0.32 and 0.55
SENSOR_W = 36.0
TAG = "bx_blockout"  # custom property on every datablock this module creates


def _own(found, make):
    """Get-or-create guard: return `found` when this module made it, else `make()` tagged.
    Datablock names are global to the file, so a set beside the user's own work can
    collide with it; rebuilding their object, collection or material would edit it."""
    if found is None:
        found = make()
        found[TAG] = True
    elif not found.get(TAG):
        raise ValueError(f"{found.name!r} already exists in this file and was not made by bx_blockout: choose another name")
    return found


# -- scene hygiene -----------------------------------------------------------------------


def guard(expected_file=None, scene=None):
    """Refuse to run in the wrong file or scene. Queued calls land in whatever file is
    open, so every build call starts with this. Returns the scene it checked."""
    if expected_file is not None and os.path.abspath(bpy.data.filepath or "") != os.path.abspath(expected_file):
        raise RuntimeError(f"open file is {bpy.data.filepath or '(unsaved)'!r}, expected {expected_file!r}")
    sc = bpy.context.scene
    if scene is not None and sc.name != scene:
        raise RuntimeError(f"active scene is {sc.name!r}, expected {scene!r}")
    return sc


def make_scene(name):
    """Get or create an empty scene and show it in every window, so the plugin's tools
    (which read the window's scene) see the build. Other scenes stay untouched."""
    sc = _own(bpy.data.scenes.get(name), lambda: bpy.data.scenes.new(name))
    for window in bpy.context.window_manager.windows:
        window.scene = sc
    return sc.name


def collection(name, parent=None, scene=None):
    """Get or create a collection linked under `parent` (default: the scene root)."""
    sc = scene or bpy.context.scene
    coll = _own(bpy.data.collections.get(name), lambda: bpy.data.collections.new(name))
    parent_coll = bpy.data.collections[parent] if parent else sc.collection
    if coll.name not in parent_coll.children:
        parent_coll.children.link(coll)
    return coll


def park(names, scene=None):
    """Move objects of this scene (the default Cube, Light, Camera) into a hidden ZZ_parked
    collection instead of deleting them. Objects outside the scene, and their links in
    other scenes' collections, are left alone. Returns the names parked."""
    sc = scene or bpy.context.scene
    parked = collection("ZZ_parked", scene=sc)
    parked.hide_viewport = parked.hide_render = True
    own = [sc.collection] + list(sc.collection.children_recursive)
    done = []
    for name in names:
        obj = sc.objects.get(name)
        if obj is None:
            continue
        for owner in own:
            if owner is not parked and obj.name in owner.objects:
                owner.objects.unlink(obj)
        if obj.name not in parked.objects:
            parked.objects.link(obj)
        done.append(obj.name)
    return done


def stage_backup(label, folder=None):
    """Write a copy of the open file (save_as_mainfile with copy=True): the open file, its
    path and its unsaved state stay as they were. Default folder: blockout_backups beside
    the .blend, or in the system temp folder for an unsaved file. Returns path and size."""
    stem = os.path.splitext(os.path.basename(bpy.data.filepath))[0] if bpy.data.filepath else "unsaved"
    if folder is None:
        base = os.path.dirname(bpy.data.filepath) if bpy.data.filepath else tempfile.gettempdir()
        folder = os.path.join(base, "blockout_backups")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{stem}_{label}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=path, copy=True)
    return {"path": path, "bytes": os.path.getsize(path)}


# -- format ------------------------------------------------------------------------------


def frame_range_for(fps, seconds):
    """(frame_start, frame_end) for a clip of exactly `seconds` at integer `fps`."""
    if int(fps) != fps or fps <= 0:
        raise ValueError("fps must be a positive integer")
    frames = fps * seconds
    if abs(frames - round(frames)) > 1e-6:
        raise ValueError(f"{seconds} s at {fps} fps is not a whole number of frames")
    return 1, int(round(frames))


def lock_format(fps=24, seconds=8, resolution=(1920, 1080), scene=None):
    """Set integer fps, frame range 1..fps*seconds and the resolution at 100 %, before any
    geometry. Returns what was set."""
    sc = scene or bpy.context.scene
    start, end = frame_range_for(fps, seconds)
    sc.render.fps, sc.render.fps_base = int(fps), 1.0
    sc.frame_start, sc.frame_end = start, end
    sc.render.resolution_x, sc.render.resolution_y = resolution
    sc.render.resolution_percentage = 100
    sc["bx_resolution"] = list(resolution)  # audit_frames checks against it
    return {"fps": int(fps), "frame_range": [start, end], "resolution": list(resolution)}


# -- color -------------------------------------------------------------------------------


def material_name_for(rgb):
    """One shared material per color: MAT_cc0d0d for (0.8, 0.05, 0.05)."""
    return "MAT_" + "".join(f"{round(c * 255):02x}" for c in rgb)


def identity_material(name, rgb):
    """Get or create a material whose Principled Base Color and viewport diffuse_color are
    both `rgb`. A 5.x material starts with a Principled BSDF (use_nodes is deprecated and
    left alone); nodes are found by type, since node names are translated in some UIs."""
    mat = _own(bpy.data.materials.get(name), lambda: bpy.data.materials.new(name))
    mat.diffuse_color = (*rgb, 1.0)
    for node in mat.node_tree.nodes if mat.node_tree else []:
        if node.type == "BSDF_PRINCIPLED":
            node.inputs["Base Color"].default_value = (*rgb, 1.0)
    return mat


def paint(obj, rgb, material_name=None):
    """Give an object its identity color on the object color and, for a mesh, on its
    material (shared per color unless `material_name` is given)."""
    obj.color = (*rgb, 1.0)
    if obj.type == "MESH":
        mat = identity_material(material_name or material_name_for(rgb), rgb)
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    return obj


def solid_view(color_type="MATERIAL"):
    """Every 3D viewport to Solid shading with the given color type. The plugin's Render
    Video capture keeps the viewport's shading, so set this before it captures. Material
    is the default because a kit carries several colors on one object; Object shows one.
    GUI only; returns how many viewports changed."""
    count = 0
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                shading = area.spaces.active.shading
                shading.type, shading.color_type = "SOLID", color_type
                count += 1
    return count


# -- geometry ----------------------------------------------------------------------------


def box(name, size, location, rgb=NEUTRAL, coll=None, parent=None, material_name=None):
    """Get or create a box mesh of `size` (x, y, z meters) centered on `location`, with an
    unscaled object, so dimensions and ground contact read true. With `parent`, the
    location is local to the parent (identity parent inverse). Returns the object."""
    obj = bpy.data.objects.get(name)
    if obj is not None:
        _own(obj, None)
        if obj.type != "MESH":
            raise ValueError(f"{name!r} exists and is a {obj.type}, not a mesh")
    mesh = obj.data if obj is not None else bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    if obj is None:
        obj = _own(None, lambda: bpy.data.objects.new(name, mesh))
        (coll or bpy.context.scene.collection).objects.link(obj)
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    return paint(obj, rgb, material_name)


# Part boxes as fractions of the figure height: (size x, y, z), center (x, y, z).
# Parts overlap slightly so nothing floats: a head above a gap reads as a separate object.
_FIGURE_PARTS = {
    "leg_L": ((0.080, 0.090, 0.480), (0.050, 0.0, 0.240)),
    "leg_R": ((0.080, 0.090, 0.480), (-0.050, 0.0, 0.240)),
    "foot_L": ((0.075, 0.150, 0.045), (0.050, -0.050, 0.0225)),
    "foot_R": ((0.075, 0.150, 0.045), (-0.050, -0.050, 0.0225)),
    "pelvis": ((0.200, 0.110, 0.090), (0.0, 0.0, 0.500)),
    "torso": ((0.220, 0.120, 0.340), (0.0, 0.0, 0.700)),
    "head": ((0.120, 0.130, 0.140), (0.0, 0.0, 0.930)),
    "arm_L": ((0.065, 0.080, 0.370), (0.140, 0.0, 0.680)),
    "arm_R": ((0.065, 0.080, 0.370), (-0.140, 0.0, 0.680)),
}


def proxy_figure(name, height=1.75, location=(0.0, 0.0, 0.0), facing_deg=0.0, rgb=PALETTE["red"], coll=None):
    """Connected box figure: root empty FIG_<name> at the feet (z = 0) and nine touching
    parts (legs, feet, pelvis, torso, head, arms). The feet point along local -Y, so the
    facing reads in silhouette. facing_deg is the yaw: 0 faces -Y, 90 faces +X.
    Animate only the root for travel, facing and pose beats. Its parts share one material,
    MAT_FIG_<name>, so the figure can be recolored alone. Returns the root name."""
    root_name = f"FIG_{name}"
    existing = bpy.data.objects.get(root_name)
    root = _own(existing, lambda: bpy.data.objects.new(root_name, None))
    if existing is None:
        root.empty_display_type, root.empty_display_size = "PLAIN_AXES", height * 0.3
        (coll or bpy.context.scene.collection).objects.link(root)
    for part, (size, center) in _FIGURE_PARTS.items():
        box(
            f"{root_name}_{part}",
            [height * s for s in size],
            [height * c for c in center],
            rgb=rgb,
            coll=coll,
            parent=root,
            material_name=f"MAT_{root_name}",  # recolor one figure without touching others
        )
    root.location = location
    root.rotation_euler = (0.0, 0.0, math.radians(facing_deg))
    root["height"] = height
    return root.name


# -- cameras -----------------------------------------------------------------------------


def lens_for_coverage(distance_m, vertical_coverage_m, aspect=16 / 9, sensor_width=SENSOR_W, lo=14.0, hi=85.0):
    """Focal length (mm) that shows `vertical_coverage_m` of height at `distance_m`, for a
    landscape frame with the sensor fitted on its width, clamped to lo..hi."""
    sensor_height = sensor_width / aspect
    return max(lo, min(hi, sensor_height * distance_m / vertical_coverage_m))


def _empty(name, location, coll, display="PLAIN_AXES", size=0.2):
    existing = bpy.data.objects.get(name)
    obj = _own(existing, lambda: bpy.data.objects.new(name, None))
    if existing is None:
        obj.empty_display_type, obj.empty_display_size = display, size
        coll.objects.link(obj)
    obj.location = location
    return obj


def _constraint(obj, kind, name):
    con = obj.constraints.get(name)
    if con is None:
        con = obj.constraints.new(kind)
        con.name = name  # fixed name: data paths and later edits refer to it
    return con


def rail_camera(shot, points, target=(0.0, 0.0, 1.0), follow=None, target_offset=(0.0, 0.0, 0.0), lens=35.0, cyclic=False, clip_start=0.05, coll=None):
    """Rail rig for one shot: CRV_<shot> (smooth Bezier through `points`) > RIG_dolly_<shot>
    (Follow Path at a fixed position, driven by offset_factor 0..1) > RIG_aim_<shot>
    (Track To NULL_target_<shot>) > CAM_<shot>. The camera never rotates on its own:
    reframe by moving the target. With `follow` (an object name), the target is parented
    to that object at `target_offset` (local), so the aim rides the subject.
    Returns the object names."""
    sc = bpy.context.scene
    coll = coll or sc.collection
    curve_name = f"CRV_{shot}"
    crv = bpy.data.objects.get(curve_name)
    if crv is not None:
        _own(crv, None)
    data = crv.data if crv is not None else bpy.data.curves.new(curve_name, "CURVE")
    data.dimensions, data.use_path = "3D", True
    data.splines.clear()
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.handle_left_type = point.handle_right_type = "AUTO"
        point.co = co
    spline.use_cyclic_u = cyclic
    if crv is None:
        crv = _own(None, lambda: bpy.data.objects.new(curve_name, data))
        coll.objects.link(crv)

    tgt = _empty(f"NULL_target_{shot}", target, coll, "SPHERE", 0.1)
    if follow:
        tgt.parent = bpy.data.objects[follow]
        tgt.matrix_parent_inverse = Matrix.Identity(4)
        tgt.location = target_offset

    dolly = _empty(f"RIG_dolly_{shot}", (0.0, 0.0, 0.0), coll, "CUBE", 0.1)
    path = _constraint(dolly, "FOLLOW_PATH", "Follow Path")
    path.target, path.use_fixed_location, path.use_curve_follow = crv, True, False

    aim = _empty(f"RIG_aim_{shot}", (0.0, 0.0, 0.0), coll, "SINGLE_ARROW", 0.25)
    aim.parent, aim.matrix_parent_inverse = dolly, Matrix.Identity(4)
    track = _constraint(aim, "TRACK_TO", "Track To")
    track.target, track.track_axis, track.up_axis = tgt, "TRACK_NEGATIVE_Z", "UP_Y"

    cam_name = f"CAM_{shot}"
    existing = bpy.data.objects.get(cam_name)
    cam = _own(existing, lambda: bpy.data.objects.new(cam_name, bpy.data.cameras.new(cam_name)))
    if existing is None:
        coll.objects.link(cam)
    cam.data.lens, cam.data.sensor_width = lens, SENSOR_W
    cam.data.clip_start, cam.data.clip_end = clip_start, 500.0
    cam.parent, cam.matrix_parent_inverse = aim, Matrix.Identity(4)
    cam.location, cam.rotation_euler = (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)
    return {"curve": crv.name, "target": tgt.name, "dolly": dolly.name, "aim": aim.name, "camera": cam.name}


def fcurves(idb):
    """F-curves of a datablock's action on Blender 5.x slotted actions and 4.x."""
    ad = getattr(idb, "animation_data", None)
    if not ad or not ad.action:
        return []
    act = ad.action
    if getattr(ad, "action_slot", None) is not None and hasattr(act, "layers"):
        bag = anim_utils.action_get_channelbag_for_slot(act, ad.action_slot)
        return list(bag.fcurves) if bag else []
    return list(getattr(act, "fcurves", []))


def smooth_keys(idb, data_path=None):
    """Bezier interpolation with auto-clamped handles on every key (or one data path):
    flat at the first and last key, so moves ease in and out without overshoot."""
    count = 0
    for fc in fcurves(idb):
        if data_path is not None and fc.data_path != data_path:
            continue
        for key in fc.keyframe_points:
            key.interpolation = "BEZIER"
            key.handle_left_type = key.handle_right_type = "AUTO_CLAMPED"
            count += 1
        fc.update()
    return count


def key_rail(dolly, keys):
    """Key a dolly's Follow Path offset_factor from (frame, value 0..1) pairs, replacing its
    old keys, then smooth them. Speed is key spacing; a pause is two near-equal values.
    Put the last key past the shot's last frame so the move never stops on the cut."""
    obj = bpy.data.objects[dolly]
    con = obj.constraints["Follow Path"]
    data_path = 'constraints["Follow Path"].offset_factor'
    for fc in fcurves(obj):
        if fc.data_path == data_path:
            for frame in sorted({round(k.co.x) for k in fc.keyframe_points}, reverse=True):
                obj.keyframe_delete(data_path=data_path, frame=frame)
    for frame, value in keys:
        con.offset_factor = value
        obj.keyframe_insert(data_path=data_path, frame=frame)
    return smooth_keys(obj, data_path)


def bind_cuts(cuts, scene=None):
    """One timeline marker per shot, CUT_<camera> at its first frame, bound to that camera;
    replaces earlier CUT_ markers only. `cuts` is [(frame, camera_name), ...]. Sets the
    scene camera to the first shot's. Returns the markers as (name, frame, camera)."""
    sc = scene or bpy.context.scene
    for marker in list(sc.timeline_markers):
        if marker.name.startswith("CUT_"):
            sc.timeline_markers.remove(marker)
    ordered = sorted(cuts)
    for frame, cam in ordered:
        marker = sc.timeline_markers.new(f"CUT_{cam}", frame=frame)
        marker.camera = bpy.data.objects[cam]
    if ordered:
        sc.camera = bpy.data.objects[ordered[0][1]]
    markers = sorted(sc.timeline_markers, key=lambda m: m.frame)
    return [(m.name, m.frame, m.camera.name if m.camera else None) for m in markers]


# -- reading the timeline ----------------------------------------------------------------


def shots_from_markers(markers, frame_start, frame_end, fps):
    """Pure helper: shot rows from (frame, camera) pairs. Each shot runs from its marker to
    the frame before the next one; times are seconds from the start of the clip."""
    rows, ordered = [], sorted((f, c) for f, c in markers if frame_start <= f <= frame_end)
    if not ordered or ordered[0][0] != frame_start:
        raise ValueError("the first bound marker must sit on frame_start")
    for i, (start, cam) in enumerate(ordered):
        end = ordered[i + 1][0] - 1 if i + 1 < len(ordered) else frame_end
        rows.append(
            {
                "shot": i + 1,
                "camera": cam,
                "frames": [start, end],
                "start_s": round((start - frame_start) / fps, 3),
                "end_s": round((end - frame_start + 1) / fps, 3),
                "duration_s": round((end - start + 1) / fps, 3),
            }
        )
    return rows


def _bound_markers(sc):
    return [(m.frame, m.camera.name) for m in sc.timeline_markers if m.camera is not None]


def _shots(sc):
    fps = sc.render.fps / (sc.render.fps_base or 1.0)
    if not _bound_markers(sc) and sc.camera is None:
        raise RuntimeError("no bound markers and no scene camera")
    markers = _bound_markers(sc) or [(sc.frame_start, sc.camera.name)]
    return shots_from_markers(markers, sc.frame_start, sc.frame_end, fps)


def _camera(sc):
    """The scene camera as evaluated at the current frame (constraints and parents applied)."""
    return sc.camera.evaluated_get(bpy.context.evaluated_depsgraph_get())


def cut_list(scene=None):
    """Shot rows read off the built timeline (camera, frames, exact times, lens at the first
    and last frame) for the hand-off sheet. Without bound markers, one shot on the scene
    camera."""
    sc = scene or bpy.context.scene
    rows, current = _shots(sc), sc.frame_current
    for row in rows:
        lenses = []
        for frame in row["frames"]:
            sc.frame_set(frame)
            cam = bpy.data.objects[row["camera"]].evaluated_get(bpy.context.evaluated_depsgraph_get())
            lenses.append(round(cam.data.lens, 2))
        row["lens_mm"] = lenses
    sc.frame_set(current)
    return rows


def _frames(sc, frames, step):
    return list(frames) if frames is not None else list(range(sc.frame_start, sc.frame_end + 1, step))


def _meshes(name):
    """The mesh objects of a name: the object itself and its mesh descendants."""
    obj = bpy.data.objects[name]
    found = [obj] if obj.type == "MESH" else []
    return found + [c for c in obj.children_recursive if c.type == "MESH"]


def _world_box(objs, depsgraph):
    lo, hi = [math.inf] * 3, [-math.inf] * 3
    for obj in objs:
        ev = obj.evaluated_get(depsgraph)
        for corner in ev.bound_box:
            p = ev.matrix_world @ Vector(corner)
            lo = [min(a, b) for a, b in zip(lo, p)]
            hi = [max(a, b) for a, b in zip(hi, p)]
    return Vector(lo), Vector(hi)


# -- audits ------------------------------------------------------------------------------


def audit_frames(seconds, fps=None, scene=None, resolution=None):
    """Frame math: integer fps, (end - start + 1) / fps equals the brief's seconds, frame 1
    start, resolution at 100 % and at the size lock_format set (1920x1080 when it never
    ran, or `resolution`). Returns a list of problems ([] passes)."""
    sc = scene or bpy.context.scene
    problems = []
    real_fps = sc.render.fps / (sc.render.fps_base or 1.0)
    if sc.render.fps_base != 1.0:
        problems.append(f"fps_base is {sc.render.fps_base}, expected 1.0")
    if fps is not None and real_fps != fps:
        problems.append(f"fps is {real_fps}, expected {fps}")
    length = (sc.frame_end - sc.frame_start + 1) / real_fps
    if abs(length - seconds) > 1e-6:
        problems.append(f"range {sc.frame_start}..{sc.frame_end} lasts {length:.3f} s, expected {seconds}")
    if sc.frame_start != 1:
        problems.append(f"frame_start is {sc.frame_start}, expected 1")
    if sc.render.resolution_percentage != 100:
        problems.append(f"resolution_percentage is {sc.render.resolution_percentage}")
    expected = list(resolution or sc.get("bx_resolution", (1920, 1080)))
    actual = [sc.render.resolution_x, sc.render.resolution_y]
    if actual != expected:
        problems.append(f"resolution is {actual[0]}x{actual[1]}, expected {expected[0]}x{expected[1]}")
    return problems


def audit_cuts(scene=None, max_lens_step_mm=0.5, jump_factor=5.0, min_jump_m=0.05, same_lens_across_cuts=False):
    """Cut discipline, sampled on every frame. Checks: every marker is bound to a camera;
    the active camera changes exactly on each cut frame (f-1 / f / f+1); the lens never
    steps inside a shot, including its first and last frame (a one-frame lens pop at a
    cut); camera position steps stay move-sized (a step over jump_factor x the shot's
    median and over min_jump_m reads as a cut). With same_lens_across_cuts, the lens on
    both sides of every cut must also match, for briefs that want one lens throughout.
    The thresholds are defaults to judge against, not laws.
    Returns {"shots": rows, "problems": [...]}."""
    sc = scene or bpy.context.scene
    problems = [f"marker {m.name!r} at {m.frame} has no camera" for m in sc.timeline_markers if m.camera is None]
    rows, current = _shots(sc), sc.frame_current
    for row in rows[1:]:
        cut = row["frames"][0]
        seen = []
        for frame in (cut - 1, cut, cut + 1):
            sc.frame_set(frame)
            seen.append(sc.camera.name if sc.camera else None)
        if seen[0] == seen[1] or seen[1] != row["camera"] or seen[2] != row["camera"]:
            problems.append(f"cut at {cut}: active cameras {seen}, expected the switch to {row['camera']} on {cut}")
    for row in rows:
        positions, lenses = [], []
        for frame in range(row["frames"][0], row["frames"][1] + 1):
            sc.frame_set(frame)
            cam = bpy.data.objects[row["camera"]].evaluated_get(bpy.context.evaluated_depsgraph_get())
            positions.append(cam.matrix_world.translation.copy())
            lenses.append(cam.data.lens)
        steps = [(b - a).length for a, b in zip(positions, positions[1:])]
        median = sorted(steps)[len(steps) // 2] if steps else 0.0
        for i, step in enumerate(steps):
            if step > min_jump_m and step > jump_factor * max(median, 1e-6):
                problems.append(f"{row['camera']}: camera jumps {step:.3f} m into frame {row['frames'][0] + i + 1}")
        for i, (a, b) in enumerate(zip(lenses, lenses[1:])):
            if abs(b - a) > max_lens_step_mm:
                problems.append(f"{row['camera']}: lens steps {a:.1f} -> {b:.1f} mm into frame {row['frames'][0] + i + 1}")
        row["max_step_m"] = round(max(steps), 4) if steps else 0.0
        row["lens_mm"] = [round(lenses[0], 2), round(lenses[-1], 2)]
    if same_lens_across_cuts:
        for before, after in zip(rows, rows[1:]):
            if abs(before["lens_mm"][1] - after["lens_mm"][0]) > max_lens_step_mm:
                problems.append(f"cut at {after['frames'][0]}: lens {before['lens_mm'][1]} -> {after['lens_mm'][0]} mm")
    sc.frame_set(current)
    return {"shots": rows, "problems": problems}


def audit_framing(subjects, frames=None, step=12, margin=0.02, whole=False, scene=None):
    """Subjects stay in frame on the active camera at every sampled frame. `subjects` maps a
    camera name to the object names that camera must hold ({"CAM_s2": ["FIG_red"]}); a
    figure root brings its mesh parts. Pass: the bounding-box center inside
    margin..1-margin and in front of the camera; with whole=True, every box corner
    inside -0.05..1.05 as well (full figure, feet included). Returns the failures
    ([] passes)."""
    sc = scene or bpy.context.scene
    failures, current = [], sc.frame_current
    for frame in _frames(sc, frames, step):
        sc.frame_set(frame)
        dg = bpy.context.evaluated_depsgraph_get()
        cam = _camera(sc)
        for name in subjects.get(sc.camera.name, []):
            lo, hi = _world_box(_meshes(name), dg)
            center = world_to_camera_view(sc, cam, (lo + hi) / 2)
            ok = margin < center.x < 1 - margin and margin < center.y < 1 - margin and center.z > 0
            if ok and whole:
                corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
                for corner in corners:
                    p = world_to_camera_view(sc, cam, corner)
                    if not (-0.05 <= p.x <= 1.05 and -0.05 <= p.y <= 1.05 and p.z > 0):
                        ok = False
                        break
            if not ok:
                failures.append({"frame": frame, "camera": sc.camera.name, "subject": name, "ndc": [round(v, 3) for v in center]})
    sc.frame_set(current)
    return failures


def audit_occlusion(subject, frames=None, step=12, head_fraction=0.92, scene=None):
    """Ray from the active camera to the subject's head (head_fraction of its height): the
    first hit must belong to the subject, or be nothing. Cover on the torso may pass; the
    head stays clear. Returns the blocked samples with the blocking object ([] passes)."""
    sc = scene or bpy.context.scene
    own = {o.name for o in _meshes(subject)}
    blocked, current = [], sc.frame_current
    for frame in _frames(sc, frames, step):
        sc.frame_set(frame)
        dg = bpy.context.evaluated_depsgraph_get()
        lo, hi = _world_box(_meshes(subject), dg)
        head = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z + head_fraction * (hi.z - lo.z)))
        origin = _camera(sc).matrix_world.translation
        ray = head - origin
        hit, _loc, _nor, _idx, obj, _mtx = sc.ray_cast(dg, origin + ray.normalized() * 0.02, ray.normalized(), distance=ray.length)
        if hit and obj is not None and obj.name not in own:
            blocked.append({"frame": frame, "camera": sc.camera.name, "blocked_by": obj.name})
    sc.frame_set(current)
    return blocked


def audit_distance(subject, frames=None, step=12, min_distance=0.8, volume=None, scene=None):
    """Camera-to-subject distance under min_distance (use it on full-figure shots only:
    inserts and macros sit closer by design), and the camera outside the scene's legal
    volume ((xmin, xmax), (ymin, ymax), (zmin, zmax)) when one is given."""
    sc = scene or bpy.context.scene
    problems, current = [], sc.frame_current
    for frame in _frames(sc, frames, step):
        sc.frame_set(frame)
        dg = bpy.context.evaluated_depsgraph_get()
        lo, hi = _world_box(_meshes(subject), dg)
        cam = _camera(sc).matrix_world.translation
        distance = (cam - (lo + hi) / 2).length
        if distance < min_distance:
            problems.append({"frame": frame, "camera": sc.camera.name, "distance_m": round(distance, 3)})
        if volume and not all(a <= v <= b for v, (a, b) in zip(cam, volume)):
            problems.append({"frame": frame, "camera": sc.camera.name, "outside_volume": [round(v, 3) for v in cam]})
    sc.frame_set(current)
    return problems


def audit_intersections(names, frames=None, step=6, tolerance=0.025, scene=None):
    """World bounding boxes of the named objects (roots bring their parts) overlapping by
    more than `tolerance` on all three axes at a sampled frame. Boxes, not meshes: a hit
    is a lead to look at, an empty list is the pass. Resting on the floor is not a hit."""
    sc = scene or bpy.context.scene
    hits, current = [], sc.frame_current
    for frame in _frames(sc, frames, step):
        sc.frame_set(frame)
        dg = bpy.context.evaluated_depsgraph_get()
        boxes = {name: _world_box(_meshes(name), dg) for name in names}
        ordered = list(boxes)
        for i, a in enumerate(ordered):
            for b in ordered[i + 1 :]:
                (alo, ahi), (blo, bhi) = boxes[a], boxes[b]
                overlap = [min(ahi[k], bhi[k]) - max(alo[k], blo[k]) for k in range(3)]
                if min(overlap) > tolerance:
                    hits.append({"frame": frame, "pair": [a, b], "overlap_m": round(min(overlap), 3)})
    sc.frame_set(current)
    return hits


def audit_ground(names, frames=None, step=12, ground_z=0.0, tolerance=0.02, scene=None):
    """Lowest evaluated vertex of each named object (roots bring their parts) at sampled
    frames, against the ground: floating and sinking both show. Returns the samples off
    the ground by more than `tolerance` ([] passes)."""
    sc = scene or bpy.context.scene
    off, current = [], sc.frame_current
    for frame in _frames(sc, frames, step):
        sc.frame_set(frame)
        dg = bpy.context.evaluated_depsgraph_get()
        for name in names:
            low = math.inf
            for obj in _meshes(name):
                ev = obj.evaluated_get(dg)
                mesh = ev.to_mesh()
                low = min([low] + [(ev.matrix_world @ v.co).z for v in mesh.vertices])
                ev.to_mesh_clear()
            if abs(low - ground_z) > tolerance:
                off.append({"frame": frame, "object": name, "lowest_z": round(low, 3)})
    sc.frame_set(current)
    return off


def audit_handheld(camera, frames=None, step=4, scene=None):
    """Measured handheld amplitude: the camera's world position and rotation with every
    NOISE modifier on the camera and its parents active, against the same frames with
    them muted. Returns the maxima, to compare with the budget in the brief."""
    sc = scene or bpy.context.scene
    cam = bpy.data.objects[camera]
    chain, obj = [], cam
    while obj is not None:
        chain.append(obj)
        obj = obj.parent
    noise = [m for o in chain for fc in fcurves(o) for m in fc.modifiers if m.type == "NOISE"]
    if not noise:
        return {"camera": camera, "noise_modifiers": 0}
    current, max_loc, max_rot = sc.frame_current, 0.0, 0.0
    try:
        for frame in _frames(sc, frames, step):
            poses = []
            for mute in (False, True):
                for m in noise:
                    m.mute = mute
                sc.frame_set(frame)
                poses.append(cam.evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world.copy())
            live, base = poses
            max_loc = max(max_loc, (live.translation - base.translation).length)
            max_rot = max(max_rot, live.to_quaternion().rotation_difference(base.to_quaternion()).angle)
    finally:
        for m in noise:
            m.mute = False
        sc.frame_set(current)
    return {
        "camera": camera,
        "noise_modifiers": len(noise),
        "max_offset_m": round(max_loc, 4),
        "max_rotation_deg": round(math.degrees(max_rot), 3),
    }


def state_audit(scene=None):
    """The census to report before hand-off: object counts by type and by name prefix,
    collections, bound markers, frame range, fps, resolution, engine, scene camera,
    animated objects, file path and whether the open file has unsaved changes."""
    sc = scene or bpy.context.scene
    by_type, by_prefix, animated = {}, {}, []
    for obj in sc.objects:
        by_type[obj.type] = by_type.get(obj.type, 0) + 1
        prefix = obj.name.split("_", 1)[0] if "_" in obj.name else "(none)"
        by_prefix[prefix] = by_prefix.get(prefix, 0) + 1
        if obj.animation_data and obj.animation_data.action:
            animated.append(obj.name)
    markers = sorted(sc.timeline_markers, key=lambda m: m.frame)
    return {
        "file": bpy.data.filepath or "(unsaved)",
        "unsaved_changes": bpy.data.is_dirty,
        "scene": sc.name,
        "objects_by_type": by_type,
        "objects_by_prefix": by_prefix,
        "collections": [c.name for c in sc.collection.children_recursive],
        "markers": [(m.name, m.frame, m.camera.name if m.camera else None) for m in markers],
        "frame_range": [sc.frame_start, sc.frame_end],
        "fps": sc.render.fps / (sc.render.fps_base or 1.0),
        "resolution": [sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage],
        "engine": sc.render.engine,
        "scene_camera": sc.camera.name if sc.camera else None,
        "animated": sorted(animated),
    }
