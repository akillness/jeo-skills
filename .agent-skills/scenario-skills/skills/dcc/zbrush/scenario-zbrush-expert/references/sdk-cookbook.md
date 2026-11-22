# ZBrush 2026.2.1 SDK cookbook for an agent

Calls and item paths by task, with the evidence for each. `zbc` = `zbrush.commands`, run on ZBrush's
main thread through the bridge (`zb_launch.run` / `zb_launch.call`). Toolkit functions are named
after the arrow.

Tags:

- `[v01]`, `[v02]`, `[v03]`: ran through the bridge on 2026-09-24 (`tests/code/zbrush-expert/v0N_*`,
  results in `v0N_result.json`).
- `[log]`: the path as ZBrush itself wrote it in
  `~/Library/Preferences/Maxon/ZBrush_03C27D49/Logs/Activity/Activity 2026-09-24-05-20-14.txt`.
- `[obj]`: measured offline on the v03 OBJ export
  (`tests/code/zbrush-expert/fixtures/v03_sphere.obj`).
- `[doc]`: Maxon SDK 2026.1 docs, examples or stub. `[macro]`: a ZScript macro shipped in
  `ZData/Macros` (2026.2.1).
- `[cmdxml]`: an id in `ZData/ZLang/zcommands/commands.xml` of the install (2026-06-01); spaces and
  case are ignored in paths.
- `[verify]`: not confirmed. The live check that will settle it is named as `live_NN`.

## 0. Session and channel

| Task                            | Call                                                                                                                                                                                                                                            | Evidence                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Launch with the bridge          | `ZBRUSH_PLUGIN_PATH=<scripts/zb_plugins> ZB_BRIDGE_AUTOSERVE=1 ".../ZBrush.app/Contents/MacOS/ZBrush"` → `zb_launch.start()`                                                                                                                    | README (proven 04:25 and 05:20); `start()` itself [verify]                     |
| Health                          | `zbc.zbrush_info(0)` = 2026.2 → `zb_launch.ping()`                                                                                                                                                                                              | [v01] README                                                                   |
| Run code                        | `zb_bridge.py --main "result = ..."` → `zb_launch.run(code, modules=(...))`                                                                                                                                                                     | [v01..v03]                                                                     |
| Stop the serve loop             | send `stop` in main mode                                                                                                                                                                                                                        | README                                                                         |
| Home Page overlay               | `osascript -e 'tell application "ZHomePage" to quit'` → `zb_launch.quit_homepage()`                                                                                                                                                             | README                                                                         |
| Save dialog on quit             | System Events clicks "No"                                                                                                                                                                                                                       | README (unlocked session)                                                      |
| Batch without the bridge        | `ZBrush -script /abs/job.py args /abs/scene.ZPR` (scene LAST), args at `sys.argv[sys.argv.index("-script") + 2:]`, `sys.exit(code)`                                                                                                             | [doc] getting-started, ex_mod_subtool_export; quit on exit [verify]            |
| Python output visible in ZBrush | `zbc.set("ZScript:Script Window Mode:Python Output", True)`                                                                                                                                                                                     | [doc]                                                                          |
| Learn a path                    | read the Activity log after a press: it writes the canonical path                                                                                                                                                                               | [log]                                                                          |
| Shared-interpreter hygiene      | every `run`/`call`: snapshot, import by path, `_zb_restore()` puts `sys.path`, `sys.modules`, stdout, stderr, cwd back and pops toolkit modules; the server calls the hook after an error → `zb_launch.hygiene()` (both lists empty), `purge()` | [doc] Style Guide, ex_mod_curve_lightning; offline tests only [verify live_06] |
| Many steps in one call          | `zbc.freeze(fn)` (progress bars still work), `zbc.show_actions(0)` before presses (not needed for `set`) → `zb_ops.sequence(steps)`, `quiet()`, `frozen(fn)`                                                                                    | [doc] SDK GUI reference; [verify live_06]                                      |

