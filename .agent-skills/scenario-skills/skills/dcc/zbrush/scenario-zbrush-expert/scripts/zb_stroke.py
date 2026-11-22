"""
zb_stroke: build ZBrush stroke strings from canvas points, and map model points to canvas pixels.

Pure Python (no numpy), so it imports both inside ZBrush 2026 (CPython 3.11.9) and on the
agent side (system python3). Only `play()` needs `zbrush.commands`.

What is proven (ZBrush 2026.2.1, tests/code/zbrush-expert/v01..v03):
  * `zbc.Stroke("(ZObjStrokeV02n<N>=H<x>V<y>...)")` with canvas pixels in upper-case hex,
    replayed with `zbc.canvas_stroke(stroke)`, sculpts in Edit mode (v02: volume 4.189 -> 4.193).
    `encode()` reproduces the v02 string byte for byte (offline test).
  * Canvas pixels are document pixels, origin top left, y down: the strokes land at the same
    pixels in the `Document:Export` PNG (v03_canvas.png).
  * Front view, in the space of the exported OBJ: canvas_x = pos_x + k*s*x, canvas_y = pos_y
    - k*s*y, and +Z faces the camera (strokes below the canvas centre landed at negative OBJ Y
    on the +Z hemisphere of fixtures/v03_sphere.obj; k*s was 207 px per unit there).

What is NOT proven yet ([verify], see tests/code/zbrush-expert/live_02, live_04):
  * The decimal point count `n<N>` (the Maxon doc example has 27 points after `n27`, the v02
    string had 11 after `n11`; both consistent with decimal).
  * Lower-case `h`/`v` sub-pixel coordinates (value / 256), decoded from the Maxon doc example.
  * Any pressure token. `encode(..., pressure=...)` refuses unless PRESSURE_TOKEN is set after
    live_02 identifies one. Substitute: set Draw:Z Intensity / Draw:Draw Size per stroke.
  * The Euler rotation convention of get_transform/set_transform and the scale factor k.
    DEFAULT_CONVENTION is a hypothesis; `fit_convention()` measures the real one from dab
    samples (live_04) and `save_convention()` installs it as camera_convention.json.

Canvas-space helpers: line, polyline, arc, zigzag, dab, resample, clip_to_canvas.
Model-space helpers: Camera (project model points), frame_transform, visible_mask,
front_most_vertex, fit_convention.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import itertools
import json
import math
import os
import re

__all__ = [
    "encode", "decode", "to_stroke", "play", "resample", "line", "polyline", "arc", "zigzag",
    "dab", "clip_to_canvas", "path_length", "Convention", "DEFAULT_CONVENTION",
    "load_convention", "save_convention", "rotation_matrix", "Camera", "frame_transform",
    "visible_mask", "front_most_vertex", "fit_convention", "VIEWS",
]

HERE = os.path.dirname(os.path.abspath(__file__))
CONVENTION_FILE = os.path.join(HERE, "camera_convention.json")

STROKE_PREFIX = "ZObjStrokeV02"
# Token that carries per-point pressure, once live_02 finds one (for example "P" with a hex
# byte). None means: pressure is not encodable yet.
PRESSURE_TOKEN = None


# --------------------------------------------------------------------------------------------
# Stroke strings
# --------------------------------------------------------------------------------------------

def _num(v, subpixel):
    """Canvas coordinate -> (letter case, hex digits). Integers use H/V, fractions h/v (x256)."""
    if v < 0:
        raise ValueError(f"negative canvas coordinate {v}: clip the path first (clip_to_canvas)")
    if subpixel and abs(v - round(v)) > 1e-6:
        return True, format(int(round(v * 256)), "X")
    return False, format(int(round(v)), "X")


def encode(points, pressure=None, subpixel=False):
    """Stroke string in the V02 format proven in v02: '(ZObjStrokeV02n<N>=H<x>V<y>...)'.

    points: iterable of (x, y) canvas pixels (document space, origin top left, y down).
    pressure: optional list of 0..1 values; refused until PRESSURE_TOKEN is known [verify].
    subpixel: emit lower-case h/v with 1/256 fractions for non-integer points [verify].
    """
    pts = [(float(p[0]), float(p[1])) for p in points]
    if not pts:
        raise ValueError("empty stroke")
    if pressure is not None:
        if PRESSURE_TOKEN is None:
            raise NotImplementedError(
                "no pressure token is known for V02 strings [verify with live_02]; set "
                "Draw:Z Intensity or Draw:Draw Size per stroke instead")
        if len(pressure) != len(pts):
            raise ValueError("pressure list length differs from points")
    body = []
    for i, (x, y) in enumerate(pts):
        lx, hx = _num(x, subpixel)
        ly, hy = _num(y, subpixel)
        body.append(("h" if lx else "H") + hx + ("v" if ly else "V") + hy)
        if pressure is not None:
            body.append(PRESSURE_TOKEN + format(max(0, min(255, int(round(pressure[i] * 255)))), "X"))
    return f"({STROKE_PREFIX}n{len(pts)}={''.join(body)})"


_TOKEN = re.compile(r"([A-Za-z])(-?[0-9A-F]*)")


def decode(s):
    """Parse a stroke string (V02 or V03) into {'version', 'count', 'header', 'points',
    'extras'}. Tolerates unknown tokens (the shipped macro string carries 'Y', 'K1', 'X').
    Lower-case h/v values are divided by 256 (decoded from the Maxon doc example)."""
    s = s.strip()
    m = re.match(r"^\(?ZObjStroke(V\d\d)n(\d+)(.*?)=(.*?)\)?$", s)
    if not m:
        raise ValueError("not a ZObjStroke string")
    version, count, header, body = m.group(1), int(m.group(2)), m.group(3), m.group(4)
    points, extras = [], {}
    cur_x = None
    for letter, val in _TOKEN.findall(body):
        if letter in "Hh":
            cur_x = int(val, 16) / (256.0 if letter == "h" else 1.0)
        elif letter in "Vv":
            if cur_x is None:
                raise ValueError("V before H in stroke body")
            points.append((cur_x, int(val, 16) / (256.0 if letter == "v" else 1.0)))
            cur_x = None
        else:
            extras.setdefault(len(points), []).append(letter + val)
    return {"version": version, "count": count, "header": header, "points": points,
            "extras": extras}


def to_stroke(points, zbc=None, **kw):
    """zbc.Stroke object for the points (inside ZBrush only)."""
    zbc = zbc or _zbc()
    return zbc.Stroke(encode(points, **kw))


def play(points, zbc=None, rotation=None, h_scale=None, v_scale=None, h_offset=None,
         v_offset=None, **kw):
    """Draw the points as one stroke with zbc.canvas_stroke (inside ZBrush, Edit mode on).
    Returns canvas_stroke's bool. Proven for plain point lists (v02)."""
    zbc = zbc or _zbc()
    st = zbc.Stroke(encode(points, **kw))
    return zbc.canvas_stroke(st, None, rotation, h_scale, v_scale, h_offset, v_offset)


