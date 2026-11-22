# Bridge procedures: realistic characters and creatures (ZBrush 2026.2.1)

Status, stated once for the whole file: **no procedure below has run in ZBrush yet.** Every block is
"not yet run in ZBrush". What is proven is the ground they stand on (scenario-zbrush-expert v01 to
v03, 2026-09-24): synthesized V02 strokes sculpt, `Document:Export` and `Tool:Export` write files
without a dialog, and `set()` on a missing path is silent. The logic of `zb_character` passes 54
offline tests (`tests/code/zbrush-character-creature/test_zb_character.py`, `run_offline.py`),
including a round trip through the real bridge server against a fake `zbrush.commands` and, since
the 2026-09-24 refactor, the stack, map-request, crack, aiming, region, spike, asymmetry,
calibration-dot, SSS-survival and Asset Directory checks. The live tests that will settle each
procedure are named in its header; `run_live.sh` runs them in risk order.

| Live test                     | Settles                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `live_c01_layers_morph.py`    | path inventory of every `CHAR_PATHS` candidate; `brush_check` (Dam_Standard under its 2026 name); `layer_new` at the top level; the layer intensity path; StoreMT and Switch; Bake All |
| `live_c02_masks_stamps.py`    | Mask By Cavity protects cavities from Inflate; MaskLasso selected without Ctrl; stroke-type names; DragRect drag length sets stamp size; DragDot; Mask By Polygroups auto-mask         |
| `live_c03_alpha_noise.py`     | Plane3D with Smt off to 1M; GrabDoc, MidValue, Alpha:Export by path; `alpha_check` on the export; Surface Noise pop-up (blocking or not); Apply To Mesh                                |
| `live_c04_face_review.py`     | `insert_sphere` and Geometry Position versus OBJ coordinates; multi-group OBJ; the view from below on the sheet; `face_report` and `mirror_deviation` on a real export                 |
| `live_c05_dynamics_fibers.py` | Dynamics paths; whether Run Simulation returns and how it stops; Extract and Accept; FiberMesh Preview and Accept                                                                      |
| `live_c06_curves_horn.py`     | CurveTube, IMM Curve and CurveFlat with script curves; curve points in OBJ units                                                                                                       |

## Preamble (every procedure)

```python
import json, os, random, sys
SK = "skills"
sys.path[:0] = [SK + "/scenario-zbrush-character-creature/scripts", SK + "/scenario-zbrush-expert/scripts",
                SK + "/scenario-zbrush-retopology-export/scripts"]
import zb_launch as zl, zb_review, zb_audit, zb_stroke
import zb_character as zc
import zb_retopology_export as rx        # reprojection stack, decimate_copy, MME (its owner)

OUT = "/abs/out/creature"                 # every artifact under a versioned folder
zl.start()                                # or reuse a running bridge session (scenario-zbrush-expert)
W, H = zl.run("result = [zbc.get('Document:Width'), zbc.get('Document:Height')]")
```

Calls: `zl.call("zb_ops", ...)` for the lead's wrappers, `zc.call(...)` for this toolkit's
ZBrush-side functions, `zl.run(code, modules=("zb_ops", "zb_stroke"))` for inline code. Before any
stroke, confirm Edit mode (`stamp` calls `zb_ops.ensure_edit`), set symmetry on purpose, and save a
versioned ZTL before anything destructive (`zl.call("zb_ops", "save_ztl", path)`).

Once per session, `BR = zc.call("brush_check")`: which planned brush resolves to a palette item, to
a file to load, or only to a fuzzy name. `Brush:Dam_Standard` does not exist under that name on
2026.2.1 (README); every procedure selects brushes by name through `zb_ops.select_brush` (called by
`stamp`), which tries the DamStandard spellings and loads the .ZBP otherwise. Never
`zbc.press("Brush:Dam_Standard")` directly: a missing path fails silently.

---

## C1. Face review loop (measure, render, compare)

Source: Kingslien checks front, profile, three-quarter and from below, and judges a change on a
duplicate beside the original (6wiDxO-ZADg 01:00:06, 01:07:39); Costa reads blurred, from afar and
upside down (Lfen-BSwWcE 00:28:50; j5XLtLMN0P8 00:09:18). Test: `live_c04_face_review.py`.

```python
def face_review(stage, chin_y, prev=None):
    d = f"{OUT}/{stage}"
    obj = zl.call("zb_ops", "export_obj", f"{d}/head.obj", overwrite=True)["path"]
    crown_y = zb_audit.audit(obj)["bbox_max"][1]
    prof = zc.front_profile(obj)
    lm = zc.profile_landmarks(prof, chin_y, crown_y)       # heuristic: confirm on the profile tile
    rep = zc.face_report(obj, lm)
    rep["mirror"] = zc.mirror_deviation(obj)
    views = ["front", "right", zc.view_facing("-Y"), "threequarter", "back"]
    rv = zb_review.review(d, views=views, title=f"{stage} | MatCap Gray")
    front = rv["views"][0]["path"]
    derived = [zc.blurred(front, f"{d}/front_blur.png"),
               zc.thumbnail(front, f"{d}/front_thumb.png"),
               zc.upside_down(front, f"{d}/front_flip.png")]
    return {"landmarks": lm, "report": rep, "sheet": rv["sheet"], "derived": derived,
            "delta": zc.compare_reports(prev, rep) if prev else None}

r1 = face_review("stage1_masses", chin_y=-0.92)      # chin from a marker (C18) or the profile tile
```

Then open the sheet and the three derived images and walk `critique.md` section 1 in order: the
first failing step is the fix, because later steps inherit its error (Kingslien 01:37:20). `chin_y`
is not the bbox minimum on a bust (the neck is lower). The below view is `view_facing("-Y")` under
the unfitted camera convention: check on the tile that the chin faces the camera.

## C2. Mass block-in on a stroke budget (Kingslien)

Source: Move only (Dots, Z Intensity 51, Focal Shift 0), cranium plus face wedge in 13 to 16 moves,
undo and redo when a region is touched twice (6wiDxO-ZADg 00:20:29-00:24:47, 00:28:04). Morph target
as the undo point, since `merge_undo` is not implemented. Test: `live_c01` (StoreMT, Switch) and
`live_c02` (strokes).

```python
zl.call("zb_ops", "set_symmetry", True, "x")
zc.call("morph_store")                                 # restore point for this pass
mb = zc.MoveBudget({"mass": 16})
plan = [   # (region, start px, end px) read off the last front render; one decision per move
    ("face_wedge", (0.50 * W, 0.47 * H), (0.50 * W, 0.53 * H)),
    ("jaw_under",  (0.47 * W, 0.66 * H), (0.47 * W, 0.61 * H)),
    ("cranium_back", (0.62 * W, 0.30 * H), (0.60 * W, 0.28 * H)),
]
for region, a, b in plan:
    zc.call("stamp", [zb_stroke.line(a, b, 6)], brush="Move", size=180, z_intensity=51, focal=0)
    mb.log("mass", region)
rep = mb.report("mass")
if rep["retouched"] or rep["over_budget"]:
    zc.call("morph_switch")                            # back to the stored shape
    zc.call("morph_store")                             # and replan with fewer, better moves
open(f"{OUT}/move_budget.json", "w").write(mb.to_json())
```

