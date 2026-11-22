# SPDX-License-Identifier: Apache-2.0
"""A part the size of a hand or a foot that pops at a walk loop's wrap, read on the part itself (docs/loop-repair.md
section 2, "The part pop"): the loop is cut as it was, and a part that pops at its wrap is named, a take to film again.

The flow reading reads the loop in windows half the body's box each way (`repair.FLOW_GRID`). A hand that jumps a few
per cent of the body height at the wrap and stays there is a small share of such a window, whose usual step the tail and
the legs passing through it set; a part that jumps once and goes on is half of the flow's `off` (the change of its step);
and a step of the blurred state stops growing once the hand is further than the blur from where it was. So the jump
reads under every limit there — the synthetic walker of tests/video/test_loop_part_pop.py, its fist jumping 3.5 % of
its height back at the wrap, reads 1.46 off the flow at most and no rush — and windows small enough to see the hand read
the loop's ordinary steps over the same limits.

The part reading follows the parts instead (`track`): squares PART_PATCH of the body height on a side, seeded every
PART_PATCH over the body on the loop's first drawing, each found drawing to drawing by normalised cross-correlation of
its luma (alpha weighted over a mid grey) within PART_SEARCH of where it was, at a body height of PART_READ px, to a
fraction of a pixel. A step is counted only where it reads back: the patch where the part landed, looked for in the
drawing before, lands within PART_FOLLOW of where the part was, and no search reached its edge. A part any of whose steps
does not read back — fur whose pattern repeats, an eye that closes, a part whose drawing changes at the wrap — is not
followed, and nothing is read on it.

A part does not move evenly: a tail swings slow, fast and slow again. So a run of one or two steps (`repair.SURGE_SPAN`)
is read against the curve the part's own steps either side of it draw, not against their mean: the `repair.SURGE_AROUND`
steps before it and after it, each a step vector, fitted by a second-degree polynomial in time (least squares, x and y
apart: the local fit of a Savitzky-Golay filter), and the run's steps predicted on it. How far the run's steps leave
their prediction is its `jerk` (`part_runs`). A part that eases steps where the curve goes, however fast; a frame that
jumps does not. A part pops (`pops`) where the run is, all at once:
- at least PART_POP_FLOOR of the body height (its largest step);
- off the curve by at least `repair.SURGE_LIMIT` of the part's usual step: its median step, no less than the median of
  the followed parts' medians (`repair._flow_scale`'s rule, so a part that hardly moves is not read on its noise) nor
  PART_NOISE;
- off it by at least PART_POP_CURVE times the step the curve predicts there (or the curve's own scatter over the steps it
  was fitted to, or PART_NOISE, whichever is larger);
- off it by at least PART_POP_LEAD times the part's largest jerk anywhere else in the loop.
Its way is not read: a part that comes back the next step is `flung`, one that stays where the run put it `stays`.
Tails, hems, hair and feet that move far inside the loop leave their curve as far there too (the lead); a tremor stays
under the floor. Read against the mean of the steps either side instead, as the engine's surge reading reads a window
(6 times it, and 1.5 times the part's largest step elsewhere), a part that eases through a fast stretch of three or four
steps is named; against its curve it is not (docs/loop-repair.md section 2, "The part pop", has the paths measured).

Frames made between two at the wrap do not mend it: the part's jump is still in the clip, spread over a step or two. Nor
is another cut taken for it: this reading reads parts the size of a hand, not the whole body's change at the wrap, and a
cut chosen on it alone is not held to the whole body. So the loop as it plays is read here, and a pop is named
(`part_pop`) and recorded a take to film again (video-loop's `retake`, reason `part-pop`)."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from PIL import Image

from sprite_gen._deps import np
from sprite_gen.video import repair

PART_READ = 400  # px: the body height parts are read at
PART_PATCH = 0.08  # of the body height: a part's square, seeded every PART_PATCH over the body
PART_SEARCH = 0.08  # of the body height: how far a part is looked for from where it was, either way
PART_SEEN = 0.15  # a square less covered than this is background, not a part
PART_TEXTURE = 0.02  # a square whose luma varies less than this (std) has nothing to follow
PART_FOLLOW = 1.5  # px at PART_READ: a step read back lands within this of where the part was, or the part is not followed
PART_NOISE = 0.5  # px at PART_READ: the least usual step a part is read against
PART_POP_FLOOR = 0.02  # of the body height: a pop's largest step at least this
PART_POP_CURVE = 5.0  # a pop's jerk at least this many times the step the curve of the steps either side predicts there
PART_POP_LEAD = 2.0  # ... and this many times the part's largest jerk anywhere else in the loop
PART_FLUNG = 0.5  # the step after a pop taking back this share of it, or the pop this share of the step before: flung
PART_MIN_DRAWINGS = 2 * repair.SURGE_AROUND + repair.SURGE_SPAN  # a run and the steps either side, none shared


def body_rows(frames: list[Image.Image], box: tuple[int, int, int, int]) -> int:
    """The body's height over the loop inside `box`, px: from the highest row any frame covers to the lowest (alpha over
    a tenth, as the flow reading reads it)."""
    rows = np.where(np.max([np.asarray(f.crop(box).getchannel("A")).max(axis=1) for f in frames], axis=0) > 25)[0]
    return int(rows.max() - rows.min()) if rows.size else 0


def _plane(frame: Image.Image, box: tuple[int, int, int, int], size: tuple[int, int], pad: int) -> tuple[np.ndarray, np.ndarray]:
    """A drawing as the parts are followed on it: its luma over a mid grey by its coverage, and its coverage, inside
    `box`, averaged down to `size` and padded by `pad` (grey, nothing covered)."""
    x = np.asarray(frame.crop(box), dtype=np.float32) / 255.0
    alpha = x[..., 3]
    luma = (x[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)) * alpha + 0.5 * (1 - alpha)

    def small(a: np.ndarray) -> np.ndarray:
        return np.asarray(Image.fromarray(np.ascontiguousarray(a, dtype=np.float32)).resize(size, Image.BOX), dtype=np.float32)

    return np.pad(small(luma), pad, constant_values=0.5), np.pad(small(alpha), pad, constant_values=0.0)


def _found(regions: np.ndarray, templates: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Where each template best matches inside its region by normalised cross-correlation, (m, 2R + P, 2R + P) regions and
    (m, P, P) templates: the offset of the best window from the region's centre, y and x, each to a fraction of a cell on
    the parabola through the correlations either side (none at the region's edge), its correlation, and whether the best
    window is at the region's edge. Read in one transform for every part."""
    m, size, _ = regions.shape
    P = templates.shape[1]
    D = size - P + 1
    R = D // 2
    t = templates.astype(np.float64)
    t -= t.mean(axis=(1, 2), keepdims=True)
    tn = np.sqrt((t * t).sum(axis=(1, 2)))
    r = regions.astype(np.float64)
    num = np.fft.irfft2(np.fft.rfft2(r, s=(size, size)) * np.conj(np.fft.rfft2(t, s=(size, size))), s=(size, size))[:, :D, :D]

    def window_sums(a: np.ndarray) -> np.ndarray:
        c = np.zeros((m, size + 1, size + 1))
        c[:, 1:, 1:] = a.cumsum(axis=1).cumsum(axis=2)
        return c[:, P:, P:] - c[:, :-P, P:] - c[:, P:, :-P] + c[:, :-P, :-P]

    s1, s2 = window_sums(r), window_sums(r * r)
    den = np.sqrt(np.maximum(s2 - s1 * s1 / (P * P), 0.0)) * tn[:, None, None]
    ncc = np.where(den > 1e-9, num / np.where(den > 1e-9, den, 1.0), -1.0)
    flat = ncc.reshape(m, -1).argmax(axis=1)
    iy, ix = flat // D, flat % D
    at = np.arange(m)
    best = ncc[at, iy, ix]

    def bend(lo: np.ndarray, hi: np.ndarray) -> np.ndarray:
        b = lo - 2 * best + hi
        return np.where(b < -1e-9, 0.5 * (lo - hi) / np.where(b < -1e-9, b, -1.0), 0.0)

    inside_x, inside_y = (ix > 0) & (ix < D - 1), (iy > 0) & (iy < D - 1)
    fx = np.where(inside_x, bend(ncc[at, iy, np.maximum(ix - 1, 0)], ncc[at, iy, np.minimum(ix + 1, D - 1)]), 0.0)
    fy = np.where(inside_y, bend(ncc[at, np.maximum(iy - 1, 0), ix], ncc[at, np.minimum(iy + 1, D - 1), ix]), 0.0)
    return iy - R + fy, ix - R + fx, best, ~(inside_x & inside_y)


