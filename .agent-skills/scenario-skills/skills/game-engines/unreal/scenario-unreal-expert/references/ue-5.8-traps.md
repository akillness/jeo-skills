# UE 5.8 traps that break remembered code and old tutorials

Load before writing Unreal code from memory, following a tutorial recorded before 5.8, or trusting a
doc page that still shows UE4 paths. Every line is old habit, then the 5.8 fact, then the source.
Source codes follow `sources/unreal-version-deltas.md` (rnXX = release notes of 5.X; py-ref, py-ed,
rc, mcp, mrq-cli, sub, mac-req and the others are the saved 5.8 doc pages). `[added]` = not stated
by a saved source; `[verify]` = check on the installed engine (the probe job
`tests/code/unreal-expert/jobs/job_00_probe.py` answers most of them).

## 1. Editor Python API

- **`unreal.EditorLevelLibrary.*` is the pre-subsystem API.** Use
  `unreal.get_editor_subsystem(unreal.EditorActorSubsystem)` for actors (spawn, list, select,
  destroy, duplicate, `convert_actors`), `LevelEditorSubsystem` for levels and PIE (`load_level`,
  `new_level(asset_path, is_partitioned_world=False)`, `save_current_level`,
  `save_all_dirty_levels`, `editor_play_simulate`, `editor_request_end_play`),
  `UnrealEditorSubsystem` for the editor world and primary viewport camera (py-ref; deltas, Python
  section). The old class may still run with deprecation warnings [verify with hasattr]. Epic's own
  5.8 samples still call it: the Python automation-test screenshot sample, the Control Rig samples,
  the Remote Control doc (tests; cr; rc).
- **`unreal.EditorAssetLibrary.*`: prefer `EditorAssetSubsystem`**, same operations (`list_assets`,
  `does_asset_exist`, `rename_asset`, `duplicate_asset`, `save_asset`, `delete_asset`,
  `find_package_referencers_for_asset`, `load_blueprint_class`). The 5.8 Python page still
  recommends the library (py-ed § Working with Assets), so both exist; subsystems are the direction.
- `EditorStaticMeshLibrary` becomes `StaticMeshEditorSubsystem`; `EditorSkeletalMeshLibrary` becomes
  `SkeletalMeshEditorSubsystem` [verify]; `EditorFilterLibrary.by_class` becomes `isinstance`
  (deltas, deprecated list).
- **Destructive calls with silent side effects** (5.8 API docstrings, py-ref): `load_level` closes
  the current level WITHOUT saving; `delete_asset`, `delete_loaded_asset(s)`, `delete_directory` are
  force deletes with no reference check, close asset editors and may clear the undo history;
  `consolidate_assets` deletes and saves; spawning selects the new actor; `get_all_level_actors`
  returns loaded actors only (World Partition cells not loaded are invisible).
- `AssetImportTask.result` is deprecated: use `task.get_objects()`. `destination_name` is ignored
  when Interchange handles the file: the name comes from the pipeline, so import into a per-asset
  folder and rename, or configure the pipeline (py-ref).
- `AssetTools.create_asset(..., overwrite_existing=False)` gained its overwrite flag in 5.8;
  `open_editor_for_assets` moved to `AssetEditorSubsystem` (py-ref; rn58-pipe).
- `@unreal.ufunction(ret=(a, b))` multi-returns are now packed in declared order (they came back
  reversed before 5.8); Optional properties read as None when unset; TraceType and ObjectType names
  were regenerated, old names are deprecated aliases (rn58-pipe § Scripting).
- Instantiating a BlueprintFunctionLibrary (`unreal.SomeLibrary()`) is deprecated since 5.5: call
  its classmethods. A Python-defined BlueprintFunctionLibrary exposed to Blueprint is no longer
  supported: use the Execute Python Script node (rn55; py-ed).
- Validators override `k2_can_validate`, `k2_can_validate_asset`, `k2_validate_loaded_asset` (old
  names deprecated), must call `asset_passes` on success, and Python validators must register
  themselves each session (py-ref). Scripted action utilities with empty SupportedClasses fail data
  validation in 5.8 (rn58-pipe).
- Slate tick callbacks for multi-tick work: use `unreal.register_ticker_callback` (5.7).
  `unreal.collect_garbage()` runs immediately and is commandlet-safe (5.6). Generated names changed
  from `lo_ds` to `lods` (5.6) (deltas, Python section).
