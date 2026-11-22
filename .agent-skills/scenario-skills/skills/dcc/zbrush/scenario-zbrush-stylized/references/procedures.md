# scenario-zbrush-stylized procedures (bridge code)

Every procedure runs on the agent side (system python3 with numpy and PIL) and reaches ZBrush
through the proven bridge: `zb_stylized.call(func, ...)` for this module's ZBrush-side functions,
`zb_launch.call(module, func, ...)` for the scenario-zbrush-expert toolkit. Coordinates are
OBJ-export space (+Y up, +Z toward the front camera, measured on the v03 sphere). The SDK curve API
takes tool space; `curve_convention.json` (written by live_01) holds the mapping.

**Status of everything below: not yet run in ZBrush.** The pure functions (proportions, head taper,
silhouettes, curves, planning, reports, toy numbers, DynaMesh factor, the call builder) pass
offline: `python3 tests/code/zbrush-stylized/run_offline.py` (43 tests, 2026-09-24 after the round 1
refactor, results in `offline_results.json`). The ZBrush-side functions pass against a fake
`zbrush.commands` only; the live tests that will prove them are named per procedure. Only one agent
drives ZBrush at a time.

```python
# common prelude for every procedure (agent side)
import sys
sys.path.insert(0, "<project>/skills/scenario-zbrush-stylized/scripts")
sys.path.insert(0, "<project>/skills/scenario-zbrush-expert/scripts")
sys.path.insert(0, "<project>/skills/scenario-zbrush-sculpting/scripts")    # zb_sculpt: remesh, looks
import zb_stylized as zs, zb_launch as zl, zb_review, zb_audit, zb_stroke, zb_sculpt
zl.start()                                    # ZBrush with the bridge (scenario-zbrush-expert)
```

## P0. Measure the curve convention once (live_01)

Why: Maxon's lightning example says the tube shows only after a curve is moved "a tiny bit", and
curve points live in tool space. Until live_01 has run, `lay_strands` uses the hypothesis
`axes [1, 1, 1]`, `apply "nudge"`, `batch True`.

```bash
tests/code/zbrush-stylized/run_live.sh live_01_curves # writes scripts/curve_convention.json
```

It records: which curve and ClayPolish paths exist (`probe_paths`), whether query bboxes equal OBJ
bboxes, whether `curves_to_ui` alone builds geometry, which apply (nudge, tap,
`create_mesh_from_curves`) and which axis signs put the tube on the planned path, tube radius per
Draw Size pixel, which end Curve Modifiers > Size thickens, Brush Modifier 4, one apply for three
curves, and whether the insert masks the support mesh. Test:
`tests/code/zbrush-stylized/live_01_curves.py`.

## P1. Proportion sheet and landmark checks (Shane Olson, Anatomy For Sculptors)

Build the primitives with scenario-zbrush-sculpting; keep one SubTool per mass and write down which
index is which role (renaming needs a text prompt the API cannot fill).

```python
boxes = zs.call("subtool_boxes")                     # [{index, id, bbox, center, size}]
role = {"cranium": 0, "jaw": 1, "nose": 2, "brow": 3, "ear": 4, "eye": 5}
lm = zs.head_landmarks({r: boxes[i] for r, i in role.items()},
                       points={"hairline": (0, 0.62, 0.8),            # marker spheres or
                               "canthus_inner": (0.12, 0.08, 0.86),   # known primitive points
                               "canthus_outer": (0.34, 0.08, 0.70)})
rows = zs.head_checks(lm, targets={"nose_third": 1.45})              # the brief's big nose
print(zs.summarize(rows))            # fails, deliberate breaks vs baseline, unjudged rows
body = zs.body_checks({"hip": ..., "knee": ..., "ankle": ..., "fingertip": ...},
                      targets={"femur_tibia": 0.85})                  # longer shins, on purpose
print(zs.split_check("scarf band on the neck", neck_bottom_y, chin_y, scarf_mid_y))
```

Gate: `summarize()["ok"]` or every failure turned into a deliberate target with a reason.
Perspective off first: `zb_ops.resolve(zs.PATHS["persp"])` tries `Draw:Perspective` first, the
installed id (commands.xml has no `Transform:Persp`). Test: `live_03_strands_and_measure.py` part B
(boxes), offline `ProportionTest`.

**Head sides (Shane Olson t_gg7MIGSDM 02:00:26 to 02:00:59, 02:11:58).** Seen from the top, the side
of the head is not straight: clip the cranium sides so the head planes taper toward the face, then
pull the back out and keep each side an arc. Measure on a top render of the cranium alone:

