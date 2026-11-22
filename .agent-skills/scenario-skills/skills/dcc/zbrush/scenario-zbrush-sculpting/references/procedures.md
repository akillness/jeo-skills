# Bridge procedures for core-form sculpting

Every procedure below is agent-side Python that drives ZBrush 2026.2.1 through the
scenario-zbrush-expert bridge (`zb_launch`) and this skill's `scripts/zb_sculpt.py`. Status of all
of them: **not yet run in ZBrush**. The offline logic is tested
(`tests/code/zbrush-sculpting/test_zb_sculpt.py`, 45 tests, run 2026-09-24 after the round 1
refactor) and every live script, live_s08 included, runs end to end against an in-process fake
ZBrush (`dryrun_live.py`, catches Python errors only). The live test that will verify each procedure
is named under it; run them with `tests/code/zbrush-sculpting/run_live.sh` after the
scenario-zbrush-expert live suite (live_04 installs the camera convention the aimed strokes use).

## P0. Imports and session

```python
# not yet run in ZBrush
import sys
SK = "skills"
sys.path[:0] = [SK + "/scenario-zbrush-expert/scripts", SK + "/scenario-zbrush-sculpting/scripts"]
import zb_launch as zl, zb_review, zb_audit, zb_stroke
import zb_sculpt as zs

zl.start()                                   # lead toolkit: spawn ZBrush with the bridge
OUT = "/abs/out/head"                        # absolute paths only (relative ones land in the app)
```

All ZBrush-side work runs through `zl.run(code, modules=("zb_ops", "zb_stroke"))` or
`zl.call("zb_ops", ...)`; `zb_sculpt` itself never runs inside ZBrush.

## P1. Neutral state before scripted strokes

```python
# not yet run in ZBrush (paths reported by live_s01_calibrate)
state = zl.run("""
out = {"zoom": zbc.get_canvas_zoom(), "missing": []}
for cands, v in ((["Stroke:Stroke Jitter", "Stroke:Modifiers:Stroke Jitter"], 0),
                 (["Stroke:Brush Imperfection", "Stroke:Modifiers:Brush Imperfection"], 0),
                 (["Stroke:Mouse Avg", "Stroke:Modifiers:Mouse Avg"], 1),
                 (["Stroke:Lazy Mouse:LazyMouse", "Stroke:LazyMouse"], 0)):
    p = zb_ops.resolve(cands, required=False)       # installed ids first [xml]
    if p:
        zbc.set(p, v); out[p] = zbc.get(p)
    else:
        out["missing"].append(cands[0])
pp = zb_ops.resolve(%r, required=False)             # zs.PERSP_PATHS: Draw:Perspective first
if pp and zbc.get(pp) >= 0.5:
    zbc.set(pp, 0)
out["perspective"] = zbc.get(pp) if pp else "missing"
out["symmetry"] = zb_ops.set_symmetry(False)
result = out
""" % (zs.PERSP_PATHS,), modules=("zb_ops",))
assert abs(state["zoom"] - 1.0) < 1e-6, "Document zoom must be 1: Draw Size is in canvas pixels"
```

Why: Stroke Jitter and Brush Imperfection are global and follow every brush (Pavlovich AdkZe1yKFTU
00:09:52); LazyMouse at radius 1 swallows taps and the start of a stroke (AdkZe1yKFTU 00:03:31), and
a synthesized path is already smooth; perspective breaks the linear projection the plans use
[added]; Draw Size Dynamic mode must stay off (brushes doc). Perspective is `Draw:Perspective` in
the installed `ZData/ZLang/zcommands/commands.xml`; the toolkit's `PATHS["persp"]`
(`Transform:Persp`) does not exist, so this skill resolves `zs.PERSP_PATHS`. The Stroke ids without
the Modifiers level are the installed ones [xml]; exists() on each form is [verify live_s01].
`pass_code` sets brush, stroke type, alpha, Draw values, LazyMouse (off unless the spec says
`lazymouse=True`), perspective off, symmetry and the view for every pass anyway, and reports
anything it could not find in `missing`.

