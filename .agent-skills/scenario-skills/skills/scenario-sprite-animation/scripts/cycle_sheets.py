"""Turn image-to-video clips into looping sprite sheets, one character at a time.

For every clip: key the flat field (magenta, green or blue) to alpha, find the
tightest closing loop window (walk, run, idle) or the active strike window
(attack), sample N frames, crop all of a character's cycles to one shared
canvas so they register, and downscale to the target height. Pixel-art heroes
get one palette across every cycle and a redrawn 1 px outline; heroes with
"pixel": false keep a clean downscale. Mirrored facings (SW, NW, W) are flips.

Usage: python3 cycle_sheets.py cast.json [hero ...] [--clips clips] [--out sheets] [--frames-dir DIR] [--gif]

Clips are named <hero>_<facing>_<cycle>.mp4. Writes <out>/<hero>_<cycle>.png
(one row per facing and mirror, N columns) and merges per-hero data (cell,
pivot, rows, fps per row, loop window and seam score per clip) into <out>/meta.json.
A hero with "attack_body_only": true keeps only the largest blob in its attack
frames, so a thrown projectile does not widen the shared canvas.
"fig_frac": "auto" in the cast measures the figure height from the clips.
"""
import argparse, json, subprocess
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

CANVAS = 960
FRAMES = 8
RANGES = {"walk": (12, 34), "run": (8, 24), "idle": (24, 66)}   # loop period search, in 24 fps frames
RANGES_BY_HERO = {}               # heavy heroes stride slower: a longer cycle needs a longer window
KEY = "magenta"
MIRROR = {"se": "sw", "ne": "nw", "e": "w"}


def read_frames(path):
    """Frames as a square CANVAS stack (non-square clips are padded with the key color, not stretched) and the clip fps."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=width,height,r_frame_rate", "-of", "csv=p=0", str(path)],
                           capture_output=True, text=True, check=True).stdout.strip().split(",")
    w, h = int(probe[0]), int(probe[1])
    num, _, den = probe[2].partition("/")
    fps = float(num) / float(den or 1)
    arr = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
    if w != h:
        n = max(w, h)
        sq = np.empty((len(arr), n, n, 3), np.uint8)
        sq[:] = {"magenta": (255, 0, 255), "green": (0, 255, 0), "blue": (0, 0, 255)}[KEY]
        y0, x0 = n - h if h < n else 0, (n - w) // 2      # keep the feet on the bottom edge
        sq[:, y0:y0 + h, x0:x0 + w] = arr
        arr, w, h = sq, n, n
    if (w, h) != (CANVAS, CANVAS):
        arr = np.stack([np.array(Image.fromarray(f).resize((CANVAS, CANVAS), Image.LANCZOS)) for f in arr])
    return arr, fps


def key(rgb):
    """Alpha from the key-color field, including the ground shadow video models add
    (purple on magenta) and the haze around the figure, then despill."""
    f = rgb.astype(np.float32) / 255
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx, mn = f.max(-1), f.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    out = rgb.astype(np.float32)
    if KEY in ("green", "blue"):
        i = 1 if KEY == "green" else 2                               # the key channel beats both others
        others = np.maximum(*[f[..., j] for j in range(3) if j != i])
        bg = ((f[..., i] - others) > 0.18) & (sat > 0.28)
        spill = np.clip(out[..., i] - np.maximum(*[out[..., j] for j in range(3) if j != i]), 0, None) * 0.6
        out[..., i] -= spill
    else:
        magenta = (np.minimum(r, b) - g)          # >0 when R and B both beat G
        bg = (magenta > 0.18) & (sat > 0.28) & (np.abs(r - b) < 0.45)
        # despill: pull residual magenta tint out of kept pixels
        spill = np.clip(np.minimum(out[..., 0], out[..., 2]) - out[..., 1], 0, None) * 0.6
        out[..., 0] -= spill
        out[..., 2] -= spill
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    return np.dstack([np.clip(out, 0, 255).astype(np.uint8), alpha])


def small(rgba, s=120):
    im = Image.fromarray(rgba).resize((s, s), Image.BOX)
    a = np.array(im).astype(np.float32)
    return a[..., :3] * (a[..., 3:] / 255), a[..., 3] / 255


def dist(a, b):
    return float(np.abs(a[0] - b[0]).mean() + 80 * np.abs(a[1] - b[1]).mean())


def loop_window(sm, pmin, pmax, first=3, min_base=0.35):
    """Tightest closing window [s, s+P): seam delta vs the window's own motion baseline."""
    n = len(sm)
    step = [dist(sm[i], sm[i + 1]) for i in range(n - 1)]
    best = None
    for P in range(pmin, pmax + 1):
        for s in range(first, n - P):
            seam = dist(sm[s], sm[s + P])
            base = np.mean(step[s:s + P])
            if base < min_base:      # not enough motion to be a cycle
                continue
            score = seam / base if base > 0 else float("inf")   # a frozen window ranks behind any motion
            if best is None or score < best[0] - 1e-9:
                best = (score, s, P, seam, base)
    return best


