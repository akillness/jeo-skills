# scenario-maya-fx procedures (full code)

Every procedure: **verified on Maya 2027.x: not yet run in Maya** (Maya not installed on 2026-09-24)
unless it says "offline". Names marked [verify] are answered by
`tests/code/maya-fx/job_00_fx_probe.py`; after the first `python3 tests/code/maya-fx/run_all.py`,
replace each [verify] here with what `archive/tests/maya-fx/<stamp>/results/job_00_fx_probe.json`
recorded.

Setup for every snippet (headless through `mx_run`, or in the GUI through `mx_bridge`, which already
has the scenario-maya-expert scripts on `sys.path`):

```python
import sys
sys.path.insert(0, "<project>/skills/scenario-maya-fx/scripts")      # mx_fx adds scenario-maya-expert/scripts itself
import maya.cmds as cmds, maya.mel as mel
import mx_fx, mx_audit, mx_review
```

Headless run:
`python3 <skills>/scenario-maya-expert/scripts/mx_run.py --scene shot.ma --plugins abc,bifrost job.py -- args`,
one child per job, `--save-as` a new version.

---

## F0. Discovery before scripting a name you have not seen work

Test: `job_00_fx_probe.py`. Status: not yet run in Maya.

Nucleus, Bifrost and MASH scripting names are not in the saved documentation. Three ways to learn
them, in this order:

```python
cmds.allNodeTypes()                                   # node types: nucleus, nCloth, nRigid, MASH_*, bifrostGraphShape
cmds.listAttr("nucleus1")                             # real attribute names (substeps is subSteps? [verify])
cmds.attributeQuery("inputAttractMapType", node="nClothShape1", listEnum=True)   # enum labels, never ints
mel.eval('whatIs "createNCloth"')                     # MEL procedure behind a menu, and its .mel file
cmds.help("vnnCompound")                              # flags of a command
mx_fx.bifrost_library()                               # {node: [namespace]} from the Bifrost compound files [added]
```

In a GUI session: Script Editor > History > Echo All Commands on, do the action once from the menu,
copy the echoed MEL, turn Echo off (MASH digest [added]).
`mx_fx.resolve_attr(node, "subSteps", "substeps")` and
`mx_fx.set_attrs(node, values, mx_fx.NUCLEUS_ATTRS)` resolve names at run time and log what was
missing.

## F1. Scale gate (every solver)

Test: `test_fx_offline.py` (offline, passed 2026-09-24) and `job_ncloth_cape.py`.

```python
rep = mx_fx.scale_report(["body_GEO"], expected_size_m=1.8)
# {"unit": "cm", "size_units": 180.0, "real_m": 1.8, "solver_m": 1.8, "recommended_scale": 0.01, "problems": []}
cmds.setAttr("nucleus1.spaceScale", rep["recommended_scale"])            # Nucleus (2027 Help: 0.01 for cm)
# Bifrost: the same value on aero_solver_settings / mpm_solver_settings / liquid settings:
#   scene_units_in_meters = mx_fx.solver_scale(cmds.currentUnit(q=True, linear=True))
```

MPM: after any change of `scene_units_in_meters`, re-set `detail_size` (meters) (Gast [00:07:29]).
An artist's non-physical choice (SARKAMARI's 0.25) goes through
`scale_verdict(..., art_choice=True)` so it is recorded, not hidden.

## F2. Cloth topology gate

Test: `job_ncloth_cape.py`. Status: not yet run in Maya (the verdict logic ran offline).

```python
r = mx_audit.audit("cape_GEO")
problems = mx_fx.cloth_topology_verdict(r, expected_border_loops=1)   # cape 1, trousers 3, shirt 4 [added]
assert not [p for p in problems if p.startswith("error")], problems
```

Errors: n-gons (convert with Multi-Cut), non-manifold, lamina, wrong number of open borders (seal
pockets and zippers, or the mesh is double-sided). Warnings: triangles over 5% (cross links need
quads), uneven edge length (SARKAMARI [00:02:28] to [00:04:53]; 2027 Help, nCloth overview).

## F3. Bind pose and pre-roll

Test: `job_ncloth_cape.py`.

```python
ctrls = ["root_CTL", "spine_CTL", "chest_CTL"]            # every animated control that moves the body
bind = mx_fx.get_pose(ctrls, time=None)                     # capture BEFORE keys exist, or read defaults
plan = mx_fx.add_preroll(ctrls, action_start=1, hold=25, blend=25, rest=bind)
# plan: {"nucleus_start": -49, "hold": (-49, -24), "blend": (-24, 1), "keyed": n, "skipped": [...]}
```

