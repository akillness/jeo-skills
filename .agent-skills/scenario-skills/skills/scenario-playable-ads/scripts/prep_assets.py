"""Crop, cut out, resize and compress a game's raw assets for the playable.

Usage: python3 prep_assets.py <project_dir>

Reads <project_dir>/assets/manifest.json and writes <project_dir>/assets/web/.
Paths in the manifest are relative to <project_dir>.

{
  "images": [
    {"name": "bg", "src": "assets/raw/plate.png", "size": [720, 1280], "format": "webp", "quality": 70},
    {"name": "hero1", "src": "assets/raw/sheet.png", "grid": [3, 2], "cell": 0,
     "alpha_floor": 90, "max": 220, "quality": 82},
    {"name": "icon1", "src": "intake/screenshot.png", "crop": [30, 160, 130, 248], "max": 128}
  ],
  "audio": [
    {"name": "shot", "src": "assets/raw/shot1.wav", "trim": true, "max_s": 0.4, "fade_s": 0.08, "bitrate": "48k"},
    {"name": "music", "src": "assets/raw/music.mp3", "bitrate": "48k"}
  ]
}

More keys:
  {"name": "hero", "src": "assets/raw/sheet.png", "blob": 0}   cut the Nth sprite of a sheet by connected
      alpha regions (sorted top-to-bottom by row, then left-to-right), so a sprite that crosses the
      "3x2 grid" is never clipped. Opaque white cell borders (a sheet that ignored "no grid lines") are
      cleared first. Run `python3 prep_assets.py <project> --blobs assets/raw/sheet.png`
      to print the regions and write a numbered preview next to the sheet.
  "key": true | "#0b5261", "key_tol": 40   flood-fill the background away from the image border (the
      color is read from the corners when true): logos on a plain background, opaque HUD crops.
  "mask": "ellipse" | "rrect:24"   alpha mask for round HUD icons and pills cropped from a screenshot.
  audio "boost_db": 10   makeup gain plus a -1 dBFS peak limiter (alimiter), for quiet payoff sounds.
      Plain gain_db clips peaky takes.
  "fonts": [{"name": "font", "src": "assets/raw/Font.ttf", "text": "ABC...", "wght": 700}]
      subset (and instance a variable font at wght) into assets/web/<name>.woff2.

Image keys: grid [cols, rows] + cell (row-major) cuts one cell of a sprite sheet; crop is a box
[x0, y0, x1, y1]; alpha_floor drops glow halos (alpha below it becomes 0, the rest is rescaled);
trim (default true for cut-outs) crops to the opaque bounds; max fits the longest side; size forces
an exact size (cover crop); format webp (default) or png; quality for webp; largest_blob (default
true for sheet cells) drops small islands, such as a neighbor's limb crossing into the cell.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

root = Path(sys.argv[1])


def clear_grid_lines(img):
    """Sheets sometimes come back with opaque white cell borders that join every cell into one region.
    Clear near-white pixels in rows/columns that are >= 95% opaque (a sprite never spans the sheet)."""
    px = np.array(img.convert("RGBA"))
    op = px[:, :, 3] > 200
    white = op & (px[:, :, :3].min(axis=2) > 215)
    rows = op.mean(axis=1) >= 0.95
    cols = op.mean(axis=0) >= 0.95
    kill = white & (rows[:, None] | cols[None, :])
    if kill.any():
        px[kill, 3] = 0
    return Image.fromarray(px), int(rows.sum()), int(cols.sum())


def blobs(img, min_frac=0.01):
    """Bounding boxes of the opaque islands of a sheet, big enough to be sprites, in reading order."""
    from scipy import ndimage
    img = clear_grid_lines(img)[0]
    a = np.array(img.convert("RGBA"))[:, :, 3] > 24
    # close small gaps (thin glows, antennae) so one sprite stays one region
    a = ndimage.binary_dilation(a, iterations=6)
    labels, n = ndimage.label(a)
    boxes = [b for b in ndimage.find_objects(labels)]
    big = [(b[0].start, b[1].start, b[0].stop, b[1].stop) for b in boxes
           if (b[0].stop - b[0].start) * (b[1].stop - b[1].start) >= min_frac * a.size]
    big.sort(key=lambda r: r[0])
    rows, cur = [], []
    for r in big:  # group into rows: a box starts a new row when it begins below the current row's middle
        if cur and r[0] > min(c[0] + (c[2] - c[0]) / 2 for c in cur):
            rows.append(cur); cur = []
        cur.append(r)
    if cur:
        rows.append(cur)
    out = []
    for row in rows:
        out += sorted(row, key=lambda r: r[1])
    return [(x0, y0, x1, y1) for y0, x0, y1, x1 in out]


if len(sys.argv) > 3 and sys.argv[2] == "--blobs":
    from PIL import ImageDraw
    sheet = Image.open(root / sys.argv[3])
    _, nr, nc = clear_grid_lines(sheet)
    if nr or nc:
        print(f"cleared opaque grid lines: {nr} rows, {nc} columns")
    prev = sheet.convert("RGBA").copy()
    d = ImageDraw.Draw(prev)
    for i, b in enumerate(blobs(sheet)):
        print(i, b)
        d.rectangle(b, outline=(255, 0, 255, 255), width=4)
        d.text((b[0] + 8, b[1] + 8), str(i), fill=(255, 0, 255, 255))
    path = (root / sys.argv[3]).with_name((root / sys.argv[3]).stem + "_blobs.png")
    prev.save(path)
    print("preview:", path)
    sys.exit(0)

man = json.loads((root / "assets" / "manifest.json").read_text())
out = root / "assets" / "web"
out.mkdir(parents=True, exist_ok=True)
total = 0


def cutout(img, spec):
    px = np.array(img.convert("RGBA")).astype(np.float32)
    floor = spec.get("alpha_floor")
    if floor:
        a = px[:, :, 3]
        px[:, :, 3] = np.clip((a - floor) / (255 - floor) * 255, 0, 255)
    if spec.get("largest_blob", True):
        # a sheet cell can catch a sliver of its neighbor: keep the biggest opaque island
        # plus islands of at least 5% of its size that do not touch the cell edge
        from scipy import ndimage
        labels, n = ndimage.label(px[:, :, 3] > 8)
        if n > 1:
            sizes = ndimage.sum(np.ones_like(labels), labels, range(1, n + 1))
            edge = set(np.unique(np.concatenate(
                [labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
            main = int(np.argmax(sizes)) + 1
            keep = [main] + [i + 1 for i, s in enumerate(sizes)
                             if i + 1 != main and s >= sizes.max() * 0.05 and i + 1 not in edge]
            px[~np.isin(labels, keep), 3] = 0
    # zero the color under fully transparent pixels so nothing bleeds when scaled
    px[px[:, :, 3] == 0, :3] = 0
    img = Image.fromarray(px.astype(np.uint8))
    if spec.get("trim", True):
        ys, xs = np.where(np.array(img)[:, :, 3] > 8)
        img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    return img


def key_out(img, spec):
    """Remove a plain background by flood fill from the border (keeps same-colored pixels inside)."""
    from scipy import ndimage
    px = np.array(img.convert("RGBA")).astype(np.int16)
    if spec["key"] is True:
        corners = np.array([px[0, 0, :3], px[0, -1, :3], px[-1, 0, :3], px[-1, -1, :3]])
        col = np.median(corners, axis=0)
    else:
        h = spec["key"].lstrip("#")
        col = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)])
    tol = spec.get("key_tol", 40)
    dist = np.sqrt(((px[:, :, :3] - col) ** 2).sum(axis=2))
    near = dist < tol
    labels, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    bg = np.isin(labels, list(edge))
    # soft edge: pixels just outside the fill fade with their color distance
    ring = ndimage.binary_dilation(bg, iterations=2) & ~bg
    a = px[:, :, 3].astype(np.float32)
    a[bg] = 0
    a[ring] *= np.clip((dist[ring] - tol) / tol, 0.25, 1)
    px[:, :, 3] = a.astype(np.int16)
    return Image.fromarray(px.astype(np.uint8))


def mask(img, kind):
    from PIL import ImageDraw
    img = img.convert("RGBA")
    m = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(m)
    if kind == "ellipse":
        d.ellipse((0, 0, img.width - 1, img.height - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=int(kind.split(":")[1]), fill=255)
    a = np.minimum(np.array(img)[:, :, 3], np.array(m))
    img.putalpha(Image.fromarray(a))
    return img


def cover(img, w, h):
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


for spec in man.get("images", []):
    img = Image.open(root / spec["src"])
    if "blob" in spec:
        img = clear_grid_lines(img)[0]
        b = blobs(img)[spec["blob"]]
        pad = 8
        img = img.crop((max(0, b[0] - pad), max(0, b[1] - pad), min(img.width, b[2] + pad), min(img.height, b[3] + pad)))
        img = cutout(img, {**spec, "largest_blob": spec.get("largest_blob", True)})
    elif "grid" in spec:
        cols, rows = spec["grid"]
        cw, ch = img.width // cols, img.height // rows
        r, c = divmod(spec["cell"], cols)
        img = cutout(img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)), spec)
    elif "crop" in spec:
        img = img.crop(tuple(spec["crop"]))
        if img.mode == "RGBA":
            img = cutout(img, {**spec, "trim": spec.get("trim", False)})
    elif img.mode == "RGBA" and spec.get("alpha_floor"):
        img = cutout(img, spec)
    if "key" in spec:
        img = key_out(img, spec)
        if spec.get("trim", True):
            img = cutout(img, {"largest_blob": False})
    if "mask" in spec:
        img = mask(img, spec["mask"])
    if "size" in spec:
        img = cover(img, *spec["size"])
    elif "max" in spec:
        img.thumbnail((spec["max"], spec["max"]), Image.LANCZOS)
    fmt = spec.get("format", "webp")
    path = out / f"{spec['name']}.{fmt}"
    if fmt == "webp":
        img.save(path, "WEBP", quality=spec.get("quality", 82), method=6)
    else:
        img.save(path, "PNG", optimize=True)
    total += path.stat().st_size
    print(f"{path.name:18s} {img.width}x{img.height}  {path.stat().st_size / 1024:6.1f} KB")

# trim leading/trailing silence on one-shots so they fire instantly
TRIM = ("silenceremove=start_periods=1:start_threshold=-45dB,"
        "areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse")

for spec in man.get("audio", []):
    filters = [TRIM] if spec.get("trim") else []
    if "max_s" in spec:
        fade = spec.get("fade_s", 0.05)
        filters.append(f"atrim=0:{spec['max_s']},afade=t=out:st={spec['max_s'] - fade}:d={fade}")
    if "gain_db" in spec:
        filters.append(f"volume={spec['gain_db']}dB")
    if "boost_db" in spec:
        # makeup gain into a look-ahead limiter at -1 dBFS: louder without clipping the peaks
        filters.append(f"volume={spec['boost_db']}dB,alimiter=limit=0.89:attack=5:release=50:level=0:latency=1")
    path = out / f"{spec['name']}.mp3"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(root / spec["src"])]
    if filters:
        cmd += ["-af", ",".join(filters)]
    cmd += ["-ac", "1", "-ar", "44100", "-b:a", spec.get("bitrate", "64k"), str(path)]
    subprocess.run(cmd, check=True)
    total += path.stat().st_size
    print(f"{path.name:18s} {path.stat().st_size / 1024:6.1f} KB")

for spec in man.get("fonts", []):
    from fontTools import subset
    from fontTools.ttLib import TTFont
    font = TTFont(root / spec["src"])
    if "fvar" in font and spec.get("wght"):
        from fontTools.varLib import instancer
        font = instancer.instantiateVariableFont(font, {"wght": spec["wght"]})
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga"]
    sub = subset.Subsetter(opts)
    sub.populate(text=spec.get("text") or "".join(chr(c) for c in range(32, 127)))
    sub.subset(font)
    path = out / f"{spec['name']}.woff2"
    font.flavor = "woff2"
    font.save(path)
    total += path.stat().st_size
    print(f"{path.name:18s} {path.stat().st_size / 1024:6.1f} KB")

print(f"total {total / 1024:.0f} KB raw, ~{total * 4 / 3 / 1024:.0f} KB as base64")
