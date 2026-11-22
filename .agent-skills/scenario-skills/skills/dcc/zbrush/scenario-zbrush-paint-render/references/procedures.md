# Procedures: polypaint, texture, render, turntable through the bridge

Every procedure is agent-side Python that drives ZBrush 2026.2.1 through the lead bridge
(`zb_launch`) and this skill's module `scripts/zb_paint.py`. Status of every block: **not yet run in
ZBrush**. Offline logic tests pass (`python3 tests/code/zbrush-paint-render/run_offline.py`: 36
tests on 2026-09-24). The live test that will verify each block is named under it; run them with
`tests/code/zbrush-paint-render/run_live.sh` (p01 first: it records which candidate paths exist, and
its JSON updates the tags in `zb_paint.PATHS`).

What is already proven by the lead (v01 to v03): the bridge, `Document:Export` and `Tool:Export`
without a dialog, synthesized strokes that sculpt, `set()` on a missing path being silent.
Everything paint-specific below is new.

## P0. Session header (used by every procedure)

```python
# not yet run in ZBrush
import sys
SKILLS = "/abs/path/to/skills"                      # this project's skills/ folder
sys.path[:0] = [SKILLS + "/scenario-zbrush-expert/scripts", SKILLS + "/scenario-zbrush-paint-render/scripts"]
import zb_launch as zl, zb_review, zb_stroke, zb_paint as zp
zl.start()                                            # bridge up, Home Page closed
OUT = "/abs/out/paint"                                # absolute paths only
# zp.remote("func", *args, **kw) runs zb_paint.func inside ZBrush (main thread);
# zp.remote_code("...") runs code with zb_paint, zb_ops, zb_stroke, zb_review, zbc bound.
```

## P1. Preflight and checkpoint

Live test: `live_p01_paint_paths.py` (paths, paint_state).

```python
# not yet run in ZBrush
st = zp.remote("paint_state")
assert st["at_top_level"], "paint at the highest subdivision level (FlippedNormals 00:08:17)"
plan = zp.recommend_map_size(st["points"])             # 4M points -> 2048 (FlippedNormals 00:30:32)
print(st["points"], plan)
zp.remote("texture_off")                               # a shown texture hides polypaint (doc)
zl.call("zb_ops", "save_ztl", OUT + "/head_paint.ztl")  # head_paint_v001.ztl, never overwrites
```

Gate: top level, points recorded, map side chosen, ZTL v001 on disk. If the texture will be baked
and `st["points"]` is under 0.7 of the map's usable pixels (`zp.map_budget`), divide further before
painting, never after (FlippedNormals 00:08:50).

## P2. Paint mode, neutral material, base fill

Live test: `live_p02_fill_and_masks.py` checks 1 and 2 (fill color, intensity scaling).

```python
# not yet run in ZBrush
zp.remote("set_paint_mode", "rgb", False, False, 100)  # Rgb only, Zadd and Zsub off (FlippedNormals 00:03:09)
# Realistic, painter's route: a dull skin base (FlippedNormals 00:02:16; doc Painting a Head)
zp.remote("fill", [196, 150, 128], 100)
# Zone-first route (Pablo 00:46:36): pure yellow base, zones next
# zp.remote("fill", list(zp.ZONE_HUES["yellow"]), 100)
rev = zp.paint_review(OUT + "/p2", look="flat", views=("front", "threequarter"))
```

Gate: the Flat front render shows the fill color at the center within about 8 levels per channel
(live_p02 measures it). Colorize reads on after the fill (Pavlovich 040hAJ3-cTw 00:10:08).

## P3. Zones that are parts (eyes, scarf, teeth, clothes, hard parts)

Live test: `live_p03_zones_polygroups.py` (fill_subtools).

```python
# not yet run in ZBrush
subs = zl.call("zb_ops", "subtools")                  # index, visibility, folder
plan = {0: [196, 150, 128],    # skin
        1: [240, 238, 232],    # eyes (sclera base; iris in P8)
        2: [150, 40, 35]}      # scarf
zp.remote("fill_subtools", {str(k): v for k, v in plan.items()}, 100, "rgb")
```

Gate: `paint_review(look="flat")` shows one flat color per part; the active SubTool is restored.

## P4. Zones that are polygroups on one mesh

Live test: `live_p03_zones_polygroups.py`.