- 5.8 opens Blueprint graph editing to Python through `unreal.BlueprintGraphEditor` and new
  `BlueprintEditorLibrary` functions (rn58 § Blueprint). The scope is [verify]: do not promise graph
  authoring before the probe confirms it.
- Asset Registry filters take class paths (`TopLevelAssetPath`, `ARFilter.class_paths`), not class
  names (UE 5.1 change, py-ref § AssetRegistryHelpers; added).
- Python 2 syntax in saved Epic samples (`print "x"`, `xrange` in the Datasmith and latent-test
  pages) is a syntax error in the embedded Python 3.11.8 (py-ed; dsm; tests).
- `unreal.Rotator` positional order is roll, pitch, yaw [added, verify with the probe]: pass
  keywords. `ue_review._rot` does.

## 2. Headless and command line

- `UE4Editor-Cmd` is `UnrealEditor-Cmd`; cook platform `WindowsNoEditor` and `MacNoEditor` are
  `Windows` and `Mac` (deltas § Command line). On Mac the -Cmd location is [verify]:
  `ue_env.find_engine` falls back to `UnrealEditor.app/Contents/MacOS/UnrealEditor` with `-run=`, as
  the 5.8 batch example does.
- `-ExecCmds="py script.py"` at startup is discouraged: it can run before the editor is ready. Use
  `-run=pythonscript -script=` (headless, loads NO level) or `-ExecutePythonScript=` (full editor,
  shuts down right after the script) (py-ed § The Command Line). `ue_run` mode `latent` still uses
  `-ExecCmds py`, but only to register a ticker that waits for warm-up ticks.
- The Python commandlet loads fewer modules than the full editor (Aaron Carlisle, 0guOMTiwmhk
  [01:23:04]) and the Asset Registry may still be scanning: call
  `unreal.AssetRegistryHelpers.get_asset_registry().wait_for_completion()` before any registry
  query, as the 5.8 batch-processor example does (rn58-pipe). `ue_run`'s boot does it before every
  job and records it as `registry_wait`; call `ue_run.wait_for_registry()` yourself in code sent to
  a just-launched editor.
- 5.8 enables source control before the PythonScript commandlet runs the script, because Python
  cannot enable it (rn58-pipe § Scripting Bug Fix) [verify with Perforce and with no provider].
- 5.5: a failing `-ExecutePythonScript` now logs an error "to match the commandlet behavior", and
  `-ScriptErrorsAreFatal` makes it fatal (rn55 § Editor > Scripting); `ue_run` adds the flag in mode
  `editor`. The boot catches job exceptions, so the verdict is the envelope: `ue_run` passes a job
  only on the `UE_RESULT` envelope carrying its job id, never on the exit code (v0.1 took the last
  `UE_RESULT` line in the log, so a job that printed its own "ok" and then crashed the engine
  passed).
- 5.6 lazy Python initialization: with `Engine.Python.IsEnabledByDefault` false, the commandlet and
  `-ExecutePythonScript` force-enable Python; otherwise pass `-EnablePython` (rn56 § Scripting).
- Cooking inside the editor process is deprecated in 5.7 and removed in 5.9: cook with the
  CookCommandlet or UAT. `-DDC=None` was removed in 5.8. Zen is the cooked output store by default
  for new 5.8 projects; where cooked data lands is [verify] (the packaging page still shows
  `Saved/Sandboxes/Cooked-<Platform>`). Set `[Zen.AutoLaunch] LimitProcessLifetime=false` for CI
  (rn57; rn58 § Developer Iteration). Incremental cook for content iteration:
  `BuildCookRun -cookincremental` (Experimental 5.6, Beta 5.7 and 5.8, against Zen); the packaging
  page only knows `-iterate` (deltas, Incremental and multi-process cook).
- Cook-time validation: `-RunAssetValidation -RunMapValidation -ValidationErrorsAreFatal`; without
  the last flag errors become warnings (rn54). `ue_run.build_buildcookrun` adds them. 5.8 adds
  `DataValidation.ReportCookValidationStats` (per-validator duration, on by default) and
  `DataValidation.LoadExternalObjectsForCookValidation` (on) (dval): they name the slow validator in
  a long cook.
- Source control from headless jobs: `ResavePackages` needs `-autocheckout` (`-autocheckin` for
  automated runs) under Perforce, or read-only files are not resaved (naming doc). OFPA changelists
  must be validated and submitted from inside the editor: partial submits leave dangling references,
  and changelist support requires Perforce (World Partition doc, Using OFPA With Source Control).
  Content a builder regenerates on CI, such as PCG partition actors, is not checked in (TbNZ4GKaTow
  [00:26:23]).
