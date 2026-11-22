"""Import a 3D asset into Blender, save a packed Before.blend and summarize its materials.

    blender --background --factory-startup --python scripts/inventory.py -- <source> <out_dir>

<source> is a .glb, .gltf, .obj, .fbx or .blend file. The summary is what the agent
groups into material families; it never dumps geometry.
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import dump, geometry_hash, script_args, world_matrix  # noqa: E402

IMPORTERS = {
    ".glb": ("import_scene", "gltf"),
    ".gltf": ("import_scene", "gltf"),
    ".obj": ("wm", "obj_import"),
    ".fbx": ("import_scene", "fbx"),
}
DEFAULT_VIEWPORT_COLOR = [0.8, 0.8, 0.8, 1.0]
# Object types Blender never renders; every other non-mesh type is geometry these scripts
# leave alone.
UNRENDERED_TYPES = {"ARMATURE", "CAMERA", "EMPTY", "LATTICE", "LIGHT", "LIGHT_PROBE", "SPEAKER"}


def load_source(source: Path):
    suffix = source.suffix.lower()
    if suffix != ".blend" and suffix not in IMPORTERS:
        raise ValueError(f"{source.name}: expected .glb, .gltf, .obj, .fbx or .blend")
    import bpy

    if suffix == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(source))
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    module, operator = IMPORTERS[suffix]
    getattr(getattr(bpy.ops, module), operator)(filepath=str(source))


def principled_node(material):
    if material.node_tree is None:
        return None
    return next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def material_base_color(material) -> tuple[list | None, str]:
    """The color that renders and where it was read, or None with the reason it is unknown.

    A Base Color socket driven by another node (vertex colors, a texture, a mix) renders that
    node, not the socket default, and the default viewport grey says nothing about the author's
    palette.
    """
    if material.library is not None or not getattr(material, "is_editable", True):
        return None, "library"
    node = principled_node(material)
    if node is not None:
        socket = node.inputs["Base Color"]
        if socket.is_linked:
            return None, f"linked:{socket.links[0].from_node.type}"
        return [round(v, 6) for v in socket.default_value], "principled"
    color = [round(v, 6) for v in material.diffuse_color]
    if color != DEFAULT_VIEWPORT_COLOR:
        return color, "viewport"
    return None, "none"


def has_image_textures(material) -> bool:
    if material.node_tree is None:
        return False
    return any(n.type == "TEX_IMAGE" and n.image is not None for n in material.node_tree.nodes)


def non_mesh_renderables(objects) -> list[dict]:
    """Rendering non-mesh objects (text, curves, metaballs, surfaces) that keep their materials."""
    found = []
    for obj in objects:
        if obj.type == "MESH" or obj.type in UNRENDERED_TYPES or obj.hide_render:
            continue
        materials = [s.material.name for s in obj.material_slots if s.material is not None]
        found.append({"name": obj.name, "type": obj.type, "materials": materials})
    return sorted(found, key=lambda entry: entry["name"])


def extend_bounds(bounds: dict, corners) -> None:
    for axis in range(3):
        values = [corner[axis] for corner in corners]
        bounds["lo"][axis] = min(bounds["lo"][axis], min(values))
        bounds["hi"][axis] = max(bounds["hi"][axis], max(values))


def new_bounds() -> dict:
    return {"lo": [float("inf")] * 3, "hi": [float("-inf")] * 3}


def world_corners(obj) -> list[tuple]:
    matrix = world_matrix(obj)
    return [
        tuple(sum(matrix[i][j] * corner[j] for j in range(3)) + matrix[i][3] for i in range(3))
        for corner in obj.bound_box
    ]


def summarize(objects, source: Path) -> dict:
    materials = {}
    linked = []
    scene_bounds = new_bounds()
    without_material = []
    for obj in objects:
        corners = world_corners(obj)
        extend_bounds(scene_bounds, corners)
        slots = [slot.material for slot in obj.material_slots]
        if not slots or any(material is None for material in slots):
            without_material.append(obj.name)
        for material in slots:
            if material is None:
                continue
            if material.name not in materials:
                color, source_of_color = material_base_color(material)
                materials[material.name] = {
                    "objects": 0,
                    "examples": [],
                    "bounds": new_bounds(),
                    "base_color": color,
                    "base_color_source": source_of_color,
                    "has_image_textures": has_image_textures(material),
                }
                if source_of_color == "library":
                    library = getattr(material.library, "filepath", None)
                    linked.append({"name": material.name, "library": library})
            entry = materials[material.name]
            entry["objects"] += 1
            if len(entry["examples"]) < 3:
                entry["examples"].append(obj.name)
            extend_bounds(entry["bounds"], corners)
    dimensions = [0.0, 0.0, 0.0]
    if objects:
        dimensions = [hi - lo for lo, hi in zip(scene_bounds["lo"], scene_bounds["hi"])]
    return {
        "source": str(source),
        "meshes": len(objects),
        "polygons": sum(len(obj.data.polygons) for obj in objects),
        "dimensions": dimensions,
        "geometry_sha256": geometry_hash(objects),
        "objects_without_material": without_material,
        "materials": materials,
        "linked_materials": linked,
    }


def pack_all() -> str | None:
    """Pack every external file into the .blend; the error text when Blender refused one.

    pack_all packs the files it finds and then raises about the ones it cannot, so a stale
    texture path (which the workflow is about to replace) must not cost the whole inventory.
    """
    import bpy

    try:
        bpy.ops.file.pack_all()
    except RuntimeError as exc:
        return "; ".join(dict.fromkeys(str(exc).strip().splitlines()))
    return None


def main(argv: list[str]) -> dict:
    if len(argv) != 2:
        raise SystemExit("usage: ... --python inventory.py -- <source> <out_dir>")
    source = Path(argv[0]).resolve()
    out_dir = Path(argv[1]).resolve()
    if not source.is_file():
        raise FileNotFoundError(f"{source} does not exist")
    before = out_dir / "Before.blend"
    report_path = out_dir / "inventory.json"
    for path in (before, report_path):
        if path.exists():
            raise FileExistsError(f"{path} exists; choose an empty output directory")
    import bpy

    load_source(source)
    # Evaluates the visible objects so bound_box follows their modifiers. It never reaches a
    # hidden or excluded one, whose matrix_world stays identity: the bounds and the hash
    # compose the matrix themselves (common.world_matrix).
    bpy.context.view_layer.update()
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    report = summarize(objects, source)
    report["non_mesh_renderables"] = non_mesh_renderables(bpy.context.view_layer.objects)
    out_dir.mkdir(parents=True, exist_ok=True)
    error = pack_all()
    report["packed"] = error is None
    report["pack_error"] = error
    bpy.ops.wm.save_as_mainfile(filepath=str(before))
    report["before"] = str(before)
    report_path.write_text(json.dumps(report, indent=2))
    print(dump(report), flush=True)
    return report


if __name__ == "__main__":
    try:
        main(script_args())
    except Exception as exc:
        traceback.print_exc()
        # Without --python-exit-code Blender exits 0 on an uncaught exception; SystemExit
        # sets the status either way.
        raise SystemExit(f"inventory failed: {exc}") from None
