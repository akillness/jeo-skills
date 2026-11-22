#!/usr/bin/env python3
"""Build and test pipeline for Roblox team projects: scaffold, lint, gate, ship check, CI files.

Runner side only. Studio is reached through the scenario-roblox-expert toolkit (rbx_mcp, rbx_run,
rbx_play, rbx_env); this module never opens Studio.

    scaffold(root, name)              write the team template (Rojo, Wally, Rokit, Selene, StyLua,
                                      luau-lsp, Lune tests, CI) and copy the TestKit modules
    lint_project(project_json, release=False)   Rojo project traps -> {ok, findings}
    lint_scriptsync(folder)           Script Sync folder traps -> {ok, findings}
    gate(root)                        wally, sourcemap, luau-lsp on the old and the new solver,
                                      selene, stylua, Lune tests, release build + ship check -> {ok, steps}
    merge_place(root, base, ...)      builders' base place + code build -> release place, ShipCheck
    ship_check(root, rbxl, require)   Lune ShipCheck on a built place -> report dict
    check_workflow(path)              YAML parse, structure and secret rules, actionlint -> {ok, findings}
    run_kit(studio, code, kit, dm)    rbx_run with the tooling AgentKit modules inlined as locals
    check_target(studio, ids)         before engine tests: one window bound, and it holds a test place

Tool lookup: PATH (rokit shims or Homebrew), overridable with RBX_WALLY, RBX_ACTIONLINT.
CLI: rbx_tooling.py scaffold|lint|lint-sync|gate|ship|workflow|merge <path> [--json]
     rbx_tooling.py merge <repo> [--manifest places.json | --base assets/start.rbxl --out build/start.rbxl]
"""
from __future__ import annotations

import fnmatch
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

__version__ = "0.1.0"

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "template"
KIT = HERE / "agentkit" / "tooling"
LEAD = HERE.parents[1] / "scenario-roblox-expert" / "scripts"
sys.path.insert(0, str(LEAD))

SERVICES = {"Workspace", "Players", "Lighting", "MaterialService", "ReplicatedFirst", "ReplicatedStorage",
            "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Teams",
            "SoundService", "TextChatService", "LocalizationService", "TestService", "Chat", "HttpService"}
# Rojo 7.7.1 infers these classes from the key only under this parent (tested); elsewhere a Folder.
KEY_CLASS_PARENT = {"StarterPlayerScripts": "StarterPlayer", "StarterCharacterScripts": "StarterPlayer",
                    "Terrain": "Workspace"}
STARTERS = {"StarterPlayer", "StarterGui", "StarterPack", "StarterPlayerScripts", "StarterCharacterScripts"}
SCRIPT_RE = re.compile(r"\.(lua|luau)$")
SYNC_ONLY = (".local.luau", ".legacy.luau", ".local.lua", ".legacy.lua")
ROJO_INIT = re.compile(r"^init(\.server|\.client)?\.luau?$")
SYNC_INIT = re.compile(r"^init(\.(server|client|local|legacy|plugin))?\.luau?$")
SYNC_SUFFIX = re.compile(r"(\.(server|client|local|legacy|plugin))?\.luau?$")
VENDORED = {"Packages", "DevPackages", "ServerPackages"}
# Not serialized: Rojo 7.7.1 builds them with exit 0 and the part keeps the default CFrame.
DERIVED = ("Position", "Orientation", "Rotation")


# Built into place files, but not applied by `rojo serve` (Rojo sync details, Limitations).
NO_LIVE_SYNC = ("MeshId", "HttpEnabled")


def _derived(props: dict | None, where: str) -> list[dict]:
    if not isinstance(props, dict):
        return []
    out = [_finding("error", "derived-property", where,
                    f"Rojo drops {k} silently; set CFrame instead: [x, y, z, 1, 0, 0, 0, 1, 0, 0, 0, 1] "
                    "(rotation matrix rows after the position)")
           for k in DERIVED if k in props]
    out += [_finding("info", "no-live-sync", where,
                     f"{k} reaches Studio only through a build: after changing it, rebuild and reopen the place "
                     "(rojo serve does not apply it)")
            for k in NO_LIVE_SYNC if k in props]
    return out


