"""
zb_ops: thin, checked wrappers for the deterministic ZBrush operations experts use.

Runs INSIDE ZBrush 2026 (CPython 3.11.9). From the agent side call it through the bridge:
    zb_launch.call("zb_ops", "dynamesh", 256)
    zb_launch.run("result = [zb_ops.divide(2), zb_ops.stats()]", modules=("zb_ops",))

Every wrapper resolves its item path from candidates with exists(), because set() on a
missing path is silent (proven v03). It reads values back and returns before/after numbers
so the caller can gate on them. Paths are tagged in PATHS:
  [bridge] exists() or used through the bridge on 2026.2.1 (v01-v03)
  [log]    canonical form written by ZBrush in Logs/Activity (2026-09-24 05:20 session)
  [doc]    printed in Maxon's SDK docs or examples;  [macro] used by a shipped 2026 macro
  [verify] not confirmed; the wrapper tries it and fails loudly if absent
  [cmdxml] id listed in ZData/ZLang/zcommands/commands.xml of 2026.2.1 (spaces and case are
           ignored in paths, so the id "Transform: Pf" is the path "Transform:Pf")
Only export_obj, export_canvas and the DynaMesh, Divide, brush and Draw paths have run
through the bridge. Every function here is "not yet run in ZBrush" as a function; see
tests/code/zbrush-expert/live_* for the checks that will prove them.

Safety defaults (refactor 2026-09-24, offline-tested only):
  project_all()  versioned ZTL first (it can crash: cgside), Store MT and a New Layer at the
                 top level, Dist set explicitly to 0.1 (Drust), gates after; repair with
                 morph_repair() or the layer, never by smoothing (FlippedNormals)
  gates          dynamesh, zremesher, divide, del_levels, decimate, deform/polish and
                 project_all return a "gate" dict built from get_polymesh3d_volume() and
                 is_polymesh3d_solid() (collapsed or exploded remesh, lost watertightness)
  long sequences quiet() (show_actions 0, restored), frozen(fn) (zbc.freeze), sequence()
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import contextlib
import difflib
import glob
import os
import re
import time

import zb_stroke  # pure Python sibling; imported at load time (the bridge prelude puts this
                  # folder on sys.path only while importing)

try:
    from zbrush import commands as zbc
except ImportError:  # agent side or offline tests: inject a fake with zb_ops.zbc = Fake()
    zbc = None

INSTALL = "/Applications/Maxon ZBrush 2026"


class ZBOpError(RuntimeError):
    pass


PATHS = {
    # mode, tools, canvas
    "edit": ["Transform:Edit"],                                   # [bridge]
    "sphere3d": ["Tool:Sphere3D"],                                # [bridge]
    "make_polymesh": ["Tool:Make PolyMesh3D"],                    # [bridge]
    "polymesh_star": ["Tool:PolyMesh3D"],                         # [verify] usd-portal
    "layer_clear": ["Layer:Clear"],                               # [macro]
    "fit": ["Transform:Fit", "Transform:Fit Mesh To View"],       # [macro] [doc]; Transform:Frame absent [bridge]
    "persp": ["Draw:Perspective", "Draw:Persp", "Transform:Persp"],  # [cmdxml] Draw:Perspective
    "polyframe": ["Transform:Pf", "Transform:PolyF"],             # [cmdxml] id "Transform: Pf"; PolyF is the label people say
    "symmetry": ["Transform:Activate Symmetry"],                  # [bridge]
    "sym_x": ["Transform:>X<"],                                   # [macro]
    "sym_y": ["Transform:>Y<"],                                   # [verify]
    "sym_z": ["Transform:>Z<"],                                   # [verify]
    "lsym": ["Transform:LSym"],                                   # [macro]
    "python_output": ["ZScript:Script Window Mode:Python Output"],  # [doc]
    # DynaMesh. The Activity log writes Tool:Geometry:Resolution and Tool:Geometry:DynaMesh
    # for what the agent sent as Tool:Geometry:DynaMesh:Resolution / :DynaMesh.
    "dyn_res": ["Tool:Geometry:DynaMesh:Resolution", "Tool:Geometry:Resolution"],  # [bridge] [log]
    "dyn_button": ["Tool:Geometry:DynaMesh:DynaMesh", "Tool:Geometry:DynaMesh"],    # [bridge] [log]
    "dyn_blur": ["Tool:Geometry:DynaMesh:Blur", "Tool:Geometry:Blur"],              # [verify]
    "dyn_project": ["Tool:Geometry:DynaMesh:Project", "Tool:Geometry:Project"],     # [verify]
    "dyn_groups": ["Tool:Geometry:DynaMesh:Groups", "Tool:Geometry:Groups"],        # [verify]
    # subdivision
    "divide": ["Tool:Geometry:Divide"],                           # [bridge] [doc]
    "smt": ["Tool:Geometry:Smt"],                                 # [bridge]
    "suv": ["Tool:Geometry:Suv"],                                 # [verify]
    "sdiv": ["Tool:Geometry:SDiv"],                               # [bridge]
    "lower_res": ["Tool:Geometry:Lower Res"],                     # [doc]
    "higher_res": ["Tool:Geometry:Higher Res"],                   # [verify]
    "del_lower": ["Tool:Geometry:Del Lower"],                     # [macro]
    "del_higher": ["Tool:Geometry:Del Higher"],                   # [macro]
    "mirror_weld": ["Tool:Geometry:Mirror And Weld"],             # [macro]
    "x_pos": ["Tool:Geometry:X Position"],                        # [doc]
    "y_pos": ["Tool:Geometry:Y Position"],                        # [doc]
    "z_pos": ["Tool:Geometry:Z Position"],                        # [doc]
    "xyz_size": ["Tool:Geometry:XYZ Size"],                       # [macro]
    # ZRemesher
    "zr_button": ["Tool:Geometry:ZRemesher:ZRemesher", "Tool:Geometry:ZRemesher"],   # [bridge]
    "zr_target": ["Tool:Geometry:ZRemesher:Target Polygons Count",
                  "Tool:Geometry:Target Polygons Count"],         # [bridge]
    "zr_half": ["Tool:Geometry:ZRemesher:Half", "Tool:Geometry:Half"],               # [verify]
    "zr_same": ["Tool:Geometry:ZRemesher:Same", "Tool:Geometry:Same"],               # [verify]
    "zr_double": ["Tool:Geometry:ZRemesher:Double", "Tool:Geometry:Double"],         # [verify]
    "zr_adapt": ["Tool:Geometry:ZRemesher:Adapt", "Tool:Geometry:Adapt"],            # [verify]
    "zr_adaptive_size": ["Tool:Geometry:ZRemesher:AdaptiveSize", "Tool:Geometry:AdaptiveSize"],  # [verify]
    "zr_keep_groups": ["Tool:Geometry:ZRemesher:KeepGroups", "Tool:Geometry:KeepGroups"],        # [verify]
    "zr_keep_creases": ["Tool:Geometry:ZRemesher:KeepCreases", "Tool:Geometry:KeepCreases"],     # [verify]
    "zr_detect_edges": ["Tool:Geometry:ZRemesher:Detect Edges", "Tool:Geometry:Detect Edges"],   # [verify]
    # SubTools and projection
    "duplicate": ["Tool:SubTool:Duplicate"],                      # [bridge] needs Edit mode
    "append": ["Tool:SubTool:Append"],                            # [bridge]
    "insert": ["Tool:SubTool:Insert"],                            # [macro] then PopUp:<Tool>
    "project_all": ["Tool:SubTool:Project All", "Tool:SubTool:Project:Project All"],  # [bridge] [cmdxml ProjectAll]
    "project_dist": ["Tool:SubTool:Project:Dist", "Tool:SubTool:Dist"],              # [cmdxml] second form
    "project_mean": ["Tool:SubTool:Project:Mean", "Tool:SubTool:Mean"],              # [cmdxml] second form
    "project_pa_blur": ["Tool:SubTool:Project:PA Blur", "Tool:SubTool:PA Blur"],     # [cmdxml] second form
    # deformation (each set applies once, like the shipped Enhance Details macro)
    "polish": ["Tool:Deformation:Polish"],                        # [bridge] [macro]
    "inflate": ["Tool:Deformation:Inflate"],                      # [bridge]
    "unify": ["Tool:Deformation:Unify"],                          # [doc]
    # masking, polygroups, visibility
    "mask_clear": ["Tool:Masking:Clear"],                         # [bridge]
    "mask_inverse": ["Tool:Masking:Inverse"],                     # [bridge]
    "mask_blur": ["Tool:Masking:BlurMask"],                       # [macro]
    "mask_sharpen": ["Tool:Masking:SharpenMask"],                 # [macro]
    "mask_grow": ["Tool:Masking:GrowMask"],                       # [verify]
    "mask_shrink": ["Tool:Masking:ShrinkMask"],                   # [verify]
    "mask_all": ["Tool:Masking:MaskAll"],                         # [verify]
    "mask_center": ["Tool:Masking:Go To Unmasked Center"],        # [macro]
    "pg_auto": ["Tool:Polygroups:Auto Groups"],                   # [bridge]
    "pg_visible": ["Tool:Polygroups:Group Visible"],              # [macro]
    "pg_masked": ["Tool:Polygroups:Group Masked"],                # [verify]
    "pg_normals": ["Tool:Polygroups:GroupsByNormals"],            # [verify]
    "vis_hide": ["Tool:Visibility:HidePt"],                       # [macro]
    "vis_show": ["Tool:Visibility:ShowPt"],                       # [macro]
    "vis_grow": ["Tool:Visibility:Grow"],                         # [macro]
    "vis_shrink": ["Tool:Visibility:Shrink"],                     # [macro]
    "store_mt": ["Tool:Morph Target:StoreMT"],                    # [macro] [cmdxml]
    "switch_mt": ["Tool:Morph Target:Switch"],                    # [macro] [cmdxml]
    "del_mt": ["Tool:Morph Target:DelMT"],                        # [cmdxml]
    "morph_slider": ["Tool:Morph Target:Morph"],                  # [cmdxml]
    "layer_new": ["Tool:Layers:New"],                             # [macro] [cmdxml]
    "layer_intensity": ["Tool:Layers:Intensity"],                 # [cmdxml]
    # UVs
    "uv_unwrap": ["Tool:UV Map:Create (Unwrap):Unwrap"],          # [bridge] [doc]
    "uv_auto_seams": ["Tool:UV Map:Create (Unwrap):Auto Seams"],  # [doc]
    "uv_symmetry": ["Tool:UV Map:Create (Unwrap):Symmetry"],      # [verify]
    "uvm_unwrap": ["Zplugin:UV Master:Unwrap"],                   # [bridge]
    "uvm_symmetry": ["Zplugin:UV Master:Symmetry"],               # [verify]
    "uvm_polygroups": ["Zplugin:UV Master:Polygroups"],           # [verify]
    "uvm_clone": ["Zplugin:UV Master:Work On Clone"],             # [verify]
    # Decimation Master (a ZScript plugin: whether a press returns to Python is [verify])
    "dm_percent": ["Zplugin:Decimation Master:% of decimation"],  # [verify] ZBrushCentral 2013
    "dm_preprocess": ["Zplugin:Decimation Master:Pre-process Current"],  # [verify]
    "dm_decimate": ["Zplugin:Decimation Master:Decimate Current"],       # [bridge]
    "dm_keep_uvs": ["Zplugin:Decimation Master:Keep UVs"],               # [verify]
    # files (set_next_filename first)
    "export": ["Tool:Export"],                                    # [bridge] dialog-free
    "import": ["Tool:Import"],                                    # [bridge]
    "tool_save_as": ["Tool:Save As"],                             # [bridge] exists; dialog-free [verify]
    "file_save_as": ["File:Save As"],                             # [bridge] exists
    "doc_export": ["Document:Export"],                            # [bridge] dialog-free
    "bpr": ["Render:BPR"],                                        # [bridge] exists
    "load_brush": ["Brush:Load Brush"],                           # [doc] path example
    # draw and state readers
    "draw_size": ["Draw:Draw Size"],                              # [bridge]
    "z_intensity": ["Draw:Z Intensity"],                          # [bridge]
    "focal": ["Draw:Focal Shift"],                                # [bridge]
    "zadd": ["Draw:Zadd"],                                        # [bridge] get worked
    "zsub": ["Draw:Zsub"],                                        # [verify]
    "mrgb": ["Draw:Mrgb"],                                        # [doc]
    "rgb": ["Draw:Rgb"],                                          # [verify]
    "lazymouse": ["Stroke:Lazy Mouse:LazyMouse"],                 # [bridge]
    "fill_object": ["Color:FillObject"],                          # [doc]
    "current_brush": ["Brush:Current Brush"],                     # [verify]
    "current_material": ["Material:Current Material"],            # [doc ZScript manual]
    "current_tool": ["Tool:Current Tool"],                        # [doc ZScript manual]
}


def _z():
    if zbc is None:
        raise ZBOpError("zbrush.commands not available: run inside ZBrush (zb_launch.call)")
    return zbc


def resolve(key, required=True):
    """First existing item path among the candidates for `key` (or a list of paths)."""
    cands = PATHS.get(key, [key]) if isinstance(key, str) else list(key)
    z = _z()
    for p in cands:
        if z.exists(p):
            return p
    if required:
        raise ZBOpError(f"none of {cands} exists: label changed in this build, wrong mode "
                        "(Edit off, not a PolyMesh3D), or plugin missing")
    return None


def get(key):
    return _z().get(resolve(key))


def set_checked(key, value, tol=1e-3):
    """set() then read back; raises when the value did not take (clamped, disabled, wrong
    path type). tol None skips the comparison."""
    p = resolve(key)
    z = _z()
    z.set(p, value)
    got = z.get(p)
    if tol is not None and abs(float(got) - float(value)) > tol:
        raise ZBOpError(f"{p}: set {value}, reads {got} (clamped or disabled?)")
    return got


def press(key, check_enabled=True):
    p = resolve(key)
    z = _z()
    if check_enabled and not z.is_enabled(p):
        raise ZBOpError(f"{p} is greyed out in the current state (pass check_enabled=False "
                        "to press anyway)")
    z.press(p)
    return p


def stats(bbox_mode=1):
    """Cheap numbers for gates: counts, bbox, area, volume, watertight, levels, UVs."""
    z = _z()
    s = {"tool": z.get_active_tool_path(), "subtools": z.get_subtool_count(),
         "active": z.get_active_subtool_index(), "edit": z.get("Transform:Edit")}
    try:
        s["points"] = int(z.query_mesh3d(0)[0])
        s["faces"] = int(z.query_mesh3d(1)[0])
        s["bbox"] = [round(float(v), 6) for v in z.query_mesh3d(2, bbox_mode)]
        s["area"] = round(float(z.get_polymesh3d_area()), 6)
        s["volume"] = round(float(z.get_polymesh3d_volume()), 6)
        s["solid"] = bool(z.is_polymesh3d_solid())
    except Exception as e:  # "Almost all queries can fail" (Maxon query_mesh3d example)
        s["mesh_error"] = repr(e)
    try:
        s["uv_bbox"] = [round(float(v), 6) for v in z.query_mesh3d(3)]
    except Exception:
        s["uv_bbox"] = None
    p = resolve("sdiv", required=False)
    if p:
        s["sdiv"] = z.get(p)
        s["sdiv_max"] = z.get_max(p)
    return s


# --------------------------------------------------------------------------------------------
# Gates: volume and watertightness after each destructive op
# --------------------------------------------------------------------------------------------

# Volume ratio after/before per op, and which checks apply. All bands are [added] start values
# to calibrate on live runs (the sculpting digest starts volume drift at 2 percent, also
# [added] there). The SDK gives both numbers in one call each: get_polymesh3d_volume() catches
# a collapsed or exploded remesh, is_polymesh3d_solid() is the cheap watertight check
# (python_sdk digest delta 22). A gate never raises: callers read gate["problems"] (the step
# is not done) and gate["warnings"] (look at it), or call require_gate(result).
GATE_BANDS = {
    "dynamesh": {"volume": (0.5, 2.0), "volume_problem": True, "solid_after": True},
    "zremesher": {"volume": (0.8, 1.25), "keep_solid": True},
    "divide": {"volume": (0.9, 1.1), "keep_solid": True},
    "del_levels": {"volume": (0.9, 1.1), "keep_solid": True},
    "decimate": {"volume": (0.9, 1.1), "keep_solid": True},
    "polish": {"volume": (0.98, 1.02), "keep_solid": True},
    "deform": {"keep_solid": True},
    "project_all": {"volume": (0.5, 2.0), "keep_solid": True, "keep_points": True},
}
BBOX_MARGIN = 0.02          # spike test of project_all, fraction of the largest side [added]


def gate(op, before, after, bands=None):
    """Compare two stats() dicts for `op`. Volume is judged only when the mesh was closed and
    had a positive volume before (an open mesh has no meaningful volume); a result volume at
    or below 0 on a closed result is always a problem (collapsed or inverted)."""
    b = dict(GATE_BANDS.get(op, {}), **(bands or {}))
    v0, v1 = before.get("volume"), after.get("volume")
    s0, s1 = before.get("solid"), after.get("solid")
    probs, warns = [], []
    ratio = round(v1 / v0, 5) if v0 and v1 is not None else None
    if s1 is True and v1 is not None and v1 <= 0:
        probs.append(f"{op}: volume {v1} after on a closed mesh (collapsed or inverted)")
    elif s0 is not False and v0 and v0 > 0 and v1 is not None and "volume" in b:
        lo, hi = b["volume"]
        if not lo <= ratio <= hi:
            msg = (f"{op}: volume ratio {ratio} outside {lo} to {hi} (collapsed, exploded or "
                   "melted parts: look at a render before going on)")
            (probs if b.get("volume_problem") else warns).append(msg)
    if b.get("solid_after") and s1 is False:
        warns.append(f"{op}: result is not watertight (is_polymesh3d_solid False)")
    if b.get("keep_solid") and s0 is True and s1 is False:
        warns.append(f"{op}: the mesh was watertight before and is not any more")
    if b.get("keep_points") and before.get("points") is not None \
            and after.get("points") != before.get("points"):
        probs.append(f"{op}: point count changed {before.get('points')} -> {after.get('points')}")
    return {"ok": not probs, "volume_ratio": ratio, "solid_before": s0, "solid_after": s1,
            "problems": probs, "warnings": warns}


def require_gate(result):
    """Raise ZBOpError when an op's gate found a problem; returns the result otherwise."""
    g = (result or {}).get("gate") or {}
    if g and not g.get("ok", True):
        raise ZBOpError("; ".join(g.get("problems", [])) or "gate failed")
    return result


