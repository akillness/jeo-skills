import contextlib
import io
import json
import runpy
import sys
import tempfile
import unittest
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image

import helpers

apply_materials = helpers.load("apply_materials")

ROLES = apply_materials.ROLES


class StubPixels:
    """The two members of bpy's Image.pixels that image_luminance_mean touches."""

    def __init__(self, rgba):
        self.values = np.asarray(rgba, dtype=np.float32).reshape(-1)

    def __len__(self):
        return self.values.size

    def foreach_get(self, buffer):
        buffer[:] = self.values


def stub_image(rgba, is_float=False, depth=32):
    return SimpleNamespace(pixels=StubPixels(rgba), is_float=is_float, depth=depth)


def write_maps(root, family, roles=ROLES):
    folder = Path(root) / "textures" / family
    folder.mkdir(parents=True, exist_ok=True)
    maps = {}
    for role in roles:
        path = folder / f"{role}.png"
        Image.new("RGB", (4, 4), (128, 128, 128)).save(path)
        maps[role] = str(path.relative_to(root))
    return maps


def family(maps, **overrides):
    definition = {"tile_span": 0.7, "maps": maps}
    definition.update(overrides)
    return definition


class ProjectionTests(unittest.TestCase):
    unit = (1, 1, 1)

    def test_dominant_axis_and_sign(self):
        co = (1, 2, 3)
        self.assertEqual(apply_materials.projected_uv(co, (0, 0, 1), self.unit), (1, 2))
        self.assertEqual(apply_materials.projected_uv(co, (0, 0, -1), self.unit), (-1, 2))
        self.assertEqual(apply_materials.projected_uv(co, (1, 0, 0), self.unit), (2, 3))
        self.assertEqual(apply_materials.projected_uv(co, (-1, 0, 0), self.unit), (-2, 3))
        self.assertEqual(apply_materials.projected_uv(co, (0, 1, 0), self.unit), (-1, 3))
        self.assertEqual(apply_materials.projected_uv(co, (0, -1, 0), self.unit), (1, 3))

    def test_tilted_faces_pick_the_largest_component(self):
        project = apply_materials.projected_uv
        self.assertEqual(project((1, 2, 3), (0.1, 0.9, 0.2), self.unit), (-1, 3))
        self.assertEqual(project((1, 2, 3), (0.7, 0.1, -0.6), self.unit), (2, 3))

    def test_object_scale_keeps_texel_density_in_scene_units(self):
        # A facade stretched 3x along X spans 3 UV units, so a 1 m tile still measures 1 m.
        self.assertEqual(apply_materials.projected_uv((1, 2, 3), (0, 0, 1), (3, 1, 1)), (3, 2))
        self.assertEqual(apply_materials.projected_uv((1, 2, 3), (1, 0, 0), (1, 2, 0.5)), (4, 1.5))


class LuminanceTests(unittest.TestCase):
    def test_srgb_to_linear(self):
        linear = apply_materials.srgb_to_linear([0, 0.04045, 0.5, 1])
        self.assertAlmostEqual(float(linear[0]), 0)
        self.assertAlmostEqual(float(linear[1]), 0.04045 / 12.92, places=6)
        self.assertAlmostEqual(float(linear[2]), 0.214041, places=5)
        self.assertAlmostEqual(float(linear[3]), 1, places=6)

    def test_luminance_mean_is_floored(self):
        white = np.ones((8, 3))
        self.assertAlmostEqual(apply_materials.linear_luminance_mean(white), 1, places=5)
        black = np.zeros((8, 3))
        self.assertEqual(apply_materials.linear_luminance_mean(black), 0.02)
        gray = np.full((8, 3), 0.5)
        self.assertAlmostEqual(apply_materials.linear_luminance_mean(gray), 0.214041, places=5)

    def test_empty_buffer_is_an_error_not_the_floor(self):
        with self.assertRaises(ValueError):
            apply_materials.luminance_mean(np.zeros((0, 3)))
        with self.assertRaises(ValueError):
            apply_materials.image_luminance_mean(stub_image([]))

    def test_image_mean_decodes_byte_buffers_only(self):
        rgba = np.tile([0.5, 0.5, 0.5, 1.0], (16, 1))
        mean = apply_materials.image_luminance_mean
        self.assertAlmostEqual(mean(stub_image(rgba)), 0.214041, places=5)
        # Float buffers (16-bit PNG, EXR) are scene-linear on load; a 16-bit RGBA reports depth 64.
        self.assertAlmostEqual(mean(stub_image(rgba, is_float=True)), 0.5, places=5)
        self.assertAlmostEqual(mean(stub_image(rgba, depth=64)), 0.5, places=5)
        self.assertTrue(apply_materials.is_linear_buffer(stub_image(rgba, is_float=True, depth=32)))
        self.assertFalse(apply_materials.is_linear_buffer(stub_image(rgba, depth=24)))


class ApplierCacheTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)

    def tearDown(self):
        self.folder.cleanup()

    def test_luminance_is_read_once_per_file(self):
        maps = write_maps(self.root, "plaster")
        manifest = {"families": {"plaster": family(maps), "canvas": family(dict(maps))}}
        applier = apply_materials.Applier(manifest, self.root)
        path = applier.map_path("plaster", "basecolor")
        self.assertEqual(path, applier.map_path("canvas", "basecolor"))
        self.assertTrue(path.is_absolute())
        image = stub_image(np.tile([0.5, 0.5, 0.5, 1.0], (4, 1)))
        applier.images[path] = image
        self.assertAlmostEqual(applier.luminance_mean("plaster"), 0.214041, places=5)
        image.pixels = StubPixels(np.ones((4, 4)))
        self.assertAlmostEqual(applier.luminance_mean("canvas"), 0.214041, places=5)
        self.assertEqual(list(applier.luminance), [path])


class SettingsTests(unittest.TestCase):
    def test_family_defaults(self):
        settings = apply_materials.family_settings({"tile_span": 2, "roughness": [0.1, 0.2]})
        self.assertEqual(settings["tile_span"], 2)
        self.assertEqual(settings["roughness"], [0.1, 0.2])
        self.assertEqual(settings["metalness"], [0, 0])
        self.assertEqual(settings["normal_strength"], 0.25)
        self.assertEqual(settings["bump_distance"], 0.002)
        self.assertEqual(settings["basecolor_mode"], "tint")
        self.assertFalse(settings["roughness_is_smoothness"])

    def test_override_family_matches_prefixes_in_order(self):
        overrides = [
            {"prefixes": ["Awning"], "family": "canvas"},
            {"prefixes": ["Aw", "Sign"], "family": "enamel"},
        ]
        self.assertEqual(apply_materials.override_family("Awning.001", overrides), "canvas")
        self.assertEqual(apply_materials.override_family("Sign_3", overrides), "enamel")
        self.assertIsNone(apply_materials.override_family("Wall", overrides))
        self.assertIsNone(apply_materials.override_family("Wall", []))

    def test_variant_name_marks_override_variants(self):
        applier = apply_materials.Applier({"materials": {"Color": "paint"}}, Path("."))
        self.assertEqual(applier.variant_name("Color", "paint"), "PATINA | Color")
        self.assertEqual(applier.variant_name("Color", "canvas"), "PATINA | Color | canvas")
        self.assertEqual(applier.variant_name("Other", "canvas"), "PATINA | Other | canvas")


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.scene = {"Wall": ["WallA", "WallB"], "Trim": ["Awning", "Post"], "Glass": ["Window"]}

    def tearDown(self):
        self.folder.cleanup()

    def good_manifest(self):
        return {
            "output": "PATINA.blend",
            "materials": {"Wall": "plaster", "Glass": "glass"},
            "object_overrides": [{"prefixes": ["Awning", "Post"], "family": "canvas"}],
            "families": {
                "plaster": family(write_maps(self.root, "plaster")),
                "glass": family(write_maps(self.root, "glass"), roughness=[0.05, 0.2]),
                "canvas": family(write_maps(self.root, "canvas"), basecolor_mode="replace"),
            },
            "provenance": {"note": "test"},
        }

    def test_good_manifest_has_no_problems(self):
        problems = apply_materials.validate_manifest(self.good_manifest(), self.root, self.scene)
        self.assertEqual(problems, [])

    def test_every_problem_class_is_reported_together(self):
        manifest = self.good_manifest()
        del manifest["materials"]["Glass"]  # Glass is now neither mapped nor overridden
        manifest["object_overrides"][0]["prefixes"] = ["Awning"]  # Post is no longer covered
        manifest["materials"]["Wall"] = "stucco"  # referenced but undefined
        del manifest["families"]["plaster"]["maps"]["height"]  # missing role
        (self.root / manifest["families"]["glass"]["maps"]["normal"]).unlink()  # missing on disk
        manifest["families"]["glass"]["roughness"] = [0.2, 1.5]
        manifest["families"]["canvas"]["metalness"] = [0.5]
        manifest["families"]["canvas"]["basecolor_mode"] = "multiply"
        manifest["families"]["canvas"]["tile_span"] = 0
        manifest["families"]["canvas"]["roughness_is_smoothness"] = "yes"
        problems = apply_materials.validate_manifest(manifest, self.root, self.scene)
        text = "\n".join(problems)
        self.assertIn("material 'Glass' is neither mapped", text)
        self.assertIn("material 'Trim' is neither mapped", text)
        self.assertIn("family 'stucco' is referenced but not defined", text)
        self.assertIn("family 'plaster': missing map roles height", text)
        self.assertIn("family 'glass': normal map", text)
        self.assertIn("family 'glass': roughness must be two numbers between 0 and 1", text)
        self.assertIn("family 'canvas': metalness must be two numbers between 0 and 1", text)
        self.assertIn("family 'canvas': basecolor_mode must be one of tint, replace", text)
        self.assertIn("family 'canvas': tile_span must be a positive number", text)
        self.assertIn("family 'canvas': roughness_is_smoothness must be true or false", text)
        self.assertEqual(len(problems), 10)

    def test_missing_output_and_bad_shapes(self):
        manifest = {"materials": [], "families": [], "object_overrides": {}, "provenance": "x"}
        problems = apply_materials.validate_manifest(manifest, self.root, {})
        text = "\n".join(problems)
        for fragment in ("output: required", "materials: must map", "families: must map"):
            self.assertIn(fragment, text)
        self.assertIn("object_overrides: must be a list", text)
        self.assertIn("provenance: must be an object", text)

    def test_override_without_prefixes_is_reported(self):
        manifest = self.good_manifest()
        manifest["object_overrides"].append({"family": "canvas"})
        problems = apply_materials.validate_manifest(manifest, self.root, self.scene)
        self.assertEqual(
            problems,
            ["object_overrides[1]: needs a prefixes list of non-empty strings and a family"],
        )

    def test_malformed_prefixes_never_match(self):
        for prefixes in ("Awning", ["Awning", ""], None, [1], []):
            with self.subTest(prefixes=prefixes):
                manifest = self.good_manifest()
                manifest["object_overrides"][0]["prefixes"] = prefixes
                problems = apply_materials.validate_manifest(manifest, self.root, self.scene)
                text = "\n".join(problems)
                self.assertIn("object_overrides[0]: needs a prefixes list", text)
                self.assertIn("material 'Trim' is neither mapped", text)
                self.assertEqual(len(problems), 2)

    def test_non_string_values_are_reported_not_raised(self):
        manifest = self.good_manifest()
        manifest["materials"]["Wall"] = {"family": "plaster"}
        manifest["materials"]["Glass"] = ["glass"]
        manifest["object_overrides"].append({"prefixes": ["Post"], "family": {"name": "canvas"}})
        manifest["families"]["plaster"]["maps"]["height"] = None
        manifest["families"]["glass"]["maps"]["normal"] = 5
        manifest["families"]["canvas"]["normal_strength"] = "strong"
        manifest["families"]["canvas"]["bump_distance"] = -1
        manifest["families"]["canvas"]["tile_span"] = "1"
        problems = apply_materials.validate_manifest(manifest, self.root, self.scene)
        text = "\n".join(problems)
        self.assertIn("materials['Wall']: must be a family name", text)
        self.assertIn("materials['Glass']: must be a family name", text)
        self.assertIn("object_overrides[1]: needs a prefixes list", text)
        self.assertIn("family 'plaster': height map must be a path", text)
        self.assertIn("family 'glass': normal map must be a path", text)
        self.assertIn("family 'canvas': normal_strength must be a number", text)
        self.assertIn("family 'canvas': bump_distance must be a number", text)
        self.assertIn("family 'canvas': tile_span must be a positive number", text)
        self.assertEqual(len(problems), 8)

    def test_unreadable_map_is_reported(self):
        manifest = self.good_manifest()
        relative = manifest["families"]["plaster"]["maps"]["basecolor"]
        (self.root / relative).write_text("<?xml version='1.0'?><Error>expired</Error>")
        problems = apply_materials.validate_manifest(manifest, self.root, self.scene)
        self.assertEqual(len(problems), 1)
        self.assertIn(f"family 'plaster': basecolor map {relative} is not a readable", problems[0])
        self.assertIsNone(apply_materials.unreadable_image(self.root / "maps.exr"))

    def test_one_file_cannot_be_both_color_and_data(self):
        manifest = self.good_manifest()
        plaster = manifest["families"]["plaster"]["maps"]
        manifest["families"]["glass"]["maps"]["normal"] = plaster["normal"]
        self.assertEqual(apply_materials.validate_manifest(manifest, self.root, self.scene), [])
        manifest["families"]["glass"]["maps"]["height"] = plaster["basecolor"]
        problems = apply_materials.validate_manifest(manifest, self.root, self.scene)
        self.assertEqual(len(problems), 1)
        self.assertIn("used both as a basecolor and as a data map", problems[0])
        self.assertIn(str((self.root / plaster["basecolor"]).resolve()), problems[0])

    def test_load_manifest_resolves_root(self):
        path = self.root / "materials.json"
        path.write_text(json.dumps({"output": "x.blend"}))
        manifest, root = apply_materials.load_manifest(path)
        self.assertEqual(manifest, {"output": "x.blend"})
        self.assertEqual(root, self.root.resolve())

    def test_load_manifest_rejects_a_non_object(self):
        path = self.root / "materials.json"
        path.write_text("[]")
        with self.assertRaises(SystemExit) as caught:
            apply_materials.load_manifest(path)
        self.assertIn("must be a JSON object", str(caught.exception))


class EntryPointTests(unittest.TestCase):
    def test_failure_prints_the_traceback_then_exits_with_one_line(self):
        script = helpers.SCRIPTS / "apply_materials.py"
        argv = ["blender", "--python", str(script), "--", "/nowhere/materials.json"]
        with mock.patch.object(sys, "argv", argv):
            with contextlib.redirect_stderr(io.StringIO()) as err:
                with self.assertRaises(SystemExit) as caught:
                    runpy.run_path(str(script), run_name="__main__")
        self.assertTrue(str(caught.exception.code).startswith("apply_materials failed: "))
        self.assertIn("/nowhere/materials.json", str(caught.exception.code))
        self.assertIn("Traceback (most recent call last)", err.getvalue())
        self.assertIn("FileNotFoundError", err.getvalue())


if __name__ == "__main__":
    unittest.main()
