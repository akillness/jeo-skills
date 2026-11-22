"""
ut_stat: numbers in, verdicts out. Parsers for AgentKit frame-timing CSVs (AgentProfile), build
reports (AgentBuild), NUnit test results (run_tests), and a frame budget check.

Shared toolkit of the scenario-unity-* skills (lead: scenario-unity-expert). System python3 3.9+, stdlib only.
Run on real outputs of Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-expert/test_offline.py
and test_live_toolkit.py.

    import ut_stat
    fr = ut_stat.read_frame_csv(csv)                 # {"frame": [...], "main_thread_ms": [...], ...}
    ut_stat.budget_check(fr["cpu_frame_ms"], 16.67)  # mean, p50, p95, p99, max, over-budget share, hitches, verdict
    ut_stat.summarize_csv(csv, target_ms=16.67)      # every column + verdicts + bound_by + caveats
    ut_stat.gc_check(fr["gc_alloc_bytes"])           # zero-allocation gameplay check
    ut_stat.build_summary(build_envelope_or_json, max_mb=None)
    ut_stat.test_summary("/abs/results.xml")

Budgets in ms, not fps: 16.67 ms at 60 fps, 33.33 at 30 (Unity profiling e-book); mobile keeps
about 65% of that for thermal headroom (about 10.8 ms at 60, 21.7 at 30).
"""

__version__ = "0.1"  # Unity Expert Skills v0.1 (2026-09-24: totalSize vs on-disk note)

import csv
import json
import math
import xml.etree.ElementTree as ET


def fps_to_ms(fps, mobile=False):
    """Frame budget in ms; mobile=True applies the 65% thermal rule (profiling e-book)."""
    ms = 1000.0 / float(fps)
    return round(ms * (0.65 if mobile else 1.0), 3)


def read_frame_csv(path):
    """AgentProfile CSV -> {column: [float, ...]} (frame numbers as ints)."""
    cols = {}
    with open(path, newline="") as f:
        r = csv.DictReader(f)
        for name in r.fieldnames or []:
            cols[name] = []
        for row in r:
            for k, v in row.items():
                try:
                    cols[k].append(int(v) if k == "frame" else float(v))
                except (TypeError, ValueError):
                    cols[k].append(None)
    return cols


def _pct(sorted_vals, q):
    if not sorted_vals:
        return None
    i = min(len(sorted_vals) - 1, max(0, int(math.ceil(q * len(sorted_vals))) - 1))
    return sorted_vals[i]


def stats(values):
    v = sorted(x for x in values if x is not None)
    if not v:
        return {"n": 0}
    n = len(v)
    mean = sum(v) / n
    var = sum((x - mean) ** 2 for x in v) / n
    return {"n": n, "mean": round(mean, 4), "p50": round(_pct(v, 0.50), 4), "p95": round(_pct(v, 0.95), 4),
            "p99": round(_pct(v, 0.99), 4), "max": round(v[-1], 4), "min": round(v[0], 4),
            "std": round(math.sqrt(var), 4)}


def budget_check(frames_ms, target_ms, hitch_factor=2.0, skip=0, p95_margin=1.0):
    """Frame times (ms) against a budget. A frame over hitch_factor x budget is a hitch.
    verdict: "pass" (p95 <= budget), "warn" (mean <= budget < p95), "fail" (mean > budget).
    skip drops the first frames (warm-up, first-use shader compiles)."""
    vals = [x for x in list(frames_ms)[skip:] if x is not None and x > 0]
    s = stats(vals)
    if not s.get("n"):
        return {"verdict": "no-data", "target_ms": target_ms, "n": 0}
    over = sum(1 for x in vals if x > target_ms)
    hitches = [i + skip for i, x in enumerate(frames_ms[skip:]) if x is not None and x > hitch_factor * target_ms]
    if s["mean"] > target_ms:
        verdict = "fail"
    elif s["p95"] > target_ms * p95_margin:
        verdict = "warn"
    else:
        verdict = "pass"
    out = dict(s)
    out.update({"target_ms": target_ms, "fps_equivalent_mean": round(1000.0 / s["mean"], 1) if s["mean"] else None,
                "over_budget_fraction": round(over / float(len(vals)), 4), "hitches": len(hitches),
                "hitch_frames": hitches[:20], "headroom_ms_p95": round(target_ms - s["p95"], 3), "verdict": verdict})
    return out