# --------------------------------------------------------------------------------------------
# Long sequences: show_actions(0) and freeze (SDK GUI reference, python_sdk digest delta 27)
# --------------------------------------------------------------------------------------------

_QUIET = {"depth": 0}


@contextlib.contextmanager
def quiet():
    """show_actions(0) around a run of press/toggle calls (pure set() calls do not need it:
    SDK show_actions), back to 1 on exit, also after an error; nesting is counted. The state
    lives in this module, which the bridge prelude re-imports and pops on every call, so it
    cannot leak between calls."""
    fn = getattr(_z(), "show_actions", None)
    _QUIET["depth"] += 1
    if fn and _QUIET["depth"] == 1:
        fn(0)
    try:
        yield
    finally:
        _QUIET["depth"] -= 1
        if fn and _QUIET["depth"] == 0:
            fn(1)


def frozen(fn, *args, fade_time=0.0, **kwargs):
    """fn(*args, **kwargs) inside zbc.freeze: no UI redraw, progress bars still work (SDK
    freeze). freeze() returns None and does not document what happens when the payload
    raises, so the payload catches and the error is raised again after freeze returns
    [added]. Then update(redraw_ui=True), so a following canvas export sees the result.
    Never export the canvas or press a ZScript plugin (UV Master, Decimation Master, Multi
    Map Exporter) inside a frozen block [added]."""
    z = _z()
    fz = getattr(z, "freeze", None)
    if fz is None:
        return fn(*args, **kwargs)
    box = {}

    def _payload():
        try:
            box["value"] = fn(*args, **kwargs)
        except BaseException as e:  # re-raised below, outside ZBrush's freeze
            box["error"] = e

    fz(_payload, fade_time)
    z.update(redraw_ui=True)
    if "error" in box:
        raise box["error"]
    return box.get("value")