def _model_json(node: dict, where: str) -> list[dict]:
    out = _derived(node.get("properties") or node.get("Properties"), where)
    for child in node.get("children") or node.get("Children") or []:
        if isinstance(child, dict):
            out += _model_json(child, f"{where}.{child.get('name') or child.get('Name') or '?'}")
    return out
ILLEGAL = re.compile(r'[\\:*?"<>|]')


def _tool(name: str, env: str | None = None) -> str | None:
    return (os.environ.get(env) if env else None) or shutil.which(name)


def _finding(severity: str, rule: str, path: str, message: str) -> dict:
    return {"severity": severity, "rule": rule, "path": path, "message": message}


def _ok(findings: list[dict]) -> bool:
    return not any(f["severity"] == "error" for f in findings)


# ---------------------------------------------------------------- scaffold

def scaffold(root: str | Path, name: str, force: bool = False) -> Path:
    """Copy the template into root, set the project name, copy Spec, TestRunner and ShipCheck."""
    root = Path(root).resolve()
    if root.exists() and any(root.iterdir()) and not force:
        raise FileExistsError(f"{root} is not empty (pass force=True to overwrite template files)")
    for src in TEMPLATE.rglob("*"):
        if src.is_dir():
            continue
        dst = root / src.relative_to(TEMPLATE)
        dst.parent.mkdir(parents=True, exist_ok=True)
        text = src.read_text()
        dst.write_text(text.replace("__NAME__", name))
    kit = root / "tools" / "testkit"
    kit.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(LEAD / "agentkit" / "Spec.luau", kit / "Spec.luau")
    for mod in ("TestRunner", "ShipCheck"):
        shutil.copyfile(KIT / f"{mod}.luau", kit / f"{mod}.luau")
    return root


# ---------------------------------------------------------------- Rojo project lint

def _node_paths(node: dict, key: str, trail: list[str]):
    yield key, node, trail
    for k, v in node.items():
        if not k.startswith("$") and isinstance(v, dict):
            yield from _node_paths(v, k, trail + [key])


def _ignored(rel: str, globs: list[str]) -> bool:
    return any(fnmatch.fnmatch(rel, g) or fnmatch.fnmatch(rel, g.replace("**/", "")) for g in globs)


