"""
ut_perf: the performance engineer's runner-side toolkit (scenario-unity-performance skill).

Imports the shared toolkit (ut_env, ut_run, ut_stat from <skills>/scenario-unity-expert/scripts); adds what a
performance pass needs on top of it:

    import sys; sys.path.insert(0, "<skills>/scenario-unity-performance/scripts")
    import ut_perf
    ut_perf.install(P)                                   # core AgentKit + Performance jobs + runtime probe
    a = ut_perf.profile(P, "Assets/Scenes/X.unity", label="before")   # Editor Play mode, AgentProfile
    b = ut_perf.profile(P, "Assets/Scenes/X.unity", label="after")
    ut_perf.compare(a["csv"], b["csv"])                  # mean/p95 deltas per column (ut_stat.compare_frames)
    bld = ut_perf.build_player(P, "Builds/macOS/Bench.app", scenes=[...], development=True)
    run = ut_perf.run_player(P + "/Builds/macOS/Bench.app", "/abs/out.csv", scene="X")  # headless player
    cap = ut_perf.capture_player(app, "/abs/cap.raw", scene="X"); ut_perf.analyze_capture(P, cap["raw"])
    ut_perf.lint_scripts(P + "/Assets")                   # hot-path allocation and batching smells (offline)

Numbers from the Editor are for iteration; verdicts come from a development player on the target
device (Unity profiling e-book p. 18). System python3 3.9+, stdlib only.
Run in Unity 6000.3.21f1 on macOS (Apple Silicon) on 2026-09-24: tests/code/unity-performance/.
"""

__version__ = "0.1"  # scenario-unity-performance v0.1 (2026-09-24 refactor: spike attribution, physics catch-up,
#                        density, memory budget, Frame Debugger, Project Auditor, duplicates, variants)

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(HERE)
SKILLS = os.path.dirname(SKILL_DIR)
CORE = os.path.join(SKILLS, "scenario-unity-expert", "scripts")
if CORE not in sys.path:
    sys.path.insert(0, CORE)

import ut_env  # noqa: E402
import ut_run  # noqa: E402
import ut_stat  # noqa: E402

AGENTKIT_PERF = os.path.join(HERE, "AgentKit")                 # -> Assets/Editor/AgentKit/Performance
RUNTIME_SRC = os.path.join(HERE, "Runtime", "Performance")     # -> Assets/AgentKitRuntime/Performance
RUNTIME_DST = os.path.join("Assets", "AgentKitRuntime", "Performance")

COMPARE_COLUMNS = ["cpu_frame_ms", "cpu_main_frame_ms", "main_thread_ms", "draw_calls", "batches",
                   "setpass_calls", "triangles", "gc_alloc_bytes"]


# ============================================================================ install
def install(project):
    """Core AgentKit (ut_env.install_agentkit) + this skill's Editor jobs + the runtime probe
    (PerfProbe, AllocScope; own asmdef AgentKit.Performance.Runtime, auto-referenced, so
    Assembly-CSharp-Editor jobs and test asmdefs can use it). Returns the files written."""
    root = ut_env.find_project(project)["root"]
    written = ut_env.install_agentkit(root)
    written += ut_env.install_agentkit(root, src=AGENTKIT_PERF)
    dst = os.path.join(root, RUNTIME_DST)
    os.makedirs(dst, exist_ok=True)
    for fn in sorted(os.listdir(RUNTIME_SRC)):
        if not fn.endswith((".cs", ".asmdef")):
            continue
        s, d = os.path.join(RUNTIME_SRC, fn), os.path.join(dst, fn)
        if os.path.isfile(d) and Path(s).read_bytes() == Path(d).read_bytes():
            continue
        shutil.copyfile(s, d)
        written.append(os.path.relpath(d, root))
    return written


# ============================================================================ Editor profile
def profile(project, scene, frames=300, warmup=60, target_fps=60.0, width=1920, height=1080,
            label=None, render=True, timeout=900):
    """Editor Play-mode frame timings through the shared AgentKit.AgentProfile.PlayModeTimings job:
      Unity -batchmode -projectPath P -executeMethod AgentKit.AgentProfile.PlayModeTimings (no -quit,
      graphics on; Camera.main renders to an offscreen RenderTexture; ProfilerRecorder counters)
    render=False skips the offscreen target: nothing draws, so the frame is scripts + engine
    update only (isolates script cost from render submission).
    Returns {"ok", "csv", "summary" (ut_stat.summarize_csv), "envelope", "label", "load_avg_1m"}."""
    root = ut_env.find_project(project)["root"]
    out = os.path.join(root, "Library", "AgentKit", "perf", "%s.csv" % (label or "profile-%d" % int(time.time())))
    r = ut_run.run_method(root, "AgentKit.AgentProfile.PlayModeTimings",
                          {"scene": scene, "frames": frames, "warmup": warmup, "target_fps": target_fps,
                           "width": width, "height": height, "out_csv": out, "render": render},
                          quit=False, graphics=True, timeout=timeout)
    res = {"ok": bool(r.get("ok")), "label": label, "envelope": r, "csv": out if r.get("ok") else None,
           "load_avg_1m": round(os.getloadavg()[0], 1)}
    if r.get("ok") and os.path.isfile(out):
        res["summary"] = ut_stat.summarize_csv(out, target_ms=round(1000.0 / target_fps, 3))
    else:
        res["error"] = r.get("error")
    return res


