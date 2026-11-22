#!/usr/bin/env python3
"""Color engine: per-pixel grading operations, baked into 3D LUTs.

Every op works on Rec.709 display RGB in 0-1 (N x 3 float arrays). A look's "ops" list
is pure per-pixel math, so the whole chain is baked into a .cube LUT: identical on every
frame, fast through ffmpeg, and portable to Premiere / After Effects / Resolve.
Spatial things (relight, keyed selective color, vignette, grain, halation) live elsewhere:
relight + keys in spatial.py, finishing in finish_filter() as ffmpeg filters.

  python3 grade.py <looks.json> <lut_dir>     # write <lut_dir>/<key>.cube for every look
"""
import json
import sys
from pathlib import Path

import numpy as np

LUMA = np.array([0.2126, 0.7152, 0.0722])
BASE_DIR = Path(".")  # set by load_looks(); relative paths in looks (match stats) resolve here


# ---------- color helpers ----------

def to_lin(x):
    return np.power(np.clip(x, 0, None), 2.4)


def to_disp(x):
    return np.power(np.clip(x, 0, None), 1 / 2.4)


def luma(x):
    return x @ LUMA


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def rgb_to_hsv(x):
    r, g, b = x[:, 0], x[:, 1], x[:, 2]
    mx, mn = x.max(1), x.min(1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-9
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h = h * 60.0
    s = np.where(mx > 1e-9, d / np.maximum(mx, 1e-9), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    h = (h % 360) / 60.0
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    out = np.empty((len(h), 3))
    for k, (a, b, c) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        sel = i == k
        out[sel] = np.stack([a[sel], b[sel], c[sel]], 1)
    return out


def hue_weight(h, s, center, width, min_sat):
    """Soft selection of one hue range (degrees): full inside width/2, zero beyond width."""
    dist = np.abs((h - center + 180) % 360 - 180)
    return (1 - smoothstep(width * 0.5, width, dist)) * smoothstep(min_sat, min_sat + 0.08, s)


# ---------- input transforms ----------

_SG3C_TO_709 = None


def _sgamut3cine_to_709():
    def m(primaries, white=(0.3127, 0.3290)):
        xyz = lambda x, y: np.array([x / y, 1.0, (1 - x - y) / y])
        p = np.stack([xyz(*q) for q in primaries], 1)
        return p * np.linalg.solve(p, xyz(*white))
    rec709 = [(0.640, 0.330), (0.300, 0.600), (0.150, 0.060)]
    sg3c = [(0.766, 0.275), (0.225, 0.800), (0.089, -0.087)]
    return np.linalg.inv(m(rec709)) @ m(sg3c)


def op_decode_log(x, curve="slog3", exposure=0.0, knee=0.8):
    """Camera log -> Rec.709 display. Put FIRST in a look when the source is log footage.

    curve: "slog3" (Sony S-Log3 / S-Gamut3.Cine). Highlights above 1.0 roll off softly.
    """
    global _SG3C_TO_709
    if curve != "slog3":
        raise ValueError(f"unsupported log curve {curve!r} (supported: slog3)")
    if _SG3C_TO_709 is None:
        _SG3C_TO_709 = _sgamut3cine_to_709()
    c = np.clip(x, 0, 1) * 1023
    lin = np.where(c >= 171.2102946929, (10 ** ((c - 420) / 261.5)) * 0.19 - 0.01,
                   (c - 95) * 0.01125 / (171.2102946929 - 95))
    lin709 = np.clip(lin @ _SG3C_TO_709.T, 0, None) * 2.0 ** exposure
    return op_highlight_rolloff(to_disp(lin709), knee)


# ---------- grading operations ----------

def op_white_balance(x, temp=0.0, tint=0.0):
    """temp > 0 warmer, < 0 cooler; tint > 0 magenta, < 0 green. In linear light."""
    return to_disp(to_lin(x) * np.array([1 + temp, 1 - tint, 1 - temp]))


def op_exposure(x, stops=0.0):
    return to_disp(to_lin(x) * 2.0 ** stops)


def op_cdl(x, slope=(1, 1, 1), offset=(0, 0, 0), power=(1, 1, 1)):
    """ASC CDL: out = (in * slope + offset) ^ power."""
    return np.power(np.clip(x * np.array(slope) + np.array(offset), 0, None), np.array(power))


def op_contrast(x, amount=0.0, pivot=0.45):
    """Filmic S-curve around pivot; amount > 0 adds contrast, < 0 flattens."""
    y = np.clip(x, 0, 1)
    lo = pivot * np.power(y / pivot, 1 + amount)
    hi = 1 - (1 - pivot) * np.power((1 - y) / (1 - pivot), 1 + amount)
    return np.where(y < pivot, lo, hi)


def op_levels(x, black=0.0, white=1.0):
    """Where pure black / white land: black > 0 fades blacks, white < 1 rolls off whites."""
    return black + (white - black) * x


def op_saturation(x, amount=1.0):
    l = luma(x)[:, None]
    return l + (x - l) * amount


def op_vibrance(x, amount=0.0):
    """Boost low-saturation colors more than already-saturated ones."""
    _, s, _ = rgb_to_hsv(np.clip(x, 0, 1))
    l = luma(x)[:, None]
    return l + (x - l) * (1 + amount * (1 - s)[:, None])


def op_split_tone(x, shadows=(0, 0, 0), highlights=(0, 0, 0), balance=0.5):
    """Add a color to the shadows and another to the highlights (RGB offsets, ~0.02-0.08)."""
    l = luma(np.clip(x, 0, 1))[:, None]
    ws = 1 - smoothstep(0.0, balance * 2, l)
    wh = smoothstep(balance * 0.6, 1.0, l)
    return x + ws * np.array(shadows) + wh * np.array(highlights)


def op_hue_shift(x, center, width, shift=0.0, sat=1.0, val=1.0, min_sat=0.05, sat_floor=0.0, max_val=None):
    """Change one color range: rotate its hue, scale its saturation / brightness.

    Edge pixels blend between original and fully changed color, so big rotations
    never sweep through in-between hues (a red->green swap never shows purple edges).
    """
    xc = np.clip(x, 0, 1)
    h, s, v = rgb_to_hsv(xc)
    w = hue_weight(h, s, center, width, min_sat)
    if max_val is not None:
        w = w * (1 - smoothstep(max_val, max_val + 0.08, v))
    full = hsv_to_rgb(h + shift, np.clip(np.maximum(s * sat, sat_floor), 0, 1), np.clip(v * val, 0, 1))
    return xc + w[:, None] * (full - xc)


def op_mono(x, weights=(0.2126, 0.7152, 0.0722), tint=(0, 0, 0)):
    """Black and white with a channel mix (e.g. red filter = (0.6, 0.35, 0.05)) and optional tint."""
    w = np.array(weights) / np.sum(weights)
    l = (np.clip(x, 0, 1) @ w)[:, None]
    return l + np.array(tint) * (1 - np.abs(2 * l - 1))


def op_duotone(x, shadows, highlights, mid=None, contrast=0.0):
    """Map brightness onto a 2- (or 3-) color gradient, like a printed duotone poster."""
    l = op_contrast(luma(np.clip(x, 0, 1))[:, None], contrast)
    s, hi = np.array(shadows), np.array(highlights)
    if mid is None:
        return s + (hi - s) * l
    m = np.array(mid)
    return np.where(l < 0.5, s + (m - s) * (l * 2), m + (hi - m) * (l * 2 - 1))


def op_highlight_rolloff(x, knee=0.8):
    """Soft shoulder so bright areas compress instead of clipping."""
    y = np.clip(x, 0, None).copy()
    over = y > knee
    y[over] = knee + (1 - knee) * np.tanh((y[over] - knee) / (1 - knee))
    return y


# --- CIE Lab (D65) for statistical color matching ---
_M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
_WHITE = _M.sum(1)


def rgb_to_lab(x):
    xyz = to_lin(np.clip(x, 0, 1)) @ _M.T / _WHITE
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], 1)


