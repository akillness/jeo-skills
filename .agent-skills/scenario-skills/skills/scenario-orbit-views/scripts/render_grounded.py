"""Render an untextured mesh standing inside its 360 panorama, from a ring of cameras.

The equirectangular panorama is projected onto a sphere centred at eye height H
whose lower half is flattened onto the floor z=0. Seen from the sphere centre it
reproduces the panorama; seen from an orbit camera the floor is a real plane, so
the subject stands on it in true perspective and casts a real shadow (Cycles
shadow catcher, world-fixed sun).

Per camera key it writes, in --out:
  bg_<key>.png    the dome only (background plate in the right perspective)
  clay_<key>.png  gray clay model plus its cast shadow over transparency
and a cameras.json manifest. With --search it instead renders small clay-only
silhouettes over a grid of azimuths and elevations for match_view.py.

Camera keys: 00..15 (eye ring, every 22.5 degrees), high_00/04/08/12 (35 degrees),
low_00/04/08/12 (--lowel), top (88 degrees). Azimuth 0 looks from -Y toward +Y;
positive azimuth walks the camera counter-clockwise seen from above.

Run with Blender (4.x or later), everything after -- is for this script:
  blender -b --factory-startup --python render_grounded.py -- \\
    --glb mesh.glb --pano pano.png --out renders/ --az0 30 --elev 10 \\
    [--zoom 1.0] [--height 1.6] [--radius 14] [--yaw 0] [--lowel -10] \\
    [--sunaz DEG] [--sunel 50] [--sun 3] [--size 1024] [--samples 48] [--only 00,top]
  blender -b --factory-startup --python render_grounded.py -- \\
    --glb mesh.glb --out search/ --search
"""
import json
import math
import os
import sys

DEFAULTS = {
    "--az0": 0.0, "--elev": 8.0, "--zoom": 1.0, "--lens": 50.0, "--fill": 0.78,
    "--height": 1.6, "--radius": 14.0, "--yaw": 0.0, "--lowel": -10.0,
    "--size": 1024, "--samples": 48, "--sunaz": None, "--sunel": 50.0, "--sun": 3.0,
}
INTS = {"--size", "--samples"}


def parse_args(argv):
    """Parse the arguments after `--` into a dict keyed by flag name without dashes."""
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    opts = {k.lstrip("-"): v for k, v in DEFAULTS.items()}
    opts.update(glb=None, pano=None, out=None, only=set(), search=False)
    i = 0
    while i < len(argv):
        flag = argv[i]
        if flag == "--search":
            opts["search"] = True
            i += 1
            continue
        if i + 1 >= len(argv):
            raise SystemExit(f"missing value for {flag}")
        value = argv[i + 1]
        if flag in DEFAULTS:
            opts[flag.lstrip("-")] = int(value) if flag in INTS else float(value)
        elif flag in ("--glb", "--pano", "--out"):
            opts[flag.lstrip("-")] = value
        elif flag == "--only":
            opts["only"] = set(value.split(",")) - {""}
        else:
            raise SystemExit(f"unknown flag {flag}")
        i += 2
    if not opts["glb"] or not opts["out"]:
        raise SystemExit("--glb and --out are required")
    if not opts["search"] and not opts["pano"]:
        raise SystemExit("--pano is required unless --search")
    return opts


def camera_list(az0, elev, lowel, only=()):
    """The 25 named cameras as (key, azimuth, elevation) in degrees."""
    cams = [(f"{i:02d}", az0 + i * 22.5, elev) for i in range(16)]
    cams += [(f"high_{i:02d}", az0 + i * 22.5, 35.0) for i in (0, 4, 8, 12)]
    cams += [(f"low_{i:02d}", az0 + i * 22.5, lowel) for i in (0, 4, 8, 12)]
    cams += [("top", az0, 88.0)]
    return [c for c in cams if c[0] in only] if only else cams


def search_list():
    """Silhouette sweep grid: azimuth -90..90 every 10, elevation 0..30 every 10."""
    return [(f"search_az{az:+04d}_el{el:02d}", float(az), float(el))
            for el in (0, 10, 20, 30) for az in range(-90, 91, 10)]


def camera_distance(dims, lens=50.0, fill=0.78, zoom=1.0):
    """Constant orbit distance that frames a mesh of dimensions (x, y, z) at every angle."""
    fov = 2 * math.atan(18 / lens)
    ground = math.sqrt(dims[0] ** 2 + dims[1] ** 2)
    span = max(dims[2], ground)
    return ((span / 2) / math.tan(fov / 2) / fill + ground / 2) / zoom


def camera_position(center, dist, az, el):
    """Camera location for an azimuth/elevation around center (kept above the floor)."""
    a, e = math.radians(az), math.radians(el)
    x = center[0] + math.sin(a) * math.cos(e) * dist
    y = center[1] - math.cos(a) * math.cos(e) * dist
    z = max(center[2] + math.sin(e) * dist, 0.05)
    return (x, y, z)


def sun_azimuth(u, yaw=0.0):
    """World azimuth (degrees, counter-clockwise from +X) of panorama column u (0..1) on the dome.

    Cycles maps direction (cos p, sin p) to u = 0.5 - p / 2pi: the image centre faces +X and u
    grows clockwise seen from above. The dome's mapping node turns every lookup by yaw.
    """
    a = math.radians(360.0 * (0.5 - u) - yaw)
    return math.degrees(math.atan2(math.sin(a), math.cos(a)))


