# Procedures (scenario-maya-retopology-uv)

Tested-pending code for every stage. The functions live in `scripts/mx_retopology_uv.py` (`RU`); the
blocks below are the calls an agent writes in an mx_run job.

**Status of everything on this page: not yet run in Maya** (Maya 2027 was not installed on
2026-09-24). What did run, with python3 on 2026-09-24:

- `tests/code/maya-retopology-uv/test_offline_math.py`: the pure layer (topology walks, rings, lids,
  joint crossings, seam seeds, relax, mirror arrays, cavities, landmark similarity and warp, tubes
  from sections, review camera rays, texel density and UDIM math, mip padding, distortion, seams vs
  hard edges, split vertices, UV mirroring and stacking, UV sheets, and the deformation-ready gate:
  proxy bends and twists, shear, area and flip metrics, joint loop and spiral checks,
  topology-vs-rig diagnosis, face hinges, lid clearance and blink, silhouette overlap). 99 checks
  pass.
- `tests/code/maya-retopology-uv/test_offline_fake_maya.py`: the MAYA functions' own logic against a
  fake in-memory `maya.cmds` / OpenMaya (all except the thin wrappers `decimate`, `rotate_shell`,
  `surface_hit`, `landmark_from_pixel`, `checker_review`, `tension_node`; `mx_review.review` is
  stubbed for `deform_test` and `overlap_review`). 40 checks pass. This proves the module's
  bookkeeping, not Maya's behavior.

Each procedure names its Maya test (`job_*.py`, run through
`<skills>/scenario-maya-expert/scripts/mx_run.py` by `tests/code/maya-retopology-uv/run_all.sh`).
Items marked [verify] are answered by `job_probe_commands.py`; fix this page from its JSON before
trusting a flag.

## P0. Job skeleton and rules

Every job__.py uses this shape.

```python
# my_job.py; run from the project root:
#   python3 <skills>/scenario-maya-expert/scripts/mx_run.py --scene /abs/in/char_v003.ma \
#       --save-as /abs/out/char_v004.ma --plugins Unfold3D --timeout 3600 my_job.py -- --out /abs/out
import sys
sys.path.insert(0, "/abs/skills/scenario-maya-retopology-uv/scripts")   # mx_run already adds scenario-maya-expert/scripts
import maya.cmds as cmds
import mx_audit
import mx_review
import mx_retopology_uv as RU


def main(argv):
    out = argv[argv.index("--out") + 1]
    ...                                   # the stages below
    return {"report": "..."}              # becomes the MX_RESULT line
```

Rules the module follows and your own code must too:

- One mayapy child per scene (`mx_run`); `--save-as` a new version, never the source (lead skill).
- OpenMaya writes (`write_points`, `write_uvs`, `create_mesh`) bypass undo: only on meshes the agent
  created. `_clear_history` deletes construction history before a write and refuses a deformed mesh.
- Distances are world centimeters (OpenMaya internal unit), densities px/cm, whatever the UI unit.
- Flags: `RU.call(cmd, *args, **flags)` passes only the flags `cmds.help(cmd)` lists and returns the
  dropped ones; log them.

## P1. Intake audit of a dense sculpt, scan or AI mesh

Test: `job_ai_character_smoke.py` ("intake audit sees the lamina face").

```python
src = "ai_character"
a = mx_audit.audit(src, symmetry_axis="x")
intake = {k: a.get(k) for k in ("verts", "tris", "non_manifold_edges", "non_manifold_verts", "lamina_faces",
                                "holes", "symmetry_pct", "center_offset", "dimensions", "surface_area")}
sheet = mx_review.review([src], out + "/intake", views=("front", "side", "threequarter"),
                         modes=("clay", "silhouette"), resolution=1024)
```

Write down: height against the brief (cm), symmetry (a posed AI mesh is far below 99%), openings
(eyes and mouth usually fused shut on generated characters), fused clothes, whether the face is
neutral. Scale, center and ground the source by its transform, then freeze it in the new version so
high and low share world space (antCGi e74KphYwMww [00:02:52] to [00:06:37]). Never edit the
source's points otherwise: it is the bake source.

## P2. Working copy and cleanup

Test: `job_retopo.py` ("source untouched by prep", "working copy manifold");
`job_ai_character_smoke.py` ("prep flags the mesh as not Retopologize-ready").

```python
work, prep = RU.prep_source(src)            # weld (relative 1e-6 of the diagonal [added]), soften all, report
proxy, pr = RU.decimate(work, 250000)       # optional: fast section and projection proxy (polyReduce)
```

- `prep["retopologize_ready"]` False means non-manifold or lamina remain. Maya 2027 Help, Tips for
  working with scan data: internal faces make non-manifold vertices; Cleanup splits them into holes
  and Merge rebuilds the non-manifold, an endless loop. Run Mesh > Cleanup in "Select matching
  polygons" mode with Nonmanifold geometry (gui-paths.md), delete the internal faces by hand, and
  never Fill Hole on non-manifold geometry.
- Scans mark every edge hard, which breaks Retopologize with Preserve Hard Edges: `prep_source`
  softens all; re-harden only full feature loops.
- Retopologize and Unfold3D refuse non-manifold input (Maya 2027 Help). The template fit, tubes and
  projection read closest points and plane sections, which tolerate triangle soup [added: by
  construction, not yet tested on a real broken scan]. Whether `polyReduce` accepts non-manifold
  input is [verify] (`job_probe_commands`): decimate the prep copy, not the raw source.
