"""
ue_stat: read performance numbers without a GUI and judge them against a frame budget.

STATUS: offline parsers, ran on synthetic logs, CSV and JSONL with system python3 on
2026-09-24 (tests/code/unreal-expert/test_ue_stat_offline.py). Real engine output has not
been parsed yet: the CSV profiler column names and the TraceQuery JSONL schema (new in 5.8,
undocumented in the saved pages) are [verify]; sniff_schema() shows what a real file holds.

Budgets are in milliseconds, per thread and for the GPU: 16.67 ms at 60 fps, 33.3 ms at 30
(Ari Arnbjornsson, GuIav71867E [00:03:53]). Classify first (stat unit: Frame, Game, Draw,
GPU, RHIT), then pick the tool: Insights for CPU, loading and memory; a GPU capture or
ProfileGPU for GPU. Profile a cooked Development or Test build on target hardware; editor
numbers are a convenience, and this Mac is a proxy for a console (profiling digest).

  import ue_stat as S
  frames = S.parse_stat_unit(text)            # stat unit text: blocks, one-liners, JSON lines
  csvp = S.parse_csv_profile("/abs/Profile.csv"); frames = S.csv_frames(csvp)
  recs = S.parse_jsonl("/abs/trace.jsonl"); S.sniff_schema(recs)
  frames = S.trace_frames(recs); totals = S.timer_totals(recs)
  S.budget_check(frames, 16.67)               # mean, p50/p95/p99, max, share over budget,
                                              # hitches, pass flags, which thread bounds it
  S.bound_by(frames)                          # game | draw | gpu | rhit, from stat unit data

Where the numbers come from (commands from the sources, flags [verify] on 5.8 Mac):
  stat unit / stat unitgraph   on-screen only; log the same numbers with the CSV profiler
                               (-csvprofile, or `csvprofile start` / `csvprofile stop`,
                               output under Saved/Profiling/CSV) or a trace
  -trace=default -tracefile=<abs>.utrace   lean capture (budget question)
  -trace=default,task -statnamedevents     rich capture (cause question; about 20% overhead,
                                           Profiling with Purpose, C-AjCqjKRSs [00:11:27])
  TraceQuery (5.8 UBT program) reads .utrace and writes JSONL to stdout
  snapshothitches -start / -stop (5.8, needs `stat default`): Saved/Profiling/Hitches
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

import csv
import io
import json
import math
import os
import re
import sys

UNIT_KEYS = ("frame", "game", "draw", "gpu", "rhit")
STAT_TAG = "UE_STAT_UNIT "

# CSV profiler columns -> stat unit keys [added from memory, verify on a real file]
CSV_COLUMNS = {"frame": ("FrameTime",), "game": ("GameThreadTime", "GameThreadTime_CriticalPath"),
               "draw": ("RenderThreadTime", "RenderThreadTime_CriticalPath"),
               "gpu": ("GPUTime", "GPU/Total"), "rhit": ("RHIThreadTime",),
               "dynres": ("DynamicResolutionPercentage", "DynRes")}

TRACE_SCHEMA = {
    "type_keys": ("type", "event", "kind", "record"),
    "frame_types": ("frame", "gameframe", "game_frame", "frames"),
    "timer_types": ("timer", "timing", "scope", "cpu", "cputimer", "timing_event"),
    "start_keys": ("start", "begin", "start_time", "startTime", "t0", "ts"),
    "end_keys": ("end", "end_time", "endTime", "t1"),
    "duration_keys": ("duration_ms", "durationMs", "ms", "duration", "dur", "time"),
    "name_keys": ("name", "timer", "timer_name", "scope", "event_name"),
    "thread_keys": ("thread", "thread_name", "threadName", "tid"),
    "index_keys": ("frame", "frame_index", "frameIndex", "index", "id"),
    "time_unit": "auto",   # "s" or "ms" to force; auto: *_ms keys are ms, start/end in s
}


# =========================================================================== generic
def fps_to_ms(fps):
    return 1000.0 / float(fps)


def ms_to_fps(ms):
    return 1000.0 / float(ms) if ms else float("inf")


def percentile(values, q):
    """Linear-interpolated percentile, q in [0, 100]."""
    v = sorted(values)
    if not v:
        return None
    k = (len(v) - 1) * q / 100.0
    lo, hi = int(math.floor(k)), int(math.ceil(k))
    return v[lo] if lo == hi else v[lo] + (v[hi] - v[lo]) * (k - lo)


def _values(frames, key="frame"):
    out = []
    for f in frames:
        if isinstance(f, (int, float)):
            out.append(float(f))
        elif isinstance(f, dict) and f.get(key) is not None:
            out.append(float(f[key]))
    return out


def summarize(frames, key="frame"):
    v = _values(frames, key)
    if not v:
        return {"count": 0}
    return {"count": len(v), "mean": round(sum(v) / len(v), 3), "min": round(min(v), 3),
            "p50": round(percentile(v, 50), 3), "p95": round(percentile(v, 95), 3),
            "p99": round(percentile(v, 99), 3), "max": round(max(v), 3)}


def bound_by(frames_or_frame):
    """Which thread bounds the frame: the stat unit rule 'if Frame is close to Game, the
    game thread is the bottleneck' (profiling fundamentals doc), applied to per-key means.
    Returns {"bound", "means", "gap_ms"} where gap_ms is Frame minus the bounding value."""
    frames = [frames_or_frame] if isinstance(frames_or_frame, dict) else list(frames_or_frame)
    means = {}
    for k in UNIT_KEYS:
        v = _values(frames, k)
        if v:
            means[k] = round(sum(v) / len(v), 3)
    cands = {k: v for k, v in means.items() if k != "frame"}
    if not cands:
        return {"bound": None, "means": means, "gap_ms": None}
    ref = means.get("frame", max(cands.values()))
    best = min(cands, key=lambda k: abs(ref - cands[k]))
    return {"bound": best, "means": means, "gap_ms": round(ref - cands[best], 3)}


def budget_check(frames, target_ms, key="frame", hitch_ms=None, mode="all"):
    """Judge frames against a budget in ms (16.67 for 60 fps, 33.3 for 30).

    frames: numbers or dicts with `key`. Returns count, mean/p50/p95/p99/max in ms,
    over_budget_fraction and indices, hitches (frames above hitch_ms, default 2 x target),
    gap_ms (p95 minus target: what must go), pass_all (every frame within budget: Ari's
    'every line green', C-AjCqjKRSs), pass_p99, pass_p95, pass (per `mode`), and bound
    (bound_by) when per-thread keys are present. The pass flags are a gate on a repeatable
    capture of a fixed path, not on one frame; performance trends stay advisory in CI
    (Andrew Fray, KuIWCzujtag [01:29:38])."""
    v = _values(frames, key)
    target = float(target_ms)
    hitch = float(hitch_ms) if hitch_ms else 2.0 * target
    if not v:
        return {"count": 0, "target_ms": target, "pass": False, "error": "no frames"}
    s = summarize(v)
    over = [i for i, x in enumerate(v) if x > target]
    out = {"target_ms": target, "fps_target": round(ms_to_fps(target), 2),
           "count": s["count"], "mean_ms": s["mean"], "p50_ms": s["p50"], "p95_ms": s["p95"],
           "p99_ms": s["p99"], "max_ms": s["max"], "min_ms": s["min"],
           "mean_fps": round(ms_to_fps(s["mean"]), 2),
           "over_budget_fraction": round(len(over) / float(len(v)), 5),
           "over_budget_frames": over[:200],
           "hitch_ms": hitch, "hitches": [i for i, x in enumerate(v) if x > hitch][:200],
           "gap_ms": round(s["p95"] - target, 3),
           "pass_all": s["max"] <= target, "pass_p99": s["p99"] <= target,
           "pass_p95": s["p95"] <= target}
    out["pass"] = {"all": out["pass_all"], "p99": out["pass_p99"], "p95": out["pass_p95"]}[mode]
    dicts = [f for f in frames if isinstance(f, dict)]
    if dicts and any(k in dicts[0] for k in ("game", "draw", "gpu", "rhit")):
        out["bound"] = bound_by(dicts)
        out["per_thread"] = {k: summarize(dicts, k) for k in UNIT_KEYS if _values(dicts, k)}
    return out


def _read_text(path_or_text):
    if isinstance(path_or_text, str) and "\n" not in path_or_text and os.path.isfile(path_or_text):
        with open(path_or_text, "r", encoding="utf-8-sig", errors="replace") as f:
            return f.read()
    return path_or_text or ""


# =========================================================================== stat unit
_UNIT_PAIR = re.compile(r"\b(Frame|Game|Draw|GPU|RHIT|RHI|Input|Swap)\s*:?\s*([0-9]+(?:\.[0-9]+)?)"
                        r"\s*ms\b", re.I)
_DYNRES = re.compile(r"\bDynRes\s*:?\s*([0-9.]+)\s*%?\s*(?:x\s*([0-9.]+)\s*%?)?", re.I)


def parse_stat_unit(text):
    """Frames from `stat unit` style text: 'Frame: 26.31 ms' blocks (a new frame starts at
    each Frame line), one-liners ('Frame 26.3ms Game 14.2ms ...'), or JSON lines tagged
    UE_STAT_UNIT. Log prefixes are ignored. `stat unit` itself only draws on screen: this
    reads numbers transcribed from the overlay or produced by your own logger."""
    text = _read_text(text)
    frames, cur = [], None
    for line in text.splitlines():
        i = line.find(STAT_TAG)
        if i >= 0:
            try:
                d = json.loads(line[i + len(STAT_TAG):])
                frames.append({k.lower(): v for k, v in d.items()})
            except ValueError:
                pass
            continue
        pairs = _UNIT_PAIR.findall(line)
        dyn = _DYNRES.search(line)
        if not pairs and not dyn:
            continue
        keys = [p[0].lower() for p in pairs]
        if "frame" in keys and (cur is None or "frame" in cur or len(keys) > 1):
            if cur:
                frames.append(cur)
            cur = {}
        if cur is None:
            cur = {}
        for k, val in pairs:
            k = "rhit" if k.lower() == "rhi" else k.lower()
            cur[k] = float(val)
        if dyn:
            cur["dynres"] = [float(dyn.group(1))] + ([float(dyn.group(2))] if dyn.group(2) else [])
        if len(keys) > 1 and "frame" in keys:
            frames.append(cur)
            cur = None
    if cur:
        frames.append(cur)
    return frames


# =========================================================================== CSV profiler
def parse_csv_profile(path_or_text):
    """Parse a CSV profiler file: header row, one row per frame, optional repeated header
    and '[key],value' metadata rows at the end (layout [added], verify on a real file).
    Returns {"columns", "rows" (dicts of floats; non-numeric cells kept as text),
    "metadata", "events" ([(row index, text)])}."""
    text = _read_text(path_or_text)
    reader = csv.reader(io.StringIO(text))
    header, rows, meta, events = None, [], {}, []
    for cells in reader:
        if not cells or all(not c.strip() for c in cells):
            continue
        if cells[0].startswith("["):
            for j in range(0, len(cells) - 1, 2):
                k = cells[j].strip().strip("[]")
                if k:
                    meta[k] = cells[j + 1].strip()
            continue
        if header is None:
            header = [c.strip() for c in cells]
            continue
        if [c.strip() for c in cells] == header:
            continue
        row = {}
        for name, cell in zip(header, cells):
            cell = cell.strip()
            if name.lower() == "events":
                if cell:
                    events.append((len(rows), cell))
                continue
            try:
                row[name] = float(cell)
            except ValueError:
                row[name] = cell
        rows.append(row)
    return {"columns": header or [], "rows": rows, "metadata": meta, "events": events}


def csv_frames(parsed, columns=None):
    """CSV rows -> stat-unit-style frames {"frame", "game", "draw", "gpu", "rhit"} using the
    first matching column name per key (CSV_COLUMNS, override with `columns`)."""
    cmap = dict(CSV_COLUMNS, **(columns or {}))
    cols = set(parsed.get("columns", []))
    pick = {k: next((c for c in names if c in cols), None) for k, names in cmap.items()}
    frames = []
    for r in parsed.get("rows", []):
        f = {}
        for k, c in pick.items():
            if c and isinstance(r.get(c), float):
                f[k] = r[c]
        if f:
            frames.append(f)
    return frames


# =========================================================================== TraceQuery JSONL
def parse_jsonl(path_or_lines):
    """Records from JSONL (a path, text, or an iterable of lines); non-JSON lines skipped."""
    if isinstance(path_or_lines, str):
        lines = _read_text(path_or_lines).splitlines()
    else:
        lines = list(path_or_lines)
    out = []
    for line in lines:
        line = line.strip()
        if not line or line[0] not in "{[":
            continue
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        if isinstance(rec, dict):
            out.append(rec)
        elif isinstance(rec, list):
            out.extend(r for r in rec if isinstance(r, dict))
    return out


def _first(rec, keys):
    for k in keys:
        if k in rec and rec[k] is not None:
            return k, rec[k]
    return None, None


def _rtype(rec, schema):
    _k, v = _first(rec, schema["type_keys"])
    return str(v).lower() if v is not None else ""


def sniff_schema(records, limit=5):
    """What a JSONL file holds: counts per record type and per key, and a few samples, so
    the schema below can be corrected after the first real TraceQuery run."""
    types, keys, samples = {}, {}, {}
    for r in records:
        t = _rtype(r, TRACE_SCHEMA) or "(untyped)"
        types[t] = types.get(t, 0) + 1
        for k in r:
            keys[k] = keys.get(k, 0) + 1
        if len(samples.setdefault(t, [])) < limit:
            samples[t].append(r)
    return {"records": len(records), "types": types, "keys": keys, "samples": samples}


def _duration_ms(rec, schema, unit):
    k, v = _first(rec, schema["duration_keys"])
    if k is not None and isinstance(v, (int, float)):
        if k.lower().endswith("ms") or unit == "ms":
            return float(v), "ms"
        if unit == "s":
            return float(v) * 1000.0, "s"
        return float(v), "ambiguous"
    ks, s = _first(rec, schema["start_keys"])
    ke, e = _first(rec, schema["end_keys"])
    if isinstance(s, (int, float)) and isinstance(e, (int, float)):
        if unit == "ms" or (ks and ks.lower().endswith("ms")):
            return float(e - s), "ms"
        return float(e - s) * 1000.0, "s"
    return None, None


def trace_frames(records, schema=None, frame_type=None):
    """Frame durations (ms) from TraceQuery-style records. Picks records whose type is a
    frame type (a 'game' frame type is preferred when several exist). Unsuffixed durations
    are read as seconds when their median is below 1.0, else as ms; the choice is reported
    in each frame's 'unit' key. Returns [{"frame": ms, "index", "start"?, "unit"}]."""
    sc = dict(TRACE_SCHEMA, **(schema or {}))
    unit = sc["time_unit"]
    ftypes = [t.lower() for t in sc["frame_types"]]
    typed = {}
    for r in records:
        t = _rtype(r, sc)
        if (frame_type and t == frame_type.lower()) or (not frame_type and t in ftypes):
            typed.setdefault(t, []).append(r)
    if not typed:
        return []
    pick = frame_type.lower() if frame_type else next(
        (t for t in ("gameframe", "game_frame") if t in typed), sorted(typed, key=lambda t: -len(typed[t]))[0])
    raw = []
    for i, r in enumerate(typed[pick]):
        d, how = _duration_ms(r, sc, unit)
        if d is None:
            continue
        _ki, idx = _first(r, sc["index_keys"])
        _ks, st = _first(r, sc["start_keys"])
        raw.append([d, how, idx if isinstance(idx, int) else i, st])
    amb = [x[0] for x in raw if x[1] == "ambiguous"]
    scale = 1000.0 if amb and percentile(amb, 50) < 1.0 else 1.0
    out = []
    for d, how, idx, st in raw:
        if how == "ambiguous":
            d, how = d * scale, ("s" if scale == 1000.0 else "ms") + "?"
        f = {"frame": round(d, 4), "index": idx, "unit": how}
        if isinstance(st, (int, float)):
            f["start"] = st
        out.append(f)
    return out


