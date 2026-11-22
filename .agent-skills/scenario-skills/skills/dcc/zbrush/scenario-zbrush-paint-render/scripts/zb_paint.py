"""
zb_paint: stroke-free polypaint, mask passes, paint statistics on canvas renders, polypaint to
texture, BPR presentation renders, passes and scripted turntables (skill scenario-zbrush-paint-render).

Two halves, like zb_review:
  inside ZBrush (call them with zb_paint.remote("func", ...)):
      paint_state, set_paint_mode, set_color, fill, fill_subtools, colorize, colorize_all,
      texture_off,
      mask_by, mask_adjust, mask_pass, wash, ao_plugin, polypaint_from_polygroups,
      zone_fill_by_split, polypaint_from_image, texture_from_polypaint, set_render_mode,
      render_setup, bpr_render, export_bpr_pass, paint_views, subtool_solo_views,
      turntable_frames, set_document_size
  agent side (system python3 with numpy + PIL):
      remote, remote_code, paint_review, subject_mask, rgb_to_lab, rgb_to_hsv, region_masks,
      head_regions_front, zone_report, skin_zone_checks, value_report, render_checks,
      noise_sigma, mask_coverage, recommend_map_size, map_budget, skin_zone_plan, zone_image,
      blend, composite, id_pass, turntable_rotations, upright_score, assemble_turntable

It reuses the lead toolkit (<skills>/scenario-zbrush-expert/scripts): zb_ops for checked presses, sets,
masks, stats and dialog-free file writes; zb_stroke for framing; zb_review for view capture,
silhouettes and contact sheets; zb_launch for the bridge. Nothing here duplicates them.

Evidence tags on PATHS (same scheme as zb_ops.PATHS):
  [bridge]  exists() or ran through the bridge on 2026.2.1 (lead tests v01 to v03)
  [doc]     Maxon docs or SDK example        [macro]  shipped 2026 macro
  [strings] label present in this build's UI string table ZData/ZLang/english/UInterface.zsc
            (read 2026-09-24); the label exists, the palette path around it is inferred
  [expert]  shown on screen by an expert (source in the comment)
  [verify]  not confirmed
NOTHING IN THIS MODULE HAS RUN IN ZBRUSH YET. Offline tests: tests/code/zbrush-paint-render/
test_zb_paint.py. Live checks (not yet run): tests/code/zbrush-paint-render/live_p0*.py.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
EXPERT_SCRIPTS = os.path.normpath(os.path.join(HERE, "..", "..", "scenario-zbrush-expert", "scripts"))

try:  # inside ZBrush the remote prelude has put both script folders on sys.path
    from zbrush import commands as _zbc_probe  # noqa: F401
    IN_ZBRUSH = True
except ImportError:
    IN_ZBRUSH = False
    if os.path.isdir(EXPERT_SCRIPTS) and EXPERT_SCRIPTS not in sys.path:
        sys.path.insert(0, EXPERT_SCRIPTS)

import zb_ops     # noqa: E402  lead toolkit
import zb_stroke  # noqa: E402
try:
    import zb_review  # noqa: E402  (imports zb_ops, zb_stroke)
except ImportError:  # pragma: no cover
    zb_review = None


class ZBPaintError(RuntimeError):
    pass


PATHS = {
    # draw mode and intensity
    "rgb": ["Draw:Rgb"],                                  # [macro] CreateEyeballs reads it
    "mrgb": ["Draw:Mrgb"],                                # [macro] [doc]
    "m": ["Draw:M"],                                      # [macro]
    "zadd": ["Draw:Zadd"],                                # [bridge]
    "zsub": ["Draw:Zsub"],                                # [verify]
    "rgb_intensity": ["Draw:Rgb Intensity"],              # [strings] UI_DRAW_EDIT_MRGB_INTENSITY
    "color_r": ["Color:R"],                               # [macro]
    "color_g": ["Color:G"],                               # [macro]
    "color_b": ["Color:B"],                               # [macro]
    "fill_object": ["Color:FillObject"],                  # [doc] [macro]; tooltip "Fill 3D Object Masked" [strings]
    "switch_color": ["Color:SwitchColor"],                # [strings]
    # Tool > Polypaint
    "colorize": ["Tool:Polypaint:Colorize"],              # [doc]; tooltip "Colorize Mesh" [strings]
    "pp_from_texture": ["Tool:Polypaint:Polypaint From Texture"],      # [doc] [strings]
    "pp_from_groups": ["Tool:Polypaint:Polypaint From Polygroups"],    # [doc] [strings]
    "adjust_colors": ["Tool:Polypaint:Adjust Colors"],                 # [strings]; opens a dialog [verify]
    "pp_mirror_posable": ["Tool:Polypaint:Mirror By Posable Symmetry",
                          "Tool:Masking:Mirror By Posable Symmetry"],  # [doc] [strings]
    "mask_flip_posable": ["Tool:Masking:Flip By Posable Symmetry"],    # [doc] [strings]
    # Tool > Masking generators. Group names come from Tool:[Masking]:{...} [strings]; the
    # Activity log drops group names (lead cookbook), so the short form is tried second. Slider
    # labels that repeat across groups (Blur, Intensity, Range) are only tried in grouped form.
    "mask_cavity": ["Tool:Masking:Mask By Cavity:Mask By Cavity", "Tool:Masking:Mask By Cavity"],
    "cavity_blur": ["Tool:Masking:Mask By Cavity:Blur", "Tool:Masking:Mask By Cavity:Cavity Blur"],
    "cavity_intensity": ["Tool:Masking:Mask By Cavity:Intensity",
                         "Tool:Masking:Mask By Cavity:Cavity Intensity"],
    "mask_ao": ["Tool:Masking:Mask By AO:Mask Ambient Occlusion", "Tool:Masking:Mask Ambient Occlusion"],
    "ao_intensity": ["Tool:Masking:Mask By AO:Occlusion Intensity", "Tool:Masking:Occlusion Intensity"],
    "ao_scandist": ["Tool:Masking:Mask By AO:AO ScanDist", "Tool:Masking:AO ScanDist"],
    "ao_aperture": ["Tool:Masking:Mask By AO:AO Aperture", "Tool:Masking:AO Aperture"],
    "ao_rays": ["Tool:Masking:Mask By AO:AO Rays", "Tool:Masking:AO Rays"],
    "mask_smooth": ["Tool:Masking:Mask By Smoothness:Mask By Smoothness", "Tool:Masking:Mask By Smoothness"],
    "smooth_range": ["Tool:Masking:Mask By Smoothness:Range", "Tool:Masking:Mask By Smoothness:Mask Range"],
    "smooth_falloff": ["Tool:Masking:Mask By Smoothness:Falloff",
                       "Tool:Masking:Mask By Smoothness:Mask falloff"],
    "mask_pv": ["Tool:Masking:Mask PeaksAndValleys:Mask PeaksAndValleys", "Tool:Masking:Mask PeaksAndValleys"],
    "pv_range": ["Tool:Masking:Mask PeaksAndValleys:PVRange", "Tool:Masking:PVRange"],
    "pv_coverage": ["Tool:Masking:Mask PeaksAndValleys:PVCoverage", "Tool:Masking:PVCoverage"],
    "mask_intensity": ["Tool:Masking:Mask By Color:Mask By Intensity", "Tool:Masking:Mask By Intensity"],
    "mask_hue": ["Tool:Masking:Mask By Color:Mask By Hue", "Tool:Masking:Mask By Hue"],
    "mask_saturation": ["Tool:Masking:Mask By Color:Mask By Saturation", "Tool:Masking:Mask By Saturation"],
    "mask_adjust_apply": ["Tool:Masking:Mask Adjust:Apply"],        # [strings] "Apply Mask Adjust"
    "mask_adjust_blur": ["Tool:Masking:Mask Adjust:Blur", "Tool:Masking:Mask Adjust:Mask Adjust Blur"],
    # Zplugin > Ambient Occlusion (explicit paths in [strings]; plugin ships since 2021.6)
    "aop_compute": ["Zplugin:Ambient Occlusion:Compute"],
    "aop_mask": ["Zplugin:Ambient Occlusion:mask"],       # "Output ambient occlusion as masking"
    "aop_color": ["Zplugin:Ambient Occlusion:color"],     # "Output ambient occlusion as polypainting"
    "aop_distance": ["Zplugin:Ambient Occlusion:distance"],
    "aop_aperture": ["Zplugin:Ambient Occlusion:aperture"],
    "aop_samples": ["Zplugin:Ambient Occlusion:samples"],
    "aop_resolution": ["Zplugin:Ambient Occlusion:resolution"],
    "aop_volume": ["Zplugin:Ambient Occlusion:OcclusionVolume"],
    "aop_smooth": ["Zplugin:Ambient Occlusion:smooth"],
    # SubTool split for polygroup zones
    "split_groups": ["Tool:SubTool:Split:Groups Split", "Tool:SubTool:Groups Split"],  # [verify]
    # UV and texture map
    "uv_size": ["Tool:UV Map:UV Map Size"],               # [doc]
    "uv_planar": ["Tool:UV Map:Create (Projection):Uvp", "Tool:UV Map:Uvp"],  # [strings] "Uv Planar"
    "uv_delete": ["Tool:UV Map:Delete UV"],               # [doc] [strings]
    "tex_new_from_pp": ["Tool:Texture Map:Create:New From Polypaint", "Tool:Texture Map:New From Polypaint"],  # [doc]
    "tex_clone": ["Tool:Texture Map:Clone Txtr"],         # [doc] [strings]
    "tex_on": ["Tool:Texture Map:Texture On"],            # [strings]
    "tex_flipv_tool": ["Tool:Texture Map:Flip V"],        # [strings]
    "tex_import": ["Texture:Import"],                     # [verify] with set_next_filename
    "tex_export": ["Texture:Export"],                     # [expert] Pavlovich mW4P0T6tR7k 00:08:36 [verify]
    "tex_flipv": ["Texture:Flip V", "Texture:Flpv"],      # [strings] UI_TXTR_FLIP_V
    "mme_texture": ["Zplugin:Multi Map Exporter:Texture from Polypaint"],  # [strings]
    # materials (files present in ZData/Materials; material paths are Material:<name> [doc])
    "mat_flat": ["Material:Flat Color"],                  # [verify] built-in
    "mat_skinshade": ["Material:SkinShade4"],             # file ZData/Materials/Startup/SkinShade4.ZMT
    "mat_white": ["Material:MatCap White01"],             # file ZData/Materials/MatCap/MatCap White01.ZMT
    "mat_basic": ["Material:BasicMaterial"],              # file ZData/Materials/Startup/BasicMaterial.ZMT
    # render
    "render_flat": ["Render:Flat"],                       # [strings] "Flat Renderer"
    "render_fast": ["Render:Fast"],                       # [strings]
    "render_preview": ["Render:Preview"],                 # [strings]
    "render_best": ["Render:Best"],                       # [strings]
    "bpr": ["Render:BPR"],                                # [bridge]
    "rp_shadows": ["Render:Render Properties:Shadows"],   # [strings] "Render Shadows"
    "rp_ao": ["Render:Render Properties:AOcclusion"],     # [strings] "Activates Ambient Occlusion Rendering"
    "redshift": ["Render:Redshift Renderer:Redshift", "Render:Redshift"],   # [strings] "Render With Redshift"
    "rs_error_threshold": ["Render:Redshift Renderer:Error Threshold"],     # [strings]
    "rs_denoise": ["Render:Redshift Renderer:Denoising"],                   # [strings]
    "rs_progressive": ["Render:Redshift Renderer:Progressive Rendering"],   # [strings]
    "rs_iterations": ["Render:Redshift Renderer:Progressive Iterations"],   # [strings]
    "rs_baker360": ["Render:Redshift Renderer:Redshift Baker 360"],         # [strings]
    "persp": ["Transform:Persp"],                         # [verify] (zb_ops key "persp")
    "floor": ["Transform:Floor", "Draw:Floor"],           # [verify]
    "grid_size": ["Draw:Grid Size"],                      # [strings]
    "store_cam": ["Draw:Cameras:Store Cam"],              # [strings] (name prompt [verify])
    "light_intensity": ["Light:Intensity"],               # [doc]
    "doc_width": ["Document:Width"],                      # [bridge]
    "doc_height": ["Document:Height"],                    # [bridge]
    "doc_pro": ["Document:Pro"],                          # [verify]
    "doc_resize": ["Document:Resize"],                    # [strings] "Resize Document"
    "movie_turntable": ["Movie:Turntable"],               # [strings] "Record Turntable"; modal if a movie exists
}

# BPR pass thumbnails in Render > BPR RenderPass: labels from [strings]
# (UI_RENDER_BEST_PREVIEW_OUTPUT_*_MAP): Com, Img, Dep, Shdw, AmOc, SSS, Floor, and a mask map.
BPR_PASSES = {"composite": "Com", "shaded": "Img", "depth": "Dep", "shadow": "Shdw",
              "ao": "AmOc", "mask": "Mask", "sss": "SSS", "floor": "Floor"}

# Mask generators: button key, parameter keys. Mask data cannot be read back (no API, Maxon
# forum 2026): gate a mask with mask_coverage() on two canvas renders instead.
MASKS = {
    "cavity": ("mask_cavity", {"blur": "cavity_blur", "intensity": "cavity_intensity"}),
    "ao": ("mask_ao", {"intensity": "ao_intensity", "scan_dist": "ao_scandist",
                       "aperture": "ao_aperture", "rays": "ao_rays"}),
    "smoothness": ("mask_smooth", {"range": "smooth_range", "falloff": "smooth_falloff"}),
    "peaks_valleys": ("mask_pv", {"pv_range": "pv_range", "pv_coverage": "pv_coverage"}),
    "intensity": ("mask_intensity", {}),
    "hue": ("mask_hue", {}),
    "saturation": ("mask_saturation", {}),
}


def resolve(key, required=True):
    """First existing path for a zb_paint key (or a list of paths), via zb_ops.resolve."""
    cands = PATHS.get(key, [key]) if isinstance(key, str) else list(key)
    return zb_ops.resolve(cands, required)


def _z():
    return zb_ops._z()


def _get(key):
    p = resolve(key, required=False)
    return None if p is None else float(_z().get(p))


def _set(key, value, tol=0.51):
    """set with read-back through zb_ops.set_checked (raises when it did not take)."""
    return zb_ops.set_checked(PATHS.get(key, [key]), value, tol=tol)


def _rgb(c):
    if len(c) != 3:
        raise ValueError("colour must be (r, g, b)")
    out = tuple(int(round(float(v))) for v in c)
    if any(v < 0 or v > 255 for v in out):
        raise ValueError(f"colour {c} outside 0..255")
    return out


def has_uvs(uv_bbox):
    """True for a non-degenerate UV bounding box from zb_ops.stats()["uv_bbox"] (None or all
    equal values mean no UVs; the exact query_mesh3d(3) layout is [verify])."""
    return bool(uv_bbox) and len(uv_bbox) >= 4 and (max(uv_bbox) - min(uv_bbox)) > 1e-9


# ============================================================================================
# Inside ZBrush: paint state and fills
# ============================================================================================

def paint_state():
    """Draw mode, intensity, main colour, Colorize, texture display, level and UVs. The paint
    preflight numbers (FlippedNormals: paint at the top level; doc: texture off)."""
    out = {k: _get(k) for k in ("rgb", "mrgb", "m", "zadd", "zsub", "rgb_intensity",
                                "color_r", "color_g", "color_b", "colorize", "tex_on")}
    s = zb_ops.stats()
    for k in ("tool", "subtools", "active", "points", "faces", "sdiv", "sdiv_max", "uv_bbox"):
        out[k] = s.get(k)
    sd, mx = s.get("sdiv"), s.get("sdiv_max")
    out["at_top_level"] = sd is None or mx is None or sd >= mx - 1e-6
    out["has_uvs"] = has_uvs(out["uv_bbox"])
    out["sculpts_while_painting"] = bool(out["zadd"]) or bool(out["zsub"])
    return out


def set_paint_mode(mode="rgb", zadd=False, zsub=False, intensity=None):
    """Rgb on with Zadd and Zsub off paints without sculpting (FlippedNormals 8iAbH3zSQak
    00:03:09). mode "rgb" colour only, "mrgb" colour and material, "m" material only
    (doc FillObject). Returns the previous values for restore_paint_mode()."""
    if mode not in ("rgb", "mrgb", "m"):
        raise ValueError("mode must be rgb, mrgb or m")
    prev = {k: _get(k) for k in ("rgb", "mrgb", "m", "zadd", "zsub", "rgb_intensity")}
    z = _z()
    for k in ("rgb", "mrgb", "m"):   # treated as a radio group; each is read back
        p = resolve(k, required=(k == mode))
        if p and k != mode and z.get(p) >= 0.5:
            z.set(p, 0)
    _set(mode, 1)
    if zadd is not None:
        _set("zadd", 1 if zadd else 0)
    if zsub is not None and resolve("zsub", required=False):
        _set("zsub", 1 if zsub else 0)
    if intensity is not None:
        _set("rgb_intensity", float(intensity), tol=0.51)
    now = {k: _get(k) for k in ("rgb", "mrgb", "m", "zadd", "zsub", "rgb_intensity")}
    return {"previous": prev, "now": now}


def restore_paint_mode(previous):
    z = _z()
    for k in ("rgb", "mrgb", "m", "zadd", "zsub", "rgb_intensity"):
        v = previous.get(k)
        p = resolve(k, required=False)
        if p is not None and v is not None:
            z.set(p, v)
    return {k: _get(k) for k in previous}


def set_color(rgb):
    """Main colour with zbc.set_color [doc], read back from Color:R/G/B [macro]."""
    r, g, b = _rgb(rgb)
    z = _z()
    z.set_color(r, g, b)
    back = tuple(_get(k) for k in ("color_r", "color_g", "color_b"))
    if None not in back and max(abs(a - c) for a, c in zip(back, (r, g, b))) > 1.01:
        raise ZBPaintError(f"set_color({r}, {g}, {b}) reads back {back}")
    return {"set": [r, g, b], "read": list(back)}


def colorize(on=True):
    """Tool > Polypaint > Colorize. On a SubTool without polypaint, turning it on fills white
    (doc Polypaint reference); later it only toggles the display."""
    p = resolve("colorize")
    z = _z()
    before = z.get(p)
    if (before >= 0.5) != bool(on):
        z.set(p, 1 if on else 0)
        if (z.get(p) >= 0.5) != bool(on):
            z.press(p)
    return {"path": p, "before": before, "after": z.get(p)}


def colorize_all(on=False, previous=None):
    """Colorize on or off for every SubTool, the scripted form of Pavlovich's Shift-click on
    the Colorize icon (040hAJ3-cTw 00:12:23). Off shows the MatCap instead of the paint, for
    grey form sheets and generic reflection passes (lEP73nEu3Tc 00:13:49); it only toggles
    the display and keeps the paint (doc). previous: the list this function returned, to
    restore each SubTool's own state."""
    z = _z()
    p = resolve("colorize")
    n = int(z.get_subtool_count())
    active0 = int(z.get_active_subtool_index())
    states = []
    try:
        for i in range(n):
            z.select_subtool(i)
            states.append(z.get(p))
            want = (previous[i] >= 0.5) if previous is not None else bool(on)
            if (z.get(p) >= 0.5) != want:
                z.set(p, 1 if want else 0)
    finally:
        z.select_subtool(active0)
    return states


