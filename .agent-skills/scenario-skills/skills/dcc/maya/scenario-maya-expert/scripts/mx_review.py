"""
mx_review: the renders an agent looks at instead of orbiting a viewport (Maya 2027, Arnold).

STATUS: not yet run in Maya (written 2026-09-24). The Arnold and cmds calls are unverified;
the image code (PNG read/write, labels, contact sheet) and the camera math are pure Python
and were run offline (tests/code/maya-expert/test_mx_review_offline.py).

Experts judge a model by turning it: silhouette first, then big forms, then edge flow.
review() renders those passes from fixed cameras into ONE labelled contact sheet (rows =
modes, columns = views) that the agent opens with its image reader, plus every tile at full
resolution for close inspection.

  import sys; sys.path.insert(0, "<skill>/scripts"); import mx_review
  r = mx_review.review(["crate_geo"], "/abs/out/review")                 # all defaults
  r["sheet"], r["tiles"]["clay"]["front"], r["notes"]
  mx_review.review(["head_geo"], out, views=("front", "side"), modes=("clay", "wire"),
                   focus=((0, 160, 8), 6))     # close-up: frame a sphere (center cm, radius cm)
  mx_review.turntable(["crate_geo"], "/abs/out/turn", frames=24)      # frames + strip sheet
  mx_review.playblast("/abs/out/shot", start=1, end=48)               # GUI session only

  # public options for skills that need more than the four modes (no private internals):
  mx_review.review(["body_geo"], out, modes=("checker",), checker_repeats=32)       # UV checker
  mx_review.review(["cage_geo"], out, modes=("metal", "wire"), subdiv=2,
                   shader_modes={"metal": {"build": make_metal, "lit": True,
                                           "dome_color": stripes_plug, "key_intensity": 0.6}})
  r["cameras"]["front"]        # every view's camera (also in review.json): eye, fwd, right,
                               # up, perspective, ortho_width, tan_half, near, far, resolution
  mx_review.view_camera(["head_geo"], "front")      # the same camera without rendering
  mx_review.pixel_ray(r["cameras"]["front"], px, py)   # tile pixel -> world ray (UI units)

Headless, through mx_run:
  mayapy mx_run.py --plugins mtoa --scene crate.ma mx_review.py -- --targets crate_geo \
         --out /abs/out/review [--views front,side] [--modes clay,wire] [--res 1024] [--tile 512]

Modes
  clay        grey aiStandardSurface lit by a grey sky dome plus a key light placed over
              the camera's shoulder for every view: reads forms and planes
  wire        aiWireframe (polygon edges) over an unlit facing-ratio fill: reads topology
  silhouette  black on white, computed from the alpha of an unlit render (so an Arnold
              watermark never touches it): reads shape and gesture only
  normals     aiUtility normal colors, unlit: reveals flipped faces and shading breaks
  checker     the clay setup with a checker texture on the UVs (checker_repeats per 0-1
              tile, place2dTexture repeatUV): even squares = even texel density,
              stretched squares = distortion (opt-in, not in DEFAULT_MODES)
  custom      shader_modes={"name": spec}: spec["build"](session) returns a shader node
              the caller made (name it session.name("x") so it is cleaned up); optional
              "lit" (default True: dome and key on), "dome_color" (a plug, or
              callable(session) -> plug, connected to the dome color for that mode only),
              "key_intensity" (for that mode only). A plain callable is a build function.
Other options: subdiv=N renders the temporary duplicates with Arnold catclark subdivision
(N iterations, Smooth Mesh Preview off on the duplicates only); render_prefix, sheet_name,
json_name (None: no JSON written) rename the outputs.
Views (Y-up; mapped for Z-up scenes): front (+Z), side (+X), back (-Z), left (-X),
  top (+Y), threequarter (perspective 50 mm), low (three-quarter from below, catches
  under-planes and jaw lines).

Never touches the user's setup: everything it creates lives in the namespace mxReview
and is deleted afterwards; the targets are rendered as temporary duplicates; every
render setting, camera renderable flag, render layer flag, light and geometry visibility
it changes is recorded and restored, and so are the selection, the current namespace and
the scene's modified flag. In a GUI session all of it is one undo chunk.

Arnold on macOS renders on CPU only (no Arnold GPU, no OptiX); the OIDN imager is added
when available. Samples follow the documented MtoA defaults (Camera AA 3, Diffuse 2,
Specular 2). Batch renders without an Arnold batch licence carry a watermark; since Arnold
7.3 they ABORT on licence failure unless ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL=0, which this
module sets (What's New in Maya 2025, Arnold for Maya 5.4.0).
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import glob
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import time
import zlib

os.environ.setdefault("ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL", "0")

NS = "mxReview"
VIEW_DIRS = {
    "front": (0.0, 0.0, 1.0),
    "back": (0.0, 0.0, -1.0),
    "side": (1.0, 0.0, 0.0),
    "left": (-1.0, 0.0, 0.0),
    "top": (0.0, 1.0, 0.0),
    "threequarter": (0.7, 0.35, 1.0),
    "low": (0.8, -0.45, 1.0),
}
PERSPECTIVE = {"threequarter", "low"}
DEFAULT_VIEWS = ("front", "side", "back", "threequarter", "top", "low")
DEFAULT_MODES = ("clay", "wire", "silhouette", "normals")
BUILTIN_MODES = DEFAULT_MODES + ("checker",)
LIT_MODES = ("clay", "checker")
CHECKER_REPEATS = 16            # [added] place2dTexture repeatUV per 0-1 tile [verify squares per repeat]
CHECKER_COLORS = ((0.9, 0.9, 0.9), (0.1, 0.1, 0.1))
DOME_COLOR = (0.45, 0.45, 0.45)
KEY_INTENSITY = 2.0
UI_TO_CM = {"mm": 0.1, "cm": 1.0, "m": 100.0, "km": 1e5, "in": 2.54, "ft": 30.48, "yd": 91.44,
            "mi": 160934.4}
APERTURE_IN = 1.417          # square film back for square renders
FOCAL_MM = 50.0

# =========================================================================== vector math
def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _norm(a):
    n = math.sqrt(_dot(a, a)) or 1.0
    return (a[0] / n, a[1] / n, a[2] / n)


def map_dir(d, up_axis="y"):
    """Y-up view direction to the scene's up axis (Z-up: x, -z, y)."""
    return d if up_axis == "y" else (d[0], -d[2], d[1])


def basis(direction, up_axis="y"):
    """Camera basis for a camera placed along `direction` from the target, looking back.
    Returns (right, up, forward) unit vectors; forward points from camera to target."""
    fwd = _norm(_mul(direction, -1.0))
    world_up = (0.0, 1.0, 0.0) if up_axis == "y" else (0.0, 0.0, 1.0)
    if abs(_dot(fwd, world_up)) > 0.999:   # top/bottom: screen-up is -Z (Y-up) as in Maya's top view
        world_up = (0.0, 0.0, -1.0) if up_axis == "y" else (0.0, 1.0, 0.0)
        if _dot(fwd, (0.0, 1.0, 0.0) if up_axis == "y" else (0.0, 0.0, 1.0)) > 0:
            world_up = _mul(world_up, -1.0)
    right = _norm(_cross(fwd, world_up))
    up = _cross(right, fwd)
    return right, up, fwd


def euler_xyz_from_axes(x_axis, y_axis, z_axis):
    """Maya rotate order xyz (row vectors, R = Rx*Ry*Rz) from the node's world axes.
    Returns degrees. Maya's rotateX matrix is [1 0 0; 0 c s; 0 -s c] (row-major)."""
    r00, r01, r02 = x_axis
    r10, r11, r12 = y_axis
    r20, r21, r22 = z_axis
    sy = max(-1.0, min(1.0, -r02))
    ry = math.asin(sy)
    if abs(math.cos(ry)) > 1e-6:
        rx = math.atan2(r12, r22)
        rz = math.atan2(r01, r00)
    else:                                   # gimbal: put everything in X
        rz = 0.0
        rx = math.atan2(r10 * sy, r11)
    return (math.degrees(rx), math.degrees(ry), math.degrees(rz))