## P2. Calibrate intensity and brush size (once per session)

```python
# not yet run in ZBrush (live_s01_calibrate, --install writes scripts/sculpt_calibration.json)
cal = zs.run_calibration(OUT + "/cal", brush="ClayBuildup", zs=(2, 4, 6, 10, 20), draw_size=24,
                         install=True)
print(cal["radius_per_draw_size"])            # 1.0: Draw Size is the radius; 0.5: the diameter
m = zs.intensity_model("ClayBuildup")          # c in dV = c * Z * R^2 * 2L
z, passes = m.z_for_raise(0.01, m.radius(20, 250.0))   # Z for a 0.01-unit mean raise, R from Draw 20
```

It builds a fresh DynaMesh sphere (128), frames it front at 0.6, strokes one row per Z, exports an
OBJ after each stroke and measures the volume change and the footprint radius
(`zb_audit.displaced`). Until it has run, `intensity_model()` returns the prior fitted on the proven
v02 stroke (c = 0.00104 under the radius hypothesis). Also calibrate DamStandard (Zsub, volume must
fall) and read the Move gain from live_s01.

## P3. Base (S0): three strokeless starts

```python
# not yet run in ZBrush (live_s05_blockout, live_s02)
# a) head sketch on a sphere (Henning): PolyMesh3D sphere, DynaMesh 128 = about 43k points
zl.call("zb_ops", "new_sphere", 128)

# b) ZSphere armature (Pablo): proportion and silhouette only, then a light Adaptive Skin
neck, last = zs.chain((0, 0, 0), (0, 0.9, 0.1), 0.45, 0.35, 2)
head, _ = zs.chain((0, 0.9, 0.1), (0, 1.7, 0.15), 0.55, 0.7, 2, parent=last, first_index=len(neck))
print(zl.run(zs.zsphere_code(neck + head), modules=("zb_ops",)))
print(zl.run(zs.adaptive_skin_code(density=2, dynamesh_resolution=0), modules=("zb_ops",)))
zl.call("zb_ops", "ensure_edit")
zl.call("zb_ops", "dynamesh", 64)

# c) primitives as SubTools placed by number (Pablo's brush-free blockout)
zl.run(zs.append_primitive_code("Sphere3D", position=(0.0, -0.3, 0.9), size=0.5), modules=("zb_ops",))
```

Proportions (head heights, feature positions) come from the domain skill
(scenario-zbrush-character-creature, scenario-zbrush-stylized). The ZSphere tool's coordinate space,
the `PopUp:<name>` items after Append and the Position slider units are [verify live_s05]. GATE:
`zb_review.review(OUT + "/s0")` sheet shows the intended silhouette front and side; `zb_ops.stats()`
points in `zs.STAGES["S0"]["points"]`.

## P4. One aimed clay pass: plan, look, apply, check

```python
# not yet run in ZBrush (live_s02_aim_clay)
sc = zs.Scene.capture(OUT + "/s1", view="front", margin=0.7)   # OBJ, canvas PNG, transform
forms = [zs.Form("brow", [(-0.6, 0.28, 0.76), (0.0, 0.34, 0.94), (0.6, 0.28, 0.76)], width=0.18),
         zs.Form.blob("cheekbone", (0.45, -0.05, 0.86), 0.15, axis=(0.8, -0.3, 0)),
         zs.Form.blob("socket", (0.3, 0.12, 0.92), 0.11, sign=-1)]        # sign -1 = carve
specs = zs.clay_pass(sc, forms, stage="S1", ref_width=2.0)   # ref_width = head width, model units
print(zs.plan_summary(specs))
zs.preview_plan(sc, specs, OUT + "/s1/plan.png")             # LOOK at it before stroking
reports = zs.run_plan(specs, ppu=sc.ppu)                     # stops at the first flagged pass
for r in reports:
    print(r["label"], r["ok"], r["flags"])
```