`rest="defaults"` uses attribute defaults (right for zeroed control rigs); `rest="first_pose"` only
buys settling time. Attributes already keyed before the action are skipped and listed: shift the
animation instead (Julan: move all keys 24 frames later, key the A-pose at 0):

```python
curves = cmds.listConnections(ctrls, type="animCurve") or []
cmds.keyframe(curves, edit=True, relative=True, timeChange=24)
```

## F4. Sim duplicates driven by blend shapes

Test: `job_ncloth_cape.py`.

```python
cmds.currentTime(plan["nucleus_start"], update=True)                 # bind frame
body = mx_fx.sim_duplicate("body_GEO", name="body_SIM")              # duplicate, unlock TRS, unparent
cape = mx_fx.sim_duplicate("cape_GEO", name="cape_SIM")              # blendShape(orig -> dup, weight 1)
cmds.setAttr("char_GRP.visibility", 0)                               # originals untouched, hidden
```

Gate: the duplicate's nearest deformer is the blend shape; at any frame its points equal the
original's within 0.01 cm (SARKAMARI [00:11:18]). The garment must be skinned to the skeleton first
(Skin > Bind Skin to the joints it follows, [00:08:20]).

## F5. nCloth rig on a character

Test: `job_ncloth_cape.py`.

One call:

```python
rig = mx_fx.build_cloth_rig(cape["sim"], body["sim"], action_start=1, preset="heavy_denim",
                            thickness=0.5, collider_thickness=0.5, pin="attract_lock", name="cape")
rig["verdict"]      # nucleus_verdict: [] when iterations > substeps, scale physical, pre-roll >= 25
rig["log"]          # every attribute set, missing or failed
```

What it does, spelled out (all MEL names [verify]):

```python
c = mx_fx.make_ncloth("cape_SIM", name="nCloth_cape")                 # select + mel "createNCloth 0;"
r = mx_fx.make_collider("body_SIM", nucleus=c["nucleus"])             # mel "makeCollideNCloth;"
mx_fx.set_attrs(c["nucleus"], dict(startFrame=-49, spaceScale=0.01, substeps=10, maxCollisionIterations=12),
                mx_fx.NUCLEUS_ATTRS)                                  # first pass; final 30 / 35
mx_fx.set_attrs(c["cloth"], dict(mx_fx.CLOTH_PRESETS["heavy_denim"], thickness=0.5), mx_fx.CLOTH_ATTRS)
mx_fx.set_attrs(r["rigid"], {"thickness": 0.5})
cmds.playbackOptions(minTime=-49, playbackSpeed=0)                    # GUI: play every frame
```

Garment starts (SARKAMARI, on a T-shirt preset): `mx_fx.SARKAMARI_START["trousers"]` (friction 0.1,
stretch 80, compression 20, damp 0.4, mass 0.8, max self-collide iterations 8, trapped check, push
out 0.01 [?]) and `["loose_shirt"]`. Leave rigidity and restitution angle and tension at 0 on
garments ([00:24:50]). Presets assume substeps 3, iterations 4 and Space Scale 1 (2027 Help), so
re-tune after changing scale.

Pins, two options:

```python
top = mx_fx.vertices_near("cape_SIM", axis=1, side="max", within=0.5)    # collar row, selection-free [added]
# a) input-attract lock [added recipe from the doc's Input Mesh Method]
vals = mx_fx.collar_attract_values("cape_SIM", top, band=8.0)            # 1 on the row, 0.7 -> 0 over 8 cm, smoothed
mx_fx.set_vertex_map(c["cloth"], "inputAttract", vals)
mx_fx.set_attrs(c["cloth"], {"inputMeshAttract": 1.0, "inputAttractMethod": "lock",
                             "collideLastThreshold": 1.0}, mx_fx.CLOTH_ATTRS)
# b) Point to Surface with Exclude Collisions (SARKAMARI's waistband, [00:22:27], [00:23:40])
mx_fx.point_to_surface(["cape_SIM.vtx[%d]" % i for i in top], "body_SIM", name="pts_cape_collar",
                       exclude_collisions=True, tangent_strength=0.1,   # > 0 to collide (doc); 0.1 [added]
                       cloth=c["cloth"])                                 # members rewritten onto the input mesh
```

