"""scene.py's Blender-side rig on duck-typed fakes (blender_fakes.py).

mathutils' track_quat is Blender's own math, so it is patched to a plain look direction;
every assertion is about what the rig code decides: frames, keys, presets, settings.
"""

import math
import sys
import tempfile
import unittest
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

import blender_fakes as fakes
import helpers

common = helpers.load("common")
scene = helpers.load("scene")


def rig_config(**overrides):
    config = {
        "shots": [helpers.shot("Wide"), helpers.shot("Detail", 1.5, 1.2)],
        "shot_seconds": 0.25,
        "fps": 24,
        "samples": 16,
        "width": 640,
        "height": 360,
        "rig_scale": 1,
        "rig_origin": [0, 0, 0],
    }
    config.update(overrides)
    return config


class Patched(unittest.TestCase):
    """Installs a fake bpy (and fake mathutils) and a plain track_quaternion per test."""

    def setUp(self):
        self.scene = fakes.Scene()
        self.bpy = fakes.bpy_module(self.scene)
        modules = {"bpy": self.bpy, "mathutils": fakes.mathutils_module()}
        mock.patch.dict(sys.modules, modules).start()
        mock.patch.object(scene, "track_quaternion", fakes.look_quaternion).start()
        self.addCleanup(mock.patch.stopall)


class PerpendicularTests(unittest.TestCase):
    def test_no_perpendicular_when_both_hints_are_parallel(self):
        with self.assertRaises(ValueError) as caught:
            scene.perpendicular((0, -1, 0), preferred=scene.RIG_FRONT)
        self.assertIn("no perpendicular", str(caught.exception))


class ConfigureRenderTests(unittest.TestCase):
    def render_scene(self, ray_tracing=True):
        target = fakes.Scene()
        if ray_tracing:
            target.eevee.ray_tracing_options = SimpleNamespace(
                resolution_scale="1", use_denoise=False
            )
        return target

    def test_full_resolution_settings_and_frame_range(self):
        target = self.render_scene()
        config = rig_config()
        applied = scene.configure_render(target, config, preview=False)
        render = target.render
        self.assertEqual(render.engine, "BLENDER_EEVEE")
        self.assertEqual((render.resolution_x, render.resolution_y), (640, 360))
        self.assertEqual(render.resolution_percentage, 100)
        self.assertEqual(render.fps, 24)
        self.assertFalse(render.use_border)
        self.assertFalse(hasattr(render, "use_stamp"))
        self.assertEqual(render.image_settings.color_management, "FOLLOW_SCENE")
        self.assertEqual(render.image_settings.file_format, "PNG")
        self.assertEqual(target.display_settings.display_device, "sRGB")
        self.assertEqual((target.frame_start, target.frame_end), (1, 12))
        self.assertEqual(target.view_settings.view_transform, "AgX")
        self.assertEqual(target.view_settings.look, "AgX - Medium High Contrast")
        self.assertEqual((target.view_settings.exposure, target.view_settings.gamma), (0.0, 1))
        self.assertEqual(target.eevee.taa_render_samples, 16)
        self.assertEqual(
            applied,
            {
                "taa_render_samples": 16,
                "use_raytracing": True,
                "ray_tracing_options": {"resolution_scale": "2", "use_denoise": True},
            },
        )

    def test_preview_halves_resolution_and_skips_missing_ray_tracing(self):
        target = self.render_scene(ray_tracing=False)
        applied = scene.configure_render(target, rig_config(shots=[helpers.shot("A")]), True)
        self.assertEqual(target.render.resolution_percentage, 50)
        self.assertEqual(target.frame_end, 6)
        self.assertNotIn("ray_tracing_options", applied)


