---
name: scenario-unreal-expert
description: "Use when an agent drives Unreal Engine 5.8 on a Mac for any task: Editor Python (the unreal module), headless UnrealEditor-Cmd -run=pythonscript jobs, Epic's Unreal MCP server, the Remote Control API, console commands and cvars; when a script breaks on 5.8 (EditorLevelLibrary, Remote Control calls refused, Substrate materials black, MRQ presets); when a level, material, shot or build must be judged by numbers and a screenshot before it is called done; or when a brief must go to the right scenario-unreal-* specialist."
license: MIT
---

# Unreal expert (technical director and agent protocol)

Expert Unreal work is a loop run against numbers: set the budget, build one stage, measure it, look
at it, fix it, then advance. An agent without a mouse gets there by choosing the right channel for
each action, working like the Details panel (one transaction, explicit saves), and never trusting
its own eyes alone. This skill is the protocol, the shared toolkit in [`scripts/`](scripts/), and
the map to the team. Target: UE 5.8 on macOS Apple Silicon. If a sibling skill named here is missing
from your available skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**Status (2026-09-24):** UE 5.8 is not installed. Every in-engine call in `scripts/` and
`references/` is **not yet run in Unreal**. The pure-Python parts ran offline and pass (eight test
files, 314 checks on Python 3.14, 311 on 3.9). First action once the engine is installed:
`tests/code/unreal-expert/run_all.sh --live` with `UE_TEST_PROJECT` set to a scratch project, then
[`references/ue-5.8-traps.md`](references/ue-5.8-traps.md) section 7.

## 1. Execution channels