```python
# not yet run in ZBrush
# a) review map: every group gets its group color (doc Polypaint From Polygroups)
zp.remote("polypaint_from_polygroups")
zp.paint_review(OUT + "/p4_groups", look="flat", views=("front", "threequarter", "back"))
# b) exact fills: Duplicate, Groups Split, fill each piece, Project All back with Colorize on
# the checkpoint argument is the versioned save zb_ops.project_all makes before Project All
rep = zp.remote("zone_fill_by_split",
                [[196, 150, 128], [150, 40, 35], [60, 55, 50]], 100, True,
                OUT + "/head_paint.ztl", timeout=600)
print(rep["pieces"], rep["groups"])                    # pieces stay hidden in the tool
```

Gate: the original shows the zone colors after projection; SubTool count went up by the number of
groups; `zl.ping()` answers (Project All is long on dense meshes). Transitions at group borders are
soft after projection; that is usually wanted for skin and wrong for hard-surface parts, which
should be separate SubTools (P3).

## P5. Anatomical skin zones on one mesh (no groups)

Live test: `live_p04_texture_and_projection.py` part 2 (image projection convention).

Route A, generated zone image through planar UVs (stylized digest P5). Use it before UVs exist.

```python
# not yet run in ZBrush
plan = zp.skin_zone_plan(sex="male", build="average", tone="light")   # Pablo 00:47:08-00:55:26
# The planar UVs span the SubTool's bbox. If the SubTool is more than a head (bust, neck),
# place the head's box inside the image: head u0, v0, u1, v1 from a front Flat render.
shot = zp.remote("paint_views", OUT + "/p5_ref", ["front"], "flat")["views"][0]["path"]
full = zb_review.silhouette_bbox(shot)["bbox"]
head = [full[0], full[1], full[2], full[1] + 0.62 * (full[3] - full[1])]  # measure yours [added]
def remap(z):
    u0 = (head[0] - full[0]) / (full[2] - full[0]); v0 = (head[1] - full[1]) / (full[3] - full[1])
    su = (head[2] - head[0]) / (full[2] - full[0]); sv = (head[3] - head[1]) / (full[3] - full[1])
    z = dict(z)
    z["center"] = [u0 + z["center"][0] * su, v0 + z["center"][1] * sv]
    z["radius"] = [z["radius"][0] * su, z["radius"][1] * sv]
    return z
FLIP_V = False                                         # set from live_p04 quadrant probes
img = zp.zone_image(OUT + "/zones.png", [remap(z) for z in plan["zones"]], plan["base"],
                    (1024, 1024), noise=0.15, seed=1, flip_v=FLIP_V)
zp.remote("polypaint_from_image", img)                 # Import, Uvp, Polypaint From Texture, Delete UV
rep = zp.paint_review(OUT + "/p5", "flat", ("front", "right", "threequarter"),
                      regions=zp.head_regions_front())
print(zp.skin_zone_checks(rep["zones"], "male", "realistic", stage="zones"))
```

Route B, synthesized paint strokes (proven stroke engine; organic breakup weaker than a hand).

```python
# not yet run in ZBrush
x0, y0, x1, y1 = zb_review.silhouette_bbox(shot)["bbox"]
def px(u, v):
    return (x0 + u * (x1 - x0), y0 + v * (y1 - y0))
strokes = []
for z in plan["zones"]:
    (cu, cv), (ru, rv) = z["center"], z["radius"]
    a, b = px(cu - ru * 0.8, cv), px(cu + ru * 0.8, cv)
    strokes.append((z["color"], zb_stroke.zigzag(a, b, rv * (y1 - y0) * 0.7, 18, 3.0)))
zp.remote_code("""
bbox = [float(v) for v in zbc.query_mesh3d(2, 3)]
zbc.set_transform(*zb_stroke.frame_transform(bbox, zbc.get('Document:Width'),
                  zbc.get('Document:Height'), (0, 0, 0), 0.75))   # same framing as paint_views
zb_paint.set_paint_mode('rgb', intensity=35)          # doc: RGB about 30 for zones
zb_ops.select_brush('Standard')
zb_ops.set_draw(size=40)
for p in ('Stroke:Color Spray', 'Stroke:Spray'):      # [verify] stroke path
    if zbc.exists(p):
        zbc.press(p)
        break
if zbc.exists('Alpha:Alpha 08'):                      # [verify] FlippedNormals 00:04:35
    zbc.press('Alpha:Alpha 08')
zb_ops.set_symmetry(True, 'x')
for col, pts in __STROKES__:
    zb_paint.set_color(col)
    zb_stroke.play(pts)
zbc.update(redraw_ui=True)
result = len(__STROKES__)
""".replace("__STROKES__", repr(strokes)))
```

