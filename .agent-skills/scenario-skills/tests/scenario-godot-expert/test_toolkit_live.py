"""Runs the Godot toolkit on the current OS, against a real Godot when one is installed.

What the platform branches touch (lock files, the process-table check, project
copies, UTF-8 decoding of Godot's output) differs per OS, so
.github/workflows/godot.yml installs Godot 4.7.2 on Linux, macOS and Windows and
runs this suite whenever a Godot script changes. Without Godot (the repository's
script-tests job) the lock and GUI-check tests still run and the rest skip.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import unittest.mock
from pathlib import Path

HERE = Path(__file__).parent
FAMILY = HERE.parents[1] / "skills" / "game-engines" / "godot"
EXPERT = FAMILY / "scenario-godot-expert" / "scripts"
sys.path[:0] = [
    str(EXPERT),
    str(FAMILY / "scenario-godot-architecture" / "scripts"),
    str(FAMILY / "scenario-godot-multiplayer" / "scripts"),
]

import gd_env  # noqa: E402
import gd_run  # noqa: E402

try:
    GODOT = gd_env.find_godot()
except FileNotFoundError:
    GODOT = None

TMP = Path(tempfile.mkdtemp(prefix="gd_toolkit_test_"))
LOCKS = TMP / "locks"
TEXT = "Ё ✓ Проект"  # 0x81 in its UTF-8 bytes is undefined in cp1252
PROBE = """
try:
    with gd_run.godot_slot({project!r}, wait=0):
        print("free")
except gd_run.GodotBusy:
    print("busy")
