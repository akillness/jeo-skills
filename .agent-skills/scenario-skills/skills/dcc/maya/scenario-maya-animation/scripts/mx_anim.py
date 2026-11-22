"""
mx_anim: keying, curve surgery and motion measurement for an animator agent that cannot
scrub (Maya 2027). Part of the scenario-maya-animation skill; builds on the scenario-maya-expert toolkit
(mx_run for headless jobs, mx_review for PNG writing and GUI playblasts, mx_bridge).

Why: animators judge by scrubbing, ghosts, motion trails and the Graph Editor. An agent
measures instead (per-frame world and screen positions, spacing, velocity, holds, spikes,
contacts, a ballistic fit, overlap lags) and looks at images it can open: a stacked curve
plot (Wade Neistadt's stacked view) and a tracks / onion-skin sheet drawn from projected
joints (the programmatic drawover Arslan Elver does by hand), or a GUI playblast.

  import sys; sys.path[:0] = ["<skills>/scenario-maya-animation/scripts", "<skills>/scenario-maya-expert/scripts"]
  import mx_anim as A
  prev = A.set_key_defaults("blocking")                  # new keys: stepped out tangents
  A.key_pose({"COG_ctrl": {"translateY": 72.0}}, 24, fill=ctrls)   # stepped pose column
  A.key_hold(ctrls, 24, 27)                              # closing key of a hold ("pillar")
  A.share_keys(ctrls)                                    # every control keyed on every key time
  snap = A.snapshot(ctrls); A.to_spline(body_ctrls); ...; A.restore(snap)   # buffer curve
  b = A.snapshot(ctrls, samples=fr); A.insert_key(c, a, 38); A.curve_diff(b, A.snapshot(ctrls, samples=fr))
  pts = A.sample_world(["hips_jnt", "L_toe_jnt"], range(1, 73))
  print(A.format_report(A.motion_report(pts["hips_jnt"], range(1, 73))))
  A.ballistic_fit([p[1] for p in pts["hips_jnt"][32:45]], range(33, 46))
  gates = A.run_gates(plan); print(A.format_gates(gates))   # the shot's code gates
  A.review_images(plan, "/abs/out/v003")                  # curves.png + tracks.png (headless)

Headless, through mx_run (plan schema in run_gates):
  python3 <scenario-maya-expert>/scripts/mx_run.py --scene shot_v003.ma mx_anim.py -- \
          --plan /abs/plan.json --out /abs/out/review_v003

Units: positions in the scene's linear unit (keep cm; gravity helpers take unit=).
Frames are scene frames. Rotations in degrees (cmds convention). Thresholds marked
[added] are this toolkit's defaults, not expert numbers; override them per show.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EXPERT_SCRIPTS = os.path.normpath(os.path.join(HERE, "..", "..", "scenario-maya-expert", "scripts"))

G_CM_S2 = 981.0
UNIT_TO_CM = {"mm": 0.1, "cm": 1.0, "m": 100.0, "km": 1e5, "in": 2.54, "ft": 30.48, "yd": 91.44}
FPS_UNITS = {"game": 15.0, "film": 24.0, "pal": 25.0, "ntsc": 30.0, "show": 48.0,
             "palf": 50.0, "ntscf": 60.0}
TAG_ATTR = "mxAnimTag"
PLAN_NODE = "mxAnim_plan"
SKIP_ATTRS = ("visibility",)          # [added] never keyed by the pose helpers unless named

# =========================================================================== small math
def _as_points(seq):
    out = []
    for p in seq:
        if isinstance(p, (int, float)):
            out.append((float(p),))
        else:
            out.append(tuple(float(x) for x in p))
    return out


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _norm(a):
    return math.sqrt(sum(x * x for x in a))


def _dist(a, b):
    return _norm(_sub(a, b))


def _mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0


def _median(xs):
    s = sorted(xs)
    n = len(s)
    if not n:
        return 0.0
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def _runs(mask):
    """Inclusive (i0, i1) index runs where mask is True."""
    out, start = [], None
    for i, m in enumerate(mask):
        if m and start is None:
            start = i
        elif not m and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(mask) - 1))
    return out


def _pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return 0.0
    mx, my = _mean(xs), _mean(ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx <= 0 or syy <= 0:
        return 0.0
    return sxy / math.sqrt(sxx * syy)


def _solve3(m, v):
    """Solve a 3x3 linear system with partial pivoting."""
    a = [list(m[i]) + [v[i]] for i in range(3)]
    for c in range(3):
        p = max(range(c, 3), key=lambda r: abs(a[r][c]))
        if abs(a[p][c]) < 1e-12:
            raise ValueError("singular system (need at least 3 distinct frames)")
        a[c], a[p] = a[p], a[c]
        for r in range(3):
            if r != c:
                k = a[r][c] / a[c][c]
                for j in range(c, 4):
                    a[r][j] -= k * a[c][j]
    return [a[i][3] / a[i][i] for i in range(3)]


def polyfit2(ts, ys):
    """Least-squares y = a t^2 + b t + c. Returns (a, b, c)."""
    ts, ys = [float(t) for t in ts], [float(y) for y in ys]
    n = len(ts)
    if n < 3 or n != len(ys):
        raise ValueError("need at least 3 samples of equal length")
    tm = sum(ts) / n
    x = [t - tm for t in ts]
    s = [sum(xi ** k for xi in x) for k in range(5)]
    sy = [sum(y * xi ** k for xi, y in zip(x, ys)) for k in range(3)]
    c, b, a = _solve3([[s[0], s[1], s[2]], [s[1], s[2], s[3]], [s[2], s[3], s[4]]], sy)
    return a, b - 2 * a * tm, a * tm * tm - b * tm + c


def _mat_inverse(m):
    """Inverse of a 4x4 matrix given as 16 floats (row-major, Maya order)."""
    a = [[float(m[r * 4 + c]) for c in range(4)] + [1.0 if r == c else 0.0 for c in range(4)]
         for r in range(4)]
    for c in range(4):
        p = max(range(c, 4), key=lambda r: abs(a[r][c]))
        if abs(a[p][c]) < 1e-12:
            raise ValueError("singular matrix")
        a[c], a[p] = a[p], a[c]
        piv = a[c][c]
        a[c] = [x / piv for x in a[c]]
        for r in range(4):
            if r != c and a[r][c] != 0.0:
                k = a[r][c]
                a[r] = [x - k * y for x, y in zip(a[r], a[c])]
    return [a[r][4 + c] for r in range(4) for c in range(4)]


def gravity_per_frame(fps=24.0, unit="cm", g_cm_s2=G_CM_S2):
    """Gravity in scene units per frame squared: 981 / 576 = 1.703 cm/frame^2 at 24 fps."""
    return g_cm_s2 / UNIT_TO_CM[unit] / float(fps) ** 2


# =========================================================================== physics planning
def air_frames(rise, drop, fps=24.0, unit="cm"):
    """Frames up and down for a gravity-true jump: rise = apex above takeoff COG,
    drop = apex above landing COG. air_frames(60, 10) -> about (8.4, 3.4, 11.8) at 24 fps."""
    g = gravity_per_frame(fps, unit)
    up, down = math.sqrt(2.0 * max(rise, 0.0) / g), math.sqrt(2.0 * max(drop, 0.0) / g)
    return up, down, up + down


def solve_jump(y_takeoff, y_land, frames_in_air, fps=24.0, unit="cm"):
    """Exact parabola from the takeoff and landing COG heights and the air time (frames).
    Returns v0 (units/frame), t_apex (frames after takeoff), y_apex and values[0..T]."""
    g = gravity_per_frame(fps, unit)
    T = float(frames_in_air)
    if T <= 0:
        raise ValueError("frames_in_air must be > 0")
    v0 = (y_land - y_takeoff + 0.5 * g * T * T) / T
    t_apex = v0 / g
    y_apex = y_takeoff + v0 * v0 / (2.0 * g)
    vals = [y_takeoff + v0 * t - 0.5 * g * t * t for t in range(int(round(T)) + 1)]
    return {"v0": v0, "t_apex": t_apex, "y_apex": y_apex, "values": vals, "g": g}


def parabola_values(t0, t1, y0, y1, fps=24.0, unit="cm"):
    """{frame: value} for every whole frame from takeoff t0 to landing t1 (gravity-true)."""
    s = solve_jump(y0, y1, t1 - t0, fps, unit)
    return {int(t0) + i: v for i, v in enumerate(s["values"])}


# =========================================================================== motion analysis
def motion_report(points, frames, fps=24.0, hold_eps=None, spike_k=4.0, spike_floor=None,
                  turn_deg=30.0, even_tol=0.1, contacts=(), min_hold=3):
    """Spacing, speed, holds, acceleration spikes, sharp turns and constant-spacing runs of
    one track (3D, 2D pixels or scalars). Spacing i is between frames[i] and frames[i+1].
    hold_eps default: 5% of the largest spacing [added]. Spikes (pops) are LOCAL outliers:
    the second difference minus the median of its 4 neighbours, above spike_k x the median
    residual and above spike_floor (default 15% of the largest spacing) [added]; a steady
    push or fall is not a spike. Spikes within 1 frame of a contact are listed apart."""
    P, F = _as_points(points), [float(f) for f in frames]
    if len(P) != len(F) or len(P) < 3:
        raise ValueError("points and frames must have the same length (>= 3)")
    steps = [_sub(P[i + 1], P[i]) for i in range(len(P) - 1)]
    spacing = [_norm(s) for s in steps]
    smax = max(spacing)
    eps = hold_eps if hold_eps is not None else max(1e-9, 0.05 * smax)
    still = [s < eps for s in spacing]
    holds = [(F[a], F[b + 1], b - a + 2) for a, b in _runs(still) if b - a + 2 >= min_hold]
    moves = [(F[a], F[b + 1]) for a, b in _runs([not s for s in still])]
    accv = [_sub(steps[i + 1], steps[i]) for i in range(len(steps) - 1)]   # at F[i+1]
    dim = len(P[0])
    resid = []
    for i in range(len(accv)):
        nb = [accv[j] for j in range(max(0, i - 2), min(len(accv), i + 3)) if j != i]
        medv = tuple(_median([v[d] for v in nb]) for d in range(dim)) if nb else accv[i]
        resid.append(_norm(_sub(accv[i], medv)))
    med = _median(resid)
    floor = spike_floor if spike_floor is not None else 0.15 * smax
    cset = [float(c) for c in contacts]

    def near(f):
        return any(abs(f - c) <= 1.0 for c in cset)

    spikes, contact_spikes = [], []
    for i, a in enumerate(resid):
        if a > spike_k * med and a > floor:
            (contact_spikes if near(F[i + 1]) else spikes).append((F[i + 1], round(a, 4)))
    turns = []
    for i in range(len(steps) - 1):
        if spacing[i] >= eps and spacing[i + 1] >= eps:
            c = sum(x * y for x, y in zip(steps[i], steps[i + 1])) / (spacing[i] * spacing[i + 1])
            ang = math.degrees(math.acos(max(-1.0, min(1.0, c))))
            if ang > turn_deg and not near(F[i + 1]):
                turns.append((F[i + 1], round(ang, 1)))
    ratio_ok = [spacing[i] >= eps and spacing[i + 1] >= eps and
                abs(spacing[i + 1] / spacing[i] - 1.0) <= even_tol for i in range(len(spacing) - 1)]
    even = [(F[a], F[b + 2], b - a + 3) for a, b in _runs(ratio_ok) if b - a + 1 >= 3]
    return {
        "frames": (F[0], F[-1]), "samples": len(P), "path_length": round(sum(spacing), 4),
        "spacing": [round(s, 4) for s in spacing],
        "max_spacing": round(smax, 4), "max_speed_per_s": round(smax * fps, 4),
        "hold_eps": eps, "holds": holds, "moves": moves,
        "spikes": spikes, "contact_spikes": contact_spikes, "sharp_turns": turns,
        "constant_spacing": even, "pop_residual_median": round(med, 5),
    }


def format_report(rep, width=60):
    """Short text summary of motion_report for the agent's notes."""
    lines = ["frames %s-%s  path %.2f  max spacing %.3f/frame" % (
        rep["frames"][0], rep["frames"][1], rep["path_length"], rep["max_spacing"])]
    lines.append("holds %s" % (rep["holds"] or "none"))
    lines.append("moves %s" % (rep["moves"] or "none"))
    for key in ("spikes", "contact_spikes", "sharp_turns", "constant_spacing"):
        if rep.get(key):
            lines.append("%s %s" % (key.replace("_", " "), rep[key][:12]))
    s = rep["spacing"]
    if s:
        top = max(s) or 1.0
        bars = "".join(" .:-=+*#%@"[min(9, int(9 * v / top))] for v in s[:width])
        lines.append("spacing |%s|" % bars)
    return "\n".join(lines)


def ballistic_fit(heights, frames, fps=24.0, unit="cm", hang_band=0.05):
    """Fit y = a t^2 + b t + c to airborne COG heights. g_ratio = implied / real gravity
    (1.0 = physical; below about 0.8 floats). hang_frames counts frames within hang_band of
    the rise under the apex; hang_expected is what real gravity gives; excess = stylized
    hang (Wade's weighted apex) [added method]."""
    a, b, c = polyfit2(frames, heights)
    real = gravity_per_frame(fps, unit)
    implied = -2.0 * a
    F = [float(f) for f in frames]
    res = [h - (a * f * f + b * f + c) for f, h in zip(F, heights)]
    rms = math.sqrt(sum(r * r for r in res) / len(res))
    apex_f = -b / (2.0 * a) if a else None
    apex_h = (c - b * b / (4.0 * a)) if a else max(heights)
    rise = max(heights) - min(heights)
    band = hang_band * rise
    hang = sum(1 for h in heights if h >= max(heights) - band)
    expected = None
    if implied > 0 and apex_f is not None:
        w = math.sqrt(2.0 * band / real)
        expected = max(1, int(math.floor(apex_f + w)) - int(math.ceil(apex_f - w)) + 1)
    return {"g_ratio": implied / real if real else None, "implied_g": implied, "real_g": real,
            "rms": rms, "max_residual": max(abs(r) for r in res), "apex_frame": apex_f,
            "apex_height": apex_h, "hang_frames": hang, "hang_expected": expected,
            "hang_excess": (hang - expected) if expected is not None else None,
            "coeffs": (a, b, c)}


def _ground_fn(ground):
    """ground: number, or [[start, end, height], ...] -> f(frame) -> support height."""
    if isinstance(ground, (int, float)):
        g = float(ground)
        return lambda f: g
    spans = sorted([(float(s), float(e), float(h)) for s, e, h in ground])

    def fn(f):
        for s, e, h in spans:
            if s <= f <= e:
                return h
        before = [sp for sp in spans if sp[1] < f]
        return (before[-1] if before else spans[0])[2]
    return fn


