import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

import helpers

grade = helpers.load("grade")

GRAY = np.array([[0.5, 0.5, 0.5]])
RAMP = np.stack([np.linspace(0, 1, 11)] * 3, 1)


def rgb(*colors):
    return np.array(colors, float)


class ColorOpTests(unittest.TestCase):
    def test_white_balance_warms_and_cools(self):
        warm = grade.op_white_balance(GRAY, temp=0.2)[0]
        self.assertGreater(warm[0], 0.5)
        self.assertLess(warm[2], 0.5)
        cool = grade.op_white_balance(GRAY, temp=-0.2)[0]
        self.assertLess(cool[0], 0.5)
        self.assertGreater(cool[2], 0.5)

    def test_one_stop_doubles_linear_light(self):
        out = grade.op_exposure(GRAY, stops=1)
        np.testing.assert_allclose(grade.to_lin(out), 2 * grade.to_lin(GRAY))

    def test_cdl_matches_its_formula(self):
        out = grade.op_cdl(GRAY, slope=[1.2, 1, 1], offset=[0, -0.1, 0], power=[1, 1, 2])
        np.testing.assert_allclose(out, [[0.6, 0.4, 0.25]])

    def test_contrast_keeps_pivot_and_ends(self):
        out = grade.op_contrast(rgb([0, 0, 0], [0.45, 0.45, 0.45], [1, 1, 1]), amount=0.6)
        np.testing.assert_allclose(out, [[0, 0, 0], [0.45, 0.45, 0.45], [1, 1, 1]])
        self.assertLess(grade.op_contrast(rgb([0.2] * 3), 0.6)[0, 0], 0.2)
        self.assertGreater(grade.op_contrast(rgb([0.8] * 3), 0.6)[0, 0], 0.8)

    def test_levels_moves_black_and_white(self):
        np.testing.assert_allclose(grade.op_levels(rgb([0] * 3, [1] * 3), 0.05, 0.95), [[0.05] * 3, [0.95] * 3])

    def test_zero_saturation_is_luma_gray(self):
        out = grade.op_saturation(rgb([1, 0, 0]), amount=0)[0]
        np.testing.assert_allclose(out, [0.2126] * 3)

    def test_vibrance_boosts_weak_color_more(self):
        weak, strong = rgb([0.55, 0.5, 0.5]), rgb([1, 0, 0])
        gain = lambda x: np.ptp(grade.op_vibrance(x, 0.4)) / np.ptp(x)
        self.assertGreater(gain(weak), gain(strong))

    def test_split_tone_tints_shadows_and_highlights(self):
        out = grade.op_split_tone(rgb([0.02] * 3, [0.98] * 3), shadows=[0, 0, 0.05], highlights=[0.05, 0, 0])
        self.assertGreater(out[0, 2], out[0, 0])
        self.assertGreater(out[1, 0], out[1, 2])

    def test_hue_shift_moves_only_its_range(self):
        red, blue = rgb([0.8, 0.1, 0.1]), rgb([0.1, 0.1, 0.8])
        shifted = grade.op_hue_shift(np.vstack([red, blue]), center=0, width=30, shift=120)
        h, _, _ = grade.rgb_to_hsv(shifted)
        self.assertAlmostEqual(h[0], 120, delta=1)
        np.testing.assert_allclose(shifted[1], blue[0])

    def test_hue_shift_max_val_spares_bright_pixels(self):
        bright = rgb([1.0, 0.3, 0.3])
        out = grade.op_hue_shift(bright, center=0, width=30, shift=120, max_val=0.6)
        np.testing.assert_allclose(out, bright)

    def test_mono_uses_normalized_weights(self):
        out = grade.op_mono(rgb([1, 0, 0]), weights=[2, 1, 1])[0]
        np.testing.assert_allclose(out, [0.5] * 3)

    def test_duotone_maps_black_and_white_to_its_colors(self):
        out = grade.op_duotone(rgb([0] * 3, [1] * 3), shadows=[0, 0, 0.3], highlights=[1, 0.7, 0.4])
        np.testing.assert_allclose(out, [[0, 0, 0.3], [1, 0.7, 0.4]])
        mid = grade.op_duotone(rgb([1] * 3), [0, 0, 0], [1, 1, 1], mid=[1, 0, 0])
        np.testing.assert_allclose(mid, [[1, 1, 1]])

    def test_highlight_rolloff_leaves_shadows_and_never_clips(self):
        out = grade.op_highlight_rolloff(rgb([0.5] * 3, [1.5] * 3), knee=0.8)
        np.testing.assert_allclose(out[0], [0.5] * 3)
        self.assertLess(out[1, 0], 1)

    def test_decode_log_maps_slog3_middle_gray(self):
        code = rgb([420 / 1023] * 3)  # S-Log3 18% gray
        out = grade.op_decode_log(code, knee=0.99)
        np.testing.assert_allclose(grade.to_lin(out), [[0.18] * 3], atol=0.003)
        with self.assertRaises(ValueError):
            grade.op_decode_log(code, curve="logc")

    def test_hsv_and_lab_round_trip(self):
        x = np.random.default_rng(1).random((200, 3))
        np.testing.assert_allclose(grade.hsv_to_rgb(*grade.rgb_to_hsv(x)), x, atol=1e-9)
        np.testing.assert_allclose(grade.lab_to_rgb(grade.rgb_to_lab(x)), x, atol=1e-3)

    def test_match_with_equal_stats_is_identity_and_strength_blends(self):
        x = np.random.default_rng(2).random((50, 3)) * 0.8 + 0.1
        with tempfile.TemporaryDirectory() as d:
            same = Path(d) / "same.json"
            same.write_text(json.dumps({"src_mean": [50, 0, 0], "src_std": [20, 10, 10],
                                        "ref_mean": [50, 0, 0], "ref_std": [20, 10, 10]}))
            np.testing.assert_allclose(grade.op_match(x, str(same)), x, atol=1e-3)
            warm = Path(d) / "warm.json"
            warm.write_text(json.dumps({"src_mean": [50, 0, 0], "src_std": [20, 10, 10],
                                        "ref_mean": [50, 10, 20], "ref_std": [20, 10, 10]}))
            np.testing.assert_allclose(grade.op_match(x, str(warm), strength=0), x)
            self.assertGreater(grade.op_match(x, str(warm))[:, 0].mean(), x[:, 0].mean())


