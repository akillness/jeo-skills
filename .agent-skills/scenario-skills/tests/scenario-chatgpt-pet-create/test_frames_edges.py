import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402
from edge_fixtures import init_run, quiet, synthetic_sheet  # noqa: E402

import pet_common as pc  # noqa: E402
import pet_frames  # noqa: E402


class ExtractEdgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = synth.tmpdir(self)
        self.run_dir = init_run(self.tmp, 1)

    def extract(self, job, arr):
        synth.save(arr, self.run_dir / "generated" / f"{job}.png")
        code, _ = quiet(pet_frames.main, ["extract", str(self.run_dir), "--job", job])
        return code, pc.read_json(self.run_dir / "frames" / job / "review.json")

    def test_unknown_job_and_missing_download(self):
        with self.assertRaises(SystemExit) as caught:
            quiet(pet_frames.main, ["extract", str(self.run_dir), "--job", "dancing"])
        self.assertEqual(caught.exception.code, "error: no job 'dancing' in jobs.json")
        with self.assertRaises(SystemExit) as caught:
            quiet(pet_frames.main, ["extract", str(self.run_dir), "--job", "waving"])
        self.assertIn("waving.png not found: download the generated image there first", str(caught.exception.code))

    def test_a_strip_with_only_background(self):
        blank = synth.strip([np.zeros((50, 50, 4), np.uint8)])
        (self.run_dir / "frames" / "waving").mkdir(parents=True)
        (self.run_dir / "frames" / "waving" / "preview.png").write_bytes(b"old")
        code, review = self.extract("waving", blank)
        self.assertEqual(code, 1)
        self.assertEqual(review["errors"], ["no sprite pixels left after removing the background"])
        self.assertFalse((self.run_dir / "frames" / "waving" / "preview.png").exists())

    def test_a_smaller_extra_shape_joins_the_nearest_pose(self):
        pets = [synth.sprite(120) for _ in range(4)]
        area = int(pc.visible(pets[0]).sum())
        side = int((0.3 * area) ** 0.5)
        blob = np.zeros((side, side, 4), np.uint8)
        blob[...] = (30, 30, 30, 255)
        code, review = self.extract("waving", synth.strip([*pets, blob], gap=40))
        self.assertEqual(code, 0)
        areas = [frame["area"] for frame in review["frames"]]
        self.assertEqual(areas[:3], [area] * 3)
        self.assertEqual(areas[3], area + side * side)

    def test_a_pose_far_from_the_median_area_is_a_warning(self):
        pets = [synth.sprite(120) for _ in range(3)] + [synth.sprite(60)]
        code, review = self.extract("waving", synth.strip(pets))
        self.assertEqual(code, 0)
        self.assertEqual(len(review["warnings"]), 1)
        self.assertRegex(review["warnings"][0], r"^pose 3 is \d+% of the median pose area$")

    def test_a_base_close_to_the_key_suggests_another_key(self):
        pet = synth.sprite(200, color=(200, 70, 170))
        code, review = self.extract("base", synth.strip([pet]))
        self.assertEqual(code, 0)
        self.assertTrue(any(w.endswith("re-run init with another --chroma-key") for w in review["warnings"]), review["warnings"])


class SplitEdgeTests(unittest.TestCase):
    def split(self, arr, *extra):
        tmp = synth.tmpdir(self)
        synth.save(arr, tmp / "pet.png")
        code, _ = quiet(pet_frames.main, ["split", str(tmp / "pet.png"), "--out", str(tmp / "split"), *extra])
        return code, tmp / "split"

    def test_a_manual_key_colors_the_strips(self):
        code, out = self.split(synthetic_sheet(1), "--chroma-key", "#00ff00")
        self.assertEqual(code, 0)
        self.assertEqual(pc.read_json(out / "summary.json")["chroma_key"], {"name": "#00FF00", "hex": "#00FF00", "selection": "manual"})
        self.assertEqual(tuple(pc.load_rgba(out / "strips" / "idle.png")[0, 0]), (0, 255, 0, 255))
        self.assertEqual(tuple(pc.load_rgba(out / "identity.png")[0, 0]), (0, 255, 0, 255))

    def test_an_empty_first_idle_frame_has_no_identity(self):
        sheet = synthetic_sheet(1)
        pc.cell(sheet, 0, 0)[:] = 0
        with self.assertRaises(SystemExit) as caught:
            self.split(sheet)
        self.assertIn("first idle frame is empty", str(caught.exception.code))

    def test_a_grid_sheet_with_too_many_colors_is_not_pixel_art(self):
        rng = np.random.default_rng(7)
        sheet = np.zeros((1872, 1536, 4), np.uint8)
        for row, (_, frames, _) in enumerate(pc.rows_for(1)):
            for col in range(frames):
                blocks = np.concatenate([rng.integers(0, 256, (12, 12, 3)), np.full((12, 12, 1), 255)], -1).astype(np.uint8)
                pc.cell(sheet, row, col)[48:144, 48:144] = np.repeat(np.repeat(blocks, 8, 0), 8, 1)
        self.assertEqual(pet_frames.pixel_grid(sheet, 1), 8)
        code, out = self.split(sheet)
        summary = pc.read_json(out / "summary.json")
        self.assertEqual(code, 0)
        self.assertIsNone(summary["pixel_grid"])
        self.assertIsNone(summary["palette"])

    def test_pixel_grid_levels(self):
        soft = synthetic_sheet(1)
        soft[..., 3][soft[..., 3] > 0] = 200
        self.assertIsNone(pet_frames.pixel_grid(soft, 1))
        self.assertEqual(pet_frames.pixel_grid(synthetic_sheet(1), 1), 1)


if __name__ == "__main__":
    unittest.main()
