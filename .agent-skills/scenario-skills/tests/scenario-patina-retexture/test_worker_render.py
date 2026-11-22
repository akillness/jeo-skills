"""worker.render_frames on a fake bpy whose render writes the still, and the CLI guard."""

import contextlib
import io
import json
import runpy
import sys
import tempfile
import types
import unittest
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

import helpers

worker = helpers.load("worker")


class RenderFramesTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name) / "frames" / "patina"
        self.scene = SimpleNamespace(render=SimpleNamespace(filepath=""), shown=[])
        self.scene.frame_set = self.scene.shown.append
        self.rendered = []

        def render(write_still):
            self.assertTrue(write_still)
            path = Path(self.scene.render.filepath)
            self.rendered.append((self.scene.shown[-1], path.name))
            path.write_bytes(b"png")

        bpy = types.ModuleType("bpy")
        bpy.ops = SimpleNamespace(render=SimpleNamespace(render=render))
        mock.patch.dict(sys.modules, {"bpy": bpy}).start()
        self.addCleanup(mock.patch.stopall)

    def test_renders_only_missing_frames_and_logs_each_one(self):
        self.folder.mkdir(parents=True)
        (self.folder / "0002.png").write_bytes(b"done")
        with contextlib.redirect_stdout(io.StringIO()) as out:
            count = worker.render_frames(self.scene, [1, 2, 13], self.folder, "patina")
        self.assertEqual(count, 2)
        self.assertEqual(self.rendered, [(1, "0001.png"), (13, "0013.png")])
        self.assertEqual((self.folder / "0002.png").read_bytes(), b"done")
        lines = [json.loads(line) for line in out.getvalue().splitlines()]
        self.assertEqual(
            [(line["pass"], line["frame"]) for line in lines], [("patina", 1), ("patina", 13)]
        )
        self.assertTrue(all(line["elapsed"] >= 0 for line in lines))

    def test_creates_the_folder_and_renders_nothing_for_no_frames(self):
        count = worker.render_frames(self.scene, [], self.folder, "original")
        self.assertEqual(count, 0)
        self.assertTrue(self.folder.is_dir())


class ScriptEntryTests(unittest.TestCase):
    def test_running_the_file_reports_usage_through_its_exit_status(self):
        with mock.patch.object(sys, "argv", ["blender", "--", "original"]):
            with self.assertRaises(SystemExit) as caught:
                runpy.run_path(str(helpers.SCRIPTS / "worker.py"), run_name="__main__")
        self.assertIn("usage", str(caught.exception.code))


if __name__ == "__main__":
    unittest.main()
