# Reliable Editor Python in UE 5.8 (the `unreal` module)

Load before any non-trivial script. Idioms that generalist code gets wrong, with procedures. Every
snippet here is **not yet run in Unreal** (UE 5.8 not installed on 2026-09-24); the test that will
prove each one is named under it. Sources: Jamie Dale (engineer of the Python Editor Script Plugin,
Epic) in `0guOMTiwmhk`; the 5.8 Python doc and API reference (`notes/python/`); Matt Oztalay
`m6mJ9r7ytks`; Christophe Bardoux `MjjkWH0eT3U`; Sam Deiter `k0tgmrBuIJc`.

## 1. What the module is

- Python runs **in the editor only**: never in PIE, Standalone or cooked games (Python doc). Runtime
  logic belongs to C++ or Blueprint (see scenario-unreal-gameplay).
- The `unreal` module is generated in memory from whatever is exposed to Blueprint in this editor,
  including enabled plugins and project C++: it cannot be reloaded or imported elsewhere, and "if
  it's not here, the chances are it is not exposed in Python yet" (Jamie, [00:15:13], [00:50:01]).
- A missing function is usually a disabled plugin (Editor Scripting Utilities, Sequencer Scripting,
  Movie Render Pipeline, Python Automation Test, Interchange) (Jamie, [00:36:20]). Check with
  `hasattr(unreal, "LevelSequenceEditorSubsystem")` and report which plugin to enable; enabling
  needs `ue_env.enable_plugins` and an editor restart.
- **Discovery, fastest first**: grep the Developer Mode stub (Project Settings > Plugins > Python >
  Developer Mode writes `Intermediate/PythonStub/unreal.py`, about 10 MB, for this exact plugin set,
  and turns on deprecation warnings) (Jamie, [01:12:10]); then `help(unreal.X)` and `dir(obj)` in
  the editor. The stub path is [verify] on 5.8.
- Naming: classes drop U/A/F prefixes; functions and properties are snake_case; bool properties drop
  the `b` (`bCastShadow` becomes `cast_shadow`) [added]; enum values are UPPER_SNAKE
  (`unreal.BlendMode.BLEND_TRANSLUCENT`).
- Returned containers are `unreal.Array`, `Map`, `Set`: list-like, not lists. `list()` them before
  list-only operations (Jamie, [00:42:17]).
- Every property access or call marshals data between Python and C++: pass big data once and let C++
  loop; heavy per-element work belongs in a small C++ function (Jamie, [01:09:02]).

## 2. Entry points: subsystems

| Need                                                                                | 5.8 entry point                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| spawn, list, select, duplicate, destroy actors                                      | `unreal.get_editor_subsystem(unreal.EditorActorSubsystem)`        |
| load, create, save levels; PIE; viewport FOV (5.8)                                  | `LevelEditorSubsystem`                                            |
| editor world, primary viewport camera, world to screen                              | `UnrealEditorSubsystem`                                           |
| assets: exist, load, list, duplicate, rename, save, checkout, referencers, metadata | `EditorAssetSubsystem`                                            |
| create assets, import tasks, migrate, rename many                                   | `unreal.AssetToolsHelpers.get_asset_tools()` [verify helper name] |
| static mesh LODs, collision, Nanite settings                                        | `StaticMeshEditorSubsystem`                                       |
| open asset editors                                                                  | `AssetEditorSubsystem`                                            |
| selected Content Browser assets, widget trees                                       | `EditorUtilityLibrary` (classmethods)                             |
| material graphs, instances, statistics                                              | `MaterialEditingLibrary` (classmethods)                           |
| registry queries without loading                                                    | `AssetRegistryHelpers.get_asset_registry()`                       |
| Movie Render Queue / Graph                                                          | `MoviePipelineQueueSubsystem`                                     |

`EditorLevelLibrary` and friends are the old API (see `ue-5.8-traps.md` section 1).

## 3. Paths

- An asset path argument accepts four spellings: `StaticMesh'/Game/Dir/SM_A.SM_A'`,
  `StaticMesh /Game/Dir/SM_A.SM_A`, `/Game/Dir/SM_A.SM_A`, `/Game/Dir/SM_A` (EditorAssetSubsystem
  docs). Store the package form `/Game/Dir/SM_A`; Content Browser "Copy Reference" gives the first
  form (strip the class, Jamie [00:15:43]).
- Object paths for actors and components come from `obj.get_path_name()`:
  `/Game/Maps/L_Main.L_Main:PersistentLevel.PointLight_0.LightComponent0`. Remote Control needs
  exactly this; in PIE the map gets `UEDPIE_0_` (`ue_remote.pie_path`).
