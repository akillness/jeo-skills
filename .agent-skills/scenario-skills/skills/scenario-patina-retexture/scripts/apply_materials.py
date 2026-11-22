"""Wire PATINA PBR map sets into Blender materials without touching geometry.

    blender --background --factory-startup <Before.blend> \
        --python scripts/apply_materials.py -- <materials.json>

Paths in the manifest are relative to the manifest file. Every material on a mesh object must
be mapped to a family or covered by an object override; the manifest is validated in full
before the scene is modified, and geometry is hashed before and after as proof that only
materials changed. Other object types keep their materials and are listed in the result under
non_mesh_renderables.
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import (  # noqa: E402
    dump,
    ensure_nodes,
    geometry_hash,
    is_number,
    script_args,
    world_matrix,
)
from inventory import non_mesh_renderables, principled_node  # noqa: E402

ROLES = ("basecolor", "normal", "roughness", "metalness", "height")
BASECOLOR_MODES = ("tint", "replace")
UV_LAYER = "PatinaUV"
PREFIX = "PATINA | "
COAT_WEIGHT = {"ceramic": 0.22, "enamel": 0.12, "plastic": 0.12}
LUMINANCE_WEIGHTS = (0.2126, 0.7152, 0.0722)
FAMILY_DEFAULTS = {
    "normal_strength": 0.25,
    "bump_distance": 0.002,
    "roughness": [0.3, 0.7],
    "metalness": [0, 0],
    "roughness_is_smoothness": False,
    "basecolor_mode": "tint",
}


def load_manifest(path) -> tuple[dict, Path]:
    manifest_path = Path(path).resolve()
    manifest = json.loads(manifest_path.read_text())
    if not isinstance(manifest, dict):
        raise SystemExit(f"Manifest problems:\n  {manifest_path}: must be a JSON object")
    return manifest, manifest_path.parent


def family_settings(family: dict) -> dict:
    settings = dict(FAMILY_DEFAULTS)
    settings.update(family)
    return settings


def colorspace(role: str) -> str:
    return "sRGB" if role == "basecolor" else "Non-Color"


def override_family(object_name: str, overrides: list) -> str | None:
    for override in overrides:
        if object_name.startswith(tuple(override.get("prefixes", []))):
            return override.get("family")
    return None


def usable_override(override) -> bool:
    # A bare string under startswith is a tuple of its characters, and an empty prefix
    # matches every object, so both would retexture the whole scene with one family.
    return (
        isinstance(override, dict)
        and isinstance(override.get("prefixes"), list)
        and bool(override["prefixes"])
        and all(isinstance(prefix, str) and prefix for prefix in override["prefixes"])
        and isinstance(override.get("family"), str)
        and bool(override["family"])
    )


def is_unit_range(value) -> bool:
    return (
        isinstance(value, (list, tuple))
        and len(value) == 2
        and all(is_number(v) for v in value)
        and all(0 <= v <= 1 for v in value)
    )


def unreadable_image(path: Path) -> str | None:
    """Why Pillow rejects the file, or None when it reads or when Pillow cannot judge the format."""
    try:
        from PIL import Image
    except ImportError:
        return None
    if path.suffix.lower() not in Image.registered_extensions():
        return None
    try:
        with Image.open(path) as image:
            image.verify()
    except Exception as exc:
        return str(exc) or type(exc).__name__
    return None


def validate_manifest(manifest: dict, root: Path, objects_by_material: dict) -> list[str]:
    """Every problem with the manifest against the open scene, so one run reports them all.

    objects_by_material maps each scene material name to the names of the objects using it.
    """
    problems = []
    if not isinstance(manifest.get("output"), str) or not manifest["output"]:
        problems.append("output: required .blend path is missing")
    materials = manifest.get("materials", {})
    families = manifest.get("families", {})
    overrides = manifest.get("object_overrides", [])
    if not isinstance(materials, dict):
        problems.append("materials: must map material names to family names")
        materials = {}
    if not isinstance(families, dict):
        problems.append("families: must map family names to their definitions")
        families = {}
    if not isinstance(overrides, list):
        problems.append("object_overrides: must be a list of {prefixes, family}")
        overrides = []
    for name, family in sorted(materials.items()):
        if not isinstance(family, str) or not family:
            problems.append(f"materials[{name!r}]: must be a family name")
    for index, override in enumerate(overrides):
        if not usable_override(override):
            problems.append(
                f"object_overrides[{index}]: needs a prefixes list of non-empty strings"
                " and a family"
            )
    overrides = [o for o in overrides if usable_override(o)]
    for name, objects in sorted(objects_by_material.items()):
        if name in materials:
            continue
        if objects and all(override_family(obj, overrides) for obj in objects):
            continue
        problems.append(
            f"material {name!r} is neither mapped in materials nor covered by an override"
        )
    referenced = {f for f in materials.values() if isinstance(f, str)}
    referenced |= {o["family"] for o in overrides}
    for family in sorted(f for f in referenced if f and f not in families):
        problems.append(f"family {family!r} is referenced but not defined")
    spaces_by_path = {}
    for name, family in sorted(families.items()):
        if not isinstance(family, dict):
            problems.append(f"family {name!r}: must be an object")
            continue
        span = family.get("tile_span")
        if not is_number(span) or span <= 0:
            problems.append(f"family {name!r}: tile_span must be a positive number of scene units")
        maps = family.get("maps", {})
        if not isinstance(maps, dict):
            problems.append(f"family {name!r}: maps must map roles to files")
            maps = {}
        missing = [role for role in ROLES if role not in maps]
        if missing:
            problems.append(f"family {name!r}: missing map roles {', '.join(missing)}")
        for role in ROLES:
            if role not in maps:
                continue
            relative = maps[role]
            if not isinstance(relative, str) or not relative:
                problems.append(f"family {name!r}: {role} map must be a path under the manifest")
                continue
            path = root / relative
            if not path.is_file():
                problems.append(f"family {name!r}: {role} map {relative} not found under {root}")
                continue
            reason = unreadable_image(path)
            if reason:
                problems.append(
                    f"family {name!r}: {role} map {relative} is not a readable image ({reason})"
                )
            spaces_by_path.setdefault(path.resolve(), set()).add(colorspace(role))
        for key in ("roughness", "metalness"):
            if key in family and not is_unit_range(family[key]):
                problems.append(f"family {name!r}: {key} must be two numbers between 0 and 1")
        for key in ("normal_strength", "bump_distance"):
            if key in family and (not is_number(family[key]) or family[key] < 0):
                problems.append(f"family {name!r}: {key} must be a number of at least 0")
        if family.get("basecolor_mode", "tint") not in BASECOLOR_MODES:
            modes = ", ".join(BASECOLOR_MODES)
            problems.append(f"family {name!r}: basecolor_mode must be one of {modes}")
        if not isinstance(family.get("roughness_is_smoothness", False), bool):
            problems.append(f"family {name!r}: roughness_is_smoothness must be true or false")
    # One file is one image datablock with one color space, however many roles point at it.
    for path, spaces in sorted(spaces_by_path.items()):
        if len(spaces) > 1:
            problems.append(f"map {path} is used both as a basecolor and as a data map; copy it")
    if "provenance" in manifest and not isinstance(manifest["provenance"], dict):
        problems.append("provenance: must be an object")
    return problems


def projected_uv(co, normal, scale) -> tuple[float, float]:
    """Project a vertex along the polygon's dominant axis, in object-scaled (meter) units.

    Scaling by the object scale first means a stretched facade keeps the same texel
    density as an unscaled one, and the sign flip keeps tangents consistent so normal
    maps read the same way on opposite faces.
    """
    axis = max(range(3), key=lambda i: abs(normal[i]))
    sign = 1 if normal[axis] >= 0 else -1
    x, y, z = (co[i] * scale[i] for i in range(3))
    if axis == 0:
        return (y * sign, z)
    if axis == 1:
        return (-x * sign, z)
    return (x * sign, y)


def srgb_to_linear(values):
    import numpy as np

    values = np.asarray(values, dtype=np.float32)
    return np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)


def luminance_mean(linear) -> float:
    """Mean luminance of scene-linear RGB, floored so a tint never divides by zero."""
    import numpy as np

    linear = np.asarray(linear, dtype=np.float32).reshape((-1, 3))
    if linear.size == 0:
        raise ValueError("no pixels to average")
    return max(0.02, float((linear @ np.array(LUMINANCE_WEIGHTS, dtype=np.float32)).mean()))


def linear_luminance_mean(rgb) -> float:
    """luminance_mean of sRGB-encoded pixels."""
    return luminance_mean(srgb_to_linear(rgb))


def is_linear_buffer(image) -> bool:
    # Blender converts float buffers (16-bit PNG, EXR) to scene-linear on load and leaves byte
    # buffers in their stored color space. A 16-bit gray PNG reports depth 32, so is_float leads.
    return bool(image.is_float) or image.depth > 32


def image_luminance_mean(image) -> float:
    import numpy as np

    # foreach_get fills the buffer directly; pixels[:] builds a Python float per channel.
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgb = pixels.reshape((-1, 4))[:, :3]
    return luminance_mean(rgb) if is_linear_buffer(image) else linear_luminance_mean(rgb)


def add_patina_uv(obj) -> None:
    mesh = obj.data
    layer = mesh.uv_layers.new(name=UV_LAYER)
    scale = tuple(world_matrix(obj).to_scale())
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            layer.data[loop_index].uv = projected_uv(tuple(co), tuple(polygon.normal), scale)
    mesh.uv_layers.active = layer
    layer.active_render = True


def original_color(material) -> tuple:
    """The color a tint multiplies: an unlinked Principled Base Color, else the viewport color."""
    node = principled_node(material)
    if node is not None and not node.inputs["Base Color"].is_linked:
        return tuple(node.inputs["Base Color"].default_value)
    return tuple(material.diffuse_color)


class Applier:
    """Holds the image cache and built materials for one manifest."""

    def __init__(self, manifest: dict, root: Path):
        self.manifest = manifest
        self.root = root
        # Both caches key on the resolved file: a map shared by two families is one datablock,
        # packed once, and its mean is read once however many variants tint with it.
        self.images = {}
        self.luminance = {}
        self.made = {}
        self.report = []

    def map_path(self, family_name: str, role: str) -> Path:
        return (self.root / self.manifest["families"][family_name]["maps"][role]).resolve()

    def image(self, family_name: str, role: str):
        path = self.map_path(family_name, role)
        if path not in self.images:
            import bpy

            try:
                image = bpy.data.images.load(str(path))
            except RuntimeError as exc:
                raise RuntimeError(f"family {family_name!r} {role} map: {exc}") from None
            # Blender loads lazily and never raises on an unreadable file; a zero size is the tell.
            if not all(image.size):
                raise RuntimeError(f"family {family_name!r} {role} map {path}: unreadable image")
            image.name = f"{PREFIX}{family_name} | {role}"
            image.colorspace_settings.name = colorspace(role)
            self.images[path] = image
        return self.images[path]

    def luminance_mean(self, family_name: str) -> float:
        path = self.map_path(family_name, "basecolor")
        if path not in self.luminance:
            self.luminance[path] = image_luminance_mean(self.image(family_name, "basecolor"))
        return self.luminance[path]

    def variant_name(self, original_name: str, family_name: str) -> str:
        if self.manifest.get("materials", {}).get(original_name) == family_name:
            return PREFIX + original_name
        return f"{PREFIX}{original_name} | {family_name}"

    def material(self, original, family_name: str):
        key = (original.name, family_name)
        if key not in self.made:
            self.made[key] = self.build(original, family_name)
        return self.made[key]

    def build(self, original, family_name: str):
        import bpy

        family = family_settings(self.manifest["families"][family_name])
        color = original_color(original)
        material = bpy.data.materials.new(self.variant_name(original.name, family_name))
        material.diffuse_color = color
        material["patina_family"] = family_name
        material["original_material"] = original.name
        material["description"] = "PATINA PBR maps on a meter-scaled PatinaUV projection"
        if "provenance" in self.manifest:
            material["patina_provenance"] = json.dumps(self.manifest["provenance"], sort_keys=True)
        tree = ensure_nodes(material)
        tree.nodes.clear()
        links = tree.links

        def node(kind, name, location):
            created = tree.nodes.new(kind)
            created.label = name
            created.name = name
            created.location = location
            return created

        output = node("ShaderNodeOutputMaterial", "Material Output", (930, 140))
        bsdf = node("ShaderNodeBsdfPrincipled", "PATINA Surface", (620, 140))
        links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        uv = node("ShaderNodeUVMap", "Dedicated PatinaUV", (-1200, 100))
        uv.uv_map = UV_LAYER
        tiling = node("ShaderNodeVectorMath", "Physical Tile Scale", (-1000, 100))
        tiling.operation = "SCALE"
        tiling.inputs[3].default_value = 1 / family["tile_span"]
        links.new(uv.outputs["UV"], tiling.inputs[0])
        textures = {}
        for role, y in zip(ROLES, (560, -430, 220, -100, -760)):
            texture = node("ShaderNodeTexImage", f"PATINA {role}", (-750, y))
            texture.image = self.image(family_name, role)
            texture.extension = "REPEAT"
            texture.interpolation = "Linear"
            links.new(tiling.outputs["Vector"], texture.inputs["Vector"])
            textures[role] = texture
        luminance = None
        if family["basecolor_mode"] == "replace":
            links.new(textures["basecolor"].outputs["Color"], bsdf.inputs["Base Color"])
        else:
            # Tint: PATINA luminance variation multiplied over the original palette color,
            # normalized so the mean brightness of the map does not darken the palette.
            luminance = self.luminance_mean(family_name)
            gray = node("ShaderNodeRGBToBW", "Retain Surface Variation", (-490, 560))
            links.new(textures["basecolor"].outputs["Color"], gray.inputs["Color"])
            normalize = node("ShaderNodeMath", "Normalize PATINA Luminance", (-300, 560))
            normalize.operation = "DIVIDE"
            normalize.inputs[1].default_value = luminance
            links.new(gray.outputs[0], normalize.inputs[0])
            contrast = node("ShaderNodeMapRange", "Controlled Material Variation", (-100, 560))
            contrast.inputs["From Min"].default_value = 0
            contrast.inputs["From Max"].default_value = 2
            contrast.inputs["To Min"].default_value = 0.35
            contrast.inputs["To Max"].default_value = 1.65
            contrast.clamp = True
            links.new(normalize.outputs[0], contrast.inputs["Value"])
            tint = node("ShaderNodeMixRGB", "Original Palette", (130, 560))
            tint.blend_type = "MULTIPLY"
            tint.inputs[0].default_value = 1
            tint.inputs[1].default_value = color
            links.new(contrast.outputs[0], tint.inputs[2])
            links.new(tint.outputs[0], bsdf.inputs["Base Color"])
        for role, socket, y in (("roughness", "Roughness", 220), ("metalness", "Metallic", -50)):
            remap = node("ShaderNodeMapRange", f"Calibrated {role}", (-150, y))
            remap.inputs["To Min"].default_value = family[role][0]
            remap.inputs["To Max"].default_value = family[role][1]
            signal = textures[role].outputs["Color"]
            if role == "roughness" and family["roughness_is_smoothness"]:
                invert = node("ShaderNodeMath", "Convert Smoothness To Roughness", (-380, 180))
                invert.operation = "SUBTRACT"
                invert.inputs[0].default_value = 1
                links.new(signal, invert.inputs[1])
                signal = invert.outputs[0]
            links.new(signal, remap.inputs["Value"])
            links.new(remap.outputs[0], bsdf.inputs[socket])
        normal = node("ShaderNodeNormalMap", "PATINA Tangent Normal", (-280, -410))
        normal.uv_map = UV_LAYER
        normal.inputs["Strength"].default_value = family["normal_strength"]
        links.new(textures["normal"].outputs["Color"], normal.inputs["Color"])
        bump = node("ShaderNodeBump", "PATINA Height Microdetail", (80, -380))
        bump.inputs["Strength"].default_value = 0.25
        bump.inputs["Distance"].default_value = family["bump_distance"]
        links.new(textures["height"].outputs["Color"], bump.inputs["Height"])
        links.new(normal.outputs["Normal"], bump.inputs["Normal"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        if family_name in COAT_WEIGHT:
            bsdf.inputs["Coat Weight"].default_value = COAT_WEIGHT[family_name]
            bsdf.inputs["Coat Roughness"].default_value = 0.16
        if family_name == "glass":
            bsdf.inputs["IOR"].default_value = 1.46
            bsdf.inputs["Coat Weight"].default_value = 0.30
            bsdf.inputs["Transmission Weight"].default_value = 0.12
        if family_name == "leaf":
            bsdf.inputs["Subsurface Weight"].default_value = 0.04
        self.report.append(
            {
                "material": material.name,
                "original": original.name,
                "family": family_name,
                "basecolor_mode": family["basecolor_mode"],
                "basecolor_mean_linear": luminance,
                "tile_span": family["tile_span"],
                "maps": len(ROLES),
            }
        )
        return material


def objects_by_material(objects) -> dict:
    grouped = {}
    for obj in objects:
        for slot in obj.material_slots:
            if slot.material is not None:
                grouped.setdefault(slot.material.name, []).append(obj.name)
    return grouped


def apply(manifest: dict, root: Path) -> dict:
    import bpy

    scene = bpy.context.scene
    objects = [obj for obj in scene.objects if obj.type == "MESH"]
    problems = validate_manifest(manifest, root, objects_by_material(objects))
    for obj in objects:
        if not obj.material_slots or any(s.material is None for s in obj.material_slots):
            problems.append(f"object {obj.name!r} has an empty material slot; assign one first")
    output = root / str(manifest.get("output", ""))
    if isinstance(manifest.get("output"), str) and manifest["output"] and output.exists():
        problems.append(f"output {output} exists; choose a new filename")
    if problems:
        raise SystemExit("Manifest problems:\n  " + "\n  ".join(problems))
    before_hash = geometry_hash(objects)
    overrides = manifest.get("object_overrides", [])
    applier = Applier(manifest, root)
    for obj in objects:
        # Each object gets its own mesh so the UV projection can follow its own scale.
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        add_patina_uv(obj)
        family = override_family(obj.name, overrides)
        for slot in obj.material_slots:
            original = slot.material
            mapped = family or manifest["materials"][original.name]
            slot.material = applier.material(original, mapped)
    after_hash = geometry_hash(objects)
    if after_hash != before_hash:
        raise RuntimeError("Geometry changed while applying materials; output not saved")
    for image in applier.images.values():
        image.pack()
    untouched = non_mesh_renderables(bpy.context.view_layer.objects)
    output.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "geometry_sha256_before": before_hash,
        "geometry_sha256_after": after_hash,
        "mesh_objects": len(objects),
        "materials": applier.report,
        "packed_images": len(applier.images),
        "non_mesh_renderables": untouched,
    }
    report_path = output.with_suffix(".materials.json")
    report_path.write_text(json.dumps(report, indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    return {
        "output": str(output),
        "report": str(report_path),
        "meshes": len(objects),
        "material_variants": len(applier.made),
        "packed_images": len(applier.images),
        "non_mesh_renderables": untouched,
        "geometry_preserved": True,
    }


def main(argv: list[str]) -> dict:
    if len(argv) != 1:
        raise SystemExit("usage: ... --python apply_materials.py -- <materials.json>")
    manifest, root = load_manifest(argv[0])
    result = apply(manifest, root)
    print(dump(result), flush=True)
    return result


if __name__ == "__main__":
    try:
        main(script_args())
    except Exception as exc:
        traceback.print_exc()
        # Without --python-exit-code Blender exits 0 on an uncaught exception; SystemExit
        # sets the status either way.
        raise SystemExit(f"apply_materials failed: {exc}") from None
