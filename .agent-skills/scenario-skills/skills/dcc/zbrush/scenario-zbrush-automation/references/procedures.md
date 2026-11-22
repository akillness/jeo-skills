# scenario-zbrush-automation procedures (full code)

Every procedure below is **not yet run in ZBrush**. The pure-Python parts ran offline (56 tests,
`tests/code/zbrush-automation/run_offline.py`, results in `offline_results.json`); the ZBrush-side
parts ran only against a fake `zbrush.commands`. The live check that will prove each one is named
`live_aNN` (`tests/code/zbrush-automation/run_live.sh`). When a live test passes, replace "not yet
run in ZBrush" with "verified on ZBrush 2026.2.1" and the log path.

Conventions:

```python
import sys
sys.path.insert(0, "<project>/skills/scenario-zbrush-automation/scripts")   # also puts scenario-zbrush-expert/scripts on sys.path
import zb_batch, zb_goz
import zb_launch            # lead toolkit, found through zb_batch
# ZBrush-side call, main thread, JSON-able args. Modules are imported by path; afterwards sys.path,
# sys.modules, stdout and the working directory are as they were, also after an error (P19):
zb_batch.remote_call("zb_plugin_ops", "memory", timeout=30)
zb_batch.remote_run("result = zbc.get_tool_count()", modules=())
```

`zb_ops` functions (scenario-zbrush-expert) are called the same way:
`zb_batch.remote_call("zb_ops", "dynamesh", 256)`.

## P1. Session, health, probe

Not yet run in ZBrush. Test: `live_a01_import_roundtrip.py`, `live_a06_activity_oracle.py`.

```python
s = zb_batch.BridgeSession()           # owned only if this call spawns ZBrush
s.ensure()                             # zb_launch.start() or reuse a live bridge; BatchAbort if ZBrush runs without it
print(s.version, s.owned)              # 2026.2 expected
paths = ["Tool:Import", "Tool:SubTool:Duplicate", "Zplugin:UV Master:Unwrap",
         "Zplugin:Decimation Master:Decimate Current", "Tool:Normal Map:Clone NM", "Texture:Export"]
probe = zb_batch.remote_call("zb_plugin_ops", "probe", paths)
missing = [p for p, r in probe.items() if not r["exists"]]
mem = zb_batch.remote_call("zb_plugin_ops", "memory")    # runtime, used, virtual, free (units [verify])
```

Gate: `missing == []` for the recipe's paths. A miss is a wrong label, Edit mode off, not a
PolyMesh3D, or a missing plugin; case and spaces do not matter (SDK Item Paths).

## P2. Learn a path: Activity log, probe, recording

Not yet run in ZBrush (the log format is proven by the 05:20 session log; the parser ran offline).
Test: `live_a06_activity_oracle.py`.

```python
w = zb_batch.ActivityWatch()     # newest <Asset Dir>/Logs/Activity/Activity <date>.txt
w.mark()
# a human or a computer-use agent now clicks the button once (or the agent presses something)
for e in w.entries():
    print(e["verb"], e["path"], e.get("value"), e.get("canonical"))
# e.g. IPress Tool:Geometry:DynaMesh; ISet Tool:Geometry:Resolution 128.0
```

- The log writes the canonical form and drops group names (`Tool:Geometry:Resolution` for what was
  sent as `Tool:Geometry:DynaMesh:Resolution`); both forms resolve. Strokes are logged only as
  `Click in Canvas`.
- Python macro recording (human step because End Macro opens a save dialog): ZScript > Python
  Scripting > New Macro, act, End Macro, save; read the `.py`. Loading it with Load puts a button in
  the console instead of running it (SDK quickstart).
- ZScript recording: Macro > New Macro / End Macro writes `[IPress,...]` lines; port them with the
  table in expert-notes.md ("ZScript to Python").

## P3. Import a file as a new tool, and check it

Not yet run in ZBrush. Test: `live_a01_import_roundtrip.py`.

```python
stem = zb_batch.unique_stems([src])[0]
staged = zb_batch.stage_input(src, "/abs/out/_staged", stem)      # copy, unique clean name
import zb_audit
a = zb_audit.audit(staged)                                        # counts the import must match
imp = zb_batch.remote_call("zb_plugin_ops", "import_mesh", staged,
                           expect_points=a["points"], expect_faces=a["faces"], timeout=180)
assert not imp["warnings"], imp["warnings"]       # welded or split points show up here
print(imp["tool"], imp["export"])                  # tool = stem; Export Scale set by the import
```

