"""
mx_rig: rigging toolkit for Maya 2027 (scenario-maya-rigging skill).

STATUS: not yet run in Maya (written 2026-09-24, Maya 2027 not installed). The pure-Python
layer (vectors, 4x4 matrices in Maya's row-vector convention, Euler angles for the six
rotate orders, aim frames, joint orientation from positions, pole vector placement, foot
roll curves, ordered blendMatrix weights and models of blendMatrix vs parentMatrix, rotation
paths for the mid-blend flip test, the secondary-axis conflict check, static curves, GPU
Override eligibility, rotate order choice, T-stance check, closest Euler) ran offline with
python3: tests/code/maya-rigging/test_rig_offline.py. Every function that calls maya.cmds or
OpenMaya is unverified until tests/code/maya-rigging/run_all.sh has run on Maya 2027. Lines
marked [verify] carry an API detail the probe test answers.
Revision 2026-09-24 (refactor after the M3 blind grade): opm_audit, blend_sweep_test,
curve_census, evaluator_state, prepare_eval_graph, gpu_override_census, the per-character solver
check in rig_check, the secondary-axis guard in orient_with_cmds.

  import sys; sys.path.insert(0, "<skills>/scenario-maya-rigging/scripts"); import mx_rig as R
  arm = R.joint_chain([("upperarm_l", (16, 142, -1)), ("lowerarm_l", (43, 142, -3)),
                       ("hand_l", (68, 142, -1))], parent="clavicle_l", up="plane")
  limb = R.ikfk_limb(arm, "arm_l", rig_parent="rig_noTouch", ctrl_parent="rig_controls")
  R.ikfk_match(limb["meta"], to="fk")           # FK snaps to the IK pose, then the switch flips
  R.space_switch("arm_l_ik_ctrl", [None, "cog_ctrl", "chest_ctrl"], names=["world", "cog", "chest"])
  R.switch_space("arm_l_ik_ctrl", 1)            # change space without a pop
  rep = R.rig_check(root="rig")                  # non-zero rotations, unfrozen controls, missing
                                                 # orient, serial evaluation nodes, lockdown

Headless, through the lead skill's runner:
  python3 <skills>/scenario-maya-expert/scripts/mx_run.py --scene rig.ma mx_rig.py -- --check rig --json out.json

Conventions (Maya 2027 Help, transform and joint node references)
  Matrices are 16 floats, row-major, as cmds.getAttr returns them. Maya post-multiplies
  (p' = p * M): world = local * offsetParentMatrix * dagParentWorld, and the transform's
  parentMatrix attribute already equals offsetParentMatrix * dagParentWorld.
  Joint local matrix = S * RO * R * JO * IS * T (RO = rotateAxis, JO = jointOrient,
  IS = inverse of the parent's scale). jointOrient and rotateAxis are XYZ whatever
  rotateOrder says [verify: probe cross-checks with MEulerRotation].
  Rows of a rotation are the node's local X, Y, Z axes in world space. Angles in degrees.
  Scene linear unit centimeters (rig_check reports it).
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import json
import math
import os
import re
import sys

EPS = 1e-9
ROTATE_ORDERS = ("xyz", "yzx", "zxy", "xzy", "yxz", "zyx")      # rotateOrder enum 0..5
AXIS_INDEX = {"x": 0, "y": 1, "z": 2}
_CYCLIC = ("xyz", "yzx", "zxy")

# antCGi's per-region table for a Y-down-the-bone game skeleton (FN05iGspldI [00:17:51] to
# [00:25:11]); None = leave the default. rotate_order() gives the rule for other conventions.
ROTATE_ORDERS_ANTCGI_Y = {"default": "yxz", "hinge": "yzx", "twist": "zxy", "foot": "zxy",
                          "head": "xyz", "eye": "xyz", "shoulder": None, "hip": None, "cog": None}

# [added] side colors (RGB, 0..1). Ask the animators: antCGi's face episode uses left red,
# right green (UpHKfUPyyBI [00:33:32]).
SIDE_COLORS = {"L": (0.15, 0.45, 1.0), "R": (1.0, 0.2, 0.2), "C": (1.0, 0.85, 0.1)}

# Evaluation census (Using Parallel Maya 2027; Fragapane _0mb4wIZi80)
UNTRUSTED_EXPR = re.compile(r"\b(getAttr|setAttr|ls|select|listConnections|listRelatives|eval|evalEcho|"
                            r"python|xform|objExists|currentTime|pointPosition|getParticleAttr)\b")
LEGACY_DYNAMICS = ("particle", "fluidShape", "rigidBody", "rigidSolver", "spring")
STANDARD_SCRIPT_NODES = ("uiConfigurationScriptNode", "sceneConfigurationScriptNode")

# Scene-wide solver nodes Maya shares between every handle of a type (2027 IK solvers doc);
# a per-character solver is made with createNode (Fragapane rfLEBgOEW1A [00:34:43]).
DEFAULT_SOLVERS = ("ikRPsolver", "ikSCsolver", "ikSplineSolver", "ikSpringSolver", "ik2Bsolver")

# GPU Override eligibility, Using Parallel Maya 2027 (GPU Override section). OpenCL; the paper
# gives AMD and NVIDIA thresholds only (Apple GPUs not described: [verify] on this Mac).
GPU_DEFORMERS = ("blendShape", "cluster", "createColorSet", "deltaMush", "ffd", "groupParts", "mesh", "morph",
                 "nonLinear", "polyColorPerVertex", "polyNormalPerVertex", "polySmoothFace", "polyTweakUV",
                 "proximityWrap", "sculpt", "skinCluster", "softMod", "solidify", "tension", "tweak", "wire")
GPU_MIN_VERTS = {"nvidia": 2000, "amd": 500}          # "over 500/2000 vertices"; MAYA_OPENCL_DEFORMER_MIN_VERTS
GPU_ANIMATED_EXCLUSIONS = {                            # animating these pulls the deformer off the GPU
    "deltaMush": ("smoothingIterations", "smoothingAlgorithm", "smoothingStep", "inwardConstraint",
                  "outwardConstraint", "distanceWeight", "pinBorderVertices"),
    "*": ("weightFunction",),                          # any deformer: animated weightFunction
}


# =========================================================================== pure math
def v_add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def v_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def v_mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def v_dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def v_cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def v_len(a):
    return math.sqrt(v_dot(a, a))


def v_norm(a):
    n = v_len(a)
    if n < EPS:
        raise ValueError("zero-length vector")
    return (a[0] / n, a[1] / n, a[2] / n)


def v_dist(a, b):
    return v_len(v_sub(a, b))


def v_angle(a, b):
    """Angle in degrees between two vectors."""
    c = v_dot(v_norm(a), v_norm(b))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def _axis(spec):
    """'x' -> ('x', 1.0); '-y' -> ('y', -1.0)."""
    s = spec.strip().lower()
    sign = -1.0 if s.startswith("-") else 1.0
    s = s.lstrip("+-")
    if s not in AXIS_INDEX:
        raise ValueError("axis must be x, y, z or -x, -y, -z: %r" % spec)
    return s, sign


def m3_identity():
    return ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))


def m3_mult(a, b):
    return tuple(tuple(sum(a[r][k] * b[k][c] for k in range(3)) for c in range(3)) for r in range(3))


def m3_transpose(a):
    return tuple(tuple(a[c][r] for c in range(3)) for r in range(3))


def m3_max_diff(a, b):
    return max(abs(a[r][c] - b[r][c]) for r in range(3) for c in range(3))


def _rx(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return ((1.0, 0.0, 0.0), (0.0, c, s), (0.0, -s, c))


def _ry(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return ((c, 0.0, -s), (0.0, 1.0, 0.0), (s, 0.0, c))


def _rz(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return ((c, s, 0.0), (-s, c, 0.0), (0.0, 0.0, 1.0))


def rot3_from_euler(angles, order="xyz"):
    """Row-vector rotation for (rx, ry, rz) in degrees: order 'xyz' is Rx * Ry * Rz (the first
    letter is applied first, the last letter is the outermost gimbal)."""
    if order not in ROTATE_ORDERS:
        raise ValueError("rotate order %r" % (order,))
    mats = {"x": _rx(angles[0]), "y": _ry(angles[1]), "z": _rz(angles[2])}
    r = m3_identity()
    for ch in order:
        r = m3_mult(r, mats[ch])
    return r


def rot3_normalize(r):
    return tuple(v_norm(row) for row in r)


def euler_from_rot3(r, order="xyz"):
    """Degrees (rx, ry, rz) such that rot3_from_euler(result, order) == r (scale removed)."""
    if order not in ROTATE_ORDERS:
        raise ValueError("rotate order %r" % (order,))
    r = rot3_normalize(r)
    m = m3_transpose(r)                      # column-vector form: M = Ck * Cj * Ci
    i, j, k = (AXIS_INDEX[c] for c in order)
    e = 1.0 if order in _CYCLIC else -1.0
    s = max(-1.0, min(1.0, -e * m[k][i]))
    b = math.asin(s)
    if math.sqrt(max(0.0, 1.0 - s * s)) > 1e-7:
        a = math.atan2(e * m[k][j], m[k][k])
        c = math.atan2(e * m[j][i], m[i][i])
    else:                                    # gimbal: middle axis at +-90, fold the last into the first
        c = 0.0
        a = math.atan2(-e * m[j][k], m[j][j])
    out = [0.0, 0.0, 0.0]
    out[i], out[j], out[k] = math.degrees(a), math.degrees(b), math.degrees(c)
    return tuple(out)


def _wrap_near(angle, ref):
    return angle + 360.0 * round((ref - angle) / 360.0)


def closest_euler(angles, previous, order="xyz"):
    """The Euler triple equal to `angles` as a rotation and closest to `previous` (for keys:
    avoids 360 jumps and the equivalent flipped solution) [added]."""
    i, j, k = (AXIS_INDEX[c] for c in order)
    cands = []
    for base in (list(angles), None):
        if base is None:                     # the other Tait-Bryan solution
            base = list(angles)
            base[i] += 180.0
            base[j] = 180.0 - base[j]
            base[k] += 180.0
        cands.append([_wrap_near(base[n], previous[n]) for n in range(3)])
    best = min(cands, key=lambda c: sum(abs(c[n] - previous[n]) for n in range(3)))
    return tuple(best)


def m_identity():
    return (1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0)


def m_mult(a, b):
    """a * b (apply a first, then b: Maya's post-multiplied order)."""
    return tuple(sum(a[r * 4 + k] * b[k * 4 + c] for k in range(4)) for r in range(4) for c in range(4))


def m_chain(*ms):
    out = m_identity()
    for m in ms:
        out = m_mult(out, m)
    return out


def m_inverse(m):
    """General 4x4 inverse (Gauss-Jordan with partial pivoting)."""
    a = [list(m[r * 4:r * 4 + 4]) + [1.0 if r == c else 0.0 for c in range(4)] for r in range(4)]
    for col in range(4):
        piv = max(range(col, 4), key=lambda r: abs(a[r][col]))
        if abs(a[piv][col]) < 1e-12:
            raise ValueError("singular matrix")
        a[col], a[piv] = a[piv], a[col]
        p = a[col][col]
        a[col] = [x / p for x in a[col]]
        for r in range(4):
            if r != col and a[r][col] != 0.0:
                f = a[r][col]
                a[r] = [x - f * y for x, y in zip(a[r], a[col])]
    return tuple(a[r][4 + c] for r in range(4) for c in range(4))


def m_compose(rot3=None, t=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)):
    r = rot3 or m3_identity()
    rows = [v_mul(r[n], scale[n]) for n in range(3)]
    return (rows[0][0], rows[0][1], rows[0][2], 0.0, rows[1][0], rows[1][1], rows[1][2], 0.0,
            rows[2][0], rows[2][1], rows[2][2], 0.0, float(t[0]), float(t[1]), float(t[2]), 1.0)


def m_from_euler(angles, order="xyz", t=(0.0, 0.0, 0.0)):
    return m_compose(rot3_from_euler(angles, order), t)


def m_rot3(m):
    return ((m[0], m[1], m[2]), (m[4], m[5], m[6]), (m[8], m[9], m[10]))


def m_translation(m):
    return (m[12], m[13], m[14])


def m_scale(m):
    r = m_rot3(m)
    return tuple(v_len(row) for row in r)


def m_normalized(m):
    """Same matrix with unit-length axes (scale removed)."""
    return m_compose(rot3_normalize(m_rot3(m)), m_translation(m))


def m_point(p, m):
    return (p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12],
            p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13],
            p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14])


def m_vector(v, m):
    return (v[0] * m[0] + v[1] * m[4] + v[2] * m[8],
            v[0] * m[1] + v[1] * m[5] + v[2] * m[9],
            v[0] * m[2] + v[1] * m[6] + v[2] * m[10])