def lint_project(project_json: str | Path, release: bool = False) -> dict:
    """Static checks of a *.project.json and the files it maps. release=True: test files must be ignored."""
    pj = Path(project_json).resolve()
    base = pj.parent
    findings: list[dict] = []
    try:
        proj = json.loads(pj.read_text())
    except (OSError, json.JSONDecodeError) as e:
        return {"ok": False, "findings": [_finding("error", "bad-json", str(pj), str(e))]}
    if "name" not in proj or "tree" not in proj:
        findings.append(_finding("error", "missing-field", str(pj), "a project needs name and tree"))
        return {"ok": False, "findings": findings}
    legacy = proj.get("emitLegacyScripts", True)
    globs = proj.get("globIgnorePaths", [])
    if "servePlaceIds" not in proj:
        findings.append(_finding("info", "serve-place-ids", pj.name,
                                 "set servePlaceIds once the place is published, so `rojo serve` cannot sync into another place"))
    mapped_packages = False
    for key, node, trail in _node_paths(proj["tree"], "DataModel", []):
        where = ".".join(trail[1:] + [key]) if trail else key
        findings += _derived(node.get("$properties"), where)
        parent = trail[-1] if trail else None
        home = "DataModel" if key in SERVICES else KEY_CLASS_PARENT.get(key)
        if home and parent and parent != home and "$className" not in node:
            findings.append(_finding("warn", "key-class", where,
                                     f"Rojo builds '{key}' as a Folder here: it infers the {key} class only "
                                     f"directly under {home}; rename the key or set $className"))
        raw = node.get("$path")
        if raw is None:
            continue
        optional = isinstance(raw, dict)
        rel = raw.get("optional") if optional else raw
        target = base / rel
        if key == "Packages":
            mapped_packages = True
        if not target.exists():
            if not optional:
                findings.append(_finding("error", "missing-path", where, f"$path {rel} does not exist"))
            continue
        if key in SERVICES and len(trail) == 1 and node.get("$ignoreUnknownInstances") is not True:
            findings.append(_finding("warn", "service-path", where,
                                     "$path on a service: live sync deletes Studio-only children (RemoteEvents, parts) "
                                     "unless $ignoreUnknownInstances is true; map code into a child folder instead"))
        in_starter = any(t in STARTERS for t in trail + [key])
        vendored = key in VENDORED  # third-party code: only the release rule applies
        files = [target] if target.is_file() else [p for p in target.rglob("*") if p.is_file()]
        for f in files:
            frel = str(f.relative_to(base))
            if _ignored(frel, globs):
                continue
            n = f.name
            if vendored:
                if release and re.search(r"\.(spec|test)\.luau?$", n):
                    findings.append(_finding("error", "test-in-release", frel, "package test file ships: "
                                             "add Packages/**/*.spec.luau and *.test.luau to globIgnorePaths"))
                continue
            if n.endswith(SYNC_ONLY):
                findings.append(_finding("error", "sync-suffix", frel,
                                         "Rojo does not map this Script Sync suffix: it builds a ModuleScript named "
                                         f"'{n.rsplit('.', 1)[0]}'"))
            if n.endswith((".client.luau", ".client.lua")):
                if not legacy and in_starter:
                    findings.append(_finding("warn", "starter-runcontext", frel,
                                             "emitLegacyScripts false builds a RunContext Client Script inside a "
                                             "Starter container; docs say Starter containers hold LocalScripts"))
                if legacy and not in_starter and "ReplicatedFirst" not in trail + [key]:
                    findings.append(_finding("warn", "dead-localscript", frel,
                                             "default emitLegacyScripts builds a LocalScript here, where it never runs; "
                                             "set emitLegacyScripts false or move it to StarterPlayerScripts"))
            if n.endswith(".meta.json"):
                try:
                    findings += _derived(json.loads(f.read_text()).get("properties"), frel)
                except json.JSONDecodeError as e:
                    findings.append(_finding("error", "bad-meta", frel, f"invalid JSON breaks rojo build: {e}"))
            if n.endswith(".model.json"):
                try:
                    findings += _model_json(json.loads(f.read_text()), frel)
                except json.JSONDecodeError as e:
                    findings.append(_finding("error", "bad-model", frel, f"invalid JSON breaks rojo build: {e}"))
            if release and re.search(r"\.(spec|test)\.luau?$", n):
                findings.append(_finding("error", "test-in-release", frel, "test file not excluded by globIgnorePaths"))
        dirs = [] if vendored or not target.is_dir() else [target] + [p for p in target.rglob("*") if p.is_dir()]
        for d in dirs:
            inits = [p.name for p in d.iterdir() if p.is_file() and ROJO_INIT.match(p.name)
                     and not _ignored(str(p.relative_to(base)), globs)]
            if len(inits) > 1:
                findings.append(_finding("error", "two-inits", str(d.relative_to(base)),
                                         f"{inits}: Rojo builds one and drops the others with no error"))
    if (base / "wally.toml").exists() and not mapped_packages:
        findings.append(_finding("error", "packages-unmapped", pj.name,
                                 "wally.toml exists but no tree node maps Packages: packages never reach Studio"))
    return {"ok": _ok(findings), "findings": findings}


# ---------------------------------------------------------------- Script Sync folder lint

