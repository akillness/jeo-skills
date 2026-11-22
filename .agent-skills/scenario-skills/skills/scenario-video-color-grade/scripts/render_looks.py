#!/usr/bin/env python3
"""Apply looks to a video (or a still) and render one output per look.

  python3 render_looks.py <input> --looks looks.json --out DIR [--only k1,k2] [--frame N] [--crf 16]

input = video  -> DIR/<key>.mp4 for every look (audio copied), plus DIR/luts/<key>.cube
input = image  -> DIR/<key>.png for every look + DIR/grid.jpg (labeled contact sheet)
--frame N      -> grade only frame N of the video, as a still test (png + grid)

Pure color looks run through ffmpeg (lut3d + finishing). Looks with "relight" or "selective"
are processed per frame in numpy first (one decode pass shared by all of them), then the
same LUT + finishing is applied by the encoder.
"""
import argparse
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import grade
import media
import spatial


def font(size, bold=False):
    for path, idx in [("/System/Library/Fonts/HelveticaNeue.ttc", 1 if bold else 0),
                      ("/System/Library/Fonts/Helvetica.ttc", 1 if bold else 0),
                      ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
                       else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 0)]:
        try:
            return ImageFont.truetype(path, size, index=idx)
        except OSError:
            continue
    return ImageFont.load_default()


def grid(images, labels, dest, cols=4, cell_w=480):
    """Labeled contact sheet of graded stills."""
    tiles = []
    f = font(17, bold=True)
    for img, name in zip(images, labels):
        t = Image.open(img).convert("RGB")
        t = t.resize((cell_w, round(t.height * cell_w / t.width)), Image.LANCZOS)
        d = ImageDraw.Draw(t, "RGBA")
        box = d.textbbox((0, 0), name, font=f)
        d.rounded_rectangle((8, t.height - 34, 8 + box[2] - box[0] + 18, t.height - 8), radius=6, fill=(0, 0, 0, 150))
        d.text((17, t.height - 30), name, font=f, fill=(255, 255, 255, 235))
        tiles.append(np.asarray(t))
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.concatenate(tiles[i:i + cols], 1) for i in range(0, len(tiles), cols)]
    Image.fromarray(np.concatenate(rows, 0)).save(dest, quality=92)


def lut_vf(lut, look):
    return ",".join([f"lut3d={lut}:interp=tetrahedral"] + grade.finish_filter(look))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--looks", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--frame", type=int, default=None)
    ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--force", action="store_true", help="overwrite existing outputs in --out")
    a = ap.parse_args()

    src = Path(a.input).resolve()
    out = Path(a.out).resolve()
    if out.exists() and any(out.iterdir()) and not a.force:
        ap.error(f"refusing to overwrite {out} (pass --force)")
    out.mkdir(parents=True, exist_ok=True)
    looks = grade.load_looks(a.looks)
    if a.only:
        keep = a.only.split(",")
        looks = {k: v for k, v in looks.items() if k in keep}
    lut_dir = out / "luts"
    lut_dir.mkdir(exist_ok=True)
    for k, look in list(looks.items()):
        try:
            grade.write_cube(lut_dir / f"{k}.cube", look)
        except FileNotFoundError as e:  # a "match" look whose stats were not measured yet
            print(f"skipping {k}: {e.filename} not found (run match.py first)")
            looks.pop(k)

    info = media.probe(src)
    W, H = info["w"], info["h"]
    # mask videos used by selective looks (paths relative to the looks file)
    resolve = lambda p: Path(p) if Path(p).is_absolute() else grade.BASE_DIR / p
    for k, look in list(looks.items()):
        for p in spatial.mask_paths(look):
            if not resolve(p).exists():
                print(f"skipping {k}: mask {p} not found (segment the object first)")
            elif (n := media.probe(resolve(p))["frames"]) != info["frames"]:
                print(f"skipping {k}: mask {p} has {n} frames, the source {info['frames']} (segment this exact clip)")
            else:
                continue
            looks.pop(k)
            break
    mpaths = sorted({p for look in looks.values() for p in spatial.mask_paths(look)})

    # ---- stills: an image, or one frame of a video ----
    if media.is_image(src) or a.frame is not None:
        rgb = (next(media.frames(src, W, H)) if media.is_image(src) else media.frame_at(src, a.frame, W, H))
        t = 0.0 if a.frame is None else a.frame / info["fps"]
        media.save_image(rgb, W, H, out / "00_source.png")
        paths, names = [], []
        masks = {p: media.mask_at(resolve(p), a.frame or 0, W, H) for p in mpaths}
        for k, look in looks.items():
            x = spatial.process(rgb, W, H, t, look, masks) if spatial.needs_frames(look) else rgb
            media.save_image(x, W, H, out / f"{k}.png", lut_vf(lut_dir / f"{k}.cube", look))
            paths.append(out / f"{k}.png")
            names.append(look.get("name", k))
        grid(paths, names, out / "grid.jpg")
        print(f"stills + grid in {out}")
        return

    # ---- video ----
    audio = src if info["audio"] else None
    lut_only = {k: v for k, v in looks.items() if not spatial.needs_frames(v)}
    framewise = {k: v for k, v in looks.items() if spatial.needs_frames(v)}

    for k, look in lut_only.items():
        cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-vf", lut_vf(lut_dir / f"{k}.cube", look) +
               ",format=yuv420p", "-c:v", "libx264", "-crf", str(a.crf), "-preset", "slow"]
        cmd += ["-c:a", "aac", "-b:a", "192k"] if audio else ["-an"]
        subprocess.run(cmd + ["-movflags", "+faststart", str(out / f"{k}.mp4")], check=True)
        print("rendered", k, flush=True)

    if framewise:
        encs = {k: media.encoder(out / f"{k}.mp4", W, H, info["fps_str"], lut_vf(lut_dir / f"{k}.cube", look),
                                 audio, a.crf) for k, look in framewise.items()}
        readers = {p: media.mask_frames(resolve(p), W, H) for p in mpaths}
        for i, rgb in enumerate(media.frames(src, W, H)):
            t = i / info["fps"]
            masks = {p: next(r) for p, r in readers.items()}
            for k, look in framewise.items():
                media.write(encs[k], spatial.process(rgb, W, H, t, look, masks))
            if i % 24 == 0:
                print(f"  frame {i}/{info['frames']}", flush=True)
        for k, e in encs.items():
            e.stdin.close()
            e.wait()
            print("rendered", k, flush=True)
    print("done", out)


if __name__ == "__main__":
    main()
