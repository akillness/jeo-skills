"""
bx_anim: keyframe animation helpers for an agent that cannot scrub.

An animator judges timing by scrubbing and arcs by watching motion paths. An agent
cannot, so this module keys through the Blender 5.x slotted-action API (no
`action.fcurves`), converts blocking to spline the way Blender Studio animators do
(key columns, hold copies, body splined while face and fingers stay stepped), and
MEASURES motion: world positions per frame, spacing, velocity, holds, eases, pops,
sharp turns and arc wobble, plus two images the agent opens with its image reader
(an onion-skin contact image and a graph-editor style curve plot).

  import sys; sys.path.append("<skills>/scenario-blender-animation/scripts"); import bx_anim as A
  A.key_pose(rig, {"torso": {"location": (0, 0, -0.2)}}, 9, keytype='EXTREME')
  A.blocking_to_spline(rig, body_bones, transition=3)       # Rik Schutte's pillars
  pts = A.sample_world(rig, range(1, 49), bone="hand_ik.L")
  print(A.format_report(A.motion_report(pts, range(1, 49))))
  A.onion_skin("/abs/out/onion.png", range(1, 49), objects=[mesh], view="front")
  A.graph_image("/abs/out/graph.png", rig, bones=["torso"])
  A.bouncing_ball(weight=0.7, start=1, end=48, contacts=4)   # one object, world squash
  A.playblast_lighting(key_dir=(0, 0, 1)); print(A.format_staging(A.staging_report([ball], frames)))
  A.limb_extension(rig, ["ORG-thigh.L", "ORG-shin.L"], frames); A.rotation_flips(rig)
  A.balance_report(meshes, frames); A.ballistic_fit(pts, frames)   # see gravity()

Conventions
  * `idb` is any animatable ID (object, armature object, shape-key datablock...).
  * Frames are scene frames. A key's interpolation applies to the segment AFTER it.
  * Pose dicts: {"location": (x, y, z), "rotation_euler": (...), '["prop"]': 1.0} for
    ID properties; on an armature object, a key that names a pose bone maps to that
    bone's own dict: {"torso": {"location": (...), "rotation_quaternion": (w, x, y, z)}}.
    A value can be a full vector, a scalar, or {index: value} to key single channels.
  * Keys are written straight into the channelbag (deterministic, no preferences, no
    3D view needed). On an NLA layer with blend type ADD these values are DELTAS.
  * Never hold a Keyframe reference across an insert on the same F-curve: the array
    reallocates and the old reference silently reads garbage (verified 5.2.1).

Verified on Blender 5.2.1 LTS headless: tests/code/blender-animation/test_bx_anim.py,
test_rigify_jump.py (generated Rigify human), test_procedures.py, test_staging.py and
test_ball_shot.py (a full ball shot with the review pack).
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import math
import os
import statistics

import bpy
from bpy_extras import anim_utils
from mathutils import Euler, Matrix, Quaternion, Vector

KEY_COLORS = {  # Dope Sheet key-type colours, used by graph_image
    "KEYFRAME": (0.95, 0.95, 0.95), "EXTREME": (0.95, 0.45, 0.6),
    "BREAKDOWN": (0.35, 0.65, 0.95), "JITTER": (0.45, 0.85, 0.45),
    "MOVING_HOLD": (0.55, 0.55, 0.55), "GENERATED": (0.75, 0.75, 0.75),
}
_TRANSFORMS = {"location", "rotation_euler", "rotation_quaternion", "rotation_axis_angle",
               "scale"}


# --------------------------------------------------------------------------------------
# action, slot, channelbag
# --------------------------------------------------------------------------------------
def ensure_action(idb, name=None):
    """Return (action, slot) for `idb`, creating the action and a slot named after the
    ID when missing. Blender only auto-picks a slot by name, so always check the slot."""
    ad = idb.animation_data or idb.animation_data_create()
    if ad.action is None:
        ad.action = bpy.data.actions.new(name or f"{idb.name}Action")
    act = ad.action
    if ad.action_slot is None:
        slot = next((s for s in act.slots if s.name_display == idb.name
                     and s.target_id_type == idb.id_type), None)
        ad.action_slot = slot or act.slots.new(id_type=idb.id_type, name=idb.name)
    return act, ad.action_slot


def channelbag(idb, create=False):
    """The channelbag (F-curve container) of the assigned action slot, or None."""
    ad = idb.animation_data
    if create:
        act, slot = ensure_action(idb)
        return anim_utils.action_ensure_channelbag_for_slot(act, slot)
    if not ad or not ad.action or ad.action_slot is None:
        return None
    return anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)


def bone_of(fc):
    """Bone name of a pose-bone F-curve, else None."""
    dp = fc.data_path
    return dp.split('"')[1] if dp.startswith('pose.bones["') else None


def fcurves(idb, bones=None, exclude_bones=None, data_paths=None):
    """F-curves of the assigned slot, filtered by bone names and/or data-path substrings.
    `bones=None` keeps everything (object channels included); a list keeps only those
    bones' channels."""
    cb = channelbag(idb)
    if cb is None:
        return []
    bones = set(bones) if bones is not None else None
    exclude = set(exclude_bones or ())
    out = []
    for fc in cb.fcurves:
        b = bone_of(fc)
        if bones is not None and b not in bones:
            continue
        if b in exclude:
            continue
        if data_paths and not any(s in fc.data_path for s in data_paths):
            continue
        out.append(fc)
    return out


def key_frames(idb, bones=None, exclude_bones=None, data_paths=None, keytypes=None):
    """Sorted list of frames that carry at least one key (optionally of `keytypes`)."""
    return sorted({round(k.co.x, 3) for fc in fcurves(idb, bones, exclude_bones, data_paths)
                   for k in fc.keyframe_points if not keytypes or k.type in keytypes})


POSE_TYPES = ("KEYFRAME", "EXTREME")      # key poses; BREAKDOWN/MOVING_HOLD/JITTER are not


def _key_at(fc, frame):
    for k in fc.keyframe_points:
        if abs(k.co.x - frame) < 1e-3:
            return k
    return None


def _style(k, interpolation=None, handle=None, easing=None):
    if interpolation:
        k.interpolation = interpolation
    if handle:
        k.handle_left_type = k.handle_right_type = handle
    if easing:
        k.easing = easing


def _insert(fc, frame, value, keytype="KEYFRAME", interpolation=None, handle=None):
    fc.keyframe_points.insert(frame, value, options={"FAST"}, keyframe_type=keytype)
    k = _key_at(fc, frame)                      # fresh reference after the insert
    _style(k, interpolation, handle)
    return k


# --------------------------------------------------------------------------------------
# keying
# --------------------------------------------------------------------------------------
def _flatten(idb, pose):
    """Pose dict -> list of (data_path, index, value, group)."""
    items = []

    def add(owner, base, props, group):
        for name, val in props.items():
            if val is None:
                continue
            dp = (base + name if name.startswith("[") else
                  (f"{base}.{name}" if base else name))
            if name in ("rotation_euler", "rotation_quaternion", "rotation_axis_angle") \
                    and hasattr(owner, "rotation_mode"):
                mode = owner.rotation_mode
                ok = {"rotation_quaternion": mode == "QUATERNION",
                      "rotation_axis_angle": mode == "AXIS_ANGLE"}.get(
                    name, mode not in ("QUATERNION", "AXIS_ANGLE"))
                if not ok:
                    raise ValueError(f"{dp}: rotation_mode is {mode}, key the matching "
                                     "rotation property")
            try:
                current = idb.path_resolve(dp)
            except ValueError:
                raise ValueError(f"cannot resolve '{dp}' on {idb.name}")
            if isinstance(val, dict):
                pairs = list(val.items())
            elif hasattr(val, "__len__") and not isinstance(val, str):
                pairs = list(enumerate(val))
            else:
                pairs = [(0, val)]
            if not hasattr(current, "__len__") and len(pairs) > 1:
                raise ValueError(f"{dp} is a scalar")
            for i, v in pairs:
                items.append((dp, i, float(v), group))

    if getattr(idb, "type", None) == "ARMATURE":
        obj_props = {}
        for key, val in pose.items():
            if key in idb.pose.bones:
                pb = idb.pose.bones[key]
                add(pb, f'pose.bones["{key}"]', val, key)
            else:
                obj_props[key] = val
        add(idb, "", obj_props, "Object Transforms")
    else:
        add(idb, "", pose, "Object Transforms")
    return items


def key_pose(idb, pose, frame, keytype="KEYFRAME", interpolation="CONSTANT",
             handle="AUTO_CLAMPED"):
    """Key a pose dict at `frame` (see module docstring). Blocking default: stepped
    (CONSTANT). Returns the list of (data_path, index) keyed. Does not change the
    current frame; call scene.frame_set() before reading evaluated transforms."""
    cb = channelbag(idb, create=True)
    touched = []
    for dp, i, v, group in _flatten(idb, pose):
        grp = group if (group != "Object Transforms" or dp in _TRANSFORMS) else None
        fc = cb.fcurves.find(dp, index=i) or cb.fcurves.ensure(dp, index=i, group_name=grp or "")
        _insert(fc, frame, v, keytype, interpolation, handle)
        touched.append((dp, i))
    for fc in {cb.fcurves.find(dp, index=i) for dp, i in touched}:
        fc.update()
    return touched


def capture_pose(obj, bones=None):
    """Current (evaluated at this frame) local transforms as a pose dict, for pose
    libraries kept as data. Armature: per bone; other objects: the object itself."""
    def props(o):
        d = {"location": tuple(o.location), "scale": tuple(o.scale)}
        if o.rotation_mode == "QUATERNION":
            d["rotation_quaternion"] = tuple(o.rotation_quaternion)
        elif o.rotation_mode == "AXIS_ANGLE":
            d["rotation_axis_angle"] = tuple(o.rotation_axis_angle)
        else:
            d["rotation_euler"] = tuple(o.rotation_euler)
        return d
    if obj.type == "ARMATURE":
        names = bones or [pb.name for pb in obj.pose.bones]
        return {n: props(obj.pose.bones[n]) for n in names}
    return props(obj)


def world_pose(obj, bone, translate=None, rotate=None, pivot=None, frame=None):
    """Channel values that move a pose bone by a WORLD-space translation and/or a world
    rotation (Quaternion, Euler or Matrix) about `pivot` (default: the bone head), from
    its pose at `frame` (default: current). Rig bone axes are arbitrary; pose in world
    terms and key the returned {bone: {...}} with key_pose. With a pivot at a contact
    point this is Rik Schutte's 'rotate from the table contact' (3D-cursor pivot).
    Constraints on the bone itself are ignored."""
    sc = bpy.context.scene
    if frame is not None:
        sc.frame_set(int(frame))
    pb = obj.pose.bones[bone]
    M = obj.matrix_world @ pb.matrix
    if rotate is not None:
        R = rotate if isinstance(rotate, Matrix) else rotate.to_matrix()
        p = Vector(pivot) if pivot is not None else M.translation.copy()
        M = Matrix.Translation(p) @ R.to_4x4() @ Matrix.Translation(-p) @ M
    if translate is not None:
        M = Matrix.Translation(Vector(translate)) @ M
    L = obj.convert_space(pose_bone=pb, matrix=M, from_space="WORLD", to_space="LOCAL")
    loc, rot, _ = L.decompose()
    d = {"location": tuple(loc)}
    if pb.rotation_mode == "QUATERNION":
        d["rotation_quaternion"] = tuple(rot)
    elif pb.rotation_mode == "AXIS_ANGLE":
        ax, ang = rot.to_axis_angle()
        d["rotation_axis_angle"] = (ang, *ax)
    else:
        d["rotation_euler"] = tuple(rot.to_euler(pb.rotation_mode, pb.rotation_euler))
    return {bone: d}


def set_interpolation(idb, interpolation=None, frames=None, bones=None, exclude_bones=None,
                      data_paths=None, handle=None, easing=None, keytype=None):
    """Set interpolation / handle type / easing on keys whose frame lies in
    `frames=(first, last)` (inclusive; None = all). `keytype` limits to one key type.
    Handle types: AUTO_CLAMPED (holds stay flat), AUTO (free overshoot), VECTOR (hard
    hit), FREE / ALIGNED (manual). Returns the number of keys changed."""
    n = 0
    for fc in fcurves(idb, bones, exclude_bones, data_paths):
        for k in fc.keyframe_points:
            if frames and not (frames[0] - 1e-3 <= k.co.x <= frames[1] + 1e-3):
                continue
            if keytype and k.type != keytype:
                continue
            _style(k, interpolation, handle, easing)
            n += 1
        fc.update()
    return n


def fill_key_columns(idb, bones=None, frames=None, create_missing=False):
    """Key every channel of `bones` on every key-pose frame (Rik Schutte keys all main
    controls on every key so holds lock to a frame). Values come from the curve as it
    evaluates now (stepped values while blocking); a filled key takes the type of its
    column (a BREAKDOWN column stays a breakdown). `create_missing` also creates
    location/rotation/scale channels for listed bones that were never keyed.
    Returns the number of keys added."""
    if create_missing and bones is not None and idb.type == "ARMATURE":
        f0 = (frames or key_frames(idb) or [bpy.context.scene.frame_current])[0]
        for b in bones:
            idb.pose.bones[b]
            have = {fc.data_path for fc in fcurves(idb, [b])}
            want = {k: v for k, v in capture_pose(idb, [b])[b].items()
                    if f'pose.bones["{b}"].{k}' not in have}
            if want:
                key_pose(idb, {b: want}, f0)
    frames = frames or key_frames(idb, bones)
    fcs = fcurves(idb, bones)
    col_type = {}                     # a filled key takes its column's type, so a breakdown
    for f in frames:                  # column never turns into a key pose for auto_holds
        types = [k.type for fc in fcs for k in fc.keyframe_points if abs(k.co.x - f) < 1e-3]
        col_type[f] = next((t for t in types if t not in POSE_TYPES), None) \
            if types and all(t not in POSE_TYPES for t in types) else "KEYFRAME"
    added = 0
    for fc in fcs:
        vals = {f: fc.evaluate(f) for f in frames if _key_at(fc, f) is None}
        for f, v in vals.items():
            prev = [k for k in fc.keyframe_points if k.co.x < f]
            interp = prev[-1].interpolation if prev else "CONSTANT"
            _insert(fc, f, v, col_type.get(f) or "KEYFRAME", interp)
            added += 1
        fc.update()
    return added