What it does: snaps each form to the surface (nearest vertex), projects it through the view
(`zb_stroke.Camera`, vectorized), sizes the brush from the stage (S1 clay: 15 to 35 % of the head
width) kept within 0.5 to 1.0 of the form width, hatches across the center line (T1), clips every
stroke to the canvas model mask eroded by a quarter of the brush radius, splits build and carve into
separate passes, and with S1's symmetry on plans the +X half only. `pass_code` restores the planned
transform before stroking and records the volume after each stroke. Aim error budget: on the v03
fixture the front projection fits the canvas silhouette within about 1 px with pivot (0, 0, 0) and
misses by about 4 px with the post-stroke bbox center, so the pivot rule is still open (live_04)
[obj]; a few pixels are small against 20 to 100 px brushes. Flags to act on: strokes that changed
nothing (off the model, LazyMouse radius, Edit mode), wrong volume sign, view drift during the pass
(a stroke started off the model), pivot shift (re-capture the Scene), settings not found. Views
other than front need the live_04 convention.

## P5. Move then DynaMesh (T4)

```python
# not yet run in ZBrush (live_s03_move_crease, live_s01 for the Move gain)
sc = zs.Scene.capture(OUT + "/s1m", view="front", margin=0.7)
specs = zs.move_pass(sc, [((0.0, -0.6, 0.8), (0.0, -0.25, 0.0))], size_frac=0.35, symmetry=False)
rep = zs.run_plan(specs, ppu=sc.ppu)
cv0 = zb_audit.audit(sc.obj)["edge_len_cv"]
obj = zl.call("zb_ops", "export_obj", OUT + "/s1m/after.obj", overwrite=True)["path"]
if zs.remesh_due(zb_audit.audit(obj)["edge_len_cv"], cv0):
    r = zl.run(zs.remesh_code(128, keep="groups"), modules=("zb_ops",))   # P16
    assert r["ok"], r
```

The Move brush moves in the screen plane, so `move_pass` refuses a displacement that is not mostly
in the screen plane (choose a view that looks across it). Displacements longer than half the brush
are split into chained drags [added]. One Move set per pass, then re-capture the Scene (the bbox and
possibly the pivot move). Big moves only at the lowest level
(`stage_gate(..., big_move=True, sdiv=...)` fails otherwise).

## P6. Creases and fill between (T5, T6)

```python
# not yet run in ZBrush (live_s03_move_crease)
sc = zs.Scene.capture(OUT + "/s4", view="front", margin=0.7)
fold = zs.Form.crease("fold", [(0.1, 0.05, 0.99), (0.3, -0.15, 0.94), (0.45, -0.35, 0.82)], 0.05)
specs = zs.crease_pass(sc, [fold], symmetry=False)           # DamStandard, Dots, Focal -14, Zsub
reports = zs.run_plan(specs, ppu=sc.ppu)                      # expect the volume to fall
a = sc.form_to_canvas(zs.Form.crease("A", [(-0.35, -0.2, 0.9), (-0.05, -0.2, 0.97)], 0.03))["path"]
b = sc.form_to_canvas(zs.Form.crease("B", [(-0.35, -0.35, 0.86), (-0.05, -0.35, 0.93)], 0.03))["path"]
d = 0.12 * sc.ppu
fill = zs.pass_spec("fill", "ClayBuildup", zs.fill_between(a, b, d), zs.draw_size_for(d), 2,
                    focal=-56, symmetry=False, transform=sc.transform)
zs.run_plan([fill], ppu=sc.ppu)
```

Depth variation without pen pressure: three overlapping sub-strokes (full length, 0.6, 0.35) with a
lateral wobble up to 0.1 D [added]; live_s03 checks that the depth along the crease varies (cv above
0.1). If live_02 finds a pressure token, a pressure profile can replace the sub-strokes.

## P7. Intensity descent with zoom-in (T3)

