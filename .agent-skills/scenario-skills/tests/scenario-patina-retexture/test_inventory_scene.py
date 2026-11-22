"""inventory.py's Blender side on duck-typed fakes: importer dispatch, packing, main()."""

import contextlib
import io
import json
import sys
import tempfile
import unittest
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

import blender_fakes as fakes
import helpers

inventory = helpers.load("inventory")
common = helpers.load("common")


def recording_bpy(scene=None):
    """A fake bpy whose operators append (operator, kwargs) to bpy.calls."""
    bpy = fakes.bpy_module(scene)
    bpy.calls = []

    def operator(name, effect=None):
        def run(**kwargs):
            bpy.calls.append((name, kwargs))
            if effect:
                effect(**kwargs)

        return run

    bpy.ops = SimpleNamespace(
        wm=SimpleNamespace(
            open_mainfile=operator("open_mainfile"),
            read_factory_settings=operator("read_factory_settings"),
            obj_import=operator("obj_import"),
            save_as_mainfile=operator(
                "save_as_mainfile", lambda filepath: Path(filepath).write_bytes(b"BLENDER")
            ),
        ),
        import_scene=SimpleNamespace(gltf=operator("gltf"), fbx=operator("fbx")),
        file=SimpleNamespace(pack_all=operator("pack_all")),
    )
    return bpy


class LoadSourceTests(unittest.TestCase):
    def load(self, name):
        bpy = recording_bpy()
        with mock.patch.dict(sys.modules, {"bpy": bpy}):
            inventory.load_source(Path("/assets") / name)
        return bpy.calls

    def test_blend_opens_in_place(self):
        calls = self.load("Shop.BLEND")
        self.assertEqual(calls, [("open_mainfile", {"filepath": str(Path("/assets/Shop.BLEND"))})])

    def test_interchange_formats_import_into_an_empty_scene(self):
        for name, operator in (
            ("a.glb", "gltf"),
            ("a.gltf", "gltf"),
            ("a.obj", "obj_import"),
            ("a.fbx", "fbx"),
        ):
            calls = self.load(name)
            path = str(Path("/assets") / name)
            expected = [
                ("read_factory_settings", {"use_empty": True}),
                (operator, {"filepath": path}),
            ]
            self.assertEqual(calls, expected, name)


class PackTests(unittest.TestCase):
    def test_success_reports_no_error(self):
        bpy = recording_bpy()
        with mock.patch.dict(sys.modules, {"bpy": bpy}):
            self.assertIsNone(inventory.pack_all())
        self.assertEqual(bpy.calls, [("pack_all", {})])

    def test_refused_files_are_listed_once_each(self):
        bpy = recording_bpy()

        def refuse():
            raise RuntimeError(
                "Error: Unable to pack file a.png\nError: Unable to pack file a.png\n"
                "Error: Unable to pack file b.png\n"
            )

        bpy.ops.file.pack_all = refuse
        with mock.patch.dict(sys.modules, {"bpy": bpy}):
            error = inventory.pack_all()
        self.assertEqual(
            error, "Error: Unable to pack file a.png; Error: Unable to pack file b.png"
        )


class MainTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name).resolve()
        self.source = self.root / "shop.glb"
        self.source.write_bytes(b"glTF")
        paint = fakes.IDBlock(
            "Paint", diffuse_color=(0.5, 0.2, 0.1, 1.0), node_tree=None, library=None
        )
        stage = fakes.Scene(
            [
                fakes.SceneObject("Wall", fakes.Mesh(), location=(0, 0, 0), materials=[paint]),
                fakes.SceneObject("Roof", fakes.Mesh(), location=(0, 0, 2), materials=[paint]),
                fakes.SceneObject("Sign", kind="FONT", materials=[paint]),
                fakes.SceneObject("Sun", fakes.LightData("Sun", "SUN")),
            ]
        )
        self.bpy = recording_bpy(stage)
        mock.patch.dict(sys.modules, {"bpy": self.bpy}).start()
        self.addCleanup(mock.patch.stopall)

    def run_main(self, out_dir):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            report = inventory.main([str(self.source), str(out_dir)])
        return report, out.getvalue()

    def test_saves_before_blend_and_writes_the_report(self):
        out_dir = self.root / "work" / "inventory"
        report, printed = self.run_main(out_dir)
        before = out_dir / "Before.blend"
        self.assertEqual(before.read_bytes(), b"BLENDER")
        self.assertEqual(report["before"], str(before))
        self.assertEqual(json.loads((out_dir / "inventory.json").read_text()), report)
        self.assertEqual(json.loads(printed), report)
        names = [name for name, _ in self.bpy.calls]
        self.assertEqual(names, ["read_factory_settings", "gltf", "pack_all", "save_as_mainfile"])
        self.assertTrue(report["packed"])
        self.assertIsNone(report["pack_error"])
        self.assertEqual(report["meshes"], 2)
        self.assertEqual(report["polygons"], 4)
        self.assertEqual(report["dimensions"], [1.0, 1.0, 3.0])
        self.assertEqual(report["materials"]["Paint"]["objects"], 2)
        self.assertEqual(report["materials"]["Paint"]["base_color"], [0.5, 0.2, 0.1, 1.0])
        meshes = [o for o in self.bpy.context.scene.objects if o.type == "MESH"]
        self.assertEqual(report["geometry_sha256"], common.geometry_hash(meshes))
        self.assertEqual(
            report["non_mesh_renderables"],
            [{"name": "Sign", "type": "FONT", "materials": ["Paint"]}],
        )

    def test_a_refused_texture_still_saves_the_inventory(self):
        def refuse():
            raise RuntimeError("Error: Unable to pack file gone.png")

        self.bpy.ops.file.pack_all = refuse
        report, _ = self.run_main(self.root / "out")
        self.assertFalse(report["packed"])
        self.assertEqual(report["pack_error"], "Error: Unable to pack file gone.png")
        self.assertTrue((self.root / "out" / "Before.blend").is_file())


if __name__ == "__main__":
    unittest.main()
