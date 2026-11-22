"""The clip tools on synthetic frame sequences: beat warping, dance sync, matte repair, tracking, the MediaPipe matte
fallback, and frame prep. MediaPipe is a fake (kinetic_host_stubs) where a script imports it; the math downstream of
it is what these tests check."""

import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

import kinetic_host_stubs

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video" / "scripts"
FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def run(script, *args, cwd, env=None):
    return subprocess.run(
        [sys.executable, str(SCRIPTS / script), *args], cwd=cwd, capture_output=True, text=True, env=env
    )


class Workdir(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.cwd = Path(tmp.name)
        self.env = kinetic_host_stubs.install(self.cwd / "_stubs")

    def clip(self, name="take"):
        d = self.cwd / "assets" / "video" / name
        d.mkdir(parents=True, exist_ok=True)
        return d

    def audio(self, **events):
        (self.cwd / "engine" / "data").mkdir(parents=True, exist_ok=True)
        data = {"kicks": [], "snares": [], "beats": [], "downbeats": [], **events}
        (self.cwd / "engine" / "data" / "audio.json").write_text(json.dumps(data), encoding="utf-8")


def flash_video(path, fps, n, bright_frames, size=(96, 64)):
    w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, size)
    for i in range(n):
        w.write(np.full((size[1], size[0], 3), 230 if i in bright_frames else 30, np.uint8))
    w.release()


class BeatwarpTest(Workdir):
    def test_usage_without_arguments(self):
        r = run("beatwarp.py", "take", cwd=self.cwd)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_anchors_motion_peaks_to_nearby_events_within_the_slope_clamp(self):
        fps, n, slot = 30, 90, 10.0
        d = self.clip()
        # Motion peaks at clip times 0.5, 0.733, 1.5, 1.8, 2.5 and 2.8 s: frame k + 1 differs from its neighbors.
        peaks = {15, 22, 45, 54, 75, 84}
        for i in range(1, n + 1):
            v = 255 if i - 1 in peaks else 0
            cv2.imwrite(str(d / f"f_{i:05d}.jpg"), np.full((90, 160, 3), v, np.uint8))
        (d / "meta.json").write_text(json.dumps({"fps": fps, "n": n, "ext": "jpg"}), encoding="utf-8")
        # Each skipped pair fails one rule only: 0.74 sits 0.19 s after the 0.55 anchor (slope 1.23), 1.95 needs a
        # slope of 0.6, and 2.72 needs 1.36. The events before and after the slot are not the clip's.
        self.audio(
            kicks=[9.0, slot + 0.55, slot + 1.45],
            snares=[slot + 0.74, slot + 1.95, slot + 2.72],
            beats=[slot + 2.5, slot + 3.5],
        )
        r = run("beatwarp.py", "take", str(slot), cwd=self.cwd)
        self.assertEqual(r.returncode, 0, r.stderr)
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["warp"], [[0.0, 0.0], [0.55, 0.5], [1.45, 1.5], [2.5, 2.5], [3.0, 3.0]])
        self.assertEqual(meta["fps"], fps)
        self.assertIn("take: 6 motion peaks, 6 matched, 3 anchors, shifts ms: [-50, 50, 0]", r.stdout)


class DanceSyncCheckTest(Workdir):
    def report(self, late_frames):
        fps, slot = 30, 4.0
        times = [0.5, 1.1, 1.8, 2.3, 3.0, 3.4]
        bright = {round(t * fps) + late_frames for t in times}
        flash_video(self.cwd / "dance.avi", fps, 120, bright)
        self.audio(kicks=[slot + t for t in times[::2]] + [1.0], snares=[slot + t for t in times[1::2]] + [99.0])
        r = run("dance_sync_check.py", "dance.avi", str(slot), cwd=self.cwd)
        self.assertEqual(r.returncode, 0, r.stderr)
        m = re.search(r"fps=([\d.]+) corr@0=([-\d.]+) best_lag=([-+\d]+)ms corr@best=([-\d.]+)", r.stdout)
        self.assertIsNotNone(m, r.stdout)
        return float(m.group(1)), float(m.group(2)), int(m.group(3)), float(m.group(4))

    def test_usage_without_arguments(self):
        r = run("dance_sync_check.py", "dance.avi", cwd=self.cwd)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_motion_on_the_beat_has_no_lag(self):
        fps, c0, lag, corr_best = self.report(0)
        self.assertEqual(fps, 30.0)
        self.assertEqual(lag, 0)
        self.assertGreater(c0, 0.5)
        self.assertEqual(c0, corr_best)

    def test_late_motion_reports_a_positive_lag(self):
        _, c0, lag, corr_best = self.report(2)
        self.assertEqual(lag, 67)
        self.assertGreater(corr_best, c0)


