"""
bx_rig: tested rigging pieces for an agent driving Blender 5.2 through Python.

Rigging is judged in motion, so this module is built around one loop: fit, generate
or build, bind, VERIFY THE WEIGHTS, pose, measure, render, fix. Everything here runs
headless (`blender --background --factory-startup`) and in a live session.

  import sys
  sys.path.append("<skills>/scenario-blender-rigging/scripts"); import bx_rig as R

  # 0. model check (feet on Z=0, centred on X, faces -Y, transforms applied)
  R.model_check([body, eyes, shirt], fix=True)
  # 1. landmarks from the mesh (cross-sections, not guesses) and a Rigify metarig
  lm   = R.landmarks(body, eyes=eyes)                 # dict of joints + diagnostics
  meta = R.add_metarig("basic")                       # "basic" | "human" (fingers+face)
  R.fit_metarig(meta, lm)                             # joints as units, pre-bends, rolls
  print(R.check_metarig(meta, body))                  # [] when ready to generate
  rig, err = R.generate(meta)                         # err = first line of the Rigify error
  # 2. bind with verification and fallback (auto weights fail silently)
  rep = R.bind(rig, body, garments=[shirt], rigid={eyes: None})
  # 3. test poses, numbers, renders
  dr  = R.deformation_report(rig, [body, shirt], R.RIGIFY_POSES)
  png = R.pose_sheet(rig, [body, shirt, eyes], R.RIGIFY_POSES, "/abs/out")

Placement and checks: model_check, landmarks, Sections, add_metarig, fit_metarig,
move_points, transform_bones, set_limb_roll, check_metarig, upgrade_face, generate,
placement_sheet (bones over an X-ray render), closeup, tile_images.
Weights: bind, weight_report, weight_matrix, write_weights, strip_opposite_side,
clean_weights, remove_non_deform_groups, smooth_weights, transfer_weights,
robust_weights, proxy_weights, assign_rigid, armature_first.
Poses and review: RIGIFY_POSES, JOINTS, apply_pose, reset_pose, aim, hinge, twist,
rotate_world, deformation_report, garment_depth, flag_report, pose_sheet, joint_sheet.
Manual / scripted rigs (DEF/MCH/CTRL): new_armature, new_bone, copy_bone, reparent,
con, twist_chain, twist_angles, ik_chain, solve_pole_angle, foot_roll, settings_prop,
drive, remap_driver, fk_ik_switch, mirror_drivers, make_def_layer, widget, set_shape,
organize, root_test, static_cycles, cycle_check.
Correctives and faces: skin_jacobian, corrective_from_targets, volume_restore_targets,
smooth_field, corrective_driver, mirror_shape_key, split_shape_lr, face_control,
drive_shape, SHAPE_SETS (ARKit 52, visemes), shape_set, shape_report. Mechanical:
rigid_check, key_action, action_drive, preserve_volume_mask.
Test character: mannequin.

Verified on Blender 5.2.1 LTS by tests/code/blender-rigging/*.py.
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import math
import os
import subprocess
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
SKILLS = os.path.dirname(os.path.dirname(HERE))


# ----------------------------------------------------------------------------------
# context helpers
# ----------------------------------------------------------------------------------
def activate(obj, mode="OBJECT", select=()):
    """Make obj the only selected, active object and enter `mode`."""
    ctx_obj = bpy.context.view_layer.objects.active
    if ctx_obj is not None and ctx_obj.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.hide_set(False)
    obj.hide_viewport = False
    for o in select:
        o.hide_set(False)
        o.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if mode != "OBJECT":
        bpy.ops.object.mode_set(mode=mode)
    return obj


def evaluate(obj=None):
    """Headless: re-evaluate after changing pose values, custom props or drivers."""
    if obj is not None:
        obj.update_tag()
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    return obj.evaluated_get(dg) if obj is not None else dg


def world_coords(obj, evaluated=True, no_subdiv=False):
    """(N,3) world-space vertex positions (evaluated = after modifiers, shape keys).
    no_subdiv=True hides Subdivision/Multires while evaluating so vertex indices
    match the mesh (needed for per-vertex measurements)."""
    if evaluated and no_subdiv:
        hidden = [m for m in obj.modifiers if m.type in ("SUBSURF", "MULTIRES") and m.show_viewport]
        for m in hidden:
            m.show_viewport = False
        try:
            return world_coords(obj, evaluated=True)
        finally:
            for m in hidden:
                m.show_viewport = True
    if evaluated:
        dg = evaluate()
        eo = obj.evaluated_get(dg)
        me = eo.to_mesh()
        a = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", a)
        mw = np.array(eo.matrix_world)
        eo.to_mesh_clear()
    else:
        me = obj.data
        a = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", a)
        mw = np.array(obj.matrix_world)
    a = a.reshape(-1, 3)
    return a @ mw[:3, :3].T + mw[:3, 3]


def _v(a):
    return Vector((float(a[0]), float(a[1]), float(a[2])))


def side_of(name):
    """'L', 'R' or '' from Blender's mirror naming (upper_arm.L, lid.T.L.001, f_index.01.R)."""
    import re
    m = re.search(r"[._-]([LlRr])(?=$|[._-]\d*$|\.)", name)
    return m.group(1).upper() if m else ""


def mirror_name(name):
    """The other side's name, on the side mark side_of reads (upper_arm.L, clavicle_l), else ''."""
    import re
    m = re.search(r"[._-]([LlRr])(?=$|[._-]\d*$|\.)", name)
    if not m:
        return ""
    s = m.group(1)
    other = {"L": "R", "R": "L", "l": "r", "r": "l"}[s]
    return name[:m.start(1)] + other + name[m.end(1):]


# ----------------------------------------------------------------------------------
# 0. model check (CGDive: "a huge number of rigging problems ... skipping the model check")
# ----------------------------------------------------------------------------------
def model_check(objs, fix=False, target_height=None):
    """Feet on Z=0, body centred on X, mid-foot at Y=0, transforms applied, faces -Y.

    objs[0] is the body (measured); the others move with it. fix=True applies all
    transforms and translates (and scales to target_height if given) the whole set.
    Returns a report dict; 'problems' is empty when the model is ready to rig."""
    body = objs[0]
    rep = {"problems": []}
    for o in objs:
        if any(abs(v) > 1e-6 for v in o.location) or any(abs(v) > 1e-6 for v in o.rotation_euler) \
                or any(abs(s - 1) > 1e-6 for s in o.scale):
            rep["problems"].append(f"{o.name}: unapplied transforms")
        if o.parent is not None:
            rep["problems"].append(f"{o.name}: parented to {o.parent.name}")
    V = world_coords(body, evaluated=False)
    lo, hi = V.min(0), V.max(0)
    H = hi[2] - lo[2]
    low = V[V[:, 2] < lo[2] + 0.05 * H]
    rep.update(height=float(H), floor=float(lo[2]), centre_x=float((lo[0] + hi[0]) / 2),
               foot_y=float(low[:, 1].mean()) if len(low) else 0.0)
    if abs(rep["floor"]) > 0.01 * H:
        rep["problems"].append(f"floor at z={rep['floor']:.3f}, not 0")
    if abs(rep["centre_x"]) > 0.01 * H:
        rep["problems"].append(f"not centred on X ({rep['centre_x']:.3f})")
    if fix:
        for o in objs:
            if o.parent is not None:
                mw = o.matrix_world.copy()
                o.parent = None
                o.matrix_world = mw
        for o in objs:
            if o.type == "MESH":
                bpy.context.view_layer.update()
                o.data.transform(o.matrix_world, shape_keys=True)   # keys too, or they stay behind
                o.matrix_world = Matrix.Identity(4)
                o.data.update()
        V = world_coords(body, evaluated=False)
        lo, hi = V.min(0), V.max(0)
        low = V[V[:, 2] < lo[2] + 0.05 * (hi[2] - lo[2])]
        shift = Vector((-(lo[0] + hi[0]) / 2, -low[:, 1].mean(), -lo[2]))
        s = (target_height / (hi[2] - lo[2])) if target_height else 1.0
        M = Matrix.Scale(s, 4) @ Matrix.Translation(shift)
        for o in objs:
            if o.type == "MESH":
                o.data.transform(M, shape_keys=True)
                o.data.update()
        rep["fixed"] = {"shift": tuple(shift), "scale": s}
        rep["problems"] = []
        rep["height"] = float((hi[2] - lo[2]) * s)
    return rep


# ----------------------------------------------------------------------------------
# procedural test mannequin (single watertight shell + separate eyes + a shirt)
# ----------------------------------------------------------------------------------
def mannequin(name="Mannequin", height=1.8, pose="T", head_scale=1.0, eyes=True, shirt=True,
              voxel=None, collection=None, raw=False):
    """Build a humanoid test character facing -Y, feet on Z=0.

    pose: 'T' (arms horizontal) or 'A' (arms 45 deg down). head_scale > 1 gives a
    stylized big head. The body is primitives joined by voxel remesh (one manifold
    shell, like a sculpt), voxel default H/150. raw=True keeps the intersecting
    primitives instead (a mesh on which bone-heat weighting typically fails, for
    testing fallbacks). Returns dict(body=, eyes=, shirt=)."""
    sys.path.append(os.path.join(SKILLS, "scenario-blender-sculpting", "scripts"))
    import bx_sculpt
    H = height
    col = collection or bpy.context.scene.collection
    bm = bmesh.new()

    def capsule(a, b, r1, r2=None, seg=24):
        r2 = r1 if r2 is None else r2
        a, b = Vector(a) * H, Vector(b) * H
        d = b - a
        mat = Matrix.Translation((a + b) / 2) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1 * H, radius2=r2 * H,
                              depth=d.length, matrix=mat)
        for p, r in ((a, r1), (b, r2)):
            bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r * H,
                                      matrix=Matrix.Translation(p))

    def ellipsoid(c, rad, seg=32):
        m = Matrix.Translation(Vector(c) * H) @ Matrix.Diagonal((rad[0] * H, rad[1] * H, rad[2] * H, 1.0))
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=1.0, matrix=m)

    hs = head_scale
    head_c = (0, -0.008, 0.905 + 0.055 * (hs - 1))
    ellipsoid(head_c, (0.056 * hs, 0.066 * hs, 0.072 * hs))
    capsule((0, 0.004, 0.80), (0, 0.0, 0.87 + 0.03 * (hs - 1)), 0.03)       # neck
    ellipsoid((0, 0.0, 0.715), (0.105, 0.068, 0.095))                       # chest
    ellipsoid((0, 0.004, 0.61), (0.088, 0.06, 0.085))                       # abdomen
    ellipsoid((0, 0.006, 0.525), (0.098, 0.066, 0.07))                      # pelvis
    for s in (1, -1):
        sh = Vector((0.115 * s, 0.0, 0.795))
        ellipsoid(sh, (0.042, 0.042, 0.040))                                # deltoid
        if pose == "A":
            ang = math.radians(45)
            dirv = Vector((math.cos(ang) * s, 0.0, -math.sin(ang)))
        else:
            dirv = Vector((s, 0.0, 0.0))
        elbow = sh + dirv * 0.175
        wrist = elbow + dirv * 0.15
        capsule(sh, elbow, 0.032, 0.026)
        capsule(elbow, wrist, 0.026, 0.019)
        hc = wrist + dirv * 0.05
        hand_m = Matrix.Translation(hc * H) @ dirv.to_track_quat("X", "Z").to_matrix().to_4x4() \
            @ Matrix.Diagonal((0.052 * H, 0.03 * H, 0.013 * H, 1.0))
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0, matrix=hand_m)
        hip = (0.058 * s, 0.004, 0.50)
        knee = (0.062 * s, 0.0, 0.285)
        ankle = (0.064 * s, 0.01, 0.052)
        capsule(hip, knee, 0.058, 0.04)
        capsule(knee, ankle, 0.04, 0.024)
        ellipsoid((0.064 * s, -0.035, 0.024), (0.032, 0.075, 0.024))        # foot
    me = bpy.data.meshes.new(name + "_parts")
    bm.to_mesh(me)
    bm.free()
    parts = bpy.data.objects.new(name, me)
    col.objects.link(parts)
    if raw:
        body = parts
        me.shade_smooth()
    else:
        body = bx_sculpt.union_remesh([parts], voxel or H / 150.0, name=name, relax=2)
    out = {"body": body, "eyes": None, "shirt": None}
    if eyes:
        bm = bmesh.new()
        hz = head_c[2] + 0.012 * hs
        for s in (1, -1):
            c = Vector((0.024 * s * hs, head_c[1] - 0.058 * hs, hz)) * H
            bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.0125 * hs * H,
                                      matrix=Matrix.Translation(c))
        me = bpy.data.meshes.new(name + "_eyes")
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        e = bpy.data.objects.new(name + "_eyes", me)
        col.objects.link(e)
        out["eyes"] = e
    if shirt:
        V = world_coords(body, evaluated=False)
        keep = (V[:, 2] > 0.555 * H) & (V[:, 2] < 0.80 * H) & (np.abs(V[:, 0]) < 0.24 * H)
        if pose == "A":
            keep = (V[:, 2] > 0.555 * H) & (V[:, 2] < 0.80 * H) & (np.abs(V[:, 0]) < 0.24 * H) \
                   & ~((np.abs(V[:, 0]) > 0.13 * H) & (V[:, 2] < 0.70 * H))
        sm = body.data.copy()
        sm.name = name + "_shirt"
        sh = bpy.data.objects.new(name + "_shirt", sm)
        col.objects.link(sh)
        bm = bmesh.new()
        bm.from_mesh(sm)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep[v.index]], context="VERTS")
        bm.normal_update()
        for v in bm.verts:
            v.co += v.normal * 0.006 * H
        bm.to_mesh(sm)
        bm.free()
        sm.shade_smooth()
        out["shirt"] = sh
    return out


# ----------------------------------------------------------------------------------
# cross-sections (the agent's "snap to volume")
# ----------------------------------------------------------------------------------
class Sections:
    """Plane cuts through one or more meshes, split into closed loops by topology.

    loops = Sections([body]).cut(point, normal) -> list of dict(center, pts, radius,
    lo, hi) sorted by center x. Centroids of limb loops are joint positions "in the
    centre of the volume" (CGDive), the substitute for Snap to Volume."""

    def __init__(self, objs, evaluated=False):
        Vs, Es, LE, LP = [], [], [], []
        voff = eoff = poff = 0
        for o in objs:
            if evaluated:
                eo = o.evaluated_get(evaluate())
                me = eo.to_mesh()
            else:
                me = o.data
            nv, ne, nl, npol = len(me.vertices), len(me.edges), len(me.loops), len(me.polygons)
            co = np.empty(nv * 3)
            me.vertices.foreach_get("co", co)
            mw = np.array(o.matrix_world)
            Vs.append(co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3])
            ed = np.empty(ne * 2, dtype=np.int64)
            me.edges.foreach_get("vertices", ed)
            Es.append(ed.reshape(-1, 2) + voff)
            le = np.empty(nl, dtype=np.int64)
            me.loops.foreach_get("edge_index", le)
            lt = np.empty(npol, dtype=np.int64)
            me.polygons.foreach_get("loop_total", lt)
            LE.append(le + eoff)
            LP.append(np.repeat(np.arange(npol) + poff, lt))
            voff, eoff, poff = voff + nv, eoff + ne, poff + npol
            if evaluated:
                eo.to_mesh_clear()
        self.V = np.vstack(Vs)
        self.E = np.vstack(Es)
        self.loop_edge = np.concatenate(LE)
        self.loop_poly = np.concatenate(LP)

    def cut(self, point, normal, min_pts=4):
        n = np.asarray(normal, dtype=float)
        n = n / np.linalg.norm(n)
        d = (self.V - np.asarray(point, dtype=float)) @ n
        d[d == 0.0] = 1e-12
        s = d > 0
        E0, E1 = self.E[:, 0], self.E[:, 1]
        cross = s[E0] != s[E1]
        idx = np.nonzero(cross)[0]
        if len(idx) == 0:
            return []
        t = d[E0[idx]] / (d[E0[idx]] - d[E1[idx]])
        pts = self.V[E0[idx]] + (self.V[E1[idx]] - self.V[E0[idx]]) * t[:, None]
        emap = np.full(len(self.E), -1, dtype=np.int64)
        emap[idx] = np.arange(len(idx))
        m = cross[self.loop_edge]
        le = emap[self.loop_edge[m]]
        lp = self.loop_poly[m]
        parent = list(range(len(idx)))

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a
        same = np.nonzero(lp[:-1] == lp[1:])[0]
        for i in same:
            ra, rb = find(int(le[i])), find(int(le[i + 1]))
            if ra != rb:
                parent[ra] = rb
        roots = np.array([find(i) for i in range(len(idx))])
        loops = []
        for r in np.unique(roots):
            p = pts[roots == r]
            if len(p) < min_pts:
                continue
            c = p.mean(0)
            loops.append({"center": c, "pts": p, "radius": float(np.linalg.norm(p - c, axis=1).mean()),
                          "lo": p.min(0), "hi": p.max(0), "n": len(p)})
        loops.sort(key=lambda L: L["center"][0])
        return loops


