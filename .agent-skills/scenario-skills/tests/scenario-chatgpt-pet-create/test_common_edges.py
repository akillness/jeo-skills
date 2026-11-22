import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402, F401

import pet_common as pc  # noqa: E402


class CommonEdgeTests(unittest.TestCase):
    def test_row_lookup(self):
        self.assertEqual(pc.row_index("look-10"), 10)
        self.assertEqual(pc.frame_count("waving"), 4)
        with self.assertRaises(KeyError):
            pc.row_index("dancing")

    def test_empty_masks(self):
        empty = np.zeros((6, 5), bool)
        self.assertIsNone(pc.bbox(empty))
        labels, comps = pc.components(empty)
        self.assertEqual(comps, [])
        self.assertFalse(labels.any())

    def test_no_pet_pixels_falls_back_to_the_first_key(self):
        self.assertEqual(pc.choose_key(np.empty((0, 3))), ("magenta", (255, 0, 255), 0.0))

    def test_an_all_white_pet_still_gets_the_key_farthest_from_white(self):
        self.assertEqual(pc.choose_key(np.full((40, 3), 250))[0], "blue")

    def test_shift_moves_content_and_zero_fills(self):
        arr = np.arange(9).reshape(3, 3)
        self.assertEqual(pc.shift(arr, 1, 0).tolist(), [[3, 4, 5], [6, 7, 8], [0, 0, 0]])
        self.assertEqual(pc.shift(arr, 0, -1).tolist(), [[0, 0, 1], [0, 3, 4], [0, 6, 7]])

    def test_on_key_blends_half_transparent_pixels(self):
        sprite = np.zeros((1, 1, 4), np.uint8)
        sprite[0, 0] = (0, 0, 0, 128)
        out = pc.on_key(sprite, (255, 0, 255), pad=1)
        self.assertEqual(out.shape, (3, 3, 4))
        self.assertEqual(tuple(out[0, 0]), (255, 0, 255, 255))
        self.assertEqual(tuple(out[1, 1]), (127, 0, 127, 255))

    def test_srgb_round_trip(self):
        values = np.linspace(0, 1, 11)
        self.assertTrue(np.allclose(pc.to_srgb(pc.to_linear(values)), values))

    def test_clear_transparent_rgb(self):
        arr = np.array([[[9, 9, 9, 0], [9, 9, 9, 1]]], np.uint8)
        self.assertEqual(pc.clear_transparent_rgb(arr).tolist(), [[[0, 0, 0, 0], [9, 9, 9, 1]]])


if __name__ == "__main__":
    unittest.main()
