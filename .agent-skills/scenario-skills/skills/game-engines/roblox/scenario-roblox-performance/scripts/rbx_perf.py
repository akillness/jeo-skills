#!/usr/bin/env python3
"""Performance runner for scenario-roblox-performance, on top of the scenario-roblox-expert toolkit.

    import rbx_perf
    rbx_perf.run(studio, "return PerfProbe.window(5)", dm="Server", kit=["PerfProbe"])
    rbx_perf.audit_place("place.rbxl")                       # offline PerfAudit (Lune), no Studio
    rbx_perf.set_attributes(studio, "Workspace", {"LabSpin": "client"})   # Edit data model
    m = rbx_perf.measure(pt, seconds=5)                      # PerfProbe.window on Server, then Client
    rbx_perf.compare(before, after, METRICS)                 # deltas with a noise floor
    rbx_perf.script_profile(studio, "Server", 3)             # ScriptProfilerService, top functions
    rbx_perf.heap(studio, "Server")                          # HeapProfilerService summary
    rbx_perf.scene(studio, "Client")                         # SceneAnalysisService summaries
    rbx_perf.micro(studio, "Edit", 2, "Lab/*")               # MicroProfiler through LibMP

Modules are inlined from scripts/agentkit/performance/ as locals; nothing is written into the place.
CLI: rbx_perf.py audit <place.rbxl>   (exit 1 on any warn finding)
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "scenario-roblox-expert" / "scripts"))
import rbx_run  # noqa: E402

KIT_DIR = HERE / "agentkit" / "performance"
MODULES = ("PerfProbe", "ScriptProf", "HeapProf", "SceneScan", "MicroProf", "PerfAudit")

# Metric paths for compare(): (path in a measure() result, lower is better)
METRICS = [
    ("server.jobsMs.p95", True), ("server.dtMs.p95", True), ("server.dtMs.max", True),
    ("server.physicsMs.p95", True), ("server.net.sendKbps", True), ("server.physics.contacts", True),
    ("server.physics.moving", True), ("client.dtMs.p95", True), ("client.dtMs.max", True),
    ("client.jobsMs.p95", True), ("client.net.recvKbps", True), ("client.render.sceneDraws", True),
    ("client.render.uiDraws", True), ("client.renderCpuMs.p95", True),
]


def kit_source(names) -> str:
    parts = []
    for n in names:
        if n not in MODULES:
            raise ValueError(f"unknown performance module {n}")
        src = "\n".join(ln for ln in (KIT_DIR / f"{n}.luau").read_text().splitlines() if not ln.startswith("--!"))
        parts.append(f"local {n} = (function()\n{src}\nend)()")
    return "\n".join(parts) + "\n" if parts else ""


def run(studio, code: str, dm: str = "Edit", kit=(), lead_kit=(), timeout: float | None = None) -> dict:
    """rbx_run.run with this skill's modules inlined before `code`. Same result dict."""
    head = kit_source(kit)
    r = rbx_run.run(studio, head + code, dm, timeout=timeout, kit=list(lead_kit))
    if r.get("error") and head:
        r["error"] = rbx_run._fix_lines(r["error"], head.count("\n"))
    return r


def audit_place(place: str | Path, assets: bool = False) -> dict:
    """PerfAudit on a place file through Lune (no Studio): PerfAudit.all, or PerfAudit.assets with assets=True."""
    p = subprocess.run(["lune", "run", str(KIT_DIR / "lune_perf_audit.luau"), str(Path(place).resolve()),
                        *(["assets"] if assets else [])],
                       capture_output=True, text=True, cwd=str(KIT_DIR))
    if not p.stdout.strip().startswith("{"):
        raise RuntimeError(p.stderr or p.stdout)
    return json.loads(p.stdout)