| Channel                                                                                                                                  | Use for                                                                                                                              | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Epic Unreal MCP** (plugin `ModelContextProtocol`, Experimental), your MCP client via `.mcp.json`                                       | structured edits covered by shipped toolsets (actors, scene, material instances, Sequencer, PCG, UMG, animation), in the open editor | Enable Unreal MCP and All Toolsets; if "connected but can do nothing", add Editor Toolset, which Epic's webinar says the docs omit (Sam Deiter, k0tgmrBuIJc [00:18:13]). Start with `-ModelContextProtocolStartServer -ModelContextProtocolPort=8000` or `ModelContextProtocol.StartServer`; `ModelContextProtocol.GenerateClientConfig ClaudeCode` writes `.mcp.json`; editor first, agent second. Calls run serially on the game thread: never overlap them. `describe_toolset` only for the toolset you need now: Niagara's is "almost a quarter of a million" (k0tgmrBuIJc [00:46:04]). Loopback, no auth. |
| **Editor Python in the running editor** ([`ue_remote.PythonRemote`](scripts/ue_remote.py), or a custom Python toolset on the MCP server) | loops, audits, anything toolsets lack, screenshots                                                                                   | Enable Python Remote Execution (Project Settings > Plugins > Python). Full `unreal` API; the editor ticks between calls. One call = one named transaction that reports what it did.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Headless commandlet** ([`ue_run.run_python`](scripts/ue_run.py), `UnrealEditor-Cmd <uproject> -run=pythonscript`)                      | audits, imports, batch edits, validation, CI, when no editor has the project open                                                    | No level loaded (`map=` loads one), fewer modules, no rendering. The boot waits for the Asset Registry (`get_asset_registry().wait_for_completion()`, 5.8 batch example); a job passes only on its boot's job-id `UE_RESULT` line, never on the exit code. A commandlet that saves must not touch a project an open editor has loaded: the editor holds a write lock (Jamie Dale, 0guOMTiwmhk [01:17:18]).                                                                                                                                                                                                     |
| **Full editor, one shot** (`mode="editor"`: `-ExecutePythonScript`; `mode="latent"`: ticking boot that quits after)                      | jobs needing full modules; latent: screenshots and renders without a running editor                                                  | `-ExecutePythonScript` shuts down right after the script, so nothing ticks; `ue_run` adds `-ScriptErrorsAreFatal` (5.5) so a failing script fails the process. Latent jobs are generators: `yield` = one tick.                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Remote Control API** (`ue_remote.RemoteControl`, 127.0.0.1:30010)                                                                      | batched property writes on known objects, live presets, `-game` builds                                                               | Off until `WebControl.StartServer`. **5.8 disables remote UFUNCTION calls by default** with an allow list (5.8 release notes). C++ names, `WRITE_TRANSACTION_ACCESS` for undo, public EditAnywhere properties only.                                                                                                                                                                                                                                                                                                                                                                                            |
| **Console and cvars**                                                                                                                    | stats, view modes, quality switches, `HighResShot`                                                                                   | From Python `unreal.SystemLibrary.execute_console_command(world, cmd)` [verify]; at launch `-DPCVars=` (before init, overrides read-only cvars; Profiling with Purpose, C-AjCqjKRSs [00:14:13]), not `-ExecCmds`. Restore what you change.                                                                                                                                                                                                                                                                                                                                                                     |
| **Commandlets and UAT** (`ue_run.run_commandlet`, `run_uat`)                                                                             | `DataValidation`, `ResavePackages -fixupredirects`, `WorldPartitionBuilderCommandlet`, `BuildCookRun`                                | Headless; parse the log (`ue_run.scan_log`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Capability matrix** (from the 5.8 docs and talks; `tests/code/unreal-expert/jobs/job_00_probe.py`
confirms or corrects each row):

| Action                                         | MCP                                            | Python, running editor                                                                        | Headless commandlet                            | Remote Control                 |
| ---------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| read and edit actors, assets, properties       | toolsets                                       | yes                                                                                           | yes (load the level first)                     | public EditAnywhere properties |
| material instances and parameters              | `MaterialInstanceTools`                        | yes                                                                                           | yes                                            | properties only                |
| material graphs                                | toolset (large schema)                         | `MaterialEditingLibrary`, partial: some pins unexposed (Matt Oztalay, m6mJ9r7ytks [00:13:39]) | same                                           | no                             |
| Blueprint graphs, AnimGraph [verify]           | Blueprint toolset [verify scope]               | 5.8 `BlueprintGraphEditor` [verify scope]                                                     | same                                           | no                             |
| Niagara emitters and modules                   | toolset, huge schema                           | no emitter or module editing                                                                  | no                                             | user parameters                |
| PCG graphs                                     | PCG toolset, primitives, fire-and-forget calls | graph API [verify]                                                                            | yes                                            | no                             |
| screenshots, MRG stills, PIE                   | via Python toolset                             | yes                                                                                           | no (use `mode="latent"` or `-game` render CLI) | no                             |
| landscape sculpt, foliage paint, Fracture Mode | no                                             | no                                                                                            | no                                             | no                             |
| cook, package, validate                        | no                                             | not the cook (in-editor cook removed in 5.9)                                                  | yes, UAT                                       | no                             |

**Graph editors and viewport tools, substitutes:** Blueprints: logic in C++ (code project, Xcode)
with data-only Blueprints; template Blueprints duplicated and their defaults set; never 150 Delay
nodes or unjustified Event Tick (k0tgmrBuIJc [00:56:45], [00:57:19]). Materials: instances of
approved masters; node graphs, never a whole-HLSL Custom node unless required (k0tgmrBuIJc
[00:39:27]). Niagara: duplicate template systems, set user parameters. PCG: compose Epic's
primitives and example graphs (lDf_y-YPELo [00:05:20]). Control Rig: its "Copy Python Script".
Sculpting, painting, fracturing: heightmap import, PCG, Dataflow graphs, or a human step, said
plainly.

**Write locks and source control:** `ue_run` lists UnrealEditor processes holding the project
(`ps`); pass `lock_check="refuse"` for jobs that save. 5.8's PythonScript commandlet enables source
control before the script, so saves can check out [verify with Perforce]; `ResavePackages` needs
`-autocheckout` (redirectors doc). Stop when a file you must edit is not checked out (Bardoux,
MjjkWH0eT3U [00:55:27]). OFPA changelists are submitted from inside the editor: partial submits
leave dangling references (World Partition doc). Content a builder regenerates, such as PCG
partition actors, stays out of changelists (TbNZ4GKaTow [00:26:23]).

## 2. The expert loop

**Name the engine call behind every toolkit call**, in plans as in reports: a reader without
`scripts/` must be able to check each step. Write
[`ue_review.screenshot(p, 1920, 1080)`](scripts/ue_review.py)
(`AutomationLibrary.take_high_res_screenshot`, fallback `HighResShot 1920x1080`), cvars and console
commands literally, and close with **Verified** (what ran, with the number, log line or frame that
proves it) and **Assumed** (not run in Unreal, [verify] names, defaults taken). Mapping and
template: [`references/toolkit-map.md`](references/toolkit-map.md).

1. **Brief in numbers.** Platform and device class; frame budget in ms per thread and GPU (16.67 at
   60 fps, 33.3 at 30; Ari Arnbjörnsson, GuIav71867E [00:03:53]); output resolution and upscaler;
   scale (world size, actors, NPCs); gameplay or cinematic; references. When silent, take the domain
   skill's default and write it down.
2. **Preflight.** [`ue_env.preflight()`](scripts/ue_env.py) (chip, macOS, Xcode),
   `ue_env.find_project()` (plugins, path spaces), and the project settings that change the plan:
   `r.Substrate`, Lumen, VSM, Nanite, hardware ray tracing (`ue_env.read_ini_value`, or the probe).
   Upgraded projects keep old renderer settings [added].
3. **Build one stage** with small idempotent scripts: get-or-create by path, mark what you create,
   one transaction per logical operation, explicit saves.
4. **Measure.** [`ue_audit.verdict`](scripts/ue_audit.py) for content; `stat unit` to classify
   (Frame, Game, Draw, GPU, RHIT), then Insights (lean capture for "are we on budget", rich with
   `-statnamedevents` for "why", about 20% overhead, C-AjCqjKRSs [00:11:27]);
   [`ue_stat.budget_check`](scripts/ue_stat.py) on CSV profiler or TraceQuery JSONL. Profile a
   cooked Development or Test build on target hardware; this Mac is a proxy for a console. Measure
   before any rewrite (VMZftEVDuCE [00:16:33]); when Insights cannot explain a hitch, add a sampling
   profiler (C-AjCqjKRSs [00:17:30]).
5. **Look AND check.** Screenshots from fixed camera bookmarks or an MRG still, opened with the
   image reader, plus `ue_review.image_checks`: Epic's lighting agent approved an all-white frame
   (lDf_y-YPELo [00:17:29]). `review_images` gives flags and a contact sheet in one call. Judge with
   the domain skill's `references/critique.md`. After a render, look for 5.8's on-screen
   exposure-range warning; an MRG frame that differs from the viewport: suspect Game Overrides first
   (fVg5ihB8Wdc [00:03:33]).
6. **Fix before advancing**, one change at a time, with `ue_review.compare` for before and after
   parity from the same views.
7. **Deliver with evidence** in that format: saved assets and levels, audit and stat JSON, the
   frames you looked at with their checks, the Verified and Assumed lists.

Never report a level, material, shot or build as done without numbers and a frame you looked at.

## 3. Persona pipelines

| Brief                      | Chain                                                                                                                                       | Deliverable                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Open world or level        | scenario-unreal-world-building, scenario-unreal-materials (landscape, RVT), scenario-unreal-lighting-rendering, scenario-unreal-performance | streamed level, HLODs, budget report   |
| Material kit               | scenario-unreal-materials, then scenario-unreal-lighting-rendering (test bench), scenario-unreal-performance (shader cost)                  | masters, instances, permutation audit  |
| Lit interior or hero still | scenario-unreal-lighting-rendering (scenario-unreal-materials for emissives), scenario-unreal-cinematics for MRG output                     | gameplay lighting at budget, EXR still |
| Gameplay prototype         | scenario-unreal-gameplay, scenario-unreal-animation, scenario-unreal-vfx for abilities, scenario-unreal-performance                         | playable map, automation tests         |
| Character from Maya        | scenario-unreal-pipeline-automation (import), scenario-unreal-animation, scenario-unreal-gameplay                                           | retargeted, locomotion-ready character |
| Trailer                    | scenario-unreal-cinematics (scenario-unreal-animation, scenario-unreal-lighting-rendering)                                                  | Sequencer shots, reviewed renders      |
| VFX or destruction         | scenario-unreal-vfx, scenario-unreal-performance                                                                                            | systems within budget                  |
| Batch import and build     | scenario-unreal-pipeline-automation, scenario-unreal-performance (packaging)                                                                | report, validated package              |
| Frame-rate rescue          | scenario-unreal-performance, routing fixes to owners                                                                                        | proof capture, parity frames           |

**Handoff contract:** saved assets in a named folder, the `ue_audit.verdict` for the receiver's
profile with no error, stat or trace numbers when performance matters, the frames the sender looked
at with their `image_checks`, each toolkit call with its engine call, and the Verified and Assumed
lists. Units are centimeters, Z-up [added]. Sister teams: scenario-maya-expert (1 unit = 1 cm, Y-up
in Maya), scenario-zbrush-expert, scenario-blender-expert (FBX through scenario-blender-export);
scenario-3d for generated meshes to finish.

## 4. Shared toolkit (`scripts/`, in-engine parts not yet run in Unreal)

Import: `import sys; sys.path.insert(0, "<this skill>/scripts")`. `PythonRemote.call` adds that
folder in the editor for one call.

- `ue_env.py`: `find_engine(version=None)` (editor, editor_cmd, uat, version; `UE_ROOT` override),
  `find_project(path)`, `preflight()`, `plan_plugins` / `enable_plugins` (timestamped backup),
  `read_ini_value`, `xcode_status`.
- `ue_run.py`:
  `run_python(uproject, script, args=None, map=None, timeout=1800, mode="commandlet"|"editor"|"latent", strict=False, lock_check="warn")`
  returns the `UE_RESULT` envelope plus log scan and `warnings`; job side `result(obj)`, `args()`,
  `in_commandlet()`, `to_jsonable()`, `wait_for_registry()`; `run_commandlet(uproject, name, args)`,
  `run_uat`, `build_buildcookrun`, `launch_editor(mcp_port=)`, `stop_editor`, `editor_processes`,
  `scan_log`, `parse_ue_result`.
- `ue_remote.py`:
  `RemoteControl(host, port).info/describe/get_property/set_property/call/batch/search_assets/console`,
  errors carry fix hints; `PythonRemote().open/exec/call/close`; `McpHttp().health()` (reachability,
  tool search); `loopback_only(port)`, `pie_path`, `cdo_path`, `python_cdo_path`.
- `ue_review.py`: in editor `set_camera`, `screenshot`, `wait_screenshot`, `screenshot_views`,
  `camera_views_from_actors`, `render_still` (MRG or MRQ preset, own queue), `wait_render`; offline
  `image_checks` (histogram, clipped, crushed, EV-like, center vs surround, all_white, all_black,
  uniform, alpha), `image_verdict`, `compare`, `contact_sheet`, `review_images`, `wait_for_file`,
  `build_render_command`.
- `ue_audit.py`: in editor `audit_assets(paths, rules, profile)`, `collect_facts`; anywhere
  `evaluate`, `build_report`, `verdict(report, "game"|"cinematic"|"mobile"|"prototype")`; Epic
  prefixes, texture size and compression, Nanite, collision, LODs, slots, instance parents, Custom
  HLSL, After-DOF translucency, redirectors.
- `ue_stat.py`: `parse_stat_unit`, `parse_csv_profile` + `csv_frames`, `parse_jsonl` +
  `sniff_schema` + `trace_frames` + `timer_totals`, `budget_check(frames, target_ms)`, `bound_by`,
  `summarize`.

Domain skills add `scripts/ue_<domain>.py`; they never copy these. The engine call behind each
function: `references/toolkit-map.md`.

## 5. Top 5.8 traps (full list: `references/ue-5.8-traps.md`)

- **`EditorLevelLibrary` and `EditorAssetLibrary` are the old API**: `EditorActorSubsystem`,
  `LevelEditorSubsystem`, `UnrealEditorSubsystem`, `EditorAssetSubsystem` via
  `unreal.get_editor_subsystem`. Epic's own 5.8 samples still use the old names. `load_level`
  discards unsaved changes; `delete_asset` force-deletes and may clear undo; `destination_name` is
  ignored under Interchange.
- **Substrate defaults depend on project age**: on for projects created in 5.7+, legacy for upgraded
  ones until opted in; Substrate materials render black with it off; no Metallic pin; Mac listed
  with known issues. Read `r.Substrate` before authoring.
- **Mac feature support**: Apple Silicon only; Nanite and VSM Beta on M2+; Lumen HWRT and MegaLights
  Experimental on M2+; path tracing via Metal, macOS 26.4+. Xcode: Epic lists 26.0 minimum, 26.1.1
  recommended, 26.4 incompatible; this Mac has 26.6, unlisted: verify a C++ build.
- **MRG renames**: Movie Render Graph Production Ready, new features graph-only, MRQ presets legacy,
  queue default "Basic"; `MoviePipelinePrimaryConfig` (not Master); `set_graph_preset()` for graph
  jobs; end frames exclusive; H.264 node Windows only.
- **Remote Control defaults**: server off until started, remote UFUNCTION calls refused by default
  in 5.8, 127.0.0.1 only; opening `DefaultBindAddress` to the LAN likely exposes the unauthenticated
  MCP server too [added inference].

## 6. macOS specifics

- Launcher installs land in `/Users/Shared/Epic Games/UE_5.8/`; the editor is
  `Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor`; the `-Cmd` location is
  [verify] and `find_engine` falls back to the editor with `-run=`; UAT is `RunUAT.sh`; cook
  platform `Mac`.
- Keep the Unreal project in a path without spaces (Allar style guide) [verify impact]; the toolkit
  stages jobs in a space-free folder anyway.
- Metal only: DX11, DX12 and Vulkan tips do not apply; RenderDoc does not support Metal, use Xcode's
  Metal debugger [added]; Metal System Trace shows shader compiles and thermal throttling that
  invalidate captures (ufPtQEtk-RQ [00:14:06], [00:18:17]). Insights memory callstacks are not
  listed for Mac. Outside Insights, the Mac sampling profiler is Instruments Time Profiler [added].
- Docs show Ctrl shortcuts and Windows paths: translate to Cmd [verify] and POSIX paths. A MacBook
  has no numpad: rebind the Gameplay Debugger's numpad category keys (tranek GAS guide 6.2, in the
  version deltas).
- Never kill an editor you did not launch; save before stopping one you did.

## References

- `references/ue-5.8-traps.md`: every 5.8 change that breaks remembered code or old tutorials, with
  sources, and the first-run checklist. Load before writing code from memory.
- `references/toolkit-map.md`: the engine call, command or cvar behind every toolkit function, and
  the report format (engine call per step, Verified and Assumed).
- [`references/python-reliability.md`](references/python-reliability.md): `unreal` module idioms and
  procedures (subsystems, paths, transactions, saving, get-or-create, marking what you create, the
  write lock and source control, latent work, imports, raw screenshot loop).
- [`references/sources.md`](references/sources.md): every source, with credentials, URLs and best
  timestamps.
