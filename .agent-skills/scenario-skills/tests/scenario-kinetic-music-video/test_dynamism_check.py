"""dynamism_check.py: holds, still share, motion and flashes on synthetic clips, and the sections it judges them by."""

import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

import dynamism_fixtures as fx

SKILL = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video"
SCRIPT = SKILL / "scripts" / "dynamism_check.py"
FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
NODE = bool(shutil.which("node"))


def load_module():
    spec = importlib.util.spec_from_file_location("dynamism_check", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


dc = load_module()


def run(cwd, *args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], cwd=cwd, capture_output=True, text=True)


class Project:
    """A project folder: engine/data/audio.json, optional engine/timeline.js and analysis/targets.json."""

    def __init__(self, test, audio=None):
        self.tmp = tempfile.TemporaryDirectory()
        test.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        (self.dir / "engine" / "data").mkdir(parents=True)
        (self.dir / "engine" / "data" / "audio.json").write_text(audio or fx.audio_json())

    def write(self, rel, text):
        p = self.dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
        return p

    def gate(self, video, *args):
        out = self.dir / f"g{len(list(self.dir.glob('g*.json')))}.json"
        r = run(self.dir, "gate", str(video), "--json", str(out), *args)
        return r, (json.loads(out.read_text()) if out.exists() else None)

    def measure(self, video, *args):
        out = self.dir / f"m{len(list(self.dir.glob('m*.json')))}.json"
        r = run(self.dir, "measure", str(video), "--json", str(out), *args)
        return r, (json.loads(out.read_text()) if out.exists() else None)


