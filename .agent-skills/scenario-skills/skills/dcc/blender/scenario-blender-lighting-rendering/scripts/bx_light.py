"""
bx_light: lighting rigs, render presets, color management, 5.x compositor and render
analysis for Blender 5.2 (tested on 5.2.1 LTS, headless; works in a live session too).

What lighters do by eye (place lamps around a subject, squint at the frame, check the
image desaturated, flip A/B, look at a contact sheet) done from Python with numbers.

  import sys; sys.path.append("<skill>/scripts"); import bx_light as BL
  BL.aim_camera_at_frame_point(head, 1/3, 0.62)              # compose first, then light
  pb = BL.volume_probe_for_room(inner_lo, inner_hi); BL.bake_probes()   # EEVEE interiors: samples on the walls
  BL.probe_report(pb, inner_lo, inner_hi)                    # outer-sample gaps to the walls, flags
  rig = BL.three_point(subject_objs, target=head)            # key/fill/rim around subject vs camera
  rig = BL.motivated_interior(subject_objs, window=(loc, (w, h)), practical=lamp_loc, target=head)
  rig = BL.outdoor_sun_sky(subject_objs, sun_azimuth=210, sun_elevation=35, azimuth_space="world")
  BL.eye_light(eyes); BL.shadow_caster(sun, subject); BL.split_world(); BL.haze(room_objs)
  BL.light_report(target=head, face=head)                     # az/el vs camera, size, level, flags
  BL.preset_eevee(quality="preview"); BL.color_setup(view="AgX", look="High Contrast")
  r = BL.render("/abs/out/shot")                              # shot.png (display) + shot.exr (linear)
  mask = BL.mask_cryptomatte(r["exr"], names)                 # or BL.mask_workbench(subject_objs)
  rep = BL.analyse(r["png"], mask, exr=r["exr"]); print(BL.verdict(rep))
  BL.value_study(r["png"], "/abs/out/shot_values.png", mask=mask)   # open it with the image reader
  BL.light_contributions(rig.values(), mask, "/abs/out/solo")  # per-light share on the subject
  BL.clay(True)                                               # grey override: judge form only
  BL.light_groups({"key": [k], "rim": [r]}, world="window")   # Cycles: one render, gains in comp
  mix = BL.lightgroup_mix({"key": 1.4}, exr=r["exr"]); BL.render(base2, scene=mix["scene"])
  BL.comp_finish(bloom=0.2, vignette=0.25)                    # Glare bloom > Vignette > Tune Image
  BL.toon_material(...); BL.register_aovs(); BL.outline_hull(obj); BL.freestyle()   # NPR

Tests: tests/code/blender-lighting-rendering/test_01..13 (172 checks, all pass on 5.2.1).

Units. A light "level" is the linear value a white Lambertian surface facing the light at
the target would reach (albedo 1). Calibrated on 5.2.1 (EEVEE and Cycles agree):
point/spot P/(4 pi^2 d^2), small area P/(pi^2 d^2), sun S/pi. Under AgX a level of 1.0 on
albedo 0.8 (linear 0.8) displays 0.74; see references/procedures.md for the calibration table.

Angles. azimuth 0 = light on the camera side (frontal), +90 = screen right of the subject,
180 = straight behind it (backlight); elevation above the horizontal plane of the target.
World azimuth (suns) is compass style: 0 = +Y, 90 = +X, same as the Sky texture's sun_rotation.
Images from the analysis functions are arrays with row 0 at the TOP.
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import json
import math
import os
import struct
import time

import bpy
import numpy as np
from mathutils import Vector

try:
    import OpenImageIO as oiio  # bundled with Blender 5.x
except ImportError:  # pragma: no cover
    oiio = None

# white-card calibration (linear value of albedo-1 diffuse facing the light), 5.2.1
K_WHITE = {"POINT": 1.0 / (4 * math.pi ** 2), "SPOT": 1.0 / (4 * math.pi ** 2),
           "AREA": 1.0 / math.pi ** 2, "SUN": 1.0 / math.pi}
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
LIGHT_COLL = "BX_Lights"
ESSENTIALS = "assets/nodes/compositing_nodes_essentials.blend"
DATA_INPUTS = {"Normal", "Roughness", "Metallic", "Height", "Displacement", "Strength",
               "Alpha", "Specular IOR Level", "Coat Weight", "Coat Roughness", "Transmission Weight",
               "Subsurface Weight", "Anisotropic", "Sheen Weight", "IOR"}
COLOR_INPUTS = {"Base Color", "Emission Color", "Subsurface Radius", "Specular Tint", "Coat Tint",
                "Sheen Tint", "Color"}


# ======================================================================== geometry
def _scene(scene=None):
    return scene or bpy.context.scene


def _sync():
    """matrix_world is stale right after setting location/rotation until the view layer
    updates (5.x): call before reading world matrices of objects just placed."""
    try:
        bpy.context.view_layer.update()
    except Exception:
        pass


def _objs(x):
    if x is None:
        return []
    if isinstance(x, bpy.types.Collection):
        return [o for o in x.all_objects if o.type in {"MESH", "CURVES", "CURVE", "SURFACE", "FONT"}]
    if isinstance(x, bpy.types.Object):
        return [x]
    out = []
    for o in x:
        out += _objs(o)
    return out


def bounds(objs):
    """World bbox of evaluated objects -> (center, radius, lo, hi); radius = half diagonal."""
    objs = _objs(objs)
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        eo = o.evaluated_get(dg)
        pts += [eo.matrix_world @ Vector(c) for c in eo.bound_box]
    if not pts:
        raise ValueError("bounds: no geometry")
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return (lo + hi) / 2, (hi - lo).length / 2, lo, hi


def _point(t):
    if isinstance(t, Vector):
        return t.copy()
    if isinstance(t, (tuple, list)) and len(t) == 3 and all(isinstance(v, (int, float)) for v in t):
        return Vector(t)
    return bounds(t)[0]


def aim(obj, point):
    """Point an object's -Z (lights, cameras) at a world point."""
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def _cam_axes(cam, target):
    """Horizontal unit vectors: toward the camera from the target, and screen-right."""
    _sync()
    to_cam = cam.matrix_world.translation - target
    h = Vector((to_cam.x, to_cam.y, 0.0))
    if h.length < 1e-6:                      # camera straight above: use its up vector
        up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
        h = -Vector((up.x, up.y, 0))
    h.normalize()
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    right = Vector((right.x, right.y, 0.0))
    right -= h * right.dot(h)
    if right.length < 1e-6:
        right = Vector((0, 0, 1)).cross(h)
    right.normalize()
    return h, right


def direction(azimuth, elevation, target, cam=None, space="camera"):
    """Unit vector from the target toward a light at azimuth/elevation (degrees)."""
    az, el = math.radians(azimuth), math.radians(elevation)
    if space == "world":
        return Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    cam = cam or bpy.context.scene.camera
    h, right = _cam_axes(cam, target)
    d = math.cos(az) * h + math.sin(az) * right
    return (math.cos(el) * d + math.sin(el) * Vector((0, 0, 1))).normalized()


def free_distance(target, dirv, distance, ignore=(), margin=0.85, scene=None):
    """Distance along dirv from the target to the first occluder that is not in `ignore`
    (the subject itself, lights), times `margin`; `distance` if the path is clear. Keeps rig
    lights out of walls and furniture [added]."""
    sc = _scene(scene)
    dg = bpy.context.evaluated_depsgraph_get()
    names = {o.name for o in _objs(ignore)}
    origin, travelled = Vector(target), 0.0
    for _ in range(16):
        hit, loc, _, _, ob, _ = sc.ray_cast(dg, origin, dirv, distance=distance - travelled)
        if not hit:
            return distance
        step = (loc - origin).length
        if ob is not None and (ob.name in names or ob.type == "LIGHT" or not ob.visible_shadow):
            travelled += step + 1e-3
            origin = loc + dirv * 1e-3
            if travelled >= distance:
                return distance
            continue
        return max(0.05 * distance, (travelled + step) * margin)
    return distance


def place(obj, target, azimuth, elevation, distance, cam=None, space="camera", avoid=None):
    """Put a light (or any object) on a sphere around the target and aim it there. With
    avoid=<subject objects>, the distance shrinks so the light stays in free space.
    Returns the distance actually used."""
    target = _point(target)
    d = direction(azimuth, elevation, target, cam, space)
    if avoid is not None:
        distance = free_distance(target, d, distance, ignore=avoid)
    obj.location = target + d * distance
    aim(obj, target)
    return distance


def angles(obj, target, cam=None):
    """Azimuth/elevation of an object around the target, in the camera convention above,
    plus the angle between the light and the camera as seen from the target (0 = frontal)."""
    _sync()
    cam = cam or bpy.context.scene.camera
    target = _point(target)
    v = obj.matrix_world.translation - target
    dist = v.length
    h, right = _cam_axes(cam, target)
    el = math.degrees(math.asin(max(-1.0, min(1.0, v.z / max(dist, 1e-9)))))
    az = math.degrees(math.atan2(v.dot(right), v.dot(h)))
    to_cam = (cam.matrix_world.translation - target).normalized()
    off_axis = math.degrees(v.normalized().angle(to_cam))
    return {"azimuth": round(az, 1), "elevation": round(el, 1), "distance": round(dist, 3),
            "off_camera_axis": round(off_axis, 1)}


