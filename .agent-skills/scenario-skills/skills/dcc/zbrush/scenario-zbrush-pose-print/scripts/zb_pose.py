"""
zb_pose: the in-ZBrush half of scenario-zbrush-pose-print. Posing (clean project and ZPR save,
Transpose Master with a point-order guard before TPose>SubT, ZSphere rigs built by code,
Proxy Pose, rigid moves of whole SubTools with a full rotation plus translation, pose import
onto a layer) and print prep (brief box, export scale in millimetres, per-part OBJ export,
DynaMesh shell and inner-shell cutter, From Thickness, primitives for keys and cutters,
boolean flags, masked decimation), plus the pure-Python rotation math both need. The
measurements on exported meshes live in zb_print (agent side, numpy).

Runs INSIDE ZBrush 2026 (CPython 3.11.9, no numpy). From the agent side:
    import sys; sys.path.insert(0, "<skills/scenario-zbrush-pose-print/scripts>")
    import zb_pose
    zb_pose.call("preflight_tpose")                  # through the proven bridge (zb_launch)
    zb_pose.call("set_export_scale", 300.0)
    zb_pose.call("export_parts", "/abs/out/parts")
Inside ZBrush it imports zb_ops (<skills>/scenario-zbrush-expert/scripts) and uses its checked
wrappers; it never re-implements them.

Evidence tags on paths (PATHS):
  [strings] label or full item path present in the 2026.2.1 UI string resources
            (ZData/ZLang/english/UInterface.zsc, read 2026-09-24): the item exists in the
            build; the exact path is still [verify]
  [log]     written by ZBrush in Logs/Activity (2026-09-24 sessions)
  [macro]   used by a shipped 2026.2.1 macro (ZData/Macros)
  [doc]     Maxon docs or SDK;  [verify] inferred, the wrapper tries it and fails loudly
NOTHING in this module has run in ZBrush yet ("not yet run in ZBrush"); the live checks are
tests/code/zbrush-pose-print/live_p0*.py.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import json
import math
import os
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
EXPERT_SCRIPTS = os.path.normpath(os.path.join(_HERE, "..", "..", "scenario-zbrush-expert", "scripts"))
_added = EXPERT_SCRIPTS not in sys.path
if _added:
    sys.path.insert(0, EXPERT_SCRIPTS)
try:
    import zb_ops  # noqa: E402  (lead toolkit: resolve, set_checked, press, stats, exports)
finally:
    if _added and EXPERT_SCRIPTS in sys.path:
        sys.path.remove(EXPERT_SCRIPTS)

try:
    from zbrush import commands as zbc
except ImportError:  # agent side and offline tests: use(fake)
    zbc = None


class ZBPoseError(RuntimeError):
    pass


def use(z):
    """Point this module and zb_ops at the same zbrush.commands (a fake in offline tests)."""
    global zbc
    zbc = z
    zb_ops.zbc = z


def _z():
    if zbc is None:
        raise ZBPoseError("zbrush.commands not available: run inside ZBrush (zb_pose.call)")
    if zb_ops.zbc is not zbc:
        zb_ops.zbc = zbc
    return zbc


PATHS = {
    # Transpose Master (ZPlugin). The shipped label of the transfer button is "TPose|SubT"
    # in the resources; the UI draws "TPose>SubT".
    "tm_tposemesh": ["Zplugin:Transpose Master:TPoseMesh"],                           # [strings]
    "tm_to_subt": ["Zplugin:Transpose Master:TPose|SubT", "Zplugin:Transpose Master:TPose>SubT",
                   "Zplugin:Transpose Master:TPoseSubT"],                             # [strings]
    "tm_zsphere_rig": ["Zplugin:Transpose Master:ZSphere Rig"],                       # [strings]
    "tm_grps": ["Zplugin:Transpose Master:Grps"],                                     # [strings]
    "tm_layer": ["Zplugin:Transpose Master:Layer"],                                   # [strings]
    "tm_store_rig": ["Zplugin:Transpose Master:StoreTM Rig"],                         # [strings]
    "tm_paste_rig": ["Zplugin:Transpose Master:PasteTM Rig"],                         # [strings]
    # Proxy Pose (Tool > Geometry sub-palette, 2023.1)
    "proxy": ["Tool:Geometry:Proxy Pose:Proxy Pose", "Tool:Geometry:Proxy Pose"],    # [strings]
    "proxy_reduction": ["Tool:Geometry:Proxy Pose:Reduction Amount", "Tool:Geometry:Reduction Amount"],
    "proxy_keep_details": ["Tool:Geometry:Proxy Pose:Keep Details", "Tool:Geometry:Keep Details"],
    "proxy_keep_current": ["Tool:Geometry:Proxy Pose:Keep Current", "Tool:Geometry:Keep Current"],
    "proxy_overwrite": ["Tool:Geometry:Proxy Pose:Overwrite Pose", "Tool:Geometry:Overwrite Pose"],
    "proxy_groups": ["Tool:Geometry:Proxy Pose:ProxyGroups", "Tool:Geometry:ProxyGroups",
                     "Tool:Geometry:Proxy Pose:Proxy Groups"],                       # [strings]
    # ZSphere rigging and Adaptive Skin
    "rig_select": ["Tool:Rigging:Select Mesh"],                                       # [strings]
    "rig_bind": ["Tool:Rigging:Bind Mesh"],                                           # [strings]
    "askin_density": ["Tool:Adaptive Skin:Density"],                                  # [strings]
    "askin_dynamesh": ["Tool:Adaptive Skin:DynaMesh Resolution", "Tool:Adaptive Skin:Dynamesh Resolution"],
    "askin_make": ["Tool:Adaptive Skin:Make Adaptive Skin"],                          # [strings]
    "askin_preview": ["Tool:Adaptive Skin:Preview"],                                  # [verify]
    # 3D layers (records by default when created: Munoz Gomez oxyK [00:42:34])
    "layer_new": ["Tool:Layers:New"],                                                 # [strings]
    # geometry of the active SubTool (internal units)
    "x_pos": ["Tool:Geometry:X Position"], "y_pos": ["Tool:Geometry:Y Position"],   # [macro]
    "z_pos": ["Tool:Geometry:Z Position"],                                            # [macro]
    "x_size": ["Tool:Geometry:X Size"], "y_size": ["Tool:Geometry:Y Size"],         # [macro] Y Size
    "z_size": ["Tool:Geometry:Z Size"], "xyz_size": ["Tool:Geometry:XYZ Size"],     # [macro]
    "show_all": ["Tool:Visibility:ShowPt"],                                           # [macro] unhide all
    "close_holes": ["Tool:Geometry:Modify Topology:Close Holes", "Tool:Geometry:Close Holes"],
    # export scale: OBJ coordinates = internal x Scale (+ offsets) [verify order]
    "export_scale": ["Tool:Export:Scale"],                                            # [doc] "Scale Factor" [strings]
    "export_x_off": ["Tool:Export:X Offset"], "export_y_off": ["Tool:Export:Y Offset"],
    "export_z_off": ["Tool:Export:Z Offset"],                                         # [strings]
    "export_grp": ["Tool:Export:Grp"],                                                # [strings] polygroups as OBJ groups
    "import": ["Tool:Import"],                                                        # [bridge v03 exists]
    # DynaMesh shell (Create Shell needs a negative insert in the DynaMesh)
    "dyn_thickness": ["Tool:Geometry:DynaMesh:Thickness", "Tool:Geometry:Thickness"],  # [strings] Shell Thickness
    "dyn_create_shell": ["Tool:Geometry:DynaMesh:Create Shell", "Tool:Geometry:Create Shell"],
    # PolyPaint From Thickness. 2026.2.1 resources carry Min Thickness / Max Thickness /
    # Thickness Range and the Ball or Ray algorithm; the 2020 doc says Min Range / Max Range.
    "from_thickness": ["Tool:Polypaint:From Thickness"],                              # [strings]
    "ft_min": ["Tool:Polypaint:Min Thickness", "Tool:Polypaint:Min Range",
               "Preferences:Analysis:Min Thickness"],                                 # [strings] [verify place]
    "ft_max": ["Tool:Polypaint:Max Thickness", "Tool:Polypaint:Max Range",
               "Preferences:Analysis:Max Thickness"],
    "ft_max_polys": ["Preferences:Analysis:Max Thickness Polygons"],                  # [log] 8 on this Mac
    # primitives for keys and cutters (Append a QCube macro: Append, PopUp:PolyMesh3D, Initialize)
    "append": ["Tool:SubTool:Append"],                                                # [bridge]
    "duplicate": ["Tool:SubTool:Duplicate"],                                          # [bridge]
    "init_x_res": ["Tool:Initialize:X Res"], "init_y_res": ["Tool:Initialize:Y Res"],  # [macro]
    "init_z_res": ["Tool:Initialize:Z Res"],                                          # [macro]
    "init_qcube": ["Tool:Initialize:QCube"],                                          # [macro]
    "init_qsphere": ["Tool:Initialize:QSphere"],                                      # [strings]
    "init_qcyl_x": ["Tool:Initialize:QCyl X"], "init_qcyl_y": ["Tool:Initialize:QCyl Y"],
    "init_qcyl_z": ["Tool:Initialize:QCyl Z"],                                        # [strings]
    "unify": ["Tool:Deformation:Unify"],                                              # [macro]
    # booleans and splits
    "live_boolean": ["Render:Render Booleans:Live Boolean", "Render:Live Boolean"],  # [strings] [verify]
    "make_boolean": ["Tool:SubTool:Boolean:Make Boolean Mesh", "Render:Render Booleans:Make Boolean Mesh",
                     "Tool:SubTool:Make Boolean Mesh"],                               # [strings] [verify]
    "split_groups": ["Tool:SubTool:Split:Groups Split", "Tool:SubTool:Groups Split"],  # [strings]
    "split_parts": ["Tool:SubTool:Split:Split To Parts", "Tool:SubTool:Split To Parts"],
    "split_unmasked": ["Tool:SubTool:Split:Split Unmasked Points", "Tool:SubTool:Split Unmasked Points"],
    "merge_down": ["Tool:SubTool:Merge:MergeDown", "Tool:SubTool:MergeDown", "Tool:SubTool:Merge Down"],
    "move_down": ["Tool:SubTool:MoveDown", "Tool:SubTool:Arrange:MoveDown"],        # [strings] label
    "intersection_mask": ["Zplugin:Intersection Masker:Create Intersection Mask"],  # [strings]
    # deformation (applies once per set, respects masks)
    "deform_rotate": ["Tool:Deformation:Rotate"],                                     # [doc palette ref]
    "deform_offset": ["Tool:Deformation:Offset"],                                     # [doc] % of unit radius
    "deform_inflate": ["Tool:Deformation:Inflate", "Tool:Deformation:Inflat"],        # [bridge]
    # 3D Print Hub (Update Size Ratios opens a dialog [doc]; export buttons [verify])
    "ph_update": ["Zplugin:3D Print Hub:Update Size Ratios"],                         # [strings]
    "ph_stl": ["Zplugin:3D Print Hub:Export to STL"],                                 # [strings]
    "ph_3mf": ["Zplugin:3D Print Hub:Export to 3MF"],                                 # [strings]
    "ph_obj": ["Zplugin:3D Print Hub:Export to OBJ"],                                 # [strings]
    "ph_y_mm": ["Zplugin:3D Print Hub:Y(mm)"],                                        # [log]
    # Scale Master (Set Scene Scale opens a choice dialog [doc])
    "sm_set_scene": ["Zplugin:Scale Master:Set Scene Scale"],                         # [strings]
    "sm_resize": ["Zplugin:Scale Master:Resize Subtool"],                             # [strings]
    "sm_new_bbox": ["Zplugin:Scale Master:New Bounding Box Subtool"],                 # [strings]
    "sm_all": ["Zplugin:Scale Master:All"],                                           # [strings]
    # projects and tools: the Transpose Master clean-project tip (doc Tips)
    "file_open": ["File:Open"],                                                       # [verify]
    "tool_load": ["Tool:Load Tool"],                                                  # [strings] label
    # masks that need no canvas gesture (stand-ins for painted masks, [added])
    "mask_cavity": ["Tool:Masking:Mask By Cavity"],                                   # [strings]
    "mask_peaks": ["Tool:Masking:Mask PeaksAndValleys"],                              # [strings]
    "mask_by_polygroups": ["Brush:Auto Masking:Mask By Polygroups"],                  # [macro]
    # mould checks (Hasbro, doc): only when the part will be moulded or cast
    "group_front": ["Tool:Polygroups:Group Front"],                                   # [strings] [verify place]
    "draft_analysis": ["Transform:Draw Draft Analysis"],                              # [strings] [doc]
}

# The doc's clean project is DefaultCube.ZPR; the 2026.2.1 install ships no such file, only
# Lightbox/Projects/DefaultProject.ZPR and Cube.ZPR (local 2026-09-24) [verify equivalent].
DEFAULT_PROJECT = "/Applications/Maxon ZBrush 2026/Lightbox/Projects/DefaultProject.ZPR"
# Sign of a positive Deformation:Rotate value about its axis: 1 = counter-clockwise seen
# from +axis (right-handed) [verify] (live_p03).
ROTATE_SIGN = 1.0

# Deformation axis bits for set_mod (zb_ops.deform: x=1, y=2, z=4 in GUI order [doc])
AXIS_BITS = {"x": 1, "y": 2, "z": 4}
# Geometry slider axes against OBJ export axes. The shipped Snap To Ground macro sets
# Y Position = -(Y Size / 2) to put a SubTool on the ground, which suggests internal +Y
# points down while the OBJ export is Y up (v03 analysis). (1, -1, -1) is [verify] (live_p03).
GEOM_SIGNS = (1.0, -1.0, -1.0)


def _p(key, required=True):
    return zb_ops.resolve(PATHS[key] if key in PATHS else key, required)


def _set(key, value, tol=1e-3):
    return zb_ops.set_checked(PATHS[key], value, tol)


def _press(key, check_enabled=True):
    return zb_ops.press(PATHS[key], check_enabled)


# ============================================================================================
# Pure math (both sides, no numpy)
# ============================================================================================

def _unit(v):
    n = math.sqrt(sum(c * c for c in v))
    if n == 0:
        raise ValueError("zero vector")
    return [c / n for c in v]


def rot_matrix(axis, deg):
    """Rodrigues rotation matrix (right-handed, degrees)."""
    x, y, z = _unit(axis)
    a = math.radians(deg)
    c, s, t = math.cos(a), math.sin(a), 1 - math.cos(a)
    return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y],
            [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
            [t * x * z - s * y, t * y * z + s * x, t * z * z + c]]


def _mv(m, v):
    return [sum(m[r][k] * v[k] for k in range(3)) for r in range(3)]


def rotate_about(p, pivot, axis, deg):
    r = rot_matrix(axis, deg)
    d = [p[k] - pivot[k] for k in range(3)]
    q = _mv(r, d)
    return [q[k] + pivot[k] for k in range(3)]


def descendants(parents, i):
    """Indices below node i in a parent-index tree (root parent = -1)."""
    kids = {}
    for k, p in enumerate(parents):
        kids.setdefault(int(p), []).append(k)
    out, todo = [], list(kids.get(int(i), []))
    while todo:
        k = todo.pop()
        out.append(k)
        todo.extend(kids.get(k, []))
    return sorted(out)


def fk_rotate(positions, parents, joint, axis, deg):
    """Rotate every descendant of `joint` about the joint position: a ZSphere rotation with R
    on the joint (Pavlovich irnu [00:06:45]). Bone lengths stay; the joint itself stays."""
    pos = [list(map(float, p)) for p in positions]
    piv = pos[int(joint)]
    for k in descendants(parents, joint):
        pos[k] = rotate_about(pos[k], piv, axis, deg)
    return pos


def fk_pose(positions, parents, plan):
    """Apply a pose plan [{"joint": i, "axis": [x,y,z], "angle": deg}, ...] in order.
    Pose from the centre outward, parents first (Pavlovich irnu [00:13:26]); rotations only,
    moving or scaling bones stretches the mesh (irnu [00:13:58])."""
    pos = [list(map(float, p)) for p in positions]
    for step in plan:
        pos = fk_rotate(pos, parents, step["joint"], step["axis"], step["angle"])
    return pos


def pivot_correction(center, pivot, axis, deg):
    """Translation t so that 'rotate about center, then move by t' equals 'rotate about
    pivot': t = (j - c) - R (j - c). Deformation:Rotate turns a SubTool about its own centre
    [verify]; this moves it back onto the joint."""
    d = [pivot[k] - center[k] for k in range(3)]
    rd = _mv(rot_matrix(axis, deg), d)
    return [d[k] - rd[k] for k in range(3)]


def obj_to_internal(p, export_scale=1.0, signs=GEOM_SIGNS):
    """OBJ export coordinates (mm after set_export_scale) to Geometry slider and ZSphere
    coordinates: divide by the export scale, apply the axis signs [verify live_p03]."""
    return [float(p[k]) / float(export_scale) * signs[k] for k in range(3)]


def internal_to_obj(p, export_scale=1.0, signs=GEOM_SIGNS):
    return [float(p[k]) * signs[k] * float(export_scale) for k in range(3)]


def euler_xyz(R):
    """Angles (ax, ay, az) in degrees with R = Rz(az) Ry(ay) Rx(ax): the order in which three
    one-axis Deformation Rotate calls about X, then Y, then Z compose. R: 3x3 nested list."""
    r20 = max(-1.0, min(1.0, float(R[2][0])))
    ay = math.degrees(math.asin(-r20))
    if abs(r20) < 1.0 - 1e-9:
        ax = math.degrees(math.atan2(R[2][1], R[2][2]))
        az = math.degrees(math.atan2(R[1][0], R[0][0]))
    else:  # gimbal lock: fold Z into X
        ax = math.degrees(math.atan2(-R[1][2], R[1][1]))
        az = 0.0
    return [ax, ay, az]


def from_euler_xyz(ax, ay, az):
    """Rz(az) Ry(ay) Rx(ax), the inverse of euler_xyz."""
    rz, ry, rx = rot_matrix((0, 0, 1), az), rot_matrix((0, 1, 0), ay), rot_matrix((1, 0, 0), ax)

    def mm(a, b):
        return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return mm(rz, mm(ry, rx))


def obj_topology(path):
    """Point count, face count and a hash of the face index lists of an OBJ (vertex indices
    only): the same hash means the same point order, which a TPose transfer needs."""
    import hashlib
    h = hashlib.sha1()
    nv = nf = 0
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("v "):
                nv += 1
            elif line.startswith("f "):
                nf += 1
                h.update((" ".join(t.split("/")[0] for t in line.split()[1:]) + "\n").encode())
    return {"points": nv, "faces": nf, "sha1": h.hexdigest()}


def decimate_percent(faces_now, target_faces):
    """Decimation Master '% of decimation' for about target_faces (100 none, 0.01 max)."""
    return round(min(100.0, max(0.01, 100.0 * float(target_faces) / float(faces_now))), 2)


def obj_vertex_count(path):
    n = 0
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("v "):
                n += 1
    return n


# ============================================================================================
# Inventory and Transpose Master
# ============================================================================================

def subtool_name():
    """Active SubTool name: last segment of get_active_tool_path (Maxon export example),
    else the title of Tool:SubTool:ItemInfo without its trailing dot (ZScript idiom)."""
    z = _z()
    try:
        p = z.get_active_tool_path()
        if p:
            name = p.replace("\\", "/").rsplit("/", 1)[-1].strip()
            if name:
                return name
    except Exception:
        pass
    for path in ("Tool:SubTool:ItemInfo", "Tool:ItemInfo"):
        if z.exists(path):
            return z.get_title(path).strip().rstrip(".").strip()
    return None


def _bbox_differs(a, b, rel=1e-4):
    span = max(abs(b[3] - b[0]), abs(b[4] - b[1]), abs(b[5] - b[2]), 1e-12)
    return any(abs(x - y) > rel * span for x, y in zip(a, b))


def inventory():
    """Per SubTool: name, visibility, counts, level, full and visible bboxes, solid flag.
    Restores the active SubTool."""
    z = _z()
    n = int(z.get_subtool_count())
    cur = int(z.get_active_subtool_index())
    vis = {s["index"]: s for s in zb_ops.subtools()}
    rows = []
    try:
        for i in range(n):
            z.select_subtool(i)
            st = zb_ops.stats(bbox_mode=1)
            try:
                vb = [float(v) for v in z.query_mesh3d(2, 0)]
            except Exception:
                vb = st.get("bbox")
            row = {"index": i, "name": subtool_name(), "visible": vis.get(i, {}).get("visible"),
                   "status": vis.get(i, {}).get("status"), "points": st.get("points"),
                   "faces": st.get("faces"), "sdiv": st.get("sdiv"), "sdiv_max": st.get("sdiv_max"),
                   "bbox": st.get("bbox"), "bbox_visible": vb, "solid": st.get("solid"),
                   "volume": st.get("volume"), "area": st.get("area")}
            row["partially_hidden"] = bool(vb and st.get("bbox") and _bbox_differs(vb, st["bbox"]))
            rows.append(row)
    finally:
        z.select_subtool(cur)
    return {"tool": z.get_active_tool_path(), "count": n, "active": cur, "subtools": rows}


def show_all(index=None):
    """Unhide every polygon of one SubTool (index) or of all: Tool:Visibility:ShowPt, as the
    shipped GrpUnMasked macro uses it after HidePt [macro]."""
    z = _z()
    cur = int(z.get_active_subtool_index())
    targets = range(int(z.get_subtool_count())) if index is None else [int(index)]
    done = []
    try:
        for i in targets:
            z.select_subtool(i)
            _press("show_all", check_enabled=False)
            done.append(i)
    finally:
        z.select_subtool(cur)
    return {"shown": done}


def set_visible(index, visible=True):
    """Eye bit (0x1) of one SubTool. set_subtool_status toggles the bits it is given (SDK),
    so the bit is sent only when the state differs, then read back. Used to hide the brief
    box before set_export_scale and the outer shell copy after keep_inner_shell."""
    z = _z()
    cur = int(z.get_subtool_status(index))
    if bool(cur & 0x1) != bool(visible):
        z.set_subtool_status(index, 0x1)
    got = int(z.get_subtool_status(index))
    if bool(got & 0x1) != bool(visible):
        raise ZBPoseError(f"SubTool {index}: eye bit still {bool(got & 0x1)} (status {got:#x})")
    return {"index": int(index), "visible": bool(got & 0x1)}


def clean_project(ztl_path, project=DEFAULT_PROJECT):
    """Transpose Master from a clean project (doc Tips): save the tool as a versioned ZTL,
    open a default project, Load Tool, so the pose cannot land on another model when parts
    also exist as separate tools. Opening a ZPR deletes every loaded tool (lead traps): the
    ZTL is checked on disk before the project opens. File:Open and Tool:Load Tool with a
    preset file name are [verify] (live_p08)."""
    z = _z()
    before = inventory()
    saved = zb_ops.save_ztl(ztl_path)
    if not os.path.exists(saved["path"]) or os.path.getsize(saved["path"]) == 0:
        raise ZBPoseError(f"{saved['path']} not written: the project was NOT opened")
    if not os.path.exists(project):
        raise ZBPoseError(f"{project} not found: pass a clean .ZPR (the doc's DefaultCube.ZPR "
                          "is not in the 2026 install)")
    z.set_next_filename(os.path.abspath(project))
    _press("file_open", check_enabled=False)
    z.update(redraw_ui=True)
    z.set_next_filename(saved["path"])
    _press("tool_load", check_enabled=False)
    z.update(redraw_ui=True)
    after = inventory()
    same = [r["points"] for r in after["subtools"]] == [r["points"] for r in before["subtools"]]
    return {"ztl": saved["path"], "project": project, "tool": after["tool"],
            "subtools": after["count"], "ok": bool(same and after["count"] == before["count"])}


def save_project(path):
    """File:Save As to a versioned .ZPR (never overwrites). Transpose Master data lives in
    the project since 4R6 (doc Saving/Loading): save one before a session ends with a TPose
    mesh open, or TPose>SubT has nothing to return to. Dialog-free is [verify] (live_p08)."""
    path = os.path.abspath(os.path.expanduser(path))
    if not path.lower().endswith(".zpr"):
        path += ".zpr"
    return zb_ops._file_op("file_save_as", zb_ops.next_version(path), overwrite=False)


def level1_density(indices=None):
    """Edge length estimate sqrt(area / faces) at the lowest level of each SubTool: parts that
    bend together need similar values, because mask blur spreads per polygon (Plouffe lakC
    [00:29:36] [00:30:08]). Moves each SubTool to SDiv 1 and back."""
    z = _z()
    cur = int(z.get_active_subtool_index())
    out = []
    try:
        for i in (indices if indices is not None else range(int(z.get_subtool_count()))):
            z.select_subtool(i)
            sd = zb_ops.resolve("sdiv", required=False)
            was = z.get(sd) if sd else 1.0
            if sd and was > 1:
                zb_ops.set_checked("sdiv", 1, tol=0.5)
            faces = int(z.query_mesh3d(1)[0])
            area = float(z.get_polymesh3d_area())
            if sd and was > 1:
                zb_ops.set_checked("sdiv", was, tol=0.5)
            out.append({"index": i, "name": subtool_name(), "faces_l1": faces, "area": area,
                        "edge_l1": math.sqrt(area / faces) if faces else None})
    finally:
        z.select_subtool(cur)
    return out


def preflight_tpose(density_ratio=2.0, fix_hidden=True, heavy_faces=500000):
    """Checks before TPoseMesh. Problems block; warnings go to the report.
    - partially hidden SubTools give a Vertex Mismatch on transfer (TPoseMesh warning, doc):
      fixed by ShowPt when fix_hidden, else a problem (the bbox test cannot see hidden
      polygons inside the hull: ShowPt is the real guarantee, so it runs on every SubTool)
    - hidden SubTools are left out of the combined mesh
    - duplicate names (Decimation Master and GoZ need unique ones later)
    - no lower levels on a heavy SubTool: ZRemesher + Project first, or Proxy Pose (doc
      Expert Tip); heavy_faces 500k is [added]
    - level-1 density spread above density_ratio ([added] threshold for Plouffe's rule)"""
    problems, warnings = [], []
    if fix_hidden:
        try:
            show_all()
        except zb_ops.ZBOpError as e:
            warnings.append(f"could not unhide ({e}); relying on the bbox test only")
    inv = inventory()
    rows = inv["subtools"]
    for r in rows:
        if r["partially_hidden"]:
            problems.append(f"SubTool {r['index']} {r['name']!r} is partially hidden: Vertex Mismatch "
                            "on TPose>SubT (doc)")
        if r["visible"] is False:
            warnings.append(f"SubTool {r['index']} {r['name']!r} is hidden: it will not be posed")
        if (r.get("sdiv_max") or 1) <= 1 and (r.get("faces") or 0) > heavy_faces:
            warnings.append(f"SubTool {r['index']} {r['name']!r} has {r['faces']} faces and no lower "
                            "level: ZRemesher + Project (scenario-zbrush-retopology-export) or Proxy Pose")
    names = [r["name"] for r in rows]
    dups = sorted({n for n in names if names.count(n) > 1})
    if dups:
        warnings.append(f"duplicate SubTool names {dups}: rename at creation (Decimation Master, GoZ)")
    dens = level1_density([r["index"] for r in rows if r["visible"] is not False])
    edges = [d["edge_l1"] for d in dens if d["edge_l1"]]
    spread = (max(edges) / min(edges)) if edges else 1.0
    if spread > density_ratio:
        warnings.append(f"level-1 edge length varies {spread:.1f}x across visible SubTools: equalise "
                        "the lowest levels of parts that bend together, or plan hand masks (Plouffe)")
    return {"ok": not problems, "problems": problems, "warnings": warnings, "tool": inv["tool"],
            "subtools": rows, "density": dens, "density_spread": spread}


def tpose_mesh(layer=True, groups=True, zsphere_rig=False, force=False):
    """ZPlugin > Transpose Master > TPoseMesh with the Layer, Grps and ZSphere Rig switches.
    A ZScript plugin press: whether control returns to Python is [verify] (live_p01).
    Returns the source inventory (needed by tpose_to_subtools) and the combined mesh."""
    z = _z()
    pre = preflight_tpose()
    if not pre["ok"] and not force:
        raise ZBPoseError("preflight failed: " + "; ".join(pre["problems"]))
    for key, val in (("tm_layer", layer), ("tm_grps", groups), ("tm_zsphere_rig", zsphere_rig)):
        _set(key, 1 if val else 0, tol=0.5)
    source = z.get_active_tool_path()
    t = time.time()
    _press("tm_tposemesh", check_enabled=False)
    z.update(redraw_ui=True)
    after = zb_ops.stats()
    visible_l1 = sum(d["faces_l1"] for d in pre["density"])
    return {"source_tool": source, "tpose_tool": z.get_active_tool_path(), "seconds": round(time.time() - t, 2),
            "combined": after, "visible_l1_faces": visible_l1, "preflight": pre,
            "note": "TPose mesh faces should equal the visible level-1 faces [added check]"}


def tpose_to_subtools(expected=None, rest_obj=None, force=False):
    """TPose>SubT: transfer the pose back. expected: the 'preflight' part of tpose_mesh()
    (point counts per SubTool) to prove nothing was destroyed afterwards. rest_obj: the
    export_tpose OBJ written right after TPoseMesh; the posed TPose mesh is exported again and
    its face lists compared BEFORE the press, because a Gizmo 3D deformer (Bend Arc, Bend
    Curve, Twist, Taper, any Gizmo modifier) can reorder points and destroy SubTools on
    transfer (doc TPoseMesh warning); a reorder keeps the point count, so counts alone miss
    it. A changed order refuses the transfer unless force."""
    z = _z()
    order = None
    if rest_obj:
        now = zb_ops.next_version(os.path.splitext(os.path.abspath(rest_obj))[0] + "_pretransfer.obj")
        export_tpose(now)
        a, b = obj_topology(rest_obj), obj_topology(now)
        order = {"rest": a, "now": b, "path": now, "same": a == b}
        if not order["same"] and not force:
            raise ZBPoseError("TPose mesh point order changed since TPoseMesh (a Gizmo deformer?): "
                              "TPose>SubT refused, it can destroy SubTools (doc). Reload the saved "
                              f"ZTL and pose with rotations or a rig only. {a} vs {b}")
    t = time.time()
    _press("tm_to_subt", check_enabled=False)
    z.update(redraw_ui=True)
    inv = inventory()
    out = {"tool": inv["tool"], "seconds": round(time.time() - t, 2), "subtools": inv["subtools"],
           "order_check": order}
    if expected:
        # the transfer should land back on the source tool [verify]; if the TPose tool is
        # still active, select the source tool and call inventory() before judging
        out["tool_is_source"] = inv["tool"] == expected.get("tool")
        before = {r["index"]: r["points"] for r in expected["subtools"]}
        changed = [r["index"] for r in inv["subtools"] if before.get(r["index"]) != r["points"]]
        out["points_changed"] = changed
        out["ok"] = out["tool_is_source"] and not changed and inv["count"] == len(before)
    return out


def export_tpose(path, groups=False, overwrite=False):
    """OBJ of the TPose mesh for an external rig (scenario-blender-rigging) or for joint_centres.
    groups=True writes polygroups as OBJ groups (Tool:Export:Grp [verify]); keep it False for
    the round trip so no importer splits the mesh."""
    p = _p("export_grp", required=False)
    old = None
    if p:
        old = _z().get(p)
        zb_ops.set_checked(PATHS["export_grp"], 1 if groups else 0, tol=0.5)
    try:
        return zb_ops.export_obj(path, overwrite=overwrite)
    finally:
        if p is not None and old is not None:
            _z().set(p, old)


def import_pose(obj_path, level=1, new_layer=False):
    """Bring a posed OBJ back (Munoz Gomez oxyK [00:43:39]): optionally a new recording layer
    at the highest level, then the lowest level, then Tool:Import. Refuses when the OBJ point
    count differs from the current level: a different mesh replaces the SubTool and kills
    its levels (oxyK [00:40:59])."""
    z = _z()
    sd = zb_ops.resolve("sdiv", required=False)
    out = {}
    if new_layer and sd:
        zb_ops.set_checked("sdiv", z.get_max(sd), tol=0.5)
        _press("layer_new", check_enabled=False)
        out["layer"] = True
    if sd and z.get(sd) != level:
        zb_ops.set_checked("sdiv", level, tol=0.5)
    here = int(z.query_mesh3d(0)[0])
    n = obj_vertex_count(obj_path)
    if n != here:
        raise ZBPoseError(f"{obj_path} has {n} points, the current level has {here}: not the same mesh")
    v0 = float(z.get_polymesh3d_volume())
    z.set_next_filename(os.path.abspath(obj_path))
    _press("import", check_enabled=False)
    z.update(redraw_ui=True)
    out.update(points=int(z.query_mesh3d(0)[0]), volume_before=v0,
               volume_after=float(z.get_polymesh3d_volume()),
               preset_consumed=not z.has_next_filename())
    out["ok"] = out["points"] == here and out["preset_consumed"]
    return out


# ============================================================================================
# ZSphere rigs by code
# ============================================================================================

ZS_X, ZS_Y, ZS_Z, ZS_R, ZS_PARENT = 1, 2, 3, 4, 7


def zs_read():
    """[{"pos", "radius", "parent"}] of the active ZSphere tool (get_zsphere, SDK)."""
    z = _z()
    n = int(z.get_zsphere(0, 0, 0))
    return [{"pos": [float(z.get_zsphere(k, i, 0)) for k in (ZS_X, ZS_Y, ZS_Z)],
             "radius": float(z.get_zsphere(ZS_R, i, 0)), "parent": int(z.get_zsphere(ZS_PARENT, i, 0))}
            for i in range(n)]


def zs_build(nodes):
    """Replace the active ZSphere tool's tree by `nodes` (index order, parents first, node 0
    is the root with parent -1). Children are deleted in reverse order first, as Maxon's
    biped example does (a deleted parent blocks its children)."""
    z = _z()
    for i, nd in enumerate(nodes):
        if i and not 0 <= int(nd["parent"]) < i:
            raise ValueError(f"node {i}: parent {nd['parent']} must come before it")

    def edit():
        count = int(z.get_zsphere(0, 0, 0))
        for i in reversed(range(1, count)):
            z.delete_zsphere(i)
        root = nodes[0]
        for k, v in zip((ZS_X, ZS_Y, ZS_Z), root["pos"]):
            z.set_zsphere(k, 0, float(v))
        z.set_zsphere(ZS_R, 0, float(root.get("radius", 0.05)))
        for nd in nodes[1:]:
            x, y, zz = (float(v) for v in nd["pos"])
            z.add_zsphere(x, y, zz, float(nd.get("radius", 0.05)), int(nd["parent"]))
    z.edit_zsphere(edit)
    return zs_read()


def zs_set_positions(positions):
    z = _z()

    def edit():
        for i, p in enumerate(positions):
            for k, v in zip((ZS_X, ZS_Y, ZS_Z), p):
                z.set_zsphere(k, i, float(v))
    z.edit_zsphere(edit)
    return zs_read()


def zs_pose(plan):
    """Forward kinematics on the active ZSphere rig: new positions from fk_pose, written with
    set_zsphere. Whether a bound mesh follows API edits is [verify] (live_p02)."""
    nodes = zs_read()
    pos = fk_pose([n["pos"] for n in nodes], [n["parent"] for n in nodes], plan)
    return {"before": [n["pos"] for n in nodes], "after": zs_set_positions(pos)}


def rig_bind(mesh_tool_name):
    """Tool > Rigging > Select Mesh picks the mesh in a tool popup; the shipped macros answer
    popups with PopUp:<item> [macro], then Bind Mesh. [verify] (live_p02)."""
    z = _z()
    _press("rig_select", check_enabled=False)
    pop = f"PopUp:{mesh_tool_name}"
    if not z.exists(pop):
        raise ZBPoseError(f"{pop} not found: the Select Mesh popup lists tools by name")
    z.press(pop)
    _press("rig_bind", check_enabled=False)
    return {"bound": z.get(_p("rig_bind")) >= 0.5}


def proxy_pose(reduction=None, keep_details=None):
    """Enter Proxy Pose (Tool > Geometry, 2023.1) for a dense mesh without lower levels.
    Keep Details must be set before entering (doc). Pavlovich: defaults work (irnu
    [00:00:00])."""
    if keep_details is not None:
        _set("proxy_keep_details", keep_details, tol=0.5)
    if reduction is not None:
        _set("proxy_reduction", reduction, tol=0.5)
    before = zb_ops.stats()
    _press("proxy", check_enabled=False)
    _z().update(redraw_ui=True)
    return {"before": before, "after": zb_ops.stats()}


def proxy_overwrite():
    """Overwrite Pose: takes the only mesh with the proxy's vertex order (the Adaptive Skin
    of the bound ZSphere rig) and exits to the high mesh (Pavlovich irnu [00:16:21])."""
    _press("proxy_overwrite", check_enabled=False)
    _z().update(redraw_ui=True)
    return zb_ops.stats()


def adaptive_skin(density=1, dynamesh_resolution=0, make=False):
    """Density 1 and DynaMesh Resolution 0 keep the bound vertex order (Pavlovich irnu
    [00:15:50]); higher values subdivide or remesh and break Overwrite Pose."""
    _set("askin_density", density, tol=0.5)
    _set("askin_dynamesh", dynamesh_resolution, tol=0.5)
    if make:
        _press("askin_make", check_enabled=False)
    return {"density": density, "dynamesh_resolution": dynamesh_resolution, "made": make}


# ============================================================================================
# Rigid moves of whole SubTools (weapon to the hand, armour plates, bases)
# ============================================================================================

def geometry_get():
    z = _z()
    out = {}
    for key in ("x_pos", "y_pos", "z_pos", "x_size", "y_size", "z_size", "xyz_size"):
        p = _p(key, required=False)
        out[key] = z.get(p) if p else None
    return out


def geometry_set(position=None, size=None, xyz_size=None):
    """Tool > Geometry X/Y/Z Position and X/Y/Z Size in internal units (the Center Mesh to
    World and Snap To Ground macros set these [macro])."""
    if position is not None:
        for key, v in zip(("x_pos", "y_pos", "z_pos"), position):
            if v is not None:
                _set(key, v, tol=1e-4 * max(1.0, abs(v)))
    if size is not None:
        for key, v in zip(("x_size", "y_size", "z_size"), size):
            if v is not None:
                _set(key, v, tol=1e-4 * max(1.0, abs(v)))
    if xyz_size is not None:
        _set("xyz_size", xyz_size, tol=1e-4 * max(1.0, abs(xyz_size)))
    return geometry_get()


def rotate_subtool(axis, deg, pivot_obj=None, export_scale=None, signs=GEOM_SIGNS):
    """Rotate the whole active SubTool with Tool:Deformation:Rotate on one axis ('x', 'y',
    'z'), then, when pivot_obj (OBJ export coordinates) is given, move it so the rotation
    happened about that pivot (pivot_correction). The rotation centre of Deformation:Rotate
    and the slider signs are [verify] (live_p03): check the result with
    zb_print.rigid_delta on exports before and after."""
    z = _z()
    g0 = geometry_get()
    if pivot_obj is not None and None in (g0["x_pos"], g0["y_pos"], g0["z_pos"]):
        raise ZBPoseError(f"Geometry position sliders not found: {g0}")
    zb_ops.deform("Rotate", deg, axes=AXIS_BITS[axis])
    out = {"before": g0, "after_rotate": geometry_get()}
    if pivot_obj is not None:
        k = float(export_scale or z.get(_p("export_scale")) or 1.0)
        c_int = [g0["x_pos"], g0["y_pos"], g0["z_pos"]]
        c_obj = [c_int[i] * signs[i] * k for i in range(3)]
        ax = [1.0 if a == axis else 0.0 for a in "xyz"]
        ax_obj = [ax[i] * signs[i] for i in range(3)]
        t_obj = pivot_correction(c_obj, pivot_obj, ax_obj, deg)
        new = [c_int[i] + t_obj[i] / (signs[i] * k) for i in range(3)]
        out["after_move"] = geometry_set(position=new)
        out["translation_obj"] = t_obj
    return out


def rotate_subtool_matrix(R_obj, signs=GEOM_SIGNS):
    """Turn the active SubTool by a full rotation given in OBJ axes, as three one-axis
    Deformation Rotate calls (X, then Y, then Z: euler_xyz). A prop re-placed after posing
    needs its carrier's whole transform, rotation plus translation (zb_print.follows,
    placement_correction), never one angle about one axis. Internal angle = axis sign x OBJ
    angle (GEOM_SIGNS is a proper rotation); ROTATE_SIGN and the rotation centre are [verify]
    (live_p03), which is why the translation is measured and corrected afterwards."""
    angles = euler_xyz(R_obj)
    calls = []
    for k, axis in enumerate("xyz"):
        if abs(angles[k]) > 1e-6:
            deg = angles[k] * signs[k] * ROTATE_SIGN
            zb_ops.deform("Rotate", deg, axes=AXIS_BITS[axis])
            calls.append({"axis": axis, "internal_deg": deg})
    return {"angles_obj_deg": angles, "calls": calls, "geometry": geometry_get()}


def translate_subtool(delta_mm, export_scale, signs=GEOM_SIGNS):
    """Move the active SubTool by delta_mm (OBJ axes, mm after set_export_scale) with the
    Geometry Position sliders (internal units = mm / export scale, axis signs [verify])."""
    g = geometry_get()
    keys = ("x_pos", "y_pos", "z_pos")
    if None in (g[k] for k in keys):
        raise ZBPoseError(f"Geometry position sliders not found: {g}")
    k = float(export_scale)
    new = [g[a] + float(delta_mm[i]) / k * signs[i] for i, a in enumerate(keys)]
    return geometry_set(position=new)


# ============================================================================================
# Print prep inside ZBrush
# ============================================================================================

def set_export_scale(target_mm, up_axis=1, zero_offsets=True):
    """Make Tool:Export write millimetres at the target height without the Scale Master
    dialogs: Export Scale = target / internal height of all visible SubTools
    (query_mesh3d(2, 2)). This is what Scale Master stores after Unify (doc: real size in the
    Export Scale). Whether the scale is per tool or per SubTool is [verify] (live_p04):
    check every exported header with zb_print.check_scale."""
    z = _z()
    bb = [float(v) for v in z.query_mesh3d(2, 2)]
    h = bb[3 + up_axis] - bb[up_axis]
    if h <= 0:
        raise ZBPoseError(f"visible bbox has no height on axis {up_axis}: {bb}")
    k = float(target_mm) / h
    got = _set("export_scale", k, tol=1e-3 * max(1.0, k))   # the OBJ height is the real gate
    if zero_offsets:
        for key in ("export_x_off", "export_y_off", "export_z_off"):
            p = _p(key, required=False)
            if p:
                z.set(p, 0.0)
    return {"export_scale": got, "internal_height": h, "target_mm": target_mm, "bbox_internal": bb}


def export_parts(out_dir, only_visible=True, overwrite=False, prefix=""):
    """One OBJ per SubTool (Maxon's batch-export pattern, dialog-free Tool:Export) with the
    counts ZBrush reports, including is_polymesh3d_solid()."""
    z = _z()
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    cur = int(z.get_active_subtool_index())
    vis = {s["index"]: s["visible"] for s in zb_ops.subtools()}
    rows, used = [], set()
    try:
        for i in range(int(z.get_subtool_count())):
            if only_visible and not vis.get(i, True):
                continue
            z.select_subtool(i)
            name = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in (subtool_name() or f"st{i}"))
            base = f"{prefix}{i:02d}_{name}"
            while base in used:
                base += "_"
            used.add(base)
            st = zb_ops.stats()
            ex = zb_ops.export_obj(os.path.join(out_dir, base + ".obj"), overwrite=overwrite)
            rows.append({"index": i, "name": name, "path": ex["path"], "bytes": ex["bytes"],
                         "points": st.get("points"), "faces": st.get("faces"), "solid": st.get("solid"),
                         "volume_internal": st.get("volume")})
    finally:
        z.select_subtool(cur)
    return {"dir": out_dir, "parts": rows}


