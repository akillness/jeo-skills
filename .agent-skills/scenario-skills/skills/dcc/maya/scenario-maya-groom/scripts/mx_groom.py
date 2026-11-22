"""
mx_groom: programmatic grooming for XGen Interactive Groom in Maya 2027. Guides grown from a
flow sheet, masks written from code, modifier stacks set by value, Standard Hair presets and
lint, measurements on exported strands, close-range review renders with the real hair
shader, and the Unreal and animation handoffs.

STATUS: not yet run in Maya (written 2026-09-24, Maya 2027 not installed). The pure-Python
layers (flow field, guide growth, surface sampling, strand analysis, UV-space mask
rasterizer, lint verdicts, Alembic job strings, recipe store) ran offline on synthetic data:
tests/code/maya-groom/test_mx_groom_offline.py. Every maya.cmds / OpenMaya call is
unverified. Attribute names that are not quoted from the 2027 help live in NAME_CANDIDATES
and are resolved at run time; probe() lists what the installed Maya really has.

Why it exists: every Interactive Groom brush (Comb, Grab, Clump, Part, Density, Width, Cut,
Freeze, Twist...) is an interactive tool context with no documented stroke API. What an
agent can drive instead:
  direction   -> NURBS guide curves grown from a flow sheet, wired into the groom by
                 wire_guides(): a Guide modifier whose inGuide reads the curves through a
                 Curve to Spline (Fernandez: flow first, on the guides)
  where / how -> grayscale masks rasterized in UV space, or xgmSeExpr expressions
  look        -> modifier nodes spliced into the spline-data stack, values from the notes
  judgment    -> numbers on exported strands, plus review renders with aiStandardHair
Menu-only actions (Create Interactive Groom Splines, Export Cache, Add Modifier > Guide...)
become MEL "recipes" by QUERYING the menu items' own command strings through the GUI bridge
(menu_items / menu_recipe: cmds.menuItem(item, q=True, command=True)); Attribute Editor
buttons (Make Wires Dynamic, Reference State > Update) by querying the buttons
(button_recipe). No click is needed. Replay with run_recipe. capture_start / capture_stop
(Script Editor echo while a person clicks) stays as the last fallback. No command name is
invented here.

Two layers, as in mx_audit: pure functions on plain data (testable without Maya) and Maya
functions that extract that data or apply the result. Geometry is in scene UI units.

  import sys; sys.path.insert(0, "<scenario-maya-groom>/scripts"); import mx_groom as G
  G.load_plugins()                                   # mtoa BEFORE xgenToolkit, then Alembic
  G.probe()                                          # node types, attributes, commands, headless eval
  g = G.make_guides("scalp_GEO", FLOW, spacing=1.2, cvs=8, collide="head_GEO")
  G.measure_curves(g["group"], surface="head_GEO", flow=FLOW)       # flow coherence, penetration
  G.write_hairline_mask("scalp_GEO", "/abs/masks/hairline.png", width=1.5)
  G.insert_modifier("hair_desc", "xgmModifierNoise", position="top", values={"mask": 0.3})
  G.build_clumps("hair_desc", {"clump_density": 0.8}, levels=2, ratio=4)
  G.hair_shader("hair_desc", preset="brown");  G.lint()             # warn/error lines
  G.review(["hair_descShape"], "/abs/out/review", head="head_GEO", scalp="scalp_GEO")
  G.export_abc(["|guides", "|hair_desc|SplineGrp0"], "/abs/out/hair_ue5.abc",
               attrs=("groom_group_id", "groom_guide", "groom_root_uv"))

Headless through mx_run (plug-ins in this order):
  python3 mx_run.py --plugins mtoa,xgen,abc --scene groom.ma mx_groom.py -- probe --json /abs/p.json
  python3 mx_run.py --plugins mtoa,xgen,abc --scene groom.ma mx_groom.py -- lint --style realistic
  python3 mx_run.py --plugins abc mx_groom.py -- measure --abc /abs/cache.abc --surface head_GEO

Flow sheet (the agent's version of Fernandez's arrows drawn over the reference):
  FLOW = {
    "base": [0, -1, 0],                      # default comb direction, projected on the surface
    "controls": [                            # blended by a smooth falloff inside each radius
      {"type": "direction", "center": [0, 170, 9], "radius": 6, "vector": [0, -0.3, 1]},
      {"type": "whorl", "center": [0, 175, -8], "radius": 5, "turn": 1, "outward": 0.6},
      {"type": "part", "a": [3, 178, 6], "b": [3, 178, -4], "radius": 2},
    ],                                       # a direction without "center" applies everywhere
    "length": {"default": 5.0, "regions": [{"center": [0, 168, 10], "radius": 4, "length": 3.0}]},
  }
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import bisect
import json
import math
import os
import random
import re
import shutil
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_LEAD = os.path.normpath(os.path.join(HERE, "..", "..", "scenario-maya-expert", "scripts"))
if os.path.isdir(_LEAD) and _LEAD not in sys.path:
    sys.path.append(_LEAD)
import mx_review as R  # noqa: E402  (scenario-maya-expert toolkit: image IO, camera math, review session)

# =========================================================================== facts (with sources)
DESCRIPTION_TYPE = "xgmSplineDescription"                     # XGIG § MEL commands
MODIFIER_TYPES = ("xgmModifierSculpt", "xgmModifierScale", "xgmCurveToSpline", "xgmModifierClump",
                  "xgmModifierCollide", "xgmModifierCut", "xgmModifierDisplace", "xgmModifierGuide",
                  "xgmModifierLinearWire", "xgmModifierNoise", "xgmModifierSplineCache")  # XGIG § modifiers
DISABLING = ("xgmCurveToSpline", "xgmModifierSplineCache")   # disable every modifier below (XGIG)
DOC_COMMANDS = ("xgmSplineQuery", "xgmSplineSelect", "xgmSplineApplyRenderOverride",
                "xgmExportSplineDataInternal")               # XGIG § MEL commands
PLUGIN_ORDER = ("mtoa", "xgenToolkit")                         # HAIR § XGen: MtoA before XGen

# Logical attribute keys -> candidate Maya names. NOT verified on 2027 except where the help
# names the attribute in the UI; probe() + candidates_report() resolve them.
NAME_CANDIDATES = {
    "spline_in": ("inSplineData", "inputSplineData"),
    "spline_out": ("outSplineData",),
    "clump_strength": ("clump",),
    "clump_scale": ("clumpScale",),
    "clump_density": ("density", "clumpPointsDensity", "pointsDensity"),
    "clump_randomness": ("randomness",),
    "clump_seed": ("seed",),
    "radius_variance": ("radiusVariance",),
    "map_subdivision": ("mapSubdivisionLevel", "mapSubdLevel", "subdivisionLevel"),
    "use_control_map": ("useControlMap",),
    "control_using": ("controlUsing", "controlMap"),
    "clump_noise": ("noise",),
    "noise_frequency": ("noiseFrequency", "frequency"),
    "noise_correlation": ("noiseCorrelation",),
    "noise_scale": ("noiseScale",),
    "noise_magnitude": ("magnitude", "noiseMagnitude", "amplitude"),
    "mask": ("mask",),
    "curl": ("curl",),
    "clump_cut": ("cut",),
    "cv_count": ("cvCount", "cvsCount"),
    "density_multiplier": ("densityMultiplier",),
    "density_mask": ("densityMask",),
    "scale": ("scale",),
    "align_to_normals": ("alignToNormals",),
    "face_camera": ("faceCamera",),
    "ai_mode": ("aiMode", "aiCurveMode"),
    "ai_min_pixel_width": ("aiMinPixelWidth",),
    "ai_opaque": ("aiOpaque",),
    "se_expression": ("expression", "expr"),
    "se_output": ("outFloat", "outValue", "outAlpha", "outColorR", "out", "output"),
    "input_curves": ("inputCurves", "inCurves", "curves", "inputCurve", "inCurve"),
}

# Standard Hair (HAIR doc). Maya names are the camelCase of the Arnold params [verify each].
HAIR_REALISTIC = {"baseColor": (1.0, 1.0, 1.0), "diffuse": 0.0, "roughness": 0.2, "ior": 1.55,
                  "shift": 3.0, "specularTint": (1.0, 1.0, 1.0), "specular2Tint": (1.0, 1.0, 1.0),
                  "transmissionTint": (1.0, 1.0, 1.0), "indirectDiffuse": 1.0, "indirectSpecular": 1.0}
HAIR_PRESETS = {    # melanin: HAIR § Melanin; redness and randomize values are [added] starting points
    "black": {"melanin": 1.0, "melaninRedness": 0.0, "melaninRandomize": 0.1},
    "brown": {"melanin": 0.5, "melaninRedness": 0.2, "melaninRandomize": 0.1},
    "red": {"melanin": 0.5, "melaninRedness": 1.0, "melaninRandomize": 0.1},
    "blonde": {"melanin": 0.2, "melaninRedness": 0.2, "melaninRandomize": 0.1, "extraDepth": 8},  # HAIR § Extra Depth example
    "textured": {"melanin": 0.0},   # texture into baseColor, Melanin 0 (HAIR § Texturing Hair; Schneider 00:33:00)
}
SHIFT_BY_TYPE = {"piedmont": 2.8, "light_brown_european": 2.9, "dark_brown_european": 3.0,
                 "indian": 3.7, "japanese": 3.6, "chinese": 3.6, "african_american": 2.3,
                 "synthetic": 0.0}                             # HAIR § Shift (degrees)
HAIR_ATTRS = ("base", "baseColor", "melanin", "melaninRedness", "melaninRandomize", "roughness",
              "roughnessAzimuthal", "roughnessAnisotropic", "ior", "shift", "specularTint",
              "specular2Tint", "transmissionTint", "diffuse", "diffuseColor", "opacity",
              "indirectDiffuse", "indirectSpecular", "extraDepth", "extraSamples", "scatteringMode")

# Clump profile "roots loose": no attraction over about the first 14 % of the length
# (Fernandez 02 [00:17:56], frame 00:18:12). The 2027 help calls Clump Scale a magnitude
# ("tighter at the tips and more relaxed at the root"); legacy XGen behaved like a radius.
ROOT_LOOSE_RAMP = {"magnitude": [(0.0, 0.0), (0.14, 0.0), (1.0, 1.0)],
                   "radius": [(0.0, 1.0), (0.14, 1.0), (1.0, 0.0)]}
# Clump profile shapes read off Fernandez 02's legacy XGen frames, RADIUS convention (1 = the
# hair stays where it grows, near 0 = pulled onto the clump centre). spike: 0.01 at about
# mid length [00:05:38] (frame 00:06:00, 0.010 at 0.455); onion: a mid bulge of about 0.9
# that opens then closes (frame 00:10:51, 0.896 at 0.512). The end points (onion 0.7 at the
# root, 0.05 at the tip) are the note's reconstruction and the root-loose segment on the
# spike is this skill's [added]; the onion keeps some pull at the root, so it belongs on a
# few clumps only. profile_ramp() converts to the magnitude convention of the 2027 help
# [verify with the one-clump test].
CLUMP_PROFILES = {"root_loose": [(0.0, 1.0), (0.14, 1.0), (1.0, 0.0)],
                  "spike": [(0.0, 1.0), (0.14, 1.0), (0.455, 0.01), (1.0, 0.0)],
                  "onion": [(0.0, 0.7), (0.512, 0.9), (1.0, 0.05)]}
TIP_HALF_RAMP = [(0.0, 0.0), (0.5, 0.0), (1.0, 1.0)]   # noise masked to the tip half (Fernandez 07 [00:04:42])
CLUMP_RATIO = (3.0, 5.0)          # small clumps per big clump (Fernandez 03 [00:01:31])
MAX_CLUMP_LEVELS = 3              # 2 default, 3 long hair and manes, 4 almost never (Fernandez 03 [00:09:11])
CV_FOR_NOISE = 20                 # FlippedNormals [00:28:52]; Hadi [00:07:18]; Giovannini rebuild [00:05:20]
CV_FOR_CURL = (24, 36)            # XGIG § Create curls and coils
STRAY_MAX = 0.20                  # stray share 5 %, some descriptions 20 % (Giovannini [00:09:28])
LENGTH_RANDOM = (0.8, 1.2)        # random length balanced around 1 (Fernandez 08 [00:09:33])
FILL_KEEP = 2.0 / 3.0             # fill layer = body guides cut to about 2/3 (Giovannini [00:05:56])
NOISE_FLOOR = 0.001               # frizz() mean above which a strand counts as noisy [added, synthetic calibration]

# =========================================================================== small vector math
def _v(a):
    return (float(a[0]), float(a[1]), float(a[2]))


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _len(a):
    return math.sqrt(_dot(a, a))


def _dist(a, b):
    return _len(_sub(a, b))


def _unit(a):
    n = _len(a)
    return (0.0, 0.0, 0.0) if n < 1e-12 else (a[0] / n, a[1] / n, a[2] / n)


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def _tangent(v, n):
    """v projected into the plane perpendicular to the unit normal n."""
    return _sub(v, _mul(n, _dot(v, n)))


def _any_tangent(n):
    ref = (1.0, 0.0, 0.0) if abs(n[0]) < 0.9 else (0.0, 1.0, 0.0)
    return _unit(_cross(n, ref))


def _angle_deg(a, b):
    c = max(-1.0, min(1.0, _dot(_unit(a), _unit(b))))
    return math.degrees(math.acos(c))


def _median(xs):
    s = sorted(xs)
    if not s:
        return None
    m = len(s) // 2
    return s[m] if len(s) % 2 else 0.5 * (s[m - 1] + s[m])


def _mean(xs):
    return sum(xs) / len(xs) if xs else None


def _cv(xs):
    if len(xs) < 2:
        return None
    m = _mean(xs)
    if not m:
        return None
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) / abs(m)


def _pct(xs, q):
    s = sorted(xs)
    if not s:
        return None
    return s[min(len(s) - 1, int(round(q * (len(s) - 1))))]


def smoothstep(e0, e1, x):
    if e1 == e0:
        return 1.0 if x >= e1 else 0.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def _falloff(d, r):
    """Smooth weight 1 at the center, 0 at radius r."""
    if r is None or r <= 0 or d >= r:
        return 0.0
    x = d / r
    return (1.0 - x * x) ** 2


def _closest_on_segment(p, a, b):
    ab = _sub(b, a)
    L2 = _dot(ab, ab)
    if L2 < 1e-18:
        return a
    t = max(0.0, min(1.0, _dot(_sub(p, a), ab) / L2))
    return _add(a, _mul(ab, t))


# =========================================================================== flow field (pure)
def check_flow_sheet(flow):
    """Problems in a flow sheet as strings (empty list = usable)."""
    out = []
    if "base" not in flow and not any("center" not in c for c in flow.get("controls", ())):
        out.append("no 'base' direction and no global direction control")
    for i, c in enumerate(flow.get("controls", ())):
        t = c.get("type", "direction")
        need = {"direction": ("vector",), "whorl": ("center", "radius"), "part": ("a", "b", "radius")}.get(t)
        if need is None:
            out.append("control %d: unknown type %r" % (i, t))
            continue
        for k in need:
            if k not in c:
                out.append("control %d (%s): missing %r" % (i, t, k))
        if t == "direction" and "center" in c and "radius" not in c:
            out.append("control %d: a centered direction needs a radius" % i)
    L = flow.get("length", 1.0)
    if isinstance(L, dict) and "default" not in L:
        out.append("length dict needs a 'default'")
    return out


def flow_vector(p, n, flow):
    """Unit tangent direction of the flow at surface point p with normal n (pure)."""
    n = _unit(n)
    acc, wsum = (0.0, 0.0, 0.0), 0.0
    for c in flow.get("controls", ()):
        t = c.get("type", "direction")
        w0 = float(c.get("weight", 1.0))
        if t == "part":
            q = _closest_on_segment(p, _v(c["a"]), _v(c["b"]))
            w = _falloff(_dist(p, q), c["radius"]) * w0
            v = _tangent(_sub(p, q), n)
            if _len(v) < 1e-9:                             # on the part line: use its declared side
                v = _tangent(_v(c.get("side", (1.0, 0.0, 0.0))), n)
        elif t == "whorl":
            cen = _v(c["center"])
            w = _falloff(_dist(p, cen), c["radius"]) * w0
            radial = _unit(_tangent(_sub(p, cen), n))
            if _len(radial) < 1e-9:
                radial = _any_tangent(n)
            swirl = _mul(_unit(_cross(n, radial)), float(c.get("turn", 1.0)))
            o = float(c.get("outward", 0.5))
            v = _add(_mul(radial, o), _mul(swirl, 1.0 - o))
        else:
            w = w0 if "center" not in c else _falloff(_dist(p, _v(c["center"])), c["radius"]) * w0
            v = _v(c["vector"])
        v = _unit(_tangent(v, n))
        if w > 0 and _len(v) > 0:
            acc = _add(acc, _mul(v, w))
            wsum += w
    if wsum < 1.0:
        base = _unit(_tangent(_v(flow.get("base", (0.0, -1.0, 0.0))), n))
        acc = _add(acc, _mul(base, 1.0 - wsum))
    out = _unit(_tangent(acc, n))
    return out if _len(out) > 0 else _any_tangent(n)


def flow_length(p, flow):
    """Guide length at p: flow['length'] as a number, or {'default', 'regions'} blended."""
    L = flow.get("length", 1.0)
    if not isinstance(L, dict):
        return float(L)
    val, wsum = 0.0, 0.0
    for r in L.get("regions", ()):
        w = _falloff(_dist(p, _v(r["center"])), r["radius"])
        val += w * float(r["length"])
        wsum += w
    if wsum < 1.0:
        val += (1.0 - wsum) * float(L["default"])
        wsum = 1.0
    return val / wsum


def grow_guide(root, normal, flow, length=None, cvs=8, lift=(0.5, 0.05), gravity=0.0, down=None,
               surface=None, offset=None):
    """Points (root first) of one guide grown along the flow field (pure).

    lift: weight of the surface normal at the root and at the tip, so the guide stands up at
      the root and lies down toward the tip [added]. gravity: extra pull along `down` (default
      -Y) that grows toward the tip [added]. surface(p) -> (closest point, unit normal): keeps
      every CV at least `offset` outside the surface (the scripted Collide with Mesh).
    Short fur changes direction faster than long hair (Fernandez 01 [00:05:36]): use shorter
    guides and more of them where the flow sheet turns sharply."""
    if cvs < 4:
        raise ValueError("cvs must be >= 4 for a cubic curve")
    L = float(length if length is not None else flow_length(root, flow))
    step = L / (cvs - 1)
    down = _unit(_v(down or (0.0, -1.0, 0.0)))
    p, n0 = _v(root), _unit(_v(normal))
    pts = [p]
    for i in range(1, cvs):
        t = i / float(cvs - 1)
        n = n0
        if surface is not None:
            n = _unit(_v(surface(p)[1]))
        d = flow_vector(p, n, flow)
        w = lift[0] + (lift[1] - lift[0]) * t
        direction = _unit(_add(_mul(d, 1.0 - w), _mul(n, w)))
        if gravity:
            direction = _unit(_add(direction, _mul(down, gravity * t)))
        p = _add(p, _mul(direction, step))
        if surface is not None and offset is not None:
            cp, cn = surface(p)
            cn = _unit(_v(cn))
            h = _dot(_sub(p, _v(cp)), cn)
            if h < offset:
                p = _add(p, _mul(cn, offset - h))
        pts.append(p)
    return pts


# =========================================================================== spatial helpers (pure)
class _Grid(object):
    def __init__(self, cell, points=()):
        self.cell = max(float(cell), 1e-12)
        self.pts = []
        self.cells = {}
        for p in points:
            self.add(p)

    def key(self, p):
        c = self.cell
        return (int(math.floor(p[0] / c)), int(math.floor(p[1] / c)), int(math.floor(p[2] / c)))

    def add(self, p):
        self.cells.setdefault(self.key(p), []).append(len(self.pts))
        self.pts.append(p)

    def near(self, p, r):
        k = self.key(p)
        m = int(math.ceil(r / self.cell))
        r2 = r * r
        for dx in range(-m, m + 1):
            for dy in range(-m, m + 1):
                for dz in range(-m, m + 1):
                    for i in self.cells.get((k[0] + dx, k[1] + dy, k[2] + dz), ()):
                        q = self.pts[i]
                        if (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2 <= r2:
                            yield i


def nn_distances(points, sample=2000, seed=1):
    """Nearest-neighbour distances of a sample of the points (pure)."""
    n = len(points)
    if n < 2:
        return []
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    diag = _dist(lo, hi) or 1.0
    cell = max(diag / math.sqrt(n), diag * 1e-6)
    g = _Grid(cell, points)
    idx = list(range(n)) if n <= sample else random.Random(seed).sample(range(n), sample)
    out = []
    for i in idx:
        r, best = cell, None
        for _ in range(12):
            for j in g.near(points[i], r):
                if j != i:
                    d = _dist(points[i], points[j])
                    best = d if best is None else min(best, d)
            if best is not None and best <= r:
                break
            r *= 2.0
        if best is not None:
            out.append(best)
    return out


def cluster(points, link):
    """Single-linkage clusters (lists of indices, largest first) of points closer than link."""
    n = len(points)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    g = _Grid(link, points)
    for i, p in enumerate(points):
        for j in g.near(p, link):
            if j > i:
                a, b = find(i), find(j)
                if a != b:
                    parent[b] = a
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return sorted(groups.values(), key=len, reverse=True)


# =========================================================================== surface sampling (pure)
def _tri_area(a, b, c):
    return 0.5 * _len(_cross(_sub(b, a), _sub(c, a)))


def _bary(ps, a, b, c):
    return (ps[0][0] * a + ps[1][0] * b + ps[2][0] * c,
            ps[0][1] * a + ps[1][1] * b + ps[2][1] * c,
            ps[0][2] * a + ps[1][2] * b + ps[2][2] * c)


def surface_area(tris):
    return sum(_tri_area(*t["p"]) for t in tris)


def sample_triangles(tris, count=None, spacing=None, seed=1, mask=None, max_tries=40):
    """Roots on a triangulated surface: area-weighted random points with a minimum spacing
    (dart throwing) [added]. tris: records {"p": (p0, p1, p2), "n": (n0, n1, n2),
    "uv": (uv0, uv1, uv2) or None, ...} as mesh_triangles() returns them. mask(p, n, uv) ->
    0..1 keeps a point with that probability. Without count, count = 0.6 * area / spacing^2,
    about what random sequential packing can reach. Returns [{"p", "n", "uv", "tri"}]."""
    if not tris:
        return []
    areas = [_tri_area(*t["p"]) for t in tris]
    total = sum(areas)
    if total <= 0:
        return []
    if count is None:
        if not spacing:
            raise ValueError("give count or spacing")
        count = max(1, int(0.6 * total / (spacing * spacing)))
    cum, s = [], 0.0
    for a in areas:
        s += a
        cum.append(s)
    rng = random.Random(seed)
    grid = _Grid(spacing) if spacing else None
    out, tries = [], 0
    while len(out) < count and tries < count * max_tries:
        tries += 1
        k = min(bisect.bisect(cum, rng.random() * total), len(tris) - 1)
        t = tris[k]
        s1, r2 = math.sqrt(rng.random()), rng.random()
        a, b, c = 1.0 - s1, s1 * (1.0 - r2), s1 * r2
        p = _bary(t["p"], a, b, c)
        nrm = _unit(_bary(t["n"], a, b, c)) if t.get("n") else None
        uv = None
        if t.get("uv"):
            u = t["uv"]
            uv = (u[0][0] * a + u[1][0] * b + u[2][0] * c, u[0][1] * a + u[1][1] * b + u[2][1] * c)
        if nrm is None or _len(nrm) == 0:
            nrm = _unit(_cross(_sub(t["p"][1], t["p"][0]), _sub(t["p"][2], t["p"][0])))
        if mask is not None and rng.random() > mask(p, nrm, uv):
            continue
        if grid is not None:
            if next(grid.near(p, spacing), None) is not None:
                continue
            grid.add(p)
        out.append({"p": p, "n": nrm, "uv": uv, "tri": k})
    return out


# =========================================================================== strand analysis (pure)
FRACTIONS = (0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0)


def strand_length(pts):
    return sum(_dist(pts[i - 1], pts[i]) for i in range(1, len(pts)))


def resample(pts, fractions=FRACTIONS):
    """Points at the given fractions of arc length (pure)."""
    L = [0.0]
    for i in range(1, len(pts)):
        L.append(L[-1] + _dist(pts[i - 1], pts[i]))
    total = L[-1]
    out = []
    for f in fractions:
        target = f * total
        j = max(0, min(len(L) - 2, bisect.bisect_right(L, target) - 1))
        seg = L[j + 1] - L[j] if len(L) > 1 else 0.0
        a = 0.0 if seg <= 0 else max(0.0, min(1.0, (target - L[j]) / seg))
        out.append(_lerp(pts[j], pts[min(j + 1, len(pts) - 1)], a))
    return out


def frizz(pts, samples=24, window=1):
    """(whole, root half, tip half) RMS distance of a strand from its moving-average smoothed
    self (3 samples of 24), divided by its length [added]. Straight strands give 0; a smooth
    clump bend stays near 0.0005, visible noise starts around 0.001 (synthetic calibration,
    test_mx_groom_offline.py)."""
    L = strand_length(pts)
    if L <= 0:
        return 0.0, 0.0, 0.0
    q = resample(pts, [i / float(samples - 1) for i in range(samples)])
    dev = []
    for i in range(samples):
        lo, hi = max(0, i - window), min(samples, i + window + 1)
        c = _mul(sum_v(q[lo:hi]), 1.0 / (hi - lo))
        dev.append(_dist(q[i], c) if 0 < i < samples - 1 else 0.0)
    h = samples // 2

    def rms(xs):
        return math.sqrt(sum(x * x for x in xs) / len(xs)) / L if xs else 0.0
    return rms(dev), rms(dev[:h]), rms(dev[h:])


def sum_v(vs):
    x = y = z = 0.0
    for v in vs:
        x += v[0]
        y += v[1]
        z += v[2]
    return (x, y, z)


def _clump_profiles(samples, groups):
    prof = []
    for g in groups:
        radii = []
        for k in range(len(FRACTIONS)):
            c = _mul(sum_v([samples[i][k] for i in g]), 1.0 / len(g))
            radii.append(math.sqrt(sum(_dist(samples[i][k], c) ** 2 for i in g) / len(g)))
        prof.append(radii)
    return prof


def analyze_strands(strands, t_clump=0.9, link=None, min_members=4, reference=None, flow=None,
                    normals=None, surface=None, max_strands=20000, seed=1, coarse_link=None,
                    flow_threshold=45.0):
    """Numbers an agent can read instead of looking at every hair (pure). strands: lists of
    points, root first. Every threshold used to classify is a parameter and is reported.

    Clumps: strands are single-linkage clustered on their positions at `t_clump` of their
    length with `link` (default 0.5 x median root spacing) [added]. Per clump, the RMS
    radius at each fraction of FRACTIONS gives the profile; root_pinch = r(0.1)/r(0)
    (Fernandez: roots loose, near 1), tip_tightness = r(0.9)/r(0), profile_variety = CV of
    r(0.5)/r(0) across clumps (Fernandez 02: every clump different). With `reference`
    (the same strands exported below the clump modifiers), profiles are r(t)/r_ref(t).
    Strays: strands outside any clump whose root neighbours mostly belong to clumps.
    Hierarchy: the clumps above grouped by the gaps between their tip centroids; small per
    big (Fernandez 03: 3 to 5); levels_detected 1 when no gap exists. Frizz: see frizz(). Flow: angle between neighbouring root
    tangents; with `flow` and `normals`, error against the flow sheet. Penetration: share of
    sampled points under `surface` (surface(p) -> (closest point, normal))."""
    strands = [s for s in strands if len(s) >= 2 and strand_length(s) > 0]
    rng = random.Random(seed)
    idx = list(range(len(strands)))
    if len(idx) > max_strands:
        idx = sorted(rng.sample(idx, max_strands))
    S = [strands[i] for i in idx]
    ref = [reference[i] for i in idx] if reference is not None else None
    nor = [normals[i] for i in idx] if normals is not None else None
    rep = {"count": len(strands), "sampled": len(S), "fractions": list(FRACTIONS)}
    if not S:
        return rep
    fr = list(FRACTIONS)
    if t_clump not in fr:
        raise ValueError("t_clump must be one of %s" % (FRACTIONS,))
    kc = fr.index(t_clump)
    samples = [resample(s) for s in S]
    lengths = [strand_length(s) for s in S]
    rep["length"] = {"mean": _mean(lengths), "min": min(lengths), "max": max(lengths), "cv": _cv(lengths)}
    if ref:
        ratios = [lengths[i] / strand_length(ref[i]) for i in range(len(S)) if strand_length(ref[i]) > 0]
        rep["length"]["ratio_to_reference"] = _mean(ratios)
    roots = [s[0] for s in samples]
    spacing = _median(nn_distances(roots, seed=seed)) or 0.0
    rep["root_spacing"] = spacing
    link = link if link is not None else 0.5 * spacing
    groups = cluster([s[kc] for s in samples], link) if link > 0 else [[i] for i in range(len(S))]
    clumps = [g for g in groups if len(g) >= min_members]
    member = [-1] * len(S)
    for ci, g in enumerate(clumps):
        for i in g:
            member[i] = ci
    cl = {"link": link, "t": t_clump, "min_members": min_members, "count": len(clumps),
          "clumped_pct": 100.0 * sum(len(g) for g in clumps) / len(S)}
    if clumps:
        prof = _clump_profiles(samples, clumps)
        if ref:
            ref_samples = [resample(r) for r in ref]
            base = _clump_profiles(ref_samples, clumps)
            norm = [[p[k] / b[k] if b[k] > 0 else None for k in range(len(fr))] for p, b in zip(prof, base)]
        else:
            norm = [[p[k] / p[0] if p[0] > 0 else None for k in range(len(fr))] for p in prof]
        med = []
        for k in range(len(fr)):
            vals = [n[k] for n in norm if n[k] is not None]
            med.append(_median(vals))
        cl["profile_median"] = dict(zip([str(f) for f in fr], med))
        cl["root_pinch"] = med[fr.index(0.1)]
        cl["tip_tightness"] = med[fr.index(0.9)]
        mids = [n[fr.index(0.5)] for n in norm if n[fr.index(0.5)] is not None]
        cl["profile_variety"] = _cv(mids)
        sizes = [len(g) for g in clumps]
        cl["members_mean"] = _mean(sizes)
        cl["size_variety"] = _cv(sizes)
    rep["clumps"] = cl
    # strays
    if clumps and spacing > 0:
        rg = _Grid(2.0 * spacing, roots)
        strays = 0
        for i in range(len(S)):
            if member[i] >= 0:
                continue
            nb = [j for j in rg.near(roots[i], 2.0 * spacing) if j != i]
            if nb and sum(1 for j in nb if member[j] >= 0) >= 0.5 * len(nb):
                strays += 1
        rep["strays_pct"] = 100.0 * strays / len(S)
    # hierarchy: the clumps found above are the small level; big clumps are groups of small
    # clumps whose tip centroids sit closer together than to the rest (coarse link =
    # 1.5 x median centroid spacing unless given) [added heuristic, confirm with
    # hierarchy_from_states()].
    if len(clumps) >= 3:
        cents = [_mul(sum_v([samples[i][kc] for i in g]), 1.0 / len(g)) for g in clumps]
        dc = _median(nn_distances(cents, seed=seed)) or 0.0
        co = coarse_link if coarse_link is not None else 1.5 * dc
        big = cluster(cents, co) if co > 0 else [[i] for i in range(len(cents))]
        per = [len(g) for g in big if len(g) >= 2]
        one_level = bool(big) and len(big[0]) > 0.5 * len(cents)
        rep["hierarchy"] = {"coarse_link": co, "centroid_spacing": dc, "big_clumps": len(per),
                            "small_per_big_mean": None if one_level else _mean(per),
                            "small_per_big_median": None if one_level else _median(per),
                            "levels_detected": 1 if (one_level or not per) else 2}
    # frizz
    fz = [frizz(s) for s in S]
    whole = [f[0] for f in fz]
    root_half = _mean([f[1] for f in fz])
    tip_half = _mean([f[2] for f in fz])
    rep["frizz"] = {"mean": _mean(whole), "cv": _cv(whole), "root_half": root_half, "tip_half": tip_half,
                    "tip_over_root": (tip_half / root_half) if root_half else None}
    # noise frequency across the noisy strands (Fernandez 05: constant frequency looks fake,
    # high-frequency fray belongs on few hairs) [added measure]
    noisy = [i for i, f in enumerate(whole) if f > NOISE_FLOOR]
    if len(noisy) >= max(10, 0.05 * len(S)):
        if len(noisy) > 3000:
            noisy = sorted(rng.sample(noisy, 3000))
        fq = [x for x in (noise_frequency(S[i]) for i in noisy) if x > 0]
        med = _median(fq) if fq else 0.0
        rep["frizz"]["frequency"] = {"strands": len(noisy), "median_cycles": med,
                                     "cv": _cv(fq) if len(fq) >= 2 else None,
                                     "fray_pct": (100.0 * sum(1 for x in fq if med and x >= 2.0 * med) / len(noisy))}
    # flow coherence
    if spacing > 0:
        tang = [_unit(_sub(s[1], s[0])) for s in samples]
        rg = _Grid(2.0 * spacing, roots)
        angles, worst = [], []
        for i in range(len(S)):
            nb = [j for j in rg.near(roots[i], 2.0 * spacing) if j != i][:8]
            for j in nb:
                if j > i:
                    a = _angle_deg(tang[i], tang[j])
                    angles.append(a)
                    if a > flow_threshold:
                        worst.append((a, roots[i]))
        worst.sort(reverse=True)
        rep["flow"] = {"neighbour_angle_mean": _mean(angles), "neighbour_angle_p95": _pct(angles, 0.95),
                       "over_threshold_pct": 100.0 * len(worst) / len(angles) if angles else 0.0,
                       "threshold_deg": flow_threshold,
                       "worst_roots": [[round(x, 3) for x in w[1]] for w in worst[:20]]}
        if flow is not None and nor is not None:
            err = [_angle_deg(_tangent(tang[i], _unit(nor[i])), flow_vector(roots[i], nor[i], flow))
                   for i in range(len(S))]
            rep["flow"]["sheet_error_mean"] = _mean(err)
            rep["flow"]["sheet_error_p95"] = _pct(err, 0.95)
    # penetration
    if surface is not None:
        tol = 0.01 * (spacing or 1.0)
        below = total = 0
        for s in samples:
            for q in s[1:]:
                cp, cn = surface(q)
                total += 1
                if _dot(_sub(q, _v(cp)), _unit(_v(cn))) < -tol:
                    below += 1
        rep["penetration_pct"] = 100.0 * below / total if total else 0.0
    return rep


def resample_index(pts, fractions=FRACTIONS):
    """Points at fractions of the CV index range (parametric, not arc length): the same CV
    of the same strand in two states stays comparable even when noise lengthens the tip."""
    out = []
    m = len(pts) - 1
    for f in fractions:
        x = f * m
        j = min(int(math.floor(x)), max(0, m - 1))
        out.append(_lerp(pts[j], pts[min(j + 1, m)], x - j) if m > 0 else pts[0])
    return out


def compare_states(before, after):
    """Mean displacement at each fraction between two exports of the same strands (same
    order), divided by strand length. Fernandez 07: a breakup pass should move tips and keep
    roots, so root_shift stays near 0 while tip_shift grows [added measure]. Strands with the
    same CV count are compared CV by CV (resample_index), others by arc length."""
    n = min(len(before), len(after))
    if not n:
        return {}
    acc = [0.0] * len(FRACTIONS)
    for i in range(n):
        if len(before[i]) == len(after[i]):
            a, b = resample_index(before[i]), resample_index(after[i])
        else:
            a, b = resample(before[i]), resample(after[i])
        L = strand_length(before[i]) or 1.0
        for k in range(len(FRACTIONS)):
            acc[k] += _dist(a[k], b[k]) / L
    shift = [x / n for x in acc]
    return {"shift_by_fraction": dict(zip([str(f) for f in FRACTIONS], shift)),
            "root_shift": shift[FRACTIONS.index(0.1)], "tip_shift": shift[FRACTIONS.index(0.9)]}


def hierarchy_from_states(primary_state, secondary_state, link_primary=None, link_secondary=None, t=0.9,
                          min_members=4):
    """Small clumps per big clump from two exports of the same strands (same order): after
    the primary Clump only, and after the secondary (mid-stack caches, XGIG § Create an
    interactive groom hair cache) [added]. Links default to 0.75 and 0.5 x the median root
    spacing [added]. Returns per-big counts and their mean."""
    if link_primary is None or link_secondary is None:
        sp = _median(nn_distances([s[0] for s in primary_state])) or 0.0
        link_primary = link_primary if link_primary is not None else 0.75 * sp
        link_secondary = link_secondary if link_secondary is not None else 0.5 * sp
    k = FRACTIONS.index(t)
    tp = [resample(s)[k] for s in primary_state]
    ts = [resample(s)[k] for s in secondary_state]
    big = [g for g in cluster(tp, link_primary) if len(g) >= min_members]
    small = cluster(ts, link_secondary)
    sid = {}
    for n, g in enumerate(small):
        for i in g:
            sid[i] = n
    per = [len(set(sid[i] for i in g if len(small[sid[i]]) >= 2)) for g in big]
    return {"big_clumps": len(big), "small_per_big": per, "mean": _mean(per)}


def noise_frequency(pts, samples=48, smooth=4, hysteresis=0.25):
    """Cycles of noise along one strand (pure) [added measure]. Fernandez 05: frequency
    varies across a real groom, a constant one looks fake, and high frequency (fray) belongs
    on few hairs [00:07:28] [00:08:15]. The strand is resampled, its moving average
    (2 * smooth + 1 samples) removed, the residual projected on its largest direction, and
    the zero crossings between swings beyond +-hysteresis x the peak located; cycles per
    strand length = 1 / (2 x mean spacing between the first and last crossing), 0.5 for a
    single crossing. A straight or smoothly bent strand gives 0. Strands need enough points:
    at least ~6 per cycle."""
    L = strand_length(pts) if len(pts) >= 2 else 0.0
    if L <= 0:
        return 0.0
    q = resample(pts, [i / float(samples - 1) for i in range(samples)])
    res = []
    for i in range(smooth, samples - smooth):
        c = _mul(sum_v(q[i - smooth:i + smooth + 1]), 1.0 / (2 * smooth + 1))
        res.append(_sub(q[i], c))
    if not res:
        return 0.0
    axis = max(res, key=_len)
    if _len(axis) <= 1e-4 * L:
        return 0.0
    ax = _unit(axis)
    s = [_dot(r, ax) for r in res]
    thr = hysteresis * max(abs(x) for x in s)
    cross, state = [], 0
    for i, x in enumerate(s):
        st = 1 if x > thr else (-1 if x < -thr else 0)
        if st and state and st != state:
            j = i
            while j > 0 and s[j - 1] * s[j] > 0:
                j -= 1
            a, b = s[j - 1], s[j]
            cross.append((j - 1) + (a / (a - b) if a != b else 0.5))
        if st:
            state = st
    if len(cross) < 2:
        return 0.5 * len(cross)
    half = (cross[-1] - cross[0]) / (len(cross) - 1)
    return (samples - 1) / (2.0 * half) if half > 0 else 0.0


def _chord_dev(pts, samples):
    q = resample(pts, [i / float(samples - 1) for i in range(samples)])
    a, b = q[0], q[-1]
    out = []
    for i, p in enumerate(q):
        t = i / float(samples - 1)
        d = _sub(p, _lerp(a, b, t))
        out += [d[0], d[1], d[2]]
    return out


def clump_follow(strands, samples=12, max_pairs=3000, seed=1):
    """Fernandez 06's mask-versus-tightness test as numbers, on the strands of ONE clump
    (root first) (pure) [added measure]. tip_spread = mean tip distance to the tip centroid
    / mean root distance to the root centroid (1 = no convergence, near 0 = the tips meet).
    shape_coherence = mean cosine similarity between the strands' deviations from their own
    root-to-tip chords (1 = every hair carries the clump's shape, near 0 = unrelated shapes).
    Lowering Clump (tightness) raises tip_spread and keeps the coherence; lowering the mask
    raises tip_spread and loses the coherence. On straight clump guides the two look alike
    [LbqWjd0p-qw 00:10:00]: put noise or a bend below the Clump before judging."""
    S = [s for s in strands if len(s) >= 2 and strand_length(s) > 0]
    if len(S) < 2:
        return {"strands": len(S)}
    roots = [s[0] for s in S]
    tips = [s[-1] for s in S]
    rc = _mul(sum_v(roots), 1.0 / len(S))
    tc = _mul(sum_v(tips), 1.0 / len(S))
    r_spread = _mean([_dist(r, rc) for r in roots])
    t_spread = _mean([_dist(t, tc) for t in tips])
    dev = [_chord_dev(s, samples) for s in S]
    norms = [math.sqrt(sum(x * x for x in d)) for d in dev]
    pairs = [(i, j) for i in range(len(S)) for j in range(i + 1, len(S))]
    if len(pairs) > max_pairs:
        pairs = random.Random(seed).sample(pairs, max_pairs)
    sims = [sum(a * b for a, b in zip(dev[i], dev[j])) / (norms[i] * norms[j])
            for i, j in pairs if norms[i] > 1e-12 and norms[j] > 1e-12]
    return {"strands": len(S), "tip_spread": (t_spread / r_spread) if r_spread else None,
            "shape_coherence": _mean(sims) if sims else None}


def breakup_report(before, after, link=None, t=0.9, min_members=2):
    """What a breakup pass destroyed, from two exports of the same strands in the same order
    (pure) [added measure for Fernandez 07 [00:04:10] [00:13:39]]. Small clumps = clusters of
    the `before` positions at fraction t (link default 0.5 x median root spacing). For each,
    spread_ratio = its tip spread after / before: noise at the CLUMP level moves each small
    clump as a unit (ratio near 1, tips still shift), noise at the STRAND level breaks the
    small clumps too (ratio well above 1). Also root_shift and tip_shift (compare_states)."""
    n = min(len(before), len(after))
    if not n:
        return {}
    if link is None:
        link = 0.5 * (_median(nn_distances([s[0] for s in before[:n]])) or 0.0)
    k = FRACTIONS.index(t)

    def at(s, other):
        return (resample_index(s) if len(s) == len(other) else resample(s))[k]
    pb = [at(before[i], after[i]) for i in range(n)]
    pa = [at(after[i], before[i]) for i in range(n)]
    groups = [g for g in cluster(pb, link) if len(g) >= min_members] if link > 0 else []

    def spread(pts, g):
        c = _mul(sum_v([pts[i] for i in g]), 1.0 / len(g))
        return _mean([_dist(pts[i], c) for i in g])
    ratios = []
    for g in groups:
        sb = spread(pb, g)
        if sb > 1e-9:
            ratios.append(spread(pa, g) / sb)
    cs = compare_states(before[:n], after[:n])
    return {"small_clumps": len(groups), "link": link, "spread_ratio_median": _median(ratios) if ratios else None,
            "kept_pct": (100.0 * sum(1 for r in ratios if r <= 1.5) / len(ratios)) if ratios else None,
            "root_shift": cs.get("root_shift"), "tip_shift": cs.get("tip_shift")}


def breakup_verdict(rep, intent="big"):
    """Lines for a breakup_report(). intent "big": the pass should break the big clumps and
    keep the small ones and the roots (clump-level noise, Fernandez 07); "small": it may
    break the small clumps too (strand noise on a share of hairs). Thresholds [added]."""
    out = []
    if not rep:
        return ["warn: empty breakup report"]
    rs, ts = rep.get("root_shift") or 0.0, rep.get("tip_shift") or 0.0
    if ts <= 0.002:
        out.append("warn: tips did not move (tip_shift %.4f); the pass is off or masked away" % ts)
    if rs > 0.25 * max(ts, 1e-9):
        out.append("warn: roots moved %.4f against tips %.4f; mask the noise to the tip half (Fernandez 07 [00:04:42])" % (rs, ts))
    kp = rep.get("kept_pct")
    if intent == "big" and kp is not None and kp < 70.0:
        out.append("warn: only %.0f%% of small clumps kept their shape; this noise acts at the strand level. Move it to the "
                   "secondary Clump's Noise (Noise Correlation high) to break the big clumps only (Fernandez 07 [00:13:39]) [added mapping]" % kp)
    return out


def wiring_verdict(err_before, err_after, n_guides, n_cached=None, min_gain=0.25):
    """Did the guide curves reach the hair (pure) [added]: the flow-sheet error of the final
    hair in degrees (measure_abc(..., flow=FLOW)["flow"]["sheet_error_mean"]) before and after
    wire_guides(), and the guide count read back from an InGuide_base cache (XGIG § cache:
    "To cache wires or guides only, select the modifier's InGuide_base node")."""
    out = []
    if n_cached is not None and n_cached != n_guides:
        out.append("error: %d guides read back from the inGuide cache, %d curves wired" % (n_cached, n_guides))
    if err_before is None or err_after is None:
        out.append("warn: flow-sheet error missing (measure_abc needs flow= and surface=)")
    elif err_after > err_before * (1.0 - min_gain):
        out.append("error: flow-sheet error %.1f -> %.1f deg: the hair does not follow the guides (not wired, or a "
                   "Curve to Spline or cache above them overrides the stack)" % (err_before, err_after))
    return out


class GateError(AssertionError):
    pass


def gate(lines, fail=("error", "warn"), label="gate"):
    """Raise GateError listing every line whose level is in `fail`; return the others. Turns
    any verdict (lint, strand_verdict, wiring_verdict, breakup_verdict, shader_verdict) into
    an assertion, so a job script stops at the stage that failed."""
    lines = list(lines or [])
    bad = [x for x in lines if x.split(":", 1)[0].strip() in fail]
    if bad:
        raise GateError("%s failed:\n  %s" % (label, "\n  ".join(bad)))
    return lines


def profile_ramp(name, convention="magnitude"):
    """Ramp points for a CLUMP_PROFILES shape: radius convention as drawn (legacy XGen), or
    magnitude = 1 - radius for the 2027 Interactive Groom reading [verify]."""
    pts = CLUMP_PROFILES[name]
    if convention == "radius":
        return [(float(p), float(v)) for p, v in pts]
    return [(float(p), round(1.0 - float(v), 6)) for p, v in pts]


def strand_verdict(rep, style="realistic", long_hair=True):
    """warn/info lines from an analyze_strands() report. Thresholds marked [added] are this
    module's defaults, not expert numbers; the expert rule each one stands for is cited."""
    out = []
    cl = rep.get("clumps") or {}
    if long_hair and cl.get("count", 0) == 0:
        out.append("warn: no clumps detected; 'all hair clumps all the time' (FlippedNormals [00:27:45]; Giovannini [00:11:25])")
    rp = cl.get("root_pinch")
    if rp is not None and rp < 0.85:
        out.append("warn: roots pinched (r(0.1)/r(0) = %.2f < 0.85 [added]); keep roots loose over the first ~14%% (Fernandez 02 [00:17:56])" % rp)
    pv = cl.get("profile_variety")
    if pv is not None and pv < 0.10:
        out.append("warn: clump profiles uniform (CV %.2f < 0.10 [added]); no two clumps alike (Fernandez 02 [00:07:52])" % pv)
    h = rep.get("hierarchy") or {}
    m = h.get("small_per_big_mean")
    if long_hair and h.get("levels_detected") == 1 and style == "realistic":
        out.append("info: one clump level detected; film grooms use two (Fernandez 03 [00:00:23])")
    if m is not None and h.get("big_clumps", 0) >= 3 and not (CLUMP_RATIO[0] <= m <= CLUMP_RATIO[1]):
        out.append("info: %.1f small clumps per big (single-state estimate); expert target 3 to 5 (Fernandez 03 [00:01:31]); confirm with hierarchy_from_states()" % m)
    sp = rep.get("strays_pct")
    if sp is not None:
        if sp > 100.0 * STRAY_MAX:
            out.append("warn: strays %.1f%% above 20%% (Giovannini [00:09:28])" % sp)
        elif sp == 0 and style == "realistic":
            out.append("info: no strays; realistic grooms carry a few percent (Giovannini 5 %%; Fernandez 08 flyaways)")
    fz = rep.get("frizz") or {}
    r = fz.get("tip_over_root")
    if r is not None and (fz.get("mean") or 0) > NOISE_FLOOR and r < 1.0:
        out.append("warn: more noise at the roots than at the tips (tip/root %.2f); mask noise to the tips (Fernandez 07 [00:04:42]; FlippedNormals [00:32:37])" % r)
    if fz.get("cv") is not None and (fz.get("mean") or 0) > NOISE_FLOOR and fz["cv"] < 0.15:
        out.append("info: noise nearly identical on every strand (CV %.2f < 0.15 [added]); constant noise looks fake (Fernandez 05 [00:08:15])" % fz["cv"])
    fq = fz.get("frequency") if (fz.get("mean") or 0) > NOISE_FLOOR else None
    fq = fq or {}
    if fq.get("cv") is not None and fq["cv"] < 0.10:
        out.append("info: noise frequency nearly the same on every noisy strand (CV %.2f < 0.10 [added]); vary it, a constant frequency looks fake (Fernandez 05 [00:08:15])" % fq["cv"])
    if (fq.get("fray_pct") or 0) > 20.0:
        out.append("warn: %.0f%% of noisy strands carry high-frequency fray (>= 2x the median frequency [added]); fray belongs on few hairs (Fernandez 05 [00:07:59])" % fq["fray_pct"])
    lr = (rep.get("length") or {}).get("ratio_to_reference")
    if lr is not None and not (0.9 <= lr <= 1.1):
        out.append("warn: mean length ratio %.2f after breakup; balance random length around 1, e.g. 0.8 to 1.2 (Fernandez 08 [00:09:33])" % lr)
    fl = rep.get("flow") or {}
    if fl.get("over_threshold_pct", 0) > 5.0:
        out.append("warn: %.1f%% of neighbouring roots disagree by more than %d deg [added]; broken guides unless it is a part or whorl (Fernandez 01 [00:09:31])" % (fl["over_threshold_pct"], fl["threshold_deg"]))
    pp = rep.get("penetration_pct")
    if pp is not None and pp > 0.5:
        out.append("warn: %.2f%% of sampled points under the surface (> 0.5%% [added]); Collide with Mesh or a Collision modifier (XGIG § Get started, § Collision)" % pp)
    return out


# =========================================================================== UV-space masks (pure)
def vertex_positions(tris):
    out = {}
    for t in tris:
        for vid, p in zip(t.get("v") or (), t["p"]):
            out[vid] = p
    return out


def distance_to_segments(p, segments):
    best = None
    for a, b in segments:
        d = _dist(p, _closest_on_segment(p, a, b))
        best = d if best is None else min(best, d)
    return best if best is not None else float("inf")


def hairline_value(d, width, edge=0.25, inside=1.0, band=False):
    """Mask value at distance d from the scalp border (the hairline). Falloff: `edge` at the
    border rising to `inside` over `width` (thinner density or width at the hairline, Hadi
    [00:09:53]). band=True inverts it: 1 at the border, 0 inside (a transition-hair or
    peach-fuzz description, Hadi [01:54:41], [02:07:27])."""
    s = smoothstep(0.0, width, d)
    if band:
        return 1.0 - s
    return edge + (inside - edge) * s


def _hash01(*ints):
    h = 2166136261
    for x in ints:
        h = ((h ^ (int(x) & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0x5bd1e995) & 0xFFFFFFFF
    h ^= h >> 15
    return h / 4294967296.0


def value_noise(p, freq=1.0, seed=0):
    """Smooth 3D value noise in 0..1 (pure) for procedural masks."""
    x, y, z = p[0] * freq, p[1] * freq, p[2] * freq
    ix, iy, iz = int(math.floor(x)), int(math.floor(y)), int(math.floor(z))
    fx, fy, fz = x - ix, y - iy, z - iz
    fx, fy, fz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)

    def h(a, b, c):
        return _hash01(ix + a, iy + b, iz + c, seed)
    x00 = h(0, 0, 0) + (h(1, 0, 0) - h(0, 0, 0)) * fx
    x10 = h(0, 1, 0) + (h(1, 1, 0) - h(0, 1, 0)) * fx
    x01 = h(0, 0, 1) + (h(1, 0, 1) - h(0, 0, 1)) * fx
    x11 = h(0, 1, 1) + (h(1, 1, 1) - h(0, 1, 1)) * fx
    y0 = x00 + (x10 - x00) * fy
    y1 = x01 + (x11 - x01) * fy
    return y0 + (y1 - y0) * fz


def speckle(fraction, seed=0, size=512):
    """texel_value function: 1 on about `fraction` of texels, 0 elsewhere. A hair samples one
    texel at its root, so this selects that share of hairs, e.g. 0.05 for Giovannini's 5 %
    strays [added substitute for a per-hair random expression]."""
    def fn(u, v, p, n):
        return 1.0 if _hash01(int(u * size * 4), int(v * size * 4), seed) < fraction else 0.0
    return fn


def patches(fraction, cells=64, seed=0, inside=0.0):
    """texel_value function with holes: `inside` (default 0) on about `fraction` of the cells
    of a cells x cells UV grid, 1 elsewhere. On the PRIMARY Clump's mask it removes the big
    clump's influence locally, which is where stray clumps come from (Fernandez 03
    [00:04:16]: not a new system). Size the cells to about one small clump [added]."""
    def fn(u, v, p, n):
        return inside if _hash01(int(u * cells), int(v * cells), seed, 7) < fraction else 1.0
    return fn


def partition(count, index, cells=32, seed=0):
    """texel_value function: 1 on the UV cells assigned to group `index` of `count`, else 0;
    the `count` masks sum to 1 everywhere. For several Clump modifiers with different
    profiles (every clump different, Fernandez 02 [00:07:52]) [added method], or for Hadi's
    duplicated modifiers at different percentages [00:20:46] when the shares must not
    overlap."""
    def fn(u, v, p, n):
        return 1.0 if min(count - 1, int(_hash01(int(u * cells), int(v * cells), seed, 11) * count)) == index else 0.0
    return fn


def rasterize_uv(tris, size=512, vertex_value=None, texel_value=None, dilate=4, default=0.0):
    """Grayscale image (row-major floats, top row = v 1) over the UV layout (pure).
    vertex_value: {vertex id: value} interpolated across each triangle (cheap, smooth);
    texel_value(u, v, p, n): evaluated per texel (procedural detail). Texels outside every
    triangle are filled from their neighbours `dilate` times (seam padding), then `default`.
    UVs outside 0..1 (UDIM) are ignored."""
    img = [None] * (size * size)
    for t in tris:
        uv = t.get("uv")
        if not uv:
            continue
        (u0, v0), (u1, v1), (u2, v2) = uv
        det = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2)
        if abs(det) < 1e-14:
            continue
        cols = [u * size - 0.5 for u in (u0, u1, u2)]
        rows = [(1.0 - v) * size - 0.5 for v in (v0, v1, v2)]
        c0, c1 = max(0, int(math.floor(min(cols)))), min(size - 1, int(math.ceil(max(cols))))
        r0, r1 = max(0, int(math.floor(min(rows)))), min(size - 1, int(math.ceil(max(rows))))
        vals = None
        if vertex_value is not None and t.get("v"):
            vals = [vertex_value.get(i, default) for i in t["v"]]
        for row in range(r0, r1 + 1):
            vv = 1.0 - (row + 0.5) / size
            for col in range(c0, c1 + 1):
                uu = (col + 0.5) / size
                a = ((v1 - v2) * (uu - u2) + (u2 - u1) * (vv - v2)) / det
                b = ((v2 - v0) * (uu - u2) + (u0 - u2) * (vv - v2)) / det
                c = 1.0 - a - b
                if a < -1e-9 or b < -1e-9 or c < -1e-9:
                    continue
                if texel_value is not None:
                    p = _bary(t["p"], a, b, c)
                    n = _unit(_bary(t["n"], a, b, c)) if t.get("n") else (0.0, 1.0, 0.0)
                    val = texel_value(uu, vv, p, n)
                    if vals is not None:
                        val *= vals[0] * a + vals[1] * b + vals[2] * c
                elif vals is not None:
                    val = vals[0] * a + vals[1] * b + vals[2] * c
                else:
                    val = 1.0
                img[row * size + col] = max(0.0, min(1.0, float(val)))
    for _ in range(max(0, dilate)):
        fill = {}
        for i, x in enumerate(img):
            if x is not None:
                continue
            r, c = divmod(i, size)
            nb = [img[j] for j in ((i - size) if r > 0 else -1, (i + size) if r < size - 1 else -1,
                                   (i - 1) if c > 0 else -1, (i + 1) if c < size - 1 else -1)
                  if j >= 0 and img[j] is not None]
            if nb:
                fill[i] = sum(nb) / len(nb)
        if not fill:
            break
        for i, x in fill.items():
            img[i] = x
    return [default if x is None else x for x in img]


def write_mask_png(path, size, values):
    """8-bit grayscale PNG (written as RGB) from rasterize_uv() values."""
    buf = bytearray(size * size * 3)
    for i, x in enumerate(values):
        g = int(round(max(0.0, min(1.0, x)) * 255))
        buf[3 * i] = buf[3 * i + 1] = buf[3 * i + 2] = g
    d = os.path.dirname(os.path.abspath(path))
    if d and not os.path.isdir(d):
        os.makedirs(d)
    R.write_png(path, size, size, bytes(buf), channels=3)
    return path


# =========================================================================== ramps (pure)
def ramp_value(points, x):
    """Linear evaluation of ramp points [(position, value, ...)] at x (pure; ignores the
    interpolation type, enough for lint)."""
    pts = sorted((float(p[0]), float(p[1])) for p in points)
    if not pts:
        return None
    if x <= pts[0][0]:
        return pts[0][1]
    for (a, va), (b, vb) in zip(pts, pts[1:]):
        if a <= x <= b:
            return va if b == a else va + (vb - va) * (x - a) / (b - a)
    return pts[-1][1]


def clump_density_for(count, area):
    """Clump Points Density (points per unit area, XGIG § Clump Points) that gives about
    `count` clumps over `area`: count the big clumps on the reference, as Fernandez does
    [_ukhuMbKIQ4 00:08:24] [added formula]."""
    return float(count) / float(area) if area else None


# =========================================================================== lint (pure)
def _is_white(c):
    if c is None:
        return True
    if isinstance(c, (list, tuple)):
        if c and isinstance(c[0], (list, tuple)):
            c = c[0]
        return all(abs(float(x) - 1.0) < 1e-3 for x in c)
    return abs(float(c) - 1.0) < 1e-3


def _scalar(c):
    if isinstance(c, (list, tuple)):
        if c and isinstance(c[0], (list, tuple)):
            c = c[0]
        return min(float(x) for x in c) if c else None
    return None if c is None else float(c)


def shader_verdict(sh, style="realistic", wet=False, synthetic=False):
    """Lines for one hair shader record {"type", "node", "attrs", "connected"} (HAIR doc)."""
    out = []
    if not sh or not sh.get("type"):
        return ["warn: no shader found on the description"]
    t, a, con = sh["type"], sh.get("attrs") or {}, set(sh.get("connected") or ())
    lvl = "warn" if style == "realistic" else "info"
    if t == "hairPhysicalShader":
        out.append("warn: default hairPhysicalShader (Ai Kd Ind defaults to 0; raise it with indirect light, XGIG § Render); for realistic hair assign aiStandardHair")
        return out
    if t != "aiStandardHair":
        out.append("info: shader %s is not aiStandardHair; only Standard Hair simulates hair scattering (HAIR § Standard Hair)" % t)
        return out
    if (a.get("diffuse") or 0) > 0:
        out.append("%s: diffuse %.2f > 0; realistic hair uses 0, diffuse is for dirty or damaged hair (HAIR § Diffuse)" % (lvl, a["diffuse"]))
    for k in ("specularTint", "specular2Tint", "transmissionTint"):
        if k in a and not _is_white(a[k]) and k not in con:
            out.append("%s: %s not white; tints are artistic, not physically correct (HAIR § Specular)" % (lvl, k))
    for k in ("indirectDiffuse", "indirectSpecular"):
        if k in a and a[k] is not None and abs(float(a[k]) - 1.0) > 1e-3:
            out.append("warn: %s = %s; leave indirect scales at 1 (HAIR § Advanced)" % (k, a[k]))
    op = _scalar(a.get("opacity"))
    if op is not None and op < 1.0:
        out.append("warn: opacity < 1 costs significantly more render time and needs Ai Opaque off on the description (HAIR § Opacity)")
    if (a.get("melanin") or 0) > 0 and "baseColor" in con:
        out.append("error: baseColor is textured but melanin = %s; set melanin 0 with a texture (HAIR § Texturing Hair)" % a["melanin"])
    ior = a.get("ior")
    if ior is not None and not wet and not (1.4 <= float(ior) <= 1.6):
        out.append("warn: ior %.2f outside 1.4 to 1.6, which is for wet hair only (HAIR § IOR)" % ior)
    sh_ = a.get("shift")
    if sh_ is not None:
        if synthetic and abs(float(sh_)) > 1e-6:
            out.append("info: synthetic fibre: shift 0 (HAIR § Shift)")
        elif not (0.0 <= float(sh_) <= 10.0):
            out.append("warn: shift %.1f outside 0 to 10 degrees for human hair (HAIR § Shift)" % sh_)
    if (a.get("melanin") or 0) < 0.3 and "baseColor" not in con and (a.get("extraDepth") or 0) <= 0:
        out.append("info: light hair: add Extra Depth on the shader rather than raising global specular depth; then specular samples 2 to 5 or AA (HAIR § Extra Depth, § Texturing Hair)")
    return out


def verdict(data, budget=None, style="realistic", rendering=True, clump_convention="magnitude"):
    """Problems as strings "error: ...", "warn: ...", "info: ..." for extract()'s data (pure).
    Empty list = clean. Missing attributes are reported as info (names unresolved on this
    Maya: run probe())."""
    out = []
    pl = data.get("plugins") or {}
    loaded = pl.get("loaded") or {}
    if rendering:
        if loaded and not loaded.get("mtoa"):
            out.append("warn: mtoa not loaded")
        pre = pl.get("preloaded") or []
        order = pl.get("order") or []
        if "xgenToolkit" in pre and "mtoa" not in pre:
            out.append("warn: xgenToolkit was loaded before mtoa in this session; load MtoA before XGen (HAIR § XGen)")
        elif "xgenToolkit" in order and "mtoa" in order and order.index("xgenToolkit") < order.index("mtoa"):
            out.append("error: xgenToolkit loaded before mtoa (HAIR § XGen)")
        sc = data.get("scene") or {}
        if sc and (not sc.get("path") or sc.get("modified")):
            out.append("warn: save the scene before rendering XGen; unsaved splines can differ from the viewport (HAIR § XGen)")
    for d in data.get("descriptions") or []:
        name, role = d.get("name", "?"), d.get("role", "body")
        st = d.get("stack") or []
        base = st[0] if st and st[0].get("type") not in MODIFIER_TYPES else None
        mods = st[1:] if base else st
        tag = "%s: " % name
        if not st:
            out.append("info: %sno spline-data stack found (plug names unresolved? run probe())" % tag)
        for i, m in enumerate(mods):
            if m.get("type") in DISABLING and any(x.get("type") not in DISABLING for x in mods[:i]):
                out.append("warn: %s%s disables the %d modifier(s) below it; put editing modifiers above it (XGIG § modifiers)"
                           % (tag, m.get("node"), sum(1 for x in mods[:i] if x.get("type") not in DISABLING)))
        cv = ((base or {}).get("attrs") or {}).get("cv_count")
        clumps = [m for m in mods if m.get("type") == "xgmModifierClump"]
        noises = [m for m in mods if m.get("type") == "xgmModifierNoise"]
        has_noise = bool(noises) or any((c.get("attrs") or {}).get("clump_noise") for c in clumps)
        if cv is None and (has_noise or clumps):
            out.append("info: %sCV count attribute not found on the base node" % tag)
        elif cv is not None and has_noise and cv < CV_FOR_NOISE:
            out.append("warn: %sCV count %s < 20 with noise on; noise needs resolution (FlippedNormals [00:28:52]; Hadi [00:07:18])" % (tag, cv))
        curl = max([(c.get("attrs") or {}).get("curl") or 0 for c in clumps] or [0])
        if cv is not None and curl > 1 and cv < CV_FOR_CURL[0]:
            out.append("warn: %scurl %s with CV count %s; curls want 24 to 36 CVs (XGIG § Create curls and coils)" % (tag, curl, cv))
        if not clumps and role in ("body", "fill", "brow", "lash", "long"):
            out.append("warn: %sno Clump modifier; clumping is the foundation (FlippedNormals [00:27:45]; Hadi [00:11:25]; Giovannini [00:11:25])" % tag)
        if len(clumps) > MAX_CLUMP_LEVELS:
            out.append("warn: %s%d clump levels; stay at two, three for long hair or manes (Fernandez 03 [00:09:11])" % (tag, len(clumps)))
        if clumps:
            p = clumps[0].get("attrs") or {}
            for s_ in clumps[1:]:
                s = s_.get("attrs") or {}
                dp, ds = p.get("clump_density"), s.get("clump_density")
                if dp is None or ds is None:
                    out.append("info: %sclump density attribute not found" % tag)
                elif ds <= dp:
                    out.append("error: %s%s density %s not above the primary's %s; secondary clumps leak into neighbours (XGIG § Work with Clump modifiers)" % (tag, s_.get("node"), ds, dp))
                elif dp > 0 and not (CLUMP_RATIO[0] <= ds / dp <= CLUMP_RATIO[1]):
                    out.append("warn: %s%s density ratio %.1f; 3 to 5 small clumps per big clump (Fernandez 03 [00:01:31]) [added mapping to density]" % (tag, s_.get("node"), ds / dp))
                if p.get("map_subdivision") is not None and s.get("map_subdivision") is not None and p["map_subdivision"] != s["map_subdivision"]:
                    out.append("warn: %s%s Map Subdivision Level differs from the primary; duplicate the primary (XGIG)" % (tag, s_.get("node")))
                if "use_control_map" in s and not s["use_control_map"]:
                    out.append("warn: %s%s Use Control Map off; set the primary as control map (XGIG § Clump Map)" % (tag, s_.get("node")))
                p = s
            for c in clumps:
                ramp = (c.get("ramps") or {}).get("clump_scale")
                if ramp:
                    vals = [ramp_value(ramp, x) for x in (0.0, 0.05, 0.1)]
                    vmax = max(ramp_value(ramp, x / 20.0) for x in range(21))
                    root = max(vals) if clump_convention == "magnitude" else None
                    if clump_convention == "radius":
                        root = vmax - min(vals)
                    if vmax > 0 and root is not None and root > 0.25 * vmax:
                        out.append("warn: %s%s clumps the roots (Clump Scale over the first 10%% = %.2f of max, %s convention [verify]); keep roots loose (Fernandez 02 [00:17:56])"
                                   % (tag, c.get("node"), root / vmax, clump_convention))
                if ((c.get("attrs") or {}).get("clump_noise") or 0) > 0:
                    nr = (c.get("ramps") or {}).get("noise_scale")
                    lvl = "warn" if role in ("body", "fill", "long") else "info"
                    if not nr:
                        out.append("info: %s%s clump noise on but its Noise Scale ramp was not read; keep it near 0 over the root half (Fernandez 07 [00:04:42])" % (tag, c.get("node")))
                    else:
                        nmax = max(ramp_value(nr, x / 20.0) for x in range(21))
                        nroot = max(ramp_value(nr, x) for x in (0.0, 0.05, 0.1))
                        if nmax > 0 and nroot > 0.25 * nmax:
                            out.append("%s: %s%s clump noise reaches the roots (Noise Scale over the first 10%% = %.2f of max); mask it to the tip half, G.TIP_HALF_RAMP (Fernandez 07 [00:04:42])"
                                       % (lvl, tag, c.get("node"), nroot / nmax))
        if role in ("body", "fill"):
            for nz in noises:
                a, inputs = nz.get("attrs") or {}, nz.get("inputs") or {}
                mag = a.get("noise_magnitude")
                if (mag is None or mag > 0) and "mask" not in inputs and (a.get("mask") is None or a.get("mask", 1) > 0):
                    out.append("warn: %s%s acts on the whole %s; noise 0 on the body, only on 5 to 20%% strays (Giovannini [00:09:28])" % (tag, nz.get("node"), role))
        for nz in noises:
            mv = (nz.get("attrs") or {}).get("mask")
            if mv is not None and mv > 0.5 and "mask" not in (nz.get("inputs") or {}):
                out.append("info: %s%s mask %.2f; a noise at mask 1 kills most clumping, 0.1 to 0.5 (FlippedNormals [00:32:05], legacy XGen)" % (tag, nz.get("node"), mv))
        n = d.get("splines")
        if budget and n and n > budget:
            out.append("error: %s%d splines over the budget of %d" % (tag, n, budget))
        if re.match(r"^description\d*$", name.split("|")[-1]):
            out.append("info: %sdefault name; name descriptions per hair type (body, fill, brow_L, lash_upper...) [added]" % tag)
        r = d.get("render") or {}
        mode = r.get("ai_mode")
        if (r.get("ai_min_pixel_width") or 0) > 0 and mode not in (None, 0, "ribbon"):
            out.append("warn: %sMin Pixel Width only works in ribbon mode (HAIR § Transparency Depth)" % tag)
        if r.get("ai_opaque") in (True, 1) and _scalar(((d.get("shader") or {}).get("attrs") or {}).get("opacity")) not in (None, 1.0):
            out.append("warn: %sshader opacity < 1 but Ai Opaque is on; turn it off on the description (HAIR § Spline Opacity)" % tag)
        out += ["%s %s%s" % (x.split(":", 1)[0] + ":", tag, x.split(":", 1)[1].strip()) for x in shader_verdict(d.get("shader"), style)]
    return out


def unreal_verdict(info):
    """Lines for inspect_abc() / inspect_scene() records against Epic's Alembic for Grooms
    rules (XGUE) and Giovannini's practice."""
    out = []
    if not info.get("curves"):
        out.append("error: no curves found")
    if info.get("duplicate_names"):
        out.append("error: duplicate node names %s; each node needs a unique name (XGUE § Export)" % info["duplicate_names"][:10])
    nodes = info.get("nodes") or []

    def with_attr(a):
        return [n for n in nodes if a in (n.get("attrs") or {})]
    if not any(n.get("attrs") for n in nodes):
        out.append("info: no custom attributes found (not written, or not restored by AbcImport [verify]); counts and names checked only")
        return out
    g = with_attr("groom_guide")
    if not g:
        out.append("warn: no groom_guide group; Unreal will tag 10%% of hairs as guides (XGUE); tag your real guides, not the fill (Giovannini [00:30:13])")
    for n in g:
        if "groom_guide_AbcGeomScope" not in n["attrs"]:
            out.append("warn: %s has groom_guide without groom_guide_AbcGeomScope 'con'" % n["name"])
    if not with_attr("groom_group_id"):
        out.append("info: no groom_group_id: all strands in one group (one material, one sim setting) (XGUE)")
    ru = with_attr("groom_root_uv")
    if not ru:
        out.append("warn: no groom_root_uv; binding to another head needs root UVs (Giovannini [00:44:36])")
    for n in ru:
        a = n["attrs"]["groom_root_uv"]
        below = n.get("curves_below")
        if below and a.get("len") not in (None, below):
            out.append("error: %s groom_root_uv has %s values for %s curves" % (n["name"], a.get("len"), below))
        if a.get("unique") == 1 and (a.get("len") or 0) > 1:
            out.append("error: %s root UVs all identical: failed projection (UV set map1 missing?)" % n["name"])
        if n["attrs"].get("groom_root_uv_AbcGeomScope", {}).get("value") not in (None, "uni"):
            out.append("warn: %s groom_root_uv scope should be 'uni'" % n["name"])
    return out


# =========================================================================== Alembic job strings (pure)
def abc_job(roots, path, start=1, end=1, attrs=(), strip_namespaces=False, world_space=False,
            uv_write=False, extra=()):
    """AbcExport -j string. Ogawa is the only format since 2022 (maya-version-deltas 2.11).
    Grooms for Unreal: start = end = 1 and the groom_* attributes (XGUE; Giovannini)."""
    if not roots:
        raise ValueError("no roots")
    parts = ["-frameRange %s %s" % (_num(start), _num(end)), "-dataFormat ogawa"]
    if strip_namespaces:
        parts.append("-stripNamespaces")
    if world_space:
        parts.append("-worldSpace")
    if uv_write:
        parts.append("-uvWrite")
    parts += list(extra)
    parts += ["-attr %s" % a for a in attrs]
    parts += ["-root %s" % r for r in roots]
    parts.append("-file %s" % (('"%s"' % path) if " " in path else path))
    return " ".join(parts)


def _num(x):
    return str(int(x)) if float(x) == int(x) else repr(float(x))


# =========================================================================== recipes (pure store)
RECIPE_HELP = {
    "create_splines": "menu_recipe('create_splines'): Generate > Create Interactive Groom Splines (runs on the selected scalp; options from its optionVars)",
    "export_cache": "menu_recipe('export_cache') finds Generate > Cache > Export Cache; it opens a dialog, so read recipe_source('export_cache') and save a template with @node@ @path@ @start@ @end@ (Multiple Transforms and Write Final Width on)",
    "create_cache": "menu_recipe('create_cache'): Generate > Cache > Create New Cache (adds a cache read node, disables modifiers below)",
    "add_guide_modifier": "open the Interactive Groom Editor, then menu_recipe('add_guide_modifier'): its Add Modifier > Guide item (builds the Guide modifier with its inGuide network)",
    "add_curve_to_spline": "Interactive Groom Editor: menu_recipe('add_curve_to_spline'): Add Modifier > Curve to Spline, run with the curves selected",
    "create_wires": "button_recipe('create_wires', <Linear Wire node>): the Create button in its Attribute Editor",
    "make_wires_dynamic": "button_recipe('make_wires_dynamic', <Linear Wire node>): Input Wire > Make Wires Dynamic",
    "update_reference_state": "button_recipe('update_reference_state', <Linear Wire node>): Reference State > Update (run at the rest frame)",
    "convert_to_ig": "menu_recipe('convert_to_ig'): Generate > Convert to Interactive Groom (one legacy description selected)",
    "rebuild": "button_recipe('rebuild', <description_base>): CV Settings > Rebuild",
}
# label regex, and a regex the menu trail must match (None = any), per recipe. Labels are the
# 2027 help's wording; the editor's Add Modifier list is a popup that exists once the
# Interactive Groom Editor is open [verify].
RECIPE_MENUS = {
    "create_splines": (r"^Create Interactive Groom Splines", None),
    "export_cache": (r"^Export Cache", r"Cache"),
    "create_cache": (r"^Create New Cache", r"Cache"),
    "convert_to_ig": (r"^Convert to Interactive Groom", None),
    "add_guide_modifier": (r"^Guide$", r"Modifier"),
    "add_curve_to_spline": (r"^Curve to Spline$", r"Modifier"),
}
RECIPE_BUTTONS = {"create_wires": r"^Create$", "make_wires_dynamic": r"Make Wires Dynamic",
                  "update_reference_state": r"^Update$", "rebuild": r"^Rebuild$"}
RECIPE_OPTIONVARS = r"xgm|xgen|groom|igs"     # optionVars stored with a menu recipe [added filter]


def default_recipe_path():
    return os.environ.get("MX_GROOM_RECIPES") or os.path.join(HERE, "mx_groom_recipes.json")


def load_recipes(path=None):
    p = path or default_recipe_path()
    if not os.path.isfile(p):
        return {}
    with open(p) as f:
        return json.load(f)


def save_recipe(name, mel_code, note="", path=None, maya_version=None, verified=False, extra=None):
    """Store a MEL template. Tokens @name@ are filled by run_recipe(**tokens). extra: what
    the query found (menu trail, runtime command body, procedure file, optionVars)."""
    p = path or default_recipe_path()
    rec = load_recipes(p)
    rec[name] = {"mel": mel_code, "note": note, "maya": maya_version, "verified": bool(verified),
                 "saved": time.strftime("%Y-%m-%d %H:%M:%S")}
    rec[name].update(extra or {})
    tmp = p + ".tmp"
    with open(tmp, "w") as f:
        json.dump(rec, f, indent=1, sort_keys=True)
    os.replace(tmp, p)
    return rec[name]


def fill_tokens(template, tokens):
    out = template
    for k, v in tokens.items():
        out = out.replace("@%s@" % k, str(v))
    left = re.findall(r"@([A-Za-z_][A-Za-z0-9_]*)@", out)
    if left:
        raise KeyError("unfilled recipe tokens: %s" % sorted(set(left)))
    return out


def recipe_status(path=None):
    rec = load_recipes(path)
    return {k: ("recorded%s" % (" (verified)" if rec[k].get("verified") else "") if k in rec
                else "missing: " + RECIPE_HELP[k]) for k in RECIPE_HELP}


def pick_menu_item(records, label_rx, trail_rx=None):
    """Menu records (menu_items()) whose label matches label_rx (case-insensitive) and whose
    trail ("Generate > Cache > Export Cache") matches trail_rx; exact label first (pure)."""
    lr = re.compile(label_rx, re.I)
    tr = re.compile(trail_rx, re.I) if trail_rx else None
    hits = [r for r in records if r.get("label") and lr.search(r["label"]) and (tr is None or tr.search(r.get("menu", "")))]
    return sorted(hits, key=lambda r: (len(r["label"]), r.get("menu", "")))


def recipe_code(rec, option_box=False):
    """MEL that runs a queried menu item or button the way a click would (pure): its own
    command string, wrapped in python("...") when its sourceType is python. None when the
    command is not a string (a Python callable cannot be stored)."""
    cmd = rec.get("option_box_command") if option_box else rec.get("command")
    if not isinstance(cmd, str) or not cmd.strip():
        return None
    if (rec.get("source_type") or "mel") == "python":
        return 'python("%s")' % cmd.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return cmd


def whatis_file(text):
    """File path from a MEL `whatIs` answer ("Mel procedure found in: /x/y.mel"), else None."""
    m = re.search(r"found in:\s*(.+?)\s*$", text or "")
    return m.group(1) if m else None


def first_token(code):
    """First MEL identifier of a command string (the procedure or runtime command it calls)."""
    m = re.match(r"\s*(?:python\s*\(\s*\")?\s*([A-Za-z_][A-Za-z0-9_]*)", code or "")
    return m.group(1) if m else None


def mel_proc_body(text, name):
    """Source of `global proc [type] name(...) {...}` in a MEL file (pure): braces inside
    strings and comments are skipped. None when the procedure is not defined there."""
    m = re.search(r"(?:global\s+)?proc\s+(?:[A-Za-z_][\w\[\]]*\s+)?%s\s*\(" % re.escape(name), text)
    if not m:
        return None
    i = text.find("{", m.end())
    if i < 0:
        return None
    depth, j, n = 0, i, len(text)
    while j < n:
        ch = text[j]
        if ch == '"':
            j += 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
        elif text.startswith("//", j):
            j = text.find("\n", j)
            j = n if j < 0 else j
        elif text.startswith("/*", j):
            j = text.find("*/", j + 2)
            j = n if j < 0 else j + 1
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[m.start():j + 1]
        j += 1
    return None


def tokenize_node(code, node, token="node"):
    """Replace a node's long and short names in a queried command string by @token@, so a
    button recipe recorded on one Linear Wire replays on another (pure)."""
    names = sorted(set([node, node.split("|")[-1]]), key=len, reverse=True)
    for n in names:
        code = re.sub(r"(?<![\w|:])%s(?![\w])" % re.escape(n), "@%s@" % token, code)
    return code


# =========================================================================== Maya layer
def _cmds():
    import maya.cmds as cmds
    return cmds


def _mel():
    import maya.mel as mel
    return mel


def _ui_per_cm():
    return 1.0 / R.UI_TO_CM.get(_cmds().currentUnit(q=True, linear=True), 1.0)


def _long(n):
    return (_cmds().ls(n, long=True) or [n])[0]


def _short(n):
    return n.split("|")[-1]


def _tag(node, role):
    cmds = _cmds()
    try:
        if not cmds.attributeQuery("mxGroom", node=node, exists=True):
            cmds.addAttr(node, longName="mxGroom", dataType="string")
        cmds.setAttr(node + ".mxGroom", role, type="string")
    except Exception:
        pass


def _group(name):
    cmds = _cmds()
    if cmds.objExists(name) and cmds.nodeType(name) == "transform":
        return _long(name)
    g = cmds.createNode("transform", name=name)
    _tag(g, "group")
    return _long(g)


_LOAD_ORDER = []
_PRELOADED = []


def load_plugins(render=True, alembic=True):
    """Load MtoA before XGen (HAIR § XGen: otherwise Arnold is missing from the XGen renderer
    list), then AbcExport and AbcImport. Records what was already loaded."""
    cmds = _cmds()
    names = (["mtoa"] if render else []) + ["xgenToolkit"] + (["AbcExport", "AbcImport"] if alembic else [])
    rep = {}
    for n in names:
        try:
            was = bool(cmds.pluginInfo(n, q=True, loaded=True))
        except Exception:
            was = False
        if was and n not in _PRELOADED and n not in _LOAD_ORDER:
            _PRELOADED.append(n)
        try:
            if not was:
                cmds.loadPlugin(n, quiet=True)
                _LOAD_ORDER.append(n)
            rep[n] = {"loaded": True, "was_loaded": was,
                      "version": cmds.pluginInfo(n, q=True, version=True)}
        except Exception as exc:
            rep[n] = {"loaded": False, "error": "%s: %s" % (type(exc).__name__, exc)}
    return rep


def plugin_state():
    cmds = _cmds()
    loaded = {}
    for n in ("mtoa", "xgenToolkit", "AbcExport", "AbcImport"):
        try:
            loaded[n] = bool(cmds.pluginInfo(n, q=True, loaded=True))
        except Exception:
            loaded[n] = False
    return {"loaded": loaded, "order": list(_LOAD_ORDER), "preloaded": list(_PRELOADED)}


def find_attr(node, key):
    """Existing attribute name for a logical key of NAME_CANDIDATES, or the literal name if it
    exists, else None."""
    cmds = _cmds()
    for a in NAME_CANDIDATES.get(key, ()) + (key,):
        try:
            if cmds.attributeQuery(a, node=node, exists=True):
                return a
        except Exception:
            pass
    return None


def descriptions():
    """Interactive Groom description shapes (long names)."""
    cmds = _cmds()
    if DESCRIPTION_TYPE not in (cmds.allNodeTypes() or []):
        return []
    return cmds.ls(type=DESCRIPTION_TYPE, long=True) or []


def resolve(desc):
    """(transform, shape) long names of a description given either name."""
    cmds = _cmds()
    n = _long(desc)
    if not cmds.objExists(n):
        raise ValueError("no node %s" % desc)
    if cmds.nodeType(n) == DESCRIPTION_TYPE:
        return (cmds.listRelatives(n, parent=True, fullPath=True) or [n])[0], n
    shapes = cmds.listRelatives(n, shapes=True, fullPath=True, type=DESCRIPTION_TYPE) or []
    if not shapes:
        raise ValueError("%s is not an Interactive Groom description" % desc)
    return n, shapes[0]


def spline_count(desc):
    mel = _mel()
    for n in resolve(desc)[::-1]:
        try:
            return int(mel.eval('xgmSplineQuery -splineCount "%s"' % n))      # XGIG § xgmSplineQuery
        except Exception:
            continue
    return None


def gpu_memory():
    mel = _mel()
    out = {}
    for k in ("videoMemoryUsed", "videoMemoryDedicated", "videoMemoryAvailable"):
        try:
            out[k] = mel.eval("xgmSplineQuery -%s" % k)
        except Exception as exc:
            out[k] = "error: %s" % exc
    return out


def dump_spline_data(desc, path, head=4096):
    """xgmExportSplineDataInternal (documented, format unknown [verify]): writes all
    description data; returns the first `head` bytes so the format can be learned."""
    shape = resolve(desc)[1]
    _mel().eval('xgmExportSplineDataInternal -output "%s" %s.outRenderData' % (path, shape))
    with open(path, "rb") as f:
        data = f.read(head)
    return {"path": path, "bytes": os.path.getsize(path), "head": data.decode("latin-1")}


def _spline_plugs(node):
    cmds = _cmds()
    ins, outs = [], []
    for a in cmds.listAttr(node, connectable=True) or []:
        if "." in a or "splinedata" not in a.lower():
            continue
        (outs if a.lower().startswith("out") else ins).append(a)

    def order(lst, pref):
        return sorted(lst, key=lambda a: (pref.index(a) if a in pref else len(pref), a))
    return order(ins, NAME_CANDIDATES["spline_in"]), order(outs, NAME_CANDIDATES["spline_out"])


def _upstream(node):
    cmds = _cmds()
    for a in _spline_plugs(node)[0]:
        src = cmds.listConnections("%s.%s" % (node, a), source=True, destination=False, plugs=True) or []
        if src:
            return src[0], "%s.%s" % (node, a)
    return None, None


def _spline_target(node):
    """The node whose spline-data input ends a stack: a description's shape, or any node
    with a spline-data input (a Guide or Linear Wire modifier's inGuide [verify type])."""
    cmds = _cmds()
    try:
        return resolve(node)[1]
    except ValueError:
        n = _long(node)
        if cmds.objExists(n) and _spline_plugs(n)[0]:
            return n
        raise


def stack(desc):
    """Bottom-to-top list [{"node", "type"}] of the spline-data chain feeding the description
    shape (or an inGuide), base node first (XGIG: modifiers run bottom to top)."""
    cmds = _cmds()
    node = _spline_target(desc)
    chain, seen = [], set()
    while True:
        src, _dst = _upstream(node)
        if not src:
            break
        n = src.split(".")[0]
        if n in seen:
            break
        seen.add(n)
        chain.append(n)
        node = n
    chain.reverse()
    return [{"node": n, "type": cmds.nodeType(n)} for n in chain]


def _link(below, above):
    """(output plug on below, input plug on above) of their spline-data connection."""
    cmds = _cmds()
    pairs = cmds.listConnections(below, source=False, destination=True, connections=True, plugs=True) or []
    for s, d in zip(pairs[0::2], pairs[1::2]):
        if d.split(".")[0] == _short(above) or _long(d.split(".")[0]) == _long(above):
            if "splinedata" in s.lower():
                return s, d
    raise RuntimeError("no spline-data connection from %s to %s" % (below, above))


def _chain(desc):
    shape = _spline_target(desc)
    return [n["node"] for n in stack(shape)] + [shape]


def insert_modifier(desc, node_type, position="top", name=None, values=None):
    """Create a modifier and splice it into the stack (XGIG § Add a modifier using the Node
    Editor: connect In Spline Data and Out Spline Data to the neighbours). position: "top",
    "bottom" (just above the base), an int (0 = just above the base), "above:<node>" or
    "below:<node>". Get-or-create when `name` exists with that type. Returns the node."""
    cmds = _cmds()
    if name and cmds.objExists(name):
        if cmds.nodeType(name) != node_type:
            raise ValueError("%s exists and is a %s" % (name, cmds.nodeType(name)))
        if values:
            set_attrs(name, values)
        return name
    chain = _chain(desc)
    if len(chain) < 2:
        raise RuntimeError("no spline-data stack under %s (plug names? run probe())" % desc)
    if position == "top":
        i = len(chain) - 2
    elif position == "bottom":
        i = 0
    elif isinstance(position, int):
        i = max(0, min(position, len(chain) - 2))
    elif isinstance(position, str) and ":" in position and position.split(":", 1)[0] in ("above", "below"):
        side, ref = position.split(":", 1)
        names = [_short(n) for n in chain]
        j = names.index(_short(ref))
        i = j if side == "above" else j - 1
        if i < 0 or i > len(chain) - 2:
            raise ValueError("cannot insert %s %s" % (side, ref))
    else:
        raise ValueError("bad position %r" % (position,))
    below, above = chain[i], chain[i + 1]
    b_out, a_in = _link(below, above)
    node = cmds.createNode(node_type, name=name) if name else cmds.createNode(node_type)
    n_in, n_out = _spline_plugs(node)
    if not n_in or not n_out:
        raise RuntimeError("%s has no spline-data plugs: %s" % (node_type, cmds.listAttr(node, connectable=True)))
    cmds.connectAttr(b_out, "%s.%s" % (node, n_in[0]), force=True)
    cmds.connectAttr("%s.%s" % (node, n_out[0]), a_in, force=True)
    _tag(node, "modifier")
    if values:
        rep = set_attrs(node, values)
        if rep["missing"] or rep["errors"]:
            sys.stdout.write("mx_groom.insert_modifier %s: %s\n" % (node, rep))
    return node


def toggle_modifier(desc, mod, enabled):
    """A/B a modifier by rewiring around it (structural bypass that survives any enable
    attribute naming) [added]. Toggle back before editing the stack again."""
    cmds = _cmds()
    if not enabled:
        chain = _chain(desc)
        names = [_short(n) for n in chain]
        j = names.index(_short(mod))
        below, above = chain[j - 1], chain[j + 1]
        b_out, m_in = _link(below, mod)
        m_out, a_in = _link(mod, above)
        if not cmds.attributeQuery("mxBypass", node=mod, exists=True):
            cmds.addAttr(mod, longName="mxBypass", dataType="string")
        cmds.setAttr(mod + ".mxBypass", json.dumps([b_out, m_in, m_out, a_in]), type="string")
        cmds.connectAttr(b_out, a_in, force=True)
        cmds.disconnectAttr(b_out, m_in)
        return "bypassed"
    raw = cmds.getAttr(mod + ".mxBypass") if cmds.attributeQuery("mxBypass", node=mod, exists=True) else None
    if not raw:
        return "not bypassed"
    b_out, m_in, m_out, a_in = json.loads(raw)
    cmds.connectAttr(b_out, m_in, force=True)
    cmds.connectAttr(m_out, a_in, force=True)
    cmds.setAttr(mod + ".mxBypass", "", type="string")
    return "restored"


def _ramp_children(node, attr):
    cmds = _cmds()
    kids = cmds.attributeQuery(attr, node=node, listChildren=True) or []
    pos = next((k for k in kids if k.endswith("_Position")), None)
    val = next((k for k in kids if k.endswith(("_FloatValue", "_Value", "_Color"))), None)
    itp = next((k for k in kids if k.endswith("_Interp")), None)
    return pos, val, itp


def is_ramp(node, attr):
    cmds = _cmds()
    try:
        return bool(cmds.attributeQuery(attr, node=node, multi=True)) and _ramp_children(node, attr)[0] is not None
    except Exception:
        return False


def get_ramp(node, attr):
    cmds = _cmds()
    pos, val, itp = _ramp_children(node, attr)
    pts = []
    for i in cmds.getAttr("%s.%s" % (node, attr), multiIndices=True) or []:
        b = "%s.%s[%d]." % (node, attr, i)
        v = cmds.getAttr(b + val)
        pts.append((cmds.getAttr(b + pos), v[0] if isinstance(v, list) else v, cmds.getAttr(b + itp) if itp else None))
    return sorted(pts)


def set_ramp(node, attr, points, interp=1):
    """Replace a Maya ramp attribute with points [(position, value[, interp])] (1 = linear);
    child names are discovered (attr[i].attr_Position / _FloatValue / _Interp convention)."""
    cmds = _cmds()
    pos, val, itp = _ramp_children(node, attr)
    if not pos or not val:
        raise RuntimeError("%s.%s is not a ramp (children: %s)" % (node, attr, cmds.attributeQuery(attr, node=node, listChildren=True)))
    for i in cmds.getAttr("%s.%s" % (node, attr), multiIndices=True) or []:
        cmds.removeMultiInstance("%s.%s[%d]" % (node, attr, i), b=True)
    for i, p in enumerate(points):
        b = "%s.%s[%d]." % (node, attr, i)
        cmds.setAttr(b + pos, float(p[0]))
        if isinstance(p[1], (list, tuple)):
            cmds.setAttr(b + val, *p[1], type="double3")
        else:
            cmds.setAttr(b + val, float(p[1]))
        if itp:
            cmds.setAttr(b + itp, int(p[2]) if len(p) > 2 and p[2] is not None else interp)


def set_attrs(node, values):
    """Set logical keys (NAME_CANDIDATES) or literal attributes. Lists of (pos, value) go to
    ramps, strings to enums by label, string attributes or message connections (a node name).
    Returns {"set", "missing", "errors"} and never raises for a single attribute."""
    cmds = _cmds()
    rep = {"set": [], "missing": [], "errors": []}
    for key, val in values.items():
        a = find_attr(node, key)
        if not a:
            rep["missing"].append(key)
            continue
        plug = "%s.%s" % (node, a)
        try:
            if isinstance(val, (list, tuple)) and val and isinstance(val[0], (list, tuple)):
                set_ramp(node, a, val)
            else:
                t = cmds.getAttr(plug, type=True)
                if t == "message" and isinstance(val, str):
                    cmds.connectAttr(val + ".message", plug, force=True)
                elif isinstance(val, str) and t == "enum":
                    if not R._set_enum(cmds, plug, val):
                        raise ValueError("no enum label %r (labels %s)" % (val, cmds.attributeQuery(a, node=node, listEnum=True)))
                elif isinstance(val, str) and t != "string" and cmds.objExists(val):
                    cmds.connectAttr(val + ".message", plug, force=True)
                elif isinstance(val, str):
                    cmds.setAttr(plug, val, type="string")
                elif isinstance(val, (list, tuple)):
                    cmds.setAttr(plug, *val, type=t)
                else:
                    cmds.setAttr(plug, val)
            rep["set"].append(a)
        except Exception as exc:
            rep["errors"].append("%s: %s" % (a, exc))
    return rep


def get_values(node, keys=None):
    cmds = _cmds()
    out = {}
    for k in keys or NAME_CANDIDATES:
        a = find_attr(node, k)
        if not a:
            continue
        try:
            if is_ramp(node, a):
                continue
            v = cmds.getAttr("%s.%s" % (node, a))
            if isinstance(v, list) and len(v) == 1 and isinstance(v[0], tuple):
                v = v[0]
            out[k] = v
        except Exception:
            pass
    return out


def _ramp_attrs(node):
    cmds = _cmds()
    return sorted(set(a.split("[")[0] for a in (cmds.listAttr(node, multi=True) or []) if a.endswith("_Position")))


def clone_modifier(desc, mod, name=None, values=None):
    """Same-type modifier inserted directly above `mod` with its scalar, string and ramp
    values copied: the scripted equivalent of Duplicate, which keeps Map Subdivision Level
    equal for secondary clumps (XGIG § Work with Clump modifiers)."""
    cmds = _cmds()
    new = insert_modifier(desc, cmds.nodeType(mod), position="above:" + _short(mod), name=name)
    for a in cmds.listAttr(mod, settable=True, scalar=True) or []:
        if "." in a or a in ("mxGroom", "mxBypass"):
            continue
        plug = "%s.%s" % (mod, a)
        try:
            if cmds.listConnections(plug, source=True, destination=False):
                continue
            cmds.setAttr("%s.%s" % (new, a), cmds.getAttr(plug))
        except Exception:
            pass
    for a in _ramp_attrs(mod):
        try:
            set_ramp(new, a, get_ramp(mod, a))
        except Exception:
            pass
    if values:
        set_attrs(new, values)
    return new


def build_clumps(desc, primary, levels=2, ratio=4.0, convention="magnitude", position="top",
                 secondary=None):
    """Primary Clump plus (levels - 1) finer levels wired as the 2027 help requires: each is a
    clone of the level below (same Map Subdivision Level), density x ratio (Fernandez: 3 to 5
    small per big), Use Control Map on with the level below as control. The root-loose
    profile goes on the primary (Fernandez 02). primary / secondary: set_attrs dicts. When
    `secondary` turns on clump_noise (the clump-level noise that breaks the big clump and
    keeps the small ones, Fernandez 07) without a noise_scale ramp, TIP_HALF_RAMP masks it
    to the tip half [added default]."""
    if levels > MAX_CLUMP_LEVELS:
        raise ValueError("more than %d clump levels (Fernandez 03)" % MAX_CLUMP_LEVELS)
    vals = dict(primary)
    vals.setdefault("clump_scale", ROOT_LOOSE_RAMP[convention])
    p = insert_modifier(desc, "xgmModifierClump", position=position, values=vals)
    out, prev = [p], p
    for _ in range(1, levels):
        d = get_values(prev, ["clump_density"]).get("clump_density")
        s = clone_modifier(desc, prev)
        v = {"use_control_map": True, "control_using": prev}
        if d is not None:
            v["clump_density"] = d * ratio
        v.update(secondary or {})
        if (secondary or {}).get("clump_noise") and "noise_scale" not in (secondary or {}):
            v["noise_scale"] = TIP_HALF_RAMP
        rep = set_attrs(s, v)
        if rep["missing"] or rep["errors"]:
            sys.stdout.write("mx_groom.build_clumps %s: %s\n" % (s, rep))
        out.append(s)
        prev = s
    return out


def connect_texture(image, node, attr, name=None, channel="outAlpha", color_space=None):
    """File node (raw data, alpha from luminance) driving a modifier or base attribute: the
    scripted form of "use an existing texture file" for a mask (XGIG § Work with masks). One
    image can drive several descriptions (Hadi's shared density map [00:22:54])."""
    cmds = _cmds()
    a = find_attr(node, attr)
    if not a:
        raise ValueError("%s has no attribute for %r" % (node, attr))
    base = name or "mxMask"
    try:
        f = cmds.shadingNode("file", asTexture=True, isColorManaged=True, name=base + "_file#")
    except Exception:
        f = cmds.shadingNode("file", asTexture=True, name=base + "_file#")
    p = cmds.shadingNode("place2dTexture", asUtility=True, name=base + "_p2d#")
    cmds.connectAttr(p + ".outUV", f + ".uvCoord", force=True)
    cmds.connectAttr(p + ".outUvFilterSize", f + ".uvFilterSize", force=True)
    cmds.setAttr(f + ".fileTextureName", image, type="string")
    cs = color_space or _raw_space()
    if cs:
        try:
            cmds.setAttr(f + ".colorSpace", cs, type="string")
        except Exception:
            pass
    cmds.setAttr(f + ".alphaIsLuminance", 1)
    cmds.connectAttr("%s.%s" % (f, channel), "%s.%s" % (node, a), force=True)
    _tag(f, "mask")
    return f


def _raw_space():
    cmds = _cmds()
    try:
        names = cmds.colorManagementPrefs(q=True, inputSpaceNames=True) or []
    except Exception:
        return None
    for pat in (r"^raw$", r"raw", r"data"):
        for n in names:
            if re.search(pat, n, re.I):
                return n
    return None


def connect_expression(node, attr, expression, name=None):
    """xgmSeExpr node on an attribute (XGIG § Create curls and coils: rand(1,-1) on Curl).
    Expression and output attribute names are discovered [verify]."""
    cmds = _cmds()
    a = find_attr(node, attr)
    if not a:
        raise ValueError("%s has no attribute for %r" % (node, attr))
    e = cmds.createNode("xgmSeExpr", name=name or "mxExpr#")
    ea, oa = find_attr(e, "se_expression"), find_attr(e, "se_output")
    if not ea or not oa:
        raise RuntimeError("xgmSeExpr attributes not recognised; it has: %s" % (cmds.listAttr(e, connectable=True),))
    cmds.setAttr("%s.%s" % (e, ea), expression, type="string")
    cmds.connectAttr("%s.%s" % (e, oa), "%s.%s" % (node, a), force=True)
    _tag(e, "expression")
    return e


def create_description(scalp, name, recipe="create_splines", select=None, **tokens):
    """One description per hair type through the create_splines recipe, renamed to `name`
    (never description1). select: faces for a partial binding (brows, lashes). Returns
    (transform, shape) long names; raises unless exactly one new description appeared."""
    cmds = _cmds()
    before = set(descriptions())
    run_recipe(recipe, select=select or [scalp], mesh=scalp, **tokens)
    new = [d for d in descriptions() if d not in before]
    if len(new) != 1:
        raise RuntimeError("recipe %s made %d descriptions: %s" % (recipe, len(new), new))
    xf, _shape = resolve(new[0])
    xf = _long(cmds.rename(xf, name))
    _tag(xf, "description")
    return resolve(xf)


def guide_inputs(mod, depth=4):
    """The guide network a Guide or Linear Wire modifier reads: {"in_guide": the node that
    ends the guides' own spline stack, "base": its bottom node (InGuide_base, the node to
    cache for guides only, XGIG § cache)}. Found upstream of `mod`, outside its spline-data
    input, by name (inGuide: 2027 help and Flood [00:09:17]) [verify types and plugs]."""
    cmds = _cmds()
    main = (_upstream(mod)[0] or "").split(".")[0]
    seen, frontier, hits = {_short(mod)}, [mod], []
    for _ in range(depth):
        nxt = []
        for n in frontier:
            for s in cmds.listConnections(n, source=True, destination=False) or []:
                s = _short(s)
                if s in seen or s == _short(main):
                    continue
                seen.add(s)
                nxt.append(s)
                if "inguide" in s.lower():
                    hits.append(s)
        frontier = nxt
    ends = [h for h in hits if _spline_plugs(h)[0]]
    ig = next((h for h in ends if not h.lower().endswith("_base")), ends[0] if ends else None)
    base = None
    if ig:
        st = stack(ig)
        base = st[0]["node"] if st else None
    return {"in_guide": ig, "base": base, "found": hits}


def connect_curves(c2s, curves):
    """Feed NURBS curves to a Curve to Spline modifier: shape.worldSpace[0] into its curve
    input multi (name from NAME_CANDIDATES["input_curves"] [verify]). Returns the count."""
    cmds = _cmds()
    a = find_attr(c2s, "input_curves")
    if not a:
        raise RuntimeError("%s has no curve input among %s (it has %s): add Curve to Spline with the curves selected "
                           "instead (recipe add_curve_to_spline)" % (c2s, NAME_CANDIDATES["input_curves"],
                                                                     cmds.listAttr(c2s, connectable=True)))
    shapes = []
    for c in curves:
        if cmds.nodeType(c) == "nurbsCurve":
            shapes.append(_long(c))
        else:
            shapes += cmds.listRelatives(c, shapes=True, fullPath=True, type="nurbsCurve") or []
    for i, s in enumerate(shapes):
        cmds.connectAttr(s + ".worldSpace[0]", "%s.%s[%d]" % (c2s, a, i), force=True)
    return len(shapes)


def wire_guides(desc, curves, method="guide", recipe="add_guide_modifier", position=None):
    """Bring guide curves into a description so they shape the hair. Skipping this step is
    how a flow sheet never reaches the strands.
      method "guide" (default): a Guide modifier interpolates the guides onto every hair and
        carries the region maps that clean parts need (XGIG § Guide modifier: guides can be
        "generated from existing curves"; § Clump Map). The curves feed its inGuide through
        a Curve to Spline on top of the inGuide's own stack (Flood [00:09:17] does the same
        on a Linear Wire's inGuide). Default position: just above the bottom Scale, so the
        clumps and noise act on the guided shape. The Guide modifier itself does not
        disable the modifiers below it; only Curve to Spline and Spline Cache do (XGIG).
      method "hairs": Curve to Spline on top of the description itself: every curve becomes
        one hair and every modifier below is disabled (XGIG § Curve to Spline). For a few
        exact strands or a cache, never for guides.
    The Guide modifier comes from the add_guide_modifier recipe when recorded (the editor's
    Add Modifier builds the inGuide network); otherwise createNode, which may lack the
    network: then this raises and says which recipe to record."""
    cmds = _cmds()
    curves = [_long(c) for c in curves]
    if method == "hairs":
        c2s = insert_modifier(desc, "xgmCurveToSpline", "top")
        return {"method": method, "curve_to_spline": c2s, "connected": connect_curves(c2s, curves)}
    if method != "guide":
        raise ValueError("method is 'guide' or 'hairs'")
    xf, shape = resolve(desc)
    mod = next((n["node"] for n in stack(shape) if n["type"] == "xgmModifierGuide"), None)
    if not mod and recipe in load_recipes():
        before = set(cmds.ls(type="xgmModifierGuide") or [])
        run_recipe(recipe, select=[xf], node=shape)
        new = [n for n in cmds.ls(type="xgmModifierGuide") or [] if n not in before]
        mod = new[0] if new else None
    if not mod:
        if position is None:
            scale = next((n["node"] for n in stack(shape) if n["type"] == "xgmModifierScale"), None)
            position = ("above:" + _short(scale)) if scale else "bottom"
        mod = insert_modifier(shape, "xgmModifierGuide", position)
    net = guide_inputs(mod)
    if not net["in_guide"]:
        raise RuntimeError("%s has no inGuide network (found %s): add the Guide modifier through the Interactive Groom "
                           "Editor's Add Modifier, record it with menu_recipe(%r), then rerun" % (mod, net["found"], recipe))
    top = (stack(net["in_guide"]) or [{}])[-1]
    c2s = top["node"] if top.get("type") == "xgmCurveToSpline" else insert_modifier(net["in_guide"], "xgmCurveToSpline", "top")
    return {"method": method, "modifier": mod, "in_guide": net["in_guide"], "in_guide_base": net["base"],
            "curve_to_spline": c2s, "connected": connect_curves(c2s, curves)}


def viewport_aa(enable=True, samples=8):
    """Viewport 2.0 multisample anti-aliasing, on before judging any viewport capture of
    hair (FlippedNormals [00:13:07]; Fernandez 02 [00:04:03]). Returns the previous values
    so they can be restored [verify attribute names]."""
    cmds = _cmds()
    old = {}
    for a, v in (("multiSampleEnable", bool(enable)), ("multiSampleCount", samples)):
        plug = "hardwareRenderingGlobals." + a
        try:
            old[a] = cmds.getAttr(plug)
            if v is not None:
                cmds.setAttr(plug, v)
        except Exception as exc:
            old[a] = "error: %s" % exc
    return old


# ---------------------------------------------------------------- mesh data (OpenMaya 2.0)
def _mesh_dag(mesh):
    import maya.api.OpenMaya as om
    import mx_audit
    shape = mx_audit.resolve_mesh(mesh)[0]
    sel = om.MSelectionList()
    sel.add(shape)
    return sel.getDagPath(0)


def mesh_triangles(mesh, uv_set=None):
    """Triangle records for the pure functions: {"v": vertex ids, "face", "p": world points
    (UI units), "n": vertex normals, "uv": per-corner UVs or None}."""
    import maya.api.OpenMaya as om
    dag = _mesh_dag(mesh)
    fn = om.MFnMesh(dag)
    k = _ui_per_cm()
    pts = fn.getPoints(om.MSpace.kWorld)
    nrm = fn.getVertexNormals(False, om.MSpace.kWorld)
    uvs = uv_set or fn.currentUVSetName()
    has_uv = uvs in (fn.getUVSetNames() or []) and fn.numUVs(uvs) > 0
    U, V = fn.getUVs(uvs) if has_uv else ([], [])
    counts, tv = fn.getTriangles()
    out, o = [], 0
    for f in range(fn.numPolygons):
        pv = list(fn.getPolygonVertices(f))
        for _ in range(counts[f]):
            ids = (tv[o], tv[o + 1], tv[o + 2])
            o += 3
            rec = {"v": ids, "face": f,
                   "p": tuple((pts[i].x * k, pts[i].y * k, pts[i].z * k) for i in ids),
                   "n": tuple((nrm[i].x, nrm[i].y, nrm[i].z) for i in ids), "uv": None}
            if has_uv:
                try:
                    rec["uv"] = tuple((U[j], V[j]) for j in (fn.getPolygonUVid(f, pv.index(i), uvs) for i in ids))
                except RuntimeError:
                    pass
            out.append(rec)
    return out


def surface_fn(mesh):
    """surface(p) -> (closest point, unit normal) on a mesh, UI units, for grow_guide and
    analyze_strands."""
    import maya.api.OpenMaya as om
    fn = om.MFnMesh(_mesh_dag(mesh))
    k = _ui_per_cm()

    def f(p):
        cp, n, _face = fn.getClosestPointAndNormal(om.MPoint(p[0] / k, p[1] / k, p[2] / k), om.MSpace.kWorld)
        n = n.normal()
        return (cp.x * k, cp.y * k, cp.z * k), (n.x, n.y, n.z)
    return f


def border_segments(mesh):
    """World segments of the mesh's border edges: on a scalp cap, the hairline."""
    import maya.api.OpenMaya as om
    it = om.MItMeshEdge(_mesh_dag(mesh))
    k = _ui_per_cm()
    segs = []
    while not it.isDone():
        if it.onBoundary():
            a, b = it.point(0, om.MSpace.kWorld), it.point(1, om.MSpace.kWorld)
            segs.append(((a.x * k, a.y * k, a.z * k), (b.x * k, b.y * k, b.z * k)))
        it.next()
    return segs


def write_hairline_mask(scalp, path, width, edge=0.25, size=512, band=False, uv_set=None, texel_value=None):
    """Density (or transition band) mask from the distance to the scalp border, written as a
    PNG in the scalp's UVs. Connect it with connect_texture(path, base, "density_mask") and
    reuse the same file on every description (Hadi [00:22:54])."""
    tris = mesh_triangles(scalp, uv_set)
    segs = border_segments(scalp)
    if not segs:
        raise RuntimeError("%s has no border edges: a scalp cap has a hairline border" % scalp)
    vals = {vid: hairline_value(distance_to_segments(p, segs), width, edge, band=band)
            for vid, p in vertex_positions(tris).items()}
    img = rasterize_uv(tris, size, vertex_value=vals, texel_value=texel_value)
    write_mask_png(path, size, img)
    return {"path": path, "size": size, "mean": _mean(img), "border_segments": len(segs)}


def scalp_verdict(r, for_unreal=False):
    """Lines for an mx_audit.audit() report of the growth mesh (pure): what grooming needs
    from scenario-maya-retopology-uv. Scalp-only mesh (XGIG § Get started), UVs because IG hairs
    inherit the base's UVs (Schneider [00:25:13]) and masks and root UVs live in them, no
    history (FlippedNormals [00:04:30]), UV set map1 for Epic's root-UV bake (Giovannini
    [00:34:20])."""
    out = []
    uv = r.get("uv") or {}
    sets = r.get("uv_sets") or []
    if not sets or uv.get("uvs") == 0:
        out.append("error: no UVs on the growth mesh")
    if uv.get("faces_without_uvs"):
        out.append("error: %s faces without UVs" % uv["faces_without_uvs"])
    if uv.get("uv_overlapping_shell_pairs") or (uv.get("uv_overlap_pct") or 0) > 0:
        out.append("warn: overlapping UVs; masks and root UVs need one texel per surface point [added]")
    if uv.get("uvs_outside_01") and not uv.get("looks_udim"):
        out.append("warn: UVs outside 0-1; the mask rasterizer only covers 0-1 [added]")
    if for_unreal and "map1" not in [s if isinstance(s, str) else s.get("name") for s in sets]:
        out.append("warn: no UV set named map1 (uv_set_map1())")
    tr = r.get("transform") or {}
    if tr and not tr.get("frozen", True):
        out.append("warn: transforms not frozen")
    if r.get("history_nodes"):
        out.append("warn: construction history on the growth mesh: delete it before grooming")
    if not r.get("border_edges"):
        out.append("warn: closed mesh; a scalp cap is open and its border is the hairline (write_hairline_mask needs it)")
    if (r.get("non_manifold_edges") or 0) or (r.get("lamina_faces") or 0):
        out.append("error: non-manifold or lamina geometry on the growth mesh")
    return out


def scalp_check(scalp, for_unreal=False):
    """mx_audit on the growth mesh plus scalp_verdict()."""
    import mx_audit
    r = mx_audit.audit(scalp)
    return {"lines": scalp_verdict(r, for_unreal), "audit": r}


# ---------------------------------------------------------------- curves
def read_curves(root):
    """[(shape long name, [points])] for every non-intermediate NURBS curve under root (or
    the curve itself), CVs in world space, UI units."""
    import maya.api.OpenMaya as om
    cmds = _cmds()
    shapes = []
    for r in (root if isinstance(root, (list, tuple)) else [root]):
        if cmds.nodeType(r) == "nurbsCurve":
            shapes.append(_long(r))
        shapes += cmds.listRelatives(r, allDescendents=True, type="nurbsCurve", fullPath=True) or []
    shapes = [s for s in dict.fromkeys(shapes) if not cmds.getAttr(s + ".intermediateObject")]
    k = _ui_per_cm()
    out = []
    for s in shapes:
        sel = om.MSelectionList()
        sel.add(s)
        cv = om.MFnNurbsCurve(sel.getDagPath(0)).cvPositions(om.MSpace.kWorld)
        out.append((s, [(p.x * k, p.y * k, p.z * k) for p in cv]))
    return out


def rebuild_curves(curves, cvs=20):
    """Rebuild cubic curves to `cvs` CVs (spans = cvs - 3); Giovannini rebuilds guides to 20
    before editing [00:05:20]. Returns the CV counts after."""
    cmds = _cmds()
    out = []
    for c in curves:
        cmds.rebuildCurve(c, constructionHistory=False, replaceOriginal=True, rebuildType=0, endKnots=1,
                          keepRange=0, keepControlPoints=False, keepEndPoints=True, keepTangents=False,
                          spans=max(1, cvs - 3), degree=3)
        sh = (cmds.listRelatives(c, shapes=True, fullPath=True, type="nurbsCurve") or [c])[0]
        out.append(cmds.getAttr(sh + ".spans") + cmds.getAttr(sh + ".degree"))
    return out


def make_guides(scalp, flow, spacing=None, count=None, cvs=8, collide=None, offset=None,
                lift=(0.5, 0.05), gravity=0.0, symmetric=False, seed=1, group="mxGuides_GRP",
                prefix="mxGuide", mask=None, length_random=None, rebuild=None):
    """Guide curves grown from a flow sheet on the scalp: the scripted substitute for Add
    Guides, Comb and Sculpt Guides. Few first (FlippedNormals [00:08:54]), more only where the
    interpolation facets (Fernandez 01 [00:09:31]). symmetric=True grows the +X half and
    mirrors it (Hadi [00:08:51], symmetric topology only). length_random=(0.8, 1.2) balances
    random length around 1 (Fernandez 08). collide: mesh kept outside (offset defaults to 1%
    of the guide length [added]). Returns {"group", "curves", "roots", "count"}."""
    cmds = _cmds()
    probs = check_flow_sheet(flow)
    if probs:
        raise ValueError("flow sheet: %s" % probs)
    tris = mesh_triangles(scalp)
    roots = sample_triangles(tris, count=count, spacing=spacing, seed=seed, mask=mask)
    if symmetric:
        roots = [r for r in roots if r["p"][0] >= 0.0]
    surf = surface_fn(collide) if collide else None
    rng = random.Random(seed)
    made = []
    for r in roots:
        L = flow_length(r["p"], flow)
        if length_random:
            L *= rng.uniform(*length_random)
        off = offset if offset is not None else (0.01 * L if surf else None)
        pts = grow_guide(r["p"], r["n"], flow, length=L, cvs=cvs, lift=lift, gravity=gravity,
                         surface=surf, offset=off)
        variants = [pts]
        if symmetric and r["p"][0] > 1e-6:
            variants.append([(-x, y, z) for x, y, z in pts])
        for pv in variants:
            made.append(cmds.curve(degree=3, point=pv, name="%s%04d" % (prefix, len(made) + 1)))
    grp = _group(group)
    made = [_long(c) for c in (cmds.parent(made, grp) or made)] if made else []
    for c in made:
        _tag(c, "guide")
    if rebuild:
        rebuild_curves(made, rebuild)
    return {"group": grp, "curves": made, "roots": len(roots), "count": len(made)}


def fill_layer_from_guides(curves, keep=FILL_KEEP, cvs=20, group="mxFillGuides_GRP", prefix="fill_"):
    """Giovannini's fill layer: copies of the body guides rebuilt to 20 CVs and cut at about 2/3
    of their length from the root, so a short fill hides the scalp [00:04:48] to [00:05:56]."""
    import maya.api.OpenMaya as om
    cmds = _cmds()
    grp = _group(group)
    out = []
    for c in curves:
        d = cmds.duplicate(c, name=prefix + _short(c))[0]
        rebuild_curves([d], cvs)
        sh = cmds.listRelatives(d, shapes=True, fullPath=True, type="nurbsCurve")[0]
        sel = om.MSelectionList()
        sel.add(sh)
        fn = om.MFnNurbsCurve(sel.getDagPath(0))
        root = fn.cvPosition(0, om.MSpace.kWorld)
        prm = fn.findParamFromLength(fn.length() * keep)
        pieces = cmds.detachCurve("%s.u[%r]" % (d, prm), constructionHistory=False, replaceOriginal=True) or [d]
        keep_piece, best = None, None
        for p in pieces:
            if not cmds.objExists(p):
                continue
            q = cmds.pointPosition(p + ".cv[0]", world=True)
            dd = math.sqrt((q[0] - root.x * _ui_per_cm()) ** 2 + (q[1] - root.y * _ui_per_cm()) ** 2 + (q[2] - root.z * _ui_per_cm()) ** 2)
            if best is None or dd < best:
                keep_piece, best = p, dd
        for p in pieces:
            if p != keep_piece and cmds.objExists(p):
                cmds.delete(p)                        # the discarded tip of our own copy
        out.append(keep_piece)
    out = [_long(c) for c in (cmds.parent(out, grp) or out)] if out else []
    for c in out:
        _tag(c, "fill_guide")
    return {"group": grp, "curves": out}


def measure_curves(root, surface=None, flow=None, reference_root=None, style="realistic", long_hair=True, **kw):
    """analyze_strands on curves in the scene (guides, or an imported cache). surface: mesh
    for penetration and root normals (flow-sheet error). kw go to analyze_strands."""
    strands = [p for _s, p in read_curves(root)]
    ref = [p for _s, p in read_curves(reference_root)] if reference_root else None
    surf = surface_fn(surface) if surface else None
    normals = [surf(s[0])[1] for s in strands] if (surf and flow) else None
    rep = analyze_strands(strands, reference=ref, flow=flow, normals=normals, surface=surf, **kw)
    rep["verdict"] = strand_verdict(rep, style=style, long_hair=long_hair)
    return rep


# ---------------------------------------------------------------- Alembic
def _no_space_copy(path):
    if " " not in path:
        return path, None
    tmp = tempfile.mkdtemp(prefix="mxgroom_")
    dst = os.path.join(tmp, os.path.basename(path).replace(" ", "_"))
    shutil.copyfile(path, dst)
    return dst, tmp


def export_abc(roots, path, start=1, end=1, attrs=(), strip_namespaces=False, world_space=False,
               uv_write=False, extra=()):
    """AbcExport through a space-free temp path when `path` has spaces (AbcExport's job
    string parsing of quoted paths is unverified [verify]), then moved into place."""
    cmds = _cmds()
    if not cmds.pluginInfo("AbcExport", q=True, loaded=True):
        cmds.loadPlugin("AbcExport", quiet=True)
    final = os.path.abspath(path)
    os.makedirs(os.path.dirname(final), exist_ok=True)
    tmpdir = tempfile.mkdtemp(prefix="mxgroom_") if " " in final else None
    target = os.path.join(tmpdir, os.path.basename(final).replace(" ", "_")) if tmpdir else final
    job = abc_job([_long(r) for r in roots], target, start, end, attrs, strip_namespaces, world_space, uv_write, extra)
    cmds.AbcExport(j=job)
    if tmpdir:
        shutil.move(target, final)
        shutil.rmtree(tmpdir, ignore_errors=True)
    return {"path": final, "job": job, "bytes": os.path.getsize(final)}


def _summ(cmds, node, a):
    plug = "%s.%s" % (node, a)
    try:
        t = cmds.getAttr(plug, type=True)
        v = cmds.getAttr(plug)
    except Exception as exc:
        return {"error": str(exc)}
    if isinstance(v, (list, tuple)) and t in ("vectorArray", "doubleArray", "Int32Array", "pointArray", "floatArray"):
        flat = [tuple(round(float(c), 5) for c in x) if isinstance(x, (list, tuple)) else round(float(x), 5) for x in v]
        return {"type": t, "len": len(v), "unique": len(set(flat)), "first": flat[:3]}
    if isinstance(v, list) and len(v) == 1 and isinstance(v[0], tuple):
        v = v[0]
    return {"type": t, "value": v}


def inspect_scene(roots):
    """Record of the nodes under roots for unreal_verdict(): user attributes (arrays
    summarised), curve counts, duplicate short names."""
    cmds = _cmds()
    nodes, names = [], []
    all_nodes = []
    for r in roots:
        all_nodes += [_long(r)] + (cmds.listRelatives(r, allDescendents=True, fullPath=True) or [])
    for n in dict.fromkeys(all_nodes):
        names.append(_short(n))
        ud = cmds.listAttr(n, userDefined=True) or []
        rec = {"name": n, "type": cmds.nodeType(n), "attrs": {a: _summ(cmds, n, a) for a in ud if a != "mxGroom"}}
        if rec["type"] == "transform":
            rec["curves_below"] = len(cmds.listRelatives(n, allDescendents=True, type="nurbsCurve") or [])
        nodes.append(rec)
    curves = sum(1 for n in nodes if n["type"] == "nurbsCurve")
    dups = sorted(set(x for x in names if names.count(x) > 1))
    return {"curves": curves, "nodes": nodes, "duplicate_names": dups}


def inspect_abc(path, cleanup=True):
    """Import an Alembic into the current scene, record it (inspect_scene), and delete what
    the import created. Run in a fresh mayapy (mx_run) so nothing else is touched."""
    cmds = _cmds()
    if not cmds.pluginInfo("AbcImport", q=True, loaded=True):
        cmds.loadPlugin("AbcImport", quiet=True)
    src, tmp = _no_space_copy(os.path.abspath(path))
    before = set(cmds.ls(long=True) or [])
    try:
        cmds.AbcImport(src, mode="import")
        new = [n for n in cmds.ls(long=True) or [] if n not in before]
        tops = [n for n in cmds.ls(new, type="transform", long=True) or [] if n.count("|") == 1]
        info = inspect_scene(tops) if tops else {"curves": 0, "nodes": [], "duplicate_names": []}
        info["path"] = path
        info["created"] = len(new)
        if cleanup and tops:
            cmds.delete(tops)
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)
    return info


