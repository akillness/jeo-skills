import math
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import helpers

scene = helpers.load("scene")


def length(vector):
    return math.sqrt(sum(v * v for v in vector))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def angle_between(a, b):
    return math.acos(max(-1.0, min(1.0, scene.dot(a, b) / (length(a) * length(b)))))


class EasingTests(unittest.TestCase):
    def test_smoothstep_endpoints_and_midpoint(self):
        self.assertEqual(scene.smoothstep(0), 0)
        self.assertEqual(scene.smoothstep(1), 1)
        self.assertAlmostEqual(scene.smoothstep(0.5), 0.5)
        self.assertLess(scene.smoothstep(0.25), 0.25)
        self.assertGreater(scene.smoothstep(0.75), 0.75)

    def test_ease_at_spans_the_shot(self):
        self.assertEqual(scene.ease_at(0, 132), 0)
        self.assertEqual(scene.ease_at(131, 132), 1)
        self.assertEqual(scene.ease_at(0, 1), 0)


class DirectionTests(unittest.TestCase):
    def test_slerp_bisects_the_angle_at_the_midpoint(self):
        a, b = (0, -1, 0), (1, 0, 0)
        mid = scene.slerp(a, b, 0.5)
        self.assertAlmostEqual(length(mid), 1)
        self.assertAlmostEqual(angle_between(a, mid), angle_between(mid, b))
        self.assertAlmostEqual(angle_between(a, mid), math.pi / 4)
        for t, expected in ((0, a), (1, b)):
            for got, want in zip(scene.slerp(a, b, t), expected):
                self.assertAlmostEqual(got, want)

    def test_slerp_turns_at_a_constant_rate(self):
        a, b = (-1, 0, 0.3), (1, 0.4, 0.3)
        steps = [scene.slerp(a, b, i / 20) for i in range(21)]
        turns = [angle_between(x, y) for x, y in zip(steps, steps[1:])]
        for turn in turns:
            self.assertAlmostEqual(turn, turns[0])

    def test_opposite_directions_arc_through_world_up(self):
        mid = scene.slerp((0, -1, 0), (0, 1, 0), 0.5)
        for got, want in zip(mid, (0, 0, 1)):
            self.assertAlmostEqual(got, want)
        quarter = scene.slerp((0, -1, 0), (0, 1, 0), 0.25)
        self.assertAlmostEqual(length(quarter), 1)
        self.assertGreater(quarter[2], 0)
        self.assertLess(quarter[1], 0)

    def test_opposite_vertical_directions_arc_through_the_rig_front(self):
        mid = scene.slerp((0, 0, 1), (0, 0, -1), 0.5)
        for got, want in zip(mid, scene.RIG_FRONT):
            self.assertAlmostEqual(got, want)

    def test_identical_directions_are_kept(self):
        self.assertEqual(scene.slerp((0, -2, 0), (0, -2, 0), 0.3), (0.0, -1.0, 0.0))


class CameraTests(unittest.TestCase):
    start = [[0, 0, 4], [-0.5, -1, 0.5], 20]
    end = [[1, 0, 4], [0.5, -1, 0.5], 18]

    def test_distance_frames_the_visible_width(self):
        self.assertAlmostEqual(scene.camera_distance(36), 85)
        self.assertAlmostEqual(scene.camera_distance(20), 20 * 85 / 36)
        self.assertAlmostEqual(scene.camera_distance(10, lens=50, sensor_width=36), 10 * 50 / 36)

    def test_pose_sits_at_the_framing_distance_along_the_direction(self):
        for ease in (0, 0.3, 1):
            pose = scene.camera_pose(self.start, self.end, ease)
            offset = sub(pose["location"], pose["target"])
            self.assertAlmostEqual(length(offset), scene.camera_distance(pose["width"]))
            self.assertAlmostEqual(length(pose["direction"]), 1)
            for o, d in zip(offset, pose["direction"]):
                self.assertAlmostEqual(o / length(offset), d)

    def test_pose_endpoints_match_the_shot(self):
        first = scene.camera_pose(self.start, self.end, 0)
        last = scene.camera_pose(self.start, self.end, 1)
        self.assertEqual(first["target"], (0, 0, 4))
        self.assertEqual(last["target"], (1, 0, 4))
        self.assertAlmostEqual(first["width"], 20)
        self.assertAlmostEqual(last["width"], 18)

    def test_camera_looks_at_the_target(self):
        pose = scene.camera_pose(self.start, self.end, 0.5)
        view = sub(pose["target"], pose["location"])
        cosine = sum(v * d for v, d in zip(view, pose["direction"])) / length(view)
        self.assertAlmostEqual(cosine, -1)

    def test_turnaround_shot_never_collapses(self):
        start, end = [[0, 0, 1], [0, -1, 0], 4], [[0, 0, 1], [0, 1, 0], 4]
        count = 27  # ease hits exactly 0.5 on an odd frame count
        for index in range(count):
            pose = scene.camera_pose(start, end, scene.ease_at(index, count))
            self.assertAlmostEqual(length(pose["direction"]), 1)
            self.assertTrue(all(math.isfinite(v) for v in pose["location"]))
        self.assertGreater(scene.camera_pose(start, end, 0.5)["location"][2], 1)

    def test_far_clip_covers_every_corner_and_never_shrinks_below_default(self):
        config = {"shots": [helpers.shot("A", 4.0, 3.5)]}
        self.assertEqual(scene.far_clip(config), scene.DEFAULT_CLIP_END)
        far = scene.far_clip(config, [(0, 900, 0)])
        self.assertGreater(far, 900 * 1.25)
        endpoint = [[0, 0, 0], [0, -1, 0], 800]
        huge = {"shots": [{"name": "H", "start": endpoint, "end": endpoint}]}
        self.assertAlmostEqual(scene.far_clip(huge), 1.25 * scene.camera_distance(800))