def dynamesh_shell(thickness, resolution=None):
    """Hollow a LIGHT DynaMesh copy, never the heavy sculpt (Gaboury W9P5 [00:57:33]): set
    DynaMesh Thickness (relative to the DynaMesh resolution, not mm: doc, W9P5 [01:10:32])
    and press Create Shell. Create Shell needs a negative insert in the DynaMesh; touching
    the surface it opens a hole (a drain), pulled inside it leaves the shell closed (W9P5
    [01:05:29]). Measure the wall afterwards with zb_print.thickness."""
    if resolution is not None:
        zb_ops.dynamesh(resolution)
    _set("dyn_thickness", thickness, tol=0.5)
    before = zb_ops.stats()
    _press("dyn_create_shell", check_enabled=False)
    _z().update(redraw_ui=True)
    after = zb_ops.stats()
    return {"thickness": thickness, "before": before, "after": after,
            "volume_saved_internal": (before.get("volume") or 0) - (after.get("volume") or 0)}


def hollow_copy(source_index, insert_center_mm, insert_size_mm, export_scale, resolution=128,
                thickness=4, max_moves=500):
    """Gaboury's light shell copy, never the heavy sculpt (W9P5 [00:57:33]): duplicate the part,
    move the copy to the end of the SubTool list, drop its levels (top level kept), append a
    QSphere insert at insert_center_mm (OBJ mm) with XYZ Size insert_size_mm, set it to
    Subtract, MergeDown into the copy, DynaMesh at `resolution` (per bbox side, so relative to
    size: 64 too low and 128 enough for his 9 in car, W9P5 [00:56:58]) and Create Shell at
    `thickness` (not mm, W9P5 [01:10:32]). Keep the insert INSIDE: then outer and inner walls
    stay two pieces for keep_inner_shell, and the drain is cut later in the Live Boolean stack.
    The list order matters because MergeDown merges with the SubTool BELOW. MoveDown, the
    subtract flag surviving MergeDown and XYZ Size semantics are [verify] (live_p05)."""
    z = _z()
    k = float(export_scale)
    z.select_subtool(int(source_index))
    zb_ops.ensure_edit()
    n0 = int(z.get_subtool_count())
    _press("duplicate", check_enabled=False)
    z.update(redraw_ui=True)
    if int(z.get_subtool_count()) != n0 + 1:
        raise ZBPoseError("Duplicate did not add a SubTool")
    copy = int(z.get_active_subtool_index())
    for _ in range(max_moves):
        if copy >= int(z.get_subtool_count()) - 1:
            break
        _press("move_down", check_enabled=False)
        z.update(redraw_ui=True)
        nxt = int(z.get_active_subtool_index())
        if nxt != copy + 1:
            raise ZBPoseError(f"MoveDown left the copy at {nxt}, expected {copy + 1}")
        copy = nxt
    st = zb_ops.stats()
    if (st.get("sdiv_max") or 1) > 1:
        zb_ops.set_checked("sdiv", st["sdiv_max"], tol=0.5)
        zb_ops.del_levels()
    ins = append_primitive("qsphere", (16, 16, 16))
    if ins["index"] != copy + 1:
        raise ZBPoseError(f"insert at {ins['index']}, not right below the copy ({copy})")
    geometry_set(position=obj_to_internal(insert_center_mm, k), xyz_size=float(insert_size_mm) / k)
    set_boolean_mode(ins["index"], "sub")
    z.select_subtool(copy)
    n1 = int(z.get_subtool_count())
    _press("merge_down", check_enabled=False)
    z.update(redraw_ui=True)
    if int(z.get_subtool_count()) != n1 - 1:
        raise ZBPoseError("MergeDown did not merge the insert into the copy")
    z.select_subtool(copy)
    sh = dynamesh_shell(thickness, resolution)
    return {"copy": copy, "source": int(source_index), "shell": sh}


