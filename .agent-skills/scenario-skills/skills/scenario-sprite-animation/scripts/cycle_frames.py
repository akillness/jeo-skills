"""Make square first frames for image-to-video from character art.

The figure is scaled to --fig of the frame height with its feet on --base,
centered on a flat key-color field. The headroom keeps a raised weapon inside
the clip. Input is either a generated pose sheet (split at the empty columns
between figures, one per facing) or the user's own art: one figure on a transparent or flat backdrop.
Small pixel art is scaled by a whole number with nearest-neighbor so its pixels
stay crisp. Prints a key check: how much of the figure each key color would
erase when the clips are keyed.

Usage:
  python3 cycle_frames.py <hero> <image> [--facings se,ne]      # split a pose sheet
  python3 cycle_frames.py <hero> <image> --facing se [--flip]    # one figure
  options: --out frames --canvas 960 --fig 0.58 --base 0.82 --key magenta|green|blue --nearest|--smooth
Writes <out>/<hero>_<facing>_first.png
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

KEY_RGB = {"magenta": (255, 0, 255), "green": (0, 255, 0), "blue": (0, 0, 255)}


def keyed(rgb):
    """Per key color, the pixels cycle_sheets.py would erase (same thresholds)."""
    f = rgb.astype(np.float32) / 255
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    sat = (f.max(-1) - f.min(-1)) / (f.max(-1) + 1e-6)
    return {"magenta": ((np.minimum(r, b) - g) > 0.18) & (sat > 0.28) & (np.abs(r - b) < 0.45),
            "green": ((g - np.maximum(r, b)) > 0.18) & (sat > 0.28),
            "blue": ((b - np.maximum(r, g)) > 0.18) & (sat > 0.28)}


def components(mask):
    """4-connected components of a boolean mask, as (ys, xs) index arrays. Pure Python on
    the masked pixels only, so there is no optional dependency to fall back from."""
    seen = np.zeros_like(mask)
    h, w = mask.shape
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        stack, ys, xs = [(y0, x0)], [], []
        while stack:
            y, x = stack.pop()
            ys.append(y)
            xs.append(x)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        yield np.array(ys), np.array(xs)


def foreground(im):
    """(figure mask, backdrop-colored mask or None). Alpha when the art is a cut-out;
    otherwise everything that differs from the flat color around the border."""
    rgba = np.array(im.convert("RGBA")).astype(int)
    if (rgba[..., 3] < 128).mean() > 0.02:
        return rgba[..., 3] >= 128, None
    rgb = rgba[..., :3]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, 0)
    spread = np.abs(border - bg).max(1)
    tol = max(40, int(np.percentile(spread, 90)) + 25)   # gradients and JPEG noise in the backdrop
    diff = np.abs(rgb - bg).max(-1)
    near = diff <= tol
    # only backdrop color connected to the border is background, so white armor on white survives
    region = np.zeros_like(near)
    region[[0, -1], :] = near[[0, -1], :]
    region[:, [0, -1]] |= near[:, [0, -1]]
    while True:
        grown = region.copy()
        grown[1:] |= region[:-1]
        grown[:-1] |= region[1:]
        grown[:, 1:] |= region[:, :-1]
        grown[:, :-1] |= region[:, 1:]
        grown &= near
        if (grown == region).all():
            break
        region = grown
    fg = ~region
    # backdrop trapped inside the silhouette (bow and string, arm and body): flat patches of
    # the backdrop color are background too. A neutral backdrop (white, gray) gets a tight
    # tolerance so off-white clothing survives; a saturated generated field gets a looser one
    saturated = (bg.max() - bg.min()) > 128
    trapped = fg & (diff <= (12 if saturated else 4))
    min_size = 0.002 * fg.sum()
    for comp in components(trapped):
        if len(comp[0]) > min_size:
            fg[comp] = False
    return fg, near


def key_check(im, fg, near):
    """Share of the figure's own colors each key color would erase."""
    core = fg.copy()
    cut_out = near is None
    # art cut from a flat backdrop has a rim of backdrop-tinted pixels that keys out anyway
    for _ in range(0 if cut_out else max(2, im.height // 200)):
        core[1:-1, 1:-1] &= core[:-2, 1:-1] & core[2:, 1:-1] & core[1:-1, :-2] & core[1:-1, 2:]
    if near is not None:
        core &= ~near
    if not core.any():
        return {k: 0.0 for k in KEY_RGB}
    return {k: float(v[core].mean()) for k, v in keyed(np.array(im.convert("RGB"))).items()}


def place(fig, mask, canvas, fig_frac, base_frac, key, nearest):
    """Scale one figure onto a square key-color canvas. Returns (image, scale note)."""
    fh, base = int(canvas * fig_frac), int(canvas * base_frac)
    if nearest:
        # whole-number scale keeps every source pixel a crisp block; the figure then lands near,
        # not on, fig_frac, so cycle_sheets.py should measure it ("fig_frac": "auto")
        k = max(1, round(fh / fig.height))
        while k > 1 and (fig.height * k > base or fig.width * k > canvas):
            k -= 1
        fig, mask = (x.resize((fig.width * k, fig.height * k), Image.NEAREST) for x in (fig, mask))
        note = f"x{k} nearest"
    else:
        size = (round(fig.width * fh / fig.height), fh)
        fig, mask = fig.resize(size, Image.LANCZOS), mask.resize(size, Image.LANCZOS)
        note = "smooth"
    if fig.width > canvas:
        raise ValueError(f"figure is wider than the canvas at fig {fig_frac}; lower --fig, and use the same "
                         "value for every facing so the rows keep one scale")
    out = Image.new("RGB", (canvas, canvas), KEY_RGB[key])
    out.paste(fig.convert("RGB"), ((canvas - fig.width) // 2, base - fig.height), mask)
    return out, note


def figure_spans(fg, n):
    """Column spans of the n figures on a pose sheet, split at the empty columns between them.
    Equal columns cut a long side view or a wide front view in two. Specks (a spark, a loose
    flame) join their nearest figure; if the figures touch, equal columns are the fallback."""
    w = fg.shape[1]
    mass = fg.sum(0)
    occupied = mass >= max(3, 0.002 * fg.shape[0])
    runs, x = [], 0
    while x < w:
        if occupied[x]:
            x0 = x
            while x < w and occupied[x]:
                x += 1
            runs.append([x0, x, int(mass[x0:x].sum())])
        x += 1
    total = sum(r[2] for r in runs) or 1

    def merge(i):                      # merge run i into its nearer neighbor
        left = runs[i][0] - runs[i - 1][1] if i > 0 else None
        right = runs[i + 1][0] - runs[i][1] if i + 1 < len(runs) else None
        j = i - 1 if right is None or (left is not None and left <= right) else i + 1
        a, b = sorted((i, j))
        runs[a:b + 1] = [[runs[a][0], runs[b][1], runs[a][2] + runs[b][2]]]

    while len(runs) > 1 and min(r[2] for r in runs) < 0.02 * total:
        merge(min(range(len(runs)), key=lambda i: runs[i][2]))
    while len(runs) > n:
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        merge(gaps.index(min(gaps)))
    if len(runs) < n:
        print(f"WARNING: found {len(runs)} separate figures for {n} facings; splitting into equal columns, "
              "check every first frame (or regenerate the sheet with more space between poses)")
        return [(w * i // n, w * (i + 1) // n) for i in range(n)]
    return [(r[0], r[1]) for r in runs]


def first_frames(im, facings, canvas=960, fig_frac=0.58, base_frac=0.82, key="magenta",
                 nearest=None, flip=False):
    """{facing: first-frame image} plus the key check, from one pose sheet or one figure."""
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    rgba = im.convert("RGBA")
    fg, near = foreground(im)
    hits = key_check(rgba, fg, near)
    w = im.width
    out, notes = {}, {}
    spans = figure_spans(fg, len(facings)) if len(facings) > 1 else [(0, w)]
    for f, (x0, x1) in zip(facings, spans):
        ys, xs = np.where(fg[:, x0:x1])
        if not len(ys):
            raise ValueError(f"{f}: no figure found in columns {x0}-{x1}")
        box = (xs.min() + x0, ys.min(), xs.max() + x0 + 1, ys.max() + 1)
        fig = rgba.crop(box)
        mask = Image.fromarray((fg[box[1]:box[3], box[0]:box[2]] * 255).astype("uint8"))
        use_nearest = nearest if nearest is not None else fig.height < 256
        out[f], notes[f] = place(fig, mask, canvas, fig_frac, base_frac, key, use_nearest)
        if use_nearest:
            colors = len(np.unique(np.array(fig.convert("RGB"))[np.array(mask) > 127], axis=0))
            placed = np.where((np.array(out[f]) != KEY_RGB[key]).any(-1).any(1))[0]
            notes[f] += (f", native height {fig.height} px, {colors} colors; place generated facings with "
                         f"--fig {(placed.max() - placed.min() + 1) / canvas:.4f} so every row matches")
    return out, notes, hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("hero")
    ap.add_argument("src")
    ap.add_argument("--facings", default="se,ne", help="pose order, left to right, when splitting a sheet")
    ap.add_argument("--facing", help="the image holds one figure with this facing")
    ap.add_argument("--flip", action="store_true", help="mirror first; symmetric characters only")
    ap.add_argument("--out", default="frames")
    ap.add_argument("--canvas", type=int, default=960)
    ap.add_argument("--fig", type=float, default=0.58)
    ap.add_argument("--base", type=float, default=0.82)
    ap.add_argument("--key", default="magenta", choices=list(KEY_RGB))
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--nearest", action="store_true")
    g.add_argument("--smooth", action="store_true")
    a = ap.parse_args()
    facings = [a.facing] if a.facing else a.facings.split(",")
    nearest = True if a.nearest else False if a.smooth else None
    frames, notes, hits = first_frames(Image.open(a.src), facings, a.canvas, a.fig, a.base, a.key, nearest, a.flip)
    print("key check, share of the figure each key would erase:",
          ", ".join(f"{k} {v:.1%}" for k, v in hits.items()))
    if hits[a.key] > 0.01:
        best = min(hits, key=hits.get)
        print(f"WARNING: --key {a.key} would erase {hits[a.key]:.1%} of the character; "
              f"re-run with --key {best} and set \"key\": \"{best}\" in the cast file")
    Path(a.out).mkdir(parents=True, exist_ok=True)
    for f, im in frames.items():
        p = Path(a.out) / f"{a.hero}_{f}_first.png"
        im.save(p)
        print(p, notes[f])


if __name__ == "__main__":
    main()
