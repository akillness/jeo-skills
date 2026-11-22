#!/usr/bin/env python3
"""gd_architecture: runner-side tools of the scenario-godot-architecture skill (Godot 4.7.2, system python3).

Builds on the scenario-godot-expert toolkit (gd_env, gd_run, gd_stat); never reimplements it.

    install_kit(project)                       copy scripts/agentkit/architecture -> res://addons/agentkit/architecture
    install_core(project, parts=None)          copy the tested G1 core (scripts/templates/core) -> res://core
    scaffold_folders(project, layout="layered")  folder skeleton (+ empty .gdignore in docs/ and raw/)
    build_main_scene(project, path=..., dim="3d", script=..., set_main=True)
    setup_input(project, source=...)           InputMap from one table into project.godot, then audit
    register_autoload(project, name, path)     [autoload] entry, written by text (no ProjectSettings rewrite)
    build_catalog(project, ...)                registry .tres from a data folder (edit time)
    validate_resources(project, root, cls, id_property, required)
    audit_scenes(project, root="res://", exclude=("res://addons/",))
    typing_gate(project, dest=None, warnings=DEFAULT_WARNINGS)   clone + warnings as errors + check_all
    lint(project)                              offline text rules (no Godot), list of findings
    bench_typing(project, n=2000, reps=5)
    pack_smoke(project, out_dir, probe_args)   export a .pck and run a probe inside it (--main-pack)
    unique_user_dir(project, name)             give a clone its own user:// (clones of a base share one)
"""
from __future__ import annotations

__version__ = "0.1"

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT_SRC = HERE / "agentkit" / "architecture"
CORE_SRC = HERE / "templates" / "core"
_lead = Path(os.environ.get("GODOT_EXPERT_SCRIPTS", HERE.parents[1] / "scenario-godot-expert" / "scripts"))
for p in (str(_lead), str(Path.home() / ".claude" / "skills" / "scenario-godot-expert" / "scripts")):
    if p not in sys.path and Path(p).exists():
        sys.path.insert(0, p)
import gd_env  # noqa: E402
import gd_run  # noqa: E402
import gd_stat  # noqa: E402

KIT = "res://addons/agentkit/architecture"
# unsafe_call_argument is left out on purpose: it fires on every int(dict.get(...)) that reads
# JSON or save data (15 hits on the tested core, 2026-10-02). Add it for pure gameplay code.
DEFAULT_WARNINGS = ("untyped_declaration", "unsafe_property_access", "unsafe_method_access", "unsafe_cast")
STRICT_WARNINGS = DEFAULT_WARNINGS + ("unsafe_call_argument",)
WARNING_PATTERNS = {
    "untyped_declaration": ("has no static type",),
    "unsafe_method_access": ("is not present on the inferred type",),
    "unsafe_property_access": ("property \"", "not present on the inferred type"),
    "unsafe_cast": ("Casting a \"Variant\"",),
    "unsafe_call_argument": ("requires the subtype",),
    "inference_on_variant": ("inferred from a Variant",),
}
LAYOUTS = {
    # FAT Earth Studios, V4SO7foDoW4 [00:03:00]: raw assets apart from source, then by role.
    "layered": ["assets/art", "assets/audio", "assets/fonts", "core/main", "core/events", "data/items",
                "gameplay/components", "levels", "shaders", "ui", "debug", "test", "tools"],
    # DevDuck, 4az0VX9ApcA [00:03:13]: feature first, asset type last.
    "feature": ["assets", "common", "config", "entities/player", "localization", "stages", "utilities", "test", "tools"],
}
IGNORED_DIRS = ["docs", "raw"]  # empty .gdignore: never imported, never loadable


# ---------------------------------------------------------------- install

def install_kit(project) -> Path:
    dest = Path(project) / "addons" / "agentkit" / "architecture"
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted(KIT_SRC.glob("*.gd")):
        shutil.copy2(f, dest / f.name)
    return dest