def auto_holds(frames, transition=3, interpolate=(), transitions=None, all_frames=None):
    """Hold intervals for a stepped blocking: each key pose holds until
    `next_pose - transition` (Rik: 2 to 3 frames for a snappy change). Start frames in
    `interpolate` are big, deliberate moves left to the spline (no hold);
    `transitions={start: n}` overrides n per move. Intervals that already contain other
    keys in `all_frames` (hand-made breakdowns, authored holds) are left alone.
    Returns [(pose_frame, hold_end)]."""
    out = []
    transitions = transitions or {}
    inner = set(all_frames or ())
    for a, b in zip(frames, frames[1:]):
        if a in interpolate or any(a < f < b for f in inner):
            continue
        end = b - transitions.get(a, transition)
        if end > a:
            out.append((a, end))
    return out


def hold_copy(idb, holds, bones=None, keytype="MOVING_HOLD"):
    """Copy each key pose to the end of its hold (the 'pillar'), on every channel of
    `bones`, keeping the pose's interpolation. Do this BEFORE splining. An existing key
    at the hold end is never overwritten. Returns keys added."""
    n = 0
    for fc in fcurves(idb, bones):
        for a, e in holds:
            if _key_at(fc, e) is not None:
                continue
            v = fc.evaluate(a)
            prev = [k for k in fc.keyframe_points if k.co.x <= a + 1e-3]
            interp = prev[-1].interpolation if prev else "CONSTANT"
            _insert(fc, e, v, keytype, interp)
            n += 1
        fc.update()
    return n


def spline(idb, bones=None, exclude_bones=None, handle="AUTO_CLAMPED"):
    """Bezier on the given channels only (body), AUTO_CLAMPED so holds stay flat."""
    return set_interpolation(idb, "BEZIER", bones=bones, exclude_bones=exclude_bones,
                             handle=handle)


def blocking_to_spline(idb, body_bones, holds=None, transition=3, interpolate=(),
                       handle="AUTO_CLAMPED"):
    """Rik Schutte's conversion in one call: key columns on the body, pillars at the
    end of every hold, then Bezier on the body only. Face and finger bones (anything
    not in `body_bones`) stay CONSTANT. Returns the holds used."""
    fill_key_columns(idb, body_bones, create_missing=True)
    if holds is None:
        holds = auto_holds(key_frames(idb, body_bones, keytypes=POSE_TYPES), transition,
                           interpolate, all_frames=key_frames(idb, body_bones))
    hold_copy(idb, holds, body_bones)
    spline(idb, body_bones, handle=handle)
    return holds


def _quat_paths(fcs):
    groups = {}
    for fc in fcs:
        if fc.data_path.endswith("rotation_quaternion"):
            groups.setdefault(fc.data_path, {})[fc.array_index] = fc
    return {dp: g for dp, g in groups.items() if len(g) == 4}


def breakdown(idb, frame, prev_frame, next_frame, factor=0.5, bones=None, factors=None,
              keytype="BREAKDOWN"):
    """Hand-made breakdown at `frame`: 0 = previous pose, 1 = next pose (same meaning
    as pose.breakdown). `factors={bone: f}` favours parts differently (Alex Nagy: delay
    extremities with a low factor; favour late the part that should draw the eye).
    Quaternions are slerped. Interpolation follows the previous key (stays stepped)."""
    factors = factors or {}
    fcs = fcurves(idb, bones)
    quats = _quat_paths(fcs)
    done = set()
    for dp, g in quats.items():
        f = factors.get(bone_of(g[0]), factor)
        q0 = Quaternion([g[i].evaluate(prev_frame) for i in range(4)])
        q1 = Quaternion([g[i].evaluate(next_frame) for i in range(4)])
        if q0.dot(q1) < 0:
            q1 = -q1
        q = q0.slerp(q1, f)
        for i in range(4):
            _bd_insert(g[i], frame, q[i], keytype)
            done.add(g[i])
    for fc in fcs:
        if fc in done:
            continue
        f = factors.get(bone_of(fc), factor)
        v = fc.evaluate(prev_frame) * (1 - f) + fc.evaluate(next_frame) * f
        _bd_insert(fc, frame, v, keytype)
    for fc in fcs:
        fc.update()


def _bd_insert(fc, frame, v, keytype):
    prev = [k for k in fc.keyframe_points if k.co.x < frame]
    _insert(fc, frame, v, keytype, prev[-1].interpolation if prev else "CONSTANT")


def ease_inbetweens(idb, a, b, frames, mode="slow_in", ratio=0.8, bones=None):
    """Pablo Fournier's 20/80 rule as keyed in-betweens between key poses a and b.
    slow_in (decelerate into b): each in-between goes `ratio` of the remaining way
    (0.8, 0.96, 0.992...). slow_out (accelerate out of a): the mirror (..., 0.04, 0.2).
    `frames` are the in-between frames in order. Returns the fractions used."""
    n = len(frames)
    rest = 1.0 - ratio
    if mode == "slow_in":
        fr = [1 - rest ** (k + 1) for k in range(n)]
    elif mode == "slow_out":
        fr = [rest ** (n - k) for k in range(n)]
    else:
        raise ValueError("mode is slow_in or slow_out")
    for f, t in zip(frames, fr):
        breakdown(idb, f, a, b, t, bones=bones)
    return fr


def offset_keys(idb, frames, bones=None, data_paths=None):
    """Shift keys (and handles) by `frames`: overlap by stair-stepping chain links
    (Dillon Gu) or a 2 to 3 frame head lag in a cycle (Joey Carlino)."""
    for fc in fcurves(idb, bones, data_paths=data_paths):
        for k in fc.keyframe_points:
            k.co.x += frames
            k.handle_left.x += frames
            k.handle_right.x += frames
        fc.update()


def add_cycles(idb, bones=None, data_paths=None, mode="REPEAT"):
    """Cycles modifier on channels, replacing existing ones. REPEAT for limbs,
    REPEAT_OFFSET for the travelling root channel (with LINEAR keys)."""
    n = 0
    for fc in fcurves(idb, bones, data_paths=data_paths):
        for m in [m for m in fc.modifiers if m.type == "CYCLES"]:
            fc.modifiers.remove(m)
        m = fc.modifiers.new("CYCLES")
        m.mode_before = m.mode_after = mode
        n += 1
    return n


def push_layer(idb, name="Layer", blend="ADD", influence=1.0):
    """5.2 has one layer per action: push the current action to an NLA strip and start
    a new action on top with `blend` (ADD, or COMBINE for quaternion rigs). key_pose on
    it writes deltas; obj.keyframe_insert on it stores remapped deltas. Returns it."""
    ad = idb.animation_data
    base = ad.action
    tr = ad.nla_tracks.new()
    tr.name = base.name
    tr.strips.new(base.name, int(base.frame_range[0]), base)
    ad.action = None
    ad.action = bpy.data.actions.new(name)
    ensure_action(idb)
    ad.action_blend_type = blend
    ad.action_influence = influence
    return ad.action


# --------------------------------------------------------------------------------------
# checks on curves
# --------------------------------------------------------------------------------------
def hold_drift(idb, holds, bones=None):
    """Largest change of any channel inside each hold (after splining). A dead hold is
    ~0; a moving hold is small but not zero. Returns {"worst": (...), "holds": {...}}."""
    per = {}
    worst = (0.0, None, None, None)
    for fc in fcurves(idb, bones):
        for a, e in holds:
            v0 = fc.evaluate(a)
            d = max(abs(fc.evaluate(a + i * 0.25) - v0) for i in range(int((e - a) * 4) + 1))
            per[(a, e)] = max(per.get((a, e), 0.0), d)
            if d > worst[0]:
                worst = (d, fc.data_path, fc.array_index, (a, e))
    return {"worst": worst, "holds": per}


def overshoots(idb, bones=None, data_paths=None, tol=1e-4, steps=8):
    """Segments whose curve leaves the range of its two keys (AUTO handles overshoot,
    AUTO_CLAMPED do not). Wanted on a settle, a bug on a hold. Returns a list of
    (amount, data_path, index, (frame0, frame1)) sorted by amount."""
    out = []
    for fc in fcurves(idb, bones, data_paths=data_paths):
        ks = sorted((k.co.x, k.co.y, k.interpolation) for k in fc.keyframe_points)
        for (x0, y0, it), (x1, y1, _) in zip(ks, ks[1:]):
            if it == "CONSTANT" or x1 - x0 < 1e-6:
                continue
            lo, hi = min(y0, y1), max(y0, y1)
            n = max(2, int((x1 - x0) * steps))
            amt = max(max(fc.evaluate(x0 + (x1 - x0) * i / n) - hi,
                          lo - fc.evaluate(x0 + (x1 - x0) * i / n)) for i in range(n + 1))
            if amt > tol:
                out.append((amt, fc.data_path, fc.array_index, (x0, x1)))
    return sorted(out, reverse=True)


# --------------------------------------------------------------------------------------
# measurement
# --------------------------------------------------------------------------------------
def _frame_set(sc, f):
    fi = math.floor(f)
    sc.frame_set(int(fi), subframe=float(f - fi))


def sample_world(obj, frames, bone=None, point="head", scene=None):
    """World positions per frame of an object origin, an object-local offset, a pose
    bone's head/tail, or a bone-local offset (Y runs along the bone). Restores the frame."""
    sc = scene or bpy.context.scene
    cur = sc.frame_current
    out = []
    try:
        for f in frames:
            _frame_set(sc, f)
            if bone:
                pb = obj.pose.bones[bone]
                if point == "head":
                    p = obj.matrix_world @ pb.head
                elif point == "tail":
                    p = obj.matrix_world @ pb.tail
                else:
                    p = obj.matrix_world @ pb.matrix @ Vector(point)
            else:
                p = obj.matrix_world.translation.copy() if point == "head" else \
                    obj.matrix_world @ Vector(point)
            out.append(p.copy())
    finally:
        sc.frame_set(cur)
    return out


def lowest_point(objs, frames, axis=2, scene=None):
    """Lowest world coordinate (default Z) of the evaluated meshes per frame: ground
    contact and penetration checks through any parent/armature/modifier chain."""
    import numpy as np
    sc = scene or bpy.context.scene
    objs = objs if isinstance(objs, (list, tuple)) else [objs]
    cur = sc.frame_current
    out = []
    try:
        for f in frames:
            _frame_set(sc, f)
            dg = bpy.context.evaluated_depsgraph_get()
            low = math.inf
            for o in objs:
                eo = o.evaluated_get(dg)
                me = eo.to_mesh()
                co = np.empty(len(me.vertices) * 3, dtype=np.float32)
                me.vertices.foreach_get("co", co)
                co = co.reshape(-1, 3)
                mw = np.array(eo.matrix_world, dtype=np.float64)
                w = co @ mw[:3, :3].T + mw[:3, 3]
                low = min(low, float(w[:, axis].min()))
                eo.to_mesh_clear()
            out.append(low)
    finally:
        sc.frame_set(cur)
    return out


def motion_path(obj, frame_start, frame_end, bone=None, keep=True):
    """Blender's own motion path (computed headless via temp_override; bones enter Pose
    Mode briefly, mode and active object are restored). Returns world positions; the
    path stays visible in a GUI session unless keep=False. sample_world() gives the
    same numbers without touching modes."""
    mp = obj.pose.animation_visualization.motion_path if bone else \
        obj.animation_visualization.motion_path
    mp.range = "MANUAL"
    mp.frame_start, mp.frame_end = int(frame_start), int(frame_end)
    if bone:
        vl = bpy.context.view_layer
        prev_active, prev_mode = vl.objects.active, obj.mode
        vl.objects.active = obj
        if obj.mode != "POSE":                      # the pose operator polls for Pose Mode
            bpy.ops.object.mode_set(mode="POSE")
        pb = obj.pose.bones[bone]
        pb.select = True
        try:
            with bpy.context.temp_override(object=obj, active_object=obj,
                                           selected_pose_bones=[pb], active_pose_bone=pb):
                bpy.ops.pose.paths_calculate(display_type="RANGE", range="MANUAL")
        finally:
            if prev_mode != "POSE":
                bpy.ops.object.mode_set(mode=prev_mode)
            vl.objects.active = prev_active
        path = pb.motion_path
    else:
        with bpy.context.temp_override(object=obj, active_object=obj,
                                       selected_objects=[obj], selected_editable_objects=[obj]):
            bpy.ops.object.paths_calculate(display_type="RANGE", range="MANUAL")
        path = obj.motion_path
    pts = [Vector(v.co) for v in path.points]
    if not keep:
        if bone:
            with bpy.context.temp_override(object=obj, active_object=obj,
                                           selected_pose_bones=[pb]):
                bpy.ops.pose.paths_clear(only_selected=True)
        else:
            with bpy.context.temp_override(object=obj, active_object=obj,
                                           selected_objects=[obj]):
                bpy.ops.object.paths_clear(only_selected=True)
    return pts