```python
# not yet run in ZBrush (live_s07_ladder)
base = zs.Scene.capture(OUT + "/s2", view="front", margin=0.7)
cheek = zs.Form.blob("cheek", (0.45, -0.05, 0.86), 0.15, axis=(0.8, -0.3, 0))
for it in zs.descent(0.24 * base.ppu, z_ladder=zs.DESCENT_Z):       # Z 6, 3, 2, 1
    sc = zs.Scene.capture(OUT + f"/s2_{it['iteration']}", view="front",
                          ppu=base.ppu * it["zoom"], center=cheek.path[0])
    specs = zs.clay_pass(sc, [cheek], stage="S2", preset="clay_refine", z=it["z"],
                         size_frac=it["diam_px"] * it["zoom"] / sc.model_width_px())
    for s in specs:
        s["alpha"] = it["alpha"]                                     # Alpha Off for the last two
    zs.run_plan(specs, ppu=sc.ppu)
    sheet = zb_review.review(OUT + f"/r2_{it['iteration']}", views=("front", "threequarter"))
    # stop when the marks no longer fall (band_energy fine band, or the eye) or Z reached 1
```

Each iteration offsets its stations by half a station so strokes land between the previous ones
(Henning "fill in the gaps"); zoom and shrink numbers are [added]. Finish with one light smoothing
only where needed (P9).

## P8. Checkpoint a pass and dial it afterwards

```python
# not yet run in ZBrush (live_s04_checkpoints_masks)
cp = zl.run(zs.checkpoint_code("morph"), modules=("zb_ops",))    # DynaMesh stages: StoreMT
zs.run_plan(specs, ppu=sc.ppu)
sheet = zb_review.review(OUT + "/check")                      # too strong?
# dial BEFORE any re-DynaMesh, ZRemesher or Divide; the code refuses a lost target
zl.run(zs.dial_code("morph", 40, expect_points=cp["stats"]["points"]), modules=("zb_ops",))
# subdivision stages (levels exist, create at the top level): a Layer instead
zl.run(zs.checkpoint_code("layer"), modules=("zb_ops",))
zs.run_plan(specs, ppu=sc.ppu)
zl.run(zs.dial_code("layer", 0.6), modules=("zb_ops",))      # layer intensity 0.6 of the pass
```

Drust: partial Morph values soften a pass, negative values exaggerate it (B_wKwXwjcZs 00:05:20);
layer intensity 1 is as sculpted, above 1 exaggerates (Layers doc). This turns intensity into a
deterministic after-the-fact dial, the agent's answer to missing pen pressure [added].
`Tool:Morph Target:Morph` and `Tool:Layers:Intensity` are installed ids [xml]; their semantics are
[verify live_s04]. A Morph Target needs a static point count (Morph Targets doc; fundamentals digest
procedure I step 4): a re-DynaMesh (`remesh_due` inside the same pass), ZRemesher or Divide between
StoreMT and the dial destroys it, so dial first or keep the versioned ZTL as the checkpoint
(scenario-zbrush-expert). `expect_points` makes the dial fail loudly instead of acting on a lost
target (live_s08).

## P9. Deterministic substitutes for stroke work

```python
# not yet run in ZBrush (live_s04_checkpoints_masks)
# a) smoothing: Polish at a lower level, then back up (smoothing scale follows the level, docs)
zl.run("p = zb_ops.resolve('sdiv'); zbc.set(p, 1); result = zbc.get(p)", modules=("zb_ops",))
print(zl.call("zb_ops", "polish", 10))                        # volume before/after: drift gate
zl.run("p = zb_ops.resolve('sdiv'); zbc.set(p, zbc.get_max(p)); result = zbc.get(p)", modules=("zb_ops",))

# b) local inflate through the footprint of a stroke (mask from a stroke)
zs.run_plan([zs.pass_spec("footprint", "Standard", specs[0]["strokes"], 20, 5, symmetry=False,
                          transform=sc.transform)])
zl.run("""
zbc.press(zb_ops.resolve(["Tool:Masking:Mask Changed Points"]))
zb_ops.mask("invert")                 # the stroked area is now the unmasked one
r = zb_ops.deform("Inflate", 10)
zb_ops.mask("clear")
result = r
""", modules=("zb_ops",))

# c) symmetry repair when the wrong side is the reference (Pablo 9a9S1OcYHx4 00:09:35)
zl.run("""
l = zb_ops.resolve("lsym", required=False)
if l and zbc.get(l) >= 0.5:
    zbc.set(l, 0)                      # Local Symmetry must be off (gitoJ7B8FmY 00:10:22)
zbc.press(zb_ops.resolve(["Tool:Deformation:Mirror"]))
zbc.press(zb_ops.resolve("mirror_weld"))
result = zb_ops.stats()
""", modules=("zb_ops",))
```

