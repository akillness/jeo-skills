import unittest

import numpy as np

import helpers

grade = helpers.load("grade")
spatial = helpers.load("spatial")

W, H = 40, 20


def flat(color):
    return np.tile(np.array(color, float), (W * H, 1))


def at(img, x, y):
    return img.reshape(H, W, 3)[y, x]


class RelightTests(unittest.TestCase):
    def test_light_gradient_brightens_the_side_it_comes_from(self):
        out = spatial.relight(flat([0.5] * 3), W, H, 0, [{"op": "light_gradient", "angle": 0, "strength": 1,
                                                          "color": [1, 1, 1]}])
        self.assertGreater(at(out, 0, 10)[0], at(out, W - 1, 10)[0])
        self.assertAlmostEqual(at(out, W - 1, 10)[0], 0.5, delta=0.01)

    def test_zero_strength_relight_is_identity(self):
        x = np.random.default_rng(0).random((W * H, 3))
        ops = [{"op": "light_gradient", "strength": 0}, {"op": "spotlight", "strength": 0},
               {"op": "graduated_filter", "strength": 0}]
        np.testing.assert_allclose(spatial.relight(x, W, H, 0, ops), x, atol=1e-9)

    def test_spotlight_follows_its_keys(self):
        op = {"op": "spotlight", "radius": [0.1, 0.2], "strength": 1, "color": [1, 1, 1],
              "keys": [[0, 0.1, 0.5], [2, 0.9, 0.5]]}
        start = spatial.relight(flat([0.3] * 3), W, H, 0, [op])
        end = spatial.relight(flat([0.3] * 3), W, H, 2, [op])
        self.assertGreater(at(start, 4, 10)[0], at(start, 36, 10)[0])
        self.assertGreater(at(end, 36, 10)[0], at(end, 4, 10)[0])

    def test_spotlight_outside_darkens_the_rest(self):
        out = spatial.relight(flat([0.5] * 3), W, H, 0, [{"op": "spotlight", "center": [0.5, 0.5], "strength": 0,
                                                          "outside": -1}])
        self.assertLess(at(out, 0, 0)[0], 0.5)
        self.assertAlmostEqual(at(out, 20, 10)[0], 0.5, delta=0.01)

    def test_graduated_filter_darkens_from_the_top(self):
        out = spatial.relight(flat([0.5] * 3), W, H, 0, [{"op": "graduated_filter", "angle": 90, "strength": -1}])
        self.assertLess(at(out, 20, 0)[0], at(out, 20, H - 1)[0])


class SelectiveTests(unittest.TestCase):
    KEY = {"center": 0, "width": 30, "min_sat": 0.3, "min_area": 20, "weights": [1, 1, 1]}

    def frame(self, blob=(10, 5, 16, 11), speck=(30, 3)):
        img = flat([0.4, 0.5, 0.6]).reshape(H, W, 3)
        x0, y0, x1, y1 = blob
        img[y0:y1, x0:x1] = [0.8, 0.1, 0.1]
        img[speck[1], speck[0]] = [0.8, 0.1, 0.1]
        return img.reshape(-1, 3)

    def test_key_keeps_the_object_and_drops_specks(self):
        out = spatial.selective(self.frame(), W, H, self.KEY)
        kept = at(out, 13, 8)
        self.assertGreater(kept[0] - kept[2], 0.5)
        np.testing.assert_allclose(at(out, 30, 3), [1 / 3] * 3, atol=0.02)
        np.testing.assert_allclose(at(out, 2, 18), [0.5] * 3, atol=0.01)

    def test_clean_reports_blob_sizes_and_accepts_a_fraction(self):
        h, s, v = grade.rgb_to_hsv(self.frame())
        w = spatial.key_weight(h, s, v, self.KEY, H)
        _, sizes = spatial.clean(w, W, H, min_area=36 / (W * H))
        self.assertEqual(sizes[0], 36)

    def test_max_y_cuts_the_ground_band(self):
        img = self.frame(blob=(10, 14, 16, 20))
        out = spatial.selective(img, W, H, dict(self.KEY, max_y=0.5))
        np.testing.assert_allclose(at(out, 13, 17), [1 / 3] * 3, atol=0.02)

    def test_shift_recolors_the_kept_object(self):
        out = spatial.selective(self.frame(), W, H, dict(self.KEY, shift=120))
        h, _, _ = grade.rgb_to_hsv(at(out, 13, 8)[None])
        self.assertAlmostEqual(h[0], 120, delta=2)

    def test_mask_keeps_its_object_whatever_the_color(self):
        img = flat([0.2, 0.6, 0.3])
        mask = np.zeros((H, W), bool)
        mask[4:16, 8:24] = True
        sel = {"masks": [{"path": "m.mp4"}], "weights": [1, 1, 1]}
        out = spatial.selective(img, W, H, sel, {"m.mp4": mask})
        np.testing.assert_allclose(at(out, 15, 10), [0.2, 0.6, 0.3], atol=0.02)
        np.testing.assert_allclose(at(out, 35, 2), [1 / 3 * 1.1] * 3, atol=0.02)

    def test_mask_with_a_key_keeps_only_the_keyed_color_inside(self):
        img = self.frame(blob=(10, 5, 16, 11), speck=(30, 3)).reshape(H, W, 3)
        mask = np.zeros((H, W), bool)
        mask[2:16, 6:22] = True
        sel = {"masks": [{"path": "m.mp4", "key": {"center": 0, "width": 30, "min_sat": 0.3}}],
               "weights": [1, 1, 1]}
        out = spatial.selective(img.reshape(-1, 3), W, H, sel, {"m.mp4": mask})
        self.assertGreater(at(out, 13, 8)[0] - at(out, 13, 8)[2], 0.5)
        np.testing.assert_allclose(at(out, 19, 13), [0.5] * 3, atol=0.02)  # inside the mask, not keyed
        np.testing.assert_allclose(at(out, 30, 3), [1 / 3] * 3, atol=0.02)  # keyed, outside the mask

    def test_helpers_report_what_a_look_needs(self):
        look = {"selective": {"masks": [{"path": "a.mp4"}, {"path": "b.mp4"}]}}
        self.assertTrue(spatial.needs_frames(look))
        self.assertTrue(spatial.needs_frames({"relight": [{"op": "spotlight"}]}))
        self.assertFalse(spatial.needs_frames({"ops": []}))
        self.assertEqual(spatial.mask_paths(look), ["a.mp4", "b.mp4"])
        self.assertEqual(spatial.mask_paths({"ops": []}), [])


if __name__ == "__main__":
    unittest.main()