def _zbc():
    from zbrush import commands as zbc  # only available inside ZBrush
    return zbc


# --------------------------------------------------------------------------------------------
# Canvas-space paths
# --------------------------------------------------------------------------------------------

def path_length(points):
    return sum(math.dist(points[i], points[i + 1]) for i in range(len(points) - 1))


def resample(points, spacing_px, keep_corners=False):
    """Points evenly spaced along the polyline (keeps both ends). keep_corners=True samples
    each segment on its own (gaps <= spacing) so every input vertex stays in the path."""
    pts = [(float(x), float(y)) for x, y in points]
    if len(pts) < 2 or spacing_px <= 0:
        return pts
    if keep_corners:
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            n = max(1, int(math.ceil(math.dist(a, b) / spacing_px - 1e-9)))
            out += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)
                    for i in range(1, n + 1)]
        return out
    out = [pts[0]]
    carry = 0.0
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        if seg == 0:
            continue
        t = spacing_px - carry
        while t <= seg + 1e-9:
            out.append((a[0] + (b[0] - a[0]) * t / seg, a[1] + (b[1] - a[1]) * t / seg))
            t += spacing_px
        carry = seg - (t - spacing_px)
    if math.dist(out[-1], pts[-1]) > 1e-6:
        out.append(pts[-1])
    return out


def line(p0, p1, spacing=4.0):
    return resample([p0, p1], spacing)


def polyline(points, spacing=4.0, closed=False, keep_corners=True):
    pts = list(points)
    if closed and pts and pts[0] != pts[-1]:
        pts.append(pts[0])
    return resample(pts, spacing, keep_corners)


def arc(center, radius, a0_deg, a1_deg, spacing=4.0):
    """Arc on the canvas; angles in degrees, 0 = +x (right), 90 = +y (down, canvas y)."""
    span = math.radians(a1_deg - a0_deg)
    n = max(2, int(abs(span) * radius / max(spacing, 1e-6)) + 1)
    return [(center[0] + radius * math.cos(math.radians(a0_deg) + span * i / (n - 1)),
             center[1] + radius * math.sin(math.radians(a0_deg) + span * i / (n - 1)))
            for i in range(n)]