_NOT_IN_SEQUENCE = {"sequence", "frozen", "quiet", "decimate", "export_canvas", "morph_repair",
                    "sculpt_stroke"}


def sequence(steps, freeze=True, show=False, stop_on_error=True):
    """Several zb_ops calls in ONE bridge call, e.g. [["divide", [2]], ["polish", [10]],
    ["export_obj", ["/abs/a.obj"], {"overwrite": True}]]. freeze=True runs them inside
    zbc.freeze (Maxon's own freeze example wraps Divide, Unwrap, Lower Res and a map);
    show=False hides press feedback (show_actions 0). Refused inside: plugin presses
    (decimate, uv_unwrap with "uvmaster"), canvas exports and strokes, which need a live UI
    [added]. Returns [{"step", "ok", "value" or "error"}]."""
    plan = []
    for st in steps:
        name = st[0]
        args = list(st[1]) if len(st) > 1 and st[1] is not None else []
        kw = dict(st[2]) if len(st) > 2 and st[2] is not None else {}
        fn = globals().get(name)
        words = [str(a).lower() for a in list(args) + list(kw.values())]
        plugin = any(w == "uvmaster" or "zplugin" in w or w.startswith(("uvm_", "dm_"))
                     for w in words)
        if name.startswith("_") or not callable(fn) or name in _NOT_IN_SEQUENCE or plugin:
            raise ValueError(f"{name!r} cannot run in a sequence (unknown, private, plugin, "
                             "stroke or canvas export)")
        plan.append((name, fn, args, kw))

    def _run():
        out = []
        for name, fn, args, kw in plan:
            try:
                out.append({"step": name, "ok": True, "value": fn(*args, **kw)})
            except Exception as e:
                out.append({"step": name, "ok": False, "error": f"{type(e).__name__}: {e}"})
                if stop_on_error:
                    break
        return out

    def _body():
        if show:
            return _run()
        with quiet():
            return _run()

    return frozen(_body) if freeze else _body()


