"""
zb_hardsurface: hard-surface building blocks and checks for ZBrush 2026.2.1 (skill
scenario-zbrush-hard-surface). Built on the lead toolkit (<skills>/scenario-zbrush-expert/scripts: zb_ops,
zb_launch, zb_review, zb_audit, zb_stroke); nothing here re-implements those.

Three kinds of functions, like zb_review:
  pure Python, both sides (tested offline):
      crease_plan, check_crease, edge_width, subdiv_faces, apply_levels, array_plan,
      decimate_percent, decode_status, desired_status, boolean_groups, stack_problems,
      roles_from_groups, seam_port_groups, fitted_split_groups, zmodeler_plan,
      bridge_preflight, layer_safe, spaced_points, to_tool_units, normal_stats, obj_ngons
  inside ZBrush (run them from the agent with hs_call("name", ...)):
      resolve_hs, set_status, set_roles, stack_report, live_boolean, make_boolean_mesh,
      dynamic_subdiv, dynamic_state, crease_by_groups, crease_by_angle, crease_bevel,
      apply_dynamic, bake_split, mirror_weld, panel_loops, groups_loops, array_mesh,
      array_commit, nanomesh_set, new_part, place, import_part, fastener_from_brush,
      imm_ready, mask_fillet, canvas_action, split_copy, zremesh_recipe, dynamesh_visible,
      set_polyframe, normal_variance, curve_mesh
  agent side (system python3, numpy for the mesh checks):
      hs_call, hs_run, build_call, build_code, review_sheets, load_groups, coplanar_report,
      edge_language, plane_flatness, border_polylines, mirror_report, mirror_check, hygiene,
      pinch_report, click_target

    import sys; sys.path.insert(0, "<skills>/scenario-zbrush-hard-surface/scripts")
    import zb_hardsurface as hs            # also puts the lead scripts on sys.path
    hs.hs_call("new_part", "cube", res=[2, 2, 2])
    hs.hs_call("set_roles", [{"index": 0, "op": "add", "start": True},
                             {"index": 1, "op": "sub"}])
    print(hs.hs_call("stack_report")["problems"])

Evidence tags used in HS_PATHS and in docstrings:
  [macro]   used by a shipped 2026.2.1 macro (ZData/Macros)
  [strings] the label is in ZData/ZLang/english/UInterface.zsc of 2026.2.1, with the bubble help
            quoted in HS_INFO; this proves the label, not the full item path
  [doc]     Maxon docs or SDK stub;  [bridge] proven through the bridge (lead tests v01..v03)
  [added]   this toolkit's own rule or threshold;  [verify] not confirmed
Status 2026-09-24: NOT YET RUN IN ZBRUSH. The live checks are
tests/code/zbrush-hard-surface/live_hs_*.py; offline tests in the same folder pass.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LEAD_SCRIPTS = os.path.abspath(os.path.join(HERE, "..", "..", "scenario-zbrush-expert", "scripts"))

try:
    from zbrush import commands as _zbc_probe  # noqa: F401
    INSIDE_ZBRUSH = True
except ImportError:
    INSIDE_ZBRUSH = False

try:  # inside ZBrush, hs_call's prelude has put the lead folder on sys.path already
    import zb_ops
except ImportError:
    # Agent side: keep the lead folder importable (zb_launch, zb_review, zb_audit).
    # Inside ZBrush (imported without the prelude): import, then leave sys.path as found.
    sys.path.insert(0, LEAD_SCRIPTS)
    try:
        import zb_ops
    finally:
        if INSIDE_ZBRUSH and LEAD_SCRIPTS in sys.path:
            sys.path.remove(LEAD_SCRIPTS)

ZBOpError = zb_ops.ZBOpError

# --------------------------------------------------------------------------------------------
# Item paths. Candidates are tried in order with exists(); when HS_INFO has an expected
# bubble-help substring, a candidate whose get_info() text does not contain it is rejected.
# That guards the duplicate labels of Tool:Geometry (Bevel, Thickness, Polish, Loops,
# Resolution, Offset appear in several groups: tools digest P0).
# --------------------------------------------------------------------------------------------

def _grouped(group, label, extra=()):
    # Flat path first: the confirmed pattern (Tool:Geometry:Mirror And Weld, Tool:Geometry:
    # Edgeloop Masked Border [macro]) shows that the collapsible sections of Tool > Geometry do
    # not add a path level (tools digest header); the sectioned form stays as a fallback.
    base = [f"Tool:Geometry:{label}", f"Tool:Geometry:{group}:{label}"]
    return base + list(extra)


HS_PATHS = {
    # Dynamic Subdiv: internal labels carry an "s." prefix [strings]; the NanoMesh macro shows
    # that prefixed labels are what item paths use ("Tool:NanoMesh:m.Width") [macro]
    "dyn_on": _grouped("Dynamic Subdiv", "s.Dynamic", ["Tool:Geometry:Dynamic Subdiv:Dynamic"]),
    "dyn_apply": _grouped("Dynamic Subdiv", "s.Apply", ["Tool:Geometry:Dynamic Subdiv:Apply"]),
    "dyn_qgrid": _grouped("Dynamic Subdiv", "s.QGrid", ["Tool:Geometry:QGrid"]),
    "dyn_coverage": _grouped("Dynamic Subdiv", "s.Coverage", ["Tool:Geometry:Coverage"]),
    "dyn_constant": _grouped("Dynamic Subdiv", "s.Constant"),
    "dyn_bevel": _grouped("Dynamic Subdiv", "s.Bevel"),
    "dyn_chamfer": _grouped("Dynamic Subdiv", "s.Chamfer"),
    "dyn_flat": _grouped("Dynamic Subdiv", "s.FlatSubdiv", ["Tool:Geometry:FlatSubdiv"]),
    "dyn_smooth": _grouped("Dynamic Subdiv", "s.SmoothSubdiv", ["Tool:Geometry:SmoothSubdiv"]),
    "dyn_thickness": _grouped("Dynamic Subdiv", "s.Thickness"),
    "dyn_micropoly": _grouped("Dynamic Subdiv", "s.MicroPoly On"),
    # Crease group [strings]
    "crease": _grouped("Crease", "Crease"),
    "crease_all": _grouped("Crease", "CreaseAll"),
    "ctolerance": _grouped("Crease", "CTolerance"),
    "crease_lvl": _grouped("Crease", "CreaseLvl"),
    "uncrease": _grouped("Crease", "UnCrease"),
    "uncrease_all": _grouped("Crease", "UnCreaseAll"),
    "crease_pg": _grouped("Crease", "Crease PG"),
    "uncrease_pg": _grouped("Crease", "UnCrease PG"),
    "crease_um": _grouped("Crease", "Crease UM"),
    "crease_bevel": _grouped("Crease", "B.Bevel"),
    "crease_bevel_width": _grouped("Crease", "B.Bevel Width"),
    "crease_bevel_res": _grouped("Crease", "B.Resolution"),
    # Polygroups [strings]; Group Visible [macro GrpUnMasked]
    "groups_by_normals": ["Tool:Polygroups:Groups By Normals"],
    "max_angle": ["Tool:Polygroups:MaxAngle", "Tool:Polygroups:Groups By Normals:MaxAngle"],
    "group_visible": ["Tool:Polygroups:Group Visible", "Tool:Polygroups:GroupVisible"],
    "auto_groups": ["Tool:Polygroups:Auto Groups"],
    # EdgeLoop group [strings]; Edgeloop Masked Border [macro]
    "edgeloop_masked": ["Tool:Geometry:Edgeloop Masked Border",
                        "Tool:Geometry:EdgeLoop:Edgeloop Masked Border"],
    "groups_loops": _grouped("EdgeLoop", "GroupsLoops"),
    "gl_loops": _grouped("EdgeLoop", "Loops"),
    "gl_gpolish": _grouped("EdgeLoop", "GPolish"),
    "pl_button": _grouped("EdgeLoop", "P.Panel Loops", ["Tool:Geometry:Panel Loops"]),
    "pl_loops": _grouped("EdgeLoop", "P.Loops"),
    "pl_double": _grouped("EdgeLoop", "P.Double"),
    "pl_append": _grouped("EdgeLoop", "P.Append"),
    "pl_inner": _grouped("EdgeLoop", "P.Inner"),
    "pl_thickness": _grouped("EdgeLoop", "P.Thickness"),
    "pl_polish": _grouped("EdgeLoop", "P.Polish"),
    "pl_ignore_groups": _grouped("EdgeLoop", "P.Ignore Groups"),
    "pl_bevel": _grouped("EdgeLoop", "P.Bevel"),
    "pl_elevation": _grouped("EdgeLoop", "P.Elevation"),
    # Modify Topology [strings]; Mirror And Weld [macro]
    "close_holes": _grouped("Modify Topology", "Close Holes"),
    "del_hidden": _grouped("Modify Topology", "Del Hidden"),
    "mirror_weld": ["Tool:Geometry:Mirror And Weld"],
    "delete_by_symmetry": _grouped("Modify Topology", "Delete By Symmetry"),
    "unweld_groups": _grouped("Modify Topology", "Unweld Groups Border"),
    "reconstruct": ["Tool:Geometry:Reconstruct Subdiv"],
    # label "MeshFromBrush", bubble help "Create Mesh From Brush" [strings]; item paths ignore
    # spaces [doc SDK Item Paths]; Chervenka's route to a kitbash part without a drag
    "mesh_from_brush": _grouped("Modify Topology", "MeshFromBrush"),
    "check_mesh": _grouped("MeshIntegrity", "Check Mesh Integrity",
                           ["Tool:Geometry:Check Mesh"]),
    "fix_mesh": _grouped("MeshIntegrity", "Fix Mesh"),
    # Deformation [strings]; Unify [macro]
    "deform_mirror": ["Tool:Deformation:Mirror"],
    "polish_features": ["Tool:Deformation:Polish By Features"],
    "polish_groups": ["Tool:Deformation:Polish By Groups"],
    "polish_crisp": ["Tool:Deformation:Polish Crisp Edges"],
    "unify": ["Tool:Deformation:Unify"],
    # SubTool [strings]; Duplicate [bridge]
    "duplicate": ["Tool:SubTool:Duplicate"],
    "append": ["Tool:SubTool:Append"],
    "split_groups": ["Tool:SubTool:Groups Split", "Tool:SubTool:Split:Groups Split"],
    "split_parts": ["Tool:SubTool:Split To Parts", "Tool:SubTool:Split:Split To Parts"],
    "split_unmasked": ["Tool:SubTool:Split Unmasked Points",
                       "Tool:SubTool:Split:Split Unmasked Points"],
    "merge_down": ["Tool:SubTool:MergeDown", "Tool:SubTool:Merge:MergeDown"],
    "merge_visible": ["Tool:SubTool:MergeVisible", "Tool:SubTool:Merge:MergeVisible"],
    # Booleans [strings]: "Render:Render Booleans" and "Tool:[SubTool]:{Boolean" appear in the
    # resources; Live Boolean doc names Render > Render Booleans > Live Boolean
    "live_boolean": ["Render:Render Booleans:Live Boolean", "Render:Live Boolean"],
    "show_coplanar": ["Render:Render Booleans:Show Coplanar"],
    "show_issues": ["Render:Render Booleans:Show Issues"],
    "make_boolean": ["Tool:SubTool:Boolean:Make Boolean Mesh", "Tool:SubTool:Make Boolean Mesh"],
    "dsdiv": ["Tool:SubTool:Boolean:DSDiv", "Tool:SubTool:DSDiv"],
    # ZRemesher extras not wrapped by zb_ops.zremesher [strings]
    "zr_smooth_groups": ["Tool:Geometry:ZRemesher:SmoothGroups", "Tool:Geometry:SmoothGroups"],
    "zr_freeze_groups": ["Tool:Geometry:ZRemesher:FreezeGroups", "Tool:Geometry:FreezeGroups"],
    "zr_curves_strength": ["Tool:Geometry:ZRemesher:Curves Strength",
                           "Tool:Geometry:Curves Strength"],
    # ArrayMesh: "a." labels [strings]; the sub-palette title is "Array Mesh" [strings]
    "am_on": ["Tool:Array Mesh:a.Array Mesh", "Tool:ArrayMesh:a.Array Mesh"],
    "am_repeat": ["Tool:Array Mesh:a.Repeat", "Tool:ArrayMesh:a.Repeat"],
    "am_offset_mode": ["Tool:Array Mesh:a.Offset", "Tool:ArrayMesh:a.Offset"],
    "am_scale_mode": ["Tool:Array Mesh:a.Scale", "Tool:ArrayMesh:a.Scale"],
    "am_rotate_mode": ["Tool:Array Mesh:a.Rotate", "Tool:ArrayMesh:a.Rotate"],
    "am_pivot_mode": ["Tool:Array Mesh:a.Pivot", "Tool:ArrayMesh:a.Pivot"],
    "am_x": ["Tool:Array Mesh:a.X Amount", "Tool:ArrayMesh:a.X Amount"],
    "am_y": ["Tool:Array Mesh:a.Y Amount", "Tool:ArrayMesh:a.Y Amount"],
    "am_z": ["Tool:Array Mesh:a.Z Amount", "Tool:ArrayMesh:a.Z Amount"],
    "am_make_mesh": ["Tool:Array Mesh:a.Make Mesh", "Tool:ArrayMesh:a.Make Mesh"],
    "am_to_nano": ["Tool:Array Mesh:a.Convert To NanoMesh",
                   "Tool:ArrayMesh:a.Convert To NanoMesh"],
    # Initialize [macro "Append a QCube Subtool"; strings for the others]
    "init_xres": ["Tool:Initialize:X Res"],
    "init_yres": ["Tool:Initialize:Y Res"],
    "init_zres": ["Tool:Initialize:Z Res"],
    "init_qcube": ["Tool:Initialize:QCube"],
    "init_qsphere": ["Tool:Initialize:QSphere"],
    "init_qgrid": ["Tool:Initialize:QGrid"],
    "init_qcyl_x": ["Tool:Initialize:QCyl X"],
    "init_qcyl_y": ["Tool:Initialize:QCyl Y"],
    "init_qcyl_z": ["Tool:Initialize:QCyl Z"],
    # placement [macro Append Eyes, Snap To Ground]
    "x_pos": ["Tool:Geometry:X Position"],
    "y_pos": ["Tool:Geometry:Y Position"],
    "z_pos": ["Tool:Geometry:Z Position"],
    "xyz_size": ["Tool:Geometry:XYZ Size"],
    "x_size": ["Tool:Geometry:X Size"],
    "y_size": ["Tool:Geometry:Y Size"],
    "z_size": ["Tool:Geometry:Z Size"],
    # misc
    "import": ["Tool:Import"],                                    # [bridge] exists
    "nm_edit_mesh": ["Tool:NanoMesh:m.Edit Mesh"],                # [macro] the late swap
    "floor_elv": ["Draw:Elv"],                                    # [verify]
    "polyframe": ["Transform:Pf", "Transform:PolyF"],             # [cmdxml] id "Transform: Pf"
    "current_tool": ["Tool:Current Tool"],                        # [doc ZScript manual]
}

# Bubble help substrings from UInterface.zsc (2026.2.1) [strings]
HS_INFO = {
    "dyn_on": "Activates Dynamic Subdiv", "dyn_apply": "Apply All To Mesh",
    "dyn_qgrid": "Quick Grid-Based Subdiv", "dyn_coverage": "QGrid Coverage",
    "dyn_constant": "QGrid Constant", "dyn_bevel": "QGrid Bevel", "dyn_chamfer": "QGrid Chamfer",
    "dyn_flat": "Flat Subdivision Levels", "dyn_smooth": "Smooth Subdivision Levels",
    "dyn_thickness": "Dynamic Thickness", "dyn_micropoly": "MicroPoly",
    "crease": "Crease Border", "crease_all": "Crease All",
    "ctolerance": "Crease Edges Tolerance", "crease_lvl": "Crease Levels",
    "uncrease": "Uncrease Border", "uncrease_all": "Uncrease All",
    "crease_pg": "Crease Polygroups Border", "uncrease_pg": "Uncrease Polygroups Border",
    "crease_um": "Crease UnMasked", "crease_bevel": "Bevel Creased Edges",
    "crease_bevel_width": "Bevel Width", "crease_bevel_res": "Bevel Resolution",
    "groups_by_normals": "Similar Face Normals", "max_angle": "Maximum Angle",
    "group_visible": "Group Visible", "auto_groups": "Topology Continuity",
    "edgeloop_masked": "Masked Border", "groups_loops": "Edgeloops Around Polygroups",
    "gl_loops": "GroupsLoops Count", "gl_gpolish": "GroupsLoops Polish",
    "pl_button": "Panels Around Polygroups", "pl_loops": "Panel Loops Count",
    "pl_double": "Double Sided", "pl_append": "Append Panel Loops", "pl_inner": "Inner Panel",
    "pl_thickness": "Panel Loops Thickness", "pl_polish": "Panel Loops Polish",
    "pl_ignore_groups": "Ignore Polygrouping", "pl_bevel": "Panel Loops Bevel",
    "pl_elevation": "Panel Loops Elevation",
    "close_holes": "Close Holes", "del_hidden": "Delete Hidden", "mirror_weld": "Mirror And Weld",
    "delete_by_symmetry": "Delete By Symmetry", "unweld_groups": "Unweld Groups Border",
    "reconstruct": "Reconstruct Subdiv", "check_mesh": "Mesh Integrity", "fix_mesh": "Fix Mesh",
    "mesh_from_brush": "Mesh From Brush",
    "deform_mirror": "Flip Object", "polish_features": "Polish By Mesh Features",
    "polish_groups": "Polish By Groups", "polish_crisp": "Polish Crisp Edges",
    "unify": "Auto Resize", "duplicate": "Duplicate", "append": "Append",
    "split_groups": "Groups Split", "split_parts": "Split To Parts",
    "split_unmasked": "Split Unmasked", "merge_down": "Merge Down Two Subtools",
    "merge_visible": "Merge Visible", "live_boolean": "Live Boolean",
    "show_coplanar": "coplanar", "show_issues": "issues", "make_boolean": "Make Boolean Mesh",
    "dsdiv": "Allow Dynamic Subdiv", "zr_smooth_groups": "Smooth Groups Border",
    "zr_freeze_groups": "Freeze Groups", "zr_curves_strength": "Curves Strength",
    "am_on": "Array Mesh On", "am_offset_mode": "Offset", "am_pivot_mode": "Pivot",
    "am_x": "X Amount", "am_y": "Y Amount", "am_z": "Z Amount",
    "init_xres": "X Resolution", "init_yres": "Y Resolution", "init_zres": "Z Resolution",
    "x_pos": "X Position", "y_pos": "Y Position", "z_pos": "Z Position", "xyz_size": "XYZ Size",
}

# --------------------------------------------------------------------------------------------
# Pure helpers (both sides)
# --------------------------------------------------------------------------------------------

# (smooth_subdiv, crease_lvl, source). The rule: CreaseLvl >= SmoothSubdiv is razor sharp,
# each level below adds falloff (Pavlovich qeFclVta4No 00:15:27; Plouffe u75skb32GTo 02:18:03).
# The CLOSER CreaseLvl sits to SmoothSubdiv, the TIGHTER the edge: 4/3 is tighter than 4/2.
# v1 of this file called 4/3 "wide"; that label was inverted (Z3 grade) and is refused now.
CREASE_PRESETS = {
    "working": (3, 2, "Pavlovich working preview (qeFclVta4No 00:16:29; HXnKnrhlFpA 00:04:30)"),
    "bake": (4, 2, "Pavlovich bake highlight (qeFclVta4No 00:14:56)"),
    "tight": (4, 3, "one level of falloff: a narrower highlight than bake 4/2. Pavlovich arches "
                    "3/4 (qeFclVta4No 00:24:00); Plouffe keeps CreaseLvl 3 because 4 stays razor "
                    "through Dynamic level 4 and 2 is too soft on his plate; his smoothing level "
                    "is not stated (u75skb32GTo 02:18:03 to 02:19:44)"),
    "soft": (4, 1, "very soft falloff (qeFclVta4No 00:15:27)"),
    "cutter": (3, 2, "Pavlovich cutter default Smooth 3 / Crease 2 (KroRw6dFs10 00:02:39)"),
    "razor": (3, 3, "equal or higher is always razor, reads CG (qeFclVta4No 00:15:27; "
                    "8LNjAkqr_lI 00:13:19)"),
}
_WIDE_MSG = ("'wide' was an inverted label: 4/3 is the TIGHT pair. For a wider edge than 4/3 use "
             "'bake' (4/2) or 'soft' (4/1); compare renders under metal and keep the widest edge "
             "that still looks planned (Plouffe)")


def edge_width(smooth, crease_lvl):
    """How wide the highlight along a creased edge reads under Dynamic Subdivision. The gap
    SmoothSubdiv - CreaseLvl sets it, not either value alone: 0 or less razor ('very CG'),
    1 tight, 2 medium (Pavlovich's bake pair 4/2), 3 or more soft (qeFclVta4No 00:14:11 to
    00:16:29). rank grows with the width, so sort candidate pairs by it."""
    gap = int(smooth) - int(crease_lvl)
    label = "razor" if gap <= 0 else "tight" if gap == 1 else "medium" if gap == 2 else "soft"
    return {"smooth": int(smooth), "crease_lvl": int(crease_lvl), "gap": gap, "width": label,
            "rank": max(gap, 0)}


def crease_plan(intent="working"):
    """SmoothSubdiv and CreaseLvl for an intent: working, bake, tight, soft, cutter, razor."""
    if intent == "wide":
        raise ValueError(_WIDE_MSG)
    if intent not in CREASE_PRESETS:
        raise ValueError(f"intent must be one of {sorted(CREASE_PRESETS)}")
    s, c, src = CREASE_PRESETS[intent]
    return {"intent": intent, "smooth": s, "crease_lvl": c, "gap": s - c,
            "width": edge_width(s, c)["width"], "source": src}


def check_crease(smooth, crease_lvl, intent="bake"):
    """Problems for a SmoothSubdiv / CreaseLvl pair. bake, working, tight and cutter need a gap
    of 1 or 2 (a highlight that bakes); razor needs crease_lvl >= smooth; soft allows a gap
    of 3. The result carries edge_width's label."""
    if intent == "wide":
        raise ValueError(_WIDE_MSG)
    gap = int(smooth) - int(crease_lvl)
    out = {"smooth": smooth, "crease_lvl": crease_lvl, "gap": gap,
           "width": edge_width(smooth, crease_lvl)["width"], "problems": []}
    if intent == "razor":
        if gap > 0:
            out["problems"].append("razor edges need CreaseLvl >= SmoothSubdiv")
    elif intent in ("bake", "working", "tight", "cutter"):
        if gap <= 0:
            out["problems"].append("CreaseLvl >= SmoothSubdiv reads razor sharp, 'very CG': "
                                   "lower CreaseLvl by 1 or 2 (Pavlovich, Plouffe)")
        elif gap > 2:
            out["problems"].append("more than 2 levels of falloff rounds the edge away; "
                                   "Plouffe found 2 below already too soft on his plate")
    elif intent == "soft":
        if gap < 2:
            out["problems"].append("a soft edge needs CreaseLvl 2 or 3 below SmoothSubdiv")
    else:
        raise ValueError("intent must be bake, working, tight, cutter, soft or razor")
    if int(smooth) < 1 and int(crease_lvl) > 0:
        out["problems"].append("SmoothSubdiv 0 shows no creasing at all")
    out["ok"] = not out["problems"]
    return out


