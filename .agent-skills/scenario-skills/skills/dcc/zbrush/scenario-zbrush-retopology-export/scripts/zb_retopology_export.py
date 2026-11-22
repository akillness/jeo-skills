"""
zb_retopology_export ("rx"): the pipeline sculptor's toolkit (skill scenario-zbrush-retopology-export).

It builds on the lead toolkit in <skills>/scenario-zbrush-expert/scripts and never re-implements it:
zb_ops does every checked press and set (resolve with exists(), read-back, levels guards,
dialog-free exports), zb_audit measures OBJ exports, zb_launch talks to the bridge. This file
adds the retopology, projection, UV, map, scale, export and cleanup logic on top.

Inside ZBrush (always through rx.zcall("func", ...), main thread):
  PATHS, probe_paths()            extra item paths with evidence tags, and a live probe
  subtool_table(), set_visible(), show_only(), set_polyframe(), set_display()
  preflight()                     counts, levels, XYZ Size, Export Scale, offsets, names
  remesh_input(), zremesh(), retry(), project_stack(), freeze_levels()
  uv_state(), unwrap_creases(), uvmaster_roundtrip()
  bake_normal_map(), bake_displacement_map(), mme_path(), mme_set(), mme_create_all()
  set_export_switches(), set_export_scale(), set_export_placement(), export_subtools()
  decimate_copy(), decimate_keep_groups()
  import_mesh(), fix_mesh(), close_holes(), split_parts(), hide_small_parts(),
  merge_visible(), merge_down_run(), move_subtool(), merge_into(), color_to_groups(),
  polish_band(), duplicate_keep(), index_of(),
  dynamesh_keep(), plug_hole()
  safety_nets(), protect_isolated(), project_levels(), morph_target_present(),
  drop_morph_target()
Agent side (system python3 with numpy; PIL and cv2 optional):
  zcall(), build_call_code()      run a function of this module inside ZBrush
  obj_header(), obj_groups(), topo_report(), retopo_verdict(), pick_retry(), confirm_retry(),
  projection_verdict(), projection_from_stack()
  uv_report(), uv_verdict(), scale_report(), names_report(), obj_transform()
  map_info(), map_verdict(), normal_orientation(), height_orientation()
  glb_to_obj()                    scenario-3d GLB to OBJ (UVs flipped to OBJ, colour as #MRGB)
  roughness(), triage_ai_mesh(), orient_for_import(), hole_plugs(), cleanup_verdict()
  RENDERERS, MME_PRESETS, renderer_plan(), handoff_report()
Pure helpers (both sides): expected_band(), levels_needed(), export_scale_for(),
  placement_offsets(), percent_for_target(), dynamesh_resolution_for(), resolution_for_points()

Evidence tags, as in zb_ops:
  [uistr]  label present in ZData/ZLang/english/UInterface.zsc of 2026.2.1 (plugin labels are
           stored there as "Zplugin:[Plugin]:Label"); proves the label, not the path form
  [cmdxml] id listed in ZData/ZLang/zcommands/commands.xml (2026.2.1, dated 2026-06-01)
  [bridge] [log] [doc] [macro] [obj] [verify]  see zb_ops
Item paths ignore case and spaces (SDK docs), so "Tool:SubTool:Project All" and the
commands.xml id "Tool:SubTool:ProjectAll" are the same path.

The agent-side functions are tested offline (tests/code/zbrush-retopology-export).
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import importlib
import json
import math
import os
import re
import struct
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
EXPERT_SCRIPTS = os.path.normpath(os.path.join(_HERE, "..", "..", "scenario-zbrush-expert", "scripts"))


def _import_sibling(name):
    """Import a lead-toolkit module without leaving its folder on sys.path (shared-interpreter
    rule of the ZBrush SDK style guide)."""
    try:
        return importlib.import_module(name)
    except ImportError:
        sys.path.insert(0, EXPERT_SCRIPTS)
        try:
            return importlib.import_module(name)
        finally:
            if EXPERT_SCRIPTS in sys.path:
                sys.path.remove(EXPERT_SCRIPTS)


zb_ops = _import_sibling("zb_ops")      # pure Python at import time; zbc is None outside ZBrush
ZBOpError = zb_ops.ZBOpError

# --------------------------------------------------------------------------------------------
# Item paths not in zb_ops.PATHS. Keys shared with zb_ops are used through zb_ops directly.
# --------------------------------------------------------------------------------------------

def _grp(section, label, *extra):
    """Grouped form first (unambiguous), then the short form ZBrush logs (Activity log)."""
    palette, sub = section.rsplit(":", 1) if section.count(":") >= 2 else (section, None)
    out = [f"{section}:{label}"]
    if sub:
        out.append(f"{palette}:{label}")
    return out + list(extra)


PATHS = {
    # SubTool list [cmdxml]
    "split_parts": ["Tool:SubTool:Split:Split To Parts", "Tool:SubTool:Split To Parts"],
    "split_hidden": ["Tool:SubTool:Split:Split Hidden", "Tool:SubTool:Split Hidden"],
    "groups_split": ["Tool:SubTool:Split:Groups Split", "Tool:SubTool:Groups Split"],
    "merge_down": ["Tool:SubTool:Merge:MergeDown", "Tool:SubTool:MergeDown"],  # note on press [verify]
    "move_up": ["Tool:SubTool:MoveUp"],            # [cmdxml]; the selection follows [verify]
    "move_down": ["Tool:SubTool:MoveDown"],        # [cmdxml]
    "merge_visible": ["Tool:SubTool:Merge:MergeVisible", "Tool:SubTool:MergeVisible"],
    "merge_weld": ["Tool:SubTool:Merge:Weld", "Tool:SubTool:Weld"],
    "merge_uv": ["Tool:SubTool:Merge:Uv", "Tool:SubTool:Uv"],
    # projection [cmdxml]; zb_ops has project_all, project_dist, project_mean, project_pa_blur
    "project_history": _grp("Tool:SubTool:Project", "Project History"),
    "proj_shell": _grp("Tool:SubTool:Project", "ProjectionShell"),
    "proj_farthest": _grp("Tool:SubTool:Project", "Farthest"),
    "proj_outer": _grp("Tool:SubTool:Project", "Outer"),
    "proj_inner": _grp("Tool:SubTool:Project", "Inner"),
    "proj_geometry": _grp("Tool:SubTool:Project", "Geometry"),   # History switch; All? [verify]
    "proj_color": _grp("Tool:SubTool:Project", "Color"),         # History switch; All? [verify]
    "reproject_higher": _grp("Tool:SubTool:Project", "Reproject Higher Subdiv"),
    # geometry [cmdxml]
    "freeze_sdiv": ["Tool:Geometry:Freeze SubDivision Levels"],
    "reconstruct": ["Tool:Geometry:Reconstruct Subdiv"],
    "close_holes": _grp("Tool:Geometry:Modify Topology", "Close Holes"),
    "del_hidden": _grp("Tool:Geometry:Modify Topology", "Del Hidden"),
    "weld_points": _grp("Tool:Geometry:Modify Topology", "WeldPoints"),
    "unweld_groups": _grp("Tool:Geometry:Modify Topology", "Unweld Groups Border"),
    "check_mesh": _grp("Tool:Geometry:Mesh Integrity", "Check Mesh Integrity"),  # may raise a note
    "fix_mesh": _grp("Tool:Geometry:Mesh Integrity", "Fix Mesh"),
    "create_shell": _grp("Tool:Geometry:DynaMesh", "Create Shell"),
    "shell_thickness": _grp("Tool:Geometry:DynaMesh", "Thickness"),
    "crease_pg": _grp("Tool:Geometry:Crease", "Crease PG"),
    "uncrease_all": _grp("Tool:Geometry:Crease", "UnCreaseAll"),
    "edgeloop_masked": _grp("Tool:Geometry:Edge Loop", "Edgeloop Masked Border"),
    "x_size": _grp("Tool:Geometry:Size", "X Size"),
    "y_size": _grp("Tool:Geometry:Size", "Y Size"),
    "z_size": _grp("Tool:Geometry:Size", "Z Size"),
    # ZRemesher options zb_ops does not cover [cmdxml] [uistr]
    "zr_retry": _grp("Tool:Geometry:ZRemesher", "Retry"),               # [uistr] only
    "zr_freeze_border": _grp("Tool:Geometry:ZRemesher", "FreezeBorder"),
    "zr_freeze_groups": _grp("Tool:Geometry:ZRemesher", "FreezeGroups"),
    "zr_smooth_groups": _grp("Tool:Geometry:ZRemesher", "SmoothGroups"),
    "zr_curves_strength": _grp("Tool:Geometry:ZRemesher", "Curves Strength"),
    "zr_use_polypaint": _grp("Tool:Geometry:ZRemesher", "Use Polypaint"),
    "zr_color_density": _grp("Tool:Geometry:ZRemesher", "ColorDensity"),
    "zr_keep_polypaint": _grp("Tool:Geometry:ZRemesher", "KeepPolypaint"),  # [uistr] only
    "zr_legacy": _grp("Tool:Geometry:ZRemesher", "Legacy (2018)"),       # listed, removed per doc
    # deformation, masking, polygroups, polypaint [cmdxml]
    "polish_features": ["Tool:Deformation:Polish By Features"],
    "polish_groups": ["Tool:Deformation:Polish By Groups"],
    "smart_resym": ["Tool:Deformation:Smart ReSym"],
    "relax": ["Tool:Deformation:Relax"],
    "mask_by_feature": ["Tool:Masking:MaskByFeature", "Tool:Masking:Mask By Feature"],
    "mbf_border": ["Tool:Masking:Border"],
    "mbf_groups": ["Tool:Masking:Groups"],
    "mbf_crease": ["Tool:Masking:Crease"],
    "mask_intensity": ["Tool:Masking:Mask By Intensity"],
    "pg_from_polypaint": ["Tool:Polygroups:From Polypaint"],
    "pg_tolerance": ["Tool:Polygroups:PTolerance"],
    "pg_merge_stray": ["Tool:Polygroups:Merge Stray Groups"],
    "pg_max_angle": ["Tool:Polygroups:MaxAngle"],
    "pp_from_texture": ["Tool:Polypaint:Polypaint From Texture"],
    "pp_from_groups": ["Tool:Polypaint:Polypaint From Polygroups"],
    "colorize": ["Tool:Polypaint:Colorize"],
    # UV Map and Texture Map [cmdxml]; Create (Unwrap) labels [uistr]
    "uv_creased_edges": ["Tool:UV Map:Create (Unwrap):Creased Edges", "Tool:UV Map:Creased Edges"],
    "uv_crease_seams": ["Tool:UV Map:Create (Unwrap):Crease Seams", "Tool:UV Map:Crease Seams"],
    "uv_delete": ["Tool:UV Map:Delete UV"],
    "uv_size": ["Tool:UV Map:UV Map Size"],
    "uv_border": ["Tool:UV Map:UV Map Border"],
    "uv_morph": ["Tool:UV Map:Morph UV"],
    "uv_flip_v": ["Tool:UV Map:Flip V"],
    "uv_check_texture": ["Tool:Texture Map:New From UV Check"],
    "texture_from_polypaint": ["Tool:Texture Map:New From Polypaint"],
    # UV Master [uistr]; zb_ops has uvm_unwrap, uvm_symmetry, uvm_polygroups, uvm_clone
    "uvm_copy": ["Zplugin:UV Master:Copy UVs"],
    "uvm_paste": ["Zplugin:UV Master:Paste UVs"],
    "uvm_ao_attract": ["Zplugin:UV Master:AttractFromAmbientOccl"],
    "uvm_check_seams": ["Zplugin:UV Master:CheckSeams"],
    "uvm_flatten": ["Zplugin:UV Master:Flatten"],
    "uvm_unflatten": ["Zplugin:UV Master:UnFlatten"],
    "uvm_existing_seams": ["Zplugin:UV Master:Use Existing UV Seams"],
    "uvm_control_painting": ["Zplugin:UV Master:Enable Control Painting"],
    "uvm_clear_maps": ["Zplugin:UV Master:Clear Maps"],
    # Tool palette maps [cmdxml]
    "nm_tangent": ["Tool:Normal Map:Tangent"],
    "nm_adaptive": ["Tool:Normal Map:Adaptive"],
    "nm_smooth_uv": ["Tool:Normal Map:SmoothUV"],
    "nm_flip_r": ["Tool:Normal Map:FlipR"],
    "nm_flip_g": ["Tool:Normal Map:FlipG"],
    "nm_create": ["Tool:Normal Map:Create NormalMap"],
    "nm_clone": ["Tool:Normal Map:Clone NM"],
    "dm_mid": ["Tool:Displacement Map:Mid"],
    "dm_scale": ["Tool:Displacement Map:Scale"],
    "dm_32bit": ["Tool:Displacement Map:32Bit"],
    "dm_3ch": ["Tool:Displacement Map:3 Channels"],
    "dm_adaptive": ["Tool:Displacement Map:Adaptive"],
    "dm_dpsubpix": ["Tool:Displacement Map:DPSubPix"],
    "dm_smooth_uv": ["Tool:Displacement Map:SmoothUV"],
    "dm_flip_v": ["Tool:Displacement Map:Flip V"],
    "dm_create": ["Tool:Displacement Map:Create DispMap"],
    "dm_create_export": ["Tool:Displacement Map:Create And Export Map"],
    "texture_export": ["Texture:Export"],
    # Tool > Export and Import [cmdxml]; help strings: Mrg "Merge Uv Cords", Grp "Export Sub
    # Groups" [uistr]
    "exp_qud": ["Tool:Export:Qud"], "exp_tri": ["Tool:Export:Tri"], "exp_txr": ["Tool:Export:Txr"],
    "exp_flp": ["Tool:Export:Flp"], "exp_mrg": ["Tool:Export:Mrg"], "exp_grp": ["Tool:Export:Grp"],
    "exp_snormals": ["Tool:Export:Smooth Normals"], "exp_scale": ["Tool:Export:Scale"],
    "exp_xoff": ["Tool:Export:X Offset"], "exp_yoff": ["Tool:Export:Y Offset"],
    "exp_zoff": ["Tool:Export:Z Offset"],
    "imp_mrg": ["Tool:Import:Mrg"], "imp_add": ["Tool:Import:Add"],
    "imp_tri2quad": ["Tool:Import:Tri2Quad"], "imp_weld": ["Tool:Import:Weld"],
    "goz": ["Tool:GoZ"], "goz_all": ["Tool:All"], "goz_visible": ["Tool:Visible"],
    "tool_clone": ["Tool:Clone"],
    "display_double": ["Tool:Display Properties:Double"],
    "display_flip": ["Tool:Display Properties:Flip"],
    "polyframe": ["Transform:PolyF", "Transform:Pf"],   # commands.xml id is "Transform: Pf"
    "pref_eswitch_yz": ["Preferences:ImportExport:eSwitchYZ"],
    "pref_iswitch_yz": ["Preferences:ImportExport:iSwitchYZ"],
    "pref_import_groups": ["Preferences:ImportExport:Import PolyGroups"],
    # Decimation Master [uistr]; zb_ops has dm_percent, dm_preprocess, dm_decimate, dm_keep_uvs
    "dmx_freeze_borders": ["Zplugin:Decimation Master:Freeze borders"],
    "dmx_keep_polypaint": ["Zplugin:Decimation Master:Use and Keep Polypaint"],
    "dmx_k_points": ["Zplugin:Decimation Master:k Points"],
    "dmx_k_polys": ["Zplugin:Decimation Master:k Polys"],
    "dmx_preprocess_all": ["Zplugin:Decimation Master:Pre-process All"],
    "dmx_decimate_all": ["Zplugin:Decimation Master:Decimate All"],
    # Substance Bridge 2026.2 [uistr] (labels differ from the doc: "Auto-Bake", "Force
    # Auto-Unwrap", "PolyPaint")
    "sb_send": ["Texture:Substance Bridge:Send to Painter"],
    "sb_low_high": ["Texture:Substance Bridge:Low & High"],
    "sb_autobake": ["Texture:Substance Bridge:Auto-Bake"],
    "sb_force_unwrap": ["Texture:Substance Bridge:Force Auto-Unwrap"],
    "sb_smooth_normals": ["Texture:Substance Bridge:Smooth Normals"],
    "sb_per_polygroup": ["Texture:Substance Bridge:Per PolyGroup"],
    "sb_per_subtool": ["Texture:Substance Bridge:Per Subtool"],
    "sb_polypaint": ["Texture:Substance Bridge:PolyPaint"],
    # FBX ExportImport [uistr]: the Export press raises "FBX Export Options" (Maxon forum 2025)
    "fbx_export": ["Zplugin:FBX ExportImport:Export"],
    "fbx_maya_yup": ["Zplugin:FBX ExportImport:MayaYUp"],
    "fbx_unity": ["Zplugin:FBX ExportImport:Unity"],
    "fbx_tris": ["Zplugin:FBX ExportImport:Tris"],
    "fbx_snormals": ["Zplugin:FBX ExportImport:SNormals"],
    "fbx_visible": ["Zplugin:FBX ExportImport:Visible"],
    # Scale Master [uistr]
    "sm_unify": ["Zplugin:Scale Master:ZBrush Scale Unify"],
    "sm_center": ["Zplugin:Scale Master:Center Subtools to World"],
    # shipped macro that answers the Delete confirmation with [IKeyPress,'2',...] [macro]
    "macro_delete": ["Macro:Delete"],
    "polymesh_star": ["Tool:PolyMesh3D"],
}

MME_ROOT = "Zplugin:Multi Map Exporter"
MME_GROUPS = {"disp": "Displacement Map", "normal": "Normal Map", "vd": "Vector Disp Map",
              "ao": "Ambient Occlusion Map", "cavity": "Cavity Map", "mesh": "Mesh Export"}


def mme_path(label, group=None):
    """Candidate paths for a Multi Map Exporter item. The string table stores option items as
    "Zplugin:[Multi Map Exporter]:[Options]:[Displacement Map |]:Mid" [uistr]; labels such as
    Mid, SubDiv level, Adaptive, SmoothUV, 32Bit and exr repeat across groups, so the short
    form is ambiguous and comes last. Which form resolves is [verify] (live_rx_01)."""
    if group is None:
        return [f"{MME_ROOT}:{label}", f"{MME_ROOT}:Options:{label}"]
    g = MME_GROUPS[group]
    return [f"{MME_ROOT}:{g} |:{label}", f"{MME_ROOT}:Options:{g} |:{label}",
            f"{MME_ROOT}:{g}:{label}", f"{MME_ROOT}:Options:{g}:{label}", f"{MME_ROOT}:{label}"]


# zb_ops keys this module relies on (probed live with the rest)
OPS_KEYS = ("duplicate", "project_all", "project_dist", "project_mean", "project_pa_blur",
            "store_mt", "zr_button", "zr_target", "zr_half", "zr_same", "zr_double", "zr_adapt",
            "zr_adaptive_size", "zr_keep_groups", "zr_keep_creases", "zr_detect_edges",
            "uv_unwrap", "uv_auto_seams", "uv_symmetry", "uvm_unwrap", "uvm_symmetry",
            "uvm_polygroups", "uvm_clone", "dm_percent", "dm_preprocess", "dm_decimate",
            "dm_keep_uvs", "export", "import", "xyz_size", "sdiv", "del_lower", "del_higher",
            "mirror_weld", "pg_auto", "pg_normals", "mask_clear", "mask_inverse", "mask_grow",
            "vis_hide", "vis_show", "vis_grow", "mask_all", "append", "x_pos", "y_pos", "z_pos",
            "dyn_res", "dyn_button", "dyn_blur", "dyn_project", "del_mt", "layer_new", "switch_mt",
            "polish", "inflate", "unify", "symmetry", "sym_x")

VISIBLE = 0x0001        # eye of the SubTool (SDK get_subtool_status)
FOLDER_VISIBLE = 0x0002

# --------------------------------------------------------------------------------------------
# Pure helpers (both sides)
# --------------------------------------------------------------------------------------------


def P(key):
    """Candidate list for a key of this module, or the zb_ops key itself."""
    return PATHS[key] if key in PATHS else key


def expected_band(adaptive=True, keep_groups=False, freeze_border=False):
    """Face count / target band to accept a ZRemesher run before looking at it.
    Adapt on + Keep Groups: 5k gave 8.0k to 9.4k points on a grouped face (Pavlovich n5,
    frames 00:18:50, 00:22:09), so 0.8 to 2.0. Adapt off hits the count (ZRemesher doc) ->
    0.9 to 1.1. Freeze Border forces Adaptive Density (doc) -> 0.5 to 2.0. Adapt on without
    groups: Pablo got 4,963 for 5 (rArw79xEpvE 00:03:16) -> 0.8 to 1.3. Bands [added].
    Units: Pavlovich read POINTS; the band is applied to faces, which on a closed quad mesh of
    genus 0 differ from points by 2 (V = F + 2), and by a few per opening on open meshes."""
    if freeze_border:
        return (0.5, 2.0)
    if not adaptive:
        return (0.9, 1.1)
    return (0.8, 2.0) if keep_groups else (0.8, 1.3)


def levels_needed(level1_points, source_points, top_ratio=0.5, max_levels=7):
    """Divisions so the top level reaches top_ratio x the source point count (each Divide is
    x4: Pablo Logic Part 7; Drust divides until close to the source, R2MzFqWMaWY 00:02:16)."""
    if level1_points <= 0 or source_points <= 0:
        raise ValueError("point counts must be positive")
    n = 0
    while level1_points * 4 ** n < top_ratio * source_points and n < max_levels:
        n += 1
    return n


def export_scale_for(target_size, internal_extent):
    """Exported size = internal size x Export Scale (Drust n2xPrwI9o1U 00:04:19), so
    Scale = target / internal extent. 254 / 3.5 = 72.57 (Drust 00:06:37); 15 / 2 = 7.5
    (Gallagher EXjfH_X2hkM 00:21:22)."""
    if internal_extent <= 0:
        raise ValueError("internal extent must be positive")
    return target_size / internal_extent


def placement_offsets(bbox, feet_on_ground=True, center_xz=True):
    """Export offsets in internal units from a bbox (-x,-y,-z,+x,+y,+z). Gallagher: offsets
    are internal units and Y Offset 1 stands a 2-unit model on Maya's grid (EXjfH_X2hkM
    00:33:04), i.e. y_off = -ymin; x and z centre the model [added: sign to confirm with the
    OBJ header '#Auto offset' and the exported bbox, live_rx_05]."""
    x0, y0, z0, x1, y1, z1 = [float(v) for v in bbox]
    return {"x": -(x0 + x1) / 2 if center_xz else 0.0,
            "y": -y0 if feet_on_ground else 0.0,
            "z": -(z0 + z1) / 2 if center_xz else 0.0}


def percent_for_target(points_now, target_points):
    """Decimation Master "% of decimation" for a point target: target / current x 100
    (community ZScript formula, topology-export__decimation-master note) [verify units]."""
    if points_now <= 0:
        raise ValueError("points_now must be positive")
    return max(0.01, min(100.0, 100.0 * target_points / points_now))


# DynaMesh calibration from the v03 export: a radius-1 sphere at resolution 128 gave 43,480
# points on area 12.566 (4 pi). points = K * area * (res / 2)^2 -> K = 0.845, i.e. a cell of
# about 2 / res internal units. Resolution counts the scene's unit space, not the object
# (Gallagher 00:11:41; Pablo Logic Part 5 00:13:40). One calibration point: [added].
DYNAMESH_K = 43480.0 / (4 * math.pi * 64.0 ** 2)


def dynamesh_resolution_for(feature_size, cells=8):
    """Resolution that gives `cells` voxels across the thinnest feature (internal units)."""
    if feature_size <= 0:
        raise ValueError("feature_size must be positive")
    return int(math.ceil(2.0 * cells / feature_size))


def resolution_for_points(area, points):
    """Resolution expected to give about `points` on a surface of `area` (internal units)."""
    if area <= 0 or points <= 0:
        raise ValueError("area and points must be positive")
    return int(round(2.0 * math.sqrt(points / (DYNAMESH_K * area))))


def names_report(names):
    """GoZ needs unique Tool and SubTool names without spaces or special characters, across
    all loaded Tools (GoZ doc, Restrictions); Decimation Master needs unique names (doc)."""
    seen, dup = set(), []
    for n in names:
        if n in seen and n not in dup:
            dup.append(n)
        seen.add(n)
    bad = [n for n in names if not re.fullmatch(r"[A-Za-z0-9_]+", n or "")]
    return {"names": list(names), "duplicates": dup, "unsafe": bad, "ok": not dup and not bad}


# --------------------------------------------------------------------------------------------
# Inside ZBrush (not yet run in ZBrush)
# --------------------------------------------------------------------------------------------

def _z():
    return zb_ops._z()


def _get(key, default=None):
    p = zb_ops.resolve(P(key), required=default is None)
    return _z().get(p) if p else default


def _switch(key, on, required=True):
    """Set a switch to 0/1 with read-back; skip silently when optional and absent."""
    if not required and zb_ops.resolve(P(key), required=False) is None:
        return None
    return zb_ops.set_checked(P(key), 1 if on else 0, tol=0.5)


def _press(key, check_enabled=True):
    p = zb_ops.press(P(key), check_enabled=check_enabled)
    _z().update(redraw_ui=True)
    return p


def probe_paths(keys=None, include_ops=True, include_mme=True):
    """exists() on every candidate path. Read-only. Run once per build (live_rx_01) and record
    the forms that resolve in references/procedures.md."""
    z = _z()
    out = {k: {p: bool(z.exists(p)) for p in PATHS[k]} for k in (keys or sorted(PATHS))}
    if keys is None and include_ops:
        for k in OPS_KEYS:
            out["zb_ops." + k] = {p: bool(z.exists(p)) for p in zb_ops.PATHS[k]}
    if keys is None and include_mme:
        for g, label in MME_PROBE:
            out[f"mme.{g or 'main'}.{label}"] = {p: bool(z.exists(p)) for p in mme_path(label, g)}
    return out


MME_PROBE = [(None, "Displacement"), (None, "Normal"), (None, "Cavity"),
             (None, "Ambient Occlusion"), (None, "Texture from Polypaint"),
             (None, "Vector Displacement"), (None, "Export Mesh"), (None, "SubTools"),
             (None, "Merge Maps"), (None, "FlipV"), (None, "Map Size"), (None, "Map Border"),
             (None, "Create All Maps"), (None, "File names"), (None, "Load/Save Presets"),
             ("disp", "SubDiv level"), ("disp", "Mid"), ("disp", "Scale"), ("disp", "32Bit"),
             ("disp", "exr"), ("disp", "3 Channels"), ("disp", "Adaptive"),
             ("disp", "DpSubPix"), ("disp", "SmoothUV"), ("normal", "Tangent"),
             ("normal", "FlipG"), ("normal", "SubDiv level"), ("normal", "SmoothUV"),
             ("ao", "16Bit"), ("cavity", "16Bit")]


def _name_from_path(path):
    return str(path).replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]


def subtool_table(with_counts=True):
    """One row per SubTool: index, name, visibility (folder-aware, zb_ops.subtools), and with
    counts the points, faces, levels, bbox, UVs. The name comes from get_active_tool_path()
    after select_subtool(i), as in Maxon's ex_mod_subtool_export example [doc]."""
    z = _z()
    active = z.get_active_subtool_index()
    vis = {r["index"]: r for r in zb_ops.subtools()}
    rows = []
    try:
        for i in range(z.get_subtool_count()):
            z.select_subtool(i)
            row = {"index": i, "name": _name_from_path(z.get_active_tool_path()),
                   "visible": vis[i]["visible"], "status": vis[i]["status"],
                   "folder": vis[i]["folder"]}
            if with_counts:
                s = zb_ops.stats()
                row.update({k: s.get(k) for k in ("points", "faces", "bbox", "volume", "solid",
                                                   "sdiv", "sdiv_max")})
                row["has_uvs"] = s.get("uv_bbox") is not None
            rows.append(row)
    finally:
        z.select_subtool(active)
    return rows