def to_camera(points, camera=None, scene=None, res=None):
    """Project world points through a camera: (x, y, depth) with x, y in 0..1 from the
    bottom-left, or pixel coordinates from the top-left when `res=(w, h)`. Measure
    angles and arcs on pixels: 0..1 squeezes x by the aspect ratio and motion_report
    then invents sharp turns at the apexes of a bouncing ball (measured)."""
    from bpy_extras.object_utils import world_to_camera_view
    sc = scene or bpy.context.scene
    cam = camera or sc.camera
    out = []
    for p in points:
        v = world_to_camera_view(sc, cam, Vector(p))
        out.append((v.x * res[0], (1 - v.y) * res[1], v.z) if res else (v.x, v.y, v.z))
    return out


def _runs(mask):
    runs, start = [], None
    for i, m in enumerate(mask):
        if m and start is None:
            start = i
        if not m and start is not None:
            runs.append((start, i - 1))
            start = None
    if start is not None:
        runs.append((start, len(mask) - 1))
    return runs


def motion_report(points, frames, fps=None, hold_eps=None, turn_deg=45.0, dims=None):
    """Spacing and arc analysis of a sampled path (world 3D or camera 2D points).
    Returns a dict: spacing (per frame), velocity (units/s), holds, moves (with ease
    shape, peak position, evenness), sharp turns (contacts, hits), arc wobble
    (curvature sign flips inside a move), pops and start-stops. For to_camera() output
    pass dims=2 so the depth column is ignored, and use res=(w, h) pixels. The default
    hold threshold is 1e-3 x the path extent: pass `hold_eps` to see a small settle."""
    import numpy as np
    sc = bpy.context.scene
    fps = fps or sc.render.fps / sc.render.fps_base
    P = np.array([tuple(p)[:dims or 3] for p in points], dtype=np.float64)
    F = np.array(list(frames), dtype=np.float64)
    d = np.diff(P, axis=0)
    dt = np.diff(F)
    sp = np.linalg.norm(d, axis=1) / dt
    extent = float(max(np.ptp(P, axis=0).max(), 1e-9))
    eps = hold_eps if hold_eps is not None else 1e-3 * extent
    moving = sp > eps
    holds = [(float(F[i0]), float(F[i1 + 1])) for i0, i1 in _runs(~moving)]
    moves = []
    for i0, i1 in _runs(moving):
        s = sp[i0:i1 + 1]
        mx, im = float(s.max()), int(s.argmax())
        first, last = float(s[0] / mx), float(s[-1] / mx)
        cv = float(s.std() / max(s.mean(), 1e-12))
        if len(s) >= 4 and cv < 0.08:
            shape = "constant spacing (mechanical unless intended)"
        elif first < 0.5 and last < 0.5:
            shape = "eases out of start and into end"
        elif first < 0.5:
            shape = "eases out of start, fastest at the end"
        elif last < 0.5:
            shape = "starts fast, eases into end"
        else:
            shape = "fast at both ends"
        cum = np.concatenate([[0.0], np.cumsum(s * dt[i0:i1 + 1])])
        moves.append({"start": float(F[i0]), "end": float(F[i1 + 1]), "frames": float(F[i1 + 1] - F[i0]),
                      "distance": float(cum[-1]), "max_spacing": mx,
                      "peak_frame": float(F[i0 + im]), "peak_at": (im + 0.5) / len(s),
                      "first_ratio": first, "last_ratio": last, "evenness_cv": cv,
                      "shape": shape, "ticks": (cum / max(cum[-1], 1e-12)).tolist()})
    # turning angles and curvature sign in the best-fit plane
    if P.shape[1] == 3 and len(P) >= 3:
        _, _, vt = np.linalg.svd(P - P.mean(axis=0))
        normal = vt[2]
    else:
        normal = np.array([0.0, 0.0, 1.0])
    D3 = np.zeros((len(d), 3))
    D3[:, :d.shape[1]] = d
    sharp, turns = [], []
    for i in range(len(d) - 1):
        if not (moving[i] and moving[i + 1]):
            continue
        a, b = D3[i], D3[i + 1]
        c = float(np.clip(a.dot(b) / (np.linalg.norm(a) * np.linalg.norm(b)), -1, 1))
        ang = math.degrees(math.acos(c))
        if ang > turn_deg:
            sharp.append((float(F[i + 1]), round(ang, 1)))
        elif ang > 0.5:
            turns.append((i, float(F[i + 1]), float(np.sign(np.cross(a, b).dot(normal)))))
    wobble = []
    for (i, f, s), (j, g, t) in zip(turns, turns[1:]):
        if j == i + 1 and s != t and s != 0 and t != 0:
            wobble.append(g)
    # pops and start-stops
    pops, stops = [], []
    for i in range(len(sp)):
        win = np.concatenate([sp[max(0, i - 2):i], sp[i + 1:i + 3]])
        win = win[win > eps]              # judge against moving neighbours: a snap out of
        if len(win) >= 2 and sp[i] > 2.5 * float(np.median(win)) and sp[i] > 10 * eps:
            pops.append((float(F[i]), float(F[i + 1])))   # a dead hold is not a pop
        if 1 < i < len(sp) - 2 and moving[i]:
            if sp[i] < 0.5 * min(sp[i - 2:i].max(), sp[i + 1:i + 3].max()) and \
                    sp[i] <= sp[i - 1] and sp[i] <= sp[i + 1]:
                stops.append(float(F[i]))
    return {"fps": fps, "frames": F.tolist(), "extent": extent, "hold_eps": eps,
            "spacing": sp.tolist(), "velocity": (sp * fps).tolist(), "holds": holds,
            "moves": moves, "sharp_turns": sharp, "arc_wobble": wobble, "pops": pops,
            "start_stops": stops}


def format_report(rep, width=60, table=False):
    """Human/agent-readable text of motion_report, with an animator's spacing chart per
    move (one 'o' per frame, placed by distance travelled)."""
    F = rep["frames"]
    lines = [f"frames {F[0]:g}-{F[-1]:g} @ {rep['fps']:g} fps, path extent {rep['extent']:.4g}"]
    lines.append("holds: " + (", ".join(f"{a:g}-{b:g}" for a, b in rep["holds"]) or "none"))
    for m in rep["moves"]:
        lines.append(f"move {m['start']:g}-{m['end']:g} ({m['frames']:g} fr, dist {m['distance']:.4g}): "
                     f"{m['shape']}; peak spacing {m['max_spacing']:.4g} at f{m['peak_frame']:g} "
                     f"({m['peak_at'] * 100:.0f}% through), first/last {m['first_ratio']:.2f}/"
                     f"{m['last_ratio']:.2f}")
        row = ["-"] * (width + 1)
        for t in m["ticks"]:
            row[int(round(t * width))] = "o"
        lines.append("   |" + "".join(row) + "|")
    lines.append("sharp turns: " + (", ".join(f"f{f:g} ({a:g} deg)" for f, a in rep["sharp_turns"]) or "none"))
    lines.append("arc wobble (curvature flips): " + (", ".join(f"f{f:g}" for f in rep["arc_wobble"]) or "none"))
    lines.append("pops: " + (", ".join(f"{a:g}->{b:g}" for a, b in rep["pops"]) or "none"))
    lines.append("start-stops: " + (", ".join(f"f{f:g}" for f in rep["start_stops"]) or "none"))
    if table:
        lines.append("frame  spacing   velocity/s")
        for f, s, v in zip(F, rep["spacing"], rep["velocity"]):
            lines.append(f"{f:5g}  {s:8.4f}  {v:9.3f}")
    return "\n".join(lines)


def gravity(fps=None, g=9.81, scale_length=None):
    """Real gravity in the units an agent compares against, so the factor 2 never bites:
    'accel_per_frame2' is the ACCELERATION (second difference of height per frame^2,
    9.81 / fps^2 = 0.01703 m at 24 fps); 'quad_coeff_per_frame2' is the LEADING
    COEFFICIENT of a quadratic fit z = a t^2 + b t + c with t in frames (half of it,
    negative: -0.00852 at 24 fps). Scene unit scale is respected."""
    sc = bpy.context.scene
    fps = fps or sc.render.fps / sc.render.fps_base
    g_u = g / (scale_length or sc.unit_settings.scale_length or 1.0)
    return {"accel_per_s2": g_u, "accel_per_frame2": g_u / fps ** 2,
            "quad_coeff_per_frame2": -g_u / (2 * fps ** 2), "fps": fps}


def ballistic_fit(points, frames, fps=None, axis=2, g=9.81):
    """Least-squares parabola through the vertical component of an airborne path
    (centre of gravity between take-off and landing, a thrown prop).

    Returns, without ambiguity:
      accel               vertical ACCELERATION in units/s^2 (= 2 x the quadratic's
                          leading coefficient); compare with -9.81 at real scale
      accel_per_frame2    the same acceleration per frame^2 (compare with -9.81/fps^2)
      quad_coeff_per_frame2  the raw leading coefficient with t in frames
                          (compare with -9.81/(2 fps^2), half the acceleration)
      g_ratio             -accel / g: 1.0 = physical at this scale, < 1 floaty
      residual_max        largest deviation from the fitted parabola (lumpy arc)
      apex_time_frame     frame of the fitted apex
    Scene unit scale is respected (gravity() gives the reference values)."""
    import numpy as np
    sc = bpy.context.scene
    fps = fps or sc.render.fps / sc.render.fps_base
    g_u = g / (sc.unit_settings.scale_length or 1.0)
    t = np.array(list(frames), dtype=np.float64) / fps
    z = np.array([p[axis] for p in points], dtype=np.float64)
    a, b, c = np.polyfit(t, z, 2)
    resid = z - (a * t * t + b * t + c)
    return {"accel": float(2 * a), "accel_per_frame2": float(2 * a / fps ** 2),
            "quad_coeff_per_frame2": float(a / fps ** 2), "g_ratio": float(-2 * a / g_u),
            "residual_max": float(np.abs(resid).max()),
            "apex_time_frame": float(-b / (2 * a) * fps) if a else None}


def limb_extension(obj, chain, frames, threshold=0.99, pop_deg=20.0):
    """Knee (or elbow) pop check for an IK limb [added]. `chain` = pose bones from root
    to tip that carry the final pose, e.g. Rigify ["ORG-thigh.L", "ORG-shin.L"] (the ORG
    bones follow IK or FK; DEF thighs are split in two). Per frame: extension ratio =
    root-head to tip-tail distance / sum of rest lengths, and the bend angle between
    the first and last bone. An IK chain near full extension snaps: keep the ratio under
    `threshold` (0.99) on every frame the leg is meant to stay bent; > 1.0 means IK
    stretch is lengthening the limb. A bend change of more than `pop_deg` in one frame
    while the ratio is above 0.97 is reported as a pop. Returns a dict."""
    sc = bpy.context.scene
    cur = sc.frame_current
    full = sum(obj.data.bones[b].length for b in chain)
    rows = []
    try:
        for f in frames:
            _frame_set(sc, f)
            mw = obj.matrix_world
            a = obj.pose.bones[chain[0]]
            z = obj.pose.bones[chain[-1]]
            root, tip = mw @ a.head, mw @ z.tail
            scale = mw.to_scale()[0] or 1.0
            ratio = (tip - root).length / scale / full
            v1 = (mw @ a.tail) - root
            v2 = tip - (mw @ z.head)
            bend = math.degrees(v1.angle(v2)) if v1.length > 1e-9 and v2.length > 1e-9 else 0.0
            rows.append({"frame": f, "ratio": ratio, "bend_deg": bend})
    finally:
        sc.frame_set(cur)
    straight = [r["frame"] for r in rows if r["ratio"] >= threshold]
    stretched = [r["frame"] for r in rows if r["ratio"] > 1.001]
    pops = [(p["frame"], q["frame"], round(abs(q["bend_deg"] - p["bend_deg"]), 1))
            for p, q in zip(rows, rows[1:])
            if abs(q["bend_deg"] - p["bend_deg"]) > pop_deg and max(p["ratio"], q["ratio"]) > 0.97]
    return {"chain": list(chain), "full_length": full, "rows": rows,
            "max_ratio": max(r["ratio"] for r in rows), "straight_frames": straight,
            "stretched_frames": stretched, "pops": pops}