Constraint sets belong on the input mesh, or they risk a Dependency Graph loop (2027 Help, Tips).
After `createNCloth` the transform shows the output mesh, so `"cape_SIM.vtx[3]"` resolves to it
[verify]: pass `cloth=` and `point_to_surface` rewrites the members by index onto
`mx_fx.input_mesh(cloth)`, then raises if `constraint_members_verdict` still finds one on
`mx_fx.output_mesh(cloth)`. The GUI equivalent is nCloth > Display Input Mesh before picking. The
same rule holds for every set-based constraint (Slide on Surface, Tearable Surface, Component to
Component). Edge-loop picks without a mouse: `cmds.polySelect("trousers_SIM", edgeLoop=e, ns=True)`
then `cmds.polyListComponentConversion(edges, toVertex=True)` [verify].

## F6. Painted maps without a brush

Test: `test_fx_offline.py` (distance, falloff and smoothing math, offline) and `job_ncloth_cape.py`
(the map write).

```python
pts = mx_fx.get_points("trousers_SIM")
counts, connects = mx_fx.get_topology("trousers_SIM")
edges = mx_fx.edges_from_faces(counts, connects)
waist = mx_fx.vertices_near("trousers_SIM", axis=1, side="max", within=1.0)
d = mx_fx.graph_distance(pts, edges, waist)
rest = mx_fx.falloff_values(d, 5.0, 15.0, 0.9, 1.0)          # 0.9 tight near the waist, 1.0 below
rest = mx_fx.smooth_values(rest, mx_fx.neighbors(len(pts), edges), iterations=3)   # Smooth + Flood
mx_fx.set_vertex_map("nClothShape_trousers", "restLengthScale", rest)
mx_fx.vertex_map_attrs("nClothShape_trousers")               # every <base>MapType / <base>PerVertex pair [verify]
```

SARKAMARI's regions: rest length 0.9 where tighter, 0.5 against bunching, input attract around a
rigid collar and shoulders, damp in a bunching region; always smooth (RhAxSgPpZww [00:27:36],
[00:34:51], [00:38:23]). Distance sources can also be a joint position, a UV range or a color set
[added].

## F7. Run, measure, verdict

Test: `job_ncloth_cape.py`; the metric math offline in `test_fx_offline.py`.

```python
rep = mx_fx.sim_report(rig["cloth_out"], body["sim"], rig["start"], 120, action_start=1, hold=25,
                       thickness=0.5, reference_speed=12.5)     # character speed in cm/frame
mx_fx.to_json(rep, "/abs/out/sim_report_v003.json")
for line in mx_fx.sim_verdict(rep, budget_spf=brief_seconds_per_frame):   # the budget comes from the brief
    print(line)
```