def set_visible(index, on):
    """Eye of one SubTool, with read-back. Maxon's fragment writes the absolute status
    (status | 0x1); the stub text calls the value "toggle logic". Absolute first, read back,
    then a toggle write if the bit did not follow [verify which one ZBrush uses]."""
    z = _z()
    want = bool(on)
    s = int(z.get_subtool_status(index))
    if bool(s & VISIBLE) == want:
        method = "unchanged"
    else:
        z.set_subtool_status(index, (s | VISIBLE) if want else (s & ~VISIBLE))
        method = "absolute"
        if bool(int(z.get_subtool_status(index)) & VISIBLE) != want:
            z.set_subtool_status(index, VISIBLE)
            method = "toggle"
    s2 = int(z.get_subtool_status(index))
    f = int(z.get_subtool_folder_index(index))
    if want and f >= 0 and not int(z.get_subtool_status(f)) & FOLDER_VISIBLE:
        fs = int(z.get_subtool_status(f))
        z.set_subtool_status(f, fs | FOLDER_VISIBLE)
    if bool(s2 & VISIBLE) != want:
        raise ZBOpError(f"SubTool {index}: eye bit does not follow set_subtool_status "
                        f"(status {s:#x} -> {s2:#x})")
    return {"index": index, "visible": want, "method": method}


def show_only(indices):
    """Only these SubTools visible. Project All reads every SubTool whose eye is on, even in
    Solo mode (Pavlovich n5 01:07:26): control sources with visibility, never with Solo."""
    keep = {int(i) for i in indices}
    res = [set_visible(i, i in keep) for i in range(_z().get_subtool_count())]
    _z().update(redraw_ui=True)
    return [r for r in res if r["method"] != "unchanged"]


def set_polyframe(on=True):
    """Polyframe for topology screenshots (Shift+F for a human). Label ' Pf' [cmdxml]."""
    return _switch("polyframe", on)


def set_display(double=None, flip=None, colorize=None):
    """Display Properties: Double off reveals holes and flipped faces (Pavlovich n5 00:34:20;
    Drust PrFQXjs_6_w 00:03:26 inspects with Double on). colorize: Tool > Polypaint >
    Colorize of the ACTIVE SubTool; the previous value comes back as "colorize_was" so the
    caller restores it after the review sheet. Colorize is not only a display switch: a
    later DynaMesh keeps polypaint instead of polygroups while it is on, and Project All
    moves colour only while it is on for source and target (see dynamesh_keep and
    project_stack)."""
    out = {}
    if double is not None:
        out["double"] = _switch("display_double", double)
    if flip is not None:
        out["flip"] = _switch("display_flip", flip)
    if colorize is not None:
        out["colorize_was"] = bool(_get("colorize", 0.0) >= 0.5)
        out["colorize"] = _switch("colorize", colorize)
    return out


def _bbox(mode=1):
    return [float(v) for v in _z().query_mesh3d(2, mode)]


def _extent_ratio(b0, b1):
    ext0 = [b0[3] - b0[0], b0[4] - b0[1], b0[5] - b0[2]]
    ext1 = [b1[3] - b1[0], b1[4] - b1[1], b1[5] - b1[2]]
    return round(min(a / b for a, b in zip(ext1, ext0) if b), 5)


def preflight(target_size=None, axis=1):
    """Everything to read before touching topology: counts, levels, internal size, Export
    Scale and offsets, UVs, symmetry, SubTool names. Flags carry their source."""
    z = _z()
    s = zb_ops.stats()
    out = {"stats": s, "xyz_size": _get("xyz_size"),
           "size": {a: _get(a + "_size", 0.0) for a in ("x", "y", "z")},
           "export": {"scale": _get("exp_scale"), "x_off": _get("exp_xoff"),
                      "y_off": _get("exp_yoff"), "z_off": _get("exp_zoff")},
           "symmetry": {"on": z.get(zb_ops.resolve("symmetry")),
                        "x": z.get(zb_ops.resolve("sym_x"))}}
    rows = subtool_table(with_counts=False)
    out["subtools"] = rows
    out["names"] = names_report([r["name"] for r in rows])
    flags = []
    if (s.get("points") or 0) > 8_000_000:
        flags.append("ZRemesher input above about 8M vertices: use a lower level or a reduced "
                     "copy (ZRemesher doc, High Polycounts)")
    xyz = out["xyz_size"] or 0
    if not 1.0 <= xyz <= 4.0:
        flags.append(f"XYZ Size {xyz:.3f} outside 1 to 4: DynaMesh resolution and dynamic "
                     "brushes misbehave (Gallagher EXjfH_X2hkM 00:28:23)")
    if not out["export"]["scale"]:
        flags.append("Export Scale 0: never set or imported (Gallagher 00:24:03)")
    if target_size and xyz:
        ext = s["bbox"][axis + 3] - s["bbox"][axis] if s.get("bbox") else None
        if ext:
            out["real_size_now"] = round(ext * (out["export"]["scale"] or 1.0), 6)
            out["scale_for_target"] = round(export_scale_for(target_size, ext), 6)
    if not out["names"]["ok"]:
        flags.append("SubTool names not unique or not alphanumeric: GoZ and Decimation Master "
                     "need unique names (GoZ doc, Restrictions)")
    out["flags"] = flags
    return out


def remesh_input(method="auto", max_points=2_000_000, level=None, resolution=None,
                 fill_holes=False):
    """Build the ZRemesher input on a DUPLICATE; the original stays the projection source
    (Maxon ZRemesher doc, Transferring Detail; Drust R2MzFqWMaWY 00:00:56).
    method "level": duplicate, go to `level` (or the highest level under max_points), delete
    the other levels. "dynamesh": duplicate, DynaMesh at `resolution` (or the one expected to
    give max_points, DYNAMESH_K). "auto": level when the SubTool has levels, else dynamesh.
    fill_holes: Close Holes then Fix Mesh on the level-less copy (ZRemesher doc, Workflow
    step 2 and Tips: small holes survive retopology and inflate the count). Use it when the
    holes are unintended (scans, AI meshes, sculpting fallout); it also fills intended
    openings (eye sockets, mouth bag), and so does DynaMesh. "openings_closed" in the result
    tells the hole gate what to expect: 0 holes when True, else the intended openings.
    Returns the source and copy indices. The copy lands below the source (SubTool doc)
    [verify index]."""
    z = _z()
    zb_ops.ensure_edit()
    src = z.get_active_subtool_index()
    s0 = zb_ops.stats()
    has_levels = (s0.get("sdiv_max") or 1) > 1
    if method == "auto":
        method = "level" if has_levels else "dynamesh"
    n0 = z.get_subtool_count()
    z.press(zb_ops.resolve("duplicate"))
    z.update(redraw_ui=True)
    if z.get_subtool_count() != n0 + 1:
        raise ZBOpError("Duplicate did not add a SubTool (Edit mode on? usd-portal note)")
    copy = src + 1
    z.select_subtool(copy)
    out = {"source": src, "copy": copy, "method": method, "points_source": s0.get("points")}
    if method == "level":
        sdiv = zb_ops.resolve("sdiv")
        top = int(z.get_max(sdiv))
        if level is None:
            level = 1
            for lv in range(top, 0, -1):
                z.set(sdiv, lv)
                if int(z.query_mesh3d(0)[0]) <= max_points:
                    level = lv
                    break
        z.set(sdiv, level)
        out["level"] = level
        out["del_levels"] = zb_ops.del_levels()
    elif method == "dynamesh":
        if has_levels:
            sdiv = zb_ops.resolve("sdiv")
            z.set(sdiv, z.get_max(sdiv))     # keep the most detailed level for DynaMesh
            zb_ops.del_levels()
        if resolution is None:
            resolution = resolution_for_points(float(z.get_polymesh3d_area()), max_points)
        out["resolution"] = resolution
        out["dynamesh"] = zb_ops.dynamesh(resolution)
    else:
        raise ValueError("method must be auto, level or dynamesh")
    if fill_holes:
        out["close_holes"] = close_holes()
        out["fix_mesh"] = fix_mesh()
    out["openings_closed"] = method == "dynamesh" or bool(fill_holes)
    out["solid_copy"] = bool(z.is_polymesh3d_solid())
    out["points_copy"] = int(z.query_mesh3d(0)[0])
    set_visible(src, False)
    return out


def zremesh(target_k, symmetric, axis="x", adaptive=True, adaptive_size=None, keep_groups=None,
            smooth_groups=None, freeze_border=None, freeze_groups=None, curves_strength=None,
            use_polypaint=None, color_density=None, keep_creases=None, detect_edges=None,
            mode=None):
    """ZRemesher with the symmetry state set ON PURPOSE (required argument): with symmetry on,
    ZRemesher remeshes half and mirrors it, a silent Mirror And Weld that ruins posed or
    asymmetric meshes (Drust Kjce71jjWJU 00:01:11). Wraps zb_ops.zremesher and adds Smooth
    Groups (0 holds clean borders, 1 for ragged DynaMesh groups: Drust 8D-xqasgUws 00:02:17),
    Freeze Border, Curves Strength, polypaint density, the shrink ratio and the band check.
    With mode None, Half, Same and Double are switched off so the typed target counts
    (Pavlovich n5 00:16:26: "turn off Same to type a count").
    Not reachable from here: Alt+ZRemesher (the alternative midline algorithm, ZRemesher doc
    Symmetry; Pavlovich n5 00:48:31) is a modifier click and zbc.press() takes no modifier
    (SDK stub). Ask a computer-use agent for that variant and compare both with topo_report
    (centre_line_components, symmetry) on the same view of nape and brow."""
    z = _z()
    sym = zb_ops.set_symmetry(bool(symmetric), axis)
    for key, val, tol in (("zr_smooth_groups", smooth_groups, 0.01),
                          ("zr_curves_strength", curves_strength, 0.5),
                          ("zr_color_density", color_density, 0.01)):
        if val is not None:
            zb_ops.set_checked(P(key), val, tol=tol)
    for key, val in (("zr_freeze_border", freeze_border), ("zr_freeze_groups", freeze_groups),
                     ("zr_use_polypaint", use_polypaint)):
        if val is not None:
            _switch(key, val)
    if mode is None:
        for k in ("zr_half", "zr_same", "zr_double"):
            if zb_ops.resolve(k, required=False):
                zb_ops.set_checked(k, 0, tol=0.5)
    b0 = _bbox(1)
    faces0 = int(z.query_mesh3d(1)[0])
    r = zb_ops.zremesher(target_k, adaptive=adaptive, adaptive_size=adaptive_size,
                         keep_groups=keep_groups, mode=mode, keep_creases=keep_creases,
                         detect_edges=detect_edges)
    r["symmetry"] = sym
    r["shrink"] = _extent_ratio(b0, _bbox(1))
    # ZRemesher, Smooth Groups, density and smoothing passes all shrink the surface: project
    # back once at level 1 before judging it (Pavlovich n5 00:22:05, 01:03:12):
    # project_stack(copy, source, levels=0). Threshold 0.1 percent [added].
    r["snap_back"] = r["shrink"] is not None and r["shrink"] < 0.999
    if mode in ("half", "same", "double"):
        r["target"] = faces0 * {"half": 0.5, "same": 1.0, "double": 2.0}[mode]
        r["ratio_to_target"] = r["faces_after"] / r["target"] if r["target"] else None
    r["band"] = expected_band(adaptive is not False, bool(keep_groups), bool(freeze_border))
    ratio = r.get("ratio_to_target")
    r["in_band"] = ratio is not None and r["band"][0] <= ratio <= r["band"][1]
    return r


