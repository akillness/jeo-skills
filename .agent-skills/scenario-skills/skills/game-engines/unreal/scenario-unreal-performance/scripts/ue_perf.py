#!/usr/bin/env python3
"""
ue_perf: the scenario-unreal-performance skill's toolkit (UE 5.8, agent on macOS Apple Silicon).

STATUS: not yet run in Unreal (UE 5.8 not installed on this Mac on 2026-09-24).
The pure layers (A plans and A/B plans, B frames and diagnosis, C trace analysis, C2
suspect trees, D log parsers, E config writers, F proof) ran offline with system python3 on synthetic captures in
tests/code/unreal-performance/test_ue_perf_offline.py. Layer G (in-editor, needs the
`unreal` module) is untested; every UE name in it is [verify].

Shared toolkit (<skills>/scenario-unreal-expert/scripts, owned by the lead): ue_stat parses stat unit
logs, CSV profiler files and TraceQuery JSONL and owns budget_check(frames, target_ms);
ue_review takes screenshots and runs image_checks; ue_audit audits assets; ue_run runs
headless jobs; ue_remote reaches a running editor; ue_env finds the engine (its dict has
"trace_query" and "insights" paths). ue_perf never re-parses a UE file format when ue_stat
can: `load_frames()` and `load_trace()` go through ue_stat first and only fall back to a
generic CSV/JSON reader plus key aliases (documented below) so the offline tests run.

Normalized shapes used everywhere here:
  frame  = {"index": int|None, "frame": ms, "game": ms, "draw": ms, "gpu": ms, "rhit": ms,
            "dynres": percent}          (any key may be None)
  timer  = {"name", "thread", "kind", "frame", "start" s, "end" s, "ms", "depth", "excl"}
  run    = {"label", "frames": [frame...], "hygiene": {...}, "snapshots": int|None}

Library use (python3, agent side):
  import ue_perf as P
  P.budget_table("console", 60)                 # per-thread and sourced feature budgets
  P.capture_plan("gpu", platform="console", build="Test", tracefile="/abs/gpu.utrace")
  d = P.diagnose_bound(P.load_frames("/abs/unit.csv"), target_ms=16.67)
  t = P.analyze_trace(P.load_trace("/abs/trace.jsonl"), target_ms=16.67)
  g = P.gpu_pass_table(open("/abs/Game.log").read())
  c = P.compare_runs(before_runs, after_runs, target_ms=16.67)
  P.write_proof_report(c, "/abs/out", changes=P.ChangeLog("/abs/changes.jsonl").entries())
  P.feature_budget_check({"lumen_delta_ms": 6.1, "rt_active_instances": 140000}, fps=60)
  P.nanite_triage({...}); P.vsm_triage({...})      # the suspect trees as ordered next steps
  P.ab_plan(P.ASYNC_AB_VARIANTS); P.ab_verdict({"baseline": 17.9, ...}, spread_ms=0.3)
  P.camera_cut_spikes(frames, cut_frames=[412]); P.spawn_bursts(trace)
  P.apply_ini_keys("/abs/Config/DefaultEngine.ini", P.day_one_engine_ini(), backup_dir=...)

Shell:
  python3 ue_perf.py budgets --platform console --fps 60
  python3 ue_perf.py plan --purpose hitch --platform mac --build Test --tracefile /abs/h.utrace
  python3 ue_perf.py diagnose --frames unit.csv [--target 16.67] [--vsync]
  python3 ue_perf.py trace --jsonl trace.jsonl [--target 16.67] [--out dir]
  python3 ue_perf.py schema --jsonl trace.jsonl
  python3 ue_perf.py gpu --log Game.log
  python3 ue_perf.py resolution --output 2160 --secondary 1440 --min 800 --max 1080
  python3 ue_perf.py report --before b1.csv b2.csv --after a1.csv a2.csv --out dir
  python3 ue_perf.py check --measured measured.json [--fps 60]
      (measured.json: {"features": {...}, "nanite": {...}, "vsm": {...}})
Exit codes: 0 ok, 1 usage or input error, 2 analysis done but a gate failed.

Source codes used in comments (full list in references/sources.md): OZ26 Oztalay 2026,
OZ24 Oztalay 2024, W4R Witcher 4 road to 60, W4S Witcher 4 streaming, NORSE Arnbjornsson and
Oztalay 2025, HITCH Arnbjornsson hitch hunt 2025, ARI22 Arnbjornsson 2022, KEN Kuwano 2025,
FFW Looman Far Far West, TL Looman articles, NIA Kiraly 2025, MOB Epic mobile tools 2026,
PSO Epic PSO blog and docs, SCAL scalability docs, LVP Lumen and VSM performance doc,
INS Insights docs, STAT stat docs, PKG packaging docs, AVW Avowed GPU retrospective (Campbell),
ARG Argyriou lighting at scale. [added] = this skill's own addition.
"""

from __future__ import annotations

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24; includes the refactor pass)

import bisect
import csv
import datetime
import importlib
import io
import json
import math
import os
import re
import shlex
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_LEAD_SCRIPTS = os.path.normpath(os.path.join(HERE, "..", "..", "scenario-unreal-expert", "scripts"))


# =========================================================================== toolkit
def toolkit(name):
    """Import a shared toolkit module (ue_stat, ue_review, ue_audit, ue_run, ue_remote,
    ue_env) from <skills>/scenario-unreal-expert/scripts; None when it is not there yet."""
    if _LEAD_SCRIPTS not in sys.path and os.path.isdir(_LEAD_SCRIPTS):
        sys.path.insert(0, _LEAD_SCRIPTS)
    try:
        return importlib.import_module(name)
    except Exception:  # ImportError, or a module that fails outside the editor
        return None


# ue_stat (the lead's module, v0.1): parse_csv_profile(path) + csv_frames(parsed) for CSV
# profiler files, parse_stat_unit(text or path) for stat unit text, parse_jsonl(path) for
# TraceQuery records, budget_check(frames, target_ms). Checked against its source on
# 2026-09-24; both modules are not yet run on real engine output.
def _ue_stat_frames(path):
    st = toolkit("ue_stat")
    if st is None:
        return None
    try:
        if hasattr(st, "parse_csv_profile") and hasattr(st, "csv_frames"):
            fr = st.csv_frames(st.parse_csv_profile(path))
            if fr:
                return fr
        if hasattr(st, "parse_stat_unit"):
            fr = st.parse_stat_unit(path)
            if fr:
                return fr
    except Exception:
        return None
    return None


def _ue_stat_records(path):
    st = toolkit("ue_stat")
    if st is None or not hasattr(st, "parse_jsonl"):
        return None
    try:
        return st.parse_jsonl(path)
    except Exception:
        return None


# =========================================================================== A. plans
def frame_budget_ms(fps):
    """16.67 ms at 60 fps, 33.33 at 30: the budget is per stage (game thread, render thread,
    GPU), pipelined game N, render N-1, GPU N-2 (W4R [00:05:17] [00:08:26])."""
    return round(1000.0 / float(fps), 2)


PLATFORMS = {
    "console": {
        "label": "Gen9 console class (PS5, Xbox Series X), fixed hardware",
        "fps": 60, "sg_level": 2,
        "notes": [
            "Can spend close to the whole budget: known, ventilated hardware (ARI22 [00:04:49]).",
            "Epic scalability is the 30 fps level, High (2) the 60 fps level (OZ26 [00:11:00]; LVP).",
            "No runtime PSO hitches: one GPU, shaders compiled at cook (PSO blog).",
            "Profile with dynamic resolution locked, for example 75 percent (NORSE [00:44:40]).",
            "r.GTSyncType 2 on Gen9 consoles (OZ26 [00:09:27]) [verify].",
            "Deploying to a devkit needs the platform SDK and a source build (PKG): this Mac "
            "cannot; captures come from CI or a person at the devkit [added].",
        ],
    },
    "console30": {
        "label": "Gen9 console class at 30 fps (quality mode)", "fps": 30, "sg_level": 3,
        "notes": ["Epic scalability is the 30 fps console mode (OZ26 [00:11:00]; LVP)."],
    },
    "pc": {
        "label": "Windows PC, varied hardware", "fps": 60, "sg_level": 2,
        "notes": [
            "Leave leeway: hardware varies and players change settings (ARI22 [00:05:23]).",
            "Any DX12/Vulkan/Metal game needs a PSO strategy; test with -clearPSODriverCache "
            "and a consumer core count (-corelimit=8 -processaffinity=8) (PSO; HITCH [00:35:50]).",
            "Mid-spec GPU triage at native resolution without upscaling shows raw cost "
            "(FFW [00:01:03]).",
            "5.8 adds dynamic resolution on PC (DX12, Vulkan) (TL part 2).",
        ],
    },
    "handheld": {
        "label": "current-gen handheld or low PC", "fps": 60, "sg_level": 1,
        "notes": [
            "Lumen Lite (Medium GI and reflections, Beta in 5.8) is the default on current-gen "
            "handhelds at 60 fps, about twice as fast as High (TL part 2; rn58).",
            "Emulate the core count before judging worker cost (NIA [00:05:15]).",
        ],
    },
    "mobile": {
        "label": "iOS or Android", "fps": 60, "sg_level": 1,
        "notes": [
            "Leave leeway for thermal throttling and battery (ARI22 [00:05:53]).",
            "Know the thermal state during every capture; `stat thermals` exists in 5.8 "
            "(MOB [00:16:44]; TL part 2).",
            "PSO precaching on mobile is not conservative and has a map-load timeout (PSO blog).",
        ],
    },
    "mac": {
        "label": "Apple Silicon Mac (this machine class)", "fps": 60, "sg_level": 2,
        "notes": [
            "Nanite and VSM are Beta on M2+, Lumen HWRT and MegaLights Experimental on M2+ "
            "(mac-req via version deltas): Mac numbers are a relative proxy for a console "
            "target, never the proof [added].",
            "Metal needs PSOs too: run the cold/warm PSO comparison [added]; whether "
            "-clearPSODriverCache works on Metal is [verify].",
            "GPU 'why': Xcode Metal frame capture and Instruments Metal System Trace (MOB).",
            "Insights on Mac: no ContextSwitch channel; memory callstacks and symbols are not "
            "listed for Mac (INS).",
        ],
    },
}

# Budgets with a source. Anything without a sourced number is project-set: decide it at
# project start and keep the sum under the stage budget (OZ26 [00:45:55]; OZ24 [00:29:18]).
SOURCED_BUDGETS = [
    # (key, value, unit, applies_at_fps, relative_to, source)
    ("lumen_gi_reflections", 4.0, "ms GPU", 60,
     "delta with Lumen GI and reflections off, 1080p internal, console High",
     "OZ24 [00:37:22] [00:37:55]; LVP"),
    ("lumen_gi_reflections", 8.0, "ms GPU", 30,
     "same delta at 30 fps (Epic level)", "OZ24 [00:37:55]; LVP"),
    ("rt_active_instances", 100000, "instances", None,
     "`stat SceneRendering` Ray tracing active instances, current consoles", "LVP"),
    ("rt_scene_update", 0.5, "ms GPU async", 60, "Witcher 4 demo, PS5", "W4R [00:29:30]"),
    ("rt_geometry_pool", 400, "MB", 60, "Witcher 4 demo, PS5 (peak about 300)", "W4R [00:29:30]"),
    ("rt_near_field", 150, "m", 60,
     "near-field HWRT scene (landscape, foliage, static and dynamic); beyond it a static "
     "far-field TLAS in occlusion-only mode; Witcher 4 demo, PS5", "W4R [00:29:30] [00:30:05]"),
    ("rt_dynamic_triangles", 40000, "triangles per frame", 60,
     "dynamic RT updates staggered, nearest characters first; Witcher 4 demo, PS5",
     "W4R [00:30:37]"),
    ("streaming_total", 1.5, "ms GT per frame", 60,
     "unified budget, down from 2.5 ms split three ways; final demo 0.8 ms",
     "W4S [00:19:58] [00:23:55] [00:32:18]"),
    ("streaming_engine_default", 5.0, "ms GT per frame", 60,
     "engine default AddToWorld budget, 'a lot out of 16': reduce it", "OZ26 [00:25:25]"),
    ("gc_event", 1.0, "ms GT", None,
     "fine; 2 ms keep other heavy work out of that frame; 10 ms investigate",
     "HITCH [00:39:39]"),
    ("uobject_count", 500000, "objects", None,
     "under 500k good, 100k to 200k fine, over 1M to 2M wrong; Norse: about 100k normal",
     "HITCH [00:39:06]; NORSE [00:15:51]"),
    ("pso_runtime_hitch_threshold", 20.0, "ms", None,
     "r.PSO.RuntimeCreationHitchThreshold default", "PSO doc"),
    ("dynres_primary", "800p to 1080p", "lines", 60,
     "primary range under TSR, secondary 1440p, spatial upscale to 4K",
     "W4R [00:41:25] [00:43:08]; OZ26 [00:14:10]"),
]

PROJECT_SET_GPU_PASSES = ["nanite_visbuffer", "basepass", "vsm_shadow_depths",
                          "vsm_projection", "translucency", "decals", "post_and_tsr",
                          "fog_volumetrics", "niagara_gpu", "other"]


def budget_table(platform="console", fps=None, pass_budgets=None):
    """Budget rows for a platform: per-stage budgets, sourced feature budgets, and the
    project-set GPU pass budgets (values from `pass_budgets`, else None = to be set).

    Returns {"platform", "fps", "stage_ms", "rows": [...], "notes": [...], "problems": [...]}.
    A problem is raised when the project-set pass budgets exceed the GPU stage budget."""
    p = PLATFORMS.get(platform)
    if p is None:
        raise ValueError("unknown platform %r (choose from %s)" % (platform, sorted(PLATFORMS)))
    fps = fps or p["fps"]
    stage = frame_budget_ms(fps)
    rows = [{"key": k, "value": stage, "unit": "ms", "relative_to": "one frame at %d fps" % fps,
             "source": "W4R [00:05:17]; KEN [00:04:04]"}
            for k in ("game_thread", "render_thread", "rhi_thread", "gpu")]
    for key, value, unit, at_fps, rel, src in SOURCED_BUDGETS:
        if at_fps is None or at_fps == fps:
            rows.append({"key": key, "value": value, "unit": unit, "relative_to": rel,
                         "source": src})
    pass_budgets = pass_budgets or {}
    total = 0.0
    for k in PROJECT_SET_GPU_PASSES:
        v = pass_budgets.get(k)
        if isinstance(v, (int, float)):
            total += v
        rows.append({"key": "gpu_pass:" + k, "value": v, "unit": "ms GPU",
                     "relative_to": "project-set at project start" if v is None else
                     "project budget", "source": "OZ26 [00:45:55]; OZ24 [00:29:18]"})
    problems = []
    if total > stage:
        problems.append("GPU pass budgets sum to %.2f ms, over the %.2f ms stage" % (total, stage))
    return {"platform": platform, "label": p["label"], "fps": fps, "stage_ms": stage,
            "rows": rows, "notes": list(p["notes"]), "problems": problems,
            "pass_budget_sum_ms": round(total, 3)}


# Trace channel recipes: one capture per question (KEN slides [00:10:22] to [00:31:46];
# NORSE [00:08:37] [00:11:27]; NIA [00:10:52]; INS channel table).
TRACE_RECIPES = {
    "budget": {"channels": "default", "named_events": False,
               "question": "are we on budget (lean capture; named events cost about 20%)",
               "source": "NORSE [00:11:27]"},
    "why": {"channels": "default,task", "named_events": True,
            "question": "why is this frame slow (rich capture)", "source": "NORSE [00:08:37]"},
    "gt": {"channels": "cpu,frame,assetloadtime", "named_events": True,
           "question": "game thread: ticks, Blueprints, loading, GC",
           "source": "KEN slide [00:10:22]"},
    "rt": {"channels": "cpu,frame,rendercommands,rhicommands,rdg", "named_events": False,
           "question": "render and RHI threads: draw calls, command queues, RDG",
           "source": "KEN slide [00:15:21]"},
    "gpu": {"channels": "cpu,gpu,frame", "named_events": False,
            "question": "GPU passes (lock resolution, async compute off for attribution)",
            "source": "KEN slide [00:19:51] [00:20:10]"},
    "workers": {"channels": "cpu,frame,task", "named_events": True,
                "question": "worker tasks gating named threads", "source": "KEN slide [00:24:26]"},
    "ctxswitch": {"channels": "cpu,frame,contextswitch,task", "named_events": True,
                  "question": "core scheduling (Windows as admin, consoles only)",
                  "source": "KEN slide [00:29:53]; INS channel table",
                  "unsupported": ("mac", "mobile")},
    "io": {"channels": "cpu,file,assetloadtime,loadtimes,iostore", "named_events": True,
           "question": "file I/O and blocking loads", "source": "KEN slide [00:31:46]"},
    "memory": {"channels": "default,memory", "named_events": False,
               "question": "leaks and growth (from process start, Development build only)",
               "source": "ARI22 [00:21:24]; INS Memory Insights", "requires_build": "Development"},
    "hitch": {"channels": "default,task,loadtime", "named_events": True,
              "question": "unattended hitch hunt with snapshothitches",
              "source": "hitch digest H1; rn58 snapshot hitches"},
    "niagara": {"channels": "default", "named_events": True,
                "question": "Niagara cost per system (no named events, no Niagara in Insights)",
                "source": "NIA [00:10:52]"},
    "streaming": {"channels": "default,loadtime,assetloadtime", "named_events": True,
                  "question": "World Partition streaming (add WorldStreaming if the 5.8 "
                              "World Streaming Insights plugin is enabled) [verify]",
                  "source": "W4S [00:33:26]; TL part 2"},
}

# Launch flags that remove Development-build noise (NORSE [00:13:35] [00:16:23]) [verify].
DEV_NOISE_FLAGS = ["-NoVerifyGC", "-handleensurepercent=0"]


def _fmt_dpcvars(d):
    return ",".join("%s=%s" % (k, v) for k, v in d.items())