def texture_off():
    """A displayed texture map hides polypaint (doc Spotlight basics, Painting a Head)."""
    p = resolve("tex_on", required=False)
    if p is None:
        return {"path": None}
    z = _z()
    before = z.get(p)
    if before >= 0.5:
        z.set(p, 0)
    return {"path": p, "before": before, "after": z.get(p)}


def fill(rgb=None, intensity=100, mode="rgb"):
    """Color > FillObject with the main colour at `intensity` percent.

    Expert basis: FillObject applies at the current RGB Intensity, 10 percent fills at 10
    percent (FlippedNormals 8iAbH3zSQak 00:02:16 to 00:02:51); Pavlovich fills through an
    inverted AO mask (mW4P0T6tR7k 00:06:30 to 00:07:06) and fills an isolated polygroup
    (n5_cZK-9peg 01:00:48), and the build's tooltip reads "Fill 3D Object Masked" [strings].
    So masked and hidden parts should stay untouched [verify live_p02]. Filling a SubTool
    turns its Colorize on (Pavlovich 040hAJ3-cTw 00:10:08)."""
    mode_rep = set_paint_mode(mode, zadd=False, zsub=False, intensity=intensity)
    col = set_color(rgb) if rgb is not None else None
    p = resolve("fill_object")
    z = _z()
    t = time.time()
    z.press(p)
    z.update(redraw_ui=True)
    return {"path": p, "color": col, "intensity": intensity, "mode": mode,
            "mode_state": mode_rep["now"], "seconds": round(time.time() - t, 3)}