RETRY_OK = {"target_k", "adaptive", "adaptive_size", "curves_strength", "freeze_border",
            "freeze_groups", "detect_edges", "use_polypaint", "color_density", "symmetric",
            "keep_polypaint"}


def retry(**changes):
    """Retry reuses the ZRemesher cache after target, Adapt, Adaptive Size, curves and Curves
    Strength, Freeze Border, Freeze Groups, Detect Edges, Use Polypaint, Keep Polypaint and
    global symmetry changes; Keep Groups, Keep Creases, Smooth Groups or any sculpt force a
    full run (ZRemesher 4.0, Fast Retry Requirements). Refuses the cache-breaking ones."""
    bad = sorted(set(changes) - RETRY_OK)
    if bad:
        raise ValueError(f"{bad} discard the Retry cache: run zremesh() again instead "
                         "(ZRemesher 4.0 doc)")
    z = _z()
    if "symmetric" in changes:
        zb_ops.set_symmetry(bool(changes["symmetric"]))
    if "target_k" in changes:
        zb_ops.set_checked("zr_target", changes["target_k"], tol=0.01)
    for key, zkey in (("adaptive", "zr_adapt"), ("detect_edges", "zr_detect_edges")):
        if key in changes:
            zb_ops.set_checked(zkey, 1 if changes[key] else 0, tol=0.5)
    if "adaptive_size" in changes:
        zb_ops.set_checked("zr_adaptive_size", changes["adaptive_size"], tol=0.5)
    for key, pkey in (("freeze_border", "zr_freeze_border"), ("freeze_groups", "zr_freeze_groups"),
                      ("use_polypaint", "zr_use_polypaint"), ("keep_polypaint", "zr_keep_polypaint")):
        if key in changes:
            _switch(pkey, changes[key])
    for key, pkey, tol in (("curves_strength", "zr_curves_strength", 0.5),
                           ("color_density", "zr_color_density", 0.01)):
        if key in changes:
            zb_ops.set_checked(P(pkey), changes[key], tol=tol)
    t = time.time()
    _press("zr_retry")
    return {"changes": changes, "faces_after": int(z.query_mesh3d(1)[0]),
            "seconds": round(time.time() - t, 2)}


def freeze_levels():
    """Freeze SubDivision Levels: press at the highest level, change the base (ZRemesher,
    DynaMesh, ZModeler), press again to rebuild and reproject (Drust NrsuP4Vj4Lg 00:01:17 to
    00:02:26; ZRemesher doc recipe 1). If level 1 is too coarse: Del Lower at the level with
    the right silhouette first. The level count may change."""
    z = _z()
    before = zb_ops.stats()
    _press("freeze_sdiv")
    return {"before": before, "after": zb_ops.stats(), "state": z.get(zb_ops.resolve(P("freeze_sdiv")))}


def _colorize(indices, on=True):
    """Colorize (the SubTool's polypaint icon) on or off for several SubTools; returns the
    previous values. Project All moves colour only when it is on for source AND target
    (Drust PrFQXjs_6_w 00:16:35: "Projected color missing"; _ips3GhWI0s 00:05:57: turn on the
    target's polypaint at the last level)."""
    z = _z()
    active = z.get_active_subtool_index()
    was = {}
    try:
        for i in indices:
            z.select_subtool(int(i))
            was[int(i)] = bool(_get("colorize", 0.0) >= 0.5)
            _switch("colorize", on)
    finally:
        z.select_subtool(active)
    return was


def _divide_checked(target_index):
    """One Divide that must add a level. Divide adds a level only when nothing is masked or
    hidden (Projection and Subdivision doc), and the SDK cannot read masks (lead skill), so a
    silent no-op is caught here by the level count."""
    before = zb_ops.stats().get("sdiv_max") or 1
    zb_ops.divide(1)
    after = zb_ops.stats().get("sdiv_max") or 1
    if after <= before:
        raise ZBOpError(f"Divide added no level on SubTool {target_index}: something is masked "
                        "or hidden (Projection doc). Clear it, or protect zones with "
                        "order='top_first' (mask after the divisions)")
    return after


def morph_target_present():
    """True when a morph target is stored on the active SubTool: Tool > Morph Target > DelMT
    is enabled only then [verify, live_rx_02]."""
    p = zb_ops.resolve("del_mt", required=False)
    return bool(p and _z().is_enabled(p))


def drop_morph_target():
    """DelMT after the projection gate passes. Maps compare the top level "to either a Morph
    target or the subdivision level you currently have selected" (Drust 2zDAtaQqwh8
    00:01:44), so a morph target left from projection may become the map base [verify]."""
    if not morph_target_present():
        return {"deleted": False}
    _press("del_mt", check_enabled=False)
    return {"deleted": True, "still_present": morph_target_present()}


def safety_nets(store_mt=True, layer=True):
    """At the TOP level, before Project All: a morph target (the Morph brush or Switch paints
    back to the clean surface) and a new 3D layer (toggle it to compare, dial it to soften),
    the FlippedNormals order (Zp07GW3rND0 00:02:13: "It's important that you do all of this
    on the highest level"). The lead's zb_ops.top_level, store_morph_target and new_layer do
    the work (a morph target is tied to its level and destroyed by any point-count change,
    so this comes after the last Divide). Used on its own before masking danger zones;
    otherwise zb_ops.project_all sets the nets itself."""
    lv = zb_ops.top_level()
    return {"level": lv.get("top"),
            "morph_target": zb_ops.store_morph_target() if store_mt else {"stored": False},
            "layer": zb_ops.new_layer() if layer else {"created": False}}


def protect_isolated(grow=1):
    """Mask a zone before Project All so it keeps its pre-projection surface. Precondition: only
    the zone is visible on the target, e.g. the eye-interior polygroup isolated by a human or
    computer-use agent with Ctrl+Shift click (no SDK call selects a polygroup). Grows the
    visibility `grow` times so the mask reaches just past the lid, MaskAll, shows everything
    again (FlippedNormals Zp07GW3rND0 00:05:31 to 00:06:03; their agent translation). Project
    All then skips the masked zone (Drust nxMYYsyJt3o 00:06:09: only unmasked areas project).
    Masks block Divide, so use it after the divisions: project_stack(order="top_first",
    stop_after="nets"), protect, then project_levels(..., nets_done=True). Mask state is not
    readable [verify that MaskAll masks only the visible part]."""
    for _ in range(int(grow)):
        zb_ops.visibility("grow")
    zb_ops.mask("all")
    zb_ops.visibility("show")
    return {"grow": grow, "mask": "visible zone masked, all shown"}


def _need_checkpoint(checkpoint):
    if checkpoint is None:
        raise ZBOpError("projection needs checkpoint='/abs/name.ztl' (a versioned save before each "
                        "Project All, zb_ops.project_all) or checkpoint=False right after a save")


def _pass(level, dist, mean, pa_blur, checkpoint, store_mt, layer):
    """One Project All through the lead's safe zb_ops.project_all (versioned checkpoint, nets at
    the top when asked, Dist, gate: points kept, no vertex outside the visible bbox)."""
    r = zb_ops.project_all(dist=dist, mean=mean, pa_blur=pa_blur, checkpoint=checkpoint,
                           store_mt=store_mt, layer=layer, level=level, exclusive=True)
    s = zb_ops.stats()
    g = r.get("gate") or {}
    return {"level": level, "points": s.get("points"), "bbox": s.get("bbox"),
            "gate_ok": g.get("ok", True), "problems": g.get("problems", []),
            "warnings": g.get("warnings", []), "repair": r.get("repair"),
            "morph_target": (r.get("morph_target") or {}).get("stored"),
            "layer": (r.get("layer") or {}).get("created"),
            "volume_before": r.get("volume_before"), "volume_after": r.get("volume_after")}


def project_levels(target, source, from_level=1, dist=0.1, mean=None, pa_blur=0.0,
                   color_last=False, color_switch=True, geometry=True, checkpoint=None,
                   nets_done=False):
    """Project All at every level from `from_level` to the top of an EXISTING stack
    (FlippedNormals' staged variant, Zp07GW3rND0 00:03:17: gross mismatches fixed low, then up
    a level at a time). Each pass is the lead's zb_ops.project_all. The first pass sets the
    safety nets at the top (morph target + layer) unless nets_done; later passes keep them,
    so the morph target stays the clean pre-projection surface and one layer records all.
    Colour on the last pass only, with Colorize on for source and target.
    geometry=False: a colour-only pass from a DIFFERENT source (the raw duplicate of a scan or
    AI mesh, whose noise must not come back): the Project "Geometry" switch goes off for the
    pass [verify that Project All honours it; PROJ ties the switch to Project History].
    Fallback when it does not: StoreMT at the top, project, Tool > Morph Target > Switch back
    to the stored shape (morph targets hold positions, not polypaint) [verify], DelMT."""
    _need_checkpoint(checkpoint)
    z = _z()
    show_only([target, source])
    z.select_subtool(target)
    sdiv = zb_ops.resolve("sdiv")
    top = int(z.get_max(sdiv))
    color_path = zb_ops.resolve(P("proj_color"), required=False) if color_switch else None
    if color_path:
        z.set(color_path, 0)
    geo_path = None
    if not geometry:
        geo_path = zb_ops.resolve(P("proj_geometry"), required=False)
        if geo_path is None:
            raise ZBOpError("no Project Geometry switch in this build: use the morph-target "
                            "fallback for a colour-only pass (see docstring)")
        z.set(geo_path, 0)
    passes, colour = [], None
    first = not nets_done
    try:
        for lv in range(int(from_level), top + 1):
            if color_last and lv == top:
                colour = _colorize([source, target], True)
                if color_path:
                    z.set(color_path, 1)
            z.set(sdiv, lv)
            passes.append(_pass(lv, dist, mean, pa_blur, checkpoint, first and geometry,
                                first and geometry))
            first = False
    finally:
        if geo_path:
            z.set(geo_path, 1)
    return {"passes": passes, "colorize_was": colour, "top": top, "geometry": geometry}


def project_stack(target, source, levels=None, top_ratio=0.5, max_levels=7, dist=0.1, mean=None,
                  pa_blur=0.0, store_mt=True, project_level1=True, color_last=False,
                  color_switch=True, shell=None, order="per_level", layer=None, stop_after=None,
                  checkpoint=None):
    """Rebuild `target`'s subdivision stack from `source` (SubTool indices; re-read them by
    name with index_of() after any split, merge or duplicate). Every pass is the lead's safe
    zb_ops.project_all: checkpoint is required (a versioned ZTL path, or False right after a
    save), only source and target visible (exclusive), Dist 0.1 (Drust nxMYYsyJt3o 00:02:19),
    a gate per pass (points kept, nothing outside the visible bbox) with its repair advice.
    - order "per_level" (Drust, Maxon Transferring Detail): project at level 1 (restores
      volume after ZRemesher: Pavlovich n5 00:22:05), then Divide + Project All per level
      until the top holds top_ratio x the source points. A morph target dies with every
      Divide (Morph Targets doc), so each pass stores one; the layer goes on the last pass
      only. levels=0 is the snap-back pass after a ZRemesher or smoothing pass.
    - order "top_first" (FlippedNormals Zp07GW3rND0 00:02:13): all divisions first, then the
      nets at the top (one morph target, one recording layer), then Project All from level 1
      up. To protect danger zones: stop_after="nets", mask with protect_isolated(), then
      project_levels(..., nets_done=True).
    - Geometry first, colour only at the last pass with Colorize on for BOTH SubTools (Drust
      _ips3GhWI0s 00:05:57; PrFQXjs_6_w 00:16:35); color_switch keeps the Project "Color"
      switch off before [verify it governs Project All].
    - shell: ProjectionShell for very different shapes; Inner turns on and Dist goes to 1
      (Gaboury pQbPtH0p5Bg 00:02:30 to 00:03:02).
    - A Divide that adds no level (mask or hidden part) raises instead of projecting on the
      wrong level.
    Returns per-level numbers and gates, the level-1 point count before and after, and
    whether a morph target is left (drop_morph_target before maps)."""
    if order not in ("per_level", "top_first"):
        raise ValueError("order: per_level or top_first")
    _need_checkpoint(checkpoint)
    z = _z()
    z.select_subtool(source)
    src = zb_ops.stats()
    show_only([target, source])
    z.select_subtool(target)
    t0 = zb_ops.stats()
    if (t0.get("sdiv_max") or 1) > 1:
        raise ZBOpError("target already has levels: start from the level-less remesh, or use "
                        "freeze_levels() for an existing stack")
    l1 = t0["points"]
    out = {"source": source, "target": target, "order": order, "source_points": src.get("points"),
           "source_volume": src.get("volume"), "source_bbox": src.get("bbox"),
           "level1_points_before": l1, "passes": []}
    if shell is not None:
        zb_ops.set_checked(P("proj_shell"), shell, tol=0.5)
        dist = 1.0
    n = levels if levels is not None else levels_needed(l1, src["points"], top_ratio, max_levels)
    out["divisions"] = n
    if order == "top_first":
        for _ in range(n):
            _divide_checked(target)
        if stop_after == "nets":
            out["nets"] = safety_nets(store_mt=store_mt, layer=True if layer is None else layer)
            out["stopped"] = "after safety nets: protect zones, then project_levels(nets_done=True)"
            return out
        pl = project_levels(target, source, 1, dist, mean, pa_blur, color_last, color_switch,
                            checkpoint=checkpoint)
        out["passes"] = pl["passes"]
        out["colorize_was"] = pl["colorize_was"]
    else:
        color_path = zb_ops.resolve(P("proj_color"), required=False) if color_switch else None
        if color_path:
            z.set(color_path, 0)
        want_layer = True if layer is None else bool(layer)
        if project_level1:
            out["passes"].append(_pass(1, dist, mean, pa_blur, checkpoint, store_mt,
                                       want_layer and n == 0))
        for k in range(n):
            last = k == n - 1
            if color_last and last:
                out["colorize_was"] = _colorize([source, target], True)
                if color_path:
                    z.set(color_path, 1)
            lv = _divide_checked(target)
            out["passes"].append(_pass(int(lv), dist, mean, pa_blur, checkpoint, store_mt,
                                       want_layer and last))
    sdiv = zb_ops.resolve("sdiv")
    top = z.get_max(sdiv)
    z.set(sdiv, 1)
    out["level1_points_after"] = int(z.query_mesh3d(0)[0])
    z.set(sdiv, top)
    last = zb_ops.stats()
    out["top_points"] = last.get("points")
    out["top_volume"] = last.get("volume")
    out["top_bbox"] = last.get("bbox")
    out["morph_target_left"] = morph_target_present()
    out["pass_problems"] = [f"level {p['level']}: {q}" for p in out["passes"] for q in p["problems"]]
    if src.get("volume") and last.get("volume"):
        out["volume_ratio"] = round(last["volume"] / src["volume"], 5)
    return out


def uv_state():
    """UV bbox (query_mesh3d 3), tiles (4 and 5), polygons and area per tile (6, 7), UV Map
    Size. Reads only."""
    z = _z()
    out = {"uv_map_size": _get("uv_size", 0.0)}
    try:
        out["uv_bbox"] = [round(float(v), 6) for v in z.query_mesh3d(3)]
    except Exception:
        out["uv_bbox"] = None
    tiles = zb_ops._uv_tiles(z) if out["uv_bbox"] is not None else None
    out["tiles"] = []
    for t in tiles or []:
        row = {"tile": t}
        try:
            row["polygons"] = int(z.query_mesh3d(6, t)[0])
            row["area"] = round(float(z.query_mesh3d(7, t)[0]), 6)
        except Exception:
            pass
        out["tiles"].append(row)
    return out


def _lowest_level():
    z = _z()
    p = zb_ops.resolve("sdiv", required=False)
    if p and z.get_max(p) > 1:
        prev = z.get(p)
        z.set(p, 1)
        return p, prev
    return None, None


def unwrap_creases(symmetry=True, from_polygroups=True, delete_existing=True):
    """Native unwrap with explicit seams (Pavlovich cvqoVUX5aBw 00:03:49 to 00:08:11): UnCrease
    All, Crease PG (seams on polygroup borders), Create (Unwrap) with Creased Edges, Unwrap.
    Creases do nothing until the next Unwrap. Runs at the lowest level; the label is "Creased
    Edges" [uistr]. Hands and tails need extra creases (ZModeler Crease Shortest Path: human)."""
    z = _z()
    p, prev = _lowest_level()
    t = time.time()
    try:
        if delete_existing and uv_state()["uv_bbox"] is not None:
            _press("uv_delete", check_enabled=False)
        if from_polygroups:
            _press("uncrease_all", check_enabled=False)
            _press("crease_pg", check_enabled=False)
        if zb_ops.resolve("uv_auto_seams", required=False):
            zb_ops.set_checked("uv_auto_seams", 0, tol=0.5)
        _switch("uv_creased_edges", True)
        if zb_ops.resolve("uv_symmetry", required=False):
            zb_ops.set_checked("uv_symmetry", 1 if symmetry else 0, tol=0.5)
        zb_ops.press("uv_unwrap")
        z.update(redraw_ui=True)
    finally:
        if p:
            z.set(p, prev)
    return {"seconds": round(time.time() - t, 2), **uv_state()}