def ensure_edit():
    """Edit mode must be on before any canvas stroke or click: with Edit off a drag stamps
    another pixol copy of the tool (Pablo, Logic Part 1; ZTools docs)."""
    z = _z()
    if z.get("Transform:Edit") >= 0.5:
        return True
    if z.is_enabled("Transform:Edit"):
        z.set("Transform:Edit", 1)
        if z.get("Transform:Edit") >= 0.5:
            return True
    raise ZBOpError("no editable tool on the canvas: draw one (new_sphere) before strokes")


def new_sphere(resolution=128, drag_frac=0.35):
    """Sphere3D -> Make PolyMesh3D -> draw (only when Edit is off) -> Edit -> DynaMesh.
    Same sequence as v01 [bridge]. Pressing a Tool while Edit is on swaps the edited tool
    [verify]."""
    z = _z()
    press("sphere3d", check_enabled=False)
    press("make_polymesh", check_enabled=False)
    if z.get("Transform:Edit") < 0.5:
        lc = resolve("layer_clear", required=False)
        if lc:
            z.press(lc)
        w, h = z.get("Document:Width"), z.get("Document:Height")
        z.canvas_click(w * 0.5, h * 0.5, w * 0.5, h * (0.5 + drag_frac))
        z.set("Transform:Edit", 1)
    ensure_edit()
    out = {"created": z.get_active_tool_path()}
    if resolution:
        out["dynamesh"] = dynamesh(resolution)
    out["stats"] = stats()
    return out


def dynamesh(resolution, blur=None, project=None, groups=None, allow_levels=False):
    """(Re)DynaMesh the active SubTool at `resolution`. Refuses a SubTool with subdivision
    levels (ZBrush would ask to delete them in a modal note). When DynaMesh is already on,
    it is switched off then on so the new resolution applies (the human gesture is Ctrl+drag
    on empty canvas, which the API cannot do) [verify toggle semantics, live_06]."""
    z = _z()
    before = stats()
    if before.get("sdiv_max", 1) > 1 and not allow_levels:
        raise ZBOpError(f"SubTool has {before['sdiv_max']:.0f} subdivision levels: delete them "
                        "first (del_levels) so DynaMesh raises no dialog")
    set_checked("dyn_res", resolution, tol=0.5)
    for key, val in (("dyn_blur", blur), ("dyn_project", project), ("dyn_groups", groups)):
        if val is not None:
            set_checked(key, float(val), tol=0.5)
    btn = resolve("dyn_button")
    was_on = z.get(btn) >= 0.5
    if was_on:
        z.set(btn, 0)
        z.update(redraw_ui=True)
    z.press(btn)
    z.update(redraw_ui=True)
    after = stats()
    return {"resolution": resolution, "was_on": was_on, "state_after": z.get(btn),
            "faces_before": before.get("faces"), "faces_after": after.get("faces"),
            "volume_before": before.get("volume"), "volume_after": after.get("volume"),
            "remeshed": (not was_on) or before.get("faces") != after.get("faces"),
            "gate": gate("dynamesh", before, after)}


def del_levels():
    """Delete lower and higher subdivision levels (keeps the current level's shape)."""
    z = _z()
    before = stats()
    out = []
    with quiet():
        for key in ("del_lower", "del_higher"):
            p = resolve(key, required=False)
            if p and z.is_enabled(p):
                z.press(p)
                out.append(p)
    after = stats()
    return {"pressed": out, "stats": after, "gate": gate("del_levels", before, after)}