Gate (both routes, `stage="zones"`): forehead yellower than midface, midface redder, male lower
third bluer, by at least one JND (2.3 in Lab). Visual: the map reads as a clown on purpose (Pablo
01:05:27) and zones sit on the anatomy (bone and fat yellow, thin tissue red, hollows blue).

## P6. Cover, mask passes, wash

Live test: `live_p02_fill_and_masks.py` checks 3 to 6.

```python
# not yet run in ZBrush
SKIN = [205, 165, 140]
zp.remote("fill", SKIN, 30)                            # cover at low opacity: zones shimmer through
zl.call("zb_ops", "save_ztl", OUT + "/head_paint.ztl") # one checkpoint per stage (Pablo 00:55:58)
# crevices darker and redder (Pablo 01:16:40-01:20:29)
zp.remote("mask_pass", "cavity", [125, 45, 45], 30, True, 20, True)
# breakup on smooth areas: smoothness or peaks and valleys, then a pale warm tone
# (Pablo 01:26:05: PVRange 14, lower coverage; Adjust Colors replaced by a low fill)
zp.remote("mask_pass", "peaks_valleys", [215, 185, 150], 15, True, 20, True, pv_range=14)
# occlusion undertone, purple-red, from the AO plugin (Pablo 01:37:25; Pavlovich mW4P 00:06:30)
zp.remote("mask_pass", "ao_plugin", [120, 55, 85], 20, True, None, True, timeout=180)
zl.ping()                                              # a ZScript plugin press may not return
# realism only: a pale wash desaturates (doc RGB about 10; Pablo 01:31:16)
zp.remote("wash", [240, 230, 222], 8)
zl.call("zb_ops", "save_ztl", OUT + "/head_paint.ztl")
```

Gate per pass: prove the mask before filling through it when the pass matters:

```python
# not yet run in ZBrush
zp.remote("mask_by", "cavity")
m = zp.remote("paint_views", OUT + "/mask_on", ["front"], "flat")["views"][0]["path"]
zl.call("zb_ops", "mask", "clear")
c = zp.remote("paint_views", OUT + "/mask_off", ["front"], "flat")["views"][0]["path"]
print(zp.mask_coverage(m, c))   # masked share of the subject; 0 means the mask did nothing
```

Then `paint_review` with `skin_zone_checks(stage="covered")`: no clown (share of pixels above HSV
saturation 0.75 at most 5 percent [added]), realistic mean saturation under 0.5 (Pablo 01:10:30),
speckle present.

## P7. Review and gates at every stage

Live test: offline `test_zb_paint.CanvasMeasurements`; live renders in p02 to p05.

````python
# not yet run in ZBrush
reviews = {}
for look in ("flat", "skin", "white"):                 # Flat = albedo; SkinShade4 and MatCap White01
    reviews[look] = zp.paint_review(OUT + f"/review_{look}", look,
                                    ("front", "threequarter", "right", "back", "top"),
                                    regions=zp.head_regions_front() if look == "flat" else None)
    print(reviews[look]["sheet"])                      # open it and judge with critique.md
checks = zp.skin_zone_checks(reviews["flat"]["zones"], sex="male", style="realistic", stage="final")
print(checks["failed"])
``` Always open the sheets with the image reader: numbers catch beige, clown, missing zones and missing eye contrast; the eye catches lips, transitions, likeness and the back of the head.

## P8. Eyes
Live test: `live_p04` projection convention; eye specifics [verify].

```python
# not yet run in ZBrush
# Pablo 01:41:30-01:47:03: dark iris over most of the visible eye, lighter bottom and darker top
# (lens fake), lighter toward the pupil, black pupil. Planar projection from the front covers the
# visible half of an eyeball SubTool without UVs.
iris = [
    {"shape": "ellipse", "center": [0.5, 0.5], "radius": [0.30, 0.30], "color": (70, 45, 30), "feather": 0.01},
    {"shape": "ellipse", "center": [0.5, 0.60], "radius": [0.22, 0.14], "color": (125, 85, 50), "feather": 0.04, "opacity": 0.7},
    {"shape": "ellipse", "center": [0.5, 0.40], "radius": [0.24, 0.12], "color": (40, 25, 18), "feather": 0.04, "opacity": 0.6},
    {"shape": "ellipse", "center": [0.5, 0.5], "radius": [0.11, 0.11], "color": (160, 110, 60), "feather": 0.03, "opacity": 0.5},
    {"shape": "ellipse", "center": [0.5, 0.5], "radius": [0.08, 0.08], "color": (8, 8, 8), "feather": 0.005}]
