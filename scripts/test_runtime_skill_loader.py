#!/usr/bin/env python3
"""Hermetic subprocess tests for the opt-in loader probe's failure contract."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


PROBE = Path(__file__).resolve().with_suffix(".mjs")


class RuntimeSkillLoaderProbe(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="jeo-probe-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.home = self.root / "home"
        self.cwd = self.root / "project"
        self.home.mkdir()
        self.cwd.mkdir()
        self.module = self.root / "loader.mjs"
        self.skill = self.home / "SKILL.md"
        self.skill.write_text("fixture skill\n")
        self.bun = shutil.which("bun")
        if self.bun is None:
            self.skipTest("Bun is required for the optional runtime probe tests")
        self.env = {"PATH": os.defpath, "HOME": os.environ["HOME"]}

    def run_probe(self, source, *options, environment=None):
        self.module.write_text(source)
        return subprocess.run([
            self.bun, str(PROBE), "--runtime", "gjc", "--module", str(self.module),
            "--home", str(self.home), "--cwd", str(self.cwd), "--skill", "fixture",
            *options,
        ], env={**self.env, **(environment or {})}, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)

    def test_runtime_exception_handler_cannot_swallow_failed_assertion(self):
        result = self.run_probe(
            "process.on('uncaughtException', () => {});\n"
            "export async function loadSkills() { return { skills: [], warnings: [] }; }\n",
            "--expect", "present", "--expected-path", str(self.skill), "--description", "fixture")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn('"ok":true', result.stdout)

    def test_runtime_rejection_handler_cannot_swallow_loader_failure(self):
        result = self.run_probe(
            "process.on('unhandledRejection', () => {});\n"
            "export async function loadSkills() { throw new Error('real loader failure'); }\n",
            "--expect", "absent")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("real loader failure", result.stderr)

    def test_runtime_handlers_cannot_swallow_stray_async_failures(self):
        cases = (("uncaughtException", "queueMicrotask(() => { throw new Error('stray async failure'); });"),
                 ("unhandledRejection", "Promise.reject(new Error('stray async failure'));"))
        for event, trigger in cases:
            with self.subTest(event=event):
                result = self.run_probe(
                    f"process.on('{event}', () => {{}});\n"
                    "export async function loadSkills() {\n"
                    f"  {trigger}\n"
                    "  await new Promise(() => {});\n"
                    "}\n", "--expect", "absent")
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn("stray async failure", result.stderr)

    def test_early_zero_exit_without_loader_evidence_is_failure(self):
        result = self.run_probe("process.exit(0);\n", "--expect", "absent")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_worker_excludes_inherited_credentials_and_runtime_options(self):
        result = self.run_probe(
            "export async function loadSkills() {\n"
            "  const forbidden = ['AWS_ACCESS_KEY_ID', 'GITHUB_TOKEN', 'NPM_TOKEN', 'PI_SESSION_FILE', 'BUN_OPTIONS', 'NODE_OPTIONS'];\n"
            "  const leaked = forbidden.filter(key => key in process.env);\n"
            "  if (leaked.length) throw new Error('leaked environment: ' + leaked.join(','));\n"
            "  if (process.env.HOME !== process.env.XDG_CONFIG_HOME.replace(/\\/\\.config$/, '')) throw new Error('wrong HOME');\n"
            "  return { skills: [], warnings: [] };\n"
            "}\n",
            "--expect", "absent", environment={
                "AWS_ACCESS_KEY_ID": "fixture-secret", "GITHUB_TOKEN": "fixture-secret",
                "NPM_TOKEN": "fixture-secret", "PI_SESSION_FILE": "/not/a/real/session",
                "BUN_OPTIONS": "", "NODE_OPTIONS": "",
            })
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        proof = json.loads(result.stdout.splitlines()[-1])
        self.assertEqual((proof["ok"], proof["skill"], proof["expected"]), (True, "fixture", "absent"))

    def test_hung_worker_is_killed_with_nonzero_timeout_evidence(self):
        result = self.run_probe("while (true) {}\n", "--expect", "absent", "--timeout-ms", "1000")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        failure = json.loads(result.stderr.splitlines()[-1])
        self.assertEqual(failure["phase"], "worker-timeout")
        self.assertEqual(failure["ok"], False)


if __name__ == "__main__":
    unittest.main()