- Profiling: the Session Frontend profiler and `stat startfile` are legacy; Unreal Insights plus
  `-trace=` channels; 5.8 adds `TraceQuery` (utrace to JSONL) and `snapshothitches -start`
  (Saved/Profiling/Hitches, needs `stat default`) (rn58 § Insights, Dev Tools). Set cvars at launch
  with `-DPCVars=` (applies before init, can override read-only cvars), not `-ExecCmds` (C-AjCqjKRSs
  [00:14:13]). 5.8 adds World Partition Insights (Spatial Profiler tab, trace channel
  `WorldStreaming` [verify]) for per-cell streaming cost (Looman part 2). When instrumentation
  cannot explain a hitch, add a sampling profiler: sampling is Beta inside Insights since 5.7; the
  talk's standalone samplers (PIX, Superluminal) are Windows tools [added] (C-AjCqjKRSs [00:17:30]
  to [00:18:58]).

## 3. Remote Control and MCP

- **Remote Control server is off until started**: `WebControl.StartServer` (or
  `WebControl.EnableServerOnStartup`); off in packaged and `-game` builds unless
  `-RCWebControlEnable -RCWebInterfaceEnable`; binds 127.0.0.1; HTTP 30010, WebSocket 30020 (rc).
- **5.8: remote UFUNCTION execution is disabled by default**, re-allowable in Remote Control project
  settings, with an allow list (rn58 § Motion Design, Virtual Production). Every 2022-era
  `/remote/object/call` example fails on a fresh 5.8 project. Setting names are [verify]. Property
  access through `/remote/object/property` is not described as affected [verify].
- Remote Control uses C++ names (`bSweep`, not `Sweep`), needs public EditAnywhere properties in the
  editor (BlueprintVisible in PIE and -game), calls static functions on the CDO
  (`/Script/Module.Default__Class`, Python classes at `/Engine/PythonTypes.Default__Class`), and PIE
  objects carry a `UEDPIE_N_` map prefix (rc). 5.5 made per-preset transactions and change events
  opt-in and added an option to block console commands over the web API (rn55).
- **Epic Unreal MCP is Experimental** (plugin `ModelContextProtocol`); it has no tools alone: enable
  All Toolsets (Epic's webinar adds Editor Toolset, "missing from the online documentation",
  k0tgmrBuIJc [00:06:00]); Auto Start Server is false by default; `127.0.0.1:8000/mcp`, HTTP and SSE
  only, no auth; tool calls run serially on the game thread; Tool Search is on (`list_toolsets`,
  `describe_toolset`, `call_tool`) (mcp). `describe_toolset` payloads can be huge: materials "2,000
  to 26,000", Niagara "almost a quarter of a million" (k0tgmrBuIJc [00:45:31]).
- `[HTTPServer.Listeners] DefaultBindAddress=0.0.0.0` (the RC LAN recipe) is read by the MCP
  listener too, so it likely exposes the unauthenticated MCP server [added inference, verify with
  `ue_remote.loopback_only(8000)`].
- Community MCP servers: chongdashu/unreal-mcp is unmaintained since April 2025; prebuilt bridge
  binaries are engine-version locked; Monolith listens on all interfaces (mcp-comm). Install none
  without Emmanuel's approval.
- The 5.7 in-editor AI Assistant panel is not an MCP server (rn57).

## 4. Rendering defaults an agent must read before acting

- **Substrate**: Production Ready and on by default for NEW projects since 5.7; projects upgraded to
  5.7+ keep the legacy path until Project Settings > Rendering > Substrate materials is enabled
  (restart). Read `r.Substrate` in `Config/DefaultEngine.ini` (`ue_env.read_ini_value`) before
  authoring. Substrate materials render black with Substrate off; "Convert to Substrate" is one-way;
  the Slab has no Metallic input (Diffuse Albedo, F0, F90); the default GBuffer is Blendable;
  Adaptive needs SM6 on Mac; the Substrate page lists Mac among paths with known issues; the Path
  Tracer page still calls Substrate experimental (sub; rn57; deltas Conflicts 4).