def divide(n=1, smt=None, suv=None):
    """Divide n times; each level should multiply faces by 4 [doc; Pablo Logic Part 7]. The
    presses run under quiet() (show_actions 0)."""
    z = _z()
    if smt is not None:
        set_checked("smt", 1 if smt else 0, tol=0.5)
    if suv is not None:
        set_checked("suv", 1 if suv else 0, tol=0.5)
    before = stats()
    with quiet():
        for _ in range(int(n)):
            press("divide")
            z.update(redraw_ui=True)
    after = stats()
    ratio = after["faces"] / before["faces"] if before.get("faces") else None
    return {"n": n, "faces_before": before.get("faces"), "faces_after": after.get("faces"),
            "ratio": ratio, "expected_ratio": 4 ** int(n), "sdiv_max": after.get("sdiv_max"),
            "gate": gate("divide", before, after)}


def zremesher(target_k=5.0, adaptive=None, adaptive_size=None, keep_groups=None, mode=None,
              keep_creases=None, detect_edges=None):
    """ZRemesher to `target_k` thousand polygons (the slider is in thousands: Pablo, 5 gave
    4,963). mode: None, "half", "same" or "double". adaptive False hits the count more
    closely (doc: Adapt on by default for quality). Needs a SubTool without levels
    [added][verify]. Slow: call through the bridge with a long timeout."""
    z = _z()
    before = stats()
    if before.get("sdiv_max", 1) > 1:
        raise ZBOpError("ZRemesher on a SubTool with subdivision levels: duplicate and "
                        "del_levels first, keep the sculpt as the projection source")
    set_checked("zr_target", target_k, tol=0.01)
    for key, val in (("zr_adapt", adaptive), ("zr_keep_groups", keep_groups),
                     ("zr_keep_creases", keep_creases), ("zr_detect_edges", detect_edges)):
        if val is not None:
            set_checked(key, 1 if val else 0, tol=0.5)
    if adaptive_size is not None:
        set_checked("zr_adaptive_size", adaptive_size, tol=0.5)
    if mode is not None:
        if mode not in ("half", "same", "double"):
            raise ValueError("mode must be half, same or double")
        for m in ("half", "same", "double"):
            set_checked("zr_" + m, 1 if m == mode else 0, tol=0.5)
    t = time.time()
    press("zr_button")
    z.update(redraw_ui=True)
    after = stats()
    tgt = target_k * 1000.0
    return {"target": tgt, "faces_before": before.get("faces"), "faces_after": after.get("faces"),
            "ratio_to_target": after["faces"] / tgt if after.get("faces") else None,
            "seconds": round(time.time() - t, 2), "volume_before": before.get("volume"),
            "volume_after": after.get("volume"), "gate": gate("zremesher", before, after)}


def subtools():
    """Index, status bits and folder-aware visibility per SubTool (eye 0x1 and, inside a
    folder, the folder eye 0x2: usd-portal ActiveSubToolVisible) [verify folder index]."""
    z = _z()
    out = []
    n = z.get_subtool_count()
    for i in range(n):
        st = int(z.get_subtool_status(i))
        f = int(z.get_subtool_folder_index(i))
        fvis = f < 0 or bool(int(z.get_subtool_status(f)) & 0x2)
        out.append({"index": i, "status": st, "folder": f,
                    "folder_name": z.get_subtool_folder_name(i) if f >= 0 else "",
                    "visible": bool(st & 0x1) and fvis})
    return out


PROJECT_DIST = 0.1   # the working value; the small default causes "90 percent" of Project All
                     # artifacts (Drust nxMYYsyJt3o 00:02:19, R2MzFqWMaWY 00:02:48; topology digest
                     # consensus 6). Very different shapes: ProjectionShell + Inner + Dist 1
                     # (Gaboury pQbPtH0p5Bg 00:03:02), see scenario-zbrush-retopology-export.

REPAIR = ("Repair without smoothing (FlippedNormals Zp07GW3rND0 00:04:27, 00:06:36: smoothing "
          "does not fix busted areas or rogue vertices): zb_ops.morph_repair(points) paints the "
          "area back to the stored morph target with the Morph brush; zb_ops.set_layer_intensity"
          "(v) dials the whole projection once its layer no longer records [verify]; or mask the "
          "busted region, invert and project again (local reprojection, 00:09:27). A target "
          "inside the source: masked Inflate and reproject, or ProjectionShell + Inner + Dist 1. "
          "Worst case: reopen the checkpoint ZTL.")


def top_level():
    """SDiv slider to its maximum, where new layers must be made (Maxon 3D Layers doc) and
    where FlippedNormals store the morph target before projecting (Zp07GW3rND0 00:02:13).
    Returns {"level_before", "top"} so staged work can go back down."""
    z = _z()
    p = resolve("sdiv", required=False)
    if not p:
        return {"level_before": None, "top": None}
    cur, top = z.get(p), z.get_max(p)
    if top > cur + 0.5:
        set_checked("sdiv", top, tol=0.5)
    return {"level_before": cur, "top": top}


def store_morph_target(replace=True):
    """Tool > Morph Target > StoreMT on the active SubTool at its current level. One morph
    target per SubTool, tied to the level where it was stored, destroyed by any point-count
    change (Maxon Morph Targets doc), so store it after the last Divide. When StoreMT is
    greyed out because a target exists, DelMT first (replace=True) [verify live_06: StoreMT
    greyed while a target exists, DelMT without a confirmation note]."""
    z = _z()
    p = resolve("store_mt", required=False)
    if not p:
        return {"stored": False, "replaced": False, "why": "StoreMT not found"}
    replaced = False
    if not z.is_enabled(p) and replace:
        d = resolve("del_mt", required=False)
        if d and z.is_enabled(d):
            z.press(d)
            z.update(redraw_ui=True)
            replaced = True
    if not z.is_enabled(p):
        return {"stored": False, "replaced": replaced, "why": "StoreMT greyed out"}
    z.press(p)
    z.update(redraw_ui=True)
    return {"stored": True, "replaced": replaced, "path": p}


def new_layer():
    """Tool > Layers > New at the current level, which must be the top level (3D Layers doc).
    The new layer records (REC on) until REC is clicked off at the top level; while it
    records, its Intensity reads as 1 whatever the slider says. Layers cannot be named from
    Python (Rename opens a prompt; no layer API: Maxon forum 2026)."""
    z = _z()
    p = resolve("layer_new", required=False)
    if not p or not z.is_enabled(p):
        return {"created": False, "why": "Tool:Layers:New not found or greyed out"}
    z.press(p)
    z.update(redraw_ui=True)
    return {"created": True, "path": p}


def set_layer_intensity(value):
    """Tool > Layers > Intensity of the selected layer: 1 as recorded, 0 hides it, above 1
    exaggerates, negative inverts (3D Layers doc). No effect while the layer records, and the
    REC toggle has no confirmed path [verify live_06]; the human path is the layer's eye or
    REC icon."""
    return {"intensity": set_checked("layer_intensity", value, tol=0.01)}


