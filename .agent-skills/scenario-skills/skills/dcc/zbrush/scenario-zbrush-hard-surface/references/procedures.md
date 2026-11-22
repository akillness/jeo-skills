# Procedures: hard surface through the bridge

Every procedure uses `scripts/zb_hardsurface.py` (inside-ZBrush functions called with `hs.hs_call`)
on top of the lead toolkit. **Status of every snippet: not yet run in ZBrush (2026-09-24).** The
pure and agent-side parts pass offline tests
(`tests/code/zbrush-hard-surface/test_zb_hardsurface.py`, 46 tests, run `python3 run_offline.py`);
the ZBrush-side functions were exercised only against a fake (`fake_hs.py`), which is not ZBrush.
The live test that will settle each procedure is named; run them all with
`tests/code/zbrush-hard-surface/run_live.sh` when a ZBrush session is yours.

Agent-side preamble used below:

```python
import sys
sys.path.insert(0, "<project>/skills/scenario-zbrush-hard-surface/scripts")
import zb_hardsurface as hs          # puts <skills>/scenario-zbrush-expert/scripts on sys.path too
import zb_launch as zl, zb_review, zb_audit
zl.start()                           # lead: ZBrush with the bridge, ping, Home Page closed
```

## P0. Timeouts mean a modal note

Several hard-surface buttons can raise a note (strings in the 2026.2.1 UI resources,
`UInterface.zsc`):

- **Make Boolean Mesh with coplanar faces:** "Do you really want to launch Boolean whatever?"
- **Make Boolean Mesh with invalid inputs:** "Every input SubTool must be a valid Solid".
- **Mirror And Weld with the floor Elv not 0:** "Would you like to proceed with the MirrorAndWeld
  operation?"
- **Import with n-gons:** "Would you like to split these polygons...".
- **DynaMesh on levels:** "Would you like to freeze subdivision level before entering DynaMesh
  mode?"
- **Check Mesh Integrity:** reports "Mesh integrity test completed successfully" or "failed ...
  Please 'Fix Mesh'" [modal is verify].
- **Create InsertMesh while the current brush is already an insert brush:** "Would you like to
  APPEND the active mesh to this brush or create a NEW brush?" The shipped Create Instance Subtool
  macro answers it with `IKeyPress '1'`, which Python cannot send.
- **The shipped Create Instance Subtool macro itself** ends with an info `[Note]` (macro source), so
  do not press the macro from the bridge: rebuild its routine (P10).

The toolkit prevents each one it can:

- `stack_report` and `coplanar_report` run before a boolean;
- `mirror_weld` sets `Draw:Elv` to 0 first [verify path];
- `import_part` refuses n-gons;
- `zb_ops.dynamesh` refuses meshes with levels;
- `hygiene(obj)` measures on an OBJ what Check Mesh would report;
- select a non-insert brush (Standard) before `Brush:Create:Create InsertMesh` [added, from the
  prompt string].

When a call still times out:

```python
try:
    r = hs.hs_call("make_boolean_mesh", timeout=90)
except zl.ZBTimeout:
    print(zl.diagnose())             # do NOT send more code: the queued call is still pending
    # screencapture -x when the screen is unlocked; answer the note with System Events or a human
```

Test: live_hs_03 (bridge alive after Make Boolean Mesh), live_hs_04 (after Mirror And Weld).

## P1. Path discovery (read-only)

`HS_PATHS` lists candidates per control, the flat `Tool:Geometry:<label>` form first (the confirmed
pattern: sections of Tool > Geometry add no path level). `HS_INFO` holds the bubble help from
`UInterface.zsc`, so `resolve_hs` rejects a duplicate label (Bevel, Thickness, Polish, Loops live in
several groups). Labels carry prefixes: `s.` Dynamic Subdiv, `P.` Panel Loops, `a.` Array Mesh, `m.`
NanoMesh (the NanoMesh prefix is proven by the shipped Create Instance Subtool macro).

```python
for key in ("dyn_smooth", "crease_lvl", "crease_pg", "pl_button", "am_repeat", "make_boolean",
            "show_issues", "mesh_from_brush"):
    print(key, hs.hs_run(f"result = zb_hardsurface.resolve_hs({key!r}, required=False)"))
```

When a key does not resolve, record a Python macro while clicking the control (ZScript > Python
Scripting > New Macro) or read the Activity log (Asset Directory `Logs/Activity`), then add the
canonical path to `HS_PATHS`. Test: live_hs_01_paths (writes the whole table).

## P2. Parts without strokes

