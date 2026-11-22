"""Runs zb_launch.start() and the zb_bridge.py command line with no ZBrush installed.

start() spawns a fake ZBrush binary for real: a shell script that runs a small Python child.
Only the machine probes are stubbed: the process table, the screen lock, the port and the ping.
The bridge command line talks to a local TCP server that echoes each request back.
It runs once as a child process and once in-process, so open descriptors can be inspected.
POSIX only: the fake binary is a shell script, and start() spawns it in a new session.
It needs no package beyond the standard library.
"""

import contextlib
import gc
import io
import json
import os
import re
import runpy
import shlex
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import unittest
import unittest.mock
import warnings
import weakref
from pathlib import Path

HERE = Path(__file__).parent
SCRIPTS = HERE.parents[1] / "skills" / "dcc" / "zbrush" / "scenario-zbrush-expert" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import zb_launch  # noqa: E402

# The child writes its late lines only once the test creates FAKE_GO, so they land after
# start() has returned and closed the parent's copy of the log descriptor.
CHILD = """
import os, sys, time
print("child-early", flush=True)
with open(os.environ["FAKE_BRIDGE_LOG"], "a") as fh:
    fh.write("plugin loaded\\n")
end = time.time() + 20
while not os.path.exists(os.environ["FAKE_GO"]) and time.time() < end:
    time.sleep(0.05)
print("child-late stdout", flush=True)
print("child-late stderr", file=sys.stderr, flush=True)
"""
HEADER = re.compile(r"\n--- zb_launch\.start \d{4}-\d\d-\d\d \d\d:\d\d:\d\d locked=False\n")


def log_warnings(caught, path):
    return [str(w.message) for w in caught if issubclass(w.category, ResourceWarning) and str(path) in str(w.message)]