def capture_plan(purpose="budget", platform="console", build="Test", tracefile=None,
                 dynres_lock=None, attribution=False, headroom=True, cold=None, cores=None,
                 csv_profile=False, extra_dpcvars=None, extra_exec=None, gc_log=False):
    """Launch arguments for one capture, plus the hygiene record to attach to the run.

    purpose: a TRACE_RECIPES key. platform: a PLATFORMS key. build: Test or Development
    (never Shipping: no stats, console or trace; PKG). dynres_lock: screen percentage to
    lock (console GPU work defaults to 75, NORSE [00:44:40]). attribution=True forces async
    compute onto the graphics pipe (r.RDG.AsyncCompute=0) to read true per-pass costs; never
    for the final proof (NORSE [00:45:12]; LVP). headroom=True turns VSync and frame caps off
    for measurement (TL part 3). cold=True clears the PSO driver cache (PC, Mac, mobile).
    Every flag is [verify] on 5.8."""
    if purpose not in TRACE_RECIPES:
        raise ValueError("unknown purpose %r (choose from %s)" % (purpose, sorted(TRACE_RECIPES)))
    if platform not in PLATFORMS:
        raise ValueError("unknown platform %r" % platform)
    r = TRACE_RECIPES[purpose]
    notes, problems = [r["question"] + " (" + r["source"] + ")"], []
    if build == "Shipping":
        problems.append("Shipping strips console commands, stats and profiling: use Test, or "
                        "Development for memory traces (PKG; INS).")
    if build == "Test":
        notes.append("Test needs a source-built engine: a Launcher engine packages DebugGame, "
                     "Development or Shipping only (PKG); fall back to Development with "
                     "the noise flags [verify on the installed engine].")
    if r.get("requires_build") and build != r["requires_build"]:
        problems.append("%s capture needs a %s build (INS Memory Insights)." %
                        (purpose, r["requires_build"]))
    if platform in r.get("unsupported", ()):
        problems.append("%s channels are not available on %s (INS channel table); on Apple "
                        "hardware use Instruments (MOB)." % (purpose, platform))
    channels = r["channels"]
    if purpose == "memory" and platform == "mac":
        channels = "default,memory_light"
        notes.append("Mac: MemAlloc and Callstack are not listed for Mac; memory_light gives "
                     "allocations and tags without callstacks (INS; rn55) [verify].")
    args = ["-trace=" + channels]
    if tracefile:
        if not os.path.isabs(tracefile):
            problems.append("tracefile must be an absolute path")
        args.append("-tracefile=" + tracefile)
    if r["named_events"]:
        args.append("-statnamedevents")
    if build in ("Development", "Test"):
        args += DEV_NOISE_FLAGS
    dp = {}
    if headroom:
        dp.update({"r.VSync": 0, "t.MaxFPS": 0})
    if dynres_lock is None and platform in ("console", "console30") and purpose in ("gpu", "why"):
        dynres_lock = 75
    if dynres_lock:
        dp["r.DynamicRes.TestScreenPercentage"] = dynres_lock
        notes.append("Dynamic resolution locked at %s%% so cost shows in ms, not in buffer "
                     "size (NORSE [00:44:40]) [verify cvar spelling]." % dynres_lock)
    if attribution:
        dp["r.RDG.AsyncCompute"] = 0
        notes.append("Async compute off: per-pass attribution only, re-measure with it on "
                     "for any proof (NORSE [00:45:12]; LVP).")
        if purpose in ("gpu", "why"):
            dp["r.RHISetGPUCaptureOptions"] = 1
    if extra_dpcvars:
        dp.update(extra_dpcvars)
    if dp:
        args.append('-DPCVars=' + _fmt_dpcvars(dp))
    exec_cmds = []
    if purpose == "hitch":
        exec_cmds += ["stat default", "snapshothitches -start"]
        notes.append("snapshothitches needs a stat group active and writes a trace snapshot "
                     "plus a screenshot per hitch to Saved/Profiling/Hitches (rn58).")
    if csv_profile:
        exec_cmds.append("csvprofile start")
        notes.append("CSV profiler output under Saved/Profiling/CSV [verify]; stop with "
                     "`csvprofile stop` before exit.")
    if extra_exec:
        exec_cmds += list(extra_exec)
    if exec_cmds:
        args.append('-ExecCmds=' + ", ".join(exec_cmds))
    if cold is None:
        cold = purpose in ("hitch",) and platform in ("pc", "mac", "mobile", "handheld")
    if cold:
        if platform in ("console", "console30"):
            notes.append("Consoles compile PSOs at cook: no cold PSO run needed (PSO blog).")
        else:
            args.append("-clearPSODriverCache")
            notes.append("Cold run: the driver cache hides PSO hitches on the second run "
                         "(HITCH [00:35:50]; PSO).")
    if cores and platform in ("pc", "handheld"):
        args += ["-corelimit=%d" % cores, "-processaffinity=%d" % cores]
        notes.append("Core limit emulates consumer hardware (PSO doc; NIA [00:05:15]).")
    if gc_log:
        args.append('-LogCmds=LogGarbage verbose')
        notes.append("GC phases and UObject count in the log; verbose logging costs time "
                     "itself (NORSE [00:15:18] [00:15:51]).")
    hygiene = {"purpose": purpose, "build": build, "platform": platform,
               "channels": channels, "named_events": bool(r["named_events"]),
               "dynres": ("locked %s" % dynres_lock) if dynres_lock else "as shipped",
               "async_compute": "off" if attribution else "on",
               "vsync": "off" if headroom else "on", "pso_cache": "cold" if cold else "warm"}
    return {"purpose": purpose, "args": args,
            "command_line": " ".join(shlex.quote(a) for a in args),
            "dpcvars": dp, "exec_cmds": exec_cmds, "hygiene": hygiene,
            "notes": notes, "problems": problems}


def launch_command(binary, plan, uproject=None, map_path=None, game=True):
    """Full argv for a capture: a packaged app binary (.../<Game>.app/Contents/MacOS/<Game>)
    or the editor binary with `<uproject> <map> -game` (editor-build numbers are triage,
    not proof: NORSE [00:41:39]; FFW [00:02:19])."""
    argv = [binary]
    if uproject:
        argv.append(uproject)
        if map_path:
            argv.append(map_path)
        if game:
            argv.append("-game")
    return argv + list(plan["args"])


def packaged_binary(app_path):
    """<Name>.app -> <Name>.app/Contents/MacOS/<Name> (macOS bundle layout)."""
    name = os.path.splitext(os.path.basename(app_path.rstrip("/")))[0]
    return os.path.join(app_path, "Contents", "MacOS", name)


# Console sequences per stage: (command, what to read). All [verify] on 5.8.
STAT_SEQUENCES = {
    "triage": [("stat fps", "fps and ms"),
               ("stat unit", "Frame, Game, Draw, GPU, RHIT, DynRes; 5.8 adds VRAM used and budget "
                "on discrete GPUs only (TL part 2)"),
               ("stat unitgraph", "recent history, spikes without reading numbers (NORSE [00:13:01])")],
    "bound_split": [("r.ScreenPercentage 20", "GPU time falling a lot = resolution-bound work (TL part 3)"),
                    ("r.ScreenPercentage 100", "restore"),
                    ("pause", "what remains without the game thread (TL part 3)"),
                    ("pause", "resume")],
    "gpu": [("r.RDG.AsyncCompute 0", "attribution only (NORSE [00:45:12])"),
            ("stat gpu", "per pass, live"),
            ("ProfileGPU", "one frame to the log; 5.8 includes graphics pipe waits (TL part 2)"),
            ("r.RDG.AsyncCompute 1", "restore before any proof")],
    "lumen_delta": [("r.DynamicGlobalIlluminationMethod 0", "Lumen GI off"),
                    ("r.ReflectionMethod 0", "Lumen reflections off: frame should be about 4 ms "
                     "faster at 60 fps if on budget (OZ24 [00:37:55])"),
                    ("r.DynamicGlobalIlluminationMethod 1", "restore"),
                    ("r.ReflectionMethod 1", "restore")],
    "lumen_views": [("r.Lumen.Visualize 2", "Performance Overview: pixels tracing dedicated "
                     "reflection rays (OZ24 [00:39:00]; 5.4 notes) [verify mode number]")],
    "ray_tracing": [("stat SceneRendering", "Ray tracing active instances under about 100,000 (LVP)"),
                    ("r.RayTracing.Culling.Radius", "print: near-field radius; about 150 m in the "
                     "Witcher demo (W4R [00:29:30]) [verify units]"),
                    ("r.LumenScene.FarField", "print: static far-field TLAS (5.6 notes)"),
                    ("r.LumenScene.FarField.OcclusionOnly", "print: 1 = occlusion-only far field, "
                     "about 50 percent faster (5.6 notes via W4R)")],
    "vsm": [("r.ShaderPrintEnable 1", "on-screen stats (OZ24 [00:48:59])"),
            ("r.Shadow.Virtual.ShowStats 2", "pages, non-Nanite geometry, static vs dynamic "
             "invalidations: chase the bigger one; spelling vs r.Shadow.Virtual.Stats conflicts "
             "in the docs [verify]"),
            ("r.Shadow.Virtual.UseReceiverMaskDirectional", "print: default on for directional "
             "lights since 5.7 (W4R [00:37:50]; rn57)"),
            ("r.Shadow.Virtual.Clipmap.WPODisableDistance.LodBias", "print: half a long shadow "
             "animating = too low; 2 to 4 typical (OZ24 [00:46:49])"),
            ("r.Shadow.Virtual.DeferredInvalidationBudget", "print: 5.8 throttle for Nanite "
             "LOD-delta invalidations, default infinite (TL part 2)"),
            ("r.Shadow.Virtual.SMRT.RayCountDirectional", "print: projection cost lever with "
             "SamplesPerRay*, per profile (OZ26 [00:42:56]; VSM doc)")],
    "vsm_cache_view": [("ShowFlag.VisualizeVirtualShadowMap 1", "VSM visualization"),
                       ("r.Shadow.Virtual.Visualize cache", "red = invalidated pages; camera still")],
    # Oztalay's Nanite decision tree, in order (OZ24 [00:29:18] to [00:36:46]); run nanite_triage()
    # on the numbers. View mode names after r.Nanite.Visualize are [verify] on 5.8.
    "nanite": [("r.Nanite.ShowMeshDrawEvents 1", "split fixed-function and programmable raster "
                "bins in ProfileGPU; needed only up to 5.4 (OZ24 [00:29:52])"),
               ("ProfileGPU", "Nanite VisBuffer and base pass against their budgets (OZ24 [00:29:18])"),
               ("r.Nanite.Visualize EvaluateWPO", "vertex-programmable content (OZ24 [00:31:00]; "
                "FFW [00:16:14]) [verify mode name and colours]"),
               ("r.Nanite.Visualize PixelProgrammable", "masked, PDO, dynamic displacement "
                "(OZ24 [00:31:34]) [verify mode name]"),
               ("r.Nanite.Visualize.PixelProgrammableVisMode 1", "split masked from PDO "
                "(FFW [00:18:38]) [verify values]"),
               ("NaniteStats", "helper lanes near zero; shading bins total minus empty = draw "
                "calls (W4R [00:28:20]; OZ24 [00:36:14])"),
               ("r.Nanite.Visualize Overdraw", "last, as a locator only (OZ24 [00:32:13]) "
                "[verify mode name]"),
               ("r.Nanite.Visualize 0", "restore [verify]")],
    # Async compute is an optimization to A/B per feature (W4R [00:20:42] [00:21:48]); the
    # per-feature cvars come from the Lumen performance doc (LVP) and W4R's agent notes [verify].
    "async_ab": [("r.RDG.AsyncCompute", "print: global switch; 0 only to attribute passes"),
                 ("r.Lumen.AsyncCompute", "print"), ("r.LumenScene.Lighting.AsyncCompute", "print"),
                 ("r.Lumen.DiffuseIndirect.AsyncCompute", "print"),
                 ("r.Lumen.Reflections.AsyncCompute", "print: moving reflections back to graphics "
                  "saved time in the Witcher demo (W4R [00:21:48])"),
                 ("r.SkinCache.AsyncCompute", "print [verify]")],
    "camera_cut": [("r.Nanite.PrimeHZB", "print: 5.7 experimental HZB priming after cuts [verify]"),
                   ("r.Nanite.Visualize Overdraw", "screenshot the frame after the cut "
                    "(W4R [00:44:44] [00:45:16]) [verify mode name]")],
    "foliage": [("sg.FoliageQuality", "print: drives the density cvars below (FFW [00:33:18])"),
                ("foliage.DensityScale", "print: only foliage types with Enable Density Scaling, "
                 "non-colliding types only (FFW [00:32:48] [00:35:58])"),
                ("grass.DensityScale", "print: landscape grass (FFW [00:33:18])")],
    "cpu_game": [("stat game", "game thread groups"),
                 ("dumpticks grouped", "what ticks, grouped (TL part 3)"),
                 ("listtimers", "timer manager load (TL part 3)"),
                 ("obj list -countsort", "UObject count by class (HITCH [00:39:06])")],
    "cpu_render": [("stat initviews", "visible static mesh elements: the render thread's main "
                    "driver (STAT)"), ("stat scenerendering", "draws, general rendering")],
    "physics": [("stat physics", ""), ("stat collision", "queries (TL part 3)")],
    # ABA: a.Budget.Enabled is on by default and throttles only skeletal mesh components that
    # are registered with the budgeter (Enable Animation Budget node, Auto Register); Epic's
    # anim docs say use it instead of URO (animbp-architecture-performance doc).
    "animation": [("a.Budget.Enabled", "print: on by default; does nothing without budgeted "
                   "components (anim docs)"),
                  ("a.Budget.Debug.Enabled 1", "ABA debug overlay, not the switch (anim docs)")],
    "niagara": [("stat NiagaraOverview", "GT Concurrent, GT, RT totals (NIA [00:04:41])"),
                ("fx.Niagara.Debug.Hud Enabled=1 OverviewEnabled=1", "debug HUD, GPU compute")],
    "streaming": [("stat levels", "level states and load times (STAT)"),
                  ("stat streaming", "texture pool vs required (OZ24 [00:06:55])"),
                  ("s.UseUnifiedTimeBudgetForStreaming", "print: 5.6 Experimental, off by "
                   "default; A/B only (W4S [00:23:55]; HITCH [00:12:30])"),
                  ("p.Chaos.EnableAsyncInitBody", "print: async physics state, A/B only "
                   "(W4S [00:15:29]; HITCH [00:22:56])")],
    "hitch": [("stat default", "a stat group must be active (rn58)"),
              ("snapshothitches -start", "trace snapshot + screenshot per hitch"),
              ("snapshothitches -stop", "at the end of the route")],
    "pso": [("stat PSOPrecache", "Missed and Too late near zero (PSO doc)")],
    "memory": [("memreport -full", "text snapshot for diffs [verify output folder]")],
    "scalability_readback": [(n, "prints value and LastSetBy (SCAL)") for n in (
        "sg.ViewDistanceQuality", "sg.ShadowQuality", "sg.GlobalIlluminationQuality",
        "sg.ReflectionQuality", "sg.EffectsQuality", "sg.FoliageQuality",
        "r.ScreenPercentage", "r.SecondaryScreenPercentage.GameViewport",
        "r.DynamicRes.OperationMode", "r.GTSyncType")],
}


def stat_sequence(stage):
    """Console commands for a stage, in order; see STAT_SEQUENCES."""
    if stage not in STAT_SEQUENCES:
        raise ValueError("unknown stage %r (choose from %s)" % (stage, sorted(STAT_SEQUENCES)))
    return [c for c, _ in STAT_SEQUENCES[stage]]


# ---------------------------------------------------------------- A/B plans (one variant a run)
# Async compute is an optimization to A/B per content, not a switch: about 1.5 ms saved overall
# in the Witcher 4 demo, yet moving Lumen reflections back to graphics saved more, because a
# queue with nothing to overlap only adds cost (W4R [00:20:42] [00:21:48] [00:22:21]; LVP says
# run all of Lumen async when Screen Probe Gather cannot overlap reflections). Cvar names from
# LVP and W4R's agent notes [verify on 5.8]. Baseline = the engine's current state.
ASYNC_AB_VARIANTS = {
    "global_off": {"r.RDG.AsyncCompute": 0},
    "lumen_all_off": {"r.Lumen.AsyncCompute": 0},
    "lumen_scene_lighting_off": {"r.LumenScene.Lighting.AsyncCompute": 0},
    "lumen_diffuse_off": {"r.Lumen.DiffuseIndirect.AsyncCompute": 0},
    "lumen_reflections_off": {"r.Lumen.Reflections.AsyncCompute": 0},
    "skin_cache_off": {"r.SkinCache.AsyncCompute": 0},
}

# Experimental 5.6 streaming helpers: off by default, A/B only, never the shipped fix while
# Experimental (HITCH [00:12:30] [00:22:56]); async physics state pays only when workers have
# spare cycles (W4S [00:18:16]). Names from the 5.6 release notes via W4S [verify on 5.8].
STREAMING_AB_VARIANTS = {
    "unified_budget": {"s.UseUnifiedTimeBudgetForStreaming": 1},
    "async_physics_state": {"p.Chaos.EnableAsyncInitBody": 1,
                            "LevelStreaming.AllowIncrementalPreRegisterComponents": 1,
                            "LevelStreaming.AllowIncrementalPreUnregisterComponents": 1},
    "concurrent_levels": {"LevelStreaming.MaximumMakingVisibleLevels": 2},
    "texture_streaming_async": {"r.Streaming.EnableTexturesSamplingStreamingCache": 1,
                                "r.Streaming.AllowParallelRenderAssetStreamingManagerIncrementalUpdate": 1},
}


def ab_plan(variants, base_dpcvars=None):
    """Runs for an A/B: 'baseline' plus one run per variant, each changing only that variant's
    cvars on top of the baseline. Feed each run's dpcvars to capture_plan(extra_dpcvars=...),
    capture the same route three times per run, then call ab_verdict [added method]."""
    base = dict(base_dpcvars or {})
    runs = [{"label": "baseline", "dpcvars": dict(base)}]
    for name, cv in variants.items():
        d = dict(base)
        d.update(cv)
        runs.append({"label": name, "dpcvars": d, "changes": dict(cv)})
    return runs


def ab_verdict(results, spread_ms, lower_is_better=True):
    """results {label: metric} (median GPU or frame ms, latency frames...) with a 'baseline'
    entry; spread_ms = run-to-run spread of that metric. A variant is 'better' or 'worse' only
    when it beats the spread, else 'within noise' (no statistics on a handful of runs)."""
    if "baseline" not in results:
        raise ValueError("results need a 'baseline' entry")
    b = float(results["baseline"])
    out = []
    for label, v in results.items():
        if label == "baseline" or v is None:
            continue
        d = float(v) - b
        gain = -d if lower_is_better else d
        verdict = "better" if gain > spread_ms else "worse" if gain < -spread_ms else "within noise"
        out.append({"label": label, "value": v, "delta": round(d, 3), "verdict": verdict})
    out.sort(key=lambda r: r["delta"] if lower_is_better else -r["delta"])
    return {"baseline": b, "spread": spread_ms, "variants": out,
            "keep": [r["label"] for r in out if r["verdict"] == "better"],
            "note": "re-measure the chosen combination together; the proof runs with it "
                    "(async compute on unless a pass measured better on graphics)"}


# ---------------------------------------------------------------- route (repeatable path)
_BUGIT_RE = re.compile(r"BugItGo\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+"
                       r"(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)")


def parse_bugit(text):
    """BugItGo lines from a log (after `BugIt`): [(x, y, z, pitch, yaw, roll), ...]
    (NORSE [00:46:19]; KEN slide [00:06:59])."""
    return [tuple(float(v) for v in m.groups()) for m in _BUGIT_RE.finditer(text or "")]


def route_from_bugit(text, name="route", dwell_s=3.0, map_path=None):
    """A route JSON from BugIt output: one waypoint per BugItGo line."""
    wps = []
    for i, p in enumerate(parse_bugit(text), 1):
        wps.append({"name": "WP_%02d" % i, "bugitgo": "BugItGo %s" % " ".join("%g" % v for v in p),
                    "dwell_s": dwell_s})
    return {"name": name, "map": map_path, "waypoints": wps}


def route_commands(route, per_waypoint=("Trace.Bookmark {name}", "Trace.Screenshot {name} false")):
    """[(waypoint, [commands...])] with the marker commands the analysis maps back to places
    (Trace.Bookmark, Trace.Screenshot: INS; FFW [00:03:59])."""
    out = []
    for wp in route["waypoints"]:
        cmds = [wp["bugitgo"]] + [c.format(name=wp["name"]) for c in per_waypoint]
        out.append((wp["name"], cmds))
    return out


def route_event_track(route, start_s=2.0):
    """(time_s, command) pairs for a Level Sequence event track or the Automated Perf Testing
    plugin's sequence test in a packaged build, where Python is unavailable (packaged games
    have no editor Python) [added]. The camera itself comes from the sequence."""
    t, out = start_s, []
    for wp in route["waypoints"]:
        out.append((round(t, 3), "Trace.Bookmark %s" % wp["name"]))
        out.append((round(t + 0.5, 3), "Trace.Screenshot %s false" % wp["name"]))
        t += float(wp.get("dwell_s", 3.0))
    return out


# =========================================================================== B. frames
def _nk(k):
    return re.sub(r"[^a-z0-9]", "", str(k).lower())


_FRAME_ALIASES = {
    "frame": ("frame", "framems", "frametime", "frametimems", "frameduration", "total",
              "totalms", "ms", "dt"),
    "game": ("game", "gamems", "gamethread", "gamethreadtime", "gamethreadms",
             "gamethreadtimems", "gt", "gtms"),
    "draw": ("draw", "drawms", "render", "renderthread", "renderthreadtime", "renderthreadms",
             "renderthreadtimems", "rt", "rtms"),
    "gpu": ("gpu", "gpums", "gputime", "gputimems", "gpuframetime"),
    "rhit": ("rhit", "rhitms", "rhi", "rhithread", "rhithreadtime", "rhithreadtimems", "rhims"),
    "dynres": ("dynres", "screenpercentage", "dynamicresolution", "dynamicresolutionpercentage",
               "dynrespercentage", "primaryscreenpercentage"),
    "index": ("index", "frameindex", "framenumber", "framenum", "idx"),
}


