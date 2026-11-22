"""Error paths and small branches of build.py and song.py that the delivery suites skip."""

from __future__ import annotations

import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
import unittest.mock as mock

import numpy as np
from helpers import SCRIPTS, ffmpeg, make_clip, make_master, write_edit

import build
import song

HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def video_info(nb_frames, rate, duration):
    return {"streams": [{"codec_type": "video", "nb_frames": nb_frames, "r_frame_rate": rate}],
            "format": {"duration": duration}}


class PureHelperTests(unittest.TestCase):
    def test_no_video_stream_is_an_error(self) -> None:
        with self.assertRaisesRegex(build.BuildError, "no video stream"):
            build.video_frames({"streams": [{"codec_type": "audio"}]})

    def test_frames_come_from_the_duration_when_the_count_is_missing(self) -> None:
        self.assertEqual(build.video_frames(video_info("N/A", "30000/1001", "2.002")), 60)
        self.assertEqual(build.video_frames(video_info(None, "24/1", "1.5")), 36)
        self.assertEqual(build.video_frames(video_info("48", "24/1", "9.0")), 48)

    def test_audio_layout_names_mono_and_stereo_and_refuses_the_rest(self) -> None:
        self.assertEqual(build.audio_layout({"channel_layout": "5.1"}), "5.1")
        self.assertEqual(build.audio_layout({"channels": 1}), "mono")
        self.assertEqual(build.audio_layout({"channels": 2}), "stereo")
        with self.assertRaisesRegex(build.BuildError, "channel layout is unknown"):
            build.audio_layout({"channels": 6})

    def test_a_master_mp4_cannot_copy_has_no_fingerprint(self) -> None:
        self.assertIsNone(build.audio_fingerprint(Path("never-read.wav"), "pcm_s16le"))

    def test_edit_without_a_master_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            edit = Path(tmp) / "edit.json"
            edit.write_text(json.dumps({"shots": [{"clip": "a.mp4"}]}))
            with self.assertRaisesRegex(build.BuildError, "missing 'master'"):
                build.load_edit(edit)

    def test_a_master_shorter_than_one_window_is_refused(self) -> None:
        with self.assertRaisesRegex(song.SongError, "too short"):
            song.frame_signal(np.zeros(song.WINDOW, np.float32))
        frames = song.frame_signal(np.ones(song.WINDOW + song.HOP, np.float32))
        self.assertEqual(frames.shape, (2, song.WINDOW))

    def test_too_few_frames_give_no_onsets_and_no_tempo(self) -> None:
        self.assertEqual(song.pick_onsets(np.array([0.2, 1.0]), np.array([0.0, 0.1])), [])
        hop = song.HOP / song.SAMPLE_RATE
        self.assertEqual(song.tempo_candidates(np.linspace(0, 1, 10), hop), [])

    def test_cut_candidates_stop_at_the_limit_and_keep_the_strongest(self) -> None:
        onsets = [{"t": 3.0 * i, "strength": s} for i, s in enumerate([0.1, 0.9, 0.3, 0.8, 0.2])]
        chosen = song.cut_candidates(onsets, minimum_gap=2.0, limit=2)
        self.assertEqual([c["t"] for c in chosen], [3.0, 9.0])