def set_attributes(studio, path: str, attrs: dict, dm: str = "Edit") -> dict:
    """Set attributes on an instance (dotted path from game). Used for feature flags and lab config."""
    lines = [f"local inst = game:GetService('{path.split('.')[0]}')"]
    for part in path.split(".")[1:]:
        lines.append(f"inst = inst:FindFirstChild({json.dumps(part)})")
    lines.append("assert(inst, 'no instance at path')")
    for k, v in attrs.items():
        lit = "nil" if v is None else json.dumps(v) if not isinstance(v, bool) else ("true" if v else "false")
        lines.append(f"inst:SetAttribute({json.dumps(k)}, {lit})")
    lines.append("return inst:GetAttributes()")
    return rbx_run.run(studio, "\n".join(lines), dm)


def measure(pt, seconds: float = 5, budget_ms: float = 1000 / 60, client: bool = True) -> dict:
    """PerfProbe.window on the playtest Server, then on the Client. Returns {server, client} (results)."""
    out = {}
    code = f"return PerfProbe.window({seconds}, {budget_ms})"
    for dm in (["Server", "Client"] if client else ["Server"]):
        r = run(pt.s, code, dm, kit=["PerfProbe"], timeout=seconds + 60)
        if not r["ok"]:  # one lost reply was seen under load: retry read-only chunks once
            r = run(pt.s, code, dm, kit=["PerfProbe"], timeout=seconds + 60)
        out[dm.lower()] = r["result"] if r["ok"] else {"error": r["error"]}
    return out


def get(d: dict, path: str):
    for k in path.split("."):
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d


def compare(before: dict, after: dict, metrics=METRICS, noise: float = 0.05, floor: float = 0.1) -> dict:
    """Per metric: before, after, delta, pct, and a verdict past a relative noise floor (5 %) and an
    absolute one (0.1 unit). 'better', 'worse' or 'same'."""
    rows = {}
    for path, lower in metrics:
        a, b = get(before, path), get(after, path)
        if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
            continue
        d = b - a
        pct = (d / a * 100) if a else None
        moved = abs(d) > max(floor, abs(a) * noise)
        verdict = "same" if not moved else ("better" if (d < 0) == lower else "worse")
        rows[path] = {"before": a, "after": b, "delta": round(d, 3),
                      "pct": None if pct is None else round(pct, 1), "verdict": verdict}
    return rows


def script_profile(studio, dm: str = "Server", seconds: float = 3, frequency: int = 1000, top: int = 10) -> dict:
    """Top functions by self time from ScriptProfilerService (PluginSecurity: execute_luau only)."""
    return run(studio, f"return ScriptProf.capture({seconds}, {frequency}, {top})", dm, kit=["ScriptProf"],
               timeout=seconds + 60)


def heap(studio, dm: str = "Server", top: int = 15) -> dict:
    """HeapProfilerService summary (Luau heap snapshot without the Developer Console)."""
    return run(studio, f"return HeapProf.summary(HeapProf.snapshot(), {top})", dm, kit=["HeapProf"], timeout=90)


def micro(studio, dm: str = "Edit", seconds: float = 2, mask: str = "Lab/*", frames: int = 128, tries: int = 1,
          min_frames: int = 1) -> dict:
    """MicroProfiler frames and your debug.profilebegin labels through LibMP (snapshot, then summary).
    In a playtest use dm="Client" with tries=4: the profiler is one per Studio process, so Server labels show too."""
    code = (f"return MicroProf.capture({seconds}, {{mask = {json.dumps(mask)}, frames = {frames}, tries = {tries}, "
            f"minFrames = {min_frames}}})")
    return run(studio, code, dm, kit=["MicroProf"], timeout=(seconds + 15) * tries + 60)


def scene(studio, dm: str = "Client") -> dict:
    """SceneAnalysisService summaries (script memory, unparented instances, triangles, composition)."""
    return run(studio, "return SceneScan.all()", dm, kit=["SceneScan"], timeout=90)


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "audit":
        r = audit_place(argv[1])
        print(json.dumps(r, indent=1))
        return 1 if r["tally"]["warn"] or r["tally"]["error"] else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
