import shutil
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402
from edge_fixtures import extract, init_run, quiet  # noqa: E402

import pet_build  # noqa: E402
import pet_common as pc  # noqa: E402


def fails_with(case, argv, message):
    with case.assertRaises(SystemExit) as caught:
        quiet(pet_build.main, argv)
    case.assertIn(message, str(caught.exception.code))


def bottoms(sheet, job):
    row = pc.row_index(job)
    return [pc.bbox(pc.visible(pc.cell(sheet, row, col)))[3] for col in range(pc.frame_count(job))]


class BuildGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = synth.tmpdir(self)
        self.run_dir = init_run(self.tmp, 1)

    def test_a_row_needs_a_clean_extraction(self):
        fails_with(self, [str(self.run_dir), "--rows", "idle"], "idle: no frames yet; run pet_frames.py extract --job idle")
        pc.write_json(self.run_dir / "frames" / "idle" / "review.json", {"ok": False, "errors": ["pose 0 touches the image edge"]})
        fails_with(self, [str(self.run_dir), "--rows", "idle"], "idle: its extraction report has errors (pose 0 touches the image edge)")

    def test_unknown_rows_and_reregister_without_a_base(self):
        extract(self.run_dir, "idle")
        fails_with(self, [str(self.run_dir), "--rows", "idle,dancing,look-9"], "not rows of a v1 sheet: dancing, look-9")
        fails_with(self, [str(self.run_dir), "--reregister", "waving"], "--reregister needs --base-sheet")

    def test_base_sheet_size_and_version(self):
        odd = self.tmp / "odd.png"
        synth.save(np.zeros((100, 100, 4), np.uint8), odd)
        fails_with(self, [str(self.run_dir), "--base-sheet", str(odd)], "the base sheet is not 1536x1872 or 1536x2288")
        v2 = self.tmp / "v2.png"
        synth.save(np.zeros((2288, 1536, 4), np.uint8), v2)
        fails_with(self, [str(self.run_dir), "--base-sheet", str(v2), "--version", "1"], "the base sheet is v2; build v2")

    def test_frame_count_must_match_the_row(self):
        extract(self.run_dir, "idle")
        review_path = self.run_dir / "frames" / "idle" / "review.json"
        review = pc.read_json(review_path)
        review["frames"] = review["frames"][:5]
        pc.write_json(review_path, review)
        fails_with(self, [str(self.run_dir), "--rows", "idle"], "idle: 5 frames, the row needs 6")

    def test_pixel_mode_without_pixel_json_names_the_missing_step(self):
        req = pc.read_json(self.run_dir / "request.json")
        req["pixel"] = True
        pc.write_json(self.run_dir / "request.json", req)
        fails_with(self, [str(self.run_dir)], "pixel mode needs pixel.json")