def subdiv_faces(quads, tris=0, qgrid=0, flat=0, smooth=0):
    """Displayed faces under Dynamic Subdivision. Order is always QGrid, Flat, Smooth; each step
    multiplies by 4 (DSUB doc Workflow); on the first Smooth level a triangle becomes three quads
    (DSUB doc Smooth Subdivision). Triangles under QGrid and Flat are counted as 4 each [added]."""
    q, t = float(quads), float(tris)
    for _ in range(int(qgrid) + int(flat)):
        q, t = q * 4, t * 4
    for i in range(int(smooth)):
        if i == 0:
            q, t = q * 4 + t * 3, 0.0
        else:
            q *= 4
    return int(round(q + t))


def apply_levels(qgrid=0, flat=0, smooth=0):
    """Subdivision levels after Dynamic Subdiv > Apply: the base (or the QGrid geometry) is level
    1, then one level per Flat and per Smooth step. The doc example QGrid 1 + Flat 1 + Smooth 3
    gives 5 levels (DSUB Apply); the general form is [added, derived] and [verify] in live_hs_04."""
    return 1 + int(flat) + int(smooth)


def array_plan(count, cutter_width, span=None, pitch=None, min_wall=None, wall_rel=0.5):
    """Spacing for a row of `count` cutters of width `cutter_width` along one axis.
    Give either the span covered by the whole row or the pitch (centre to centre). The wall left
    between two cuts must stay plausible: "doesn't look very structurally sound" (Pavlovich
    x1gN9-SocYY 00:12:19); the default minimum wall of half a cutter width is [added]."""
    count = int(count)
    if count < 1 or cutter_width <= 0:
        raise ValueError("count >= 1 and cutter_width > 0")
    if pitch is None:
        if span is None:
            raise ValueError("give span or pitch")
        pitch = 0.0 if count == 1 else (float(span) - cutter_width) / (count - 1)
    wall = pitch - cutter_width if count > 1 else float("inf")
    mw = float(min_wall) if min_wall is not None else wall_rel * cutter_width
    return {"count": count, "pitch": pitch, "wall": wall, "min_wall": mw,
            "total": (count - 1) * pitch + cutter_width, "ok": count == 1 or wall >= mw,
            "first_offset": 0.0}


def decimate_percent(target, total):
    """Decimation Master '% of decimation' for one uniform pass: 100 x target / total
    (Pavlovich h5gsm_-6df4 00:00:31: 25,000 of 1.671M points; he set 1.4 and got about 23k)."""
    if total <= 0:
        raise ValueError("total must be > 0")
    return round(100.0 * float(target) / float(total), 3)


# SubTool status bits (SDK get_subtool_status) [doc]
EYE, FOLDER_EYE, ADD, SUB, CLIP, START = 0x1, 0x2, 0x10, 0x20, 0x40, 0x80
OPS = ADD | SUB | CLIP
MASK = EYE | FOLDER_EYE | OPS | START
OP_BITS = {"add": ADD, "sub": SUB, "clip": CLIP, "intersect": CLIP, "none": 0}


def decode_status(s):
    s = int(s)
    op = "sub" if s & SUB else "clip" if s & CLIP else "add" if s & ADD else "none"
    return {"eye": bool(s & EYE), "folder_eye": bool(s & FOLDER_EYE), "op": op,
            "start": bool(s & START)}


def desired_status(current, op=None, start=None, visible=None):
    """Status value with the operator, Start flag and eye changed, other bits kept."""
    s = int(current)
    if op is not None:
        if op not in OP_BITS:
            raise ValueError(f"op must be one of {sorted(OP_BITS)}")
        s = (s & ~OPS) | OP_BITS[op]
    if start is not None:
        s = (s | START) if start else (s & ~START)
    if visible is not None:
        s = (s | EYE) if visible else (s & ~EYE)
    return s


def boolean_groups(rows):
    """Start groups as ZBrush processes them: visible SubTools top to bottom, a new group at the
    first one and at every Start flag (LB doc Boolean Process, Linearity, Start groups)."""
    groups = []
    for r in rows:
        if not r.get("visible", r.get("eye", True)):
            continue
        if not groups or r.get("start"):
            groups.append({"start_index": r["index"], "members": []})
        groups[-1]["members"].append({"index": r["index"], "op": r.get("op", "none")})
    return groups


def stack_problems(rows, density_factor=16.0, qgrid_max=1):
    """Pre-flight of a Live Boolean stack from stack_report rows. Problems block Make Boolean
    Mesh; warnings need a look. Sources: LB doc (Important Information, Linearity, Data
    Preservation); the density factor and QGrid limit are [added] numbers."""
    problems, warnings, notes = [], [], []
    vis = [r for r in rows if r.get("visible", r.get("eye", True))]
    if len(vis) < 2:
        problems.append("fewer than two visible SubTools: nothing to boolean")
    if vis and vis[0].get("op") in ("sub", "clip") and not vis[0].get("start"):
        problems.append(f"first visible SubTool {vis[0]['index']} is {vis[0]['op']}: it must be "
                        "Add or Start (processed top to bottom)")
    for r in vis:
        if r.get("solid") is False:
            problems.append(f"SubTool {r['index']} is not watertight; every input must be a valid "
                            "solid or ZBrush reports invalid SubTools")
        if r.get("partly_hidden"):
            problems.append(f"SubTool {r['index']} is partially hidden: hidden openings get "
                            "closed with Close Hole; show all first")
        dyn = r.get("dynamic") or {}
        if dyn.get("on") and (dyn.get("qgrid") or 0) > qgrid_max:
            warnings.append(f"SubTool {r['index']} QGrid {dyn.get('qgrid')}: DSDiv turns it into "
                            "long thin polygons; lower it")
        if (r.get("levels") or 1) > 1:
            notes.append(f"SubTool {r['index']} has {r['levels']} levels: they collapse to the "
                         "current level in the result")
    if vis and not any(r.get("op") in ("sub", "clip") for r in vis):
        warnings.append("no Subtract or Intersect operand: the result is a plain union")
    for g in boolean_groups(rows):
        if g["members"] and g["members"][0]["op"] in ("sub", "clip"):
            warnings.append(f"Start group at {g['start_index']} begins with a cutter")
    dens = [r["faces"] / r["area"] for r in vis if r.get("faces") and r.get("area")]
    if len(dens) >= 2 and min(dens) > 0 and max(dens) / min(dens) > density_factor:
        warnings.append(f"density differs {max(dens) / min(dens):.1f}x between operands; keep "
                        "it similar or expect long thin triangles")
    return {"problems": problems, "warnings": warnings, "notes": notes, "ok": not problems}


