import json
import os
import shutil
import sys
import tempfile
import unittest
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

import numpy as np

import helpers

common = helpers.load("common")


class ConfigTests(unittest.TestCase):
    def read(self, folder, **overrides):
        return common.read_config(helpers.write_config(folder, **overrides))

    def test_defaults_and_path_resolution(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "assets").mkdir()
            (Path(folder) / "assets" / "Before.blend").write_bytes(b"b")
            (Path(folder) / "assets" / "PATINA.blend").write_bytes(b"a")
            config, path = self.read(folder, project_root="assets")
            self.assertEqual(path, Path(folder).resolve() / "film.json")
            self.assertEqual(config["project_root"], str(Path(folder).resolve() / "assets"))
            self.assertEqual(config["before"], str(Path(folder).resolve() / "assets/Before.blend"))
            for key, value in common.DEFAULTS.items():
                if key != "project_root":
                    self.assertEqual(config[key], value, key)
            self.assertNotIn("blender", config)
            self.assertNotIn("font", config)

    def test_file_keys_resolve_against_project_root(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            (root / "hdri").mkdir()
            (root / "hdri" / "studio.hdr").write_bytes(b"h")
            absolute = str(root / "elsewhere.ttf")
            with tempfile.TemporaryDirectory() as cwd:
                previous = os.getcwd()
                os.chdir(cwd)
                try:
                    config, _ = self.read(
                        folder,
                        environment="hdri/studio.hdr",
                        font="fonts/a.ttf",
                        bold_font=absolute,
                    )
                finally:
                    os.chdir(previous)
            self.assertEqual(config["environment"], str(root / "hdri" / "studio.hdr"))
            self.assertEqual(config["font"], str(root / "fonts" / "a.ttf"))
            self.assertEqual(config["bold_font"], absolute)
            relative = common.run_directory(config, root)
            config, _ = self.read(
                folder,
                environment=str(root / "hdri" / "studio.hdr"),
                font=str(root / "fonts" / "a.ttf"),
                bold_font=absolute,
            )
            self.assertEqual(relative, common.run_directory(config, root))

    def test_env_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            path = helpers.write_config(folder)
            with mock.patch.dict(os.environ, {"PATINA_CONFIG": str(path)}):
                config, _ = common.read_config()
            self.assertEqual(len(config["shots"]), 2)
            with mock.patch.dict(os.environ, {}, clear=True):
                with self.assertRaises(common.ConfigError):
                    common.read_config()

    def assert_problem(self, fragment, **overrides):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(common.ConfigError) as caught:
                self.read(folder, **overrides)
        self.assertIn(fragment, str(caught.exception))

    def test_fps_pairing(self):
        self.assert_problem("fps/source_fps", source_fps=10)
        self.assert_problem("fps/source_fps", fps=30, source_fps=30)
        self.assert_problem("fps/source_fps", source_fps=0)
        self.assert_problem("fps/source_fps", fps=24.0)
        with tempfile.TemporaryDirectory() as folder:
            config, _ = self.read(folder, source_fps=24)
            self.assertEqual(config["source_fps"], 24)

    def test_shot_seconds_hold_whole_source_frames(self):
        self.assert_problem("whole number of source frames", shot_seconds=5.55)
        self.assert_problem("shot_seconds: must be a positive", shot_seconds=0)

    def test_transition_bounds(self):
        self.assert_problem("transition", transition=-0.1)
        self.assert_problem("transition", transition=5.5)
        self.assert_problem("transition", shot_seconds=2, transition=2)
        self.assert_problem("transition", transition="fast")
        self.assert_problem("hard cuts are not supported", transition=0)
        self.assert_problem("at least one source frame", transition=0.04)
        with tempfile.TemporaryDirectory() as folder:
            config, _ = self.read(folder, transition=1 / 12)
            self.assertEqual(config["transition"], 1 / 12)

    def test_workers(self):
        self.assert_problem("workers: must be 1 or 2", workers=3)
        self.assert_problem("workers: must be 1 or 2", workers=0)

    def test_even_dimensions(self):
        self.assert_problem("width: must be a positive even integer", width=2367)
        self.assert_problem("height: must be a positive even integer", height=1331)
        self.assert_problem("height: must be a positive even integer", height=0)

    def test_shot_endpoint_shape(self):
        bad = helpers.shot("Bad")
        bad["start"][1] = [0, 0, 0]
        self.assert_problem("shots[0].start", shots=[bad])
        bad = helpers.shot("Bad")
        bad["end"][2] = 0
        self.assert_problem("shots[0].end", shots=[bad])
        bad = helpers.shot("Bad")
        bad["end"][0] = [1, 2]
        self.assert_problem("shots[0].end", shots=[bad])
        bad = helpers.shot("Bad")
        del bad["start"]
        self.assert_problem("shots[0].start", shots=[bad])
        self.assert_problem("shots[1]: needs a name", shots=[helpers.shot("Ok"), {"start": 1}])
        self.assert_problem("shots: at least one", shots=[])

    def test_every_problem_is_listed_at_once(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(common.ConfigError) as caught:
                self.read(folder, workers=5, width=3, transition=-1, source_fps=7)
        message = str(caught.exception)
        for fragment in ("workers", "width", "transition", "fps/source_fps"):
            self.assertIn(fragment, message)

    def test_required_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "film.json"
            path.write_text(json.dumps({"shots": [helpers.shot("A")]}))
            with self.assertRaises(common.ConfigError) as caught:
                common.read_config(path)
        self.assertIn("before: required", str(caught.exception))
        self.assertIn("after: required", str(caught.exception))


class FrameTests(unittest.TestCase):
    def config(self, **overrides):
        config = {"shot_seconds": 1.0, "fps": 24, "source_fps": 12, "shots": [1, 2]}
        config.update(overrides)
        return config

    def test_pilot_renders_both_endpoints_of_every_shot(self):
        self.assertEqual(common.expected(self.config(), "pilot"), [1, 24, 25, 48])
        self.assertEqual(common.shot_frames(self.config()), 24)

    def test_run_follows_source_cadence(self):
        self.assertEqual(common.expected(self.config(), "run"), list(range(1, 49, 2)))
        self.assertEqual(common.expected(self.config(source_fps=24), "run"), list(range(1, 49)))
        self.assertEqual(len(common.expected(self.config(shot_seconds=5.5), "run")), 132)


class FingerprintTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.scripts = Path(self.folder.name) / "scripts"
        self.scripts.mkdir()
        (self.scripts / "a.py").write_text("print(1)\n")
        (self.scripts / "notes.txt").write_text("ignored\n")

    def tearDown(self):
        self.folder.cleanup()

    def fingerprint(self, **overrides):
        config, _ = common.read_config(helpers.write_config(self.folder.name, **overrides))
        return common.run_directory(config, self.scripts)

    def test_identical_inputs_give_identical_folder(self):
        first = self.fingerprint()
        self.assertEqual(first, self.fingerprint())
        self.assertEqual(first.parent, Path(self.folder.name).resolve() / "video/automatic")
        self.assertEqual(len(first.name), 16)

    def test_config_change_moves_the_folder(self):
        self.assertNotEqual(self.fingerprint(), self.fingerprint(title="OTHER"))
        self.assertNotEqual(self.fingerprint(), self.fingerprint(samples=48))

    def test_excluded_keys_do_not_move_the_folder(self):
        base = self.fingerprint()
        self.assertEqual(base, self.fingerprint(workers=2))
        self.assertEqual(base, self.fingerprint(blender="/somewhere/blender"))
        self.assertEqual(base, self.fingerprint(ffmpeg="/usr/local/bin/ffmpeg"))

    def test_input_change_moves_the_folder(self):
        base = self.fingerprint()
        (Path(self.folder.name) / "Before.blend").write_bytes(b"edited scene")
        self.assertNotEqual(base, self.fingerprint())

    def test_environment_content_is_fingerprinted(self):
        hdri = Path(self.folder.name) / "studio.hdr"
        hdri.write_bytes(b"first")
        base = self.fingerprint(environment="studio.hdr")
        self.assertNotEqual(base.name, self.fingerprint().name)
        hdri.write_bytes(b"second")
        self.assertNotEqual(base.name, self.fingerprint(environment="studio.hdr").name)

    def test_moving_the_project_keeps_the_folder(self):
        # The destination is one level deeper; a relpath to the system font would change.
        font = "/usr/share/fonts/truetype/Elsewhere.ttf"
        base = self.fingerprint(font=font)
        with tempfile.TemporaryDirectory() as parent:
            moved = Path(parent) / "renamed project"
            shutil.move(self.folder.name, moved)
            try:
                config, _ = common.read_config(moved / "film.json")
                after = common.run_directory(config, moved / "scripts")
            finally:
                shutil.move(moved, self.folder.name)
        self.assertEqual(after.name, base.name)
        self.assertEqual(after.parent, moved.resolve() / "video/automatic")

    def test_script_change_moves_the_folder(self):
        base = self.fingerprint()
        (self.scripts / "a.py").write_text("print(2)\n")
        self.assertNotEqual(base, self.fingerprint())
        # Non-Python files next to the scripts do not count.
        (self.scripts / "notes.txt").write_text("changed\n")
        self.assertEqual(self.fingerprint(), self.fingerprint())

    def test_portable_path_is_relative_only_under_the_root(self):
        self.assertEqual(common.portable_path("/p/a/b.blend", "/p"), "a/b.blend")
        self.assertEqual(common.portable_path("/p/a/../b.blend", "/p/"), "b.blend")
        # A sibling that merely shares the prefix, and a system font, stay absolute.
        self.assertEqual(common.portable_path("/px/b.blend", "/p"), "/px/b.blend")
        font = "/usr/share/fonts/truetype/Elsewhere.ttf"
        self.assertEqual(common.portable_path(font, "/p"), font)
        self.assertEqual(common.portable_path(font, "/p/q/r"), font)


class BlenderResolutionTests(unittest.TestCase):
    def test_config_key_wins(self):
        with tempfile.NamedTemporaryFile() as handle:
            with mock.patch.dict(os.environ, {"BLENDER": "/nope"}):
                self.assertEqual(common.resolve_blender({"blender": handle.name}), handle.name)

    def test_configured_but_missing_is_an_error(self):
        with self.assertRaises(FileNotFoundError) as caught:
            common.resolve_blender({"blender": "/definitely/not/here"})
        self.assertIn("/definitely/not/here", str(caught.exception))
        self.assertIn("does not exist", str(caught.exception))

    def test_directory_candidate_names_the_executable_inside(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError) as caught:
                common.resolve_blender({"blender": folder})
        message = str(caught.exception)
        self.assertIn("is a directory", message)
        self.assertIn("Contents/MacOS/Blender", message)

    def test_command_name_candidate_is_looked_up_on_path(self):
        with mock.patch.object(common.shutil, "which", return_value="/opt/blender/blender"):
            self.assertEqual(common.resolve_blender({"blender": "blender"}), "/opt/blender/blender")
            with mock.patch.dict(os.environ, {"BLENDER": "blender-4.5"}):
                self.assertEqual(common.resolve_blender({}), "/opt/blender/blender")

    def test_environment_then_path_then_bundle(self):
        with tempfile.NamedTemporaryFile() as handle:
            with mock.patch.dict(os.environ, {"BLENDER": handle.name}):
                self.assertEqual(common.resolve_blender({}), handle.name)
            with mock.patch.dict(os.environ, {}, clear=True):
                with mock.patch.object(common.shutil, "which", return_value=handle.name):
                    self.assertEqual(common.resolve_blender({}), handle.name)
                with mock.patch.object(common.shutil, "which", return_value=None):
                    with mock.patch.object(common, "MACOS_BLENDER", handle.name):
                        self.assertEqual(common.resolve_blender({}), handle.name)

    def test_error_names_every_route(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch.object(common.shutil, "which", return_value=None):
                with mock.patch.object(common, "MACOS_BLENDER", "/Applications/None/Blender"):
                    with self.assertRaises(FileNotFoundError) as caught:
                        common.resolve_blender({})
        message = str(caught.exception)
        for fragment in ("--blender", "BLENDER environment", "PATH", "/Applications/None/Blender"):
            self.assertIn(fragment, message)


def translation(x=0.0, y=0.0, z=0.0):
    matrix = np.identity(4)
    matrix[:3, 3] = (x, y, z)
    return matrix


def stub_object(name, vertices=(), polygons=(), basis=None, parent=None, parent_inverse=None):
    """What world_matrix and geometry_hash read, with numpy standing in for mathutils."""
    return SimpleNamespace(
        name=name,
        parent=parent,
        matrix_basis=np.identity(4) if basis is None else basis,
        matrix_parent_inverse=np.identity(4) if parent_inverse is None else parent_inverse,
        data=SimpleNamespace(
            vertices=[SimpleNamespace(co=v) for v in vertices],
            polygons=[SimpleNamespace(vertices=p) for p in polygons],
        ),
    )


class GeometryHashTests(unittest.TestCase):
    def test_hash_tracks_geometry_only(self):
        a = stub_object("Cube", [(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 2)])
        b = stub_object("Cube", [(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 2)])
        self.assertEqual(common.geometry_hash([a]), common.geometry_hash([b]))
        moved = stub_object("Cube", [(0, 0, 0), (1, 0, 0), (0, 1, 0.5)], [(0, 1, 2)])
        self.assertNotEqual(common.geometry_hash([a]), common.geometry_hash([moved]))
        renamed = stub_object("Box", [(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 2)])
        self.assertNotEqual(common.geometry_hash([a]), common.geometry_hash([renamed]))
        other = stub_object("Other", [(2, 2, 2)], [])
        self.assertEqual(common.geometry_hash([a, other]), common.geometry_hash([other, a]))

    def test_hash_follows_the_parent_chain(self):
        parent = stub_object("Parent", basis=translation(1))
        child = stub_object("Child", [(0, 0, 0)], [], parent=parent)
        before = common.geometry_hash([child])
        self.assertEqual(before, common.geometry_hash([child]))
        parent.matrix_basis[1, 3] = 2
        self.assertNotEqual(before, common.geometry_hash([child]))


class WorldMatrixTests(unittest.TestCase):
    def test_root_object_is_its_basis_whatever_its_parent_inverse_holds(self):
        # Blender ignores matrix_parent_inverse on an unparented object.
        root = stub_object("Root", basis=translation(4, 5, 6), parent_inverse=translation(-1))
        np.testing.assert_array_equal(common.world_matrix(root), translation(4, 5, 6))

    def test_parent_inverse_cancels_the_parent_pose_at_parenting_time(self):
        parent = stub_object("Parent", basis=translation(1, 2, 3))
        parent.matrix_basis[0, 0] = 2
        child = stub_object(
            "Child",
            basis=translation(0.5),
            parent=parent,
            parent_inverse=np.linalg.inv(parent.matrix_basis),
        )
        np.testing.assert_allclose(common.world_matrix(child), translation(0.5))
        parent.matrix_basis[2, 3] = 4
        np.testing.assert_allclose(common.world_matrix(child)[:3, 3], (0.5, 0, 1))
        grandchild = stub_object("Grandchild", basis=translation(0, 0, 1), parent=child)
        np.testing.assert_allclose(common.world_matrix(grandchild)[:3, 3], (0.5, 0, 2))


class BlenderHelperTests(unittest.TestCase):
    def test_ensure_nodes_enables_a_disabled_tree(self):
        tree = object()
        world = SimpleNamespace(node_tree=tree, use_nodes=False)
        self.assertIs(common.ensure_nodes(world), tree)
        self.assertTrue(world.use_nodes)
        fresh = SimpleNamespace(node_tree=None, use_nodes=False)
        common.ensure_nodes(fresh)
        self.assertTrue(fresh.use_nodes)
        enabled = SimpleNamespace(node_tree=tree, use_nodes=True)
        self.assertIs(common.ensure_nodes(enabled), tree)

    def test_ensure_nodes_tolerates_a_read_only_flag(self):
        class Modern:
            node_tree = object()
            use_nodes = property(lambda self: True)

        self.assertIs(common.ensure_nodes(Modern()), Modern.node_tree)

    def test_script_args_follow_the_separator(self):
        with mock.patch.object(sys, "argv", ["blender", "--python", "x.py", "--", "a", "b"]):
            self.assertEqual(common.script_args(), ["a", "b"])
        with mock.patch.object(sys, "argv", ["blender", "--python", "x.py"]):
            self.assertEqual(common.script_args(), [])


class DumpTests(unittest.TestCase):
    def test_compact_sorted_json(self):
        self.assertEqual(common.dump({"b": 1, "a": [1, 2]}), '{"a":[1,2],"b":1}')


if __name__ == "__main__":
    unittest.main()
