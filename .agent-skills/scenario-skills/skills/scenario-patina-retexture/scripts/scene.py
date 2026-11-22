"""One camera and light rig, applied identically to the before and after scenes.

setup() runs inside Blender. The pose math above it is plain tuples so it can be
tested without bpy, and so the two passes cannot drift: every frame's camera and
sweep light come from the same numbers.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from common import ensure_nodes, geometry_hash, shot_frames, world_matrix

LENS = 85
SENSOR_WIDTH = 36
CLIP_START = 0.01
# A fresh camera must never clip tighter than the default one it replaces.
DEFAULT_CLIP_END = 1000.0
ENVIRONMENT_STRENGTH = 0.45
ENVIRONMENT_ROTATION_DEGREES = 35
BACKDROP = (0.033, 0.048, 0.064, 1)
CAMERA_NAME = "Synchronized Comparison Camera"
STRIP_NAME = "Moving Reflection Strip"
WORLD_UP = (0, 0, 1)
# Blender 4.2 through 4.5 call the current EEVEE BLENDER_EEVEE_NEXT; 5.0 renamed it.
ENGINE_CANDIDATES = ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT")
# 4.2 and 5.0 both keep the "AgX - " prefix in the identifier (only the UI label drops
# it); the bare name is a hedge for a later rename.
LOOK_CANDIDATES = ("AgX - Medium High Contrast", "Medium High Contrast")

# (name, location, power, size, color, target, shape, height) in rig units: the rig is
# placed at rig_origin and scaled by rig_scale, power by rig_scale squared.
FIXED_LIGHTS = (
    ("Raking Warm Key", (-6, -7, 12), 1250, 4.0, (1, 0.89, 0.75), (0, 0, 4.5), "DISK", None),
    ("Cool Rim", (6, 4, 11), 1800, 3.5, (0.78, 0.87, 1), (0, 0, 4.5), "DISK", None),
    ("Gentle Front Fill", (2, -9, 5), 180, 7, (0.86, 0.93, 1), (0, 0, 4.5), "DISK", None),
)
STRIP_LIGHT = (STRIP_NAME, (0, -4, 8), 100, 1, (1, 0.95, 0.86), (0, 0, 4), "RECTANGLE", 3)
# The camera side of the rig: the front fill and the strip's rest position sit on -Y.
RIG_FRONT = (0, -1, 0)
# (radius, energy, size, size_y) in rig units for the wide and the close-up strip, blended
# by smoothstep across visible widths of STRIP_BAND rig units so a push-in never pops.
STRIP_WIDE = (11, 600, 2, 8)
STRIP_CLOSE = (4.5, 260, 0.6, 2.8)
STRIP_BAND = (5, 7)


def smoothstep(t: float) -> float:
    return t * t * (3 - 2 * t)


def ease_at(index: int, count: int) -> float:
    return smoothstep(index / (count - 1)) if count > 1 else 0.0


def lerp(a, b, t: float) -> tuple:
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def mix(a: float, b: float, t: float) -> float:
    return a * (1 - t) + b * t


def dot(a, b) -> float:
    return sum(x * y for x, y in zip(a, b))


def normalize(vector) -> tuple:
    length = math.sqrt(dot(vector, vector))
    return tuple(x / length for x in vector)


def perpendicular(vector, preferred=WORLD_UP) -> tuple:
    """Unit vector at right angles to `vector`, as close to `preferred` as possible."""
    for hint in (preferred, RIG_FRONT):
        rejected = tuple(h - v * dot(vector, hint) for v, h in zip(vector, hint))
        if math.sqrt(dot(rejected, rejected)) > 1e-6:
            return normalize(rejected)
    raise ValueError(f"no perpendicular found for {vector}")


def slerp(a, b, t: float) -> tuple:
    """Rotate the direction `a` toward `b` by the fraction `t` of the angle between them.

    Opposite directions share no unique plane, so the path then climbs through world up
    (through the rig front when the pair is vertical): a turnaround arcs overhead instead
    of collapsing to a zero vector at the midpoint.
    """
    a, b = normalize(a), normalize(b)
    cosine = max(-1.0, min(1.0, dot(a, b)))
    if cosine > 1 - 1e-9:
        return normalize(lerp(a, b, t))
    if cosine < -1 + 1e-9:
        axis = perpendicular(a)
        angle = math.pi * t
        return tuple(x * math.cos(angle) + y * math.sin(angle) for x, y in zip(a, axis))
    angle = math.acos(cosine)
    sine = math.sin(angle)
    return tuple(
        (x * math.sin((1 - t) * angle) + y * math.sin(t * angle)) / sine for x, y in zip(a, b)
    )


def camera_distance(width: float, lens: float = LENS, sensor_width: float = SENSOR_WIDTH) -> float:
    """Distance at which a lens frames `width` scene units across the sensor."""
    return width * lens / sensor_width


def camera_pose(start, end, ease: float, lens: float = LENS, sensor_width: float = SENSOR_WIDTH):
    """Interpolate two [target, direction, width] endpoints into a camera placement."""
    target = lerp(start[0], end[0], ease)
    direction = slerp(start[1], end[1], ease)
    width = mix(start[2], end[2], ease)
    distance = camera_distance(width, lens, sensor_width)
    location = tuple(t + d * distance for t, d in zip(target, direction))
    return {"location": location, "target": target, "direction": direction, "width": width}


def far_clip(config: dict, corners=()) -> float:
    """Camera clip_end covering every mesh corner from every shot endpoint, with margin."""
    reach = 0.0
    for shot in config["shots"]:
        for endpoint in (shot["start"], shot["end"]):
            location = camera_pose(endpoint, endpoint, 0)["location"]
            reach = max(reach, camera_distance(endpoint[2]))
            for corner in corners:
                reach = max(reach, math.dist(location, corner))
    return max(DEFAULT_CLIP_END, 1.25 * reach)


def rig_light(location, power, size, target, rig_origin, rig_scale, height=None) -> dict:
    """Place a rig-unit light in scene units."""

    def place(point):
        return tuple(o + v * rig_scale for o, v in zip(rig_origin, point))

    return {
        "location": place(location),
        "target": place(target),
        "power": power * rig_scale * rig_scale,
        "size": size * rig_scale,
        "size_y": height * rig_scale if height else None,
    }


def strip_pose(
    target, direction, width: float, ease: float, rig_scale: float, fallback_front=RIG_FRONT
):
    """The reflection strip sweeps 90 degrees around the subject over each shot.

    The strip blends from the wide preset to the close-up one (tighter, dimmer, smaller,
    so the highlight still reads as a moving reflection rather than a flood) as the
    visible width crosses STRIP_BAND. A vertical viewing direction has no heading: the
    sweep then keeps `fallback_front`, the previous frame's heading or the rig front.
    """
    low, high = STRIP_BAND
    close = 1 - smoothstep(min(1.0, max(0.0, (width / rig_scale - low) / (high - low))))
    radius, energy, size, size_y = (mix(w, c, close) for w, c in zip(STRIP_WIDE, STRIP_CLOSE))
    radius *= rig_scale
    angle = math.radians(-65 + 90 * ease)
    if math.hypot(direction[0], direction[1]) > 1e-6:
        front = normalize((direction[0], direction[1], 0))
    else:
        front = tuple(fallback_front)
    right = (-front[1], front[0], 0)
    location = tuple(
        t + f * radius * math.cos(angle) + r * radius * math.sin(angle) + up
        for t, f, r, up in zip(target, front, right, (0, 0, radius * 0.48))
    )
    return {
        "location": location,
        "front": front,
        "energy": energy * rig_scale * rig_scale,
        "size": size * rig_scale,
        "size_y": size_y * rig_scale,
    }


def assign_first(target, attribute: str, candidates, fallback: str | None = None) -> str:
    """Assign the first candidate the running Blender accepts and keeps; return it.

    Dynamic enums (render engines, looks) cannot be listed from Python: bl_rna enum_items
    holds only their static placeholder, so assignment is the probe. Blender raises
    TypeError for an identifier it lacks.
    """
    for value in candidates:
        try:
            setattr(target, attribute, value)
        except (TypeError, ValueError):
            continue
        if getattr(target, attribute) == value:
            return value
    if fallback is None:
        raise ValueError(f"{attribute}: none of {candidates} is available in this Blender")
    setattr(target, attribute, fallback)
    return fallback


def pick_engine(render) -> str:
    return assign_first(render, "engine", ENGINE_CANDIDATES)


def pick_look(view) -> str:
    return assign_first(view, "look", LOOK_CANDIDATES, fallback="None")


def find_environment(configured, roots) -> Path:
    """The configured HDRI, else Blender's bundled studio.exr, else any bundled world EXR."""
    if configured:
        path = Path(configured)
        if not path.is_file():
            raise FileNotFoundError(f"environment {path} does not exist")
        return path
    found = []
    for root in roots:
        if root and Path(root).is_dir():
            found.extend(sorted(Path(root).rglob("studiolights/world/*.exr")))
    if not found:
        raise FileNotFoundError(
            "No studio environment found in Blender's resources; set \"environment\" in the"
            " film config to a local HDRI file"
        )
    return next((p for p in found if p.name == "studio.exr"), found[0])