# ----------------------------------------------------------------------------------
# 1. landmarks from the mesh
# ----------------------------------------------------------------------------------
def landmarks(body, eyes=None, overrides=None, symmetric=True):
    """Joint positions for a humanoid in T or A pose, facing -Y, feet near Z=min.

    Method (agent substitute for volume snapping, CGDive/Demeter placement rules):
    horizontal cuts find legs, crotch, ankle, spine mid-line and the neck (narrowest
    section between shoulders and head); vertical cuts then cuts normal to the arm axis
    find armpit, wrist (narrowest section of the outer arm) and hand tip. Joints sit
    at section centroids; elbow/knee at proportional positions along the limb.
    Returns {name: Vector} for the LEFT (+X) side plus centre joints, 'H', 'floor',
    'pose' ('T'/'A'), 'arm_angle' (deg below horizontal) and 'notes'. Pass
    overrides={name: (x,y,z)} to correct any joint; always check the result with
    check_metarig() and a render."""
    S = Sections([body])
    V = S.V
    zmin, zmax = float(V[:, 2].min()), float(V[:, 2].max())
    H = zmax - zmin
    notes = []
    lm = {"H": H, "floor": zmin}

    def hcut(z):
        return S.cut((0, 0, z), (0, 0, 1))

    # --- legs and crotch: scan upward until one loop spans x = 0
    crotch = None
    leg_lo = {}
    for z in np.linspace(zmin + 0.03 * H, zmin + 0.7 * H, 90):
        loops = hcut(z)
        span = [L for L in loops if L["lo"][0] < 0 < L["hi"][0] and L["hi"][0] - L["lo"][0] < 0.6 * H]
        if span and z > zmin + 0.15 * H:
            crotch = float(z)
            break
        left = [L for L in loops if L["lo"][0] > 0]
        right = [L for L in loops if L["hi"][0] < 0]
        if left:
            leg_lo[float(z)] = (min(left, key=lambda L: L["center"][0]),
                                max(right, key=lambda L: L["center"][0]) if right else None)
    if crotch is None:
        raise RuntimeError("landmarks: no crotch found (legs not separated, or not a biped)")
    zs = sorted(leg_lo)
    below = [z for z in zs if z < crotch - 0.02 * H] or zs
    lm["crotch"] = Vector((0, 0, crotch))

    def leg_loop(z, side=0):
        loops = hcut(z)
        cand = [L for L in loops if (L["lo"][0] > 0 if side == 0 else L["hi"][0] < 0)]
        if not cand:
            return None
        return min(cand, key=lambda L: abs(L["center"][0]))

    def mirror_avg(Lc, Rc):
        a = np.array(Lc, dtype=float)
        if Rc is not None and symmetric:
            b = np.array(Rc, dtype=float) * np.array([-1, 1, 1])
            a = (a + b) / 2
        return a

    # hip joint: middle of the hip mass, a little above the crotch
    zl = below[-1]
    Lh, Rh = leg_lo[zl]
    hip_c = mirror_avg(Lh["center"], Rh["center"] if Rh else None)
    hip_z = crotch + 0.13 * (crotch - zmin)
    lm["hip"] = Vector((hip_c[0], hip_c[1], hip_z))

    # ankle: first cut (from the floor up) where the leg section becomes round
    ankle_z = None
    for z in np.linspace(zmin + 0.02 * H, zmin + 0.14 * H, 40):
        L = leg_loop(z)
        if L is None:
            continue
        ex, ey = L["hi"][0] - L["lo"][0], L["hi"][1] - L["lo"][1]
        if ey < 1.3 * ex:
            ankle_z = float(z)
            break
    if ankle_z is None:
        ankle_z = zmin + 0.05 * H
        notes.append("ankle: fallback 0.05 H")
    ankle_z = min(max(ankle_z, zmin + 0.03 * H), zmin + 0.12 * H)
    La, Ra = leg_loop(ankle_z), leg_loop(ankle_z, 1)
    a_c = mirror_avg(La["center"], Ra["center"] if Ra else None)
    lm["ankle"] = Vector((a_c[0], a_c[1], ankle_z))

    # foot: toe tip, heel, ball from the vertices below the ankle on the left side
    fv = V[(V[:, 2] < ankle_z) & (V[:, 0] > 0)]
    tip = fv[fv[:, 1].argmin()]
    heel_y = float(fv[:, 1].max())
    foot_len = heel_y - tip[1]
    ball_y = tip[1] + 0.33 * foot_len
    near = fv[np.abs(fv[:, 1] - ball_y) < 0.05 * foot_len]
    ball_x = float(near[:, 0].mean()) if len(near) else float(a_c[0])
    ball_z = zmin + 0.22 * (ankle_z - zmin)
    lm["ball"] = Vector((ball_x, ball_y, ball_z))
    lm["toe_tip"] = Vector((ball_x, float(tip[1]), ball_z))
    wv = fv[np.abs(fv[:, 1] - (heel_y - 0.1 * foot_len)) < 0.08 * foot_len]
    hx0, hx1 = (float(wv[:, 0].min()), float(wv[:, 0].max())) if len(wv) else (a_c[0] - 0.02 * H, a_c[0] + 0.02 * H)
    lm["heel_in"] = Vector((hx0, heel_y, zmin))
    lm["heel_out"] = Vector((hx1, heel_y, zmin))

    # knee: halfway hip -> ankle, section centre; chain straight in front view
    kz = ankle_z + 0.5 * (hip_z - ankle_z)
    Lk, Rk = leg_loop(kz), leg_loop(kz, 1)
    k_c = mirror_avg(Lk["center"], Rk["center"] if Rk else None) if Lk else np.array(lm["ankle"])
    t = (kz - ankle_z) / (hip_z - ankle_z)
    line = lm["ankle"].lerp(lm["hip"], t)
    lm["knee"] = Vector((line.x, float(k_c[1]), kz))

    # --- torso mid-line (front/back surface midpoint at x ~ 0) and the neck
    def central(z):
        loops = hcut(z)
        c = [L for L in loops if L["lo"][0] <= 0.0 <= L["hi"][0]]
        return max(c, key=lambda L: L["n"]) if c else None

    def midline_y(L, band):
        p = L["pts"]
        m = p[np.abs(p[:, 0]) < band]
        if len(m) < 2:
            m = p
        return float((m[:, 1].min() + m[:, 1].max()) / 2), float(m[:, 1].min()), float(m[:, 1].max())

    widths = []
    for z in np.linspace(zmax - 0.01 * H, crotch + 0.15 * H, 120):
        L = central(float(z))
        if L is not None:
            widths.append((float(z), float(L["hi"][0] - L["lo"][0]), L))
    head_max = 0.0
    neck = None
    passed_head = False
    for z, w, L in widths:
        if not passed_head:
            if w >= head_max:
                head_max = w
            elif w < 0.85 * head_max:
                passed_head = True
                neck = (z, w, L)
        else:
            if w < neck[1]:
                neck = (z, w, L)
            elif w > 1.6 * neck[1]:
                break
    if neck is None:
        raise RuntimeError("landmarks: neck not found")
    z_nk, w_nk = neck[0], neck[1]
    neck_base_z = None
    for z, w, L in widths:
        if z < z_nk and w > 1.5 * w_nk:
            neck_base_z = z
            break
    if neck_base_z is None:
        neck_base_z = z_nk - 0.04 * H
        notes.append("neck base: fallback")
    neck_base_z = min(max(neck_base_z, z_nk - 0.07 * H), z_nk - 0.01 * H)
    pivot_z = z_nk + 0.2 * (zmax - z_nk)
    Lp = central(pivot_z)
    py = midline_y(Lp, 0.02 * H)[0] if Lp else neck[2]["center"][1]
    lm["head_pivot"] = Vector((0, py, pivot_z))
    lm["head_top"] = Vector((0, py, zmax))
    Lnb = central(neck_base_z)
    nby = midline_y(Lnb, 0.02 * H)[0] if Lnb else py
    lm["neck_base"] = Vector((0, nby, neck_base_z))
    lm["neck_mid"] = Vector((0, (nby + py) / 2, (neck_base_z + pivot_z) / 2))
    pelvis_z = hip_z - 0.03 * H
    Lpv = central(pelvis_z)
    lm["pelvis"] = Vector((0, midline_y(Lpv, 0.03 * H)[0] if Lpv else hip_c[1], pelvis_z))
    for i, f in enumerate((0.226, 0.437, 0.703)):
        z = pelvis_z + f * (neck_base_z - pelvis_z)
        Ls = central(z)
        lm[f"spine{i + 1}"] = Vector((0, midline_y(Ls, 0.03 * H)[0] if Ls else 0.0, z))
    chest_z = lm["spine3"].z
    Lc = central(pelvis_z + 0.55 * (neck_base_z - pelvis_z))
    my, fy, by = midline_y(Lc, 0.03 * H)
    lm["chest_front"] = Vector((0, fy, chest_z))
    lm["chest_back"] = Vector((0, by, chest_z))

    # --- arms (left side): start on the forearm (65% of the way to the farthest +X
    # vertex, clear of both torso and fingers), then trace the arm loop inward with
    # x-planes until it merges with the torso: the size jumps (the armpit).
    # Tracing from the fingertip gets lost between the fingers.
    tipv = V[V[:, 0].argmax()]
    lm["hand_tip"] = _v(tipv)
    x0 = 0.65 * float(tipv[0])
    loops = S.cut((x0, 0, 0), (1, 0, 0))
    if not loops:
        raise RuntimeError("landmarks: no arm section at 65% of the arm span")
    start = min(loops, key=lambda L: np.linalg.norm(L["center"][1:] - tipv[1:]))
    arm_loops = []
    prev, prev_size = start["center"], None
    armpit_x = None
    for x in np.linspace(x0, 0.04 * H, 160):
        loops = S.cut((x, 0, 0), (1, 0, 0))
        if not loops:
            continue
        L = min(loops, key=lambda L: np.linalg.norm(L["center"][1:] - prev[1:]))
        size = max(L["hi"][2] - L["lo"][2], L["hi"][1] - L["lo"][1])
        if prev_size is not None and len(arm_loops) > 4 and (
                size > 1.5 * prev_size or np.linalg.norm(L["center"][1:] - prev[1:]) > 0.5 * prev_size):
            armpit_x = float(x)
            break
        arm_loops.append((float(x), L["center"].copy(), size))
        prev, prev_size = L["center"], size
    if armpit_x is None or len(arm_loops) < 5:
        raise RuntimeError("landmarks: arm does not separate from the torso (arms too close?)")
    # pass 2: cuts normal to the arm axis
    pts = np.array([c for _, c, _ in arm_loops])
    a0, a1 = pts[-1], tipv
    axis = (a1 - a0) / np.linalg.norm(a1 - a0)
    arm_len = float(np.linalg.norm(a1 - a0))
    prof = []
    for f in np.linspace(0.02, 0.97, 80):
        p = a0 + axis * f * arm_len
        loops = S.cut(p, axis)
        near = [L for L in loops if np.linalg.norm(L["center"] - p) < 0.12 * H]
        if not near:
            continue
        allp = np.vstack([L["pts"] for L in near])
        c = allp.mean(0) if len(near) > 1 else min(near, key=lambda L: np.linalg.norm(L["center"] - p))["center"]
        u = np.cross(axis, [0, 0, 1.0])
        if np.linalg.norm(u) < 1e-6:
            u = np.array([0, 1.0, 0])
        u /= np.linalg.norm(u)
        w2 = np.cross(axis, u)
        ext = max(np.ptp(allp @ u), np.ptp(allp @ w2))
        prof.append((float(f), c, float(ext)))
    outer = [q for q in prof if 0.6 <= q[0] <= 0.9]
    wf, wc, _ = min(outer, key=lambda q: q[2])
    wrist = _v(wc)
    inner = [q for q in prof if q[0] < 0.12]
    r_arm = float(np.median([q[2] for q in inner])) / 2 if inner else 0.03 * H
    sj = a0 + axis * (-0.6 * r_arm)
    lm["shoulder"] = Vector((sj[0], sj[1], sj[2] + 0.25 * r_arm))
    lm["wrist"] = wrist
    lm["armpit_x"] = armpit_x
    up = lm["wrist"] - lm["shoulder"]
    lm["elbow"] = lm["shoulder"] + up * 0.53
    hand_dir = (lm["hand_tip"] - lm["wrist"])
    lm["hand_end"] = lm["wrist"] + hand_dir * 0.45
    ang = math.degrees(math.atan2(-(lm["wrist"].z - lm["shoulder"].z),
                                  lm["wrist"].x - lm["shoulder"].x))
    lm["arm_angle"] = ang
    lm["pose"] = "T" if ang < 25 else "A"
    # clavicle: high and deep in the shoulder volume (CGDive), from near the mid-line
    depth = lm["chest_back"].y - lm["chest_front"].y
    cz = lm["shoulder"].z + 0.02 * H
    lm["clav_head"] = Vector((0.1 * lm["shoulder"].x, lm["chest_front"].y + 0.3 * depth, cz))
    lm["clav_tail"] = Vector((0.85 * lm["shoulder"].x, lm["shoulder"].y, cz))
    # eyes: centre of each island of the eye object
    if eyes is not None:
        EV = world_coords(eyes, evaluated=True)
        for side, m in (("eye", EV[:, 0] > 0), ("eye_r", EV[:, 0] < 0)):
            if m.any():
                lm[side] = _v(EV[m].mean(0))
                lm[side + "_radius"] = float(np.ptp(EV[m][:, 2]) / 2)
    head = V[V[:, 2] > z_nk]
    lm["head_front_y"] = float(head[np.abs(head[:, 0]) < 0.03 * H][:, 1].min())
    band = head[np.abs(head[:, 2] - (pivot_z + 0.35 * (zmax - pivot_z))) < 0.02 * H]
    lm["head_half_width"] = float(np.abs(band[:, 0]).max()) if len(band) else None
    # front profile of the face (x ~ 0): nose tip = most forward point above the neck,
    # chin bottom = where the profile retreats past halfway back to the neck front
    mid = V[(np.abs(V[:, 0]) < 0.012 * H) & (V[:, 2] > neck_base_z - 0.01 * H)]
    if len(mid) > 20:
        nose = mid[mid[:, 2] > z_nk][mid[mid[:, 2] > z_nk][:, 1].argmin()]
        zs_ = np.linspace(nose[2], neck_base_z, 80)
        prof = []
        for zz in zs_:
            sl = mid[np.abs(mid[:, 2] - zz) < 0.006 * H]
            if len(sl):
                prof.append((float(zz), float(sl[:, 1].min())))
        if prof:
            neck_front = prof[-1][1]
            half = (nose[1] + neck_front) / 2
            fwd = [zz for zz, yy in prof if zz < nose[2] - 0.02 * H and yy < half]
            chin = min(fwd) if fwd else None      # lowest point still forward = under the chin
            if chin is not None:
                if nose[1] > lm["head_pivot"].y:
                    notes.append("nose tip behind the head pivot: does the character face -Y?")
                lm["nose_tip"] = _v(nose)
                lm["chin_bottom"] = Vector((0.0, float(half), chin))
    lm["notes"] = notes
    for k, v in (overrides or {}).items():
        lm[k] = Vector(v) if not isinstance(v, (int, float, str)) else v
    return lm


# ----------------------------------------------------------------------------------
# 2. Rigify: metarig, fitting, checks, generation
# ----------------------------------------------------------------------------------
METARIGS = {
    "basic": "armature_basic_human_metarig_add",      # no fingers, no face: first rigs
    "human": "armature_human_metarig_add",            # fingers + legacy face (upgrade it)
    "basic_quadruped": "armature_basic_quadruped_metarig_add",
    "wolf": "armature_wolf_metarig_add", "horse": "armature_horse_metarig_add",
    "cat": "armature_cat_metarig_add", "bird": "armature_bird_metarig_add",
    "shark": "armature_shark_metarig_add",
}


def enable_rigify():
    import addon_utils
    if not addon_utils.check("rigify")[1]:
        bpy.ops.preferences.addon_enable(module="rigify")


def add_metarig(kind="basic", name=None):
    """Add a Rigify metarig at the world origin (Rigify is off on factory startup)."""
    enable_rigify()
    if bpy.context.view_layer.objects.active and bpy.context.view_layer.objects.active.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.cursor.location = (0, 0, 0)
    getattr(bpy.ops.object, METARIGS[kind])()
    meta = bpy.context.active_object
    if name:
        meta.name = name
    return meta


def _descendants(eb, root):
    return [b.name for b in eb if b.name == root or any(p.name == root for p in b.parent_recursive)]


def _frame(d, n):
    d = d.normalized()
    n = (n - d * n.dot(d)).normalized()
    return Matrix((d, n, d.cross(n))).transposed()


def _set_limb_roll(eb, names):
    """Local X = hinge axis = normal of the chain plane (Rigify's own convention)."""
    a, b = eb[names[0]], eb[names[1]]
    n = (a.tail - a.head).cross(b.tail - b.head)
    if n.length < 1e-9:
        return None
    n.normalize()
    for nm in names:
        e = eb[nm]
        e.align_roll(n.cross((e.tail - e.head).normalized()))
    return n


def transform_bones(eb, names, M):
    """Edit Mode: apply matrix M to a group of bones (heads, tails, rolls) safely.

    EditBone.transform() on connected chains moves shared ends twice (a parent's tail
    is also the child's head); this writes every end once from a snapshot."""
    names = [n for n in names if n in eb]
    R3 = M.to_3x3().normalized()
    snap = {n: (eb[n].head.copy(), eb[n].tail.copy(), eb[n].z_axis.copy(), eb[n].use_connect,
                eb[n].parent.name if eb[n].parent else None) for n in names}
    for n in names:
        eb[n].tail = M @ snap[n][1]
    for n in names:
        if not (snap[n][3] and snap[n][4] in snap):
            eb[n].head = M @ snap[n][0]
    for n in names:
        eb[n].align_roll(R3 @ snap[n][2])


def move_points(eb, moves, eps=1e-5):
    """Edit Mode: move every bone end sitting on an old point to its new point.

    moves = [(old, new), ...]. This is CGDive's "box-select the joint and move all
    ends together": coincident ends stay coincident (Rigify chains, face glue, lid
    corners). Tails first, then heads of disconnected bones only, because setting a
    parent's tail already moves a connected child's head."""
    def target(co):
        for old, new in moves:
            if (co - old).length < eps:
                return new
        return None
    snap = {b.name: (b.head.copy(), b.tail.copy(), b.use_connect) for b in eb}
    for b in eb:
        t = target(snap[b.name][1])
        if t is not None:
            b.tail = t
    for b in eb:
        if not snap[b.name][2]:
            h = target(snap[b.name][0])
            if h is not None:
                b.head = h


set_limb_roll = _set_limb_roll


