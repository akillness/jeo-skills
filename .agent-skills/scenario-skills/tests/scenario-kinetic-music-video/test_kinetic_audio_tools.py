"""The audio-side checks on synthetic media: A/V sync, lip sync, the lyric plots, and audio_analysis.py's stem and
checkpoint gates. librosa, MediaPipe, matplotlib, beat_this and Demucs are fakes (kinetic_host_stubs): the fake
librosa decodes and measures RMS for real, so the lag searches and selections under test see true signals."""

import json
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np
import soundfile as sf

import kinetic_host_stubs

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video" / "scripts"
FFMPEG = bool(shutil.which("ffmpeg"))


def run(script, *args, cwd, env):
    return subprocess.run(
        [sys.executable, str(SCRIPTS / script), *args], cwd=cwd, capture_output=True, text=True, env=env
    )


class Workdir(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.cwd = Path(tmp.name)
        self.env = kinetic_host_stubs.install(self.cwd / "_stubs")
        (self.cwd / "engine" / "data").mkdir(parents=True)

    def write_json(self, rel, obj):
        p = self.cwd / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(obj), encoding="utf-8")


@unittest.skipUnless(FFMPEG, "needs ffmpeg")
class AvSyncCheckTest(Workdir):
    def render(self, t0, audio_late_ms, picture_late_frames):
        sr, fps, dur = 8000, 30, 4.0
        rng = np.random.default_rng(1)
        master = (rng.standard_normal(int(8 * sr)) * 0.3).astype(np.float32)
        sf.write(self.cwd / "master.wav", master, sr, subtype="FLOAT")
        events = [1.2, 1.9, 2.7, 3.3, 4.1]
        self.write_json(
            "engine/data/audio.json",
            {"master": "master.wav", "kicks": events[::2], "snares": events[1::2], "downbeats": [0.3, 9.0]},
        )
        part = master[int(t0 * sr):int((t0 + dur) * sr)]
        late = int(audio_late_ms * sr / 1000)
        sf.write(self.cwd / "a.wav", np.concatenate([np.zeros(late, np.float32), part])[: len(part)], sr, subtype="FLOAT")
        bright = {round((x - t0) * fps) + picture_late_frames for x in events + [0.3] if t0 <= x < t0 + dur}
        w = cv2.VideoWriter(str(self.cwd / "v.avi"), cv2.VideoWriter_fourcc(*"MJPG"), fps, (96, 64))
        for i in range(int(dur * fps)):
            w.write(np.full((64, 96, 3), 230 if i in bright else 30, np.uint8))
        w.release()
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", "v.avi", "-i", "a.wav", "-c:v", "copy", "-c:a", "pcm_f32le", "out.mkv"],
            cwd=self.cwd,
            check=True,
        )

    def check(self, *args):
        r = run("av_sync_check.py", "out.mkv", *args, cwd=self.cwd, env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        audio = re.search(r"audio offset vs master: ([-+][\d.]+) ms", r.stdout)
        visual = re.search(r"best lag ([-+]\d+) frames", r.stdout)
        self.assertIsNotNone(audio, r.stdout)
        self.assertIsNotNone(visual, r.stdout)
        self.assertEqual(len(re.findall(r"[-+]\d:-?[\d.]+", r.stdout.split("per-lag:")[1])), 13)
        return float(audio.group(1)), int(visual.group(1))

    def test_usage_without_arguments(self):
        r = run("av_sync_check.py", cwd=self.cwd, env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_in_sync_render_reads_zero(self):
        self.render(0.0, 0, 0)
        self.assertEqual(self.check(), (0.0, 0))

    def test_late_audio_and_late_picture_read_as_such(self):
        self.render(0.5, 20, 1)
        self.assertEqual(self.check("0.5"), (20.0, 1))


class LipsyncCheckTest(Workdir):
    def make(self, mouth_late):
        fps, n, sr = 25, 100, 16000
        hop = sr // fps
        rng = np.random.default_rng(3)
        env = np.convolve(rng.random(n + 10), np.ones(3) / 3, "same")[: n + 10]
        env = 0.2 + 0.8 * (env - env.min()) / (env.max() - env.min())
        mouth = env[5 - mouth_late:5 - mouth_late + n]
        dark = {40, 41}  # no face found on these frames
        w = cv2.VideoWriter(str(self.cwd / "clip.avi"), cv2.VideoWriter_fourcc(*"MJPG"), fps, (64, 64))
        for i in range(n):
            w.write(np.full((64, 64, 3), 0 if i in dark else int(30 + 200 * mouth[i]), np.uint8))
        w.release()
        # Each frame's amplitude is centered on its RMS window, so the envelope is not shifted by half a frame.
        amp = np.repeat(env[5:5 + n], hop)
        amp = np.concatenate([amp[hop // 2:], np.full(hop // 2, amp[-1])])
        sf.write(self.cwd / "vocal.wav", (rng.standard_normal(n * hop) * amp * 0.3).astype(np.float32), sr)

    def test_usage_without_arguments(self):
        r = run("lipsync_check.py", "clip.avi", cwd=self.cwd, env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_refuses_to_write_the_plot_over_an_input(self):
        r = run("lipsync_check.py", "clip.avi", "vocal.wav", "vocal.wav", cwd=self.cwd, env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("must not be one of the inputs", r.stderr)

    def test_late_mouth_reads_a_positive_lag(self):
        self.make(3)
        r = run("lipsync_check.py", "clip.avi", "vocal.wav", "plot.png", cwd=self.cwd, env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        m = re.search(r"frames=(\d+) fps=([\d.]+) face_found=([\d.]+) corr@0=([-\d.]+) best_lag=([-+\d]+)ms", r.stdout)
        self.assertIsNotNone(m, r.stdout)
        self.assertEqual((m.group(1), m.group(2), m.group(3)), ("100", "25.00", "0.98"))
        self.assertEqual(int(m.group(5)), 120)
        self.assertLess(float(m.group(4)), 0.5)
        drawn = json.loads((self.cwd / "plot.png").read_text(encoding="utf-8"))
        self.assertEqual([c[0] for c in drawn[1]], ["plot", "set_xlabel"])
        self.assertEqual(drawn[1][0][1][0], [lag / 25 * 1000 for lag in range(-10, 11)])


class PlotLyricsTest(Workdir):
    def setUp(self):
        super().setUp()
        self.write_json(
            "engine/data/audio.json",
            {
                "master": "audio/master.mp3",
                "env_fps": 60,
                "env": {"vocal": [0.5] * 600},
                "vocal_onsets": [0.9, 1.2, 2.5, 6.0],
                "beats": [1.0, 2.0, 3.0, 6.5],
            },
        )
        self.write_json(
            "engine/data/lyrics.json",
            {
                "lines": [
                    {"words": [{"w": "hello", "s": 1.1}, {"w": "there", "s": 2.4}]},
                    {"words": [{"w": "late", "s": 4.0}, {"w": "again", "s": 5.6}]},
                ]
            },
        )
        stem = self.cwd / "stems" / "htdemucs" / "master"
        stem.mkdir(parents=True)
        sf.write(stem / "vocals.wav", np.zeros(22050 * 10, np.float32), 22050)

    def test_usage_without_ranges(self):
        r = run("plot_lyrics.py", cwd=self.cwd, env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_marks_only_the_words_onsets_and_beats_in_each_range(self):
        r = run("plot_lyrics.py", "1:3", "5.5:7", cwd=self.cwd, env=self.env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.split(), ["analysis/plots/lyrics_1.png", "analysis/plots/lyrics_5.5.png"])

        def marks(path):
            spec, env = json.loads((self.cwd / path).read_text(encoding="utf-8"))
            words = [c[1][0] for c in spec if c[0] == "text"]
            starts = [c[1][0] for c in spec if c[0] == "axvline"]
            onsets = [c[1][0] for c in env if c[0] == "axvline" and c[2]["color"] == "green"]
            beats = [c[1][0] for c in env if c[0] == "axvline" and c[2]["color"] == "gray"]
            (imshow,) = [c for c in spec if c[0] == "imshow"]
            (plot,) = [c for c in env if c[0] == "plot"]
            return words, starts, onsets, beats, imshow[2]["extent"][:2], (plot[1][0][0], plot[1][0][-1])

        words, starts, onsets, beats, extent, span = marks("analysis/plots/lyrics_1.png")
        self.assertEqual((words, starts, onsets, beats, extent), ([1.1, 2.4], [1.1, 2.4], [1.2, 2.5], [1.0, 2.0, 3.0], [1, 3]))
        self.assertEqual(span, (1.0, 3.0))
        words, starts, onsets, beats, extent, span = marks("analysis/plots/lyrics_5.5.png")
        self.assertEqual((starts, onsets, beats, extent), ([5.6], [6.0], [6.5], [5.5, 7]))
        self.assertEqual(span[0], 5.5)
        self.assertLessEqual(span[1], 7.0)


class AudioAnalysisTest(Workdir):
    def setUp(self):
        super().setUp()
        (self.cwd / "audio").mkdir()
        (self.cwd / "audio" / "master.mp3").write_bytes(b"not decoded before the gates")

    def stems(self):
        d = self.cwd / "stems" / "htdemucs" / "master"
        d.mkdir(parents=True)
        for stem in ("vocals.wav", "no_vocals.wav"):
            (d / stem).write_bytes(b"")

    def test_usage_without_arguments(self):
        r = run("audio_analysis.py", cwd=self.cwd, env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_a_checkpoint_with_the_wrong_checksum_is_removed(self):
        self.stems()
        ckpt = self.cwd / "models" / "beat_this-final0.ckpt"
        ckpt.parent.mkdir()
        ckpt.write_bytes(b"tampered")
        r = run("audio_analysis.py", "audio/master.mp3", cwd=self.cwd, env=self.env)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Checksum mismatch for the beat_this checkpoint", r.stderr)
        self.assertFalse(ckpt.exists())
        self.assertFalse((self.cwd / "demucs_args.json").exists())
        self.assertEqual((self.cwd / "audio" / "master.mp3").read_bytes(), b"not decoded before the gates")

    def test_missing_stems_run_demucs_and_a_failed_download_leaves_no_checkpoint(self):
        # The proxy is a port held bound but never listening, so the download is refused at once and no other
        # process can take the port and leave urlretrieve (which has no timeout) waiting.
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            env = dict(self.env)
            for k in ("no_proxy", "NO_PROXY"):
                env.pop(k, None)
            for k in ("https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY"):
                env[k] = f"http://127.0.0.1:{s.getsockname()[1]}"
            r = run("audio_analysis.py", "audio/master.mp3", cwd=self.cwd, env=env)
        args = json.loads((self.cwd / "demucs_args.json").read_text(encoding="utf-8"))
        self.assertEqual(args, ["--two-stems=vocals", "-n", "htdemucs", "-o", "stems", "audio/master.mp3"])
        self.assertTrue((self.cwd / "stems" / "htdemucs" / "master" / "vocals.wav").exists())
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("URLError", r.stderr)
        self.assertEqual(sorted(p.name for p in (self.cwd / "models").iterdir()), [])


if __name__ == "__main__":
    unittest.main()