def uvmaster_roundtrip(symmetry=True, polygroups=True, attract_ao=False, max_polys=150_000):
    """UV Master on a subdivided SubTool: Work On Clone, Unwrap, Copy UVs, back to the
    original Tool and SubTool, Paste UVs (Gaboury cemmalvugFk 00:04:00 to 00:07:28). Under
    100k to 150k polygons (UV Master doc 7). AttractFromAmbientOccl pulls seams into hidden
    areas without painting (UV Master doc). Plugin presses: whether control returns to Python
    is [verify] (live_08 of scenario-zbrush-expert, live_rx_03)."""
    z = _z()
    tool0, sub0 = z.get_active_tool_index(), z.get_active_subtool_index()
    p, prev = _lowest_level()
    faces = int(z.query_mesh3d(1)[0])
    if faces > max_polys:
        if p:
            z.set(p, prev)
        raise ZBOpError(f"{faces} polygons at the lowest level > {max_polys}: UV Master slows "
                        "down past 100k to 150k (UV Master doc); ZRemesh lower or use native")
    for key, val in (("uvm_symmetry", symmetry), ("uvm_polygroups", polygroups)):
        if zb_ops.resolve(key, required=False):
            zb_ops.set_checked(key, 1 if val else 0, tol=0.5)
    t = time.time()
    zb_ops.press("uvm_clone", check_enabled=False)
    clone_tool = z.get_active_tool_index()
    if attract_ao:
        _press("uvm_ao_attract", check_enabled=False)
    zb_ops.press("uvm_unwrap", check_enabled=False)
    _press("uvm_copy", check_enabled=False)
    z.select_tool(tool0)
    z.select_subtool(sub0)
    _press("uvm_paste", check_enabled=False)
    if p:
        z.set(p, prev)
    return {"clone_tool": clone_tool, "clone_path": z.get_tool_path(clone_tool),
            "seconds": round(time.time() - t, 2), **uv_state()}


def _no_morph_target(allow):
    """Refuse a bake while a morph target is stored, unless allowed: the map may be computed
    against it instead of the selected level (Drust 2zDAtaQqwh8 00:01:44) [verify]."""
    if not allow and morph_target_present():
        raise ZBOpError("a morph target is stored (StoreMT from projection): drop_morph_target() "
                        "before baking, or pass allow_morph_target=True on purpose")


def bake_normal_map(path, level=1, tangent=True, flip_g=None, adaptive=False, smooth_uv=None,
                    overwrite=False, allow_morph_target=False):
    """One SubTool: Tool > Normal Map at `level` against the top (the level filters the
    frequencies: level 1 forms and wrinkles, max-1 micro detail only: Drust 2zDAtaQqwh8
    00:02:53 to 00:04:00), Clone NM, Texture:Export. Size = Tool > UV Map > UV Map Size.
    Same-SubTool rule: the low and the high cannot be two SubTools (Drust n0qqpwvn-jA
    00:01:14). The SDK create_normal_map() defaults to world space (local_coordinates=False);
    this palette route sets Tangent explicitly. Clone and export [verify]."""
    _no_morph_target(allow_morph_target)
    z = _z()
    sdiv = zb_ops.resolve("sdiv")
    prev = z.get(sdiv)
    z.set(sdiv, level)
    try:
        _switch("nm_tangent", tangent)
        _switch("nm_adaptive", adaptive)
        if smooth_uv is not None:
            _switch("nm_smooth_uv", smooth_uv)
        if flip_g is not None:
            _switch("nm_flip_g", flip_g)
        _press("nm_create")
        _press("nm_clone", check_enabled=False)
        res = zb_ops._file_op(P("texture_export"), path, overwrite)
    finally:
        z.set(sdiv, prev)
    res.update({"level": level, "tangent": tangent, "flip_g": flip_g})
    return res


def bake_displacement_map(path, mid=0.5, scale=1.0, bits32=True, adaptive=False, dpsubpix=0,
                          smooth_uv=None, three_channels=False, overwrite=False,
                          allow_morph_target=False):
    """One SubTool: Tool > Displacement Map at level 1 (SDK: the tool must be at the lowest
    level), Create And Export Map with the name preset. 32-bit with Scale 1; Mid 0 per the MME
    doc or 0.5 with the renderer zero value matched (FlippedNormals -ThBTEc8L_M 00:10:01).
    Adaptive off and DPSubPix 0 (FlippedNormals 00:08:12, 00:08:45). [verify] dialog-free."""
    _no_morph_target(allow_morph_target)
    z = _z()
    sdiv = zb_ops.resolve("sdiv")
    prev = z.get(sdiv)
    z.set(sdiv, 1)
    try:
        _switch("dm_32bit", bits32)
        zb_ops.set_checked(P("dm_mid"), mid * 100.0 if mid <= 1.0 else mid, tol=0.6)
        if bits32:
            zb_ops.set_checked(P("dm_scale"), scale, tol=1e-3)
        _switch("dm_adaptive", adaptive)
        zb_ops.set_checked(P("dm_dpsubpix"), dpsubpix, tol=0.5)
        _switch("dm_3ch", three_channels, required=False)
        if smooth_uv is not None:
            _switch("dm_smooth_uv", smooth_uv)
        res = zb_ops._file_op(P("dm_create_export"), path, overwrite)
    finally:
        z.set(sdiv, prev)
    res.update({"mid": mid, "scale": scale, "bits32": bits32})
    return res


def _mme_items(settings):
    """Accept a preset name, {(group, label): v} or the JSON form {"group:label": v} with
    "main" for the main panel (what travels through the bridge)."""
    if isinstance(settings, str):
        settings = MME_PRESETS[settings]
    items = []
    for key, value in settings.items():
        if isinstance(key, str):
            g, label = key.split(":", 1)
            key = (None if g == "main" else g, label)
        items.append((key, value))
    return items


def mme_set(settings):
    """Apply MME settings (a preset name such as "arnold", {(group, label): value} or
    {"group:label": value}). Values are read back; the path that took each value is returned
    (grouped forms first because short labels repeat across groups) [verify all, live_rx_03]."""
    out = {}
    for (group, label), value in _mme_items(settings):
        cands = mme_path(label, group)
        p = zb_ops.resolve(cands)
        tol = 0.5 if isinstance(value, bool) or value in (0, 1) else max(0.01, abs(value) * 1e-3)
        out[f"{group or 'main'}:{label}"] = {"path": p,
                                             "value": zb_ops.set_checked([p], float(value), tol=tol)}
    return out


def mme_create_all(out_dir, base_name="maps", settings=None, timeout_hint_s=600,
                   allow_morph_target=False):
    """Create All Maps with a name preset, then list the files that appeared. Back up the ZTL
    first and never interrupt: ESC during a bake can lose UVs (MME doc, Warning). A plugin
    press: control return is [verify] (a ZScript that pressed plugin buttons lost control,
    ZBrushCentral). Adaptive off keeps 100 UDIMs near 1 h instead of 24 h (FlippedNormals
    -ThBTEc8L_M 00:08:45). Refuses while the active SubTool holds a morph target (MME runs
    over every SubTool; drop_morph_target() on each projected one first)."""
    _no_morph_target(allow_morph_target)
    z = _z()
    out_dir = os.path.abspath(os.path.expanduser(out_dir))
    os.makedirs(out_dir, exist_ok=True)
    applied = mme_set(settings) if settings else {}
    before = set(os.listdir(out_dir))
    t0 = time.time()
    z.set_next_filename(os.path.join(out_dir, base_name))
    zb_ops.press(mme_path("Create All Maps"), check_enabled=False)
    z.update(redraw_ui=True)
    new = sorted(set(os.listdir(out_dir)) - before)
    return {"dir": out_dir, "files": new, "seconds": round(time.time() - t0, 1),
            "preset_consumed": not z.has_next_filename(), "applied": applied,
            "timeout_hint_s": timeout_hint_s}


def set_export_switches(quads=True, uvs=True, groups=False, merge_uv=False, flip=False,
                        smooth_normals=None):
    """Tool > Export switches, read back. Grp off for Maya: OBJ groups split the mesh there
    (FlippedNormals -ThBTEc8L_M 00:15:08); Grp on only for a topology-QA copy (per-group
    audit). Qud for rigging, Tri for a game mesh baked as triangles (Polycount). Txr keeps UVs.
    Qud and Tri behave as a pair [verify]."""
    z = _z()
    on_key, off_key = ("exp_qud", "exp_tri") if quads else ("exp_tri", "exp_qud")
    out = {on_key[4:]: _switch(on_key, True)}
    p_off = zb_ops.resolve(P(off_key), required=False)
    if p_off and z.get(p_off) >= 0.5:
        z.set(p_off, 0)
    out[off_key[4:]] = z.get(p_off) if p_off else None
    out.update({"txr": _switch("exp_txr", uvs), "grp": _switch("exp_grp", groups),
                "mrg": _switch("exp_mrg", merge_uv), "flp": _switch("exp_flp", flip)})
    if smooth_normals is not None:
        out["smooth_normals"] = _switch("exp_snormals", smooth_normals)
    return out


def set_export_scale(target_size, axis=1, all_subtools=True, feet_on_ground=True,
                     center_xz=True):
    """Export Scale and offsets so the exported model measures `target_size` along `axis`
    (destination units: cm for Maya and Unreal, m for Unity and Blender [added]).
    Export Scale and offsets live per SubTool (SubTool Master ScaleOffset resets them "for all
    SubTools", doc), so with all_subtools the SAME values, computed from the full bbox of all
    SubTools, go on every SubTool and the parts stay registered [added]."""
    z = _z()
    bbox = _bbox(3 if all_subtools else 1)
    ext = bbox[axis + 3] - bbox[axis]
    scale = export_scale_for(target_size, ext)
    offs = placement_offsets(bbox, feet_on_ground, center_xz)
    active = z.get_active_subtool_index()
    targets = range(z.get_subtool_count()) if all_subtools else [active]
    done = []
    try:
        for i in targets:
            z.select_subtool(i)
            zb_ops.set_checked(P("exp_scale"), scale, tol=max(1e-6, scale * 1e-4))
            for a in ("x", "y", "z"):
                zb_ops.set_checked(P(f"exp_{a}off"), offs[a], tol=1e-4)
            done.append(i)
    finally:
        z.select_subtool(active)
    return {"bbox_internal": bbox, "extent": ext, "scale": scale, "offsets": offs,
            "subtools": done, "expected_size": target_size}


def set_export_placement(feet_on_ground=True, center_xz=True, all_subtools=True):
    """Offsets only (keeps the current Export Scale)."""
    z = _z()
    bbox = _bbox(3 if all_subtools else 1)
    offs = placement_offsets(bbox, feet_on_ground, center_xz)
    active = z.get_active_subtool_index()
    try:
        for i in (range(z.get_subtool_count()) if all_subtools else [active]):
            z.select_subtool(i)
            for a in ("x", "y", "z"):
                zb_ops.set_checked(P(f"exp_{a}off"), offs[a], tol=1e-4)
    finally:
        z.select_subtool(active)
    return offs


def export_subtools(out_dir, only_visible=True, level="lowest", suffix="", overwrite=False,
                    indices=None):
    """One OBJ per SubTool, named after the SubTool (Maxon ex_mod_subtool_export pattern),
    at the lowest level by default: the exchange mesh (Subdivision doc; GoZ sends the lowest
    level too). zb_ops.export_obj is dialog-free [bridge v03] and keeps a .bak of any file
    it replaces."""
    z = _z()
    out_dir = os.path.abspath(os.path.expanduser(out_dir))
    rows = subtool_table(with_counts=False)
    active = z.get_active_subtool_index()
    files = []
    try:
        for r in rows:
            if indices is not None and r["index"] not in indices:
                continue
            if only_visible and not r["visible"]:
                continue
            z.select_subtool(r["index"])
            p, prev = _lowest_level() if level == "lowest" else (None, None)
            try:
                res = zb_ops.export_obj(os.path.join(out_dir, f"{r['name']}{suffix}.obj"), overwrite)
            finally:
                if p:
                    z.set(p, prev)
            res.update({"index": r["index"], "name": r["name"]})
            files.append(res)
    finally:
        z.select_subtool(active)
    return files


def decimate_copy(target_points=None, percent=None, keep_uvs=False, keep_polypaint=False,
                  freeze_borders=None):
    """Decimate a DUPLICATE, never the master (Decimation doc; Polycount: decimate the high
    before exporting it for a bake). Keep UVs costs 50 percent more memory (doc); Use and Keep
    Polypaint is off by default (Robinson bVX9utHc_ZI 00:01:17). Plugin presses [verify]."""
    z = _z()
    zb_ops.ensure_edit()
    src = z.get_active_subtool_index()
    n0 = z.get_subtool_count()
    z.press(zb_ops.resolve("duplicate"))
    if z.get_subtool_count() != n0 + 1:
        raise ZBOpError("Duplicate did not add a SubTool")
    z.select_subtool(src + 1)
    pts = int(z.query_mesh3d(0)[0])
    if percent is None:
        if target_points is None:
            raise ValueError("give target_points or percent")
        percent = percent_for_target(pts, target_points)
    if keep_polypaint is not None:
        _switch("dmx_keep_polypaint", keep_polypaint, required=False)
    if freeze_borders is not None:
        _switch("dmx_freeze_borders", freeze_borders, required=False)
    r = zb_ops.decimate(percent, preprocess=True, keep_uvs=keep_uvs)
    r.update({"source": src, "copy": src + 1, "points_before": pts})
    return r


def decimate_keep_groups(percent):
    """Decimation Master drops polygroups; recover them (Drust mRfA_WDvvrg 00:02:35 to 00:05:04):
    Unweld Groups Border, Freeze borders on, decimate, Auto Groups, WeldPoints; then check the
    mesh is closed again."""
    z = _z()
    solid0 = bool(z.is_polymesh3d_solid())
    _press("unweld_groups", check_enabled=False)
    _switch("dmx_freeze_borders", True)
    r = zb_ops.decimate(percent, preprocess=True)
    zb_ops.polygroups("auto")
    _press("weld_points", check_enabled=False)
    r.update({"solid_before": solid0, "solid_after": bool(z.is_polymesh3d_solid())})
    return r


def _ensure_on_canvas():
    """Draw the active tool and enter Edit mode when needed (v01 sequence, zb_ops.new_sphere)."""
    z = _z()
    if z.get("Transform:Edit") < 0.5:
        lc = zb_ops.resolve("layer_clear", required=False)
        if lc:
            z.press(lc)
        w, h = z.get("Document:Width"), z.get("Document:Height")
        z.canvas_click(w * 0.5, h * 0.5, w * 0.5, h * 0.85)
        z.set("Transform:Edit", 1)
    return zb_ops.ensure_edit()


def import_mesh(path, weld=None, tri2quad=None, fresh_tool=True, clear_mask=True):
    """Import an OBJ as its own tool: select Tool:PolyMesh3D, preset the name, Tool:Import
    (the batch pattern of cgside's ZScript) [verify that a fresh tool results]. Weld slider
    for duplicate points, Tri2Quad angle to rebuild quads from triangles (Import doc) [verify
    ranges]. The mask is cleared because a #MRGB mask byte may arrive [verify]."""
    z = _z()
    path = os.path.abspath(os.path.expanduser(path))
    if not os.path.isfile(path):
        raise ZBOpError(f"no file {path}")
    if fresh_tool and zb_ops.resolve(P("polymesh_star"), required=False):
        z.press(zb_ops.resolve(P("polymesh_star")))
    for key, val in (("imp_weld", weld), ("imp_tri2quad", tri2quad)):
        if val is not None:
            zb_ops.set_checked(P(key), val, tol=0.01)
    t0 = time.time()
    z.set_next_filename(path)
    zb_ops.press("import", check_enabled=False)
    z.update(redraw_ui=True)
    pending = z.has_next_filename()
    _ensure_on_canvas()
    if clear_mask:
        try:
            zb_ops.mask("clear")
        except ZBOpError:     # greyed out when nothing is masked
            pass
    s = zb_ops.stats()
    if pending:
        raise ZBOpError("the import preset is still pending: a dialog probably opened")
    return {"path": path, "seconds": round(time.time() - t0, 2), "stats": s,
            "tool": z.get_active_tool_path()}


def fix_mesh():
    """Mesh Integrity > Fix Mesh (repairs what other packages report as topology errors; doc).
    Check Mesh Integrity is not pressed here: it may report through a note [verify]; the
    agent measures with zb_audit on an OBJ export instead."""
    before = zb_ops.stats()
    _press("fix_mesh", check_enabled=False)
    return {"before": before, "after": zb_ops.stats()}


def close_holes():
    """Close Holes: only without subdivision levels (doc); fills get their own polygroup, the
    handle to delete fills that must stay open (Drust udiPVJIODX0 00:04:30)."""
    z = _z()
    s0 = zb_ops.stats()
    if (s0.get("sdiv_max") or 1) > 1:
        raise ZBOpError("Close Holes needs a SubTool without levels (doc): del_levels first")
    _press("close_holes", check_enabled=False)
    s1 = zb_ops.stats()
    return {"faces_before": s0.get("faces"), "faces_after": s1.get("faces"),
            "solid_before": s0.get("solid"), "solid_after": bool(z.is_polymesh3d_solid())}


def split_parts(auto_groups=True):
    """Every shell to its own SubTool: Auto Groups then Split To Parts (Split To Parts doc;
    fundamentals digest). Returns the new table with counts."""
    z = _z()
    n0 = z.get_subtool_count()
    if auto_groups:
        zb_ops.polygroups("auto")
    _press("split_parts", check_enabled=False)
    return {"subtools_before": n0, "subtools_after": z.get_subtool_count(),
            "table": subtool_table(with_counts=True)}


def hide_small_parts(min_frac=0.005, protect=(), protect_names=()):
    """Hide SubTools whose point count is below min_frac of the largest one (floating junk of
    scans and generated meshes, Drust PrFQXjs_6_w 00:10:33). Hiding instead of deleting: the
    Delete button asks for confirmation (shipped Delete macro answers it with IKeyPress);
    hidden parts stay out of Project All and exports with only_visible. Protect by NAME
    (protect_names): Split To Parts renumbers the list, so an index taken before the split
    points at a part afterwards."""
    rows = subtool_table(with_counts=True)
    biggest = max((r["points"] or 0) for r in rows) if rows else 0
    keep_names = set(protect_names)
    hidden = []
    for r in rows:
        if r["index"] in protect or r["name"] in keep_names:
            continue
        if biggest and (r["points"] or 0) < min_frac * biggest:
            set_visible(r["index"], False)
            hidden.append({"index": r["index"], "name": r["name"], "points": r["points"]})
    return {"largest_points": biggest, "hidden": hidden}


def merge_visible(weld=False, uv=True):
    """MergeVisible: all visible SubTools into a NEW Tool named Merged_<first> (doc); Weld
    welds border points that line up, UV merges UVs (FlippedNormals p56N-dN11zY 00:01:57:
    forgetting UV costs the setup). For exports (a decimated high for Painter). Not for the
    cleanup path: the working Tool, its colour source and its hidden parts stay behind; merge
    parts inside the Tool with merge_down_run()."""
    z = _z()
    for key, val in (("merge_weld", weld), ("merge_uv", uv)):
        _switch(key, val, required=False)
    n_tools = z.get_tool_count()
    _press("merge_visible", check_enabled=False)
    return {"tools_before": n_tools, "tools_after": z.get_tool_count(),
            "active_tool": z.get_active_tool_path()}


def color_to_groups(tolerance=None, merge_stray=True):
    """Polygroups From Polypaint, the stroke-free way to separate parts that differ in colour
    (typical of textured AI meshes) [added]; then Groups Split turns them into SubTools."""
    if tolerance is not None:
        zb_ops.set_checked(P("pg_tolerance"), tolerance, tol=0.01)
    _press("pg_from_polypaint", check_enabled=False)
    if merge_stray:
        _press("pg_merge_stray", check_enabled=False)
    return zb_ops.stats()