Hygiene rules the prelude enforces (Maxon Style Guide): the script folder is NOT on `sys.path` (so
`import my_helper` fails in ZBrush), a folder goes on `sys.path` only for the import, helper modules
are popped from `sys.modules` after use, nothing touches `sys`, `math` or `random`
(`random.seed = 42` breaks `random.seed` until restart), no `os.chdir`. A stale copy of a requested
module found in `sys.modules` is set aside for the call, so edited toolkit code runs from disk;
`run(..., full=True)` reports it as `hygiene`. Freeze rules [added]: no plugin press (UV Master,
Decimation Master, Multi Map Exporter) and no canvas export inside `freeze`; `freeze()` returns None
and its behavior when the payload raises is undocumented, so `frozen()` catches inside and raises
after.

The Activity log canonicalizes group names away: the agent sent `Tool:Geometry:DynaMesh:Resolution`
and `Tool:Geometry:DynaMesh:DynaMesh`; ZBrush logged `ISet "Tool:Geometry:Resolution"` and
`IPress "Tool:Geometry:DynaMesh"` [log]. Both forms resolve; keep the grouped form in code (it names
one item unambiguously).

## 1. Tools and the canvas

```python
zbc.press("Tool:Sphere3D")                      # [v01]
zbc.press("Tool:Make PolyMesh3D")               # [v01] [log]; the copy is PM3D_Sphere3D [v01]
w, h = zbc.get("Document:Width"), zbc.get("Document:Height")   # [v01] 1120 x 840
zbc.canvas_click(w*0.5, h*0.5, w*0.5, h*0.85)   # draws the tool (Edit off) [v01] [log "Click in Canvas"]
zbc.set("Transform:Edit", 1)                    # [v01]; logged as IPress "Transform: Edit" [log]
```

→ `zb_ops.new_sphere(resolution=128)` (same sequence, plus Layer:Clear [macro] before drawing).

- Edit off + canvas drag stamps another pixol copy (Pablo, Logic Part 1). → `zb_ops.ensure_edit()`
  before every stroke.
- Pressing a Tool while Edit is on swaps the edited tool [verify live_01].
- Start new tools from `Tool:PolyMesh3D`, never SimpleBrush: switching to a 2.5D brush drops the
  edited tool (usd-portal) [verify].

## 2. View (the "camera" is the tool transform)

```python
t = zbc.get_transform()      # 9 floats: pos x y z (canvas px), scale x y z, rot x y z (deg) [doc]
zbc.set_transform(*t)        # restore [doc]; round trip [verify live_01]
zbc.set_transform(x_rotate=0, y_rotate=90, z_rotate=0)       # keywords [doc]
```

- Framing: `scale = min(w, h) / longest_bbox_side * 0.75`, position `(w/2, h/2, 0)` (Maxon turntable
  example) → `zb_stroke.frame_transform(bbox, w, h, rot)`. Whether the pivot is the bbox center and
  k = 1 [verify live_03].
- `Transform:Frame` does not exist [v03]. Candidates: `Transform:Fit` [macro],
  `Transform:Fit Mesh To View` [doc] [verify live_03].
- Canonical triples: front `(0,0,0)` (default after drawing; used by the shipped Create Instance
  Subtool macro), top `(0,90,90)` [doc set_transform example], back `(0,180,180)` [doc turntable
  key]. Right `(0,90,0)`, left, three-quarter [verify live_03]. MadPony: X flips at 90 and Y beyond
  ±90 needs Z = 180 (2019 build); set absolute views, never add degrees.
- Keep x, y, z scale equal and positive (MadPony: stretched or flipped model otherwise).
- Canvas zoom and pan (`get_canvas_zoom`) are the document view, not the camera [doc].

## 3. Strokes

```python
st = zbc.Stroke("(ZObjStrokeV02n11=H1CCV1FE...)")   # decimal count, upper-case hex canvas px [v02]
zbc.canvas_stroke(st)                                 # sculpts in Edit mode: volume 4.189 -> 4.193 [v02]
s = zbc.get_last_stroke()                             # [v01] returned the tool-drawing click
zbc.canvas_stroke(s, v_offset=60)                     # replay with offset: 4.184 -> 4.189 [v01]
```