- Never move or rename asset files with `os` or `shutil`: references break. Use `rename_asset` (it
  leaves a redirector: fix up with `ResavePackages -fixupredirects` before cooking, Zen Loader
  ignores core redirects) (Python doc; zen).
- Path length matters at cook: `EditorAssetSubsystem.get_asset_filename_length_for_cooking(path)`.

## 4. Properties, structs, transactions

- **`set_editor_property` equals a Details-panel edit**: pre and post edit change run, dependent
  rebuilds happen; assigning the attribute is a code-level write that notifies nothing (Jamie,
  [00:21:25]). Read with `get_editor_property`, which also reaches properties not exposed as
  attributes.
- **Structs come back as copies**: get, modify, set back, or nothing changes [added]:
  ```python
  # not yet run in Unreal
  s = ppv.get_editor_property("settings")
  s.set_editor_property("override_auto_exposure_bias", True)   # each field needs its override_* flag
  s.set_editor_property("auto_exposure_bias", 1.5)             # names [verify]
  ppv.set_editor_property("settings", s)
  ```
- **One named transaction per logical operation** so a human can undo it in one step:
  `with unreal.ScopedEditorTransaction("Agent: retint props"):` (Python doc; Matt: "the first thing
  you want to do with your editor utilities is undo them", [00:05:10]). Imports are not undoable,
  force deletes may clear the undo buffer: never put them inside a transaction you expect to undo.
- Remote Control writes get the same behavior with `WRITE_TRANSACTION_ACCESS` or
  `generateTransaction: true` (rc); MCP tool edits land in the normal undo history (Sam,
  [00:26:42]).

## 5. Saving and the write lock

- Nothing is saved until you save: assets with
  `EditorAssetSubsystem.save_loaded_asset(s)(..., only_if_is_dirty=True)` or `save_directory`;
  levels with `LevelEditorSubsystem.save_current_level()` (needs a first save) or
  `save_all_dirty_levels()`; `new_level` saves on creation. Each save tries a source-control
  checkout first (py-ref).
- **Save before `load_level` or `new_level`**: they close the current level without saving.
- **The open editor holds a write lock on every asset it has loaded** (Jamie, [01:17:18]). A
  commandlet started on the same project may fail to save them. Rule: editor open means work inside
  it (MCP, PythonRemote); a headless job that saves runs only when no editor has the project open,
  or runs read-only. `ue_run.run_python(..., lock_check="refuse")` enforces it: it reads
  `ps -axo pid=,command=` and returns without starting Unreal when an UnrealEditor process has the
  `.uproject` on its command line (default `"warn"` only reports `editor_open`); whether a
  Launcher-opened editor shows the path is [verify].
- **Source control.** 5.8's PythonScript commandlet enables source control before the script,
  because Python cannot enable it (rn58-pipe § Scripting Bug Fix), so headless saves can check out
  when a provider is configured [verify with Perforce and with no provider]. M2's production scripts
  check that the levels they manipulate are checked out and stop if not (Bardoux, [00:55:27]): do
  the same, and list what you checked out in the report. `ResavePackages` needs `-autocheckout`
  under Perforce (naming doc). OFPA changelists are validated and submitted from the editor, never
  partially (World Partition doc). PCG partition actors that a builder regenerates stay out of
  changelists (TbNZ4GKaTow [00:26:23]).

## 6. Get or create, and never touch what you did not create

Idempotent scripts can run twice: the second run reports `existed`, changes nothing, creates no
duplicates (ue-mcp convention in `mcp-comm`).

```python
# not yet run in Unreal; test: tests/code/unreal-expert/jobs/job_audit_live.py (MI creation)
import unreal
EAS = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
TAG = "AgentCreated"

def get_or_create(folder, name, cls, factory):
    path = "%s/%s" % (folder, name)
    if EAS.does_asset_exist(path):
        obj = EAS.load_asset(path)
        if not isinstance(obj, cls):
            raise TypeError("%s exists as %s, expected %s" % (path, type(obj).__name__, cls.__name__))
        return obj, "existed"
    obj = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, cls, factory)
    if obj is None:
        raise RuntimeError("create_asset failed for %s" % path)
    EAS.set_metadata_tag(obj, TAG, "scenario-unreal-expert %s" % unreal.SystemLibrary.get_engine_version())
    return obj, "created"

mi, state = get_or_create("/Game/Props/Crate", "MI_Crate", unreal.MaterialInstanceConstant,
                          unreal.MaterialInstanceConstantFactoryNew())
```

- **Mark what you create**: asset metadata tag (`set_metadata_tag`), actor tag `AgentCreated`
  (`actor.tags`), an Outliner folder (`actor.set_folder_path("Agent/...")` [verify]), and scratch
  assets under `/Game/_Agent/`. Clean up or modify by mark, never by name pattern alone.
- **Assets and actors you did not create**: list, confirm, then act (Sam, [00:52:23]): print the
  targets and counts, get approval for anything destructive, keep the change in one transaction, and
  save a backup copy first (duplicate the asset to `/Game/_Agent/Backups/<date>/` or rely on source
  control). Never delete: move to an archive folder or leave in place.
- Resolve targets by path or registry query, not by selection. Spawning selects the new actor; if
  later code reads the selection, set it explicitly (`set_selected_level_actors`).
- World Partition: `get_all_level_actors()` sees loaded actors only; load the region first or query
  the Asset Registry (wp; py-ref) [verify the region-loading call].

## 7. Imports

- Scripted imports take the class-default options, not the dialog's last settings: set every option
  that matters (Jamie, [01:26:38]; Interchange PM, Oq6KbrqkGnw [00:39:28]). Put the import policy in
  a pipeline asset and pass it.
- Automated tasks never show dialogs: `automated=True`, `replace_existing`, `save`, then read
  `task.get_objects()` (not the deprecated `result`). Under Interchange, `destination_name` is
  ignored: import into a folder per asset, then rename once, before anything references it (py-ref;
  pipeline digest).
- Interchange pipelines run in stack order: a tweak pipeline must sit after the default one
  (Oq6KbrqkGnw [00:20:22]). See scenario-unreal-pipeline-automation for the full import procedure.

## 8. Latent work: the editor does not tick while your script runs

- Screenshots, renders, PIE, asset compilation and anything asynchronous complete on later ticks. In
  one Python call you can only request them.
- Running editor: request in one call, poll the result from the agent side
  (`ue_review.wait_for_file`), or from a ticker (`unreal.register_ticker_callback(fn)`, 5.7+).
- Headless with ticks: `ue_run.run_python(..., mode="latent")` runs `main()` as a generator; each
  `yield` is one editor tick, `yield 2.0` waits about two seconds, the return value is the result.
- Automation tests: `@unreal.AutomationScheduler.add_latent_command` generators (tests doc, needs
  the PythonAutomationTest plugin).
- Long blocking loops: `with unreal.ScopedSlowTask(n, "label") as t: t.make_dialog(True)`, check
  `t.should_cancel()`, `t.enter_progress_frame(1)` (Python doc). Pair it with the transaction: a
  long Python call "looks really similar to a frozen engine" (Daniel Orozco, Sony Pictures
  Imageworks, moQTQzAOFVA [00:16:16]). Headless batches over hundreds of assets: work in chunks and
  call `unreal.collect_garbage()` between chunks (5.6); tens of thousands of calls: the 5.8 batch
  processor (`unreal.BatchProcessLibrary.run_batch`, `-run=BatchProcessCommandlet`) with a
  registered uclass function (rn58-pipe).

## 9. Console commands and cvars

- From Python: `unreal.SystemLibrary.execute_console_command(world, "r.ScreenPercentage 75")` with
  `world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()`; read with
  `get_console_variable_int_value` / `_float_value` / `_bool_value` [added, verify]. At launch:
  `-DPCVars=` (before init, overrides read-only cvars).
- Record every cvar you change and restore it when the task ends: cvars set in the editor persist
  for the session and mislead the next measurement.

## 10. Errors that help the next attempt

- Fail loudly with the fix in the message ("MI parent must be under /Game/MaterialLibrary; got
  /Game/X"): Epic's MCP team designs tools for self-correction (lDf_y-YPELo [00:25:55]).
- A job's verdict is its envelope. Under `ue_run`, return a value from `main(args)` (or call
  `ue_run.result`); the boot prints the one `UE_RESULT` line that counts, tagged with the job id. A
  `UE_RESULT` line the job prints itself is counted in `foreign_results` and ignored, so an early
  "ok" followed by a crash is a failure. Printing your own line is right only for code sent through
  `PythonRemote.exec` (P1). Read `warnings` (Fatal line, exit code, LogPython errors after an ok
  envelope); in CI use `strict=True` or the CLI's `--strict`, whose exit code is 0 only on a pass.
- In C++ exposed to Python, report with `FFrame::KismetExecutionMessage`, never `check()`, which
  crashes the editor (Jamie, [01:04:35]). A property or pin not exposed to script (Matt's
  tessellation flag and Displacement pin in 5.4) takes a few lines in a C++ `UEditorSubsystem`
  (Matt, [00:13:39]); it needs a code project and Xcode on Mac.

## Procedures

### P1. Safe batch edit in the running editor

Channel: PythonRemote (`py.exec`) or a custom MCP toolset tool. Test: `live_remote_smoke.py` (not
yet run).

```python
# not yet run in Unreal
import unreal
EAS = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
paths = [p.split(".")[0] for p in EAS.list_assets("/Game/Props", recursive=True)]
mis = [m for m in (EAS.load_asset(p) for p in paths) if isinstance(m, unreal.MaterialInstanceConstant)]
print("targets:", len(mis))                                  # list, confirm, then act
parent = EAS.load_asset("/Game/MaterialLibrary/M_PropMaster")
report = {"updated": [], "failed": []}
with unreal.ScopedEditorTransaction("Agent: reparent prop instances"):
    with unreal.ScopedSlowTask(len(mis), "Reparent") as task:
        task.make_dialog(True)
        for mi in mis:
            if task.should_cancel():
                break
            task.enter_progress_frame(1)
            try:
                unreal.MaterialEditingLibrary.set_material_instance_parent(mi, parent)
                report["updated"].append(mi.get_path_name())
            except Exception as e:
                report["failed"].append((mi.get_path_name(), str(e)))
EAS.checkout_loaded_assets(mis)                              # silent without source control
EAS.save_loaded_assets(mis, only_if_is_dirty=True)
print("UE_RESULT " + __import__("json").dumps({"ok": not report["failed"], "result": report}))
```

### P2. Headless audit job

Channel: `ue_run.run_python(uproject, "audit_job.py", args=["/Game/Props"])`, editor closed. Test:
`tests/code/unreal-expert/jobs/job_audit_live.py` via `test_ue_live.py` (not yet run).

```python
# audit_job.py, not yet run in Unreal
import ue_audit

def main(args):
    rep = ue_audit.audit_assets(args, rules={"allowed_parents": ["/Game/MaterialLibrary/M_PropMaster"]},
                                profile="game")
    return {"summary": rep["summary"], "verdict": rep["verdict"]}
```

### P3. Screenshot loop from fixed views

Running editor: `py.call("ue_review", "set_camera", loc, rot, fov)`, then
`py.call("ue_review", "screenshot", path, 1920, 1080)`, then agent side
`ue_review.wait_for_file(path)` and `ue_review.review_images([path], sheet=...)`. Headless: a latent
job with `paths = yield from ue_review.screenshot_views(views, out_dir)`. Test:
`tests/code/unreal-expert/jobs/job_review_latent.py` (not yet run).

The same loop in raw engine calls, for a reader or an agent without the toolkit (the pattern of
Epic's Python automation-test sample, "Screenshot Support"; keep the view list in a file so every
iteration shoots the same bookmarks):

```python
# not yet run in Unreal; run as a latent job: ue_run.run_python(up, this_file, args={...}, mode="latent")
import os
import unreal

UES = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)

def main(args):          # args = {"out": "/abs/dir", "views": [{"name", "location", "rotation"}]}
    paths = []
    for v in args["views"]:
        p, y, r = v["rotation"]
        UES.set_level_viewport_camera_info(unreal.Vector(*v["location"]),
                                           unreal.Rotator(pitch=p, yaw=y, roll=r))  # keywords
        for _ in range(5):
            yield                                   # let streaming and TSR settle
        path = os.path.join(args["out"], v["name"] + ".png")
        task = unreal.AutomationLibrary.take_high_res_screenshot(1920, 1080, path)
        for _ in range(600):                        # the file lands on later ticks
            if task.is_task_done() and os.path.isfile(path):
                break
            yield
        else:                                       # where 5.8 writes it is [verify]
            raise TimeoutError("no file at %s; look in Saved/Screenshots" % path)
        paths.append(path)
    return paths
```

Console fallback: `HighResShot 1920x1080 filename="<path>"` through
`unreal.SystemLibrary.execute_console_command(world, cmd)`. Then, agent side,
`ue_review.review_images(paths, sheet=...)` flags all-white, all-black and uniform frames before you
look (lDf_y-YPELo [00:17:29]).

### P4. Probe the installed engine before trusting this file

`ue_run.run_python(uproject, "tests/code/unreal-expert/jobs/job_00_probe.py")`, once headless and
once with `mode="editor"`: class and method presence, cvar defaults, the Rotator order, Remote
Control and MCP types, enabled plugins. Update the [verify] marks here and in `ue-5.8-traps.md` from
its JSON.
