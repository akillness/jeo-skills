# Procedures: skinning, Skin Tools, ROM tests, correctives, face, ML data (Maya 2027)

Load when executing a stage of the workflow. Every block states its status and its test. **Status
(2026-09-24): Maya 2027 is not installed. Every block below is NOT YET RUN IN MAYA** except where it
says "ran offline" (pure Python in `mx_skin`, `tests/code/maya-deformation/test_mx_skin_offline.py`,
python3). Run all tests with `tests/code/maya-deformation/run_all.sh`; each Maya test is an mx_run
job
(`python3 <skills>/scenario-maya-expert/scripts/mx_run.py tests/code/maya-deformation/<test>.py`).

Setup for every block (inside mayapy or through the scenario-maya-expert bridge):

```python
import sys
sys.path.insert(0, "<skills>/scenario-maya-deformation/scripts")      # adds scenario-maya-expert/scripts for mx_audit too
import maya.cmds as cmds
import mx_skin as S
```

Conventions: weights `W` are a list of `{physical influence index: weight}` per vertex; points are
cm, world space; `S.read_weights(sc)["influences"]` gives the index order.

---

## P1. Intake: mesh and skeleton gates before any bind

Test: `test_skin_io.py` (precheck part), `test_mx_skin_offline.py` (ray parity and shell volumes ran
offline).

```python
import mx_validate, mx_audit
rep = mx_validate.validate(profile="model", roots=["body_geo"])           # scenario-maya-expert: history, frozen, manifold, UVs
aud = mx_audit.audit("body_geo")
print(mx_audit.verdict(aud, profile="film", symmetric=True))              # X symmetry for mirroring
pre = S.bind_precheck("body_geo", bind_joints, method="heat")            # joints inside, normals, non-manifold, driven joints
print(pre["problems"])
```

Decide the method from `pre`: watertight, single shell, joints inside: `heat`. Multi-piece,
non-manifold, open: `geodesic`, only if `joints_outside` and `inward_shells` are empty (Help).
Everything is repainted anyway (Jao [00:09:01]), so the method only sets the starting point.

## P2. Bind with explicit settings

Tests: `test_skin_io.py`, `test_00_probe_deformation.py` (defaults and geomBind headless).

```python
b = S.bind("body_geo", bind_joints, method="heat", skin_method=0, normalize=1)   # no cap while authoring
sc = b["skinCluster"]; print(b["notes"], b["settings"])
# game target, cap known up front and never edited later (editing -mi wipes weights, Help):
b = S.bind("body_geo", bind_joints, method="geodesic", max_influences=8, voxel_resolution=256)
```

- Pass `normalizeWeights` explicitly: the command page says post is the default, the UI binds
  Interactive.
- `method="geodesic"` runs `geomBind` after `skinCluster(bindMethod=3)`; if `notes` reports a
  failure in mayapy, bind in the GUI through the bridge or use heat.
- Must be at the bind pose to bind more objects (Help). Return to it:
  `cmds.dagPose(root_joint, restore=True, bindPose=True)` [verify], tested soft in
  `test_skin_io.py`.
- Do not initialize Skin Tools layers on throwaway test binds (antCGi deformation test): classic
  tools stay available.

## P3. Read, write, audit, back up weights

Status: not yet run in Maya (audit maths ran offline). Test: `test_skin_io.py`.

```python
d = S.read_weights(sc)                       # MFnSkinCluster.getWeights, plug fallback
W, names = d["weights"], d["influences"]
a = S.audit_weights(W, names, max_influences=4)
print(S.weights_verdict(a))                  # error: empty rows, bad sums, over budget; warn: tiny weights
S.export_weights_json("body_geo", "/abs/out/body_weights_v003.json")    # before any OpenMaya write (not undoable)
S.write_weights(sc, W)                       # refuses a cluster with Skin Tools layers
```

Restore or transfer: `S.import_weights_json(path, "body_geo")` (index mapping when topology matches,
closest point otherwise; binds to the named joints if the mesh has no cluster).

## P4. Region blocking without a brush (plain skinCluster)

Status: not yet run in Maya (closest-bone, ramps, masks, compositing ran offline). Test:
`test_rom_metrics.py`, `test_skin_io.py`, `test_mx_skin_offline.py`.