def fit_metarig(meta, lm, knee_bend=0.012, elbow_bend=0.012, support_bones=True, move_eyes=True):
    """Place a Rigify human/basic-human metarig on landmarks() output.

    Joints are written as shared points so coincident ends stay coincident (CGDive:
    move joints as units). Knees get a forward and elbows a backward pre-bend of
    `*_bend` x limb length at mid-chain (about 2.7 deg between segments), chains stay
    straight in the other view, limb rolls put the hinge on local X, and the left side
    is symmetrized to the right. Human metarig: hand+fingers and face are carried by a
    similarity transform (coarse: check the fist test and face renders), eye bones
    and lids moved onto the eye centres. Call before rigify_upgrade_face()."""
    activate(meta, "EDIT")
    eb = meta.data.edit_bones
    P = {k: Vector(v) for k, v in lm.items() if isinstance(v, Vector)}
    human = "palm.01.L" in eb
    face = "face" in eb
    # defaults captured before editing
    if human:
        hand_grp = _descendants(eb, "hand.L")
        W0, T0 = eb["hand.L"].head.copy(), eb["f_middle.03.L"].tail.copy()
        n0 = (eb["upper_arm.L"].tail - eb["upper_arm.L"].head).cross(eb["forearm.L"].tail - eb["forearm.L"].head)
    if face:
        face_grp = _descendants(eb, "face")
        piv0, top0 = eb["spine.006"].head.copy(), eb["spine.006"].tail.copy()
        eye0 = eb["eye.L"].head.copy() if "eye.L" in eb else None
    # spine, neck, head (centre line)
    chain = ["pelvis", "spine1", "spine2", "spine3", "neck_base"]
    for i, nm in enumerate(("spine", "spine.001", "spine.002", "spine.003")):
        eb[nm].head, eb[nm].tail = P[chain[i]], P[chain[i + 1]]
    eb["spine.004"].head, eb["spine.004"].tail = P["neck_base"], P["neck_mid"]
    eb["spine.005"].head, eb["spine.005"].tail = P["neck_mid"], P["head_pivot"]
    eb["spine.006"].head, eb["spine.006"].tail = P["head_pivot"], P["head_top"]
    for nm in ("spine", "spine.001", "spine.002", "spine.003", "spine.004", "spine.005", "spine.006"):
        eb[nm].align_roll(Vector((0, -1, 0)))
    # leg with forward knee pre-bend, straight from the front
    hip, knee, ankle = P["hip"], P["knee"].copy(), P["ankle"]
    L = (ankle - hip).length
    t = (knee.z - hip.z) / (ankle.z - hip.z)
    line = hip.lerp(ankle, t)
    knee.x = line.x
    knee.y = min(knee.y, line.y - knee_bend * L)
    eb["thigh.L"].head, eb["thigh.L"].tail = hip, knee
    eb["shin.L"].head, eb["shin.L"].tail = knee, ankle
    eb["foot.L"].head, eb["foot.L"].tail = ankle, P["ball"]
    eb["toe.L"].head, eb["toe.L"].tail = P["ball"], P["toe_tip"]
    eb["heel.02.L"].head, eb["heel.02.L"].tail = P["heel_in"], P["heel_out"]
    _set_limb_roll(eb, ["thigh.L", "shin.L"])
    f = eb["foot.L"]
    f.align_roll(Vector((1, 0, 0)).cross((f.tail - f.head).normalized()))
    eb["toe.L"].align_roll(Vector((0, 0, 1)))
    eb["heel.02.L"].align_roll(Vector((0, 0, 1)))
    # arm with backward elbow pre-bend (hinge axis from the bend), shoulder high and deep
    sh, wr = P["shoulder"], P["wrist"]
    el = sh.lerp(wr, 0.53)
    el.y += elbow_bend * (wr - sh).length
    eb["shoulder.L"].head, eb["shoulder.L"].tail = P["clav_head"], P["clav_tail"]
    eb["shoulder.L"].align_roll(Vector((0, 0, 1)))
    eb["upper_arm.L"].head, eb["upper_arm.L"].tail = sh, el
    eb["forearm.L"].head, eb["forearm.L"].tail = el, wr
    if human:
        n1 = (el - sh).cross(wr - el)
        T = P["hand_tip"]
        R = _frame(T - wr, n1) @ _frame(T0 - W0, n0).inverted()
        s = (T - wr).length / (T0 - W0).length
        M = Matrix.Translation(wr) @ R.to_4x4() @ Matrix.Scale(s, 4) @ Matrix.Translation(-W0)
        transform_bones(eb, hand_grp, M)
        eb["forearm.L"].tail = wr
        _set_limb_roll(eb, ["upper_arm.L", "forearm.L"])
    else:
        eb["hand.L"].head, eb["hand.L"].tail = wr, P["hand_end"]
        _set_limb_roll(eb, ["upper_arm.L", "forearm.L"])
        n = (el - sh).cross(wr - el).normalized()
        h = eb["hand.L"]
        h.align_roll(n.cross((h.tail - h.head).normalized()))
    # support bones for automatic weights (CGDive: delete them if you paint the chest)
    if support_bones and "breast.L" in eb:
        depth = P["chest_back"].y - P["chest_front"].y
        z = P["spine3"].z
        x = 0.6 * sh.x
        eb["breast.L"].head = Vector((x, P["chest_front"].y + 0.7 * depth, z))
        eb["breast.L"].tail = Vector((x, P["chest_front"].y + 0.05 * depth, z))
        eb["pelvis.L"].head = P["pelvis"]
        eb["pelvis.L"].tail = Vector((1.13 * hip.x, hip.y - 0.03 * lm["H"], hip.z + 0.04 * lm["H"]))
    elif not support_bones:
        for nm in ("breast.L", "breast.R", "pelvis.L", "pelvis.R"):
            if nm in eb:
                eb.remove(eb[nm])
    # face: similarity from the metarig head to the mesh head, then eyes onto the eyeballs
    if face:
        piv, top = P["head_pivot"], P["head_top"]
        s = (top.z - piv.z) / (top0.z - piv0.z)
        w0 = max(max(abs(eb[n].head.x), abs(eb[n].tail.x)) for n in face_grp)
        sx = (lm["head_half_width"] / w0) if lm.get("head_half_width") else s
        if all(k in P for k in ("nose_tip", "chin_bottom", "eye")) and P["chin_bottom"].z < P["nose_tip"].z < P["eye"].z:
            # piecewise vertical map through chin bottom, nose tip, eye line, head top
            pts0 = [(n, e) for n in face_grp for e in (eb[n].head, eb[n].tail)]
            nose0 = min(pts0, key=lambda t: t[1].y)[1].copy()
            chin0 = eb["chin"].head.copy() if "chin" in eb else None
            k0 = [chin0.z, nose0.z, eye0.z, top0.z]
            k1 = [P["chin_bottom"].z, P["nose_tip"].z, P["eye"].z, top.z]
            sy = (k1[2] - k1[0]) / (k0[2] - k0[0])

            def fz(z):
                if z <= k0[0]:
                    return k1[0] + (z - k0[0]) * (k1[1] - k1[0]) / (k0[1] - k0[0])
                if z >= k0[3]:
                    return k1[3] + (z - k0[3]) * (k1[3] - k1[2]) / (k0[3] - k0[2])
                return float(np.interp(z, k0, k1))
            snap = {n: (eb[n].head.copy(), eb[n].tail.copy(), eb[n].z_axis.copy(), eb[n].use_connect,
                        eb[n].parent.name if eb[n].parent else None) for n in face_grp}

            def f(p):
                return Vector((p.x * sx, P["nose_tip"].y + (p.y - nose0.y) * sy, fz(p.z)))
            for n in face_grp:
                eb[n].tail = f(snap[n][1])
            for n in face_grp:
                if not (snap[n][3] and snap[n][4] in snap):
                    eb[n].head = f(snap[n][0])
            for n in face_grp:
                eb[n].align_roll(snap[n][2])
        else:
            M = Matrix.Translation(piv) @ Matrix.Diagonal((sx, s, s, 1.0)) @ Matrix.Translation(-piv0)
            transform_bones(eb, face_grp, M)
            front = min(min(eb[n].head.y, eb[n].tail.y) for n in face_grp)
            dy = lm.get("head_front_y", front) - front
            transform_bones(eb, face_grp, Matrix.Translation((0, dy, 0)))
        if move_eyes and "eye" in P and eye0 is not None:
            d = P["eye"] - eb["eye.L"].head
            moves = []
            for nm in [n for n in face_grp if side_of(n) == "L" and n.split(".")[0] in ("eye", "lid")]:
                moves += [(eb[nm].head.copy(), eb[nm].head + d), (eb[nm].tail.copy(), eb[nm].tail + d)]
            move_points(eb, moves)
    # mirror the left side onto the right (rig types and parameters included)
    for b in eb:
        b.select = b.select_head = b.select_tail = side_of(b.name) == "L"
    bpy.ops.armature.symmetrize(direction="NEGATIVE_X")
    for b in eb:
        b.select = b.select_head = b.select_tail = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return meta


_BVH = {}


def _bvh(obj):
    from mathutils.bvhtree import BVHTree
    key = (obj.name, len(obj.data.vertices), tuple(round(v, 6) for v in obj.matrix_world.translation))
    if key not in _BVH:
        V = world_coords(obj, evaluated=False)
        faces = [tuple(p.vertices) for p in obj.data.polygons]
        _BVH[key] = BVHTree.FromPolygons([tuple(v) for v in V], faces)
    return _BVH[key]


_DIRS = [Vector(d).normalized() for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1),
                                          (1, 1, 1), (1, 1, -1), (1, -1, 1), (1, -1, -1), (-1, 1, 1),
                                          (-1, 1, -1), (-1, -1, 1), (-1, -1, -1))]


def inside(obj, p, need=12):
    """True if point p (world) is enclosed by the mesh: rays in >= need of 14 directions
    hit it. Tolerates open holes (eye sockets, neck cuts) that break parity tests."""
    t = _bvh(obj)
    p = Vector(p)
    hits = sum(1 for d in _DIRS if t.ray_cast(p, d)[0] is not None)
    return hits >= need


def bend_angle(meta_or_rig, a, b):
    """Angle in degrees between two consecutive bones at rest."""
    bones = meta_or_rig.data.bones
    u = (bones[a].tail_local - bones[a].head_local).normalized()
    v = (bones[b].tail_local - bones[b].head_local).normalized()
    return math.degrees(u.angle(v))


def check_metarig(meta, body=None):
    """Problems that break Rigify generation or deformation. [] = ready to generate."""
    probs = []
    if any(abs(s - 1) > 1e-5 for s in meta.scale) or any(abs(r) > 1e-5 for r in meta.rotation_euler):
        probs.append("metarig scale/rotation not applied (generated rig differs in size or pose)")
    if any(pb.matrix_basis != Matrix.Identity(4) for pb in meta.pose.bones):
        probs.append("metarig pose != rest: Apply Pose as Rest Pose (pose.armature_apply)")
    for pb in meta.pose.bones:
        b, p = pb.bone, pb.bone.parent
        if p is None:
            continue
        need = b.use_connect or bool(pb.rigify_type and getattr(pb.rigify_parameters, "connect_chain", False))
        if need and (b.head_local - p.tail_local).length > 1e-4:
            probs.append(f"disjoint chain at {b.name} (Rigify: 'bone position is disjoint')")
    bones = meta.data.bones
    for s in ("L", "R"):
        if f"thigh.{s}" in bones:
            ang = bend_angle(meta, f"thigh.{s}", f"shin.{s}")
            th, sh = bones[f"thigh.{s}"], bones[f"shin.{s}"]
            t = (sh.head_local.z - th.head_local.z) / (sh.tail_local.z - th.head_local.z)
            liney = th.head_local.lerp(sh.tail_local, t).y
            if not (1.0 <= ang <= 15.0) or sh.head_local.y > liney:
                probs.append(f"knee.{s}: bend {ang:.1f} deg (want 1-15, forward): IK direction ambiguous")
        if f"upper_arm.{s}" in bones:
            ang = bend_angle(meta, f"upper_arm.{s}", f"forearm.{s}")
            if not (1.0 <= ang <= 15.0):
                probs.append(f"elbow.{s}: bend {ang:.1f} deg (want 1-15, backward)")
        for a, b in (("upper_arm", "forearm"), ("thigh", "shin")):
            if f"{a}.{s}" in bones:
                u, v = bones[f"{a}.{s}"], bones[f"{b}.{s}"]
                n = (u.tail_local - u.head_local).cross(v.tail_local - v.head_local)
                if n.length > 1e-9:
                    n.normalize()
                    for bb in (u, v):
                        x = bb.matrix_local.col[0].xyz
                        if abs(x.dot(n)) < 0.98:
                            probs.append(f"{bb.name}: hinge not on local X (roll), dot={x.dot(n):.2f}")
    if not any(getattr(c, "rigify_ui_row", 0) > 0 for c in meta.data.collections_all):
        probs.append("no bone collection has a Rigify UI row ('No bone collections have UI buttons')")
    upgraded = [pb for pb in meta.pose.bones if pb.rigify_type == "skin.glue"]
    ends = [(b.head_local, b.tail_local) for b in bones]
    for pb in upgraded:
        for e in (pb.bone.head_local, pb.bone.tail_local):
            if sum(1 for h, t in ends if (h - e).length < 1e-5 or (t - e).length < 1e-5) < 2:
                probs.append(f"glue {pb.name} end not coincident with another bone")
                break
    if body is not None:
        for nm in ("spine", "spine.002", "spine.004", "spine.006", "thigh.L", "shin.L", "foot.L",
                   "upper_arm.L", "forearm.L", "hand.L"):
            if nm in bones:
                b = bones[nm]
                mid = meta.matrix_world @ ((b.head_local + b.tail_local) / 2)
                if not inside(body, mid):
                    probs.append(f"{nm}: bone middle outside the mesh volume")
    return probs


def upgrade_face(meta, lid_follow_z=0.3, jaw_lip=0.9, overwrite_widgets=True):
    """Legacy face -> modular face (irreversible, after fitting) + CGDive's tuning."""
    activate(meta)
    if any(pb.rigify_type == "faces.super_face" for pb in meta.pose.bones):
        bpy.ops.pose.rigify_upgrade_face()
    for s in "LR":
        pb = meta.pose.bones.get(f"eye.{s}")
        if pb is not None and hasattr(pb.rigify_parameters, "eyelid_follow_default"):
            x = pb.rigify_parameters.eyelid_follow_default[0]
            pb.rigify_parameters.eyelid_follow_default = (x, lid_follow_z)
    jm = meta.pose.bones.get("jaw_master")
    if jm is not None and hasattr(jm.rigify_parameters, "jaw_mouth_influence"):
        jm.rigify_parameters.jaw_mouth_influence = jaw_lip
    meta.data.rigify_force_widget_update = overwrite_widgets
    return len(meta.data.bones)


def generate(meta):
    """Generate (or regenerate in place) the rig. Returns (rig, None) or (None, message).

    On failure Rigify leaves a partial rig active; this re-activates the metarig so
    the named bone can be fixed and generate() called again."""
    activate(meta)
    try:
        bpy.ops.pose.rigify_generate()
    except RuntimeError as e:
        lines = [ln for ln in str(e).splitlines() if ln.strip()]
        msg = next((ln for ln in lines if "RIGIFY ERROR" in ln), lines[0] if lines else str(e))
        activate(meta)
        return None, msg.strip()
    rig = meta.data.rigify_target_rig
    meta.hide_set(True)
    return rig, None


# ----------------------------------------------------------------------------------
# bone placement overlay (X-ray render: are the joints in the volume?)
# ----------------------------------------------------------------------------------
def bones_mesh(arm_obj, name="BX_bones", only=None, radius=0.06):
    """Octahedral bone shapes as a mesh (armatures do not render), world space."""
    bm = bmesh.new()
    mw = arm_obj.matrix_world
    for b in arm_obj.data.bones:
        if only and not only(b):
            continue
        h, t = mw @ b.head_local, mw @ b.tail_local
        L = (t - h).length
        if L < 1e-6:
            continue
        x = (mw.to_3x3() @ b.matrix_local.col[0].xyz).normalized() * L * radius
        z = (mw.to_3x3() @ b.matrix_local.col[2].xyz).normalized() * L * radius
        m = h + (t - h) * 0.15
        vs = [bm.verts.new(p) for p in (h, m + x, m + z, m - x, m - z, t)]
        for i in range(4):
            a, c = vs[1 + i], vs[1 + (i + 1) % 4]
            bm.faces.new((vs[0], c, a))
            bm.faces.new((vs[5], a, c))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return bpy.data.objects.new(name, me)


def placement_sheet(objs, out_dir, arm_obj=None, points=None, views=("front", "right"), res=600,
                    only=None, name="placement", center=None, size=None):
    """Bones (and optional points) drawn over an X-ray render of the meshes.

    The agent's version of checking bone placement from front, side and top: are
    joints in the centre of the volume, knees and elbows pre-bent, spine inside?"""
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.data.scenes.new("BX_Placement")
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.image_settings.media_type = "IMAGE"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sh = sc.display.shading
    sh.light, sh.color_type = "STUDIO", "OBJECT"
    world = bpy.data.worlds.new("BX_Placement_W")
    world.color = (0.92, 0.92, 0.92)
    sc.world = world
    body_col = bpy.data.collections.new("BX_body")
    bone_col = bpy.data.collections.new("BX_bonesc")
    sc.collection.children.link(body_col)
    sc.collection.children.link(bone_col)
    temp = []
    for o in objs:
        body_col.objects.link(o)
    saved = {o: tuple(o.color) for o in objs}
    for o in objs:
        o.color = (0.55, 0.55, 0.55, 1)
    if arm_obj is not None:
        for side, col, test in (("L", (0.1, 0.35, 1, 1), lambda b: side_of(b.name) == "L"),
                                ("R", (1, 0.15, 0.1, 1), lambda b: side_of(b.name) == "R"),
                                ("C", (1, 0.75, 0.0, 1), lambda b: side_of(b.name) == "")):
            bo = bones_mesh(arm_obj, "BX_bones_" + side,
                            only=(lambda b, t=test: t(b) and (only(b) if only else True)))
            bo.color = col
            bone_col.objects.link(bo)
            temp.append(bo)
    if points:
        bm = bmesh.new()
        for p in points:
            bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.008, matrix=Matrix.Translation(Vector(p)))
        me = bpy.data.meshes.new("BX_pts")
        bm.to_mesh(me)
        bm.free()
        po = bpy.data.objects.new("BX_pts", me)
        po.color = (0, 0.7, 0.2, 1)
        bone_col.objects.link(po)
        temp.append(po)
    cam = bpy.data.objects.new("BX_PCam", bpy.data.cameras.new("BX_PCam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    V = np.vstack([world_coords(o, evaluated=False) for o in objs if o.type == "MESH"])
    lo, hi = V.min(0), V.max(0)
    c = Vector(center) if center is not None else Vector(((lo + hi) / 2).tolist())
    size = size or float(max(hi - lo)) * 1.1
    dirs = {"front": Vector((0, -1, 0)), "right": Vector((1, 0, 0)), "left": Vector((-1, 0, 0)),
            "back": Vector((0, 1, 0)), "top": Vector((0, 0, 1))}
    paths = []

    def shot(path, bodies, bones, xray, transparent):
        body_col.hide_render, bone_col.hide_render = not bodies, not bones
        sh.show_xray, sh.xray_alpha = xray, 0.3
        sc.render.film_transparent = transparent
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True, scene=sc.name)
        im = bpy.data.images.load(path, check_existing=False)
        a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)
        bpy.data.images.remove(im)
        return a
    try:
        for v in views:
            d = dirs[v]
            cam.data.type, cam.data.ortho_scale = "ORTHO", size
            cam.location = c + d * size * 3
            up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((0, 1, 0))
            cam.rotation_euler = _look_rot(-d, up).to_euler()
            cam.data.clip_end = size * 10
            p = os.path.join(out_dir, f"{name}_{v}.png")
            A = shot(p, True, False, True, False)
            if temp:
                B = shot(p, False, True, False, True)
                al = B[..., 3:4]
                A[..., :3] = B[..., :3] * al + A[..., :3] * (1 - al)
            img = bpy.data.images.new("BX_comp", A.shape[1], A.shape[0], alpha=True)
            img.pixels = A.ravel()
            img.filepath_raw = p
            img.file_format = "PNG"
            img.save()
            bpy.data.images.remove(img)
            paths.append(p)
        sheet = tile_images([paths], os.path.join(out_dir, f"{name}_sheet.png"))
    finally:
        for o, col in saved.items():
            o.color = col
        for t in temp:
            me = t.data
            bpy.data.objects.remove(t)
            bpy.data.meshes.remove(me)
        cd = cam.data
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cd)
        bpy.data.collections.remove(body_col)
        bpy.data.collections.remove(bone_col)
        bpy.data.scenes.remove(sc)
        bpy.data.worlds.remove(world)
    return sheet


def _look_rot(fwd, up):
    fwd = fwd.normalized()
    right = fwd.cross(up).normalized()
    up2 = right.cross(fwd)
    return Matrix((right, up2, -fwd)).transposed()


def tile_images(rows, out):
    """Compose a grid of PNG paths (list of rows) into one PNG with numpy."""
    imgs = []
    for row in rows:
        r = []
        for p in row:
            im = bpy.data.images.load(p, check_existing=False)
            w, h = im.size
            r.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
            bpy.data.images.remove(im)
        imgs.append(r)
    h = max(a.shape[0] for r in imgs for a in r)
    w = max(a.shape[1] for r in imgs for a in r)
    ncol = max(len(r) for r in imgs)
    sheet = np.ones((len(imgs) * h, ncol * w, 4), dtype=np.float32)
    for i, r in enumerate(imgs):
        for j, a in enumerate(r):
            y0 = (len(imgs) - 1 - i) * h
            sheet[y0:y0 + a.shape[0], j * w:j * w + a.shape[1]] = a
    img = bpy.data.images.new("BX_tile", ncol * w, len(imgs) * h, alpha=True)
    img.pixels = sheet.ravel()
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return out


# ----------------------------------------------------------------------------------
# 3. weights: bind, verify, fall back, clean (data-level, mode independent)
# ----------------------------------------------------------------------------------
INTERNAL_PARTS = ("teeth", "tongue", "eye")


def deform_names(rig):
    return {b.name for b in rig.data.bones if b.use_deform}


def weight_matrix(obj, groups=None):
    """(n_verts, n_groups) weight array and the group names (all groups by default)."""
    names = [g.name for g in obj.vertex_groups] if groups is None else list(groups)
    col = {obj.vertex_groups[n].index: j for j, n in enumerate(names) if n in obj.vertex_groups}
    W = np.zeros((len(obj.data.vertices), len(names)), dtype=np.float64)
    for v in obj.data.vertices:
        for g in v.groups:
            j = col.get(g.group)
            if j is not None:
                W[v.index, j] = g.weight
    return W, names


