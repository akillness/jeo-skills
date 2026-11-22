---
name: scenario-zbrush-automation
description: "Use when automating ZBrush 2026: batch processing a folder of OBJ or ZTL files, a ZBrush Python script or ZScript, recording a macro to learn a palette path, the ZBrush -script command line, scripting UV Master, Decimation Master or Multi Map Exporter, exporting every SubTool, GoZ or GoB round trips with Maya or Blender, renaming SubTools, or batch reports. Also when a plugin press never returns, a dialog stalls a batch, one file kills the whole run, or GoZ updates the wrong SubTool."
license: MIT
---

# ZBrush automation (tools and pipeline TD)

An expert ZBrush TD automates with contracts and proof: every file is its own tool, every step is a
separate call with a time limit, every output is read back from disk, and a hung plugin costs one
file, never the batch. ZBrush has no timeout, no undo control from Python and dialogs that code
cannot answer, so the safety lives on the agent side: the runner, the checkpoints, the report. If a
sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-zbrush-expert (bridge, zb_launch, zb_ops, zb_audit, review loop,
2026 traps).

**Status (2026-09-24, refactor pass 2):** every ZBrush call here is **not yet run in ZBrush** (no
session assigned; the README's startup stall is still open). Offline: 56 tests pass
(`tests/code/zbrush-automation/run_offline.py`), including a GoZ reader and writer matching ZBrush's
own `ZResources/DXFStar.GoZ` byte for byte. Live suite: `tests/code/zbrush-automation/run_live.sh`.

## Stance (the expert delta)

- **One file, one tool, one step per call.** "Only one zscript/plugin can be active at a time, so if
  your zscript calls someting like UV Mapper control passes to UV Mapper and no more commands will
  run" (marcus_civis, ZBrushCentral 2014); pressing Decimation Master's Pre-process ended ijacobs'
  script (2013) and forced cgside into a two-run helper (2022, [00:06:56]). So the batch is an
  agent-side loop (`zb_batch.run_folder`) that sends each step as its own bridge call with its own
  timeout, pings after a timeout, and restarts ZBrush after a hang. One long in-ZBrush script dies
  with its first stuck plugin. [added design]
- **Plugins last, checkpoint first.** cgside saves before ProjectAll "since it might crash the
  program" [00:02:19]. `zb_ops.project_all` refuses to run without a versioned save and the recipe's
  project step passes one (`{stem}_preproject.ztl`), even with `save_ztl` off. Decimation Master
  runs last, after every valuable output is on disk, so a hang there leaves a `partial` file, not a
  lost one. [added]
- **Leave the interpreter as found.** ZBrush has one Python for the session and the script folder is
  not on `sys.path` (Maxon Style Guide). Send code only through `remote_call`/`zb_launch.run`:
  modules are imported by path, then `sys.path`, `sys.modules`, stdout and the working directory are
  restored, also after an error. End a batch with `zb_launch.hygiene()` (empty lists).
- **Dialogs are the automation killer; budget them before running.** A studio dropped ZBrush from
  its farm over Note dialogs (danvas 2017); "no way to detect whether they succeed or error"
  (BigRoyNL 2024); "if the export plugin, trigger a popup you are screwed" (m_adam, Maxon 2025).
  `set_next_filename` feeds built-in buttons only: FBX ExportImport shows options "You cannot
  escape" (ferdinand, Maxon 2025) and USD Format ignores the preset (usd-portal). Unattended exports
  are OBJ or `.GoZ` by path; `has_next_filename()` still true after a press means a dialog is
  probably waiting [added].
- **Names are identity.** GoZ needs unique names "including between all the loaded Tools" (GoZ
  docs); Decimation Master caches and UV Master control maps are keyed by the tool name, so a new
  tool with an old name inherits stale data (plugin docs). Stage each input under a unique,
  sanitized name before import (`stage_input`); on this Mac's case-insensitive disk `rock.obj` and
  `Rock.OBJ` are one file [added].
- **Learn paths from ZBrush, never guess.** Recordings show exact paths and hidden preconditions
  (Maxon ZScript manual; MadPony DnLlDJxfxHs [00:02:16]); Ctrl+hover shows a path. For an agent the
  cheapest oracle is ZBrush's own Activity log, which writes every press and set with its canonical
  path (`zb_batch.ActivityWatch`; proven by the 05:20 log). Then `zb_plugin_ops.probe()` confirms
  `exists`, range and title.
- **Record once, apply to all.** Pavlovich replays one recording on every visible SubTool with
  ZRepeat It [00:37:30]; ZRepeat It is not shipped in 2026.2.1, the Python equivalent is
  `for_each_subtool`.
- **Files, not live links, between apps.** GoZ sends the lowest subdivision level (GoZ docs;
  FlippedNormals [00:04:02]), updates by name, and raises a reprojection prompt when topology
  changed. An agent hands over `.GoZ` or OBJ files plus a manifest and lets the other app's agent
  import them.

## Establish first

| Input                                                 | Changes                                        | Default when silent                                                                                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inputs: count, format, faces per file                 | timeouts, DynaMesh resolution, restart cadence | OBJ, audited first with zb_audit                                                                                                                                         |
| Outputs: low count, map size and space, preview count | recipe params                                  | brief's numbers; else `DEFAULT_PARAMS` [added]                                                                                                                           |
| Parts per file, meaningful polygroups                 | ZRemesher grouping                             | cgside: Auto Groups then ZRemesher Keep Groups on the copy, so the low follows the parts (MyhwQvkcnwI [00:08:38]); `zr_auto_groups=False` when the input's groups matter |
| Target app: Maya, Blender, Unreal, Unity              | flip V, green channel, axes, format            | Maya: OBJ + tangent PNG flipped V, OpenGL green [added]                                                                                                                  |
| Whose ZBrush                                          | restart rights                                 | a ZBrush the batch did not start is never restarted or quit                                                                                                              |
| Watched or unattended                                 | pilot size, screenshot use                     | pilot of one file, watched                                                                                                                                               |
| Shared config allowed (GoZ folder, Macro palette)     | GoZ push, key-answer macros                    | no: ask first                                                                                                                                                            |

## Workflow

1. **Session and probe.** `zb_launch.start()` or reuse a running bridge; `zb_plugin_ops.probe()` on
   every path the recipe uses; `memory()`. GATE: ping returns 2026.2, every recipe path exists,
   plugins present.
2. **Plan dry.** `zb_batch.plan(files, out, params)` resolves every file's steps, paths and timeouts
   without ZBrush. GATE: outputs outside the install (read-only since 2026.1), unique stems, no FBX
   or USD step.
3. **Pilot one file, watched.** `run_folder([f], out, params)`; open `sheet.png` and the normal map;
   import the low and map in the target app (scenario-maya-pipeline-scripting or a Blender skill).
   GATE: file `ok`, step timings recorded, map orientation confirmed in the target app (flip V and
   green are [verify] until then).
4. **Run the batch.** Bridge mode by default; `mode="script"` (one `ZBrush -script` process per
   file) once live_a05 has shown how ZBrush exits. Drop a `STOP` file in the output folder to end
   between files; rerun to resume (sha1 and recipe hash). GATE: `report.json` written after every
   file.
5. **Recover.** For each `failed` or `partial`: read `steps[].outcome` (`error`,
   `timeout_recovered`, `hang`), the hang evidence (screenshot when the screen is unlocked; ZBrush
   Notes are drawn in the canvas, only the screenshot shows them), and `batch.blocked`. Fix params
   or paths, rerun: finished files are skipped. GATE: every non-ok file has a cause in the report.
6. **Review and deliver.** Open the contact sheet; check `low_audit`, `preview_audit`,
   `normal_stats`; write the handoff manifest. GATE: numbers pass, sheet looked at, report and
   manifest delivered.

## Numbers

| Value                                                                                              | Relative to                                                                 | Source                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| UV Master: 100k to 150k faces max; seconds at 3k, up to 5 min at 150k                              | faces of the SubTool unwrapped                                              | UV Master doc                                 |
| Divide multiplies faces by 4; levels = smallest n with low x 4^n >= source faces, top capped at 8M | projection stack                                                            | Pablo Logic Part 7; cap [added]               |
| Decimation `% of decimation` is kept percent of points; 100 none, 0.01 max                         | points; about 2 triangles per point, so % = 100 x target_faces / 2 / points | DM doc; ijacobs 2013; Euler [added]           |
| DM quality: 40 to 100 % looks the same, 2 % still good, 1 % degrades                               | original model                                                              | DM doc                                        |
| ZRemesher target in thousands, approximate (5 gave 4,963)                                          | target polygons                                                             | Pablo Logic Part 7                            |
| Project All Dist 0.1, set explicitly                                                               | same shape, new topology                                                    | Drust nxMYYsyJt3o [00:02:19]; toolkit default |
| `create_normal_map(..., local_coordinates=True)` = tangent; default False = world                  | map space                                                                   | SDK stub                                      |
| Macro file name 8+ characters, in a subfolder; new folder needs a restart                          | `<Asset Dir>/ZStartup/Macros/`                                              | Maxon interfaces doc                          |
| Step timeouts 30 to 1,800 s, raised to 4 x slowest observed, 10 x base max; restart every 10 files | per step, per session                                                       | [added]                                       |
| Tangent map sanity: blue >= 128 on 90 % of pixels                                                  | final PNG                                                                   | [added]                                       |
| Maya GoZ flips Y and Z both ways and flips normal maps vertically                                  | GoZ_Info.txt                                                                | local file 2026-09-24                         |
| Blender FBX import from ZBrush: scale 1000                                                         | FBX                                                                         | FlippedNormals [00:11:21]                     |

## Quality gates

- **Per step (code):** import counts equal the file's (`import_mesh` warnings); DynaMesh `remeshed`;
  ZRemesher ratio to target 0.5 to 1.5 [added]; UV bbox inside 0..1; Divide ratio 4 per level; every
  output file exists and is non-empty. Each zb_ops `gate` (volume from `get_polymesh3d_volume`,
  watertight from `is_polymesh3d_solid`, projection spikes) feeds `check_step`: a collapsed or
  exploded DynaMesh or a spike fails the file.
- **Per file (code):** low OBJ passes `zb_audit.verdict(..., "game")` (UVs, no n-gons); low bbox
  equals the input bbox within 2 % (an OBJ import sets Export Scale: Outgang [00:24:03]) [added
  tolerance]; normal map at the asked size, not uniform, tangent-like; preview faces near target.
- **Per batch:** `counts`, `restarts`, `blocked`, `aborted` in `report.json`; `report.csv` for
  humans.
- **Visual:** `sheet.png` (one canvas snapshot per file, MatCap Gray): melted thin parts from a low
  DynaMesh, projection spikes, missing parts. The normal map applied in the target app, lit from the
  side: seams, upside-down or inverted detail.

## Common mistakes

| Mistake                           | What it looks like                                    | Fix                                                                       |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| One in-ZBrush loop over all files | first stuck plugin freezes everything, no report      | `run_folder`: one call per step, report per file                          |
| Pressing a plugin with no timeout | bridge silent for minutes                             | plugin steps are separate calls; `wait_recovery`, then restart            |
| Importing onto the active tool    | the active SubTool is replaced                        | `import_mesh`: PolyMesh3D star first (usd-portal)                         |
| Same-named inputs or tools        | stale Decimation cache, GoZ updates the wrong SubTool | `unique_stems` + `stage_input`                                            |
| FBX or USD in an unattended run   | options window, batch stuck                           | OBJ or `.GoZ` by path                                                     |
| Decimating the master             | sculpt gone, no undo from Python                      | checkpoint ZTL, decimate last or on a duplicate                           |
| Normal map from two SubTools      | no detail in the map                                  | the map compares levels of one SubTool (AskZBrush n0qqpwvn-jA [00:01:14]) |
| World-space map by default        | rainbow-colored map, wrong shading in engines         | `local_coordinates=True`                                                  |
| Restarting the user's ZBrush      | unsaved work lost                                     | `BridgeSession.owned`; abort instead                                      |
| Trusting `set()`                  | slider unchanged, no error                            | `exists()` then read back (zb_ops.set_checked)                            |

## Handoffs

- **Serves every persona:** batch versions of their procedures (`for_each_subtool`, recipes built
  with `zb_batch.step`), inventories before GoZ or export, path discovery. Receives their procedure
  and params; delivers `report.json`, `report.csv`, `sheet.png` and per-file outputs.
- **From scenario-maya-pipeline-scripting or a Blender skill:** OBJ or `.GoZ` files plus a manifest
  (names, units, which SubTool each updates). Names are checked with `zb_goz.check_names` before
  import.
- **To scenario-maya-pipeline-scripting, scenario-zbrush-retopology-export,
  scenario-blender-uv-baking:** low OBJ with UVs, tangent normal PNG (flip V and green stated),
  decimated preview, audit numbers, Export Scale and axis notes.
- **To a human or computer-use agent:** anything behind a dialog (FBX options, SubTool Rename and
  New Folder prompts, End Macro save dialog, GoZ app chooser, reprojection prompt).

## ZBrush 2026 notes

- Python (2026.0) runs next to ZScript; `press_key` "Does not work" and `merge_undo` is "Not
  implemented" (2026.1 stub): key-held presses and one-undo sequences need a ZScript macro pressed
  from Python [verify].
- Long deterministic sequences: `freeze(fn)` and `show_actions(0)` (SDK GUI reference) through
  `zb_ops.sequence`, `frozen`, `quiet`, or `for_each_subtool(..., freeze=True)`; never around a
  plugin press or a canvas export [added].
- Since 2026.1 the install is read-only: macros, plugins and `Python/init.py` go in the Asset
  Directory, here `~/Library/Preferences/Maxon/ZBrush_03C27D49/`.
- ZRepeat It, Turntabler and ZFileUtils are not shipped in 2026.2.1 (listing); no rename API exists
  (Maxon forum 2026-09).
- GoZ still reports "version 1.01 - April, 11th 2011"; Maya's GoZ config on this Mac points at a
  Maya 2017 that is not installed (`zb_goz.app_info`).
- Relaunches stalled after a `kill -9` at 05:29 (README, cause unknown): a restart after a hang may
  stall too. The runner then aborts with a resumable report.

## References

- [`references/procedures.md`](references/procedures.md): full code for each procedure (session,
  probe, import, per-file recipe, folder batch, `-script`, plugins, maps, SubTool loops, names, GoZ,
  Maya and Blender round trips, macros, file-drop, reports, interpreter hygiene). Load before
  writing any batch.
- [`references/expert-notes.md`](references/expert-notes.md): the sources' principles with
  timestamps, and the choices where they disagree. Load when a design decision is not covered here.
- [`references/critique.md`](references/critique.md): the rubric for judging a batch, a script or a
  round trip. Load before reporting.
- [`references/gui-paths.md`](references/gui-paths.md): the same operations by palette and hotkey,
  for a human or computer-use agent. Load when a step needs the GUI.
- [`references/sources.md`](references/sources.md): every source with credentials and URLs.
- [`scripts/zb_batch.py`](scripts/zb_batch.py) (agent side: runner, sessions, reports, `-script`,
  Activity oracle, ZScript generators), [`scripts/zb_plugin_ops.py`](scripts/zb_plugin_ops.py)
  (inside ZBrush: per-file steps and plugins), [`scripts/zb_batch_job.py`](scripts/zb_batch_job.py)
  (`-script` entry), [`scripts/zb_goz.py`](scripts/zb_goz.py) (GoZ files and folder, any Python).
