#!/usr/bin/env python3
"""Offline Luau checks for Roblox code, no Studio needed.

Runs `luau-lsp analyze --platform=roblox` with the Roblox API definitions: it catches
misspelled members, wrong argument types, nil-unsafe access and deprecated APIs
(`wait`, `spawn`, `Humanoid:LoadAnimation`...). By default it runs twice, with the old
type solver and with the new one (`--flag:LuauSolverV2=true`): luau-lsp 1.70 uses the old
solver unless told, while Studio uses the new one for nonstrict scripts, and the two
disagree on real code. Optionally runs selene (lint) and stylua (format check).

Setup: luau-lsp from https://github.com/JohnnyMorganz/luau-lsp/releases on PATH (or
RBX_LUAU_LSP=<path>). The Roblox definitions file is downloaded once to
~/.cache/rbx-skills/ (override with RBX_DEFS=<path>).

CLI:
  rbx_check.py <file.luau|dir> [...] [--sourcemap sourcemap.json] [--solver both|old|new] [--selene] [--stylua] [--json]
  rbx_check.py --code 'print(workspace.Baseplatee)'
Exit code 1 when any error-level finding remains.

Python:
  from rbx_check import check
  r = check(code="local p = Instance.new('Part') p.Sizee = 1")
  r["ok"], r["errors"], r["warnings"]          # each finding carries "solver": "old" or "new"
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

__version__ = "0.1.0"

DEFS_URL = "https://raw.githubusercontent.com/JohnnyMorganz/luau-lsp/main/scripts/globalTypes.d.luau"
CACHE = Path(os.environ.get("RBX_SKILLS_CACHE", Path.home() / ".cache" / "rbx-skills"))
LINE = re.compile(r"^(?P<file>.+?)\((?P<line>\d+),(?P<col>\d+)\): (?P<kind>\w+): (?P<msg>.*)$")
# Lint kinds that are style or hygiene, not correctness. Everything else is an error.
WARN_KINDS = {"LocalUnused", "FunctionUnused", "ImportUnused", "LocalShadow", "SameLineStatement",
              "MultiLineStatement", "PlaceholderRead", "ImplicitReturn"}


def luau_lsp() -> str:
    exe = os.environ.get("RBX_LUAU_LSP") or shutil.which("luau-lsp")
    if not exe:
        raise FileNotFoundError("luau-lsp not found: install it from github.com/JohnnyMorganz/luau-lsp/releases "
                                "or set RBX_LUAU_LSP")
    return exe


def definitions() -> Path:
    env = os.environ.get("RBX_DEFS")
    if env:
        return Path(env)
    p = CACHE / "globalTypes.d.luau"
    if not p.exists() or p.stat().st_size < 100_000:
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(DEFS_URL, p)
    return p


def _parse(out: str) -> list[dict]:
    rows = []
    for ln in out.splitlines():
        m = LINE.match(ln.strip())
        if not m:
            continue
        d = m.groupdict()
        d["line"], d["col"] = int(d["line"]), int(d["col"])
        d["level"] = "warning" if d["kind"] in WARN_KINDS else "error"
        rows.append(d)
    return rows


def analyzer_rows(r: subprocess.CompletedProcess, files: list[str]) -> list[dict]:
    """Findings of one luau-lsp run. A nonzero exit with no finding (bad flag, bad sourcemap, crash) is an
    error carrying the output: otherwise code that was never analyzed would pass."""
    out = r.stdout + "\n" + r.stderr
    rows = _parse(out)
    if r.returncode != 0 and not any(x["level"] == "error" for x in rows):
        rows.append({"file": ",".join(files), "line": 0, "col": 0, "kind": "analyzer", "level": "error",
                     "msg": f"luau-lsp exited {r.returncode}: {out.strip()[-1500:]}"})
    return rows


def check(paths: list[str | Path] | None = None, code: str | None = None, sourcemap: str | None = None,
          selene: bool = False, stylua: bool = False, timeout: int = 300, solver: str = "both") -> dict:
    """Type-check and lint Luau files (or a code string). Returns ok, errors, warnings, tools.

    solver: "both" (default), "old" or "new". A path that does not exist is an error, never a silent pass."""
    tmp = None
    if code is not None:
        tmp = Path(tempfile.mkdtemp(prefix="rbx_check_"))
        f = tmp / "snippet.luau"
        f.write_text(code if code.lstrip().startswith("--!") else "--!strict\n" + code)
        paths = [f]
    files = [str(p) for p in (paths or [])]
    missing = [f for f in files if not Path(f).exists()]
    if missing or not files:
        return {"ok": False, "errors": [{"file": f, "line": 0, "col": 0, "kind": "missing", "level": "error",
                                         "msg": "no such file"} for f in missing or ["(no files)"]],
                "warnings": [], "tools": {}}
    cmd = [luau_lsp(), "analyze", "--platform=roblox", f"--definitions:@roblox={definitions()}"]
    if sourcemap:
        cmd += ["--sourcemap", sourcemap]
    passes = {"both": ["old", "new"], "old": ["old"], "new": ["new"]}[solver]
    rows = []
    for sv in passes:
        flags = ["--flag:LuauSolverV2=true"] if sv == "new" else []
        r = subprocess.run(cmd + flags + files, capture_output=True, text=True, timeout=timeout)
        for x in analyzer_rows(r, files):
            x["solver"] = sv
            rows.append(x)
    tools = {f"luau-lsp ({'+'.join(passes)} solver)": "ran"}
    if selene and shutil.which("selene"):
        # Without std = "roblox", selene parses typed Luau as Lua 5.1 and reports parse errors.
        cfg = Path("selene.toml")
        if not cfg.exists():
            cfg = CACHE / "selene.toml"
            if not cfg.exists():
                CACHE.mkdir(parents=True, exist_ok=True)
                cfg.write_text('std = "roblox"\n')
        s = subprocess.run(["selene", "--config", str(cfg), "--display-style", "quiet", *files],
                           capture_output=True, text=True, timeout=timeout)
        for ln in s.stdout.splitlines():
            m = re.match(r"^(.+?):(\d+):(\d+): (error|warning)\[(\w+)\]: (.*)$", ln)
            if m:
                rows.append({"file": m[1], "line": int(m[2]), "col": int(m[3]), "kind": f"selene:{m[5]}",
                             "msg": m[6], "level": m[4]})
        tools["selene"] = "ran"
    if stylua and shutil.which("stylua"):
        s = subprocess.run(["stylua", "--check", *files], capture_output=True, text=True, timeout=timeout)
        if s.returncode != 0:
            rows.append({"file": ",".join(files), "line": 0, "col": 0, "kind": "stylua", "level": "warning",
                         "msg": "formatting differs from stylua (run `stylua <files>`)"})
        tools["stylua"] = "ran"
    seen, uniq = set(), []
    for x in rows:  # selene can print the same finding twice
        k = (x["file"], x["line"], x["col"], x["kind"], x["msg"], x.get("solver"))
        if k not in seen:
            seen.add(k)
            uniq.append(x)
    rows = uniq
    errors = [x for x in rows if x["level"] == "error"]
    warnings = [x for x in rows if x["level"] != "error"]
    if tmp:
        for x in rows:
            x["line"] = max(0, x["line"] - (0 if code.lstrip().startswith("--!") else 1))
    return {"ok": not errors, "errors": errors, "warnings": warnings, "tools": tools}


def main(argv: list[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--code")
    ap.add_argument("--sourcemap")
    ap.add_argument("--selene", action="store_true")
    ap.add_argument("--stylua", action="store_true")
    ap.add_argument("--solver", default="both", choices=["both", "old", "new"])
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    paths: list[str] = []
    for p in a.paths:
        pp = Path(p)
        paths += [str(x) for x in pp.rglob("*.lua*")] if pp.is_dir() else [p]
    if not paths and a.code is None:
        ap.error("give files, a directory or --code")
    r = check(paths or None, a.code, a.sourcemap, a.selene, a.stylua, solver=a.solver)
    if a.json:
        print(json.dumps(r, indent=1))
    else:
        for x in r["errors"] + r["warnings"]:
            sv = f" [{x['solver']}]" if x.get("solver") else ""
            print(f"{x['level'].upper():7} {x['file']}:{x['line']}:{x['col']} {x['kind']}{sv}: {x['msg']}")
        print(f"rbx_check: {len(r['errors'])} errors, {len(r['warnings'])} warnings ({', '.join(r['tools'])})")
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