def strands_from_abc(path):
    """Strands (lists of points, root first) of an Alembic curve cache: import, read, delete
    the import. For hierarchy_from_states() and compare_states() on mid-stack caches."""
    cmds = _cmds()
    if not cmds.pluginInfo("AbcImport", q=True, loaded=True):
        cmds.loadPlugin("AbcImport", quiet=True)
    src, tmp = _no_space_copy(os.path.abspath(path))
    before = set(cmds.ls(long=True) or [])
    try:
        cmds.AbcImport(src, mode="import")
        tops = [n for n in cmds.ls(long=True) or [] if n not in before and n.count("|") == 1
                and cmds.nodeType(n) == "transform"]
        out = [p for _s, p in read_curves(tops)] if tops else []
        if tops:
            cmds.delete(tops)
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)
    return out


def measure_abc(path, surface=None, flow=None, **kw):
    """Import an exported groom cache as curves, analyze it, delete the import."""
    cmds = _cmds()
    if not cmds.pluginInfo("AbcImport", q=True, loaded=True):
        cmds.loadPlugin("AbcImport", quiet=True)
    src, tmp = _no_space_copy(os.path.abspath(path))
    before = set(cmds.ls(long=True) or [])
    try:
        cmds.AbcImport(src, mode="import")
        tops = [n for n in cmds.ls(long=True) or [] if n not in before and n.count("|") == 1
                and cmds.nodeType(n) == "transform"]
        rep = measure_curves(tops, surface=surface, flow=flow, **kw)
        rep["path"] = path
        cmds.delete(tops)
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)
    return rep


