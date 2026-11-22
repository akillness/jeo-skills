"""
ut_review: judge a frame by numbers before (and while) looking at it.

Shared toolkit of the scenario-unity-* skills (lead: scenario-unity-expert). System python3 3.9+; uses Pillow and
numpy when present, pure Python otherwise (PNG only). No Unity call: runs on the PNG files that
AgentKit.AgentCapture writes. Offline tests: tests/code/unity-expert/test_offline.py; live use on
real captures: tests/code/unity-expert/test_live_toolkit.py (run 2026-09-24).

Why: an agent's own look at a frame is not enough. Epic's lighting agent approved an all-white
frame (scenario-unreal-expert sources); on this Mac the first frame a fresh Unity editor renders shows
every material flat white (observed 2026-09-24, AgentCapture renders a warm-up frame). A pink
(magenta) frame means a missing or unsupported shader, for example the Built-in Standard shader
in a URP project.

    import ut_review
    c = ut_review.image_checks("/abs/Front.png")   # histogram, clipped, crushed, EV-like, contrast,
                                                  # all_white / all_black / uniform / magenta flags
    ut_review.image_verdict(c)                     # ['error: ...', 'warn: ...', 'info: ...']
    ut_review.compare(before, after)               # parity after a performance fix
    ut_review.contact_sheet(paths, "/abs/sheet.png", labels=[...])
    ut_review.review_capture(envelope, sheet=...)  # every shot of an AgentCapture job in one call
"""

__version__ = "0.1"  # Unity Expert Skills v0.1 (2026-09-24)