def wash(rgb, intensity=8):
    """Unify wash: a pale colour over everything at low intensity (doc Painting a Head: RGB
    Intensity about 10 as a wash; Pablo d03QU-eUaPo 01:31:16 very light colour, low
    intensity). Realistic targets only; skip for stylized (Pablo keeps saturation)."""
    return fill(rgb, intensity, "rgb")


def fill_subtools(colors, intensity=100, mode="rgb", indices=None, restore=True):
    """Fill several SubTools, one colour each: the zone fill when zones are parts (eyes,
    scarf, teeth, clothes). colors: list of (r, g, b) cycled over `indices` (default every
    SubTool), or a dict {index: (r, g, b)}. Pavlovich fills per SubTool or with SubTool
    Master Fill (FvpG2tCP8Lw 00:06:50); the Maxon SDK example fills clones in a loop."""
    z = _z()
    n = int(z.get_subtool_count())
    active0 = int(z.get_active_subtool_index())
    if isinstance(colors, dict):
        plan = [(int(k), _rgb(v)) for k, v in sorted(colors.items(), key=lambda kv: int(kv[0]))]
    else:
        idx = list(range(n)) if indices is None else [int(i) for i in indices]
        cols = [_rgb(c) for c in colors]
        if not cols:
            raise ValueError("no colours")
        plan = [(i, cols[k % len(cols)]) for k, i in enumerate(idx)]
    out = []
    try:
        for i, c in plan:
            if i < 0 or i >= n:
                raise ZBPaintError(f"SubTool index {i} out of range 0..{n - 1}")
            z.select_subtool(i)
            rec = fill(c, intensity, mode)
            out.append({"index": i, "color": list(c), "seconds": rec["seconds"]})
    finally:
        if restore:
            z.select_subtool(active0)
    return {"filled": out, "active_restored": active0 if restore else None}


# ============================================================================================
# Inside ZBrush: masks
# ============================================================================================

def mask_by(kind, **params):
    """Run a mask generator with its sliders set first (doc: set Range and Falloff before
    pressing Mask By Smoothness). kind: cavity, ao, smoothness, peaks_valleys, intensity,
    hue, saturation. Mask By AO is slow on millions of polygons: prefer ao_plugin(output=
    "mask") there (Pablo d03QU-eUaPo 01:37:25)."""
    if kind not in MASKS:
        raise ValueError(f"kind must be one of {sorted(MASKS)}")
    button, pmap = MASKS[kind]
    set_ = {}
    for name, value in params.items():
        if value is None:
            continue
        if name not in pmap:
            raise ValueError(f"{kind} has no parameter {name!r}; known {sorted(pmap)}")
        set_[name] = _set(pmap[name], float(value), tol=0.51)
    p = resolve(button)
    z = _z()
    t = time.time()
    z.press(p)
    z.update(redraw_ui=True)
    return {"kind": kind, "path": p, "params": set_, "seconds": round(time.time() - t, 3)}


def mask_adjust(blur=None):
    """Mask Adjust > Apply with the Blur slider and the default profile. The doc says the
    effect is absolute: pressing again changes nothing unless Blur changes (Mask Adjust);
    Pablo presses it twice (d03QU-eUaPo 01:18:52). Change Blur between presses. The profile
    curve is a curve widget: keep the default [verify curve scripting]."""
    if blur is not None:
        _set("mask_adjust_blur", float(blur), tol=0.51)
    p = resolve("mask_adjust_apply")
    _z().press(p)
    _z().update(redraw_ui=True)
    return {"path": p, "blur": blur}


def mask_pass(kind, rgb, intensity=30, invert=True, adjust_blur=None, clear=True, **params):
    """Pablo's core loop without a brush: generator, Mask Adjust, Inverse, colour through the
    mask, Clear (d03QU-eUaPo 01:16:40 to 01:30:43; doc Masking). The big soft brush pass is
    replaced by FillObject at low RGB Intensity through the inverted mask, the way Pavlovich
    adds baked AO (mW4P0T6tR7k 00:06:30). kind "ao_plugin" uses Zplugin > Ambient Occlusion
    (ray traced, faster and more accurate on dense meshes, Pablo 01:37:25). Run it at the
    highest subdivision level (Pablo 01:16:40)."""
    st = zb_ops.stats()
    steps = {"top_level": st.get("sdiv") is None or st.get("sdiv") >= st.get("sdiv_max", 1) - 1e-6}
    zb_ops.mask("clear")
    if kind == "ao_plugin":
        steps["generator"] = ao_plugin(output="mask", **params)
    else:
        steps["generator"] = mask_by(kind, **params)
    if adjust_blur is not None:
        steps["adjust"] = mask_adjust(adjust_blur)
    if invert:
        steps["invert"] = zb_ops.mask("invert")
    steps["fill"] = fill(rgb, intensity, "rgb")
    if clear:
        steps["clear"] = zb_ops.mask("clear")
    return steps


def ao_plugin(output="mask", distance=None, aperture=None, samples=None, resolution=None,
              volume=None, smooth=None):
    """Zplugin > Ambient Occlusion > Compute (paths from [strings]). output "mask" writes the
    AO as a mask (then invert and fill, Pablo 01:37:25; Pavlovich mW4P0T6tR7k 00:06:30);
    "color" writes it straight into polypaint ("Output ambient occlusion as polypainting"
    [strings]; overwrite or blend is [verify]: use it on a duplicate SubTool). volume True
    includes the other SubTools (Pavlovich: Occlusion Volume). A ZScript plugin press may not
    return control (lead traps): call it with a short timeout and ping after."""
    if output not in ("mask", "color"):
        raise ValueError("output must be mask or color")
    z = _z()
    sets = {}
    for key, val in (("aop_distance", distance), ("aop_aperture", aperture),
                     ("aop_samples", samples), ("aop_resolution", resolution),
                     ("aop_smooth", smooth)):
        if val is not None:
            sets[key] = _set(key, float(val), tol=0.51)
    for key, on in (("aop_mask", output == "mask"), ("aop_color", output == "color")):
        p = resolve(key, required=False)
        if p is not None:
            z.set(p, 1 if on else 0)
            sets[key] = z.get(p)
    if volume:
        z.press(resolve("aop_volume"))
    t = time.time()
    z.press(resolve("aop_compute"))
    z.update(redraw_ui=True)
    return {"output": output, "sets": sets, "seconds": round(time.time() - t, 3)}


# ============================================================================================
# Inside ZBrush: zones
# ============================================================================================

def polypaint_from_polygroups():
    """Group colours become polypaint (doc Polypaint reference): the zone or chunk map to
    review before real colours go on (stylized digest P3)."""
    p = resolve("pp_from_groups")
    _z().press(p)
    _z().update(redraw_ui=True)
    return {"path": p}


def zone_fill_by_split(colors, intensity=100, project_back=True, checkpoint=None):
    """Exact zone fills by polygroup without a click: Duplicate the active SubTool, Groups
    Split the copy, FillObject each piece, then (project_back) Project All the colour onto
    the untouched original with its Colorize on, which avoids the "target has no polypaint"
    popup (AskZBrush _ips3GhWI0s 00:05:57), and hide the pieces. Pavlovich's version isolates
    a group and fills it (n5_cZK-9peg 01:00:48): isolating needs Ctrl+Shift clicks, which the
    SDK cannot send. The pieces stay in the tool (deleting a SubTool asks for confirmation);
    their indices are returned. [verify live_p03: split path, piece order, projection]
    project_back needs `checkpoint` (an absolute .ztl path, saved versioned first, or False
    right after a save): the lead's zb_ops.project_all refuses to run without one, since
    Project All can crash (cgside). No new layer here: a recording layer would also capture
    every later fill [added]; the morph target is kept (2026-09-24)."""
    if project_back and checkpoint is None:
        raise ZBPaintError("project_back needs checkpoint='/abs/name.ztl' (or False right after "
                           "a save): Project All can crash ZBrush")
    z = _z()
    zb_ops.ensure_edit()
    n0 = int(z.get_subtool_count())
    i0 = int(z.get_active_subtool_index())
    zb_ops.press("duplicate")
    z.update(redraw_ui=True)
    n1 = int(z.get_subtool_count())
    if n1 != n0 + 1:
        raise ZBPaintError(f"Duplicate did not add a SubTool ({n0} -> {n1})")
    z.select_subtool(i0 + 1)
    z.press(resolve("split_groups"))
    z.update(redraw_ui=True)
    n2 = int(z.get_subtool_count())
    k = n2 - n0
    pieces = list(range(i0 + 1, i0 + 1 + k))
    rep = fill_subtools(colors, intensity, "rgb", indices=pieces, restore=False)
    out = {"original": i0, "pieces": pieces, "groups": k, "fills": rep["filled"]}
    if project_back:
        z.select_subtool(i0)
        colorize(True)
        keep = set([i0] + pieces)
        saved = {}
        for i in range(n2):
            st = int(z.get_subtool_status(i))
            saved[i] = st
            want = (st | 0x1) if i in keep else (st & ~0x1)
            if want != st:
                z.set_subtool_status(i, want)
        z.select_subtool(i0)
        out["project"] = zb_ops.project_all(checkpoint=checkpoint, layer=False)
        for i in pieces:
            z.set_subtool_status(i, int(z.get_subtool_status(i)) & ~0x1)
        for i, st in saved.items():
            if i not in keep:
                z.set_subtool_status(i, st)
        z.select_subtool(i0)
    return out


