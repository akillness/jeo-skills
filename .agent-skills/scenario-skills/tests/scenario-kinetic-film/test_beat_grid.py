"""beat_grid.py on synthetic drum tracks: tempo, downbeat, drops, windows and errors.

Two behaviors are known open issues (see the skill's README) and are pre-registered as expected failures:
the downbeat is reported about 70 ms early (the onset envelope lags the kick), and off-beat hats over a
long kick pull the grid half a beat off. A fix turns each into an unexpected success, which fails the run
until its decorator is removed.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import media
import numpy as np

SCRIPT = media.SCRIPTS / "beat_grid.py"
SR = 22050


def run(*args):
    return subprocess.run([sys.executable, "-I", str(SCRIPT), *map(str, args)], capture_output=True, text=True)


class BeatGridTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        cls.cache = {}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def grid(self, bpm, kick="short", pattern="four", lead_in=0.7, seconds=30, hint=True, extra=(), **kw):
        key = (bpm, kick, pattern, lead_in, seconds, hint, tuple(extra), tuple(sorted(kw.items())))
        if key not in self.cache:
            path = self.dir / f"t{len(self.cache)}.wav"
            media.write_wav(path, media.drum_track(bpm, seconds, SR, kick, pattern, lead_in, **kw), SR)
            r = run(path, *(["--bpm", bpm] if hint else []), *extra)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.cache[key] = json.loads(r.stdout)
        return self.cache[key]

    @staticmethod
    def phase_error(offset, lead_in, bpm):
        """Seconds from the reported downbeat to the nearest true beat (negative: early)."""
        beat = 60 / bpm
        return offset - (lead_in + round((offset - lead_in) / beat) * beat)

    def test_reports_every_key(self):
        g = self.grid(172)
        keys = {"bpm", "offset", "downbeats", "drops", "grid_strength", "duration", "film_beats_available"}
        self.assertEqual(set(g), keys)
        self.assertEqual(g["duration"], 30.0)
        self.assertEqual(len(g["downbeats"]), 16)
        self.assertTrue(all(set(d) == {"music_s", "film_beat", "rise"} for d in g["drops"]))

    def test_tempo_with_a_hint(self):
        for bpm in (120, 128, 150, 172):
            for kick in ("short", "long"):
                for pattern in ("four", "twostep"):
                    with self.subTest(bpm=bpm, kick=kick, pattern=pattern):
                        self.assertAlmostEqual(self.grid(bpm, kick, pattern)["bpm"], bpm, delta=0.1)

    def test_without_a_hint_a_fast_track_reads_at_half_tempo(self):
        # what SKILL.md warns about, and why the hint matters
        self.assertAlmostEqual(self.grid(172, hint=False)["bpm"], 86, delta=0.1)
        self.assertAlmostEqual(self.grid(172)["bpm"], 172, delta=0.1)

    def test_kick_led_downbeats_lie_within_100_ms_of_a_kick(self):
        for bpm in (120, 150, 172):
            for kick in ("short", "long"):
                for pattern in ("four", "twostep"):
                    with self.subTest(bpm=bpm, kick=kick, pattern=pattern):
                        g = self.grid(bpm, kick, pattern)
                        for t in g["downbeats"][:4]:
                            self.assertLess(abs(self.phase_error(t, 0.7, bpm)), 0.1)

    def test_downbeats_are_bars_apart(self):
        g = self.grid(150, pattern="twostep")
        gaps = [b - a for a, b in zip(g["downbeats"], g["downbeats"][1:])]
        self.assertTrue(all(abs(d - 4 * 60 / 150) < 0.01 for d in gaps), gaps)
        # the two-step bar has its kick on beat 1: the downbeat is the lead-in beat, not a later one
        self.assertLess(abs(g["offset"] - 0.7), 0.1)

    def test_a_drop_candidate_lies_within_a_bar_of_the_drop(self):
        for bpm, kick in ((172, "short"), (172, "long"), (128, "long")):
            with self.subTest(bpm=bpm, kick=kick):
                g = self.grid(bpm, kick, lead_in=0.5, seconds=40, drop_beat=32)
                drop = 0.5 + 32 * 60 / bpm
                top = max(g["drops"], key=lambda d: d["rise"])
                self.assertLessEqual(abs(top["music_s"] - drop), 4 * 60 / bpm, g["drops"])
                self.assertGreater(top["rise"], 5, g["drops"])

    def test_a_step_in_loudness_scores_its_own_downbeat_not_the_one_a_bar_before(self):
        sys.path.insert(0, str(media.SCRIPTS))
        import beat_grid

        bpm, bar = 120, 2.0
        rms = np.full(int(20 * beat_grid.FR), 0.05)
        rms[int(10 * beat_grid.FR) :] = 0.2  # the drop, on the downbeat at 10 s
        rises = dict(beat_grid.drop_rises(rms, np.arange(bar, 18.1, bar), bpm))
        self.assertAlmostEqual(rises[10.0], 4, delta=0.1)
        self.assertAlmostEqual(rises[8.0], 1, delta=0.1)
        self.assertAlmostEqual(rises[12.0], 1, delta=0.1)

    def test_start_skips_the_intro(self):
        g = self.grid(172, seconds=40, extra=("--start", 12, "--window", 20))
        self.assertGreaterEqual(g["offset"], 12 - 60 / 172)
        self.assertAlmostEqual(g["bpm"], 172, delta=0.1)

    @unittest.expectedFailure
    def test_open_downbeat_within_15_ms_of_the_kick(self):
        for bpm in (120, 150, 172):
            for kick in ("short", "long"):
                with self.subTest(bpm=bpm, kick=kick):
                    self.assertLess(abs(self.phase_error(self.grid(bpm, kick)["offset"], 0.7, bpm)), 0.015)

    @unittest.expectedFailure
    def test_open_off_beat_hats_do_not_pull_the_grid(self):
        for bpm in (120, 128, 150, 172):
            with self.subTest(bpm=bpm):
                g = self.grid(bpm, "long", "offhats")
                self.assertLess(abs(self.phase_error(g["offset"], 0.7, bpm)), 0.1)

    def test_usage(self):
        r = run()
        self.assertEqual(r.returncode, 2)
        self.assertIn("usage:", r.stderr)

    def test_unreadable_file_exits_with_a_message(self):
        bad = self.dir / "not-audio.wav"
        bad.write_text("not audio")
        for path in (bad, self.dir / "missing.wav"):
            with self.subTest(path=path.name):
                r = run(path)
                self.assertEqual(r.returncode, 1)
                self.assertIn("could not decode", r.stderr)
                self.assertNotIn("Traceback", r.stderr)

    def test_short_file_exits_with_a_message(self):
        path = media.write_wav(self.dir / "short.wav", media.drum_track(120, 2, SR), SR)
        r = run(path, "--bpm", 120)
        self.assertEqual(r.returncode, 1)
        self.assertIn("too short", r.stderr)
        self.assertNotIn("Traceback", r.stderr)


if __name__ == "__main__":
    unittest.main()