Inside ZBrush (`zb_plugin_ops.import_mesh`): press `Tool:PolyMesh3D` (never SimpleBrush),
`set_next_filename(path)`, `Tool:Import`, refuse if the preset is still pending, draw with
`canvas_click(10, 10, 10, 20)` and set Edit only when Edit is off, `Transform:Fit`. Import onto an
existing tool replaces its active SubTool (usd-portal).

## P4. One file through the default recipe, step by step

Not yet run in ZBrush. Test: `live_a03_batch_three.py` (through the runner), `live_a02_maps_mme.py`
(map chain).

What `run_folder` does per file, written out so a single file can be driven by hand:

```python
T = zb_batch.TIMEOUTS
call = zb_batch.remote_call
out = f"/abs/out/{stem}"
call("zb_plugin_ops", "import_mesh", staged, timeout=T["import"])
call("zb_ops", "dynamesh", 256, timeout=T["dynamesh"])                      # zb_ops refuses levels
call("zb_ops", "save_ztl", f"{out}/{stem}_dyn.ztl", timeout=T["save"])      # _v001, never overwrites
low = call("zb_plugin_ops", "make_low", 5, auto_groups=True, keep_groups=True,  # cgside recipe
           timeout=T["make_low"])["ctx"]                                  # {"source": 0, "low": 1}
try:
    call("zb_plugin_ops", "uv_master", low["low"], timeout=T["uv"])        # plugin: own call
except zb_launch.ZBTimeout:
    ...                                                                     # P7: recover, then uv_native
call("zb_plugin_ops", "export_subtool", low["low"], f"{out}/{stem}_low.obj", timeout=T["export"])
pj = call("zb_plugin_ops", "divide_project", low["low"], low["source"],
          checkpoint=f"{out}/{stem}_preproject.ztl", timeout=T["project"])   # saved before Project All
for g in zb_batch.step_gates(pj):                     # points kept, no spike, volume, watertight
    assert not g["problems"], (g["problems"], pj.get("repair"))
call("zb_ops", "save_ztl", f"{out}/{stem}_proj.ztl", timeout=T["save"])
call("zb_plugin_ops", "normal_map", low["low"], f"{out}/{stem}_normal_raw.png", size=2048,
     timeout=T["normal_map"])
call("zb_review", "snapshot", f"{out}/{stem}_view.png", matcap="MatCap Gray", timeout=T["snapshot"])
call("zb_plugin_ops", "decimated_preview", low["source"], f"{out}/{stem}_preview.obj",
     target_faces=20000, timeout=T["preview"])                              # LAST
zb_batch.fix_normal_map(f"{out}/{stem}_normal_raw.png", f"{out}/{stem}_normal.png", flip_v=True)
```

Custom recipes are data:
`zb_batch.step(name, module, func, args, kwargs, timeout, critical, plugin, fallback)`, with
`"$p.x"` for params, `"$c.x"` for per-file context (stem, out, staged, source, low) and
`"{out}/{stem}..."` templates.

```python
recipe = [zb_batch.step("import", "zb_plugin_ops", "import_mesh", ["$c.staged"]),
          zb_batch.step("polish", "zb_ops", "polish", [10], critical=False),
          zb_batch.step("export", "zb_plugin_ops", "export_subtool", [0, "{out}/{stem}_polished.obj"])]
print(zb_batch.plan(files, "/abs/out", {}, recipe=recipe))        # dry run first
```

## P5. A folder, with recovery, resume and a report

Not yet run in ZBrush. Runner logic ran offline with fake sessions (ok, plugin hang with fallback,
recovered timeout, repeated hang abort, not-owned session, non-critical hang, STOP file, script
mode). Test: `live_a03_batch_three.py`, `live_a04_hang_drill.py`.

