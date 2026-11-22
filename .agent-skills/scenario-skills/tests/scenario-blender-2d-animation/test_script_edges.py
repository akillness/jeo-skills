"""The refusals and side paths of the preparation scripts, and the keying helpers run_loop.py applies per frame."""
import importlib.util
import runpy
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
import unittest.mock as mock

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402


def load(script):
    spec = importlib.util.spec_from_file_location(f"b2d_{Path(script).stem}", synth.SCRIPTS / script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def exit_without(script, module, run_name="b2d_probe", argv=None):
    """The SystemExit a script raises when `module` cannot be imported."""
    # run_loop.py puts its own folder first on sys.path before importing prep_assets
    with mock.patch.dict(sys.modules, {module: None}), mock.patch.object(sys, "argv", argv or [script]), \
            mock.patch.object(sys, "path", list(sys.path)):
        try:
            runpy.run_path(str(synth.SCRIPTS / script), run_name=run_name)
        except SystemExit as e:
            return e
    raise AssertionError(f"{script} ran without {module}")


class TempDir(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)


class MissingDependencyTests(unittest.TestCase):
    def test_each_script_names_the_packages_it_needs(self):
        for script, module, needle in (("run_loop.py", "numpy", "Pillow, NumPy and SciPy"),
                                       ("reframe_stills.py", "numpy", "Pillow and NumPy"),
                                       ("measure_set.py", "numpy", "Pillow and NumPy"),
                                       ("trace_hulls.py", "numpy", "Pillow, NumPy and SciPy")):
            with self.subTest(script):
                self.assertIn(needle, str(exit_without(script, module).code))

    def test_magenta_key_needs_prep_assets(self):
        d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d)
        clip = d / "clip.mp4"
        clip.write_bytes(b"")
        e = exit_without("run_loop.py", "prep_assets", "__main__", ["run_loop.py", str(clip), str(d / "out")])
        self.assertIn("needs prep_assets.py", str(e.code))
        self.assertFalse((d / "out").exists())


class KeyBorderTests(unittest.TestCase):
    def test_keeps_the_figure_and_drops_a_speck(self):
        key_border = load("run_loop.py").key_border
        rgb = np.zeros((64, 64, 3), np.uint8)
        rgb[:] = synth.MAGENTA
        rgb[20:45, 20:41] = (40, 60, 160)       # the figure
        rgb[50:53, 50:53] = (40, 60, 160)       # a speck, clear of the 8 px border and of the dilated figure
        out = key_border(rgb)
        self.assertEqual(out.shape, (64, 64, 4))
        self.assertEqual(out[30, 30, 3], 255)
        self.assertEqual(tuple(out[30, 30, :3]), (40, 60, 160))
        self.assertEqual(out[51, 51, 3], 0)
        self.assertEqual(out[2, 2, 3], 0)


class CleanTests(unittest.TestCase):
    def test_tightens_the_edge_and_grays_the_fringe_but_not_red(self):
        clean = load("run_loop.py").clean
        a = np.zeros((24, 24, 4), np.uint8)
        a[4:20, 4:20] = (60, 200, 60, 255)
        a[5, 10] = (220, 30, 30, 255)           # a red scarf pixel in the edge band
        out = np.asarray(clean(Image.fromarray(a)))
        self.assertEqual(out[4, 10, 3], 0)                              # the outer ring is gone
        self.assertEqual(out[5, 12, 3], 255)
        self.assertEqual(tuple(out[6, 12, :3]), (55, 126, 55))          # min(channel, luminance) * 0.92
        self.assertEqual(tuple(out[12, 12, :3]), (60, 200, 60))         # the inside keeps its color
        self.assertEqual(tuple(out[5, 10, :3]), (220, 30, 30))


class RunLoopCliTests(TempDir):
    def test_names_a_missing_clip(self):
        r = synth.run("run_loop.py", self.dir / "nope.mp4", self.dir / "out")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("nope.mp4 not found", r.stderr)
        self.assertFalse((self.dir / "out").exists())

    @unittest.skipUnless(synth.HAS_FFMPEG, "ffmpeg not on the PATH")
    def test_refuses_a_range_shorter_than_the_shortest_period(self):
        clip = self.dir / "short.mkv"
        synth.run_clip(clip, frames=12)
        r = synth.run("run_loop.py", clip, self.dir / "out")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("shorter than the shortest period", r.stderr)
        self.assertFalse((self.dir / "out").exists())

    @unittest.skipUnless(synth.HAS_FFMPEG, "ffmpeg not on the PATH")
    def test_clean_tightens_every_frame(self):
        clip = self.dir / "run.mkv"
        synth.run_clip(clip, frames=40, period=10)
        plain, cleaned = self.dir / "plain", self.dir / "clean"
        self.assertEqual(synth.run("run_loop.py", clip, plain).returncode, 0)
        r = synth.run("run_loop.py", clip, cleaned, "--clean")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(sorted(p.name for p in cleaned.iterdir()), sorted(p.name for p in plain.iterdir()))
        a, b = synth.alpha(plain / "run_001.png"), synth.alpha(cleaned / "run_001.png")
        self.assertEqual(a.shape, b.shape)
        self.assertLess((b > 0).sum(), (a > 0).sum())


