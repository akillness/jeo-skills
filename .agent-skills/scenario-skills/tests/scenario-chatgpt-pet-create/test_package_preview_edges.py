import hashlib
import json
import os
import sys
import unittest
from pathlib import Path
import unittest.mock as mock

import numpy as np
from PIL import Image, ImageSequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402
from edge_fixtures import init_run, quiet, synthetic_sheet  # noqa: E402

import pet_common as pc  # noqa: E402
import pet_package  # noqa: E402
import pet_preview  # noqa: E402


class PackageEdgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = synth.tmpdir(self)
        self.run_dir = init_run(self.tmp, 1)

    def checked_sheet(self, arr, ok=True):
        sheet = self.run_dir / "final" / "spritesheet.png"
        synth.save(arr, sheet)
        digest = hashlib.sha256(sheet.read_bytes()).hexdigest()
        pc.write_json(self.run_dir / "qa" / "check.json", {"ok": ok, "sha256": digest})
        return sheet

    def make(self, *extra):
        code, out = quiet(pet_package.main, ["make", str(self.run_dir), "--sheet", str(self.run_dir / "final" / "spritesheet.png"), *extra])
        return code, json.loads(out)

    def test_a_failed_check_report_blocks_packaging(self):
        self.checked_sheet(synthetic_sheet(1), ok=False)
        with self.assertRaises(SystemExit) as caught:
            self.make()
        self.assertEqual(caught.exception.code, "error: the check report has errors; fix the sheet and re-run pet_check.py")
        self.assertFalse(any((self.run_dir / "package").iterdir()))

    def test_missing_gifs_are_warnings_and_overrides_reach_pet_json(self):
        self.checked_sheet(synthetic_sheet(1))
        code, result = self.make("--id", "pip-two", "--name", "Pip Two", "--description", "A small test pet.")
        self.assertEqual(code, 0)
        self.assertEqual(result["gifs"], [])
        self.assertEqual(
            result["warnings"],
            ["pet.gif not found in previews/; run pet_preview.py gif first", "pet-transparent.gif not found in previews/; run pet_preview.py gif first"],
        )
        manifest = pc.read_json(self.run_dir / "package" / "pip-two" / "pet.json")
        self.assertEqual(manifest, {"id": "pip-two", "displayName": "Pip Two", "description": "A small test pet.", "spritesheetPath": "spritesheet.png"})

    def test_a_v1_cut_that_fails_its_check_is_refused(self):
        sheet = synthetic_sheet(1)
        pc.cell(sheet, 0, 2)[:] = 0
        self.checked_sheet(sheet)
        with self.assertRaises(SystemExit) as caught:
            self.make()
        self.assertEqual(caught.exception.code, "error: the v1 cut failed its check: row 0 (idle) frame 2: empty")

    def test_install_needs_a_package_and_honors_codex_home(self):
        home = self.tmp / "codex-home"
        with self.assertRaises(SystemExit) as caught:
            quiet(pet_package.main, ["install", str(self.run_dir), "--codex-home", str(home)])
        self.assertIn("has no pet.json; run pet_package.py make first", str(caught.exception.code))
        self.checked_sheet(synthetic_sheet(1))
        self.make()
        with mock.patch.dict(os.environ, {"CODEX_HOME": str(home)}):
            code, out = quiet(pet_package.main, ["install", str(self.run_dir)])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out), {"ok": True, "installed": str(home / "pets" / "pip"), "backup": None})
        self.assertTrue((home / "pets" / "pip" / "spritesheet.png").is_file())


class PreviewEdgeTests(unittest.TestCase):
    def test_sheets_of_another_size_are_refused(self):
        tmp = synth.tmpdir(self)
        synth.save(np.zeros((100, 120, 4), np.uint8), tmp / "art.png")
        with self.assertRaises(SystemExit) as caught:
            quiet(pet_preview.main, ["contact", str(tmp / "art.png"), "--out", str(tmp / "c.png")])
        self.assertIn("is 120x100, not a pet sheet", str(caught.exception.code))
        self.assertFalse((tmp / "c.png").exists())

    def test_an_empty_look_cell_gets_no_zoom_tile(self):
        arr = synthetic_sheet(2)
        pc.cell(arr, 9, 2)[:] = 0
        image = pet_preview.looks(arr)
        band = pc.CELL_H + pet_preview.LABEL_H
        top = 3 * band + pet_preview.LABEL_H
        self.assertEqual(image.getpixel((2 * pc.CELL_W + 1, top + 1)), (255, 255, 255))
        self.assertEqual(image.getpixel((1 * pc.CELL_W + 1, top + 1)), (242, 242, 242))

    def test_gif_scale_enlarges_every_frame(self):
        tmp = synth.tmpdir(self)
        frame = np.zeros((12, 10, 4), np.uint8)
        frame[2:10, 2:8] = (40, 110, 200, 255)
        moved = np.roll(frame, 1, axis=1)
        pet_preview.write_gif([(frame, 100), (moved, 250)], tmp / "x.gif", (243, 240, 235), True, scale=3)
        with Image.open(tmp / "x.gif") as gif:
            self.assertEqual(gif.size, (30, 36))
            self.assertEqual([f.info["duration"] for f in ImageSequence.Iterator(gif)], [100, 250])
            rgba = gif.convert("RGBA")
            self.assertEqual(rgba.getpixel((0, 0))[3], 0)
            self.assertEqual(rgba.getpixel((15, 18))[3], 255)

    def test_contact_scale(self):
        tmp = synth.tmpdir(self)
        synth.save(synthetic_sheet(1), tmp / "sheet.png")
        quiet(pet_preview.main, ["contact", str(tmp / "sheet.png"), "--out", str(tmp / "out" / "c.png"), "--scale", "0.25"])
        with Image.open(tmp / "out" / "c.png") as image:
            self.assertEqual(image.size, (8 * 48, 9 * (52 + pet_preview.LABEL_H)))


if __name__ == "__main__":
    unittest.main()