def _bbox(z, mode):
    try:
        return [round(float(v), 6) for v in z.query_mesh3d(2, mode)]
    except Exception:
        return None


def _outside(bbox, box):
    """How far bbox reaches outside box, as a fraction of box's largest side (0 inside)."""
    if not bbox or not box:
        return None
    side = max(box[3] - box[0], box[4] - box[1], box[5] - box[2]) or 1.0
    over = max([box[k] - bbox[k] for k in range(3)] + [bbox[k + 3] - box[k + 3] for k in range(3)])
    return round(max(over, 0.0) / side, 5)


def project_all(dist=PROJECT_DIST, mean=None, pa_blur=None, checkpoint=None, store_mt=True,
                layer=True, level=None, exclusive=False):
    """Project All onto the active SubTool from the other visible SubTools, safe by default.

    1. checkpoint: a versioned ZTL save FIRST, because Project All "might crash the program"
       (cgside MyhwQvkcnwI 00:02:19) and Python has no undo. An absolute .ztl path (saved as
       _vNNN, never overwritten), or False only when the caller has just saved this state.
       None raises before anything changes.
    2. At the top level (top_level()): Store Morph Target, then a New Layer, the two safety
       nets FlippedNormals set up before every projection (Zp07GW3rND0 00:02:13, 00:02:47).
       The layer records the projection; the morph target is what the Morph brush paints
       back to. store_mt / layer False skip them (the result says so).
    3. Back to `level` (default: the level the SubTool was on) for staged projection: from
       the lowest level upward when the shapes differ a lot (FlippedNormals 00:03:17).
    4. Dist set explicitly, 0.1 by default (PROJECT_DIST; None also means 0.1); Mean and
       PA Blur only when given (PA Blur lowered for a clean source: FlippedNormals 00:02:47).
    5. Project All, then the gate: point count unchanged, target bbox inside the bbox of all
       visible SubTools before projecting (a vertex outside is a spike or a rogue vertex),
       volume ratio, watertightness kept. When the gate is not clean, "repair" says how.
    Only source and target should be visible (Maxon; Pavlovich n5 01:07:26): exclusive=True
    refuses more; by default more than two is a warning (colour from several pieces)."""
    z = _z()
    vis = [s for s in subtools() if s["visible"]]
    if len(vis) < 2:
        raise ZBOpError("Project All needs a visible source SubTool besides the target")
    if exclusive and len(vis) != 2:
        raise ZBOpError(f"{len(vis)} visible SubTools: only source and target may be visible")
    if checkpoint is None:
        raise ZBOpError("Project All can crash ZBrush (cgside) and there is no undo from Python: "
                        "pass checkpoint='/abs/name.ztl' (versioned save first) or "
                        "checkpoint=False when this state was just saved")
    out = {"visible_subtools": len(vis),
           "warning": "more than 2 visible" if len(vis) > 2 else None}
    t0 = time.time()
    if checkpoint:
        out["checkpoint"] = save_ztl(checkpoint)
    else:
        out["checkpoint"] = {"path": None, "by": "caller"}
    lv = top_level()
    out["level_before"], out["top_level"] = lv["level_before"], lv["top"]
    out["morph_target"] = store_morph_target() if store_mt else {"stored": False, "why": "store_mt=False"}
    out["layer"] = new_layer() if layer else {"created": False, "why": "layer=False"}
    want = level if level is not None else lv["level_before"]
    sd = resolve("sdiv", required=False)
    if sd and want is not None and abs(z.get(sd) - want) > 0.5:
        set_checked("sdiv", want, tol=0.5)
    out["level"] = z.get(sd) if sd else None
    out["dist"] = set_checked("project_dist", PROJECT_DIST if dist is None else dist, tol=0.01)
    if mean is not None:
        out["mean"] = set_checked("project_mean", mean, tol=0.01)
    if pa_blur is not None:
        out["pa_blur"] = set_checked("project_pa_blur", pa_blur, tol=0.01)
    before = stats(bbox_mode=0)
    union = _bbox(z, 2)                      # visible SubTools, all of them [doc query_mesh3d]
    press("project_all")
    z.update(redraw_ui=True)
    after = stats(bbox_mode=0)
    g = gate("project_all", before, after)
    reach = _outside(after.get("bbox"), union)
    if reach is not None and reach > BBOX_MARGIN:
        g["problems"].append(f"project_all: target reaches {reach:.1%} outside the visible "
                             "bbox: spikes or rogue vertices")
        g["ok"] = False
    missing = []
    if store_mt and not out["morph_target"].get("stored"):
        missing.append(f"morph target ({out['morph_target'].get('why')})")
    if layer and not out["layer"].get("created"):
        missing.append(f"layer ({out['layer'].get('why')})")
    if missing:
        g["warnings"].append("project_all: safety net missing: " + ", ".join(missing) +
                             "; the checkpoint ZTL is the only way back")
    g["outside_fraction"] = reach
    out.update({"volume_before": before.get("volume"), "volume_after": after.get("volume"),
                "area_before": before.get("area"), "area_after": after.get("area"),
                "points_before": before.get("points"), "points_after": after.get("points"),
                "bbox_visible_before": union, "bbox_after": after.get("bbox"), "gate": g,
                "seconds": round(time.time() - t0, 2)})
    if g["problems"] or g["warnings"]:
        out["repair"] = REPAIR
    return out


def morph_repair(points, size=None, z_intensity=None, repeats=1, **stroke_kw):
    """Paint a busted projection area back to the stored morph target with the Morph brush
    (FlippedNormals Zp07GW3rND0 00:04:27, 00:06:36), at the top level where project_all
    stored it. points: canvas pixels over the area (zb_stroke helpers; aim with the camera
    of the review view). Symmetry is the caller's choice (set_symmetry). Needs a morph
    target: Tool:Morph Target:Switch enabled [verify live_06]. Stroke-free alternatives:
    set_layer_intensity(), or mask the area, invert and project again."""
    z = _z()
    sw = resolve("switch_mt", required=False)
    if not sw or not z.is_enabled(sw):
        raise ZBOpError("no morph target on this SubTool: nothing to paint back to "
                        "(project_all stores one unless store_mt=False)")
    lv = top_level()
    r = sculpt_stroke(points, brush="Morph", size=size, z_intensity=z_intensity,
                      repeats=repeats, **stroke_kw)
    r["level"] = lv["top"]
    return r


