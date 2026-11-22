#!/usr/bin/env python3
"""Check one generated take before assembly: three looks, then one motion check that needs no eyes.

Usage:
  python3 check_take.py sheet take.mp4 sheet.jpg [--fps 2] [--width 216] [--cols 10]
  python3 check_take.py action take.mp4 crops.jpg --at T --box X Y W H [--span 1.0] [--tiles 8] [--cols 4]
  python3 check_take.py ends take.mp4 OUTDIR
  python3 check_take.py motion take.mp4 [--allow X Y W H]... [--allow-at T0 T1 X Y W H]...
      [--threshold 12] [--min-area 0.001] [--scale 270] [-o report.json] [--sheet flagged.jpg]

Boxes are X Y W H in source pixels; times are in seconds.

- sheet: the whole take as one contact sheet, scaled tiles left to right then top to bottom, tile k
  being the frame nearest k / --fps seconds. Prints the tile spacing and the time of each row's
  first tile. For timing and end-of-take drift only.
- action: crops of the box at native resolution, evenly spaced over --span seconds centered on --at
  (the contact moment), tiled into one image. Prints the time and frame of each tile.
- ends: OUTDIR/first.png and OUTDIR/last.png at native resolution. The last is the last frame that
  decodes, not a seek past the end. Count pieces on these two.
- motion: finds motion outside the regions meant to move, such as every piece in a grid
  celebrating, a second target appearing, or a car moving elsewhere.
  - Frames decode in grayscale at --scale pixels wide (never upscaled), area-averaged, and each is
    diffed with the one before.
  - A pixel changes when its level moves by more than --threshold (0 to 255). Pixels inside an
    --allow box, or inside an --allow-at box from T0 to T1, are ignored. Draw boxes a little wider
    than the motion they allow.
  - A frame is flagged when changed pixels cover more than --min-area of the whole frame. Flagged
    frames under 0.1 s apart join one span. A flat-colored object changes only at its edges, so a
    small one moving slowly can stay under it.
  - A change slower than --threshold levels a frame, such as a slow fade-in, passes: compare the
    counts on first.png and last.png from ends.
  - Prints each span's start and end, its peak share, and the box around every pixel it changed,
    in source pixels. -o writes the same as JSON. --sheet tiles the peak frame of each span with
    that box outlined.
  - Locked camera only: a pan, zoom, or shake changes every pixel, so skip the check on such takes.
  - The defaults stay silent on H.264 compression flicker over a static frame. A lower --threshold
    catches fainter changes, and starts to flag that flicker.
  - Exit status 1 when any span is flagged.
"""

import argparse
import json
import math
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

GAP = 0.1
FLAG_W = 540


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,avg_frame_rate,r_frame_rate,nb_read_packets", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True)
    s = json.loads(out.stdout)["streams"][0]
    rate = s["avg_frame_rate"] if s.get("avg_frame_rate", "0/0") != "0/0" else s["r_frame_rate"]
    return s["width"], s["height"], float(Fraction(rate)), int(s["nb_read_packets"])


def frames(path, vf, size, pix_fmt="rgb24"):
    """Yield the frames the filter chain vf outputs, each size (w, h), through a rawvideo pipe."""
    w, h = size
    shape = (h, w) if pix_fmt == "gray" else (h, w, 3)
    n = math.prod(shape)
    # rawvideo defaults to a constant frame rate, which repeats frames to fill what select drops.
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-vf", vf, "-fps_mode", "passthrough",
           "-f", "rawvideo", "-pix_fmt", pix_fmt, "-"]
    with subprocess.Popen(cmd, stdout=subprocess.PIPE) as p:
        while len(buf := p.stdout.read(n)) == n:
            yield np.frombuffer(buf, np.uint8).reshape(shape)
    if p.returncode:
        raise subprocess.CalledProcessError(p.returncode, cmd)


def select(indices):
    return "select='" + "+".join(f"eq(n,{i})" for i in indices) + "'"


