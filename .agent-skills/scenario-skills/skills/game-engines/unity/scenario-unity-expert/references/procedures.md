# Lead procedures (copyable, each with its live test and result)

All run in Unity 6000.3.21f1 on macOS 26.5.1 (Apple Silicon, Metal) on 2026-09-24, project
`tests/projects/unity-expert` (APFS clone of Base3D_URP, path with spaces). Header for every
snippet:

```python
import sys; sys.path.insert(0, "<skills>/scenario-unity-expert/scripts")
import ut_env, ut_run, ut_live, ut_review, ut_stat
P = ut_env.base_project("3d", "<project>/tests/projects/<skill>")
```

## P1. Preflight and project facts

```python
pf = ut_env.preflight(P)            # editor, modules, license days left, lock state, Xcode
assert pf["license"]["ok"] and not pf["lock"]["locked"]
facts = ut_run.run_method(P, "AgentKit.AgentJob.Echo", {"hello": "world"})["result"]
# render_pipeline, color_space, active_target, quality_level, enter_play_mode_options, input_handler, scripting_backend
```

Test: `test_live_toolkit.py::test_01`. Result: pass, 10.1 s, URP asset PC_RPAsset, Linear,
StandaloneOSX, Input System only, Mono, domain reload on Play.

## P2. Baseline captures from bookmarks, checked and looked at

```python
# once: bookmarks saved in the scene (disabled cameras named AgentView_*), from any job:
#   AgentCapture.SaveBookmark("Front", new Vector3(0, 2.2f, -7), new Vector3(0, 0.6f, 0), 50f)
cap = ut_run.run_method(P, "AgentKit.AgentCapture.CaptureViews",
                        {"scene": "Assets/Scenes/X.unity", "width": 1280, "height": 720}, graphics=True)
rev = ut_review.review_capture(cap)          # flags per frame + rev["sheet"]
assert rev["errors"] == 0                    # then OPEN rev["sheet"] and look
```

Test: `test_04`. Result: pass, 3 shots via `RenderPipeline.SubmitRenderRequest`, saturation
0.16/0.14/0.22, contact sheet opened; negative controls: `CaptureBlack` flagged `all_black`, the
same capture with `-nographics` refused with the graphics message.

## P3. Content audit before building on it

```python
a = ut_run.run_method(P, "AgentKit.AgentAudit.AuditAssets", {"folders": ["Assets/Art"], "max_texture_size": 2048})
s = ut_run.run_method(P, "AgentKit.AgentAudit.AuditScene", {"scene": "Assets/Scenes/X.unity"})
errors = [f for f in a["result"]["findings"] + s["result"]["findings"] if f["severity"] == "error"]
```

Test: `test_05`. Result: pass on generated assets: `texture.readable`, `texture.normal_as_default`,
`model.scale_large` (a cube authored in cm: 200 m), `material.builtin_shader_in_srp` (Standard in
URP) found; the 1 m cube not flagged; demo scene 0 errors, 5 renderers, 1,892 triangles.

## P4. Tests as the verdict

```python
e = ut_run.run_tests(P, "EditMode"); p = ut_run.run_tests(P, "PlayMode")
assert e["ok"] and p["ok"], (e["failures"], p["failures"])
one = ut_run.run_tests(P, "EditMode", filter="Ns.Class.Test")     # a single test, also [Explicit] ones
```

Test: `test_06`. Result: pass; EditMode 2 passed + 1 explicit skipped, PlayMode 1 passed (a
Rigidbody falls under gravity, `linearVelocity`), about 14 s each; the explicit failing test named
by filter: ok=False, exit code 2, message parsed.

## P5. Play-mode timing capture

```python
r = ut_run.run_method(P, "AgentKit.AgentProfile.PlayModeTimings",
                      {"scene": "Assets/Scenes/X.unity", "frames": 300, "warmup": 60}, quit=False, graphics=True, timeout=900)
summ = ut_stat.summarize_csv(r["result"]["csv"], target_ms=ut_stat.fps_to_ms(60))
summ["budget"]["verdict"], summ["gc"], summ["bound_by"]
```

Test: `test_07`. Result: pass, 240 frames, CPU frame p50 0.79 ms, 54 draw calls, 30 SetPass, GC p50
168 B per frame (Editor baseline), Render Thread counter missing, GPU not measured in the Editor
(`bound_by` unknown). Editor numbers are for iteration; the verdict comes from a development player.

## P6. Player builds with a report

```python
mac = ut_run.build(P, "macos", out="Builds/macOS/Game.app")
web = ut_run.build(P, "web", out="Builds/Web")
ut_stat.build_summary(web, max_mb=20)["verdicts"]
ut_run.run_method(P, "AgentKit.AgentJob.Echo", build_target="StandaloneOSX")   # pin the platform back
```