Performance gate: the nucleus Timing Output (Frame or Subframe) prints the solve time per frame or
substep to the Script Editor and is the doc's measurable gate (2027 Help, Nucleus node).
`mx_fx.nucleus_timing_output(nucleus, "frame")` turns it on [verify labels], `"none"` off;
`sim_report` also times every frame in Python, and `sim_verdict` runs `mx_fx.timing_verdict` on
those times: median, max, frames over 3 x the median ([added] factor: look for trapped collisions
there) and an error when the median is over budget, naming the cheap levers first (convergence test,
rigidity or deform resistance instead of a huge bend resistance, locked input attract, 2027 Help,
Tips). The same call works on `step_frames` times for Bifrost. It steps every frame in order from
the start (a jump beyond Frame Jump Limit skips the solve, 2027 Help) and measures on the way:
penetrating vertices per frame (signed distance to the closed collider, `method="parity"` for
concave bodies [verify OM2]), edge stretch against the start frame, non-finite frames and speed
pops, residual speed over the last 5 held frames, contact standoff against thickness, seconds per
frame (the doc's Timing Output is the GUI equivalent: nucleus `timingOutput` Frame). Bars are
[added] defaults; SARKAMARI accepts small artifacts hidden by motion blur: record it as an exception
in the report, do not loosen the bar silently.

## F8. Stability across substeps

Test: `job_ncloth_cape.py`.

```python
cv = mx_fx.convergence_test(rig["cloth_out"], rig["nucleus"], rig["start"], 120, factor=2, sample_every=4)
rep["convergence"] = cv          # max_rel, max_frame, coarse_stretch_max, fine_stretch_max
```

Reading [added]: fine run better (less stretch, less penetration after `sim_report` at the higher
substeps) and deviation large: the coarse run is under-stepped, keep the higher substeps (SARKAMARI
10 to 30). Deviation under about 5% of the cloth size and metrics equal: keep the cheaper setting.
Keep iterations above substeps in both runs (the function does). For Aero, the equivalent knob is
`max_steps` / `time_step_size`, raised only when the fluid itself is fast (Stamatelos [00:33:29]);
for MPM, frequent `max_voxel_movement` retries mean lower `time_step_size` (sim guide).

## F9. Caches and the cache-only render scene

Test: `job_ncloth_cape.py` (nCache, Alembic, re-import, render scene) and `job_cache_usd.py` (paths
with spaces, sub-frames).

```python
print(mx_fx.ncache_check(rig["cloth"], rig["start"], 120, fmt="mcx")["problems"])   # size estimate, moving transform
nc = mx_fx.ncache_create([rig["cloth"]], rig["start"], 120, "/abs/cache/ncache", name="cape_v003", fmt="mcx")
mx_fx.disable_nucleus(rig["nucleus"])               # scrub the cache fast (2027 Help, Tips)
abc = mx_fx.alembic_export([rig["cloth_out"]], "/abs/cache/cape_v003.abc", 1 - 5, 120 + 5)   # shot + handles
chk = mx_fx.alembic_check(abc["path"], 1 - 5, 120 + 5)   # range, meshes, vertex counts
```

`doCreateNclothCache 5 {...}` argument order is [verify] (the probe saves the procedure source). If
nCache is unavailable, export the Alembic from the nucleus start frame so the solver steps in order,
and state the pre-roll in the handoff. mcx exceeds 2 GB, mcc cannot; nCloth caches hold vertex XYZ
positions only, not the pMesh transform (doc, nCache Options).
`mx_fx.ncache_verdict(n_vertices, start, end, fmt, one_file, evaluate_every)` estimates the largest
file (positions only, 8 bytes a value as the worst case [added]) and errors on an mcc file over 2
GB; `ncache_create` runs it first. A cloth transform that is keyed, constrained or under a moving
parent is not in the cache: keep it static, or deliver world-space Alembic. Sub-frame samples for
motion blur: `step=0.5` [added, verify with the renderer].

Render scene (SARKAMARI [00:40:07]), as its own mx_run child so the shot scene is never replaced:

```python
import mx_fx, maya.cmds as cmds
def main(argv):
    out, abcs = argv[0], argv[1:]
    mx_fx.ensure_plugin("AbcImport")
    for p in abcs:
        cmds.AbcImport(p, mode="import")                                   # [verify flag]
    bad = cmds.ls(type=("nucleus", "nCloth", "nRigid", "skinCluster", "joint", "blendShape")) or []
    assert not bad, bad
    cmds.file(rename=out); cmds.file(save=True, type="mayaAscii", force=True)
    return {"scene": out, "caches": abcs}
```

## F10. Layered garments

Test: none yet (built from F5 to F9 calls; covered by their tests).

SARKAMARI simulates one layer, caches it, collides the next against the cache ([00:31:31] to
[00:32:38]):

```python
t = mx_fx.build_cloth_rig(trousers["sim"], body["sim"], 1, preset=mx_fx.SARKAMARI_START["trousers"],
                          pin="point_to_surface", pin_vertices=waist, name="trousers")
# ... measure, iterate, final pass
abc = mx_fx.alembic_export([t["cloth_out"]], "/abs/cache/trousers_v004.abc", t["start"], 120)
mx_fx.set_attrs(t["cloth"], {"isDynamic": 0})
for con in cmds.ls(type="dynamicConstraint") or []:
    mx_fx.set_attrs(con, {"enable": 0})                                   # [verify attribute]
cmds.setAttr(t["cloth_xform"] + ".visibility", 0)
new = set(cmds.ls(assemblies=True)); cmds.AbcImport(abc["path"], mode="import")
trousers_cache = sorted(set(cmds.ls(assemblies=True)) - new)[0]
mx_fx.make_collider(trousers_cache, nucleus=t["nucleus"], name="nRigid_trousers")
s = mx_fx.build_cloth_rig(shirt["sim"], body["sim"], 1, preset="tshirt",
                          start_values=mx_fx.SARKAMARI_START["loose_shirt"], pin=None, name="shirt")
```

`build_cloth_rig` makes its own collider for the body; with an existing body collider, call
`make_ncloth` and `set_attrs` directly. Choose simultaneous layers on one nucleus (collision layers)
only when both garments push each other (tucked shirt, belt over a coat) (digest).

## F11. Look at it

Test: `job_ncloth_cape.py --review` (headless Arnold). Status: not yet run in Maya.

```python
for f in (1, 60, 120):                 # action start, peak, last frame; with a cache any order is fine
    cmds.currentTime(f, update=True)   # without one, step in order (mx_fx.run_sim) up to f first
    lo, hi = mx_fx.bbox_cm([rig["cloth_out"], body["sim"]])
    center = [(lo[k] + hi[k]) / 2.0 for k in range(3)]
    mx_review.review([rig["cloth_out"], body["sim"]], "/abs/out/review_f%03d" % f,
                     views=("side", "back", "threequarter"), modes=("clay",), resolution=768, tile=384,
                     focus=(center, mx_fx._dist(lo, hi) / 2.0))     # framed on the character at that frame
```

GUI (bridge):
`mx_review.playblast("/abs/out/cape_v003", start=1, end=120, camera="shotCam", display={"displayAppearance": "smoothShaded", "useDefaultMaterial": True})`,
smooth preview on (SARKAMARI looks with 3 on, [00:37:12]). Open every sheet with the image reader
and score it with `critique.md`.

## F12. Bifrost graph atom (get, modify, set)

Test: `job_bifrost.py` part 1. Status: not yet run in Maya; every VNN flag [verify].

```python
g = mx_fx.BifrostGraph.create("fxAtom")                       # bifrostGraph -create or createNode bifrostGraphShape
sphere = cmds.polySphere(name="src", radius=10, subdivisionsX=60, subdivisionsY=60)[0]
g.add_input("mesh", "Object")                                 # graph input = attribute on the shape
cmds.connectAttr(cmds.listRelatives(sphere, shapes=True)[0] + ".worldMesh[0]", g.shape + ".mesh")
gpp, add, spp = g.add("get_point_position"), g.add("add"), g.add("set_point_position")
g.connect("/input.mesh", gpp + ".geometry")
g.connect(gpp + ".point_position", add + ".value1")
g.set(add, "value2", (0, 5, 0))
g.connect("/input.mesh", spp + ".geometry")
g.connect(add + ".output", spp + ".point_position")
g.add_output("out_mesh", "Object")
g.connect(spp + ".out_geometry", "/output.out_mesh")
cmds.setAttr(sphere + ".visibility", 0)                       # Jason: once it is in, hide it
print(cmds.exactWorldBoundingBox(g.shape), g.log)             # expect y from -5 to 15; the log shows the syntax that worked
```

Jason's watchpoint check (size, min, max) headless: route a `dump_object` into the path to the
output and read its text file (graph doc) [verify node name]. Missing properties return empty
arrays: use `get_geo_property_check` where it matters.

## F13. Aero dust puff when a crate lands

Test: `job_bifrost.py` part 2 (graph, emitter checks, port listing, range verdict); the verdicts ran
offline in `test_fx_offline.py`. [added] recipe assembled from Stamatelos' knob explanations (no
source demonstrates dust); port names [verify].

