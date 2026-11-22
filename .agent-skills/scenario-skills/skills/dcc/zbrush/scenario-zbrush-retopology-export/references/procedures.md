# Procedures: retopology, projection, UVs, maps, scale, export, cleanup

Full bridge procedures for scenario-zbrush-retopology-export. Every ZBrush-side call goes through
`rx.zcall` (this skill's module) or `zb_launch.call("zb_ops", ...)` (the lead's), on ZBrush's main
thread. Every file is checked on the agent side.

**Status of everything on this page: not yet run in ZBrush.** The logic is tested offline:
`python3 tests/code/zbrush-retopology-export/run_offline.py` (88 tests, 0 failures on 2026-09-24,
results in `offline_results.json`): ZBrush-side wrappers against a multi-SubTool fake
(`rx_fake.py`), agent-side audits on generated fixtures and on the real 2026.2.1 OBJ of the lead's
v03 test, and a bridge round trip through the lead's real server module. `test_rx_grade_fixes.py`
covers the 2026-09-24 refactor after the blind grades Z4 and Z6. Each projection pass calls the
lead's `zb_ops.project_all`, the toolkit's safe reprojection: use it, do not re-implement it. The
live tests that will prove each procedure are named per section; run them with
`tests/code/zbrush-retopology-export/run_live.sh` only when this skill holds the ZBrush session.

Evidence tags used below: `[bridge]` proven through the bridge (lead tests v01 to v03), `[cmdxml]`
id listed in `ZData/ZLang/zcommands/commands.xml`, `[uistr]` label in
`ZData/ZLang/english/UInterface.zsc`, `[log]` written by ZBrush in the Activity log, `[obj]` read
from a ZBrush OBJ export, `[doc]` Maxon docs or SDK, `[verify]` unconfirmed.

## 0. Setup on the agent side

```python
import sys
sys.path.insert(0, "<project>/skills/scenario-zbrush-expert/scripts")
sys.path.insert(0, "<project>/skills/scenario-zbrush-retopology-export/scripts")
import zb_launch as zl, zb_audit, zb_review
import zb_retopology_export as rx

zl.start()                                   # lead skill: ZBrush with the bridge
state = rx.zcall("preflight", 180.0)         # target height in destination units
for f in state["flags"]:
    print(f)
zl.call("zb_ops", "save_ztl", "/abs/work/hero.ztl")   # hero_v001.ztl, never overwrites
```

`build_call_code` imports this module inside ZBrush with both toolkit folders on `sys.path` only
during the import and pops every `zb_*` module afterwards (shared-interpreter rule);
`test_rx_bridge.py` proves that on the lead's server code. Timeouts: ZRemesher, projection into
millions and MME take minutes; pass `timeout=900` or more, and ping before the next call after a
timeout (the queued code still runs).

## 1. Preflight (live_rx_01, live_rx_05)

`preflight(target_size, axis)` returns `stats`, `xyz_size`, per-axis sizes, `export` (Scale and
X/Y/Z Offset), symmetry state, the SubTool table and `names` (duplicates and unsafe names), plus
`flags`:

| Flag                                   | Why                                                             | Source                                |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| over 8M vertices                       | ZRemesher memory limit                                          | ZRemesher doc, High Polycounts        |
| XYZ Size outside 1 to 4                | DynaMesh resolution and dynamic brushes depend on internal size | Gallagher EXjfH_X2hkM 00:28:23        |
| Export Scale 0                         | never imported or set; exports are unitless nonsense            | Gallagher 00:24:03                    |
| names not unique or not `[A-Za-z0-9_]` | GoZ and Decimation Master pick the wrong SubTool                | GoZ doc, Restrictions; Decimation doc |

Renaming needs a text prompt the API cannot fill (lead skill): ask the sculpting skill or a human to
rename, or accept file names made from the SubTool index. XYZ Size out of range on a single simple
SubTool: `Tool:Deformation:Unify` (`zb_ops` key `unify`); on a character with layers or morph
targets use Gallagher's route: set Export Scale so the real size reads right, Save As, then SubTool
Master MultiAppend into a correctly scaled primitive (human: the plugin opens a file dialog
[verify]).

## 2. ZRemesher input (live_rx_02)

```python
inp = rx.zcall("remesh_input", "auto", max_points=2_000_000, timeout=900)
# {"source": 0, "copy": 1, "method": "level"|"dynamesh", "points_source", "points_copy", ...}
```

- `level`: duplicate, step down from the top level to the highest level under `max_points`, delete
  the other levels on the copy.
- `dynamesh`: duplicate, go to the top level, delete levels, DynaMesh at
  `resolution_for_points(area, max_points)`. The formula is calibrated on one point [added]: the v03
  radius-1 sphere at resolution 128 gave 43,480 points on area 4 pi, so points = 0.845 x area x (res
  / 2)^2 and a cell is about 2 / res internal units. DynaMesh resolution counts the scene's unit
  space, not the object (Gallagher 00:11:41; Pablo Logic Part 5).
