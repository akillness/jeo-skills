"""Runs the Unity toolkit's process and file handling on the current OS, with no Unity installed.

Before a batch run the toolkit reads the process table (`ps`) and probes a POSIX lock on
Temp/UnityLockfile; it stops editors by PID with POSIX signals and clones projects with the
macOS `cp -c`. None of that needs the editor, so it runs in `pnpm test` (Linux) and in
.github/workflows/unity.yml on macOS, the OS the toolkit targets (the lead skill's
description says "on a Mac"). On Windows the toolkit does not import (fcntl).
"""

import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
import unittest.mock
from pathlib import Path

HERE = Path(__file__).parent
EXPERT = HERE.parents[1] / "skills" / "game-engines" / "unity" / "scenario-unity-expert" / "scripts"
sys.path.insert(0, str(EXPERT))

import ut_env  # noqa: E402
import ut_live  # noqa: E402
import ut_run  # noqa: E402

TMP = Path(tempfile.mkdtemp(prefix="ut_toolkit_test_"))
HOLD = """
import fcntl, os, sys, time
fd = os.open(sys.argv[1], os.O_RDWR)
fcntl.lockf(fd, fcntl.LOCK_EX)
print("held", flush=True)
time.sleep(60)
"""


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


def project(name):
    """A folder find_project accepts (Assets + ProjectSettings/ProjectVersion.txt). Returns its root."""
    root = TMP / name
    (root / "Assets").mkdir(parents=True)
    (root / "ProjectSettings").mkdir()
    (root / "ProjectSettings" / "ProjectVersion.txt").write_text("m_EditorVersion: 6000.3.21f1\n")
    return ut_env.find_project(str(root))["root"]


def wait_until(check, seconds=10):
    deadline = time.time() + seconds
    while not check() and time.time() < deadline:
        time.sleep(0.2)
    return check()


class Locks(unittest.TestCase):
    def test_lockfile_held_by_another_process_locks_the_project(self):
        root = project("Locked Game")
        lockfile = Path(root, "Temp", "UnityLockfile")
        lockfile.parent.mkdir()
        lockfile.touch()
        # POSIX locks never conflict within one process, so the editor's lock comes from another.
        holder = subprocess.Popen([sys.executable, "-c", HOLD, str(lockfile)], stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(holder.stdout.readline().strip(), "held")
            st = ut_env.project_lock(root)
            self.assertTrue(st["locked"] and st["lockfile_held"], st)
        finally:
            holder.kill()
            holder.wait()
            holder.stdout.close()
        st = ut_env.project_lock(root)
        self.assertFalse(st["locked"], st)
        self.assertIs(st["lockfile_held"], False, st)


class EditorProcesses(unittest.TestCase):
    def test_gui_editor_on_the_project_refuses_a_batch_run(self):
        root = project("Gui Game")
        unity = "/Applications/Unity/Hub/Editor/6000.3.21f1/Unity.app/Contents/MacOS/Unity"
        procs = [
            (41, f"{unity} -projectpath {os.path.realpath(root)} -useHub -hubIPC"),
            (42, f"{unity} -batchmode -projectPath {TMP / 'Other Game'} -quit"),
        ]
        with unittest.mock.patch.object(ut_env, "_unity_processes", return_value=procs):
            found = ut_env.editor_processes(root)
            self.assertEqual([(p["pid"], p["gui"]) for p in found], [(41, True)])
            # The refusal comes before the editor lookup, so it holds with no Unity installed.
            with self.assertRaises(ut_env.ProjectLockedError):
                ut_run.run_method(root, "Game.Jobs.Build")

    def test_project_path_forms(self):
        cases = {
            "Unity -projectPath /tmp/My Game -logFile /tmp/unity.log": "/tmp/My Game",
            'Unity -batchmode -projectpath "/tmp/My Game"': "/tmp/My Game",
            "Unity -createProject /tmp/New -cloneFromTemplate t.tgz": "/tmp/New",
            "Unity -useHub -hubIPC": None,
        }
        for cmd, want in cases.items():
            with self.subTest(cmd=cmd):
                self.assertEqual(ut_env._cmd_project(cmd), want)

    def test_ps_lists_an_editor_running_on_the_project(self):
        root = project("Batch Game")
        fake = TMP / "Hub" / "Unity.app" / "Contents" / "MacOS" / "Unity"
        fake.parent.mkdir(parents=True)
        fake.write_text(f"#!{sys.executable}\nimport time\ntime.sleep(60)\n")
        fake.chmod(0o755)
        p = subprocess.Popen([str(fake), "-batchmode", "-projectPath", root])

        def mine():
            return [x for x in ut_env.editor_processes(root) if x["pid"] == p.pid]

        try:
            found = wait_until(mine)
        finally:
            p.kill()
            p.wait()
        self.assertTrue(found, f"pid {p.pid} not in editor_processes()")
        self.assertTrue(found[0]["batch"], found)


class ProcessControl(unittest.TestCase):
    def test_an_unreaped_child_is_not_alive(self):
        p = subprocess.Popen([sys.executable, "-c", "import sys; sys.stdin.read()"], stdin=subprocess.PIPE)
        try:
            self.assertTrue(ut_live._pid_alive(p.pid))
            p.stdin.close()
            self.assertTrue(wait_until(lambda: not ut_live._pid_alive(p.pid)))
            os.kill(p.pid, 0)  # still in the process table: only the ps state saw it exit
        finally:
            p.stdin.close()
            p.wait(timeout=10)

    def test_terminate_kills_a_child_that_ignores_sigterm(self):
        code = "import signal, time\nsignal.signal(signal.SIGTERM, signal.SIG_IGN)\nprint('ready', flush=True)\ntime.sleep(60)\n"
        p = subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(p.stdout.readline().strip(), "ready")
            self.assertEqual(ut_run._terminate(p, wait=1), -signal.SIGKILL)
        finally:
            p.kill()
            p.wait()
            p.stdout.close()

    def test_stop_headless_signals_only_an_editor_on_the_project(self):
        root = project("Headless Game")
        bridge = Path(ut_live.bridge_dir(root))
        bridge.mkdir(parents=True)
        for extra, on_project in (([root], True), ([], False)):
            with self.subTest(on_project=on_project):
                p = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)", *extra])
                try:
                    (bridge / "headless.json").write_text(json.dumps({"pid": p.pid, "project": root}))
                    r = ut_live.stop_headless(root, timeout=0.5)
                    self.assertEqual(r["stopped"], on_project, r)
                    if on_project:
                        self.assertEqual(p.wait(timeout=10), -signal.SIGTERM)
                    else:
                        self.assertIsNone(p.poll())
                finally:
                    p.kill()
                    p.wait()