def set_present(target, values: dict) -> dict:
    """Assign the attributes the running Blender exposes; return what was applied."""
    applied = {}
    for name, value in values.items():
        if hasattr(target, name):
            setattr(target, name, value)
            applied[name] = value
    return applied


def track_quaternion(location, target):
    from mathutils import Vector

    return (Vector(target) - Vector(location)).to_track_quat("-Z", "Y")


def add_area_light(scene, spec, rig_origin, rig_scale):
    import bpy

    name, location, power, size, color, target, shape, height = spec
    placed = rig_light(location, power, size, target, rig_origin, rig_scale, height)
    light = bpy.data.lights.new(name, "AREA")
    light.energy = placed["power"]
    light.shape = shape
    light.size = placed["size"]
    light.color = color
    if placed["size_y"]:
        light.size_y = placed["size_y"]
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    obj.location = placed["location"]
    obj.rotation_euler = track_quaternion(placed["location"], placed["target"]).to_euler()
    return obj


def build_world(scene, environment: Path) -> str:
    import bpy

    if scene.world is None:
        scene.world = bpy.data.worlds.new("Comparison World")
    tree = ensure_nodes(scene.world)
    nodes, links = tree.nodes, tree.links
    nodes.clear()
    env = nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(environment), check_existing=True)
    env.image.pack()
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value[2] = math.radians(ENVIRONMENT_ROTATION_DEGREES)
    links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    lighting = nodes.new("ShaderNodeBackground")
    lighting.inputs["Strength"].default_value = ENVIRONMENT_STRENGTH
    links.new(env.outputs["Color"], lighting.inputs["Color"])
    # The HDRI lights the scene; the camera sees a flat dark backdrop instead.
    visible = nodes.new("ShaderNodeBackground")
    visible.inputs["Color"].default_value = BACKDROP
    visible.inputs["Strength"].default_value = 1
    path = nodes.new("ShaderNodeLightPath")
    mix_shader = nodes.new("ShaderNodeMixShader")
    out = nodes.new("ShaderNodeOutputWorld")
    links.new(path.outputs["Is Camera Ray"], mix_shader.inputs[0])
    links.new(lighting.outputs[0], mix_shader.inputs[1])
    links.new(visible.outputs[0], mix_shader.inputs[2])
    links.new(mix_shader.outputs[0], out.inputs["Surface"])
    return (
        f"{environment.name}, strength {ENVIRONMENT_STRENGTH},"
        f" rotation {ENVIRONMENT_ROTATION_DEGREES} degrees"
    )