- Decimation Master as the reducer (the ZRemesher doc's other option) is a plugin press:
  `rx.zcall("decimate_copy", target_points=1_500_000)` after testing the plugin once (section 10).
- The source is hidden afterwards, and stays the projection source. The copy lands below it (SubTool
  doc) [verify index].
- Holes: `remesh_input(..., fill_holes=True)` presses Close Holes then Fix Mesh on the level-less
  copy (ZRemesher doc, Workflow step 2 and Tips: small holes survive retopology and inflate the
  count; Close Holes needs a mesh without levels, Projection doc). Use it for unintended holes (scan
  and AI input, sculpting fallout, micro holes in a flat DynaMesh). It also fills intended openings,
  and the DynaMesh route closes them anyway, so the result carries `openings_closed`: the hole gate
  in section 4 expects 0 holes when it is True, else the intended openings (eye sockets, mouth bag,
  neck cut). Openings that must stay open after a fill are its polygroups: isolate, Del Hidden
  (Drust udiPVJIODX0 00:04:30; the isolation is a Ctrl+Shift click, human).
- Neutral face first: when the face will animate, the input must be neutral with folds relaxed; the
  expression is sculpted back on the new topology (Pavlovich n5 00:01:39 to 00:02:46), ideally on a
  3D layer that becomes a blend shape. If the sculpt carries a smile, hand it back to
  scenario-zbrush-character-creature for a neutral version (or turn its expression layer off) before
  `remesh_input`: ZRemesher follows the forms it sees.

## 3. Guides (live_rx_02 for the buttons; polygroup painting is human)

Deterministic group sources, in the order an agent should try them:

| Source           | Call                                                                                                                       | Good for                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| separate shells  | `zb_launch.call("zb_ops", "polygroups", "auto")`                                                                           | parts, fills, patches                       |
| hard edges       | `zb_ops.polygroups("normals")` after setting `Tool:Polygroups:MaxAngle` (Pavlovich used 45 for cylinder caps, n5 01:05:34) | hard surface (ZRemesher doc, Hard Surfaces) |
| color regions    | `rx.zcall("color_to_groups", tolerance=None)`                                                                              | textured or painted inputs [added]          |
| existing creases | `Tool:Geometry:ZRemesher:KeepCreases` via `zremesh(keep_creases=True)`                                                     | CAD, Live Boolean results                   |
| masks            | human: MaskLasso rings around eyes and mouth, Ctrl+W (Control+W on macOS)                                                  | faces (Pavlovich n5 00:04:20)               |

Then smooth the borders, so ZRemesher does not follow the stair steps (Pavlovich n5 00:07:48,
00:15:18):

```python
rx.zcall("polish_band", "groups", grow=1, value=10, passes=2)   # Mask By Feature (Groups), Grow, invert,
                                                                # Polish By Features, clear
rx.zcall("polish_band", "border", grow=1, value=10, passes=2)   # open borders of split ears or hands
```

Polish By Features with the "closed circle" curve keeps volume in Pavlovich's video; its switch has
no known path [verify]. Check with a Polyframe sheet (Line off shows only group colors):

```python
rx.zcall("set_polyframe", True)
sheet = zb_review.review("/abs/work/groups", views=("front", "right", "threequarter"))["sheet"]
rx.zcall("set_polyframe", False)
```

Masks a human drew (rings, a jaw line) become clean groups with support loops through
`Tool:Geometry:Edgeloop Masked Border` (`rx.P("edgeloop_masked")`, Drust IpTYcGxxsdM 00:05:08), then
Keep Groups.

Ears and hands on their own (Pavlovich n5 00:44:36 to 00:47:31, 00:58:36 to 01:04:17; retopology
digest 6.2):

```python
# the part is its own SubTool: Groups Split on a group made earlier, or Split Hidden after a
# human isolated it (Ctrl+Shift drag); names, not indices, afterwards
hand = rx.zcall("index_of", "hero_hand")
zl.run(f"zbc.select_subtool({hand})\nresult = zb_ops.stats()", ("zb_ops",))
rx.zcall("polish_band", "border", grow=1, value=10, passes=2)   # open-border polish: Mask By
                                                                # Feature Border, Grow, invert,
                                                                # Polish By Features
z = rx.zcall("zremesh", 2, False, adaptive_size=14, timeout=900)  # hand: Adaptive Size about 14
body = rx.zcall("index_of", "hero_body")                          # the part sits right below it
rx.zcall("merge_down_run", body, 1, weld=True, uv=False)          # MergeDown with Weld
# gate: rx.topo_report(export)["boundary_loops"] lost the seam loops (only intended openings left)
```

- Ear: ZRemesher Half repeatedly without groups, projecting after each pass (n5 00:45:42). Where
  borders do not match after the weld, a human stitches with ZModeler Stitch Two Points in a
  low-deformation area (00:47:31).
- Freeze Border keeps border vertices so separately remeshed parts re-weld exactly, "probably not
  great for animation" (01:03:44 to 01:04:17): remesh the whole limb to the wanted density first,
  then split and remesh each part with `zremesh(..., freeze_border=True)`, or the frozen border
  keeps a dense DynaMesh ring [added, retopology digest delta 9]. Freeze Border forces Adaptive
  Density: `expected_band(freeze_border=True)` is 0.5 to 2.0.

Curves (ZRemesherGuide brush) and polypaint density painting are strokes: a human, or the
stroke-free substitutes Frame Mesh from groups (`Stroke:Frame Mesh` with `Stroke:Polygroups` on,
Border and Creased edges off [cmdxml], then Curves Strength 100: Drust 8D-xqasgUws 00:03:41) and
polypaint fills on split parts (Pavlovich n5 01:02:05) [verify both].

## 4. ZRemesher, Retry, QA export (live_rx_02)

```python
zl.call("zb_ops", "save_ztl", "/abs/work/hero.ztl")                  # before anything destructive
z = rx.zcall("zremesh", 15, False, adaptive=True, adaptive_size=5, keep_groups=True,
             smooth_groups=0, timeout=900)
# {"faces_after", "ratio_to_target", "band", "in_band", "shrink", "snap_back", "symmetry", ...}
runs = [{"adaptive_size": 5, "faces_after": z["faces_after"]}]
for size in (0, 21):                                                  # Pavlovich's sweep, cached
    r = rx.zcall("retry", adaptive_size=size, timeout=900)
    runs.append({"adaptive_size": size, "faces_after": r["faces_after"]})
    zb_review.review(f"/abs/work/retry_{size}", views=("front", "right", "threequarter"))
# the sweep leaves the LAST variant (21) in the scene: pick, go back, prove it
pick = rx.pick_retry(runs, target_faces=15000, band=z["band"], choice=None)  # choice = the
                                                                   # value picked on the sheets
back = rx.zcall("retry", timeout=900, **pick["retry"])
assert rx.confirm_retry(pick, back["faces_after"]), (pick, back)
if z["snap_back"]:                                                    # ZRemesher shrank it
    rx.zcall("project_stack", inp["copy"], inp["source"], levels=0,
             checkpoint="/abs/work/hero_snap.ztl", timeout=900)
```

- `symmetric` is positional and required. True only when the subject is unposed and meant to be
  symmetric; ZRemesher then symmetrizes the topology even on asymmetric scan input (ZRemesher doc,
  Symmetry).
- Alt+ZRemesher (the alternative midline algorithm) is a modifier click and `zbc.press()` takes no
  modifier (SDK stub; `press_key` with modifiers is reported unreliable, version deltas 3.12): route
  it to a computer-use agent when the center line is poor. The script runs the normal variant,
  sheets nape and brow, asks for the Alt variant at the same target (Pavlovich compared at 1k and
  1.5k, n5 00:48:05 to 00:49:05), sheets again and compares
  `topo_report(...)["centre_line_components"]` and `symmetry_x_pct` for both.
- Same, Half and Double override a typed target (ZRemesher doc Reference; Pavlovich n5 00:16:26):
  `zremesh(mode=None)` switches all three off; `mode="half"` uses Half on purpose.
- Snap back: ZRemesher, Smooth Groups, density and smoothing passes all shrink the surface; project
  once at level 1 before judging it (Pavlovich n5 00:22:05, 01:03:12; retopology digest delta 7).
  `zremesh` returns `snap_back` when the extents shrank by more than 0.1 percent [added];
  `project_stack(..., levels=0)` is that pass.
- `mode="half"` for a second, lighter pass with `adaptive=False` (Drust R2MzFqWMaWY 00:01:44).
  "Retopology over a retopology" improves flow at the same count (ZRemesher doc Tips).
- `retry()` refuses Keep Groups, Keep Creases, Smooth Groups (they discard the cache, ZRemesher 4.0
  doc).
- Partial remesh (hide all but a region, Freeze Border on) deletes the subdivision levels (Drust
  0TlG4Ex9lQA 00:02:26) and forces Adaptive Density: use `freeze_levels()` around it when levels
  matter.

QA export and gate:

```python
rx.zcall("set_export_switches", quads=True, uvs=False, groups=True)   # Grp on for the QA copy only
qa = zl.call("zb_ops", "export_obj", "/abs/work/qa/low_groups.obj", overwrite=True)
rep = rx.topo_report(qa["path"], ring_groups=("eyelid_ring", "lip_ring"))
holes = 0 if inp["openings_closed"] else 3          # DynaMesh or Close Holes shut eyes and mouth
v = rx.retopo_verdict(rep, purpose="rig", target_faces=15000, band=z["band"],
                      ring_groups=("eyelid_ring", "lip_ring"), expected_holes=holes)
```

`topo_report` adds to `zb_audit.audit`: per-group faces, area density, interior poles, border loops
and the ring test of the distiller's `topo_qa.py` (a group whose border is two closed loops of equal
size, no pole inside, is a clean concentric strip; rows = faces / loop size), plus the center-line
chain. ZBrush writes one `g GroupN` line per polygroup with Grp on [obj: one group seen on the v03
export; several groups: verify]. Visual gate: Polyframe sheet with Line on, then
`references/critique.md` section 1.