Next, clay block-in (his RK_BallStylus is a Gumroad brush; the stock stand-in is ClayBuildup at Z
20, Focal Shift -56 [added]), Sculptris Pro only after deleting levels
(`zl.call("zb_ops", "del_levels")`). The Sculptris Pro toggle path is [verify] (Stroke > Sculptris
Pro). Morph targets break when topology changes, so store again after any Sculptris Pro or DynaMesh
step.

## C3. Separating line from a planned path (form-clue line, then trim)

Source: single lines separate cheek from muzzle, the marionette line, the lip-fiber line, the malar
band; a line around the nose wing is drawn, then trimmed (Kingslien 00:43:31, 00:59:02-00:59:34,
01:17:28). No pressure token is proven in V02 strings, so taper comes from segments. Test:
`live_c02` (stroke types), scenario-zbrush-expert `live_04` (camera mapping outside the front view).

```python
def separation_line(pixels, brush="ClayBuildup", size=(14, 6), z=(22, 8), zsub=True, trim=True):
    """pixels: canvas points picked on the render of the view where the line is most frontal."""
    t = zl.run("result = zbc.get_transform()")
    obj = zl.call("zb_ops", "export_obj", f"{OUT}/sep_probe.obj", overwrite=True)["path"]
    m = zb_audit.load_obj(obj)
    cam = zb_stroke.Camera(t, zb_audit.audit(m)["center"])   # front view proven; others [verify live_04]
    on = [zb_stroke.front_most_vertex(cam, m.verts, p, 4) is not None for p in pixels[::4]]
    if not all(on):
        raise RuntimeError("part of the line misses the mesh: re-pick the pixels")
    pts = zb_stroke.resample(pixels, 6)
    segs = zc.taper_segments(pts, 3, size=size, z=z)
    cut = zc.call("stamp", [s[0] for s in segs], brush=brush, stroke_type="FreeHand", zsub=zsub,
                  per_stroke=[(s[1], s[2]) for s in segs])
    out = {"cut": cut}
    if trim:
        out["trim"] = zc.call("stamp", [pts], brush="TrimDynamic", size=size[0] * 1.5, z_intensity=z[1])
    return out

# maxilla line, both sides with X symmetry: from beside the nose wing toward the jaw
separation_line(zb_stroke.polyline([(0.46 * W, 0.50 * H), (0.44 * W, 0.56 * H), (0.43 * W, 0.62 * H)], 4))
```

Pressure lead for the lead's live_02 [verify]: the SDK's own `examples/_tests/_stroke_fomat.py`
carries V03 strings whose first four points have `p` tokens rising C0, F0, FC, FF, then none, which
looks like a per-point pressure byte ramping to full. Until that is proven, taper by segments as
above.

`front_most_vertex` loops in pure Python; subsample the check on meshes above a few hundred thousand
points. Judge the result on a before copy (`zl.call("zb_ops", ...)` Duplicate through
`zb_ops.resolve("duplicate")`, then `Tool:Geometry:X Position` to park it beside [macro]).

## C4. Masked move without the Gizmo

Source: Kingslien's masked Move pull on the nose, widen the base, lift the bottom, tuck the nostrils
(6wiDxO-ZADg 00:50:21, 01:35:40). Gizmo drags cannot be scripted; masks constrain Deformation
sliders (masking doc). Test: `live_c02`.

```python
# A. region polygroup + auto-mask: a Move drag started on the nose only moves the nose group
zc.call("automask_polygroups", 100)
zc.call("stamp", [[(0.50 * W, 0.47 * H), (0.50 * W, 0.465 * H)]], brush="Move", size=110, z_intensity=35)
zc.call("automask_polygroups", 0)

# B. feature mask + one Deformation slider (value = percent of the unit radius for Offset)
zc.call("masked_deform", "Inflate", 3, mask="cavity", blur=1)   # lifts what is not in a cavity

# C. synthesized MaskLasso polygon, if live_c02 shows it masks without Ctrl [verify]
zl.run("""
zbc.press("Brush:MaskLasso")
poly = zb_stroke.polyline(__POLY__, 10, closed=True)
zbc.canvas_stroke(zbc.Stroke(zb_stroke.encode(poly)))
result = zb_ops.current_brush_title()
""".replace("__POLY__", repr([(0.45 * W, 0.44 * H), (0.55 * W, 0.44 * H), (0.55 * W, 0.56 * H), (0.45 * W, 0.56 * H)])),
       modules=("zb_ops", "zb_stroke"))
zl.call("zb_ops", "mask", "invert"); zl.call("zb_ops", "mask", "blur")
zl.call("zb_ops", "deform", "Size", 6, axes=1)                  # widen along X only (x=1, y=2, z=4)
zl.call("zb_ops", "mask", "clear")
```

Gate: volume change in the expected direction, then the sheet with a before copy.

## C5. Subdivision stack: choose the route first, then the restore point

Source: J Hill splits 3 to 4 regular plus 3 to 4 HD levels, never 6 or 7 regular then 1 or 2 HD,
because "you are not able to go below where you started" and smoothing needs lower levels; for games
he stops regular work at 20 to 40M, "40 million is high" (HlHoIGE2Ocs 00:10:37-00:13:54). Costa
keeps the regular top at 1 to 2M so five 8K maps export in 7.5 minutes, then 3 DivideHD (Lfen-BSwWcE
00:17:53-00:18:58). HD ceiling 1 billion (HD doc). The SDK-only branch and its tiled micro map
follow Costa's own last layer (Lfen 01:10:58) and J Hill's real-time advice (00:11:10) [added as the
agent default]. Smt off on the first levels for joints (Eaton Ale6SXXbJMM 00:32:36). Test: offline
`test_stack_check_two_branches`; scenario-zbrush-expert `live_06` (Divide x4), `live_c01` (StoreMT).

The route is decided before the first Divide, because a 6-level regular stack cannot take HD
afterwards without Del Higher (which throws the upper levels away):

- **SDK only** (no computer-use agent): regular levels to about 20 to 25M, no HD. The finest pore
  and scale grain goes into a tiling micro-displacement map in the renderer, on the handoff to
  scenario-zbrush-paint-render or scenario-maya-lookdev.
- **Computer use available:** 3 to 4 regular levels ending at 1 to 2M, then 3 to 4 DivideHD. The
  DivideHD button is a palette press [verify path `CHAR_PATHS["divide_hd"]`]; entering a region (A
  over the mesh) is the computer-use step.