- In-Maya options for a broken source (maya-version-deltas § 2.1, § 2.2): Mesh > Booleans with
  Geometry mode Volume and a Voxel size (2026, default 1.000) rebuilds a watertight mesh from a
  voxel volume; it needs a second input (for example a union with a small primitive buried inside
  the body [added]), attribute names [verify] (API: `MFnMesh.booleanOperations()` with
  `kVolumeGeometryMode`). Mesh > Remesh evens the spread before Retopologize (Maya 2027 Help,
  Preparing a mesh, step 6). Flow Retopology is cloud-only with a sign-in: not for headless work. On
  a hopeless AI mesh, skip the repair and use it only as projection target and bake source.
- Decimate is not retopology (`polyReduce`, Maya 2027 Help marking-menu wording). Termination enum 2
  = triangles is [verify].

## P3. Landmarks from a render

Test: `job_camera.py` ("center pixel of mx_review's front view hits the sphere front"). Ray math
verified offline.

```python
rv = mx_review.review([src], out + "/landmarks", views=("front", "side"), modes=("clay",), resolution=1024)
# open rv["tiles"]["clay"]["front"] (full size, top-left origin) and read pixel positions
lm = {}
lm["eye_outer_L"] = RU.landmark_from_pixel([src], src, "front", 598, 402, 1024)
lm["mouth_corner_L"] = RU.landmark_from_pixel([src], src, "front", 560, 520, 1024)
head_close = ((0.0, 163.0, 5.0), 14.0)                       # focus sphere (center cm, radius cm)
rv2 = mx_review.review([src], out + "/face", views=("front",), modes=("clay",), focus=head_close)
lm["nostril_L"] = RU.landmark_from_pixel([src], src, "front", 540, 560, 1024, focus=head_close)
```

Pick landmarks on +X and mirror the X coordinate for the other side when the source is symmetric.
The camera is rebuilt with mx_review's own framing (`view_frame`), so the same targets, view,
resolution, margin and focus must be passed. Landmark list for a biped: eye corners, lid top and
bottom, mouth corners, lip top and bottom center, nose tip, nostril wings, chin, ear top and lobe,
jaw corner, shoulder tip, elbow, wrist, fingertips, hip, knee, ankle, heel, toe tip.

## P4. Template fit: the scripted Quad Draw