def write_weights(obj, W, names, eps=1e-6):
    """Replace the weights of `names` with the columns of W (zeros are removed)."""
    allv = list(range(len(obj.data.vertices)))
    for j, n in enumerate(names):
        vg = obj.vertex_groups.get(n) or obj.vertex_groups.new(name=n)
        vg.remove(allv)
        nz = np.nonzero(W[:, j] > eps)[0]
        if len(nz) == 0:
            continue
        # vg.add takes one weight per call: batch equal weights
        vals = np.round(W[nz, j], 6)
        order = np.argsort(vals)
        vs, idx = vals[order], nz[order]
        cuts = np.nonzero(np.diff(vs))[0] + 1
        for a, b in zip(np.r_[0, cuts], np.r_[cuts, len(vs)]):
            vg.add(idx[a:b].tolist(), float(vs[a]), "REPLACE")


def weight_report(obj, rig, expect_inside=True):
    """Numbers that catch silent auto-weight failure and export problems.

    unweighted: vertices with total deform weight < 1e-4 (they will not move)
    empty_inside: deform groups with no weight although the bone lies inside the mesh
    non_deform_groups: groups for bones that do not deform (or no bone at all)
    max_influences / over4: influences per vertex (game engines usually take 4)
    sum_dev: vertices whose deform weights do not sum to 1 within 0.01
    mirror_err: worst L/R weight mismatch on mirrored vertex pairs (symmetric meshes)"""
    dn = deform_names(rig)
    W, names = weight_matrix(obj)
    is_def = np.array([n in dn for n in names], dtype=bool)
    Wd = W[:, is_def] if is_def.any() else np.zeros((len(W), 0))
    tot = Wd.sum(1) if Wd.size else np.zeros(len(W))
    rep = {"verts": len(W), "groups": len(names)}
    rep["unweighted"] = int((tot < 1e-4).sum())
    rep["sum_dev"] = int((np.abs(tot - 1) > 0.01).sum())
    cnt = (Wd > 1e-4).sum(1) if Wd.size else np.zeros(len(W), int)
    rep["max_influences"] = int(cnt.max()) if len(cnt) else 0
    rep["over4"] = int((cnt > 4).sum())
    rep["non_deform_groups"] = [n for n in names if n not in dn]
    empty = []
    if expect_inside and obj.type == "MESH":
        dnames = [n for n in names if n in dn]
        gsum = dict(zip(dnames, Wd.sum(0))) if Wd.size else {}
        for n in dnames:
            if gsum.get(n, 0) < 1e-3:
                b = rig.data.bones[n]
                mid = rig.matrix_world @ ((b.head_local + b.tail_local) / 2)
                if inside(obj, mid):
                    empty.append(n)
    rep["empty_inside"] = empty
    # heat failure signature: unweighted vertices, or a MAJOR bone inside the mesh with
    # nothing. Small face bones and internal parts (teeth, tongue, eyes) can be empty
    # on the skin legitimately.
    Hm = float(max(rig.dimensions.z, 1e-6))
    major = [n for n in empty if rig.data.bones[n].length >= 0.05 * Hm
             and not any(k in n for k in INTERNAL_PARTS)]
    rep["empty_major"] = major
    # mirror consistency (only meaningful for symmetric meshes)
    V = world_coords(obj, evaluated=False)
    kd = KDTree(len(V))
    for i, co in enumerate(V):
        kd.insert(co, i)
    kd.balance()
    col = {n: j for j, n in enumerate(names)}
    worst, pairs = 0.0, 0
    for i in np.nonzero(V[:, 0] > 1e-4)[0][::7]:
        co, j, dist = kd.find((-V[i, 0], V[i, 1], V[i, 2]))
        if dist > 1e-4:
            continue
        pairs += 1
        for n, c in col.items():
            if W[i, c] < 1e-4:
                continue
            m = mirror_name(n)
            if m in col:
                worst = max(worst, abs(W[i, c] - W[j, col[m]]))
    rep["mirror_pairs_sampled"] = pairs
    rep["mirror_err"] = round(float(worst), 4) if pairs else None
    rep["ok"] = rep["unweighted"] == 0 and not major
    return rep


def clean_weights(obj, rig, limit=0.01, max_influences=None, normalize=True):
    """Remove weights below `limit`, optionally keep the N largest, normalize deform
    weights to 1 (Demeter: clean near-zero weights before blurring; games: 4)."""
    dn = deform_names(rig)
    W, names = weight_matrix(obj)
    d = np.array([n in dn for n in names], dtype=bool)
    Wd = W[:, d]
    Wd[Wd < limit] = 0.0
    if max_influences:
        if Wd.shape[1] > max_influences:
            kth = np.sort(Wd, axis=1)[:, -max_influences][:, None]
            Wd[Wd < kth] = 0.0
            # ties can leave more than N: keep first N
            over = (Wd > 0).sum(1) > max_influences
            for i in np.nonzero(over)[0]:
                keep = np.argsort(-Wd[i])[:max_influences]
                row = np.zeros_like(Wd[i])
                row[keep] = Wd[i, keep]
                Wd[i] = row
    if normalize:
        s = Wd.sum(1, keepdims=True)
        Wd = np.where(s > 1e-9, Wd / np.maximum(s, 1e-12), Wd)
    W[:, d] = Wd
    write_weights(obj, W[:, d], [n for n, k in zip(names, d) if k])
    return weight_report(obj, rig, expect_inside=False)


def remove_non_deform_groups(obj, rig):
    """CGDive's lock-DEF-then-delete-unlocked cleanup, done directly."""
    dn = deform_names(rig)
    gone = [g.name for g in obj.vertex_groups if g.name not in dn]
    for n in gone:
        obj.vertex_groups.remove(obj.vertex_groups[n])
    return gone


def strip_opposite_side(obj, rig, margin=None):
    """Remove .L bone weights from vertices clearly on the right half (x < -margin) and
    .R weights from the left half, then renormalize. Fixes the classic auto-weight leak
    (left thigh moving the right inner thigh at the crotch; CGDive: 'the leg bone
    should not affect ... the other leg'). Symmetric, -Y facing characters only.
    margin defaults to 1% of the height. Returns the number of vertices changed."""
    V = world_coords(obj, evaluated=False)
    margin = 0.01 * float(np.ptp(V[:, 2])) if margin is None else margin
    dn = deform_names(rig)
    W, names = weight_matrix(obj)
    sides = np.array([side_of(n) if n in dn else "-" for n in names])
    changed = 0
    for side, mask in (("L", V[:, 0] < -margin), ("R", V[:, 0] > margin)):
        cols = np.nonzero(sides == side)[0]
        rows = np.nonzero(mask & (W[:, cols] > 0).any(1))[0] if len(cols) else []
        for i in rows:
            keep = W[i].copy()
            keep[cols] = 0.0
            d = np.array([n in dn for n in names])
            if keep[d].sum() > 1e-6:
                W[i] = keep
                changed += 1
    d = np.array([n in dn for n in names])
    Wd = W[:, d]
    ssum = Wd.sum(1, keepdims=True)
    W[:, d] = np.where(ssum > 1e-9, Wd / np.maximum(ssum, 1e-12), Wd)
    write_weights(obj, W[:, d], [n for n, k in zip(names, d) if k])
    return changed


def smooth_weights(obj, rig, factor=0.5, repeat=2, bones=None, vertex_indices=None):
    """vertex_group_smooth in Weight Paint mode (the headless-safe operator).

    bones: smooth only between these deform groups (BONE_SELECT, CGDive's "Selected
    Pose Bones") else all deform groups (Demeter: never only the active group).
    vertex_indices: restrict to these vertices (vertex selection mask)."""
    activate(obj, "OBJECT", select=[rig])
    bpy.context.view_layer.objects.active = obj
    me = obj.data
    if vertex_indices is not None:
        sel = np.zeros(len(me.vertices), dtype=bool)
        sel[list(vertex_indices)] = True
        me.vertices.foreach_set("select", sel)
        me.use_paint_mask_vertex = True
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    try:
        if bones:
            for pb in rig.pose.bones:
                pb.select = pb.name in bones
            mode = "BONE_SELECT"
        else:
            mode = "BONE_DEFORM"
        bpy.ops.object.vertex_group_smooth(group_select_mode=mode, factor=factor, repeat=repeat)
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
        me.use_paint_mask_vertex = False
    return weight_report(obj, rig, expect_inside=False)


def armature_first(obj):
    """Armature modifier right after any Mirror modifier and before everything else
    (Subdivision, Solidify, Corrective Smooth). parent_set appends it last (verified
    5.2.1): deforming after Subdivision multiplies the cost (Demeter, Dikko), and an
    Armature placed before a Mirror makes the mirrored half copy the posed half."""
    mods = list(obj.modifiers)
    arm = next((m for m in mods if m.type == "ARMATURE"), None)
    if arm is None:
        return [m.type for m in mods]
    others = [m for m in mods if m is not arm]
    target = 0
    for i, m in enumerate(others):
        if m.type == "MIRROR":
            target = i + 1
    if mods.index(arm) != target:
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_move_to_index(modifier=arm.name, index=target)
    return [m.type for m in obj.modifiers]


def apply_pose_as_rest(rig, meshes):
    """Make the rig's current pose its rest pose, the meshes following, shape keys kept.

    modifier_apply refuses a mesh with shape keys (5.2.1), and re-adding the Armature
    modifier appends it after Subdivision. Instead, each mesh's Basis and every key are
    evaluated through its rig Armature modifiers alone (others hidden) and written back as
    data; the modifier stack is left as it was. Returns {mesh name: keys rewritten}.

    Raises ValueError, before changing anything, when two meshes share one mesh datablock
    (linked duplicates): the first write would feed the second an already-baked input, and
    one datablock cannot hold two results. Make them single-user first."""
    meshes = list(dict.fromkeys(meshes))
    owners = {}
    for obj in meshes:
        owners.setdefault(obj.data.as_pointer(), (obj.data.name, []))[1].append(obj.name)
    shared = {d: names for d, names in owners.values() if len(names) > 1}
    if shared:
        raise ValueError(f"meshes share mesh data, make them single-user first: {shared}")
    out = {}
    dg = bpy.context.evaluated_depsgraph_get()
    for obj in meshes:
        vis = [(m, m.show_viewport) for m in obj.modifiers]
        for m in obj.modifiers:
            m.show_viewport = m.type == "ARMATURE" and m.object == rig
        keys = obj.data.shape_keys.key_blocks if obj.data.shape_keys else []
        only, active = obj.show_only_shape_key, obj.active_shape_key_index
        coords = []
        for i in range(max(len(keys), 1)):
            if keys:
                obj.show_only_shape_key, obj.active_shape_key_index = True, i
            dg.update()
            ev = obj.evaluated_get(dg)
            me = ev.to_mesh()
            co = np.empty(len(me.vertices) * 3)
            me.vertices.foreach_get("co", co)
            ev.to_mesh_clear()
            coords.append(co)
        obj.show_only_shape_key, obj.active_shape_key_index = only, active
        for m, v in vis:
            m.show_viewport = v
        obj.data.vertices.foreach_set("co", coords[0])
        for kb, co in zip(keys, coords):
            kb.data.foreach_set("co", co)
        obj.data.update()
        out[obj.name] = len(keys)
    activate(rig, "POSE")
    bpy.ops.pose.armature_apply(selected=False)
    activate(rig, "OBJECT")
    return out


def _parent(rig, objs, kind):
    activate(rig, "OBJECT", select=objs)
    bpy.ops.object.parent_set(type=kind)


def transfer_weights(src, dst, rig=None, apply=True, mapping="POLYINTERP_NEAREST", max_dist=None,
                     max_angle=35.0):
    """Copy vertex-group weights from src to dst with a Data Transfer modifier, applied.

    Dikko / CGDive: garments and accessories get weights from the SAME source as the
    body so they deform identically, and the transfer is applied so weights do not
    change while animating. dst keeps (or gets) an Armature modifier to rig.

    mapping='ROBUST' (no modifier, always applied): each vertex copies the weights of
    its closest point on src only when that point is within max_dist (default 5% of
    dst's bounding-box diagonal) and the normals are within max_angle degrees; the
    other vertices are inpainted from the copied ones over dst's edges, then lightly
    smoothed (Abdrashitov et al., "Robust Skin Weights Transfer via Weight Inpainting",
    SIGGRAPH Asia 2023). Nearest-face copies every vertex, so the loose part of a skirt
    or coat takes whichever leg is closest and tears between them. Sets dst["bx_matched"]
    and dst["bx_inpainted"] (vertex counts); raises ValueError when no vertex passes both
    gates."""
    for g in src.vertex_groups:
        if g.name not in dst.vertex_groups:
            dst.vertex_groups.new(name=g.name)
    if mapping == "ROBUST":
        W, names, ok = robust_weights(src, dst, max_dist=max_dist, max_angle=max_angle)
        write_weights(dst, W, names)
        dst["bx_matched"], dst["bx_inpainted"] = int(ok.sum()), int((~ok).sum())
    else:
        m = dst.modifiers.new("BX_weights", "DATA_TRANSFER")
        m.object = src
        m.use_vert_data = True
        m.data_types_verts = {"VGROUP_WEIGHTS"}
        m.vert_mapping = mapping
        m.layers_vgroup_select_src = "ALL"
        m.layers_vgroup_select_dst = "NAME"
        with bpy.context.temp_override(object=dst, active_object=dst):
            bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
            if apply:
                bpy.ops.object.modifier_apply(modifier=m.name)
    if rig is not None and not any(md.type == "ARMATURE" for md in dst.modifiers):
        am = dst.modifiers.new("Armature", "ARMATURE")
        am.object = rig
    if rig is not None:
        mw = dst.matrix_world.copy()
        dst.parent = rig
        dst.matrix_world = mw
        armature_first(dst)
    return dst


def _triangles(obj):
    """(T, 3) vertex indices of the mesh's loop triangles."""
    me = obj.data
    me.calc_loop_triangles()
    T = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", T)
    return T.reshape(-1, 3)


def _edges(obj):
    me = obj.data
    ed = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", ed)
    return ed.reshape(-1, 2)


def _surface(obj):
    """World positions and (T, 3) loop triangles from one evaluated mesh, Subdivision
    hidden, so a live Mirror's generated half is part of the surface."""
    hidden = [m for m in obj.modifiers if m.type in ("SUBSURF", "MULTIRES") and m.show_viewport]
    for m in hidden:
        m.show_viewport = False
    try:
        eo = obj.evaluated_get(evaluate())
        me = eo.to_mesh()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        me.calc_loop_triangles()
        T = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", T)
        mw = np.array(eo.matrix_world)
        eo.to_mesh_clear()
    finally:
        for m in hidden:
            m.show_viewport = True
    return co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3], T.reshape(-1, 3)


def _seed_from(ok, edges, P):
    """For every vertex, the index of a copied vertex (ok) to start from: the nearest
    over the mesh's edges, else (a part no edge path reaches) the nearest in space."""
    from mathutils.kdtree import KDTree
    src = np.where(ok, np.arange(len(ok)), -1)
    a = np.r_[edges[:, 0], edges[:, 1]]
    b = np.r_[edges[:, 1], edges[:, 0]]
    while True:
        m = (src[a] >= 0) & (src[b] < 0)
        if not m.any():
            break
        src[b[m]] = src[a[m]]
    lost = np.nonzero(src < 0)[0]
    if len(lost):
        idx = np.nonzero(ok)[0]
        kd = KDTree(len(idx))
        for j, i in enumerate(idx):
            kd.insert(Vector(P[i]), j)
        kd.balance()
        for i in lost:
            src[i] = idx[kd.find(Vector(P[i]))[1]]
    return src


def _diffuse(F, edges, iterations, step, fixed=None, tol=None):
    """Move each row of F toward the mean of its edge neighbours (rows in `fixed` stay),
    up to `iterations` passes, stopping early once no value moves more than `tol`."""
    n = len(F)
    a = np.r_[edges[:, 0], edges[:, 1]]
    b = np.r_[edges[:, 1], edges[:, 0]]
    order = np.argsort(a, kind="stable")
    a, b = a[order], b[order]
    deg = np.bincount(a, minlength=n)
    has = np.nonzero(deg)[0]
    if not len(has):
        return F
    starts = np.searchsorted(a, has)
    move = np.zeros(n, dtype=bool)
    move[has] = True
    if fixed is not None:
        move &= ~fixed
    for _ in range(iterations):
        avg = np.add.reduceat(F[b], starts, axis=0) / deg[has, None]
        new = F.copy()
        new[has] = (1.0 - step) * F[has] + step * avg
        new = np.where(move[:, None], new, F)
        done = tol is not None and float(np.abs(new - F).max(initial=0.0)) < tol
        F = new
        if done:
            break
    return F


def robust_weights(src, dst, max_dist=None, max_angle=35.0, inpaint=5000, smooth=10):
    """Weights for dst from src by closest point, distance and normal gates, then
    inpainting (see transfer_weights mapping='ROBUST'). Both meshes in their rest
    shape. Each rejected vertex starts from the weights of the nearest copied one, never
    from the skin under it, and diffusion runs until no weight moves more than 1e-6
    (at most `inpaint` passes). Returns (W, names, matched) without writing anything."""
    from mathutils.bvhtree import BVHTree
    S = world_coords(src, evaluated=False)
    if len(world_coords(src, no_subdiv=True)) != len(S):
        # the weights live on the base mesh, which lacks the generated half
        raise ValueError(
            f"robust transfer: modifiers on {src.name} add vertices (a live Mirror?); "
            "apply them first or use nearest-face")
    T = _triangles(src)
    tree = BVHTree.FromPolygons([tuple(v) for v in S], T.tolist())
    Ws, names = weight_matrix(src)
    used = np.nonzero(Ws.any(axis=0))[0]
    Ws, names = Ws[:, used], [names[j] for j in used]
    D = world_coords(dst, evaluated=False)
    nv = np.empty(len(dst.data.vertices) * 3)
    dst.data.vertex_normals.foreach_get("vector", nv)
    N = nv.reshape(-1, 3) @ np.linalg.inv(np.array(dst.matrix_world)[:3, :3])
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    if max_dist is None:
        max_dist = 0.05 * float(np.linalg.norm(np.ptp(D, axis=0)))
    cos_gate = math.cos(math.radians(max_angle))
    W = np.zeros((len(D), len(names)))
    ok = np.zeros(len(D), dtype=bool)
    gap = math.inf
    for i, p in enumerate(D):
        loc, nrm, ti, dist = tree.find_nearest(Vector(p))
        if loc is None:
            continue
        gap = min(gap, dist)
        a, b, c = S[T[ti]]
        v0, v1, v2 = b - a, c - a, np.array(loc) - a
        d00, d01, d11, d20, d21 = v0 @ v0, v0 @ v1, v1 @ v1, v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-18:
            bary = np.array([1.0, 0.0, 0.0])
        else:
            v = (d11 * d20 - d01 * d21) / den
            w = (d00 * d21 - d01 * d20) / den
            bary = np.clip([1.0 - v - w, v, w], 0.0, 1.0)
            bary /= bary.sum()
        W[i] = bary @ Ws[T[ti]]
        # abs: a garment's inner wall faces the skin the other way and still matches
        ok[i] = dist <= max_dist and abs(float(N[i] @ np.array(nrm))) >= cos_gate
    if not ok.any():
        # inpainting from nothing silently smooths every vertex into a blur
        raise ValueError(
            f"robust transfer: no vertex of {dst.name} lies within max_dist={max_dist:.4f} of "
            f"{src.name} with normals within {max_angle} degrees (closest gap {gap:.4f}); "
            "raise max_dist or use nearest-face")
    ed = _edges(dst)
    if (~ok).any():
        W = W[_seed_from(ok, ed, D)]
        W = _diffuse(W, ed, inpaint, 1.0, fixed=ok, tol=1e-6)
    W = _diffuse(W, ed, smooth, 0.1)
    s = W.sum(axis=1, keepdims=True)
    W = np.where(s > 1e-9, W / np.maximum(s, 1e-9), W)
    return W, names, ok