# ---------------------------------------------------------------- Unreal tags (XGUE, ported to Python 3 / API 2.0)
def _add_tag(node, ln, value, kind):
    cmds = _cmds()
    if not cmds.attributeQuery(ln, node=node, exists=True):
        if kind == "string":
            cmds.addAttr(node, longName=ln, dataType="string")
        else:
            cmds.addAttr(node, longName=ln, attributeType=kind, defaultValue=value)
    if kind == "string":
        cmds.setAttr("%s.%s" % (node, ln), value, type="string")
    else:
        cmds.setAttr("%s.%s" % (node, ln), value)


def tag_group_id(group, gid):
    """groom_group_id (short) + groom_group_id_AbcGeomScope 'con' on a strand group (XGUE §
    Create Group ID Attributes): the unit of material and sim control in Unreal."""
    _add_tag(group, "groom_group_id", int(gid), "short")
    _add_tag(group, "groom_group_id_AbcGeomScope", "con", "string")
    return group


def tag_guides(curves, group="guides", freeze=True):
    """Epic's guide tagging: a 'guides' transform with groom_guide = 1, riCurves = 1 (one
    curve group on export) and groom_guide_AbcGeomScope 'con'; every curve shape reparented
    under it (XGUE § Create Guide Attributes). One parent call instead of a loop [added]; the
    Outliner is the bottleneck, keep it closed (Giovannini [00:23:58]). Leave the fill guides
    out (Giovannini [00:18:17])."""
    cmds = _cmds()
    g = _group(group)
    _add_tag(g, "groom_guide", 1, "short")
    _add_tag(g, "riCurves", True, "bool")
    _add_tag(g, "groom_guide_AbcGeomScope", "con", "string")
    xforms = [c for c in curves if cmds.nodeType(c) == "transform"]
    if freeze and xforms:
        cmds.makeIdentity(xforms, apply=True, translate=True, rotate=True, scale=True)
    shapes = []
    for c in curves:
        shapes += [c] if cmds.nodeType(c) == "nurbsCurve" else (cmds.listRelatives(c, shapes=True, fullPath=True, type="nurbsCurve") or [])
    if shapes:
        cmds.parent(shapes, g, shape=True, relative=True)
    return {"group": g, "shapes": len(shapes)}


