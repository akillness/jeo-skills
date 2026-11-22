"""
ue_review: see what was built. In-editor screenshots and Movie Render Graph stills, plus
offline image checks that catch what an agent's own eyes miss.

STATUS: the offline part (PNG codec, image_checks, image_verdict, compare, contact_sheet,
review_images, build_render_command) ran on synthetic images with system python3 on
2026-09-24 (tests/code/unreal-expert/test_ue_review_offline.py). The in-editor part
(screenshot, set_camera, screenshot_views, render_still) is NOT YET RUN IN UNREAL.

Why the checks exist: in Epic's MCP talk the lighting agent changed the cloud material,
took a screenshot, and judged a completely white frame "fine" (From Words to Worlds,
lDf_y-YPELo [00:17:29]). Never approve a frame on sight alone: run image_checks and read
the flags, then look.

Offline (agent side, system python3; Pillow and numpy are used when present, pure Python
otherwise, so the same code also runs inside Unreal's Python):
  c = image_checks("/abs/shot.png")        # histogram, clipped, crushed, EV-like, contrast,
                                           # all_white / all_black / uniform flags, alpha
  image_verdict(c, expect="any"|"night"|"bright")   # 'error:' / 'warn:' / 'info:' lines
  compare("/abs/before.png", "/abs/after.png")      # parity for performance fixes
  contact_sheet([...], "/abs/sheet.png", labels=[...])
  review_images([...], sheet="/abs/sheet.png")      # all of the above in one call
  wait_for_file(path, timeout=60)                   # screenshots land a few ticks later

In the editor (running editor through MCP or ue_remote.PythonRemote, or a latent job via
ue_run.run_python(mode="latent")); never in a commandlet, which renders nothing:
  set_camera((x, y, z), (pitch, yaw, roll), fov=None)
  screenshot("/abs/out/shot.png", 1920, 1080, camera=None)   # returns at once
  yield from wait_screenshot(req)                            # latent jobs only
  yield from screenshot_views(views, "/abs/out")             # fixed camera bookmarks
  render_still(sequence_or_camera, "/abs/out", preset=None, frame=0)   # MRG / MRQ, async

Command line (headless render of a Level Sequence, legacy Primary Config or saved queue):
  build_render_command(engine, uproject, map, sequence, config, resolution=(1920, 1080))
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

import json
import math
import os
import struct
import sys
import time
import zlib

try:  # optional accelerators; everything works without them
    from PIL import Image as _PIL
except Exception:  # pragma: no cover
    _PIL = None
try:
    import numpy as _np
except Exception:  # pragma: no cover
    _np = None

REC709 = (0.2126, 0.7152, 0.0722)
MIDDLE_GREY = 0.18
DEFAULTS = {
    # All [added] start values for a display-referred (tone-mapped, sRGB) screenshot.
    "clip_luma": 250,          # luma >= this counts as clipped (0-255)
    "channel_clip": 254,       # any channel >= this counts as channel-clipped
    "crush_luma": 5,           # luma <= this counts as crushed
    "all_fraction": 0.98,      # >= this share clipped / crushed sets all_white / all_black
    "uniform_std": 0.01,       # luma standard deviation (0-1) below this: a flat frame
    "centre_frac": 1.0 / 3.0,  # centre window, share of width and height
    "max_samples": 400000,     # pixels sampled on a regular grid (both code paths)
    "bins": 16,
}


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


_LIN = [_srgb_to_linear(i / 255.0) for i in range(256)]


# =========================================================================== PNG codec
_PNG_SIG = b"\x89PNG\r\n\x1a\n"


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def _unfilter(raw, h, stride, bpp):
    out = bytearray(h * stride)
    prev = bytearray(stride)
    pos = 0
    for y in range(h):
        f = raw[pos]
        line = bytearray(raw[pos + 1:pos + 1 + stride])
        pos += stride + 1
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif f == 2:
            line = bytearray((a + b) & 255 for a, b in zip(line, prev))
        elif f == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                c = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + _paeth(a, prev[i], c)) & 255
        elif f != 0:
            raise ValueError("bad PNG filter type %d on row %d" % (f, y))
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return out


def decode_png(data):
    """Pure-Python PNG decoder -> (width, height, rgb bytearray, alpha bytearray or None).

    Supports bit depths 1 to 16, grayscale, RGB, palette (with tRNS), gray+alpha, RGBA;
    16-bit samples keep their high byte (enough for statistics). Interlaced files raise
    NotImplementedError (install Pillow); Unreal does not write interlaced PNGs [added]."""
    if data[:8] != _PNG_SIG:
        raise ValueError("not a PNG file")
    pos, idat, plte, trns, hdr = 8, [], None, None, None
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            hdr = struct.unpack(">IIBBBBB", chunk)
        elif ctype == b"PLTE":
            plte = chunk
        elif ctype == b"tRNS":
            trns = chunk
        elif ctype == b"IDAT":
            idat.append(chunk)
        elif ctype == b"IEND":
            break
    if hdr is None:
        raise ValueError("PNG without IHDR")
    w, h, bd, ct, _comp, _filt, inter = hdr
    if inter:
        raise NotImplementedError("interlaced PNG: install Pillow to read it")
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    bits = ch * bd
    stride = (w * bits + 7) // 8
    bpp = max(1, bits // 8)
    px = _unfilter(zlib.decompress(b"".join(idat)), h, stride, bpp)
    n = w * h
    rgb = bytearray(3 * n)
    alpha = None
    if bd < 8:  # packed grayscale or palette
        vals = bytearray(n)
        per = 8 // bd
        mask = (1 << bd) - 1
        for y in range(h):
            row = px[y * stride:(y + 1) * stride]
            for x in range(w):
                byte = row[x // per]
                shift = 8 - bd * (x % per + 1)
                vals[y * w + x] = (byte >> shift) & mask
        if ct == 0:
            scale = 255 // mask
            for i, v in enumerate(vals):
                rgb[3 * i] = rgb[3 * i + 1] = rgb[3 * i + 2] = v * scale
        else:
            alpha = bytearray(b"\xff" * n) if trns else None
            for i, v in enumerate(vals):
                rgb[3 * i:3 * i + 3] = plte[3 * v:3 * v + 3]
                if trns and v < len(trns):
                    alpha[i] = trns[v]
        return w, h, rgb, alpha
    step = bd // 8  # bytes per sample: 1 or 2 (take the high byte)
    if ct == 3:
        alpha = bytearray(b"\xff" * n) if trns else None
        for i in range(n):
            v = px[i]
            rgb[3 * i:3 * i + 3] = plte[3 * v:3 * v + 3]
            if trns and v < len(trns):
                alpha[i] = trns[v]
        return w, h, rgb, alpha
    s = ch * step
    if ct in (4, 6):
        alpha = bytearray(n)
    for i in range(n):
        o = i * s
        if ct in (0, 4):
            g = px[o]
            rgb[3 * i] = rgb[3 * i + 1] = rgb[3 * i + 2] = g
            if ct == 4:
                alpha[i] = px[o + step]
        else:
            rgb[3 * i] = px[o]
            rgb[3 * i + 1] = px[o + step]
            rgb[3 * i + 2] = px[o + 2 * step]
            if ct == 6:
                alpha[i] = px[o + 3 * step]
    return w, h, rgb, alpha


def _filter_row(f, line, prev, bpp):
    if f == 0:
        return bytes(line)
    out = bytearray(len(line))
    for i in range(len(line)):
        a = line[i - bpp] if i >= bpp else 0
        b = prev[i]
        c = prev[i - bpp] if i >= bpp else 0
        pred = (0, a, b, (a + b) >> 1, _paeth(a, b, c))[f]
        out[i] = (line[i] - pred) & 255
    return bytes(out)


def encode_png(w, h, rgb, alpha=None, filters=(0,), bit_depth=8, gray=False):
    """Pure-Python PNG encoder (tests and contact sheets). rgb is bytes of 3*w*h (or w*h
    when gray=True); alpha optional w*h bytes. filters cycles over rows (0 None, 1 Sub,
    2 Up, 3 Average, 4 Paeth). bit_depth=16 widens each sample (v * 257)."""
    ch = (1 if gray else 3) + (1 if alpha is not None else 0)
    ct = {1: 0, 2: 4, 3: 2, 4: 6}[ch]
    step = 2 if bit_depth == 16 else 1
    stride = w * ch * step
    rows, prev = [], bytearray(stride)
    src_ch = 1 if gray else 3
    for y in range(h):
        line = bytearray(stride)
        for x in range(w):
            i = y * w + x
            vals = list(rgb[src_ch * i:src_ch * i + src_ch])
            if alpha is not None:
                vals.append(alpha[i])
            for k, v in enumerate(vals):
                o = (x * ch + k) * step
                if step == 2:
                    line[o:o + 2] = struct.pack(">H", v * 257)
                else:
                    line[o] = v
        f = filters[y % len(filters)]
        rows.append(bytes([f]) + _filter_row(f, line, prev, ch * step))
        prev = line

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, bit_depth, ct, 0, 0, 0)
    return (_PNG_SIG + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"".join(rows), 6))
            + chunk(b"IEND", b""))


def write_png(path, w, h, rgb, alpha=None, **kw):
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    with open(path, "wb") as f:
        f.write(encode_png(w, h, rgb, alpha, **kw))
    return path


# =========================================================================== loading
def load_image(path, prefer_pil=True):
    """-> (w, h, rgb bytearray, alpha or None, meta). PNG through Pillow or the pure
    decoder; JPEG, BMP, TIFF need Pillow; EXR needs the OpenEXR module (linear values are
    converted to display sRGB with a plain clamp, and meta reports nan, inf and the linear
    mean) [added]. Raises with the reason otherwise."""
    ext = os.path.splitext(path)[1].lower()
    meta = {"path": path, "format": ext.lstrip("."), "decoder": None}
    if ext == ".exr":
        return _load_exr(path, meta)
    if _PIL is not None and prefer_pil:
        im = _PIL.open(path)
        im.load()
        meta["decoder"] = "pillow"
        mode = im.mode
        alpha = None
        if mode in ("RGBA", "LA", "PA") or (mode == "P" and "transparency" in im.info):
            rgba = im.convert("RGBA")
            alpha = bytearray(rgba.getchannel("A").tobytes())
            rgb = bytearray(rgba.convert("RGB").tobytes())
        elif mode.startswith("I"):  # 16-bit or 32-bit grayscale: keep the high byte
            data = list(im.getdata())
            shift = 8 if data and max(data) > 255 else 0
            gray = bytes(min(255, max(0, int(v) >> shift)) for v in data)
            rgb = bytearray(3 * len(gray))
            rgb[0::3] = gray
            rgb[1::3] = gray
            rgb[2::3] = gray
        else:
            rgb = bytearray(im.convert("RGB").tobytes())
        return im.width, im.height, rgb, alpha, meta
    if ext != ".png":
        raise RuntimeError("%s needs Pillow (pip install pillow); PNG works without it" % ext)
    with open(path, "rb") as f:
        w, h, rgb, alpha = decode_png(f.read())
    meta["decoder"] = "pure"
    return w, h, rgb, alpha, meta


def _load_exr(path, meta):
    try:
        import OpenEXR
        import Imath
    except Exception:
        raise RuntimeError("EXR needs the OpenEXR Python module; otherwise add a PNG output "
                           "next to the EXR in the render graph and check that")
    f = OpenEXR.InputFile(path)
    dw = f.header()["dataWindow"]
    w, h = dw.max.x - dw.min.x + 1, dw.max.y - dw.min.y + 1
    pt = Imath.PixelType(Imath.PixelType.FLOAT)
    chans = [struct.unpack("%df" % (w * h), f.channel(c, pt)) for c in ("R", "G", "B")]
    rgb = bytearray(3 * w * h)
    nan = inf = 0
    total = 0.0
    for i in range(w * h):
        y = 0.0
        for k in range(3):
            v = chans[k][i]
            if v != v:
                nan += 1
                v = 0.0
            elif v in (float("inf"), float("-inf")):
                inf += 1
                v = 0.0
            y += REC709[k] * v
            c = min(max(v, 0.0), 1.0)
            enc = 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
            rgb[3 * i + k] = int(round(enc * 255))
        total += y
    meta.update(decoder="openexr", nan=nan, inf=inf, linear_mean=total / max(1, w * h))
    return w, h, rgb, None, meta


# =========================================================================== checks
def _grid(w, h, max_samples):
    step = max(1, int(math.ceil(math.sqrt(float(w * h) / max_samples))))
    return step


def _stats_pure(w, h, rgb, step, cx0, cx1, cy0, cy1, t):
    hist = [0] * 256
    n = s1 = s2 = 0
    clipped = chan = crushed = 0
    lin_sum = log_sum = 0.0
    c_sum = c_n = 0
    lin, (kr, kg, kb) = _LIN, REC709
    for y in range(0, h, step):
        base = y * w
        in_y = cy0 <= y < cy1
        for x in range(0, w, step):
            o = 3 * (base + x)
            r, g, b = rgb[o], rgb[o + 1], rgb[o + 2]
            luma = int(kr * r + kg * g + kb * b + 0.5)
            hist[luma] += 1
            n += 1
            s1 += luma
            s2 += luma * luma
            if luma >= t["clip_luma"]:
                clipped += 1
            if luma <= t["crush_luma"]:
                crushed += 1
            if r >= t["channel_clip"] or g >= t["channel_clip"] or b >= t["channel_clip"]:
                chan += 1
            yl = kr * lin[r] + kg * lin[g] + kb * lin[b]
            lin_sum += yl
            log_sum += math.log(yl + 1e-4)
            if in_y and cx0 <= x < cx1:
                c_sum += yl
                c_n += 1
    return hist, n, s1, s2, clipped, chan, crushed, lin_sum, log_sum, c_sum, c_n


def _stats_numpy(w, h, rgb, step, cx0, cx1, cy0, cy1, t):
    a = _np.frombuffer(bytes(rgb), dtype=_np.uint8).reshape(h, w, 3)[::step, ::step]
    r, g, b = (a[..., k].astype(_np.float64) for k in range(3))
    kr, kg, kb = REC709
    luma = _np.floor(kr * r + kg * g + kb * b + 0.5).astype(_np.int64)
    lut = _np.array(_LIN)
    yl = kr * lut[a[..., 0]] + kg * lut[a[..., 1]] + kb * lut[a[..., 2]]
    hist = _np.bincount(luma.ravel(), minlength=256).tolist()
    ys = _np.arange(0, h, step)[:, None]
    xs = _np.arange(0, w, step)[None, :]
    cm = (ys >= cy0) & (ys < cy1) & (xs >= cx0) & (xs < cx1)
    cmask = _np.broadcast_to(cm, luma.shape)
    ch = t["channel_clip"]
    return (hist, int(luma.size), int(luma.sum()), int((luma * luma).sum()),
            int((luma >= t["clip_luma"]).sum()),
            int(((a[..., 0] >= ch) | (a[..., 1] >= ch) | (a[..., 2] >= ch)).sum()),
            int((luma <= t["crush_luma"]).sum()), float(yl.sum()),
            float(_np.log(yl + 1e-4).sum()), float(yl[cmask].sum()), int(cmask.sum()))


def _percentile(hist, n, q):
    target = q * (n - 1)
    acc = 0
    for v, c in enumerate(hist):
        acc += c
        if acc > target:
            return v
    return 255


def _ev(x):
    return round(math.log(max(x, 1e-6) / MIDDLE_GREY, 2), 3)


def image_checks(path_or_pixels, thresholds=None, use_numpy=True):
    """Objective checks on one frame. Accepts a path or a (w, h, rgb[, alpha]) tuple.

    Returns: width, height, samples, stride; histogram (bins of encoded luma, shares that
    sum to 1); mean, median, std, p01, p99 of luma (0-1); clipped_fraction (luma >= 250),
    any_channel_clipped_fraction (a channel >= 254), crushed_fraction (luma <= 5);
    mean_linear and mean_ev = log2(mean linear luminance / 0.18) of the DISPLAY-referred
    image (0 = average pixel at middle grey after tone mapping; a sanity measure, not scene
    EV100); log_avg_ev (geometric mean, robust to highlights); centre_surround_stops =
    log2(centre / surround mean linear luminance) over the central third; alpha stats
    (Unreal screenshots can carry zero alpha that makes viewers show a transparent or black
    image [added]); flags all_white, all_black, uniform (a flat frame of any colour) and
    blank (any of the three). Thresholds are [added] start values (see DEFAULTS)."""
    t = dict(DEFAULTS, **(thresholds or {}))
    meta = {}
    if isinstance(path_or_pixels, (str, bytes, os.PathLike)):
        w, h, rgb, alpha, meta = load_image(os.fspath(path_or_pixels))
    else:
        w, h, rgb = path_or_pixels[:3]
        alpha = path_or_pixels[3] if len(path_or_pixels) > 3 else None
    step = _grid(w, h, t["max_samples"])
    cw, chh = int(w * t["centre_frac"]), int(h * t["centre_frac"])
    cx0, cy0 = (w - cw) // 2, (h - chh) // 2
    args = (w, h, rgb, step, cx0, cx0 + cw, cy0, cy0 + chh, t)
    if _np is not None and use_numpy:
        hist, n, s1, s2, clipped, chan, crushed, lin_sum, log_sum, c_sum, c_n = _stats_numpy(*args)
        engine = "numpy"
    else:
        hist, n, s1, s2, clipped, chan, crushed, lin_sum, log_sum, c_sum, c_n = _stats_pure(*args)
        engine = "pure"
    mean = s1 / float(n)
    std = math.sqrt(max(0.0, s2 / float(n) - mean * mean)) / 255.0
    bins = int(t["bins"])
    per = 256 // bins
    hbins = [round(sum(hist[i * per:(i + 1) * per]) / float(n), 6) for i in range(bins)]
    mean_lin = lin_sum / n
    s_n = n - c_n
    surround = (lin_sum - c_sum) / s_n if s_n else mean_lin
    centre = c_sum / c_n if c_n else mean_lin
    out = {
        "path": meta.get("path"), "decoder": meta.get("decoder"), "stats_engine": engine,
        "width": w, "height": h, "samples": n, "stride": step,
        "histogram": hbins, "histogram_bins": bins,
        "mean_luma": round(mean / 255.0, 4), "median_luma": round(_percentile(hist, n, 0.5) / 255.0, 4),
        "std_luma": round(std, 4),
        "p01_luma": round(_percentile(hist, n, 0.01) / 255.0, 4),
        "p99_luma": round(_percentile(hist, n, 0.99) / 255.0, 4),
        "clipped_fraction": round(clipped / float(n), 5),
        "any_channel_clipped_fraction": round(chan / float(n), 5),
        "crushed_fraction": round(crushed / float(n), 5),
        "mean_linear": round(mean_lin, 5), "mean_ev": _ev(mean_lin),
        "log_avg_ev": _ev(math.exp(log_sum / n)),
        "centre_mean_linear": round(centre, 5), "surround_mean_linear": round(surround, 5),
        "centre_surround_stops": round(math.log(max(centre, 1e-6) / max(surround, 1e-6), 2), 3),
        "alpha": None,
        "thresholds": t,
    }
    for k in ("nan", "inf", "linear_mean"):
        if k in meta:
            out["exr_" + k] = meta[k]
    if alpha is not None:
        na = len(alpha)
        zero = alpha.count(0) if hasattr(alpha, "count") else sum(1 for v in alpha if v == 0)
        out["alpha"] = {"min": min(alpha), "max": max(alpha),
                        "zero_fraction": round(zero / float(na), 5)}
    out["all_white"] = out["clipped_fraction"] >= t["all_fraction"] or out["p01_luma"] >= 0.96
    out["all_black"] = out["crushed_fraction"] >= t["all_fraction"] or out["p99_luma"] <= 0.03
    out["uniform"] = out["std_luma"] < t["uniform_std"]
    out["blank"] = bool(out["all_white"] or out["all_black"] or out["uniform"])
    return out


def image_verdict(checks, expect="any"):
    """Turn image_checks into 'error:' / 'warn:' / 'info:' lines. expect='night' allows a
    darker frame, 'bright' allows more clipping (snow, overcast sky). Thresholds [added]."""
    c, lines = checks, []
    name = c.get("path") or "image"
    if c["all_white"]:
        lines.append("error: %s is (nearly) all white: blown exposure or a broken material" % name)
    if c["all_black"]:
        lines.append("error: %s is (nearly) all black: no light, wrong camera, or nothing rendered"
                     % name)
    if c["uniform"] and not (c["all_white"] or c["all_black"]):
        lines.append("error: %s is a flat single tone (std %.3f): camera inside geometry, "
                     "missing scene, or placeholder" % (name, c["std_luma"]))
    clip_lim = 0.15 if expect == "bright" else 0.05
    if not c["all_white"] and c["clipped_fraction"] > clip_lim:
        lines.append("warn: %.1f%% of pixels clipped (limit %.0f%%)" % (100 * c["clipped_fraction"],
                                                                      100 * clip_lim))
    crush_lim = 0.6 if expect == "night" else 0.3
    if not c["all_black"] and c["crushed_fraction"] > crush_lim:
        lines.append("warn: %.1f%% of pixels crushed to black (limit %.0f%%)" % (
            100 * c["crushed_fraction"], 100 * crush_lim))
    lo = -4.5 if expect == "night" else -2.5
    hi = 2.5 if expect == "bright" else 1.5
    if not c["blank"] and not (lo <= c["log_avg_ev"] <= hi):
        lines.append("warn: log-average exposure %+.2f EV from middle grey (band %+.1f to %+.1f)"
                     % (c["log_avg_ev"], lo, hi))
    if c.get("exr_nan") or c.get("exr_inf"):
        lines.append("error: EXR has %s NaN and %s inf pixels" % (c.get("exr_nan"), c.get("exr_inf")))
    a = c.get("alpha")
    if a and a["zero_fraction"] > 0.5:
        lines.append("warn: %.0f%% of alpha is 0: an image viewer may show it transparent or "
                     "black; judge the RGB (flatten_alpha) not the preview" % (100 * a["zero_fraction"]))
    lines.append("info: mean luma %.2f, log-avg %+.2f EV, centre vs surround %+.2f stops" % (
        c["mean_luma"], c["log_avg_ev"], c["centre_surround_stops"]))
    return lines


def compare(a, b, diff_threshold=8):
    """Parity between two frames of the same size (before and after a fix): mean and max
    absolute difference (0-1), share of pixels whose luma moved more than diff_threshold
    levels, PSNR in dB."""
    wa, ha, ra = load_image(a)[:3] if isinstance(a, str) else a[:3]
    wb, hb, rb = load_image(b)[:3] if isinstance(b, str) else b[:3]
    if (wa, ha) != (wb, hb):
        raise ValueError("size differs: %dx%d vs %dx%d" % (wa, ha, wb, hb))
    n = wa * ha
    if _np is not None:
        x = _np.frombuffer(bytes(ra), _np.uint8).astype(_np.int32).reshape(n, 3)
        y = _np.frombuffer(bytes(rb), _np.uint8).astype(_np.int32).reshape(n, 3)
        d = _np.abs(x - y)
        k = _np.array(REC709)
        dl = _np.abs((x * k).sum(1) - (y * k).sum(1))
        mad, mx = float(d.mean()), int(d.max())
        changed = float((dl > diff_threshold).mean())
        mse = float((d.astype(_np.float64) ** 2).mean())
    else:
        tot = mx = ch = 0
        sq = 0.0
        for i in range(n):
            o = 3 * i
            dd = [abs(ra[o + k] - rb[o + k]) for k in range(3)]
            tot += sum(dd)
            sq += sum(v * v for v in dd)
            mx = max(mx, max(dd))
            la = sum(REC709[k] * ra[o + k] for k in range(3))
            lb = sum(REC709[k] * rb[o + k] for k in range(3))
            if abs(la - lb) > diff_threshold:
                ch += 1
        mad, changed, mse = tot / (3.0 * n), ch / float(n), sq / (3.0 * n)
    psnr = float("inf") if mse == 0 else 10 * math.log10(255.0 ** 2 / mse)
    return {"mean_abs_diff": round(mad / 255.0, 5), "max_abs_diff": round(mx / 255.0, 4),
            "changed_fraction": round(changed, 5),
            "psnr_db": psnr if psnr == float("inf") else round(psnr, 2)}


def flatten_alpha(path, out_path):
    """Write an opaque copy (alpha dropped) so an image viewer shows the real RGB."""
    w, h, rgb, _a, _m = load_image(path)
    return write_png(out_path, w, h, rgb)


def _resize_nearest(w, h, rgb, tw, th):
    out = bytearray(3 * tw * th)
    for y in range(th):
        sy = min(h - 1, int(y * h / float(th)))
        for x in range(tw):
            sx = min(w - 1, int(x * w / float(tw)))
            s, d = 3 * (sy * w + sx), 3 * (y * tw + x)
            out[d:d + 3] = rgb[s:s + 3]
    return out


def contact_sheet(paths, out_path, cols=3, tile=512, labels=None, bg=(24, 24, 24)):
    """Tile frames into one PNG so a single look covers every camera bookmark. Labels are
    drawn with Pillow when available (the pure fallback writes an unlabelled grid).
    Returns {"path", "tiles", "labelled"}."""
    paths = list(paths)
    if not paths:
        raise ValueError("no images")
    cols = max(1, min(cols, len(paths)))
    rows = (len(paths) + cols - 1) // cols
    if _PIL is not None:
        from PIL import ImageDraw
        tiles = []
        for p in paths:
            im = _PIL.open(p).convert("RGB")
            im.thumbnail((tile, tile))
            tiles.append(im)
        th = max(t.height for t in tiles)
        sheet = _PIL.new("RGB", (cols * tile, rows * (th + (18 if labels else 0))), bg)
        draw = ImageDraw.Draw(sheet)
        for i, im in enumerate(tiles):
            x, y = (i % cols) * tile, (i // cols) * (th + (18 if labels else 0))
            sheet.paste(im, (x + (tile - im.width) // 2, y))
            if labels:
                draw.text((x + 4, y + th + 2), str(labels[i])[:60], fill=(230, 230, 230))
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        sheet.save(out_path)
        return {"path": out_path, "tiles": len(paths), "labelled": bool(labels)}
    imgs = []
    for p in paths:
        w, h, rgb, _a, _m = load_image(p)
        s = min(tile / float(w), tile / float(h), 1.0)
        tw, th = max(1, int(w * s)), max(1, int(h * s))
        imgs.append((tw, th, _resize_nearest(w, h, rgb, tw, th)))
    th_max = max(i[1] for i in imgs)
    W, H = cols * tile, rows * th_max
    canvas = bytearray(bytes(bg) * (W * H))
    for i, (tw, th, rgb) in enumerate(imgs):
        ox, oy = (i % cols) * tile + (tile - tw) // 2, (i // cols) * th_max
        for y in range(th):
            d = 3 * ((oy + y) * W + ox)
            canvas[d:d + 3 * tw] = rgb[3 * y * tw:3 * (y + 1) * tw]
    write_png(out_path, W, H, canvas)
    return {"path": out_path, "tiles": len(paths), "labelled": False}


def review_images(paths, sheet=None, expect="any", labels=None):
    """image_checks + image_verdict for each frame, plus a contact sheet to LOOK at.
    Returns {"frames": [{path, checks, verdict}], "errors": n, "warnings": n, "sheet"}."""
    frames, nerr, nwarn = [], 0, 0
    for p in paths:
        c = image_checks(p)
        v = image_verdict(c, expect)
        nerr += sum(1 for line in v if line.startswith("error:"))
        nwarn += sum(1 for line in v if line.startswith("warn:"))
        frames.append({"path": p, "checks": c, "verdict": v})
    out = {"frames": frames, "errors": nerr, "warnings": nwarn, "sheet": None}
    if sheet:
        out["sheet"] = contact_sheet(paths, sheet, labels=labels or
                                     [os.path.basename(p) for p in paths])["path"]
    return out


def wait_for_file(path, timeout=60.0, stable=0.5, poll=0.25):
    """Agent side: wait until `path` exists and its size stops changing for `stable` s."""
    t0, last, since = time.time(), -1, None
    while time.time() - t0 < timeout:
        if os.path.isfile(path):
            size = os.path.getsize(path)
            if size > 0 and size == last:
                if since and time.time() - since >= stable:
                    return True
            else:
                last, since = size, time.time()
        time.sleep(poll)
    return False


def build_render_command(engine, uproject, map_path, sequence=None, config=None,
                         resolution=(1920, 1080), extra=(), log_path=None):
    """argv for a command-line Movie Render Queue job (mrq-cli doc): `<uproject> <map>
    -game -LevelSequence=<seq> -MoviePipelineConfig=<Primary Config preset>` or, with
    sequence=None, `-MoviePipelineConfig=<saved queue>`. Graph (MRG) jobs go through a
    saved queue whose jobs carry the graph preset [verify]. Pure: tested offline."""
    if not config:
        raise ValueError("config (Primary Config preset or saved queue path) is required")
    cmd = [engine["editor_cmd"], uproject, map_path, "-game"]
    if sequence:
        cmd.append("-LevelSequence=" + sequence)
    cmd.append("-MoviePipelineConfig=" + config)
    cmd += ["-windowed", "-resx=%d" % resolution[0], "-resy=%d" % resolution[1], "-log",
            "-unattended", "-notexturestreaming"]
    if log_path:
        cmd.append("-abslog=" + log_path)
    return cmd + list(extra)


# =========================================================================== in the editor
# Everything below needs a rendering editor (not a commandlet) and is NOT YET RUN IN UNREAL.
def _keepalive():
    """A module that survives toolkit reloads, to hold executors and callbacks."""
    name = "_ue_expert_keepalive"
    mod = sys.modules.get(name)
    if mod is None:
        import types
        mod = types.ModuleType(name)
        mod.refs = []
        sys.modules[name] = mod
    return mod


def _vec(v):
    import unreal
    if isinstance(v, unreal.Vector):
        return v
    return unreal.Vector(float(v[0]), float(v[1]), float(v[2]))


def _rot(r):
    """(pitch, yaw, roll) tuple or dict -> unreal.Rotator by keyword: the positional
    order of unreal.Rotator is roll, pitch, yaw [verify], a classic source of wrong views."""
    import unreal
    if isinstance(r, unreal.Rotator):
        return r
    if isinstance(r, dict):
        return unreal.Rotator(pitch=float(r.get("pitch", 0)), yaw=float(r.get("yaw", 0)),
                              roll=float(r.get("roll", 0)))
    return unreal.Rotator(pitch=float(r[0]), yaw=float(r[1]), roll=float(r[2]))


def set_camera(location, rotation, fov=None):
    """Put the active level viewport camera at location (cm) and rotation (pitch, yaw,
    roll in degrees). fov uses LevelEditorSubsystem.set_level_viewport_fov (5.8, clamped
    5 to 170). Returns what the viewport reports back."""
    import unreal
    ues = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    ues.set_level_viewport_camera_info(_vec(location), _rot(rotation))
    if fov is not None:
        les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        les.set_level_viewport_fov(float(fov))
    loc, rot = ues.get_level_viewport_camera_info()
    return {"location": [loc.x, loc.y, loc.z], "rotation": [rot.pitch, rot.yaw, rot.roll]}


def screenshot(path, width=1920, height=1080, camera=None, delay=0.0, game_view=True,
               hdr=False):
    """Request a high-resolution screenshot of the level viewport (or of `camera`, a
    CameraActor). Returns at once: the file appears after the editor ticks. In a live
    editor, wait with wait_for_file(path) from the agent side; in a latent job,
    `yield from wait_screenshot(req)`.

    Uses AutomationLibrary.take_high_res_screenshot (Epic's Python test sample), falling
    back to the HighResShot console command [verify both on 5.8 Mac]. The viewport EV100
    override bypasses the post process volume, so frames taken with it do not match the
    game view (exposure doc)."""
    import unreal
    import ue_run
    if ue_run.in_commandlet():
        raise RuntimeError("screenshot needs a rendering editor: use the running editor (MCP, "
                           "PythonRemote) or ue_run.run_python(..., mode='latent')")
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = {"path": path, "width": int(width), "height": int(height), "requested": time.time(),
           "task": None, "method": None}
    lib = getattr(unreal, "AutomationLibrary", None)
    if lib is not None and hasattr(lib, "take_high_res_screenshot"):
        kw = {"camera": camera, "capture_hdr": hdr, "delay": float(delay),
              "force_game_view": bool(game_view)}
        try:
            req["task"] = lib.take_high_res_screenshot(int(width), int(height), path, **kw)
        except TypeError:  # keyword names differ on this build
            req["task"] = lib.take_high_res_screenshot(int(width), int(height), path, camera)
        req["method"] = "AutomationLibrary.take_high_res_screenshot"
        _keepalive().refs.append(req["task"])
        return req
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    unreal.SystemLibrary.execute_console_command(
        world, 'HighResShot %dx%d filename="%s"' % (int(width), int(height), path))
    req["method"] = "HighResShot"
    return req


def wait_screenshot(req, timeout=60.0):
    """Generator for latent jobs: yields editor ticks until the screenshot is written.
    Returns the path; raises TimeoutError. Also looks in Saved/Screenshots when the
    engine ignored the absolute path [verify where 5.8 writes it]."""
    t0 = time.time()
    task = req.get("task")
    while time.time() - t0 < timeout:
        done = False
        if task is not None and hasattr(task, "is_task_done"):
            try:
                done = task.is_task_done()
            except Exception:
                done = False
        if os.path.isfile(req["path"]) and os.path.getsize(req["path"]) > 0 and (
                done or task is None):
            return req["path"]
        yield
    found = _recent_saved_screenshot(req["requested"])
    if found:
        return found
    raise TimeoutError("screenshot not written within %ss: %s" % (timeout, req["path"]))


def _recent_saved_screenshot(since):
    try:
        import unreal
        root = os.path.join(unreal.Paths.project_saved_dir(), "Screenshots")
    except Exception:
        return None
    best = None
    for d, _dirs, files in os.walk(root):
        for f in files:
            p = os.path.join(d, f)
            if f.lower().endswith((".png", ".exr")) and os.path.getmtime(p) >= since - 1:
                if best is None or os.path.getmtime(p) > os.path.getmtime(best):
                    best = p
    return best


def screenshot_views(views, out_dir, width=1920, height=1080, settle_ticks=5):
    """Generator for latent jobs: for each view {"name", "location", "rotation"[, "fov"]}
    set the camera, let the frame settle, shoot and wait. Returns the list of paths.
    Fixed bookmarks make iterations comparable (compare()) and reviewable (contact_sheet)."""
    paths = []
    for v in views:
        set_camera(v["location"], v["rotation"], v.get("fov"))
        for _ in range(int(settle_ticks)):
            yield
        req = screenshot(os.path.join(out_dir, "%s.png" % v["name"]), width, height)
        p = yield from wait_screenshot(req)
        paths.append(p)
    return paths


def camera_views_from_actors(tag="AgentView"):
    """Views from CameraActors carrying an actor tag, so bookmarks live in the level."""
    import unreal
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    views = []
    for a in eas.get_all_level_actors():
        if isinstance(a, unreal.CameraActor) and tag in [str(t) for t in a.tags]:
            loc, rot = a.get_actor_location(), a.get_actor_rotation()
            views.append({"name": a.get_actor_label(), "location": [loc.x, loc.y, loc.z],
                          "rotation": [rot.pitch, rot.yaw, rot.roll]})
    return views


def _temp_still_sequence(camera, folder="/Game/_Agent/Temp"):
    """One-frame Level Sequence with a camera cut to `camera` (created by us, left in
    place as evidence: never deleted) [verify every call on 5.8]."""
    import unreal
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    name = "LS_AgentStill_%s" % time.strftime("%Y%m%d_%H%M%S")
    seq = tools.create_asset(name, folder, unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
    seq.set_playback_start(0)
    seq.set_playback_end(1)  # end frame is exclusive: 0..1 renders frame 0
    binding = seq.add_possessable(camera)
    cut = seq.add_track(unreal.MovieSceneCameraCutTrack).add_section()
    cut.set_range(0, 1)
    try:
        bid = seq.get_portable_binding_id(seq, binding)
    except Exception:
        bid = seq.get_binding_id(binding)
    cut.set_camera_binding_id(bid)
    unreal.get_editor_subsystem(unreal.EditorAssetSubsystem).save_loaded_asset(seq)
    return seq


def render_still(level_sequence_or_camera, out_dir, preset=None, frame=0, resolution=None,
                 map_path=None):
    """Render one frame through Movie Render Graph (preset = MovieGraphConfig) or a legacy
    Movie Render Queue preset (MoviePipelinePrimaryConfig), with the PIE executor.
    Asynchronous: returns {"started", "done_file", ...}; the executor callback writes
    <out_dir>/render_done.json. Agent side: wait_for_file(done_file); latent job:
    `yield from wait_render(r)`.

    Uses its own transient queue so the user's queued jobs are never touched [verify that
    executor.execute(queue) accepts a queue the subsystem does not own]. For graph jobs
    the output folder and frame range come from the graph: expose them as graph variables
    (OutputDirectory, CustomStartFrame, CustomEndFrame) and render_still sets them when
    present [verify API]. MRG is Production Ready in 5.8; new features are graph-only.
    NOT YET RUN IN UNREAL."""
    import unreal
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    done_file = os.path.join(out_dir, "render_done.json")
    info = {"started": False, "out_dir": out_dir, "done_file": done_file,
            "temp_sequence": None}
    target = level_sequence_or_camera
    if isinstance(target, str):
        target = unreal.load_asset(target)
    if isinstance(target, unreal.CameraActor):
        target = _temp_still_sequence(target)
        info["temp_sequence"] = target.get_path_name()
    if not isinstance(target, unreal.LevelSequence):
        raise TypeError("expected a LevelSequence, its path, or a CameraActor")
    if map_path is None:
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
        map_path = world.get_outer().get_path_name()
    if isinstance(preset, str):
        preset = unreal.load_asset(preset)
    queue = unreal.new_object(unreal.MoviePipelineQueue)
    job = queue.allocate_new_job(unreal.MoviePipelineExecutorJob)
    job.sequence = unreal.SoftObjectPath(target.get_path_name())
    job.map = unreal.SoftObjectPath(map_path)
    graph_cls = getattr(unreal, "MovieGraphConfig", None)
    if graph_cls is not None and isinstance(preset, graph_cls):
        job.set_graph_preset(preset)
        overrides = None
        try:
            overrides = job.get_or_create_variable_overrides(preset)
        except Exception:
            pass
        info["graph_variables_set"] = _set_graph_vars(overrides, {
            "OutputDirectory": out_dir, "CustomStartFrame": frame, "CustomEndFrame": frame + 1})
        info["mode"] = "graph"
    else:
        if preset is not None:
            job.set_configuration(preset)
        cfg = job.get_configuration()
        out = cfg.find_or_add_setting_by_class(unreal.MoviePipelineOutputSetting)
        out.output_directory = unreal.DirectoryPath(out_dir)
        out.use_custom_playback_range = True
        out.custom_start_frame = int(frame)
        out.custom_end_frame = int(frame) + 1
        if resolution:
            out.output_resolution = unreal.IntPoint(int(resolution[0]), int(resolution[1]))
        info["mode"] = "legacy"
    executor = unreal.MoviePipelinePIEExecutor()

    def _finished(executor_obj, success):
        files = sorted(os.path.join(d, f) for d, _s, fs in os.walk(out_dir) for f in fs
                       if f != "render_done.json")
        with open(done_file, "w", encoding="utf-8") as fh:
            json.dump({"success": bool(success), "files": files, "finished": time.time()}, fh,
                      indent=2)

    executor.on_executor_finished_delegate.add_callable_unique(_finished)
    _keepalive().refs.extend([executor, queue, _finished])
    executor.execute(queue)
    info["started"] = True
    info["sequence"] = target.get_path_name()
    info["map"] = map_path
    return info


def _set_graph_vars(overrides, values):
    """Best effort: set exposed graph variables by name on job overrides [verify API]."""
    done = []
    if overrides is None:
        return done
    for name, value in values.items():
        try:
            var = overrides.get_variable_assignment_for_graph_variable(name)
        except Exception:
            var = None
        if var is None:
            continue
        try:
            overrides.set_variable_assignment_enable_state(var, True)
            if isinstance(value, str):
                overrides.set_value_string(var, value)
            else:
                overrides.set_value_int32(var, int(value))
            done.append(name)
        except Exception:
            continue
    return done


def wait_render(info, timeout=3600.0):
    """Generator for latent jobs: yields until render_done.json exists; returns its data."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        if os.path.isfile(info["done_file"]):
            with open(info["done_file"], "r", encoding="utf-8") as f:
                return json.load(f)
        yield 1.0
    raise TimeoutError("render not finished within %ss" % timeout)
