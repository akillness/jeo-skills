"""apply_materials.py's Blender side on duck-typed fakes (blender_fakes.py): UV projection,
the material graph each family gets, and apply()'s checks before and after it edits."""

import contextlib
import io
import json
import sys
import tempfile
import unittest
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

import blender_fakes as fakes
import helpers

apply_materials = helpers.load("apply_materials")
common = helpers.load("common")

ROLES = apply_materials.ROLES
# sRGB 128 decodes to this scene-linear value.
MID_GREY_LINEAR = ((128 / 255 + 0.055) / 1.055) ** 2.4


def write_maps(root, name, gray=128):
    folder = Path(root) / "maps" / name
    folder.mkdir(parents=True, exist_ok=True)
    maps = {}
    for role in ROLES:
        path = folder / f"{role}.png"
        Image.new("RGB", (4, 4), (gray, gray, gray)).save(path)
        maps[role] = path.relative_to(root).as_posix()
    return maps


def original(name, color=(0.2, 0.4, 0.6, 1.0)):
    return fakes.IDBlock(name, diffuse_color=color, node_tree=None)


class FakeBlender(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.scene = fakes.Scene()
        self.bpy = fakes.bpy_module(self.scene)
        mock.patch.dict(sys.modules, {"bpy": self.bpy}).start()
        self.addCleanup(mock.patch.stopall)

    def applier(self, families, **manifest):
        defined = {}
        for name, settings in families.items():
            defined[name] = {"tile_span": 0.5, "maps": write_maps(self.root, name), **settings}
        manifest["families"] = defined
        return apply_materials.Applier(manifest, self.root)


class ValidationGapTests(unittest.TestCase):
    def test_family_and_maps_shapes(self):
        manifest = {
            "output": "out.blend",
            "materials": {"Paint": "plaster", "Trim": "metal"},
            "families": {"plaster": ["not", "an", "object"], "metal": {"tile_span": 1, "maps": []}},
        }
        problems = apply_materials.validate_manifest(manifest, Path("."), {})
        self.assertIn("family 'plaster': must be an object", problems)
        self.assertIn("family 'metal': maps must map roles to files", problems)
        self.assertIn(f"family 'metal': missing map roles {', '.join(ROLES)}", problems)

    def test_without_pillow_an_image_is_never_judged(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "broken.png"
            path.write_bytes(b"not a png")
            self.assertIsNotNone(apply_materials.unreadable_image(path))
            with mock.patch.dict(sys.modules, {"PIL": None}):
                self.assertIsNone(apply_materials.unreadable_image(path))


class UVTests(unittest.TestCase):
    def test_projection_follows_each_face_and_the_object_scale(self):
        obj = fakes.SceneObject("Wall", fakes.Mesh())
        obj.matrix_basis = fakes.matrix(location=(5, 5, 5), scale=(2, 3, 4))
        apply_materials.add_patina_uv(obj)
        mesh = obj.data
        layer = mesh.uv_layers.active
        self.assertEqual(layer.name, "PatinaUV")
        self.assertTrue(layer.active_render)
        for polygon in mesh.polygons:
            for loop in polygon.loop_indices:
                co = mesh.vertices[mesh.loops[loop].vertex_index].co
                want = apply_materials.projected_uv(co, polygon.normal, (2, 3, 4))
                self.assertEqual(layer.data[loop].uv, want)
        # Top face (+Z) projects x, y; vertex 7 is (0.5, 0.5, 0.5) scaled to (1, 1.5, 2).
        self.assertEqual(layer.data[2].uv, (1.0, 1.5))
        # Front face (-Y) projects -x * sign, z: (0.5, -0.5, 0.5) scales to (1, -1.5, 2).
        self.assertEqual(layer.data[6].uv, (1.0, 2.0))


class OriginalColorTests(unittest.TestCase):
    def test_unlinked_principled_color_wins_over_the_viewport_color(self):
        material = fakes.IDBlock("M", diffuse_color=(0.3, 0.3, 0.3, 1.0))
        socket = SimpleNamespace(default_value=[0.9, 0.1, 0.1, 1.0], is_linked=False)
        material.node_tree.nodes.append(
            SimpleNamespace(type="BSDF_PRINCIPLED", inputs={"Base Color": socket})
        )
        self.assertEqual(apply_materials.original_color(material), (0.9, 0.1, 0.1, 1.0))
        socket.is_linked = True
        self.assertEqual(apply_materials.original_color(material), (0.3, 0.3, 0.3, 1.0))

    def test_material_without_nodes_uses_the_viewport_color(self):
        self.assertEqual(apply_materials.original_color(original("M")), (0.2, 0.4, 0.6, 1.0))


class ImageTests(FakeBlender):
    def test_maps_load_once_with_their_color_space(self):
        applier = self.applier({"plaster": {}})
        color = applier.image("plaster", "basecolor")
        data = applier.image("plaster", "roughness")
        self.assertIs(applier.image("plaster", "basecolor"), color)
        self.assertEqual(len(self.bpy.data.images), 2)
        self.assertEqual(color.name, "PATINA | plaster | basecolor")
        self.assertEqual(color.colorspace_settings.name, "sRGB")
        self.assertEqual(data.colorspace_settings.name, "Non-Color")

    def test_missing_file_names_the_family_and_role(self):
        applier = self.applier({"plaster": {}})
        applier.manifest["families"]["plaster"]["maps"]["normal"] = "gone.png"
        with self.assertRaises(RuntimeError) as caught:
            applier.image("plaster", "normal")
        self.assertTrue(str(caught.exception).startswith("family 'plaster' normal map: Error"))

    def test_zero_size_load_is_an_unreadable_image(self):
        applier = self.applier({"plaster": {}})
        broken = self.root / "broken.png"
        broken.write_bytes(b"not a png")
        applier.manifest["families"]["plaster"]["maps"]["height"] = "broken.png"
        with self.assertRaises(RuntimeError) as caught:
            applier.image("plaster", "height")
        self.assertIn("unreadable image", str(caught.exception))
        self.assertEqual(applier.images, {})


class BuildTests(FakeBlender):
    def build(self, family_name="plaster", settings=None, **manifest):
        manifest.setdefault("materials", {"Paint": family_name})
        applier = self.applier({family_name: settings or {}}, **manifest)
        material = applier.material(original("Paint"), family_name)
        return applier, material, material.node_tree

    def feeding(self, tree, node_name, socket):
        source = tree.links.source(tree.nodes.named(node_name).inputs[socket])
        return source.node.name if source else None

    def test_tint_keeps_the_original_palette_under_the_map_variation(self):
        applier, material, tree = self.build()
        self.assertEqual(material.name, "PATINA | Paint")
        self.assertTrue(material.use_nodes)
        self.assertEqual(material.diffuse_color, (0.2, 0.4, 0.6, 1.0))
        self.assertEqual(material["patina_family"], "plaster")
        self.assertEqual(material["original_material"], "Paint")
        self.assertNotIn("patina_provenance", material.properties)
        self.assertEqual(self.feeding(tree, "PATINA Surface", "Base Color"), "Original Palette")
        tint = tree.nodes.named("Original Palette")
        self.assertEqual(tint.blend_type, "MULTIPLY")
        self.assertEqual(tint.inputs[1].default_value, (0.2, 0.4, 0.6, 1.0))
        divide = tree.nodes.named("Normalize PATINA Luminance")
        self.assertEqual(divide.operation, "DIVIDE")
        self.assertAlmostEqual(divide.inputs[1].default_value, MID_GREY_LINEAR, places=5)
        self.assertEqual(
            self.feeding(tree, "Retain Surface Variation", "Color"), "PATINA basecolor"
        )
        self.assertEqual(self.feeding(tree, "Material Output", "Surface"), "PATINA Surface")
        report = applier.report[0]
        self.assertEqual(report["basecolor_mode"], "tint")
        self.assertAlmostEqual(report["basecolor_mean_linear"], MID_GREY_LINEAR, places=5)
        self.assertEqual((report["tile_span"], report["maps"]), (0.5, 5))

    def test_every_map_tiles_at_the_physical_span(self):
        _, _, tree = self.build(settings={"tile_span": 0.25})
        tiling = tree.nodes.named("Physical Tile Scale")
        self.assertEqual(tiling.inputs[3].default_value, 4)
        self.assertEqual(self.feeding(tree, "Physical Tile Scale", 0), "Dedicated PatinaUV")
        for role in ROLES:
            texture = tree.nodes.named(f"PATINA {role}")
            self.assertEqual(texture.extension, "REPEAT")
            self.assertEqual(texture.image.name, f"PATINA | plaster | {role}")
            self.assertEqual(self.feeding(tree, f"PATINA {role}", "Vector"), "Physical Tile Scale")

    def test_replace_wires_the_map_straight_in(self):
        applier, _, tree = self.build(settings={"basecolor_mode": "replace"})
        self.assertEqual(self.feeding(tree, "PATINA Surface", "Base Color"), "PATINA basecolor")
        self.assertFalse(any(getattr(n, "name", "") == "Original Palette" for n in tree.nodes))
        self.assertIsNone(applier.report[0]["basecolor_mean_linear"])

    def test_roughness_and_metalness_are_remapped_to_the_family_range(self):
        settings = {"roughness": [0.2, 0.9], "metalness": [0.8, 1.0]}
        _, _, tree = self.build(settings=settings)
        rough = tree.nodes.named("Calibrated roughness")
        self.assertEqual(
            (rough.inputs["To Min"].default_value, rough.inputs["To Max"].default_value), (0.2, 0.9)
        )
        self.assertEqual(self.feeding(tree, "Calibrated roughness", "Value"), "PATINA roughness")
        self.assertEqual(self.feeding(tree, "PATINA Surface", "Roughness"), "Calibrated roughness")
        metal = tree.nodes.named("Calibrated metalness")
        self.assertEqual(metal.inputs["To Min"].default_value, 0.8)
        self.assertEqual(self.feeding(tree, "PATINA Surface", "Metallic"), "Calibrated metalness")

    def test_smoothness_maps_are_inverted_first(self):
        _, _, tree = self.build(settings={"roughness_is_smoothness": True})
        invert = "Convert Smoothness To Roughness"
        self.assertEqual(self.feeding(tree, "Calibrated roughness", "Value"), invert)
        self.assertEqual(tree.nodes.named(invert).operation, "SUBTRACT")
        self.assertEqual(tree.nodes.named(invert).inputs[0].default_value, 1)
        self.assertEqual(self.feeding(tree, invert, 1), "PATINA roughness")

    def test_normal_and_height_chain_into_the_surface(self):
        _, _, tree = self.build(settings={"normal_strength": 0.6, "bump_distance": 0.01})
        normal = tree.nodes.named("PATINA Tangent Normal")
        self.assertEqual(normal.uv_map, "PatinaUV")
        self.assertEqual(normal.inputs["Strength"].default_value, 0.6)
        bump = tree.nodes.named("PATINA Height Microdetail")
        self.assertEqual(bump.inputs["Distance"].default_value, 0.01)
        self.assertEqual(
            self.feeding(tree, "PATINA Height Microdetail", "Normal"), "PATINA Tangent Normal"
        )
        self.assertEqual(self.feeding(tree, "PATINA Height Microdetail", "Height"), "PATINA height")
        self.assertEqual(
            self.feeding(tree, "PATINA Surface", "Normal"), "PATINA Height Microdetail"
        )

    def test_family_specific_surface_touches(self):
        _, _, ceramic = self.build("ceramic")
        bsdf = ceramic.nodes.named("PATINA Surface")
        self.assertEqual(bsdf.inputs["Coat Weight"].default_value, 0.22)
        self.assertEqual(bsdf.inputs["Coat Roughness"].default_value, 0.16)
        for name in ("enamel", "plastic"):
            _, _, coated = self.build(name)
            bsdf = coated.nodes.named("PATINA Surface")
            self.assertEqual(bsdf.inputs["Coat Weight"].default_value, 0.12, name)
            self.assertEqual(bsdf.inputs["Coat Roughness"].default_value, 0.16, name)
        _, _, glass = self.build("glass")
        bsdf = glass.nodes.named("PATINA Surface")
        self.assertEqual(bsdf.inputs["IOR"].default_value, 1.46)
        self.assertEqual(bsdf.inputs["Coat Weight"].default_value, 0.30)
        self.assertEqual(bsdf.inputs["Transmission Weight"].default_value, 0.12)
        _, _, leaf = self.build("leaf")
        bsdf = leaf.nodes.named("PATINA Surface")
        self.assertEqual(bsdf.inputs["Subsurface Weight"].default_value, 0.04)
        self.assertNotIn("Coat Weight", bsdf.inputs)
        _, _, plaster = self.build("plaster")
        touched = set(plaster.nodes.named("PATINA Surface").inputs)
        self.assertFalse(touched & {"Coat Weight", "IOR", "Subsurface Weight"})

    def test_provenance_is_stored_as_sorted_json(self):
        _, material, _ = self.build(provenance={"model": "m", "job": "j"})
        self.assertEqual(material["patina_provenance"], '{"job": "j", "model": "m"}')

    def test_a_variant_is_built_once_per_material_and_family(self):
        applier = self.applier({"plaster": {}, "metal": {}}, materials={"Paint": "plaster"})
        paint = original("Paint")
        first = applier.material(paint, "plaster")
        self.assertIs(applier.material(paint, "plaster"), first)
        override = applier.material(paint, "metal")
        self.assertEqual(override.name, "PATINA | Paint | metal")
        self.assertEqual(len(self.bpy.data.materials), 2)
        self.assertEqual(len(applier.report), 2)


class ApplyTests(FakeBlender):
    def setUp(self):
        super().setUp()
        self.paint = original("Paint")
        self.shared = fakes.Mesh(users=2)
        self.wall = fakes.SceneObject("Wall", self.shared, materials=[self.paint])
        self.trim = fakes.SceneObject("Trim_01", self.shared, materials=[self.paint])
        self.sign = fakes.SceneObject("Sign", kind="FONT", materials=[self.paint])
        self.lamp = fakes.SceneObject("Lamp", fakes.LightData("Lamp", "POINT"))
        self.scene.objects += [self.wall, self.trim, self.sign, self.lamp]
        self.saved = []
        self.bpy.ops.wm = SimpleNamespace(
            save_as_mainfile=lambda filepath: self.saved.append(filepath)
        )
        self.manifest = {
            "output": "out/PATINA.blend",
            "materials": {"Paint": "plaster"},
            "object_overrides": [{"prefixes": ["Trim_"], "family": "metal"}],
            "families": {
                name: {"tile_span": 0.5, "maps": write_maps(self.root, name)}
                for name in ("plaster", "metal")
            },
        }

    def test_scene_problems_stop_before_anything_changes(self):
        output = self.root / "out" / "PATINA.blend"
        output.parent.mkdir()
        output.write_bytes(b"keep")
        self.scene.objects.append(fakes.SceneObject("Bare", fakes.Mesh()))
        with self.assertRaises(SystemExit) as caught:
            apply_materials.apply(self.manifest, self.root)
        message = str(caught.exception)
        self.assertTrue(message.startswith("Manifest problems:"))
        self.assertIn("object 'Bare' has an empty material slot", message)
        self.assertIn(f"output {output} exists", message)
        self.assertEqual(output.read_bytes(), b"keep")
        self.assertEqual((self.saved, list(self.bpy.data.materials)), ([], []))
        self.assertEqual(self.shared.uv_layers, [])

    def test_materials_swap_on_own_meshes_and_the_report_proves_geometry_held(self):
        before = common.geometry_hash([self.trim, self.wall])
        result = apply_materials.apply(self.manifest, self.root)
        output = self.root / "out" / "PATINA.blend"
        self.assertEqual(self.saved, [str(output)])
        self.assertEqual(result["output"], str(output))
        self.assertEqual(result["meshes"], 2)
        self.assertEqual(result["material_variants"], 2)
        self.assertEqual(result["packed_images"], 10)
        self.assertTrue(result["geometry_preserved"])
        self.assertTrue(all(image.packed for image in self.bpy.data.images))
        self.assertEqual(self.wall.material_slots[0].material.name, "PATINA | Paint")
        self.assertEqual(self.trim.material_slots[0].material.name, "PATINA | Paint | metal")
        self.assertIs(self.sign.material_slots[0].material, self.paint)
        self.assertEqual(
            result["non_mesh_renderables"],
            [{"name": "Sign", "type": "FONT", "materials": ["Paint"]}],
        )
        self.assertIsNot(self.wall.data, self.shared)
        self.assertIsNot(self.trim.data, self.wall.data)
        for obj in (self.wall, self.trim):
            self.assertEqual([layer.name for layer in obj.data.uv_layers], ["PatinaUV"])
        report = json.loads((self.root / "out" / "PATINA.materials.json").read_text())
        self.assertEqual(result["report"], str(self.root / "out" / "PATINA.materials.json"))
        self.assertEqual(report["geometry_sha256_before"], before)
        self.assertEqual(report["geometry_sha256_after"], before)
        self.assertEqual(report["mesh_objects"], 2)
        self.assertEqual(
            sorted((m["original"], m["family"]) for m in report["materials"]),
            [("Paint", "metal"), ("Paint", "plaster")],
        )

    def test_geometry_change_aborts_without_saving(self):
        real = apply_materials.add_patina_uv

        def warp(obj):
            real(obj)
            obj.data.vertices[0].co = (9, 9, 9)

        with mock.patch.object(apply_materials, "add_patina_uv", warp):
            with self.assertRaises(RuntimeError) as caught:
                apply_materials.apply(self.manifest, self.root)
        self.assertIn("Geometry changed", str(caught.exception))
        self.assertEqual(self.saved, [])
        self.assertFalse((self.root / "out" / "PATINA.materials.json").exists())

    def test_objects_by_material_skips_empty_slots(self):
        self.wall.material_slots.append(SimpleNamespace(material=None))
        grouped = apply_materials.objects_by_material([self.wall, self.trim])
        self.assertEqual(grouped, {"Paint": ["Wall", "Trim_01"]})

    def test_main_prints_the_result_as_compact_json(self):
        manifest = self.root / "materials.json"
        manifest.write_text(json.dumps(self.manifest))
        with contextlib.redirect_stdout(io.StringIO()) as out:
            result = apply_materials.main([str(manifest)])
        self.assertEqual(json.loads(out.getvalue()), result)
        self.assertEqual(result["material_variants"], 2)
        with self.assertRaises(SystemExit) as caught:
            apply_materials.main([])
        self.assertIn("usage", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