def uv_set_map1(mesh):
    """Epic's root-UV script reads UV set map1 only (Giovannini [00:34:20]): rename the
    current set if map1 is missing. Returns what was done."""
    cmds = _cmds()
    sets = cmds.polyUVSet(mesh, q=True, allUVSets=True) or []
    if "map1" in sets:
        return "map1 present"
    cur = (cmds.polyUVSet(mesh, q=True, currentUVSet=True) or [None])[0]
    if not cur:
        raise RuntimeError("%s has no UV set" % mesh)
    cmds.polyUVSet(mesh, rename=True, uvSet=cur, newUVSet="map1")
    return "renamed %s to map1" % cur


def bake_root_uv(curves_group, mesh, uv_set="map1", snap=True):
    """groom_root_uv (vectorArray, scope 'uni', type 'vector2') on the curve group: the UV of
    each curve's root on the growth mesh (XGUE § Applying Textures to Hair UVs, ported from
    API 1.0 MScriptUtil). snap: project the root on the mesh first [added]. Curve order must
    match AbcExport's order [verify]."""
    import maya.api.OpenMaya as om
    cmds = _cmds()
    if uv_set not in (cmds.polyUVSet(mesh, q=True, allUVSets=True) or []):
        raise RuntimeError("UV set %s missing on %s (uv_set_map1())" % (uv_set, mesh))
    shapes = cmds.listRelatives(curves_group, children=True, shapes=True, type="nurbsCurve", fullPath=True) or []
    if not shapes:
        shapes = cmds.listRelatives(curves_group, allDescendents=True, type="nurbsCurve", fullPath=True) or []
    shapes = [s for s in shapes if not cmds.getAttr(s + ".intermediateObject")]
    fn = om.MFnMesh(_mesh_dag(mesh))
    k = _ui_per_cm()
    values = []
    for s in shapes:
        q = cmds.pointPosition(s + ".cv[0]", world=True)
        p = om.MPoint(q[0] / k, q[1] / k, q[2] / k)
        if snap:
            p = fn.getClosestPoint(p, om.MSpace.kWorld)[0]
        u, v, _f = fn.getUVAtPoint(p, om.MSpace.kWorld, uv_set)
        values.append((u, v, 0.0))
    ln = "groom_root_uv"
    if not cmds.attributeQuery(ln, node=curves_group, exists=True):
        cmds.addAttr(curves_group, longName=ln, dataType="vectorArray")
    cmds.setAttr("%s.%s" % (curves_group, ln), len(values), *values, type="vectorArray")
    _add_tag(curves_group, ln + "_AbcGeomScope", "uni", "string")
    _add_tag(curves_group, ln + "_AbcType", "vector2", "string")
    return {"curves": len(values), "unique_uvs": len(set((round(a, 5), round(b, 5)) for a, b, _c in values))}