class PureTest(unittest.TestCase):
    """No ffmpeg, no node: the flash counter, windows, section rules and targets."""

    def flashes(self, lum):
        tr = dc.flash_transitions(np.asarray(lum, float))
        return len(tr), dc.max_flashes(tr)[0]

    def test_flash_counter_follows_wcag_pairs(self):
        t = np.arange(0, 3, 1 / 60)
        self.assertEqual(self.flashes(np.clip(t / 2, 0, 1))[0], 1)  # a slow fade is one change, half a flash
        self.assertEqual(self.flashes(np.where(np.arange(len(t)) == 60, 1.0, 0.0)), (2, 1.0))  # one-frame flash
        self.assertEqual(self.flashes(np.where(t >= 1, 0.9, 0.05))[0], 1)  # a cut from dark to a white ground
        self.assertEqual(self.flashes(0.4 + 0.025 * np.sin(2 * np.pi * 10 * t))[0], 0)  # a 0.05 ripple
        self.assertEqual(self.flashes(np.where((t % 0.2) < 0.1, 0.85, 0.97))[0], 0)  # darker side above 0.80
        self.assertGreaterEqual(self.flashes(0.3 + 0.06 * np.sign(np.sin(2 * np.pi * 8 * t)))[1], 7.5)  # 8 Hz, 0.12
        self.assertGreaterEqual(self.flashes(np.where((t % 0.2) < 0.1, 0.0, 1.0))[1], 4.5)  # 5 Hz strobe
        self.assertEqual(self.flashes(0.1 + 0.3 * ((t % 0.5) < 1 / 30))[1], 2.0)  # a flash on every beat at 120 BPM
        three = self.flashes(np.where((t % (1 / 3)) < 1 / 6, 0.05, 0.9))[1]
        four = self.flashes(np.where((t % 0.25) < 0.125, 0.05, 0.9))[1]
        self.assertLessEqual(three, dc.FLASH_MAX)
        self.assertGreater(four, dc.FLASH_MAX)

    def test_flash_amplitude_spans_the_whole_swing(self):
        tr = dc.flash_transitions(np.array([0.0] * 10 + [0.5] * 10 + [1.0] * 10 + [0.0] * 10))
        self.assertEqual([(d, round(a, 2)) for _, d, a in tr], [(1, 1.0), (-1, 1.0)])

    def test_max_in_window(self):
        self.assertEqual(dc.max_in_window([0, 0.5, 0.99, 1.0, 1.5])[0], 3)
        self.assertEqual(dc.max_in_window([]), (0, None))

    def test_sections_are_the_lowest_z_entry_at_each_instant(self):
        tl = [
            {"id": "verse", "start": 0, "end": 4, "z": 0},
            {"id": "lyrics", "start": 0, "end": 8, "z": 50},  # covered wherever a section plays: an overlay
            {"id": "flash", "start": 1, "end": 1.5, "z": 10},  # fully covered by verse: never a section
            {"id": "chorus", "start": 4, "end": 6, "z": 1},  # z only orders the stack: nothing covers it
            {"id": "bridge", "start": 6, "end": 8},  # no z reads as 0
            {"id": "twin", "start": 6, "end": 8, "z": 0},  # a tie: the first listed is drawn at the bottom
            {"id": "hud", "start": 0, "end": 9999, "z": 100},
            {"id": "spine", "start": 0, "end": 1e9, "z": 90},  # end: Infinity, as node serializes it
        ]
        secs = dc.sections_from_timeline(tl, "landscape")
        self.assertEqual([(s["id"], s["start"], s["end"]) for s in secs],
                         [("verse", 0, 4), ("chorus", 4, 6), ("bridge", 6, 8)])
        tail = dc.sections_from_timeline([{"id": "a", "start": 0, "end": 2}, {"id": "o", "start": 0, "end": 3, "z": 5}],
                                         "landscape")
        self.assertEqual([(s["id"], s["start"], s["end"]) for s in tail], [("a", 0, 2), ("o", 2, 3)])

    def test_sections_filter_like_the_engine(self):
        tl = [
            {"id": "hook", "start": 0, "end": 2, "canvas": ["LANDSCAPE", "square"]},
            {"id": "hook_v", "start": 0, "end": 2, "canvas": "Portrait "},
            {"id": "outro", "start": 2, "end": 4, "variant": "a"},
            {"id": "outro_b", "start": 2, "end": 5, "variant": "b"},
        ]
        def ids(secs):
            return [s["id"] for s in secs]

        self.assertEqual(ids(dc.sections_from_timeline(tl, "landscape")), ["hook", "outro"])
        self.assertEqual(ids(dc.sections_from_timeline(tl, "portrait", "b")), ["hook_v", "outro_b"])
        self.assertEqual(ids(dc.sections_from_timeline(tl, "square")), ["hook", "outro"])
        only = dc.sections_from_timeline(tl, "landscape", "a", only=["outro_b", "hud"])  # --only skips the variant
        self.assertEqual([(s["id"], s["end"]) for s in only], [("outro_b", 5)])
        with self.assertRaises(dc.BadInput):
            dc.sections_from_timeline([{"id": "x", "start": 0, "end": 1, "canvas": "tall"}], "landscape")
        with self.assertRaises(dc.BadInput):
            dc.sections_from_timeline([{"id": "x", "start": 0, "end": 1, "energy": "loud"}], "landscape")

    def test_energy_from_the_song_envelope(self):
        audio = json.loads(fx.audio_json())
        self.assertEqual(dc.energy_of({"start": 3.0, "end": 4.2}, audio), ("calm", "audio"))
        self.assertEqual(dc.energy_of({"start": 0.0, "end": 3.0}, audio), ("mid", "audio"))
        loud = json.loads(fx.audio_json(quiet=(0.0, 6.0)))
        self.assertEqual(dc.energy_of({"start": 6.0, "end": 9.0}, loud), ("high", "audio"))
        # At 3:00 the 60 Hz nominal rate lands 0.24 s late, half of this 0.5 s quiet span.
        late = json.loads(fx.audio_json(duration=200.0, quiet=(180.0, 180.5), level=0.45))
        self.assertEqual(dc.energy_of({"start": 180.0, "end": 180.5}, late), ("calm", "audio"))
        self.assertEqual(dc.energy_of({"start": 9.0, "end": 11.0}, audio), ("showcase", "audio"))
        self.assertEqual(dc.energy_of({"start": 0, "end": 1, "energy": "mid", "from": "timeline"}, audio),
                         ("mid", "timeline"))
        self.assertEqual(dc.energy_of({"start": 0, "end": 1}, None), ("mid", "default"))

    def test_bar_and_beat(self):
        audio = json.loads(fx.audio_json())
        self.assertEqual(dc.bar_beat(3.0, audio), (2, 3))
        self.assertEqual(dc.bar_beat(5.0, audio), (3, 3))
        self.assertEqual(dc.bar_beat(1.0, None), (None, None))

    def test_targets_merge_key_by_key_and_reject_unknown_keys(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.json"
            p.write_text(json.dumps({"high": {"motion_min": 3}, "from": "a note"}))
            tg, src = dc.load_targets(str(p))
            self.assertEqual(tg["high"], dict(dc.DEFAULT_TARGETS["high"], motion_min=3.0))
            self.assertEqual(tg["calm"], dc.DEFAULT_TARGETS["calm"])
            for bad in ({"loud": {}}, {"high": {"hold": 1}}, {"high": {"hold_max_s": "1"}}, {"showcase": {}}):
                p.write_text(json.dumps(bad))
                with self.assertRaises(dc.BadInput):
                    dc.load_targets(str(p))

    def test_targets_out_of_order_across_energies(self):
        self.assertEqual(dc.out_of_order(dc.DEFAULT_TARGETS), [])
        inverted = {"high": {"still_max": 0.178, "hold_max_s": 0.3, "motion_min": 1.67},
                    "calm": {"still_max": 0.344, "hold_max_s": 0.3, "motion_min": 1.01},
                    "mid": {"still_max": 0.333, "hold_max_s": 0.3, "motion_min": 0.9}, "from": {}}
        self.assertEqual(dc.out_of_order(inverted), ["motion_min calm 1.01 > mid 0.9"])
        partial = {"calm": {"hold_max_s": 1.2}, "high": {"hold_max_s": 1.5, "motion_min": 2.0}}
        self.assertEqual(dc.out_of_order(partial), ["hold_max_s mid 1 (default) < high 1.5"])

    def test_targets_order_counts_the_defaults_the_gate_fills_in(self):
        # calm and high spans only, as the measure example writes: the gate holds mid to its defaults
        written = {"calm": {"still_max": 0.344, "hold_max_s": 0.3, "motion_min": 1.01},
                   "high": {"still_max": 0.178, "hold_max_s": 0.3, "motion_min": 1.67}, "from": {}}
        self.assertEqual(dc.out_of_order(written),
                         ["motion_min calm 1.01 > mid 1 (default)", "hold_max_s calm 0.3 < mid 1 (default)"])
        effective, _ = dc.load_targets(None)
        effective.update({k: v for k, v in written.items() if k != "from"})
        self.assertEqual([s.replace(" (default)", "") for s in dc.out_of_order(written)], dc.out_of_order(effective))

    def test_documented_targets_example_parses(self):
        doc = (SKILL / "references" / "dynamism.md").read_text()
        block = re.search(r"```json\n(.*?)```", doc, re.S).group(1)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "targets.json"
            p.write_text(block)
            tg, _ = dc.load_targets(str(p))
        self.assertIn("from", json.loads(block))
        self.assertNotEqual(tg["high"], dc.DEFAULT_TARGETS["high"])


@unittest.skipUnless(FFMPEG, "needs ffmpeg and ffprobe")
class MeasureTest(unittest.TestCase):
    """The measurement on clips with known content."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        cls.view = staticmethod(fx.viewer(fx.texture()))
        cls.five = cls.dir / "five.mp4"  # footage24 [0,3), frozen [3,4.2), moving60 [4.2,6), strobe [6,7), card [7,9)
        fx.encode(cls.five, fx.five_segments(cls.view))
        cls.two = cls.dir / "two.mp4"  # footage24 [0,3), card [3,5)
        fx.encode(cls.two, fx.five_segments(cls.view)[:180] + [cls.view(2600)] * 120)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_usage_without_arguments(self):
        r = run(self.dir)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_footage_at_24fps_in_60fps_is_live(self):
        r, j = Project(self).measure(self.five, "--span", "f=0:3")
        self.assertEqual(r.returncode, 0, r.stderr)
        f = j["spans"][0]
        self.assertLess(f["still_share"], 0.05)  # frame to frame, every repeated frame would read still
        self.assertEqual(f["holds"], [])
        self.assertAlmostEqual(f["median_motion"], 9.6, delta=1.5)  # 4 px per 1/24 s at 320 wide

    def test_motion_is_monotonic_in_speed(self):
        for source_fps in (60, 24):
            read = []
            for speed in (3, 6, 12, 24, 48, 96):
                clip = self.dir / f"pan{speed}_{source_fps}.mp4"
                fx.encode(clip, fx.pan(self.view, speed, 1.0, source_fps))
                m = dc.measure(str(clip))
                s = dc.summarize(m, 0, m["n"], 0, None)
                read.append(s["median_motion"])
                self.assertLess(s["still_share"], 0.05, f"{speed} px per frame at {source_fps} fps")
                if source_fps == 60:
                    self.assertAlmostEqual(read[-1], speed, delta=0.2 * speed)
            self.assertEqual(read, sorted(read), f"{source_fps} fps: {read}")
            self.assertEqual(len(set(read)), len(read), f"{source_fps} fps: {read}")

    def test_low_contrast_pan_is_not_still(self):
        import cv2

        faint = fx.viewer(cv2.normalize(fx.texture(4), None, 112, 128, cv2.NORM_MINMAX))
        clip = self.dir / "faint.mp4"
        fx.encode(clip, fx.pan(faint, 12, 1.0, 24))
        m = dc.measure(str(clip))
        s = dc.summarize(m, 0, m["n"], 0, None)
        self.assertLess(s["still_share"], 0.05)  # under the gray threshold everywhere: the flow sees it move
        self.assertAlmostEqual(s["median_motion"], 12, delta=3)

    def summary(self, name, frames, size=(fx.W, fx.H)):
        clip = self.dir / f"{name}.mp4"
        fx.encode(clip, frames, size=size)
        m = dc.measure(str(clip))
        return m, dc.summarize(m, 0, m["n"], 0, None)

    def test_slow_moves_at_each_motion_floor_are_not_still(self):
        tex = fx.texture(3, 2 * fx.W + 800, 2 * fx.H)
        for energy, tg in dc.DEFAULT_TARGETS.items():  # per-pair flow alone read the calm and mid floors 100% still
            _, s = self.summary(f"drift_{energy}", fx.drift(tex, tg["motion_min"]))
            self.assertLess(s["still_share"], 0.05, energy)
            self.assertAlmostEqual(s["median_motion"], tg["motion_min"], delta=0.25 * tg["motion_min"], msg=energy)
        push = fx.push_in(fx.texture(3, 2 * fx.W, 2 * fx.H), 0.1)
        _, s = self.summary("push_in", push)
        self.assertLess(s["still_share"], 0.05)  # a 10% push-in over 2 s: the mean flow vector stays near zero
        self.assertGreaterEqual(s["median_motion"], dc.DEFAULT_TARGETS["calm"]["motion_min"])
        calm = fx.drift(tex, dc.DEFAULT_TARGETS["calm"]["motion_min"])
        for source_fps in (24, 25):  # a still run spans 2 new pictures: a 0.4 px limit read these 12-93% still
            for name, frames in (("drift", calm), ("push_in", push)):
                with self.subTest(name, source_fps=source_fps):
                    _, s = self.summary(f"{name}_{source_fps}", fx.held(frames, source_fps))
                    self.assertLess(s["still_share"], 0.05)

    def test_grain_on_a_hold_is_still(self):
        for sigma in (1, 3):  # the drift from the run's first frame stays near 0.15 px at sigma 3
            _, s = self.summary(f"grain{sigma}", fx.grain(self.view(700).astype(np.float32), sigma))
            self.assertGreater(s["still_share"], 0.95, sigma)

    def test_toggle_and_jitter_are_not_still(self):
        for name, frames in (("toggle", [self.view(0 if i % 2 else 20) for i in range(90)]),
                             ("jitter", [self.view([0, 8, 16][i % 3]) for i in range(90)])):
            clip = self.dir / f"{name}.mp4"
            fx.encode(clip, frames)
            m = dc.measure(str(clip))
            s = dc.summarize(m, 0, m["n"], 0, None)
            self.assertLess(s["still_share"], 0.05, name)
            self.assertEqual(s["holds"], [], name)
            self.assertGreater(s["median_motion"], 10, name)

    def test_hold_length_is_frame_exact(self):
        p = Project(self)
        loose = p.write("loose.json", json.dumps({"high": {"still_max": 1.0, "motion_min": 0}}))
        for frames, verdict in ((36, 1), (27, 0)):
            clip = self.dir / f"hold{frames}.mp4"
            fx.encode(clip, [self.view(2 * i) for i in range(60)] + [self.view(700)] * frames
                      + [self.view(1200 + 2 * i) for i in range(60)])
            r, j = p.gate(clip, "--span", f"h=0:{(120 + frames) / 60}:high", "--targets", str(loose))
            self.assertEqual(r.returncode, verdict, r.stdout + r.stderr)
            self.assertAlmostEqual(j["sections"][0]["longest_hold_s"], frames / 60, delta=0.03)
            if verdict:
                self.assertIn("hold", j["sections"][0]["failures"][0])

    def test_frozen_stretch_is_a_hold_with_bar_and_beat(self):
        r, j = Project(self).gate(self.five, "--span", "h=3:4.2:mid")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        sec = j["sections"][0]
        self.assertAlmostEqual(sec["holds"][0]["t"], 3.0, delta=0.02)
        self.assertAlmostEqual(sec["holds"][0]["s"], 1.2, delta=0.03)
        self.assertEqual((sec["holds"][0]["bar"], sec["holds"][0]["beat"]), (2, 3))
        self.assertEqual(sec["result"], "fail")
        self.assertTrue(any("hold" in f for f in sec["failures"]))

    def test_spans_and_holds_use_song_time_under_start(self):
        r, j = Project(self).gate(self.five, "--start", "2", "--span", "h=5:6.2:mid")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        hold = j["sections"][0]["holds"][0]
        self.assertAlmostEqual(hold["t"], 5.0, delta=0.02)
        self.assertEqual((hold["bar"], hold["beat"]), (3, 3))
        self.assertEqual(j["per_second"][0]["t"], 2.0)

    def test_still_share_and_motion_each_fail_a_section(self):
        frames, x = [], 0
        for i in range(120):  # 6 moving frames, then a 0.4 s hold, every 0.5 s: each hold passes high's 0.5 s
            frames.append(self.view(x))
            x += 4 if i % 30 < 6 else 0
        frames += fx.drift(fx.texture(3, 2 * fx.W + 800, 2 * fx.H), 1.0)  # live but slow: 1.0 against high's 2.0
        clip = self.dir / "share_motion.mp4"
        fx.encode(clip, frames)
        r, j = Project(self).gate(clip, "--span", "parked=0:2:high", "--span", "slow=2:4:high")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        parked, slow = j["sections"]
        self.assertRegex(" | ".join(parked["failures"]), r"^still \d+% > 15%$")
        self.assertRegex(" | ".join(slow["failures"]), r"^motion \d\.\d < 2\.0$")
        self.assertIn("GATE FAILED: parked@0, slow@2", r.stdout)

    def test_section_under_1s_is_reported_not_judged(self):
        r, j = Project(self).gate(self.two, "--span", "a=0:3:high", "--span", "tail=3:3.9:high")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        tail = j["sections"][1]
        self.assertEqual((tail["result"], tail["failures"]), ("short", []))
        self.assertGreater(tail["longest_hold_s"], dc.DEFAULT_TARGETS["high"]["hold_max_s"])  # judged, it fails

    def test_a_flash_in_and_out_is_one_cut(self):
        white = np.full((fx.H, fx.W), 250, np.uint8)
        before, after = [self.view(300 + 2 * i) for i in range(60)], [self.view(420 + 2 * i) for i in range(60)]
        for k in (1, 4, 6):  # 4 frames at 60 fps, or 2 in a 30 fps preview, read as two cuts
            m, _ = self.summary(f"flash{k}", before + [white] * k + after)
            self.assertEqual(m["cuts"], [60], f"a {k}-frame flash")
        m, _ = self.summary("insert", before + [self.view(2000)] * 6 + [self.view(3000 + 2 * i) for i in range(60)])
        self.assertEqual(m["cuts"], [60, 66])  # an insert, then a third shot: two cuts

    def test_rotation_tag_is_applied(self):
        tall = fx.viewer(fx.texture(9, 600, 3000), 180, 320)
        frames = [tall(0, 4 * i) for i in range(120)]
        upright, coded, rotated = (self.dir / f"{n}.mp4" for n in ("upright", "coded", "rotated"))
        fx.encode(upright, frames, size=(180, 320))
        fx.encode(coded, [np.ascontiguousarray(np.rot90(f)) for f in frames], size=(320, 180))
        tag = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-display_rotation:v:0", "-90", "-i",
                              str(coded), "-c", "copy", str(rotated)], capture_output=True)
        shown = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(rotated), "-frames:v", "1", "-f",
                                "image2pipe", "-c:v", "ppm", "-"], capture_output=True).stdout[:16].split()[1:3]
        if tag.returncode or shown != [b"180", b"320"]:
            self.skipTest("this ffmpeg cannot tag a display rotation")
        m = dc.measure(str(upright))
        want = dc.summarize(m, 0, m["n"], 0, None)["median_motion"]
        m = dc.measure(str(rotated))
        self.assertEqual(m["size"], [180, 320])  # ffprobe's coded size is 320x180
        self.assertAlmostEqual(dc.summarize(m, 0, m["n"], 0, None)["median_motion"], want, delta=0.05 * want)
        _, j = Project(self).gate(rotated, "--span", "a=0:2:high")
        self.assertEqual(j["canvas"], "portrait")

    def test_strobe_fails_photosensitivity_even_in_showcase(self):
        r, j = Project(self).gate(self.five, "--span", "s=6:7:showcase")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertGreaterEqual(j["photosensitivity"]["max_flashes_per_s"], 4.5)
        self.assertEqual(j["sections"][0]["result"], "exempt")
        self.assertIn("flashes", r.stdout)
        self.assertIn("FAIL", r.stdout)
        self.assertIn("photosensitivity", j["failed"])

    def test_showcase_is_exempt_from_holds(self):
        p = Project(self)
        r, j = p.gate(self.two, "--span", "a=0:3:high", "--span", "end=3:5:showcase")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual([s["result"] for s in j["sections"]], ["pass", "exempt"])
        self.assertIn("ALL GATES PASS", r.stdout)
        r, j = p.gate(self.two, "--span", "a=0:3:high", "--span", "end=3:5:mid")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertTrue(any("hold" in f for f in j["sections"][1]["failures"]))
        self.assertIn("GATE FAILED: end@3", r.stdout)

    def test_targets_file_overrides_defaults(self):
        p = Project(self)
        p.write("analysis/targets.json", json.dumps({"mid": {"hold_max_s": 3, "still_max": 1.0, "motion_min": 0}}))
        r, j = p.gate(self.two, "--span", "a=0:3:high", "--span", "end=3:5:mid")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(j["targets"]["source"], "analysis/targets.json")
        p.write("analysis/targets.json", json.dumps({"mid": {"hold": 3}}))
        r, _ = p.gate(self.two, "--span", "a=0:3:high")
        self.assertEqual(r.returncode, 2)
        self.assertIn("hold", r.stderr)

    def test_write_targets_round_trips_through_the_gate(self):
        p = Project(self)
        r, _ = p.measure(self.two, "--span", "high=0:3", "--span", "end=3:5:calm", "--write-targets",
                         "analysis/targets.json")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("WARN", r.stdout)
        tg = json.loads((p.dir / "analysis" / "targets.json").read_text())
        self.assertEqual(set(tg), {"high", "calm", "from"})
        self.assertEqual(set(tg["from"]), {"high", "calm"})
        self.assertIn("high 0-3 s", tg["from"]["high"])
        self.assertAlmostEqual(tg["calm"]["hold_max_s"], 2.5, delta=0.05)  # 2.0 s card hold x 1.25
        r, j = p.gate(self.two, "--span", "a=0:3:high", "--span", "end=3:5:calm")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(j["targets"]["calm"], tg["calm"])
        again, _ = p.measure(self.two, "--span", "high=0:3", "--write-targets", "analysis/targets.json")
        self.assertEqual(again.returncode, 2)
        self.assertIn("--force", again.stderr)
        mid, _ = p.measure(self.two, "--span", "mid=0:3", "--write-targets", "analysis/targets.json")
        self.assertEqual(mid.returncode, 0, mid.stderr)  # a new energy merges in
        self.assertEqual(set(json.loads((p.dir / "analysis" / "targets.json").read_text())),
                         {"high", "calm", "mid", "from"})
        forced, _ = p.measure(self.two, "--span", "chorus=0.5:2.5:high", "--write-targets", "analysis/targets.json",
                              "--force")
        self.assertEqual(forced.returncode, 0, forced.stderr)
        src = json.loads((p.dir / "analysis" / "targets.json").read_text())["from"]
        self.assertEqual(set(src), {"high", "calm", "mid"})
        self.assertIn("chorus 0.5-2.5 s", src["high"])
        self.assertNotIn("high 0-3 s", src["high"])  # the replaced span no longer reads as the source
        self.assertEqual(src["calm"], tg["from"]["calm"])

    def test_write_targets_warns_when_energies_run_backwards(self):
        p = Project(self)
        r, _ = p.measure(self.two, "--span", "verse=0:3:calm", "--span", "pre=3:5:mid", "--write-targets",
                         "analysis/targets.json")
        self.assertEqual(r.returncode, 0, r.stderr)  # a warning, never a failure
        self.assertTrue((p.dir / "analysis" / "targets.json").exists())
        warn = re.search(r"WARN targets out of order across energies: (.+)", r.stdout)
        self.assertIsNotNone(warn, r.stdout)
        for k in ("motion_min calm", "still_max calm", "hold_max_s calm"):
            self.assertIn(k, warn.group(1))

    def test_write_targets_warns_against_a_default_energy(self):
        p = Project(self)
        r, _ = p.measure(self.two, "--span", "verse=0:3:calm", "--write-targets", "analysis/targets.json")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(set(json.loads((p.dir / "analysis" / "targets.json").read_text())), {"calm", "from"})
        warn = re.search(r"WARN targets out of order across energies: (.+)", r.stdout)
        self.assertIsNotNone(warn, r.stdout)  # the busy calm span is held to more than the default mid
        self.assertIn("motion_min calm", warn.group(1))
        self.assertIn("mid 1 (default)", warn.group(1))

    def test_write_targets_keeps_a_note_until_an_energy_is_replaced(self):
        p = Project(self)
        path = p.write("analysis/targets.json", json.dumps({"calm": {"hold_max_s": 1.2}, "from": "set by hand"}))
        r, _ = p.measure(self.two, "--span", "high=0:3", "--write-targets", str(path))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(set(json.loads(path.read_text())["from"]), {"note", "high"})
        r, _ = p.measure(self.two, "--span", "calm=3:5", "--write-targets", str(path), "--force")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(set(json.loads(path.read_text())["from"]), {"high", "calm"})

    def test_measure_reports_and_never_fails(self):
        r, j = Project(self).measure(self.five)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len(j["per_second"]), 9)
        self.assertIn(6.0, [x["t"] for x in j["busiest"]])  # the strobe second
        self.assertIn("busiest", r.stdout)

    def test_crop_keeps_a_caption_band_out(self):
        still = self.view(300)
        frames = []
        for i in range(120):
            f = still.copy()
            f[150:, :] = np.random.default_rng(i // 5).integers(0, 255, (30, fx.W), dtype=np.uint8)
            frames.append(f)
        clip = self.dir / "caption.mp4"
        fx.encode(clip, frames)
        p = Project(self)
        _, raw = p.measure(clip)
        _, cropped = p.measure(clip, "--crop", f"{fx.W}:150:0:0")
        self.assertLess(raw["spans"][0]["still_share"], 0.1)
        self.assertGreater(cropped["spans"][0]["still_share"], 0.9)
        self.assertEqual(cropped["crop"], f"{fx.W}:150:0:0")

    def test_cut_density_warns_when_it_falls(self):
        frames = [self.view(3000 + i if (i // 15) % 2 else 100 + i) for i in range(120)]
        frames += fx.five_segments(self.view)[:120]
        clip = self.dir / "density.mp4"
        fx.encode(clip, frames)
        r, j = Project(self).gate(clip, "--span", "c=0:2:calm", "--span", "h=2:4:high")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertGreaterEqual(j["sections"][0]["cuts"], 6)
        self.assertEqual(j["sections"][0]["cuts_per_bar"], j["sections"][0]["cuts"])  # 2 s, with a 2 s bar
        self.assertIn("WARN cut density", r.stdout)
        self.assertFalse(j["cut_density"]["climbs"])

    def test_preview_agrees_with_master(self):
        big = fx.viewer(fx.texture(5, 4000, 440), 640, 360)
        master = self.dir / "master.mp4"
        frames = [big(8 * int(i / 60 * 24)) for i in range(120)] + [big(900)] * 54
        frames += [np.full((360, 640), 235 if (i // 6) % 2 else 16, np.uint8) for i in range(60)]
        fx.encode(master, frames, size=(640, 360))
        preview = self.dir / "preview.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(master), "-vf", "fps=30,scale=320:180",
                        "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(preview)], check=True)
        p = Project(self)
        spans = ("--span", "f=0:2:high", "--span", "h=2:2.9:calm", "--span", "s=2.9:3.9:showcase")
        _, jm = p.gate(master, *spans)
        _, jp = p.gate(preview, *spans)
        for a, b in zip(jm["sections"], jp["sections"]):
            self.assertAlmostEqual(a["still_share"], b["still_share"], delta=0.05, msg=a["id"])
            self.assertAlmostEqual(a["longest_hold_s"], b["longest_hold_s"], delta=0.05, msg=a["id"])
            self.assertAlmostEqual(a["median_motion"], b["median_motion"], delta=0.2 * max(a["median_motion"], 1))
        self.assertEqual(jm["photosensitivity"]["max_flashes_per_s"], jp["photosensitivity"]["max_flashes_per_s"])

    def test_outputs_refuse_overwrite_without_force(self):
        p = Project(self)
        r = run(p.dir, "gate", str(self.two), "--span", "a=0:3:high", "--json", "out.json")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        again = run(p.dir, "gate", str(self.two), "--span", "a=0:3:high", "--json", "out.json")
        self.assertEqual(again.returncode, 2)
        self.assertIn("--force", again.stderr)
        forced = run(p.dir, "gate", str(self.two), "--span", "a=0:3:high", "--json", "out.json", "--force")
        self.assertEqual(forced.returncode, 0, forced.stderr)
        onto = run(p.dir, "gate", str(self.two), "--span", "a=0:3:high", "--json", str(self.two))
        self.assertEqual(onto.returncode, 2)
        self.assertIn("is the video", onto.stderr)
        r = run(p.dir, "gate", str(self.five), "--span", "h=3:4.2:mid", "--sheets", "sheets")
        self.assertEqual(r.returncode, 1)
        self.assertTrue(list((p.dir / "sheets").glob("hold_h_*.jpg")))
        again = run(p.dir, "gate", str(self.five), "--span", "h=3:4.2:mid", "--sheets", "sheets")
        self.assertEqual(again.returncode, 2)
        self.assertIn("--force", again.stderr)

    def test_outputs_make_missing_folders(self):
        p = Project(self)
        for args in (("gate", str(self.two), "--span", "a=0:3:high", "--json", "out/final/v1.json"),
                     ("measure", str(self.two), "--json", "analysis/refs/two.json")):
            r = run(p.dir, *args)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertTrue((p.dir / args[-1]).is_file(), args[0])
        p.write("blocked", "a file, not a folder")
        for flag in ("--json", "--sheets"):
            r = run(p.dir, "measure", str(self.two), flag, "blocked/two")
            self.assertEqual(r.returncode, 2, flag)
            self.assertIn("cannot write there", r.stderr)
            self.assertNotIn("dynamism measure", r.stdout)  # refused before decoding

    def test_bad_input_exits_2(self):
        p = Project(self)
        r = run(p.dir, "gate", "missing.mp4", "--span", "a=0:1")
        self.assertEqual(r.returncode, 2)
        self.assertIn("no such file", r.stderr)
        r = run(p.dir, "gate", str(self.two))
        self.assertEqual(r.returncode, 2)
        self.assertIn("no sections", r.stderr)
        r = run(p.dir, "gate", str(self.two), "--span", "a=0:3:loud")
        self.assertEqual(r.returncode, 2)


@unittest.skipUnless(FFMPEG and NODE, "needs ffmpeg, ffprobe and node")
class TimelineTest(unittest.TestCase):
    """Sections read from engine/timeline.js through node, as the engine composites them."""

    TIMELINE = """const B = (n) => n * 0.5;
export const CANVAS = 'landscape';
export const TIMELINE = [
  { id: 'verse', start: 0, end: B(6), z: 0, energy: 'high' },
  { id: 'hold', start: B(6), end: 4.2, z: 0 },
  { id: 'chorus', start: 4.2, end: 6, z: 0, canvas: 'landscape', energy: 'high' },
  { id: 'chorus_v', start: 4.2, end: 6, z: 0, canvas: 'portrait' },
  { id: 'flash', start: 6, end: 7, z: 0, energy: 'showcase' },
  { id: 'end', start: 7, end: 9, z: 0, variant: 'a', energy: 'showcase' },
  { id: 'end_b', start: 7, end: 9, z: 0, variant: 'b', energy: 'mid' },
  { id: 'lyrics', start: 0, end: 9, z: 50 },
  { id: 'spine', start: 0, end: Infinity, z: 60 },
  { id: 'hud', start: 0, end: 9999, z: 100 },
];
"""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        cls.view = staticmethod(fx.viewer(fx.texture()))
        cls.five = cls.dir / "five.mp4"
        fx.encode(cls.five, fx.five_segments(cls.view))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def project(self, timeline=None, audio=None):
        p = Project(self, audio)
        p.write("engine/timeline.js", timeline or self.TIMELINE)
        return p

    def test_sections_follow_canvas_variant_and_base_layer(self):
        p = self.project()
        r, j = p.gate(self.five)
        self.assertEqual([s["id"] for s in j["sections"]], ["verse", "hold", "chorus", "flash", "end"], r.stderr)
        self.assertEqual(j["sections_from"], "engine/timeline.js")
        r, j = p.gate(self.five, "--variant", "b")
        self.assertEqual([s["id"] for s in j["sections"]][-1], "end_b", r.stderr)
        self.assertTrue(any("hold" in f for f in j["sections"][-1]["failures"]))

    def test_untagged_section_takes_energy_from_audio(self):
        _, j = self.project().gate(self.five)
        hold = j["sections"][1]
        self.assertEqual((hold["id"], hold["energy"], hold["energy_from"]), ("hold", "calm", "audio"))
        self.assertEqual(j["sections"][0]["energy_from"], "timeline")
        self.assertEqual(hold["result"], "fail")  # 1.2 s frozen against calm's 1.0 s

    def test_section_after_song_end_is_showcase(self):
        tl = self.TIMELINE.replace("energy: 'showcase' }", "}")
        _, j = self.project(tl, fx.audio_json(duration=7.0)).gate(self.five)
        end = j["sections"][-1]
        self.assertEqual((end["id"], end["energy"], end["energy_from"]), ("end", "showcase", "audio"))

    def test_only_judges_the_named_variant(self):
        tl = """export const TIMELINE = [
  { id: 'outro', start: 4, end: 6, z: 0, variant: 'a' },
  { id: 'outro_b', start: 4, end: 9, z: 0, variant: 'b' },
  { id: 'hud', start: 0, end: 9999, z: 100 },
];
"""
        p = self.project(tl)
        two = self.dir / "two.mp4"
        if not two.exists():
            fx.encode(two, fx.five_segments(self.view)[:180] + [self.view(2600)] * 120)
        r, j = p.gate(two, "--only", "outro_b,hud", "--start", "4")
        self.assertEqual([(s["id"], s["start"], s["end"]) for s in j["sections"]], [("outro_b", 4, 9)], r.stderr)
        self.assertEqual(j["only"], ["outro_b", "hud"])
        r, j = p.gate(two, "--start", "4")
        self.assertEqual([s["id"] for s in j["sections"]], ["outro"], r.stderr)
        self.assertIn("WARN gap 6.00-9.00", r.stdout)

    def test_portrait_video_takes_portrait_entries(self):
        tall = fx.viewer(fx.texture(9, 600, 3000), 180, 320)
        clip = self.dir / "tall.mp4"
        fx.encode(clip, [tall(0, 4 * int(i / 60 * 24)) for i in range(90)], size=(180, 320))
        tl = """export const TIMELINE = [
  { id: 'chorus', start: 0, end: 1.5, z: 0, canvas: 'landscape' },
  { id: 'chorus_v', start: 0, end: 1.5, z: 0, canvas: 'portrait', energy: 'high' },
];
"""
        r, j = self.project(tl).gate(clip)
        self.assertEqual(j["canvas"], "portrait", r.stderr)
        self.assertEqual([s["id"] for s in j["sections"]], ["chorus_v"])
        self.assertEqual(j["sections"][0]["result"], "pass", r.stdout)

    def test_unknown_canvas_tag_exits_2(self):
        p = self.project("export const TIMELINE = [{ id: 'a', start: 0, end: 9, canvas: 'tall' }];\n")
        r, _ = p.gate(self.five)
        self.assertEqual(r.returncode, 2)
        self.assertIn("must be landscape, portrait or square", r.stderr)


if __name__ == "__main__":
    unittest.main()