def polypaint_from_image(image_path, delete_uvs=True, allow_replace_uvs=False):
    """Stroke-free zone map from a generated image (stylized digest P5): Texture:Import the
    image [verify dialog-free], Tool > UV Map > Uvp (planar UVs "based on the current
    orientation as it appears in the Preview window", UV doc), Polypaint From Texture, texture
    off, Delete UV. Refuses a SubTool that already has UVs unless allow_replace_uvs: those
    UVs are a deliverable. The image-to-surface convention (flip, aspect) is measured by
    live_p04 before any real use; zone_image(flip_v=...) follows it. [verify every step]"""
    image_path = os.path.abspath(image_path)
    if not os.path.exists(image_path):
        raise ZBPaintError(f"no image at {image_path}")
    z = _z()
    st = zb_ops.stats()
    if has_uvs(st.get("uv_bbox")) and not allow_replace_uvs:
        raise ZBPaintError("SubTool has UVs: Uvp would replace them. Paint zones before UVs, "
                           "or run this on a duplicate and Project All the colour back")
    z.set_next_filename(image_path)
    z.press(resolve("tex_import"))
    pending = z.has_next_filename()
    z.press(resolve("uv_planar"))
    z.press(resolve("pp_from_texture"))
    z.update(redraw_ui=True)
    texture_off()
    if delete_uvs:
        z.press(resolve("uv_delete"))
    return {"image": image_path, "import_preset_pending": pending,
            "uv_bbox_after": zb_ops.stats().get("uv_bbox")}


# ============================================================================================
# Inside ZBrush: polypaint to texture
# ============================================================================================

def texture_from_polypaint(out_path, size=None, flip_v=True, overwrite=False):
    """UV Map Size, Texture Map > New From Polypaint, Clone Txtr, Flip V, Texture:Export
    (doc Texture Maps; Pavlovich mW4P0T6tR7k 00:07:49 to 00:08:36). UVs are required
    (FlippedNormals 00:29:59); size defaults to recommend_map_size(points). flip_v follows
    FlippedNormals' FlipV rule for other apps (00:31:54) [verify orientation live_p04]. The
    Multi Map Exporter route (Texture from Polypaint, Map Border high) belongs to
    scenario-zbrush-retopology-export's map batch."""
    z = _z()
    st = zb_ops.stats()
    if not has_uvs(st.get("uv_bbox")):
        raise ZBPaintError("no UVs: hand to scenario-zbrush-retopology-export (UV Master Work on Clone "
                           "then Copy/Paste UVs keeps polypaint)")
    size = int(size or recommend_map_size(st.get("points") or 0)["side"])
    _set("uv_size", size, tol=0.51)
    z.press(resolve("tex_new_from_pp"))
    z.press(resolve("tex_clone"))
    flipped = False
    if flip_v:
        fp = resolve("tex_flipv", required=False)
        if fp:
            z.press(fp)
            flipped = True
    res = zb_ops._file_op(PATHS["tex_export"], out_path, overwrite)
    texture_off()
    res.update({"size": size, "flipped_v": flipped, "points": st.get("points"),
                "budget": map_budget(st.get("points") or 0, size)})
    return res


# ============================================================================================
# Inside ZBrush: render
# ============================================================================================

def set_render_mode(mode="preview"):
    """Render > Flat, Fast, Preview or Best (render modes doc). Flat shows pure colour for
    colour judgment (Pablo d03QU-eUaPo 01:03:11); set back to Preview afterwards."""
    key = "render_" + mode
    if key not in PATHS:
        raise ValueError("mode must be flat, fast, preview or best")
    p = resolve(key)
    _z().press(p)
    _z().update(redraw_ui=True)
    return {"path": p}


def render_setup(shadows=True, ao=True, perspective=True, floor=None, light_intensity=None,
                 redshift=False):
    """BPR scene switches with read-back. Perspective on before rendering, else the render is
    orthographic (Pavlovich 040hAJ3-cTw 00:02:56). Redshift only when installed (Redshift is
    a separate application, REND doc; on this Mac mx1 lists it as uninstalled 2026-09-24)."""
    z = _z()
    out = {}
    for key, val in (("rp_shadows", shadows), ("rp_ao", ao), ("persp", perspective),
                     ("floor", floor), ("redshift", redshift)):
        if val is None:
            continue
        p = resolve(key, required=False)
        if p is None:
            out[key] = "missing"
            continue
        z.set(p, 1 if val else 0)
        out[key] = z.get(p)
    if light_intensity is not None:
        out["light_intensity"] = _set("light_intensity", float(light_intensity), tol=0.02)
    return out


def bpr_render(out_path, overwrite=False):
    """Press BPR (Shift+R), then export the canvas: the render lives in the document
    (Document:Export is dialog-free, lead v03). Returns the file and the render seconds."""
    z = _z()
    t = time.time()
    z.press(resolve("bpr"))
    z.update(redraw_ui=True)
    secs = round(time.time() - t, 2)
    res = zb_ops.export_canvas(out_path, overwrite)
    res["render_seconds"] = secs
    return res


def export_bpr_pass(name, out_path, overwrite=False):
    """Save one BPR pass (Render > BPR RenderPass thumbnails; the doc says clicking a pass
    saves it, which normally opens a file dialog). set_next_filename first [verify live_p05];
    if a dialog opens, use configuration passes (clown, mask) with bpr_render instead."""
    label = BPR_PASSES.get(name, name)
    return zb_ops._file_op(["Render:BPR RenderPass:" + label, "Render:" + label], out_path,
                           overwrite)


def set_document_size(width, height):
    """Document Width and Height with Pro off, then Resize (Pavlovich 040hAJ3-cTw 00:27:45).
    Resizing clears the canvas, so the tool is redrawn and Edit turned back on, and the view
    is reframed with zb_stroke.frame_transform. Whether Resize asks a question is [verify]."""
    z = _z()
    t0 = [float(v) for v in z.get_transform()]
    pro = resolve("doc_pro", required=False)
    if pro and z.get(pro) >= 0.5:
        z.set(pro, 0)
    z.set(resolve("doc_width"), float(width))
    z.set(resolve("doc_height"), float(height))
    z.press(resolve("doc_resize"))
    z.update(redraw_ui=True)
    w, h = z.get("Document:Width"), z.get("Document:Height")
    redrawn = False
    if z.get("Transform:Edit") < 0.5:
        lc = zb_ops.resolve("layer_clear", required=False)
        if lc:
            z.press(lc)
        z.canvas_click(w * 0.5, h * 0.5, w * 0.5, h * 0.85)
        z.set("Transform:Edit", 1)
        redrawn = True
    bbox = [float(v) for v in z.query_mesh3d(2, 3)]
    z.set_transform(*zb_stroke.frame_transform(bbox, w, h, tuple(t0[6:9])))
    z.update(redraw_ui=True)
    return {"asked": [width, height], "read": [w, h], "redrawn": redrawn,
            "edit": z.get("Transform:Edit")}


LOOKS = {"flat": ("Flat Color", None), "skin": ("SkinShade4", None),
         "white": ("MatCap White01", None), "gray": ("MatCap Gray", None), "bpr": (None, "bpr")}


def paint_views(out_dir, views=("front", "threequarter", "right", "back"), look="flat",
                margin=0.75, prefix=None, strict=True):
    """Canvas renders for colour review through zb_review.capture_views (inside ZBrush).
    look: "flat" (Flat Color: pure polypaint), "skin" (SkinShade4), "white" (MatCap White01),
    "gray", "bpr" (keep materials, BPR each view), or "matcap:<name>". Neutral material plus
    Flat for every colour judgment (FlippedNormals 00:10:51; Pablo 00:44:58, 01:03:11).
    A SubTool filled in M or MRGB mode keeps its painted material, so a review MatCap does
    not show on it [added] [verify]. strict: raise when the look's material could not be set
    (zb_review keeps capturing with the current material and only records the error)."""
    if look.startswith("matcap:"):
        matcap, render = look.split(":", 1)[1], None
    elif look in LOOKS:
        matcap, render = LOOKS[look]
    else:
        raise ValueError(f"look must be one of {sorted(LOOKS)} or matcap:<name>")
    if zb_review is None:
        raise ZBPaintError("zb_review not importable")
    res = zb_review.capture_views(out_dir, list(views), matcap, "math", margin, render,
                                  prefix or look.replace(":", "_"))
    mat = res.get("material") or {}
    res["look_applied"] = matcap is None or "error" not in mat
    if strict and not res["look_applied"]:
        raise ZBPaintError(f"look {look!r} not applied ({mat.get('error')}): the renders in "
                           f"{out_dir} show the current material; check the name with live_p01")
    return res