Test: `test_live_build.py`. Result: pass. macOS (Mono, universal): 114.7 MB, 60 s first build, 4.6
to 11.6 s incremental. Web (IL2CPP, Brotli): 12.2 MB, 259 s first build, 19.9 to 24.5 s incremental;
files `Web.wasm.br` 7.8 MB, `Web.data.br` 4.4 MB, loader, framework. 0 errors, 0 warnings.

## P7. Live session next to an open project

```python
h = ut_live.start_headless(P)                         # or the user's GUI editor with AgentKit compiled
ut_live.channel(P)["channel"]                         # "bridge"
ut_live.call(P, "AgentKit.AgentCapture.CaptureViews", {"scene": "Assets/Scenes/X.unity"})
ut_live.eval(P, "return Camera.main.name;", via="bridge")
ut_live.stop_headless(P)
```

Test: `test_live_bridge.py::LiveBridge`. Result: pass; boot 4.6 s, batch job refused with
`ProjectLockedError` while it ran (process + held lock file), ping 0.11 to 0.53 s, capture 0.53 to
0.64 s, bridge eval 3.2 to 5.4 s compile + 1.0 to 2.9 s call (two runs), a broken snippet reported
and the editor recovered.

## P8. Unity CLI + Pipeline session

```python
ut_live.pipeline_install(P)                           # before the editor opens the project
ut_live.start_headless(P)
ut_live.cli_status(P); ut_live.cli_command(project=P)                     # list the editor's commands
ut_live.cli_command("screenshot", {"output": "/abs/shot.png", "width": 1280, "height": 720}, project=P)
ut_live.eval(P, "return AgentKit.AgentCapture.RenderCamera(Camera.main, 640, 360, \"/abs/x.png\");")   # auto -> Pipeline
```

Test: `test_live_bridge.py::LiveCli` (`UT_TEST_CLI=1`; backs up and restores the manifest). Result:
pass; CLI 1.0.0-beta.11, package 0.7.0-exp.1, batch editor listed `ready` on port 7800, 151
commands, eval 0.033 to 0.15 s after 0.46 to 1.1 s, screenshot correct at once, eval compile errors
returned as `COMMAND_FAILED`.

## P9. Toolkit v0.2 fixes (refactor round 1)

```python
r = ut_run.run_method(P, "My.Job", args)                    # grace timeout on by default
r["grace_kill"]                                             # None, or {killed, reason, pid, after_s}
ut_run.run_method(P, "My.Job", args, grace=0, result_grace=0)   # opt out (e.g. a job that logs nothing for minutes after its result: none should)
cap = ut_run.run_method(P2D, "AgentKit.AgentCapture.CaptureViews", {"scene": "Assets/Scenes/Level.unity"}, graphics=True)
cap["result"]["lights2d_warmed"]                            # URP 2D lights rebuilt before the capture
```

```csharp
if (AgentJob.TryList("waypoints", out var pts)) { /* key present */ }
var tags = AgentJob.ListOrNull("tags") ?? new List<object> { "default" };   // AgentJob.List(...) ?? ... never falls back
var rb = go.GetComponent<Rigidbody>(); if (rb == null) rb = go.AddComponent<Rigidbody>();   // never ?? on a Unity object
```

Test: `test_live_fixes.py` (7 tests) and `test_offline.py::TestV02Fixes` (4 tests). Result: pass.
Nullability: `List`/`Dict` of a missing key empty (not null), `TryList` false with null,
`ListOrNull ?? x` fell back, `List ?? x` did not. Fake null: destroyed object `== null` true,
`ReferenceEquals` false, `??` returned the destroyed object; missing component `== null` true, not
C# null, access `MissingComponentException`. `scan_log`: a result line with `.asmdef` and `"error":`
gave 0 compile errors. Grace (two runs): hang in `EditorApplication.quitting` ended at 15 to 17 s
(`grace=5`), main-thread hang at 28 to 33 s (`result_grace=20`), exit -15, PID gone, project
unlocked, next job ok; Echo and a 30-tick async job not touched; offline fake editors: killed after
2 s of silence, a still-logging one and a clean one left alone, a bystander process untouched. 2D
warm-up (2D URP clone, `archive/tests/unity-expert/Proj2D_capture`): cold capture uniform (center
0.091 linear, only the Global light), warmed capture center 0.315 linear, +1.79 stops over the
surround; sheet `archive/tests/unity-expert/captures_2d/sheet_cold_warm.png` looked at.
