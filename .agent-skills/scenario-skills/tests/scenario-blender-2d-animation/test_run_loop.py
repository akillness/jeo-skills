import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402


@unittest.skipUnless(synth.HAS_FFMPEG, "ffmpeg not on the PATH")
class RunLoopTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.clip = self.dir / "hero_run.mkv"
        self.out = self.dir / "game" / "hero_run"

    def frames(self):
        return sorted(p.name for p in self.out.iterdir())

    def test_finds_one_period_and_prints_the_config_numbers(self):
        synth.run_clip(self.clip, period=10)
        r = synth.run("run_loop.py", self.clip, self.out)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.frames(), [f"run_{i:03d}.png" for i in range(1, 11)])
        self.assertIn('"run_n": 10', r.stdout)
        self.assertIn('"run_canvas_px": 96', r.stdout)
        fig = int(re.search(r'"run_fig_px": (\d+)', r.stdout).group(1))
        self.assertAlmostEqual(fig, 65, delta=2)        # rows 20 to 85, give or take the lift
        a = synth.alpha(self.out / "run_001.png")
        self.assertEqual(a[0, 0], 0)                    # keyed
        self.assertEqual(a.max(), 255)

    def test_border_key_follows_a_drifting_background(self):
        def drift(i):
            return (255 - 3 * i, 3 * i, 255)        # magenta toward cyan, away from the figure's colors
        synth.run_clip(self.clip, period=10, background=drift)
        r = synth.run("run_loop.py", self.clip, self.out, "--key", "border", "--from", "20", "--to", "60", "--skip", "0")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('"run_n": 10', r.stdout)
        fig = int(re.search(r'"run_fig_px": (\d+)', r.stdout).group(1))
        self.assertGreater(fig, 55)                     # the leg survived the key (the body alone is 50 px)
        for name in self.frames():
            a = synth.alpha(self.out / name)
            self.assertEqual(a[0, 0], 0, name)

    def test_keeps_existing_frames_without_force(self):
        synth.run_clip(self.clip, period=10)
        self.assertEqual(synth.run("run_loop.py", self.clip, self.out).returncode, 0)
        r = synth.run("run_loop.py", self.clip, self.out)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--force", r.stderr)
        r = synth.run("run_loop.py", self.clip, self.out, "--force", "--periods", "8:12")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len(self.frames()), 10)

    def test_usage_without_arguments(self):
        r = synth.run("run_loop.py")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("run_loop.py", r.stdout)


if __name__ == "__main__":
    unittest.main()