→ `zb_stroke.encode(points)` (byte-identical to the v02 string), `zb_stroke.play(points)`,
`zb_ops.sculpt_stroke(points, brush=..., size=..., z_intensity=...)`.

- Canvas pixels = pixels of the `Document:Export` PNG, origin top left, y down [v02, v03 canvas].
- `canvas_click` drags in Edit mode did not sculpt [v01]: never use them to sculpt.
- Replay transforms: `canvas_stroke(st, None, rotation_deg, h_scale, v_scale, h_offset, v_offset)`;
  origin = stroke start, canvas space [doc]; rotation on a synthesized stroke [verify live_02].
- Parse oracle: `zbc.get_stroke_info(st, 0)` count, `(st, 1, i)` x, `(st, 2, i)` y, `(st, 3, i)`
  pressure [doc]. Use it to probe the format without touching the mesh (live_02).
- Lower-case `h`/`v` = value/256 (decoded from the Maxon V03 example, `zb_stroke.decode`) [verify
  live_02]. Pressure token unknown [verify live_02]; substitute Draw:Z Intensity and Draw:Draw Size
  per stroke.
- Model point to canvas pixel: `zb_stroke.Camera(zbc.get_transform(), pivot).project(p)`. Front view
  in OBJ space: `x_px = pos_x + k*s*x`, `y_px = pos_y - k*s*y`, +Z toward the camera; k*s was 207 px
  per unit on the v01 sphere [obj]. Other rotations: `zb_stroke.fit_convention` over dab samples
  (live_04), installed as `scripts/camera_convention.json`.
- `pixol_pick(0, x, y)` color, `(5, ...)` material, `(6..8, ...)` normal; depth (1) is broken; empty
  canvas reads about 0x303030 [doc] [verify live_03, live_04].
- Symmetry OFF before a stroke aimed at one side (`zb_ops.set_symmetry(False)`), or the mirrored
  copy lands too.

## 4. DynaMesh, subdivision, ZRemesher

```python
zbc.set("Tool:Geometry:DynaMesh:Resolution", 128)   # [v01] [log]
zbc.press("Tool:Geometry:DynaMesh:DynaMesh")        # [v01] [log]: sphere 128 -> 43,480 points, 44,020 faces [v03]
zbc.press("Tool:Geometry:Divide")                   # exists [v03]; x4 faces [doc] [verify live_06]
zbc.set("Tool:Geometry:Smt", 1)                     # exists [v03]
zbc.get("Tool:Geometry:SDiv"), zbc.get_max("Tool:Geometry:SDiv")   # 1.0 on a fresh mesh [v03]
zbc.set("Tool:Geometry:ZRemesher:Target Polygons Count", 5)        # exists [v03]; thousands (Pablo: 5 -> 4,963)
zbc.press("Tool:Geometry:ZRemesher:ZRemesher")      # exists [v03]; run [verify live_07]
```

→ `zb_ops.dynamesh(res, blur, project, groups)`, `divide(n, smt)`, `del_levels()`,
`zremesher(target_k, adaptive, adaptive_size, keep_groups, mode)`.

- Re-DynaMesh an active DynaMesh: the wrapper switches the button off then on (the human gesture is
  Ctrl+drag on empty canvas) [verify live_06].
- DynaMesh or ZRemesher on a SubTool with levels: the wrapper refuses (ZBrush would raise a modal
  note) [added].
- ZRemesher options Half, Same, Double, Adapt, AdaptiveSize, KeepGroups, KeepCreases, Detect Edges:
  both `Tool:Geometry:ZRemesher:<label>` and `Tool:Geometry:<label>` are tried [verify live_07].
- Mirror And Weld `Tool:Geometry:Mirror And Weld`, Del Lower/Higher, X/Y/Z Position, XYZ Size
  [macro] [doc].