def subtool_solo_views(out_dir, view="front", look="flat", indices=None, margin=0.75):
    """One render per SubTool with only that SubTool visible (eye bit 0x1 of the status word,
    lead cookbook [verify set semantics]), for an ID (clown) pass and a subject mask built on
    the agent side with id_pass(). Pavlovich's clown pass sets one polygroup per SubTool with
    Ctrl+W (lEP73nEu3Tc 00:16:50), which rewrites polygroups; this leaves paint, groups and
    materials untouched [added]. The framing uses the full bbox of all SubTools, so every
    solo render lines up with the beauty render of the same view."""
    z = _z()
    n = int(z.get_subtool_count())
    idx = list(range(n)) if indices is None else [int(i) for i in indices]
    saved = [int(z.get_subtool_status(i)) for i in range(n)]
    active0 = int(z.get_active_subtool_index())
    out = []
    try:
        for i in idx:
            for j in range(n):
                want = (saved[j] | 0x1) if j == i else (saved[j] & ~0x1)
                z.set_subtool_status(j, want)
            z.select_subtool(i)
            res = paint_views(os.path.join(out_dir, f"solo_{i:02d}"), [view], look, margin,
                              prefix=f"solo_{i:02d}")
            out.append({"index": i, "path": res["views"][0]["path"]})
    finally:
        for j in range(n):
            z.set_subtool_status(j, saved[j])
        z.select_subtool(active0)
    return {"solo": out, "restored": [int(z.get_subtool_status(j)) for j in range(n)] == saved}


def turntable_frames(out_dir, n=36, look="preview", rule="maxon", margin=0.75, first=0,
                     count=None, prefix="tt"):
    """Scripted turntable: absolute view per frame (never add degrees, lead traps), framed with
    Maxon's 0.75 rule, BPR per frame when look == "bpr", Document:Export per frame. Call in
    chunks (first, count) so each bridge call stays short. Movie > Turntable is the GUI route
    (records viewport quality unless a Redshift render ran first, Pavlovich FvpG2tCP8Lw
    00:19:56; it asks to export or replace an existing movie [strings])."""
    z = _z()
    zb_ops.ensure_edit()
    os.makedirs(out_dir, exist_ok=True)
    t0 = [float(v) for v in z.get_transform()]
    w, h = z.get("Document:Width"), z.get("Document:Height")
    bbox = [float(v) for v in z.query_mesh3d(2, 3)]
    rots = turntable_rotations(n, rule)
    last = n if count is None else min(n, first + int(count))
    frames = []
    t = time.time()
    try:
        for k in range(int(first), last):
            z.set_transform(*zb_stroke.frame_transform(bbox, w, h, rots[k], margin))
            z.update(redraw_ui=True)
            if look == "bpr":
                z.press(resolve("bpr"))
            path = os.path.join(out_dir, f"{prefix}_{k:03d}.png")
            frames.append(zb_ops.export_canvas(path, overwrite=True)["path"])
    finally:
        z.set_transform(*t0)
        z.update(redraw_ui=True)
    return {"frames": frames, "rotations": [list(r) for r in rots[int(first):last]],
            "seconds": round(time.time() - t, 2), "doc": [w, h]}


# ============================================================================================
# Agent side: bridge helpers
# ============================================================================================

def _prelude_lines():
    return [
        f"_zb_dirs = [{HERE!r}, {EXPERT_SCRIPTS!r}]",
        "_zb_before = set(_zb_sys.modules)",
        "for _zb_d in _zb_dirs:",
        "    _zb_sys.path.insert(0, _zb_d)",
        "try:",
        "    zb_paint = _zb_il.import_module('zb_paint')",
        "finally:",
        "    for _zb_d in _zb_dirs:",
        "        _zb_sys.path.remove(_zb_d)",
        "    for _zb_k in set(_zb_sys.modules) - _zb_before:",
        "        if _zb_k.startswith('zb_'):",
        "            _zb_sys.modules.pop(_zb_k, None)",
        "zb_ops, zb_stroke, zb_review = zb_paint.zb_ops, zb_paint.zb_stroke, zb_paint.zb_review",
    ]


def build_remote_code(func, args=(), kwargs=None):
    """Source sent to ZBrush: zb_paint and the lead modules imported by path, then removed from
    sys.path and sys.modules (Maxon's shared-interpreter rule, as zb_launch does), then
    zb_paint.<func>(*args, **kwargs). zb_launch.run adds `_zb_sys`, `_zb_json`, `_zb_il` and
    JSON-encodes `result`."""
    if not func.isidentifier():
        raise ValueError(f"bad function name {func!r}")
    lines = _prelude_lines()
    lines.append(f"result = zb_paint.{func}(*_zb_json.loads({json.dumps(list(args))!r}), "
                 f"**_zb_json.loads({json.dumps(kwargs or {})!r}))")
    return "\n".join(lines) + "\n"


def remote(func, *args, port=7788, timeout=120, **kwargs):
    """zb_paint.<func>(*args, **kwargs) inside ZBrush through the lead bridge (zb_launch.run,
    main thread). Args must be JSON-able."""
    import zb_launch
    return zb_launch.run(build_remote_code(func, args, kwargs), (), port, timeout)


def remote_code(code, port=7788, timeout=120):
    """Arbitrary code inside ZBrush with zb_paint, zb_ops, zb_stroke, zb_review and zbc bound;
    assign `result`."""
    import zb_launch
    return zb_launch.run("\n".join(_prelude_lines()) + "\n" + code, (), port, timeout)


def paint_review(out_dir, look="flat", views=("front", "threequarter", "right", "back"),
                 regions=None, title=None, port=7788, timeout=240):
    """Capture paint views in ZBrush, tile a labelled contact sheet (zb_review.contact_sheet)
    and measure each view: subject value range and saturation, plus zone_report on the front
    view when `regions` (name -> spec, see region_masks) is given. Open the sheet and judge it
    with references/critique.md."""
    out_dir = os.path.abspath(out_dir)
    res = remote("paint_views", out_dir, list(views), look, port=port, timeout=timeout)
    shots = res["views"]
    sils = [zb_review.silhouette_bbox(s["path"]) for s in shots]
    labels = []
    per_view = []
    for s, q in zip(shots, sils):
        lab = s["view"] + ("" if q else " EMPTY") + (" CLIPPED" if q and q["touches_border"] else "")
        labels.append(lab)
        per_view.append({"view": s["view"], "path": s["path"],
                         "value": value_report(s["path"]) if q else None})
    sheet = zb_review.contact_sheet([s["path"] for s in shots], labels,
                                    os.path.join(out_dir, f"paint_{look.replace(':', '_')}_sheet.png"),
                                    title=title or f"paint review | {look}")
    out = {"sheet": sheet, "views": per_view, "silhouettes": sils, "material": res.get("material")}
    if regions:
        front = next((s["path"] for s in shots if s["view"] == "front"), shots[0]["path"])
        out["zones"] = zone_report(front, regions)
    return out


# ============================================================================================
# Agent side: colour maths and measurements (numpy)
# ============================================================================================

def load_rgb(path):
    """uint8 H x W x 3 array."""
    import numpy as np
    from PIL import Image
    with Image.open(path) as im:
        return np.asarray(im.convert("RGB"))


def subject_mask(img, threshold=28, edge=4, fill_holes=True):
    """Per-pixel model mask against ZBrush's canvas background, with the same rule as
    zb_review.silhouette_bbox (background of each row = median of its outer `edge` pixels;
    the canvas is a vertical gradient). fill_holes keeps dark pupils, nostrils and mouth
    interiors that match the dark background inside the subject (found in the offline tests).
    img: path or array. Returns a bool array."""
    import numpy as np
    a = load_rgb(img) if isinstance(img, str) else np.asarray(img)
    a = a.astype(np.int16)
    ref = np.median(np.concatenate([a[:, :edge], a[:, -edge:]], axis=1), axis=1)
    mask = np.abs(a - ref[:, None, :]).max(axis=2) > threshold
    mask[:, :edge] = False
    mask[:, -edge:] = False
    return _fill_holes(mask) if fill_holes else mask