def prefix_hierarchy(root, prefix):
    """Prefix every node under root (Modify > Prefix Hierarchy Names): wires of several
    characters never collide in one shot (Flood [00:04:26]). Deepest first."""
    cmds = _cmds()
    nodes = [_long(root)] + (cmds.listRelatives(root, allDescendents=True, fullPath=True) or [])
    nodes.sort(key=lambda n: n.count("|"), reverse=True)
    done = 0
    for n in nodes:
        s = _short(n)
        if not s.startswith(prefix):
            cmds.rename(n, prefix + s)
            done += 1
    return done


# ---------------------------------------------------------------- shader
def _sg_of(shape):
    cmds = _cmds()
    return cmds.listSets(object=shape, type=1) or []


def hair_shapes(targets, types=("nurbsCurve", DESCRIPTION_TYPE)):
    """Non-intermediate description and curve shapes of targets (shapes, transforms, groups)."""
    cmds = _cmds()
    out = []
    for t in (targets if isinstance(targets, (list, tuple)) else [targets]):
        n = _long(t)
        if cmds.nodeType(n) in types:
            out.append(n)
        out += cmds.listRelatives(n, allDescendents=True, fullPath=True, type=list(types)) or []
    return [s for s in dict.fromkeys(out) if not (cmds.attributeQuery("intermediateObject", node=s, exists=True)
                                               and cmds.getAttr(s + ".intermediateObject"))]


