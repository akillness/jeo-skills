"""
bx_gui: drive Blender's REAL brushes from Python in a live GUI session.

Only for a Blender that has a window (the MCP bridge / user's running Blender).
Headless (`--background`) there is no 3D view region: brush strokes fail their poll
and some sculpt operators (paint.mask_flood_fill, sculpt.mesh_filter) crash Blender.
Headless, use scenario-blender-sculpting/scripts/bx_sculpt.py instead.

Verified on Blender 5.2.1 GUI (2026-09-24): Clay Strips sculpt stroke, stroke with
dyntopo on, mask flood fill, weight paint stroke, texture paint stroke.
NOT drivable: hair-curve sculpting (`sculpt_curves.brush_stroke` has no exec and returns
PASS_THROUGH; event simulation does not help either). For hair, write guide curves as
data and use the hair node-group assets (see scenario-blender-hair).

  import sys; sys.path.append("<skill>/scripts"); import bx_gui as G
  G.set_view("FRONT", frame=obj)                       # orient the view the stroke is drawn in
  G.activate_brush("SCULPT", "Clay Strips")            # 5.x brush assets (Essentials library)
  G.stroke("SCULPT", world_points, size=80, strength=0.5)
  G.run("paint.mask_flood_fill", mode="VALUE", value=0.0)   # any op that needs the 3D view

Rules learned the hard way:
  - Stroke points must be visible from the current view: set_view() first, pick a view
    that looks at the surface you are working on (points behind the surface miss).
  - `size` is the brush DIAMETER in pixels (5.0 change). Pixel size depends on zoom:
    frame the object first so the same size means the same thing every time.
  - Paint colour defaults to black in a factory 5.2 session and is a unified per-mode
    setting: set_paint_color() sets both the brush and the unified colour.
  - Stroke element keys in 5.2: name, location, mouse, mouse_event, pressure, size,
    x_tilt, y_tilt, time, is_start (no 'pen_flip').
  - The exec path reads `location` in OBJECT space (mouse is region space). stroke()
    converts world points for you; passing world coordinates for an object away from
    the origin makes dabs land off the mesh (nothing moves) or in the wrong place.
  - set_view() frames in Object Mode with Smooth View off and forces a redraw, then
    restores the mode: view_selected from Sculpt Mode does not frame, and region
    matrices only refresh on redraw.
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import bpy
from bpy_extras import view3d_utils
from mathutils import Vector

BRUSH_FILES = {
    "SCULPT": "essentials_brushes-mesh_sculpt.blend",
    "TEXTURE_PAINT": "essentials_brushes-mesh_texture.blend",
    "VERTEX_PAINT": "essentials_brushes-mesh_vertex.blend",
    "WEIGHT_PAINT": "essentials_brushes-mesh_weight.blend",
    "SCULPT_CURVES": "essentials_brushes-curve_sculpt.blend",
}
STROKE_OPS = {
    "SCULPT": "sculpt.brush_stroke",
    "TEXTURE_PAINT": "paint.image_paint",
    "VERTEX_PAINT": "paint.vertex_paint",
    "WEIGHT_PAINT": "paint.weight_paint",
    "SCULPT_CURVES": "sculpt_curves.brush_stroke",
}
PAINT_SETTINGS = {"SCULPT": "sculpt", "TEXTURE_PAINT": "image_paint",
                  "VERTEX_PAINT": "vertex_paint", "WEIGHT_PAINT": "weight_paint"}


def has_window():
    return not bpy.app.background and bool(bpy.context.window_manager.windows)


def view3d():
    """(window, area, region, region_3d) of the first 3D viewport."""
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == "VIEW_3D":
                region = next(r for r in area.regions if r.type == "WINDOW")
                return win, area, region, area.spaces.active.region_3d
    raise RuntimeError("no 3D viewport: bx_gui needs a GUI session (use bx_sculpt headless)")


def run(op_path, **kwargs):
    """Call any operator with a 3D-view context, e.g. run('sculpt.face_sets_init', mode='LOOSE_PARTS')."""
    win, area, region, _ = view3d()
    mod, name = op_path.split(".")
    with bpy.context.temp_override(window=win, area=area, region=region):
        return getattr(getattr(bpy.ops, mod), name)(**kwargs)


def set_view(axis="FRONT", frame=None):
    """axis: FRONT BACK LEFT RIGHT TOP BOTTOM. frame=object to zoom on (selected alone).
    view3d.view_selected does not frame the object from Sculpt/paint modes (found
    2026-09-24: a 30 px stroke then covered the whole head and flattened it), so the
    framing happens in Object Mode and the previous mode is restored afterwards."""
    if frame is not None:
        mode = frame.mode
        if mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        for o in bpy.context.selected_objects:
            o.select_set(False)
        frame.select_set(True)
        bpy.context.view_layer.objects.active = frame
    # Smooth View animates the camera over ~200 ms; strokes projected before it ends
    # land in the old view and miss. Disable it while framing.
    prefs = bpy.context.preferences.view
    smooth = prefs.smooth_view
    prefs.smooth_view = 0
    try:
        run("view3d.view_axis", type=axis)
        if frame is not None:
            run("view3d.view_selected")
    finally:
        prefs.smooth_view = smooth
    if frame is not None and mode != "OBJECT":
        bpy.ops.object.mode_set(mode=mode)
    redraw()


def redraw():
    """Force a viewport redraw: region_3d projection matrices (used by strokes and by
    location_3d_to_region_2d) only refresh when the region draws."""
    win, area, region, _ = view3d()
    with bpy.context.temp_override(window=win, area=area, region=region):
        bpy.ops.wm.redraw_timer(type="DRAW_WIN_SWAP", iterations=1)


def activate_brush(mode, name):
    """Activate an Essentials brush asset for a paint mode (object must be in that mode)."""
    return bpy.ops.brush.asset_activate(
        asset_library_type="ESSENTIALS", asset_library_identifier="",
        relative_asset_identifier=f"brushes/{BRUSH_FILES[mode]}/Brush/{name}")


def brush(mode):
    return getattr(bpy.context.tool_settings, PAINT_SETTINGS[mode]).brush


def set_paint_color(mode, rgb):
    ps = getattr(bpy.context.tool_settings, PAINT_SETTINGS[mode])
    if ps.brush is not None:
        ps.brush.color = rgb
    ps.unified_paint_settings.color = rgb


def stroke(mode, world_points, size=60, pressure=1.0, strength=None, invert=False,
           snap=True, **op_kwargs):
    """Run one brush stroke through world-space points (object must be in `mode`).
    snap=True casts a ray from the view through each point onto the active object, as a
    mouse would, and uses the hit as the dab location (the exec path uses `location`
    literally, so a point 5 cm off the surface affects nothing). Points whose ray misses
    are skipped and returned. Returns (operator result, missed points)."""
    redraw()   # region matrices and paint canvases refresh on draw (texture paint needs it)
    win, area, region, rv3d = view3d()
    ob = bpy.context.active_object
    to_local = ob.matrix_world.inverted() if ob is not None else None
    b = brush(mode) if mode in PAINT_SETTINGS else None
    if b is not None and strength is not None:
        b.strength = strength
    elems, missed = [], []
    for i, p in enumerate(world_points):
        xy = view3d_utils.location_3d_to_region_2d(region, rv3d, Vector(p))
        if xy is None:
            missed.append(p)
            continue
        loc_world = Vector(p)
        if snap and ob is not None and ob.type == "MESH":
            origin = view3d_utils.region_2d_to_origin_3d(region, rv3d, xy)
            direction = view3d_utils.region_2d_to_vector_3d(region, rv3d, xy)
            o_l = to_local @ origin
            d_l = (to_local.to_3x3() @ direction).normalized()
            hit, loc_l, _n, _idx = ob.ray_cast(o_l, d_l)
            if not hit:
                missed.append(p)
                continue
            loc_world = ob.matrix_world @ loc_l
        # 'location' is read in OBJECT space by the exec path; 'mouse' is region space
        loc = tuple(to_local @ loc_world) if to_local is not None else tuple(loc_world)
        elems.append({"name": "", "location": loc, "mouse": (xy.x, xy.y),
                      "mouse_event": (xy.x, xy.y), "pressure": pressure, "size": size,
                      "time": float(i), "x_tilt": 0.0, "y_tilt": 0.0, "is_start": not elems})
    if not elems:
        return {"CANCELLED"}, missed
    if mode == "SCULPT":
        op_kwargs.setdefault("mode", "INVERT" if invert else "NORMAL")
    mod, name = STROKE_OPS[mode].split(".")
    with bpy.context.temp_override(window=win, area=area, region=region):
        r = getattr(getattr(bpy.ops, mod), name)(stroke=elems, **op_kwargs)
    return r, missed


def screenshot(path):
    """Viewport screenshot of the whole window (what a human would see)."""
    win, area, region, _ = view3d()
    with bpy.context.temp_override(window=win, area=area, region=region):
        bpy.ops.screen.screenshot_area(filepath=path)
    return path