Primitives come from Tool > Initialize on a copy of a level-free SubTool (Pavlovich replaces a
duplicate with Initialize > QCube, TANNfCLxFx4 [00:00:00]; the shipped "Append a QCube Subtool"
macro sets X/Y/Z Res, presses QCube, then Unify). Build in list order: the body first, each new part
lands directly below the active one.

```python
zl.call("zb_ops", "new_sphere", 64)                           # or a Unified body
zl.call("zb_ops", "save_ztl", "/abs/out/helmet.ztl")          # checkpoint, never overwrites
cut = hs.hs_call("new_part", "cube", res=[2, 2, 2], op="sub") # Duplicate + Initialize + Unify
hs.hs_call("place", position=[0.8, 0.0, 0.0], xyz_size=0.7)   # bbox center, tool units [verify]
hs.hs_call("place", size=[0.15, 0.4, 0.4])                    # per-axis Size [verify]
hs.hs_call("place", rotate=[0, 0, 15])                        # Deformation Rotate, z bit [verify]
```

- `new_part(..., method="append")` uses Append + `PopUp:PolyMesh3D` like the macro; whether that
  popup press returns in Python is [verify], so run it with a short timeout.
- A part modeled in Maya or Blender: export OBJ with quads and triangles only (no n-gons), then
  `hs.hs_call("import_part", "/abs/parts/visor_block.obj", position=[0, 0.3, 0.9], xyz_size=0.9)`.
- A brief in millimeters: `hs.to_tool_units(real_mm, real_extent_mm, tool_extent)` converts before
  any size or width.
- A rigged or animated asset: export the block OBJ (500 to 40k polys) for an engine check with the
  rig before detailing (Klimer 08crkU999Fs [00:16:59]-[00:17:32]).

Gate: the new index is the old index + 1; the body's face count is unchanged; `solid` is True for a
QCube. Test: live_hs_02_parts_status.

## P3. Live Boolean stack

Rules: body on top as Add or Start, cutters below, one Start per separately exported part, cutters
crossing the surface (never flush), low Dynamic levels, everything visible and watertight (LB doc;
Pavlovich HXnKnrhlFpA, Ab0ixptmNeA).

```python
hs.hs_call("set_roles", [{"index": 0, "op": "add", "start": True},
                         {"index": 1, "op": "sub"},
                         {"index": 2, "op": "add", "start": True}])  # a visor that stays separate
rep = hs.hs_call("stack_report")          # rows, Start groups, problems, warnings
assert not rep["problems"], rep["problems"]
for i, name in ((0, "body"), (1, "cut1")):          # OBJ per operand, active SubTool restored
    hs.hs_run(f"a = zbc.get_active_subtool_index()\nzbc.select_subtool({i})\n"
              f"result = zb_ops.export_obj('/abs/out/{name}.obj', overwrite=True)\n"
              "zbc.select_subtool(a)")
print(hs.coplanar_report("/abs/out/body.obj", "/abs/out/cut1.obj"))   # must be ok
hs.hs_call("live_boolean", True, show_coplanar=True)                 # native check: no red
zl.call("zb_review", "snapshot", "/abs/out/show_coplanar.png")       # look at it
hs.hs_call("live_boolean", True, show_coplanar=False)
mb = hs.hs_call("make_boolean_mesh", dsdiv=True, timeout=90)
assert mb["ok"], mb                       # UMesh_ tool selected, SubTools == Start groups
hs.hs_call("live_boolean", True, show_issues=True)                   # red outlines = holes,
zl.call("zb_review", "snapshot", "/abs/out/show_issues.png")         # edges on 3+ polygons
hs.hs_call("live_boolean", True, show_issues=False)
obj = zl.call("zb_ops", "export_obj", "/abs/out/umesh.obj", overwrite=True)["path"]
assert hs.hygiene(obj)["ok"]              # debris or non-manifold edges make ZRemesher fail
hs.hs_call("zremesh_recipe", "after_boolean", timeout=300)          # Detect Edges + Half
hs.hs_call("crease_by_groups", 45)        # booleans drop creases; see P4 before recreasing
```

- `set_status` reads each write back. The SDK docstring calls `set_subtool_status` a toggle, while
  Maxon's example and the shipped macro write absolute values. The function tries absolute, falls
  back to toggling, and reports which one worked. The status bits: 0x10 add, 0x20 sub, 0x40 clip
  (Intersect in the UI, `op="intersect"`), 0x80 start [doc].
