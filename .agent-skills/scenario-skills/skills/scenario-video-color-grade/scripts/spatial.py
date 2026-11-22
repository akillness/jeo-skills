#!/usr/bin/env python3
"""Spatial (per-frame) tools: relighting and keyed selective color.

These depend on where a pixel is, so they can't live in a LUT. They run in numpy on every
frame, before the look's LUT (see render_looks.py).

RELIGHT ops (look["relight"], applied in linear light, in order):
  light_gradient   directional light wash, e.g. warm low sun raking from the left
  spotlight        brighten (or darken) a soft ellipse, e.g. light the subject, darken the rest;
                   its center can follow keyframes for a moving subject
  graduated_filter graduated ND / color filter, e.g. darken and warm the sky
These are 2D image-space approximations of light, not true 3D relighting: they read as
"the light changed" when the direction agrees with the existing shadows.

SELECTIVE COLOR (look["selective"]): black and white except one keyed color, which is kept
or swapped. The key is cleaned per frame: small blobs dropped (lips, specks), the ground band
optionally excluded, and the object's own highlights let back in.
"""
import numpy as np
from scipy import ndimage

from grade import hsv_to_rgb, rgb_to_hsv, smoothstep, to_disp, to_lin, hue_weight

# ---------------- relight ----------------


def _coords(w, h):
    xs = (np.arange(w) + 0.5) / w
    ys = (np.arange(h) + 0.5) / h
    return np.meshgrid(xs, ys)  # each (h, w), 0..1, origin top-left


def _gain_color(color, strength, weight):
    """Per-pixel linear gain (h*w, 3): 2**(strength*weight) tinted by color (normalized to mean 1)."""
    c = np.array(color if color is not None else (1, 1, 1), float)
    c = c / c.mean()
    mag = 2.0 ** (strength * weight.ravel())[:, None]
    return 1 + (mag - 1) * c


def op_light_gradient(lin, w, h, t, angle=0.0, strength=0.6, color=(1.0, 0.75, 0.5), falloff=1.5, ambient=0.0):
    """Directional light: brightest on the side the light comes FROM, fading across the frame.

    angle: where the light comes from (degrees). 0 = left, 90 = top, 180 = right, 270 = bottom.
    strength: stops added at the bright side (negative = shade that side).
    ambient: stops applied evenly to the whole frame (e.g. -0.5 to make the light read stronger).
    """
    X, Y = _coords(w, h)
    a = np.deg2rad(angle)
    d = np.cos(a) * X + np.sin(a) * Y              # grows away from the light
    d = (d - d.min()) / max(d.max() - d.min(), 1e-6)
    weight = np.power(1 - d, falloff)              # 1 at the light side, 0 at the far side
    out = lin * _gain_color(color, strength, weight)
    return out * 2.0 ** ambient


def op_spotlight(lin, w, h, t, center=(0.5, 0.5), radius=(0.25, 0.4), strength=0.7, color=(1, 1, 1),
                 feather=0.6, outside=0.0, keys=None):
    """Soft elliptical light. center/radius in 0-1 frame units. outside: stops for everything else.

    keys: optional [[time_s, cx, cy], ...] to move the spot with a subject (linear interpolation).
    """
    cx, cy = center
    if keys:
        k = np.array(keys, float)
        cx = np.interp(t, k[:, 0], k[:, 1])
        cy = np.interp(t, k[:, 0], k[:, 2])
    X, Y = _coords(w, h)
    rx, ry = radius
    r = np.sqrt(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2)
    inside = 1 - smoothstep(1 - feather, 1 + feather * 0.5, r)
    out = lin * _gain_color(color, strength, inside)
    if outside:
        out = out * (2.0 ** (outside * (1 - inside).ravel()))[:, None]
    return out


def op_graduated_filter(lin, w, h, t, angle=90.0, position=0.45, softness=0.25, strength=-0.8, color=(1, 1, 1)):
    """Graduated filter from one edge, like a glass ND grad: darken / tint the sky.

    angle: edge the filter starts from (90 = top, 270 = bottom, 0 = left, 180 = right).
    position: where the transition is centered (0-1 from that edge). strength: stops at the edge.
    """
    X, Y = _coords(w, h)
    a = np.deg2rad(angle)
    d = np.cos(a) * X + np.sin(a) * Y
    d = (d - d.min()) / max(d.max() - d.min(), 1e-6)
    weight = 1 - smoothstep(position - softness, position + softness, d)
    return lin * _gain_color(color, strength, weight)


RELIGHT = {"light_gradient": op_light_gradient, "spotlight": op_spotlight, "graduated_filter": op_graduated_filter}


def relight(rgb, w, h, t, ops):
    """Apply relight ops (display RGB in, display RGB out), working in linear light."""
    lin = to_lin(rgb)
    for step in ops:
        args = {k: v for k, v in step.items() if k != "op"}
        lin = RELIGHT[step["op"]](lin, w, h, t, **args)
    return to_disp(np.clip(lin, 0, None))


# ---------------- selective color (keyed) ----------------

KEY_THRESHOLD = 0.25