```python
st = zl.call("zb_ops", "stats")
COMPUTER_USE = False                                    # the orchestrator says whether one is attached
plan = zc.subdiv_plan(st["faces"], route="hd" if COMPUTER_USE else "regular", smt_off_levels=1)
gate = zc.stack_check(plan, computer_use=COMPUTER_USE)
if not gate["ok"]:
    raise RuntimeError(gate["problems"])               # replan (lighter base, other route) first
for lv in plan["levels"][1:]:
    if lv["kind"] == "regular":
        r = zl.call("zb_ops", "divide", 1, smt=lv["smt"], timeout=1800)
        if not r["ratio"] or abs(r["ratio"] - 4) > 0.05:
            raise RuntimeError(f"Divide did not quadruple faces: {r}")
    else:                                               # HD: the button is scriptable, the A key is not
        zl.run("zbc.press(zb_ops.resolve(__P__)); result = 1".replace("__P__", repr(zc.CHAR_PATHS["divide_hd"])),
               modules=("zb_ops",), timeout=1800)
zc.call("morph_store")                                 # J Hill: store before any detail pass
zl.call("zb_ops", "save_ztl", f"{OUT}/creature_stack.ztl")
json.dump({"plan": plan, "gate": gate}, open(f"{OUT}/stack_plan.json", "w"), indent=1)
```

On the HD route, the computer-use agent presses A over the region: store the morph target again on
every entry, and expect no layers across entries (J Hill 00:13:54). Aim off the front axis with
perspective off (Costa 00:26:05) or front-on slightly forward for a "butterfly" region (J Hill
00:12:49); hide the polygroups you do not need first (Costa 00:26:40). A mesh that already carries 6
or 7 regular levels stays on the SDK-only branch.

## C6. A layer per frequency, with a ledger

Source: layers only at the top level, intensity 1 as sculpted (3D Layers doc); one layer per detail
frequency (character digest). Names cannot be set from Python. Test: `live_c01`.

```python
LEDGER = []
def new_layer(purpose):
    r = zc.call("layer_new")
    LEDGER.append({"order": len(LEDGER) + 1, "purpose": purpose, "points": r["stats"]["points"]})
    json.dump(LEDGER, open(f"{OUT}/layers.json", "w"), indent=1)
    return r

def layer_seen(tag):
    """Render the current layer at 1 and 0 [verify path]; fallback: the morph target compare."""
    shots = {}
    for v in (1.0, 0.0, 1.0):
        zc.call("layer_intensity", v)
        shots[v] = zl.call("zb_review", "snapshot", f"{OUT}/{tag}_layer_{v:g}.png")
    return shots

new_layer("L1 wrinkles")
```

If `layer_intensity` raises (no path in this build), store a morph target before the pass and
compare with `morph_switch` renders instead (Heavy then dial back, C10).

## C7. Pore or scale bed with Surface Noise

Source: pore scale first and globally, negative strength, Mix Basic Noise 0, preview then Apply; in
HD the noise projects from the camera, fix seams and soft zones with the Morph brush (J Hill
00:14:31-00:16:42). Surface Noise doc: Quick 3D Edit on or nothing shows; open NoisePlug with
Strength at 0.5 or -0.5 to see the preview, then lower it; vary scale and strength per region with a
mask and Magnify by Mask / Strength by Mask; Snake Skin needs Scale Variability and "especially some
Amplitude"; UV projection can show seams; SNorm 100 at high scale and strength. NoiseMaker 2.0
(2026.0) rotates, scales and offsets the alpha, so a scale tile can follow each region's flow
(deltas 3.2). Test: `live_c03`.

```python
new_layer("L3 pore bed (Surface Noise)")
zc.call("morph_store")                                 # for the Morph brush clean-up below
sn = zc.call("surface_noise", True, timeout=30)        # sets Quick 3D Edit; opens NoiseMaker [verify blocking]
# NoiseMaker lives in a floating plugin window: a computer-use agent sets it ONCE (Strength 0.5
# while choosing the generator, then low and negative for pores; Alpha mode with the 16-bit tile;
# Alpha Angle per region; Magnify/Strength by Mask 1 over a region mask), saves a .ZNM, and later
# sessions Open that file [verify path]. Shipped presets: Lightbox/Noises/*.ZNM.
zl.call("zb_ops", "set_material", "MatCap Gray")
zl.call("zb_review", "snapshot", f"{OUT}/noise_preview.png")   # judge scale for age and sex first
ap = zc.call("surface_noise_apply", snorm=100, timeout=900)

# clear lids and lips with Morph-brush strokes confined to their polygroups (J Hill): the region
# comes from the mesh, not from canvas fractions
obj = zl.call("zb_ops", "export_obj", f"{OUT}/noise_probe.obj", overwrite=True)["path"]
t = zl.run("result = zbc.get_transform()")
for g in ("lid_L", "lid_R", "lips"):                   # polygroup names from the retopo handoff
    reg = zc.region_on_canvas(obj, t, g)
    if not reg["aim_ok"]:
        continue                                       # re-aim (C9) and redo this region
    xs = [p[0] for p in reg["polygon"]]; ys = [p[1] for p in reg["polygon"]]
    zz = zb_stroke.zigzag((min(xs), (min(ys) + max(ys)) / 2), (max(xs), (min(ys) + max(ys)) / 2),
                          (max(ys) - min(ys)) / 2, 12)
    run = [q for q in zz if zc.point_in_polygon(q, reg["polygon"])]
    zc.call("stamp", [run], brush="Morph", size=30, z_intensity=100, automask_pg=100)
```

Gate: close-up under a raking light; no seams; pores gone from lids and lips; the depth histogram is
spread (J Hill: not an even depth). Whether the Morph brush accepts synthesized strokes is [verify
live_c02-style check]. Mask direction: Mask By Cavity and Mask AO protect the crevices, so a masked
Apply or fill lands on the tops; Inverse first to work in the crevices.

## C8. Alpha factory (Henning Sanden)