- `roles_from_groups([[(0, "add"), (1, "sub")], [(2, "add")]])` builds the same roles from a group
  list and refuses an order ZBrush would group differently (processing is top to bottom, every Start
  opens a group).
- The pre-flight also flags partial hiding: the visible bbox differs from the full bbox [added].

Test: live_hs_02 (roles), live_hs_03 (boolean, both analysis snapshots, hygiene).

## P4. Crease plan and Dynamic preview

```python
hs.hs_call("crease_by_groups", 45)                 # Group Visible, Groups By Normals, UnCreaseAll, Crease PG
d = hs.hs_call("dynamic_subdiv", intent="working") # Smooth 3, CreaseLvl 2, Dynamic on, read back
print(hs.check_crease(d["state"]["smooth"], d["state"]["crease_lvl"], "working"))
hs.hs_call("crease_by_angle", 22)                  # a curved span instead (Pavlovich's arch)
sheets = hs.review_sheets("/abs/out/stage4", polyframe=True)   # forms, planes (metal), PolyFrame
```

- Open `sheets["planes"]["sheet"]` and judge it with `critique.md` A1 to A4.
- A missed edge: `crease_by_groups(33)`.
- Edge width: `hs.edge_width(smooth, crease_lvl)` names it (gap 0 razor, 1 tight, 2 medium, 3 soft).
  Razor edges: `intent="bake"` (4/2); a narrower but not razor edge: `intent="tight"` (4/3); a
  softer one: `intent="soft"` (4/1). Render the candidates under metal and keep the widest edge that
  still looks planned (Plouffe). v1 called 4/3 "wide": that was inverted, and `crease_plan("wide")`
  now refuses with the explanation.
- `crease_by_angle(22)` held one arch for Pavlovich; too low a tolerance creases the small angles
  along an arc (qeFclVta4No [00:23:30]). Tune per span on the PolyFrame sheet: raise it where dotted
  crease lines appear along a curve.
- **Recreasing pitfall:** Crease PG after later edits (a boolean, new groups) recreases every group
  border, including borders you uncreased on purpose (qeFclVta4No [00:16:32]). Keep a list of
  softened borders; when it is not empty, merge those groups first or use `crease_by_angle` with the
  tuned tolerance instead of `crease_by_groups`.
- Scalloped caps: a support loop (`groups_loops(1)`) or regroup. Crease first, a loop only where the
  falloff must be local (qeFclVta4No [00:08:18]).
- Single-sided parts (a visor shell): Dynamic Thickness (`dynamic_subdiv(thickness=...)`) gives
  visual thickness that toggles with Dynamic (qeFclVta4No [00:02:36]).

Test: live_hs_04_crease_dynamic.

## P5. High-poly commit (bake split) and exact chamfers

```python
b = hs.hs_call("bake_split", 4, 2, timeout=240)   # copy: Apply at 4/2; original: Dynamic off
assert b["high"]["ok"], b                          # levels == 1 + Flat + Smooth
```