@unittest.skipUnless(os.name == "posix", "the fake ZBrush binary is a shell script")
class Start(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="zb_start_test_"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        logs = self.tmp / "Logs"
        self.stdout_log = logs / "zbrush_stdout.log"
        self.bridge_log = logs / "zb_bridge.log"
        self.go = self.tmp / "go"
        # Cleanups run last first: a failed test still releases the child before rmtree.
        self.addCleanup(self.go.touch)
        child = self.tmp / "child.py"
        child.write_text(CHILD)
        self.fake = self.tmp / "ZBrush"
        self.fake.write_text(f"#!/bin/sh\nexec {shlex.quote(sys.executable)} -B {shlex.quote(str(child))}\n")
        self.fake.chmod(0o755)
        patcher = unittest.mock.patch.multiple(
            zb_launch,
            LOGS=str(logs),
            BRIDGE_LOG=str(self.bridge_log),
            STDOUT_LOG=str(self.stdout_log),
            ASSET_GLOB=str(self.tmp / "nothing_*"),
            ZBRUSH_BIN=str(self.fake),
            is_running=lambda: False,
            homepage_running=lambda: False,
            pids=lambda pattern="": [],
            screen_locked=lambda: False,
            port_open=lambda port=0, timeout=0: True,
            ping=lambda port=0, timeout=0: {"ok": True, "version": "fake-2026", "latency_s": 0},
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def start(self):
        """Runs start(), recording ResourceWarnings in self.caught."""
        env = {"FAKE_BRIDGE_LOG": str(self.bridge_log), "FAKE_GO": str(self.go)}
        with warnings.catch_warnings(record=True) as self.caught:
            warnings.simplefilter("always", ResourceWarning)
            result = zb_launch.start(timeout=20, stall_timeout=10, quit_home=False, extra_env=env)
            gc.collect()
        return result

    def wait_child(self, pid):
        self.go.touch()
        try:
            os.waitpid(pid, 0)
        except ChildProcessError:
            pass  # subprocess already reaped it: start() drops its Popen, and a later Popen collects it.

    def test_returns_started_and_appends_header(self):
        self.stdout_log.parent.mkdir()
        self.stdout_log.write_text("earlier run\n")
        real_popen = subprocess.Popen
        on_disk_at_spawn = []

        def spy(*args, **kwargs):
            on_disk_at_spawn.append(self.stdout_log.read_text())
            return real_popen(*args, **kwargs)

        with unittest.mock.patch.object(zb_launch.subprocess, "Popen", spy):
            result = self.start()
        self.wait_child(result["pid"])
        self.assertEqual(result["status"], "started")
        self.assertEqual(result["port"], zb_launch.DEFAULT_PORT)
        self.assertEqual(result["version"], "fake-2026")
        self.assertIs(result["screen_locked"], False)
        self.assertIs(result["homepage_quit"], False)
        self.assertEqual(set(result["stages_s"]), {"spawned", "loaded", "ping"})
        self.assertEqual(len(on_disk_at_spawn), 1)
        self.assertTrue(on_disk_at_spawn[0].startswith("earlier run\n"), on_disk_at_spawn[0])
        self.assertRegex(on_disk_at_spawn[0], HEADER)
        log = self.stdout_log.read_text()
        self.assertTrue(log.startswith(on_disk_at_spawn[0]), log)
        self.assertIn("child-early\n", log)

    def test_child_output_after_return_reaches_log(self):
        result = self.start()
        self.assertNotIn("child-late", self.stdout_log.read_text())
        self.wait_child(result["pid"])
        log = self.stdout_log.read_text()
        self.assertIn("child-late stdout\n", log)
        self.assertIn("child-late stderr\n", log)

    def test_log_handle_closed_on_return(self):
        handles = []
        real_open = open

        # Weak references, so an unclosed handle is still collected and warns.
        def tracking(*args, **kwargs):
            fh = real_open(*args, **kwargs)
            handles.append((fh.name, weakref.ref(fh)))
            return fh

        with unittest.mock.patch.object(zb_launch, "open", tracking, create=True):
            result = self.start()
        self.wait_child(result["pid"])
        self.assertEqual(log_warnings(self.caught, self.stdout_log), [])
        # A handle still referenced somewhere raises no ResourceWarning, so check it directly.
        logs = [ref for name, ref in handles if name == str(self.stdout_log)]
        self.assertTrue(logs)
        alive = [ref() for ref in logs if ref() is not None]
        self.assertTrue(all(fh.closed for fh in alive), alive)

    def test_popen_failure_raises_and_leaves_no_handle(self):
        self.fake.chmod(0o644)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            with self.assertRaises(PermissionError):
                self.start()
            gc.collect()
        self.assertEqual(log_warnings(caught, self.stdout_log), [])
        self.assertRegex(self.stdout_log.read_text(), HEADER)

    def test_missing_binary_raises_before_logging(self):
        self.fake.unlink()
        with self.assertRaisesRegex(zb_launch.ZBError, "ZBrush binary not found"):
            self.start()
        self.assertFalse(self.stdout_log.exists())


class Echo(socketserver.StreamRequestHandler):
    def handle(self):
        request = json.loads(self.rfile.readline())
        self.server.requests.append(request)
        self.wfile.write((json.dumps({"ok": True, "echo": request}) + "\n").encode())


class BridgeCli(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = socketserver.TCPServer(("127.0.0.1", 0), Echo)
        cls.server.requests = []
        cls.port = str(cls.server.server_address[1])
        threading.Thread(target=cls.server.serve_forever, kwargs={"poll_interval": 0.1}, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="zb_bridge_test_"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def cli(self, *argv):
        return subprocess.run(
            [sys.executable, "-B", "-W", "always::ResourceWarning", str(SCRIPTS / "zb_bridge.py"), *argv],
            capture_output=True,
            text=True,
            cwd=self.tmp,
            env={**os.environ, "PYTHONUTF8": "1"},
            timeout=30,
        )

    def test_inline_code_is_sent_in_thread_mode(self):
        run = self.cli("--port", self.port, "result = 1")
        self.assertEqual(run.returncode, 0, run.stderr)
        reply = json.loads(run.stdout)
        self.assertEqual(reply["echo"], {"code": "result = 1", "mode": "thread", "timeout": 600})

    def test_file_code_is_sent_and_file_closed(self):
        script = self.tmp / "job.py"
        script.write_bytes('result = 1 + 2\r\nname = "é"\n'.encode())
        run = self.cli("-f", str(script), "--main", "--port", self.port)
        self.assertEqual(run.returncode, 0, run.stderr)
        reply = json.loads(run.stdout)
        self.assertEqual(reply["echo"], {"code": 'result = 1 + 2\nname = "é"\n', "mode": "main", "timeout": 600})
        self.assertNotIn("ResourceWarning", run.stderr)

    @unittest.skipUnless(os.path.isdir("/dev/fd"), "lists open descriptors through /dev/fd")
    def test_file_descriptor_closed_in_process(self):
        script = self.tmp / "job.py"
        script.write_text("result = 3\n")
        identity = (script.stat().st_dev, script.stat().st_ino)
        stdout = io.StringIO()
        argv = ["zb_bridge.py", "--port", self.port, "-f", str(script)]
        with unittest.mock.patch.object(sys, "argv", argv), contextlib.redirect_stdout(stdout):
            runpy.run_path(str(SCRIPTS / "zb_bridge.py"), run_name="__main__")
        self.assertEqual(json.loads(stdout.getvalue())["echo"]["code"], "result = 3\n")
        # Compare by inode: the echo server's sockets may still be closing on its thread.
        still_open = []
        for name in os.listdir("/dev/fd"):
            try:
                st = os.fstat(int(name))
            except OSError:
                continue
            if (st.st_dev, st.st_ino) == identity:
                still_open.append(int(name))
        self.assertEqual(still_open, [])

    def test_missing_file_fails_before_connecting(self):
        sent = len(self.server.requests)
        run = self.cli("--port", self.port, "-f", str(self.tmp / "absent.py"))
        self.assertEqual(run.returncode, 1)
        self.assertTrue(run.stderr.strip().splitlines()[-1].startswith("FileNotFoundError"), run.stderr)
        self.assertEqual(len(self.server.requests), sent)
        self.assertEqual(run.stdout, "")


if __name__ == "__main__":
    unittest.main()