def zigzag(p0, p1, amplitude, wavelength, spacing=4.0):
    """Triangle wave from p0 to p1, amplitude in px perpendicular to the path."""
    length = math.dist(p0, p1)
    if length == 0:
        return [tuple(p0)]
    ux, uy = (p1[0] - p0[0]) / length, (p1[1] - p0[1]) / length
    nx, ny = -uy, ux
    corners = []
    half = wavelength / 2.0
    k = 0
    while k * half <= length + 1e-9:
        t = min(k * half, length)
        off = 0.0 if k == 0 or t >= length else (amplitude if k % 2 else -amplitude)
        corners.append((p0[0] + ux * t + nx * off, p0[1] + uy * t + ny * off))
        k += 1
    if math.dist(corners[-1], p1) > 1e-6:
        corners.append(tuple(p1))
    return resample(corners, spacing, keep_corners=True)


def dab(p, repeats=2):
    """Single-point stamp: the same point repeated. The v01 recorded click-drag ended with a
    repeated point; whether 1, 2 or 3 repeats sculpt best is [verify] (live_02)."""
    return [(float(p[0]), float(p[1]))] * max(1, int(repeats))


def clip_to_canvas(points, width, height, margin=0.0):
    """Drop points outside [margin, size - margin]; returns the kept points."""
    return [(x, y) for x, y in points
            if margin <= x <= width - margin and margin <= y <= height - margin]


# --------------------------------------------------------------------------------------------
# Model space -> canvas pixels
# --------------------------------------------------------------------------------------------

class Convention:
    """How get_transform() values map model points (OBJ-export space) to canvas pixels.

    view = R(angles) . diag(axes) . (p - pivot)
    canvas_x = pos_x + k * s * fx * view_x ; canvas_y = pos_y + k * s * fy * view_y
    depth toward the camera = fz * view_z
    R = product of three axis rotations, one per transform angle: `perm` names the axis each
    of x_rotate, y_rotate, z_rotate turns about, `order` the product order (leftmost applied
    last), `signs` the sign of each angle.
    """

    FIELDS = ("perm", "order", "signs", "axes", "fx", "fy", "fz", "k", "use_pivot", "source")

    def __init__(self, perm="xyz", order="xyz", signs=(1, 1, 1), axes=(1, 1, 1), fx=1, fy=-1,
                 fz=1, k=1.0, use_pivot=True, source="hypothesis"):
        self.perm, self.order = perm, order
        self.signs, self.axes = tuple(signs), tuple(axes)
        self.fx, self.fy, self.fz, self.k = fx, fy, fz, float(k)
        self.use_pivot, self.source = bool(use_pivot), source

    def to_dict(self):
        return {f: (list(getattr(self, f)) if isinstance(getattr(self, f), tuple)
                    else getattr(self, f)) for f in self.FIELDS}

    @classmethod
    def from_dict(cls, d):
        return cls(**{f: d[f] for f in cls.FIELDS if f in d})

    def __repr__(self):
        return f"Convention({self.to_dict()})"


# Hypothesis H0. fx, fy, fz: measured at the front view on fixtures/v03_sphere.obj (v01-v03
# strokes). perm/order: the Maxon set_transform example calls (0, 90, 90) a top view; with
# R = Rx.Ry.Rz that turns model Y onto the view axis [doc]. k = 1: Maxon's turntable example
# frames with scale = min(w, h) / longest_side * 0.75 [doc]. All [verify] until live_04.
_H0 = Convention(source="H0: front-view signs from v03 OBJ; order from Maxon examples [verify]")


def load_convention(path=CONVENTION_FILE):
    if path and os.path.exists(path):
        with open(path) as fh:
            return Convention.from_dict(json.load(fh))
    return _H0


def save_convention(conv, path=CONVENTION_FILE, extra=None):
    d = conv.to_dict()
    if extra:
        d["fit"] = extra
    with open(path, "w") as fh:
        json.dump(d, fh, indent=1)
    return path


DEFAULT_CONVENTION = load_convention()


def _rot(axis, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    if axis == "x":
        return ((1, 0, 0), (0, c, -s), (0, s, c))
    if axis == "y":
        return ((c, 0, s), (0, 1, 0), (-s, 0, c))
    return ((c, -s, 0), (s, c, 0), (0, 0, 1))


def _mm(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3))
                 for i in range(3))


def _mv(m, v):
    return tuple(m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2] for i in range(3))