```python
zl.run(f"zbc.select_subtool({role['cranium']}); zbc.set(zb_ops.resolve(['Transform:Solo']), 1); result = 1",
       modules=("zb_ops",))
top = zb_review.review("/abs/out/head_top", views=("top",))
zl.run("zbc.set(zb_ops.resolve(['Transform:Solo']), 0); result = 0", modules=("zb_ops",))
ht = zs.head_taper(top["views"][0]["path"], face=FACE_SIDE)   # "top" or "bottom" of the image
print(ht["taper"], ht["arc"], ht["flags"])
```

A plain sphere fails the taper (sides parallel); a hard clip passes the taper and fails the arc; the
goal passes both. Routes to the taper, all [verify]: Deformation Taper on the cranium SubTool
(`zl.call("zb_ops", "deform", "Taper", 30, 4)`, axis bit and sign measured by live_04), or a
two-point ClipCurve stroke across each side in the orthographic top view
(`zb_ops.select_brush("ClipCurve")`, then `zb_stroke.play` with the two canvas points), then a Move
or ClayBuildup pass (scenario-zbrush-sculpting) for the arc. `FACE_SIDE`: which image side the face
is on in the top view, recorded by live_04 (zb_stroke's top view convention is [verify live_04 of
scenario-zbrush-expert]). Thresholds (taper 0.95, sag 0.01 of depth) are [added]: calibrate on
reference heads.

**Eyes.** Eyeball spheres first, lids that wrap them, each eye turned a few degrees outward:
scenario-zbrush-sculpting P17 (Henning, Costa). Then Shane's canthus rule (`canthus_recess` from the
top) and a three-quarter perspective look for the sockets (P9).

## P2. Silhouette and shape-language gates (Rakan Khamash, Cedric Seaut, Guillaume Tiberghien)

```python
rv = zb_review.review("/abs/out/stage3")              # front, right, back, 3/4, top; MatCap Gray
front, right = rv["views"][0]["path"], rv["views"][1]["path"]
for png in (front, right, rv["views"][3]["path"]):
    sl = zs.shape_language(png, ignore_bottom_frac=0.05, keep_samples=True)   # bust cut ignored
    print(sl["flags"], sl["straight_fraction"], sl["parallel_pairs"], sl["noise_per_1000px"])
    zs.annotate_shape(png, sl, png.replace(".png", "_shape.png"))             # look at it
print(zs.band_breaks(front)["breaks"])                 # 50/50 flagged
print(zs.squint(front, "/abs/out/stage3/squint")["sheet"])                    # look at it
print(zs.lineup(["/abs/a_front.png", "/abs/b_front.png", "/abs/c_front.png"], ["A", "B", "C"]))
print(zs.value_check(front, focus_box=[430, 180, 700, 420]))   # after polypaint: face box
metal = zb_review.review("/abs/out/stage3_metal", matcap="MatCap Metal01")   # dips (Plouffe)
```

Gate (defaults [added], calibrate on references): no flags, straight fraction at most 0.25, no
parallel pairs, noise at most 4 per 1000 px, no main break in 0.45 to 0.55, lineup IoU under 0.85,
and the agent's own look at the sheet, the annotated contour and the squint. Test: `live_03` part D;
offline `SilhouetteTest`.

## P3. Scalp shell and chunk plan (Pablo Munoz Gomez, Dan Eder)

```python
sh = zs.call("scalp_shell", 0, 0.01, 1.0, 8, 128)     # source, gap_frac, inflate step, iters, res
shell_idx = zl.run("result = zbc.get_active_subtool_index()")
obj = zl.call("zb_ops", "export_obj", "/abs/out/shell.obj", overwrite=True)["path"]
S = zs.Surface.from_obj(obj)
import numpy as np
lo, hi = np.asarray(S.bbox[0]), np.asarray(S.bbox[1]); c, half = (lo + hi) / 2, (hi - lo) / 2
xp = c[0] + 0.3 * half[0]                              # part at 70/30 [added application]
part = [[xp, c[1] + .95 * half[1], c[2] + .45 * half[2]], [xp, hi[1], c[2]],
        [xp, c[1] + .95 * half[1], c[2] - .45 * half[2]]]
paths = []
for side, n in ((+1, 3), (-1, 5)):                     # short side, long side
    line = [[p[0] + side * .06 * half[0], p[1], p[2]] for p in part]
    roots = zs.roots_along(S, line, n)
    dirs = zs.directions_away(S, roots, part, bias=(0, -1, -0.3), bias_weight=0.25)
    plan = zs.plan_strands(S, roots, dirs, zs.vary(n, 1.1 * half[1], 0.3, seed=side + 5),
                           kinds=(["C", "S"] * n)[:n], amounts=zs.vary(n, .12, .4, seed=side),
                           sides=[side] * n, gravity=0.12)
    paths += [p["path"] for p in plan]
print(zs.strand_report(paths)["parallel_pairs"])       # must be empty
cap = zl.call("zb_review", "capture_views", "/abs/out/plan", ["front", "right", "top"],
              "MatCap Gray", "math", 0.75, None, "plan")
for shot in cap["views"]:
    px = zs.project_paths(paths, shot["transform_read"], zs._center(cap["bbox"]))
    zs.overlay_paths(shot["path"], px, shot["path"].replace(".png", "_plan.png"))  # look at it
```