def polish_band(feature="groups", grow=1, value=10, passes=2):
    """Polish only a band around polygroup borders ("groups") or open borders ("border"), the
    button route of Pavlovich n5 00:07:48, 00:15:18, 00:44:36: Mask By Feature, Grow Mask,
    invert, Polish By Features, clear. Jagged group borders become jagged loops otherwise.
    The "closed circle keeps volume" curve switch has no known path [verify]."""
    _switch("mbf_border", feature == "border")
    _switch("mbf_groups", feature == "groups")
    _switch("mbf_crease", False, required=False)
    _press("mask_by_feature", check_enabled=False)
    for _ in range(int(grow)):
        zb_ops.mask("grow")
    zb_ops.mask("invert")
    v0 = _z().get_polymesh3d_volume()
    for _ in range(int(passes)):
        zb_ops.deform("Polish By Features", value)
    zb_ops.mask("clear")
    return {"volume_before": round(float(v0), 6),
            "volume_after": round(float(_z().get_polymesh3d_volume()), 6)}


def duplicate_keep():
    """Duplicate the active SubTool and return BOTH names and indices. The untouched copy is the
    projection source for form and colour (Drust PrFQXjs_6_w 00:01:15); keep it by name
    (index_of) because later splits and merges renumber the list. Edit mode is required
    (usd-portal note, zb_ops)."""
    z = _z()
    zb_ops.ensure_edit()
    src = z.get_active_subtool_index()
    name = _name_from_path(z.get_active_tool_path())
    n0 = z.get_subtool_count()
    z.press(zb_ops.resolve("duplicate"))
    z.update(redraw_ui=True)
    if z.get_subtool_count() != n0 + 1:
        raise ZBOpError("Duplicate did not add a SubTool (Edit mode on?)")
    z.select_subtool(src + 1)
    copy_name = _name_from_path(z.get_active_tool_path())
    z.select_subtool(src)
    return {"work": {"index": src, "name": name}, "copy": {"index": src + 1, "name": copy_name}}


def index_of(name):
    """Current index of a SubTool by name. Duplicate, Split To Parts, MergeDown and Append
    renumber the list, so keep the colour source and the target by NAME and re-read the index
    after each of them (SDK locate_subtool_by_name [doc]; table fallback [added])."""
    z = _z()
    fn = getattr(z, "locate_subtool_by_name", None)
    if fn is not None:
        try:
            i = int(fn(name))
        except Exception:        # name format differs from the SubTool list [verify]
            i = -1
        if i >= 0:
            return i
    for r in subtool_table(with_counts=False):
        if r["name"] == name:
            return r["index"]
    raise ZBOpError(f"no SubTool named {name!r}")


def merge_down_run(first, count, weld=True, uv=False):
    """Merge `count` SubTools below `first` into it, inside the SAME Tool: select `first`,
    MergeDown `count` times (each press merges the selected SubTool with the one below it).
    This is Drust's in-Tool merge before a re-DynaMesh (PrFQXjs_6_w 00:09:27) and Pavlovich's
    re-join of separately remeshed ears and hands with Weld on (n5 00:59:42). MergeVisible is
    the wrong button here: it builds a NEW Tool (Merged_...) and leaves the colour source and
    the working SubTools behind (Pablo Logic Part 3, gitoJ7B8FmY 00:03:31). Each press must
    remove one SubTool; a note that blocks it (Drust answered "Always OK") raises [verify]."""
    z = _z()
    for key, val in (("merge_weld", weld), ("merge_uv", uv)):
        _switch(key, val, required=False)
    z.select_subtool(int(first))
    presses = []
    for _ in range(int(count)):
        n0 = z.get_subtool_count()
        _press("merge_down", check_enabled=False)
        n1 = z.get_subtool_count()
        presses.append((n0, n1))
        if n1 != n0 - 1:
            raise ZBOpError(f"MergeDown did not merge ({n0} -> {n1} SubTools): a note is probably "
                            "open (Drust answered 'Always OK')")
    return {"first": first, "merged": count, "subtools_after": z.get_subtool_count(),
            "presses": presses, "stats": zb_ops.stats()}


def move_subtool(index, to_index):
    """Move the SubTool at `index` to position `to_index` with Tool > SubTool MoveUp or MoveDown
    [cmdxml], one press per step, checking after each press that the selection followed
    [verify]. MergeDown only merges with the SubTool right below, so parts are brought next to
    their body first (an appended plug lands last)."""
    z = _z()
    index, to_index = int(index), int(to_index)
    n = z.get_subtool_count()
    if not (0 <= index < n and 0 <= to_index < n):
        raise ZBOpError(f"move {index} -> {to_index} outside 0..{n - 1}")
    z.select_subtool(index)
    key = "move_up" if to_index < index else "move_down"
    step = -1 if to_index < index else 1
    cur = index
    while cur != to_index:
        _press(key, check_enabled=False)
        cur += step
        if z.get_active_subtool_index() != cur:
            raise ZBOpError(f"{key}: selection at {z.get_active_subtool_index()}, expected {cur}")
    return {"from": index, "to": cur}


def merge_into(target_name, part_names, weld=True, uv=False):
    """Merge named parts into a named SubTool inside the Tool, whatever the list order: each
    part is moved right below the target (move_subtool), then MergeDown once. Names, not
    indices, because every move and merge renumbers the list. The merged SubTool keeps the
    upper (target) name [verify]."""
    out = []
    for part in part_names:
        it, ip = index_of(target_name), index_of(part)
        move_subtool(ip, it + 1 if ip > it else it)
        out.append(merge_down_run(index_of(target_name), 1, weld=weld, uv=uv)["subtools_after"])
    return {"target": target_name, "merged": list(part_names), "subtools_after": out[-1] if out else None,
            "index": index_of(target_name)}


def dynamesh_keep(resolution, keep="groups", blur=0, project=0, restore=True):
    """DynaMesh the active SubTool keeping polygroups OR polypaint, on purpose. With the
    SubTool's polypaint on (Colorize, the brush icon in the SubTool list), DynaMesh keeps
    polypaint INSTEAD of polygroups (DynaMesh doc, PolyGroups > Important); with it off the
    paint is lost (Pavlovich 8kWFv1cZlCE 00:20:06). The general rule belongs to
    scenario-zbrush-sculpting; on a generated or scanned mesh the default is "groups": part groups
    (Auto Groups, From Polypaint) steer the later ZRemesher, and colour comes back by
    projection from the raw duplicate, which keeps its paint. Blur 0 and Project off are
    Drust's dirty-data settings (PrFQXjs_6_w 00:01:48, 00:06:43). The previous Colorize is
    restored afterwards unless restore=False [verify that Colorize is the SubTool icon]."""
    if keep not in ("groups", "polypaint"):
        raise ValueError("keep: groups or polypaint")
    was = bool(_get("colorize", 0.0) >= 0.5)
    _switch("colorize", keep == "polypaint")
    try:
        r = zb_ops.dynamesh(resolution, blur=blur, project=project)
    finally:
        if restore and keep == "groups":
            _switch("colorize", was)
    r.update({"kept": keep, "colorize_was": was})
    return r


def plug_hole(center, diameter, primitive="Sphere3D"):
    """Append a primitive, place it at a hole with Tool > Geometry X/Y/Z Position and XYZ
    Size [cmdxml] (primitives placed without brushes, as in Pablo's blockout, gitoJ7B8FmY
    00:05:26), so merge_into plus a re-DynaMesh
    closes the hole: the scripted form of Drust's PolySphere plugs (PrFQXjs_6_w 00:07:16 to
    00:10:33, placed by hand there). center and diameter in internal units, from
    hole_plugs() on an OBJ export. Append then PopUp:<primitive> is the shipped macros'
    pattern; slider units and axes [verify live_rx_06]. Returns the new SubTool index (the
    last one [verify])."""
    z = _z()
    zb_ops.ensure_edit()
    n0 = z.get_subtool_count()
    zb_ops.press("append", check_enabled=False)
    pp = "PopUp:" + str(primitive)
    if not z.exists(pp):
        raise ZBOpError(f"{pp} not found after Append (pop-up names [verify])")
    z.press(pp)
    z.update(redraw_ui=True)
    if z.get_subtool_count() != n0 + 1:
        raise ZBOpError("Append added no SubTool")
    idx = z.get_subtool_count() - 1
    z.select_subtool(idx)
    read = {}
    for key, val in (("xyz_size", float(diameter)), ("x_pos", float(center[0])),
                     ("y_pos", float(center[1])), ("z_pos", float(center[2]))):
        read[key] = zb_ops.set_checked(key, val, tol=max(1e-3, abs(val) * 1e-3))
    z.update(redraw_ui=True)
    return {"index": idx, "set": read, "bbox": _bbox(1)}


# --------------------------------------------------------------------------------------------
# Agent side: calling into ZBrush
# --------------------------------------------------------------------------------------------

def build_call_code(func, args=(), kwargs=None):
    """Source that imports this module inside ZBrush (both toolkit folders on sys.path only
    during the import, zb_* modules popped afterwards) and calls func(*args, **kwargs). The
    zb_launch prelude provides _zb_json."""
    if not str(func).isidentifier():
        raise ValueError(f"bad function name {func!r}")
    dirs = [EXPERT_SCRIPTS, _HERE]
    lines = [
        "import sys as _rx_sys, importlib as _rx_il",
        f"_rx_dirs = {dirs!r}",
        "_rx_before = set(_rx_sys.modules)",
        "for _d in _rx_dirs:",
        "    _rx_sys.path.insert(0, _d)",
        "try:",
        "    rx = _rx_il.import_module('zb_retopology_export')",
        "finally:",
        "    for _d in _rx_dirs:",
        "        if _d in _rx_sys.path:",
        "            _rx_sys.path.remove(_d)",
        "    for _k in set(_rx_sys.modules) - _rx_before:",
        "        if _k.startswith('zb_'):",
        "            _rx_sys.modules.pop(_k, None)",
        f"result = rx.{func}(*_zb_json.loads({json.dumps(list(args))!r}), "
        f"**_zb_json.loads({json.dumps(kwargs or {})!r}))",
    ]
    return "\n".join(lines) + "\n"


def zcall(func, *args, port=7788, timeout=300, **kwargs):
    """rx.func(*args, **kwargs) inside ZBrush through the proven bridge (zb_launch.run, main
    thread). Long operations (ZRemesher, projection into millions, MME) need long timeouts;
    a timeout does not cancel the queued code (lead skill): ping before the next call."""
    zb_launch = _import_sibling("zb_launch")
    return zb_launch.run(build_call_code(func, args, kwargs), (), port, timeout)


# --------------------------------------------------------------------------------------------
# Agent side: OBJ measurements on top of zb_audit
# --------------------------------------------------------------------------------------------

def _audit():
    return _import_sibling("zb_audit")


def _np():
    import numpy
    return numpy


def obj_header(path, max_groups=20):
    """What ZBrush wrote: '#Vertex Count', '#Face Count', '#Auto scale x= y= z=' and '#Auto
    offset' (the Export Scale and offsets applied) [obj, v03 export], g lines (one per
    polygroup with Grp on), vt presence, #MRGB polypaint blocks."""
    out = {"auto_scale": None, "auto_offset": None, "vertex_count": None, "face_count": None,
           "groups": [], "group_lines": 0, "has_vt": False, "mrgb_lines": 0, "usemtl": 0}
    num = r"(-?[0-9.eE+-]+)"
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("#Auto scale"):
                m = re.findall(r"[xyz]=" + num, line)
                out["auto_scale"] = [float(v) for v in m]
            elif line.startswith("#Auto offset"):
                m = re.findall(r"[xyz]=" + num, line)
                out["auto_offset"] = [float(v) for v in m]
            elif line.startswith("#Vertex Count"):
                out["vertex_count"] = int(line.split()[-1])
            elif line.startswith("#Face Count"):
                out["face_count"] = int(line.split()[-1])
            elif line.startswith("#MRGB"):
                out["mrgb_lines"] += 1
            elif line.startswith("g "):
                out["group_lines"] += 1
                if len(out["groups"]) < max_groups:
                    out["groups"].append(line.split(maxsplit=1)[1].strip())
            elif line.startswith("usemtl "):
                out["usemtl"] += 1
            elif line.startswith("vt ") and not out["has_vt"]:
                out["has_vt"] = True
    return out


def obj_groups(path):
    """Group name per face, in the face order of zb_audit.load_obj ('g' or 'usemtl' lines;
    ZBrush writes 'g GroupN' per polygroup with Grp on [obj])."""
    names, current = [], "default"
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("g ") or line.startswith("usemtl "):
                parts = line.split(maxsplit=1)
                current = parts[1].strip() if len(parts) > 1 else "default"
            elif line.startswith("f "):
                names.append(current)
    return names


def _components(n, a, b):
    """Connected component label per node. Uses zb_audit._shells (vectorised label
    propagation, lead toolkit); a union-find fallback keeps this usable without it."""
    np = _np()
    try:
        return _audit()._shells(int(n), np.asarray(a, dtype=np.int64),
                                np.asarray(b, dtype=np.int64)).tolist()
    except (AttributeError, ImportError):
        pass
    parent = np.arange(n)

    def find(x):
        r = x
        while parent[r] != r:
            r = parent[r]
        while parent[x] != r:
            parent[x], x = r, parent[x]
        return r

    for u, v in zip(a.tolist(), b.tolist()):
        ru, rv = find(u), find(v)
        if ru != rv:
            parent[ru] = rv
    return [find(i) for i in range(n)]


def _loops(edges):
    """Split an edge list into closed loops (every vertex of the component has degree 2) and
    open chains. Returns (sorted loop vertex counts, number of open chains). The ring test of
    the distiller's topo_qa.py (archive/tests/retopology_visual), vectorised on numpy."""
    np = _np()
    if len(edges) == 0:
        return [], 0
    e = np.asarray(edges, dtype=np.int64)
    verts, inv = np.unique(e.ravel(), return_inverse=True)
    inv = inv.reshape(-1, 2)
    deg = np.bincount(inv.ravel(), minlength=len(verts))
    comp = np.asarray(_components(len(verts), inv[:, 0], inv[:, 1]))
    loops, open_chains = [], 0
    for c in np.unique(comp):
        members = comp == c
        if (deg[members] == 2).all():
            loops.append(int(members.sum()))
        else:
            open_chains += 1
    return sorted(loops), open_chains


def topo_report(obj, ring_groups=(), mirror_center=0.0, centre_eps=1e-4):
    """zb_audit.audit() plus what retopology review needs: per-group faces, area density,
    interior poles and border loops, the ring test (a group whose border is exactly two closed
    loops of equal size, with no pole inside, is a clean concentric strip: loops around eyes
    and mouth, Pavlovich n5 00:06:32), rows across a ring, and the centre-line chain."""
    np = _np()
    za = _audit()
    rep = za.audit(obj, sym_center=mirror_center)
    m = za.load_obj(obj) if isinstance(obj, str) else obj
    groups = obj_groups(obj) if isinstance(obj, str) else ["default"] * len(m.sizes)
    rep["quad_ratio"] = round(rep["quads"] / rep["faces"], 4) if rep["faces"] else 0.0
    flat, sizes, starts = m.flat, m.sizes, m.starts
    nxt = np.roll(flat, -1)
    ends = starts + sizes - 1
    nxt[ends] = flat[starts]
    face_of_corner = np.repeat(np.arange(len(sizes)), sizes)
    lo = np.minimum(flat, nxt)
    hi = np.maximum(flat, nxt)
    nv = max(len(m.verts), 1)
    ekey = lo * nv + hi
    ukeys, einv, ecount = np.unique(ekey, return_inverse=True, return_counts=True)
    # valence and boundary flags per vertex
    eu, ev = ukeys // nv, ukeys % nv
    val = np.bincount(np.concatenate([eu, ev]), minlength=nv)
    bnd = np.zeros(nv, dtype=bool)
    bmask = ecount == 1
    bnd[eu[bmask]] = True
    bnd[ev[bmask]] = True
    gnames = sorted(set(groups))
    gid = np.array([gnames.index(g) for g in groups], dtype=np.int64) if groups else np.zeros(0, np.int64)
    corner_g = gid[face_of_corner]
    # per vertex: set of groups -> "only group g" when min == max
    vmin = np.full(nv, len(gnames), dtype=np.int64)
    vmax = np.full(nv, -1, dtype=np.int64)
    np.minimum.at(vmin, flat, corner_g)
    np.maximum.at(vmax, flat, corner_g)
    # face areas (fan triangulation)
    v = m.verts
    area = np.zeros(len(sizes))
    for k in range(1, int(sizes.max()) - 1 if len(sizes) else 0):
        sel = sizes > k + 1
        p0 = v[flat[starts[sel]]]
        p1 = v[flat[starts[sel] + k]]
        p2 = v[flat[starts[sel] + k + 1]]
        area[sel] += 0.5 * np.linalg.norm(np.cross(p1 - p0, p2 - p0), axis=1)
    per = {}
    for gi, g in enumerate(gnames):
        fsel = gid == gi
        csel = corner_g == gi
        # group border: edges with exactly one corner of this group on them
        ge = einv[csel]
        uk, cnt = np.unique(ge, return_counts=True)
        border = uk[cnt == 1]
        loops, chains = _loops(np.stack([eu[border], ev[border]], axis=1)) if len(border) else ([], 0)
        inner = np.nonzero((vmin == gi) & (vmax == gi) & ~bnd)[0]
        gpoles = int((val[inner] != 4).sum())
        a = float(area[fsel].sum())
        row = {"faces": int(fsel.sum()), "area": round(a, 6),
               "faces_per_area": round(fsel.sum() / a, 3) if a > 0 else None,
               "interior_poles": gpoles, "border_loops": loops, "border_open_chains": chains}
        if g in ring_groups:
            ok = len(loops) == 2 and loops[0] == loops[1] and chains == 0 and gpoles == 0
            row["ring_ok"] = ok
            row["ring_rows"] = round(row["faces"] / loops[0], 2) if ok else None
        per[g] = row
    rep["groups"] = per
    rep["group_count"] = len(gnames)
    # centre line: vertices on the mirror plane and the edges between them
    diag = rep["diag"] or 1.0
    on = np.abs(v[:, 0] - float(rep["symmetry_center_x"])) <= centre_eps * diag
    ce = on[eu] & on[ev]
    if on.any():
        idx = np.nonzero(on)[0]
        remap = -np.ones(nv, dtype=np.int64)
        remap[idx] = np.arange(len(idx))
        comp = _components(len(idx), remap[eu[ce]], remap[ev[ce]])
        rep["centre_line_vertices"] = int(len(idx))
        rep["centre_line_components"] = int(len(set(comp)))
    else:
        rep["centre_line_vertices"] = 0
        rep["centre_line_components"] = 0
    return rep


