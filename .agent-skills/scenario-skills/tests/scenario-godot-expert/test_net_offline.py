"""gd_net.session with stand-in roles, no Godot needed.

Each role runs a short child of this Python instead of Godot.
The machine slots and the role clones are stubbed, so only the session's own process and log handling runs.
Each clone starts with a stale run.log, and the client prints a byte that is not valid UTF-8.
"""

import contextlib
import gc
import json
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
import unittest.mock as mock
import warnings
from pathlib import Path

FAMILY = Path(__file__).parents[2] / "skills" / "game-engines" / "godot"
sys.path[:0] = [
    str(FAMILY / "scenario-godot-expert" / "scripts"),
    str(FAMILY / "scenario-godot-multiplayer" / "scripts"),
]

import gd_net  # noqa: E402


def role(name):
    return {"name": name, "headless": True, "delay_s": 0, "timeout": 30, "script": "res://net.gd", "extra_args": [],
            "args": {}}


class Session(unittest.TestCase):
    def setUp(self):
        self.work = Path(tempfile.mkdtemp(prefix="gd_net_test_"))
        self.addCleanup(shutil.rmtree, self.work, ignore_errors=True)
        (self.work / "master").mkdir()
        self.children = []
        self.cmds = {}
        self.decoded = {}
        self.addCleanup(self.reap)
        self.real_popen = subprocess.Popen
        patches = [
            mock.patch.object(gd_net, "role_clone", self.clone),
            mock.patch.object(gd_net, "_role_cmd", self.role_cmd),
            mock.patch.object(gd_net.gd_run, "godot_slot", lambda *a, **k: contextlib.nullcontext()),
            mock.patch.object(gd_net.gd_run, "_ensure_out", lambda clone, _out: clone / "out"),
            mock.patch.object(gd_net.gd_run, "_summarise", self.record_summary),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def clone(self, _master, name, _root, _refresh):
        c = self.work / "clones" / name
        (c / "out").mkdir(parents=True, exist_ok=True)
        (c / "out" / "run.log").write_text("old run\n")
        return c

    def record_summary(self, log, *a, real=gd_net.gd_run._summarise):
        self.decoded[Path(a[2]["clone"]).name] = log
        return real(log, *a)

    def role_cmd(self, _clone, r, out, _timeout):
        rf, lp = out / "result.json", out / "run.log"
        # The header holds this code, so the greeting is built at run time to keep it out of the header.
        code = (f"import json, sys; print('hello from', {r['name'][::-1]!r}[::-1], flush=True);"
                f"{'sys.stdout.buffer.write(bytes([0x81, 10]));' if r['name'] == 'client' else ''}"
                f"open({str(rf)!r}, 'w').write(json.dumps({{'ok': True, 'who': {r['name']!r}}}))")
        self.cmds[r["name"]] = [sys.executable, "-c", code]
        return self.cmds[r["name"]], rf, lp

    def popen(self, fail_on=None):
        calls = []

        def start(*a, **k):
            calls.append(a)
            if len(calls) == fail_on:
                raise FileNotFoundError(2, "No such file or directory", "godot")
            p = self.real_popen(*a, **k)
            self.children.append(p)
            return p
        return mock.patch.object(gd_net.subprocess, "Popen", start)

    def reap(self):
        for p in self.children:
            p.wait(timeout=30)

    def logs(self):
        return {p.parent.parent.name: p.read_text(errors="replace")
                for p in sorted((self.work / "clones").glob("*/out/run.log"))}

    def header(self, name):
        return f"# {shlex.join(self.cmds[name])}"

    def assert_no_unclosed_log(self, caught):
        leaks = [str(w.message) for w in caught if issubclass(w.category, ResourceWarning) and "run.log" in str(w.message)]
        self.assertEqual(leaks, [])

    def test_every_role_runs_and_its_log_is_closed(self):
        opened = []
        real_open = open

        def recording_open(*a, **k):
            opened.append(real_open(*a, **k))
            return opened[-1]

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            with self.popen(), mock.patch.object(gd_net, "open", recording_open, create=True):
                s = gd_net.session(self.work / "master", [role("server"), role("client")], timeout=30)
            gc.collect()
        self.assert_no_unclosed_log(caught)
        self.assertEqual([Path(f.name).name for f in opened], ["run.log", "run.log"])
        self.assertTrue(all(f.closed for f in opened))
        self.assertTrue(s["ok"], s)
        for name in ("server", "client"):
            self.assertEqual(s["roles"][name]["result"], {"ok": True, "who": name})
            lines = self.logs()[name].splitlines()
            self.assertEqual(lines[:2], [self.header(name), f"hello from {name}"])
            self.assertEqual(self.decoded[name].splitlines()[:2], lines[:2])
        # 0x81 is invalid UTF-8 and undefined in cp1252, so either locale decodes it as U+FFFD.
        self.assertEqual(self.logs()["client"].splitlines()[2:], ["\ufffd"])
        self.assertEqual(self.decoded["client"].splitlines()[2:], ["\ufffd"])
        self.assertEqual(self.logs()["server"].splitlines()[2:], [])
        self.assertEqual(json.loads((self.work / "clones/server/out/result.json").read_text())["who"], "server")

    def test_popen_failure_for_a_later_role_closes_every_log(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            raised = None
            try:
                with self.popen(fail_on=2):
                    gd_net.session(self.work / "master", [role("server"), role("client")], timeout=30)
            except FileNotFoundError as e:
                raised = e.filename
            gc.collect()
        self.assertEqual(raised, "godot")
        self.assert_no_unclosed_log(caught)
        self.assertEqual(len(self.children), 1)
        logs = self.logs()
        self.assertEqual(sorted(logs), ["client", "server"])
        self.assertEqual({name: log.splitlines()[0] for name, log in logs.items()},
                         {name: self.header(name) for name in logs})
        self.assertEqual(logs["client"], self.header("client") + "\n")


if __name__ == "__main__":
    unittest.main()