- The copy is expected at index + 1 [verify].
- Apply only when the shape is final (Pavlovich qeFclVta4No [00:25:33]).
- The 2026.2.1 build fixed an Apply crash.
- **Exact chamfer widths.** CreaseLvl sets a relative falloff and Polish or DynaMesh only the
  minimum edge width (Polycount author). When the brief fixes a width, use one of:
  - Crease Bevel on the creased edges:
    `hs.hs_call("crease_bevel", width=hs.to_tool_units(2.0, 300.0, 2.0))` (Crease > Bevel with Bevel
    Width [doc reference]; Chervenka's Bevel Width fix at poles [00:31:38]) [verify units of the
    slider];
  - a boolean chamfer: a rotated subtractive box along the edge (Polycount: "Any chamfers that need
    to be specifically larger I'll do with boolean subtractions");
  - BevelPro (Zplugin; bevels along polygroup borders, Bevel or Chamfer output, Auto Apply off
    returns boolean parts) runs in its own app window, so it is a GUI step [verify scriptability];
    it needs Metal on macOS.

Test: live_hs_04.

## P6. Mirror

Mirror And Weld always copies the negative half onto the positive half. `mirror_weld` has no default
side: say which half holds the edit.

```python
before = zl.call("zb_ops", "export_obj", "/abs/out/before_mirror.obj", overwrite=True)["path"]
print(hs.mirror_report(before))              # unmatched vertices per half; suggest is a hint only
hs.hs_call("mirror_weld", "x", keep="pos")   # Deformation Mirror first, then Mirror And Weld (x bit 1)
after = zl.call("zb_ops", "export_obj", "/abs/out/after_mirror.obj", overwrite=True)["path"]
assert hs.mirror_check(before, after, keep="pos")["ok"]   # the kept half survived, result symmetric
```

- When is the mirror needed: after any Slice, Trim or BRadius cut (they ignore symmetry, FOdVdgiAHWo
  [00:06:20]; 8LNjAkqr_lI [00:05:31]), after a one-sided cutter or ZModeler edit, after Auto Groups
  (different groups per side, FAFtW_8zB5Q [00:04:57]), and after Groups By Normals so groups match
  (8LNjAkqr_lI [00:09:58]).
- Which side: you know where you cut (the `place` position of the cutter, the side of the click).
  `mirror_report` suggests a side only when one half holds all or most unmatched vertices; a removed
  feature leaves unmatched vertices on both halves, so it returns None and the edit log decides.
- The call refuses a mesh with levels. With levels: `zb_ops.del_levels()`, mirror, then
  `Tool:Geometry:Reconstruct Subdiv` until the level count stops growing. This works only when
  topology did not change and no layer must survive (Plouffe [02:00:53]-[02:03:39]).

Gate: `mirror_weld` `ok` (bbox symmetric) and `mirror_check` `ok`. Test: live_hs_04.

## P7. Panels and fitted parts without strokes

```python
hs.hs_call("crease_by_groups", 45)                       # the panels are the polygroups
p = hs.hs_call("panel_loops", thickness_rel=0.01)       # Plouffe recipe; thickness_rel [added]
print(hs.hs_call("split_copy", "groups"))               # panel count on a copy
hs.hs_call("groups_loops", 1)                           # support loops around every group
```

- **Plan first** (Pavlovich FAFtW_8zB5Q [00:00:00]; Klimer): panels, pockets and plates as
  polygroups or polypaint regions before any cut, so nothing is committed. Polypaint regions per
  color: `set_color` plus Color > FillObject on a hidden or masked region [verify]; Mask By
  Polypaint is a dialog (GUI). Prefer polygroups for the agent: Group Masked, Groups By Normals, or
  the groups a boolean propagates.
- **Clean a mask before it becomes geometry:** `hs.hs_call("mask_fillet", 2)` (Klimer's blur,
  invert, blur, invert, repeated: every corner gets the same fillet, stray bits go). Then Edgeloop
  Masked Border to cut a group line along it:
  `hs.hs_run("zbc.press(zb_hardsurface.resolve_hs('edgeloop_masked'))")`.
- **Fitted parts (a visor, a hatch, an embedded panel).** Pavlovich slices and runs DynaMesh with
  Groups on so the pieces fit "perfectly" (Yprguxci8NY [00:01:05]-[00:02:43]); Knife with Split To
  Parts leaves no gap (8LNjAkqr_lI [00:01:34]). Two scriptable equivalents [added]:
  - one cutter used twice: duplicate the shell and the cutter, order the SubTools shell copy,
    cutter, shell, cutter copy, then
    ```python
    r = hs.fitted_split_groups(body_a=1, cutter_a=2, body_b=3, cutter_b=4)   # indices as placed
    hs.hs_call("set_roles", r["roles"])      # group 1: shell INTERSECT cutter = the visor piece
    mb = hs.hs_call("make_boolean_mesh", dsdiv=True, timeout=90)   # group 2: shell - cutter
    ```
    Both borders come from identical cutters, so the fit has no gap; scale `cutter_b` up by the
    wanted gap for a constant one;
  - a polygroup outline (mask, `mask_fillet`, Group Masked) then DynaMesh with Groups on
    (`zb_ops.dynamesh(res, groups=True)`): the group border becomes a physical separation;
    `split_copy("groups")` or Groups Split puts the piece on its own SubTool, then scale it in
    slightly and push it for the embedded read.
- Tight-fitting splits along an arbitrary freehand line still need Knife with Split To Parts (GUI,
  `gui-paths.md`), or a ZScript `IKeyPress` wrapper [verify] (scenario-zbrush-automation).

Test: live_hs_05_panels_curves.

## P8. Vents and slots with ArrayMesh

```python
plan = hs.array_plan(count=5, cutter_width=0.15, span=1.35)    # pitch 0.3, wall 0.15: ok
hs.hs_call("new_part", "cube", res=[2, 2, 2], op="sub")
hs.hs_call("place", position=[-0.6, 0.2, 0.95], size=[0.15, 0.45, 0.4])
hs.hs_call("dynamic_subdiv", intent="cutter")                 # Smooth 3 / Crease 2 on the cutter
hs.hs_call("crease_by_angle", 45)                             # sharpen the cutter
hs.hs_call("array_mesh", plan["count"], offset=[plan["pitch"], 0, 0])
```

- Whether the ArrayMesh Offset is per copy or the total span is [verify]; live_hs_03 measures the
  bbox growth. If it is the total span, pass `offset=[plan["total"] - 0.15, 0, 0]`.
- Keep the array live while designing. Use `array_commit("mesh")` before Make Boolean Mesh only if
  the boolean ignores the array; the Live Boolean doc lists ArrayMesh as a supported, converted
  input.

Test: live_hs_03.

## P9. Seam cutter from curves [verify]

A thin subtractive seam along a polygroup border, built from script curves instead of a curve-IMM
stroke (Pavlovich's FM3uQJy1GUY route):

```python
obj = zl.call("zb_ops", "export_obj", "/abs/out/shell.obj", overwrite=True)["path"]  # active = shell
lines = hs.border_polylines(obj)                         # OBJ coordinates = tool space [verify]
seam = hs.hs_call("curve_mesh", lines[0], "seam01", 0.01)
hs.hs_call("set_status", seam["subtools_after"] - 1, op="sub")
```

- `create_mesh_from_curves(name, 1, thickness)` adds a new SubTool (SDK stub). What it builds is
  [verify]: a tube or a strip.
- Maxon's lightning example notes that a curve brush only applies when a curve is touched, so the
  brush route (CurveTube, a Tri Parts IMM) still needs a click.

Test: live_hs_05.

## P10. Hardware and kitbash

Keep one fastener family for the whole asset (Klimer [01:00:37]). Instanced hardware (NanoMesh,
ArrayMesh) makes a late change one swap; seats placed one by one with `import_part` need one call
per seat.

**A part from an IMM without a drag** (Chervenka PGX39tnEf3Y [00:21:24]: Mesh From Brush, then
ArrayMesh, then Convert To NanoMesh):

```python
f = hs.hs_call("fastener_from_brush", "IMM Industrial Parts")   # duplicate + MeshFromBrush + Unify
hs.hs_call("place", position=[0.0, 0.0, 1.2], xyz_size=0.08)
hs.hs_call("array_mesh", 6, rotate=[0, 0, 360])                  # radial set [verify semantics]
hs.hs_call("array_commit", "nano")                               # Convert To NanoMesh
hs.hs_call("nanomesh_set", ZRVar=10)                             # rotation variation (Chervenka)
```

Which mesh of a multi-mesh IMM MeshFromBrush takes is [verify] (live_hs_07).

**NanoMesh insert by one click** [verify], two routes:

- on an existing polygroup (Pavlovich QGNn1-ey6ME [00:10:36]-[00:11:40]: Bolt Head, Insert NanoMesh
  / PolyGroup All, one per face): a NanoMesh brush (Brush > Create > Create NanoMesh Brush from an
  IMM; its default face action is Insert NanoMesh / A Single Poly, so switch the target to PolyGroup
  All and save the brush once in the GUI), then
  ```python
  assert hs.hs_call("imm_ready")["ok"]                           # levels block insertion
  obj = zl.call("zb_ops", "export_obj", "/abs/out/rim.obj", overwrite=True)["path"]
  cam = hs.hs_run("b = zbc.query_mesh3d(2, 3)\nresult = {'t': zbc.get_transform(), "
                  "'p': [(b[0]+b[3])/2, (b[1]+b[4])/2, (b[2]+b[5])/2]}")
  tgt = hs.click_target(obj, cam["t"], group="Group12", pivot=cam["p"])   # a visible rim face
  hs.hs_call("canvas_action", tgt["x"], tgt["y"], method="click")
  hs.hs_run("result = zbc.is_enabled(zb_hardsurface.resolve_hs('nm_edit_mesh'))")  # evidence
  ```
  Pattern sliders (H and V Tile 3, Border, Corners) and ZRotation 0 with Align To Normal follow as
  `nanomesh_set` values [verify labels].
- where no face exists (Chervenka [00:20:15]-[00:21:24]): a helper placement plane. The shipped
  Create Instance Subtool macro builds one: `Tool:Plane3D`, `Tool:Initialize:HDivide` and `VDivide`
  2, Make PolyMesh3D, the view turned front, then `[IClick,1004, width/2, height/2]` at the canvas
  center. From Python rebuild that routine with `set_transform` and `canvas_action(w/2, h/2)`, not
  by pressing the macro (it ends on a note, P0).

**The late swap** (Pavlovich QGNn1-ey6ME [00:12:26]-[00:13:32], [00:17:56]):
`nanomesh_set(**{"Edit Mesh": True})` opens the source; replace its mesh (the new part's brush
selected, then `hs.hs_run("zbc.press(zb_hardsurface.resolve_hs('mesh_from_brush'))")`, [verify]
inside Edit Mesh; Pavlovich swaps it with the Gizmo IMM swap); Unify the source (swapped parts
arrive tiny); `nanomesh_set(**{"Edit Mesh": False})`: every instance follows.

**Recessed port across a seam** (Pavlovich cw449pmS64g [00:01:06]-[00:04:34]: one sphere sliced, one
half merged into part A, the other subtracted from part B, so a boss and a socket line up across the
seam). Live Boolean form [added]:

1. Parts A and B on their own SubTools, in that order.
2. A QSphere placed straddling the seam (`new_part("sphere")`, `place`), Dynamic Smooth on (DSDiv
   carries it, as Pavlovich's Crease PG plus two Divides keep his halves from faceting).
3. SubTool order: part A, ball, a trim box on B's side just off the seam plane (not coplanar with
   A's seam face: check with `coplanar_report`), part B, a duplicate of the ball.
4. Roles and commit:
   ```python
   r = hs.seam_port_groups(part_a=0, ball_a=1, trim_a=2, part_b=3, ball_b=4)
   hs.hs_call("set_roles", r["roles"])        # A + ball - trim | B - ball
   mb = hs.hs_call("make_boolean_mesh", dsdiv=True, timeout=90)
   ```
5. A screw hole in the socket: a small subtractive cylinder (Pavlovich stamps Alpha 06 with DragDot;
   the cylinder is the agent substitute). Mirror the finished side (P6).

**Exact runs** of bolts or rivets: `hs.spaced_points(polyline, count=8)` (or `pitch=`) gives seats
and tangents along a border (`border_polylines`) for `import_part`, helper planes, or a check of an
ArrayMesh run.

**IMM runs** [verify]. Since 2024 every stroke type works with IMM brushes (wnONEaRVhYU):

- Dots stroke with LazyMouse on and LazyStep as spacing (1 overlaps half, 2 touching by his guess,
  2.5 his rivets, 0 breaks the stroke): select the IMM brush, set the stroke, then one synthesized
  line with `zb_ops.sculpt_stroke(zb_stroke.line(p0, p1))`;
- Curve Mode with Curve Step (1 = parts just touch, IMM doc Curve Strokes) on script curves
  (`new_curves`, `add_curve_point`, `curves_to_ui`), then a tap on the curve to commit (lightning
  example);
- insertion is refused on a SubTool with levels: `imm_ready()`, and keep Pavlovich's hidden,
  level-free placeholder PolyMesh3D at the top of the list (QGNn1-ey6ME [00:14:07]-[00:15:46]);
  Split Unmasked Points moves the insert to its own SubTool.

Test: live_hs_07_kitbash_clicks (MeshFromBrush, the radial NanoMesh set, imm_ready).

## P11. Low poly and the Painter handoff

| Route                 | Calls                                                                                                                    | When                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Cage                  | the Dynamic-off original after `bake_split`                                                                              | a ZBrush-built base with clean groups                   |
| ZRemesher per part    | `zremesh_recipe("part", target_k=...)` after `crease_by_groups`                                                          | boolean or knife results                                |
| Quick shell           | `dynamesh_visible(res, skip_indices=[animated])`, then per SubTool `zb_ops.decimate(hs.decimate_percent(target, total))` | a static prop or a deadline (Pavlovich calls it hasty)  |
| DCC                   | export OBJ per part; scenario-maya-modeling or scenario-blender-retopology                                               | LODs, animated parts, clean shading                     |
| Retopo brush (2026.1) | GUI: first click asks Yes (new retopo SubTool above) or No; refuses a SubTool with levels (VD 3.5)                       | a hand-built low inside ZBrush, by a computer-use agent |

```python
dm = hs.hs_call("dynamesh_visible", 1000, skip_indices=[2], timeout=600)
pct = hs.decimate_percent(25000, dm["total_faces"])
```

- Decimation Master is a plugin press, so run it last. The lead's live_09 covers whether control
  returns.
- Gate: `zb_audit.verdict(zb_audit.audit(obj), "game", budget_tris=...)`.

**Painter routes** (VD 3.5, 3.6; run by scenario-zbrush-retopology-export):

- **Substance Bridge** (Texture > Substance Bridge, 2026.2.0): Send to Painter with Low & High (each
  SubTool's lowest and highest level, so the `bake_split` copy carries both), Auto-Bake Maps, Smooth
  Normals, Send PolyPaint (a fill layer: the ID colors from FillObject per part), Texture Sets per
  SubTool or per PolyGroup. Force UV Auto-Unwrap is global and strips existing UVs from every
  SubTool; each send makes a new Painter project. Before sending:
  ```python
  rows = [{"name": "shell", "levels": 5, "has_uvs": True, "polypaint": True}]
  print(hs.bridge_preflight(rows, low_high=True, force_unwrap=False, send_polypaint=True))
  ```
- **Native Unwrap with crease seams** (Tool > UV Map > Create (Unwrap), 2023):
  scenario-zbrush-retopology-export's `unwrap_creases` runs UnCrease All, Crease PG, Creased Edges
  on, Unwrap at the lowest level. On a hard-surface cage the polygroups are the crease plan, so the
  seams follow the hard edges [added]; run it on the cage copy, since it rewrites the creases.
- **OBJ plus an external bake**: OBJ per part with matching high and low names (PBAKE [00:00:00]);
  the polypaint ID travels as an MME Texture From Polypaint map, because OBJ vertex color is not
  established (PBAKE Agent translation assumes FBX [verify], and FBX raises a dialog).

Test: live_hs_06_lowpoly.

## P12. Numbers for the critique

```python
el = hs.edge_language("/abs/out/cage.obj")                # straight / arc / compound / ambiguous
pf = hs.plane_flatness("/abs/out/cage.obj")               # per polygroup: meant flat, wobbly
pr = hs.pinch_report("/abs/out/cage.obj", max_stars=3)    # stars inside groups (Plouffe)
nv = hs.hs_run("""
w, h = zbc.get('Document:Width'), zbc.get('Document:Height')
result = zb_hardsurface.normal_variance(w/2-60, h/2-60, w/2+60, h/2+60, 8)
""")
```

- Run `edge_language` on the cage or the UMesh, not on a soft-beveled high; raise `noise_rel` on
  DynaMesh input.
- `pinch_report` lists every star vertex inside a group; each one is a candidate dimple under metal
  after the bake (Plouffe [02:25:59]-[02:28:48]). Look at them at a low level with dark polypaint
  and a low-metal MatCap; fix on the cage (regroup, re-ZRemesher, project), and a few local ones
  with Plouffe's smart smooth (GUI) or Chervenka's StoreMT, Polish, Project Morph.
- `normal_variance` needs an orthographic view square to one plane, with the rectangle inside that
  plane [verify pixol normals].

Offline tests cover all four on synthetic meshes. Live: live_hs_05.

## P13. Stroke fallback (concept only, weak)

The sculpted route (hPolish planes, TrimDynamic bevels, Orb_Cracks grooves) is a set of synthesized
strokes:

```python
zl.call("zb_ops", "set_symmetry", False)
zl.call("zb_ops", "sculpt_stroke", [[420, 300], [700, 300], [700, 330], [420, 330]],
        brush="hPolish", size=120, z_intensity=20)          # large radius: a small one records strokes
```

- Not yet run in ZBrush. Brush selection is covered by the lead's live_05, and there is no dedicated
  test.
- There is no Alt, so hPolish always digs. Zsub in place of Alt is [verify].
- Judge each pass on the metal sheet. Prefer the clean method (P4, P7).

## P14. ZModeler by click, with the 2026 crease options [verify]

ZModeler options live in the Space pop-up (no item path). The agent route is a brush that already
holds the action and option, then one canvas input on a picked element.

1. Once, in the GUI (a computer-use agent or a human): set the action, target and crease option,
   then Brush > Save As (Asset Directory) or save a ZModeler preset (2025.2 My Presets). The option
   comes from `zmodeler_plan`:
   ```python
   print(hs.zmodeler_plan("inset", "crisp"))          # Crease New Edges; +4 faces per quad
   print(hs.zmodeler_plan("inset", "rounded"))        # Crease Inner Poly: a rounded inset
   print(hs.zmodeler_plan("insert_edgeloop", "hold", ring_quads=16))   # Crease; +16 faces
   print(hs.zmodeler_plan("bevel", "outer"))          # 2026.2.1: All, Outer or Inner Edges
   ```
   Defaults are Do Not Crease: a loop added with Dynamic on holds nothing until Crease is picked
   (Maxon 6KZiNEO65YY [00:01:06]). The crease at creation replaces the alternate-polygroup plus
   Crease PG pass of older tutorials.
2. Each use: `zb_ops.select_brush("<saved brush>")`, export the SubTool,
   `click_target(obj, transform, group=..., face=... or edge=...)`, then
   `canvas_action(x, y, method="drag", expect_delta=plan["face_delta"])`. The first use needs a drag
   (inset amount, QMesh height); a later tap replays the last action at the same value.
3. Gate: the face delta matches the plan; PolyFrame shows the dotted crease lines.

If the click does not register (the README found `canvas_click` drags in Edit mode did not sculpt),
fall back to palette equivalents: GroupsLoops then Crease PG for creased support loops; Panel Loops
for insets; Crease Bevel for bevels; booleans for cut-ins; or a DCC block through `import_part`.
Test: live_hs_07 (a synthesized drag on a QCube face with the default QMesh action).

## P15. Micro detail on layers (after sign-off)

Klimer (08crkU999Fs [00:31:47]-[00:34:30], [00:49:08]): one layer per region and pattern (grain,
filigree, hex, mold lines); a negative layer strength carves in instead of out; duplicating a layer
doubles its strength; layers do not survive added or removed geometry.

```python
rec = zl.call("zb_ops", "stats")                                  # at layer creation
hs.hs_run("result = zb_ops.press(['Tool:Layers:New'])")   # [macro] path; zb_character.layer_new does the same
# ... detail on the layer (alpha stamps, masks plus Inflate) ...
assert hs.layer_safe(rec, zl.call("zb_ops", "stats"))["ok"]    # topology unchanged since
```

- Make layers after the last boolean, remesh, Panel Loops or Apply [added]; before any later
  topology change bake them (`Tool:Layers:Bake All`) or plan to rebuild them.
- Clean group borders with Polish By Groups rather than new border loops, so the layer stays valid
  (Klimer uses the SmoothGroups brush for the same reason, [00:48:35]-[00:49:42]).
- Fine lines likely to change can go to the texture instead (Pavlovich FAFtW_8zB5Q [00:00:32]).

## P16. Worked brief: sci-fi helmet for a game character (scenario Z3)

1. **Setup and function sheet.**
   - Visor: hinged, a separate part. Vents: two cheek intakes. Shell: two halves with one hex-screw
     family. Camera: third person.
   - The interior is unseen: fill it or keep it simple and let dark AO sell it (Pavlovich
     max2JumNDp4 [00:01:06]).
   - Append or import the head proxy, Unify, then `save_ztl`. If the character is rigged, the block
     goes to the engine with the rig before detailing.
2. **Shell.** `new_part("sphere")`, `place(size=[...])` over the head with clearance; face and neck
   openings as subtractive cubes through the shell; `make_boolean_mesh()`, Show Issues, `hygiene`,
   `zremesh_recipe("after_boolean")`.
3. **Crease plan.** `crease_by_groups(45)`, then `crease_by_angle` tuned per span on the crown;
   `dynamic_subdiv(intent="working")`, then the metal sheet.
4. **Visor.** The fitted split (P7): the shell duplicate intersected with a visor-shaped cutter is
   the visor, the shell minus the same cutter is the opening; the visor keeps its own Start group.
   Or a Maya or Blender block through `import_part`.
5. **Vents.** A creased rounded cutter with `array_mesh(5, offset=...)` on one side, placed by
   `array_plan`, then `mirror_weld(keep=...)` and `mirror_check` (P6), or symmetric cutter positions
   on both sides.
6. **Panels.** Groups plus `panel_loops` on the shell copy for real separations; seams from
   `border_polylines` plus `curve_mesh` [verify].
7. **Bolts and ports.** Recessed ports across the halves' seam with `seam_port_groups` (P10); the
   hex screws as one NanoMesh or ArrayMesh family seated in them, or `import_part` per seat.
8. **Commit.** `bake_split()` per part; `edge_language`, `plane_flatness` and `pinch_report` on the
   cages; a decimated review copy under 1M points for the engine (Klimer).
9. **Micro detail** only after sign-off, on layers (P15).
10. **Handoff.** OBJ per part (matching high and low names), the last sheets and `stack_report`;
    Substance Bridge after `bridge_preflight`, or UVs and bakes by
    scenario-zbrush-retopology-export; a hand-built low by scenario-maya-modeling or
    scenario-blender-retopology.

Deterministic: every step above except Knife lines, the one-time ZModeler brush setup, and the
clicks of P10 and P14, which are [verify] until live_hs_07 runs.