Where the rings fail, the fix is manual: hide everything but the region, Del Hidden, and let a human
rebuild it with the Retopo brush on the ZRemesher mesh (answer "No" to convert it; never on a dense
sculpt: Pablo I4nePXDTrhQ 00:05:59). `references/gui-paths.md` lists the gestures. The script STOPS
here: save a versioned ZTL, write the request (regions, target loops, the sheet) into the report,
and resume at section 5 only after the human pass, re-running this gate on a new QA export.

## 5. Rebuild the subdivision stack (live_rx_02)

```python
ps = rx.zcall("project_stack", inp["copy"], inp["source"], top_ratio=0.5, dist=0.1,
              pa_blur=0.0, store_mt=True, color_last=False,
              checkpoint="/abs/work/hero_project.ztl", timeout=3600)
print(rx.projection_from_stack(ps))     # bbox 0.5 %, volume 2 %, level 1 unchanged, the gate of
                                        # every zb_ops.project_all pass, no export needed
# small subjects: compare OBJ exports instead (live_rx_02)
#   rx.projection_verdict(zb_audit.audit(source_obj), zb_audit.audit(top_obj), l1_before, l1_after)
rx.zcall("show_only", [inp["copy"], inp["source"]])
sheet = zb_review.review("/abs/work/projection")["sheet"]   # then hide the source, review again
```

Two orders, same gates:

| Order                 | Steps                                                                                                                                                                                              | Use when                                                                       | Source                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `per_level` (default) | Project All at level 1, then Divide + Project All per level; each pass stores a morph target at the current top (a Divide destroys it: Morph Targets doc), the last pass also makes the layer      | the usual rebuild                                                              | Drust R2MzFqWMaWY, _ips3GhWI0s; Maxon Transferring Detail |
| `top_first`           | all divisions, then at the TOP one morph target and one recording layer (`safety_nets`, or the first `zb_ops.project_all`), then Project All from level 1 up (`project_levels`) with the nets kept | danger zones to protect, film faces, one layer that holds the whole projection | FlippedNormals Zp07GW3rND0 00:02:13, 00:03:17             |

Every pass is the lead's `zb_ops.project_all`: a versioned checkpoint ZTL before it (Project All
"might crash the program", cgside; Python has no undo), so `checkpoint=` is required here too (a
path, saved as `_vNNN`; False only right after a save), exclusive visibility, Dist 0.1, and a gate
(point count kept, no vertex outside the visible bbox) whose problems land in `ps["pass_problems"]`
and fail `projection_from_stack`. Its `repair` text names the lead's `zb_ops.morph_repair(points)`
(Morph brush strokes back to the stored target) and `zb_ops.set_layer_intensity(v)`.

Danger zones: eyes, mouth, armpits, between the fingers, crotch: close surfaces grab the wrong one,
and artifacts left there become hard lines in the displacement map (FlippedNormals Zp07GW3rND0
00:01:41, 00:07:10, 00:07:43). Protect the eyes before projecting:

```python
ps = rx.zcall("project_stack", inp["copy"], inp["source"], order="top_first", stop_after="nets",
              checkpoint="/abs/work/hero_project.ztl", timeout=3600)  # divisions, nets at the top
# HUMAN or computer-use: Ctrl+Shift click the eye-interior polygroup on the target (isolates it)
rx.zcall("protect_isolated", grow=1)                     # Visibility Grow past the lid, MaskAll,
                                                         # show all (Zp07GW3rND0 00:05:31)
pl = rx.zcall("project_levels", inp["copy"], inp["source"], color_last=False, nets_done=True,
              checkpoint="/abs/work/hero_project.ztl", timeout=3600)
zl.call("zb_ops", "mask", "clear")
```

Masks block Divide ("Divide adds a level only when nothing is masked or hidden", Projection doc),
which is why the mask goes on after the divisions; `project_stack` raises when a Divide adds no
level instead of projecting on the wrong level. The mask state cannot be read (lead skill): the
sheet of the eyes is the check. Review every level zoomed on the danger zones (`zb_review.review`
with close-up views) before maps.

Repairs, in order: Dist first; busted regions go back to the morph target
(`zb_ops.morph_repair(points)`, scripted Morph-brush strokes over the area; or mask the rest and use
`Tool:Morph Target:Switch` or the Morph slider [verify]), never smoothing: "you're never gonna be
able to smooth these kind of things out properly" (Zp07GW3rND0 00:06:36); then a masked local
reprojection (mask the good part, Project All again: Drust nxMYYsyJt3o 00:06:09). A proper sculpting
pass after projection resculpts what was lost (00:08:22): hand it to the sculpting skill.

After the gate: `rx.zcall("drop_morph_target")` on every projected SubTool. Drust: ZBrush "is going
to take the highest subdivision level on your mesh and it's going to compare it to either a Morph
target or the subdivision level you currently have selected" (2zDAtaQqwh8 00:01:44), so a morph
target left from projection may become the map base [verify]; `mme_create_all` and the `bake_*`
functions refuse while one is stored (`allow_morph_target=True` overrides). DelMT is enabled only
while a morph target exists [verify, live_rx_02].

- Levels: `levels_needed(level1, source, top_ratio)`: each Divide is x4; 25k to a 12M source gives 4
  divisions at top_ratio 0.5 (6.4M) or 5 at 1.0 (25.6M). Drust divided until close to the source
  (R2MzFqWMaWY 00:02:16).
- `color_last=True` projects polypaint at the last level only (Drust _ips3GhWI0s 00:05:57), with
  Colorize turned on for source AND target before that pass ("Projected color missing: colorize must
  be on for source and target", PrFQXjs_6_w 00:16:35); `colorize_was` in the result lists the
  previous values. The Project "Color" switch is kept off before, to avoid the "target has no
  polypaint" note [verify that the switch governs Project All; if the note appears, a human answers
  No].
- Color from a different source (the raw copy of a scan or AI mesh, after the geometry came from the
  cleaned DynaMesh): `project_levels(target, raw, from_level=top, color_last=True, geometry=False)`
  turns the Project "Geometry" switch off for the pass [verify that Project All honors it].
  Fallback: StoreMT at the top, project, Morph Target Switch back to the stored shape (morph targets
  hold positions, not polypaint) [verify], DelMT.