```python
SHOT, LAND = (1, 120), 40                                     # shot range; the crate lands on frame 40
g = mx_fx.BifrostGraph.create("fxPuff")
basic = g.add("basic_aero_graph"); g.explode(basic)           # source_air, collider, aero_solver_settings, simulate_aero
g.add_input("emitter", "Object"); g.add_input("ground", "Object")
cmds.connectAttr("puffRing_GEOShape.worldMesh[0]", g.shape + ".emitter")   # a ring or patch under the crate [added]
cmds.connectAttr("ground_GEOShape.worldMesh[0]", g.shape + ".ground")
g.connect("/input.emitter", "/source_air.geometry")
g.connect("/input.ground", "/collider.geometry")

# 1. the emitter: Shell for open or flat meshes, Solid for closed ones; Relative unless the size is known
facts = mx_fx.emitter_facts("puffRing_GEO")                   # {"open", "holes", "extent_units", "extent_m"}
vm = g.find_port("/source_air", "geo_volume_mode")            # Solid / Shell per Stamatelos [verify: see below]
if facts["open"] and vm:
    g.set("/source_air", vm, "Shell")                         # Stamatelos [00:10:40]; Jason [00:03:42]
print(mx_fx.aero_source_verdict("Shell" if facts["open"] else "Solid", "Relative", facts["open"]))

# 2. solver settings and the emission window
g.set("/aero_solver_settings", "scene_units_in_meters", 0.01) # true size: small puffs are fast (Stamatelos [00:29:49])
g.set("/aero_solver_settings", "style", "smooth")             # smooth or wispy for a dusty haze, fluffy for billows
g.set("/source_air", "start_frame", LAND)                     # emission starts at the landing; end a few frames later
g.set("/source_air", "temperature", 20)                       # ambient: dust does not rise on its own
# outward initial speed (magnitude and direction ports), positive inherit velocity from the crate,
# lower kill voxel fog threshold for the thin tail, small collider detail size for no gap at the floor

# 3. the sim's own start frame: default 1 on every Bifrost sim (sim guide, Considerations)
print(mx_fx.sim_range_verdict(1, cmds.playbackOptions(q=True, minTime=True), SHOT[0], shot_end=SHOT[1],
                              source_starts=[LAND], cache_range=(SHOT[0], SHOT[1] + 5),
                              review_frames=(LAND + 2, 60, 90, SHOT[1])))   # [] when clean

fc = g.add("file_cache")
g.set(fc, "filename", "<scene_directory>/cache/puff_v001.####.vdb")
g.set(fc, "properties", "voxel_fog_density voxel_velocity")    # only what renders (Jason [00:28:35])
g.set(fc, "mode", "Write"); g.set(fc, "create_directories", True)
g.connect("/simulate_aero.aero_volume", fc + ".object")
g.connect(fc + ".out_object", "/output.aero_volume")
secs = mx_fx.step_frames(SHOT[0], SHOT[1] + 5)                # from the sim start, in order, to the shot end + handles
print(mx_fx.timing_verdict(secs, budget_spf=None)["problems"])
print(mx_fx.file_sequence_report("/abs/cache/puff_v001.####.vdb", LAND, SHOT[1] + 5))
g.set(fc, "mode", "Read")
```