def _num(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v) if math.isfinite(float(v)) else None
    try:
        s = str(v).strip().replace("ms", "").strip()
        f = float(s)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def normalize_frame(rec):
    """One frame (dict, object with attributes, or a bare number = frame ms) to the
    normalized frame dict; None when it has no usable frame or thread time."""
    if isinstance(rec, (int, float)) and not isinstance(rec, bool):
        return {"index": None, "frame": float(rec), "game": None, "draw": None,
                "gpu": None, "rhit": None, "dynres": None}
    if not isinstance(rec, dict):
        rec = getattr(rec, "__dict__", None) or {}
    norm = {_nk(k): v for k, v in rec.items()}
    present = [a for a in _FRAME_ALIASES["frame"] if a in norm]
    if present and all(_num(norm[a]) is None for a in present):
        return None  # a metadata or header row (CSV profiler files end with them)
    out = {}
    for field, aliases in _FRAME_ALIASES.items():
        val = None
        for a in aliases:
            if a in norm:
                val = _num(norm[a])
                if val is not None:
                    break
        out[field] = val
    if out["index"] is not None:
        out["index"] = int(out["index"])
    threads = [out[k] for k in ("game", "draw", "gpu", "rhit") if out[k] is not None]
    if out["frame"] is None and threads:
        out["frame"] = max(threads)
    return out if out["frame"] is not None else None


def normalize_frames(frames):
    """Normalize a sequence of frames, dropping rows without numbers (CSV metadata rows,
    headers repeated at the end of a CSV profiler file). Indices filled when missing."""
    out = []
    for i, f in enumerate(frames or []):
        n = normalize_frame(f)
        if n is None:
            continue
        if n["index"] is None:
            n["index"] = i
        out.append(n)
    return out


def load_frames(path):
    """Frames from a file: ue_stat first (stat unit logs, CSV profiler files), then a generic
    reader for this module's own formats (JSON list of frame dicts, or any CSV with a header
    row whose columns match the aliases above)."""
    if not os.path.isfile(path):
        raise OSError("no such file: %s" % path)
    got = _ue_stat_frames(path)
    if got:
        n = normalize_frames(got)
        if n:
            return n
    with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        text = f.read()
    s = text.lstrip()
    if s.startswith("[") or s.startswith("{"):
        data = json.loads(s)
        if isinstance(data, dict):
            data = data.get("frames", [])
        return normalize_frames(data)
    return normalize_frames(list(csv.DictReader(io.StringIO(text))))


def percentile(values, q):
    """Linear-interpolated percentile (q in 0..100) of a list of numbers; None when empty."""
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    if len(vals) == 1:
        return vals[0]
    pos = (len(vals) - 1) * q / 100.0
    lo, hi = int(math.floor(pos)), int(math.ceil(pos))
    return vals[lo] + (vals[hi] - vals[lo]) * (pos - lo)


def series_stats(values, target_ms=None, hitch_ms=None):
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    st = {"n": len(vals), "mean": sum(vals) / len(vals), "median": percentile(vals, 50),
          "p90": percentile(vals, 90), "p95": percentile(vals, 95), "p99": percentile(vals, 99),
          "min": min(vals), "max": max(vals)}
    if target_ms:
        over = sum(1 for v in vals if v > target_ms)
        st["over_budget"] = over
        st["over_budget_pct"] = 100.0 * over / len(vals)
    if hitch_ms:
        st["hitches"] = sum(1 for v in vals if v > hitch_ms)
    return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in st.items()}


THREADS = ("game", "draw", "gpu", "rhit")


def frame_stats(frames, target_ms=16.67, hitch_ms=None):
    """Per-series stats of normalized frames. hitch_ms defaults to two frame budgets
    (33.3 ms at 60 fps) [added gate]; over_budget_pct is Oztalay's 'VSync miss
    percentage' budget line (OZ26 [00:45:55])."""
    frames = normalize_frames(frames)
    hitch_ms = hitch_ms or 2.0 * target_ms
    out = {"n": len(frames), "target_ms": target_ms, "hitch_ms": hitch_ms,
           "frame": series_stats([f["frame"] for f in frames], target_ms, hitch_ms)}
    for t in THREADS + ("dynres",):
        out[t] = series_stats([f[t] for f in frames], target_ms if t != "dynres" else None)
    return out


def diagnose_bound(frames, target_ms=16.67, vsync=None, context=None):
    """CPU vs GPU bound from stat unit style frames (KEN slide [00:22:58]; STAT; ARI22
    [00:15:23]). Rules:
      * Frame median at or under target: on budget, unless p95 is over (spiky: hitch pass).
      * The bound is the stage whose median is largest; Frame close to Game = game thread,
        Draw = render thread, GPU = GPU. GPU and RHIT follow Frame and can look alike: an
        RHIT bound needs an Insights confirmation (STAT).
      * Every stage well under Frame means waits or unattributed time: open a trace (KEN).
      * VSync on quantizes Frame to 16.7/33.3: the gap is read from the stages, and the
        measurement should be redone with r.VSync 0 (STAT: display-bound; TL part 3).
    context: {"dynres_locked": bool, "editor": bool, "mac_proxy": bool, "async_compute": str}
    """
    context = context or {}
    frames = normalize_frames(frames)
    st = frame_stats(frames, target_ms)
    res = {"target_ms": target_ms, "n": st["n"], "stats": st, "bound": "unknown",
           "also_over": [], "gap_ms": None, "excess_ms": {}, "caveats": [], "next": {},
           "per_frame_bound": {}}
    if not frames:
        res["caveats"].append("no frames")
        return res
    fmed = st["frame"]["median"]
    meds = {t: st[t]["median"] for t in THREADS if st[t]}
    for t, m in meds.items():
        res["excess_ms"][t] = round(m - target_ms, 3)
    counts = {}
    for f in frames:
        vals = {t: f[t] for t in THREADS if f[t] is not None}
        if vals:
            b = max(vals, key=vals.get)
            counts[b] = counts.get(b, 0) + 1
    res["per_frame_bound"] = counts
    if not meds:
        res["caveats"].append("frame times only: capture stat unit threads (CSV profiler or "
                              "a lean trace) before choosing a direction")
        res["gap_ms"] = round(fmed - target_ms, 3)
        res["next"] = {"capture": "budget", "stat_sequence": "triage"}
        return res
    work = max(meds.values())
    if vsync:
        res["caveats"].append("VSync on: Frame is quantized; gap read from the stages; "
                              "re-measure with r.VSync 0 and t.MaxFPS 0 (TL part 3)")
        fmed_eff = work
    else:
        fmed_eff = fmed
    res["gap_ms"] = round(fmed_eff - target_ms, 3)
    if fmed_eff <= target_ms:
        p95 = st["frame"]["p95"]
        if p95 is not None and p95 > target_ms and not vsync:
            res["bound"] = "spiky"
            res["caveats"].append("median on budget but p95 %.2f ms over: hitch pass" % p95)
            res["next"] = {"capture": "hitch", "stat_sequence": "hitch"}
        else:
            res["bound"] = "display" if vsync else "on_budget"
            res["next"] = {"capture": "hitch", "stat_sequence": "hitch"}
        return res
    bound = max(meds, key=meds.get)
    res["bound"] = {"game": "game", "draw": "render", "gpu": "gpu", "rhit": "rhi"}[bound]
    res["also_over"] = sorted({"game": "game", "draw": "render", "gpu": "gpu", "rhit": "rhi"}[t]
                              for t, m in meds.items() if m > target_ms and t != bound)
    if work < 0.85 * fmed_eff:
        res["caveats"].append("every stage is well under Frame (%.1f vs %.1f ms): waits or "
                              "unattributed work; read a trace before fixing (KEN [00:09:24]) "
                              "[added threshold]" % (work, fmed_eff))
    if bound == "rhit" or ("rhit" in meds and "gpu" in meds and abs(meds["rhit"] - meds["gpu"]) < 1.0
                           and bound in ("gpu", "rhit")):
        res["caveats"].append("GPU and RHIT follow Frame and can look alike in stat unit: "
                              "confirm on the RHI and GPU tracks in Insights (STAT; KEN)")
    if res["also_over"]:
        res["caveats"].append("more than one stage over budget: each needs its own 16.6 ms "
                              "(W4R [00:05:17]); fix the bound first, then re-classify")
    if bound == "gpu" and not context.get("dynres_locked", False):
        res["caveats"].append("dynamic resolution not recorded as locked: GPU cost may hide in "
                              "buffer size (NORSE [00:44:07] [00:45:12])")
    if context.get("editor"):
        res["caveats"].append("editor numbers: CPU and Blueprint costs need a cooked build; "
                              "GPU passes are roughly valid for triage (NORSE [00:41:39]; "
                              "FFW [00:02:19])")
    if context.get("mac_proxy"):
        res["caveats"].append("measured on a Mac for a non-Mac target: relative proxy only [added]")
    nxt = {
        "gpu": {"capture": "gpu", "stat_sequence": "gpu",
                "look_first": ["ProfileGPU top passes (sum same-name passes, FFW [00:12:15])",
                               "Lumen delta against about 4 ms (OZ24 [00:37:55])",
                               "Nanite VisBuffer programmable raster, masked/PDO/WPO foliage "
                               "paying in VisBuffer, VSM and custom depth (NORSE [00:53:48])",
                               "VSM projection mask bits from overlapping shadowed lights "
                               "(NORSE [00:49:35])",
                               "translucency After DOF at full resolution (NORSE [00:49:03])",
                               "r.ScreenPercentage 20 split test (TL part 3)"]},
        "game": {"capture": "gt", "stat_sequence": "cpu_game",
                 "look_first": ["tick groups top-down, fattest block first (NORSE [00:22:43])",
                                "instance counts vs what is on screen: CharacterMovement, "
                                "raycasts, AnimBP updates (NORSE [00:24:20] [00:25:24])",
                                "EndPhysics waits and physics scene size (HITCH [00:21:20])",
                                "streaming AddToWorld and component registration (W4S)",
                                "timers and event responses, not only Tick (KEN [00:12:14])"]},
        "draw": {"capture": "rt", "stat_sequence": "cpu_render",
                 "look_first": ["stat initviews visible static mesh elements (STAT)",
                                "Nanite shading bins and unique material instances "
                                "(OZ24 [00:36:14]; OZ26 [00:38:48])",
                                "render frame N delaying game frame N+1 (KEN [00:16:30])"]},
        "rhit": {"capture": "rt", "stat_sequence": "cpu_render",
                 "look_first": ["RHI submission and DeleteRHIResources on the RHI track "
                                "(KEN [00:09:24])", "parallel RHI translation state (W4R [00:15:14])"]},
    }[bound]
    res["next"] = nxt
    return res


def camera_cut_spikes(frames, cut_frames, target_ms=16.67, key="gpu", window=2, lookback=30):
    """GPU hitches caused by camera cuts: occlusion history is lost, so the frames right after a
    cut overdraw (W4R [00:44:11] [00:44:44]). For each cut index, the peak of `key` (GPU ms,
    else frame ms) over [cut, cut+window] against the median of the `lookback` frames before.
    A cut 'caused' a spike when the peak is over target while the frames before were not.
    Fix (5.7): r.Nanite.PrimeHZB passes [verify]; confirm with the Nanite Overdraw view on the
    frame after the cut (W4R [00:45:16]). Dynamic resolution cannot absorb it (W4R [00:43:38])."""
    frames = normalize_frames(frames)
    by_i = {f["index"]: f for f in frames}

    def val(f):
        return f.get(key) if f.get(key) is not None else f.get("frame")

    out = []
    for c in cut_frames or []:
        after = [val(by_i[i]) for i in range(c, c + window + 1) if i in by_i and val(by_i[i]) is not None]
        before = [val(by_i[i]) for i in range(c - lookback, c) if i in by_i and val(by_i[i]) is not None]
        peak = max(after) if after else None
        bmed = percentile(before, 50) if before else None
        spike = peak is not None and peak > target_ms and (bmed is None or bmed <= target_ms)
        out.append({"cut": c, "peak_ms": round(peak, 3) if peak is not None else None,
                    "before_median_ms": round(bmed, 3) if bmed is not None else None,
                    "spike": spike,
                    "fix": ("prime the HZB after cuts (r.Nanite.PrimeHZB, 5.7) [verify]; check the "
                            "Nanite Overdraw view on the frame after the cut (W4R [00:44:44] "
                            "[00:45:16]); owners scenario-unreal-cinematics and scenario-unreal-lighting-rendering")
                    if spike else None})
    return out


# =========================================================================== C. traces
WAIT_MARKERS = ("idle", "wait", "frame sync", "framesync", "stall", "sleep")
# Names seen on KEN's slides; the substring rule above catches their variants [verify in a
# 5.8 trace]: "Game thread idle time", "Frame Sync Time", "GameThreadWaitForTask",
# "WaitForTasks", "WaitUntilTasksComplete", "Tasks::Wait", "FTaskBase::WaitImpl_StateChange".
CONTAINER_TIMERS = ("FEngineLoop::Tick", "EngineLoop", "Frame", "GameThread", "RenderingFrame",
                    "RenderThread", "UGameEngine::Tick", "UWorld_Tick", "World Tick Time",
                    "FrameTime", "RHIThread")


def is_wait(name):
    n = (name or "").lower()
    return any(m in n for m in WAIT_MARKERS)


def thread_kind(name):
    n = (name or "").lower().replace(" ", "")
    if "gamethread" in n or n in ("game", "gt"):
        return "game"
    if "gpu" in n or "graphics" in n and "pipe" in n:
        return "gpu"
    if "rhi" in n:
        return "rhi"
    if "render" in n or n in ("rt", "draw"):
        return "render"
    if "loading" in n or "asyncload" in n or n.startswith("io"):
        return "loading"
    if "worker" in n or "task" in n or "pool" in n:
        return "worker"
    return "other"


# Hitch signatures, checked in this order (a blocking load outranks what it triggers).
# Names on screen in the talks carry the source; [added] names are engine knowledge to
# confirm in a 5.8 trace.
HITCH_SIGNATURES = [
    {"id": "blocking_load", "match": ("FlushAsyncLoading", "LoadPackageInternal",
                                      "StaticLoadObjectInternal", "LoadClassAsset_Blocking",
                                      "LoadAsset_Blocking", "UEngine::LoadMap", "LoadObject"),
     "source": "HITCH [00:43:07] [00:45:50]; ARI22 [00:25:58]; KEN [00:33:06]",
     "fix": "async loads (Async Load Class Asset, FStreamableManager), preload earlier, "
            "blocking-load validator; owner scenario-unreal-gameplay"},
    {"id": "pso", "match": ("PSOPrecache: Too Late", "PSOPrecache: Missed",
                            "FCompilePipelineStateTask", "RHICreateComputePipeline",
                            "FPSOPrecacheAsyncTask", "CreateGraphicsPipelineState"),
     "source": "KEN [00:07:32] (screen); PSO doc; HITCH [00:28:32]",
     "fix": "PC/Mac/mobile only: precaching on, loading screen until "
            "NumPrecompilesRemaining() is 0, r.PSOPrecache.Validation=2 to name the miss"},
    {"id": "gc", "match": ("IncrementalPurgeGarbage", "CollectGarbage", "GarbageCollect",
                           "ReachabilityAnalysis", "PerformReachabilityAnalysis"),
     "source": "KEN [00:32:21] (IncrementalPurgeGarbage on screen); HITCH [00:38:17]; "
               "other names [added]",
     "fix": "fewer UObjects (obj list -countsort), pooling, GC clusters, manual GC at still "
            "moments (HITCH [00:39:39] [00:40:11])"},
    {"id": "streaming", "match": ("AddToWorld", "RemoveFromWorld", "UpdateLevelStreaming",
                                  "ProcessAsyncLoading", "IncrementalRegisterComponents",
                                  "RouteActorInitialize", "CreatePhysicsState", "InitBody"),
     "source": "W4S [00:09:11] [00:34:00]; NORSE [00:33:06]; registration names [added]",
     "fix": "fewer actors and components (PLA, ISM cell transformer, FastGeo), no complex "
            "collision on big ISMs, NeverUpdate overlaps, smaller budgets; owner "
            "scenario-unreal-world-building"},
    {"id": "spawn", "match": ("SpawnActor", "FinishSpawning", "PostSpawnInitialize"),
     "source": "HITCH [00:24:36] [00:25:29]; timer names [added]",
     "fix": "simpler spawned actors, one complex spawn per frame on low end, deferred "
            "skeletal init, per-type pools; owner scenario-unreal-gameplay"},
    {"id": "physics", "match": ("FPhysicsSolverAdvanceTask", "Chaos", "SceneQuery",
                                "LineTrace", "Sweep"),
     "source": "KEN [00:25:38] (screen); HITCH [00:21:20]; query names [added]",
     "fix": "Chaos Visual Debugger first: flatten the physics scene, simple collision, "
            "proxies, channels (HITCH [00:15:26] to [00:21:52])"},
    {"id": "content_tick", "match": ("FTimerManager_Tick", "ExecuteUbergraph", "TickComponent",
                                     "Blueprint"),
     "source": "KEN [00:12:14] (FTimerManager_Tick on screen); HITCH [00:46:54]",
     "fix": "tick less (intervals, significance), event-driven logic, nativize hot paths; "
            "owner scenario-unreal-gameplay"},
    {"id": "rhi", "match": ("DeleteRHIResources", "RHI_SubmitToGPU"),
     "source": "KEN [00:09:24] (screen)",
     "fix": "attribute to the RHI thread, not the waiting game thread"},
    {"id": "shader_compile", "match": ("ShaderCompil", "CompileShader"),
     "source": "[added]", "fix": "editor or first-run compile: not a shipping hitch unless PSO"},
]


def _match_sig(name, sig):
    n = (name or "").lower()
    return any(m.lower() in n for m in sig["match"])


_TIMER_ALIASES = {
    "name": ("name", "timer", "timername", "scope", "event", "eventname", "label"),
    "thread": ("thread", "threadname", "track", "timeline", "tid"),
    "ms": ("ms", "durationms", "duration", "inclusive", "inclusivems", "incl", "dur"),
    "start": ("start", "starttime", "begin", "ts", "timestamp", "time", "t0"),
    "end": ("end", "endtime", "stop", "t1"),
    "frame": ("frame", "frameindex", "gameframe", "frameid", "framenumber"),
    "depth": ("depth", "level", "stackdepth"),
    "excl": ("exclusive", "exclusivems", "excl", "self", "selfms"),
    "value": ("value", "val", "count"),
}
_KIND_KEYS = ("type", "kind", "recordtype", "eventtype", "category")


def _pick(norm, field, conv=_num):
    for a in _TIMER_ALIASES[field]:
        if a in norm and norm[a] is not None:
            v = conv(norm[a]) if conv else norm[a]
            if v is not None:
                return v
    return None


