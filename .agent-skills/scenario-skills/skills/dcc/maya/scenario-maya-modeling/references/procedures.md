# Procedures: scenario-maya-modeling (maya.cmds, OpenMaya 2.0, mx_modeling)

**Status of every Maya call below: not yet run in Maya** (Maya 2027 was not installed when this was
written, 2026-09-24). "Verified on Maya 2027.x" lines read **pending** until
`tests/code/maya-modeling/run_all.sh` has run; then replace them with the version from the result
JSON. What did run: the pure-Python layer of `scripts/mx_modeling.py` (geometry math, fans, splits,
weighted normals, balance, quad-cylinder generator, bend metrics, and since the refactor pass the
cage review, shell volumes, quad folds and diagonal choice, component parsing and topology keys)
with python3 3.14 in `test_mm_offline.py`, and the Maya-layer data plumbing against fake `maya.cmds`
/ OpenMaya in `test_mm_fakes.py`; both passed on 2026-09-24. The Maya job for the refactor additions
is `test_mm_cage.py` (not yet run in Maya). Flags marked [verify] are recorded by the Maya tests
(help text, attribute maps) so the fix is one read of the JSON.

Rules from scenario-maya-expert apply to all of it: selection-free, explicit node names, capture
creation returns, long names, cm and Y up, new saved version per stage, never over the source.

## P0. Imports and execution

```python
import sys
SKILLS = "skills"      # adjust
sys.path[:0] = [SKILLS + "/scenario-maya-modeling/scripts", SKILLS + "/scenario-maya-expert/scripts"]
import maya.cmds as cmds
import mx_audit, mx_validate, mx_review, mx_modeling as MM
```

Headless: write the stage as a job with `main(argv)` and run it through `mx_run` (one mayapy child
per job, `MX_RESULT` on the last line, `--save-as` a new version):

```bash
python3 "$SKILLS/scenario-maya-expert/scripts/mx_run.py" --scene crate_model_v002.ma --save-as crate_model_v003.ma \
  --plugins mtoa --timeout 900 stage_bevel.py -- --width-cm 0.4
```

GUI: the same code through `mx_bridge.Bridge().run(code)`; one call is one undo chunk, except
OpenMaya writes (`MM.weighted_normals` default, `MM.mirror_merge` snapping,
`MM.build_quad_cylinder`), which are not undoable: save first.

## P1. Session record and brief in numbers

```python
def session_record(brief):
    """brief: dict you fill from the request; defaults written down, never implied."""
    cmds.currentUnit(linear="cm")                 # new files reset to cm (Maya 2027 Help); convert, do not rescale
    cmds.upAxis(axis="y")
    rec = {"maya": cmds.about(version=True),      # Smart Bevel output differs 2027.0 / .1 / .2
           "api": cmds.about(apiVersion=True), "units": "cm", "up": "y"}
    rec.update(brief)
    return rec

rec = session_record({"asset": "crate", "destination": "game", "engine": "unreal",
                      "size_cm": (60, 40, 40), "texture": 2048, "texel_px_per_cm": 10.24,
                      "tri_budget": None,          # None = not given: report, and ask the lead
                      "deforms": False, "camera": "mid-ground prop, player can walk up to it [assumption]"})
```

Test: every job logs `maya`, `api`, `python` through `_mm_job.start()`. Verified on Maya 2027.x:
pending.

## P2. Blockout at real size, grounded, pivot per convention

```python
body = cmds.polyCube(name="crate_body_geo", width=60, height=40, depth=40)[0]   # capture the return
cmds.xform(body, worldSpace=True, translation=(0, 20, 0))       # stand on the grid
cmds.xform(body, worldSpace=True, pivots=(0, 0, 0))             # base center = world origin
cmds.makeIdentity(body, apply=True, translate=True, rotate=True, scale=True, normal=0)
cmds.delete(body, constructionHistory=True)
assert all(abs(a - b) < 1e-4 for a, b in zip(cmds.exactWorldBoundingBox(body), (-30, 0, -20, 30, 40, 20)))
```