The face side of a closed shell is cut with a Move stroke pushing the hairline back from the side
view (Pablo [00:10:15]) through `stroke_from_view` with `brush="Move"`. Gate: plan overlays read as
the hairstyle, the back is planned too, no parallel neighbors. Test: `live_02_sculpted_hair.py`.

## P4. Sculpted stylized hair (Pablo Munoz Gomez)

```python
lay = zs.call("lay_strands", paths, size=40, subtool=shell_idx, timeout=600)   # fat chunks
assert lay["created_geometry"], lay["events"]
zl.call("zb_ops", "dynamesh", 256, timeout=600)       # fuse (Pablo blocks at 440 on his head)
zl.call("zb_ops", "save_ztl", "/abs/out/hair_blockout.ztl")
M = zs.Surface.from_obj(zl.call("zb_ops", "export_obj", "/abs/out/blockout.obj", overwrite=True)["path"])
bb = zl.call("zb_ops", "stats", 3)["bbox"]
doc = zl.run("result = [zbc.get('Document:Width'), zbc.get('Document:Height')]")
for p in paths:                                        # one long stroke per clump, one angle
    on = [M.project(q)[0].tolist() for q in p]
    bv = zs.best_view(on, M, bb, doc)
    r = zs.call("stroke_from_view", bv["px"], bv["transform"], brush="ClayBuildup", size=30,
                z_intensity=40, sculptris=True)
    assert r["volume_after"] > r["volume_before"]     # evidence the stroke sculpted
for a, b in zip(paths, paths[1:]):                     # crevices last (Pablo [00:26:40])
    bv = zs.best_view(zs.crevice_path(a, b, M), M, bb, doc)
    zs.call("stroke_from_view", bv["px"], bv["transform"], brush="Dam_Standard", size=8,
            z_intensity=30, zsub=True)
zs.call("rebalance", 1500000, 440)                     # Pablo re-DynaMeshes at 2.4M to 2.6M
L = float(max(np.asarray(S.bbox[1]) - np.asarray(S.bbox[0])))
res = zs.dynamesh_resolution(L, finest_feature=0.01 * L)   # the picker, computed
fin = zs.call("finish_hair", res, 2, True,
              {"max": 25, "sharp": 0, "soft": 0, "rsharp": 5, "rsoft": 5}, timeout=900)
zb_review.review("/abs/out/hair_final")                # plus MatCap Metal01 and squint
```

Pablo's custom brushes (Surface Blocking, Standard Blocking, Standard Refiner) do not ship; his own
substitutes are ClayBuildup or ClayTubes, Standard with more intensity, and Dam_Standard [00:01:43].
Brush sizes and intensities above are starting values [added]; his frame readouts belong to his
brushes. Views other than front follow zb_stroke's camera convention [verify live_04 of
scenario-zbrush-expert]. Gate: the hair reads at a squint, crevices deep enough to read as strands,
calm areas remain, crisp stepped edges after ClayPolish, hairline attachment. Test:
`live_02_sculpted_hair.py`.

## P5. Strand hair (Dan Eder), for games and rigged hair

