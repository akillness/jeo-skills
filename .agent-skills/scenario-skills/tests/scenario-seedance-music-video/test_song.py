"""Reading the master: correct hash, real structure, a usable pulse."""

from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from helpers import make_master, make_music

import song


class SongTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)

    def tearDown(self) -> None:
        self._temp.cleanup()

    def test_reports_the_real_file_hash_and_shape(self) -> None:
        master = make_master(self.root / "m.mp3", 4.0)
        result = song.analyse(master)
        expected = hashlib.sha256(master.read_bytes()).hexdigest()

        self.assertEqual(result["file"]["sha256"], expected)
        self.assertEqual(result["file"]["channels"], 2)
        self.assertEqual(result["file"]["codec"], "mp3")
        self.assertAlmostEqual(result["file"]["duration_seconds"], 4.0, delta=0.2)

    def test_leaves_the_master_untouched(self) -> None:
        master = make_master(self.root / "m.mp3", 3.0)
        before = hashlib.sha256(master.read_bytes()).hexdigest()
        song.analyse(master)
        self.assertEqual(hashlib.sha256(master.read_bytes()).hexdigest(), before)

    def test_measures_loudness(self) -> None:
        result = song.analyse(make_master(self.root / "m.mp3", 4.0))
        self.assertEqual(result["loudness"]["status"], "measured")
        self.assertLess(result["loudness"]["integrated_lufs"], 0.0)

    def test_finds_the_boundary_between_quiet_and_loud(self) -> None:
        result = song.analyse(make_music(self.root / "music.mp3"))
        sections = result["sections"]
        self.assertGreaterEqual(len(sections), 2)
        # The synthetic track steps up at 3 seconds, so a boundary should land near it.
        boundaries = [s["start"] for s in sections[1:]]
        self.assertTrue(
            any(abs(b - 3.0) < 0.75 for b in boundaries),
            f"no section boundary near the 3s level change: {boundaries}",
        )
        self.assertEqual({s["energy"] for s in sections} - {"low", "medium", "high"}, set())

    def test_sections_are_contiguous_and_ordered(self) -> None:
        sections = song.analyse(make_music(self.root / "music.mp3"))["sections"]
        for earlier, later in zip(sections, sections[1:]):
            self.assertLessEqual(earlier["start"], later["start"])
            self.assertAlmostEqual(earlier["end"], later["start"], delta=0.1)

    def test_tempo_lands_in_a_musical_range(self) -> None:
        result = song.analyse(make_music(self.root / "music.mp3"))
        for bpm in result["tempo_bpm_candidates"]:
            self.assertGreaterEqual(bpm, 50.0)
            self.assertLessEqual(bpm, 200.0)

    def test_cut_candidates_are_spaced_and_sorted(self) -> None:
        result = song.analyse(make_music(self.root / "music.mp3"))
        times = [c["t"] for c in result["cut_candidates"]]
        self.assertEqual(times, sorted(times))
        for earlier, later in zip(times, times[1:]):
            self.assertGreaterEqual(later - earlier, 2.0)

    def test_cut_candidates_are_drawn_from_the_onsets(self) -> None:
        result = song.analyse(make_music(self.root / "music.mp3"))
        onset_times = {o["t"] for o in result["onsets"]}
        for candidate in result["cut_candidates"]:
            self.assertIn(candidate["t"], onset_times)

    def test_missing_file_is_reported(self) -> None:
        with self.assertRaisesRegex(song.SongError, "file not found"):
            song.analyse(self.root / "nope.mp3")

    def test_cli_writes_json(self) -> None:
        master = make_master(self.root / "m.mp3", 3.0)
        out = self.root / "song.json"
        self.assertEqual(song.main([str(master), "-o", str(out)]), 0)
        self.assertIn("sha256", out.read_text())


if __name__ == "__main__":
    unittest.main()
