import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

import pet_common as pc  # noqa: E402


class LayoutTests(unittest.TestCase):
    def test_frame_totals_match_the_two_versions(self):
        self.assertEqual(sum(frames for _, frames, _ in pc.rows_for(1)), 57)
        self.assertEqual(sum(frames for _, frames, _ in pc.rows_for(2)), 73)

    def test_every_frame_has_a_duration(self):
        for job, frames, durations in pc.ROWS:
            self.assertEqual(len(durations), frames, job)

    def test_sheet_sizes(self):
        self.assertEqual(pc.version_for_size(1536, 1872), 1)
        self.assertEqual(pc.version_for_size(1536, 2288), 2)
        self.assertIsNone(pc.version_for_size(1536, 2000))

    def test_look_directions(self):
        self.assertEqual(len(pc.LOOK_LABELS), 16)
        self.assertEqual(pc.EXPECTED["000"], "up")
        self.assertEqual(pc.EXPECTED["090"], "right")
        self.assertEqual(pc.EXPECTED["202.5"], "down-left")
        self.assertEqual(pc.EXPECTED["337.5"], "up-left")

    def test_reference_height_rules(self):
        self.assertEqual(pc.reference_height("jumping", [90, 80, 100, 95, 120]), 120)
        self.assertEqual(pc.reference_height("failed", [150, 100, 90]), 150)
        self.assertEqual(pc.reference_height("idle", [100, 102, 98]), 100)


class KeyTests(unittest.TestCase):
    def test_parse_key(self):
        self.assertEqual(pc.parse_key("#ff00FF"), (255, 0, 255))
        for bad in ("ff00ff", "#ff00f", "#ff00ffa"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                pc.parse_key(bad)
        self.assertEqual(pc.key_hex((255, 0, 255)), "#FF00FF")

    def test_remove_key_clears_only_the_background(self):
        arr = synth.strip([synth.sprite(80)])
        out = pc.remove_key(arr, synth.MAGENTA)
        self.assertTrue((out[0, 0] == 0).all())
        self.assertEqual(int(pc.visible(out).sum()), int((synth.sprite(80)[..., 3] > 0).sum()))

    def test_choose_key_avoids_the_pet_colors(self):
        pink = np.full((50, 3), (250, 20, 235))
        self.assertNotEqual(pc.choose_key(pink)[0], "magenta")
        green = np.full((50, 3), (10, 240, 30))
        self.assertEqual(pc.choose_key(green)[0], "magenta")


class ComponentTests(unittest.TestCase):
    def test_diagonal_pixels_stay_separate(self):
        mask = np.eye(3, dtype=bool)
        self.assertEqual(pc.label(mask)[1], 3)

    def test_u_shape_is_one_component(self):
        mask = np.zeros((4, 5), bool)
        mask[:, 0] = mask[:, 4] = mask[3, :] = True
        self.assertEqual(pc.label(mask)[1], 1)

    def test_boxes_and_areas(self):
        mask = np.zeros((10, 20), bool)
        mask[1:4, 2:6] = True
        mask[5:9, 10:19] = True
        _, comps = pc.components(mask)
        self.assertEqual(sorted((c["area"], c["box"]) for c in comps), [(12, (2, 1, 6, 4)), (36, (10, 5, 19, 9))])

    def test_anchor_follows_the_feet(self):
        mask = np.zeros((100, 100), bool)
        mask[0:60, 0:80] = True  # wide head on the left
        mask[60:100, 70:90] = True  # legs on the right
        self.assertAlmostEqual(pc.anchor_x(mask), 79.5, places=1)

    def test_dilate_reaches_the_radius(self):
        mask = np.zeros((9, 9), bool)
        mask[4, 4] = True
        grown = pc.dilate(mask, 2)
        self.assertEqual(int(grown.sum()), 25)
        self.assertTrue(grown[2, 2] and not grown[1, 4])


if __name__ == "__main__":
    unittest.main()