def garment_depth(rig, body, garments, poses=None, limit=0.005):
    """Per pose, how much deeper each garment vertex sits inside the body than in the
    rest pose (scene units; overlap already there at rest is not counted). weight_report
    and deformation_report each read one mesh, so a sleeve sinking into the arm passes
    both. Subdivision is disabled while measuring; the body's normals must face out
    (model_check). Raises ValueError when a pose names controls the rig lacks, since
    the body would then be measured at rest. Returns {"limit", "rest_inside":
    {garment: vertices inside at rest}, "poses": {pose: {garment: {"max", "over"}}},
    "fail": [(pose, garment)]}."""
    from mathutils.bvhtree import BVHTree
    poses = poses or RIGIFY_POSES

    def depth(surface, PG):
        PB, T = surface
        tree = BVHTree.FromPolygons([tuple(v) for v in PB], T.tolist())
        out = np.zeros(len(PG))
        for i, p in enumerate(PG):
            loc, nrm, _ti, _d = tree.find_nearest(Vector(p))
            if loc is not None:
                out[i] = max(0.0, -float((np.array(p) - np.array(loc)) @ np.array(nrm)))
        return out

    reset_pose(rig)
    surf = _surface(body)
    H = float(np.ptp(surf[0][:, 2]))
    rest = {g.name: depth(surf, world_coords(g, no_subdiv=True)) for g in garments}
    rep = {"limit": limit, "rest_inside": {k: int((v > 1e-6).sum()) for k, v in rest.items()}, "poses": {},
           "fail": []}
    try:
        for p in poses:
            skipped = apply_pose(rig, p, H)
            if skipped:
                raise ValueError(f"garment_depth: pose {p['name']} needs controls {rig.name} lacks: "
                                 f"{skipped}; pass poses built for this rig")
            surf = _surface(body)
            r = {}
            for g in garments:
                d = depth(surf, world_coords(g, no_subdiv=True)) - rest[g.name]
                r[g.name] = {"max": round(float(d.max(initial=0.0)), 5), "over": int((d > limit).sum())}
                if r[g.name]["over"]:
                    rep["fail"].append((p["name"], g.name))
            rep["poses"][p["name"]] = r
    finally:
        reset_pose(rig)
    return rep


def islands(obj):
    """Vertex index arrays of the loose parts of a mesh."""
    me = obj.data
    n = len(me.vertices)
    ed = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", ed)
    parent = np.arange(n)

    def find(a):
        root = a
        while parent[root] != root:
            root = parent[root]
        while parent[a] != root:
            parent[a], a = root, parent[a]
        return root
    for a, b in ed.reshape(-1, 2):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    roots = np.array([find(i) for i in range(n)])
    return [np.nonzero(roots == r)[0] for r in np.unique(roots)]


def nearest_deform_bone(rig, p, candidates=None):
    best, bd = None, 1e9
    mw = rig.matrix_world
    for b in rig.data.bones:
        if not b.use_deform or (candidates and b.name not in candidates):
            continue
        a, c = mw @ b.head_local, mw @ b.tail_local
        ab = c - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
        d = (a + ab * t - p).length
        if d < bd:
            best, bd = b.name, d
    return best


def assign_rigid(obj, rig, bone=None, candidates=None):
    """Rigid parts (eyes, teeth, hard-surface pieces): every loose island gets weight
    1.0 on ONE deform bone (the given one, or the nearest to the island centre).
    CGDive/BajO: assign, do not paint; auto weights make eyes and teeth drift."""
    V = world_coords(obj, evaluated=False)
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    out = {}
    for isl in islands(obj):
        name = bone or nearest_deform_bone(rig, _v(V[isl].mean(0)), candidates)
        vg = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
        vg.add(isl.tolist(), 1.0, "REPLACE")
        out.setdefault(name, 0)
        out[name] += len(isl)
    if not any(m.type == "ARMATURE" for m in obj.modifiers):
        m = obj.modifiers.new("Armature", "ARMATURE")
        m.object = rig
    mw = obj.matrix_world.copy()
    obj.parent = rig
    obj.matrix_world = mw
    armature_first(obj)
    return out


def proxy_weights(rig, targets, voxel=None, keep_proxy=False):
    """Bone-heat fallback: voxel-remesh a joined copy of the targets (one watertight
    shell), auto-weight the proxy, transfer to each target, apply. Deterministic fix
    for heat failures and multi-piece characters (Dikko's cage idea, verified)."""
    copies = []
    for o in targets:
        c = o.copy()
        c.data = o.data.copy()
        bpy.context.scene.collection.objects.link(c)
        for md in list(c.modifiers):
            c.modifiers.remove(md)
        c.parent = None
        c.matrix_world = o.matrix_world.copy()
        for g in list(c.vertex_groups):
            c.vertex_groups.remove(g)
        copies.append(c)
    V = np.vstack([world_coords(c, evaluated=False) for c in copies])
    H = float(np.ptp(V[:, 2]))
    proxy = copies[0]
    if len(copies) > 1:
        with bpy.context.temp_override(active_object=proxy, selected_editable_objects=copies,
                                       selected_objects=copies):
            bpy.ops.object.join()
    proxy.name = "BX_weight_proxy"
    bpy.context.view_layer.update()
    proxy.data.transform(proxy.matrix_world)
    proxy.matrix_world = Matrix.Identity(4)
    base_me = proxy.data.copy()
    ok = False
    for vs in ([voxel] if voxel else [H / 180.0, H / 90.0, H / 45.0]):
        # an open mesh (eye holes, neck cut) voxelizes into a thin shell with the bones
        # OUTSIDE it and heat fails again: a coarser voxel closes the holes
        proxy.data = base_me.copy()
        for g in list(proxy.vertex_groups):
            proxy.vertex_groups.remove(g)
        for md in [m for m in proxy.modifiers if m.type == "ARMATURE"]:
            proxy.modifiers.remove(md)
        proxy.data.remesh_voxel_size = vs
        with bpy.context.temp_override(object=proxy, active_object=proxy, selected_objects=[proxy]):
            bpy.ops.object.voxel_remesh()
        _parent(rig, [proxy], "ARMATURE_AUTO")
        W, _ = weight_matrix(proxy)
        if len(W) and (W.sum(1) > 1e-4).all():
            ok = True
            break
    proxy["bx_proxy_ok"] = ok
    proxy["bx_proxy_voxel"] = vs
    for o in targets:
        for g in list(o.vertex_groups):
            o.vertex_groups.remove(g)
        transfer_weights(proxy, o, rig=rig)
    if not keep_proxy:
        me = proxy.data
        bpy.data.objects.remove(proxy)
        bpy.data.meshes.remove(me)
        proxy = None
    return proxy


def bind(rig, body, garments=(), rigid=None, fallback="proxy", voxel=None, clean=0.01,
         max_influences=None, subdivision_last=True, symmetric=True, route="auto",
         garment_mapping="POLYINTERP_NEAREST"):
    """Bind a character to a (generated) rig and PROVE the weights are usable.

    1 body: automatic weights (bone heat); parent_set returns FINISHED even when heat
      fails, so the result is measured (unweighted verts, empty deform groups inside).
    2 on failure: proxy route (voxel-remeshed copy, auto weights, Data Transfer back).
    3 garments: weights transferred from the body and applied (identical deformation);
      garment_mapping='ROBUST' for loose or hanging parts (transfer_weights).
    4 rigid: {obj: bone_name or None}; islands assigned 1.0 (None = nearest bone).
    5 clean (< clean), optional max_influences, normalize; Armature modifier first.
    symmetric=True strips .L weights from the right half and .R from the left before
    the garments copy the body (auto weights leak across the crotch and armpits).
    route='proxy' skips direct bone heat (multi-piece or non-manifold bodies).
    Returns a report dict with 'route' and per-object weight reports."""
    rep = {"route": "auto"}
    for o in [body, *garments]:
        for g in list(o.vertex_groups):
            o.vertex_groups.remove(g)
        for md in [m for m in o.modifiers if m.type == "ARMATURE"]:
            o.modifiers.remove(md)
    if route == "proxy":
        r = {"ok": False, "unweighted": None, "empty_inside": None}
    else:
        _parent(rig, [body], "ARMATURE_AUTO")
        r = weight_report(body, rig)
    rep["auto"] = {k: r[k] for k in ("unweighted", "empty_inside")}
    if not r["ok"] and (fallback == "proxy" or route == "proxy"):
        rep["route"] = "proxy"
        for md in [m for m in body.modifiers if m.type == "ARMATURE"]:
            body.modifiers.remove(md)
        px = proxy_weights(rig, [body], voxel=voxel, keep_proxy=True)
        rep["proxy_ok"], rep["proxy_voxel"] = bool(px["bx_proxy_ok"]), float(px["bx_proxy_voxel"])
        me_ = px.data
        bpy.data.objects.remove(px)
        bpy.data.meshes.remove(me_)
    if symmetric:
        rep["stripped_cross_side"] = strip_opposite_side(body, rig)
    for g in garments:
        transfer_weights(body, g, rig=rig, mapping=garment_mapping)
    for o, bone in (rigid or {}).items():
        assign_rigid(o, rig, bone)
    for o in [body, *garments]:
        remove_non_deform_groups(o, rig)
        clean_weights(o, rig, limit=clean, max_influences=max_influences)
        armature_first(o)
        if subdivision_last:
            for m in o.modifiers:
                if m.type == "SUBSURF":
                    m.use_pin_to_last = True
    rep["body"] = weight_report(body, rig)
    rep["garments"] = {g.name: weight_report(g, rig, expect_inside=False) for g in garments}
    rep["ok"] = rep["body"]["ok"] and all(v["unweighted"] == 0 for v in rep["garments"].values())
    return rep


# ----------------------------------------------------------------------------------
# 4. test poses (range of motion), deformation numbers, pose sheets
# ----------------------------------------------------------------------------------
_PROP_DEFAULTS = {}


def reset_pose(rig):
    """Rest pose + custom properties back to their UI defaults (e.g. Rigify IK_FK)."""
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.rotation_axis_angle = (0, 0, 1, 0)
        pb.scale = (1, 1, 1)
        for k in list(pb.keys()):
            key = (rig.name, pb.name, k)
            if key in _PROP_DEFAULTS:
                pb[k] = _PROP_DEFAULTS[key]
    evaluate(rig)


def _setprop(rig, bone, key, value):
    pb = rig.pose.bones.get(bone)
    if pb is None or key not in pb.keys():
        return False
    _PROP_DEFAULTS.setdefault((rig.name, bone, key), pb[key])
    pb[key] = value
    return True


def _world_axis(rig, pb, i):
    evaluate(rig)
    return (rig.matrix_world.to_3x3() @ pb.matrix.col[i].xyz).normalized()


def rotate_world(rig, bone, q):
    """Rotate a pose bone by world-space quaternion q about its own head."""
    pb = rig.pose.bones[bone]
    evaluate(rig)
    R = rig.matrix_world.to_3x3().normalized()
    qa = (R.inverted() @ q.to_matrix() @ R).to_4x4()
    M = pb.matrix.copy()
    t = M.translation.copy()
    pb.matrix = Matrix.Translation(t) @ qa @ Matrix.Translation(-t) @ M
    evaluate(rig)


def aim(rig, bone, direction):
    """Swing a bone so its Y axis points along a world direction."""
    y = _world_axis(rig, rig.pose.bones[bone], 1)
    rotate_world(rig, bone, y.rotation_difference(Vector(direction).normalized()))


def hinge(rig, bone, deg, toward):
    """Rotate about the bone's OWN local X (the hinge) so its tail moves toward a
    world direction. Uses the rig's real roll: a wrong roll shows up as a bad pose."""
    pb = rig.pose.bones[bone]
    x, y = _world_axis(rig, pb, 0), _world_axis(rig, pb, 1)
    sign = 1.0 if x.cross(y).dot(Vector(toward)) > 0 else -1.0
    rotate_world(rig, bone, Quaternion(x, math.radians(deg) * sign))


def twist(rig, bone, deg):
    rotate_world(rig, bone, Quaternion(_world_axis(rig, rig.pose.bones[bone], 1), math.radians(deg)))


def apply_pose(rig, spec, H=None):
    """Apply one pose spec: {'name', 'ops': [...]}. Ops:
    ('prop', bone, key, value)   custom property (Rigify 'IK_FK': 1 = FK)
    ('fk',) / ('ik', 'legs')     Rigify limbs to FK / IK ('all', 'arms', 'legs')
    ('aim', bone, dir)           ('hinge', bone, deg, toward)   ('twist', bone, deg)
    ('rot', bone, world_axis, deg)  ('move', bone, (dx, dy, dz) in units of height)
    ('scale', bone, s)
    Missing bones are skipped and listed in the returned list."""
    reset_pose(rig)
    H = H or max(rig.dimensions.z, 1e-3)
    skipped = []
    for op in spec["ops"]:
        kind = op[0]
        if kind in ("fk", "ik"):
            limbs = op[1] if len(op) > 1 else "all"
            names = {"arms": ("upper_arm_parent.L", "upper_arm_parent.R"),
                     "legs": ("thigh_parent.L", "thigh_parent.R")}
            targets = names.get(limbs, names["arms"] + names["legs"])
            for b in targets:
                _setprop(rig, b, "IK_FK", 1.0 if kind == "fk" else 0.0)
            evaluate(rig)
            continue
        bone = op[1]
        if bone not in rig.pose.bones:
            skipped.append(bone)
            continue
        if kind == "prop":
            _setprop(rig, bone, op[2], op[3])
            evaluate(rig)
        elif kind == "aim":
            aim(rig, bone, op[2])
        elif kind == "hinge":
            hinge(rig, bone, op[2], op[3])
        elif kind == "twist":
            twist(rig, bone, op[2])
        elif kind == "rot":
            rotate_world(rig, bone, Quaternion(Vector(op[2]).normalized(), math.radians(op[3])))
        elif kind == "move":
            pb = rig.pose.bones[bone]
            evaluate(rig)
            d = rig.matrix_world.to_3x3().inverted() @ (Vector(op[2]) * H)
            M = pb.matrix.copy()
            pb.matrix = Matrix.Translation(d) @ M
            evaluate(rig)
        elif kind == "scale":
            rig.pose.bones[bone].scale = (op[2],) * 3
            evaluate(rig)
    return skipped


# Joints are (proximal point, joint point, distal point) as 'bone:head' / 'bone:tail'.
JOINTS = {
    "shoulder.L": ("ORG-shoulder.L:head", "ORG-upper_arm.L:head", "ORG-upper_arm.L:tail"),
    "elbow.L": ("ORG-upper_arm.L:head", "ORG-forearm.L:head", "ORG-forearm.L:tail"),
    "wrist.L": ("ORG-forearm.L:head", "ORG-hand.L:head", "ORG-hand.L:tail"),
    "hip.L": ("ORG-spine:head", "ORG-thigh.L:head", "ORG-thigh.L:tail"),
    "knee.L": ("ORG-thigh.L:head", "ORG-shin.L:head", "ORG-shin.L:tail"),
    "waist": ("ORG-spine:head", "ORG-spine.002:head", "ORG-spine.003:tail"),
    "neck": ("ORG-spine.003:head", "ORG-spine.004:head", "ORG-spine.006:head"),
}

# Range-of-motion library for Rigify human rigs, written with WORLD directions so the
# same poses work on T- and A-pose characters. Extremes follow the experts' tests:
# arm down / up with shoulder / forward (armpit, chest), elbow and knee deep bends,
# forearm twist (candy wrapper), leg forward / side (groin), squat (IK feet planted),
# spine twist and bend (waist), head turn and nod (collar). CGDive: test within the
# anatomical range (shoulder raise about 20 to 30 deg), not beyond.
RIGIFY_POSES = [
    {"name": "rest", "ops": []},
    {"name": "arm_down.L", "side": "L", "joints": ["shoulder.L"],
     "ops": [("fk",), ("aim", "upper_arm_fk.L", (0.25, 0.05, -1.0))]},
    {"name": "arm_up.L", "side": "L", "joints": ["shoulder.L"],
     "ops": [("fk",), ("hinge", "shoulder.L", 20, (0, 0, 1)), ("aim", "upper_arm_fk.L", (0.45, 0.0, 0.9))]},
    {"name": "arm_forward.L", "side": "L", "joints": ["shoulder.L"],
     "ops": [("fk",), ("aim", "upper_arm_fk.L", (0.15, -1.0, 0.0))]},
    {"name": "elbow_120.L", "side": "L", "joints": ["elbow.L"],
     "ops": [("fk",), ("hinge", "forearm_fk.L", 120, (0, -1, 0))]},
    {"name": "wrist_twist_80.L", "side": "L", "joints": ["wrist.L"],
     "ops": [("fk",), ("twist", "hand_fk.L", 80)]},
    {"name": "leg_forward.L", "side": "L", "joints": ["hip.L"],
     "ops": [("fk",), ("aim", "thigh_fk.L", (0.05, -0.8, -0.6))]},
    {"name": "leg_side.L", "side": "L", "joints": ["hip.L"],
     "ops": [("fk",), ("aim", "thigh_fk.L", (0.6, 0.0, -0.8))]},
    {"name": "knee_120.L", "side": "L", "joints": ["knee.L"],
     "ops": [("fk",), ("hinge", "shin_fk.L", 120, (0, 1, 0))]},
    {"name": "squat", "joints": ["knee.L", "hip.L"],
     "ops": [("fk", "arms"), ("ik", "legs"), ("move", "torso", (0.0, 0.06, -0.16))]},
    {"name": "spine_twist", "joints": ["waist"], "ops": [("rot", "chest", (0, 0, 1), 35)]},
    {"name": "spine_bend", "joints": ["waist"], "ops": [("rot", "chest", (1, 0, 0), 35)]},
    {"name": "head_turn", "joints": ["neck"], "ops": [("rot", "head", (0, 0, 1), 60)]},
    {"name": "head_nod", "joints": ["neck"], "ops": [("rot", "head", (1, 0, 0), 30)]},
]


def pose_by_name(name, library=None):
    return next(p for p in (library or RIGIFY_POSES) if p["name"] == name)


def _point(rig, spec):
    bone, end = spec.split(":")
    pb = rig.pose.bones.get(bone)
    base = bone.replace("ORG-", "")
    for cand in ("DEF-" + base, "MCH-" + base, base):
        if pb is None:
            pb = rig.pose.bones.get(cand)
    if pb is None:
        return None
    return np.array(rig.matrix_world @ (pb.head if end == "head" else pb.tail))


def _seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(float(ab @ ab), 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1), t


def _joint_frame(rig, joint):
    pts = [_point(rig, s) for s in JOINTS[joint]]
    return None if any(p is None for p in pts) else pts


def joint_region(rig, V, joint, reach=0.5):
    """Vertex indices of the flesh around a joint: within `reach` of each segment
    length along the limb and within 1.8 local limb radii of the limb axis (so the
    other leg or the torso is not counted)."""
    fr = _joint_frame(rig, joint)
    if fr is None:
        return None, None
    a, j, b = fr
    d1, t1 = _seg_dist(V, a, j)
    d2, t2 = _seg_dist(V, j, b)
    first = d1 <= d2
    d = np.where(first, d1, d2)
    s = np.where(first, t1 - 1.0, t2)
    band = np.abs(s) <= reach
    close = band & (np.abs(s) < 0.15)          # the limb cross-section at the joint
    if close.sum() < 6:
        return None, None
    r0 = float(np.median(d[close]))
    sel = band & (d < 1.8 * r0)
    return np.nonzero(sel)[0], fr


def _dist_to_chain(P, fr):
    a, j, b = fr
    return np.minimum(_seg_dist(P, a, j)[0], _seg_dist(P, j, b)[0])