Makauskas's order [00:01:11], Jao's fill-then-mask. The plan below is an example for a biped whose
joint names come from scenario-maya-rigging; keep one entry per region, bottom to top.

```python
plan = [
  {"name": "torso", "influences": ["pelvis", "spine_01", "spine_02", "spine_03"],
   "smooth": {"iterations": 3, "strength": 0.5}},
  {"name": "L_shoulder", "influences": ["L_clavicle", "L_upperarm"],
   "smooth": {"iterations": 2}, "mask": {"along": ["L_clavicle", "L_upperarm", 0.3, 0.8]}},
  {"name": "L_upperarm", "chain": ["L_upperarm", "L_upperarm_twist_01", "L_upperarm_twist_02", "L_lowerarm"],
   "mask": {"along": ["L_clavicle", "L_lowerarm", 0.45, 0.6]}},
  {"name": "L_forearm", "chain": ["L_lowerarm", "L_lowerarm_twist_01", "L_lowerarm_twist_02", "L_hand"],
   "mask": {"along": ["L_upperarm", "L_hand", 0.45, 0.55]}},
  {"name": "L_hand", "influences": ["L_hand", "L_thumb_01", "L_index_01", "L_middle_01"],   # palm, then fingers
   "mask": {"along": ["L_lowerarm", "L_hand", 0.85, 1.0]}},
]
res = S.block_regions("body_geo", plan)           # composites in memory, writes once, returns an audit
print(res["layers"], S.weights_verdict(res["audit"]))
```

- `influences`: 100% to the closest bone segment (Assign from Closest Joint). `chain`: an even twist
  ramp (Jao). Mask ranges are the art direction; iterate on them, not on per-vertex values [added:
  parameters above are starting guesses, tune per character].
- Sparse regions (fingers): few smoothing iterations or restrict `smooth.verts` to the middle loops
  (Makauskas [00:18:35]); then `S.sharpen_weights`.
- Must run at the bind pose (the function refuses otherwise). Mirror afterwards (P7) instead of
  listing the right side.

## P5. Skin Tools layered path (when the API exists)

API names match the Maya 2027 Developer Help pages "Skin Tools Python API" (namespace
`ngSkinTools2.api`, source in `<maya>/runTime/plug-ins/ngSkinTools/scripts/ngSkinTools2`), fetched
2026-09-24. Test: `test_skin_tools.py` (skips cleanly when no module is found).

```python
probe = S.skin_tools_probe()                 # plug-ins, node types, commands, modules: read it first
print(probe["api"], probe["node_types"])
if S.skin_tools_api():
    S.st_init_layers(sc)
    S.st_add_region_layer("body_geo", "torso", ["pelvis", "spine_01", "spine_02", "spine_03"],
                          smooth={"intensity": 0.5, "iterations": 3})
    P = S.rest_points("body_geo")
    segs = S.bone_segments(S.read_weights(sc)["influences"])
    # mask as an alpha, computed rather than painted
    names = S.read_weights(sc)["influences"]; ix = {S.short_name(n): i for i, n in enumerate(names)}
    mask = S.mask_along(P, segs[ix["L_clavicle"]][0], segs[ix["L_lowerarm"]][0], 0.35, 0.6)
    S.st_add_region_layer("body_geo", "L_arm", ["L_upperarm", "L_upperarm_twist_01", "L_lowerarm"],
                          mask=mask, smooth={"intensity": 0.5, "iterations": 2})
    arm = S.st_add_region_layer("body_geo", "L_arm_fix")["layer_object"]
    S.st_flood("body_geo", arm, "replace", "mask", 1.0, verts=arm_verts)        # Jao: Replace-flood the mask
    S.st_flood("body_geo", arm, "smooth", None, 0.5, 3, verts=necklace_verts, volume=True)   # across shells
    S.st_export_json("body_geo", "/abs/out/body_layers_v003.json")      # keeps the layered work (Jao)
    print(S.delete_skin_layers(sc))              # before handoff: proves the weights survived, restores if not
```

