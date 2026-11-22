"""Builds hips, two legs and a skirt, transfers weights both ways, poses a leg and writes the results.

Run by test_live_transfer.py:
  blender -b --factory-startup --python-exit-code 1 -P transfer_cases.py -- <rigging scripts> <out.json>

Body: a hip cylinder (radius 0.215, z 0.9 to 1.1) weighted to `hips`, two leg cylinders (radius 0.08,
centers x = +-0.1) weighted to `thigh.L` / `thigh.R`. Skirt: an open tube of radius 0.24 from z 0.55
to 1.05, so only its top band lies near the skin. Sleeve: the left leg's side wall pushed out 1 cm.
"""

import json
import math
import sys

import bmesh
import bpy
import numpy as np

SCRIPTS, OUT = sys.argv[sys.argv.index("--") + 1:][:2]
sys.path.insert(0, SCRIPTS)
import bx_rig as R  # noqa: E402


def link(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def tube(bm, radius, z0, z1, rings, segments, x=0.0, caps=False):
    """Quad tube along Z (outward normals), optionally closed with n-gon caps."""
    rows = []
    for k in range(rings + 1):
        z = z0 + (z1 - z0) * k / rings
        rows.append([bm.verts.new((x + radius * math.cos(2 * math.pi * j / segments),
                                   radius * math.sin(2 * math.pi * j / segments), z))
                     for j in range(segments)])
    for k in range(rings):
        for j in range(segments):
            a, b = rows[k][j], rows[k][(j + 1) % segments]
            bm.faces.new((a, b, rows[k + 1][(j + 1) % segments], rows[k + 1][j]))
    if caps:
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])


bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()
tube(bm, 0.215, 0.9, 1.1, 8, 48, caps=True)
for x in (0.1, -0.1):
    tube(bm, 0.08, 0.0, 0.9, 36, 24, x=x, caps=True)
body = link("Body", bm)
bm = bmesh.new()
tube(bm, 0.24, 0.55, 1.05, 20, 48)
skirt_n = link("SkirtNearest", bm)
skirt_r = bpy.data.objects.new("SkirtRobust", skirt_n.data.copy())
bpy.context.scene.collection.objects.link(skirt_r)
bm = bmesh.new()
tube(bm, 0.09, 0.2, 0.8, 24, 24, x=0.1)
sleeve = link("Sleeve", bm)

rig = bpy.data.objects.new("Rig", bpy.data.armatures.new("Rig"))
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = rig.data.edit_bones
hips = eb.new("hips")
hips.head, hips.tail = (0, 0, 0.9), (0, 0, 1.1)
for name, x in (("thigh.L", 0.1), ("thigh.R", -0.1)):
    t = eb.new(name)
    t.head, t.tail = (x, 0, 0.9), (x, 0, 0.0)
    t.parent = hips
bpy.ops.object.mode_set(mode="OBJECT")

groups = {n: body.vertex_groups.new(name=n) for n in ("hips", "thigh.L", "thigh.R")}
for v in body.data.vertices:
    n = "hips" if v.co.z >= 0.9 - 1e-6 else ("thigh.L" if v.co.x > 0 else "thigh.R")
    groups[n].add([v.index], 1.0, "REPLACE")
am = body.modifiers.new("Armature", "ARMATURE")
am.object = rig
body.parent = rig

R.transfer_weights(body, skirt_n, rig=rig)
R.transfer_weights(body, skirt_r, rig=rig, mapping="ROBUST")
R.transfer_weights(body, sleeve, rig=rig, mapping="ROBUST")
try:  # the skirt sits 2.5 cm off the hips, so a 1 mm gate copies nothing
    R.robust_weights(body, skirt_r, max_dist=0.001)
    zero_match = None
except ValueError as e:
    zero_match = str(e)

POSE = {"name": "leg_forward.L", "ops": [("rot", "thigh.L", (1, 0, 0), -50)]}
POSE_R = {"name": "leg_forward.R", "ops": [("rot", "thigh.R", (1, 0, 0), -50)]}
REST = {"name": "rest", "ops": []}