def keep_inner_shell(polish=10, hide_outer=True):
    """Gaboury W9P5 [01:12:44] to [01:14:58], on the active shell copy made by dynamesh_shell
    with the insert pulled INSIDE (outer and inner walls are then two loose pieces; a touching
    insert opens them into one): Auto Groups (one group per piece), Groups Split, keep the
    inner piece (the smaller bbox), Polish it to take the DynaMesh steps off, hide the outer
    copy. The inner piece then goes into the Live Boolean stack as a Subtract under the
    untouched detailed part (set_boolean_mode, make_boolean_mesh). Split order [verify]."""
    z = _z()
    n0 = int(z.get_subtool_count())
    cur = int(z.get_active_subtool_index())
    zb_ops.polygroups("auto")
    _press("split_groups", check_enabled=False)
    z.update(redraw_ui=True)
    n1 = int(z.get_subtool_count())
    if n1 != n0 + 1:
        raise ZBPoseError(f"Groups Split gave {n1 - n0 + 1} pieces, expected 2 (outer, inner): an "
                          "insert touching the surface joins them; pull it inside and shell again")
    size = {}
    for i in (cur, cur + 1):
        z.select_subtool(i)
        bb = zb_ops.stats()["bbox"]
        size[i] = math.dist(bb[:3], bb[3:])
    inner = min(size, key=size.get)
    outer = cur + 1 if inner == cur else cur
    z.select_subtool(inner)
    pol = zb_ops.polish(polish) if polish else None
    hidden = set_visible(outer, False) if hide_outer else None
    z.select_subtool(inner)
    return {"inner": inner, "outer": outer, "outer_hidden": bool(hidden), "polish": pol,
            "bbox_diag": size}


