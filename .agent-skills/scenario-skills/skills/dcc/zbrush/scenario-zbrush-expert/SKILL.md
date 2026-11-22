---
name: scenario-zbrush-expert
description: "Use when an agent drives Maxon ZBrush 2026 for any task (sculpt in ZBrush, DynaMesh, ZRemesher, UVs, export, polypaint, posing, 3D print, clean up an AI mesh in ZBrush), when writing ZBrush Python (zbrush.commands) or ZScript, when the ZBrush bridge is not answering, a palette path or set() does nothing, a scripted stroke does not sculpt or a dialog blocks a script, or when a ZBrush result has to be judged the way a professional artist would."
license: MIT
---

# ZBrush expert (router and agent protocol)

An agent does expert ZBrush work as a loop: deterministic palette operations, synthesized strokes
and canvas renders from fixed views, gated at every stage. One long script is not the method. This
skill is the protocol every ZBrush task follows, the shared toolkit in [`scripts/`](scripts/), and
the map to the team skills. Target: ZBrush 2026.2.1 on macOS, driven through the project's Python
bridge. If a sibling skill named here is missing from your available skills, load it with
`skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

## 1. Execution channel

| Channel                                                                                                                                       | Use for                                                                  | Rules                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bridge into a running ZBrush ([`scripts/zb_launch.py`](scripts/zb_launch.py), over the client [`scripts/zb_bridge.py`](scripts/zb_bridge.py)) | all interactive work: palette operations, strokes, renders, measurements | `zb_launch.start()` spawns ZBrush with [`ZBRUSH_PLUGIN_PATH=scripts/zb_plugins`](scripts/zb_plugins/) and `ZB_BRIDGE_AUTOSERVE=1`. It waits for "plugin loaded", the port and a ping, then quits the ZHomePage helper. Work with `zb_launch.run(code)` or `zb_launch.call("zb_ops", "dynamesh", 256)`. End with `zb_launch.stop(save_to=".../x.ztl")`. |
| `-script` batch launch                                                                                                                        | unattended jobs on saved files (export every SubTool, reports)           | `ZBrush.app/Contents/MacOS/ZBrush -script /abs/job.py args /abs/scene.ZPR`: the scene is the LAST argument, script args start at `sys.argv.index("-script") + 2`, report through files and `sys.exit(code)` (Maxon quickstart). Whether ZBrush quits on exit [verify].                                                                                 |

Rules for the bridge:

- **Main thread only.** Every `zbc` call runs in main mode, which is the default of `run` and
  `call`. The embedded VM keeps the GIL on ZBrush's main thread, so a socket thread alone starves.
  The proven design is a serve loop on the main thread that calls `update(redraw_ui=True)` between
  polls (README).
- **One driver.** Only one agent drives ZBrush at a time. ZBrush is single-instance: `start()`
  refuses a second instance and never kills a ZBrush it did not spawn.
- **Short, measured calls.** Each call returns numbers (faces, volume, file bytes). Long operations
  such as ZRemesher, Decimation or Divide into millions get minute-scale timeouts. A timeout does
  not cancel queued code: it still runs when the main thread frees. Ping and read state before
  sending anything else.
- **No blocking UI.** Never call `message_*`, `ask_*` or `show_note(..., 0)`. For visible progress
  use `set_notebar_text(text, progress)`.
- **One shared interpreter.** ZBrush keeps one embedded Python for the whole session: what a call
  leaves behind stays until restart. `run` and `call` leave `sys.path`, `sys.modules`, stdout and
  the working directory as found and pop every toolkit module, also after an error (Maxon Style
  Guide; the server runs the restore hook). Never add a folder to `sys.path` for good, never import
  toolkit code outside `zb_launch.run`. `zb_launch.hygiene()` must return empty lists; `purge()`
  removes a leak.
- **Long sequences.** Group deterministic steps into one call:
  [`zb_ops.sequence([["divide", [2]], ["polish", [10]]])`](scripts/zb_ops.py) runs them inside
  `freeze` with `show_actions(0)`; `quiet()` and `frozen(fn)` are the parts (SDK GUI reference).
  Never freeze a plugin press or a canvas export; call `update(redraw_ui=True)` before a snapshot.
- **Locked screen.** `Document:Export` still writes the canvas PNG (v03); `screencapture` shows only
  the lock screen. At 05:30 on 2026-09-24 a launch stalled after the Home Page press, while the
  05:20 launch under the same lock worked. `start()` detects the stall, terminates the process it
  spawned and reports a diagnosis (details in `zb_launch.py`).
- Check `zbrush_info(0)` = 2026.2 before trusting anything below.

## 2. Capability matrix (ZBrush 2026.2.1, 2026-09-24)

| Action                                                                            | Status                                                           | Substitute                                                                                                                               |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Press, set and read palette items by path (DynaMesh, Divide, masks, exports)      | yes, proven (v01, v03)                                           | always `exists()` first: `set()` on a wrong path is silent                                                                               |
| Synthesized strokes `Stroke("(ZObjStrokeV02n<N>=H<x>V<y>...)")` + `canvas_stroke` | yes, proven (v02: volume 4.189 to 4.193)                         |                                                                                                                                          |
| Replaying a recorded stroke with an offset                                        | yes (v01: volume 4.184 to 4.189); rotation and scale [doc]       |                                                                                                                                          |
| `canvas_click` drags to sculpt                                                    | no (v01: no change)                                              | `canvas_stroke`                                                                                                                          |
| Dialog-free canvas PNG and OBJ export                                             | yes (v03: 0.04 s, 0.08 s)                                        |                                                                                                                                          |
| ZTL save by path                                                                  | path exists, dialog-free [verify]                                |                                                                                                                                          |
| Aiming strokes at model points                                                    | front view measured on the v03 OBJ; other views [verify live_04] | [`zb_stroke.fit_convention`](scripts/zb_stroke.py)                                                                                       |
| Pen pressure in strings                                                           | unknown [verify live_02]                                         | Draw:Z Intensity and Draw Size per stroke                                                                                                |
| Smoothing by stroke (Shift)                                                       | no: a Smooth brush only becomes the Shift brush                  | `Tool:Deformation:Polish`, hPolish brush                                                                                                 |
| ZModeler polygon clicks, Gizmo drags, pivot placement                             | no                                                               | Deformation sliders, Geometry X/Y/Z Position and XYZ Size, DynaMesh with Booleans, ZRemesher; else hand to a human or computer-use agent |
| Text prompts (SubTool Rename, New Folder)                                         | no                                                               | name parts at creation; `set_tool_path` renames the top SubTool only                                                                     |
| FBX export options dialog                                                         | no ("You cannot escape any GUI", Maxon forum)                    | OBJ or `.GoZ` by path                                                                                                                    |
| `press_key`                                                                       | no ("Does not work" in the stub)                                 | ZScript macro with `IKeyPress` [verify]; System Events from outside                                                                      |
| `merge_undo`, undo control                                                        | no ("Not implemented")                                           | versioned ZTL saves, `Tool:Morph Target:StoreMT`                                                                                         |
| Mask, layer, polygroup data                                                       | no API (Maxon forum 2026)                                        | buttons plus visual checks; OBJ export for geometry                                                                                      |
| UV Master and Decimation Master presses                                           | paths exist; return of control [verify live_08, live_09]         | native `Tool:UV Map:Create (Unwrap):Unwrap`                                                                                              |

## 3. The expert loop in ZBrush

1. **Brief in numbers.** Purpose (film, game, print, concept), polycount per stage, print height in
   mm, style, references. When the brief is silent, pick the domain skill's documented default and
   write it down.
2. **Plan big to small.** Block with primitives, ZSpheres or low DynaMesh; then primary, secondary
   and tertiary forms. Topology, UVs and export come last (Pablo Munoz Gomez's order in
   _Understanding ZBrush's Logic_).
3. **Build one stage** with deterministic operations first; they are exact and cheap. Use strokes
   only where the form needs them. Before any stroke: Edit mode on, symmetry state chosen on
   purpose, brush and Draw values set and read back, view fixed with `set_transform`. Record the
   volume before and after as evidence that the stroke sculpted.
4. **Gate the stage.**
   - Numbers: `zb_ops.stats()`, plus [`zb_audit.audit()`](scripts/zb_audit.py) on an OBJ export.
     Every destructive wrapper (DynaMesh, ZRemesher, Divide, Decimate, Polish, Project All) returns
     a `gate`: volume ratio from `get_polymesh3d_volume()` and watertightness from
     `is_polymesh3d_solid()`. A collapsed or exploded remesh is a problem, a lost watertight state a
     warning; `zb_ops.require_gate(r)` raises. Bands are [added] start values.
   - Review sheet: [`zb_review.review(out_dir)`](scripts/zb_review.py) renders front, right, back,
     three-quarter and top with a neutral MatCap (MatCap Gray) and tiles one labeled sheet (the
     triples beyond front are [verify live_03]; an upside-down or wrong-side tile is visible on the
     sheet). Open it with the image reader and judge it with the domain skill's critique. Experts
     orbit constantly; the sheet is the agent's orbit.
5. **Fix before detail.** A proportion error found at blockout costs one call; found after
   projection it costs the stage.
6. **Checkpoint before anything destructive.** Save a versioned ZTL before DynaMesh, ZRemesher,
   Project All, Booleans, merges and Decimation. There is no undo control.
   `zb_ops.project_all(checkpoint="/abs/x.ztl")` refuses to run without one, since Project All
   "might crash the program" (cgside). It then stores a morph target and a New Layer at the top
   level (FlippedNormals), sets Dist 0.1 (Drust) and flags spikes (a vertex outside the visible
   bbox). Repair with `morph_repair(points)` (Morph brush back to the stored target) or the layer,
   never by smoothing (FlippedNormals).
7. **Deliver with evidence:** the final sheet, audit numbers, file paths, and what was not verified.

Never report a model as done without having looked at a canvas render of its final state.

## 4. File safety

- Turn Edit mode on before any canvas stroke (`zb_ops.ensure_edit()`). With Edit off, a drag stamps
  another pixol copy of the tool (Pablo, Logic Part 1).
- Save versioned `.ZTL` files: `zb_ops.save_ztl(path)` picks the next free `_vNNN` and never
  overwrites. Keep at least three increments; AutoSave alone is not enough (Maxon, Saving Your
  Work). QuickSave is crash recovery, not versioning.
- Never open a project over unsaved tools. Opening a `.ZPR` deletes every loaded tool (Pavlovich
  005). Save each changed tool first. Ctrl+S saves a project, not the model.
- Name SubTools at creation: renaming later needs a text prompt. On save, the top SubTool takes the
  file name (Pavlovich 030).
- Write only outside the install, which is read-only for ZBrush since 2026.1, and always use
  absolute paths: relative ones land in the app folder. Exports keep a `.bak` of any file they
  replace.
- Keep originals. Duplicate before ZRemesher or Decimation (the sculpt stays the projection source).
  Merge Visible creates a new tool. Store a morph target before a risky stroke pass.
- Do not touch the user's configuration (Store Config, hotkeys, `zbc.config()`, `zbc.reset()`)
  without consent.

## 5. Persona pipelines

| Brief                                | Skill chain                                                                                                                    | Delivers                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Realistic character or creature      | scenario-zbrush-sculpting, scenario-zbrush-character-creature, scenario-zbrush-retopology-export, scenario-zbrush-paint-render | ZTL stack, maps, renders                        |
| Stylized character or collectible    | scenario-zbrush-sculpting, scenario-zbrush-stylized, then scenario-zbrush-pose-print or scenario-zbrush-paint-render           | sculpt, print parts or renders                  |
| Hard-surface prop or weapon          | scenario-zbrush-hard-surface, scenario-zbrush-retopology-export                                                                | high poly, game low poly, bakes                 |
| Retopology and export of a sculpt    | scenario-zbrush-retopology-export                                                                                              | clean low poly, UVs, maps, OBJ or GoZ           |
| AI-generated mesh cleanup            | audit with zb_audit, scenario-zbrush-retopology-export (repair, remesh, project), scenario-zbrush-sculpting (forms)            | clean sculpt worth detailing                    |
| Posing and 3D print                  | scenario-zbrush-pose-print                                                                                                     | posed, hollowed, keyed parts in mm (STL or 3MF) |
| Polypaint, render, presentation      | scenario-zbrush-paint-render                                                                                                   | BPR or Redshift renders, turntables             |
| Batch jobs, GoZ round trips, reports | scenario-zbrush-automation                                                                                                     | scripts, `-script` jobs, reports                |

Handoffs between team skills are a versioned ZTL plus its `stats()` and last review sheet. Handoffs
out of ZBrush are OBJ or GoZ plus maps and an audit report. Sister teams: scenario-maya-expert
(rigging, animation, Arnold lookdev), scenario-blender-expert (retopology, lookdev, rendering, GoB
round trips), scenario-3d (AI mesh generation to finish here).

## 6. Shared toolkit (`scripts/`)

- `zb_launch.py` (agent side): `start`, `ping`, `stop(save_to)`, `is_running`, `status`,
  `screen_locked`, `diagnose`, `run(code, modules)`, `call(module, func, *args)`, `hygiene`,
  `purge`. CLI: `python3 zb_launch.py start|ping|status|stop|run`.
- `zb_ops.py` (inside ZBrush): checked wrappers `new_sphere`, `dynamesh`, `divide`, `del_levels`,
  `zremesher`, `project_all` (safe: checkpoint, nets, Dist, gate), `top_level`,
  `store_morph_target`, `new_layer`, `set_layer_intensity`, `morph_repair`, `polish`, `deform`,
  `mask`, `polygroups`, `visibility`, `uv_unwrap`, `decimate`, `export_obj`, `export_canvas`,
  `save_ztl`, `select_brush`, `find_brush`, `set_draw`, `set_material`, `set_symmetry`,
  `sculpt_stroke`, `stats`, `subtools`, `gate`, `require_gate`, `quiet`, `frozen`, `sequence`.
  `PATHS` lists every item path with its evidence tag.
- `zb_stroke.py` (pure Python, both sides): `encode`/`decode` V02 strings, `line`, `polyline`,
  `arc`, `zigzag`, `dab`, `resample`, `clip_to_canvas`, `Camera(transform, pivot).project(p)`,
  `frame_transform`, `visible_mask`, `front_most_vertex`, `fit_convention`, `VIEWS`.
- `zb_review.py`: `review(out_dir, views, matcap)` (agent side), `capture_views` and
  `snapshot(path)` (inside ZBrush), `contact_sheet`, `silhouette_bbox`.
- `zb_audit.py` (agent side, numpy): `audit(obj)` gives counts, poles, holes, non-manifold, winding,
  shells, symmetry, bbox, area, volume and edge lengths;
  `verdict(report, "sculpt"|"game"|"print", ...)`; `displaced(a, b)`.

Offline tests pass (`python3 -m unittest discover -s tests/code/zbrush-expert -p "test_*.py"`). The
ZBrush-side functions have not yet run in ZBrush as functions; the calls under them that v01 to v03
proved are listed in [`references/sdk-cookbook.md`](references/sdk-cookbook.md).
`tests/code/zbrush-expert/run_live.sh` runs the live checks in one command.

```python
# not yet run in ZBrush as a sequence
import sys; sys.path.insert(0, "<this skill>/scripts")
import zb_launch as zl, zb_review, zb_audit
zl.start()
zl.call("zb_ops", "new_sphere", 128)
zl.call("zb_ops", "sculpt_stroke", [[500, 380], [620, 380]], brush="ClayBuildup", size=40,
        z_intensity=25)