def lab_to_rgb(lab):
    fy = (lab[:, 0] + 16) / 116
    f = np.stack([fy + lab[:, 1] / 500, fy, fy - lab[:, 2] / 200], 1)
    xyz = np.where(f > 0.2069, f ** 3, (f - 16 / 116) / 7.787) * _WHITE
    return to_disp(np.clip(xyz @ np.linalg.inv(_M).T, 0, None))


def op_match(x, stats, strength=1.0):
    """Reinhard transfer: give the clip a reference image's Lab mean and spread (stats from match.py)."""
    p = Path(stats)
    st = json.loads((p if p.is_absolute() else BASE_DIR / p).read_text(encoding="utf-8"))
    lab = rgb_to_lab(x)
    sm, ss = np.array(st["src_mean"]), np.array(st["src_std"])
    rm, rs = np.array(st["ref_mean"]), np.array(st["ref_std"])
    out = lab_to_rgb((lab - sm) * (rs / np.maximum(ss, 1e-6)) + rm)
    xc = np.clip(x, 0, 1)
    return xc + strength * (out - xc)


OPS = {
    "decode_log": op_decode_log,
    "white_balance": op_white_balance,
    "exposure": op_exposure,
    "cdl": op_cdl,
    "contrast": op_contrast,
    "levels": op_levels,
    "saturation": op_saturation,
    "vibrance": op_vibrance,
    "split_tone": op_split_tone,
    "hue_shift": op_hue_shift,
    "mono": op_mono,
    "duotone": op_duotone,
    "match": op_match,
    "highlight_rolloff": op_highlight_rolloff,
}