def roles_from_groups(groups):
    """set_roles() rows for Live Boolean Start groups given as lists of (index, op), in SubTool
    order. Each group's first member becomes Add + Start. ZBrush processes visible SubTools top
    to bottom and every Start opens a new group (LB doc Boolean Process, Linearity), so the
    groups must be consecutive runs; the function checks that with boolean_groups."""
    rows, roles = [], []
    last = -1
    for g in groups:
        if not g:
            raise ValueError("empty Start group")
        for k, (idx, op) in enumerate(g):
            idx = int(idx)
            if idx <= last:
                raise ValueError(f"SubTool {idx} out of order: groups must follow the SubTool "
                                 "list top to bottom")
            if k == 0 and op not in ("add", "none"):
                raise ValueError(f"group starting at {idx} begins with {op}: a Start group "
                                 "begins with its body (Add)")
            if op not in OP_BITS:
                raise ValueError(f"op must be one of {sorted(OP_BITS)}")
            opn = "clip" if op == "intersect" else op
            roles.append({"index": idx, "op": "add" if k == 0 else opn, "start": k == 0})
            rows.append({"index": idx, "op": "add" if k == 0 else opn, "start": k == 0,
                         "visible": True})
            last = idx
    got = [[m["index"] for m in grp["members"]] for grp in boolean_groups(rows)]
    want = [[int(i) for i, _ in g] for g in groups]
    if got != want:
        raise ValueError(f"Start groups would be {got}, not {want}")
    return {"roles": roles, "groups": want}


def seam_port_groups(part_a, ball_a, trim_a, part_b, ball_b):
    """Pavlovich's recessed port across a seam (cw449pmS64g 00:01:06 to 00:04:34): one sphere,
    the half on part A's side added to A (a boss), the half on B's side subtracted from B (the
    socket), so both line up across the seam. He slices the sphere; this Live Boolean form
    needs no stroke [added]: group A = part_a + ball_a - trim_a (a box on B's side, just off the
    seam plane, removes ball_a's B half); group B = part_b - ball_b (only the half inside B cuts).
    ball_a and ball_b are copies of the same placed sphere (Dynamic Smooth on, which DSDiv
    carries into the result: Pavlovich creases and divides his halves so they do not facet)."""
    return roles_from_groups([[(part_a, "add"), (ball_a, "add"), (trim_a, "sub")],
                              [(part_b, "add"), (ball_b, "sub")]])


def fitted_split_groups(body_a, cutter_a, body_b, cutter_b):
    """Two parts that fit with no gap (a visor, hatch or panel embedded in a shell), from one
    cutter used twice [added]: group 1 = body_a INTERSECT cutter_a (the piece: Intersect keeps
    only the overlap, LB doc operators), group 2 = body_b - cutter_b (the shell with its opening).
    body_b is a duplicate of body_a and cutter_b a duplicate of cutter_a, so the borders match:
    the boolean stand-in for Knife + Split To Parts (8LNjAkqr_lI 00:01:34) or Slice + DynaMesh
    Groups (Yprguxci8NY 00:01:05). For a constant gap, scale cutter_b up by the gap."""
    return roles_from_groups([[(body_a, "add"), (cutter_a, "intersect")],
                              [(body_b, "add"), (cutter_b, "sub")]])


# ZModeler 2026: options live in the Space pop-up (no item path). Labels are in the 2026.2.1
# UI strings as ZModeler modifiers [strings]; behaviour from Maxon's 2026 update video.
ZMODELER_2026 = {
    "insert_edgeloop": {
        "element": "edge", "menu": "Insert > Single EdgeLoop or Multiple EdgeLoops",
        "options": {"hold": "Crease", "free": "Do Not Crease"}, "default": "Do Not Crease",
        "since": (2026, 0), "source": "Maxon 6KZiNEO65YY 00:01:06 to 00:01:40"},
    "inset": {
        "element": "polygon", "menu": "Inset",
        "options": {"crisp": "Crease New Edges", "rounded": "Crease Inner Poly",
                    "free": "Do Not Crease"},
        "default": "Do Not Crease", "since": (2026, 0),
        "source": "6KZiNEO65YY 00:01:40 to 00:02:44 (Crease New Edges creases the inner loop and "
                  "the outer supporting edges; Crease Inner Poly only the inner loop: rounded)"},
    "bevel": {
        "element": "edge", "menu": "Bevel",
        "options": {"all": "All Edges", "outer": "Outer Edges", "inner": "Inner Edges"},
        "default": None, "since": (2026, 2, 1),
        "source": "release notes 2026.2.1 (inner or outer edge modes); labels [strings]"},
    "qmesh": {
        "element": "polygon", "menu": "QMesh", "options": {}, "default": "QMesh",
        "since": (2021,), "source": "XcR5TzvIaoc 00:04:33; 2026.2.1 fixed ZModeler defaulting to "
                                    "Extrude instead of QMesh (release notes)"},
}


def zmodeler_plan(action, intent=None, ring_quads=None, region_border=None, build=(2026, 2, 1)):
    """What to set in the ZModeler Space menu for one action, and the face delta that proves the
    click ran (the SDK cannot read the menu state). 2026.0 creases at creation: Insert EdgeLoop
    (Crease) and Inset (Crease New Edges for a crisp inset with supported borders, Crease Inner
    Poly for a rounded one) replace the alternate-polygroup plus Crease PG pass; the defaults are
    Do Not Crease, so a loop added with Dynamic on holds nothing until Crease is picked (Maxon
    6KZiNEO65YY). Face deltas are [added]: a full loop across a ring of n quads adds n faces;
    Inset of one quad adds 4; Inset Region with b border edges adds b."""
    if action not in ZMODELER_2026:
        raise ValueError(f"action must be one of {sorted(ZMODELER_2026)}")
    a = ZMODELER_2026[action]
    out = {"action": action, "element": a["element"], "menu": a["menu"], "default": a["default"],
           "source": a["source"], "warnings": []}
    if a["options"]:
        if intent is None:
            raise ValueError(f"{action}: say the intent, one of {sorted(a['options'])}")
        if intent not in a["options"]:
            raise ValueError(f"{action}: intent must be one of {sorted(a['options'])}")
        out["option"] = a["options"][intent]
        out["changes_default"] = out["option"] != a["default"]
    if tuple(build) < tuple(a["since"]):
        out["warnings"].append(f"{action} options need ZBrush {'.'.join(map(str, a['since']))}; "
                               "on this build use GroupsLoops or regroup, then Crease PG")
    if action == "qmesh" and tuple(build) < (2026, 2, 1):
        out["warnings"].append("before 2026.2.1 ZModeler could default to Extrude: check the "
                               "polygon action before trusting a QMesh step")
    if action == "insert_edgeloop" and ring_quads:
        out["face_delta"] = int(ring_quads)
    elif action == "inset":
        if region_border:
            out["face_delta"] = int(region_border)
        elif intent is not None:
            out["face_delta"] = 4
    return out


def bridge_preflight(rows, low_high=True, force_unwrap=False, send_polypaint=False,
                     auto_bake=True):
    """Checks before Texture > Substance Bridge > Send to Painter (2026.2.0; VD 3.6). rows, one
    per SubTool sent: {"name", "levels", "has_uvs", "qgrid_applied" (optional), "polypaint"
    (optional bool)}. Low & High sends each SubTool's lowest and highest level, so the
    bake_split copy (Apply) carries both; after Apply with QGrid 0 level 1 is the Dynamic cage,
    with QGrid it is the QGrid mesh [added, from the DSUB Apply rule]. Force UV Auto-Unwrap is
    global and strips existing UVs from every SubTool. Each send makes a new Painter project."""
    problems, warnings = [], []
    names = [r.get("name") for r in rows]
    dup = sorted({str(n) for n in names if names.count(n) > 1})
    if dup:
        warnings.append(f"duplicate SubTool names {dup}: keep names unique so parts pair by name "
                        "[added]")
    for r in rows:
        nm = r.get("name")
        if low_high and (r.get("levels") or 1) < 2:
            problems.append(f"{nm}: Low & High needs subdivision levels (level 1 = low, top = "
                            "high): run bake_split, or send Current")
        if low_high and (r.get("qgrid_applied") or 0) > 0:
            warnings.append(f"{nm}: QGrid was applied, so level 1 is the QGrid mesh, not the cage")
        if not force_unwrap and not r.get("has_uvs"):
            problems.append(f"{nm}: no UVs; unwrap level 1 first (scenario-zbrush-retopology-export "
                            "unwrap_creases) or allow Force UV Auto-Unwrap")
        if send_polypaint and r.get("polypaint") is False:
            warnings.append(f"{nm}: Send PolyPaint is on but the part has no polypaint "
                            "(FillObject per part gives the ID colours)")
    if force_unwrap and any(r.get("has_uvs") for r in rows):
        problems.append("Force UV Auto-Unwrap is global: it strips existing UVs from every "
                        "SubTool; turn it off to keep them")
    notes = ["each send creates a new Painter project; there is no incremental update"]
    if auto_bake:
        notes.append("Auto-Bake with every option on did not trigger on Mac before 2026.2.1")
    return {"problems": problems, "warnings": warnings, "notes": notes, "ok": not problems}


def layer_safe(recorded, current):
    """3D layers store per-point offsets and 'cannot survive added or removed geometry' (Klimer
    08crkU999Fs 00:49:08). recorded: zb_ops.stats() when the layer was made; current: the same
    now. Any change in points, faces or level count means the layer no longer applies: make
    detail layers after the last boolean, remesh, Apply or Panel Loops, or bake them first."""
    keys = [k for k in ("points", "faces", "sdiv_max", "levels") if k in recorded and k in current]
    if not keys:
        raise ValueError("no comparable keys (points, faces, sdiv_max, levels)")
    changed = {k: (recorded[k], current[k]) for k in keys if recorded[k] != current[k]}
    return {"ok": not changed, "changed": changed, "compared": keys}


def spaced_points(polyline, count=None, pitch=None, start=0.0):
    """Evenly spaced seats along a 3D polyline (arc length), with unit tangents: exact bolt or
    rivet runs for import_part, ArrayMesh checks or NanoMesh helper planes. count puts the first
    and last seat on the ends; pitch steps from `start`. The 2024 IMM Dots stroke spaces by
    LazyStep and a Curve Mode run by Curve Step (1 = parts touch) (wnONEaRVhYU 00:03:43; IMM
    doc Curve Strokes); this gives the same spacing as numbers [added]."""
    pts = [tuple(float(c) for c in p) for p in polyline]
    if len(pts) < 2:
        raise ValueError("need at least two points")
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    total = sum(seg)
    if total <= 0:
        raise ValueError("zero-length polyline")
    if count is not None:
        count = int(count)
        if count < 1:
            raise ValueError("count >= 1")
        ds = [total / 2] if count == 1 else [total * i / (count - 1) for i in range(count)]
    elif pitch is not None:
        if pitch <= 0:
            raise ValueError("pitch > 0")
        ds, d = [], float(start)
        while d <= total + 1e-9:
            ds.append(d)
            d += float(pitch)
    else:
        raise ValueError("give count or pitch")
    out, i, acc = [], 0, 0.0
    for d in ds:
        while i < len(seg) - 1 and acc + seg[i] < d - 1e-12:
            acc += seg[i]
            i += 1
        t = 0.0 if seg[i] == 0 else min(max((d - acc) / seg[i], 0.0), 1.0)
        a, b = pts[i], pts[i + 1]
        p = tuple(a[k] + t * (b[k] - a[k]) for k in range(3))
        tan = tuple((b[k] - a[k]) / (seg[i] or 1.0) for k in range(3))
        out.append({"point": [round(c, 9) for c in p], "tangent": [round(c, 9) for c in tan],
                    "distance": round(d, 9)})
    return {"seats": out, "length": round(total, 9), "count": len(out)}


def to_tool_units(real_size, real_extent, tool_extent):
    """A real dimension (a 2 mm chamfer, a 6 mm bolt) in ZBrush tool units, given the part's
    real extent and its extent in the tool (bbox). The Unified tool is about 2 units long and
    export scale is set at the end (Chervenka; iWq7dFxf55I), so briefs in mm need this before
    Crease Bevel widths or cutter sizes [added]."""
    if real_extent <= 0 or tool_extent <= 0:
        raise ValueError("extents must be > 0")
    return float(real_size) * float(tool_extent) / float(real_extent)


def normal_stats(normals):
    """Spread of canvas normals (pixol_pick 6..8) over one plane: the numeric proxy for
    Plouffe's 'wobbliness' check [added]. Zero-length samples (background) are skipped."""
    pts = [n for n in normals if math.sqrt(sum(c * c for c in n)) > 0.5]
    if not pts:
        return {"samples": 0}
    unit = [tuple(c / math.sqrt(sum(k * k for k in n)) for c in n) for n in pts]
    m = [sum(u[i] for u in unit) / len(unit) for i in range(3)]
    ml = math.sqrt(sum(c * c for c in m)) or 1.0
    m = [c / ml for c in m]
    ang = sorted(math.degrees(math.acos(max(-1.0, min(1.0, sum(a * b for a, b in zip(u, m))))))
                 for u in unit)
    p95 = ang[min(len(ang) - 1, int(round(0.95 * (len(ang) - 1))))]
    return {"samples": len(unit), "skipped": len(normals) - len(unit),
            "mean_normal": [round(c, 5) for c in m], "mean_deg": round(sum(ang) / len(ang), 4),
            "p95_deg": round(p95, 4), "max_deg": round(ang[-1], 4)}


def obj_ngons(path, limit=5):
    """Faces with more than four corners in an OBJ (pure Python). ZBrush asks in a modal note how
    to split them on import ('This mesh contains nonstandard polygons', UInterface.zsc)."""
    n, first = 0, []
    with open(path, "r", errors="ignore") as fh:
        for i, line in enumerate(fh):
            if line.startswith("f "):
                k = len(line.split()) - 1
                if k > 4:
                    n += 1
                    if len(first) < limit:
                        first.append((i + 1, k))
    return {"ngons": n, "first": first}


