#!/usr/bin/env python3
"""gd_review: offline checks on PNGs captured from Godot (agent_capture.gd).

System python3. Uses Pillow when installed; otherwise a pure-Python PNG reader (8-bit, non-interlaced,
which is what Godot's Image.save_png writes) so the checks still run. contact_sheet needs Pillow or
ImageMagick (`montage`).

    image_checks(path, sample=256) -> dict
    compare(a, b, sample=256) -> dict
    contact_sheet(paths, out, cols=4, thumb=400, labels=True) -> str
    godot3_flags(root, exts=(".gd", ".gdshader", ".shader"), skip=("addons/",)) -> list[dict]

image_checks keys: width, height, mean_luma (0..1), std_luma, clipped (fraction > 0.98), crushed
(fraction < 0.02), centre_luma, surround_luma, centre_contrast (|centre - surround|), unique_colors
(on the sample), alpha_mean, flags (all_black, all_white, uniform, mostly_clipped, mostly_crushed,
transparent, low_contrast_centre), histogram (16 luma bins).
Thresholds are [added] defaults, tuned to catch an empty or broken render, not to judge art.
"""
from __future__ import annotations

__version__ = "0.1"

import math
import shutil
import struct
import subprocess
import zlib
from pathlib import Path

try:
    from PIL import Image, ImageDraw  # type: ignore
    HAVE_PIL = True
except Exception:  # pragma: no cover
    HAVE_PIL = False


# ---------------------------------------------------------------- pure-Python PNG reader

def _read_png(path) -> tuple[int, int, int, list[bytes]]:
    """Return (width, height, channels, rows) for an 8-bit non-interlaced PNG (gray, GA, RGB, RGBA, palette)."""
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")
    pos, idat, plte = 8, b"", None
    w = h = depth = ctype = interlace = 0
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if typ == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
        elif typ == b"PLTE":
            plte = body
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
    if depth != 8 or interlace:
        raise ValueError("only 8-bit non-interlaced PNG supported without Pillow")
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(idat)
    stride = w * ch
    rows, prev = [], bytearray(stride)
    i = 0
    for _ in range(h):
        f = raw[i]
        line = bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        if f == 1:
            for x in range(ch, stride):
                line[x] = (line[x] + line[x - ch]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - ch] if x >= ch else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - ch] if x >= ch else 0
                b = prev[x]
                c = prev[x - ch] if x >= ch else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        rows.append(bytes(line))
        prev = line
    if ctype == 3 and plte:
        pal = [plte[j:j + 3] for j in range(0, len(plte), 3)]
        rows = [b"".join(pal[v] for v in r) for r in rows]
        ch = 3
    return w, h, ch, rows


def _samples(path, sample: int):
    """Yield (r, g, b, a) floats 0..1 on a grid of at most sample x sample, plus (w, h, grid_w, grid_h)."""
    if HAVE_PIL:
        im = Image.open(path).convert("RGBA")
        w, h = im.size
        gw, gh = min(sample, w), min(sample, h)
        small = im.resize((gw, gh), Image.BILINEAR) if (gw, gh) != (w, h) else im
        px = list(small.get_flattened_data() if hasattr(small, "get_flattened_data") else small.getdata())
        return w, h, gw, gh, [(p[0] / 255.0, p[1] / 255.0, p[2] / 255.0, p[3] / 255.0) for p in px]
    w, h, ch, rows = _read_png(path)
    gw, gh = min(sample, w), min(sample, h)
    out = []
    for gy in range(gh):
        row = rows[min(h - 1, int((gy + 0.5) * h / gh))]
        for gx in range(gw):
            x = min(w - 1, int((gx + 0.5) * w / gw)) * ch
            if ch == 1:
                v = row[x] / 255.0
                out.append((v, v, v, 1.0))
            elif ch == 2:
                v = row[x] / 255.0
                out.append((v, v, v, row[x + 1] / 255.0))
            elif ch == 3:
                out.append((row[x] / 255.0, row[x + 1] / 255.0, row[x + 2] / 255.0, 1.0))
            else:
                out.append((row[x] / 255.0, row[x + 1] / 255.0, row[x + 2] / 255.0, row[x + 3] / 255.0))
    return w, h, gw, gh, out


def _luma(p) -> float:
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]