sheet = zb_review.review("/abs/out/stage1")["sheet"]          # look at it
obj = zl.call("zb_ops", "export_obj", "/abs/out/stage1.obj")
print(zb_audit.verdict(zb_audit.audit(obj["path"]), "sculpt"))
zl.call("zb_ops", "save_ztl", "/abs/out/head.ztl")            # head_v001.ztl
zl.stop()
```

## 7. Top 2026 traps

- `set()` on a missing path does nothing and raises nothing. `Transform:Frame` and
  `Brush:Dam_Standard` do not exist; use `Transform:Fit` and `zb_ops.select_brush("Dam_Standard")`.
  PolyFrame is `Transform:Pf` (commands.xml id `Transform: Pf`) and perspective is
  `Draw:Perspective`; `Transform:PolyF` and `Transform:Persp` are not ids.
- `query_mesh3d()` returns lists: `int(zbc.query_mesh3d(1)[0])`.
- A ZScript that pressed Decimation Master or a UV plugin never got control back (ZBrushCentral 2013
  and 2014, cgside 2022). Test each plugin press once, with a short timeout and a ping after.
- DynaMesh on a SubTool with levels is expected to raise a modal note [verify]; the wrappers refuse
  instead. Never Divide a DynaMesh to detail; ZRemesher it first (Pablo, Logic Part 7).
- The ZRemesher target is in thousands and approximate: read the face count back.
- ZHomePage covers the canvas after launch. Cmd+W quits ZBrush on macOS: never send it.
- Item paths ignore case and spaces (SDK docs). The Activity log (Asset Directory `Logs/Activity`)
  records the canonical path of each press and set, which makes it a free path oracle (strokes are
  not logged).

## References

- `references/sdk-cookbook.md`: calls and paths by task with the v01 to v03 evidence and the dialog
  budget. Load before writing any bridge code.
- [`references/zbrush-2026-traps.md`](references/zbrush-2026-traps.md): automation and modeling
  traps with fixes. Load when a call does nothing, hangs, or a tutorial step does not match 2026.
- [`references/sources.md`](references/sources.md): every source, with credentials and URLs.