def track(frames: list[Image.Image], box: tuple[int, int, int, int], body: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """The parts of a loop's drawings `frames` (in play order, the last followed by the first) followed round the loop
    (the module text): per part followed, its `seed` (px of the frame, where it was seeded on the first drawing) and `pts`
    (n + 1 places, (x, y) px at PART_READ inside the padded box, the last the first drawing's again, reached round the
    loop). A part is dropped at its first step that does not read back. Also how the parts were read (`meta`): the scale,
    the square, the search, the padding and how many parts were seeded."""
    s = PART_READ / body
    P = max(8, int(round(PART_PATCH * PART_READ)))
    R = max(4, int(round(PART_SEARCH * PART_READ)))
    pad = R + P + 2
    x0, y0, x1, y1 = box
    size = (max(1, int(round((x1 - x0) * s))), max(1, int(round((y1 - y0) * s))))
    planes = [_plane(f, box, size, pad) for f in frames]
    luma = [p[0] for p in planes]
    H, W = luma[0].shape
    n = len(frames)
    h = P // 2
    seeds = [(cx, cy) for cy in range(pad + h, H - pad - h + 1, P) for cx in range(pad + h, W - pad - h + 1, P)
             if planes[0][1][cy - h:cy - h + P, cx - h:cx - h + P].mean() >= PART_SEEN
             and luma[0][cy - h:cy - h + P, cx - h:cx - h + P].std() >= PART_TEXTURE]
    lo, hi_x, hi_y = R + h + 1, W - R - h - 2, H - R - h - 2

    def search(at: np.ndarray, source: int, target: int) -> tuple[np.ndarray, np.ndarray]:
        """From each place `at` ((m, 2) x, y), the square there in drawing `source` looked for in drawing `target`: where
        it lands and whether the search reached its edge."""
        ix = np.clip(np.round(at[:, 0]), lo, hi_x).astype(int)
        iy = np.clip(np.round(at[:, 1]), lo, hi_y).astype(int)
        templates = np.stack([luma[source][y - h:y - h + P, x - h:x - h + P] for x, y in zip(ix, iy)])
        regions = np.stack([luma[target][y - R - h:y + R + h + (P - 2 * h), x - R - h:x + R + h + (P - 2 * h)] for x, y in zip(ix, iy)])
        dy, dx, _, edge = _found(regions, templates)
        return np.stack([at[:, 0] + dx, at[:, 1] + dy], axis=1), edge

    pts = np.zeros((len(seeds), n + 1, 2))
    pts[:, 0] = np.array(seeds, dtype=float).reshape(-1, 2)
    alive = np.arange(len(seeds))
    for k in range(n):
        if not alive.size:
            break
        landed, edge = search(pts[alive, k], k, (k + 1) % n)
        back, _ = search(landed, (k + 1) % n, k)
        pts[alive, k + 1] = landed
        kept = ~edge & (np.hypot(*(back - pts[alive, k]).T) <= PART_FOLLOW)
        alive = alive[kept]
    kept = set(alive.tolist())
    parts = [{"seed": [int(round(x0 + (sx - pad) / s)), int(round(y0 + (sy - pad) / s))], "pts": pts[i]}
             for i, (sx, sy) in enumerate(seeds) if i in kept]
    return parts, {"scale": s, "patch": P, "search": R, "pad": pad, "seeded": len(seeds)}


def _runs(n: int) -> list[list[int]]:
    """Every run of 1..SURGE_SPAN steps of a ring of `n`, from each step."""
    return [[(d + i) % n for i in range(r)] for r in range(1, repair.SURGE_SPAN + 1) for d in range(n)]


def _curve(run_length: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """For a run of `run_length` steps: the offsets of the SURGE_AROUND steps either side of it from its first step, a
    second-degree polynomial's terms there and its least-squares fit through them (their pseudo-inverse), and its terms at
    the run's own steps."""
    K = repair.SURGE_AROUND
    at = np.array([*range(-K, 0), *range(run_length, run_length + K)], dtype=float)
    inside = np.arange(run_length, dtype=float)
    X = np.stack([at ** 0, at, at * at], axis=1)
    return at.astype(int), X, np.linalg.pinv(X), np.stack([inside ** 0, inside, inside * inside], axis=1)


def part_runs(pts: np.ndarray, usual: float, runs: Iterable[list[int]]) -> list[dict[str, Any]]:
    """The readings of a part's path `pts` (n + 1 places, px) over each of `runs` (step indices, step k from drawing k to
    the next) against the curve the part's steps either side draw (the module text): the SURGE_AROUND steps before the run
    and after it, each a step vector, fitted x and y apart by a second-degree polynomial in time (least squares, the local
    fit of a Savitzky-Golay filter), and the run's steps predicted on it. Per run: its largest step `px`; `jerk`, the mean
    length of its steps off their prediction (px), `predicted`, the mean length of the predicted steps, and `fit`, the
    root mean square of the steps either side off the curve; `speed` (the jerk over `usual`), `curve` (over the larger of
    the predicted step, the fit and PART_NOISE), `lead` (over the part's largest jerk on a run as long whose curve was
    fitted without this run's steps, 0 where the loop holds none); whether it `pops` (the four at their bounds, the floor in px at PART_READ) and its `kind` — `flung` where
    the step after it takes back PART_FLUNG of its move or it takes back that share of the step before, else `stays` —
    with `back`, the larger of those shares."""
    step = np.diff(pts, axis=0)
    m = np.hypot(step[:, 0], step[:, 1])
    n = len(m)
    runs = [list(run) for run in runs]
    read: dict[int, dict[str, np.ndarray]] = {}
    for r in {len(run) for run in runs}:
        at, X, fit_of, terms = _curve(r)
        start = np.arange(n)
        V = step[(start[:, None] + at[None, :]) % n]  # (n, 2K, 2): the steps either side of the run from each step
        coef = np.einsum("pk,nkc->npc", fit_of, V)
        pred = np.einsum("ip,npc->nic", terms, coef)
        own = step[(start[:, None] + np.arange(r)[None, :]) % n]
        scatter = V - np.einsum("kp,npc->nkc", X, coef)
        read[r] = {"jerk": np.hypot(*(own - pred).transpose(2, 0, 1)).mean(axis=1),
                   "predicted": np.hypot(*pred.transpose(2, 0, 1)).mean(axis=1),
                   "fit": np.sqrt((scatter ** 2).sum(axis=2).mean(axis=1))}
    out = []
    for run in runs:
        r = len(run)
        d, e = run[0], run[-1]
        x = read[r]
        jerk = float(x["jerk"][d])
        # elsewhere: a run as long whose curve was fitted without this run's steps — beside it, a run's curve takes some of
        # this run's jump into its fit, and its own jerk with it
        apart = [k for k in range(n) if not {(k + i) % n for i in range(-repair.SURGE_AROUND, r + repair.SURGE_AROUND)} & set(run)]
        # a loop too short to hold a run as long whose curve leaves this one out has nothing to lead: it does not pop
        lead = jerk / max(float(x["jerk"][apart].max()), 1e-9) if apart else 0.0
        speed = jerk / usual
        curve = jerk / max(float(x["predicted"][d]), float(x["fit"][d]), PART_NOISE)
        move = step[run].sum(axis=0)
        size = max(float(np.hypot(*move)), 1e-9)
        back = max(1 - float(np.hypot(*(move + step[(e + 1) % n]))) / size, 1 - float(np.hypot(*(step[(d - 1) % n] + move))) / size)
        largest = float(m[run].max())
        out.append({"steps": run, "px": largest, "jerk": jerk, "predicted": float(x["predicted"][d]), "fit": float(x["fit"][d]),
                    "speed": speed, "curve": curve, "lead": lead,
                    "pops": (largest >= PART_POP_FLOOR * PART_READ and speed >= repair.SURGE_LIMIT and curve >= PART_POP_CURVE
                             and lead >= PART_POP_LEAD),
                    "kind": "flung" if back >= PART_FLUNG else "stays", "back": back})
    return out


def margin(said: dict[str, Any]) -> float:
    """How far a run (`part_runs`) is from popping: the least of its step, speed, curve and lead over their bounds; 1 or
    more pops."""
    return min(said["px"] / (PART_POP_FLOOR * PART_READ), said["speed"] / repair.SURGE_LIMIT, said["curve"] / PART_POP_CURVE,
               said["lead"] / PART_POP_LEAD)


def read(frames: list[Image.Image], *, drawings: tuple[list[list[int]], int] | None = None,
         steps: Iterable[int] | None = None) -> dict[str, Any]:
    """The part reading of a loop as it plays (the module text), on its drawings (`repair.flow_drawings`, or `drawings`
    (runs, hold) given): the parts seeded and followed, and per followed part the runs of one or two steps that touch
    `steps` (step indices on the drawings; the wrap, from the last drawing to the first, where none are given) — a part
    that pops there is in `pops`, worst first by margin, at most one a part; `nearest`, the run nearest to popping of all.

    Each run as said: the part (`seed`, px of the loop's first frame), the frames it runs `from` and `to` (first frames of
    its drawings), `steps`, `at` (px of the frame it runs from, where the part is), `body_pct` (its largest step),
    `jerk_pct`, `usual_px`, `speed`, `curve`, `lead`, `kind`, `back` and `margin`. A loop of fewer than PART_MIN_DRAWINGS
    drawings is not read (`skipped`)."""
    box = repair.union_box(frames)
    runs, hold = drawings if drawings is not None else repair.flow_drawings(repair.flow_states(frames, box))
    n = len(runs)
    body = body_rows(frames, box)
    record: dict[str, Any] = {"read_px": PART_READ, "patch": PART_PATCH, "search": PART_SEARCH, "follow_px": PART_FOLLOW,
                              "floor": PART_POP_FLOOR, "speed": repair.SURGE_LIMIT, "curve": PART_POP_CURVE,
                              "lead": PART_POP_LEAD, "drawings": n, "hold": hold, "body_px": body, "pops": [], "nearest": None}
    if n < PART_MIN_DRAWINGS or body < 2:
        record.update(skipped=f"a loop of {n} drawings, under {PART_MIN_DRAWINGS}: no steps either side of a run to read it against",
                      parts=0, followed=0)
        return record
    parts, meta = track([frames[run[0]] for run in runs], box, body)
    record.update(parts=meta["seeded"], followed=len(parts))
    if not parts:
        return record
    medians = [float(np.median(np.hypot(*np.diff(p["pts"], axis=0).T))) for p in parts]
    floor = max(float(np.median(medians)), PART_NOISE)
    record["usual_floor_px"] = round(floor, 3)
    at_steps = set(range(n - 1, n) if steps is None else steps)
    asked = [run for run in _runs(n) if set(run) & at_steps]
    said_all = []
    for part, median in zip(parts, medians):
        usual = max(median, floor)
        best = None
        for x in part_runs(part["pts"], usual, asked):
            d, e = x["steps"][0], x["steps"][-1]
            p = part["pts"][d]
            said = {"seed": part["seed"], "from": runs[d][0], "to": runs[(e + 1) % n][0], "steps": x["steps"],
                    "at": [round(box[0] + (p[0] - meta["pad"]) / meta["scale"], 1), round(box[1] + (p[1] - meta["pad"]) / meta["scale"], 1)],
                    "body_pct": round(100 * x["px"] / PART_READ, 3), "jerk_pct": round(100 * x["jerk"] / PART_READ, 3),
                    "usual_px": round(usual, 3), "speed": round(x["speed"], 3), "curve": round(x["curve"], 3),
                    "lead": round(x["lead"], 3), "kind": x["kind"], "back": round(x["back"], 3),
                    "pops": x["pops"], "margin": round(margin(x), 3)}
            if best is None or (said["pops"], said["margin"]) > (best["pops"], best["margin"]):
                best = said
        if best is not None:
            said_all.append(best)
    if said_all:
        record["nearest"] = {k: v for k, v in max(said_all, key=lambda x: x["margin"]).items() if k != "pops"}
    record["pops"] = sorted((x for x in said_all if x["pops"]), key=lambda x: -x["margin"])
    return record


def public(reading: dict[str, Any]) -> dict[str, Any]:
    """A reading as a report holds it: each pop without its `pops` flag, which the list says."""
    return {**reading, "pops": [{k: v for k, v in p.items() if k != "pops"} for p in reading["pops"]]}