def main(o):
    import bpy
    from mathutils import Vector

    os.makedirs(o["out"], exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # subject: join meshes, normalise to 2 units, stand it on z=0
    bpy.ops.import_scene.gltf(filepath=o["glb"])
    meshes = [ob for ob in scene.objects if ob.type == "MESH"]
    for ob in scene.objects:
        ob.select_set(ob.type == "MESH")
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    s = 2.0 / max(mx - mn)
    obj.location = Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)) * s
    obj.scale = (s, s, s)
    bpy.ops.object.transform_apply(location=True, scale=True)
    bpy.ops.object.shade_smooth()
    for ob in [ob for ob in scene.objects if ob.type != "MESH"]:
        bpy.data.objects.remove(ob)
    dims = tuple(obj.dimensions)
    center = (0.0, 0.0, dims[2] / 2)
    clay = bpy.data.materials.new("Clay")
    clay.use_nodes = True
    bsdf = clay.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.4, 0.4, 0.4, 1)
    bsdf.inputs["Roughness"].default_value = 0.55
    obj.data.materials.clear()
    obj.data.materials.append(clay)

    H, R, yaw = o["height"], o["radius"], o["yaw"]
    dome = catcher = None
    sun_az = o["sunaz"]
    if not o["search"]:
        # grounded dome: panorama sphere around the eye point, lower half flattened
        bpy.ops.mesh.primitive_uv_sphere_add(segments=192, ring_count=96, radius=R, location=(0, 0, H))
        dome = bpy.context.active_object
        bpy.ops.object.transform_apply(location=True)
        for v in dome.data.vertices:
            v.co.z = max(v.co.z, 0.0)
        mat = bpy.data.materials.new("Pano")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sub = nt.nodes.new("ShaderNodeVectorMath")
        sub.operation = "SUBTRACT"
        sub.inputs[1].default_value = (0, 0, H)
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Rotation"].default_value = (0, 0, math.radians(yaw))
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(o["pano"])
        env.interpolation = "Cubic"
        emi = nt.nodes.new("ShaderNodeEmission")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(geo.outputs["Position"], sub.inputs[0])
        nt.links.new(sub.outputs[0], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
        nt.links.new(env.outputs["Color"], emi.inputs["Color"])
        nt.links.new(emi.outputs[0], out.inputs["Surface"])
        dome.data.materials.append(mat)
        dome.visible_shadow = False  # the sun reaches the subject through the dome
        bpy.ops.mesh.primitive_plane_add(size=R * 1.6, location=(0, 0, 0.002))
        catcher = bpy.context.active_object
        catcher.is_shadow_catcher = True

        if sun_az is None:  # aim the sun from the brightest column of the upper half
            img = env.image
            w, h = img.size
            px = img.pixels[:]
            best, bu = -1.0, 0
            for yy in range(h // 2, h, 8):
                for xx in range(0, w, 8):
                    i = (yy * w + xx) * 4
                    lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
                    if lum > best:
                        best, bu = lum, xx
            sun_az = sun_azimuth(bu / w, yaw)
        sun = bpy.data.lights.new("Sun", "SUN")
        sun.energy = o["sun"]
        sun.angle = math.radians(12)
        so = bpy.data.objects.new("Sun", sun)
        scene.collection.objects.link(so)
        sa, se = math.radians(sun_az), math.radians(o["sunel"])
        d = Vector((math.cos(sa) * math.cos(se), math.sin(sa) * math.cos(se), math.sin(se)))
        so.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    else:  # silhouettes only need a flat key light
        sun = bpy.data.lights.new("Key", "SUN")
        so = bpy.data.objects.new("Key", sun)
        scene.collection.objects.link(so)

    world = bpy.data.worlds.new("W")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.0

    cd = bpy.data.cameras.new("Cam")
    cd.lens, cd.sensor_width, cd.clip_end = o["lens"], 36, R * 4
    cam = bpy.data.objects.new("Cam", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    dist = camera_distance(dims, o["lens"], o["fill"], o["zoom"])

    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.get_devices()
        for dv in prefs.devices:
            dv.use = True
        scene.cycles.device = "GPU"
    except Exception as e:
        print(f"GPU setup failed ({e}), rendering on CPU", file=sys.stderr)
    scene.cycles.samples = 8 if o["search"] else o["samples"]
    scene.cycles.use_denoising = True
    size = 256 if o["search"] else o["size"]
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"

    def render(path, dome_visible, clay_visible, transparent):
        obj.hide_render = not clay_visible
        if catcher:
            catcher.hide_render = not clay_visible
        if dome:  # stays in the scene as ambient light, only hidden from the camera
            dome.visible_camera = dome_visible
        scene.render.film_transparent = transparent
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)

    cams = search_list() if o["search"] else camera_list(o["az0"], o["elev"], o["lowel"], o["only"])
    rec = []
    for key, az, el in cams:
        pos = camera_position(center, dist, az, el)
        cam.location = pos
        cam.rotation_euler = (Vector(center) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        entry = {"key": key, "az": az, "el": el}
        if o["search"]:
            entry["file"] = os.path.join(o["out"], f"{key}.png")
            render(entry["file"], False, True, True)
        else:
            render(os.path.join(o["out"], f"bg_{key}.png"), True, False, False)
            render(os.path.join(o["out"], f"clay_{key}.png"), False, True, True)
        rec.append(entry)
    manifest = {"dist": dist, "height": H, "radius": R, "yaw": yaw, "sun_az": sun_az, "views": rec}
    with open(os.path.join(o["out"], "cameras.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print("DONE", len(rec))


if __name__ == "__main__":
    # Blender's own flags precede `--`, so without it there are no script arguments
    if "--" not in sys.argv or sys.argv[-1] == "--":
        raise SystemExit(__doc__)
    main(parse_args(sys.argv))