- Artifacts (Drust nxMYYsyJt3o): Dist first; where the target sits inside the source, the morph
  target is the undo (Morph brush: human), then raise the target locally (mask the rest,
  `zb_ops.deform("Inflate", v)`) and reproject with the mask; large shape differences:
  `project_stack(..., shell=<value>)` sets ProjectionShell, Inner turns on, Dist goes to 1 (Gaboury
  pQbPtH0p5Bg 00:02:30 to 00:03:02). The threshold "until only the target shows" is visual: step the
  value and take snapshots.
- Existing stack whose base must change (ZModeler loops, DynaMesh, ZRemesher): `freeze_levels()`,
  edit the base, `freeze_levels()` again (Drust NrsuP4Vj4Lg; ZRemesher doc recipe 1). If level 1 is
  too coarse: set SDiv to the level with the right silhouette, `Tool:Geometry:Del Lower`, go up,
  then freeze.
- Project History (Ctrl-click on the Undo History bar) has no SDK call [verify]: the duplicate route
  above is the agent's.
- Delete the source only after the gate passes (ZRemesher doc); the agent hides it instead.

## 6. UVs (live_rx_03)

All at the lowest level (Gaboury cemmalvugFk 00:00:51). Set `Tool:UV Map:UV Map Size` and Border
first (4096 typical, 8192 max).

```python
# A. quick, one island, maps only: Auto Seams (Pavlovich cvqoVUX5aBw 00:02:12)
zl.call("zb_ops", "uv_unwrap", "native", auto_seams=True, symmetry=True, timeout=300)
# B. explicit seams on polygroup borders: UnCrease All, Crease PG, Creased Edges, Unwrap
rx.zcall("unwrap_creases", symmetry=True, from_polygroups=True, timeout=300)
# C. UV Master, painter-friendly islands, under 150k polygons at level 1
rx.zcall("uvmaster_roundtrip", symmetry=True, polygroups=True, attract_ao=True, timeout=600)
# check from the file
rx.zcall("set_export_switches", quads=True, uvs=True, groups=False)
ex = zl.call("zb_ops", "export_obj", "/abs/work/qa/uv.obj", overwrite=True)
u = rx.uv_report(ex["path"])            # bbox, UDIM tiles, islands, overlap %, flipped faces, texel CV
print(rx.uv_verdict(u, udim=False))
```

- Route B cuts exactly where the groups are, including bad choices: pelt-mapped hands and a circular
  tail need extra seams (ZModeler Crease Shortest Path, human; Pavlovich 00:05:26).
- Route C: `AttractFromAmbientOccl` [uistr] pulls seams into hidden areas without painting (UV
  Master doc). Protect and Attract painting is human (paint large areas; Protect counts from 70
  percent intensity; a closed protected ring forces a seam anyway). Control maps are bound to the
  Tool name (UV Master doc): Clear Control Maps only on a clone, it erases polypaint.
- UDIMs: Flatten rescales into 0 to 1, so ZBrush cannot lay out multi-tile UVs (UV Master doc). Lay
  out UDIMs in scenario-maya-retopology-uv or scenario-blender-uv-baking and bring the UVs back on
  the level-1 mesh [verify the import route], or give each SubTool its own tile with Tool > UV Map
  AdjU and ApplyAdj [verify].
- Relaxing UVs by polishing a flattened clone (Drust tl_FOvZOqHU) conflicts with the UV Master doc
  ("a common mistake is to use the Smooth brush"): mask the island borders first and check with a
  checker, or re-unwrap with Use Existing UV Seams.

## 7. Maps (live_rx_03)

MME presets live in `rx.MME_PRESETS` (tuple keys) and travel through the bridge as a preset name or
as `"group:label"` keys (`"main:FlipV"`, `"disp:Mid"`):

```python
zl.call("zb_ops", "save_ztl", "/abs/work/hero.ztl")                 # ESC during MME can lose UVs
m = rx.zcall("mme_create_all", "/abs/work/maps", "hero", settings="arnold", timeout=7200)
for f in m["files"]:
    info = rx.map_info(f"{m['dir']}/{f}")
    print(f, rx.map_verdict(info, "displacement", mid=0.5, bits=32, channels=1))
```

MME item paths are stored as `Zplugin:[Multi Map Exporter]:[Options]:[Displacement Map |]:Mid` in
the UI strings [uistr]. Labels such as Mid, SubDiv level, Adaptive, SmoothUV, 32Bit and exr repeat
across groups, so `mme_path` tries the grouped forms first and the short one last; `mme_set` returns
the path that took each value [verify which form resolves: live_rx_01]. `Create All Maps` opens a
save dialog; the name preset is expected to satisfy it [verify]. File names, the UDIM tile format
("UDIM", Mari 1001) and the dot before the tile number sit under Export Options > File names, a
sub-window [verify path]; FlippedNormals' tip: end names with ".1001" so they read as an image
sequence (-ThBTEc8L_M 00:13:50).

Single SubTool, no plugin:

```python
rx.zcall("bake_normal_map", "/abs/work/maps/hero_nm.png", level=1, tangent=True, flip_g=None)
rx.zcall("bake_displacement_map", "/abs/work/maps/hero_dm.tif", mid=0.5, scale=1.0, bits32=True)
```

The Tool palette Mid slider runs 0 to 100 (default 50), the MME Mid 0 to 1 (doc). SDK trap:
`zbc.create_normal_map(width, height, smooth=True, sub_poly=0, border=8, uv_tile=1000000, local_coordinates=False)`
defaults to WORLD space: pass `local_coordinates=True` for tangent maps, which is what games and
most renderers want (SDK stub; topology digest delta 13). `bake_normal_map` uses the Tool palette
with Tangent set explicitly; `map_verdict(..., "normal")` names the trap when a map's median is far
from (128, 128, 255). Displacement needs UVs and the lowest level (SDK stub). All bakes refuse while
a morph target is stored (section 5).

### Full per-target table (`rx.RENDERERS`)

