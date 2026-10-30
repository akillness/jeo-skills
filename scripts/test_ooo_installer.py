#!/usr/bin/env python3
"""ooo installs on its own: no OpenSpace checkout, venv, ranker, or network fixture needed."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SKILL = Path(__file__).resolve().parents[1] / ".agent-skills/ooo"
INSTALLER = SKILL / "scripts/install.sh"


class OooInstaller(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="ooo-installer-test-")
        self.addCleanup(tmp.cleanup)
        self.work = Path(tmp.name).resolve()
        self.home = self.work / "home"
        self.bin = self.work / "bin"
        self.home.mkdir()
        self.bin.mkdir()
        self.log = self.work / "events.jsonl"
        for utility in ("dirname", "tr"):
            source = Path("/usr/bin") / utility
            (self.bin / utility).symlink_to(source if source.exists() else Path("/bin") / utility)
        for name in ("npx", "pip3", "git", "curl", "openspace-mcp", "ouroboros"):
            self.command(name, f"record({name!r})")
        self.command("selected-python", """record("selected-python")
if sys.argv[1:2] == ["-c"]:
    print("1" if os.environ.get("FIXTURE_MANAGED") else "0")
    sys.exit(0)
if os.environ.get("FAIL_SELECTED_PYTHON"):
    sys.exit(41)""")
        self.env = {
            "HOME": str(self.home), "PATH": f"{self.bin}:/usr/bin:/bin", "FIXTURE_LOG": str(self.log),
            "PYTHON_BIN": str(self.bin / "selected-python"), "PYTHONDONTWRITEBYTECODE": "1",
            "OOO_GIT_INTERVIEW": "0", "OOO_SPEC_KIT": "0", "OOO_CLI_ANYTHING": "0",
        }

    def command(self, name, body):
        path = self.bin / name
        path.write_text(
            f"#!{sys.executable}\nimport json, os, sys\n"
            "def record(event):\n"
            "    with open(os.environ['FIXTURE_LOG'], 'a') as f:\n"
            "        f.write(json.dumps({'event': event, 'argv': sys.argv[1:]}) + '\\n')\n"
            f"{body}\n"
        )
        path.chmod(0o700)

    def run_script(self, *args, **env):
        return subprocess.run(["/bin/bash", str(INSTALLER), *args], cwd=self.work, env={**self.env, **env},
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)

    def events(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_installs_without_openspace_and_never_touches_it(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout)
        names = [e["event"] for e in self.events()]
        self.assertEqual(names[:2], ["selected-python", "selected-python"])
        self.assertIn("npx", names)
        pip = [e["argv"] for e in self.events() if e["event"] == "selected-python"]
        self.assertEqual(pip[1], ["-m", "pip", "--version"])
        self.assertEqual(pip[2][:3], ["-m", "pip", "install"])
        for absent in ("git", "curl", "openspace-mcp", "pip3"):
            self.assertNotIn(absent, names)
        self.assertNotIn("openspace", result.stdout.lower())

    def test_removed_openspace_entrypoints_are_usage_errors(self):
        for args in (["--ensure-openspace"], ["--search", str(self.work), "anything"]):
            with self.subTest(args=args):
                result = self.run_script(*args)
                self.assertEqual(result.returncode, 2, result.stdout)
                self.assertEqual(self.events(), [])

    def test_missing_pip_in_selected_python_fails_without_path_fallback(self):
        result = self.run_script(FAIL_SELECTED_PYTHON="1")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        names = [e["event"] for e in self.events()]
        self.assertNotIn("pip3", names)
        self.assertNotIn("npx", names)

    def test_managed_python_is_rejected_before_changes_unless_package_skipped(self):
        result = self.run_script(FIXTURE_MANAGED="1")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("externally managed", result.stdout.lower())
        self.assertNotIn("npx", [e["event"] for e in self.events()])
        self.log.unlink()
        result = self.run_script(FIXTURE_MANAGED="1", SKIP_PACKAGE="1")
        self.assertEqual(result.returncode, 0, result.stdout)
        names = [e["event"] for e in self.events()]
        self.assertNotIn("selected-python", names)
        self.assertIn("npx", names)

    def test_skill_documents_no_openspace_prerequisite(self):
        text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        for stale in ("OPENSPACE_PYTHON", "OPENSPACE_INSTALL_APPROVED", "OPENSPACE_OOO_HOME", "--search", "--ensure-openspace"):
            self.assertNotIn(stale, text)
        self.assertNotIn("OPENSPACE", INSTALLER.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
