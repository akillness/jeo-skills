import contextlib
import io
import json
import sys
import tempfile
import types
import unittest
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

import helpers

common = helpers.load("common")
worker = helpers.load("worker")


def contract(engine="BLENDER_EEVEE", blender="5.0.1", **settings):
    values = {"engine": engine, "look": "AgX - Medium High Contrast", "lights": [{"power": 600}]}
    values.update(settings)
    return {
        "pass_name": "original",
        "blender": blender,
        "camera_sha256": "c" * 64,
        "settings": values,
        "shots": [helpers.shot("Wide")],
        "geometry_sha256": "g" * 64,
    }


class ContractTests(unittest.TestCase):
    def test_paths(self):
        run = Path("/r")
        self.assertEqual(worker.contract_path(run, "patina"), run / "patina_contract.json")
        self.assertEqual(
            worker.native_scene_path(run, "original"), run / "Original Camera Animation.blend"
        )

    def test_flatten_names_leaves_with_dotted_paths(self):
        flat = worker.flatten({"a": {"b": 1, "c": [{"d": 2}, 3]}, "e": "x"})
        self.assertEqual(flat, {"a.b": 1, "a.c.0.d": 2, "a.c.1": 3, "e": "x"})

    def test_first_worker_writes_and_an_identical_one_leaves_it_alone(self):
        with tempfile.TemporaryDirectory() as folder:
            run = Path(folder)
            worker.record_contract(run, "original", contract())
            path = worker.contract_path(run, "original")
            self.assertEqual(json.loads(path.read_text()), contract())
            stamp = path.stat().st_mtime_ns
            worker.record_contract(run, "original", contract())
            self.assertEqual(path.stat().st_mtime_ns, stamp)

    def test_mismatch_names_the_keys_and_both_blender_versions(self):
        with tempfile.TemporaryDirectory() as folder:
            run = Path(folder)
            worker.record_contract(run, "original", contract("BLENDER_EEVEE_NEXT", "4.5.0"))
            with self.assertRaises(RuntimeError) as caught:
                worker.record_contract(run, "original", contract("BLENDER_EEVEE", "5.0.1"))
        message = str(caught.exception)
        self.assertIn("contract mismatch", message)
        self.assertIn("settings.engine: 'BLENDER_EEVEE_NEXT' on disk, 'BLENDER_EEVEE' now", message)
        self.assertIn("Blender 4.5.0 on disk, 5.0.1 now", message)
        self.assertNotIn("settings.look", message)

    def test_mismatch_reaches_into_lists(self):
        with tempfile.TemporaryDirectory() as folder:
            run = Path(folder)
            worker.record_contract(run, "patina", contract())
            with self.assertRaises(RuntimeError) as caught:
                worker.record_contract(run, "patina", contract(lights=[{"power": 900}]))
        self.assertIn("settings.lights.0.power: 600 on disk, 900 now", str(caught.exception))

    def test_blender_version_alone_is_not_a_mismatch(self):
        with tempfile.TemporaryDirectory() as folder:
            run = Path(folder)
            worker.record_contract(run, "original", contract(blender="5.0.0"))
            worker.record_contract(run, "original", contract(blender="5.0.1"))
            stored = json.loads(worker.contract_path(run, "original").read_text())
        self.assertEqual(stored["blender"], "5.0.0")


def stub_bpy():
    module = types.ModuleType("bpy")
    module.ops = SimpleNamespace(wm=SimpleNamespace(save_as_mainfile=mock.Mock()))
    return module


class MainTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.config_path = helpers.write_config(self.root)
        self.frames = self.root / "frames.json"
        self.frames.write_text("[1, 24]")
        self.bpy = stub_bpy()
        fake_scene = SimpleNamespace(render=SimpleNamespace(resolution_percentage=50))
        self.setup = mock.patch.object(
            worker, "setup", return_value=(fake_scene, [], contract())
        ).start()
        self.render = mock.patch.object(worker, "render_frames", return_value=2).start()
        mock.patch.dict(sys.modules, {"bpy": self.bpy}).start()

    def tearDown(self):
        mock.patch.stopall()
        self.folder.cleanup()

    def test_usage_error(self):
        with self.assertRaises(SystemExit) as caught:
            worker.main(["original", "frames.json"])
        self.assertIn("usage", str(caught.exception))

    def test_pilot_creates_the_run_folder_and_records_the_contract(self):
        run = self.root / "video" / "fresh"
        argv = ["original", str(self.frames), str(run), "pilot", str(self.config_path)]
        result = worker.main(argv)
        expected = {"pass": "original", "kind": "pilot", "requested": 2, "rendered": 2}
        self.assertEqual(result, expected)
        self.assertTrue(worker.contract_path(run, "original").is_file())
        self.setup.assert_called_once()
        self.assertEqual(self.setup.call_args.kwargs, {"preview": True})
        rendered = ([1, 24], run / "pilot" / "original", "original")
        self.assertEqual(self.render.call_args.args[1:], rendered)
        self.bpy.ops.wm.save_as_mainfile.assert_not_called()

    def test_run_saves_the_native_scene_once_at_full_resolution(self):
        run = self.root / "video" / "fresh"
        argv = ["patina", str(self.frames), str(run), "run", str(self.config_path)]
        worker.main(argv)
        native = worker.native_scene_path(run, "patina")
        self.bpy.ops.wm.save_as_mainfile.assert_called_once_with(filepath=str(native))
        self.assertEqual(self.setup.return_value[0].render.resolution_percentage, 100)
        self.assertEqual(self.render.call_args.args[2], run / "frames" / "patina")
        native.write_bytes(b"saved")
        worker.main(argv)
        self.bpy.ops.wm.save_as_mainfile.assert_called_once()

    def test_config_falls_back_to_the_environment(self):
        run = self.root / "video" / "fresh"
        with mock.patch.dict("os.environ", {"PATINA_CONFIG": str(self.config_path)}):
            worker.main(["original", str(self.frames), str(run), "pilot"])
        self.assertTrue(run.is_dir())


class EntryPointTests(unittest.TestCase):
    def test_failure_exits_one_with_a_one_line_message(self):
        with mock.patch.object(worker, "main", side_effect=RuntimeError("boom")):
            with mock.patch.object(sys, "argv", ["blender", "--", "x"]):
                with contextlib.redirect_stderr(io.StringIO()) as err:
                    with self.assertRaises(SystemExit) as caught:
                        worker.run()
        self.assertEqual(caught.exception.code, "worker.py failed: RuntimeError: boom")
        self.assertIn("Traceback", err.getvalue())

    def test_success_prints_the_report(self):
        with mock.patch.object(worker, "main", return_value={"rendered": 1}):
            with contextlib.redirect_stdout(io.StringIO()) as out:
                worker.run()
        self.assertEqual(json.loads(out.getvalue()), {"rendered": 1})


if __name__ == "__main__":
    unittest.main()