def normalize_trace(records, time_unit="s", duration_unit="ms"):
    """TraceQuery-like records to {"timers", "frames", "bookmarks", "counters"}.

    The 5.8 TraceQuery JSONL schema is not documented in the saved sources [verify]: run
    `schema_probe()` on real output first, then set time_unit / duration_unit ("s", "ms",
    "us", "ns"). Records are classified by a type/kind field (frame, bookmark, counter,
    anything else = timer) or by their keys."""
    tscale = {"s": 1.0, "ms": 1e-3, "us": 1e-6, "ns": 1e-9}[time_unit]
    dscale = {"s": 1e3, "ms": 1.0, "us": 1e-3, "ns": 1e-6}[duration_unit]
    timers, frames, bookmarks, counters = [], [], [], []
    for rec in records or []:
        if not isinstance(rec, dict):
            continue
        norm = {_nk(k): v for k, v in rec.items()}
        kind = ""
        for k in _KIND_KEYS:
            if isinstance(norm.get(k), str):
                kind = norm[k].lower()
                break
        name = _pick(norm, "name", conv=lambda v: str(v))
        start, end = _pick(norm, "start"), _pick(norm, "end")
        start = start * tscale if start is not None else None
        end = end * tscale if end is not None else None
        ms = _pick(norm, "ms")
        ms = ms * dscale if ms is not None else None
        if ms is None and start is not None and end is not None:
            ms = (end - start) * 1000.0
        fr = _pick(norm, "frame")
        is_frame = "frame" in kind and "timer" not in kind
        if fr is None and is_frame:
            fr = _num(norm.get("index"))
        fr = int(fr) if fr is not None else None
        if is_frame:
            ft = (str(norm.get("frametype") or norm.get("framekind") or norm.get("thread")
                      or name or "game")).lower()
            frames.append({"index": fr, "start": start, "end": end, "ms": ms,
                           "type": "render" if "render" in ft else "game"})
        elif "bookmark" in kind or ("bookmark" in norm and name is None):
            bookmarks.append({"name": name or str(norm.get("bookmark")), "time": start,
                              "frame": fr})
        elif "counter" in kind:
            counters.append({"name": name, "value": _pick(norm, "value"), "time": start,
                             "frame": fr})
        elif name is not None and (ms is not None or start is not None):
            thread = _pick(norm, "thread", conv=lambda v: str(v)) or "GameThread"
            depth = _pick(norm, "depth")
            timers.append({"name": name, "thread": thread, "kind": thread_kind(thread),
                           "frame": fr, "start": start, "end": end, "ms": ms or 0.0,
                           "depth": int(depth) if depth is not None else None,
                           "excl": (lambda e: e * dscale if e is not None else None)(
                               _pick(norm, "excl"))})
    _assign_frames(timers, frames, bookmarks)
    return {"timers": timers, "frames": frames, "bookmarks": bookmarks, "counters": counters}


def _assign_frames(timers, frames, bookmarks):
    game = sorted((f for f in frames if f["type"] == "game" and f["start"] is not None
                   and f["end"] is not None), key=lambda f: f["start"])
    if not game:
        return
    starts = [f["start"] for f in game]
    for coll in (timers, bookmarks):
        for t in coll:
            key = t.get("start") if "start" in t else t.get("time")
            if t.get("frame") is None and key is not None:
                i = bisect.bisect_right(starts, key) - 1
                if 0 <= i < len(game) and key <= game[i]["end"] + 1e-9:
                    t["frame"] = game[i]["index"] if game[i]["index"] is not None else i


def load_trace(path, time_unit="s", duration_unit="ms"):
    """TraceQuery JSONL records through ue_stat.parse_jsonl if present, else line by line;
    then normalize_trace (this module's schema aliases and units)."""
    records = _ue_stat_records(path)
    if records is None:
        records = []
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line or line[0] not in "{[":
                    continue
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if isinstance(obj, list):
                    records.extend(o for o in obj if isinstance(o, dict))
                elif isinstance(obj, dict):
                    records.append(obj)
    return normalize_trace(records, time_unit, duration_unit)


def schema_probe(path, n=200):
    """Keys, value types and examples in the first n JSONL records, with a guess of which
    alias each key maps to. Run this on real 5.8 TraceQuery output before trusting
    load_trace (schema [verify])."""
    keys, kinds = {}, {}
    count = 0
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if count >= n:
                break
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            count += 1
            for k, v in obj.items():
                e = keys.setdefault(k, {"count": 0, "types": set(), "example": v})
                e["count"] += 1
                e["types"].add(type(v).__name__)
            for k in _KIND_KEYS:
                for kk, vv in obj.items():
                    if _nk(kk) == k and isinstance(vv, str):
                        kinds[vv] = kinds.get(vv, 0) + 1
    alias_of = {}
    for field, aliases in _TIMER_ALIASES.items():
        for k in keys:
            if _nk(k) in aliases and k not in alias_of:
                alias_of[k] = field
    return {"records": count, "record_kinds": kinds,
            "keys": {k: {"count": v["count"], "types": sorted(v["types"]),
                         "example": v["example"], "maps_to": alias_of.get(k)}
                     for k, v in keys.items()}}


def _exclusive_times(tlist):
    """Fill 'excl' and 'parent' for one thread-frame list using start/end nesting, else
    depth order; leaves excl as given when the source already had it."""
    if all(t.get("start") is not None and t.get("end") is not None for t in tlist):
        order = sorted(tlist, key=lambda t: (t["start"], -(t["end"] - t["start"])))
        stack = []
        for t in order:
            while stack and not (t["start"] >= stack[-1]["start"] - 1e-12 and
                                 t["end"] <= stack[-1]["end"] + 1e-12):
                stack.pop()
            t["_parent"] = stack[-1] if stack else None
            stack.append(t)
    elif all(t.get("depth") is not None for t in tlist):
        stack = []
        for t in tlist:
            while stack and stack[-1]["depth"] >= t["depth"]:
                stack.pop()
            t["_parent"] = stack[-1] if stack else None
            stack.append(t)
    else:
        for t in tlist:
            t["_parent"] = None
            t["_flat"] = True
        return
    child = {}
    for t in tlist:
        p = t.get("_parent")
        if p is not None:
            child[id(p)] = child.get(id(p), 0.0) + t["ms"]
    for t in tlist:
        if t.get("excl") is None:
            t["excl"] = max(0.0, t["ms"] - child.get(id(t), 0.0))


def _in_wait(t):
    p = t.get("_parent")
    while p is not None:
        if is_wait(p["name"]):
            return True
        p = p.get("_parent")
    return False


def analyze_trace(trace, target_ms=16.67, hitch_ms=None, count_names=("LineTrace", "Sweep",
                  "CharacterMovement", "SkeletalMesh"), top_n=3):
    """Frame-by-frame reading of a normalized trace the way KEN and NORSE read Insights:

      * per frame and thread: total (root timers), wait (idle, wait, frame sync), busy,
        top non-wait timers by exclusive time (containers skipped);
      * frames over budget get a bound (largest busy stage) and, when the game thread mostly
        waits after a long render frame N-1, 'propagated from render' (KEN [00:16:30]);
      * frames over budget are classified with HITCH_SIGNATURES (largest matched timer);
      * same-name timers are summed per frame (FFW [00:12:15]); instance counts per frame for
        `count_names` (NORSE [00:25:24]); Niagara cost from NS_ and Niagara timers per thread
        kind (NIA [00:12:30]); bookmarks name the place (FFW [00:03:59]).
    Returns a dict; `trace_report_md()` renders it."""
    hitch_ms = hitch_ms or 2.0 * target_ms
    if "timers" not in trace:
        trace = normalize_trace(trace)
    timers = trace["timers"]
    by_frame = {}
    for t in timers:
        by_frame.setdefault(t["frame"], []).append(t)
    frame_ms = {}
    for f in trace["frames"]:
        if f["type"] == "game" and f["index"] is not None and f["ms"] is not None:
            frame_ms[f["index"]] = f["ms"]
    render_ms = {f["index"]: f["ms"] for f in trace["frames"]
                 if f["type"] == "render" and f["index"] is not None and f["ms"] is not None}
    bms = sorted((b for b in trace["bookmarks"] if b.get("frame") is not None),
                 key=lambda b: b["frame"])
    rows, cat_counts, cat_worst, sums, counts = [], {}, {}, {}, {}
    niagara, row_by_frame = {}, {}
    gt_wait_frames, gt_wait_names = [], {}
    for fr in sorted(k for k in by_frame if k is not None):
        tl = by_frame[fr]
        threads = {}
        for t in tl:
            threads.setdefault(t["thread"], []).append(t)
        tinfo = {}
        gw = None
        for th, lst in threads.items():
            _exclusive_times(lst)
            flat = any(t.get("_flat") for t in lst)
            roots = [t for t in lst if t.get("_parent") is None]
            total = max(t["ms"] for t in lst) if flat else sum(t["ms"] for t in roots)
            waits = [t for t in lst if is_wait(t["name"]) and not _in_wait(t)]
            wait = min(total, sum(t["ms"] for t in waits))
            if thread_kind(th) == "game":
                gw = (gw or 0.0) + wait
                for t in waits:
                    gt_wait_names[t["name"]] = gt_wait_names.get(t["name"], 0.0) + t["ms"]
            cand = [t for t in lst if not is_wait(t["name"]) and t["name"] not in CONTAINER_TIMERS]
            key = (lambda t: t["ms"]) if flat else (lambda t: t.get("excl") or 0.0)
            top = sorted(cand, key=key, reverse=True)[:top_n]
            tinfo[th] = {"kind": thread_kind(th), "total": round(total, 3),
                         "wait": round(wait, 3), "busy": round(total - wait, 3),
                         "top": [(t["name"], round(key(t), 3)) for t in top]}
        if gw is not None:
            gt_wait_frames.append(gw)
        ms = frame_ms.get(fr)
        if ms is None:
            game_tot = [v["total"] for v in tinfo.values() if v["kind"] == "game"]
            ms = max(game_tot) if game_tot else max((v["total"] for v in tinfo.values()), default=0)
        # same-name sums (a timer nested in one of the same name is not added twice)
        fsum = {}
        for t in tl:
            if not _nested_same(t):
                fsum[t["name"]] = fsum.get(t["name"], 0.0) + t["ms"]
        for n, v in fsum.items():
            s = sums.setdefault(n, {"total": 0.0, "frames": 0, "max": 0.0})
            s["total"] += v
            s["frames"] += 1
            s["max"] = max(s["max"], v)
        for cn in count_names:
            c = sum(1 for t in tl if cn.lower() in t["name"].lower())
            e = counts.setdefault(cn, [])
            e.append(c)
        for t in tl:
            if t["name"].startswith("NS_") or "niagara" in t["name"].lower():
                if t.get("_parent") is not None and (t["_parent"]["name"].startswith("NS_") or
                                                    "niagara" in t["_parent"]["name"].lower()):
                    continue
                niagara.setdefault(fr, {}).setdefault(t["kind"], 0.0)
                niagara[fr][t["kind"]] += t["ms"]
        row = {"frame": fr, "ms": round(ms, 3), "over": ms > target_ms, "hitch": ms > hitch_ms,
               "threads": tinfo, "bookmark": None, "bound": None, "propagated": None,
               "category": None, "evidence": []}
        for b in bms:
            if b["frame"] <= fr:
                row["bookmark"] = b["name"]
        if row["over"]:
            stage = {}
            for th, v in tinfo.items():
                if v["kind"] in ("game", "render", "rhi", "gpu"):
                    stage[v["kind"]] = max(stage.get(v["kind"], 0.0), v["busy"])
            if stage:
                row["bound"] = max(stage, key=stage.get)
            gts = [v for v in tinfo.values() if v["kind"] == "game"]
            prev_r = render_ms.get(fr - 1)
            if prev_r is None and (fr - 1) in row_by_frame:
                rts = [v["busy"] for v in row_by_frame[fr - 1]["threads"].values()
                       if v["kind"] == "render"]
                prev_r = max(rts) if rts else None
            if gts and gts[0]["total"] > 0 and gts[0]["wait"] / gts[0]["total"] > 0.5 \
                    and prev_r is not None and prev_r > target_ms:
                row["propagated"] = "render frame %d took %.1f ms; fix the render thread (KEN [00:16:30])" % (fr - 1, prev_r)
                row["bound"] = "render"
            # First signature in priority order whose largest matched timer explains a real
            # share of the excess: at least 1 ms and a quarter of (frame - target) [added].
            excess = ms - target_ms
            best = None
            for sig in HITCH_SIGNATURES:
                hits = [t for t in tl if _match_sig(t["name"], sig)]
                if hits:
                    h = max(hits, key=lambda t: t["ms"])
                    if h["ms"] >= max(1.0, 0.25 * excess):
                        best = (sig, h)
                        break
            if best is not None:
                sig, h = best
                row["category"] = sig["id"]
                row["evidence"] = ["%s %.2f ms on %s" % (h["name"], h["ms"], h["thread"])]
            elif row["propagated"]:
                row["category"] = "render_propagated"
            else:
                row["category"] = "unclassified"
                row["evidence"] = ["top %s: %s" % (th, v["top"]) for th, v in tinfo.items() if v["top"]]
            if row["hitch"] or row["category"] != "unclassified":
                cat_counts[row["category"]] = cat_counts.get(row["category"], 0) + 1
                w = cat_worst.get(row["category"])
                if w is None or ms > w["ms"]:
                    cat_worst[row["category"]] = {"ms": round(ms, 3), "frame": fr,
                                                  "bookmark": row["bookmark"],
                                                  "evidence": row["evidence"]}
        rows.append(row)
        row_by_frame[fr] = row
    fstats = series_stats([r["ms"] for r in rows], target_ms, hitch_ms)
    top_timers = sorted(({"name": n, "total_ms": round(v["total"], 3),
                          "mean_per_frame_ms": round(v["total"] / max(1, len(rows)), 3),
                          "max_frame_ms": round(v["max"], 3)} for n, v in sums.items()
                         if not is_wait(n) and n not in CONTAINER_TIMERS),
                        key=lambda d: d["total_ms"], reverse=True)[:25]
    count_stats = {n: {"max_per_frame": max(v) if v else 0,
                       "mean_per_frame": round(sum(v) / len(v), 2) if v else 0}
                   for n, v in counts.items()}
    nia = {}
    for fr, d in niagara.items():
        for k, v in d.items():
            nia.setdefault(k, []).append(v)
    nia_stats = {k: {"mean_ms": round(sum(v) / max(1, len(rows)), 3), "max_ms": round(max(v), 3)}
                 for k, v in nia.items()}
    for t in timers:
        t.pop("_parent", None)
        t.pop("_flat", None)
    # Render frames over budget even when the game frame was not (pipelining hides one
    # frame, W4R [00:08:26]; the next game frame usually pays: KEN [00:16:30]).
    r_over = sorted(i for i, v in render_ms.items() if v > target_ms)
    if not render_ms:
        r_over = [r["frame"] for r in rows
                  if any(v["kind"] == "render" and v["busy"] > target_ms for v in r["threads"].values())]
    # Game-thread waits are budget, not idle time: the Witcher demo had about 2 ms of waits on
    # animation and movement finalization at 300 NPCs, reclaimed by slotting gameplay into the
    # gap or moving animation evaluation into the physics gap (W4R [00:16:20] [00:16:53]).
    game_wait = None
    if gt_wait_frames:
        game_wait = {"median_ms": round(percentile(gt_wait_frames, 50), 3),
                     "p95_ms": round(percentile(gt_wait_frames, 95), 3),
                     "max_ms": round(max(gt_wait_frames), 3),
                     "top": sorted(((n, round(v, 3)) for n, v in gt_wait_names.items()),
                                   key=lambda kv: -kv[1])[:5]}
    advice = []
    uncl = [r["frame"] for r in rows if r["over"] and r["category"] == "unclassified"]
    if uncl:
        advice.append("%d over-budget frame(s) match no signature (first: %s): run a sampling "
                      "profiler alongside Insights (Superluminal or PIX on Windows, Instruments "
                      "Time Profiler on a Mac, the platform tools on consoles; the 5.8 Insights "
                      "StackSampling channel is Windows only) (NORSE [00:17:30]; MOB [00:07:05]; "
                      "INS)" % (len(uncl), uncl[:5]))
    if game_wait and game_wait["median_ms"] > 0:
        advice.append("game thread waits a median %.2f ms per frame (top: %s): follow each wait "
                      "to the task it waits on; waits on animation or movement finalization are "
                      "reclaimable budget (W4R [00:16:20]; KEN [00:25:56])"
                      % (game_wait["median_ms"], ", ".join(n for n, _ in game_wait["top"][:3])))
    return {"target_ms": target_ms, "hitch_ms": hitch_ms, "frames": rows, "stats": fstats,
            "categories": cat_counts, "worst": cat_worst, "top_timers": top_timers,
            "counts": count_stats, "niagara": nia_stats,
            "over_budget_frames": [r["frame"] for r in rows if r["over"]],
            "render_over_frames": r_over, "game_wait": game_wait, "advice": advice}


# Spawn timers (HITCH [00:24:36] [00:25:29]; names [added], confirm in a 5.8 trace).
SPAWN_TIMERS = ("SpawnActor", "FinishSpawning", "PostSpawnInitialize")


def spawn_bursts(trace, names=SPAWN_TIMERS, max_per_frame=1, target_ms=16.67):
    """Spawns per frame from a trace. Spawning is not incremental (a spawned actor must be
    ready by the next line), unlike streaming: studios on low-end targets spawn one complex
    actor per frame (HITCH [00:25:08] [00:25:29]). Counts outermost matching timers per thread
    (a FinishSpawning inside a SpawnActor is one spawn); flags over-budget frames with more
    than `max_per_frame` spawns. Fix: cap complex spawns per frame, defer skeletal init with the
    'Tick Animation On Skeletal Mesh Init' project setting (spawn off camera or hide one frame),
    one pool per actor type (HITCH [00:25:29] [00:26:02] [00:27:26]); owner scenario-unreal-gameplay."""
    if "timers" not in trace:
        trace = normalize_trace(trace)
    frame_ms = {f["index"]: f["ms"] for f in trace["frames"]
                if f["type"] == "game" and f["index"] is not None}
    per = {}
    for t in trace["timers"]:
        if t["frame"] is None or not any(n.lower() in t["name"].lower() for n in names):
            continue
        per.setdefault(t["frame"], {}).setdefault(t["thread"], []).append(t)
    rows = []
    for fr in sorted(per):
        count, ms = 0, 0.0
        for lst in per[fr].values():
            if all(t.get("start") is not None and t.get("end") is not None for t in lst):
                lst = sorted(lst, key=lambda t: (t["start"], -(t["end"] - t["start"])))
                end = None
                for t in lst:
                    if end is not None and t["end"] <= end + 1e-12:
                        continue          # nested in the previous spawn
                    count += 1
                    ms += t["ms"]
                    end = t["end"]
            else:
                outer = [t for t in lst if names[0].lower() in t["name"].lower()] or lst
                count += len(outer)
                ms += sum(t["ms"] for t in outer)
        fms = frame_ms.get(fr)
        over = fms is None or fms > target_ms
        rows.append({"frame": fr, "spawns": count, "spawn_ms": round(ms, 3),
                     "frame_ms": round(fms, 3) if fms is not None else None,
                     "flag": count > max_per_frame and over})
    return {"frames": rows, "flagged": [r for r in rows if r["flag"]],
            "max_per_frame": max_per_frame,
            "fix": "cap complex spawns per frame, defer skeletal init (Tick Animation On Skeletal "
                   "Mesh Init), per-type pools (HITCH [00:25:29] [00:26:02] [00:27:26])"}


def _nested_same(t):
    p = t.get("_parent")
    while p is not None:
        if p["name"] == t["name"]:
            return True
        p = p.get("_parent")
    return False