class LightTests(unittest.TestCase):
    def test_rig_light_scales_with_the_rig(self):
        one = scene.rig_light((-6, -7, 12), 1250, 4.0, (0, 0, 4.5), (0, 0, 0), 1, None)
        two = scene.rig_light((-6, -7, 12), 1250, 4.0, (0, 0, 4.5), (1, 2, 3), 2, 3)
        self.assertEqual(one["location"], (-6, -7, 12))
        self.assertEqual(two["location"], (-11, -12, 27))
        self.assertEqual(two["target"], (1, 2, 12))
        self.assertEqual(two["power"], 1250 * 4)
        self.assertEqual(two["size"], 8.0)
        self.assertEqual(two["size_y"], 6)
        self.assertIsNone(one["size_y"])

    def test_strip_pose_depends_on_rig_scale(self):
        target, direction = (0, 0, 1), (0, -1, 0)
        small = scene.strip_pose(target, direction, 2.0, 0.5, 1)
        large = scene.strip_pose(target, direction, 4.0, 0.5, 2)
        for s, l in zip(sub(small["location"], target), sub(large["location"], target)):
            self.assertAlmostEqual(l, 2 * s)
        self.assertAlmostEqual(large["energy"], 4 * small["energy"])
        self.assertAlmostEqual(large["size"], 2 * small["size"])
        self.assertAlmostEqual(large["size_y"], 2 * small["size_y"])

    def test_strip_presets_hold_outside_the_band(self):
        close = scene.strip_pose((0, 0, 0), (0, -1, 0), 5.0, 0, 1)
        wide = scene.strip_pose((0, 0, 0), (0, -1, 0), 7.0, 0, 1)
        self.assertAlmostEqual(length(sub(close["location"], (0, 0, 4.5 * 0.48))), 4.5)
        self.assertAlmostEqual(length(sub(wide["location"], (0, 0, 11 * 0.48))), 11)
        self.assertEqual((close["energy"], close["size"], close["size_y"]), (260, 0.6, 2.8))
        self.assertEqual((wide["energy"], wide["size"], wide["size_y"]), (600, 2, 8))
        self.assertEqual(scene.strip_pose((0, 0, 0), (0, -1, 0), 1.0, 0, 1), close)
        self.assertEqual(scene.strip_pose((0, 0, 0), (0, -1, 0), 40.0, 0, 1), wide)

    def test_strip_blends_continuously_across_the_band(self):
        widths = [5 + i / 100 for i in range(201)]
        poses = [scene.strip_pose((0, 0, 0), (0, -1, 0), w, 0.4, 1) for w in widths]
        for before, after in zip(poses, poses[1:]):
            self.assertLess(length(sub(after["location"], before["location"])), 0.2)
            for key in ("energy", "size", "size_y"):
                self.assertGreaterEqual(after[key], before[key])
                self.assertLess(after[key] - before[key], (600 - 260) * 0.02)
        at_six = scene.strip_pose((0, 0, 0), (0, -1, 0), 6.0, 0.4, 1)
        self.assertAlmostEqual(at_six["energy"], (600 + 260) / 2)
        self.assertAlmostEqual(length(sub(at_six["location"], (0, 0, 7.75 * 0.48))), 7.75)

    def test_strip_sweeps_ninety_degrees(self):
        target, direction = (0, 0, 0), (0, -1, 0)
        first = scene.strip_pose(target, direction, 2.0, 0, 1)["location"]
        last = scene.strip_pose(target, direction, 2.0, 1, 1)["location"]
        first, last = first[:2], last[:2]
        dot = sum(a * b for a, b in zip(first, last))
        self.assertAlmostEqual(dot / (length(first) * length(last)), 0)

    def test_strip_survives_a_top_down_camera(self):
        first = scene.strip_pose((0, 0, 0.5), (0, 0, 1.0), 3.0, 0, 1)
        last = scene.strip_pose((0, 0, 0.5), (0, 0, 1.0), 3.0, 1, 1)
        self.assertEqual(first["front"], scene.RIG_FRONT)
        for pose in (first, last):
            self.assertTrue(all(math.isfinite(v) for v in pose["location"]))
        self.assertEqual(first, scene.strip_pose((0, 0, 0.5), scene.RIG_FRONT, 3.0, 0, 1))
        a, b = sub(first["location"], (0, 0, 0.5))[:2], sub(last["location"], (0, 0, 0.5))[:2]
        self.assertAlmostEqual(sum(x * y for x, y in zip(a, b)), 0)

    def test_strip_keeps_the_previous_heading_when_the_view_turns_vertical(self):
        heading = scene.strip_pose((0, 0, 0), (1, 0, 0.2), 3.0, 0.5, 1)["front"]
        overhead = scene.strip_pose((0, 0, 0), (0, 0, 1), 3.0, 0.5, 1, heading)
        self.assertEqual(overhead["front"], heading)
        self.assertEqual(overhead, scene.strip_pose((0, 0, 0), heading, 3.0, 0.5, 1))

    def test_orbit_through_the_zenith_renders_every_frame(self):
        start, end = [[0, 0, 0], [1, 0, 0.5], 3], [[0, 0, 0], [-1, 0, 0.5], 3]
        front = scene.RIG_FRONT
        for index in range(123):
            pose = scene.camera_pose(start, end, scene.ease_at(index, 123))
            sweep = scene.strip_pose(
                pose["target"], pose["direction"], pose["width"], 0.5, 1, front
            )
            front = sweep["front"]
            self.assertTrue(all(math.isfinite(v) for v in sweep["location"]))


