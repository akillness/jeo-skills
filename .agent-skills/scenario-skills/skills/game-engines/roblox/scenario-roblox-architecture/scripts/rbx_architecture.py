#!/usr/bin/env python3
"""Runner-side helpers for scenario-roblox-architecture (system python3, no Studio needed to import).

    scaffold(dest, name=None, fixtures=False, overwrite=False) -> Path
        Copy the arena skeleton (templates/arena/src plus Loader and Binder) into <dest>/src, write a
        Rojo project with emitLegacyScripts false, Deferred signals and PlayerCharacterDestroyBehavior
        Enabled, and build <dest>/<name>.rbxl (rbx_env.new_place, then one patch and a rebuild).
    update_sources(dest, fixtures=False)     copy the template sources only (no build): for an open place
    sourcemap(dest) -> Path                  rojo sourcemap (non-scripts included), so luau-lsp types instance paths
    check(dest, extra=None) -> dict          luau-lsp over <dest>/src (and extra files) on BOTH type solvers
    typecheck(files, sourcemap=None) -> dict luau-lsp on the old and the new solver (--flag:LuauSolverV2=true);
                                             errors carry "solver"; {ok, errors, warnings, old, new}
    audit_file(place, area="all") -> dict    ArchAudit on a place file with Lune (offline)
    place_facts(place) -> dict               saved RunContext of every script, Workspace settings (Lune)
    kit_source(names) -> str                 this skill's AgentKit modules as Luau locals
    run(studio, code, dm="Edit", kit=(), lead_kit=())  rbx_run.run with both kits inlined
    boot_report(pt) -> dict                  Boot* attributes of both entry scripts during a playtest
    sync_sources(studio, dest) -> dict       write <dest>'s .luau files into the open place (Edit), like
                                             Rojo serve: agents keep one window open, so edits go in live

CLI:
  rbx_architecture.py scaffold <dest> [--name N] [--fixtures] [--overwrite]
  rbx_architecture.py audit <place.rbxl>
  rbx_architecture.py facts <place.rbxl>
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEAD = HERE.parents[1] / "scenario-roblox-expert" / "scripts"
sys.path.insert(0, str(LEAD))
import rbx_check  # noqa: E402
import rbx_env  # noqa: E402

__version__ = "0.1.0"

KIT = HERE / "agentkit" / "architecture"
TEMPLATE = HERE / "templates" / "arena"

# Rojo tree of the arena skeleton, merged into rbx_env's baseplate template.
TREE = {
    "ReplicatedFirst": {"Boot": {"$path": "src/first/Boot.client.luau"}},
    "ReplicatedStorage": {
        "Shared": {"$path": "src/shared"},
        "Client": {"$path": "src/client"},
        "GameState": {"$className": "Configuration",
                      "$attributes": {"RoundState": "Lobby", "EndsAt": 0, "Winner": "", "Map": ""}},
    },
    "ServerScriptService": {"Server": {"$path": "src/server"}},
    # Maps stay in ServerStorage (never replicated): MapService clones one into Workspace per round.
    "ServerStorage": {"Tools": {"$path": "src/assets/Tools"}, "Maps": {"$path": "src/assets/Maps"}},
    # Persistent screens: direct children of StarterGui with ResetOnSpawn false.
    "StarterGui": {"Shop": {"$path": "src/gui/Shop.model.json"}},
    "Teams": {
        "Red": {"$className": "Team", "$properties": {"TeamColor": {"BrickColor": 21}, "AutoAssignable": False}},
        "Blue": {"$className": "Team", "$properties": {"TeamColor": {"BrickColor": 23}, "AutoAssignable": False}},
    },
    "Workspace": {"$properties": {"SignalBehavior": "Deferred", "PlayerCharacterDestroyBehavior": "Enabled"}},
}

# Deliberately wrong pieces for audit tests. Names start with "Fixture" so findings can be told apart.
FIXTURES = {
    "ReplicatedStorage": {"Fixtures": {"$path": "fixtures/replicated"}},
    "ReplicatedFirst": {"FixtureLoadingModule": {"$path": "fixtures/first/FixtureLoadingModule.luau"}},
    "ServerScriptService": {"FixtureSecondEntry": {"$path": "fixtures/FixtureSecondEntry.server.luau"}},
    "StarterPlayer": {"StarterPlayerScripts": {"FixtureTwiceProbe": {"$path": "fixtures/FixtureTwiceProbe.client.luau"}}},
    # ResetOnSpawn true (rebuilt at every respawn) and false-but-nested in a Folder (rebuilt anyway).
    "StarterGui": {"FixturePerLife": {"$path": "fixtures/gui/FixturePerLife.model.json"},
                   "FixtureScreens": {"$path": "fixtures/gui/FixtureScreens"}},
    "Workspace": {"FixtureDoor1": {"$path": "fixtures/FixtureDoor1"}, "FixtureDoor2": {"$path": "fixtures/FixtureDoor2"}},
}


def _copytree(src: Path, dst: Path, overwrite: bool) -> list[str]:
    written = []
    for f in sorted(src.rglob("*")):
        if f.is_dir():
            continue
        t = dst / f.relative_to(src)
        if t.exists() and not overwrite:
            continue
        t.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, t)
        written.append(str(t))
    return written


def update_sources(dest: str | Path, fixtures: bool = False, overwrite: bool = True) -> list[str]:
    """Copy the template sources (and Loader, Binder) into <dest> without building. Returns the files written.

    Use it before sync_sources when the place is open: rebuilding a .rbxl that Studio has open is avoided."""
    d = Path(dest).resolve()
    written = _copytree(TEMPLATE / "src", d / "src", overwrite)
    for mod in ("Loader.luau", "Binder.luau"):
        t = d / "src" / "shared" / mod
        if overwrite or not t.exists():
            t.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(KIT / mod, t)
            written.append(str(t))
    if fixtures:
        written += _copytree(TEMPLATE / "fixtures", d / "fixtures", overwrite)
    return written


def scaffold(dest: str | Path, name: str | None = None, fixtures: bool = False, overwrite: bool = False) -> Path:
    """Write the arena skeleton into `dest` and build the place. Existing files are kept unless overwrite."""
    d = Path(dest).resolve()
    name = name or d.name
    proj = d / "default.project.json"
    if proj.exists() and not overwrite:
        raise FileExistsError(f"{proj} exists: pass overwrite=True to regenerate it (src files are still kept)")
    update_sources(d, fixtures, overwrite)
    tree = json.loads(json.dumps(TREE))
    if fixtures:
        tree = rbx_env._merge(tree, FIXTURES)
    rbx_env.new_place(d, name=name, template="baseplate", src=tree)
    # rbx_env writes Rojo's default emitLegacyScripts (true): .client.luau would become a LocalScript.
    data = json.loads(proj.read_text())
    data["emitLegacyScripts"] = False
    proj.write_text(json.dumps(data, indent=2) + "\n")
    out = d / f"{name}.rbxl"
    r = subprocess.run(["rojo", "build", str(d), "-o", str(out)], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"rojo build failed: {r.stderr or r.stdout}")
    return out


def sourcemap(dest: str | Path) -> Path:
    d = Path(dest).resolve()
    out = d / "sourcemap.json"
    # Non-scripts too: without them the new solver does not know saved instances such as GameState or Maps.
    r = subprocess.run(["rojo", "sourcemap", "--absolute", "--include-non-scripts", str(d / "default.project.json"),
                        "-o", str(out)], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"rojo sourcemap failed: {r.stderr or r.stdout}")
    return out


SOLVERS = ("old", "new")


def typecheck(files: list[str | Path], sourcemap: str | Path | None = None,
              solvers: tuple[str, ...] = SOLVERS, timeout: int = 300) -> dict:
    """luau-lsp on each type solver. luau-lsp 1.70.1 runs the old solver unless --flag:LuauSolverV2=true;
    Studio runs nonstrict scripts on the new one and strict scripts per Workspace.UseNewLuauTypeSolver, so a
    file ships only when both are clean. Returns {ok, errors, warnings, old: {errors, warnings}, new: {...}}."""
    paths = [str(Path(f).resolve()) for f in files]
    out: dict = {"ok": True, "errors": [], "warnings": []}
    for solver in solvers:
        cmd = [rbx_check.luau_lsp(), "analyze", "--platform=roblox", f"--definitions:@roblox={rbx_check.definitions()}"]
        if solver == "new":
            cmd.insert(2, "--flag:LuauSolverV2=true")
        if sourcemap:
            cmd += ["--sourcemap", str(sourcemap)]
        r = subprocess.run(cmd + paths, capture_output=True, text=True, timeout=timeout)
        seen, rows = set(), []
        for x in rbx_check.analyzer_rows(r, paths):
            k = (x["file"], x["line"], x["col"], x["msg"])
            if k not in seen:  # a module's errors can be printed again for each file that requires it
                seen.add(k)
                rows.append(dict(x, solver=solver))
        errs = [x for x in rows if x["level"] == "error"]
        warns = [x for x in rows if x["level"] != "error"]
        out["errors"] += errs
        out["warnings"] += warns
        out[solver] = {"errors": len(errs), "warnings": len(warns)}
    out["ok"] = not out["errors"]
    return out


def check(dest: str | Path, extra: list[str | Path] | None = None) -> dict:
    """luau-lsp over every .luau under <dest>/src (and `extra` files), typed against the place tree, on both solvers."""
    d = Path(dest).resolve()
    files = [str(p) for p in sorted((d / "src").rglob("*.luau"))] + [str(p) for p in (extra or [])]
    return typecheck(files, sourcemap(d))


def _lune(script: Path, *args: str) -> dict:
    r = subprocess.run(["lune", "run", str(script), *args], capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(f"lune failed: {r.stderr[-2000:] or r.stdout[-2000:]}")
    return json.loads(r.stdout)


def audit_file(place: str | Path, area: str = "all") -> dict:
    return _lune(KIT / "lune_arch_audit.luau", str(Path(place).resolve()), area)


def place_facts(place: str | Path) -> dict:
    return _lune(KIT / "lune_place_facts.luau", str(Path(place).resolve()))


def kit_source(names: list[str] | tuple[str, ...] = ()) -> str:
    """This skill's AgentKit modules (ArchAudit, Loader, Binder) as Luau locals of the same name."""
    parts = []
    for n in names:
        src = (KIT / f"{n}.luau").read_text()
        parts.append(f"local {n} = (function()\n{src}\nend)()")
    return "\n".join(parts) + ("\n" if parts else "")