Raw API, as in the 2027 Help: `from ngSkinTools2 import api`; `layers = api.init_layers(sc)`;
`layer = layers.add("torso")`;
`api.assign_from_closest_joint(sc, layer, influences=[logical indices])`;
`s = api.PaintModeSettings(); s.mode = api.PaintMode.smooth; s.iterations = 3; api.flood_weights(target=layer, settings=s)`
(acts on the component selection or the whole mesh);
`layer.set_weights(api.NamedPaintTarget.MASK, values)`; `api.export_json(sc, file=path)`;
`api.import_json(sc, file=path, vertex_transfer_mode=api.VertexTransferMode.vertexId)`.

Without the API: P4 gives the same composite, written once; layers then only matter to a human
painting in the GUI.

## P6. Smoothing, sharpening, multi-shell accessories

Status: ran offline (pure Python); the write-back is not yet run in Maya. Tests:
`test_mx_skin_offline.py`, `test_mirror_transfer.py` (sleeve).

```python
d = S.read_weights(sc); W = d["weights"]
topo = S.mesh_topology("body_geo")
W = S.smooth_weights(W, topo["neighbors"], iterations=2, strength=0.5, verts=elbow_verts,
                     locked=[ix["spine_03"]])                          # locks: Jao's two-joint discipline
W = S.sharpen_weights(W, topo["neighbors"], strength=0.5, verts=finger_mid_loops)
# a necklace or shirt shell in the same mesh: copy the body under it (volume smoothing substitute)
W = S.copy_nearest(W, topo["points"], body_verts, necklace_verts, k=3)
S.write_weights(sc, W)
# separate clothing mesh: remap body weights by closest point, then write to its own cluster
Ws, stats = S.remap_by_closest(S.rest_points("body_geo"), W, S.rest_points("shirt_geo"), k=3)
```

Plain Maya smoothing on selected vertices:
`cmds.skinCluster(sc, e=True, smoothWeights=0.5, smoothWeightsMaxIterations=2)` (Help; the menu
version uses the Skin Tools algorithm in 2027 and errors on multi-layer clusters) [verify behavior
of the flag in 2027].

## P7. Mirror

Status: not yet run in Maya (maps ran offline). Test: `test_mirror_transfer.py`.

```python
st = S.mirror_skin("body_geo", axis=0, source="+")    # +X (character left) onto -X
print(st)   # unmatched_vertices, unmatched_influences, mirror_error must be 0 / [] / < 0.01
# native alternative: labels plus explicit associations
S.label_joints(bind_joints)
cmds.copySkinWeights(sourceSkin=sc, destinationSkin=sc, mirrorMode="YZ", mirrorInverse=False,
                     surfaceAssociation="closestPoint", influenceAssociation=["label", "closestJoint"])
```

Needs a mesh centered on X and a symmetric bind pose (Help). Blocked while Skin Tools layers exist:
use its Mirror tab, Interactive Mirror, or delete layers first.

## P8. Copy and transfer (reference head, proxy, updated mesh)

Tests: `test_mirror_transfer.py` (copy_skin), `test_skin_io.py` (JSON closest-point import).

```python
S.copy_skin("head_ref_geo", "head_geo")                     # binds if needed, explicit closestPoint + oneToOne/name/closestJoint
S.copy_skin("proxy_lips_geo", "head_dup_geo", influence=("oneToOne", "closestJoint"))   # Jao's proxy onto a duplicate
S.copy_skin("hero_geo", "variant_geo", uv_space=("map1", "map1"))                       # different proportions
# mesh updated by the modeler: carry weights over by closest rest point
S.export_weights_json("body_geo", "/abs/out/body_w.json"); S.import_weights_json("/abs/out/body_w.json", "body_v2_geo", k=4)
```

Multi-cluster copies: the UI's Copy Skin Weights Skin Cluster source/target lists; by script pass
the cluster names as `sourceSkin` and `destinationSkin`.

## P9. Prune and enforce the engine cap (never through maximumInfluences)

Status: not yet run in Maya (maths ran offline). Test: `test_skin_io.py`.

```python
rep = S.prune_and_limit("body_geo", max_influences=4, prune=0.01)
print(rep["before"]["max_influences_found"], rep["after"]["max_influences_found"], rep["limited_vertices"])
```

Then re-run P10: capping moves weight, and the centreline and face are where caps hurt most (Burton
[00:51:55]).

## P10. Calisthenics ROM and the deformation test (headless)

Status: not yet run in Maya (schedules and metrics ran offline). Test: `test_rom_metrics.py`.

