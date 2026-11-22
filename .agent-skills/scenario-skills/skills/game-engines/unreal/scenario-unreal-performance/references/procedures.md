# Procedures (ue_perf and the shared toolkit, full code)

**Status of every Python block below: not yet run in Unreal** (UE 5.8 not installed on 2026-09-24).
Each block starts with `# test: <id>` and `# status: ...`.
`tests/code/unreal-performance/test_ue_perf_offline.py` extracts every block from this file and
parses it (syntax only), and runs the pure functions the blocks call on synthetic captures (stat
unit style frames, a CSV-profiler-like file, TraceQuery-like JSONL, a classic ProfileGPU dump, cvar
read-back, `obj list`, PSO miss blocks, a snapshothitches folder). That proves the analysis and
proof logic, not any UE name, file layout, cvar or flag: those stay [verify] until
`job_probe_perf.py` (P0) and a first real capture confirm them.

Conventions. Agent side is system `python3`. Editor side runs through scenario-unreal-expert's
channels: `ue_remote.PythonRemote().exec(code)` (or the MCP server) into a running editor,
`ue_run.run_python(uproject, script)` headless. The editor does not tick while a script runs
(version deltas, Python "Latent work"): set a view mode in one call and screenshot in the next. A
packaged game has no editor Python: it takes launch flags (`-ExecCmds`, `-DPCVars`, `-trace`) and
whatever the route's Level Sequence event track issues. Paths are absolute; each session writes a
new dated folder.

Source codes: `sources.md` (OZ26, OZ24, W4R, W4S, NORSE, HITCH, ARI22, KEN, FFW, TL, NIA, MOB, AVW,
ARG, PSO, SCAL, LVP, INS, STAT, PKG).

```python
# test: P_setup
# status: not yet run in Unreal (pure Python); test: test_ue_perf_offline.py (syntax)
import datetime, glob, json, os, subprocess, sys
PROJ = "/abs/path/to/2026-09-24 Unreal Engine Expert Skills"   # this repository
SCRIPTS = [os.path.join(PROJ, "skills", "scenario-unreal-performance", "scripts"),
           os.path.join(PROJ, "skills", "scenario-unreal-expert", "scripts")]
sys.path[:0] = SCRIPTS
import ue_perf as P
import ue_env
import ue_remote
ENG = ue_env.find_engine()           # dict: root, editor, editor_cmd, uat, insights, trace_query, exists
GAME = ue_env.find_project("/abs/MyGame")      # dict: uproject, root, name, config...
OUT = os.path.join("/abs/perf", datetime.datetime.now().strftime("%Y-%m-%d %H%M"))
os.makedirs(OUT, exist_ok=True)
EDITOR_PREFIX = "import sys; sys.path[:0] = %r\nimport ue_perf as P\n" % SCRIPTS
REMOTE = ue_remote.PythonRemote(project=GAME["name"])   # Python Remote Execution on in Project Settings
REMOTE.open()                                           # raises with a hint when no editor answers


def in_editor(code):
    """Run code in the running editor (the MCP server is the alternative channel).
    Returns ue_remote.command_output(): success, result, stdout, errors, ue_result."""
    out = REMOTE.exec(EDITOR_PREFIX + code)
    if not out.get("success", True):
        raise RuntimeError(out.get("errors") or out)
    return out
```

## P0. Probe the tools, the API names and the cvars

Why: every flag, cvar and Python name here comes from talks and docs, not the installed engine; the
TraceQuery schema is undocumented (rn58 says only "JSONL to stdout"). Probe once per engine install
and write the answers into this section.

```python
# test: P0_probe
# status: not yet run in Unreal; in-editor part: tests/code/unreal-performance/job_probe_perf.py
import importlib.util
import ue_run
job = os.path.join(PROJ, "tests", "code", "scenario-unreal-performance", "job_probe_perf.py")
env = ue_run.run_python(GAME["uproject"], job, timeout=900)   # envelope: ok, result, log_path...
assert env["ok"], (env.get("error"), env.get("log_tail"))
res = env["result"]
print("missing API:", [k for k, ok in res["api"].items() if not ok])   # fix ue_perf section G
print("props:", json.dumps(res["props"], indent=1))
# The job typed each cvar with no value; the engine prints value and LastSetBy (SCAL)
rb = P.parse_cvar_readback(open(env["log_path"], errors="replace").read())
spec = importlib.util.spec_from_file_location("probe", job)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)               # offline import: `unreal` absent, nothing runs
print("cvars that printed nothing:", [c for c in probe.CVARS if c not in rb])
# TraceQuery: a UBT program new in 5.8; a Launcher install may not ship it [verify]
tq = ENG["trace_query"] if ENG else None
if tq and os.path.exists(tq):
    print(subprocess.run([tq, "--help"], capture_output=True, text=True).stdout[:3000])
else:
    print("TraceQuery missing. Source engine: RunUBT.sh TraceQuery Mac Development [verify]. "
          "Fallback: CSV profiler for frame series, Insights GUI for timers (gui-paths.md).")
```