def configure_render(scene, config: dict, preview: bool) -> dict:
    render = scene.render
    pick_engine(render)
    # The loaded .blend keeps its own RenderSettings under --factory-startup. A render
    # border left on from a preview, a stamp, a pixel aspect or a colour-management
    # override would shape every frame of both passes alike, so the rig owns them.
    set_present(
        render,
        {
            "use_border": False,
            "use_crop_to_border": False,
            "pixel_aspect_x": 1.0,
            "pixel_aspect_y": 1.0,
            "use_stamp": False,
            "use_motion_blur": False,
            "use_freestyle": False,
            "use_multiview": False,
            "use_compositing": False,
            "use_sequencer": False,
            "use_simplify": False,
        },
    )
    set_present(render.image_settings, {"color_management": "FOLLOW_SCENE"})
    set_present(scene.display_settings, {"display_device": "sRGB"})
    eevee = scene.eevee
    applied = set_present(
        eevee,
        {
            "taa_render_samples": config["samples"],
            "use_raytracing": True,
            "use_fast_gi": False,
            "shadow_ray_count": 1,
            "shadow_step_count": 6,
        },
    )
    if hasattr(eevee, "ray_tracing_options"):
        # Half-resolution traced reflections with denoising: the fast preset the film uses.
        applied["ray_tracing_options"] = set_present(
            eevee.ray_tracing_options,
            {
                "resolution_scale": "2",
                "screen_trace_quality": 0.5,
                "screen_trace_thickness": 0.1,
                "use_denoise": True,
                "denoise_spatial": True,
                "denoise_temporal": True,
                "denoise_bilateral": True,
            },
        )
    render.resolution_x = config["width"]
    render.resolution_y = config["height"]
    render.resolution_percentage = 50 if preview else 100
    render.image_settings.file_format = "PNG"
    render.image_settings.color_mode = "RGB"
    render.image_settings.color_depth = "8"
    render.image_settings.compression = 10
    render.film_transparent = False
    render.fps = config["fps"]
    scene.frame_start = 1
    scene.frame_end = shot_frames(config) * len(config["shots"])
    view = scene.view_settings
    view.view_transform = "AgX"
    pick_look(view)  # after the transform, which resets the look
    view.exposure = 0.0
    view.gamma = 1
    set_present(view, {"use_curve_mapping": False, "use_white_balance": False})
    return applied