def matrix_from_euler_xyz(rx, ry, rz):
    """Inverse of euler_xyz_from_axes (degrees in), rows = world axes of the node."""
    cx, sx = math.cos(math.radians(rx)), math.sin(math.radians(rx))
    cy, sy = math.cos(math.radians(ry)), math.sin(math.radians(ry))
    cz, sz = math.cos(math.radians(rz)), math.sin(math.radians(rz))
    return ((cy * cz, cy * sz, -sy),
            (sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, sx * cy),
            (cx * sy * cz + sx * sz, cx * sy * sz - sx * cz, cx * cy))


def aim_rotation(direction, up_axis="y"):
    """Euler XYZ (degrees) that points a Maya camera or light (which look down -Z) along
    -direction, with screen-up following the scene's up axis."""
    right, up, fwd = basis(direction, up_axis)
    return euler_xyz_from_axes(right, up, _mul(fwd, -1.0))


def camera_record(center, direction, fr, up_axis="y", resolution=None, view=None):
    """The camera review() places for one view, as plain data (UI units): eye, center,
    direction (target to camera), fwd (camera to target), right, up, rotate_xyz_deg,
    perspective, ortho_width, focal_mm, aperture_in, tan_half, near, far, distance,
    resolution. Enough to turn a tile pixel into a ray (pixel_ray) without Maya. Pure."""
    d = _norm(direction)
    right, up, fwd = basis(d, up_axis)
    persp = fr["ortho_width"] is None
    return {"view": view, "center": list(center), "eye": list(_add(center, _mul(d, fr["distance"]))),
            "direction": list(d), "fwd": list(fwd), "right": list(right), "up": list(up),
            "rotate_xyz_deg": list(aim_rotation(d, up_axis)), "perspective": persp,
            "ortho_width": fr["ortho_width"], "focal_mm": FOCAL_MM, "aperture_in": APERTURE_IN,
            "tan_half": (APERTURE_IN * 25.4 / 2.0) / FOCAL_MM, "near": fr["near"], "far": fr["far"],
            "distance": fr["distance"], "resolution": resolution, "up_axis": up_axis, "units": "ui"}


def pixel_ray(camera, px, py, resolution=None):
    """(origin, direction) of the ray through pixel (px, py) of a square render of
    `resolution` pixels (default: the camera's own), top-left origin, pixel centres at +0.5.
    `camera`: a camera_record (review()["cameras"][view], review.json, or view_camera). Pure."""
    res = float(resolution or camera.get("resolution") or 0)
    if res <= 0:
        raise ValueError("pixel_ray needs the render resolution")
    nx = (px + 0.5) / res * 2.0 - 1.0
    ny = 1.0 - (py + 0.5) / res * 2.0
    right, up, fwd, eye = (tuple(camera[k]) for k in ("right", "up", "fwd", "eye"))
    if camera["perspective"]:
        t = camera["tan_half"]
        return eye, _norm(_add(fwd, _add(_mul(right, nx * t), _mul(up, ny * t))))
    half = camera["ortho_width"] / 2.0
    return _add(eye, _add(_mul(right, nx * half), _mul(up, ny * half))), fwd


def frame_points(points, focus=None):
    """(center, points to frame) the way review() frames the targets: the bounding-box centre
    of the points, or a focus sphere ((cx, cy, cz), radius) in the same units. Pure."""
    if focus:
        c = tuple(float(x) for x in focus[0])
        rad = float(focus[1])
        return c, [_add(c, _mul(a, rad)) for a in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1),
                                                    (0, 0, -1))]
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return tuple((lo[i] + hi[i]) / 2.0 for i in range(3)), points


def view_cameras(points, views, up_axis="y", margin=1.1, focus=None, resolution=None):
    """{view: camera_record} for points already in UI units (review() uses exactly this). Pure."""
    center, pts = frame_points(points, focus)
    out = {}
    for view in views:
        d = map_dir(VIEW_DIRS[view], up_axis)
        fr = frame(pts, center, d, view in PERSPECTIVE, margin, up_axis)
        out[view] = camera_record(center, d, fr, up_axis, resolution, view)
    return out


def frame(points, center, direction, perspective, margin=1.1, up_axis="y"):
    """Camera distance and ortho width (same units as points) that fit every point."""
    right, up, fwd = basis(direction, up_axis)
    d = _norm(direction)
    if perspective:
        tan_half = (APERTURE_IN * 25.4 / 2.0) / FOCAL_MM / margin
        need = 1e-3
        for p in points:
            rel = _sub(p, center)
            toward = _dot(rel, d)
            need = max(need, abs(_dot(rel, right)) / tan_half + toward,
                       abs(_dot(rel, up)) / tan_half + toward)
        depth = max(abs(_dot(_sub(p, center), d)) for p in points) if points else 1.0
        return {"distance": need, "ortho_width": None, "near": max(need - depth * 1.5, need * 0.01),
                "far": need + depth * 3 + 1.0}
    half = max(max(abs(_dot(_sub(p, center), right)), abs(_dot(_sub(p, center), up))) for p in points)
    depth = max(abs(_dot(_sub(p, center), d)) for p in points)
    dist = depth * 3.0 + max(half, 1e-3) * 2.0
    return {"distance": dist, "ortho_width": 2.0 * max(half, 1e-4) * margin,
            "near": max(dist - depth * 2.0, dist * 0.001), "far": dist + depth * 2.0 + 1.0}


# =========================================================================== image utilities
def write_png(path, width, height, data, channels=3):
    """Write 8-bit RGB (channels=3) or RGBA (4) rows, top row first. Pure Python (zlib)."""
    stride = width * channels
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += data[y * stride:(y + 1) * stride]

    def chunk(tag, body):
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    ctype = 2 if channels == 3 else 6
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, ctype, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    return path


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG: %s" % path)
    return struct.unpack(">II", head[16:24])


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def read_png_pure(path):
    """Decode a non-interlaced 8/16-bit gray, RGB or RGBA PNG to (w, h, RGBA bytes).
    Slow (pure Python) but dependency-free: the last-resort reader."""
    with open(path, "rb") as f:
        blob = f.read()
    if blob[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, idat = 8, bytearray()
    w = h = depth = ctype = None
    while pos < len(blob):
        n = struct.unpack(">I", blob[pos:pos + 4])[0]
        tag = blob[pos + 4:pos + 8]
        body = blob[pos + 8:pos + 8 + n]
        pos += 12 + n
        if tag == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if interlace:
                raise ValueError("interlaced PNG not supported")
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break
    chans = {0: 1, 2: 3, 4: 2, 6: 4}.get(ctype)
    if chans is None or depth not in (8, 16):
        raise ValueError("unsupported PNG type %s depth %s" % (ctype, depth))
    bpp = chans * depth // 8
    stride = w * bpp
    raw = zlib.decompress(bytes(idat))
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        ft = raw[p]
        line = bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        if ft == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif ft == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif ft == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                ul = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + _paeth(left, prev[i], ul)) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    if depth == 16:
        out = out[0::2]
    n = w * h
    rgba = bytearray(n * 4)
    if chans == 4:
        rgba[:] = out
    elif chans == 3:
        rgba[0::4], rgba[1::4], rgba[2::4] = out[0::3], out[1::3], out[2::3]
        rgba[3::4] = b"\xff" * n
    elif chans == 2:
        rgba[0::4] = rgba[1::4] = rgba[2::4] = out[0::2]
        rgba[3::4] = out[1::2]
    else:
        rgba[0::4] = rgba[1::4] = rgba[2::4] = out
        rgba[3::4] = b"\xff" * n
    return w, h, bytes(rgba)


def _read_pil(path):
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    return im.size[0], im.size[1], im.tobytes()


_MIMAGE_LAYOUT = {}


def _mimage_bytes(path):
    import ctypes
    import maya.api.OpenMaya as om
    img = om.MImage()
    img.readFromFile(path)
    w, h = img.getSize()
    px = img.pixels()
    n = w * h * 4
    data = bytes(px)[:n] if isinstance(px, (bytes, bytearray, memoryview)) else ctypes.string_at(int(px), n)
    return w, h, data