| Target                        | ZBrush side                                                                                                                                                                                               | Receiving side                                                                                                                                                                                               | Source                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Maya + Arnold                 | MME Displacement, 32Bit + exr, 3 Channels off, Mid 0.5 (or 0), SubDiv level 1, Adaptive off, DpSubPix 0, SmoothUV on, Flip V on, UDIM names; OBJ level 1 Qud, Txr, Grp off, cm                            | File node Filter off, UV Tiling Mode UDIM (Mari); Arnold subdivision Catmull-Clark, about 3 iterations (ideally the ZBrush level count), Auto Bump on; Scalar Zero Value = Mid; Raw color space [added]      | FlippedNormals -ThBTEc8L_M 00:04:09 to 00:20:35 and its description correction |
| Redshift (Maya, C4D, Houdini) | 32Bit + exr, Mid 0, Scale 1                                                                                                                                                                               | tessellation and displacement on per object; with Mid 0.5 remap so 0.5 is zero [added, verify node fields]                                                                                                   | MME doc                                                                        |
| Unreal                        | no film displacement; low mesh triangulated as the engine will (Tri on export or in the DCC); decimated high for an external bake, or Substance Bridge Low & High                                         | normal DirectX (Y-): flip green for OpenGL maps [added]; bake 16-bit, reduce to 8-bit last; FBX from scenario-maya-expert or scenario-blender-expert, cm                                                     | Polycount (Triangulation, Workflow 16)                                         |
| Unity                         | as Unreal                                                                                                                                                                                                 | normal OpenGL (Y+) [added]; FBX Unity preset exists in the plugin [uistr]; meters                                                                                                                            | FBX doc                                                                        |
| Substance Painter             | Texture > Substance Bridge: Low & High, Auto-Bake, Smooth Normals, Texture Sets Per PolyGroup or Per Subtool, Force Auto-Unwrap off when UVs exist; ID map from MME Texture from Polypaint with Flip V on | every send is a new project; project normal format OpenGL by default [added]                                                                                                                                 | Substance Bridge doc, labels [uistr]; FlippedNormals p56N-dN11zY               |
| Blender (Cycles)              | 32Bit + exr, Mid 0.5 (or 0), SmoothUV on                                                                                                                                                                  | Displacement node Midlevel = Mid, Scale 1 times the unit ratio [added, verify with live_rx_04]; Displacement and Bump plus Subdivision modifier [added]; Normal Map node OPENGL (scenario-blender-uv-baking) | [added]                                                                        |
| 16-bit displacement, any      | Mid 0.5, Get Scale, take the lower value; 16Bit Scale on when maps merge                                                                                                                                  | shader Intensity from the file name                                                                                                                                                                          | MME doc                                                                        |
| Vector displacement           | vd Tangent for anything animated, World for static; 32-bit EXR; Create Diagnostic Files and set FlipAndSwitch per renderer                                                                                | GoZ does not carry VDMs                                                                                                                                                                                      | MME doc (its FlipAndSwitch numbers are for 2012 apps)                          |

Frequency split when the target supports both: displacement from level 1 (forms) plus a tangent
normal map from a higher level (micro detail) (Drust 2zDAtaQqwh8; MME doc). Game normals in the
engine's tangent basis come from an external baker: export the triangulated low and a decimated high
with matching names (`_low`, `_high`) and hand them to scenario-blender-uv-baking
(`bake_high_to_low`) or Painter [added: ZBrush bakes from its own levels in its own tangent space].

## 8. Map calibration fixture (live_rx_04)

The per-target table depends on two facts nobody wrote down for 2026.2.1: ZBrush's normal-map green
convention and V orientation, and whether 32-bit displacement values follow Export Scale. The
fixture settles both once per build:

1. `rx.zcall("import_mesh", ".../fixtures/plane_grid.obj")` (32 x 32 quads, u = x, v = y),
   `zb_ops.divide(3, smt=False)`.
2. Export the top level, push a dome up at UV (0.25, 0.75) OUTSIDE ZBrush on the same vertex order,
   import it back at the top level (export-modify-import keeps the order) [verify that Import
   replaces the level].
3. Bake with FlipG off and on: `rx.normal_orientation(png, (0.25, 0.75))` reports `flip_v_ok`,
   `looks_v_flipped` and `green` (upper half of the dome greener than 128 means OpenGL, Y+).
4. Bake 32-bit displacement at Export Scale 1 and 10: `rx.height_orientation` compares the dome
   heights (ratio 10 means the values follow Export Scale).

Record the result in this file and in `rx.RENDERERS` before trusting any "flip green" advice.

## 9. Scale, axes, names, export (live_rx_05)

```python
s = rx.zcall("set_export_scale", 180.0, axis=1, all_subtools=True, feet_on_ground=True)
# one Export Scale (target / union extent) and one set of offsets (x, z centered, y = -ymin, internal
# units) on EVERY SubTool
rx.zcall("set_export_switches", quads=True, uvs=True, groups=False, merge_uv=False)
files = rx.zcall("export_subtools", "/abs/out/maya", only_visible=True, level="lowest")
for f in files:
    h = rx.obj_header(f["path"])            # '#Auto scale x= y= z=' = the Export Scale applied [obj:
                                            # written by 2026.2.1 in the lead's v03 export]
    print(f["name"], h["auto_scale"], h["auto_offset"])
print(rx.scale_report(files[0]["path"], 180.0, unit="cm"))   # one part; check the union for all parts
```

- Destination units [added]: Maya and Unreal cm, Unity and Blender meters. ZBrush is Y-up like Maya;
  Blender's OBJ importer converts to Z-up; for Unreal and Unity convert in the DCC.
- The offset sign (`placement_offsets`: y = -ymin) follows Gallagher's "Y Offset 1 for a 2-unit
  model" (00:33:04); live_rx_05 confirms it from the exported bbox [verify].