```python
rom = [("L_arm_fk_ctrl", "rz", 80, "L shoulder up"), ("L_arm_fk_ctrl", "rz", -60, "L shoulder down"),
       ("L_arm_fk_ctrl", "ry", 70, "L shoulder forward"), ("L_elbow_fk_ctrl", "ry", -140, "L elbow bend"),
       ("L_wrist_fk_ctrl", "rx", 90, "L forearm twist"), ("L_wrist_fk_ctrl", "rx", -90, "L forearm twist back"),
       ("L_leg_ik_ctrl", "ty", 45, "L foot lift"), ("spine_02_ctrl", "rx", 35, "spine bend")]
# values and axes depend on the rig's controls [added examples]; one motion per segment (Makauskas)
sched = S.rom_schedule(rom, start=1, step=10)        # pose every 20 frames, rest in between
keyed = S.key_rom(sched, relative=True)
sections = [{"label": "L forearm mid", "a": "L_lowerarm", "b": "L_hand", "t": 0.5,
             "influences": ["L_lowerarm", "L_lowerarm_twist_01", "L_lowerarm_twist_02", "L_hand"]},
            {"label": "L upper arm mid", "a": "L_upperarm", "b": "L_lowerarm", "t": 0.5}]
rep = S.deformation_test("body_geo", keyed["poses"], rest_frame=1, sections=sections,
                         rigid={"L_sole": sole_verts}, accessories=[{"mesh": "shirt_geo", "body": "body_geo"}])
for line in rep["verdict"]: print(line)
```

ML or rig-wide pose data (Widup): `S.rom_from_limits(S.joint_limits(bind_joints), step_deg=30)`.

Visual review of the same poses:

```python
snap = S.pose_snapshots("body_geo", [p["frame"] for p in keyed["poses"]])     # posed duplicates side by side
import mx_review
mx_review.review([snap["group"]], "/abs/out/rom_review", views=("front", "threequarter"), modes=("clay", "wire"))
cmds.delete(snap["group"])
# GUI session through the bridge: a real playblast of the ROM
# Bridge().call("mx_review", "playblast", path="/abs/out/rom", start=1, end=sched["end"], display={"wireframeOnShaded": True})
```

Or the headless one-liner:
`python3 mx_run.py --scene rig.ma mx_skin.py -- test --mesh body_geo --spec rom.json --json out.json`
with `rom.json = {"rom": [[node, attr, value, label], ...], "sections": [...], "relative": true}`.

## P11. Correctives: pre, post, pose reader, solve from a sculpt

Status: not yet run in Maya (inversion maths and the reader model ran offline). Test:
`test_correctives.py`.

Decide before sculpting (Maya 2027 Help, pre- and post-skinning correctives):

| Question                                                                                        | Choose                                                                                       | Why                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Is the rest mesh itself wrong where the joint bends, or must the fix hold in neighboring poses? | pre-deformation (`frontOfChain=True`), solved from a posed sculpt (`S.solve_pre_corrective`) | "like fixing the original character's mesh": the skin deforms the delta, so it "looks correct in other poses as well" |
| Only this posed result is wrong?                                                                | post-deformation                                                                             | authored "in consideration of how the skin deforms"; what you sculpt at the pose is what you get                      |
| Post, and one joint owns the fix (elbow crease, knee cap)?                                      | Transform Space target, Transform Name = that joint                                          | "generally faster to compute", corrections stay "within the envelope area of the selected joint"                      |
| Post, and the fix spans joints or must follow the surface (armpit, shoulder into chest)?        | Tangent Space target                                                                         | uses the local vertex frame, not UVs [cross-joint reading added]                                                      |

