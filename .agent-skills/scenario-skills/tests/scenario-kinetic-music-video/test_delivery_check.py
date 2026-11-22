"""delivery_check.py: every gate passes on a well-formed file and fails on the defect it names, run as an agent runs it."""

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video" / "scripts" / "delivery_check.py"
spec = importlib.util.spec_from_file_location("delivery_check", SCRIPT)
dc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dc)


def check(path, *args):
    r = subprocess.run([sys.executable, str(SCRIPT), str(path), *args], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr


def line(out, name):
    return next((ln for ln in out.splitlines() if ln.split(" ", 1)[-1].startswith(name + ":")), "")


def ff(*args):
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr)


class Fixtures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        d = cls.d = Path(cls.tmp.name)
        video = ["-f", "lavfi", "-i", "testsrc2=s=64x36:r=60"]
        audio = ["-f", "lavfi", "-i", "sine=f=440:d=1", "-shortest", "-c:a", "aac"]
        x264 = ["-frames:v", "10", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p"]
        ff(*video, *audio, *x264, "-movflags", "+faststart", str(d / "good.mp4"))
        ff(*video, *x264, "-movflags", "+faststart", str(d / "silent.mp4"))
        ff("-i", str(d / "silent.mp4"), "-f", "lavfi", "-i", "sine=f=440:d=1", "-c:v", "copy", "-c:a", "aac",
           "-movflags", "+faststart", str(d / "long_audio.mp4"))
        ff(*video, *audio, *x264, str(d / "tail_moov.mp4"))
        ten = ["-frames:v", "10"]
        ff(*video, *audio, *ten, "-c:v", "libx264", "-pix_fmt", "yuv444p", "-movflags", "+faststart", str(d / "444.mp4"))
        ff(*video, *audio, *ten, "-c:v", "mpeg4", "-movflags", "+faststart", str(d / "mpeg4.mp4"))
        # the way render.mjs makes a master: canvas JPEGs through image2pipe, then a mux with the song and faststart
        ff(*video, *ten, "-c:v", "mjpeg", "-f", "image2pipe", str(d / "frames.mjpeg"))
        ff("-f", "image2pipe", "-framerate", "60", "-c:v", "mjpeg", "-i", str(d / "frames.mjpeg"), *x264, "-r", "60",
           str(d / "chunk.mp4"))
        ff("-i", str(d / "chunk.mp4"), "-f", "lavfi", "-i", "sine=f=440:d=5", "-map", "0:v", "-map", "1:a", "-af", "apad",
           "-shortest", "-c:a", "aac", "-c:v", "copy", "-movflags", "+faststart", str(d / "render.mp4"))
        big = ["-f", "lavfi", "-i", "testsrc2=s=2048x1152:r=60", "-frames:v", "2", "-c:v", "libx264", "-pix_fmt",
               "yuv420p"]
        ff(*big, "-level", "5.2", "-movflags", "+faststart", str(d / "big52.mp4"))
        ff(*big, "-level", "4.2", "-movflags", "+faststart", str(d / "big42.mp4"))
        long = ["-f", "lavfi", "-i", "testsrc2=s=128x72:r=60", *x264, "-frames:v", "120"]
        ff(*long, "-movflags", "+faststart", str(d / "long.mp4"))
        ff(*long, str(d / "long_tail_moov.mp4"))
        for name in ("long.mp4", "long_tail_moov.mp4"):
            data = (d / name).read_bytes()
            (d / f"cut_{name}").write_bytes(data[: int(len(data) * 0.6)])

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def level_fixture(self, name, size, level):
        """A clip signaling `level`, or a skip when this x264 cannot write it."""
        out = self.d / name
        try:
            ff("-f", "lavfi", "-i", f"testsrc2=s={size}:r=60", "-frames:v", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
               "-level", level, "-an", str(out))
        except RuntimeError as e:
            self.skipTest(f"x264 refused -level {level}: {e}")
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=level", "-of", "csv=p=0", str(out)],
                               capture_output=True, text=True).stdout.strip()
        if probe != str(round(float(level) * 10)):
            self.skipTest(f"x264 wrote level {probe} for -level {level}")
        return out

    def test_usage_without_arguments(self):
        r = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_well_formed_file_passes(self):
        code, out, _ = check(self.d / "good.mp4", "--frames", "10")
        self.assertEqual(code, 0, out)
        self.assertIn("ALL CHECKS PASS", out)
        self.assertIn("INFO file size", out)
        self.assertTrue(line(out, "peak bitrate").startswith("PASS"), out)

    def test_render_master_passes(self):
        # full-range JPEG input probes as yuvj420p on some ffmpeg versions; both are 8-bit 4:2:0
        code, out, _ = check(self.d / "render.mp4", "--frames", "10")
        self.assertEqual(code, 0, out)
        self.assertRegex(line(out, "pixel format"), r"^PASS pixel format: yuvj?420p$")

    def test_frame_count_mismatch_fails(self):
        code, out, _ = check(self.d / "good.mp4", "--frames", "11")
        self.assertEqual(code, 1)
        self.assertTrue(line(out, "frames").startswith("FAIL"), out)
        self.assertIn("SOME CHECKS FAILED", out)

    def test_missing_audio_fails_unless_silence_is_asked_for(self):
        code, out, _ = check(self.d / "silent.mp4")
        self.assertEqual(code, 1)
        self.assertTrue(line(out, "audio").startswith("FAIL"), out)
        code, out, _ = check(self.d / "silent.mp4", "--no-audio")
        self.assertEqual(code, 0, out)

    def test_audio_that_outlasts_the_picture_fails(self):
        code, out, _ = check(self.d / "long_audio.mp4")
        self.assertEqual(code, 1)
        self.assertTrue(line(out, "audio").startswith("FAIL"), out)

    def test_moov_after_mdat_fails_faststart(self):
        code, out, _ = check(self.d / "tail_moov.mp4")
        self.assertEqual(code, 1)
        self.assertTrue(line(out, "faststart").startswith("FAIL"), out)

    def test_444_and_mpeg4_fail(self):
        code, out, _ = check(self.d / "444.mp4")
        self.assertEqual(code, 1)
        self.assertTrue(line(out, "pixel format").startswith("FAIL"), out)
        code, out, _ = check(self.d / "mpeg4.mp4")
        self.assertEqual(code, 1)
        self.assertTrue(line(out, "codec").startswith("FAIL"), out)

    def test_level_above_the_cap_fails(self):
        code, out, _ = check(self.level_fixture("l60.mp4", "64x36", "6.0"), "--no-audio")
        self.assertEqual(code, 1)
        self.assertTrue(line(out, "level").startswith("FAIL"), out)

    def test_4k_class_frames_may_signal_5_2_but_not_6(self):
        code, out, _ = check(self.d / "big52.mp4", "--no-audio")
        self.assertEqual(code, 0, out)
        code, out, _ = check(self.level_fixture("big60.mp4", "2048x1152", "6.0"), "--no-audio")
        self.assertTrue(line(out, "level").startswith("FAIL"), out)

    def test_level_too_low_for_the_frame_fails(self):
        # x264 writes whatever -level says, so a 4K-class encode pinned to 4.2 is mislabeled
        code, out, _ = check(self.d / "big42.mp4", "--no-audio")
        self.assertEqual(code, 1)
        self.assertTrue(line(out, "level").startswith("FAIL"), out)

    def test_truncated_file_fails_the_decode(self):
        code, out, _ = check(self.d / "cut_long.mp4", "--no-audio")
        self.assertEqual(code, 1)
        self.assertTrue(line(out, "decode").startswith("FAIL"), out)

    def test_file_without_moov_fails_without_a_traceback(self):
        code, out, err = check(self.d / "cut_long_tail_moov.mp4", "--no-audio")
        self.assertEqual(code, 1)
        self.assertIn("FAIL probe", out)
        self.assertNotIn("Traceback", err)

    def test_size_cap(self):
        code, out, _ = check(self.d / "good.mp4", "--max-mb", "0.001")
        self.assertEqual(code, 1)
        self.assertTrue(line(out, "file size").startswith("FAIL"), out)

    def test_peak_bitrate_over_the_level_warns_and_still_passes(self):
        # noise at crf 1 runs past Level 1's 80 kb/s; a frame this small may signal Level 1, so only the WARN fires
        path = self.d / "busy.mp4"
        ff("-f", "lavfi", "-i", "testsrc2=s=64x36:r=60", "-vf", "noise=alls=100:allf=t", "-frames:v", "60", "-c:v",
           "libx264", "-crf", "1", "-pix_fmt", "yuv420p", "-level", "1", "-movflags", "+faststart", str(path))
        code, out, _ = check(path, "--no-audio", "--frames", "60")
        if not line(out, "level").startswith("PASS level: 1 "):
            self.skipTest(f"x264 did not write Level 1: {line(out, 'level')}")
        self.assertTrue(line(out, "peak bitrate").startswith("WARN peak bitrate"), out)
        self.assertEqual(code, 0, out)
        self.assertIn("ALL CHECKS PASS", out)


