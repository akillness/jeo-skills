"""Error paths, guards and helper edges of the side-view kit scripts."""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
import unittest.mock as mock

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

sys.path.insert(0, str(synth.SCRIPTS))
import process_env as pe  # noqa: E402
import side_sprites as ss  # noqa: E402
import sprite_cycles as sc  # noqa: E402


def frame(x=38, size=96):
    """One magenta frame with a block figure whose left edge is at x."""
    a = np.zeros((size, size, 3), np.uint8)
    a[:] = synth.MAGENTA
    a[30:78, x:x + 20] = (40, 90, 200)
    return a


def sliding_clip(path, frames=40, size=96):
    """A figure that slides across the frame: motion that never closes a loop."""
    tmp = Path(tempfile.mkdtemp())
    for i in range(frames):
        im = Image.new("RGB", (size, size), synth.MAGENTA)
        ImageDraw.Draw(im).rectangle((10 + i, 30, 29 + i, 77), fill=(40, 90, 200))
        im.save(tmp / f"f_{i:03d}.png")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-framerate", "24", "-i", str(tmp / "f_%03d.png"),
                    "-c:v", "mpeg4", "-q:v", "2", "-pix_fmt", "yuv420p", str(path)], check=True)
    shutil.rmtree(tmp)


class MissingDependencyTests(unittest.TestCase):
    def test_each_script_names_what_to_install(self):
        for script, needs in (("process_env", "pip install pillow numpy"), ("reframe_stills", "pip install pillow numpy"),
                              ("sprite_cycles", "pip install pillow numpy"), ("side_sprites", "sprite_cycles.py in the same folder")):
            spec = importlib.util.spec_from_file_location(f"blocked_{script}", synth.SCRIPTS / f"{script}.py")
            mod = importlib.util.module_from_spec(spec)
            with self.subTest(script=script), mock.patch.dict(sys.modules, {"numpy": None}):
                with self.assertRaises(SystemExit) as cm:
                    spec.loader.exec_module(mod)
                self.assertIn(needs, str(cm.exception))


class SeamlessEdgeTests(unittest.TestCase):
    def test_a_fade_under_one_pixel_leaves_the_texture_as_is(self):
        im = Image.new("RGB", (5, 5))
        im.putdata([(x * 40, y * 40, 7) for y in range(5) for x in range(5)])
        np.testing.assert_array_equal(np.asarray(pe.seamless(im, 0.1)), np.asarray(im))


class ProcessEnvCliTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.out = self.dir / "assets"

    def run_env(self, *args):
        return synth.run("process_env.py", "--out", self.out, *args)

    def test_argument_errors(self):
        empty = self.dir / "empty"
        empty.mkdir()
        cases = (
            (("--file", f"tex={self.dir / 'nope.png'}"), f"error: {self.dir / 'nope.png'} not found"),
            ((), "error: give --env (with --levels) or one or more --file KIND=PATH"),
            (("--env", empty, "--fade", 0.5), "error: need 0 < --fade < 0.5"),
            (("--env", empty, "--props", 0), "error: sizes and --props must be positive"),
            (("--env", empty, "--levels", "1"), "error: nothing to process"),
        )
        for args, message in cases:
            with self.subTest(args=args):
                r = self.run_env(*args)
                self.assertEqual(r.returncode, 1)
                self.assertIn(message, r.stderr)
        self.assertFalse(self.out.exists())

    def test_a_fully_transparent_ledge_stops(self):
        Image.new("RGBA", (40, 20), (0, 0, 0, 0)).save(self.dir / "ledge.png")
        r = self.run_env("--file", f"ledge={self.dir / 'ledge.png'}")
        self.assertEqual(r.returncode, 1)
        self.assertIn(f"error: {self.dir / 'ledge.png'} is fully transparent", r.stderr)

    def test_prop_files_from_an_earlier_run_are_named(self):
        synth.props_sheet(self.dir / "crate.png")
        self.out.mkdir()
        stale = self.out / "env_prop_crate_3.webp"
        stale.write_bytes(b"old")
        r = self.run_env("--file", f"props={self.dir / 'crate.png'}", "--props", 4, "--force")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(f"left from an earlier run, delete them or re-render the sheet: {stale}", r.stdout)
        self.assertEqual(stale.read_bytes(), b"old")
        self.assertTrue((self.out / "env_prop_crate_2.webp").is_file())


class ReframeCliTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.out = self.dir / "frames"

    def reframe(self, still, *extra):
        return synth.run("reframe_stills.py", still, "--name", "hero", "--out", self.out, "--size", 200, *extra)

    def test_a_missing_still_stops(self):
        r = self.reframe(self.dir / "nope.png")
        self.assertEqual(r.returncode, 1)
        self.assertIn(f"error: {self.dir / 'nope.png'} not found", r.stderr)

    def test_a_pose_touching_the_middle_warns_but_is_written(self):
        im = Image.new("RGB", (400, 200), synth.MAGENTA)
        d = ImageDraw.Draw(im)
        d.rectangle((150, 40, 199, 159), fill=(40, 90, 200))       # reaches the middle line
        d.rectangle((260, 40, 320, 159), fill=(40, 90, 200))
        im.save(self.dir / "still.png")
        r = self.reframe(self.dir / "still.png")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("the rest figure touches the middle or the edge", r.stderr)
        self.assertNotIn("the action figure touches", r.stderr)
        self.assertEqual(synth.size(self.out / "hero_rest.png"), (200, 200))

    def test_a_pose_wider_than_the_frame_stops(self):
        im = Image.new("RGB", (400, 200), synth.MAGENTA)
        d = ImageDraw.Draw(im)
        d.rectangle((10, 90, 189, 109), fill=(40, 90, 200))        # 180 x 20: x5.8 is past 200 px
        d.rectangle((260, 40, 320, 159), fill=(40, 90, 200))
        im.save(self.dir / "still.png")
        r = self.reframe(self.dir / "still.png")
        self.assertEqual(r.returncode, 1)
        self.assertIn("the rest figure is wider than the frame at --figure 0.58", r.stderr)


class SpriteCycleHelperTests(unittest.TestCase):
    def test_a_still_clip_has_no_loop_window(self):
        sm = [sc.small(sc.key(frame()))] * 30
        self.assertIsNone(sc.loop_window(sm, 8, 20, 3, 0.35))
        with self.assertRaisesRegex(SystemExit, r"no loop window with real motion in the run clip \(range 8:24\)"):
            sc.pick("run", "loop", [frame()] * 30, 24.0, dict(sc.DEFAULT_RANGES), types.SimpleNamespace(frames=6, skip=3))

    def test_an_attack_that_never_leaves_rest_spans_the_clip(self):
        sm = [sc.small(sc.key(frame()))] * 12
        self.assertEqual(sc.attack_window(sm), (0, 12))

    def test_an_empty_key_stops_the_canvas(self):
        empty = sc.key(np.full((20, 20, 3), synth.MAGENTA, np.uint8))
        with self.assertRaisesRegex(SystemExit, "every kept frame is empty after keying"):
            sc.bbox([empty, empty])

    def test_outline_strength_one_is_off(self):
        rgba = np.full((4, 4, 4), 200, np.uint8)
        self.assertIs(sc.outline(rgba, 1.0), rgba)
        self.assertEqual(sc.outline(rgba, 0.5)[0, 0, 0], 100)

    def test_run_directly_points_to_side_sprites(self):
        r = synth.run("sprite_cycles.py")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("run side_sprites.py (same folder) instead", r.stdout)


class LeftoversTests(unittest.TestCase):
    def test_lists_old_outputs_this_run_does_not_rewrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            meta = out / "hero_meta.json"
            self.assertEqual(ss.leftovers(meta, "hero", ".png", set()), [])
            meta.write_text("{not json", encoding="utf-8")
            self.assertEqual(ss.leftovers(meta, "hero", ".png", set()), [])
            meta.write_text(json.dumps({"cycles": {"run": {}, "idle": {}, "spin": {}}, "poses": {"fall": [1, 1]}}),
                            encoding="utf-8")
            for name in ("hero_run.png", "hero_idle.png", "hero_pose_fall.png"):
                (out / name).write_bytes(b"x")
            got = ss.leftovers(meta, "hero", ".png", {out / "hero_run.png"})
            self.assertEqual(got, [str(out / "hero_idle.png"), str(out / "hero_pose_fall.png")])


class SideSpritesGuardTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def test_ffmpeg_missing_from_the_path_stops(self):
        env = dict(os.environ, PATH=str(self.dir))
        r = subprocess.run([sys.executable, "-B", str(synth.SCRIPTS / "side_sprites.py"), "--clips", self.dir,
                            "--name", "hero", "--report"], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 1)
        self.assertIn("error: ffmpeg not found on the PATH", r.stderr)

    @unittest.skipUnless(synth.HAS_FFMPEG, "needs ffmpeg and ffprobe")
    def test_argument_errors(self):
        clips = self.dir / "clips"
        clips.mkdir()
        cases = (
            (("--palette", 1, "--report"), "error: need --palette >= 2 and --height >= 8"),
            (("--height", 4, "--report"), "error: need --palette >= 2 and --height >= 8"),
            ((), "error: --out is required unless --report is given"),
            (("--drop", "jump=1", "--report"), "error: --drop names unknown cycle(s) ['jump']"),
            (("--jump", self.dir / "nope.png", "--report"), f"error: {self.dir / 'nope.png'} not found"),
            (("--cycles", "run:loop:8", "--report"), f"error: missing clip(s): {clips / 'hero_run.mp4'}"),
        )
        for args, message in cases:
            with self.subTest(args=args):
                r = synth.run("side_sprites.py", "--clips", clips, "--name", "hero", *args)
                self.assertEqual(r.returncode, 1)
                self.assertIn(message, r.stderr)


@unittest.skipUnless(synth.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class SideSpritesClipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = Path(tempfile.mkdtemp())
        cls.addClassCleanup(shutil.rmtree, cls.dir)
        cls.clips = cls.dir / "clips"
        cls.clips.mkdir()
        synth.clip(cls.clips / "hero_run.mp4", "loop")
        sliding_clip(cls.clips / "hero_slide.mp4")

    def sprites(self, *extra):
        return synth.run("side_sprites.py", "--clips", self.clips, "--name", "hero", "--canvas", 96, "--height", 24,
                         "--palette", 8, *extra)

    def test_frames_are_resized_to_the_canvas(self):
        arr, fps = sc.read_frames(self.clips / "hero_run.mp4", 48)
        self.assertEqual((arr.shape, fps), ((40, 48, 48, 3), 24.0))

    def test_a_loop_that_never_closes_is_marked_weak(self):
        r = self.sprites("--cycles", "slide:loop:6", "--range", "slide=8:24", "--report")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("hero_slide: start", r.stdout)
        self.assertIn("<- weak loop: widen --range", r.stdout)
        r = self.sprites("--cycles", "run:loop:6", "--report")
        self.assertNotIn("weak loop", r.stdout)

    def test_outputs_of_an_earlier_run_are_named(self):
        out = self.dir / "stale"
        out.mkdir()
        (out / "hero_meta.json").write_text(json.dumps({"cycles": {"run": {}, "idle": {}}, "poses": {}}),
                                            encoding="utf-8")
        (out / "hero_idle.png").write_bytes(b"old")
        r = self.sprites("--cycles", "run:loop:6", "--out", out, "--force")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(f"left from an earlier run and not in this one; they will not match the new hero_meta.json, "
                      f"delete them or add them back to --cycles/--poses: {out / 'hero_idle.png'}", r.stdout)
        self.assertEqual((out / "hero_idle.png").read_bytes(), b"old")
        self.assertEqual(list(json.loads((out / "hero_meta.json").read_text(encoding="utf-8"))["cycles"]), ["run"])

    def test_a_jump_still_without_a_figure_stops(self):
        Image.new("RGB", (96, 96), synth.MAGENTA).save(self.dir / "blank.png")
        out = self.dir / "blank_jump"
        r = self.sprites("--cycles", "run:loop:6", "--jump", self.dir / "blank.png", "--out", out)
        self.assertEqual(r.returncode, 1)
        self.assertIn(f"error: no figure found in {self.dir / 'blank.png'}", r.stderr)
        self.assertFalse(out.exists())


if __name__ == "__main__":
    unittest.main()