def rotation_matrix(rx, ry, rz, perm="xyz", order="xyz", signs=(1, 1, 1)):
    """3x3 rotation for transform angles (degrees). `perm[i]` is the axis angle i turns about;
    `order` lists angle names left to right in the product (so the last one applies first)."""
    ang = {"x": signs[0] * rx, "y": signs[1] * ry, "z": signs[2] * rz}
    axis = {"x": perm[0], "y": perm[1], "z": perm[2]}
    r = ((1, 0, 0), (0, 1, 0), (0, 0, 1))
    for name in order:
        r = _mm(r, _rot(axis[name], ang[name]))
    return r


class Camera:
    """Projection for one get_transform() reading.

    transform: the 9 floats of zbc.get_transform() (pos xyz, scale xyz, rot xyz degrees).
    pivot: model point that sits at the transform position; default the bbox centre of the
    mesh the points come from (an exported OBJ) [verify pivot for multi-SubTool tools].
    """

    def __init__(self, transform, pivot=(0.0, 0.0, 0.0), convention=None):
        t = [float(v) for v in transform]
        if len(t) != 9:
            raise ValueError("transform must have 9 values")
        self.t = t
        self.pos = (t[0], t[1])
        self.s = t[3]
        if max(abs(t[3] - t[4]), abs(t[3] - t[5])) > 1e-6 * max(1.0, abs(t[3])):
            raise ValueError("non-uniform view scale: keep x, y, z scale equal (MadPony)")
        self.conv = convention or DEFAULT_CONVENTION
        c = self.conv
        self.pivot = tuple(pivot) if c.use_pivot else (0.0, 0.0, 0.0)
        self.r = rotation_matrix(t[6], t[7], t[8], c.perm, c.order, c.signs)

    @classmethod
    def from_zbrush(cls, zbc=None, pivot=None, convention=None):
        """Inside ZBrush: current transform, pivot = centre of the full bbox of all SubTools."""
        zbc = zbc or _zbc()
        if pivot is None:
            b = zbc.query_mesh3d(2, 3)
            pivot = ((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2)
        return cls(zbc.get_transform(), pivot, convention)

    def to_view(self, p):
        c = self.conv
        q = ((p[0] - self.pivot[0]) * c.axes[0], (p[1] - self.pivot[1]) * c.axes[1],
             (p[2] - self.pivot[2]) * c.axes[2])
        return _mv(self.r, q)

    def project(self, p):
        """(canvas_x, canvas_y, depth); larger depth = closer to the camera."""
        v = self.to_view(p)
        c = self.conv
        g = c.k * self.s
        return (self.pos[0] + g * c.fx * v[0], self.pos[1] + g * c.fy * v[1], c.fz * v[2])

    def project_many(self, points):
        return [self.project(p) for p in points]

    def facing(self, normal):
        """> 0 when a model-space normal points toward the camera."""
        c = self.conv
        n = (normal[0] * c.axes[0], normal[1] * c.axes[1], normal[2] * c.axes[2])
        return c.fz * _mv(self.r, n)[2]

    def pixels_per_unit(self):
        return self.conv.k * self.s


def frame_transform(bbox, doc_w, doc_h, rotation=(0, 0, 0), margin=0.75, convention=None):
    """9-value transform that centres the model and makes its longest bbox side span
    `margin` of the short canvas side (Maxon's turntable rule, divided by k).
    bbox: (minx, miny, minz, maxx, maxy, maxz) as query_mesh3d(2, ...) returns it."""
    conv = convention or DEFAULT_CONVENTION
    longest = max(bbox[3] - bbox[0], bbox[4] - bbox[1], bbox[5] - bbox[2])
    if longest <= 0:
        raise ValueError("empty bbox")
    s = min(doc_w, doc_h) / longest * margin / conv.k
    return [doc_w / 2.0, doc_h / 2.0, 0.0, s, s, s, float(rotation[0]), float(rotation[1]),
            float(rotation[2])]


# Review views as rotation triples. front: default view of a freshly drawn tool. top: the
# Maxon set_transform example. back: key 2 of the Maxon turntable example. right and
# threequarter: plain y rotations. Which side "right" shows is [verify] (live_03, live_04).
VIEWS = {
    "front": (0.0, 0.0, 0.0),
    "right": (0.0, 90.0, 0.0),
    "back": (0.0, 180.0, 180.0),
    "left": (0.0, -90.0, 0.0),
    "threequarter": (0.0, 45.0, 0.0),
    "top": (0.0, 90.0, 90.0),
}


def visible_mask(cam, verts, points=None, cell_px=2.0, eps=None):
    """Which points are the front-most surface at their pixel (vertex z-buffer).
    verts: all mesh vertices (model space); points: queries (default: verts).
    eps: depth tolerance in model units (default 1 percent of the depth range)."""
    proj = cam.project_many(verts)
    zbuf = {}
    for x, y, d in proj:
        key = (int(x // cell_px), int(y // cell_px))
        if d > zbuf.get(key, -1e30):
            zbuf[key] = d
    if eps is None:
        ds = [d for _, _, d in proj]
        eps = 0.01 * (max(ds) - min(ds) + 1e-12)
    qs = proj if points is None else cam.project_many(points)
    out = []
    for x, y, d in qs:
        key = (int(x // cell_px), int(y // cell_px))
        best = max(zbuf.get((key[0] + i, key[1] + j), -1e30)
                   for i in (-1, 0, 1) for j in (-1, 0, 1))
        out.append(d >= best - eps)
    return out


def front_most_vertex(cam, verts, canvas_xy, radius_px=3.0):
    """Index of the vertex closest to the camera among those projecting within radius_px of
    canvas_xy, or None: what a stroke at that pixel would hit (approximately)."""
    best, best_d = None, -1e30
    r2 = radius_px * radius_px
    for i, p in enumerate(verts):
        x, y, d = cam.project(p)
        if (x - canvas_xy[0]) ** 2 + (y - canvas_xy[1]) ** 2 <= r2 and d > best_d:
            best, best_d = i, d
    return best


def _candidates():
    for perm in ("".join(p) for p in itertools.permutations("xyz")):
        for order in ("".join(p) for p in itertools.permutations("xyz")):
            for signs in itertools.product((1, -1), repeat=3):
                for axes in itertools.product((1, -1), repeat=3):
                    for fx, fy in itertools.product((1, -1), repeat=2):
                        yield perm, order, signs, axes, fx, fy


def fit_convention(samples, use_pivot=(True, False)):
    """Find the convention that best explains measured samples.

    samples: list of dicts {"transform": 9 floats read with get_transform, "pivot": model bbox
    centre, "model": model point that the stroke hit, "canvas": (x, y) of the stroke}, plus
    optional "center" (model centre) to decide which depth sign faces the camera.
    k is solved by least squares for each candidate. Returns (Convention, rms_px, n_ties).
    Several candidates can explain the same data equally (equivalent Euler forms); any of
    them predicts the same pixels for the sampled kinds of transform.
    """
    if not samples:
        raise ValueError("no samples")
    best = None
    ties = 0
    for up in use_pivot:
        for perm, order, signs, axes, fx, fy in _candidates():
            num = den = 0.0
            pre = []
            for smp in samples:
                t = smp["transform"]
                r = rotation_matrix(t[6], t[7], t[8], perm, order, signs)
                pv = smp.get("pivot", (0, 0, 0)) if up else (0, 0, 0)
                p = smp["model"]
                v = _mv(r, ((p[0] - pv[0]) * axes[0], (p[1] - pv[1]) * axes[1],
                            (p[2] - pv[2]) * axes[2]))
                ux, uy = t[3] * fx * v[0], t[3] * fy * v[1]
                dx, dy = smp["canvas"][0] - t[0], smp["canvas"][1] - t[1]
                num += ux * dx + uy * dy
                den += ux * ux + uy * uy
                pre.append((ux, uy, dx, dy))
            if den <= 0:
                continue
            k = num / den
            if k <= 0:
                continue
            err = sum((k * ux - dx) ** 2 + (k * uy - dy) ** 2 for ux, uy, dx, dy in pre)
            rms = math.sqrt(err / len(samples))
            if best is None or rms < best[0] - 1e-9:
                best, ties = (rms, perm, order, signs, axes, fx, fy, k, up), 0
            elif abs(rms - best[0]) <= 1e-9:
                ties += 1
    rms, perm, order, signs, axes, fx, fy, k, up = best
    fz = 1
    withc = [s for s in samples if "center" in s]
    if withc:
        votes = 0.0
        for smp in withc:
            t = smp["transform"]
            r = rotation_matrix(t[6], t[7], t[8], perm, order, signs)
            vp = _mv(r, tuple((smp["model"][i] - smp["center"][i]) * axes[i] for i in range(3)))
            votes += vp[2]
        fz = 1 if votes >= 0 else -1
    conv = Convention(perm, order, signs, axes, fx, fy, fz, k, up,
                      source=f"fit_convention on {len(samples)} samples, rms {rms:.2f} px")
    return conv, rms, ties


def residuals(conv, samples):
    """Per-sample pixel error of a convention (for reporting H0 against the fit)."""
    out = []
    for smp in samples:
        cam = Camera(smp["transform"], smp.get("pivot", (0, 0, 0)), conv)
        x, y, _ = cam.project(smp["model"])
        out.append(math.dist((x, y), smp["canvas"]))
    return out