# A hoop below the hem, not connected to the skirt and 14 cm off the legs: no vertex of it passes
# the gates, so only the copied band may lead it, never the nearest leg.
bm = bmesh.new()
tube(bm, 0.24, 0.55, 1.05, 20, 48)
tube(bm, 0.32, 0.30, 0.35, 2, 48)
skirt_i = link("SkirtIsland", bm)
R.transfer_weights(body, skirt_i, rig=rig, mapping="ROBUST", max_dist=0.042)
HOOP = slice(len(skirt_r.data.vertices), None)

# The hips and left leg with a live Mirror: the right leg exists only in the evaluated mesh.
bm = bmesh.new()
tube(bm, 0.215, 0.9, 1.1, 8, 48, caps=True)
tube(bm, 0.08, 0.0, 0.9, 36, 24, x=0.1, caps=True)
body_m = link("BodyMirror", bm)
mgroups = {n: body_m.vertex_groups.new(name=n) for n in ("hips", "thigh.L", "thigh.R")}
for v in body_m.data.vertices:
    mgroups["hips" if v.co.z >= 0.9 - 1e-6 else "thigh.L"].add([v.index], 1.0, "REPLACE")
mirror = body_m.modifiers.new("Mirror", "MIRROR")
mirror.use_mirror_merge = False
body_m.modifiers.new("Armature", "ARMATURE").object = rig
body_m.parent = rig
try:
    R.robust_weights(body_m, skirt_i)
    mirror_robust = None
except ValueError as e:
    mirror_robust = str(e)
try:
    R.garment_depth(rig, body, [skirt_r], [{"name": "fk_only", "ops": [("rot", "thigh_fk.L", (1, 0, 0), -50)]}])
    missing_controls = None
except ValueError as e:
    missing_controls = str(e)


def strain(obj):
    ed = np.empty(len(obj.data.edges) * 2, dtype=np.int64)
    obj.data.edges.foreach_get("vertices", ed)
    ed = ed.reshape(-1, 2)
    R.reset_pose(rig)
    P0 = R.world_coords(obj)
    R.apply_pose(rig, POSE)
    P1 = R.world_coords(obj)
    R.reset_pose(rig)
    ratio = np.linalg.norm(P1[ed[:, 0]] - P1[ed[:, 1]], axis=1) / np.linalg.norm(P0[ed[:, 0]] - P0[ed[:, 1]], axis=1)
    return {"max": round(float(ratio.max()), 3), "bad": int(((ratio < 0.5) | (ratio > 1.6)).sum())}


def leg_share(obj, rows=slice(None)):
    """Vertices whose largest weight is each bone."""
    W, names = R.weight_matrix(obj)
    top = np.array(names)[W[rows].argmax(axis=1)]
    return {"thigh.L": int((top == "thigh.L").sum()), "thigh.R": int((top == "thigh.R").sum()),
            "hips": int((top == "hips").sum())}


out = {
    "vertices": len(skirt_r.data.vertices),
    "matched": int(skirt_r["bx_matched"]), "inpainted": int(skirt_r["bx_inpainted"]),
    "sleeve_matched": int(sleeve["bx_matched"]), "sleeve_inpainted": int(sleeve["bx_inpainted"]),
    "zero_match_error": zero_match,
    "share_nearest": leg_share(skirt_n), "share_robust": leg_share(skirt_r),
    "strain_nearest": strain(skirt_n), "strain_robust": strain(skirt_r),
    "sums_robust": [round(float(s), 6) for s in (R.weight_matrix(skirt_r)[0].sum(axis=1).min(),
                                                 R.weight_matrix(skirt_r)[0].sum(axis=1).max())],
    "report_robust": {k: v for k, v in R.weight_report(skirt_r, rig, expect_inside=False).items()
                      if k in ("unweighted", "ok")},
    "depth": R.garment_depth(rig, body, [skirt_n, skirt_r, sleeve], poses=[REST, POSE]),
    "hoop_vertices": len(skirt_i.data.vertices) - len(skirt_r.data.vertices),
    "share_hoop": leg_share(skirt_i, HOOP),
    "mirror_robust_error": mirror_robust,
    "missing_controls_error": missing_controls,
    "depth_mirror": R.garment_depth(rig, body_m, [skirt_r], poses=[REST, POSE_R])["fail"],
    "depth_full_r": R.garment_depth(rig, body, [skirt_r], poses=[REST, POSE_R])["fail"],
}

with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
