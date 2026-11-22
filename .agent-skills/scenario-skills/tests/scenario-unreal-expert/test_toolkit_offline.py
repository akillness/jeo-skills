"""Runs the Unreal toolkit's host-side process and file handling with no Unreal installed.

`ue_run._spawn` starts the editor in its own session and copies its output to a log from a
thread. A real child process stands in for the editor. POSIX only: `_spawn` stops the editor
through its process group.
"""

import os
import sys
import tempfile
import threading
import time
import unittest
import unittest.mock
from pathlib import Path

HERE = Path(__file__).parent
EXPERT = HERE.parents[1] / "skills" / "game-engines" / "unreal" / "scenario-unreal-expert" / "scripts"
sys.path.insert(0, str(EXPERT))

import ue_run  # noqa: E402

# Prints its pid, then floods stdout well past a pipe buffer, then leaves a marker.
CHATTY = """
import sys, time
print("pid", __import__("os").getpid(), flush=True)
time.sleep(0.5)
for _ in range(1024):
    sys.stdout.write("x" * 1023 + "\\n")
sys.stdout.flush()
open(sys.argv[1], "w").close()
time.sleep(30)
"""


def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


@unittest.skipUnless(os.name == "posix", "_spawn stops the editor through its POSIX process group")
class Spawn(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ue_spawn_test_"))
        self.log = self.tmp / "stdout.log"

    def spawn(self, script, *args, **kwargs):
        cmd = [sys.executable, "-c", script, *map(str, args)]
        return ue_run._spawn(cmd, str(self.log), **kwargs)

    def test_returns_exit_code_and_writes_the_log(self):
        code, seconds, timed_out = self.spawn("import sys; print('hello'); sys.exit(3)", timeout=30)
        self.assertEqual((code, timed_out), (3, False))
        self.assertGreaterEqual(seconds, 0)
        self.assertEqual(self.log.read_text(), "hello\n")

    def test_timeout_terminates_the_group(self):
        code, _, timed_out = self.spawn("import time; print('a', flush=True); time.sleep(60)", timeout=1)
        self.assertTrue(timed_out)
        self.assertNotEqual(code, 0)
        self.assertEqual(self.log.read_text(), "a\n")

    def test_until_file_ends_the_run_after_grace(self):
        marker = self.tmp / "done"
        script = "import sys, time; open(sys.argv[1], 'w').close(); print('b', flush=True); time.sleep(60)"
        code, _, timed_out = self.spawn(script, marker, timeout=30, until_file=str(marker), grace=0.5)
        self.assertFalse(timed_out)
        self.assertNotEqual(code, 0)
        self.assertEqual(self.log.read_text(), "b\n")

    def test_interrupted_wait_stops_the_editor_and_keeps_the_log(self):
        # A caller that survives Ctrl-C (a REPL, a long-lived agent session) must not be left
        # with an editor blocked on a full pipe nobody drains.
        marker = self.tmp / "flooded"
        errors = []
        state = {"calls": 0, "raised": False}
        real_sleep = time.sleep

        def interrupt_once_flooded(seconds):
            # Raise once, in the wait loop; _terminate_group's own sleeps must run.
            state["calls"] += 1
            if not state["raised"] and (marker.exists() or state["calls"] > 100):
                state["raised"] = True
                raise KeyboardInterrupt
            real_sleep(seconds)

        hook = threading.excepthook
        threading.excepthook = lambda a: errors.append(a.exc_type.__name__)
        self.addCleanup(setattr, threading, "excepthook", hook)
        with unittest.mock.patch.object(ue_run.time, "sleep", interrupt_once_flooded):
            with self.assertRaises(KeyboardInterrupt):
                self.spawn(CHATTY, marker, timeout=60)
        text = self.log.read_text()
        pid = int(text.split()[1])
        self.addCleanup(lambda: alive(pid) and os.kill(pid, 9))
        self.assertFalse(alive(pid), "the editor's process group was left running")
        self.assertEqual(errors, [], "the log pump died on a closed file")
        self.assertGreaterEqual(text.count("x" * 1023), 1024)


if __name__ == "__main__":
    unittest.main()