def brief_box(size_mm, export_scale, floor_center_mm=(0.0, 0.0, 0.0), res=1):
    """Gaboury's SubTool number one (W9P5 [00:21:43] [02:04:45]): a box at the brief's size,
    width X, height Y, depth Z in mm, standing on floor_center_mm (OBJ coordinates, e.g. the
    bottom centre of the assembled bbox from zb_print.check_scale). A QCube at Initialize
    resolution 1 (6 faces, W9P5 [00:22:47]) sized with the Geometry sliders in internal units
    (mm / export scale). Hide it (set_visible) before set_export_scale and export_parts;
    show it in the review sheet to see what clips out; zb_print.envelope is the number.
    Whether X, Y and Z Size stay independent (no ratio lock) is [verify] (live_p08)."""
    k = float(export_scale)
    w, h, d = (float(s) for s in size_mm)
    c = [float(floor_center_mm[0]), float(floor_center_mm[1]) + h / 2.0, float(floor_center_mm[2])]
    prim = append_primitive("qcube", (res, res, res))
    geo = geometry_set(position=obj_to_internal(c, k), size=[w / k, h / k, d / k])
    return {"index": prim["index"], "size_mm": [w, h, d], "center_mm": c, "geometry": geo}


def from_thickness(min_value, max_value=None, force=False):
    """PolyPaint From Thickness for the visual check (red under the minimum). The values are
    in scene units: mm only after scaling (doc); whether set_export_scale alone makes them mm
    is [verify] (live_p05). Above Preferences > Analysis > Max Thickness Polygons ZBrush does
    not refuse: it asks "Too many polygons ... Are you sure that you wish to proceed?" in a
    note (strings), and that note would stall the bridge, so THIS wrapper refuses unless
    force. The pref reads 8 on this Mac [log]; that it means millions is [verify]. This
    paints over polypaint: run it on a copy."""
    z = _z()
    faces = int(z.query_mesh3d(1)[0])
    p = _p("ft_max_polys", required=False)
    limit = z.get(p) * 1e6 if p else None
    if limit and faces > limit and not force:
        raise ZBPoseError(f"{faces} faces > Max Thickness Polygons ({limit:.0f}): a confirmation "
                          "note would block; decimate a copy first or pass force=True")
    _set("ft_min", min_value, tol=1e-3 * max(1.0, abs(min_value)))
    if max_value is not None:
        _set("ft_max", max_value, tol=1e-3 * max(1.0, abs(max_value)))
    t = time.time()
    _press("from_thickness", check_enabled=False)
    z.update(redraw_ui=True)
    return {"faces": faces, "seconds": round(time.time() - t, 2), "min": min_value, "max": max_value}


