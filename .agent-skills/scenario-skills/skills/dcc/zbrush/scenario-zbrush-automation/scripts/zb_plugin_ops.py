"""
zb_plugin_ops: the per-file and per-SubTool operations of batch jobs, plugin automation
(UV Master, Decimation Master, Multi Map Exporter), map export, GoZ by path, SubTool
inventory and naming. Runs INSIDE ZBrush 2026 (CPython 3.11.9).

It builds on scenario-zbrush-expert's zb_ops (checked presses, stats, exports, DynaMesh, ZRemesher,
Divide, Project All, UV unwrap, decimate) and never re-implements them; the ZBrush handle is
zb_ops.zbc, so tests inject one fake for both modules. Call it from the agent side with
zb_batch.remote_call("zb_plugin_ops", "<func>", ...), which puts both skills' script folders
on sys.path only while importing (Maxon's shared-interpreter rule).

Status: NOT YET RUN IN ZBRUSH. Offline tests run the logic against a fake zbc
(tests/code/zbrush-automation/test_zb_plugin_ops.py); live checks are the live_a* files.
Path evidence tags as in zb_ops: [bridge] proven on 2026.2.1, [doc] Maxon docs, [macro]
shipped 2026 macro, [cb] community bridge tested on 2026.2 (usd-portal), [verify] unknown.

Refactor 2026-09-24 (offline only): make_low(auto_groups=True) is cgside's Auto Groups then
ZRemesher Keep Groups; divide_project needs a checkpoint and goes through the lead's safe
zb_ops.project_all (versioned save first, morph target each pass, a layer on the last pass,
Dist 0.1, gates); SubTool loops run under zb_ops.quiet() (show_actions 0).
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import os
import time

import zb_ops

PATHS = {
    "polymesh_star": ["Tool:PolyMesh3D"],                              # [cb] usd-portal
    "import": ["Tool:Import"],                                         # [bridge] exists
    "duplicate": ["Tool:SubTool:Duplicate"],                           # [bridge] needs Edit
    "move_up": ["Tool:SubTool:MoveUp", "Tool:SubTool:Move Up"],        # [macro] MadPony
    "move_down": ["Tool:SubTool:MoveDown", "Tool:SubTool:Move Down"],  # [macro]
    "subtool_title": ["Tool:SubTool:ItemInfo"],                        # [cb] IGetTitle, minus ". "
    "export_scale": ["Tool:Export:Scale"],                             # [doc] Scale Master page
    "export_x_offset": ["Tool:Export:X Offset", "Tool:Export:XOffset"],  # [verify]
    "export_y_offset": ["Tool:Export:Y Offset", "Tool:Export:YOffset"],  # [verify]
    "export_z_offset": ["Tool:Export:Z Offset", "Tool:Export:ZOffset"],  # [verify]
    "uv_map_size": ["Tool:UV Map:UV Map Size"],                        # [doc] reference [verify]
    "nm_clone": ["Tool:Normal Map:Clone NM"],                          # [doc] reference [verify]
    "nm_create": ["Tool:Normal Map:Create NormalMap"],                 # [doc] reference [verify]
    "nm_tangent": ["Tool:Normal Map:Tangent"],                         # [doc] reference [verify]
    "disp_clone": ["Tool:Displacement Map:Clone Disp"],                # [doc] reference [verify]
    "texture_export": ["Texture:Export"],                              # [cb] usd-portal
    "alpha_export": ["Alpha:Export"],                                  # [verify]
    "texture_flip_v": ["Texture:Flip V", "Texture:FlipV"],             # [verify]
    "dm_delete_caches": ["Zplugin:Decimation Master:Delete caches",
                         "Zplugin:Decimation Master:Utilities:Delete caches"],  # [doc] label [verify]
    "mme_create": ["Zplugin:Multi Map Exporter:Create All Maps"],      # [bridge] exists
    "mme_normal": ["Zplugin:Multi Map Exporter:Normal Map"],           # [verify]
    "mme_disp": ["Zplugin:Multi Map Exporter:Displacement Map"],       # [verify]
    "mme_texture": ["Zplugin:Multi Map Exporter:Texture From Polypaint"],  # [verify]
    "mme_ao": ["Zplugin:Multi Map Exporter:Ambient Occlusion"],        # [verify]
    "mme_cavity": ["Zplugin:Multi Map Exporter:Cavity"],               # [verify]
    "mme_flip_v": ["Zplugin:Multi Map Exporter:Flip V"],               # [verify]
    "mme_map_size": ["Zplugin:Multi Map Exporter:Map Size"],           # [verify]
}

UV_MASTER_MAX_FACES = 150_000        # UV Master doc: 100k to 150k recommended maximum


class PluginOpError(zb_ops.ZBOpError):
    pass


def _z():
    return zb_ops._z()


def _res(key, required=True):
    return zb_ops.resolve(PATHS.get(key, key) if isinstance(key, str) else key, required)


# --------------------------------------------------------------------------------------------
# Pure helpers (also used on the agent side and in offline tests)
# --------------------------------------------------------------------------------------------

def divide_levels(low_faces, source_faces, max_levels=6, max_faces=8_000_000):
    """Smallest n with low_faces * 4**n >= source_faces, so the projected stack can hold the
    source detail (Divide multiplies faces by 4: Pablo, Logic Part 7), clamped to max_levels
    and to max_faces at the top level [added]."""
    if not low_faces or low_faces <= 0:
        raise ValueError("low_faces must be > 0")
    n = 0
    while low_faces * 4 ** n < source_faces and n < max_levels:
        n += 1
    while n > 0 and low_faces * 4 ** n > max_faces:
        n -= 1
    return n


def decimation_percent(points, target_faces=None, target_points=None, lo=0.01, hi=100.0):
    """Decimation Master '% of decimation' to reach a triangle count. The percentage applies
    to points (ijacobs' 2013 script: 75000 / points * 100; cgside: points / 10 in
    thousands), and a closed triangle mesh has about two faces per point (Euler) [added], so
    target_points = target_faces / 2. Clamped to the slider range 0.01 to 100 (DM doc)."""
    if target_points is None:
        if target_faces is None:
            raise ValueError("give target_faces or target_points")
        target_points = target_faces / 2.0
    pct = 100.0 * float(target_points) / float(points)
    return round(min(max(pct, lo), hi), 3)


def clean_title(title):
    """SubTool titles end with '. ' (usd-portal drops the last 2 characters; MadPony 00:00:32)."""
    return (title or "").rstrip().rstrip(".").strip()


# --------------------------------------------------------------------------------------------
# Session hygiene and probes
# --------------------------------------------------------------------------------------------

def memory():
    """zbrush_info 2 runtime s, 3 physical memory used, 4 virtual, 5 free [doc]; units are
    not documented [verify], log them per file to see growth across a batch."""
    z = _z()
    return {"runtime_s": z.zbrush_info(2), "mem_used": z.zbrush_info(3),
            "virtual": z.zbrush_info(4), "free": z.zbrush_info(5)}


def probe(paths):
    """Path discovery: exists, enabled, value, range, title and popup info per item path.
    Paths ignore case and spaces (SDK Item Paths); a miss means a wrong label or a missing
    precondition (Edit off, not a PolyMesh3D, plugin absent)."""
    z = _z()
    out = {}
    for p in paths:
        r = {"exists": bool(z.exists(p))}
        if r["exists"]:
            for k, fn in (("enabled", z.is_enabled), ("value", z.get), ("min", z.get_min),
                          ("max", z.get_max), ("title", z.get_title), ("info", z.get_info)):
                try:
                    r[k] = fn(p)
                except Exception as e:  # a button has no range, a slider no title...
                    r[k] = f"error: {e!r}"[:120]
        out[p] = r
    return out


def press_guarded(path, file=None, overwrite=False, check_enabled=True):
    """exists + enabled, set_next_filename when a file is involved, press, then the preset
    check: has_next_filename() still True after the press means the button did not consume
    it (a plugin with its own dialog, e.g. FBX ExportImport or USD Format)."""
    z = _z()
    p = _res([path])
    if check_enabled and not z.is_enabled(p):
        raise PluginOpError(f"{p} is disabled in the current state")
    t0 = time.time()
    if file:
        file = os.path.abspath(file)
        os.makedirs(os.path.dirname(file), exist_ok=True)
        if os.path.exists(file) and not overwrite:
            raise PluginOpError(f"{file} exists (pass overwrite=True; a .bak is kept)")
        if os.path.exists(file):
            os.replace(file, file + time.strftime(".%Y%m%d-%H%M%S.bak"))
        z.set_next_filename(file)
    z.press(p)
    z.update(redraw_ui=True)
    out = {"path": p, "seconds": round(time.time() - t0, 3)}
    if file:
        pending = bool(z.has_next_filename())
        out.update(file=file, preset_pending=pending, wrote=os.path.exists(file),
                   bytes=os.path.getsize(file) if os.path.exists(file) else 0)
        if pending:
            z.set_next_filename()          # clear it so the next dialog is not pre-filled
            out["warning"] = "preset not consumed: a dialog or plugin ignored it"
    return out


def press_macro(name, folder="AgentHelpers"):
    """Press a ZScript macro button (for IKeyPress or MergeUndo tricks Python lacks). Macros
    load from <Asset Directory>/ZStartup/Macros/<folder>/<name>.txt, name of 8+ characters,
    new folder needs a restart (interfaces doc). Path form [verify]."""
    z = _z()
    cands = [f"Macro:{folder}:{name}", f"Macro:Macros:{folder}:{name}", f"Macro:{name}"]
    for p in cands:
        if z.exists(p):
            z.press(p)
            z.update(redraw_ui=True)
            return {"pressed": p}
    raise PluginOpError(f"macro not found as any of {cands}: installed, 8+ chars, restarted?")


# --------------------------------------------------------------------------------------------
# Per-file steps
# --------------------------------------------------------------------------------------------

def _tool_name():
    return _z().get_active_tool_path().rsplit("/", 1)[-1]


def export_settings():
    """Export Scale and offsets: an OBJ import sets them, so exports return to the input
    size (Outgang [00:24:03], [00:31:27]); Scale 0 means never set."""
    z = _z()
    out = {}
    for k in ("export_scale", "export_x_offset", "export_y_offset", "export_z_offset"):
        p = _res(k, required=False)
        out[k] = z.get(p) if p else None
    return out


def import_mesh(path, expect_points=None, expect_faces=None, frame=True):
    """OBJ (or GoZ) as a NEW tool: press the PolyMesh3D star, preset the file, Tool:Import,
    then draw and enter Edit when Edit is off (usd-portal _ZS_SEND, tested on 2026.2: never
    SimpleBrush, and Import onto an existing tool REPLACES its active SubTool). The tool
    takes the file name, so stage inputs under unique names first (zb_batch.stage_input)."""
    z = _z()
    path = os.path.abspath(path)
    if not os.path.exists(path):
        raise PluginOpError(f"input missing: {path}")
    tools_before = z.get_tool_count()
    z.press(_res("polymesh_star"))
    z.set_next_filename(path)
    z.press(_res("import"))
    z.update(redraw_ui=True)
    pending = bool(z.has_next_filename())
    if pending:
        z.set_next_filename()
        raise PluginOpError(f"Tool:Import did not consume the preset for {path}: dialog?")
    drew = False
    if z.get("Transform:Edit") < 0.5:
        z.canvas_click(10, 10, 10, 20)            # usd-portal: only when Edit is off
        z.set("Transform:Edit", 1)
        drew = True
    zb_ops.ensure_edit()
    if frame:
        fp = zb_ops.resolve("fit", required=False)
        if fp:
            z.press(fp)
    st = zb_ops.stats()
    out = {"tool": _tool_name(), "tools_before": tools_before, "tools_after": z.get_tool_count(),
           "drew": drew, "stats": st, "export": export_settings(), "warnings": []}
    if expect_points is not None and st.get("points") != expect_points:
        out["warnings"].append(f"points {st.get('points')} != file {expect_points} (welded or split?)")
    if expect_faces is not None and st.get("faces") != expect_faces:
        out["warnings"].append(f"faces {st.get('faces')} != file {expect_faces}")
    return out


def make_low(target_k=5.0, adaptive=None, keep_groups=None, adaptive_size=None, mode=None,
             auto_groups=False):
    """Keep the active SubTool as the projection source: Duplicate it (Edit mode needed,
    usd-portal) and ZRemesher the copy (zb_ops.zremesher, target in thousands). Returns
    ctx {"source", "low"} indices for later steps.
    auto_groups=True is cgside's recipe (MyhwQvkcnwI 00:01:43 to 00:02:51, 00:08:38 to
    00:09:42): Polygroups > Auto Groups (one group per separate piece), then ZRemesher with
    Keep Groups, so the new topology follows the parts instead of bridging them. Done on the
    copy [added], so the source keeps its own groups. It replaces the copy's polygroups:
    leave it off when the input's groups carry meaning (material or UV splits). With Adapt
    on, groups make ZRemesher overshoot the target (scenario-zbrush-retopology-export)."""
    z = _z()
    zb_ops.ensure_edit()
    src = z.get_active_subtool_index()
    n0 = z.get_subtool_count()
    z.press(_res("duplicate"))
    z.update(redraw_ui=True)
    if z.get_subtool_count() != n0 + 1:
        raise PluginOpError(f"Duplicate did not add a SubTool ({n0} -> {z.get_subtool_count()})")
    low = z.get_active_subtool_index()
    if low == src:                                  # duplicate not auto-selected [verify]
        low = src + 1
        z.select_subtool(low)
    groups = None
    if auto_groups:
        groups = zb_ops.polygroups("auto")
        if keep_groups is None:
            keep_groups = True
    zr = zb_ops.zremesher(target_k, adaptive=adaptive, keep_groups=keep_groups,
                          adaptive_size=adaptive_size, mode=mode)
    return {"ctx": {"source": src, "low": low}, "zremesher": zr, "auto_groups": groups,
            "keep_groups": keep_groups}


def _select(index):
    z = _z()
    if index is not None and z.select_subtool(int(index)) == -1:
        raise PluginOpError(f"no SubTool {index}")


def uv_master(index=None, polygroups=None, symmetry=None, max_faces=UV_MASTER_MAX_FACES):
    """UV Master Unwrap on one SubTool at its lowest level. Guards: no subdivision levels
    (unwrap the base, UV Master doc) and faces under the 150k recommendation (the doc: up to
    5 minutes at 150k). A ZScript that pressed UV Master lost control for good
    (marcus_civis 2014); from Python [verify live_a03]: run this as its own bridge call with
    a short timeout. No Work On Clone here: a batch low has no levels and no polypaint."""
    _select(index)
    st = zb_ops.stats()
    if st.get("sdiv_max", 1) > 1:
        raise PluginOpError("SubTool has subdivision levels: unwrap the base mesh before Divide")
    if st.get("faces", 0) > max_faces:
        raise PluginOpError(f"{st['faces']} faces > {max_faces}: UV Master is slow and unstable "
                            "above 150k (doc); unwrap a ZRemeshed low instead")
    r = zb_ops.uv_unwrap("uvmaster", auto_seams=None, symmetry=symmetry, polygroups=polygroups)
    if not r.get("uv_bbox"):
        raise PluginOpError("UV Master returned but the SubTool has no UVs")
    return r


def uv_native(index=None, auto_seams=True, symmetry=None):
    """Fallback without the plugin: Tool > UV Map > Create (Unwrap) (2023+, [doc])."""
    _select(index)
    r = zb_ops.uv_unwrap("native", auto_seams=auto_seams, symmetry=symmetry)
    if not r.get("uv_bbox"):
        raise PluginOpError("native Unwrap returned but the SubTool has no UVs")
    return r


def export_subtool(index, path, overwrite=True):
    """One SubTool to OBJ or .GoZ by path (the extension picks the format; .GoZ by path is
    usd-portal's reliable carrier of UVs and polypaint). zb_ops.export_obj does the preset,
    the press and the on-disk check."""
    _select(index)
    return zb_ops.export_obj(path, overwrite=overwrite)


def divide_project(low, source, levels=None, max_levels=6, max_faces=8_000_000,
                   dist=zb_ops.PROJECT_DIST, pa_blur=None, checkpoint=None, store_mt=True,
                   layer="last"):
    """Divide the low and Project All from the source after each Divide (cgside's recipe;
    Maxon: only source and target visible). levels None picks divide_levels(). Returns faces
    per level; each level should be 4x the previous.
    Every pass goes through the lead's safe zb_ops.project_all: `checkpoint` (an absolute
    .ztl path, required) is saved versioned before the FIRST Project All (cgside saves
    before ProjectAll "since it might crash", 00:02:19; the later divides replay from it);
    Dist is set explicitly (0.1 unless given); a morph target is stored at each new top
    level (the previous one dies with the Divide's point-count change); layer "last" adds
    one New Layer on the final pass only, the top level where FlippedNormals set up both
    nets (Zp07GW3rND0 00:02:13); True adds one per pass [verify Divide with a recording
    layer, live_a02]. The gates of each pass are merged into "gate"."""
    z = _z()
    _select(source)
    src_faces = zb_ops.stats().get("faces")
    _select(low)
    low_faces = zb_ops.stats().get("faces")
    n = levels if levels is not None else divide_levels(low_faces, src_faces, max_levels, max_faces)
    vis = [s for s in zb_ops.subtools() if s["visible"]]
    if len(vis) != 2:
        raise PluginOpError(f"{len(vis)} visible SubTools: Project All wants only source and "
                            "target visible (hide the others first)")
    if n and checkpoint is None:
        raise PluginOpError("divide_project needs checkpoint='/abs/name.ztl' (versioned save "
                            "before the first Project All) or False right after a save")
    per_level = []
    gate = {"ok": True, "problems": [], "warnings": []}
    with zb_ops.quiet():
        for i in range(int(n)):
            _select(low)
            d = zb_ops.divide(1)
            lay = (i == int(n) - 1) if layer == "last" else bool(layer)
            p = zb_ops.project_all(dist=dist, pa_blur=pa_blur,
                                   checkpoint=checkpoint if i == 0 else False,
                                   store_mt=store_mt, layer=lay, exclusive=True)
            g = p.get("gate") or {}
            gate["ok"] = gate["ok"] and g.get("ok", True)
            gate["problems"] += [f"level {i + 2}: {m}" for m in g.get("problems", [])]
            gate["warnings"] += [f"level {i + 2}: {m}" for m in g.get("warnings", [])]
            per_level.append({"faces": d["faces_after"], "ratio": d["ratio"],
                              "volume_after": p["volume_after"], "gate": g,
                              "checkpoint": (p.get("checkpoint") or {}).get("path"),
                              "morph_target": p["morph_target"].get("stored"),
                              "layer": p["layer"].get("created")})
            z.update(redraw_ui=True)
    out = {"levels": n, "source_faces": src_faces, "low_faces": low_faces,
           "per_level": per_level, "top_faces": per_level[-1]["faces"] if per_level else low_faces,
           "checkpoint": per_level[0]["checkpoint"] if per_level else None, "gate": gate}
    if gate["problems"] or gate["warnings"]:
        out["repair"] = zb_ops.REPAIR
    return out


def _lowest_level():
    """SDiv to 1 by the slider, else Lower Res presses (capped)."""
    z = _z()
    p = zb_ops.resolve("sdiv", required=False)
    if p:
        z.set(p, 1)
        z.update(redraw_ui=True)
        if z.get(p) <= 1.01:
            return 1
    lr = zb_ops.resolve("lower_res", required=False)
    for _ in range(12):
        if not lr or not z.is_enabled(lr):
            break
        z.press(lr)
    return z.get(p) if p else None


def normal_map(index, path, size=2048, tangent=True, smooth=True, border=8, level=None,
               overwrite=True):
    """Tangent normal map of the SubTool's levels (lowest vs highest of the SAME SubTool:
    AskZBrush n0qqpwvn-jA [00:01:14]) with the SDK call create_normal_map (local_coordinates
    True = tangent; the default False is world space), then Tool > Normal Map > Clone NM and
    Texture > Export by preset [verify both paths]. The PNG is exported as ZBrush makes it:
    zb_batch.fix_normal_map() flips V (and green for DirectX engines) on the agent side, where
    the result can be checked. level None bakes from the lowest level (forms and detail);
    level = top - 1 keeps only micro detail (AskZBrush 2zDAtaQqwh8 [00:02:53])."""
    z = _z()
    _select(index)
    st = zb_ops.stats()
    if st.get("uv_bbox") is None:
        raise PluginOpError("no UVs: unwrap before creating maps")
    if st.get("sdiv_max", 1) < 2:
        raise PluginOpError("no subdivision levels: Divide and project first (the map compares "
                            "the current level with the highest)")
    if level is None:
        level = _lowest_level()
    else:
        zb_ops.set_checked("sdiv", int(level), tol=0.5)
    t0 = time.time()
    z.create_normal_map(int(size), int(size), bool(smooth), 0, int(border), 1000000, bool(tangent))
    z.update(redraw_ui=True)
    z.press(_res("nm_clone"))
    z.update(redraw_ui=True)
    res = zb_ops._file_op(PATHS["texture_export"], path, overwrite)   # preset + press + disk check
    res.update(level=level, size=[int(size), int(size)], tangent=bool(tangent),
               create_s=round(time.time() - t0, 2))
    return res


def displacement_map(index, path, size=2048, smooth=True, border=8, overwrite=True):
    """Displacement map with the SDK call create_displacement_map (UVs and the lowest level
    needed: SDK stub), then Tool > Displacement Map > Clone Disp (to the Alpha palette) and
    Alpha > Export by preset [verify both paths and the bit depth written]. For 32-bit EXR or
    UDIMs use Multi Map Exporter instead (Mid 0, Scale 1 for 32-bit: MME doc)."""
    z = _z()
    _select(index)
    st = zb_ops.stats()
    if st.get("uv_bbox") is None or st.get("sdiv_max", 1) < 2:
        raise PluginOpError("displacement needs UVs and subdivision levels")
    level = _lowest_level()
    z.create_displacement_map(int(size), int(size), bool(smooth), 0, int(border), 1000000, True)
    z.update(redraw_ui=True)
    z.press(_res("disp_clone"))
    res = zb_ops._file_op(PATHS["alpha_export"], path, overwrite)
    res.update(level=level, size=[int(size), int(size)])
    return res


def export_all(out_dir, ext=".obj", visible_only=True, prefix_index=True, restore=True):
    """Every (visible, folder aware) SubTool to its own file, named from the SubTool name
    (Maxon ex_mod_subtool_export; usd-portal's folder-aware test). OBJ cannot hold several
    SubTools with names in one file (Gaboury echGh0tZEts [00:00:34]); one file per SubTool
    keeps the names without the FBX dialog. Returns the file list."""
    z = _z()
    keep = z.get_active_subtool_index()
    out = []
    try:
        with zb_ops.quiet():
            for s in zb_ops.subtools():
                if visible_only and not s["visible"]:
                    continue
                nm = subtool_name(s["index"])["name"] or f"subtool_{s['index']:02d}"
                safe = "".join(c if c.isalnum() or c == "_" else "_" for c in nm)
                base = f"{s['index']:03d}_{safe}" if prefix_index else safe
                r = zb_ops.export_obj(os.path.join(out_dir, base + ext), overwrite=True)
                out.append({"index": s["index"], "name": nm, **r})
    finally:
        if restore:
            z.select_subtool(keep)
    return {"count": len(out), "files": out}


def decimated_preview(index, path, target_faces=20000, percent=None, keep_uvs=None,
                      overwrite=True):
    """Decimation Master on the SubTool, then OBJ export. Run it LAST in a file's recipe,
    after the ZTL checkpoint: it replaces the SubTool's mesh (no undo control from Python)
    and it is the plugin press most likely to keep control (ijacobs 2013, cgside 2022).
    The cache is keyed by the tool name (DM doc: same-named tools reuse stale caches), so
    unique staged names matter. Needs unique SubTool names (DM doc)."""
    _select(index)
    st = zb_ops.stats()
    pct = percent if percent is not None else decimation_percent(st["points"], target_faces)
    d = zb_ops.decimate(pct, preprocess=True, keep_uvs=keep_uvs)
    ex = zb_ops.export_obj(path, overwrite=overwrite)
    return {"percent": pct, "decimate": d, "export": ex}


def delete_dm_caches():
    """Decimation Master Utilities > Delete caches (cannot be undone; DM doc). Use between
    long batches to free disk [verify path and whether it asks for confirmation]."""
    return press_guarded(PATHS["dm_delete_caches"][0], check_enabled=False)


def mme_create_all(base_path, maps=("normal",), size=None, flip_v=None):
    """Multi Map Exporter: set the map switches, then Create All Maps, which opens a save
    dialog (MME doc) that set_next_filename may or may not feed [verify live_a02]. Returns
    press_guarded's report: preset_pending True means the dialog is waiting."""
    z = _z()
    keys = {"normal": "mme_normal", "displacement": "mme_disp", "texture": "mme_texture",
            "ao": "mme_ao", "cavity": "mme_cavity"}
    for name, key in keys.items():
        p = _res(key, required=False)
        if p:
            z.set(p, 1 if name in maps else 0)
    if size is not None:
        zb_ops.set_checked(PATHS["mme_map_size"], size, tol=0.5)
    if flip_v is not None:
        zb_ops.set_checked(PATHS["mme_flip_v"], 1 if flip_v else 0, tol=0.5)
    return press_guarded(PATHS["mme_create"][0], file=base_path, overwrite=True,
                         check_enabled=False)


# --------------------------------------------------------------------------------------------
# SubTool reports and naming
# --------------------------------------------------------------------------------------------

def subtool_name(index=None):
    """Name candidates: get_active_tool_path() tail (Maxon export example says it includes
    the SubTool name [verify]) and Tool:SubTool:ItemInfo title minus '. ' (usd-portal)."""
    z = _z()
    _select(index)
    path_name = _tool_name()
    title = None
    p = _res("subtool_title", required=False)
    if p:
        try:
            title = clean_title(z.get_title(p))
        except Exception:
            title = None
    return {"from_path": path_name, "from_title": title, "name": title or path_name}


def inventory(restore=True):
    """Per SubTool: index, name, points, faces, levels, UVs, visibility (folder aware, via
    zb_ops.subtools), folder, status bits. The report other personas read before GoZ,
    Decimation Master or export. Selecting each SubTool changes the active one: restored."""
    z = _z()
    keep = z.get_active_subtool_index()
    rows = []
    try:
        with zb_ops.quiet():
            for s in zb_ops.subtools():
                nm = subtool_name(s["index"])
                st = zb_ops.stats()
                rows.append({**s, "name": nm["name"], "name_path": nm["from_path"],
                             "points": st.get("points"), "faces": st.get("faces"),
                             "sdiv_max": st.get("sdiv_max"), "uv": st.get("uv_bbox") is not None,
                             "volume": st.get("volume"), "solid": st.get("solid")})
    finally:
        if restore:
            z.select_subtool(keep)
    names = [r["name"] for r in rows]
    dup = sorted({n for n in names if names.count(n) > 1})
    bad = [n for n in names if not n.replace("_", "").isalnum()]
    return {"tool": _tool_name(), "count": len(rows), "subtools": rows,
            "totals": {"points": sum(r["points"] or 0 for r in rows),
                       "faces": sum(r["faces"] or 0 for r in rows)},
            "duplicate_names": dup, "non_alphanumeric": bad}


def rename_subtool(index, new_name, cap=500):
    """Rename without the text prompt: move the SubTool to the top (MoveUp while enabled),
    set_tool_path (renames the top SubTool only: MadPony w7RxSx1G1hQ, Maxon forum 2026),
    move it back. Folders change the press count [verify]; read the name back."""
    z = _z()
    _select(index)
    up = _res("move_up")
    moves = 0
    while z.is_enabled(up) and moves < cap:
        z.press(up)
        moves += 1
    if z.get_active_subtool_index() != 0:
        raise PluginOpError(f"SubTool did not reach the top after {moves} MoveUp presses")
    rc = z.set_tool_path(z.get_active_tool_index(), new_name)
    z.update(redraw_ui=True)
    down = _res("move_down")
    for _ in range(moves):
        z.press(down)
    now = z.get_active_subtool_index()
    nm = subtool_name(now)
    return {"index_before": index, "index_after": now, "moves": moves, "rc": rc,
            "name": nm["name"], "ok": nm["name"] == new_name and now == index}


def for_each_subtool(func, args=(), kwargs=None, visible_only=True, restore=True, freeze=False):
    """ZRepeat It equivalent (Pavlovich Workshop 45 [00:37:30]): run a zb_ops or
    zb_plugin_ops function on each (visible) SubTool, with faces before and after. The loop
    runs under zb_ops.quiet() (show_actions 0); freeze=True also wraps it in zbc.freeze
    (zb_ops.frozen), for deterministic ops only: never with a plugin press or a canvas
    export inside [added]."""
    z = _z()
    fn = getattr(zb_ops, func, None) or globals().get(func)
    if not callable(fn):
        raise PluginOpError(f"no function {func} in zb_ops or zb_plugin_ops")
    if freeze and func in ("uv_master", "decimated_preview", "mme_create_all", "delete_dm_caches",
                           "decimate", "export_canvas"):
        raise PluginOpError(f"{func} presses a plugin or needs the canvas: not inside freeze")
    keep = z.get_active_subtool_index()

    def _loop():
        out = []
        with zb_ops.quiet():
            for s in zb_ops.subtools():
                if visible_only and not s["visible"]:
                    continue
                z.select_subtool(s["index"])
                f0 = zb_ops.stats().get("faces")
                try:
                    r, err = fn(*args, **(kwargs or {})), None
                except Exception as e:
                    r, err = None, f"{type(e).__name__}: {e}"
                out.append({"index": s["index"], "faces_before": f0,
                            "faces_after": zb_ops.stats().get("faces"), "result": r, "error": err})
        return out

    try:
        return zb_ops.frozen(_loop) if freeze else _loop()
    finally:
        if restore:
            z.select_subtool(keep)
