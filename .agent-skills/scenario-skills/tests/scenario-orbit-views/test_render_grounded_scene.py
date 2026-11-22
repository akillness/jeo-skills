"""render_grounded.main against duck-typed bpy and mathutils stand-ins.

The fakes only store what the script assigns and hand back what a test planted (the
imported meshes, their bounds and dimensions, the panorama pixels, the dome vertices).
Each test checks a decision the script makes from those inputs: how the subject is
normalized, which pass shows which object, where cameras and the sun point, what the
manifest records. Nothing here exercises Blender's own behavior.
"""

import io
import json
import math
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from types import SimpleNamespace
import unittest.mock as mock

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-orbit-views" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import render_grounded as rg  # noqa: E402


class Vector(tuple):
    def __new__(cls, values):
        return super().__new__(cls, (float(v) for v in values))

    x = property(lambda self: self[0])
    y = property(lambda self: self[1])
    z = property(lambda self: self[2])

    def __add__(self, other):
        return Vector(a + b for a, b in zip(self, other))

    def __sub__(self, other):
        return Vector(a - b for a, b in zip(self, other))

    def __mul__(self, k):
        return Vector(a * k for a in self)

    def __neg__(self):
        return Vector(-a for a in self)

    def to_track_quat(self, track, up):
        return SimpleNamespace(to_euler=lambda: ("track", self, track, up))


class Translation:
    def __init__(self, offset):
        self.offset = Vector(offset)

    def __matmul__(self, v):
        return Vector(v) + self.offset


class Socket:
    def __init__(self, node, key):
        self.node = node
        self.key = key
        self.default_value = None


class Sockets(dict):
    def __init__(self, node):
        super().__init__()
        self.node = node

    def __missing__(self, key):
        socket = self[key] = Socket(self.node, key)
        return socket


class Node(SimpleNamespace):
    def __init__(self, kind):
        super().__init__(kind=kind)
        self.inputs = Sockets(self)
        self.outputs = Sockets(self)


class Nodes(dict):
    def new(self, kind):
        node = Node(kind)
        self[f"{kind}.{len(self)}"] = node
        return node

    def of_kind(self, kind):
        return [n for n in self.values() if n.kind == kind]


class Links(list):
    def new(self, source, target):
        self.append((source, target))


def node_tree(*named):
    return SimpleNamespace(nodes=Nodes({name: Node(name) for name in named}), links=Links())


class Obj(SimpleNamespace):
    def __init__(self, name, kind, **attributes):
        super().__init__(name=name, type=kind, hide_render=False, selected=None, **attributes)

    def select_set(self, value):
        self.selected = value


