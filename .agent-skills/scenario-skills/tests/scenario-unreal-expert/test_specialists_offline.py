"""Runs the file-reading entry points of three Unreal specialists with system Python.

It covers ue_anim.apply_ini_plan, the ue_light CLI subcommands that read a file, and
ue_world's check-spec command. Inputs are synthetic files in a temporary folder.
It needs no Unreal Editor and no numpy: the frame and compare tests patch
frame_report and compare_ground_truth. The leak checks pin that each file handle
is closed before the function returns. The encoding check needs Python 3.10 or later.
"""

import contextlib
import copy
import gc
import io
import json
import pathlib
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import unittest.mock as mock
import warnings

REPO = pathlib.Path(__file__).resolve().parents[2]
FAMILY = REPO / "skills" / "game-engines" / "unreal"
for skill in ("scenario-unreal-animation", "scenario-unreal-lighting-rendering", "scenario-unreal-world-building"):
    sys.path.insert(0, str(FAMILY / skill / "scripts"))

import ue_anim  # noqa: E402
import ue_light  # noqa: E402
import ue_world  # noqa: E402


class TempDirCase(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def write(self, name, data):
        path = self.tmp / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, bytes):
            path.write_bytes(data)
        else:
            path.write_text(data, encoding="utf-8")
        return path

    @contextlib.contextmanager
    def assert_closes(self, path):
        """Fails when a handle on path is left for the garbage collector to close."""
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            yield
            gc.collect()
        leaks = [str(w.message) for w in caught if issubclass(w.category, ResourceWarning) and str(path) in str(w.message)]
        self.assertEqual(leaks, [])


class ApplyIniPlan(TempDirCase):
    SECTION = "/Script/Engine.Engine"
    ORIGINAL = "[/Script/Engine.Engine]\nA=1\n; été\n"

    def setUp(self):
        super().setUp()
        self.config = self.tmp / "Config"
        self.engine = self.write("Config/DefaultEngine.ini", self.ORIGINAL)
        self.plan = {
            "DefaultEngine.ini": [(self.SECTION, "A", 2), (self.SECTION, "B", "x")],
            "DefaultGame.ini": [("/Script/X", "C", 1)],
        }
        self.expected_changes = {
            "DefaultEngine.ini": [(self.SECTION, "A", "1", "2"), (self.SECTION, "B", None, "x")],
            "DefaultGame.ini": [("/Script/X", "C", None, "1")],
        }

    def test_writes_utf8_file_and_backs_up_the_original(self):
        backups = self.tmp / "bak"
        with self.assert_closes(self.engine):
            res = ue_anim.apply_ini_plan(str(self.config), self.plan, backup_dir=str(backups))
        self.assertEqual(res["changed"], self.expected_changes)
        self.assertFalse(res["dry_run"])
        self.assertEqual(self.engine.read_text(encoding="utf-8"), "[/Script/Engine.Engine]\nA=2\n; été\nB=x\n")
        self.assertEqual(len(res["backups"]), 1)
        backup = pathlib.Path(res["backups"][0])
        self.assertEqual(backup.parent, backups)
        self.assertRegex(backup.name, r"^DefaultEngine\.ini\.\d{8}-\d{6}\.bak$")
        self.assertEqual(backup.read_text(encoding="utf-8"), self.ORIGINAL)
        self.assertEqual(sorted(p.name for p in self.config.iterdir()), ["DefaultEngine.ini", "DefaultGame.ini"])

    def test_missing_file_reads_as_empty_and_is_created_without_backup(self):
        plan = {"DefaultGame.ini": self.plan["DefaultGame.ini"]}
        backups = self.tmp / "bak"
        res = ue_anim.apply_ini_plan(str(self.config), plan, backup_dir=str(backups))
        self.assertEqual(res["changed"], {"DefaultGame.ini": self.expected_changes["DefaultGame.ini"]})
        self.assertEqual(res["backups"], [])
        self.assertFalse(backups.exists())
        self.assertEqual((self.config / "DefaultGame.ini").read_text(encoding="utf-8"), "[/Script/X]\nC=1\n")

    def test_dry_run_reports_changes_and_writes_nothing(self):
        with self.assert_closes(self.engine):
            res = ue_anim.apply_ini_plan(str(self.config), self.plan, dry_run=True)
        self.assertEqual(res["changed"], self.expected_changes)
        self.assertTrue(res["dry_run"])
        self.assertEqual(res["backups"], [])
        self.assertEqual(self.engine.read_text(encoding="utf-8"), self.ORIGINAL)
        self.assertEqual(sorted(p.name for p in self.tmp.rglob("*")), ["Config", "DefaultEngine.ini"])

    def test_unchanged_values_report_nothing(self):
        res = ue_anim.apply_ini_plan(str(self.config), {"DefaultEngine.ini": [(self.SECTION, "A", 1)]})
        self.assertEqual(res["changed"], {})
        self.assertEqual(res["backups"], [])
        self.assertEqual(self.engine.read_text(encoding="utf-8"), self.ORIGINAL)

    def test_invalid_utf8_raises_and_leaves_the_file(self):
        bad = b"[S]\nA=\xff\n"
        self.engine.write_bytes(bad)
        with self.assert_closes(self.engine), self.assertRaises(UnicodeDecodeError):
            ue_anim.apply_ini_plan(str(self.config), {"DefaultEngine.ini": [("S", "A", 2)]})
        self.assertEqual(self.engine.read_bytes(), bad)
        self.assertEqual([p.name for p in self.config.iterdir()], ["DefaultEngine.ini"])