## 5. SubTools and projection

| Task                     | Call                                                                                                                                               | Evidence                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Count, select, active    | `get_subtool_count()`, `select_subtool(i)` (0 ok, -1 error), `get_active_subtool_index()`                                                          | [v03] count; rest [doc]                               |
| Find by name / stable id | `locate_subtool_by_name(n)` (first match), `get_subtool_id()` + `locate_subtool(id)` (duplicates share ids)                                        | [doc] MadPony                                         |
| Visibility, boolean bits | `get_subtool_status(i)`: eye 0x1, folder eye 0x2, add 0x10, sub 0x20, clip 0x40, start 0x80                                                        | [doc]; set semantics [verify live_06]                 |
| Folder-aware visible     | eye bit and, in a folder, folder bit 0x2 → `zb_ops.subtools()`                                                                                     | usd-portal [verify]                                   |
| Duplicate, Append        | `Tool:SubTool:Duplicate` (needs Edit), `Tool:SubTool:Append` then `PopUp:<Tool>`                                                                   | [v03] exists; PopUp [macro]                           |
| Project All              | `Tool:SubTool:Project All` with only source and target visible → `zb_ops.project_all(checkpoint=...)`                                              | [v03] exists; run [verify live_06]                    |
| Project settings         | `Tool:SubTool:Dist`, `Mean`, `PA Blur` (commands.xml; the grouped `Tool:SubTool:Project:Dist` form is tried first)                                 | [cmdxml]                                              |
| Morph target             | `Tool:Morph Target:StoreMT`, `Switch`, `DelMT`, `Morph` slider → `store_morph_target()` (DelMT first when StoreMT is grayed)                       | [cmdxml] [macro]; grayed-state model [verify live_06] |
| Layers                   | `Tool:Layers:New` (top level only, records at once), `Tool:Layers:Intensity` (no effect while recording) → `new_layer()`, `set_layer_intensity(v)` | [cmdxml] [macro]; REC toggle path unknown             |
| Rename without a prompt  | none. `set_tool_path` renames the top SubTool only; name parts at creation                                                                         | forum 2026, MadPony                                   |

Safe Project All, the order `zb_ops.project_all` runs (not yet run in ZBrush):

1. `checkpoint`: versioned ZTL save first; Project All "might crash the program" (cgside MyhwQvkcnwI
   00:02:19). None raises; False only right after a save.
2. `top_level()`, then `store_morph_target()` and `new_layer()` there: "It's important that you do
   all of this on the highest level" (FlippedNormals Zp07GW3rND0 00:02:13, 00:02:47). One morph
   target per SubTool, destroyed by any point-count change, so it is stored after the last Divide.
3. Back to `level` (default: where the SubTool was) for a staged projection from the lowest level up
   (00:03:17).
4. Dist set explicitly, 0.1 (Drust nxMYYsyJt3o 00:02:19: the small default causes "90 percent" of
   artifacts); PA Blur lowered for a clean source (FlippedNormals).
5. Project All, then the gate: point count kept, target bbox (visible, mode 0) inside the bbox of
   all visible SubTools before (mode 2) within 2 percent [added], volume ratio 0.5 to 2 [added],
   watertightness kept.
6. Repair: `morph_repair(points)` (Morph brush strokes at the top level), `set_layer_intensity(v)`,
   or mask the busted area, invert and project again (00:09:27). Smoothing does not fix rogue
   vertices (00:04:27, 00:06:36). A target inside the source: masked Inflate and reproject, or
   ProjectionShell + Inner + Dist 1 (scenario-zbrush-retopology-export).

## 6. Masks, polygroups, deformation

- `Tool:Masking:Clear`, `Inverse` [v03]; `BlurMask`, `SharpenMask`, `Go To Unmasked Center` [macro]
  → `zb_ops.mask(op)`. Mask data cannot be read [forum].