def lint_scriptsync(folder: str | Path) -> dict:
    """Checks a folder linked with Script Sync (one root). Mirrors SyncCheck.luau on the disk side."""
    root = Path(folder).resolve()
    findings: list[dict] = []
    scripts = 0
    for d in [root] + [p for p in root.rglob("*") if p.is_dir()]:
        stems: dict[str, str] = {}
        inits = []
        for p in sorted(d.iterdir()):
            rel = str(p.relative_to(root))
            if p.name.startswith("."):
                continue
            if ILLEGAL.search(p.name):
                findings.append(_finding("error", "bad-name", rel, "character invalid in a file name"))
            if p.is_file() and not SCRIPT_RE.search(p.name):
                findings.append(_finding("info", "not-synced", rel, "Script Sync syncs scripts and folders only"))
                continue
            if p.is_file():
                scripts += 1
                if SYNC_INIT.match(p.name):
                    inits.append(p.name)
                    continue
            inst = SYNC_SUFFIX.sub("", p.name) if p.is_file() else p.name
            if inst.lower() in stems:
                findings.append(_finding("error", "duplicate-name", rel,
                                         f"same instance name as {stems[inst.lower()]} (case-insensitive file system): "
                                         f"use {inst}/init.<suffix>.luau"))
            stems[inst.lower()] = rel
        if len(inits) > 1:
            findings.append(_finding("error", "two-inits", str(d.relative_to(root)), str(inits)))
    if scripts > 10000:
        findings.append(_finding("error", "too-many-scripts", str(root), f"{scripts} scripts, limit 10,000 per root"))
    return {"ok": _ok(findings), "findings": findings, "scripts": scripts}


# ---------------------------------------------------------------- gate

def _step(name: str, cmd: list[str], cwd: Path, timeout: int = 600) -> dict:
    t0 = time.time()
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        code, out = r.returncode, (r.stdout + r.stderr)
    except FileNotFoundError as e:
        code, out = 127, str(e)
    except subprocess.TimeoutExpired:
        code, out = 124, "timeout"
    return {"name": name, "cmd": " ".join(cmd), "exit": code, "seconds": round(time.time() - t0, 2),
            "tail": out.strip()[-1500:]}


def gate(root: str | Path, release_require: tuple[str, ...] = ("ReplicatedStorage.Packages",)) -> dict:
    """Run the full local gate in CI order. ok only when every step exits 0."""
    from rbx_check import definitions  # lead toolkit: cached Roblox definitions for luau-lsp

    root = Path(root).resolve()
    steps = []
    wally = _tool("wally", "RBX_WALLY")
    if (root / "wally.toml").exists():
        if wally:
            steps.append(_step("wally install", [wally, "install"], root))
        elif not (root / "Packages").exists():
            steps.append({"name": "wally install", "cmd": "wally install", "exit": 127, "seconds": 0,
                          "tail": "wally not found (rokit install, or RBX_WALLY=<path>)"})
    # --include-non-scripts: without it the sourcemap lists scripts only, and the new solver reports
    # "Key 'Remotes' not found" on every path through a RemoteEvent or Folder built from a model file.
    steps.append(_step("sourcemap", ["rojo", "sourcemap", "default.project.json", "-o", "sourcemap.json",
                                     "--include-non-scripts"], root))
    # luau-lsp analyze runs the old solver unless LuauSolverV2 is set; Studio runs the new one for
    # nonstrict and nocheck scripts and either one for strict scripts (UseNewLuauTypeSolver).
    lsp = ["luau-lsp", "analyze", "--platform=roblox", f"--definitions:@roblox={definitions()}",
           "--sourcemap", "sourcemap.json", "--ignore", "**/Packages/**"]
    steps.append(_step("luau-lsp old solver", [*lsp, "src", "tools/testkit"], root))
    steps.append(_step("luau-lsp new solver", [*lsp, "--flag:LuauSolverV2=true", "src", "tools/testkit"], root))
    steps.append(_step("selene", ["selene", "src", "tools"], root))
    steps.append(_step("stylua", ["stylua", "--check", "src", "tools"], root))
    steps.append(_step("lune tests", ["lune", "run", "tools/test", "src"], root))
    (root / "build").mkdir(exist_ok=True)
    steps.append(_step("ship build", ["rojo", "build", "ship.project.json", "-o", "build/ship.rbxl"], root))
    req: list[str] = []
    for p in release_require:
        req += ["--require", p]
    steps.append(_step("ship check", ["lune", "run", "tools/ship_check", "build/ship.rbxl", *req], root))
    return {"ok": all(s["exit"] == 0 for s in steps), "steps": steps}