```python
H = zs.Surface.from_obj(zl.call("zb_ops", "export_obj", "/abs/out/head.obj", overwrite=True)["path"])
zl.run("zbc.press(zb_ops.resolve('duplicate')); result = zbc.get_active_subtool_index()",
       modules=("zb_ops",))                          # dummy SubTool (Pablo's hidden QCube idea)
for _ in range(10):                                   # shrink it inside the head
    zl.call("zb_ops", "deform", "Size", -50)          # Deformation Size semantics [verify]
dummy = zl.run("result = zbc.get_active_subtool_index()")
lo, hi = np.asarray(H.bbox[0]), np.asarray(H.bbox[1])
part_line = [[0.05, 0.98 * hi[1], 0.5 * hi[2]], [0.05, hi[1], 0.0], [0.05, 0.9 * hi[1], 0.6 * lo[2]]]
roots = zs.roots_along(H, part_line, 8)
depth = np.asarray([r[2] for r in roots])
lift = (0.015 + 0.02 * (depth - depth.min()) / np.ptp(depth)).tolist()   # front strands on top
plan = zs.plan_strands(H, roots, zs.directions_away(H, roots, part_line, (1, -1, 0), .3),
                       zs.vary(8, 1.0, .25, 2), kinds=["C", "S"] * 4, lift=lift)
paths = [plan[i]["path"] for i in sorted(range(8), key=lambda i: -roots[i][2])]  # front to back
zs.call("lay_strands", paths, size=10, sides=6, subtool=dummy, timeout=600)
zl.call("zb_ops", "polygroups", "auto")               # one group per strand (Dan)
rep = zs.strand_mesh_report(zl.call("zb_ops", "export_obj", "/abs/out/strands.obj",
                                    overwrite=True)["path"])
print(rep["strands"], rep["faces_per_strand"], rep["tris_equiv"])        # budget
zl.run("zbc.press(zb_ops.resolve('mirror_weld')); result = 1", modules=("zb_ops",))  # parted style
```

Rules: set Curve Step before the first strand (`curve_step=`), build front to back, never Smooth; to
change a strand, regenerate its path and re-lay it [added]. Taper: Curve Modifiers > Size
(`taper=True`); which end is thick is measured by live_01 (`thick_end`), and point order picks the
root. Dan mirrors with SubTool Master (keeps polygroups); Mirror And Weld is the scripted substitute
[verify it keeps groups]. Gate: strands equals the plan count, dummy at most one shell, faces per
strand within budget and no thin strands, no gaps or clipping under two MatCaps, parting clean from
the top. Test: `live_03_strands_and_measure.py` part A.

Braids (Dan [00:40:19]): crease loops on each plait (ZModeler: GUI only) or use polygroup borders,
Stroke > Curve Functions > Frame Mesh (`zs.PATHS["frame_mesh"]`), tube brush, one tap on a curve,
lower Brush > Depth Imbed. Not scripted here: every step is [verify].

## P6. Scarf tails and straps as curve ribbons (Pavlovich, Rakan)

```python
C = zs.Surface.from_obj(chest_obj)                    # the bust's chest and scarf export
root = zs.roots_along(C, [knot_point, knot_point], 1, lift=0.01)
tails = zs.plan_strands(C, root * 2, [(0.2, -1, 0.3), (-0.1, -1, 0.35)], [0.8, 0.55],
                        kinds=["S", "C"], amounts=[0.15, 0.1], lift=0.01, gravity=0.3)
print(zs.strand_report(tails)["parallel_pairs"])      # tails must not run parallel
zs.call("lay_strands", [t["path"] for t in tails], brush="CurveTube", size=40, sides=0)
```

Two tails of different length (0.8 and 0.55) keep the 70/30 idea [added application]. `sides=0` is
Curve Flat per Pavlovich (Brush Modifier 0); `sides=4` plus lower Z Intensity is the strap. Folds
come from pressure points, not noise (Rakan). Gate: each tail reads S or C in the front view
(`classify_polyline` on the projected pixels). Test: covered by live_01 (sides) and live_02 (tubes);
no dedicated live test yet.

## P7. Toy and collectible numbers (Paul Bennett, Alex Carratala)

```python
t = zs.toy_scale(1780, "6in")            # {'design_mm': 148.33, 'file_mm': 154.27, 'file_scale_pct': 104.0}
mmpu = zs.mm_per_unit(model_height_units=2.04, print_height_mm=t["file_mm"])
print(zs.feature_check({"flyaway strand": (0.012, "wall"), "scarf tail": (0.02, "wall"),
                        "trimmed hair edge": (0.007, "edge")}, mmpu))
```

Then hand to scenario-zbrush-pose-print: part plan (hair keyed to the head, joints as spheres and
discs where anatomy puts them, costume pulled over the joint), the scale factor and the file
percentage. Gate: every feature at or above 1 mm (walls) and 0.5 mm (trimmed edges), no closed
loops, nothing detailed below what the print size shows. Test: offline `ToyAndDynaMeshTest`.

## P8. DynaMesh resolution from the finest feature

