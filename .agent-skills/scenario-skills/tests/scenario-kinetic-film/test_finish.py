"""finish.py: each gate at its thresholds, the hardware decode check, the end card, and whole runs."""

import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import numpy as np

import media

sys.path.insert(0, str(media.SCRIPTS))
import finish  # noqa: E402

PASS, FAIL, SKIP = finish.PASS, finish.FAIL, finish.SKIP

FAKE_FFMPEG = """#!{python}
import os, sys
if "-hwaccels" in sys.argv:
    print("Hardware acceleration methods:")
    print(os.environ.get("FAKE_HWACCELS", ""))
elif os.environ.get("FAKE_DECODE_ERROR"):
    sys.stderr.write(os.environ["FAKE_DECODE_ERROR"] + "\\n")
"""


class GateTest(unittest.TestCase):
    def status(self, result):
        return result[0]

    def test_frames(self):
        self.assertEqual(self.status(finish.gate_frames(1426, 1426)), PASS)
        self.assertEqual(self.status(finish.gate_frames(1425, 1426)), FAIL)
        self.assertEqual(self.status(finish.gate_frames(1427, 1426)), FAIL)

    def test_size(self):
        self.assertEqual(finish.gate_size(999_999_999), (PASS, "1.00 GB"))
        self.assertEqual(self.status(finish.gate_size(1_000_000_000)), FAIL)

    def test_level(self):
        self.assertEqual([self.status(finish.gate_level(v)) for v in (0, 42, 52, 60)], [FAIL, PASS, PASS, FAIL])
        self.assertEqual(finish.gate_level(52)[1], "5.2")

    def test_loudness(self):
        for lufs, want in ((-16.0, PASS), (-12.0, PASS), (-14.2, PASS), (-16.1, FAIL), (-11.9, FAIL), (None, FAIL)):
            with self.subTest(lufs=lufs):
                self.assertEqual(self.status(finish.gate_loudness(lufs)), want)

    def test_still_share(self):
        self.assertEqual(finish.gate_still_share(0.4), (PASS, "40% (target 40% or less)"))
        self.assertEqual(self.status(finish.gate_still_share(0.401)), FAIL)

    def test_holds(self):
        self.assertEqual(finish.gate_holds([(3.0, 0.6, 0.01)], 20, 120), (PASS, "none"))
        status, detail = finish.gate_holds([(3.0, 0.61, 0.0123)], 20, 120)
        self.assertEqual(status, FAIL)
        self.assertEqual(detail, "3.00s (beat 6.0)  0.61s  mean change 1.23%")
        # a hold inside the end card is the design: ignored
        self.assertEqual(self.status(finish.gate_holds([(20.5, 3.0, 0.0)], 20, 120)), PASS)
        # only the part before the card counts: 0.1 s of a hold that runs into the card is no stall
        self.assertEqual(self.status(finish.gate_holds([(19.9, 3.0, 0.0)], 20, 120)), PASS)
        self.assertEqual(self.status(finish.gate_holds([(19.3, 3.0, 0.0)], 20, 120)), FAIL)

    def test_motion(self):
        self.assertEqual(self.status(finish.gate_motion(2.5)), PASS)
        self.assertEqual(self.status(finish.gate_motion(2.49)), FAIL)

    def test_end_card(self):
        self.assertEqual(finish.end_card_time({"dur": 24, "endCard": 19.88}), 19.5)  # 4.5 s before the end comes first
        self.assertEqual(finish.end_card_time({"dur": 30, "endCard": 24.5}), 24.5)  # a long Logo block at a slow tempo
        self.assertEqual(finish.end_card_time({"dur": 30, "endCard": None}), 25.5)
        self.assertEqual(finish.end_card_time({"dur": 30}), 25.5)

    def test_a_skip_never_fails_the_report(self):
        report = finish.Report()
        with redirect_stdout(io.StringIO()) as out:
            report.line("a", (SKIP, "no decoder"))
            report.line("b", (PASS, "fine"))
            self.assertTrue(report.ok)
            report.line("c", (FAIL, "bad"))
        self.assertFalse(report.ok)
        self.assertEqual(out.getvalue().splitlines(), ["  SKIP  a: no decoder", "  PASS  b: fine", "  FAIL  c: bad"])


class HardwareDecodeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.ffmpeg = Path(self.tmp.name) / "ffmpeg"
        self.ffmpeg.write_text(FAKE_FFMPEG.format(python=sys.executable))
        self.ffmpeg.chmod(0o755)
        self.saved = dict(os.environ)
        self.addCleanup(lambda: (os.environ.clear(), os.environ.update(self.saved)))

    def test_skips_off_macos(self):
        status, detail = finish.hw_decode("x.mp4", system="Linux", ffmpeg=str(self.ffmpeg))
        self.assertEqual(status, SKIP)
        self.assertIn("macOS only", detail)

    def test_skips_without_videotoolbox(self):
        os.environ["FAKE_HWACCELS"] = "cuda\nvaapi"
        self.assertEqual(finish.hw_decode("x.mp4", system="Darwin", ffmpeg=str(self.ffmpeg))[0], SKIP)

    def test_passes_a_clean_decode_and_fails_on_errors(self):
        os.environ["FAKE_HWACCELS"] = "videotoolbox"
        self.assertEqual(finish.hw_decode("x.mp4", system="Darwin", ffmpeg=str(self.ffmpeg)), (PASS, "clean"))
        os.environ["FAKE_DECODE_ERROR"] = "[h264 @ 0x1] hardware does not support this profile"
        status, detail = finish.hw_decode("x.mp4", system="Darwin", ffmpeg=str(self.ffmpeg))
        self.assertEqual(status, FAIL)
        self.assertIn("does not support", detail)


def write_film_video(path, seconds, height, fps=60):
    """A panning texture scaled to height (16:9), H.264."""
    tex = media.texture(1400, 270, seed=21, blur=8)
    frames = media.pan(tex, int(seconds * fps), 480, 270, 2)
    enc = ["-vf", f"scale={height * 16 // 9}:{height}", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]
    return media.write_video(path, frames, fps, codec=enc)


