#!/usr/bin/env python3
"""gd_stat: parsers for what Godot 4.7.2 and the AgentKit write.

Offline, system python3, standard library only.

- parse_godot_log(text)        engine log -> parse/script/shader/engine errors, warnings, leaks, AGENT_RESULT
- read_monitor_csv(path)       CSV from agent_profile.gd -> {column: [floats]}
- frame_stats(frames_ms)       mean, p50, p95, p99, max, hitches, 1% low fps
- budget_check(frames_ms, target_ms, percentile=95, max_hitch_ratio=0.01)
- parse_export_log(text)       export run log -> missing templates, preset errors, ok flag
- parse_junit(path)            JUnit XML (GUT -gjunit_xml_file, gdUnit4 report) -> counts + failures
- parse_gut_output(text)       GUT console summary -> counts (fallback when no XML)

Log formats were captured from Godot 4.7.2.stable.official.ed1daf0bf on 2026-10-02:
    SCRIPT ERROR: Parse Error: <msg>
              at: GDScript::reload (res://x.gd:3)
    SCRIPT ERROR: <runtime msg>
              at: helper (res://x.gd:13)
    SHADER ERROR: <msg>
              at: (null) (:2)
    ERROR: <msg>
       at: <func> (<engine source file>:<line>)
    WARNING: <msg>
    WARNING: 1 ObjectDB instance was leaked at exit (...)
"""
from __future__ import annotations

__version__ = "0.1"

import csv
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

RESULT_TAG = "AGENT_RESULT "

_AT_RE = re.compile(r"^\s+at:\s+(?P<func>.*?)\s+\((?P<file>[^()]*?)(?::(?P<line>\d+))?\)\s*$")
_HEAD_RE = re.compile(r"^(?P<kind>SCRIPT ERROR|SHADER ERROR|ERROR|WARNING|USER ERROR|USER WARNING|USER SCRIPT ERROR):\s?(?P<msg>.*)$")
_ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
_LEAK_RE = re.compile(r"(\d+) ObjectDB instances? (?:was|were) leaked at exit|RID allocations? of type .* (?:was|were) leaked at exit|were leaked at exit")


def _entry(kind: str, msg: str) -> dict:
    return {"kind": kind, "message": msg.strip(), "detail": "", "func": None, "file": None, "line": None}


def parse_godot_log(text: str) -> dict:
    """Classify a Godot 4.7.2 log (stdout and stderr merged).

    Returns a dict with keys: agent_result (dict or None, the LAST `AGENT_RESULT {json}` line),
    agent_results (all of them), parse_errors, script_errors, shader_errors, engine_errors,
    warnings, leaks (list of leak lines), prints (plain lines), and counts.
    Each error entry is {kind, message, func, file, line}.
    """
    out = {
        "agent_result": None,
        "agent_results": [],
        "parse_errors": [],
        "script_errors": [],
        "shader_errors": [],
        "engine_errors": [],
        "warnings": [],
        "leaks": [],
        "prints": [],
    }
    lines = _ANSI.sub("", text or "").splitlines()
    last = None
    for raw in lines:
        line = raw.rstrip("\n")
        if line.startswith(RESULT_TAG):
            payload = line[len(RESULT_TAG):].strip()
            try:
                res = json.loads(payload)
            except json.JSONDecodeError as exc:
                res = {"ok": False, "error": f"AGENT_RESULT is not valid JSON: {exc}", "raw": payload[:500]}
            out["agent_results"].append(res)
            out["agent_result"] = res
            last = None
            continue
        m = _HEAD_RE.match(line)
        if m:
            kind, msg = m.group("kind"), m.group("msg")
            e = _entry(kind, msg)
            if _LEAK_RE.search(msg):
                out["leaks"].append(msg.strip())
                last = None
                continue
            if kind in ("SCRIPT ERROR", "USER SCRIPT ERROR"):
                if msg.startswith("Parse Error:"):
                    e["message"] = msg[len("Parse Error:"):].strip()
                    out["parse_errors"].append(e)
                else:
                    out["script_errors"].append(e)
            elif kind == "SHADER ERROR":
                out["shader_errors"].append(e)
            elif kind in ("ERROR", "USER ERROR"):
                out["engine_errors"].append(e)
            else:
                out["warnings"].append(e)
            last = e
            continue
        am = _AT_RE.match(line)
        if am and last is not None and last["func"] is None:
            last["func"] = am.group("func")
            last["file"] = am.group("file") or None
            last["line"] = int(am.group("line")) if am.group("line") else None
            continue
        if line.strip().startswith(("GDScript backtrace", "[")) and last is not None:
            continue
        if line.startswith("Godot Engine v") or not line.strip():
            continue
        if last is not None and last["func"] is None and not line.startswith(RESULT_TAG):
            # Multi-line messages (export configuration errors) continue until the "at:" line.
            last["detail"] = (last["detail"] + "\n" + line.strip()).strip()
            continue
        if line.startswith((" ", "\t")) and last is not None:
            continue
        out["prints"].append(line)
    # A parse error is always followed by 'Failed to load script ... "Parse error"': keep it, but mark it.
    for e in out["engine_errors"]:
        e["follows_parse_error"] = 'with error "Parse error"' in e["message"]
    out["counts"] = {k: len(out[k]) for k in ("parse_errors", "script_errors", "shader_errors", "engine_errors", "warnings", "leaks")}
    return out


