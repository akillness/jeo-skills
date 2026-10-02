#!/usr/bin/env python3
"""Black-box optional retrieval routing; no provider calls or real credentials.

The installed jg boundary records the wire protocol and returns fixture evidence.
It does not implement or claim semantic inference or upstream ignore behavior.
Run: python3 scripts/test_jevgrep_regressions.py -v
"""

import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / ".agent-skills/jeo-skill/scripts/jeo-skill.py"
JG = r'''import json
import os
from pathlib import Path
import signal
import sys

args = sys.argv[1:]
with Path(os.environ["JG_CALL_LOG"]).open("a") as log:
    log.write(json.dumps(args) + "\n")
if os.environ.get("JG_STALL"):
    while True:
        signal.pause()
sys.stdout.write(os.environ.get("JG_STDOUT", "fixture evidence\n"))
sys.stderr.write(os.environ.get("JG_STDERR", ""))
raise SystemExit(int(os.environ.get("JG_EXIT", "0")))
'''


class JevgrepRegressions(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="jeo-explore-test-")
        self.addCleanup(self.temporary.cleanup)
        self.work = Path(self.temporary.name)
        self.home = self.work / "home"
        self.project = self.work / "project"
        self.bin = self.work / "bin"
        for directory in (self.home, self.project, self.bin):
            directory.mkdir()
        self.log = self.work / "jg-calls.jsonl"
        self.jg = self.bin / "jg"
        self.executable(self.jg, JG)
        self.catalog = self.work / "catalog.json"
        self.catalog.write_text(json.dumps({
            "version": "fixture", "categories": {"engineering": {}},
            "subcategories": {}, "bundles": {},
            "skills": [{"name": "alpha", "category": "engineering",
                        "subcategory": "testing", "description": "retrieval fixture"}],
        }))
        self.env = {
            "PATH": str(self.bin), "HOME": str(self.home), "TMPDIR": str(self.work),
            "XDG_CONFIG_HOME": str(self.home / ".config"),
            "XDG_CACHE_HOME": str(self.home / ".cache"),
            "PYTHONDONTWRITEBYTECODE": "1", "JG_CALL_LOG": str(self.log),
            # A catalog read would fail; explore must dispatch before reading it.
            "JEO_SKILLS_CATALOG": str(self.work / "nonexistent-catalog.json"),
        }

    def executable(self, path, source):
        path.write_text(f"#!{sys.executable}\n" + source)
        path.chmod(0o700)

    def cli(self, *args, extra_env=None):
        return subprocess.run([sys.executable, str(ROUTER), *args], cwd=self.project,
                              env={**self.env, **(extra_env or {})}, text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def snapshot(self):
        return {str(path.relative_to(self.work)): path.read_bytes() if path.is_file() else None
                for path in self.work.rglob("*") if path != self.log}

    def successful(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_metadata_search_keeps_json_results_without_invoking_jg(self):
        result = self.cli("search", "retrieval", "--json",
                          extra_env={"JEO_SKILLS_CATALOG": str(self.catalog)})
        self.successful(result)
        self.assertEqual(json.loads(result.stdout), [{
            "name": "alpha", "category": "engineering", "subcategory": "testing",
            "description": "retrieval fixture",
        }])
        self.assertEqual(self.calls(), [])

    def test_explore_scopes_skills_wiki_and_graph_without_catalog_or_cache_writes(self):
        scopes = (".agent-skills", "wiki", "graphify-out")
        for name in scopes:
            scope = self.project / name
            scope.mkdir()
            (scope / "evidence.txt").write_text("private fixture evidence")
            (scope / ".gitignore").write_text("ignored.txt\n")
            (scope / "ignored.txt").write_text("ignored fixture evidence")
        before = self.snapshot()
        for name in scopes:
            with self.subTest(scope=name):
                scope = self.project / name
                result = self.cli("explore", "trace responsibility", "--root", str(scope),
                                  "--allow-remote")
                self.successful(result)
                self.assertEqual(result.stdout, "fixture evidence\n")
                argv = self.calls()[-1]
                self.assertEqual(argv[:3], ["--no-cache", "--concurrency", "1"])
                self.assertEqual(argv[-3:], ["--", "trace responsibility", str(scope.resolve())])
                self.assertNotIn("--hidden", argv)
                self.assertNotIn("--no-ignore", argv)
        self.assertEqual(len(self.calls()), 3)
        self.assertEqual(self.snapshot(), before)

    def test_dry_run_is_inert_without_binary_consent_or_catalog(self):
        self.jg.unlink()
        query = 'find "ownership" $(touch should-not-exist)'
        before = self.snapshot()
        result = self.cli("explore", query, "--root", str(self.project), "--dry-run",
                          "--hidden", "--exclude", "raw/**", "--max-requests", "3",
                          "--max-output-bytes", "1024")
        self.successful(result)
        command = shlex.split(result.stdout.strip())
        self.assertEqual(Path(command[0]).name, "jg")
        self.assertEqual(command[1:], ["--no-cache", "--concurrency", "1",
                                     "--max-requests", "3", "--max-output-bytes", "1024",
                                     "--hidden", "--exclude=raw/**", "--", query,
                                     str(self.project.resolve())])
        self.assertEqual(self.calls(), [])
        self.assertEqual(self.snapshot(), before)

    def test_missing_consent_never_invokes_child(self):
        before = self.snapshot()
        result = self.cli("explore", "private sources", "--root", str(self.project))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--allow-remote", result.stderr)
        self.assertEqual(self.calls(), [])
        self.assertEqual(self.snapshot(), before)

    def test_missing_binary_fails_without_installing_or_authenticating(self):
        self.jg.unlink()
        before = self.snapshot()
        result = self.cli("explore", "private sources", "--root", str(self.project), "--allow-remote")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("jg", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(self.calls(), [])
        self.assertEqual(self.snapshot(), before)

    def test_invalid_inputs_rejected_before_child_invocation(self):
        cases = [
            ("empty query", ["", "--root", str(self.project)]),
            ("blank query", [" \t ", "--root", str(self.project)]),
            ("missing root", ["query"]),
            ("blank root", ["query", "--root", " "]),
            ("nonexistent root", ["query", "--root", str(self.work / "missing")]),
            ("file root", ["query", "--root", str(self.catalog)]),
        ]
        for option, values in (("--max-requests", ("0", "-1", "1.5", "9007199254740992")),
                               ("--max-output-bytes", ("255", "-1", "1.5", "9007199254740992")),
                               ("--timeout", ("0", "-1", "nan", "inf", "-inf"))):
            cases.extend((f"{option}={value}", ["query", "--root", str(self.project),
                                               f"{option}={value}"]) for value in values)
        before = self.snapshot()
        for name, args in cases:
            with self.subTest(case=name):
                result = self.cli("explore", *args, "--allow-remote")
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                self.assertEqual(self.calls(), [])
        self.assertEqual(self.snapshot(), before)

    def test_reserved_queries_cannot_dispatch_upstream_subcommands(self):
        for query in ("auth", "skill", "doctor", "files", "cache"):
            with self.subTest(query=query):
                result = self.cli("explore", query, "--root", str(self.project), "--allow-remote")
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(query, result.stderr)
                self.assertEqual(self.calls(), [])

    def test_literal_arguments_filters_and_nondefault_bounds_survive_transport(self):
        root = self.project / '-root "quoted" $(touch root-injection)'
        root.mkdir()
        queries = ('find "ownership"; $(touch query-injection) `touch backtick-injection`',
                   "--auth", "doctor responsibilities", " doctor ")
        before = self.snapshot()
        for query in queries:
            with self.subTest(query=query):
                result = self.cli("explore", "--root", str(root), "--allow-remote", "--hidden",
                                  "--exclude", "raw/**", "--exclude", "*.env", "--exclude=-private*",
                                  "--max-requests", "2", "--max-output-bytes", "256",
                                  "--timeout", "5", "--", query)
                self.successful(result)
                self.assertEqual(self.calls()[-1], [
                    "--no-cache", "--concurrency", "1", "--max-requests", "2",
                    "--max-output-bytes", "256", "--hidden", "--exclude=raw/**",
                    "--exclude=*.env", "--exclude=-private*", "--", query, str(root.resolve()),
                ])
        self.assertEqual(self.snapshot(), before)

    def test_child_stdout_stderr_and_failure_status_are_preserved(self):
        result = self.cli("explore", "query", "--root", str(self.project), "--allow-remote",
                          extra_env={"JG_STDOUT": "evidence: wiki/a.md:7\n한글\n",
                                     "JG_STDERR": "provider fixture rejected\n", "JG_EXIT": "23"})
        self.assertEqual(result.returncode, 23, result.stderr)
        self.assertEqual(result.stdout, "evidence: wiki/a.md:7\n한글\n")
        self.assertEqual(result.stderr, "provider fixture rejected\n")
        self.assertEqual(len(self.calls()), 1)

    def test_safe_integer_budget_edge_is_forwarded_without_rounding(self):
        budget = "9007199254740991"
        result = self.cli("explore", "query", "--root", str(self.project), "--allow-remote",
                          "--max-requests", budget, "--max-output-bytes", budget)
        self.successful(result)
        argv = self.calls()[0]
        self.assertEqual(argv[argv.index("--max-requests") + 1], budget)
        self.assertEqual(argv[argv.index("--max-output-bytes") + 1], budget)

    def test_stalled_child_surfaces_timeout_instead_of_hanging(self):
        result = self.cli("explore", "query", "--root", str(self.project), "--allow-remote",
                          "--timeout", "1", extra_env={"JG_STALL": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertRegex(result.stderr.lower(), r"time(?:d out|out)")
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(len(self.calls()), 1)

    def test_doctor_does_not_require_or_invoke_optional_jg(self):
        self.executable(self.bin / "node", 'print("v22.20.0")\n')
        self.executable(self.bin / "npx", 'raise SystemExit("unexpected installer invocation")\n')
        for installed in (True, False):
            with self.subTest(jg_installed=installed):
                if not installed:
                    self.jg.unlink()
                result = self.cli("doctor", extra_env={"JEO_SKILLS_CATALOG": str(self.catalog),
                                                      "JG_EXIT": "23"})
                self.successful(result)
                report = json.loads(result.stdout)
                self.assertTrue(report["ok"], report)
                self.assertEqual(report["errors"], [])
                self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
