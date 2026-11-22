#!/usr/bin/env python3
"""Clip-to-sprite helpers imported by side_sprites.py; not run directly.

Keying: the flat magenta (#FF00FF) field goes to alpha, the model's purple
ground shadow and pink haze with it, then the edges are despilled.

Frame picking, per clip:
  loop: the window [s, s+P) whose seam (frame s against frame s+P) is
    smallest compared with the mean frame-to-frame motion inside it; it
    searches every start s >= skip and every period P in the cycle's range.
  attack: the active window, from the first to the last frame that differs
    from the rest pose (frame 0), plus two frames either side.
Then `frames` evenly spaced frames are sampled from the window.

Finishing: an area-average downscale premultiplied by alpha, a small
contrast and saturation lift, and a 1 px inner outline redrawn on the
silhouette edge.

Needs Python 3 with Pillow and NumPy, and ffmpeg and ffprobe on the PATH.
"""
import subprocess
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit('This script needs Pillow and NumPy: python3 -m pip install pillow numpy')

DEFAULT_RANGES = {'walk': (12, 34), 'run': (8, 24), 'idle': (24, 66)}
WEAK_SEAM = 0.6


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                          'stream=width,height,r_frame_rate', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True, check=True).stdout.strip().split(',')
    num, _, den = out[2].partition('/')
    return int(out[0]), int(out[1]), float(num) / float(den or 1)


def read_frames(path, canvas):
    w, h, fps = probe(path)
    if abs(w - h) > 0.02 * max(w, h):
        raise SystemExit(f'error: {path} is {w}x{h}; clips must be square (1:1) like their first frame, '
                         'or the figure scale and feet anchor break')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'rawvideo',
                          '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    arr = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
    if (w, h) != (canvas, canvas):
        arr = np.stack([np.array(Image.fromarray(f).resize((canvas, canvas), Image.LANCZOS)) for f in arr])
    return arr, fps


def key(rgb):
    """Alpha from the magenta field, including the purple ground shadow and pink haze, then despill."""
    f = rgb.astype(np.float32) / 255
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx, mn = f.max(-1), f.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    magenta = np.minimum(r, b) - g          # > 0 when red and blue both beat green
    bg = (magenta > 0.18) & (sat > 0.28) & (np.abs(r - b) < 0.45)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    out = rgb.astype(np.float32)
    spill = np.clip(np.minimum(out[..., 0], out[..., 2]) - out[..., 1], 0, None) * 0.6
    out[..., 0] -= spill
    out[..., 2] -= spill
    return np.dstack([np.clip(out, 0, 255).astype(np.uint8), alpha])


def small(rgba, s=120):
    im = Image.fromarray(rgba).resize((s, s), Image.BOX)
    a = np.array(im).astype(np.float32)
    return a[..., :3] * (a[..., 3:] / 255), a[..., 3] / 255


def dist(a, b):
    return float(np.abs(a[0] - b[0]).mean() + 80 * np.abs(a[1] - b[1]).mean())


def loop_window(sm, pmin, pmax, first, min_base):
    """Tightest closing window [s, s+P): seam delta against the window's own motion baseline."""
    n = len(sm)
    step = [dist(sm[i], sm[i + 1]) for i in range(n - 1)]
    best = None
    for period in range(pmin, pmax + 1):
        for s in range(first, n - period):
            base = float(np.mean(step[s:s + period]))
            if base < min_base:          # not enough motion to be a cycle
                continue
            seam = dist(sm[s], sm[s + period])
            score = seam / base
            if best is None or score < best[0] - 1e-9:
                best = (score, s, period, seam, base)
    return best


def attack_window(sm):
    rest = sm[0]
    d = np.array([dist(f, rest) for f in sm])
    thr = max(1.5, 0.12 * d.max())
    active = np.where(d > thr)[0]
    if len(active) == 0:
        return 0, len(sm)
    s = max(0, int(active.min()) - 2)
    e = min(len(sm) - 1, int(active.max()) + 2)
    return s, e - s + 1