Start frame rules. The sim starts at its own start frame (default 1), which must exist in the
timeline (Nordenstam [00:56:23]: from frame 0 his sim did nothing); frames before it are free for
setup (sim guide). Step from the start frame in order: a sim advances only when the frame is the
last solved one + 1 (graph doc, Custom sims). A shot starting at 1001 needs the sim's start frame
port set (find it in `g.ports("/aero_solver_settings")` and `g.ports("/simulate_aero")` [verify]);
`sim_range_verdict` flags a start outside the timeline. A master start frame overrides every source
and collider start (Stamatelos [00:24:44], [00:37:04]): use it for debugging only. Changing
`geo_detail_size` or `time_step_size`, or creating or exploding a compound that holds the sim, needs
a re-run from the start frame (sim guide, Considerations):
`sim_range_verdict(..., changed=["time_step_size"])` says so; GUI: Edit > Reset Feedback State.

Resolution mode. Relative (default) keeps the voxel count about constant whatever the emitter size;
Absolute is in world units, so a large emitter or a small detail size explodes the count and can
hang Maya (Stamatelos [00:11:08] [00:12:48]; sim guide, Increase detail). Before switching to
Absolute, estimate:

```python
print(mx_fx.aero_source_verdict("Shell", "Absolute", True, extent=max(facts["extent_units"]),
                                detail_size=0.05, voxel_budget=brief_voxels, baseline_detail=0.1))
```

In a cm scene estimate in scene units first (the worst case) until the probe shows whether
`scene_units_in_meters` rescales Absolute detail [verify]. Port names disagree: Stamatelos and the
liquid page call the Solid / Shell switch `geo_volume_mode`, the 2027 Increase detail page gives
that name to Absolute / Relative; `job_bifrost.py` records which ports `source_air` really has.

Fast burst: raise `max_steps` or lower `time_step_size` only because the fluid is fast (Stamatelos
[00:33:29]). A cache output must pass `assign_material` to show in the viewport (Jason [00:29:07]).
Batch Execute with Write State mode is the GUI path that cannot overwrite a cache by accident (graph
doc). Whether stepping `currentTime` in mayapy drives the solve is [verify] (the test records it).
Review the cache at the landing, the middle and the last shot frame (F16): the tail is where thin
smoke vanishes.

## F13b. More Aero detail without a smaller voxel everywhere (2027)

Test: `job_bifrost.py` part 2 adds the three nodes and records their ports (not connected yet).
Names from the 2027 sim guide (Adaptivity, Increase detail); ports [verify].

The sim guide's cheaper routes to detail, in the order to try them before lowering
`fluid_detail_size` for the whole sim:

```python
def out_port(node):                                           # the node's output port, from its listing [verify format]
    return [p for p in (g.ports(node) or []) if "out" in str(p).lower()][0]
# a) sharpening during the sim: keep sharpening_amount low, raise sharpening_radius carefully (slow when high)
ref = g.add("aero_refinement_settings")
g.connect(out_port(ref), "/aero_solver_settings.additional_settings")
# b) adaptivity: auto adaptivity with a coarsen criterion, or resolution bounds from mesh boxes
#    (outside every box the sim runs at its coarsest resolution)
ada = g.add("aero_adaptivity_settings")
g.connect(out_port(ada), "/aero_solver_settings.additional_settings")
# c) after the sim, on the cache: post_refine_aero, faster than (a), but the detail is not fed back
pr = g.add("post_refine_aero")
g.connect(fc + ".out_object", pr + ".aero_volume")            # the cached result
g.connect(out_port("/source_air"), pr + ".sources")           # the original source and collider nodes tell it
g.connect(out_port("/collider"), pr + ".colliders")           #   where detail may go [verify ports]
g.set(pr, "refinement_levels", 1)                             # [added] start; high levels are slow and can add artifacts
mx_fx.step_frames(SHOT[0], SHOT[1] + 5)                       # frames in order, even from a cache
```