```python
L = max(stats_bbox_size)                               # longest side of the SubTool
res = zs.dynamesh_resolution(L, finest_feature=crevice_width, edges_across=4)
print(zs.dynamesh_edge(L, res))                        # expected mean edge
```

The factor 1.083 comes from one measured sample (v03 sphere, 128); live_03 part C measures 256.
Pablo reads the picker and goes "a little bit higher" [00:33:52]. Test: offline
`test_dynamesh_factor_reproduces_the_fixture`, live `live_03` part C.

## P9. Planes kept through subdivision, and the perspective look (Guillaume Tiberghien, Shane Olson)

```python
zl.run(zb_sculpt.remesh_code(192, keep="groups"), modules=("zb_ops",))    # merge the parts (scenario-zbrush-sculpting P16)
# ... plane strokes (hPolish, TrimDynamic) and tucks on the DynaMesh ...
zl.call("zb_ops", "save_ztl", "/abs/out/planes.ztl")
zl.call("zb_ops", "zremesher", 5, timeout=900)                           # sculptable topology
cr = zs.call("crease_planes", max_angle=40, crease_lvl=2)                # groups by plane, Crease PG
zl.call("zb_ops", "divide", 2, timeout=900)                              # creases hold on 2 levels
metal = zb_review.review("/abs/out/planes_metal", views=("front", "threequarter"), matcap="MatCap Metal01")
look = zl.run(zb_sculpt.persp_snapshot_code("/abs/out/look_34.png", "threequarter"),
              modules=("zb_ops", "zb_stroke"))                           # perspective on, restored after
```

Guillaume builds each part from SubTools, DynaMeshes them together, ZRemeshes for a topology he can
sculpt on, and creases his edges "to make sure that when I'll subdivide those things will remain
straight" (UthCuDB1IEQ 00:46:42 to 00:47:50). Crease tags protect edges from smoothing when the mesh
is subdivided; CreaseLvl sets for how many levels they stay hard; Crease PG creases every polygroup
border (Geometry doc). So the order is: DynaMesh, planes, ZRemesher, creases, Divide. A DynaMesh or
ZRemesher after creasing rebuilds the topology, so crease again [added]. `max_angle` (Groups By
Normals MaxAngle) decides which plane changes become borders: Pavlovich's 90 behaves like Auto
Groups on a cylinder, about 48 splits caps from sides (5JM1fb7wnTM 00:02:30); pick it by looking at
the PolyFrame groups [added]. ZRemesher Keep Creases uses existing creases to guide the new topology
(ZRemesher doc) when a creased mesh is remeshed again. Work the divided stack by level
(scenario-zbrush-sculpting P15). `zb_sculpt` is the scenario-zbrush-sculpting module (imported in
the prelude); the look render is for appeal and eye sockets only, never measured. Test:
`live_04_head_planes.py` (parts B and C); offline `test_crease_planes_order_on_the_base_level`.

## Function map

| Need                             | Function                                                                                                                                                        | Side                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| boxes per SubTool                | `subtool_boxes()`                                                                                                                                               | ZBrush                       |
| proportions                      | `head_landmarks`, `head_checks`, `body_checks`, `summarize`, `split_check`                                                                                      | agent                        |
| silhouettes                      | `shape_language`, `annotate_shape`, `band_breaks`, `head_taper`, `lineup`, `squint`, `value_check`                                                              | agent                        |
| curves                           | `classify_polyline`, `strand_report`                                                                                                                            | agent                        |
| hair plan                        | `Surface`, `roots_along`, `directions_away`, `march_strand`, `bend_path`, `plan_strands`, `vary`, `crevice_path`, `best_view`, `project_paths`, `overlay_paths` | agent                        |
| strands in ZBrush                | `lay_strands`, `load_curve_convention`, `probe_paths`                                                                                                           | ZBrush                       |
| clump and crevice strokes        | `stroke_from_view`                                                                                                                                              | ZBrush                       |
| shell, finish, budget            | `scalp_shell`, `finish_hair`, `rebalance`                                                                                                                       | ZBrush                       |
| planes through subdivision       | `crease_planes`                                                                                                                                                 | ZBrush                       |
| perspective look, checked remesh | `zb_sculpt.persp_snapshot_code`, `zb_sculpt.remesh_code` (scenario-zbrush-sculpting)                                                                            | ZBrush code built agent side |
| strand meshes                    | `shells`, `strand_mesh_report`, `tube_radius_profile`                                                                                                           | agent                        |
| toys                             | `toy_scale`, `mm_per_unit`, `feature_check`, `HASBRO`                                                                                                           | agent                        |