class LookTests(unittest.TestCase):
    def test_empty_look_writes_an_identity_cube(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "id.cube"
            grade.write_cube(path, {"name": "Ungraded", "ops": []}, size=5)
            lines = path.read_text().splitlines()
        self.assertEqual(lines[:2], ['TITLE "Ungraded"', "LUT_3D_SIZE 5"])
        values = np.array([list(map(float, line.split())) for line in lines[2:]])
        self.assertEqual(len(values), 125)
        # .cube order: red varies fastest, then green, then blue
        np.testing.assert_allclose(values[1], [0.25, 0, 0])
        np.testing.assert_allclose(values[5], [0, 0.25, 0])
        np.testing.assert_allclose(values[25], [0, 0, 0.25])

    def test_load_looks_drops_notes_and_resolves_next_to_the_file(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "looks.json"
            path.write_text(json.dumps({"_readme": "notes", "a": {"ops": []}}))
            looks = grade.load_looks(path)
            self.assertEqual(list(looks), ["a"])
            self.assertEqual(grade.BASE_DIR, Path(d).resolve())

    def test_finish_filter_builds_ffmpeg_filters(self):
        self.assertEqual(grade.finish_filter({}), [])
        f = grade.finish_filter({"vignette": "PI/5", "grain": 6, "halation": {"threshold": 0.5}})
        self.assertEqual(len(f), 3)
        self.assertIn("curves=all='0/0 0.5/0 1/1'", f[0])
        self.assertEqual(f[1:], ["vignette=angle=PI/5:mode=forward", "format=yuv444p,noise=c0s=6:c0f=t"])

    def test_every_shipped_look_bakes(self):
        """The library and the example set only use known ops with valid arguments."""
        for name in ("assets/looks_library.json", "examples/looks.json"):
            with self.subTest(name), tempfile.TemporaryDirectory() as d:
                looks_file = Path(d) / "looks.json"
                looks_file.write_text((helpers.SKILL / name).read_text())
                (Path(d) / "match").mkdir()
                (Path(d) / "match/reference.json").write_text(json.dumps(
                    {"src_mean": [50, 0, 0], "src_std": [20, 10, 10], "ref_mean": [55, 5, 15], "ref_std": [18, 9, 12]}))
                looks = grade.load_looks(looks_file)
                self.assertIn("00_ungraded", looks)  # the showreel's default --source
                for key, look in looks.items():
                    self.assertTrue(look.get("name") and look.get("settings"), f"{key}: the reel shows both")
                    self.assertTrue(set(s["op"] for s in look.get("ops", [])) <= set(grade.OPS), key)
                    out = grade.apply_ops(RAMP, look.get("ops", []))
                    self.assertTrue(np.isfinite(out).all(), key)
                    grade.finish_filter(look)


if __name__ == "__main__":
    unittest.main()
