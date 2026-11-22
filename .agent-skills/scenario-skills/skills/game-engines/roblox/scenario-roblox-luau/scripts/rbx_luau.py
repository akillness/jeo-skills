#!/usr/bin/env python3
"""Runner-side helpers for scenario-roblox-luau (system python3; Studio only for run()).

    typecheck(paths, sourcemap=None) -> dict
        rbx_check (luau-lsp, old solver, the default of `luau-lsp analyze`) plus a second pass with the
        new solver (--flag:LuauSolverV2=true). Returns {ok, old, new, only_old, only_new}. Studio's
        Script Editor may run either solver, so code ships when both passes have zero errors.
    sourcemap(project_dir) -> str   `rojo sourcemap` of a Rojo project, so script.Parent.X and require paths type-check
    audit(target, min_severity="info") -> dict
        LuauAudit with Lune on a .rbxl/.rbxlx or a Rojo source directory. {counts, findings, exit}.
    kit_source(names) -> str        this skill's AgentKit modules (agentkit/luau/<Name>.luau, or
                                    "templates/Class") as Luau locals named after the file
    run(studio, code, dm="Edit", kit=(), lead_kit=(), timeout=None) -> dict
        rbx_run.run with both kits inlined; error line numbers point into `code`.

CLI:
  rbx_luau.py typecheck <file|dir> [...] [--sourcemap sourcemap.json] [--json]
  rbx_luau.py audit <place.rbxl|dir> [info|warn|error]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEAD = HERE.parents[1] / "scenario-roblox-expert" / "scripts"
sys.path.insert(0, str(LEAD))
import rbx_check  # noqa: E402

__version__ = "0.1.0"

KIT = HERE / "agentkit" / "luau"


def _files(paths) -> list[str]:
    out: list[str] = []
    for p in paths:
        pp = Path(p)
        if pp.is_dir():
            out += [str(x) for x in sorted(pp.rglob("*.lua*")) if not x.name.startswith("lune_")]
        elif pp.exists():
            out.append(str(pp))
        else:
            raise FileNotFoundError(p)  # luau-lsp reports nothing for a missing path
    return out


def typecheck(paths, sourcemap: str | None = None, timeout: int = 300) -> dict:
    files = [str(Path(f).resolve()) for f in _files(paths)]
    cwd = os.getcwd()
    if sourcemap:
        sourcemap = str(Path(sourcemap).resolve())
        os.chdir(Path(sourcemap).parent)  # luau-lsp resolves sourcemap file paths from the working directory
    try:
        # One pass per solver so each result holds only its own findings (rbx_check defaults to both).
        old = rbx_check.check(files, sourcemap=sourcemap, timeout=timeout, solver="old")
        new = rbx_check.check(files, sourcemap=sourcemap, timeout=timeout, solver="new")
    finally:
        os.chdir(cwd)

    def key(x):
        return (x["file"], x["line"])

    old_k = {key(x) for x in old["errors"]}
    new_k = {key(x) for x in new["errors"]}
    return {"ok": old["ok"] and new["ok"], "files": len(files), "old": old, "new": new,
            "only_old": [x for x in old["errors"] if key(x) not in new_k],
            "only_new": [x for x in new["errors"] if key(x) not in old_k]}


def sourcemap(project_dir: str | Path) -> str:
    d = Path(project_dir).resolve()
    out = d / "sourcemap.json"
    # --include-non-scripts: without it Folders and remotes are missing, and the new solver reports
    # unknown keys on every path through them (scenario-roblox-tooling P2).
    r = subprocess.run(["rojo", "sourcemap", str(d), "-o", str(out), "--include-non-scripts"],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"rojo sourcemap failed: {r.stderr or r.stdout}")
    return str(out)


def audit(target: str | Path, min_severity: str = "info") -> dict:
    r = subprocess.run(["lune", "run", str(KIT / "lune_luau_audit.luau"), str(Path(target).resolve()), min_severity],
                       capture_output=True, text=True, timeout=300)
    try:
        data = json.loads(r.stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"lune audit failed: {r.stderr[-2000:] or r.stdout[-2000:]}") from e
    data["exit"] = r.returncode
    return data


def kit_source(names=()) -> str:
    parts = []
    for n in names:
        src = (KIT / f"{n}.luau").read_text()
        parts.append(f"local {Path(n).name} = (function()\n{src}\nend)()")  # templates/Class -> Class
    return "\n".join(parts) + ("\n" if parts else "")


def run(studio, code: str, dm: str = "Edit", kit=(), lead_kit=(), timeout: float | None = None) -> dict:
    import rbx_mcp
    import rbx_run
    mine = kit_source(kit)
    chunk, offset = rbx_run.wrap(mine + code, list(lead_kit))
    offset += mine.count("\n")
    try:
        text = studio.luau(chunk, dm=dm, timeout=timeout)
    except rbx_mcp.MCPError as e:
        return {"ok": False, "result": None, "error": rbx_run._fix_lines(str(e), offset), "output": []}
    return rbx_run.parse(text, offset)


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in ("typecheck", "audit"):
        print(__doc__)
        return 2
    if argv[0] == "audit":
        r = audit(argv[1], argv[2] if len(argv) > 2 else "info")
        print(json.dumps(r, indent=1))
        return r["exit"]
    rest, sm, as_json = argv[1:], None, False
    if "--sourcemap" in rest:
        i = rest.index("--sourcemap")
        sm = rest[i + 1]
        rest = rest[:i] + rest[i + 2:]
    if "--json" in rest:
        rest.remove("--json")
        as_json = True
    r = typecheck(rest, sm)
    if as_json:
        print(json.dumps(r, indent=1))
    else:
        for label, rows in (("old", r["old"]["errors"]), ("new", r["new"]["errors"])):
            for x in rows:
                print(f"{label:3} {x['file']}:{x['line']}:{x['col']} {x['kind']}: {x['msg']}")
        print(f"typecheck: {r['files']} files, old solver {len(r['old']['errors'])} errors, "
              f"new solver {len(r['new']['errors'])} errors")
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