img = zp.zone_image(OUT + "/iris.png", iris, (238, 234, 228), (512, 512), flip_v=FLIP_V)
zl.run("zbc.select_subtool(1); result = zbc.get_active_tool_path()")   # the eye SubTool
zp.remote("polypaint_from_image", img)
````

Then rotate the eyes a few degrees apart (Pablo: straight eyes look dead). Gizmo rotation is not
scriptable; hand it to scenario-zbrush-sculpting or do it with Tool > Deformation > Rotate on a
masked eye [verify]. With Mirror And Weld eyes (one SubTool), paint before mirroring, or paint one
and mirror (Mirror And Weld transfers polypaint, projection doc).

## P9. Deliver the color: texture, vertex color or Painter

Live test: `live_p04_texture_and_projection.py` part 1 and 3.

```python
# not yet run in ZBrush
st = zp.remote("paint_state")
if st["uv_bbox"]:
    tex = zp.remote("texture_from_polypaint", OUT + "/head_color.png",
                    zp.recommend_map_size(st["points"])["side"], True, False, timeout=300)
    print(tex["size"], tex["budget"])                 # budget["pass"] must be True
else:
    print("no UVs: hand the painted ZTL to scenario-zbrush-retopology-export (UV Master Work on Clone,"
          " Copy UVs, Paste UVs keeps polypaint), then run texture_from_polypaint")
# vertex color route (Pablo 01:49:50): OBJ with polypaint; check for #MRGB lines
obj = zl.call("zb_ops", "export_obj", OUT + "/head_vc.obj")
print("#MRGB" in open(obj["path"], errors="ignore").read(4_000_000))
```

Map rules: side from `recommend_map_size` (about 4M points per 2K), Flip V for other apps
(FlippedNormals 00:31:54), texture display off afterwards. Multi Map Exporter's Texture from
Polypaint (Map Border high, FlipV) runs in scenario-zbrush-retopology-export's map batch; Texture >
Substance Bridge > Send PolyPaint (2026.2) sends it as a fill layer (version deltas 3.7).

## P10. BPR presentation render

Live test: `live_p05_render_turntable.py` parts 1 and 5.

```python
# not yet run in ZBrush
zl.call("zb_ops", "save_ztl", OUT + "/head_paint.ztl")        # resizing clears the canvas
zp.remote("set_document_size", 1280, 720, timeout=60)          # tests (Pavlovich 00:29:27)
zp.remote("render_setup", True, True, True, None, None, False) # shadows, AO, perspective, no Redshift
test = zp.remote("bpr_render", OUT + "/bpr_test.png", True, timeout=300)
print(zp.render_checks(test["path"], final=False))             # framing, value span, clipping
zp.remote("set_document_size", 1920, 1080, timeout=60)         # final (Pavlovich 00:27:45)
final = zp.remote("bpr_render", OUT + "/bpr_final.png", False, timeout=600)
print(zp.render_checks(final["path"]))                         # plus noise at full size
```

Views: for a portfolio set, render front, three-quarter, profile and back with
`zp.remote("paint_views", OUT + "/beauty", views, "bpr")`, which frames every view the same way. For
print: pixels = inches x ppi (300 ppi); Pavlovich's 4 x 6 postcard is 3200 x 2133.

## P11. Passes and the composite

Live test: `live_p05` part 2 (pass thumbnails), `live_p03` (ID pass), offline blend tests.

```python
# not yet run in ZBrush
passes = {}
for name in ("shadow", "ao", "depth", "mask"):
    try:
        passes[name] = zp.remote("export_bpr_pass", name, OUT + f"/pass_{name}.png", True, timeout=60)["path"]
    except Exception as e:                        # a save dialog opened: stop, ping, fall back
        print(name, e); zl.ping(); break
# ID (clown) pass and subject mask without touching paint or polygroups
solo = zp.remote("subtool_solo_views", OUT + "/solo", "front", "flat", timeout=600)
idp = zp.id_pass([s["path"] for s in solo["solo"]], OUT + "/pass_id.png", OUT + "/pass_mask.png")
# composite (Pavlovich lEP73nEu3Tc: shadow and AO Multiply, rim Screen, masked to the subject)
MODES = {"shadow": ("multiply", 0.35), "ao": ("multiply", 0.4)}   # opacities are [added] starts
layers = [{"path": passes[k], "mode": m, "opacity": o, "mask_path": OUT + "/pass_mask.png"}
          for k, (m, o) in MODES.items() if k in passes]
zp.composite(OUT + "/bpr_final.png", layers, OUT + "/comp.png")   # then look at it next to the beauty
```

