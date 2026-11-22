"""The dependency-light scripts, run as subprocesses the way an agent runs them."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video" / "scripts"


def run(script, *args, cwd):
    return subprocess.run(
        [sys.executable, str(SCRIPTS / script), *args], cwd=cwd, capture_output=True, text=True
    )


class SynthBeatTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cwd = Path(self.tmp.name)
        (self.cwd / "engine" / "data").mkdir(parents=True)
        audio = {
            "beats": [0.0, 0.5, 1.0, 1.5],
            "downbeats": [0.0, 1.0],
            "kicks": [0.0, 1.0],
            "snares": [0.5, 1.5],
        }
        (self.cwd / "engine" / "data" / "audio.json").write_text(json.dumps(audio))

    def tearDown(self):
        self.tmp.cleanup()

    def test_usage_without_arguments(self):
        r = run("synth_beat.py", cwd=self.cwd)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_writes_wav_then_refuses_to_replace_without_force(self):
        r = run("synth_beat.py", "0", "2", "beat.wav", cwd=self.cwd)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertGreater((self.cwd / "beat.wav").stat().st_size, 1000)
        again = run("synth_beat.py", "0", "2", "beat.wav", cwd=self.cwd)
        self.assertNotEqual(again.returncode, 0)
        self.assertIn("--force", again.stderr)
        forced = run("synth_beat.py", "0", "2", "beat.wav", "--force", cwd=self.cwd)
        self.assertEqual(forced.returncode, 0, forced.stderr)


class SheetTest(unittest.TestCase):
    def setUp(self):
        from PIL import Image

        self.tmp = tempfile.TemporaryDirectory()
        self.cwd = Path(self.tmp.name)
        for name in ("t_0001.png", "t_0002.png"):
            Image.new("RGB", (64, 36), "red").save(self.cwd / name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_usage_without_arguments(self):
        r = run("sheet.py", cwd=self.cwd)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_builds_sheet_and_protects_existing_and_inputs(self):
        r = run("sheet.py", "out.jpg", "2", "t_0001.png", "t_0002.png", cwd=self.cwd)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue((self.cwd / "out.jpg").exists())
        again = run("sheet.py", "out.jpg", "2", "t_0001.png", "t_0002.png", cwd=self.cwd)
        self.assertIn("--force", again.stderr)
        clobber = run("sheet.py", "t_0001.png", "2", "t_0001.png", "t_0002.png", "--force", cwd=self.cwd)
        self.assertNotEqual(clobber.returncode, 0)
        self.assertIn("also an input", clobber.stderr)


if __name__ == "__main__":
    unittest.main()