def trace_report_md(an, title="Trace analysis", max_rows=30):
    s = an["stats"] or {}
    lines = ["# " + title, "",
             "Target %.2f ms, hitch %.2f ms. Frames %s, median %s ms, p95 %s, p99 %s, max %s, "
             "over budget %s (%.1f%%), hitches %s." % (
                 an["target_ms"], an["hitch_ms"], s.get("n"), s.get("median"), s.get("p95"),
                 s.get("p99"), s.get("max"), s.get("over_budget"), s.get("over_budget_pct", 0.0),
                 s.get("hitches")), "",
             "## Over-budget frames by signature", "",
             "| Category | Frames | Worst ms | Frame | Bookmark | Evidence |", "|---|---|---|---|---|---|"]
    for cat, n in sorted(an["categories"].items(), key=lambda kv: -kv[1]):
        w = an["worst"][cat]
        lines.append("| %s | %d | %.2f | %s | %s | %s |" % (cat, n, w["ms"], w["frame"],
                     w["bookmark"] or "", "; ".join(w["evidence"])[:160]))
    lines += ["", "## Worst frames", "", "| Frame | ms | Bound | Category | Bookmark | Propagated |",
              "|---|---|---|---|---|---|"]
    worst = sorted((r for r in an["frames"] if r["over"]), key=lambda r: -r["ms"])[:max_rows]
    for r in worst:
        lines.append("| %s | %.2f | %s | %s | %s | %s |" % (r["frame"], r["ms"], r["bound"],
                     r["category"], r["bookmark"] or "", r["propagated"] or ""))
    lines += ["", "## Top timers (same-name summed per frame)", "",
              "| Timer | Total ms | Mean per frame | Max in a frame |", "|---|---|---|---|"]
    for t in an["top_timers"][:15]:
        lines.append("| %s | %.2f | %.3f | %.2f |" % (t["name"], t["total_ms"],
                     t["mean_per_frame_ms"], t["max_frame_ms"]))
    if an["counts"]:
        lines += ["", "## Instance counts per frame (compare with what is on screen)", ""]
        for n, c in an["counts"].items():
            lines.append("- %s: max %s, mean %s" % (n, c["max_per_frame"], c["mean_per_frame"]))
    if an["niagara"]:
        lines += ["", "## Niagara (NS_ and Niagara timers by thread kind)", ""]
        for k, c in an["niagara"].items():
            lines.append("- %s: mean %.3f ms per frame, max %.3f ms" % (k, c["mean_ms"], c["max_ms"]))
    gw = an.get("game_wait")
    if gw:
        lines += ["", "## Game-thread waits (budget, not idle)", "",
                  "- median %s ms, p95 %s, max %s; top: %s" % (gw["median_ms"], gw["p95_ms"],
                                                              gw["max_ms"], gw["top"])]
    if an.get("advice"):
        lines += ["", "## Next", ""] + ["- " + a for a in an["advice"]]
    return "\n".join(lines) + "\n"


# =========================================================================== C2. suspect trees
# Measured feature numbers against sourced budgets, each with its levers in the order the
# experts pull them. budget: a number, {fps: number}, or None (project-set: decide it with the
# owner, OZ26 [00:45:55]). kind "reclaimable" = not a limit, budget hiding in plain sight.
FEATURE_CHECKS = [
    {"key": "lumen_delta_ms", "budget": {60: 4.0, 30: 8.0}, "unit": "ms GPU",
     "measure": "frame delta with Lumen GI and reflections off (stat_sequence('lumen_delta'))",
     "owner": "scenario-unreal-lighting-rendering", "source": "OZ24 [00:37:55]; LVP",
     "levers": [
         "read the Lumen Performance Overview, then lower Max Roughness To Trace below the 0.4 "
         "default (content often sits near 0.35) and set the foliage threshold to 0 "
         "(OZ26 [00:41:56]; OZ24 [00:39:33]; W4R [00:33:42])",
         "re-read it under wet weather: wet shaders push surfaces under the threshold; clamp "
         "puddle roughness in the material (OZ24 [00:39:33] [00:40:40])",
         "deep water: the Single Layer Water opaque-depth cutoff culls Lumen under deep water, "
         "over 1 ms in the Witcher demo, no help in shallow creeks (W4R [00:34:47] [00:35:18]) "
         "[setting name verify]",
         "take grass, small plants and skyboxes out of the ray tracing scene (Visible In Ray "
         "Tracing off, Affect Dynamic Indirect Lighting off); Affect Distance Field Lighting "
         "only matters for software tracing (OZ24 [00:38:27]; LVP)",
         "A/B async compute per Lumen pass: ab_plan(ASYNC_AB_VARIANTS) (W4R [00:21:48])",
         "last resort: Lumen Lite (sg.GlobalIlluminationQuality 1, sg.ReflectionQuality 1; Beta, "
         "about 2x faster than High), judged by eye (TL part 2)"]},
    {"key": "rt_active_instances", "budget": 100000, "unit": "instances",
     "measure": "stat SceneRendering, Ray tracing active instances after culling",
     "owner": "scenario-unreal-lighting-rendering", "source": "LVP",
     "levers": [
         "shrink the near field (about 150 m in the Witcher demo, r.RayTracing.Culling.Radius "
         "[verify units]) and keep the far field static and occlusion-only "
         "(r.LumenScene.FarField 1, r.LumenScene.FarField.OcclusionOnly 1) (W4R [00:29:30] "
         "[00:30:05]; rn56)",
         "Visible In Ray Tracing off for grass, small plants, skyboxes and heavy overlap "
         "(OZ24 [00:38:27]; LVP)",
         "HLODs feed the HWRT far field (OZ26 [00:25:56])"]},
    {"key": "rt_geometry_pool_mb", "budget": 400, "unit": "MB",
     "measure": "ray tracing geometry memory (Render Resource Viewer or stat) [verify source]",
     "owner": "scenario-unreal-world-building", "source": "W4R [00:29:30]",
     "levers": [
         "foliage RT proxies: occlusion-matched triangle clouds (a 41M-triangle tree down to 225 "
         "RT triangles), fine because they only feed indirect light and occlusion "
         "(W4R [00:31:40] [00:32:11])",
         "a lower landscape LOD in the RT scene (W4R [00:31:40])",
         "Nanite fallback settings on every Nanite mesh: fallbacks feed ray tracing "
         "(OZ26 [00:37:15])"]},
    {"key": "rt_scene_update_ms", "budget": {60: 0.5}, "unit": "ms GPU (async)",
     "measure": "RT scene update passes in ProfileGPU or the Insights GPU track",
     "owner": "scenario-unreal-lighting-rendering", "source": "W4R [00:29:30]",
     "levers": [
         "stagger dynamic RT updates (about 40,000 triangles per frame), nearest characters "
         "only, so more NPCs do not blow the budget (W4R [00:30:37])",
         "do not animate trees in the RT scene; time-slice landscape RT updates on LOD change "
         "(W4R [00:31:09] [00:31:40])",
         "tie GPU skin cache work to RT scene updates, skin cache on async compute "
         "(W4R [00:31:09])"]},
    {"key": "rt_dynamic_triangles", "budget": {60: 40000}, "unit": "triangles per frame",
     "measure": "dynamic RT geometry updated per frame [verify stat]",
     "owner": "scenario-unreal-lighting-rendering", "source": "W4R [00:30:37]",
     "levers": ["stagger updates and keep only the nearest characters dynamic in the RT scene "
                "(W4R [00:30:37])"]},
    {"key": "nanite_visbuffer_ms", "budget": None, "unit": "ms GPU",
     "measure": "ProfileGPU Nanite VisBuffer", "owner": "scenario-unreal-materials",
     "source": "OZ24 [00:29:18]", "levers": ["run nanite_triage() with this number and its budget"]},
    {"key": "vsm_shadow_depths_ms", "budget": None, "unit": "ms GPU",
     "measure": "ProfileGPU ShadowDepths (includes the Nanite VSM raster)",
     "owner": "scenario-unreal-lighting-rendering", "source": "OZ24 [00:47:52]; LVP",
     "levers": ["run vsm_triage() with ShowStats pages and invalidations"]},
    {"key": "streaming_gt_ms", "budget": {60: 1.5}, "unit": "ms GT per frame",
     "measure": "AddToWorld + RemoveFromWorld + ProcessAsyncLoading per frame (Insights)",
     "owner": "scenario-unreal-world-building", "source": "W4S [00:23:55]; OZ26 [00:25:25] (5 ms default)",
     "levers": [
         "fewer components first: ISM cell transformer, Packed Level Actors, FastGeo "
         "(W4S [00:12:38] [00:25:04]; HITCH [00:08:40])",
         "overlaps: DefaultUpdateOverlapsMethodDuringLevelStreaming=NeverUpdate, opt in per "
         "actor (HITCH [00:18:56]); day_one_engine_ini()",
         "unified budget and async physics state as A/B only: ab_plan(STREAMING_AB_VARIANTS) "
         "(W4S [00:15:29] [00:23:55]; HITCH [00:12:30] [00:22:56])",
         "Simple Streamable Asset Manager, worth it even without FastGeo (W4S [00:40:11])",
         "per-cell cost in World Partition Insights (Spatial Profiler, 5.8) (TL part 2)"]},
    {"key": "streaming_latency_frames", "budget": None, "unit": "frames request to visible",
     "measure": "streaming source request to cell visible, on a top-speed traversal with the "
                "source blocking on slow loading (W4S [00:33:26] [00:35:08])",
     "owner": "scenario-unreal-world-building",
     "source": "W4S [00:22:13] [00:23:55] (example: 51 frames; the unified budget cut latency "
               "40 percent at a smaller budget)",
     "levers": ["same levers as streaming_gt_ms; pass = no pause while streaming catches up "
                "(W4S [00:35:08])"]},
    {"key": "gt_wait_ms", "budget": None, "kind": "reclaimable", "unit": "ms GT per frame",
     "measure": "analyze_trace(...)['game_wait']", "owner": "scenario-unreal-gameplay",
     "source": "W4R [00:16:20] [00:16:53] (about 2 ms at 300 NPCs, about 1 ms at 200)",
     "levers": ["follow each wait to its task (KEN [00:25:56]); slot gameplay into the gap or "
                "move animation evaluation into the physics gap (W4R [00:16:53])"]},
    {"key": "gc_ms", "budget": 1.0, "unit": "ms GT per GC event",
     "measure": "GC timers in a trace or -LogCmds=\"LogGarbage verbose\"", "owner": "scenario-unreal-gameplay",
     "source": "HITCH [00:39:39] (1 fine, 2 isolate, 10 investigate)",
     "levers": ["fewer UObjects (obj list -countsort), pools for short-lived UObjects, GC "
                "clusters, manual GC at still moments (HITCH [00:39:39] [00:40:11])",
                "incremental reachability spreads cost and hides growth: A/B only "
                "(HITCH [00:41:56])"]},
    {"key": "uobjects", "budget": 500000, "unit": "objects",
     "measure": "obj list -countsort or the 5.8 UObject Count trace counter",
     "owner": "scenario-unreal-gameplay", "source": "HITCH [00:39:06]; NORSE [00:15:51]",
     "levers": ["static mesh actors into ISM, Packed Level Actors or FastGeo; stream only what "
                "is around the player (HITCH [00:38:31])"]},
    {"key": "spawns_per_frame", "budget": 1, "unit": "complex spawns per frame (low end)",
     "measure": "spawn_bursts(trace)", "owner": "scenario-unreal-gameplay", "source": "HITCH [00:25:29]",
     "levers": ["cap complex spawns per frame, defer skeletal init (Tick Animation On Skeletal "
                "Mesh Init), per-type pools (HITCH [00:25:29] [00:26:02] [00:27:26])"]},
]


def _check_budget(check, fps):
    b = check.get("budget")
    if isinstance(b, dict):
        return b.get(fps)
    return b


def feature_budget_check(measured, fps=60, budgets=None):
    """Compare measured feature numbers with FEATURE_CHECKS. measured {key: value}; budgets
    {key: value} overrides (project-set budgets such as streaming latency). Returns findings
    sorted over-budget first (by ratio), then reclaimable, project-set, ok; plus the checks not
    measured yet (what to capture next) and unknown keys. Source numbers are context from
    their project, never this game's result."""
    budgets = budgets or {}
    known = {c["key"]: c for c in FEATURE_CHECKS}
    findings, unknown = [], []
    for k, v in (measured or {}).items():
        c = known.get(k)
        if c is None:
            unknown.append(k)
            continue
        if v is None:
            continue
        b = budgets.get(k, _check_budget(c, fps))
        if c.get("kind") == "reclaimable":
            status = "reclaimable" if float(v) > 0 else "ok"
        elif b is None:
            status = "project_set"
        else:
            status = "over" if float(v) > float(b) else "ok"
        f = {"key": k, "value": v, "budget": b, "unit": c["unit"], "status": status,
             "owner": c["owner"], "source": c["source"], "measure": c["measure"],
             "levers": list(c["levers"]) if status != "ok" else []}
        if k == "gc_ms":   # HITCH [00:39:39]: 1 ms fine, 2 ms keep heavy work out of that
            f["tier"] = ("fine" if v <= 1.0 else "investigate" if v >= 10.0 else "isolate")
        findings.append(f)
    order = {"over": 0, "reclaimable": 1, "project_set": 2, "ok": 3}
    findings.sort(key=lambda f: (order[f["status"]],
                                 -(float(f["value"]) / float(f["budget"]))
                                 if f["status"] == "over" and f["budget"] else 0.0))
    return {"fps": fps, "findings": findings,
            "over": [f["key"] for f in findings if f["status"] == "over"],
            "not_measured": [c["key"] for c in FEATURE_CHECKS if c["key"] not in (measured or {})],
            "unknown": unknown}


def _step(steps, step, action, source, owner=None):
    steps.append({"step": step, "action": action, "source": source, "owner": owner})


def nanite_triage(m):
    """Oztalay's Nanite decision tree as ordered next steps (OZ24 [00:29:18] to [00:36:46];
    W4R [00:27:48] to [00:29:24]; FFW [00:16:14] to [00:18:38]; OZ26 [00:37:47] to [00:39:20]).
    m keys (ms from ProfileGPU, with r.Nanite.ShowMeshDrawEvents 1 up to 5.4): visbuffer_ms,
    visbuffer_budget_ms, programmable_ms, fixed_function_ms, basepass_ms, basepass_budget_ms,
    shading_bins, empty_bins (NaniteStats), helper_lanes (NaniteStats; the goal is near zero),
    tessellation (bool), non_nanite_found (bool, from the Mask view). A view mode locates; the
    ms decide (OZ24 [00:32:13])."""
    steps = []
    vb, vbb = m.get("visbuffer_ms"), m.get("visbuffer_budget_ms")
    bp, bpb = m.get("basepass_ms"), m.get("basepass_budget_ms")
    if vbb is None and bpb is None:
        _step(steps, "set_budget", "decide the Nanite budget (VisBuffer and base pass ms in the "
              "16.6 ms frame) before debugging Nanite", "OZ24 [00:29:18]")
        return steps
    if vb is not None and vbb is not None and vb > vbb:
        prog, ff = m.get("programmable_ms"), m.get("fixed_function_ms")
        if prog is None or ff is None:
            _step(steps, "split_raster", "split fixed-function from programmable raster bins "
                  "(r.Nanite.ShowMeshDrawEvents 1 up to 5.4, then ProfileGPU)", "OZ24 [00:29:52]")
        if prog is None or ff is None or prog >= ff:
            _step(steps, "evaluate_wpo_view", "Evaluate WPO view: vertex-programmable content; "
                  "WPO disable distance and a tight material max WPO displacement (cluster bounds)",
                  "OZ24 [00:31:00]; OZ26 [00:37:47] [00:38:17]", "scenario-unreal-materials")
            _step(steps, "pixel_programmable_view", "Pixel Programmable view, then "
                  "PixelProgrammableVisMode to split masked from PDO: masked to opaque where the "
                  "mesh follows the leaf, remove PDO, Pixel Programmable Distance (5.8 foliage "
                  "types; pops on loose silhouettes)",
                  "OZ24 [00:31:34]; FFW [00:18:38] [00:21:43] [00:25:31] [00:30:49]",
                  "scenario-unreal-materials")
            if m.get("tessellation"):
                _step(steps, "displacement", "displacement range set to the intended displacement "
                      "and Displacement Fade on every tessellated material",
                      "W4R [00:28:52]; OZ26 [00:38:17]", "scenario-unreal-materials")
        if ff is None or prog is None or ff > prog:
            _step(steps, "overdraw_view", "fixed-function raster: only now the Overdraw view, as "
                  "a locator: long thin triangles (remesh uniformly), interpenetrating meshes; "
                  "greebles on flat surfaces are fine", "OZ24 [00:31:41] to [00:36:03]",
                  "scenario-unreal-world-building")
    if bp is not None and bpb is not None and bp > bpb:
        sb, eb = m.get("shading_bins"), m.get("empty_bins")
        n = (sb - eb) if (sb is not None and eb is not None) else None
        _step(steps, "shading_bins", "NaniteStats non-empty shading bins%s are the draw calls: "
              "vary with Custom Primitive Data and per-instance custom data, globals through an "
              "MPC, 5.8 per-instance usage flags; if bins are few, the materials are expensive"
              % ((" (%d)" % n) if n is not None else ""),
              "OZ24 [00:36:14] [00:36:46]; OZ26 [00:38:48] [00:39:20]", "scenario-unreal-materials")
    if m.get("helper_lanes"):
        _step(steps, "helper_lanes", "helper lanes are not near zero: let the material use "
              "analytic derivatives, remove DDX/DDY (they also break Nanite VRS)",
              "W4R [00:27:48] [00:28:20]; OZ24 [00:27:22] [00:28:12]", "scenario-unreal-materials")
    if m.get("non_nanite_found"):
        _step(steps, "nanite_mask", "Mask view: make eligible non-Nanite content Nanite (water "
              "and Niagara meshes were the Witcher exceptions)", "W4R [00:28:52] [00:29:24]",
              "scenario-unreal-world-building")
    if not steps:
        _step(steps, "on_budget", "Nanite within its budget: stop here (stop when the offender no "
              "longer shows)", "ARI22 [00:19:14]")
    return steps


def vsm_triage(s):
    """VSM cost reading as ordered next steps (OZ24 [00:43:59] to [00:48:59]; W4R [00:37:18] to
    [00:39:27]; OZ26 [00:42:26] to [00:43:27]; NORSE [00:49:35]; AVW [00:24:24] to
    [00:31:42]; TL part 2; rn57). s keys: depths_ms, depths_budget_ms, projection_ms,
    projection_budget_ms, static_invalidated, dynamic_invalidated, non_nanite_drawn,
    page_pool_overflow (bool) (r.ShaderPrintEnable 1 + r.Shadow.Virtual.ShowStats 2),
    receiver_mask_directional (read-back value), local_lights_with_movers (count of shadowed
    local lights that characters cross), half_shadow_animates (bool, from a screenshot),
    spiky (bool: shadow cost spikes while the rest is stable)."""
    steps = []
    d, db = s.get("depths_ms"), s.get("depths_budget_ms")
    p, pb = s.get("projection_ms"), s.get("projection_budget_ms")
    if d is not None and db is not None and d > db:
        _step(steps, "visbuffer_first", "VSM depth reuses the Nanite raster: fix the Nanite "
              "VisBuffer first (nanite_triage)", "OZ24 [00:47:52]", "scenario-unreal-materials")
    if s.get("page_pool_overflow"):
        _step(steps, "page_pool", "page pool overflow: resolution LOD bias per device profile "
              "(r.Shadow.Virtual.ResolutionLodBiasDirectional, ...Local) and fewer invalidations",
              "OZ26 [00:43:27]; LVP", "scenario-unreal-lighting-rendering")
    si, di = s.get("static_invalidated"), s.get("dynamic_invalidated")
    if si is not None and di is not None and (si or di):
        if si >= di:
            _step(steps, "static_invalidation", "static pages invalidated: content cached as "
                  "static keeps changing: WPO foliage without a WPO disable distance (past it, "
                  "objects return to static caching), Nanite LOD-delta invalidations (5.8 "
                  "r.Shadow.Virtual.DeferredInvalidationBudget, default infinite)",
                  "OZ24 [00:43:59] [00:44:33] [00:48:59]; TL part 2", "scenario-unreal-world-building")
        else:
            _step(steps, "dynamic_invalidation", "dynamic pages: characters moving through shadowed "
                  "local lights invalidate them every frame; with many movers ray-traced local "
                  "shadows win (static/dynamic cache separation doubles VSM memory); runtime "
                  "bounds for non-Nanite skinned meshes",
                  "OZ24 [00:48:59]; AVW [00:26:25] [00:31:42]; W4R [00:39:27]",
                  "scenario-unreal-lighting-rendering")
    if s.get("local_lights_with_movers") and not any(x["step"] == "dynamic_invalidation" for x in steps):
        _step(steps, "local_lights_movers", "%d shadowed local lights with moving characters: A/B "
              "ray-traced shadows for them" % s["local_lights_with_movers"],
              "AVW [00:26:25] [00:31:42]", "scenario-unreal-lighting-rendering")
    if s.get("half_shadow_animates"):
        _step(steps, "wpo_lod_bias", "half of a long shadow animates: raise "
              "r.Shadow.Virtual.Clipmap.WPODisableDistance.LodBias (2 to 4 typical)",
              "OZ24 [00:46:49] [00:47:20]", "scenario-unreal-lighting-rendering")
    rm = s.get("receiver_mask_directional")
    if rm is not None and str(rm).strip() in ("0", "False", "false"):
        _step(steps, "receiver_mask", "receiver masks off for the directional light (default on "
              "since 5.7): enable r.Shadow.Virtual.UseReceiverMaskDirectional and A/B",
              "W4R [00:37:50]; rn57", "scenario-unreal-lighting-rendering")
    if p is not None and pb is not None and p > pb:
        _step(steps, "projection", "projection is a quality slider: light softness (Source "
              "Radius or Angle), SMRT ray count and samples per ray per profile "
              "(r.Shadow.Virtual.SMRT.RayCount*, SamplesPerRay*), overlapping shadowed local "
              "lights in the projection mask bits; MegaLights overlap costs noise, not time",
              "OZ26 [00:42:26] [00:42:56]; NORSE [00:49:35]; AVW [00:24:24]; LVP",
              "scenario-unreal-lighting-rendering")
    if s.get("spiky"):
        _step(steps, "throttle", "throttle VSM (VSM throttling) instead of letting dynamic "
              "resolution soften the whole frame", "W4R [00:38:55]", "scenario-unreal-lighting-rendering")
    if s.get("non_nanite_drawn"):
        _step(steps, "non_nanite", "non-Nanite geometry drawn into VSM (%s): make eligible meshes "
              "Nanite, LODs on the rest; track the count build to build" % s["non_nanite_drawn"],
              "LVP; OZ24 [00:48:59]", "scenario-unreal-world-building")
    if not steps:
        _step(steps, "on_budget", "no VSM finding from these numbers", "")
    return steps