Pivot convention: base center at the origin by default for props; a corner at the origin if the
level team snaps props to the grid by corner (Epic: the export origin is the pivot, "often at a
corner"); film: object or world center, consistently (FlippedNormals [00:21:22]). Primitives for
organic blocking (antCGi [00:05:28]): `cmds.polyCylinder(subdivisionsAxis=12, subdivisionsHeight=8)`
torso, `8 x 6` limbs, `cmds.polySphere(subdivisionsAxis=6, subdivisionsHeight=6)` chest; delete the
caps, delete history per object, then freeze. Gate: `mx_audit.audit(body)["transform"]` frozen and
`pivot_at_origin`; `mx_review.review([...], out, modes=("silhouette", "clay"))` next to a reference.
Test: `test_mm_build.py` (P2 checks). Verified on Maya 2027.x: pending.

## P3. Offset before cutting, recess, and the empty-extrude trap

```python
def faces_facing(mesh, direction, min_dot=0.999):
    d = MM.mesh_data(mesh)
    normals, areas = MM.face_normals_areas(d["faces"], d["points"])
    ids = [f for f, n in enumerate(normals) if MM._dot(n, direction) >= min_dot]
    return sorted(ids, key=lambda f: -areas[f])                   # largest first

panel = cmds.polyCube(name="panel_geo", width=40, height=4, depth=40)[0]
cmds.delete(panel, constructionHistory=True)
top = faces_facing(panel, (0, 1, 0))[0]
ring = MM.extrude("%s.f[%d]" % (panel, top), offset_cm=3.0)        # offset ring = the support loop
inner = faces_facing(panel, (0, 1, 0))[0]                          # the inset face is the largest top face
recess = MM.extrude("%s.f[%d]" % (panel, inner), depth_cm=-1.0)   # push the panel in
assert ring["ok"] and recess["ok"]                                 # no zero-length edges, no lamina faces
cmds.delete(panel, constructionHistory=True)
```

`MM.extrude` raises on `offset_cm == depth_cm == 0`: Mario's empty extrude leaves double faces that
show only in smooth preview and make a loop "suddenly stop" [00:39:22]. If a raw `polyExtrudeFacet`
was used, `mx_audit` catches it as zero-length edges and zero-area faces, and
`MM.coincident_vertices(mesh)["connected_pairs"]` counts the doubled points. Inner support loop of
an opening: a second small offset extrude of the recess floor (Mario [00:42:42]). Underlying call:
`cmds.polyExtrudeFacet(faces, offset=o, localTranslateZ=d, thickness=0, divisions=1, keepFacesTogether=True)`.
Test: `test_mm_build.py` (P3 checks). Verified on Maya 2027.x: pending.

## P4. Cylinders: side count in quarters, quad caps

```python
cut_angles = [0, 45, 90]                                   # angles (deg, around the axis) of edges a cut must meet
best = MM.cylinder_sides_for(cut_angles)[0]["sides"]       # 24 here; 32 ties at a higher density
bolt = MM.build_quad_cylinder("crate_bolt01_geo", radius_cm=1.0, height_cm=0.6, sides=best,
                              height_divisions=1, ring=True)
cmds.xform(bolt["transform"], worldSpace=True, rotation=(90, 0, 0), translation=(-25, 30, 20.3))
cmds.makeIdentity(bolt["transform"], apply=True, translate=True, rotate=True, scale=True, normal=0)
```

Why: Maya's `polyCylinder` caps are triangle fans with a valence-N pole (Mario frame 01:12:18; OSD:
high valence poles cause waviness); the generator builds an n x n quad grid per cap plus one ring,
so the only poles are 8 valence-3 vertices inside the flat caps (offline test: all quads, closed,
consistent winding, Euler 2, 8 poles, for 8 to 32 sides). Add length only as ring loops
(`cmds.polySplitRing(ring_edges, splitType=2, divisions=n)` [verify]); more radial density only by
smoothing once or rebuilding with more sides, never with vertical cuts (Mario [00:57:43]
[01:16:27]). No UVs are created: scenario-maya-retopology-uv maps them. Test: `test_mm_offline.py`
(generator, passed offline), `test_mm_build.py` (Maya mesh, audit). Verified on Maya 2027.x:
pending.

## P5. Bevels with a census; booleans