- `Tool:Polygroups:Auto Groups` [v03]; `Group Visible` [macro] → `zb_ops.polygroups(op)`.
  `Tool:Visibility:HidePt/ShowPt/Grow/Shrink` [macro] → `zb_ops.visibility(op)`.
- `Tool:Deformation:Polish`, `Inflate` exist [v03]; each `set` applies once (Enhance Details macro
  sets Polish 100) → `zb_ops.polish(v)`, `deform(name, v, axes)`; axis bits x=1, y=2, z=4 with
  `set_mod` [doc].
- Morph target checkpoint: `Tool:Morph Target:StoreMT`, `Switch` [macro].

## 7. UVs and maps

- Native: `Tool:UV Map:Create (Unwrap):Unwrap` [v03] exists, Auto Seams [doc] →
  `zb_ops.uv_unwrap("native")` [verify live_08].
- UV Master: `Zplugin:UV Master:Unwrap` [v03] exists; a ZScript plugin press, control return [verify
  live_08].
- Check: `query_mesh3d(3)` UV bbox, `(4)` first tile, `(5, id)` next tile [doc]; OBJ `vt` lines
  (`zb_audit`).
- Maps by direct call:
  `create_normal_map(w, h, smooth, sub_poly, border, uv_tile, local_coordinates)`,
  `create_displacement_map(...)` (UVs and level 1 needed) [doc]. Multi Map Exporter
  `Zplugin:Multi Map Exporter:Create All Maps` exists [v03].

## 8. Decimation

`Zplugin:Decimation Master:Decimate Current` exists [v03]; `% of decimation`, `Pre-process Current`
[verify live_09] → `zb_ops.decimate(percent)`. A ZScript that pressed Decimation Master lost control
(ijacobs 2013, cgside 2022); Python [verify live_09].

## 9. Files

```python
zbc.set_next_filename("/abs/canvas.png"); zbc.press("Document:Export")   # 0.04 s, no dialog [v03]
zbc.set_next_filename("/abs/mesh.obj");   zbc.press("Tool:Export")       # 0.08 s, no dialog [v03]
zbc.set_next_filename("/abs/head_v003.ztl"); zbc.press("Tool:Save As")   # exists [v03]; dialog-free [verify live_06]
```

→ `zb_ops.export_canvas`, `export_obj`, `save_ztl(path, version=True)` (never overwrites, picks
`_vNNN`). Every wrapper checks the file on disk and `has_next_filename()` (a preset still pending
means a dialog probably opened) [added].

- OBJ export = active SubTool, tool units, no UVs when there are none; header
  `#Auto scale 1 / offset 0`; counts and volume equal the bridge values [obj].
- FBX ExportImport shows an options window that script cannot escape (Maxon forum 2025); USD Format
  ignores the preset (usd-portal). Use OBJ or `.GoZ` by path.
- Relative paths resolve in the ZBrush app folder: always absolute [doc].

## 10. Measuring (gates)

- `query_mesh3d(0)` points, `(1)` faces: lists, e.g. `[43480.0]` [v03]; `(2, mode)` bbox (0 visible
  current, 1 full current, 2 visible all, 3 full all) [doc].
- `get_polymesh3d_volume()` [v01], `get_polymesh3d_area()`, `is_polymesh3d_solid()` [doc] →
  `zb_ops.stats()`.
