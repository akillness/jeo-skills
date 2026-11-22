import contextlib
import io
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

import pet_common as pc  # noqa: E402
import pet_frames  # noqa: E402
import pet_prepare  # noqa: E402


def run_quiet(argv, module=pet_frames):
    with contextlib.redirect_stdout(io.StringIO()):
        return module.main(argv)


class ExtractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = synth.tmpdir(self)
        self.run = self.tmp / "run"
        run_quiet(["init", "--name", "Blob", "--version", "1", "--out", str(self.run)], pet_prepare)

    def extract(self, job, arr):
        synth.save(arr, self.run / "generated" / f"{job}.png")
        code = run_quiet(["extract", str(self.run), "--job", job])
        return code, pc.read_json(self.run / "frames" / job / "review.json")

    def test_frames_come_out_in_order(self):
        sprites = [synth.sprite(120, tag=synth.tag_color(i)) for i in range(8)]
        code, review = self.extract("running-right", synth.strip(sprites))
        self.assertEqual(code, 0)
        self.assertTrue(review["ok"])
        self.assertEqual(len(review["frames"]), 8)
        for i, frame in enumerate(review["frames"]):
            crop = pc.load_rgba(self.run / "frames" / "running-right" / frame["file"])
            self.assertTrue((crop[..., :3] == synth.tag_color(i)).all(-1).any(), f"frame {i} out of order")
        self.assertTrue((self.run / "frames" / "running-right" / "preview.png").is_file())

    def test_row_ground_and_lift(self):
        sprites = [synth.sprite(120) for _ in range(5)]
        _, review = self.extract("jumping", synth.strip(sprites, lifts=[0, 20, 50, 20, 0]))
        bottoms = [frame["box"][3] for frame in review["frames"]]
        self.assertEqual(review["row_ground"], max(bottoms))
        self.assertEqual(review["row_ground"] - bottoms[2], 50)

    def test_clipped_pose_is_an_error(self):
        sprites = [synth.sprite(120) for _ in range(4)]
        arr = synth.strip(sprites)[:, 45:]  # the first pose loses its left edge
        code, review = self.extract("waving", arr)
        self.assertEqual(code, 1)
        self.assertIn("touches the image edge", " ".join(review["errors"]))

    def test_wrong_pose_count_is_an_error(self):
        sprites = [synth.sprite(120) for _ in range(7)]
        code, review = self.extract("running-right", synth.strip(sprites))
        self.assertEqual(code, 1)
        self.assertFalse(review["ok"])
        sprites = [synth.sprite(120) for _ in range(5)]
        code, review = self.extract("waving", synth.strip(sprites))
        self.assertEqual(code, 1)

    def test_detached_piece_joins_the_nearest_pose(self):
        sprites = [synth.sprite(120) for _ in range(4)]
        arr = synth.strip(sprites)
        x = 30 + 2 * (84 + 50) + 40  # inside the third pose's column, above its head
        arr[5:20, x : x + 15, :3] = (30, 30, 30)
        _, review = self.extract("waving", arr)
        self.assertTrue(review["ok"])
        areas = [frame["area"] for frame in review["frames"]]
        self.assertEqual(areas[2] - areas[0], 15 * 15)

    def test_edge_fringe_is_not_a_key_warning(self):
        sprites = [synth.sprite(120, color=(40, 160, 60)) for _ in range(4)]
        for pet in sprites:
            ring = pc.dilate(pet[..., 3] > 0, 1) & ~(pet[..., 3] > 0)
            pet[ring] = (200, 60, 200, 255)  # anti-aliased blend with the magenta key
        _, review = self.extract("waving", synth.strip(sprites))
        self.assertFalse(any("close to the key" in w for w in review["warnings"]))
        for pet in sprites:
            pet[40:90, 30:60] = (200, 70, 170, 255)  # kept by the key cut (distance 123) but key-like
        _, review = self.extract("waving", synth.strip(sprites))
        self.assertTrue(any("inside the pet are close to the key" in w for w in review["warnings"]))

    def test_base_writes_the_identity_reference(self):
        code, _ = self.extract("base", synth.strip([synth.sprite(200)]))
        self.assertEqual(code, 0)
        base = pc.load_rgba(self.run / "references" / "base.png")
        self.assertEqual(tuple(base[0, 0, :3]), synth.MAGENTA)


class SplitTests(unittest.TestCase):
    def sheet(self, version=2, grid=None):
        width, height = pc.SHEET_SIZES[version]
        sheet = np.zeros((height, width, 4), np.uint8)
        for row, (_, frames, _) in enumerate(pc.rows_for(version)):
            for col in range(frames):
                pet = synth.sprite(144, color=(250, 30, 230))
                if not grid:  # generated art has soft, anti-aliased edges
                    big = synth.Image.fromarray(np.repeat(np.repeat(pet, 2, 0), 2, 1))
                    pet = np.array(big.resize((pet.shape[1], pet.shape[0]), synth.Image.Resampling.LANCZOS))
                target = pc.cell(sheet, row, col)
                target[48:192, 48 : 48 + pet.shape[1]] = pet
                if grid:
                    small = target[::grid, ::grid]
                    target[:] = np.repeat(np.repeat(small, grid, 0), grid, 1)
        return sheet

    def test_split_reads_a_v2_sheet(self):
        tmp = synth.tmpdir(self)
        synth.save(self.sheet(2), tmp / "pet.png")
        code = run_quiet(["split", str(tmp / "pet.png"), "--out", str(tmp / "split")])
        self.assertEqual(code, 0)
        summary = pc.read_json(tmp / "split" / "summary.json")
        self.assertEqual(summary["version"], 2)
        self.assertNotEqual(summary["chroma_key"]["name"], "magenta")
        self.assertIsNone(summary["pixel_grid"])
        self.assertEqual(len(list((tmp / "split" / "frames" / "look-10").glob("*.png"))), 8)
        self.assertTrue((tmp / "split" / "identity.png").is_file())
        self.assertTrue((tmp / "split" / "strips" / "waving.png").is_file())

    def test_split_detects_a_pixel_grid(self):
        tmp = synth.tmpdir(self)
        synth.save(self.sheet(1, grid=4), tmp / "pet.png")
        run_quiet(["split", str(tmp / "pet.png"), "--out", str(tmp / "split")])
        summary = pc.read_json(tmp / "split" / "summary.json")
        self.assertEqual(summary["pixel_grid"], 4)
        self.assertGreaterEqual(len(summary["palette"]), 1)

    def test_split_rejects_other_sizes(self):
        tmp = synth.tmpdir(self)
        synth.save(np.zeros((300, 200, 4), np.uint8), tmp / "art.png")
        code = run_quiet(["split", str(tmp / "art.png"), "--out", str(tmp / "split")])
        self.assertEqual(code, 1)
        self.assertFalse(pc.read_json(tmp / "split" / "summary.json")["ok"])


if __name__ == "__main__":
    unittest.main()