class FixmatteTest(Workdir):
    def frames(self, backdrop, subject, vision, vision_size=None):
        d = self.clip()
        for i in (1, 2):
            im = np.full((96, 160, 3), backdrop, np.uint8)
            im[30:70, 60:100] = subject
            cv2.imwrite(str(d / f"f_{i:05d}.jpg"), im, [cv2.IMWRITE_JPEG_QUALITY, 98])
            v = np.full((96, 160) if vision_size is None else vision_size[::-1], vision, np.uint8)
            cv2.imwrite(str(d / f"m_{i:05d}.png"), v)
        return d

    def test_usage_without_arguments(self):
        r = run("fixmatte.py", cwd=self.cwd)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_chroma_key_adds_the_subject_the_vision_matte_missed(self):
        d = self.frames(backdrop=(40, 200, 40), subject=(128, 128, 128), vision=0, vision_size=(80, 48))
        r = run("fixmatte.py", "take", cwd=self.cwd)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertRegex(r.stdout, r"take bg \[\s*40\s+200\s+40\] 2")
        m = cv2.imread(str(d / "m_00001.png"), cv2.IMREAD_GRAYSCALE)
        self.assertEqual(m.shape, (96, 160))
        self.assertGreater(m[50, 80], 240)
        self.assertLess(m[5, 5], 10)
        backup = cv2.imread(str(d / "m_vision" / "m_00001.png"), cv2.IMREAD_GRAYSCALE)
        self.assertEqual(backup.shape, (48, 80))
        self.assertEqual(int(backup.max()), 0)
        # A rerun reads the backed-up Vision matte, never its own output.
        again = run("fixmatte.py", "take", cwd=self.cwd)
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertEqual(int(cv2.imread(str(d / "m_vision" / "m_00001.png"), cv2.IMREAD_GRAYSCALE).max()), 0)

    def test_white_cyc_drops_vision_matte_on_the_backdrop(self):
        d = self.frames(backdrop=(245, 245, 245), subject=(60, 60, 60), vision=255)
        r = run("fixmatte.py", "take", "--white", cwd=self.cwd)
        self.assertEqual(r.returncode, 0, r.stderr)
        m = cv2.imread(str(d / "m_00002.png"), cv2.IMREAD_GRAYSCALE)
        self.assertGreater(m[50, 80], 240)
        self.assertLess(m[5, 5], 10)