class Helpers(unittest.TestCase):
    def test_level_cap_by_frame_size(self):
        self.assertEqual(dc.level_cap(1920, 1080), 42)
        self.assertEqual(dc.level_cap(1080, 1920), 42)
        self.assertEqual(dc.level_cap(2048, 1088), 42)
        self.assertEqual(dc.level_cap(2048, 1152), 52)
        self.assertEqual(dc.level_cap(3840, 2160), 52)

    def test_level_floor_by_size_and_rate(self):
        self.assertEqual(dc.level_floor(1920, 1080, 60), 42)
        self.assertEqual(dc.level_floor(1920, 1080, 30), 40)
        self.assertEqual(dc.level_floor(3840, 2160, 60), 52)
        self.assertEqual(dc.level_floor(3840, 2160, 30), 51)

    def test_level_floor_holds_each_side(self):
        # 5000x256 fits Level 3.2 by area and rate, but its 313-macroblock side needs a frame size of 12247
        self.assertEqual(dc.level_floor(5000, 256, 30), 50)
        self.assertEqual(dc.level_floor(256, 5000, 30), 50)

    def test_max_bitrate_scales_for_high(self):
        self.assertEqual(dc.max_br_kbps(42, "High"), 62500)
        self.assertEqual(dc.max_br_kbps(52, "Main"), 240000)
        self.assertIsNone(dc.max_br_kbps(99, "High"))

    def test_peak_counts_the_busiest_second(self):
        packets = [(i / 8, 1000) for i in range(24)] + [(1.5, 100000)]  # eighths of a second are exact floats
        self.assertAlmostEqual(dc.peak_mbps(packets), (8 * 1000 + 100000) * 8 / 1e6)


if __name__ == "__main__":
    unittest.main()