def obj_face_count(path):
    with open(path, "r", errors="ignore") as fh:
        return sum(1 for line in fh if line.startswith("f "))


# --------------------------------------------------------------------------------------------
# Inside ZBrush
# --------------------------------------------------------------------------------------------

def _z():
    return zb_ops._z()


def resolve_hs(key, required=True):
    """First existing candidate for `key` whose bubble help matches HS_INFO (when known).
    A label that exists with the wrong bubble help is a duplicate-label collision."""
    cands = HS_PATHS.get(key, [key]) if isinstance(key, str) else list(key)
    want = HS_INFO.get(key) if isinstance(key, str) else None
    z = _z()
    rejected = []
    for p in cands:
        if not z.exists(p):
            continue
        info = ""
        if want:
            try:
                info = z.get_info(p) or ""
            except Exception:
                info = ""
        if want and info and want.lower() not in info.lower():
            rejected.append((p, info[:80]))
            continue
        return p
    if not required:
        return None
    if rejected:
        raise ZBOpError(f"{key}: {rejected} exist but their bubble help does not contain "
                        f"{want!r} (duplicate label)")
    raise ZBOpError(f"{key}: none of {cands} exists (label changed, wrong mode, or the item "
                    "lives elsewhere: record a macro and read the Activity log)")


def _set(key, value, tol=0.51):
    return zb_ops.set_checked([resolve_hs(key)], value, tol=tol)


def _switch(key, on):
    return zb_ops.set_checked([resolve_hs(key)], 1 if on else 0, tol=0.5)


def _press(key, check_enabled=True):
    p = resolve_hs(key)
    zb_ops.press([p], check_enabled=check_enabled)
    _z().update(redraw_ui=True)
    return p


def _press_mod(key, bits):
    """Press an axis button (Mirror And Weld, Deformation Mirror) with modifier bits x=1, y=2,
    z=4 (shipped Append Eyes macro: IModSet 1/2/4) and restore the previous modifiers."""
    z = _z()
    p = resolve_hs(key)
    old = z.get_mod(p)
    z.set_mod(p, bits)
    try:
        z.press(p)
        z.update(redraw_ui=True)
    finally:
        z.set_mod(p, old)
    return p


def _levels():
    p = zb_ops.resolve("sdiv", required=False)
    return int(round(_z().get_max(p))) if p else 1


def _faces():
    return int(_z().query_mesh3d(1)[0])


def _bbox(mode=1):
    return [float(v) for v in _z().query_mesh3d(2, mode)]


def _subtool_name():
    z = _z()
    p = resolve_hs("current_tool", required=False)
    if p:
        try:
            t = z.get_title(p)
            if t:
                return t.strip().rstrip(".").strip()
        except Exception:
            pass
    return z.get_active_tool_path()


_SEMANTICS = [None]  # "absolute" or "toggle" once a write has been read back


def set_status(index, op=None, start=None, visible=None, semantics=None):
    """Set a SubTool's operator / Start / eye with read-back. The SDK docstring says
    set_subtool_status "realizes a toggle logic", while Maxon's own example and the shipped
    Create Instance Subtool macro write absolute values: the function tries absolute first,
    reads back, falls back to toggling the difference, and remembers what worked."""
    z = _z()
    index = int(index)
    cur = int(z.get_subtool_status(index))
    want = desired_status(cur, op, start, visible)
    res = {"index": index, "before": cur, "want": want, "tried": []}
    if (cur & MASK) == (want & MASK):
        res.update(after=cur, changed=False, semantics=_SEMANTICS[0])
        return res
    order = [semantics] if semantics else ([_SEMANTICS[0]] if _SEMANTICS[0] else
                                           ["absolute", "toggle"])
    for sem in order:
        now = int(z.get_subtool_status(index))
        val = want if sem == "absolute" else (now ^ want) & MASK
        z.set_subtool_status(index, val)
        got = int(z.get_subtool_status(index))
        res["tried"].append({"semantics": sem, "wrote": val, "read": got})
        if (got & MASK) == (want & MASK):
            _SEMANTICS[0] = sem
            res.update(after=got, changed=True, semantics=sem)
            return res
    raise ZBOpError(f"set_subtool_status({index}) did not reach {want:#x}: {res['tried']}")


def set_roles(roles, semantics=None):
    """roles: [{"index": i, "op": "add"|"sub"|"clip"|"none", "start": bool, "visible": bool}].
    Pavlovich's stack: main body on top (Add or Start), cutters below, one Start per part that
    must stay separate (HXnKnrhlFpA 00:00:33, 00:07:01; Ab0ixptmNeA 00:01:07)."""
    out = []
    for r in roles:
        out.append(set_status(r["index"], r.get("op"), r.get("start"), r.get("visible"),
                              semantics or _SEMANTICS[0]))
    return {"results": out, "semantics": _SEMANTICS[0]}


def dynamic_state(required=False):
    z = _z()
    out = {}
    for name, key in (("on", "dyn_on"), ("qgrid", "dyn_qgrid"), ("flat", "dyn_flat"),
                      ("smooth", "dyn_smooth"), ("crease_lvl", "crease_lvl")):
        p = resolve_hs(key, required=required)
        if p:
            v = z.get(p)
            out[name] = bool(v >= 0.5) if name == "on" else int(round(v))
    return out


def stack_report(read_dynamic=True, density_factor=16.0):
    """Every SubTool: status bits, folder-aware visibility (zb_ops.subtools), faces, area,
    watertight, levels, partial hiding (visible bbox differs from the full bbox [added]) and
    the Dynamic Subdiv state; then the Start groups and the pre-flight verdict."""
    z = _z()
    n = int(z.get_subtool_count())
    active = int(z.get_active_subtool_index())
    vis = {s["index"]: s["visible"] for s in zb_ops.subtools()}
    rows = []
    try:
        for i in range(n):
            st = int(z.get_subtool_status(i))
            row = {"index": i, "status": st, **decode_status(st), "visible": vis.get(i, True)}
            if z.select_subtool(i) != 0:
                row["error"] = "select_subtool failed"
                rows.append(row)
                continue
            try:
                row["name"] = _subtool_name()
                row["faces"] = _faces()
                row["points"] = int(z.query_mesh3d(0)[0])
                full, shown = _bbox(1), _bbox(0)
                row["bbox"] = [round(v, 6) for v in full]
                ext = max(full[3] - full[0], full[4] - full[1], full[5] - full[2]) or 1.0
                row["partly_hidden"] = max(abs(a - b) for a, b in zip(full, shown)) > 1e-4 * ext
                row["area"] = float(z.get_polymesh3d_area())
                row["solid"] = bool(z.is_polymesh3d_solid())
                row["levels"] = _levels()
            except Exception as e:
                row["mesh_error"] = repr(e)
            if read_dynamic:
                try:
                    row["dynamic"] = dynamic_state(required=False)
                except Exception as e:
                    row["dynamic_error"] = repr(e)
            rows.append(row)
    finally:
        z.select_subtool(active)
    pre = stack_problems(rows, density_factor)
    return {"subtools": rows, "active": active, "groups": boolean_groups(rows), **pre}


def live_boolean(on=True, show_coplanar=None, show_issues=None):
    """Render > Render Booleans: Live Boolean, plus the native analysis (LB doc Geometry
    Analysis): Show Coplanar BEFORE Make Boolean Mesh (coplanar faces in red), Show Issues on the
    result AFTER it (red outlines on holes and edges shared by more than 2 polygons). Take a
    zb_review.snapshot with each on; coplanar_report is the numeric twin of Show Coplanar."""
    out = {"live_boolean": _switch("live_boolean", on)}
    if show_coplanar is not None:
        out["show_coplanar"] = _switch("show_coplanar", show_coplanar)
    if show_issues is not None:
        out["show_issues"] = _switch("show_issues", show_issues)
    return out


def _tool_paths():
    z = _z()
    return [z.get_tool_path(i) for i in range(int(z.get_tool_count()))]


def make_boolean_mesh(dsdiv=True, select=True, require_clean=True):
    """Tool > SubTool > Boolean > Make Boolean Mesh with the pre-flight first. Needs Live
    Boolean on and more than one SubTool (LB doc Basic Process). The result is a NEW tool whose
    name starts with UMesh_, one SubTool per Start group (LB doc Advanced Process).
    Blocking risk: coplanar faces raise a Yes/No note ('The Boolean contains coplanar faces...
    Do you really want to launch Boolean whatever?', UInterface.zsc); run coplanar_report on
    OBJ exports first, and call this with a short bridge timeout."""
    rep = stack_report()
    if require_clean and rep["problems"]:
        raise ZBOpError(f"boolean pre-flight failed: {rep['problems']}")
    z = _z()
    live_boolean(True)
    if dsdiv is not None:
        _switch("dsdiv", dsdiv)
    before = _tool_paths()
    _press("make_boolean", check_enabled=True)
    after = _tool_paths()
    seen = set(before)
    new = [(i, p) for i, p in enumerate(after) if p not in seen]
    umesh = [(i, p) for i, p in new if "umesh" in os.path.basename(str(p)).lower()]
    out = {"new_tools": new, "umesh": umesh, "expected_subtools": len(rep["groups"]),
           "warnings": rep["warnings"]}
    if select and umesh:
        z.select_tool(umesh[-1][0])
        out["umesh_subtools"] = int(z.get_subtool_count())
        out["ok"] = out["umesh_subtools"] == out["expected_subtools"]
    else:
        out["ok"] = bool(umesh)
    return out


def dynamic_subdiv(smooth=None, crease_lvl=None, qgrid=None, flat=None, coverage=None,
                   thickness=None, on=True, intent=None):
    """Tool > Geometry > Dynamic Subdiv values with read-back. intent (working, bake, tight, soft,
    cutter, razor) fills smooth and crease_lvl from crease_plan. QGrid is for boxy blocks: it
    facets curves and packs polygons on every edge (Pavlovich qeFclVta4No 00:22:59, 00:28:24)."""
    if intent:
        plan = crease_plan(intent)
        smooth = plan["smooth"] if smooth is None else smooth
        crease_lvl = plan["crease_lvl"] if crease_lvl is None else crease_lvl
    out = {}
    for name, key, val in (("qgrid", "dyn_qgrid", qgrid), ("flat", "dyn_flat", flat),
                           ("smooth", "dyn_smooth", smooth), ("coverage", "dyn_coverage", coverage),
                           ("thickness", "dyn_thickness", thickness),
                           ("crease_lvl", "crease_lvl", crease_lvl)):
        if val is not None:
            out[name] = _set(key, val, tol=0.51 if name not in ("coverage", "thickness") else 1e-3)
    if on is not None:
        out["on"] = _switch("dyn_on", on)
    st = dynamic_state(required=False)
    base = _faces()
    lv = _levels()
    out.update(state=st, base_faces=base, levels=lv,
               display_faces=subdiv_faces(base, 0, st.get("qgrid", 0), st.get("flat", 0),
                                          st.get("smooth", 0)) if st.get("on") else base)
    if "smooth" in st and "crease_lvl" in st:
        out["crease_gap"] = st["smooth"] - st["crease_lvl"]
    if lv > 1:
        out["warning"] = "classic levels present: Dynamic and classic mix only at low levels (DSUB)"
    return out


def crease_by_groups(max_angle=45.0, one_group_first=True, uncrease_first=True):
    """Polygroups as the crease plan: (show all, Group Visible = Ctrl+W), Groups By Normals at
    MaxAngle (45 default catches 90 degree edges; 33 catches softer planes; 60 misses edges),
    UnCreaseAll, Crease PG (Pavlovich qeFclVta4No 00:11:42 to 00:12:15; Plouffe 02:11:55).
    Pitfall: Crease PG after later edits recreases borders you had uncreased (00:16:32)."""
    pressed = []
    if one_group_first:
        zb_ops.visibility("show")
        pressed.append(_press("group_visible"))
    out = {"max_angle": _set("max_angle", max_angle, tol=0.51)}
    pressed.append(_press("groups_by_normals"))
    if uncrease_first:
        pressed.append(_press("uncrease_all"))
    pressed.append(_press("crease_pg"))
    out.update(pressed=pressed, faces=_faces())
    return out


def crease_by_angle(tolerance=45.0, uncrease_first=True):
    """UnCreaseAll, CTolerance, Crease: every edge sharper than the tolerance (45 equals Group By
    Normals 45 + Crease PG; 22 held an arch without creasing its small angles) (qeFclVta4No
    00:18:05, 00:23:30). Also the way to sharpen cutters that inherit Dynamic smoothing
    (HXnKnrhlFpA 00:01:42)."""
    pressed = []
    if uncrease_first:
        pressed.append(_press("uncrease_all"))
    out = {"ctolerance": _set("ctolerance", tolerance, tol=0.51)}
    pressed.append(_press("crease"))
    out["pressed"] = pressed
    return out


def crease_bevel(width=None, resolution=None, press=True):
    """Crease > Bevel: real bevel geometry along creased edges (Pavlovich qeFclVta4No 00:19:02;
    Chervenka's Bevel Width fix for crease pinching at poles, PGX39tnEf3Y 00:31:38) [verify]."""
    out = {}
    if width is not None:
        out["width"] = _set("crease_bevel_width", width, tol=1e-3)
    if resolution is not None:
        out["resolution"] = _set("crease_bevel_res", resolution)
    if press:
        f0 = _faces()
        _press("crease_bevel")
        out.update(faces_before=f0, faces_after=_faces())
    return out


def apply_dynamic():
    """Dynamic Subdiv > Apply: real levels. Expect 1 + Flat + Smooth levels (apply_levels) and
    base x 4^(QGrid+Flat+Smooth) faces on an all-quad mesh (DSUB). The Apply crash is fixed in
    2026.2.1 (release notes). Stay in preview until the shape is final (qeFclVta4No 00:25:33)."""
    st = dynamic_state(required=True)
    if not st.get("on"):
        raise ZBOpError("Dynamic Subdiv is off: nothing to apply")
    f0 = _faces()
    _press("dyn_apply")
    lv = _levels()
    exp = apply_levels(st.get("qgrid", 0), st.get("flat", 0), st.get("smooth", 0))
    return {"state": st, "faces_before": f0, "levels": lv, "expected_levels": exp,
            "ok": lv == exp}


