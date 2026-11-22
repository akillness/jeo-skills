import contextlib
import io
import sys
import unittest
from pathlib import Path
import unittest.mock as mock

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

import pet_build  # noqa: E402
import pet_check  # noqa: E402
import pet_common as pc  # noqa: E402


def resize_in_cell(cell, sx, sy):
    """Rescale a cell's pet about its bottom center, as a separately drawn row would come back."""
    x0, y0, x1, y1 = pc.bbox(pc.visible(cell))
    pet = Image.fromarray(np.ascontiguousarray(cell[y0:y1, x0:x1]))
    width, height = max(1, round((x1 - x0) * sx)), max(1, round((y1 - y0) * sy))
    small = np.array(pet.resize((width, height), Image.Resampling.LANCZOS))
    center = (x0 + x1) // 2
    cell[:] = 0
    cell[y1 - height : y1, center - width // 2 : center - width // 2 + width] = small


def cut_rows(cell, ys):
    """Make most of each given row transparent, leaving a few solid pixels at both ends."""
    mask = pc.visible(cell)
    for y in ys:
        xs = np.flatnonzero(mask[y])
        cell[y, xs[0] + 4 : xs[-1] - 3] = 0


class QualityEdgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = synth.tmpdir(cls)
        with contextlib.redirect_stdout(io.StringIO()):
            run = synth.make_run(cls.tmp, version=2)
            pet_build.main([str(run)])
        cls.sheet_path = run / "final" / "spritesheet.png"
        cls.sheet = pc.load_rgba(cls.sheet_path)

    def quality(self, arr, version=2):
        errors, warnings, metrics = [], [], {}
        pet_check.check_quality(arr, version, errors, warnings, metrics)
        return errors, warnings, metrics

    def look_cell(self, arr, index):
        return pc.cell(arr, 9 + index // 8, index % 8)

    def test_the_built_sheet_has_no_quality_findings(self):
        errors, warnings, metrics = self.quality(self.sheet.copy())
        self.assertEqual((errors, warnings), ([], []))
        self.assertIn("look", metrics)

    def test_an_empty_frame_skips_the_quality_pass(self):
        arr = self.sheet.copy()
        pc.cell(arr, pc.row_index("waving"), 1)[:] = 0
        self.assertEqual(self.quality(arr), ([], [], {}))

    def test_a_slightly_smaller_row_is_a_warning(self):
        arr = self.sheet.copy()
        row = pc.row_index("review")
        for col in range(6):
            resize_in_cell(pc.cell(arr, row, col), 0.9, 0.9)
        errors, warnings, metrics = self.quality(arr)
        self.assertEqual(errors, [])
        self.assertTrue(any(w.startswith("review: the pet is 9") for w in warnings), warnings)
        self.assertAlmostEqual(metrics["height_vs_idle"]["review"], 0.9, delta=0.02)

    def test_a_jump_that_lands_off_the_ground(self):
        arr = self.sheet.copy()
        last = pc.cell(arr, pc.row_index("jumping"), 4)
        last[:] = pc.shift(last.copy(), 20, 0)
        errors, _, metrics = self.quality(arr)
        self.assertIn("jumping: the last frame lands 20 px off the idle ground line", errors)
        self.assertEqual(metrics["jump"]["landing_offset"], 20)

    def test_look_rows_drifting_sideways(self):
        arr = self.sheet.copy()
        for i in range(16):
            c = self.look_cell(arr, i)
            c[:] = pc.shift(c.copy(), 0, -28)
        errors, _, metrics = self.quality(arr)
        self.assertTrue(any(e.startswith("look rows: the planted lower body drifts") for e in errors), errors)
        self.assertGreater(metrics["look"]["anchor_drift"], 26)

    def test_look_widths_varying(self):
        arr = self.sheet.copy()
        resize_in_cell(self.look_cell(arr, 3), 0.6, 1.0)
        errors, _, metrics = self.quality(arr)
        self.assertTrue(any(e.startswith("look rows: widths vary") for e in errors), errors)
        self.assertGreater(metrics["look"]["width_ratio"], 1.5)

    def test_look_loop_jumps_and_small_moves(self):
        arr = self.sheet.copy()
        c = self.look_cell(arr, 5)
        c[:] = pc.shift(c.copy(), 30, 0)
        errors, _, _ = self.quality(arr)
        self.assertTrue(any(e.startswith("look 090 -> 112.5: jumps 30 px") for e in errors), errors)
        arr = self.sheet.copy()
        c = self.look_cell(arr, 5)
        c[:] = pc.shift(c.copy(), 12, 0)
        errors, warnings, _ = self.quality(arr)
        self.assertEqual(errors, [])
        self.assertTrue(any(w.startswith("look 112.5 -> 135: moves 12 px") for w in warnings), warnings)

    def test_transparent_gaps_through_a_look_pose(self):
        arr = self.sheet.copy()
        for index, rows in ((0, 2), (1, 1)):
            c = self.look_cell(arr, index)
            _, y0, _, y1 = pc.bbox(pc.visible(c))
            middle = (y0 + y1) // 2
            cut_rows(c, range(middle, middle + rows))
        errors, warnings, _ = self.quality(arr)
        self.assertTrue(any(e.startswith("look 000: a transparent gap cuts through the body") for e in errors), errors)
        self.assertTrue(any(w.startswith("look 022.5: thin transparent rows at") for w in warnings), warnings)

    def test_hole_rows_ignores_narrow_spans(self):
        mask = np.ones((5, 40), bool)
        mask[2, 2:38] = False
        self.assertEqual(pet_check.hole_rows(mask), [])
        wide = np.ones((5, 100), bool)
        wide[2, 5:95] = False
        self.assertEqual(pet_check.hole_rows(wide), [2])

    def test_hole_rows_needs_a_gap_over_a_quarter_of_the_span(self):
        for gap, found in ((45, []), (55, [2])):
            mask = np.ones((5, 200), bool)
            mask[2, 20 : 20 + gap] = False
            with self.subTest(gap=gap):
                self.assertEqual(pet_check.hole_rows(mask), found)

    def test_pixel_mode_reports_colors_outside_the_palette(self):
        errors, metrics = [], {}
        pet_check.check_pixel(self.sheet, 2, {"grid": 4, "palette": ["#000000"]}, errors, metrics)
        self.assertTrue(any(e.endswith("colors outside the palette") for e in errors), errors)
        self.assertEqual(metrics["pixel"]["outside_palette"], metrics["pixel"]["colors"])

    def test_without_key_or_verdicts_the_report_says_what_was_skipped(self):
        report = pet_check.check(self.sheet_path)
        self.assertTrue(report["ok"], report["errors"])
        self.assertIn("no key color given, so leftover background was not checked", report["warnings"])
        self.assertIn("no direction verdicts given; the look rows were not reviewed", report["warnings"])


class SemanticsEdgeTests(unittest.TestCase):
    def run_semantics(self, data):
        path = synth.tmpdir(self) / "semantics.json"
        pc.write_json(path, data)
        errors, warnings = [], []
        pet_check.check_semantics(path, errors, warnings)
        return errors, warnings

    def test_a_bare_list_is_accepted(self):
        self.assertEqual(self.run_semantics(synth.semantics()["directions"]), ([], []))

    def test_not_a_list(self):
        errors, _ = self.run_semantics({"verdicts": {}})
        self.assertEqual(errors, ["semantics.json: expected a 'directions' list"])

    def test_each_record_is_validated(self):
        data = synth.semantics({"045": "fail"})
        records = {r["label"]: r for r in data["directions"]}
        records["090"]["expected"] = "screen-left"
        records["180"]["observed"] = " "
        records["000"]["label"] = "north"
        records["270"]["label"] = "270°"
        errors, _ = self.run_semantics(data)
        self.assertIn("direction 045: verdict 'fail'; regenerate the whole look row", errors)
        self.assertIn("direction 090: expected must be 'right', found 'left'", errors)
        self.assertIn("direction 180: 'observed' and 'evidence' must describe what is visible", errors)
        self.assertIn("direction 000: no verdict recorded", errors)
        self.assertFalse(any(e.startswith("direction 270") for e in errors))

    def test_label_normalization_keeps_words(self):
        self.assertEqual(pet_check.normalize_label(" north "), "north")
        self.assertEqual(pet_check.normalize_label("90"), "090")


class StructureEdgeTests(unittest.TestCase):
    def save(self, arr, name="sheet.png", **options):
        path = synth.tmpdir(self) / name
        Image.fromarray(np.ascontiguousarray(arr)).save(path, **options)
        return path

    def test_file_size_limit(self):
        path = self.save(np.zeros((10, 10, 4), np.uint8))
        with mock.patch.object(pc, "MAX_BYTES", 10):
            report = pet_check.check(path, structure_only=True)
        self.assertTrue(any(e.endswith("the limit is 20 MiB") for e in report["errors"]), report["errors"])

    def test_other_formats_and_missing_alpha(self):
        report = pet_check.check(self.save(np.zeros((10, 10, 3), np.uint8), "sheet.bmp"), structure_only=True)
        self.assertIn("format is BMP; deliver PNG or WebP", report["errors"])
        self.assertIn("no alpha channel (mode RGB); the sheet must be transparent", report["errors"])
        self.assertIsNone(report["version"])

    def test_empty_and_filled_cells(self):
        arr = np.zeros((1872, 1536, 4), np.uint8)
        for row, (_, frames, _) in enumerate(pc.rows_for(1)):
            for col in range(frames):
                pet = synth.sprite(150)
                pc.cell(arr, row, col)[40:190, 40 : 40 + pet.shape[1]] = pet
        pc.cell(arr, 0, 0)[:] = (40, 110, 200, 255)
        pc.cell(arr, 0, 1)[:] = 0
        errors = pet_check.check(self.save(arr), key=synth.MAGENTA, structure_only=True)["errors"]
        self.assertEqual(errors, ["row 0 (idle) frame 0: the cell is filled, so the background was not removed", "row 0 (idle) frame 1: empty"])


if __name__ == "__main__":
    unittest.main()