def _median(v):
    v = sorted(x for x in v if x is not None)
    if not v:
        return None
    n = len(v)
    return v[n // 2] if n % 2 else round((v[n // 2 - 1] + v[n // 2]) / 2.0, 4)


def ab_profile(project, scene_a, scene_b, rounds=3, frames=200, warmup=60, render=True, label="ab",
               columns=("cpu_frame_ms", "main_thread_ms", "draw_calls", "batches", "setpass_calls", "gc_alloc_bytes")):
    """A/B on a shared or noisy machine: A,B,A,B,... interleaved, per-run p50 per column, then the
    median over rounds. Counts (draw calls, batches, bytes) are deterministic; times drift with
    machine load, so a time verdict needs every round to agree in sign ("consistent").
    Returns {"a", "b", "delta_pct", "consistent", "rounds", "load_avg_1m": [...], "runs": [...]}."""
    per = {"A": {c: [] for c in columns}, "B": {c: [] for c in columns}}
    loads, runs = [], []
    for i in range(rounds):
        for tag, sc in (("A", scene_a), ("B", scene_b)):
            p = profile(project, sc, frames=frames, warmup=warmup, render=render, label="%s_%s%d" % (label, tag, i))
            loads.append(p.get("load_avg_1m"))
            runs.append({"tag": tag, "round": i, "ok": p["ok"], "csv": p.get("csv"), "load": p.get("load_avg_1m")})
            cols = (p.get("summary") or {}).get("columns", {})
            for c in columns:
                per[tag][c].append((cols.get(c) or {}).get("p50"))
    a = {c: _median(per["A"][c]) for c in columns}
    b = {c: _median(per["B"][c]) for c in columns}
    delta, consistent = {}, {}
    for c in columns:
        if a[c] and b[c] is not None:
            delta[c] = round(100.0 * (b[c] - a[c]) / a[c], 2)
            signs = {(y - x) > 0 for x, y in zip(per["A"][c], per["B"][c]) if x is not None and y is not None and y != x}
            consistent[c] = len(signs) <= 1
    return {"a": a, "b": b, "delta_pct": delta, "consistent": consistent, "rounds": rounds,
            "per_round": per, "load_avg_1m": loads, "runs": runs, "scene_a": scene_a, "scene_b": scene_b}


def compare(before_csv, after_csv, columns=None, skip=10):
    """ut_stat.compare_frames on each column present in both CSVs:
    {column: {"before": {...}, "after": {...}, "mean_delta_ms", "p95_delta_ms", "mean_change_pct"}}.
    Negative deltas are improvements for times, counts and bytes alike."""
    out = {}
    for c in columns or COMPARE_COLUMNS:
        d = ut_stat.compare_frames(before_csv, after_csv, column=c, skip=skip)
        if "error" not in d:
            out[c] = d
    return out


def compare_line(cmp, columns=("cpu_frame_ms", "main_thread_ms", "draw_calls", "batches", "setpass_calls", "gc_alloc_bytes")):
    """One human line per comparison: 'cpu_frame_ms 12.1 -> 7.9 (-34.7%)'."""
    parts = []
    for c in columns:
        d = cmp.get(c)
        if not d:
            continue
        parts.append("%s %s -> %s (%s%%)" % (c, d["before"]["mean"], d["after"]["mean"], d["mean_change_pct"]))
    return "; ".join(parts)


# ============================================================================ player builds and runs
def build_player(project, out, scenes, development=True, backend=None, stripping=None, il2cpp_codegen=None,
                 frame_timing=True, target="macos", detailed=False, timeout=3600, env=None):
    """AgentKit.Performance.PerfBuild.Build in a process launched on the target platform:
      Unity -batchmode -nographics -quit -projectPath P -buildTarget StandaloneOSX
            -executeMethod AgentKit.Performance.PerfBuild.Build -agentJob <job>
    (`-buildTarget StandaloneOSX` is the BuildTarget enum name; it is what ran here in 6000.3.21f1.
    The 6.3 command-line page lists the short names, `osxuniversal` for macOS: both select the
    macOS player.) env: extra environment for the build process, for example
    {"AGENTKIT_SHADER_REPORT": "/abs/variants.json", "AGENTKIT_SHADER_STRIP_SVC": "Assets/.../x.shadervariants"}
    (PerfShaderVariantReport). Returns the envelope; envelope["result"] has the BuildReport
    summary, "breakdown" and "active_build_profile"."""
    cli_target, enum_name = ut_run.TARGETS.get(target, (target, target))
    args = {"target": enum_name, "out": out, "scenes": list(scenes), "development": development,
            "frame_timing": frame_timing, "detailed": detailed}
    if backend:
        args["backend"] = backend
    if stripping:
        args["stripping"] = stripping
    if il2cpp_codegen:
        args["il2cpp_codegen"] = il2cpp_codegen
    if env:
        e = dict(os.environ)
        e.update(env)
        env = e
    return ut_run.run_method(project, "AgentKit.Performance.PerfBuild.Build", args, timeout=timeout,
                             build_target=cli_target, env=env)


def player_binary(app):
    """<Game>.app -> <Game>.app/Contents/MacOS/<exe> (macOS players)."""
    macos = os.path.join(app, "Contents", "MacOS")
    exes = [f for f in os.listdir(macos) if not f.startswith(".")] if os.path.isdir(macos) else []
    if not exes:
        raise FileNotFoundError("no executable in %s" % macos)
    return os.path.join(macos, exes[0])


def _run(cmd, timeout, log):
    t0 = time.time()
    with open(log + ".stdout", "w") as out:
        p = subprocess.Popen(cmd, stdout=out, stderr=subprocess.STDOUT)
        timed_out = False
        try:
            code = p.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            p.send_signal(signal.SIGTERM)  # this PID only
            try:
                code = p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()
                code = p.wait()
    return code, round(time.time() - t0, 2), timed_out


def run_player(app, out_csv, frames=300, warmup=60, scene=None, offscreen="1920x1080", batchmode=True,
               target_fps=60.0, trace_gsc=None, warm_gsc=None, snapshot=None, profiler_raw=None,
               profiler_frames=None, shot=None, extra=None, timeout=300, markers=None, spike_at=None,
               spike_ms=100):
    """Launch a macOS player built with PerfProbe and read what it measured:
      <Game>.app/Contents/MacOS/<Game> -batchmode -logFile <log> -perfProbe <csv> -perfFrames N
            -perfWarmup W [-perfScene S] [-perfOffscreen WxH] [-perfTraceGsc f] [-perfWarmGsc f]
            [-perfSnapshot f] [-perfShot png] [-profiler-enable -profiler-log-file raw -profiler-capture-frame-count N]
    -batchmode: no window. A batch-mode player skips camera rendering (observed: 0 draw calls), so
    PerfProbe submits Camera.main to an offscreen target each frame; shot= saves the last frame
    (open it: a benchmark of a black frame measures nothing).
    markers=["Spawn.Burst", "Spawned Objects"]: your ProfilerMarkers / ProfilerCounterValues as CSV
    columns mk_<name>_ms, mk_<name>_calls or mk_<name> (keep them in the streaming and spawn code;
    read with attribute_spikes). spike_at=frame forces a spike_ms stall there (physics_catchup).
    Returns {"ok", "summary" (ut_stat.summarize_csv), "probe" (the JSON the player wrote: device,
    render_textures, physics), "seconds", "exit_code", "log", "csv"}."""
    exe = player_binary(app)
    out_csv = os.path.abspath(out_csv)
    os.makedirs(os.path.dirname(out_csv), exist_ok=True)
    log = os.path.splitext(out_csv)[0] + ".player.log"
    for stale in (out_csv, os.path.splitext(out_csv)[0] + ".json"):
        if os.path.exists(stale):
            os.rename(stale, stale + ".prev")
    cmd = [exe]
    if batchmode:
        cmd.append("-batchmode")
    cmd += ["-logFile", log, "-perfProbe", out_csv, "-perfFrames", str(frames), "-perfWarmup", str(warmup)]
    if scene:
        cmd += ["-perfScene", scene]
    if offscreen:
        cmd += ["-perfOffscreen", offscreen]
    if trace_gsc:
        cmd += ["-perfTraceGsc", os.path.abspath(trace_gsc)]
    if warm_gsc:
        cmd += ["-perfWarmGsc", os.path.abspath(warm_gsc)]
    if snapshot:
        cmd += ["-perfSnapshot", os.path.abspath(snapshot)]
    if shot:
        cmd += ["-perfShot", os.path.abspath(shot)]
    if profiler_raw:
        cmd += ["-profiler-enable", "-profiler-log-file", os.path.abspath(profiler_raw),
                "-profiler-capture-frame-count", str(profiler_frames or (frames + warmup))]
    if markers:
        cmd += ["-perfMarkers", ",".join(markers)]
    if spike_at is not None:
        cmd += ["-perfSpikeAt", str(spike_at), "-perfSpikeMs", str(spike_ms)]
    cmd += list(extra or [])
    code, secs, timed_out = _run(cmd, timeout, log)
    res = {"ok": False, "exit_code": code, "seconds": secs, "timed_out": timed_out, "log": log, "csv": out_csv, "cmd": cmd}
    js = os.path.splitext(out_csv)[0] + ".json"
    if os.path.isfile(js):
        with open(js) as f:
            res["probe"] = json.load(f)
    if os.path.isfile(out_csv):
        res["summary"] = ut_stat.summarize_csv(out_csv, target_ms=round(1000.0 / target_fps, 3), skip=0)
        res["ok"] = not timed_out and res["summary"]["frames"] > 0
    else:
        res["error"] = "no CSV written (probe inactive? player crashed? see %s)" % log
    return res


def capture_player(app, raw, frames=300, warmup=30, scene=None, timeout=300, **kw):
    """Player run with a Profiler capture streamed to a .raw file (development builds only):
    -profiler-enable -profiler-log-file <raw> -profiler-capture-frame-count <N> (6.3 Manual,
    Profiler command line arguments). Returns run_player(...) plus "raw"."""
    csv = os.path.splitext(os.path.abspath(raw))[0] + ".probe.csv"
    r = run_player(app, csv, frames=frames, warmup=warmup, scene=scene, profiler_raw=raw,
                   profiler_frames=frames + warmup, timeout=timeout, **kw)
    r["raw"] = os.path.abspath(raw)
    r["raw_exists"] = os.path.isfile(r["raw"])
    r["raw_mb"] = round(os.path.getsize(r["raw"]) / 1048576.0, 2) if r["raw_exists"] else 0
    return r


def analyze_capture(project, raw, skip=5, top=12, markers=None, timeout=900):
    """AgentKit.Performance.PerfCapture.Analyze on a .raw/.data capture (ProfilerDriver.LoadProfile +
    RawFrameDataView): frame stats with FPS waits removed, bound per frame, GC.Alloc vs GC.Collect,
    longest-vs-median markers. Runs with -nographics (reading a capture renders nothing)."""
    return ut_run.run_method(project, "AgentKit.Performance.PerfCapture.Analyze",
                             {"capture": raw, "skip": skip, "top": top, "markers": list(markers or [])},
                             timeout=timeout)


def player_bound(run):
    """Bound verdict from a player run (FrameTimingManager columns cpu_main_frame_ms vs gpu_frame_ms).
    A batch-mode player never presents, so GPU time arrives on a handful of frames only (observed:
    10 of 300): then the verdict is "unknown" with that count; use a windowed run for GPU time."""
    cols = run.get("summary", {}).get("columns", {})
    s = {"columns": {"cpu_frame_ms": cols.get("cpu_main_frame_ms") or cols.get("cpu_frame_ms") or {},
                     "gpu_frame_ms": cols.get("gpu_frame_ms") or {}}}
    v = ut_stat.bound_by(s)
    if v.get("bound") == "unknown" and run.get("csv") and os.path.isfile(run["csv"]):
        g = ut_stat.read_frame_csv(run["csv"]).get("gpu_frame_ms") or []
        nz = sum(1 for x in g if x)
        v["gpu_frames_reported"] = "%d of %d" % (nz, len(g))
        if (run.get("probe") or {}).get("batchmode"):
            v["reason"] = "batch-mode player: no present, GPU time on %d of %d frames; measure GPU in a windowed player" % (nz, len(g))
    return v


# ============================================================================ v0.2 checks (2026-09-24 refactor)
def _col(csv_or_cols, name):
    cols = ut_stat.read_frame_csv(csv_or_cols) if isinstance(csv_or_cols, str) else csv_or_cols
    return cols.get(name) or []


def attribute_spikes(csv, factor=2.0, columns=None, top=5, frame_col=None):
    """Frames over factor x median frame_ms, each with the costs that explain it: your markers
    (mk_*_ms), GC.Collect, shader compiles, PSO creates, MeshCollider cooking, synchronous
    ReadObject, physics steps. The Profile Analyzer longest-vs-median idea on a player CSV, and
    the reason to keep ProfilerMarkers on streaming and spawn systems (Peter Hall _cV1B2hqXGI
    [00:18:39] to [00:19:12]; 6.3 Manual, Adding profiler markers and counters).
    Spikes are found on main_thread_ms (a recorder column, same row as the markers) when present:
    FrameTimingManager columns lag a few frames (4 observed), and wall-clock frame_ms was one row late
    before PerfProbe v0.2 aligned it (observed: the 57 ms burst frame showed on the next row).
    Returns {"median_ms", "spikes": [{"frame", "frame_ms", "explained": {col: value}}], "unexplained"}."""
    cols = ut_stat.read_frame_csv(csv)
    frame_col = frame_col or ("main_thread_ms" if cols.get("main_thread_ms") else "frame_ms")
    fr = cols.get(frame_col) or []
    if not fr:
        return {"error": "no %s column" % frame_col}
    med = ut_stat.stats(fr)["p50"]
    cand = list(columns or [c for c in cols if c.startswith("mk_") and (c.endswith("_ms") or c.endswith("_calls"))
                            or c in ("gc_collect_ms", "shader_compiles", "pso_creates", "mesh_cook_ms",
                                     "sync_read_object_ms", "physics_steps")])
    base = {c: ut_stat.stats(cols[c])["p50"] or 0 for c in cand if cols.get(c)}
    spikes, unexplained = [], 0
    for i, x in enumerate(fr):
        if x <= factor * med:
            continue
        exp = {}
        for c in cand:
            v = (cols.get(c) or [0] * len(fr))[i] if i < len(cols.get(c) or []) else 0
            if v and v > base.get(c, 0):
                exp[c] = v
        exp = dict(sorted(exp.items(), key=lambda kv: -kv[1])[:top])
        if not exp:
            unexplained += 1
        spikes.append({"frame": i, "frame_ms": x, "explained": exp})
    return {"frame_col": frame_col, "median_ms": med, "threshold_ms": round(factor * med, 3), "spikes": spikes,
            "unexplained": unexplained}


def physics_catchup(csv, spike_at=None):
    """Physics.Simulate steps per frame (column physics_steps). Normal play runs at most one
    step per frame at 60 fps with the default 0.02 s fixed step; a spike makes the next frames run
    several steps, which lengthens them: the spiral of death that Maximum Allowed Timestep caps
    (console/PC e-book p. 110 to 111; xjsqv8nj0cw [00:10:23]). Returns the step distribution, the
    frames over one step, and the steps in the frame after `spike_at`."""
    steps = _col(csv, "physics_steps")
    fr = _col(csv, "frame_ms")
    if not steps:
        return {"error": "no physics_steps column (PerfProbe v0.2 records Physics.Simulate)"}
    hist = {}
    for s in steps:
        hist[int(s)] = hist.get(int(s), 0) + 1
    over = [i for i, s in enumerate(steps) if s > 1]
    out = {"steps_histogram": dict(sorted(hist.items())), "frames_over_one_step": len(over),
           "max_steps": max(steps), "first_frames_over": over[:10]}
    if spike_at is not None and spike_at + 1 < len(steps):
        out["spike_frame_ms"] = fr[spike_at + 1] if spike_at + 1 < len(fr) else None
        out["steps_after_spike"] = [int(s) for s in steps[spike_at + 1:spike_at + 4]]
    out["verdict"] = "pass" if (spike_at is None and len(over) == 0) or (spike_at is not None and len([i for i in over if i > spike_at + 3]) == 0) else "fail"
    return out


def density_check(csv, width=1920, height=1080, max_tris_per_pixel=1.0, passes=1):
    """Triangles per rendered pixel from the Triangles Count column. Above about one triangle per
    pixel, triangles are pixel-sized: GPUs shade 2x2 quads, so a one-pixel triangle costs four pixel
    shader invocations, and LOD cuts pixel cost more than vertex cost (Borromeo CmD8MVGkDxQ
    [00:26:52] to [00:28:31]; console/PC e-book p. 29: "polygon density", not count). The 1.0
    threshold is this skill's [added] gate, not an expert number. Triangles Count sums every pass
    (main, shadow casters, depth or depth-normals prepasses): observed 4.56 M for 3,000 visible
    768-triangle spheres (about 2 passes), so pass `passes` to normalise, or compare before/after."""
    tri = _col(csv, "triangles")
    if not tri:
        return {"error": "no triangles column"}
    p50 = ut_stat.stats(tri)["p50"]
    ratio = p50 / float(passes) / float(width * height)
    return {"triangles_p50": p50, "passes": passes, "pixels": width * height, "tris_per_pixel": round(ratio, 3),
            "verdict": "pass" if ratio <= max_tris_per_pixel else "fail",
            "fix": None if ratio <= max_tris_per_pixel else "Mesh LOD or LOD Groups on dense meshes seen small; check quad overdraw on device"}


def memory_budget(run, ram_mb=None, fraction=0.7, vram_mb=None):
    """Resident memory against the device: System Used Memory p95 (close to resident on macOS)
    under `fraction` of RAM (0.7 general: Unity tutorial Uuzd39AjFWQ [00:03:46]; 0.5 on 2 GB
    phones: Hall _cV1B2hqXGI [00:28:34]; 0.8 dedicated devices: profiling e-book p. 41), Gfx Used
    Memory against VRAM where the GPU has its own (a discrete laptop GPU that overflows VRAM pages
    over the bus: a stutter source), and the largest RenderTextures (Hall [00:34:02]).
    ram_mb / vram_mb default to the device the player ran on (probe JSON "device")."""
    probe = run.get("probe") or {}
    dev = probe.get("device") or {}
    ram = ram_mb or dev.get("ram_mb")
    vram = vram_mb if vram_mb is not None else dev.get("vram_mb")
    cols = (run.get("summary") or {}).get("columns", {})
    used = (cols.get("system_used_mb") or {}).get("p95")
    gfx = (cols.get("gfx_used_mb") or {}).get("p95")
    out = {"ram_mb": ram, "budget_mb": round(ram * fraction, 1) if ram else None, "fraction": fraction,
           "system_used_mb_p95": used, "gfx_used_mb_p95": gfx, "vram_mb": vram,
           "render_textures": probe.get("render_textures"), "gpu": dev.get("gpu")}
    if ram and used is not None:
        out["resident_share"] = round(used / float(ram), 3)
        out["verdict"] = "pass" if used <= ram * fraction else "fail"
    if vram and gfx is not None:
        out["vram_share"] = round(gfx / float(vram), 3)
    return out


def frame_debug(project, scene, warmup=30, details=12, width=1280, height=720, timeout=900):
    """AgentKit.Performance.PerfFrameDebug.Capture: Editor Play mode, Frame Debugger through its
    internal utility, draws named "Hybrid Batch Group" (the GPU Resident Drawer) vs the others and
    the objects behind them, runtime MaterialPropertyBlocks, batch-break causes for `details` draws.
    Observed in 6000.3.21f1: the Frame Debugger is not supported in a batch editor (locallySupported
    false); the result then carries "runtime_eligibility" (GRD eligibility per renderer after Start(),
    which sees MaterialPropertyBlocks set by scripts) and "frame_debugger": "not supported ...".
    The event list itself needs a GUI editor (window, or this job through ut_live)."""
    return ut_run.run_method(project, "AgentKit.Performance.PerfFrameDebug.Capture",
                             {"scene": scene, "warmup": warmup, "details": details, "width": width, "height": height},
                             quit=False, graphics=True, timeout=timeout)


def project_auditor(project, categories=None, out=None, timeout=1800):
    """Project Auditor 1.0.2 headless (PerfAudit.ProjectAuditor). Package in 6.3, built in from 6.4."""
    args = {"categories": list(categories or [])}
    if out:
        args["out"] = out
    return ut_run.run_method(project, "AgentKit.Performance.PerfAudit.ProjectAuditor", args, timeout=timeout)


def triage_auditor(result, project):
    """Code Monkey's rule made mechanical (2gP-2rQ3o_Q [00:04:34]): a Project Auditor code issue
    matters when the line runs every frame. Marks each Major/Critical code issue "hot" when its line
    falls inside Update/LateUpdate/FixedUpdate/OnGUI/On*Stay (the lint's per-frame ranges); issues in
    Packages/ are counted apart (not yours to fix; the 1.0.2 report includes package code)."""
    root = ut_env.find_project(project)["root"] if project else ""
    cache = {}
    rows = []
    for it in (result.get("major_or_critical") or []):
        hot = None
        path, line = it.get("path"), it.get("line") or 0
        if it.get("category") == "Code" and path and line:
            p = path if os.path.isabs(path) else os.path.join(root, path)
            if p not in cache and os.path.isfile(p):
                with open(p, errors="replace") as f:
                    code = _strip_comments(f.read())
                cache[p] = (code, _hot_ranges(code))
            if p in cache:
                code, ranges = cache[p]
                hot = any(code.count("\n", 0, a) + 1 <= line <= code.count("\n", 0, b) + 1 for _m, a, b in ranges)
        rows.append(dict(it, hot=hot, in_packages=str(path or "").startswith("Packages/")))
    mine = [r for r in rows if not r["in_packages"]]
    return {"issues": rows, "hot": [r for r in mine if r["hot"]], "cold": [r for r in mine if r["hot"] is False],
            "in_packages": len(rows) - len(mine)}


_GROUP_NAME = re.compile(r"^\s*m_GroupName:\s*(.+?)\s*$", re.M)
_ENTRY_GUID = re.compile(r"^\s*-?\s*m_GUID:\s*([0-9a-f]{32})\s*$", re.M)


def addressables_groups(project):
    """Addressables groups read from their YAML (Assets/AddressableAssetsData/AssetGroups/*.asset:
    m_GroupName and each entry's m_GUID), GUIDs mapped to paths through .meta files. Offline, no
    package needed; feed the result to bundle_duplicates. Returns {group: [asset paths]}."""
    root = ut_env.find_project(project)["root"] if not os.path.isdir(os.path.join(project, "Assets", "AddressableAssetsData")) else project
    gdir = os.path.join(root, "Assets", "AddressableAssetsData", "AssetGroups")
    if not os.path.isdir(gdir):
        return {}
    guid_to_path = {}
    for dp, _dn, fns in os.walk(os.path.join(root, "Assets")):
        for fn in fns:
            if fn.endswith(".meta"):
                with open(os.path.join(dp, fn), errors="replace") as f:
                    m = re.search(r"^guid:\s*([0-9a-f]{32})", f.read(), re.M)
                if m:
                    guid_to_path[m.group(1)] = os.path.relpath(os.path.join(dp, fn[:-5]), root).replace(os.sep, "/")
    groups = {}
    for fn in sorted(os.listdir(gdir)):
        if not fn.endswith(".asset"):
            continue
        with open(os.path.join(gdir, fn), errors="replace") as f:
            txt = f.read()
        m = _GROUP_NAME.search(txt)
        name = m.group(1) if m else fn[:-6]
        sect = txt.split("m_SerializeEntries:", 1)
        body = sect[1].split("m_ReadOnly:", 1)[0] if len(sect) > 1 else ""
        groups[name] = [guid_to_path.get(g, g) for g in _ENTRY_GUID.findall(body)]
    return groups


def bundle_duplicates(project, groups=None, scenes=None, timeout=900):
    """PerfAudit.BundleDuplicates: dependencies pulled into 2+ bundles or groups (a copy in each),
    player scenes that also ship a bundled asset, bundled assets under Resources/ (Borromeo
    CmD8MVGkDxQ [00:42:21] to [00:46:15]). groups=None uses the project's AssetBundle names;
    for Addressables pass addressables_groups(project)."""
    args = {}
    if groups:
        args["groups"] = groups
    if scenes:
        args["scenes"] = list(scenes)
    return ut_run.run_method(project, "AgentKit.Performance.PerfAudit.BundleDuplicates", args, timeout=timeout)


def metal_trace(app, out_trace, seconds=10, **run_kw):
    """Native GPU timing on macOS without a window or Xcode UI: record an Instruments "Metal System
    Trace" of the benchmark player (PerfProbe arguments as in run_player), headless:
      xcrun xctrace record --template 'Metal System Trace' --time-limit <s>s --output <trace> --launch -- <player> <args>
    The Frame Debugger has no timings; GPU-bound frames need the platform's GPU profiler (Peter
    Hall _cV1B2hqXGI [frame 00:09:18]; console e-book p. 76). Returns {"ok", "trace", "csv", "cmd"}.
    Read it with metal_gpu_frames. Windows equivalents: PIX, Nsight, RenderDoc (GUI tools)."""
    exe = player_binary(app)
    out_trace = os.path.abspath(out_trace)
    os.makedirs(os.path.dirname(out_trace), exist_ok=True)
    # xctrace refuses an existing output and a stale export would be re-read: move both aside (never delete)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    for old in (out_trace, os.path.splitext(out_trace)[0] + ".gpu_intervals.xml"):
        if os.path.exists(old):
            os.rename(old, old + ".prev-" + stamp)
    csv = os.path.splitext(out_trace)[0] + ".csv"
    args = ["-batchmode", "-logFile", os.path.splitext(out_trace)[0] + ".player.log", "-perfProbe", csv,
            "-perfFrames", str(run_kw.get("frames", 200)), "-perfWarmup", str(run_kw.get("warmup", 30))]
    if run_kw.get("scene"):
        args += ["-perfScene", run_kw["scene"]]
    args += list(run_kw.get("extra") or [])
    cmd = ["xcrun", "xctrace", "record", "--template", "Metal System Trace", "--time-limit", "%ds" % seconds,
           "--output", out_trace, "--launch", "--", exe] + args
    code, secs, timed_out = _run(cmd, seconds + 120, os.path.splitext(out_trace)[0] + ".xctrace")
    return {"ok": os.path.isdir(out_trace) and not timed_out, "trace": out_trace, "csv": csv, "cmd": cmd,
            "exit_code": code, "seconds": secs}


def metal_gpu_frames(trace, process=None, skip=10):
    """GPU busy time per frame of one process from a Metal System Trace (table metal-gpu-intervals:
    Vertex, Fragment, Compute intervals; the union per frame is the GPU busy time, so overlapping
    vertex and fragment work is not counted twice). process: name prefix, default the traced player
    (the trace also holds WindowServer and every other GPU client on the machine).
    Returns {"frames", "gpu_busy_ms": stats, "by_channel_ms": mean per frame, "passes_ms_per_frame":
    GPU time per labelled command buffer / pass (the Rendering Debugger's per-pass table, headless)}."""
    import xml.etree.ElementTree as ET
    xml = os.path.splitext(trace)[0] + ".gpu_intervals.xml"
    if not os.path.isfile(xml):
        with open(xml, "w") as f:
            subprocess.run(["xcrun", "xctrace", "export", "--input", trace, "--xpath",
                            '/trace-toc/run[@number="1"]/data/table[@schema="metal-gpu-intervals"]'],
                           stdout=f, stderr=subprocess.STDOUT, timeout=600)
    node = ET.parse(xml).getroot().find("node")
    cols = [c.find("mnemonic").text for c in node.find("schema").findall("col")]
    ids = {}

    def val(e):
        r = e.get("ref")
        if r is not None:
            return ids.get(r, (None, None))
        v = (e.get("fmt"), e.text)
        for sub in e.iter():
            if sub.get("id") and sub.get("id") not in ids:
                ids[sub.get("id")] = (sub.get("fmt"), sub.text)
        return v

    per_frame, _chan, labels, procs = {}, {}, {}, {}
    for row in node.findall("row"):
        d = dict(zip(cols, [val(e) for e in list(row)]))
        pname = (d.get("process") or (None, None))[0] or ""
        procs[pname] = procs.get(pname, 0) + 1
        rows_proc = pname
        if process and not pname.startswith(process):
            continue
        per_frame.setdefault(rows_proc, {})
        try:
            start, dur = int(d["start"][1]), int(d["duration"][1])
            frame = int(d["frame-number"][1])
        except (TypeError, ValueError, KeyError):
            continue
        c = (d.get("channel-name") or (None, None))[0] or "?"
        per_frame[rows_proc].setdefault(frame, []).append((start, start + dur, c))
        lab = ((d.get("event-label") or (None, None))[0] or "").split("(")[0].strip()
        lab = lab.split(":", 1)[-1].strip() or "(unlabelled)"
        labels.setdefault(rows_proc, {})
        labels[rows_proc][lab] = labels[rows_proc].get(lab, 0) + dur
    if not process:
        # default: the busiest non-system process (the player)
        cand = [p for p in per_frame if not p.startswith(("WindowServer", "Terminal", "Unity (", "Blender"))]
        process_key = max(cand, key=lambda p: len(per_frame[p])) if cand else None
    else:
        process_key = next(iter(per_frame), None)
    frames = per_frame.get(process_key, {})
    busy, by_ch = [], {}
    for fnum in sorted(frames)[skip:]:
        iv = sorted(frames[fnum])
        total, cur_s, cur_e = 0, None, None
        for s0, e0, c in iv:
            by_ch.setdefault(c, []).append((e0 - s0) / 1e6)
            if cur_e is None or s0 > cur_e:
                if cur_e is not None:
                    total += cur_e - cur_s
                cur_s, cur_e = s0, e0
            else:
                cur_e = max(cur_e, e0)
        if cur_e is not None:
            total += cur_e - cur_s
        busy.append(total / 1e6)
    n = max(1, len(busy))
    return {"process": process_key, "frames": len(busy), "gpu_busy_ms": ut_stat.stats(busy) if busy else {},
            "by_channel_ms": {c: round(sum(v) / n, 3) for c, v in by_ch.items()},
            "passes_ms_per_frame": [(k, round(v / 1e6 / max(1, len(frames)), 3)) for k, v in
                                    sorted((labels.get(process_key) or {}).items(), key=lambda kv: -kv[1])[:8]],
            "processes_in_trace": procs}


def read_variant_report(path):
    """The JSON PerfShaderVariantReport writes at the end of a build (AGENTKIT_SHADER_REPORT)."""
    with open(path) as f:
        return json.load(f)


# ============================================================================ build size
_CAT = re.compile(r"^(Textures|Meshes|Animations|Sounds|Shaders|Other Assets|Levels|Scripts|Included DLLs|File headers|"
                  r"Total User Assets|Complete build size)\s+([\d.]+)\s*(kb|mb|gb)\s*(?:\t|\s)*([\d.]+%)?", re.M | re.I)


def parse_log_build_report(text):
    """The 'Build Report' block Unity writes to the Editor log after a player build
    ("Uncompressed usage by category"): {"categories": {name: mb}, "top_assets": [(mb, pct, path)]}.
    Returns the LAST report in the log."""
    i = text.rfind("Build Report")
    if i < 0:
        return {"categories": {}, "top_assets": []}
    block = text[i:i + 40000]
    cats = {}
    for m in _CAT.finditer(block):
        v = float(m.group(2))
        unit = m.group(3).lower()
        mb = v / 1024.0 if unit == "kb" else (v * 1024.0 if unit == "gb" else v)
        cats[m.group(1)] = round(mb, 3)
    top = []
    for m in re.finditer(r"^\s*([\d.]+)\s*(kb|mb)\s+([\d.]+)%\s+(.+)$", block, re.M):
        mb = float(m.group(1)) / (1024.0 if m.group(2) == "kb" else 1.0)
        top.append((round(mb, 3), float(m.group(3)), m.group(4).strip()))
        if len(top) >= 20:
            break
    return {"categories": cats, "top_assets": top}


def app_breakdown(path, top=10):
    """Largest files of a built player on disk (a .app bundle or an output folder): where the
    shipped bytes are (GameAssembly vs UnityPlayer vs data). Returns {"total_mb", "top": [(mb, rel)]}."""
    files = []
    for dp, _dn, fns in os.walk(path):
        for fn in fns:
            p = os.path.join(dp, fn)
            if not os.path.islink(p):
                files.append((os.path.getsize(p), os.path.relpath(p, path)))
    files.sort(reverse=True)
    return {"total_mb": round(sum(f[0] for f in files) / 1048576.0, 3),
            "top": [(round(sz / 1048576.0, 3), rel) for sz, rel in files[:top]]}


def size_table(breakdown, key="by_category"):
    """Markdown table from PerfBuild's breakdown dict."""
    rows = breakdown.get(key) or []
    lines = ["| %s | MB |" % key.replace("_", " "), "|---|---:|"]
    lines += ["| %s | %.3f |" % (r["name"], r["mb"]) for r in rows]
    return "\n".join(lines)


# ============================================================================ static lint
HOT_METHODS = ("Update", "LateUpdate", "FixedUpdate", "OnGUI", "OnTriggerStay", "OnCollisionStay", "OnRenderObject")
_METHOD = re.compile(r"\bvoid\s+(%s)\s*\(\s*\)\s*(\{)?" % "|".join(HOT_METHODS))
HOT_RULES = [
    ("error", "perf.alloc.collection", r"\bnew\s+(List|Dictionary|HashSet|Queue|Stack)<", "new collection every frame", "member field + Clear(), or CollectionPool/ListPool"),
    ("error", "perf.alloc.linq", r"\.(Where|Select|Any|Count|OrderBy|ToList|ToArray|First|Sum)\s*\(", "LINQ in a per-frame method (enumerators, closures)", "plain loop"),
    ("warn", "perf.alloc.string", r"(\"\s*\+|\+\s*\"|\$\"|string\.Format\(|\.ToString\(\))", "string building every frame", "update text only on change; StringBuilder; TMP SetText"),
    ("warn", "perf.alloc.array_api", r"\.(vertices|normals|uv|triangles|touches|sharedMaterials|materials)\b", "array-valued Unity API: a new copy per access", "Mesh.GetVertices(list), Input.GetTouch(i), Renderer.GetSharedMaterials(list)"),
    ("error", "perf.find", r"\b(FindObjectsByType|FindFirstObjectByType|FindAnyObjectByType|FindObjectOfType|FindObjectsOfType|GameObject\.Find|FindGameObjectsWithTag)\b", "scene-wide search every frame (4,300 calls = 18 s, Tarodev)", "cache in Awake or keep a registry"),
    ("warn", "perf.getcomponent", r"\bGetComponents?(InChildren|InParent)?<", "GetComponent every frame (allocates in the Editor only; still a lookup)", "cache the reference"),
    ("warn", "perf.log", r"\bDebug\.Log(Warning|Error)?\s*\(", "Debug.Log every frame (48.55 ms of an 80 ms dev-build frame in Unity's walkthrough, xjsqv8nj0cw [00:10:23])", "[Conditional(\"ENABLE_LOG\")] wrapper; release stack traces None (console e-book p. 41-42)"),
    ("error", "perf.physics_alloc", r"\b(RaycastAll|SphereCastAll|CapsuleCastAll|BoxCastAll|OverlapSphere|OverlapBox|OverlapCapsule)\s*\(", "allocating physics query", "NonAlloc variant with a reused buffer (2D: List/ContactFilter2D overloads)"),
    ("warn", "perf.instantiate", r"\b(Instantiate|Destroy)\s*\(", "Instantiate/Destroy in per-frame code (Instantiate always allocates)", "ObjectPool<T> with prewarm"),
    ("warn", "perf.material_clone", r"\.material\b(?!s)", "Renderer.material clones the material (breaks batching)", "sharedMaterial or Material Variants"),
    ("info", "perf.sendmessage", r"\bSendMessage\s*\(", "SendMessage (2x slower than a direct call)", "typed reference or event"),
    ("warn", "perf.animator_string", r"\.(SetFloat|SetBool|SetInteger|SetTrigger)\s*\(\s*\"", "string-keyed Animator/Material setter", "Animator.StringToHash / Shader.PropertyToID once"),
]
ANY_RULES = [
    ("warn", "perf.mpb", r"\bMaterialPropertyBlock\b|\bSetPropertyBlock\s*\(", "MaterialPropertyBlock: breaks SRP Batcher and GPU Resident Drawer compatibility in URP", "Material Variants; per-renderer value unity_RendererUserValue (6.3) with GRD"),
    ("warn", "perf.instancing_flag", r"\benableInstancing\s*=\s*true", "material GPU Instancing on in URP/HDRP: extra variants", "leave it off; SRP Batcher + GRD"),
    ("warn", "perf.reflection", r"\b(Assembly\.GetTypes|GetTypes\(\)|AppDomain\.CurrentDomain\.GetAssemblies)\b", "runtime assembly scan: cached forever, rescanned by the GC", "scan in the Editor, serialize a ScriptableObject or generate code"),
    ("warn", "perf.sync_load", r"\b(Resources\.Load\s*\(|SceneManager\.LoadScene\s*\()", "synchronous load: SerializedFile::ReadObject on the main thread (a hitch)", "LoadSceneAsync / Addressables async, preload behind a transition"),
    ("info", "perf.unload_gc", r"\b(Resources\.UnloadUnusedAssets|GC\.Collect)\s*\(", "full GC / Asset GC call: seconds in large projects", "only behind loading screens or menus"),
    ("info", "perf.waitforseconds", r"new\s+WaitForSeconds\s*\(", "new WaitForSeconds per yield allocates", "cache the instance"),
    ("info", "perf.meshcollider_runtime", r"AddComponent\s*<\s*MeshCollider\s*>", "MeshCollider added at runtime: the collision mesh cooks on the main thread (marker Physics.BakePhysXCollisionMeshData)", "Physics.BakeMesh(mesh.GetEntityId(), convex) in a job during loading (6.3: the int overload is obsolete), or Prebake Collision Meshes for imported meshes"),
]


def _strip_comments(src):
    src = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def _hot_ranges(src):
    """(method, start, end) character ranges of per-frame method bodies (brace matching)."""
    out = []
    for m in _METHOD.finditer(src):
        j = src.find("{", m.end() - 1)
        if j < 0:
            continue
        depth, k = 0, j
        while k < len(src):
            if src[k] == "{":
                depth += 1
            elif src[k] == "}":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        out.append((m.group(1), j, k))
    return out


def lint_source(src, path="<src>"):
    """Findings for one C# source text (core findings format)."""
    code = _strip_comments(src)
    findings = []

    def line_of(i):
        return code.count("\n", 0, i) + 1

    for method, a, b in _hot_ranges(code):
        body = code[a:b]
        if not re.search(r"[^\s{}]", body):
            findings.append({"severity": "info", "code": "perf.empty_update", "path": "%s:%d" % (path, line_of(a)),
                             "message": "empty %s: still a native-to-managed call per object per frame" % method,
                             "fix": "delete it"})
            continue
        for sev, rule, rx, msg, fix in HOT_RULES:
            for m in re.finditer(rx, body):
                findings.append({"severity": sev, "code": rule, "path": "%s:%d" % (path, line_of(a + m.start())),
                                 "message": "%s (in %s)" % (msg, method), "fix": fix})
    for sev, rule, rx, msg, fix in ANY_RULES:
        for m in re.finditer(rx, code):
            findings.append({"severity": sev, "code": rule, "path": "%s:%d" % (path, line_of(m.start())),
                             "message": msg, "fix": fix})
    return findings


def lint_scripts(folder, exclude=("/Editor/", "/Tests/", "/AgentKit", "/PackageCache/")):
    """Static scan of runtime C# under folder: allocation and batching smells in per-frame methods.
    Triage by call frequency, as Code Monkey does with Project Auditor (2gP-2rQ3o_Q [00:04:34]):
    a finding in code that runs once is not a problem. Returns {"files", "findings", "counts"}."""
    findings, files = [], 0
    for dp, _dn, fns in os.walk(folder):
        norm = dp.replace("\\", "/") + "/"
        if any(e in norm for e in exclude):
            continue
        for fn in fns:
            if not fn.endswith(".cs"):
                continue
            p = os.path.join(dp, fn)
            files += 1
            with open(p, errors="replace") as f:
                findings += lint_source(f.read(), os.path.relpath(p, folder))
    counts = {s: sum(1 for x in findings if x["severity"] == s) for s in ("error", "warn", "info")}
    return {"files": files, "findings": findings, "counts": counts}


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-unity-performance helpers")
    sub = ap.add_subparsers(dest="cmd")
    a1 = sub.add_parser("lint"); a1.add_argument("folder")
    a2 = sub.add_parser("compare"); a2.add_argument("before"); a2.add_argument("after")
    a3 = sub.add_parser("summary"); a3.add_argument("csv"); a3.add_argument("--fps", type=float, default=60.0)
    a = ap.parse_args()
    if a.cmd == "lint":
        print(json.dumps(lint_scripts(a.folder), indent=2))
    elif a.cmd == "compare":
        c = compare(a.before, a.after)
        print(compare_line(c))
        print(json.dumps(c, indent=2))
    elif a.cmd == "summary":
        print(json.dumps(ut_stat.summarize_csv(a.csv, target_ms=round(1000.0 / a.fps, 3)), indent=2))
    else:
        ap.print_help()