def retopo_verdict(rep, purpose="rig", target_faces=None, band=(0.8, 2.0), budget_tris=None,
                   symmetric=False, min_symmetry_pct=99.0, ring_groups=(), ring_rows_min=None,
                   expected_holes=0, expected_shells=1, min_quad_pct=98.0):
    """Gate a remeshed low mesh. purpose: "rig" or "film" (deforming quads), "game"
    (triangles allowed, budget), "sculpt_base" (ZRemesher base to subdivide).
    Uses zb_audit.verdict for the shared problems, then adds: face count in band, quads for
    deforming meshes (98 percent [added]), no n-gons on a rig (ZBrush triangulates them and
    blend shapes break: scenario-maya-retopology-uv, FlippedNormals), rings, centre line, symmetry."""
    za = _audit()
    prof = "game" if purpose == "game" else "sculpt"
    v = za.verdict(rep, prof, budget_tris=budget_tris, expected_holes=expected_holes,
                   expected_shells=expected_shells, symmetric=symmetric,
                   min_symmetry_pct=min_symmetry_pct, require_uvs=False if prof == "sculpt" else None)
    problems, warnings = list(v["problems"]), list(v["warnings"])
    if target_faces:
        ratio = rep["faces"] / float(target_faces)
        if not band[0] <= ratio <= band[1]:
            problems.append(f"faces {rep['faces']} = {ratio:.2f} x target {target_faces}, outside "
                            f"{band} (expected_band)")
    if purpose in ("rig", "film"):
        if rep.get("ngons"):
            problems.append(f"{rep['ngons']} n-gons on a deforming mesh")
        if rep.get("quads_pct", 0) < min_quad_pct:
            problems.append(f"quads {rep['quads_pct']} % < {min_quad_pct} % for a deforming mesh [added]")
        if rep.get("poles_6plus"):
            warnings.append(f"{rep['poles_6plus']} poles of valence 6+: keep them out of deforming areas")
    for g in ring_groups:
        row = rep.get("groups", {}).get(g)
        if row is None:
            problems.append(f"ring group {g!r} missing: export with Grp on for the QA copy")
        elif not row.get("ring_ok"):
            problems.append(f"ring {g!r} not a clean concentric strip: loops {row['border_loops']}, "
                            f"open chains {row['border_open_chains']}, inner poles {row['interior_poles']}")
        elif ring_rows_min and row["ring_rows"] < ring_rows_min:
            warnings.append(f"ring {g!r} has {row['ring_rows']} rows < {ring_rows_min}")
    if symmetric and rep.get("centre_line_components", 0) > max(1, expected_holes + 1):
        warnings.append(f"centre line in {rep['centre_line_components']} pieces: Mirror And Weld "
                        "(Pavlovich n5 00:41:14)")
    return {"purpose": purpose, "ok": not problems, "problems": problems, "warnings": warnings}


def pick_retry(runs, target_faces=None, band=(0.8, 2.0), choice=None, tol_pct=1.0):
    """Choose among ZRemesher Retry variants and say how to get back to it. A sweep over
    Adaptive Size 0, 5, 21 (Pavlovich n5 00:17:40, 00:18:13) leaves the LAST variant in the
    scene, so the chosen one must be recomputed: Retry with its settings is cached and fast
    (ZRemesher 4.0 doc). runs: [{"adaptive_size": 0, "faces_after": 8012, ...}, ...] as
    returned by zremesh()/retry() plus the settings used. choice: the value picked on the
    review sheets ("Only your eyes can tell": ZRemesher doc); without it, the in-band run
    closest to the target. Returns the run, the retry() kwargs and the face count to expect
    back within tol_pct (confirm_retry)."""
    if not runs:
        raise ValueError("no runs")
    if choice is not None:
        hit = [r for r in runs if r.get("adaptive_size") == choice]
        if not hit:
            raise ValueError(f"no run with adaptive_size {choice}")
        best, why = hit[0], "visual choice"
    else:
        def ratio(r):
            return r["faces_after"] / float(target_faces) if target_faces else 1.0
        inband = [r for r in runs if band[0] <= ratio(r) <= band[1]]
        best = min(inband or runs, key=lambda r: abs(ratio(r) - 1.0))
        why = "in band, closest to target" if inband else "none in band: closest to target"
    kw = {k: best[k] for k in ("adaptive_size", "target_k", "adaptive", "curves_strength",
                               "color_density") if k in best}
    last = runs[-1]
    return {"run": best, "why": why, "retry": kw, "expect_faces": int(best["faces_after"]),
            "tol_pct": tol_pct, "already_in_scene": best is last}


def confirm_retry(pick, faces_now):
    """True when the mesh now in the scene is the chosen variant (face count within tol)."""
    exp = float(pick["expect_faces"])
    return exp > 0 and abs(faces_now - exp) / exp * 100 <= pick["tol_pct"]


def projection_verdict(source_rep, top_rep, level1_before=None, level1_after=None,
                       bbox_tol_pct=0.5, volume_tol_pct=2.0):
    """Detail came back: top-level bbox within bbox_tol_pct of the source per axis, volume
    within volume_tol_pct, level-1 point count unchanged. Tolerances [added] from the retopology
    digest checklist (after projection, extents within about 0.5 percent of the source)."""
    problems, warnings = [], []
    s, t = source_rep["size"], top_rep["size"]
    for i, ax in enumerate("xyz"):
        if s[i] > 0:
            d = abs(t[i] - s[i]) / s[i] * 100
            if d > bbox_tol_pct:
                problems.append(f"{ax} extent {t[i]:.5f} vs source {s[i]:.5f} ({d:.2f} %): project "
                                "again (Dist 0.1) or engulf the source")
    if source_rep.get("volume"):
        dv = (top_rep["volume"] - source_rep["volume"]) / abs(source_rep["volume"]) * 100
        if abs(dv) > volume_tol_pct:
            problems.append(f"volume change {dv:.2f} % > {volume_tol_pct} %")
    if level1_before is not None and level1_after is not None and level1_before != level1_after:
        problems.append(f"level 1 changed {level1_before} -> {level1_after}: topology altered")
    if top_rep["points"] < 0.5 * source_rep["points"]:
        warnings.append(f"top level {top_rep['points']} points < half the source "
                        f"{source_rep['points']}: detail will be softer (Drust R2MzFqWMaWY 00:02:16)")
    return {"ok": not problems, "problems": problems, "warnings": warnings}


def projection_from_stack(ps, bbox_tol_pct=0.5, volume_tol_pct=2.0):
    """projection_verdict from project_stack()'s own numbers (source and top bbox, volume,
    points, level-1 counts), so a 12M source needs no OBJ export to be checked."""
    def rep(bbox, volume, points):
        b = [float(v) for v in bbox]
        return {"size": [b[3] - b[0], b[4] - b[1], b[5] - b[2]], "volume": volume, "points": points}
    v = projection_verdict(rep(ps["source_bbox"], ps["source_volume"], ps["source_points"]),
                           rep(ps["top_bbox"], ps["top_volume"], ps["top_points"]),
                           ps.get("level1_points_before"), ps.get("level1_points_after"),
                           bbox_tol_pct, volume_tol_pct)
    extra = list(ps.get("pass_problems") or [])       # zb_ops.project_all gates per pass
    if extra:
        v["problems"] = v["problems"] + extra
        v["ok"] = False
    if ps.get("morph_target_left"):
        v["warnings"] = v["warnings"] + ["morph target still stored: drop_morph_target() before "
                                         "maps (Drust 2zDAtaQqwh8 00:01:44) [verify]"]
    return v