On the first real JSONL (P7), run `P.schema_probe(jsonl)` and set `time_unit` and `duration_unit`
for `P.load_trace`. Record here: TraceQuery path, arguments, record kinds, key names, units; the
packaged Mac game's Saved folder; which cvars printed nothing.

## P1. Frame the gap and write the budget table

Why: milliseconds per stage, decided at project start (OZ26 [00:45:55]; W4R [00:05:17]). 38 fps is
26.3 ms, 9.6 ms over the 60 fps stage. Only sourced numbers are pre-filled; GPU pass budgets are the
project's decision.

```python
# test: P1_budgets
# status: not yet run in Unreal (pure Python); test: test_ue_perf_offline.py TestPlans.test_budgets
b = P.budget_table("console", 60, pass_budgets={
    # written with the lighting and art leads; None = still open
    "nanite_visbuffer": None, "basepass": None, "vsm_shadow_depths": None, "vsm_projection": None,
    "translucency": None, "decals": None, "post_and_tsr": None, "fog_volumetrics": None,
    "niagara_gpu": None, "other": None})
gap_ms = 1000.0 / 38 - b["stage_ms"]
json.dump(b, open(os.path.join(OUT, "budgets.json"), "w"), indent=1)
print("gap %.1f ms, problems %s" % (gap_ms, b["problems"]))
for n in b["notes"]:
    print(" -", n)
```

## P2. The repeatable route

Why: one fixed path, same cameras, same moments, or nothing compares (NORSE [00:45:47] [00:46:19];
FFW [00:02:52]). `BugIt` prints a `BugItGo` line per view; bookmarks and trace screenshots map
timings back to places (KEN slide [00:06:59]; INS).

```python
# test: P2_route
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestPlans.test_stat_sequences_and_route
# 1. In PIE, stand at each hot spot (busiest market, crowd fight, fastest traversal, a camera
#    cut) and run `BugIt`. Read the BugItGo lines back from the editor log:
editor_log = os.path.join(GAME["root"], "Saved", "Logs", GAME["name"] + ".log")
route = P.route_from_bugit(open(editor_log, errors="replace").read(), name="market_busiest",
                           dwell_s=5.0, map_path="/Game/Maps/OpenWorld")
json.dump(route, open(os.path.join(OUT, "route.json"), "w"), indent=1)
# 2a. Editor triage (never proof, NORSE [00:41:39]): start PIE, then walk the route with
#     markers and screenshots. BugItGo needs the PIE player's cheat manager [verify].
in_editor("import unreal\n"
          "unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).editor_request_begin_play()\n")  # [verify name]
in_editor("import json\nr = json.load(open(%r))\nRR = P.RouteRunner(r, %r, extra=('stat unit',)).start()\n"
          % (os.path.join(OUT, "route.json"), os.path.join(OUT, "pie_route")))
# 2b. Packaged builds: the camera comes from a Level Sequence (owner scenario-unreal-cinematics) whose
#     event track issues these commands, then "csvprofile stop" and "quit" at the end [added].
events = P.route_event_track(route, start_s=3.0)
json.dump(events, open(os.path.join(OUT, "route_event_track.json"), "w"), indent=1)
```

Alternative for packaged runs [verify for 5.8]: the Automated Performance Testing plugin
(Experimental in 5.5) runs static-camera and sequence tests from Gauntlet with Insights and CSV
output (rn55). GUI path for the event track in `gui-paths.md`.

## P3. Lean capture runs on the target

Why: cooked build on target hardware, lean capture for the budget, three runs to know the spread;
editor numbers are triage (NORSE [00:07:36] [00:41:39]; PKG "Cook By the Book"). The package comes
from scenario-unreal-pipeline-automation: Test from a source engine, Development from a Launcher
engine (PKG build table).