def deformation_report(rig, meshes, poses=None, self_intersections=True):
    """Per pose, on the evaluated meshes (Subdivision disabled while measuring):
    strain: edge length ratio pose/rest (p1, p99, count outside 0.5..1.6)
    joints: volume = mean squared distance to the limb axis, posed/rest (area-like
            proxy: < 0.85 = collapse / candy wrapper, > 1.2 = bulge); min_ring = worst
            band along the limb
    leak:   max displacement on the opposite half for one-sided poses (weights from
            the wrong side), in units of height
    new_self_intersections: posed minus rest face-pair intersections (bx_audit)."""
    poses = poses or RIGIFY_POSES
    subs = []
    for o in meshes:
        for m in o.modifiers:
            if m.type in ("SUBSURF", "MULTIRES") and m.show_viewport:
                m.show_viewport = False
                subs.append(m)
    reset_pose(rig)
    rest = {o.name: world_coords(o) for o in meshes}
    H = float(max(np.ptp(v[:, 2]) for v in rest.values()))
    E = {}
    for o in meshes:
        ed = np.empty(len(o.data.edges) * 2, dtype=np.int64)
        o.data.edges.foreach_get("vertices", ed)
        ed = ed.reshape(-1, 2)
        L0 = np.linalg.norm(rest[o.name][ed[:, 0]] - rest[o.name][ed[:, 1]], axis=1)
        keep = L0 > 1e-7
        E[o.name] = (ed[keep], L0[keep])
    regions = {}
    body = meshes[0]
    for j in JOINTS:
        idx, fr = joint_region(rig, rest[body.name], j)
        if idx is not None and len(idx):
            regions[j] = (idx, fr)
    si_rest = {}
    audit = None
    if self_intersections:
        sys.path.append(os.path.join(SKILLS, "scenario-blender-expert", "scripts"))
        import bx_audit as audit
        for o in meshes:
            bm = audit._bm_from(o, evaluated=True)
            si_rest[o.name] = audit._self_intersections(bm)
            bm.free()
    out = {}
    try:
        for p in poses:
            skipped = apply_pose(rig, p, H)
            r = {"skipped": skipped}
            for o in meshes:
                P = world_coords(o)
                ed, L0 = E[o.name]
                ratio = np.linalg.norm(P[ed[:, 0]] - P[ed[:, 1]], axis=1) / L0
                rr = {"edges": int(len(ratio)), "strain_p1": round(float(np.percentile(ratio, 1)), 3),
                      "strain_p99": round(float(np.percentile(ratio, 99)), 3),
                      "strain_bad": int(((ratio < 0.5) | (ratio > 1.6)).sum())}
                if p.get("side") in ("L", "R"):
                    R0 = rest[o.name]
                    other = R0[:, 0] < -0.04 * H if p["side"] == "L" else R0[:, 0] > 0.04 * H
                    if other.any():
                        rr["leak"] = round(float(np.linalg.norm(P[other] - R0[other], axis=1).max() / H), 5)
                if audit is not None and si_rest.get(o.name) is not None:
                    bm = audit._bm_from(o, evaluated=True)
                    n = audit._self_intersections(bm)
                    bm.free()
                    rr["new_self_intersections"] = int(n - si_rest[o.name])
                r[o.name] = rr
            if body is not None:
                P = world_coords(body)
                jr = {}
                for j in p.get("joints", []):
                    if j not in regions:
                        continue
                    idx, fr0 = regions[j]
                    fr1 = _joint_frame(rig, j)
                    d0 = _dist_to_chain(rest[body.name][idx], fr0)
                    d1 = _dist_to_chain(P[idx], fr1)
                    vol = float((d1 ** 2).mean() / max((d0 ** 2).mean(), 1e-12))
                    # bands along the chain: nearest-point parameter from proximal to distal
                    a, jj, b = fr0
                    s = np.where(_seg_dist(rest[body.name][idx], a, jj)[0] <= _seg_dist(rest[body.name][idx], jj, b)[0],
                                 _seg_dist(rest[body.name][idx], a, jj)[1] - 1.0,
                                 _seg_dist(rest[body.name][idx], jj, b)[1])
                    bands = []
                    for lo_, hi_ in zip(np.linspace(-1, 1, 9)[:-1], np.linspace(-1, 1, 9)[1:]):
                        m = (s >= lo_) & (s < hi_)
                        if m.sum() >= 6:
                            bands.append(float((d1[m] ** 2).mean() / max((d0[m] ** 2).mean(), 1e-12)))
                    jr[j] = {"volume": round(vol, 3), "min_ring": round(min(bands), 3) if bands else None,
                             "max_ring": round(max(bands), 3) if bands else None}
                r["joints"] = jr
            out[p["name"]] = r
    finally:
        reset_pose(rig)
        for m in subs:
            m.show_viewport = True
    return out


def flag_report(dr, collapse=0.85, bulge=1.25, leak=1e-3):
    """Turn deformation_report() output into a list of human-readable problems."""
    probs = []
    for pose, r in dr.items():
        for k, v in r.items():
            if isinstance(v, dict) and "strain_bad" in v:
                if v["strain_bad"] > max(10, 0.002 * v.get("edges", 0)):
                    probs.append(f"{pose}/{k}: {v['strain_bad']} edges stretched outside 0.5-1.6")
                if v.get("leak", 0) > leak:
                    probs.append(f"{pose}/{k}: opposite side moved {v['leak']:.4f} H (weights leak across)")
                if v.get("new_self_intersections", 0) > 0:
                    probs.append(f"{pose}/{k}: +{v['new_self_intersections']} self-intersecting face pairs")
        for j, v in r.get("joints", {}).items():
            if v["min_ring"] is not None and v["min_ring"] < collapse:
                probs.append(f"{pose}/{j}: volume collapses to {v['min_ring']:.2f} (candy wrapper / pinch)")
            if v["max_ring"] is not None and v["max_ring"] > bulge:
                probs.append(f"{pose}/{j}: bulge {v['max_ring']:.2f}")
        if r.get("skipped"):
            probs.append(f"{pose}: missing controls {r['skipped']}")
    return probs


def pose_sheet(rig, objs, poses, out_dir, views=("front", "right", "threequarter"), res=360,
               mode="matcap", name="poses"):
    """One contact sheet: rows = poses, columns = views, rendered through bx_review
    (Workbench, headless). Open it with the image reader: numbers pass while a render
    can still show a broken limb (lesson from the Rigify probe)."""
    sys.path.append(os.path.join(SKILLS, "scenario-blender-expert", "scripts"))
    import bx_review
    rows, labels = [], []
    tmp = os.path.join(out_dir, f"_{name}_tmp")
    H = max(rig.dimensions.z, 1e-3)
    try:
        for p in poses:
            apply_pose(rig, p, H)
            d = os.path.join(tmp, p["name"].replace(".", "_"))
            bx_review.review(objs, d, views=views, modes=(mode,), res=res)
            rows.append([os.path.join(d, f"{mode}_{v}.png") for v in views])
            labels.append(p["name"])
    finally:
        reset_pose(rig)
    out = tile_images(rows, os.path.join(out_dir, f"{name}_sheet.png"))
    with open(os.path.join(out_dir, f"{name}_sheet_legend.txt"), "w") as f:
        f.write("rows (top first): " + ", ".join(labels) + "\ncolumns: " + ", ".join(views or ARM_VIEWS)
                + " for arm joints, " + ", ".join(views or LEG_VIEWS) + " otherwise\n")
    return out


def closeup(objs, center, size, out_prefix, views=("front", "right", "threequarter"), res=400,
            mode="matcap"):
    """Orthographic Workbench close-up of a region (a joint) from several views;
    returns the PNG paths. Matcap reads volume loss and creases, like the experts'
    orbit around an armpit or knee."""
    sc = bpy.data.scenes.new("BX_Close")
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.image_settings.media_type = "IMAGE"
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Standard"
    sh = sc.display.shading
    if mode == "matcap":
        sh.light, sh.color_type, sh.studio_light = "MATCAP", "SINGLE", "clay_studio.exr"
        sh.single_color = (0.8, 0.8, 0.8)
    else:
        sh.light, sh.color_type = "STUDIO", "OBJECT"
    sh.show_cavity = False
    world = bpy.data.worlds.new("BX_Close_W")
    world.color = (0.2, 0.2, 0.2)
    sc.world = world
    for o in objs:
        sc.collection.objects.link(o)
    cam = bpy.data.objects.new("BX_CCam", bpy.data.cameras.new("BX_CCam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    dirs = {"front": Vector((0, -1, 0)), "right": Vector((1, 0, 0)), "left": Vector((-1, 0, 0)),
            "back": Vector((0, 1, 0)), "top": Vector((0, 0, 1)), "bottom": Vector((0, 0, -1)),
            "threequarter": Vector((0.7, -1.0, 0.35)).normalized(),
            "below": Vector((0.3, -0.5, -1.0)).normalized()}
    c = Vector(center)
    paths = []
    try:
        for v in views:
            d = dirs[v]
            cam.data.type, cam.data.ortho_scale = "ORTHO", size
            cam.location = c + d * size * 4
            up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((0, 1, 0))
            cam.rotation_euler = _look_rot(-d, up).to_euler()
            cam.data.clip_start, cam.data.clip_end = size * 0.05, size * 12
            pth = f"{out_prefix}_{v}.png"
            sc.render.filepath = pth
            bpy.ops.render.render(write_still=True, scene=sc.name)
            paths.append(pth)
    finally:
        cd = cam.data
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cd)
        bpy.data.scenes.remove(sc)
        bpy.data.worlds.remove(world)
    return paths


ARM_VIEWS = ("front", "top", "threequarter")
LEG_VIEWS = ("front", "right", "threequarter")


def joint_sheet(rig, objs, poses, out_dir, views=None, res=360, size_factor=0.28, name="joints"):
    """Close-up contact sheet: one row per (pose, joint), centred on the posed joint,
    frame = size_factor x character height. The render to judge armpits, elbows,
    knees, groin and collar (numbers alone missed a broken arm in testing)."""
    os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(out_dir, f"_{name}_tmp")
    os.makedirs(tmp, exist_ok=True)
    H = max(rig.dimensions.z, 1e-3)
    rows, labels = [], []
    try:
        for p in poses:
            for j in p.get("joints", []) or []:
                apply_pose(rig, p, H)
                fr = _joint_frame(rig, j)
                if fr is None:
                    continue
                tag = f"{p['name']}_{j}".replace(".", "_")
                vw = views or (ARM_VIEWS if j.split(".")[0] in ("shoulder", "elbow", "wrist") else LEG_VIEWS)
                rows.append(closeup(objs, fr[1], size_factor * H, os.path.join(tmp, tag), vw, res))
                labels.append(f"{p['name']} / {j}")
    finally:
        reset_pose(rig)
    out = tile_images(rows, os.path.join(out_dir, f"{name}_sheet.png"))
    with open(os.path.join(out_dir, f"{name}_sheet_legend.txt"), "w") as f:
        f.write("rows (top first): " + ", ".join(labels) + "\ncolumns: " + ", ".join(views or ARM_VIEWS)
                + " for arm joints, " + ", ".join(views or LEG_VIEWS) + " otherwise\n")
    return out


# ----------------------------------------------------------------------------------
# 5. manual / scripted rigs (CGDive "Rigging isn't Scary" architecture)
# ----------------------------------------------------------------------------------
def new_armature(name="RIG", collection=None):
    """Armature object at the world origin with identity transform (never move it in
    Object Mode while rigging: Symmetrize and mirroring depend on it)."""
    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    (collection or bpy.context.scene.collection).objects.link(rig)
    rig.show_in_front = True
    return rig


def reparent(eb, child, parent):
    """Edit Mode re-parent that keeps the bone in place: clear use_connect FIRST (a
    connected bone's head jumps to its new parent's tail)."""
    c = eb[child]
    c.use_connect = False
    c.parent = eb[parent] if isinstance(parent, str) else parent
    return c


def new_bone(eb, name, head, tail, parent=None, connect=False, deform=False, roll_z=None, roll=None):
    """edit_bones.new with explicit head/tail. deform defaults to False (Wayne Dixon:
    deform is on by default and must be off on every non-deforming bone). roll_z: a
    world vector the bone's local Z should face (align_roll)."""
    b = eb.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    b.use_deform = deform
    if parent is not None:
        b.parent = eb[parent] if isinstance(parent, str) else parent
        b.use_connect = connect
    if roll_z is not None:
        b.align_roll(Vector(roll_z))
    elif roll is not None:
        b.roll = roll
    return b


def copy_bone(eb, src, name, parent="same", deform=False, length=None):
    s = eb[src]
    tail = s.tail if length is None else s.head + (s.tail - s.head).normalized() * length
    b = new_bone(eb, name, s.head, tail, deform=deform, roll=s.roll)
    if parent == "same":
        b.parent = s.parent
    elif parent is not None:
        b.parent = eb[parent]
    return b


def con(rig, bone, typ, **kw):
    """Constraint factory: con(rig, 'shin.L', 'IK', subtarget='leg_IK.L', chain_count=2).
    target defaults to the rig itself; pole_subtarget sets pole_target to the rig too."""
    c = rig.pose.bones[bone].constraints.new(typ)
    if hasattr(c, "target") and "target" not in kw:
        c.target = rig
    if "pole_subtarget" in kw:
        c.pole_target = rig
    for k, v in kw.items():
        setattr(c, k, v)
    return c


def twist_chain(rig, main, driver, n=4, proximal=False, parent=None, influences=None):
    """Replace a limb segment's deformation by n twist bones (CGDive: 1 and 2 are not
    enough, 3 is nice, 4 really nice, more than 5 invisible).

    distal (forearm, shin): twists parented to `main`; Copy Rotation from `driver`
      (hand/foot) Local/Local, then Damped Track to it (strips swing, keeps twist,
      fixes the flip); influence 1.0, 0.66, 0.33, 0.1 from the driver end.
    proximal (upper arm, thigh): twists parented to `parent` (clavicle/pelvis) so the
      shoulder end never twists; Copy Location (first from main, then chained to the
      previous twist's tail), Damped Track to main's tail, Copy Rotation from main with
      influence 1.0 at the elbow/knee end down to 0.1 (thigh 0.05) at the root.
    `main` stops deforming (it becomes the MCH main chain). Returns the twist names
    ordered from the segment head to its tail."""
    activate(rig, "EDIT")
    eb = rig.data.edit_bones
    s = eb[main]
    base, side = (main.rsplit(".", 1) + [""])[:2]
    base = base.replace("MCH-", "")
    sfx = f".{side}" if side else ""
    names = []
    for i in range(n):
        b = eb.new(f"{base}_twist_{i + 1}{sfx}")
        b.head, b.tail = s.head.lerp(s.tail, i / n), s.head.lerp(s.tail, (i + 1) / n)
        b.roll = s.roll
        b.parent = eb[parent] if (proximal and parent) else s
        b.use_connect = False
        b.use_deform = True
        names.append(b.name)
    s.use_deform = False
    bpy.ops.object.mode_set(mode="POSE")
    if influences is None:
        influences = [1.0, 0.66, 0.33, 0.1][:n] if n == 4 else list(np.linspace(1.0, 0.1, n))
    if not proximal:           # driver end = segment tail: last twist copies 100%
        for nm, inf in zip(reversed(names), influences):
            con(rig, nm, "COPY_ROTATION", subtarget=driver, target_space="LOCAL", owner_space="LOCAL",
                influence=inf)
            con(rig, nm, "DAMPED_TRACK", subtarget=driver)
    else:                      # elbow/knee end (tail) copies 100%, root end ~0.1
        for i, nm in enumerate(names):
            if i == 0:
                con(rig, nm, "COPY_LOCATION", subtarget=main)
            else:
                con(rig, nm, "COPY_LOCATION", subtarget=names[i - 1], head_tail=1.0)
            con(rig, nm, "DAMPED_TRACK", subtarget=main, head_tail=1.0)
        for nm, inf in zip(reversed(names), influences):
            con(rig, nm, "COPY_ROTATION", subtarget=main, target_space="LOCAL", owner_space="LOCAL",
                influence=inf)
    bpy.ops.object.mode_set(mode="OBJECT")
    return names


def twist_angles(rig, names, ref):
    """Signed twist (deg) of each bone about its own Y relative to bone `ref`."""
    ev = evaluate(rig)
    r = ev.pose.bones[ref].matrix
    out = []
    for n in names:
        m = ev.pose.bones[n].matrix
        y = m.col[1].xyz.normalized()
        a = r.col[0].xyz - y * r.col[0].xyz.dot(y)
        b = m.col[0].xyz - y * m.col[0].xyz.dot(y)
        ang = math.degrees(a.angle(b)) if a.length > 1e-9 and b.length > 1e-9 else 0.0
        out.append(round(ang if a.cross(b).dot(y) >= 0 else -ang, 2))
    return out


def solve_pole_angle(rig, ik, chain):
    """IK pole angle = the value where toggling the IK constraint leaves the rest pose
    unchanged (CGDive's toggle test, done numerically; verified to 1e-5).
    ik: the IK constraint; chain: bone names it drives. Returns (deg, error)."""
    def mats():
        ev = evaluate(rig)
        return [ev.pose.bones[n].matrix.copy() for n in chain]

    def err(ref):
        return sum((x.col[1].xyz - y.col[1].xyz).length + (x.col[2].xyz - y.col[2].xyz).length
                   for x, y in zip(ref, mats()))
    inf = ik.influence
    ik.influence = 0.0
    ref = mats()
    ik.influence = 1.0

    def e(d):
        ik.pole_angle = math.radians(d)
        return err(ref)
    best = min(range(-180, 181, 2), key=e)
    best = min([best + k * 0.25 for k in range(-8, 9)], key=e)
    best = min([best + k * 0.02 for k in range(-12, 13)], key=e)
    ik.pole_angle = math.radians(best)
    ik.influence = inf
    return round(best, 2), e(best)


def ik_chain(rig, tip, target, pole=None, chain=2, lock_hinge=True, solve=True):
    """IK on `tip` (shin/forearm) with chain length 2 (0 = whole hierarchy), pole angle
    solved, IK Y/Z locked on the hinge bone (IK ignores Limit Rotation and locks)."""
    kw = {"subtarget": target, "chain_count": chain}
    if pole:
        kw["pole_subtarget"] = pole
    c = con(rig, tip, "IK", **kw)
    if lock_hinge:
        pb = rig.pose.bones[tip]
        pb.lock_ik_y = pb.lock_ik_z = True
    res = None
    if pole and solve:
        names = [tip]
        b = rig.pose.bones[tip].parent
        while b is not None and len(names) < chain:
            names.insert(0, b.name)
            b = b.parent
        res = solve_pole_angle(rig, c, names)
    return c, res