BPR light passes (Pavlovich 00:14:55): a black Basic material with Specular 84 and one light behind
gives a rim pass; build them only after the color is approved, on a saved ZTL, because M or MRGB
fills write the material onto the SubTools [added].

## P12. Redshift branch (only when Redshift is installed)

Live test: none yet (Redshift "uninstalled" in `mx1 product list`, 2026-09-24). Installing it needs
Emmanuel's consent.

```python
# not yet run in ZBrush
if not zl.run("result = bool(zbc.exists('Render:Redshift Renderer:Redshift'))"):
    raise SystemExit("no Redshift switch in this build: stay on BPR")
zp.remote_code("""
for key, val in (('redshift', 1), ('rs_denoise', 1), ('rs_error_threshold', 1.0)):
    p = zb_paint.resolve(key); zbc.set(p, val)
result = {k: zbc.get(zb_paint.resolve(k)) for k in ('redshift', 'rs_denoise', 'rs_error_threshold')}
""")                                                   # tests: Error Threshold 1 (Pavlovich 00:44:03)
t = zp.remote("bpr_render", OUT + "/rs_test.png", True, timeout=900)
# final: Error Threshold back to 0.01, full document size, Denoising on; polypaint needs a Redshift
# Polypaint material with Use Material Color 0 and a white Base; SSS Weight below 1 (doc Tips)
```

Also available once installed: Redshift Baker 360 (`rs_baker360`) to bake the lit look into
polypaint for hand-painted bases or color prints (Pavlovich mW4P0T6tR7k); judge it on Flat Color.

## P13. Turntable

Live test: `live_p05_render_turntable.py` parts 3 and 4.

```python
# not yet run in ZBrush
RULE = "maxon"                                         # or "plain": the rule live_p05 found upright
frames = []
for first in range(0, 36, 6):                          # short calls: 6 frames each
    r = zp.remote("turntable_frames", OUT + "/tt", 36, "bpr", RULE, 0.75, first, 6, timeout=900)
    frames += r["frames"]
print([zp.upright_score(f) for f in frames[:4]])       # with a top marker model only
zp.assemble_turntable(frames, OUT + "/turntable.mp4", fps=12)   # review: 36 frames = 3 s at 12 fps
# delivery [added]: n=180 (Movie > Turntable's default count) at fps=30 = 6 s, rendered in chunks
zp.assemble_turntable(frames[::2], OUT + "/turntable.gif", fps=6)
```

Frame counts and fps are [added] defaults (36 for review, 180 at 30 fps for delivery); Movie >
Turntable defaults to 180 frames (Pavlovich FvpG 00:19:56). Check every frame is upright and framed
the same (the math framing uses the full bbox, so the model never drifts).

## P14. Portfolio sheet

Live test: covered by the pieces above; sheet assembly offline (`zb_review.contact_sheet` tests in
the lead folder).

```python
# not yet run in ZBrush
prev = zp.remote("colorize_all", False)               # paint shows over any MatCap: hide it
grey = zb_review.review(OUT + "/sheet_grey")           # MatCap Gray form read, five views
zp.remote("colorize_all", False, prev)                 # each SubTool back to its own state
views = ("front", "threequarter", "right", "back")
beauty = zp.remote("paint_views", OUT + "/sheet_bpr", views, "bpr", timeout=900)["views"]
flat = zp.remote("paint_views", OUT + "/sheet_flat", views, "flat")["views"]
paths = [v["path"] for v in beauty] + [v["path"] for v in flat] + [OUT + "/pass_id.png"]
labels = [f"BPR {v['view']}" for v in beauty] + [f"albedo {v['view']}" for v in flat] + ["ID pass"]
zb_review.contact_sheet(paths, labels, OUT + "/portfolio_sheet.png", cols=4, title="Character | paint and render")
```

Keep grayscale form renders separate from color (Berger presents grayscale for anatomy approval,
character digest). Deliver the sheet, the turntable, the final beauty, the passes and the ZTL path.