```python
# test: P3_capture
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestPlans.test_capture_plans
# Package (handoff to scenario-unreal-pipeline-automation; flags [verify]):
#   RunUAT.sh BuildCookRun -project=<abs uproject> -platform=Mac -clientconfig=Test
#     -build -cook -stage -pak -iostore -archive -archivedirectory=<abs> -utf8output
APP = "/abs/Builds/Mac/MyGame.app"                      # archive layout [verify]
EXE = P.packaged_binary(APP)
# A packaged Mac game writes Saved/ under the user Library, not beside the .app [added][verify]
GAME_SAVED = os.path.expanduser("~/Library/Application Support/Epic/MyGame/Saved")
runs = []
for i in range(3):
    plan = P.capture_plan("budget", platform="mac", build="Test", csv_profile=True,
                          tracefile=os.path.join(OUT, "lean_%d.utrace" % i))
    argv = P.launch_command(EXE, plan) + ["-abslog=" + os.path.join(OUT, "lean_%d.log" % i)]  # [verify]
    print(" ".join(argv))
    subprocess.run(argv, timeout=900)                  # the route's last event quits the game
    runs.append({"trace": plan["args"][1].split("=", 1)[1], "log": argv[-1].split("=", 1)[1],
                 "hygiene": dict(plan["hygiene"], route=route["name"], device="M5 Max, macOS 26.5")})
json.dump(runs, open(os.path.join(OUT, "lean_runs.json"), "w"), indent=1)
# Console devkit: the same plan["args"] go into the devkit launch by CI or a person; the agent
# reads the .utrace, CSV and log they return. A Mac number never proves a console target.
```

## P4. Classify: which stage is the bound

Why: Frame close to Game, Draw or GPU picks the branch (KEN slide [00:22:58]; STAT); GPU and RHIT
follow Frame, so an RHIT verdict needs the trace (STAT); an Epic-level scalability on a 60 fps
target is the first finding (OZ26 [00:11:00]).

```python
# test: P4_classify
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestFramesAndDiagnosis
csvs = sorted(glob.glob(os.path.join(GAME_SAVED, "Profiling", "CSV", "*.csv")))   # folder [verify]
frames = P.load_frames(csvs[-1])            # through ue_stat's CSV profiler parser when present
d = P.diagnose_bound(frames, target_ms=16.67,
                     context={"dynres_locked": False, "editor": False, "mac_proxy": True})
print(d["bound"], d["gap_ms"], d["also_over"], d["per_frame_bound"])
for c in d["caveats"]:
    print(" caveat:", c)
print(" next capture:", d["next"])
# Which scalability is really active (value and LastSetBy), in a running editor or PIE:
in_editor("P.console_many(%r)\n" % P.stat_sequence("scalability_readback"))
rb = P.parse_cvar_readback(open(os.path.join(GAME["root"], "Saved", "Logs",
                                             GAME["name"] + ".log"), errors="replace").read())
# In a packaged run, pass the same names as capture_plan(..., extra_exec=...) and read its log.
print({k: v for k, v in rb.items() if k.startswith("sg.")})   # any 3 on a 60 fps target: fix first
```

## P5. Config first: device profile, resolution chain, read-back

Why: the day-one 60 fps settings are the cheapest large wins: `sg.*` at 2 plus a selector that
activates the profile, the resolution chain, Lumen foliage threshold 0, GTSyncType 2 on Gen9,
streaming under the 5 ms default (OZ26 [00:08:56] to [00:16:50] [00:25:25] [00:41:56]). Change group
contents in `*Scalability.ini`, choose levels in device profiles (SCAL). One change per measurement.

```python
# test: P5_device_profile
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestConfig.test_device_profile_and_ini
rows = P.day_one_60fps_cvars(output_h=2160, gen9=False)    # Mac or PC; gen9=True adds r.GTSyncType 2
chain = P.resolution_chain(2160, 1440, 800, 1080)
print(chain)                                               # 66.67, 55.6, 75.0; TSR factor 1.33 to 1.8
block = P.device_profile_block("Mac", rows, device_type="Mac")
cfg = os.path.join(GAME["root"], "Config", "DefaultDeviceProfiles.ini")
res = P.write_ini_section(cfg, "[Mac DeviceProfile]", block,
                          backup_dir=os.path.join(OUT, "config_backup"))   # copy first, always
print(res)
# The roughness threshold depends on the content's roughness: read the Lumen Performance
# Overview (P6) first, then lower Max Roughness To Trace on the PPV or clamp it per profile.
log = P.ChangeLog(os.path.join(OUT, "changes.jsonl"))
log.add("day-one 60 fps device profile (Mac)", "scenario-unreal-performance", "config", cfg,
        before_ms=26.3, visual="pending", note="measure with P3, then log again with after_ms")
# After the next launch, LastSetBy must name the device profile:
expected = {"sg.GlobalIlluminationQuality": 2, "sg.ShadowQuality": 2,
            "r.SecondaryScreenPercentage.GameViewport": chain["r.SecondaryScreenPercentage.GameViewport"]}
print("read-back mismatches:", P.check_readback(rb, expected))
```

Which profile a device boots with is not a text edit: Lyra's local settings logic, the example
selector plugin, or the platform selector modules (OZ26 [00:16:50] [00:17:21]); a code task for
scenario-unreal-gameplay or a human.

