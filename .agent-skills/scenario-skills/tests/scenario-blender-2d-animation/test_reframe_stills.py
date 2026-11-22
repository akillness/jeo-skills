import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

KIT_COPY = synth.SCRIPTS.parents[1] / "scenario-side-view-game-kit" / "scripts" / "reframe_stills.py"


class ReframeTests(unittest.TestCase):
    def test_matches_the_side_view_kit_copy(self):
        # Kept as a copy so each skill installs alone; a fix to one must reach the other.
        self.assertEqual((synth.SCRIPTS / "reframe_stills.py").read_bytes(), KIT_COPY.read_bytes())

    def test_writes_two_square_first_frames(self):
        d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d)
        still = d / "hero.png"
        im = Image.new("RGB", (400, 200), synth.MAGENTA)
        im.paste((40, 90, 200), (60, 40, 100, 160))
        im.paste((40, 90, 200), (250, 70, 330, 150))
        im.save(still)
        r = synth.run("reframe_stills.py", still, "--name", "hero", "--out", d / "frames", "--size", 200)
        self.assertEqual(r.returncode, 0, r.stderr)
        for pose in ("rest", "action"):
            path = d / "frames" / f"hero_{pose}.png"
            self.assertEqual(synth.size(path), (200, 200))
            with Image.open(path) as frame:
                rgb = np.asarray(frame.convert("RGB")).astype(int)
            figure = np.where((rgb != synth.MAGENTA).any(-1).any(1))[0]
            self.assertIn(figure.max(), (162, 163), pose)   # feet on the 0.82 baseline


if __name__ == "__main__":
    unittest.main()
