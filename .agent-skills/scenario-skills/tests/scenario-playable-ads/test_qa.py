"""The full QA run on the template's placeholder game, built for every network.

It needs Playwright for Python and a Chromium build it can launch, which the CI environment does not
install, so it skips there. Locally: python3 -m pip install playwright && python3 -m playwright install
chromium, then run this suite. A full run takes two to three minutes.
"""

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import playable  # noqa: E402


def chromium_available():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False
    try:
        with sync_playwright() as pw:
            pw.chromium.launch().close()
        return True
    except Exception:
        return False


@unittest.skipUnless(playable.HAS_FFMPEG and chromium_available(), "needs ffmpeg, Playwright and a Chromium build")
class FullQaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.project = playable.new_project(cls.tmp)
        playable.run(playable.SCRIPTS / "build.py", cls.project, "--networks", "all")
        cls.out = playable.run(playable.SCRIPTS / "qa.py", cls.project, "--speed", "2", check=False)
        cls.report = json.loads((cls.project / "qa" / "report.json").read_text())

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def test_every_check_passes(self):
        failed = [k for k, v in self.report["checks"].items() if not v]
        self.assertEqual(failed, [], self.out.stdout)
        self.assertEqual(self.out.returncode, 0)

    def test_every_network_is_checked(self):
        checks = self.report["checks"]
        for net in playable.NETWORKS[:-1]:
            self.assertTrue(any(k.startswith(f"cta_{net}_") for k in checks), net)
            self.assertIn(f"{net}_size_ok", checks)
        for net in ("applovin", "unity", "mraid", "mintegral"):
            self.assertIn(f"gate_{net}_nothing_runs_before_viewable", checks)
        for net in ("applovin", "unity", "mraid"):
            self.assertIn(f"cta_{net}_first_tap_never_opens_store", checks)

    def test_the_untouched_viewer_reaches_the_end_card_without_play(self):
        idle = self.report["runs"]["idle"]
        self.assertEqual(idle["max_progress"], 0)
        self.assertLessEqual(idle["endcard_at"], 15)

    def test_storyboard_frames_are_written(self):
        qa = self.project / "qa"
        for name in ("hook_0.0s.png", "hook_1.5s.png", "view_portrait.png", "view_tablet.png", "view_landscape.png"):
            self.assertTrue((qa / name).is_file(), name)
        self.assertTrue(list(qa.glob("story_*.png")))


if __name__ == "__main__":
    unittest.main()