Test: `job_retopo.py` ("fitted template lies on the source", "covers the source", "keeps the
template topology"); `job_ai_character_smoke.py` ("fitted head lies on the source head").

```python
# the studio base head keeps its landmark vertex ids next to it, e.g. base_head.landmarks.json
ids = {"eye_outer_L": 412, "eye_inner_L": 388, "mouth_corner_L": 901, "nose_tip": 15, "chin": 7,
       "ear_top_L": 1203, "eye_outer_R": 2412, "mouth_corner_R": 2901}
landmarks = {k: (ids[k], lm[k]) for k in ids if lm.get(k)}
head, fr = RU.fit_template("base_head_geo", src, landmarks, name="head_geo", relax_iterations=3)
print(fr)   # similarity_rms, scale, landmark_error_max, relax report
```

- The fit is a similarity (Horn quaternion), then a biharmonic RBF warp through the landmark pairs,
  a closest-point projection onto the source, and relax-and-project passes. 4+ non-coplanar
  landmarks, 8 to 20 well spread for a head [added].
- Why: FlippedNormals reuse perfect topology ([00:10:11] [00:10:43]); Jessica's standard base
  (ZiYEO49B768 [00:58:51]). The base carries the expert decisions (rings, lid counts, nasolabial
  loop, mouth-corner loop running up and back under the cheek, antCGi RlNnp4qQIrU [00:09:32]); the
  fit only moves it.
- No base available: ask scenario-maya-modeling for a primitive-blocked base (antCGi: cylinders 12 x
  8 torso, 8 x 6 limbs, sphere head, the organic base-mesh digest), then fit it.
- Big to small, loose before tight (FlippedNormals [00:01:05] [00:02:07]): fit the base at its own
  density, pass the openings and joint gates (P9) and the deformation gate (P19) there, and only
  then add spans (subdivide and re-project): a wrong loop is cheap to move at base density and
  expensive after.
- What an approved base must already carry: rings with equal lid and lip counts, the mouth-corner
  loop, lids built over eyeballs placed in the scene (antCGi RlNnp4qQIrU [00:08:24]; checked by
  P20), and neck flow along the sternocleidomastoid from the clavicle to the back of the skull, with
  middle-neck edges routed into the center line and the clavicle (RlNnp4qQIrU [00:37:43]
  [00:39:08]).
- Landmark error that stays high after relax means a landmark was misread or the proportions differ
  too much: add landmarks around that feature, do not raise the relax.

## P5. Tubes from plane sections (limbs, fingers, sleeves, tails, straps)

Test: `job_retopo.py` ("tube rings on the limb surface", "rule of threes at the elbow");
`job_ai_character_smoke.py` ("elbow carries 1 control + 2 support loops"). Section and resampling
math verified offline.

```python
shoulder, elbow, wrist = lm["shoulder_L"], lm["elbow_L"], lm["wrist_L"]
radius = 4.5                                    # local limb radius (cm), from the section or the audit
sides = 8                                       # antCGi blocks limbs with 8 sides; more for film
spacing = 2 * 3.14159 * radius / sides          # square quads (FlippedNormals [00:20:39]) [added]
st = RU.limb_stations([shoulder, elbow, wrist], joint_span=0.5 * radius, spacing=spacing)
arm, tr = RU.build_tube(proxy, [shoulder, elbow, wrist], st, sides=sides, radius=2.5 * radius,
                        name="armL_geo", ref=(0.0, -1.0, 0.0))   # ring start under the arm (seam side)
RU.relax_project(arm, src, iterations=2, border="lock", center_axis=None)   # onto the full source
```

- Each joint gets one control ring plus a support ring on each side (Jessica [01:15:51]); the joint
  ring bisects the bend. `tr["failed"]` lists stations where no section enclosed the path (path
  outside the surface, or the plane cut another limb first: shorten `radius`).
- Loops go across the wrist and around the ankle, not from the front of the ankle down to the heel
  (antCGi x07USYlvu2o [00:11:04] [00:17:37]): put the wrist and ankle stations perpendicular to the
  bone.
- Ends stay open: bridge them to the torso by hand or in the template, or keep the part separate
  when it is clothing or armor that may slide (Jessica [00:44:17]). Tubes are the fallback for parts
  the template lacks (tails, horns, straps, sleeves); a whole body with a base comes from P4.
- A loose garment fused into an AI body (coat, skirt, sleeve) gets its own tube along the garment's
  path, sectioned and projected on the fused source: no need to cut it out of the source first
  [added]. Pick a path and radius that section the garment surface, not the body under it, and check
  the result with P9 deviation.

## P6. Retopologize (polyRetopo) for bodies, props and static cloth

Test: `job_retopo.py` ("polyRetopo history deleted", "result is all quads", "no flag dropped on
polyRetopo", "hard surface result has no history"); flags and node attributes probed by
`job_probe_commands.py`.

```python
body, rr = RU.retopologize(work, target_faces=6000, preprocess=True,
                           symmetry={"axis": "+X to -X", "position": "Bounding Box"})
armor, ra = RU.retopologize(plate, 800, hard_surface=True, preprocess=False, preserve_hard_edges=True)
print(rr["faces"], rr["dropped_flags"], rr["set_on_node"], rr["history_left"])   # history_left must be []

# steer edge flow with edge component tags instead of hard edges (Maya 2027 Help, Preserve areas)
brow = RU.edge_ids_for(work, RU.loop_keys(work, 1022, 1023))
RU.tag_edges(work, "brow_L", brow)                     # componentTags layout [verify]
body, rr = RU.retopologize(work, 6000, tags="brow*")
```

- Runs on a duplicate, deletes history right after (the node re-solves on edits and on file open
  otherwise), reports the face count against the target (a target, not a count: detail wins, Maya
  2027 Help Face Count Options).
- Settings: organic defaults; hard surface Regularity 1, Uniformity 1, Anisotropy 0; Preprocess on
  for noisy 100k+ input only (it smooths detail); Tolerance below 10% is slow; Symmetry on a whole
  mesh only.
- Flags the command does not list are set on the node with Pause on, then off (Maya 2027 Help: every
  attribute change re-runs the solver otherwise).
- Whether it runs in mayapy at all is [verify]; if not, run it through the GUI bridge
  (scenario-maya-expert) with the same call.
- Never on a face that must deform (FlippedNormals [00:23:15]); use it there only as a throwaway
  start, and say so in the report. The same holds for loose layers that animate (coats, skirts):
  automatic topology is for parts that do not animate ([00:22:13] [00:22:44]); if one ships anyway,
  P19 must pass on it.

## P7. Cavities: mouth bag, nostrils, eye pouch

Test: `job_retopo.py` ("pocket closes the opening, manifold, consistent winding"). Pocket
construction verified offline.

```python
head2, cr = RU.cavity(head, point=lm["mouth_center"], depth=3.0, steps=3, scale=0.85, name="head_geo_bag")
head3, cr = RU.cavity(head2, point=lm["nostril_L"], depth=0.8, steps=2, scale=0.7, name="head_geo_nose")
```

- FlippedNormals model the mouth bag by extruding the lip border inward repeatedly and the nostrils
  as recesses, because shading and SSS break on solid shapes ([00:25:16] [00:26:20] [00:27:22]).
  `cavity` builds the rings in Python and a new mesh (topology changes), so do it before UVs; the
  cap is a triangle fan, acceptable hidden in a cavity ([00:03:41]).
- Eye pouch: a shallow pocket from the eye opening with `close=False`, so the eyeball sits in it.
- Mouth corners need the loop that runs up and back under the cheek for blend shapes (antCGi
  RlNnp4qQIrU [00:09:32] [00:23:15]); the template carries it.

## P8. Relax, center line, mirror, combine symmetric parts

Test: `job_retopo.py` ("relax evens edge lengths", "snap_center moved the drifted center vertices",
"mirrored sphere is closed and manifold", "100% symmetric"); `job_ai_character_smoke.py` ("arm pair
is symmetric").

```python
RU.relax_project(head, src, iterations=4, strength=0.5, border="slide", center_axis=0)
RU.snap_center(half_body, axis=0, band=0.01, border_only=True)
body, mr = RU.mirror_half(half_body, axis=0, tol=0.001, name="body_geo")   # new mesh; delete the half
arms, _ = RU.mirror_half("armL_geo", axis=0, tol=0.001, name="arms_geo")   # both arms in one mesh
```

- Relax is tangential Laplacian smoothing followed by closest-point reprojection; borders slide
  along themselves (the Quad Draw Auto-Lock idea) or lock. FlippedNormals: clean from the start and
  you rarely need relax ([00:11:14]).
- Center line: every pass ends with the center vertices at exactly 0 (FlippedNormals [00:19:06]);
  `retopo_report` fails on vertices drifting in the 1e-4 to 1e-2 band (antCGi QW8w15J00Ok).
- Mirror weld 0.001, never automatic (antCGi [00:02:24]); faces made only of center vertices are not
  duplicated. After mirroring, audit for stray center vertices ([00:03:29]).
- Combine symmetric parts (arms, boots, hip cloths) so weights can be painted once and mirrored
  (antCGi e74KphYwMww [00:24:32]).
- Relax before UVs: relaxing moves UVs; if UVs already exist, restore them with
  `RU.transfer_uvs(backup, mesh, "topology")` (antCGi [00:19:21] used Transfer Attributes, sample
  space World).

## P9. Retopology gate

Test: `job_retopo.py` ("16-vertex hole found with equal halves", "at least 3 clean rings around the
hole", "report sees no polyRetopo in history").

```python
spec = {
  "openings": {"eye_L": {"point": lm["eye_center_L"], "corner_axis": 0},
               "eye_R": {"point": lm["eye_center_R"], "corner_axis": 0},
               "mouth": {"point": lm["mouth_center"], "border": False}},      # closed by the bag
  "joints": {"elbow_L": {"center": lm["elbow_L"], "axis": (1, 0, 0), "radius": 6.0, "half_band": 2.5},
             "knee_L": {"center": lm["knee_L"], "axis": (0, 1, 0), "radius": 8.0, "half_band": 3.0}},
  "cavities": {"mouth_bag": (lm["mouth_center"], 4.0), "nostril_L": (lm["nostril_L"], 1.0)},
  "regions": {"eyes": (lm["eye_center_L"], 3.0), "cranium": (lm["head_top"], 6.0)}}
rep = RU.retopo_report("body_geo", src, profile="subd", symmetric=True, **spec)
print(rep["ok"], rep["fails"], rep["openings"], rep["joints"], rep["poles_by_region"], rep["deviation"])
sheet = mx_review.review(["body_geo"], out + "/retopo", views=("front", "side", "threequarter", "low"),
                         modes=("wire", "clay"))
face = mx_review.review(["body_geo"], out + "/retopo_face", views=("front", "threequarter"),
                        modes=("wire",), focus=((0.0, 163.0, 5.0), 14.0))
```

Read `rep`: `verdict` (mx_audit, profile "subd" warns on triangles), deviation both ways with
`max_rel_edge`, per-opening clean rings and upper/lower counts, joint loops in band, poles by region
(none should be in "eye_L", "mouth"), triangles outside cavities, edge length per region (eyes
shorter than cranium, FlippedNormals [00:21:10]), center drift. Then open both sheets and walk
`critique.md`.

## P10. Seams from the map

Test: `job_uv.py` ("seam cut along a full loop (10 edges)", "one shell, no folds");
`job_bake_prep.py`; seam seeds verified offline.

```python
d = RU.mesh_data("body_geo")
T = RU.Topology(d["faces"], len(d["points"]))
P = d["points"]
seams = []
for name, center, axis, kind, prefer in (
        ("neck_base", lm["neck_base"], (0, 1, 0), "ring", None),
        ("wrist_L", lm["wrist_L"], (1, 0, 0), "ring", None),
        ("back_of_arm_L", lm["elbow_L"], (1, 0, 0), "along", (0, -1, -1)),
        ("inner_leg_L", lm["knee_L"], (0, 1, 0), "along", (-1, 0, 0)),
        ("boot_top_L", lm["boot_top_L"], (0, 1, 0), "ring", None)):
    seed = RU.seam_seed(P, T, center, axis, radius=8.0, kind=kind, prefer=prefer)
    seams += RU.loop_keys("body_geo", *seed)
RU.planar_base("body_geo", "z")
RU.cut_seams("body_geo", seams)
# alternative start: Auto Seams (u3dAutoSeam [verify flags]), then review every cut
RU.call("u3dAutoSeam", "body_geo")
```

Seam plan for a game character (MLC s_KLbTUdKms [00:01:37] to [00:08:05]): neck base; head slits
along the bottom and top, and inside the mouth; shoulder or sleeve loop; back of the arm through the
elbow; wrists; hands halved and planar-projected; waist and armpits; rear and inner legs; boot tops;
soles. Place seams where the real object has them (garment seams, Paulino [00:05:16]) and where the
camera does not look ("under the arms or on the back of the legs", Maya 2027 Help). An unfold that
looks bad needs more seams (MLC [00:02:07]).

## P11. Unfold, optimize, orient, straighten

Test: `job_uv.py` ("unfolded cylinder is nearly distortion free", "each straightened row sits on one
V value"); orientation math verified offline.

```python
RU.unfold("body_geo", map_size=4096, room_px=2)            # Unfold3D, Room space at its 2 px default
RU.optimize("body_geo", map_size=4096)                      # Power 100, Surfangle 1
cmds.delete("body_geo", constructionHistory=True)
# a limb shell: rows = UV ids of the wrist and shoulder loops in that shell
d = RU.mesh_data("body_geo")
a0 = rows[0][0]                                                   # the row's two far ends
far = max(rows[0], key=lambda i: (d["u"][i] - d["u"][a0]) ** 2 + (d["v"][i] - d["v"][a0]) ** 2)
end = max(rows[0], key=lambda i: (d["u"][i] - d["u"][far]) ** 2 + (d["v"][i] - d["v"][far]) ** 2)
RU.orient_shell("body_geo", far, end, axis="u")                   # Orient to Edges first
RU.straighten_rows("body_geo", rows, axis="v", map_size=4096)    # align, pin, optimize interior, unpin
```

- Unfold3D pins unselected UVs automatically; Legacy pins only the selected ones (Maya 2027 Help).
  Passing a UV subset (`"%s.map[%d]"` strings) unfolds only that part.
- Maya sends Unfold a triangulated mesh, so non-planar quads can create non-manifold cases the quad
  mesh does not show (Maya 2027 Help, Prepare a UV mesh, step 2). When Unfold refuses a mesh that
  audits manifold: triangulate a duplicate, run Mesh > Cleanup in select mode with Nonmanifold
  geometry on it, and fix the reported faces on the real mesh.
- `straighten_rows` refuses a row that runs along the axis it would align (it would collapse to a
  point): orient the shell first.
- MLC: Straighten UVs on a whole shell with varied angles "makes a mess"; align the border rows, pin
  them, optimize the interior ([00:04:13] [00:04:49] [00:05:19]). Some stretch is the price ("a
  balancing act", [00:05:53]).
- Wrinkled meshes: map a smoothed duplicate and transfer back (Maya 2027 Help, Transfer UVs between
  meshes):

```python
dup = cmds.duplicate("body_geo", name="body_smooth_tmp")[0]
cmds.polyAverageVertex(dup + ".vtx[*]", iterations=3)
# ... unwrap dup with P10 and P11 ...
cmds.delete(dup, constructionHistory=True)
RU.transfer_uvs(dup, "body_geo", space="topology")       # sampleSpace enum [verify]: job_probe_commands
```

## P12. Symmetrize and stack mirrored shells

Test: `job_uv.py` ("stacked: exactly one overlapping shell pair", "offset stack sits in tiles 1001
and 1002"). Mirroring verified offline.

```python
RU.mirror_uvs("body_geo", axis=0, source_sign=1, mode="mirror")              # symmetrize (film, continuous)
RU.mirror_uvs("arms_geo", axis=0, source_sign=1, mode="stack")               # games: share texture space
RU.mirror_uvs("arms_geo", axis=0, source_sign=1, mode="stack", offset_u=1.0) # same, moved one tile for baking
```

- "mirror" reflects the finished side across each crossing shell's own center line (the Symmetrize
  tool's result, MLC [00:06:17]); shells that do not cross the center reflect across `u_axis`.
- "stack" only for shells fully on one side, after density is set (MLC [00:11:32]). Not where baked
  AO differs between sides or a logo must stay unique (Maya 2027 Help, Optimizations). For a
  tangent-space bake, offset the mirrored shells by exactly one tile and bake the whole mirrored
  model (Polycount); expect mx_audit to warn about the second tile.

## P13. Texel density: derive, set, count tiles

Test: `job_camera.py` ("footprint matches the pinhole math", "453 px -> 512 -> 1024 px over 10 cm");
`job_uv.py` ("density is 10.24 px/cm (mx_audit)"). Math verified offline.

```python
# film: Paulino, from the closest shot (85 mm, resolution gate, 1920 x 1080 in his example)
den = RU.density_from_camera("mouthpiece_geo", "closest_shot_cam", piece_size=None)
target = den["px_per_cm"]                                   # e.g. 102.4 for a 10 cm piece at 453 px
# games: the density one map can hold for this surface
a = mx_audit.audit("body_geo")
target = RU.density_for_budget(a["surface_area"], tiles=1, tile_px=4096, packing=0.7)
# set it, with a head bias for games (MLC scales the head up: the focal point)
td = RU.set_texel_density("body_geo", target, map_size=4096, bias={head_shell_id: 1.5})
print(mx_audit.audit("body_geo", texture_size=4096)["uv"]["texel_density"])      # the gate reads it back
est = RU.udim_estimate(a["surface_area"], target, tile_px=4096)                  # film: tile count
```

- Paulino: UV pixels for the reference piece = 2 x its screen pixels at the closest framing, a power
  of two; one density everywhere; measure one shell at a time (Maya's Measure misreports several)
  (iL2iXizf9xM [00:02:33] [00:04:11]). Better slightly more than less, never "a crazy amount of
  tiles" ([00:03:04]).
- The 1.5 head bias is [added]; MLC scales the head "up" without a number ([00:10:57]). Decide it
  from the closest shot of the face.
- An odd shell that would span many tiles: halve its UV scale and give its tile a 2x map (8K instead
  of 4K), density preserved (Paulino after Justin Holt, [00:05:48]); record it with
  `RU.udim_table(d["u"], d["v"], d["fuv"], 4096, overrides={1004: 8192})` for the painter.
- Engines: stay in 0-1 per texture set; UDIM is film and TV (Polycount, UV Address Modes).

## P14. Layout with mip-safe padding, UDIM distribution

Test: `job_uv.py` ("layout with scale off keeps 10.24 px/cm", "layout keeps UVs inside 0-1");
u3dLayout flags and enums [verify] via `job_probe_commands.py`.

```python
pad = RU.mip_padding(4096, smallest_size=1024)          # 16 px shells, 8 px border
dropped = RU.layout("body_geo", map_size=4096, shell_px=pad["shell_px"], border_px=pad["border_px"],
                    scale_mode="off", rotate_step=90)   # keep the density just set
dropped = RU.layout("hero_geo", 4096, 16, 8, scale_mode="off", tiles=(3, 1))   # film: across 1001-1003
```

- Maya 2027 Help: Room space stays 2 px (raising it slows and distorts); padding is Layout's Shell
  Padding and Tile Padding, 4 / 2 px on the final map, doubled for every mip or LOD step.
- Scale Mode Uniform (the UI default) rescales everything to fill the tile: fine for a game set when
  you then read and report the achieved px/cm, wrong after a film density was set [added].
- Divide and conquer: largest and oddest shells first, consider 2:1 or 4:1 maps (Maya 2027 Help,
  Optimizations).

## P15. UV gate and visual review

Test: `job_uv.py` ("UV sheet images written", "hard edges all on UV seams or borders");
`job_review.py` ("checker sheet written", "mx_review.\_Session.\_build restored"). Padding,
distortion and sheet drawing verified offline.

```python
uv = RU.uv_report("body_geo", map_size=4096, smallest_mip=1024, target_density=20.48, tolerance=0.10,
                  stacked_ok=False, profile="game", images_dir=out + "/uv", check_hard_edges=True)
print(uv["ok"], uv["fails"], uv["padding"], uv["distortion"], uv.get("density_off_target"))
chk = RU.checker_review(["body_geo"], out + "/checker", map_size=4096, square_px=64,
                        views=("front", "side", "threequarter"))
close = RU.checker_review(["body_geo"], out + "/checker_face", 4096, 64, ("front",),
                          focus=((0.0, 163.0, 5.0), 14.0))
```

Open `uv["images"]` (shells with padding problems as magenta dots; distortion blue sparse, red
dense) and both checker sheets: squares even and square across the body (MLC [00:09:51]: "roughly
even"), seams where the camera does not look, squares on the face small at the close-up.
`checker_review` drives mx_review's clay shader with a checker for the call only; it runs headless
in an mx_run child (Arnold). Paulino's projection test in Mari maps to a close-up render with a
high-frequency texture: blurred squares mean more density.

## P16. Lightmap UV set

Test: `job_uv.py` ("lightmap set exists and map1 stays current", "lightmap set has no overlaps").

```python
lm_rep = RU.lightmap_set("crate_geo", name="lightmap", source="map1", map_size=256)
print(mx_audit.audit("crate_geo", texture_size=256, uv_set="lightmap")["uv"])
```

Maya 2027 Help, Mapping UVs for lightmaps: duplicate the set, uniform density, unstack; cut and
unstack again if overlaps remain. The set order and naming the engine expects (UV channel 1) are
scenario-maya-pipeline-scripting's export checks.

## P17. Bake prep and the handoff package

Test: `job_bake_prep.py` ("high pokes outside the low", "the whole high sits inside the cage",
"projected low lies on the high", "every hard edge sits on a UV seam", "bake copy is all
triangles"). Seam and split-vertex logic verified offline.

```python
RU.harden_uv_borders("body_geo")                         # game lows: hard edges = UV seams (Polycount)
chk = RU.bake_check("body_geo", src)                      # deviation both ways, suggested cage offset
RU.project_to_surface("prop_low", "prop_high")            # On Mars: shrink-wrap the low onto the high
cage = RU.make_cage("body_geo", chk["suggested_cage_offset_cm"], name="body_cage")
bake = RU.bake_copy("body_geo", name="body_bake")         # one triangulation for baker and export
d = RU.mesh_data("body_geo", hard=True, normals=True)
package = {"low": bake, "high": src, "cage": cage, "cage_offset_cm": chk["suggested_cage_offset_cm"],
           "map_size": 4096, "px_per_cm": 20.48, "uv_sets": d["uv_sets"],
           "udims": RU.udim_table(d["u"], d["v"], d["fuv"], 4096),
           "engine_vertex_estimate": RU.split_vertex_estimate(d["faces"], d["fuv"], d["normal_ids"])}
```

- Polycount: triangulate before baking and export the same triangulation; hard edges on every UV
  seam; bake the whole mirrored model with mirrored UVs offset one unit; vertex count (UV seams,
  hard edges, materials) is the real cost.
- On Mars: a low that hugs the high needs no custom cage; round high corners need real edges on the
  low ([00:12:50]).
- The bake itself (normal, AO, curvature, color from the AI texture) is scenario-maya-lookdev's;
  hand over this package and the `uv_report` JSON.

## P18. AI-generated character to animation-ready mesh (end to end)

Test: `job_ai_character_smoke.py` (the same composition on a synthetic fused, triangulated,
lamina-carrying "AI mesh").

```python
def finish_ai_character(src, template, template_ids, lm, out, budget_note):
    report = {"assumptions": [budget_note]}
    # 1 intake (P1) and prep (P2)
    report["intake"] = {k: mx_audit.audit(src).get(k) for k in ("tris", "lamina_faces", "non_manifold_edges",
                                                                 "symmetry_pct", "dimensions")}
    work, report["prep"] = RU.prep_source(src)
    proxy, _ = RU.decimate(work, 250000)
    # 2 head and body from the approved base (P4); limbs the base lacks as tubes (P5)
    marks = {k: (template_ids[k], lm[k]) for k in template_ids if k in lm}
    body, report["fit"] = RU.fit_template(template, src, marks, name="body_geo")
    # 3 cavities (P7), relax and center (P8)
    body, _ = RU.cavity(body, lm["mouth_center"], depth=3.0, steps=3, scale=0.85, name="body_geo_c")
    RU.relax_project(body, src, iterations=3, center_axis=0)
    RU.snap_center(body, 0, 0.01)
    # 4 gate (P9)
    report["retopo"] = RU.retopo_report(body, src, openings={"eye_L": {"point": lm["eye_center_L"]}},
                                        joints={"elbow_L": {"center": lm["elbow_L"], "axis": (1, 0, 0),
                                                            "radius": 6.0}})
    # 4b deformation-ready gate before UVs (P19, P20): chain and eyeball from the landmarks
    arm = [lm["shoulder_L"], lm["elbow_L"], lm["wrist_L"], lm["fingertip_L"]]
    report["deform"] = RU.deform_test(body, arm, [{"name": "elbow_130", "joint": 1, "angle": 130, "axis": (0, 1, 0)},
                                                  {"name": "forearm_twist", "joint": 1, "angle": 80, "kind": "twist"}])
    if cmds.objExists("eyeL_geo"):                              # the eyeball mesh, separate and forward
        report["lids"] = RU.lid_check(body, "eyeL_geo", eye_point=lm.get("eye_center_L"))
    # 5 UVs (P10 to P15)
    d = RU.mesh_data(body)
    T = RU.Topology(d["faces"], len(d["points"]))
    seams = []
    for c, ax, kind, pref in ((lm["neck_base"], (0, 1, 0), "ring", None),
                              (lm["elbow_L"], (1, 0, 0), "along", (0, -1, -1))):
        seams += RU.loop_keys(body, *RU.seam_seed(d["points"], T, c, ax, 8.0, kind, pref))
    RU.planar_base(body, "z")
    RU.cut_seams(body, seams)
    RU.unfold(body, map_size=4096)
    cmds.delete(body, constructionHistory=True)
    target = RU.density_for_budget(mx_audit.audit(body)["surface_area"], 1, 4096)
    RU.set_texel_density(body, target, 4096)
    RU.layout(body, 4096, 16, 8, "off")
    report["uv"] = RU.uv_report(body, 4096, 1024, target, images_dir=out + "/uv", profile="game",
                                check_hard_edges=True)
    # 6 bake prep (P17)
    RU.harden_uv_borders(body)
    report["bake"] = RU.bake_check(body, src)
    report["bake_copy"] = RU.bake_copy(body)
    report["sheets"] = mx_review.review([body], out + "/final", modes=("wire", "clay"))["sheet"]
    return body, report
```

Report honestly what the agent did not plan: face loops come from the base, not from the source's
anatomy; parts outside the base (loose clothes, hair clumps) need P5 or P6 or a human Quad Draw
pass; a posed or expressive source was not neutralized; a `topology` verdict from P19 blocks the
handoff (fix, rerun, compare), a `rig` verdict travels as a note. Then hand off per SKILL.md.
(`job_ai_character_smoke.py` does not cover step 4b; `job_deform_ready.py` does.)

## P19. Deformation-ready gate: is a bad bend the modeler's or the rigger's fault

Test: `job_deform_ready.py` ("ringed arm: 45 deg clean, 120 deg rig", "tilted joint loops: topology
verdict", "swap test: the ringed arm beats the tilted one", "posed review sheet written and the
posed copy deleted", dgaTension probe). Pure logic ran offline: `test_offline_math.py` (aligned,
tilted, spiral and sparse tubes, twist, jaw hinge grids) and `test_offline_fake_maya.py` (copies,
review plumbing, cleanup).

```python
arm = [lm["shoulder_L"], lm["elbow_L"], lm["wrist_L"], lm["fingertip_L"]]      # root side first
bends = [{"name": "elbow_90", "joint": 1, "angle": 90, "axis": (0, 1, 0)},     # axis: the joint's hinge axis
         {"name": "elbow_130", "joint": 1, "angle": 130, "axis": (0, 1, 0)},
         {"name": "forearm_twist", "joint": 1, "angle": 80, "kind": "twist"},  # judged mid-forearm
         {"name": "wrist_60", "joint": 2, "angle": 60, "axis": (0, 0, 1)}]
rep = RU.deform_test("body_geo", arm, bends, review_dir=out + "/rom")          # one pose sheet per bend
print(rep["verdict"], rep["fails"])                    # "topology" blocks the handoff
for b in rep["bends"]:
    print(b["name"], b["diagnosis"], b["loop"], b["section"], b["metrics"]["shear_mean_deg"])
jaw = {"name": "jaw_open", "kind": "hinge", "pivot": lm["jaw_pivot"], "axis": (1, 0, 0), "angle": 20,
       "plane": (lm["mouth_corner_L"], (0, -1, 0)), "blend": 1.5, "region": (lm["chin"], 8.0)}
face = RU.deform_test("head_geo", [], [jaw], review_dir=out + "/jaw")
fix = RU.deform_test("body_v2_geo", arm, bends)         # a candidate fix, or a P5 tube of the same limb
print(RU.compare_variants(rep, fix))                    # antCGi's swap test: which variant deforms better
```

- Why: a model meant for animation is tested "before it's passed on to be textured" (antCGi
  x07USYlvu2o [00:00:00]), and the test must say who fixes what: at the wrist and ankle the edge
  flow is wrong and must be rebuilt, at the elbow "the topology is okay so it would need something
  extra in the rig" ([00:10:27] [00:11:04] [00:17:37]); "reworking the topology would be much
  better" than correctives when the flow is the cause, proven with the same weights on both meshes
  ([00:16:24]). Knees, elbows and buttocks need correctives and extra joints, not modeling changes
  ([00:20:21]).
- The bind is a proxy [added]: no skinCluster; weights are a smoothstep of one limb radius across
  the joint's bisector plane, computed from rest positions and the chain, so any two topologies of
  the same surface get identical weights (what the swap test needs); the pose is a linear blend,
  like a smooth bind. Twist spreads along the segment like twist joints and is judged mid-limb,
  never at the shoulder or wrist (antCGi [00:08:40] [00:11:04]). A face hinge (jaw open, brow raise)
  blends across a plane you place on the hinge line (the lip-corner-to-jaw-corner loop), limited to
  a region. Real skinning, the ROM file and correctives are scenario-maya-deformation's.
- Metrics per bend, on the faces of the joint band: area ratio (faces under 0.3 = collapse, the
  organic digest's [added] red flag), normal flips against the rest normal carried by the face's own
  rotation (a rotated forearm is not a flip), shear = the largest corner-angle change, skew-dominant
  when it exceeds the largest |ln edge ratio| (Jessica ZiYEO49B768 [01:13:06]; topology digest P7
  step 5) [added formula], the joint loop's area posed against rest, and the same for an ideal ring
  (the joint loop projected into the joint plane) under the same weights.
- Verdict (`diagnose_bend`): topology when there is no closed loop around the limb at the joint, the
  joint loop leans more than 20 degrees off the bone, fewer than 3 loops cross the band (Jessica
  [01:15:51]), a pole sits in the band, the along-limb loop turns more than 15 degrees around the
  bone across the band (a loop "spiraling down the arm", Jessica [01:12:33]), or the joint loop
  keeps under 0.8 of the ideal ring's area; rig when only the ideal ring itself keeps under 0.7 of
  its area (scenario-maya-deformation's [added] section line) or faces collapse on a clean layout.
  Hinges (`diagnose_hinge`): topology when the band's mean shear exceeds 10 degrees: run one loop
  flat along the hinge line (Jessica [01:30:10]). Every threshold is [added].
- Measured offline on synthetic meshes [added]: a ringed arm is clean at 45 degrees and rig at 120
  (the joint loop keeps cos(half the angle): 0.92, 0.71, 0.50 at 45, 90, 120); loops tilted 40
  degrees, rings turning 5 degrees each, or rings 3 cm apart on a 2 cm arm are topology; a 90 degree
  forearm twist keeps 0.5 of the mid section (rig: twist joints). A linear blend shears the inner
  half of a perfect ring layout at 90 degrees (a fifth to a third of the band quads skew-dominant),
  so shear never convicts a limb; on a jaw hinge a grid along the hinge line shears 4 to 6 degrees
  on average, 15 degrees off 16 to 24, 45 degrees off every quad.
- Order: after P9 and before UVs (antCGi moves to UVs after the test, [00:22:18]); a topology fix
  after UVs costs a UV transfer (P8). A `topology` verdict blocks the handoff; fix, rerun the same
  bends, and keep the `compare_variants` result as the proof. A `rig` verdict travels in the handoff
  as a note (which hinge, which angle, how much area is lost).
- `RU.tension_node(posed, rest)` [verify] builds the 2026.3 `dgaTension` node (stretch and squash
  against reference geometry, Edge or UV method; What's New in Maya 2026) on a posed copy
  (`keep=True`) for a heat map through `dgaVisualizer` in a GUI session; its attribute names are
  probed by `job_probe_commands.py`. The gate's numbers come from `deform_test`, not from the node.
- Binding by hand instead (antCGi's recipe; details and anything beyond a throwaway test belong to
  scenario-maya-deformation): root joint at the center so the body does not follow the shoulder
  ([00:03:34]); Bind Skin with Initialize Skin Layers left off (the 2027 default), so the classic
  tools and `skinPercent` floods keep working (the DefTest note; maya-version-deltas § 2.3 lists
  what initialized layers block); topology can be edited on the skinned test mesh, then Edit >
  Delete by Type > Non-Deformer History, never History ([00:11:37] [00:12:41]); unbind with Delete
  history to return to the bind pose ([00:13:49]); face tests with joints, not blend shapes, while
  the topology may still change ([00:19:00]).

## P20. Lids fitted over the real eyeballs

Test: `job_deform_ready.py` ("lid_check: eyeball center at the origin, radius 1.2", "2 lid loops
fail the blink, 6 pass"). Pure logic ran offline: `test_offline_math.py` (lids 0.3 mm off a 1.2 cm
eyeball with 2 and 6 loops, a floating lid, a lid inside the eye); `test_offline_fake_maya.py`
against a faceted eyeball mesh.

```python
rep = RU.lid_check("head_geo", "eyeL_geo")      # eyeball separate, looking +Z, Y up (the handoff pose)
print(rep["ok"], rep["fails"], rep["rest"], rep["blink"], rep["border_gap_max"], rep["blink_deg"])
rep = RU.lid_check("head_geo", "eyeL_geo", eye_point=lm["eye_center_L"])     # after an eye pouch (P7)
```

- Why: the lids "need to sit over the top of the eyeballs", modeled around eyeballs placed in the
  scene (antCGi RlNnp4qQIrU [00:08:24]); a lid joint rotated with too few loops moves the lid down
  "a little flat" and it pops through the cornea; more lid loops give it a curve over the eye
  (x07USYlvu2o [00:15:18] [00:15:50]).
- Rest: no lid vertex and no edge midpoint inside the eyeball; the lid border no farther than 0.1 of
  the eyeball radius from it [added]. Blink [added]: the upper lid turns about the eyeball center
  (the eye's left-right axis) until its top border vertex meets the bottom one; weights fall with
  elevation over the same angle and the corners stay pinned, so two topologies get the same weights;
  then the same clearance. Edge midpoints matter: with 2 or 3 loops every vertex stays outside while
  the chords cut the eyeball; 4 and 6 loops stay clear (offline, 1.2 cm eye, lid 0.3 mm off).
- The eyeball center is its bounding box center, its radius the mean distance of its points [added];
  the check uses the eyeball mesh's own closest points (SurfaceProjector), so a cornea bulge counts.
- Run it before the eye pouch (P7) or pass `eye_point` on the lid-margin opening: after the pouch
  the margin is no longer a border and the nearest border is the pouch's back edge.
- Fix: add loops across the lid, refit to the eyeball (P4 relax and project onto the source, then
  check again); keep upper and lower counts equal (P9).

## P21. High vs low overlap renders

Test: `job_deform_ready.py` ("a low 20% smaller shows the high outside it"). The pixel comparison
ran offline (`test_offline_math.py` "silhouette overlap"); the plumbing against a stubbed
`mx_review.review` in `test_offline_fake_maya.py`.

```python
ov = RU.overlap_review("body_geo", "scan_high", out + "/overlap", views=("front", "side", "threequarter"))
print(ov["ok"], ov["fails"], {v: r.get("xor_share") for v, r in ov["views"].items()})
```

- Why: On Mars checks a low against its high with flat-black silhouettes and with contrasting
  materials on the two overlapping meshes (YDu9pYMkkSM [00:01:16] [00:07:27]; hygiene digest
  procedure F).
- Here: mx_review silhouettes of the high and of the low from the same cameras (one focus sphere
  around the high), the share of pixels that differ per view (warn above 2% [added]), and a diff
  image per view: gray both, red where the high pokes out of the low (the bake misses it: add
  silhouette edges, On Mars [00:12:50]), blue where the low is bigger. Open the diff images with the
  clay sheets; the numbers complement P9's two-way deviation and P17's `bake_check`.