```python
edges = body + ".e[*]"                                     # or the silhouette edges only
rec = MM.bevel(edges, width_cm=0.4, segments=2, depth=1.0, method="smart")   # 2027 Smart Bevel
if rec["problems"]:                                        # new n-gons, non-manifold, bbox moved
    raise RuntimeError(rec["problems"])                    # GUI: cmds.undo(); headless: reopen the saved version
print(rec["attr_map"], rec["maya"])                        # which node attributes were found, which release

rec = MM.bevel(edges, segments=2, method="legacy", fraction=0.2)       # Fractional: cannot invert
rec = MM.bevel(edges, width_cm=0.4, segments=2, method="legacy")       # Absolute: freeze first, can invert
```

Choosing (POLY; FlippedNormals; [added] for the agent): clean hand-built quads, predictable result:
legacy Fractional. After a boolean, on dense or messy topology, or when every edge must get the same
world width: Smart Bevel. Box corners with every edge beveled: 2 segments on the legacy bevel
(FlippedNormals [00:18:18], 2021, before Smart Bevel existed: 1 segment leaves n-gons at the
corners). Whether Smart Bevel does the same is untested: read `rec["problems"]` (new n-gons) after
every Smart Bevel instead of assuming the rule carries over; `test_mm_build.py` records both. Width
relative to the part: freeze transforms first, because Absolute width is world space and the object
scale otherwise disagrees. The Smart Bevel flags are unknown before the install: `MM.bevel` creates
the node with defaults and sets width, segments and depth on the first attribute name that exists
(`attr_map` records them).

Booleans (2025.3 engine, `polyBoolean` node since 2023): select meshes, not their group; manifold
inputs with conformed normals; bevel the result with Smart Bevel, which is built for boolean
intersections.

```python
res = cmds.polyCBoolOp("crate_body_geo", "cutter_geo", operation=2, name="crate_body_cut_geo")  # 1 union, 2 difference, 3 intersection
cmds.delete(res[0], constructionHistory=True)             # only once the stack is final
r = mx_audit.audit(res[0], uv_checks=False)                # expect n-gons: fix or Smart Bevel, never Cleanup them
```

Test: `test_mm_build.py` (P5 checks, boolean). Verified on Maya 2027.x: pending.

## P6. Creases, subdivision in one place, smoothed copy

```python
MM.crease(["cage_geo.e[12:19]"], 2.0, method="sets", set_name="lidEdge_2")   # ONE method per asset
rep = MM.crease_report("cage_geo", render_levels=2, engine_bound=False)
assert not [p for p in rep["problems"] if p.startswith(("warn", "error"))]

MM.subdiv_setup("cage_geo", 2, where="arnold")   # preview off, aiSubdivType catclark, 2 iterations
# or MM.subdiv_setup("cage_geo", 2, where="preview")   # preview 2, Arnold subdivision none
high = MM.smooth_copy("cage_geo", levels=2, name="crate_high")   # polygon bake high; cage untouched
```

Semantics: Maya crease value N creases N subdivision levels, the visible maximum equals the
subdivision level (POLY); keep values at or below the render levels; above 5 rarely needed (OSD);
sets named with the value (OSD `topDeck_2`). Crease Tool and Crease Sets cannot share components
(POLY). Creases are lost on export (antCGi [00:28:12]): an engine-bound asset gets bevels, or ships
a smoothed polygon copy. Arnold renders Smooth Mesh Preview's smoothed state on top of its own
iterations (Arnold doc), hence one place only. `smooth_copy` tries `polySmooth(subdivisionType=2)`
(OpenSubdiv [verify]) and falls back to the plain call; the test measures whether creases survive it
(a creased cube corner should stay at radius 0.866). Crease set creation (`createNode("creaseSet")`,
`.creaseLevel`, `sets(addElement=)`) is [verify]; the fallback is `method="tool"`
(`cmds.polyCrease(edges, value=v)`) for the whole asset. Test: `test_mm_subd.py`. Verified on Maya
2027.x: pending.

## P7. Model half, mirror, merge only the seam

