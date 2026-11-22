"""Smoke test against a real bpy module. Skipped where Blender's Python module is absent.

bpy cannot be re-imported after a crash, so everything runs in one TestCase and one test
method, stage by stage, with no rendering (no display or GPU is assumed).
"""

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

import helpers

HAS_BPY = importlib.util.find_spec("bpy") is not None

MAP_COLORS = {
    "basecolor": (180, 150, 120),
    "normal": (128, 128, 255),
    "roughness": (128, 128, 128),
    "metalness": (0, 0, 0),
    "height": (128, 128, 128),
}


def write_maps(root, family):
    folder = Path(root) / "textures" / family
    folder.mkdir(parents=True, exist_ok=True)
    maps = {}
    for role, color in MAP_COLORS.items():
        path = folder / f"{role}.png"
        Image.new("RGB", (8, 8), color).save(path)
        maps[role] = str(path.relative_to(root))
    return maps


@unittest.skipUnless(HAS_BPY, "bpy module not installed")
class BlenderPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.root = Path(cls.folder.name).resolve()
        cls.common = helpers.load("common")
        cls.inventory = helpers.load("inventory")
        cls.apply_materials = helpers.load("apply_materials")
        cls.scene = helpers.load("scene")

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def build_source(self):
        import bpy

        bpy.ops.wm.read_factory_settings(use_empty=True)
        cubes = (
            ("WallCube", (0, 0, 0), (0.8, 0.1, 0.1, 1)),
            ("TrimCube", (3, 0, 0), (0.1, 0.2, 0.9, 1)),
            ("AtticCube", (0, 0, 6), (0.3, 0.6, 0.2, 1)),
        )
        for name, location, color in cubes:
            bpy.ops.mesh.primitive_cube_add(size=1, location=location)
            obj = bpy.context.object
            obj.name = name
            material = bpy.data.materials.new(name.replace("Cube", ""))
            tree = self.apply_materials.ensure_nodes(material)
            bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
            bsdf.inputs["Base Color"].default_value = color
            obj.data.materials.append(material)
        # Disabled in viewports: the depsgraph never evaluates it, so after open_mainfile its
        # matrix_world reads identity while it still renders 6 units up.
        bpy.data.objects["AtticCube"].hide_viewport = True
        # Text renders but is not a mesh; the hidden curve must stay out of every listing.
        bpy.ops.object.text_add(location=(0, 3, 0))
        sign = bpy.context.object
        sign.name = "ShopSign"
        sign.data.materials.append(bpy.data.materials.new("SignPaint"))
        bpy.ops.curve.primitive_bezier_curve_add(location=(0, -3, 0))
        pipe = bpy.context.object
        pipe.name = "HiddenPipe"
        pipe.hide_render = True
        source = self.root / "source.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(source))
        return source

    def quiet(self, function, *args):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            result = function(*args)
        return result, out.getvalue()

    def test_pipeline(self):
        import bpy

        source = self.build_source()
        out_dir = self.root / "inventory"

        with self.subTest("inventory"):
            report, printed = self.quiet(self.inventory.main, [str(source), str(out_dir)])
            self.assertEqual(json.loads(printed.strip().splitlines()[-1]), report)
            self.assertEqual(json.loads((out_dir / "inventory.json").read_text()), report)
            self.assertTrue((out_dir / "Before.blend").is_file())
            self.assertEqual(report["source"], str(source))
            self.assertEqual(report["meshes"], 3)
            self.assertEqual(report["polygons"], 18)
            self.assertEqual(len(report["dimensions"]), 3)
            self.assertAlmostEqual(report["dimensions"][0], 4.0, places=5)
            self.assertAlmostEqual(report["dimensions"][1], 1.0, places=5)
            self.assertAlmostEqual(report["dimensions"][2], 7.0, places=5)
            self.assertEqual(len(report["geometry_sha256"]), 64)
            self.assertEqual(report["objects_without_material"], [])
            self.assertEqual(set(report["materials"]), {"Wall", "Trim", "Attic"})
            attic = report["materials"]["Attic"]["bounds"]
            self.assertAlmostEqual(attic["lo"][2], 5.5, places=5)
            self.assertAlmostEqual(attic["hi"][2], 6.5, places=5)
            wall = report["materials"]["Wall"]
            self.assertEqual(wall["objects"], 1)
            self.assertEqual(wall["examples"], ["WallCube"])
            self.assertAlmostEqual(wall["base_color"][0], 0.8, places=5)
            self.assertEqual(wall["base_color_source"], "principled")
            self.assertFalse(wall["has_image_textures"])
            self.assertAlmostEqual(wall["bounds"]["lo"][0], -0.5, places=5)
            self.assertAlmostEqual(report["materials"]["Trim"]["bounds"]["hi"][0], 3.5, places=5)
            self.assertEqual(report["linked_materials"], [])
            self.assertEqual(
                report["non_mesh_renderables"],
                [{"name": "ShopSign", "type": "FONT", "materials": ["SignPaint"]}],
            )
            self.assertTrue(report["packed"])
            self.assertIsNone(report["pack_error"])
            with self.assertRaises(FileExistsError):
                self.inventory.main([str(source), str(out_dir)])

        manifest_path = self.root / "materials.json"
        manifest = {
            "output": "PATINA.blend",
            "materials": {"Wall": "plaster", "Attic": "plaster"},
            "object_overrides": [{"prefixes": ["TrimCube"], "family": "cedar"}],
            "families": {
                "plaster": {"tile_span": 1.2, "maps": write_maps(self.root, "plaster")},
                "cedar": {
                    "tile_span": 0.7,
                    "basecolor_mode": "replace",
                    "roughness_is_smoothness": True,
                    "roughness": [0.35, 0.75],
                    "maps": write_maps(self.root, "cedar"),
                },
            },
            "provenance": {"jobs": ["job_1", "job_2"], "model": "recorded by the agent"},
        }
        manifest_path.write_text(json.dumps(manifest))

        with self.subTest("apply_materials"):
            bpy.ops.wm.open_mainfile(filepath=str(out_dir / "Before.blend"))
            result, printed = self.quiet(self.apply_materials.main, [str(manifest_path)])
            self.assertEqual(json.loads(printed.strip().splitlines()[-1]), result)
            output = Path(result["output"])
            self.assertEqual(output, self.root / "PATINA.blend")
            self.assertTrue(output.is_file())
            self.assertTrue(result["geometry_preserved"])
            self.assertEqual(result["material_variants"], 3)
            self.assertEqual(result["packed_images"], 10)
            self.assertEqual(result["non_mesh_renderables"], report["non_mesh_renderables"])
            written = json.loads((self.root / "PATINA.materials.json").read_text())
            self.assertEqual(written["non_mesh_renderables"], report["non_mesh_renderables"])
            self.assertEqual(written["geometry_sha256_before"], report["geometry_sha256"])
            self.assertEqual(written["geometry_sha256_after"], report["geometry_sha256"])
            self.assertEqual(len(written["materials"]), 3)
            by_original = {m["original"]: m for m in written["materials"]}
            self.assertEqual(by_original["Wall"]["basecolor_mode"], "tint")
            self.assertGreater(by_original["Wall"]["basecolor_mean_linear"], 0.02)
            self.assertEqual(by_original["Attic"]["family"], "plaster")
            self.assertEqual(by_original["Trim"]["basecolor_mode"], "replace")
            self.assertIsNone(by_original["Trim"]["basecolor_mean_linear"])

        with self.subTest("reopen output"):
            bpy.ops.wm.open_mainfile(filepath=str(self.root / "PATINA.blend"))
            meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
            self.assertEqual(len(meshes), 3)
            names = {}
            for obj in meshes:
                self.assertIn("PatinaUV", obj.data.uv_layers)
                for slot in obj.material_slots:
                    self.assertTrue(slot.material.name.startswith("PATINA | "), slot.material.name)
                    names[obj.name] = slot.material.name
                    self.assertEqual(
                        json.loads(slot.material["patina_provenance"]), manifest["provenance"]
                    )
            self.assertEqual(
                names,
                {
                    "WallCube": "PATINA | Wall",
                    "TrimCube": "PATINA | Trim | cedar",
                    "AtticCube": "PATINA | Attic",
                },
            )
            wall = bpy.data.materials["PATINA | Wall"]
            self.assertEqual(wall["patina_family"], "plaster")
            base = wall.node_tree.nodes["PATINA Surface"].inputs["Base Color"].links[0].from_node
            self.assertEqual(base.name, "Original Palette")
            trim = bpy.data.materials["PATINA | Trim | cedar"]
            base = trim.node_tree.nodes["PATINA Surface"].inputs["Base Color"].links[0].from_node
            self.assertEqual(base.name, "PATINA basecolor")
            self.assertIn("Convert Smoothness To Roughness", trim.node_tree.nodes)
            remap = trim.node_tree.nodes["Calibrated roughness"]
            self.assertEqual(remap.inputs["To Max"].default_value, 0.75)
            for image in bpy.data.images:
                if image.name.startswith("PATINA | "):
                    self.assertIsNotNone(image.packed_file, image.name)
            self.assertEqual(
                self.common.geometry_hash(meshes), report["geometry_sha256"]
            )

        environment = self.root / "environment.png"
        Image.new("RGB", (16, 8), (200, 200, 220)).save(environment)
        config, _ = self.common.read_config(
            helpers.write_config(
                self.root,
                before="inventory/Before.blend",
                after="PATINA.blend",
                shots=[helpers.shot("Detail", 2.0, 1.5)],
                shot_seconds=1.0,
                width=64,
                height=36,
                environment=str(environment),
            )
        )

        with self.subTest("scene setup in pilot mode"):
            scene, records, contract = self.scene.setup(config, "patina", preview=True)
            self.assertEqual(scene.camera.name, self.scene.CAMERA_NAME)
            lights = sorted(o.name for o in scene.objects if o.type == "LIGHT")
            self.assertEqual(len(lights), 4)
            self.assertIn(self.scene.STRIP_NAME, lights)
            self.assertEqual(len(records), 24)
            self.assertEqual(scene.frame_end, 24)
            self.assertEqual(scene.render.resolution_percentage, 50)
            self.assertIn(scene.render.engine, ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"))
            self.assertEqual(contract["pass_name"], "patina")
            self.assertEqual(len(contract["camera_sha256"]), 64)
            self.assertEqual(contract["geometry_sha256"], report["geometry_sha256"])
            self.assertIn("environment.png", contract["settings"]["environment"])
            self.assertEqual(len(contract["settings"]["lights"]), 4)

        with self.subTest("before pass produces the same contract"):
            bpy.ops.wm.open_mainfile(filepath=str(out_dir / "Before.blend"))
            _, _, other = self.scene.setup(config, "original", preview=True)
            for key in ("camera_sha256", "settings", "geometry_sha256"):
                self.assertEqual(other[key], contract[key], key)

        with self.subTest("manifest problems stop before the scene changes"):
            bpy.ops.wm.open_mainfile(filepath=str(out_dir / "Before.blend"))
            bad = {
                "output": "Rejected.blend",
                "materials": {"Wall": "plaster"},
                "families": {"plaster": {"tile_span": 1, "maps": {"basecolor": "missing.png"}}},
            }
            bad_path = self.root / "bad.json"
            bad_path.write_text(json.dumps(bad))
            with self.assertRaises(SystemExit) as caught:
                self.apply_materials.main([str(bad_path)])
            message = str(caught.exception)
            self.assertIn("material 'Trim' is neither mapped", message)
            self.assertIn("missing map roles", message)
            self.assertIn("basecolor map missing.png not found", message)
            self.assertFalse((self.root / "Rejected.blend").exists())
            self.assertNotIn("PatinaUV", bpy.data.objects["WallCube"].data.uv_layers)

        with self.subTest("an unreadable map is refused before and after validation"):
            bpy.ops.wm.open_mainfile(filepath=str(out_dir / "Before.blend"))
            broken = json.loads(json.dumps(manifest))
            broken["output"] = "Broken.blend"
            broken["families"]["plaster"]["maps"] = write_maps(self.root, "broken")
            xml_path = self.root / broken["families"]["plaster"]["maps"]["basecolor"]
            xml_path.write_text("<?xml version='1.0'?><Error>expired</Error>")
            broken_path = self.root / "broken.json"
            broken_path.write_text(json.dumps(broken))
            with self.assertRaises(SystemExit) as caught:
                self.apply_materials.main([str(broken_path)])
            message = str(caught.exception)
            self.assertIn("basecolor map textures/broken/basecolor.png is not a readable", message)
            self.assertFalse((self.root / "Broken.blend").exists())
            # The bpy load is the backstop where Pillow is not importable.
            applier = self.apply_materials.Applier(broken, self.root)
            with self.assertRaises(RuntimeError) as caught:
                applier.image("plaster", "basecolor")
            self.assertIn(str(xml_path), str(caught.exception))
            self.assertIn("unreadable image", str(caught.exception))
            broken["families"]["cedar"]["maps"]["basecolor"] = "textures/cedar/gone.png"
            with self.assertRaises(RuntimeError) as caught:
                applier.image("cedar", "basecolor")
            self.assertIn("family 'cedar' basecolor map", str(caught.exception))
            self.assertIn("gone.png", str(caught.exception))
            self.assertEqual(applier.images, {})

        with self.subTest("a 16-bit basecolor is not decoded twice"):
            gray = 128
            eight = self.root / "gray8.png"
            sixteen = self.root / "gray16.png"
            Image.new("RGB", (8, 8), (gray, gray, gray)).save(eight)
            Image.fromarray(np.full((8, 8), gray * 257, dtype=np.uint16)).save(sixteen)
            means = []
            for path in (eight, sixteen):
                image = bpy.data.images.load(str(path))
                image.colorspace_settings.name = "sRGB"
                means.append(self.apply_materials.image_luminance_mean(image))
            self.assertAlmostEqual(means[0], 0.21586, places=4)
            self.assertAlmostEqual(means[1], means[0], places=4)

        with self.subTest("a map file shared by two families is one packed image"):
            bpy.ops.wm.open_mainfile(filepath=str(out_dir / "Before.blend"))
            shared = json.loads(json.dumps(manifest))
            shared["output"] = "Shared.blend"
            shared["families"]["cedar"]["maps"]["normal"] = manifest["families"]["plaster"]["maps"][
                "normal"
            ]
            shared_path = self.root / "shared.json"
            shared_path.write_text(json.dumps(shared))
            result, _ = self.quiet(self.apply_materials.main, [str(shared_path)])
            self.assertEqual(result["packed_images"], 9)
            wall_nodes = bpy.data.materials["PATINA | Wall"].node_tree.nodes
            trim_nodes = bpy.data.materials["PATINA | Trim | cedar"].node_tree.nodes
            normal = wall_nodes["PATINA normal"].image
            self.assertIs(normal, trim_nodes["PATINA normal"].image)
            self.assertEqual(normal.name, "PATINA | plaster | normal")
            self.assertEqual(normal.colorspace_settings.name, "Non-Color")
            self.assertEqual(wall_nodes["PATINA basecolor"].image.colorspace_settings.name, "sRGB")
            self.assertEqual(len([i for i in bpy.data.images if i.name.startswith("PATINA | ")]), 9)

        with self.subTest("inventory survives a texture file that is gone"):
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.mesh.primitive_cube_add(size=1)
            cube = bpy.context.object
            textured = bpy.data.materials.new("Textured")
            tree = self.common.ensure_nodes(textured)
            texture = tree.nodes.new("ShaderNodeTexImage")
            loose = self.root / "loose.png"
            Image.new("RGB", (4, 4), (10, 20, 30)).save(loose)
            texture.image = bpy.data.images.load(str(loose))
            cube.data.materials.append(textured)
            textured_source = self.root / "textured.blend"
            bpy.ops.wm.save_as_mainfile(filepath=str(textured_source))
            loose.unlink()
            textured_out = self.root / "textured_inventory"
            report2, _ = self.quiet(self.inventory.main, [str(textured_source), str(textured_out)])
            self.assertFalse(report2["packed"])
            self.assertIn("not found", report2["pack_error"])
            self.assertTrue(report2["materials"]["Textured"]["has_image_textures"])
            self.assertTrue((textured_out / "Before.blend").is_file())
            written = json.loads((textured_out / "inventory.json").read_text())
            self.assertEqual(written["pack_error"], report2["pack_error"])

        with self.subTest("base color reports where it was read"):
            base_color = self.inventory.material_base_color
            vertex = bpy.data.materials.new("VertexPainted")
            tree = self.common.ensure_nodes(vertex)
            bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
            attribute = tree.nodes.new("ShaderNodeVertexColor")
            tree.links.new(attribute.outputs["Color"], bsdf.inputs["Base Color"])
            self.assertEqual(base_color(vertex), (None, "linked:VERTEX_COLOR"))
            original = self.apply_materials.original_color(vertex)
            self.assertEqual(original, tuple(vertex.diffuse_color))
            glow = bpy.data.materials.new("Glow")
            tree = self.common.ensure_nodes(glow)
            tree.nodes.clear()
            tree.nodes.new("ShaderNodeEmission")
            self.assertEqual(base_color(glow), (None, "none"))
            glow.diffuse_color = (0.9, 0.2, 0.1, 1.0)
            color, source = base_color(glow)
            self.assertEqual(source, "viewport")
            self.assertAlmostEqual(color[0], 0.9, places=5)

        with self.subTest("world_matrix agrees with the depsgraph on a parented object"):
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.mesh.primitive_cube_add(size=1, location=(1, 2, 3))
            parent = bpy.context.object
            parent.rotation_euler = (0.3, 0.2, 0.1)
            parent.scale = (2, 1, 1)
            bpy.ops.mesh.primitive_cube_add(size=1, location=(0.5, 0, 0))
            child = bpy.context.object
            child.parent = parent
            bpy.context.view_layer.update()
            child.matrix_parent_inverse = parent.matrix_world.inverted()
            bpy.context.view_layer.update()
            composed = np.array(self.common.world_matrix(child))
            np.testing.assert_allclose(composed, np.array(child.matrix_world), atol=1e-5)
            self.assertAlmostEqual(composed[0, 3], 0.5, places=5)


if __name__ == "__main__":
    unittest.main()
