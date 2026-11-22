"""dynamism_check.py's input checks and edge cases: malformed spans, targets and timelines, videos too short or
outside the sections, measure's sheets, a pair the flow cannot explain, and a slow fade that never holds."""

import contextlib
import importlib.util
import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path
import unittest.mock as mock

import numpy as np

import dynamism_fixtures as fx

SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video" / "scripts" / "dynamism_check.py"
FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
NODE = bool(shutil.which("node"))


def load_module():
    spec = importlib.util.spec_from_file_location("dynamism_check_gaps", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


dc = load_module()


class Tmp(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)

    def write(self, rel, text):
        p = self.dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        return p

    def main(self, *args):
        """Run main() from the project folder, as gate expects; returns (exit code, stdout, stderr)."""
        out, err, here = io.StringIO(), io.StringIO(), os.getcwd()
        os.chdir(self.dir)
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = dc.main([str(a) for a in args])
        finally:
            os.chdir(here)
        return code, out.getvalue(), err.getvalue()


class PureTest(Tmp):
    def test_save_json_under_a_file_is_bad_input(self):
        self.write("blocker", "x")
        with self.assertRaisesRegex(dc.BadInput, "blocker"):
            dc.save_json({}, str(self.dir / "blocker" / "out.json"))

    def test_a_time_before_the_first_downbeat_is_bar_0(self):
        self.assertEqual(dc.bar_beat(0.2, {"downbeats": [1.0, 3.0], "beats": [0.5, 1.0]}), (0, None))

    def test_audio_without_an_envelope_reads_mid(self):
        audio = {"duration": 10.0, "env": {"mix": []}}
        self.assertEqual(dc.energy_of({"start": 1.0, "end": 2.0}, audio), ("mid", "default"))

    def test_timeline_entries_need_numeric_times_and_an_id(self):
        for entry in ({"id": "a", "end": 2}, {"id": "a", "start": "soon", "end": 2}, {"id": "a", "start": None, "end": 2}):
            with self.assertRaisesRegex(dc.BadInput, "needs an id and numeric start and end"):
                dc.sections_from_timeline([entry], "landscape")
        with self.assertRaisesRegex(dc.BadInput, "needs an id$"):
            dc.sections_from_timeline([{"start": 0, "end": 2}], "landscape")

    def test_a_gap_between_entries_is_no_section(self):
        secs = dc.sections_from_timeline([{"id": "a", "start": 0, "end": 1}, {"id": "b", "start": 2, "end": 3}],
                                         "landscape")
        self.assertEqual([(s["id"], s["start"], s["end"]) for s in secs], [("a", 0.0, 1.0), ("b", 2.0, 3.0)])

    def test_malformed_spans_are_bad_input(self):
        for spec in ("verse", "verse=2:1", "=1:2", "verse=1:2:mid:x", "verse=a:b"):
            with self.assertRaisesRegex(dc.BadInput, "expected name=start:end"):
                dc.parse_spans([spec], names_free=True)

    def test_a_span_without_an_end_is_bad_input(self):
        with self.assertRaisesRegex(dc.BadInput, "expected name=start:end"):
            dc.parse_spans(["verse=1"], names_free=True)

    def test_unreadable_or_non_object_targets_are_bad_input(self):
        with self.assertRaisesRegex(dc.BadInput, "missing.json"):
            dc.load_targets(str(self.dir / "missing.json"))
        with self.assertRaisesRegex(dc.BadInput, "broken.json"):
            dc.load_targets(str(self.write("broken.json", "{not json")))
        with self.assertRaisesRegex(dc.BadInput, "expected an object keyed by energy"):
            dc.load_targets(str(self.write("list.json", "[1, 2]")))

    def test_window_motion_of_no_motion_and_of_a_short_window(self):
        m = {"motion": np.array([np.nan] * 10)}
        self.assertEqual(dc.window_motion(m, 0, 10), 0.0)
        m = {"motion": np.array([np.nan, 1.0, 3.0, np.nan, 5.0])}
        self.assertEqual(dc.window_motion(m, 0, 5), 3.0)

    def test_write_targets_needs_a_judged_energy_span(self):
        with self.assertRaisesRegex(dc.BadInput, "no calm, mid or high span"):
            dc.targets_precheck(str(self.dir / "t.json"), [{"energy": "showcase"}, {"energy": None}], False)
        rows = [{"energy": "calm", "short": True}, {"energy": None, "short": False}]
        with self.assertRaisesRegex(dc.BadInput, "every calm, mid or high span is under 1 s"):
            dc.write_targets(str(self.dir / "t.json"), {}, rows, "v.mp4")
        self.assertFalse((self.dir / "t.json").exists())

    def test_a_change_the_flow_cannot_explain_reads_as_motion_scaled_by_area(self):
        tex = fx.texture(seed=5, width=800)
        a = np.ascontiguousarray(tex[:180, :320])
        b = a.copy()
        b[:, :64] = tex[:180, 400:464]  # a fifth of the frame swaps to other content
        v, cut = dc.PairMotion(320, 180)(a, b, 0.3)
        self.assertFalse(cut)
        self.assertGreaterEqual(v, 0.3 * dc.FLOW_CAP)
        self.assertEqual(dc.PairMotion(320, 180)(a, b, 0.5), (0.0, True))


@unittest.skipUnless(NODE, "needs node")
class TimelineTest(Tmp):
    def load(self, js):
        self.write("engine/timeline.js", js)
        here = os.getcwd()
        os.chdir(self.dir)
        try:
            return dc.load_timeline()
        finally:
            os.chdir(here)

    def test_node_errors_and_missing_exports_are_bad_input(self):
        with self.assertRaisesRegex(dc.BadInput, "node could not load it"):
            self.load("export const TIMELINE = [;\n")
        with self.assertRaisesRegex(dc.BadInput, "node printed no TIMELINE"):
            self.load("process.exit(0);\n")
        with self.assertRaisesRegex(dc.BadInput, "no TIMELINE array exported"):
            self.load("export const TIMELINE = { intro: [0, 4] };\n")

    def test_without_node_the_timeline_asks_for_spans(self):
        with mock.patch.object(dc.shutil, "which", return_value=None):
            with self.assertRaisesRegex(dc.BadInput, "needs node; or pass --span"):
                self.load("export const TIMELINE = [];\n")


@unittest.skipUnless(FFMPEG, "needs ffmpeg and ffprobe")
class VideoTest(Tmp):
    def setUp(self):
        super().setUp()
        self.video = self.dir / "clip.mp4"
        fx.encode(self.video, fx.pan(fx.viewer(fx.texture()), 6, seconds=1.0))

    def test_a_file_without_video_and_a_single_frame_are_bad_input(self):
        with self.assertRaisesRegex(dc.BadInput, "no video frames"):
            dc.probe(str(self.write("notes.txt", "not a video")))
        one = self.dir / "one.mp4"
        fx.encode(one, [fx.texture(width=320, height=180)])
        with self.assertRaisesRegex(dc.BadInput, "no frames decoded"):
            dc.measure(str(one))

    def test_gate_rejects_a_broken_audio_json_and_sections_outside_the_video(self):
        self.write("engine/data/audio.json", "{broken")
        code, _, err = self.main("gate", self.video, "--span", "verse=0:1:mid")
        self.assertEqual(code, 2)
        self.assertIn("engine/data/audio.json:", err)
        self.write("engine/data/audio.json", fx.audio_json())
        code, _, err = self.main("gate", self.video, "--start", "10", "--span", "verse=0:1:mid", "--span", "hook=2:3:high")
        self.assertEqual(code, 2)
        self.assertIn("no sections between song time 10.00 and 11.00 (check --start)", err)

    @unittest.skipUnless(NODE, "needs node")
    def test_gate_with_nothing_on_this_canvas_names_it(self):
        self.write("engine/data/audio.json", fx.audio_json())
        self.write("engine/timeline.js", "export const TIMELINE = [{ id: 'tall', start: 0, end: 4, canvas: 'portrait' }];\n")
        code, _, err = self.main("gate", self.video, "--only", "tall")
        self.assertEqual(code, 2)
        self.assertIn("nothing in engine/timeline.js renders on the landscape canvas for --only tall", err)

    def test_measure_rejects_a_bad_crop_and_a_span_outside_the_video(self):
        code, _, err = self.main("measure", self.video, "--crop", "320:180:0")
        self.assertEqual(code, 2)
        self.assertIn("--crop 320:180:0: expected W:H:X:Y in pixels", err)
        code, _, err = self.main("measure", self.video, "--span", "late=2:3")
        self.assertEqual(code, 2)
        self.assertIn("--span late: 2-3 s is outside the 1.00 s video", err)

    def test_measure_writes_busiest_and_calmest_sheets(self):
        code, out, err = self.main("measure", self.video, "--sheets", self.dir / "sheets")
        self.assertEqual(code, 0, err)
        self.assertIn("busiest seconds: 0; calmest: 0", out)
        self.assertEqual(sorted(p.name for p in (self.dir / "sheets").iterdir()), ["busiest_0.jpg", "calmest_0.jpg"])

    def test_a_slow_fade_breaks_still_runs_from_their_first_frame(self):
        # One gray level a frame: every pair is a repeat, but the drift from a run's first frame passes the still
        # test's threshold within 13 frames, so no hold lasts longer.
        base = fx.texture(width=320, height=180).astype(np.int16) // 2
        fade = self.dir / "fade.mp4"
        fx.encode(fade, [np.clip(base + i, 0, 255).astype(np.uint8) for i in range(60)])
        m = dc.measure(str(fade))
        self.assertEqual(m["n"], 60)
        self.assertGreater(len(m["runs"]), 2)
        self.assertTrue(all(b - a <= 14 for a, b in m["runs"]), m["runs"])
        self.assertLess(float(np.nanmax(m["motion"])), 1.0)


if __name__ == "__main__":
    unittest.main()