def merge_place(root: str | Path, base: str | None = None, code: str = "build/ship.rbxl",
                out: str = "build/release.rbxl", project: str = "ship.project.json",
                manifest: str | None = None, live_versions: str | None = None) -> dict:
    """Builders' base place + the Rojo code build -> the place that ships (tools/merge_place.luau).

    Returns {exit, places: [report per place]}. exit 2: the base holds content the publish API does
    not update, so a person publishes the merged file from Studio. live_versions: JSON from
    tools/place_versions; a base older than its build place's newest version is refused (exit 1).
    A root that scaffold() did not create runs the template's script, with its ShipCheck, from a
    temporary folder; paths still resolve against root."""
    root = Path(root).resolve()
    if manifest:
        args = ["--manifest", manifest] + (["--live-versions", live_versions] if live_versions else [])
    else:
        args = ["--code", code, "--out", out, "--project", project] + (["--base", base] if base else [])
    with tempfile.TemporaryDirectory() as tmp:
        script = "tools/merge_place"
        if not (root / "tools" / "merge_place.luau").exists():
            kit = Path(tmp) / "tools" / "testkit"
            kit.mkdir(parents=True)
            shutil.copyfile(KIT / "ShipCheck.luau", kit / "ShipCheck.luau")
            script = str(shutil.copyfile(TEMPLATE / "tools" / "merge_place.luau", kit.parent / "merge_place.luau"))
        r = subprocess.run(["lune", "run", script, *args], cwd=root, capture_output=True, text=True, timeout=600)
    places = [json.loads(ln) for ln in r.stdout.splitlines() if ln.startswith("{")]
    return {"exit": r.returncode, "places": places, "stderr": r.stderr[-2000:],
            "messages": [ln for ln in r.stdout.splitlines() if ln and not ln.startswith("{")]}


def check_target(studio, allowed_place_ids: tuple[int, ...] = (0,), timeout: float = 30) -> dict:
    """Before engine tests through MCP: the session is bound to one Studio window, and that window holds
    a test place. studio is the lead's rbx_mcp.Studio (rbx_env.open_place returns one).

    Lists windows with list_roblox_studios (studio.studios()), binds (studio.bind(), which fills
    studio_id on every later call), refuses when two windows carry the wanted name, then reads
    game.PlaceId in Edit: 0 for a local file that was never published, or an allowed test place id."""
    import rbx_run
    rows = studio.studios()
    out = {"ok": False, "studios": rows, "bound": None, "placeId": None, "reason": None}
    try:
        out["bound"] = studio.bind()
    except Exception as e:  # rbx_mcp.MCPError: no Studio, or no window with that name
        out["reason"] = f"bind failed: {e}"
        return out
    want = str(getattr(studio, "want", "") or "").lower()
    stem = want.rsplit(".", 1)[0] if want.endswith((".rbxl", ".rbxlx")) else want
    same = [r for r in rows if want and any(str(v).lower() in (want, stem) for v in r.values())]
    if len(same) > 1:
        out["reason"] = (f"{len(same)} Studio windows are named {want!r}: tell them apart by place id or "
                         "studio id, or ask the user which one to use")
        return out
    r = rbx_run.run(studio, "return {placeId = game.PlaceId}", dm="Edit", timeout=timeout)
    if not r.get("ok"):
        out["reason"] = f"could not read game.PlaceId: {r.get('error')}"
        return out
    out["placeId"] = (r.get("result") or {}).get("placeId")
    if out["placeId"] not in allowed_place_ids:
        out["reason"] = (f"window {out['bound']} holds place {out['placeId']}, not a test place "
                         f"{list(allowed_place_ids)}: stop before any engine test")
        return out
    out["ok"] = True
    return out