def foot_roll(rig, side, ik_ctrl, ik_target, heel, toe, inner, outer, ball, roll_len=None):
    """CGDive's six-pivot foot driven by ONE roll control (pivots used one at a time).

    Hierarchy: ik_ctrl > outside > inside > heel > toe > ball (animatable) > ik_target.
    Each pivot points up (roll 0, local X = world X) and copies the roll control's
    local rotation on one axis, opened in one direction by Limit Rotation (owner
    Local): heel X [-90, 0], toe X [0, 90], inside/outside Z one-sided (mirrored per
    side). foot_roll is parented to the ankle control, never under a pivot it drives
    (dependency cycle). Points are world positions on the floor. Returns bone names."""
    s = "." + side
    L = roll_len or (Vector(toe) - Vector(heel)).length * 0.25
    activate(rig, "EDIT")
    eb = rig.data.edit_bones

    def up(n, p, par):
        p = Vector(p)
        return new_bone(eb, n, p, p + Vector((0, 0, L)), parent=par, roll=0.0).name
    o = up("MCH-pivot_outside" + s, outer, ik_ctrl)
    i = up("MCH-pivot_inside" + s, inner, o)
    h = up("MCH-pivot_heel" + s, heel, i)
    t = up("MCH-pivot_toe" + s, toe, h)
    b = up("foot_ball" + s, ball, t)
    eb[ik_target].use_connect = False      # before re-parenting, or the head jumps
    eb[ik_target].parent = eb[b]
    hp = Vector(heel) + Vector((0, L * 1.2, 0))
    r = new_bone(eb, "foot_roll" + s, hp, hp + Vector((0, 0, L * 1.5)), parent=ik_ctrl, roll=0.0).name
    bpy.ops.object.mode_set(mode="POSE")
    rad = math.radians
    zin = (-90, 0) if side == "R" else (0, 90)
    zout = (0, 90) if side == "R" else (-90, 0)
    lims = {h: ((-90, 0), (0, 0)), t: ((0, 90), (0, 0)), i: ((0, 0), zin), o: ((0, 0), zout)}
    for n, (lx, lz) in lims.items():
        con(rig, n, "COPY_ROTATION", subtarget=r, target_space="LOCAL", owner_space="LOCAL", use_y=False)
        con(rig, n, "LIMIT_ROTATION", owner_space="LOCAL", use_limit_x=True, use_limit_y=True,
            use_limit_z=True, min_x=rad(lx[0]), max_x=rad(lx[1]), min_z=rad(lz[0]), max_z=rad(lz[1]))
    pr = rig.pose.bones[r]
    pr.rotation_mode = "XYZ"
    pr.lock_rotation[1] = True
    pr.lock_location = (True, True, True)
    bpy.ops.object.mode_set(mode="OBJECT")
    return {"outside": o, "inside": i, "heel": h, "toe": t, "ball": b, "roll": r}


def settings_prop(rig, bone, key, default=0.0, lo=0.0, hi=1.0, overridable=True):
    """Custom property on a POSE bone of a settings bone (CGDive: visible in the N panel
    in Pose Mode; object/data/edit-bone props show in the wrong mode or not at all).
    The UI default is set too, otherwise 'Reset to Default' flips the switch."""
    pb = rig.pose.bones[bone]
    pb[key] = float(default)
    pb.id_properties_ui(key).update(min=lo, max=hi, soft_min=lo, soft_max=hi, default=float(default), step=1)
    if overridable:
        pb.property_overridable_library_set(f'["{key}"]', True)
    return f'pose.bones["{bone}"]["{key}"]'


def drive(owner, path, rig, expr="var", prop=None, bone=None, ttype=None, space="LOCAL_SPACE",
          index=-1, rot_mode="AUTO", bone2=None):
    """Driver with one variable 'var':
    prop='pose.bones["rig_settings"]["leg_fk_ik.L"]'   SINGLE_PROP
    bone='MCH-forearm.L', ttype='ROT_X'                 TRANSFORMS (space LOCAL_SPACE)
    bone=a, bone2=b                                     ROTATION_DIFF (angle between bones)
    5.x: the F-curve starts with keys (0,0),(1,1) = identity; remap by moving them."""
    fc = owner.driver_add(path) if index < 0 else owner.driver_add(path, index)
    d = fc.driver
    d.type = "SCRIPTED"
    for v in list(d.variables):
        d.variables.remove(v)
    v = d.variables.new()
    v.name = "var"
    if prop is not None:
        v.type = "SINGLE_PROP"
        v.targets[0].id_type = "OBJECT"
        v.targets[0].id = rig
        v.targets[0].data_path = prop
    elif bone2 is not None:
        v.type = "ROTATION_DIFF"
        for t, bn in zip(v.targets, (bone, bone2)):
            t.id = rig
            t.bone_target = bn
    else:
        v.type = "TRANSFORMS"
        t = v.targets[0]
        t.id = rig
        t.bone_target = bone
        t.transform_type = ttype
        t.transform_space = space
        t.rotation_mode = rot_mode
    d.expression = expr
    return fc


def remap_driver(fc, x0, x1, y0=0.0, y1=1.0, ease=True):
    """CGDive's driver-curve shaping: output y0 until x0, y1 at x1 (flat start, so a
    corrective kicks in late instead of linearly), constant beyond."""
    k0, k1 = fc.keyframe_points[0], fc.keyframe_points[1]
    k0.co, k1.co = (x0, y0), (x1, y1)
    for k in (k0, k1):
        k.interpolation = "BEZIER" if ease else "LINEAR"
        k.handle_left_type = k.handle_right_type = "AUTO_CLAMPED"
    fc.extrapolation = "CONSTANT"
    fc.update()
    return fc


def fk_ik_switch(rig, chain, prop_path, fk_suffix="_FK", ik_suffix="_IK"):
    """Layered limb (CGDive L3): the main MCH chain follows an FK copy or an IK copy
    through two Copy Transforms named 'FK' and 'IK'; the IK one's influence is driven
    by a 0/1 property (1 = IK). Twists and correctives hang off the main chain and
    work in both modes. Returns (fk_names, ik_names)."""
    activate(rig, "EDIT")
    eb = rig.data.edit_bones
    out = {}
    for sfx in (fk_suffix, ik_suffix):
        names = []
        for k, n in enumerate(chain):
            base, side = n.rsplit(".", 1) if "." in n else (n, "")
            base = base.replace("MCH-", "")
            nn = f"{base}{sfx}.{side}" if side else f"{base}{sfx}"
            b = copy_bone(eb, n, nn, parent=None)
            b.parent = eb[names[-1]] if names else eb[n].parent
            b.use_connect = bool(names) and eb[n].use_connect
            names.append(nn)
        out[sfx] = names
    bpy.ops.object.mode_set(mode="POSE")
    for k, n in enumerate(chain):
        c1 = con(rig, n, "COPY_TRANSFORMS", subtarget=out[fk_suffix][k])
        c1.name = "FK"
        c2 = con(rig, n, "COPY_TRANSFORMS", subtarget=out[ik_suffix][k])
        c2.name = "IK"
        drive(c2, "influence", rig, prop=prop_path)
    bpy.ops.object.mode_set(mode="OBJECT")
    return out[fk_suffix], out[ik_suffix]


def _flip(s):
    import re
    s = re.sub(r"\.L(?=$|[.\"'\]])", ".__R__", s)
    s = re.sub(r"\.R(?=$|[.\"'\]])", ".L", s)
    s = s.replace(".__R__", ".R")
    return s.replace("left_", "__right__").replace("right_", "left_").replace("__right__", "right_")


def mirror_drivers(id_block, negate=()):
    """Symmetrize never copies drivers (CGDive, verified 5.2.1). Recreate every
    left-side driver on the right: data paths, bone targets and property paths are
    flipped (.L <-> .R, left_ <-> right_); expressions of the listed data paths get
    negated (mirrored X axes, e.g. mouth-corner width, knee correctives). Works on the
    rig or on a Key (shape-key drivers). Returns the created data paths."""
    ad = id_block.animation_data
    made = []
    if ad is None:
        return made
    existing = {(f.data_path, f.array_index) for f in ad.drivers}
    for fc in list(ad.drivers):
        dp = fc.data_path
        if ".L" not in dp and "left_" not in dp:
            continue
        ndp = _flip(dp)
        if ndp == dp or (ndp, fc.array_index) in existing:
            continue
        try:
            id_block.path_resolve(ndp)
        except ValueError:
            continue                    # the mirrored property does not exist (create it first)
        nf = id_block.driver_add(ndp, fc.array_index) if fc.array_index or _is_array(id_block, ndp) \
            else id_block.driver_add(ndp)
        d, sd = nf.driver, fc.driver
        d.type = sd.type
        for v in list(d.variables):
            d.variables.remove(v)
        for sv in sd.variables:
            v = d.variables.new()
            v.name, v.type = sv.name, sv.type
            for st, t in zip(sv.targets, v.targets):
                if sv.type == "SINGLE_PROP":
                    t.id_type = st.id_type
                t.id = st.id
                t.data_path = _flip(st.data_path)
                t.bone_target = _flip(st.bone_target)
                t.transform_type = st.transform_type
                t.transform_space = st.transform_space
                t.rotation_mode = st.rotation_mode
        expr = sd.expression
        d.expression = f"-({expr})" if (dp in negate or ndp in negate) else expr
        for k_src, k_dst in zip(fc.keyframe_points, nf.keyframe_points):
            k_dst.co = k_src.co
            k_dst.interpolation = k_src.interpolation
            k_dst.handle_left_type, k_dst.handle_right_type = k_src.handle_left_type, k_src.handle_right_type
        nf.extrapolation = fc.extrapolation
        made.append(ndp)
    return made


def _is_array(id_block, path):
    try:
        v = id_block.path_resolve(path)
        return hasattr(v, "__len__") and not isinstance(v, str)
    except Exception:
        return False


def make_def_layer(rig, names, prefix="DEF-", parents=None):
    """CGDive L3-5: duplicate the final deformers as DEF- bones, one Copy Transforms
    each to its original (now a 'connective' bone: never move it afterwards), only DEF
    bones deform. DEF hierarchy mirrors the originals' unless `parents` = {name:
    parent_name} gives an engine-friendly one. Existing vertex groups are renamed so
    painted weights survive. Returns the DEF names."""
    activate(rig, "EDIT")
    eb = rig.data.edit_bones
    for n in names:
        copy_bone(eb, n, prefix + n, parent=None, deform=True)
    for n in names:
        if parents and n in parents:
            p = parents[n]
            eb[prefix + n].parent = eb[prefix + p] if p and (prefix + p) in eb else (eb[p] if p in eb else None)
        else:
            p = eb[n].parent
            while p is not None and (prefix + p.name) not in eb:
                p = p.parent
            eb[prefix + n].parent = eb[prefix + p.name] if p is not None else None
        eb[n].use_deform = False
    bpy.ops.object.mode_set(mode="POSE")
    for n in names:
        con(rig, prefix + n, "COPY_TRANSFORMS", subtarget=n)
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.data.objects:
        if o.type == "MESH" and any(m.type == "ARMATURE" and m.object == rig for m in o.modifiers):
            for n in names:
                if n in o.vertex_groups and (prefix + n) not in o.vertex_groups:
                    o.vertex_groups[n].name = prefix + n
    return [prefix + n for n in names]