def attack_window(sm):
    rest = sm[0]
    d = np.array([dist(f, rest) for f in sm])
    thr = max(1.5, 0.12 * d.max())
    active = np.where(d > thr)[0]
    if len(active) == 0:                 # nothing left the rest pose: sample the whole clip
        return 0, len(sm), d
    s, e = int(active.min()), int(active.max())
    s = max(0, s - 2)
    e = min(len(sm) - 1, e + 2)
    return s, e - s + 1, d


def body_only(rgba, grid=4):
    """Keep the largest opaque blob. The shared canvas is the union of every kept frame, so a thrown
    projectile or breath cloud would widen every cell of every cycle. Labeled on a grid-times-smaller
    mask, so gaps under grid px count as touching."""
    h, w = rgba.shape[:2]
    a = np.array(Image.fromarray(rgba[..., 3]).resize((max(1, w // grid), max(1, h // grid)), Image.BOX)) > 0
    label = np.zeros(a.shape, np.int32)
    sizes = [0]
    for y, x in zip(*np.nonzero(a)):
        if label[y, x]:
            continue
        sizes.append(0)
        n = len(sizes) - 1
        label[y, x] = n
        todo = deque([(y, x)])
        while todo:
            cy, cx = todo.popleft()
            sizes[n] += 1
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < a.shape[0] and 0 <= nx < a.shape[1] and a[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = n
                    todo.append((ny, nx))
    if len(sizes) <= 2:
        return rgba
    keep = np.array(Image.fromarray(((label == int(np.argmax(sizes))) * 255).astype(np.uint8))
                    .resize((w, h), Image.NEAREST)) > 0
    out = rgba.copy()
    out[~keep, 3] = 0
    return out


def fig_height(rgba):
    ys = np.where(rgba[..., 3].any(1))[0]
    return float(ys.max() - ys.min() + 1) if len(ys) else 0.0


def pick(clip_id, cycle, frames, src_fps=24.0, attack_body_only=False):
    rgba = [key(f) for f in frames]
    k = src_fps / 24                     # loop ranges are tuned in 24 fps frames
    sm = [small(x) for x in rgba]
    if cycle == "attack":
        s, P, _ = attack_window(sm)
        idx = [s + round(k * (P - 1) / (FRAMES - 1)) for k in range(FRAMES)]
        info = {"start": s, "length": P, "mode": "active-window"}
    else:
        rng = RANGES_BY_HERO.get(clip_id.rsplit("_", 2)[0], {}).get(cycle, RANGES.get(cycle, RANGES["walk"]))
        rng = (round(rng[0] * k), round(rng[1] * k))
        found = loop_window(sm, *rng, min_base=0.05 if cycle == "idle" else 0.35)
        if found is None:
            # small figure or very subtle motion: drop the motion floor; clip too short: shrink the range
            found = loop_window(sm, *rng, min_base=0) or loop_window(sm, rng[0] // 2, len(sm) - 4, first=1, min_base=0)
            print(f"  {clip_id}: little motion or short clip for a {cycle} loop; relaxed the search, check the GIF")
        if found is None:
            raise SystemExit(f"{clip_id}: clip too short to find a {cycle} loop ({len(sm)} frames)")
        score, s, P, seam, base = found
        if base == 0:
            # 0/0: score a still as a seam no smaller than its motion, so meta.json stays valid JSON
            score = 1.0
            print(f"  {clip_id}: no motion in the {cycle} clip (the video model returned a still); "
                  "regenerate this clip")
        idx = [s + round(k * P / FRAMES) for k in range(FRAMES)]
        info = {"start": s, "length": P, "mode": "loop", "seam_over_baseline": round(float(score), 3),
                "seam": round(seam, 2), "baseline": round(float(base), 2)}
    fps = round(FRAMES * src_fps / info["length"], 1)
    fps = max(5.0, min(fps, 14.0)) if cycle != "attack" else max(8.0, min(fps, 12.0))
    info.update(indices=idx, fps=fps)
    kept = [rgba[i] for i in idx]
    # a backdrop the model drifted off the key color stays opaque, and the shared canvas then
    # grows to the whole frame; the figure never reaches the frame border, the backdrop does
    border = float(np.mean([np.concatenate([f[0, :, 3], f[-1, :, 3], f[:, 0, 3], f[:, -1, 3]]).mean() / 255
                            for f in kept]))
    info["opaque_border"] = round(border, 2)
    if border > 0.25:
        print(f"  {clip_id}: {border:.0%} of the frame border survived the {KEY} key: the backdrop drifted "
              "off the key color; regenerate this clip")
    if cycle != "attack":
        # a treadmill clip that walks toward or away from the camera changes the figure's size,
        # and one shared scale then ships that row too big or too small
        h0 = fig_height(rgba[0])
        drift = float(np.median([fig_height(f) for f in kept])) / h0 if h0 else 1.0
        info["size_vs_first_frame"] = round(drift, 2)
        if not 0.88 <= drift <= 1.12:
            print(f"  {clip_id}: the figure is {drift:.2f}x its first-frame height in the loop window "
                  "(it moved toward or away from the camera); regenerate this clip")
    if cycle == "attack" and attack_body_only:
        kept = [body_only(f) for f in kept]
    return kept, info


def bbox(frames):
    a = np.any(np.stack([f[..., 3] > 0 for f in frames]), 0)
    ys, xs = np.where(a)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def crop_padded(f, box):
    """Crop that tolerates a box reaching past the frame edge (pads with transparency)."""
    x0, y0, x1, y1 = box
    out = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    sx0, sy0 = max(x0, 0), max(y0, 0)
    sx1, sy1 = min(x1, f.shape[1]), min(y1, f.shape[0])
    out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = f[sy0:sy1, sx0:sx1]
    return out


def area_resize(ch, size):
    return np.array(Image.fromarray(ch.astype(np.float32)).resize(size, Image.BOX))


def pixelate(frames, box, scale):
    """Area-average down to the sprite grid (premultiplied, so edges don't pick up the key color)."""
    x0, y0, x1, y1 = box
    size = (max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale)))
    out = []
    for f in frames:
        crop = crop_padded(f, box).astype(np.float32)
        a = crop[..., 3] / 255
        al = area_resize(a, size)
        rgb = np.dstack([area_resize(crop[..., i] * a, size) for i in range(3)])
        rgb = rgb / np.maximum(al, 1e-6)[..., None]
        out.append((np.clip(rgb, 0, 255).astype(np.uint8), al))
    return out


def build_palette(pix_frames, ncol):
    px = np.concatenate([punch(rgb)[m > 0.5] for rgb, m in pix_frames])
    im = Image.fromarray(px.reshape(1, -1, 3))
    return im.quantize(colors=ncol, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def punch(rgb, contrast=1.12, sat=1.12):
    """Small contrast/saturation lift: area-averaging flattens pixel art."""
    f = rgb.astype(np.float32)
    grey = f.mean(-1, keepdims=True)
    f = grey + (f - grey) * sat
    f = (f - 128) * contrast + 128
    return np.clip(f, 0, 255).astype(np.uint8)


def outline(rgba, strength=0.38):
    """Re-draw the 1px dark outline the downscale averaged away: darken every
    opaque pixel that touches transparency (4-neighbour), inside the silhouette."""
    a = rgba[..., 3] > 0
    pad = np.pad(a, 1)
    edge = a & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    out = rgba.copy()
    out[edge, :3] = (out[edge, :3].astype(np.float32) * strength).astype(np.uint8)
    return out


def apply_palette(rgb, mask, pal):
    q = Image.fromarray(punch(rgb)).quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    a = np.array(q)
    return outline(np.dstack([a, np.where(mask > 0.5, 255, 0).astype(np.uint8)]))


def apply_hd(rgb, mask):
    """Painted / HD art: keep the smooth downscale and soft edges, no palette or outline."""
    return np.dstack([rgb, np.clip(mask * 255, 0, 255).astype(np.uint8)])


def figure_height(path):
    """Height of the keyed figure in a clip's first frame, in CANVAS pixels."""
    f = key(read_frames(path)[0][0])
    ys = np.where(f[..., 3].any(1))[0]
    return float(ys.max() - ys.min() + 1)


def main():
    global CANVAS, FRAMES, KEY
    ap = argparse.ArgumentParser()
    ap.add_argument("cast")
    ap.add_argument("heroes", nargs="*")
    ap.add_argument("--clips", default="clips")
    ap.add_argument("--out", default="sheets")
    ap.add_argument("--frames-dir")
    ap.add_argument("--gif", action="store_true")
    a = ap.parse_args()
    cast = json.loads(Path(a.cast).read_text())
    CANVAS = cast.get("canvas", 960)
    FRAMES = cast.get("frames", 8)
    KEY = cast.get("key", "magenta")
    fig_frac = cast.get("fig_frac", 0.58)
    cycles = cast.get("cycles", ["walk", "run", "idle", "attack"])
    facings = cast.get("facings", ["se", "ne"])
    # sheet rows: each facing, then its mirror unless that direction was generated itself
    rows = []
    for f in facings:
        rows.append((f, f, False))
        if f in MIRROR and MIRROR[f] not in facings:
            rows.append((MIRROR[f], f, True))
    heroes = a.heroes or list(cast["heroes"])
    for h in heroes:
        RANGES_BY_HERO[h] = {k: tuple(v) for k, v in cast["heroes"][h].get("ranges", {}).items()}

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    meta_path = out / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    for c in heroes:
        hc = cast["heroes"][c]
        height, ncol, pixel = hc.get("height", 64), hc.get("palette", 24), hc.get("pixel", True)
        have = [cy for cy in cycles if all((Path(a.clips) / f"{c}_{f}_{cy}.mp4").exists() for f in facings)]
        for cy in set(cycles) - set(have):
            print(f"skip {c} {cy}: missing " + ", ".join(f"{c}_{f}_{cy}.mp4" for f in facings
                                                        if not (Path(a.clips) / f"{c}_{f}_{cy}.mp4").exists()))
        if not have:
            continue
        picked, infos = {}, {}
        for f in facings:
            for cy in have:
                cid = f"{c}_{f}_{cy}"
                frames, src_fps = read_frames(Path(a.clips) / f"{cid}.mp4")
                picked[cid], infos[cid] = pick(cid, cy, frames, src_fps, hc.get("attack_body_only", False))
                flag = ""
                if infos[cid]["mode"] == "loop" and infos[cid]["seam_over_baseline"] > 0.8 and cy != "idle":
                    flag = "  <-- weak seam: widen this hero's range or regenerate"
                print(cid, {k: infos[cid][k] for k in ("mode", "start", "length", "fps")},
                      infos[cid].get("seam_over_baseline", ""), flag)
        # figure height in the first frames: cycle_frames.py puts it at fig_frac; clips made
        # elsewhere are measured so the sprite still lands on the requested height
        if fig_frac == "auto":
            fig_h = figure_height(Path(a.clips) / f"{c}_{facings[0]}_{have[0]}.mp4")
        else:
            fig_h = fig_frac * CANVAS
        # one canvas per hero so every cycle and facing registers
        allf = [x for v in picked.values() for x in v]
        x0, y0, x1, y1 = bbox(allf)
        mid = CANVAS // 2
        half = max(mid - x0, x1 - mid)
        box = (mid - half - 8, y0 - 8, mid + half + 8, y1 + 8)
        scale = height / fig_h
        pix = {k: pixelate(v, box, scale) for k, v in picked.items()}
        if pixel:
            pal = build_palette([p for v in pix.values() for p in v], ncol)
            finish = lambda rgb, m: apply_palette(rgb, m, pal)
        else:
            finish = apply_hd
        first = pix[f"{c}_{facings[0]}_{have[0]}"][0][0]
        cw, ch = first.shape[1], first.shape[0]
        names = [r[0] for r in rows]
        for cy in have:
            sheet = Image.new("RGBA", (cw * FRAMES, ch * len(rows)), (0, 0, 0, 0))
            for r, (name, f, flip) in enumerate(rows):
                for k, (rgb, m) in enumerate(pix[f"{c}_{f}_{cy}"]):
                    im = Image.fromarray(finish(rgb, m))
                    if flip:
                        im = im.transpose(Image.FLIP_LEFT_RIGHT)
                    sheet.paste(im, (k * cw, r * ch))
                    if a.frames_dir:
                        d = Path(a.frames_dir) / c / cy
                        d.mkdir(parents=True, exist_ok=True)
                        im.save(d / f"{name}_{k}.png")
            sheet.save(out / f"{c}_{cy}.png")
            if a.gif:
                # rows play side by side here, so the preview runs at the first facing's rate;
                # each row's own rate is in meta.json
                fps = infos[f"{c}_{facings[0]}_{cy}"]["fps"]
                gif = [Image.new("RGBA", (cw * len(rows), ch), (40, 42, 54, 255)) for _ in range(FRAMES)]
                for r in range(len(rows)):
                    for k in range(FRAMES):
                        cell = sheet.crop((k * cw, r * ch, (k + 1) * cw, (r + 1) * ch))
                        gif[k].alpha_composite(cell, (r * cw, 0))
                zoom = max(1, 512 // ch)
                gif = [g.resize((g.width * zoom, g.height * zoom), Image.NEAREST).convert("RGB") for g in gif]
                gif[0].save(out / f"{c}_{cy}_preview.gif", save_all=True, append_images=gif[1:],
                            duration=round(1000 / fps), loop=0)
        # pivot: horizontal center of the cell, y at the feet in the first frame of the first cycle
        a0 = np.array(Image.fromarray(finish(*pix[f"{c}_{facings[0]}_{have[0]}"][0])))[..., 3]
        feet = int(np.where(a0.any(1))[0].max()) + 1
        meta[c] = {"cell": [cw, ch], "pivot": [cw // 2, feet], "height": height, "rows": names, "frames": FRAMES,
                   "palette": ncol if pixel else None, "box": [int(v) for v in box], "scale": round(scale, 4),
                   # each facing loops at its own period, so fps is per row (a mirror plays at its source's)
                   "cycles": {cy: {"fps": {name: infos[f"{c}_{f}_{cy}"]["fps"] for name, f, _ in rows},
                                   **{f: infos[f"{c}_{f}_{cy}"] for f in facings}}
                              for cy in have}}
        meta_path.write_text(json.dumps(meta, indent=1, default=int))
        print(c, "cell", cw, ch, "rows", " ".join(names))


if __name__ == "__main__":
    main()
