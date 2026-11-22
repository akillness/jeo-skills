#!/usr/bin/env python3
"""gd_gameplay: runner-side helpers of the scenario-godot-gameplay skill (Godot 4.7.2, system python3).

Builds on the scenario-godot-expert toolkit (gd_env, gd_run, gd_review, gd_stat); never reimplements it.

    import sys; sys.path.insert(0, "<skills>/scenario-godot-gameplay/scripts")
    import gd_gameplay as gg
    gg.install(P)                                   # copies scripts/agentkit/gameplay/*.gd to res://addons/agentkit/gameplay/
    r = gg.crowd_bench(P, n=200, avoidance=True)    # headless --fixed-fps 60 benchmark, returns gd_run dict
    gg.scaling_verdict({50: 0.6, 100: 1.1, 200: 2.4})
    gg.check_dialogue_text(text)                    # offline lint of a .dialogue file (cue targets)
    gg.scan_resource_text(path)                     # offline: embedded scripts in a .tres save

Install in a project once per session (re-run after editing the kit): it overwrites only
addons/agentkit/gameplay/.
"""
from __future__ import annotations

__version__ = "0.1"

import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL_DIR = HERE.parent
KIT_SRC = HERE / "agentkit" / "gameplay"
EXPERT_SCRIPTS = SKILL_DIR.parent / "scenario-godot-expert" / "scripts"
if str(EXPERT_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(EXPERT_SCRIPTS))

FRAME_BUDGET_MS = {"60": 16.67, "30": 33.33, "120": 8.33}


def _gd_run():
    import gd_run  # noqa: WPS433 (lazy: offline helpers must work without Godot)
    return gd_run


def install(project) -> Path:
    """Copy the gameplay kit into <project>/addons/agentkit/gameplay/ (AgentKit must be installed)."""
    dest = Path(project) / "addons" / "agentkit" / "gameplay"
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted(KIT_SRC.rglob("*")):
        if f.is_file() and f.suffix in (".gd", ".dialogue", ".tres", ".json"):
            t = dest / f.relative_to(KIT_SRC)
            t.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, t)
    (dest / "VERSION").write_text("scenario-godot-gameplay kit 0.1\n")
    return dest


def copy_jobs(project, src_dir, names=None) -> list[Path]:
    """Copy job scripts (*.gd) from src_dir into <project>/jobs/, plus every file in its subfolders
    (helpers, fixtures, .dialogue) with the same relative path."""
    src_dir = Path(src_dir)
    dest = Path(project) / "jobs"
    dest.mkdir(parents=True, exist_ok=True)
    out = []
    for f in sorted(src_dir.glob("*.gd")):
        if names and f.stem not in names and f.name not in names:
            continue
        shutil.copy2(f, dest / f.name)
        out.append(dest / f.name)
    for f in sorted(src_dir.rglob("*")):
        if f.is_file() and f.parent != src_dir and f.suffix != ".uid":
            t = dest / f.relative_to(src_dir)
            t.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, t)
    return out


def run_job(project, job: str, args: dict | None = None, fixed_fps: int | None = None, timeout: float = 600,
            headless: bool = True, extra_args: list[str] | None = None) -> dict:
    """gd_run.run_script with --fixed-fps when asked. Headless frames otherwise sleep 6.9 ms each
    (low_processor_usage_mode_sleep_usec, applied when no window can draw: observed 4.7.2), so wall
    time per frame is not CPU cost; with --fixed-fps 60 every frame is one physics tick, runs without
    the sleep, and the simulation is deterministic."""
    xa = list(extra_args or [])
    if fixed_fps:
        xa += ["--fixed-fps", str(int(fixed_fps))]
    return _gd_run().run_script(project, job, args=args or {}, timeout=timeout, headless=headless, extra_args=xa or None)


def crowd_bench(project, n: int = 200, timeout: float = 600, **kw) -> dict:
    """Run crowd_bench.gd:run headless at --fixed-fps 60. kw: avoidance, collide_agents, neighbor_distance,
    max_neighbors, time_horizon, repath_interval, frames, warmup, seed, mode ("body" | "server")."""
    args = {"n": n}
    args.update(kw)
    return run_job(project, "res://addons/agentkit/gameplay/crowd_bench.gd:run", args, fixed_fps=60, timeout=timeout)