Controller-driven joints (bind joints moved by IK/FK constraints, pairBlends or
scenario-maya-rigging's offsetParentMatrix blend): `S.joint_drive(joint)` returns `free`, `channels`
or `opm`. Pose them through their controls, never by `setAttr` on the joint (connected channels
refuse it, constrained ones snap back). Node readers read `dagLocalMatrix` (local TRS times OPM),
which `S.corrective_driver` does by default: an OPM-driven joint keeps rotate at 0, so a reader on
`.matrix` or `rotate` is stuck on or off [added; offline model in `test_mx_skin_offline.py`, Maya
check in `test_correctives.py`]. Pose Editor order for such joints (Help, "Use controller-driven
joints with pose space deformations"): Create Pose Interpolator, answer No to neutral poses,
right-click > Show Driver Settings, add the controller's driving attributes (Rotate X/Y/Z) to
Controllers, then Poses > Add Neutral Poses, then add poses as usual; Euler Twist on when a wrist
should twist about the forearm axis. Delete neutral poses made too early and redo them after the
controllers.

```python
pre = cmds.blendShape("body_geo", frontOfChain=True, name="body_preFix_BS")[0]    # fixes the mesh, holds in all poses
post = cmds.blendShape("body_geo", after=True, name="body_postFix_BS")[0]         # fixes one posed result
# check the order: nearest-to-output first => [post, skinCluster, pre]
[h for h in cmds.listHistory("body_geoShape", pruneDagObjects=True) if cmds.nodeType(h) in ("blendShape", "skinCluster")]

# pose the joint (through its control when S.joint_drive says it is driven), duplicate the posed mesh,
# sculpt the duplicate (GUI) or move its points by script, then:
print(S.joint_drive("L_lowerarm"))                          # {'kind': 'free' | 'channels' | 'opm', ...}
cmds.setAttr("L_lowerarm_fk_ctrl.rz", -120)                 # driven: pose the control (name from scenario-maya-rigging)
# cmds.setAttr("L_lowerarm.ry", -120)                       # free joint only
sol = S.solve_pre_corrective("body_geo", "L_elbow120_sculpt", bs=pre, target_name="L_elbow120")
print(sol["residual"], sol["singular"])                     # residual < 1e-3 cm
drv = S.corrective_driver("L_lowerarm", "%s.weight[%d]" % (pre, sol["index"]), falloff=45.0, rest_time=1)
print(drv.get("warning"), drv["plug"], drv["drive"]["kind"])  # 0 at rest; reads dagLocalMatrix
```

- The node reader is swing only; for twist-dependent correctives or many poses per joint use the
  Pose Editor (GUI, `gui-paths.md`), extremes first, Independent for ad hoc poses, Regularization
  from 0.01 (Help).
- Tangent space post targets by script:
  `cmds.blendShape(post, e=True, tangentSpace=True, target=("body_geo", 0, "fix_geo", 1.0))` [verify
  flag], tested soft. Transform Space has no scripted flag in the saved docs: create it in the Shape
  Editor (Add Target option box > Type Transform Space > Transform Name) until the probe finds one.
- Built-in inversion: `cmds.invertShape("body_geo", "sculpt_geo")` [verify], tested soft.
- Candy wrapper alternative to correctives: `cmds.setAttr(sc + ".skinningMethod", 2)` (weight
  blended) and paint DQ blend weights where twist collapses (Help); P10 sections measure it.

## P12. Paint-free skinning: Delta Mush, then bake to plain weights

Test: `test_rom_metrics.py` (deltaMush and bakeDeformer, soft).

```python
dm = cmds.deltaMush("body_geo", smoothingIterations=10, smoothingStep=0.5)[0]     # [verify flags]
# bake the smoothed result into a skinCluster on a duplicate bound to the same skeleton
cmds.bakeDeformer(srcSkeletonName=root, srcMeshName="body_geo", dstSkeletonName=root,
                  dstMeshName="body_baked_geo", maxInfluences=4)                  # [verify flags; 2025 added ROM options]
```

Then P3 audit and P10 on the baked mesh. Remove the Delta Mush before ML training if it must not be
learned (Widup [00:07:55]).

## P13. Two skinClusters on a face (squash under tweaks) and the double transform fix

Test: `test_multi_skin.py`.

```python
sq = S.bind("face_geo", ["squash_top_jnt", "squash_bot_jnt"], method="closest", name="squash_SC")["skinCluster"]
tw = S.bind("face_geo", tweak_joints, method="closest", multi=True, name="tweak_SC")["skinCluster"]
cmds.copySkinWeights(sourceSkin="ref_tweak_SC", destinationSkin=tw, noMirror=True,      # cluster to cluster,
                     surfaceAssociation="closestPoint", influenceAssociation=["name", "closestJoint"])  # heads overlapping
pin = cmds.createNode("uvPin", name="face_uvPin")
cmds.connectAttr(sq + ".outputGeometry[0]", pin + ".deformedGeometry")     # pins read the squash stage only
names, logical = S.influences(tw)
for n, li in zip(names, logical):                                            # each tweak joint at its group origin
    grp = cmds.listRelatives(n, parent=True, fullPath=True)[0]
    cmds.connectAttr(grp + ".worldInverseMatrix[0]", "%s.bindPreMatrix[%d]" % (tw, li), force=True)
```

Gate: with all tweak controls at rest, squash moves tweak regions exactly once (the test measures d,
not 2d); no cycle warning. `S.skin_clusters("face_geo")` lists the newest cluster first [verify].

## P14. Lip split generator (antCGi) as arithmetic

Status: not yet run in Maya (split maths ran offline). Test: `test_correctives.py` (lips part).

```python
base = S.mesh_points("head_geo", world=False)
master = S.mesh_points("lips_open_sculpt", world=False)
lip = set(lip_verts)                                       # vertices the master moves
u = [abs(p[0]) for p in base]                              # distance from the center line (cm)
hw = S.hat_weights(u, [0.0, mouth_half_width * 0.5, mouth_half_width])   # middle, outer, corner [added layout]
left, right = S.side_weights(base, axis=0, width=0.3)
upper = [1.0 if p[1] >= lip_seam_y else 0.0 for p in base]               # or a soft band at the seam
sections, names = [], []
for k, part in enumerate(("middle", "outer", "corner")):
    for side, sw in (("L", left), ("R", right)):
        for lvl, lw in (("upper", upper), ("lower", [1 - x for x in upper])):
            sections.append([hw[v][k] * sw[v] * lw[v] if v in lip else 0.0 for v in range(len(base))])
            names.append("%s_lip_%s_%s" % (side, lvl, part))
targets = S.split_targets(base, master, sections)
assert S.split_error(base, master, targets) < 1e-5          # sections at 1 == master (antCGi's sum test)
bs = cmds.blendShape("head_geo", frontOfChain=True, name="head_BS")[0]
S.add_split_targets(bs, "head_geo", targets, names)
```

Keep the master target in the node, disabled (antCGi: never delete it) so a master edit regenerates
the sections. Corner vertices belong to corner shapes only (exclude them from the lip master).

## P15. ML Deformer: data and evaluation around the GUI training

Status: not yet run in Maya; creation and training are GUI (Attribute Editor, Control Collector,
Export Training Data, Train). Tests: `test_00_probe_deformation.py` (command and node probe),
`test_rom_metrics.py` (rom_from_limits, joint_limits).

```python
# 1. remove smoothing you do not want learned (Widup): cmds.delete(delta_mush_node)
# 2. pose data: one joint at a time, ~30 degree steps inside the joint limits
sched = S.rom_from_limits(S.joint_limits(bind_joints), step_deg=30.0, start=1, step=2)
S.key_rom(sched)                                    # then Deform > ML Deformer, Control Collector = skin joints
# 3. after training (GUI), evaluate held-out poses against the target, and cross talk
for f in held_out_frames:
    S.set_time(f)
    print(f, S.mesh_error(S.mesh_points("body_ml_geo"), S.mesh_points("body_target_geo")))
print(S.eval_seconds("body_ml_geo", range(1, 101)))  # compare with the ML Deformer disabled
```

Cross talk on the ML result:
`S.pose_metrics(rest, posed, topo, W, names, moved=[...])["cross_talk"]` with W from the
skinCluster: vertices with no weight on the moved joints must not move.

## P16. Game PSD with secondary joints (architecture only, no code shipped)

Rudy's structure: a swing-twist driver per joint, pose fractions remapped between calibrated values
to 0..1, and per secondary joint a blend of per-pose transforms, every secondary joint mapped to its
LODs. In Maya nodes the first version is `decomposeMatrix` or quaternion nodes for swing-twist,
`remapValue` for fractions and `blendMatrix` into the secondary joint's offsetParentMatrix [verify
node attributes]; at scale author it in Bifrost from code (Rudy [00:32:44]). Hand the joint list and
LOD table to scenario-maya-pipeline-scripting for export. No tested snippet yet: build and test it
with scenario-maya-rigging before shipping code.