def build(root: str | Path, project: str, out: str) -> dict:
    return _step(f"build {project}", ["rojo", "build", project, "-o", out], Path(root).resolve())


def ship_check(root: str | Path, rbxl: str, require: tuple[str, ...] = ()) -> dict:
    args: list[str] = []
    for p in require:
        args += ["--require", p]
    s = _step("ship check", ["lune", "run", "tools/ship_check", rbxl, *args], Path(root).resolve())
    start = s["tail"].find("{")
    report = json.loads(s["tail"][start:]) if start >= 0 else {"ok": False, "findings": [], "error": s["tail"]}
    report["exit"] = s["exit"]
    return report


# ---------------------------------------------------------------- workflow check

def _load_yaml(path: Path):
    try:
        import yaml  # type: ignore
        return yaml.safe_load(path.read_text())
    except ImportError:
        ruby = shutil.which("ruby")
        if not ruby:
            raise RuntimeError("no YAML parser: install PyYAML or provide ruby")
        r = subprocess.run([ruby, "-ryaml", "-rjson", "-e", "puts JSON.dump(YAML.safe_load(STDIN.read))"],
                           input=path.read_text(), capture_output=True, text=True)
        if r.returncode != 0:
            raise ValueError(r.stderr.strip())
        return json.loads(r.stdout)


def check_workflow(path: str | Path) -> dict:
    """Parse a GitHub Actions workflow and apply the pipeline rules. Runs actionlint when available."""
    p = Path(path)
    findings: list[dict] = []
    try:
        wf = _load_yaml(p)
    except Exception as e:  # parse errors are the finding
        return {"ok": False, "findings": [_finding("error", "yaml", str(p), str(e))], "actionlint": None}
    # YAML 1.1 parsers (PyYAML, Ruby) read the key `on` as the boolean true.
    triggers = wf.get("on") or wf.get(True) or wf.get("true")
    if not triggers:
        findings.append(_finding("error", "no-trigger", p.name, "no `on:` triggers"))
    if "pull_request_target" in (triggers or {}):
        findings.append(_finding("warn", "pr-target", p.name, "pull_request_target runs fork code with secrets"))
    if "permissions" not in wf:
        findings.append(_finding("warn", "permissions", p.name, "set top-level permissions (contents: read)"))
    jobs = wf.get("jobs") or {}
    if not jobs:
        findings.append(_finding("error", "no-jobs", p.name, "no jobs"))
    pr = isinstance(triggers, dict) and "pull_request" in triggers
    for jname, job in jobs.items():
        if "runs-on" not in job:
            findings.append(_finding("error", "runs-on", jname, "job has no runs-on"))
        uses_secrets = False
        for i, step in enumerate(job.get("steps") or []):
            where = f"{jname}.steps[{i}]"
            uses = step.get("uses")
            if uses and "@" not in uses:
                findings.append(_finding("error", "unpinned-action", where, f"{uses} has no version"))
            elif uses and uses.split("@", 1)[1] in ("main", "master", "latest"):
                findings.append(_finding("warn", "branch-action", where, f"{uses} follows a branch"))
            run = step.get("run") or ""
            if "${{ secrets." in run:
                findings.append(_finding("error", "secret-in-run", where,
                                         "pass secrets through env:, never inline in run (logs, shell injection)"))
            if "secrets." in json.dumps(step):
                uses_secrets = True
            if re.search(r"versionType=Published|--published|restart_servers|:restartServers", run) \
                    and job.get("environment") is None:
                findings.append(_finding("error", "unguarded-publish", where,
                                         "live publish or server restart outside a protected environment"))
        cond = str(job.get("if", ""))
        if pr and uses_secrets and "head.repo.full_name" not in cond and "event_name" not in cond:
            findings.append(_finding("warn", "fork-secrets", jname, "fork pull requests get no secrets: guard the job"))
    lint = _tool("actionlint", "RBX_ACTIONLINT")
    al = None
    if lint:
        r = subprocess.run([lint, "-no-color", str(p)], capture_output=True, text=True)
        al = {"exit": r.returncode, "output": (r.stdout + r.stderr).strip()[-2000:]}
        if r.returncode != 0:
            findings.append(_finding("error", "actionlint", p.name, al["output"][:500]))
    return {"ok": _ok(findings), "findings": findings, "actionlint": al}