def m_max_diff(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


def aim_frame(aim, up, aim_axis="x", up_axis="y"):
    """Rotation rows (world directions of local X, Y, Z) whose `aim_axis` points along `aim`
    and whose `up_axis` is the part of `up` perpendicular to it. Axes may be signed ('-y').
    Always right-handed."""
    pa, ps = _axis(aim_axis)
    ua, us = _axis(up_axis)
    if pa == ua:
        raise ValueError("aim and up axes must differ")
    a = v_norm(aim)
    u = v_sub(up, v_mul(a, v_dot(up, a)))
    if v_len(u) < 1e-6 * max(1.0, v_len(up)):
        raise ValueError("up vector is parallel to the aim vector")
    u = v_norm(u)
    axes = {pa: v_mul(a, ps), ua: v_mul(u, us)}
    t = ({"x", "y", "z"} - {pa, ua}).pop()
    if (pa + ua + t) in _CYCLIC:
        axes[t] = v_cross(axes[pa], axes[ua])
    else:
        axes[t] = v_cross(axes[ua], axes[pa])
    return (axes["x"], axes["y"], axes["z"])


def rotation_moves_toward(frame, aim_axis, about_axis):
    """World direction the aim axis moves toward under a positive rotation about `about_axis`
    (Maya rotations are right-handed: d(aim) = about x aim)."""
    a = frame[AXIS_INDEX[_axis(aim_axis)[0]]]
    b = frame[AXIS_INDEX[_axis(about_axis)[0]]]
    return v_cross(b, a)


def chain_plane(points, idx=(0, 1, 2)):
    """(normal, flexion) of the plane through three chain points: normal = right-hand normal of
    the first bend, flexion = unit direction from the middle point toward the start-end line
    (the concave side, opposite the pole). Raises on a straight chain."""
    p0, p1, p2 = (points[i] for i in idx)
    n = v_cross(v_sub(p1, p0), v_sub(p2, p1))
    scale = v_dist(p0, p1) * v_dist(p1, p2)
    if v_len(n) < 1e-5 * max(scale, EPS):
        raise ValueError("chain is straight: add a pre-bend (elbow back, knee forward) before orienting or IK")
    se = v_sub(p2, p0)
    proj = v_add(p0, v_mul(se, v_dot(v_sub(p1, p0), se) / v_dot(se, se)))
    return v_norm(n), v_norm(v_sub(proj, p1))


def orient_frames(points, aim_axis="x", up_axis="y", up=(0.0, 1.0, 0.0), up_hint=None, flex=True,
                  world=(), plane_idx=(0, 1, 2), end_aim=None):
    """World rotation rows for joints at `points` (list of xyz), the way riggers orient chains:
      - every joint with a child aims `aim_axis` at the child;
      - up="plane": `up_axis` = chain plane normal (one normal for the whole chain, so every
        hinge bends about the same axis); with flex=True its sign makes a positive rotation
        about `up_axis` bend the chain toward its concave side [added]; up_hint flips it
        toward a world vector instead;
      - up="pole": `up_axis` points to the convex side (where the elbow or knee points);
      - up=(x, y, z): `up_axis` follows that world vector (spines: world +Z, the front);
      - the end joint copies its parent (antCGi FN05iGspldI [00:07:16]; 2027 Orient Joint
        with Auto orient secondary axis zeroes terminal joints the same way);
      - indices in `world` are world oriented (antCGi: root, cog, head, eyes, feet);
      - end_aim=(x, y, z): the last joint aims there instead (a clavicle whose child chain is
        built separately).
    """
    points = list(points)
    n = len(points)
    world = set(world)
    if end_aim is not None:
        points.append(tuple(float(x) for x in end_aim))
        n += 1
    mode = up if isinstance(up, str) else "vector"
    normal = flexion = None
    if mode in ("plane", "pole"):
        normal, flexion = chain_plane(points, plane_idx)
        if mode == "plane" and up_hint is not None and v_dot(normal, up_hint) < 0:
            normal = v_mul(normal, -1.0)

    def build(nrm):
        frames = []
        for i in range(n):
            if i in world:
                frames.append(m3_identity())
                continue
            if i == n - 1:
                frames.append(frames[i - 1] if n > 1 else m3_identity())
                continue
            aim = v_sub(points[i + 1], points[i])
            if mode == "vector":
                upv = tuple(float(x) for x in up)
            elif mode == "plane":
                upv = nrm
            elif mode == "pole":
                upv = v_mul(flexion, -1.0)
            else:
                raise ValueError("up must be a vector, 'plane' or 'pole'")
            try:
                frames.append(aim_frame(aim, upv, aim_axis, up_axis))
            except ValueError:
                # up parallel to the bone: keep the previous joint's up axis, else a world axis
                prev = frames[-1][AXIS_INDEX[_axis(up_axis)[0]]] if frames else None
                for cand in ([prev] if prev else []) + [(0.0, 0.0, 1.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)]:
                    try:
                        frames.append(aim_frame(aim, cand, aim_axis, up_axis))
                        break
                    except ValueError:
                        continue
        return frames

    frames = build(normal)
    if mode == "plane" and flex and up_hint is None:
        mid = plane_idx[1]
        k = mid if mid not in world and mid < n - 1 else plane_idx[0]
        d = rotation_moves_toward(frames[k], aim_axis, up_axis)
        if v_dot(d, flexion) < 0:
            frames = build(v_mul(normal, -1.0))
    return frames[:-1] if end_aim is not None else frames


def joint_orient_from_frames(child_rows, parent_rows=None):
    """jointOrient (XYZ degrees) that gives `child_rows` as world rotation with rotate = 0 under
    a parent whose world rotation is `parent_rows` (row-vector: world = JO * parentWorld)."""
    parent = rot3_normalize(parent_rows) if parent_rows is not None else m3_identity()
    local = m3_mult(rot3_normalize(child_rows), m3_transpose(parent))
    return euler_from_rot3(local, "xyz")


def pole_vector_position(start, mid, end, distance=None):
    """Pole position on the chain's own plane, behind the middle joint: mid + unit(mid - proj)
    * distance, proj = mid projected on the start-end line. A pole on that plane adds zero
    drift when the pole vector constraint is applied [added; antCGi removes the drift by hand
    with two locators, yls25bV-IZU [00:06:35]]. Default distance = the longer segment [added];
    far enough that the handle vector never crosses the pole (Rotate Plane doc; antCGi
    [00:05:36])."""
    se = v_sub(end, start)
    l2 = v_dot(se, se)
    if l2 < EPS:
        raise ValueError("start and end coincide")
    proj = v_add(start, v_mul(se, v_dot(v_sub(mid, start), se) / l2))
    d = v_sub(mid, proj)
    seg = max(v_dist(start, mid), v_dist(mid, end))
    if v_len(d) < 1e-4 * seg:
        raise ValueError("chain is straight: the bend plane is undefined, add a pre-bend first")
    if distance is None:
        distance = seg
    return v_add(mid, v_mul(v_norm(d), float(distance)))


def pole_report(start, mid, end, pole):
    """Numbers behind the pole gates: distance of the pole from the chain plane (fraction of
    its distance to mid) and angle between (pole - start) and (end - start) [added]."""
    n = v_cross(v_sub(mid, start), v_sub(end, mid))
    off = abs(v_dot(v_sub(pole, mid), v_norm(n))) / max(v_dist(pole, mid), EPS) if v_len(n) > EPS else None
    return {"plane_offset_ratio": off, "angle_to_handle_deg": v_angle(v_sub(pole, start), v_sub(end, start)),
            "distance_to_mid": v_dist(pole, mid)}


def foot_roll_curves(roll, break_angle=25.0):
    """antCGi's one-attribute roll (jXmK0Vl5iYA [00:17:58] to [00:27:29]):
    heel = roll below 0; ball = roll up to the break, then 2*break - roll, clamped at 0;
    toe = roll - break above the break. Returns (heel, ball, toe) degrees."""
    heel = roll if roll < 0 else 0.0
    ball = roll if roll <= break_angle else 2.0 * break_angle - roll
    ball = 0.0 if ball < 0 else ball
    toe = roll - break_angle if roll > break_angle else 0.0
    return heel, ball, toe


def bank_split(bank, sign):
    """(outer rz, inner rz): positive bank rolls onto the outer edge [added convention]."""
    return (sign * bank if bank > 0 else 0.0, sign * bank if bank < 0 else 0.0)


def ordered_blend_weights(n, include_input=False):
    """blendMatrix is an ordered stack, "each successive matrix overrides the preceding matrices"
    (2027 Matrix Utility Nodes doc): equal shares of n targets need 1, 1/2, 1/3 ... (the
    inputMatrix is then fully overridden). include_input=True gives the inputMatrix an equal
    share too: 1/2, 1/3 ... 1/(n+1) [added, same rule]. Use 0/1 weights to switch."""
    first = 2 if include_input else 1
    return [1.0 / (i + first) for i in range(n)]


def ordered_blend(base, targets, weights):
    """Model of blendMatrix on translations (the doc's ordered rule): start from the inputMatrix
    value, then each target in order moves the result toward itself by its weight. Lets the
    agent predict a blend before wiring it; rotations follow the same order [added model]."""
    r = tuple(float(x) for x in base)
    for t, w in zip(targets, weights):
        r = v_add(v_mul(r, 1.0 - w), v_mul(t, w))
    return r


def normalized_blend(targets, weights):
    """Model of the parentMatrix node (2025+) on translations: weights are normalized against each
    other ("it normalizes the effect of all the targets", 2027 doc), so 1, 1, 1 is equal thirds."""
    total = float(sum(weights))
    if total <= EPS:
        raise ValueError("parentMatrix model: all weights are zero")
    acc = (0.0, 0.0, 0.0)
    for t, w in zip(targets, weights):
        acc = v_add(acc, v_mul(t, w / total))
    return acc


def rot3_angle(a, b):
    """Angle in degrees of the rotation taking frame `a` to frame `b` (rows = axes)."""
    r = m3_mult(m3_transpose(rot3_normalize(a)), rot3_normalize(b))
    c = (r[0][0] + r[1][1] + r[2][2] - 1.0) * 0.5
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def rotation_path(rots):
    """(path, direct, steps) in degrees for a sampled rotation sweep: the summed step angles, the
    angle between the first and last sample, and each step. A shortest-path blend has path ==
    direct; a flip or a long-way interpolation shows as path well above direct
    (blend_sweep_test) [added]."""
    steps = [rot3_angle(a, b) for a, b in zip(rots[:-1], rots[1:])]
    return sum(steps), (rot3_angle(rots[0], rots[-1]) if rots else 0.0), steps


def sao_vector(sao):
    """World vector of a cmds.joint -secondaryAxisOrient value ('yup', 'zdown', ...)."""
    s = sao.strip().lower()
    if s == "none":
        return None
    axis, sign = s[0], (1.0 if s.endswith("up") else -1.0)
    v = [0.0, 0.0, 0.0]
    v[AXIS_INDEX[axis]] = sign
    return tuple(v)


def sao_conflicts(bones, sao, min_angle=30.0):
    """Joints whose bone (joint to child) lies within `min_angle` degrees of the secondary world
    reference: the secondary axis is then ill-defined and neighbours can flip, e.g. a hardcoded
    'yup' on legs and spine, or world Z on toes that point forward (antCGi FN05iGspldI [00:06:44]).
    bones: [(name, joint_pos, child_pos)]. min_angle is an [added] default. Returns
    [(name, angle)]."""
    ref = sao_vector(sao)
    if ref is None:
        return []
    out = []
    for name, a, b in bones:
        d = v_sub(b, a)
        if v_len(d) < EPS:
            continue
        ang = v_angle(d, ref)
        ang = min(ang, 180.0 - ang)
        if ang < min_angle:
            out.append((name, round(ang, 2)))
    return out


def curve_is_static(values, tol=1e-9):
    """Keys all equal: the Evaluation Graph excludes such a curve, and the first differing key
    rebuilds the graph (Using Parallel Maya 2027, Graph Invalidation)."""
    vals = list(values or [])
    return len(vals) <= 1 or max(vals) - min(vals) <= tol


def gpu_eligibility(vertices, chain, vendor="nvidia", min_verts=None, animated=(), multi_geometry=False,
                    legacy_smooth=False, backface_culling=False, smooth_divisions=0, tweak_relative=True):
    """Pure GPU Override eligibility of one mesh (Using Parallel Maya 2027, GPU Override):
    vertex count over the vendor threshold (NVIDIA 2000, AMD 500, or MAYA_OPENCL_DEFORMER_MIN_VERTS),
    every node type of the deformation chain in the supported list, no animated exclusion
    attribute (animated = [(node_type, attr)]), legacy Catmull-Clark smooth preview off, back-face
    culling off, polySmoothFace divisions 0, tweak relative. multi_geometry=True notes that one
    CPU-bound geometry pulls the shared deformer's other geometries to the CPU too. Returns
    {eligible, reasons, threshold}."""
    limit = GPU_MIN_VERTS.get(vendor, GPU_MIN_VERTS["nvidia"]) if min_verts is None else int(min_verts)
    reasons = []
    if vertices <= limit:
        reasons.append("%d vertices: GPU Override needs over %d on %s (MAYA_OPENCL_DEFORMER_MIN_VERTS)"
                       % (vertices, limit, vendor))
    bad = sorted(set(t for t in chain if t not in GPU_DEFORMERS))
    if bad:
        reasons.append("unsupported nodes in the deformation chain: %s" % ", ".join(bad))
    for t, a in animated:
        if a in GPU_ANIMATED_EXCLUSIONS.get(t, ()) or a in GPU_ANIMATED_EXCLUSIONS["*"]:
            reasons.append("%s.%s is animated: pulls the chain off the GPU" % (t, a))
    if legacy_smooth:
        reasons.append("legacy Maya Catmull-Clark smooth preview: use OpenSubdiv Catmull-Clark with OpenCL Acceleration")
    if backface_culling:
        reasons.append("back-face culling is on")
    if smooth_divisions:
        reasons.append("polySmoothFace with divisions %s (must be 0)" % smooth_divisions)
    if not tweak_relative:
        reasons.append("tweak not relative (relativeTweak must be 1)")
    if multi_geometry and reasons:
        reasons.append("its deformer also drives other geometry: they all fall back to the CPU")
    return {"eligible": not reasons, "reasons": reasons, "threshold": limit}


def rotate_order(innermost, outermost):
    """Rotate order with `innermost` applied first and `outermost` last (the outer axis carries
    the others: antCGi "read it backwards", FN05iGspldI [00:17:19]). Twist axis innermost, the
    axis the joint uses most outermost, the one that must never reach 90 degrees in the middle."""
    innermost, outermost = _axis(innermost)[0], _axis(outermost)[0]
    if innermost == outermost:
        raise ValueError("axes must differ")
    mid = ({"x", "y", "z"} - {innermost, outermost}).pop()
    return innermost + mid + outermost


def side_of(name):
    """'L', 'R' or 'C' from common prefixes and suffixes (L_, l_, _L, _l, Left)."""
    s = name.split("|")[-1].split(":")[-1]
    if re.match(r"^(L|l|left|Left)[_A-Z]", s) or re.search(r"[_](L|l|left|Left)$", s) or re.search(r"_l_|_L_", s):
        return "L"
    if re.match(r"^(R|r|right|Right)[_A-Z]", s) or re.search(r"[_](R|r|right|Right)$", s) or re.search(r"_r_|_R_", s):
        return "R"
    return "C"


def mirror_mode(left_rows, right_rows, tol=1e-3):
    """'behavior' when the right axes are the negated YZ-reflection of the left ones (Mirror
    Function Behavior: equal values give mirrored motion), 'orientation' when they are equal,
    else None (FN05iGspldI [00:12:13])."""
    refl = [(-r[0], r[1], r[2]) for r in left_rows]
    beh = [v_mul(r, -1.0) for r in refl]
    if all(v_dist(a, b) < tol for a, b in zip(beh, right_rows)):
        return "behavior"
    if all(v_dist(a, b) < tol for a, b in zip(left_rows, right_rows)):
        return "orientation"
    return None


def tstance_check(pos, tol_deg=10.0):
    """HumanIK T-stance contract (2027 Help, Prepare an existing skeleton): faces +Z, left arm
    along +X, head up +Y, feet along +Z. `pos`: HumanIK names to world positions (any subset).
    Returns problems (empty list = fits)."""
    probs = []

    def check(a, b, want, label):
        if a in pos and b in pos:
            d = v_sub(pos[b], pos[a])
            if "Foot" in a:                       # feet: yaw only (ankle sits above the toe base)
                d = (d[0], 0.0, d[2])
            if v_len(d) > EPS:
                ang = v_angle(d, want)
                if ang > tol_deg:
                    probs.append("%s: %.1f deg off %s" % (label, ang, want))
    check("LeftArm", "LeftHand", (1.0, 0.0, 0.0), "left arm not along +X")
    check("RightArm", "RightHand", (-1.0, 0.0, 0.0), "right arm not along -X")
    check("LeftForeArm", "LeftHand", (1.0, 0.0, 0.0), "left forearm not along +X")
    check("RightForeArm", "RightHand", (-1.0, 0.0, 0.0), "right forearm not along -X")
    check("Hips", "Head", (0.0, 1.0, 0.0), "spine not up +Y")
    check("LeftUpLeg", "LeftFoot", (0.0, -1.0, 0.0), "left leg not down -Y")
    check("RightUpLeg", "RightFoot", (0.0, -1.0, 0.0), "right leg not down -Y")
    check("LeftFoot", "LeftToeBase", (0.0, 0.0, 1.0), "left foot not along +Z")
    check("RightFoot", "RightToeBase", (0.0, 0.0, 1.0), "right foot not along +Z")
    return probs


# =========================================================================== Maya helpers
def _cmds():
    import maya.cmds as cmds
    return cmds


def _om():
    import maya.api.OpenMaya as om
    return om


def _short(node):
    return node.split("|")[-1]


def get_matrix(plug):
    return tuple(float(x) for x in _cmds().getAttr(plug))


def set_matrix(plug, m):
    cmds = _cmds()
    vals = [float(x) for x in m]
    try:
        cmds.setAttr(plug, vals, type="matrix")
    except Exception:
        cmds.setAttr(plug, *vals, type="matrix")      # [verify] which form 2027 accepts


def world_matrix(node):
    return get_matrix(node + ".worldMatrix[0]")


def wpos(node):
    return m_translation(world_matrix(node))


def parent_of(node):
    p = _cmds().listRelatives(node, parent=True, fullPath=True) or []
    return p[0] if p else None


def is_joint(node):
    return _cmds().nodeType(node) == "joint"


def _set3(node, attr, values):
    """Set the unlocked, unconnected components of a double3; returns the ones skipped."""
    cmds = _cmds()
    skipped = []
    for ax, v in zip("XYZ", values):
        plug = "%s.%s%s" % (node, attr, ax)
        if cmds.getAttr(plug, lock=True) or cmds.listConnections(plug, s=True, d=False):
            skipped.append(plug)
            continue
        cmds.setAttr(plug, v)
    return skipped


def _incoming(node, attrs):
    cmds = _cmds()
    found = []
    for a in attrs:
        for plug in [node + "." + a] + ["%s.%s%s" % (node, a, ax) for ax in "XYZ"]:
            if cmds.objExists(plug) and cmds.listConnections(plug, s=True, d=False):
                found.append(plug)
    return found


class _Unlocked(object):
    """Temporarily unlock plugs, restore the lock state afterwards."""

    def __init__(self, node, attrs):
        self.plugs = []
        cmds = _cmds()
        for a in attrs:
            for plug in [node + "." + a] + ["%s.%s%s" % (node, a, ax) for ax in "XYZ"]:
                if cmds.objExists(plug):
                    self.plugs.append((plug, cmds.getAttr(plug, lock=True)))

    def __enter__(self):
        for plug, locked in self.plugs:
            if locked:
                _cmds().setAttr(plug, lock=False)
        return self

    def __exit__(self, *exc):
        for plug, locked in self.plugs:
            if locked:
                _cmds().setAttr(plug, lock=True)
        return False


def ensure_matrix_nodes():
    """decomposeMatrix and friends historically came from the matrixNodes plug-in [verify
    whether 2027 still needs it in mayapy]. Returns the load state."""
    cmds = _cmds()
    try:
        n = cmds.createNode("decomposeMatrix", skipSelect=True)
        cmds.delete(n)
        return "builtin"
    except Exception:
        try:
            cmds.loadPlugin("matrixNodes", quiet=True)
            return "loaded matrixNodes"
        except Exception as exc:
            return "unavailable: %s" % exc


def mult_matrix(inputs, name=None):
    """multMatrix node; each input is a plug name (connected) or 16 floats (set). Returns
    the matrixSum plug."""
    cmds = _cmds()
    mm = cmds.createNode("multMatrix", name=name or "mxRig_multMatrix#", skipSelect=True)
    for i, src in enumerate(inputs):
        dst = "%s.matrixIn[%d]" % (mm, i)
        if isinstance(src, str):
            cmds.connectAttr(src, dst)
        else:
            set_matrix(dst, src)
    return mm + ".matrixSum"


def set_world_matrix(node, m, translate=True, rotate=True, scale=False):
    """Set local TRS so the node's world matrix is `m`, through its offsetParentMatrix and DAG
    parent (parentMatrix attribute), jointOrient and rotateAxis included; Euler angles closest
    to the current ones. Locked or connected channels are skipped and returned [added]."""
    cmds = _cmds()
    pm = get_matrix(node + ".parentMatrix[0]")
    local = m_mult(tuple(m), m_inverse(pm))
    rows = m_rot3(local)
    sc = tuple(v_len(r) for r in rows)
    rot = rot3_normalize(rows)
    ra = cmds.getAttr(node + ".rotateAxis")[0]
    if any(abs(v) > 1e-9 for v in ra):
        rot = m3_mult(m3_transpose(rot3_from_euler(ra, "xyz")), rot)
    if is_joint(node):
        jo = cmds.getAttr(node + ".jointOrient")[0]
        rot = m3_mult(rot, m3_transpose(rot3_from_euler(jo, "xyz")))
    skipped = []
    if rotate:
        order = ROTATE_ORDERS[cmds.getAttr(node + ".rotateOrder")]
        ang = closest_euler(euler_from_rot3(rot, order), cmds.getAttr(node + ".rotate")[0], order)
        skipped += _set3(node, "rotate", ang)
    if translate:
        skipped += _set3(node, "translate", m_translation(local))
    if scale:
        skipped += _set3(node, "scale", sc)
    return skipped


def bake_to_opm(node, tol=1e-4):
    """Move a node's local values into its offsetParentMatrix so its channels read zero and
    its world matrix does not change (antCGi "move the values down", yls25bV-IZU [00:09:34];
    MLC JOYMV-bQdlM). Joints get jointOrient zeroed too (antCGi [00:18:08]: any value left
    under an OPM drive doubles). Refuses connected channels. Returns the new OPM."""
    cmds = _cmds()
    joint = is_joint(node)
    attrs = ["translate", "rotate", "scale", "shear", "rotateAxis"] + (["jointOrient"] if joint else [])
    conn = _incoming(node, attrs + ["offsetParentMatrix"])
    if conn:
        raise RuntimeError("bake_to_opm(%s): driven channels %s" % (node, conn))
    before = world_matrix(node)
    new = m_mult(get_matrix(node + ".matrix"), get_matrix(node + ".offsetParentMatrix"))
    with _Unlocked(node, attrs):
        set_matrix(node + ".offsetParentMatrix", new)
        cmds.setAttr(node + ".translate", 0, 0, 0)
        cmds.setAttr(node + ".rotate", 0, 0, 0)
        cmds.setAttr(node + ".scale", 1, 1, 1)
        cmds.setAttr(node + ".shear", 0, 0, 0)
        cmds.setAttr(node + ".rotateAxis", 0, 0, 0)
        if joint:
            cmds.setAttr(node + ".jointOrient", 0, 0, 0)
        else:
            cmds.setAttr(node + ".rotatePivotTranslate", 0, 0, 0)
            cmds.setAttr(node + ".scalePivotTranslate", 0, 0, 0)
    after = world_matrix(node)
    err = m_max_diff(before, after)
    if err > tol:
        raise RuntimeError("bake_to_opm(%s) moved the node by %.6g (parent scale or pivots?)" % (node, err))
    return new


def lock_hide(node, attrs=("sx", "sy", "sz", "v")):
    """Lock, hide and make non-keyable. 't', 'r', 's' expand to their components."""
    cmds = _cmds()
    done = []
    for a in attrs:
        names = [a + ax for ax in "xyz"] if a in ("t", "r", "s") else [a]
        for n in names:
            plug = node + "." + n
            if cmds.objExists(plug):
                cmds.setAttr(plug, lock=True, keyable=False, channelBox=False)
                done.append(n)
    return done


def unlock_show(node, attrs):
    cmds = _cmds()
    for a in attrs:
        names = [a + ax for ax in "xyz"] if a in ("t", "r", "s") else [a]
        for n in names:
            plug = node + "." + n
            if cmds.objExists(plug):
                cmds.setAttr(plug, lock=False, keyable=True)


def key_channels(node, attrs=("translate", "rotate"), time=None, step=False):
    """Key the unlocked, keyable components of `attrs` (locked ones are skipped instead of
    making setKeyframe fail). step=True gives stepped out tangents (switch attributes)."""
    cmds = _cmds()
    t = cmds.currentTime(q=True) if time is None else time
    keyed = []
    for a in attrs:
        comps = [a + ax for ax in "XYZ"] if a in ("translate", "rotate", "scale") else [a]
        for c in comps:
            plug = node + "." + c
            if cmds.objExists(plug) and not cmds.getAttr(plug, lock=True) and cmds.getAttr(plug, keyable=True):
                kw = {"attribute": c, "time": t}
                if step:
                    kw["outTangentType"] = "step"
                cmds.setKeyframe(node, **kw)
                keyed.append(plug)
    return keyed


# =========================================================================== model gate, placement
def model_gate(meshes, height=None, height_tol=0.05, eyes=(), tol=0.1):
    """The rigger's intake checks beyond mx_validate (antCGi e74KphYwMww): cm, feet on y = 0,
    centred on X, height to spec, frozen transforms, eye transforms without rotation (eyes
    modeled looking dead ahead [00:08:14]) and eye pairs mirrored. Returns {ok, problems, info}."""
    cmds = _cmds()
    probs, info = [], {}
    unit = cmds.currentUnit(q=True, linear=True)
    if unit != "cm":
        probs.append("linear unit %s, expected cm" % unit)
    bb = cmds.exactWorldBoundingBox(list(meshes))
    h = bb[4] - bb[1]
    info.update(bbox=list(bb), height=h, min_y=bb[1], centre_x=(bb[0] + bb[3]) * 0.5)
    if abs(bb[1]) > tol:
        probs.append("lowest point at y = %.3f, feet should rest on y = 0" % bb[1])
    if abs(info["centre_x"]) > tol:
        probs.append("centre at x = %.3f, expected 0 (symmetry, mirroring)" % info["centre_x"])
    if height and abs(h - height) > height_tol * height:
        probs.append("height %.1f, spec %.1f" % (h, height))
    for m in list(meshes) + list(eyes):
        t, r, s = (cmds.getAttr(m + "." + a)[0] for a in ("translate", "rotate", "scale"))
        if any(abs(v) > 1e-6 for v in t + r) or any(abs(v - 1) > 1e-6 for v in s):
            probs.append("%s not frozen: t %s r %s s %s" % (m, t, r, s))
    if len(eyes) == 2:
        c = [cmds.exactWorldBoundingBox(e) for e in eyes]
        ca, cb = [((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2) for b in c]
        info["eye_centres"] = (ca, cb)
        if v_dist((-ca[0], ca[1], ca[2]), cb) > tol:
            probs.append("eyes not mirrored across X: %s %s" % (ca, cb))
    return {"ok": not probs, "problems": probs, "info": info}


def projected_center(mesh, point, direction=(0.0, 0.0, 1.0)):
    """Substitute for the Joint Tool's Snap to Projected Center: a line through `point` along
    `direction`; returns the midpoint between the last surface hit before the point and the
    first after it (the middle of the limb along that view) [added]. OpenMaya
    MFnMesh.allIntersections [verify return layout]."""
    om = _om()
    sel = om.MSelectionList()
    sel.add(mesh)
    fn = om.MFnMesh(sel.getDagPath(0))
    d = v_norm(direction)
    reach = 1e4
    src = om.MFloatPoint(point[0] - d[0] * reach, point[1] - d[1] * reach, point[2] - d[2] * reach)
    res = fn.allIntersections(src, om.MFloatVector(*d), om.MSpace.kWorld, 2 * reach, False)
    hits = sorted((float(t), (p.x, p.y, p.z)) for p, t in zip(res[0], res[1]))
    before = [h for h in hits if h[0] <= reach]
    after = [h for h in hits if h[0] > reach]
    if not before or not after:
        raise ValueError("projected_center: %s is not inside %s along %s" % (point, mesh, direction))
    return v_mul(v_add(before[-1][1], after[0][1]), 0.5)


def edge_loop_center(mesh, edge):
    """Average world position of the vertices of the edge loop through `edge` (index): joint
    placement on a loop, not between loops (antCGi fGacyVzJGIU [00:13:11]) [added]. Uses
    polySelect -edgeLoop without changing the selection [verify flags]."""
    cmds = _cmds()
    loop = cmds.polySelect(mesh, edgeLoop=edge, asSelectString=True, noSelection=True) or []
    verts = cmds.ls(cmds.polyListComponentConversion(loop, fromEdge=True, toVertex=True) or [], flatten=True) or []
    if not verts:
        raise ValueError("edge_loop_center: no loop through %s.e[%s]" % (mesh, edge))
    pts = [cmds.pointPosition(v, world=True) for v in verts]
    n = float(len(pts))
    return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n, sum(p[2] for p in pts) / n)


# =========================================================================== skeleton
def _world_index(spec, world):
    names = [n for n, _ in spec]
    out = set()
    for w in world or ():
        if isinstance(w, int):
            out.add(w)
        elif w in names:
            out.add(names.index(w))
    return out


def joint_chain(spec, parent=None, aim_axis="x", up_axis="z", up="plane", up_hint=None, flex=True,
                world=(), radius=None, rotate_order=None, plane_idx=(0, 1, 2), end_aim=None):
    """Create a joint chain from (name, world position) pairs with orientation computed, not
    left to Orient Joint: jointOrient carries the orientation, rotate and rotateAxis are zero,
    each child sits on its parent's aim axis, end joints copy their parent (orient_frames).
    Default [added]: X down the bone toward the child, Z = chain plane normal and positive Z
    bends the chain (limbs). Spines and necks: up=(0, 0, 1), up_axis="y". antCGi's game
    convention: aim_axis="y", up_axis="z", up=(0, 0, 1) (FN05iGspldI [00:02:54]).
    end_aim=(x, y, z) aims the last joint at a point (a clavicle before its arm chain exists).
    Returns the joint names. Existing names raise (the caller decides)."""
    cmds = _cmds()
    for n, _ in spec:
        if cmds.objExists(n):
            raise ValueError("joint_chain: %s already exists" % n)
    pts = [tuple(float(x) for x in p) for _, p in spec]
    if len(spec) + (1 if end_aim is not None else 0) < 3 and isinstance(up, str):
        up = (0.0, 1.0, 0.0) if _axis(aim_axis)[0] != "y" else (0.0, 0.0, 1.0)
    frames = orient_frames(pts, aim_axis, up_axis, up, up_hint, flex, _world_index(spec, world), plane_idx,
                           end_aim)
    sel = cmds.ls(selection=True) or []
    created = []
    prev = parent
    try:
        for (name, _), p, frame in zip(spec, pts, frames):
            cmds.select(clear=True)
            j = cmds.joint(name=name)
            if prev:
                j = cmds.parent(j, prev, relative=True)[0]
                if is_joint(prev) and not cmds.listConnections(j + ".inverseScale", s=True, d=False):
                    cmds.connectAttr(prev + ".scale", j + ".inverseScale", force=True)
            pw = world_matrix(prev) if prev else m_identity()
            cmds.setAttr(j + ".rotate", 0, 0, 0)
            cmds.setAttr(j + ".rotateAxis", 0, 0, 0)
            cmds.setAttr(j + ".jointOrient", *joint_orient_from_frames(frame, m_rot3(pw)))
            cmds.setAttr(j + ".translate", *m_point(p, m_inverse(pw)))
            if radius:
                cmds.setAttr(j + ".radius", radius)
            if rotate_order:
                cmds.setAttr(j + ".rotateOrder", ROTATE_ORDERS.index(rotate_order))
            created.append(j)
            prev = j
    finally:
        try:
            if sel:
                cmds.select(sel, replace=True)
            else:
                cmds.select(clear=True)
        except Exception:
            pass
    return created


def orient_with_cmds(start, oj="xyz", sao="yup", children=True, min_angle=30.0):
    """The GUI's Orient Joint through cmds, with its silent trap handled: -orientJoint is
    ignored when the joint has rotations or no child (2027 cmds.joint). Rotations are frozen
    into jointOrient first, end joints are zeroed afterwards. Refuses a `sao` (secondary world
    reference) within `min_angle` degrees of any bone it would orient: 'yup' suits a T-pose arm,
    not legs or spine (use 'zup' there) nor toes (antCGi FN05iGspldI [00:06:44]); min_angle=0
    turns the check off. Returns the end joints."""
    cmds = _cmds()
    scope = [start] + ((cmds.listRelatives(start, allDescendents=True, type="joint", fullPath=True) or [])
                       if children else [])
    bones = []
    for j in scope:
        for k in cmds.listRelatives(j, children=True, type="joint", fullPath=True) or []:
            bones.append((_short(j), wpos(j), wpos(k)))
            break
    bad = sao_conflicts(bones, sao, min_angle) if min_angle else []
    if bad:
        raise ValueError("orient_with_cmds: secondaryAxisOrient %r is nearly parallel to %s: pick a world axis "
                         "across the bone ('zup' for legs and spine, 'yup' for T-pose arms and toes)" % (sao, bad))
    cmds.makeIdentity(start, apply=True, translate=False, rotate=True, scale=False)
    cmds.joint(start, edit=True, orientJoint=oj, secondaryAxisOrient=sao, children=children, zeroScaleOrient=True)
    ends = []
    for j in [start] + (cmds.listRelatives(start, allDescendents=True, type="joint", fullPath=True) or []):
        if not cmds.listRelatives(j, children=True, type="joint"):
            cmds.setAttr(j + ".jointOrient", 0, 0, 0)
            ends.append(j)
    return ends


def orient_to_world(joint):
    """World-orient a parented joint: the GUI needs unparent, orient, reparent (antCGi
    FN05iGspldI [00:03:25]); here jointOrient is solved against the parent directly and the
    children keep their world positions."""
    cmds = _cmds()
    kids = cmds.listRelatives(joint, children=True, fullPath=True) or []
    kid_world = {k: world_matrix(k) for k in kids}
    parent = parent_of(joint)
    pw = world_matrix(parent) if parent else m_identity()
    cmds.setAttr(joint + ".rotate", 0, 0, 0)
    cmds.setAttr(joint + ".rotateAxis", 0, 0, 0)
    cmds.setAttr(joint + ".jointOrient", *joint_orient_from_frames(m3_identity(), m_rot3(pw)))
    for k, wm in kid_world.items():
        if is_joint(k):
            jw = world_matrix(joint)
            cmds.setAttr(k + ".rotate", 0, 0, 0)
            cmds.setAttr(k + ".jointOrient", *joint_orient_from_frames(m_rot3(wm), m_rot3(jw)))
            cmds.setAttr(k + ".translate", *m_point(m_translation(wm), m_inverse(jw)))
        else:
            set_world_matrix(k, wm, translate=True, rotate=True)
    return joint


def mirror_chain(root, search=("_l", "_r"), behavior=True):
    """Skeleton > Mirror Joints across YZ (never duplicate with scale -1: 2027 Help). Behavior
    for limbs, orientation for eyes and face (antCGi FN05iGspldI [00:12:13], UpHKfUPyyBI
    [00:19:01]). Returns the new joints."""
    cmds = _cmds()
    return cmds.mirrorJoint(root, mirrorYZ=True, mirrorBehavior=behavior, searchReplace=search) or []


def set_rotate_orders(joints, order):
    cmds = _cmds()
    for j in joints:
        cmds.setAttr(j + ".rotateOrder", ROTATE_ORDERS.index(order))


def set_preferred_angles(root):
    """Skeleton > Set Preferred Angle on the whole hierarchy: always do it on the bent rest
    pose (antCGi [00:15:18]; Fragapane: only a sign bias for 2-bone chains with a pole)."""
    _cmds().joint(root, edit=True, setPreferredAngles=True, children=True)


def duplicate_chain(joints, suffix="_fk", parent=None, replace=None):
    """Duplicate joints one by one (parentOnly) into a new chain, optionally under `parent`.
    replace=(old, new) renames by substitution instead of appending `suffix`."""
    cmds = _cmds()
    out = []
    for i, j in enumerate(joints):
        short = _short(j)
        name = short.replace(replace[0], replace[1]) if replace else short + suffix
        d = cmds.duplicate(j, parentOnly=True, name=name)[0]
        if i == 0:
            if parent:
                d = cmds.parent(d, parent)[0]
        else:
            d = cmds.parent(d, out[-1])[0]
        out.append(d)
    return out


# =========================================================================== controls
_SHAPES = {
    "square": [[(-1, 0, -1), (-1, 0, 1), (1, 0, 1), (1, 0, -1), (-1, 0, -1)]],
    "box": [[(-1, 1, 1), (1, 1, 1), (1, 1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1), (1, -1, 1), (1, 1, 1),
             (1, -1, 1), (1, -1, -1), (1, 1, -1), (1, -1, -1), (-1, -1, -1), (-1, 1, -1), (-1, -1, -1),
             (-1, -1, 1)]],
    "diamond": [[(0, 1, 0), (1, 0, 0), (0, -1, 0), (-1, 0, 0), (0, 1, 0), (0, 0, 1), (0, -1, 0), (0, 0, -1),
                 (0, 1, 0)], [(1, 0, 0), (0, 0, 1), (-1, 0, 0), (0, 0, -1), (1, 0, 0)]],
    "cross": [[(-0.33, 0, -1), (0.33, 0, -1), (0.33, 0, -0.33), (1, 0, -0.33), (1, 0, 0.33), (0.33, 0, 0.33),
               (0.33, 0, 1), (-0.33, 0, 1), (-0.33, 0, 0.33), (-1, 0, 0.33), (-1, 0, -0.33), (-0.33, 0, -0.33),
               (-0.33, 0, -1)]],
    "arrow": [[(0, 0, -1), (0.6, 0, -0.2), (0.25, 0, -0.2), (0.25, 0, 1), (-0.25, 0, 1), (-0.25, 0, -0.2),
               (-0.6, 0, -0.2), (0, 0, -1)]],
}


def _map_axis(p, axis):
    """Shapes are drawn with normal +Y; swap coordinates so the normal is `axis`."""
    a = _axis(axis)[0]
    if a == "x":
        return (p[1], p[0], p[2])
    if a == "z":
        return (p[0], p[2], p[1])
    return tuple(p)


def _curve_transform(name, shape, size, axis, shape_offset):
    cmds = _cmds()
    off = shape_offset or (0.0, 0.0, 0.0)
    curves = []
    if shape in ("circle", "sphere"):
        normals = [axis] if shape == "circle" else ["x", "y", "z"]
        for nrm in normals:
            v = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[_axis(nrm)[0]]
            c = cmds.circle(normal=v, radius=size, sections=8, degree=3, center=off, constructionHistory=False)
            curves.append(c[0] if isinstance(c, (list, tuple)) else c)
    elif shape in _SHAPES:
        for pts in _SHAPES[shape]:
            p = [v_add(v_mul(_map_axis(q, axis), size), off) for q in pts]
            curves.append(cmds.curve(degree=1, point=p))
    else:
        raise ValueError("unknown control shape %r (circle, sphere, %s)" % (shape, ", ".join(sorted(_SHAPES))))
    ctrl = cmds.rename(curves[0], name)
    for extra in curves[1:]:
        for s in cmds.listRelatives(extra, shapes=True, fullPath=True) or []:
            cmds.parent(s, ctrl, relative=True, shape=True)
        cmds.delete(extra)
    for i, s in enumerate(cmds.listRelatives(ctrl, shapes=True, fullPath=True) or []):
        cmds.rename(s, "%sShape%s" % (_short(ctrl), "" if i == 0 else str(i)))
    return ctrl


def set_color(node, rgb=None, side=None):
    cmds = _cmds()
    rgb = rgb or SIDE_COLORS[side or side_of(node)]
    for s in cmds.listRelatives(node, shapes=True, fullPath=True) or []:
        cmds.setAttr(s + ".overrideEnabled", 1)
        try:
            cmds.setAttr(s + ".overrideRGBColors", 1)
            cmds.setAttr(s + ".overrideColorRGB", *rgb)
        except Exception:
            cmds.setAttr(s + ".overrideColor", {"L": 6, "R": 13, "C": 17}[side or side_of(node)])


def tag_controller(ctrl, parent_ctrl=None):
    """Control > Tag as Controller (and Parent Controller for pickwalking). Controllers let the
    Evaluation Manager prepopulate the graph so first keys do not invalidate it (Using
    Parallel Maya 2027, Reduce Graph Rebuild). Returns the controller node or None."""
    cmds = _cmds()
    tags = cmds.listConnections(ctrl + ".message", s=False, d=True, type="controller") or []
    if not tags:
        cmds.controller(ctrl)
        tags = cmds.listConnections(ctrl + ".message", s=False, d=True, type="controller") or []
    if parent_ctrl:
        try:
            cmds.controller(ctrl, parent_ctrl, parent=True)      # [verify] argument order and flag
        except Exception:
            pass
    return tags[0] if tags else None


def _target_matrix(match):
    if match is None:
        return m_identity()
    if isinstance(match, str):
        return world_matrix(match)
    match = tuple(float(x) for x in match)
    if len(match) == 3:
        return m_compose(None, match)
    if len(match) == 16:
        return match
    raise ValueError("match: node name, xyz or 16 floats")


def control(name, shape="circle", size=1.0, axis="x", match=None, parent=None, side=None, color=None,
            rotate_order=None, lock=("sx", "sy", "sz", "v"), tag=True, parent_controller=None,
            shape_offset=None, line_width=None, offset="opm"):
    """A NURBS control placed at `match` (node, xyz or matrix) with its placement in the
    offsetParentMatrix, so translate and rotate read zero (antCGi; MLC). Scale removed from
    the placement. Copies a matched joint's rotate order (antCGi FN05iGspldI [00:25:42]).
    offset="group" makes a classic `<name>_grp` offset group instead (pipelines that expect
    it). Returns the control name."""
    cmds = _cmds()
    if cmds.objExists(name):
        raise ValueError("control: %s already exists" % name)
    ctrl = _curve_transform(name, shape, float(size), axis, shape_offset)
    w = m_normalized(_target_matrix(match))
    host = ctrl
    if offset == "group":
        host = cmds.createNode("transform", name=name + "_grp", skipSelect=True)
        if parent:
            host = cmds.parent(host, parent, relative=True)[0]
        ctrl = cmds.parent(ctrl, host, relative=True)[0]
    elif parent:
        ctrl = cmds.parent(ctrl, parent, relative=True)[0]
        host = ctrl
    if offset == "group":
        set_world_matrix(host, w)                       # classic: the values live on the group
    else:
        pw = world_matrix(parent) if parent else m_identity()
        set_matrix(host + ".offsetParentMatrix", m_mult(w, m_inverse(pw)))
    if rotate_order is None and isinstance(match, str) and is_joint(match):
        rotate_order = ROTATE_ORDERS[cmds.getAttr(match + ".rotateOrder")]
    if rotate_order:
        cmds.setAttr(ctrl + ".rotateOrder", ROTATE_ORDERS.index(rotate_order))
    set_color(ctrl, color, side)
    if line_width:
        for s in cmds.listRelatives(ctrl, shapes=True, fullPath=True) or []:
            if cmds.objExists(s + ".lineWidth"):
                cmds.setAttr(s + ".lineWidth", line_width)
    if tag:
        tag_controller(ctrl, parent_controller)
    lock_hide(ctrl, lock or ())
    return ctrl


def follow_group(name, driver=None, parent=None, pick=None):
    """Transform whose offsetParentMatrix follows `driver`'s world matrix (through the DAG
    parent's inverse when there is one): a constraint-free follow (MLC JOYMV-bQdlM [00:05:20]).
    pick=("translate",) keeps only those components (pickMatrix; point-constraint-like)."""
    cmds = _cmds()
    g = cmds.createNode("transform", name=name, skipSelect=True)
    if parent:
        g = cmds.parent(g, parent, relative=True)[0]
    if driver:
        src = driver + ".worldMatrix[0]"
        if pick:
            pm = cmds.createNode("pickMatrix", name=name + "_pick", skipSelect=True)
            cmds.connectAttr(src, pm + ".inputMatrix")
            for comp in ("Translate", "Rotate", "Scale", "Shear"):
                cmds.setAttr(pm + ".use" + comp, 1 if comp.lower() in pick else 0)
            src = pm + ".outputMatrix"
        if parent:
            src = mult_matrix([src, parent + ".worldInverseMatrix[0]"], name=name + "_mm")
        cmds.connectAttr(src, g + ".offsetParentMatrix", force=True)
    return g


def follow_with_offset(node, driver, pick=None):
    """Drive `node`'s offsetParentMatrix so it keeps its current offset to `driver` (the matrix
    version of a constraint with maintain offset) [added]. TRS of `node` must be zero."""
    cmds = _cmds()
    src = driver + ".worldMatrix[0]"
    drv_now = world_matrix(driver)
    if pick:
        pm = cmds.createNode("pickMatrix", name=_short(node) + "_pick", skipSelect=True)
        cmds.connectAttr(src, pm + ".inputMatrix")
        for comp in ("Translate", "Rotate", "Scale", "Shear"):
            cmds.setAttr(pm + ".use" + comp, 1 if comp.lower() in pick else 0)
        src = pm + ".outputMatrix"
        drv_now = get_matrix(src)
    offset = m_mult(world_matrix(node), m_inverse(drv_now))
    parent = parent_of(node)
    inputs = [offset, src] + ([parent + ".worldInverseMatrix[0]"] if parent else [])
    before = world_matrix(node)
    cmds.connectAttr(mult_matrix(inputs, name=_short(node) + "_follow_mm"), node + ".offsetParentMatrix", force=True)
    err = m_max_diff(before, world_matrix(node))
    if err > 1e-4:
        raise RuntimeError("follow_with_offset(%s): moved by %.6g (non-zero TRS?)" % (node, err))


# =========================================================================== IK
def ik_handle(start, end, solver="ikRPsolver", name=None, own_solver=None):
    """IK handle; spring and 2-bone solvers are loaded first (the 2027 ikHandle page lists only
    RP, SC and spline as valid). own_solver="<name>" gives the character its own solver node
    instead of the scene-wide shared one (Fragapane rfLEBgOEW1A [00:34:43]; 2027 IK solvers:
    createNode) [verify ikSolver attribute]."""
    cmds = _cmds()
    import maya.mel as mel
    if solver in ("ikSpringSolver", "ik2Bsolver"):
        try:
            mel.eval(solver)                                     # [verify] loads the solver
        except Exception:
            pass
    kw = {"startJoint": start, "endEffector": end, "solver": solver}
    if name:
        kw["name"] = name
    h, eff = cmds.ikHandle(**kw)[:2]
    if own_solver:
        s = own_solver if cmds.objExists(own_solver) else cmds.createNode(solver, name=own_solver, skipSelect=True)
        cmds.connectAttr(s + ".message", h + ".ikSolver", force=True)
    return h, eff


def pole_vector(handle, ctrl, start, mid, end, distance=None, tol=1e-3):
    """Put `ctrl` on the chain plane behind `mid` (pole_vector_position), constrain the handle
    to it and measure the drift of the middle joint: antCGi's neutral pose must not move
    (yls25bV-IZU [00:06:35]). Returns {constraint, position, drift, report}."""
    cmds = _cmds()
    s, m, e = wpos(start), wpos(mid), wpos(end)
    pos = pole_vector_position(s, m, e, distance)
    if _incoming(ctrl, ["offsetParentMatrix"]):
        set_world_matrix(ctrl, m_compose(None, pos), rotate=False)
    else:
        pw = get_matrix(ctrl + ".parentMatrix[0]")
        opm = get_matrix(ctrl + ".offsetParentMatrix")
        dag = m_mult(m_inverse(opm), pw)                        # DAG parent world alone
        cur = world_matrix(ctrl)
        target = m_compose(rot3_normalize(m_rot3(cur)), pos)
        local = get_matrix(ctrl + ".matrix")
        set_matrix(ctrl + ".offsetParentMatrix", m_mult(m_mult(m_inverse(local), target), m_inverse(dag)))
    before = wpos(mid)
    con = cmds.poleVectorConstraint(ctrl, handle)[0]
    drift = v_dist(before, wpos(mid))
    rep = pole_report(s, m, e, wpos(ctrl))
    if drift > tol:
        raise RuntimeError("pole vector drift %.5f cm on %s: pole off the chain plane?" % (drift, mid))
    return {"constraint": con, "position": pos, "drift": drift, "report": rep}


def ik_limb(joints, ik_ctrl, pole_ctrl, name, solver="ikRPsolver", pole_distance=None, orient_end=True,
            own_solver=None, tol=1e-3):
    """RP IK on a three-joint chain, handle under `ik_ctrl`, drift-free pole on `pole_ctrl`,
    end joint orientation from the control (antCGi [00:09:53], maintain offset here since the
    control may be world aligned). Checks that no joint moved. Returns a dict."""
    cmds = _cmds()
    before = {j: world_matrix(j) for j in joints}
    h, eff = ik_handle(joints[0], joints[-1], solver, name=name + "_ikHandle", own_solver=own_solver)
    h = cmds.parent(h, ik_ctrl)[0]
    pv = pole_vector(h, pole_ctrl, joints[0], joints[1], joints[-1], pole_distance, tol)
    oc = cmds.orientConstraint(ik_ctrl, joints[-1], maintainOffset=True)[0] if orient_end else None
    cmds.setAttr(h + ".visibility", 0)
    moved = max(m_max_diff(before[j], world_matrix(j)) for j in joints)
    if moved > tol:
        raise RuntimeError("ik_limb(%s): chain moved by %.5f at rest" % (name, moved))
    return {"handle": h, "effector": eff, "pole": pv, "orient_constraint": oc, "rest_error": moved}


# =========================================================================== FK, IK/FK
def fk_chain(joints, parent=None, shape="circle", size=None, axis="x", drive="direct", suffix="_ctrl",
             lock=("t", "s", "v"), count=None):
    """One control per joint for the first `count` joints (default all: pass joints[:-1] or
    count=len-1 to leave a tip joint without control), hierarchy mirrored.
    drive="direct": control.rotate -> joint.rotate. It is exact because each control's OPM holds
    the joint's rest local matrix (jointOrient and translate) and the rotate orders match
    [added; antCGi wires FK toe controls straight into joints, jXmK0Vl5iYA [00:04:22]].
    drive="constraint": parentConstraint without offset. Returns the controls."""
    cmds = _cmds()
    ctrls = []
    prev = parent
    count = len(joints) if count is None else count
    for i, j in enumerate(joints[:count]):
        if i + 1 < len(joints):
            seg = v_dist(wpos(j), wpos(joints[i + 1]))
        else:
            seg = v_dist(wpos(j), wpos(joints[i - 1])) if i > 0 else 10.0
        c = control(_short(j) + suffix, shape=shape, size=size or 0.35 * seg, axis=axis, match=j, parent=prev,
                    lock=lock, parent_controller=ctrls[-1] if ctrls else None)
        if drive == "direct":
            cmds.connectAttr(c + ".rotate", j + ".rotate", force=True)
        elif drive == "constraint":
            cmds.parentConstraint(c, j, maintainOffset=False)
        else:
            raise ValueError("drive: direct or constraint")
        ctrls.append(c)
        prev = c
    return ctrls


def ikfk_blend(bind, fk, ik, settings, attr="ikFk", method="constraint", constraints_parent=None):
    """Blend the bind joints between the FK and IK chains from `settings.attr` (0 = FK, 1 = IK).
    method="constraint": parentConstraint with two weights (switch and reverse), interpolation
    Shortest (antCGi's flip fix, jXmK0Vl5iYA [00:32:51]); writes TRS, the safe choice for FBX
    export. Constraint nodes move under `constraints_parent` so the bind hierarchy stays joints
    only (antCGi 7R_0omGY-Ms [00:05:04]) [added].
    method="matrix": blendMatrix(fk world, ik world) times the bind parent's inverse into each
    bind joint's offsetParentMatrix, bind TRS and jointOrient zeroed (film and internal rigs;
    verify your exporter before using it on a game skeleton). Returns the created nodes."""
    cmds = _cmds()
    if not cmds.attributeQuery(attr, node=settings, exists=True):
        cmds.addAttr(settings, longName=attr, attributeType="double", minValue=0, maxValue=1, defaultValue=0,
                     keyable=True)
    sw = settings + "." + attr
    rev = cmds.createNode("reverse", name=_short(settings) + "_" + attr + "_rev", skipSelect=True)
    cmds.connectAttr(sw, rev + ".inputX")
    made = {"reverse": rev, "switch": sw, "nodes": []}
    for b, f, k in zip(bind, fk, ik):
        if method == "constraint":
            pc = cmds.parentConstraint(f, k, b, maintainOffset=False)[0]
            w = cmds.parentConstraint(pc, q=True, weightAliasList=True)
            cmds.connectAttr(rev + ".outputX", pc + "." + w[0], force=True)
            cmds.connectAttr(sw, pc + "." + w[1], force=True)
            cmds.setAttr(pc + ".interpType", 2)                    # [verify] 2 = Shortest
            if constraints_parent:
                pc = cmds.parent(pc, constraints_parent)[0]
            made["nodes"].append(pc)
        elif method == "matrix":
            bm = cmds.createNode("blendMatrix", name=_short(b) + "_ikfk_bm", skipSelect=True)
            cmds.connectAttr(f + ".worldMatrix[0]", bm + ".inputMatrix")
            cmds.connectAttr(k + ".worldMatrix[0]", bm + ".target[0].targetMatrix")
            cmds.connectAttr(sw, bm + ".target[0].weight")
            parent = parent_of(b)
            src = bm + ".outputMatrix"
            if parent:
                src = mult_matrix([src, parent + ".worldInverseMatrix[0]"], name=_short(b) + "_ikfk_mm")
            with _Unlocked(b, ["translate", "rotate", "jointOrient"]):
                cmds.setAttr(b + ".translate", 0, 0, 0)
                cmds.setAttr(b + ".rotate", 0, 0, 0)
                cmds.setAttr(b + ".jointOrient", 0, 0, 0)
            cmds.connectAttr(src, b + ".offsetParentMatrix", force=True)
            made["nodes"].append(bm)
        else:
            raise ValueError("method: constraint or matrix")
    return made


def create_meta(name, kind, links=None, data=None):
    """network node as the scene-to-code interface (Bungie U_4u0kbf-JE [00:23:10]): message
    links survive renames and namespaces, JSON holds numbers."""
    cmds = _cmds()
    n = cmds.createNode("network", name=name, skipSelect=True)
    cmds.addAttr(n, longName="mxRigKind", dataType="string")
    cmds.setAttr(n + ".mxRigKind", kind, type="string")
    cmds.addAttr(n, longName="mxData", dataType="string")
    cmds.setAttr(n + ".mxData", json.dumps(data or {}), type="string")
    for key, nodes in (links or {}).items():
        nodes = [nodes] if isinstance(nodes, str) else list(nodes or [])
        cmds.addAttr(n, longName=key, attributeType="message", multi=True)
        for i, node in enumerate(nodes):
            cmds.connectAttr(node + ".message", "%s.%s[%d]" % (n, key, i), force=True)
    return n


def read_meta(meta):
    """{kind, data, <link>: [nodes in index order]} from a create_meta node."""
    cmds = _cmds()
    out = {"data": json.loads(cmds.getAttr(meta + ".mxData") or "{}"), "kind": cmds.getAttr(meta + ".mxRigKind")}
    for a in cmds.listAttr(meta, userDefined=True) or []:
        if a in ("mxData", "mxRigKind") or "." in a or "[" in a:
            continue
        if cmds.attributeQuery(a, node=meta, attributeType=True) != "message":
            continue
        pairs = cmds.listConnections(meta + "." + a, source=True, destination=False, connections=True, plugs=True) or []
        found = []
        for dst, src in zip(pairs[0::2], pairs[1::2]):
            m = re.search(r"\[(\d+)\]$", dst)
            found.append((int(m.group(1)) if m else 0, src.split(".")[0]))
        out[a] = [n for _, n in sorted(found)]
    return out


def ikfk_limb(bind, name, rig_parent=None, ctrl_parent=None, follow="auto", pole_distance=None,
              ik_orient="world", size=None, method="constraint", fk_shape="circle", orient_end=True,
              own_solver=None, extra=(), settings_follow="parent", settings_offset=None):
    """A complete limb from three bind joints (start, mid, end) plus optional `extra` bind joints
    below the end (leg: ball, toe tip for reverse_foot; a last tip joint gets no FK control):
    FK and IK chains under a follow group (never inside the bind skeleton), FK controls, IK
    control (world oriented by default, antCGi 7R_0omGY-Ms [00:06:50]), drift-free pole,
    settings control with `ikFk` (0 FK, 1 IK), bind blend, visibility per mode (antCGi
    yls25bV-IZU [00:01:24]) and a meta node with the rest offsets ikfk_match needs.
    follow="auto" follows the bind start joint's parent.
    settings_follow="parent" (default) keeps the settings control on the limb's parent space:
    an attribute host that follows the joints it drives makes a node-level cycle (Miquel Campos
    measured 20 to 17 ms per frame after moving such hosts out, NfYAaK3wtQs [00:12:51]);
    "end" follows the bind end joint by translation the way antCGi point-constrains his limb
    holders (DO6RztqbwzA [00:22:04]). Legs with reverse_foot: orient_end=False."""
    cmds = _cmds()
    if len(bind) != 3:
        raise ValueError("ikfk_limb takes three bind joints (start, mid, end) plus `extra`")
    chain = list(bind) + list(extra)
    if follow == "auto":
        follow = parent_of(bind[0])
    size = size or 0.3 * v_dist(wpos(bind[0]), wpos(bind[1]))
    jgrp = follow_group(name + "_joints_grp", follow, rig_parent)
    fk = duplicate_chain(chain, "_fk", jgrp)
    ik = duplicate_chain(chain, "_ik", jgrp)
    cgrp = follow_group(name + "_fk_ctrl_grp", follow, ctrl_parent)
    tip = bool(extra) and not cmds.listRelatives(chain[-1], children=True, type="joint")
    fk_ctrls = fk_chain(fk, parent=cgrp, shape=fk_shape, size=size, lock=("t", "s", "v"),
                        count=len(chain) - (1 if tip else 0))
    ik_match = m_compose(None, wpos(bind[2])) if ik_orient == "world" else bind[2]
    ik_ctrl = control(name + "_ik_ctrl", "box", size * 0.6, match=ik_match, parent=ctrl_parent, lock=("s",))
    pv_ctrl = control(name + "_pv_ctrl", "diamond", size * 0.3, match=wpos(bind[1]), parent=ctrl_parent,
                      lock=("r", "s"))
    ikr = ik_limb(ik[:3], ik_ctrl, pv_ctrl, name, pole_distance=pole_distance, orient_end=orient_end,
                  own_solver=own_solver)
    if settings_follow == "end":
        off = settings_offset or v_mul(v_norm(v_sub(wpos(bind[2]), wpos(bind[1]))), size * 0.8)
        spos = v_add(wpos(bind[2]), off)
    else:
        spos = v_add(wpos(bind[0]), settings_offset or (0.0, size * 1.2, 0.0))
    settings = control(name + "_settings_ctrl", "cross", size * 0.3, match=spos, parent=ctrl_parent,
                       lock=("t", "r", "s"))
    if settings_follow == "end":
        follow_with_offset(settings, bind[2], pick=("translate",))
    elif follow:
        follow_with_offset(settings, follow)
    blend = ikfk_blend(chain, fk, ik, settings, "ikFk", method, constraints_parent=jgrp)
    cmds.connectAttr(blend["switch"], ik_ctrl + ".visibility", force=True)
    cmds.connectAttr(blend["switch"], pv_ctrl + ".visibility", force=True)
    cmds.connectAttr(blend["reverse"] + ".outputX", cgrp + ".visibility", force=True)
    for c in (ik_ctrl, pv_ctrl, settings):
        lock_hide(c, ("v",))
    cmds.setAttr(jgrp + ".visibility", 0)
    fk_off = [m_mult(world_matrix(c), m_inverse(world_matrix(j))) for c, j in zip(fk_ctrls, fk)]
    ik_off = m_mult(world_matrix(ik_ctrl), m_inverse(world_matrix(fk[2])))
    meta = create_meta(name + "_ikfk_meta", "ikfk",
                       links={"settings": [settings], "fkControls": fk_ctrls, "fkJoints": fk, "ikJoints": ik,
                              "ikControl": [ik_ctrl], "poleControl": [pv_ctrl], "bindJoints": chain},
                       data={"attr": "ikFk", "fkOffsets": fk_off, "ikOffset": ik_off,
                             "poleDistance": v_dist(wpos(pv_ctrl), wpos(bind[1]))})
    return {"fk": fk, "ik": ik, "fk_ctrls": fk_ctrls, "ik_ctrl": ik_ctrl, "pv_ctrl": pv_ctrl,
            "settings": settings, "meta": meta, "joints_grp": jgrp, "fk_ctrl_grp": cgrp, "ik_solve": ikr,
            "handle": ikr["handle"], "blend": blend, "switch": blend["switch"]}


def match_fk_to_ik(meta):
    """FK controls take the IK pose: control = rest offset * IK joint world (antCGi's Match
    Transformations, 7R_0omGY-Ms [00:02:46], done with the stored offsets)."""
    d = read_meta(meta)
    for c, k, off in zip(d["fkControls"], d["ikJoints"], d["data"]["fkOffsets"]):
        set_world_matrix(c, m_mult(tuple(off), world_matrix(k)), translate=False, rotate=True)


def match_ik_to_fk(meta):
    """IK control to the FK end, pole to the FK chain's own plane (computed, so it works when
    the pole control was moved; antCGi uses a locator under the FK elbow, 7R_0omGY-Ms [00:04:32]).
    A straight FK arm leaves the pole where it is. Returns notes."""
    d = read_meta(meta)
    fk = d["fkJoints"]
    notes = []
    set_world_matrix(d["ikControl"][0], m_mult(tuple(d["data"]["ikOffset"]), world_matrix(fk[2])))
    try:
        p = pole_vector_position(wpos(fk[0]), wpos(fk[1]), wpos(fk[2]), d["data"]["poleDistance"])
        set_world_matrix(d["poleControl"][0], m_compose(None, p), rotate=False)
    except ValueError as exc:
        notes.append("pole kept: %s" % exc)
    return notes


def ikfk_match(meta, to="fk", key=False, time=None):
    """Seamless switch: snap the target mode to the current pose, then set the switch.
    to="fk" matches FK to IK and sets 0; to="ik" matches IK to FK and sets 1. key=True keys
    the matched controls and the switch (stepped) at `time` [added]."""
    cmds = _cmds()
    d = read_meta(meta)
    settings, attr = d["settings"][0], d["data"]["attr"]
    notes = []
    if to == "fk":
        match_fk_to_ik(meta)
        value, ctrls = 0, d["fkControls"]
    elif to == "ik":
        notes = match_ik_to_fk(meta)
        value, ctrls = 1, d["ikControl"] + d["poleControl"]
    else:
        raise ValueError("to: fk or ik")
    cmds.setAttr(settings + "." + attr, value)
    if key:
        for c in ctrls:
            key_channels(c, ("translate", "rotate"), time)
        key_channels(settings, (attr,), time, step=True)
    return notes


# =========================================================================== spaces
def space_switch(ctrl, spaces, attr="space", names=None, default=0, pivots=False, tol=1e-4):
    """Constraint-free space switch (antCGi BFCggv0SV0s): every space is its target matrix times
    an offset captured at rest (so the control keeps its distance: never blend to the space's
    own matrix, it snaps and flips IK [00:05:18]); a blendMatrix selects one with 0/1 weights
    from Equal conditions on an enum [00:11:35] (one condition per target: the master node of
    the video is not needed [added]); the result goes through the DAG parent's inverse into
    the control's offsetParentMatrix. spaces: node names, None = world. pivots=True makes
    antCGi's animatable offset locators under each space [00:06:58]. Control TRS must be zero
    (bake_to_opm first). Returns the nodes."""
    cmds = _cmds()
    if any(abs(v) > 1e-6 for v in cmds.getAttr(ctrl + ".translate")[0] + cmds.getAttr(ctrl + ".rotate")[0]):
        raise RuntimeError("space_switch(%s): translate/rotate not zero, bake_to_opm first" % ctrl)
    names = names or [("world" if s is None else _short(s).replace("_ctrl", "")) for s in spaces]
    rest = world_matrix(ctrl)
    if cmds.attributeQuery(attr, node=ctrl, exists=True):
        raise ValueError("%s.%s exists" % (ctrl, attr))
    cmds.addAttr(ctrl, longName=attr, attributeType="enum", enumName=":".join(names), keyable=True)
    bm = cmds.createNode("blendMatrix", name=_short(ctrl) + "_space_bm", skipSelect=True)
    sources, made = [], {"blendMatrix": bm, "conditions": [], "offsets": [], "pivots": []}
    for s, label in zip(spaces, names):
        if s is None:
            sources.append(rest)
            continue
        if pivots:
            loc = cmds.spaceLocator(name="%s_%s_space_piv" % (_short(ctrl), label))[0]
            loc = cmds.parent(loc, s, relative=True)[0]
            set_matrix(loc + ".offsetParentMatrix", m_mult(rest, m_inverse(world_matrix(s))))
            cmds.setAttr(loc + ".visibility", 0)
            lock_hide(loc, ("s", "v"))
            made["pivots"].append(loc)
            sources.append(loc + ".worldMatrix[0]")
        else:
            off = m_mult(rest, m_inverse(world_matrix(s)))
            made["offsets"].append(off)
            sources.append(mult_matrix([off, s + ".worldMatrix[0]"], name="%s_%s_space_mm" % (_short(ctrl), label)))
    for i, src in enumerate(sources):
        dst = bm + ".inputMatrix" if i == 0 else "%s.target[%d].targetMatrix" % (bm, i - 1)
        if isinstance(src, str):
            cmds.connectAttr(src, dst)
        else:
            set_matrix(dst, src)
        if i > 0:
            cond = cmds.createNode("condition", name="%s_%s_space_cond" % (_short(ctrl), names[i]), skipSelect=True)
            cmds.connectAttr(ctrl + "." + attr, cond + ".firstTerm")
            cmds.setAttr(cond + ".secondTerm", i)
            cmds.setAttr(cond + ".operation", 0)                   # Equal
            cmds.setAttr(cond + ".colorIfTrueR", 1)
            cmds.setAttr(cond + ".colorIfFalseR", 0)
            cmds.connectAttr(cond + ".outColorR", "%s.target[%d].weight" % (bm, i - 1))
            made["conditions"].append(cond)
    parent = parent_of(ctrl)
    out = bm + ".outputMatrix"
    if parent:
        out = mult_matrix([out, parent + ".worldInverseMatrix[0]"], name=_short(ctrl) + "_space_out_mm")
    cmds.setAttr(ctrl + "." + attr, 0)
    cmds.connectAttr(out, ctrl + ".offsetParentMatrix", force=True)
    err = m_max_diff(rest, world_matrix(ctrl))
    if err > tol:
        raise RuntimeError("space_switch(%s): control moved by %.6g at rest" % (ctrl, err))
    if default:
        switch_space(ctrl, default, attr)
    return made


def switch_space(ctrl, value, attr="space", key=False, time=None):
    """Change space without a pop: keep the world matrix, set the enum, re-solve local TRS
    (animator tool behaviour; not in antCGi's video) [added]."""
    cmds = _cmds()
    w = world_matrix(ctrl)
    cmds.setAttr(ctrl + "." + attr, value)
    skipped = set_world_matrix(ctrl, w)
    if key:
        key_channels(ctrl, ("translate", "rotate"), time)
        key_channels(ctrl, (attr,), time, step=True)
    return skipped


# =========================================================================== reverse foot
def foot_pivots_from_mesh(mesh, ankle, ball, toe_end, ground=0.0, band=2.0):
    """Heel, toe tip, inner and outer pivots from the sole of `mesh` [added]: vertices within
    `band` cm of the ground around the foot give the extents along the foot direction (ankle to
    toe, on the ground) and across it; heel and toe sit on the foot's centre line through the
    ball, inner and outer level with the ball, all on the ground. Returns a dict of positions."""
    om = _om()
    sel = om.MSelectionList()
    sel.add(mesh)
    pts = om.MFnMesh(sel.getDagPath(0)).getPoints(om.MSpace.kWorld)
    a, b, t = wpos(ankle), wpos(ball), wpos(toe_end)
    fwd = v_norm((t[0] - a[0], 0.0, t[2] - a[2]))
    side = v_cross((0.0, 1.0, 0.0), fwd)
    base = (b[0], ground, b[2])
    length = v_dist((a[0], 0, a[2]), (t[0], 0, t[2]))
    near = []
    for p in pts:
        if p.y >= ground + band:
            continue
        d = v_sub((p.x, ground, p.z), base)
        f, sd = v_dot(d, fwd), v_dot(d, side)
        if abs(sd) < length and -1.6 * length < f < 1.6 * length:
            near.append((f, sd))
    if not near:
        raise ValueError("no sole vertices within %.1f cm of y=%.1f near %s" % (band, ground, ankle))
    fs = [f for f, _ in near]
    ss = [sd for _, sd in near]
    out_sign = 1.0 if b[0] >= 0 else -1.0             # outer = away from the centre line
    s_out = max(ss) if out_sign > 0 else min(ss)
    s_in = min(ss) if out_sign > 0 else max(ss)
    return {"heel": v_add(base, v_mul(fwd, min(fs))), "toe": v_add(base, v_mul(fwd, max(fs))),
            "inner": v_add(base, v_mul(side, s_in)), "outer": v_add(base, v_mul(side, s_out))}


def reverse_foot(ctrl, leg_handle, ankle, ball, toe_end, name=None, heel=None, toe=None, inner=None,
                 outer=None, ground=0.0, break_angle=25.0, limits=((-40.0, 80.0), (-60.0, 60.0))):
    """antCGi's reverse foot as a node network (jXmK0Vl5iYA): pivots ctrl > outer > inner > heel >
    toe tip > ball (leg handle) and toe tap (toe handle), ball SC handle under the toe tip;
    footRoll with a `break_angle` break, footBank by sign, heelTwist, toeTwist, toeTap; limits
    footRoll -40..80, footBank -60..60 (DO6RztqbwzA [00:24:19]). Pivots are transforms oriented
    to the foot (Y up, Z heel to toe) with their placement in offsetParentMatrix, so all channels
    rest at zero (antCGi [00:09:28]). Positive footBank rolls onto the outer edge [added].
    Missing pivot positions are estimated [added]: pass foot_pivots_from_mesh() instead."""
    cmds = _cmds()
    name = name or _short(ctrl).replace("_ctrl", "")
    a, b, t = wpos(ankle), wpos(ball), wpos(toe_end)
    fwd = v_norm((t[0] - a[0], 0.0, t[2] - a[2]))
    foot_len = v_dist((a[0], 0, a[2]), (t[0], 0, t[2]))
    heel = heel or v_add((a[0], ground, a[2]), v_mul(fwd, -0.25 * foot_len))
    toe = toe or (t[0], ground, t[2])
    side = v_cross((0.0, 1.0, 0.0), fwd)
    out_sign = 1.0 if b[0] >= 0 else -1.0                     # outer = away from the centre line
    inner = inner or v_add((b[0], ground, b[2]), v_mul(side, -out_sign * 0.2 * foot_len))
    outer = outer or v_add((b[0], ground, b[2]), v_mul(side, out_sign * 0.2 * foot_len))
    frame = aim_frame(fwd, (0.0, 1.0, 0.0), "z", "y")

    def pivot(label, pos, parent):
        g = cmds.createNode("transform", name="%s_%s_piv" % (name, label), skipSelect=True)
        g = cmds.parent(g, parent, relative=True)[0]
        set_matrix(g + ".offsetParentMatrix", m_mult(m_compose(frame, pos), m_inverse(world_matrix(parent))))
        return g
    p_out = pivot("outer", outer, ctrl)
    p_in = pivot("inner", inner, p_out)
    p_heel = pivot("heel", heel, p_in)
    p_toe = pivot("toe", toe, p_heel)
    p_ball = pivot("ball", b, p_toe)
    p_tap = pivot("toeTap", b, p_toe)
    ball_h = ik_handle(ankle, ball, "ikSCsolver", name=name + "_ball_ikHandle")[0]
    toe_h = ik_handle(ball, toe_end, "ikSCsolver", name=name + "_toe_ikHandle")[0]
    leg_handle = cmds.parent(leg_handle, p_ball)[0]
    ball_h = cmds.parent(ball_h, p_toe)[0]
    toe_h = cmds.parent(toe_h, p_tap)[0]
    for h in (ball_h, toe_h):
        cmds.setAttr(h + ".visibility", 0)
    (rmin, rmax), (bmin, bmax) = limits
    for ln, lo, hi in (("footRoll", rmin, rmax), ("footBank", bmin, bmax), ("heelTwist", None, None),
                       ("toeTwist", None, None), ("toeTap", None, None)):
        if cmds.attributeQuery(ln, node=ctrl, exists=True):
            continue
        kw = {"longName": ln, "attributeType": "double", "defaultValue": 0.0, "keyable": True}
        if lo is not None:
            kw.update(minValue=lo, maxValue=hi)
        cmds.addAttr(ctrl, **kw)
    roll, bank = ctrl + ".footRoll", ctrl + ".footBank"

    def cond(label, op, first, second, if_true, if_false):
        c = cmds.createNode("condition", name="%s_%s_cond" % (name, label), skipSelect=True)
        cmds.setAttr(c + ".operation", op)
        for slot, v in (("firstTerm", first), ("secondTerm", second), ("colorIfTrueR", if_true),
                        ("colorIfFalseR", if_false)):
            if isinstance(v, str):
                cmds.connectAttr(v, c + "." + slot)
            else:
                cmds.setAttr(c + "." + slot, v)
        return c

    def pma_sub(label, x, y):
        p = cmds.createNode("plusMinusAverage", name="%s_%s_pma" % (name, label), skipSelect=True)
        cmds.setAttr(p + ".operation", 2)                          # subtract
        for i, v in enumerate((x, y)):
            if isinstance(v, str):
                cmds.connectAttr(v, "%s.input1D[%d]" % (p, i))
            else:
                cmds.setAttr("%s.input1D[%d]" % (p, i), v)
        return p + ".output1D"
    GT, LT = 2, 4                                                    # condition operation enum
    c_heel = cond("heel", LT, roll, 0.0, roll, 0.0)
    c_ball = cond("ball", GT, roll, break_angle, pma_sub("ballDown", 2.0 * break_angle, roll), roll)
    c_clamp = cond("ballClamp", LT, c_ball + ".outColorR", 0.0, 0.0, c_ball + ".outColorR")
    c_toe = cond("toe", GT, roll, break_angle, pma_sub("toeUp", roll, break_angle), 0.0)
    cmds.connectAttr(c_heel + ".outColorR", p_heel + ".rotateX")
    cmds.connectAttr(c_clamp + ".outColorR", p_ball + ".rotateX")
    cmds.connectAttr(c_toe + ".outColorR", p_toe + ".rotateX")
    sgn = -1.0 if v_dot(v_sub(outer, inner), frame[0]) > 0 else 1.0
    c_bank = cmds.createNode("condition", name=name + "_bank_cond", skipSelect=True)
    cmds.setAttr(c_bank + ".operation", GT)
    cmds.connectAttr(bank, c_bank + ".firstTerm")
    cmds.setAttr(c_bank + ".secondTerm", 0.0)
    cmds.connectAttr(bank, c_bank + ".colorIfTrueR")
    cmds.setAttr(c_bank + ".colorIfFalseR", 0.0)
    cmds.setAttr(c_bank + ".colorIfTrueG", 0.0)
    cmds.connectAttr(bank, c_bank + ".colorIfFalseG")
    md = cmds.createNode("multiplyDivide", name=name + "_bank_md", skipSelect=True)
    cmds.connectAttr(c_bank + ".outColorR", md + ".input1X")
    cmds.connectAttr(c_bank + ".outColorG", md + ".input1Y")
    cmds.setAttr(md + ".input2X", sgn)
    cmds.setAttr(md + ".input2Y", sgn)
    cmds.connectAttr(md + ".outputX", p_out + ".rotateZ")
    cmds.connectAttr(md + ".outputY", p_in + ".rotateZ")
    cmds.connectAttr(ctrl + ".heelTwist", p_heel + ".rotateY")
    cmds.connectAttr(ctrl + ".toeTwist", p_toe + ".rotateY")
    md_tap = cmds.createNode("multiplyDivide", name=name + "_toeTap_md", skipSelect=True)
    cmds.connectAttr(ctrl + ".toeTap", md_tap + ".input1X")
    cmds.setAttr(md_tap + ".input2X", -1.0)                      # positive toeTap lifts the toes
    cmds.connectAttr(md_tap + ".outputX", p_tap + ".rotateX")
    for p in (p_out, p_in, p_heel, p_toe, p_ball, p_tap):
        lock_hide(p, ("t", "s", "v"))
    return {"pivots": {"outer": p_out, "inner": p_in, "heel": p_heel, "toe": p_toe, "ball": p_ball, "toeTap": p_tap},
            "handles": {"leg": leg_handle, "ball": ball_h, "toe": toe_h}, "bank_sign": sgn,
            "positions": {"heel": heel, "toe": toe, "inner": inner, "outer": outer, "ball": b}}


# =========================================================================== lockdown
def _descendants(root, types=("transform",)):
    cmds = _cmds()
    out = cmds.listRelatives(root, allDescendents=True, type=list(types), fullPath=True) or []
    return [root] + out if cmds.objectType(root, isAType="transform") else out


def find_controls(root=None):
    """Controller-tagged transforms under `root`, else transforms with a NURBS curve shape that
    have a keyable unlocked channel."""
    cmds = _cmds()
    scope = _descendants(root) if root else (cmds.ls(type="transform", long=True) or [])
    tagged = [n for n in scope if cmds.listConnections(n + ".message", s=False, d=True, type="controller")]
    if tagged:
        return tagged
    return [n for n in scope if cmds.listRelatives(n, shapes=True, type="nurbsCurve")
            and cmds.listAttr(n, keyable=True, unlocked=True)]


def lockdown(root, controls=None, keep_hidden=()):
    """Lock and hide every keyable channel on every DAG node under `root` that is not a control:
    groups, IK handles, pivots, reverse foot nodes, locators (antCGi DO6RztqbwzA [00:13:18]:
    animators select the hierarchy and key all). Returns the nodes locked."""
    cmds = _cmds()
    controls = set(cmds.ls(controls or find_controls(root), long=True) or [])
    keep_hidden = set(cmds.ls(list(keep_hidden), long=True) or [])
    locked = []
    for n in cmds.ls(_descendants(root, ("transform",)), long=True) or []:
        if n in controls or n in keep_hidden or cmds.referenceQuery(n, isNodeReferenced=True):
            continue
        attrs = set(cmds.listAttr(n, keyable=True) or []) | {"tx", "ty", "tz", "rx", "ry", "rz", "sx", "sy", "sz", "v"}
        lock_hide(n, sorted(attrs))
        locked.append(n)
    return locked


def lockdown_audit(root, controls=None, allowed=None):
    """Non-controls under `root` with keyable unlocked channels, and controls exposing channels
    outside `allowed` ({control: [attrs]}). Empty lists = locked down."""
    cmds = _cmds()
    controls = set(cmds.ls(controls or find_controls(root), long=True) or [])
    open_internal, extra = {}, {}
    for n in cmds.ls(_descendants(root, ("transform",)), long=True) or []:
        ka = cmds.listAttr(n, keyable=True, unlocked=True) or []
        if n in controls:
            if allowed and _short(n) in allowed:
                bad = [a for a in ka if a not in allowed[_short(n)]]
                if bad:
                    extra[n] = bad
        elif ka:
            open_internal[n] = ka
    return {"open_internal": open_internal, "control_extra": extra}


# =========================================================================== checks
def eval_census(root=None):
    """What makes a rig evaluate serially or rebuild its graph (Fragapane _0mb4wIZi80; Using
    Parallel Maya 2027): expressions (Globally Serial; untrusted when they query the scene),
    Python plug-in nodes (Globally Serial by default), script nodes, the ikSystem evaluator
    (multi-chain IK), FBIK, legacy dynamics, driven frozen/nodeState, animatable visibility,
    deep attribute hosts (Miquel Campos NfYAaK3wtQs [00:12:51])."""
    cmds = _cmds()
    rep = {"errors": [], "warnings": [], "info": []}
    try:
        rep["evaluation_mode"] = cmds.evaluationManager(q=True, mode=True)
    except Exception as exc:
        rep["evaluation_mode"] = "unknown: %s" % exc
    for e in cmds.ls(type="expression") or []:
        body = cmds.expression(e, q=True, string=True) or ""
        hits = sorted(set(UNTRUSTED_EXPR.findall(body)))
        if hits:
            rep["errors"].append("expression %s calls %s: untrusted, stalls parallel evaluation; rewrite as nodes"
                                 % (e, ", ".join(hits)))
        else:
            rep["info"].append("expression %s: pure, Globally Serial (about 43 us each, Fragapane)" % e)
        if cmds.objExists(e + ".animated") and cmds.getAttr(e + ".animated") == 1 and not hits:
            rep["info"].append("expression %s: animated=1; set 0 if it has no side effects (invisibility evaluator)" % e)
    for p in cmds.pluginInfo(q=True, listPlugins=True) or []:
        try:
            path = cmds.pluginInfo(p, q=True, path=True) or ""
            if path.endswith(".py"):
                for t in cmds.pluginInfo(p, q=True, dependNode=True) or []:
                    n = cmds.ls(type=t) or []
                    if n:
                        rep["warnings"].append("%d node(s) of Python plug-in type %s: Globally Serial by default, "
                                               "one can serialize the rig" % (len(n), t))
        except Exception:
            continue
    for s in cmds.ls(type="script") or []:
        if s not in STANDARD_SCRIPT_NODES:
            rep["warnings"].append("script node %s" % s)
    if cmds.ls(type="ikMCsolver"):
        rep["warnings"].append("ikMCsolver present: the ikSystem evaluator disables the Evaluation Manager")
    fbik = [t for t in (cmds.allNodeTypes() or []) if "fbik" in t.lower()]
    for t in fbik:
        if cmds.ls(type=t):
            rep["warnings"].append("FBIK nodes (%s): FBIK forces Serial; use HumanIK" % t)
    for t in LEGACY_DYNAMICS:
        try:
            if cmds.ls(type=t):
                rep["warnings"].append("legacy dynamics %s: forces DG around it" % t)
        except Exception:
            pass
    scope = cmds.ls(_descendants(root), long=True) if root else cmds.ls(dag=True, long=True)
    for n in scope or []:
        for a in ("frozen", "nodeState"):
            if cmds.objExists(n + "." + a) and cmds.listConnections(n + "." + a, s=True, d=False):
                rep["errors"].append("%s.%s is driven: never animate frozen/nodeState (EG rebuilds or ignored)" % (n, a))
        if cmds.objExists(n + ".visibility") and cmds.listConnections(n + ".visibility", s=True, d=False):
            rep["info"].append("%s.visibility is driven: invisibility evaluator only skips static visibility" % n)
    if root:
        ctrls = set(cmds.ls(find_controls(root), long=True) or [])
        base = cmds.ls(root, long=True)[0].count("|")
        for n in cmds.ls(_descendants(root), long=True) or []:
            user = cmds.listAttr(n, userDefined=True, keyable=True) or []
            open_attrs = set(cmds.listAttr(n, keyable=True, unlocked=True) or [])
            trs_open = [a for a in ("translateX", "translateY", "translateZ", "rotateX", "rotateY", "rotateZ")
                        if a in open_attrs]
            if user and not trs_open and n in ctrls and n.count("|") - base > 4:
                rep["warnings"].append("attribute host %s is %d levels deep: parent it near the root (Miquel Campos: "
                                       "20 to 17 ms per frame)" % (_short(n), n.count("|") - base))
        rep["curves"] = curve_census(sorted(ctrls))
        cc = rep["curves"]
        if cc["controls"] and not cc["animated"]:
            rep["info"].append("no animated curves on the %d controls: the Evaluation Graph leaves static curves out, "
                               "so profile only after R.rom_keys (Fragapane: a handful of curves per component)"
                               % cc["controls"])
        if cc["static"]:
            rep["info"].append("%d static curves: excluded from the graph, the first differing key rebuilds it; "
                               "controller tags plus Include controllers in evaluation graph, or "
                               "R.prepare_eval_graph()" % len(cc["static"]))
    rep["evaluators"] = evaluator_state()
    return rep


def curve_census(controls):
    """Time curves on `controls`: animated (keys differ), static (all keys equal: left out of the
    Evaluation Graph, first differing key invalidates it), unkeyed (Using Parallel Maya 2027, Graph
    Invalidation; Fragapane _0mb4wIZi80 [00:20:14] [01:16:10])."""
    cmds = _cmds()
    out = {"controls": 0, "animated": [], "static": [], "unkeyed": []}
    for c in cmds.ls(controls or [], long=True) or []:
        out["controls"] += 1
        curves = [x for x in (cmds.listConnections(c, s=True, d=False, type="animCurve") or [])
                  if cmds.nodeType(x).startswith("animCurveT")]
        if not curves:
            out["unkeyed"].append(_short(c))
        for crv in curves:
            vals = cmds.keyframe(crv, q=True, valueChange=True) or []
            (out["static"] if curve_is_static(vals) else out["animated"]).append(crv)
    return out


def evaluator_state():
    """Evaluation mode and custom evaluators of this session (evaluator state is per session, not
    saved in the scene; the frozen evaluator options persist in prefs). [verify query forms]"""
    cmds = _cmds()
    st = {}
    try:
        st["mode"] = cmds.evaluationManager(q=True, mode=True)
    except Exception as exc:
        st["mode"] = "unknown: %s" % exc
    try:
        names = cmds.evaluator(q=True) or []
        st["available"] = names
        st["enabled"] = {n: bool(cmds.evaluator(name=n, q=True, enable=True)) for n in names}
    except Exception as exc:
        st["error"] = str(exc)
    return st


def prepare_eval_graph(controls=None, root=None, force="controller"):
    """Keep first keys and manipulation from rebuilding the Evaluation Graph (Using Parallel Maya
    2027, Reduce Graph Rebuild and Curve Manager Evaluator): tag every control as a controller (saved
    in the file; the animator's Preferences > Settings > Animation > Include controllers in
    evaluation graph then prepopulates it), and for this session enable the curve manager with
    forceAnimatedCurves=`force` (none, controller, keyed, all). Returns what was done."""
    cmds = _cmds()
    ctrls = cmds.ls(controls or find_controls(root), long=True) or []
    tagged = [c for c in ctrls if not cmds.listConnections(c + ".message", s=False, d=True, type="controller")]
    for c in tagged:
        tag_controller(c)
    rep = {"tagged": [_short(c) for c in tagged], "controls": len(ctrls)}
    try:
        cmds.evaluator(name="curveManager", enable=True)
        cmds.evaluator(name="curveManager", configuration="forceAnimatedCurves=%s" % force)
        rep["curveManager"] = force
    except Exception as exc:
        rep["curveManager"] = "error: %s" % exc
    return rep


def _gpu_vendor():
    """'amd' or 'nvidia' from the OpenGL/Metal vendor string when the session has one [verify]."""
    cmds = _cmds()
    try:
        v = " ".join(str(x) for x in (cmds.ogs(deviceInformation=True) or [])).lower()
    except Exception:
        v = ""
    if "amd" in v or "radeon" in v or "ati " in v:
        return "amd"
    if "nvidia" in v:
        return "nvidia"
    return None


def gpu_override_census(meshes=None, vendor=None, min_verts=None):
    """Headless GPU Override eligibility per deformed mesh (Using Parallel Maya 2027, GPU
    Override): vertex count vs threshold, node types in the deformation chain, animated exclusion
    attributes, deformers shared by several geometries, legacy smooth preview, back-face culling,
    polySmoothFace divisions, tweak mode; plus the 2027.2 scrubbing crash and the Apple GPU gap.
    The GUI truth is the Evaluation HUD (a non-zero k count) and `deformerEvaluator -meshes`,
    which this adds when the session answers it. vendor None: the stricter NVIDIA threshold unless
    the device says AMD. Attribute and type names are [verify]. Returns {meshes, notes}."""
    cmds = _cmds()
    env = os.environ.get("MAYA_OPENCL_DEFORMER_MIN_VERTS")
    if min_verts is None and env not in (None, ""):
        try:
            min_verts = int(env)
        except ValueError:
            pass
    vendor = vendor or _gpu_vendor() or "nvidia"
    if meshes is None:
        meshes = [m for m in (cmds.ls(type="mesh", noIntermediate=True, long=True) or [])
                  if any("geometryFilter" in (cmds.nodeType(h, inherited=True) or [])
                         for h in (cmds.listHistory(m, pruneDagObjects=True) or []))]
    rows, owners = {}, {}
    for m in meshes:
        shape = m if cmds.nodeType(m) == "mesh" else (cmds.listRelatives(m, shapes=True, noIntermediate=True,
                                                                          fullPath=True) or [m])[0]
        hist = cmds.listHistory(shape, pruneDagObjects=True) or []
        chain, animated, divisions, relative, multi = [], [], 0, True, False
        for h in hist:
            inh = cmds.nodeType(h, inherited=True) or []
            if not ("geometryFilter" in inh or "polyBase" in inh):
                continue
            t = cmds.nodeType(h)
            chain.append(t)
            for a in GPU_ANIMATED_EXCLUSIONS.get(t, ()) + GPU_ANIMATED_EXCLUSIONS["*"]:
                if cmds.objExists(h + "." + a) and cmds.listConnections(h + "." + a, s=True, d=False):
                    animated.append((t, a))
            if t == "polySmoothFace" and cmds.objExists(h + ".divisions"):
                divisions = cmds.getAttr(h + ".divisions")
            if t == "tweak" and cmds.objExists(h + ".relativeTweak"):
                relative = bool(cmds.getAttr(h + ".relativeTweak"))
            if "geometryFilter" in inh:
                try:
                    geos = cmds.deformer(h, q=True, geometry=True) or []
                except Exception:
                    geos = []
                if len(geos) > 1:
                    multi = True
                    owners.setdefault(h, set()).update(geos)
        smooth = cmds.getAttr(shape + ".displaySmoothMesh") if cmds.objExists(shape + ".displaySmoothMesh") else 0
        # smoothDrawType 0 taken as legacy Maya Catmull-Clark [verify enum]
        legacy = bool(smooth) and cmds.objExists(shape + ".smoothDrawType") and cmds.getAttr(shape + ".smoothDrawType") == 0
        cull = cmds.getAttr(shape + ".backfaceCulling") if cmds.objExists(shape + ".backfaceCulling") else 0
        verts = cmds.polyEvaluate(shape, vertex=True)
        rep = gpu_eligibility(verts, chain, vendor, min_verts, animated, multi, legacy, bool(cull), divisions, relative)
        rep.update({"vertices": verts, "chain": chain})
        rows[_short(shape)] = rep
    notes = []
    for d, geos in owners.items():
        shorts = [_short(g) for g in geos]
        if any(not rows.get(s, {"eligible": True})["eligible"] for s in shorts):
            notes.append("deformer %s drives %s: one CPU-bound geometry keeps them all on the CPU" % (_short(d), shorts))
    try:
        ver = cmds.about(version=True)
        if str(ver).startswith("2027.2"):
            notes.append("Maya 2027.2 known issue: crash when scrubbing with GPU Override on (MAYA-141895); disable "
                         "GPU Override or the invisibility evaluator while scrubbing")
        if cmds.about(macOS=True):
            notes.append("macOS: the paper describes OpenCL on AMD and NVIDIA only; read the HUD before counting on "
                         "GPU Override here [verify]")
    except Exception:
        pass
    try:
        rep = cmds.deformerEvaluator(meshes=True)
        notes.append("deformerEvaluator -meshes: %s" % (rep,))
    except Exception as exc:
        notes.append("deformerEvaluator -meshes unavailable here (needs a VP2 session): %s" % exc)
    return {"meshes": rows, "notes": notes, "vendor": vendor}


def _skin_influences():
    cmds = _cmds()
    out = set()
    for sc in cmds.ls(type="skinCluster") or []:
        out.update(cmds.ls(cmds.skinCluster(sc, q=True, influence=True) or [], long=True) or [])
    return out


def _solver_of(handle):
    """Solver node of an IK handle: its ikSolver input [verify attribute name], else the query."""
    cmds = _cmds()
    try:
        s = cmds.listConnections(handle + ".ikSolver", s=True, d=False) or []
        if s:
            return s[0]
    except Exception:
        pass
    try:
        return cmds.ikHandle(handle, q=True, solver=True)
    except Exception:
        return None


def opm_audit(root=None, nodes=None, tol=1e-3):
    """The offsetParentMatrix composition rule, checked at rest: world = local * OPM * dagParentWorld
    (2027 transform node). doubled: a connected OPM while translate, rotate or jointOrient still
    hold values (the drive already carries the placement, so they apply twice: MLC JOYMV-bQdlM
    [00:10:27], antCGi's backwards leg yls25bV-IZU [00:18:08]). world_into_parent: a worldMatrix
    plug connected straight into the OPM of a node that has a DAG parent and inherits transforms
    (right only if that parent never moves; multiply by its worldInverseMatrix, or feed `.matrix`
    for a relative drive, MLC [00:09:15]). Returns {doubled, world_into_parent}."""
    cmds = _cmds()
    scope = cmds.ls(nodes, long=True) if nodes else cmds.ls(_descendants(root) if root else
                                                            cmds.ls(type="transform", long=True), long=True)
    out = {"doubled": {}, "world_into_parent": {}}
    for n in scope or []:
        src = cmds.listConnections(n + ".offsetParentMatrix", s=True, d=False, plugs=True) or []
        if not src:
            continue
        vals = {"translate": cmds.getAttr(n + ".translate")[0], "rotate": cmds.getAttr(n + ".rotate")[0]}
        if is_joint(n):
            vals["jointOrient"] = cmds.getAttr(n + ".jointOrient")[0]
        left = {k: [round(x, 4) for x in v] for k, v in vals.items() if any(abs(x) > tol for x in v)}
        if left:
            out["doubled"][_short(n)] = left
        parent = parent_of(n)
        if parent and cmds.getAttr(n + ".inheritsTransform") and any(".worldMatrix" in s for s in src):
            out["world_into_parent"][_short(n)] = src[0]
    return out


def rig_check(root=None, joints=None, controls=None, tol=1e-3):
    """The rig gate. Joints (default: skin influences, else every joint under root): non-zero
    rotate or rotateAxis at rest, children not on an aim axis (missing or stale orient), end
    joints with an orient, scale, duplicate names, several roots. Controls: unfrozen values
    (translate/rotate not zero, scale not one: values belong in offsetParentMatrix), missing
    controller tag. IK: RP handles without a pole, shared solvers. Evaluation: eval_census.
    Lockdown: lockdown_audit. Keys on non-controls. Returns {ok, errors, warnings, info, ...}."""
    cmds = _cmds()
    rep = {"errors": [], "warnings": [], "info": []}
    rep["units"] = cmds.currentUnit(q=True, linear=True)
    if rep["units"] != "cm":
        rep["warnings"].append("linear unit is %s, rigs here assume cm" % rep["units"])
    if joints is None:
        infl = _skin_influences()
        scope = cmds.ls(_descendants(root, ("joint",)), type="joint", long=True) if root else cmds.ls(type="joint", long=True)
        joints = [j for j in scope or [] if not infl or j in infl]
    joints = cmds.ls(joints, long=True) or []
    jrep = {"count": len(joints), "non_zero_rotation": [], "non_zero_rotate_axis": [], "missing_orient": [],
            "world_oriented": [], "end_orient": [], "scaled": [], "opm_driven": [], "primary_axes": {}}
    for j in joints:
        s = _short(j)
        opm = get_matrix(j + ".offsetParentMatrix")
        if m_max_diff(opm, m_identity()) > 1e-6:
            jrep["opm_driven"].append(s)
        r = cmds.getAttr(j + ".rotate")[0]
        if any(abs(v) > tol for v in r):
            jrep["non_zero_rotation"].append((s, [round(v, 4) for v in r]))
        ra = cmds.getAttr(j + ".rotateAxis")[0]
        if any(abs(v) > tol for v in ra):
            jrep["non_zero_rotate_axis"].append((s, [round(v, 4) for v in ra]))
        sc = cmds.getAttr(j + ".scale")[0]
        if any(abs(v - 1.0) > tol for v in sc):
            jrep["scaled"].append((s, [round(v, 4) for v in sc]))
        kids = cmds.listRelatives(j, children=True, type="joint", fullPath=True) or []
        if not kids:
            jo = cmds.getAttr(j + ".jointOrient")[0]
            if any(abs(v) > tol for v in jo):
                jrep["end_orient"].append(s)
            continue
        aimed = None
        for k in kids:
            t = cmds.getAttr(k + ".translate")[0]
            length = v_len(t)
            if length < 1e-6:
                continue
            ax = max(range(3), key=lambda i: abs(t[i]))
            off = math.sqrt(sum(t[i] ** 2 for i in range(3) if i != ax))
            if off / length < 1e-3:
                aimed = ("-" if t[ax] < 0 else "") + "xyz"[ax]
                break
        if aimed:
            jrep["primary_axes"][aimed] = jrep["primary_axes"].get(aimed, 0) + 1
        elif m3_max_diff(rot3_normalize(m_rot3(world_matrix(j))), m3_identity()) < 1e-4:
            jrep["world_oriented"].append(s)
        elif s not in jrep["opm_driven"]:
            jrep["missing_orient"].append(s)
    rep["joints"] = jrep
    for s, v in jrep["non_zero_rotation"]:
        rep["errors"].append("joint %s has rotation %s at rest: freeze into jointOrient" % (s, v))
    for s, v in jrep["non_zero_rotate_axis"]:
        rep["warnings"].append("joint %s has rotateAxis %s: fold it into jointOrient (joint -e -zso)" % (s, v))
    for s in jrep["missing_orient"]:
        rep["errors"].append("joint %s does not aim any child along an axis: orientation missing or stale" % s)
    if len([a for a in jrep["primary_axes"] if jrep["primary_axes"][a] > 0]) > 1:
        rep["info"].append("mixed aim axes %s (fine if intended, e.g. world-oriented spine joints)" % jrep["primary_axes"])
    for s in jrep["end_orient"]:
        rep["info"].append("end joint %s has a jointOrient (usually zeroed to match its parent)" % s)
    for s, v in jrep["scaled"]:
        rep["warnings"].append("joint %s scale %s at rest" % (s, v))
    shorts = [_short(j) for j in (cmds.ls(type="joint", long=True) or [])]
    dups = sorted(set(n for n in shorts if shorts.count(n) > 1))
    if dups:
        rep["errors"].append("duplicate joint names %s (engine export errors, antCGi fGacyVzJGIU [00:17:15])" % dups)
    tops = [j for j in joints if not cmds.listRelatives(j, parent=True, type="joint")]
    rep["joint_roots"] = [_short(j) for j in tops]
    if len(tops) > 1:
        rep["warnings"].append("%d skeleton roots %s: a game skeleton needs one" % (len(tops), rep["joint_roots"][:6]))
    # controls
    ctrls = cmds.ls(controls if controls is not None else find_controls(root), long=True) or []
    crep = {"count": len(ctrls), "unfrozen": [], "untagged": []}
    for c in ctrls:
        t = cmds.getAttr(c + ".translate")[0]
        r = cmds.getAttr(c + ".rotate")[0]
        s = cmds.getAttr(c + ".scale")[0]
        if any(abs(v) > tol for v in t + r) or any(abs(v - 1.0) > tol for v in s):
            crep["unfrozen"].append((_short(c), [round(v, 3) for v in t + r + s]))
        if not cmds.listConnections(c + ".message", s=False, d=True, type="controller"):
            crep["untagged"].append(_short(c))
    rep["controls"] = crep
    for c, v in crep["unfrozen"]:
        rep["errors"].append("control %s is not at zero %s: move the values into offsetParentMatrix" % (c, v))
    if crep["untagged"]:
        rep["warnings"].append("%d controls not tagged as controllers: %s" % (len(crep["untagged"]), crep["untagged"][:8]))
    # IK
    handles = cmds.ls(type="ikHandle") or []
    shared = {}
    for h in handles:
        solver = _solver_of(h)
        stype = cmds.nodeType(solver) if solver and cmds.objExists(solver) else None
        if stype == "ikRPsolver" and not cmds.listConnections(h, type="poleVectorConstraint", s=True, d=False):
            rep["warnings"].append("RP handle %s has no pole vector control (Fragapane: almost always give one)" % h)
        if solver:
            shared.setdefault(solver, []).append(h)
    mine = set(cmds.ls(_descendants(root, ("ikHandle",)), long=True) or []) if root else set()
    rep["solvers"] = {}
    for s, hs in shared.items():
        hs_long = set(cmds.ls(hs, long=True) or [])
        inside, outside = hs_long & mine, hs_long - mine
        rep["solvers"][_short(s)] = len(hs)
        if root and inside and outside:
            rep["errors"].append("solver %s drives handles inside and outside %s: two characters share one solver node "
                                 "(Fragapane: 'can make a mess'); give each character its own (own_solver=)" % (s, root))
        elif root and inside and _short(s).split(":")[-1] in DEFAULT_SOLVERS:
            rep["warnings"].append("%d handles under %s use the scene-wide %s: referenced characters share it; "
                                   "create a per-character solver (ikfk_limb/ik_handle own_solver=)"
                                   % (len(inside), root, _short(s)))
        elif len(hs) > 1:
            rep["info"].append("solver %s shared by %d handles" % (s, len(hs)))
    # offsetParentMatrix composition
    oa = opm_audit(root=root) if root else opm_audit(nodes=joints)
    rep["opm"] = oa
    for n, v in oa["doubled"].items():
        rep["errors"].append("%s: offsetParentMatrix is connected but %s remain; zero them (world = local * OPM * "
                             "parent), or they apply twice" % (n, v))
    for n, s in oa["world_into_parent"].items():
        rep["warnings"].append("%s: %s feeds its offsetParentMatrix under a DAG parent: double transform when the "
                               "parent moves; multiply by the parent's worldInverseMatrix or feed .matrix" % (n, s))
    # evaluation
    ev = eval_census(root)
    rep["evaluation"] = ev
    rep["errors"] += ev["errors"]
    rep["warnings"] += ev["warnings"]
    rep["info"] += ev["info"][:40]
    # lockdown and keys
    if root:
        la = lockdown_audit(root, ctrls)
        rep["lockdown"] = {k: {_short(n): v for n, v in d.items()} for k, d in la.items()}
        if la["open_internal"]:
            rep["warnings"].append("%d non-control nodes under %s have keyable unlocked channels (run lockdown)"
                                   % (len(la["open_internal"]), root))
        keyed = []
        ctrl_set = set(ctrls)
        for n in cmds.ls(_descendants(root), long=True) or []:
            if n in ctrl_set:
                continue
            curves = cmds.listConnections(n, s=True, d=False, type="animCurve") or []
            if [c for c in curves if cmds.nodeType(c).startswith("animCurveT")]:
                keyed.append(_short(n))
        if keyed:
            rep["warnings"].append("time keys on non-controls: %s" % keyed[:10])
    rep["ok"] = not rep["errors"]
    return rep


def neutral_switch_test(switch_plug, joints, values=(0.0, 1.0)):
    """Max world-matrix difference of `joints` between two switch values at rest: antCGi's
    zero-pop IK/FK rule (yls25bV-IZU [00:09:19]). Restores the switch."""
    cmds = _cmds()
    old = cmds.getAttr(switch_plug)
    try:
        cmds.setAttr(switch_plug, values[0])
        a = [world_matrix(j) for j in joints]
        cmds.setAttr(switch_plug, values[1])
        b = [world_matrix(j) for j in joints]
    finally:
        cmds.setAttr(switch_plug, old)
    return max(m_max_diff(x, y) for x, y in zip(a, b))


def blend_sweep_test(switch_plug, joints, steps=10, values=(0.0, 1.0), slack_deg=1.0, slack_ratio=0.05):
    """Mid-blend flip test: pose FK and IK apart first (e.g. FK elbow bent, IK hand moved), then
    sweep the switch in `steps` and compare each joint's rotation path with the direct angle
    between the two ends. A flip or a long-way blend makes the path longer than the direct angle
    (antCGi's toes flipping mid-blend, jXmK0Vl5iYA [00:32:51]: Shortest fixes it on
    method="constraint"; method="matrix" blends through blendMatrix, whose rotation interpolation
    the notes do not document, so run this on both). Tolerances [added]. Restores the switch.
    Returns {ok, joints: {name: {path, direct, max_step}}}."""
    cmds = _cmds()
    old = cmds.getAttr(switch_plug)
    samples = {j: [] for j in joints}
    try:
        for i in range(steps + 1):
            cmds.setAttr(switch_plug, values[0] + (values[1] - values[0]) * i / float(steps))
            for j in joints:
                samples[j].append(rot3_normalize(m_rot3(world_matrix(j))))
    finally:
        cmds.setAttr(switch_plug, old)
    out, ok = {}, True
    for j, rots in samples.items():
        path, direct, st = rotation_path(rots)
        bad = path > direct + max(slack_deg, slack_ratio * direct)
        ok = ok and not bad
        out[_short(j)] = {"path": round(path, 3), "direct": round(direct, 3), "max_step": round(max(st or [0.0]), 3),
                          "flip": bad}
    return {"ok": ok, "joints": out}


def space_test(ctrl, attr, spaces, offset=(10.0, 0.0, 0.0)):
    """For every enum value, move each space control by `offset` and record how far `ctrl`
    moves: the selected space must carry it by |offset|, world and unrelated spaces by 0
    (spaces that are ancestors of the selected one are skipped). Returns rows."""
    cmds = _cmds()
    old = cmds.getAttr(ctrl + "." + attr)
    rows = []
    movers = [s for s in spaces if s]
    try:
        for i, sel in enumerate(spaces):
            cmds.setAttr(ctrl + "." + attr, i)
            for s in movers:
                if sel and s != sel and cmds.ls(sel, long=True)[0].startswith(cmds.ls(s, long=True)[0] + "|"):
                    continue
                p0 = wpos(ctrl)
                t0 = cmds.getAttr(s + ".translate")[0]
                with _Unlocked(s, ["translate"]):
                    cmds.setAttr(s + ".translate", *v_add(t0, offset))
                    moved = v_dist(p0, wpos(ctrl))
                    cmds.setAttr(s + ".translate", *t0)
                rows.append({"space": i, "moved_space": _short(s), "moved": moved,
                             "expected": v_len(offset) if s == sel else 0.0})
    finally:
        cmds.setAttr(ctrl + "." + attr, old)
    return rows


def scale_test(root_ctrl, joints, factor=1.6):
    """Scale the root control and compare every joint with a uniform scale about the control's
    pivot (antCGi DO6RztqbwzA: test 1.24 and 1.6 in neutral and stretched poses). Returns the
    max error in cm divided by the factor, per joint dict too."""
    cmds = _cmds()
    pivot = wpos(root_ctrl)
    before = {j: wpos(j) for j in joints}
    old = cmds.getAttr(root_ctrl + ".scale")[0]
    errs = {}
    with _Unlocked(root_ctrl, ["scale"]):
        try:
            cmds.setAttr(root_ctrl + ".scale", factor, factor, factor)
            for j in joints:
                want = v_add(pivot, v_mul(v_sub(before[j], pivot), factor))
                errs[_short(j)] = v_dist(want, wpos(j)) / factor
        finally:
            cmds.setAttr(root_ctrl + ".scale", *old)
    return {"max_error": max(errs.values()) if errs else 0.0, "per_joint": errs}


def mesh_points(mesh, space="world"):
    om = _om()
    sel = om.MSelectionList()
    sel.add(mesh)
    sp = om.MSpace.kWorld if space == "world" else om.MSpace.kObject
    return [(p.x, p.y, p.z) for p in om.MFnMesh(sel.getDagPath(0)).getPoints(sp)]


def precision_test(top, meshes, distances=(1e3, 1e5, 1e6), rotate=(180.0, 0.0, 0.0)):
    """Fragapane's test (rfLEBgOEW1A [01:41:55] to [01:53:38]): move the rig's top node far from
    the origin and upside down, bring the deformed points back into the top node's space and
    measure the deviation from the rest case. Skinned meshes hold float32 world points, so
    deviation grows with distance; gate at the distance the shots actually use [added].
    Returns {distance: max deviation cm}."""
    cmds = _cmds()
    rest_top = world_matrix(top)
    inv = m_inverse(rest_top)
    ref = {m: [m_point(p, inv) for p in mesh_points(m)] for m in meshes}
    t0 = cmds.getAttr(top + ".translate")[0]
    r0 = cmds.getAttr(top + ".rotate")[0]
    out = {}
    with _Unlocked(top, ["translate", "rotate"]):
        try:
            for d in distances:
                cmds.setAttr(top + ".translate", d, t0[1], t0[2])
                cmds.setAttr(top + ".rotate", *rotate)
                inv_now = m_inverse(world_matrix(top))
                dev = 0.0
                for m in meshes:
                    for a, p in zip(ref[m], mesh_points(m)):
                        dev = max(dev, v_dist(a, m_point(p, inv_now)))
                out[d] = dev
        finally:
            cmds.setAttr(top + ".translate", *t0)
            cmds.setAttr(top + ".rotate", *r0)
    return out


def eval_ab(joints, meshes=(), frames=(1, 12, 24), modes=("off", "serial", "parallel"), tol=1e-5):
    """Make it right before fast (Using Parallel Maya 2027): sample deform joint world matrices
    and mesh points in DG, EM Serial and EM Parallel and diff them against the first mode.
    Restores the mode. Whether mayapy runs the Evaluation Manager is [verify]."""
    cmds = _cmds()
    try:
        orig = cmds.evaluationManager(q=True, mode=True)
        orig = orig[0] if isinstance(orig, (list, tuple)) else orig
    except Exception:
        orig = None
    samples, active = {}, {}
    try:
        for mode in modes:
            try:
                cmds.evaluationManager(mode=mode)
                active[mode] = cmds.evaluationManager(q=True, mode=True)
            except Exception as exc:
                active[mode] = "error: %s" % exc
                continue
            rows = []
            for f in frames:
                cmds.currentTime(f, update=True)
                rows.append(([world_matrix(j) for j in joints], [mesh_points(m) for m in meshes]))
            samples[mode] = rows
    finally:
        if orig:
            try:
                cmds.evaluationManager(mode=orig)
            except Exception:
                pass
    base_mode = next((m for m in modes if m in samples), None)
    diffs = {}
    for mode, rows in samples.items():
        worst = 0.0
        for (jb, mb), (jm, mm) in zip(samples[base_mode], rows):
            for a, b in zip(jb, jm):
                worst = max(worst, m_max_diff(a, b))
            for pa, pb in zip(mb, mm):
                for x, y in zip(pa, pb):
                    worst = max(worst, v_dist(x, y))
        diffs[mode] = worst
    return {"active": active, "max_diff": diffs, "ok": all(v <= tol for v in diffs.values()), "base": base_mode}


def influence_counts(mesh, threshold=1e-4):
    """Per-vertex influence counts of the mesh's skinCluster (OpenMayaAnim), for the engine
    limit (Unity default 4). Returns {max, over, histogram, max_sum_error}."""
    cmds = _cmds()
    om = _om()
    import maya.api.OpenMayaAnim as oma
    shape = (cmds.listRelatives(mesh, shapes=True, noIntermediate=True, fullPath=True) or [mesh])[0]
    scs = cmds.ls(cmds.listHistory(shape, pruneDagObjects=True) or [], type="skinCluster") or []
    if not scs:
        return {"skinCluster": None}
    sel = om.MSelectionList()
    sel.add(scs[0])
    sel.add(shape)
    fn = oma.MFnSkinCluster(sel.getDependNode(0))
    dag = sel.getDagPath(1)
    comp_fn = om.MFnSingleIndexedComponent()
    comp = comp_fn.create(om.MFn.kMeshVertComponent)
    comp_fn.setCompleteData(om.MFnMesh(dag).numVertices)
    weights, ninf = fn.getWeights(dag, comp)
    hist, worst_sum = {}, 0.0
    for v in range(len(weights) // max(ninf, 1)):
        row = weights[v * ninf:(v + 1) * ninf]
        k = sum(1 for w in row if w > threshold)
        hist[k] = hist.get(k, 0) + 1
        worst_sum = max(worst_sum, abs(sum(row) - 1.0))
    return {"skinCluster": scs[0], "influences": ninf, "max": max(hist) if hist else 0, "histogram": hist,
            "max_sum_error": worst_sum}


def game_skeleton_check(root, meshes=(), max_influences=4, budget=None, required=None, tol=1e-3):
    """Engine contract for the export skeleton (Unreal: root joint = pivot, one hierarchy; Unity:
    4 influences by default; antCGi fGacyVzJGIU): one root at the origin with world orientation,
    only joints below it (constraints and helpers live elsewhere), unique names without
    namespaces, joint count within budget, required names present, influences per vertex.
    The export itself belongs to scenario-maya-pipeline-scripting. Returns {ok, problems, info}."""
    cmds = _cmds()
    probs, info = [], {}
    if not cmds.objExists(root) or cmds.nodeType(root) != "joint":
        return {"ok": False, "problems": ["%s is not a joint" % root], "info": info}
    if cmds.listRelatives(root, parent=True, type="joint"):
        probs.append("%s has a joint parent" % root)
    wm = world_matrix(root)
    if v_len(m_translation(wm)) > tol:
        probs.append("root not at the origin: %s" % (m_translation(wm),))
    if m3_max_diff(rot3_normalize(m_rot3(wm)), m3_identity()) > 1e-4:
        probs.append("root not world oriented")
    below = cmds.listRelatives(root, allDescendents=True, fullPath=True) or []
    joints = [root] + [n for n in below if cmds.nodeType(n) == "joint"]
    others = [n for n in below if cmds.nodeType(n) != "joint"]
    if others:
        probs.append("%d non-joint nodes inside the export hierarchy: %s" % (len(others), [_short(n) for n in others[:8]]))
    shorts = [_short(j) for j in joints]
    if any(":" in s for s in shorts):
        probs.append("namespaces in joint names")
    dups = sorted(set(s for s in shorts if shorts.count(s) > 1))
    if dups:
        probs.append("duplicate names %s" % dups)
    info["joint_count"] = len(joints)
    if budget and len(joints) > budget:
        probs.append("%d joints over the budget of %d" % (len(joints), budget))
    if required:
        missing = [r for r in required if r not in shorts]
        if missing:
            probs.append("missing required joints %s" % missing)
    for j in joints:
        if any(abs(v - 1.0) > tol for v in cmds.getAttr(j + ".scale")[0]):
            probs.append("scaled joint %s" % _short(j))
    for m in meshes:
        ic = influence_counts(m)
        info[_short(m)] = ic
        if not ic.get("skinCluster"):
            probs.append("%s has no skinCluster" % m)
            continue
        if ic["max"] > max_influences:
            probs.append("%s: %d influences on some vertices (limit %d)" % (m, ic["max"], max_influences))
        if ic["max_sum_error"] > 1e-3:
            probs.append("%s: weights not normalized (%.4f)" % (m, ic["max_sum_error"]))
        infl = cmds.ls(cmds.skinCluster(ic["skinCluster"], q=True, influence=True) or [], long=True) or []
        outside = [_short(i) for i in infl if i not in set(cmds.ls(joints, long=True))]
        if outside:
            probs.append("%s skinned to influences outside %s: %s" % (m, root, outside[:6]))
    return {"ok": not probs, "problems": probs, "info": info}


# =========================================================================== range of motion
def rom_keys(tests, start=1, step=10):
    """Range-of-motion animation for deformation review (AdvancedSkeleton's Animation Tester,
    mTB9Yh_sWKc [00:19:50]): tests = [(node, attr, [values...]), ...]. Each test starts and
    ends at the rest value so poses stay isolated. Returns {poses: [(frame, node, attr, value)],
    end}."""
    cmds = _cmds()
    f, poses = start, []
    for node, attr, values in tests:
        rest = cmds.getAttr(node + "." + attr)
        cmds.setKeyframe(node, attribute=attr, value=rest, time=f)
        for v in values:
            f += step
            cmds.setKeyframe(node, attribute=attr, value=v, time=f)
            poses.append((f, node, attr, v))
        f += step
        cmds.setKeyframe(node, attribute=attr, value=rest, time=f)
    return {"poses": poses, "end": f}


def pose_review(targets, frames, out_dir, **review_kw):
    """Headless: an Arnold contact sheet per pose frame with scenario-maya-expert's mx_review.review
    (GUI: mx_review.playblast of the whole range instead). Returns the sheet paths."""
    cmds = _cmds()
    here = os.path.dirname(os.path.abspath(__file__))
    lead = os.path.join(os.path.dirname(os.path.dirname(here)), "scenario-maya-expert", "scripts")
    if lead not in sys.path:
        sys.path.insert(0, lead)
    import mx_review
    review_kw.setdefault("views", ("front", "side", "threequarter"))
    review_kw.setdefault("modes", ("clay",))
    sheets = {}
    for f in frames:
        cmds.currentTime(f, update=True)
        r = mx_review.review(targets, os.path.join(out_dir, "f%04d" % f), **review_kw)
        sheets[f] = r.get("sheet")
    return sheets


# =========================================================================== CLI (mx_run job)
def main(argv):
    """mx_run job: `--check ROOT [--joints a,b] [--json PATH]` runs rig_check;
    `--game ROOT [--meshes m1,m2] [--budget N]` runs game_skeleton_check."""
    args = list(argv or [])

    def opt(flag, default=None):
        return args[args.index(flag) + 1] if flag in args and args.index(flag) + 1 < len(args) else default
    out = {}
    if "--check" in args:
        joints = opt("--joints")
        out["rig_check"] = rig_check(root=opt("--check"), joints=joints.split(",") if joints else None)
    if "--game" in args:
        meshes = opt("--meshes")
        budget = opt("--budget")
        out["game_skeleton_check"] = game_skeleton_check(opt("--game"), meshes.split(",") if meshes else (),
                                                         budget=int(budget) if budget else None)
    path = opt("--json")
    if path:
        with open(path, "w") as f:
            json.dump(out, f, indent=1, default=str)
    return out