"""


def setUpModule():
    gd_run.LOCK_DIR = LOCKS


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


def probe(project, **env):
    """Try the lock from another process, as a second agent would."""
    code = f"import sys; sys.path.insert(0, {str(EXPERT)!r}); import gd_run\n" + PROBE.format(project=project)
    run = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=120,
                         env={**os.environ, "GD_LOCK_DIR": str(LOCKS), **env})
    return run.stdout.strip() or run.stderr.strip()


class Locks(unittest.TestCase):
    def test_project_lock_excludes_another_process(self):
        project = str(TMP / "locked")
        with gd_run.godot_slot(project):
            self.assertEqual(probe(project), "busy")
        self.assertEqual(probe(project), "free")

    def test_slot_pool_excludes_another_process(self):
        with gd_run.godot_slot(None):
            self.assertEqual(probe(None, GD_MAX="1"), "busy")
        self.assertEqual(probe(None, GD_MAX="1"), "free")

    def test_lock_file_closes_when_stamping_it_fails(self):
        path = LOCKS / "stamp_fails.lock"
        files = []
        self.addCleanup(lambda: [f.close() for f in files])

        def failing_open(*args, **kwargs):
            files.append(open(*args, **kwargs))  # noqa: SIM115 (closed by the cleanup above)
            fh = unittest.mock.MagicMock(wraps=files[-1])
            fh.truncate.side_effect = OSError("disk full")
            return fh

        with unittest.mock.patch.object(gd_run, "open", failing_open, create=True):
            with self.assertRaises(OSError):
                gd_run._flock_try(path)
        self.assertTrue(files[0].closed)
        fh = gd_run._flock_try(path)
        self.assertIsNotNone(fh)
        fh.close()


class GuiCheck(unittest.TestCase):
    def test_gui_godot_on_the_project_blocks_a_run(self):
        project = TMP / "Gui Project"
        project.mkdir()
        (project / "project.godot").write_text("config_version=5\n")
        arg = str(project.resolve())
        if sys.platform == "win32":
            arg = arg.replace("\\", "/").upper()  # the project manager's slashes, in another case
        procs = [
            {"pid": 41, "args": f"godot --headless --path {arg}", "headless": True, "editor": False, "cwd": None},
            {"pid": 42, "args": f"godot --path {arg} -e", "headless": False, "editor": True, "cwd": None},
        ]
        with unittest.mock.patch.object(gd_run, "running_godot", return_value=procs), \
                unittest.mock.patch.object(gd_run, "_godot", return_value="godot"):
            self.assertEqual(gd_run.gui_editor_pids(project), [42])
            with self.assertRaises(gd_run.GodotBusy):
                gd_run.run_script(project, "agent_audit.gd:project", timeout=60)


@unittest.skipUnless(GODOT, "no Godot installed ($GODOT, PATH or /Applications/Godot.app)")
class LiveProject(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.project = gd_env.new_project(TMP / "Smoke3D", template="3d", isolate_user=True)

    @classmethod
    def tearDownClass(cls):
        # isolate_user put user:// outside TMP; remove only that agent folder.
        user_dir = gd_env.user_data_dir(cls.project)
        if gd_env._app_data_root() / gd_env.AGENT_USERDATA in user_dir.parents:
            shutil.rmtree(user_dir, ignore_errors=True)

    def test_new_project_builds_the_main_scene(self):
        self.assertTrue((self.project / "main.tscn").exists())

    def test_job_result_arrives_on_stdout(self):
        import gd_stat
        r = gd_run.audit(self.project, "project")
        self.assertTrue(r["ok"], r["error"])
        self.assertIn(gd_stat.RESULT_TAG, r["log"])

    def test_non_ascii_output_round_trips(self):
        (self.project / "unicode_job.gd").write_text(
            'extends "res://addons/agentkit/agent_job.gd"\n\nfunc run() -> Dictionary:\n'
            f'\tprint("UNICODE_PROBE {TEXT}")\n\treturn {{"ok": true, "text": "{TEXT}"}}\n', encoding="utf-8")
        r = gd_run.run_script(self.project, "unicode_job.gd", timeout=120)
        self.assertTrue(r["ok"], r["error"])
        self.assertEqual(r["result"]["text"], TEXT)
        self.assertIn(f"UNICODE_PROBE {TEXT}", r["log"])

    def test_check_all(self):
        r = gd_run.check_all(self.project)
        self.assertTrue(r["ok"], r["error"])

    def test_running_godot_lists_a_headless_editor(self):
        p = subprocess.Popen([GODOT, "--headless", "-e", "--path", str(self.project)],
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            mine, deadline = [], time.time() + 30
            while not mine and time.time() < deadline:
                time.sleep(1)
                mine = [x for x in gd_run.running_godot() if x["pid"] == p.pid]
            gui = gd_run.gui_editor_pids(self.project)
        finally:
            p.kill()
            p.wait()
        self.assertTrue(mine, f"pid {p.pid} not in running_godot()")
        self.assertTrue(mine[0]["headless"] and mine[0]["editor"], mine)
        self.assertNotIn(p.pid, gui)

    def test_typing_gate_clones_the_project(self):
        import gd_architecture
        dest = TMP / "gate" / "Smoke3D"
        r = gd_architecture.typing_gate(self.project, dest=dest)
        self.assertTrue((dest / "project.godot").exists())
        self.assertTrue(r["ok"], r.get("error"))

    def test_role_clone_refresh_skips_agent_out(self):
        import gd_net
        root = TMP / "roles"
        clone = gd_net.role_clone(self.project, "server", clone_root=root)
        (self.project / "after.txt").write_text("x")
        (self.project / ".agent_out" / "after.txt").write_text("x")
        gd_net.role_clone(self.project, "server", clone_root=root, refresh=True)
        self.assertTrue((clone / "after.txt").exists())
        self.assertFalse((clone / ".agent_out" / "after.txt").exists())

    @unittest.skipIf(sys.platform.startswith("linux") and not os.environ.get("DISPLAY"), "no display")
    def test_windowed_capture(self):
        out = TMP / "captures" / "shot.png"
        r = gd_run.capture_scene(self.project, "res://main.tscn", out=str(out), size=(320, 180), timeout=180)
        if out.exists() and os.environ.get("GD_TEST_ARTIFACTS"):
            shutil.copy2(out, Path(os.environ["GD_TEST_ARTIFACTS"]) / "shot.png")  # for a look by eye
        self.assertTrue(r["ok"], r["error"])
        checks = r.get("checks") or {}
        self.assertTrue(checks and all(c["ok"] for c in checks.values()), checks)


if __name__ == "__main__":
    unittest.main()