Also deterministic: polygroup masks (`zb_ops.polygroups("auto")`, Groups By Normals), visibility
grow (`zb_ops.visibility("grow")`), whole-SubTool Inflate or Polish, Geometry position and size for
parts. Polish and Smooth cost volume: gate the drift with `stats()` (the digest starts at 2 %
[added]). `Mask Changed Points` and `Tool:Deformation:Mirror` are [verify live_s04].

## P10. Raise resolution by the square law

```python
# not yet run in ZBrush (live_s07_ladder)
st = zl.call("zb_ops", "stats")
res = zs.next_dynamesh_resolution(128, st["points"], 800e3)   # toward S2 on a head
print(res, zs.dynamesh_faces_estimate(res, st["area"], max(b - a for a, b in zip(st["bbox"][:3], st["bbox"][3:]))))
print(zl.run(zs.remesh_code(res, keep="groups"), modules=("zb_ops",), timeout=600))   # P16
```

Measure K on the agent's own mesh after a remesh (`dynamesh_k_from`) when estimates matter; one
sample on this install gave K = 1.063 (sqrt(area / faces) = K x longest / resolution).

## P11. Sketch to levels (when S3 needs subdivision levels)

```python
# not yet run in ZBrush (live_s07_ladder)
zl.call("zb_ops", "save_ztl", OUT + "/head.ztl")              # versioned, before anything destructive
src = zl.call("zb_ops", "stats")
zl.run("""
i0 = zbc.get_active_subtool_index()
zbc.press(zb_ops.resolve("duplicate"))
if zbc.get_active_subtool_index() == i0:
    zbc.select_subtool(i0 + 1)         # copy expected right below the original [verify]
result = zbc.get_active_subtool_index()
""", modules=("zb_ops",))
zr = zl.call("zb_ops", "zremesher", 5, timeout=900)           # never Divide the DynaMesh itself
zl.call("zb_ops", "divide", zs.divides_needed(zr["faces_after"], src["points"]), timeout=900)
assert zs.projection_ready(src["points"], zl.call("zb_ops", "stats")["points"])
pa = zl.call("zb_ops", "project_all", checkpoint=OUT + "/head.ztl", timeout=900)   # toolkit, safe
assert pa["gate"]["ok"], (pa["gate"], pa.get("repair"))     # else follow pa["repair"]
```

When (Pablo rArw79xEpvE 00:05:50, 00:09:44): ZRemesher once the form is settled, DynaMesh while it
is not; never Divide a DynaMesh (390k to 1.5M to 6M of triangles and star poles that smoothing
cannot remove). A DynaMesh-only route (Henning's bust at 128, 376, 648, TpS0QdlfHWU frames 00:14:16
to 00:21:27) is fine for a concept still with no later big changes: say which route and why.

