"""Tests for scripts/jeox.py — graph extraction, BM25 scope query, incremental build."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

JEOX = str(Path(__file__).resolve().parent / "jeox.py")


def jeox(args: list[str], repo: Path, check: bool = True) -> dict | list:
    proc = subprocess.run(
        [sys.executable, JEOX, *args, "--repo", str(repo)],
        capture_output=True, text=True, check=check)
    return json.loads(proc.stdout)


@pytest.fixture()
def repo(tmp_path: Path) -> Path:
    (tmp_path / "app.py").write_text(
        "def helper(x):\n    return run(x)\n\n"
        "def run(x):\n    return x * 2\n\n"
        "def main():\n    return helper(3)\n")
    (tmp_path / "lib.ts").write_text(
        "export function greet(name: string) {\n  return format(name);\n}\n"
        "export function format(n: string) {\n  return n.toUpperCase();\n}\n")
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "guide.md").write_text(
        "# Guide\n\n## Architecture\n\nalpha system design\n" * 20)
    jeox(["build", "--json"], tmp_path)
    return tmp_path


def test_build_indexes_symbols_and_chunks(repo):
    st = jeox(["status", "--json"], repo)
    assert st["symbols"] >= 5  # 3 py + 2 ts
    assert st["chunks"] >= 3


def test_where_defined(repo):
    out = jeox(["where-defined", "helper", "--json"], repo)
    assert out == [{"name": "helper", "kind": "function", "path": "app.py",
                    "line": 1, "lang": "py"}]


def test_who_calls(repo):
    out = jeox(["who-calls", "helper", "--json"], repo)
    assert any(o["symbol"] == "main" and o["call_line"] == 8 for o in out)


def test_who_calls_ts(repo):
    out = jeox(["who-calls", "format", "--json"], repo)
    assert any(o["symbol"] == "greet" for o in out)


def test_what_calls(repo):
    out = jeox(["what-calls", "main", "--json"], repo)
    assert {"callee": "helper", "calls": 1} in out


def test_impact_transitive(repo):
    out = jeox(["impact", "run", "--json"], repo)
    affected = {a["caller"]: a["depth"] for a in out["affected"]}
    assert affected.get("helper") == 1
    assert affected.get("main") == 2


def test_query_scope_globs(repo):
    out = jeox(["query", "alpha system design", "-g", "docs/**", "--json"], repo)
    assert out and out[0]["path"].startswith("docs/")
    assert out[0]["heading"] == "Guide > Architecture"


def test_query_excluded_by_glob(repo):
    out = jeox(["query", "alpha system design", "-g", "!docs/**", "--json"], repo)
    assert out == []


def test_incremental_build_skips_unchanged(repo):
    second = jeox(["build", "--json"], repo)
    assert second["changed"] == 0


def test_incremental_build_picks_up_change(repo):
    jeox(["build", "--json"], repo)
    (repo / "app.py").write_text(
        "def helper(x):\n    return run(x)\n\n"
        "def run(x):\n    return x * 2\n\n"
        "def main():\n    return helper(4)\n")
    out = jeox(["build", "--json"], repo)
    assert out["changed"] == 1
    assert jeox(["who-calls", "helper", "--json"], repo)[0]["call_line"] == 8


def test_removed_file_cleanup(repo):
    jeox(["build", "--json"], repo)
    (repo / "lib.ts").unlink()
    out = jeox(["build", "--json"], repo)
    assert out["removed"] == 1
    assert jeox(["where-defined", "format", "--json"], repo) == []