def hair_shader(target, preset="brown", name=None, values=None, hair_type=None):
    """aiStandardHair with realistic defaults (diffuse 0, tints white, indirect 1, IOR 1.55,
    roughness 0.2, HAIR doc) plus a melanin preset, assigned to a description (replacing the
    default hairPhysicalShader, XGIG § Render) or connected to NURBS curves' aiCurveShader
    [verify]. hair_type picks Shift from SHIFT_BY_TYPE. Returns {"shader", "sg", "report"}."""
    cmds = _cmds()
    sh = cmds.shadingNode("aiStandardHair", asShader=True, name=name or "hair_MTL#")
    sg = cmds.sets(renderable=True, noSurfaceShader=True, empty=True, name=sh + "SG")
    cmds.connectAttr(sh + ".outColor", sg + ".surfaceShader", force=True)
    vals = dict(HAIR_REALISTIC)
    vals.update(HAIR_PRESETS.get(preset, {}))
    if hair_type:
        vals["shift"] = SHIFT_BY_TYPE[hair_type]
    vals.update(values or {})
    report = set_attrs(sh, vals)
    for n in hair_shapes(target):
        if cmds.nodeType(n) == "nurbsCurve":
            if cmds.attributeQuery("aiCurveShader", node=n, exists=True):
                cmds.connectAttr(sh + ".outColor", n + ".aiCurveShader", force=True)
            else:
                report["errors"].append("%s: no aiCurveShader attribute (curve shading) [verify]" % n)
        else:
            cmds.sets(n, edit=True, forceElement=sg)
    _tag(sh, "shader")
    return {"shader": sh, "sg": sg, "report": report}