`boost_detail_with_points` on the sharpening settings adds particles: less diffusion, more memory
and time. Judge each route in the Arnold review (F16), one change per run.

## F14. MPM snow or dirt impact

Test: `job_bifrost.py` part 3 (graph and ports only).

```python
g = mx_fx.BifrostGraph.create("fxSnow")
basic = g.add("basic_mpm_snow_graph"); g.explode(basic)       # dirt and clay use the snow model (Gast [00:38:34])
v = 6.0                                                       # impact speed, m/s in solver units
g.set("/source_mpm_snow", "initial_firmness", mx_fx.mpm_initial_firmness(impact_speed=v)["initial_firmness"])
g.set("/mpm_solver_settings", "scene_units_in_meters", 0.01)
g.set("/mpm_solver_settings", "link_collider_detail", True)   # 2027: Gast's manual gap fix
# place the chunk just above the collider with initial velocity v (never simulate the flight)
```

Then sweep cohesion (piece size) and friction (shear breakup) one at a time; debris = negative
firmness; loose powder = low or negative initial firmness (Gast [00:47:06], [01:04:21]). Leaks:
collider method Volume, `lag_colliders` (sim guide).

## F15. MPM cloth with pins (flag for a game)

Test: none yet (names from the sim guide and Jason; [verify]).

```python
g = mx_fx.BifrostGraph.create("fxFlag")
basic = g.add("basic_mpm_cloth"); g.explode(basic)
# plane 10 x 5, 32 x 16 segments in; the pole mesh into constrain_mpm.constraint_geometry with the
# constraint shape set to bounding box (Jason: "I found out the hard way"), and into a collider
g.set("/make_mpm_cloth", "area_preservation", 0.1)            # 0 = strongest resistance
g.set("/make_mpm_cloth", "vibration_speed", 40)               # stiffness; raise by 10 until it stops stretching
g.set("/make_mpm_cloth", "collision_max_speed", 20)           # about half the vibration speed
g.set("/make_mpm_cloth", "viscosity", 0)
# remove any direct make_mpm_cloth -> simulate_mpm link, or the cloth simulates twice (sim guide)
```

Measure stretch on the output through a `file_cache` to `.abc`, imported and read with
`mx_fx.stretch_stats` [added]. Wind: speed from a noise kept positive, direction from a baseline
vector plus turbulence, both moved with the frame (Jason cd3HgvM8sXg [00:17:51], yo6y7cANfX0
[00:02:52]).

## F16. Look at a VDB cache in Arnold

