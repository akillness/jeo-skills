"""
zb_review: the agent's orbit. Canvas renders from fixed views with a neutral MatCap, tiled
into one labelled contact sheet the agent opens with its image reader.

Two halves:
  inside ZBrush (through zb_launch.call): capture_views(), snapshot()
  agent side (system python3 with PIL + numpy): review(), contact_sheet(), silhouette_bbox()

    import zb_review
    rep = zb_review.review("/abs/out/stage2")          # front, right, back, 3/4, top
    # open rep["sheet"]; rep["silhouettes"] flags clipped or empty views

Proven: Document:Export writes the canvas PNG without a dialog, also with the screen locked
(v03). Everything else here is not yet run in ZBrush: the view triples (zb_stroke.VIEWS,
only "front" is the default view of a drawn tool), the math framing (Maxon's 0.75 rule),
Transform:Fit, the MatCap path Material:MatCap Gray (file ZData/Materials/MatCap/
MatCap Gray.ZMT exists), restoring the transform and material. live_03 checks all of it.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import os

import zb_ops
import zb_stroke

DEFAULT_VIEWS = ("front", "right", "back", "threequarter", "top")
NEUTRAL_MATCAP = "MatCap Gray"


# --------------------------------------------------------------------------------------------
# Inside ZBrush
# --------------------------------------------------------------------------------------------

def _facing_axis(t, conv=None):
    """Which model axis (OBJ export space) faces the camera for transform t, under the
    current convention: a label to check the view names against [verify]."""
    cam = zb_stroke.Camera(t, (0, 0, 0), conv)
    best = max(((cam.facing(n), lab) for lab, n in (
        ("+X", (1, 0, 0)), ("-X", (-1, 0, 0)), ("+Y", (0, 1, 0)), ("-Y", (0, -1, 0)),
        ("+Z", (0, 0, 1)), ("-Z", (0, 0, -1)))))
    return best[1]


def capture_views(out_dir, views=DEFAULT_VIEWS, matcap=NEUTRAL_MATCAP, frame="math", margin=0.75,
                  render=None, prefix="view", restore=True):
    """Set each view, export the canvas PNG, then restore the transform, MatCap and
    perspective. frame: "math" (same scale for every view: centre + Maxon's rule), "fit"
    (rotation then Transform:Fit), "keep" (rotation only). render: None or "bpr"."""
    z = zb_ops._z()
    zb_ops.ensure_edit()
    os.makedirs(out_dir, exist_ok=True)
    t0 = [float(v) for v in z.get_transform()]
    w, h = z.get("Document:Width"), z.get("Document:Height")
    bbox = [float(v) for v in z.query_mesh3d(2, 3)]  # full bbox of all SubTools
    mat = None
    if matcap:
        try:
            mat = zb_ops.set_material(matcap)
        except zb_ops.ZBOpError as e:  # keep reviewing with the current material
            mat = {"error": str(e)}
    persp = zb_ops.resolve("persp", required=False)
    persp_was = z.get(persp) if persp else 0
    if persp and persp_was:
        z.set(persp, 0)
    shots = []
    try:
        for i, v in enumerate(views):
            rot = tuple(float(a) for a in (zb_stroke.VIEWS[v] if isinstance(v, str) else v))
            label = v if isinstance(v, str) else "rot_%g_%g_%g" % rot
            tset = None
            if frame == "math":
                tset = zb_stroke.frame_transform(bbox, w, h, rot, margin)
                z.set_transform(*tset)
            else:
                z.set_transform(x_rotate=rot[0], y_rotate=rot[1], z_rotate=rot[2])
                if frame == "fit":
                    fp = zb_ops.resolve("fit", required=False)
                    if fp:
                        z.press(fp)
            z.update(redraw_ui=True)
            if render == "bpr":
                z.press(zb_ops.resolve("bpr"))
            path = os.path.join(out_dir, f"{prefix}_{i:02d}_{label}.png")
            info = zb_ops.export_canvas(path, overwrite=True)
            tr = [float(a) for a in z.get_transform()]
            shots.append({"view": label, "rotation": list(rot), "transform_set": tset,
                          "transform_read": tr, "facing_axis_h0": _facing_axis(tr), **info})
    finally:
        if restore:
            z.set_transform(*t0)
            if persp and persp_was:
                z.set(persp, persp_was)
            if mat and mat.get("previous"):
                back = "Material:" + mat["previous"]
                mat["restored"] = bool(z.exists(back))
                if mat["restored"]:
                    z.press(back)
            z.update(redraw_ui=True)
    return {"views": shots, "doc": [w, h], "bbox": bbox, "frame": frame,
            "transform_before": t0, "transform_after": [float(a) for a in z.get_transform()],
            "material": mat}


def snapshot(path, view=None, matcap=None, render=None):
    """One PNG of the canvas. view None keeps the current view (no transform change)."""
    if view is None:
        z = zb_ops._z()
        prev = zb_ops.set_material(matcap) if matcap else None
        try:
            if render == "bpr":
                z.press(zb_ops.resolve("bpr"))
            return zb_ops.export_canvas(path, overwrite=True)
        finally:
            if prev and prev.get("previous") and z.exists("Material:" + prev["previous"]):
                z.press("Material:" + prev["previous"])
    d, base = os.path.split(os.path.abspath(path))
    res = capture_views(d, [view], matcap or NEUTRAL_MATCAP, "math", render=render,
                        prefix=os.path.splitext(base)[0])
    return res


# --------------------------------------------------------------------------------------------
# Agent side
# --------------------------------------------------------------------------------------------

def silhouette_bbox(png_path, threshold=28, edge=4):
    """Model pixels against the canvas background. ZBrush's background is a vertical
    gradient (v03_canvas.png: black top, grey bottom), so each row's background is the
    median of its outer `edge` pixels. Returns {"bbox": [x0, y0, x1, y1], "fill",
    "touches_border", "size"} or None when nothing stands out."""
    import numpy as np
    from PIL import Image
    with Image.open(png_path) as src:
        im = np.asarray(src.convert("RGB")).astype(np.int16)
    hgt, wid, _ = im.shape
    ref = np.median(np.concatenate([im[:, :edge], im[:, -edge:]], axis=1), axis=1)
    diff = np.abs(im - ref[:, None, :]).max(axis=2)
    mask = diff > threshold
    mask[:, :edge] = False
    mask[:, -edge:] = False
    if not mask.any():
        return None
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    return {"bbox": [x0, y0, x1, y1], "fill": round(float(mask.mean()), 4),
            "touches_border": x0 <= edge or y0 <= 0 or x1 >= wid - 1 - edge or y1 >= hgt - 1,
            "size": [wid, hgt]}


def contact_sheet(paths, labels, out_path, cols=None, thumb_w=560, title=None,
                  bg=(24, 24, 24), fg=(235, 235, 235)):
    """Tile images left to right, top to bottom, with a label bar above each."""
    from PIL import Image, ImageDraw, ImageFont
    ims = []
    for p in paths:
        with Image.open(p) as im:
            ims.append(im.convert("RGB"))
    if not ims:
        raise ValueError("no images")
    cols = cols or min(3, len(ims))
    rows = (len(ims) + cols - 1) // cols
    th = [int(im.height * thumb_w / im.width) for im in ims]
    cell_h = max(th) + 30
    top = 40 if title else 0
    sheet = Image.new("RGB", (cols * thumb_w + (cols + 1) * 8, top + rows * cell_h + (rows + 1) * 8), bg)
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default(size=18)
        tfont = ImageFont.load_default(size=22)
    except TypeError:  # Pillow < 10.1
        font = tfont = ImageFont.load_default()
    if title:
        draw.text((10, 8), title, fill=fg, font=tfont)
    for i, (im, lab) in enumerate(zip(ims, labels)):
        r, c = divmod(i, cols)
        x = 8 + c * (thumb_w + 8)
        y = top + 8 + r * (cell_h + 8)
        draw.text((x + 4, y + 4), str(lab), fill=fg, font=font)
        sheet.paste(im.resize((thumb_w, th[i])), (x, y + 30))
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    sheet.save(out_path)
    return out_path


def _label(shot, sil):
    s = f"{shot['view']} {tuple(int(a) for a in shot['rotation'])}"
    if sil is None:
        return s + " EMPTY"
    if sil["touches_border"]:
        s += " CLIPPED"
    return s


def review(out_dir, views=DEFAULT_VIEWS, matcap=NEUTRAL_MATCAP, frame="auto", margin=0.75,
           render=None, port=7788, sheet="review_sheet.png", title=None, timeout=240):
    """Capture the views through the bridge, check silhouettes, tile the contact sheet.
    frame "auto": math framing first, then Transform:Fit if a view is clipped or empty."""
    import zb_launch
    out_dir = os.path.abspath(out_dir)
    mode = "math" if frame == "auto" else frame
    res = zb_launch.call("zb_review", "capture_views", out_dir, list(views), matcap, mode,
                         margin, render, port=port, timeout=timeout)
    sils = [silhouette_bbox(s["path"]) for s in res["views"]]
    bad = sum(1 for s in sils if s is None or s["touches_border"])
    if frame == "auto" and bad:
        res2 = zb_launch.call("zb_review", "capture_views", out_dir, list(views), matcap, "fit",
                              margin, render, "fit", port=port, timeout=timeout)
        sils2 = [silhouette_bbox(s["path"]) for s in res2["views"]]
        if sum(1 for s in sils2 if s is None or s["touches_border"]) < bad:
            res, sils, mode = res2, sils2, "fit"
    labels = [_label(s, q) for s, q in zip(res["views"], sils)]
    path = contact_sheet([s["path"] for s in res["views"]], labels,
                         os.path.join(out_dir, sheet), title=title or f"{matcap} | frame {mode}")
    drift = max(abs(a - b) for a, b in zip(res["transform_before"], res["transform_after"]))
    return {"sheet": path, "frame_used": mode, "views": res["views"], "silhouettes": sils,
            "transform_restored": drift < 1e-3, "transform_drift": drift,
            "material": res.get("material")}