def image_checks(path, sample: int = 256) -> dict:
    """Numbers and flags that catch broken renders: black, white, uniform, clipped, crushed, empty centre."""
    w, h, gw, gh, px = _samples(path, sample)
    lum = [_luma(p) for p in px]
    n = len(lum)
    mean = sum(lum) / n
    std = math.sqrt(sum((v - mean) ** 2 for v in lum) / n)
    clipped = sum(1 for v in lum if v > 0.98) / n
    crushed = sum(1 for v in lum if v < 0.02) / n
    cx0, cx1, cy0, cy1 = gw // 4, gw - gw // 4, gh // 4, gh - gh // 4
    centre, surround = [], []
    for y in range(gh):
        for x in range(gw):
            (centre if (cx0 <= x < cx1 and cy0 <= y < cy1) else surround).append(lum[y * gw + x])
    cm = sum(centre) / max(1, len(centre))
    sm = sum(surround) / max(1, len(surround))
    uniq = len({(int(p[0] * 63), int(p[1] * 63), int(p[2] * 63)) for p in px})
    alpha = sum(p[3] for p in px) / n
    hist = [0] * 16
    for v in lum:
        hist[min(15, int(v * 16))] += 1
    flags = []
    if mean < 0.02 and std < 0.01:
        flags.append("all_black")
    if mean > 0.98 and std < 0.01:
        flags.append("all_white")
    if std < 0.005 or uniq <= 1:
        flags.append("uniform")
    if clipped > 0.25:
        flags.append("mostly_clipped")
    if crushed > 0.5:
        flags.append("mostly_crushed")
    if alpha < 0.05:
        flags.append("transparent")
    if abs(cm - sm) < 0.01 and std < 0.03:
        flags.append("low_contrast_centre")
    return {"path": str(path), "width": w, "height": h, "mean_luma": round(mean, 4), "std_luma": round(std, 4),
            "clipped": round(clipped, 4), "crushed": round(crushed, 4), "centre_luma": round(cm, 4),
            "surround_luma": round(sm, 4), "centre_contrast": round(abs(cm - sm), 4), "unique_colors": uniq,
            "alpha_mean": round(alpha, 4), "histogram": [round(c / n, 4) for c in hist], "flags": flags,
            "ok": not any(f in flags for f in ("all_black", "all_white", "uniform", "transparent"))}


def compare(a, b, sample: int = 256) -> dict:
    """Mean absolute difference (0..1) and changed-pixel fraction (> 0.1) between two images on a grid.

    Use it to prove an edit changed the render (or that a refactor did not)."""
    _, _, gwa, gha, pa = _samples(a, sample)
    _, _, gwb, ghb, pb = _samples(b, sample)
    if (gwa, gha) != (gwb, ghb):
        n = min(len(pa), len(pb))
        pa, pb = pa[:n], pb[:n]
    diffs = [abs(_luma(x) - _luma(y)) for x, y in zip(pa, pb)]
    cdiff = [max(abs(x[i] - y[i]) for i in range(3)) for x, y in zip(pa, pb)]
    n = max(1, len(diffs))
    return {"a": str(a), "b": str(b), "mean_abs_luma_diff": round(sum(diffs) / n, 4),
            "changed_fraction": round(sum(1 for d in cdiff if d > 0.1) / n, 4),
            "max_channel_diff": round(max(cdiff) if cdiff else 0.0, 4),
            "identical": all(d < 1e-6 for d in cdiff)}