# =========================================================================== D. log parsers
# Log line prefix: optional "[date][frame]" then "LogCategory: Verbosity: " with exactly one
# space after each colon, so the indentation that follows (tree depth) survives.
_LOG_PREFIX = re.compile(r"^(?:\[[^\]]*\]\[\s*\d+\])?(?:Log\w+: (?:(?:VeryVerbose|Verbose|Log|"
                         r"Display|Warning|Error): )?)?")
_PGPU_LINE = re.compile(r"^(?P<indent>\s*)(?:(?P<pct>\d+(?:\.\d+)?)%\s*)?(?P<ms>\d+(?:\.\d+)?)\s*ms\s+"
                        r"(?P<name>.+?)\s*$")
_DRAWS = re.compile(r"\s+(\d+)\s+draws?\b.*$")

# (bucket, name substrings, sticky). A sticky bucket keeps its children (Nanite raster inside
# ShadowDepths is shadow cost: OZ24 [00:47:52]; LVP "Shadow Depths"). A soft bucket (lights,
# post, prepass) yields to a child that matches its own bucket (VirtualShadowMapProjection
# under Lights is VSM projection, LVP; Decals under LightCompositionTasks is decal cost,
# FFW [00:10:37]).
GPU_BUCKETS = [
    ("vsm", ("VirtualShadowMap", "ShadowDepths", "RenderVirtualShadowMaps"), True),
    ("lumen", ("Lumen",), True),
    ("megalights", ("MegaLights",), True),
    ("nanite", ("Nanite",), False),
    ("basepass", ("BasePass",), False),
    ("translucency", ("Translucency", "Translucent"), True),
    ("decals", ("Decal",), True),
    ("water", ("SingleLayerWater", "Water"), True),
    ("fog_volumetrics", ("VolumetricFog", "VolumetricCloud", "HeterogeneousVolume", "LocalFog"), True),
    ("lights", ("Lights", "DirectLighting", "LightComposition"), False),
    ("tsr_upscale", ("TemporalSuperResolution", "TSR", "Upscale"), True),
    ("post", ("PostProcessing", "PostProcess", "Bloom", "DepthOfField", "MotionBlur", "Tonemap"), False),
    ("raytracing_scene", ("RayTracingScene", "BuildRayTracing", "RayTracingGeometry"), True),
    ("niagara_gpu", ("Niagara", "FXSystem"), True),
    ("visibility_commands", ("VisibilityCommands",), True),
    ("prepass", ("PrePass", "DepthPass"), False),
]
_STICKY = {b for b, _, s in GPU_BUCKETS if s}


def parse_profilegpu(text):
    """ProfileGPU output from a log into [{"name", "ms", "pct", "depth", "draws"}] in order.

    Tolerant of the classic hierarchy dump ('LogRHI: Warning:    9.8% 1.49ms   Name 12 draws
    ...', depth = left padding, corrected for the 4-wide percent field) and of the 5.8
    `r.ProfileGPU.TableFormatting 0` indentation output (TL part 2). The 5.8 layout is
    [verify] against a real log; only the last dump in the text is returned."""
    dumps, cur = [], []
    for raw in (text or "").splitlines():
        line = _LOG_PREFIX.sub("", raw.rstrip("\n"))
        if not line.strip():
            continue
        m = _PGPU_LINE.match(line)
        if not m:
            if cur and ("Perf marker hierarchy" in raw or "ProfileGPU" in raw):
                dumps.append(cur)
                cur = []
            continue
        name = _DRAWS.sub("", m.group("name")).strip()
        dm = re.search(r"(\d+)\s+draws?", m.group("name"))
        indent = len(m.group("indent").expandtabs(4))
        pct = m.group("pct")
        if pct and len(pct) < 4:           # "%4.1f" pads 9.8 to " 9.8": not depth
            indent = max(0, indent - (4 - len(pct)))
        entry = {"name": name, "ms": float(m.group("ms")),
                 "pct": float(pct) if pct else None, "indent": indent,
                 "draws": int(dm.group(1)) if dm else None}
        if cur and entry["indent"] <= min(e["indent"] for e in cur) and \
                re.match(r"(?i)^frame\b", name) and any(re.match(r"(?i)^frame\b", e["name"]) for e in cur):
            dumps.append(cur)
            cur = []
        cur.append(entry)
    if cur:
        dumps.append(cur)
    if not dumps:
        return []
    last = dumps[-1]
    levels = sorted({e["indent"] for e in last})
    for e in last:
        e["depth"] = levels.index(e["indent"])
        del e["indent"]
    return last


def gpu_pass_table(text_or_passes, budgets=None):
    """Bucket a ProfileGPU dump into features (VSM, Lumen, Nanite, base pass...) by exclusive
    time, so nothing is counted twice. A pass takes its own bucket, or its nearest bucketed
    ancestor's when that bucket is sticky (see GPU_BUCKETS). Same-name passes are also summed
    (FFW [00:10:37]: 'Decals' appears in two places). budgets: {bucket: ms} to flag."""
    passes = parse_profilegpu(text_or_passes) if isinstance(text_or_passes, str) else list(text_or_passes)
    if not passes:
        return {"total_ms": None, "buckets": {}, "passes": [], "same_name": {}, "over": []}
    roots = [p for p in passes if p["depth"] == 0]
    total = max(p["ms"] for p in roots) if roots else max(p["ms"] for p in passes)
    stack, same, eff, parent = [], {}, {}, {}
    child_ms = {}
    for i, p in enumerate(passes):
        while stack and passes[stack[-1]]["depth"] >= p["depth"]:
            stack.pop()
        par = stack[-1] if stack else None
        parent[i] = par
        if par is not None:
            child_ms[par] = child_ms.get(par, 0.0) + p["ms"]
        inherited = next((eff[j] for j in reversed(stack) if eff.get(j)), None)
        own = None
        for bid, keys, _ in GPU_BUCKETS:
            if any(k.lower() in p["name"].lower() for k in keys):
                own = bid
                break
        if inherited in _STICKY:
            eff[i] = inherited
        else:
            eff[i] = own or inherited
        stack.append(i)
        if p["depth"] > 0:
            same[p["name"]] = same.get(p["name"], 0.0) + p["ms"]
    buckets = {}
    for i, p in enumerate(passes):
        excl = max(0.0, p["ms"] - child_ms.get(i, 0.0))
        p["excl"] = round(excl, 4)
        if eff.get(i):
            buckets[eff[i]] = buckets.get(eff[i], 0.0) + excl
    over = []
    for b, v in (budgets or {}).items():
        if buckets.get(b, 0.0) > v:
            over.append({"bucket": b, "ms": round(buckets[b], 3), "budget": v})
    attributed = sum(buckets.values())
    top = sorted((p for p in passes if p["depth"] == 1), key=lambda p: -p["ms"])[:10]
    return {"total_ms": round(total, 3),
            "buckets": {k: round(v, 3) for k, v in sorted(buckets.items(), key=lambda kv: -kv[1])},
            "unattributed_ms": round(max(0.0, total - attributed), 3),
            "top_level": [(p["name"], p["ms"]) for p in top],
            "same_name": {k: round(v, 3) for k, v in same.items()
                          if sum(1 for p in passes if p["name"] == k) > 1},
            "over": over, "passes": passes}


def lumen_delta(frame_ms_on, frame_ms_off, fps=60):
    """Oztalay's Lumen budget test: frame time with Lumen GI and reflections on minus off
    (r.DynamicGlobalIlluminationMethod 0, r.ReflectionMethod 0). About 4 ms at 60 fps and
    8 ms at 30 on console High, 1080p internal (OZ24 [00:37:22] [00:37:55]; LVP). Pass sums
    mislead because Lumen runs async on consoles."""
    budget = 4.0 if fps >= 60 else 8.0
    d = float(frame_ms_on) - float(frame_ms_off)
    return {"delta_ms": round(d, 3), "budget_ms": budget, "over": d > budget,
            "note": "delta measured with async compute as shipped; r.Lumen.AsyncCompute 0 only "
                    "to read passes (LVP)"}


_CVAR_RE = re.compile(r"^\s*(?P<name>[A-Za-z][\w.]*)\s*=\s*\"(?P<value>[^\"]*)\"\s*"
                      r"(?:LastSetBy:\s*(?P<by>[\w ]+?))?\s*$")


def parse_cvar_readback(text):
    """Typing a cvar or sg.* name with no value prints the value and where it was last set
    (SCAL). Parses lines like `r.ScreenPercentage = "100"   LastSetBy: Constructor`
    [verify exact format] into {name: {"value", "last_set_by"}}."""
    out = {}
    for raw in (text or "").splitlines():
        line = _LOG_PREFIX.sub("", raw)
        m = _CVAR_RE.match(line)
        if m:
            out[m.group("name")] = {"value": m.group("value"),
                                    "last_set_by": (m.group("by") or "").strip() or None}
    return out


def check_readback(readback, expected):
    """Compare parsed read-back with expected values {name: value}; returns mismatches."""
    bad = []
    for k, v in expected.items():
        got = readback.get(k)
        if got is None:
            bad.append({"cvar": k, "expected": v, "got": None, "why": "not printed"})
            continue
        try:
            same = abs(float(got["value"]) - float(v)) < 1e-3
        except (TypeError, ValueError):
            same = str(got["value"]) == str(v)
        if not same:
            bad.append({"cvar": k, "expected": v, "got": got["value"],
                        "last_set_by": got["last_set_by"]})
    return bad


_OBJ_TOTAL = re.compile(r"(\d+)\s+Objects\s*\(")
_OBJ_ROW = re.compile(r"^\s*(?P<cls>[A-Za-z_][\w]*)\s+(?P<count>\d+)\s+(?P<kb>\d+(?:\.\d+)?)")


def parse_obj_list(text):
    """`obj list -countsort` output: total UObject count and per-class counts
    (HITCH [00:38:31]) [verify format]. Thresholds: under 500k good, over 1M wrong."""
    total, classes, in_table = None, [], False
    for raw in (text or "").splitlines():
        line = _LOG_PREFIX.sub("", raw)
        if re.search(r"\bClass\b.*\bCount\b", line):
            in_table = True
            continue
        m = _OBJ_TOTAL.search(line)
        if m:
            total = int(m.group(1))
            in_table = False
            continue
        if in_table:
            r = _OBJ_ROW.match(line)
            if r:
                classes.append((r.group("cls"), int(r.group("count"))))
    if total is None and classes:
        total = sum(c for _, c in classes)
    verdict = None
    if total is not None:
        verdict = ("good" if total < 500000 else "reduce" if total < 1000000 else "wrong")
    return {"total": total, "classes": sorted(classes, key=lambda c: -c[1]), "verdict": verdict,
            "source": "HITCH [00:39:06]"}


def parse_pso_misses(text):
    """Count `PSO PRECACHING MISS` blocks (r.PSOPrecache.Validation=2) and collect the
    material and pass lines that follow each (PSO doc 'Debug a PSO Precache Miss')
    [verify block layout]."""
    lines = (text or "").splitlines()
    misses = []

    def field(key):
        k = _nk(key)
        if "material" in k:
            return "material"
        if "vertexfactory" in k:
            return "vertex_factory"
        if "pass" in k:
            return "pass"
        if "state" in k:
            return "state"
        if "component" in k:
            return "component"
        if k.endswith("type"):
            return "type"
        return None

    for i, raw in enumerate(lines):
        if "PSO PRECACHING MISS" in raw:
            info = {}
            for nxt in lines[i + 1:i + 12]:
                if "PSO PRECACHING MISS" in nxt:
                    break
                s = _LOG_PREFIX.sub("", nxt).strip()
                mm = re.match(r"^([A-Za-z][\w ]*?)\s*[:=]\s*(.+)$", s)
                if mm and field(mm.group(1)):
                    info.setdefault(field(mm.group(1)), mm.group(2).strip())
            misses.append(info)
    by_mat = {}
    for m in misses:
        k = m.get("material", "?")
        by_mat[k] = by_mat.get(k, 0) + 1
    return {"count": len(misses), "by_material": by_mat, "misses": misses}


def hitch_snapshots(folder):
    """Files written by `snapshothitches` under Saved/Profiling/Hitches/<process>/, grouped by
    stem: [{"stem", "trace", "image", "files"}] sorted by name (rn58) [verify naming]."""
    groups = {}
    if not folder or not os.path.isdir(folder):
        return []
    for root, _, files in os.walk(folder):
        for fn in files:
            stem, ext = os.path.splitext(fn)
            g = groups.setdefault(os.path.join(os.path.relpath(root, folder), stem),
                                  {"stem": stem, "dir": root, "trace": None, "image": None, "files": []})
            p = os.path.join(root, fn)
            g["files"].append(p)
            if ext.lower() == ".utrace":
                g["trace"] = p
            elif ext.lower() in (".png", ".jpg", ".jpeg", ".bmp", ".exr"):
                g["image"] = p
    return [groups[k] for k in sorted(groups)]


def log_ms_lines(text, pattern):
    """Numbers in ms from log lines matching a regex (GC verbose lines, streaming logs):
    [(line, ms)]. A convenience for formats this skill has not verified yet."""
    rx = re.compile(pattern)
    out = []
    for raw in (text or "").splitlines():
        if rx.search(raw):
            m = re.search(r"(\d+(?:\.\d+)?)\s*ms", raw)
            if m:
                out.append((raw.strip(), float(m.group(1))))
    return out


# =========================================================================== E. config
# Scalability groups set to one level in a device profile. sg.ResolutionQuality is a screen
# percentage (0 to 100), not a 0-3 level: never set it to 2 [added]. List [verify] against
# the installed Engine/Config/BaseScalability.ini.
SG_LEVEL_GROUPS = ("sg.ViewDistanceQuality", "sg.AntiAliasingQuality", "sg.ShadowQuality",
                   "sg.GlobalIlluminationQuality", "sg.ReflectionQuality",
                   "sg.PostProcessQuality", "sg.TextureQuality", "sg.EffectsQuality",
                   "sg.FoliageQuality", "sg.ShadingQuality", "sg.LandscapeQuality")


def resolution_chain(output_h=2160, secondary_h=1440, primary_min_h=800, primary_max_h=1080):
    """Oztalay and the Witcher 4 team's chain: dynamic primary 800p to 1080p, TSR to a 1440p
    secondary (r.SecondaryScreenPercentage.GameViewport), spatial upscale to 4K with UI at
    full size (OZ26 [00:13:38] to [00:15:48]; W4R [00:41:25] to [00:43:08]).

    OZ26 reads the dynres percentages relative to the secondary resolution ('55 to 75, my
    800 to 1080 of 1440') [verify]. He said 75 for the secondary percentage; 1440/2160 is
    66.67 (arithmetic, [added])."""
    sec = 100.0 * secondary_h / output_h
    lo, hi = 100.0 * primary_min_h / secondary_h, 100.0 * primary_max_h / secondary_h
    notes = []
    f_lo, f_hi = secondary_h / float(primary_min_h), secondary_h / float(primary_max_h)
    if f_lo > 2.0 + 1e-6:
        notes.append("TSR factor %.2fx at the dynres floor: beyond the about 2x sweet spot "
                     "(OZ26 [00:14:10]; W4R [00:41:59])" % f_lo)
    if primary_max_h < 1080:
        notes.append("primary never reaches 1080p: TSR starts to lose quality below about "
                     "1080p primary (OZ26 [00:14:10])")
    if secondary_h >= output_h:
        notes.append("secondary equals output: post passes run at output size; the secondary "
                     "step saved about 1 ms at 4K in the Witcher 4 demo (W4R [00:43:08])")
    return {"r.SecondaryScreenPercentage.GameViewport": round(sec, 2),
            "r.DynamicRes.MinScreenPercentage": round(lo, 1),
            "r.DynamicRes.MaxScreenPercentage": round(hi, 1),
            "tsr_factor_range": (round(f_hi, 2), round(f_lo, 2)), "notes": notes}


def day_one_60fps_cvars(output_h=2160, gen9=True, frame_budget_ms=16.0):
    """The Oztalay day-one 60 fps device profile lines with their sources (OZ26 [00:12:32] to
    [00:16:18]; W4S; LVP; FFW). Values are the talks'; every key is [verify] on 5.8.
    Returns [(cvar, value, source)] for `device_profile_block`."""
    chain = resolution_chain(output_h)
    rows = [(g, 2, "OZ26 [00:11:00]: High is the 60 fps level") for g in SG_LEVEL_GROUPS]
    rows += [
        ("r.SecondaryScreenPercentage.GameViewport", chain["r.SecondaryScreenPercentage.GameViewport"],
         "OZ26 [00:15:48] (said 75; 66.67 gives 1440p from 4K); W4R [00:43:08]"),
        ("r.DynamicRes.OperationMode", 2, "OZ26 and W4R profiles use 2: on regardless of "
         "GameUserSettings; 1 follows GameUserSettings and can leave the safety net off "
         "[engine knowledge, verify]"),
        ("r.DynamicRes.FrameTimeBudget", frame_budget_ms, "OZ26 [00:15:48] (16 or 16.66)"),
        ("r.DynamicRes.MinScreenPercentage", chain["r.DynamicRes.MinScreenPercentage"], "OZ26 [00:15:48] (55)"),
        ("r.DynamicRes.MaxScreenPercentage", chain["r.DynamicRes.MaxScreenPercentage"], "OZ26 [00:15:48] (75)"),
        ("r.Lumen.Reflections.MaxRoughnessToTraceForFoliage", 0, "OZ26 [00:41:56]; OZ24 [00:39:33]"),
        ("s.LevelStreamingActorsUpdateTimeLimit", 1, "reduce from the 5 ms default (OZ26 "
         "[00:25:25]); 1 ms on console City Sample (rn56)"),
        ("s.UnregisterComponentsTimeLimit", 1, "1 ms on console City Sample (rn56)"),
        ("r.DistanceFieldShadowing", 0, "redundant with VSM (FFW [00:52:59]); keep only for a "
         "non-VSM path"),
    ]
    if gen9:
        rows.append(("r.GTSyncType", 2, "Gen9 consoles (OZ26 [00:09:27]) [verify]"))
    return rows


