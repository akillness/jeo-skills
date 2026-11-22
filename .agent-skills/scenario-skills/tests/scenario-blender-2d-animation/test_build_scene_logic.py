"""build_scene.py without Blender: its argument checks, and the hero path math it animates from.

The script runs top to bottom inside Blender, so nothing in it can be imported. The argument checks run with a
stub bpy that stops the script the moment it first touches the scene. The path functions and their constants
are compiled from the script's own source, under its own file name, without the scene-building statements.
"""
import ast
import io
import json
import math
import os
import runpy
import shutil
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path
import unittest.mock as mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

BUILD = synth.SCRIPTS / "build_scene.py"


class Reached(Exception):
    """The script passed every argument check and asked Blender for the scene."""


class StubBpy(types.ModuleType):
    """Only what the checks read: the open file's path and object names. Anything else stops the run."""

    def __init__(self, filepath="", objects=()):
        super().__init__("bpy")
        self.data = types.SimpleNamespace(filepath=filepath,
                                          objects=[types.SimpleNamespace(name=n) for n in objects])

    @property
    def context(self):
        raise Reached("context")

    @property
    def ops(self):
        raise Reached("ops")


def stub_mathutils():
    m = types.ModuleType("mathutils")
    m.Vector = tuple
    return m


def run_build(args, bpy=None):
    """Runs build_scene.py as Blender would; returns (outcome, detail, stdout)."""
    argv = ["blender", "--", *map(str, args)]
    stubs = {"bpy": bpy or StubBpy(), "mathutils": stub_mathutils()}
    out = io.StringIO()
    with mock.patch.dict(sys.modules, stubs), mock.patch.object(sys, "argv", argv), redirect_stdout(out):
        try:
            runpy.run_path(str(BUILD), run_name="__main__")
        except SystemExit as e:
            return "exit", e.code, out.getvalue()
        except Reached as e:
            return "reached", str(e), out.getvalue()
    raise AssertionError("the stub let the whole script run")


class ArgumentCheckTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(os.path.abspath(tempfile.mkdtemp()))
        self.addCleanup(shutil.rmtree, self.dir)
        self.set = self.dir / "jungle"
        (self.set / "game").mkdir(parents=True)
        (self.set / "game" / "shapes.json").write_text("{}", encoding="utf-8")
        self.blend = self.dir / "platformer_scene.blend"

    def assertRefused(self, result, *needles):
        outcome, code, out = result
        self.assertEqual((outcome, code), ("exit", 1), out[-500:])
        self.assertIn("Usage (headless)", out)
        for needle in needles:
            self.assertIn(needle, out)

    def test_needs_a_set(self):
        self.assertRefused(run_build([]), "error: pass --set SET_DIR")
        self.assertRefused(run_build(["--set"]), "error: pass --set SET_DIR")

    def test_needs_the_traced_shapes(self):
        (self.set / "game" / "shapes.json").unlink()
        self.assertRefused(run_build(["--set", self.set]), "shapes.json not found", "trace_hulls.py")

    def test_a_valid_set_resets_the_file_and_creates_the_output_folder(self):
        out = self.dir / "renders" / "take1"
        self.assertEqual(run_build(["--set", self.set, "--out", out])[:2], ("reached", "ops"))
        self.assertTrue(out.is_dir())

    def test_keeps_an_existing_blend_unless_forced(self):
        self.blend.write_bytes(b"mine")
        self.assertRefused(run_build(["--set", self.set]), str(self.blend), "pass --force")
        self.assertEqual(run_build(["--set", self.set, "--force"])[:2], ("reached", "ops"))
        self.assertEqual(self.blend.read_bytes(), b"mine")

    def test_the_film_is_checked_only_for_a_final_render(self):
        film = self.dir / "platformer.mp4"
        film.write_bytes(b"film")
        self.assertEqual(run_build(["--set", self.set])[:2], ("reached", "ops"))
        self.assertRefused(run_build(["--set", self.set, "--final"]), str(film))

    def test_the_set_tag_names_the_outputs(self):
        (self.set / "game" / "config.json").write_text(json.dumps({"tag": "_snow"}), encoding="utf-8")
        self.blend.write_bytes(b"jungle")
        self.assertEqual(run_build(["--set", self.set])[:2], ("reached", "ops"))
        (self.dir / "platformer_scene_snow.blend").write_bytes(b"snow")
        self.assertRefused(run_build(["--set", self.set]), "platformer_scene_snow.blend")

    def test_live_accepts_a_new_file(self):
        bpy = StubBpy(objects=("Cube", "Light", "Camera"))
        self.assertEqual(run_build(["--set", self.set, "--live"], bpy)[:2], ("reached", "context"))
        self.assertEqual(run_build(["--set", self.set, "--live"], StubBpy())[:2], ("reached", "context"))

    def test_live_refuses_an_unsaved_scene_with_the_users_objects(self):
        bpy = StubBpy(objects=("Cube", "Light", "Camera", "Tree"))
        self.assertRefused(run_build(["--set", self.set, "--live"], bpy), "save your work")

    def test_live_accepts_only_its_own_saved_output(self):
        own = StubBpy(filepath=str(self.blend), objects=("Hero", "Palm"))
        self.assertEqual(run_build(["--set", self.set, "--live"], own)[:2], ("reached", "context"))
        other = StubBpy(filepath=str(self.dir / "my_work.blend"))
        self.assertRefused(run_build(["--set", self.set, "--live"], other), "save your work")