- Gates → `zb_ops.gate(op, before, after)`, returned as `result["gate"]` by `dynamesh`, `zremesher`,
  `divide`, `del_levels`, `decimate`, `polish`/`deform` and `project_all`. Volume ratio bands in
  `GATE_BANDS` ([added] start values: DynaMesh 0.5 to 2 and a problem outside, since that is a
  collapsed or exploded remesh; ZRemesher 0.8 to 1.25; Divide, Decimate 0.9 to 1.1; Polish 0.98 to
  1.02 after the sculpting digest's 2 percent start value). Volume is judged only on a mesh that was
  watertight; a result volume at or below 0 is always a problem; losing watertightness is a warning
  (python_sdk digest delta 22). `require_gate(r)` raises.
- Per vertex or per edge: export and run `zb_audit.audit(obj)` (poles, holes, non-manifold,
  symmetry, winding, scale).

## 11. Brushes, Draw, material

- Found: `Brush:Move`, `Brush:Standard`, `Brush:hPolish`, `Brush:ClayBuildup` [v03]. Not found:
  `Brush:Dam_Standard` [v03]; the file is `ZData/BrushPresets/DamStandard.ZBP` and the UI label is
  `Dam_Standard` → `zb_ops.select_brush("Dam_Standard")` tries every spelling, then loads the file
  with `Brush:Load Brush` [verify live_05].
- `Draw:Draw Size` 64, `Draw:Z Intensity` 20, `Draw:Zadd` 1 read on a fresh session [v01] →
  `zb_ops.set_draw()`.
- Smooth brushes only become the Shift brush and cannot be held from Python (BR doc; press_key
  broken) [verify live_05]. Smooth with `Tool:Deformation:Polish` or the hPolish brush.
- Neutral MatCap: `Material:MatCap Gray` (file `ZData/Materials/MatCap/MatCap Gray.ZMT`) [verify
  live_03]; current: `get_title("Material:Current Material")` [doc manual].
- Lazy Mouse `Stroke:Lazy Mouse:LazyMouse`, symmetry `Transform:Activate Symmetry` [v03].
- PolyFrame `Transform:Pf` (commands.xml id `Transform: Pf`; `Transform:PolyF` is the spoken label,
  not an id), perspective `Draw:Perspective` [cmdxml] → `zb_ops.PATHS["polyframe"]`, `["persp"]`
  [verify live_03].

## 12. Dialog budget: what blocks, and the substitute

| Raises a modal                                                  | Substitute                                                                                            |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| File dialogs of Import/Export/Save without a preset             | `set_next_filename(abs)` first [v03]                                                                  |
| FBX options, USD Format                                         | OBJ or GoZ by path                                                                                    |
| SubTool Rename, New Folder (text prompt)                        | name at creation; `set_tool_path` for the top SubTool; rename outside ZBrush                          |
| DynaMesh / ZRemesher on levels                                  | `del_levels()` on a duplicate first                                                                   |
| Del All, Delete, Merge Down confirmations                       | avoid; shipped macros answer with `[IKeyPress,'2',...]`, a ZScript macro pressed from Python [verify] |
| `message_*`, `ask_*`, `show_note(duration 0)`                   | never call; `set_notebar_text(text, progress)`                                                        |
| Quit with unsaved work                                          | `zb_launch.stop(save_to=...)`: save, then System Events "No"                                          |
| `press_key` ("Does not work"), `merge_undo` ("Not implemented") | versioned ZTL saves and morph targets as checkpoints                                                  |

## 13. Evidence table (2026-09-24, ZBrush 2026.2.1 build 53205)

| Test          | Result                                                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v01           | sphere DynaMesh 128, volume 4.184; canvas_click drag in Edit mode: no change; replayed last stroke with v_offset 60: 4.189; `query_mesh3d(0)` returns a list; Draw Size 64, Z Intensity 20, Zadd 1               |
| v02           | synthesized V02 stroke of 11 points at y 510 to 518: volume 4.189 → 4.193                                                                                                                                        |
| v03           | canvas PNG 2,827,877 bytes in 0.04 s; OBJ 2,665,861 bytes in 0.08 s; `set` on a missing path silent; 33 of 35 paths exist (not `Transform:Frame`, `Brush:Dam_Standard`); 43,480 points, 44,020 faces, SDiv max 1 |
| obj (offline) | the v03 OBJ has 43,480 points, 44,020 faces (42,936 quads), volume 4.193083 (= bridge 4.193), closed, one shell; stroke bumps at OBJ y about -0.46, z about +0.86: front view maps +Y up, +Z toward the camera   |
| log           | Activity log of the 05:20 session: canonical paths as in section 0                                                                                                                                               |