def contact_spans(heights, frames, ground=0.0, height_tol=0.5, speed_tol=0.5, min_len=2,
                  offset=0.0):
    """Frame spans where a point is planted: within height_tol of the support (plus its
    planted offset, e.g. an ankle joint's height) and vertical speed under speed_tol per
    frame. Defaults 0.5 cm and 0.5 cm/frame [added, cm rig at 24 fps]."""
    gf = _ground_fn(ground)
    F = [float(f) for f in frames]
    h = [float(v) for v in heights]
    planted = []
    for i in range(len(h)):
        # one-sided: the first and last planted frames are still frames on one side
        back = abs(h[i] - h[i - 1]) if i > 0 else None
        fwd = abs(h[i + 1] - h[i]) if i < len(h) - 1 else None
        vs = min(v for v in (back, fwd) if v is not None) if len(h) > 1 else 0.0
        planted.append(h[i] - gf(F[i]) - offset <= height_tol and vs <= speed_tol)
    spans = []
    for a, b in _runs(planted):
        start = a
        for i in range(a + 1, b + 1):                 # a new support or a jump splits the span
            if abs(h[i] - h[i - 1]) > speed_tol or gf(F[i]) != gf(F[i - 1]):
                spans.append((start, i - 1))
                start = i
        spans.append((start, b))
    return [(F[a], F[b]) for a, b in spans if b - a + 1 >= min_len]


def foot_slide(points, frames, spans, up=1, tol=0.2):
    """Horizontal travel of a planted point inside each contact span. tol: cm per frame
    (0.2 [added, digest]). Returns per span max step and drift, plus flagged frames."""
    idx = {float(f): i for i, f in enumerate(frames)}
    P = _as_points(points)
    out, flagged, worst = [], [], 0.0
    for s, e in spans:
        i0, i1 = idx[float(s)], idx[float(e)]
        steps = []
        for i in range(i0, i1):
            a, b = list(P[i]), list(P[i + 1])
            a[up], b[up] = 0.0, 0.0
            d = _dist(a, b)
            steps.append(d)
            if d > tol:
                flagged.append((float(frames[i + 1]), round(d, 4)))
        a, b = list(P[i0]), list(P[i1])
        a[up], b[up] = 0.0, 0.0
        m = max(steps) if steps else 0.0
        worst = max(worst, m)
        out.append({"span": (s, e), "max_step": round(m, 4), "drift": round(_dist(a, b), 4)})
    return {"spans": out, "max_step": round(worst, 4), "flagged": flagged, "tol": tol}


def penetration(heights, frames, ground=0.0, tol=0.5, offset=0.0):
    """Frames where the point sits below the support by more than tol: [(frame, depth)]."""
    gf = _ground_fn(ground)
    out = []
    for f, h in zip(frames, heights):
        d = gf(float(f)) + offset - float(h)
        if d > tol:
            out.append((float(f), round(d, 4)))
    return out


def landing_catch(heights, frames, contact, window=2, settle_frac=0.1, hold_frac=0.1):
    """How a landing absorbs the fall (Elver: a sudden caught stop plus residual jiggle, not
    a symmetric dip). removed_on_first / removed_in_window: share of the incoming vertical
    speed gone 1 and `window` frames after contact. catch_ratio = frames contact->lowest
    over frames lowest->recovered; below 1 is a catch, about 1 a sine dip [added].
    bottom_hold: frames around the lowest point moving under hold_frac of the incoming
    speed (Elver 00:13:54, 00:14:29: push the squash, give the impact a bigger hold);
    1 means the body bounces straight out of the compression [added measure]."""
    F = [float(f) for f in frames]
    h = [float(v) for v in heights]
    i = F.index(float(contact))
    if i < 1 or i + window >= len(h):
        raise ValueError("contact too close to the ends of the samples")
    v_in = h[i] - h[i - 1]
    j = min(range(i, len(h)), key=lambda k: h[k])
    comp = h[i] - h[j]
    thr = hold_frac * abs(v_in)
    lo = hi = j
    while lo - 1 >= i and abs(h[lo] - h[lo - 1]) < thr:
        lo -= 1
    while hi + 1 < len(h) and abs(h[hi + 1] - h[hi]) < thr:
        hi += 1

    def removed(k):
        v = h[k] - h[k - 1]
        return (1.0 - abs(v) / abs(v_in)) if v_in < 0 else None     # None: not falling into the contact

    end_h = h[-1]
    rec = None
    for k in range(j, len(h)):
        if h[k] >= end_h - settle_frac * max(comp, 1e-9):
            rec = k
            break
    extrema = 0
    for k in range(max(j, 1) + 1, len(h) - 1):
        if (h[k] - h[k - 1]) * (h[k + 1] - h[k]) < 0 and abs(h[k] - end_h) > 0.02 * max(comp, 1e-9):
            extrema += 1
    decel = F[j] - F[i]
    recov = (F[rec] - F[j]) if rec is not None else None
    return {"v_in": v_in, "lowest_frame": F[j], "compression": comp,
            "removed_on_first": removed(i + 1), "removed_in_window": removed(i + window),
            "decel_frames": decel, "recovery_frames": recov,
            "catch_ratio": (decel / recov) if recov else None, "overshoots": extrema,
            "bottom_hold": int(round(F[hi] - F[lo])) + 1, "bottom_span": (F[lo], F[hi])}


def foot_pitch(heel, toe, up=1):
    """Per-frame pitch (degrees) of the heel-to-toe line: positive when the heel is above the
    toe (rolled onto the ball), negative when the toes are up (heel strike). Subtract the
    rest-frame value. The rig's foot roll seen from the joints, when the rig attribute is
    unknown [added]."""
    out = []
    for h, t in zip(_as_points(heel), _as_points(toe)):
        d = _sub(t, h)
        hor = [x for k, x in enumerate(d) if k != up]
        out.append(math.degrees(math.atan2(-d[up], _norm(hor))))
    return out


def peel_angle(ball, toe, takeoff):
    """Elver's peel-off (jzuxAmadcm8 00:10:32, 00:11:04): on the first airborne frame the tip
    of the toe points back to where it left the ground, even with the leg stretched. Angle
    (degrees) between the ball-to-toe line and the ball-to-takeoff-point line; near 0 sells
    the push, near 90 is a flat foot that forgot the ground [added measure]."""
    a, b = _sub(toe, ball), _sub(takeoff, ball)
    na, nb = _norm(a), _norm(b)
    if na < 1e-9 or nb < 1e-9:
        return 0.0
    c = sum(x * y for x, y in zip(a, b)) / (na * nb)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def foot_events(spans, frames, heel, flat_with, tip=None, flat_window=6):
    """Touch-downs and lift-offs of one foot from contact_spans() per joint, {joint: [(s, e)]}.
    touchdowns: [{touch, flat, frames}], touch = first frame any joint is planted after none
    was, flat = first frame heel and flat_with (the ball) are both planted within
    flat_window, frames = flat - touch (None: not flat in time). Camporota: heel to flat
    "almost in one frame" (ynXadXE9UjU 00:09:26); digest gate: at most 1 or 2.
    liftoffs: [{last, first_air}] where the tip (toe) is the last joint planted before a
    frame with no joint planted: the frame the peel-off check reads."""
    F = [float(f) for f in frames]
    n = len(F)
    planted = {}
    for j, sp in spans.items():
        planted[j] = [any(float(s) <= f <= float(e) for s, e in sp) for f in F]
    if not planted:
        return {"touchdowns": [], "liftoffs": []}
    anyp = [any(p[i] for p in planted.values()) for i in range(n)]
    none = [False] * n
    ph, pb = planted.get(heel, none), planted.get(flat_with, none)
    downs = []
    for i in range(1, n):
        if anyp[i] and not anyp[i - 1]:
            flat = next((F[k] for k in range(i, min(n, i + flat_window + 1)) if ph[k] and pb[k]), None)
            downs.append({"touch": F[i], "flat": flat, "frames": (flat - F[i]) if flat is not None else None})
    ups = []
    pt = planted.get(tip, none) if tip else none
    for i in range(n - 1):
        if pt[i] and not anyp[i + 1]:
            ups.append({"last": F[i], "first_air": F[i + 1]})
    return {"touchdowns": downs, "liftoffs": ups}


def lag_frames(a, b, max_lag=6, mode="velocity"):
    """Frames by which signal b follows signal a (positive: b lags), by cross-correlation of
    their velocities (mode='velocity') or values ('value'). Returns {lag, corr}."""
    x = [float(v) for v in a]
    y = [float(v) for v in b]
    if mode == "velocity":
        x = [x[i + 1] - x[i] for i in range(len(x) - 1)]
        y = [y[i + 1] - y[i] for i in range(len(y) - 1)]
    best = (0, -2.0)
    for L in range(-max_lag, max_lag + 1):
        xs, ys = [], []
        for t in range(len(x)):
            if 0 <= t + L < len(y):
                xs.append(x[t])
                ys.append(y[t + L])
        c = _pearson(xs, ys)
        if c > best[1] + 1e-9 or (abs(c - best[1]) <= 1e-9 and abs(L) < abs(best[0])):
            best = (L, c)
    return {"lag": best[0], "corr": round(best[1], 4)}


def overlap_report(signals, chain, max_lag=6, mode="velocity"):
    """Lags down an ordered chain (leader first), e.g. chest, neck, head. Flags
    'all_zero' (everything on one key: Neistadt, Wade's heavy video) and 'leads' (a
    follower moving before its parent)."""
    pairs = []
    for p, c in zip(chain[:-1], chain[1:]):
        r = lag_frames(signals[p], signals[c], max_lag, mode)
        pairs.append({"leader": p, "follower": c, "lag": r["lag"], "corr": r["corr"]})
    flags = []
    if pairs and all(p["lag"] == 0 for p in pairs):
        flags.append("all_zero")
    if any(p["lag"] < 0 for p in pairs):
        flags.append("leads")
    return {"pairs": pairs, "flags": flags}


def peak_order(signals, frames, window=None):
    """Frame of peak speed per signal (scalar or point tracks), sorted: checks a force chain
    (pelvis, chest, shoulder, elbow, wrist; Wade) or who leads an action (Lazare)."""
    F = [float(f) for f in frames]
    out = []
    for name, sig in signals.items():
        P = _as_points(sig)
        sp = [_dist(P[i + 1], P[i]) for i in range(len(P) - 1)]
        idx = range(len(sp))
        if window:
            idx = [i for i in idx if window[0] <= F[i] <= window[1]]
        if not idx:
            continue
        i = max(idx, key=lambda k: sp[k])
        out.append((name, F[i], round(sp[i], 4)))
    out.sort(key=lambda r: r[1])
    return out


def holds(values, frames, eps=None, min_frames=3):
    """(start, end, n_frames) spans where the track barely moves."""
    return motion_report(values, frames, hold_eps=eps, min_hold=min_frames)["holds"]


def dead_holds(tracks, frames, eps=0.01, min_frames=6):
    """Spans where EVERY track is still (below eps per frame) for >= min_frames: the hold
    that dies. Elver: in live action a character cannot stop immediately; Newman Harvey
    and Wade: holds must still breathe (not 100% flat). eps and min_frames [added]."""
    F = [float(f) for f in frames]
    still = None
    for t in tracks.values():
        P = _as_points(t)
        s = [_dist(P[i + 1], P[i]) < eps for i in range(len(P) - 1)]
        still = s if still is None else [a and b for a, b in zip(still, s)]
    if not still:
        return []
    return [(F[a], F[b + 1], b - a + 2) for a, b in _runs(still) if b - a + 2 >= min_frames]


def pose_to_pose_tell(key_times, share=0.9):
    """Neistadt: the whole body keyed on the same frames reads as 'hitting poses'. Returns
    shared_fraction (keys that sit on a time keyed by >= share of the controls) and
    identical_sets (controls whose key times equal the most common set). High after
    splining = everything starts and stops together [threshold added]."""
    sets = {c: tuple(sorted(round(float(t), 3) for t in ts)) for c, ts in key_times.items() if ts}
    n = len(sets)
    if not n:
        return {"controls": 0, "shared_fraction": 0.0, "identical_sets": 0.0}
    count = {}
    for ts in sets.values():
        for t in set(ts):
            count[t] = count.get(t, 0) + 1
    shared = {t for t, k in count.items() if k >= share * n}
    total = sum(len(ts) for ts in sets.values())
    on_shared = sum(1 for ts in sets.values() for t in ts if t in shared)
    modal = max(set(sets.values()), key=lambda s: list(sets.values()).count(s))
    ident = sum(1 for s in sets.values() if s == modal)
    return {"controls": n, "key_times": len(count), "shared_times": len(shared),
            "shared_fraction": on_shared / float(total), "identical_sets": ident / float(n)}


def tween_fractions(times, values, band=(0.45, 0.55)):
    """For each in-between key (value strictly between its neighbours) its value and time
    fraction. Newman: 50/50 tweens give even timing; favour a neighbour instead. Returns
    rows and the share of in-betweens inside `band` [band added]."""
    rows = []
    for i in range(1, len(values) - 1):
        v0, v, v1 = float(values[i - 1]), float(values[i]), float(values[i + 1])
        if (v0 < v < v1) or (v1 < v < v0):
            t0, t, t1 = float(times[i - 1]), float(times[i]), float(times[i + 1])
            rows.append({"time": t, "value_frac": (v - v0) / (v1 - v0),
                         "time_frac": (t - t0) / (t1 - t0) if t1 != t0 else None})
    mid = [r for r in rows if band[0] <= r["value_frac"] <= band[1]]
    return {"inbetweens": rows, "fifty_fifty_share": (len(mid) / float(len(rows))) if rows else 0.0}


def extreme_indices(values, eps=1e-9, keep_ends=True):
    """Indices of local extrema (plateaus collapse to their first sample)."""
    v = [float(x) for x in values]
    out = [0] if keep_ends and v else []
    last_sign, last_end = 0, 0
    for i in range(len(v) - 1):
        d = v[i + 1] - v[i]
        s = 0 if abs(d) <= eps else (1 if d > 0 else -1)
        if s == 0:
            continue
        if last_sign and s != last_sign:
            out.append(last_end)          # first sample of the plateau the last move reached
        last_sign, last_end = s, i + 1
    if keep_ends and len(v) > 1:
        out.append(len(v) - 1)
    return sorted(set(out))


