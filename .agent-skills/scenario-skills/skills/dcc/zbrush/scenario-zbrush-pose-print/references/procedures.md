# Bridge procedures: posing and print prep

Agent-side Python. Every block below is **not yet run in ZBrush**: no ZBrush session was assigned to
this skill while it was written, and at 06:11 to 06:15 on 2026-09-24 three `zb_launch.start()`
attempts by another session stalled at startup
(`tests/code/zbrush-expert/live_logs/*/00_start.json`). What IS verified:

- the math and file logic, offline: `tests/code/zbrush-pose-print/test_zb_print.py` (synthetic
  meshes with known walls, gaps, sections, angles, plus the real v03 ZBrush export) and
  `test_zb_pose.py` (FK, pivot correction, guards, against a fake `zbrush.commands`); 57 tests pass
  (`offline_results.json`, 42 in v1, 15 added by the 2026-09-24 refactor);
- from the lead skill, through the bridge: DynaMesh, Divide, strokes, dialog-free `Tool:Export` OBJ
  and `Document:Export` PNG (v01 to v03).

Revised 2026-09-24 after the Z5 blind grade: props and plates stay in the TPose mesh, the transfer
has a point-order guard, the clean project and ZPR save are code, the hollow chain is complete, the
brief box exists, decimation can be masked. New offline tests pass (see `offline_results.json`); the
new live checks are in `live_p05`, `live_p07`, `live_p08`, not yet run in ZBrush.