def run(studio, code: str, dm: str = "Edit", kit: list[str] | tuple[str, ...] = (),
        lead_kit: list[str] | tuple[str, ...] = (), timeout: float | None = None) -> dict:
    """rbx_run.run with this skill's kit inlined before `code`. Error line numbers then include the kit."""
    import rbx_run
    return rbx_run.run(studio, kit_source(kit) + code, dm=dm, timeout=timeout, kit=list(lead_kit))


BOOT_LUAU = '''
local entry = %s
if not entry then return { missing = true } end
local out = {}
for _, k in { "BootOk", "BootErrors", "BootLog", "BootMs", "BootCount", "RanAt", "GameLoaded", "HadCharacter" } do
	out[k] = entry:GetAttribute(k)
end
return out
'''


def boot_report(pt) -> dict:
    """Boot attributes of the server and client entry scripts (rbx_play.Playtest `pt`)."""
    server = pt.server(BOOT_LUAU % 'game:GetService("ServerScriptService"):FindFirstChild("Server") '
                                  'and game:GetService("ServerScriptService").Server:FindFirstChild("Main")')
    client = pt.client(BOOT_LUAU % 'game:GetService("ReplicatedStorage"):FindFirstChild("Client") '
                                  'and game:GetService("ReplicatedStorage").Client:FindFirstChild("Main")')
    return {"server": server, "client": client}