def append_primitive(kind="qcyl_y", res=(8, 8, 8)):
    """Append a PolyMesh3D SubTool and initialise it as a quick primitive (the shipped
    'Append a QCube Subtool' macro: Append, PopUp:PolyMesh3D, Initialize). kind: qcube,
    qsphere, qcyl_x, qcyl_y, qcyl_z. Returns the new SubTool index (the last one [verify])."""
    z = _z()
    zb_ops.ensure_edit()
    _press("append", check_enabled=False)
    if not z.exists("PopUp:PolyMesh3D"):
        raise ZBPoseError("PopUp:PolyMesh3D not found after Append")
    z.press("PopUp:PolyMesh3D")
    idx = int(z.get_subtool_count()) - 1
    z.select_subtool(idx)
    for key, v in zip(("init_x_res", "init_y_res", "init_z_res"), res):
        _set(key, v, tol=0.5)
    _press("init_" + kind, check_enabled=False)
    z.update(redraw_ui=True)
    return {"index": idx, "name": subtool_name(), "stats": zb_ops.stats(), "geometry": geometry_get()}


BOOL_BITS = {"add": 0x10, "sub": 0x20, "intersect": 0x40}


def set_boolean_mode(index, mode=None, start=None):
    """Live Boolean role of a SubTool through its status bits (add 0x10, subtract 0x20,
    intersect 0x40, start 0x80). set_subtool_status TOGGLES the bits it is given (SDK), so
    only the bits that differ are sent; the result is read back."""
    z = _z()
    cur = int(z.get_subtool_status(index))
    want = cur & ~(0x10 | 0x20 | 0x40)
    if mode:
        want |= BOOL_BITS[mode]
    if start is not None:
        want = (want | 0x80) if start else (want & ~0x80)
    else:
        want |= cur & 0x80
    diff = (cur ^ want) & (0x10 | 0x20 | 0x40 | 0x80)
    if diff:
        z.set_subtool_status(index, diff)
    got = int(z.get_subtool_status(index))
    if (got & 0xF0) != (want & 0xF0):
        raise ZBPoseError(f"SubTool {index}: status {got:#x}, wanted {want:#x}")
    return {"index": index, "status": got}


