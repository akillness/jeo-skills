"""check_master.py: the onset search, the end-to-end report, and the comparison with the simulation."""

import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import numpy as np

import helpers

cm = helpers.load("check_master")
bp = helpers.load("build_passes")
SR = helpers.SR


def place(render, x, t, gain=1.0):
    p = round(t * SR)
    render[p:p + len(x)] += gain * x[:len(render) - p]


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class OnsetTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.tap = helpers.burst(0.12, amp=0.5, seed=1)
        helpers.write_wav(self.dir / "tap.wav", self.tap)

    def test_repeated_hits_each_match_their_own_onset(self):
        times = [1.0, 1.267, 1.533]  # taps 8 frames apart, closer than the 0.35 s search
        render = np.zeros(3 * SR)
        for t in times:
            place(render, self.tap, t)
        render[round(0.95 * SR):round(1.15 * SR)] += 0.05 * np.random.default_rng(2).standard_normal(round(0.2 * SR))
        hits = [{"label": f"tap {k}", "file": str(self.dir / "tap.wav"), "t": t, "trimStart": 0.0} for k, t in enumerate(times)]
        rows = cm.onset_table(render, hits)
        for r in rows:
            self.assertLess(abs(r["offset"]), 0.001, r)
            self.assertFalse(r["check"], r)
        naive, _ = cm.onset(render, cm.mono(self.dir / "tap.wav")[:round(0.25 * SR)], 1.0, -0.15, 0.35)
        self.assertAlmostEqual(naive, 0.267, delta=0.002)  # the unbounded window takes the clean neighbor

    def test_trim_start_is_honored(self):
        lead = helpers.tone(0.06, amp=0.5, freq=1000)
        helpers.write_wav(self.dir / "swish.wav", np.concatenate([lead, self.tap]))
        render = np.zeros(2 * SR)
        place(render, self.tap, 0.5)
        hit = {"label": "swish", "file": str(self.dir / "swish.wav"), "t": 0.5, "trimStart": 0.06, "end": 0.62}
        (row,) = cm.onset_table(render, [hit])
        self.assertLess(abs(row["offset"]), 0.001, row)

    def test_windows_stop_halfway_to_a_repeat_only(self):
        hits = [{"file": "a", "t": 1.0}, {"file": "a", "t": 1.2}, {"file": "b", "t": 1.1}]
        windows = cm.search_windows(hits)
        self.assertEqual([tuple(round(v, 3) for v in w) for w in windows], [(-0.15, 0.1), (-0.1, 0.35), (-0.15, 0.35)])


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class ReportTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        tap = helpers.burst(0.12, amp=0.6, seed=3)
        helpers.write_wav(self.dir / "tap.wav", tap)
        render = helpers.tone(2.0, amp=0.05)
        for t in (0.5, 1.2):
            place(render, tap, t)
        helpers.write_wav(self.dir / "mix.wav", render)
        helpers.mux(self.dir / "master.mov", self.dir / "mix.wav")
        self.cues = {"duration": 2.0, "fps": 30, "canvas": [64, 112], "sections": [0, 1],
                     "cues": [{"label": f"tap {t}", "role": "hit", "file": str(self.dir / "tap.wav"), "t": t, "end": t + 0.12,
                               "trimStart": 0.0} for t in (0.5, 1.2)]}

    def check(self, cues):
        helpers.write_json(self.dir / "cues.json", cues)
        return helpers.run("check_master.py", self.dir / "master.mov", self.dir / "cues.json", "-o", self.dir / "qa")

    def test_report_writes_the_sheet_and_the_onset_table(self):
        result = self.check(self.cues)
        self.assertIn("video: h264 64x112", result.stdout)
        self.assertIn("section 0-1 s: mean", result.stdout)
        self.assertIn("true peak", result.stdout)
        self.assertGreater((self.dir / "qa/sheet_2fps.jpg").stat().st_size, 0)
        rows = json.loads((self.dir / "qa/onsets.json").read_text())
        self.assertEqual(len(rows), 2)
        for r in rows:
            self.assertLess(abs(r["offset"]), 0.002, r)
        self.assertNotIn("FAIL hit", result.stderr)
        self.assertEqual(result.returncode, 1)  # the tiny test mix is far below -16 LUFS
        self.assertIn("outside -16 to -14", result.stderr)

    def test_a_wrong_canvas_or_length_fails(self):
        result = self.check({**self.cues, "canvas": [1080, 1920], "duration": 15.0})
        self.assertEqual(result.returncode, 1)
        self.assertIn("FAIL canvas 64x112, planned 1080x1920", result.stderr)
        self.assertIn("planned 15.0 s", result.stderr)

    def test_a_late_hit_reads_check(self):
        late = {**self.cues, "cues": [{**self.cues["cues"][0], "t": 0.35}]}
        result = self.check(late)
        self.assertIn("CHECK", result.stdout)
        self.assertIn("FAIL hit tap 0.5 at 0.35 s", result.stderr)

    def test_the_default_folder_sits_beside_the_cues_never_beside_the_master(self):
        (self.dir / "deliver").mkdir()
        (self.dir / "build").mkdir()
        shutil.move(self.dir / "master.mov", self.dir / "deliver/master.mov")
        helpers.write_json(self.dir / "build/cues.json", self.cues)
        result = helpers.run("check_master.py", self.dir / "deliver/master.mov", self.dir / "build/cues.json")
        self.assertIn("lands", result.stdout, result.stderr)
        self.assertTrue((self.dir / "build/check_master/sheet_2fps.jpg").exists())
        self.assertEqual([p.name for p in (self.dir / "deliver").iterdir()], ["master.mov"])


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg")
class DarkFrameTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def test_a_short_dip_between_shots_fails_and_a_fade_or_a_dip_in_a_dim_shot_passes(self):
        level = lambda v: np.full((112, 64, 3), v, np.uint8)
        frames = ([level(120)] * 20 + [level(0)] + [level(110)] * 20 + [level(25)] * 2 + [level(110)] * 10
                  + [level(v) for v in range(110, 0, -11)] + [level(5)] * 10 + [level(14)] + [level(5)] * 5
                  + [level(20)] * 5 + [level(2)] + [level(20)] * 5)
        master = helpers.encode(self.dir / "master.mp4", frames, crf=10)
        dips = cm.dark_frames(master)
        self.assertEqual([(n, run) for n, run, *_ in dips], [(20, 1), (41, 2)])
        helpers.write_json(self.dir / "cues.json", {"fps": 30, "cues": []})
        result = helpers.run("check_master.py", master, self.dir / "cues.json", "-o", self.dir / "qa")
        self.assertEqual(result.returncode, 1)
        self.assertIn("frame 20 (0.667 s) dips dark", result.stderr)
        self.assertIn("frames 41-42 (1.367 s) dips dark", result.stderr)