class LightCli(TempDirCase):
    LIGHTS = [{"name": "Lamp", "cls": "PointLight", "intensity": 5000, "units": "Unitless", "mobility": "Static"}]
    BRIEF = {"regions": {"face": [0, 0, 1, 1]}, "mood": "dusk"}

    def run_main(self, argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = ue_light.main(argv)
        return rc, json.loads(out.getvalue())

    def test_frame_reads_the_brief(self):
        brief = self.write("brief.json", json.dumps(self.BRIEF))
        seen = []

        def frame_report(image, brief, reference):
            seen.append((image, brief, reference))
            return {"image": image}

        with mock.patch.object(ue_light, "frame_report", frame_report), self.assert_closes(brief):
            rc, out = self.run_main(["frame", "img.exr", "--brief", str(brief)])
        self.assertEqual(rc, 0)
        self.assertEqual(seen, [("img.exr", self.BRIEF, None)])
        self.assertEqual(out, {"image": "img.exr", "brief_regions": self.BRIEF["regions"]})

    def test_frame_without_brief_passes_an_empty_one(self):
        seen = []

        def frame_report(image, brief, reference):
            seen.append((brief, reference))
            return {}

        with mock.patch.object(ue_light, "frame_report", frame_report):
            rc, out = self.run_main(["frame", "img.exr", "--reference", "ref.exr"])
        self.assertEqual((rc, out, seen), (0, {"brief_regions": None}, [({}, "ref.exr")]))

    def test_frame_missing_brief_raises(self):
        with mock.patch.object(ue_light, "frame_report", lambda *a: {}), self.assertRaises(FileNotFoundError):
            self.run_main(["frame", "img.exr", "--brief", str(self.tmp / "nope.json")])

    def test_compare_passes_the_brief_regions(self):
        brief = self.write("brief.json", json.dumps(self.BRIEF))

        def compare_ground_truth(realtime, pathtraced, regions, diff):
            return {"a": realtime, "b": pathtraced, "regions": regions, "diff": diff}

        with mock.patch.object(ue_light, "compare_ground_truth", compare_ground_truth):
            with self.assert_closes(brief):
                rc, out = self.run_main(["compare", "a.exr", "b.exr", "--brief", str(brief), "--diff", "d.png"])
            self.assertEqual((rc, out), (0, {"a": "a.exr", "b": "b.exr", "regions": self.BRIEF["regions"], "diff": "d.png"}))
            rc, out = self.run_main(["compare", "a.exr", "b.exr"])
            self.assertEqual((rc, out["regions"]), (0, None))

    def test_lint_lights_without_context(self):
        lights = self.write("lights.json", json.dumps(self.LIGHTS))
        with self.assert_closes(lights):
            rc, out = self.run_main(["lint-lights", str(lights)])
        self.assertEqual(rc, 0)
        self.assertEqual([f["id"] for f in out], ["units_physical", "static_under_lumen", "max_draw_distance"])
        self.assertEqual({f["subject"] for f in out}, {"Lamp"})

    def test_lint_lights_with_context(self):
        lights = self.write("lights.json", json.dumps(self.LIGHTS))
        context = self.write("context.json", json.dumps({"lumen": False, "profile": "still"}))
        with self.assert_closes(lights), self.assert_closes(context):
            rc, out = self.run_main(["lint-lights", str(lights), "--context", str(context)])
        self.assertEqual((rc, [f["id"] for f in out]), (0, ["units_physical"]))

    def test_lint_lights_malformed_json_raises(self):
        lights = self.write("lights.json", "[{")
        with self.assert_closes(lights), self.assertRaises(json.JSONDecodeError):
            self.run_main(["lint-lights", str(lights)])

    def test_lint_ini_reads_the_settings(self):
        ini = self.write(
            "DefaultEngine.ini",
            "[/Script/Engine.RendererSettings]\nr.DynamicGlobalIlluminationMethod=1\nr.ReflectionMethod=1\n",
        )
        with self.assert_closes(ini):
            rc, out = self.run_main(["lint-ini", str(ini), "--wants", "lumen"])
        self.assertEqual(rc, 0)
        self.assertEqual(out["values"]["r.DynamicGlobalIlluminationMethod"], "1")
        self.assertEqual(out["values"]["r.ReflectionMethod"], "1")
        self.assertIsNone(out["values"]["r.GenerateMeshDistanceFields"])
        # The exact list pins --wants: the default set also flags keys of the other features.
        self.assertEqual([f["subject"] for f in out["findings"] if f["id"] == "ini_missing"], ["r.GenerateMeshDistanceFields"])

    def test_budget_ignores_bad_bytes(self):
        # The bad byte inside a pass name pins errors="ignore": "replace" would break the lumen group.
        log = self.write("gpu.log", b"LogRHI: Display:    1.2ms  BasePass\nLogRHI: Display:   3.40ms   Lu\xffmen\n\xff\xfe junk\n")
        with self.assert_closes(log):
            rc, out = self.run_main(["budget", str(log), "--fps", "30"])
        self.assertEqual(rc, 0)
        self.assertEqual(out["groups"], {"lumen": 3.4})
        self.assertEqual([(f["id"], f["status"], f["message"]) for f in out["findings"]], [("budget_lumen", "pass", "lumen 3.40 ms vs 8.00 ms")])


class WorldCheckSpec(TempDirCase):
    def run_cli(self, argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = ue_world._cli(argv)
        return rc, json.loads(out.getvalue())

    def test_u1_shortcut_passes(self):
        rc, out = self.run_cli(["check-spec", "u1"])
        self.assertEqual(rc, 0)
        self.assertTrue(out["ok"])
        self.assertEqual(out["counts"]["error"], 0)

    def test_valid_utf8_file_exits_zero(self):
        spec = copy.deepcopy(ue_world.U1_EXAMPLE_SPEC)
        spec["name"] = "Café"
        path = self.write("spec.json", json.dumps(spec, ensure_ascii=False))
        with self.assert_closes(path):
            rc, out = self.run_cli(["check-spec", str(path)])
        self.assertEqual(rc, 0)
        self.assertEqual(out, json.loads(json.dumps(ue_world.check_world_spec(spec), default=str)))

    def test_failing_spec_exits_one(self):
        spec = copy.deepcopy(ue_world.U1_EXAMPLE_SPEC)
        spec["terrain"]["vertices"] = 2000
        path = self.write("spec.json", json.dumps(spec))
        with self.assert_closes(path):
            rc, out = self.run_cli(["check-spec", str(path)])
        self.assertEqual(rc, 1)
        self.assertFalse(out["ok"])
        self.assertIn("landscape.invalid_size", [f["rule"] for f in out["findings"] if f["severity"] == "error"])

    def test_malformed_json_raises(self):
        path = self.write("spec.json", "{")
        with self.assert_closes(path), self.assertRaises(json.JSONDecodeError):
            self.run_cli(["check-spec", str(path)])

    def test_invalid_utf8_raises(self):
        path = self.write("spec.json", json.dumps(ue_world.U1_EXAMPLE_SPEC).encode()[:-1] + b', "name": "\xff"}')
        with self.assert_closes(path), self.assertRaises(UnicodeDecodeError):
            self.run_cli(["check-spec", str(path)])

    def test_missing_file_raises(self):
        with self.assertRaises(FileNotFoundError):
            self.run_cli(["check-spec", str(self.tmp / "nope.json")])


@unittest.skipUnless(sys.version_info >= (3, 10), "EncodingWarning needs Python 3.10")
class ExplicitEncoding(TempDirCase):
    """Pins encoding="utf-8" on reads a UTF-8 locale would otherwise hide."""

    CODE = """
import sys
sys.path[:0] = sys.argv[1:3]
import ue_anim, ue_world
config, spec = sys.argv[3:5]
ue_anim.apply_ini_plan(config, {"DefaultEngine.ini": [("S", "A", 2)]}, dry_run=True)
ue_world._cli(["check-spec", spec])
"""

    def test_reads_name_the_encoding(self):
        self.write("Config/DefaultEngine.ini", "[S]\nA=1\n")
        spec = self.write("spec.json", json.dumps(ue_world.U1_EXAMPLE_SPEC))
        dirs = [os.path.dirname(m.__file__) for m in (ue_anim, ue_world)]
        argv = [sys.executable, "-X", "warn_default_encoding", "-W", "error::EncodingWarning", "-c", self.CODE]
        r = subprocess.run([*argv, *dirs, str(self.tmp / "Config"), str(spec)], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main()