class PartialRunTests(unittest.TestCase):
    """A run with only idle and running-right extracted, built once without a base sheet."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = synth.tmpdir(cls)
        cls.run_dir = init_run(cls.tmp, 1)
        extract(cls.run_dir, "idle")
        extract(cls.run_dir, "running-right")
        quiet(pet_build.main, [str(cls.run_dir)])
        cls.base_path = cls.run_dir / "final" / "spritesheet.png"
        cls.base = pc.load_rgba(cls.base_path)
        cls.report = pc.read_json(cls.run_dir / "qa" / "build.json")

    def base_with(self, name, edit):
        arr = self.base.copy()
        edit(arr)
        path = synth.tmpdir(self) / f"{name}.png"
        synth.save(arr, path)
        return path, arr

    def build(self, *argv):
        out = synth.tmpdir(self) / "sheet"
        quiet(pet_build.main, [str(self.run_dir), *argv, "--out", str(out)])
        return pc.load_rgba(out.with_suffix(".png"))

    def test_rows_never_extracted_are_reported_empty(self):
        warnings = self.report["warnings"]
        for job in pc.STANDARD:
            with self.subTest(job=job):
                self.assertEqual(f"{job}: row is empty" in warnings, job not in ("idle", "running-right"))
        self.assertEqual([r["job"] for r in self.report["rows"]], ["idle", "running-right"])

    def test_mirror_left_is_added_when_only_running_right_exists(self):
        sheet = self.build("--mirror-left")
        row = pc.row_index("running-left")
        for col in range(8):
            mask = pc.visible(pc.cell(sheet, row, col))
            box = pc.bbox(mask)
            self.assertIsNotNone(box, f"running-left frame {col} is empty")
            upper = np.nonzero(mask[box[1] : box[1] + (box[3] - box[1]) // 2])[1]
            self.assertLess(upper.mean(), pc.anchor_x(mask), "the raised arm must swap to the left")

    def test_reregister_puts_a_lifted_row_back_on_the_ground(self):
        waving = pc.row_index("waving")

        def lifted_copy(arr):
            for col in range(4):
                pc.cell(arr, waving, col)[:] = pc.shift(pc.cell(self.base, 0, col), 25, 0)

        path, base = self.base_with("lifted", lifted_copy)
        self.assertTrue(all(b < bottoms(self.base, "idle")[0] - 20 for b in bottoms(base, "waving")))
        sheet = self.build("--rows", " ", "--base-sheet", str(path), "--reregister", "waving")
        idle_ground = float(np.median(bottoms(self.base, "idle")))
        for bottom in bottoms(sheet, "waving"):
            self.assertAlmostEqual(bottom, idle_ground, delta=1)
        rows = slice(waving * pc.CELL_H, (waving + 1) * pc.CELL_H)
        keep = np.ones(sheet.shape[0], bool)
        keep[rows] = False
        self.assertTrue(np.array_equal(sheet[keep], base[keep]))

    def test_reregister_refuses_a_row_with_an_empty_frame(self):
        waving = pc.row_index("waving")

        def partial(arr):
            for col in range(3):
                pc.cell(arr, waving, col)[:] = pc.cell(self.base, 0, col)

        path, _ = self.base_with("partial", partial)
        with self.assertRaises(SystemExit) as caught:
            self.build("--rows", " ", "--base-sheet", str(path), "--reregister", "waving")
        self.assertIn("waving: the base sheet has an empty frame", str(caught.exception.code))

    def test_base_sheet_idle_row_must_be_complete(self):
        def hole(arr):
            pc.cell(arr, 0, 2)[:] = 0

        path, _ = self.base_with("hole", hole)
        with self.assertRaises(SystemExit) as caught:
            self.build("--rows", "running-right", "--base-sheet", str(path))
        self.assertIn("idle row has an empty frame", str(caught.exception.code))

    def test_clean_empties_unused_cells_and_transparent_color(self):
        def dirty(arr):
            pc.cell(arr, pc.row_index("waving"), 6)[50:60, 50:60] = (10, 10, 10, 255)
            pc.cell(arr, pc.row_index("review"), 1)[5:7, 5:7] = (90, 80, 70, 0)

        path, _ = self.base_with("dirty", dirty)
        kept = self.build("--rows", "idle", "--base-sheet", str(path))
        self.assertTrue(pc.cell(kept, pc.row_index("waving"), 6).any())
        cleaned = self.build("--rows", "idle", "--base-sheet", str(path), "--clean")
        self.assertFalse(pc.cell(cleaned, pc.row_index("waving"), 6).any())
        self.assertFalse(cleaned[cleaned[..., 3] == 0].any())

    def test_a_row_too_wide_for_the_cell_is_shrunk_with_a_warning(self):
        run = synth.tmpdir(self) / "wide"
        shutil.copytree(self.run_dir, run)
        folder = run / "frames" / "waving"
        frames = []
        for index in range(4):
            crop = np.zeros((100, 300, 4), np.uint8)
            crop[...] = (40, 110, 200, 255)
            pc.save_png(crop, folder / f"{index:02d}.png")
            x0 = 30 + index * 350
            frames.append({"index": index, "file": f"{index:02d}.png", "box": [x0, 300, x0 + 300, 400], "anchor_x": x0 + 150})
        pc.write_json(folder / "review.json", {"ok": True, "row_ground": 400, "frames": frames, "errors": [], "warnings": []})
        out = synth.tmpdir(self) / "wide-sheet"
        quiet(pet_build.main, [str(run), "--base-sheet", str(self.base_path), "--rows", "waving", "--out", str(out)])
        warnings = pc.read_json(run / "qa" / "build.json")["warnings"]
        self.assertTrue(any(w.startswith("waving: shrunk to") for w in warnings), warnings)
        sheet = pc.load_rgba(out.with_suffix(".png"))
        for col in range(4):
            x0, _, x1, _ = pc.bbox(pc.visible(pc.cell(sheet, pc.row_index("waving"), col)))
            self.assertGreaterEqual(x0, pc.MARGIN - 1)
            self.assertLessEqual(x1, pc.CELL_W - pc.MARGIN + 1)


class DespillEdgeTests(unittest.TestCase):
    def test_a_cell_without_transparent_pixels_is_left_alone(self):
        cell = np.zeros((pc.CELL_H, pc.CELL_W, 4), np.uint8)
        cell[...] = (220, 60, 210, 255)
        self.assertTrue(np.array_equal(pet_build.despill(cell, synth.MAGENTA), cell))


if __name__ == "__main__":
    unittest.main()