def install_core(project, parts=None, dest="core") -> list[str]:
    """Copy the G1 core templates (events, data, inventory, combat, save, input, main). Never overwrites."""
    out = []
    root = Path(project) / dest
    for f in sorted(CORE_SRC.rglob("*.gd")):
        rel = f.relative_to(CORE_SRC)
        if parts and rel.parts[0] not in parts:
            continue
        t = root / rel
        if t.exists():
            continue
        t.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, t)
        out.append(str(t))
    return out


def unique_user_dir(project, name: str) -> None:
    """Every clone of Base3D is named "Base3D", so all of them share one user:// folder (observed):
    give the clone its own name before any save or settings test."""
    gd_env.set_project_setting(project, "application/config/name", json.dumps(name))


def register_autoload(project, name: str, path: str) -> None:
    gd_env.set_project_setting(project, f"autoload/{name}", json.dumps("*" + path))


# ---------------------------------------------------------------- jobs

def _call(project, module_method: str, args=None, timeout=300, **kw) -> dict:
    if not (Path(project) / "addons" / "agentkit" / "architecture").exists():
        install_kit(project)
    return gd_run.run_script(project, f"{KIT}/{module_method}", args=args or {}, timeout=timeout, **kw)


def scaffold_folders(project, layout: str = "layered") -> list[str]:
    p = Path(project)
    made = []
    for d in LAYOUTS[layout] + IGNORED_DIRS:
        (p / d).mkdir(parents=True, exist_ok=True)
        made.append(d)
    for d in IGNORED_DIRS:
        g = p / d / ".gdignore"
        if not g.exists():
            g.write_text("")  # must stay empty: no patterns are read (Godot docs, Project organization)
    return made


def build_main_scene(project, path="res://core/main/main.tscn", dim="3d", script="res://core/main/main_game.gd",
                     set_main=True, overwrite=False, props=None) -> dict:
    return _call(project, "scaffold.gd:main_scene", {"path": path, "dim": dim, "script": script,
                 "set_main": set_main, "overwrite": overwrite, "props": props or {}})


def setup_input(project, source="res://core/input/input_actions.gd", remove_unlisted=False) -> dict:
    r = _call(project, "setup_input.gd:apply", {"source": source, "remove_unlisted": remove_unlisted})
    r["audit"] = gd_run.audit(project, "project").get("result")
    return r


def build_catalog(project, root="res://data/items", out="res://data/item_catalog.tres",
                  catalog_script="res://core/data/item_catalog.gd", item_class="ItemDefinition",
                  list_property="items", id_property="id") -> dict:
    return _call(project, "build_catalog.gd:build", dict(root=root, out=out, catalog_script=catalog_script,
                 item_class=item_class, list_property=list_property, id_property=id_property))


def validate_resources(project, root="res://data", cls="", id_property="id", required=()) -> dict:
    return _call(project, "validate_data.gd:resources",
                 {"root": root, "class": cls, "id_property": id_property, "required": list(required)})


def audit_scenes(project, root="res://", exclude=("res://addons/",)) -> dict:
    return _call(project, "arch_audit.gd:scenes", {"root": root, "exclude": list(exclude)}, timeout=600)


def bench_typing(project, n=2000, reps=5, sort_n=200000) -> dict:
    return _call(project, "bench.gd:typing", {"n": n, "reps": reps, "sort_n": sort_n}, timeout=600)


# ---------------------------------------------------------------- typing gate