class FakeEnum:
    """A Blender-like property: unknown identifiers raise TypeError from the setter."""

    def __init__(self, attribute, allowed, initial):
        object.__setattr__(self, "attribute", attribute)
        object.__setattr__(self, "allowed", set(allowed))
        object.__setattr__(self, "value", initial)
        object.__setattr__(self, "attempts", [])

    def __getattr__(self, name):
        if name == object.__getattribute__(self, "attribute"):
            return object.__getattribute__(self, "value")
        raise AttributeError(name)

    def __setattr__(self, name, value):
        self.attempts.append(value)
        if value not in self.allowed:
            raise TypeError(f'enum "{value}" not found in {sorted(self.allowed)}')
        object.__setattr__(self, "value", value)


class PickerTests(unittest.TestCase):
    def test_look_takes_the_first_identifier_that_sticks(self):
        prefixed = "AgX - Medium High Contrast"
        view = FakeEnum("look", ["None", prefixed], "None")
        self.assertEqual(scene.pick_look(view), prefixed)
        self.assertEqual(view.look, prefixed)
        view = FakeEnum("look", ["None", "Medium High Contrast"], "None")
        self.assertEqual(scene.pick_look(view), "Medium High Contrast")
        self.assertEqual(view.attempts, [prefixed, "Medium High Contrast"])

    def test_look_falls_back_to_none(self):
        view = FakeEnum("look", ["None", "Punchy"], "Punchy")
        self.assertEqual(scene.pick_look(view), "None")
        self.assertEqual(view.look, "None")

    def test_engine_prefers_the_current_identifier_and_never_guesses(self):
        render = FakeEnum("engine", ["BLENDER_EEVEE", "CYCLES"], "CYCLES")
        self.assertEqual(scene.pick_engine(render), "BLENDER_EEVEE")
        render = FakeEnum("engine", ["BLENDER_EEVEE_NEXT", "CYCLES"], "CYCLES")
        self.assertEqual(scene.pick_engine(render), "BLENDER_EEVEE_NEXT")
        with self.assertRaises(ValueError):
            scene.pick_engine(FakeEnum("engine", ["CYCLES"], "CYCLES"))

    def test_assign_first_reads_the_value_back(self):
        class Sticky:
            def __init__(self):
                self.__dict__["look"] = "None"

            def __setattr__(self, name, value):
                pass  # a setter that silently ignores the assignment

        self.assertEqual(scene.assign_first(Sticky(), "look", ("A", "B"), fallback="None"), "None")

    def test_set_present_only_touches_existing_attributes(self):
        target = SimpleNamespace(a=1)
        applied = scene.set_present(target, {"a": 2, "b": 3})
        self.assertEqual(applied, {"a": 2})
        self.assertEqual(target.a, 2)
        self.assertFalse(hasattr(target, "b"))


class EnvironmentTests(unittest.TestCase):
    def test_configured_path(self):
        with tempfile.TemporaryDirectory() as folder:
            hdri = Path(folder) / "studio.hdr"
            hdri.write_bytes(b"x")
            self.assertEqual(scene.find_environment(str(hdri), []), hdri)
            with self.assertRaises(FileNotFoundError):
                scene.find_environment(str(Path(folder) / "missing.exr"), [])

    def test_bundled_search_prefers_studio(self):
        with tempfile.TemporaryDirectory() as folder:
            world = Path(folder) / "5.0" / "datafiles" / "studiolights" / "world"
            world.mkdir(parents=True)
            (world / "city.exr").write_bytes(b"x")
            self.assertEqual(scene.find_environment(None, ["", folder]), world / "city.exr")
            (world / "studio.exr").write_bytes(b"x")
            self.assertEqual(scene.find_environment(None, [folder, ""]), world / "studio.exr")

    def test_nothing_found_tells_the_user_what_to_set(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError) as caught:
                scene.find_environment(None, [folder, "", None])
        self.assertIn("environment", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