```python
files = zb_batch.discover("/abs/in", ("*.obj",))                  # case-insensitive
params = {"dyn_res": 256, "zr_target_k": 5, "map_size": 2048, "preview_target_faces": 20000,
          "map_flip_v": True, "map_flip_green": False}             # True for Unreal (DirectX)
print(zb_batch.plan(files, "/abs/out", params)["files"][0])        # review one file's steps
rep = zb_batch.run_folder(files, "/abs/out", params, restart_every=10, grace_s=60)
print(rep["batch"]["counts"], rep["batch"]["restarts"], rep["batch"]["blocked"], rep["batch"]["aborted"])
for stem, r in rep["files"].items():
    if r["status"] != "ok":
        bad = [s for s in r["steps"] if not s.get("ok")]
        print(stem, r["status"], [(s["step"], s.get("outcome"), s.get("error")) for s in bad], r["problems"])
```

Recovery rules, in the order the runner applies them:

1. Remote error (Python exception in ZBrush): the step fails; a critical step ends the file.
2. Timeout, then ZBrush answers within `grace_s`: outcome `timeout_recovered`; the late operation
   still ran, so the file is failed and the next file starts from a new tool.
3. Timeout and no answer: outcome `hang`; evidence saved (diagnose, screenshot when unlocked, OS
   windows); ZBrush restarted with `zb_launch.stop(force=True)` then `start()` (owned sessions
   only); a plugin step or a step with a fallback is marked blocked; the file is retried once with
   the fallback.
4. The same step hangs on two files and has no fallback: `BatchAbort`. Restart refused (not owned)
   or failed (startup stall): `BatchAbort`. The report stays resumable.
5. `STOP` file in the output folder: the batch ends between files. Rerunning skips files whose sha1
   and recipe hash match an `ok` record. Outputs: `report.json` (after every file), `report.csv`,
   `manifest.json` (handoff), `sheet.png` (one snapshot per file). Look at the sheet before
   reporting.

## P6. `-script` mode: one ZBrush process per file

Not yet run in ZBrush (launcher and job loop ran offline with a fake process). Test:
`live_a05_script_mode.py`.

```python
rep = zb_batch.run_folder(files, "/abs/out", params, mode="script")   # ZBrush must not be running
print(rep["files"][stem]["process"])     # state finished|exited|timeout|startup_stall, ended self|asked_to_quit|terminated
```

The command (scene LAST, Maxon quickstart; script args start at `sys.argv.index("-script") + 2`):

```
"/Applications/Maxon ZBrush 2026/ZBrush.app/Contents/MacOS/ZBrush" \
    -script <skills>/scenario-zbrush-automation/scripts/zb_batch_job.py --job /abs/out/<stem>/job.json
```

`zb_batch_job.py` imports the toolkit by path (then removes it from `sys.path` and `sys.modules`),
runs the recipe, writes `job_result.json` after every step, and calls `sys.exit(0|1|2)`. Whether
ZBrush quits on `sys.exit` is undocumented: the launcher waits `quit_grace` seconds, then quits it
through `zb_launch.stop`. A second `-script` launch while ZBrush runs may hand the script to the
running instance (single instance) [verify]: `run_script_job` refuses to launch then.

## P7. Pressing a plugin without losing the session

Not yet run in ZBrush. Test: `live_a02_maps_mme.py` (MME), `live_a03_batch_three.py` (UV Master,
Decimation Master), scenario-zbrush-expert `live_08`, `live_09` (raw presses).

```python
def plugin_step(module, func, *args, timeout=300, grace=60, **kw):
    try:
        return {"ok": True, "value": zb_batch.remote_call(module, func, *args, timeout=timeout, **kw)}
    except zb_launch.ZBTimeout:
        s = zb_batch.BridgeSession()
        if s.wait_recovery(grace):
            return {"ok": False, "outcome": "timeout_recovered"}      # state uncertain: redo from a checkpoint
        ev = zb_batch.evidence("/abs/out/evidence", func)              # look at ev["screenshot"]
        return {"ok": False, "outcome": "hang", "evidence": ev}        # then restart (owned) or ask a human
```

| Plugin step                                    | Guard before                                                    | Fallback after a hang                                                            |
| ---------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `uv_master(index)`                             | no levels, faces <= 150k, unique name                           | `uv_native(index)` (Tool > UV Map > Create (Unwrap), 2023+)                      |
| `decimated_preview(index, path, target_faces)` | checkpoint saved, unique names, pre-process after the last edit | none in ZBrush: skip (file `partial`) or decimate the OBJ outside ZBrush [added] |
| `mme_create_all(base, maps)`                   | back up first (ESC may lose UVs, MME doc)                       | `normal_map` / `displacement_map` per SubTool                                    |
| FBX ExportImport, USD Format                   | never unattended                                                | OBJ or `.GoZ` by path                                                            |