def typing_gate(project, dest=None, warnings=DEFAULT_WARNINGS, level: int = 2) -> dict:
    """Clone the project (gd_env.clone_tree), set each warning to Error in the clone, compile every script.

    Warnings at level 1 (warn) are not printed in a headless run (verified 4.7.2), so the gate
    needs level 2. The original project.godot is never touched. Addons are excluded by the
    engine default debug/gdscript/warnings/exclude_addons=true.
    """
    src = Path(project).resolve()
    if dest is None:
        dest = Path(tempfile.mkdtemp(prefix="gd_typing_gate_")) / src.name
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    gd_env.clone_tree(src, dest)
    for w in warnings:
        gd_env.set_project_setting(dest, f"debug/gdscript/warnings/{w}", str(level))
    r = gd_run.check_all(dest)
    by_rule: dict[str, int] = {}
    by_file: dict[str, int] = {}
    for e in r["parse_errors"]:
        if "(Warning treated as error.)" not in e["message"]:
            continue
        rule = next((k for k, pats in WARNING_PATTERNS.items() if all(s in e["message"] for s in pats)), "other")
        by_rule[rule] = by_rule.get(rule, 0) + 1
        by_file[e["file"]] = by_file.get(e["file"], 0) + 1
    total = sum(by_rule.values())
    real = [e for e in r["parse_errors"] if "(Warning treated as error.)" not in e["message"]]
    return {"ok": total == 0 and not real, "warnings_as_errors": total, "by_rule": by_rule, "by_file": by_file,
            "other_parse_errors": real[:20], "files_checked": r.get("files_checked"), "clone": str(dest),
            "log_path": r.get("log_path")}


# ---------------------------------------------------------------- exported pack smoke test

def pack_smoke(project, out_dir, probe_args: dict, preset="arch_pack", timeout=300) -> dict:
    """Export a .pck (no templates needed) and run pack_probe.gd:listing INSIDE it with --main-pack.

    This is the "test an exported build" step (Godotneers, 4vAkTHeoORk [01:15:17]): the pack has
    converted resources and .remap entries, and is case-sensitive.
    """
    project = Path(project).resolve()
    out_dir = Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    install_kit(project)
    gd_run.ensure_preset(project, preset, "Linux")
    pck = out_dir / "game.pck"
    ex = gd_run.export(project, preset, pck, pack=True)
    if not ex["ok"]:
        return {"ok": False, "error": "export failed: " + ex["error"], "export": ex}
    res_file = out_dir / f"probe_{uuid.uuid4().hex[:6]}.json"
    cmd = [gd_env.find_godot(), "--headless", "--main-pack", str(pck), "--script", "res://addons/agentkit/agent_job.gd",
           "--", "--agent-result", str(res_file), "--agent-timeout", str(timeout - 10),
           "--agent-args", json.dumps(probe_args), "--agent-call", f"{KIT}/pack_probe.gd:listing"]
    t0 = time.time()
    with gd_run.godot_slot(out_dir):
        p = subprocess.run(cmd, cwd=str(out_dir), stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout)
    log = (p.stdout or "") + (p.stderr or "")
    (out_dir / "pack_smoke.log").write_text("# " + " ".join(cmd) + "\n" + log)
    parsed = gd_stat.parse_godot_log(log)
    result = json.loads(res_file.read_text()) if res_file.exists() else parsed["agent_result"]
    return {"ok": bool(result and result.get("ok")), "result": result, "pck": str(pck), "pck_bytes": pck.stat().st_size,
            "exit_code": p.returncode, "duration_s": round(time.time() - t0, 2), "warnings": parsed["warnings"][:10],
            "engine_errors": parsed["engine_errors"][:10], "log_path": str(out_dir / "pack_smoke.log")}


# ---------------------------------------------------------------- offline lint

_SKIP_DIRS = {".godot", ".agent_out", "addons", ".git"}
_RES_LITERAL = re.compile(r'"(res://[^"\n:*?<>|]+)"')
_SNAKE = re.compile(r"^[a-z0-9_]+(\.[a-z0-9_]+)*$")


def _files(root: Path, exts):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS and not (Path(dirpath) / d / ".gdignore").exists()]
        for f in filenames:
            if f.rsplit(".", 1)[-1] in exts:
                yield Path(dirpath) / f


