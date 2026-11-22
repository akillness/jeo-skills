"""What a film folder installs matches what CI tests and what the music-video skill locks."""

import json
import re
import unittest
from pathlib import Path

import media

ROOT = Path(__file__).resolve().parents[2]


def pins(path):
    found = {}
    for line in Path(path).read_text().splitlines():
        m = re.match(r"^([A-Za-z0-9_.-]+)==([^\s\\;]+)", line.strip())
        if m:
            found[m.group(1).lower()] = m.group(2)
    return found


class RequirementsTest(unittest.TestCase):
    def test_python_pins_match_the_ci_lock(self):
        shipped = pins(media.SKILL / "assets" / "requirements.txt")
        self.assertEqual(sorted(shipped), ["numpy", "opencv-python-headless"])
        locked = pins(ROOT / "tests" / "requirements-ci.txt")
        for name, version in shipped.items():
            self.assertEqual(locked.get(name), version, f"{name}: assets/requirements.txt and tests/requirements-ci.txt disagree")

    def test_the_suite_requires_what_ships(self):
        suite = (Path(__file__).parent / "requirements.txt").read_text()
        for name in pins(media.SKILL / "assets" / "requirements.txt"):
            self.assertRegex(suite, rf"(?m)^{re.escape(name)}>=")

    def test_playwright_matches_the_music_video_lock(self):
        ours = media.SKILL / "assets" / "npm"
        theirs = ROOT / "skills" / "scenario-kinetic-music-video" / "assets" / "npm"
        pkg = json.loads((ours / "package.json").read_text())
        self.assertEqual(pkg["dependencies"], {"playwright": json.loads((theirs / "package.json").read_text())["dependencies"]["playwright"]})
        lock, their_lock = (json.loads((d / "package-lock.json").read_text())["packages"] for d in (ours, theirs))
        self.assertEqual(lock[""]["dependencies"], pkg["dependencies"])
        for name in ("node_modules/playwright", "node_modules/playwright-core"):
            self.assertEqual(lock[name], their_lock[name], name)


if __name__ == "__main__":
    unittest.main()