def double_beats(values, frames, window=8, min_return=None):
    """Lazare: hit a pose, relax, hit it again = double beat; the second must go further
    (progression). Looks for hit, return, re-hit within `window` frames; min_return
    default 10% of the value range [added]."""
    v = [float(x) for x in values]
    F = [float(f) for f in frames]
    rng = (max(v) - min(v)) or 1.0
    mr = 0.1 * rng if min_return is None else min_return
    ext = [i for i in extreme_indices(v, keep_ends=False)]
    out = []
    for k in range(len(ext) - 2):
        e1, r, e2 = ext[k], ext[k + 1], ext[k + 2]
        is_max = v[e1] > v[r]
        if (v[e2] > v[r]) != is_max or F[e2] - F[e1] > window:
            continue
        if abs(v[e1] - v[r]) < mr:
            continue
        further = v[e2] > v[e1] if is_max else v[e2] < v[e1]
        out.append({"hit": F[e1], "return": F[r], "rehit": F[e2],
                    "kind": "progression" if further else "double_beat"})
    return out


def overshoots(key_times, key_values, samples, tol=None, holds_only=False, eq_tol=1e-4):
    """Sampled curve values outside the [min, max] of their neighbouring keys (a spline
    overshooting through a hold or a contact). samples: {frame: value}, sub-frames allowed.
    Plateau keeps extremes on keys, Clamped fixes near-equal keys (Maya 2027 Help)."""
    kt = [float(t) for t in key_times]
    kv = [float(v) for v in key_values]
    span = (max(kv) - min(kv)) if kv else 0.0
    tol = tol if tol is not None else max(1e-4, 1e-3 * span)
    out = []
    for i in range(len(kt) - 1):
        t0, t1, v0, v1 = kt[i], kt[i + 1], kv[i], kv[i + 1]
        if holds_only and abs(v1 - v0) > eq_tol:
            continue
        lo, hi = min(v0, v1), max(v0, v1)
        worst = 0.0
        for t, v in samples.items():
            if t0 < float(t) < t1:
                worst = max(worst, float(v) - hi, lo - float(v))
        if worst > tol:
            out.append({"segment": (t0, t1), "excess": round(worst, 5), "hold": abs(v1 - v0) <= eq_tol})
    return out


def hold_drift(samples, spans):
    """Largest departure from the value at the start of each hold span:
    [{"span": (start, end), "drift": d}] (samples: {frame: value})."""
    out = []
    for s, e in spans:
        base = samples[s] if s in samples else samples[float(s)]
        vals = [float(v) for t, v in samples.items() if float(s) <= float(t) <= float(e)]
        out.append({"span": (s, e), "drift": max(abs(v - float(base)) for v in vals) if vals else 0.0})
    return out


def curve_diff(before, after, ignore=(), value_tol=1e-4, angle_tol=0.05, sample_tol=1e-3):
    """What a keying pass changed, from two snapshot() dicts. Wade: native Set Key reshapes
    neighbouring curves (TMSpauVphNs 00:01:45, G49wexNmQ-Q 00:06:22); digest gate 'Set key
    damage': after scripted keying, neighbouring keys and tangents unchanged. Reports keys at
    the same time whose value, tangent type or angle moved ('changed'), keys added and
    removed, and, when both snapshots carry samples (snapshot(samples=...)), the frames
    where the evaluated curve moved. ignore: [(t0, t1)] spans you meant to edit (a new
    breakdown's two segments, from the previous key to the next one); only their interior is
    ignored, so the neighbouring keys at t0 and t1 must stay put. Weights are not compared:
    an insert on a weighted curve shortens the neighbours' handles to keep the shape
    [added]. ok: nothing changed or was removed outside ignore (added keys are listed, not
    failed)."""
    spans = [(float(a), float(b)) for a, b in ignore]

    def inside(t):
        return any(a + 1e-6 < float(t) < b - 1e-6 for a, b in spans)

    bmap = {r["plug"]: r for r in before.get("curves", [])}
    amap = {r["plug"]: r for r in after.get("curves", [])}
    changed, added, removed, moved = [], [], [], []
    worst = 0.0
    for plug in sorted(set(bmap) | set(amap)):
        rb, ra = bmap.get(plug), amap.get(plug)
        if rb is None:
            added.append((plug, None))
            continue
        if ra is None:
            removed.append((plug, None))
            continue
        kb = {round(float(t), 4): i for i, t in enumerate(rb["times"])}
        ka = {round(float(t), 4): i for i, t in enumerate(ra["times"])}
        added += [(plug, t) for t in sorted(set(ka) - set(kb))]
        removed += [(plug, t) for t in sorted(set(kb) - set(ka)) if not inside(t)]
        for t in sorted(set(kb) & set(ka)):
            if inside(t):
                continue
            i, k = kb[t], ka[t]
            for field, tol in (("values", value_tol), ("ia", angle_tol), ("oa", angle_tol)):
                vb, va = rb.get(field) or [], ra.get(field) or []
                if i < len(vb) and k < len(va) and abs(float(va[k]) - float(vb[i])) > tol:
                    changed.append((plug, t, field, round(float(vb[i]), 5), round(float(va[k]), 5)))
            for field in ("itt", "ott"):
                vb, va = rb.get(field) or [], ra.get(field) or []
                if i < len(vb) and k < len(va) and vb[i] != va[k]:
                    changed.append((plug, t, field, vb[i], va[k]))
        sb = {round(float(t), 4): float(v) for t, v in (rb.get("samples") or [])}
        sa = {round(float(t), 4): float(v) for t, v in (ra.get("samples") or [])}
        for t in sorted(set(sb) & set(sa)):
            d = abs(sa[t] - sb[t])
            if d > sample_tol and not inside(t):
                moved.append((plug, t, round(d, 5)))
                worst = max(worst, d)
    return {"ok": not (changed or removed or moved), "changed": changed, "added": added,
            "removed": removed, "moved_samples": moved[:50], "max_sample_dev": round(worst, 6)}


def transitions(values, frames, eps=None, min_hold=2):
    """Moves between holds of a scalar channel: [{start, end, frames, delta}]. Used for eye
    darts (Elver: 2 frames, linear), brows, blinks, snaps."""
    F = [float(f) for f in frames]
    v = [float(x) for x in values]
    rep = motion_report(v, F, hold_eps=eps, min_hold=min_hold)
    out = []
    for s, e in rep["moves"]:
        i0, i1 = F.index(s), F.index(e)
        out.append({"start": s, "end": e, "frames": e - s, "delta": round(v[i1] - v[i0], 5)})
    return out


def blink_report(lid, frames, closed, opened, tol=0.1):
    """Blinks on a lid channel (closed / opened values are the rig's). Elver: close faster
    than open (2/4 or 3/5), small-then-big spacing, cushion frame on the way out."""
    F = [float(f) for f in frames]
    n = [(float(v) - opened) / (closed - opened) for v in lid]
    N, out, i = len(n), [], 0
    while i < N:
        if n[i] < 1 - tol:
            i += 1
            continue
        c0 = c1 = i                               # closed plateau c0..c1
        while c1 + 1 < N and n[c1 + 1] >= 1 - tol:
            c1 += 1
        s = c0                                    # last open frame before closing
        while s > 0 and n[s] > tol:
            s -= 1
        e = c1                                    # first open frame after opening
        while e < N - 1 and n[e] > tol:
            e += 1
        first = n[s + 1] if s < c0 else None
        out.append({"start": F[s], "closed": F[c0], "closed_end": F[c1], "open_again": F[e],
                    "closing_frames": F[c0] - F[s], "opening_frames": F[e] - F[c1],
                    "first_close_fraction": round(first, 3) if first is not None else None})
        i = e + 1
    return out


def jaw_report(jaw, frames, fps=24.0, eps=None):
    """Jaw open channel (bigger = more open). Reversals per second (chatter, Santos and
    Wade), first-frame share of each open (Lazare: punch opens, most of the way on the
    first frame), and tentpole ratio (biggest open over the median open)."""
    F = [float(f) for f in frames]
    v = [float(x) for x in jaw]
    ext = extreme_indices(v, eps=eps or 1e-6, keep_ends=True)
    dur = (F[-1] - F[0]) / float(fps) if F[-1] > F[0] else 1.0
    reversals = max(0, len(ext) - 2)
    opens = []
    for a, b in zip(ext[:-1], ext[1:]):
        if v[b] > v[a] and b > a:
            first = (v[a + 1] - v[a]) / (v[b] - v[a])
            opens.append({"start": F[a], "peak": F[b], "size": v[b] - v[a], "frames": F[b] - F[a],
                          "first_frame_share": round(first, 3)})
    sizes = [o["size"] for o in opens]
    return {"reversals_per_s": round(reversals / dur, 3), "opens": opens,
            "tentpole_ratio": (max(sizes) / _median(sizes)) if sizes and _median(sizes) else None}


# Lead of the mouth shape before the sound, by where the sound is made (Santos S1MRs3XJVPI
# 00:06:08): bilabials on the frame, alveolars about one frame early, further back earlier
# (2 is implied by his quiz, not stated), open shapes set before the sound. Labiodental,
# dental and vowel leads are [added] readings of the same rule.
SOUND_CLASS = {"M": "bilabial", "B": "bilabial", "P": "bilabial", "F": "labiodental", "V": "labiodental",
               "TH": "dental", "DH": "dental", "D": "alveolar", "T": "alveolar", "L": "alveolar", "S": "alveolar",
               "Z": "alveolar", "N": "alveolar", "SH": "alveolar", "ZH": "alveolar", "CH": "alveolar", "JH": "alveolar",
               "J": "alveolar", "R": "alveolar", "K": "velar", "G": "velar", "NG": "velar", "HH": "vowel",
               "W": "bilabial", "Y": "vowel"}
LEAD_FRAMES = {"bilabial": 0, "labiodental": 0, "dental": 1, "alveolar": 1, "velar": 2, "vowel": 1}
SOUND_RULES = {"M": "lips closed at least 1 frame (can close early; opens slower than B, P)",
               "B": "lips closed BEFORE the sound frame; opens on the sound", "P": "lips closed BEFORE the sound frame; opens on the sound",
               "F": "upper teeth on the bottom lip", "V": "upper teeth on the bottom lip",
               "L": "tongue up early, release with a big one-frame spacing", "T": "tongue kisses the roof",
               "D": "tongue kisses the roof", "TH": "tongue tip visible between the teeth",
               "R": "tongue floats mid-mouth; zip or sneer", "O": "round", "OO": "zip", "CH": "compress plus air",
               "J": "compress plus air", "K": "release with the mouth open, often to one side"}


def mouth_keys(phonemes, fps=24.0):
    """Key frames for mouth shapes from sound onsets: [(sound, onset_frame)] ->
    [{sound, onset, key_frame, lead, class, rule}]. Sounds are ARPAbet-like (M, B, AA, IY...);
    vowels default to the 'vowel' class. Use a forced aligner outside Maya for onsets [added]
    and check them against the waveform; this sets the lead, the eye judges the result."""
    out = []
    for sound, onset in phonemes:
        s = str(sound).upper().rstrip("012")
        cls = SOUND_CLASS.get(s, "vowel")
        lead = LEAD_FRAMES[cls]
        out.append({"sound": s, "onset": float(onset), "key_frame": float(onset) - lead, "lead": lead,
                    "class": cls, "rule": SOUND_RULES.get(s)})
    return out