def _exact_case(root: Path, rel: str) -> str:
    """'ok', 'case' (exists only with another case) or 'missing'."""
    cur = root
    for part in [x for x in rel.split("/") if x]:
        try:
            names = os.listdir(cur)
        except OSError:
            return "missing"
        if part in names:
            cur = cur / part
            continue
        low = [n for n in names if n.lower() == part.lower()]
        if low:
            return "case"
        return "missing"
    return "ok"


def _autoloads(root: Path) -> dict:
    out, sec = {}, ""
    pg = root / "project.godot"
    if not pg.exists():
        return out
    for line in pg.read_text().splitlines():
        s = line.strip()
        if s.startswith("[") and s.endswith("]"):
            sec = s[1:-1]
        elif sec == "autoload" and "=" in s:
            k, v = s.split("=", 1)
            out[k] = v.strip('"').lstrip("*")
    return out


def lint(project) -> list[dict]:
    """Offline text rules for architecture traps. Each finding: rule, severity, file, line, text, fix.

    Severity: error (breaks in an export or a security hole), warn (expert rule), info (judgment).
    """
    root = Path(project).resolve()
    findings: list[dict] = []

    def add(rule, sev, f, line, text, fix):
        findings.append({"rule": rule, "severity": sev, "file": str(Path(f).relative_to(root)), "line": line,
                         "text": text.strip()[:160], "fix": fix})

    autoloads = _autoloads(root)
    autoload_files = {v: k for k, v in autoloads.items()}
    for f in _files(root, {"gd"}):
        res = "res://" + str(f.relative_to(root)).replace(os.sep, "/")
        text = f.read_text(errors="replace")
        is_tool = text.lstrip().startswith("@tool") or "agent_job.gd" in text or "extends EditorScript" in text \
            or "extends SceneTree" in text or "extends EditorPlugin" in text
        extends_resource = re.search(r"^extends\s+Resource\b", text, re.M) is not None
        lines = text.splitlines()
        for i, line in enumerate(lines, 1):
            s = line.split("#", 1)[0] if not line.lstrip().startswith("##") else ""
            if re.search(r"scale\.x\s*(\*=\s*-|=\s*-)|scale\s*=\s*Vector2\(\s*-", s):
                add("A01-negative-scale-flip", "warn", f, i, line, "flip the sprite (flip_h) and mirror marker positions: move_and_slide rewrites a body's scale (-1, 1) to rotation 180 and scale.y -1, so a per-frame scale.x flip oscillates every frame (verified 4.7.2; FAT Earth Studios)")
            if re.search(r'get_node\("/root/|\$"?/root/|get_node\("\.\./|\$"\.\./|get_parent\(\)\.get_parent\(\)', s):
                add("A02-reach-up", "warn", f, i, line, "inject the dependency from the parent (@export, Callable or signal); a scene must work alone (Godot docs, Scene organization)")
            if not is_tool and re.search(r"DirAccess\.(open|get_files_at|get_directories_at)\(\s*\"res://", s):
                add("A03-runtime-folder-scan", "error", f, i, line, "build a registry Resource at edit time (build_catalog); exported folders list .remap entries (Godotneers)")
            if re.search(r'load\(\s*"user://[^"]*\.(tres|res|tscn|scn)"', s):
                add("A04-resource-from-user", "error", f, i, line, "a .tres from user:// runs embedded GDScript on load (verified 4.7.2): save JSON (SaveService)")
            if re.search(r"\bstr_to_var\(|\bbytes_to_var_with_objects\(", s):
                add("A05-str-to-var", "error", f, i, line, "str_to_var builds Object(...) literals (verified 4.7.2): parse JSON instead")
            if re.search(r"\.has_method\(", s) and not is_tool:
                add("A06-duck-typing", "info", f, i, line, "prefer `if x is Type:` then a typed local; has_method + call is UNSAFE_METHOD_ACCESS (static typing docs)")
            if re.search(r"^\s*class\s+\w+\s+extends\s+Resource\b", line) or (re.search(r"^\s*class\s+\w+\s*:\s*$", line)
                                                                              and i < len(lines) and re.search(r"^\s+extends\s+Resource\b", lines[i])):
                add("A07-inner-resource", "error", f, i, line, "one Resource class per file with class_name: inner-class resources save fields that never reload (verified 4.7.2)")
            if extends_resource:
                m = re.match(r"^func\s+_init\((.*)\)", line)
                if m and m.group(1).strip():
                    params = [x for x in m.group(1).split(",") if x.strip()]
                    if any("=" not in x for x in params):
                        add("A08-resource-init-defaults", "error", f, i, line, "give every _init parameter a default: loading a .tres calls _init() with no arguments")
            if re.search(r"\bpreload\(\s*\"res://[^\"]+\.(tscn|scn)\"", s) and res in autoload_files:
                add("A09-autoload-preloads-scene", "warn", f, i, line, "a permanent node that preloads scenes keeps the whole chain in memory; load() on demand (FAT Earth Studios)")
        if res in autoload_files and re.search(r"(event|signal)_?bus|^events?\.gd$", f.name, re.I):
            for i, line in enumerate(lines, 1):
                if re.match(r"^(var|@export|@onready)\b", line):
                    add("A10-stateful-event-bus", "warn", f, i, line, "an event bus holds no state, only signals (Eric Peterson, GodotCon 2025)")
    for f in _files(root, {"gd", "tscn", "tres", "cfg", "godot"}):
        text = f.read_text(errors="replace")
        for i, line in enumerate(text.splitlines(), 1):
            for m in _RES_LITERAL.finditer(line):
                rel = m.group(1)[len("res://"):]
                if not rel or rel.endswith("/") or "%" in rel or "{" in rel:
                    continue
                state = _exact_case(root, rel)
                if state == "case":
                    add("A11-path-case", "error", f, i, line, f"{m.group(1)} differs in case from the file on disk: works on macOS, fails in the exported pack")
    for f in _files(root, {"gd", "tscn", "tres", "gdshader", "png", "glb", "ogg", "wav"}):
        rel = f.relative_to(root)
        for part in rel.parts:
            if not _SNAKE.match(part) and f.suffix != ".cs":
                add("A12-not-snake-case", "warn", f, 0, str(rel), "lowercase snake_case files and folders (Godot docs, Project organization)")
                break
    for f in _files(root, {"gd", "gdshader"}):
        if not Path(str(f) + ".uid").exists() and (root / ".godot").exists():
            add("A13-missing-uid", "info", f, 0, f.name, "run --import and commit the .uid sidecar (4.4+)")
    for f in _files(root, {"uid"}):
        if not Path(str(f)[:-4]).exists():
            add("A14-orphan-uid", "warn", f, 0, f.name, "the script moved without its .uid: move the sidecar with it")
    for g in root.rglob(".gdignore"):
        if g.stat().st_size > 0 and not any(x in _SKIP_DIRS for x in g.relative_to(root).parts):
            add("A15-gdignore-not-empty", "info", g, 0, g.name, ".gdignore reads no patterns: keep it empty")
    if len(autoloads) > 6:
        add("A16-many-autoloads", "info", root / "project.godot", 0, ", ".join(autoloads),
            "each autoload is a global dependency; keep the stateless ones (Godotneers, W8gYHTjDCic [00:47:50])")
    return findings


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-godot-architecture tools")
    ap.add_argument("cmd", choices=["lint", "typing_gate", "audit_scenes"])
    ap.add_argument("project")
    ns = ap.parse_args()
    if ns.cmd == "lint":
        res = lint(ns.project)
        print(json.dumps(res, indent=1))
        sys.exit(1 if any(x["severity"] == "error" for x in res) else 0)
    res = typing_gate(ns.project) if ns.cmd == "typing_gate" else audit_scenes(ns.project)
    res.pop("log", None)
    print(json.dumps(res, indent=1, default=str)[:20000])
    sys.exit(0 if res.get("ok") else 1)