def deform(name, value, axes=None):
    """Tool:Deformation:<name> set to value (applies once). axes: bit mask x=1, y=2, z=4 in
    GUI order (SDK Modifiers partial); restored afterwards."""
    z = _z()
    p = resolve([f"Tool:Deformation:{name}"])
    old = None
    if axes is not None:
        old = z.get_mod(p)
        z.set_mod(p, axes)
    before = stats()
    z.set(p, value)
    z.update(redraw_ui=True)
    after = stats()
    if old is not None:
        z.set_mod(p, old)
    op = "polish" if name.replace(" ", "").lower() == "polish" else "deform"
    return {"path": p, "value": value, "volume_before": before.get("volume"),
            "volume_after": after.get("volume"), "gate": gate(op, before, after)}


def polish(value=10, axes=None):
    return deform("Polish", value, axes)


_OPS = {
    "mask": {"clear": "mask_clear", "invert": "mask_inverse", "blur": "mask_blur",
             "sharpen": "mask_sharpen", "grow": "mask_grow", "shrink": "mask_shrink",
             "all": "mask_all", "center": "mask_center"},
    "polygroups": {"auto": "pg_auto", "visible": "pg_visible", "masked": "pg_masked",
                   "normals": "pg_normals"},
    "visibility": {"hide": "vis_hide", "show": "vis_show", "grow": "vis_grow",
                   "shrink": "vis_shrink"},
}


def _op(group, op):
    key = _OPS[group].get(op)
    if key is None:
        raise ValueError(f"{group} op must be one of {sorted(_OPS[group])}")
    p = press(key)
    _z().update(redraw_ui=True)
    return p


def mask(op):
    """Masking button (mask data cannot be read back: no API, Maxon forum 2026)."""
    return _op("mask", op)


def polygroups(op):
    return _op("polygroups", op)


def visibility(op):
    return _op("visibility", op)


def _uv_tiles(z, cap=64):
    try:
        t = int(z.query_mesh3d(4)[0])
    except Exception:
        return None
    tiles = []
    while len(tiles) < cap and t not in tiles and t >= 0:
        tiles.append(t)
        try:
            t = int(z.query_mesh3d(5, t)[0])
        except Exception:
            break
    return tiles


def uv_unwrap(method="native", auto_seams=True, symmetry=None, polygroups=None,
              work_on_clone=None):
    """UVs on the active SubTool. native: Tool > UV Map > Create (Unwrap), the only path in
    the SDK docs. uvmaster: Zplugin > UV Master (a ZScript plugin; whether control returns
    to Python is [verify], live_08). Run on the lowest level."""
    z = _z()
    before = stats()
    t = time.time()
    if method == "native":
        if auto_seams is not None:
            set_checked("uv_auto_seams", 1 if auto_seams else 0, tol=0.5)
        if symmetry is not None:
            set_checked("uv_symmetry", 1 if symmetry else 0, tol=0.5)
        press("uv_unwrap")
    elif method == "uvmaster":
        for key, val in (("uvm_symmetry", symmetry), ("uvm_polygroups", polygroups),
                         ("uvm_clone", work_on_clone)):
            if val is not None:
                set_checked(key, 1 if val else 0, tol=0.5)
        press("uvm_unwrap", check_enabled=False)
    else:
        raise ValueError("method must be native or uvmaster")
    z.update(redraw_ui=True)
    after = stats()
    return {"method": method, "seconds": round(time.time() - t, 2),
            "uv_bbox_before": before.get("uv_bbox"), "uv_bbox": after.get("uv_bbox"),
            "tiles": _uv_tiles(z), "faces": after.get("faces")}


def decimate(percent, preprocess=True, keep_uvs=None):
    """Decimation Master on the active SubTool: keep `percent` of the polygons (% of
    decimation). Pre-process is the slow step. Decimation Master is a ZScript plugin; a
    ZScript that pressed it lost control (ijacobs 2013, cgside); Python is [verify]."""
    z = _z()
    before = stats()
    set_checked("dm_percent", percent, tol=0.51)
    if keep_uvs is not None:
        set_checked("dm_keep_uvs", 1 if keep_uvs else 0, tol=0.5)
    t = time.time()
    if preprocess:
        press("dm_preprocess", check_enabled=False)
    t_pre = time.time() - t
    press("dm_decimate", check_enabled=False)
    z.update(redraw_ui=True)
    after = stats()
    return {"percent": percent, "faces_before": before.get("faces"),
            "faces_after": after.get("faces"),
            "ratio": after["faces"] / before["faces"] if before.get("faces") else None,
            "preprocess_s": round(t_pre, 2), "total_s": round(time.time() - t, 2),
            "gate": gate("decimate", before, after)}


def _fresh_file(path, t0):
    return os.path.exists(path) and os.path.getsize(path) > 0 and os.path.getmtime(path) >= t0 - 2


def _prepare_target(path, overwrite):
    path = os.path.abspath(os.path.expanduser(path))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        if not overwrite:
            raise ZBOpError(f"{path} exists: pass overwrite=True (the old file is kept as .bak)")
        os.replace(path, path + time.strftime(".%Y%m%d-%H%M%S.bak"))
    return path


def _file_op(key, path, overwrite):
    z = _z()
    path = _prepare_target(path, overwrite)
    t0 = time.time()
    z.set_next_filename(path)
    press(key, check_enabled=False)
    consumed = None
    try:
        consumed = not z.has_next_filename()
    except Exception:
        pass
    if not _fresh_file(path, t0):
        raise ZBOpError(f"{resolve(key)} wrote nothing at {path}; if the preset is still "
                        f"pending ({not consumed}) a dialog probably opened: screenshot it")
    return {"path": path, "bytes": os.path.getsize(path), "seconds": round(time.time() - t0, 3),
            "preset_consumed": consumed}


def export_obj(path, overwrite=False):
    """Active SubTool to OBJ without a dialog [bridge v03: 0.08 s]."""
    return _file_op("export", path, overwrite)


def export_canvas(path, overwrite=False):
    """Document image to PNG without a dialog [bridge v03: 0.04 s; works with the screen
    locked]. This is the review image."""
    return _file_op("doc_export", path, overwrite)


def next_version(path, digits=3):
    """head.ztl -> head_v001.ztl; head_v004.ztl -> first free _vNNN at or after 004."""
    root, ext = os.path.splitext(path)
    m = re.match(r"^(.*)_v(\d+)$", root)
    base, n = (m.group(1), int(m.group(2))) if m else (root, 1)
    while True:
        cand = f"{base}_v{n:0{digits}d}{ext}"
        if not os.path.exists(cand):
            return cand
        n += 1


