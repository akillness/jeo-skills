import contextlib
import io
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

import pet_build  # noqa: E402
import pet_common as pc  # noqa: E402
import pet_frames  # noqa: E402


def quiet(fn, argv):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(argv)


def boxes(sheet, job):
    row = pc.row_index(job)
    return [pc.bbox(pc.visible(pc.cell(sheet, row, col))) for col in range(pc.frame_count(job))]


def ref_height(sheet, job):
    return pc.reference_height(job, [b[3] - b[1] for b in boxes(sheet, job)])


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = synth.tmpdir(cls)
        # Each row drawn at a different size, as separate generations come back.
        heights = {"idle": 160, "running-right": 200, "waving": 130, "jumping": 150, "failed": 180, "review": 220}
        with contextlib.redirect_stdout(io.StringIO()):
            cls.run_dir = synth.make_run(cls.tmp, version=1, heights=heights)
        quiet(pet_build.main, [str(cls.run_dir)])
        cls.sheet = pc.load_rgba(cls.run_dir / "final" / "spritesheet.png")

    def test_outputs(self):
        self.assertEqual(self.sheet.shape[:2], (1872, 1536))
        webp = pc.load_rgba(self.run_dir / "final" / "spritesheet.webp")
        self.assertTrue(np.array_equal(webp, self.sheet), "lossless WebP must hold the same pixels")
        self.assertTrue(pc.read_json(self.run_dir / "qa" / "build.json")["ok"])

    def test_same_pet_height_on_every_row(self):
        idle = ref_height(self.sheet, "idle")
        for job in pc.STANDARD:
            with self.subTest(job=job):
                self.assertAlmostEqual(ref_height(self.sheet, job), idle, delta=2)

    def test_shared_ground_line(self):
        idle_bottom = boxes(self.sheet, "idle")[0][3]
        for job in ("waving", "review", "running-right"):
            for box in boxes(self.sheet, job):
                self.assertAlmostEqual(box[3], idle_bottom, delta=1)

    def test_jump_keeps_its_lift(self):
        bottoms = [box[3] for box in boxes(self.sheet, "jumping")]
        self.assertGreaterEqual(max(bottoms) - min(bottoms), 30)
        self.assertAlmostEqual(bottoms[-1], boxes(self.sheet, "idle")[0][3], delta=1)

    def test_unused_cells_are_empty_and_clean(self):
        for row, (_, frames, _) in enumerate(pc.rows_for(1)):
            for col in range(frames, pc.COLUMNS):
                self.assertFalse(pc.cell(self.sheet, row, col).any())
        clear = self.sheet[..., 3] == 0
        self.assertFalse(self.sheet[clear].any())

    def test_mirror_keeps_frame_order_and_flips_the_arm(self):
        tmp = synth.tmpdir(self)
        out = tmp / "mirrored"
        quiet(pet_build.main, [str(self.run_dir), "--mirror-left", "--out", str(out)])
        sheet = pc.load_rgba(out.with_suffix(".png"))
        left_row, right_row = pc.row_index("running-left"), pc.row_index("running-right")
        for col in range(8):
            for row in (left_row, right_row):
                c = pc.cell(sheet, row, col)
                tag = (np.abs(c[..., :3].astype(int) - synth.tag_color(col)).sum(-1) < 30) & pc.visible(c)
                self.assertTrue(tag.any(), f"frame {col} of row {row} lost its tag")
            # the raised arm sits on the right of running-right and on the left of running-left
            for row, side in ((right_row, 1), (left_row, -1)):
                mask = pc.visible(pc.cell(sheet, row, col))
                box = pc.bbox(mask)
                upper = np.nonzero(mask[box[1] : box[1] + (box[3] - box[1]) // 2])[1]
                self.assertEqual(np.sign(upper.mean() - pc.anchor_x(mask)), side)

    def test_base_sheet_keeps_other_rows_byte_identical(self):
        tmp = synth.tmpdir(self)
        sprites = [synth.sprite(260, color=(30, 160, 60), arm=0 < i < 3, tag=synth.tag_color(i)) for i in range(4)]
        synth.save(synth.strip(sprites), self.run_dir / "generated" / "waving.png")
        quiet(pet_frames.main, ["extract", str(self.run_dir), "--job", "waving"])
        base = self.run_dir / "final" / "spritesheet.png"
        out = tmp / "redo"
        quiet(pet_build.main, [str(self.run_dir), "--base-sheet", str(base), "--rows", "waving", "--out", str(out)])
        redone = pc.load_rgba(out.with_suffix(".png"))
        row = pc.row_index("waving")
        rows = slice(row * pc.CELL_H, (row + 1) * pc.CELL_H)
        mask = np.ones(redone.shape[0], bool)
        mask[rows] = False
        self.assertTrue(np.array_equal(redone[mask], self.sheet[mask]))
        self.assertFalse(np.array_equal(redone[rows], self.sheet[rows]))
        self.assertAlmostEqual(ref_height(redone, "waving"), ref_height(self.sheet, "idle"), delta=2)

    def test_pixel_mode_lands_on_one_grid_and_palette(self):
        tmp = synth.tmpdir(self)
        with contextlib.redirect_stdout(io.StringIO()):
            run = synth.make_run(tmp, version=1)
        palette = ["#2870C8", "#141414", "#C82814", "#C83C1E", "#C8501E", "#C8641E", "#C8781E", "#C88C1E", "#C8A01E", "#C8B41E"]
        pc.write_json(run / "pixel.json", {"grid": 4, "palette": palette})
        req = pc.read_json(run / "request.json")
        req["pixel"] = True
        pc.write_json(run / "request.json", req)
        quiet(pet_build.main, [str(run)])
        sheet = pc.load_rgba(run / "final" / "spritesheet.png")
        self.assertTrue(np.isin(sheet[..., 3], (0, 255)).all())
        for row, (_, frames, _) in enumerate(pc.rows_for(1)):
            for col in range(frames):
                blocks = pc.cell(sheet, row, col).reshape(52, 4, 48, 4, 4)
                self.assertTrue((blocks == blocks[:, :1, :, :1]).all())
        colors = {pc.key_hex(c) for c in sheet[sheet[..., 3] == 255][:, :3]}
        self.assertLessEqual(colors, set(palette))

    def test_despill_removes_key_fringe(self):
        cell = np.zeros((pc.CELL_H, pc.CELL_W, 4), np.uint8)
        cell[50:150, 50:150] = (40, 110, 200, 255)
        cell[50:150, 50:53] = (220, 60, 210, 255)  # key-tinted edge
        clean = pet_build.despill(cell, synth.MAGENTA)
        edge = clean[50:150, 50:53, :3].astype(int)
        self.assertLess(np.abs(edge - (40, 110, 200)).max(), 3)
        self.assertTrue(np.array_equal(clean[60:140, 70:140], cell[60:140, 70:140]))

    def test_needs_idle_without_a_base_sheet(self):
        with self.assertRaises(SystemExit):
            quiet(pet_build.main, [str(self.run_dir), "--rows", "waving"])


if __name__ == "__main__":
    unittest.main()