Source: plane with Smt off at about 1M polys, layer, directional flow, domes then Dam_Standard
borders, smooth inside each scale only, GrabDoc at 1024 with perspective off and Actual, MidValue 50
after +50 / -50 dots, test on the model at about 11, 26 and 41 minutes ("very much wasted work if
you ... don't test your alpha") (TuRIf92oMCY 00:02:11-00:28:23). The dots must be taller and deeper
than anything in the alpha, typed values, not dragged (00:25:09-00:26:15). `recenter_alpha` is the
dot-free substitute [added]. Test: `live_c03`; offline `test_dots_check`.

```python
CREATURE_ZTL = f"{OUT}/creature_v012.ztl"              # the latest versioned save of the creature
TEST_REGION = "forearm_scales"                         # a polygroup where the tile will live

def load_tool(path):                                   # Tool:Load Tool by path [verify dialog-free]
    return zl.run(f"zbc.set_next_filename({path!r}); zbc.press('Tool:Load Tool'); "
                  "result = not zbc.has_next_filename()")

def test_on_model(tag):
    """Grab the tile as it stands, stamp a patch on the creature on a throwaway layer, look."""
    tile = zl.call("zb_ops", "save_ztl", f"{OUT}/tile.ztl")["path"]
    g = zc.call("grab_alpha", f"{OUT}/alphas/test_{tag}.tif", midvalue=None)
    a = zc.recenter_alpha(g["file"], f"{OUT}/alphas/test_{tag}_mid.tif")
    load_tool(CREATURE_ZTL)
    zc.call("layer_new")
    stamp_region(a, TEST_REGION, spacing=36)            # C9
    shot = zl.call("zb_review", "snapshot", f"{OUT}/tile_test_{tag}.png")
    zl.run("zbc.press('Tool:Layers:Delete'); result = 1")          # [macro] path
    load_tool(tile)
    return shot   # read it: too soft? variation inside each scale? visible tiling? a border?

pl = zl.run("""
zbc.press("Tool:Plane3D"); zbc.press("Tool:Make PolyMesh3D")
if zbc.get("Transform:Edit") < 0.5:
    zbc.press(zb_ops.resolve("layer_clear"))
    w, h = zbc.get("Document:Width"), zbc.get("Document:Height")
    zbc.canvas_click(w * 0.5, h * 0.5, w * 0.5, h * 0.85)
    zbc.set("Transform:Edit", 1)
zb_ops.set_checked("smt", 0, tol=0.5)
while int(zbc.query_mesh3d(1)[0]) < 1000000:
    zbc.press("Tool:Geometry:Divide"); zbc.update(redraw_ui=True)
result = zb_ops.stats()
""", modules=("zb_ops",), timeout=1800)
new_layer("tile")
snap = zl.call("zb_review", "snapshot", f"{OUT}/tile_canvas.png")
x0, y0, x1, y1 = zb_review.silhouette_bbox(snap["path"])["bbox"]      # the plane on the canvas
m = 0.12 * (x1 - x0)                                                  # detail off the border and dot corners
spacing = (x1 - x0) / 14
centers = zc.jittered_lattice(x1 - x0 - 2 * m, y1 - y0 - 2 * m, spacing, angle_deg=45, jitter=0.2,
                              origin=(x0 + m, y0 + m))
zc.call("stamp", zc.dragdot_stamps(centers), brush="ClayBuildup", stroke_type="DragDot",
        size=spacing * 0.9, z_intensity=25, timeout=600)
test_on_model("t1_domes")                                              # first test (about 11 min)
borders = zc.scale_borders(centers, spacing)
rng = random.Random(7)
weights = [(rng.uniform(4, 8), rng.uniform(25, 45)) for _ in borders]   # varied line weight
zc.call("stamp", borders, brush="Dam_Standard", stroke_type="FreeHand", per_stroke=weights, timeout=900)
zc.call("masked_deform", "Polish", 10, mask="cavity")                  # smooth inside scales only
test_on_model("t2_borders")                                            # second test (about 26 min)
# ... refine volumes (Alt strokes for variation, Standard for specificity), then:
test_on_model("t3_refined")                                            # third test (about 41 min)
# canvas: 1024 x 1024 [verify Document:Resize], redraw the plane, Transform:Fit, perspective off, Actual
```

Final grab, two routes:

```python
# A. dot-free [added]: grab, then rescale so the flat border sits at 0.5
g = zc.call("grab_alpha", f"{OUT}/alphas/scales_v001.tif", midvalue=50)
final = zc.recenter_alpha(g["file"], f"{OUT}/alphas/scales_v002.tif")

# B. Henning's dots: mask everything but a small corner circle (MaskLasso polygon, C4 C [verify]),
# Inverse, typed Inflate +50; same at -50 in the opposite corner; Clear; grab; check; paint out
for corner, value in (((x0 + 0.05 * (x1 - x0), y0 + 0.05 * (y1 - y0)), 50),
                      ((x1 - 0.05 * (x1 - x0), y1 - 0.05 * (y1 - y0)), -50)):
    ring = zb_stroke.arc(corner, 0.025 * (x1 - x0), 0, 360, 4)
    zl.run("zbc.press('Brush:MaskLasso'); zbc.canvas_stroke(zbc.Stroke(zb_stroke.encode(__P__))); result = 1"
           .replace("__P__", repr(ring)), modules=("zb_stroke",))
    zl.call("zb_ops", "mask", "invert")
    zl.call("zb_ops", "deform", "Inflate", value)        # set() types the value: no slider drag
    zl.call("zb_ops", "mask", "clear")
g = zc.call("grab_alpha", f"{OUT}/alphas/scales_dots_v001.tif", midvalue=50)
chk = zc.dots_check(g["file"])                          # dots at the extremes, border at mid
if not chk["ok"]:
    raise RuntimeError(chk["problems"])                 # raise the dots, grab again
final = zc.clean_corners(g["file"], f"{OUT}/alphas/scales_dots_v002.tif")
print(zc.alpha_check(final))                            # must be ok before C9
```

Library: copy each finished alpha (never overwrite) into `zc.alpha_library_dir()`, the Asset
Directory's `LightBox/Alphas` since 2026.1 (deltas 3.1), so LightBox lists it next session. Offline
alternative when strokes are too costly: `zc.save_alpha16(zc.scale_height_tile(1024, 64), path)` (a
procedural stand-in; Henning's rules still apply, including the tests on the model).

## C9. Alpha stamps on the creature, aimed at the region, then unify

Source: DragRect with Focal Shift -100 (full tile) or 0 (faded), MidValue 50, on a fresh layer, flow
along the anatomy, hand unify pass mandatory (Henning 00:14:15-00:15:21, 00:27:51-00:29:29; 00:00:34
flow). Orient the view to the region before any stamp, so screen space maps to the surface (realism
digest P3 step 3; Kingslien's agent translation); the stamp region comes from the region's
polygroup, not from canvas fractions [added method: `aim_at`, `region_on_canvas`]. A close-up hero
(Starkie's Nidhogg) gets one stamp per scale on a non-overlapping layout. Test: `live_c02` (DragRect
size), `live_c03` (alpha import), scenario-zbrush-expert `live_04` (camera convention); offline
`test_region_on_canvas`, `test_aim_at`.

```python
def aim_region(group, probe=f"{OUT}/aim_probe.obj"):
    """Turn the region toward the camera, centre it, and return its canvas polygon."""
    obj = zl.call("zb_ops", "export_obj", probe, overwrite=True)["path"]
    reg = zc.region_on_canvas(obj, zl.run("result = zbc.get_transform()"), group)
    rx, ry, rz = zc.aim_at(reg["mean_normal"])["rotation"]
    zl.run(f"zbc.set_transform(x_rotate={rx}, y_rotate={ry}, z_rotate={rz}); result = 1")
    t = zl.run("result = zbc.get_transform()")                 # read back what ZBrush applied
    reg = zc.region_on_canvas(obj, t, group, canvas=(W, H))
    dx, dy = reg["center_shift"]
    zl.run(f"zbc.set_transform(x_position={t[0] + dx}, y_position={t[1] + dy}); result = 1")
    t = zl.run("result = zbc.get_transform()")
    reg = zc.region_on_canvas(obj, t, group, canvas=(W, H))
    if not reg["aim_ok"] or reg["on_canvas"] < 0.95:          # [added] thresholds
        raise RuntimeError(f"{group}: facing {reg['facing_frac']}, on canvas {reg['on_canvas']}: "
                           "split the polygroup or zoom out")
    return reg

def stamp_region(alpha, group, spacing, flow_deg=0.0, size_frac=0.95, z=20, hero=False, seed=3):
    reg = aim_region(group)
    poly = reg["polygon"]
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    o, w, h = (min(xs), min(ys)), max(xs) - min(xs), max(ys) - min(ys)
    if hero:                                                   # Starkie: one scale each, no overlap
        centers = zc.poisson_disk(w, h, spacing, origin=o, inside=poly, seed=seed)
    else:                                                      # coverage along the flow (Henning)
        centers = zc.jittered_lattice(w, h, spacing, angle_deg=flow_deg, origin=o, inside=poly, seed=seed)
    strokes = zc.dragrect_stamps(centers, spacing * size_frac, base_angle_deg=flow_deg,
                                 alternate=False, angle_jitter_deg=8)
    r = zc.call("stamp", strokes, brush="Standard", stroke_type="DragRect", alpha=alpha,
                focal=-100, z_intensity=z, automask_pg=100, timeout=900)
    zc.call("automask_polygroups", 0)
    zl.call("zb_review", "snapshot", f"{OUT}/stamp_{group}.png")   # check one stamp landed where planned
    return r

new_layer("L2 scales (alpha)")
for group, flow in (("forearm_scales", 60), ("brow_scales", 10)):  # flow angle read off the anatomy
    stamp_region(final, group, spacing=36, flow_deg=flow)
new_layer("L1 hero scales")
stamp_region(final, "orbit_rim", spacing=28, hero=True)
```

Flow angles are in canvas degrees after aiming: read them off the review render of the aimed view
(the muscle underneath), and split a region whose flow turns by more than about 30 degrees into two
polygroups [added]. Then unify on the hero areas (Henning reserves hand sculpting for them,
00:01:38) with short Standard strokes, because ClayBuildup erases the stamped detail beneath it
(FlippedNormals TpS0QdlfHWU 00:07:44), and C11's mid-frequency lift.

## C10. Pores, clogged pores, wrinkles, spray breakup (Costa, J Hill)

Source: pores DragRect Focal Shift -100, one size per zone, alternate drag direction (Costa
Lfen-BSwWcE 00:38:27); clogged pores as bumps with DragDot (J Hill 00:22:50); wrinkles connect pores
in short segments, never one long line, perpendicular to the circular muscles, Standard + Alpha 39
with a sharp curve (Costa 00:45:41-00:47:26); fine wrinkles follow the compression, circular around
the eyes, Standard, Spray, Alpha 60, Z 3 (J Hill 00:17:38-00:18:10, frame 00:08:53); Spray loops
then Inflat 1 to 2 (Costa 00:42:21-00:44:37); heavy then dial back (J Hill 00:19:16). Test:
`live_c02`.

Direction rule, general form [added reading of Costa and J Hill]: skin buckles into lines that lie
across the direction it is compressed, which is the direction the muscle fibers pull. Forehead lines
are horizontal because the frontalis pulls vertically; crow's feet radiate because the orbicularis
closes in circles. On a creature the same rule sets the throat folds (across the neck's bend), the
jaw-hinge folds (wrapping the hinge) and the elbow and knee rings. Big wrinkles are sketched by hand
first, and alphas only break them into smaller ones (Starkie, "Drake").

```python
PORE_ALPHA = "/abs/alphas/pore_v001.tif"   # a small round, sharp alpha picked by looking at it [added]
ZONES = {  # polygroup -> (pore spacing px, stamp px, direction field from the region)
    "cheek":    (9, 7,  lambda r: zc.radial_field(MOUTH_PX)),        # perpendicular to the orbicularis oris
    "nose":     (14, 5, lambda r: zc.constant_field(0.0)),           # tip-to-bridge lines are horizontal
    "forehead": (10, 6, lambda r: zc.constant_field(0.0)),           # frontalis pulls vertically
    "throat":   (12, 7, lambda r: zc.constant_field(NECK_AXIS_DEG + 90.0)),   # creature: across the bend
}
new_layer("L4 pores and wrinkles")
zc.call("morph_store")                                 # heavy then dial back (J Hill)
for group, (spacing, px, field_of) in ZONES.items():
    reg = aim_region(group)                            # C9: aimed, centered, polygon from the mesh
    poly = reg["polygon"]
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    pts = zc.poisson_disk(max(xs) - min(xs), max(ys) - min(ys), spacing, origin=(min(xs), min(ys)),
                          inside=poly)
    zc.call("stamp", zc.dragrect_stamps(pts, px), brush="Standard", stroke_type="DragRect",
            alpha=PORE_ALPHA, focal=-100, z_intensity=18, zsub=True, timeout=900)
    wr = zc.connect_the_dots(pts, field_of(reg), max_link=spacing * 1.6, max_turn_deg=30)
    zc.call("stamp", wr["segments"], brush="Standard", stroke_type="FreeHand", alpha=39, size=5,
            z_intensity=18, zsub=True, timeout=900)
    if group == "nose":                                # clogged pores are bumps (J Hill)
        zc.call("stamp", zc.dragdot_stamps(pts[::5]), brush="Standard", stroke_type="DragDot",
                size=6, z_intensity=12)
    loops = [zc.spray_loop(c, 18, turns=2, seed=i) for i, c in enumerate(pts[::40])]
    zc.call("stamp", loops, brush="Standard", stroke_type="Spray", alpha=60, size=10, z_intensity=3)
```

`MOUTH_PX` is the mouth center on the aimed canvas (project the mouth landmark or the lips polygroup
center with `region_on_canvas(...)["center_px"]` in the same view); `NECK_AXIS_DEG` is the neck's
long axis on that canvas. Where the wrinkles came out too strong, paint them back with Morph-brush
strokes (the morph target holds the pre-wrinkle state). Over this finished layer, further passes use
Standard or Elastic (Costa's cloned Elastic on Spray with Alpha 16 for direction, j5XLtLMN0P8
00:52:22), never ClayBuildup, which erases what is under it. The alpha numbers are default alphas
(`ZData/Alphas/Alpha 0NN.PSD`); Costa's and J Hill's custom brushes do not ship.

## C11. Breakup without strokes and the mid-frequency lift

Source: Mask By Cavity then a light Inflate pulls bony detail (Lazov AQsmWcXLxk8 00:25:21); mask
groups of scales, blur, invert, blur, Inflate some scales out (Henning 00:30:02); beat up the skin
at several sizes (J Hill 00:18:10). Test: `live_c02`.

```python
zc.call("masked_deform", "Inflate", 2, mask="cavity", blur=1)           # Lazov
patches = zc.poisson_disk(0.3 * W, 0.3 * H, 60, origin=(0.35 * W, 0.30 * H))
zc.call("stamp", zc.dragdot_stamps(patches[::2]), brush="Inflat", stroke_type="DragDot", size=70,
        z_intensity=6, automask_pg=100)                                 # lift some scale groups
beat = []
for s, zi in ((60, 4), (25, 6), (10, 8)):                               # three sizes, push and pull
    beat += [(zb_stroke.line(p, (p[0] + 6, p[1] + 3), 3), s, zi) for p in zc.poisson_disk(0.3 * W, 0.3 * H, s,
             origin=(0.35 * W, 0.30 * H), seed=s)]
zc.call("stamp", [b[0] for b in beat], brush="Standard", per_stroke=[(b[1], b[2]) for b in beat])
```

## C12. Asymmetry pass, big forms first

Source: FlippedNormals break symmetry already in the mid-frequency pass (G2o6fdoACIQ 00:06:19); J
Hill's last 25 percent moves big forms: nose tip off the Z axis, one ear, the septum, a lip corner,
one eye's scale (HlHoIGE2Ocs 00:29:42-00:30:47); asymmetry is "the only way" to likeness (Costa
j5XLtLMN0P8 00:35:03); creatures: Store MT, push and pull freely, restore parts with the Morph
brush, symmetry off (Lazov AQsmWcXLxk8 00:56:58), "asymmetry is the best thing for a creature"
(00:58:04). Magnitudes are [added]. Run it twice: once on the big forms at the end of stage 4
(mid-frequency), once as the last-25-percent pass; scars, broken scales and chipped horns come
after, on top. Test: `live_c04` (`mirror_deviation`), `live_c01` (StoreMT); offline
`test_asymmetry_report_wants_big_forms`.

Big forms by subject, as polygroups with a box in model units (from landmarks or the polygroup's
bbox):

- human head: nose tip and septum, one ear, one lip corner, one eye (scale), one brow;
- creature head: skull mass on one side, one orbit rim, the jaw corner, one nostril, one horn's
  angle or length, one cheek plate;
- figure: the weight-bearing side of the pelvis and ribcage, one shoulder (a posed figure is
  asymmetric from the start, Eaton).

```python
obj0 = zl.call("zb_ops", "export_obj", f"{OUT}/asym_before.obj", overwrite=True)["path"]
REGIONS = {"orbit_rim_L": {"box": ((0.15, 0.25, 0.2), (0.6, 0.6, 0.9)), "kind": "big"},
           "jaw_corner_R": {"box": ((-0.9, -0.5, -0.4), (-0.4, 0.0, 0.3)), "kind": "big"},
           "nostril_L": {"box": ((0.02, 0.0, 0.9), (0.15, 0.12, 1.2)), "kind": "big"},
           "scar": {"box": ((0.3, 0.3, 0.6), (0.5, 0.45, 0.8)), "kind": "detail"}}
zc.call("morph_store")                                 # restore point; Morph brush restores parts
zl.call("zb_ops", "set_symmetry", False)
zc.call("automask_polygroups", 100)                    # a Move drag moves only the group it starts on
for group, (dx, dy) in (("orbit_rim_L", (0.0, -6.0)), ("jaw_corner_R", (5.0, 3.0)),
                        ("nostril_L", (3.0, 0.0))):    # pixels on the aimed canvas [added]
    reg = aim_region(group)                            # C9
    c = reg["center_px"]
    zc.call("stamp", [[tuple(c), (c[0] + dx, c[1] + dy)]], brush="Move", size=90, z_intensity=30)
zc.call("automask_polygroups", 0)
# one eye 1 to 2 percent larger: select the eye SubTool, Deformation Size (100 doubles the size)
zl.run("zbc.select_subtool(__EYE__); result = zb_ops.deform('Size', 1.5)".replace("__EYE__", "2"),
       modules=("zb_ops",))
obj1 = zl.call("zb_ops", "export_obj", f"{OUT}/asym_after.obj", overwrite=True)["path"]
rep = zc.asymmetry_report(obj0, obj1, REGIONS)          # at least 2 big-form regions broken
if not rep["ok"]:
    print(rep["problems"])                              # move more big forms, not more scars
```

The review sheet is the judge: the face or creature must still read as the same design, one side
subtly different, and a likeness closer to the reference when there is one. Restore anything that
went too far with Morph-brush strokes against the stored target (Lazov).

## C13. Cloth folds planned from tension points (Grassetti)

Source: tension points marked first; Standard (Z 25) pushes drop folds in, Clay (Z 80) builds ridges
and compression rolls, a big Move sags the edge; folds end in folds, are heavier near the tension,
and get split after a Divide (gNx4v0WVVHo 00:00:31-00:08:47). Paths from `drop_folds` and friends
[added geometry]. Test: `live_c02` (strokes), offline fold tests.

```python
snap = zl.call("zb_review", "snapshot", f"{OUT}/cloth_canvas.png")      # plane at SDiv 2 to 4, front view
x0, y0, x1, y1 = zb_review.silhouette_bbox(snap["path"])["bbox"]
pin = ((x0 + x1) / 2, y0 + 10)
folds = zc.drop_folds(pin, count=6, length=0.8 * (y1 - y0), spread_deg=50, seed=2)
folds, free = zc.snap_free_ends(folds, border=(x0, y0, x1, y1), reach=0.2 * (x1 - x0))
assert not free, free
ev = zc.evenness([zb_stroke.path_length(f["path"]) for f in folds])
assert ev and ev > 0.05, ev                            # never even (Grassetti); 0.05 is [added]
for f in folds:
    segs = zc.taper_segments(f["path"], 3, size=(90, 40), z=(25, 12))  # heavier near the pin
    zc.call("stamp", [s[0] for s in segs], brush="Standard", stroke_type="FreeHand", zsub=True,
            per_stroke=[(s[1], s[2]) for s in segs])
x = zc.x_folds(((x0 + x1) / 2, (y0 + y1) * 0.6), 0.5 * (x1 - x0), 0.2 * (y1 - y0))
zc.call("stamp", [f["path"] for f in x], brush="Clay", stroke_type="FreeHand", size=65, z_intensity=80)
zl.call("zb_ops", "divide", 1)                                          # then smaller, split folds
```

Measure on an OBJ height field if needed; judge under a raking light, from every side.

## C14. Dynamics drape, then a sculpt pass

Source: collision volume of visible SubTools, Recalc after changes, iterations versus gravity for
stretch, Firmness for fabric weight, Collision Inflate for the gap (Pavlovich m5O_sBag_iA,
F7bcjQAK0Wc, nqoCyOME8Jo; Dynamics doc). Test: `live_c05`.

```python
subs = zl.call("zb_ops", "subtools")
solid = {}
for s in subs[1:]:                                     # colliders: every visible SubTool but the cloth
    solid[s["index"]] = zl.run(f"zbc.select_subtool({s['index']}); result = zbc.is_polymesh3d_solid()")
zl.run("zbc.select_subtool(0); result = 0")            # the cloth
zc.call("dynamics_config", gravity_strength=1.5, iterations=100, firmness=2, self_collision=1,
        resolution=1024, collision_inflate=0.3)
zc.call("collision_volume")
zc.call("morph_store")                                 # surface-area reference (Dynamics doc tip)
sim = zc.call("run_simulation", timeout=60)            # stop method [verify live_c05]
if abs(sim["area_change_pct"]) > 5:                    # [added] tolerance
    print("stretch: raise iterations or lower gravity, rerun from the morph target")
```

Then sculpt on a layer with C13 strokes: simulation "won't get you a hundred percent there"
(Grassetti 00:12:06). Open colliders: close holes on a duplicate (`CHAR_PATHS["close_holes"]`).

## C15. Garment from the body: Mesh Extract

Source: mask or hide the region, Extract, Accept, clear the mask on the source; Thick 0.01 cloth,
0.03 leather (Extract docs). Test: `live_c05`.

```python
# mask the garment region: MaskLasso polygon (C4 C, [verify]) or a feature mask
zc.call("extract_shell", 0.01)                         # new SubTool
zl.call("zb_ops", "mask", "clear")                     # the doc: clear the mask on the body
```

## C16. FiberMesh fur

Source: groom or settings, not both; Max Fibers 11 and Segments 6 for creature fur; Fast Preview
with PRE Vis 6 to 8; white fibers and a contrasting fill to see gaps (Pablo lgTA_ebLGDw
00:05:47-00:10:04); mask intensity drives density and length; Profile 1 (FiberMesh doc). Test:
`live_c05`.

```python
zc.call("mask_by", "cavity", blur=50)                  # or a polygroup region mask; blur softens edges
fm = zc.call("fibermesh_grow", preset="/Applications/Maxon ZBrush 2026/Lightbox/FiberMeshes/Fibers5.ZFP",
             max_fibers=11, segments=6, accept=True, pre_vis=7, timeout=120)
zl.call("zb_ops", "mask", "clear")
```

Grooming is stroke work with Groom brushes (GroomHairToss and others ship); the programmatic
substitute is a simulation with the roots masked by fibers (`mask_by("fibers")`, then C14 with Self
Collision 1). Keep topology unchanged until grooming is done: a Divide converts the FiberMesh to a
polymesh.

## C17. Horns, spikes and tusks: curves, straight detail, staged cracks

Source: curve IMM with Stretch, curve Resolution 10, Size falloff flipped, Imbed 0 (Pablo
TN9ARiC_82w 00:13:24-00:16:43); tube route: detail a straight tube with radial symmetry, odd counts
layered 8, 5, 3 ("odd numbers in this case work a lot better"), keep a straight master and duplicate
it per variant, decimate to 20 %, then Bend Curve and Taper (00:20:46-00:28:42); cracks on tusks and
spikes in stages, main cracks first, small ones last, Clay brushes for a bone and rock feel with
hard broken edges (Starkie, "Drake"). Decimation runs on a duplicate, never the master (Decimation
doc; `rx.decimate_copy`). Test: `live_c06`; offline `test_crack_tree_stages_large_to_small`.

```python
# curve route
horn = zc.horn_path((0.35, 0.85, 0.05), (0.3, 1.0, -0.2), 1.1, curl_deg=110, twist_deg=30,
                    radius=(0.14, 0.02), samples=8)
r = zc.call("push_curves", [horn["points"], zc.mirror_points(horn["points"])], brush="CurveTube",
            delete_after=True)

# tube route, after radial detail on the STRAIGHT tube (Transform radial on Y, counts 8, 5, 3)
reg = aim_region("horn_L")                              # C9: the tube's side toward the camera
x0 = min(p[0] for p in reg["polygon"]); x1 = max(p[0] for p in reg["polygon"])
cy = reg["center_px"][1]
cracks = zc.crack_tree((x0 + 0.1 * (x1 - x0), cy), (1, 0), 0.6 * (x1 - x0), levels=3, seed=4)
for lev in range(3):                                    # largest first, review between levels
    paths = [c["path"] for c in cracks if c["level"] == lev]
    size = 14 * next(c["size_frac"] for c in cracks if c["level"] == lev)      # Draw Size shrinks per level
    zc.call("stamp", paths, brush="Dam_Standard", stroke_type="FreeHand", size=size,
            z_intensity=25, zsub=True, automask_pg=100)
    zl.call("zb_review", "snapshot", f"{OUT}/cracks_level{lev}.png")
zc.call("automask_polygroups", 0)
zl.call("zb_ops", "save_ztl", f"{OUT}/horn_straight_master.ztl")        # the straight master
d = rx.zcall("decimate_copy", percent=20, timeout=900)                   # a copy, never the master
zl.call("zb_ops", "deform", "Twist", 20, axes=2)                          # then bend, taper, twist the copy
```

Taper along a curve tube comes from the brush's Curve Modifiers Size curve, which has no SDK setter:
save a tapered curve brush once (Brush > Save As) and select it by name. Decimation Master is a
ZScript plugin: a scripted Pre-process ended the calling ZScript in a forum report, so run the
copy's decimation as its own bridge call with a timeout [verify]. Orb Cracks do not ship;
Dam_Standard, Slash3 and TrimDynamic stand in, selected through `select_brush` (`brush_check` lists
what resolves).

## C18. Landmark markers, eyes and world scale (Costa)

Source: markers for measurement (A4S note [added]); head 229 mm, eyeball 24 mm, IPD 63 mm, eyes 3 to
10 degrees outward (Costa j5XLtLMN0P8 00:38:12). The insertion sequence is the shipped Append Eyes
macro. Test: `live_c04`.

```python
H_units = 2.0                                          # measured head height in model units
mm = H_units / zc.COSTA_MM["head_height"]
idx = []
for sx in (-1, 1):
    r = zc.call("insert_sphere", sx * 31.5 * mm, 0.10, 0.62, 24 * mm)   # XYZ Size semantics [verify live_c04]
    idx.append(r["active"])
eyes = []
for i in idx:
    zl.run(f"zbc.select_subtool({i}); result = zbc.get_active_subtool_index()")
    obj = zl.call("zb_ops", "export_obj", f"{OUT}/eye_{i}.obj", overwrite=True)["path"]
    eyes.append(zc.marker_centroids(obj)[0])
print(zc.eye_report(eyes[0]["center"], eyes[1]["center"], 24 * mm, H_units))
```

Rotating a plain sphere outward shows nothing; the divergence check matters once the eye has a
modeled cornea or iris (or a painted one, scenario-zbrush-paint-render).

## C19. Reprojection with danger zones protected, then the level walk

Source: FlippedNormals (Zp07GW3rND0): at the highest level, Store MT, then a new Layer, then Project
All, "both safety nets" before projecting (00:02:13, 00:02:47); PA Blur lowered; parts that sit
close together grab the wrong surface (00:01:41), so keep a polygroup on the inside of the eye, grow
it just past the lid, mask by it, then project (00:05:31-00:06:03); step through every level and
toggle the layer (00:03:49); armpits, between the fingers, butt and crotch are the usual failures,
and their artifacts become hard lines in displacement maps (00:07:10-00:07:43); repair with the
Morph brush or a masked local reprojection, never by smoothing (00:06:36, 00:09:27); stop the
concept sculpt before micro detail when retopology is coming (00:08:22). Generalized [added]: the
danger zones are wherever two surfaces sit close, so a creature adds the gum line, lid folds over
the eye, nostril interiors, horn bases, frills and toe webbing.

The toolkit owns the projection:
`zb_ops.project_all(checkpoint=..., store_mt=True, layer=True, exclusive=...)` saves a versioned ZTL
first, stores the morph target and a new layer at the top level, sets Dist 0.1, and gates the result
(point count, volume, a target reaching outside the visible bbox = spikes), with
`zb_ops.morph_repair(points)` to paint busted areas back; `rx.project_stack` rebuilds a stack level
by level. This procedure adds what is character-specific: the interior masks before, and a
per-polygroup spike walk after, because a lid folded into the socket or a lip fused to a tooth stays
inside the bbox and passes the lead's gate. Test: offline `test_spike_report`; the projection itself
is tested by scenario-zbrush-expert (`live_06`) and scenario-zbrush-retopology-export.

```python
DANGER = ("eye_socket_L", "eye_socket_R", "mouth_bag", "nostril_L", "nostril_R")   # polygroups
zc.call("to_top_level")
before = zl.call("zb_ops", "export_obj", f"{OUT}/proj_before.obj", overwrite=True)["path"]
# 1. danger zones masked. SDK route [verify live_c02 MaskLasso]: each interior polygroup's canvas
#    polygon, grown past the lid; computer-use route: Ctrl+Shift click the group, Tool > Visibility
#    > Grow once or twice, mask the visible part, ShowPt (FlippedNormals agent translation)
for g in DANGER:
    reg = aim_region(g)                                 # C9
    cx, cy = reg["center_px"]
    grown = [(cx + 1.25 * (x - cx), cy + 1.25 * (y - cy)) for x, y in reg["polygon"]]   # [added] margin
    zl.run("zbc.press('Brush:MaskLasso'); zbc.canvas_stroke(zbc.Stroke(zb_stroke.encode(__P__))); result = 1"
           .replace("__P__", repr(zb_stroke.polyline(grown, 6, closed=True))), modules=("zb_stroke",))
# 2. project: checkpoint, morph target and top-level layer inside; only source and target visible
pr = zl.call("zb_ops", "project_all", checkpoint=f"{OUT}/before_projection.ztl", pa_blur=0,
             exclusive=True, timeout=1800)
zl.call("zb_ops", "mask", "clear")
if not pr["gate"]["ok"] or pr["gate"]["warnings"]:
    print(pr["gate"], pr.get("repair"))
# 3. walk every level: spikes per polygroup, danger-zone close-ups
top = zl.call("zb_ops", "stats")["sdiv_max"]
walk = {}
for lv in range(1, int(top) + 1):
    zl.run(f"zbc.set(zb_ops.resolve('sdiv'), {lv}); result = 1", modules=("zb_ops",))
    obj = zl.call("zb_ops", "export_obj", f"{OUT}/proj_L{lv}.obj", overwrite=True)["path"]
    walk[lv] = zc.spike_report(obj, before=before if lv == top else None)
    for g in DANGER:
        aim_region(g)
        zl.call("zb_review", "snapshot", f"{OUT}/proj_L{lv}_{g}.png")
json.dump(walk, open(f"{OUT}/projection_walk.json", "w"), indent=1)
# 4. repair each flagged group at the top level: Morph brush back to the stored target
zc.call("to_top_level")
for g in {gr for w in walk.values() for gr in w.get("per_group", {})}:
    reg = aim_region(g)
    xs = [p[0] for p in reg["polygon"]]; ys = [p[1] for p in reg["polygon"]]
    zz = zb_stroke.zigzag((min(xs), (min(ys) + max(ys)) / 2), (max(xs), (min(ys) + max(ys)) / 2),
                          (max(ys) - min(ys)) / 2, 10)
    run = [q for q in zz if zc.point_in_polygon(q, reg["polygon"])]
    zc.call("automask_polygroups", 100)
    zl.call("zb_ops", "morph_repair", run, size=30, z_intensity=100)
zc.call("automask_polygroups", 0)
```

Above a few million points per level, OBJ exports get heavy: walk the lower levels, compare the top
only against `before`, and read the top level's danger zones on the close-ups. The stroke-free
alternative to `morph_repair` is a local reprojection: mask the rest, invert, and Project All again
on that region only (FlippedNormals 00:09:27). Never smooth a busted region. Then a sculpting pass
to recover what projection lost (00:08:22). Gate: `pr["gate"]` ok with no "safety net missing"
warning; `spike_report` ok at every level in every danger-zone group; the close-ups clean;
`rx.projection_verdict` within its bbox and volume tolerances.

## C20. Handoff checks: SSS survival, map request, UDIM round trip

Source: carve deeper than feels right, SSS eats sharpness (FlippedNormals 0PaYUUvgwYM
00:19:49-00:20:22); only the sharp detail survives in the SSS highlights (J Hill 00:34:53); Adaptive
identical across maps meant to combine (HD doc); maps compare the chosen level with the top
(AskZBrush 2zDAtaQqwh8 00:01:44); MME film values (Costa Lfen-BSwWcE frames 00:20:31-00:23:31: 8192,
Border 4, FlipV, SubDiv 2, Adaptive, DPSubPix 4, SmoothUV, Mid 0, 32-bit EXR, 3 Channels off,
Scale 1) or the FlippedNormals Arnold preset (Mid 0.5 with Scalar Zero Value 0.5, Adaptive off,
DpSubPix 0, UDIM file names with a dot, Merge Maps off with EXR, OBJ Grp off, -ThBTEc8L_M
00:04:43-00:21:09); the external-UV round trip (Costa 00:22:17-00:23:59). Test: offline
`test_detail_survival`, `test_map_request_check`.

```python
# 1. SSS survival: the same camera and crop, MatCap Gray against the Redshift SSS render
#    (Redshift runs inside ZBrush since 2023; scenario-zbrush-paint-render owns the render itself)
sv = zc.detail_survival(f"{OUT}/final_matcap.png", f"{OUT}/final_sss.png", box=(600, 300, 1000, 700))
if not sv["ok"]:
    print("deepen the tertiary pass with Standard or Dam_Standard, then render again", sv)
# 2. the map request for scenario-zbrush-retopology-export (it runs rx.mme_set / rx.mme_create_all)
req = {"top_level": 6, "renderer_zero": 0.5, "merge_maps": False, "udim": True,
       "tile_format": "UDIM", "tile_dot": True,
       "displacement": {"subdiv": 1, "adaptive": False, "bits": 32, "mid": 0.5, "exr": True},
       "normal": {"subdiv": 5, "adaptive": False}}          # micro-only normal from the level below the top
chk = zc.map_request_check(req)
assert chk["ok"], chk["problems"]
```

UVs relaid outside ZBrush after sculpting (a UDIM layout from Maya): delete old morph targets, go to
the export level, Store MT, Switch, `Tool:Import` the relaid mesh, no Divide ("otherwise you'll ruin
everything"), export with Switch MT on (Costa). FlippedNormals found Switch MT did nothing in their
build (00:07:09): check the displacement for leaked big forms on a test tile [verify on 2026]. The
receiving side (Maya File node UV Tiling Mode UDIM (Mari), Filter off, Catmull-Clark about 3
iterations, Scalar Zero Value = Mid) is in `rx.renderer_plan("arnold")`. For Painter, Substance
Bridge (2026.2, Texture palette) sends Low and High directly.