Test: none yet (mtoa needed; `volume_review` follows mx_review's render path).

```python
r = mx_fx.volume_review("/abs/cache/puff_v001.####.vdb", frames=(42, 60, 90, 120), out_dir="/abs/out/puff_review",
                        grids="voxel_fog_density", interpolation="tricubic", resolution=512)
r["sheet"]    # open it: spread, curl, dissipation, voxel steps, gap at the floor
```

Frames: just after the landing, the middle, and the last shot frame (the tail is where thin smoke
vanishes; `sim_range_verdict` warns when the review stops early). Lighting for judging: one dim sky
dome from above (Jason's sprite setup). Judge artifacts in the render, not the viewport; try
tricubic before re-simulating (sim guide).

## F17. Explosion or dust sprites for a game engine

Test: `test_fx_offline.py` (framing and sheet, offline, passed). Render part not yet run in Maya.

Passes (Jason bp9ydYUCmx8): emission and `volume_direct` AOVs in one render; tangent-space normals
from an SDF gradient in a second render with the normal shader and grids fog density plus normal
only; 64 frames at 512 x 512, front camera, the whole life of the effect inside the cell.

```python
import glob
import mtoa.aovs as aovs                                      # [verify]
aovs.AOVInterface().addAOV("emission"); aovs.AOVInterface().addAOV("volume_direct")
cmds.setAttr("defaultResolution.width", 512); cmds.setAttr("defaultResolution.height", 512)
for f in range(0, 64):
    cmds.currentTime(f, update=True); mel.eval("arnoldRender -b;")      # [verify]
rep = mx_fx.sprite_sheet(sorted(glob.glob("/abs/out/sprites/beauty.*.png")), "/abs/out/sprites/sheet_v001.png")
assert rep["ok"], rep["touching"]    # a frame touching the cell edge: reposition, re-render
```

`allow_edges=("bottom",)` accepts an effect cut by the ground plane [added].

## F18. USD for Unreal: check and fix

Test: `job_cache_usd.py`.

```python
probs = mx_fx.usd_check_unreal("/abs/out/flag_v002.usda", meters_per_unit=0.01)
mx_fx.usd_fix_normals("/abs/out/flag_v002.usda")              # primvars:normals -> normals (Jason's text fix, scripted)
mx_fx.usd_set_stage_metadata("/abs/out/flag_v002.usda", "Z", 0.01, 24.0)
```

Rules (Jason QMx97b19oHk): up axis Z, meters per unit set, frames per second set explicitly, default
prim, triangulated meshes, unique prim names, display color RGB plus separate opacity, no USD points
or curves (2023 Unreal: convert to meshes; re-check on current Unreal). Animated USD from Bifrost is
written on the last frame: play the whole range, then park the timeline at the start (yo6y7cANfX0
[00:08:15]).

## F19. MASH network, inventory, cache decision

Test: `job_mash.py`. MASH.api is not in any source: [added] [verify].

```python
net = mx_fx.mash_network(["rock_A", "rock_B", "rock_C"], name="rocks", geometry="Repro")
waiter = net["waiter"]
dist = [n for n in mx_fx.mash_nodes(waiter) if cmds.nodeType(n) == "MASH_Distribute"][0]
mx_fx.set_attrs(dist, {"pointCount": 100})                    # [verify name]
idn = net["api"].addNode("MASH_ID")                           # several inputs need an ID node (Waters GzXUcjz-M4E [00:02:15])
reasons = mx_fx.mash_cache_reasons(mx_fx.mash_inventory(waiter))
mesh = mx_fx.mash_output_mesh(waiter)
if reasons["needs_cache"]:
    mx_fx.alembic_export([mesh], "/abs/cache/rocks_v001.abc", 1, 120)    # Repro: Alembic; Instancer: Cache Creator (GUI)
```

Several dynamic networks on one BulletSolver: enable Dynamics on all of them while caching each,
then disable all (Waters Jv_rgrcd3C0 [00:07:03]). Before render: Repro display back to Mesh (not
Proxy), LOD camera = render camera (GzXUcjz-M4E [00:05:38]). Overlaps between instances, on the
Repro mesh (bounding spheres, like the Placer's Strict mode):

```python
pts = mx_fx.get_points(mesh); counts, connects = mx_fx.get_topology(mesh)
spheres = mx_fx.shell_spheres(pts, mx_fx.shells(counts, connects, len(pts)))
mx_fx.overlaps([c for c, _ in spheres], [r for _, r in spheres])      # {"pairs", "sample", "min_gap"}
```

## F20. MASH scatter on a deforming character

Test: none yet (menu utility name [verify]).

Face-area scatter jitters on a skinned mesh (Waters 5UDr_nK9PSs [00:03:53]). Freeze the
distribution: MASH > Utilities > Create Mesh from Points on the Waiter (find its Python with Echo
All Commands), then:

```python
cmds.skinCluster(joints + [points_mesh], toSelectedBones=True, name="points_SKN")
cmds.copySkinWeights(sourceSkin="body_SKN", destinationSkin="points_SKN", noMirror=True,
                     surfaceAssociation="closestPoint", influenceAssociation="oneToOne")
net2 = mx_fx.mash_network(["dot_GEO"], name="dots", geometry="Repro")
# Distribute: input mesh = points_mesh, method Vertex, Flood Mesh on, Calculate Rotation off
```

Gate [added]: per-point displacement between frames never exceeds the body's own maximum vertex
displacement (`mx_fx.motion_stats` on both).

## F21. MASH Python node

Test: `job_mash.py`.

```python
py = net["api"].addNode("MASH_Python")
name = getattr(py, "name", py)
cmds.addAttr(name, longName="py_amp", attributeType="double", minValue=0, maxValue=100, keyable=True)  # on the node itself, py_ prefix, min and max (Waters)
mx_fx.mash_set_python(name, mx_fx.MASH_PYTHON_TEMPLATE)      # compiles the code (Python 3) before writing it
```

The script runs once per evaluation and forgets everything; persist in attributes (JSON strings);
end with `md.setData()`; use OpenMaya 2.0 and the array getters and setters for speed (Waters
ij5ke9ftyH8; 2027 Help). A stateful script is a simulation: cache it.