Safe reprojection is the toolkit's job: `zb_ops.project_all` (scenario-zbrush-expert) refuses to run
without `checkpoint` (a versioned ZTL first: Project All can crash ZBrush and Python has no undo),
stores a Morph Target and a New Layer at the top level (FlippedNormals Zp07GW3rND0 00:02:13,
00:02:47), sets Dist, takes `pa_blur` (lower it for a clean source), returns to `level` for a staged
projection, and gates the result (points, spikes outside the visible bbox, volume);
`zb_ops.morph_repair(points)` paints a busted area back with the Morph brush instead of smoothing
(00:04:27, 00:06:36). This skill only adds the density rule before it (`projection_ready`: target
points at least the source's, Pablo VRisbJQAaZw 00:17:24); do not repeat the toolkit's checkpoints
here. Only source and target visible (`exclusive=True` refuses more). After projecting, work by
level (P15). Guides, target counts for animation, danger-zone repair (eyes, mouth, armpits, fingers,
crotch; eye-interior polygroup grown past the lid, Zp07GW3rND0 00:05:31, 00:07:10) and UVs belong to
scenario-zbrush-retopology-export.

## P12. Stage review and gate

```python
# not yet run in ZBrush (live_s02, live_s07)
views = ("front", "right", "threequarter", "top")
rev = zb_review.review(OUT + "/r_s1", views=views)            # open rev["sheet"] and judge it
cmp = zs.compare_reviews(OUT + "/r_s0", OUT + "/r_s1")         # IoU, shape IoU, asymmetry, bands
gate = zs.stage_gate("S1", kind="head", stats=zl.call("zb_ops", "stats"),
                     reports=reports, review_cmp=cmp)
print(gate)                                                    # then critique.md for the visual part
zl.call("zb_ops", "save_ztl", OUT + "/head.ztl")
```

Keep the view scale fixed between stages when comparing raw IoU; `shape_iou` compares silhouettes
normalized to their bounding boxes and is the stable-design metric.

## P13. Experimental: creases from model-space curves

```python
# not yet run in ZBrush (live_s06_curves): does a curve brush sculpt along an SDK curve?
path = [(-0.5, 0.0, 0.87), (0.0, 0.1, 0.99), (0.5, 0.0, 0.87)]
zl.run(f"""
zb_ops.select_brush("CurveStandard")
zbc.new_curves()
c = zbc.add_new_curve()
for p in {path!r}:
    zbc.add_curve_point(c, *p)         # tool coordinates, not canvas pixels (SDK example)
result = zbc.curves_to_ui()
""", modules=("zb_ops",))
```

If it works, creases need no camera mapping; live_s06 also tries a click on the projected curve to
apply the brush.

## P14. Handoff package

```python
# not yet run in ZBrush
import json
pkg = {"ztl": zl.call("zb_ops", "save_ztl", OUT + "/head.ztl")["path"],
       "stats": zl.call("zb_ops", "stats"), "sheet": rev["sheet"], "stage": "S3",
       "forms": [f.to_dict() for f in forms], "calibration": zs.current_calibration(),
       "gate": gate}
json.dump(pkg, open(OUT + "/handoff.json", "w"), indent=1, default=repr)
```

The receiving skill gets the file, the numbers, the last review sheet and the forms (model-space
center lines) so it can aim at the same anatomy.

## P15. Level discipline on a subdivision stack

```python
# not yet run in ZBrush (live_s08_remesh_levels_eyes)
st = zl.call("zb_ops", "stats")
zl.run(zs.set_level_code(zs.level_for("big", st["sdiv_max"])), modules=("zb_ops",))        # SDiv 1
specs = zs.move_pass(zs.Scene.capture(OUT + "/big", view="front"), moves, symmetry=False)
zs.run_plan(specs)
lv = zs.level_for("secondary", st["sdiv_max"])                                              # 2 or 3
for level in range(lv, int(st["sdiv_max"]) + 1):                                            # step up
    zl.run(zs.set_level_code(level), modules=("zb_ops",))
    sc = zs.Scene.capture(OUT + f"/sec_{level}", view="front", margin=0.7)
    zs.run_plan(zs.clay_pass(sc, forms, stage="S3", ref_width=2.0), ppu=sc.ppu)
gate = zs.stage_gate("S3", stats=zl.call("zb_ops", "stats"), big_move=True, sdiv=1)
```

Pablo: large proportion changes at the top level look "very wonky" and damage the blockout; at SDiv
1 the same push is easy and the top follows cleanly (rArw79xEpvE 00:12:28 to 00:13:05). Detailing
only at the top shows where strokes start and stop: block secondary forms at SDiv 2 or 3, then step
up, refining at each level (00:13:42 to 00:15:28); "do not stay at the highest level" (tbQqC6tyDBQ
00:12:26). Smoothing acts at the scale of the current level (subdivision doc), so smooth big forms
low. New layers and StoreMT before projection go at the top level (docs). Re-capture the Scene after
every level change: the mesh the plan snaps to changes.

## P16. Safe re-DynaMesh (mask, Draw mode, polypaint or polygroups)

```python
# not yet run in ZBrush (live_s08_remesh_levels_eyes)
r = zl.run(zs.remesh_code(256, keep="groups", groups=True), modules=("zb_ops",), timeout=600)
assert r["ok"], r            # faces changed and DynaMesh is on; r["steps"] says what was fixed
print(r["missing"])          # Draw mode or Colorize not found: look at the canvas before going on
```

What it guards (DynaMesh doc, Manual Update and PolyGroups; Pablo FrqUnna1jns 00:07:28, 00:16:16;
Pavlovich 8kWFv1cZlCE 00:20:06):

- the update needs Edit plus Draw mode (`Transform:Draw Pointer` [xml]), not Move, Scale or Rotate;
- with any mask, the gesture only clears the mask: the mask is cleared first;
- with polypaint on, DynaMesh keeps the polypaint INSTEAD of the polygroups. `keep="groups"` turns
  `Tool:Polypaint:Colorize` [xml] off; `keep="polypaint"` turns it on (a color pass that must
  survive); you cannot keep both. If both matter, store the groups as color first
  (`Tool:Polypaint:Polypaint From Polygroups` [xml]) and rebuild them after with
  `Tool:Polygroups:From Polypaint` [xml] [added route, verify];
- `groups=True` keeps separate polygroups as separate shells (Pablo's teeth); with Groups off
  intersecting parts fuse;
- the toggle: `zb_ops.dynamesh` switches the lit button off and on [verify live_06]; if DynaMesh is
  left off, the code presses once more and re-reads the faces. That Colorize is the same switch as
  the SubTool list's brush icon is [verify live_s08].

## P17. Eyes: spheres first, lids wrap them, a perspective look

```python
# not yet run in ZBrush (live_s08_remesh_levels_eyes)
for side in (+1, -1):                                  # one SubTool per eye
    zl.run(zs.append_primitive_code("Sphere3D", position=(side * 0.33, 0.12, 0.78), size=0.2),
           modules=("zb_ops",))
    zl.call("zb_ops", "deform", "Rotate", zs.eye_rotation(side), 2)   # Y axis; sign [verify]
zl.run(f"zbc.select_subtool({HEAD}); result = zb_ops.stats()", modules=("zb_ops",))  # head index from the role map
lids = [zs.Form.crease("upper lid", upper_lid_path, 0.03), zs.Form.crease("lower lid", lower_lid_path, 0.03)]
zs.run_plan(zs.crease_pass(sc, lids, symmetry=True), ppu=sc.ppu)       # cut the lids in
zs.run_plan(zs.move_pass(sc, lid_out_moves, preset="move_local"), ppu=sc.ppu)   # then out onto the ball
shot = zl.run(zs.persp_snapshot_code(OUT + "/eyes_persp.png", "threequarter"), modules=("zb_ops", "zb_stroke"))
```

`HEAD`, `sc`, the lid paths and `lid_out_moves` are the caller's (lid center lines and outward
displacements in model space, planned on the eyeball like any other form). Henning moves the eyes in
with perspective on, forces the upper and lower lids in with Dam_Standard, then moves them out so
they conform to an eyeball (TpS0QdlfHWU 00:17:28 to 00:18:33). Costa: eyes placed straight ahead
look cross-eyed; rotate each 3 to 7 degrees outward, about 5 (j5XLtLMN0P8 00:29:10 to 00:30:16).
Positions and sizes come from the domain skill (scenario-zbrush-character-creature for realistic
heads, scenario-zbrush-stylized for the canthus rule and big stylized eyes). Aimed strokes stay
orthographic (the plans assume it); `persp_snapshot_code` is for looking only, and it restores the
perspective switch and the view. The Deformation Rotate axis bit and sign are [verify live_s08];
check the result on the top render (the pupils diverge slightly).