Each procedure names the live test that will settle it. Item paths carry the tags of
`scripts/zb_pose.py` (`[strings]` = the label exists in the 2026.2.1 UI resources, `[macro]` = used
by a shipped macro, `[log]` = written by ZBrush's Activity log).

```python
# common header for every procedure
import sys
SKILLS = "/abs/path/to/skills"  # the folder holding the scenario-zbrush-* skills
sys.path[:0] = [f"{SKILLS}/scenario-zbrush-expert/scripts", f"{SKILLS}/scenario-zbrush-pose-print/scripts"]
import zb_launch as zl          # lead: start, run, call, stop
import zb_review                # lead: review sheets
import zb_pose                  # this skill, runs inside ZBrush through zb_pose.call
import zb_print as zp           # this skill, agent side, numpy
JOB = "/abs/path/to/job"        # absolute paths only: relative ones land in the app folder
```

## P0. Session and intake

```python
zl.start()                                            # lead: bridge up, Home Page closed
inv = zb_pose.call("inventory")                       # name, visible, points, faces, levels, bboxes, solid
names = [r["name"] for r in inv["subtools"]]
assert len(set(names)) == len(names), "rename at creation: Decimation Master and GoZ need unique names"
zl.call("zb_ops", "save_ztl", f"{JOB}/hero_rest.ztl")  # -> hero_rest_v001.ztl, never overwrites
```

Gate: the inventory is saved with the job; every later check compares against it. Status: not yet
run in ZBrush. Test: `live_p01` (inventory runs inside `preflight_tpose`).

## P1. Real-world scale without dialogs

Scale Master Set Scene Scale and 3D Print Hub Update Size Ratios open choice dialogs (doc). The
dialog-free route sets what Scale Master stores anyway, the Export Scale (doc: after Unify the real
size lives in `Tool:Export:Scale`), so the internal mesh keeps its well-behaved size and every OBJ
comes out in millimeters.

```python
target = zp.scale_for(1800, "1/6")                    # 300.0 mm; Hasbro PVC: scale_for(h, 12, shrink_pct=4)
# hide what must not count in the height (a display base) before this call
sc = zb_pose.call("set_export_scale", target)         # Export Scale = target / visible internal height
parts = zb_pose.call("export_parts", f"{JOB}/scale_check")
chk = zp.check_scale([p["path"] for p in parts["parts"]], target)
assert chk["ok"] and chk["scales_consistent"], chk     # 0.5 % [added]; one '#Auto scale' on all parts
```

Gate: assembled height within 0.5 %, one export scale on every part. If `scales_consistent` fails,
Export Scale is per SubTool: call `set_export_scale` per SubTool with the same factor [verify].
Human route: Zplugin > Scale Master > Set Scene Scale (mm), New Bounding Box Subtool, R on, type the
height, Resize Subtool with All (Gaboury). Status: not yet run in ZBrush. Test:
`live_p04_scale_export.py`.

**The brief box, SubTool number one** (Gaboury [00:21:43] [02:04:45]). The height sets the scale;
the box is the envelope the client or the package allows (his car: 8 x 6 x 4 in). Every later part
is checked against it, and a late size change is one call (the export scale route is what Scale
Master's Resize with All plus Unify leaves behind: real size in `Tool:Export:Scale`, doc).

```python
env = zp.envelope([p["path"] for p in parts["parts"]], (220.0, 300.0, 160.0))   # W x H x D from the brief
box = zb_pose.call("brief_box", (220.0, 300.0, 160.0), sc["export_scale"], env["floor_center_mm"])
zb_pose.call("set_visible", box["index"], False)       # hidden while scaling and exporting parts
# ... later, at every print gate:
rep = zp.print_report(paths, 300.0, envelope_mm=(220.0, 300.0, 160.0))   # "inside brief box" is a must
# brief changes late (Gaboury: 6 in became 4 in): one call rescales every part at export; the box
# scales with them, so size it to the new brief (geometry_set, mm / new export scale), re-run every gate
sc = zb_pose.call("set_export_scale", 200.0)
```

Show the box (`set_visible(..., True)`) in one review sheet to see what clips out. A distance the
brief names (head height, blade length) is measured like Gaboury's Transpose-line caliper, which
snaps to points: `zp.caliper(obj, p, q)["distance_mm"]`. For a human, the caliper is the action line
after Scale Master, units in Preferences > Transpose Units (`gui-paths.md`). Status: not yet run in
ZBrush. Test: `live_p08` (box size in mm, floor, hide).

## P2. Transpose Master preflight and round trip

```python
cp = zb_pose.call("clean_project", f"{JOB}/hero_rest.ztl", timeout=300)   # doc Tips, see below
assert cp["ok"], cp
pre = zb_pose.call("preflight_tpose")                  # ShowPt on every SubTool, levels, density, names
if not pre["ok"]:
    raise SystemExit(pre["problems"])                  # e.g. partial hiding = Vertex Mismatch
print(pre["warnings"], pre["density_spread"])          # spread > 2x [added]: equalize level 1 (Plouffe)
tp = zb_pose.call("tpose_mesh", True, True, False, timeout=300)   # Layer, Grps, no ZSphere rig
assert zl.ping()["ok"]                                 # the ZScript plugin handed control back
assert tp["combined"]["faces"] == tp["visible_l1_faces"], tp
rest = zb_pose.call("export_tpose", f"{JOB}/tpose_rest.obj")          # the order reference
zb_pose.call("save_project", f"{JOB}/pose_session")                  # TM data lives in the ZPR
# ... pose the combined mesh here: P3 (external rig) or P4 (ZSphere rig) ...
back = zb_pose.call("tpose_to_subtools", tp["preflight"], rest["path"], timeout=300)
assert back["ok"] and back["order_check"]["same"], back   # order, source tool, every point count
```

Rules:

- **Clean project first** (doc Tips): `clean_project` saves a versioned ZTL, opens a default project
  and loads the tool back, so the pose cannot land on another model when parts of it also exist as
  separate tools. Opening a ZPR deletes every loaded tool (scenario-zbrush-expert traps), which is
  why the ZTL is checked on disk before the project opens. The doc names DefaultCube.ZPR; 2026.2.1
  ships `Lightbox/Projects/DefaultProject.ZPR` and `Cube.ZPR` instead (local check),
  `DEFAULT_PROJECT` points at the first [verify equivalent].
- **Save the ZPR** while the TPose mesh exists (doc Saving/Loading: TM data is saved with the
  project since 4R6). A ZTL alone does not carry it: a session that ends between TPoseMesh and
  TPose>SubT without a ZPR loses the way back.
- **No Gizmo 3D deformers on the TPose mesh** (Bend Arc, Bend Curve, Twist, Taper, any modifier from
  the Gizmo's deformer list): "the point order can be changed" and SubTools get destroyed on
  transfer (doc); a reorder keeps the point count, so counting alone does not catch it [added].
  Plain rotations, rigs, Deformation sliders are fine [verify in live_p01].
  `tpose_to_subtools(..., rest_obj)` compares the face lists of the rest and posed TPose exports and
  refuses the press when they differ. Status: not yet run in ZBrush. Tests:
  `live_p01_transpose_master.py`, `live_p08` (clean project, ZPR, order guard); offline: the guard,
  the save order and the versioning.

## P3. Route A: numeric external rig (Blender), then back onto the TPose mesh

Munoz Gomez's round trip (Mixamo or Blender, import on a layer at level 1) made exact: bones get
numeric angles, the vertex order is checked, not hoped for.

```python
tp = zb_pose.call("tpose_mesh", True, True, False, timeout=300)
rest = zb_pose.call("export_tpose", f"{JOB}/tpose_rest.obj")                  # no groups: no importer split
grp = zb_pose.call("export_tpose", f"{JOB}/tpose_groups.obj", True)           # polygroups as OBJ groups [verify]
joints = zp.joint_centres(grp["path"])                 # pivots between adjacent polygroups, in OBJ space
# Auto Groups on the export: one row per loose piece; the body is pieces[0], then plates, weapon, bolts
pieces = zp.loose_pieces(rest["path"])
ids, names = zp.face_groups(grp["path"])
sword = pieces[1]                                      # identify each piece from its bbox and the inventory
carrier = {sword["piece"]: "hand_r"}                   # the bone of the segment each piece rides on
rigid = [{"vertices": p["vertices"].tolist(), "bone": carrier.get(p["piece"], "chest")} for p in pieces[1:]]
plan = {
    "mesh": rest["path"], "axes": "OBJ as ZBrush writes it: Y up, +Z toward the front view",
    "joints": joints,
    "rotations": [{"joint": ["pelvis", "thigh_l"], "axis": [1, 0, 0], "deg": -35},
                  {"joint": ["upperarm_r", "forearm_r"], "axis": [0, 0, 1], "deg": 70}],
    "rigid": rigid,                                    # weight 1.0 to that one bone: never skinned
    "seam_smooth": "Corrective Smooth on a vertex group of the joint bands only [added]",
    "return": "OBJ with the same vertex count and order, no triangulation or merge, armature "
              "applied, forward -Z, up Y, scale 1, one object",
}
# hand `plan` to scenario-blender-rigging (automatic weights, pose bones by angle, apply, export);
# it returns f"{JOB}/tpose_posed.obj"
posed = f"{JOB}/tpose_posed.obj"
assert zp.same_order(rest["path"], posed)["ok"]        # vertex order sacred (Pavlovich, Munoz Gomez)
d = zp.rigid_delta(rest["path"], posed, zp.group_vertices(grp["path"], "forearm_r", (ids, names)))
print(d["angle_deg"], d["pivot"])                      # within 2 degrees of the plan [added]
assert zp.rigid_pieces(rest["path"], posed)["ok"]      # every plate and the weapon moved as one body
palm = zp.group_vertices(grp["path"], "hand_r", (ids, names))
f = zp.follows(rest["path"], posed, rest["path"], posed, palm, sword["vertices"])
assert f["ok"], f["residual_mm"]                      # the sword is where the hand took it
hit = zp.piece_interference(posed)                    # plates into the body: Move Topological targets
print(hit["pairs"][:5])
imp = zb_pose.call("import_pose", posed)               # refuses another point count
back = zb_pose.call("tpose_to_subtools", tp["preflight"], rest["path"], timeout=300)   # order guard
assert imp["ok"] and back["ok"]
```

Why this route first: it is the only one where every angle is a number and every step is checked.
**Props and plates stay in the TPose mesh.** Munoz Gomez keeps them rigid inside it with Auto Groups
(one group per loose piece), masks each piece whole and poses the rest [00:15:37] [00:16:14]; the
agent's form is `loose_pieces` plus rigid weights to one bone, so the sword follows the whole chain
(shoulder, elbow, wrist) and the plates follow their segment (Plouffe groups all plates of a segment
with it [00:27:24]). Plouffe's rule forbids deforming primitives, not moving them rigidly
[00:33:23]. Pulling a carried prop out and turning it afterwards by one angle about one axis cannot
reproduce a raised, bent arm, and `interference == 0` still passes when the prop floats away from
the hand; `follows` does not. Intersections between pieces after posing are Munoz Gomez's Move
Topological job [00:17:24] (the brush moves only the connected piece under it): in route A, nudge
that piece's transform in the plan and re-run; in ZBrush, a synthesized Move Topological stroke from
the piece's projected center (P6) [verify], or a human. What stays manual: the pose idea itself
(line of action, weight) and the cleanup of P6. Status: not yet run in ZBrush. Tests: the import
guard and `same_order` are offline-tested; the round trip is `live_p01` plus a Blender-side run
[verify].

## P4. Route B: ZSphere rig built by code

**B1, Transpose Master with ZSphere Rig on** (doc: pose the combined mesh with a ZSphere rig).

```python
# joints from the body SubTool at level 1, exported with polygroups (active SubTool)
zl.run("zb_ops.set_checked('sdiv', 1, 0.5); result = zbc.get_active_tool_path()", ("zb_ops",))
body = zb_pose.call("export_tpose", f"{JOB}/body_l1_groups.obj", True)
J = {tuple(j["names"]): j["center"] for j in zp.joint_centres(body["path"])}
tp = zb_pose.call("tpose_mesh", True, True, True, timeout=300)            # ZSphere Rig on
k = 1.0                                                                    # export scale of that OBJ
to = lambda p: zb_pose.obj_to_internal(p, k)                               # signs [verify live_p03]
nodes = [{"pos": to(J[("chest", "pelvis")]), "radius": 0.05, "parent": -1},   # root at the hips
         {"pos": to(J[("pelvis", "thigh_l")]), "radius": 0.03, "parent": 0},
         {"pos": to(J[("shin_l", "thigh_l")]), "radius": 0.03, "parent": 1},
         {"pos": to(J[("foot_l", "shin_l")]), "radius": 0.03, "parent": 2}]   # ... every chain
zb_pose.call("zs_build", nodes)
zl.run("p = zb_ops.resolve(['Tool:Rigging:Bind Mesh'])\n"
       "if zbc.get(p) < 0.5:\n    zbc.press(p)\nresult = zbc.get(p)", ("zb_ops",))
zb_pose.call("zs_pose", [{"joint": 1, "axis": [1, 0, 0], "angle": -30},     # parents first
                         {"joint": 2, "axis": [1, 0, 0], "angle": 45}])
back = zb_pose.call("tpose_to_subtools", tp["preflight"], timeout=300)
```

Pavlovich's rig rules: root at the hips, a very small draw size while placing (API placement makes
this moot), a wrist ZSphere or the hand cannot bend, helper ZSpheres off the spine to hold the lats,
a tail chain, test every chain before posing, rotations only. Unknown until live_p02: whether the
bound mesh follows `set_zsphere` edits, and whether the rig tool shares the mesh's internal space.

**B2, Proxy Pose for a DynaMesh without levels** (Pavlovich):

```python
zb_pose.call("proxy_pose")                                   # Tool > Geometry > Proxy Pose, defaults
zl.run("zb_ops.press('make_polymesh'); result = zbc.get_active_tool_path()", ("zb_ops",))
# the Make PolyMesh3D copy has the proxy's vertex order: note its tool name, e.g. PM3D_Hero
# a ZSphere tool: zb_pose.zs_build(nodes) as in B1, then
zb_pose.call("rig_bind", "PM3D_Hero")                        # Select Mesh + PopUp:<name> + Bind Mesh [verify]
zb_pose.call("zs_pose", plan)
zb_pose.call("adaptive_skin", 1, 0, True)                    # Density 1, DynaMesh 0: same vertex order
# select the Proxy Pose SubTool again, then:
zb_pose.call("proxy_overwrite")                              # picks the only mesh with that order, exits
```

Gate for both: export the posed SubTool, `rigid_delta` per segment against the plan, `rigid_pieces`
(a ZSphere rig skins every piece it binds, so a plate across a joint can bend: then route A with
rigid weights, or keep that plate its own SubTool and carry it with P5), review sheet. Status: not
yet run in ZBrush. Test: `live_p02_zsphere_rig.py` (B1); B2 [verify], no test yet.

## P5. Route C: rigid moves of whole SubTools

For what nothing carries (a base, a display stand, a prop added after posing, a kit part posed on
its own). A carried prop or plate belongs in the TPose mesh (P3). When a separate SubTool must
follow a posed carrier, it gets the carrier's WHOLE transform, rotation plus translation, measured,
never one angle about one axis (Z5 grade error).

```python
# the carrier's transform: the palm group of the body at level 1, before and after the pose
palm = zp.group_vertices(f"{JOB}/body_l1_groups.obj", "hand_r")
R, t, rms = zp.rigid_fit(zp.load(f"{JOB}/body_l1_rest.obj").verts[palm],
                         zp.load(f"{JOB}/body_l1_posed.obj").verts[palm])   # OBJ mm; rms: how rigid the palm was
R, t = R.tolist(), t.tolist()
w = 2                                                         # the weapon SubTool, still at rest
zl.run(f"zbc.select_subtool({w}); result = 1")
a = zl.call("zb_ops", "export_obj", f"{JOB}/sword_rest.obj", overwrite=True)
zb_pose.call("rotate_subtool_matrix", R)                     # X, then Y, then Z Deformation Rotate
b = zl.call("zb_ops", "export_obj", f"{JOB}/sword_rot.obj", overwrite=True)
corr = zp.placement_correction(a["path"], b["path"], R, t)   # measured: the rotation center is [verify]
assert corr["rotation_error_deg"] < 0.5, corr               # signs and ROTATE_SIGN (live_p03, live_p08)
zb_pose.call("translate_subtool", corr["translate_mm"], sc["export_scale"])
c = zl.call("zb_ops", "export_obj", f"{JOB}/sword_placed.obj", overwrite=True)
f = zp.follows(f"{JOB}/body_l1_rest.obj", f"{JOB}/body_l1_posed.obj", a["path"], c["path"], palm)
assert f["ok"], f["residual_mm"]                             # where the hand took it, within 0.5 mm [added]
assert zp.interference(c["path"], f"{JOB}/body_l1_posed.obj")["ok"]   # and not through the hand
```

Grip gate (Hasbro [00:19:34]): the fingers close around the handle with no pass-through, checked on
a close-up tile; if the kit will be molded, fingers must not touch each other or the thumb in a
closed loop. `rotate_subtool(axis, deg, pivot)` stays for one-axis turns about a known pivot (a
base, a hinge). Tool > Contact (C1 to C3, 2023.2) can snap a prop to a surface [verify]. Status: not
yet run in ZBrush. Tests: `live_p03_rigid_moves.py` (signs, rotation center, pivot, Offset units),
`live_p08` (full placement); offline: Euler order, signs, correction.

## P6. Fix deformation after posing

Measure first, then fix where the numbers point (Munoz Gomez: bent limbs bulge, stretched ones
flatten; accept breakage while posing, then re-volume). Order of the fixes:

1. **The seam, while the rest is still protected.** Munoz Gomez smooths and moves the transition
   BEFORE clearing the mask, then flips the mask and does the other side [00:07:44] [00:08:16]: the
   rest of the limb is protected while the joint evens out. Agent forms: route A, a Corrective
   Smooth limited to a vertex group of the joint bands before export (vertex order kept) [added]; in
   ZBrush with a mask still on (a human's Gizmo pose, or `intersection_mask`), Deformation Smooth or
   Polish respect the mask, so press them before `mask("clear")`. Gate: `stretch_report` share back
   near the rest pose at that joint.
2. **Volumes and folds.** Bulge the compressed side, flatten the stretched one; re-sculpt cloth
   folds for the new pose (digest P3 step 2): tension lines from the stretched joint, compression
   folds on the inner bend [added]. Strokes aimed at measured spots, below, for small fixes; big
   fold redesign goes to a human or scenario-zbrush-character-creature with the spot list.
3. **Pieces.** Re-place bolts and discs on bent armor instead of bending them (Plouffe); push
   intersecting pieces apart (Move Topological, below).
4. **Detail on the pose.** 3D layers blend linearly from neutral to posed, so detail sculpted in the
   neutral pose can look soft or stretched on the bend: refine it on an extra pose-only layer,
   symmetry off (Munoz Gomez [00:49:48] [00:50:20]). Every layer is created at the top level (a
   layer only records there, [00:45:23]).

```python
# level 1 of the same SubTool before TPoseMesh (rest) and after the transfer (posed)
st = zp.stretch_report(f"{JOB}/body_l1_rest.obj", f"{JOB}/body_l1_posed.obj")
print(st["stretched_share"], st["stretched_spots"][:5], st["compressed_spots"][:5])
# fixes go on a new layer made at the top level (a layer only records there)
zl.run("p = zb_ops.resolve('sdiv')\nzb_ops.set_checked('sdiv', zbc.get_max(p), 0.5)\n"
       "zbc.press('Tool:Layers:New')\nresult = zbc.get(p)", ("zb_ops",))
# a stroke aimed at a measured spot: the lead's camera maps OBJ points (export scale 1:
# divide mm by sc["export_scale"]) to canvas pixels; set a fixed view first (zb_review views)
code = """
cam = zb_stroke.Camera.from_zbrush(zbc)
x, y, depth = cam.project(__P__)
result = zb_ops.sculpt_stroke(zb_stroke.line((x - 20, y), (x + 20, y)), brush="Inflat", size=30,
                              z_intensity=8)
"""
spot = [c / sc["export_scale"] for c in st["compressed_spots"][0]["center"]]
zl.run(code.replace("__P__", repr(spot)), ("zb_ops", "zb_stroke"))
# cloth through the body, deterministic mask [verify]:
zb_pose.call("intersection_mask")
zl.call("zb_ops", "mask", "invert")                           # which side ends masked: [verify]
zl.call("zb_ops", "deform", "Inflate", 2)
zl.call("zb_ops", "deform", "Polish", 5)                      # even the seam while still masked
zl.call("zb_ops", "mask", "clear")
# Move Topological on one piece: only the connected piece under the brush moves [verify]
posed_obj = f"{JOB}/tpose_posed.obj"
pcs = {p["piece"]: p for p in zp.loose_pieces(posed_obj)}
hit = zp.piece_interference(posed_obj, list(pcs.values()))["pairs"][0]
into = pcs[hit["into"]]["bbox"]
k = sc["export_scale"]
a_pt = [c / k for c in hit["center"]]                        # where the piece went in
b_pt = [(lo + hi) / 2 / k for lo, hi in zip(*into)]           # center of what it went into
mt = '''
cam = zb_stroke.Camera.from_zbrush(zbc)
x0, y0, _ = cam.project(__A__)
x1, y1, _ = cam.project(__B__)
dx, dy = x0 - x1, y0 - y1
n = max((dx * dx + dy * dy) ** 0.5, 1e-6)
result = zb_ops.sculpt_stroke(zb_stroke.line((x0, y0), (x0 + 15 * dx / n, y0 + 15 * dy / n)),
                              brush="Move Topological", size=20, z_intensity=40)   # values [added]
'''
zl.run(mt.replace("__A__", repr(a_pt)).replace("__B__", repr(b_pt)), ("zb_ops", "zb_stroke"))
```

The stroke starts on the piece that went in and pulls it away from the one it entered, in screen
space of a fixed view; re-export and re-run `piece_interference` after each nudge. A screen drag
moves the piece in the view plane only: pick the view that shows the overlap edge-on. The camera
projection uses the lead's `zb_stroke.Camera` (front view measured; other views via
`fit_convention`). Re-place bolts and discs on bent armor with `append_primitive` and `geometry_set`
instead of bending them (Plouffe). Gate: `stretch_report` share near the rest pose,
`piece_interference` ok on the TPose export, `rigid_pieces` ok, `interference` 0 for separately
printed parts, review sheet with Polyframe on (`Transform:PolyF` [verify]). Status: not yet run in
ZBrush. Test: the stroke half is proven by the lead (v02); the layer, Intersection Masker and Move
Topological presses are [verify], no test yet.

## P7. Print breakdown and merge

```python
# light copies first (Hasbro decimates right after the design sculpt, then engineers)
zl.call("zb_ops", "save_ztl", f"{JOB}/hero_print.ztl")
# union of the SubTools that print as one part, non-destructive: Live Boolean
for i in torso_group:                                         # e.g. body, belt, vest
    zb_pose.call("set_boolean_mode", i, "add", start=(i == torso_group[0]))
res = zb_pose.call("make_boolean_mesh", timeout=600)          # new tool, sources stay [verify]
# alternative that welds inserted parts into one watertight mesh (Gaboury): DynaMesh a merged copy
# zl.call("zb_ops", "dynamesh", 512)   # resolution relative to the bbox: detail loss, check deviation
```

Gate per part: `is_polymesh3d_solid` in `inventory()`, then the OBJ audit (`zp.print_report`
watertight gate), `fits_volume` against the printer. Status: not yet run in ZBrush. Test: `live_p06`
covers Make Boolean Mesh.

## P8. Hollow and walls

Gaboury's whole chain [00:57:33] to [01:15:30]: the heavy sculpt is never shelled; a light DynaMesh
copy is, its inner wall becomes the cutter, and the detailed part is hollowed by a Live Boolean
subtract, so its outside does not move. Drains and vents are cutters too. Hollow only when asked or
when the part is big enough to cost resin (doc: hollowing and cutting make a bigger print for the
same price); otherwise print solid or hollow in the slicer (Gaboury concedes Cura works [01:19:03]).

```python
part = 0                                                              # the detailed part, untouched
solid = zl.call("zb_ops", "export_obj", f"{JOB}/torso_solid.obj", overwrite=True)
k = sc["export_scale"]
# 1-3. copy, insert INSIDE (no hole, so two walls), DynaMesh about 128, Create Shell (Thickness is not mm)
hc = zb_pose.call("hollow_copy", part, [0.0, 150.0, 0.0], 60.0, k, 128, 4, timeout=900)
shell = zl.call("zb_ops", "export_obj", f"{JOB}/torso_shell.obj", overwrite=True)
th = zp.thickness(shell["path"], min_wall_mm=2.0, samples=4000)      # too thin: Thickness 6 (Gaboury), again
# 4-5. keep the inner wall: Auto Groups, Groups Split, the smaller piece, Polish off the DynaMesh steps
ks = zb_pose.call("keep_inner_shell", 10)
# 6. thin ends stay solid (Gaboury [01:15:30]): trim the inner shell where the part is thin, e.g. a QCube
#    set to subtract under the inner shell and baked first, or a human's isolate + Delete Hidden
# 7. the stack: detailed part = start, inner shell = subtract, drain and vents = subtract
zb_pose.call("set_boolean_mode", part, "add", start=True)
zb_pose.call("set_boolean_mode", ks["inner"], "sub")
drain = zb_pose.call("append_primitive", "qcyl_y", [24, 4, 24])
zb_pose.call("geometry_set", zb_pose.obj_to_internal([0.0, 20.0, 0.0], k), [6.0 / k, 40.0 / k, 6.0 / k])
zb_pose.call("set_boolean_mode", drain["index"], "sub")           # from under the base into the cavity
res = zb_pose.call("make_boolean_mesh", timeout=900)              # a new tool; sources stay (Gaboury)
out = zl.call("zb_ops", "export_obj", f"{JOB}/torso_hollow.obj", overwrite=True)
s = zp.shells(out["path"])
assert s["sealed_cavities"] == 0, s                                  # the drain opened the cavity
w = zp.thickness(out["path"], min_wall_mm=2.0, samples=4000)
dr = zp.outer_drift(solid["path"], out["path"])                     # the sculpted outside did not move
zb_pose.call("from_thickness", 2.0, 10.0)                            # the visual, on a copy
zl.call("zb_ops", "export_canvas", f"{JOB}/torso_thickness.png", overwrite=True)
```

**Thicken from the inside** (Hasbro: "Fix it, but don't change it from the outside... inflate it
inward" [00:16:46]): a wall under the target is fixed on the cutter, never on the sculpt. Move the
inner wall inward: shell the copy again with a higher Thickness (Gaboury went from 4 to 6
[01:10:32]), or shrink the cutter with a negative Deformation Inflate [verify sign], and re-make the
boolean; gate `outer_drift` p99 within 0.02 mm [added] and `thickness` p01 at the target. On a solid
part with a thin feature (a cape edge, a blade), take the material from where it does not show, the
back or the underside (Hasbro takes it from the hidden shoulder ball), and check the front with
`outer_drift` on that region.

The shortcut Gaboury also shows, an insert touching the surface so Create Shell opens a hole
[01:05:29], applies when the shell copy itself is printed (a smooth part, no detail to keep); it
joins the two walls into one piece, so `keep_inner_shell` refuses it. Live Boolean drops UVs,
textures, creases, 3D layers and masks on the result (version deltas, Live Boolean doc): hollow the
print copy, never the posed master. Gate: `th["walls"]["p01"]` and `w["walls"]["p01"]` at or above
the wall target, `s["sealed_cavities"] == 0` for resin, `dr["ok"]`, vents at every cup that faces
the build plate (Gaboury slides a cutter through the Live Boolean like the slicer's layer slider
[01:34:49]; the slicer's layer preview is the check). Status: not yet run in ZBrush. Test:
`live_p05_shell_thickness.py` (copy, shell, inner shell, subtract, drift); offline: the order of the
presses, the split, `outer_drift`.

## P9. Cut and keys

```python
low, up = f"{JOB}/torso_low.obj", f"{JOB}/torso_up.obj"            # the two halves, mm
plan = zp.plan_keys(low, (0, 150.0, 0), (0, 1, 0), clearance_mm=0.12, min_wall_mm=1.0, part_b=up)
assert all(key["ok"] for key in plan["keys"]), plan["warnings"]
k = sc["export_scale"]
for key in plan["keys"]:
    peg = zb_pose.call("append_primitive", "qcyl_y", [32, 4, 32])    # smooth enough to fit
    c = list(key["center"])
    c[1] += key["peg_length_mm"] / 2                                  # half above the cut plane
    r, L = key["peg_radius_mm"] / k, key["peg_length_mm"] / k
    zb_pose.call("geometry_set", zb_pose.obj_to_internal(c, k), [2 * r, L, 2 * r])
    pe = zl.call("zb_ops", "export_obj", f"{JOB}/peg_{peg['index']}.obj", overwrite=True)
    zl.run("zb_ops.press('duplicate'); result = zbc.get_active_subtool_index()", ("zb_ops",))
    g = 0.12 / k                                                     # clearance, internal units
    zb_pose.call("geometry_set", None, [2 * r + 2 * g, L + 2 * g, 2 * r + 2 * g])
    so = zl.call("zb_ops", "export_obj", f"{JOB}/socket_{peg['index']}.obj", overwrite=True)
    cl = zp.clearance(pe["path"], so["path"], target_mm=0.12)
    assert cl["ok"], cl["gap"]
# Live Boolean: [lower half (start), peg (add)] and [upper half (start), socket (sub)], then
# make_boolean_mesh(); one or two operations per hierarchy (Hasbro)
```

Cutting: a QCube cutter larger than the model (Gaboury: PolyCube, clearance on every side) in Live
Boolean, subtract for one half and intersect for the other; or, when the cut follows a polygroup
border, `Groups Split` then `close_holes()` on each part [added]. Retention: Hasbro gives pegs a
mushroom head so they cannot pull out; Gaboury slots a snap-joint peg for flex; for glued statues
two keys stop a round peg from spinning [added]. Sculpted cutters (a disc carrying projected cloth
detail) cannot be sized with sliders: calibrate Inflate per ZTool,
`zp.inflate_calibration([(1, gap1), (2, gap2)])`, `zp.inflate_for(0.12, cal)`, where each gap is
`zp.clearance(original, inflated)["gap"]["p50"]` (Hasbro measured 0.12 mm at Inflate 2 in his
ZTool). Status: not yet run in ZBrush. Test: `live_p06_keys_boolean.py`.

**If the parts will be molded** (a cast resin kit, a production toy), Hasbro's rules apply on top
[00:19:34] [01:24:32]: fingers touching each other or the thumb make a closed loop the mold cannot
release; `Tool:Polygroups:Group Front` from the view that faces one mold half shows the parting line
(one clean line wanted); `Transform:Draw Draft Analysis` with the camera along the pull shows draft
(doc: green and yellow good, red bad; `MaskByDraft` masks the bad faces). Both are presses plus a
canvas render (`PATHS["group_front"]`, `PATHS["draft_analysis"]`, [verify]); a direct print needs
none of it.

## P10. Decimate per part

```python
budget = {0: 400_000, 1: 150_000, 2: 60_000}                  # per SubTool: faces and hands get more
masks = {0: "cavity"}                                         # a head SubTool: keep density in its detail
for i, target in budget.items():
    zl.run(f"zbc.select_subtool({i}); result = 1")
    a = zl.call("zb_ops", "export_obj", f"{JOB}/dec/{i}_before.obj", overwrite=True)
    r = zb_pose.call("decimate_to_faces", target, True, masks.get(i), timeout=900)  # mask, Pre-process, Decimate
    assert zl.ping()["ok"]                                      # the plugin handed control back
    b = zl.call("zb_ops", "export_obj", f"{JOB}/dec/{i}_after.obj", overwrite=True)
    dv = zp.deviation(a["path"], b["path"], tol_mm=0.05)        # tol: printer XY resolution [added]
    print(i, r["faces_after"], dv["deviation"]["p99"], dv["ok"])
```

**Masks steer Decimation Master** (Gaboury masks the regions whose detail matters, face and hands,
before decimating [01:30:30]; doc: masked areas keep density, the final count is the same, a partial
mask protects partly). The agent cannot paint that mask, so in order of preference: (1) face and
hands as their own SubTools with their own budget (doc: decimate SubTools one by one when detail
differs); (2) a mask made without strokes before Pre-process, `mask="cavity"` (Mask By Cavity) or
`"peaks"` (Mask PeaksAndValleys) [added] [verify that it lands on the detail]; (3) a mask a human or
`intersection_mask` left on, `mask="keep"`; (4) a human mask. **Pre-process again after ANY edit**,
a mask, a level change, a rename included: Decimation Master ignores what changed after Pre-process
and can reuse a stale cache for a same-named tool (doc Troubleshooting), so `decimate_to_faces`
always pre-processes and refuses a mask without it. Polygroups are lost after decimation (doc), so
group before. Gate: faces within the slicer's budget, `deviation` p99 within tolerance, close-up
render against the original (Gaboury: stop one step before faceting; FDM hides more than resin).
Status: not yet run in ZBrush. Test: `live_p07_decimate_printhub.py`.

## P11. Export, package and report

```python
sc = zb_pose.call("set_export_scale", 300.0)
parts = zb_pose.call("export_parts", f"{JOB}/print/obj")
paths = {p["name"]: p["path"] for p in parts["parts"]}
rep = zp.print_report(paths, 300.0, min_wall_mm=1.0, build_volume_mm=(218, 123, 250),
                      keys=[(f"{JOB}/peg_3.obj", f"{JOB}/socket_4.obj", 0.12)],
                      envelope_mm=(220.0, 300.0, 160.0), out_json=f"{JOB}/print/report.json")
print(rep["ok"], rep["failed"], rep["to_look_at"])
for name, p in paths.items():
    zp.write_stl(p, f"{JOB}/print/stl/{name}.stl")             # binary, mm, Z up
zp.write_3mf(paths, f"{JOB}/print/hero_1-6.3mf")               # units declared: millimeter
sheet = zb_review.review(f"{JOB}/print/review")["sheet"]       # look at it before delivering
zl.call("zb_ops", "save_ztl", f"{JOB}/hero_print.ztl")
```

**Test print first** (Gaboury prints a joint in the target resin before the full job [01:53:10]):
send one key pair (peg and socket, or a cut-down coupon of the same section; digest P5 gate) and,
when the detail floor is in doubt, the most detailed part such as the head [added], before the kit;
adjust the clearance from the physical fit. The detail pass happens here too: a review tile rendered
at the figure's real size on screen, anything under the process floor (edges 0.5 mm, about 0.2 mm
floats away: Hasbro) backfilled, fused or left to paint (Hasbro [00:09:47]; Plouffe: the final
viewing distance decides the detail [00:18:51]; Carratala: over-sculpting for the scale is the usual
failure).

The delivery note states: units mm, scale and real height, process assumed, wall and clearance
targets, part list with keys, what was measured (`report.json`) and what was only looked at. The 3D
Print Hub buttons (`Export to STL`, `Export to 3MF`) are the human route; whether a preset file name
suppresses their dialog is live_p07. Status: not yet run in ZBrush. Test: `live_p04` (writers on
live exports), `live_p07` (Print Hub press).

## P12. When a human or a computer-use agent takes over

Gizmo drags with masks, Ctrl-drag topology masks, hand-painted gradient masks, Move Topological and
seam smoothing are canvas gestures (the SDK's `press_key` is marked "Does not work, hidden for now"
in the installed 2026 stub, and modifier presses with `canvas_click` are reported unreliable, Maxon
forum): hand them over with the pose plan, the stretch spots (`stretch_report`) and the review
sheet, then re-run the gates of P3 or P6 on the result. Menu paths and hotkeys: `gui-paths.md`.