def mesh(name, lo, hi, offset=(0, 0, 0), dimensions=(2.0, 2.0, 2.0)):
    corners = [(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
    return Obj(name, "MESH", bound_box=corners, matrix_world=Translation(offset),
               dimensions=dimensions, data=SimpleNamespace(materials=[]))


def pano_pixels(w, h, lit):
    """Flat RGBA floats, bottom row first like bpy image pixels; `lit` maps (row, col) to RGB."""
    px = [0.0] * (w * h * 4)
    for (row, col), rgb in lit.items():
        i = (row * w + col) * 4
        px[i:i + 3] = rgb
    return px


class FakeBlender:
    def __init__(self, imported, pano=None, dome_z=(), gpu=True):
        self.imported = imported
        self.pano = pano
        self.dome_z = dome_z
        self.calls = []
        self.renders = []
        self.removed = []
        self.linked = []
        self.dome = self.catcher = None
        self.scene = SimpleNamespace(
            objects=[], camera=None, world=None,
            collection=SimpleNamespace(objects=SimpleNamespace(link=self.linked.append)),
            render=SimpleNamespace(image_settings=SimpleNamespace()),
            cycles=SimpleNamespace(), view_settings=SimpleNamespace(),
        )
        self.devices = [SimpleNamespace(use=False), SimpleNamespace(use=False)]
        addons = {}
        if gpu:
            prefs = SimpleNamespace(get_devices=lambda: None, devices=self.devices)
            addons["cycles"] = SimpleNamespace(preferences=prefs)
        self.context = SimpleNamespace(
            scene=self.scene, active_object=None,
            view_layer=SimpleNamespace(objects=SimpleNamespace(active=None)),
            preferences=SimpleNamespace(addons=addons),
        )
        self.mathutils = types.ModuleType("mathutils")
        self.mathutils.Vector = Vector
        self.module = types.ModuleType("bpy")
        self.module.context = self.context
        self.module.ops = SimpleNamespace(
            wm=SimpleNamespace(read_factory_settings=self.record("read_factory_settings")),
            import_scene=SimpleNamespace(gltf=self.gltf),
            object=SimpleNamespace(
                join=self.join,
                parent_clear=self.record("parent_clear"),
                transform_apply=self.record("transform_apply"),
                shade_smooth=self.record("shade_smooth"),
            ),
            mesh=SimpleNamespace(primitive_uv_sphere_add=self.sphere, primitive_plane_add=self.plane),
            render=SimpleNamespace(render=self.render),
        )
        self.module.data = SimpleNamespace(
            materials=SimpleNamespace(new=self.material),
            images=SimpleNamespace(load=self.load_image),
            lights=SimpleNamespace(new=lambda name, kind: SimpleNamespace(name=name, type=kind)),
            objects=SimpleNamespace(new=self.new_object, remove=self.remove),
            worlds=SimpleNamespace(new=lambda name: SimpleNamespace(name=name, node_tree=node_tree("Background"))),
            cameras=SimpleNamespace(new=lambda name: SimpleNamespace(name=name)),
        )

    def record(self, name):
        return lambda **kw: self.calls.append((name, kw))

    def gltf(self, filepath):
        self.calls.append(("gltf", {"filepath": filepath}))
        self.scene.objects.extend(self.imported)

    def join(self):
        self.calls.append(("join", {}))
        active = self.context.view_layer.objects.active
        self.scene.objects[:] = [o for o in self.scene.objects if o is active or not o.selected]

    def sphere(self, **kw):
        self.calls.append(("sphere", kw))
        verts = [SimpleNamespace(co=SimpleNamespace(z=z)) for z in self.dome_z]
        self.dome = Obj("Sphere", "MESH", data=SimpleNamespace(vertices=verts, materials=[]))
        self.context.active_object = self.dome

    def plane(self, **kw):
        self.calls.append(("plane", kw))
        self.catcher = Obj("Plane", "MESH")
        self.context.active_object = self.catcher

    def material(self, name):
        return SimpleNamespace(name=name, node_tree=node_tree("Principled BSDF"))

    def load_image(self, path):
        w, h, pixels = self.pano
        return SimpleNamespace(filepath=path, size=(w, h), pixels=pixels)

    def new_object(self, name, data):
        return Obj(name, "OBJECT", data=data)

    def remove(self, ob):
        self.removed.append(ob)
        self.scene.objects.remove(ob)

    def render(self, write_still):
        subject = self.context.view_layer.objects.active
        cam = self.scene.camera
        self.renders.append({
            "path": self.scene.render.filepath,
            "clay": not subject.hide_render,
            "catcher": None if self.catcher is None else not self.catcher.hide_render,
            "dome": None if self.dome is None else self.dome.visible_camera,
            "transparent": self.scene.render.film_transparent,
            "location": cam.location,
            "look": cam.rotation_euler,
        })

    def run(self, opts):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(sys.modules, {"bpy": self.module, "mathutils": self.mathutils}):
            with redirect_stdout(out), redirect_stderr(err):
                rg.main(opts)
        manifest = json.loads((Path(opts["out"]) / "cameras.json").read_text(encoding="utf-8"))
        return manifest, out.getvalue(), err.getvalue()


def opts(tmp, *extra):
    return rg.parse_args(["--glb", str(tmp / "m.glb"), "--out", str(tmp / "renders" / "a"), *extra])


class GroundedRenderTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        # world bounds (0, 2, 3)..(4, 4, 7): 4 units wide, so scale 0.5 brings it to 2
        self.body = mesh("Body", (-1, 2, 3), (3, 4, 7), offset=(1, 0, 0), dimensions=(2.0, 1.0, 2.0))
        self.part = mesh("Part", (0, 2, 3), (1, 3, 4))
        self.empty = Obj("Root", "EMPTY")
        # brightest sky spot at column 40. The red one at column 16 outshines it on red alone but
        # not in luminance, and the one below the horizon is brighter still but ignored.
        lit = {(24, 40): (1.0, 1.0, 1.0), (16, 16): (3.0, 0.0, 0.0), (8, 8): (5.0, 5.0, 5.0)}
        self.pano = (64, 32, pano_pixels(64, 32, lit))

    def grounded(self, *extra, **fake):
        fake.setdefault("pano", self.pano)
        blender = FakeBlender([self.empty, self.body, self.part], **fake)
        o = opts(self.tmp, "--pano", "p.png", "--only", "00,top", "--az0", "30", "--yaw", "15", *extra)
        return blender, o, *blender.run(o)

    def test_subject_is_joined_normalized_and_grounded(self):
        blender, o, manifest, out, _ = self.grounded()
        self.assertEqual([c[0] for c in blender.calls if c[0] == "join"], ["join"])
        self.assertEqual(blender.calls[1], ("gltf", {"filepath": o["glb"]}))
        self.assertEqual((self.body.selected, self.part.selected, self.empty.selected), (True, True, False))
        self.assertIs(blender.context.view_layer.objects.active, self.body)
        self.assertEqual(self.body.scale, (0.5, 0.5, 0.5))
        self.assertEqual(self.body.location, (-1.0, -1.5, -1.5))
        self.assertEqual(blender.removed, [self.empty])
        self.assertEqual(len(self.body.data.materials), 1)
        clay = self.body.data.materials[0].node_tree.nodes["Principled BSDF"]
        self.assertEqual(clay.inputs["Base Color"].default_value, (0.4, 0.4, 0.4, 1))
        self.assertEqual(out.strip(), "DONE 2")

    def test_single_mesh_is_not_joined(self):
        blender = FakeBlender([mesh("Solo", (0, 0, 0), (2, 2, 2))])
        blender.run(opts(self.tmp, "--search"))
        self.assertNotIn("join", [c[0] for c in blender.calls])

    def test_passes_toggle_dome_clay_and_transparency(self):
        blender, o, manifest, _, _ = self.grounded()
        out = Path(o["out"])
        self.assertEqual(
            [(Path(r["path"]), r["clay"], r["catcher"], r["dome"], r["transparent"]) for r in blender.renders],
            [
                (out / "bg_00.png", False, False, True, False),
                (out / "clay_00.png", True, True, False, True),
                (out / "bg_top.png", False, False, True, False),
                (out / "clay_top.png", True, True, False, True),
            ],
        )

    def test_cameras_orbit_the_subject_and_look_at_its_center(self):
        blender, o, manifest, _, _ = self.grounded("--zoom", "1.5", "--lens", "35")
        dist = rg.camera_distance((2.0, 1.0, 2.0), 35.0, o["fill"], 1.5)
        self.assertAlmostEqual(manifest["dist"], dist)
        self.assertEqual([(v["key"], v["az"], v["el"]) for v in manifest["views"]], [("00", 30.0, 8.0), ("top", 30.0, 88.0)])
        center = (0.0, 0.0, 1.0)
        for r, (az, el) in zip(blender.renders, [(30, 8), (30, 8), (30, 88), (30, 88)]):
            self.assertEqual(r["location"], rg.camera_position(center, dist, az, el))
            _, direction, track, up = r["look"]
            for got, want in zip(direction, (c - p for c, p in zip(center, r["location"]))):
                self.assertAlmostEqual(got, want)
            self.assertEqual((track, up), ("-Z", "Y"))
        self.assertEqual(blender.scene.camera.data.lens, 35.0)
        self.assertEqual(blender.scene.camera.data.clip_end, o["radius"] * 4)

    def test_dome_floor_is_flattened_and_textured_with_the_panorama(self):
        blender, o, manifest, _, _ = self.grounded("--height", "1.2", "--radius", "10", dome_z=(-3.0, 0.5, 2.0))
        self.assertEqual([v.co.z for v in blender.dome.data.vertices], [0.0, 0.5, 2.0])
        self.assertEqual(dict(blender.calls)["sphere"]["location"], (0, 0, 1.2))
        self.assertEqual(dict(blender.calls)["sphere"]["radius"], 10.0)
        self.assertFalse(blender.dome.visible_shadow)
        self.assertTrue(blender.catcher.is_shadow_catcher)
        tree = blender.dome.data.materials[0].node_tree
        env = tree.nodes.of_kind("ShaderNodeTexEnvironment")[0]
        self.assertEqual(env.image.filepath, "p.png")
        self.assertEqual(tree.nodes.of_kind("ShaderNodeVectorMath")[0].inputs[1].default_value, (0, 0, 1.2))
        self.assertAlmostEqual(tree.nodes.of_kind("ShaderNodeMapping")[0].inputs["Rotation"].default_value[2], math.radians(15))
        chain = [(s.node.kind, s.key, t.node.kind, t.key) for s, t in tree.links]
        self.assertEqual(chain, [
            ("ShaderNodeNewGeometry", "Position", "ShaderNodeVectorMath", 0),
            ("ShaderNodeVectorMath", 0, "ShaderNodeMapping", "Vector"),
            ("ShaderNodeMapping", "Vector", "ShaderNodeTexEnvironment", "Vector"),
            ("ShaderNodeTexEnvironment", "Color", "ShaderNodeEmission", "Color"),
            ("ShaderNodeEmission", 0, "ShaderNodeOutputMaterial", "Surface"),
        ])
        self.assertEqual((manifest["height"], manifest["radius"], manifest["yaw"]), (1.2, 10.0, 15.0))

    def test_sun_aims_from_the_brightest_sky_column(self):
        blender, o, manifest, _, _ = self.grounded("--sunel", "40", "--sun", "2.5")
        expected = rg.sun_azimuth(40 / 64, 15.0)
        self.assertAlmostEqual(manifest["sun_az"], expected)
        sun = next(ob for ob in blender.linked if ob.name == "Sun")
        self.assertEqual((sun.data.type, sun.data.energy), ("SUN", 2.5))
        _, direction, track, _ = sun.rotation_euler
        sa, se = math.radians(expected), math.radians(40)
        toward = (math.cos(sa) * math.cos(se), math.sin(sa) * math.cos(se), math.sin(se))
        for got, want in zip(direction, toward):
            self.assertAlmostEqual(got, -want)
        self.assertEqual(track, "-Z")

    def test_explicit_sun_azimuth_skips_the_panorama_scan(self):
        _, _, manifest, _, _ = self.grounded("--sunaz", "-120", pano=(64, 32, None))
        self.assertEqual(manifest["sun_az"], -120.0)

    def test_render_settings_and_gpu_devices(self):
        blender, o, _, _, err = self.grounded("--size", "640", "--samples", "20")
        scene = blender.scene
        self.assertEqual((scene.render.engine, scene.cycles.device), ("CYCLES", "GPU"))
        self.assertTrue(all(d.use for d in blender.devices))
        self.assertEqual((scene.cycles.samples, scene.render.resolution_x, scene.render.resolution_y), (20, 640, 640))
        self.assertEqual(scene.render.image_settings.color_mode, "RGBA")
        self.assertEqual(scene.world.node_tree.nodes["Background"].inputs[1].default_value, 0.0)
        self.assertEqual(err, "")

    def test_missing_gpu_falls_back_to_cpu(self):
        blender, _, manifest, _, err = self.grounded(gpu=False)
        self.assertIn("rendering on CPU", err)
        self.assertFalse(hasattr(blender.scene.cycles, "device"))
        self.assertEqual(len(manifest["views"]), 2)

    def test_search_renders_small_clay_silhouettes_only(self):
        blender = FakeBlender([mesh("Solo", (0, 0, 0), (2, 2, 2))])
        o = opts(self.tmp, "--search")
        manifest, out, _ = blender.run(o)
        self.assertIsNone(blender.dome)
        self.assertIsNone(blender.catcher)
        self.assertNotIn("sphere", [c[0] for c in blender.calls])
        self.assertEqual(len(blender.renders), len(rg.search_list()))
        self.assertTrue(all(r["clay"] and r["transparent"] for r in blender.renders))
        self.assertEqual([r["path"] for r in blender.renders], [v["file"] for v in manifest["views"]])
        self.assertEqual(Path(manifest["views"][0]["file"]), Path(o["out"]) / "search_az-090_el00.png")
        self.assertEqual((blender.scene.cycles.samples, blender.scene.render.resolution_x), (8, 256))
        self.assertEqual([ob.name for ob in blender.linked if getattr(ob.data, "type", None) == "SUN"], ["Key"])
        self.assertIsNone(manifest["sun_az"])
        self.assertEqual(out.strip(), f"DONE {len(rg.search_list())}")


if __name__ == "__main__":
    unittest.main()