class TrackTest(Workdir):
    def test_usage_without_arguments(self):
        r = run("track.py", cwd=self.cwd, env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_matte_box_centroid_area_and_top_per_frame(self):
        d = self.clip()
        for i, v in ((1, 200), (2, 20), (3, 200)):
            cv2.imwrite(str(d / f"f_{i:05d}.jpg"), np.full((96, 160, 3), v, np.uint8))
        m = np.zeros((96, 160), np.uint8)
        m[24:72, 40:80] = 255
        cv2.imwrite(str(d / "m_00001.png"), m)
        cv2.imwrite(str(d / "m_00002.png"), np.zeros((96, 160), np.uint8))
        (d / "meta.json").write_text(json.dumps({"fps": 30, "n": 3}), encoding="utf-8")
        r = run("track.py", "take", cwd=self.cwd, env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("take tracked 3 pose frames 2", r.stdout)
        tr = json.loads((d / "track.json").read_text(encoding="utf-8"))
        self.assertEqual(len(tr), 3)
        first = tr[0]
        # At quarter size the matte spans columns 10-19 of 40 and rows 6-17 of 24.
        self.assertEqual(first["box"], [0.25, 0.25, 0.475, 0.7083])
        self.assertEqual(first["c"], [0.3625, 0.4792])
        self.assertEqual(first["a"], 0.125)
        self.assertEqual(first["top"], [0.25, 0.25])
        self.assertEqual(len(first["pose"]), 33)
        self.assertEqual(first["pose"][0], [0.0123, round(200 / 255, 4), 0.99])
        # An empty matte and a missing one add no matte fields; a frame without a body has no pose.
        self.assertEqual(tr[1], {"pose": None})
        self.assertEqual(set(tr[2]), {"pose"})
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta, {"fps": 30, "n": 3, "track": True})


class MatteFallbackTest(Workdir):
    def test_usage_without_arguments(self):
        r = run("matte_fallback.py", cwd=self.cwd, env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_mask_is_ramped_blurred_and_carried_into_the_next_frame(self):
        for name in ("a", "b"):
            d = self.clip(name)
            first = np.zeros((64, 96, 3), np.uint8)
            first[:, :48] = (0, 0, 255)  # red, BGR: the fake segmenter reads the red channel
            cv2.imwrite(str(d / "f_00001.jpg"), first, [cv2.IMWRITE_JPEG_QUALITY, 100])
            cv2.imwrite(str(d / "f_00002.jpg"), np.zeros((64, 96, 3), np.uint8))
            (d / "meta.json").write_text(json.dumps({"fps": 24, "n": 2}), encoding="utf-8")
        r = run("matte_fallback.py", "a", "b", cwd=self.cwd, env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.split(), ["a", "2", "b", "2"])
        for name in ("a", "b"):
            d = self.clip(name)
            m1 = cv2.imread(str(d / "m_00001.png"), cv2.IMREAD_GRAYSCALE)
            m2 = cv2.imread(str(d / "m_00002.png"), cv2.IMREAD_GRAYSCALE)
            self.assertGreaterEqual(m1[32, 10], 250)
            self.assertEqual(m1[32, 85], 0)
            # The second frame segments nothing, so it keeps a quarter of the first frame's mask.
            self.assertAlmostEqual(int(m2[32, 10]), 63, delta=2)
            self.assertEqual(m2[32, 85], 0)
            self.assertEqual(json.loads((d / "meta.json").read_text(encoding="utf-8")), {"fps": 24, "n": 2, "mask": True})


@unittest.skipUnless(FFMPEG, "needs ffmpeg and ffprobe")
class PrepVideoTest(Workdir):
    def setUp(self):
        super().setUp()
        subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=1",
             "-pix_fmt", "yuv420p", str(self.cwd / "in.mp4")],
            check=True,
        )

    def test_frames_meta_and_stale_files_dropped(self):
        d = self.clip()
        for stale in ("f_00099.jpg", "m_00001.png"):
            (d / stale).write_bytes(b"old")
        (d / "m_vision").mkdir()
        (d / "m_vision" / "m_00001.png").write_bytes(b"old")
        (d / "notes.txt").write_text("keep", encoding="utf-8")
        r = run("prep_video.py", "in.mp4", "take", "--fps", "10", "--width", "160", cwd=self.cwd)
        self.assertEqual(r.returncode, 0, r.stderr)
        names = sorted(p.name for p in d.iterdir())
        self.assertEqual(names, [f"f_{i:05d}.jpg" for i in range(1, 11)] + ["meta.json", "notes.txt"])
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(
            {k: meta[k] for k in ("fps", "n", "w", "h", "dur", "ext", "src", "src_fps")},
            {"fps": 10.0, "n": 10, "w": 160, "h": 120, "dur": 1.0, "ext": "jpg", "src": "in.mp4", "src_fps": "25/1"},
        )
        self.assertTrue(0 <= meta["lumLo"] < meta["lumHi"] <= 1)
        self.assertNotIn("pose", meta)

    def test_pose_writes_one_entry_per_frame(self):
        # Half a second of white, then half of black: the fake finds a body on bright frames only.
        subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=white:size=128x96:rate=10:duration=0.5",
             "-f", "lavfi", "-i", "color=c=black:size=128x96:rate=10:duration=0.5",
             "-filter_complex", "[0:v][1:v]concat=n=2:v=1", "-pix_fmt", "yuv420p", str(self.cwd / "pose.mp4")],
            check=True,
        )
        r = run("prep_video.py", "pose.mp4", "take", "--fps", "10", "--width", "64", "--pose", cwd=self.cwd, env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        d = self.clip()
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        self.assertTrue(meta["pose"])
        self.assertEqual((meta["w"], meta["h"], meta["n"]), (64, 48, 10))
        pose = json.loads((d / "pose.json").read_text(encoding="utf-8"))
        self.assertEqual(len(pose), 10)
        self.assertEqual([p is None for p in pose], [False] * 5 + [True] * 5)
        self.assertEqual(len(pose[0]), 33)
        self.assertEqual((pose[0][0][0], pose[0][0][2]), (0.0123, 0.988))


if __name__ == "__main__":
    unittest.main()