Day-one project defaults in `DefaultEngine.ini`, one key at a time (other keys in the section stay):
simple collision by default so queries never hit 2M-triangle Nanite fallbacks, and no overlap checks
on streamed-in actors (OZ26 [00:06:52] [00:07:23]; HITCH slide [00:18:56]).

```python
# test: P5b_engine_ini
# status: not yet run in Unreal (pure Python); test: test_ue_perf_offline.py TestSuspectTrees.test_ini_set_key_and_day_one
eng_ini = os.path.join(GAME["root"], "Config", "DefaultEngine.ini")
rows = P.day_one_engine_ini()        # [(section, key, value, source)]; keys [verify] (P0 reads the CDOs)
print(P.apply_ini_keys(eng_ini, rows, backup_dir=os.path.join(OUT, "config_backup")))
log.add("Use Simple as Complex default + NeverUpdate overlaps", "scenario-unreal-performance", "config",
        eng_ini, visual="invisible", note="gameplay check with scenario-unreal-gameplay: volumes that need overlaps opt back in")
# The collision default applies to new meshes: existing ones come from the audit (P8,
# rules default_complex_collision and nanite_complex_collision) as change requests.
```

Also on day one (not text edits): Nanite fallback settings on every Nanite mesh, because fallbacks
feed ray tracing, complex collision, HLOD builds and non-Nanite platforms (OZ26 [00:37:15]); without
them complex collision is built from the full Nanite mesh (NORSE [00:38:20]).

## P6. GPU deep pass

Why: attribute pass costs with resolution locked and async compute on the graphics pipe (NORSE
[00:44:07] [00:45:12]; KEN [00:20:10]), prove any change with async back on. Lumen is budgeted by
delta (OZ24 [00:37:55]); VSM starts at the Nanite VisBuffer (OZ24 [00:47:52]); masked, PDO and WPO
Nanite content pays in VisBuffer, shadow depths and custom depth (NORSE [00:53:48]).

```python
# test: P6_gpu
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestLogParsers.test_profilegpu, test_lumen_delta
plan = P.capture_plan("gpu", platform="console", build="Test", attribution=True,
                      tracefile=os.path.join(OUT, "gpu_attr.utrace"),
                      extra_exec=["r.ProfileGPU.TableFormatting 0"])
# At each waypoint (event track, or RouteRunner(extra=("ProfileGPU",)) in PIE): ProfileGPU
# writes one frame's pass tree to the log; 5.8 adds pipe waits (TL part 2).
game_log = open("/abs/devkit_capture/MyGame.log", errors="replace").read()
t = P.gpu_pass_table(game_log, budgets={"lumen": 4.0})
print(t["total_ms"], t["buckets"], t["unattributed_ms"], t["same_name"], t["over"])
# Lumen by delta at the same waypoint: stat_sequence("lumen_delta") turns GI and reflections
# off, then restores them; frame ms comes from the CSV of each state.
print(P.lumen_delta(frame_ms_on=26.3, frame_ms_off=21.4, fps=60))
# Views that locate the cause, one screenshot each from the same BugItGo view (editor):
views = {"lumen_perf_overview": ["r.Lumen.Visualize 2"],      # mode number [verify]
         "vsm_cache": P.stat_sequence("vsm_cache_view"),
         "vsm_stats": P.stat_sequence("vsm"),
         "nanite_pixel_programmable": ["r.Nanite.Visualize.PixelProgrammableVisMode 0"],
         "rt_instances": P.stat_sequence("ray_tracing")}
import ue_review
vdir = os.path.join(OUT, "views")
os.makedirs(vdir, exist_ok=True)
for name, cmds in views.items():
    png = os.path.join(vdir, name + ".png")
    in_editor("P.console_many(%r)\n" % cmds)             # one call: set the mode
    in_editor("import ue_review\nue_review.screenshot(%r, 1920, 1080)\n" % png)   # next call: request
    if not ue_review.wait_for_file(png, timeout=60):     # the file appears after editor ticks
        print(name, "no screenshot")
        continue
    chk = ue_review.image_checks(png)
    print(name, ue_review.image_verdict(chk))            # rejects all-white or all-black frames
    in_editor("P.console_many(['r.Lumen.Visualize 0', 'ShowFlag.VisualizeVirtualShadowMap 0', "
              "'r.ShaderPrintEnable 0'])\n")             # restore [verify values]
```

Reading order (OZ24 decision tree; NORSE triage): the one big number, then many small ones, then
numbers where they should not be (Nanite programmable raster in custom depth, Niagara readbacks in
Visibility Commands). A bucket over budget becomes a change request for its owner (P8). Look at
every view image yourself. A platform GPU profiler on the devkit (PIX, Razor) or Xcode on Apple
hardware answers occupancy and bandwidth questions ProfileGPU cannot (NORSE [00:06:29] [00:42:12];
MOB).