import math
import os
import struct
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
    # [added] start values for a display-referred (tone-mapped, sRGB) capture.
    "clip_luma": 250,          # luma >= this counts as clipped (0-255)
    "channel_clip": 254,       # any channel >= this counts as channel-clipped
    "crush_luma": 5,           # luma <= this counts as crushed
    "all_fraction": 0.98,      # >= this share clipped / crushed sets all_white / all_black
    "uniform_std": 0.01,       # luma standard deviation (0-1) below this: a flat frame
    "centre_frac": 1.0 / 3.0,  # centre window, share of width and height
    "max_samples": 400000,     # pixels sampled on a regular grid
    "bins": 16,
    "magenta_limit": 0.002,    # share of error-shader pink pixels that fails a frame
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
    8 and 16-bit gray, RGB, palette, gray+alpha, RGBA; interlaced files need Pillow."""
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
    if bd < 8:
        raise NotImplementedError("PNG bit depth %d: install Pillow" % bd)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    step = bd // 8
    stride = w * ch * step
    bpp = ch * step
    px = _unfilter(zlib.decompress(b"".join(idat)), h, stride, bpp)
    n = w * h
    rgb = bytearray(3 * n)
    alpha = None
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


def encode_png(w, h, rgb, alpha=None):
    """Pure-Python 8-bit PNG encoder (filter 0), used by tests and the pure contact sheet."""
    ch = 3 + (1 if alpha is not None else 0)
    rows = []
    for y in range(h):
        if alpha is None:
            rows.append(b"\x00" + bytes(rgb[3 * y * w:3 * (y + 1) * w]))
        else:
            line = bytearray(4 * w)
            for x in range(w):
                i = y * w + x
                line[4 * x:4 * x + 3] = rgb[3 * i:3 * i + 3]
                line[4 * x + 3] = alpha[i]
            rows.append(b"\x00" + bytes(line))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6 if ch == 4 else 2, 0, 0, 0)
    return _PNG_SIG + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"".join(rows), 6)) + chunk(b"IEND", b"")


def write_png(path, w, h, rgb, alpha=None):
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    with open(path, "wb") as f:
        f.write(encode_png(w, h, rgb, alpha))
    return path


def load_image(path, prefer_pil=True):
    """-> (w, h, rgb bytearray, alpha or None, meta). PNG through Pillow or the pure decoder;
    JPEG and others need Pillow."""
    ext = os.path.splitext(path)[1].lower()
    meta = {"path": path, "format": ext.lstrip("."), "decoder": None}
    if _PIL is not None and prefer_pil:
        im = _PIL.open(path)
        im.load()
        meta["decoder"] = "pillow"
        alpha = None
        if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
            rgba = im.convert("RGBA")
            alpha = bytearray(rgba.getchannel("A").tobytes())
            rgb = bytearray(rgba.convert("RGB").tobytes())
        elif im.mode.startswith("I"):
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
        raise RuntimeError("%s needs Pillow; PNG works without it" % ext)
    with open(path, "rb") as f:
        w, h, rgb, alpha = decode_png(f.read())
    meta["decoder"] = "pure"
    return w, h, rgb, alpha, meta


# =========================================================================== checks
def _is_magenta(r, g, b):
    return r >= 200 and b >= 200 and g <= 70


def _stats_pure(w, h, rgb, step, cx0, cx1, cy0, cy1, t):
    hist = [0] * 256
    n = s1 = s2 = 0
    clipped = chan = crushed = magenta = 0
    lin_sum = log_sum = sat = 0.0
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
            if _is_magenta(r, g, b):
                magenta += 1
            mx_, mn_ = max(r, g, b), min(r, g, b)
            if mx_:
                sat += (mx_ - mn_) / float(mx_)
            yl = kr * lin[r] + kg * lin[g] + kb * lin[b]
            lin_sum += yl
            log_sum += math.log(yl + 1e-4)
            if in_y and cx0 <= x < cx1:
                c_sum += yl
                c_n += 1
    return hist, n, s1, s2, clipped, chan, crushed, magenta, lin_sum, log_sum, c_sum, c_n, sat


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
    mag = (a[..., 0] >= 200) & (a[..., 2] >= 200) & (a[..., 1] <= 70)
    mx = a.max(axis=2).astype(_np.float64)
    mn = a.min(axis=2).astype(_np.float64)
    sat = float(_np.where(mx > 0, (mx - mn) / _np.maximum(mx, 1), 0).sum())
    return (hist, int(luma.size), int(luma.sum()), int((luma * luma).sum()),
            int((luma >= t["clip_luma"]).sum()),
            int(((a[..., 0] >= ch) | (a[..., 1] >= ch) | (a[..., 2] >= ch)).sum()),
            int((luma <= t["crush_luma"]).sum()), int(mag.sum()), float(yl.sum()),
            float(_np.log(yl + 1e-4).sum()), float(yl[cmask].sum()), int(cmask.sum()), sat)


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
    """Objective checks on one frame (path or (w, h, rgb[, alpha]) tuple).

    Returns width, height, samples; histogram (16 bins of encoded luma, shares); mean, median,
    std, p01, p99 of luma (0-1); clipped_fraction (luma >= 250), any_channel_clipped_fraction,
    crushed_fraction (luma <= 5); mean_saturation (HSV S, 0-1: grey blockouts are legitimately
    low, a sudden drop between iterations is not); magenta_fraction (error-shader pink: R and B >= 200, G <= 70);
    mean_linear and mean_ev = log2(mean linear luminance / 0.18) of the DISPLAY-referred image
    (an EV-like sanity value, not scene EV100); log_avg_ev (geometric mean);
    centre_surround_stops = log2(centre / surround mean linear luminance) over the central third;
    alpha stats; flags all_white, all_black, uniform, magenta and blank (any of the first three).
    Thresholds are [added] start values (DEFAULTS)."""
    t = dict(DEFAULTS, **(thresholds or {}))
    meta = {}
    if isinstance(path_or_pixels, (str, bytes, os.PathLike)):
        w, h, rgb, alpha, meta = load_image(os.fspath(path_or_pixels))
    else:
        w, h, rgb = path_or_pixels[:3]
        alpha = path_or_pixels[3] if len(path_or_pixels) > 3 else None
    step = max(1, int(math.ceil(math.sqrt(float(w * h) / t["max_samples"]))))
    cw, chh = int(w * t["centre_frac"]), int(h * t["centre_frac"])
    cx0, cy0 = (w - cw) // 2, (h - chh) // 2
    args = (w, h, rgb, step, cx0, cx0 + cw, cy0, cy0 + chh, t)
    if _np is not None and use_numpy:
        stats = _stats_numpy(*args)
        engine = "numpy"
    else:
        stats = _stats_pure(*args)
        engine = "pure"
    hist, n, s1, s2, clipped, chan, crushed, magenta, lin_sum, log_sum, c_sum, c_n, sat = stats
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
        "magenta_fraction": round(magenta / float(n), 5),
        "mean_saturation": round(sat / float(n), 4),
        "mean_linear": round(mean_lin, 5), "mean_ev": _ev(mean_lin),
        "log_avg_ev": _ev(math.exp(log_sum / n)),
        "centre_mean_linear": round(centre, 5), "surround_mean_linear": round(surround, 5),
        "centre_surround_stops": round(math.log(max(centre, 1e-6) / max(surround, 1e-6), 2), 3),
        "alpha": None,
        "thresholds": t,
    }
    if alpha is not None:
        na = len(alpha)
        zero = alpha.count(0) if hasattr(alpha, "count") else sum(1 for v in alpha if v == 0)
        out["alpha"] = {"min": min(alpha), "max": max(alpha), "zero_fraction": round(zero / float(na), 5)}
    out["all_white"] = out["clipped_fraction"] >= t["all_fraction"] or out["p01_luma"] >= 0.96
    out["all_black"] = out["crushed_fraction"] >= t["all_fraction"] or out["p99_luma"] <= 0.03
    out["uniform"] = out["std_luma"] < t["uniform_std"]
    out["magenta"] = out["magenta_fraction"] > t["magenta_limit"]
    out["blank"] = bool(out["all_white"] or out["all_black"] or out["uniform"])
    return out


def image_verdict(checks, expect="any"):
    """image_checks -> 'error:' / 'warn:' / 'info:' lines. expect='night' allows a darker frame,
    'bright' more clipping (snow, overcast sky). Thresholds [added]."""
    c, lines = checks, []
    name = c.get("path") or "image"
    if c["all_white"]:
        lines.append("error: %s is (nearly) all white: blown exposure, a first-frame artefact, or a broken material" % name)
    if c["all_black"]:
        lines.append("error: %s is (nearly) all black: no light, wrong camera or culling mask, nothing rendered, or -nographics" % name)
    if c["uniform"] and not (c["all_white"] or c["all_black"]):
        lines.append("error: %s is a flat single tone (std %.3f): camera inside geometry, empty scene, or placeholder" % (name, c["std_luma"]))
    if c.get("magenta"):
        lines.append("error: %.2f%% magenta pixels: missing or unsupported shader (Built-in Standard in URP? "
                     "stripped variant? shader compile error)" % (100 * c["magenta_fraction"]))
    clip_lim = 0.15 if expect == "bright" else 0.05
    if not c["all_white"] and c["clipped_fraction"] > clip_lim:
        lines.append("warn: %.1f%% of pixels clipped (limit %.0f%%)" % (100 * c["clipped_fraction"], 100 * clip_lim))
    crush_lim = 0.6 if expect == "night" else 0.3
    if not c["all_black"] and c["crushed_fraction"] > crush_lim:
        lines.append("warn: %.1f%% of pixels crushed to black (limit %.0f%%)" % (100 * c["crushed_fraction"], 100 * crush_lim))
    lo = -4.5 if expect == "night" else -2.5
    hi = 2.5 if expect == "bright" else 1.5
    if not c["blank"] and not (lo <= c["log_avg_ev"] <= hi):
        lines.append("warn: log-average exposure %+.2f EV from middle grey (band %+.1f to %+.1f)" % (c["log_avg_ev"], lo, hi))
    a = c.get("alpha")
    if a and a["zero_fraction"] > 0.5:
        lines.append("warn: %.0f%% of alpha is 0: a viewer may show it transparent; judge the RGB" % (100 * a["zero_fraction"]))
    lines.append("info: mean luma %.2f, log-avg %+.2f EV, centre vs surround %+.2f stops, std %.3f, "
                 "saturation %.3f (compare with the previous iteration: a sudden drop means lost "
                 "materials or colour)" % (c["mean_luma"], c["log_avg_ev"], c["centre_surround_stops"],
                                           c["std_luma"], c.get("mean_saturation", 0)))
    return lines


def compare(a, b, diff_threshold=8):
    """Parity between two frames of the same size (before and after a fix): mean and max absolute
    difference (0-1), share of pixels whose luma moved more than diff_threshold levels, PSNR dB."""
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
            "psnr_db": psnr if psnr == float("inf") else round(psnr, 2),
            "identical": mse == 0}


def _resize_nearest(w, h, rgb, tw, th):
    out = bytearray(3 * tw * th)
    for y in range(th):
        sy = min(h - 1, int(y * h / float(th)))
        for x in range(tw):
            sx = min(w - 1, int(x * w / float(tw)))
            s, d = 3 * (sy * w + sx), 3 * (y * tw + x)
            out[d:d + 3] = rgb[s:s + 3]
    return out


def contact_sheet(paths, out, cols=3, tile=512, labels=None, bg=(24, 24, 24)):
    """Tile frames into one PNG so one look covers every bookmark. Labels need Pillow.
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
        th = max(t_.height for t_ in tiles)
        lab = 18 if labels else 0
        sheet = _PIL.new("RGB", (cols * tile, rows * (th + lab)), bg)
        draw = ImageDraw.Draw(sheet)
        for i, im in enumerate(tiles):
            x, y = (i % cols) * tile, (i // cols) * (th + lab)
            sheet.paste(im, (x + (tile - im.width) // 2, y))
            if labels:
                draw.text((x + 4, y + th + 2), str(labels[i])[:60], fill=(230, 230, 230))
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        sheet.save(out)
        return {"path": out, "tiles": len(paths), "labelled": bool(labels)}
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
    write_png(out, W, H, canvas)
    return {"path": out, "tiles": len(paths), "labelled": False}


def review_images(paths, sheet=None, expect="any", labels=None):
    """image_checks + image_verdict per frame, plus a contact sheet to LOOK at.
    Returns {"frames": [{path, checks, verdict}], "errors", "warnings", "sheet", "ok"}."""
    frames, nerr, nwarn = [], 0, 0
    for p in paths:
        c = image_checks(p)
        v = image_verdict(c, expect)
        nerr += sum(1 for line in v if line.startswith("error:"))
        nwarn += sum(1 for line in v if line.startswith("warn:"))
        frames.append({"path": p, "checks": c, "verdict": v})
    out = {"frames": frames, "errors": nerr, "warnings": nwarn, "sheet": None, "ok": nerr == 0}
    if sheet:
        out["sheet"] = contact_sheet(paths, sheet, labels=labels or [os.path.basename(p) for p in paths])["path"]
    return out


def review_capture(envelope, sheet=None, expect="any"):
    """Run review_images on every shot of an AgentKit.AgentCapture job envelope (ut_run result).
    The contact sheet defaults to <out_dir>/contact_sheet.png."""
    res = envelope.get("result") or {}
    shots = res.get("shots") or ([res] if res.get("path") else [])
    paths = [s["path"] for s in shots if s.get("path")]
    if not paths:
        return {"frames": [], "errors": 1, "warnings": 0, "sheet": None, "ok": False,
                "error": "no shots in envelope (ok=%s, error=%s)" % (envelope.get("ok"), envelope.get("error"))}
    if sheet is None and res.get("out_dir"):
        sheet = os.path.join(res["out_dir"], "contact_sheet.png")
    labels = [s.get("name") or os.path.basename(s["path"]) for s in shots if s.get("path")]
    return review_images(paths, sheet=sheet, expect=expect, labels=labels)


def wait_for_file(path, timeout=60.0, stable=0.5, poll=0.25):
    """Wait until `path` exists and its size stops changing for `stable` seconds."""
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


if __name__ == "__main__":
    import json
    import sys
    r = review_images(sys.argv[1:])
    for f in r["frames"]:
        print(f["path"])
        for line in f["verdict"]:
            print("  " + line)
    print(json.dumps({"errors": r["errors"], "warnings": r["warnings"]}))