def gc_check(alloc_bytes, max_bytes_per_frame=0, skip=10):
    """Zero-allocation check on "GC Allocated In Frame". In the Editor the baseline is not zero
    (observed 2026-09-24: p50 88 bytes per frame in batch Play mode with nothing scripted):
    judge gameplay code in a development player, use the Editor number as a trend."""
    vals = [x for x in list(alloc_bytes)[skip:] if x is not None]
    if not vals:
        return {"verdict": "no-data"}
    offenders = sum(1 for x in vals if x > max_bytes_per_frame)
    s = stats(vals)
    return {"frames": len(vals), "frames_over": offenders, "share_over": round(offenders / float(len(vals)), 4),
            "bytes_total": int(sum(vals)), "p50": s["p50"], "p95": s["p95"], "max": s["max"],
            "limit": max_bytes_per_frame, "verdict": "pass" if offenders == 0 else "fail"}


def bound_by(summary):
    """Which side bounds the frame, from summarize_csv output. GPU time is often 0 in the Editor
    (observed: gpu_frame_ms p50 = 0 in batch Play mode on Metal); then the answer is "unknown"."""
    cpu = (summary.get("columns", {}).get("cpu_frame_ms") or summary.get("columns", {}).get("main_thread_ms") or {})
    gpu = summary.get("columns", {}).get("gpu_frame_ms") or {}
    if not cpu.get("n"):
        return {"bound": "unknown", "reason": "no CPU frame column"}
    if not gpu.get("n") or (gpu.get("p50") or 0) <= 0:
        return {"bound": "unknown", "reason": "GPU frame time not measured (Editor or unsupported): profile a development player"}
    c, g = cpu["p50"], gpu["p50"]
    if g > c * 1.1:
        return {"bound": "gpu", "cpu_p50": c, "gpu_p50": g}
    if c > g * 1.1:
        return {"bound": "cpu", "cpu_p50": c, "gpu_p50": g}
    return {"bound": "balanced", "cpu_p50": c, "gpu_p50": g}


def summarize_csv(path, target_ms=16.667, skip=10, frame_column=None):
    """Every column's stats, the budget verdict on the frame column (cpu_frame_ms, else
    main_thread_ms), gc_check, bound_by, and the caveats that apply to Editor numbers."""
    cols = read_frame_csv(path)
    out = {"csv": path, "frames": len(cols.get("frame", [])), "columns": {}, "target_ms": target_ms}
    for k, v in cols.items():
        if k == "frame":
            continue
        out["columns"][k] = stats(v[skip:])
    fc = frame_column or ("cpu_frame_ms" if "cpu_frame_ms" in cols else "main_thread_ms")
    if fc in cols:
        out["budget"] = budget_check(cols[fc], target_ms, skip=skip)
        out["budget"]["column"] = fc
    if "gc_alloc_bytes" in cols:
        out["gc"] = gc_check(cols["gc_alloc_bytes"], skip=skip)
    out["bound_by"] = bound_by(out)
    out["caveats"] = ["Editor Play mode numbers are for iteration; the authoritative measurement is a "
                      "development player on the lowest target device (Unity profiling e-book)"]
    if out["columns"].get("draw_calls", {}).get("max") == 0:
        out["caveats"].append("draw_calls 0: nothing rendered (batch mode has no Game view: use render=true)")
    return out


def compare_frames(before_csv, after_csv, column="cpu_frame_ms", skip=10):
    """Before and after one change: mean and p95 deltas on the same column (negative is faster)."""
    a = stats(read_frame_csv(before_csv).get(column, [])[skip:])
    b = stats(read_frame_csv(after_csv).get(column, [])[skip:])
    if not a.get("n") or not b.get("n"):
        return {"column": column, "error": "column missing in one file"}
    return {"column": column, "before": a, "after": b,
            "mean_delta_ms": round(b["mean"] - a["mean"], 4), "p95_delta_ms": round(b["p95"] - a["p95"], 4),
            "mean_change_pct": round(100.0 * (b["mean"] - a["mean"]) / a["mean"], 2) if a["mean"] else None}