## P6b. The suspect trees: feature budgets, Nanite, VSM, async compute

Why: each feature has a budget and an order of levers (OZ24 [00:29:18]: "what's your Nanite
budget?"). The trees are written as code so the order is not skipped: Nanite views that locate
(Evaluate WPO, Pixel Programmable) before Overdraw, which is a locator and never a verdict (OZ24
[00:31:00] to [00:32:13]); for VSM, chase the larger of static and dynamic invalidations (OZ24
[00:48:59]); async compute is an optimization to A/B per feature, about 1.5 ms overall in the
Witcher demo while Lumen reflections back on graphics saved more (W4R [00:20:42] [00:21:48]).

```python
# test: P6b_trees
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestSuspectTrees
# Numbers from P6 (ProfileGPU buckets, lumen_delta), stat SceneRendering, NaniteStats and
# r.ShaderPrintEnable 1 + r.Shadow.Virtual.ShowStats 2 read off the screenshot or log [verify
# formats]; budgets for Nanite and VSM passes are the project's (P1).
feat = P.feature_budget_check({"lumen_delta_ms": 4.9, "rt_active_instances": 131000,
                               "rt_scene_update_ms": 0.9, "gt_wait_ms": 1.8}, fps=60)
for f in feat["findings"]:
    print(f["status"], f["key"], f["value"], f["budget"], f["owner"])
    for lever in f["levers"]:
        print("   ", lever)
print("capture next:", feat["not_measured"])
nan = P.nanite_triage({"visbuffer_ms": 5.5, "visbuffer_budget_ms": 3.0, "programmable_ms": 3.4,
                       "fixed_function_ms": 1.4, "basepass_ms": 3.1, "basepass_budget_ms": 3.5,
                       "helper_lanes": 9.0})
vsm = P.vsm_triage({"depths_ms": 4.2, "depths_budget_ms": 3.0, "static_invalidated": 310,
                    "dynamic_invalidated": 1450, "local_lights_with_movers": 7,
                    "receiver_mask_directional": "1"})
for s in nan + vsm:
    print(s["step"], "->", s["action"], "(", s["source"], ")")
# Each step that names a view: set it in one editor call, screenshot in the next (P6 loop),
# e.g. P.stat_sequence("nanite") in order, P.stat_sequence("vsm") for the read-backs.
# Async compute A/B on the devkit: three runs per variant, same route, GPU median per run.
ab_runs = P.ab_plan(P.ASYNC_AB_VARIANTS)
plans = {r["label"]: P.capture_plan("budget", platform="console", build="Test",
                                    extra_dpcvars=r["dpcvars"],
                                    tracefile=os.path.join(OUT, "async_%s.utrace" % r["label"]))
         for r in ab_runs}
gpu_median = {"baseline": 17.9, "lumen_reflections_off": 17.1, "global_off": 19.4}   # from the CSVs
print(P.ab_verdict(gpu_median, spread_ms=0.3))     # keep only variants that beat the spread
```

Levers the trees point to, with the owner who applies them: WPO disable distance, material max WPO
displacement, Displacement Fade on tessellated materials, masked to opaque, PDO removal, Pixel
Programmable Distance, shading bins through Custom Primitive Data and MPCs
(scenario-unreal-materials; OZ26 [00:37:47] to [00:39:20]; FFW [00:21:43] [00:25:31]); far field
occlusion-only, near field about 150 m, foliage RT proxies, lower landscape LOD in RT, staggered
dynamic RT updates (scenario-unreal-lighting-rendering and scenario-unreal-world-building; W4R
[00:29:30] to [00:32:11]); receiver masks, WPO clipmap LOD bias, 5.8 deferred invalidation budget,
SMRT ray counts, ray-traced shadows for local lights that characters cross
(scenario-unreal-lighting-rendering; OZ24 [00:46:49]; AVW [00:26:25] [00:31:42]; TL part 2). Foliage
density through `foliage.DensityScale` and `grass.DensityScale` driven by `sg.FoliageQuality`, only
on non-colliding types with Enable Density Scaling (FFW [00:32:48] [00:33:18]).

## P7. CPU deep pass from a rich trace

Why: read the worst frame thread by thread, drop the waits, count instances against what is on
screen (KEN [00:09:24]; NORSE [00:24:20] [00:25:24]). TraceQuery (5.8) turns a `.utrace` into JSONL,
so the agent does not need the Insights GUI.

```python
# test: P7_cpu_trace
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestTrace
plan = P.capture_plan("gt", platform="console", build="Test",
                      tracefile=os.path.join(OUT, "gt_rich.utrace"))
utrace = "/abs/devkit_capture/gt_rich.utrace"
jsonl = os.path.join(OUT, "gt_rich.jsonl")
with open(jsonl, "w") as f:                    # arguments [verify] from P0's --help output
    subprocess.run([ENG["trace_query"], utrace], stdout=f, check=True, timeout=1800)
print(P.schema_probe(jsonl)["keys"].keys())    # confirm the mapping before trusting numbers
tr = P.load_trace(jsonl, time_unit="s", duration_unit="ms")      # units from P0
an = P.analyze_trace(tr, target_ms=16.67,
                     count_names=("LineTrace", "Sweep", "CharacterMovement", "SkeletalMesh", "SpawnActor"))
open(os.path.join(OUT, "gt_trace_report.md"), "w").write(P.trace_report_md(an, "Game thread, market route"))
print(an["categories"], an["counts"], an["niagara"], an["render_over_frames"][:10])
# Runtime counts at a waypoint: stat_sequence("cpu_game") (dumpticks grouped, listtimers,
# obj list -countsort) through the event track or in PIE, then parse the log:
objs = P.parse_obj_list(open("/abs/devkit_capture/MyGame.log", errors="replace").read())
print(objs["total"], objs["verdict"], objs["classes"][:10])
# Waits are budget: analyze_trace reports game-thread waits per frame and names them.
print(an["game_wait"], an["advice"])          # advice names the sampling profiler when needed
sb = P.spawn_bursts(tr)                        # complex spawns per frame (HITCH [00:25:29])
print(sb["flagged"][:5], sb["fix"])
```

Crowd levers for scenario-unreal-gameplay and scenario-unreal-animation, in the Witcher 4 order:
fewer full-fidelity NPCs (300 to 200 took the game thread to 11.5 ms, W4R [00:16:53]), Mass or
Instanced Actors for far agents, significance-based ticks, the Animation Budget Allocator from day
one (OZ26 [00:34:48]), MetaHuman LOD1 at most in gameplay (NORSE [00:28:49]). The Allocator is on by
default (`a.Budget.Enabled`) but throttles only skeletal mesh components registered with it (Enable
Animation Budget node, Auto Register with Budget Allocator); `a.Budget.Debug.Enabled` is its
overlay, and Epic's animation docs say to use it instead of URO, not with it
(animbp-architecture-performance doc).

Game-thread waits on animation and movement finalization (about 2 ms at 300 NPCs, about 1 ms at 200
in the Witcher demo) are reclaimable: slot gameplay into the gap or move animation evaluation into
the physics gap (W4R [00:16:20] [00:16:53]). Spawns are not incremental like streaming: cap complex
spawns per frame (one character per frame on low-end targets), defer skeletal init with the "Tick
Animation On Skeletal Mesh Init" project setting and hide the first frame, one pool per actor type
(HITCH [00:25:08] to [00:27:26]). When a slow frame matches no signature, instrumentation has run
out: run a sampling profiler alongside Insights (Superluminal or PIX on Windows, Instruments Time
Profiler on a Mac, the platform tools on consoles; the 5.8 `StackSampling` channel is Windows only)
(NORSE [00:17:30] to [00:18:58]; MOB [00:07:05]; INS).

## P7b. Streaming: per-cell cost, latency in frames, top-speed traversal

Why: streaming is a budget respected in every frame, and its cost shows as latency as much as ms
(W4S [00:04:07] [00:22:13]); the attack order is component count, overlaps, then the Experimental
async helpers as A/B only (W4S; HITCH [00:12:30] [00:22:56]).

```python
# test: P7b_streaming
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestSuspectTrees.test_feature_budget_check, test_ab_plan_and_verdict
plan = P.capture_plan("streaming", platform="console", build="Test",
                      tracefile=os.path.join(OUT, "traverse.utrace"))
# Route: the fastest gameplay traversal (vehicle, mount, flying camera) with the streaming
# source blocking on slow loading; pass = no pause while streaming catches up (W4S [00:33:26]
# [00:35:08]). Read AddToWorld, RemoveFromWorld, ProcessAsyncLoading and GC per frame, and
# per-cell cost in World Partition Insights (Spatial Profiler, 5.8; gui-paths.md).
feat = P.feature_budget_check({"streaming_gt_ms": 2.6, "streaming_latency_frames": 51},
                              budgets={"streaming_latency_frames": 30})   # latency: project-set
ab = P.ab_plan(P.STREAMING_AB_VARIANTS, base_dpcvars={"s.LevelStreamingActorsUpdateTimeLimit": 1})
for r in ab:                                     # A/B only while Experimental; never shipped
    print(r["label"], P.capture_plan("streaming", platform="console",
                                     extra_dpcvars=r["dpcvars"])["command_line"])
```

Fixes in order (W4S; HITCH): fewer components (ISM runtime cell transformer, Packed Level Actors,
FastGeo after the ISM transformer), `DefaultUpdateOverlapsMethodDuringLevelStreaming=NeverUpdate`
(P5b), the Simple Streamable Asset Manager (worth it even without FastGeo, W4S [00:40:11]), then the
unified budget and async physics state as A/B (the latter pays only with spare worker cycles, W4S
[00:18:16]).

## P8. Content audits and change requests (Editor Python)

Why: the usual offenders are settings on assets and actors, not cvars (NORSE; FFW; HITCH). The
performance agent finds and measures them; the owner applies or approves.

```python
# test: P8_audit
# status: not yet run in Unreal (all property and enum names [verify], see P0); offline syntax only
audit_json = os.path.join(OUT, "audit.json")
in_editor(r'''
import json
import ue_audit
lvl = P.perf_audit_level(light_radius_cm=1000.0, ism_instances=500)   # thresholds [added]: calibrate
ast = P.perf_audit_assets("/Game")
generic = ue_audit.audit_assets(["/Game"], profile="game")   # the lead's rules: Nanite, LODs, collision...
json.dump({"level": lvl, "assets": ast, "requests": P.change_requests(lvl + ast),
           "generic_verdict": generic.get("verdict")},
          open(%r, "w"), indent=1, default=str)
''' % audit_json)
audit = json.load(open(audit_json))
by_owner = {}
for r in audit["requests"]:
    by_owner.setdefault(r["owner"], []).append(r)
json.dump(by_owner, open(os.path.join(OUT, "change_requests_by_owner.json"), "w"), indent=1)
# After the owner agrees: in_editor("P.apply_change_requests(%r, apply=True)" % reqs), then
# parity screenshots from the same BugItGo views before and after (P10).
```

World Partition maps expose only loaded actors to `perf_audit_level`: load the route's region first
(scenario-unreal-world-building's region procedure). Content lives in source control; a change
request is the unit of review.

Rules added in the refactor pass: `non_static_mesh` (props left Movable or Stationary; about 1,000
of them caused a 20 percent drop in a shipped 5.3 shooter, ARG [00:11:54]; mobility must be correct
both ways, since a Static actor that moves invalidates the Global Distance Field static cache under
software Lumen, LVP), `nanite_complex_collision`, `wpo_no_max_displacement` and
`tessellation_no_displacement_fade` (OZ26 [00:07:23] [00:37:15] to [00:38:17]; NORSE [00:38:20]).
These come back as review-only requests (`set` is None, `action` says what to decide): the owner
confirms nothing moves a prop before it goes Static. A `property_unknown` row means the candidate
Python name did not exist on the installed engine: fix it from P0.

## P9. Hitch hunt (cold and warm)

Why: hitches are judged apart from the average (W4R [00:44:11]); `snapshothitches` writes a trace
snapshot and a screenshot per hitch (rn58); a warm driver cache hides PSO stutter, so PC, Mac and
mobile runs start cold (HITCH [00:35:50]; PSO doc); consoles compile PSOs at cook (PSO blog).

```python
# test: P9_hitch
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestLogParsers.test_hitch_snapshots, TestTrace.test_categories
for label, cold in (("cold", True), ("warm", False)):
    plan = P.capture_plan("hitch", platform="mac", build="Test", cold=cold, gc_log=True,
                          tracefile=os.path.join(OUT, "hitch_%s.utrace" % label),
                          extra_dpcvars={"r.PSOPrecache.Validation": 2})
    argv = P.launch_command(EXE, plan) + ["-abslog=" + os.path.join(OUT, "hitch_%s.log" % label)]
    subprocess.run(argv, timeout=1200)
snaps = P.hitch_snapshots(os.path.join(GAME_SAVED, "Profiling", "Hitches"))    # [verify]
rows = []
for s in snaps:
    if not s["trace"]:
        continue
    j = s["trace"] + ".jsonl"
    with open(j, "w") as f:
        subprocess.run([ENG["trace_query"], s["trace"]], stdout=f, timeout=600)
    an = P.analyze_trace(P.load_trace(j), 16.67)
    rows.append({"snapshot": s["stem"], "image": s["image"], "categories": an["categories"],
                 "worst": an["worst"]})
json.dump(rows, open(os.path.join(OUT, "hitches.json"), "w"), indent=1, default=str)
cold_log = open(os.path.join(OUT, "hitch_cold.log"), errors="replace").read()
print(P.parse_pso_misses(cold_log)["by_material"])        # PC and Mac only; nothing on consoles
print(P.log_ms_lines(cold_log, r"LogGarbage"))            # GC phases, line format [verify]
# Open every snapshot image: what was on screen (cell boundary, spawn wave, first effect).
```

Classification and owner per signature: `ue_perf.HITCH_SIGNATURES` (blocking load, PSO, GC,
streaming, spawn, physics, content ticks, RHI). A spike present cold and absent warm is a PSO or
first-load candidate [added method].

GPU hitches after camera cuts: the frames after a cut lose occlusion history and overdraw (W4R
[00:44:11] [00:44:44]). Put every camera cut of the route on a bookmark, then:

```python
# test: P9b_camera_cuts
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestSuspectTrees.test_camera_cut_spikes
frames = P.load_frames(sorted(glob.glob(os.path.join(GAME_SAVED, "Profiling", "CSV", "*.csv")))[-1])
cuts = [412, 1290]            # frame indices of the cuts (bookmarks or the sequence's cut list)
for c in P.camera_cut_spikes(frames, cuts, target_ms=16.67):
    print(c)                   # spike -> r.Nanite.PrimeHZB (5.7) [verify], Overdraw view on the frame after
```

Prevent blocking loads at authoring time, not only in traces: a validator that rejects Load Asset
Blocking and Load Class Asset Blocking nodes in gameplay Blueprints (Ari's CommonValidators plugin,
github.com/Flassari/CommonValidators, or removing the nodes from the engine), run by
scenario-unreal-pipeline-automation through the data validation step [verify the 5.8 Python entry
point] (HITCH [00:44:44] [00:45:16]).

## P10. Prove the result and guard it

Why: same route, build and device, several runs, async compute on, dynres locked and as shipped;
every frame under the line (NORSE [00:29:51]); VSync-miss share as the budget metric (OZ26
[00:45:55]); visual parity for each trade (ARI22 [00:18:05]); a nightly automated test keeps it
(OZ26 [00:47:43]).

```python
# test: P10_proof
# status: not yet run in Unreal; test: test_ue_perf_offline.py TestProof
hyg = {"build": "Test", "platform": "console", "route": "market_busiest",
       "dynres": "locked 75", "async_compute": "on", "vsync": "off"}
before = [{"label": "before_%d" % i, "frames": P.load_frames(p), "hygiene": dict(hyg), "snapshots": None}
          for i, p in enumerate(sorted(glob.glob("/abs/devkit/before/*.csv")))]
after = [{"label": "after_%d" % i, "frames": P.load_frames(p), "hygiene": dict(hyg), "snapshots": 0}
         for i, p in enumerate(sorted(glob.glob("/abs/devkit/after/*.csv")))]
parity = [P.parity_pair(os.path.join(OUT, "before_views", wp["name"] + ".png"),
                        os.path.join(OUT, "after_views", wp["name"] + ".png"))
          for wp in route["waypoints"]]
for p in parity:                       # numbers screen, eyes decide: open both images
    p["reviewed"] = False              # set True only after looking at the pair
cmp_ = P.compare_runs(before, after, target_ms=16.67, parity=parity,
                      changes=P.ChangeLog(os.path.join(OUT, "changes.jsonl")).latest())
paths = P.write_proof_report(cmp_, os.path.join(OUT, "proof"), title="Market route, 38 to 60 fps",
                             not_tested=["retail console thermals over one hour",
                                         "scenes other than the market route",
                                         "cold PSO cache (console target, not applicable)"])
print(cmp_["verdict"], paths)
```

Repeat the after side with dynamic resolution as shipped and report the mean screen percentage
(`dynres_mean`). Guard: scenario-unreal-pipeline-automation runs the route nightly (Gauntlet or
Automated Performance Testing) and fails the build when `compare_runs` against the last accepted run
says `regressed` [added wiring]; 5.8 Horde shows these trends (rn58 pipeline notes).

## P11. Apple hardware: the native "why" and the thermal state

Why: Insights tells where, platform tools tell why (MOB [00:06:00]); Metal System Trace shows shader
compiles, drawable waits, GPU performance state and thermals that can invalidate a capture (MOB
[00:14:06] [00:15:42] [00:16:44]). Use it when the target is a Mac or iOS device, or to explain a
Mac proxy number.

```python
# test: P11_apple
# status: not yet run (xctrace and pmset flags [added][verify]); offline syntax only
trace = os.path.join(OUT, "metal_system_trace.trace")
cmd = ["xcrun", "xctrace", "record", "--template", "Metal System Trace",
       "--output", trace, "--time-limit", "30s", "--launch", "--", EXE] + \
      P.capture_plan("budget", platform="mac")["args"]
subprocess.run(cmd, timeout=300)
therm = subprocess.run(["pmset", "-g", "therm"], capture_output=True, text=True).stdout
open(os.path.join(OUT, "thermal.txt"), "w").write(therm)
# Reading the .trace and a Metal frame capture is GUI work in Instruments and Xcode (gui-paths.md).
```