def _fill_holes(mask):
    """Everything not connected to the image border through background is subject."""
    import numpy as np
    from PIL import Image, ImageDraw
    h, w = mask.shape
    pad = Image.new("L", (w + 2, h + 2), 0)
    pad.paste(Image.fromarray(np.uint8(mask) * 255, "L"), (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    return np.asarray(pad)[1:-1, 1:-1] != 128


def _unit(rgb):
    """Float 0..1 array: integer input (uint8 renders, int lists) is divided by 255."""
    import numpy as np
    raw = np.asarray(rgb)
    x = raw.astype(np.float64)
    return x / 255.0 if np.issubdtype(raw.dtype, np.integer) else x


def rgb_to_hsv(rgb):
    """Vectorised HSV: hue in degrees 0..360, s and v in 0..1. rgb: integers 0..255 or floats 0..1."""
    import numpy as np
    x = _unit(rgb)
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    mx, mn = x.max(axis=-1), x.min(axis=-1)
    c = mx - mn
    s = np.where(mx > 0, c / np.where(mx > 0, mx, 1), 0.0)
    safe = np.where(c > 0, c, 1)
    h = np.where(mx == r, ((g - b) / safe) % 6,
                 np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 60.0
    h = np.where(c > 0, h, 0.0)
    return np.stack([h, s, mx], axis=-1)


def rgb_to_lab(rgb):
    """sRGB (D65) to CIELAB. rgb: integers 0..255 or floats 0..1 (..., 3). Returns L 0..100, a, b."""
    import numpy as np
    x = _unit(rgb)
    lin = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    d = 6.0 / 29.0
    f = np.where(xyz > d ** 3, np.cbrt(xyz), xyz / (3 * d * d) + 4.0 / 29.0)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)


def circular_mean_deg(h, weights=None):
    import numpy as np
    h = np.radians(np.asarray(h, dtype=np.float64))
    w = np.ones_like(h) if weights is None else np.asarray(weights, dtype=np.float64)
    if w.sum() <= 0:
        return None
    ang = math.degrees(math.atan2(float((w * np.sin(h)).sum()), float((w * np.cos(h)).sum())))
    return ang % 360.0


def _box_blur(a, r):
    """Mean filter of radius r (window 2r+1) with edge padding, via an integral image."""
    import numpy as np
    if r <= 0:
        return a.astype(np.float64)
    p = np.pad(a.astype(np.float64), r, mode="edge")
    c = np.cumsum(np.cumsum(p, axis=0), axis=1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s / (k * k)


def region_masks(shape, bbox, spec):
    """Named bool masks. shape: (H, W). bbox: [x0, y0, x1, y1] of the subject (silhouette).
    spec: name -> ("box", u0, v0, u1, v1) or ("ellipse", cu, cv, ru, rv) in bbox-normalised
    coordinates (u right, v down), or ("circle_px", x, y, r) or ("poly_px", [(x, y), ...]) in
    canvas pixels (for landmarks projected with zb_stroke.Camera)."""
    import numpy as np
    H, W = shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    x0, y0, x1, y1 = bbox
    bw, bh = max(1.0, x1 - x0), max(1.0, y1 - y0)
    out = {}
    for name, s in spec.items():
        kind = s[0]
        if kind == "box":
            u0, v0, u1, v1 = s[1:5]
            m = ((xx >= x0 + u0 * bw) & (xx <= x0 + u1 * bw) &
                 (yy >= y0 + v0 * bh) & (yy <= y0 + v1 * bh))
        elif kind == "ellipse":
            cu, cv, ru, rv = s[1:5]
            cx, cy = x0 + cu * bw, y0 + cv * bh
            m = ((xx - cx) / max(ru * bw, 1e-6)) ** 2 + ((yy - cy) / max(rv * bh, 1e-6)) ** 2 <= 1.0
        elif kind == "circle_px":
            cx, cy, r = s[1:4]
            m = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
        elif kind == "poly_px":
            from PIL import Image, ImageDraw
            im = Image.new("L", (W, H), 0)
            ImageDraw.Draw(im).polygon([tuple(p) for p in s[1]], fill=255)
            m = np.asarray(im) > 0
        else:
            raise ValueError(f"unknown region kind {kind!r}")
        out[name] = m
    return out


def head_regions_front(split_eyes=True):
    """Default face regions for a FRONT, head-only, centred render, in silhouette-normalised
    coordinates. Placement follows the classical head canon (eyes near half the head height)
    [added: calibrate per model, or replace with landmarks projected from the sculpt]. Zones
    are the ones the experts name: forehead (yellow), midface cheeks and nose (red), lower
    third (blue or grey in men), eyes (focal contrast), lips (FlippedNormals 00:00:31, 00:18:44;
    Pablo 00:47:39)."""
    r = {"forehead": ("ellipse", 0.50, 0.30, 0.22, 0.07),
         "nose": ("ellipse", 0.50, 0.58, 0.05, 0.07),
         "cheek_l": ("ellipse", 0.29, 0.61, 0.09, 0.06),
         "cheek_r": ("ellipse", 0.71, 0.61, 0.09, 0.06),
         "lips": ("ellipse", 0.50, 0.74, 0.10, 0.03),
         "lower": ("ellipse", 0.50, 0.87, 0.20, 0.06)}
    if split_eyes:
        r["eye_l"] = ("ellipse", 0.33, 0.48, 0.08, 0.035)
        r["eye_r"] = ("ellipse", 0.67, 0.48, 0.08, 0.035)
    else:
        r["eyes"] = ("box", 0.22, 0.44, 0.78, 0.52)
    return r


def _stats(lab, hsv, m, hp):
    import numpy as np
    n = int(m.sum())
    if n == 0:
        return {"pixels": 0}
    L, a, b = lab[..., 0][m], lab[..., 1][m], lab[..., 2][m]
    s, v, h = hsv[..., 1][m], hsv[..., 2][m], hsv[..., 0][m]
    return {"pixels": n,
            "L": round(float(L.mean()), 2), "a": round(float(a.mean()), 2),
            "b": round(float(b.mean()), 2),
            "chroma": round(float(np.hypot(a, b).mean()), 2),
            "L_p5": round(float(np.percentile(L, 5)), 2), "L_p95": round(float(np.percentile(L, 95)), 2),
            "L_std": round(float(L.std()), 2), "a_std": round(float(a.std()), 2),
            "b_std": round(float(b.std()), 2),
            "sat": round(float(s.mean()), 3), "sat_std": round(float(s.std()), 3),
            "sat_high_frac": round(float((s > 0.75).mean()), 4),
            "value": round(float(v.mean()), 3),
            "hue": circular_mean_deg(h, s),
            "speckle": round(float(hp[m].std()), 3)}


def zone_report(img, regions, bbox=None, subject=None, speckle_radius=3):
    """Per-region colour statistics on a canvas render (use a Flat Color render for albedo).
    regions: name -> spec (region_masks). Each region is intersected with the subject mask.
    speckle = std of L* minus its local mean (radius px): organic breakup versus airbrush
    smoothness (FlippedNormals 00:05:07) [added metric]."""
    import numpy as np
    a = load_rgb(img) if isinstance(img, str) else np.asarray(img)
    subj = subject_mask(a) if subject is None else subject
    if bbox is None:
        ys, xs = np.nonzero(subj)
        if len(xs) == 0:
            raise ZBPaintError("no subject in the render")
        bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    lab = rgb_to_lab(a)
    hsv = rgb_to_hsv(a)
    hp = lab[..., 0] - _box_blur(lab[..., 0], speckle_radius)
    masks = region_masks(a.shape, bbox, regions)
    rep = {"bbox": bbox, "regions": {}}
    for name, m in masks.items():
        rep["regions"][name] = _stats(lab, hsv, m & subj, hp)
    rep["subject"] = _stats(lab, hsv, subj, hp)
    return rep


JND = 2.3  # one just-noticeable difference in CIELAB (Sharma) [added unit for thresholds]


def _mean_of(rep, names, key):
    vals = [rep["regions"][n][key] for n in names
            if n in rep["regions"] and rep["regions"][n].get("pixels")]
    return sum(vals) / len(vals) if vals else None


def skin_zone_checks(rep, sex="male", style="realistic", stage="final", min_delta=JND,
                     max_clown=0.05, min_speckle=1.0):
    """Expert zone rules as pass/fail checks on zone_report output. Thresholds are [added]
    and meant to be calibrated on live renders; the rules are the experts':
      forehead yellower (b*) than midface; midface redder (a*) than forehead (Gurney thirds via
        FlippedNormals 00:00:31; Pablo 00:47:39)
      male: lower third bluer (b* lower) than midface; female: less blue, more red low
        (Pablo 00:48:11, 00:54:18)
      realistic: mean HSV saturation under 0.5, the middle of the picker (Pablo 01:10:30)
      variation: zones differ by at least one JND and the paint has speckle (FlippedNormals
        00:05:07; Pablo 01:02:36); after the cover pass no clown (Pablo 01:05:27)
      eyes carry the strongest value contrast (FlippedNormals 00:18:44)
    stage: "zones" (pure hue map), "covered", "final"."""
    checks = []

    def add(name, ok, detail, rule):
        checks.append({"check": name, "pass": bool(ok) if ok is not None else None,
                       "detail": detail, "rule": rule})

    mid = ["cheek_l", "cheek_r", "nose"]
    eyes = [n for n in ("eye_l", "eye_r", "eyes") if n in rep["regions"]]
    fb, fa = _mean_of(rep, ["forehead"], "b"), _mean_of(rep, ["forehead"], "a")
    mb, ma = _mean_of(rep, mid, "b"), _mean_of(rep, mid, "a")
    lb, la = _mean_of(rep, ["lower"], "b"), _mean_of(rep, ["lower"], "a")
    if None not in (fb, mb):
        add("forehead yellower than midface", fb - mb >= min_delta,
            {"forehead_b": fb, "mid_b": mb}, "FlippedNormals 00:00:31; Pablo 00:47:39")
    if None not in (fa, ma):
        add("midface redder than forehead", ma - fa >= min_delta,
            {"mid_a": ma, "forehead_a": fa}, "FlippedNormals 00:00:31; Pablo 00:50:21")
    if None not in (lb, mb):
        if sex == "male":
            add("lower third bluer than midface (male)", mb - lb >= min_delta,
                {"lower_b": lb, "mid_b": mb}, "Pablo 00:48:11; FlippedNormals 00:12:46")
        else:
            add("lower third not bluer than midface (female)", mb - lb < 2 * min_delta,
                {"lower_b": lb, "mid_b": mb, "lower_a": la}, "Pablo 00:54:18")
    subj = rep.get("subject", {})
    skin_names = [n for n in ("forehead", "cheek_l", "cheek_r", "nose", "lower")
                  if rep["regions"].get(n, {}).get("pixels")]
    sat = _mean_of(rep, skin_names, "sat")
    if sat is not None and stage != "zones":
        if style == "realistic":
            add("realistic saturation under the middle of the picker", sat < 0.5,
                {"mean_sat": sat}, "Pablo 01:10:30")
        else:
            add("stylized saturation recorded", True, {"mean_sat": sat}, "Pablo 01:10:30")
    if stage != "zones":
        clown = _mean_of(rep, skin_names, "sat_high_frac")
        if clown is not None:
            add("no clown after the cover pass", clown <= max_clown,
                {"sat_above_0.75_frac": clown}, "Pablo 01:05:27")
        sp = _mean_of(rep, skin_names, "speckle")
        if sp is not None:
            add("organic speckle, not airbrush", sp >= min_speckle, {"speckle": sp},
                "FlippedNormals 00:05:07; Pablo 01:02:36")
    if skin_names:
        bs = [rep["regions"][n]["b"] for n in skin_names]
        as_ = [rep["regions"][n]["a"] for n in skin_names]
        spread = max(max(bs) - min(bs), max(as_) - min(as_))
        add("not uniform beige", spread >= min_delta, {"zone_spread_ab": round(spread, 2)},
            "FlippedNormals 00:00:56")
    if eyes and skin_names:
        ec = max(rep["regions"][n]["L_p95"] - rep["regions"][n]["L_p5"] for n in eyes)
        oc = max(rep["regions"][n]["L_p95"] - rep["regions"][n]["L_p5"] for n in skin_names)
        add("strongest value contrast at the eyes", ec >= oc,
            {"eye_contrast": round(ec, 2), "max_other": round(oc, 2)}, "FlippedNormals 00:18:44")
    add("subject measured", subj.get("pixels", 0) > 0, {"pixels": subj.get("pixels")}, "")
    return {"checks": checks, "passed": sum(1 for c in checks if c["pass"]),
            "failed": [c["check"] for c in checks if c["pass"] is False]}


def value_report(img, subject=None):
    """Value range of the subject (L*): percentiles, clipped fractions, saturation mean."""
    import numpy as np
    a = load_rgb(img) if isinstance(img, str) else np.asarray(img)
    m = subject_mask(a) if subject is None else subject
    if not m.any():
        return {"pixels": 0}
    L = rgb_to_lab(a)[..., 0][m]
    s = rgb_to_hsv(a)[..., 1][m]
    return {"pixels": int(m.sum()), "fill": round(float(m.mean()), 4),
            "L_p2": round(float(np.percentile(L, 2)), 2), "L_p50": round(float(np.percentile(L, 50)), 2),
            "L_p98": round(float(np.percentile(L, 98)), 2),
            "L_span": round(float(np.percentile(L, 98) - np.percentile(L, 2)), 2),
            "clipped_white": round(float((L > 99).mean()), 5),
            "clipped_black": round(float((L < 1).mean()), 5),
            "sat_mean": round(float(s.mean()), 3)}


def noise_sigma(img, subject=None):
    """Gaussian noise estimate on the 0..255 grey image (Immerkaer 1996 fast method), over the
    subject interior: grain after denoise at 100 percent (Pavlovich 040hAJ3-cTw 00:44:36)."""
    import numpy as np
    a = load_rgb(img) if isinstance(img, str) else np.asarray(img)
    g = a.astype(np.float64) @ np.array([0.299, 0.587, 0.114])
    k = (g[:-2, :-2] - 2 * g[:-2, 1:-1] + g[:-2, 2:]
         - 2 * g[1:-1, :-2] + 4 * g[1:-1, 1:-1] - 2 * g[1:-1, 2:]
         + g[2:, :-2] - 2 * g[2:, 1:-1] + g[2:, 2:])
    m = np.ones_like(k, dtype=bool)
    if subject is not False:
        sm = subject_mask(a) if subject is None else subject
        m = sm[1:-1, 1:-1] & sm[:-2, 1:-1] & sm[2:, 1:-1] & sm[1:-1, :-2] & sm[1:-1, 2:]
    if not m.any():
        return None
    return round(float(math.sqrt(math.pi / 2.0) / 6.0 * np.abs(k[m]).mean()), 3)


def render_checks(img, min_span=50.0, max_clip=0.005, max_noise=2.0, final=True):
    """Presentation render gates [added thresholds; the criteria are Pavlovich's and the doc's:
    grain at 100 percent, shadows not cut, subject framed]: subject present and not touching
    the border, value span, clipped highlights and blacks, noise estimate (finals only)."""
    sil = zb_review.silhouette_bbox(img) if zb_review else None
    val = value_report(img)
    nz = noise_sigma(img) if final else None
    checks = [
        {"check": "subject present", "pass": bool(sil)},
        {"check": "subject not clipped by the frame", "pass": bool(sil) and not sil["touches_border"]},
        {"check": f"value span L* >= {min_span}", "pass": val.get("L_span", 0) >= min_span,
         "detail": val.get("L_span")},
        {"check": f"clipped whites <= {max_clip}", "pass": val.get("clipped_white", 1) <= max_clip,
         "detail": val.get("clipped_white")},
        {"check": f"clipped blacks <= {max_clip}", "pass": val.get("clipped_black", 1) <= max_clip,
         "detail": val.get("clipped_black")},
    ]
    if final:
        checks.append({"check": f"noise sigma <= {max_noise}", "pass": nz is not None and nz <= max_noise,
                       "detail": nz})
    return {"silhouette": sil, "value": val, "noise": nz, "checks": checks,
            "failed": [c["check"] for c in checks if not c["pass"]]}


def mask_coverage(masked_img, clear_img, subject=None, drop=0.12):
    """Share of the subject that a mask darkens: the SDK cannot read mask data, but a masked
    mesh draws darker (doc: Masked Object Dimming). Render the same view with the mask on and
    after Clear, same material (Flat Color is best), then compare L* [added method]."""
    import numpy as np
    a, b = load_rgb(masked_img), load_rgb(clear_img)
    if a.shape != b.shape:
        raise ValueError("renders differ in size")
    m = subject_mask(b) if subject is None else subject
    La, Lb = rgb_to_lab(a)[..., 0], rgb_to_lab(b)[..., 0]
    dark = (Lb - La) > drop * np.maximum(Lb, 1.0)
    n = int(m.sum())
    return {"subject_pixels": n, "masked_frac": round(float((dark & m).sum() / n), 4) if n else None}


# ============================================================================================
# Agent side: budgets, zone plans, images, passes, turntables
# ============================================================================================

MAP_SIDES = (512, 1024, 2048, 4096, 8192)


def recommend_map_size(points, uv_coverage=0.7):
    """Texture side whose usable pixels (side^2 x UV coverage) best match the vertex count.
    FlippedNormals: about 4M polygons needs about a 2K map, 4K is wasted there (00:30:32 to
    00:31:22); doc Texture Maps: a 2K map has 4M pixels, about 3M usable at 70 percent
    coverage. Nearest in log scale, ties to the smaller side [added rule]."""
    pts = max(1, int(points))
    best = min(MAP_SIDES, key=lambda s: (abs(math.log(s * s * uv_coverage / pts)), s))
    return {"side": best, "usable_pixels": int(best * best * uv_coverage), "points": pts,
            "ratio_points_to_usable": round(pts / (best * best * uv_coverage), 3)}


def map_budget(points, side, uv_coverage=0.7, min_ratio=0.7):
    """Gate: points at least min_ratio of the usable pixels, else the map is bigger than the
    paint can fill (stylized digest paint gate, from the doc's 2K = 3M usable)."""
    usable = side * side * uv_coverage
    ratio = points / usable if usable else 0
    return {"side": side, "points": int(points), "usable_pixels": int(usable),
            "ratio": round(ratio, 3), "pass": ratio >= min_ratio,
            "advice": None if ratio >= min_ratio else
            f"divide further (need about {int(usable * min_ratio):,} points) or use a {recommend_map_size(points, uv_coverage)['side']} map"}


# Pure zone hues for the stage-1 map (Pablo: pure yellow, red, blue "more cyan") [added RGB].
ZONE_HUES = {"yellow": (235, 205, 40), "red": (210, 45, 40), "blue": (40, 150, 215),
             "purple": (110, 60, 160), "orange": (230, 120, 30)}


def skin_zone_plan(sex="male", build="average", tone="light"):
    """Stage-1 zone layout (Pablo d03QU-eUaPo 00:47:08 to 00:55:26), in the same normalised
    front-view coordinates as head_regions_front, for zone_image. Yellow where bone or fat
    blocks light (forehead, nose bridge, cheekbones), red where tissue is thin (eyelids, ears,
    nostrils, mouth), blue in hollows (under the cheekbones, orbits) and the lower face of
    men; fat characters get more yellow, women less blue and more red low; darker skin swaps
    blue for purple and red for orange (Pablo 01:06:35). Radii are [added]."""
    blue = ZONE_HUES["purple"] if tone == "dark" else ZONE_HUES["blue"]
    red = ZONE_HUES["orange"] if tone == "dark" else ZONE_HUES["red"]
    grow = 1.25 if build == "fat" else 1.0
    zones = [
        {"shape": "ellipse", "center": [0.50, 0.26], "radius": [0.30 * grow, 0.12 * grow], "color": ZONE_HUES["yellow"], "feather": 0.06},
        {"shape": "ellipse", "center": [0.50, 0.52], "radius": [0.04, 0.10], "color": ZONE_HUES["yellow"], "feather": 0.03},
        {"shape": "ellipse", "center": [0.33, 0.48], "radius": [0.09, 0.04], "color": blue, "feather": 0.03},
        {"shape": "ellipse", "center": [0.67, 0.48], "radius": [0.09, 0.04], "color": blue, "feather": 0.03},
        {"shape": "ellipse", "center": [0.30, 0.61], "radius": [0.11, 0.07], "color": red, "feather": 0.05},
        {"shape": "ellipse", "center": [0.70, 0.61], "radius": [0.11, 0.07], "color": red, "feather": 0.05},
        {"shape": "ellipse", "center": [0.50, 0.60], "radius": [0.06, 0.06], "color": red, "feather": 0.03},
        {"shape": "ellipse", "center": [0.50, 0.74], "radius": [0.10, 0.03], "color": red, "feather": 0.02},
        {"shape": "ellipse", "center": [0.24, 0.68], "radius": [0.05, 0.05], "color": blue, "feather": 0.04},
        {"shape": "ellipse", "center": [0.76, 0.68], "radius": [0.05, 0.05], "color": blue, "feather": 0.04},
    ]
    if sex == "male":
        zones.append({"shape": "ellipse", "center": [0.50, 0.86], "radius": [0.26, 0.10], "color": blue, "feather": 0.06, "opacity": 0.85})
    else:
        zones.append({"shape": "ellipse", "center": [0.50, 0.86], "radius": [0.24, 0.09], "color": red, "feather": 0.06, "opacity": 0.5})
    return {"base": ZONE_HUES["yellow"], "zones": zones,
            "rule": "Pablo d03QU-eUaPo 00:47:08-00:55:26; FlippedNormals 8iAbH3zSQak 00:00:31"}


def zone_image(path, zones, base=(235, 205, 40), size=(1024, 1024), noise=0.0, seed=0,
               flip_v=False):
    """Paint a zone image for polypaint_from_image(). zones: list of {"shape": "ellipse" |
    "box", "center"/"radius" or "box": [u0, v0, u1, v1] (normalised, u right, v down),
    "color", "feather" (fraction of the short side), "opacity"}. noise adds a speckle
    breakup in 0..1 of full scale, the agent's stand-in for Color Spray with Alpha 07/08
    (FlippedNormals 00:04:35) [added]. flip_v mirrors the result for the UV convention
    measured by live_p04."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
    W, H = size
    canvas = np.zeros((H, W, 3), dtype=np.float64)
    canvas[:] = np.array(_rgb(base), dtype=np.float64)
    for zdef in zones:
        m = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(m)
        if zdef["shape"] == "ellipse":
            cu, cv = zdef["center"]
            ru, rv = zdef["radius"]
            d.ellipse([(cu - ru) * W, (cv - rv) * H, (cu + ru) * W, (cv + rv) * H], fill=255)
        elif zdef["shape"] == "box":
            u0, v0, u1, v1 = zdef["box"]
            d.rectangle([u0 * W, v0 * H, u1 * W, v1 * H], fill=255)
        else:
            raise ValueError("shape must be ellipse or box")
        f = float(zdef.get("feather", 0.0)) * min(W, H)
        if f > 0:
            m = m.filter(ImageFilter.GaussianBlur(f))
        alpha = np.asarray(m, dtype=np.float64)[..., None] / 255.0 * float(zdef.get("opacity", 1.0))
        canvas = canvas * (1 - alpha) + np.array(_rgb(zdef["color"]), dtype=np.float64) * alpha
    if noise > 0:
        rng = np.random.default_rng(seed)
        n = rng.normal(0.0, 1.0, (H, W, 1))
        n = np.asarray(Image.fromarray(np.uint8(np.clip(n * 40 + 128, 0, 255))[..., 0])
                       .filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float64)[..., None]
        canvas = canvas + (n - 128) / 40.0 * noise * 255.0 * 0.25
    out = np.uint8(np.clip(np.round(canvas), 0, 255))
    if flip_v:
        out = out[::-1]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    Image.fromarray(out).save(path)
    return path


BLEND_MODES = ("normal", "multiply", "screen", "lighten", "darken", "overlay", "soft_light")


def blend(base, layer, mode="normal", opacity=1.0, mask=None):
    """Photoshop-style blend of float images in 0..1 (H x W x 3). Pavlovich's pass modes:
    reflection Screen or Soft Light, shadow and AO Multiply, GI Lighten, rim and fill Screen,
    bloom Screen (lEP73nEu3Tc 00:05:46 to 00:26:00). mask: H x W in 0..1 (the BPR Mask pass
    restricts passes to the subject, 00:04:50). Soft light uses the W3C formula."""
    import numpy as np
    a = np.asarray(base, dtype=np.float64)
    b = np.asarray(layer, dtype=np.float64)
    if mode == "normal":
        r = b
    elif mode == "multiply":
        r = a * b
    elif mode == "screen":
        r = 1 - (1 - a) * (1 - b)
    elif mode == "lighten":
        r = np.maximum(a, b)
    elif mode == "darken":
        r = np.minimum(a, b)
    elif mode == "overlay":
        r = np.where(a <= 0.5, 2 * a * b, 1 - 2 * (1 - a) * (1 - b))
    elif mode == "soft_light":
        dd = np.where(a <= 0.25, ((16 * a - 12) * a + 4) * a, np.sqrt(a))
        r = np.where(b <= 0.5, a - (1 - 2 * b) * a * (1 - a), a + (2 * b - 1) * (dd - a))
    else:
        raise ValueError(f"mode must be one of {BLEND_MODES}")
    w = float(opacity)
    if mask is not None:
        w = w * np.asarray(mask, dtype=np.float64)[..., None]
    return np.clip(a * (1 - w) + r * w, 0.0, 1.0)


def composite(base_path, layers, out_path):
    """Rebuild a beauty from passes: layers = [{"path", "mode", "opacity", "mask_path"}], mask
    files read as grey 0..1. Non-destructive tuning instead of re-rendering (Pavlovich
    lEP73nEu3Tc 00:04:34)."""
    import numpy as np
    from PIL import Image
    out = load_rgb(base_path).astype(np.float64) / 255.0
    for L in layers:
        lay = load_rgb(L["path"]).astype(np.float64) / 255.0
        m = None
        if L.get("mask_path"):
            with Image.open(L["mask_path"]) as im:
                m = np.asarray(im.convert("L"), dtype=np.float64) / 255.0
        out = blend(out, lay, L.get("mode", "normal"), L.get("opacity", 1.0), m)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    Image.fromarray(np.uint8(np.round(out * 255))).save(out_path)
    return out_path


ID_COLORS = ((230, 25, 75), (60, 180, 75), (255, 225, 25), (0, 130, 200), (245, 130, 48),
             (145, 30, 180), (70, 240, 240), (240, 50, 230), (210, 245, 60), (250, 190, 212),
             (0, 128, 128), (220, 190, 255), (170, 110, 40), (255, 250, 200), (128, 0, 0),
             (170, 255, 195))  # distinct flat colours [added]


def id_pass(solo_paths, out_path, mask_path=None, order=None):
    """Clown pass (one flat colour per SubTool) and a white subject mask from solo renders
    (subtool_solo_views). Where parts overlap on screen the earlier path in `order` wins;
    pass the front-most parts first, or compare with the beauty render [added]. Returns the
    colour of each part for selections in the composite (Pavlovich lEP73nEu3Tc 00:19:20)."""
    import numpy as np
    from PIL import Image
    paths = list(solo_paths) if order is None else [solo_paths[i] for i in order]
    masks = [subject_mask(p) for p in paths]
    h, w = masks[0].shape
    out = np.zeros((h, w, 3), dtype=np.uint8)
    taken = np.zeros((h, w), dtype=bool)
    legend = []
    for k, m in enumerate(masks):
        col = ID_COLORS[k % len(ID_COLORS)]
        sel = m & ~taken
        out[sel] = col
        taken |= m
        legend.append({"path": paths[k], "color": list(col), "pixels": int(sel.sum())})
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    Image.fromarray(out).save(out_path)
    if mask_path:
        Image.fromarray(np.uint8(taken) * 255, "L").save(mask_path)
    return {"id_pass": out_path, "mask": mask_path, "parts": legend,
            "coverage": round(float(taken.mean()), 4)}


def turntable_rotations(n=36, rule="maxon", start=0.0):
    """Absolute Euler triples for n evenly spaced yaw angles in [0, 360). rule "maxon": Z = 180
    while 90 < yaw < 270, following Maxon's turntable keys (0,180,180) and (0,270,0)
    (SDK example ex_sys_timeline_camera) and MadPony's note that Y beyond 90 needs Z = 180;
    rule "plain": (0, yaw, 0). Which rule keeps the model upright on 2026.2.1 is [verify
    live_p05] (upright_score on a model with a top marker)."""
    if rule not in ("maxon", "plain"):
        raise ValueError("rule must be maxon or plain")
    out = []
    for k in range(int(n)):
        yaw = (start + 360.0 * k / n) % 360.0
        zr = 180.0 if (rule == "maxon" and 90.0 < yaw < 270.0) else 0.0
        out.append((0.0, round(yaw, 6), zr))
    return out


def upright_score(img):
    """(top extent - bottom extent) / height of the silhouette around the canvas centre. With
    a marker bump on top of the model, a positive score means upright [added test aid]."""
    s = zb_review.silhouette_bbox(img)
    if not s:
        return None
    x0, y0, x1, y1 = s["bbox"]
    cy = s["size"][1] / 2.0
    return round(((cy - y0) - (y1 - cy)) / max(1.0, y1 - y0), 4)


def assemble_turntable(frames, out_path, fps=12):
    """GIF (PIL) or MP4 (ffmpeg, H.264, yuv420p) from ordered frames. ZBrush's own movie export
    is MP4 or MOV and resizes above 4095 px (version deltas 3.9)."""
    out_path = os.path.abspath(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    if out_path.lower().endswith(".gif"):
        from PIL import Image
        ims = [Image.open(f).convert("RGB") for f in frames]
        ims[0].save(out_path, save_all=True, append_images=ims[1:], duration=int(1000 / fps), loop=0)
        for im in ims:
            im.close()
        return {"path": out_path, "frames": len(frames)}
    import shutil
    import subprocess
    import tempfile
    ff = shutil.which("ffmpeg")
    if not ff:
        raise ZBPaintError("ffmpeg not found: write a .gif instead")
    with tempfile.TemporaryDirectory() as d:
        for i, f in enumerate(frames):
            os.symlink(os.path.abspath(f), os.path.join(d, f"f_{i:04d}.png"))
        r = subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", str(fps), "-i",
                            os.path.join(d, "f_%04d.png"), "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", out_path],
                           capture_output=True, text=True)
    if r.returncode != 0:
        raise ZBPaintError("ffmpeg failed: " + r.stderr[-400:])
    return {"path": out_path, "frames": len(frames), "fps": fps}