def widget(kind, name=None, collection="WGTS"):
    """Edge-only widget mesh in a hidden collection. Local Y = bone length axis
    (CGDive): rings are built in the XZ plane so they encircle the bone.
    kinds: circle, sphere (3 loops), cube, square (flat, XY), diamond, root (circle
    with 4 arrows, XY plane), gear."""
    name = name or f"WGT-{kind}"
    if name in bpy.data.objects:
        return bpy.data.objects[name]
    V, E = [], []

    def ring(n, r, plane="XZ", z=0.0, scale=None):
        base = len(V)
        for k in range(n):
            a = 2 * math.pi * k / n
            c, s = math.cos(a) * r, math.sin(a) * r
            if scale:
                c, s = c * scale[k % len(scale)], s * scale[k % len(scale)]
            V.append((c, z, s) if plane == "XZ" else (c, s, z) if plane == "XY" else (z, c, s))
            E.append((base + k, base + (k + 1) % n))
    if kind == "circle":
        ring(24, 0.5)
    elif kind == "sphere":
        ring(16, 0.5, "XZ")
        ring(16, 0.5, "XY")
        ring(16, 0.5, "YZ")
    elif kind == "cube":
        for x in (-0.5, 0.5):
            for y in (0, 1):
                for z in (-0.5, 0.5):
                    V.append((x, y, z))
        E += [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
    elif kind == "square":
        V += [(-0.5, 0, 0), (0.5, 0, 0), (0.5, 1, 0), (-0.5, 1, 0)]
        E += [(0, 1), (1, 2), (2, 3), (3, 0)]
    elif kind == "diamond":
        V += [(0, 0, 0), (0.3, 0.5, 0), (0, 1, 0), (-0.3, 0.5, 0), (0, 0.5, 0.3), (0, 0.5, -0.3)]
        E += [(0, 1), (1, 2), (2, 3), (3, 0), (0, 4), (4, 2), (2, 5), (5, 0)]
    elif kind == "root":
        ring(24, 0.5, "XY")
        for k in (0, 6, 12, 18):
            a = 2 * math.pi * k / 24
            V.append((math.cos(a) * 0.75, math.sin(a) * 0.75, 0))
            E += [(k, len(V) - 1)]
    elif kind == "gear":
        ring(24, 0.5, "XZ", scale=[1, 1, 1.25, 1.25])
    else:
        raise ValueError(kind)
    me = bpy.data.meshes.new(name)
    me.from_pydata(V, E, [])
    ob = bpy.data.objects.new(name, me)
    col = bpy.data.collections.get(collection)
    if col is None:
        col = bpy.data.collections.new(collection)
        bpy.context.scene.collection.children.link(col)
    col.objects.link(ob)
    col.hide_viewport = col.hide_render = True
    return ob


def set_shape(rig, bone, wgt, scale=1.0, wire=2.0, transform_bone=None, translation=None, rotation=None):
    """Custom shape with CGDive's wire width 2; transform_bone = Override Transform
    (draw the shape at another bone: chest at chest1, jaw at MCH-jaw, or a helper that
    follows the skin, which breaks widget-follows-mesh cycles; Wayne Dixon, Rik Schutte)."""
    pb = rig.pose.bones[bone]
    pb.custom_shape = wgt
    pb.custom_shape_scale_xyz = (scale,) * 3 if isinstance(scale, (int, float)) else scale
    pb.custom_shape_wire_width = wire
    if transform_bone:
        pb.custom_shape_transform = rig.pose.bones[transform_bone]
    if translation is not None:
        pb.custom_shape_translation = translation
    if rotation is not None:
        pb.custom_shape_rotation_euler = rotation
    return pb


SIDE_COLORS = {"L": "THEME04", "R": "THEME01", "": "THEME09"}   # blue / red / yellow


def organize(rig, ctrl_extra=None, colors=None, root="root", settings=None):
    """Collections CTRL / MCH / DEF by name prefix (DEF-, MCH-, everything else is a
    control; Wayne Dixon: no CTRL prefix), MCH and DEF hidden, side colors on controls
    (default left blue, right red, centre yellow as in CGDive L3; ask the animator,
    CGDive L2 used the reverse), root purple, settings green, wire width kept."""
    arm = rig.data
    colors = colors or SIDE_COLORS
    cols = {}
    for n in ("CTRL", "MCH", "DEF"):
        cols[n] = arm.collections.get(n) or arm.collections.new(n)
    for b in arm.bones:
        k = "DEF" if b.name.startswith("DEF-") else "MCH" if b.name.startswith("MCH-") else "CTRL"
        cols[k].assign(b)
        if k == "CTRL":
            pal = "THEME06" if b.name == root else "THEME03" if b.name == settings else colors[side_of(b.name)]
            b.color.palette = pal
    cols["MCH"].is_visible = cols["DEF"].is_visible = False
    arm.show_bone_colors = True
    return {k: len(c.bones) for k, c in cols.items()}


def root_test(rig, translate=(0.3, 0.2, 0.1), rot_deg=40, scale=1.5, root="root"):
    """Move, rotate and scale the root: every bone must follow rigidly (CGDive). Returns
    (max matrix error, worst bone). Catches bones left outside the root hierarchy."""
    def mats():
        ev = evaluate(rig)
        return {b.name: (rig.matrix_world @ b.matrix).copy() for b in ev.pose.bones}
    before = mats()
    pb = rig.pose.bones[root]
    saved = pb.matrix_basis.copy()
    pb.matrix_basis = Matrix.Translation(translate) @ Matrix.Rotation(math.radians(rot_deg), 4, "Y") \
        @ Matrix.Scale(scale, 4)
    after = mats()
    d = after[root] @ before[root].inverted()
    errs = {n: max(abs(x) for row in (after[n] - d @ before[n]) for x in row) for n in before}
    pb.matrix_basis = saved
    evaluate(rig)
    worst = max(errs, key=errs.get)
    return errs[worst], worst


def static_cycles(rig):
    """Structural dependency-cycle risks: a constraint (or IK) whose target is a child of
    its owner, or two bones constraining each other. [] = none found."""
    probs = []
    targets = {}
    for pb in rig.pose.bones:
        for c in pb.constraints:
            st = getattr(c, "subtarget", "")
            if st and getattr(c, "target", None) == rig and st in rig.pose.bones:
                targets.setdefault(pb.name, set()).add(st)
                tb = rig.data.bones[st]
                if any(p.name == pb.name for p in tb.parent_recursive):
                    probs.append(f"{pb.name}: {c.type} target {st} is its descendant")
                if c.type == "IK":
                    chain = [pb.name] + [p.name for p in pb.bone.parent_recursive][:max(c.chain_count - 1, 0)]
                    if any(p.name in chain for p in tb.parent_recursive):
                        probs.append(f"{pb.name}: IK target {st} is parented inside its chain")
    for a, ts in targets.items():
        for b in ts:
            if a in targets.get(b, ()) and a < b:
                probs.append(f"{a} and {b} constrain each other")
    return sorted(set(probs))


def cycle_check(filepath=None):
    """Runtime check: open a saved copy in a background Blender and collect the
    depsgraph's 'Dependency cycle detected' lines (printed, not raised). [] = clean."""
    import tempfile
    path = filepath
    if path is None:
        path = os.path.join(tempfile.mkdtemp(), "bx_cycle_check.blend")
        bpy.ops.wm.save_as_mainfile(filepath=path, copy=True)
    expr = "import bpy; [o.update_tag() for o in bpy.data.objects]; bpy.context.view_layer.update()"
    r = subprocess.run([bpy.app.binary_path, "-b", "--factory-startup", path, "--python-expr", expr],
                       capture_output=True, text=True, timeout=300)
    lines = (r.stdout + r.stderr).splitlines()
    return [ln for ln in lines if "cycle" in ln.lower() and "depend" in ln.lower()]


# ----------------------------------------------------------------------------------
# 6. corrective shape keys without sculpting (inverse skinning)
# ----------------------------------------------------------------------------------
def skin_jacobian(obj, h=None):
    """Per-vertex 3x3 map from a rest-space offset (shape key) to the posed world
    displacement at the CURRENT pose, measured numerically with a temporary shape key
    (3 evaluations). Exact for linear blend skinning, B-bone segments included; a
    close linearization under Preserve Volume. Returns (N,3,3)."""
    me = obj.data
    V0 = world_coords(obj, no_subdiv=True)
    n = len(me.vertices)
    if len(V0) != n:
        raise RuntimeError("skin_jacobian: a modifier changes the vertex count (apply Mirror etc.)")
    h = h or 1e-3 * float(max(np.ptp(V0, axis=0)))
    if me.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    kb = obj.shape_key_add(name="BX_jacobian", from_mix=False)
    base = np.empty(n * 3)
    me.shape_keys.reference_key.data.foreach_get("co", base)
    base = base.reshape(-1, 3)
    J = np.zeros((n, 3, 3))
    try:
        kb.value = 1.0
        for k in range(3):
            off = base.copy()
            off[:, k] += h
            kb.data.foreach_set("co", off.ravel())
            me.update()
            J[:, :, k] = (world_coords(obj, no_subdiv=True) - V0) / h
    finally:
        obj.shape_key_remove(kb)
        me.update()
    return J


def corrective_from_targets(obj, rig, name, targets, indices=None):
    """Write a corrective shape key so that, AT THE CURRENT POSE, the chosen vertices
    land on `targets` (world positions, same order as indices). Offsets are solved in
    rest space through the skinning Jacobian (CGDive sculpts in the posed state with the
    Armature modifier shown in Edit Mode; this is the headless equivalent). Other
    shape keys keep their current values. Returns the key block (value left at 0)."""
    me = obj.data
    idx = np.arange(len(me.vertices)) if indices is None else np.asarray(indices)
    P = world_coords(obj, no_subdiv=True)
    J = skin_jacobian(obj)
    d = np.asarray(targets, dtype=float) - P[idx]
    off = np.linalg.solve(J[idx], d[:, :, None])[:, :, 0]
    if me.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    kb = me.shape_keys.key_blocks.get(name) or obj.shape_key_add(name=name, from_mix=False)
    base = np.empty(len(me.vertices) * 3)
    me.shape_keys.reference_key.data.foreach_get("co", base)
    co = base.reshape(-1, 3).copy()
    co[idx] += off
    kb.data.foreach_set("co", co.ravel())
    kb.value = 0.0
    me.update()
    return kb


def _joint_frame_rest(rig, joint):
    pts = []
    for sp in JOINTS[joint]:
        bone, end = sp.split(":")
        base = bone.replace("ORG-", "")
        b = next((rig.data.bones.get(c) for c in (bone, "DEF-" + base, "MCH-" + base, base)
                  if rig.data.bones.get(c) is not None), None)
        if b is None:
            return None
        pts.append(np.array(rig.matrix_world @ (b.head_local if end == "head" else b.tail_local)))
    return pts


def volume_restore_targets(obj, rig, joint, strength=1.0, reach=0.6, max_gain=1.6, smooth=12):
    """Posed-space targets that push the flesh around a joint back out to its rest
    distance from the limb axis (the volume linear skinning loses at deep bends: the
    knee/elbow collapse CGDive fixes with a sculpted corrective). Uses the CURRENT
    pose; rest = the mesh with its Armature modifiers disabled. Returns (idx, targets)."""
    arms = [m for m in obj.modifiers if m.type == "ARMATURE" and m.show_viewport]
    for m in arms:
        m.show_viewport = False
    try:
        R0 = world_coords(obj, no_subdiv=True)
    finally:
        for m in arms:
            m.show_viewport = True
    fr0 = _joint_frame_rest(rig, joint)
    a, j, b = fr0
    d1, t1 = _seg_dist(R0, a, j)
    d2, t2 = _seg_dist(R0, j, b)
    first = d1 <= d2
    dd = np.where(first, d1, d2)
    sp = np.where(first, t1 - 1.0, t2)
    band = np.abs(sp) <= reach
    close = band & (np.abs(sp) < 0.15)
    r0 = float(np.median(dd[close]))
    idx = np.nonzero(band & (dd < 1.8 * r0))[0]
    P = world_coords(obj, no_subdiv=True)
    a, j, b = _joint_frame(rig, joint)
    Q = P[idx]
    q1, u1 = _seg_dist(Q, a, j)
    q2, u2 = _seg_dist(Q, j, b)
    f1 = q1 <= q2
    foot = np.where(f1[:, None], a + u1[:, None] * (j - a), j + u2[:, None] * (b - j))
    radial = Q - foot
    dcur = np.linalg.norm(radial, axis=1)
    gain = np.clip(dd[idx] / np.maximum(dcur, 1e-9), 1.0, max_gain)   # only push outward
    fall = np.clip(1.0 - np.abs(sp[idx]) / reach, 0.0, 1.0)
    fall = fall * fall * (3 - 2 * fall)                               # smoothstep to 0 at the edge
    D = radial * ((gain - 1) * strength * fall)[:, None]
    D = smooth_field(obj, idx, D, iterations=smooth)
    return idx, Q + D


def smooth_field(obj, idx, D, iterations=12, keep=0.5):
    """Relax a per-vertex displacement field over the mesh edges (vertices outside
    idx count as 0, so the edit fades out): the Smooth-brush-at-0.2 pass CGDive does
    after grabbing a corrective. Without it, pushes cross in the crease and spike."""
    me = obj.data
    ed = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", ed)
    ed = ed.reshape(-1, 2)
    n = len(me.vertices)
    full = np.zeros((n, 3))
    full[idx] = D
    mask = np.zeros(n, dtype=bool)
    mask[idx] = True
    deg = np.bincount(ed.ravel(), minlength=n).astype(float)
    for _ in range(iterations):
        acc = np.zeros((n, 3))
        np.add.at(acc, ed[:, 0], full[ed[:, 1]])
        np.add.at(acc, ed[:, 1], full[ed[:, 0]])
        avg = acc / np.maximum(deg, 1)[:, None]
        full = np.where(mask[:, None], keep * full + (1 - keep) * avg, 0.0)
    return full[idx]


def corrective_driver(obj, key_name, rig, bone_a, bone_b, start_deg, full_deg):
    """Drive a corrective from the angle between two bones that follow BOTH IK and FK
    (CGDive: drive from the MCH main chain; Rigify: ORG- bones). ROTATION_DIFF has no
    roll or sign issues on hinges; the curve stays 0 until start_deg and reaches 1 at
    full_deg with a flat start (kicks in late). Ball joints (shoulder): drive from a
    swing-only bone (first upper-arm twist) instead."""
    kb = obj.data.shape_keys.key_blocks[key_name]
    fc = drive(kb, "value", rig, bone=bone_a, bone2=bone_b)
    remap_driver(fc, math.radians(start_deg), math.radians(full_deg))
    return fc


# ----------------------------------------------------------------------------------
# 7. faces: shape keys split L/R and driven by on-face controls
# ----------------------------------------------------------------------------------
def split_shape_lr(obj, key_name, blend=None, left="shapekey_left", right="shapekey_right"):
    """CGDive: sculpt symmetric, then split. Creates key.L and key.R (copies of the
    symmetric key) masked by two vertex groups that cross-fade over `blend` (default
    2% of the mesh width) and sum to exactly 1 at every vertex, so a symmetric pose of
    both halves reproduces the original with no double-strength centre line."""
    me = obj.data
    V = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", V)
    V = V.reshape(-1, 3)
    blend = blend or 0.02 * float(np.ptp(V[:, 0]))
    wl = np.clip(0.5 + V[:, 0] / (2 * blend), 0.0, 1.0)
    for nm, w in ((left, wl), (right, 1.0 - wl)):
        g = obj.vertex_groups.get(nm) or obj.vertex_groups.new(name=nm)
        g.remove(list(range(len(V))))
        for val in np.unique(np.round(w, 4)):
            ids = np.nonzero(np.round(w, 4) == val)[0].tolist()
            if val > 0:
                g.add(ids, float(val), "REPLACE")
    src = me.shape_keys.key_blocks[key_name]
    co = np.empty(len(V) * 3)
    src.data.foreach_get("co", co)
    base = key_name[:-2] if key_name.endswith((".L", ".R")) else key_name
    out = []
    for sfx, grp in ((".L", left), (".R", right)):
        kb = me.shape_keys.key_blocks.get(base + sfx) or obj.shape_key_add(name=base + sfx, from_mix=False)
        kb.data.foreach_set("co", co)
        kb.vertex_group = grp
        kb.slider_min, kb.slider_max = src.slider_min, src.slider_max
        kb.value = 0.0
        out.append(kb)
    src.mute = True
    me.update()
    return out


def mirror_shape_key(obj, src, dst=None, tol=None, exact=False):
    """Mirror a shape key's offsets across X onto a new key (CS_elbow.L -> CS_elbow.R).
    Exact on a vertex-symmetric mesh (true symmetry, CGDive: Snap to Symmetry first);
    otherwise each vertex takes its nearest mirrored neighbour's offset (exact=False)
    or is skipped (exact=True). Returns the number of vertices without an exact
    partner (0 on a truly symmetric mesh)."""
    me = obj.data
    kbs = me.shape_keys.key_blocks
    dst = dst or _flip(src)
    n = len(me.vertices)
    base = np.empty(n * 3)
    kbs[0].data.foreach_get("co", base)
    base = base.reshape(-1, 3)
    co = np.empty(n * 3)
    kbs[src].data.foreach_get("co", co)
    off = co.reshape(-1, 3) - base
    tol = tol or 1e-4 * float(np.ptp(base[:, 2]))
    kd = KDTree(n)
    for i, c in enumerate(base):
        kd.insert(c, i)
    kd.balance()
    new = base.copy()
    missing = 0
    for i, c in enumerate(base):
        _, j, d = kd.find((-c[0], c[1], c[2]))
        if d > tol:
            missing += 1
            if exact:
                continue
        new[i] = base[i] + off[j] * np.array([-1.0, 1.0, 1.0])
    kb = kbs.get(dst) or obj.shape_key_add(name=dst, from_mix=False)
    kb.data.foreach_set("co", new.ravel())
    kb.slider_min, kb.slider_max = kbs[src].slider_min, kbs[src].slider_max
    kb.value = 0.0
    me.update()
    return missing


def face_control(rig, name, head, tail, parent, travel, axes=("Y",), both_ways=False):
    """On-face control bone (CGDive SK- bones): all channels locked except the used
    location axes, Limit Location in local space with Affect Transform (the stored value
    cannot run past the limit and 'go dead'). Build it so the useful direction is +Y.
    travel = distance that should give a shape value of 1."""
    activate(rig, "EDIT")
    eb = rig.data.edit_bones
    new_bone(eb, name, head, tail, parent=parent)
    bpy.ops.object.mode_set(mode="POSE")
    pb = rig.pose.bones[name]
    pb.rotation_mode = "XYZ"
    pb.lock_rotation = (True, True, True)
    pb.lock_scale = (True, True, True)
    pb.lock_location = tuple(a not in axes for a in "XYZ")
    kw = {"owner_space": "LOCAL", "use_transform_limit": True}
    for a in "XYZ":
        lo = -travel if (both_ways and a in axes) else 0.0
        hi = travel if a in axes else 0.0
        kw.update({f"use_min_{a.lower()}": True, f"use_max_{a.lower()}": True,
                   f"min_{a.lower()}": lo, f"max_{a.lower()}": hi})
    con(rig, name, "LIMIT_LOCATION", **kw)
    bpy.ops.object.mode_set(mode="OBJECT")
    return pb


def drive_shape(obj, key_name, rig, bone, channel="LOC_Y", travel=1.0, sign=1.0):
    """Shape value = sign * var / travel from a control's local channel. One control
    can drive several keys by axis and sign (corner: +Y smile, -Y frown with sign -1:
    negative values clamp to 0 on the key's 0..1 range). Mirrored X on the right side
    needs sign -1 (CGDive)."""
    kb = obj.data.shape_keys.key_blocks[key_name]
    s = "-" if sign < 0 else ""
    return drive(kb, "value", rig, expr=f"{s}var/{travel}", bone=bone, ttype=channel)


# Engines and capture apps find face shapes by exact name. Lists checked 2026-10-18:
# Apple ARFaceAnchor.BlendShapeLocation (52) and Meta Lipsync visemes (15).
ARKIT_52 = (
    "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
    "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
    "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft",
    "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight",
    "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight",
    "jawForward", "jawLeft", "jawOpen", "jawRight",
    "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight",
    "mouthFunnel", "mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft",
    "mouthPressRight", "mouthPucker", "mouthRight", "mouthRollLower", "mouthRollUpper",
    "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight",
    "mouthStretchLeft", "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight",
    "noseSneerLeft", "noseSneerRight", "tongueOut",
)
VISEMES_15 = ("sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U")
SHAPE_SETS = {"arkit": ARKIT_52, "visemes": VISEMES_15}


def shape_set(obj, kind="arkit", rename=None):
    """Give a mesh every key of a set ("arkit" or "visemes"). rename={"JawOpen": "jawOpen"}
    renames existing keys first. Missing keys are added at value 0 as copies of the Basis
    (shape_key_add alone leaves value 1.0): sculpt each, then shape_report lists the ones
    still empty. Returns the names created."""
    if obj.data.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    kbs = obj.data.shape_keys.key_blocks
    for old, new in (rename or {}).items():
        if old in kbs and new not in kbs:
            kbs[old].name = new
    created = []
    for name in SHAPE_SETS[kind]:
        if name not in kbs:
            obj.shape_key_add(name=name, from_mix=False).value = 0.0
            created.append(name)
    return created


def shape_report(obj, kind="arkit", eps=None):
    """Keys of a set that are missing, named with the wrong case, still empty (no vertex
    moves more than eps), or on the wrong side. left_is: the side the *Left keys move, by
    the side holding 80% of the motion, or by their direction along X for centered keys
    (jawLeft). A key that moves neither way has no side, so on a whole body the arms'
    span never decides it.
    Blender's character left is +X, the side ARKit's face space calls the face's own
    left. side_conflicts: keys that disagree with left_is. Zero-offset keys survive FBX
    and glTF export, so a file can carry all 52 names and still not animate."""
    names = SHAPE_SETS[kind]
    keys = obj.data.shape_keys
    kbs = {kb.name: kb for kb in keys.key_blocks[1:]} if keys else {}
    n = len(obj.data.vertices)
    base = np.empty(n * 3)
    (keys.key_blocks[0].data if keys else obj.data.vertices).foreach_get("co", base)
    base = base.reshape(-1, 3)
    size = float(np.ptp(base, axis=0).max() or 1.0)
    eps = eps or 1e-4 * size
    lower = {k.lower(): k for k in kbs}
    missing, wrong_case, empty, side = [], {}, [], {}
    for name in names:
        kb = kbs.get(name)
        if kb is None:
            if name.lower() in lower:
                wrong_case[lower[name.lower()]] = name
            else:
                missing.append(name)
            continue
        co = np.empty(n * 3)
        kb.data.foreach_get("co", co)
        off = co.reshape(-1, 3) - base
        d = np.linalg.norm(off, axis=1)
        if d.max() < eps:
            empty.append(name)
            continue
        w, x = d[d >= eps], base[d >= eps, 0]
        plus, minus = float(w[x > 1e-3 * size].sum()), float(w[x < -1e-3 * size].sum())
        if plus + minus and max(plus, minus) >= 0.8 * (plus + minus):
            sign = 1.0 if plus > minus else -1.0
        else:
            mx = float((off[d >= eps, 0] * w).sum() / w.sum())
            sign = float(np.sign(mx)) if abs(mx) >= 0.1 * float((w * w).sum() / w.sum()) else 0.0
        if sign:
            side[name] = sign
    lefts = [v for k, v in side.items() if k.endswith("Left")]
    left_is = (1.0 if sum(lefts) >= 0 else -1.0) if lefts else None
    conflicts = []
    for name in names:
        if name in side and name.endswith("Left") and side[name] != left_is:
            conflicts.append(name)
        if name in side and name.endswith("Right") and side[name] == left_is:
            conflicts.append(name)
    return {
        "kind": kind, "expected": len(names), "present": len(names) - len(missing) - len(wrong_case),
        "missing": missing, "wrong_case": wrong_case, "empty": empty,
        "left_is": {1.0: "+X", -1.0: "-X"}.get(left_is), "side_conflicts": conflicts,
        "extra": sorted(k for k in kbs if k not in names and k not in wrong_case),
    }


# ----------------------------------------------------------------------------------
# 8. mechanical / hard surface
# ----------------------------------------------------------------------------------
def rigid_check(obj):
    """Max relative change of edge length per island at the current pose. Rigid parts
    (assigned 1.0 to one bone) must read ~0; anything else is bending that should not."""
    P = world_coords(obj, no_subdiv=True)
    me = obj.data
    ed = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", ed)
    ed = ed.reshape(-1, 2)
    R0 = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", R0)
    R0 = R0.reshape(-1, 3)
    L0 = np.linalg.norm(R0[ed[:, 0]] - R0[ed[:, 1]], axis=1)
    L1 = np.linalg.norm(P[ed[:, 0]] - P[ed[:, 1]], axis=1)
    ok = L0 > 1e-9
    return float(np.max(np.abs(L1[ok] / L0[ok] - 1))) if ok.any() else 0.0


def key_action(rig, name, poses, frames=(1, 10)):
    """Action for an Action constraint (CGDive): {bone: {'rotation_euler'|'location'|
    'scale'|'rotation_quaternion': value at the LAST frame}}; rest keyed on the first
    frame, all keys LINEAR (control motion maps linearly to frames), fake user, then
    unlinked from the rig so scrubbing the timeline does not play it."""
    from bpy_extras import anim_utils
    rig.animation_data_create()
    prev = rig.animation_data.action
    act = bpy.data.actions.new(name)
    rig.animation_data.action = act
    for bone, chans in poses.items():
        pb = rig.pose.bones[bone]
        for path, val in chans.items():
            if path == "rotation_euler":
                pb.rotation_mode = "XYZ"
            rest = getattr(pb, path).copy()
            if path.startswith("rotation_quaternion"):
                rest = Quaternion()
            elif path == "scale":
                rest = Vector((1, 1, 1))
            else:
                rest = type(getattr(pb, path))((0, 0, 0))
            setattr(pb, path, rest)
            pb.keyframe_insert(path, frame=frames[0])
            setattr(pb, path, val)
            pb.keyframe_insert(path, frame=frames[1])
            setattr(pb, path, rest)
    slot = rig.animation_data.action_slot
    cb = anim_utils.action_get_channelbag_for_slot(act, slot)
    for fc in cb.fcurves:
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"
    act.use_fake_user = True
    rig.animation_data.action = prev
    return act


def action_drive(rig, bones, action, control, channel="LOCATION_Y", vmin=0.0, vmax=1.0,
                 frames=(1, 10), space="LOCAL"):
    """Action constraints on `bones`: the control's channel scrubs `action` between
    frames (5.x: the action slot is picked automatically when there is one). The
    driven bones stay animatable (CGDive: 'feels like cheating')."""
    out = []
    for b in bones:
        c = con(rig, b, "ACTION", subtarget=control, transform_channel=channel, target_space=space,
                action=action, frame_start=frames[0], frame_end=frames[1], min=vmin, max=vmax)
        if c.action_slot is None and len(c.action_suitable_slots):
            c.action_slot = c.action_suitable_slots[0]
        out.append(c)
    return out


def preserve_volume_mask(obj, rig, pose_fn=None, threshold=None, group="preserve"):
    """CGDive's corrected Preserve Volume setup: Armature modifier 1 with Preserve
    Volume (no candy wrapper), a second Armature modifier WITHOUT it, Multi Modifier
    on, masked by `group` (mask 1 = plain linear result, 0 = Preserve Volume result;
    verified 5.2.1). The mask is seeded where Preserve Volume pushes vertices away
    from their plain position in the current pose (or the pose pose_fn() sets): the
    armpit / hip bulges. Blender-only: neither modifier exports to game engines."""
    m1 = next(m for m in obj.modifiers if m.type == "ARMATURE")
    m1.use_deform_preserve_volume = True
    m2 = obj.modifiers.get("Armature_PV_mask") or obj.modifiers.new("Armature_PV_mask", "ARMATURE")
    m2.object = rig
    m2.use_deform_preserve_volume = False
    m2.use_multi_modifier = True
    g = obj.vertex_groups.get(group) or obj.vertex_groups.new(name=group)
    m2.vertex_group = group
    i1 = list(obj.modifiers).index(m1)
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_move_to_index(modifier=m2.name, index=i1 + 1)
    if pose_fn:
        pose_fn()
    m2.show_viewport = False
    A = world_coords(obj, no_subdiv=True)   # preserve volume only
    m2.show_viewport = True
    m1.use_deform_preserve_volume = False
    B = world_coords(obj, no_subdiv=True)   # plain
    m1.use_deform_preserve_volume = True
    d = np.linalg.norm(A - B, axis=1)
    H = float(np.ptp(world_coords(obj, evaluated=False)[:, 2]))
    thr = threshold if threshold is not None else 0.004 * H
    w = np.clip((d - thr) / max(thr, 1e-9), 0.0, 1.0)
    g.remove(list(range(len(obj.data.vertices))))   # out-of-range indices crash 5.2.1
    for val in np.unique(np.round(w[w > 0], 3)):
        g.add(np.nonzero(np.round(w, 3) == val)[0].tolist(), float(val), "REPLACE")
    return int((w > 0).sum())