```python
rec = MM.mirror_merge("body_geo", axis="x", threshold_cm=0.001, snap_band_cm=0.01, method="auto")
assert rec["ok"] and rec["center_line"]["near_misses"] == 0
r = mx_audit.audit(rec["mesh"], uv_checks=False)
assert r["symmetry_pct"] == 100.0 and r["holes"] == 0     # a closed body; eye and mouth holes are listed as borders
```

Steps inside: refuse unfrozen transforms (the plane is world X=0); delete history; snap vertices
within 0.01 cm of the plane onto it [added band]; try `polyMirrorFace` on a copy with Border merge
and a custom 0.001 threshold (antCGi [00:02:56]; flags [verify]) and check face count 2F, vertex
count 2V minus seam, both sides spanned, manifold, consistent winding; otherwise duplicate, scale -1
about the origin, `makeIdentity(preserveNormals=True)` [verify], combine, merge only the seam
vertices, conform normals if needed. The result keeps name and parent; the node is new. Afterwards
the center-line report replaces antCGi's "select all vertices and Delete" hunt for stray center
vertices. Test: `test_mm_mirror.py` (both routes, with a planted near-miss vertex). Verified on Maya
2027.x: pending.

## P8. Hard edges by angle and the split report

```python
MM.set_hard_by_angle("crate_low", 45)          # Polycount: hard where a mechanical surface bends > ~45 degrees
s = MM.split_report("crate_low")
s["triangles"], s["mesh_verts"], s["engine_verts_est"], s["split_ratio"]
s["hard_edge_components"]      # cut UV seams here (scenario-maya-retopology-uv): a hard edge on a seam is free
s["hard_not_on_uv_seam_edges"] # after UVs: should be empty on a normal-mapped low
s["soft_uv_seam_edges"]        # after UVs: possible bake seams; fine where the gradient is small
```

The report counts unique (vertex, smoothing fan, UV id, shader) corners: the vertex buffer an engine
builds [added estimate]. Selection-free, unlike `polySelectConstraint` edge picking. Default cube in
the tests: hard, 24 engine vertices; soft, 14 (the UV seams alone). Test: `test_mm_offline.py`,
`test_mm_fakes.py` (passed offline), `test_mm_normals.py`. Verified on Maya 2027.x: pending.

## P9. Weighted normals for a beveled static low

```python
MM.set_hard_by_angle("crate_low", 180)                     # all soft: the normals do the shading
w = MM.weighted_normals("crate_low", mode="largest", ratio=0.5)
assert w["flatness"]["big_faces_max_dev_deg"] < 0.05
```

`mode="largest"` [added]: per smoothing fan, only faces at least half the area of the fan's largest
face contribute, so a flat next to a thin chamfer wins outright while 2:1 neighborhoods on curves
still average. `mode="area"` is the common area weighting; offline it left 4.15 degrees on the big
faces of a box whose chamfers are 5% of the face width, and 0.41 degrees at 0.5%. Static meshes
only: the normals are locked (`setFaceVertexNormals`), `mx_audit` then warns "locked normals":
expected on a prop, an error on anything going to rigging. Re-run after any topology change. Export
with Smoothing Groups on so FBX writes them (FBXUE); the baker must use the same mesh normals. Test:
`test_mm_offline.py` (math, passed), `test_mm_normals.py` (written and read back from Maya).
Verified on Maya 2027.x: pending.

## P10. Game low from the cage, bake prep

```python
cage = "crate_cage"
high = MM.smooth_copy(cage, levels=2, name="crate_high")        # bake source; floaters stay separate
low = cmds.duplicate(cage, name="crate_low")[0]
cand = MM.flat_edges(low, max_angle=1.0)["edges"]               # coplanar edges carry no form
# review cand: keep edges on the silhouette and edges a UV seam needs, then
cmds.polyDelEdge(cand, cleanVertices=True)
cmds.delete(low, constructionHistory=True)
sw = MM.shrink_wrap(low, high, method="transfer")                # subdivision shrank the high (On Mars)
dev = sw["after"]                                                # cm, both directions
# high_outside_low_max_cm large on a round corner: cut radius edges into the low (On Mars [00:12:50]),
# or give the baker a cage at least that distance; record the number either way
print(cmds.polyEvaluate(low, shell=True))                        # each separate shell needs a reason
MM.set_hard_by_angle(low, 45)
tri = MM.triangulated_copy(low, name="SM_SupplyCrate_A", toward=high)   # SAME triangulation for bake and export
assert tri["all_triangles"] and tri.get("diagonals_wrong_after", 0) == 0
print(tri["triangles"], tri["nonplanar_quads"], tri["flipped"], MM.split_report(tri["mesh"])["engine_verts_est"])
```