# ============================================================================ builds
def build_summary(report, max_mb=None, max_seconds=None):
    """Normalize an AgentBuild result (ut_run.build envelope, its "result" dict, or a path to
    agent_build_report.json) and apply optional size and time budgets.
    Returns {"ok", "result", "platform", "size_mb", "on_disk_mb", "time_s", "errors", "warnings",
    "largest", "verdicts": [...]}."""
    if isinstance(report, str):
        with open(report) as f:
            report = json.load(f)
    r = report.get("result") if isinstance(report.get("result"), dict) else report
    if not isinstance(r, dict) or "total_size_mb" not in r:
        return {"ok": False, "verdicts": ["error: not a build report (envelope error: %s)" % report.get("error")]}
    verdicts = []
    ok = r.get("result") == "Succeeded"
    if not ok:
        verdicts.append("error: build %s" % r.get("result"))
    if r.get("errors"):
        verdicts.append("error: %s build errors" % r.get("errors"))
    size = r.get("output_on_disk_mb") or r.get("total_size_mb")
    if max_mb is not None and size and size > max_mb:
        ok = False
        verdicts.append("error: %.1f MB over the %.1f MB budget" % (size, max_mb))
    on_disk, total = r.get("output_on_disk_mb") or 0, r.get("total_size_mb") or 0
    if on_disk > 0 and total > 1.5 * on_disk:
        # observed by scenario-unity-performance (2026-09-24): BuildReport totalSize and the log's "Complete
        # build size" count IL2CPP's <Name>_BackUpThisFolder_ButDontShipItWithYourGame (1.7 GB of
        # symbols and C++ for an 8 MB game); the budget above uses the shipped output on disk
        verdicts.append("info: BuildReport totalSize %.1f MB vs %.1f MB on disk: totalSize counts "
                        "do-not-ship folders (IL2CPP BackUpThisFolder, Burst DoNotShip); size judged on "
                        "on_disk_mb" % (total, on_disk))
    if max_seconds is not None and r.get("total_time_s", 0) > max_seconds:
        verdicts.append("warn: build took %.0f s (budget %.0f s)" % (r["total_time_s"], max_seconds))
    web = r.get("web")
    if web:
        if web.get("decompression_fallback"):
            verdicts.append("warn: Decompression Fallback on: bigger loader, no wasm streaming (use server headers)")
        if web.get("compression") == "Disabled":
            verdicts.append("info: compression disabled (right only when the host compresses, e.g. Poki)")
    return {"ok": ok, "result": r.get("result"), "platform": r.get("platform"), "size_mb": r.get("total_size_mb"),
            "on_disk_mb": r.get("output_on_disk_mb"), "time_s": r.get("total_time_s"), "errors": r.get("errors"),
            "warnings": r.get("warnings"), "largest": (r.get("largest_files") or [])[:5], "web": web,
            "verdicts": verdicts}


# ============================================================================ tests
def test_summary(xml_path):
    """NUnit3 XML -> {"total", "passed", "failed", "skipped", "duration", "failures": [...]}."""
    root = ET.parse(xml_path).getroot()
    run = root if root.tag == "test-run" else root.find(".//test-run")
    get = lambda k: int(run.get(k, "0") or 0)
    fails = []
    for tc in run.iter("test-case"):
        if tc.get("result") not in ("Passed", "Skipped", "Inconclusive"):
            m = tc.find("failure/message")
            fails.append({"fullname": tc.get("fullname"), "message": (m.text or "").strip()[:500] if m is not None else ""})
    return {"result": run.get("result"), "total": get("total"), "passed": get("passed"), "failed": get("failed"),
            "skipped": get("skipped"), "duration": float(run.get("duration", "0") or 0), "failures": fails,
            "ok": get("total") > 0 and get("failed") == 0}


if __name__ == "__main__":
    import sys
    p = sys.argv[1]
    if p.endswith(".csv"):
        print(json.dumps(summarize_csv(p, float(sys.argv[2]) if len(sys.argv) > 2 else 16.667), indent=2))
    elif p.endswith(".xml"):
        print(json.dumps(test_summary(p), indent=2))
    else:
        print(json.dumps(build_summary(p), indent=2))
