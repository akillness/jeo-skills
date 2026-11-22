import contextlib
import io
import shutil
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

import pet_build  # noqa: E402
import pet_check  # noqa: E402
import pet_common as pc  # noqa: E402


semantics = synth.semantics


class CheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = synth.tmpdir(cls)
        with contextlib.redirect_stdout(io.StringIO()):
            cls.run_dir = synth.make_run(cls.tmp, version=2)
            pet_build.main([str(cls.run_dir)])
        cls.sheet_path = cls.run_dir / "final" / "spritesheet.webp"
        cls.sheet = pc.load_rgba(cls.sheet_path)
        cls.semantics_path = cls.tmp / "semantics.json"
        pc.write_json(cls.semantics_path, semantics())

    def check(self, arr=None, suffix=".png", **kwargs):
        path = self.sheet_path
        if arr is not None:
            path = synth.tmpdir(self) / f"sheet{suffix}"
            synth.save(arr, path)
        kwargs.setdefault("key", synth.MAGENTA)
        kwargs.setdefault("semantics", self.semantics_path)
        return pet_check.check(path, **kwargs)

    def test_clean_v2_sheet_passes(self):
        report = self.check(require_v2=True)
        self.assertTrue(report["ok"], report["errors"])
        self.assertEqual(report["version"], 2)
        self.assertEqual(len(report["sha256"]), 64)
        self.assertGreater(report["metrics"]["jump"]["lift"], 8)

    def test_v1_cut_passes_but_not_when_v2_is_required(self):
        v1 = self.sheet[:1872]
        self.assertTrue(self.check(v1)["ok"])
        self.assertFalse(self.check(v1, require_v2=True)["ok"])

    def test_pixels_in_an_unused_cell(self):
        arr = self.sheet.copy()
        pc.cell(arr, 3, 6)[100:110, 100:110] = (10, 10, 10, 255)
        report = self.check(arr)
        self.assertIn("must be empty", " ".join(report["errors"]))

    def test_color_under_transparent_pixels(self):
        arr = self.sheet.copy()
        arr[0, 1500] = (5, 5, 5, 0)
        self.assertIn("still carry color", " ".join(self.check(arr)["errors"]))

    def test_leftover_key_color(self):
        arr = self.sheet.copy()
        pc.cell(arr, 0, 0)[0:30, 0:30] = (255, 0, 255, 255)
        self.assertIn("key color remain", " ".join(self.check(arr)["errors"]))

    def test_wrong_size(self):
        report = self.check(np.zeros((2000, 1536, 4), np.uint8))
        self.assertFalse(report["ok"])
        self.assertIsNone(report["version"])

    def test_extension_must_match(self):
        path = synth.tmpdir(self) / "sheet.webp"
        shutil.copy(self.run_dir / "final" / "spritesheet.png", path)
        report = pet_check.check(path, key=synth.MAGENTA, semantics=self.semantics_path)
        self.assertIn("does not match", " ".join(report["errors"]))

    def test_stationary_jump(self):
        arr = self.sheet.copy()
        row = pc.row_index("jumping")
        for col in range(5):
            pc.cell(arr, row, col)[:] = pc.cell(self.sheet, 0, 0)
        self.assertIn("leave the ground", " ".join(self.check(arr)["errors"]))

    def test_row_drawn_smaller_than_idle(self):
        arr = self.sheet.copy()
        row = pc.row_index("review")
        for col in range(6):
            c = pc.cell(arr, row, col)
            small = np.array(synth.Image.fromarray(c.copy()).resize((115, 125)))
            c[:] = 0
            c[208 - 5 - 125 : 208 - 5, 40:155] = small
        self.assertIn("review: the pet is", " ".join(self.check(arr)["errors"]))

    def test_direction_verdicts(self):
        tmp = synth.tmpdir(self)
        partial = semantics()
        partial["directions"] = partial["directions"][1:]
        pc.write_json(tmp / "partial.json", partial)
        self.assertIn("000: no verdict", " ".join(self.check(semantics=tmp / "partial.json")["errors"]))
        pc.write_json(tmp / "cardinal.json", semantics({"090": "warning"}))
        self.assertIn("cardinal must pass", " ".join(self.check(semantics=tmp / "cardinal.json")["errors"]))
        pc.write_json(tmp / "soft.json", semantics({"045": "warning"}))
        report = self.check(semantics=tmp / "soft.json")
        self.assertTrue(report["ok"])
        self.assertIn("045: marked warning", " ".join(report["warnings"]))

    def test_pixel_mode_rejects_soft_edges(self):
        report = self.check(pixel={"grid": 4, "palette": []})
        self.assertIn("partially transparent", " ".join(report["errors"]))

    def test_pixel_mode_reports_its_metrics(self):
        report = self.check(pixel={"grid": 4, "palette": []})
        self.assertEqual(report["metrics"]["pixel"]["grid"], 4)
        self.assertFalse(report["metrics"]["pixel"]["binary_alpha"])
        self.assertGreater(report["metrics"]["pixel"]["frames_off_grid"], 0)

    def test_structure_only_skips_quality(self):
        arr = self.sheet.copy()
        row = pc.row_index("jumping")
        for col in range(5):
            pc.cell(arr, row, col)[:] = pc.cell(self.sheet, 0, 0)
        self.assertTrue(self.check(arr, structure_only=True)["ok"])

    def test_rebuilt_look_rows_need_verdicts(self):
        out = synth.tmpdir(self) / "check.json"
        with contextlib.redirect_stdout(io.StringIO()):
            code = pet_check.main([str(self.sheet_path), "--run", str(self.run_dir), "--json-out", str(out)])
        self.assertEqual(code, 1)
        self.assertIn("no direction verdicts exist", " ".join(pc.read_json(out)["errors"]))

    def test_label_normalization(self):
        self.assertEqual(pet_check.normalize_label("0"), "000")
        self.assertEqual(pet_check.normalize_label("22.5°"), "022.5")
        self.assertEqual(pet_check.normalize_label(337.5), "337.5")


if __name__ == "__main__":
    unittest.main()