The low is reached from the cage by deleting edges, never by rebuilding: strip holding loops and
bevels that only served subdivision, keep every silhouette edge, and end a loop with a triangle
where it only served the subdivision instead of running it round the model (On Mars [00:05:50]
[00:09:22] [00:10:29]). Round corners: cut more than the 2 to 3 edges On Mars found too few on a
visible curvature, space them evenly, and put one edge on the corner's highest point to help the
bake [00:25:29] [00:26:34].

Contiguous low (PC § Contiguous Meshes): where a handle, latch or bracket meets the body, weld it
into the body mesh (combine, then bridge or merge the contact border) when that costs fewer
triangles than it saves; otherwise keep it separate but delete the faces hidden inside the body.
Hidden intersected faces bake overlap errors and aliased edges and still take UV space. Floaters are
for the HIGH (bolts, panel details), not an excuse to leave the low intersecting.

Triangulation is a shape decision on non-planar quads only: `toward=high` keeps, per non-planar
quad, the diagonal whose midpoint lies closer to the high [added criterion] and flips Maya's choice
with `polyFlipEdge`; `ridges` and `valleys` count the result. Polycount still asks for a look in the
engine: import the FBX (scenario-maya-pipeline-scripting) and flip any quad that became a ridge
instead of a valley (§ Polygons Vs. Triangles, workflow step 7). Baker and engine must use the same
tangent basis, or the normal map shows seams and gradients (PC § Smoothing Groups & Hard Edges).
Visual: `mx_review.review([high, low], out, modes=("silhouette",))` and compare the two alphas per
view (On Mars flat black); contrast check: two `surfaceShader`s (green low, red high), overlap,
render, red showing through = the low deviates (On Mars [00:07:27]). Floaters for bolts and panel
details on the high: separate objects with `castsShadows` off for the AO bake (PC § Floating
Geometry). Small details go into the normal map (Mario [01:40:49]). Test: `test_mm_lowhigh.py`;
`triangulated_copy(toward=...)` in `test_mm_cage.py`. Verified on Maya 2027.x: pending.

## P11. Topology audit (gate of every stage)

```python
for m in mx_audit.list_meshes(["crate_GRP"]):
    r = mx_audit.audit(m, texture_size=2048)
    v = mx_audit.verdict(r, "game", max_tris=budget)          # "subd" for a film cage, "film" for film lows
    b = MM.balance(m)                                          # on the base grid; exclude support loops
    c = MM.coincident_vertices(m)                              # unwelded V-snaps, stacked shells
    print(m, r["tris_equivalent"], r["ngons"], r["poles_e6plus"], v, b["edges_over_limit"], c["pairs"])
```

Read with `references/critique.md`: an n-gon is always an error on delivery (fix by hand); a
triangle is judged by position (flat and static fine, curved or deforming not); poles of valence 6+
on a cage are a waviness risk.

Cage review before smoothing the high (Mario's triangle protocol and faceting rule; OpenSubdiv
valence):

```python
cr = MM.cage_report("crate_cage", flat_deg=1.0)
cr["hard_edges"], cr["hard_edge_components"]          # must be 0: cmds.polySoftEdge(cage, angle=180, ch=False)
cr["curved_triangle_faces"]                           # [face, deviation deg]: remove, solve the rest, reinstate only if
cr["flat_triangle_faces"]                             #   highlight_review holds; flat ones may stay if it holds
cr["fan_pole_verts"], cr["poles_e6plus_verts"]        # fans: quad cap (P4); other 6+ poles: reroute or justify
assert cr["ready_to_smooth"]                          # no hard edges, n-gons or fan caps
```