- Global illumination: Lumen; Lumen Lite at Medium scalability is Beta in 5.8; Ray Tracing GI
  removed (5.4); SSGI deprecated (5.8); Lumen mesh SDF detail tracing deprecated
  (`r.Lumen.TraceMeshSDFs 0` default since 5.7). Projects converted from UE4 keep their old renderer
  settings: read `r.DynamicGlobalIlluminationMethod`, `r.ReflectionMethod`,
  `r.Shadow.Virtual.Enable` first [added] (deltas, Lighting).
- MegaLights is Production Ready in 5.8 (Experimental 5.5, Beta 5.7); the sun stays on deferred plus
  VSM unless `r.MegaLights.DirectionalLights 1` (ml).
- Static lighting is off in new templates (`r.AllowStaticLighting=False`, 5.5): UE4 "Build Lighting"
  steps do not apply (rn55).
- Exposure: EV100 with "Extend default luminance range", "Exposure Compensation" (not "Exposure
  Bias"), `r.EyeAdaptation.Focus` removed (4.25). The viewport EV100 override bypasses the post
  process volume, so screenshots taken with it do not match the game view (expo).
- 5.8 unified cached-lighting pre-exposure as `r.EyeAdaptation.CachedLightingPreExposure` (default
  4); guides naming `r.Lumen.CachedLightingPreExposure` or
  `r.SkyLight.RealTimeReflectionCapture.PreExposure` are stale. The editor now shows an on-screen
  warning when exposure leaves the supported range and lighting would clip (5.6 moved Lumen's cached
  range to -8 to 24 EV): look for it after every render and screenshot, and grep the log (expo;
  lighting digest, exposure range guard; exact warning text [verify]).
- Deprecated cvars now ensure, warn or assert when used (5.8) (rn58 § Core): do not set cvars from
  memory; read the list in the domain skill.

## 5. Movie Render Queue and Movie Render Graph

- MRG is Production Ready in 5.8 and "new features will be graph-only"; MRQ presets are legacy; the
  5.8 queue defaults to a "Basic" config type; Quick Render exists since 5.6 (rn58 § Production
  Rendering Pipeline; rn56). The saved MRG page still shows "Movie Render Graph (Beta)" [verify the
  menu label].
- `MoviePipelineMasterConfig` is `MoviePipelinePrimaryConfig`; graph jobs use
  `job.get_graph_preset()` / `set_graph_preset()`, not `get_configuration()`; keep the PIE executor
  referenced (module-level); callbacks subclass `unreal.MovieGraphScriptBase`; the 5.8 Execute
  Script node needs "Editor Only" mode for Python (mrq-cli; rn58).
- Command line: `-LevelSequence=<seq> -MoviePipelineConfig=<Primary Config preset>` or
  `-MoviePipelineConfig=<saved queue>`, with `-game`; the legacy Render Movie arguments are gone
  (mrq-cli). End frames are exclusive (0 to 50 renders 0 to 49). The path tracer in MRQ ignores the
  PPV samples per pixel (spatial x temporal samples instead) (seq-tips; pt).
- Mac output: the H.264 node is Windows only; ProRes on Mac conflicts between sources [verify]
  (rn56; mrg). Disable the tone curve for EXR output or the grade is baked in (Bardoux, MjjkWH0eT3U
  [00:37:22]).
- Game Overrides act invisibly: legacy MRQ configs apply them even when the setting was never added;
  in MRG only while the Global Game Overrides node is connected. They are the first suspect when a
  render differs from the viewport (William Faucher, fVg5ihB8Wdc [00:03:33]; rendering digest,
  consensus 6 and delta 7; MRG doc, Globals).
- Command-line renders take `-notexturestreaming`, present in every example of the MRQ command line
  doc (`ue_review.build_render_command` adds it). Unattended multi-shot renders need a farm manager
  (Deadline for Unreal): a crash in plain MRQ loses the queue (Glitch Productions, uzTo5vQchkk
  [00:40:14]). A PIE executor that is not kept in a global reference can be garbage collected
  mid-render (mrq-cli).

## 6. Mac

- 5.8 renders on Apple Silicon only (Intel rendering removed). Lumen SWRT and TSR on M1+; Nanite and
  VSM Beta on M2+; Lumen HWRT and MegaLights Experimental on M2+; path tracing through Metal ray
  shaders with macOS 26.4 or later advised (mac-req; rn58 § All Apple). This Mac: M5 Max, macOS
  26.5.1, 48 GB (observed by `ue_env.preflight()` on 2026-09-24).
- Xcode: Epic's macOS page says 26.0 minimum, 26.1.1 recommended, 26.4 not compatible; the 5.8 SDK
  table disagrees (Xcode 15.x for macOS hosts); this Mac has Xcode 26.6, which neither lists. A C++
  or code-plugin build is [verify] (mac-req; rn58; deltas Conflicts 1). Blueprint-only projects need
  no Xcode.
- Docs use `UnrealEditor-Cmd.exe`, `RunUAT.bat`, `C:\` paths and Ctrl shortcuts: on Mac use the
  binaries under `Engine/Binaries/Mac`, `RunUAT.sh`, POSIX paths, and usually Cmd [verify] (uat;
  added). DX11, DX12 and Vulkan cvars and tips do not apply: Metal only. RenderDoc does not support
  Metal: use Xcode's Metal debugger [added]. Unreal Insights memory callstacks are not listed for
  Mac (ins).
- Keep the Unreal project in a path without spaces (Allar 2.1.2): this project's folders contain
  spaces [added suggestion; verify whether spaces break cook or UAT]. The toolkit stages its own
  jobs in a space-free folder regardless.
- A MacBook keyboard has no numpad: the Gameplay Debugger's category keys (Abilities on numpad 3)
  need rebinding (tranek GAS guide 6.2, cited in deltas § GAS). Sampling profiler on Mac:
  Instruments Time Profiler [added].

## 7. First-run checklist for the toolkit (answer, then update this file and the SKILL.md status line)

1. `python3 ue_env.py --find`: engine root, version 5.8.x, which `editor_cmd` exists.
2. `tests/code/unreal-expert/run_all.sh --live` with `UE_TEST_PROJECT` set: probe (commandlet and
   editor), protocol, planted error, audit, latent review. Read
   `archive/tests/unreal-expert/<stamp>/results/test_ue_live.py314.json` and `live/probe_*.json`.
3. Confirm or correct: `-abslog=` and `-stdout` on Mac; UE's Mac launcher quoting of argv with
   spaces; `-ExecCmds=py` plus ticker in mode `latent`; `SystemLibrary.quit_editor`;
   `AutomationLibrary.take_high_res_screenshot` keywords and where the file lands;
   `executor.execute(queue)` on a transient queue; graph variable override API; the Rotator order;
   `get_console_variable_string_value`.
4. `run_all.sh --remote` (PREPARE=1 once): MCP health and loopback, PythonRemote discovery defaults
   (239.0.0.1:6766, TCP 6776), Remote Control 5.8 call refusal and the setting names, the toolset
   plugin identifiers.
5. `ue_run` v0.2: a planted boot failure in mode `editor` exits non-zero with
   `-ScriptErrorsAreFatal`; `AssetRegistry.wait_for_completion` exists (else the
   `search_all_assets(True)` fallback); an editor opened from the Launcher and from the Finder shows
   its `.uproject` in `ps -axo pid=,command=` (the write-lock check depends on it); the
   exposure-range warning text, to grep it.

## 8. Version changes in other domains that the blind test caught

Listed here because code written from memory hits them; the owner skill carries the procedure.

- scenario-unreal-materials: a Blendable GBuffer is a ceiling (every platform becomes Blendable, SM6
  included), Adaptive falls back per platform (5.7; material updates note). 5.8 compiles only
  connected, non-zero outputs (`r.Material.UseShaderCompilationParameters`), so "delete the node to
  strip shaders" is obsolete (wobQ8ZKQpbc [00:13:13]). Static Component Mask Parameter is obsolete:
  Channel Mask Parameter, or a dot product with a float3 of 1s and 0s (wobQ8ZKQpbc [00:42:35]). The
  Temporal Responsiveness node (5.7) is Experimental and needs
  `r.Velocity.TemporalResponsiveness.Supported=1`; sampler type errors after a texture swap: Clean
  Graph > Fixup Mismatched Samplers (5.7) (material updates note).
- scenario-unreal-world-building: `landscape.ForceLayersUpdate` is deprecated in 5.8: use the
  command `landscape.ForceLayersFullUpdate` (rn58 via deltas).
- scenario-unreal-performance: VSM receiver masks are the default for directional lights since 5.7;
  5.8 adds `r.Shadow.Virtual.DeferredInvalidationBudget`; 5.7 adds experimental `r.Nanite.PrimeHZB`
  passes against the camera-cut GPU hitch (optimization digest; Looman part 2).