class AreaLightTests(Patched):
    def test_light_is_scaled_placed_and_linked(self):
        spec = scene.STRIP_LIGHT
        obj = scene.add_area_light(self.scene, spec, (10, 0, 0), 2)
        self.assertIn(obj, self.scene.objects)
        self.assertEqual(obj.type, "LIGHT")
        self.assertEqual(obj.name, scene.STRIP_NAME)
        self.assertEqual(obj.data.energy, 100 * 4)
        self.assertEqual(obj.data.size, 2)
        self.assertEqual(obj.data.size_y, 6)
        self.assertEqual(obj.data.shape, "RECTANGLE")
        self.assertEqual(obj.location, (10, -8, 16))
        # Aimed at the target (0, 0, 4) in rig units, (10, 0, 8) in scene units.
        expected = fakes.look_quaternion((10, -8, 16), (10, 0, 8)).to_euler()
        for got, want in zip(obj.rotation_euler, expected):
            self.assertAlmostEqual(got, want)

    def test_disk_light_keeps_its_default_height(self):
        obj = scene.add_area_light(self.scene, scene.FIXED_LIGHTS[0], (0, 0, 0), 1)
        self.assertEqual(obj.data.shape, "DISK")
        self.assertEqual(obj.data.size_y, fakes.LightData("x", "AREA").size_y)


class WorldTests(Patched):
    def test_world_is_created_when_missing_and_lit_by_the_environment(self):
        with tempfile.TemporaryDirectory() as folder:
            hdri = Path(folder) / "studio.exr"
            Image.new("RGB", (2, 2)).save(hdri, format="PNG")
            note = scene.build_world(self.scene, hdri)
        self.assertEqual(note, "studio.exr, strength 0.45, rotation 35 degrees")
        self.assertEqual(self.scene.world.name, "Comparison World")
        tree = self.scene.world.node_tree
        self.assertTrue(self.scene.world.use_nodes)
        env = tree.nodes.of_kind("ShaderNodeTexEnvironment")[0]
        self.assertTrue(env.image.packed)
        mapping = tree.nodes.of_kind("ShaderNodeMapping")[0]
        self.assertAlmostEqual(mapping.inputs["Rotation"].default_value[2], math.radians(35))
        self.assertIs(tree.links.source(env.inputs["Vector"]).node, mapping)
        mix = tree.nodes.of_kind("ShaderNodeMixShader")[0]
        factor = tree.links.source(mix.inputs[0])
        self.assertEqual((factor.node.kind, factor.key), ("ShaderNodeLightPath", "Is Camera Ray"))
        # Camera rays (factor 1) take input 2: the flat backdrop, not the HDRI.
        backdrop = tree.links.source(mix.inputs[2]).node
        self.assertEqual(backdrop.inputs["Color"].default_value, scene.BACKDROP)
        lighting = tree.links.source(mix.inputs[1]).node
        self.assertEqual(lighting.inputs["Strength"].default_value, scene.ENVIRONMENT_STRENGTH)
        self.assertIs(tree.links.source(lighting.inputs["Color"]).node, env)

    def test_existing_world_is_rebuilt_from_scratch(self):
        world = fakes.IDBlock("Source World")
        world.node_tree.nodes.new("ShaderNodeBackground").name = "stale"
        self.scene.world = world
        with tempfile.TemporaryDirectory() as folder:
            hdri = Path(folder) / "sky.exr"
            Image.new("RGB", (2, 2)).save(hdri, format="PNG")
            scene.build_world(self.scene, hdri)
        self.assertIs(self.scene.world, world)
        self.assertFalse(any(getattr(n, "name", "") == "stale" for n in world.node_tree.nodes))
        self.assertEqual(len(world.node_tree.nodes.of_kind("ShaderNodeOutputWorld")), 1)


class CameraTests(Patched):
    def test_new_camera_replaces_a_stale_one_and_clips_past_far_meshes(self):
        stale = self.bpy.data.objects.new(scene.CAMERA_NAME, fakes.CameraData("old"))
        far = fakes.SceneObject("Far", fakes.Mesh(), location=(0, 3000, 0))
        decoy = fakes.SceneObject("Lamp", fakes.LightData("l", "AREA"), location=(0, 9000, 0))
        self.scene.objects += [far, decoy]
        camera = scene.ensure_camera(self.scene, rig_config())
        self.assertEqual(stale.name, f"{scene.CAMERA_NAME} (previous)")
        self.assertEqual(camera.name, scene.CAMERA_NAME)
        self.assertIs(self.scene.camera, camera)
        self.assertIn(camera, self.scene.objects)
        data = camera.data
        self.assertEqual(
            (data.type, data.lens, data.sensor_width, data.sensor_fit),
            ("PERSP", 85, 36, "HORIZONTAL"),
        )
        self.assertEqual((data.shift_x, data.shift_y, data.dof.use_dof), (0, 0, False))
        self.assertEqual(data.clip_start, scene.CLIP_START)
        self.assertEqual(camera.rotation_mode, "QUATERNION")
        # The mesh at y=3000 needs more than the default; the light at 9000 is not geometry.
        self.assertGreater(data.clip_end, 1.25 * 3000)
        self.assertLess(data.clip_end, 1.25 * 9000)

    def test_small_scene_keeps_the_default_clip(self):
        self.scene.objects.append(fakes.SceneObject("Cube", fakes.Mesh()))
        camera = scene.ensure_camera(self.scene, rig_config())
        self.assertEqual(camera.data.clip_end, scene.DEFAULT_CLIP_END)