def curve_render(target, mode="ribbon", min_pixel_width=None, opaque=None, width=None):
    """Arnold curve settings on descriptions or NURBS curves: ribbon for hair (thick is for
    tentacles), Min Pixel Width works in ribbon mode only, Ai Opaque off only for opacity < 1
    (HAIR). NURBS curves also get aiRenderCurve and aiCurveWidth [verify names]."""
    cmds = _cmds()
    out = {}
    for s in hair_shapes(target):
        vals = {"ai_mode": mode}
        if min_pixel_width is not None:
            vals["ai_min_pixel_width"] = min_pixel_width
        if opaque is not None:
            vals["ai_opaque"] = bool(opaque)
        if cmds.nodeType(s) == "nurbsCurve":
            vals["aiRenderCurve"] = True
            if width is not None:
                vals["aiCurveWidth"] = width
        out[s] = set_attrs(s, vals)
    return out


def shader_record(shape):
    cmds = _cmds()
    sh = None
    if cmds.nodeType(shape) == "nurbsCurve" and cmds.attributeQuery("aiCurveShader", node=shape, exists=True):
        src = cmds.listConnections(shape + ".aiCurveShader", source=True, destination=False) or []
        sh = src[0] if src else None
    else:
        for sg in _sg_of(shape):
            src = cmds.listConnections(sg + ".surfaceShader", source=True, destination=False) or []
            if src:
                sh = src[0]
                break
    if not sh:
        return {}
    attrs, con = {}, []
    for a in HAIR_ATTRS:
        if cmds.attributeQuery(a, node=sh, exists=True):
            try:
                v = cmds.getAttr("%s.%s" % (sh, a))
                attrs[a] = v[0] if isinstance(v, list) and len(v) == 1 else v
            except Exception:
                pass
            if cmds.listConnections("%s.%s" % (sh, a), source=True, destination=False):
                con.append(a)
    return {"type": cmds.nodeType(sh), "node": sh, "attrs": attrs, "connected": con}


# ---------------------------------------------------------------- extract + lint
def guess_role(name):
    n = name.lower()
    for pat, role in ((r"stray|flyaway", "stray"), (r"fill", "fill"), (r"brow", "brow"), (r"lash", "lash"),
                      (r"fuzz|peach|vellus", "fuzz"), (r"transition", "transition"), (r"guide|wire", "guide")):
        if re.search(pat, n):
            return role
    return "body"


def _node_record(node):
    cmds = _cmds()
    rec = {"node": node, "type": cmds.nodeType(node), "attrs": get_values(node), "ramps": {}, "inputs": {}}
    for key in ("clump_scale", "noise_scale"):
        a = find_attr(node, key)
        if a and is_ramp(node, a):
            try:
                rec["ramps"][key] = get_ramp(node, a)
            except Exception:
                pass
    for key in NAME_CANDIDATES:
        a = find_attr(node, key)
        if a:
            src = cmds.listConnections("%s.%s" % (node, a), source=True, destination=False) or []
            if src and "splinedata" not in a.lower():
                rec["inputs"][key] = src[0]
    try:
        rec["node_state"] = cmds.getAttr(node + ".nodeState")
    except Exception:
        pass
    return rec


def extract(descs=None, roles=None):
    """Plain data for verdict(): plug-ins, scene state, and per description its stack (base
    first), resolved attribute values, ramps, connected inputs, shader and curve settings."""
    cmds = _cmds()
    data = {"plugins": plugin_state(),
            "scene": {"path": cmds.file(q=True, sceneName=True), "modified": cmds.file(q=True, modified=True)},
            "descriptions": []}
    for d in descs or descriptions():
        xf, shape = resolve(d)
        nm = _short(xf)
        rec = {"name": nm, "shape": shape, "role": (roles or {}).get(nm) or guess_role(nm),
               "splines": spline_count(shape), "stack": [_node_record(n["node"]) for n in stack(shape)],
               "shader": shader_record(shape), "render": get_values(shape, ["ai_mode", "ai_min_pixel_width", "ai_opaque", "face_camera"])}
        data["descriptions"].append(rec)
    return data


def lint(descs=None, roles=None, **kw):
    """extract() then verdict(): the pre-render and pre-handoff check."""
    data = extract(descs, roles)
    return {"lines": verdict(data, **kw), "data": data}


# ---------------------------------------------------------------- discovery
def candidates_report(catalog):
    """Which NAME_CANDIDATES resolve on which node types, from probe()['attr_catalog'] (pure)."""
    out = {}
    for key, cands in NAME_CANDIDATES.items():
        hits = {}
        for typ, attrs in catalog.items():
            got = [c for c in cands if c in attrs]
            if got:
                hits[typ] = got[0]
        out[key] = hits
    return out


def probe(catalog=True, commands=True):
    """What this Maya really has for grooming. Run once per install, headless (mx_run) and
    in the GUI (bridge): versions, xgm node types, attributes of creatable nodes, documented
    commands, runtime commands whose name mentions groom or xgen (the menu actions to
    capture as recipes), xgenm importability, descriptions and whether they evaluate here."""
    cmds, mel = _cmds(), _mel()
    rec = {"maya": cmds.about(version=True), "batch": cmds.about(batch=True), "plugins": load_plugins()}
    types = cmds.allNodeTypes() or []
    rec["xgm_node_types"] = sorted(t for t in types if t.lower().startswith("xgm"))
    rec["expected_types"] = {t: t in types for t in MODIFIER_TYPES + (DESCRIPTION_TYPE, "xgmSeExpr",
                             "xgmCurveToSpline_dynamic", "aiStandardHair", "hairPhysicalShader")}
    if commands:
        rec["doc_commands"] = {}
        for c in DOC_COMMANDS:
            try:
                rec["doc_commands"][c] = mel.eval('whatIs "%s"' % c)
            except Exception as exc:
                rec["doc_commands"][c] = "error: %s" % exc
        try:
            rec["help_list_xgm"] = cmds.help("xgm*", list=True)            # [verify flag]
        except Exception as exc:
            rec["help_list_xgm"] = "error: %s" % exc
        rts = []
        try:
            for rc in cmds.runTimeCommand(q=True, commandArray=True) or []:
                if re.search(r"groom|xgm|xgen", rc, re.I):
                    try:
                        body = cmds.runTimeCommand(rc, q=True, command=True) or ""
                    except Exception:
                        body = ""
                    rts.append([rc, body[:300]])
        except Exception as exc:
            rts.append(["error", str(exc)])
        rec["runtime_commands"] = rts
        if not rec["batch"]:                   # GUI: which menu items each recipe would come from
            try:
                recs = menu_items()
                rec["menu_matches"] = {k: [r["menu"] for r in pick_menu_item(recs, *v)[:5]] for k, v in RECIPE_MENUS.items()}
            except Exception as exc:
                rec["menu_matches"] = "error: %s" % exc
    try:
        import xgenm  # noqa: F401
        rec["xgenm"] = "importable"
    except Exception as exc:
        rec["xgenm"] = "error: %s" % exc
    if catalog:
        cat = {}
        for t in MODIFIER_TYPES + ("xgmSeExpr", "aiStandardHair", "hairPhysicalShader"):
            if t not in types:
                continue
            n = None
            try:
                n = cmds.createNode(t)
                cat[t] = sorted(a for a in cmds.listAttr(n) or [] if "." not in a)
            except Exception as exc:
                cat[t] = ["error: %s" % exc]
            finally:
                if n and cmds.objExists(n):
                    cmds.delete(n)
        rec["attr_catalog"] = cat
        rec["candidates"] = candidates_report({k: v for k, v in cat.items() if v and not v[0].startswith("error")})
    rec["descriptions"] = []
    for d in descriptions():
        entry = {"shape": d, "splines": spline_count(d)}
        try:
            entry["stack"] = stack(d)
        except Exception as exc:
            entry["stack"] = "error: %s" % exc
        rec["descriptions"].append(entry)
    rec["gpu"] = gpu_memory()
    rec["recipes"] = recipe_status()
    return rec


def _q(fn, path, **flag):
    try:
        return fn(path, q=True, **flag)
    except Exception:
        return None


def _menu_children(path):
    cmds = _cmds()
    return _q(cmds.menu, path, itemArray=True) or []


def _menu_build(path):
    """Run a lazily built menu's postMenuCommand so its items exist (Maya builds most main
    menus on first open) [verify]."""
    cmds, mel = _cmds(), _mel()
    pmc = _q(cmds.menu, path, postMenuCommand=True) or _q(cmds.menuItem, path, postMenuCommand=True)
    if not isinstance(pmc, str) or not pmc.strip():
        return False
    try:
        cmds.setParent(path, menu=True)
    except Exception:
        pass
    try:
        mel.eval(pmc)
        return True
    except Exception:
        try:
            exec(pmc, {"cmds": cmds, "mel": mel})
            return True
        except Exception:
            return False


def _item_record(path):
    cmds = _cmds()
    mi = cmds.menuItem
    if _q(mi, path, divider=True):
        return {"path": path, "divider": True}
    return {"path": path, "label": _q(mi, path, label=True) or "", "command": _q(mi, path, command=True),
            "source_type": _q(mi, path, sourceType=True) or "mel", "option_box": bool(_q(mi, path, optionBox=True)),
            "submenu": bool(_q(mi, path, subMenu=True)), "annotation": _q(mi, path, annotation=True) or "",
            "divider": False}


def menu_items(pattern=None, roots=None, build=True, max_depth=6, menu_set="modelingMenuSet"):
    """GUI only (mx_bridge): every menu item under Maya's main menus and the open popup
    menus (the Interactive Groom Editor's Add Modifier list once the editor is open
    [verify]), with the command string it runs: cmds.menuItem(item, q=True, command=True).
    Lazily built menus are built first (postMenuCommand). An option box's command is
    attached to the item before it. pattern filters on label or trail. Returns
    [{"path", "label", "menu" (trail), "command", "source_type", "option_box_command", ...}]."""
    cmds, mel = _cmds(), _mel()
    if cmds.about(batch=True):
        raise RuntimeError("menus exist only in the GUI session: run through mx_bridge")
    if menu_set:
        try:
            mel.eval('setMenuMode "%s"' % menu_set)          # Generate lives in the Modeling menu set [verify proc]
        except Exception:
            pass
    if roots is None:
        roots = ["MayaWindow|" + m for m in (_q(cmds.window, "MayaWindow", menuArray=True) or [])]
        try:
            roots += cmds.lsUI(type="popupMenu", long=True) or []
        except Exception:
            pass
    out, seen = [], set()

    def walk(path, depth, trail):
        if depth > max_depth or path in seen:
            return
        seen.add(path)
        items = _menu_children(path)
        if build and not items and _menu_build(path):
            items = _menu_children(path)
        prev = None
        for it in items:
            full = it if it.count("|") and it.startswith(path) else path + "|" + it.split("|")[-1]
            rec = _item_record(full)
            if rec.get("divider"):
                prev = None
                continue
            if rec["option_box"]:
                if prev is not None:
                    prev["option_box_command"] = rec["command"]
                continue
            rec["menu"] = " > ".join(trail + [rec["label"]])
            if rec["submenu"]:
                walk(full, depth + 1, trail + [rec["label"]])
                prev = None
                continue
            out.append(rec)
            prev = rec

    for r in roots:
        walk(r, 0, [_q(cmds.menu, r, label=True) or r.split("|")[-1]])
    if pattern:
        rx = re.compile(pattern, re.I)
        out = [r for r in out if rx.search(r["label"]) or rx.search(r["menu"])]
    return out


def _resolve_command(code):
    """Runtime command body and the file of the MEL procedure a command string calls."""
    cmds, mel = _cmds(), _mel()
    info = {"first_token": first_token(code)}
    tok = info["first_token"]
    if not tok:
        return info
    try:
        if cmds.runTimeCommand(tok, exists=True):
            info["runtime_command"] = tok
            body = cmds.runTimeCommand(tok, q=True, command=True) or ""
            info["runtime_body"] = body
            tok = first_token(body) or tok
            info["proc"] = tok
    except Exception:
        pass
    try:
        w = mel.eval('whatIs "%s"' % tok)
        info["what_is"] = w
        info["proc"] = tok
        info["proc_file"] = whatis_file(w)
    except Exception as exc:
        info["what_is"] = "error: %s" % exc
    return info


def option_vars(pattern=RECIPE_OPTIONVARS):
    """optionVars whose name matches pattern, with values: the options a menu item without
    its option box runs with (Density, Length, CV Count...) [added filter]."""
    cmds = _cmds()
    rx = re.compile(pattern, re.I)
    out = {}
    for n in cmds.optionVar(list=True) or []:
        if rx.search(n):
            try:
                out[n] = cmds.optionVar(q=n)
            except Exception:
                pass
    return out


def menu_recipe(name, pattern=None, trail=None, option_box=False, path=None, roots=None, verified=False):
    """Save a recipe from a menu item's own command string, queried through the GUI bridge
    (no click, no Script Editor echo). pattern / trail default to RECIPE_MENUS[name]. Stores
    the MEL, the menu trail, the runtime command body, the MEL procedure and its file, and
    the matching optionVars. An item that opens a dialog (Export Cache) stores the dialog
    call: read recipe_source(name) and save a template with @tokens@ from the command the
    procedure runs, then test it before marking it verified."""
    cmds = _cmds()
    lab, tr = RECIPE_MENUS.get(name, (None, None))
    lab, tr = pattern or lab, trail if trail is not None else tr
    if not lab:
        raise KeyError("no menu pattern for %r: pass pattern=" % name)
    hits = pick_menu_item(menu_items(lab, roots=roots), lab, tr)
    if not hits:
        raise KeyError("no menu item matches %r (trail %r); open the editor that owns it, or list menu_items()" % (lab, tr))
    rec = dict(hits[0])
    code = recipe_code(rec, option_box)
    if not code:
        raise RuntimeError("menu item %s has no string command: %r" % (rec["menu"], rec.get("command")))
    info = _resolve_command(code)
    extra = {"menu": rec["menu"], "ui_path": rec["path"], "source_type": rec.get("source_type"),
             "option_box": bool(option_box), "option_vars": option_vars(), "alternatives": [h["menu"] for h in hits[1:6]]}
    extra.update({k: v for k, v in info.items() if k != "first_token"})
    save_recipe(name, code, note="menu query: " + rec["menu"], path=path, maya_version=cmds.about(version=True),
                verified=verified, extra=extra)
    return dict(extra, mel=code)


def ui_buttons(pattern=None):
    """GUI: every button control on screen with its label and command string
    (cmds.button(b, q=True, command=True)). Show the node in the Attribute Editor first
    (button_recipe does) [verify]."""
    cmds = _cmds()
    rx = re.compile(pattern, re.I) if pattern else None
    out = []
    for b in cmds.lsUI(type="button", long=True) or []:
        lab = _q(cmds.button, b, label=True) or ""
        if rx and not rx.search(lab):
            continue
        out.append({"path": b, "label": lab, "command": _q(cmds.button, b, command=True), "source_type": "mel"})
    return out


def button_recipe(name, node, pattern=None, path=None, verified=False):
    """Save a recipe from an Attribute Editor button (Make Wires Dynamic, Reference State >
    Update, Create, Rebuild): show `node` in the Attribute Editor, query the button's command
    string and replace the node's name with @node@ so it replays on any node."""
    cmds, mel = _cmds(), _mel()
    if cmds.about(batch=True):
        raise RuntimeError("buttons exist only in the GUI session: run through mx_bridge")
    lab = pattern or RECIPE_BUTTONS[name]
    cmds.select(node, replace=True)
    try:
        mel.eval('showEditor "%s"' % node)                   # Attribute Editor on the node [verify]
    except Exception:
        pass
    try:
        cmds.refresh(force=True)
    except Exception:
        pass
    hits = [b for b in ui_buttons(lab) if isinstance(b["command"], str) and b["command"].strip()]
    if not hits:
        raise KeyError("no button labelled %r on screen for %s" % (lab, node))
    code = tokenize_node(hits[0]["command"], _long(node))
    info = _resolve_command(code)
    extra = {"button": hits[0]["label"], "ui_path": hits[0]["path"], "alternatives": [h["path"] for h in hits[1:6]]}
    extra.update({k: v for k, v in info.items() if k != "first_token"})
    save_recipe(name, code, note="button query: %s on %s" % (hits[0]["label"], cmds.nodeType(node)), path=path,
                maya_version=cmds.about(version=True), verified=verified, extra=extra)
    return dict(extra, mel=code)


def recipe_source(name, path=None):
    """The MEL procedure behind a recorded recipe, read from the file whatIs names, so a
    dialog action can be rewritten as a direct command with @tokens@ (never guess flags)."""
    rec = load_recipes(path).get(name) or {}
    proc, f = rec.get("proc"), rec.get("proc_file")
    if not (proc and f and os.path.isfile(f)):
        return {"proc": proc, "file": f, "body": None}
    with open(f, errors="replace") as fh:
        return {"proc": proc, "file": f, "body": mel_proc_body(fh.read(), proc)}


def capture_start(log_path):
    """LAST FALLBACK when neither menu_recipe nor button_recipe finds a string command:
    write the Script Editor history to a file with Echo All Commands on while a person
    clicks once, so the MEL behind the click can be saved as a recipe [verify both flags]."""
    cmds, mel = _cmds(), _mel()
    if cmds.about(batch=True):
        raise RuntimeError("capture needs the GUI session (mx_bridge) and one click by the user")
    open(log_path, "a").close()
    cmds.scriptEditorInfo(historyFilename=log_path, writeHistory=True)
    mel.eval("commandEcho -state on")
    return {"log": log_path, "offset": os.path.getsize(log_path)}