Protocol (Mario [00:20:36] [00:30:32]): when a triangle is in doubt, delete it (merge the edge or
dissolve to a quad), solve every other region, then reinstate it only where the metal highlight over
the smoothed surface holds; a triangle on a flat static panel costs nothing, on a curve it bends the
highlight, on a deforming area it pinches. "Flat" here means every face touching the triangle's
vertices lies within `flat_deg` of its plane [added threshold]. Hard edges appear after mirror,
bridge, boolean and extract; a faceted patch in the smooth preview is one [01:28:38]. The `subd`
profile of `MM.handoff_report` runs this check. Test: `test_mm_normals.py` (balance, coincident),
`test_mm_build.py` (verdict on the empty extrude), `test_mm_offline.py` and `test_mm_cage.py` (cage
review). Verified on Maya 2027.x: pending.

## P12. Look at it: review sheet and highlight review

```python
sheet = mx_review.review(["crate_GRP"], out + "/review", views=("front", "side", "threequarter", "top", "low"),
                         modes=("clay", "wire", "silhouette", "normals"))["sheet"]
hl = MM.highlight_review(["crate_cage"], out + "/hl", subdiv=2, views=("threequarter", "front", "top", "low"))
close = MM.highlight_review(["crate_cage"], out + "/hl_latch", subdiv=2, focus=((18, 32, 20), 6),
                            views=("threequarter", "front"))
```

Open every sheet with the image reader. Highlight review: metal (roughness 0.2) under a striped sky
dome on temporary duplicates with Arnold subdivision on the duplicates only; stripes must run
continuous across cuts and corners; kinks, dark streaks and wobbles are pinching (Mario [00:30:32],
frames 00:12:45 and 01:38:42). One close-up per cut: whole-object sheets hide small pinches. Flipped
faces: two-sided lighting hides them (FlippedNormals [00:20:47]). `mx_audit` catches a face flipped
against its neighbors (inconsistent winding); `MM.inverted_shells(m)` catches a closed shell flipped
as a whole (negative signed volume, object space, after freezing), which winding cannot see. In a
GUI session also look with two-sided lighting off or backface culling (`references/gui-paths.md`);
the normals sheet shows direction colors, not black backfaces, so it does not replace that look.
Playblasts need the GUI (`mx_review.playblast`). Test: `test_mm_review.py` (sheet written, contrast
on the metal tile, scene restored). Verified on Maya 2027.x: pending.

## P13. The modeler's bend test (characters and anything that deforms)

```python
arm_joints = [(18, 145, -2), (45, 118, -4), (68, 95, 2)]      # shoulder, elbow, wrist: centroids of the loops there
a = MM.bend_test("body_geo", arm_joints, bend_index=1, angle=110, axis="z")
b = MM.bend_test("body_geo_v2", arm_joints, bend_index=1, angle=110, axis="z")   # candidate topology, same settings
print(a["min_area_ratio"], b["min_area_ratio"], a["normal_flips"], b["normal_flips"], a["restored"])
```

A temporary chain, a default bind (Neighbors, 4 influences [verify enum]), one bend, numbers, then
unbind, delete joints and history, and the rest shape is compared (`restored`). The comparison under
identical settings is antCGi's proof [00:16:24]; loops running along the limb at wrist or ankle are
the modeler's fix, volume loss at a clean hinge goes to scenario-maya-deformation as a corrective.
Never run it on a rigged file. For a visual check, render the posed state before teardown with
`mx_review.review` in your own job (the function tears down in `finally`). Test:
`test_mm_lowhigh.py` (2 vs 12 height divisions on a cylinder arm). Verified on Maya 2027.x: pending.

## P14. Handoff: validate, fix what is safe, report, save a version