def bake_split(bake_smooth=4, crease_lvl=2):
    """Pavlovich's bake split (qeFclVta4No 00:25:50): duplicate the SubTool; Apply at
    Smooth 4 / CreaseLvl 2 on the copy (the high to bake); Dynamic off on the original (the
    game-res mesh, check it for over-curved edges). The copy is expected directly below [verify]."""
    z = _z()
    zb_ops.ensure_edit()
    i = int(z.get_active_subtool_index())
    n0 = int(z.get_subtool_count())
    zb_ops.press("duplicate")
    z.update(redraw_ui=True)
    if int(z.get_subtool_count()) != n0 + 1:
        raise ZBOpError("Duplicate did not add a SubTool")
    copy = i + 1
    z.select_subtool(copy)
    dyn = dynamic_subdiv(smooth=bake_smooth, crease_lvl=crease_lvl, on=True)
    app = apply_dynamic()
    z.select_subtool(i)
    _switch("dyn_on", False)
    return {"low_index": i, "high_index": copy, "high": app, "high_dynamic": dyn,
            "low_faces": _faces()}


def mirror_weld(axis="x", keep=None, check_floor=True, allow_levels=False):
    """Mirror And Weld ALWAYS copies the NEGATIVE half onto the positive half; when the good
    half is on +X, Deformation > Mirror runs first so the good half becomes the negative one
    (Pavlovich 8LNjAkqr_lI 00:06:49, FOdVdgiAHWo 00:06:52; Plouffe 02:01:25). keep has no
    default on purpose: say which half holds the edit ("neg" or "pos"), from where you cut
    (Slice, Trim and BRadius ignore symmetry; a one-sided boolean or ZModeler edit too), or from
    mirror_report on an OBJ export; confirm with mirror_check afterwards. Refuses a mesh with
    levels (Plouffe: delete levels, mirror, Reconstruct Subdiv when topology did not change).
    A floor 'Elv' not at 0 raises a Yes/No note (UInterface.zsc), so Draw:Elv is set to 0 first
    [verify path]."""
    z = _z()
    if keep not in ("neg", "pos"):
        raise ZBOpError("mirror_weld: pass keep='neg' or keep='pos' (the half that holds the edit); "
                        "Mirror And Weld overwrites the positive half with the negative one")
    bits = {"x": 1, "y": 2, "z": 4}[axis]
    if _levels() > 1 and not allow_levels:
        raise ZBOpError("SubTool has subdivision levels: delete them (zb_ops.del_levels) or pass "
                        "allow_levels=True")
    out = {"axis": axis, "keep": keep}
    if check_floor:
        p = resolve_hs("floor_elv", required=False)
        if p is not None and abs(float(z.get(p))) > 1e-9:
            out["floor_elv_was"] = float(z.get(p))
            z.set(p, 0)
    b0 = _bbox(1)
    if keep == "pos":
        out["mirror"] = _press_mod("deform_mirror", bits)
    out["mirror_weld"] = _press_mod("mirror_weld", bits)
    b1 = _bbox(1)
    k = "xyz".index(axis)
    span = (b1[k + 3] - b1[k]) or 1.0
    out.update(bbox_before=b0, bbox_after=b1,
               symmetry_error=abs(b1[k] + b1[k + 3]) / span, faces=_faces())
    out["ok"] = out["symmetry_error"] < 1e-3
    return out


def panel_loops(loops=1, thickness=None, thickness_rel=None, polish=0, bevel=0, elevation=-100,
                double=True, ignore_groups=True, append=None, inner=None):
    """Panel Loops on the polygroups. Defaults are Plouffe's plate recipe: Loops 1, Polish 0,
    Bevel 0, Elevation -100, Double on, Ignore Groups on, only Thickness tuned (0.0046 on his
    plate) (u75skb32GTo 02:09:12, frame 02:14:34). thickness_rel x bbox diagonal is [added].
    No subdivision levels allowed (HS doc)."""
    if _levels() > 1:
        raise ZBOpError("Panel Loops needs a mesh without subdivision levels")
    if thickness is None and thickness_rel is not None:
        b = _bbox(1)
        thickness = thickness_rel * math.dist(b[:3], b[3:])
    out = {}
    for name, key, val, tol in (("loops", "pl_loops", loops, 0.51),
                                ("thickness", "pl_thickness", thickness, 1e-4),
                                ("polish", "pl_polish", polish, 0.51),
                                ("bevel", "pl_bevel", bevel, 0.51),
                                ("elevation", "pl_elevation", elevation, 0.51)):
        if val is not None:
            out[name] = _set(key, val, tol=tol)
    for name, key, val in (("double", "pl_double", double), ("ignore_groups", "pl_ignore_groups",
                                                               ignore_groups),
                           ("append", "pl_append", append), ("inner", "pl_inner", inner)):
        if val is not None:
            out[name] = _switch(key, val)
    f0 = _faces()
    _press("pl_button")
    out.update(faces_before=f0, faces_after=_faces(), solid=bool(_z().is_polymesh3d_solid()))
    return out


def groups_loops(loops=1, gpolish=None):
    """GroupsLoops: loops around every polygroup, the scripted stand-in for support loops
    (qob31SzC754; Plouffe contour cleanup with Loops 1 or 0 and some GPolish, 01:59:16)."""
    if _levels() > 1:
        raise ZBOpError("GroupsLoops needs a mesh without subdivision levels")
    out = {"loops": _set("gl_loops", loops)}
    if gpolish is not None:
        out["gpolish"] = _set("gl_gpolish", gpolish)
    f0 = _faces()
    _press("groups_loops")
    out.update(faces_before=f0, faces_after=_faces())
    return out


def array_mesh(repeat, offset=None, scale=None, rotate=None, pivot=None, on=True):
    """Tool > Array Mesh on the active SubTool. Each of offset / scale / rotate / pivot is an
    (x, y, z) triple set through its mode button then X/Y/Z Amount [strings; mode semantics
    verify]. ArrayMesh the CUTTER, not the result: editing the source updates every instance
    and the Live Boolean (Pavlovich x1gN9-SocYY 00:09:05, 00:10:13)."""
    out = {}
    if on is not None:
        out["on"] = _switch("am_on", on)
    out["repeat"] = _set("am_repeat", repeat)
    for name, mode, vals in (("offset", "am_offset_mode", offset), ("scale", "am_scale_mode", scale),
                             ("rotate", "am_rotate_mode", rotate), ("pivot", "am_pivot_mode", pivot)):
        if vals is None:
            continue
        _press(mode, check_enabled=False)
        out[name] = [_set(k, v, tol=1e-3) for k, v in zip(("am_x", "am_y", "am_z"), vals)]
    out["bbox_full"] = _bbox(1)
    return out


def array_commit(mode="mesh"):
    """a.Make Mesh (real geometry) or a.Convert To NanoMesh (per-instance variation, Chervenka
    PGX39tnEf3Y 00:23:43)."""
    f0 = _faces()
    _press("am_make_mesh" if mode == "mesh" else "am_to_nano")
    return {"mode": mode, "faces_before": f0, "faces_after": _faces()}


def nanomesh_set(**values):
    """Tool:NanoMesh:m.<label> values; paths confirmed by the shipped Create Instance Subtool
    macro (m.Width, m.Length, m.Height, m.XRotation, m.YRotation, m.ZRotation, m.Size, m.Fit,
    m.ShowPlacement). Keys use the label without the prefix: nanomesh_set(ZRVar=10, Size=1)."""
    out = {}
    for k, v in values.items():
        p = zb_ops.resolve([f"Tool:NanoMesh:m.{k}"])
        if isinstance(v, bool):
            out[k] = zb_ops.set_checked([p], 1 if v else 0, tol=0.5)
        else:
            out[k] = zb_ops.set_checked([p], v, tol=1e-3)
    return out


_INIT = {"cube": "init_qcube", "sphere": "init_qsphere", "grid": "init_qgrid",
         "cyl_x": "init_qcyl_x", "cyl_y": "init_qcyl_y", "cyl_z": "init_qcyl_z"}


def new_part(kind="cube", res=(2, 2, 2), unify=True, method="duplicate", dynamic_off=True,
             op=None):
    """A new SubTool built from Tool > Initialize, below the active one, without strokes.
    method "duplicate": Duplicate the active level-free SubTool, then Initialize on the copy
    (Pavlovich TANNfCLxFx4 00:00:00 replaces a duplicate with Initialize > QCube).
    method "append": Tool:SubTool:Append + PopUp:PolyMesh3D, the shipped "Append a QCube
    Subtool" macro [macro; whether the popup press returns in Python is verify].
    Then X/Y/Z Res, the Q button, Unify (the macro does the same). A duplicate reverts to Union
    (HXnKnrhlFpA 00:05:01) and keeps the source's Dynamic settings, so Dynamic is switched off."""
    if kind not in _INIT:
        raise ValueError(f"kind must be one of {sorted(_INIT)}")
    z = _z()
    zb_ops.ensure_edit()
    i = int(z.get_active_subtool_index())
    n0 = int(z.get_subtool_count())
    if method == "duplicate":
        if _levels() > 1:
            raise ZBOpError("the active SubTool has levels: Initialize refuses them; select a "
                            "level-free SubTool or use method='append'")
        zb_ops.press("duplicate")
        new_index = i + 1
    elif method == "append":
        _press("append", check_enabled=False)
        zb_ops.press(["PopUp:PolyMesh3D"], check_enabled=False)
        new_index = n0
    else:
        raise ValueError("method must be duplicate or append")
    z.update(redraw_ui=True)
    if int(z.get_subtool_count()) != n0 + 1:
        raise ZBOpError(f"{method} did not add a SubTool ({n0} -> {z.get_subtool_count()})")
    z.select_subtool(new_index)
    if int(z.get_active_subtool_index()) != new_index:
        raise ZBOpError("could not select the new SubTool; nothing was initialized")
    for key, v in zip(("init_xres", "init_yres", "init_zres"), res):
        if v is not None:
            _set(key, v)
    _press(_INIT[kind], check_enabled=False)
    if unify:
        _press("unify", check_enabled=False)
    out = {"index": new_index, "kind": kind, "method": method, "faces": _faces(),
           "solid": bool(z.is_polymesh3d_solid()), "bbox": _bbox(1)}
    if dynamic_off and resolve_hs("dyn_on", required=False):
        _switch("dyn_on", False)
    if op is not None:
        out["status"] = set_status(new_index, op=op)
    return out


def place(position=None, size=None, xyz_size=None, rotate=None):
    """Numeric placement of the active SubTool: Tool:Geometry:X/Y/Z Position (bbox centre, tool
    units) and XYZ Size or X/Y/Z Size (full extent), as the shipped Append Eyes and Snap To
    Ground macros use them [macro]; setting per-axis Size is [verify]. rotate: degrees per axis
    through Tool:Deformation:Rotate with axis modifiers (zb_ops.deform) [verify]."""
    out = {}
    if xyz_size is not None:
        out["xyz_size"] = _set("xyz_size", xyz_size, tol=1e-3)
    if size is not None:
        out["size"] = [_set(k, v, tol=1e-3) for k, v in zip(("x_size", "y_size", "z_size"), size)
                       if v is not None]
    if rotate is not None:
        out["rotate"] = [zb_ops.deform("Rotate", deg, axes=bit)
                         for deg, bit in zip(rotate, (1, 2, 4)) if deg]
    if position is not None:
        out["position"] = [_set(k, v, tol=1e-3) for k, v in zip(("x_pos", "y_pos", "z_pos"),
                                                                 position) if v is not None]
    out["bbox"] = _bbox(1)
    return out


def import_part(obj_path, position=None, xyz_size=None, op=None):
    """A part modelled elsewhere (Maya, Blender, a kitbash library) as a new SubTool: duplicate
    the active level-free SubTool, then Tool:Import into the copy with set_next_filename
    (dialog-free for Export [bridge]; for Import [verify]). OBJs with n-gons are refused: ZBrush
    would ask in a modal note how to split them."""
    obj_path = os.path.abspath(os.path.expanduser(obj_path))
    if not os.path.exists(obj_path):
        raise ZBOpError(f"{obj_path} not found")
    ng = obj_ngons(obj_path)
    if ng["ngons"]:
        raise ZBOpError(f"{ng['ngons']} n-gons in {obj_path} (first {ng['first']}): triangulate or "
                        "quadrangulate them in the DCC before export")
    z = _z()
    zb_ops.ensure_edit()
    if _levels() > 1:
        raise ZBOpError("the active SubTool has levels: select a level-free SubTool first")
    i = int(z.get_active_subtool_index())
    n0 = int(z.get_subtool_count())
    zb_ops.press("duplicate")
    z.update(redraw_ui=True)
    if int(z.get_subtool_count()) != n0 + 1:
        raise ZBOpError("Duplicate did not add a SubTool")
    z.select_subtool(i + 1)
    z.set_next_filename(obj_path)
    zb_ops.press(["Tool:Import"], check_enabled=False)
    z.update(redraw_ui=True)
    pending = None
    try:
        pending = bool(z.has_next_filename())
    except Exception:
        pass
    faces = _faces()
    want = obj_face_count(obj_path)
    out = {"index": i + 1, "faces": faces, "obj_faces": want, "preset_pending": pending,
           "ok": faces == want}
    if position is not None or xyz_size is not None:
        out["place"] = place(position=position, xyz_size=xyz_size)
    if op is not None:
        out["status"] = set_status(i + 1, op=op)
    return out


def fastener_from_brush(brush, unify=True):
    """A kitbash part without a drag: duplicate the active level-free SubTool, select an
    InsertMesh or IMM brush (zb_ops.select_brush), then Tool > Geometry > Modify Topology >
    MeshFromBrush replaces the copy with the brush's current mesh (Chervenka PGX39tnEf3Y
    00:21:24; label and bubble help "Create Mesh From Brush" [strings]; which mesh of a
    multi-mesh IMM it takes is [verify]). Unify fixes the size of a swapped part (Pavlovich
    QGNn1-ey6ME 00:17:56). Then place(), array_mesh(rotate=[0, 0, 360]) for a radial set, and
    array_commit("nano") for NanoMesh with ZRVar rotation variation."""
    z = _z()
    zb_ops.ensure_edit()
    if _levels() > 1:
        raise ZBOpError("the active SubTool has levels: select a level-free SubTool first")
    i = int(z.get_active_subtool_index())
    n0 = int(z.get_subtool_count())
    zb_ops.press("duplicate")
    z.update(redraw_ui=True)
    if int(z.get_subtool_count()) != n0 + 1:
        raise ZBOpError("Duplicate did not add a SubTool")
    z.select_subtool(i + 1)
    f0 = _faces()
    sel = zb_ops.select_brush(brush)
    _press("mesh_from_brush", check_enabled=False)
    if unify:
        _press("unify", check_enabled=False)
    f1 = _faces()
    return {"index": i + 1, "brush": sel, "faces_before": f0, "faces_after": f1,
            "ok": f1 != f0, "bbox": _bbox(1)}