def capture_stop(state):
    cmds, mel = _cmds(), _mel()
    try:
        mel.eval("commandEcho -state off")
    finally:
        cmds.scriptEditorInfo(writeHistory=False)
    with open(state["log"]) as f:
        f.seek(state["offset"])
        return [ln.rstrip("\n") for ln in f if ln.strip()]


def run_recipe(name, path=None, select=None, **tokens):
    """Replay a captured MEL recipe with @token@ values filled. select: nodes to select first
    (menu actions act on the selection). The selection is restored afterwards."""
    cmds, mel = _cmds(), _mel()
    rec = load_recipes(path).get(name)
    if not rec:
        raise KeyError("recipe %r not recorded: %s" % (name, RECIPE_HELP.get(name, "")))
    code = fill_tokens(rec["mel"], tokens)
    old = cmds.ls(selection=True, long=True) or []
    try:
        if select is not None:
            cmds.select(select, replace=True)
        return mel.eval(code)
    finally:
        keep = [s for s in old if cmds.objExists(s)]
        cmds.select(keep, replace=True) if keep else cmds.select(clear=True)


def export_cache(node, path, start=None, end=None, recipe="export_cache"):
    """Interactive Groom cache through the captured recipe (tokens @node@ @path@ @start@
    @end@). The menu route must have Multiple Transforms and Write Final Width on (XGIG;
    Flood [00:03:11]); Epic's page says Multiple Transforms off (XGUE): export both once and
    compare the hierarchies before trusting either."""
    cmds = _cmds()
    t = cmds.currentTime(q=True)
    run_recipe(recipe, select=[node], node=_long(node), path=path,
               start=_num(start if start is not None else t), end=_num(end if end is not None else t))
    if not os.path.isfile(path):
        raise RuntimeError("the recipe ran but %s was not written" % path)
    return path


# ---------------------------------------------------------------- review renders
class _GroomSession(R._Session):
    """mx_review's session (restorable settings, namespace, output transform) rendering the
    REAL hair with its own shader under a groom light rig, instead of clay duplicates."""

    def __init__(self, hair, head, scalp, extra, out_dir, resolution, samples, denoise, log, groom_dir=None,
                 curve_width=0.05):
        R._Session.__init__(self, [], out_dir, resolution, samples, denoise, log)
        cmds = self.cmds
        self.hair = [_long(h) for h in hair]
        self.head = _long(head) if head else None
        self.scalp = _long(scalp) if scalp else None
        self.extra = [_long(e) for e in extra or ()]
        self.groom_dir = groom_dir
        self.curve_width = curve_width
        self.sg_over, self.link_over = [], []
        self.pass_rest = R._Restorer()
        self.hair_shapes = self._shapes(self.hair, ("nurbsCurve", DESCRIPTION_TYPE))
        self.scalp_shapes = self._shapes([self.scalp], ("mesh",)) if self.scalp else []
        self.head_shapes = [s for s in self._shapes([self.head], ("mesh",))] if self.head else []
        if self.scalp:
            self.head_shapes = [s for s in self.head_shapes if s not in self.scalp_shapes]
        self.extra_shapes = self._shapes(self.extra, ("mesh", "nurbsCurve", DESCRIPTION_TYPE))
        self.dups = [self._xform(n) for n in self.hair + [self.head, self.scalp] + self.extra if n]
        self.dups = list(dict.fromkeys(cmds.ls(self.dups, long=True) or []))

    def _xform(self, n):
        cmds = self.cmds
        if cmds.nodeType(n) == "transform":
            return n
        return (cmds.listRelatives(n, parent=True, fullPath=True) or [n])[0]

    def _shapes(self, nodes, types):
        cmds = self.cmds
        out = []
        for n in nodes:
            if not n:
                continue
            if cmds.nodeType(n) in types:
                out.append(n)
            out += cmds.listRelatives(n, allDescendents=True, fullPath=True, type=list(types)) or []
        return [s for s in dict.fromkeys(out) if not (cmds.attributeQuery("intermediateObject", node=s, exists=True)
                                                   and cmds.getAttr(s + ".intermediateObject"))]

    def _build(self):
        cmds = self.cmds
        NS = R.NS
        self.flat = {}
        for nm, col in (("black", (0.0, 0.0, 0.0)), ("white", (1.0, 1.0, 1.0))):
            u = cmds.shadingNode("aiUtility", asShader=True, name=NS + ":flat_" + nm)
            R._set_enum(cmds, u + ".shadeMode", "flat")
            cmds.setAttr(u + ".color", *col, type="double3")
            self.flat[nm] = (u, self._sg(u, "flat_" + nm))
        dome = cmds.shadingNode("aiSkyDomeLight", asLight=True, name=NS + ":dome")
        self.dome_shape, self.dome = R._light_shape_and_xform(cmds, dome)
        cmds.setAttr(self.dome_shape + ".color", 0.35, 0.35, 0.35, type="double3")
        key = cmds.shadingNode("directionalLight", asLight=True, name=NS + ":key")
        self.key_shape, self.key = R._light_shape_and_xform(cmds, key)
        cmds.setAttr(self.key_shape + ".intensity", 2.5)
        rim = cmds.shadingNode("directionalLight", asLight=True, name=NS + ":rim")
        self.rim_shape, self.rim = R._light_shape_and_xform(cmds, rim)
        cmds.setAttr(self.rim_shape + ".intensity", 4.0)
        for s in (self.key_shape, self.rim_shape):
            if cmds.attributeQuery("aiAngle", node=s, exists=True):
                cmds.setAttr(s + ".aiAngle", 3.0)
        cam = cmds.camera(name=NS + ":cam")
        self.cam, self.cam_shape = cmds.ls(cam[0], long=True)[0], cmds.ls(cam[1], long=True)[0]
        cmds.setAttr(self.cam_shape + ".horizontalFilmAperture", R.APERTURE_IN)
        cmds.setAttr(self.cam_shape + ".verticalFilmAperture", R.APERTURE_IN)
        cmds.setAttr(self.cam_shape + ".focalLength", R.FOCAL_MM)
        self.imager = None
        if self.denoise:
            t = R._pick_type(cmds, "aiImagerDenoiserOidn")
            if t and not cmds.ls(type=t):
                self.imager = cmds.createNode(t, name=NS + ":oidn")

    def _configure(self):
        R._Session._configure(self)          # render settings, only our targets and lights render
        cmds = self.cmds
        for s in self.hair_shapes:           # guide curves render only with aiRenderCurve on [verify]
            if cmds.nodeType(s) == "nurbsCurve" and cmds.attributeQuery("aiRenderCurve", node=s, exists=True):
                if not cmds.getAttr(s + ".aiRenderCurve"):
                    self.rest.set(s + ".aiRenderCurve", 1)
                    if cmds.attributeQuery("aiCurveWidth", node=s, exists=True):
                        self.rest.set(s + ".aiCurveWidth", self.curve_width)

    def _override(self, shapes, color):
        cmds = self.cmds
        util, sg = self.flat[color]
        for s in shapes:
            if cmds.nodeType(s) == "nurbsCurve":
                if cmds.attributeQuery("aiCurveShader", node=s, exists=True):
                    self.pass_rest.disconnect_inputs(s + ".aiCurveShader")
                    cmds.connectAttr(util + ".outColor", s + ".aiCurveShader", force=True)
                    self.link_over.append((util + ".outColor", s + ".aiCurveShader"))
                continue
            orig = _sg_of(s)
            if len(orig) > 1:
                self.notes.append("per-face shading on %s: flat override skipped" % s)
                continue
            with self.in_ns():
                cmds.sets(s, edit=True, forceElement=sg)
            self.sg_over.append((s, orig[0] if orig else None, sg))

    def _restore_shading(self):
        cmds = self.cmds
        for src, dst in reversed(self.link_over):
            try:
                if cmds.isConnected(src, dst):
                    cmds.disconnectAttr(src, dst)
            except Exception:
                pass
        self.link_over = []
        for s, orig, sg in reversed(self.sg_over):
            try:
                if orig:
                    cmds.sets(s, edit=True, forceElement=orig)
                else:
                    cmds.sets(s, edit=True, remove=sg)
            except Exception as exc:
                self.notes.append("shading restore %s: %s" % (s, exc))
        self.sg_over = []
        self.pass_rest.restore()

    def _show(self, shapes, on):
        """Hide shapes only (a scalp parented under the head stays visible); showing also
        unhides the transform."""
        cmds = self.cmds
        for s in shapes:
            for n in ((s, self._xform(s)) if on else (s,)):
                if bool(cmds.getAttr(n + ".visibility")) != bool(on):
                    self.pass_rest.set(n + ".visibility", 1 if on else 0)

    def assign(self, pas):
        cmds = self.cmds
        self._restore_shading()
        lights = {"beauty": (1, 1, 0), "backlit": (0, 0, 1)}.get(pas, (0, 0, 0))
        for s, on in zip((self.dome_shape, self.key_shape, self.rim_shape), lights):
            cmds.setAttr(s + ".visibility", on)
        if pas in ("mask", "coverage"):
            self._show(self.head_shapes, False)
            self._show(self.extra_shapes, False)
            self._show(self.scalp_shapes, True)
            self._override(self.scalp_shapes, "white")
            if pas == "mask":
                self._show(self.hair_shapes, False)
            else:
                self._override(self.hair_shapes, "black")

    def aim(self, center, direction, fr):
        R._Session.aim(self, center, direction, fr)
        cmds = self.cmds
        right, up, fwd = R.basis(direction, self.up)
        if self.groom_dir:                    # key travelling along the groom (Schneider [00:34:32])
            g = _unit(_v(self.groom_dir))
            key_dir = _unit(_add(_add(_mul(g, -0.8), _mul(_unit(_v(direction)), 0.5)), _mul(up, 0.2)))
            R._place(cmds, self.key, center, key_dir, self.up)
        rim_dir = _unit(_add(_mul(_unit(_v(direction)), -1.0), _mul(up, 0.35)))
        R._place(cmds, self.rim, center, rim_dir, self.up)

    def __exit__(self, *exc):
        try:
            self._restore_shading()
        except Exception as e:
            self.notes.append("shading restore failed: %s" % e)
        return R._Session.__exit__(self, *exc)


def _count_bright(path, thresh=128):
    w, h, d = R.read_rgba(path)
    n = sum(1 for i in range(0, len(d), 4) if d[i] > thresh and d[i + 3] > 0)
    return n, w * h


def _mean_abs_diff(p1, p2):
    w1, h1, a = R.read_rgba(p1)
    w2, h2, b = R.read_rgba(p2)
    if (w1, h1) != (w2, h2):
        return None
    tot = cnt = 0
    for i in range(0, len(a), 4):
        if a[i + 3] or b[i + 3]:
            tot += abs(a[i] - b[i]) + abs(a[i + 1] - b[i + 1]) + abs(a[i + 2] - b[i + 2])
            cnt += 3
    return tot / float(cnt) if cnt else 0.0


def _groom_dir_from(hair):
    cmds = _cmds()
    try:
        curves = [c for h in hair for c in ([h] if cmds.nodeType(h) == "nurbsCurve" else
                                            cmds.listRelatives(h, allDescendents=True, type="nurbsCurve", fullPath=True) or [])]
        if not curves:
            return None
        acc = (0.0, 0.0, 0.0)
        for _s, p in read_curves(curves[:500]):
            acc = _add(acc, _unit(_sub(p[-1], p[0])))
        return _unit(acc)
    except Exception:
        return None


def review(hair, out_dir, head=None, scalp=None, extra=(), views=("front", "side", "back", "threequarter", "top"),
           passes=("beauty", "backlit", "silhouette", "coverage"), coverage_views=("top", "back", "threequarter"),
           closeups=(), resolution=768, tile=384, samples=None, denoise=False, groom_dir=None, margin=1.08,
           title=None, curve_width=0.05):
    """Review renders of the real groom with its hair shader (Arnold, headless or GUI).
    passes: beauty (sky dome + key along the groom), backlit (rim only: silhouette,
    flyaways, halo, Fernandez 08), silhouette (black on white from the beauty alpha),
    coverage (scalp flat white, hair flat black, other geometry hidden: showthrough_pct =
    visible scalp pixels / scalp pixels, the scripted form of Giovannini's fill-layer check
    [00:12:29]). closeups: [(label, center, radius, view)] framed spheres (hairline, brows,
    lashes, tips). Denoise off by default so noise is judged, not hidden [added]. Returns
    {sheet, tiles, metrics, renders, notes}."""
    cmds = _cmds()
    t0 = time.time()
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    hair = hair if isinstance(hair, (list, tuple)) else [hair]
    up = cmds.upAxis(q=True, axis=True)
    targets = [h for h in list(hair) + [head, scalp] + list(extra) if h]
    try:
        bb = cmds.exactWorldBoundingBox(targets)
    except Exception:                       # a description shape without a bounding box [verify]
        bb = cmds.exactWorldBoundingBox([t for t in (head, scalp) if t] or targets)
    pts = [(x, y, z) for x in (bb[0], bb[3]) for y in (bb[1], bb[4]) for z in (bb[2], bb[5])]
    center = ((bb[0] + bb[3]) / 2.0, (bb[1] + bb[4]) / 2.0, (bb[2] + bb[5]) / 2.0)
    s = {"AASamples": 4, "GISpecularSamples": 2, "GITransmissionSamples": 2}
    s.update(samples or {})
    log, raw, metrics = [], {}, {"coverage": {}}
    need_beauty = "beauty" in passes or "silhouette" in passes
    gd = groom_dir or _groom_dir_from(hair)
    with _GroomSession(hair, head, scalp, extra, out_dir, resolution, s, denoise, log, gd, curve_width) as S:
        order = (["beauty"] if need_beauty else []) + [p for p in passes if p == "backlit"]
        for pas in order:
            S.assign(pas)
            for view in views:
                d = R.map_dir(R.VIEW_DIRS[view], up)
                S.aim(center, d, R.frame(pts, center, d, view in R.PERSPECTIVE, margin, up))
                raw[(pas, view)] = S.render("%s_%s" % (pas, view))
        for label, c, rad, view in closeups:
            S.assign("beauty")
            d = R.map_dir(R.VIEW_DIRS[view], up)
            sp = [_add(c, _mul(a, rad)) for a in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
            S.aim(tuple(c), d, R.frame(sp, tuple(c), d, True, 1.0, up))
            raw[("closeup", label)] = S.render("closeup_%s" % label)
        if "coverage" in passes and (scalp or head):
            for view in [v for v in coverage_views if v in views] or list(coverage_views)[:1]:
                d = R.map_dir(R.VIEW_DIRS[view], up)
                fr = R.frame(pts, center, d, view in R.PERSPECTIVE, margin, up)
                S.assign("mask")
                S.aim(center, d, fr)
                m = S.render("mask_%s" % view)
                S.assign("coverage")
                S.aim(center, d, fr)
                c = S.render("coverage_%s" % view)
                n_mask, _tot = _count_bright(m)
                n_vis, _tot = _count_bright(c)
                raw[("coverage", view)] = c
                metrics["coverage"][view] = {"scalp_px": n_mask, "visible_px": n_vis,
                                             "showthrough_pct": round(100.0 * n_vis / n_mask, 2) if n_mask else None}
        elif "coverage" in passes:
            S.notes.append("coverage skipped: give scalp= (the growth mesh)")
        notes, gamma = S.notes, S.gamma
    cells, tiles = [], {}
    rows = [p for p in passes if p in ("beauty", "backlit", "silhouette", "coverage")]
    for pas in rows:
        for view in views:
            src = raw.get(("beauty" if pas == "silhouette" else pas, view))
            if not src:
                cells.append(("%s / %s (none)" % (pas, view), None))
                continue
            rgb, _ = R._tile_rgb(src, "silhouette" if pas == "silhouette" else pas, tile, gamma)
            tiles.setdefault(pas, {})[view] = src
            lab = "%s / %s" % (pas, view)
            if pas == "coverage" and view in metrics["coverage"]:
                lab += " %.1f%%" % (metrics["coverage"][view]["showthrough_pct"] or 0)
            cells.append((lab, rgb))
    for label, _c, _r, _v in closeups:
        src = raw.get(("closeup", label))
        cells.append(("closeup / %s" % label, R._tile_rgb(src, "beauty", tile, gamma)[0] if src else None))
        if src:
            tiles.setdefault("closeup", {})[label] = src
    while len(cells) % len(views):
        cells.append(("", None))
    sheet, size = R.contact_sheet(cells, len(views), tile, tile, os.path.join(out_dir, "groom_review.png"), title=title)
    rec = {"sheet": sheet, "sheet_size": size, "tiles": tiles, "metrics": metrics, "renders": log, "notes": notes,
           "groom_dir": gd, "seconds": round(time.time() - t0, 2)}
    with open(os.path.join(out_dir, "groom_review.json"), "w") as f:
        json.dump(rec, f, indent=1, default=str)
    return rec


def cost_sweep(hair, out_dir, variants, view="threequarter", head=None, focus=None, frames=(1, 2, 3),
               resolution=512, tile=256, samples=None):
    """Render cost and flicker per settings variant: [{"label", "plugs": {plug: value}}].
    The four knobs are Min Pixel Width, Transparency Depth, Specular samples and AA (HAIR §
    Optimization); names differ per MtoA, so the caller passes plugs. flicker = mean
    absolute RGB difference (0..255) between consecutive frames of a static groom [added
    proxy: Arnold's sampling pattern changes per frame [verify]]. Pick the cheapest variant
    whose frames pass the flicker and noise review."""
    cmds = _cmds()
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    hair = hair if isinstance(hair, (list, tuple)) else [hair]
    up = cmds.upAxis(q=True, axis=True)
    targets = [h for h in list(hair) + [head] if h]
    bb = cmds.exactWorldBoundingBox(targets)
    pts = [(x, y, z) for x in (bb[0], bb[3]) for y in (bb[1], bb[4]) for z in (bb[2], bb[5])]
    center = ((bb[0] + bb[3]) / 2.0, (bb[1] + bb[4]) / 2.0, (bb[2] + bb[5]) / 2.0)
    if focus:
        center = tuple(focus[0])
        pts = [_add(center, _mul(a, focus[1])) for a in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
    t_old = cmds.currentTime(q=True)
    log, table, cells = [], [], []
    s = {"AASamples": 3}
    s.update(samples or {})
    try:
        with _GroomSession(hair, head, None, (), out_dir, resolution, s, False, log, _groom_dir_from(hair)) as S:
            d = R.map_dir(R.VIEW_DIRS[view], up)
            fr = R.frame(pts, center, d, view in R.PERSPECTIVE, 1.05, up)
            for var in variants:
                vr = R._Restorer()
                for plug, val in var.get("plugs", {}).items():
                    if isinstance(val, str) and cmds.getAttr(plug, type=True) == "enum":
                        vr.set(plug, cmds.getAttr(plug))
                        R._set_enum(cmds, plug, val)
                    else:
                        vr.set(plug, val)
                S.assign("beauty")
                S.aim(center, d, fr)
                paths, secs = [], []
                for f in frames:
                    cmds.currentTime(f)
                    t1 = time.time()
                    paths.append(S.render("sweep_%s_f%d" % (var["label"], f)))
                    secs.append(time.time() - t1)
                vr.restore()
                fl = [_mean_abs_diff(a, b) for a, b in zip(paths, paths[1:])]
                table.append({"label": var["label"], "plugs": var.get("plugs"), "seconds_mean": _mean(secs),
                              "flicker_mean": _mean([x for x in fl if x is not None]), "missing": vr.missing,
                              "errors": vr.errors, "frames": paths})
                for i, p in enumerate(paths):
                    cells.append(("%s f%d" % (var["label"], frames[i]), R._tile_rgb(p, "beauty", tile, S.gamma)[0]))
    finally:
        cmds.currentTime(t_old)
    sheet, _size = R.contact_sheet(cells, len(frames), tile, tile, os.path.join(out_dir, "cost_sweep.png"))
    rec = {"table": table, "sheet": sheet, "renders": log}
    with open(os.path.join(out_dir, "cost_sweep.json"), "w") as f:
        json.dump(rec, f, indent=1, default=str)
    return rec


# =========================================================================== CLI (via mx_run)
def main(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="mx_groom")
    ap.add_argument("mode", choices=("probe", "lint", "measure", "inspect", "recipes"))
    ap.add_argument("--json", help="also write the result here")
    ap.add_argument("--descs", default="", help="comma list of descriptions (lint)")
    ap.add_argument("--budget", type=int, default=None)
    ap.add_argument("--style", default="realistic", choices=("realistic", "stylized"))
    ap.add_argument("--root", help="curves root (measure)")
    ap.add_argument("--abc", help="Alembic file (measure, inspect)")
    ap.add_argument("--surface", help="mesh for penetration (measure)")
    a = ap.parse_args(argv)
    if a.mode == "probe":
        res = probe()
    elif a.mode == "lint":
        load_plugins()
        res = lint([d for d in a.descs.split(",") if d] or None, budget=a.budget, style=a.style)
    elif a.mode == "measure":
        res = measure_abc(a.abc, surface=a.surface) if a.abc else measure_curves(a.root, surface=a.surface)
    elif a.mode == "inspect":
        res = inspect_abc(a.abc)
        res["verdict"] = unreal_verdict(res)
    else:
        res = recipe_status()
    if a.json:
        with open(a.json, "w") as f:
            json.dump(res, f, indent=1, default=str)
    return res


if __name__ == "__main__":
    print(json.dumps(main(sys.argv[1:]), indent=1, default=str))
