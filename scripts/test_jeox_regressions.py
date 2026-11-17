#!/usr/bin/env python3
"""Regression tests for scripts/jeox.py FTS5 stability, edge cleanup, and MCP safety."""
from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
JEOX = ROOT / "scripts/jeox.py"


class JeoxRegressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="jeox-reg-")
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name).resolve() / "repo"
        self.repo.mkdir()

    def _run(self, *args: str, stdin_text: str | None = None, env_extra: dict | None = None):
        env = {**dict(__import__("os").environ), "PYTHONDONTWRITEBYTECODE": "1", **(env_extra or {})}
        return subprocess.run(
            [sys.executable, str(JEOX), *args],
            cwd=self.repo,
            env=env,
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=30,
        )

    def test_repeated_full_build_and_file_removal_keep_fts5_healthy_and_sibling_imports(self) -> None:
        (self.repo / "a.py").write_text("import os\ndef foo():\n    return bar()\ndef bar():\n    return 1\n", encoding="utf-8")
        (self.repo / "b.py").write_text("import sys\ndef baz():\n    return foo()\n", encoding="utf-8")
        (self.repo / "docs.md").write_text("# Architecture\n\nAlpha beta gamma workflow.\n", encoding="utf-8")

        for _ in range(3):
            res = self._run("build", "--repo", str(self.repo), "--full")
            self.assertEqual(res.returncode, 0, res.stderr)

        (self.repo / "a.py").unlink()
        (self.repo / "docs.md").write_text("# Architecture\n\nUpdated delta workflow.\n", encoding="utf-8")
        res = self._run("build", "--repo", str(self.repo))
        self.assertEqual(res.returncode, 0, res.stderr)

        con = sqlite3.connect(self.repo / ".jeo/db/jeo.db")
        try:
            self.assertEqual(con.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            con.execute("INSERT INTO chunks_fts(chunks_fts) VALUES('integrity-check')")
            imports_b = con.execute("SELECT callee_name, src_path FROM edges WHERE kind='import'").fetchall()
            self.assertEqual(imports_b, [("sys", "b.py")])
        finally:
            con.close()

        who = json.loads(self._run("who-calls", "foo", "--repo", str(self.repo), "--json").stdout)
        self.assertEqual(len(who), 1)
        self.assertEqual(who[0]["path"], "b.py")

        hits = json.loads(self._run("query", "Updated delta", "--repo", str(self.repo), "--json").stdout)
        self.assertTrue(any(h["path"] == "docs.md" for h in hits), hits)

    def test_mcp_serve_guards_home_and_supports_repo_queries(self) -> None:
        (self.repo / "mod.py").write_text("def target_fn():\n    return 42\n", encoding="utf-8")
        self.assertEqual(self._run("build", "--repo", str(self.repo)).returncode, 0)

        # Calling tools/call when cwd==HOME without repo arg must fail cleanly and never create ~/.jeo/db
        fake_home = Path(self.tmp.name).resolve() / "fakehome"
        fake_home.mkdir()
        msgs_home = "\n".join([
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}),
            json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "jeox_where_defined", "arguments": {"name": "target_fn"}}}),
        ]) + "\n"
        home_proc = subprocess.run(
            [sys.executable, str(JEOX), "mcp"],
            cwd=fake_home,
            env={**dict(__import__("os").environ), "HOME": str(fake_home), "PYTHONDONTWRITEBYTECODE": "1"},
            input=msgs_home, capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(home_proc.returncode, 0, home_proc.stderr)
        lines_h = [json.loads(l) for l in home_proc.stdout.splitlines() if l.strip()]
        self.assertIn("error", lines_h[1])
        self.assertFalse((fake_home / ".jeo/db/jeo.db").exists())

        # Passing repo explicitly serves live symbols over stdio
        msgs_repo = "\n".join([
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}),
            json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}),
            json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "jeox_where_defined", "arguments": {"name": "target_fn", "repo": str(self.repo)}}}),
        ]) + "\n"
        ok_proc = self._run("mcp", "--repo", str(self.repo), stdin_text=msgs_repo)
        self.assertEqual(ok_proc.returncode, 0, ok_proc.stderr)
        resps = [json.loads(l) for l in ok_proc.stdout.splitlines() if l.strip()]
        tool_names = [t["name"] for t in resps[1]["result"]["tools"]]
        self.assertIn("jeox_where_defined", tool_names)
        payload = json.loads(resps[2]["result"]["content"][0]["text"])
        self.assertEqual(payload[0]["path"], "mod.py")


if __name__ == "__main__":
    unittest.main()