class MacLayout(unittest.TestCase):
    def test_find_editor_reads_the_hub_layout(self):
        hub = TMP / "Hub Editor"
        app = hub / "6000.3.21f1" / "Unity.app"
        (app / "Contents" / "MacOS").mkdir(parents=True)
        (app / "Contents" / "MacOS" / "Unity").touch()
        (app / "Contents" / "PlaybackEngines" / "MacStandaloneSupport").mkdir(parents=True)
        (hub / "6000.3.21f1" / "PlaybackEngines" / "WebGLSupport").mkdir(parents=True)
        with unittest.mock.patch.object(ut_env, "HUB_EDITORS", str(hub)), unittest.mock.patch.dict(os.environ):
            os.environ.pop("UNITY_EDITOR", None)
            ed = ut_env.find_editor("6000.3.21f1")
            self.assertEqual(ed["binary"], str(app / "Contents" / "MacOS" / "Unity"))
            self.assertEqual(ed["playback_engines"], ["MacStandaloneSupport", "WebGLSupport"])
            with self.assertRaisesRegex(FileNotFoundError, "installed: \\['6000.3.21f1'\\]"):
                ut_env.find_editor("6000.0.1f1")

    @unittest.skipUnless(sys.platform == "darwin", "cp -c is the macOS clone flag")
    def test_base_project_clones_without_the_editor_session(self):
        base = Path(project("Base3D_URP"))
        (base / "Temp").mkdir()
        (base / "Temp" / "UnityLockfile").touch()
        (base / "Library").mkdir()
        (base / "Library" / "ArtifactDB").touch()
        dest = TMP / "clones" / "My Skill"
        dest.parent.mkdir()
        with unittest.mock.patch.dict(ut_env.BASE_PROJECTS, {"3d": str(base)}):
            self.assertEqual(ut_env.base_project("3d", str(dest)), str(dest))
        self.assertTrue((dest / "Library" / "ArtifactDB").exists())
        self.assertFalse((dest / "Temp").exists())
        self.assertTrue(list(dest.glob("Temp.from-base-*")))
        self.assertTrue((dest / "Assets" / "Editor" / "AgentKit" / "AgentJob.cs").exists())
        self.assertFalse((base / "Assets" / "Editor").exists())


if __name__ == "__main__":
    unittest.main()