- FBX: `Zplugin:FBX ExportImport:Export` raises "FBX Export Options". What is known: the window
  could not be suppressed from ZScript (Maxon forum), `set_next_filename` plus `press` still opened
  a dialog for one Python user on FBX import (forum), and Python export is [verify] (version deltas
  3.6, open checklist). On this Mac AppleScript System Events can click ZBrush dialogs (README "Side
  channels", Accessibility allowed), a possible route to confirm the window [verify]. Default agent
  route [added]: export OBJ, then scenario-maya-expert or scenario-blender-expert writes the FBX
  with the right axis, unit and triangulation. Human route: in the plugin pick the FBX version (2009
  to 2020 listed [uistr]), bin, Tris per target, SNormals on, axis preset (MayaYUp if in doubt,
  Unity, 3ds Max, Toolbag...), Export Polygroups as Mats for texture sets (FlippedNormals
  p56N-dN11zY 00:03:46).
- GoZ: `Tool:GoZ`, `Tool:All`, `Tool:Visible` [cmdxml]; the first press opens an app chooser (human
  once), names must be unique and space-free across all loaded Tools, and GoZ sends the lowest level
  (GoZ doc). Maya 2026 and 2027 targets on macOS (version deltas).
- Import side (other apps into ZBrush): Weld and Tri2Quad sliders [cmdxml];
  `Preferences:ImportExport:iSwitchYZ` and `eSwitchYZ` exist for Z-up data [cmdxml] [verify
  semantics]; prefer `rx.obj_transform` on the file.
- OBJ Mrg is "Merge Uv Cords" and Grp "Export Sub Groups" per the 2026.2.1 help strings [uistr]; Grp
  on splits the mesh in Maya (FlippedNormals -ThBTEc8L_M 00:15:08).
- STL and print sizing belong to scenario-zbrush-pose-print (3D Print Hub).

## 10. Decimation (live_rx_07, last in a run)

```python
d = rx.zcall("decimate_copy", target_points=150_000, keep_uvs=True, keep_polypaint=True, timeout=900)
g = rx.zcall("decimate_keep_groups", 25, timeout=900)     # Unweld Groups Border, Freeze borders,
                                                            # decimate, Auto Groups, WeldPoints
```

- Never the master (Decimation doc; Polycount: decimate the high before exporting it for a bake).
- `% of decimation` keeps that percentage (`percent_for_target`); the plugin also shows k Points and
  k Polys switches and presets 20k, 35k, 75k, 150k, 250k and Custom [uistr]. Pre-process again after
  any edit, mask or level change (doc). Unique SubTool names (doc).
- Decimation Master and UV Master are ZScript plugins; a ZScript that pressed them lost control
  (ZBrushCentral). Test each once through the bridge with a checkpoint saved; `run_live.sh` runs
  them last.

## 11. Generated or scanned mesh to a clean sculpt (Z6, live_rx_06)

v2 after the Z6 grade, which found four defects in the v1 code: the orientation branch rotated any
off-center mesh and imported a file that might not exist; the Retry sweep kept the last variant; an
index taken before Split To Parts pointed at a part afterwards; and Colorize was left off, so the
color pass would move nothing. It also flagged MergeVisible (a new Tool) where Drust merges down
inside the Tool.

```python
# agent side, before ZBrush
conv = rx.glb_to_obj("/abs/in/creature.glb", "/abs/work/creature.obj")    # scenario-3d download
tri = rx.triage_ai_mesh(conv["obj"], expected_parts=6)
print("\n".join(tri["plan"]))
ori = rx.orient_for_import(conv["obj"], tri, "/abs/work/creature_fixed.obj")
# rotates -90 about X ONLY for a Z-up hint (glTF is Y-up), centers ONLY when off-center,
# and ori["import"] is the file that exists: the original when nothing was needed

# in ZBrush
rx.zcall("import_mesh", ori["import"], weld=None, tri2quad=None)   # Tri2Quad: quads from the
                                                                   # AI triangles [verify range]
zl.call("zb_ops", "save_ztl", "/abs/work/creature_raw.ztl")
zl.call("zb_ops", "export_obj", "/abs/work/qa/raw.obj", overwrite=True)    # the raw reference
dup = rx.zcall("duplicate_keep")                     # {"work": {...}, "copy": {...}}
RAW = dup["copy"]["name"]                            # form and color source, kept BY NAME
rx.zcall("set_visible", dup["copy"]["index"], False)
rx.zcall("fix_mesh")
parts = rx.zcall("split_parts")                      # Auto Groups, Split To Parts: renumbers
rx.zcall("hide_small_parts", 0.005, protect_names=[RAW])    # floating junk, raw copy protected
# fused parts that differ in color: rx.zcall("color_to_groups"); then Tool:SubTool:Groups Split
# parts of one body: MergeDown inside the Tool (they sit together at the top after the split)
body_parts = 4                                       # from the table in `parts`
rx.zcall("merge_down_run", 0, body_parts - 1, weld=False)   # parts must be adjacent: MergeDown
                                                   # takes the SubTool right below, hidden or
                                                   # not [verify]; else merge_into(body, names)
res = rx.dynamesh_resolution_for(0.12, cells=8)      # thinnest part, internal units
rx.zcall("dynamesh_keep", res, keep="groups", timeout=900)   # polypaint OFF at the press
# residual holes: plugs placed from the file, then MergeDown and re-DynaMesh
q = zl.call("zb_ops", "export_obj", "/abs/work/qa/dyn.obj", overwrite=True)
BODY = rx.zcall("subtool_table", with_counts=False)[0]["name"]
for h in rx.hole_plugs(q["path"])[:4]:
    pl = rx.zcall("plug_hole", h["center"], h["diameter"])  # appended LAST
    plug = rx.zcall("subtool_table", with_counts=False)[pl["index"]]["name"]
    rx.zcall("merge_into", BODY, [plug])                    # MoveUp under the body, MergeDown
rx.zcall("dynamesh_keep", res, keep="groups", timeout=900)
zl.call("zb_ops", "polish", 10)
clean = zl.call("zb_ops", "export_obj", "/abs/work/qa/clean.obj", overwrite=True)
v = rx.cleanup_verdict(zb_audit.audit("/abs/work/qa/raw.obj"), zb_audit.audit(clean["path"]),
                       expected_shells=1, raw_rough=rx.roughness("/abs/work/qa/raw.obj"),
                       clean_rough=rx.roughness(clean["path"]))
rx.zcall("set_display", double=True, colorize=False)   # for the sheet only; returns colorize_was
sheet = zb_review.review("/abs/work/clean_review")["sheet"]               # six views, MatCap Gray
# then sections 2 to 5 on the cleaned DynaMesh: remesh_input("level") duplicates it as is,
# zremesh, snap back if asked, project_stack(copy, cleaned) for geometry, and finally color
# only from the raw copy at the top level:
#   raw = rx.zcall("index_of", RAW)
#   rx.zcall("project_levels", copy, raw, from_level=top, color_last=True, geometry=False,
#            checkpoint="/abs/work/creature_colour.ztl")
```

Details and choices:

- Polypaint versus polygroups: with the SubTool's polypaint on (Colorize, its brush icon in the
  SubTool list), DynaMesh keeps polypaint INSTEAD of polygroups (DynaMesh doc, "PolyGroups >
  Important"); with it off the paint is gone (Pavlovich 8kWFv1cZlCE 00:20:06).
  scenario-zbrush-sculpting owns the general rule; in this path the default is `keep="groups"`: the
  part groups (Auto Groups, From Polypaint) steer the later ZRemesher and color returns by
  projection from the raw copy, which keeps its paint. `keep="polypaint"` only when no groups are
  needed and no raw copy exists. `glb_to_obj` writes `#MRGB` polypaint, so an imported AI mesh
  arrives with polypaint on.
- Color: `glb_to_obj` writes ZBrush `#MRGB` polypaint from COLOR_0 or from the baseColor texture
  sampled per vertex; `import_mesh` clears the mask because the mask byte of `#MRGB` is [verify]. A
  texture-only mesh imported with UVs needs Polypaint From Texture before any DynaMesh, which
  deletes UVs (DynaMesh doc; subdivide to about texture resolution first).
- Inspection toggles: Colorize off, Double on for the sheet (Drust PrFQXjs_6_w 00:00:09, 00:03:26),
  then back: `set_display` returns `colorize_was`. The color pass turns Colorize on for both
  SubTools itself.
- Holes: `close_holes` needs a level-less SubTool; every fill gets its own polygroup, the handle to
  delete fills that must stay open (group, isolate, Del Hidden: Drust udiPVJIODX0 00:04:30). A
  dome-shaped fill across a thin shell is the swiss-cheese warning: give thickness first. Drust
  pushes the fill back with the Transpose line (human); stroke-free substitutes are DynaMesh Create
  Shell with Thickness [cmdxml] or `zb_ops.deform("Inflate", v)` on a masked copy [verify].
- Plugs: Drust appends a PolySphere, Unifies it, places it by hand and merges it down before a
  re-DynaMesh (PrFQXjs_6_w 00:07:16 to 00:10:33). The SDK cannot read vertices, the exported file
  can: `hole_plugs` turns each boundary loop into a center and diameter in internal units (through
  `#Auto scale` and `#Auto offset`), `plug_hole` appends a primitive and sets Tool > Geometry X/Y/Z
  Position and XYZ Size [cmdxml] (primitives placed without brushes, as in Pablo's blockout,
  gitoJ7B8FmY 00:05:26). The appended SubTool lands last: `merge_into(body, [plug])` moves it right
  below the body with Tool > SubTool MoveUp [cmdxml] and merges down once; MergeDown may show a note
  (Drust answered "Always OK") [verify].
- Resolution: start where the thinnest part gets about 8 cells [added]; Drust used 512 on a unified
  scan and dropped to 128 (about 50k points) to keep only the silhouette before dividing to about 3M
  and projecting back (PrFQXjs_6_w 00:14:58 to 00:17:42).
- Snap back: after the ZRemesher pass on the cleaned DynaMesh,
  `project_stack(copy, cleaned, levels=0)` restores the volume before the topology is judged; after
  Polish passes on the DynaMesh itself the volume gate (`cleanup_verdict`) is the check, since the
  only source is the noisy raw mesh.
- Texture detail into geometry: Mask By Intensity from polypaint, then a little Inflate on the
  unmasked part (Drust PrFQXjs_6_w 00:19:21): `Tool:Masking:Mask By Intensity` [cmdxml] then
  `zb_ops.deform("Inflate", v)`.
- Symmetric designs: Mirror And Weld on the DynaMesh (`zb_ops` key `mirror_weld`), then ZRemesher
  with symmetry on.
- Separation of fused parts without color: scenario-3d part segmentation upstream [added], else
  straight SliceCurve cuts (Ctrl+Shift, SliceCurve, a line: human) then Groups Split, then Close
  Holes per part.
- Local rebuilds of a fused or damaged region: Sculptris Pro on a mesh without levels, instead of
  raising the whole DynaMesh (DynaMesh and Sculptris Pro doc, "Refinement"; Pablo VRisbJQAaZw
  00:10:41): the sculpting skill's tool.
- Level discipline on the rebuilt stack when handing over: big corrections at SDiv 1, secondary
  forms at SDiv 2 to 3, never detail only at the top (Pablo rArw79xEpvE 00:12:28 to 00:14:16).
- Judge the result with `references/critique.md` section 6 before any detail pass; hand the forms to
  scenario-zbrush-sculpting.

## 12. Z4 end to end: 12M character to Maya and a game engine

```python
state = rx.zcall("preflight", 180.0)                                  # 1 flags, names, scale
zl.call("zb_ops", "save_ztl", "/abs/work/hero.ztl")
# neutral face? if the sculpt smiles, scenario-zbrush-character-creature neutralizes it first (section 2)
inp = rx.zcall("remesh_input", "auto", max_points=1_500_000, fill_holes=False,
               timeout=1800)                                          # 2 under 8M; eye sockets
                                                                      # and mouth stay open
# 3 groups: human rings around eyes and mouth if the face deforms; buttons for the rest;
#   ears and hands split and remeshed on their own (section 3)
rx.zcall("polish_band", "groups")
z = rx.zcall("zremesh", 15, False, keep_groups=True, smooth_groups=0, timeout=1800)  # 4 posed? False
runs = []
for size in (0, 5, 21):                                               # sheets per variant
    r = rx.zcall("retry", adaptive_size=size, timeout=1800)
    runs.append({"adaptive_size": size, "faces_after": r["faces_after"]})
pick = rx.pick_retry(runs, target_faces=15000, band=z["band"])        # or choice= from the sheets
back = rx.zcall("retry", timeout=1800, **pick["retry"])
assert rx.confirm_retry(pick, back["faces_after"])
if z["snap_back"]:
    rx.zcall("project_stack", inp["copy"], inp["source"], levels=0,
             checkpoint="/abs/work/hero_snap.ztl", timeout=1800)
# gate: in band, topo_report + retopo_verdict(purpose="rig",
#       expected_holes=0 if inp["openings_closed"] else 3), Polyframe sheet.
# STOP if rings fail: human Retopo pass (section 4), then re-run the gate
rx.zcall("unwrap_creases")            # 5 UVs at level 1 before levels (or "uvmaster_roundtrip")
ps = rx.zcall("project_stack", inp["copy"], inp["source"], top_ratio=0.5, order="top_first",
              stop_after="nets", checkpoint="/abs/work/hero_project.ztl",
              timeout=7200)                                            # 6 film face: protect eyes
# HUMAN: isolate the eye-interior group; then
rx.zcall("protect_isolated", grow=1)
pl = rx.zcall("project_levels", inp["copy"], inp["source"], nets_done=True,
              checkpoint="/abs/work/hero_project.ztl", timeout=7200)
zl.call("zb_ops", "mask", "clear")
# gate: projection verdict from exports or stack numbers, danger-zone close-ups per level
rx.zcall("drop_morph_target")                                         # before any bake
m = rx.zcall("mme_create_all", "/abs/out/maps", "hero", settings="arnold", timeout=7200)  # 7 film
rx.zcall("set_export_scale", 180.0, axis=1)                           # 8 cm for Maya, all SubTools
rx.zcall("set_export_switches", quads=True, uvs=True, groups=False)
maya = rx.zcall("export_subtools", "/abs/out/maya", level="lowest")   # body and eyes, level 1
# game: a triangulated copy of level 1 plus a decimated high for scenario-blender-uv-baking
rx.zcall("set_export_switches", quads=False, uvs=True, groups=False)
game = rx.zcall("export_subtools", "/abs/out/game", level="lowest", suffix="_low")
rx.zcall("decimate_copy", target_points=2_000_000, keep_uvs=False, timeout=1800)
rx.handoff_report("/abs/out/handoff.json", target="arnold", meshes=[f["path"] for f in maya],
                  maps=m["files"], unit="cm", axis="Y-up", export_scale=None,
                  displacement={"mid": 0.5, "scale": 1.0, "bits": 32}, normal="tangent OpenGL",
                  not_verified=["MME UDIM file names", "normal green convention (live_rx_04)",
                                "morph target as map base (drop_morph_target)"])
```

UVs can go before or after the stack: made at level 1 they carry through the levels (Gaboury
cemmalvugFk 00:03:30); the retopology digest's Route A makes them on the level-1 target before
projecting, Drust makes them on the rebuilt stack's level 1 (_ips3GhWI0s 00:07:03). The eyes keep
their own simple topology and UVs and are exported as separate OBJs; maps for them only if the
lookdev asks [added]. The per_level order (`project_stack(copy, source, top_ratio=0.5)` in one call)
is the simpler route when no zone needs a mask.

## 13. Item paths this module adds (evidence)

| Key                                                                                                             | Path tried first                                                                                            | Evidence                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| close_holes, del_hidden, weld_points, unweld_groups                                                             | `Tool:Geometry:Modify Topology:<label>` then `Tool:Geometry:<label>`                                        | [cmdxml] short forms `Close Holes`, `Del Hidden`, `WeldPoints`, `Unweld Groups Border` |
| check_mesh, fix_mesh                                                                                            | `Tool:Geometry:Mesh Integrity:<label>`                                                                      | [cmdxml] `Check Mesh Integrity`, `Fix Mesh`                                            |
| freeze_sdiv, reconstruct                                                                                        | `Tool:Geometry:Freeze SubDivision Levels`, `Reconstruct Subdiv`                                             | [cmdxml]                                                                               |
| zr_retry, zr_keep_polypaint                                                                                     | `Tool:Geometry:ZRemesher:Retry`, `KeepPolypaint`                                                            | [uistr] only                                                                           |
| zr_freeze_border, zr_smooth_groups, zr_curves_strength, zr_use_polypaint, zr_color_density, zr_legacy           | `Tool:Geometry:ZRemesher:<label>`                                                                           | [cmdxml] short forms, [uistr]                                                          |
| split_parts, split_hidden, groups_split, merge_down, merge_visible                                              | `Tool:SubTool:Split:...`, `Tool:SubTool:Merge:...`                                                          | [cmdxml] short forms                                                                   |
| project_history, proj_shell, proj_farthest, proj_outer, proj_inner, proj_geometry, proj_color, reproject_higher | `Tool:SubTool:Project:<label>`                                                                              | [cmdxml] `Tool:SubTool:ProjectAll` etc.                                                |
| uv_creased_edges, uv_crease_seams                                                                               | `Tool:UV Map:Create (Unwrap):Creased Edges`                                                                 | [uistr] label; group form as in the proven `...:Create (Unwrap):Unwrap` [bridge]       |
| uvm_copy, uvm_paste, uvm_ao_attract, uvm_check_seams, uvm_flatten                                               | `Zplugin:UV Master:<label>`                                                                                 | [uistr] `Copy UVs`, `Paste UVs`, `AttractFromAmbientOccl`, `CheckSeams`                |
| nm__, dm__                                                                                                      | `Tool:Normal Map:<label>`, `Tool:Displacement Map:<label>`                                                  | [cmdxml]                                                                               |
| exp__, imp__                                                                                                    | `Tool:Export:Qud/Tri/Txr/Flp/Mrg/Grp/Smooth Normals/Scale/X Offset...`, `Tool:Import:Mrg/Add/Tri2Quad/Weld` | [cmdxml]                                                                               |
| dmx_freeze_borders, dmx_keep_polypaint, dmx_k_points                                                            | `Zplugin:Decimation Master:Freeze borders` (lower-case b), `Use and Keep Polypaint`, `k Points`             | [uistr]                                                                                |
| sb_*                                                                                                            | `Texture:Substance Bridge:Send to Painter`, `Low & High`, `Auto-Bake`, `Force Auto-Unwrap`                  | [uistr]                                                                                |
| fbx_*                                                                                                           | `Zplugin:FBX ExportImport:Export`, `MayaYUp`, `Unity`, `Tris`, `SNormals`                                   | [uistr]; FBX 2009 to 2020 listed                                                       |
| polyframe                                                                                                       | `Transform:PolyF`, then `Transform:Pf`                                                                      | [cmdxml] id `Transform: Pf`                                                            |
| macro_delete                                                                                                    | `Macro:Delete` (answers the confirmation with IKeyPress '2')                                                | [macro] shipped `ZData/Macros/Delete.TXT` [verify press from Python]                   |

| del_mt, layer_new | `Tool:Morph Target:DelMT`, `Tool:Layers:New` | [cmdxml]; DelMT enabled only
with a morph target [verify] | | (zb_ops) append, x_pos, y_pos, z_pos, xyz_size, vis_grow, vis_show,
mask_all | `Tool:SubTool:Append` then `PopUp:<primitive>`, `Tool:Geometry:X Position` ...,
`Tool:Geometry:XYZ Size`, `Tool:Visibility:Grow`, `Tool:Visibility:ShowPt`, `Tool:Masking:MaskAll` |
[cmdxml] for the Tool items; PopUp names from the shipped macros [verify] |

`probe_paths()` checks every candidate (and the MME grouped forms) with `exists()`; live_rx_01
records the forms that resolve. Both the grouped form (`Tool:Geometry:Modify Topology:Close Holes`)
and the commands.xml id (`Tool:Geometry:Close Holes`) are tried, never assumed: the lead's DynaMesh
calls with grouped paths worked through the bridge and ZBrush logged the short form (zb_ops,
Activity log), and `set()` on a missing path is silent, so every wrapper resolves with `exists()`
first. SubTool indices are never cached across Duplicate, Split, MergeDown or Append:
`index_of(name)` (SDK `locate_subtool_by_name`, table fallback).

## 14. Tests

| File                            | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Status                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `test_rx_zbrush_side.py`        | guards, read-backs, press order, numbers of every ZBrush-side wrapper against `rx_fake.py`                                                                                                                                                                                                                                                                                                                                                                                                                                                       | offline, pass         |
| `test_rx_agent.py`              | topology, rings, UVs, scale, maps (EXR header without libraries, OpenCV values, 16-bit TIFF, normal orientation), GLB conversion, triage, cleanup verdict, targets, on fixtures and the real v03 export                                                                                                                                                                                                                                                                                                                                          | offline, pass         |
| `test_rx_bridge.py`             | `zcall` through the lead's real server module and `zb_launch.run`, module hygiene                                                                                                                                                                                                                                                                                                                                                                                                                                                                | offline, pass         |
| `test_rx_grade_fixes.py`        | the Z4 and Z6 grade fixes: fill_holes and openings_closed, snap_back, pick_retry and confirm_retry, checkpoint required, per_level nets per pass and one layer, top_first order with one set of nets and protection, Divide blocked by a mask, Colorize on both for color, color-only pass with Geometry off, bakes refusing a morph target, dynamesh_keep, merge_down_run, merge_into and move_subtool, index_of after a split, duplicate_keep, plug_hole, orient_for_import branches, hole_plugs in internal units, the SDK normal-map message | offline, pass         |
| `live_rx_01_paths.py`           | every path candidate, Polyframe label, Legacy and Retry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | not yet run in ZBrush |
| `live_rx_02_remesh_project.py`  | remesh_input, zremesh bands (Adapt on/off), Retry sweep and return (pick_retry), project_stack per_level and top_first, morph target detection and DelMT, projection verdict                                                                                                                                                                                                                                                                                                                                                                     | not yet run in ZBrush |
| `live_rx_03_uv_maps.py`         | native, crease and UV Master UVs, Tool palette bakes, MME Arnold preset                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | not yet run in ZBrush |
| `live_rx_04_map_orientation.py` | normal green and V orientation, displacement units vs Export Scale                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | not yet run in ZBrush |
| `live_rx_05_export_scale.py`    | Export Scale and offsets on all SubTools, header, bbox, Grp, Tri                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | not yet run in ZBrush |
| `live_rx_06_ai_cleanup.py`      | the Z6 path v2 on `fixtures/ai_creature.obj`: orient_for_import, duplicate_keep and index_of, merge_down_run, dynamesh_keep, hole plugs, snap back, color-only pass                                                                                                                                                                                                                                                                                                                                                                              | not yet run in ZBrush |
| `live_rx_07_decimate_groups.py` | decimate_copy, decimate_keep_groups                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | not yet run in ZBrush |