def grid(tiles, cols):
    th, tw = tiles[0].shape[:2]
    out = np.zeros((math.ceil(len(tiles) / cols) * th, cols * tw, 3), np.uint8)
    for k, t in enumerate(tiles):
        r, c = divmod(k, cols)
        out[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = t
    return out


def cmd_sheet(a):
    W, H, fps, count = probe(a.take)
    size = (a.width, max(1, round(a.width * H / W)))
    # The fps filter picks frames up to half a tile late; selecting by index keeps tiles and labels on the same frames.
    idx = sorted({round(k * fps / a.fps) for k in range(math.ceil(count * a.fps / fps) + 1)} & set(range(count)))
    tiles = list(frames(a.take, f"{select(idx)},scale={size[0]}:{size[1]}", size))
    cols = min(a.cols, len(tiles))
    Image.fromarray(grid(tiles, cols)).save(a.out, quality=90)
    starts = ", ".join(f"{idx[r * cols] / fps:.3g}" for r in range(math.ceil(len(tiles) / cols)))
    print(f"wrote {a.out}: {len(tiles)} tiles of {size[0]}x{size[1]}, {1 / a.fps:g} s apart, {cols} per row")
    print(f"rows start at {starts} s")


def cmd_action(a):
    W, H, fps, count = probe(a.take)
    x, y = min(max(a.box[0], 0), W - 1), min(max(a.box[1], 0), H - 1)
    w, h = min(a.box[2], W - x), min(a.box[3], H - y)
    step = a.span / (a.tiles - 1) if a.tiles > 1 else 0
    # Near the ends, or with a span shorter than the tiles need, times share a frame: tiles drop.
    idx = sorted({min(max(round((a.at - a.span / 2 + k * step) * fps), 0), count - 1) for k in range(a.tiles)})
    cols = min(a.cols, len(idx))
    rows = math.ceil(len(idx) / cols)
    # rgb24 before crop: crop on yuv420p rounds an odd x or y down to the chroma grid.
    vf = f"{select(idx)},format=rgb24,crop={w}:{h}:{x}:{y},tile={cols}x{rows}"
    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(a.take), "-vf", vf, "-frames:v", "1",
                    "-q:v", "2", str(a.out)], check=True)
    for k, i in enumerate(idx):
        print(f"tile {k + 1}: {i / fps:.3f} s (frame {i})")
    print(f"wrote {a.out}: {len(idx)} crops of {w}x{h} at {x},{y}, {cols} per row, {rows} rows")


def cmd_ends(a):
    W, H, fps, _ = probe(a.take)
    first = None
    for n, last in enumerate(frames(a.take, "null", (W, H))):
        if first is None:
            first = last
    a.outdir.mkdir(parents=True, exist_ok=True)
    Image.fromarray(first).save(a.outdir / "first.png")
    Image.fromarray(last).save(a.outdir / "last.png")
    print(f"wrote {a.outdir / 'first.png'}: frame 0, {W}x{H}")
    print(f"wrote {a.outdir / 'last.png'}: frame {n} at {n / fps:.3f} s, the last that decodes")


def box_mask(box, W, H, sw, sh):
    x, y, w, h = box
    m = np.zeros((sh, sw), bool)
    m[max(0, math.floor(y * sh / H)):max(0, math.ceil((y + h) * sh / H)),
      max(0, math.floor(x * sw / W)):max(0, math.ceil((x + w) * sw / W))] = True
    return m


def spans_of(flagged, fps, W, H, sw, sh):
    groups = []
    for item in flagged:
        if groups and item[0] - groups[-1][-1][0] <= round(GAP * fps):
            groups[-1].append(item)
        else:
            groups.append([item])
    spans = []
    for g in groups:
        peak = max(g, key=lambda it: it[1])
        x0, y0 = math.floor(min(b[0] for *_, b in g) * W / sw), math.floor(min(b[1] for *_, b in g) * H / sh)
        x1, y1 = min(W, math.ceil(max(b[2] for *_, b in g) * W / sw)), min(H, math.ceil(max(b[3] for *_, b in g) * H / sh))
        spans.append({"start": round(g[0][0] / fps, 3), "end": round(g[-1][0] / fps, 3), "peak": round(peak[0] / fps, 3),
                      "peak_frame": peak[0], "peak_share": round(peak[1], 5), "box": [x0, y0, x1 - x0, y1 - y0]})
    return spans