def timer_totals(records, schema=None, names=None, thread=None):
    """Sum and count timer records by name, overall and per frame window (timers are
    assigned to the frame whose [start, end) holds their start). Same-name timers must
    be summed per frame: per-call views undercount (Tom Looman, 3qgd4glfIR0 [00:10:37])."""
    sc = dict(TRACE_SCHEMA, **(schema or {}))
    unit = sc["time_unit"]
    ttypes = [t.lower() for t in sc["timer_types"]]
    frames = []
    for r in records:
        if _rtype(r, sc) in [t.lower() for t in sc["frame_types"]]:
            _k, s = _first(r, sc["start_keys"])
            _k2, e = _first(r, sc["end_keys"])
            if isinstance(s, (int, float)) and isinstance(e, (int, float)):
                frames.append((s, e))
    frames.sort()
    total, count, per = {}, {}, [dict() for _ in frames]
    for r in records:
        if _rtype(r, sc) not in ttypes:
            continue
        _kn, name = _first(r, sc["name_keys"])
        if name is None or (names and name not in names):
            continue
        if thread is not None:
            _kt, th = _first(r, sc["thread_keys"])
            if str(th) != str(thread):
                continue
        d, how = _duration_ms(r, sc, unit)
        if d is None:
            continue
        if how == "ambiguous":
            d = d * 1000.0 if d < 1.0 else d
        total[name] = total.get(name, 0.0) + d
        count[name] = count.get(name, 0) + 1
        _ks, st = _first(r, sc["start_keys"])
        if isinstance(st, (int, float)) and frames:
            lo, hi = 0, len(frames) - 1
            while lo <= hi:
                mid = (lo + hi) // 2
                if frames[mid][1] <= st:
                    lo = mid + 1
                elif frames[mid][0] > st:
                    hi = mid - 1
                else:
                    per[mid][name] = per[mid].get(name, 0.0) + d
                    break
    return {"total_ms": {k: round(v, 4) for k, v in total.items()}, "count": count,
            "per_frame": [{k: round(v, 4) for k, v in f.items()} for f in per],
            "frames": len(frames)}


def top_timers(totals, n=10):
    return sorted(totals["total_ms"].items(), key=lambda kv: -kv[1])[:n]


def _main(argv):
    if len(argv) >= 2 and argv[0] == "budget":
        path = argv[1]
        target = float(argv[argv.index("--target") + 1]) if "--target" in argv else 16.67
        if path.lower().endswith(".csv"):
            frames = csv_frames(parse_csv_profile(path))
        elif path.lower().endswith(".jsonl"):
            frames = trace_frames(parse_jsonl(path))
        else:
            frames = parse_stat_unit(path)
        print(json.dumps(budget_check(frames, target), indent=2))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