def has_errors(parsed: dict, include_engine: bool = True) -> bool:
    """True when the parsed log holds parse, script or shader errors (and engine errors if include_engine)."""
    c = parsed["counts"]
    n = c["parse_errors"] + c["script_errors"] + c["shader_errors"]
    if include_engine:
        n += c["engine_errors"]
    return n > 0


# ---------------------------------------------------------------- frame timing

def read_monitor_csv(path) -> dict:
    """Read a CSV written by agent_profile.gd (header row, one row per frame). Non-numeric cells become NaN."""
    cols: dict[str, list[float]] = {}
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            for k, v in row.items():
                try:
                    cols.setdefault(k, []).append(float(v))
                except (TypeError, ValueError):
                    cols.setdefault(k, []).append(float("nan"))
    return cols


def _percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return float("nan")
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * (p / 100.0)
    lo, hi = math.floor(k), math.ceil(k)
    if lo == hi:
        return sorted_vals[int(k)]
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def frame_stats(frames_ms) -> dict:
    """Summary of a list of frame times in milliseconds.

    hitches = frames longer than 2x the median [added: common hitch definition, tune per project].
    low_1pct_fps = 1000 / mean of the slowest 1% of frames.
    """
    vals = [float(v) for v in frames_ms if v is not None and not math.isnan(float(v))]
    if not vals:
        return {"n": 0}
    s = sorted(vals)
    med = _percentile(s, 50)
    worst = s[-max(1, len(s) // 100):]
    mean = sum(s) / len(s)
    worst_mean = sum(worst) / len(worst)

    def _fps(ms: float) -> float:
        # An all-zero column (physics_ms in a scene with no physics) used to raise ZeroDivisionError.
        return 1000.0 / ms if ms > 0 else float("inf")

    return {
        "n": len(s),
        "mean_ms": mean,
        "p50_ms": med,
        "p95_ms": _percentile(s, 95),
        "p99_ms": _percentile(s, 99),
        "max_ms": s[-1],
        "min_ms": s[0],
        "hitches": sum(1 for v in s if med > 0 and v > 2.0 * med),
        "low_1pct_fps": _fps(worst_mean),
        "mean_fps": _fps(mean),
    }


def budget_check(frames_ms, target_ms: float, percentile: float = 95.0, max_hitch_ratio: float = 0.01) -> dict:
    """Pass when the chosen percentile frame time is within target_ms and hitches stay under max_hitch_ratio.

    target_ms: 16.67 for 60 fps, 33.33 for 30 fps, 8.33 for 120 fps, 11.11 for 90 fps (VR).
    """
    st = frame_stats(frames_ms)
    if st.get("n", 0) == 0:
        return {"ok": False, "reason": "no frames", "stats": st}
    vals = sorted(float(v) for v in frames_ms if v is not None and not math.isnan(float(v)))
    pv = _percentile(vals, percentile)
    over = sum(1 for v in vals if v > target_ms)
    hitch_ratio = st["hitches"] / st["n"]
    ok = pv <= target_ms and hitch_ratio <= max_hitch_ratio
    return {
        "ok": ok,
        "target_ms": target_ms,
        "percentile": percentile,
        "value_ms": pv,
        "frames_over_budget": over,
        "over_ratio": over / st["n"],
        "hitch_ratio": hitch_ratio,
        "stats": st,
        "reason": "" if ok else (f"p{percentile:g}={pv:.2f} ms > {target_ms} ms" if pv > target_ms else f"hitch ratio {hitch_ratio:.3f} > {max_hitch_ratio}"),
    }


# ---------------------------------------------------------------- export

def parse_export_log(text: str) -> dict:
    """Read the log of `godot --headless --export-release|--export-debug|--export-pack`.

    Recognises (4.7.2): missing templates (the message names the missing file), unknown preset
    (the engine lists valid names), missing output directory, and generic ERROR lines.
    """
    parsed = parse_godot_log(text)
    t = text or ""
    missing = re.findall(r"(\S*export_templates/\S+?)(?:\"|'|\s|$)", t)
    out = {
        "missing_templates": sorted(set(m.rstrip(".,") for m in missing if "export_templates" in m)) if re.search(r"template", t, re.I) and re.search(r"not found|missing|No export template", t, re.I) else [],
        "unknown_preset": bool(re.search(r"Invalid export preset name|preset.*not found|Couldn't find preset", t, re.I)),
        "missing_output_dir": bool(re.search(r"(directory|folder).*(does not exist|doesn't exist)|Cannot create|Can't open file for writing", t, re.I)),
        "errors": [e["message"] for e in parsed["engine_errors"] + parsed["script_errors"] + parsed["parse_errors"]],
        "warnings": [w["message"] for w in parsed["warnings"]],
        "savepack_ok": bool(re.search(r"savepack: end|Export.*(finished|completed)", t, re.I)),
    }
    out["ok_by_log"] = not out["missing_templates"] and not out["unknown_preset"] and not out["errors"]
    return out


# ---------------------------------------------------------------- tests

def parse_junit(path) -> dict:
    """JUnit XML from GUT (-gjunit_xml_file) or gdUnit4 (reports/report_N/results.xml)."""
    p = Path(path)
    if not p.exists():
        return {"ok": False, "error": f"no junit file at {p}", "tests": 0}
    root = ET.parse(p).getroot()
    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    tests = failures = errors = skipped = 0
    failed_cases = []
    for s in suites:
        cases = list(s.iter("testcase"))
        tests += len(cases)
        for c in cases:
            f = c.find("failure")
            e = c.find("error")
            sk = c.find("skipped")
            if f is not None:
                failures += 1
                failed_cases.append({"suite": s.get("name"), "name": c.get("name"), "message": (f.get("message") or f.text or "").strip()[:400]})
            elif e is not None:
                errors += 1
                failed_cases.append({"suite": s.get("name"), "name": c.get("name"), "message": (e.get("message") or e.text or "").strip()[:400]})
            elif sk is not None:
                skipped += 1
    passed = tests - failures - errors - skipped
    return {"ok": tests > 0 and failures == 0 and errors == 0, "tests": tests, "passed": passed,
            "failures": failures, "errors": errors, "skipped": skipped, "failed": failed_cases}


_GUT_TOTAL = re.compile(r"^\s*(Scripts|Tests|Passing Tests|Failing Tests|Risky/Pending|Pending|Asserts|Orphans|Warnings|Errors|Time)\s+(\S+)", re.M)


def parse_gut_output(text: str) -> dict:
    """GUT 9.x console summary ('Totals' block). Values are strings for Time, ints otherwise."""
    d: dict = {}
    for k, v in _GUT_TOTAL.findall(text or ""):
        key = k.lower().replace("/", "_").replace(" ", "_")
        try:
            d[key] = int(v)
        except ValueError:
            d[key] = v
    d["all_passed"] = "---- All tests passed! ----" in (text or "") or (d.get("failing_tests", 1) == 0 and d.get("tests", 0) > 0)
    return d


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        print(json.dumps(parse_godot_log(Path(sys.argv[1]).read_text(errors="replace"))["counts"], indent=2))