def uv_report(obj, raster=256, max_tiles=64, overlap_max_tris=300000):
    """UVs from the OBJ vt lines: bbox, UDIM tiles (1001 + u + 10 v), islands (UV-connected
    faces), overlapping texels (rasterised per tile), faces with flipped UV winding, and the
    spread of texel density (UV area / 3D area, coefficient of variation)."""
    np = _np()
    za = _audit()
    m = za.load_obj(obj) if isinstance(obj, str) else obj
    out = {"has_uvs": m.uvs is not None and m.flat_uv is not None and bool((m.flat_uv >= 0).all())}
    if not out["has_uvs"]:
        out.update(tiles=[], islands=0, overlap_pct=None, flipped_faces=None)
        return out
    uv = m.uvs[m.flat_uv]
    out["uv_bbox"] = [round(float(uv[:, 0].min()), 6), round(float(uv[:, 1].min()), 6),
                      round(float(uv[:, 0].max()), 6), round(float(uv[:, 1].max()), 6)]
    sizes, starts = m.sizes, m.starts
    # face centroids in UV -> tile
    fc = np.add.reduceat(uv, starts, axis=0) / sizes[:, None]
    tu = np.floor(fc[:, 0]).astype(int)
    tv = np.floor(fc[:, 1]).astype(int)
    tiles = 1001 + tu + 10 * tv
    ut, tc = np.unique(tiles, return_counts=True)
    out["tiles"] = [{"udim": int(t), "faces": int(c)} for t, c in zip(ut, tc)][:max_tiles]
    # signed UV area and 3D area per face (fan)
    uva = np.zeros(len(sizes))
    a3 = np.zeros(len(sizes))
    v = m.verts
    tris = []
    for k in range(1, int(sizes.max()) - 1):
        sel = np.nonzero(sizes > k + 1)[0]
        i0, i1, i2 = starts[sel], starts[sel] + k, starts[sel] + k + 1
        q0, q1, q2 = uv[i0], uv[i1], uv[i2]
        cr = (q1[:, 0] - q0[:, 0]) * (q2[:, 1] - q0[:, 1]) - (q1[:, 1] - q0[:, 1]) * (q2[:, 0] - q0[:, 0])
        uva[sel] += 0.5 * cr
        p0, p1, p2 = v[m.flat[i0]], v[m.flat[i1]], v[m.flat[i2]]
        a3[sel] += 0.5 * np.linalg.norm(np.cross(p1 - p0, p2 - p0), axis=1)
        tris.append(np.stack([q0, q1, q2], axis=1))
    out["flipped_faces"] = int((uva < 0).sum())
    out["zero_uv_area_faces"] = int((np.abs(uva) < 1e-14).sum())
    good = (a3 > 0) & (np.abs(uva) > 0)
    dens = np.sqrt(np.abs(uva[good]) / a3[good]) if good.any() else np.zeros(0)
    if len(dens):
        out["texel_density_cv"] = round(float(dens.std() / dens.mean()), 4)
        out["texel_density_p5_p95"] = [round(float(np.percentile(dens, 5)), 6),
                                       round(float(np.percentile(dens, 95)), 6)]
    # islands: faces connected through shared UV vertices
    nuv = len(m.uvs)
    a = m.flat_uv
    b = np.roll(a, -1)
    b[starts + sizes - 1] = a[starts]
    comp = _components(nuv, a, b)
    out["islands"] = int(len(set(np.asarray(comp)[np.unique(a)].tolist())))
    out["uv_vertices"] = int(nuv)
    out["seam_ratio"] = round(nuv / max(1, len(m.verts)), 4)
    # overlap: rasterise every triangle per tile, count texels covered twice or more
    tri = np.concatenate(tris) if tris else np.zeros((0, 3, 2))
    if len(tri) > overlap_max_tris:     # raster loop is per triangle: skip on dense meshes
        out["overlap_pct"] = None
        out["overlap_note"] = f"{len(tri)} triangles > {overlap_max_tris}: run on the low mesh"
        return out
    cover = {}
    for t in ut[:max_tiles]:
        cover[int(t)] = np.zeros((raster, raster), dtype=np.int32)
    ctr = tri.mean(axis=1)
    ttile = 1001 + np.floor(ctr[:, 0]).astype(int) + 10 * np.floor(ctr[:, 1]).astype(int)
    for i in range(len(tri)):
        t = int(ttile[i])
        if t not in cover:
            continue
        base = np.array([(t - 1001) % 10, (t - 1001) // 10], dtype=float)
        q = (tri[i] - base) * raster
        x0, y0 = np.floor(q.min(axis=0)).astype(int)
        x1, y1 = np.ceil(q.max(axis=0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, raster), min(y1, raster)
        if x1 <= x0 or y1 <= y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        p = np.stack([xs.ravel(), ys.ravel()], axis=1)
        (ax_, ay_), (bx, by), (cx, cy) = q
        den = (by - cy) * (ax_ - cx) + (cx - bx) * (ay_ - cy)
        if abs(den) < 1e-12:
            continue
        l1 = ((by - cy) * (p[:, 0] - cx) + (cx - bx) * (p[:, 1] - cy)) / den
        l2 = ((cy - ay_) * (p[:, 0] - cx) + (ax_ - cx) * (p[:, 1] - cy)) / den
        inside = (l1 >= 0) & (l2 >= 0) & (1 - l1 - l2 >= 0)
        pi = p[inside].astype(int)
        cover[t][pi[:, 1], pi[:, 0]] += 1
    used = sum(int((c >= 1).sum()) for c in cover.values())
    over = sum(int((c >= 2).sum()) for c in cover.values())
    out["overlap_pct"] = round(100.0 * over / used, 3) if used else 0.0
    out["coverage_pct"] = round(100.0 * used / (raster * raster * max(1, len(cover))), 2)
    return out


def uv_verdict(uvr, udim=False, max_overlap_pct=0.5, max_density_cv=None, max_islands=None):
    """UVs exist, inside 0..1 unless UDIM, no overlaps (New From UV Check shows overlaps red:
    Pavlovich cvqoVUX5aBw 00:01:06), no flipped faces. Overlap tolerance [added]: the raster
    counts shared border texels."""
    problems, warnings = [], []
    if not uvr.get("has_uvs"):
        return {"ok": False, "problems": ["no UVs (Txr off on export, or none made)"], "warnings": []}
    b = uvr["uv_bbox"]
    if not udim and (b[0] < -1e-6 or b[1] < -1e-6 or b[2] > 1 + 1e-6 or b[3] > 1 + 1e-6):
        problems.append(f"UVs outside 0..1 {b} on a single-tile layout")
    if uvr.get("overlap_pct") and uvr["overlap_pct"] > max_overlap_pct:
        problems.append(f"{uvr['overlap_pct']} % of used texels overlap")
    if uvr.get("flipped_faces"):
        warnings.append(f"{uvr['flipped_faces']} faces with flipped UV winding (mirrored islands)")
    if max_density_cv is not None and uvr.get("texel_density_cv", 0) > max_density_cv:
        warnings.append(f"texel density spread {uvr['texel_density_cv']} > {max_density_cv}")
    if max_islands is not None and uvr.get("islands", 0) > max_islands:
        warnings.append(f"{uvr['islands']} islands > {max_islands}")
    return {"ok": not problems, "problems": problems, "warnings": warnings}


def scale_report(obj_or_rep, target_size, axis=1, unit="cm", tol_pct=1.0, feet_on_ground=True,
                 centered=True):
    """The definitive scale check: parse the exported OBJ (OBJ and STL carry no units: Drust
    YrD29hiokJo 00:05:21) and compare its bbox with the brief in destination units."""
    rep = _audit().audit(obj_or_rep) if isinstance(obj_or_rep, str) else obj_or_rep
    size = rep["size"][axis]
    err = abs(size - target_size) / target_size * 100
    problems = []
    if err > tol_pct:
        problems.append(f"size {size:.4f} {unit} vs {target_size} ({err:.2f} %): Export Scale "
                        "= target / internal extent")
    lo = rep["bbox_min"][axis]
    if feet_on_ground and abs(lo) > 0.01 * target_size:
        problems.append(f"lowest point at {lo:.4f} {unit}, not on the ground: Y Offset")
    if centered:
        for i, ax in ((0, "x"), (2, "z")):
            if i != axis and abs(rep["center"][i]) > 0.01 * target_size:
                problems.append(f"{ax} centre at {rep['center'][i]:.4f} {unit}: offset")
    return {"size": size, "unit": unit, "error_pct": round(err, 3), "ok": not problems,
            "problems": problems, "bbox_min": rep["bbox_min"], "bbox_max": rep["bbox_max"]}


def obj_transform(src, dst, rotate_x_deg=0.0, center=False, ground=False, scale=1.0):
    """Rewrite the v lines of an OBJ (rotation about X, centring, ground at y=0, scale); every
    other line is copied. For generated meshes that arrive Z-up or off-centre, before import:
    deterministic and checkable, unlike Gizmo moves. [added]"""
    np = _np()
    with open(src, "r", errors="ignore") as fh:
        lines = fh.read().splitlines()
    vi = [i for i, ln in enumerate(lines) if ln.startswith("v ")]
    pts = np.array([[float(x) for x in lines[i].split()[1:4]] for i in vi])
    extra = [lines[i].split()[4:] for i in vi]
    if rotate_x_deg:
        a = math.radians(rotate_x_deg)
        r = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
        pts = pts @ r.T
    pts = pts * scale
    if center:
        c = (pts.min(axis=0) + pts.max(axis=0)) / 2
        pts[:, 0] -= c[0]
        pts[:, 2] -= c[2]
        if not ground:
            pts[:, 1] -= c[1]
    if ground:
        pts[:, 1] -= pts[:, 1].min()
    for k, i in enumerate(vi):
        tail = (" " + " ".join(extra[k])) if extra[k] else ""
        lines[i] = "v %.7g %.7g %.7g%s" % (pts[k, 0], pts[k, 1], pts[k, 2], tail)
    with open(dst, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    return {"dst": dst, "bbox_min": pts.min(axis=0).round(6).tolist(),
            "bbox_max": pts.max(axis=0).round(6).tolist()}


# --------------------------------------------------------------------------------------------
# Agent side: maps
# --------------------------------------------------------------------------------------------

_EXR_TYPES = {0: "UINT", 1: "HALF", 2: "FLOAT"}
_EXR_COMP = {0: "NONE", 1: "RLE", 2: "ZIPS", 3: "ZIP", 4: "PIZ", 5: "PXR24", 6: "B44", 7: "B44A",
             8: "DWAA", 9: "DWAB"}


def exr_header(path):
    """OpenEXR header with the standard library: channels and pixel types, data window,
    compression. Enough to gate "32-bit float, one channel" without any image library."""
    with open(path, "rb") as fh:
        data = fh.read(65536)
    if data[:4] != b"\x76\x2f\x31\x01":
        raise ValueError(f"{path}: not an OpenEXR file")
    pos, out = 8, {"channels": {}}
    while pos < len(data) and data[pos] != 0:
        end = data.index(b"\0", pos)
        name = data[pos:end].decode()
        pos = end + 1
        end = data.index(b"\0", pos)
        typ = data[pos:end].decode()
        pos = end + 1
        size = struct.unpack("<i", data[pos:pos + 4])[0]
        pos += 4
        val = data[pos:pos + size]
        pos += size
        if typ == "chlist":
            q = 0
            while q < len(val) and val[q] != 0:
                e = val.index(b"\0", q)
                cname = val[q:e].decode()
                ptype = struct.unpack("<i", val[e + 1:e + 5])[0]
                out["channels"][cname] = _EXR_TYPES.get(ptype, str(ptype))
                q = e + 1 + 16
        elif typ == "box2i" and name == "dataWindow":
            x0, y0, x1, y1 = struct.unpack("<4i", val)
            out["width"], out["height"] = x1 - x0 + 1, y1 - y0 + 1
        elif typ == "compression":
            out["compression"] = _EXR_COMP.get(val[0], str(val[0]))
    return out


def _load_pixels(path):
    """Pixel array (H, W, C) as float64 in the file's own range, plus its bit depth. EXR through
    OpenCV with OPENCV_IO_ENABLE_OPENEXR (optional); everything else through Pillow."""
    np = _np()
    ext = os.path.splitext(path)[1].lower()
    if ext == ".exr":
        os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
        try:
            import cv2
        except ImportError:
            return None, None
        a = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if a is None:
            return None, None
        a = a.astype(np.float64)
        if a.ndim == 3:
            a = a[:, :, ::-1]
        return (a if a.ndim == 3 else a[:, :, None]), 32
    from PIL import Image
    with Image.open(path) as im:
        mode = im.mode
        if mode in ("I;16", "I;16B", "I;16L", "I"):
            a = np.asarray(im).astype(np.float64)
            bits = 16 if mode.startswith("I;16") else 32
        elif mode == "F":
            a, bits = np.asarray(im).astype(np.float64), 32
        else:
            a, bits = np.asarray(im.convert("RGB" if mode not in ("L", "RGB", "RGBA") else mode)).astype(np.float64), 8
    if a.ndim == 2:
        a = a[:, :, None]
    return a, bits


def map_info(path):
    """Format, size, channels, bit depth, and value statistics when the pixels can be read."""
    np = _np()
    out = {"path": path, "bytes": os.path.getsize(path), "ext": os.path.splitext(path)[1].lower()}
    if out["ext"] == ".exr":
        h = exr_header(path)
        out.update({"width": h.get("width"), "height": h.get("height"),
                    "channels": sorted(h["channels"]), "pixel_types": sorted(set(h["channels"].values())),
                    "compression": h.get("compression"),
                    "bits": 32 if "FLOAT" in h["channels"].values() else 16})
    a, bits = _load_pixels(path)
    if a is not None:
        out.setdefault("width", a.shape[1])
        out.setdefault("height", a.shape[0])
        out.setdefault("bits", bits)
        out["n_channels"] = a.shape[2]
        c0 = a[:, :, 0]
        out["min"], out["max"] = float(a.min()), float(a.max())
        vals, counts = np.unique(np.round(c0, 4), return_counts=True)
        out["mode_value"] = float(vals[np.argmax(counts)])
        out["median"] = [round(float(np.median(a[:, :, c])), 5) for c in range(a.shape[2])]
    return out


def map_verdict(info, kind, size=None, mid=None, bits=None, channels=None, flat_tol=None):
    """kind: displacement (flat value near Mid: 0 or 0.5), normal (flat near (128,128,255):
    Polycount Flat Color), ao, cavity, id. Resolution equals the map size when given."""
    problems, warnings = [], []
    if size and (info.get("width"), info.get("height")) != (size, size):
        problems.append(f"{info.get('width')}x{info.get('height')} != {size}")
    if bits and info.get("bits") and info["bits"] < bits:
        problems.append(f"{info['bits']}-bit < {bits}-bit")
    nch = info.get("n_channels") or len(info.get("channels") or [])
    if channels and nch and nch != channels:
        (warnings if kind == "displacement" else problems).append(f"{nch} channels, expected {channels}")
    if kind == "displacement" and mid is not None and "mode_value" in info:
        tol = flat_tol if flat_tol is not None else 0.02
        full = {8: 255.0, 16: 65535.0}.get(info.get("bits"), 1.0)
        if abs(info["mode_value"] / full - mid) > tol:
            problems.append(f"flat value {info['mode_value']} not at Mid {mid}: the renderer zero "
                            "value must match (FlippedNormals -ThBTEc8L_M 00:10:01)")
    if kind == "normal" and "median" in info and len(info["median"]) >= 3:
        tol = flat_tol if flat_tol is not None else 12
        want = (128, 128, 255)
        if any(abs(a - b) > tol for a, b in zip(info["median"][:3], want)):
            problems.append(f"median {info['median'][:3]} far from flat (128,128,255): world space "
                            "(the SDK create_normal_map() defaults to local_coordinates=False, world "
                            "space: pass True for tangent), wrong channel order or 16-bit values")
    if info.get("min") is not None and math.isnan(info["min"]):
        problems.append("NaN pixels")
    return {"kind": kind, "ok": not problems, "problems": problems, "warnings": warnings}


def _blob(mask):
    np = _np()
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    return float(xs.mean()), float(ys.mean())


def normal_orientation(path, expect_uv=(0.25, 0.75), flat=(128.0, 128.0, 255.0), threshold=20.0):
    """Read the fixture bake (a raised dome at a known UV spot on a flat plane, live_rx_04):
    - Flip V: the bump must sit where expect_uv puts it with V up (image row 0 = V 1).
    - Green convention: on the dome's upper half (toward +V) green > 128 means OpenGL (Y+),
      green < 128 means DirectX (Y-) [added: standard tangent-space reading].
    - Red: right half red > 128 unless FlipR or a mirrored layout."""
    np = _np()
    a, bits = _load_pixels(path)
    scale = 255.0 / (65535.0 if bits == 16 else 255.0) if bits in (8, 16) else 255.0
    a = a[:, :, :3] * scale
    h, w = a.shape[:2]
    dev = np.linalg.norm(a - np.array(flat), axis=2)
    c = _blob(dev > threshold)
    if c is None:
        return {"found": False}
    cx, cy = c
    ex, ey = expect_uv[0] * w, (1 - expect_uv[1]) * h
    found_uv = (cx / w, 1 - cy / h)
    ok_v = abs(found_uv[1] - expect_uv[1]) < 0.15
    mirrored_v = abs(found_uv[1] - (1 - expect_uv[1])) < 0.15
    ys, xs = np.nonzero(dev > threshold)
    upper = ys < cy
    right = xs > cx
    g_up = float(a[ys[upper], xs[upper], 1].mean() - 128) if upper.any() else 0.0
    r_right = float(a[ys[right], xs[right], 0].mean() - 128) if right.any() else 0.0
    return {"found": True, "found_uv": [round(found_uv[0], 3), round(found_uv[1], 3)],
            "expected_px": [round(ex, 1), round(ey, 1)], "flip_v_ok": ok_v,
            "looks_v_flipped": mirrored_v and not ok_v,
            "green": "OpenGL (Y+)" if g_up > 0 else "DirectX (Y-)", "green_up_mean": round(g_up, 1),
            "red_right_mean": round(r_right, 1), "red_ok": r_right > 0}


def height_orientation(path, expect_uv=(0.25, 0.75), mid=None):
    """Displacement fixture: where the raised region sits (Flip V check) and its peak above
    Mid, which is how the live test compares Export Scale 1 and 10 [verify units]."""
    np = _np()
    a, bits = _load_pixels(path)
    c0 = a[:, :, 0]
    base = float(np.median(c0)) if mid is None else mid
    peak = float(c0.max())
    mask = c0 > base + 0.5 * (peak - base) if peak > base else np.zeros_like(c0, bool)
    c = _blob(mask)
    if c is None:
        return {"found": False, "base": base, "peak": peak}
    h, w = c0.shape
    found_uv = (c[0] / w, 1 - c[1] / h)
    return {"found": True, "found_uv": [round(found_uv[0], 3), round(found_uv[1], 3)],
            "flip_v_ok": abs(found_uv[1] - expect_uv[1]) < 0.15, "base": round(base, 6),
            "peak": round(peak, 6), "height": round(peak - base, 6), "bits": bits}


# --------------------------------------------------------------------------------------------
# Agent side: generated meshes (scenario-3d) and cleanup
# --------------------------------------------------------------------------------------------

_GLTF_COMP = {5120: ("b", 127.0), 5121: ("B", 255.0), 5122: ("h", 32767.0), 5123: ("H", 65535.0),
              5125: ("I", None), 5126: ("f", None)}
_GLTF_N = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def _gltf_read(doc, binchunk, idx):
    np = _np()
    acc = doc["accessors"][idx]
    if "sparse" in acc:
        raise ValueError("sparse accessors are not supported: convert with Blender (scenario-blender-expert)")
    fmt, norm = _GLTF_COMP[acc["componentType"]]
    n = _GLTF_N[acc["type"]]
    bv = doc["bufferViews"][acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    itemsize = struct.calcsize("<" + fmt)
    stride = bv.get("byteStride") or itemsize * n
    count = acc["count"]
    dt = np.dtype("<" + fmt)
    if stride == itemsize * n:
        arr = np.frombuffer(binchunk, dtype=dt, count=count * n, offset=off).reshape(count, n)
    else:
        raw = np.frombuffer(binchunk, dtype=np.uint8, count=stride * (count - 1) + itemsize * n, offset=off)
        arr = np.stack([np.frombuffer(raw[i * stride:i * stride + itemsize * n].tobytes(), dtype=dt)
                        for i in range(count)])
    arr = arr.astype(np.float64)
    if acc.get("normalized") and norm:
        arr = arr / norm
    return arr


def _quat_mat(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def _node_matrix(node):
    np = _np()
    if "matrix" in node:
        return np.array(node["matrix"], dtype=float).reshape(4, 4).T
    m = np.eye(4)
    r = np.array(_quat_mat(node.get("rotation", [0, 0, 0, 1])))
    s = np.diag(node.get("scale", [1, 1, 1]))
    m[:3, :3] = r @ s
    m[:3, 3] = node.get("translation", [0, 0, 0])
    return m


def glb_to_obj(glb_path, obj_path, write_uvs=True, colors="auto", texture_dir=None,
               group_by="primitive"):
    """Binary glTF (the usual scenario-3d download) to OBJ for Tool:Import: node transforms
    applied, UVs flipped to OBJ (glTF v runs down: vt = 1 - v), winding kept (flipped under a
    mirroring transform), one g per primitive, embedded images written next to the OBJ.
    colors: "auto" writes ZBrush #MRGB polypaint from COLOR_0, else from the baseColor
    texture sampled at each vertex (Pillow) [verify that ZBrush reads #MRGB on import and
    the mask byte; import_mesh clears the mask]. Draco or meshopt compression: refuse and
    route to Blender. glTF is metres and Y-up."""
    np = _np()
    with open(glb_path, "rb") as fh:
        data = fh.read()
    magic, version, length = struct.unpack("<4sII", data[:12])
    if magic != b"glTF" or version != 2:
        raise ValueError("not a binary glTF 2.0 file")
    pos, doc, binchunk = 12, None, b""
    while pos < len(data):
        clen, ctype = struct.unpack("<II", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + clen]
        if ctype == 0x4E4F534A:
            doc = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            binchunk = chunk
        pos += 8 + clen
    used = set(doc.get("extensionsUsed", []))
    for ext in ("KHR_draco_mesh_compression", "EXT_meshopt_compression"):
        if ext in used:
            raise ValueError(f"{ext}: decompress with Blender first (scenario-blender-expert)")
    base = os.path.splitext(obj_path)[0]
    texture_dir = texture_dir or os.path.dirname(os.path.abspath(obj_path))
    images = []
    for i, img in enumerate(doc.get("images", [])):
        if "bufferView" in img:
            bv = doc["bufferViews"][img["bufferView"]]
            raw = binchunk[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
            ext = ".jpg" if "jpeg" in img.get("mimeType", "") else ".png"
            p = os.path.join(texture_dir, f"{os.path.basename(base)}_img{i}{ext}")
            with open(p, "wb") as fh:
                fh.write(raw)
            images.append(p)
        else:
            images.append(None)

    def base_color_image(prim):
        mi = prim.get("material")
        if mi is None:
            return None, [1, 1, 1, 1]
        pbr = doc["materials"][mi].get("pbrMetallicRoughness", {})
        fac = pbr.get("baseColorFactor", [1, 1, 1, 1])
        tex = pbr.get("baseColorTexture")
        if not tex:
            return None, fac
        src = doc["textures"][tex["index"]].get("source")
        return (images[src] if src is not None else None), fac

    if doc.get("scenes"):
        scene = doc["scenes"][doc.get("scene", 0)]
    else:                                  # no scene: every node that is nobody's child
        kids = {c for nd in doc.get("nodes", []) for c in nd.get("children", [])}
        scene = {"nodes": [i for i in range(len(doc.get("nodes", []))) if i not in kids]}
    items = []

    def walk(ni, parent):
        node = doc["nodes"][ni]
        m = parent @ _node_matrix(node)
        if "mesh" in node:
            items.append((node["mesh"], m, node.get("name")))
        for c in node.get("children", []):
            walk(c, m)

    for ni in scene.get("nodes", []):
        walk(ni, np.eye(4))
    V, T, C, F, G = [], [], [], [], []
    voff = 0
    for mesh_i, mat, nname in items:
        mesh = doc["meshes"][mesh_i]
        for pi, prim in enumerate(mesh.get("primitives", [])):
            if prim.get("mode", 4) != 4:
                continue
            if "extensions" in prim:
                raise ValueError(f"primitive extensions {list(prim['extensions'])}: use Blender")
            pos_ = _gltf_read(doc, binchunk, prim["attributes"]["POSITION"])
            ph = np.c_[pos_, np.ones(len(pos_))] @ mat.T
            V.append(ph[:, :3])
            uv = _gltf_read(doc, binchunk, prim["attributes"]["TEXCOORD_0"]) \
                if "TEXCOORD_0" in prim["attributes"] else None
            if uv is not None:
                T.append(np.c_[uv[:, 0], 1.0 - uv[:, 1]])
            col = None
            if colors and "COLOR_0" in prim["attributes"]:
                col = _gltf_read(doc, binchunk, prim["attributes"]["COLOR_0"])[:, :3]
            elif colors and uv is not None:
                img, fac = base_color_image(prim)
                if img:
                    try:
                        from PIL import Image
                        with Image.open(img) as im:
                            px = np.asarray(im.convert("RGB")).astype(np.float64) / 255.0
                        hh, ww = px.shape[:2]
                        uu = np.where((uv[:, 0] >= 0) & (uv[:, 0] <= 1), uv[:, 0], uv[:, 0] % 1.0)
                        vv = np.where((uv[:, 1] >= 0) & (uv[:, 1] <= 1), uv[:, 1], uv[:, 1] % 1.0)
                        xs = np.clip(uu * (ww - 1), 0, ww - 1).round().astype(int)
                        ys = np.clip(vv * (hh - 1), 0, hh - 1).round().astype(int)
                        col = px[ys, xs] * np.array(fac[:3])
                    except ImportError:
                        col = None
            C.append(col if col is not None else np.full((len(pos_), 3), np.nan))
            if "indices" in prim:
                idx = _gltf_read(doc, binchunk, prim["indices"]).astype(np.int64).reshape(-1, 3)
            else:
                idx = np.arange(len(pos_)).reshape(-1, 3)
            if np.linalg.det(mat[:3, :3]) < 0:
                idx = idx[:, ::-1]
            F.append(idx + voff)
            G.append((f"{nname or mesh.get('name') or 'mesh'}_{pi}" if group_by == "primitive"
                      else (nname or mesh.get("name") or "mesh"), len(idx)))
            voff += len(pos_)
    if not V:
        raise ValueError("no triangle primitives found")
    V = np.concatenate(V)
    Cc = np.concatenate(C)
    has_uv = write_uvs and len(T) == len(G) and len(T) > 0
    Tt = np.concatenate(T) if has_uv else None
    Fa = np.concatenate(F)
    with open(obj_path, "w") as fh:
        fh.write(f"# converted from {os.path.basename(glb_path)} by zb_retopology_export.glb_to_obj\n")
        fh.write("# glTF units: metres, Y up\n")
        for p in V:
            fh.write("v %.7g %.7g %.7g\n" % (p[0], p[1], p[2]))
        wrote_mrgb = False
        if colors and not np.isnan(Cc).all():
            c8 = (np.clip(np.nan_to_num(Cc, nan=1.0), 0, 1) * 255).round().astype(int)
            tokens = ["ff%02x%02x%02x" % tuple(c) for c in c8]
            for k in range(0, len(tokens), 64):
                fh.write("#MRGB " + "".join(tokens[k:k + 64]) + "\n")
            wrote_mrgb = True
        if has_uv:
            for t in Tt:
                fh.write("vt %.7g %.7g\n" % (t[0], t[1]))
        start = 0
        for name, n in G:
            fh.write(f"g {re.sub(r'[^A-Za-z0-9_]', '_', name)}\n")
            for f in Fa[start:start + n] + 1:
                if has_uv:
                    fh.write("f %d/%d %d/%d %d/%d\n" % (f[0], f[0], f[1], f[1], f[2], f[2]))
                else:
                    fh.write("f %d %d %d\n" % (f[0], f[1], f[2]))
            start += n
    lo, hi = V.min(axis=0), V.max(axis=0)
    return {"obj": obj_path, "vertices": int(len(V)), "triangles": int(len(Fa)),
            "groups": [g for g, _ in G], "uvs": bool(has_uv), "mrgb": wrote_mrgb,
            "images": [p for p in images if p], "size_m": (hi - lo).round(6).tolist(),
            "bbox_min": lo.round(6).tolist(), "bbox_max": hi.round(6).tolist()}


def roughness(obj):
    """Surface noise measure [added]: median dihedral angle between adjacent faces, scaled by
    sqrt(faces / 4 pi) so a smooth sphere reads about 1 at any density; lumps and noise read
    higher. Compare before and after cleanup at similar density; not an absolute gate."""
    np = _np()
    za = _audit()
    m = za.load_obj(obj) if isinstance(obj, str) else obj
    v, flat, sizes, starts = m.verts, m.flat, m.sizes, m.starts
    nrm = np.zeros((len(sizes), 3))
    for k in range(1, int(sizes.max()) - 1):
        sel = np.nonzero(sizes > k + 1)[0]
        p0 = v[flat[starts[sel]]]
        nrm[sel] += np.cross(v[flat[starts[sel] + k]] - p0, v[flat[starts[sel] + k + 1]] - p0)
    ln = np.linalg.norm(nrm, axis=1)
    nrm = nrm / np.where(ln > 0, ln, 1)[:, None]
    nxt = np.roll(flat, -1)
    nxt[starts + sizes - 1] = flat[starts]
    face = np.repeat(np.arange(len(sizes)), sizes)
    nv = max(len(v), 1)
    key = np.minimum(flat, nxt) * nv + np.maximum(flat, nxt)
    order = np.argsort(key, kind="stable")
    ks, fs = key[order], face[order]
    same = ks[1:] == ks[:-1]
    f1, f2 = fs[:-1][same], fs[1:][same]
    cosang = np.clip((nrm[f1] * nrm[f2]).sum(axis=1), -1, 1)
    ang = np.arccos(cosang)
    med = float(np.median(ang)) if len(ang) else 0.0
    return {"edges": int(len(ang)), "median_deg": round(math.degrees(med), 4),
            "p90_deg": round(math.degrees(float(np.percentile(ang, 90))), 4) if len(ang) else 0.0,
            "roughness_index": round(med * math.sqrt(len(sizes) / (4 * math.pi)), 4)}


def triage_ai_mesh(obj, expected_parts=None, symmetric_design=None, junk_frac=0.005):
    """First look at a generated or scanned mesh (scenario Z6), all from the OBJ: what is wrong
    and the ordered cleanup it implies. Each step carries its source."""
    np = _np()
    za = _audit()
    m = za.load_obj(obj) if isinstance(obj, str) else obj
    rep = za.audit(m, sym_tol=0.01, sym_center="bbox")   # 1 % of the diagonal: noise-tolerant
    rough = roughness(m)
    # shell sizes (faces per shell)
    flat, sizes, starts = m.flat, m.sizes, m.starts
    nxt = np.roll(flat, -1)
    nxt[starts + sizes - 1] = flat[starts]
    comp = np.asarray(_components(len(m.verts), flat, nxt))
    face_comp = comp[flat[starts]]
    _, shell_faces = np.unique(face_comp, return_counts=True)
    shell_faces = sorted((int(c) for c in shell_faces), reverse=True)
    total = max(1, rep["faces"])
    junk = [c for c in shell_faces if c < junk_frac * total]
    parts = [c for c in shell_faces if c >= junk_frac * total]
    findings, plan = {}, []
    findings.update({"faces": rep["faces"], "points": rep["points"], "tri_pct": round(100 * rep["triangles"] / total, 2),
                     "holes": len(rep["boundary_loops"]), "hole_sizes": rep["boundary_loops"][:10],
                     "non_manifold_edges": rep["non_manifold_edges"],
                     "flipped_edges": rep["inconsistent_edges"], "zero_area_faces": rep["zero_area_faces"],
                     "shells": len(shell_faces), "parts": len(parts), "junk_shells": len(junk),
                     "size": rep["size"], "center": rep["center"], "diag": rep["diag"],
                     "symmetry_bbox_pct": rep["symmetry_x_pct"], "roughness": rough,
                     "has_uvs": rep["has_uvs"]})
    ext = rep["size"]
    # hint only: a Y-up quadruped is also longer in Z than tall; confirm on a front render
    findings["z_up_hint"] = bool(ext[2] > 1.3 * ext[1])
    findings["off_center"] = bool(np.linalg.norm(rep["center"]) > 0.05 * rep["diag"])
    plan.append("Save the raw import as a versioned ZTL and Duplicate it: the untouched copy is the "
                "projection and colour source (Drust PrFQXjs_6_w 00:01:15)")
    if findings["z_up_hint"] or findings["off_center"]:
        plan.append("Fix orientation and centre before import with orient_for_import: rotate -90 "
                    "about X only for Z-up, centre only when off-centre, import the file it names "
                    "[added]")
    if rep["non_manifold_edges"] or rep["inconsistent_edges"] or rep["zero_area_faces"]:
        plan.append("Fix Mesh (Mesh Integrity doc); DynaMesh also repairs mesh errors since 2023.1 "
                    "(version deltas 3.3); Double off shows flipped faces (Pavlovich n5 00:34:20)")
    if junk:
        plan.append(f"{len(junk)} floating shells under {junk_frac:.1%} of the faces: Auto Groups, "
                    "Split To Parts, hide them (Drust PrFQXjs_6_w 00:10:33)")
    if expected_parts and len(parts) < expected_parts:
        plan.append(f"{len(parts)} shells for {expected_parts} intended parts: parts are fused. "
                    "Colour-separated: Polygroups From Polypaint + Groups Split [added]; else ask "
                    "scenario-3d for part segmentation, or SliceCurve cuts by a human")
    if rep["boundary_loops"]:
        plan.append(f"{len(rep['boundary_loops'])} holes: Close Holes (no levels; fills get their own "
                    "polygroup: udiPVJIODX0 00:04:30); if DynaMesh then shows swiss cheese the shell is "
                    "too thin: thicken first (PrFQXjs_6_w 00:02:53)")
    plan.append("Merge the parts of one body in the SAME Tool with MergeDown (merge_down_run), then "
                "DynaMesh with Blur 0 and Project off at a resolution that holds the thinnest part "
                "(dynamesh_resolution_for; Drust started at 512, PrFQXjs_6_w 00:01:48), keeping "
                "polygroups on purpose: polypaint on keeps paint INSTEAD of groups (dynamesh_keep; "
                "DynaMesh doc, PolyGroups > Important)")
    if rough["roughness_index"] > 2.0:
        plan.append(f"surface noise (roughness index {rough['roughness_index']}): Polish passes, or a "
                    "lower DynaMesh (Drust 128 kept the silhouette at about 50k points, 00:15:30)")
    if symmetric_design or (symmetric_design is None and rep["symmetry_x_pct"] > 80):
        plan.append("Symmetric design: Mirror And Weld the better half on the DynaMesh, then ZRemesher "
                    "with symmetry on (ZRemesher doc, Symmetry)")
    plan.append("ZRemesher per part (5 to 20 thousand), then Divide + Project All Dist 0.1 from the "
                "CLEANED DynaMesh, never from the noisy raw mesh [added: the raw noise would return]")
    if rep["has_uvs"] or (isinstance(obj, str) and obj_header(obj)["mrgb_lines"]):
        plan.append("Colour: project it last from the raw duplicate with Colorize on for source and "
                    "target (Drust PrFQXjs_6_w 00:16:35), or re-bake it later from the source "
                    "texture")
    return {"findings": findings, "plan": plan, "audit": rep}


def orient_for_import(obj, triage, out_path, zup=None, center=None):
    """Decide the file ZBrush imports. glTF is Y-up by specification [added], so the common
    case needs nothing: rotate -90 about X ONLY for a Z-up hint (or zup=True after a front
    render), centre ONLY when off-centre, and import the original file when neither applies.
    The Z6 grade caught the older branch: rotating whenever the mesh was off-centre laid a
    Y-up model on its back, and importing a file that was never written."""
    f = triage["findings"] if "findings" in triage else triage
    rot = bool(f.get("z_up_hint")) if zup is None else bool(zup)
    cen = bool(f.get("off_center")) if center is None else bool(center)
    if not rot and not cen:
        return {"import": obj, "rotated": False, "centered": False}
    r = obj_transform(obj, out_path, rotate_x_deg=-90.0 if rot else 0.0, center=cen)
    return {"import": out_path, "rotated": rot, "centered": cen, "transform": r}


def hole_plugs(obj, embed=1.3, max_holes=None, min_loop=3):
    """Where to put plug primitives: one row per boundary loop of an OBJ export (centre,
    diameter, loop size), converted to ZBrush INTERNAL units through the file's '#Auto scale'
    and '#Auto offset' header (exported = (internal + offset) x scale, the convention of
    placement_offsets [verify live_rx_05]). diameter = 2 x mean radius x embed, so the sphere
    sits in the surface as Drust's embedded PolySpheres do (PrFQXjs_6_w 00:08:22). The SDK
    cannot read vertices (scan-cleanup note), the file can. Biggest holes first."""
    np = _np()
    za = _audit()
    m = za.load_obj(obj)
    h = obj_header(obj)
    sc = np.array(h["auto_scale"] or [1.0, 1.0, 1.0], dtype=float)
    off = np.array(h["auto_offset"] or [0.0, 0.0, 0.0], dtype=float)
    sc[sc == 0] = 1.0
    flat, sizes, starts = m.flat, m.sizes, m.starts
    nxt = np.roll(flat, -1)
    nxt[starts + sizes - 1] = flat[starts]
    nv = max(len(m.verts), 1)
    lo, hi = np.minimum(flat, nxt), np.maximum(flat, nxt)
    keys, counts = np.unique(lo * nv + hi, return_counts=True)
    b = keys[counts == 1]
    if len(b) == 0:
        return []
    eu, ev = b // nv, b % nv
    verts, inv = np.unique(np.concatenate([eu, ev]), return_inverse=True)
    comp = np.asarray(_components(len(verts), inv[:len(eu)], inv[len(eu):]))
    rows = []
    for c in np.unique(comp):
        vid = verts[comp == c]
        if len(vid) < min_loop:
            continue
        pts = m.verts[vid] / sc - off
        ctr = pts.mean(axis=0)
        rad = float(np.linalg.norm(pts - ctr, axis=1).mean())
        rows.append({"center": [round(float(v), 6) for v in ctr],
                     "diameter": round(2.0 * rad * embed, 6), "loop_vertices": int(len(vid))})
    rows.sort(key=lambda r: -r["diameter"])
    return rows[:max_holes] if max_holes else rows


def cleanup_verdict(raw_rep, clean_rep, expected_shells=1, bbox_tol_pct=2.0, volume_tol_pct=5.0,
                    raw_rough=None, clean_rough=None, symmetric=False, min_symmetry_pct=99.0):
    """The cleaned sculpt passes when it is closed and manifold, has the intended shells, keeps
    the silhouette of the raw mesh (bbox per axis within bbox_tol_pct, volume within
    volume_tol_pct [added]) and is less noisy (roughness index at most 0.8 x the raw one
    [added], compared at similar density)."""
    problems, warnings = [], []
    if clean_rep["boundary_loops"]:
        problems.append(f"{len(clean_rep['boundary_loops'])} holes left")
    if clean_rep["non_manifold_edges"] or clean_rep["inconsistent_edges"]:
        problems.append("non-manifold or flipped edges left")
    if clean_rep["shells"] != expected_shells:
        problems.append(f"{clean_rep['shells']} shells, expected {expected_shells}")
    for i, ax in enumerate("xyz"):
        r, c = raw_rep["size"][i], clean_rep["size"][i]
        if r > 0 and abs(c - r) / r * 100 > bbox_tol_pct:
            problems.append(f"{ax} extent changed {abs(c - r) / r * 100:.2f} %: forms or parts lost")
    if raw_rep.get("volume") and clean_rep.get("volume") and raw_rep["volume"] > 0:
        dv = (clean_rep["volume"] - raw_rep["volume"]) / raw_rep["volume"] * 100
        if abs(dv) > volume_tol_pct:
            warnings.append(f"volume changed {dv:.2f} % (Polish shrinks; project from the cleaned "
                            "DynaMesh to restore)")
    if raw_rough and clean_rough and clean_rough["roughness_index"] > 0.8 * raw_rough["roughness_index"]:
        warnings.append(f"roughness {clean_rough['roughness_index']} vs raw "
                        f"{raw_rough['roughness_index']}: surface still lumpy")
    if symmetric and clean_rep.get("symmetry_x_pct", 100) < min_symmetry_pct:
        warnings.append(f"symmetry {clean_rep['symmetry_x_pct']} % < {min_symmetry_pct} %")
    return {"ok": not problems, "problems": problems, "warnings": warnings}


# --------------------------------------------------------------------------------------------
# Targets: map and export settings per renderer or engine
# --------------------------------------------------------------------------------------------

MME_COMMON = {(None, "FlipV"): 1, (None, "SubTools"): 1, ("disp", "Adaptive"): 0,
              ("disp", "DpSubPix"): 0, ("disp", "SubDiv level"): 1}

MME_PRESETS = {
    # Film displacement for Arnold (FlippedNormals -ThBTEc8L_M 00:04:09 to 00:12:13)
    "arnold": {**MME_COMMON, (None, "Displacement"): 1, (None, "Normal"): 0, ("disp", "32Bit"): 1,
               ("disp", "exr"): 1, ("disp", "3 Channels"): 0, ("disp", "Mid"): 0.5,
               ("disp", "SmoothUV"): 1, (None, "Merge Maps"): 0},
    # Redshift: Mid 0, Scale 1 for 32-bit (MME doc)
    "redshift": {**MME_COMMON, (None, "Displacement"): 1, ("disp", "32Bit"): 1, ("disp", "exr"): 1,
                 ("disp", "3 Channels"): 0, ("disp", "Mid"): 0.0, ("disp", "Scale"): 1.0,
                 ("disp", "SmoothUV"): 1},
    # Blender Cycles: 32-bit EXR, Midlevel = Mid [added]
    "blender": {**MME_COMMON, (None, "Displacement"): 1, ("disp", "32Bit"): 1, ("disp", "exr"): 1,
                ("disp", "3 Channels"): 0, ("disp", "Mid"): 0.5, ("disp", "SmoothUV"): 1},
    # Preview maps only for engines (bake the game normal in the engine's tangent basis)
    "engine_preview": {**MME_COMMON, (None, "Normal"): 1, ("normal", "Tangent"): 1,
                       ("normal", "SubDiv level"): 1, (None, "Ambient Occlusion"): 1,
                       (None, "Cavity"): 1},
    # ID map for Substance Painter from polypaint (FlippedNormals p56N-dN11zY 00:09:45)
    "substance_id": {(None, "Texture from Polypaint"): 1, (None, "SubTools"): 0, (None, "FlipV"): 1},
}

RENDERERS = {
    "arnold": {
        "mesh": "OBJ at level 1, Qud, Txr on, Grp off (FlippedNormals -ThBTEc8L_M 00:15:08); cm",
        "zbrush": "MME: Displacement, 32Bit + exr, 3 Channels off, Mid 0.5 (or 0), SubDiv level 1, "
                  "Adaptive off, DpSubPix 0, SmoothUV on, Flip V on, UDIM file names with a dot "
                  "before the tile (-ThBTEc8L_M 00:06:13 to 00:14:22)",
        "receiver": "File node Filter off, UV Tiling Mode UDIM (Mari); shape Arnold subdivision "
                    "Catmull-Clark, iterations about 3 (ideally the ZBrush level count), Auto Bump "
                    "on; displacement Scalar Zero Value = Mid (0.5 or 0) (-ThBTEc8L_M 00:17:29 to "
                    "00:20:35, description correction); colour space Raw [added]",
        "normal": "tangent if used for micro detail; Maya/Arnold read OpenGL (Y+) [added]",
        "handoff": "scenario-maya-lookdev (displacement EXR with its zero value and scale recorded)"},
    "redshift": {
        "mesh": "OBJ level 1 or GoZ; host units",
        "zbrush": "MME: 32Bit + exr, Mid 0, Scale 1 (MME doc) or Mid 0.5 with the node remapped",
        "receiver": "object tessellation and displacement on; Displacement node: with Mid 0.5 set "
                    "the new range so 0.5 maps to zero [added, verify field names]",
        "normal": "tangent, OpenGL (Y+) in Maya and C4D hosts [added]",
        "handoff": "scenario-maya-lookdev or scenario-zbrush-paint-render (Redshift inside ZBrush)"},
    "unreal": {
        "mesh": "triangulated game mesh (bake and engine share one triangulation: Polycount); "
                "FBX through scenario-maya-expert or scenario-blender-expert from the ZBrush OBJ, cm, Z-up handled by "
                "the importer [added]",
        "zbrush": "no film displacement; decimated high (Keep UVs off) + low for an external bake "
                  "in the engine tangent basis, or Substance Bridge Low & High",
        "receiver": "normal map DirectX (Y-): Unreal texture 'Flip Green Channel' for OpenGL maps "
                    "[added]; 8-bit TGA/PNG after a 16-bit bake (Polycount)",
        "normal": "DirectX (Y-) [added]; ZBrush MME FlipG decided by the live_rx_04 fixture",
        "handoff": "engine import by a human or an Unreal skill; the mesh audit and scale report"},
    "unity": {
        "mesh": "FBX with the Unity axis preset (FBX doc lists Unity) or OBJ; metres [added]",
        "zbrush": "as Unreal: external bake or Substance Bridge",
        "receiver": "normal map OpenGL (Y+) [added], texture type Normal map",
        "normal": "OpenGL (Y+) [added]",
        "handoff": "engine import; audit and scale report"},
    "substance": {
        "mesh": "2026.2+: Texture > Substance Bridge: Low & High, Auto-Bake, Smooth Normals, Texture "
                "Sets Per PolyGroup or Per Subtool, Force Auto-Unwrap OFF when UVs exist (doc; labels "
                "[uistr]); each send is a new Painter project. Film route: Decimation Master 150k "
                "with Keep UVs, MergeVisible with UV on, polygroups as texture sets, smooth normals "
                "(FlippedNormals p56N-dN11zY 00:01:25 to 00:06:36)",
        "zbrush": "ID map: MME Texture from Polypaint, SubTools off, Flip V on (p56N-dN11zY 00:10:17)",
        "receiver": "Painter project normal format OpenGL by default [added]; name low and high "
                    "meshes _low/_high for match-by-name bakes (Polycount)",
        "normal": "baked by Painter (MikkT) [added]",
        "handoff": "a human or a Substance skill; Painter cannot be checked from ZBrush"},
    "blender": {
        "mesh": "OBJ (Blender importer converts Y-up to Z-up) [added]; metres, so Export Scale for "
                "a size in metres or scale on import; GoB is the round-trip addon (FlippedNormals "
                "2-pFspCbykk)",
        "zbrush": "MME 32Bit + exr, Mid 0.5 (or 0), SmoothUV on",
        "receiver": "Displacement node Midlevel = Mid, Scale = 1 x unit ratio [added, verify with the "
                    "live_rx_04 units test]; material displacement 'Displacement and Bump' plus a "
                    "Subdivision modifier [added]; Normal Map node convention OPENGL (scenario-blender-uv-baking)",
        "normal": "OpenGL (Y+); game bakes in Blender with scenario-blender-uv-baking bake_high_to_low",
        "handoff": "scenario-blender-uv-baking, scenario-blender-texturing-shading"},
}


def renderer_plan(target):
    """Settings for one target, with the MME preset when one applies."""
    if target not in RENDERERS:
        raise ValueError(f"target must be one of {sorted(RENDERERS)}")
    plan = dict(RENDERERS[target])
    key = {"unreal": "engine_preview", "unity": "engine_preview", "substance": "substance_id"}.get(target, target)
    plan["mme_preset"] = {f"{g or 'main'}:{l}": v for (g, l), v in MME_PRESETS.get(key, {}).items()}
    return plan


def handoff_report(path, **fields):
    """JSON the receiving skill reads: meshes, maps, units, axis, Export Scale, displacement
    Mid and scale, normal convention, audits, and the list of what was not verified."""
    payload = {"written": time.strftime("%Y-%m-%d %H:%M:%S"), "by": "scenario-zbrush-retopology-export",
               **fields}
    payload.setdefault("not_verified", [])
    with open(path, "w") as fh:
        json.dump(payload, fh, indent=1, default=repr)
    return path


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-zbrush-retopology-export agent-side checks")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("topo")
    a.add_argument("obj")
    a.add_argument("--rings", nargs="*", default=())
    a.add_argument("--purpose", default="rig")
    a.add_argument("--target-faces", type=int)
    b = sub.add_parser("uv")
    b.add_argument("obj")
    b.add_argument("--udim", action="store_true")
    c = sub.add_parser("scale")
    c.add_argument("obj")
    c.add_argument("target", type=float)
    c.add_argument("--unit", default="cm")
    d = sub.add_parser("map")
    d.add_argument("image")
    d.add_argument("--kind", default="displacement")
    d.add_argument("--mid", type=float)
    e = sub.add_parser("triage")
    e.add_argument("obj")
    e.add_argument("--parts", type=int)
    f = sub.add_parser("glb")
    f.add_argument("glb")
    f.add_argument("obj")
    ns = ap.parse_args()
    if ns.cmd == "topo":
        r = topo_report(ns.obj, tuple(ns.rings))
        r["verdict"] = retopo_verdict(r, ns.purpose, ns.target_faces, ring_groups=tuple(ns.rings))
    elif ns.cmd == "uv":
        r = uv_report(ns.obj)
        r["verdict"] = uv_verdict(r, ns.udim)
    elif ns.cmd == "scale":
        r = scale_report(ns.obj, ns.target, unit=ns.unit)
    elif ns.cmd == "map":
        r = map_info(ns.image)
        r["verdict"] = map_verdict(r, ns.kind, mid=ns.mid)
    elif ns.cmd == "triage":
        r = triage_ai_mesh(ns.obj, ns.parts)
        r.pop("audit", None)
    else:
        r = glb_to_obj(ns.glb, ns.obj)
    print(json.dumps(r, indent=1, default=repr))