SYNC_LUAU = '''
local changed, missing, same = {}, {}, 0
for _, it in ITEMS do
	local inst: Instance? = game
	for _, n in it.path do
		inst = inst and inst:FindFirstChild(n)
	end
	if not inst or not inst:IsA("LuaSourceContainer") then
		table.insert(missing, table.concat(it.path, "."))
	elseif (inst :: any).Source ~= it.src then
		(inst :: any).Source = it.src
		table.insert(changed, inst:GetFullName())
	else
		same += 1
	end
end
return { changed = changed, missing = missing, same = same }
'''


def _long_string(text: str) -> str:
    level = 1
    while f"]{'=' * level}]" in text:
        level += 1
    eq = "=" * level
    return f"[{eq}[\n{text}]{eq}]"  # Luau drops a newline right after the opening bracket


def _script_nodes(node: dict, path: list[str]):
    for child in node.get("children", []):
        p = path + [child["name"]]
        luau = [f for f in child.get("filePaths", []) if f.endswith((".luau", ".lua"))]
        if child.get("className") in ("Script", "LocalScript", "ModuleScript") and luau:
            yield p, Path(luau[0])
        yield from _script_nodes(child, p)


def sync_sources(studio, dest: str | Path) -> dict:
    """Write every script source of <dest> (per its Rojo sourcemap) into the open place's Edit data model.

    Returns {changed, missing, same}. Nothing is saved: the place file on disk is rebuilt by scaffold."""
    import rbx_run
    tree = json.loads(sourcemap(dest).read_text())
    items = [f"{{ path = {{ {', '.join(json.dumps(n) for n in p)} }}, src = {_long_string(f.read_text())} }}"
             for p, f in _script_nodes(tree, [])]
    code = "local ITEMS = {\n" + ",\n".join(items) + "\n}\n" + SYNC_LUAU
    r = rbx_run.run(studio, code, dm="Edit", timeout=60)
    if not r["ok"]:
        raise RuntimeError(f"sync failed: {r['error']}")
    return r["result"]


def main(argv: list[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["scaffold", "audit", "facts"])
    ap.add_argument("path")
    ap.add_argument("--name")
    ap.add_argument("--fixtures", action="store_true")
    ap.add_argument("--overwrite", action="store_true")
    a = ap.parse_args(argv)
    if a.cmd == "scaffold":
        print(scaffold(a.path, a.name, a.fixtures, a.overwrite))
    elif a.cmd == "audit":
        print(json.dumps(audit_file(a.path), indent=1))
    else:
        print(json.dumps(place_facts(a.path), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