def _mimage_layout(tmp_dir):
    """Self-calibrate MImage row order and channel order on a 1x2 PNG written here."""
    if "bottom_up" in _MIMAGE_LAYOUT:
        return _MIMAGE_LAYOUT
    probe = os.path.join(tmp_dir, "_mx_mimage_probe.png")
    write_png(probe, 1, 2, bytes([255, 0, 0, 0, 255, 0]), channels=3)   # top red, bottom green
    _, _, d = _mimage_bytes(probe)
    first = tuple(d[:3])
    _MIMAGE_LAYOUT["bottom_up"] = first == (0, 255, 0)
    _MIMAGE_LAYOUT["bgra"] = first == (0, 0, 255)
    return _MIMAGE_LAYOUT


def _read_mimage(path):
    w, h, d = _mimage_bytes(path)
    lay = _mimage_layout(os.path.dirname(path))
    d = bytearray(d)
    if lay.get("bgra"):
        d[0::4], d[2::4] = d[2::4], d[0::4]
    if lay.get("bottom_up"):
        stride = w * 4
        d = b"".join(bytes(d[y * stride:(y + 1) * stride]) for y in range(h - 1, -1, -1))
    return w, h, bytes(d)


def _read_imconvert(path):
    exe = None
    for cand in (os.path.join(os.path.dirname(sys.executable), "imconvert"), shutil.which("imconvert")):
        if cand and os.path.isfile(cand):
            exe = cand
            break
    if not exe:
        raise RuntimeError("imconvert not found")
    w, h = png_size(path)
    raw = path + ".rgba"
    subprocess.check_call([exe, path, "-depth", "8", "rgba:" + raw])
    with open(raw, "rb") as f:
        d = f.read()
    if len(d) != w * h * 4:
        raise RuntimeError("imconvert returned %d bytes for %dx%d" % (len(d), w, h))
    return w, h, d


READERS = [("pil", _read_pil), ("mimage", _read_mimage), ("imconvert", _read_imconvert),
           ("pure", read_png_pure)]
_READER_USED = {}


def read_rgba(path):
    """(w, h, RGBA bytes, top row first) with the first backend that works:
    PIL, OpenMaya MImage, Maya's imconvert, then a pure-Python decoder."""
    errors = []
    order = READERS
    if _READER_USED.get("name"):
        order = sorted(READERS, key=lambda x: x[0] != _READER_USED["name"])
    for name, fn in order:
        try:
            w, h, d = fn(path)
            _READER_USED["name"] = name
            return w, h, d
        except Exception as exc:
            errors.append("%s: %s" % (name, exc))
    raise RuntimeError("cannot read %s (%s)" % (path, "; ".join(errors)))


def rgba_to_rgb(d):
    n = len(d) // 4
    out = bytearray(n * 3)
    out[0::3], out[1::3], out[2::3] = d[0::4], d[1::4], d[2::4]
    return bytes(out)


def alpha_silhouette(d):
    """Black shape on white from the alpha channel of RGBA bytes."""
    inv = bytes(range(255, -1, -1))
    g = bytes(d[3::4]).translate(inv)
    out = bytearray(len(g) * 3)
    out[0::3] = out[1::3] = out[2::3] = g
    return bytes(out)


def srgb_lut():
    """Linear to sRGB-encoded 8-bit lookup (used only when no output transform applied)."""
    t = []
    for i in range(256):
        c = i / 255.0
        s = 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
        t.append(int(round(max(0.0, min(1.0, s)) * 255)))
    return bytes(t)


def downsample(w, h, rgb, tw, th):
    """Nearest-neighbour resize of RGB bytes (exact integer factors use slicing)."""
    if (w, h) == (tw, th):
        return rgb
    out = bytearray(tw * th * 3)
    if w % tw == 0 and h % th == 0 and w // tw == h // th:
        f = w // tw
        stride = w * 3
        for y in range(th):
            row = rgb[(y * f) * stride:(y * f + 1) * stride]
            o = y * tw * 3
            seg = bytearray(tw * 3)
            seg[0::3], seg[1::3], seg[2::3] = row[0::3 * f], row[1::3 * f], row[2::3 * f]
            out[o:o + tw * 3] = seg
        return bytes(out)
    xs = [min(w - 1, int((x + 0.5) * w / tw)) * 3 for x in range(tw)]
    for y in range(th):
        sy = min(h - 1, int((y + 0.5) * h / th)) * w * 3
        o = y * tw * 3
        for x, sx in enumerate(xs):
            out[o + x * 3:o + x * 3 + 3] = rgb[sy + sx:sy + sx + 3]
    return bytes(out)


# 5x7 bitmap font, one int per row, bit 4 = leftmost column
FONT = {
    "A": (14, 17, 17, 31, 17, 17, 17), "B": (30, 17, 17, 30, 17, 17, 30), "C": (14, 17, 16, 16, 16, 17, 14),
    "D": (30, 17, 17, 17, 17, 17, 30), "E": (31, 16, 16, 30, 16, 16, 31), "F": (31, 16, 16, 30, 16, 16, 16),
    "G": (14, 17, 16, 23, 17, 17, 15), "H": (17, 17, 17, 31, 17, 17, 17), "I": (14, 4, 4, 4, 4, 4, 14),
    "J": (7, 2, 2, 2, 2, 18, 12), "K": (17, 18, 20, 24, 20, 18, 17), "L": (16, 16, 16, 16, 16, 16, 31),
    "M": (17, 27, 21, 21, 17, 17, 17), "N": (17, 17, 25, 21, 19, 17, 17), "O": (14, 17, 17, 17, 17, 17, 14),
    "P": (30, 17, 17, 30, 16, 16, 16), "Q": (14, 17, 17, 17, 21, 18, 13), "R": (30, 17, 17, 30, 20, 18, 17),
    "S": (15, 16, 16, 14, 1, 1, 30), "T": (31, 4, 4, 4, 4, 4, 4), "U": (17, 17, 17, 17, 17, 17, 14),
    "V": (17, 17, 17, 17, 17, 10, 4), "W": (17, 17, 17, 21, 21, 21, 10), "X": (17, 17, 10, 4, 10, 17, 17),
    "Y": (17, 17, 17, 10, 4, 4, 4), "Z": (31, 1, 2, 4, 8, 16, 31),
    "0": (14, 17, 19, 21, 25, 17, 14), "1": (4, 12, 4, 4, 4, 4, 14), "2": (14, 17, 1, 2, 4, 8, 31),
    "3": (31, 2, 4, 2, 1, 17, 14), "4": (2, 6, 10, 18, 31, 2, 2), "5": (31, 16, 30, 1, 1, 17, 14),
    "6": (6, 8, 16, 30, 17, 17, 14), "7": (31, 1, 2, 4, 8, 8, 8), "8": (14, 17, 17, 14, 17, 17, 14),
    "9": (14, 17, 17, 15, 1, 2, 12), " ": (0, 0, 0, 0, 0, 0, 0), "/": (1, 1, 2, 4, 8, 16, 16),
    "-": (0, 0, 0, 31, 0, 0, 0), "_": (0, 0, 0, 0, 0, 0, 31), ".": (0, 0, 0, 0, 0, 12, 12),
    ":": (0, 12, 12, 0, 12, 12, 0), "(": (2, 4, 8, 8, 8, 4, 2), ")": (8, 4, 2, 2, 2, 4, 8),
    "%": (24, 25, 2, 4, 8, 19, 3), "+": (0, 4, 4, 31, 4, 4, 0), "=": (0, 0, 31, 0, 31, 0, 0),
    "?": (14, 17, 1, 2, 4, 0, 4),
}


def draw_text(buf, width, x, y, text, scale=2, color=(0, 0, 0)):
    """Draw uppercase text into an RGB bytearray of the given width."""
    px = bytes(color)
    cx = x
    for ch in text.upper():
        rows = FONT.get(ch, FONT["?"])
        for ry, bits in enumerate(rows):
            for rx in range(5):
                if bits & (16 >> rx):
                    for sy in range(scale):
                        yy = y + ry * scale + sy
                        o = (yy * width + cx + rx * scale) * 3
                        for sx in range(scale):
                            buf[o + sx * 3:o + sx * 3 + 3] = px
        cx += 6 * scale
    return cx