def key_weight(h, s, v, k, H=None):
    """Raw color key: hue range, minimum saturation, optional brightness ceiling and ground cut-off."""
    w = hue_weight(h, s, k["center"], k["width"], k["min_sat"])
    if k.get("max_val") is not None:
        w = w * (1 - smoothstep(k["max_val"], k["max_val"] + 0.08, v))
    if k.get("max_y") is not None and H:
        y = np.repeat(np.arange(H) / H, len(h) // H)
        w = w * (1 - smoothstep(k["max_y"], k["max_y"] + 0.03, y))
    return w


def clean(w, W, H, min_area=1500):
    """Keep only connected regions of the key bigger than min_area; soft edges.

    min_area: pixels, or a fraction of the frame when < 1 (0.002 = 0.2% of the frame).
    """
    if min_area < 1:
        min_area = min_area * W * H
    m = ndimage.binary_closing(w.reshape(H, W) > KEY_THRESHOLD, iterations=2)
    lab, n = ndimage.label(m)
    if n == 0:
        return np.zeros_like(w), []
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.flatnonzero(sizes >= min_area))
    keep = ndimage.binary_dilation(keep, iterations=4)
    soft = ndimage.gaussian_filter(keep.astype(np.float32), 2.5).ravel()
    return w * np.clip(soft * 1.2, 0, 1), sorted(sizes.astype(int), reverse=True)


def object_weight(rgb, W, H, k):
    """Final keep-weight: strict key finds the object, a relaxed key lets its highlights back in."""
    h, s, v = rgb_to_hsv(np.clip(rgb, 0, 1))
    w, _ = clean(key_weight(h, s, v, k, H), W, H, k.get("min_area", 1500))
    region = ndimage.binary_fill_holes(ndimage.binary_dilation(w.reshape(H, W) > 0.05, iterations=6))
    soft = np.clip(ndimage.gaussian_filter(region.astype(np.float32), 2.5).ravel() * 1.2, 0, 1)
    relaxed = dict(k, max_val=k.get("max_val_hi", 0.9), min_sat=k.get("min_sat_hi", 0.18), width=k["width"] + 8)
    return np.maximum(w, key_weight(h, s, v, relaxed, H) * soft), (h, s, v)


def guided(guide, p, r=3, eps=1e-3):
    """He et al. guided filter: the edges of p snap to the edges of the guide image (sub-pixel, no halo)."""
    box = lambda x: ndimage.uniform_filter(x, 2 * r + 1)
    mI, mp = box(guide), box(p)
    a = (box(guide * p) - mI * mp) / (box(guide * guide) - mI * mI + eps)
    return np.clip(box(a) * guide + box(mp - a * mI), 0, 1)


def mask_weight(rgb, W, H, sel, masks):
    """Pixel-accurate keep-weight from object mask videos, edges snapped to the image.

    sel["masks"] = [{"path": "masks/jacket.mp4"}, {"path": "masks/pump.mp4", "key": {...}}]
    A mask entry with "key" keeps only the keyed color INSIDE that object (a red pump with white panels).
    """
    h, s, v = rgb_to_hsv(np.clip(rgb, 0, 1))
    lum = (np.clip(rgb, 0, 1) @ np.array([0.2126, 0.7152, 0.0722])).reshape(H, W).astype(np.float32)
    w = np.zeros((H, W), np.float32)
    for m in sel["masks"]:
        base = ndimage.binary_opening(masks[m["path"]], iterations=1)
        if m.get("key"):
            soft = guided(lum, ndimage.binary_erosion(base, iterations=1).astype(np.float32))
            k = key_weight(h, s, v, m["key"], H).reshape(H, W) > 0.5
            wi = guided(lum, (k & (soft > 0.5)).astype(np.float32)) * soft
        else:
            wi = guided(lum, base.astype(np.float32))
        w = np.maximum(w, wi)
    return w.ravel(), (h, s, v)


def selective(rgb, W, H, sel, masks=None):
    """B&W everywhere except the keyed (or masked) object, which keeps or swaps its color."""
    if sel.get("masks"):
        w, (h, s, v) = mask_weight(rgb, W, H, sel, masks)
    else:
        w, (h, s, v) = object_weight(rgb, W, H, sel)
    wt = np.array(sel.get("weights", (0.3, 0.55, 0.15)), float)
    gray = np.repeat((np.clip(rgb, 0, 1) @ (wt / wt.sum()))[:, None], 3, axis=1)
    kept = hsv_to_rgb(h + sel.get("shift", 0.0),
                      np.clip(np.maximum(s * sel.get("sat", 1.0), sel.get("sat_floor", 0.0)), 0, 1),
                      np.clip(v * sel.get("val", 1.0), 0, 1))
    return gray + w[:, None] * (kept - gray)


def needs_frames(look):
    """True if a look needs the per-frame (numpy) path instead of a pure LUT."""
    return bool(look.get("relight") or look.get("selective"))


def mask_paths(look):
    return [m["path"] for m in (look.get("selective") or {}).get("masks", [])]


def process(rgb, W, H, t, look, masks=None):
    """Per-frame spatial part of a look: relight, then keyed / masked selective color.

    masks: {path: bool (H, W) array for this frame} for looks whose selective uses mask videos.
    """
    x = rgb
    if look.get("relight"):
        x = relight(x, W, H, t, look["relight"])
    if look.get("selective"):
        x = selective(x, W, H, look["selective"], masks)
    return x
