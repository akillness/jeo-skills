#!/usr/bin/env python3
"""Regression tests proving `.jeo/db/jeo.db` is managed exclusively by `../jeo-code`."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
JEOX = ROOT / "scripts/jeox.py"
SIBLING_JEO_CODE_CLI = ROOT.parent / "jeo-code/packages/jeo-mem/src/cli.ts"


class JeoxRegressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="jeox-reg-")
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve()
        self.repo = self.base / "repo"
        self.repo.mkdir()

    def _run(self, *args: str, stdin_text: str | None = None, env_extra: dict | None = None, cwd: Path | None = None):
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", **(env_extra or {})}
        return subprocess.run(
            [sys.executable, str(JEOX), *args],
            cwd=cwd or self.repo,
            env=env,
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=30,
        )

    def test_shim_contains_no_sqlite_and_fails_closed_without_jeo_code(self) -> None:
        src = JEOX.read_text(encoding="utf-8")
        self.assertNotIn("sqlite3", src)
        fake_home = self.base / "no-home"
        fake_home.mkdir()
        res = self._run(
            "build", "--repo", str(self.repo),
            env_extra={"HOME": str(fake_home), "PATH": "/usr/bin:/bin", "JEO_CODE_ROOT": "none"},
        )
        self.assertNotEqual(res.returncode, 0, res.stdout)
        self.assertIn("managed exclusively by ../jeo-code", res.stderr)
        self.assertFalse((self.repo / ".jeo").exists())
        self.assertFalse((fake_home / ".jeo").exists())

    def test_shim_forwards_cli_and_mcp_strictly_to_jeo_code(self) -> None:
        fake_home = self.base / "home"
        fake_home.mkdir()
        fake_bin = self.base / "bin"
        fake_bin.mkdir()
        fake_jeo_code = self.base / "jeo-code"
        mem_cli = fake_jeo_code / "packages/jeo-mem/src/cli.ts"
        mem_cli.parent.mkdir(parents=True)
        mem_cli.write_text("// fixture cli.ts\n", encoding="utf-8")

        bun = fake_bin / "bun"
        bun.write_text(
            f"#!{sys.executable}\n"
            "import json, sys\n"
            "print(json.dumps({'argv': sys.argv[1:]}))\n",
            encoding="utf-8",
        )
        bun.chmod(0o755)

        res = self._run(
            "who-calls", "foo", "--repo", str(self.repo), "--json",
            env_extra={"HOME": str(fake_home), "PATH": f"{fake_bin}:/usr/bin:/bin", "JEO_CODE_ROOT": str(fake_jeo_code)},
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        payload = json.loads(res.stdout)
        self.assertEqual(payload["argv"], [str(mem_cli), "who-calls", "foo", "--repo", str(self.repo), "--json"])
        self.assertFalse((self.repo / ".jeo").exists(), "shim must never touch .jeo/ itself")

    @unittest.skipUnless(
        SIBLING_JEO_CODE_CLI.is_file() and shutil.which("bun"),
        "requires sibling ../jeo-code checkout and bun runtime",
    )
    def test_sibling_jeo_code_prunes_legacy_tables_indexes_and_guards_home_mcp(self) -> None:
        (self.repo / "pkg").mkdir()
        (self.repo / "pkg/a.py").write_text("import os\ndef foo():\n    return bar()\ndef bar():\n    return 1\n", encoding="utf-8")
        (self.repo / "pkg/b.py").write_text("from .a import foo\ndef baz():\n    return foo()\n", encoding="utf-8")
        (self.repo / "docs.md").write_text("# Architecture\n\nUpdated delta workflow.\n", encoding="utf-8")

        # Seed obsolete Python schema tables that jeo-code must prune automatically
        legacy_db = self.repo / ".jeo/db/jeo.db"
        legacy_db.parent.mkdir(parents=True, exist_ok=True)
        raw = sqlite3.connect(legacy_db)
        raw.executescript(
            "CREATE TABLE symbols(id INTEGER PRIMARY KEY, name TEXT);"
            "CREATE TABLE files_state(path TEXT PRIMARY KEY);"
            "CREATE TABLE chunks(id INTEGER PRIMARY KEY, path TEXT, body TEXT);"
            "CREATE VIRTUAL TABLE chunks_fts USING fts5(body);"
        )
        raw.close()

        res = self._run("build", "--repo", str(self.repo), "--full", env_extra={"JEO_CODE_ROOT": str(ROOT.parent / "jeo-code")})
        self.assertEqual(res.returncode, 0, res.stderr + res.stdout)

        con = sqlite3.connect(legacy_db)
        try:
            self.assertEqual(con.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            self.assertFalse({"symbols", "edges", "chunks", "files_state", "chunks_fts"} & tables, tables)
            self.assertTrue({"schema_versions", "code_files", "code_nodes", "code_edges"} <= tables, tables)
        finally:
            con.close()

        who = json.loads(self._run("who-calls", "foo", "--repo", str(self.repo), "--json").stdout)
        self.assertTrue(any(row["path"] == "pkg/b.py" for row in who), who)

        hits = json.loads(self._run("query", "Updated delta", "--repo", str(self.repo), "--json").stdout)
        self.assertTrue(any(h["path"] == "docs.md" for h in hits), hits)

        fake_home = self.base / "fakehome"
        fake_home.mkdir()
        msgs = "\n".join([
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}),
            json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "jeox_where_defined", "arguments": {"name": "foo"}}}),
            json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "jeox_where_defined", "arguments": {"name": "foo", "repo": str(self.repo)}}}),
        ]) + "\n"
        mcp = self._run("mcp", stdin_text=msgs, cwd=fake_home, env_extra={"HOME": str(fake_home)})
        self.assertEqual(mcp.returncode, 0, mcp.stderr)
        resps = [json.loads(l) for l in mcp.stdout.splitlines() if l.strip()]
        self.assertIn("error", resps[1])
        self.assertFalse((fake_home / ".jeo/db/jeo.db").exists())
        self.assertIn("pkg/a.py", resps[2]["result"]["content"][0]["text"])


if __name__ == "__main__":
    unittest.main()