def write_loud_wav(path, seconds, lufs=-14.0):
    x = media.noise_bed(seconds, 48000, rms=0.1)
    for _ in range(2):
        media.write_wav(path, x)
        err = subprocess.run(["ffmpeg", "-i", str(path), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
        measured = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", err)[-1])
        x = x * 10 ** ((lufs - measured) / 20)
    return path


class FinishRunTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        d = Path(cls.tmp.name)
        cls.dir = d
        cls.film = d / "film"
        cls.film.mkdir()
        cls.video = write_film_video(d / "video_1080.mp4", 2, 1080)
        cls.audio = write_loud_wav(d / "mix.wav", 2)
        cls.info = d / "info.json"
        cls.info.write_text(json.dumps({"title": "Test Film", "dur": 2, "fps": 60, "bpm": 120, "endCard": None}))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_finish(self, *args, info=None):
        cmd = [sys.executable, "-I", str(media.SCRIPTS / "finish.py"), str(self.film), "--info", str(info or self.info), *map(str, args)]
        return subprocess.run(cmd, capture_output=True, text=True)

    def test_makes_and_checks_every_deliverable(self):
        dest = self.dir / "final"
        r = self.run_finish("--video", self.video, "--audio", self.audio, "--dest", dest)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(sorted(p.name for p in dest.iterdir()), ["dynamism.json", "test-film_1080p60.mp4", "test-film_9x16.mp4"])
        self.assertEqual(media.ffprobe(dest / "test-film_9x16.mp4", "stream=width,height"), "1080,1920")
        out = r.stdout
        self.assertEqual(out.count("PASS  frames: 120 of 120"), 2)
        self.assertEqual(out.count("PASS  H.264 level: 4.2"), 2)
        self.assertEqual(out.count("PASS  loudness:"), 2)
        self.assertEqual(len(re.findall(r"(PASS|SKIP)  plays on the Mac hardware decoder", out)), 2)
        self.assertIn("PASS  holds longer than 0.6 s (end card excluded): none", out)
        self.assertIn("ALL CHECKS PASS", out)
        self.assertEqual(json.loads((dest / "dynamism.json").read_text())["summary"]["still_share"], 0.0)
        # a second run replaces the files: the check run and the master run share the folder
        r = self.run_finish("--video", self.video, "--dest", dest, "--no-vertical")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("loudness", r.stdout)

    def test_a_4k_master_after_the_1080_check(self):
        info = self.dir / "short.json"
        info.write_text(json.dumps({"title": "Short", "dur": 0.5, "fps": 60, "bpm": 120}))
        dest = self.dir / "flow"
        check = write_film_video(self.dir / "check_1080.mp4", 0.5, 1080)
        master = write_film_video(self.dir / "master_4k.mp4", 0.5, 2160)
        r = self.run_finish("--video", check, "--dest", dest, info=info)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        r = self.run_finish("--video", master, "--dest", dest, "--no-vertical", info=info)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(sorted(p.name for p in dest.glob("*.mp4")), ["short_1080p60.mp4", "short_4k60.mp4", "short_9x16.mp4"])
        self.assertEqual(media.ffprobe(dest / "short_4k60.mp4", "stream=height"), "2160")
        self.assertEqual(media.ffprobe(dest / "short_1080p60.mp4", "stream=height,level"), "1080,42")
        self.assertEqual(r.stdout.count("PASS  frames: 30 of 30"), 2)
        # the dynamism is measured on the 1080p version, the scale the motion threshold is set in
        self.assertTrue(json.loads((dest / "dynamism.json").read_text())["summary"]["src"].endswith("short_1080p60.mp4"))

    def test_a_1080p_master_is_measured_whatever_the_folder_is_called(self):
        # a folder or title holding "1080p" must not make the 9:16 version the measured file
        dest = self.dir / "renders_1080p" / "final"
        info = self.dir / "named.json"
        info.write_text(json.dumps({"title": "Promo 1080p", "dur": 0.5, "fps": 60, "bpm": 120}))
        video = write_film_video(self.dir / "named_1080.mp4", 0.5, 1080)
        r = self.run_finish("--video", video, "--dest", dest, info=info)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        src = json.loads((dest / "dynamism.json").read_text())["summary"]["src"]
        self.assertEqual(Path(src).name, "promo-1080p_1080p60.mp4")

    def test_a_1440p_master_also_gets_a_1080p_version(self):
        info = self.dir / "q.json"
        info.write_text(json.dumps({"title": "Q", "dur": 0.25, "fps": 60, "bpm": 120}))
        dest = self.dir / "q"
        r = self.run_finish("--video", write_film_video(self.dir / "q.mp4", 0.25, 1440), "--dest", dest, "--no-vertical", info=info)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(sorted(p.name for p in dest.glob("*.mp4")), ["q_1080p60.mp4", "q_1440p60.mp4"])

    def test_a_film_that_fails_the_gates(self):
        still = media.write_video(self.dir / "still.mp4", [np.full((270, 480, 3), 90, np.uint8)] * 120, 60, codec=["-vf", "scale=1920:1080", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"])
        info = self.dir / "long.json"
        info.write_text(json.dumps({"title": "Still", "dur": 2, "fps": 60, "bpm": 120, "endCard": 1.8}))
        r = self.run_finish("--video", still, "--dest", self.dir / "still", "--no-vertical", info=info)
        self.assertEqual(r.returncode, 1)
        self.assertIn("FAIL  still frames before the end card", r.stdout)
        self.assertIn("FAIL  median motion", r.stdout)
        self.assertIn("SOME CHECKS FAILED", r.stdout)

    def test_usage_and_a_bad_video(self):
        r = subprocess.run([sys.executable, "-I", str(media.SCRIPTS / "finish.py")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)
        self.assertIn("usage:", r.stderr)
        r = self.run_finish("--video", self.dir / "missing.mp4", "--dest", self.dir / "none")
        self.assertEqual(r.returncode, 1)
        self.assertIn("could not read", r.stderr)


if __name__ == "__main__":
    unittest.main()