## P8. Maps: normal and displacement

Not yet run in ZBrush. Test: `live_a02_maps_mme.py`.

```python
nm = zb_batch.remote_call("zb_plugin_ops", "normal_map", low, "/abs/out/rock_normal_raw.png",
                          size=2048, tangent=True, timeout=600)      # lowest level vs top
micro = zb_batch.remote_call("zb_plugin_ops", "normal_map", low, "/abs/out/rock_micro_raw.png",
                             size=2048, level=top_level - 1)         # micro detail only
fx = zb_batch.fix_normal_map(nm["path"], "/abs/out/rock_normal.png", flip_v=True, flip_green=False)
st = zb_batch.image_stats(fx["path"])      # size, mean, std, blue_ge_128, uniform
dm = zb_batch.remote_call("zb_plugin_ops", "displacement_map", low, "/abs/out/rock_disp.tif", size=2048)
```

Inside ZBrush: the SubTool must have UVs and levels (the map compares the current level with the
highest of the same SubTool); `create_normal_map(w, h, smooth, 0, border, 1000000, True)` (last
argument True = tangent); `Tool:Normal Map:Clone NM`; `set_next_filename` + `Texture:Export`.
Displacement: `create_displacement_map(...)`, `Tool:Displacement Map:Clone Disp`, `Alpha:Export`
[verify both]. Flip V and green are applied on the agent side because they can be checked there;
confirm the orientation once in the target app.

## P9. Decimated preview and Decimation Master options

Not yet run in ZBrush. Test: `live_a03_batch_three.py`.

```python
pct = zb_plugin_ops.decimation_percent(points, target_faces=20000)    # = 100 * 10000 / points
zb_batch.remote_call("zb_plugin_ops", "decimated_preview", source, "/abs/out/rock_preview.obj",
                     target_faces=20000, keep_uvs=None, timeout=1500)
```

- The decimation reflects the model at pre-process time: any edit, mask or level change needs a new
  pre-process (DM doc); `zb_ops.decimate` always pre-processes.
- Keep polypaint: turn on Keep & Use PolyPainting before pre-processing (off by default, AskZBrush
  bVX9utHc_ZI [00:01:17]). Keep UVs costs 50 % more memory.
- Keep polygroups (AskZBrush mRfA_WDvvrg): `Tool:Geometry:Unweld Group Border` [verify label],
  Freeze Borders on, decimate, `Tool:Polygroups:Auto Groups`, `Tool:Geometry:Weld Points`; divide
  once on a copy to check for seams.
- Delete caches between long batches: `zb_plugin_ops.delete_dm_caches()` [verify path and
  confirmation].

## P10. The same operation on every SubTool (ZRepeat It)

Not yet run in ZBrush. Test: offline only (`test_zb_plugin_ops.py`); live via `live_a08_names.py`
indirectly.

```python
rows = zb_batch.remote_call("zb_plugin_ops", "for_each_subtool", "dynamesh", [64],
                            {"blur": 0}, True, timeout=1800)       # visible SubTools, active restored
for r in rows:
    print(r["index"], r["faces_before"], r["faces_after"], r["error"])
```

Pavlovich's ZRepeat It demo was DynaMesh 64, Blur 0 on every visible SubTool [00:42:53]. Any
`zb_ops` or `zb_plugin_ops` function name works; one bridge call runs the whole loop, so give it a
timeout for all SubTools, and prefer one call per SubTool when a plugin is involved. The loop runs
under `zb_ops.quiet()` (show_actions 0); `freeze=True` (the sixth argument) also wraps it in
`zbc.freeze` for deterministic ops, and is refused for plugin steps.

## P11. Inventory, unique names, rename

Not yet run in ZBrush. Test: `live_a08_names.py`.

```python
inv = zb_batch.remote_call("zb_plugin_ops", "inventory")
print(inv["totals"], inv["duplicate_names"], inv["non_alphanumeric"])
for s in inv["subtools"]:
    print(s["index"], s["name"], s["points"], s["sdiv_max"], s["uv"], s["visible"], s["folder_name"])
issues = zb_goz.check_names([s["name"] for s in inv["subtools"]])
r = zb_batch.remote_call("zb_plugin_ops", "rename_subtool", 2, "Belt_L")   # r["ok"] must be True
```