# ---------- looks ----------

def load_looks(path):
    """Load a looks.json; relative paths inside it resolve next to the file."""
    global BASE_DIR
    path = Path(path).resolve()
    BASE_DIR = path.parent
    looks = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in looks.items() if not k.startswith("_")}


def apply_ops(rgb, ops):
    x = np.asarray(rgb, np.float64)
    for step in ops:
        args = {k: v for k, v in step.items() if k != "op"}
        x = OPS[step["op"]](x, **args)
    return np.clip(x, 0, 1)


def write_cube(path, look, size=33):
    g = np.linspace(0, 1, size)
    b, gg, r = np.meshgrid(g, g, g, indexing="ij")
    out = apply_ops(np.stack([r.ravel(), gg.ravel(), b.ravel()], 1), look.get("ops", []))
    with open(path, "w", encoding="utf-8") as f:
        f.write(f'TITLE "{look.get("name", Path(path).stem)}"\nLUT_3D_SIZE {size}\n')
        f.writelines(f"{v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n" for v in out)


def finish_filter(look):
    """ffmpeg finishing filters (spatial, so they can't live in a LUT): halation, vignette, grain."""
    f = []
    if look.get("halation"):
        h = look["halation"]
        r, g, b = h.get("color", (1.0, 0.3, 0.1))
        t = h.get("threshold", 0.72)
        f.append(f"format=gbrp,split[base][hl];[hl]curves=all='0/0 {t}/0 1/1',gblur=sigma={h.get('sigma', 16)},"
                 f"colorchannelmixer=rr={r}:rg=0:rb=0:gr={g}:gg=0:gb=0:br={b}:bg=0:bb=0[glow];"
                 f"[base][glow]blend=all_mode=screen:all_opacity={h.get('opacity', 0.6)}")
    if look.get("vignette"):
        f.append(f"vignette=angle={look['vignette']}:mode=forward")
    if look.get("grain"):
        # Luma only: noise on RGB or chroma planes puts colored specks on black-and-white looks.
        f.append(f"format=yuv444p,noise=c0s={look['grain']}:c0f=t")
    return f


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: python3 grade.py <looks.json> <lut_dir>   (writes one 33^3 .cube per look)")
    looks = load_looks(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for key, look in looks.items():
        write_cube(out / f"{key}.cube", look)
    print(f"wrote {len(looks)} LUTs to {out}")


if __name__ == "__main__":
    main()