def make_boolean_mesh():
    """Live Boolean on, then Make Boolean Mesh: a new tool with the results; the sources
    stay (Gaboury W9P5 [02:05:48]). Keep one or two operations per hierarchy (Hasbro P08k
    [00:47:15]). Paths [verify] (live_p06)."""
    z = _z()
    zb_ops.set_checked(PATHS["live_boolean"], 1, tol=0.5)
    before = z.get_active_tool_path()
    _press("make_boolean", check_enabled=False)
    z.update(redraw_ui=True)
    return {"source_tool": before, "result_tool": z.get_active_tool_path(), "stats": zb_ops.stats()}


MASK_KEYS = {"cavity": "mask_cavity", "peaks": "mask_peaks"}


def decimate_to_faces(target_faces, preprocess=True, mask=None, keep_mask=False):
    """Decimation Master on the active SubTool to about target_faces (zb_ops.decimate does
    the presses and times them). Masks steer it: masked areas keep density, the count does
    not change (doc Masking; Gaboury W9P5 [01:30:30] masks the face and hands). mask:
    'cavity' or 'peaks' presses Mask By Cavity or Mask PeaksAndValleys first, a stroke-free
    stand-in for a painted mask [added] [verify]; 'keep' uses the mask already on the mesh.
    Anything changed after Pre-process, a mask included, is ignored (doc Troubleshooting),
    so a mask without preprocess is refused. Unique SubTool names first."""
    if mask and not preprocess:
        raise ZBPoseError("a mask added after Pre-process is ignored (doc): pre-process again")
    if mask and mask != "keep":
        if mask not in MASK_KEYS:
            raise ValueError(f"mask must be one of {sorted(MASK_KEYS) + ['keep']}")
        _press(MASK_KEYS[mask], check_enabled=False)
    faces = int(_z().query_mesh3d(1)[0])
    pct = decimate_percent(faces, target_faces)
    res = zb_ops.decimate(pct, preprocess=preprocess)
    if mask and not keep_mask:
        zb_ops.mask("clear")
    res.update(target_faces=target_faces, mask=mask)
    return res