def pick(cycle, mode, frames, clip_fps, ranges, args):
    """Key every frame, choose the window by mode (loop or attack), sample args.frames frames;
    args also carries skip."""
    rgba = [key(f) for f in frames]
    sm = [small(x) for x in rgba]
    n = args.frames
    if mode == 'attack':
        s, length = attack_window(sm)
        idx = [s + round(k * (length - 1) / (n - 1)) for k in range(n)]
        info = {'start': s, 'length': length, 'mode': 'active-window'}
        fps = min(max(n * clip_fps / length, 8.0), 12.0)
    else:
        pmin, pmax = ranges[cycle]
        pmax = min(pmax, len(sm) - args.skip - 1)
        found = loop_window(sm, pmin, pmax, args.skip, 0.05 if cycle == 'idle' else 0.35)
        if found is None:
            raise SystemExit(f'error: no loop window with real motion in the {cycle} clip '
                             f'(range {pmin}:{pmax}); widen --range or check the clip')
        score, s, length, seam, base = found
        idx = [s + round(k * length / n) for k in range(n)]
        info = {'start': s, 'length': length, 'mode': 'loop', 'seam_over_baseline': round(score, 3),
                'seam': round(seam, 2), 'baseline': round(base, 2)}
        fps = min(max(n * clip_fps / length, 5.0), 14.0)
    info.update(indices=idx, fps=round(fps, 1))
    return [rgba[i] for i in idx], info


def bbox(frames):
    a = np.any(np.stack([f[..., 3] > 0 for f in frames]), 0)
    ys, xs = np.where(a)
    if len(xs) == 0:
        raise SystemExit('error: every kept frame is empty after keying; is the background flat magenta?')
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def crop_padded(f, box):
    """Crop that tolerates a box past the frame edge (pads with transparency instead of wrapping)."""
    x0, y0, x1, y1 = box
    out = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    sx0, sy0 = max(x0, 0), max(y0, 0)
    sx1, sy1 = min(x1, f.shape[1]), min(y1, f.shape[0])
    out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = f[sy0:sy1, sx0:sx1]
    return out


def area_resize(ch, size):
    return np.array(Image.fromarray(ch.astype(np.float32)).resize(size, Image.BOX))


def pixelate(frames, box, scale):
    """Area-average to the sprite grid, premultiplied so edges do not pick up the key color."""
    x0, y0, x1, y1 = box
    size = (max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale)))
    out = []
    for f in frames:
        crop = crop_padded(f, box).astype(np.float32)
        a = crop[..., 3] / 255
        al = area_resize(a, size)
        rgb = np.dstack([area_resize(crop[..., i] * a, size) for i in range(3)])
        rgb = rgb / np.maximum(al, 1e-6)[..., None]
        out.append((np.clip(rgb, 0, 255).astype(np.uint8), al > 0.5))
    return out


def punch(rgb, contrast, sat):
    """Small contrast and saturation lift: area-averaging flattens pixel art."""
    f = rgb.astype(np.float32)
    gray = f.mean(-1, keepdims=True)
    f = gray + (f - gray) * sat
    f = (f - 128) * contrast + 128
    return np.clip(f, 0, 255).astype(np.uint8)


def outline(rgba, strength):
    """Redraw the 1 px dark outline the downscale averaged away: darken every
    opaque pixel that touches transparency (4-neighbor), inside the silhouette."""
    if strength >= 1:
        return rgba
    a = rgba[..., 3] > 0
    pad = np.pad(a, 1)
    edge = a & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    out = rgba.copy()
    out[edge, :3] = (out[edge, :3].astype(np.float32) * strength).astype(np.uint8)
    return out


if __name__ == '__main__':
    print('sprite_cycles.py is a helper module; run side_sprites.py (same folder) instead.')
