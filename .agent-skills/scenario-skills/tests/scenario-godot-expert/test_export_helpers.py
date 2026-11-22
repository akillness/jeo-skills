"""The export helpers of scenario-godot-performance-export on the current OS.

Tool names, the Android SDK and JDK lookup, the private Godot home and the
release audit's path check all differ per OS. The private-home test needs Godot,
the Android test needs ANDROID_HOME and a JDK 17 (.github/workflows/godot.yml
points JAVA_HOME at one); without them those tests skip.
"""

import os
import shutil
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

HERE = Path(__file__).parent
FAMILY = HERE.parents[1] / "skills" / "game-engines" / "godot"
sys.path[:0] = [
    str(FAMILY / "scenario-godot-expert" / "scripts"),
    str(FAMILY / "scenario-godot-performance-export" / "scripts"),
]

import gd_env  # noqa: E402
import gd_perf  # noqa: E402
import gd_run  # noqa: E402

try:
    GODOT = gd_env.find_godot()
except FileNotFoundError:
    GODOT = None

TMP = Path(tempfile.mkdtemp(prefix="gd_export_test_"))


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)  # removes the templates link, never its target


def norm(path: str) -> str:
    return path.replace("\\\\", "\\").replace("\\", "/").rstrip("/").lower()  # .tres strings escape backslashes


class ToolNames(unittest.TestCase):
    def test_tools_are_found_under_the_os_spelling(self):
        folder = TMP / "tools"
        folder.mkdir()
        files = {"adb": "adb.exe", "apksigner": "apksigner.bat"} if sys.platform == "win32" else {"adb": "adb", "apksigner": "apksigner"}
        for f in files.values():
            (folder / f).write_text("")
        for name, f in files.items():
            self.assertEqual(gd_perf._tool(folder, name), folder / f)
        self.assertIsNone(gd_perf._tool(folder, "keytool"))


class ReleaseAudit(unittest.TestCase):
    def audit_with(self, export_path):
        project = Path(tempfile.mkdtemp(prefix="audit_", dir=TMP))
        (project / "project.godot").write_text('config_version=5\n\n[application]\n\nconfig/name="Audit"\n')
        (project / "export_presets.cfg").write_text(
            f'[preset.0]\n\nname="Android"\nplatform="Android"\nexport_path="{export_path}"\n\n[preset.0.options]\n\n')
        return [f["id"] for f in gd_perf.release_audit(project)["flags"]]

    def test_absolute_export_path_is_outside_the_project(self):
        out = (TMP / "builds" / "game.apk").resolve().as_posix()  # Godot writes C:/... on Windows
        self.assertNotIn("export_inside_project", self.audit_with(out))

    def test_relative_export_path_is_inside_the_project(self):
        self.assertIn("export_inside_project", self.audit_with("builds/game.apk"))


@unittest.skipUnless(GODOT, "no Godot installed ($GODOT, PATH or /Applications/Godot.app)")
class PrivateHome(unittest.TestCase):
    def test_godot_keeps_its_settings_in_the_private_home(self):
        project = gd_env.new_project(TMP / "Home3D", template="3d", main_scene=False, do_import=False)
        home = gd_perf.private_home(TMP / "home")
        config, data = gd_perf._godot_dirs(home)
        self.assertTrue(os.path.lexists(data / "export_templates"))
        r = gd_run.run_script(project, "agent_audit.gd:project", editor=True, timeout=300, env=gd_perf.home_env(home))
        self.assertTrue(r["ok"], r["error"])
        settings = config / "editor_settings-4.7.tres"
        self.assertTrue(settings.exists(), sorted(str(p.relative_to(home)) for p in home.rglob("*"))[:40])
        if os.environ.get("JAVA_HOME"):
            # A fresh settings file takes the Android JDK path from JAVA_HOME (export_android relies on it).
            line = next((ln for ln in settings.read_text(encoding="utf-8").splitlines()
                         if ln.startswith("export/android/java_sdk_path")), "")
            self.assertEqual(norm(line.split("=", 1)[-1].strip().strip('"')), norm(os.environ["JAVA_HOME"]), line)
        self.assertTrue(gd_perf.set_private_editor_setting(home, "export/android/android_sdk_path", str(TMP / "sdk")))
        self.assertIn("export/android/android_sdk_path", settings.read_text(encoding="utf-8"))


@unittest.skipUnless(os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT"), "no ANDROID_HOME")
class Android(unittest.TestCase):
    def test_find_android_and_make_keystore(self):
        a = gd_perf.find_android()
        self.assertTrue(a["ok"], a["problems"])
        k = gd_perf.make_keystore(TMP / "keys" / "debug.keystore", "androiddebugkey", "android", jdk=a["jdk"])
        self.assertTrue(k["ok"], k)
        self.assertEqual(len(k["sha256"]), 64)

    @unittest.skipUnless(sys.platform.startswith("linux") and Path("/usr/lib/jvm").is_dir(), "Linux with /usr/lib/jvm")
    def test_find_android_finds_a_linux_jdk_without_java_home(self):
        env = {k: v for k, v in os.environ.items() if k != "JAVA_HOME"}
        with unittest.mock.patch.dict(os.environ, env, clear=True):
            a = gd_perf.find_android()
        self.assertTrue(a["jdk"], a["problems"])


if __name__ == "__main__":
    unittest.main()