def close_holes():
    before = zb_ops.stats()
    _press("close_holes", check_enabled=False)
    _z().update(redraw_ui=True)
    after = zb_ops.stats()
    return {"solid_before": before.get("solid"), "solid_after": after.get("solid"),
            "faces_before": before.get("faces"), "faces_after": after.get("faces")}


def intersection_mask():
    """ZPlugin > Intersection Masker > Create Intersection Mask on the active SubTool
    [strings] [verify]: a deterministic mask of where it crosses other SubTools, to push
    cloth out with a masked Inflate instead of Move Topological strokes."""
    _press("intersection_mask", check_enabled=False)
    _z().update(redraw_ui=True)
    return {"pressed": True}


# ============================================================================================
# Agent side: call a function of this module inside ZBrush through the proven bridge
# ============================================================================================

def bridge_code(func, args=(), kwargs=None):
    """Source that imports zb_pose (and through it zb_ops, zb_stroke) by path inside ZBrush,
    removes the paths and zb_* modules again (shared interpreter rule), then calls func."""
    if not func.isidentifier():
        raise ValueError(f"bad function name {func!r}")
    return (
        "import sys as _s, importlib as _il, json as _j\n"
        f"_d = {_HERE!r}\n"
        "_before = set(_s.modules)\n"
        "_s.path.insert(0, _d)\n"
        "try:\n"
        "    zb_pose = _il.import_module('zb_pose')\n"
        "finally:\n"
        "    if _d in _s.path:\n"
        "        _s.path.remove(_d)\n"
        "    for _k in set(_s.modules) - _before:\n"
        "        if _k.startswith('zb_'):\n"
        "            _s.modules.pop(_k, None)\n"
        f"result = zb_pose.{func}(*_j.loads({json.dumps(list(args))!r}), "
        f"**_j.loads({json.dumps(kwargs or {})!r}))\n")


def call(func, *args, port=7788, timeout=120, **kwargs):
    """zb_pose.func(*args, **kwargs) inside ZBrush via zb_launch.run (main thread)."""
    added = EXPERT_SCRIPTS not in sys.path
    if added:
        sys.path.insert(0, EXPERT_SCRIPTS)
    import zb_launch
    return zb_launch.run(bridge_code(func, args, kwargs), (), port, timeout)