def text_width(text, scale=2):
    return len(text) * 6 * scale


def contact_sheet(cells, cols, tile_w, tile_h, out_path, label_scale=2, bg=(235, 235, 235),
                  title=None):
    """cells: list (row-major) of (label, rgb_bytes or None) at tile size. Writes a PNG."""
    rows = int(math.ceil(len(cells) / float(cols)))
    lh = 7 * label_scale + 6
    th = 7 * label_scale + 10 if title else 0
    W, H = cols * tile_w, th + rows * (tile_h + lh)
    buf = bytearray(bytes(bg) * (W * H))
    if title:
        draw_text(buf, W, 4, 4, title[: max(1, W // (6 * label_scale) - 1)], label_scale, (0, 0, 0))
    for i, (label, rgb) in enumerate(cells):
        r, c = divmod(i, cols)
        x0, y0 = c * tile_w, th + r * (tile_h + lh)
        maxch = max(1, tile_w // (6 * label_scale) - 1)
        draw_text(buf, W, x0 + 3, y0 + 3, label[:maxch], label_scale, (20, 20, 20))
        if rgb is None:
            continue
        for y in range(tile_h):
            o = ((y0 + lh + y) * W + x0) * 3
            buf[o:o + tile_w * 3] = rgb[y * tile_w * 3:(y + 1) * tile_w * 3]
    write_png(out_path, W, H, buf, channels=3)
    return out_path, (W, H)


# =========================================================================== Maya helpers
def _cmds():
    import maya.cmds as cmds
    return cmds


class _Restorer(object):
    """Records every change to user nodes and undoes them in reverse order."""

    def __init__(self):
        self.ops = []
        self.missing = []
        self.errors = []

    def set(self, plug, value, kind=None):
        cmds = _cmds()
        node, attr = plug.split(".", 1)
        if not cmds.objExists(node) or not cmds.attributeQuery(attr.split("[")[0], node=node, exists=True):
            self.missing.append(plug)
            return False
        if cmds.getAttr(plug, lock=True):
            self.errors.append("locked: " + plug)
            return False
        if cmds.listConnections(plug, source=True, destination=False, plugs=True):
            self.errors.append("connected: " + plug)
            return False
        kind = kind or cmds.getAttr(plug, type=True)
        old = cmds.getAttr(plug)
        self.ops.append(("set", plug, old, kind))
        self._apply(plug, value, kind)
        return True

    @staticmethod
    def _apply(plug, value, kind):
        cmds = _cmds()
        if kind == "string":
            cmds.setAttr(plug, value or "", type="string")
        elif isinstance(value, (list, tuple)):
            vals = value[0] if value and isinstance(value[0], (list, tuple)) else value
            if kind in ("double3", "float3", "double2", "float2", "long2", "long3", "short2", "short3"):
                cmds.setAttr(plug, *vals, type=kind)
            else:
                cmds.setAttr(plug, *vals)
        else:
            cmds.setAttr(plug, value)

    def disconnect_inputs(self, plug):
        cmds = _cmds()
        node, attr = plug.split(".", 1)
        if not cmds.objExists(node) or not cmds.attributeQuery(attr, node=node, exists=True):
            return
        for src in cmds.listConnections(plug, source=True, destination=False, plugs=True) or []:
            cmds.disconnectAttr(src, plug)
            self.ops.append(("connect", src, plug, None))

    def restore(self):
        cmds = _cmds()
        for op in reversed(self.ops):
            try:
                if op[0] == "set":
                    self._apply(op[1], op[2], op[3])
                elif op[0] == "connect":
                    cmds.connectAttr(op[1], op[2], force=True)
            except Exception as exc:
                self.errors.append("restore %s: %s" % (op[1], exc))
        self.ops = []


def _pick_type(cmds, *names):
    have = set(cmds.allNodeTypes() or [])
    for n in names:
        if n in have:
            return n
    return None


def _set_enum(cmds, plug, label):
    node, attr = plug.split(".", 1)
    if not cmds.attributeQuery(attr, node=node, exists=True):
        return False
    try:
        names = (cmds.attributeQuery(attr, node=node, listEnum=True) or [""])[0].split(":")
    except Exception:
        names = []
    idx = None
    for i, n in enumerate(names):
        if n.split("=")[0].lower() == label.lower():
            idx = int(n.split("=")[1]) if "=" in n else i
            break
    if idx is None:
        return False
    cmds.setAttr(plug, idx)
    return True


def _light_shape_and_xform(cmds, node):
    if cmds.nodeType(node) == "transform":
        return (cmds.listRelatives(node, shapes=True, fullPath=True) or [node])[0], node
    return node, (cmds.listRelatives(node, parent=True, fullPath=True) or [node])[0]


def _ensure_arnold(cmds):
    if not cmds.pluginInfo("mtoa", q=True, loaded=True):
        cmds.loadPlugin("mtoa", quiet=True)
    created = []
    try:
        import mtoa.core
        before = set(cmds.ls(["defaultArnoldRenderOptions", "defaultArnoldDriver", "defaultArnoldFilter"]) or [])
        mtoa.core.createOptions()                       # [verify] creates the options nodes
        created = sorted(set(cmds.ls(["defaultArnoldRenderOptions", "defaultArnoldDriver",
                                      "defaultArnoldFilter"]) or []) - before)
    except Exception:
        pass
    if not cmds.objExists("defaultArnoldRenderOptions"):
        raise RuntimeError("Arnold options node missing after loading mtoa")
    return created


def _geometry_to_hide(cmds):
    shapes = set(cmds.ls(geometry=True, long=True, noIntermediate=True) or [])
    for t in ("aiStandIn", "aiVolume", "gpuCache", "mayaUsdProxyShape", "instancer",
              "xgmSplineDescription", "aiMeshLight"):
        if _pick_type(cmds, t):
            shapes.update(cmds.ls(type=t, long=True) or [])
    return sorted(s for s in shapes if not s.split("|")[-1].startswith(NS + ":"))


def _lights_to_hide(cmds):
    lights = set(cmds.ls(lights=True, long=True) or [])
    for t in ("aiSkyDomeLight", "aiAreaLight", "aiMeshLight", "aiPhotometricLight", "aiLightPortal",
              "aiPhysicalSky"):
        if _pick_type(cmds, t):
            lights.update(cmds.ls(type=t, long=True) or [])
    return sorted(s for s in lights if not s.split("|")[-1].startswith(NS + ":"))


def _target_points_ui(cmds, targets, limit=20000):
    """World-space sample points (UI units) of the targets' meshes; bbox corners for others."""
    import maya.api.OpenMaya as om
    f = 1.0 / UI_TO_CM.get(cmds.currentUnit(q=True, linear=True), 1.0)
    pts = []
    shapes = []
    for t in targets:
        if cmds.nodeType(t) == "mesh":
            shapes.append(t)
        shapes += cmds.listRelatives(t, allDescendents=True, type="mesh", fullPath=True) or []
    shapes = [s for s in dict.fromkeys(shapes) if not cmds.getAttr(s + ".intermediateObject")]
    per = max(1, limit // max(1, len(shapes)))
    for s in shapes:
        if not cmds.polyEvaluate(s, vertex=True):
            continue
        sl = om.MSelectionList()
        sl.add(s)
        arr = om.MFnMesh(sl.getDagPath(0)).getPoints(om.MSpace.kWorld)
        step = max(1, len(arr) // per)
        pts += [(arr[i].x * f, arr[i].y * f, arr[i].z * f) for i in range(0, len(arr), step)]
    if not pts:
        bb = cmds.exactWorldBoundingBox(targets)
        pts = [(x, y, z) for x in (bb[0], bb[3]) for y in (bb[1], bb[4]) for z in (bb[2], bb[5])]
    return pts


def _deg(cmds, angles):
    if cmds.currentUnit(q=True, angle=True) == "rad":
        return tuple(math.radians(a) for a in angles)
    return angles


def _place(cmds, xform, position, direction, up_axis):
    rot = _deg(cmds, aim_rotation(direction, up_axis))
    cmds.setAttr(xform + ".rotateOrder", 0)
    cmds.setAttr(xform + ".translate", *position, type="double3")
    cmds.setAttr(xform + ".rotate", *rot, type="double3")


class _Session(object):
    """Temporary review setup: created nodes in namespace mxReview, restorer for the rest.
    Private: skills use review()'s options (modes, checker_repeats, shader_modes, subdiv).
    scenario-maya-groom subclasses it; keep the positional signature and method names stable."""

    def __init__(self, targets, out_dir, resolution, samples, denoise, log, subdiv=None, checker=None,
                 shader_modes=None):
        cmds = _cmds()
        self.cmds = cmds
        self.subdiv = subdiv
        self.checker = checker              # None, or {"repeats": float, "colors": (c1, c2)}
        self.shader_modes = _normalize_modes(shader_modes)
        self.custom = {}
        self.out_dir = out_dir
        self.res = resolution
        self.notes = []
        self.log = log
        self.rest = _Restorer()
        self.prev_ns = cmds.namespaceInfo(currentNamespace=True, absoluteName=True)
        self.sel = cmds.ls(selection=True, long=True) or []
        self.modified = cmds.file(q=True, modified=True)
        self.batch = cmds.about(batch=True)
        self.up = cmds.upAxis(q=True, axis=True)
        self.chunk = False
        self.samples = samples
        self.denoise = denoise
        self.targets = targets
        self.cm_prefs = []
        self.gamma = False
        self.dups = []

    def __enter__(self):
        cmds = self.cmds
        if not self.batch:
            cmds.undoInfo(openChunk=True, chunkName="mxReview")
            self.chunk = True
        try:
            if cmds.namespace(exists=":" + NS):       # left over by a crashed earlier run
                cmds.namespace(removeNamespace=":" + NS, deleteNamespaceContent=True)
            created = _ensure_arnold(cmds)
            if created:
                self.notes.append("created missing Arnold option nodes %s (left in the scene)" % created)
            cmds.namespace(add=NS)
            with self.in_ns():
                self._build()
                self._build_options()
            self._configure()
        except BaseException:
            self.__exit__(*sys.exc_info())         # __exit__ does not run when __enter__ raises
            raise
        return self

    def in_ns(self):
        cmds, prev = self.cmds, self.prev_ns or ":"

        class _Ctx(object):
            def __enter__(self_):
                cmds.namespace(set=":" + NS)

            def __exit__(self_, *a):
                cmds.namespace(set=prev)
                return False
        return _Ctx()

    # ---------------------------------------------------------------- build
    def _build(self):
        cmds = self.cmds
        self.grp = cmds.createNode("transform", name=NS + ":review_GRP")
        dups = []
        for t in self.targets:
            d = cmds.duplicate(t, returnRootsOnly=True, name=NS + ":dup_" + t.split("|")[-1].split(":")[-1])[0]
            dups.append(cmds.parent(d, self.grp)[0])      # keeps the world transform
        self.dups = [cmds.ls(d, long=True)[0] for d in dups]
        for d in self.dups:           # a duplicate of a hidden original stays hidden: show it
            for n in [d] + (cmds.listRelatives(d, allDescendents=True, fullPath=True) or []):
                if cmds.attributeQuery("visibility", node=n, exists=True) and not cmds.getAttr(n + ".visibility"):
                    try:
                        cmds.setAttr(n + ".visibility", 1)
                    except Exception:
                        pass
        # shaders
        self.sg = {}
        std = _pick_type(cmds, "aiStandardSurface", "standardSurface", "lambert")
        clay = cmds.shadingNode(std, asShader=True, name=NS + ":clay")
        if std in ("aiStandardSurface", "standardSurface"):
            cmds.setAttr(clay + ".base", 1.0)
            cmds.setAttr(clay + ".baseColor", 0.5, 0.5, 0.5, type="double3")
            cmds.setAttr(clay + ".specular", 0.3)
            cmds.setAttr(clay + ".specularRoughness", 0.6)
        else:
            cmds.setAttr(clay + ".color", 0.5, 0.5, 0.5, type="double3")
        self.sg["clay"] = self._sg(clay, "clay")
        util_fill = cmds.shadingNode("aiUtility", asShader=True, name=NS + ":fill")
        _set_enum(cmds, util_fill + ".shadeMode", "ndoteye")
        cmds.setAttr(util_fill + ".color", 0.8, 0.8, 0.8, type="double3")
        wire = cmds.shadingNode("aiWireframe", asShader=True, name=NS + ":wire")
        cmds.connectAttr(util_fill + ".outColor", wire + ".fillColor", force=True)
        cmds.setAttr(wire + ".lineColor", 0.02, 0.02, 0.02, type="double3")
        cmds.setAttr(wire + ".lineWidth", max(1.0, self.res / 1024.0))
        _set_enum(cmds, wire + ".edgeType", "polygons")
        if cmds.attributeQuery("rasterSpace", node=wire, exists=True):
            cmds.setAttr(wire + ".rasterSpace", 1)
        self.sg["wire"] = self._sg(wire, "wire")
        nrm = cmds.shadingNode("aiUtility", asShader=True, name=NS + ":normals")
        if not _set_enum(cmds, nrm + ".colorMode", "n"):
            _set_enum(cmds, nrm + ".colorMode", "ns")
        _set_enum(cmds, nrm + ".shadeMode", "flat")
        self.sg["normals"] = self._sg(nrm, "normals")
        # lights and camera
        dome = cmds.shadingNode("aiSkyDomeLight", asLight=True, name=NS + ":dome")
        self.dome_shape, self.dome = _light_shape_and_xform(cmds, dome)
        cmds.setAttr(self.dome_shape + ".color", 0.45, 0.45, 0.45, type="double3")
        cmds.setAttr(self.dome_shape + ".intensity", 1.0)
        key = cmds.shadingNode("directionalLight", asLight=True, name=NS + ":key")
        self.key_shape, self.key = _light_shape_and_xform(cmds, key)
        cmds.setAttr(self.key_shape + ".intensity", 2.0)
        if cmds.attributeQuery("aiAngle", node=self.key_shape, exists=True):
            cmds.setAttr(self.key_shape + ".aiAngle", 3.0)
        cam = cmds.camera(name=NS + ":cam")
        self.cam, self.cam_shape = cmds.ls(cam[0], long=True)[0], cmds.ls(cam[1], long=True)[0]
        cmds.setAttr(self.cam_shape + ".horizontalFilmAperture", APERTURE_IN)
        cmds.setAttr(self.cam_shape + ".verticalFilmAperture", APERTURE_IN)
        cmds.setAttr(self.cam_shape + ".focalLength", FOCAL_MM)
        self.imager = None
        if self.denoise:
            t = _pick_type(self.cmds, "aiImagerDenoiserOidn")
            if t and not cmds.ls(type=t):              # new scenes may already have one
                self.imager = cmds.createNode(t, name=NS + ":oidn")

    def _sg(self, shader, name):
        cmds = self.cmds
        sg = cmds.sets(renderable=True, noSurfaceShader=True, empty=True, name=NS + ":%sSG" % name)
        cmds.connectAttr(shader + ".outColor", sg + ".surfaceShader", force=True)
        return sg

    def name(self, suffix):
        """A node name inside the review namespace (deleted with it at the end)."""
        return "%s:%s" % (NS, suffix)

    def _build_options(self):
        """The optional parts: Arnold subdivision on the duplicates, the checker shader, the
        callers' custom shaders. Runs after _build() (subclasses that replace _build and set
        no option get nothing here)."""
        cmds = self.cmds
        if self.subdiv:
            for d in self.dups:
                for s in cmds.listRelatives(d, allDescendents=True, type="mesh", fullPath=True) or []:
                    if cmds.getAttr(s + ".intermediateObject"):
                        continue
                    if cmds.attributeQuery("displaySmoothMesh", node=s, exists=True):
                        cmds.setAttr(s + ".displaySmoothMesh", 0)
                    if cmds.attributeQuery("aiSubdivType", node=s, exists=True):
                        if not _set_enum(cmds, s + ".aiSubdivType", "catclark"):
                            cmds.setAttr(s + ".aiSubdivType", 1)                 # [verify] 1 = catclark
                        cmds.setAttr(s + ".aiSubdivIterations", int(self.subdiv))
                    else:
                        self.notes.append("subdiv: %s has no aiSubdivType (mtoa not loaded?)" % s)
        if self.checker is not None:
            std = _pick_type(cmds, "aiStandardSurface", "standardSurface", "lambert")
            shader = cmds.shadingNode(std, asShader=True, name=self.name("checkerShader"))
            tex = cmds.shadingNode("checker", asTexture=True, name=self.name("checker"))
            p2d = cmds.shadingNode("place2dTexture", asUtility=True, name=self.name("checkerP2d"))
            cmds.connectAttr(p2d + ".outUV", tex + ".uvCoord", force=True)
            cmds.connectAttr(p2d + ".outUvFilterSize", tex + ".uvFilterSize", force=True)
            reps = float(self.checker.get("repeats") or CHECKER_REPEATS)
            cmds.setAttr(p2d + ".repeatU", reps)
            cmds.setAttr(p2d + ".repeatV", reps)
            c1, c2 = self.checker.get("colors") or CHECKER_COLORS
            cmds.setAttr(tex + ".color1", *c1, type="double3")
            cmds.setAttr(tex + ".color2", *c2, type="double3")
            if std in ("aiStandardSurface", "standardSurface"):
                cmds.setAttr(shader + ".base", 1.0)
                cmds.setAttr(shader + ".specular", 0.3)
                cmds.setAttr(shader + ".specularRoughness", 0.6)
                cmds.connectAttr(tex + ".outColor", shader + ".baseColor", force=True)
            else:
                cmds.connectAttr(tex + ".outColor", shader + ".color", force=True)
            self.sg["checker"] = self._sg(shader, "checker")
            self.checker_nodes = {"shader": shader, "texture": tex, "place2d": p2d, "repeats": reps}
        for mode, spec in self.shader_modes.items():
            shader = spec["build"](self)
            if isinstance(shader, (list, tuple)):
                shader = shader[0]
            if not shader or not cmds.objExists(shader):
                raise RuntimeError("shader_modes[%r] build returned %r, not a shader node" % (mode, shader))
            self.sg[mode] = self._sg(shader, mode)
            self.custom[mode] = dict(spec, shader=shader)

    # ---------------------------------------------------------------- configure (restorable)
    def _configure(self):
        cmds, R = self.cmds, self.rest
        R.set("defaultRenderGlobals.currentRenderer", "arnold", "string")
        R.set("defaultRenderGlobals.animation", 0)
        R.set("defaultRenderGlobals.imageFormat", 32)                      # png
        R.set("defaultRenderGlobals.imfPluginKey", "png", "string")
        R.set("defaultRenderGlobals.imageFilePrefix", os.path.join(self.out_dir, "_raw", "mx"), "string")
        R.set("defaultResolution.width", self.res)
        R.set("defaultResolution.height", self.res)
        R.set("defaultResolution.deviceAspectRatio", 1.0)
        R.set("defaultResolution.pixelAspect", 1.0)
        R.set("defaultArnoldDriver.ai_translator", "png", "string")
        s = dict(AASamples=3, GIDiffuseSamples=2, GISpecularSamples=2, GITransmissionSamples=2,
                 GISssSamples=2, GIVolumeSamples=0, GIDiffuseDepth=1, GISpecularDepth=1)
        s.update(self.samples or {})
        for attr, val in s.items():
            R.set("defaultArnoldRenderOptions." + attr, val)
        for attr, val in (("enableAdaptiveSampling", 0), ("aovMode", 0), ("motion_blur_enable", 0),
                          ("renderDevice", 0), ("abortOnLicenseFail", 0),
                          ("log_to_file", 1), ("log_verbosity", 1)):
            R.set("defaultArnoldRenderOptions." + attr, val)
        R.set("defaultArnoldRenderOptions.log_filename", os.path.join(self.out_dir, "arnold.log"), "string")
        for plug in ("defaultArnoldRenderOptions.background", "defaultArnoldRenderOptions.atmosphere"):
            R.disconnect_inputs(plug)
        if R.missing:
            self.notes.append("attributes not found (check names on this MtoA): %s" % sorted(set(R.missing)))
        # only our camera and the master layer render
        for c in cmds.ls(type="camera", long=True) or []:
            if c != self.cam_shape:
                R.set(c + ".renderable", 0)
        cmds.setAttr(self.cam_shape + ".renderable", 1)          # ours: no restore needed
        for lay in cmds.ls(type="renderLayer") or []:
            if cmds.referenceQuery(lay, isNodeReferenced=True):
                continue
            R.set(lay + ".renderable", 1 if lay == "defaultRenderLayer" else 0)
        # hide the user's geometry and lights (the duplicates render instead)
        mine = set(self.dups) | set(cmds.listRelatives(self.dups, allDescendents=True, fullPath=True) or [])
        for s in _geometry_to_hide(cmds):
            if s not in mine and cmds.getAttr(s + ".visibility"):
                R.set(s + ".visibility", 0)
        for l in _lights_to_hide(cmds):
            if l not in (self.dome_shape, self.key_shape) and cmds.getAttr(l + ".visibility"):
                R.set(l + ".visibility", 0)
        # imager
        if self.imager:
            for holder in ("defaultArnoldDriver", "defaultArnoldRenderOptions"):
                if cmds.attributeQuery("imagers", node=holder, exists=True):
                    idx = len(cmds.getAttr(holder + ".imagers", multiIndices=True) or [])
                    try:
                        cmds.connectAttr(self.imager + ".message", "%s.imagers[%d]" % (holder, idx), force=True)
                        self.notes.append("OIDN imager connected to %s.imagers[%d]" % (holder, idx))
                    except Exception as exc:
                        self.notes.append("OIDN imager not connected: %s" % exc)
                    break
            else:
                self.notes.append("no imagers attribute found; rendering without OIDN")
        # output transform so 8-bit PNGs are display-referred
        self.gamma = False
        try:
            old_on = cmds.colorManagementPrefs(q=True, outputTarget="renderer", outputTransformEnabled=True)
            old_view = cmds.colorManagementPrefs(q=True, outputTarget="renderer", outputUseViewTransform=True)
            self.cm_prefs = [(old_on, old_view)]
            cmds.colorManagementPrefs(e=True, outputTarget="renderer", outputTransformEnabled=True)
            cmds.colorManagementPrefs(e=True, outputTarget="renderer", outputUseViewTransform=True)
        except Exception as exc:
            self.cm_prefs = []
            self.gamma = True
            self.notes.append("output transform not set (%s); applying an sRGB curve to the PNGs" % exc)

    # ---------------------------------------------------------------- per render
    def assign(self, mode):
        with self.in_ns():          # groupId nodes made by the assignment land in mxReview too
            self.cmds.sets(self.dups, e=True, forceElement=self.sg["wire" if mode == "silhouette" else mode])
        spec = self.custom.get(mode)
        lit = bool(spec.get("lit", True)) if spec else mode in LIT_MODES
        self.cmds.setAttr(self.dome_shape + ".visibility", 1 if lit else 0)
        self.cmds.setAttr(self.key_shape + ".visibility", 1 if lit else 0)
        if self.custom:
            self._mode_lights(spec)

    def _mode_lights(self, spec):
        """Dome colour input and key intensity for one mode; back to the defaults otherwise."""
        cmds = self.cmds
        plug = spec.get("dome_color") if spec else None
        if callable(plug):
            plug = plug(self)
        dome_color = self.dome_shape + ".color"
        current = cmds.listConnections(dome_color, source=True, destination=False, plugs=True) or []
        if plug:
            cmds.connectAttr(plug, dome_color, force=True)
        else:
            for src in current:
                cmds.disconnectAttr(src, dome_color)
            if current:
                cmds.setAttr(dome_color, *DOME_COLOR, type="double3")
        key = spec.get("key_intensity") if spec else None
        cmds.setAttr(self.key_shape + ".intensity", float(key) if key is not None else KEY_INTENSITY)

    def aim(self, center, direction, fr):
        cmds = self.cmds
        d = _norm(direction)
        pos = _add(center, _mul(d, fr["distance"]))
        _place(cmds, self.cam, pos, d, self.up)
        ortho = fr["ortho_width"] is not None
        cmds.setAttr(self.cam_shape + ".orthographic", 1 if ortho else 0)
        if ortho:
            cmds.setAttr(self.cam_shape + ".orthographicWidth", fr["ortho_width"])
        cmds.setAttr(self.cam_shape + ".nearClipPlane", fr["near"])
        cmds.setAttr(self.cam_shape + ".farClipPlane", fr["far"])
        right, up, fwd = basis(d, self.up)
        key_dir = _norm(_add(_add(_mul(fwd, -0.6), _mul(up, 0.7)), _mul(right, -0.4)))   # [added] over the left shoulder
        _place(cmds, self.key, center, key_dir, self.up)

    def render(self, name):
        cmds = self.cmds
        import maya.mel as mel
        prefix = os.path.join(self.out_dir, "_raw", name)
        os.makedirs(os.path.dirname(prefix), exist_ok=True)
        cmds.setAttr("defaultRenderGlobals.imageFilePrefix", prefix, type="string")
        t0 = time.time()
        mel.eval("arnoldRender -b;")                              # [verify] batch render to file
        found = [p for p in glob.glob(prefix + "*.png") + glob.glob(os.path.join(
            cmds.workspace(q=True, rootDirectory=True), "images", "**", name + "*.png"), recursive=True)
            if os.path.getmtime(p) >= t0 - 1]
        if not found:
            raise RuntimeError("Arnold wrote no PNG for %s (see %s/arnold.log)" % (name, self.out_dir))
        found.sort(key=os.path.getmtime)
        dst = os.path.join(self.out_dir, name + ".png")
        shutil.copyfile(found[-1], dst)
        self.log.append({"render": name, "seconds": round(time.time() - t0, 2)})
        return dst

    def __exit__(self, *exc):
        cmds = self.cmds
        try:
            self.rest.restore()
            for old_on, old_view in self.cm_prefs:
                try:
                    cmds.colorManagementPrefs(e=True, outputTarget="renderer", outputTransformEnabled=old_on)
                    cmds.colorManagementPrefs(e=True, outputTarget="renderer", outputUseViewTransform=old_view)
                except Exception as e:
                    self.notes.append("could not restore output transform prefs: %s" % e)
            if cmds.namespace(exists=":" + NS):
                cmds.namespace(removeNamespace=":" + NS, deleteNamespaceContent=True)
            cmds.namespace(set=self.prev_ns or ":")
            keep = [s for s in self.sel if cmds.objExists(s)]
            if keep:
                cmds.select(keep, replace=True)
            else:
                cmds.select(clear=True)
            cmds.file(modified=self.modified)
        finally:
            if self.chunk:
                cmds.undoInfo(closeChunk=True)
        if self.rest.errors:
            self.notes.append("restore issues: %s" % self.rest.errors)
        return False


def _normalize_modes(shader_modes):
    """{name: {"build": callable, "lit", "dome_color", "key_intensity"}} from the caller's
    shader_modes (a callable alone is a build function). Pure."""
    out = {}
    for name, spec in (shader_modes or {}).items():
        if name in BUILTIN_MODES:
            raise ValueError("shader_modes name %r collides with a built-in mode" % name)
        if callable(spec):
            spec = {"build": spec}
        if not isinstance(spec, dict) or not callable(spec.get("build")):
            raise ValueError("shader_modes[%r] needs a 'build' callable" % name)
        unknown = set(spec) - {"build", "lit", "dome_color", "key_intensity"}
        if unknown:
            raise ValueError("shader_modes[%r]: unknown keys %s" % (name, sorted(unknown)))
        out[name] = dict(spec)
    return out


# =========================================================================== public helpers
def resolve_targets(targets):
    """Long names of the targets (a shape is replaced by its transform), as review() uses them."""
    return _resolve_targets(_cmds(), targets if isinstance(targets, (list, tuple)) else [targets])


def target_points(targets, limit=20000):
    """World-space sample points in UI units of the targets' meshes, as review() frames them
    (empty meshes skipped; bbox corners when there is no mesh)."""
    cmds = _cmds()
    return _target_points_ui(cmds, resolve_targets(targets), limit)


def set_enum(plug, label):
    """Set an enum attribute by its label (case-insensitive). False when the attribute or
    the label does not exist on this build."""
    return _set_enum(_cmds(), plug, label)


def pick_type(*names):
    """The first node type of `names` this session knows (plug-in types may be missing)."""
    return _pick_type(_cmds(), *names)


def to_ui_angles(angles):
    """Degrees to the scene's angle unit (radians when the UI unit is rad)."""
    return _deg(_cmds(), tuple(angles))


def view_camera(targets, view, margin=1.1, focus=None, resolution=None):
    """The camera review() would use for one view, without rendering (Maya session needed
    for the target points). focus: ((x, y, z), radius) in centimeters, as in review()."""
    cmds = _cmds()
    tg = resolve_targets(targets)
    pts = _target_points_ui(cmds, tg)
    f_ui = 1.0 / UI_TO_CM.get(cmds.currentUnit(q=True, linear=True), 1.0)
    foc = (tuple(x * f_ui for x in focus[0]), float(focus[1]) * f_ui) if focus else None
    return view_cameras(pts, [view], cmds.upAxis(q=True, axis=True), margin, foc, resolution)[view]


def _resolve_targets(cmds, targets):
    """Long names of the targets; a shape name is replaced by its transform."""
    out = []
    for t in targets:
        found = cmds.ls(t, long=True) or []
        if not found:
            raise ValueError("no node named %s" % t)
        n = found[0]
        if cmds.nodeType(n) != "transform" and "shape" in (cmds.nodeType(n, inherited=True) or []):
            n = (cmds.listRelatives(n, parent=True, fullPath=True) or [n])[0]
        if n not in out:
            out.append(n)
    return out


def _tile_rgb(path, mode, tile, gamma, view_alpha_src=None):
    w, h, d = read_rgba(path)
    if mode == "silhouette":
        rgb = alpha_silhouette(d)
    else:
        rgb = rgba_to_rgb(d)
        if gamma:
            rgb = rgb.translate(srgb_lut())
    return downsample(w, h, rgb, tile, tile), (w, h)


def review(targets, out_dir, views=DEFAULT_VIEWS, modes=DEFAULT_MODES, resolution=1024, tile=512,
           margin=1.1, focus=None, samples=None, denoise=True, title=None, checker_repeats=None,
           checker_colors=None, shader_modes=None, subdiv=None, render_prefix="", sheet_name="review_sheet.png",
           json_name="review.json"):
    """Render modes x views of the targets and write one contact sheet. Returns a dict:
    sheet, sheet_size, tiles {mode: {view: png}}, cameras {view: camera_record}, seconds,
    renders, notes, reader. modes may include "checker" and the keys of shader_modes (see
    the module docstring); the cameras are also saved in review.json."""
    cmds = _cmds()
    t0 = time.time()
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    targets = _resolve_targets(cmds, targets if isinstance(targets, (list, tuple)) else [targets])
    custom = _normalize_modes(shader_modes)
    unknown = [m for m in modes if m not in BUILTIN_MODES and m not in custom]
    if unknown:
        raise ValueError("unknown modes %s (built-in %s, custom %s)" % (unknown, BUILTIN_MODES, sorted(custom)))
    checker = None
    if "checker" in modes:
        checker = {"repeats": checker_repeats or CHECKER_REPEATS, "colors": checker_colors or CHECKER_COLORS}
    log = []
    tiles = {m: {} for m in modes}
    raw = {}
    up = cmds.upAxis(q=True, axis=True)
    pts = _target_points_ui(cmds, targets)
    f_ui = 1.0 / UI_TO_CM.get(cmds.currentUnit(q=True, linear=True), 1.0)
    foc = (tuple(x * f_ui for x in focus[0]), float(focus[1]) * f_ui) if focus else None
    center, pts = frame_points(pts, foc)
    cameras = view_cameras(pts, views, up, margin, None, resolution)      # pts already framed
    render_modes = [m for m in modes if m != "silhouette"]
    if "silhouette" in modes and not any(m in render_modes for m in ("wire", "normals")):
        render_modes.append("normals")        # silhouette needs an unlit render's alpha
    with _Session(targets, out_dir, resolution, samples, denoise, log, subdiv=subdiv, checker=checker,
                  shader_modes={m: s for m, s in custom.items() if m in modes}) as S:
        for mode in render_modes:
            S.assign(mode)
            for view in views:
                d = map_dir(VIEW_DIRS[view], up)
                fr = frame(pts, center, d, view in PERSPECTIVE, margin, up)
                S.aim(center, d, fr)
                raw[(mode, view)] = S.render("%s%s_%s" % (render_prefix, mode, view))
        notes = S.notes
        gamma = S.gamma
    cells = []
    for mode in modes:
        for view in views:
            src = raw.get((mode, view))
            if mode == "silhouette":
                src = raw.get(("wire", view)) or raw.get(("normals", view))
            if not src:
                cells.append(("%s / %s (missing)" % (mode, view), None))
                continue
            rgb, _ = _tile_rgb(src, mode, tile, gamma)
            if mode == "silhouette":
                p = os.path.join(out_dir, "%ssilhouette_%s.png" % (render_prefix, view))
                w, h, d = read_rgba(src)
                write_png(p, w, h, alpha_silhouette(d))
                src = p
            tiles[mode][view] = src
            cells.append(("%s / %s" % (mode, view), rgb))
    sheet, size = contact_sheet(cells, len(views), tile, tile, os.path.join(out_dir, sheet_name),
                                title=title)
    rec = {"sheet": sheet, "sheet_size": size, "tiles": tiles, "cameras": cameras, "renders": log, "notes": notes,
           "reader": _READER_USED.get("name"), "resolution": resolution, "tile": tile,
           "seconds": round(time.time() - t0, 2), "targets": targets, "modes": list(modes),
           "subdiv": subdiv, "checker_repeats": (checker or {}).get("repeats")}
    if json_name:
        with open(os.path.join(out_dir, json_name), "w") as f:
            json.dump(rec, f, indent=1)
    return rec


def turntable(targets, out_dir, frames=24, mode="clay", resolution=512, elevation=15.0, margin=1.15,
              columns=8, video=True, fps=24):
    """Orbit a perspective camera around the up axis and render `frames` stills; writes a
    strip sheet and, if ffmpeg is on PATH, an mp4 [added]."""
    cmds = _cmds()
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    targets = _resolve_targets(cmds, targets if isinstance(targets, (list, tuple)) else [targets])
    up = cmds.upAxis(q=True, axis=True)
    pts = _target_points_ui(cmds, targets)
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    center = tuple((lo[i] + hi[i]) / 2.0 for i in range(3))
    log, paths = [], []
    el = math.radians(elevation)
    dists = []
    dirs = []
    for i in range(frames):
        a = 2 * math.pi * i / frames
        d = map_dir((math.sin(a) * math.cos(el), math.sin(el), math.cos(a) * math.cos(el)), up)
        dirs.append(d)
        dists.append(frame(pts, center, d, True, margin, up))
    far = max(dists, key=lambda x: x["distance"])      # constant distance: no breathing
    with _Session(targets, out_dir, resolution, None, True, log) as S:
        S.assign("wire" if mode == "silhouette" else mode)
        for i, d in enumerate(dirs):
            S.aim(center, d, far)
            paths.append(S.render("turn_%s_%04d" % (mode, i + 1)))
        notes, gamma = S.notes, S.gamma
    tile = min(resolution, 256)
    cells = [("F%d" % (i + 1), _tile_rgb(p, mode, tile, gamma)[0]) for i, p in enumerate(paths)]
    sheet, size = contact_sheet(cells, min(columns, frames), tile, tile, os.path.join(out_dir, "turntable_sheet.png"))
    rec = {"frames": paths, "sheet": sheet, "notes": notes, "renders": log}
    ff = shutil.which("ffmpeg")
    if video and ff:
        pattern = os.path.join(out_dir, "turn_%s_%%04d.png" % mode)
        mp4 = os.path.join(out_dir, "turntable_%s.mp4" % mode)
        try:
            subprocess.check_call([ff, "-y", "-loglevel", "error", "-framerate", str(fps), "-i", pattern,
                                   "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", mp4])
            rec["video"] = mp4
        except Exception as exc:
            rec["notes"].append("ffmpeg failed: %s" % exc)
    return rec


# =========================================================================== GUI playblast
def playblast(path, start=None, end=None, camera=None, width=1280, height=720, fmt="image",
              compression="png", panel=None, display=None, ornaments=False, frames=None,
              percent=100, offscreen=True):
    """Viewport playblast of the scene (GUI session only: playblast needs a model panel).
    path: output path without extension (image sequences get .####.png). display: dict of
    modelEditor flags applied temporarily, e.g. {"displayAppearance": "smoothShaded",
    "wireframeOnShaded": True, "grid": False, "useDefaultMaterial": True}. Restores the
    panel camera and editor flags afterwards. Returns playblast's own return value."""
    cmds = _cmds()
    if cmds.about(batch=True):
        raise RuntimeError("playblast needs the GUI session (mx_bridge); headless, use review() or turntable()")
    if panel is None:
        vis = cmds.getPanel(visiblePanels=True) or []
        panel = next((p for p in vis if cmds.getPanel(typeOf=p) == "modelPanel"), None)
        panel = panel or next(iter(cmds.getPanel(type="modelPanel") or []), None)
    if not panel:
        raise RuntimeError("no model panel to playblast from")
    old_cam = cmds.modelPanel(panel, q=True, camera=True)
    old_flags = {}
    try:
        if camera:
            cmds.modelPanel(panel, e=True, camera=camera)
        for flag, val in (display or {}).items():
            old_flags[flag] = cmds.modelEditor(panel, q=True, **{flag: True})
            cmds.modelEditor(panel, e=True, **{flag: val})
        if start is None:
            start = cmds.playbackOptions(q=True, minTime=True)
        if end is None:
            end = cmds.playbackOptions(q=True, maxTime=True)
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        kw = dict(filename=path, format=fmt, compression=compression, forceOverwrite=True, viewer=False,
                  showOrnaments=ornaments, offScreen=offscreen, percent=percent, widthHeight=(width, height),
                  framePadding=4, quality=100, clearCache=True, editorPanelName=panel)
        if frames:
            kw["frame"] = list(frames)
        else:
            kw.update(startTime=start, endTime=end)
        return cmds.playblast(**kw)
    finally:
        for flag, val in old_flags.items():
            try:
                cmds.modelEditor(panel, e=True, **{flag: val})
            except Exception:
                pass
        if camera and old_cam:
            cmds.modelPanel(panel, e=True, camera=old_cam)


# =========================================================================== CLI (via mx_run)
def main(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="mx_review")
    ap.add_argument("--targets", required=True, help="comma list of nodes")
    ap.add_argument("--out", required=True)
    ap.add_argument("--views", default=",".join(DEFAULT_VIEWS))
    ap.add_argument("--modes", default=",".join(DEFAULT_MODES))
    ap.add_argument("--res", type=int, default=1024)
    ap.add_argument("--tile", type=int, default=512)
    ap.add_argument("--turntable", type=int, default=0, help="frames; 0 = contact sheet only")
    ap.add_argument("--checker-repeats", type=float, default=None, help="with --modes checker")
    ap.add_argument("--subdiv", type=int, default=None, help="Arnold catclark iterations on the duplicates")
    a = ap.parse_args(argv)
    targets = [t for t in a.targets.split(",") if t]
    if a.turntable:
        return turntable(targets, a.out, frames=a.turntable, resolution=a.res)
    return review(targets, a.out, views=tuple(v for v in a.views.split(",") if v),
                  modes=tuple(m for m in a.modes.split(",") if m), resolution=a.res, tile=a.tile,
                  checker_repeats=a.checker_repeats, subdiv=a.subdiv)