def sun_azimuth(sun_obj):
    """World compass azimuth/elevation (degrees) of the direction TOWARD a sun lamp's source."""
    _sync()
    z = (sun_obj.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
    return {"azimuth": round(math.degrees(math.atan2(z.x, z.y)) % 360, 1),
            "elevation": round(math.degrees(math.asin(max(-1, min(1, z.z)))), 1)}


def screen_xy(point, cam=None, scene=None):
    """Normalized frame position of a world point (x right, y up, 0..1) and depth."""
    from bpy_extras.object_utils import world_to_camera_view
    _sync()
    sc = _scene(scene)
    v = world_to_camera_view(sc, cam or sc.camera, _point(point))
    return v.x, v.y, v.z


def aim_camera_at_frame_point(target, x=1 / 3, y=0.6, cam=None, scene=None, iters=6):
    """Turn the camera (position kept, no roll) so `target` lands at frame point (x, y):
    the composition fix for a centered subject (thirds: x 1/3 or 2/3; Andrew: near, not
    exact). Returns the final (x, y)."""
    sc = _scene(scene)
    cam = cam or sc.camera
    tgt = _point(target)
    cam.rotation_mode = "XYZ"
    for _ in range(iters):
        cx, cy, _ = screen_xy(tgt, cam, sc)
        ex, ey = x - cx, y - cy
        if abs(ex) < 0.002 and abs(ey) < 0.002:
            break
        fr = cam.data.view_frame(scene=sc)
        half_w = max(abs(v.x) for v in fr) / abs(fr[0].z)
        half_h = max(abs(v.y) for v in fr) / abs(fr[0].z)
        cam.rotation_euler.z += math.atan(2 * ex * half_w)       # yaw: move subject right = turn left
        cam.rotation_euler.x -= math.atan(2 * ey * half_h)       # pitch
    cx, cy, _ = screen_xy(tgt, cam, sc)
    return round(cx, 3), round(cy, 3)


# ======================================================================== lights
def energy_for(ltype, level, distance=1.0):
    """Power (W) or sun strength giving `level` on a white card facing the light."""
    if ltype == "SUN":
        return level / K_WHITE["SUN"]
    return level * distance ** 2 / K_WHITE[ltype]


def level_of(light_obj, point):
    """Inverse of energy_for: nominal level at a point (ignores angle, shadowing, cone)."""
    _sync()
    L = light_obj.data
    if L.type == "SUN":
        return L.energy * K_WHITE["SUN"]
    d = (light_obj.matrix_world.translation - _point(point)).length
    return L.energy * K_WHITE[L.type] / max(d, 1e-6) ** 2


def _collection(name, scene=None):
    sc = _scene(scene)
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    if c.name not in sc.collection.children and c not in sc.collection.children_recursive:
        sc.collection.children.link(c)
    return c


def new_light(name, ltype="AREA", scene=None):
    """Get-or-create a light object by name inside the BX_Lights collection."""
    ob = bpy.data.objects.get(name)
    if ob is not None and ob.type == "LIGHT":
        if ob.data.type != ltype:
            ob.data.type = ltype
        ob.constraints.clear()
    else:
        ob = bpy.data.objects.new(name, bpy.data.lights.new(name, ltype))
    coll = _collection(LIGHT_COLL, scene)
    if ob.name not in coll.objects:
        coll.objects.link(ob)
    ob.hide_render = False
    return ob


def set_color(light, temperature=None, color=None):
    """Kelvin for natural sources, RGB for artificial or stylized ones (Andrew Price)."""
    L = light.data if isinstance(light, bpy.types.Object) else light
    if temperature:
        L.use_temperature = True
        L.temperature = temperature
        L.color = (1, 1, 1)
    else:
        L.use_temperature = False
    if color is not None:
        L.color = color[:3]


def set_size(light, size, distance=None):
    """Source size in metres: area edge, point/spot radius; for a sun, `size` is the angle in
    degrees. Bigger reads form, smaller reads texture and detail (Andrew Price)."""
    L = light.data if isinstance(light, bpy.types.Object) else light
    if L.type == "AREA":
        L.size = size
        if L.shape in {"RECTANGLE", "ELLIPSE"}:
            L.size_y = size
    elif L.type in {"POINT", "SPOT"}:
        L.shadow_soft_size = size
    else:
        L.angle = math.radians(size)


def eevee_softness(light, distance, jitter_threshold_deg=3.0):
    """Gleb Alexandrov's EEVEE switches: custom (long) distance on every light; per-light
    shadow jitter on soft lights so contact microshadows appear. Threshold [added]."""
    L = light.data
    L.use_custom_distance = True
    L.cutoff_distance = max(100.0, 20.0 * distance)
    ang = angular_size(light, distance)
    L.use_shadow_jitter = ang >= jitter_threshold_deg
    return ang


def angular_size(light, distance):
    """Apparent size of the source from the target, degrees (the real softness control)."""
    L = light.data
    if L.type == "SUN":
        return math.degrees(L.angle)
    s = L.size if L.type == "AREA" else 2 * L.shadow_soft_size
    return math.degrees(2 * math.atan(s / 2 / max(distance, 1e-6)))


def light_object(light):
    """The light OBJECT for a light object or a Light datablock. `light_linking` and
    `lightgroup` are Object properties: bpy.types.Light has neither (verified 5.2.1), so
    `light.data.light_linking` or a Light datablock named `light` raises AttributeError.
    A datablock used by several objects is ambiguous and raises TypeError."""
    if isinstance(light, bpy.types.Object):
        if light.type != "LIGHT":
            raise TypeError(f"{light.name} is a {light.type} object, not a light")
        return light
    if isinstance(light, bpy.types.Light):
        users = [o for o in bpy.data.objects if o.data == light]
        if len(users) == 1:
            return users[0]
        raise TypeError(f"Light datablock {light.name!r} is used by {len(users)} objects: pass the "
                        "light OBJECT (light_linking and lightgroup live on the Object)")
    raise TypeError(f"not a light: {light!r}")


def link_light(light_obj, receivers, name=None):
    """Light linking: the light only lights `receivers` (objects or a collection). Works in
    EEVEE and Cycles (4.3+). Use for faked keys, rims and eye lights on a character.
    Lives on the light OBJECT (`obj.light_linking.receiver_collection`); a Light datablock
    is resolved to its single object by light_object()."""
    light_obj = light_object(light_obj)
    if receivers is None:
        light_obj.light_linking.receiver_collection = None
        return None
    if isinstance(receivers, bpy.types.Collection):
        light_obj.light_linking.receiver_collection = receivers
        return receivers
    cname = name or light_obj.name + "_receivers"
    rc = bpy.data.collections.get(cname) or bpy.data.collections.new(cname)
    for o in list(rc.objects):
        rc.objects.unlink(o)
    for o in _objs(receivers):
        rc.objects.link(o)
    light_obj.light_linking.receiver_collection = rc
    return rc


def _make(name, ltype, target, az, el, dist, level, size, cam, temperature=None, color=None,
          space="camera", shape=None, avoid=None, link=None):
    ob = new_light(name, ltype)
    if shape and ltype == "AREA":
        ob.data.shape = shape
    dist = place(ob, target, az, el, dist, cam, space, avoid=avoid)
    ob.data.energy = energy_for(ltype, level, dist)
    set_size(ob, size)
    set_color(ob, temperature, color)
    eevee_softness(ob, dist)
    if link is not None:
        link_light(ob, link)
    return ob


# ======================================================================== rigs
def three_point(subject, cam=None, target=None, key_az=40.0, key_el=35.0, key_dist=None,
                key_size=None, key_level=1.0, fill_ratio=0.25, fill_az=None, fill_el=10.0,
                rim_level=2.0, rim_side="key", key_temp=None, fill_temp=None, rim_temp=None,
                key_color=None, fill_color=None, rim_color=None, link_rim=False, prefix="BX_"):
    """Key / fill / rim placed relative to the subject and camera.

    Defaults: key 40 deg off the camera axis and 35 deg up (any angle but frontal, Gleb;
    from above for upper-hemisphere eye highlights, Andy), at 3 subject radii (close enough
    for falloff across the subject, Andrew/Gleb), source as big as the subject radius
    (form over texture, Andrew). Fill on the other side, lower, big and soft, at
    `fill_ratio` of the key level [added default 0.25; experts judge by eye, so measure
    with light_contributions]. Rim behind the subject on the KEY side (Andy: a shadow-side
    rim looks like a bounce from nowhere) unless rim_side="shadow" with a motivation.
    Lights are pulled in when a wall or prop sits on their path (free_distance); energies
    follow the distance actually used. link_rim=True light-links the rim to the subject.
    Returns {"key","fill","rim"} light objects. Idempotent (get-or-create by name).
    """
    cam = cam or bpy.context.scene.camera
    center, radius, _, _ = bounds(subject)
    tgt = _point(target) if target is not None else center
    key_dist = key_dist or 3.0 * radius
    key_size = key_size or 1.0 * radius
    side = 1 if key_az >= 0 else -1
    fill_az = fill_az if fill_az is not None else -side * 60.0
    rim_az = side * 145.0 if rim_side == "key" else -side * 145.0
    key = _make(prefix + "Key", "AREA", tgt, key_az, key_el, key_dist, key_level, key_size, cam,
                key_temp, key_color, avoid=subject)
    fill = _make(prefix + "Fill", "AREA", tgt, fill_az, fill_el, key_dist * 1.2,
                 key_level * fill_ratio, key_size * 2.0, cam, fill_temp, fill_color, avoid=subject)
    rim = _make(prefix + "Rim", "AREA", tgt, rim_az, 30.0, key_dist, rim_level,
                key_size * 0.4, cam, rim_temp, rim_color, avoid=subject,
                link=subject if link_rim else None)
    return {"key": key, "fill": fill, "rim": rim}


def motivated_interior(subject, window, practical=None, cam=None, target=None,
                       key="practical", key_level=1.2, practical_level=None, window_level=0.35,
                       bounce_level=0.08, rim_level=1.5, sky_color=(0.35, 0.5, 1.0),
                       practical_temp=2700, practical_radius=0.04, practical_cone=110.0,
                       cheat_key=True, link_key=True, link_rim=True, window_normal=None,
                       world_color=None, world_strength=None, prefix="BX_"):
    """Interior lit by what is in the room: a window (area light in the opening, colored by
    the sky) and a practical lamp (warm light at the bulb), plus a warm floor bounce and a
    rim motivated by whichever source sits behind the subject.

    window: (location, (width, height)) or an object (bbox center and two largest dims).
    key: "practical" (night/dusk interior: warm key, cool window fill) or "window" (day).
    practical_cone: the practical is a downward SPOT with this cone (a shaded hanging lamp;
      Andrew: convert to spot to carve light off what does not matter); 0 = bare point light.
    cheat_key: when the key source sits behind the subject (|azimuth| > 100 deg), add a faked
      key in the face from that side, colored like the source (Andy: in backlit scenes the
      rim becomes the main source but still add a faked key so the character reads); the
      practical then keeps `practical_level` (default half the key) for the set.
    link_key / link_rim: the cheated key and the rim only light the subject (light linking),
      so the set keeps its motivated look and the subject separates (Andy: darken the
      background a little; composition: add light only on the hero).
    Levels are [added] starting values: measure them with light_contributions.
    Returns dict of light objects.
    """
    sc = bpy.context.scene
    cam = cam or sc.camera
    center, radius, lo, hi = bounds(subject)
    tgt = _point(target) if target is not None else center
    if isinstance(window, bpy.types.Object):
        wc, _, wlo, whi = bounds(window)
        dims = sorted((whi - wlo)[:], reverse=True)
        wsize = (dims[0], dims[1])
    else:
        wc, wsize = Vector(window[0]), window[1]
    n = Vector(window_normal) if window_normal is not None else Vector((tgt.x - wc.x, tgt.y - wc.y, 0))
    n.normalize()
    rig = {}
    win = new_light(prefix + "Window", "AREA")
    win.data.shape = "RECTANGLE"
    win.data.size, win.data.size_y = wsize[0], wsize[1]
    win.location = wc + n * 0.02
    # emit along n (local -Z) with local Y up, so size_y is the window height
    win.rotation_mode = "XYZ"
    win.rotation_euler = n.to_track_quat("-Z", "Y").to_euler()
    d_win = (tgt - win.location).length
    lvl_win = key_level if key == "window" else window_level
    win.data.energy = energy_for("AREA", lvl_win, d_win) / max(0.2, n.dot((tgt - win.location).normalized()))
    set_color(win, color=sky_color)
    eevee_softness(win, d_win)
    rig["window"] = win
    if practical is not None:
        ptype = "SPOT" if practical_cone else "POINT"
        pr = new_light(prefix + "Practical", ptype)
        pr.location = _point(practical)
        if ptype == "SPOT":
            aim(pr, pr.location - Vector((0, 0, 1)))
            pr.data.spot_size = math.radians(practical_cone)
            pr.data.spot_blend = 0.6
        d_pr = (tgt - pr.location).length
        lvl = key_level if key == "practical" else window_level
        pr.data.energy = energy_for(ptype, lvl, d_pr)
        set_size(pr, practical_radius)
        set_color(pr, temperature=practical_temp)
        eevee_softness(pr, d_pr)
        rig["practical"] = pr
    key_obj = rig["practical"] if (key == "practical" and practical is not None) else win
    ka = angles(key_obj, tgt, cam)
    if cheat_key and abs(ka["azimuth"]) > 100:
        side = 1 if ka["azimuth"] >= 0 else -1
        ck = new_light(prefix + "Key", "AREA")
        ck.data.shape = "DISK"
        dk = place(ck, tgt, side * 50.0, 30.0, 3.0 * radius, cam, avoid=subject)
        ck.data.energy = energy_for("AREA", key_level, dk)
        set_size(ck, 0.8 * radius)
        if key_obj.data.use_temperature:
            set_color(ck, temperature=key_obj.data.temperature)
        else:
            set_color(ck, color=key_obj.data.color)
        eevee_softness(ck, dk)
        link_light(ck, subject if link_key else None)
        rig["key"] = ck
        if key_obj is rig.get("practical"):
            plev = practical_level if practical_level is not None else 0.5 * key_level
            key_obj.data.energy = energy_for(key_obj.data.type, plev, ka["distance"])
        key_obj = ck
    # floor bounce: big, low, below the key direction, tinted by the key
    kdir = (key_obj.location - tgt)
    kdir_h = Vector((kdir.x, kdir.y, 0)).normalized()
    b = new_light(prefix + "Bounce", "AREA")
    b.data.shape = "DISK"
    b.data.size = max(1.0, 2.5 * radius)
    b.location = Vector((tgt.x, tgt.y, lo.z + 0.02)) + kdir_h * radius * 1.5
    aim(b, tgt)
    d_b = (tgt - b.location).length
    b.data.energy = energy_for("AREA", bounce_level, d_b)
    if key_obj.data.use_temperature:
        set_color(b, temperature=key_obj.data.temperature + 500)
    else:
        set_color(b, color=key_obj.data.color)
    eevee_softness(b, d_b)
    rig["bounce"] = b
    # rim motivated by the source that is most behind the subject; if none is behind,
    # rim on the key side (Andy: a shadow-side rim reads as a bounce from nowhere)
    srcs = [o for o in (rig.get("practical"), win) if o]
    back = max(srcs, key=lambda o: abs(angles(o, tgt, cam)["azimuth"]))
    a = angles(back, tgt, cam)
    if abs(a["azimuth"]) >= 100:
        rim_az = math.copysign(min(160.0, abs(a["azimuth"])), a["azimuth"])
        src = back
    else:
        rim_az = math.copysign(145.0, angles(key_obj, tgt, cam)["azimuth"])
        src = key_obj
    rim = new_light(prefix + "Rim", "SPOT")
    dr = place(rim, tgt, rim_az, max(15.0, min(45.0, a["elevation"])), 2.5 * radius, cam, avoid=subject)
    rim.data.spot_size = math.radians(40)
    rim.data.spot_blend = 0.5
    rim.data.energy = energy_for("SPOT", rim_level, dr)
    set_size(rim, 0.1 * radius)
    if src.data.use_temperature:
        set_color(rim, temperature=src.data.temperature)
    else:
        set_color(rim, color=src.data.color)
    eevee_softness(rim, dr)
    link_light(rim, subject if link_rim else None)
    rig["rim"] = rim
    # a source almost straight behind (within 15 deg) backlights both edges: second rim
    old = bpy.data.objects.get(prefix + "Rim2")
    if abs(a["azimuth"]) >= 165 and src is back:
        rim2 = new_light(prefix + "Rim2", "SPOT")
        dr2 = place(rim2, tgt, -rim_az, max(15.0, min(45.0, a["elevation"])), 2.5 * radius, cam,
                    avoid=subject)
        rim2.data.spot_size, rim2.data.spot_blend = rim.data.spot_size, rim.data.spot_blend
        rim2.data.energy = energy_for("SPOT", rim_level, dr2)
        set_size(rim2, 0.1 * radius)
        rim2.data.use_temperature, rim2.data.temperature = rim.data.use_temperature, rim.data.temperature
        rim2.data.color = rim.data.color
        eevee_softness(rim2, dr2)
        link_light(rim2, subject if link_rim else None)
        rig["rim2"] = rim2
    elif old is not None:
        old.hide_render = True
    if world_color is not None or world_strength is not None:
        bg = sc.world.node_tree.nodes.get("Background")
        if world_color is not None:
            bg.inputs["Color"].default_value = (*world_color[:3], 1)
        if world_strength is not None:
            bg.inputs["Strength"].default_value = world_strength
    return rig


def outdoor_sun_sky(subject, cam=None, target=None, sun_azimuth=45.0, sun_elevation=35.0,
                    azimuth_space="camera", sun_level=2.0, sun_angle=2.0, sky_strength=0.25,
                    sky_type="MULTIPLE_SCATTERING", bounce_level=0.0, prefix="BX_"):
    """Sun lamp plus physical sky, synced (same azimuth/elevation), sky sun disc off and
    EEVEE HDRI-sun extraction off so the sun is not doubled (Andrew: threshold 0, own sun
    lamp for control). Sun angle 2 deg by default (Andy's Sprite Fright demo).
    azimuth_space="world" pins the sun to the set for continuity across shots (Andy: sun
    direction relative to the set, about 30 deg leeway); "camera" uses the lighting
    convention (0 = frontal). Optional warm ground bounce card for the shadow side.
    """
    sc = bpy.context.scene
    cam = cam or sc.camera
    center, radius, lo, hi = bounds(subject)
    tgt = _point(target) if target is not None else center
    d = direction(sun_azimuth, sun_elevation, tgt, cam, azimuth_space)
    sun = new_light(prefix + "Sun", "SUN")
    sun.location = tgt + d * 10.0
    aim(sun, tgt)
    sun.data.energy = energy_for("SUN", sun_level)
    sun.data.angle = math.radians(sun_angle)
    sun.data.use_shadow_jitter = sun_angle >= 3.0
    world_az = math.degrees(math.atan2(d.x, d.y)) % 360
    world_el = math.degrees(math.asin(d.z))
    w = sc.world
    nt = w.node_tree
    bg = nt.nodes.get("Background")
    sky = nt.nodes.get("BX_Sky") or nt.nodes.new("ShaderNodeTexSky")
    sky.name = "BX_Sky"
    sky.sky_type = sky_type
    sky.sun_disc = False
    sky.sun_elevation = math.radians(max(world_el, 0.0))
    sky.sun_rotation = math.radians(world_az)
    nt.links.new(bg.inputs["Color"], sky.outputs["Color"])
    bg.inputs["Strength"].default_value = sky_strength
    w.sun_threshold = 0.0            # EEVEE: do not extract a second sun from the sky
    rig = {"sun": sun, "sky": sky, "sun_world": {"azimuth": round(world_az, 1), "elevation": round(world_el, 1)}}
    if bounce_level > 0:
        b = new_light(prefix + "GroundBounce", "AREA")
        b.data.size = 3 * radius
        dh = Vector((d.x, d.y, 0)).normalized()
        b.location = Vector((tgt.x, tgt.y, lo.z + 0.01)) - dh * radius * 1.5
        aim(b, tgt)
        db = (tgt - b.location).length
        b.data.energy = energy_for("AREA", bounce_level, db)
        set_color(b, color=(1.0, 0.8, 0.6))
        eevee_softness(b, db)
        rig["bounce"] = b
    return rig


def fake_sun(subject, sun_obj, target=None, distance_factor=60.0, level=None, prefix="BX_"):
    """Lino Thomas' fake second sun: a spot with a ~1 deg cone far away along the sun
    direction, so the subject gets its own parallel key while the real sun lights the
    background (block the real sun off the subject with shadow_caster)."""
    _sync()
    center, radius, _, _ = bounds(subject)
    tgt = _point(target) if target is not None else center
    z = (sun_obj.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
    D = distance_factor * radius
    sp = new_light(prefix + "FakeSun", "SPOT")
    sp.location = tgt + z * D
    aim(sp, tgt)
    sp.data.spot_size = 2 * math.atan(1.3 * radius / D)
    sp.data.spot_blend = 0.3
    lvl = level if level is not None else sun_obj.data.energy * K_WHITE["SUN"]
    sp.data.energy = energy_for("SPOT", lvl, D)
    sp.data.shadow_soft_size = 0.0
    set_color(sp, color=sun_obj.data.color)
    return sp


def shadow_caster(light_obj, subject, target=None, frac=0.35, size=None, name="BX_ShadowCaster"):
    """Andy Goralczyk's blocker: a near-black plane between a light and the subject,
    invisible to camera and reflections, that only removes that light from the subject."""
    _sync()
    center, radius, _, _ = bounds(subject)
    tgt = _point(target) if target is not None else center
    if light_obj.data.type == "SUN":
        src = tgt + (light_obj.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized() * 6 * radius
    else:
        src = light_obj.matrix_world.translation
    ob = bpy.data.objects.get(name)
    if ob is None:
        me = bpy.data.meshes.new(name)
        me.from_pydata([(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0)], [], [(0, 1, 2, 3)])
        ob = bpy.data.objects.new(name, me)
        _collection(LIGHT_COLL).objects.link(ob)
        m = bpy.data.materials.new(name)
        p = m.node_tree.nodes["Principled BSDF"]
        p.inputs["Base Color"].default_value = (0.01, 0.01, 0.01, 1)
        p.inputs["Roughness"].default_value = 1.0
        me.materials.append(m)
    ob.location = tgt + (src - tgt) * frac
    aim(ob, tgt)
    s = size or 3.0 * radius
    ob.scale = (s, s, 1)
    ob.visible_camera = False
    ob.visible_glossy = False
    ob.visible_transmission = False
    return ob


def eye_light(eyes, cam=None, distance=None, level=0.6, size=0.05, elevation=12.0, azimuth=10.0,
              name="BX_EyeLight"):
    """Catchlight only in the eyes: tiny area light near the camera, a bit above (upper half
    of the eye, Andy), diffuse off so only the glint shows, light-linked to the eyes (Gleb)."""
    cam = cam or bpy.context.scene.camera
    eyes = _objs(eyes)
    center, radius, _, _ = bounds(eyes)
    dist = distance or max(1.0, 0.6 * (cam.matrix_world.translation - center).length)
    ob = new_light(name, "AREA")
    place(ob, center, azimuth, elevation, dist, cam)
    ob.data.size = size
    ob.data.energy = energy_for("AREA", level, dist)
    ob.data.diffuse_factor = 0.0
    ob.data.specular_factor = 1.0
    ob.data.volume_factor = 0.0
    link_light(ob, eyes)
    return ob


def split_world(camera_color=(0.02, 0.02, 0.03), camera_strength=1.0, world=None):
    """World seen by the camera separate from the world that lights the scene (Light Path
    Is Camera Ray): darken or swap the backdrop without darkening the subject (Gleb, Andy)."""
    w = world or bpy.context.scene.world
    nt = w.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_WORLD")
    light_bg = nt.nodes.get("Background")
    cam_bg = nt.nodes.get("BX_CameraBG") or nt.nodes.new("ShaderNodeBackground")
    cam_bg.name = "BX_CameraBG"
    lp = nt.nodes.get("BX_LightPath") or nt.nodes.new("ShaderNodeLightPath")
    lp.name = "BX_LightPath"
    mix = nt.nodes.get("BX_WorldMix") or nt.nodes.new("ShaderNodeMixShader")
    mix.name = "BX_WorldMix"
    cam_bg.inputs["Color"].default_value = (*camera_color[:3], 1)
    cam_bg.inputs["Strength"].default_value = camera_strength
    nt.links.new(mix.inputs["Fac"], lp.outputs["Is Camera Ray"])
    nt.links.new(mix.inputs[1], light_bg.outputs["Background"])
    nt.links.new(mix.inputs[2], cam_bg.outputs["Background"])
    nt.links.new(out.inputs["Surface"], mix.outputs["Shader"])
    return mix


def world_gradient(top=(0.25, 0.4, 0.9), bottom=(0.35, 0.25, 0.12), strength=0.5, world=None):
    """Andy Goralczyk's lighting world: blue from above (sky/canopy), warm from below
    (ground bounce). Drives the lighting Background; combine with split_world."""
    w = world or bpy.context.scene.world
    nt = w.node_tree
    bg = nt.nodes.get("Background")
    tc = nt.nodes.get("BX_TexCoord") or nt.nodes.new("ShaderNodeTexCoord")
    tc.name = "BX_TexCoord"
    sep = nt.nodes.get("BX_SepZ") or nt.nodes.new("ShaderNodeSeparateXYZ")
    sep.name = "BX_SepZ"
    mr = nt.nodes.get("BX_MapZ") or nt.nodes.new("ShaderNodeMapRange")
    mr.name = "BX_MapZ"
    mix = nt.nodes.get("BX_GradMix") or nt.nodes.new("ShaderNodeMix")
    mix.name = "BX_GradMix"
    mix.data_type = "RGBA"
    nt.links.new(sep.inputs[0], tc.outputs["Generated"])
    nt.links.new(mr.inputs["Value"], sep.outputs["Z"])
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = -1.0, 1.0
    nt.links.new(mix.inputs["Factor"], mr.outputs["Result"])
    mix.inputs[6].default_value = (*bottom[:3], 1)
    mix.inputs[7].default_value = (*top[:3], 1)
    nt.links.new(bg.inputs["Color"], mix.outputs[2])
    bg.inputs["Strength"].default_value = strength
    return mix


def haze(extent_objs=None, lo=None, hi=None, density=0.05, anisotropy=0.2, color=(1, 1, 1),
         name="BX_Haze"):
    """Room-sized volume cube, drawn as bounds (Gleb, Andrew: default densities are "always
    way too high", 0.05 for a room). Excluded from volume-probe bakes (Andrew's "hide before
    baking" as a flag). Positive anisotropy scatters toward the light (Lino)."""
    if extent_objs is not None:
        _, _, lo, hi = bounds(extent_objs)
    lo, hi = Vector(lo), Vector(hi)
    ob = bpy.data.objects.get(name)
    if ob is None:
        me = bpy.data.meshes.new(name)
        v = [(x, y, z) for x in (-.5, .5) for y in (-.5, .5) for z in (-.5, .5)]
        f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        me.from_pydata(v, [], f)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        m = bpy.data.materials.new(name)
        nt = m.node_tree
        nt.nodes.remove(nt.nodes["Principled BSDF"])
        vol = nt.nodes.new("ShaderNodeVolumePrincipled")
        nt.links.new(nt.nodes["Material Output"].inputs["Volume"], vol.outputs[0])
        me.materials.append(m)
    vol = next(n for n in ob.active_material.node_tree.nodes if n.bl_idname == "ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = density
    vol.inputs["Anisotropy"].default_value = anisotropy
    vol.inputs["Color"].default_value = (*color[:3], 1)
    ob.location = (lo + hi) / 2
    ob.scale = hi - lo
    ob.display_type = "BOUNDS"
    ob.hide_probe_volume = True
    bpy.context.scene.eevee.use_volumetric_shadows = True
    return ob


def _source_m(L):
    """Physical source size in metres: area edge (largest), 2 x radius for point/spot."""
    if L.type == "AREA":
        return max(L.size, L.size_y if L.shape in {"RECTANGLE", "ELLIPSE"} else L.size)
    if L.type in {"POINT", "SPOT"}:
        return 2 * L.shadow_soft_size
    return None


def light_report(scene=None, target=None, cam=None, lights=None, key=None, face=None):
    """One line per light: type, az/el vs camera, distance, angular size, source size in
    metres, nominal level at the target, color. Flags a frontal key (< 20 deg off the
    camera axis) [added threshold] and a key from below (eye highlights must sit in the
    upper half, Andy). face (head object(s)): also flags a key source smaller than the
    head (Andrew Price: large sources for faces so form reads and pores do not; small ones
    for grit, aggression or a sun/streetlamp cue; 'head-sized' is the [added] threshold;
    ignore the flag for NPR/toon keys). The key is `key` (name) or the strongest diffuse
    light in the front hemisphere (|azimuth| <= 100; rims carry high nominal levels because
    they graze)."""
    _sync()
    sc = _scene(scene)
    cam = cam or sc.camera
    lights = lights or [o for o in sc.objects if o.type == "LIGHT" and not o.hide_render]
    tgt = _point(target) if target is not None else Vector((0, 0, 0))
    rows, flags = [], []
    for o in lights:
        if o.data.type == "SUN":
            z = (o.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
            h, right = _cam_axes(cam, tgt)
            a = {"azimuth": round(math.degrees(math.atan2(z.dot(right), z.dot(h))), 1),
                 "elevation": round(math.degrees(math.asin(max(-1, min(1, z.z)))), 1),
                 "distance": None,
                 "off_camera_axis": round(math.degrees(z.angle((cam.matrix_world.translation - tgt).normalized())), 1)}
        else:
            a = angles(o, tgt, cam)
        dist = a["distance"] or 1.0
        rows.append({"name": o.name, "type": o.data.type, **a,
                     "angular_size_deg": round(angular_size(o, dist), 2),
                     "source_m": None if _source_m(o.data) is None else round(_source_m(o.data), 3),
                     "level": round(level_of(o, tgt), 3),
                     "kelvin": o.data.temperature if o.data.use_temperature else None,
                     "rgb": [round(c, 3) for c in o.data.color],
                     "jitter": o.data.use_shadow_jitter,
                     "diffuse": o.data.diffuse_factor})
    if rows:
        if key is not None:
            key = next((r for r in rows if r["name"] == key), None)
        else:
            front = [r for r in rows if r["diffuse"] > 0 and abs(r["azimuth"]) <= 100]
            key = max(front or [r for r in rows if r["diffuse"] > 0], key=lambda r: r["level"], default=None)
        if key:
            if key["off_camera_axis"] < 20:
                flags.append(f"key {key['name']} is frontal ({key['off_camera_axis']} deg off the camera axis): flat light")
            if key["elevation"] < 0:
                flags.append(f"key {key['name']} is below the eye line: eye highlights in the lower half")
            if face is not None and key["source_m"] is not None:
                _, _, flo, fhi = bounds(face)
                head = max(fhi - flo)
                if key["source_m"] < head:
                    flags.append(f"key {key['name']} is a small source for a face ({key['source_m']:.2f} m vs a "
                                 f"{head:.2f} m head): pores and texture read; Andrew: large sources for faces, "
                                 "small for grit, aggression or a sun/streetlamp cue (fine for NPR/toon)")
    return {"lights": rows, "flags": flags}


# ======================================================================== render presets
def cycles_gpu(scene=None):
    """Use the first GPU backend available (Metal, OptiX, CUDA, HIP, oneAPI); CPU otherwise."""
    sc = _scene(scene)
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for t in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = t
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type != "CPU"]
        if gpus:
            for d in prefs.devices:
                d.use = d.type != "CPU"
            sc.cycles.device = "GPU"
            return t
    sc.cycles.device = "CPU"
    return "CPU"


def preset_eevee(scene=None, quality="preview", interior=False, animation=False, pct=None):
    """EEVEE (5.x id 'BLENDER_EEVEE') with the experts' switches. Ray tracing is OFF in a
    factory scene and must be on (Andrew, Gleb). Fast GI steps 16 minimum (Andrew). Final
    resolutions 1:1 reflections, 1:2 GI (1/16 flickers). Shadow steps 12 for thin-wall leaks
    in interiors, shadow rays 2 against penumbra noise instead of more samples (Andrew).
    Temporal denoise off for stills keeps textures sharp (Andrew). Sample counts [added]."""
    sc = _scene(scene)
    sc.render.engine = "BLENDER_EEVEE"
    ee = sc.eevee
    ro = ee.ray_tracing_options
    ee.use_raytracing = True
    ee.ray_tracing_method = "SCREEN"
    ro.trace_max_roughness = 0.5
    ee.use_fast_gi = True
    ee.fast_gi_method = "GLOBAL_ILLUMINATION"
    ee.fast_gi_step_count = 16
    ee.use_shadows = True
    final = quality == "final"
    ee.taa_render_samples = 128 if final else 32
    ro.resolution_scale = "1" if final else "2"
    ee.fast_gi_resolution = "2" if final else "4"
    ee.shadow_ray_count = 2 if final else 1
    ee.shadow_step_count = 12 if interior else 6
    ro.use_denoise = True
    ro.denoise_temporal = animation
    if pct is None:
        pct = 100 if final else 50
    sc.render.resolution_percentage = pct
    return {"engine": "BLENDER_EEVEE", "samples": ee.taa_render_samples, "rt_scale": ro.resolution_scale,
            "fast_gi_res": ee.fast_gi_resolution, "shadow_rays": ee.shadow_ray_count,
            "shadow_steps": ee.shadow_step_count, "pct": pct}


def preset_cycles(scene=None, quality="preview", budget="film", glass=False, gpu=True, pct=None):
    """Cycles presets. budget="film" is Andy Goralczyk's Sprite Fright economy: 3 bounces
    (bounces faked with cards), no caustics, no clamping, Fast GI replace (10 to 30 %
    faster), adaptive sampling, OIDN; tests about 100 samples, finals 500 to 1,500.
    budget="default" keeps Blender's light paths (12 bounces, clamp 10, caustics on).
    glass=True keeps 8 transmission bounces [added] (3 turns thick glass black)."""
    sc = _scene(scene)
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    dev = cycles_gpu(sc) if gpu else "CPU"
    final = quality == "final"
    cy.use_adaptive_sampling = True
    cy.samples = 1024 if final else 128
    cy.adaptive_threshold = 0.01 if final else 0.03
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    if budget == "film":
        cy.max_bounces = 3
        cy.diffuse_bounces = 3
        cy.glossy_bounces = 3
        cy.transmission_bounces = 8 if glass else 3
        cy.max_bounces = max(cy.max_bounces, cy.transmission_bounces)
        cy.volume_bounces = 0
        cy.caustics_reflective = cy.caustics_refractive = False
        cy.sample_clamp_indirect = 0.0
        cy.use_fast_gi = True
        cy.fast_gi_method = "REPLACE"
        cy.ao_bounces_render = 1
    cy.use_light_tree = True
    if pct is None:
        pct = 100 if final else 50
    sc.render.resolution_percentage = pct
    return {"engine": "CYCLES", "device": dev, "samples": cy.samples, "threshold": cy.adaptive_threshold,
            "max_bounces": cy.max_bounces, "fast_gi": cy.use_fast_gi, "pct": pct}


# ======================================================================== color management
def color_setup(scene=None, view="AgX", look=None, exposure=0.0, gamma=1.0, display="sRGB",
                white_balance=None):
    """View transform + look + exposure. Looks are prefixed per view in 5.x ('AgX - Punchy');
    this accepts 'Punchy' and adds the prefix. ACES 1.3/2.0 and False Color have no looks.
    Global brightness goes in `exposure`, not in scaled lights (Jacob Holiday): one
    reversible knob that keeps every ratio, including the world and emissive surfaces a
    light-scaling pass forgets (measured in test_12: exposure +1 equals every emitter x2,
    lamps-only x2 does not). View: AgX for scenes; 'Khronos PBR Neutral' when a product or
    brand colour must display as authored (Jacob; measured in test_12: base colour kept
    within a few 8-bit steps in a white furnace, AgX shifts it); not for skin (Gleb:
    oversaturates)."""
    sc = _scene(scene)
    sc.display_settings.display_device = display
    vs = sc.view_settings
    vs.view_transform = view
    if look in (None, "", "None"):
        vs.look = "None"
    else:
        for cand in (look, f"{view} - {look}"):
            try:
                vs.look = cand
                break
            except TypeError:
                continue
        else:
            raise ValueError(f"look {look!r} not valid for view {view!r}")
    vs.exposure = exposure
    vs.gamma = gamma
    if white_balance:
        vs.use_white_balance = True
        vs.white_balance_temperature = white_balance
    return {"view": vs.view_transform, "look": vs.look, "exposure": vs.exposure, "display": display}


def working_space(name="Linear Rec.709", convert_colors=True):
    """Set the file's working space once at project start (read-only property in 5.x; the
    operator converts existing colors). Options: 'Linear Rec.709', 'Linear Rec.2020', 'ACEScg'.
    Rec.2020 over ACEScg unless exchanging ACES (5.0 overview); the space changes renders
    (Vegdahl), so never switch mid-project."""
    cur = bpy.data.colorspace.working_space
    if cur != name:
        bpy.ops.wm.set_working_color_space(working_space=name, convert_colors=convert_colors)
    return bpy.data.colorspace.working_space


def color_audit(scene=None):
    """Jacob Holiday's pipeline traps as checks. Returns a list of problems (strings)."""
    sc = _scene(scene)
    probs = []
    vs = sc.view_settings
    if vs.view_transform == "Standard":
        probs.append("view transform Standard clips highlights above 1.0: use AgX/ACES/Khronos PBR Neutral")
    for m in bpy.data.materials:
        if not m.node_tree or m.users == 0:
            continue
        for link in m.node_tree.links:
            n = link.from_node
            if n.bl_idname != "ShaderNodeTexImage" or n.image is None:
                continue
            cs = n.image.colorspace_settings.name
            to = link.to_socket.name
            to_node = link.to_node.bl_idname
            data_dest = to in DATA_INPUTS or to_node in {"ShaderNodeNormalMap", "ShaderNodeBump",
                                                         "ShaderNodeDisplacement"}
            if data_dest and cs != "Non-Color":
                probs.append(f"{m.name}: image '{n.image.name}' feeds {to} but is '{cs}' (use Non-Color)")
            if to in COLOR_INPUTS and to_node == "ShaderNodeBsdfPrincipled" and cs == "Non-Color":
                probs.append(f"{m.name}: image '{n.image.name}' feeds {to} but is Non-Color")
    ims = sc.render.image_settings
    if ims.file_format in {"PNG", "JPEG", "TIFF"} and ims.color_management == "OVERRIDE":
        probs.append("display-format output overrides color management: finals should Follow Scene")
    for cam in (o for o in sc.objects if o.type == "CAMERA"):
        for bgi in cam.data.background_images:
            if bgi.image and not bgi.image.use_view_as_render:
                probs.append(f"camera {cam.name}: background image not View as Render")
    return probs


# ======================================================================== compositor (5.x)
def comp_tree(scene=None, name="BX_Comp", reset=True):
    """Get-or-create the compositing node group (5.x: scene.compositing_node_group, Group
    Output replaces Composite). Returns (tree, render_layers_node, group_output_node)."""
    sc = _scene(scene)
    tree = bpy.data.node_groups.get(name)
    if tree is None:
        tree = bpy.data.node_groups.new(name, "CompositorNodeTree")
    if reset:
        tree.nodes.clear()
    if not any(s.in_out == "OUTPUT" for s in tree.interface.items_tree if s.item_type == "SOCKET"):
        tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    rl = next((n for n in tree.nodes if n.bl_idname == "CompositorNodeRLayers"), None) or \
        tree.nodes.new("CompositorNodeRLayers")
    out = next((n for n in tree.nodes if n.bl_idname == "NodeGroupOutput"), None) or \
        tree.nodes.new("NodeGroupOutput")
    rl.location, out.location = (-600, 0), (900, 0)
    sc.compositing_node_group = tree
    sc.render.use_compositing = True
    return tree, rl, out


def load_comp_asset(name):
    """Append a built-in compositor asset (Vignette, Tune Image, Film Grain, Chromatic
    Aberration, Sensor Noise, Split Toning, Unsharp Mask...) once and return the group."""
    ng = bpy.data.node_groups.get(name)
    if ng is not None:
        return ng
    path = os.path.join(bpy.utils.system_resource("DATAFILES"), ESSENTIALS)
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        if name not in src.node_groups:
            raise KeyError(f"{name} not in {path}: {src.node_groups}")
        dst.node_groups = [name]
    return bpy.data.node_groups[name]


def _mixrgb(tree, blend, a, b, fac=1.0):
    m = tree.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    m.blend_type = blend
    m.inputs["Factor"].default_value = fac
    tree.links.new(m.inputs[6], a)
    tree.links.new(m.inputs[7], b)
    return m.outputs[2]


def back_to_beauty(tree, rl, volume=False):
    """Robin Ruud's rebuild: sum over Diffuse/Glossy/Transmission of (Direct + Indirect) x
    Color, plus Emission and Environment (+ Volume Direct/Indirect). Needs those passes on
    the view layer. Returns the rebuilt color socket (exact to 1e-8 in Cycles)."""
    acc = None
    for c in ("Diffuse", "Glossy", "Transmission"):
        comp = _mixrgb(tree, "MULTIPLY", _mixrgb(tree, "ADD", rl.outputs[f"{c} Direct"],
                                                 rl.outputs[f"{c} Indirect"]), rl.outputs[f"{c} Color"])
        acc = comp if acc is None else _mixrgb(tree, "ADD", acc, comp)
    acc = _mixrgb(tree, "ADD", _mixrgb(tree, "ADD", acc, rl.outputs["Emission"]), rl.outputs["Environment"])
    if volume:
        acc = _mixrgb(tree, "ADD", acc, _mixrgb(tree, "ADD", rl.outputs["Volume Direct"],
                                                rl.outputs["Volume Indirect"]))
    return acc


def enable_beauty_passes(view_layer=None, volume=False):
    vl = view_layer or bpy.context.view_layer
    for c in ("diffuse", "glossy", "transmission"):
        for k in ("direct", "indirect", "color"):
            setattr(vl, f"use_pass_{c}_{k}", True)
    vl.use_pass_emit = vl.use_pass_environment = True
    if volume:
        vl.cycles.use_pass_volume_direct = vl.cycles.use_pass_volume_indirect = True


def comp_finish(scene=None, bloom=0.2, threshold=1.0, bloom_size=0.5, vignette=0.25,
                feather=0.4, contrast=0.0, color_boost=0.0, exposure=0.0, source=None,
                quality="High"):
    """Pau Homs' minimum finish: a bit of bloom, a vignette, then a correction to give back
    the punch bloom takes; stop before it reads as a filter. Chain: [source or Render
    Layers Image] > Glare (Bloom) > Vignette asset > Tune Image asset > Exposure > Output.
    Any argument set to 0/None skips its node. Returns dict of nodes."""
    sc = _scene(scene)
    if source is not None:          # continue the tree that owns the source (back_to_beauty, lightgroup_mix)
        tree = source.id_data
        out = next(n for n in tree.nodes if n.bl_idname == "NodeGroupOutput")
        rl = next((n for n in tree.nodes if n.bl_idname == "CompositorNodeRLayers"), None)
    else:
        tree, rl, out = comp_tree(sc, reset=True)
    sock = source if source is not None else rl.outputs["Image"]
    nodes = {"tree": tree, "rl": rl, "out": out}
    x = -300
    if bloom:
        g = tree.nodes.new("CompositorNodeGlare")
        g.inputs["Type"].default_value = "Bloom"
        g.inputs["Quality"].default_value = quality
        g.inputs["Threshold"].default_value = threshold
        g.inputs["Strength"].default_value = bloom
        g.inputs["Size"].default_value = bloom_size
        tree.links.new(g.inputs["Image"], sock)
        sock, nodes["glare"] = g.outputs["Image"], g
        g.location = (x, 0); x += 250
    if vignette:
        v = tree.nodes.new("CompositorNodeGroup")
        v.node_tree = load_comp_asset("Vignette")
        v.inputs["Factor"].default_value = vignette
        v.inputs["Feather"].default_value = feather
        tree.links.new(v.inputs["Image"], sock)
        sock, nodes["vignette"] = v.outputs[0], v
        v.location = (x, 0); x += 250
    if contrast or color_boost:
        t = tree.nodes.new("CompositorNodeGroup")
        t.node_tree = load_comp_asset("Tune Image")
        t.inputs["Contrast"].default_value = contrast
        t.inputs["Color Boost"].default_value = color_boost
        tree.links.new(t.inputs["Image"], sock)
        sock, nodes["tune"] = t.outputs[0], t
        t.location = (x, 0); x += 250
    if exposure:
        e = tree.nodes.new("CompositorNodeExposure")
        e.inputs["Exposure"].default_value = exposure
        tree.links.new(e.inputs["Image"], sock)
        sock, nodes["exposure"] = e.outputs["Image"], e
        e.location = (x, 0); x += 250
    tree.links.new(out.inputs[0], sock)
    return nodes


def matte(tree, names, scene=None):
    """Cryptomatte matte socket for objects by name (no eyedropper): drive a Factor with it.
    Enables the object Cryptomatte pass on the active view layer."""
    sc = _scene(scene)
    bpy.context.view_layer.use_pass_cryptomatte_object = True
    cm = tree.nodes.new("CompositorNodeCryptomatteV2")
    cm.scene = sc
    cm.matte_id = ", ".join(names)
    return cm.outputs["Matte"]


def relative_px(tree, image_socket, fraction, dimension="X"):
    """Relative To Pixel: express a pixel-unit input as a fraction of the image (Pau Homs)
    so viewport and final render match. Returns the float output socket."""
    rp = tree.nodes.new("CompositorNodeRelativeToPixel")
    rp.data_type = "FLOAT"
    rp.reference_dimension = dimension
    tree.links.new(rp.inputs["Image"], image_socket)
    rp.inputs[1].default_value = fraction
    return rp.outputs[1]


def file_output(tree, directory, items, file_name="pass_", multilayer=True, depth="16"):
    """File Output node (5.x API: directory, file_name, file_output_items). items maps
    name -> socket. Multilayer EXR half float by default."""
    fo = tree.nodes.new("CompositorNodeOutputFile")
    fo.directory = directory
    fo.file_name = file_name
    if multilayer:
        fo.format.media_type = "MULTI_LAYER_IMAGE"
        fo.format.color_depth = depth
        fo.format.exr_codec = "DWAA"
    for name, sock in items.items():
        typ = "FLOAT" if sock.type == "VALUE" else "RGBA"
        fo.file_output_items.new(typ, name)
        tree.links.new(fo.inputs[name], sock)
    return fo


# ======================================================================== light groups (Cycles)
def _emits(ob):
    """True when a mesh object's material emits (Principled emission or an Emission node)."""
    if ob.type != "MESH":
        return False
    for slot in ob.material_slots:
        m = slot.material
        if m is None or m.node_tree is None:
            continue
        for n in m.node_tree.nodes:
            if n.bl_idname == "ShaderNodeBsdfPrincipled":
                s, c = n.inputs["Emission Strength"], n.inputs["Emission Color"]
                if (s.is_linked or s.default_value > 0) and (c.is_linked or max(c.default_value[:3]) > 0):
                    return True
            elif n.bl_idname == "ShaderNodeEmission":
                if n.inputs["Strength"].is_linked or n.inputs["Strength"].default_value > 0:
                    return True
    return False


def light_groups(groups, world=None, rest="rest", scene=None, view_layer=None):
    """Light groups: render once, then rebalance key, fill, rim, window in the compositor
    without re-rendering (Wyatt: separate what you may grade independently, M4v_hfGF4EM
    00:07:57; Robin: studios split light so late changes need no 3D re-render,
    vtdczoXVyvQ 00:32:55). CYCLES ONLY in 5.2.1: EEVEE's Render Layers node exposes no
    Combined_<group> outputs (verified); in EEVEE use light linking and view layers.

    groups: {"key": [light objects], "window": [...], ...}. The group lives on the OBJECT
    (`obj.lightgroup`, like light_linking; a Light datablock is resolved by light_object)
    and on the world (`world.lightgroup`). Emissive meshes are lights too. Every light and
    emissive mesh not listed, and the world when `world` is None, go to `rest`, so the
    groups add back up to the beauty (rest=None leaves them out and reports them).
    Creates the view layer's lightgroups. Returns {"groups", "world", "unassigned"}."""
    sc = _scene(scene)
    vl = view_layer or (bpy.context.view_layer if sc == bpy.context.scene else sc.view_layers[0])
    listed, out = set(), {}
    for g, members in groups.items():
        if g not in vl.lightgroups:
            vl.lightgroups.add(name=g)
        for m in members if isinstance(members, (list, tuple, set)) else [members]:
            if m is None:
                continue
            ob = light_object(m) if isinstance(m, bpy.types.Light) else m
            ob.lightgroup = g
            listed.add(ob.name)
            out.setdefault(g, []).append(ob.name)
    unassigned = []
    for o in sc.objects:
        if o.name in listed or not (o.type == "LIGHT" or _emits(o)):
            continue
        if rest:
            o.lightgroup = rest
            out.setdefault(rest, []).append(o.name)
        else:
            o.lightgroup = ""
            unassigned.append(o.name)
    if sc.world is not None:
        sc.world.lightgroup = world or rest or ""
        if not sc.world.lightgroup:
            unassigned.append("World")
    for g in set(out) | ({sc.world.lightgroup} if sc.world is not None and sc.world.lightgroup else set()):
        if g not in vl.lightgroups:
            vl.lightgroups.add(name=g)
    return {"groups": out, "world": sc.world.lightgroup if sc.world is not None else None,
            "unassigned": unassigned}


def _exr_parts(path):
    inp = oiio.ImageInput.open(path)
    if inp is None:
        raise IOError(oiio.geterror())
    names, i = [], 0
    try:
        while inp.seek_subimage(i, 0):
            names.append(inp.spec().getattribute("name") or "")
            i += 1
    finally:
        inp.close()
    return names


def lightgroup_passes(exr_path):
    """{'Combined': HxWx3, '<group>': HxWx3, ...} linear, from a Cycles multilayer EXR written
    by render() (parts '<ViewLayer>.Combined_<group>'; composite parts are skipped)."""
    out = {}
    for n in _exr_parts(exr_path):
        if n.startswith("Composite."):
            continue
        tail = n.split(".", 1)[-1]
        if tail == "Combined":
            out["Combined"] = load_rgba(exr_path, part=n)[..., :3]
        elif tail.startswith("Combined_"):
            out[tail[len("Combined_"):]] = load_rgba(exr_path, part=n)[..., :3]
    return out


def _gain3(g):
    a = np.asarray(g, dtype=np.float32).reshape(-1)
    return np.repeat(a, 3)[:3] if a.size == 1 else a[:3]


def rebalance(exr_path, gains, passes=None):
    """Numpy twin of lightgroup_mix: linear image = sum over groups of gain x Combined_<group>.
    gain: float or RGB (recolour a light after the render, Pau Homs); groups missing from
    `gains` keep 1. Iterate the balance numerically with analyse() and no render at all."""
    P = passes or lightgroup_passes(exr_path)
    groups = [g for g in P if g != "Combined"]
    bad = [g for g in gains if g not in groups]
    if bad:
        raise ValueError(f"no light group {bad} in {exr_path}: {groups}")
    acc = np.zeros_like(P[groups[0]])
    for g in groups:
        acc += P[g] * _gain3(gains.get(g, 1.0))
    return acc


def lightgroup_check(exr_path, mask=None, passes=None):
    """Do the groups add back up to the beauty? rel_error = mean |sum(groups) - Combined| /
    mean(Combined); a large value means a light, an emissive mesh or the world sits in no
    group. share = each group's part of the frame (or of the masked subject)."""
    P = passes or lightgroup_passes(exr_path)
    groups = [g for g in P if g != "Combined"]
    C = P["Combined"]
    s = sum(P[g] for g in groups)
    m = np.ones(C.shape[:2], bool) if mask is None else np.asarray(mask) > 0.5
    tot = float(luma(C)[m].mean()) or 1e-9
    return {"groups": groups,
            "rel_error": round(float(np.abs(s - C).mean() / max(float(C.mean()), 1e-9)), 5),
            "share": {g: round(float(luma(P[g])[m].mean()) / tot, 3) for g in groups}}


def lightgroup_mix(gains, exr=None, scene=None, name="BX_LightMix"):
    """Light-group rebalance in the 5.x compositor: Combined_<group> x gain, summed, into the
    Group Output. Gains are floats or RGB tuples; groups not in `gains` stay at 1.

    exr=None: uses the Render Layers of `scene` (Cycles, after light_groups); the next
    render writes the rebalanced frame. exr=path: builds a comp-only scene 'BX_Regrade'
    that reads the multilayer EXR through an Image node, with the source scene's colour
    management and the EXR's resolution: `render(base, scene=result["scene"])` re-grades
    in about 0.1 s (measured) instead of re-rendering 3D. Change a gain later with
    set_gain(result, group, value). Pass result["socket"] as comp_finish(source=...) for
    bloom and vignette on top (same scene). Returns {"scene", "tree", "socket", "gains"}."""
    src = _scene(scene)
    if exr is None:
        if src.render.engine != "CYCLES":
            raise RuntimeError("light groups are Cycles only in 5.2.1 (EEVEE Render Layers has no "
                               "Combined_<group> outputs): use light linking and view layers in EEVEE")
        sc = src
        tree, rl, out = comp_tree(sc, name=name)
        rl.layer = (bpy.context.view_layer if sc == bpy.context.scene else sc.view_layers[0]).name
        feed = rl
    else:
        sc = bpy.data.scenes.get("BX_Regrade") or bpy.data.scenes.new("BX_Regrade")
        inp = oiio.ImageInput.open(exr)
        w, h = inp.spec().width, inp.spec().height
        inp.close()
        r = sc.render
        r.engine = "BLENDER_WORKBENCH"
        r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
        sc.display_settings.display_device = src.display_settings.display_device
        vs, vs0 = sc.view_settings, src.view_settings
        vs.view_transform = vs0.view_transform
        vs.look, vs.exposure, vs.gamma = vs0.look, vs0.exposure, vs0.gamma
        tree, rl, out = comp_tree(sc, name=name + "_regrade")
        tree.nodes.remove(rl)
        img = bpy.data.images.load(exr, check_existing=True)
        img.reload()
        feed = tree.nodes.new("CompositorNodeImage")
        feed.image = img
        feed.location = (-600, 0)
    groups = [o.name[len("Combined_"):] for o in feed.outputs if o.name.startswith("Combined_") and o.enabled]
    bad = [g for g in gains if g not in groups]
    if not groups or bad:
        raise ValueError(f"light groups available {groups}, asked {list(gains)}")
    acc, nodes = None, {}
    for i, g in enumerate(groups):
        m = tree.nodes.new("ShaderNodeMix")
        m.data_type, m.blend_type, m.name, m.label = "RGBA", "MULTIPLY", f"LG gain {g}", f"gain {g}"
        m.inputs["Factor"].default_value = 1.0
        tree.links.new(m.inputs[6], feed.outputs[f"Combined_{g}"])
        m.inputs[7].default_value = (*_gain3(gains.get(g, 1.0)), 1.0)
        m.location = (-350, 200 - 160 * i)
        nodes[g] = m
        acc = m.outputs[2] if acc is None else _mixrgb(tree, "ADD", acc, m.outputs[2])
    tree.links.new(out.inputs[0], acc)
    return {"scene": sc, "tree": tree, "socket": acc, "gains": nodes}


def set_gain(mix, group, gain):
    """Change one light group's gain in a lightgroup_mix result (then re-render its scene)."""
    mix["gains"][group].inputs[7].default_value = (*_gain3(gain), 1.0)
    return mix


def clay(on=True, albedo=0.5, view_layer=None, name="BX_Clay"):
    """Grey material override on the view layer (works in EEVEE and Cycles in 5.x): judge
    lighting form without albedo contrast (Andy: judge under neutral light; the baseline's
    clay pass). clay(False) restores the materials."""
    vl = view_layer or bpy.context.view_layer
    if not on:
        vl.material_override = None
        return None
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (albedo, albedo, albedo, 1)
    p.inputs["Roughness"].default_value = 0.6
    vl.material_override = m
    return m


# ======================================================================== stylized / NPR
def toon_material(name, color, shadow_color=None, threshold=0.5, band=0.06, band_color=None,
                  aov="toon_mask"):
    """EEVEE-only cel material (Shader to RGB): Diffuse > Shader to RGB > constant ramp gives
    a lit/shadow factor; lit = color, shadow = shadow_color (default: color pushed cool and
    dark [added]); optional saturated band at the terminator (Wyatt Hall: Arcane-style band,
    blue at night). Writes the lit/shadow factor to an AOV for comp (register_aovs)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    dif.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    nt.links.new(s2r.inputs["Shader"], dif.outputs["BSDF"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    el = ramp.color_ramp.elements
    # factor from the ramp's ALPHA (exact 0/1): a Color->float link reads 0.88 for white in
    # 5.2.1 EEVEE [observed], which would leak shadow color into lit areas
    el[0].position, el[0].color = 0.0, (0, 0, 0, 0)
    el[1].position, el[1].color = threshold, (1, 1, 1, 1)
    nt.links.new(ramp.inputs["Fac"], s2r.outputs["Color"])
    sc_ = shadow_color or (color[0] * 0.35, color[1] * 0.4, color[2] * 0.6)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (*sc_[:3], 1)
    mix.inputs[7].default_value = (*color[:3], 1)
    nt.links.new(mix.inputs["Factor"], ramp.outputs["Alpha"])
    col = mix.outputs[2]
    if band_color is not None:
        br = nt.nodes.new("ShaderNodeValToRGB")
        br.color_ramp.interpolation = "CONSTANT"
        be = br.color_ramp.elements
        be[0].position, be[0].color = 0.0, (0, 0, 0, 0)
        be[1].position, be[1].color = max(0.0, threshold - band), (1, 1, 1, 1)
        e3 = be.new(threshold)
        e3.color = (0, 0, 0, 0)
        nt.links.new(br.inputs["Fac"], s2r.outputs["Color"])
        bm = nt.nodes.new("ShaderNodeMix")
        bm.data_type = "RGBA"
        bm.inputs[7].default_value = (*band_color[:3], 1)
        nt.links.new(bm.inputs["Factor"], br.outputs["Alpha"])
        nt.links.new(bm.inputs[6], col)
        col = bm.outputs[2]
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(em.inputs["Color"], col)
    nt.links.new(out.inputs["Surface"], em.outputs["Emission"])
    if aov:
        a = nt.nodes.new("ShaderNodeOutputAOV")
        a.aov_name = aov
        nt.links.new(a.inputs["Value"], ramp.outputs["Alpha"])
    return m


def register_aovs(scene=None):
    """Add a view-layer AOV for every AOV Output node found in materials (Wyatt Hall: a name
    typed differently renders nothing, silently). Returns the names added."""
    sc = _scene(scene)
    added = []
    for vl in sc.view_layers:
        have = {a.name for a in vl.aovs}
        for mat in bpy.data.materials:
            if not mat.node_tree:
                continue
            for n in mat.node_tree.nodes:
                if n.bl_idname == "ShaderNodeOutputAOV" and n.aov_name and n.aov_name not in have:
                    a = vl.aovs.add()
                    a.name = n.aov_name
                    a.type = "VALUE" if (n.inputs["Value"].is_linked and not n.inputs["Color"].is_linked) else "COLOR"
                    have.add(n.aov_name)
                    added.append((vl.name, n.aov_name, a.type))
    return added


def outline_hull(obj, thickness=0.01, color=(0.02, 0.015, 0.01), name="BX_Outline"):
    """Inverted-hull outline: Solidify with flipped normals pushed outward, extra material
    slots pointing at a back-face-culled dark emission material that is transparent to
    shadow rays (the shell encloses the mesh and would otherwise shadow it). EEVEE and
    Cycles. One of three outline options (hull, Freestyle, Grease Pencil Line Art)."""
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*color[:3], 1)
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        lp = nt.nodes.new("ShaderNodeLightPath")
        mx = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(mx.inputs["Fac"], lp.outputs["Is Shadow Ray"])
        nt.links.new(mx.inputs[1], em.outputs["Emission"])
        nt.links.new(mx.inputs[2], tr.outputs["BSDF"])
        nt.links.new(out.inputs["Surface"], mx.outputs["Shader"])
        m.use_backface_culling = True
        m.use_transparent_shadow = True
    n = max(1, len(obj.data.materials))
    if not obj.data.materials:
        obj.data.materials.append(None)
    if name not in [s.material.name for s in obj.material_slots if s.material]:
        for _ in range(n):
            obj.data.materials.append(m)
    md = obj.modifiers.get(name) or obj.modifiers.new(name, "SOLIDIFY")
    md.thickness = thickness
    md.offset = 1.0
    md.use_flip_normals = True
    md.use_rim = False
    md.material_offset = n
    return md


def freestyle(scene=None, thickness=1.5, color=(0.02, 0.015, 0.01), on=True):
    """Freestyle lines (EEVEE and Cycles, rendered with the image): silhouette, border and
    crease by default. Thickness in pixels at 100 %."""
    sc = _scene(scene)
    sc.render.use_freestyle = on
    sc.render.line_thickness_mode = "ABSOLUTE"
    sc.render.line_thickness = thickness
    for vl in sc.view_layers:
        vl.use_freestyle = on
        fs = vl.freestyle_settings
        if not fs.linesets:
            fs.linesets.new("BX_Lines")
        for ls in fs.linesets:
            ls.linestyle.color = color[:3]
    return sc.render.use_freestyle


# ======================================================================== rendering
def render(path_base, scene=None, exr=True, depth="32"):
    """Render the scene camera to <path_base>.png (display-referred, view transform baked,
    Follow Scene) and optionally <path_base>.exr (multilayer, scene-linear, all passes).
    Restores the output settings. Returns {"png", "exr", "seconds"}."""
    sc = _scene(scene)
    ims = sc.render.image_settings
    saved = (ims.media_type, ims.file_format, ims.color_depth, ims.color_mode, ims.color_management,
             sc.render.filepath)
    os.makedirs(os.path.dirname(path_base) or ".", exist_ok=True)
    t0 = time.time()
    res = {"png": path_base + ".png", "exr": None}
    try:
        if exr:
            ims.media_type = "MULTI_LAYER_IMAGE"
            ims.color_depth = depth
            sc.render.filepath = path_base + ".exr"
            bpy.ops.render.render(write_still=True, scene=sc.name)
            res["exr"] = path_base + ".exr"
            ims.media_type = "IMAGE"
            ims.file_format = "PNG"
            ims.color_depth = "8"
            ims.color_mode = "RGB"
            ims.color_management = "FOLLOW_SCENE"
            bpy.data.images["Render Result"].save_render(filepath=res["png"], scene=sc)
        else:
            ims.media_type = "IMAGE"
            ims.file_format = "PNG"
            ims.color_depth = "8"
            ims.color_mode = "RGB"
            ims.color_management = "FOLLOW_SCENE"
            sc.render.filepath = res["png"]
            bpy.ops.render.render(write_still=True, scene=sc.name)
    finally:
        ims.media_type = saved[0]
        try:
            ims.file_format = saved[1]
        except TypeError:
            pass
        ims.color_depth, ims.color_mode, ims.color_management = saved[2], saved[3], saved[4]
        sc.render.filepath = saved[5]
    res["seconds"] = round(time.time() - t0, 2)
    return res


def load_rgba(path, part=None):
    """Image as float32 HxWx4, row 0 at the TOP. PNG values are display-encoded; EXR values
    scene-linear. `part` picks an EXR part by suffix ('Combined', 'Composite.Combined')."""
    if oiio is not None:
        inp = oiio.ImageInput.open(path)
        if inp is None:
            raise IOError(oiio.geterror())
        try:
            names, idx = [], 0
            while inp.seek_subimage(idx, 0):
                names.append(inp.spec().getattribute("name") or "")
                idx += 1
            chosen = 0
            if part is not None:
                chosen = next((i for i, n in enumerate(names) if n == part or n.endswith("." + part)), 0)
            elif path.lower().endswith(".exr"):
                chosen = next((i for i, n in enumerate(names) if n == "Composite.Combined"),
                              next((i for i, n in enumerate(names) if n.endswith("Combined")), 0))
            inp.seek_subimage(chosen, 0)
            # OIIO 3.x: read_image(subimage, miplevel, chbegin, chend, format)
            a = inp.read_image(chosen, 0, 0, inp.spec().nchannels, oiio.FLOAT)
        finally:
            inp.close()
        a = np.asarray(a, dtype=np.float32)
        if a.ndim == 2:
            a = a[..., None]
        if a.shape[2] == 1:
            a = np.repeat(a, 3, axis=2)
        if a.shape[2] == 3:
            a = np.concatenate([a, np.ones(a.shape[:2] + (1,), np.float32)], axis=2)
        return a[..., :4]
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(h, w, 4)[::-1].copy()


def save_png(arr, path):
    """Write an HxW or HxWx3/4 float array (row 0 top, values 0..1) as PNG."""
    a = np.clip(np.asarray(arr, dtype=np.float32), 0, 1)
    if a.ndim == 2:
        a = np.repeat(a[..., None], 3, axis=2)
    h, w, c = a.shape
    if oiio is not None:
        buf = oiio.ImageBuf(oiio.ImageSpec(w, h, c, oiio.FLOAT))
        buf.set_pixels(oiio.ROI(0, w, 0, h, 0, 1, 0, c), a)
        if not buf.write(path):
            raise IOError(buf.geterror())
        return path
    im = bpy.data.images.new("bx_png", w, h, alpha=True)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :c] = a[..., :4]
    im.pixels = rgba[::-1].ravel()
    im.filepath_raw, im.file_format = path, "PNG"
    im.save()
    bpy.data.images.remove(im)
    return path


def mask_workbench(subject, scene=None, path=None):
    """Visible-silhouette mask of the subject from the scene camera, any engine: a flat
    Workbench render with the subject white and everything else black (occluders count).
    Returns a float coverage array (row 0 top, anti-aliased edges); > 0.5 for a bool mask."""
    sc = _scene(scene)
    subj = set(o.name for o in _objs(subject))
    sh = sc.display.shading
    saved = dict(engine=sc.render.engine, light=sh.light, ct=sh.color_type, cav=sh.show_cavity,
                 sha=sh.show_shadows, spec=sh.show_specular_highlight, outl=sh.show_object_outline,
                 view=sc.view_settings.view_transform, look=sc.view_settings.look,
                 expo=sc.view_settings.exposure, comp=sc.render.use_compositing,
                 film=sc.render.film_transparent,
                 wcol=tuple(sc.world.color) if sc.world else None,
                 cols={o.name: tuple(o.color) for o in sc.objects})
    path = path or os.path.join(bpy.app.tempdir or "/tmp", "bx_mask.png")
    try:
        sc.render.engine = "BLENDER_WORKBENCH"
        sh.light, sh.color_type = "FLAT", "OBJECT"
        sh.show_cavity = sh.show_shadows = sh.show_object_outline = False
        sh.show_specular_highlight = False
        sc.view_settings.view_transform = "Standard"
        sc.view_settings.look = "None"
        sc.view_settings.exposure = 0.0
        sc.render.use_compositing = False
        sc.render.film_transparent = False
        if sc.world:
            sc.world.color = (0, 0, 0)
        for o in sc.objects:
            o.color = (1, 1, 1, 1) if o.name in subj else (0, 0, 0, 1)
        render(os.path.splitext(path)[0], sc, exr=False)
    finally:
        sc.render.engine = saved["engine"]
        sh.light, sh.color_type = saved["light"], saved["ct"]
        sh.show_cavity, sh.show_shadows = saved["cav"], saved["sha"]
        sh.show_specular_highlight, sh.show_object_outline = saved["spec"], saved["outl"]
        sc.view_settings.view_transform = saved["view"]
        sc.view_settings.look = saved["look"]
        sc.view_settings.exposure = saved["expo"]
        sc.render.use_compositing = saved["comp"]
        sc.render.film_transparent = saved["film"]
        if sc.world and saved["wcol"] is not None:
            sc.world.color = saved["wcol"]
        for o in sc.objects:
            if o.name in saved["cols"]:
                o.color = saved["cols"][o.name]
    return load_rgba(path)[..., 0]


def mask_cryptomatte(exr_path, names, kind="Object"):
    """Coverage mask of named objects (or materials/assets) decoded from the Cryptomatte
    layers of a multilayer EXR (EEVEE and Cycles; EEVEE 5.2.1 writes no Object Index pass).
    Needs view_layer.use_pass_cryptomatte_object (or _material/_asset) before rendering."""
    if oiio is None:
        raise RuntimeError("OpenImageIO not available")
    names = [names] if isinstance(names, str) else list(names)
    inp = oiio.ImageInput.open(exr_path)
    manifest, parts, idx = {}, [], 0
    while inp.seek_subimage(idx, 0):
        spec = inp.spec()
        nm = spec.getattribute("name") or ""
        for a in spec.extra_attribs:
            if a.name.startswith("cryptomatte/") and a.name.endswith("/manifest"):
                key = a.name.split("/")[1]
                lname = spec.getattribute(f"cryptomatte/{key}/name") or ""
                if lname.endswith("Crypto" + kind):
                    manifest.update(json.loads(a.value))
        if ("Crypto" + kind) in nm:
            parts.append(idx)
        idx += 1
    missing = [n for n in names if n not in manifest]
    if missing:
        inp.close()
        raise KeyError(f"not in cryptomatte manifest: {missing}; have {sorted(manifest)}")
    ids = [struct.unpack("<f", struct.pack("<I", int(manifest[n], 16)))[0] for n in names]
    cov = None
    for p in parts:
        inp.seek_subimage(p, 0)
        a = np.asarray(inp.read_image(p, 0, 0, 4, oiio.FLOAT), dtype=np.float32)
        if cov is None:
            cov = np.zeros(a.shape[:2], np.float32)
        for rank in (0, 2):
            idc, cv = a[..., rank], a[..., rank + 1]
            for i in ids:
                cov += np.where(idc == np.float32(i), cv, 0)
    inp.close()
    return np.clip(cov, 0, 1)


# ======================================================================== analysis
def _box_sum(a, r):
    a = np.asarray(a, dtype=np.float64)
    p = np.pad(a, ((r + 1, r), (r + 1, r)))
    c = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]


def _box_mean(a, r):
    return _box_sum(a, r) / _box_sum(np.ones_like(a, dtype=np.float64), r)


def _masked_mean(a, m, r):
    num = _box_sum(a * m, r)
    den = _box_sum(m.astype(np.float64), r)
    return num / np.maximum(den, 1e-9), den


def luma(rgb):
    return np.asarray(rgb[..., :3], dtype=np.float32) @ LUMA


def value_bands(Y, k=4, iters=30):
    """1-D k-means on display luma: the 3 to 5 value groups a painter would squint to.
    Returns (sorted centers, shares, label map)."""
    y = Y.ravel()
    sample = y[:: max(1, y.size // 200000)]
    c = np.quantile(sample, (np.arange(k) + 0.5) / k)
    for _ in range(iters):
        lab = np.abs(sample[:, None] - c[None, :]).argmin(1)
        new = np.array([sample[lab == i].mean() if np.any(lab == i) else c[i] for i in range(k)])
        if np.allclose(new, c, atol=1e-5):
            break
        c = new
    c = np.sort(c)
    labels = np.abs(Y[..., None] - c[None, None, :]).argmin(-1)
    shares = np.bincount(labels.ravel(), minlength=k) / labels.size
    return c, shares, labels


def _hue_sat(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb[..., :3].max(-1), rgb[..., :3].min(-1)
    d = mx - mn + 1e-8
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return hue, sat


def analyse(png, mask=None, exr=None, bands=4, focus_point=None):
    """Numbers an expert reads by eye, from the display PNG (+ optional linear EXR and a
    subject mask). Keys:
      zones_pct            10-zone display-luma histogram (% of pixels)
      crush_pct, clip_pct  display luma <= 0.01 / >= 0.99
      linear_max, over1_pct  from the EXR (bloom candidates; AgX hides clipping in the PNG)
      bands                k-means value groups: centers, shares, min gap between centers
      subject              medians inside/outside the mask, local ring contrast, edge merge
      focus                where the local-contrast peak is and how concentrated on the subject
      squint               16x9 grid visual weight: max cell vs subject, left/right balance
      vignette_ratio       border mean / center mean (below 1 = darker edges)
      hue                  saturated-hue clusters (vectorscope substitute)
      thirds               subject centroid distance to the nearest thirds point
    """
    rgb = load_rgba(png)[..., :3]
    H, W = rgb.shape[:2]
    Y = luma(rgb)
    diag = math.hypot(H, W)
    rep = {"size": [W, H]}
    hist, _ = np.histogram(Y, bins=10, range=(0, 1))
    rep["zones_pct"] = (100 * hist / Y.size).round(1).tolist()
    rep["crush_pct"] = round(float(100 * (Y <= 0.01).mean()), 2)
    rep["clip_pct"] = round(float(100 * (Y >= 0.99).mean()), 2)
    rep["mean_luma"] = round(float(Y.mean()), 3)
    p2, p98 = np.quantile(Y, (0.02, 0.98))
    rep["value_range"] = [round(float(p2), 3), round(float(p98), 3)]
    if exr:
        lin = load_rgba(exr)[..., :3]
        Yl = luma(lin)
        rep["linear_max"] = round(float(Yl.max()), 3)
        rep["over1_pct"] = round(float(100 * (Yl > 1.0).mean()), 2)
    c, sh, labels = value_bands(Y, bands)
    rep["bands"] = {"centers": c.round(3).tolist(), "shares": sh.round(3).tolist(),
                    "min_gap": round(float(np.diff(c).min()), 3) if bands > 1 else None,
                    "used": int((sh > 0.05).sum())}
    # local contrast map
    r1 = max(2, int(0.015 * diag))
    lc = _box_mean(np.abs(Y - _box_mean(Y, r1)), r1)
    thr = np.quantile(lc, 0.98)
    top = lc >= thr
    pr, pc = np.unravel_index(lc.argmax(), lc.shape)
    rep["focus"] = {"peak_xy": [round(float(pc) / W, 3), round(float(pr) / H, 3)]}
    # squint grid
    gh, gw = 9, 16
    bh, bw = H // gh, W // gw
    S = Y[: bh * gh, : bw * gw].reshape(gh, bh, gw, bw).mean(axis=(1, 3))
    wgt = np.abs(S - S.mean())
    mr, mc = np.unravel_index(wgt.argmax(), wgt.shape)
    rep["squint"] = {"max_cell_rc": [int(mr), int(mc)],
                     "left_weight": round(float(wgt[:, : gw // 2].sum() / max(wgt.sum(), 1e-9)), 3),
                     "top_weight": round(float(wgt[: gh // 2].sum() / max(wgt.sum(), 1e-9)), 3),
                     "edge_weight": round(float((wgt[[0, -1], :].sum() + wgt[1:-1, [0, -1]].sum())
                                                / max(wgt.sum(), 1e-9)), 3)}
    # vignette
    bdr = max(2, int(0.08 * min(H, W)))
    border = np.ones_like(Y, bool)
    border[bdr:-bdr, bdr:-bdr] = False
    center = Y[H // 4: 3 * H // 4, W // 4: 3 * W // 4]
    rep["vignette_ratio"] = round(float(Y[border].mean() / max(center.mean(), 1e-6)), 3)
    # hue clusters (vectorscope substitute)
    hue, sat = _hue_sat(rgb)
    sel = (sat > 0.15) & (Y > 0.03)
    hh, _ = np.histogram(hue[sel], bins=12, range=(0, 360))
    share = hh / max(Y.size, 1)
    clusters, cur = [], None
    for i in list(range(12)):
        if share[i] >= 0.01:
            if cur is None:
                cur = [i]
            else:
                cur.append(i)
        elif cur is not None:
            clusters.append(cur)
            cur = None
    if cur is not None:
        if clusters and clusters[0][0] == 0:
            clusters[0] = cur + clusters[0]
        else:
            clusters.append(cur)
    cl = []
    for bins_ in clusters:
        m = np.zeros_like(sel)
        for b in bins_:
            m |= sel & (hue >= b * 30) & (hue < (b + 1) * 30)
        ang = np.deg2rad(hue[m])
        mean_h = math.degrees(math.atan2(np.sin(ang).mean(), np.cos(ang).mean())) % 360
        cl.append({"hue": round(mean_h, 0), "area_pct": round(float(100 * m.mean()), 1),
                   "mean_sat": round(float(sat[m].mean()), 3)})
    cl.sort(key=lambda d: -d["area_pct"])
    rep["hue"] = {"saturated_pct": round(float(100 * sel.mean()), 1), "clusters": cl}
    if mask is not None:
        m = np.asarray(mask, dtype=np.float32)
        if m.shape != Y.shape:
            raise ValueError(f"mask {m.shape} vs image {Y.shape}")
        mb = m > 0.5
        if mb.sum() < 10:
            rep["subject"] = {"error": "mask empty (subject off screen or hidden)"}
            return rep
        ring_r = max(3, int(0.04 * diag))
        near = (_box_sum(mb.astype(np.float64), ring_r) > 0) & ~mb
        rr = max(2, int(0.006 * diag))
        inner_b = mb & (_box_sum((~mb).astype(np.float64), 1) > 0)
        in_mean, _ = _masked_mean(Y, mb, rr)
        out_mean, out_den = _masked_mean(Y, ~mb, rr)
        valid = inner_b & (out_den > 0)
        diff = np.abs(in_mean - out_mean)[valid]
        subj_med = float(np.median(Y[mb]))
        bg_med = float(np.median(Y[~mb]))
        ring_med = float(np.median(Y[near])) if near.any() else bg_med
        ys, xs = np.nonzero(mb)
        cx, cy = xs.mean() / W, ys.mean() / H
        sp10, sp90 = np.quantile(Y[mb], (0.1, 0.9))
        rep["subject"] = {
            "area_pct": round(float(100 * mb.mean()), 1),
            "internal_range": round(float(sp90 - sp10), 3),
            "internal_ratio": round(float((sp90 + 0.01) / (sp10 + 0.01)), 2),
            "median": round(subj_med, 3), "bg_median": round(bg_med, 3),
            "ring_median": round(ring_med, 3),
            "minus_bg": round(subj_med - bg_med, 3),
            "minus_ring": round(subj_med - ring_med, 3),
            "edge_contrast_median": round(float(np.median(diff)), 3) if diff.size else None,
            "edge_merge_pct": round(float(100 * (diff < 0.05).mean()), 1) if diff.size else None,
            "band": int(np.abs(c - subj_med).argmin()), "ring_band": int(np.abs(c - ring_med).argmin()),
            "mean_sat": round(float(sat[mb].mean()), 3), "bg_mean_sat": round(float(sat[~mb].mean()), 3),
        }
        near_subj = _box_sum(mb.astype(np.float64), max(2, int(0.02 * diag))) > 0
        top_in = float((top & near_subj).sum() / max(top.sum(), 1))
        rep["focus"].update({"peak_on_subject": bool(near_subj[pr, pc]),
                             "top2pct_on_subject": round(top_in, 3),
                             "concentration": round(top_in / max(float(near_subj.mean()), 1e-6), 2)})
        cell = (min(gh - 1, int(cy * gh)), min(gw - 1, int(cx * gw)))
        rep["squint"]["subject_cell_rc"] = list(cell)
        rep["squint"]["max_on_subject"] = bool(abs(cell[0] - mr) <= 1 and abs(cell[1] - mc) <= 1)
        fx, fy = (focus_point if focus_point is not None else (cx, cy))
        rep["thirds"] = {"subject_xy": [round(float(cx), 3), round(float(cy), 3)],
                         "distance": round(min(math.hypot(fx - a, fy - b) for a in (1 / 3, 2 / 3)
                                               for b in (1 / 3, 2 / 3)), 3)}
    return rep


# thresholds [added], calibrated on the workshop fixture renders (tests/code/.../test_04)
THRESH = {"minus_ring": 0.10, "edge_merge_pct": 35.0, "clip_pct": 0.5, "crush_pct": 25.0,
          "value_range": 0.30, "concentration": 1.5, "vignette_ratio": 1.0, "internal_ratio": 2.5}


def verdict(rep, thresholds=None):
    """List of problems from analyse(); thresholds are [added] starting points."""
    t = {**THRESH, **(thresholds or {})}
    p = []
    s = rep.get("subject")
    if s and "error" not in s:
        if abs(s["minus_ring"]) < t["minus_ring"]:
            p.append(f"subject vs surrounding value only {s['minus_ring']:+.3f} (< {t['minus_ring']}): "
                     "separation missing, check desaturated (Andy)")
        if s["edge_merge_pct"] is not None and s["edge_merge_pct"] > t["edge_merge_pct"]:
            p.append(f"silhouette merges with the background on {s['edge_merge_pct']}% of the outline")
        if s["internal_ratio"] < t["internal_ratio"]:
            p.append(f"subject lit flat: its 90th/10th percentile values differ only x{s['internal_ratio']} "
                     "(no light-to-shadow gradient, Andy/Andrew; check for a frontal key)")
        if s["band"] == s["ring_band"]:
            p.append("subject and its surroundings fall in the same value band")
        f = rep["focus"]
        if not f.get("peak_on_subject") and f.get("concentration", 9) < t["concentration"]:
            p.append(f"highest local contrast is off the subject (concentration {f.get('concentration')}): "
                     "competing focal point (Andrew's bright window)")
    if rep["clip_pct"] > t["clip_pct"]:
        p.append(f"{rep['clip_pct']}% of pixels clipped to white")
    if rep["crush_pct"] > t["crush_pct"]:
        p.append(f"{rep['crush_pct']}% of pixels crushed to black (near-black is fine, pure black loses headroom)")
    lo_, hi_ = rep["value_range"]
    if hi_ - lo_ < t["value_range"]:
        p.append(f"narrow value range {lo_}..{hi_} (2nd to 98th percentile): muddy, low contrast overall")
    if rep["vignette_ratio"] > t["vignette_ratio"]:
        p.append(f"frame edges brighter than the center (ratio {rep['vignette_ratio']}): the eye drifts out")
    cl = rep["hue"]["clusters"]
    if len(cl) >= 2:
        a, bb = cl[0], cl[1]
        dh = abs((a["hue"] - bb["hue"] + 180) % 360 - 180)
        if dh > 150 and min(a["mean_sat"], bb["mean_sat"]) > 0.5 and bb["area_pct"] > 0.5 * a["area_pct"]:
            p.append("two saturated complementary hues over similar areas: desaturate the larger one (Lino)")
    return p


def value_study(png, out_path, mask=None, bands=4, width=480):
    """Andy's desaturated check as one image: [desaturated | value groups | squint] side by
    side, subject outline in red on the middle panel. Open it with the image reader."""
    rgb = load_rgba(png)[..., :3]
    H, W = rgb.shape[:2]
    step = max(1, W // width)
    Y = luma(rgb)
    c, _, labels = value_bands(Y, bands)
    post = c[labels]
    sq = np.kron(Y[: (H // 30) * 30, : (W // 30) * 30].reshape(H // 30, 30, W // 30, 30).mean(axis=(1, 3)),
                 np.ones((30, 30)))
    sq = np.pad(sq, ((0, H - sq.shape[0]), (0, W - sq.shape[1])), mode="edge")
    panels = [np.repeat(p[..., None], 3, 2) for p in (Y, post, sq)]
    if mask is not None:
        mb = np.asarray(mask) > 0.5
        edge = mb & (_box_sum((~mb).astype(np.float64), max(1, step)) > 0)
        panels[1][edge] = (1.0, 0.1, 0.1)
    sheet = np.concatenate([p[::step, ::step] for p in panels], axis=1)
    gap = np.ones((sheet.shape[0], 4, 3), np.float32)
    w3 = sheet.shape[1] // 3
    sheet = np.concatenate([sheet[:, :w3], gap, sheet[:, w3:2 * w3], gap, sheet[:, 2 * w3:]], axis=1)
    return save_png(sheet, out_path)


def contact_sheet(paths, out_path, cols=None, width=480):
    """Tile renders into one image (Andy: judge shots in context, not one by one)."""
    imgs = [load_rgba(p)[..., :3] for p in paths]
    cols = cols or min(4, len(imgs))
    tiles = []
    for im in imgs:                       # nearest resample every image to `width`
        h0, w0 = im.shape[:2]
        hh = max(1, round(h0 * width / w0))
        yi = (np.arange(hh) * h0 / hh).astype(int)
        xi = (np.arange(width) * w0 / width).astype(int)
        tiles.append(im[yi][:, xi])
    h = min(t.shape[0] for t in tiles)
    w = min(t.shape[1] for t in tiles)
    tiles = [t[:h, :w] for t in tiles]
    rows = math.ceil(len(tiles) / cols)
    sheet = np.ones((rows * (h + 4), cols * (w + 4), 3), np.float32)
    for i, t in enumerate(tiles):
        r, cc = divmod(i, cols)
        sheet[r * (h + 4): r * (h + 4) + h, cc * (w + 4): cc * (w + 4) + w] = t
    save_png(sheet, out_path)
    with open(os.path.splitext(out_path)[0] + "_legend.txt", "w") as f:
        f.write("\n".join(f"{i}: {os.path.basename(p)}" for i, p in enumerate(paths)))
    return out_path


def sheet_stats(paths, sigma=2.0, max_stops=0.5):
    """Per-shot mean luma and mean saturated hue (Andy's ungraded contact sheet showed which
    shots were too bright). A shot is an outlier when its mean luma is more than `max_stops`
    stops from the set median, or (sets of 8+ shots) beyond `sigma` std [added thresholds;
    a z-score cannot exceed (n-1)/sqrt(n), so small sets use the median rule]."""
    stats = []
    for p in paths:
        rgb = load_rgba(p)[..., :3]
        Y = luma(rgb)
        hue, sat = _hue_sat(rgb)
        sel = sat > 0.15
        ang = np.deg2rad(hue[sel]) if sel.any() else np.array([0.0])
        stats.append({"path": os.path.basename(p), "luma": float(Y.mean()),
                      "hue": math.degrees(math.atan2(np.sin(ang).mean(), np.cos(ang).mean())) % 360})
    L = np.array([s["luma"] for s in stats])
    mu, sd, med = L.mean(), L.std() + 1e-9, float(np.median(L))
    for s in stats:
        s["z_luma"] = round(float((s["luma"] - mu) / sd), 2)
        s["stops_from_median"] = round(math.log2(max(s["luma"], 1e-6) / max(med, 1e-6)), 2)
        s["outlier"] = bool(abs(s["stops_from_median"]) > max_stops or (len(L) >= 8 and abs(s["z_luma"]) > sigma))
        s["luma"] = round(s["luma"], 3)
        s["hue"] = round(s["hue"], 0)
    return stats


def light_contributions(lights, mask, out_dir, scene=None, include_world=True, pct=None):
    """Andrew Price's rule "never adjust a lamp with other lamps visible", as a measurement:
    render each light alone (plus the world alone) to linear EXR and report its median and
    mean luminance inside the subject mask and its share of the sum. Restores visibility."""
    sc = _scene(scene)
    lights = [l for l in lights if l is not None]
    all_lights = [o for o in sc.objects if o.type == "LIGHT"]
    saved_hide = {o.name: o.hide_render for o in all_lights}
    bg = sc.world.node_tree.nodes.get("Background") if sc.world else None
    cam_bg = sc.world.node_tree.nodes.get("BX_CameraBG") if sc.world else None
    saved_w = bg.inputs["Strength"].default_value if bg else None
    saved_cw = cam_bg.inputs["Strength"].default_value if cam_bg else None
    saved_pct = sc.render.resolution_percentage
    saved_comp = sc.render.use_compositing
    mb = np.asarray(mask) > 0.5
    res = {}
    try:
        sc.render.use_compositing = False
        if pct:
            sc.render.resolution_percentage = pct
        jobs = [(l.name, l) for l in lights]
        if include_world and bg is not None:
            jobs.append(("World", None))
        for name, l in jobs:
            for o in all_lights:
                o.hide_render = (o is not l)
            if bg is not None:
                bg.inputs["Strength"].default_value = saved_w if l is None else 0.0
            if cam_bg is not None:
                cam_bg.inputs["Strength"].default_value = saved_cw if l is None else 0.0
            r = render(os.path.join(out_dir, "solo_" + bpy.path.clean_name(name)), sc, exr=True, depth="32")
            Yl = luma(load_rgba(r["exr"])[..., :3])
            m = mb
            if Yl.shape != mb.shape:          # resolution changed: nearest resample of the mask
                yi = (np.arange(Yl.shape[0]) * mb.shape[0] / Yl.shape[0]).astype(int)
                xi = (np.arange(Yl.shape[1]) * mb.shape[1] / Yl.shape[1]).astype(int)
                m = mb[yi][:, xi]
            res[name] = {"median": float(np.median(Yl[m])), "mean": float(Yl[m].mean()),
                         "bg_mean": float(Yl[~m].mean()), "bg_median": float(np.median(Yl[~m])),
                         "png": r["png"]}
    finally:
        for o in all_lights:
            o.hide_render = saved_hide[o.name]
        if bg is not None:
            bg.inputs["Strength"].default_value = saved_w
        if cam_bg is not None:
            cam_bg.inputs["Strength"].default_value = saved_cw
        sc.render.resolution_percentage = saved_pct
        sc.render.use_compositing = saved_comp
    tot = sum(v["mean"] for v in res.values()) or 1e-9
    top = max((v["mean"] for v in res.values()), default=1e-9) or 1e-9
    for v in res.values():
        v["share"] = round(v["mean"] / tot, 3)
        v["ratio_to_strongest"] = round(v["mean"] / top, 3)
        for kk in ("median", "mean", "bg_mean", "bg_median"):
            v[kk] = round(v[kk], 4)
    return res


def volume_probe_for_room(lo, hi, cell=0.5, wall=0.2, inset=0.0, extend=None, name="BX_VolumeProbe"):
    """EEVEE volume probe for an axis-aligned room given its INNER bounds (lo, hi). The volume
    probe is the only thing that stops world light entering an interior in EEVEE (Andrew).

    Default: Andrew's rule, the outermost SAMPLES on the inner wall surfaces (inset = how far
    inside the room they sit; negative = into the wall). 5.2.1 puts the N samples of an axis
    at local (i + 1) / (N + 1) * 2 - 1 (shader eevee_lightprobe_volume_grid_sample_position),
    i.e. one spacing inside each box face, never on it, so the box is sized from the
    points: N = round(2 * inner_half / cell) + 1, half = inner_half * (N + 1) / (N - 1).
    Sealed-room sweep (test_13, world 2, no lights; no probe 0.26): samples 0.44 m inside
    0.22, 0.2 to 0.25 m inside 0.054 to 0.066, at the wall 0.0022, half a 0.2 m wall deep
    0.0007, 0.1 m past the outer face 0.0091 (leaks again). Walls must be thick.
    extend=metres: legacy mode, box = inner bounds + extend (samples one spacing inside
    that box; test_05 sweep). Surfel density 100 (Andrew: 20 is too low); small search
    distance so no point jumps through a wall (Andrew). `wall` is kept for probe_report."""
    lo, hi = Vector(lo), Vector(hi)
    ob = bpy.data.objects.get(name)
    if ob is None:
        ob = bpy.data.objects.new(name, bpy.data.lightprobes.new(name, "VOLUME"))
        bpy.context.scene.collection.objects.link(ob)
    pr = ob.data
    if extend is not None:
        half = (hi - lo) / 2 + Vector((extend,) * 3)
        res = [max(2, int(round(2 * half[i] / cell))) for i in range(3)]
    else:
        inner = (hi - lo) / 2 - Vector((inset,) * 3)
        res = [max(2, int(round(2 * inner[i] / cell)) + 1) for i in range(3)]
        half = Vector([inner[i] * (res[i] + 1) / (res[i] - 1) for i in range(3)])
    pr.resolution_x, pr.resolution_y, pr.resolution_z = res
    ob.location = (lo + hi) / 2
    ob.rotation_euler = (0, 0, 0)
    ob.scale = half
    pr.surfel_density = 100
    pr.escape_bias = 0.02
    pr.surface_bias = 0.1
    ob["bx_wall"] = wall
    return ob


def probe_points(probe):
    """Sample positions of an EEVEE volume probe per local axis, in world space along that
    axis (5.2.1 formula: local (i + 1) / (N + 1) * 2 - 1; rotation ignored)."""
    _sync()
    pr, c, h = probe.data, probe.matrix_world.translation, probe.matrix_world.to_scale()
    res = (pr.resolution_x, pr.resolution_y, pr.resolution_z)
    return {ax: [c[i] + h[i] * ((k + 1) / (res[i] + 1) * 2 - 1) for k in range(res[i])]
            for i, ax in enumerate("xyz")}


def probe_report(probe, lo, hi, wall=None, max_inside=0.1):
    """Where the outermost samples sit against the room's inner faces: gap per face in metres,
    positive = inside the room, negative = into the wall. Flags samples more than max_inside
    inside the walls [added threshold from the test_13 sweep: 0 to 0.02 m gave 0.002 to
    0.003, 0.2 m gave 0.054] and samples past the wall's outer face when `wall` is known."""
    lo, hi = Vector(lo), Vector(hi)
    wall = probe.get("bx_wall") if wall is None else wall
    pts = probe_points(probe)
    gaps, flags = {}, []
    for i, ax in enumerate("xyz"):
        p = pts[ax]
        gaps[f"-{ax}"], gaps[f"+{ax}"] = round(p[0] - lo[i], 3), round(hi[i] - p[-1], 3)
        gaps[f"spacing_{ax}"] = round(p[1] - p[0], 3) if len(p) > 1 else None
    for face in ("-x", "+x", "-y", "+y", "-z", "+z"):
        g = gaps[face]
        if g > max_inside:
            flags.append(f"{face}: outer samples {g:.2f} m inside the wall face: world light leaks (Andrew: last point at the wall)")
        if wall and g < -wall - 1e-6:
            flags.append(f"{face}: outer samples {-g - wall:.2f} m past the wall's outer face: they see outside and leak")
    return {"gaps": gaps, "flags": flags}


def bake_probes(scene=None):
    """Bake all EEVEE light probes (runs synchronously headless in 5.2.1). Re-bake after any
    material or object change (Andrew)."""
    sc = _scene(scene)
    with bpy.context.temp_override(scene=sc):
        return bpy.ops.object.lightprobe_cache_bake(subset="ALL")