class AnimateTests(Patched):
    def rig(self):
        camera = self.bpy.data.objects.new("Cam", fakes.CameraData("Cam"))
        strip = self.bpy.data.objects.new("Strip", fakes.LightData("Strip", "AREA"))
        return camera, strip

    def test_every_frame_is_keyed_from_the_shared_pose_math(self):
        config = rig_config()
        camera, strip = self.rig()
        records = scene.animate(self.scene, config, camera, strip)
        count = common.shot_frames(config)
        self.assertEqual(count, 6)
        self.assertEqual(self.scene.markers, [("Wide", 1), ("Detail", 7)])
        self.assertEqual([r["frame"] for r in records], list(range(1, 13)))
        self.assertEqual([r["shot"] for r in records], ["Wide"] * 6 + ["Detail"] * 6)
        for prop in ("location", "rotation_quaternion"):
            self.assertEqual([f for p, f, _ in camera.keys if p == prop], list(range(1, 13)))
        for prop in ("location", "rotation_euler"):
            self.assertEqual([f for p, f, _ in strip.keys if p == prop], list(range(1, 13)))
        for prop in ("energy", "size", "size_y"):
            self.assertEqual(len([k for k in strip.data.keys if k[0] == prop]), 12)
        shot = config["shots"][1]
        last = records[-1]
        pose = scene.camera_pose(shot["start"], shot["end"], 1.0)
        sweep = scene.strip_pose(pose["target"], pose["direction"], pose["width"], 1.0, 1)
        for got, want in zip(last["location"], pose["location"]):
            self.assertAlmostEqual(got, want)
        self.assertEqual(last["light_power"], sweep["energy"])
        self.assertEqual(last["light_width"], sweep["size"])
        self.assertEqual(last["lens"], camera.data.lens)
        first = records[0]
        start = scene.camera_pose(config["shots"][0]["start"], config["shots"][0]["end"], 0.0)
        self.assertEqual(first["target"], list(start["target"]))

    def test_vertical_view_keeps_the_heading_of_the_previous_frame(self):
        shot = {
            "name": "Over",
            "start": [[0, 0, 1], [1, -1, 0], 4],
            "end": [[0, 0, 1], [0, 0, 1], 4],
        }
        config = rig_config(shots=[shot])
        camera, strip = self.rig()
        records = scene.animate(self.scene, config, camera, strip)
        count = common.shot_frames(config)
        previous = scene.camera_pose(shot["start"], shot["end"], scene.ease_at(count - 2, count))
        heading = scene.strip_pose(
            previous["target"], previous["direction"], previous["width"], 0, 1
        )["front"]
        top = scene.camera_pose(shot["start"], shot["end"], 1.0)
        self.assertLess(math.hypot(*top["direction"][:2]), 1e-6)
        kept = scene.strip_pose(top["target"], top["direction"], top["width"], 1.0, 1, heading)
        reset = scene.strip_pose(top["target"], top["direction"], top["width"], 1.0, 1)
        self.assertEqual(records[-1]["light_location"], list(kept["location"]))
        self.assertNotEqual(records[-1]["light_location"], list(reset["location"]))