def rotation_flips(idb, bones=None, data_paths=None, max_step_deg=90.0, frames=None):
    """Euler and quaternion flip check (digest checklist 'no jumps greater than 180
    degrees'). Key level: an Euler channel whose consecutive keys differ by more than
    180 degrees ('euler_jump'), a quaternion whose consecutive keys have a negative dot
    product ('quat_sign_flip': Blender interpolates the components, so it swings the
    long way). Sampled on whole frames: orientation change above `max_step_deg` in one
    frame ('fast_turn'). Returns a list of dicts; fix with fix_rotation_flips()."""
    out = []
    fcs = [fc for fc in fcurves(idb, bones, data_paths=data_paths)
           if "rotation_euler" in fc.data_path or "rotation_quaternion" in fc.data_path]
    groups = {}
    for fc in fcs:
        groups.setdefault(fc.data_path, {})[fc.array_index] = fc
    for dp, g in groups.items():
        if dp.endswith("rotation_euler"):
            for i, fc in g.items():
                ks = sorted((k.co.x, k.co.y) for k in fc.keyframe_points)
                for (x0, y0), (x1, y1) in zip(ks, ks[1:]):
                    if abs(y1 - y0) > math.pi:
                        out.append({"data_path": dp, "index": i, "frames": (x0, x1),
                                    "kind": "euler_jump", "deg": round(math.degrees(abs(y1 - y0)), 1)})
        elif len(g) == 4:
            xs = sorted({round(k.co.x, 3) for fc in g.values() for k in fc.keyframe_points})
            qs = [Quaternion([g[i].evaluate(x) for i in range(4)]) for x in xs]
            for (x0, q0), (x1, q1) in zip(zip(xs, qs), zip(xs[1:], qs[1:])):
                if q0.dot(q1) < 0:
                    out.append({"data_path": dp, "index": None, "frames": (x0, x1),
                                "kind": "quat_sign_flip", "deg": None})
        ks = [k.co.x for fc in g.values() for k in fc.keyframe_points]
        f0, f1 = frames or (math.floor(min(ks)), math.ceil(max(ks)))
        try:
            owner = idb.path_resolve(dp.rsplit(".", 1)[0]) if "." in dp else idb
        except ValueError:
            owner = idb
        mode = getattr(owner, "rotation_mode", "XYZ")
        mode = mode if mode not in ("QUATERNION", "AXIS_ANGLE") else "XYZ"
        prev = None
        for f in range(int(f0), int(f1) + 1):
            if dp.endswith("rotation_euler"):
                q = Euler([g[i].evaluate(f) if i in g else 0.0 for i in range(3)], mode).to_quaternion()
            elif len(g) == 4:
                q = Quaternion([g[i].evaluate(f) for i in range(4)])
                if q.magnitude < 1e-9:
                    q = Quaternion()
                q.normalize()
            else:
                break
            if prev is not None:
                ang = math.degrees(prev.rotation_difference(q).angle)
                ang = min(ang, 360 - ang)
                if ang > max_step_deg:
                    out.append({"data_path": dp, "index": None, "frames": (f - 1, f),
                                "kind": "fast_turn", "deg": round(ang, 1)})
            prev = q
    return out


def fix_rotation_flips(idb, bones=None, data_paths=None):
    """Repair what rotation_flips reports on keys: quaternion keys are negated (same
    orientation) so consecutive keys keep a positive dot product; Euler keys get a
    multiple of 360 degrees per axis so each key is within 180 degrees of the previous
    one (a per-axis unwrap, simpler than Blender's Euler filter). Handles move with
    their keys. Returns the number of keys changed."""
    n = 0
    fcs = [fc for fc in fcurves(idb, bones, data_paths=data_paths)
           if "rotation_euler" in fc.data_path or "rotation_quaternion" in fc.data_path]
    groups = {}
    for fc in fcs:
        groups.setdefault(fc.data_path, {})[fc.array_index] = fc
    for dp, g in groups.items():
        if dp.endswith("rotation_euler"):
            for fc in g.values():
                ks = sorted(fc.keyframe_points, key=lambda k: k.co.x)
                for k0, k1 in zip(ks, ks[1:]):
                    d = k1.co.y - k0.co.y
                    turns = round(d / (2 * math.pi))
                    if turns:
                        off = -turns * 2 * math.pi
                        k1.co.y += off
                        k1.handle_left.y += off
                        k1.handle_right.y += off
                        n += 1
                fc.update()
        elif len(g) == 4:
            xs = sorted({round(k.co.x, 3) for fc in g.values() for k in fc.keyframe_points})
            prev = None
            for x in xs:
                keys = [_key_at(g[i], x) for i in range(4)]
                q = Quaternion([g[i].evaluate(x) for i in range(4)])
                if prev is not None and prev.dot(q) < 0 and all(keys):
                    for k in keys:
                        k.co.y, k.handle_left.y, k.handle_right.y = -k.co.y, -k.handle_left.y, -k.handle_right.y
                    q = -q
                    n += 1
                prev = q
            for fc in g.values():
                fc.update()
    return n


def _world_verts(objs, dg):
    """Evaluated world-space vertex array (N, 3) of the meshes, plus the per-object
    (start, count, triangle index array) needed for volume centroids."""
    import numpy as np
    pts, tris, off = [], [], 0
    for o in objs:
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        co = np.empty(len(me.vertices) * 3, dtype=np.float64)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        mw = np.array(eo.matrix_world, dtype=np.float64)
        w = co @ mw[:3, :3].T + mw[:3, 3]
        me.calc_loop_triangles()
        t = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", t)
        tris.append(t.reshape(-1, 3) + off)
        pts.append(w)
        off += len(w)
        eo.to_mesh_clear()
    return (np.concatenate(pts) if pts else np.zeros((0, 3))), \
        (np.concatenate(tris) if tris else np.zeros((0, 3), dtype=np.int64))


def _hull2d(p):
    """Convex hull (counter-clockwise) of 2D points, monotone chain."""
    pts = sorted(set(map(tuple, p)))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for q in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], q) <= 0:
            hi.pop()
        hi.append(q)
    return lo[:-1] + hi[:-1]


def _signed_margin(pt, hull):
    """Signed distance from a 2D point to a convex CCW polygon (positive inside); for a
    point or segment 'hull' the negative distance to it."""
    def seg_dist(p, a, b):
        ax, ay, bx, by = a[0], a[1], b[0], b[1]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0.0 if L < 1e-18 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L))
        return math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)
    if len(hull) == 1:
        return -math.hypot(pt[0] - hull[0][0], pt[1] - hull[0][1])
    if len(hull) == 2:
        return -seg_dist(pt, hull[0], hull[1])
    inside = True
    for a, b in zip(hull, hull[1:] + hull[:1]):
        if (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]) < 0:
            inside = False
    d = min(seg_dist(pt, a, b) for a, b in zip(hull, hull[1:] + hull[:1]))
    return d if inside else -d


def balance_report(objs, frames, floor_z=None, contact_tol=0.02, cog=None):
    """Weight and balance check (digest checklist 'COG over the support foot'; Alex
    Nagy builds poses COG then feet with the weight over the support foot). Per frame:
    centre of gravity = volume centroid of the evaluated meshes (closed meshes; open
    ones fall back to the vertex mean), or `cog=(obj, bone_or_None)` to use a control;
    support polygon = convex hull of the vertices within `contact_tol` of the floor
    (`floor_z` default: the lowest point over `frames`); margin = signed horizontal
    distance of the COG to that polygon (positive inside, units). Airborne frames have
    no support. Held poses and settles should be inside; locomotion is allowed outside
    (the fall that drives the next step). Returns a dict with rows and a summary."""
    import numpy as np
    sc = bpy.context.scene
    objs = objs if isinstance(objs, (list, tuple)) else [objs]
    frames = list(frames)
    if floor_z is None:
        floor_z = min(lowest_point(objs, frames))
    cur = sc.frame_current
    rows = []
    try:
        for f in frames:
            _frame_set(sc, f)
            dg = bpy.context.evaluated_depsgraph_get()
            P, T = _world_verts(objs, dg)
            if cog is not None:
                c = sample_world(cog[0], [f], bone=cog[1])[0]
                _frame_set(sc, f)
                c = np.array(c)
            else:
                a, b, cc = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
                vol = np.einsum("ij,ij->i", a, np.cross(b, cc)) / 6.0
                V = vol.sum()
                c = ((a + b + cc) / 4.0 * vol[:, None]).sum(axis=0) / V \
                    if abs(V) > 1e-12 else P.mean(axis=0)
            low = P[P[:, 2] <= floor_z + contact_tol]
            if len(low) == 0:
                rows.append({"frame": f, "cog": tuple(c), "contacts": 0, "margin": None,
                             "balanced": None})
                continue
            hull = _hull2d(np.round(low[:, :2], 6))
            m = _signed_margin((c[0], c[1]), hull)
            rows.append({"frame": f, "cog": tuple(float(v) for v in c), "contacts": len(low),
                         "margin": m, "balanced": m >= 0.0, "support": hull})
    finally:
        sc.frame_set(cur)
    grounded = [r for r in rows if r["margin"] is not None]
    return {"floor_z": floor_z, "rows": rows,
            "airborne": [r["frame"] for r in rows if r["margin"] is None],
            "off_balance": [r["frame"] for r in grounded if not r["balanced"]],
            "min_margin": min((r["margin"] for r in grounded), default=None)}


def _project_px(sc, cam, P, res):
    """World points (N, 3) -> pixel x (from left), y (from top), in-front mask, using
    the camera's own projection (perspective or ortho, shift, sensor fit)."""
    import numpy as np
    W, H = res
    dg = bpy.context.evaluated_depsgraph_get()
    Pm = np.array(cam.calc_matrix_camera(dg, x=W, y=H, scale_x=sc.render.pixel_aspect_x,
                                         scale_y=sc.render.pixel_aspect_y), dtype=np.float64)
    Vm = np.array(cam.matrix_world.inverted(), dtype=np.float64)
    h = np.c_[P, np.ones(len(P))] @ (Pm @ Vm).T
    w = h[:, 3]
    front = w > 1e-9
    ws = np.where(front, w, 1.0)
    x = (h[:, 0] / ws + 1.0) / 2.0 * W
    y = (1.0 - (h[:, 1] / ws + 1.0) / 2.0) * H
    return x, y, front


def staging_report(objs, frames, camera=None, res=None, shadow_frames=(), out_dir=None,
                   min_size=0.12, min_fill=0.5, edge_margin=0.03, dark_eps=0.03):
    """Readability of a shot through its camera [added; thresholds calibrated on the E3
    ball runs, see critique.md]. Per frame, from the evaluated meshes: the subject's
    screen bounding box in pixels, its size (box height / frame height), how much of it
    is inside the frame. Summary:
      size_median, size_min     subject height as a fraction of frame height
      action_w, action_h        how much of the frame the whole action covers
      entry                     'off-screen', 'partial' or 'in frame' at the first frame
      first_full, last_inside   first frame fully in frame; inside fraction at the end
      end_margin, end_x         final pose: distance to the nearest edge (fraction of the
                                frame width) and screen x of its centre (0..1)
      edge_frames               frames (after the entry) where the subject is cut
    `shadow_frames`: frames rendered three times with the scene's own engine and
    settings at 50% (with the subject, without it, subject mask) to prove a contact
    shadow is visible: shadow pixels = darker by more than `dark_eps` outside the
    subject; visible = at least 5% of the subject's pixel area and a mean darkening of
    0.04 or more (0.043 was faint but visible in the E3 run); reports area, darkening
    and the gap between subject bottom and shadow (0 px at a contact, growing with
    height). Writes PNGs to `out_dir`.
    `flags` lists what to fix, in plain words."""
    import numpy as np
    sc = bpy.context.scene
    objs = objs if isinstance(objs, (list, tuple)) else [objs]
    cam = camera or sc.camera
    r = sc.render
    res = res or (int(r.resolution_x * r.resolution_percentage / 100),
                  int(r.resolution_y * r.resolution_percentage / 100))
    W, H = res
    frames = list(frames)
    cur = sc.frame_current
    rows = []
    try:
        for f in frames:
            _frame_set(sc, f)
            dg = bpy.context.evaluated_depsgraph_get()
            P, _ = _world_verts(objs, dg)
            x, y, front = _project_px(sc, cam, P, res)
            if not front.any():
                rows.append({"frame": f, "box": None, "size": 0.0, "inside": 0.0})
                continue
            x0, x1, y0, y1 = x[front].min(), x[front].max(), y[front].min(), y[front].max()
            area = max((x1 - x0) * (y1 - y0), 1e-9)
            ix = max(0.0, min(x1, W) - max(x0, 0.0))
            iy = max(0.0, min(y1, H) - max(y0, 0.0))
            rows.append({"frame": f, "box": (float(x0), float(y0), float(x1), float(y1)),
                         "size": float((y1 - y0) / H), "inside": float(ix * iy / area),
                         "centre": (float((x0 + x1) / 2 / W), float((y0 + y1) / 2 / H))})
    finally:
        sc.frame_set(cur)
    seen = [q for q in rows if q["inside"] > 0]
    sizes = [q["size"] for q in seen] or [0.0]
    boxes = [q["box"] for q in seen]
    if boxes:
        ax0 = max(0.0, min(b[0] for b in boxes)); ax1 = min(W, max(b[2] for b in boxes))
        ay0 = max(0.0, min(b[1] for b in boxes)); ay1 = min(H, max(b[3] for b in boxes))
    else:
        ax0 = ax1 = ay0 = ay1 = 0.0
    first = rows[0]["inside"]
    entry = "off-screen" if first == 0 else ("partial" if first < 0.999 else "in frame")
    first_full = next((q["frame"] for q in rows if q["inside"] >= 0.999), None)
    last = rows[-1]
    end_margin = end_x = None
    if last["box"] is not None:
        b = last["box"]
        end_margin = float(min(b[0], W - b[2], b[1] * W / H, (H - b[3]) * W / H) / W)
        end_x = last["centre"][0]
    edge = [q["frame"] for q in rows if first_full is not None and q["frame"] > first_full
            and q["inside"] < 0.999]
    rep = {"res": res, "rows": rows, "size_median": float(np.median(sizes)),
           "size_min": float(min(sizes)), "size_max": float(max(sizes)),
           "action_box": (ax0 / W, ay0 / H, ax1 / W, ay1 / H),
           "action_w": (ax1 - ax0) / W, "action_h": (ay1 - ay0) / H,
           "entry": entry, "first_full": first_full, "last_inside": last["inside"],
           "end_margin": end_margin, "end_x": end_x, "edge_frames": edge, "shadow": []}
    flags = []
    if rep["size_median"] < min_size:
        flags.append(f"subject small: median {rep['size_median']:.1%} of frame height "
                     f"(< {min_size:.0%}); move the camera in, use a longer lens or shorten the travel")
    if max(rep["action_w"], rep["action_h"]) < min_fill:
        flags.append(f"action covers only {rep['action_w']:.0%} x {rep['action_h']:.0%} of the frame; "
                     "frame the action, not the set")
    if rep["action_box"][1] > 0.3:
        flags.append(f"top {rep['action_box'][1]:.0%} of the frame is empty all shot; "
                     "lower or tilt the camera, or tighten")
    if entry == "in frame" and len(rows) > 1:
        flags.append("subject already fully in frame on the first frame; an entering action "
                     "reads better from off-screen or cut by the edge")
    if last["inside"] < 0.999:
        flags.append("final pose is cut by the frame edge")
    elif end_margin is not None and end_margin < edge_margin:
        flags.append(f"final pose within {end_margin:.1%} of the frame edge")
    if edge:
        flags.append(f"subject cut by the frame edge after its entry on frames {edge[:8]}")
    if shadow_frames:
        rep["shadow"] = _shadow_probe(sc, cam, objs, list(shadow_frames), out_dir, dark_eps)
        for s in rep["shadow"]:
            if not s["visible"]:
                flags.append(f"f{s['frame']}: no readable contact shadow "
                             f"({s['shadow_px']} px, darkening {s['darkening']:.3f})")
    rep["flags"] = flags
    return rep


