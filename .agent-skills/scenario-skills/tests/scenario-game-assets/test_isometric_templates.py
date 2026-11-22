import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import ImageChops

SCRIPT = Path(__file__).resolve().parents[2] / "skills/scenario-game-assets/scripts/build_isometric_templates.py"
SPEC = importlib.util.spec_from_file_location("templates", SCRIPT)
templates = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(templates)


class TemplateTests(unittest.TestCase):
    def test_neighbors_share_an_entire_edge(self):
        for shape in ("diamond", "hex"):
            points, steps = templates.geometry(shape)
            for dx, dy in steps:
                shared = set(points) & {(x + dx, y + dy) for x, y in points}
                self.assertEqual(len(shared), 2, (shape, dx, dy))

    def test_regions_partition_base_and_preserve_headroom(self):
        for shape in ("diamond", "hex"):
            for thickness in (0, 32):
                images, _, _ = templates.build(shape, thickness)
                ground, side = images["ground-region"], images["side-region"]
                alpha = images["reference"].getchannel("A")
                self.assertIsNone(ImageChops.multiply(ground, side).getbbox())
                self.assertIsNone(ImageChops.difference(
                    ImageChops.lighter(ground, side), alpha).getbbox())
                self.assertIsNone(ImageChops.subtract(
                    alpha, images["object-region"]).getbbox())
                self.assertLess(images["object-region"].getbbox()[1],
                                ground.getbbox()[1] - 400)

    def test_reproducible_bundle(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            first = templates.write_bundle(Path(a))
            self.assertEqual(first, templates.write_bundle(Path(b)))
            self.assertEqual(len(first["templates"]), 4)
            self.assertEqual(len(list(Path(a).glob("*.png"))), 16)
            flat = [entry for entry in first["templates"]
                    if entry["thickness"] == 0]
            self.assertEqual(flat[0]["files"]["side-region"],
                             flat[1]["files"]["side-region"])

    def test_published_manifest_geometry_matches_builder(self):
        reference = json.loads((SCRIPT.parent.parent /
                                "isometric-templates.json").read_text())
        with tempfile.TemporaryDirectory() as directory:
            templates.write_bundle(Path(directory))
            built = json.loads((Path(directory) / "manifest.json").read_text())
        self.assertEqual(reference["canvas"], built["canvas"])
        for expected, actual in zip(reference["templates"], built["templates"], strict=True):
            for key in ("name", "anchor", "ground_polygon", "grid_steps", "thickness", "projection"):
                self.assertEqual(expected[key], actual[key])
            self.assertEqual({k: v["file"] for k, v in expected["files"].items()},
                             {k: v["file"] for k, v in actual["files"].items()})


if __name__ == "__main__":
    unittest.main()
