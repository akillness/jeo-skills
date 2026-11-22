"""matte_keyed.py: a subject keyed on a solid color becomes a white-on-black matte on the clip's frame grid."""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video" / "scripts" / "matte_keyed.py"


@unittest.skipUnless(shutil.which("ffmpeg"), "needs ffmpeg")
class MatteKeyedTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cwd = Path(self.tmp.name)
        clip = self.cwd / "assets" / "video" / "c"
        clip.mkdir(parents=True)
        (clip / "meta.json").write_text(json.dumps({"fps": 24, "n": 6, "w": 64, "h": 36}))
        # A white subject (the hard case: white on white sets) on the magenta key, 6 frames at 24 fps.
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=magenta:s=64x36:r=24:d=0.25",
             "-vf", "drawbox=x=20:y=8:w=24:h=20:color=white:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p",
             str(self.cwd / "keyed.mp4")],
            check=True,
        )

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *args], cwd=self.cwd, capture_output=True, text=True)

    def test_usage_without_arguments(self):
        r = self.run_script()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_white_subject_on_magenta_becomes_matte(self):
        import cv2

        r = self.run_script("c", "keyed.mp4")
        self.assertEqual(r.returncode, 0, r.stderr)
        clip = self.cwd / "assets" / "video" / "c"
        mattes = sorted(clip.glob("m_*.png"))
        self.assertEqual(len(mattes), 6)
        m = cv2.imread(str(mattes[2]), cv2.IMREAD_GRAYSCALE)
        self.assertEqual(m.shape, (36, 64))
        self.assertGreater(m[18, 32], 230)  # subject
        self.assertLess(m[2, 2], 25)  # key color
        self.assertTrue(json.loads((clip / "meta.json").read_text())["mask"])
        again = self.run_script("c", "keyed.mp4")
        self.assertNotEqual(again.returncode, 0)
        self.assertIn("--force", again.stderr)


if __name__ == "__main__":
    unittest.main()