def _shadow_probe(sc, cam, objs, frames, out_dir, dark_eps):
    import numpy as np
    import tempfile
    out_dir = out_dir or tempfile.mkdtemp(prefix="bx_shadow_")
    os.makedirs(out_dir, exist_ok=True)
    r = sc.render
    sh = sc.display.shading
    saved = dict(engine=r.engine, fp=r.filepath, pct=r.resolution_percentage,
                 transp=r.film_transparent, media=r.image_settings.media_type,
                 fmt=r.image_settings.file_format, cmode=r.image_settings.color_mode,
                 light=sh.light, ctype=sh.color_type, scol=tuple(sh.single_color),
                 shadows=sh.show_shadows, outline=sh.show_object_outline, cam=sc.camera,
                 frame=sc.frame_current, stamp=r.use_stamp)
    others = [o for o in sc.objects if o.type not in {"CAMERA", "LIGHT"} and o not in objs
              and not o.hide_render]
    out = []
    try:
        sc.camera = cam
        r.resolution_percentage = max(1, saved["pct"] // 2)
        r.image_settings.media_type = "IMAGE"
        r.image_settings.file_format = "PNG"
        r.image_settings.color_mode = "RGBA"
        r.use_stamp = False
        for f in frames:
            _frame_set(sc, f)
            paths = {k: os.path.join(out_dir, f"shadow_f{int(f):04d}_{k}.png")
                     for k in ("with", "without", "mask")}
            r.filepath = paths["with"]
            bpy.ops.render.render(write_still=True)
            for o in objs:
                o.hide_render = True
            r.filepath = paths["without"]
            bpy.ops.render.render(write_still=True)
            for o in objs:
                o.hide_render = False
            for o in others:
                o.hide_render = True
            r.engine = "BLENDER_WORKBENCH"
            r.film_transparent = True
            sh.light, sh.color_type, sh.single_color = "FLAT", "SINGLE", (0.0, 0.0, 0.0)
            sh.show_shadows, sh.show_object_outline = False, False
            r.filepath = paths["mask"]
            bpy.ops.render.render(write_still=True)
            for o in others:
                o.hide_render = False
            r.engine, r.film_transparent = saved["engine"], saved["transp"]
            sh.light, sh.color_type, sh.single_color = saved["light"], saved["ctype"], saved["scol"]
            sh.show_shadows, sh.show_object_outline = saved["shadows"], saved["outline"]
            A_, B_, M_ = (_load_rgba(paths[k]) for k in ("with", "without", "mask"))
            la, lb = A_[..., :3].mean(axis=2), B_[..., :3].mean(axis=2)
            m = M_[..., 3] > 0.5
            md = m.copy()
            for _ in range(2):                       # dilate the subject mask 2 px
                d = md.copy()
                d[1:] |= md[:-1]; d[:-1] |= md[1:]; d[:, 1:] |= md[:, :-1]; d[:, :-1] |= md[:, 1:]
                md = d
            dark = (lb - la > dark_eps) & ~md
            n = int(dark.sum())
            ys, xs = np.nonzero(dark)
            mys, mxs = np.nonzero(m)
            gap = None
            if n and len(mys):
                bottom = mys.max()
                cols = (xs >= mxs.min() - 2) & (xs <= mxs.max() + 2)
                below = ys[cols] if cols.any() else ys
                gap = float(max(0, below.min() - bottom)) if len(below) else None
            dk = float((lb - la)[dark].mean()) if n else 0.0
            out.append({"frame": f, "shadow_px": n, "subject_px": int(m.sum()), "darkening": dk,
                        "gap_px": gap, "visible": bool(n >= 0.05 * max(int(m.sum()), 1) and dk >= 0.04),
                        "images": paths})
    finally:
        for o in objs + others:
            o.hide_render = False
        r.engine, r.filepath = saved["engine"], saved["fp"]
        r.resolution_percentage = saved["pct"]
        r.film_transparent = saved["transp"]
        r.image_settings.media_type = saved["media"]
        r.image_settings.file_format = saved["fmt"]
        r.image_settings.color_mode = saved["cmode"]
        r.use_stamp = saved["stamp"]
        sh.light, sh.color_type, sh.single_color = saved["light"], saved["ctype"], saved["scol"]
        sh.show_shadows, sh.show_object_outline = saved["shadows"], saved["outline"]
        sc.camera = saved["cam"]
        sc.frame_set(saved["frame"])
    return out


def format_staging(rep):
    """Short text of staging_report for the agent's notes."""
    L = [f"subject size: median {rep['size_median']:.1%}, min {rep['size_min']:.1%}, "
         f"max {rep['size_max']:.1%} of frame height ({rep['res'][0]}x{rep['res'][1]})",
         f"action covers {rep['action_w']:.0%} x {rep['action_h']:.0%} of the frame "
         f"(box {tuple(round(v, 2) for v in rep['action_box'])})",
         f"entry: {rep['entry']}; first fully in frame f{rep['first_full']}; "
         f"end inside {rep['last_inside']:.0%}, margin "
         f"{'-' if rep['end_margin'] is None else format(rep['end_margin'], '.1%')}, "
         f"x {'-' if rep['end_x'] is None else format(rep['end_x'], '.2f')}"]
    for s in rep["shadow"]:
        L.append(f"shadow f{s['frame']}: {'visible' if s['visible'] else 'NOT visible'}, "
                 f"{s['shadow_px']} px (subject {s['subject_px']}), darkening {s['darkening']:.3f}, "
                 f"gap {s['gap_px']} px")
    L.append("flags: " + ("; ".join(rep["flags"]) if rep["flags"] else "none"))
    return "\n".join(L)


def foot_slip(obj, bone, contact_ranges, point="head", up_axis=2, ball=None):
    """Planted-foot test: for each (first, last) contact range, the largest horizontal
    drift from the first frame and the vertical range. Experts want no visible slip
    (the digest uses about 1 mm as the tolerance). `ball` (the toe bone) reports the
    smaller drift of the two points: a heel-to-toe roll moves the ankle while the ball
    stays planted, and the reverse at heel strike."""
    out = []
    h = [i for i in range(3) if i != up_axis]
    for a, b in contact_ranges:
        fr = range(int(a), int(b) + 1)
        slides = []
        for bn in [bone] + ([ball] if ball else []):
            pts = sample_world(obj, fr, bone=bn, point=point)
            slides.append(max(math.hypot(p[h[0]] - pts[0][h[0]], p[h[1]] - pts[0][h[1]]) for p in pts))
            if bn == bone:
                zs = [p[up_axis] for p in pts]
        out.append({"range": (a, b), "slide": min(slides), "lift": max(zs) - min(zs)})
    return out


def foot_contacts(obj, bones, frames, height=0.03, min_frames=3, onset=None, point="head", up_axis=2):
    """Planted ranges of one foot read from the motion itself, for dense keys (baked,
    captured, generated, retargeted) where nobody typed the contacts. `bones` are that
    foot's points (ankle, ball): a frame is planted when one of them is within `height`
    (scene units) of its own lowest point over `frames`, so the floor must be flat.
    Ranges shorter than `min_frames` are dropped. `onset` (units per second) starts a
    range at its first frame slower than that: a swing foot skimming the floor on its
    way down is not planted yet, and a range that never slows (a skim at the clip's end)
    is dropped. Returns [(first, last)] for `foot_slip`."""
    fr = [int(f) for f in frames]
    sc = bpy.context.scene
    fps = sc.render.fps / sc.render.fps_base
    pts = {bn: sample_world(obj, fr, bone=bn, point=point) for bn in bones}
    low = {bn: min(p[up_axis] for p in pts[bn]) for bn in bones}
    down = [any(pts[bn][k][up_axis] - low[bn] < height for bn in bones) for k in range(len(fr))]
    h = [i for i in range(3) if i != up_axis]

    def speed(k):
        # the first frame has no previous one: use its forward difference, so a clip
        # cut mid-skim does not start a range at a speed of zero
        i, j = (k, k + 1) if k == 0 else (k - 1, k)
        if j >= len(fr):
            return 0.0
        return min(math.hypot(pts[bn][j][h[0]] - pts[bn][i][h[0]], pts[bn][j][h[1]] - pts[bn][i][h[1]])
                   for bn in bones) * fps / max(fr[j] - fr[i], 1)

    out, start = [], None
    for k, v in enumerate(down + [False]):
        if v and start is None:
            start = k
        elif not v and start is not None:
            a, b, start = start, k - 1, None
            if onset is not None:
                a = next((j for j in range(a, b + 1) if speed(j) < onset), None)
            if a is not None and b - a + 1 >= min_frames:
                out.append((fr[a], fr[b]))
    return out


def slip_summary(slips, tolerance=0.001):
    """One verdict over many `foot_slip` ranges (a clip, a run of clips, a blended
    sequence): range count, median, p95 and worst slide, and the ranges over
    `tolerance`. A median under the tolerance with a p95 far over it points at a few
    phases (starts, stops, transitions), not at the whole clip."""
    s = sorted(r["slide"] for r in slips)
    if not s:
        return {"ranges": 0, "median": None, "p95": None, "worst": None, "over": []}
    return {"ranges": len(s), "median": statistics.median(s), "p95": s[int(0.95 * (len(s) - 1) + 0.5)],
            "worst": s[-1], "over": [r["range"] for r in slips if r["slide"] > tolerance]}


def transitions(idb, bones=None, data_paths=None, frames=None, eps=1e-4):
    """Per channel, the moves between holds as (start, end, length_in_frames), sampled
    on whole frames: check eye darts (1 to 2 frames), brow changes (3 to 10), snappy
    pose changes (2 to 3) and plosive closures. Returns {"<data_path>[i]": [...]}."""
    out = {}
    for fc in fcurves(idb, bones, data_paths=data_paths):
        ks = [k.co.x for k in fc.keyframe_points]
        f0, f1 = frames or (math.floor(min(ks)), math.ceil(max(ks)))
        vals = [fc.evaluate(f) for f in range(int(f0), int(f1) + 1)]
        moving = [abs(b - a) > eps for a, b in zip(vals, vals[1:])]
        out[f"{fc.data_path}[{fc.array_index}]"] = [
            (int(f0) + i0, int(f0) + i1 + 1, i1 - i0 + 1) for i0, i1 in _runs(moving)]
    return out


def audio_envelope(path, fps=None, start_frame=1):
    """Per-frame loudness (RMS, normalised 0..1) of a sound file, frame -> value, with
    the sound starting at `start_frame`. The agent cannot scrub audio: read the beats,
    stressed words and pauses from this instead of the VSE waveform."""
    import aud
    import numpy as np
    sc = bpy.context.scene
    fps = fps or sc.render.fps / sc.render.fps_base
    snd = aud.Sound(path)
    data = np.asarray(snd.data(), dtype=np.float64)
    rate = snd.specs[0]
    mono = data.mean(axis=1) if data.ndim == 2 else data
    spf = rate / fps
    n = int(len(mono) / spf)
    env = np.array([math.sqrt(float(np.mean(mono[int(i * spf):int((i + 1) * spf)] ** 2)))
                    for i in range(n)])
    env = env / max(env.max(), 1e-12)
    return {start_frame + i: float(v) for i, v in enumerate(env)}


def accent_frames(env, floor=0.2, min_gap=4, count=None, strong=0.75):
    """Syllable peaks (local maxima above `floor`, at least `min_gap` frames apart) and
    the accents among them (>= `strong`, or the `count` loudest). Rik Schutte: open the
    jaw big only on the accents; the other syllables get small opens or are blended.
    Returns {"syllables": [...], "accents": [...]} (frames)."""
    fr = sorted(env)
    peaks = [f for i, f in enumerate(fr[1:-1], 1)
             if env[f] >= floor and env[f] >= env[fr[i - 1]] and env[f] > env[fr[i + 1]]]
    kept = []
    for f in sorted(peaks, key=lambda f: -env[f]):
        if all(abs(f - g) >= min_gap for g in kept):
            kept.append(f)
    kept.sort()
    if count is not None:
        acc = sorted(sorted(kept, key=lambda f: -env[f])[:count])
    else:
        acc = [f for f in kept if env[f] >= strong]
    return {"syllables": kept, "accents": acc}


# --------------------------------------------------------------------------------------
# images (numpy only: Blender ships numpy, not PIL)
# --------------------------------------------------------------------------------------
_FONT = {
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111",
    "3": "111001111001111", "4": "101101111001001", "5": "111100111001111",
    "6": "111100111101111", "7": "111001010010010", "8": "111101111101111",
    "9": "111101111001111", "-": "000000111000000", ".": "000000000000010",
    " ": "000000000000000", "f": "011010111010010",
}


def _text(img, x, y, s, color, scale=2):
    h, w = img.shape[:2]
    for ch in s:
        g = _FONT.get(ch, _FONT[" "])
        for r in range(5):
            for c in range(3):
                if g[r * 3 + c] == "1":
                    y0, x0 = y + r * scale, x + c * scale
                    if 0 <= y0 < h - scale and 0 <= x0 < w - scale:
                        img[y0:y0 + scale, x0:x0 + scale, :3] = color
        x += 4 * scale


def _line(img, p0, p1, color, width=2):
    import numpy as np
    h, w = img.shape[:2]
    n = int(max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]))) + 1
    n = min(n, 20000)
    xs = np.linspace(p0[0], p1[0], n)
    ys = np.linspace(p0[1], p1[1], n)
    for ox in range(-(width // 2), width - width // 2):
        for oy in range(-(width // 2), width - width // 2):
            xi = np.round(xs + ox).astype(int)
            yi = np.round(ys + oy).astype(int)
            ok = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)    # off-image parts are skipped,
            img[yi[ok], xi[ok], :3] = color                      # never clamped onto the edge


def _dot(img, x, y, color, r=3):
    h, w = img.shape[:2]
    x, y = int(round(x)), int(round(y))
    if x + r < 0 or y + r < 0 or x - r >= w or y - r >= h:
        return                                  # off-image (a negative slice end would wrap)
    img[max(0, y - r):min(h, y + r + 1), max(0, x - r):min(w, x + r + 1), :3] = color


def _load_rgba(path):
    import numpy as np
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(buf)
    bpy.data.images.remove(im)
    return buf.reshape(h, w, 4)[::-1].copy()            # top row first


def _save_rgba(arr, path):
    import numpy as np
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), dtype=arr.dtype)], axis=2)
    im = bpy.data.images.new("bx_anim_img", w, h, alpha=True)
    im.pixels.foreach_set(np.ascontiguousarray(arr[::-1], dtype=np.float32).ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)
    return path


