"""post.py, the render worker: the frame stream, motion blur, bloom, grain and the encode."""

import io
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

import fakes
import media

sys.path.insert(0, str(media.SCRIPTS))
import post  # noqa: E402


def png(value, w=32, h=18):
    return cv2.imencode(".png", np.full((h, w, 3), value, np.uint8))[1].tobytes()


def stream(frames):
    out = io.BytesIO()
    for k, samples in frames:
        out.write(struct.pack("<II", k, len(samples)))
        for s in samples:
            out.write(struct.pack("<I", len(s)) + s)
    return out.getvalue()


class PostUnitTest(unittest.TestCase):
    def test_read_frames(self):
        data = stream([(7, [png(0), png(100), png(200)]), (8, [png(50)])])
        frames = list(post.read_frames(io.BytesIO(data)))
        self.assertEqual([k for k, _ in frames], [7, 8])
        self.assertEqual([len(s) for _, s in frames], [3, 1])
        self.assertEqual(frames[0][1][2].shape, (18, 32, 3))
        self.assertEqual(frames[0][1][2].dtype, np.float32)
        self.assertEqual(frames[0][1][1][0, 0, 0], 100)

    def test_a_truncated_stream_stops(self):
        data = stream([(0, [png(10)]), (1, [png(20), png(30)])])
        frames = list(post.read_frames(io.BytesIO(data[:-5])))
        self.assertEqual([k for k, _ in frames], [0])

    def test_blend_is_the_mean(self):
        a, b = np.zeros((4, 4, 3), np.float32), np.full((4, 4, 3), 90, np.float32)
        np.testing.assert_array_equal(post.blend([a, a]), a)
        np.testing.assert_array_equal(post.blend([a, b, b]), np.full((4, 4, 3), 60, np.float32))

    def test_bloom_lights_only_bright_areas(self):
        dim = np.full((216, 384, 3), 175, np.float32)
        np.testing.assert_array_equal(post.bloom(dim, 0.5), dim)
        bright = np.zeros((216, 384, 3), np.float32)
        bright[90:126, 170:214] = 255
        out = post.bloom(bright, 0.5)
        self.assertGreater(out[108, 150, 0], 1)  # a halo beside the square
        self.assertEqual(out[0, 0, 0], 0)  # nothing far away

    def test_grain_is_seeded(self):
        a, b = post.grain_tiles(64, 36), post.grain_tiles(64, 36)
        self.assertEqual(len(a), 8)
        for x, y in zip(a, b):
            np.testing.assert_array_equal(x, y)
        self.assertFalse(np.array_equal(a[0], a[1]))
        other = subprocess.run(
            [sys.executable, "-c", f"import sys; sys.path.insert(0, {str(media.SCRIPTS)!r}); import post; print(float(post.grain_tiles(64, 36)[3].sum()))"],
            capture_output=True,
            text=True,
        )
        self.assertAlmostEqual(float(other.stdout), float(a[3].sum()), places=3)

    def test_finish_frame_with_and_without_grain(self):
        samples = [np.full((36, 64, 3), 100, np.float32)]
        tiles = post.grain_tiles(64, 36)
        clean = post.finish_frame(samples, 0, tiles, 1, grain=0)
        self.assertTrue((clean == 100).all())
        grainy = post.finish_frame(samples, 0, tiles, 1, grain=2.2)
        self.assertGreater(grainy.std(), 0.5)
        np.testing.assert_array_equal(grainy, post.finish_frame(samples, 8, tiles, 1, grain=2.2))  # 8 tiles cycle
        self.assertFalse(np.array_equal(grainy, post.finish_frame(samples, 1, tiles, 1, grain=2.2)))

    def test_master_encode_settings(self):
        def option(args, name):
            return args[args.index(name) + 1]

        uhd, hd = post.encoder_args(2160), post.encoder_args(1080)
        for args in (uhd, hd):
            self.assertEqual(option(args, "-c:v"), "libx264")
            self.assertEqual(option(args, "-crf"), "12.4")
            self.assertEqual(option(args, "-preset"), "slower")
        # Level 6 plays in ffmpeg and nowhere on a Mac
        self.assertEqual(option(uhd, "-level"), "5.2")
        self.assertEqual(option(hd, "-level"), "4.2")
        self.assertEqual(option(post.encoder_args(1440), "-level"), "4.2")


class PostRunTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.env = fakes.install(self.dir / "bin")
        self.env.update({"ENC": "-c:v libx264 -qp 0 -preset ultrafast", "GRAIN": "0"})

    def run_post(self, *args):
        cmd = [sys.executable, "-I", str(media.SCRIPTS / "post.py"), *map(str, args)]
        return subprocess.run(cmd, env=self.env, capture_output=True, text=True)

    def test_encodes_blended_frames(self):
        out = self.dir / "part.mp4"
        r = self.run_post(1 / 6, 10, 12, out, 60)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("2 frames (expected 2)", r.stdout)
        self.assertEqual(media.ffprobe(out, "stream=width,height"), "320,180")
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(out), "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
        frames = np.frombuffer(raw, np.uint8).reshape(-1, 180, 320)
        self.assertEqual(len(frames), 2)
        self.assertAlmostEqual(float(frames.mean()), 128, delta=3)  # black and white samples, blended

    def test_without_enc_the_master_settings_encode(self):
        del self.env["ENC"]
        out = self.dir / "default.mp4"
        r = self.run_post(1 / 6, 0, 2, out, 60)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(media.ffprobe(out, "stream=codec_name,level"), "h264,42")

    def test_a_frame_shortfall_fails(self):
        self.env["FAKE_NODE_FRAMES"] = "1"
        r = self.run_post(1 / 6, 0, 3, self.dir / "short.mp4")
        self.assertEqual(r.returncode, 1)
        self.assertIn("1 frames (expected 3)", r.stdout)

    def test_usage(self):
        r = self.run_post()
        self.assertEqual(r.returncode, 1)
        self.assertIn("post.py <dsf> <frame0> <frame1> <out.mp4>", r.stderr)


if __name__ == "__main__":
    unittest.main()