def contact_sheet(paths, out, cols: int = 4, thumb: int = 400, labels: bool = True) -> str:
    """One PNG grid of thumbnails (read this instead of many images). Pillow, else ImageMagick montage."""
    paths = [str(p) for p in paths]
    out = str(out)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    if HAVE_PIL:
        ims = [Image.open(p).convert("RGB") for p in paths]
        th = []
        for im in ims:
            s = thumb / max(im.size)
            th.append(im.resize((max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s))), Image.BILINEAR))
        cw = max(t.size[0] for t in th)
        chh = max(t.size[1] for t in th) + (16 if labels else 0)
        rows = math.ceil(len(th) / cols)
        sheet = Image.new("RGB", (cw * min(cols, len(th)), chh * rows), (24, 24, 24))
        d = ImageDraw.Draw(sheet)
        for i, (t, p) in enumerate(zip(th, paths)):
            x, y = (i % cols) * cw, (i // cols) * chh
            sheet.paste(t, (x, y))
            if labels:
                d.text((x + 4, y + t.size[1] + 2), Path(p).name[:48], fill=(220, 220, 220))
        sheet.save(out)
        return out
    mont = shutil.which("montage")
    if mont:
        cmd = [mont, *paths, "-tile", f"{cols}x", "-geometry", f"{thumb}x{thumb}+4+4", "-background", "#181818"]
        if labels:
            cmd[1:1] = ["-label", "%f"]
        subprocess.run(cmd + [out], check=True, capture_output=True)
        return out
    raise RuntimeError("contact_sheet needs Pillow (pip install pillow) or ImageMagick montage")


# ---------------------------------------------------------------- code review: Godot 3 and early 4.x habits

# (regex, what it is, 4.7.2 replacement). From sources/godot-version-deltas.md sections 2, 20 and 21
# (each row verified absent or deprecated in 4.7.2 there). Comments (# ...) are skipped.
GODOT3_PATTERNS = [
    (r"\bKinematicBody(2D)?\b", "KinematicBody", "CharacterBody2D / CharacterBody3D, velocity + move_and_slide()"),
    (r"^\s*export\s*(\(|var\b)", "export var", "@export"),
    (r"^\s*onready\s+var\b", "onready var", "@onready var"),
    (r"^\s*tool\s*$", "tool", "@tool"),
    (r"\byield\s*\(", "yield()", "await signal"),
    (r"\bsetget\b", "setget", "var x: T: set = _set_x"),
    (r"\.connect\(\s*\"[^\"]+\"\s*,\s*self\b", "connect(\"sig\", self, \"m\")", "sig.connect(m)"),
    (r"\.instance\(\s*\)", ".instance()", ".instantiate()"),
    (r"\binterpolate_property\b", "Tween.interpolate_property", "create_tween().tween_property()"),
    (r"\bset_shader_param\b|\bget_shader_param\b", "set_shader_param", "set_shader_parameter / get_shader_parameter"),
    (r"\brect_(size|position|min_size|scale|rotation|global_position)\b", "rect_*", "size, position, custom_minimum_size, scale, rotation"),
    (r"\bOS\.(window_\w+|get_screen_size|get_ticks_msec|get_ticks_usec)\b", "OS window/time", "DisplayServer.window_*, screen_get_size, Time.get_ticks_*"),
    (r"\bextends\s+(Spatial|Sprite|Position2D|Position3D|YSort|Navigation2D|Navigation|Particles2D|Particles)\s*$", "Godot 3 base class",
     "Node3D, Sprite2D, Marker2D/3D, y_sort_enabled, NavigationRegion, GPUParticles2D/3D"),
    (r"\b(File|Directory)\.new\(\)", "File/Directory.new()", "FileAccess.open() / DirAccess.open()"),
    (r"\bfuncref\(", "funcref()", "Callable"),
    (r"\bPool(Byte|Int|Real|String|Vector2|Vector3|Color)Array\b", "Pool*Array", "Packed*Array"),
    (r"\bset_cellv\b|\.set_cell\(\s*\d+\s*,", "TileMap layer API", "one TileMapLayer per layer: set_cell(coords, source_id, atlas)"),
    (r"\bchange_scene\(", "change_scene()", "change_scene_to_file() / change_scene_to_packed()"),
    (r"\bget_editor_interface\(\)", "get_editor_interface()", "EditorInterface singleton"),
    (r"\badd_control_to_(dock|bottom_panel)\b", "add_control_to_dock", "add_dock(EditorDock)"),
    (r"\bset_collision_(mask|layer)_bit\b", "collision *_bit (0-based)", "set_collision_mask_value(n, true) (1-based)"),
    (r"\bhint_(albedo|color)\b", "shader hint_albedo/hint_color", "source_color"),
    (r"\bSCREEN_TEXTURE\b|\bDEPTH_TEXTURE\b", "SCREEN_TEXTURE", "uniform sampler2D tex : hint_screen_texture"),
    (r"\b(WORLD_MATRIX|CAMERA_MATRIX|NORMALMAP)\b", "Godot 3 shader built-in", "MODEL_MATRIX, INV_VIEW_MATRIX, NORMAL_MAP"),
]


def godot3_flags(root, exts=(".gd", ".gdshader", ".shader"), skip=("addons/",)) -> list[dict]:
    """Scan GDScript and shader files (a file or a folder) for Godot 3 and early 4.x names.

    Returns [{file, line, found, fix, text}]. A hit is a lead to check, not proof: run the code."""
    import re
    rootp = Path(root)
    files = [rootp] if rootp.is_file() else [f for f in sorted(rootp.rglob("*")) if f.suffix in exts
                                            and not any(s in f.relative_to(rootp).as_posix() for s in skip)
                                            and ".godot/" not in f.as_posix()]
    out = []
    compiled = [(re.compile(rx), what, fix) for rx, what, fix in GODOT3_PATTERNS]
    for f in files:
        if f.suffix == ".shader":
            out.append({"file": str(f), "line": 0, "found": ".shader file", "fix": "rename to .gdshader", "text": ""})
        try:
            lines = f.read_text(errors="replace").splitlines()
        except OSError:
            continue
        for i, line in enumerate(lines, 1):
            code = line.split("#", 1)[0] if f.suffix == ".gd" else line.split("//", 1)[0]
            for rx, what, fix in compiled:
                if rx.search(code):
                    out.append({"file": str(f), "line": i, "found": what, "fix": fix, "text": line.strip()[:120]})
    return out


if __name__ == "__main__":
    import json
    import sys
    for p in sys.argv[1:]:
        if Path(p).is_dir() or p.endswith((".gd", ".gdshader", ".shader")):
            print(json.dumps(godot3_flags(p), indent=1))
        else:
            print(json.dumps(image_checks(p)))