def _ramp(t):
    a, b = (0.2, 0.45, 0.95), (0.9, 0.2, 0.15)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def _auto_camera(sc, objs, frames, view, res, margin=1.15):
    dirs = {"front": Vector((0, -1, 0)), "back": Vector((0, 1, 0)), "right": Vector((1, 0, 0)),
            "left": Vector((-1, 0, 0)), "top": Vector((0, 0, 1))}
    d = dirs[view]
    pts = []
    cur = sc.frame_current
    for f in frames:
        _frame_set(sc, f)
        for o in objs:
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    sc.frame_set(cur)
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    center = (lo + hi) / 2
    fwd = -d
    up = Vector((0, 0, 1)) if abs(fwd.z) < 0.99 else Vector((0, 1, 0))
    right = fwd.cross(up).normalized()
    up = right.cross(fwd)
    rel = [p - center for p in pts]
    half_w = max(abs(r.dot(right)) for r in rel)
    half_h = max(abs(r.dot(up)) for r in rel)
    aspect = res[0] / res[1]
    cam = bpy.data.objects.new("BX_onion_cam", bpy.data.cameras.new("BX_onion_cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "HORIZONTAL"
    cam.data.ortho_scale = 2 * max(half_w, half_h * aspect) * margin
    dist = (hi - lo).length * 2 + 1
    cam.location = center + d * dist
    cam.rotation_euler = Matrix((right, up, -fwd)).transposed().to_euler()
    cam.data.clip_end = dist * 4
    return cam


def onion_skin(out_path, frames, objects=None, camera=None, view=None, res=(960, 540),
               track=None, highlight=(), label_every=None, spread=0):
    """Onion-skin contact image: every frame's silhouette rendered with Workbench and
    stacked (blue = early, red = late, outline per frame, filled darker on `highlight`
    frames), plus projected paths with frame numbers for `track` items
    [(obj, bone_or_None, point), ...]. Camera: `camera` if given, else an automatic
    orthographic camera when `view` is front/back/left/right/top, else the scene camera
    (else front). Only `objects` render. `spread` > 0 shifts each frame that many
    pixels to the right (Nacho de Andres' past-left/future-right view): in-place motion
    becomes readable and key poses sit side by side like an animator flipping them.
    Scene settings are restored. Individual frames are kept next to the image."""
    import numpy as np
    sc = bpy.context.scene
    frames = list(frames)
    objects = objects or [o for o in sc.objects if o.type == "MESH" and not o.hide_render]
    r = sc.render
    sh = sc.display.shading
    saved = dict(engine=r.engine, filepath=r.filepath, rx=r.resolution_x, ry=r.resolution_y,
                 pct=r.resolution_percentage, transp=r.film_transparent,
                 media=r.image_settings.media_type, fmt=r.image_settings.file_format,
                 cmode=r.image_settings.color_mode, light=sh.light, ctype=sh.color_type,
                 scol=tuple(sh.single_color), vt=sc.view_settings.view_transform,
                 cam=sc.camera, frame=sc.frame_current, stamp=r.use_stamp)
    hidden = [o for o in sc.objects if o.type not in {"CAMERA", "LIGHT"} and o not in objects
              and not o.hide_render]
    tmp_cam = None
    stem = os.path.splitext(out_path)[0]
    fdir = stem + "_frames"
    os.makedirs(fdir, exist_ok=True)
    layers, tracks_px = [], [[] for _ in (track or [])]
    try:
        for o in hidden:
            o.hide_render = True
        r.engine = "BLENDER_WORKBENCH"
        r.resolution_x, r.resolution_y, r.resolution_percentage = res[0], res[1], 100
        r.film_transparent = True
        r.image_settings.media_type = "IMAGE"
        r.image_settings.file_format = "PNG"
        r.image_settings.color_mode = "RGBA"
        r.use_stamp = False                               # no burn-in inside the layers
        sh.light, sh.color_type, sh.single_color = "FLAT", "SINGLE", (0.0, 0.0, 0.0)
        sc.view_settings.view_transform = "Standard"
        if camera is not None:
            sc.camera = camera
        elif view or sc.camera is None:
            tmp_cam = _auto_camera(sc, objects, frames, view or "front", res)
            sc.camera = tmp_cam
        for f in frames:
            _frame_set(sc, f)
            p = os.path.join(fdir, f"f{int(f):04d}.png")
            r.filepath = p
            bpy.ops.render.render(write_still=True)
            layers.append(_load_rgba(p))
            for ti, (obj, bone, point) in enumerate(track or []):
                wp = sample_world(obj, [f], bone=bone, point=point)[0]
                tracks_px[ti].append(to_camera([wp], sc.camera, sc, res)[0])
        h, w0 = layers[0].shape[:2]
        n = len(layers)
        spread = int(spread)
        w = w0 + spread * (n - 1)
        canvas = np.ones((h, w, 3), dtype=np.float32)
        for i, (f, lay) in enumerate(zip(frames, layers)):
            x0 = i * spread
            a = lay[..., 3:4]
            col = np.array(_ramp(i / max(n - 1, 1)), dtype=np.float32)
            op = 0.45 if f in highlight else (0.35 if spread else 0.10)
            sub = canvas[:, x0:x0 + w0]
            sub[:] = sub * (1 - a * op) + col * a * op
            m = lay[..., 3] > 0.5
            er = m.copy()
            er[1:] &= m[:-1]; er[:-1] &= m[1:]; er[:, 1:] &= m[:, :-1]; er[:, :-1] &= m[:, 1:]
            sub[m & ~er] = col
        img = np.concatenate([canvas, np.ones((h, w, 1), dtype=np.float32)], axis=2)
        tracks_px = [[(x + i * spread, y, z) for i, (x, y, z) in enumerate(pts)]
                     for pts in tracks_px]
        every = label_every or max(1, n // 24)
        placed = []                                       # label boxes already drawn
        for ti, pts in enumerate(tracks_px):
            for (x0, y0, _), (x1, y1, _) in zip(pts, pts[1:]):
                _line(img, (x0, y0), (x1, y1), (0.1, 0.1, 0.1), 1)
            order = sorted(range(len(pts)), key=lambda i: frames[i] not in highlight)
            for i in order:                               # highlighted frames label first
                x, y, _ = pts[i]
                col = _ramp(i / max(n - 1, 1))
                big = frames[i] in highlight
                _dot(img, x, y, (0, 0, 0), 4 if big else 3)
                _dot(img, x, y, col, 3 if big else 2)
                if i % every == 0 or big:
                    lab = f"{int(frames[i])}"
                    bx0, by0 = int(x) + 6, int(y) - 14
                    box = (bx0, by0, bx0 + 8 * len(lab), by0 + 10)
                    if any(box[0] < b[2] and b[0] < box[2] and box[1] < b[3] and b[1] < box[3]
                           for b in placed):
                        continue                          # skip labels that would overlap
                    placed.append(box)
                    _text(img, bx0, by0, lab, (0.05, 0.05, 0.05))
        _text(img, 8, 8, f"f{int(frames[0])}-{int(frames[-1])}", (0.1, 0.1, 0.1), 3)
        _save_rgba(img, out_path)
        with open(stem + "_legend.txt", "w") as fh:
            fh.write(f"onion skin frames {frames[0]}..{frames[-1]} ({n}), spread {spread}px; colour blue=early, "
                     f"red=late; filled darker = highlight {list(highlight)}; black-ringed dots "
                     f"= tracked points, numbers = frame\ntracks: "
                     + ", ".join(f"{o.name}:{b or 'origin'}:{p}" for o, b, p in (track or [])))
    finally:
        for o in hidden:
            o.hide_render = False
        r.engine, r.filepath = saved["engine"], saved["filepath"]
        r.resolution_x, r.resolution_y, r.resolution_percentage = saved["rx"], saved["ry"], saved["pct"]
        r.film_transparent = saved["transp"]
        r.image_settings.media_type = saved["media"]
        r.image_settings.file_format = saved["fmt"]
        r.image_settings.color_mode = saved["cmode"]
        sh.light, sh.color_type, sh.single_color = saved["light"], saved["ctype"], saved["scol"]
        sc.view_settings.view_transform = saved["vt"]
        r.use_stamp = saved["stamp"]
        sc.camera = saved["cam"]
        sc.frame_set(saved["frame"])
        if tmp_cam:
            data = tmp_cam.data
            bpy.data.objects.remove(tmp_cam)
            bpy.data.cameras.remove(data)
    return out_path


_PALETTE = [(0.85, 0.2, 0.2), (0.2, 0.65, 0.25), (0.2, 0.4, 0.9), (0.85, 0.55, 0.1),
            (0.6, 0.25, 0.8), (0.1, 0.65, 0.7), (0.5, 0.5, 0.5), (0.8, 0.3, 0.6)]


def graph_image(out_path, idb, bones=None, data_paths=None, frames=None, size=(1200, 520),
                normalize=True):
    """The agent's Graph Editor: each channel's evaluated curve (normalised per channel
    like the Normalize toggle, or shared scale) with its keys coloured by key type
    (pink extreme, blue breakdown, grey moving hold, white keyframe), vertical grid
    every 5 frames with frame numbers. The legend (colour -> channel, value range) is
    written next to the image."""
    import numpy as np
    fcs = fcurves(idb, bones, data_paths=data_paths)
    if not fcs:
        raise ValueError("no F-curves match")
    if frames is None:
        ks = [k.co.x for fc in fcs for k in fc.keyframe_points]
        frames = (math.floor(min(ks)), math.ceil(max(ks)))
    f0, f1 = frames
    W, H = size
    ml, mr, mt, mb = 40, 20, 20, 40
    img = np.ones((H, W, 4), dtype=np.float32)
    img[..., :3] = 0.16
    xs = np.linspace(f0, f1, (W - ml - mr))

    def X(f):
        return ml + (f - f0) / max(f1 - f0, 1e-9) * (W - ml - mr)
    step = 5 if f1 - f0 <= 120 else 10
    for f in range(int(math.ceil(f0 / step) * step), int(f1) + 1, step):
        _line(img, (X(f), mt), (X(f), H - mb), (0.24, 0.24, 0.24), 1)
        _text(img, int(X(f)) - 6, H - mb + 8, str(f), (0.7, 0.7, 0.7))
    curves = [(fc, np.array([fc.evaluate(float(x)) for x in xs])) for fc in fcs]
    glo = min(float(v.min()) for _, v in curves)
    ghi = max(float(v.max()) for _, v in curves)
    legend = []
    for ci, (fc, vals) in enumerate(curves):
        lo, hi = (float(vals.min()), float(vals.max())) if normalize else (glo, ghi)
        span = hi - lo if hi - lo > 1e-9 else 1.0

        def Y(v):
            return H - mb - (v - lo) / span * (H - mt - mb)
        col = _PALETTE[ci % len(_PALETTE)]
        pts = [(X(x), Y(v)) for x, v in zip(xs, vals)]
        for p, q in zip(pts, pts[1:]):
            _line(img, p, q, col, 2)
        for k in fc.keyframe_points:
            if f0 <= k.co.x <= f1:
                _dot(img, X(k.co.x), Y(k.co.y), (0, 0, 0), 5)
                _dot(img, X(k.co.x), Y(k.co.y), KEY_COLORS.get(k.type, (1, 1, 1)), 3)
        name = f"{fc.data_path}[{fc.array_index}]"
        legend.append(f"colour {col}: {name} range {lo:.4g}..{hi:.4g}")
        _dot(img, 10, mt + 10 + ci * 12, col, 4)
    _save_rgba(img, out_path)
    with open(os.path.splitext(out_path)[0] + "_legend.txt", "w") as fh:
        fh.write(f"frames {f0}..{f1}, {'normalised per channel' if normalize else 'shared scale'}; "
                 "key dots: pink EXTREME, blue BREAKDOWN, grey MOVING_HOLD, white KEYFRAME, "
                 "green JITTER\n" + "\n".join(legend))
    return out_path




# --------------------------------------------------------------------------------------
# playblast staging: contact-readable light, floor, rotation-revealing texture
# --------------------------------------------------------------------------------------
def playblast_lighting(scene=None, camera=None, key_dir=(0.0, 0.0, 1.0), shadow=0.55,
                       studio_light="clay_studio.exr", background=(0.72, 0.74, 0.77)):
    """Workbench look where contacts and heights read [added, measured on 5.2.1]:
    MATCAP lighting (a light floor stays light at a grazing view: 0.65 to 0.68
    luminance against 0.41 to 0.55 with STUDIO), material colours, object outline,
    cast shadows at `shadow` intensity, and a KEY DIRECTION IN WORLD SPACE (towards the
    light). Workbench's `scene.display.light_direction` is camera-relative: (0, 0, 1)
    lights from the camera and hides the shadow behind the subject. This converts
    `key_dir` through the camera once; call it again if the camera moves. Default
    straight overhead: the shadow sits under the subject, so the gap between them on
    screen is the height and the contact is where they meet. Returns the values used."""
    sc = scene or bpy.context.scene
    cam = camera or sc.camera
    sh = sc.display.shading
    sc.render.engine = "BLENDER_WORKBENCH"
    sh.light = "MATCAP"
    sh.studio_light = studio_light
    sh.color_type = "MATERIAL"
    sh.show_shadows = True
    sh.shadow_intensity = shadow
    sh.show_object_outline = True
    sh.show_cavity = False
    sc.view_settings.view_transform = "Standard"
    world = sc.world or bpy.data.worlds.new("World")
    sc.world = world
    world.color = background
    bpy.context.view_layer.update()              # matrix_world is stale until evaluated
    d = Vector(key_dir).normalized()
    view = cam.matrix_world.to_3x3().inverted() @ d
    sc.display.light_direction = tuple(view)
    return {"key_dir_world": tuple(d), "light_direction_view": tuple(view),
            "shadow_intensity": shadow, "studio_light": studio_light}


def floor_slab(name="floor", x=(-3.0, 3.0), y=(-1.0, 8.0), z=0.0, thickness=0.2,
               color=(0.80, 0.76, 0.68)):
    """Closed box floor with its top at `z` [from the E3 run]. Workbench shadows are
    stencil shadows that expect closed casters; an open plane running behind the camera
    threw a stray shadow trapezoid there. Keep `y[0]` in front of the camera."""
    import bmesh
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    cx, cy = (x[0] + x[1]) / 2, (y[0] + y[1]) / 2
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((cx, cy, z - thickness / 2)) @
                          Matrix.Diagonal((x[1] - x[0], y[1] - y[0], thickness, 1.0)))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(_material(f"{name}_mat", color))
    return ob


def _material(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1.0)                              # Workbench MATERIAL colour
    nt = getattr(m, "node_tree", None)
    bsdf = next((n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None) if nt else None
    if bsdf:                                                   # EEVEE / Cycles colour
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.6
    return m


def rotation_texture(obj, sectors=8, axis="Y", colors=((0.78, 0.12, 0.05), (0.90, 0.85, 0.72)),
                     marker=(0.08, 0.08, 0.10)):
    """Pinwheel of `sectors` alternating wedges around the roll axis (object local
    `axis`) so rotation reads from a side camera, like the baseline E3 ball; one wedge
    in `marker` colour breaks the symmetry so the direction reads even when the stripes
    strobe [added]. Wagon-wheel rule: roll per frame must stay under half the pattern
    period, 360 / sectors degrees (check with roll_aliasing). Assigns materials by face
    centre; works on any mesh. Returns the pattern data."""
    me = obj.data
    base = len(me.materials)
    for i, rgb in enumerate(list(colors) + ([marker] if marker else [])):
        me.materials.append(_material(f"{obj.name}_roll_{i}", rgb))
    a, b = {"X": (1, 2), "Y": (2, 0), "Z": (0, 1)}[axis]
    step = 2 * math.pi / sectors
    for p in me.polygons:
        c = p.center
        k = int(((math.atan2(c[b], c[a]) % (2 * math.pi)) // step)) % sectors
        p.material_index = base + (2 if (marker and k == 0) else k % 2)
    return {"sectors": sectors, "period_deg": 720.0 / sectors, "max_step_deg": 360.0 / sectors}


def roll_aliasing(obj, frames, sectors=8, index=1):
    """Largest rotation per frame of `rotation_euler[index]` against the wagon-wheel
    limit of a `sectors` pinwheel (360 / sectors degrees): above it the pattern appears
    to spin backwards or stand still [added, sampling]."""
    sc = bpy.context.scene
    cur = sc.frame_current
    vals = []
    try:
        for f in frames:
            _frame_set(sc, f)
            vals.append(obj.rotation_euler[index])
    finally:
        sc.frame_set(cur)
    step = max((abs(math.degrees(b - a)) for a, b in zip(vals, vals[1:])), default=0.0)
    lim = 360.0 / sectors
    return {"max_step_deg": step, "limit_deg": lim, "ok": step < lim}


# --------------------------------------------------------------------------------------
# bouncing ball
# --------------------------------------------------------------------------------------
WEIGHTS = {"light": 0.15, "medium": 0.5, "heavy": 0.85}


def _lerp(a, b, t):
    return a + (b - a) * t


def squash_modifier(obj, name="Squash", aim_axis="Y"):
    """World-aligned, volume-kept squash and stretch as a Geometry Nodes modifier on
    the animated object itself (the E3 baseline and with-skill runs both built this).
    Inputs: Squash (1 round, < 1 squash, > 1 stretch) along an axis tilted by Aim
    (radians, from world +Z toward +X, about world `aim_axis`). The tree undoes the
    object's own rotation, scales in world axes, then re-applies the rotation, so the
    squash stays floor-aligned and the roll is never twisted by the aim (object scale
    must stay 1). Returns {"modifier", "squash", "aim"} with keyable data paths."""
    gname = f"BX_WorldSquash_{aim_axis}"
    ng = bpy.data.node_groups.get(gname)
    if ng is None:
        ng = bpy.data.node_groups.new(gname, "GeometryNodeTree")
        I = ng.interface
        I.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
        s = I.new_socket(name="Squash", in_out="INPUT", socket_type="NodeSocketFloat")
        s.default_value, s.min_value, s.max_value = 1.0, 0.05, 5.0
        a = I.new_socket(name="Aim", in_out="INPUT", socket_type="NodeSocketFloat")
        a.default_value, a.subtype = 0.0, "ANGLE"
        I.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
        N, L = ng.nodes, ng.links
        gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
        so, oi = N.new("GeometryNodeSelfObject"), N.new("GeometryNodeObjectInfo")
        L.new(so.outputs[0], oi.inputs["Object"])
        pos = N.new("GeometryNodeInputPosition")
        r1 = N.new("FunctionNodeRotateVector")                     # local -> world axes
        L.new(pos.outputs[0], r1.inputs["Vector"])
        L.new(oi.outputs["Rotation"], r1.inputs["Rotation"])
        neg = N.new("ShaderNodeMath")
        neg.operation = "MULTIPLY"
        neg.inputs[1].default_value = -1.0
        L.new(gi.outputs["Aim"], neg.inputs[0])
        va = N.new("ShaderNodeVectorRotate")                       # aim axis -> +Z
        va.rotation_type = f"{aim_axis}_AXIS"
        L.new(r1.outputs[0], va.inputs["Vector"])
        L.new(neg.outputs[0], va.inputs["Angle"])
        pw = N.new("ShaderNodeMath")
        pw.operation = "POWER"
        pw.inputs[1].default_value = -0.5
        L.new(gi.outputs["Squash"], pw.inputs[0])
        cx = N.new("ShaderNodeCombineXYZ")                         # s * (1/sqrt s)^2 = 1
        L.new(pw.outputs[0], cx.inputs["X"])
        L.new(pw.outputs[0], cx.inputs["Y"])
        L.new(gi.outputs["Squash"], cx.inputs["Z"])
        mul = N.new("ShaderNodeVectorMath")
        mul.operation = "MULTIPLY"
        L.new(va.outputs[0], mul.inputs[0])
        L.new(cx.outputs[0], mul.inputs[1])
        vb = N.new("ShaderNodeVectorRotate")                       # back to the aim axis
        vb.rotation_type = f"{aim_axis}_AXIS"
        L.new(mul.outputs[0], vb.inputs["Vector"])
        L.new(gi.outputs["Aim"], vb.inputs["Angle"])
        inv = N.new("FunctionNodeInvertRotation")
        L.new(oi.outputs["Rotation"], inv.inputs[0])
        r2 = N.new("FunctionNodeRotateVector")                     # world -> local axes
        L.new(vb.outputs[0], r2.inputs["Vector"])
        L.new(inv.outputs[0], r2.inputs["Rotation"])
        sp = N.new("GeometryNodeSetPosition")
        L.new(gi.outputs["Geometry"], sp.inputs["Geometry"])
        L.new(r2.outputs[0], sp.inputs["Position"])
        L.new(sp.outputs[0], go.inputs["Geometry"])
        for i, n in enumerate([gi, so, oi, pos, r1, neg, va, pw, cx, mul, vb, inv, r2, sp, go]):
            n.location = (i * 200, 0)
    mod = obj.modifiers.get(name) or obj.modifiers.new(name, "NODES")
    mod.node_group = ng
    ids = {it.name: it.identifier for it in ng.interface.items_tree
           if it.item_type == "SOCKET" and it.in_out == "INPUT"}
    ins = mod.properties.inputs
    return {"modifier": mod, "squash": getattr(ins, ids["Squash"]).path_from_id("value"),
            "aim": getattr(ins, ids["Aim"]).path_from_id("value")}


def bouncing_ball(name="Ball", start=1, end=48, contacts=4, height=1.2, radius=None,
                  travel=2.0, weight=0.5, rebound=None, squash=None, stretch=None,
                  friction=None, burst=0.0, floor=0.0, fit=True, rest=None, hold=None,
                  first_apex=None, contact_handles="PARABOLA", origin=(0.0, 0.0),
                  floor_plane=True, obj=None, texture=True, sectors=8):
    """Animate ONE object as a bouncing ball: location x/z, roll rotation_euler[1] and
    two inputs of a world-aligned squash modifier (squash_modifier), all keyed on that
    object. Pass `obj` to animate an existing mesh (the brief's named object; radius
    from its size), else a UV sphere `name` with a rotation_texture is created. Travel
    runs along +X (negative `travel` for -X), roll about +Y.

    Physics and principles: one gravity for the whole shot; every flight is an exact
    parabola through whole-frame contacts with no apex keys needed (FREE handles at a
    third of each segment on the parabola's slope, so an apex between two frames is
    exact); flight lengths are whole frames, odd or even, chosen from the requested
    heights (height x rebound^n), and the apex_heights returned are the real ones;
    squash on the contact frame with volume kept, scaled by impact speed; stretch along
    the velocity on the frames either side of a contact when the flight is 5 frames or
    longer, clamped off the floor; aim keyed per frame (stepped) only while the shape
    is not round; roll = distance / radius at every sub-frame, so it never slips or
    twists; horizontal speed x `friction` at each contact; roll to a stop with constant
    deceleration, then `hold` frames (default up to 6: Alex Nagy's time to read a pose).

    `first_apex`: frame of the first apex (default `start`); earlier than `start` means
    the ball enters already falling (thrown in from off-screen), later means it rises
    first. `height` is that apex's bottom clearance. `origin` is the ball's x, y at
    `start`. weight 0..1 or 'light'/'medium'/'heavy' sets rebound (0.7 to 0.35),
    squash (0.35 to 0.08), stretch (0.25 to 0.04) and friction (0.9 to 0.7) unless given
    [added mapping; heavy 0.35 keeps a third hop readable, E3 run]. fit=True scales
    gravity so the action fills start..end: read `gravity_ratio` (1.0 = real).
    fit=False keeps real gravity; the shot still ends at `end` (the roll and hold take
    what is left) unless `rest` is given (then it ends `rest` frames after the last
    contact). `burst`
    0..1 pulls each pre-contact frame back along the arc (Raymond Luc's burst): the
    last gap opens, the path stays on the parabola. contact_handles='VECTOR' is Dillon
    Gu's quick shortcut (apex keys, softer than a parabola).
    Sets the scene frame range. Returns a dict (object, contacts, apex times and real
    heights, gravity, data paths, notes)."""
    w = WEIGHTS.get(weight, weight) if isinstance(weight, str) else float(weight)
    w = min(max(w, 0.0), 1.0)
    rebound = _lerp(0.7, 0.35, w) if rebound is None else rebound
    squash = _lerp(0.35, 0.08, w) if squash is None else squash
    stretch = _lerp(0.25, 0.04, w) if stretch is None else stretch
    friction = _lerp(0.9, 0.7, w) if friction is None else friction
    sc = bpy.context.scene
    fps = sc.render.fps / sc.render.fps_base
    g_real = gravity(fps)["accel_per_frame2"]               # units per frame^2
    first_apex = start if first_apex is None else first_apex
    notes = []

    # --- object ---------------------------------------------------------------------
    import bmesh
    created = obj is None
    if created:
        radius = radius or 0.15
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=radius)
        bm.to_mesh(me)
        bm.free()
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        obj = bpy.data.objects.new(name, me)
        sc.collection.objects.link(obj)
    else:
        radius = radius or max(obj.dimensions) / 2
    if tuple(obj.scale) != (1.0, 1.0, 1.0):
        notes.append("object scale is not 1: the world squash assumes unit scale")
    obj.rotation_mode = "XYZ"
    paths = squash_modifier(obj)
    pattern = rotation_texture(obj, sectors) if (created and texture) else None
    plane = None
    if floor_plane:
        x_lo, x_hi = sorted((origin[0] - 1.0, origin[0] + travel + 1.0))
        plane = floor_slab(f"{obj.name}_floor", x=(x_lo - 2.0, x_hi + 2.0),
                           y=(origin[1] - 3.0, origin[1] + 6.0), z=floor)

    # --- timing ---------------------------------------------------------------------
    req = [height * rebound ** n for n in range(contacts)]
    ideal = [math.sqrt(2 * req[0] / g_real)] + [math.sqrt(8 * h / g_real) for h in req[1:]]
    total = end - start
    pre = first_apex - start
    rest_given = rest
    rest = rest if rest is not None else max(3, round(0.12 * total))
    if fit:
        room = total - rest - pre
        if room <= len(ideal):
            raise ValueError("no room for the bounces: raise end, lower rest or contacts")
        scale = room / sum(ideal)
    else:
        scale = 1.0
    T = [max(1, round(ideal[0] * scale))] + [max(2, round(t * scale)) for t in ideal[1:]]
    zc = lambda s: floor + radius * s                          # centre, bottom on the floor
    z_apex0 = floor + radius + req[0]
    g_est = g_real / scale ** 2
    for _ in range(3):
        # impact-scaled squash, the one gravity of the shot (exact through the first
        # drop), then whole-frame flights whose real apex matches the requested height
        v_imp = [g_est * T[0]] + [0.5 * g_est * t for t in T[1:]]
        q = [v / v_imp[0] for v in v_imp]
        sz = [1 - squash * qi for qi in q]
        g = 2 * (z_apex0 - zc(sz[0])) / T[0] ** 2
        T = T[:1] + [max(2, round(math.sqrt(8 * (req[n] + radius * (1 - (sz[n - 1] + sz[n]) / 2)) / g)))
                     for n in range(1, contacts)]
        g_est = g
    v_imp = [g * T[0]] + [0.5 * g * t for t in T[1:]]
    q = [v / v_imp[0] for v in v_imp]
    sz = [1 - squash * qi for qi in q]                     # sz[0] (and so g) is unchanged
    C = []
    f = first_apex
    for t in T:
        f += t
        C.append(f)
    end_f = end if (fit or rest_given is None) else C[-1] + rest
    end_f = max(end_f, C[-1] + 2)
    hold = min(6, (end_f - C[-1]) // 3) if hold is None else hold
    stop_f = max(end_f - hold, C[-1] + 1)
    flights = [(first_apex, z_apex0, C[0], zc(sz[0]))] + \
              [(C[i], zc(sz[i]), C[i + 1], zc(sz[i + 1])) for i in range(contacts - 1)]

    def fl_of(t, side="R"):
        for k, (ta, za, tb, zb) in enumerate(flights):
            if (ta <= t < tb) or (t == tb and side == "L") or (k == 0 and t < ta):
                return k
        return None

    def z_at(t, k):
        ta, za, tb, zb = flights[k]
        T_ = tb - ta
        return za + (zb - za) * (t - ta) / T_ + 0.5 * g * (t - ta) * (tb - t)

    def dz_at(t, k):
        ta, za, tb, zb = flights[k]
        return (zb - za) / (tb - ta) + 0.5 * g * (ta + tb - 2 * t)

    apex_t, heights = [first_apex], [req[0]]
    for k in range(1, len(flights)):
        ta, za, tb, zb = flights[k]
        t_ = (ta + tb) / 2 + (zb - za) / (g * (tb - ta))
        apex_t.append(t_)
        heights.append(z_at(t_, k) - floor - radius)
        if tb - ta < 3 or heights[-1] < 0.2 * radius:
            notes.append(f"bounce {k}: {heights[-1]:.3f} high over {tb - ta} frames will barely read")
    ratio = g / g_real
    if not 0.8 <= ratio <= 1.25:
        notes.append(f"timing implies {ratio:.2f}x real gravity at this size: "
                     + ("reads floaty or slow motion" if ratio < 1 else "reads sped up or tiny"))

    # --- horizontal: v0 before C1, x friction at each contact, constant deceleration --
    speeds = [friction ** i for i in range(contacts + 1)]      # before C1, after C1, ...
    unit = (C[0] - start) + sum(speeds[i + 1] * (C[i + 1] - C[i]) for i in range(contacts - 1)) \
        + speeds[contacts] * (stop_f - C[-1]) / 2
    v0 = travel / unit if unit else 0.0

    def x_at(t):
        if t <= C[0]:
            return origin[0] + v0 * (t - start)
        x = origin[0] + v0 * (C[0] - start)
        for i in range(contacts - 1):
            if t <= C[i + 1]:
                return x + v0 * speeds[i + 1] * (t - C[i])
            x += v0 * speeds[i + 1] * (C[i + 1] - C[i])
        vr, L = v0 * speeds[contacts], stop_f - C[-1]
        u = min(max(t - C[-1], 0.0), L)
        return x + vr * u - vr * u * u / (2 * L) if L > 0 else x

    def vx_at(t):
        if t < C[0]:
            return v0
        for i in range(contacts - 1):
            if t < C[i + 1]:
                return v0 * speeds[i + 1]
        return 0.0

    cb = channelbag(obj, create=True)
    fx = cb.fcurves.find("location", index=0) or cb.fcurves.new("location", index=0, group_name="Object Transforms")
    fy = cb.fcurves.find("location", index=1) or cb.fcurves.new("location", index=1, group_name="Object Transforms")
    fz = cb.fcurves.find("location", index=2) or cb.fcurves.new("location", index=2, group_name="Object Transforms")
    fr = cb.fcurves.find("rotation_euler", index=1) or cb.fcurves.new("rotation_euler", index=1, group_name="Object Transforms")
    fs = cb.fcurves.ensure(paths["squash"], index=0)
    fa = cb.fcurves.ensure(paths["aim"], index=0)
    _insert(fy, start, origin[1], "KEYFRAME", "CONSTANT")
    f_first = min(start, first_apex)

    def key_x(frame, kt, interp):
        xv = x_at(frame)
        _insert(fx, frame, xv, kt, interp)
        _insert(fr, frame, (xv - origin[0]) / radius, kt, interp)

    x_frames = [f_first] + C + [stop_f] + ([end_f] if end_f > stop_f else [])
    for fr_ in x_frames:
        key_x(fr_, "EXTREME", "QUAD" if fr_ == C[-1] else "LINEAR")
    for fc in (fx, fr):
        _key_at(fc, C[-1]).easing = "EASE_OUT"

    # --- vertical keys and exact parabola handles ---------------------------------------
    zpts = ([start] if start < first_apex else []) + [first_apex] + C
    for t in zpts:
        k = fl_of(t, "L") if t in C else fl_of(t)
        v = zc(sz[C.index(t)]) if t in C else z_at(t, k)
        _insert(fz, t, v, "EXTREME" if t != start or t == first_apex else "KEYFRAME", "BEZIER", "FREE")
    settle = [(C[-1] + 2, 1 + 0.3 * (1 - sz[-1])), (C[-1] + 4, 1.0)]
    settle = [(fr_, s) for fr_, s in settle if fr_ <= end_f]
    for fr_, s in settle:
        _insert(fz, fr_, zc(s), "MOVING_HOLD", "BEZIER", "AUTO_CLAMPED")
    vector = contact_handles == "VECTOR"
    for p, n in zip(zpts, zpts[1:]):
        k = fl_of(p)
        kp, kn = _key_at(fz, p), _key_at(fz, n)
        L = n - p
        kp.handle_right = (p + L / 3, kp.co.y + dz_at(p, k) * L / 3)
        kn.handle_left = (n - L / 3, kn.co.y - dz_at(n, k) * L / 3)
    k0 = _key_at(fz, zpts[0])
    k0.handle_left = (zpts[0] - 1 / 3, k0.co.y - dz_at(zpts[0], 0) / 3)
    kl = _key_at(fz, C[-1])
    nxt = settle[0][0] if settle else C[-1] + 3
    kl.handle_right = (C[-1] + (nxt - C[-1]) / 3, kl.co.y)
    if vector:
        for k in range(1, len(flights)):
            fa_ = int(round(apex_t[k]))
            _insert(fz, fa_, z_at(fa_, k), "EXTREME", "BEZIER", "AUTO_CLAMPED")
        for c in C:
            _style(_key_at(fz, c), handle="VECTOR")
        _style(_key_at(fz, first_apex), handle="AUTO_CLAMPED")
    fz.update()
    for p, n in zip(zpts, zpts[1:]):                       # update() may recalc FREE handles
        if vector:
            break
        k = fl_of(p)
        kp, kn = _key_at(fz, p), _key_at(fz, n)
        L = n - p
        kp.handle_right = (p + L / 3, kp.co.y + dz_at(p, k) * L / 3)
        kn.handle_left = (n - L / 3, kn.co.y - dz_at(n, k) * L / 3)

    # --- burst: pre-contact frame pulled back along the arc (path unchanged) ------------
    if burst > 0 and not vector:
        for i, c in enumerate(C):
            k = i                                          # the flight arriving at C[i]
            p = [t for t in zpts if t < c][-1]             # previous key on that flight
            if c - p < 4:
                continue
            tb = c - 1 - burst
            _insert(fz, c - 1, z_at(tb, k), "BREAKDOWN", "LINEAR", "FREE")
            kz = _key_at(fz, c - 1)
            kz.handle_left = ((c - 1) - (c - 1 - p) / 3, z_at(tb, k) - dz_at(tb, k) * (tb - p) / 3)
            kp = _key_at(fz, p)
            kp.handle_right = (p + (c - 1 - p) / 3, kp.co.y + dz_at(p, k) * (tb - p) / 3)
            xb = x_at(tb)
            _insert(fx, c - 1, xb, "BREAKDOWN", "LINEAR")
            _insert(fr, c - 1, (xb - origin[0]) / radius, "BREAKDOWN", "LINEAR")
        fz.update()
    for fc in (fx, fr):
        fc.update()

    # --- squash / stretch and aim on the modifier ---------------------------------------
    def axis_angle(t):
        k = fl_of(t)
        vz = dz_at(t, k) if k is not None and t < C[-1] else 0.0
        vx = vx_at(t)
        if vz < 0:
            vx, vz = -vx, -vz                              # an axis, not a direction
        return math.atan2(vx, vz)

    def stretched(fr_, qi):
        ang = axis_angle(fr_)
        s = 1 + stretch * qi
        zc_f = fz.evaluate(fr_)
        for _ in range(40):                                # keep the ellipsoid off the floor
            a_, b_ = radius * s, radius / math.sqrt(s)
            ext = math.sqrt((a_ * math.cos(ang)) ** 2 + (b_ * math.sin(ang)) ** 2)
            if zc_f - ext >= floor - 1e-6 or s <= 1.0:
                break
            s = 1 + (s - 1) * 0.8
        return s

    skeys = {}
    for k, t_ in enumerate(apex_t):
        for fa_ in {math.floor(t_ + 1e-9), math.ceil(t_ - 1e-9)}:
            skeys[fa_] = (1.0, "EXTREME")
    for i, c in enumerate(C):
        skeys[c] = (sz[i], "EXTREME")
        T_in = T[i]
        if (i == 0 and T_in >= 3) or T_in >= 5:
            if c - 1 not in skeys:
                skeys[c - 1] = (stretched(c - 1, q[i]), "BREAKDOWN")
        if i + 1 < contacts and T[i + 1] >= 5 and c + 1 not in skeys:
            skeys[c + 1] = (stretched(c + 1, q[i + 1]), "BREAKDOWN")
    for fr_, s in settle:
        skeys[fr_] = (s, "MOVING_HOLD")
    for fr_ in sorted(skeys):
        s, kt = skeys[fr_]
        _insert(fs, fr_, s, kt, "BEZIER", "AUTO_CLAMPED")
    fs.update()
    _insert(fa, f_first, 0.0, "KEYFRAME", "CONSTANT")
    for fr_ in range(int(f_first), int(C[-1]) + 1):
        if fr_ in C:
            ang = 0.0
        elif abs(fs.evaluate(fr_) - 1.0) > 1e-4:
            ang = axis_angle(fr_)
        else:
            continue
        _insert(fa, fr_, ang, "KEYFRAME", "CONSTANT")
    fa.update()

    sc.frame_start, sc.frame_end = start, end_f
    return {"object": obj, "mesh": obj, "floor": plane, "contacts": C, "flights": T,
            "apex_times": apex_t, "apex_heights": heights, "heights_requested": req,
            "first_apex": first_apex, "stop": stop_f, "end": end_f, "fps": fps,
            "radius": radius, "squash_values": sz,
            "gravity_per_frame2": g, "gravity_effective": g * fps ** 2,
            "gravity_ratio": ratio, "paths": paths, "pattern": pattern,
            "params": {"weight": w, "rebound": rebound, "squash": squash, "stretch": stretch,
                       "friction": friction, "burst": burst, "hold": hold},
            "notes": notes}