def imm_ready():
    """IMM and NanoMesh-brush insertion is refused on a SubTool with subdivision levels
    (Pavlovich QGNn1-ey6ME 00:14:07). His fix: a hidden, level-free placeholder PolyMesh3D kept
    at the top of the list, scaled inside the model, selected while inserting (00:15:12); or
    Delete Lower, insert, Split Masked Points, Reconstruct. Call before any IMM stroke or
    NanoMesh click."""
    lv = _levels()
    out = {"levels": lv, "ok": lv <= 1, "subtool": int(_z().get_active_subtool_index())}
    if lv > 1:
        out["advice"] = ("select a level-free placeholder SubTool (new_part from a level-free "
                         "part, hidden, at the top) before inserting; then Split Unmasked Points "
                         "moves the insert to its own SubTool")
    return out


def mask_fillet(passes=2):
    """Klimer's mask cleanup (08crkU999Fs 00:46:21 to 00:47:32): blur, invert, blur, invert,
    repeated, removes stray bits and gives every corner of a mask the same fillet radius before
    a Deformation Inflate, an extract or Group Masked. One pass = four presses; the mask ends in
    its original orientation. Mask data cannot be read back (lead: no API), so judge the
    result on a snapshot."""
    pressed = []
    for _ in range(int(passes)):
        for op in ("blur", "invert", "blur", "invert"):
            pressed.append(zb_ops.mask(op))
    return {"passes": int(passes), "pressed": pressed}


def canvas_action(x, y, method="click", drag=(0.0, -40.0), expect_delta=None):
    """One canvas input on the active SubTool, with the face count before and after as the
    evidence: a ZModeler action from a saved brush or preset, a NanoMesh insert on a group
    face, or an insert on a front-facing placement plane (the shipped Create Instance Subtool
    macro clicks the plane's centre with ZScript IClick 1004). Methods: "click" is
    zbc.canvas_click; "dab" a one-point synthesized stroke (zb_stroke.dab); "drag" a short
    synthesized stroke from (x, y) by `drag` pixels, the proven canvas input. ZModeler needs a
    drag the first time (Inset amount, QMesh height); a tap replays the last action at the same
    value (gui-paths). Whether any of these fires a ZModeler action is [verify] (live_hs_07):
    the README found canvas_click drags in Edit mode did not sculpt. x, y from click_target."""
    zb_stroke = zb_ops.zb_stroke     # the prelude pops zb_* modules; use zb_ops' reference
    z = _z()
    zb_ops.ensure_edit()
    f0 = _faces()
    if method == "click":
        z.canvas_click(float(x), float(y))
    elif method == "dab":
        z.canvas_stroke(z.Stroke(zb_stroke.encode(zb_stroke.dab((x, y)))))
    elif method == "drag":
        pts = zb_stroke.line((float(x), float(y)), (float(x) + drag[0], float(y) + drag[1]))
        z.canvas_stroke(z.Stroke(zb_stroke.encode(pts)))
    else:
        raise ValueError("method must be click, dab or drag")
    z.update(redraw_ui=True)
    f1 = _faces()
    delta = f1 - f0
    ok = (delta == int(expect_delta)) if expect_delta is not None else delta != 0
    return {"method": method, "xy": [float(x), float(y)], "faces_before": f0,
            "faces_after": f1, "delta": delta, "ok": ok}


def split_copy(mode="groups"):
    """Count panels or shells without touching the working SubTool: duplicate, then Groups Split
    or Split To Parts on the copy (tools digest P6 gate; debris check 8LNjAkqr_lI 00:10:46).
    Deleting SubTools asks for confirmation, so the pieces stay: hide them with set_status."""
    z = _z()
    zb_ops.ensure_edit()
    i = int(z.get_active_subtool_index())
    n0 = int(z.get_subtool_count())
    zb_ops.press("duplicate")
    z.update(redraw_ui=True)
    z.select_subtool(i + 1)
    _press("split_groups" if mode == "groups" else "split_parts")
    n1 = int(z.get_subtool_count())
    pieces = []
    for k in range(i + 1, i + 1 + (n1 - n0)):
        if z.select_subtool(k) == 0:
            pieces.append({"index": k, "faces": _faces()})
    z.select_subtool(i)
    return {"mode": mode, "pieces": pieces, "count": len(pieces)}


ZR_RECIPES = {
    "cut_base": ({"mode": "half", "detect_edges": True, "adaptive_size": 0},
                 "before Knife work: even quads, crisp corners (Pavlovich 8LNjAkqr_lI 00:04:36)"),
    "after_boolean": ({"mode": "half", "detect_edges": True},
                      "UMesh cleanup, repeat Half while quality holds (HXnKnrhlFpA 00:03:31)"),
    "after_cuts": ({"mode": "half", "detect_edges": False, "keep_groups": True,
                    "smooth_groups": 0},
                   "knife or slice cuts with clean groups (8LNjAkqr_lI 00:10:14)"),
    "part": ({"keep_groups": True, "smooth_groups": 0, "adaptive_size": 25},
             "hard-surface part with Groups By Normals (Chervenka PGX39tnEf3Y 00:37:12)"),
    "same": ({"mode": "same", "keep_groups": True, "smooth_groups": 0},
             "UMesh part at the same density (Pavlovich QbEHsPGNnlY 00:00:33)"),
    "panel_base": ({"adaptive": False},
                   "lowest target, Adapt off, about 3 stars accepted (Plouffe u75skb32GTo 02:04:02)"),
    "nav_cage": ({},
                 "quick commit cage, target 0.3, then Divide 2 + Project All (Plouffe 00:46:46)"),
}


def zremesh_recipe(recipe, target_k=None):
    """ZRemesher with an expert recipe (ZR_RECIPES) on top of zb_ops.zremesher. For Half, Same
    and Double the target is derived from the current count so the read-back matches."""
    if recipe not in ZR_RECIPES:
        raise ValueError(f"recipe must be one of {sorted(ZR_RECIPES)}")
    kw = dict(ZR_RECIPES[recipe][0])
    sg = kw.pop("smooth_groups", None)
    if sg is not None:
        _set("zr_smooth_groups", sg)
    f = _faces()
    mode = kw.get("mode")
    if target_k is None:
        target_k = {"half": f / 2000.0, "same": f / 1000.0, "double": f / 500.0}.get(
            mode, 0.3 if recipe == "nav_cage" else 0.1 if recipe == "panel_base" else f / 2000.0)
    res = zb_ops.zremesher(round(target_k, 3), **kw)
    res["recipe"] = recipe
    res["source"] = ZR_RECIPES[recipe][1]
    return res


def dynamesh_visible(resolution, skip_indices=(), blur=0, project=False):
    """Pavlovich's quick game shell without ZRepeat It (not shipped in 2026.2.1): DynaMesh
    every visible SubTool at one tested resolution, Project off, Blur 0 (VfUqkvHymeQ
    00:00:32 to 00:02:06). Skip animated parts. SubTools with levels are reported, not touched."""
    z = _z()
    active = int(z.get_active_subtool_index())
    out = []
    missing = [k for k, v in (("dyn_blur", blur), ("dyn_project", project))
               if v is not None and zb_ops.resolve(k, required=False) is None]
    if "dyn_blur" in missing:
        blur = None
    if "dyn_project" in missing:
        project = None
    try:
        for s in zb_ops.subtools():
            i = s["index"]
            if not s["visible"] or i in set(skip_indices):
                continue
            z.select_subtool(i)
            if _levels() > 1:
                out.append({"index": i, "skipped": "levels"})
                continue
            r = zb_ops.dynamesh(resolution, blur=blur, project=project)
            r["index"] = i
            r["solid"] = bool(z.is_polymesh3d_solid())
            out.append(r)
    finally:
        z.select_subtool(active)
    return {"resolution": resolution, "subtools": out, "unset_paths": missing,
            "total_faces": sum(r.get("faces_after") or 0 for r in out)}


def set_polyframe(on=True):
    return zb_ops.set_checked([resolve_hs("polyframe")], 1 if on else 0, tol=0.5)


def normal_variance(x0, y0, x1, y1, step=8):
    """pixol_pick normals (components 6, 7, 8) on a grid over a canvas rectangle, framed on ONE
    plane in an orthographic view: a low p95 angle means a flat plane (Plouffe's metal MatCap
    test as numbers) [added][verify that pixol normals are valid after update()]."""
    z = _z()
    z.update(redraw_ui=True)
    ns = []
    y = float(y0)
    while y <= y1:
        x = float(x0)
        while x <= x1:
            ns.append((z.pixol_pick(6, x, y), z.pixol_pick(7, x, y), z.pixol_pick(8, x, y)))
            x += step
        y += step
    return normal_stats(ns)


def curve_mesh(points, name="hs_curve", thickness=0.0, action=1):
    """Script curves in tool coordinates (SDK: new_curves, add_new_curve, add_curve_point,
    curves_to_ui), then create_mesh_from_curves(name, action, thickness): action 1 adds a new
    SubTool (SDK stub). Candidate route for a seam cutter along a polygroup border computed from
    an OBJ (border_polylines) [verify what mesh it builds]. Maxon's lightning example notes that
    a curve brush only applies once a curve is touched, so the brush route needs a click."""
    z = _z()
    z.new_curves()
    cid = z.add_new_curve()
    if cid < 0:
        raise ZBOpError("add_new_curve failed")
    ok = [z.add_curve_point(cid, float(p[0]), float(p[1]), float(p[2])) for p in points]
    z.curves_to_ui()
    n0 = int(z.get_subtool_count())
    pts = z.create_mesh_from_curves(name, action, float(thickness))
    return {"curve": cid, "points_added": sum(1 for k in ok if k >= 0),
            "mesh_points": pts, "subtools_before": n0, "subtools_after": int(z.get_subtool_count())}


# --------------------------------------------------------------------------------------------
# Agent side: calling into ZBrush
# --------------------------------------------------------------------------------------------

_PRELUDE = """\
_hs_dirs = [{lead!r}, {here!r}]
_hs_before = set(_zb_sys.modules)
for _hs_d in _hs_dirs:
    _zb_sys.path.insert(0, _hs_d)
try:
    zb_ops = _zb_il.import_module('zb_ops')
    zb_stroke = _zb_il.import_module('zb_stroke')
    zb_hardsurface = _zb_il.import_module('zb_hardsurface')
finally:
    for _hs_d in _hs_dirs:
        while _hs_d in _zb_sys.path:
            _zb_sys.path.remove(_hs_d)
    for _hs_k in set(_zb_sys.modules) - _hs_before:
        if _hs_k.startswith('zb_'):
            _zb_sys.modules.pop(_hs_k, None)
"""


def build_code(code):
    """Source for zb_launch.run(code, modules=()): imports zb_ops, zb_stroke and zb_hardsurface
    by path and leaves neither sys.path nor sys.modules changed (Maxon shared-interpreter rule,
    same hygiene as zb_launch's prelude, which defines _zb_sys, _zb_json and _zb_il)."""
    return _PRELUDE.format(lead=LEAD_SCRIPTS, here=HERE) + code


def build_call(func, args=(), kwargs=None):
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", func):
        raise ValueError(f"bad function name {func!r}")
    code = (f"result = zb_hardsurface.{func}(*_zb_json.loads({json.dumps(list(args))!r}), "
            f"**_zb_json.loads({json.dumps(kwargs or {})!r}))")
    return build_code(code)


def _launch():
    if LEAD_SCRIPTS not in sys.path:
        sys.path.insert(0, LEAD_SCRIPTS)
    import zb_launch
    return zb_launch


def hs_call(func, *args, port=7788, timeout=120, **kwargs):
    """zb_hardsurface.func(*args, **kwargs) on ZBrush's main thread; JSON-able args only.
    After a ZBTimeout do not send more code: a modal note is likely (coplanar Boolean, Mirror
    And Weld floor, n-gon import). Run zb_launch.diagnose() and answer it from outside."""
    return _launch().run(build_call(func, args, kwargs), (), port, timeout)


def hs_run(code, port=7788, timeout=120):
    """Any code with zbc, zb_ops, zb_stroke and zb_hardsurface in scope; assign `result`."""
    return _launch().run(build_code(code), (), port, timeout)


METAL_MATCAP = "MatCap Metal01"   # ZData/Materials/MatCap/MatCap Metal01.ZMT ships [verify label]
PLANE_VIEWS = ("front", "right", "top", "back", (0.0, 30.0, 0.0), (0.0, -30.0, 0.0))


def review_sheets(out_dir, form_views=None, plane_views=PLANE_VIEWS, metal=METAL_MATCAP,
                  polyframe=False, port=7788, timeout=300):
    """Two zb_review sheets: forms under MatCap Gray (lead default) and planes under a metal
    MatCap with square-on and grazing views (Plouffe's plane test, u75skb32GTo 00:57:56;
    Pavlovich judges edges under a green metallic, 8LNjAkqr_lI 00:13:19). polyframe=True adds a
    PolyFrame sheet for polygroups and dotted crease lines."""
    if LEAD_SCRIPTS not in sys.path:
        sys.path.insert(0, LEAD_SCRIPTS)
    import zb_review
    out_dir = os.path.abspath(out_dir)
    res = {"forms": zb_review.review(os.path.join(out_dir, "forms"),
                                     views=form_views or zb_review.DEFAULT_VIEWS, port=port,
                                     timeout=timeout, title="forms | MatCap Gray")}
    res["planes"] = zb_review.review(os.path.join(out_dir, "planes"), views=list(plane_views),
                                     matcap=metal, port=port, timeout=timeout,
                                     title=f"planes | {metal}")
    if polyframe:
        hs_call("set_polyframe", True, port=port)
        try:
            res["polyframe"] = zb_review.review(os.path.join(out_dir, "polyframe"),
                                                views=["front", "right", "top"], port=port,
                                                timeout=timeout, title="PolyFrame")
        finally:
            hs_call("set_polyframe", False, port=port)
    return res


# --------------------------------------------------------------------------------------------
# Agent side: mesh checks on OBJ exports (numpy, zb_audit's loader)
# --------------------------------------------------------------------------------------------

def _audit():
    if LEAD_SCRIPTS not in sys.path:
        sys.path.insert(0, LEAD_SCRIPTS)
    import zb_audit
    return zb_audit


def load_groups(path):
    """Face -> group index from the 'g' lines of an OBJ in face order. ZBrush writes one
    'g Group<id>' per polygroup (v03 export: 'g Group10389'; several groups [verify])."""
    names, ids, cur = [], [], -1
    index = {}
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("g "):
                nm = line[2:].strip()
                if nm not in index:
                    index[nm] = len(names)
                    names.append(nm)
                cur = index[nm]
            elif line.startswith("f "):
                ids.append(cur)
    return {"names": names, "face_group": ids}


