"""inventory.py without Blender: every function that does not need bpy, on duck-typed stubs.

The bpy pipeline itself is covered by test_blender.py where the module is installed.
"""

import contextlib
import io
import runpy
import sys
import tempfile
import unittest
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

import numpy as np

import helpers

inventory = helpers.load("inventory")

GREY = (0.8, 0.8, 0.8, 1.0)
CORNERS = [(x, y, z) for x in (-0.5, 0.5) for y in (-0.5, 0.5) for z in (-0.5, 0.5)]


def principled(color, linked_from=None):
    links = []
    if linked_from is not None:
        links = [SimpleNamespace(from_node=SimpleNamespace(type=linked_from))]
    socket = SimpleNamespace(default_value=color, is_linked=bool(links), links=links)
    return SimpleNamespace(type="BSDF_PRINCIPLED", inputs={"Base Color": socket})


def material(name, diffuse=GREY, nodes=None, library=None):
    tree = None if nodes is None else SimpleNamespace(nodes=nodes)
    return SimpleNamespace(name=name, diffuse_color=diffuse, node_tree=tree, library=library)


def scene_object(name, kind="MESH", location=(0, 0, 0), materials=(), hide_render=False):
    basis = np.identity(4)
    basis[:3, 3] = location
    data = SimpleNamespace(
        vertices=[SimpleNamespace(co=corner) for corner in CORNERS],
        polygons=[SimpleNamespace(vertices=[0, 1, 3, 2])],
    )
    return SimpleNamespace(
        name=name,
        type=kind,
        parent=None,
        matrix_basis=basis,
        matrix_parent_inverse=np.identity(4),
        bound_box=CORNERS,
        material_slots=[SimpleNamespace(material=m) for m in materials],
        data=data,
        hide_render=hide_render,
    )


class BoundsTests(unittest.TestCase):
    def test_new_bounds_start_at_the_sentinels(self):
        bounds = inventory.new_bounds()
        self.assertEqual(bounds["lo"], [float("inf")] * 3)
        self.assertEqual(bounds["hi"], [float("-inf")] * 3)

    def test_extend_bounds_takes_the_extremes_per_axis(self):
        bounds = inventory.new_bounds()
        inventory.extend_bounds(bounds, [(1, -2, 3), (-4, 5, 0)])
        inventory.extend_bounds(bounds, [(0, 0, 7)])
        self.assertEqual(bounds, {"lo": [-4, -2, 0], "hi": [1, 5, 7]})

    def test_world_corners_apply_translation_and_scale(self):
        obj = scene_object("Cube", location=(2, 3, 4))
        obj.matrix_basis[0, 0] = 2
        corners = inventory.world_corners(obj)
        self.assertEqual(len(corners), 8)
        self.assertEqual(min(c[0] for c in corners), 1)
        self.assertEqual(max(c[0] for c in corners), 3)
        self.assertEqual({c[1] for c in corners}, {2.5, 3.5})
        self.assertEqual({c[2] for c in corners}, {3.5, 4.5})

    def test_world_corners_follow_the_parent_chain(self):
        attic = scene_object("Attic", location=(0, 0, 6))
        lamp = scene_object("Lamp", location=(3, 0, -6))
        lamp.parent = attic
        corners = inventory.world_corners(lamp)
        self.assertEqual({c[0] for c in corners}, {2.5, 3.5})
        self.assertEqual({c[2] for c in corners}, {-0.5, 0.5})


class ImporterTests(unittest.TestCase):
    def test_every_supported_suffix_names_an_operator(self):
        self.assertEqual(set(inventory.IMPORTERS), {".glb", ".gltf", ".obj", ".fbx"})
        for module, operator in inventory.IMPORTERS.values():
            self.assertIn(module, ("import_scene", "wm"))
            self.assertTrue(operator)

    def test_unsupported_suffix_is_refused_before_bpy_is_imported(self):
        with self.assertRaises(ValueError) as caught:
            inventory.load_source(Path("model.stl"))
        self.assertIn("model.stl", str(caught.exception))


class BaseColorTests(unittest.TestCase):
    def test_unlinked_principled_socket_is_the_color(self):
        wall = material("Wall", nodes=[principled((0.8, 0.1, 0.1, 1))])
        color, source = inventory.material_base_color(wall)
        self.assertEqual(color, [0.8, 0.1, 0.1, 1])
        self.assertEqual(source, "principled")

    def test_driven_socket_is_unknown_and_names_the_driver(self):
        nodes = [principled(GREY, linked_from="VERTEX_COLOR")]
        result = inventory.material_base_color(material("VC", nodes=nodes))
        self.assertEqual(result, (None, "linked:VERTEX_COLOR"))

    def test_viewport_color_counts_only_when_the_author_changed_it(self):
        emission_only = [SimpleNamespace(type="EMISSION")]
        glow = material("Glow", nodes=emission_only)
        self.assertEqual(inventory.material_base_color(glow), (None, "none"))
        painted = material("Painted", diffuse=(0.2, 0.3, 0.4, 1.0), nodes=emission_only)
        self.assertEqual(inventory.material_base_color(painted), ([0.2, 0.3, 0.4, 1.0], "viewport"))
        self.assertEqual(inventory.material_base_color(material("Bare")), (None, "none"))

    def test_library_material_is_not_inspected(self):
        library = SimpleNamespace(filepath="//lib.blend")
        linked = material("Ext", nodes=[principled((1, 0, 0, 1))], library=library)
        self.assertEqual(inventory.material_base_color(linked), (None, "library"))