def audio_envelope(path, fps=24.0, start_frame=1):
    """Per-frame RMS loudness (0..1) of a PCM WAV: [(frame, level)]. Pure Python (wave)."""
    import wave
    import struct as _st
    with wave.open(path, "rb") as w:
        n, ch, sw, rate = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError("16-bit PCM expected, got %d bytes per sample" % sw)
    vals = _st.unpack("<%dh" % (len(raw) // 2), raw)
    mono = [sum(vals[i:i + ch]) / float(ch) for i in range(0, len(vals), ch)]
    per = rate / float(fps)
    out, k = [], 0
    while int(k * per) < len(mono):
        seg = mono[int(k * per):int((k + 1) * per)] or [0.0]
        out.append((start_frame + k, math.sqrt(sum(x * x for x in seg) / len(seg)) / 32768.0))
        k += 1
    top = max(v for _, v in out) or 1.0
    return [(f, v / top) for f, v in out]


def lip_lag(envelope, jaw, max_lag=4):
    """Frames by which the jaw opening follows the audio loudness (positive = the mouth is
    late). Mouth shapes form slightly before the sound (Lazare [00:19:33]): a positive lag
    means shift the mouth keys earlier by about lag + 1 frames [added measure]."""
    return lag_frames([float(v) for v in envelope], [float(v) for v in jaw], max_lag, mode="value")


def loop_seam(pose_a, pose_b, tol=1e-3, exclude=()):
    """Compare two poses {plug: value} (first frame and first frame + cycle length)."""
    out = []
    for k, va in pose_a.items():
        if k in exclude or k not in pose_b:
            continue
        if abs(float(va) - float(pose_b[k])) > tol:
            out.append((k, float(va), float(pose_b[k])))
    return out


def rotation_flips(rot_tracks, frames, max_step=90.0):
    """Frame-to-frame rotation jumps above max_step degrees on any channel (flips after
    IK/FK or space switches, mocap, merges): run Euler Filter."""
    F = [float(f) for f in frames]
    out = []
    for name, tr in rot_tracks.items():
        P = _as_points(tr)
        for i in range(len(P) - 1):
            for ax, (a, b) in enumerate(zip(P[i], P[i + 1])):
                if abs(b - a) > max_step:
                    out.append((name, F[i + 1], ax, round(b - a, 2)))
    return out


def key_density(key_times, speeds, frames, pct=0.75, max_gap=2.0):
    """Newman: fast actions need keys on ones in blocking, slow parts tolerate 2 to 4.
    Flags fast frames (speed above the pct quantile) lying in a key gap over max_gap."""
    kt = sorted(float(t) for t in key_times)
    F = [float(f) for f in frames]
    s = sorted(speeds)
    thr = s[min(len(s) - 1, int(pct * len(s)))] if s else 0.0
    out = []
    for f, sp in zip(F, speeds):
        if sp < thr or sp <= 0:
            continue
        before = [t for t in kt if t <= f]
        after = [t for t in kt if t > f]
        if before and after and after[0] - before[-1] > max_gap:
            out.append((f, before[-1], after[0]))
    return {"threshold": thr, "flagged": out}


def cycle_speed(points, frames, fps=24.0, up=1):
    """Horizontal speed (units/s) of a root or pelvis track over the clip: compare with
    the game's metric sheet (Newman: round numbers, player first)."""
    P = _as_points(points)
    a, b = list(P[0]), list(P[-1])
    a[up], b[up] = 0.0, 0.0
    dt = (float(frames[-1]) - float(frames[0])) / float(fps)
    return _dist(a, b) / dt if dt else 0.0


# =========================================================================== projection
FILM_FIT = {0: "fill", 1: "horizontal", 2: "vertical", 3: "overscan",
            "fill": "fill", "horizontal": "horizontal", "vertical": "vertical", "overscan": "overscan"}


def project_point(p, cam_inverse, focal_mm=35.0, h_aperture_in=1.417, v_aperture_in=0.945,
                  res=(1920, 1080), film_fit="fill", ortho_width=None):
    """World point -> (px, py, depth) in pixels (origin top-left, y down) through a Maya
    camera (looks down -Z). cam_inverse: the camera's worldInverseMatrix, 16 floats
    row-major (p' = p * M). Film offsets, overscan and lens squeeze ignored [added];
    filmFit enum order 0 fill, 1 horizontal, 2 vertical, 3 overscan [verify]."""
    m = cam_inverse
    x, y, z = float(p[0]), float(p[1]), float(p[2])
    pc = [x * m[0 + j] + y * m[4 + j] + z * m[8 + j] + m[12 + j] for j in range(3)]
    w, h = float(res[0]), float(res[1])
    depth = -pc[2]
    if ortho_width:
        ppu = w / float(ortho_width)
        return (w / 2.0 + pc[0] * ppu, h / 2.0 - pc[1] * ppu, depth)
    if depth <= 1e-9:
        return (float("nan"), float("nan"), depth)
    hmm, vmm = h_aperture_in * 25.4, v_aperture_in * 25.4
    xf, yf = focal_mm * pc[0] / depth, focal_mm * pc[1] / depth
    fit = FILM_FIT.get(film_fit, "fill")
    ppm_h, ppm_v = w / hmm, h / vmm
    ppm = {"horizontal": ppm_h, "vertical": ppm_v, "fill": max(ppm_h, ppm_v),
           "overscan": min(ppm_h, ppm_v)}[fit]
    return (w / 2.0 + xf * ppm, h / 2.0 - yf * ppm, depth)


def fit_view(world, view="side", size=(960, 540), margin=0.08):
    """Schematic orthographic projection of {name: [(x, y, z)]} auto-framed into pixels.
    side: screen x = world Z, y = world Y; front: X, Y; top: X, -Z. Not Maya's camera
    conventions: a drawing aid for tracks and stick figures [added]."""
    ax = {"side": (2, 1, 1.0), "front": (0, 1, 1.0), "top": (0, 2, -1.0)}[view]
    uv = {n: [(p[ax[0]], ax[2] * p[ax[1]]) for p in pts] for n, pts in world.items()}
    us = [u for pts in uv.values() for u, _ in pts]
    vs = [v for pts in uv.values() for _, v in pts]
    W, H = size
    du, dv = (max(us) - min(us)) or 1.0, (max(vs) - min(vs)) or 1.0
    s = min(W * (1 - 2 * margin) / du, H * (1 - 2 * margin) / dv)
    uc, vc = (max(us) + min(us)) / 2.0, (max(vs) + min(vs)) / 2.0
    return {n: [(W / 2.0 + (u - uc) * s, H / 2.0 - (v - vc) * s) for u, v in pts] for n, pts in uv.items()}


# =========================================================================== images (pure Python)
def _review():
    if EXPERT_SCRIPTS not in sys.path:
        sys.path.insert(0, EXPERT_SCRIPTS)
    import mx_review
    return mx_review


# Wade Neistadt's Graph Editor palette (TMSpauVphNs f_00933): translates red/green/blue,
# rotates orange/yellow/cyan, scales pink/violet. Yellow darkened for a white background.
CHANNEL_COLORS = {
    "translateX": (215, 40, 40), "translateY": (35, 160, 55), "translateZ": (40, 90, 215),
    "rotateX": (235, 130, 20), "rotateY": (185, 160, 0), "rotateZ": (0, 165, 185),
    "scaleX": (225, 95, 165), "scaleY": (165, 115, 215), "scaleZ": (135, 85, 165),
}
_SHORT = {"tx": "translateX", "ty": "translateY", "tz": "translateZ", "rx": "rotateX",
          "ry": "rotateY", "rz": "rotateZ", "sx": "scaleX", "sy": "scaleY", "sz": "scaleZ"}
TRACK_COLORS = [(215, 40, 40), (40, 90, 215), (35, 150, 55), (235, 130, 20), (140, 60, 180),
                (0, 150, 170), (120, 120, 120), (200, 60, 140), (130, 90, 30), (0, 0, 0),
                (90, 170, 230), (170, 200, 40)]


def _channel_color(name):
    attr = name.rsplit(".", 1)[-1]
    attr = _SHORT.get(attr, attr)
    return CHANNEL_COLORS.get(attr, (60, 60, 60))


class Canvas(object):
    """Tiny RGB raster (top row first) with clipped drawing. save() uses mx_review.write_png."""

    def __init__(self, w, h, bg=(250, 250, 250), image=None):
        self.w, self.h = int(w), int(h)
        self.buf = bytearray(image) if image is not None else bytearray(bytes(bg) * (self.w * self.h))

    def px(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            o = (y * self.w + x) * 3
            self.buf[o:o + 3] = bytes(c)

    def dot(self, x, y, r, c):
        if x != x or y != y:          # NaN from a point behind the camera
            return
        r = max(0, int(r))
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dx * dx + dy * dy <= r * r + r:
                    self.px(x + dx, y + dy, c)

    def line(self, x0, y0, x1, y1, c, width=1):
        if any(v != v for v in (x0, y0, x1, y1)):
            return
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        if n > 20000:
            return
        for i in range(n + 1):
            t = i / float(n)
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            if width <= 1:
                self.px(x, y, c)
            else:
                self.dot(x, y, width // 2, c)

    def rect(self, x0, y0, x1, y1, c):
        x0, x1 = sorted((max(0, int(x0)), min(self.w - 1, int(x1))))
        y0, y1 = sorted((max(0, int(y0)), min(self.h - 1, int(y1))))
        row = bytes(c) * (x1 - x0 + 1)
        for y in range(y0, y1 + 1):
            o = (y * self.w + x0) * 3
            self.buf[o:o + len(row)] = row

    def text(self, x, y, s, scale=2, c=(20, 20, 20)):
        x, y = int(x), int(y)
        if y < 0 or y + 7 * scale > self.h or x < 0 or self.w - x < 5 * scale:
            return
        nmax = int((self.w - x - 5 * scale) // (6 * scale)) + 1
        s = str(s)[:max(0, nmax)]
        if s:
            _review().draw_text(self.buf, self.w, x, y, s, scale, c)

    def save(self, path):
        d = os.path.dirname(os.path.abspath(path))
        if not os.path.isdir(d):
            os.makedirs(d)
        _review().write_png(path, self.w, self.h, bytes(self.buf), channels=3)
        return path


def _tick_step(n):
    for s in (1, 2, 4, 6, 12, 24, 48, 96, 240, 480):
        if n / float(s) <= 24:
            return s
    return 1000


def curve_lanes_png(path, curves, keys=None, spans=(), marks=(), width=1200, lane_h=56,
                    title=None, label_w=240):
    """Stacked-view curve plot (Wade: one lane per curve, min-max normalized, so relative
    timing across channels reads at a glance). curves: {name: [(frame, value)]} or a list
    of (name, samples); keys: {name: [key frames]} drawn as dots; spans: [(start, end,
    label)] shaded (contacts, air); marks: frames drawn as vertical lines (key poses)."""
    items = list(curves.items()) if isinstance(curves, dict) else list(curves)
    if not items:
        raise ValueError("no curves to plot")
    allf = [float(f) for _, s in items for f, _ in s]
    f0, f1 = min(allf), max(allf)
    if f1 <= f0:
        f1 = f0 + 1.0
    head, foot = 34, 22
    W, H = int(width), head + lane_h * len(items) + foot
    cv = Canvas(W, H)
    plot_w = W - label_w - 12

    def px(f):
        return label_w + (float(f) - f0) / (f1 - f0) * plot_w

    for sp in spans:
        cv.rect(px(sp[0]), head, px(sp[1]), H - foot, (226, 234, 248))
        if len(sp) > 2 and sp[2]:
            cv.text(px(sp[0]) + 2, head - 16, str(sp[2]), 1, (60, 80, 140))
    step = _tick_step(f1 - f0)
    f = math.ceil(f0 / step) * step
    while f <= f1:
        cv.line(px(f), head, px(f), H - foot, (225, 225, 225))
        cv.text(px(f) - 6, H - foot + 6, "%d" % f, 1, (90, 90, 90))
        f += step
    for m in marks:
        cv.line(px(m), head - 4, px(m), H - foot, (150, 150, 150))
    if title:
        cv.text(6, 6, title, 2, (0, 0, 0))
    for li, (name, samples) in enumerate(items):
        y0 = head + li * lane_h
        cv.line(0, y0, W, y0, (205, 205, 205))
        vals = [float(v) for _, v in samples]
        lo, hi = min(vals), max(vals)
        flat = hi - lo < 1e-9

        def py(v):
            if flat:
                return y0 + lane_h / 2.0
            return y0 + lane_h - 7 - (float(v) - lo) / (hi - lo) * (lane_h - 16)

        col = _channel_color(name)
        pts = [(px(fr), py(v)) for fr, v in samples]
        for a, b in zip(pts[:-1], pts[1:]):
            cv.line(a[0], a[1], b[0], b[1], col, 2)
        for kf in (keys or {}).get(name, []):
            near = min(samples, key=lambda s: abs(float(s[0]) - float(kf)))
            cv.dot(px(kf), py(near[1]), 3, (0, 0, 0))
        cv.text(4, y0 + 6, name, 1, (10, 10, 10))
        cv.text(4, y0 + 20, ("FLAT %.3g" % lo) if flat else ("%.3g .. %.3g" % (lo, hi)), 1, (90, 90, 90))
    cv.save(path)
    return {"path": path, "size": (W, H), "frames": (f0, f1), "lanes": len(items)}


def tracks_png(path, tracks, frames=None, size=(960, 540), bones=(), pose_frames=(), image=None,
               title=None, label_every=None, dot=2):
    """Tracks with a dot per frame (spacing reads as dot gaps) and optional stick figures
    at pose_frames, light to dark (an onion skin). tracks: {name: [(px, py[, depth])]}
    in pixels, e.g. from camera_track() or fit_view(). image: optional PNG to draw over
    (a playblast frame): the programmatic drawover."""
    W, H = int(size[0]), int(size[1])
    bg = None
    if image:
        R = _review()
        w, h, rgba = R.read_rgba(image)
        rgb = R.rgba_to_rgb(rgba)
        bg = rgb if (w, h) == (W, H) else R.downsample(w, h, rgb, W, H)
    cv = Canvas(W, H, image=bg)
    names = list(tracks.keys())
    n = len(tracks[names[0]])
    frames = list(frames) if frames is not None else list(range(n))
    fidx = {float(f): i for i, f in enumerate(frames)}
    pf = [p for p in pose_frames if float(p) in fidx]
    pf_set = set(float(p) for p in pf)
    for k, f in enumerate(pf):
        i = fidx[float(f)]
        g = int(200 - 170 * (k / float(max(1, len(pf) - 1))))
        for a, b in bones:
            if a in tracks and b in tracks:
                pa, pb = tracks[a][i], tracks[b][i]
                cv.line(pa[0], pa[1], pb[0], pb[1], (g, g, g), 3)
    for ni, name in enumerate(names):
        col = TRACK_COLORS[ni % len(TRACK_COLORS)]
        pts = tracks[name]
        for a, b in zip(pts[:-1], pts[1:]):
            cv.line(a[0], a[1], b[0], b[1], col, 1)
        for i, p in enumerate(pts):
            cv.dot(p[0], p[1], dot + (1 if float(frames[i]) in pf_set else 0), col)
        cv.rect(8, 30 + ni * 16, 18, 40 + ni * 16, col)
        cv.text(24, 31 + ni * 16, name, 1, (20, 20, 20))
    if label_every:
        p0 = tracks[names[0]]
        for i in range(0, n, int(label_every)):
            cv.text(p0[i][0] + 5, p0[i][1] - 12, "%d" % frames[i], 1, (0, 0, 0))
    if title:
        cv.text(8, 8, title, 2, (0, 0, 0))
    cv.save(path)
    return {"path": path, "size": (W, H), "tracks": names, "poses": pf}


# =========================================================================== gates (pure)
def _gate(rows, gid, status, message, frames=None, fix=None, data=None, source=None):
    rows.append({"id": gid, "status": status, "message": message, "frames": frames,
                 "fix": fix, "data": data, "source": source})


def _windows(w):
    """A window [start, end] or a list of windows -> [(start, end)]."""
    if not w:
        return []
    if isinstance(w[0], (list, tuple)):
        return [(float(a), float(b)) for a, b in w]
    return [(float(w[0]), float(w[1]))]


def _gid(base, k, n):
    return base if n == 1 else "%s_%d" % (base, k + 1)


def evaluate_gates(samples, plan):
    """Code gates of a shot from sampled data (pure). samples: {frames, fps, unit, up,
    world {node: [(x, y, z)]}, attrs {plug: [values]}?, keys {ctrl: [times]}?,
    subframe_keys?, layers?, scene_fps?}. plan: see run_gates. Returns {gates: [...],
    summary, ok}. Status: pass, warn, fail, skip. Thresholds cite their source; [added] ones
    are toolkit defaults. The body-mechanics gates apply to any jump, landing, hop or
    weight shift the plan describes: every crouch window (foot_roll, spine_drag, resistance
    when heavy), every touch-down and lift-off of every foot (heel_to_flat, peel_off), every
    landing in plan["impacts"] (impact_hold, default the air landing)."""
    F = [float(f) for f in samples["frames"]]
    W = samples.get("world", {})
    up = int(samples.get("up", 1))
    fps = float(samples.get("fps") or plan.get("fps") or 24.0)
    unit = samples.get("unit", "cm")
    cm = UNIT_TO_CM.get(unit, 1.0)
    style = plan.get("style", "realistic")
    stage = plan.get("stage", "spline")
    heavy = style in ("heavy", "realistic", "live_action")
    gf = _ground_fn(plan.get("ground", 0.0))
    rows = []
    idx = {f: i for i, f in enumerate(F)}

    def seg(track, a, b):
        return [track[idx[float(f)]] for f in F if float(a) <= f <= float(b)]

    # scene rate
    if samples.get("scene_fps") and plan.get("fps"):
        ok = abs(float(samples["scene_fps"]) - float(plan["fps"])) < 1e-3
        _gate(rows, "fps", "pass" if ok else "fail", "scene %s fps, plan %s fps" % (
            samples["scene_fps"], plan["fps"]), fix=None if ok else "cmds.currentUnit(time=...)",
            source="brief")
    cog = plan.get("cog")
    ch = [p[up] for p in W[cog]] if cog in W else None
    air = plan.get("air")
    contact_frames = [float(x) for x in (air or [])]
    # impacts reach followers (head, hands) a few frames late through overlap: excuse
    # spikes from 1 frame before to 3 frames after each contact [added]
    impact_frames = sorted(set(c + d for c in contact_frames for d in (-1.0, 0.0, 1.0, 2.0, 3.0)))
    if ch and air:
        a0, a1 = float(air[0]), float(air[1])
        hs = seg(ch, a0, a1)
        fr = [f for f in F if a0 <= f <= a1]
        if len(hs) >= 4:
            b = ballistic_fit(hs, fr, fps, unit)
            lo, hi = (0.8, 1.25) if heavy else (0.8, 9.0)
            st = "pass" if lo <= b["g_ratio"] <= hi else ("fail" if heavy else "warn")
            _gate(rows, "ballistic", st, "air g_ratio %.2f (1.0 = real gravity), residual %.2f" % (
                b["g_ratio"], b["max_residual"]), (a0, a1),
                None if st == "pass" else "retime the air: frames from air_frames(); key it with ballistic_keys()",
                {k: b[k] for k in ("g_ratio", "apex_frame", "apex_height", "hang_frames", "hang_expected")},
                "physics [added]: 981/576 cm/frame^2 at 24 fps")
            if b["hang_excess"] is not None:
                st = "pass" if b["hang_excess"] <= 1 or not heavy else "fail"
                _gate(rows, "hang", st, "hang %s frames near the apex, gravity gives %s" % (
                    b["hang_frames"], b["hang_expected"]), (a0, a1),
                    None if st == "pass" else "no stylized hang on a heavy body: flat apex, one-third handles",
                    source="physics [added]; Neistadt's weighted apex (TMSpauVphNs 00:07:29) adds hang beyond gravity")
            if cog in W:
                P = seg(W[cog], a0, a1)
                hsp = []
                for p, q in zip(P[:-1], P[1:]):
                    u, v = list(p), list(q)
                    u[up] = v[up] = 0.0
                    hsp.append(_dist(u, v))
                m = _mean(hsp)
                cv = (math.sqrt(_mean([(x - m) ** 2 for x in hsp])) / m) if m > 1e-9 else 0.0
                st = "pass" if cv <= 0.15 else "warn"
                _gate(rows, "air_horizontal", st, "horizontal air speed CV %.2f" % cv, (a0, a1),
                      None if st == "pass" else "nothing pushes in the air: linear horizontal travel",
                      source="physics [added]")
        else:
            _gate(rows, "ballistic", "skip", "fewer than 4 air frames", (a0, a1))
        try:
            lc = landing_catch(ch, F, a1)
            good = (lc["removed_in_window"] or 0) >= 0.6 and (lc["catch_ratio"] is None or lc["catch_ratio"] < 1.0)
            _gate(rows, "catch", "pass" if good else "warn",
                  ("landing: %.0f%% of fall speed gone in 2 frames, catch ratio %s, %d overshoots" % (
                      100 * lc["removed_in_window"], None if lc["catch_ratio"] is None else round(lc["catch_ratio"], 2),
                      lc["overshoots"])) if lc["removed_in_window"] is not None else
                  "landing: the COG is not falling into the contact (floaty arrival)", (a1, lc["lowest_frame"]),
                  None if good else "sharper catch: broken tangent into the contact, shorter decel than recovery",
                  lc, "Elver jzuxAmadcm8 00:58:46; Newman TIBzcsOt2FU 00:13:56")
        except ValueError as exc:
            _gate(rows, "catch", "skip", str(exc))
        if plan.get("push"):
            p0 = float(plan["push"][0])
            vel = [(F[i], ch[i + 1] - ch[i]) for i in range(len(ch) - 1)]
            fmax = max(vel, key=lambda r: r[1])[0]
            ok = p0 <= fmax <= a0
            _gate(rows, "push_fastest", "pass" if ok else "warn",
                  "fastest upward COG move starts at frame %s (push %s to takeoff %s)" % (fmax, p0, a0),
                  (p0, a0), None if ok else "snap out of the anticipation: ease in slow, release fast",
                  source="Camporota FA7fPB7qUhE 00:01:18, 00:03:46")
    # hold at the deepest compression of every landing (plan "impacts", default the air landing)
    impacts = [float(x) for x in (plan.get("impacts") or ([air[1]] if air else []))]
    for k, c in enumerate(impacts):
        if not ch or c not in idx:
            continue
        try:
            lc = landing_catch(ch, F, c)
        except ValueError:
            continue
        ok = lc["bottom_hold"] >= 3                        # 3 frames: at least two near-still steps [added]
        _gate(rows, _gid("impact_hold", k, len(impacts)), "pass" if ok else "warn",
              "hold at the deepest compression after %s: %d frames (%s-%s)" % (
                  c, lc["bottom_hold"], lc["bottom_span"][0], lc["bottom_span"][1]), lc["bottom_span"],
              None if ok else "push the squash and give the impact a bigger hold before the recovery",
              {"bottom_hold": lc["bottom_hold"], "lowest_frame": lc["lowest_frame"]},
              "Elver jzuxAmadcm8 00:13:54, 00:14:29; threshold [added]")
    # crouch windows (any anticipation down: plan "crouch" is one window or a list)
    feet = plan.get("feet") or {}
    crouch_ws = _windows(plan.get("crouch"))
    nc = len(crouch_ws)
    for k, (c0, c1) in enumerate(crouch_ws):
        if ch and style == "heavy":
            sp = [abs(ch[i + 1] - ch[i]) for i in range(len(ch) - 1)]
            thr = 0.05 * max(sp)                              # near stillness: 5% of peak speed [added]
            mask = [F[i] >= c0 and F[i + 1] <= c1 and sp[i] < thr for i in range(len(sp))]
            runs = [(F[a], F[b + 1], b - a + 2) for a, b in _runs(mask)]
            runs = [r for r in runs if r[1] >= c1 - 2]       # at the bottom, just before the push [added]
            best = max(runs, key=lambda r: r[2]) if runs else None
            ok = bool(best and best[2] >= 3)
            _gate(rows, _gid("resistance", k, nc), "pass" if ok else "fail",
                  "resistance beat in the crouch: %s" % (("%s-%s (%d frames)" % best) if best else "none"),
                  (c0, c1), None if ok else "add 2+ frames of near stillness with strain before the push",
                  source="Neistadt ZYKAMCZq2UI 00:03:05 (a break in the flow shows weight)")
        # foot roll animated in the crouch: rig attributes (plan "foot_roll", sampled into
        # samples["attrs"]) or, without them, the heel-to-toe pitch of each foot
        attrs_s = samples.get("attrs") or {}
        ranges, source = {}, "attribute"
        for p in plan.get("foot_roll") or []:
            if p in attrs_s:
                vals = [float(v) for f, v in zip(F, attrs_s[p]) if c0 <= f <= c1]
                if vals:
                    ranges[p] = max(vals) - min(vals)
        if not ranges:
            source = "pitch"
            for side, joints in feet.items():
                js = [j for j in joints if j in W]
                if len(js) >= 2:
                    pitch = foot_pitch(W[js[0]], W[js[-1]], up)
                    vals = [v for f, v in zip(F, pitch) if c0 <= f <= c1]
                    if vals:
                        ranges[side] = max(vals) - min(vals)
        if ranges:
            tol = 1e-3 if source == "attribute" else 1.0      # degrees of pitch [added]
            flat = sorted(n for n, r in ranges.items() if r <= tol)
            _gate(rows, _gid("foot_roll", k, nc), "pass" if not flat else "warn",
                  "foot roll range in the crouch (%s): %s" % (source, {n: round(r, 2) for n, r in ranges.items()}),
                  (c0, c1), None if not flat else "animate the foot roll in the crouch: it sells the compression",
                  {"source": source, "ranges": ranges, "flat": flat},
                  "Camporota FA7fPB7qUhE 00:07:55, 00:08:28; tol [added]")
        # the spine drags behind the hips on the way down
        spine = plan.get("spine") or (list(plan.get("chain") or []) or [None])[0]
        if ch and spine in W and spine != cog:
            sv = [p[up] for p in W[spine]]
            a = [ch[idx[f]] for f in F if c0 <= f <= c1]
            b = [sv[idx[f]] for f in F if c0 <= f <= c1]
            if len(a) >= 6:
                r = lag_frames(a, b, max_lag=4)
                ok = r["lag"] >= 1
                _gate(rows, _gid("spine_drag", k, nc), "pass" if ok else "warn",
                      "%s follows the COG down by %d frame(s) in the crouch" % (spine, r["lag"]), (c0, c1),
                      None if ok else "let the spine drag behind the hips on the way down (offset the chest keys a "
                      "frame); only the arms drop",
                      r, "Camporota FA7fPB7qUhE 00:08:28; lag measure [added]")
    # contacts per foot joint
    feet = plan.get("feet") or {}
    offsets = plan.get("foot_offsets") or {}
    rest = plan.get("rest_frame")
    for side, joints in feet.items():
        worst, pen_all, spans_all = 0.0, [], {}
        for j in joints:
            if j not in W:
                continue
            h = [p[up] for p in W[j]]
            if j in offsets:
                off = float(offsets[j])
            elif rest is not None and float(rest) in idx:
                off = h[idx[float(rest)]] - gf(float(rest))
            else:
                off = min(hh - gf(f) for hh, f in zip(h, F))
            spans = contact_spans(h, F, plan.get("ground", 0.0), 0.5 / cm, 0.5 / cm, 2, off)
            spans_all[j] = spans
            sl = foot_slide(W[j], F, spans, up, 0.2 / cm)
            worst = max(worst, sl["max_step"])
            if offsets or rest is not None:
                pen_all += [(j,) + p for p in penetration(h, F, plan.get("ground", 0.0), 0.5 / cm, off)]
        if spans_all:
            st = "pass" if worst <= 0.2 / cm else "fail"
            _gate(rows, "slide_%s" % side, st, "max planted step %.3f %s/frame" % (worst, unit), None,
                  None if st == "pass" else "lock the plant: Clamped or linear tangents, equal values across the contact",
                  {"spans": spans_all}, "Elver jzuxAmadcm8 00:41:45 (own every contact frame); tol [added]")
            if offsets or rest is not None:
                _gate(rows, "penetration_%s" % side, "pass" if not pen_all else "fail",
                      "%d frames below the support" % len(pen_all), None,
                      None if not pen_all else "raise the foot or the box contact; check the ball and toe",
                      pen_all[:10], "Camporota ynXadXE9UjU 00:09:26; tol [added]")
        js = [j for j in joints if j in spans_all]
        if len(js) >= 2:
            ev = foot_events({j: spans_all[j] for j in js}, F, js[0], js[1], tip=js[-1])
            downs = ev["touchdowns"]
            if downs:
                slow = [d for d in downs if d["frames"] is None or d["frames"] > 2]
                _gate(rows, "heel_to_flat_%s" % side, "pass" if not slow else "warn",
                      "touch-down to flat foot: %s" % [(d["touch"], d["frames"]) for d in downs],
                      [d["touch"] for d in slow] or None,
                      None if not slow else "snap the foot flat within 1 to 2 frames of touch-down",
                      downs, "Camporota ynXadXE9UjU 00:09:26 (almost in one frame); digest gate: at most 1 or 2")
            peels = []
            for lo in ev["liftoffs"]:
                i0, i1 = idx[lo["last"]], idx[lo["first_air"]]
                ang = peel_angle(W[js[-2]][i1], W[js[-1]][i1], W[js[-1]][i0])
                peels.append((lo["first_air"], round(ang, 1)))
            if peels:
                bad = [p for p in peels if p[1] > 30.0]           # degrees [added]
                _gate(rows, "peel_off_%s" % side, "pass" if not bad else "warn",
                      "toe direction vs takeoff point on the first airborne frame: %s deg" % peels,
                      [p[0] for p in bad] or None,
                      None if not bad else "rotate the foot so the toe tip points back to where it left the ground",
                      {"liftoffs": ev["liftoffs"], "angles": peels},
                      "Elver jzuxAmadcm8 00:10:32, 00:11:04; threshold [added]")
    # pre-landing stretch
    if ch and air and feet and cog in W:
        a0, a1 = float(air[0]), float(air[1])
        airf = [f for f in F if a0 <= f <= a1]
        if len(airf) >= 3:
            apex = max(airf, key=lambda f: ch[idx[f]])

            def reach(f):
                i = idx[f]
                low = min((W[j][i] for js in feet.values() for j in js if j in W), key=lambda p: p[up])
                return _dist(W[cog][i], low)

            last = a1 - 1.0 if (a1 - 1.0) in idx else a1
            ok = reach(last) > reach(apex)
            _gate(rows, "pre_landing_stretch", "pass" if ok else "warn",
                  "COG-to-foot at frame %s %.1f vs apex %.1f" % (last, reach(last), reach(apex)), (apex, last),
                  None if ok else "legs reach for the ground on the last air key",
                  source="Camporota FA7fPB7qUhE 00:02:32")
    # spikes and turns on the tracked parts
    for n in plan.get("track", []):
        if n not in W:
            continue
        rep = motion_report(W[n], F, fps, contacts=impact_frames)
        st = "pass" if not rep["spikes"] else "warn"
        _gate(rows, "spikes_%s" % n, st, "%d acceleration spikes outside contacts" % len(rep["spikes"]),
              [s[0] for s in rep["spikes"]][:10], None if st == "pass" else
              "one-frame pops: 3 frames on an arc plus a small overshoot (Elver 01:02:04)",
              {"sharp_turns": rep["sharp_turns"][:10]}, "Elver jzuxAmadcm8 01:02:04; thresholds [added]")
    # overlap down the chain
    chain = [n for n in plan.get("chain", []) if n in W]
    if len(chain) >= 2:
        sig = {n: [_dist(W[n][i + 1], W[n][i]) for i in range(len(F) - 1)] for n in chain}
        ov = overlap_report(sig, chain, mode="value")
        st = "warn" if ov["flags"] else "pass"
        _gate(rows, "overlap", st, "lags %s" % [(p["leader"], p["follower"], p["lag"]) for p in ov["pairs"]],
              None, None if st == "pass" else "offset followers 1 to 2 frames (keyframe timeChange)",
              ov, "Camporota ynXadXE9UjU 00:22:33; Neistadt ZYKAMCZq2UI 00:09:34")
    # dead stop at the end
    tr = {n: W[n] for n in (plan.get("track") or []) if n in W}
    if tr and heavy:
        dh = dead_holds(tr, F, 0.01 / cm, 6)
        end_dead = [d for d in dh if d[1] >= F[-1] - 1e-6]
        _gate(rows, "moving_hold", "pass" if not end_dead else "warn",
              "dead hold at the end: %s" % (end_dead or "none"), end_dead[0][:2] if end_dead else None,
              None if not end_dead else "keep a moving hold: small drift, breath, no dead stop",
              source="Elver jzuxAmadcm8 00:54:54; Newman TIBzcsOt2FU 00:10:34")
    # key hygiene
    if samples.get("keys") and stage in ("spline", "polish"):
        t = pose_to_pose_tell(samples["keys"])
        st = "warn" if t["shared_fraction"] > 0.9 and t["controls"] >= 3 else "pass"
        _gate(rows, "pose_to_pose_tell", st, "%.0f%% of keys on times shared by 90%% of controls" % (
            100 * t["shared_fraction"]), None,
            None if st == "pass" else "break it up: offsets, overlap, not every control on every key",
            t, "Neistadt GMTet6nd_iM 00:07:02")
    if samples.get("subframe_keys") is not None:
        n = int(samples["subframe_keys"])
        _gate(rows, "subframes", "pass" if n == 0 else "warn", "%d keys on sub-frames" % n, None,
              None if n == 0 else "snap_subframes() (Dope Sheet Time Snap is off by default since 2025.1)",
              source="version deltas 2.4; Neistadt G49wexNmQ-Q 00:29:34")
    if samples.get("layers") is not None:
        lay = samples["layers"]
        st = "pass" if not lay else ("fail" if stage == "polish" else "warn")
        _gate(rows, "layers", st, "animation layers: %s" % (lay or "none"), None,
              None if not lay else "merge with Smart Bake, then clean on the base layer (merge_layer)",
              source="Elver jzuxAmadcm8 00:49:20; Newman 5RmqWjfU80s 00:07:24")
    summ = {}
    for r in rows:
        summ[r["status"]] = summ.get(r["status"], 0) + 1
    return {"gates": rows, "summary": summ, "ok": not any(r["status"] == "fail" for r in rows)}


def format_gates(result):
    lines = ["gates: %s" % result["summary"]]
    for r in result["gates"]:
        lines.append("%-5s %-22s %s%s%s" % (r["status"].upper(), r["id"], r["message"],
                                            (" frames %s" % (r["frames"],)) if r["frames"] else "",
                                            (" -> %s" % r["fix"]) if r["fix"] else ""))
    return "\n".join(lines)


# =========================================================================== Maya layer
# Everything below imports maya.cmds lazily and is NOT YET RUN IN MAYA.
def _cmds():
    import maya.cmds as cmds
    return cmds


def _aslist(x):
    if x is None:
        return []
    return [x] if isinstance(x, str) else list(x)


def _one(x, default=None):
    if isinstance(x, (list, tuple)):
        return x[0] if x else default
    return default if x is None else x


def scene_fps():
    """Frames per second of the scene's time unit (film 24, ntsc 30, '<n>fps' units)."""
    unit = _cmds().currentUnit(q=True, time=True)
    if unit in FPS_UNITS:
        return FPS_UNITS[unit]
    m = re.match(r"^([\d.]+)fps$", unit or "")
    return float(m.group(1)) if m else None


def scene_unit():
    return _cmds().currentUnit(q=True, linear=True)


def _suspend(on):
    cmds = _cmds()
    try:
        if not cmds.about(batch=True):
            cmds.refresh(suspend=on)
            return True
    except Exception:
        pass
    return False


def plugs(nodes, attrs=None, animated_only=True):
    """[(plug, animCurve or None)] for the keyable attributes of nodes (visibility skipped
    unless named). With animation layers present the curve is the one keyframe -query
    returns for the plug [verify which layer]."""
    cmds = _cmds()
    out = []
    for n in _aslist(nodes):
        names = _aslist(attrs) or [a for a in (cmds.listAttr(n, keyable=True) or []) if a not in SKIP_ATTRS]
        for a in names:
            plug = "%s.%s" % (n, a)
            if not cmds.objExists(plug):
                continue
            crv = cmds.keyframe(n, attribute=a, query=True, name=True) or []
            if crv or not animated_only:
                out.append((plug, crv[0] if crv else None))
    return out


def _split(plug):
    node, attr = plug.rsplit(".", 1)
    return node, attr


def set_key_defaults(mode="blocking", weighted=None):
    """Global tangent defaults for NEW keys. blocking: in linear, out step (stepped playback;
    the in tangent does not show while the previous key steps [added]); spline: auto/auto;
    or pass (itt, ott). Returns the previous defaults for restore_key_defaults(). The 2027
    default is Auto Span (Legacy) per one doc line and Clamped per another: this QUERY is
    the truth [verify token returned for Auto Span]."""
    cmds = _cmds()
    prev = {"itt": _one(cmds.keyTangent(q=True, g=True, inTangentType=True)),
            "ott": _one(cmds.keyTangent(q=True, g=True, outTangentType=True))}
    try:
        prev["weighted"] = bool(_one(cmds.keyTangent(q=True, g=True, weightedTangents=True)))
    except Exception:
        prev["weighted"] = None
    itt, ott = {"blocking": ("linear", "step"), "spline": ("auto", "auto")}.get(mode, mode)
    cmds.keyTangent(g=True, inTangentType=itt, outTangentType=ott)
    if weighted is not None:
        cmds.keyTangent(g=True, weightedTangents=bool(weighted))
    return prev


def restore_key_defaults(prev):
    cmds = _cmds()
    if prev.get("itt") and prev.get("ott"):
        cmds.keyTangent(g=True, inTangentType=prev["itt"], outTangentType=prev["ott"])
    if prev.get("weighted") is not None:
        cmds.keyTangent(g=True, weightedTangents=prev["weighted"])


def key_pose(pose, frame, stepped=True, fill=None):
    """Key a pose {node: {attr: value}} at frame without changing the current time. fill:
    nodes whose OTHER keyable attributes also get a key at their evaluated value (the pose
    column: Wade keys every control on every key pose). Returns the number of keys set."""
    cmds = _cmds()
    kw = {"outTangentType": "step"} if stepped else {}
    n = 0
    for node, attrs in pose.items():
        for a, v in attrs.items():
            cmds.setKeyframe(node, attribute=a, time=frame, value=float(v), **kw)
            n += 1
    for node in _aslist(fill):
        done = set((pose.get(node) or {}).keys())
        for plug, _ in plugs(node, animated_only=False):
            a = _split(plug)[1]
            if a in done:
                continue
            v = cmds.getAttr(plug, time=frame)
            if isinstance(v, (list, tuple)):
                continue
            cmds.setKeyframe(node, attribute=a, time=frame, value=float(v), **kw)
            n += 1
    return n


def key_hold(nodes, start, end, stepped=True, attrs=None):
    """Closing key of a hold: every animated plug keyed at `end` with its value at `start`,
    so splining cannot drift through the hold (Blender Studio's 'pillars'; Wade's holds
    are a key category)."""
    cmds = _cmds()
    kw = {"outTangentType": "step"} if stepped else {}
    n = 0
    for plug, crv in plugs(nodes, attrs):
        node, a = _split(plug)
        v = cmds.getAttr(plug, time=start)
        cmds.setKeyframe(node, attribute=a, time=end, value=float(v), **kw)
        n += 1
    return n


def insert_key(node, attr, frame):
    """Key without reshaping the curve (setKeyframe insert=True). Inside a stepped range the
    new key copies the previous key's step out tangent, as animBot's smart key does; native
    S reshapes neighbours (Wade G49wexNmQ-Q 00:06:22, TMSpauVphNs 00:02:18)."""
    cmds = _cmds()
    crv = _one(cmds.keyframe(node, attribute=attr, query=True, name=True))
    if not crv:
        cmds.setKeyframe(node, attribute=attr, time=frame)
        return "created"
    times = cmds.keyframe(crv, query=True, timeChange=True) or []
    if any(abs(t - frame) < 1e-6 for t in times):
        return "exists"
    prev = [t for t in times if t < frame]
    cmds.setKeyframe(node, attribute=attr, time=frame, insert=True)
    if prev:
        ott = _one(cmds.keyTangent(crv, query=True, time=(prev[-1], prev[-1]), outTangentType=True))
        if ott in ("step", "stepnext"):
            cmds.keyTangent(crv, edit=True, time=(frame, frame), outTangentType=ott)
    return "inserted"


def key_times(nodes, attrs=None):
    """{node: sorted key times over its animated plugs}."""
    cmds = _cmds()
    out = {}
    for n in _aslist(nodes):
        ts = set()
        for plug, crv in plugs(n, attrs):
            ts.update(cmds.keyframe(crv, query=True, timeChange=True) or [])
        out[n] = sorted(ts)
    return out


def share_keys(nodes, times=None, include_static=True, attrs=None):
    """Key every plug of nodes at the union of their key times (or `times`), inserting so
    curves keep their shape: pole vectors and floating controls stop drifting across the
    shot once splined (Wade G49wexNmQ-Q 00:21:41). Returns keys added."""
    cmds = _cmds()
    if times is None:
        times = sorted(set(t for ts in key_times(nodes, attrs).values() for t in ts))
    n = 0
    for plug, crv in plugs(nodes, attrs, animated_only=not include_static):
        node, a = _split(plug)
        if crv:
            for t in times:
                if insert_key(node, a, t) == "inserted":
                    n += 1
        else:
            v = cmds.getAttr(plug)
            if isinstance(v, (list, tuple)):
                continue
            for t in times:
                cmds.setKeyframe(node, attribute=a, time=t, value=float(v), outTangentType="step")
                n += 1
    return n


def snapshot(nodes, attrs=None, samples=None):
    """Keys, tangents, weights, locks and infinity of every animated plug, as plain data
    (a buffer curve that survives anything and can be saved as JSON). samples: frames
    (sub-frames allowed) at which the evaluated value is stored too, so curve_diff() can
    prove a keying pass left the curve's shape alone."""
    cmds = _cmds()
    snap = {"curves": [], "fps": scene_fps(), "unit": scene_unit()}
    samples = [float(t) for t in samples] if samples is not None else None
    for plug, crv in plugs(nodes, attrs):
        q = {"query": True}
        rec = {"plug": plug, "curve": crv,
               "times": cmds.keyframe(crv, timeChange=True, **q) or [],
               "values": cmds.keyframe(crv, valueChange=True, **q) or [],
               "itt": cmds.keyTangent(crv, inTangentType=True, **q) or [],
               "ott": cmds.keyTangent(crv, outTangentType=True, **q) or [],
               "ia": cmds.keyTangent(crv, inAngle=True, **q) or [],
               "oa": cmds.keyTangent(crv, outAngle=True, **q) or [],
               "iw": cmds.keyTangent(crv, inWeight=True, **q) or [],
               "ow": cmds.keyTangent(crv, outWeight=True, **q) or [],
               "lock": cmds.keyTangent(crv, lock=True, **q) or [],
               "weighted": bool(_one(cmds.keyTangent(crv, weightedTangents=True, **q), False)),
               "pre": _one(cmds.setInfinity(crv, preInfinite=True, **q)),
               "post": _one(cmds.setInfinity(crv, postInfinite=True, **q))}
        if samples is not None:
            rec["samples"] = [[t, float(cmds.getAttr(plug, time=t))] for t in samples]
        snap["curves"].append(rec)
    return snap


def _write_curve(rec, plug=None, time_offset=0.0, value_scale=1.0, value_pivot=0.0):
    """Replace the keys of `plug` (default rec['plug']) with the snapshot record."""
    cmds = _cmds()
    plug = plug or rec["plug"]
    node, a = _split(plug)
    cmds.cutKey(node, attribute=a, time=(None, None), clear=True)       # all keys since 2022
    times = [t + time_offset for t in rec["times"]]
    vals = [value_pivot + (v - value_pivot) * value_scale for v in rec["values"]]
    for t, v in zip(times, vals):
        cmds.setKeyframe(node, attribute=a, time=t, value=v)
    crv = _one(cmds.keyframe(node, attribute=a, query=True, name=True))
    if not crv:
        return None
    if rec.get("weighted"):
        cmds.keyTangent(crv, edit=True, weightedTangents=True)
    for i, t in enumerate(times):
        tr = (t, t)
        cmds.keyTangent(crv, edit=True, time=tr, lock=False)
        itt, ott = rec["itt"][i], rec["ott"][i]
        for flag, val in (("inTangentType", itt), ("outTangentType", ott)):
            if val and val != "fixed":
                try:
                    cmds.keyTangent(crv, edit=True, time=tr, **{flag: val})
                except Exception:
                    pass
        edits = {}
        if itt == "fixed":
            edits["inAngle"] = math.degrees(math.atan(math.tan(math.radians(rec["ia"][i])) * value_scale))
        if ott == "fixed":
            edits["outAngle"] = math.degrees(math.atan(math.tan(math.radians(rec["oa"][i])) * value_scale))
        if rec.get("weighted") and (itt == "fixed" or ott == "fixed"):
            cmds.keyTangent(crv, edit=True, time=tr, weightLock=False)
            if itt == "fixed":
                edits["inWeight"] = rec["iw"][i]
            if ott == "fixed":
                edits["outWeight"] = rec["ow"][i]
        if edits:
            cmds.keyTangent(crv, edit=True, time=tr, **edits)
        if i < len(rec["lock"]) and rec["lock"][i]:
            cmds.keyTangent(crv, edit=True, time=tr, lock=True)
    kw = {}
    if rec.get("pre"):
        kw["preInfinite"] = rec["pre"]
    if rec.get("post"):
        kw["postInfinite"] = rec["post"]
    if kw:
        cmds.setInfinity(crv, **kw)
    return crv


def restore(snap):
    """Write a snapshot back (every plug in it). Returns the curves written."""
    return [_write_curve(rec) for rec in snap["curves"]]


class stepped_preview(object):
    """Context manager: every key of `nodes` stepped for a playblast, then restored exactly
    (the scripted twin of 2027's Time Slider > Enable Stepped Preview)."""

    def __init__(self, nodes, attrs=None):
        self.nodes, self.attrs, self.snap = nodes, attrs, None

    def __enter__(self):
        cmds = _cmds()
        self.snap = snapshot(self.nodes, self.attrs)
        for rec in self.snap["curves"]:
            cmds.keyTangent(rec["curve"], edit=True, outTangentType="step")
        return self.snap

    def __exit__(self, *exc):
        restore(self.snap)
        return False


def set_tangents(nodes, itt=None, ott=None, time=None, attrs=None):
    cmds = _cmds()
    kw = {}
    if itt:
        kw["inTangentType"] = itt
    if ott:
        kw["outTangentType"] = ott
    if time is not None:
        kw["time"] = tuple(time)
    n = 0
    for plug, crv in plugs(nodes, attrs):
        cmds.keyTangent(crv, edit=True, **kw)
        n += 1
    return n


def to_spline(nodes, tangent="auto", time=None, attrs=None, hold_tangent="flat", eq_tol=1e-4):
    """Stepped to spline on these nodes only (body first, face and eyes stay stepped: Santos,
    Camporota). Holds made of two equal keys get `hold_tangent` on the sides facing the hold,
    so a spline tangent cannot drift through them. tangent: auto (2027 Auto Span family
    [verify token]), spline, clamped, plateau. Returns plugs converted."""
    cmds = _cmds()
    n = 0
    for plug, crv in plugs(nodes, attrs):
        kw = {"time": tuple(time)} if time is not None else {}
        cmds.keyTangent(crv, edit=True, inTangentType=tangent, outTangentType=tangent, **kw)
        if hold_tangent:
            ts = cmds.keyframe(crv, query=True, timeChange=True) or []
            vs = cmds.keyframe(crv, query=True, valueChange=True) or []
            for i in range(len(ts) - 1):
                if time is not None and not (time[0] <= ts[i] <= time[1]):
                    continue
                if abs(vs[i + 1] - vs[i]) <= eq_tol:
                    cmds.keyTangent(crv, edit=True, time=(ts[i], ts[i]), outTangentType=hold_tangent)
                    cmds.keyTangent(crv, edit=True, time=(ts[i + 1], ts[i + 1]), inTangentType=hold_tangent)
        n += 1
    return n


def break_tangent(node, attr, frame, in_angle=None, out_angle=None, in_weight=None, out_weight=None):
    """Break a key's tangents and set angles (degrees) or weights: the hard landing (Newman:
    steep in, flatter out, 'you feel it but you don't really see it')."""
    cmds = _cmds()
    crv = _one(cmds.keyframe(node, attribute=attr, query=True, name=True))
    tr = (frame, frame)
    cmds.keyTangent(crv, edit=True, time=tr, lock=False)
    kw = {}
    for k, v in (("inAngle", in_angle), ("outAngle", out_angle), ("inWeight", in_weight), ("outWeight", out_weight)):
        if v is not None:
            kw[k] = float(v)
    if "inWeight" in kw or "outWeight" in kw:
        cmds.keyTangent(crv, edit=True, time=tr, weightLock=False)
    if kw:
        cmds.keyTangent(crv, edit=True, time=tr, **kw)
    return crv


def weighted_hang(node, attr, contacts, apexes, contact_scale=0.05, apex_scale=1.6):
    """Wade Neistadt's weighted-tangent bounce (TMSpauVphNs 00:06:57): contacts' handles
    collapsed, apex handles flat and long, so height notes never need handle edits. It adds
    hang beyond gravity: a stylization for light or cartoony bodies, not for heavy ones.
    Scales are relative to Maya's current weights [added; weight units [verify]]."""
    cmds = _cmds()
    crv = _one(cmds.keyframe(node, attribute=attr, query=True, name=True))
    cmds.keyTangent(crv, edit=True, weightedTangents=True)
    for t in contacts:
        tr = (t, t)
        cmds.keyTangent(crv, edit=True, time=tr, lock=False)
        cmds.keyTangent(crv, edit=True, time=tr, weightLock=False)
        iw = _one(cmds.keyTangent(crv, query=True, time=tr, inWeight=True))
        ow = _one(cmds.keyTangent(crv, query=True, time=tr, outWeight=True))
        cmds.keyTangent(crv, edit=True, time=tr, inWeight=iw * contact_scale, outWeight=ow * contact_scale)
    for t in apexes:
        tr = (t, t)
        cmds.keyTangent(crv, edit=True, time=tr, weightLock=False)
        iw = _one(cmds.keyTangent(crv, query=True, time=tr, inWeight=True))
        ow = _one(cmds.keyTangent(crv, query=True, time=tr, outWeight=True))
        cmds.keyTangent(crv, edit=True, time=tr, inAngle=0.0, outAngle=0.0,
                        inWeight=iw * apex_scale, outWeight=ow * apex_scale)
    return crv


def ballistic_keys(node, attr, t0, t1, y0=None, y1=None, fps=None, unit=None, tangent="auto"):
    """Key every whole frame between takeoff t0 and landing t1 on a gravity-true parabola
    through the curve's own values at t0 and t1 (or y0, y1). The heavy-body air phase:
    no stylized hang. Values are in the control's own space: the result is gravity-true in
    world only when the control's parents neither scale nor move in the air, so confirm
    with run_gates on the world COG (gate ballistic) [added]. Returns solve_jump()'s dict
    plus the apex frame."""
    cmds = _cmds()
    plug = "%s.%s" % (node, attr)
    fps = fps or scene_fps() or 24.0
    unit = unit or scene_unit()
    y0 = float(cmds.getAttr(plug, time=t0)) if y0 is None else float(y0)
    y1 = float(cmds.getAttr(plug, time=t1)) if y1 is None else float(y1)
    s = solve_jump(y0, y1, t1 - t0, fps, unit)
    for i, v in enumerate(s["values"]):
        f = int(t0) + i
        cmds.setKeyframe(node, attribute=attr, time=f, value=v)
    crv = _one(cmds.keyframe(node, attribute=attr, query=True, name=True))
    if tangent:
        cmds.keyTangent(crv, edit=True, time=(t0 + 1, t1 - 1), inTangentType=tangent, outTangentType=tangent)
    s["apex_frame"] = t0 + s["t_apex"]
    return s


def cycle(nodes, travel=(), attrs=None, tol=1e-3):
    """Loop: pre/post infinity Cycle, Cycle with Offset (cycleRelative) on travelling plugs
    (Camporota loops before polish). Returns seam problems: first and last values differ,
    or the first key's out angle differs from the last key's in angle."""
    cmds = _cmds()
    travel = set(_aslist(travel))
    issues = []
    for plug, crv in plugs(nodes, attrs):
        mode = "cycleRelative" if plug in travel else "cycle"
        cmds.setInfinity(crv, preInfinite=mode, postInfinite=mode)
        ts = cmds.keyframe(crv, query=True, timeChange=True) or []
        vs = cmds.keyframe(crv, query=True, valueChange=True) or []
        if len(ts) < 2:
            continue
        if mode == "cycle" and abs(vs[0] - vs[-1]) > tol:
            issues.append((plug, "values", vs[0], vs[-1]))
        oa = _one(cmds.keyTangent(crv, query=True, time=(ts[0], ts[0]), outAngle=True))
        ia = _one(cmds.keyTangent(crv, query=True, time=(ts[-1], ts[-1]), inAngle=True))
        if oa is not None and ia is not None and abs(oa - ia) > 0.5:
            issues.append((plug, "tangent", oa, ia))
    return issues


def offset_keys(nodes, frames, attrs=None, time=None):
    """Shift keys by `frames` (overlap offsets: arm chain 0, 1, 2; head 1; Camporota)."""
    cmds = _cmds()
    kw = {"time": tuple(time)} if time is not None else {}
    n = 0
    for plug, crv in plugs(nodes, attrs):
        cmds.keyframe(crv, edit=True, relative=True, timeChange=float(frames), option="over", **kw)
        n += 1
    return n


def snap_subframes(nodes, attrs=None):
    """Move keys on sub-frames to whole frames; where two keys compete for one frame, keep
    one key with the curve's value at that frame (Maya's snap refuses collisions: Wade
    G49wexNmQ-Q 00:30:07). Returns {moved, merged}."""
    cmds = _cmds()
    moved = merged = 0
    for plug, crv in plugs(nodes, attrs):
        ts = cmds.keyframe(crv, query=True, timeChange=True) or []
        groups = {}
        for t in ts:
            groups.setdefault(int(round(t)), []).append(t)
        for ti, grp in sorted(groups.items()):
            if len(grp) == 1 and abs(grp[0] - ti) < 1e-6:
                continue
            node, a = _split(plug)
            if len(grp) > 1:
                v = float(cmds.getAttr(plug, time=ti))
                for t in grp:
                    cmds.cutKey(crv, time=(t, t), clear=True)
                cmds.setKeyframe(node, attribute=a, time=ti, value=v)
                merged += 1
            else:
                cmds.keyframe(crv, edit=True, time=(grp[0], grp[0]), absolute=True,
                              timeChange=float(ti), option="over")
                moved += 1
    return {"moved": moved, "merged": merged}


def retime(nodes, start, end, delta, attrs=None, snap=True):
    """Tighten (delta < 0) or loosen a section in place: keys inserted at both ends, the
    section scaled about `start`, everything after `end` shifted (Elver's Dope Sheet retime,
    jzuxAmadcm8 00:16:44). Returns the snap report."""
    cmds = _cmds()
    for plug, crv in plugs(nodes, attrs):
        node, a = _split(plug)
        insert_key(node, a, start)
        insert_key(node, a, end)
    s = (end - start + delta) / float(end - start)
    tail = (end + 1e-4, 1e7)
    if delta > 0:
        offset_keys(nodes, delta, attrs, time=tail)
    for plug, crv in plugs(nodes, attrs):
        cmds.scaleKey(crv, time=(start, end), timeScale=s, timePivot=start)
    if delta < 0:
        offset_keys(nodes, delta, attrs, time=tail)
    return snap_subframes(nodes, attrs) if snap else None


def scale_curve(node, attr, factor, pivot=None, time=None):
    """The exaggeration dial: scale a curve's values about a pivot (Camporota scales the
    bounce and the hip tilt down instead of re-keying; first passes overdo the anticipation,
    FA7fPB7qUhE 00:03:46, so dial the crouch back with time=(crouch_start, push_start) and
    the rest value as pivot). Pivot default: first key value. time: only keys in that range."""
    cmds = _cmds()
    crv = _one(cmds.keyframe(node, attribute=attr, query=True, name=True))
    if pivot is None:
        pivot = _one(cmds.keyframe(crv, query=True, valueChange=True))
    kw = {"time": (float(time[0]), float(time[1]))} if time is not None else {}
    cmds.scaleKey(crv, valueScale=float(factor), valuePivot=float(pivot), **kw)
    return crv


def copy_curve(src, src_attr, dst, dst_attr=None, value_scale=1.0, value_pivot=0.0, time_offset=0.0):
    """Connection by curve copy (Santos S1MRs3XJVPI 00:37:40): mouth corner onto nostril,
    cheek, lid or brow, dampened and offset by a frame. No clipboard involved."""
    snap = snapshot(src, [src_attr])
    if not snap["curves"]:
        raise ValueError("%s.%s has no curve" % (src, src_attr))
    return _write_curve(snap["curves"][0], "%s.%s" % (dst, dst_attr or src_attr),
                        time_offset, value_scale, value_pivot)


def keep_extremes(node, attr, start, end):
    """Mocap re-edit (Newman JzwfomndbMA 00:10:07): delete the keys between start and end
    except the local extremes, so the span can be re-timed by hand. Returns keys cut."""
    cmds = _cmds()
    crv = _one(cmds.keyframe(node, attribute=attr, query=True, name=True))
    ts = cmds.keyframe(crv, query=True, time=(start, end), timeChange=True) or []
    vs = cmds.keyframe(crv, query=True, time=(start, end), valueChange=True) or []
    keep = set(extreme_indices(vs))
    n = 0
    for i, t in enumerate(ts):
        if i not in keep:
            cmds.cutKey(crv, time=(t, t), clear=True)
            n += 1
    return n


def euler_filter(nodes):
    """Euler filter on the rotation curves of nodes (after merges, bakes, tweens, mocap)."""
    cmds = _cmds()
    curves = [c for p, c in plugs(nodes) if c and _split(p)[1] in ("rotateX", "rotateY", "rotateZ")]
    if curves:
        cmds.filterCurve(curves, filter="euler")        # [verify filter token]
    return curves


def sample_matrices(nodes, frames, method="currentTime"):
    """World matrices (16 floats) per node per frame. method currentTime: moves time and
    reads xform (robust with IK, constraints and the Evaluation Manager); 'time': getAttr
    worldMatrix at a time, faster [verify equality on rigs in test_sampling_contacts]."""
    cmds = _cmds()
    frames = list(frames)
    out = {n: [] for n in _aslist(nodes)}
    if method == "time":
        for f in frames:
            for n in out:
                out[n].append(list(cmds.getAttr(n + ".worldMatrix[0]", time=f)))
        return out
    cur = cmds.currentTime(query=True)
    sus = _suspend(True)
    try:
        for f in frames:
            cmds.currentTime(f, update=True)
            for n in out:
                out[n].append(list(cmds.xform(n, query=True, worldSpace=True, matrix=True)))
    finally:
        cmds.currentTime(cur, update=True)
        if sus:
            _suspend(False)
    return out


def sample_world(nodes, frames, method="currentTime"):
    """{node: [(x, y, z)]} world positions per frame (scene units)."""
    mats = sample_matrices(nodes, frames, method)
    return {n: [(m[12], m[13], m[14]) for m in ms] for n, ms in mats.items()}


def sample_attrs(plug_names, frames):
    cmds = _cmds()
    return {p: [cmds.getAttr(p, time=f) for f in frames] for p in _aslist(plug_names)}


def sample_curves(nodes, frames, attrs=None):
    """[(plug, [(frame, value)])] of the animated plugs, for curve_lanes_png."""
    cmds = _cmds()
    frames = list(frames)
    return [(plug, [(f, float(cmds.getAttr(plug, time=f))) for f in frames]) for plug, _ in plugs(nodes, attrs)]


def plug_keys(nodes, attrs=None):
    """{plug: (times, values)} for tween_fractions, overshoots and pose checks."""
    cmds = _cmds()
    return {plug: (cmds.keyframe(crv, query=True, timeChange=True) or [],
                   cmds.keyframe(crv, query=True, valueChange=True) or []) for plug, crv in plugs(nodes, attrs)}


def subframe_keys(nodes, attrs=None):
    return sum(1 for ts, _ in plug_keys(nodes, attrs).values() for t in ts if abs(t - round(t)) > 1e-6)


def _camera(cam):
    cmds = _cmds()
    if cmds.nodeType(cam) == "camera":
        return cmds.listRelatives(cam, parent=True, fullPath=True)[0], cam
    shape = (cmds.listRelatives(cam, shapes=True, type="camera", fullPath=True) or [None])[0]
    if not shape:
        raise ValueError("%s is not a camera" % cam)
    return cam, shape


def camera_track(nodes, camera, frames, res=None, method="currentTime"):
    """Screen-space tracks in pixels through a camera (Elver: judge arcs and momentum in
    camera space; a perfect 3D arc can fail on screen). Returns {res, frames, tracks}."""
    cmds = _cmds()
    xf, shape = _camera(camera)
    frames = list(frames)
    if res is None:
        res = (int(cmds.getAttr("defaultResolution.width")), int(cmds.getAttr("defaultResolution.height")))
    mats = sample_matrices(list(_aslist(nodes)) + [xf], frames, method)
    cam_m = mats.pop(xf)
    fit = cmds.getAttr(shape + ".filmFit")
    hfa, vfa = cmds.getAttr(shape + ".horizontalFilmAperture"), cmds.getAttr(shape + ".verticalFilmAperture")
    ortho = cmds.getAttr(shape + ".orthographic")
    ow = cmds.getAttr(shape + ".orthographicWidth") if ortho else None
    tracks = {n: [] for n in mats}
    for i, f in enumerate(frames):
        inv = _mat_inverse(cam_m[i])
        focal = cmds.getAttr(shape + ".focalLength", time=f)
        for n, ms in mats.items():
            m = ms[i]
            tracks[n].append(project_point((m[12], m[13], m[14]), inv, focal, hfa, vfa, res, fit, ow))
    return {"res": res, "frames": frames, "tracks": tracks}


def _tag(node, value="helper"):
    cmds = _cmds()
    if not cmds.attributeQuery(TAG_ATTR, node=node, exists=True):
        cmds.addAttr(node, longName=TAG_ATTR, dataType="string")
    cmds.setAttr(node + "." + TAG_ATTR, value, type="string")


def delete_helpers():
    """Delete every node this module created (tagged with mxAnimTag)."""
    cmds = _cmds()
    nodes = cmds.ls("*." + TAG_ATTR, objectsOnly=True, long=True) or []
    gone = []
    for n in sorted(nodes, key=len):              # parents first; their tagged children go with them
        if cmds.objExists(n):
            cmds.delete(n)
            gone.append(n)
    return gone


def cog_proxy(ctrl, radius=8.0, name="mxAnim_cogBall"):
    """Elver's bouncing-ball check (jzuxAmadcm8 00:06:34): a sphere parent-constrained to the
    COG without offset. Hide the character and judge the ball, or sample it."""
    cmds = _cmds()
    ball = cmds.polySphere(radius=radius, name=name)[0]
    con = cmds.parentConstraint(ctrl, ball, maintainOffset=False)[0]
    _tag(ball)
    return ball, con


def proxy_boxes(name="mxAnim_proxy", hip_height=100.0, body=(30.0, 60.0, 20.0), head=20.0):
    """Camporota's two boxes (FA7fPB7qUhE 00:00:38): prove timing and spacing before posing.
    The root transform sits at hip height (pivot of the lean); key translateY/Z, rotateX."""
    cmds = _cmds()
    root = cmds.group(empty=True, name=name)
    b = cmds.polyCube(width=body[0], height=body[1], depth=body[2], name=name + "_body")[0]
    cmds.move(0, body[1] / 2.0, 0, b + ".vtx[*]", relative=True)
    h = cmds.polyCube(width=head, height=head, depth=head, name=name + "_head")[0]
    cmds.move(0, body[1] + head / 2.0 + 2.0, 0, h + ".vtx[*]", relative=True)
    cmds.parent(b, root)
    cmds.parent(h, b)
    cmds.setAttr(root + ".translateY", hip_height)
    for n in (root, b, h):
        _tag(n)
    return {"root": root, "body": b, "head": h}


def layer_audit():
    """Animation layers and their state. Flags: layers present (merge before polish and
    handoff: Elver, Newman), unmuted empty Override layers (doc: invalid poses), weights
    other than 0 or 1."""
    cmds = _cmds()
    root = cmds.animLayer(query=True, root=True)
    rows, flags = [], []
    for lyr in cmds.ls(type="animLayer") or []:
        if lyr == root:
            continue
        r = {"layer": lyr}
        for k in ("mute", "lock", "solo", "weight", "override", "passthrough"):
            try:
                r[k] = cmds.animLayer(lyr, query=True, **{k: True})
            except Exception as exc:
                r[k] = "error: %s" % exc
        r["attributes"] = len(cmds.animLayer(lyr, query=True, attribute=True) or [])
        r["curves"] = len(cmds.animLayer(lyr, query=True, animCurves=True) or [])
        rows.append(r)
        if r.get("override") is True and not r.get("mute") and r["curves"] == 0:
            flags.append("%s: unmuted empty Override layer" % lyr)
        w = r.get("weight")
        if isinstance(w, (int, float)) and w not in (0.0, 1.0):
            flags.append("%s: weight %s" % (lyr, w))
    if rows:
        flags.insert(0, "%d animation layer(s) present" % len(rows))
    return {"root": root, "layers": rows, "flags": flags}


def layer_try(nodes, name, marker_frames, attrs=None, override=False):
    """Newman's layer protocol (5RmqWjfU80s 00:03:08 to 00:05:07): a layer holding only the
    idea's controls, keyed before anything moves at every frame you plan to change, the last
    marker being the protective key ('don't mess with anything after this'). On an Additive
    layer these keys are zero offsets. Returns the layer."""
    cmds = _cmds()
    lyr = cmds.animLayer(name, override=bool(override))
    plug_list = [p for p, _ in plugs(nodes, attrs, animated_only=False)]
    cmds.animLayer(lyr, edit=True, attribute=plug_list)                   # [verify flag]
    for f in marker_frames:
        for p in plug_list:
            node, a = _split(p)
            cmds.setKeyframe(node, attribute=a, time=f, animLayer=lyr)     # [verify flag]
    return lyr


def layer_offset(layer, node, attr, frame, value):
    """Key an offset (Additive) or a value (Override) on a layer at a marker frame."""
    _cmds().setKeyframe(node, attribute=attr, time=frame, value=float(value), animLayer=layer)


def merge_layer(layer, start, end, delete=True):
    """Merge a layer down with a smart bake (Newman: never clean curves on a layer; merge with
    Smart Bake or every frame gets a key and 'looks like mocap'). bakeResults onto the base
    layer; the smart flag's argument shape is tried in order [verify]. Returns key counts."""
    cmds = _cmds()
    root = cmds.animLayer(query=True, root=True)
    plug_list = cmds.animLayer(layer, query=True, attribute=True) or []
    base = dict(time=(start, end), simulation=False, destinationLayer=root,
                removeBakedAnimFromLayer=True, preserveOutsideKeys=True, minimizeRotation=True)
    errors, used = [], "none"
    for smart in ([True, 5.0], True, None):
        kw = dict(base)
        if smart is not None:
            kw["smart"] = smart
        try:
            cmds.bakeResults(plug_list, **kw)
            used = smart
            break
        except Exception as exc:
            errors.append("smart=%r: %s" % (smart, exc))
    if used == "none":
        raise RuntimeError("bakeResults failed: %s" % errors)
    if delete and cmds.objExists(layer):
        cmds.delete(layer)
    counts = {}
    for p in plug_list:
        node, a = _split(p)
        counts[p] = cmds.keyframe(node, attribute=a, query=True, keyframeCount=True) or 0
    nodes = sorted(set(_split(p)[0] for p in plug_list))
    euler_filter(nodes)
    return {"smart": used, "errors": errors, "keys": counts, "frames": end - start + 1}


def bake_track(prop, driver, start, end, maintain_offset=True):
    """Prop carried by a hand over a range only (Newman's track-and-stabilize, t-YsIXaPvEg
    00:10:45): constraint with offset, bake the range, delete the constraint, Euler filter.
    The release and the free flight are then keyed by hand."""
    cmds = _cmds()
    con = cmds.parentConstraint(driver, prop, maintainOffset=maintain_offset)[0]
    try:
        cmds.bakeResults(prop, time=(start, end), simulation=True,
                         attribute=["tx", "ty", "tz", "rx", "ry", "rz"],
                         preserveOutsideKeys=True, minimizeRotation=True)
    finally:
        cmds.delete(con)
    euler_filter(prop)
    return cmds.keyframe(prop, query=True, keyframeCount=True)


def store_plan(plan):
    """Keep the shot plan in the scene (network node, string attribute): the beats, key
    categories, contacts and windows the gates check. Returns the node."""
    cmds = _cmds()
    node = PLAN_NODE if cmds.objExists(PLAN_NODE) else cmds.createNode("network", name=PLAN_NODE)
    if not cmds.attributeQuery("planJson", node=node, exists=True):
        cmds.addAttr(node, longName="planJson", dataType="string")
    cmds.setAttr(node + ".planJson", json.dumps(plan), type="string")
    return node


def load_plan():
    cmds = _cmds()
    if not cmds.objExists(PLAN_NODE):
        return None
    return json.loads(cmds.getAttr(PLAN_NODE + ".planJson") or "null")


def run_gates(plan, method="currentTime"):
    """Sample the scene and evaluate the plan's gates (see evaluate_gates). plan keys:
      range [start, end]; fps; style heavy|realistic|cartoony|acting; stage blocking|spline|
      polish; cog (node sampled as the body's ball); feet {side: [heel, ball, toe joints]};
      ground number or [[start, end, height]]; rest_frame (planted foot heights measured
      there) or foot_offsets {joint: height}; air [takeoff, landing]; push window; crouch
      window or list of windows (every anticipation that goes down); impacts [landing
      frames] (default air[1]); foot_roll [rig plugs, e.g. L_foot_ctrl.footRoll] (else the
      heel-to-toe pitch is read); spine (node that must drag, default chain[0]); chain
      [leader ... follower]; track [nodes for spikes and the moving-hold check]; controls
      [animated controls for key checks]; camera (for review_images)."""
    cmds = _cmds()
    frames = list(range(int(plan["range"][0]), int(plan["range"][1]) + 1))
    nodes = []
    for n in [plan.get("cog"), plan.get("spine")] + [j for js in (plan.get("feet") or {}).values() for j in js] + \
            list(plan.get("chain", [])) + list(plan.get("track", [])):
        if n and n not in nodes and cmds.objExists(n):
            nodes.append(n)
    ctrls = [c for c in plan.get("controls", []) if cmds.objExists(c)]
    samples = {"frames": frames, "fps": scene_fps(), "scene_fps": scene_fps(), "unit": scene_unit(),
               "up": 2 if cmds.upAxis(query=True, axis=True) == "z" else 1,
               "world": sample_world(nodes, frames, method),
               "layers": [r["layer"] for r in layer_audit()["layers"]]}
    roll = [p for p in plan.get("foot_roll") or [] if cmds.objExists(p)]
    if roll:
        samples["attrs"] = sample_attrs(roll, frames)
    if ctrls:
        samples["keys"] = key_times(ctrls)
        samples["subframe_keys"] = subframe_keys(ctrls)
    res = evaluate_gates(samples, plan)
    res["sampled"] = nodes
    return res


def review_images(plan, out_dir, view="side", method="currentTime"):
    """Headless eyes: curves.png (stacked lanes of plan['controls']) and tracks.png
    (projected tracks with stick figures at plan['poses'] frames through plan['camera'],
    or a schematic side view when there is no camera). Returns the paths."""
    cmds = _cmds()
    frames = list(range(int(plan["range"][0]), int(plan["range"][1]) + 1))
    out = {}
    ctrls = [c for c in plan.get("controls", []) if cmds.objExists(c)]
    if ctrls:
        pk = plug_keys(ctrls)
        spans = []
        if plan.get("air"):
            spans.append((plan["air"][0], plan["air"][1], "air"))
        out["curves"] = curve_lanes_png(os.path.join(out_dir, "curves.png"), sample_curves(ctrls, frames),
                                        keys={p: ts for p, (ts, _) in pk.items()}, spans=spans,
                                        marks=plan.get("poses", []), title=plan.get("name", "curves"))["path"]
    names = [n for n in [plan.get("cog")] + list(plan.get("track", [])) +
             [j for js in (plan.get("feet") or {}).values() for j in js] if n and cmds.objExists(n)]
    names = list(dict.fromkeys(names))
    if names:
        bones = [tuple(b) for b in plan.get("bones", [])]
        extra = [n for b in bones for n in b if cmds.objExists(n) and n not in names]
        allnames = names + list(dict.fromkeys(extra))
        if plan.get("camera") and cmds.objExists(plan["camera"]):
            ct = camera_track(allnames, plan["camera"], frames, method=method)
            tracks, size = {n: ct["tracks"][n] for n in allnames}, ct["res"]
            if size[0] > 1280:
                k = 1280.0 / size[0]
                size = (1280, int(size[1] * k))
                tracks = {n: [(p[0] * k, p[1] * k) for p in t] for n, t in tracks.items()}
        else:
            size = (960, 540)
            tracks = fit_view(sample_world(allnames, frames, method), view, size)
        shown = {n: tracks[n] for n in names}
        shown.update({n: tracks[n] for n in allnames if n not in shown})
        out["tracks"] = tracks_png(os.path.join(out_dir, "tracks.png"), shown, frames, size, bones,
                                   plan.get("poses", []), title=plan.get("name", "tracks"),
                                   label_every=plan.get("label_every", 6))["path"]
    return out


def playblast_pack(out_dir, start, end, cameras=("shotCam",), silhouette=True, width=1280, height=720):
    """GUI session only (mx_bridge): image-sequence playblasts through each camera, plus a
    no-lights silhouette pass (Camporota's lights-off panel, Elver's hotkey 7). Returns
    {name: first frame path}. displayLights value 'none' [verify]."""
    R = _review()
    cmds = _cmds()
    out = {}
    base = {"displayAppearance": "smoothShaded", "grid": False, "nurbsCurves": False, "joints": False,
            "locators": False, "manipulators": False}
    for cam in cameras:
        if not cmds.objExists(cam):
            continue
        p = os.path.join(out_dir, "%s" % cam.split("|")[-1])
        R.playblast(p, start, end, camera=cam, width=width, height=height, display=dict(base))
        out[cam] = p
        if silhouette:
            d = dict(base, displayLights="none")
            ps = p + "_sil"
            R.playblast(ps, start, end, camera=cam, width=width, height=height, display=d)
            out[cam + "_sil"] = ps
    return out


# =========================================================================== CLI (via mx_run)
def main(argv):
    """mx_run job: --plan plan.json [--out dir] [--view side]. Runs the gates and, with
    --out, writes curves.png, tracks.png and gates.json there."""
    import argparse
    ap = argparse.ArgumentParser(prog="mx_anim")
    ap.add_argument("--plan", required=True)
    ap.add_argument("--out")
    ap.add_argument("--view", default="side")
    a = ap.parse_args(argv)
    with open(a.plan) as f:
        plan = json.load(f)
    res = run_gates(plan)
    if a.out:
        if not os.path.isdir(a.out):
            os.makedirs(a.out)
        res["images"] = review_images(plan, a.out, a.view)
        with open(os.path.join(a.out, "gates.json"), "w") as f:
            json.dump(res, f, indent=1, default=str)
    print(format_gates(res))
    return res