def _face_normals(mesh):
    import numpy as np
    za = _audit()
    a, b = za._edges(mesh)
    v = mesh.verts
    face_of_corner = np.repeat(np.arange(len(mesh.sizes)), mesh.sizes)
    cr = np.cross(v[a], v[b])                           # Newell's method
    n = np.zeros((len(mesh.sizes), 3))
    np.add.at(n, face_of_corner, cr)
    ln = np.linalg.norm(n, axis=1)
    area = 0.5 * ln
    n = n / np.where(ln > 0, ln, 1.0)[:, None]
    cen = np.zeros((len(mesh.sizes), 3))
    np.add.at(cen, face_of_corner, v[mesh.flat])
    cen /= np.maximum(mesh.sizes, 1)[:, None]
    return n, area, cen, face_of_corner


def _edge_faces(mesh):
    """Undirected edges with their two faces (manifold interior edges only) and boundary edges."""
    import numpy as np
    za = _audit()
    a, b = za._edges(mesh)
    nv = max(len(mesh.verts), 1)
    f = np.repeat(np.arange(len(mesh.sizes)), mesh.sizes)
    key = np.minimum(a, b) * nv + np.maximum(a, b)
    order = np.argsort(key, kind="stable")
    k, fo = key[order], f[order]
    uk, start, cnt = np.unique(k, return_index=True, return_counts=True)
    two = cnt == 2
    pairs = np.stack([fo[start[two]], fo[start[two] + 1]], axis=1)
    return {"keys": uk[two], "faces": pairs, "boundary": uk[cnt == 1], "nv": nv}


def _chains(edges):
    """Split an undirected edge list [(u, v)] into polylines of vertex ids, breaking at
    vertices whose degree is not 2 (corners, T junctions)."""
    adj = {}
    for u, v in edges:
        adj.setdefault(u, []).append(v)
        adj.setdefault(v, []).append(u)
    used, chains = set(), []

    def walk(s, n):
        path = [s, n]
        used.add((min(s, n), max(s, n)))
        prev, cur = s, n
        while len(adj[cur]) == 2:
            nxt = adj[cur][0] if adj[cur][0] != prev else adj[cur][1]
            e = (min(cur, nxt), max(cur, nxt))
            if e in used:
                break
            used.add(e)
            path.append(nxt)
            prev, cur = cur, nxt
        return path

    for s in adj:
        if len(adj[s]) != 2:
            for n in adj[s]:
                if (min(s, n), max(s, n)) not in used:
                    chains.append(walk(s, n))
    for s in adj:                                       # closed loops
        for n in adj[s]:
            if (min(s, n), max(s, n)) not in used:
                chains.append(walk(s, n))
    return chains


def _fit_line_arc(p):
    """(line_rms, arc_rms, radius, sagitta, length) for a polyline p (N, 3)."""
    import numpy as np
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    length = float(seg.sum())
    c = p.mean(axis=0)
    u, s, vt = np.linalg.svd(p - c, full_matrices=False)
    d = vt[0]
    off = (p - c) - np.outer((p - c) @ d, d)
    line_rms = float(np.sqrt((off ** 2).sum(axis=1).mean()))
    chord = p[-1] - p[0]
    cl = np.linalg.norm(chord)
    if cl > 1e-12:
        cu = chord / cl
        rel = p - p[0]
        sag = float(np.linalg.norm(rel - np.outer(rel @ cu, cu), axis=1).max())
    else:                                               # closed loop
        sag = float(np.linalg.norm(p - c, axis=1).max())
    e1, e2 = vt[0], vt[1]
    q = np.stack([(p - c) @ e1, (p - c) @ e2], axis=1)
    A = np.column_stack([q[:, 0], q[:, 1], np.ones(len(q))])
    rhs = (q ** 2).sum(axis=1)
    try:
        sol, *_ = np.linalg.lstsq(A, rhs, rcond=None)
        cx, cy = sol[0] / 2, sol[1] / 2
        r = float(np.sqrt(max(sol[2] + cx * cx + cy * cy, 0.0)))
        rad = np.linalg.norm(q - np.array([cx, cy]), axis=1)
        planar = float(np.sqrt((((p - c) @ vt[2]) ** 2).mean())) if len(vt) > 2 else 0.0
        arc_rms = float(np.sqrt(((rad - r) ** 2).mean() + planar ** 2))
    except np.linalg.LinAlgError:
        r, arc_rms = float("inf"), float("inf")
    return line_rms, arc_rms, r, sag, length


def classify_polyline(p, noise=0.0, line_tol=0.003, arc_tol=0.003, readable_sagitta=0.015):
    """Plouffe's rule in numbers: 'straight' or 'arc', never in between (u75skb32GTo 00:52:55).
    straight: line residual <= line_tol x length; arc: circle residual <= arc_tol x length AND
    sagitta >= readable_sagitta x chord (a curve that reads as a curve); otherwise 'ambiguous'.
    noise (absolute) absorbs the mesh's own jitter. All thresholds [added]."""
    import numpy as np
    p = np.asarray(p, dtype=float)
    lr, ar, r, sag, length = _fit_line_arc(p)
    if length <= 0:
        return {"class": "degenerate"}
    chord = float(np.linalg.norm(p[-1] - p[0])) or length
    tl, ta = max(line_tol * length, noise), max(arc_tol * length, noise)
    sag_rel = sag / chord
    if lr <= tl and sag <= max(readable_sagitta * chord * 0.2, noise):
        cls = "straight"
    elif ar <= ta and sag_rel >= readable_sagitta:
        cls = "arc"
    else:
        cls = "ambiguous"
    return {"class": cls, "length": round(length, 6), "line_rms_rel": round(lr / length, 6),
            "arc_rms_rel": round(ar / length, 6), "radius": round(r, 6),
            "sagitta_rel": round(sag_rel, 6), "points": int(len(p))}


def _kink_deg(p, k):
    import numpy as np
    a, b = p[k] - p[0], p[-1] - p[k]
    la, lb = np.linalg.norm(a), np.linalg.norm(b)
    if la <= 0 or lb <= 0:
        return 0.0
    return math.degrees(math.acos(max(-1.0, min(1.0, float(a @ b) / (la * lb)))))


def classify_chain(p, noise=0.0, split_compound=True, min_edges=3, corner_deg=10.0,
                   **thresholds):
    """classify_polyline, plus one split attempt for an ambiguous chain: when both halves are
    clean the chain is 'compound' (a line flowing into an arc, or two lines meeting at a clear
    corner of at least corner_deg). Two nearly aligned straights stay ambiguous: a 'straight'
    edge with a slight break is exactly what Plouffe rejects [added threshold]."""
    import numpy as np
    p = np.asarray(p, dtype=float)
    rec = classify_polyline(p, noise=noise, **thresholds)
    n = len(p)
    if rec["class"] == "ambiguous" and split_compound and n >= 2 * min_edges + 1:
        best = None
        for k in range(min_edges, n - min_edges):
            a_ = classify_polyline(p[:k + 1], noise=noise, **thresholds)
            b_ = classify_polyline(p[k:], noise=noise, **thresholds)
            if a_["class"] == b_["class"] == "straight" and _kink_deg(p, k) < corner_deg:
                continue
            if a_["class"] in ("straight", "arc") and b_["class"] in ("straight", "arc"):
                score = a_["line_rms_rel"] + b_["line_rms_rel"] + a_["arc_rms_rel"] + \
                    b_["arc_rms_rel"]
                if best is None or score < best[0]:
                    best = (score, k, a_["class"], b_["class"])
        if best:
            rec = dict(rec, **{"class": "compound", "split_at": best[1],
                               "parts": [best[2], best[3]]})
    return rec