class CompareTests(unittest.TestCase):
    def test_the_master_is_aligned_and_judged_after_its_overall_gain(self):
        rng = np.random.default_rng(0)
        sim = np.zeros(2 * SR, np.float32)
        sim += 0.05 * np.sin(2 * np.pi * 220 * np.arange(2 * SR) / SR).astype(np.float32)
        tap = helpers.burst(0.12, amp=0.5, seed=1).astype(np.float32)
        for t in (0.5, 1.2):
            place(sim, tap, t)
        master = np.concatenate([np.zeros(10, np.float32), sim[:-10]]) * np.float32(10 ** (-3 / 20))
        master += np.float32(0.001) * rng.standard_normal(len(master)).astype(np.float32)
        summary, rows = cm.compare(master, sim, [{"label": "a", "t": 0.5, "end": 0.62}, {"label": "b", "t": 1.2, "end": 1.32}])
        self.assertAlmostEqual(summary["lag_ms"], 1000 * 10 / SR, places=2)
        self.assertAlmostEqual(summary["gain_db"], -3, delta=0.1)
        self.assertGreater(summary["match"], 0.99)
        for r in rows:
            self.assertTrue(r["sim_ok"], r)
            self.assertLess(abs(r["sim_offset"]), 0.0005, r)
            self.assertLess(abs(r["sim_level_db"]), 0.2, r)


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class SimulationTests(unittest.TestCase):
    """Masters built from build_passes.py simulate, through AAC at 128 kbps like compose."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        bp._audio.clear()
        helpers.write_wav(self.dir / "music.wav", helpers.tone(2.0, amp=0.1))
        helpers.write_wav(self.dir / "boom.wav", helpers.burst(0.25, amp=0.6, seed=3))
        helpers.write_wav(self.dir / "tap.wav", helpers.burst(0.12, amp=0.5, seed=1))
        self.hits = [{"label": "boom", "file": "boom.wav", "t": 0.5},
                     {"label": "masked", "file": "tap.wav", "t": 0.5, "gain_db": -14},
                     *({"label": f"tap {k}", "file": "tap.wav", "t": t} for k, t in enumerate((1.0, 1.2, 1.4)))]
        assets = {"music.wav": "M", "boom.wav": "B", "tap.wav": "T"}
        plan = self.plan("plan.json", self.hits, assets=assets)
        _, cues, _ = bp.sound_payload(plan, "SILENT")
        helpers.write_json(self.dir / "cues.json", cues)
        with redirect_stdout(io.StringIO()):
            bp.simulate(plan, self.dir / "sim.wav")

    def plan(self, name, hits, **raw):
        helpers.write_json(self.dir / name, {"duration": 2.0, "canvas": [64, 112], "sound": {
            "music": [{"file": "music.wav", "gains": [[0, 0]]}], "hits": hits}, **raw})
        return bp.Plan(self.dir / name)

    def master(self, hits):
        with redirect_stdout(io.StringIO()):
            bp.simulate(self.plan("render.json", hits), self.dir / "render.wav")
        return helpers.mux(self.dir / "master.mp4", self.dir / "render.wav", aac=True)

    def check(self, *extra):
        return helpers.run("check_master.py", self.dir / "master.mp4", self.dir / "cues.json", "-o", self.dir / "qa", *extra)

    def test_masked_and_repeated_hits_pass_when_the_master_follows_the_simulation(self):
        self.master(self.hits)
        alone = self.check()
        self.assertIn("FAIL hit masked at 0.5 s", alone.stderr)  # the template match alone misreads it
        result = self.check("--sim", self.dir / "sim.wav")
        self.assertNotIn("FAIL hit", result.stderr)
        self.assertNotIn("departs", result.stderr)
        self.assertNotIn("DEPARTS", result.stdout)
        self.assertRegex(result.stdout, r"overall match 0\.9[5-9]")
        rows = json.loads((self.dir / "qa/onsets.json").read_text())
        self.assertEqual(len(rows), 5)
        self.assertTrue(all(r["sim_ok"] for r in rows), rows)
        self.assertTrue((self.dir / "qa/sim.json").exists())

    def test_a_missing_hit_departs_from_the_simulation(self):
        self.master([h for h in self.hits if h["label"] != "boom"])
        result = self.check("--sim", self.dir / "sim.wav")
        self.assertEqual(result.returncode, 1)
        self.assertIn("FAIL hit boom at 0.5 s departs from the simulation", result.stderr)
        self.assertIn("DEPARTS", result.stdout)

    def test_audio_checks_run_without_pillow(self):
        code = ("import sys; sys.modules['PIL'] = None; sys.path.insert(0, sys.argv[1]); import check_master, build_passes; "
                "sys.exit(build_passes.main(['simulate', sys.argv[2], '-o', sys.argv[3]]))")
        result = subprocess.run([sys.executable, "-c", code, str(helpers.SCRIPTS), str(self.dir / "plan.json"),
                                 str(self.dir / "nopil.wav")], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.dir / "nopil.wav").exists())


if __name__ == "__main__":
    unittest.main()
