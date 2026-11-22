#!/usr/bin/env python3
"""Static clean-plate patch: hide a piece that never moves, for the whole shot, with one image layer.

Usage: python3 make_patch.py config.json

Use it only with a locked camera, on a piece nothing ever passes over. The patch is cut from empty
texture in the same take (same surface, lines and light) and shifted onto the piece. Feather only
the edges that sit on flat texture; keep hard edges on painted lines and borders, where a seam
cannot show.

config.json (paths relative to it):
{
  "source": "frame.png",
  "pieces": [{"dest": [x0, y0, x1, y1], "offset": [dx, dy],
              "feather": {"top": 8, "left": 6, "right": 0, "bottom": 0}}],
  "gain": [1, 1, 1],
  "out": "patch.png",
  "start": 0, "end": 333, "fps": 30,
  "checks": ["frame_0.5.png"],
  "takes": ["fail.mp4", "payoff.mp4"]
}
- source: a canvas-size frame where every donor area is empty.
- pieces composite in order, later over earlier. dest is the canvas box to cover (x1, y1
  exclusive); the donor pixel is the dest pixel plus offset. feather is a soft edge per side in
  pixels, 0 for hard.
- gain: an optional per-channel tone match, measured, never guessed.
- start and end: optional frames the layer covers, written into the layer. Its endTime is half a
  frame before the end frame, since compose draws an image layer on the frame at exactly its endTime.
- checks: frames written back as <name>_patched.png for full-resolution review.
- takes: every take the patch covers. Per take it prints the largest share of patch pixels that
  change by more than 40 levels against the take's first frame (anything moving through the box
  reads CHECK), and the mean level of a ring around the box, which should match across takes
  within about 2 levels for one patch to cover them all.

The PNG is padded with transparent pixels to at least 304 px a side, kept inside the canvas,
because compose draws an image under about 300 px on a side at the wrong scale. It writes <out>
and <out>.layer.json, an image layer with string x, y, width, height and fit "fill".
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

MIN_SIDE = 304
MOVED = 40
RING = 12


class PatchError(Exception):
    pass


def smooth(u):
    u = np.clip(u, 0.0, 1.0)
    return u * u * (3 - 2 * u)


def piece(src, p, gain):
    x0, y0, x1, y1 = p["dest"]
    dx, dy = p.get("offset", (0, 0))
    feather = {"top": 0, "left": 0, "right": 0, "bottom": 0, **p.get("feather", {})}
    w, h = x1 - x0, y1 - y0
    if not (0 <= x0 + dx and 0 <= y0 + dy and x1 + dx <= src.shape[1] and y1 + dy <= src.shape[0]):
        raise PatchError(f"the donor box of {p['dest']} with offset {[dx, dy]} falls outside the frame")
    rgb = src[y0 + dy:y1 + dy, x0 + dx:x1 + dx] * gain
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    a = np.ones((h, w), np.float32)
    for side, dist in (("top", yy), ("bottom", h - 1 - yy), ("left", xx), ("right", w - 1 - xx)):
        if feather[side]:
            a *= smooth(dist / feather[side])
    return rgb, a


def padded_box(union, size):
    """The union grown to MIN_SIDE a side around its center, shifted to stay inside the canvas."""
    box = list(union)
    for lo, hi, limit in ((0, 2, size[0]), (1, 3, size[1])):
        need = max(0, MIN_SIDE - (box[hi] - box[lo]))
        box[lo] -= need // 2
        box[hi] += need - need // 2
        shift = max(0, -box[lo]) - max(0, box[hi] - limit)
        box[lo], box[hi] = max(0, box[lo] + shift), min(limit, box[hi] + shift)
    return box


def build(cfg, base):
    src = np.asarray(Image.open(base / cfg["source"]).convert("RGB"), np.float32)
    gain = np.array(cfg.get("gain", [1, 1, 1]), np.float32)
    pieces = cfg["pieces"]
    union = [min(p["dest"][0] for p in pieces), min(p["dest"][1] for p in pieces),
             max(p["dest"][2] for p in pieces), max(p["dest"][3] for p in pieces)]
    X0, Y0, X1, Y1 = padded_box(union, (src.shape[1], src.shape[0]))
    rgb = np.zeros((Y1 - Y0, X1 - X0, 3), np.float32)
    alpha = np.zeros((Y1 - Y0, X1 - X0), np.float32)
    for p in pieces:
        c, a = piece(src, p, gain)
        x0, y0, x1, y1 = p["dest"]
        sl = (slice(y0 - Y0, y1 - Y0), slice(x0 - X0, x1 - X0))
        rgb[sl] = c * a[..., None] + rgb[sl] * (1 - a[..., None])  # premultiplied "over"
        alpha[sl] = a + alpha[sl] * (1 - a)
    color = np.where(alpha[..., None] > 0, rgb / np.maximum(alpha[..., None], 1e-6), 0)
    out = np.dstack([np.clip(color + 0.5, 0, 255), np.clip(alpha * 255 + 0.5, 0, 255)]).astype(np.uint8)
    layer = {"type": "image", "source": Path(cfg["out"]).name, "x": str(X0), "y": str(Y0),
             "width": str(X1 - X0), "height": str(Y1 - Y0), "fit": "fill"}
    fps = cfg.get("fps", 30)
    if "start" in cfg:
        layer["startTime"] = cfg["start"] * 1000 // fps / 1000
    if "end" in cfg:
        layer["endTime"] = (cfg["end"] * 1000 // fps - round(500 / fps)) / 1000
    return out, layer, union


def composite(frame, patch, layer):
    f = frame.astype(np.float32)
    x, y = int(layer["x"]), int(layer["y"])
    h, w = patch.shape[:2]
    a = patch[..., 3:4] / 255.0
    f[y:y + h, x:x + w] = f[y:y + h, x:x + w] * (1 - a) + patch[..., :3] * a
    return np.clip(f + 0.5, 0, 255).astype(np.uint8)


def take_stats(video, union, size):
    """Largest share of moved pixels inside the box against frame 0, its frame, and the ring level."""
    x0, y0 = max(0, union[0] - RING), max(0, union[1] - RING)
    x1, y1 = min(size[0], union[2] + RING), min(size[1], union[3] + RING)
    w, h = x1 - x0, y1 - y0
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"scale={size[0]}:{size[1]},crop={w}:{h}:{x0}:{y0}",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3).astype(np.int16)
    inner = np.zeros((h, w), bool)
    inner[union[1] - y0:union[3] - y0, union[0] - x0:union[2] - x0] = True
    moved = [(np.abs(f - frames[0]).max(axis=2)[inner] > MOVED).mean() for f in frames]
    k = int(np.argmax(moved))
    return float(moved[k]), k, float(frames[:, ~inner].mean()) if (~inner).any() else float("nan")



def same_file(a, b):
    """True when two paths name one file, so an output would overwrite an input."""
    return a is not None and b is not None and Path(a).resolve() == Path(b).resolve()

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("config", type=Path)
    args = ap.parse_args(argv)
    cfg = json.loads(args.config.read_text())
    base = args.config.parent
    inputs = [args.config, *(base / n for n in [cfg.get("source"), *cfg.get("checks", []), *cfg.get("takes", [])] if n)]
    if "out" in cfg and any(same_file(base / cfg["out"], p) for p in inputs):
        print(f"error: out {cfg['out']} is one of the patch's inputs; name another file", file=sys.stderr)
        return 2
    try:
        patch, layer, union = build(cfg, base)
    except (KeyError, PatchError) as e:
        print(f"error: {f'missing key {e}' if isinstance(e, KeyError) else e}", file=sys.stderr)
        return 2
    out = base / cfg["out"]
    Image.fromarray(patch, "RGBA").save(out)
    out.with_name(out.name + ".layer.json").write_text(json.dumps(layer, indent=1) + "\n")
    print(f"patch {out}: layer {layer}")
    for name in cfg.get("checks", []):
        frame = np.asarray(Image.open(base / name).convert("RGB"))
        target = (base / name).with_name(Path(name).stem + "_patched.png")
        Image.fromarray(composite(frame, patch, layer)).save(target)
        print(f"check frame {target}")
    with Image.open(base / cfg["source"]) as im:
        size = im.size
    status, rings = 0, []
    for video in cfg.get("takes", []):
        share, k, ring = take_stats(base / video, union, size)
        rings.append(ring)
        flag = "CHECK: something moves through the box" if share > 0.01 else ""
        status |= bool(flag)
        print(f"take {video}: {share:.1%} of the box moves (frame {k}), ring level {ring:.1f} {flag}")
    if len(rings) > 1 and max(rings) - min(rings) > 2:
        print(f"CHECK: ring levels differ by {max(rings) - min(rings):.1f} across takes; one patch may not match them all")
        status = 1
    return status


if __name__ == "__main__":
    sys.exit(main())
