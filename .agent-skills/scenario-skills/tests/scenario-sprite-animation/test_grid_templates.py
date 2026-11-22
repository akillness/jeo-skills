import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "skills/scenario-sprite-animation/scripts/build_grid_templates.py"
SPEC = importlib.util.spec_from_file_location("grid_templates", SCRIPT)
grids = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(grids)


class GridTemplateTests(unittest.TestCase):
    def test_cells_cover_canvas_once_and_anchors_stay_inside(self):
        for t in json.loads(grids.MANIFEST.read_text())["templates"]:
            w, h = t["cell_size"]
            self.assertEqual(t["canvas"], [w * t["columns"], h * t["rows"]])
            self.assertEqual(len(t["cells"]), t["frame_count"])
            boxes = set()
            for i, cell in enumerate(t["cells"]):
                x, y, cw, ch = cell["box"]
                self.assertEqual(cell["index"], i)
                self.assertEqual([x, y, cw, ch], [i % t["columns"] * w, i // t["columns"] * h, w, h])
                self.assertEqual(cell["anchor"], [x + 128, y + 208])
                self.assertTrue(x < cell["anchor"][0] < x + w)
                self.assertTrue(y < cell["anchor"][1] < y + h)
                boxes.add(tuple(cell["box"]))
            self.assertEqual(len(boxes) * w * h, t["canvas"][0] * t["canvas"][1])

    def test_guides_repeat_without_painting_plain_cell_interiors(self):
        for t in json.loads(grids.MANIFEST.read_text())["templates"]:
            plain = grids.render(t, "grid")
            guide = grids.render(t, "alignment-guide")
            for cell in t["cells"]:
                x, y, _, _ = cell["box"]
                self.assertEqual(plain.getpixel((x + 64, y + 208)), (255, 255, 255))
                self.assertEqual(guide.getpixel((x + 64, y + 208)), (37, 99, 235))
                self.assertEqual(guide.getpixel((x + 16, y + 208)), (255, 255, 255))
                self.assertEqual(plain.getpixel((x, y + 64)), (107, 114, 128))

    def test_selected_bundle_is_reproducible_and_rejects_unknown_name(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            one = grids.build(Path(a), "sprite-grid-4x4-v1")
            self.assertEqual(one, grids.build(Path(b), "sprite-grid-4x4-v1"))
            self.assertEqual(len(list(Path(a).glob("*.png"))), 2)
            self.assertEqual(len(one["templates"]), 1)
            with self.assertRaises(ValueError):
                grids.build(Path(a), "missing")


if __name__ == "__main__":
    unittest.main()