def device_profile_block(name, rows, base_profile=None, device_type=None, comment=True):
    """Text of one `[<Name> DeviceProfile]` section for Config/DefaultDeviceProfiles.ini
    (SCAL: DeviceType, BaseProfileName, +CVars=). rows: [(cvar, value, source)]."""
    lines = ["[%s DeviceProfile]" % name]
    if device_type:
        lines.append("DeviceType=%s" % device_type)
    if base_profile:
        lines.append("BaseProfileName=%s" % base_profile)
    for cvar, value, src in rows:
        if cvar == "sg.ResolutionQuality" and isinstance(value, (int, float)) and value <= 3:
            raise ValueError("sg.ResolutionQuality is a percentage, not a 0-3 level")
        if comment and src:
            lines.append("; %s" % src)
        v = ("%g" % value) if isinstance(value, float) else str(value)
        lines.append("+CVars=%s=%s" % (cvar, v))
    return "\n".join(lines) + "\n"


def ini_upsert_section(text, section_header, body_text):
    """Replace the section whose header line equals `section_header` (for example
    '[Mac DeviceProfile]') with `body_text` (which starts with that header), or append it.
    Other sections and comments are kept verbatim."""
    lines = (text or "").splitlines()
    out, i, replaced = [], 0, False
    while i < len(lines):
        if lines[i].strip() == section_header:
            j = i + 1
            while j < len(lines) and not (lines[j].strip().startswith("[") and lines[j].strip().endswith("]")):
                j += 1
            # keep comment lines that belong to the next section's header
            out.extend(body_text.rstrip("\n").splitlines())
            out.append("")
            i, replaced = j, True
            continue
        out.append(lines[i])
        i += 1
    if not replaced:
        if out and out[-1].strip():
            out.append("")
        out.extend(body_text.rstrip("\n").splitlines())
        out.append("")
    return "\n".join(out).rstrip("\n") + "\n"


def ini_set_key(text, section, key, value):
    """Set one `key=value` inside one ini section and keep every other line (unlike
    ini_upsert_section, which replaces the whole section). section is given without brackets
    ('/Script/Engine.Actor'). A plain `key=` line is replaced (duplicates dropped); array
    lines (+key=, -key=, .key=, !key=) and comments are left alone; the section is appended
    when absent."""
    lines = (text or "").splitlines()
    header = "[%s]" % section
    start = next((i for i, l in enumerate(lines) if l.strip() == header), None)
    new_line = "%s=%s" % (key, value)
    if start is None:
        out = list(lines)
        if out and out[-1].strip():
            out.append("")
        out += [header, new_line]
        return "\n".join(out) + "\n"
    end = start + 1
    while end < len(lines) and not (lines[end].strip().startswith("[") and lines[end].strip().endswith("]")):
        end += 1
    body, placed = [], False
    for l in lines[start + 1:end]:
        s = l.strip()
        if s and s[0] not in ";#+-.!" and "=" in s and s.split("=", 1)[0].strip().lower() == key.lower():
            if not placed:
                body.append(new_line)
                placed = True
            continue
        body.append(l)
    if not placed:
        last = max((i for i, l in enumerate(body) if l.strip()), default=-1)
        body.insert(last + 1, new_line)
    return "\n".join(lines[:start + 1] + body + lines[end:]).rstrip("\n") + "\n"


def day_one_engine_ini():
    """Day-one project defaults for Config/DefaultEngine.ini as [(section, key, value, source)]
    (OZ26 [00:06:52] [00:07:23] [00:37:15]; HITCH [00:15:58] [00:18:56]). Keys [verify] on 5.8.
    The collision default applies to meshes imported after it: batch-update existing meshes to
    Use Simple as Complex and set Nanite fallback settings so complex collision is never built
    from the full Nanite mesh (HITCH [00:15:58]; NORSE [00:38:20]); perf_audit_assets lists them."""
    return [
        ("/Script/Engine.PhysicsSettings", "DefaultShapeComplexity", "CTF_UseSimpleAsComplex",
         "OZ26 [00:06:52] [00:07:23]: simple by default, complex opted in per asset; key [verify]"),
        ("/Script/Engine.Actor", "DefaultUpdateOverlapsMethodDuringLevelStreaming", "NeverUpdate",
         "HITCH slide [00:18:56]: default OnlyUpdateMovable; opt volumes back in per actor"),
    ]


def _write_with_backup(path, old, new, backup_dir=None):
    if new == old:
        return {"path": path, "backup": None, "changed": False}
    backup = None
    if old:
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        bdir = backup_dir or os.path.join(os.path.dirname(path), "..", "Saved", "ue_perf_backups", stamp)
        os.makedirs(bdir, exist_ok=True)
        backup = os.path.join(bdir, os.path.basename(path))
        shutil.copy2(path, backup)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(new)
    os.replace(tmp, path)
    return {"path": path, "backup": backup, "changed": True}


def apply_ini_keys(path, rows, backup_dir=None):
    """Apply [(section, key, value, source)] rows with ini_set_key, after a backup copy of the
    file (project rule). Returns {"path", "backup", "changed", "keys"}."""
    old = ""
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
            old = f.read()
    new = old
    for section, key, value, _src in rows:
        new = ini_set_key(new, section, key, value)
    res = _write_with_backup(path, old, new, backup_dir)
    res["keys"] = ["[%s] %s=%s" % (s, k, v) for s, k, v, _ in rows]
    return res


def write_ini_section(path, section_header, body_text, backup_dir=None):
    """Write one section into an ini after copying the current file to a timestamped backup
    (never overwrite without a copy; project rule). Returns {"path", "backup", "changed"}."""
    old = ""
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
            old = f.read()
    return _write_with_backup(path, old, ini_upsert_section(old, section_header, body_text),
                              backup_dir)


# =========================================================================== F. proof
def _as_run(r, i):
    if isinstance(r, dict) and "frames" in r:
        return {"label": r.get("label", "run%d" % i), "frames": normalize_frames(r["frames"]),
                "hygiene": r.get("hygiene", {}), "snapshots": r.get("snapshots")}
    if isinstance(r, str):
        return {"label": os.path.basename(r), "frames": load_frames(r), "hygiene": {},
                "snapshots": None}
    return {"label": "run%d" % i, "frames": normalize_frames(r), "hygiene": {}, "snapshots": None}


def run_summary(run, target_ms=16.67, hitch_ms=None):
    st = frame_stats(run["frames"], target_ms, hitch_ms)
    f = st["frame"] or {}
    out = {"label": run["label"], "n": st["n"], "median": f.get("median"), "p95": f.get("p95"),
           "p99": f.get("p99"), "max": f.get("max"), "mean": f.get("mean"),
           "over_budget_pct": f.get("over_budget_pct"), "hitches": f.get("hitches"),
           "snapshots": run.get("snapshots")}
    for t in THREADS:
        out[t + "_median"] = st[t]["median"] if st[t] else None
        out[t + "_p95"] = st[t]["p95"] if st[t] else None
    if st["dynres"]:
        out["dynres_mean"] = st["dynres"]["mean"]
    return out


HYGIENE_KEYS = ("build", "platform", "device", "route", "dynres", "async_compute", "vsync",
                "named_events", "engine_version")


def _agg(summaries, key):
    vals = [s[key] for s in summaries if s.get(key) is not None]
    if not vals:
        return None, None
    return round(percentile(vals, 50), 3), round(max(vals) - min(vals), 3)


def compare_runs(before, after, target_ms=16.67, hitch_ms=None, parity=None, changes=None,
                 require_zero_over=True):
    """Before/after proof on the same route, build and hardware, several runs each (NORSE
    [00:29:51]: every bar under the line; W4R: hitches judged apart; OZ26 [00:45:55]: VSync
    miss percentage). Gates on the AFTER side:
      G1 every frame at or under target (strict, Ari's 'every line green') or, with
         require_zero_over=False, p99 at or under target [added]
      G2 no hitch frame (> hitch_ms, default two budgets) and zero hitch snapshots if counted
      G3 each stage median (game, draw, gpu) under target
      G4 hygiene identical between before and after for HYGIENE_KEYS present on both
      G5 every change has a visual verdict of accepted or invisible (parity reviewed)
    A delta smaller than the combined run-to-run spread is reported as 'within noise'
    [added rule; no statistics on a handful of runs]."""
    hitch_ms = hitch_ms or 2.0 * target_ms
    B = [_as_run(r, i) for i, r in enumerate(before)]
    A = [_as_run(r, i) for i, r in enumerate(after)]
    sb = [run_summary(r, target_ms, hitch_ms) for r in B]
    sa = [run_summary(r, target_ms, hitch_ms) for r in A]
    keys = ["median", "p95", "p99", "max", "over_budget_pct", "hitches"] + \
           [t + "_median" for t in THREADS]
    table = []
    for k in keys:
        bm, bs = _agg(sb, k)
        am, as_ = _agg(sa, k)
        d = round(am - bm, 3) if (am is not None and bm is not None) else None
        noise = None
        if d is not None and bs is not None and as_ is not None:
            noise = abs(d) <= (bs + as_)
        table.append({"metric": k, "before": bm, "before_spread": bs, "after": am,
                      "after_spread": as_, "delta": d, "within_noise": noise})
    row = {r["metric"]: r for r in table}
    gates = []
    after_max = row["max"]["after"]
    after_p99 = row["p99"]["after"]
    if require_zero_over:
        g1 = after_max is not None and after_max <= target_ms
        gates.append({"id": "G1", "name": "every frame under budget", "pass": g1,
                      "value": after_max, "source": "NORSE [00:29:51]"})
    else:
        g1 = after_p99 is not None and after_p99 <= target_ms
        gates.append({"id": "G1", "name": "p99 under budget [added]", "pass": g1, "value": after_p99})
    snaps = [s["snapshots"] for s in sa if s.get("snapshots") is not None]
    hitches = row["hitches"]["after"] or 0
    g2 = hitches == 0 and all(s == 0 for s in snaps)
    gates.append({"id": "G2", "name": "no hitches (frames > %.1f ms, snapshots)" % hitch_ms,
                  "pass": g2, "value": {"hitch_frames": hitches, "snapshots": snaps},
                  "source": "W4R [00:44:11]; HITCH; rn58"})
    stage = {t: row[t + "_median"]["after"] for t in ("game", "draw", "gpu")}
    known = {t: v for t, v in stage.items() if v is not None}
    g3 = bool(known) and all(v <= target_ms for v in known.values())
    gates.append({"id": "G3", "name": "each stage median under budget", "pass": g3,
                  "value": known, "source": "W4R [00:05:17]; KEN [00:04:04]"})
    mism = []
    for k in HYGIENE_KEYS:
        vb = {r["hygiene"].get(k) for r in B if r["hygiene"].get(k) is not None}
        va = {r["hygiene"].get(k) for r in A if r["hygiene"].get(k) is not None}
        if vb and va and vb != va:
            mism.append({"key": k, "before": sorted(map(str, vb)), "after": sorted(map(str, va))})
    g4 = not mism
    gates.append({"id": "G4", "name": "same capture conditions", "pass": g4, "value": mism,
                  "source": "NORSE [00:45:47]; ARI22 [00:18:40]"})
    ch = list(changes or [])
    pend = [c.get("change") for c in ch if c.get("visual") not in ("accepted", "invisible")]
    if parity:
        pend += [p.get("name") for p in parity if p.get("needs_eyes") and not p.get("reviewed")]
    g5 = not pend
    gates.append({"id": "G5", "name": "visual parity reviewed", "pass": g5, "value": pend,
                  "source": "ARI22 [00:18:05]; FFW [00:21:43]"})
    if not g4:
        verdict = "not_comparable"
    elif all(g["pass"] for g in gates):
        verdict = "stable_at_target"
    elif row["median"]["delta"] is not None and row["median"]["delta"] < 0 and \
            not row["median"]["within_noise"]:
        verdict = "improved_not_stable"
    elif row["median"]["delta"] is not None and row["median"]["delta"] > 0 and \
            not row["median"]["within_noise"]:
        verdict = "regressed"
    else:
        verdict = "no_measurable_change"
    st = toolkit("ue_stat")
    lead_check = None
    if st is not None and hasattr(st, "budget_check") and A:
        try:
            lead_check = st.budget_check(A[0]["frames"], target_ms)
        except Exception as e:  # keep the report going; the lead's schema may differ
            lead_check = {"error": repr(e)}
    return {"target_ms": target_ms, "hitch_ms": hitch_ms, "before": sb, "after": sa,
            "table": table, "gates": gates, "verdict": verdict,
            "hygiene": {"before": [r["hygiene"] for r in B], "after": [r["hygiene"] for r in A]},
            "changes": ch, "parity": parity or [], "ue_stat_budget_check": lead_check}


class ChangeLog:
    """One change, one measurement (OZ digest P7.4): an append-only JSONL of changes with
    their owner, measured delta and visual verdict (pending, invisible, accepted, rejected)."""

    def __init__(self, path):
        self.path = path

    def add(self, change, owner, kind, target, before_ms=None, after_ms=None, visual="pending",
            evidence=None, note=None):
        e = {"time": datetime.datetime.now().isoformat(timespec="seconds"), "change": change,
             "owner": owner, "kind": kind, "target": target, "before_ms": before_ms,
             "after_ms": after_ms,
             "delta_ms": (round(after_ms - before_ms, 3) if before_ms is not None and
                          after_ms is not None else None),
             "visual": visual, "evidence": evidence or [], "note": note}
        os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(e) + "\n")
        return e

    def entries(self):
        if not os.path.isfile(self.path):
            return []
        with open(self.path, "r", encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip()]

    def latest(self):
        """Last entry per change name (a later visual verdict supersedes)."""
        d = {}
        for e in self.entries():
            d[e["change"]] = e
        return list(d.values())