def ensure_camera(scene, config: dict):
    import bpy
    from mathutils import Vector

    # Never reuse scene.camera: a source camera keeps its parent, constraints, shift and
    # sensor fit, which move the render away from the keyed pose while the contract (local
    # keyframes only) still matches between passes. The source camera stays in the file.
    stale = bpy.data.objects.get(CAMERA_NAME)
    if stale is not None:
        stale.name = f"{CAMERA_NAME} (previous)"
    camera = bpy.data.objects.new(CAMERA_NAME, bpy.data.cameras.new(CAMERA_NAME))
    scene.collection.objects.link(camera)
    scene.camera = camera
    corners = [
        tuple(world_matrix(obj) @ Vector(corner))
        for obj in scene.objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    data = camera.data
    data.type = "PERSP"
    data.lens = LENS
    data.sensor_width = SENSOR_WIDTH
    # camera_distance assumes the sensor width spans the image width; AUTO fits the longer side.
    data.sensor_fit = "HORIZONTAL"
    data.shift_x = data.shift_y = 0
    data.dof.use_dof = False
    data.clip_start = CLIP_START
    data.clip_end = far_clip(config, corners)
    camera.rotation_mode = "QUATERNION"
    return camera


def animate(scene, config: dict, camera, strip) -> list[dict]:
    count = shot_frames(config)
    rig_scale = config["rig_scale"]
    records = []
    for shot_index, shot in enumerate(config["shots"]):
        scene.timeline_markers.new(shot["name"], frame=shot_index * count + 1)
        front = RIG_FRONT
        for index in range(count):
            frame = shot_index * count + index + 1
            ease = ease_at(index, count)
            pose = camera_pose(shot["start"], shot["end"], ease)
            camera.location = pose["location"]
            camera.rotation_quaternion = track_quaternion(pose["location"], pose["target"])
            camera.keyframe_insert("location", frame=frame)
            camera.keyframe_insert("rotation_quaternion", frame=frame)
            sweep = strip_pose(
                pose["target"], pose["direction"], pose["width"], ease, rig_scale, front
            )
            front = sweep["front"]
            strip.location = sweep["location"]
            strip.rotation_euler = track_quaternion(sweep["location"], pose["target"]).to_euler()
            strip.data.energy = sweep["energy"]
            strip.data.size = sweep["size"]
            strip.data.size_y = sweep["size_y"]
            strip.keyframe_insert("location", frame=frame)
            strip.keyframe_insert("rotation_euler", frame=frame)
            for prop in ("energy", "size", "size_y"):
                strip.data.keyframe_insert(prop, frame=frame)
            records.append(
                {
                    "frame": frame,
                    "shot": shot["name"],
                    "location": list(camera.location),
                    "target": list(pose["target"]),
                    "lens": camera.data.lens,
                    "rotation": list(camera.rotation_quaternion),
                    "light_location": list(strip.location),
                    "light_rotation": list(strip.rotation_euler),
                    "light_power": strip.data.energy,
                    "light_width": strip.data.size,
                    "light_height": strip.data.size_y,
                }
            )
    return records


def tidy_ui(scene):
    """Leave the saved scene looking through the camera in material preview."""
    import bpy

    scene.frame_set(1)
    for obj in scene.objects:
        try:
            obj.select_set(False)
        except RuntimeError:
            # Objects outside the active view layer cannot be deselected here.
            pass
    bpy.context.view_layer.objects.active = None
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.shading.type = "MATERIAL"


def setup(config: dict, mode: str, preview: bool = False):
    """Build the rig in the open scene. Returns (scene, per-frame records, contract)."""
    import bpy

    scene = bpy.context.scene
    applied = configure_render(scene, config, preview)
    environment = find_environment(
        config.get("environment"),
        [bpy.utils.resource_path(kind) for kind in ("LOCAL", "SYSTEM")],
    )
    environment_note = build_world(scene, environment)
    for obj in list(scene.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    rig_origin, rig_scale = config["rig_origin"], config["rig_scale"]
    for spec in FIXED_LIGHTS:
        add_area_light(scene, spec, rig_origin, rig_scale)
    strip = add_area_light(scene, STRIP_LIGHT, rig_origin, rig_scale)
    camera = ensure_camera(scene, config)
    records = animate(scene, config, camera, strip)
    tidy_ui(scene)
    scene["comparison_pass"] = mode
    scene["comparison_note"] = (
        "Exact shared camera and reflection-light samples. Geometry, illumination, exposure"
        " and render settings match. Source materials versus PATINA maps."
    )
    settings = {
        "engine": scene.render.engine,
        "eevee": applied,
        "resolution": [config["width"], config["height"]],
        "fps": config["fps"],
        "frames": scene.frame_end,
        "view_transform": scene.view_settings.view_transform,
        "look": scene.view_settings.look,
        "exposure": scene.view_settings.exposure,
        "environment": environment_note,
        "camera": {
            "lens": camera.data.lens,
            "sensor_width": camera.data.sensor_width,
            "sensor_fit": camera.data.sensor_fit,
            "shift": [camera.data.shift_x, camera.data.shift_y],
            "clip": [camera.data.clip_start, camera.data.clip_end],
        },
        "lights": [
            {
                "name": obj.name,
                "location": list(obj.location),
                "rotation": list(obj.rotation_euler),
                "power": obj.data.energy,
                "color": list(obj.data.color),
                "size": obj.data.size,
            }
            for obj in scene.objects
            if obj.type == "LIGHT"
        ],
    }
    contract = {
        "pass_name": mode,
        "blender": bpy.app.version_string,
        "camera_sha256": hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest(),
        "settings": settings,
        "shots": config["shots"],
        "geometry_sha256": geometry_hash([o for o in scene.objects if o.type == "MESH"]),
    }
    return scene, records, contract