def save_ztl(path, version=True):
    """Save the active tool as .ZTL with set_next_filename + Tool:Save As [verify dialog-free].
    version=True never overwrites: it picks the next free _vNNN name. Saving renames the
    tool, and the top SubTool takes the file name (Pavlovich 030)."""
    path = os.path.abspath(os.path.expanduser(path))
    if not path.lower().endswith(".ztl"):
        path += ".ztl"
    if version:
        path = next_version(path)
    res = _file_op("tool_save_as", path, overwrite=False)
    res["tool_after"] = _z().get_active_tool_path()
    return res


# --------------------------------------------------------------------------------------------
# Brushes
# --------------------------------------------------------------------------------------------

def _asset_dirs():
    return glob.glob(os.path.expanduser("~/Library/Preferences/Maxon/ZBrush_*"))


def brush_roots():
    roots = [INSTALL + "/ZData/BrushPresets", INSTALL + "/Lightbox/Brushes"]
    for d in _asset_dirs():
        roots += [d + "/LightBox/Brushes", d + "/ZStartup/BrushPresets"]
    return [r for r in roots if os.path.isdir(r)]


def list_brush_files(roots=None):
    """[{name, path}] for every .ZBP under the install and the user Asset Directory.
    ZData/BrushPresets is what loads at startup; Lightbox brushes load on demand."""
    out = []
    for r in roots or brush_roots():
        for dirpath, _, files in os.walk(r):
            for f in sorted(files):
                if f.lower().endswith(".zbp"):
                    out.append({"name": f[:-4], "path": os.path.join(dirpath, f)})
    return out


def normalize_name(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


# Palette labels that differ from the file stem or from what people type. Dam_Standard is
# the UI label (UserInterfaceLayouts cfg) of DamStandard.ZBP; Brush:Dam_Standard was not
# found by exists() in v03, so every spelling is tried.
BRUSH_ALIASES = {
    "damstandard": ["DamStandard", "Dam_Standard", "Dam Standard"],
    "claybuildup": ["ClayBuildup", "Clay Buildup"],
    "movetopological": ["Move Topological", "MoveTopological"],
    "moveelastic": ["Move Elastic"],
    "inflate": ["Inflat"],
    "inflat": ["Inflat"],
    "smooth": ["Smooth"],
    "retopo": ["Retopo"],
}


def find_brush(name, limit=5, files=None):
    """Closest brush files for a name people use ("dam standard", "Clay Buildup")."""
    files = files if files is not None else list_brush_files()
    key = normalize_name(name)
    exact = [f for f in files if normalize_name(f["name"]) == key]
    if exact:
        return exact[:limit]
    alias = [normalize_name(a) for a in BRUSH_ALIASES.get(key, [])]
    by_alias = [f for f in files if normalize_name(f["name"]) in alias]
    if by_alias:
        return by_alias[:limit]
    names = {normalize_name(f["name"]): f for f in files}
    close = difflib.get_close_matches(key, list(names), n=limit, cutoff=0.6)
    return [names[c] for c in close]


def current_brush_title():
    p = resolve("current_brush", required=False)
    return _z().get_title(p) if p else None


def select_brush(name, load=True):
    """Select a brush by any common spelling; else load its .ZBP with Brush:Load Brush
    [verify dialog-free]. Note: picking a Smooth brush only changes the Shift-smooth brush;
    it cannot become the active sculpt brush (BR doc), and press_key cannot hold Shift."""
    z = _z()
    labels = list(BRUSH_ALIASES.get(normalize_name(name), []))
    labels += [f["name"] for f in find_brush(name)]
    labels += [name]
    tried = []
    for lab in dict.fromkeys(labels):
        p = "Brush:" + lab
        tried.append(p)
        if z.exists(p):
            z.press(p)
            return {"path": p, "title": current_brush_title(), "loaded": False, "tried": tried}
    if load:
        hits = find_brush(name, 1)
        if hits:
            z.set_next_filename(hits[0]["path"])
            press("load_brush", check_enabled=False)
            return {"path": None, "file": hits[0]["path"], "title": current_brush_title(),
                    "loaded": True, "tried": tried}
    raise ZBOpError(f"brush {name!r} not found; tried {tried}")


def set_draw(size=None, z_intensity=None, focal=None, zadd=None, zsub=None, rgb=None,
             mrgb=None, lazymouse=None):
    """Draw palette values with read-back. Draw Size is in screen pixels; Dynamic brush
    size (Preferences:Draw:Dynamic Brush Scale) can change what that means [verify]."""
    out = {}
    for key, val in (("draw_size", size), ("z_intensity", z_intensity), ("focal", focal)):
        if val is not None:
            out[key] = set_checked(key, val, tol=0.51)
    for key, val in (("zadd", zadd), ("zsub", zsub), ("rgb", rgb), ("mrgb", mrgb),
                     ("lazymouse", lazymouse)):
        if val is not None:
            out[key] = set_checked(key, 1 if val else 0, tol=0.5)
    return out


def set_material(name):
    """Press Material:<name>; returns the previous material title so it can be restored."""
    z = _z()
    cur = resolve("current_material", required=False)
    prev = z.get_title(cur).strip().rstrip(".").strip() if cur else None
    p = resolve([f"Material:{name}"])
    z.press(p)
    return {"previous": prev, "set": p}


def set_symmetry(on=True, axis="x"):
    """Transform:Activate Symmetry plus the axis switch; read back. Turn it OFF before a
    stroke aimed at one side, or the mirrored copy lands on the other side."""
    out = {"symmetry": set_checked("symmetry", 1 if on else 0, tol=0.5)}
    if on and axis:
        out[axis] = set_checked("sym_" + axis, 1, tol=0.5)
    return out


def sculpt_stroke(points, brush=None, size=None, z_intensity=None, zsub=False, repeats=1,
                  **stroke_kw):
    """Brush + Draw settings + one synthesized stroke (zb_stroke.encode, proven V02 format),
    with volume before and after as the evidence that it sculpted."""
    z = _z()
    ensure_edit()
    sel = select_brush(brush) if brush else None
    draw = set_draw(size=size, z_intensity=z_intensity, zadd=not zsub, zsub=zsub)
    v0 = z.get_polymesh3d_volume()
    ok = True
    st = z.Stroke(zb_stroke.encode(points, **stroke_kw))
    for _ in range(int(repeats)):
        ok = bool(z.canvas_stroke(st)) and ok
    z.update(redraw_ui=True)
    v1 = z.get_polymesh3d_volume()
    return {"ok": ok, "brush": sel, "draw": draw, "points": len(points),
            "volume_before": round(float(v0), 6), "volume_after": round(float(v1), 6)}