class NonMeshTests(unittest.TestCase):
    def test_lists_rendering_geometry_that_is_not_a_mesh(self):
        objects = [
            scene_object("Wall", materials=[material("Brick")]),
            scene_object("Sun", kind="LIGHT"),
            scene_object("Rig", kind="ARMATURE"),
            scene_object("Sign", kind="FONT", materials=[material("Paint"), None]),
            scene_object("Pipe", kind="CURVE", materials=[material("Copper")], hide_render=True),
            scene_object("Blob", kind="META"),
        ]
        self.assertEqual(
            inventory.non_mesh_renderables(objects),
            [
                {"name": "Blob", "type": "META", "materials": []},
                {"name": "Sign", "type": "FONT", "materials": ["Paint"]},
            ],
        )


class SummaryTests(unittest.TestCase):
    def test_empty_scene(self):
        report = inventory.summarize([], Path("empty.glb"))
        self.assertEqual(report["source"], "empty.glb")
        self.assertEqual(report["meshes"], 0)
        self.assertEqual(report["polygons"], 0)
        self.assertEqual(report["dimensions"], [0, 0, 0])
        self.assertEqual(len(report["geometry_sha256"]), 64)
        self.assertEqual(report["objects_without_material"], [])
        self.assertEqual(report["materials"], {})
        self.assertEqual(report["linked_materials"], [])

    def test_materials_are_grouped_across_objects(self):
        brick = material("Brick", nodes=[principled((0.6, 0.3, 0.2, 1))])
        glass = material("Glass", library=SimpleNamespace(filepath="//lib.blend"))
        objects = [
            scene_object("WallA", location=(0, 0, 0), materials=[brick]),
            scene_object("WallB", location=(4, 0, 0), materials=[brick, None]),
            scene_object("Window", location=(0, 0, 2), materials=[glass]),
        ]
        report = inventory.summarize(objects, Path("street.glb"))
        self.assertEqual(report["meshes"], 3)
        self.assertEqual(report["polygons"], 3)
        self.assertEqual(report["dimensions"], [5, 1, 3])
        self.assertEqual(report["objects_without_material"], ["WallB"])
        entry = report["materials"]["Brick"]
        self.assertEqual(entry["objects"], 2)
        self.assertEqual(entry["examples"], ["WallA", "WallB"])
        self.assertEqual(entry["bounds"], {"lo": [-0.5, -0.5, -0.5], "hi": [4.5, 0.5, 0.5]})
        self.assertEqual(entry["base_color"], [0.6, 0.3, 0.2, 1])
        self.assertEqual(entry["base_color_source"], "principled")
        self.assertFalse(entry["has_image_textures"])
        self.assertIsNone(report["materials"]["Glass"]["base_color"])
        self.assertEqual(report["linked_materials"], [{"name": "Glass", "library": "//lib.blend"}])


class MainTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)

    def tearDown(self):
        self.folder.cleanup()

    def test_argument_and_path_checks_run_before_blender_is_needed(self):
        with self.assertRaises(SystemExit) as caught:
            inventory.main([])
        self.assertIn("usage", str(caught.exception))
        with self.assertRaises(FileNotFoundError):
            inventory.main([str(self.root / "missing.glb"), str(self.root / "out")])
        source = self.root / "model.glb"
        source.write_bytes(b"glTF")
        out_dir = self.root / "out"
        out_dir.mkdir()
        (out_dir / "inventory.json").write_text("{}")
        with self.assertRaises(FileExistsError) as caught:
            inventory.main([str(source), str(out_dir)])
        self.assertIn("inventory.json", str(caught.exception))


class EntryPointTests(unittest.TestCase):
    def test_failure_prints_the_traceback_then_exits_with_one_line(self):
        argv = ["blender", "--python", "inventory.py", "--", "/nowhere/model.glb", "/nowhere/out"]
        with mock.patch.object(sys, "argv", argv):
            with contextlib.redirect_stderr(io.StringIO()) as err:
                with self.assertRaises(SystemExit) as caught:
                    runpy.run_path(str(helpers.SCRIPTS / "inventory.py"), run_name="__main__")
        message = "inventory failed: /nowhere/model.glb does not exist"
        self.assertEqual(caught.exception.code, message)
        self.assertIn("Traceback (most recent call last)", err.getvalue())
        self.assertIn("FileNotFoundError", err.getvalue())


if __name__ == "__main__":
    unittest.main()