# ---------------------------------------------------------------- Studio side (through the lead toolkit)

def kit_source(names: list[str] | tuple[str, ...]) -> str:
    parts = []
    for n in names:
        src = (KIT / f"{n}.luau").read_text()
        parts.append(f"local {n} = (function()\n{src}\nend)()")
    return "\n".join(parts)


def run_kit(studio, code: str, kit: list[str] | tuple[str, ...] = (), dm: str = "Edit",
            lead_kit: list[str] | tuple[str, ...] = (), timeout: float | None = None) -> dict:
    """rbx_run.run with TestRunner, ShipCheck or SyncCheck inlined as locals; error lines stay those of `code`."""
    from rbx_run import run

    head = kit_source(kit)
    shift = head.count("\n") + 1 if head else 0
    r = run(studio, (head + "\n" + code) if head else code, dm=dm, timeout=timeout, kit=lead_kit)
    if shift and r.get("error"):
        r["error"] = re.sub(r":(\d+)(?=[:\s]|$)", lambda m: f":{max(1, int(m[1]) - shift)}", r["error"])
    return r


def main(argv: list[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["scaffold", "lint", "lint-sync", "gate", "ship", "workflow", "merge"])
    ap.add_argument("path")
    ap.add_argument("--name")
    ap.add_argument("--release", action="store_true")
    ap.add_argument("--force", action="store_true", help="scaffold into a non-empty folder")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--base", help="merge: the builders' base place")
    ap.add_argument("--out", default="build/release.rbxl", help="merge: the place that ships")
    ap.add_argument("--manifest", help="merge: places.json with a base per place")
    ap.add_argument("--live-versions", help="merge: newest build-place versions from tools/place_versions")
    a = ap.parse_args(argv)
    if a.cmd == "scaffold":
        r: dict = {"root": str(scaffold(a.path, a.name or Path(a.path).name, a.force)), "ok": True}
    elif a.cmd == "lint":
        r = lint_project(a.path, a.release)
    elif a.cmd == "lint-sync":
        r = lint_scriptsync(a.path)
    elif a.cmd == "gate":
        r = gate(a.path)
    elif a.cmd == "merge":
        m = merge_place(a.path, base=a.base, out=a.out, manifest=a.manifest, live_versions=a.live_versions)
        r = {"ok": m["exit"] == 0, "exit": m["exit"], "places": m["places"],
             "findings": [{"severity": "error" if m["exit"] == 1 else "warn", "rule": "merge", "path": a.path,
                           "message": msg} for msg in m["messages"]]
             + [{"severity": "error", "rule": "merge", "path": a.path, "message": e}
                for p in m["places"] for e in p.get("errors", [])]}
    elif a.cmd == "ship":
        r = ship_check(Path(a.path).parent.parent, str(Path(a.path).resolve()))
    else:
        r = check_workflow(a.path)
    if a.json:
        print(json.dumps(r, indent=1))
    else:
        for s in r.get("steps", []):
            print(f"{'PASS' if s['exit'] == 0 else 'FAIL'} {s['name']} ({s['seconds']} s)")
        for f in r.get("findings", []):
            print(f"{f['severity'].upper():5} {f['rule']}: {f['path']}: {f['message']}")
        print("ok" if r.get("ok") else "FAILED")
    if a.cmd == "merge":
        return r["exit"]  # 2: publish from Studio
    return 0 if r.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