```python
for m in mx_audit.list_meshes(["crate_GRP"]):
    cl = MM.cleanup_technical(m)                       # lamina, non-manifold, zero-length, zero-area ONLY
    assert cl["ok"], cl["problems"]                    # n-gons left for hand fixing, never tessellated
    assert MM.inverted_shells(m)["inverted"] == 0      # else cmds.polyNormal(faces, normalMode=0) on the listed faces
rep = MM.handoff_report(["crate_GRP"], out, to="retopology-uv", max_tris=budget)   # read-only first
v = mx_validate.validate(profile="model", roots=["crate_GRP"],
                         fix=tuple(mx_validate.SAFE_FIXES) + ("render_stats",))    # history, smooth preview, dead unknowns
for layer in [l for l in cmds.ls(type="displayLayer") or [] if l != "defaultLayer"]:
    cmds.delete(layer)                                                              # layers you created; ask for others
rep = MM.handoff_report(["crate_GRP"], out, to="retopology-uv", max_tris=budget)
assert rep["ok"], (rep["validate_fails"], rep["errors"])
cmds.file(rename=out + "/crate_model_v004.ma")
cmds.file(save=True, type="mayaAscii", force=True)
```

`pending_for_receiver` lists what the receiver owns (UVs for scenario-maya-retopology-uv) instead of
hiding it. `to="rigging"` adds the X-symmetry check and turns locked normals into an error; every
profile now reports `shells` (inverted shells are an error) and the `subd` profile adds `cage` (hard
edges on a cage are an error, fan caps a warning). Never auto-fixed: n-gons, naming, units, facing
(FlippedNormals; mx_validate).

Cleanup policy (FlippedNormals [00:10:44] [00:11:15] [00:11:50]): Mesh > Cleanup may fix only the
"purely technical" defects: lamina faces, non-manifold geometry, zero-length edges (and zero-area
faces). Every tessellation option (4-sided, more than 4 sides, concave, holed, non-planar) stays
off, because "you never know how it's gonna clean up": n-gons are selected (select-matching mode)
and fixed by hand. `MM.cleanup_technical` runs `polyCleanupArgList 4` with exactly those switches
(argument order [verify], checked by `test_mm_cage.py`) and reports `ok` False if a defect remains
or if n-gons went down while triangles went up. Names: unique short names, `_geo` suffix, no
defaults (`pCube1`, `polySurface92`, `group3`): capture every creation return and rename at once;
`mx_audit` flags `default_name` and `duplicate_short_name`, `mx_validate` fails `naming_duplicates`
(FlippedNormals [00:18:16]). Every save: Smooth Mesh Preview off on every shape (press 1;
`mx_validate` fix `smooth_preview`), because the file is heavier and Arnold renders the preview
state on top of its own iterations (FlippedNormals [00:24:00]; Arnold subdivision doc). Render
subdivision lives in the Arnold attributes (`MM.subdiv_setup(where="arnold")`); `where="preview"`
only when scenario-maya-lookdev asks for it. Test: `test_mm_handoff.py`; `test_mm_cage.py`
(cleanup_technical on a planted n-gon plus empty extrude, inverted_shells on a reversed cube).
Verified on Maya 2027.x: pending.

## P15. Clean-scene rebuild

```python
cmds.file(save=True)                                           # rebuild_scene refuses unsaved changes
rb = MM.rebuild_scene(["crate_GRP"], out + "/rebuild", carrier="ma")    # exportSelected without history
# carrier="obj": one combined mesh, no UV2, creases, hierarchy or pivots: sculpt bases only
```

Then P14 again on the rebuilt scene. The exported selection keeps hierarchy and UV sets; whether
display layers or shading networks come along is recorded by the test [verify]. Test:
`test_mm_handoff.py` (P15 checks, both carriers). Verified on Maya 2027.x: pending.

## P16. A whole stage as an mx_run job (template)

```python
# stage_lowpoly.py   run: python3 mx_run.py --scene crate_model_v004.ma --save-as crate_model_v005.ma stage_lowpoly.py -- /abs/out 3000 /abs/out/keep_edges.json
import json, sys
sys.path.insert(0, "/abs/skills/scenario-maya-modeling/scripts")
import maya.cmds as cmds
import mx_audit, mx_modeling as MM

def main(argv):
    out, budget = argv[0], int(argv[1])
    keep = json.load(open(argv[2])) if len(argv) > 2 else None     # component_record of edges to keep (P18)
    high = MM.smooth_copy("crate_cage", 2, name="crate_high")
    low = cmds.duplicate("crate_cage", name="crate_low")[0]
    keep_low = set(cmds.ls(MM.carry_components(keep, low), flatten=True)) if keep else set()   # raises if stale
    cand = [e for e in cmds.ls(MM.flat_edges(low)["edges"], flatten=True) if e not in keep_low]
    cmds.polyDelEdge(cand, cleanVertices=True)
    cmds.delete(low, constructionHistory=True)
    sw = MM.shrink_wrap(low, high)
    MM.set_hard_by_angle(low, 45)
    tri = MM.triangulated_copy(low, name="SM_SupplyCrate_A", toward=high)
    r = mx_audit.audit(tri["mesh"])
    return {"deviation": sw["after"], "tris": tri["triangles"], "split": MM.split_report(tri["mesh"]),
            "verdict": mx_audit.verdict(r, "game", max_tris=budget)}
```