Rename moves the SubTool to the top (MoveUp while enabled), calls `set_tool_path` (renames the top
SubTool only), moves it back, and reads the name back. There is no rename API and Tool > SubTool >
Rename opens a text prompt. Folders can change the number of presses [verify]; when in doubt, name
parts at creation or rename files before import.

## P12. Export every SubTool with its name

Not yet run in ZBrush. Test: offline (`test_zb_plugin_ops.py`); live pending (add to
`live_a08_names.py` once names are proven).

```python
r = zb_batch.remote_call("zb_plugin_ops", "export_all", "/abs/out/parts", ".obj", True)   # or ".GoZ"
for f in r["files"]:
    print(f["index"], f["name"], f["path"], f["bytes"])
```

Visible means eye bit 0x1 and, inside a folder, the folder's bit 0x2 (usd-portal; Maxon's own
example checks only 0x1). OBJ cannot keep several SubTools with names in one file (Gaboury), FBX can
but needs its dialog.

## P13. GoZ files and the GoZ folder

Reader and writer ran offline (byte-identical rewrite of ZBrush's `DXFStar.GoZ`); push not yet run.
Test: `test_zb_goz.py`, `live_a01_import_roundtrip.py` (export and axes), `live_a07_goz_push.py`
(push, needs `ALLOW_SHARED=1`).

```python
g = zb_goz.read_goz("/abs/out/rock_low.GoZ")          # name, counts, points, faces, uvs, groups, polypaint, mask, maps
assert g["counts"]["points"] == inv["subtools"][1]["points"]
zb_goz.write_goz("/abs/in/prop.GoZ", "prop", points, faces, uvs=uvs, polygroups=groups)
print(zb_goz.app_info("Maya"))                          # flip flags; PATH may be stale
plan = zb_goz.push_to_zbrush(["/Users/Shared/Pixologic/GoZProjects/Default/prop.GoZ"],
                             as_subtool=None, dry_run=True)     # dry first; real push writes shared files (backed up)
```

Out of ZBrush: export `.GoZ` by path (P12 or `export_subtool`), which skips the GoZ app chooser.
Into ZBrush from another program: write the `.GoZ`, list its extension-less path in
`GoZBrush/GoZ_ObjectList.txt`, run `GoZBrushFromApp.app`; keep the identifier stable or ZBrush makes
a new SubTool instead of updating (GoZ SDK).

## P14. Round trip with Maya (scenario-maya-pipeline-scripting on the other side)

Not yet run (Maya is not installed on this Mac). Test: none yet; the ZBrush half is P12 and P13.

1. ZBrush: `inventory`, fix names (`check_names`, P11); `export_all(dir, ".obj")` for the lowest
   level (GoZ semantics) or the level the brief asks for; write `manifest.json`
   (`zb_batch.write_manifest`) with Export Scale, axes (OBJ Y up) and map conventions.
2. Maya: scenario-maya-pipeline-scripting imports the OBJs (or `.GoZ` through its `gozMaya` plugin),
   edits, exports OBJ with the same names and vertex order.
3. ZBrush: select the matching SubTool (`locate_subtool_by_name`), go to level 1, import the OBJ
   into it (same topology keeps the levels [verify]); for changed topology import as a new SubTool
   and `project_all` from the old one instead of answering GoZ's reprojection prompt. Maya's GoZ
   flips Y and Z on the way in and out and flips normal maps vertically (`GoZ_Info.txt`); OBJ
   exports from ZBrush are Y up already (scenario-zbrush-expert v03 analysis).

## P15. Round trip with Blender

Not yet run. Test: none yet.

- Files: OBJ both ways (Blender's OBJ importer converts Y up to Z up [added]); or `.GoZ` read and
  written by `zb_goz` inside Blender's Python (pure Python, no GoB needed).
- GoB (JoseConseco/GoB, community add-on, installed as a Blender extension): ZBrush GoZ button with
  Blender as target, polypaint as a color attribute, textures in the public Pixologic folder until
  pack and unpack (FlippedNormals). GoB creates `GoZApps/Blender` on its first export.
- FBX from ZBrush into Blender: scale 1000 (FlippedNormals [00:11:21]); needs the FBX dialog, so not
  unattended.

## P16. Answer a confirmation with a key-held macro

Not yet run in ZBrush. Test: offline text and install rules (`test_zb_batch.py`); live pending
(needs a restart after install and the user's consent).

```python
txt = zb_batch.keypress_macro_text("2", "Tool:SubTool:Del All")   # the shipped Delete All pattern
r = zb_batch.install_macro(txt, "DelAllYes")                      # <Asset Dir>/ZStartup/Macros/AgentHelpers/, restart needed
# after a restart:
zb_batch.remote_call("zb_plugin_ops", "press_macro", "DelAllYes")  # tries Macro:AgentHelpers:DelAllYes, then Macro:Macros:...
```

Screenshot once to learn which key answers which Note button; Space or Enter triggers the first Note
button, which is Cancel for Merge Down (TVeyes 2015).

## P17. File-drop ZScript into a ZBrush without the bridge

Not yet run in ZBrush. Test: offline text (`test_zb_batch.py`).

```python
body = '    [FileNameSetNext,"/abs/out/active.obj"][IPress,"Tool:Export"]'
open("/abs/jobs/export.txt", "w").write(zb_batch.filedrop_job_text(body, "/abs/jobs/export_done.zvr"))
print(zb_batch.run_filedrop("/abs/jobs/export.txt", "/abs/jobs/export_done.zvr", timeout=180))
```

`open -a ZBrush.app job.txt` hands the script to the running single instance (GoB's macOS pattern);
it ends any active ZScript, steals focus, and reports nothing but the files it writes. VarSave with
a bare name lands in ZBrush's temp sandbox in 2026 (usd-portal): always an absolute path, and the
runner also searches the temp folder.

## P18. Reports other personas read

Not yet run in ZBrush (built offline from fake runs). Test: `test_zb_batch.py`.

- `report.json`: `batch` (params, recipe hash, counts, restarts, blocked, aborted, session log, csv,
  manifest, sheet) and `files[stem]` (input, sha1, status, steps with outcome, timeout and seconds,
  outputs, problems, warnings, input, low and preview audits, normal map stats, hang evidence,
  attempts).
- `report.csv`: one row per file for humans.
- `manifest.json`: what the next app imports and under which conventions.
- `sheet.png`: canvas snapshots labeled stem, status and low faces (zb_review.contact_sheet).
- Scene report without a batch: `inventory()` (SubTools, counts, levels, UVs, visibility, duplicate
  and non-alphanumeric names).

## P19. Keep ZBrush's interpreter clean; one call for a long deterministic sequence

Not yet run in ZBrush (the generated code runs offline in-process:
`tests/code/zbrush-expert/test_zb_launch.py`, class `Hygiene`; `zb_ops` sequence tests in
`test_zb_ops.py`). Test: scenario-zbrush-expert `live_06_ops.py` (last section).

```python
import zb_launch
# 1. hygiene: nothing of the toolkit stays in ZBrush between calls (Maxon Style Guide)
print(zb_launch.hygiene())                 # {"modules": [], "path": []}; else zb_launch.purge()
r = zb_launch.run("result = zb_ops.stats()", modules=("zb_ops",), full=True)
print(r.get("hygiene"))                    # {"reloaded": [...]} when a stale copy was set aside
# 2. many deterministic steps, one bridge call, UI frozen and press feedback off
steps = [["divide", [1]], ["polish", [5]], ["stats"]]
res = zb_launch.call("zb_ops", "sequence", steps, timeout=900)
bad = [x for x in res if not x["ok"]]      # stop_on_error: the first failure ends the list
```

- Why: ZBrush runs ONE Python interpreter for the session; the script's folder is not on `sys.path`,
  so `import helper` fails, and what a script leaves in `sys.path` or `sys.modules` stays until
  restart (SDK quickstart "Virtual Machine"; Style Guide; ex_mod_curve_lightning pops its modules
  after import). `zb_launch.run` and `zb_batch.remote_call` import by path, restore `sys.path`,
  `sys.modules`, stdout, stderr and the working directory, and pop every toolkit module; the bridge
  server runs the same restore after an error.
- Never send raw code that does `sys.path.append(...)` and imports toolkit files; never assign to
  `sys`, `math` or `random`; never `os.chdir`.
- `sequence` refuses plugin presses (UV Master, Decimation Master, Multi Map Exporter), canvas
  exports and strokes: those need a live UI and their own call with a short timeout (P7). After a
  frozen block the canvas is redrawn (`update(redraw_ui=True)`) before any snapshot.