def parity_pair(before_png, after_png, block=16, tol=0.04):
    """Visual parity of one quality trade from the same BugItGo view: mean absolute luminance
    difference, worst block difference, share of changed pixels. Numbers screen, eyes decide
    (ARI22 [00:18:05]: 'it looks the same'). Needs numpy and Pillow (agent side). Thresholds
    [added]: needs_eyes when the worst block moves more than `tol` (0 to 1 luminance)."""
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        return {"name": os.path.basename(after_png), "error": "numpy and Pillow needed",
                "needs_eyes": True}

    def lum(p):
        im = Image.open(p).convert("RGB")
        a = np.asarray(im, dtype=np.float32) / 255.0
        return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2], im.size

    la, sa = lum(before_png)
    lb, sb = lum(after_png)
    if sa != sb:
        return {"name": os.path.basename(after_png), "error": "size mismatch %s vs %s" % (sa, sb),
                "needs_eyes": True}
    d = np.abs(la - lb)
    h, w = d.shape
    hb, wb = max(1, h // block), max(1, w // block)
    blocks = d[:hb * block, :wb * block].reshape(hb, block, wb, block).mean(axis=(1, 3)) \
        if h >= block and w >= block else d
    res = {"name": os.path.basename(after_png), "before": before_png, "after": after_png,
           "mean_abs": round(float(d.mean()), 5), "worst_block": round(float(blocks.max()), 5),
           "changed_share": round(float((d > tol).mean()), 5)}
    rv = toolkit("ue_review")
    if rv is not None and hasattr(rv, "image_checks"):
        try:
            res["after_checks"] = rv.image_checks(after_png)
        except Exception as e:
            res["after_checks"] = {"error": repr(e)}
    res["needs_eyes"] = res["worst_block"] > tol
    return res


def write_proof_report(comparison, out_dir, title="Performance proof", notes=None,
                       not_tested=None):
    """report.md and report.json in out_dir. The report states what was not tested (other
    GPUs, devkits, thermals, driver versions) because a report must match reality."""
    os.makedirs(out_dir, exist_ok=True)
    c = comparison
    L = ["# " + title, "",
         "**Verdict:** %s (target %.2f ms, hitch threshold %.1f ms)." % (c["verdict"], c["target_ms"], c["hitch_ms"]),
         "", "## Gates (after side)", "", "| Gate | Pass | Value | Source |", "|---|---|---|---|"]
    for g in c["gates"]:
        L.append("| %s %s | %s | %s | %s |" % (g["id"], g["name"], "yes" if g["pass"] else "NO",
                                              json.dumps(g["value"])[:120], g.get("source", "")))
    L += ["", "## Frame times (median across runs, spread = max minus min)", "",
          "| Metric | Before | Spread | After | Spread | Delta | Within noise |",
          "|---|---|---|---|---|---|---|"]
    for r in c["table"]:
        L.append("| %s | %s | %s | %s | %s | %s | %s |" % (r["metric"], r["before"], r["before_spread"],
                 r["after"], r["after_spread"], r["delta"], r["within_noise"]))
    L += ["", "## Runs", ""]
    for side in ("before", "after"):
        for s in c[side]:
            L.append("- %s %s: n %s, median %s, p95 %s, p99 %s, max %s, over %.1f%%, hitches %s" % (
                side, s["label"], s["n"], s["median"], s["p95"], s["p99"], s["max"],
                s["over_budget_pct"] or 0.0, s["hitches"]))
    L += ["", "## Capture conditions", "", "```", json.dumps(c["hygiene"], indent=1), "```"]
    if c["changes"]:
        L += ["", "## Changes (one change, one measurement)", "",
              "| Change | Owner | Kind | Target | Before ms | After ms | Delta | Visual |",
              "|---|---|---|---|---|---|---|---|"]
        for e in c["changes"]:
            L.append("| %s | %s | %s | %s | %s | %s | %s | %s |" % (e.get("change"), e.get("owner"),
                     e.get("kind"), e.get("target"), e.get("before_ms"), e.get("after_ms"),
                     e.get("delta_ms"), e.get("visual")))
    if c["parity"]:
        L += ["", "## Visual parity (numbers screen, eyes decide)", ""]
        for p in c["parity"]:
            L.append("- %s: mean %s, worst block %s, changed %s, needs eyes %s, reviewed %s" % (
                p.get("name"), p.get("mean_abs"), p.get("worst_block"), p.get("changed_share"),
                p.get("needs_eyes"), p.get("reviewed", False)))
    L += ["", "## Not tested", ""]
    for n in (not_tested or ["other hardware, GPUs and driver versions than the capture device",
                             "thermal steady state beyond the route length",
                             "cold PSO cache on PC or Mac (unless a cold run is listed)"]):
        L.append("- " + n)
    if notes:
        L += ["", "## Notes", ""] + ["- " + n for n in notes]
    md = os.path.join(out_dir, "report.md")
    js = os.path.join(out_dir, "report.json")
    with open(md, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    with open(js, "w", encoding="utf-8") as f:
        json.dump(c, f, indent=1, default=str)
    return {"md": md, "json": js}


# =========================================================================== G. in-editor
# Everything below needs the `unreal` module (editor Python). NOT YET RUN IN UNREAL: every
# class, property and enum name is [verify]; the probe job
# tests/code/unreal-performance/job_probe_perf.py checks them first.
def _u():
    import unreal  # noqa: F401  (editor only)
    return unreal


def editor_world():
    u = _u()
    return u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()


def game_world():
    """The PIE world, or None when PIE is not running."""
    u = _u()
    try:
        return u.get_editor_subsystem(u.UnrealEditorSubsystem).get_game_world()
    except Exception:
        return None


def console(cmd, world=None):
    """Run a console command in PIE if running, else in the editor world."""
    u = _u()
    u.SystemLibrary.execute_console_command(world or game_world() or editor_world(), cmd)


def console_many(cmds, world=None):
    for c in cmds:
        console(c, world)


def cvar(name, kind="float"):
    u = _u()
    fn = {"float": u.SystemLibrary.get_console_variable_float_value,
          "int": u.SystemLibrary.get_console_variable_int_value,
          "bool": u.SystemLibrary.get_console_variable_bool_value}[kind]
    return fn(name)


def _loaded_actors():
    u = _u()
    return u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()


def perf_audit_level(light_radius_cm=1000.0, ism_instances=500):
    """Level content that costs frames (World Partition maps: only loaded actors, so load the
    region first). Rules and sources:
      shadowed_local_light: shadow-casting local lights with a large radius, and how many
        other shadowed lights overlap each one (VSM projection mask bits: NORSE [00:49:35];
        ARI22 [00:17:33]); radius default [added]
      custom_depth: primitives rendering custom depth (NORSE [00:52:44])
      overlaps_on_movable: non-static components generating overlaps (NORSE [00:39:24])
      decal: size, fade screen size (FFW [00:39:12] [00:41:50])
      ism_complex_collision: ISM/HISM with many instances and non simple-as-complex
        collision (NORSE [00:33:06]; HITCH [00:15:12]); threshold default [added]
      static_mesh_actor_count: one actor per prop (HITCH [00:07:34])
      niagara_components: count per system (NIA [00:19:44])
      non_static_mesh: static mesh props left Movable or Stationary; about 1,000 of them were
        the main cause of a 20 percent drop in a 5.3 project (ARG [00:11:54]). Mobility must be
        correct both ways: a Static actor that moves invalidates the Global Distance Field
        static cache under software Lumen (LVP). Confirm nothing moves them (Sequencer,
        Blueprint) before setting Static."""
    u = _u()
    rows, lights = [], []
    counts = {"StaticMeshActor": 0, "actors": 0, "non_static_mesh": 0}
    nia = {}
    for a in _loaded_actors():
        counts["actors"] += 1
        if isinstance(a, u.StaticMeshActor):
            counts["StaticMeshActor"] += 1
            for c in a.get_components_by_class(u.StaticMeshComponent):
                mob = c.get_editor_property("mobility")
                if mob != u.ComponentMobility.STATIC:
                    counts["non_static_mesh"] += 1
                    rows.append({"rule": "non_static_mesh", "actor": a.get_path_name(),
                                 "component": c.get_name(), "mobility": str(mob)})
        for c in a.get_components_by_class(u.LocalLightComponent):
            if c.get_editor_property("cast_shadows"):
                r = c.get_editor_property("attenuation_radius")
                loc = c.get_world_location()
                lights.append((a.get_path_name(), c.get_name(), r, loc))
        for c in a.get_components_by_class(u.PrimitiveComponent):
            if c.get_editor_property("render_custom_depth"):
                rows.append({"rule": "custom_depth", "actor": a.get_path_name(), "component": c.get_name()})
            if c.get_editor_property("mobility") != u.ComponentMobility.STATIC and \
                    c.get_editor_property("generate_overlap_events"):
                rows.append({"rule": "overlaps_on_movable", "actor": a.get_path_name(),
                             "component": c.get_name()})
        for c in a.get_components_by_class(u.DecalComponent):
            rows.append({"rule": "decal", "actor": a.get_path_name(),
                         "fade_screen_size": c.get_editor_property("fade_screen_size"),
                         "decal_size": str(c.get_editor_property("decal_size")),
                         "scale": str(a.get_actor_scale3d())})
        for c in a.get_components_by_class(u.InstancedStaticMeshComponent):
            n = c.get_instance_count()
            sm = c.get_editor_property("static_mesh")
            bs = sm.get_editor_property("body_setup") if sm else None
            flag = bs.get_editor_property("collision_trace_flag") if bs else None
            if n >= ism_instances and flag != u.CollisionTraceFlag.CTF_USE_SIMPLE_AS_COMPLEX and \
                    c.get_collision_enabled() != u.CollisionEnabled.NO_COLLISION:
                rows.append({"rule": "ism_complex_collision", "actor": a.get_path_name(),
                             "component": c.get_name(), "instances": n, "trace_flag": str(flag)})
        for c in a.get_components_by_class(u.NiagaraComponent):
            asset = c.get_editor_property("asset")
            k = asset.get_path_name() if asset else "None"
            nia[k] = nia.get(k, 0) + 1
    for i, (ap, cn, r, loc) in enumerate(lights):
        overlap = 0
        for j, (_, _, r2, loc2) in enumerate(lights):
            if i != j and (loc - loc2).length() < (r + r2):
                overlap += 1
        if r >= light_radius_cm or overlap >= 2:
            rows.append({"rule": "shadowed_local_light", "actor": ap, "component": cn,
                         "radius_cm": r, "overlapping_shadowed_lights": overlap})
    rows.append({"rule": "static_mesh_actor_count", "value": counts["StaticMeshActor"],
                 "actors": counts["actors"], "non_static_mesh": counts["non_static_mesh"]})
    for k, v in sorted(nia.items(), key=lambda kv: -kv[1]):
        rows.append({"rule": "niagara_components", "system": k, "count": v})
    return rows


def _assets_of(class_path, root="/Game"):
    u = _u()
    ar = u.AssetRegistryHelpers.get_asset_registry()
    pkg, name = class_path.rsplit(".", 1)
    flt = u.ARFilter(class_paths=[u.TopLevelAssetPath(pkg, name)], package_paths=[root],
                     recursive_paths=True)
    return ar.get_assets(flt)


def perf_audit_assets(root="/Game"):
    """Asset settings with a known frame cost (all names [verify]):
      translucent_after_dof: translucency renders after DOF at full output resolution even
        under dynamic resolution (NORSE [00:48:38] [00:49:03])
      default_complex_collision: CTF_USE_DEFAULT keeps per-poly collision from LOD0 or the
        full Nanite mesh (NORSE [00:38:20] [00:38:53])
      foliage_density_scaling_off: non-colliding foliage types without density scaling
        (FFW [00:32:16]; SCAL)
      niagara_no_effect_type: the first Niagara fix (NIA [00:14:14] [00:20:48])
      nanite_complex_collision: Nanite meshes whose complex collision is built from the
        fallback or the full Nanite mesh; set fallback settings and Use Simple as Complex
        (OZ26 [00:07:23] [00:37:15]; NORSE [00:38:20])
      wpo_no_max_displacement: materials driving WPO without a max WPO displacement, so
        Nanite cluster bounds stay conservative (OZ26 [00:37:47]; W4R [00:23:59])
      tessellation_no_displacement_fade: tessellated materials without Displacement Fade
        (OZ26 [00:38:17])
    Property names below are candidates [verify]; a row "property_unknown" names the ones the
    installed engine did not expose, so the probe (P0) can fix them. Generic rules (naming,
    Nanite on, LODs) belong to ue_audit.audit_assets."""
    u = _u()
    rows = []
    for ad in _assets_of("/Script/Engine.Material", root):
        m = ad.get_asset()
        try:
            if m.get_editor_property("blend_mode") == u.BlendMode.BLEND_TRANSLUCENT and \
                    m.get_editor_property("translucency_pass") == u.MaterialTranslucencyPass.MTP_AFTER_DOF:
                rows.append({"rule": "translucent_after_dof", "asset": str(ad.package_name)})
        except Exception as e:
            rows.append({"rule": "error", "asset": str(ad.package_name), "error": repr(e)})
        uses_wpo = _material_uses_input(m, "MP_WORLD_POSITION_OFFSET")
        if uses_wpo:
            name, val = _first_prop(m, ("max_world_position_offset_displacement",))
            if name is None:
                rows.append({"rule": "property_unknown", "asset": str(ad.package_name),
                             "wanted": "max WPO displacement"})
            elif not val:
                rows.append({"rule": "wpo_no_max_displacement", "asset": str(ad.package_name)})
        tname, tess = _first_prop(m, ("enable_tessellation",))
        if tess:
            fname, fade = _first_prop(m, ("enable_displacement_fade", "displacement_fade"))
            if fname is None:
                rows.append({"rule": "property_unknown", "asset": str(ad.package_name),
                             "wanted": "Displacement Fade"})
            elif not fade:
                rows.append({"rule": "tessellation_no_displacement_fade",
                             "asset": str(ad.package_name)})
    for ad in _assets_of("/Script/Engine.StaticMesh", root):
        sm = ad.get_asset()
        bs = sm.get_editor_property("body_setup")
        flag = bs.get_editor_property("collision_trace_flag") if bs else None
        if flag == u.CollisionTraceFlag.CTF_USE_DEFAULT:
            rows.append({"rule": "default_complex_collision", "asset": str(ad.package_name),
                         "lods": sm.get_num_lods()})
        _, ns = _first_prop(sm, ("nanite_settings",))
        if ns is not None and _first_prop(ns, ("enabled",))[1] and bs is not None and \
                flag != u.CollisionTraceFlag.CTF_USE_SIMPLE_AS_COMPLEX:
            rows.append({"rule": "nanite_complex_collision", "asset": str(ad.package_name),
                         "trace_flag": str(flag),
                         "fallback": {k: str(_first_prop(ns, (k,))[1]) for k in (
                             "fallback_target", "fallback_percent_triangles",
                             "fallback_relative_error")}})
    for ad in _assets_of("/Script/Foliage.FoliageType_InstancedStaticMesh", root):
        ft = ad.get_asset()
        try:
            if not ft.get_editor_property("enable_density_scaling"):
                rows.append({"rule": "foliage_density_scaling_off", "asset": str(ad.package_name),
                             "collision": str(ft.get_editor_property("body_instance"))[:80]})
        except Exception as e:
            rows.append({"rule": "error", "asset": str(ad.package_name), "error": repr(e)})
    for ad in _assets_of("/Script/Niagara.NiagaraSystem", root):
        ns = ad.get_asset()
        if ns.get_editor_property("effect_type") is None:
            rows.append({"rule": "niagara_no_effect_type", "asset": str(ad.package_name)})
    return rows


def _first_prop(obj, names):
    """(name, value) of the first readable editor property among candidate names, else
    (None, None). Candidates exist because several 5.8 Python names are [verify]."""
    for n in names:
        try:
            return n, obj.get_editor_property(n)
        except Exception:
            continue
    return None, None


def _material_uses_input(material, prop_enum_name):
    """True when a material property input (for example MP_WORLD_POSITION_OFFSET) has a node
    connected, through MaterialEditingLibrary [verify]; None when it cannot be read."""
    u = _u()
    try:
        node = u.MaterialEditingLibrary.get_material_property_input_node(
            material, getattr(u.MaterialProperty, prop_enum_name))
        return node is not None
    except Exception:
        return None


SAFE_FIXES = {
    # rule -> (property, value, owner, visual check needed)
    "translucent_after_dof": ("translucency_pass", "MTP_BEFORE_DOF", "scenario-unreal-materials", True),
    "overlaps_on_movable": ("generate_overlap_events", False, "scenario-unreal-gameplay", False),
    "foliage_density_scaling_off": ("enable_density_scaling", True, "scenario-unreal-world-building", True),
}

# Findings that need the owner's decision, never an automatic edit: rule -> (owner, action).
REVIEW_ONLY = {
    "non_static_mesh": ("scenario-unreal-world-building", "set Mobility Static where nothing moves it "
                        "(ARG [00:11:54])"),
    "default_complex_collision": ("scenario-unreal-world-building", "Use Simple as Complex unless gameplay "
                                  "needs per-poly queries (HITCH [00:15:58])"),
    "nanite_complex_collision": ("scenario-unreal-world-building", "Nanite fallback settings plus simple "
                                 "collision (OZ26 [00:37:15]; NORSE [00:38:20])"),
    "wpo_no_max_displacement": ("scenario-unreal-materials", "set the material max WPO displacement "
                                "(OZ26 [00:37:47])"),
    "tessellation_no_displacement_fade": ("scenario-unreal-materials", "enable Displacement Fade "
                                          "(OZ26 [00:38:17])"),
    "shadowed_local_light": ("scenario-unreal-lighting-rendering", "tighter radius, shadows off where "
                             "invisible, ray-traced shadows where characters move "
                             "(ARI22 [00:17:33]; AVW [00:26:25])"),
}


def change_requests(rows):
    """Turn audit rows into change requests for their owners (JSON-able): the performance
    agent proposes content changes and applies only config it owns [added protocol].
    SAFE_FIXES rows carry the property to set; REVIEW_ONLY rows carry set=None and an action
    for the owner to decide."""
    out = []
    for r in rows:
        fx = SAFE_FIXES.get(r.get("rule"))
        if fx:
            prop, val, owner, vis = fx
            out.append({"rule": r["rule"], "target": r.get("asset") or r.get("actor"),
                        "component": r.get("component"), "set": {prop: str(val)},
                        "owner": owner, "needs_visual_parity": vis})
        elif r.get("rule") in REVIEW_ONLY:
            owner, action = REVIEW_ONLY[r["rule"]]
            out.append({"rule": r["rule"], "target": r.get("asset") or r.get("actor"),
                        "component": r.get("component"), "set": None, "action": action,
                        "owner": owner, "needs_visual_parity": True})
    return out


def apply_change_requests(requests, apply=False):
    """Apply change requests inside one undoable transaction when apply=True (after the
    owner agreed); otherwise return what would change. Assets are saved; take the parity
    screenshots before and after with ue_review.screenshot from the same BugItGo views."""
    u = _u()
    done = []
    if not apply:
        return {"dry_run": True, "would_change": requests}
    with u.ScopedEditorTransaction("ue_perf change requests"):
        for rq in requests:
            if not rq.get("set"):
                continue  # review-only: the owner decides and edits
            (prop, val), = rq["set"].items()
            if rq.get("component"):
                continue  # component edits: resolve the actor in the level (owner step)
            obj = u.load_asset(rq["target"])
            if prop == "translucency_pass":
                val = getattr(u.MaterialTranslucencyPass, val)
            elif val in ("True", "False"):
                val = val == "True"
            obj.set_editor_property(prop, val)
            u.EditorAssetLibrary.save_loaded_asset(obj)
            done.append(rq)
    return {"dry_run": False, "changed": done}


class RouteRunner:
    """Walk a route's BugItGo waypoints in PIE: at each, move, settle, then issue the marker
    commands and an optional screenshot through ue_review (editor triage only; the proof
    comes from a packaged build). Uses unreal.register_ticker_callback (5.7+). Not yet run.

        rr = RouteRunner(route, "/abs/out", extra=("stat unit",))
        rr.start()        # returns immediately; the editor ticks the route"""

    def __init__(self, route, out_dir, extra=(), settle_frames=30, dwell_frames=90,
                 screenshot=True, on_done=None):
        self.route, self.out_dir, self.extra = route, out_dir, tuple(extra)
        self.settle, self.dwell, self.shot = settle_frames, dwell_frames, screenshot
        self.on_done, self._i, self._f, self._h = on_done, 0, 0, None
        self.log = []

    def start(self):
        u = _u()
        os.makedirs(self.out_dir, exist_ok=True)
        self._h = u.register_ticker_callback(self._tick)
        return self

    def _tick(self, dt):
        u = _u()
        wps = self.route["waypoints"]
        if self._i >= len(wps):
            u.unregister_ticker_callback(self._h)
            if self.on_done:
                self.on_done(self.log)
            return
        wp = wps[self._i]
        if self._f == 0:
            console(wp["bugitgo"])
        elif self._f == self.settle:
            for c in ("Trace.Bookmark %s" % wp["name"], "Trace.Screenshot %s false" % wp["name"]) + self.extra:
                console(c)
            if self.shot:
                rv = toolkit("ue_review")
                if rv is not None:
                    path = os.path.join(self.out_dir, wp["name"] + ".png")
                    try:
                        rv.screenshot(path, 1920, 1080)
                        self.log.append({"waypoint": wp["name"], "screenshot": path})
                    except Exception as e:
                        self.log.append({"waypoint": wp["name"], "error": repr(e)})
        elif self._f >= self.settle + self.dwell:
            self._i, self._f = self._i + 1, -1
        self._f += 1


# =========================================================================== H. CLI
def _main(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="ue_perf.py", description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd")
    b = sub.add_parser("budgets")
    b.add_argument("--platform", default="console")
    b.add_argument("--fps", type=int)
    p = sub.add_parser("plan")
    p.add_argument("--purpose", default="budget")
    p.add_argument("--platform", default="console")
    p.add_argument("--build", default="Test")
    p.add_argument("--tracefile")
    p.add_argument("--attribution", action="store_true")
    p.add_argument("--cores", type=int)
    d = sub.add_parser("diagnose")
    d.add_argument("--frames", required=True)
    d.add_argument("--target", type=float, default=16.67)
    d.add_argument("--vsync", action="store_true")
    t = sub.add_parser("trace")
    t.add_argument("--jsonl", required=True)
    t.add_argument("--target", type=float, default=16.67)
    t.add_argument("--time-unit", default="s")
    t.add_argument("--duration-unit", default="ms")
    t.add_argument("--out")
    s = sub.add_parser("schema")
    s.add_argument("--jsonl", required=True)
    g = sub.add_parser("gpu")
    g.add_argument("--log", required=True)
    r = sub.add_parser("resolution")
    r.add_argument("--output", type=int, default=2160)
    r.add_argument("--secondary", type=int, default=1440)
    r.add_argument("--min", type=int, default=800)
    r.add_argument("--max", type=int, default=1080)
    rp = sub.add_parser("report")
    rp.add_argument("--before", nargs="+", required=True)
    rp.add_argument("--after", nargs="+", required=True)
    rp.add_argument("--target", type=float, default=16.67)
    rp.add_argument("--changes")
    rp.add_argument("--out", required=True)
    ck = sub.add_parser("check")
    ck.add_argument("--measured", required=True)
    ck.add_argument("--fps", type=int, default=60)
    a = ap.parse_args(argv)
    try:
        if a.cmd == "budgets":
            out = budget_table(a.platform, a.fps)
        elif a.cmd == "plan":
            out = capture_plan(a.purpose, a.platform, a.build, a.tracefile,
                               attribution=a.attribution, cores=a.cores)
        elif a.cmd == "diagnose":
            out = diagnose_bound(load_frames(a.frames), a.target, vsync=a.vsync)
        elif a.cmd == "trace":
            an = analyze_trace(load_trace(a.jsonl, a.time_unit, a.duration_unit), a.target)
            if a.out:
                os.makedirs(a.out, exist_ok=True)
                with open(os.path.join(a.out, "trace_report.md"), "w", encoding="utf-8") as f:
                    f.write(trace_report_md(an))
                with open(os.path.join(a.out, "trace_analysis.json"), "w", encoding="utf-8") as f:
                    json.dump(an, f, indent=1, default=str)
            out = {k: an[k] for k in ("stats", "categories", "worst", "counts", "niagara")}
        elif a.cmd == "schema":
            out = schema_probe(a.jsonl)
        elif a.cmd == "gpu":
            with open(a.log, "r", encoding="utf-8", errors="replace") as f:
                tb = gpu_pass_table(f.read())
            tb.pop("passes", None)
            out = tb
        elif a.cmd == "resolution":
            out = resolution_chain(a.output, a.secondary, a.min, a.max)
        elif a.cmd == "report":
            ch = ChangeLog(a.changes).latest() if a.changes else None
            c = compare_runs(a.before, a.after, a.target, changes=ch)
            out = write_proof_report(c, a.out)
            out["verdict"] = c["verdict"]
            print(json.dumps(out, indent=1, default=str))
            return 0 if c["verdict"] == "stable_at_target" else 2
        elif a.cmd == "check":
            with open(a.measured, "r", encoding="utf-8") as f:
                m = json.load(f)
            out = {"features": feature_budget_check(m.get("features", {}), a.fps,
                                                    m.get("budgets"))}
            if m.get("nanite"):
                out["nanite"] = nanite_triage(m["nanite"])
            if m.get("vsm"):
                out["vsm"] = vsm_triage(m["vsm"])
            print(json.dumps(out, indent=1, default=str))
            return 2 if out["features"]["over"] else 0
        else:
            ap.print_help()
            return 1
    except (OSError, ValueError) as e:
        print("error: %s" % e, file=sys.stderr)
        return 1
    print(json.dumps(out, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