def scaling_verdict(points: dict) -> dict:
    """points {agent_count: ms}. Fits ms = a * n^k on the end points; k near 1 is linear, k above
    about 1.3 points at pair growth (physics pairs, avoidance neighbours) [added]."""
    import math
    ks = sorted(points)
    if len(ks) < 2:
        return {"ok": False, "error": "need two or more agent counts"}
    n0, n1 = ks[0], ks[-1]
    m0, m1 = max(points[n0], 1e-6), max(points[n1], 1e-6)
    k = math.log(m1 / m0) / math.log(n1 / n0)
    per_agent_us = {n: points[n] * 1000.0 / n for n in ks}
    return {"ok": True, "exponent": round(k, 3), "linear": k < 1.3, "per_agent_us": per_agent_us}


def budget_share(ms: float, fps: int = 60, share: float = 0.25) -> dict:
    """Is `ms` within `share` of the frame budget (default a quarter of 16.67 ms for gameplay)?"""
    budget = 1000.0 / fps
    return {"ms": ms, "budget_ms": round(budget, 3), "share": share, "limit_ms": round(budget * share, 3),
            "ok": ms <= budget * share}


# ------------------------------------------------------------------ offline lints

_CUE = re.compile(r"^\s*~\s+([A-Za-z0-9_]+)\s*$")
_JUMP = re.compile(r"=>\s*<?\s*([A-Za-z0-9_/]+)")


def check_dialogue_text(text: str) -> dict:
    """Offline lint of Dialogue Manager text: every `=> cue` / `=>< cue` target must exist (END and
    END! are built in; `a/b` imported cues and expression jumps are not checked). The plugin's own
    compiler is authoritative: this is a pre-check for agents."""
    cues = set()
    jumps = []
    for i, line in enumerate(text.splitlines(), 1):
        m = _CUE.match(line)
        if m:
            cues.add(m.group(1))
        for j in _JUMP.finditer(line):
            jumps.append((i, j.group(1)))
    missing = [(i, t) for i, t in jumps if t not in cues and t not in ("END",) and "/" not in t]
    return {"ok": not missing, "cues": sorted(cues), "jumps": len(jumps), "missing": missing}


_SCRIPT_LINES = (
    re.compile(r'\[sub_resource[^\]]*type="(GDScript|CSharpScript|Script)"'),
    re.compile(r"^\s*script/source\s*=", re.M),
    re.compile(r'\[ext_resource[^\]]*type="(GDScript|Script|CSharpScript)"'),
)


def scan_resource_text(path_or_text: str, allowed_scripts=()) -> dict:
    """Offline check of a text .tres save before ResourceLoader.load(): embedded scripts
    (sub_resource GDScript with script/source) run on load; external scripts are allowed only when
    listed in allowed_scripts (res:// paths of your own SavedGame classes)."""
    p = Path(path_or_text)
    text = p.read_text(errors="replace") if p.exists() else str(path_or_text)
    if text.startswith("RSRC"):
        return {"ok": False, "reason": "binary resource: scan the text form or refuse"}
    hits = []
    for rx in _SCRIPT_LINES[:2]:
        for m in rx.finditer(text):
            hits.append(m.group(0)[:80])
    ext_bad = []
    for m in re.finditer(r'\[ext_resource[^\]]*\]', text):
        tag = m.group(0)
        if re.search(r'type="(GDScript|Script|CSharpScript)"', tag):
            pm = re.search(r'path="([^"]+)"', tag)
            if not pm or pm.group(1) not in allowed_scripts:
                ext_bad.append(tag[:120])
    return {"ok": not hits and not ext_bad, "embedded": hits, "foreign_scripts": ext_bad}


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-godot-gameplay helpers")
    ap.add_argument("cmd", choices=["install", "bench", "lint-dialogue", "scan-save"])
    ap.add_argument("target")
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--args", default="{}")
    ns = ap.parse_args()
    if ns.cmd == "install":
        print(install(ns.target))
    elif ns.cmd == "bench":
        res = crowd_bench(ns.target, n=ns.n, **json.loads(ns.args))
        res.pop("log", None)
        print(json.dumps(res.get("result"), indent=2, default=str))
    elif ns.cmd == "lint-dialogue":
        print(json.dumps(check_dialogue_text(Path(ns.target).read_text()), indent=2))
    else:
        print(json.dumps(scan_resource_text(ns.target), indent=2))
