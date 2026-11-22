#!/usr/bin/env python3
"""Inspection tools for tuning looks by measurement instead of guesswork.

  python3 inspect_frame.py grid   <video|image> <out.jpg> [--frame N] [--step 100]
      Full-resolution frame with a labeled pixel grid, to read coordinates for `sample`.

  python3 inspect_frame.py sample <video|image> [--frame N] x0,y0,x1,y1[:name] ...
      Hue / saturation / brightness percentiles (p10/50/90) of each rectangle (full-res pixels).
      Use it to find what separates the thing you want to key from skin, sky, etc.

  python3 inspect_frame.py key    <video|image> <looks.json> <look_key> <out.jpg> [--frame N ...]
      Red overlay on a gray frame of what a look's "selective" key or masks keep, plus blob sizes.
      Check faces, lips, hands and the ground are NOT red before rendering the video.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import grade
import media
import spatial


def load(src, frame):
    info = media.probe(src)
    W, H = info["w"], info["h"]
    rgb = next(media.frames(src, W, H)) if media.is_image(src) else media.frame_at(src, frame or 0, W, H)
    return rgb, W, H


def cmd_grid(a):
    rgb, W, H = load(a.src, a.frame)
    img = Image.fromarray((rgb.reshape(H, W, 3) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img, "RGBA")
    for x in range(0, W, a.step):
        d.line((x, 0, x, H), fill=(255, 255, 0, 110))
        d.text((x + 3, 3), str(x), fill=(255, 255, 0, 255))
    for y in range(0, H, a.step):
        d.line((0, y, W, y), fill=(255, 255, 0, 110))
        d.text((3, y + 3), str(y), fill=(255, 255, 0, 255))
    img.save(a.out, quality=90)
    print("wrote", a.out, f"({W}x{H})")


def cmd_sample(a):
    rgb, W, H = load(a.src, a.frame)
    im = rgb.reshape(H, W, 3)
    for spec in a.rects:
        box, _, name = spec.partition(":")
        x0, y0, x1, y1 = map(int, box.split(","))
        r = im[y0:y1, x0:x1].reshape(-1, 3)
        h, s, v = grade.rgb_to_hsv(r)
        m = s > 0.1
        hh = h[m] if m.any() else h
        # report hue around red without wrap-around (e.g. -10..20 instead of 350..20)
        hw = (hh + 30) % 360 - 30 if np.median(np.abs((hh + 180) % 360 - 180)) < 60 else hh
        print(f"{name or box:12s} hue p10/50/90 {np.percentile(hw, [10, 50, 90]).round(0)}  "
              f"sat {np.percentile(s, [10, 50, 90]).round(2)}  val {np.percentile(v, [10, 50, 90]).round(2)}  "
              f"colored {m.mean():.0%}")


def cmd_key(a):
    looks = grade.load_looks(a.looks)
    sel = looks[a.look]["selective"]
    tiles = []
    for fr in (a.frame or [0]):
        rgb, W, H = load(a.src, fr)
        if sel.get("masks"):
            masks = {p: media.mask_at(Path(p) if Path(p).is_absolute() else grade.BASE_DIR / p, fr, W, H)
                     for p in spatial.mask_paths(looks[a.look])}
            w, _ = spatial.mask_weight(rgb, W, H, sel, masks)
            print(f"frame {fr}: the masks keep {(w > 0.5).mean():.1%} of the frame")
        else:
            w, (h, s, v) = spatial.object_weight(rgb, W, H, sel)
            raw = spatial.key_weight(h, s, v, sel, H)
            m = ndimage.binary_closing(raw.reshape(H, W) > spatial.KEY_THRESHOLD, iterations=2)
            lab, n = ndimage.label(m)
            sizes = ndimage.sum(m, lab, range(1, n + 1)) if n else []
            print(f"frame {fr}: blobs (px, cx, cy) =",
                  [(int(sizes[i]),) + tuple(int(c) for c in ndimage.center_of_mass(m, lab, i + 1)[::-1])
                   for i in np.argsort(sizes)[::-1][:8]], f"(min_area={sel.get('min_area', 1500)})")
        # Gray base: on the source's own colors, red lips look kept even where the key drops them.
        gray = (rgb @ grade.LUMA).reshape(H, W, 1)
        vis = gray * 0.35 + w.reshape(H, W, 1) * np.array([1, 0.1, 0.1]) * 0.65
        tiles.append(np.asarray(Image.fromarray((np.clip(vis, 0, 1) * 255).astype(np.uint8)).resize((960, round(960 * H / W)))))
    Image.fromarray(np.concatenate(tiles, 0)).save(a.out, quality=90)
    print("wrote", a.out)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("grid"); g.add_argument("src"); g.add_argument("out")
    g.add_argument("--frame", type=int, default=0); g.add_argument("--step", type=int, default=100)
    s = sub.add_parser("sample"); s.add_argument("src"); s.add_argument("rects", nargs="+")
    s.add_argument("--frame", type=int, default=0)
    k = sub.add_parser("key"); k.add_argument("src"); k.add_argument("looks"); k.add_argument("look"); k.add_argument("out")
    k.add_argument("--frame", type=int, nargs="*", default=[0])
    for sp in (g, k):
        sp.add_argument("--force", action="store_true", help="overwrite an existing output image")
    a = ap.parse_args()
    if getattr(a, "out", None) and Path(a.out).exists() and not getattr(a, "force", False):
        ap.error(f"refusing to overwrite {a.out} (pass --force)")
    {"grid": cmd_grid, "sample": cmd_sample, "key": cmd_key}[a.cmd](a)


if __name__ == "__main__":
    main()