class ReframeHelperTests(unittest.TestCase):
    def test_figure_box_ignores_stray_pixels(self):
        reframe = load("reframe_stills.py")
        keep = np.zeros((40, 40), bool)
        keep[10:30, 5:15] = True
        keep[35, 30:32] = True                  # two stray pixels in a row and in two columns
        self.assertEqual(tuple(int(v) for v in reframe.figure_box(keep, 3)), (5, 10, 15, 30))
        self.assertIsNone(reframe.figure_box(np.zeros((8, 8), bool), 3))

    def test_magenta_mask_tolerates_a_near_magenta(self):
        reframe = load("reframe_stills.py")
        rgb = np.array([[[255, 0, 255], [230, 60, 230], [240, 109, 240], [40, 60, 160], [255, 110, 255],
                         [170, 0, 171]]])
        # green gets 25 more slack than red and blue: 109 is still background at tolerance 85, 110 is not
        self.assertEqual(reframe.magenta_mask(rgb, 85).tolist(), [[True, True, True, False, False, False]])


class ReframeCliTests(TempDir):
    def still(self, left=(60, 40, 100, 160), right=(250, 70, 330, 150), width=400):
        path = self.dir / "two_pose.png"
        im = Image.new("RGB", (width, 200), synth.MAGENTA)
        for box in (left, right):
            if box:
                im.paste((40, 90, 200), box)
        im.save(path)
        return path

    def reframe(self, still, *extra):
        return synth.run("reframe_stills.py", still, "--name", "hero", "--out", self.dir / "frames", "--size", 200, *extra)

    def test_names_a_missing_still(self):
        r = self.reframe(self.dir / "nope.png")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("nope.png not found", r.stderr)

    def test_checks_figure_against_baseline(self):
        still = self.still()
        for extra in (("--figure", "0.95"), ("--figure", "0.1"), ("--figure", "0.6", "--baseline", "0.5"),
                      ("--baseline", "0.99")):
            with self.subTest(extra):
                r = self.reframe(still, *extra)
                self.assertNotEqual(r.returncode, 0)
                self.assertIn("--figure < --baseline", r.stderr)
        self.assertFalse((self.dir / "frames").exists())

    def test_keeps_existing_frames_without_force(self):
        still = self.still()
        self.assertEqual(self.reframe(still).returncode, 0)
        rest = self.dir / "frames" / "hero_rest.png"
        before = rest.read_bytes()
        r = self.reframe(self.still(left=(20, 40, 120, 160)))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("would overwrite", r.stderr)
        self.assertIn("hero_rest.png", r.stderr)
        self.assertEqual(rest.read_bytes(), before)
        self.assertEqual(self.reframe(still, "--force").returncode, 0)

    def test_refuses_an_empty_half(self):
        r = self.reframe(self.still(right=None))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("no figure found in the action half", r.stderr)

    def test_warns_when_a_pose_touches_the_middle(self):
        r = self.reframe(self.still(left=(60, 40, 200, 160)))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("warning: the rest figure touches the middle or the edge", r.stderr)
        self.assertNotIn("action figure touches", r.stderr)

    def test_refuses_a_figure_wider_than_the_frame(self):
        r = self.reframe(self.still(left=(5, 100, 195, 110)))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("rest figure is wider than the frame", r.stderr)


class MeasureTraceCliTests(TempDir):
    def test_usage_without_arguments(self):
        for script, needle in (("measure_set.py", "island_top_px"), ("trace_hulls.py", "shapes.json")):
            with self.subTest(script):
                r = synth.run(script)
                self.assertEqual(r.returncode, 1)
                self.assertIn(needle, r.stdout)

    def test_trace_names_a_missing_sprite_and_writes_nothing(self):
        game = synth.art_set(self.dir / "jungle")
        r = synth.run("trace_hulls.py", game, "--props", "jar,ghost", "--bounds", "")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("ghost.png not found", r.stderr)
        self.assertFalse((game / "shapes.json").exists())


class PrepAssetsCliTests(TempDir):
    def test_names_a_missing_input(self):
        r = synth.run("prep_assets.py", "key", self.dir / "nope.png", self.dir / "out.png")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("nope.png not found", r.stderr)

    def test_tile_fade_is_at_most_a_quarter_of_the_width(self):
        layer = self.dir / "layer.png"
        synth.wide_layer(layer, w=400)
        r = synth.run("prep_assets.py", "tile", layer, self.dir / "out.png", "101")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("fade_px 101 is more than a quarter of the 400 px width", r.stderr)
        self.assertFalse((self.dir / "out.png").exists())
        r = synth.run("prep_assets.py", "tile", layer, self.dir / "out.png", "100")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(synth.size(self.dir / "out.png"), (300, 120))


if __name__ == "__main__":
    unittest.main()
