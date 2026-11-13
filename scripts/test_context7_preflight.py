#!/usr/bin/env python3
"""Black-box regressions for Context7's offline preflight."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / ".agent-skills" / "context7" / "scripts" / "preflight.py"


class Context7PreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="context7-preflight-")
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.home = self.work / "home"
        self.home.mkdir()
        self.marker = self.work / "executed"
        # Enforce the offline and no-credential-read contract in the child itself.
        (self.work / "sitecustomize.py").write_text(
            "import os, sys\n"
            "home = os.environ['HOME'] + os.sep\n"
            "def reject(reason):\n"
            "    with open(os.environ['PREFLIGHT_MARKER'], 'a') as stream:\n"
            "        stream.write(reason + '\\n')\n"
            "    raise RuntimeError(reason)\n"
            "def guard(event, args):\n"
            "    if event.startswith('socket.') or event in ('subprocess.Popen', 'os.system', 'os.exec', 'os.spawn'):\n"
            "        reject('forbidden operation: ' + event)\n"
            "    if event == 'open' and isinstance(args[0], (str, bytes, os.PathLike)):\n"
            "        if os.fsdecode(args[0]).startswith(home):\n"
            "            reject('forbidden home read')\n"
            "sys.addaudithook(guard)\n",
            encoding="utf-8",
        )
        (self.home / "credentials.json").write_text('SECRET_CONTEXT7_TOKEN', encoding="utf-8")

    def executable(self, name, directory=None, executable=True):
        path = (directory or self.bin) / name
        path.write_text(
            "#!" + sys.executable + "\n"
            "from pathlib import Path\n"
            "Path(" + repr(str(self.marker)) + ").write_text('executed')\n",
            encoding="utf-8",
        )
        path.chmod(0o700 if executable else 0o600)
        return path

    def invoke(self, *args, path=None, helper=HELPER, cwd=None):
        env = {
            "PATH": str(self.bin) if path is None else path,
            "HOME": str(self.home),
            "PYTHONPATH": str(self.work),
            "PYTHONDONTWRITEBYTECODE": "1",
            "CONTEXT7_API_KEY": "SECRET_CONTEXT7_TOKEN",
            "PREFLIGHT_MARKER": str(self.marker),
        }
        return subprocess.run(
            [sys.executable, str(helper), *args], cwd=cwd or self.work, env=env,
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, timeout=10, check=False,
        )

    def test_missing_executables_are_reported_without_claiming_verification(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertIsNone(report["ctx7"])
        self.assertIsNone(report["node"])
        self.assertTrue(report["node_version_not_checked"])
        self.assertEqual(report["mcp_status"], "not_checked")
        self.assertFalse(report["network_used"])
        self.assertNotIn("SECRET_CONTEXT7_TOKEN", result.stdout + result.stderr)
        self.assertFalse(self.marker.exists(), "preflight attempted an unsafe operation")

    def test_executable_resolution_obeys_path_and_never_executes_tools(self):
        later = self.work / "later"
        later.mkdir()
        self.executable("ctx7", executable=False)
        selected = self.executable("ctx7", later)
        node = self.executable("node")
        result = self.invoke(path=os.pathsep.join((str(self.bin), str(later))))
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["ctx7"], str(selected))
        self.assertEqual(report["node"], str(node))
        self.assertEqual(report["mcp_status"], "not_checked")
        self.assertTrue(report["node_version_not_checked"])
        self.assertFalse(report["network_used"])
        self.assertFalse(self.marker.exists(), "preflight executed a discovered tool")
        self.assertNotIn("SECRET_CONTEXT7_TOKEN", result.stdout + result.stderr)

    def test_installed_helper_runs_from_unrelated_repository(self):
        installed = self.work / "installed" / "context7"
        shutil.copytree(HELPER.parents[1], installed)
        other_repo = self.work / "unrelated-repository"
        other_repo.mkdir()
        ctx7 = self.executable("ctx7")
        helper = installed / "scripts" / "preflight.py"
        result = self.invoke(helper=helper, cwd=other_repo)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["ctx7"], str(ctx7))
        self.assertEqual(report["mcp_status"], "not_checked")
        self.assertFalse(report["network_used"])
        self.assertFalse(self.marker.exists(), "preflight attempted an unsafe operation")

    def test_unknown_argument_fails_without_running_discovered_tools(self):
        self.executable("ctx7")
        result = self.invoke("--unexpected-option")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unrecognized arguments", result.stderr)
        self.assertEqual(result.stdout, "")
        self.assertFalse(self.marker.exists())


if __name__ == "__main__":
    unittest.main()
