"""An audio revision must not silently reuse the earlier vocal performance."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / 'skills/scenario-kinetic-music-video/scripts/audio_paths.py'


class ApprovedStemTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'engine/data').mkdir(parents=True)
        self.stem('master')

    def stem(self, name):
        path = self.root / 'stems/htdemucs' / name / 'vocals.wav'
        path.parent.mkdir(parents=True)
        path.write_bytes(b'stem')

    def run_resolver(self, master):
        (self.root / 'engine/data/audio.json').write_text(json.dumps({'master': master}))
        return subprocess.run([sys.executable, str(SCRIPT)], cwd=self.root, capture_output=True, text=True)

    def test_original_project(self):
        result = self.run_resolver('audio/master.mp3')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'stems/htdemucs/master/vocals.wav')

    def test_selected_revision_wins_over_existing_original(self):
        self.stem('approved take.2')
        result = self.run_resolver('/project/audio/approved take.2.wav')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'stems/htdemucs/approved take.2/vocals.wav')

    def test_missing_revision_does_not_fall_back(self):
        result = self.run_resolver('audio/revised.wav')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('revised/vocals.wav', result.stderr)
        self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
