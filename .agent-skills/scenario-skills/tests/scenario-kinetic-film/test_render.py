"""render.py: the worker plan, the frame split, and a whole render with a stand-in browser."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import fakes
import media

sys.path.insert(0, str(media.SCRIPTS))
import render  # noqa: E402

INFO = {"title": "Test Film", "dur": 0.1, "fps": 60, "bpm": 120, "cuts": [0], "cues": [], "endCard": None}


class PlanTest(unittest.TestCase):
    def test_plan_workers(self):
        self.assertEqual(render.plan_workers("4k", 36, 12), 3)
        self.assertEqual(render.plan_workers("4k", 16, 12), 1)
        self.assertEqual(render.plan_workers("4k", 128, 64), 3)  # the 4K cap
        self.assertEqual(render.plan_workers("1080", 64, 12), 4)  # CPUs: 3 each
        self.assertEqual(render.plan_workers("1080", 64, 2), 1)  # always at least one
        self.assertEqual(render.plan_workers("720", 8, 24), 2)  # memory: 3 GB each

    def test_split_frames_covers_every_frame_once(self):
        for f0, f1, n in ((0, 100, 3), (0, 2, 3), (10, 20, 1), (5, 6, 4), (0, 1426, 6)):
            with self.subTest(f0=f0, f1=f1, n=n):
                chunks = render.split_frames(f0, f1, n)
                self.assertLessEqual(len(chunks), n)
                self.assertTrue(all(s < e for s, e in chunks))
                self.assertEqual([f for s, e in chunks for f in range(s, e)], list(range(f0, f1)))
        self.assertEqual(len(render.split_frames(0, 2, 3)), 2)

    def test_ram_gb(self):
        self.assertGreater(render.ram_gb(), 0.5)


class RenderRunTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.film = self.dir / "film"
        self.film.mkdir()
        self.info = self.dir / "info.json"
        self.info.write_text(json.dumps(INFO))
        self.log = self.dir / "node.jsonl"
        self.env = fakes.install(self.dir / "bin")
        self.env.update({"ENC": "-c:v libx264 -qp 0 -preset ultrafast", "GRAIN": "0", "FAKE_NODE_LOG": str(self.log)})

    def run_render(self, *args):
        cmd = [sys.executable, "-I", str(media.SCRIPTS / "render.py"), str(self.film), *map(str, args)]
        return subprocess.run(cmd, env=self.env, capture_output=True, text=True)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_renders_every_frame_across_workers(self):
        r = self.run_render("--res", "720", "--workers", 2, "--info", self.info)
        self.assertEqual(r.returncode, 0, r.stderr)
        out = self.film / "out" / "video_720.mp4"
        self.assertIn(f"{out}: 6 frames (expected 6)", r.stdout)
        self.assertEqual(media.ffprobe(out, "stream=width,height"), "1280,720")
        renders = sorted(c["args"][2:4] for c in self.calls())
        self.assertEqual(renders, [["0", "3"], ["3", "6"]])
        self.assertTrue(all(c["film_url"].startswith("http://127.0.0.1:") for c in self.calls()))
        self.assertTrue(all(c["film_dir"] == os.path.abspath(self.film) for c in self.calls()))
        self.assertTrue((self.film / "out" / "parts" / "part1.log").exists())

    def test_a_worker_short_of_frames_fails_the_render(self):
        self.env["FAKE_NODE_FRAMES"] = "1"
        r = self.run_render("--res", "720", "--workers", 2, "--info", self.info)
        self.assertEqual(r.returncode, 1)
        self.assertIn("frames missing in", r.stderr)
        self.assertIn("part0.mp4", r.stderr)
        self.assertFalse((self.film / "out" / "video_720.mp4").exists())

    def test_a_short_joined_file_fails_the_render(self):
        probe = self.dir / "bin" / "ffprobe"
        probe.write_text("#!/bin/sh\necho 5\n")
        probe.chmod(0o755)
        r = self.run_render("--res", "720", "--workers", 2, "--info", self.info)
        self.assertEqual(r.returncode, 1)
        self.assertIn("holds 5 frames, not 6", r.stderr)

    def test_asks_the_film_without_info(self):
        self.env["FAKE_NODE_INFO"] = json.dumps(INFO)
        r = self.run_render("--res", "720", "--workers", 1, "--from", 2, "--to", 4, "--out", self.dir / "clip.mp4")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("2 frames (expected 2)", r.stdout)
        self.assertIn("warning: a test warning", r.stderr)
        self.assertEqual(self.calls()[0]["args"][0].rsplit("/", 1)[-1], "info.mjs")

    def test_a_film_that_does_not_load(self):
        self.env["FAKE_NODE_ERROR"] = "error: scene 2 (Words 8-16) shot 1: style 'nope' is not one of punch3d"
        r = self.run_render()
        self.assertEqual(r.returncode, 1)
        self.assertIn("style 'nope'", r.stderr)
        self.assertIn("did not load", r.stderr)
        self.assertNotIn("Traceback", r.stderr)

    def test_frame_range_and_usage(self):
        r = self.run_render("--from", 4, "--to", 4, "--info", self.info)
        self.assertEqual(r.returncode, 1)
        self.assertIn("needs 0 <= from < to <= 6", r.stderr)
        r = subprocess.run([sys.executable, "-I", str(media.SCRIPTS / "render.py")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)
        self.assertIn("usage:", r.stderr)

    def test_more_workers_than_the_plan_warns(self):
        r = self.run_render("--res", "4k", "--workers", 99, "--from", 0, "--to", 1, "--info", self.info, "--out", self.dir / "one.mp4")
        self.assertIn("more than this machine's memory plan", r.stdout)


if __name__ == "__main__":
    unittest.main()