@unittest.skipUnless(HAS_FFMPEG, "needs ffmpeg and ffprobe")
class BuildEdgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)
        make_master(self.root / "master.mp3", 2.0)
        make_clip(self.root / "a.mp4", 3.0)

    def tearDown(self) -> None:
        self._temp.cleanup()

    def plan_for(self, shots: list[dict], master: str = "master.mp3", **extra) -> dict:
        edit = write_edit(self.root / "edit.json", master, shots, **extra)
        return build.plan(build.load_edit(edit), self.root)

    def test_a_failed_tool_raises_with_its_stderr(self) -> None:
        with self.assertRaises(build.BuildError) as caught:
            build.run(["ffprobe", "-v", "error", str(self.root / "missing.mp4")])
        message = str(caught.exception)
        self.assertTrue(message.startswith("ffprobe failed\n"))
        self.assertIn("missing.mp4", message)

    def test_non_positive_geometry_is_refused(self) -> None:
        with self.assertRaisesRegex(build.BuildError, "must be positive"):
            self.plan_for([{"clip": "a.mp4", "at": 0}], fps=0)

    def test_a_master_without_audio_is_refused(self) -> None:
        with self.assertRaisesRegex(build.BuildError, "master has no audio stream"):
            self.plan_for([{"clip": "a.mp4", "at": 0}], master="a.mp4")

    def test_two_shots_on_the_same_frame_leave_the_first_empty(self) -> None:
        with self.assertRaisesRegex(build.BuildError, r"shot 0 \('a.mp4'\) has no frames"):
            self.plan_for([{"clip": "a.mp4", "at": 0}, {"clip": "a.mp4", "at": 0.01}])

    def test_a_negative_in_is_refused(self) -> None:
        with self.assertRaisesRegex(build.BuildError, "negative 'in'"):
            self.plan_for([{"clip": "a.mp4", "at": 0, "in": -1}])

    def test_measure_needs_audio_statistics(self) -> None:
        args = ["-i", str(self.root / "master.mp3")]
        with self.assertRaisesRegex(build.BuildError, "no audio statistics"):
            build.measure(args, "[0:a:0]atrim=end=0[m]", "m")

    def test_measure_skips_a_non_numeric_value_under_the_stats_prefix(self) -> None:
        args = ["-i", str(self.root / "master.mp3")]
        graph = "[0:a:0]ametadata=mode=add:key=lavfi.astats.Overall.Note:value=abc[m]"
        stats = build.measure(args, graph, "m")
        self.assertEqual(set(stats), {"Peak_level", "Number_of_samples"})
        self.assertEqual(stats["Number_of_samples"], 2.0 * 44100)

    def test_an_output_without_audio_fails_verification_early(self) -> None:
        report = build.verify({}, self.root / "a.mp4", "copy", "")
        self.assertFalse(report["passed"])
        self.assertEqual(report["checks"], {"one_video_stream": True, "one_audio_stream": False})


class BuildCliTests(unittest.TestCase):
    def test_a_failed_check_is_named_and_exits_one(self) -> None:
        report = {"passed": False, "checks": {"frame_count_exact": False, "geometry": True}, "detail": {}}
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.object(build, "build", return_value=report), redirect_stdout(stdout), redirect_stderr(stderr):
            code = build.main(["edit.json", "out.mp4"])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(stdout.getvalue()), report)
        self.assertIn("FAILED: frame_count_exact\n", stderr.getvalue())
        self.assertNotIn("geometry", stderr.getvalue())

    def test_script_entry_point_reports_a_bad_edit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            edit = Path(tmp) / "edit.json"
            edit.write_text(json.dumps({"master": "m.mp3", "shots": []}))
            result = subprocess.run([sys.executable, str(SCRIPTS / "build.py"), str(edit), str(Path(tmp) / "o.mp4")],
                                    capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("error: edit file needs at least one shot", result.stderr)


@unittest.skipUnless(HAS_FFMPEG, "needs ffmpeg and ffprobe")
class SongEdgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)
        self.text = self.root / "notes.mp3"
        self.text.write_text("not audio at all\n")

    def tearDown(self) -> None:
        self._temp.cleanup()

    def test_a_file_ffprobe_cannot_read_is_reported(self) -> None:
        with self.assertRaisesRegex(song.SongError, "ffprobe failed"):
            song.probe(self.text)

    def test_a_file_without_audio_is_reported(self) -> None:
        clip = make_clip(self.root / "silent.mp4", 1.0)
        with self.assertRaisesRegex(song.SongError, "no audio stream found"):
            song.probe(clip)

    def test_decode_failures_and_empty_audio_are_reported(self) -> None:
        with self.assertRaisesRegex(song.SongError, "ffmpeg decode failed"):
            song.decode_mono(self.text)
        empty = self.root / "empty.wav"
        ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "0", "-c:a", "pcm_s16le", str(empty)])
        with self.assertRaisesRegex(song.SongError, "decoded no audio"):
            song.decode_mono(empty)

    def test_loudness_is_unavailable_without_a_measurement(self) -> None:
        self.assertEqual(song.loudness(self.text), {"status": "unavailable"})

    def test_cli_prints_json_to_stdout_without_an_output_file(self) -> None:
        master = make_master(self.root / "m.mp3", 3.0)
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = song.main([str(master)])
        self.assertEqual(code, 0)
        result = json.loads(stdout.getvalue())
        self.assertEqual(result["file"]["path"], str(master))
        self.assertIn("cut candidates:", stderr.getvalue())

    def test_cli_reports_a_missing_file(self) -> None:
        stderr = io.StringIO()
        with redirect_stderr(stderr):
            code = song.main([str(self.root / "nope.mp3")])
        self.assertEqual(code, 1)
        self.assertIn("error: file not found", stderr.getvalue())

    def test_script_entry_point_exits_one_on_a_missing_file(self) -> None:
        result = subprocess.run([sys.executable, str(SCRIPTS / "song.py"), str(self.root / "nope.mp3")],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("error: file not found", result.stderr)


if __name__ == "__main__":
    unittest.main()