def edge_language(mesh, angle_deg=30.0, source="dihedral", min_edges=3, noise_rel=0.05,
                  split_compound=True, **thresholds):
    """Classify the designed lines of a mesh (OBJ path or zb_audit.Mesh): feature edges from
    dihedral angles above angle_deg (source="dihedral") or polygroup borders (source="groups",
    needs an OBJ path). Chains break at corners. An ambiguous chain is split once at its best
    point; two clean halves make it 'compound' (a line flowing into an arc). Run it on the cage
    or the Make Boolean Mesh result, not on a soft-bevelled high poly. noise_rel x the median
    feature-edge length absorbs mesh jitter; raise it (0.25) on DynaMesh input [added]."""
    import numpy as np
    za = _audit()
    m = za._as_mesh(mesh)
    ef = _edge_faces(m)
    nv = ef["nv"]
    if source == "dihedral":
        n, _, _, _ = _face_normals(m)
        cosang = (n[ef["faces"][:, 0]] * n[ef["faces"][:, 1]]).sum(axis=1)
        sel = ef["keys"][cosang < math.cos(math.radians(angle_deg))]
    elif source == "groups":
        if not isinstance(mesh, str):
            raise ValueError("source='groups' needs an OBJ path")
        fg = np.asarray(load_groups(mesh)["face_group"])
        sel = ef["keys"][fg[ef["faces"][:, 0]] != fg[ef["faces"][:, 1]]]
    else:
        raise ValueError("source must be dihedral or groups")
    edges = [(int(k // nv), int(k % nv)) for k in sel]
    chains = [c for c in _chains(edges) if len(c) - 1 >= min_edges]
    el = [np.linalg.norm(m.verts[u] - m.verts[v]) for u, v in edges] or [0.0]
    noise = noise_rel * float(np.median(el))
    lines = []
    for c in chains:
        rec = classify_chain(m.verts[np.asarray(c)], noise, split_compound, min_edges,
                             **thresholds)
        rec["vertices"] = [int(c[0]), int(c[-1])]
        lines.append(rec)
    counts = {}
    for r in lines:
        counts[r["class"]] = counts.get(r["class"], 0) + 1
    return {"source": source, "angle_deg": angle_deg, "feature_edges": len(edges),
            "lines": lines, "counts": counts,
            "ambiguous": [r for r in lines if r["class"] == "ambiguous"]}


def plane_flatness(obj_path, flat_spread_deg=12.0, flat_rel=0.002):
    """Per polygroup: normal spread and plane-fit RMS relative to the group size. A group whose
    normals all agree within flat_spread_deg is meant to be flat; its RMS above flat_rel x size
    is a wobbly plane (Plouffe's diagonal, dipping highlight, u75skb32GTo 00:59:02) [added]."""
    import numpy as np
    za = _audit()
    m = za.load_obj(obj_path)
    fg = np.asarray(load_groups(obj_path)["face_group"])
    n, area, _, foc = _face_normals(m)
    out = []
    for g in np.unique(fg):
        faces = np.nonzero(fg == g)[0]
        w = area[faces]
        mn = (n[faces] * w[:, None]).sum(axis=0)
        mn /= (np.linalg.norm(mn) or 1.0)
        spread = float(np.degrees(np.arccos(np.clip(n[faces] @ mn, -1, 1))).max())
        vids = np.unique(m.flat[np.isin(foc, faces)])
        pts = m.verts[vids]
        size = float(np.linalg.norm(pts.max(axis=0) - pts.min(axis=0))) or 1.0
        rms = float(np.sqrt((((pts - pts.mean(axis=0)) @ mn) ** 2).mean()))
        intended = spread <= flat_spread_deg
        out.append({"group": int(g), "faces": int(len(faces)), "normal_spread_deg": round(spread, 3),
                    "flat_rms_rel": round(rms / size, 6), "meant_flat": intended,
                    "wobbly": bool(intended and rms / size > flat_rel)})
    return {"groups": out, "wobbly": [g for g in out if g["wobbly"]]}


def coplanar_report(obj_a, obj_b, ang_tol_deg=0.5, dist_tol_rel=1e-4):
    """Faces of B lying in a plane of A with overlapping extent: the 'avoid coplanar faces' rule
    of Live Boolean (LB doc Important Information). Make Boolean Mesh raises a blocking Yes/No
    note when it finds them, so check exports of body and cutter before pressing it. Tolerances
    relative to the combined bbox diagonal are [added]."""
    import numpy as np
    za = _audit()
    A, B = za._as_mesh(obj_a), za._as_mesh(obj_b)
    na, aa, ca, foc_a = _face_normals(A)
    nb, ab, cb, _ = _face_normals(B)
    allv = np.vstack([A.verts, B.verts])
    diag = float(np.linalg.norm(allv.max(axis=0) - allv.min(axis=0))) or 1.0
    dtol = dist_tol_rel * diag
    cos_t = math.cos(math.radians(ang_tol_deg))

    def planes(n, c, area):
        s = np.sign(n[np.arange(len(n)), np.argmax(np.abs(n), axis=1)])
        nn = n * s[:, None]
        d = (nn * c).sum(axis=1)
        key = np.round(np.column_stack([nn * 1000.0, d / max(dtol, 1e-12) / 10.0])).astype(np.int64)
        return nn, d, key

    nnb, db, kb = planes(nb, cb, ab)
    ub, inv = np.unique(kb, axis=0, return_inverse=True)
    hits = []
    for gi in range(len(ub)):
        fb = np.nonzero(inv.ravel() == gi)[0]
        if ab[fb].sum() <= 0:
            continue
        pn = nnb[fb[0]]
        pd = float(np.average(db[fb], weights=np.maximum(ab[fb], 1e-18)))
        align = np.abs(na @ pn) >= cos_t            # either facing: same plane
        dist = np.abs(ca @ pn - pd)
        near = np.nonzero(align & (dist <= dtol))[0]
        if not len(near):
            continue
        e1 = np.cross(pn, [1.0, 0, 0] if abs(pn[0]) < 0.9 else [0, 1.0, 0])
        e1 /= np.linalg.norm(e1)
        e2 = np.cross(pn, e1)
        bv = np.unique(B.flat[np.isin(np.repeat(np.arange(len(B.sizes)), B.sizes), fb)])
        bq = np.column_stack([B.verts[bv] @ e1, B.verts[bv] @ e2])
        lo, hi = bq.min(axis=0), bq.max(axis=0)
        # in-plane extent of each near A face (its corners are contiguous in face order)
        starts = np.concatenate([[0], np.cumsum(A.sizes[near])[:-1]])
        pc = A.verts[A.flat[np.isin(foc_a, near)]]
        u, w = pc @ e1, pc @ e2
        ou = np.minimum(np.maximum.reduceat(u, starts), hi[0]) - \
            np.maximum(np.minimum.reduceat(u, starts), lo[0])
        ow = np.minimum(np.maximum.reduceat(w, starts), hi[1]) - \
            np.maximum(np.minimum.reduceat(w, starts), lo[1])
        overlap = (ou > dtol) & (ow > dtol)                  # touching along an edge is fine
        if overlap.any():
            hits.append({"plane_normal": pn.round(5).tolist(), "plane_d": round(pd, 6),
                         "b_faces": int(len(fb)), "a_faces": int(overlap.sum()),
                         "overlap_area_bbox": round(float((ou * ow)[overlap].sum()), 6)})
    return {"coplanar": hits, "ok": not hits, "dist_tol": dtol, "ang_tol_deg": ang_tol_deg,
            "note": "in-plane overlap is tested on face bounding boxes, a conservative proxy"}


def border_polylines(obj_path, min_edges=2):
    """Polygroup border polylines in OBJ (tool) coordinates, the input for curve_mesh seam
    cutters (Pavlovich builds seams along framed polygroup borders, FM3uQJy1GUY 00:03:10)."""
    import numpy as np
    za = _audit()
    m = za.load_obj(obj_path)
    fg = np.asarray(load_groups(obj_path)["face_group"])
    ef = _edge_faces(m)
    nv = ef["nv"]
    sel = ef["keys"][fg[ef["faces"][:, 0]] != fg[ef["faces"][:, 1]]]
    chains = [c for c in _chains([(int(k // nv), int(k % nv)) for k in sel])
              if len(c) - 1 >= min_edges]
    return [m.verts[np.asarray(c)].round(6).tolist() for c in chains]


# --------------------------------------------------------------------------------------------
# Agent side: mirror, hygiene, pinch and click-target checks on OBJ exports (numpy)
# --------------------------------------------------------------------------------------------

def _near_mask(P, Q, tol):
    """For each row of P: does Q hold a point within tol (grid hash over 27 cells, exact)."""
    import itertools
    import numpy as np
    P, Q = np.asarray(P, dtype=float), np.asarray(Q, dtype=float)
    if len(P) == 0:
        return np.zeros(0, dtype=bool)
    if len(Q) == 0:
        return np.zeros(len(P), dtype=bool)
    tol = max(float(tol), 1e-12)
    lo = np.minimum(P.min(axis=0), Q.min(axis=0))
    qc = np.floor((Q - lo) / tol).astype(np.int64) + 1
    pc = np.floor((P - lo) / tol).astype(np.int64) + 1
    dims = np.maximum(qc.max(axis=0), pc.max(axis=0)) + 2
    stride = np.array([dims[1] * dims[2], dims[2], 1], dtype=np.int64)
    order = np.argsort(qc @ stride, kind="stable")
    sk = (qc @ stride)[order]
    found = np.zeros(len(P), dtype=bool)
    for off in itertools.product((-1, 0, 1), repeat=3):
        k = (pc + np.array(off)) @ stride
        a, b = np.searchsorted(sk, k, "left"), np.searchsorted(sk, k, "right")
        cnt = b - a
        for j in range(int(cnt.max()) if len(cnt) else 0):
            sel = np.nonzero((cnt > j) & ~found)[0]
            if not len(sel):
                break
            d = np.linalg.norm(Q[order[a[sel] + j]] - P[sel], axis=1)
            found[sel[d <= tol]] = True
    return found


def _mirror_setup(mesh, axis, center, tol_rel):
    import numpy as np
    za = _audit()
    m = za._as_mesh(mesh)
    v = m.verts
    k = "xyz".index(axis)
    diag = float(np.linalg.norm(v.max(axis=0) - v.min(axis=0))) or 1.0
    c = float((v[:, k].min() + v[:, k].max()) / 2) if center == "bbox" else float(center)
    return m, v, k, c, max(tol_rel * diag, 1e-9)


def mirror_report(mesh, axis="x", center=0.0, tol_rel=1e-4):
    """Which half holds the edit, before Mirror And Weld. A vertex is unmatched when no vertex
    sits at its mirror position across axis = center (ZBrush mirrors across the tool's local
    0 [added]; pass "bbox" for the bbox centre). suggest is a hint only [added]: the side with
    all or most unmatched vertices; a removed feature leaves unmatched vertices on both sides,
    so decide from where you cut when suggest is None."""
    m, v, k, c, tol = _mirror_setup(mesh, axis, center, tol_rel)
    mir = v.copy()
    mir[:, k] = 2 * c - mir[:, k]
    found = _near_mask(mir, v, tol)
    neg, pos = v[:, k] < c - tol, v[:, k] > c + tol
    un_neg, un_pos = int((neg & ~found).sum()), int((pos & ~found).sum())
    _, _, cen, _ = _face_normals(m)
    if un_neg == 0 and un_pos == 0:
        suggest = None
    elif un_neg == 0 or un_pos >= 3 * un_neg:
        suggest = "pos"
    elif un_pos == 0 or un_neg >= 3 * un_pos:
        suggest = "neg"
    else:
        suggest = None
    return {"axis": axis, "center": c, "tol": tol, "unmatched_neg": un_neg,
            "unmatched_pos": un_pos, "faces_neg": int((cen[:, k] < c - tol).sum()),
            "faces_pos": int((cen[:, k] > c + tol).sum()),
            "symmetric": un_neg == 0 and un_pos == 0, "suggest": suggest}


def mirror_check(before, after, keep, axis="x", center=0.0, tol_rel=1e-4):
    """After mirror_weld: the kept half must survive and the result must be symmetric. before
    and after are OBJ exports (or meshes) of the same SubTool. preserved = share of the kept
    half's vertices (before) found again in the result; a wrong direction overwrites the edit
    and drops it below 1 (Pavlovich 8LNjAkqr_lI 00:06:49) [thresholds added]."""
    if keep not in ("neg", "pos"):
        raise ValueError("keep must be neg or pos")
    mb, vb, k, c, tol = _mirror_setup(before, axis, center, tol_rel)
    ma, va, _, _, _ = _mirror_setup(after, axis, c, tol_rel)
    side = vb[:, k] > c + tol if keep == "pos" else vb[:, k] < c - tol
    kept = vb[side]
    preserved = float(_near_mask(kept, va, tol).mean()) if len(kept) else 1.0
    mir = va.copy()
    mir[:, k] = 2 * c - mir[:, k]
    sym = float(_near_mask(mir, va, tol).mean()) if len(va) else 1.0
    return {"keep": keep, "kept_vertices": int(len(kept)), "preserved": round(preserved, 6),
            "symmetry": round(sym, 6), "ok": preserved >= 0.999 and sym >= 0.999}


def hygiene(mesh, min_frac=0.005):
    """Mesh hygiene after cuts, booleans, Panel Loops or imports, before ZRemesher: floating
    debris makes ZRemesher fail (Pavlovich 8LNjAkqr_lI 00:10:46 to 00:11:58), and Check Mesh
    after heavy topology operations is the documented integrity gate (Tool > Geometry >
    MeshIntegrity). Check Mesh Integrity answers with a note ("Mesh integrity test completed
    successfully" or "failed ... Fix Mesh", UI strings), likely modal for the bridge [verify],
    so this measures the same things on an OBJ export: shells, debris shells under
    min_frac of the largest (by faces) [added threshold], non-manifold edges, zero-area faces,
    flipped winding, loose vertices."""
    import numpy as np
    za = _audit()
    m = za._as_mesh(mesh)
    rep = za.audit(m)
    a, b = za._edges(m)
    lab = za._shells(len(m.verts), a, b)
    fs = lab[m.flat[m.starts]]
    ids, counts = np.unique(fs, return_counts=True)
    order = np.argsort(-counts)
    big = int(counts.max()) if len(counts) else 0
    debris = [{"shell": int(ids[i]), "faces": int(counts[i])} for i in order
              if counts[i] < min_frac * big]
    problems, warnings = [], []
    if debris:
        problems.append(f"{len(debris)} debris shell(s) under {min_frac:g} of the largest: hide "
                        "them and Del Hidden (or split_copy('parts')) before ZRemesher")
    if rep["non_manifold_edges"]:
        problems.append(f"{rep['non_manifold_edges']} non-manifold edges: Fix Mesh "
                        "(scenario-zbrush-retopology-export fix_mesh), then re-export")
    if rep["zero_area_faces"]:
        problems.append(f"{rep['zero_area_faces']} zero-area faces")
    if rep["inconsistent_edges"]:
        warnings.append(f"{rep['inconsistent_edges']} edges with flipped winding")
    if rep["loose_verts"]:
        warnings.append(f"{rep['loose_verts']} loose vertices")
    return {"shells": int(len(ids)), "shell_faces": [int(counts[i]) for i in order[:20]],
            "debris": debris, "non_manifold_edges": rep["non_manifold_edges"],
            "boundary_loops": len(rep["boundary_loops"]), "problems": problems,
            "warnings": warnings, "ok": not problems}


def pinch_report(obj_path, max_stars=3, flat_spread_deg=12.0):
    """Star vertices (valence not 4) inside a polygroup, away from its borders: after the bake
    they pop as dimples under metal (Plouffe u75skb32GTo 02:25:59 to 02:28:48). Plouffe accepts
    about three stars on a ZRemeshed panel base (02:04:02 to 02:05:09); groups above max_stars
    are flagged. Inspect every listed star at a low level with dark polypaint and a low-metal
    MatCap; fix on the cage (regroup, re-ZRemesher and project), not on the high."""
    import numpy as np
    za = _audit()
    m = za.load_obj(obj_path)
    fg = np.asarray(load_groups(obj_path)["face_group"])
    if len(fg) != len(m.sizes):
        fg = np.zeros(len(m.sizes), dtype=np.int64)
    names = load_groups(obj_path)["names"] or ["(one group)"]
    n, area, _, foc = _face_normals(m)
    nv = len(m.verts)
    corner_group = fg[foc]
    gmin = np.full(nv, np.iinfo(np.int64).max)
    gmax = np.full(nv, np.iinfo(np.int64).min)
    np.minimum.at(gmin, m.flat, corner_group)
    np.maximum.at(gmax, m.flat, corner_group)
    a, b = za._edges(m)
    und = np.minimum(a, b) * max(nv, 1) + np.maximum(a, b)
    uk, cnt = np.unique(und, return_counts=True)
    eu, ev = uk // max(nv, 1), uk % max(nv, 1)
    val = np.bincount(np.concatenate([eu, ev]), minlength=nv)
    border = np.zeros(nv, dtype=bool)
    border[eu[cnt == 1]] = True
    border[ev[cnt == 1]] = True
    used = np.zeros(nv, dtype=bool)
    used[m.flat] = True
    star = used & ~border & (gmin == gmax) & (val != 4)
    groups = []
    for g in np.unique(fg):
        faces = np.nonzero(fg == g)[0]
        w = area[faces]
        mn = (n[faces] * w[:, None]).sum(axis=0)
        mn /= (np.linalg.norm(mn) or 1.0)
        spread = float(np.degrees(np.arccos(np.clip(n[faces] @ mn, -1, 1))).max())
        sv = np.nonzero(star & (gmin == g))[0]
        groups.append({"group": int(g), "name": names[int(g)] if 0 <= g < len(names) else str(g),
                       "stars": int(len(sv)), "meant_flat": spread <= flat_spread_deg,
                       "flagged": len(sv) > max_stars,
                       "first": [{"vertex": int(i), "valence": int(val[i]),
                                  "position": m.verts[i].round(6).tolist()} for i in sv[:5]]})
    return {"stars": int(star.sum()), "groups": groups,
            "flagged": [g for g in groups if g["flagged"]], "max_stars": max_stars}


def click_target(mesh, transform, group=None, face=None, edge=None, pivot=None, convention=None,
                 min_facing=0.3, doc_size=None):
    """Canvas pixel for one click on a polygroup, a face or an edge of an OBJ export of the
    active SubTool, for canvas_action (ZModeler action, NanoMesh insert) [verify the click
    itself]. transform: zbc.get_transform() for the current view; pivot: the tool's bbox centre
    (zb_stroke.Camera.from_zbrush uses query_mesh3d(2, 3)); default the OBJ bbox centre.
    Picks the visible face most square to the camera (facing >= min_facing); an edge is its
    midpoint, both neighbours facing. Uses the lead's zb_stroke.Camera, whose convention is
    [verify] until the lead's live_04 fits it."""
    import numpy as np
    if LEAD_SCRIPTS not in sys.path:
        sys.path.insert(0, LEAD_SCRIPTS)
    import zb_stroke
    za = _audit()
    m = za._as_mesh(mesh)
    v = m.verts
    if pivot is None:
        pivot = ((v.min(axis=0) + v.max(axis=0)) / 2).tolist()
    cam = zb_stroke.Camera(transform, pivot, convention)
    n, area, cen, _ = _face_normals(m)
    vl = v.tolist()

    def inside(x, y):
        return doc_size is None or (0 <= x < doc_size[0] and 0 <= y < doc_size[1])

    if edge is not None:
        u, w = int(edge[0]), int(edge[1])
        ef = _edge_faces(m)
        key = min(u, w) * ef["nv"] + max(u, w)
        hit = np.nonzero(ef["keys"] == key)[0]
        if not len(hit):
            raise ValueError(f"edge {edge} is not an interior edge of the mesh")
        fa, fb = ef["faces"][hit[0]]
        fac = [cam.facing(n[fa]), cam.facing(n[fb])]
        p = ((v[u] + v[w]) / 2).tolist()
        vis = zb_stroke.visible_mask(cam, vl, [p])[0]
        x, y, _ = cam.project(p)
        ok = min(fac) >= min_facing and vis and inside(x, y)
        return {"x": round(x, 2), "y": round(y, 2), "edge": [u, w], "facing": [round(f, 4) for f in fac],
                "visible": bool(vis), "ok": bool(ok)}
    if face is not None:
        cand = np.array([int(face)])
    elif group is not None:
        gi = load_groups(mesh) if isinstance(mesh, str) else None
        if gi is None:
            raise ValueError("group needs an OBJ path")
        g = gi["names"].index(group) if isinstance(group, str) else int(group)
        cand = np.nonzero(np.asarray(gi["face_group"]) == g)[0]
    else:
        cand = np.arange(len(m.sizes))
    if not len(cand):
        raise ValueError("no faces to target")
    fac = np.array([cam.facing(n[i]) for i in cand])
    vis = np.array(zb_stroke.visible_mask(cam, vl, cen[cand].tolist()))
    proj = [cam.project(c) for c in cen[cand].tolist()]
    ins = np.array([inside(x, y) for x, y, _ in proj])
    good = np.nonzero((fac >= min_facing) & vis & ins)[0]
    if not len(good):
        raise ValueError("no visible face of the target faces the camera: pick a view where it "
                         "does (zb_stroke.VIEWS, set_transform) and export again")
    best = good[np.argmax(fac[good])]
    x, y, _ = proj[best]
    return {"x": round(x, 2), "y": round(y, 2), "face": int(cand[best]),
            "facing": round(float(fac[best]), 4), "candidates": int(len(good)), "ok": True}