The result dict comes back in `MX_RESULT`; the saved version is the stage's evidence together with
the sheets you opened.

## P17. The UV handoff contract (what the modeler guarantees, what the UV stage must not break)

The modeler delivers; scenario-maya-retopology-uv maps. When the brief makes the modeler do UVs too,
load scenario-maya-retopology-uv; these are the points that meet at the boundary.

```python
tri = MM.triangulated_copy(low, name="uvcheck_tmp")            # Maya sends Unfold a triangulated mesh
r = mx_audit.audit(tri["mesh"], uv_checks=False)
assert not r["non_manifold_edges"] and not r["non_manifold_verts"], "clean before unfolding"
cmds.delete(tri["mesh"])                                        # temporary copy
```

- Unfold3D refuses non-manifold meshes and receives a triangulated mesh, so non-planar quads can
  hide non-manifold cases the quad mesh does not show; clean before unfolding, and if the Fix option
  does nothing, triangulate and run Cleanup in select mode to find the culprit (UVDOC § Prepare a UV
  mesh, step 2).
- Room space stays at the 2 px default: raising it slows the unfold and creates distortion; padding
  belongs to Layout (UVDOC § Room Space Options). Unfold3D pins unselected UVs automatically (UVDOC
  § Unfold a UV mesh): select everything that should move.
- Hard edges sit on UV seams: hand over `MM.split_report(low)["hard_edge_components"]` as the seam
  list.
- LODs: decimation removes chamfers and edited normals and can add normal-map seams (PC § Level of
  Detail Models); straight UV shell borders help LOD generation, since dents along a shell edge
  become visible seams when reduced (PC § UV Tutorials & Threads).
- Optimized game maps may lower density on faces never seen (a prop's bottom) and share the sheet
  with a sibling prop or a trim instead of inflating density (UVDOC § Optimizations); ask before
  doing either on a unique-UV brief. Test: `test_mm_handoff.py` (handoff record), the manifold check
  is plain `mx_audit`. Verified on Maya 2027.x: pending.

## P18. Component lists across stages and jobs

A component index names a component only on the topology it was read from. A duplicate keeps indices
(cage to its fresh copy is safe); any edit (delete edge, extrude, bevel, triangulate, cleanup)
renumbers them; a name like `crate_cage.e[12]` does not match `crate_low.e[12]` by string. Record
and carry, never compare names:

```python
keep = MM.component_record(silhouette_edges_on_cage)   # {"node", "kind", "ids", "topology_key"}: JSON-safe
json.dump(keep, open(out + "/keep_edges.json", "w"))
low = cmds.duplicate("crate_cage", name="crate_low")[0]
keep_low = set(cmds.ls(MM.carry_components(keep, low), flatten=True))    # same topology: ids carry
cand = [e for e in cmds.ls(MM.flat_edges(low)["edges"], flatten=True) if e not in keep_low]
cmds.polyDelEdge(cand, cleanVertices=True)
MM.carry_components(keep, low)                          # now raises: topology changed, re-derive on the low
```

A list saved by an earlier job is valid only if `topology_key` still matches; otherwise re-derive it
on the current mesh (by position, angle or a fresh query such as `MM.flat_edges` or
`MM.split_report`). Both sides of a comparison must be long names from `cmds.ls(..., flatten=True)`
of the SAME node. Test: `test_mm_offline.py` (parsing, keys), `test_mm_fakes.py` (carry and
refusal), `test_mm_cage.py` (after `polyDelEdge` in Maya). Verified on Maya 2027.x: pending.