FUNCTIONS = {"hero_x", "hero_z", "airborne", "smooth", "span", "key"}
CONSTANTS = {"END", "FPS", "SPEED", "ISLAND_X", "ISLAND_W", "ISLAND_TOP", "JUMPS", "X0", "CAM_MIN", "CAM_MAX"}


def path_logic():
    """The path functions and their constants, compiled from build_scene.py in source order."""
    tree = ast.parse(BUILD.read_text(encoding="utf-8"))
    body, found = [], set()
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in FUNCTIONS:
            names = {node.name}
        elif isinstance(node, ast.Assign):
            names = {n.id for t in node.targets for n in ast.walk(t) if isinstance(n, ast.Name)}
            if not names <= CONSTANTS:
                continue
        else:
            continue
        body.append(node)
        found |= names
    missing = (FUNCTIONS | CONSTANTS) - found
    if missing:
        raise AssertionError(f"build_scene.py no longer defines {sorted(missing)} at the top level")
    ns = {"math": math}
    exec(compile(ast.Module(body=body, type_ignores=[]), str(BUILD), "exec"), ns)
    return types.SimpleNamespace(**ns)


class HeroPathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = path_logic()

    def test_runs_at_a_constant_speed_from_the_start(self):
        s = self.s
        self.assertEqual(s.hero_x(1), s.X0)
        self.assertAlmostEqual(s.hero_x(11) - s.hero_x(1), 10 * s.SPEED)

    def test_every_jump_leaves_and_lands_on_its_ends(self):
        for f0, f1, _, _, z0, z1, _ in self.s.JUMPS:
            self.assertAlmostEqual(self.s.hero_z(f0), z0, msg=f0)
            self.assertAlmostEqual(self.s.hero_z(f1), z1, msg=f1)

    def test_peaks_halfway_above_the_higher_end(self):
        for f0, f1, _, _, z0, z1, peak in self.s.JUMPS:
            top = max(z0, z1) + peak
            heights = [self.s.hero_z(f) for f in range(f0, f1 + 1)]
            self.assertLessEqual(max(heights), top + 1e-9)
            self.assertGreater(max(heights), top - 0.05)
            if (f1 - f0) % 2 == 0:
                self.assertAlmostEqual(self.s.hero_z((f0 + f1) // 2), top)

    def test_stands_on_the_island_between_the_first_two_jumps(self):
        s = self.s
        between = range(s.JUMPS[0][1] + 1, s.JUMPS[1][0])
        self.assertTrue(between)
        self.assertEqual({s.hero_z(f) for f in between}, {s.ISLAND_TOP})
        self.assertEqual(s.hero_z(1), 0.0)
        self.assertEqual(s.hero_z(s.END), 0.0)

    def test_the_path_never_jumps_between_frames(self):
        z = [self.s.hero_z(f) for f in range(1, self.s.END + 1)]
        self.assertLess(max(abs(b - a) for a, b in zip(z, z[1:])), 1.0)
        self.assertGreaterEqual(min(z), 0.0)

    def test_airborne_only_strictly_between_take_off_and_landing(self):
        s = self.s
        for f0, f1, *_ in s.JUMPS:
            self.assertFalse(s.airborne(f0))
            self.assertFalse(s.airborne(f1))
            self.assertTrue(all(s.airborne(f) for f in range(f0 + 1, f1)))
        self.assertFalse(s.airborne(1))
        self.assertFalse(s.airborne(s.JUMPS[0][1] + 3))        # on the island

    def test_smooth_eases_in_and_out(self):
        smooth = self.s.smooth
        self.assertEqual((smooth(0), smooth(0.5), smooth(1)), (0, 0.5, 1))
        ts = [i / 20 for i in range(21)]
        self.assertEqual([smooth(t) for t in ts], sorted(smooth(t) for t in ts))
        self.assertLess(smooth(0.05), 0.05)
        self.assertGreater(smooth(0.95), 0.95)

    def test_a_layer_spans_the_camera_travel_it_does_not_share(self):
        s = self.s
        self.assertEqual(s.span(1.0), (-9.5, 9.5))                 # moves with the camera: only the pad
        self.assertEqual(s.span(0.0, pad=2), (s.CAM_MIN - 2, s.CAM_MAX + 2))
        lo, hi = s.span(-0.45)
        self.assertLess(lo, s.span(0.0)[0])                         # faster than the ground: wider still
        self.assertGreater(hi, s.span(0.0)[1])
        self.assertAlmostEqual(s.CAM_MAX, s.hero_x(s.END) + 3.0)

    def test_key_sets_the_value_then_keys_it(self):
        class Ob:
            def __init__(self):
                self.location, self.scale, self.keys = (0, 0, 0), [1.0, 1.0, 1.0], []

            def keyframe_insert(self, path, index=-1, frame=None):
                self.keys.append((path, index, frame))

        ob = Ob()
        self.s.key(ob, "location", 5, value=(1, 2, 3))
        self.s.key(ob, "scale", 7, value=0.5, index=2)
        self.s.key(ob, "location", 9)
        self.assertEqual(ob.location, (1, 2, 3))
        self.assertEqual(ob.scale, [1.0, 1.0, 0.5])
        self.assertEqual(ob.keys, [("location", -1, 5), ("scale", 2, 7), ("location", -1, 9)])


if __name__ == "__main__":
    unittest.main()