class TidyTests(Patched):
    def test_camera_view_and_material_shading_in_every_3d_view(self):
        class Hidden:
            def select_set(self, state):
                raise RuntimeError("not in view layer")

        visible = SimpleNamespace(selected=True)
        visible.select_set = lambda state: setattr(visible, "selected", state)
        self.scene.objects += [visible, Hidden()]
        self.bpy.context.view_layer.objects = SimpleNamespace(active=visible)

        def area(kind):
            space = SimpleNamespace(
                region_3d=SimpleNamespace(view_perspective="PERSP"),
                shading=SimpleNamespace(type="SOLID"),
            )
            return SimpleNamespace(type=kind, spaces=SimpleNamespace(active=space))

        view, editor = area("VIEW_3D"), area("NODE_EDITOR")
        self.bpy.data.screens = [SimpleNamespace(areas=[view, editor])]
        scene.tidy_ui(self.scene)
        self.assertEqual(self.scene.current_frame, 1)
        self.assertFalse(visible.selected)
        self.assertIsNone(self.bpy.context.view_layer.objects.active)
        self.assertEqual(view.spaces.active.region_3d.view_perspective, "CAMERA")
        self.assertEqual(view.spaces.active.shading.type, "MATERIAL")
        self.assertEqual(editor.spaces.active.region_3d.view_perspective, "PERSP")
        self.assertEqual(editor.spaces.active.shading.type, "SOLID")


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        resources = Path(self.folder.name) / "resources"
        world = resources / "datafiles" / "studiolights" / "world"
        world.mkdir(parents=True)
        for name in ("forest.exr", "studio.exr"):
            Image.new("RGB", (2, 2)).save(world / name, format="PNG")
        self.resources = resources

    def build(self, mode="original", preview=False, **overrides):
        stage = fakes.Scene(
            [
                fakes.SceneObject("Cube", fakes.Mesh(), location=(0, 0, 1)),
                fakes.SceneObject("Old Sun", fakes.LightData("Sun", "SUN")),
            ]
        )
        bpy = fakes.bpy_module(stage)
        roots = {"LOCAL": None, "SYSTEM": str(self.resources)}
        bpy.utils = SimpleNamespace(resource_path=roots.get)
        modules = {"bpy": bpy, "mathutils": fakes.mathutils_module()}
        with mock.patch.dict(sys.modules, modules):
            with mock.patch.object(scene, "track_quaternion", fakes.look_quaternion):
                return scene.setup(rig_config(**overrides), mode, preview)

    def test_rig_replaces_the_scene_lights_and_records_a_contract(self):
        built, records, contract = self.build("patina", preview=True)
        lights = [o.name for o in built.objects if o.type == "LIGHT"]
        expected = [spec[0] for spec in scene.FIXED_LIGHTS] + [scene.STRIP_NAME]
        self.assertEqual(lights, expected)
        self.assertNotIn("Old Sun", [o.name for o in built.objects])
        self.assertEqual(len(records), 12)
        self.assertEqual(built.properties["comparison_pass"], "patina")
        self.assertEqual(built.render.resolution_percentage, 50)
        self.assertEqual(contract["pass_name"], "patina")
        self.assertEqual(contract["blender"], "5.0.1")
        self.assertEqual(contract["shots"], rig_config()["shots"])
        cube = [o for o in built.objects if o.name == "Cube"]
        self.assertEqual(contract["geometry_sha256"], common.geometry_hash(cube))
        settings = contract["settings"]
        self.assertTrue(settings["environment"].startswith("studio.exr"))
        self.assertEqual(settings["frames"], 12)
        self.assertEqual(settings["resolution"], [640, 360])
        self.assertEqual([light["name"] for light in settings["lights"]], expected)
        self.assertEqual(settings["camera"]["sensor_fit"], "HORIZONTAL")
        self.assertEqual(settings["look"], "AgX - Medium High Contrast")

    def test_both_passes_share_one_contract_and_a_new_shot_changes_it(self):
        _, _, original = self.build("original")
        _, _, patina = self.build("patina")
        for key in ("camera_sha256", "settings", "geometry_sha256"):
            self.assertEqual(original[key], patina[key], key)
        _, _, moved = self.build("patina", shots=[helpers.shot("Wide", 5.0, 4.0)])
        self.assertNotEqual(moved["camera_sha256"], original["camera_sha256"])

    def test_configured_environment_wins_over_the_bundled_one(self):
        hdri = Path(self.folder.name) / "own.hdr"
        Image.new("RGB", (2, 2)).save(hdri, format="PNG")
        _, _, contract = self.build(environment=str(hdri))
        self.assertTrue(contract["settings"]["environment"].startswith("own.hdr"))


if __name__ == "__main__":
    unittest.main()