def flagged_sheet(take, spans, W, H, out):
    tw = min(FLAG_W, W)
    th = max(1, round(tw * H / W))
    k = tw / W
    font = ImageFont.load_default(18)
    peaks = list(frames(take, f"{select([s['peak_frame'] for s in spans])},scale={tw}:{th}", (tw, th)))
    tiles = []
    for s, f in zip(spans, peaks):
        im = Image.fromarray(f)
        d = ImageDraw.Draw(im)
        x, y, w, h = s["box"]
        d.rectangle([x * k, y * k, (x + w) * k - 1, (y + h) * k - 1], outline=(255, 0, 0), width=3)
        d.text((6, 6), f"{s['start']:.2f}-{s['end']:.2f} s", fill=(255, 255, 0), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
        tiles.append(np.asarray(im))
    Image.fromarray(grid(tiles, min(4, len(tiles)))).save(out, quality=90)


def cmd_motion(a):
    W, H, fps, _ = probe(a.take)
    sw = min(a.scale, W)
    sh = max(1, round(sw * H / W))
    fixed = np.zeros((sh, sw), bool)
    for b in a.allow:
        fixed |= box_mask(b, W, H, sw, sh)
    timed = [(t0, t1, box_mask(b, W, H, sw, sh)) for t0, t1, *b in a.allow_at]
    shares, flagged, prev = [], [], None
    for i, f in enumerate(frames(a.take, f"scale={sw}:{sh}:flags=area", (sw, sh), "gray")):
        f = f.astype(np.int16)
        if prev is not None:
            allowed = fixed.copy()
            for t0, t1, m in timed:
                if t0 <= i / fps <= t1:
                    allowed |= m
            changed = (np.abs(f - prev) > a.threshold) & ~allowed
            share = float(changed.mean())
            shares.append((share, i))
            if share > a.min_area:
                ys, xs = np.nonzero(changed)
                flagged.append((i, share, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
        prev = f
    spans = spans_of(flagged, fps, W, H, sw, sh)

    print(f"motion: {len(shares) + 1} frames at {fps:g} fps, diffed at {sw}x{sh}, threshold {a.threshold:g}, "
          f"min area {a.min_area:.2%}")
    for s in spans:
        print(f"FLAG {s['start']:.3f}-{s['end']:.3f} s  peak {s['peak_share']:.2%} at {s['peak']:.3f} s  "
              f"box {' '.join(map(str, s['box']))}")
    top, at = max(shares, key=lambda s: s[0], default=(0.0, 0))
    print(f"largest share changed outside the allowed boxes: {top:.3%} at {at / fps:.3f} s")
    if a.out:
        a.out.write_text(json.dumps({"take": str(a.take), "size": [W, H], "fps": fps, "frames": len(shares) + 1,
                                     "threshold": a.threshold, "min_area": a.min_area, "max_share": round(top, 5),
                                     "spans": spans}, indent=1) + "\n")
        print(f"wrote {a.out}")
    if a.sheet and spans:
        flagged_sheet(a.take, spans, W, H, a.sheet)
        print(f"wrote {a.sheet}")
    if spans:
        print(f"FAIL {len(spans)} span(s) of motion outside the allowed boxes", file=sys.stderr)
    return 1 if spans else 0



def same_file(a, b):
    """True when two paths name one file, so an output would overwrite an input."""
    return a is not None and b is not None and Path(a).resolve() == Path(b).resolve()

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)

    p = sub.add_parser("sheet", help="the whole take as one contact sheet, for timing")
    p.add_argument("take", type=Path)
    p.add_argument("out", type=Path)
    p.add_argument("--fps", type=float, default=2.0)
    p.add_argument("--width", type=int, default=216, help="tile width in pixels")
    p.add_argument("--cols", type=int, default=10)
    p.set_defaults(run=cmd_sheet)

    p = sub.add_parser("action", help="native-resolution crops of one action, tiled")
    p.add_argument("take", type=Path)
    p.add_argument("out", type=Path)
    p.add_argument("--at", type=float, required=True, help="the contact moment, in seconds")
    p.add_argument("--box", type=int, nargs=4, required=True, metavar=("X", "Y", "W", "H"))
    p.add_argument("--span", type=float, default=1.0, help="seconds covered, centered on --at")
    p.add_argument("--tiles", type=int, default=8)
    p.add_argument("--cols", type=int, default=4)
    p.set_defaults(run=cmd_action)

    p = sub.add_parser("ends", help="first.png and last.png at native resolution")
    p.add_argument("take", type=Path)
    p.add_argument("outdir", type=Path)
    p.set_defaults(run=cmd_ends)

    p = sub.add_parser("motion", help="flag motion outside the allowed boxes; locked camera only")
    p.add_argument("take", type=Path)
    p.add_argument("--allow", type=float, nargs=4, action="append", default=[], metavar=("X", "Y", "W", "H"))
    p.add_argument("--allow-at", type=float, nargs=6, action="append", default=[],
                   metavar=("T0", "T1", "X", "Y", "W", "H"))
    p.add_argument("--threshold", type=float, default=12)
    p.add_argument("--min-area", type=float, default=0.001, help="share of the frame, 0.001 = 0.1%%")
    p.add_argument("--scale", type=int, default=270, help="diff width in pixels")
    p.add_argument("-o", "--out", type=Path, help="JSON report")
    p.add_argument("--sheet", type=Path, help="peak frame of each flagged span, its box outlined")
    p.set_defaults(run=cmd_motion)

    args = ap.parse_args(argv)
    for name in ("out", "outdir", "sheet"):
        if same_file(getattr(args, name, None), args.take):
            print(f"error: {getattr(args, name)} is the take itself; write the {name} elsewhere", file=sys.stderr)
            return 2
    return args.run(args) or 0


if __name__ == "__main__":
    sys.exit(main())
