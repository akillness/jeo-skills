# SPDX-License-Identifier: Apache-2.0
"""Frames off a walk loop's flow, found by direction and speed, taken out and made again by RIFE.

A video model redraws thin hair a little differently every frame, and now and then a ponytail
lands somewhere it was not one frame earlier, or a tail snaps back at a wrap that does not close:
a frame drawn where the flow does not go. The flow reading (`flow_scores`, `flow_targets`) finds
it by how far it lies off the line between its neighbours, in the usual steps of the region it is
read in; the frames off the flow, one or two drawings in a row, are taken out and made again by
RIFE between the frames either side, each at its own time, and every other frame stays the video's
own (docs/loop-repair.md section 2). Re-making every frame instead (an offset of half a frame) also
softens the frames that were fine, and was judged "not corrected" (2026-10-03). A frame the
ghost screen names a filmed ghost is replaced in the same stage, before the flow is read: by
RIFE's frame between its neighbours where both are clean and it has no fault, else by the clean
frame beside it (docs/loop-repair.md section 4).

A part can also keep its way and still rush: a tail that runs short of the cycle covers at the wrap in one step what
it covers in eight elsewhere. The surge reading (`surges`) reads that speed; the frames either side of the rush, three
or four drawings each way, are made again by RIFE at times chosen so the part's speed rises and falls gradually
(`ease_times`), while the body's feet, torso and ground line move no further in a step, nor the rest of the body
faster, than they did in that stretch — read again on the frames made, which go the body's own way between the
frames as filmed (docs/loop-repair.md section 2, "The eased retime"). The torso is the head and torso the motion
anchor tracks (`Torso`): a part that sways on its own beat pulls the body's mass along, and moving it is what the
repair is for, not drift. A frame RIFE makes is the whole picture at one time, so the legs take the part's time with
it: the stretch is delivered only where the rest of the body keeps its own beat on the frames made, step by step
(`EASE_BEAT`), and otherwise the loop stays as the flow repair left it.

A part on a beat of its own — a tail swinging round every 41 frames on a walk of 26 — closes on no cut of two steps,
and turns back at the wrap, where no retime reaches it. Before the rounds above, the frames beside such a cut's wrap
are made again between the clip's frames a cycle apart and the cut's own (`overlap_wrap`), so the wrap plays a step
the clip filmed (docs/loop-repair.md section 2, "The overlapped wrap"). Those frames bridge the part's whole move in
one, and where it swings over a smaller part — a tail across a hand — RIFE drags the small part apart with it: each is
read with RIFE's single passes and refused where they disagree there (`overlap_frame`, `rife.torn`).

Measured on the loop as it plays — cyclic, the last frame followed by the first — and inside
the union box of the body over the whole loop, the way the strip cells are cut, so a frame's
score does not depend on where the canvas put the body.

The size reading (`jump_scores`) counts how much a step changes, whole body and hair behind it.
It picked the frames until the flow reading did, and names a fast swing a jump; the jump guard of
`video-loop-compare` still reads it (docs/loop-comparison.md, "The jump guard").
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from PIL import Image

from sprite_gen._deps import np
from sprite_gen.video import auto_motion, motion_anchor
from sprite_gen.video import held as held_mod
from sprite_gen.video import legs as legs_mod
from sprite_gen.video.rife import Interpolate, Read, crossfade, ghost, outline_shift, smear, torn
from sprite_gen.video.interpolation_quality import clean_beside, faults, ghost_screen, looks

# Interpolation calls at most per loop, a drawing made one call, including rejected proposals. A loop that needs more is
# jolting everywhere, not jumping once, and a few made frames do not fix it (the jolt index, section 3, says so instead).
MAX_REPAIRS = 3
# The hair behind a right-facing body, below the head, as fractions of the union box: where a
# ponytail cut at the wrong moment jumps (the size reading, and the jolt index's hair). A left-facing
# body has it on the other side.
HAIR_BOX_RIGHT = (0.0, 0.30, 0.45, 0.80)
ALPHA_SOLID = 8  # alpha at or above this is body, as everywhere in video-loop
BOX_MARGIN = 8  # px around the union box, the strip cells' own side margin


def union_box(frames: list[Image.Image]) -> tuple[int, int, int, int]:
    """The body's box over the whole loop, widened by the strip cells' margin (the bottom stays on the feet)."""
    boxes = [f.getchannel("A").point(lambda v: 255 if v >= ALPHA_SOLID else 0).getbbox() for f in frames]
    boxes = [b for b in boxes if b]
    if not boxes:
        raise ValueError("every loop frame is fully transparent")
    return (min(b[0] for b in boxes) - BOX_MARGIN, max(0, min(b[1] for b in boxes) - BOX_MARGIN),
            max(b[2] for b in boxes) + BOX_MARGIN, max(b[3] for b in boxes))


def hair_box(facing: str) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = HAIR_BOX_RIGHT
    return (x0, y0, x1, y1) if facing != "left" else (1 - x1, y0, 1 - x0, y1)


def coverage(frames: list[Image.Image], box: tuple[int, int, int, int]) -> list[np.ndarray]:
    """Alpha 0..1 of every frame inside `box` (outside the frame counts as empty)."""
    return [np.asarray(f.crop(box), dtype=np.float32)[..., 3] / 255.0 for f in frames]


def steps(alphas: list[np.ndarray], frac: tuple[float, float, float, float] | None = None) -> np.ndarray:
    """Mean coverage change from frame k to k+1, the last to the first at the end; inside `frac`
    (fractions of the box) when given."""
    if frac is not None:
        h, w = alphas[0].shape
        alphas = [a[int(h * frac[1]):int(h * frac[3]), int(w * frac[0]):int(w * frac[2])] for a in alphas]
    n = len(alphas)
    return np.array([float(np.abs(alphas[(k + 1) % n] - alphas[k]).mean()) for k in range(n)])


def jump_scores(frames: list[Image.Image], *, facing: str = "right", box: tuple[int, int, int, int] | None = None) -> dict[str, Any]:
    """The size reading, per step: the whole body's change and the hair's, each over its own median; the score
    is the larger. The jump guard of `video-loop-compare` reads it (`restoration.jump`); the repair reads the flow."""
    al = coverage(frames, box or union_box(frames))
    whole, hair = steps(al), steps(al, hair_box(facing))
    mw, mh = float(np.median(whole)), float(np.median(hair))
    w = whole / mw if mw > 0 else np.zeros_like(whole)
    h = hair / mh if mh > 0 else np.zeros_like(hair)
    return {"whole": w, "hair": h, "score": np.maximum(w, h)}


# --- the flow reading (docs/loop-repair.md section 2, "The flow reading") ---------------------------

# A loop plays its frames as a path: each frame a point, the body's coverage and shading blurred to
# the size of a step. Where a part moves the way it is going — slow or fast, a leg swung through — a
# frame lies near the line between the frames either side of it. A frame drawn where the flow does
# not go (a tail flung against its sway for one frame, a tail snapping back at a wrap that does not
# close) lies far off that line, whatever its size. The size reading above counts how much a step
# changes and cannot tell the two apart: on an ordinary walk it names a fast swing a jump.
FLOW_BLUR = 0.03  # the blur's sigma, of the body height: a shape moved one ordinary step still overlaps where it was
FLOW_GRID = 4  # the union box in FLOW_GRID x FLOW_GRID cells, read in windows of 2 x 2 cells at a stride of one cell
FLOW_LIMIT = 3.0  # a frame this many of its window's usual steps off the line between its neighbours leaves the flow
FLOW_SPAN = 2  # frames in a row a group takes out at most, to be made again between the frames either side
FLOW_CHUNK = 12  # frames a whole clip's path is read in at a time (`clip_flow_states`): a clip's pixels whole are gigabytes
# The share of a held loop's runs that show their drawing for the hold, a frame more or less (a slip): under it the
# runs are not the hold, and the loop is read a drawing a frame (`flow_drawings`).
HELD_RUNS = 0.75
_LUMA = np.array([0.299, 0.587, 0.114])


def _blur(planes: np.ndarray, sigma: float) -> np.ndarray:
    """A Gaussian blur of `sigma` px over axes 1 and 2 of (n, h, w, c), outside the grid empty."""
    r = max(1, int(np.ceil(3 * sigma)))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    for axis in (1, 2):
        pad = [(0, 0)] * planes.ndim
        pad[axis] = (r, r)
        padded = np.pad(planes, pad)
        size = planes.shape[axis]
        planes = sum(k[i] * np.take(padded, np.arange(i, i + size), axis=axis) for i in range(2 * r + 1))
    return planes


def flow_states(frames: list[Image.Image], box: tuple[int, int, int, int] | None = None) -> np.ndarray:
    """Each frame of the loop as a point of its path, (frames, h, w, 2): its coverage and its shading
    (luma times coverage) inside `box` (the union box), averaged down to a grid of a third of the blur
    and blurred by FLOW_BLUR of the body height. Raises ValueError for a loop with no body."""
    pixels = np.stack([np.asarray(f.crop(box or union_box(frames)), dtype=np.float64) / 255.0 for f in frames])
    rows = np.where(pixels[..., 3].max(axis=(0, 2)) > 0.1)[0]
    if rows.size == 0:
        raise ValueError("every loop frame is fully transparent")
    return _states(pixels, FLOW_BLUR * max(1, int(rows.max() - rows.min())))


def clip_flow_states(frames: list[Image.Image]) -> np.ndarray:
    """`flow_states` of a whole clip in one box, its union box, and one blur, read FLOW_CHUNK frames at a time: the path
    every cut of the clip is read on (`ring_scores`), so a choice among its cuts reads each seam alike without reading
    the clip again for each one."""
    box = union_box(frames)
    rows = np.where(np.max([np.asarray(f.crop(box), dtype=np.float64)[..., 3].max(axis=1) / 255.0 for f in frames], axis=0) > 0.1)[0]
    if rows.size == 0:
        raise ValueError("every loop frame is fully transparent")
    sigma = FLOW_BLUR * max(1, int(rows.max() - rows.min()))
    return np.concatenate([_states(np.stack([np.asarray(f.crop(box), dtype=np.float64) / 255.0 for f in frames[k:k + FLOW_CHUNK]]), sigma)
                           for k in range(0, len(frames), FLOW_CHUNK)])


def _states(pixels: np.ndarray, sigma: float) -> np.ndarray:
    """The frames' points (`flow_states`) from their pixels in the box, 0..1, blurred by `sigma` px."""
    alpha = pixels[..., 3]
    planes = np.stack([alpha, (pixels[..., :3] @ _LUMA) * alpha], axis=-1)
    n, height, width, c = planes.shape
    f = max(1, min(int(round(sigma / 1.5)), height, width))
    h, w = height // f, width // f
    small = planes[:, :h * f, :w * f].reshape(n, h, f, w, f, c).mean(axis=(2, 4))
    return _blur(small, sigma / f)


def flow_windows(h: int, w: int) -> list[tuple[int, int, int, int]]:
    """The windows of a (h, w) grid the flow is read in, (y0, y1, x0, x1): 2 x 2 of FLOW_GRID x FLOW_GRID
    cells at a stride of one cell, so a part between two cells is whole in one window."""
    ys = np.linspace(0, h, FLOW_GRID + 1).astype(int)
    xs = np.linspace(0, w, FLOW_GRID + 1).astype(int)
    return [(int(ys[i]), int(ys[i + 2]), int(xs[j]), int(xs[j + 2])) for i in range(FLOW_GRID - 1) for j in range(FLOW_GRID - 1)]


def _flow_read(states: np.ndarray, windows: list[tuple[int, int, int, int]]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per frame and window, cyclic: how far the frame lies off the line between its two neighbours (half the
    change from the step into it to the step out of it), the step out of it (frame k to k+1), and the cosine
    between the step into it and the step out of it. Each (frames, windows)."""
    n = len(states)
    off, step, turn = (np.zeros((n, len(windows))) for _ in range(3))
    for i, (y0, y1, x0, x1) in enumerate(windows):
        x = states[:, y0:y1, x0:x1].reshape(n, -1)
        out = np.roll(x, -1, axis=0) - x
        into = np.roll(out, 1, axis=0)
        step[:, i] = np.linalg.norm(out, axis=1)
        off[:, i] = np.linalg.norm(out - into, axis=1) / 2
        norms = np.linalg.norm(into, axis=1) * step[:, i]
        turn[:, i] = np.where(norms > 0, (into * out).sum(axis=1) / np.where(norms > 0, norms, 1.0), 1.0)
    return off, step, turn


def _flow_scale(step: np.ndarray) -> np.ndarray:
    """Per window, the usual step it is read against: its median step, and no less than the median of
    those over the windows, so a window where little moves is not read on its noise."""
    median = np.median(step, axis=0)
    return np.maximum(median, max(float(np.median(median)), 1e-12))


def flow_drawings(states: np.ndarray) -> tuple[list[list[int]], int]:
    """The drawings of a loop's path, as runs of the frames that show each (each run from the frame that
    begins it, in play order), and the hold. A loop filmed on twos or threes shows each drawing for two or
    three frames: the repeat is the same point of the path, and its step of nothing beside the drawing's
    step of two would read as a lurch at every drawing. The hold is `held.measure`'s, read on the steps of
    this path as a ring; a frame whose step from the frame before it is under its boundary repeats that
    frame's drawing. A loop drawn every frame (hold 1) is a drawing a frame.

    A loop whose only large steps are the steps into and out of a few jumps can read as held there: its
    ordinary steps the repeats, its jumps the drawings. On those drawings its jumps would read as ordinary
    steps, and a drawing made again would stand for every frame of a run of five. Its runs are not its
    hold: a hold is taken only where at least HELD_RUNS of the runs are the hold, a frame more or less,
    and the loop is otherwise read a drawing a frame."""
    n = len(states)
    steps = [float(np.linalg.norm(states[(k + 1) % n] - states[k])) for k in range(n)]
    # The hold is read on the rhythm of the steps; the rate only says how many drawings a second, unused here.
    rhythm = held_mod.measure(steps, fps=1.0, cyclic=True)
    hold = int(rhythm.get("hold") or 1)
    repeat = [hold > 1 and steps[(t - 1) % n] < rhythm["held_below"] for t in range(n)]
    if all(repeat) or not any(repeat):
        return [[t] for t in range(n)], 1
    begin = repeat.index(False)
    runs: list[list[int]] = []
    for i in range(n):
        t = (begin + i) % n
        if repeat[t]:
            runs[-1].append(t)
        else:
            runs.append([t])
    if sum(abs(len(run) - hold) <= 1 for run in runs) < HELD_RUNS * len(runs):
        return [[t] for t in range(n)], 1
    return runs, hold


def _flow(frames: list[Image.Image], box: tuple[int, int, int, int] | None,
          drawings: tuple[list[list[int]], int] | None = None) -> dict[str, Any]:
    """The loop's path read on its drawings: their states, the runs of frames that show them, the windows,
    and per drawing and window the distance off the path, the step out and the turn, and the windows' usual
    step. `drawings` (runs, hold) reads it on those drawings instead of the ones `flow_drawings` finds."""
    return _flow_on(flow_states(frames, box), drawings)


def _flow_on(states: np.ndarray, drawings: tuple[list[list[int]], int] | None = None) -> dict[str, Any]:
    """`_flow` of a loop whose path is read already."""
    runs, hold = drawings if drawings is not None else flow_drawings(states)
    path = states[[run[0] for run in runs]]
    windows = flow_windows(states.shape[1], states.shape[2])
    off, step, turn = _flow_read(path, windows)
    h, w = states.shape[1], states.shape[2]
    return {"path": path, "runs": runs, "hold": hold, "windows": windows, "off": off, "step": step, "turn": turn,
            "scale": _flow_scale(step), "fractions": [(x0 / w, y0 / h, x1 / w, y1 / h) for y0, y1, x0, x1 in windows]}


def _drawing_scores(flow: dict[str, Any]) -> dict[str, Any]:
    """Per drawing: `off`, `window`, `turn`, `into` and `out` in its worst window (`flow_scores`)."""
    rel = flow["off"] / flow["scale"]
    worst = rel.argmax(axis=1)
    at = np.arange(len(rel))
    out = flow["step"] / flow["scale"]
    return {"off": rel[at, worst], "window": worst, "turn": flow["turn"][at, worst],
            "into": np.roll(out, 1, axis=0)[at, worst], "out": out[at, worst]}


def flow_scores(frames: list[Image.Image], *, box: tuple[int, int, int, int] | None = None) -> dict[str, Any]:
    """Per frame, how far its drawing lies off the loop's flow (`off`): the distance from the line between
    the drawings either side of it, over its window's usual step, in the window where that is largest
    (`window`, its index in `windows`, fractions of the box (x0, y0, x1, y1)); there the cosine between
    the step into the drawing and the step out of it (`turn`, below 0 against the way it came, 1 where
    either is still) and the two steps in the window's usual steps (`into`, `out`). Every frame that
    shows a drawing (`flow_drawings`, `hold`) reads the drawing's values."""
    return _frame_scores(_flow(frames, box), len(frames))


def ring_scores(states: np.ndarray) -> dict[str, Any]:
    """`flow_scores` of a loop whose path is read already: a cut of the clip's path (`clip_flow_states`), read as the
    ring the cut plays. The box and the blur are the clip's, not the cut's own, so a frame of one cut reads as it does
    in another; the values are the cut's `flow_scores` within what a box a little larger moves the windows by."""
    return _frame_scores(_flow_on(states), len(states))


def _frame_scores(flow: dict[str, Any], frames: int) -> dict[str, Any]:
    per = _drawing_scores(flow)
    of = np.zeros(frames, dtype=int)
    for d, run in enumerate(flow["runs"]):
        of[run] = d
    return {**{k: v[of] for k, v in per.items()}, "windows": flow["fractions"], "hold": flow["hold"]}


def between_time(a: int, frame: int, b: int, count: int) -> float:
    """The time of `frame` on the way from frame `a` to frame `b` of a loop `count` frames long, 0..1, in play
    order (the wrap included): a frame made there shows the pose at its own time, so the loop keeps its length,
    every frame its time, and a drawing held on twos its two frames."""
    return ((frame - a) % count) / ((b - a) % count)


def flow_targets(frames: list[Image.Image], *, limit: float = FLOW_LIMIT, span: int = FLOW_SPAN,
                 box: tuple[int, int, int, int] | None = None, fixed: Iterable[int] = ()) -> dict[str, Any]:
    """The frames that leave the loop's flow, in groups to take out and make again between the frames either
    side (docs/loop-repair.md section 2, "The flow reading"). Read on the loop's drawings (`flow_drawings`):
    a frame on its own where every frame is a drawing, all the frames that show it on twos or threes.

    The worst drawing at or over `limit` first. A group is up to `span` drawings in a row that take that
    drawing or lie beside it; its in-between is the straight line of the path from the drawing before the
    group to the drawing after, each drawing at its own time (`between_time`). Of the groups whose in-between
    brings every drawing from the one before them to the one after under `limit`, the one taken is the one
    whose every drawing the in-between moves furthest (`move`, the least over its drawings of the move in its
    worst window, in the window's usual steps): the drawings off the flow, not the ones beside them that read
    off only because a neighbour is, and no drawing the in-between hardly moves. A pair flung together is taken
    out whole, where an in-between beside it would bring the reading under `limit` by smoothing its edges and
    leave it standing; a part that snaps back at the wrap is one frame on either side of it, where two would
    spread the snap over a frame the in-between hardly moves. Ties go to the smaller result, then the fewer
    drawings. The path then reads with that in-between, and the next worst drawing is read. A group never
    takes, or is made from, a drawing a group before it took, or a drawing that shows a frame in `fixed`
    (made, given way or refused already). A drawing no group brings under `limit` is `unfixed`.

    Each group: its `frames` in play order, the `drawings` it takes (the frames that show each), the
    `neighbours` it is made from (the first frame of the drawing before it and of the drawing after), each
    drawing's time `t` between them, `off` (the worst of its drawings before) with its `turn`, `into`, `out` and
    `window`, `move`, and `off_after`. The in-between is the straight line of the blurred path, a stand-in for
    the frames RIFE makes there: it says which frames to take out, not how the made frames will look."""
    flow = _flow(frames, box)
    first = _drawing_scores(flow)
    runs, windows, scale = flow["runs"], flow["windows"], flow["scale"]
    n, count = len(runs), len(frames)
    record: dict[str, Any] = {"limit": limit, "span": span, "blur": FLOW_BLUR, "grid": FLOW_GRID, "hold": flow["hold"],
                              "drawings": n, "off_max_before": round(float(first["off"].max()), 4), "groups": [], "unfixed": []}
    if n < 4:
        record.update(stopped="loop shorter than 4 drawings", off_max_after=record["off_max_before"])
        return record

    def reading(path: np.ndarray) -> np.ndarray:
        return (_flow_read(path, windows)[0] / scale).max(axis=1)

    def moved(made: np.ndarray, path: np.ndarray, group: list[int]) -> float:
        return min(max(float(np.linalg.norm(made[g, y0:y1, x0:x1] - path[g, y0:y1, x0:x1]) / scale[i])
                       for i, (y0, y1, x0, x1) in enumerate(windows)) for g in group)

    def said(d: int) -> dict[str, Any]:
        return {"off": round(float(first["off"][d]), 4), "turn": round(float(first["turn"][d]), 4),
                "into": round(float(first["into"][d]), 4), "out": round(float(first["out"][d]), 4),
                "window": [round(v, 4) for v in flow["fractions"][int(first["window"][d])]]}

    of = {t: d for d, run in enumerate(runs) for t in run}
    taken = {of[t] for t in fixed}
    path, unfixed = flow["path"].copy(), set()
    current = reading(path)
    while True:
        open_ = [d for d in np.argsort(-current, kind="stable") if current[d] >= limit and d not in taken and d not in unfixed]
        if not open_:
            break
        d = int(open_[0])
        tried: list[tuple[float, float, list[int], int, int, np.ndarray]] = []
        for size in range(1, min(span, n - 2) + 1):
            # the groups of `size` that take d or lie beside it: d is between the drawing before them and the one after
            for start in range(d - size, d + 2):
                group = [(start + i) % n for i in range(size)]
                a, b = (start - 1) % n, (start + size) % n
                if {a, b, *group} & taken:
                    continue
                made = path.copy()
                for g in group:
                    made[g] = path[a] + between_time(runs[a][0], runs[g][0], runs[b][0], count) * (path[b] - path[a])
                after = reading(made)
                tried.append((float(max(after[(a + i) % n] for i in range(size + 2))), moved(made, path, group), group, a, b, made))
        ok = [x for x in tried if x[0] < limit]
        if not ok:
            unfixed.add(d)
            record["unfixed"].append({"frames": runs[d], **said(d),
                                      "off_after": round(min((x[0] for x in tried), default=float(current[d])), 4)})
            continue
        result, move, group, a, b, made = max(ok, key=lambda x: (round(x[1], 9), -x[0], -len(x[2])))
        worst = max(group, key=lambda g: float(first["off"][g]))
        record["groups"].append({"frames": [t for g in group for t in runs[g]], "drawings": [runs[g] for g in group],
                                 "neighbours": [runs[a][0], runs[b][0]],
                                 "t": [round(between_time(runs[a][0], runs[g][0], runs[b][0], count), 4) for g in group],
                                 **said(worst), "move": round(move, 4), "off_after": round(result, 4)})
        taken |= set(group)
        path, current = made, reading(made)
    record["off_max_after"] = round(float(current.max()), 4)
    return record


# --- the eased retime (docs/loop-repair.md section 2, "The eased retime") ---------------------------------------

# A part can go on the way it was going and still jump: a tail that runs short of the cycle rushes on at the wrap,
# covering in one step what it covers in eight elsewhere. A frame there lies near enough the line between its
# neighbours that the flow reading lets it pass, or takes it out and leaves the rush halved over two steps. The
# surge reading reads the speed itself: a run of one or two steps over the steps either side of it, in a window
# where it goes on the way it came. The frames either side of it are then made again at times chosen so the part's
# speed rises and falls gradually, as far as the body's own steps there allow.
SURGE_LIMIT = 3.0  # a run's mean step, in its window's usual steps, at or over which a part may rush ...
SURGE_RATIO = 3.0  # ... and that many times the mean of the SURGE_AROUND steps either side of it: it rushes
SURGE_AROUND = 3
SURGE_SPAN = 2  # steps in a row a rush is read over at most
EASE_WIDTHS = (3, 4)  # drawings either side of the rush made again, between two frames as filmed
EASE_GRID = 20  # times the search tries per step between two drawings
EASE_SLACK = 0.02  # of the timings within this share of the least change of the part's step, the nearest its own
# A made frame's body measures may move in a step up to the stretch's largest step as it played and DRIFT_PIXEL more:
# they are read on whole pixels (the ground is a row). The search keeps EASE_MARGIN inside that, as a made frame's feet
# and torso land a little off the line between its two frames that the search reads them on.
DRIFT_PIXEL = 1.0
EASE_MARGIN = 0.5
DRIFT_MEASURES = ("foot_centre", "torso_centre", "ground")
# With the frames the ghost and flow rounds replaced, a stretch leaves at most this share of the loop made:
# `video-loop-compare` reads no more back as the repair's (`source.py`, "repair-locations-unverified").
MADE_SHARE = 0.5
# The body keeps its own beat. A frame RIFE makes is the whole picture at one time, the body with the part: a time that
# gives the part's rush more steps gives the legs, the arms and the head the same, so they slow to a stop where the part
# is given its time and hurry on after. In a frame made so, the part's step and the body's are in the ratio they have at
# that time, and bounding the body's step below as well as above leaves the rush to spread by no more than the share of
# its own step the body may lose. So the stretch is read on the frames made, step by step: every window the part does
# not rush in steps as far as it did in that step as the loop played before, to within EASE_BEAT of its usual step —
# the walk's beat as tests/video/test_loop_ease.py reads it on a walker's legs, a quarter of their ordinary step.
# Drawings made at their own times, as the flow repair makes them, keep the walkers' legs on their steps as filmed
# (0 off). The stand-in's stretches the earlier reading took on the walkers of 14 to 48 frames read 1.35 to 2.42 here,
# their legs 1.5 to 2.7 ordinary steps off.
EASE_BEAT = 0.25
# Drift is the body sliding or lifting off its line. A part that sways on its own beat — a tail, the hair's ends — pulls
# the body's mass along, and moving such a part is what the repairs here are for: that is not drift. The body's point is
# the torso, the head and torso the motion anchor tracks (`auto_motion.discover` on the loop as cut), which a part swaying
# on its own beat does not hold still enough to be chosen: each frame matched by the anchor's masked NCC within the
# anchor's own fine search (`motion_anchor.SEARCH_RADIUS`, px across and down — a walk's bob lifts the head further than
# it sways) of where the loop's first frame has them, the two weighted as the anchor weights them, x to a fraction of a
# pixel on the parabola through the costs either side of the best. A loop whose head and torso go to the edge of that
# search on any of its frames (cut as filmed, the drift left in) is not read on them: its mass stands in.


class Torso:
    """The head and torso of a loop as the motion anchor tracks them (`auto_motion.discover` on `frames`, the first the
    reference, at full size): the body's point of the drift (`drift_points`). Where the anchor finds no head and torso
    to track (`why`), the body's mass (`loop.body_centre`) stands in."""

    def __init__(self, frames: list[Image.Image]):
        self.regions: list[list[int]] | None = None
        self.why: str | None = None
        self._references: list[tuple] | None = None
        try:
            regions, _ = auto_motion.discover(frames, reference_index=0)
            self._references = motion_anchor._references(motion_anchor._features(frames[0]), regions)
        except ValueError as exc:
            self.why = str(exc)
            return
        far = [k for k, f in enumerate(frames) if self._at(f)[1]]
        if far:
            self._references = None
            self.why = f"the head and torso reach the edge of the anchor's search on frames {far}"
            return
        self.regions = [list(r) for r in regions]

    def _at(self, frame: Image.Image) -> tuple[float, bool]:
        """Where `frame` shows the head and torso, x px from where the first frame has them, and whether a region was
        found only at the edge of the search (`motion_anchor.SEARCH_RADIUS`)."""
        features = motion_anchor._features(frame)
        rx, ry = motion_anchor.SEARCH_RADIUS
        at, edge = 0.0, False
        for weight, reference in zip(motion_anchor.REGION_WEIGHTS, self._references):
            costs, xs, ys = auto_motion._match_costs(reference, features, (0, 0), (rx, ry))
            iy, ix = auto_motion._best(costs, xs, ys, reference, (0, 0))
            off = 0.0
            if 0 < ix < costs.shape[1] - 1:
                left, best, right = costs[iy, ix - 1], costs[iy, ix], costs[iy, ix + 1]
                bend = left - 2 * best + right
                off = 0.5 * (left - right) / bend if bend > 1e-12 else 0.0
            dx, dy = xs + ix - reference[0][0], ys + iy - reference[0][1]
            edge |= abs(dx) >= rx or abs(dy) >= ry
            at += weight * (dx + off)
        return float(at), edge

    def x(self, frame: Image.Image, box: tuple[int, int, int, int]) -> float:
        """Where `frame` shows the head and torso, x px from where the loop's first frame has them; or the body's mass
        inside `box`, x."""
        from sprite_gen.video import loop as loop_mod  # loop imports this module

        if self._references is None:
            return loop_mod.body_centre(frame, box)
        return self._at(frame)[0]

    def said(self) -> dict[str, Any]:
        return {"regions": self.regions} if self.why is None else {"stand_in": "the body's mass", "why": self.why}


def drift_points(frame: Image.Image, torso: Torso | None = None) -> np.ndarray:
    """Where the body stands in `frame`: the foot line's centre (`loop.foot_centre`) and the torso (`torso`; the body's
    mass, `loop.body_centre`, where none is given), x, and the lowest solid row (`legs.LOW_ALPHA`), y, the ground it
    stands on. NaN for an empty frame."""
    from sprite_gen.video import loop as loop_mod  # loop imports this module

    box = frame.getchannel("A").point(lambda v: 255 if v >= ALPHA_SOLID else 0).getbbox()
    rows = np.nonzero((np.asarray(frame.getchannel("A")) >= legs_mod.LOW_ALPHA).any(axis=1))[0]
    if box is None or rows.size == 0:
        return np.full(len(DRIFT_MEASURES), np.nan)
    body = torso.x(frame, box) if torso is not None else loop_mod.body_centre(frame, box)
    return np.array([loop_mod.foot_centre(frame, box), body, float(rows.max())])


def mass_step(frames: list[Image.Image]) -> float:
    """The largest step of the body's mass (`loop.body_centre`), x, over `frames` in order: reported beside the drift,
    as information — a part swaying on its own beat moves it."""
    from sprite_gen.video import loop as loop_mod  # loop imports this module

    boxes = [f.getchannel("A").point(lambda v: 255 if v >= ALPHA_SOLID else 0).getbbox() for f in frames]
    x = np.array([loop_mod.body_centre(f, b) if b else np.nan for f, b in zip(frames, boxes)])
    return round(float(np.abs(np.diff(x)).max()), 3)


def _surges(flow: dict[str, Any]) -> list[dict[str, Any]]:
    """The rushes of a loop's path (`_flow`), worst first, none sharing a step: per run of 1..SURGE_SPAN steps from
    drawing `d`, the windows where its mean step is at least SURGE_LIMIT usual steps and SURGE_RATIO times the
    mean of the SURGE_AROUND steps either side, and no drawing from its first to its last turns back."""
    rel = flow["step"] / flow["scale"]
    turn = flow["turn"]
    n = len(rel)
    if n < 2 * SURGE_AROUND + SURGE_SPAN + 1:
        return []
    found = []
    for r in range(1, SURGE_SPAN + 1):
        for d in range(n):
            run = [(d + i) % n for i in range(r)]
            around = [(d - 1 - i) % n for i in range(SURGE_AROUND)] + [(d + r + i) % n for i in range(SURGE_AROUND)]
            speed, base = rel[run].mean(axis=0), rel[around].mean(axis=0)
            ratio = speed / np.maximum(base, 1e-12)
            onward = (turn[[(d + i) % n for i in range(r + 1)]] >= 0).all(axis=0)
            hit = np.nonzero((speed >= SURGE_LIMIT) & (ratio >= SURGE_RATIO) & onward)[0]
            if hit.size:
                w = int(hit[ratio[hit].argmax()])
                found.append({"d": d, "r": r, "W": [int(x) for x in hit], "ratio": float(ratio[w]),
                              "speed": float(speed[w]), "around": float(base[w])})
    taken: list[dict[str, Any]] = []
    for s in sorted(found, key=lambda s: (-s["ratio"], s["r"], s["d"])):
        steps = {(s["d"] + i) % n for i in range(s["r"])}
        if not any(steps & {(t["d"] + i) % n for i in range(t["r"])} for t in taken):
            taken.append(s)
    return taken


def _said_surge(s: dict[str, Any], flow: dict[str, Any]) -> dict[str, Any]:
    runs, n = flow["runs"], len(flow["runs"])
    return {"from": runs[s["d"]][0], "to": runs[(s["d"] + s["r"]) % n][0], "steps": s["r"],
            "frames": [t for i in range(s["r"] + 1) for t in runs[(s["d"] + i) % n]],
            "windows": [[round(v, 4) for v in flow["fractions"][w]] for w in s["W"]],
            "ratio": round(s["ratio"], 4), "speed": round(s["speed"], 4), "around": round(s["around"], 4)}


def surges(frames: list[Image.Image], *, box: tuple[int, int, int, int] | None = None) -> list[dict[str, Any]]:
    """The runs of steps where a part of the loop rushes (docs/loop-repair.md section 2, "The eased retime"), worst
    first, none sharing a step: one or two steps in a row whose mean step, in a window of the flow reading, is at
    least SURGE_LIMIT of its usual steps and SURGE_RATIO times the mean of the SURGE_AROUND steps either side, where
    the part goes on the way it came through them (a step that turns back is a frame flung, the flow repair's). Read
    on the loop's drawings (`flow_drawings`). Each: the frames it runs `from` and `to` (first frames of its drawings),
    its `steps`, the `frames` of its drawings, the `windows` that read it (fractions of the box), and in the one that
    reads it most its `ratio`, `speed` and `around` (usual steps)."""
    flow = _flow(frames, box)
    return [_said_surge(s, flow) for s in _surges(flow)]


def ease_times(times: np.ndarray, progress: np.ndarray, body: np.ndarray, bound: np.ndarray, into: np.ndarray,
               out: np.ndarray, *, own: Iterable[float], allowed: np.ndarray | None = None,
               slack: float = EASE_SLACK) -> dict[str, Any] | None:
    """The times to make a stretch's frames at (docs/loop-repair.md section 2, "The eased retime").

    `times` is the grid searched, 0 (the drawing before the stretch) to T (the drawing after), EASE_GRID points a step;
    `progress` (windows, times) how far the part has gone there in each window it rushes in, and `into` and `out` its
    step into the first time and out of the last, in one unit; `body` (measures, times) where the body stands there and
    `bound` how far each measure may move in a step; `allowed` (times, times), where given, the steps from one time to a
    later one the rest of the body allows; `own` the frames' own times, on the grid, in order.

    Of the timings that go forward and keep every step in bound and allowed, the one whose largest change of the part's
    step from one step to the next — from `into`, through the stretch, to `out` — is least (`accel`): its speed rises and
    falls as gradually as the body lets it. Of those within `slack` of that, the one nearest the frames' own times (the
    least sum of squares), so a frame the part does not need moved keeps its time. None where no timing keeps in bound."""
    own_at = [int(round(float(np.interp(t, times, np.arange(len(times)))))) for t in own]
    m, G = len(own_at), len(times)
    if m == 0:
        return {"accel": 0.0, "times": []}
    later = np.arange(G)[None, :] > np.arange(G)[:, None]
    ok = later & np.all(np.abs(body[:, None, :] - body[:, :, None]) <= bound[:, None, None] + 1e-9, axis=0)
    if allowed is not None:
        ok &= allowed
    step = progress[:, None, :] - progress[:, :, None]  # (windows, p, q): the part's step from time p to time q
    end = G - 1

    def solve(limit: float | None) -> tuple[float, list[int]] | None:
        cost = np.full((G, G), np.inf)  # cost[p, q]: the frame before at p, this one at q
        first = np.abs(step[:, 0, :] - into[:, None]).max(axis=0)
        live = ok[0] & (True if limit is None else first <= limit)
        cost[0, live] = first[live] if limit is None else (np.arange(G)[live] - own_at[0]) ** 2.0
        back = []
        for i in range(1, m):
            new, arg = np.full((G, G), np.inf), np.zeros((G, G), dtype=np.int64)
            for p in range(G):
                before = np.nonzero(np.isfinite(cost[:, p]))[0]
                after = np.nonzero(ok[p])[0]
                if not before.size or not after.size:
                    continue
                acc = np.abs(step[:, p, after][:, None, :] - step[:, before, p][:, :, None]).max(axis=0)
                if limit is None:
                    c = np.maximum(cost[before, p][:, None], acc)
                else:
                    c = np.where(acc <= limit, cost[before, p][:, None] + (after[None, :] - own_at[i]) ** 2.0, np.inf)
                j = c.argmin(axis=0)
                new[p, after] = c[j, np.arange(after.size)]
                arg[p, after] = before[j]
            back.append(arg)
            cost = new
        ps, qs = np.nonzero(np.isfinite(cost) & ok[:, end][None, :])
        if not ps.size:
            return None
        last = np.maximum(np.abs(step[:, qs, end] - step[:, ps, qs]).max(axis=0),
                          np.abs(out[:, None] - step[:, qs, end]).max(axis=0))
        total = np.maximum(cost[ps, qs], last) if limit is None else np.where(last <= limit, cost[ps, qs], np.inf)
        k = int(total.argmin())
        if not np.isfinite(total[k]):
            return None
        path = [int(qs[k]), int(ps[k])]
        for arg in reversed(back):
            path.append(int(arg[path[-1], path[-2]]))
        return float(total[k]), list(reversed(path))[1:]

    least = solve(None)
    if least is None:
        return None
    near = solve(least[0] * (1 + slack) + 1e-9)
    chosen = near[1] if near is not None else least[1]
    return {"accel": least[0], "times": [float(times[g]) for g in chosen]}


def _part_places(path: np.ndarray, window: tuple[int, int, int, int]) -> np.ndarray:
    """Per drawing of a path (`_flow`), the centre of its coverage inside `window` (y0, y1, x0, x1 of the path's grid),
    (y, x) in cells. Where a part moves through the window its centre moves with it, as far as it goes: a step's
    distance between two blurred states stops growing once they no longer overlap, the centre's does not."""
    y0, y1, x0, x1 = window
    a = path[:, y0:y1, x0:x1, 0]
    ys, xs = np.mgrid[y0:y1, x0:x1]
    mass = np.maximum(a.sum(axis=(1, 2)), 1e-12)
    return np.stack([(a * ys).sum(axis=(1, 2)) / mass, (a * xs).sum(axis=(1, 2)) / mass], axis=1)


def _part_accel(progress: np.ndarray, at: list[float], times: np.ndarray, into: np.ndarray, out: np.ndarray) -> float:
    """The largest change of the part's step from one step to the next over a stretch shown at `at` (with 0 and T)."""
    reached = np.stack([np.interp([0.0, *at, float(times[-1])], times, p) for p in progress])
    steps = np.concatenate([into[:, None], np.diff(reached, axis=1), out[:, None]], axis=1)
    return float(np.abs(np.diff(steps, axis=1)).max())


def _ease(frames: list[Image.Image], out: list[Image.Image], interpolate: Interpolate | None,
          box: tuple[int, int, int, int], blocked: set[int], made: set[int], taken: set[int], reads: bool,
          record: dict[str, Any], ease: bool, torso: Torso | None) -> list[Image.Image]:
    """The eased retime stage of `repair_jumps`, on the loop `out` as the ghost and flow rounds left it.

    `blocked` holds the frames no stretch may hold (given way, refused; the frames read off the flow against the way
    are added here), `made` the frames the flow rounds made: a stretch makes them again, never from them, and never
    ends on one. `taken` holds every frame the rounds replaced: with the stretch they are at most MADE_SHARE of the
    loop. The body's point of the drift is `torso`'s, the `Torso` of `frames` where none is given. Records `surge` and,
    where a stretch was made, an `ease` round (`ease_calls`); `ease_skipped` says why
    none was. With `ease` false the surge is read and nothing made."""
    flow = _flow(out, box)
    found = _surges(flow)
    record["surge"] = _said_surge(found[0], flow) if found else None
    if not found:
        return out
    if not ease:
        record["ease_skipped"] = "not asked"
        return out
    runs, n = flow["runs"], len(flow["runs"])
    count = len(out)
    first = [run[0] for run in runs]
    rel = flow["step"] / flow["scale"]
    # a drawing off the flow that turns back is a frame flung, not the rush: nothing is eased over it
    read = _drawing_scores(flow)
    blocked = blocked | {t for d in range(n) if read["off"][d] >= FLOW_LIMIT and read["turn"][d] < 0 for t in runs[d]}
    torso = torso if torso is not None else Torso(frames)
    record["torso"] = torso.said()
    points = [drift_points(out[t], torso) for t in first]
    cell = (box[2] - box[0]) / flow["path"].shape[2]  # px a cell of the path's grid
    plans = []
    why = "the frames around it were given way, refused, or flung against the way"
    for s in found:
        for k in EASE_WIDTHS:
            T = s["r"] + 2 * k
            stretch = [(s["d"] - k + i) % n for i in range(T + 1)]  # drawings in play order, the two kept at the ends
            if T >= n or len(taken | {t for d in stretch[1:-1] for t in runs[d]}) > int(count * MADE_SHARE):
                why = "the stretch would leave more than half the loop made"
                continue
            ends = (stretch[0], stretch[-1])
            if any(t in blocked for d in stretch for t in runs[d]) or any(t in made for d in ends for t in runs[d]):
                continue
            sources = [i for i, d in enumerate(stretch) if not set(runs[d]) & made]
            W = s["W"]
            # how far the part has gone: the path of its window's coverage centre, px, through the frames as filmed
            places = [_part_places(flow["path"], flow["windows"][w]) * cell for w in W]
            progress_at = np.array([[0.0, *np.cumsum([float(np.linalg.norm(pl[stretch[j]] - pl[stretch[i]]))
                                                      for i, j in zip(sources, sources[1:])])] for pl in places])
            grid = np.arange(0, T * EASE_GRID + 1) / EASE_GRID
            progress = np.stack([np.interp(grid, sources, p) for p in progress_at])
            seen = np.array([points[d] for d in stretch])
            if not np.isfinite(seen).all():
                continue
            bound = np.abs(np.diff(seen, axis=0)).max(axis=0)
            body = np.stack([np.interp(grid, sources, seen[sources, j]) for j in range(seen.shape[1])])
            into = np.array([float(np.linalg.norm(pl[stretch[0]] - pl[(stretch[0] - 1) % n])) for pl in places])
            after = np.array([float(np.linalg.norm(pl[(stretch[-1] + 1) % n] - pl[stretch[-1]])) for pl in places])
            own = list(range(1, T))
            # the rest of the body, window by window, moves in no step further than it did in a step of the stretch —
            # read here on the line between the frames as filmed, and on the frames made once they are made
            rest = [w for w in range(len(flow["windows"])) if w not in W]
            allowed = np.ones((len(grid), len(grid)), dtype=bool)
            for w in rest:
                y0, y1, x0, x1 = flow["windows"][w]
                x = np.stack([flow["path"][stretch[i]][y0:y1, x0:x1].ravel() for i in sources])
                at = np.stack([np.interp(grid, sources, x[:, j]) for j in range(x.shape[1])], axis=1)
                sq = (at * at).sum(axis=1)
                dist = np.sqrt(np.maximum(sq[:, None] + sq[None, :] - 2 * at @ at.T, 0.0)) / flow["scale"][w]
                allowed &= dist <= max(float(rel[d, w]) for d in stretch[:-1]) + 1e-9
            result = ease_times(grid, progress, body, bound + DRIFT_PIXEL - EASE_MARGIN, into, after, own=own,
                                allowed=allowed)
            if result is None:
                why = "no timing keeps the body in bound"
                continue
            plans.append({"surge": s, "k": k, "stretch": stretch, "sources": sources, "W": W, "rest": rest,
                          "progress": progress, "grid": grid, "bound": bound, "into": into, "after": after,
                          "result": result, "accel_before": _part_accel(progress, [float(t) for t in own], grid, into, after)})
        if plans:
            break
    if not plans:
        record["ease_skipped"] = why
        return out
    least = min(p["result"]["accel"] for p in plans)
    plan = next(p for p in plans if p["result"]["accel"] <= least * (1 + EASE_SLACK) + 1e-9)  # the narrower, as good
    if interpolate is None:
        record["ease_skipped"] = "no interpolator"
        return out
    s, stretch, sources = plan["surge"], plan["stretch"], plan["sources"]
    span_frames = (first[stretch[-1]] - first[stretch[0]]) % count
    at_frames = [((first[d] - first[stretch[0]]) % count) for d in stretch]
    new = list(out)
    made_rows, calls = [], 0
    for i, d in enumerate(stretch[1:-1], start=1):
        tau = plan["result"]["times"][i - 1]
        drawing = runs[d]
        row: dict[str, Any] = {"frames": drawing, "time": round(float(np.interp(tau, range(len(stretch)), at_frames)), 4),
                               "own": at_frames[i]}
        if abs(tau - i) < 1e-9:
            row.update({"from": None, "t": None, "proposal": None, "faults": [], "look": []})
            made_rows.append(row)
            continue
        j = max(x for x in range(len(sources) - 1) if sources[x] <= tau + 1e-9)
        p, q = stretch[sources[j]], stretch[sources[j + 1]]
        fp, fq = at_frames[sources[j]], at_frames[sources[j + 1]]
        t = (float(np.interp(tau, range(len(stretch)), at_frames)) - fp) / (fq - fp)
        a, b = frames[first[p]], frames[first[q]]
        if t < 1e-9:
            frame = a
            row.update({"from": [first[p], first[p]], "t": 0.0, "proposal": None, "faults": [], "look": []})
        else:
            frame = interpolate(a, b, t)
            calls += 1
            if frame.mode != "RGBA" or frame.size != out[drawing[0]].size:
                raise ValueError("repair interpolator must return an RGBA frame of the original size")
            measure = {**smear(frame, a, b), "outline_shift": outline_shift(frame, a, b),
                       "ghost": ghost(frame) if reads else None, "crossfade": crossfade(frame, a, b, t)}
            row.update({"from": [first[p], first[q]], "t": round(t, 4), "proposal": measure,
                        "faults": faults(measure) + ([] if frame.getchannel("A").getbbox() else ["empty"]),
                        "look": looks(measure)})
        made_rows.append(row)
        for k in drawing:
            new[k] = frame
    after_flow = _flow(new, box, (runs, flow["hold"]))
    moved = np.abs(np.diff(np.array([drift_points(new[first[d]], torso) for d in stretch]), axis=0)).max(axis=0)
    over = bool(np.any(~np.isfinite(moved)) or np.any(moved > plan["bound"] + DRIFT_PIXEL + 1e-9))
    W = plan["W"]
    part_before = float(max(rel[d, w] for d in stretch[:-1] for w in W))
    rel_after = after_flow["step"] / after_flow["scale"]
    part_after = float(max(rel_after[d, w] for d in stretch[:-1] for w in W))
    off_before = float(read["off"][stretch].max())
    off_after = float((after_flow["off"] / after_flow["scale"]).max(axis=1)[stretch].max())
    wrong = sorted({f for r in made_rows for f in r["faults"]})
    inside = set(stretch)
    # a rush the stretch did not have, in a window the part does not rush in: the retime hurried the rest of the body
    rushes = [x for x in _surges(after_flow)
              if {(x["d"] + i) % n for i in range(x["r"] + 1)} & inside and set(x["W"]) - set(W)]
    # the rest of the body on the frames made, window by window: no step of the stretch further than its largest as it
    # played. The search reads it between the frames as filmed; the frames made go the body's own way between them.
    rest = plan["rest"]
    rest_before = flow["step"][stretch[:-1]][:, rest].max(axis=0) if rest else np.zeros(0)
    rest_after = after_flow["step"][stretch[:-1]][:, rest].max(axis=0) if rest else np.zeros(0)
    faster = [w for w, b, a in zip(rest, rest_before, rest_after) if a > b + 1e-9]
    # the rest of the body on its own beat (EASE_BEAT): each step of the stretch against the same step as it played,
    # in every window; a stretch whose body cannot be read apart from the part keeps no beat it can show
    beat = (np.abs(after_flow["step"][stretch[:-1]][:, rest] - flow["step"][stretch[:-1]][:, rest])
            / flow["scale"][rest]).max(axis=1) if rest else np.zeros(0)
    unbeat = not rest or float(beat.max()) > EASE_BEAT
    rejected = ((["fault"] if wrong else []) + (["drift"] if over else []) + (["no gain"] if part_after >= part_before else [])
                + (["off the flow"] if off_after >= FLOW_LIMIT and off_after > off_before else [])
                + (["a new rush"] if rushes else []) + (["the rest faster"] if faster else [])
                + (["the body off its beat"] if unbeat else []))
    changed = [t for d in stretch[1:-1] for t in runs[d] if new[t] is not out[t]]
    round_: dict[str, Any] = {
        "why": "ease", "surge": _said_surge(s, flow), "width": plan["k"], "anchors": [first[stretch[0]], first[stretch[-1]]],
        "frames": [t for d in stretch[1:-1] for t in runs[d]], "drawings": [runs[d] for d in stretch[1:-1]],
        "sources": [first[stretch[i]] for i in sources], "supersedes": sorted(t for t in changed if t in made),
        "span": span_frames, "made": made_rows,
        "accel": {"before": round(plan["accel_before"], 4), "chosen": round(plan["result"]["accel"], 4)},
        "part": {"windows": [[round(v, 4) for v in flow["fractions"][w]] for w in W],
                 "step_max_before": round(part_before, 4), "step_max_after": round(part_after, 4)},
        "rest": {"windows": [[round(v, 4) for v in flow["fractions"][w]] for w in rest],
                 "step_max_before": [round(float(v), 4) for v in rest_before / flow["scale"][rest]],
                 "step_max_after": [round(float(v), 4) for v in rest_after / flow["scale"][rest]],
                 "faster": [[round(v, 4) for v in flow["fractions"][w]] for w in faster]},
        "beat": {"bound": EASE_BEAT, "off": [round(float(v), 4) for v in beat],
                 "off_max": round(float(beat.max()), 4) if rest else None},
        "drift": {"measures": list(DRIFT_MEASURES), "bound": [round(float(v), 3) for v in plan["bound"]],
                  "moved": [round(float(v), 3) for v in moved], "over": over,
                  "body_mass": {"bound": mass_step([out[first[d]] for d in stretch]),
                                "moved": mass_step([new[first[d]] for d in stretch])}},
        "off_max": {"before": round(off_before, 4), "after": round(off_after, 4)}, "calls": calls, "faults": wrong,
        "look": sorted({w for r in made_rows for w in r["look"]}), "outcome": "rejected" if rejected else "accepted"}
    if rejected:
        round_["rejected_for"] = rejected
    else:
        round_["replaced"] = changed
        out = new
    record["rounds"].append(round_)
    record["ease_calls"] = calls
    return out


# --- the overlapped wrap (docs/loop-repair.md section 2, "The overlapped wrap") ---------------------------------------

# A cut two steps long closes for the legs; a part on a beat of its own — a tail swinging every 41 frames on a walk of 26 —
# closes on no cut of two steps, and the seam gate refuses every one. The clip goes on past the cut: its frame a cycle
# after one of the cut's shows the legs at the same point of the walk and the part where the clip carried it. The frames
# beside the wrap are made again between the two, each at its own time, the weight going over from the clip's frame a
# cycle on, next to the wrap, to the cut's own frame away from it: the wrap plays a step the clip filmed, and the part goes
# over from the clip's way to the cut's over those frames, the legs where they were on both. The body is held to the
# stretch as the loop plays it, as the eased retime holds it, on its torso (`Torso`): the part going over moves the body's
# mass and is the move the run is made for, while a torso the clip's frame a cycle on shows elsewhere would slide.
OVERLAP_WIDTHS = (4, 6, 8, 10, 12)  # frames beside the wrap made again, the fewer first; a longer run, smaller steps of weight
OVERLAP_SIDES = ("after", "before")  # the clip's frames a cycle after the loop's first frames, or a cycle before its last
OVERLAP_APART = 1.0  # usual steps: a window whose frames a cycle apart differ by this much somewhere in the run is the part
OVERLAP_GRID = 20  # weights the search tries between a frame's two, 0 and 1 included: OVERLAP_GRID + 1 points


def overlap_run(side: str, width: int, length: int) -> list[int]:
    """The loop frames the overlapped wrap makes on `side`, from the one next to the wrap away from it."""
    return list(range(width)) if side == "after" else [length - 1 - j for j in range(width)]


def overlap_weight(p: int, width: int) -> float:
    """The ease in and out the weights search keeps nearest to: of the run's `p`-th frame in play order (1..width), the
    share of the early frame of its two — 0 the late, 1 the early — x²(3 − 2x), x = p/(width + 1)."""
    x = p / (width + 1)
    return x * x * (3 - 2 * x)


def overlap_weights(step: np.ndarray, body: np.ndarray, rest: list[int], rest_bound: np.ndarray,
                    body_bound: np.ndarray) -> dict[str, Any] | None:
    """The weights to make the overlapped wrap's frames at (docs/loop-repair.md section 2, "The overlapped wrap").

    The stretch's positions in play order, 0 and P (the frames either side of the run, kept), hold each two frames of one
    time: the late and the early, shown at weight u of the early (0..1, OVERLAP_GRID + 1 points), u 0 at position 0 and
    1 at P. `step[p, i, k]` (windows, usual steps) is the step from position p at grid point i to position p + 1 at grid
    point k, read on the line between the two frames' states, and `body[p, i, k]` (measures) how far each body measure
    moves over it.

    Of the weightings that never go back toward the late frame and keep every window of the `rest` within `rest_bound`
    and every body measure within `body_bound` in each step, the one nearest the ease `overlap_weight` (the least sum of
    squares): the part goes over from the late way to the early in an ease in and out, moved off it only as far as the
    rest of the body needs. None where no weighting keeps in bound."""
    P, G = step.shape[0], step.shape[1]
    ok = np.triu(np.ones((G, G), dtype=bool))[None] & np.ones((P, 1, 1), dtype=bool)
    if rest:
        ok &= np.all(step[..., rest] <= rest_bound + 1e-9, axis=-1)
    ok &= np.all(body <= body_bound + 1e-9, axis=-1)
    own = np.array([overlap_weight(p, P - 1) * (G - 1) for p in range(1, P)])
    cost = np.where(np.arange(G) == 0, 0.0, np.inf)  # position 0: the late frame
    back = []
    for p in range(P):
        c = np.where(ok[p], cost[:, None], np.inf)  # (i, k)
        arg = c.argmin(axis=0)
        cost = c[arg, np.arange(G)] + ((np.arange(G) - own[p]) ** 2.0 if p < P - 1 else 0.0)
        back.append(arg)
    if not np.isfinite(cost[-1]):
        return None
    path = [G - 1]  # position P: the early frame
    for arg in reversed(back):
        path.append(int(arg[path[-1]]))
    weights = [k / (G - 1) for k in reversed(path[:-1])][:-1]
    return {"weights": weights, "eased": [round(float(v / (G - 1)), 4) for v in own],
            "off_ease": round(float(np.abs(np.array(weights) - own / (G - 1)).max()), 4)}


def overlap_frame(read: Read, a: Image.Image, b: Image.Image, u: float, *, reads: bool) -> tuple[Image.Image, dict[str, Any]]:
    """A frame of the overlapped wrap: RIFE's frame at weight `u` of the early frame `b` from the late frame `a`, with how
    far its single passes disagree there (`read`, `rife.Rife.read`), and what it reads — the measures every made frame
    carries, its ghost where the loop's ghost screen reads it (`reads`), and a part torn (`rife.torn`) — with its faults
    and what to look at (docs/loop-repair.md section 2, "The overlapped wrap")."""
    made, apart = read(a, b, u)
    if made.mode != "RGBA" or made.size != b.size:
        raise ValueError("repair interpolator must return an RGBA frame of the original size")
    if apart.shape != (b.height, b.width):
        raise ValueError("repair interpolator must read how far its passes disagree at every pixel of the frame")
    measure = {**smear(made, a, b), "outline_shift": outline_shift(made, a, b), "ghost": ghost(made) if reads else None,
               "crossfade": crossfade(made, a, b, u), "torn": torn(apart, made)}
    return made, {"proposal": measure, "look": looks(measure),
                  "faults": faults(measure) + ([] if made.getchannel("A").getbbox() else ["empty"])}


def overlap_wrap(frames: list[Image.Image], others: dict[str, dict[int, Image.Image]], read: Read | None, *,
                 seam: Callable[[list[Image.Image]], float], steps: Callable[[list[Image.Image]], dict[str, Any]],
                 seam_max: float, reads: bool, torso: Torso | None = None, off: str | None = None
                 ) -> tuple[list[Image.Image], dict[str, Any]]:
    """The overlapped wrap (docs/loop-repair.md section 2, "The overlapped wrap") of a loop cut two steps long whose wrap
    the seam gate refuses (`seam`: the gate's reading of a loop, over `seam_max`).

    `others[side][q]` is the clip's frame a cycle from loop frame q — a cycle after it for the first frames ("after"), a
    cycle before it for the last ("before"), one frame past the widest run — placed where frame q is. One run is tried a
    width (OVERLAP_WIDTHS, the fewer first), on the side whose frames a cycle apart differ least from the loop's over it,
    and never past MADE_SHARE of the loop. The stretch runs from the frame before the run to the frame after it, the wrap
    inside; each of its frames has two of one time, the late (the clip's frame a cycle after, or the loop's own before the
    wrap) and the early (the loop's own, or the clip's frame a cycle before). Each frame of the run is shown at the weight
    of its early frame `overlap_weights` chooses on the line between the two frames' states — an ease in and out, moved off
    it only as far as the rest of the body and the body's measures need — as RIFE's frame between them, read with its
    single passes (`read`, `overlap_frame`), or either one whole at 0 or 1. The frames are made the weight nearest a half
    first: the part's whole move is bridged there, and a frame torn is torn there first.

    The first made frame with an interpolation fault ends the run — a part torn (`rife.torn`) among them — and the rest of
    it is not made (`unmade`). The run is taken only where, on the frames made: no frame has a fault; the gate passes it; the loop
    played round still covers two steps (`steps`, the clip's crossings read on it); no body measure moves in a step more
    than a pixel past the largest step the stretch takes as the loop plays it (`drift_points`, the eased retime's bound,
    the body's point the torso: `torso`, the `Torso` of `frames` where none is given, recorded as `torso`; the body's
    mass is reported beside it, `drift.body_mass`);
    the part — the windows where the frames a cycle apart differ by OVERLAP_APART usual steps or more — steps no further
    than it did over the stretch (`no gain`); no window of the rest of the body steps further than its own largest step
    over the stretch as the loop plays it (`the rest faster`); no rush the loop did not have is read across the stretch
    (`a new rush`); and no frame of it is read further off the flow than before and at or over the limit. The first run
    taken ends the search. Returns the loop and the record (`frames`: the frames shown otherwise than as cut).

    `off` (why, `video-loop --overlap-wrap off`) turns it off: nothing is read or made, the record says so (`skipped`), and
    the cut is kept as filmed for the gate to refuse."""
    n = len(frames)
    record: dict[str, Any] = {"seam": round(float(seam(frames)), 4), "seam_max": seam_max, "widths": list(OVERLAP_WIDTHS),
                              "tries": [], "frames": [], "calls": 0}
    if off is not None:
        record["skipped"] = off
        return frames, record
    box = union_box(frames)
    flow = _flow(frames, box)
    if flow["hold"] > 1:
        record["skipped"] = f"drawn on {flow['hold']}s: a frame made beside the wrap would split a drawing"
        return frames, record
    images = {**{("loop", q): f for q, f in enumerate(frames)}, **{(side, q): f for side in OVERLAP_SIDES for q, f in others.get(side, {}).items()}}
    keys = list(images)
    at = {key: k for k, key in enumerate(keys)}
    states = flow_states([images[key] for key in keys], box)
    windows, scale = flow["windows"], flow["scale"]

    def between(a: np.ndarray, b: np.ndarray) -> np.ndarray:
        return np.array([np.linalg.norm(b[y0:y1, x0:x1] - a[y0:y1, x0:x1]) for y0, y1, x0, x1 in windows])

    def apart(side: str, q: int) -> np.ndarray:
        return between(states[at[side, q]], states[at["loop", q]]) / scale

    widths = [width for width in OVERLAP_WIDTHS if width + 2 <= n and width <= int(n * MADE_SHARE)]
    if not widths:
        record["skipped"] = f"a loop of {n} frames has no run beside its wrap that leaves half of it filmed"
        return frames, record
    plans = []
    for width in widths:
        sides = [(float(sum(apart(side, q).max() for q in overlap_run(side, width, n))), side) for side in OVERLAP_SIDES
                 if all(q in others.get(side, {}) for q in overlap_run(side, width + 1, n))]
        if sides:
            plans.append((width, min(sides)[1]))
    if not plans:
        record["skipped"] = "the clip holds no frames a cycle from the loop's beside the wrap"
        return frames, record
    if read is None:
        record["skipped"] = "no interpolator"
        return frames, record
    torso = torso if torso is not None else Torso(frames)
    record["torso"] = torso.said()
    points = {key: drift_points(images[key], torso) for key in keys}
    rel = flow["step"] / scale
    off_before = (flow["off"] / scale).max(axis=1)
    grid = np.linspace(0.0, 1.0, OVERLAP_GRID + 1)
    made_at: dict[tuple[Any, ...], tuple[Image.Image, dict[str, Any]]] = {}  # a frame at one weight, made once whatever the run

    def touching(fl: dict[str, Any], steps_at: set[int]) -> list[dict[str, Any]]:
        return [x for x in _surges(fl) if {(x["d"] + i) % n for i in range(x["r"])} & steps_at]

    for width, side in plans:
        run = overlap_run(side, width, n)
        # in play order, from the frame before the run to the frame after it, the wrap inside
        first = 0 if side == "after" else n - width
        stretch = [(first - 1 + i) % n for i in range(width + 2)]
        inner = set(stretch[1:-1])
        late = [(side, q) if side == "after" and q in inner else ("loop", q) for q in stretch]
        early = [("before", q) if side == "before" and q in inner else ("loop", q) for q in stretch]
        diff = np.stack([apart(side, q) for q in run]).max(axis=0)
        part = [w for w in range(len(windows)) if diff[w] >= OVERLAP_APART]
        rest = [w for w in range(len(windows)) if w not in part]
        steps_at = stretch[:-1]
        # the bounds of the eased retime: the stretch as the loop plays it, the clip's frames a cycle apart no part of them
        step_bound = flow["step"][steps_at].max(axis=0) / scale
        bound = np.abs(np.diff(np.array([points["loop", q] for q in stretch]), axis=0)).max(axis=0)
        # the line between each position's two frames, a step at a time, on the weight grid (`overlap_weights`)
        L_ = [states[at[key]] for key in late]
        E_ = [states[at[key]] for key in early]
        P = len(stretch) - 1
        line = np.zeros((P, len(grid), len(grid), len(windows)))
        moves = np.zeros((P, len(grid), len(grid), len(DRIFT_MEASURES)))
        for p in range(P):
            for w, (y0, y1, x0, x1) in enumerate(windows):
                a = (L_[p + 1] - L_[p])[y0:y1, x0:x1].ravel()
                b = (E_[p + 1] - L_[p + 1])[y0:y1, x0:x1].ravel()
                c = (E_[p] - L_[p])[y0:y1, x0:x1].ravel()
                u, v = grid[:, None], grid[None, :]
                sq = a @ a + v * v * (b @ b) + u * u * (c @ c) + 2 * v * (a @ b) - 2 * u * (a @ c) - 2 * u * v * (b @ c)
                line[p, :, :, w] = np.sqrt(np.maximum(sq, 0.0)) / scale[w]
            dl, de = points[late[p]], points[early[p]]
            nl, ne = points[late[p + 1]], points[early[p + 1]]
            moves[p] = np.abs((nl + grid[None, :, None] * (ne - nl)) - (dl + grid[:, None, None] * (de - dl)))
        chosen = overlap_weights(line, moves, rest, step_bound[rest], bound + DRIFT_PIXEL - EASE_MARGIN)
        tried: dict[str, Any] = {"side": side, "width": width, "frames": run, "stretch": stretch,
                                 "part": {"windows": [[round(v, 4) for v in flow["fractions"][w]] for w in part],
                                          "apart": [round(float(diff[w]), 4) for w in part]}}
        if chosen is None:
            tried.update(outcome="rejected", rejected_for=["no weighting keeps the body in bound"])
            record["tries"].append(tried)
            continue
        new = list(frames)
        weights = chosen["weights"]
        rows: dict[int, dict[str, Any]] = {}
        made_order = []
        for p in sorted(range(1, P), key=lambda p: (abs(weights[p - 1] - 0.5), p)):
            u, q = weights[p - 1], stretch[p]
            a, b = images[late[p]], images[early[p]]
            row: dict[str, Any] = {"frame": q, "t": round(u, 4), "proposal": None, "faults": [], "look": []}
            if u <= 0.0:
                frame = a
            elif u >= 1.0:
                frame = b
            else:
                key = (late[p], early[p], row["t"])
                if key not in made_at:
                    made_at[key] = overlap_frame(read, a, b, u, reads=reads)
                    record["calls"] += 1
                frame, said = made_at[key]
                row.update(said)
                made_order.append(q)
            rows[p] = row
            new[q] = frame
            if row["faults"]:
                break
        made_rows = [rows[p] for p in sorted(rows)]
        wrong = sorted({f for r in made_rows for f in r["faults"]})
        tried.update(eased=chosen["eased"], off_ease=chosen["off_ease"], weights=[round(w, 4) for w in weights], made=made_rows,
                     made_order=made_order)
        if wrong:
            tried.update(unmade=[stretch[p] for p in range(1, P) if p not in rows], faults=wrong,
                         look=sorted({w for r in made_rows for w in r["look"]}), outcome="rejected", rejected_for=["fault"])
            record["tries"].append(tried)
            continue
        shown = [q for q in run if new[q] is not frames[q]]
        after_flow = _flow(new, box, (flow["runs"], flow["hold"]))
        rel_after = after_flow["step"] / scale
        moved = np.abs(np.diff(np.array([drift_points(new[q], torso) for q in stretch]), axis=0)).max(axis=0)
        over = bool(np.any(~np.isfinite(moved)) or np.any(moved > bound + DRIFT_PIXEL + 1e-9))
        part_before = float(rel[steps_at][:, part].max()) if part else 0.0
        part_after = float(rel_after[steps_at][:, part].max()) if part else 0.0
        rest_after = rel_after[steps_at][:, rest].max(axis=0) if rest else np.zeros(0)
        faster = [w for w, a in zip(rest, rest_after) if a > step_bound[w] + 1e-9]
        off_after = (after_flow["off"] / scale).max(axis=1)
        had = {(x["d"], x["r"]) for x in touching(flow, set(steps_at))}
        rushes = [_said_surge(x, after_flow) for x in touching(after_flow, set(steps_at)) if (x["d"], x["r"]) not in had]
        seam_after = float(seam(new))
        counted = steps(new)
        rejected = ((["seam"] if seam_after > seam_max else [])
                    + (["steps"] if counted.get("verdict") != "two" else []) + (["drift"] if over else [])
                    + (["no gain"] if part and part_after >= part_before else [])
                    + (["off the flow"] if off_after[stretch].max() >= FLOW_LIMIT and off_after[stretch].max() > off_before[stretch].max() else [])
                    + (["a new rush"] if rushes else []) + (["the rest faster"] if faster else []))
        tried.update({"shown": shown, "seam": round(seam_after, 4), "steps": {key: counted.get(key) for key in ("verdict", "k", "ring", "why")}})
        tried["part"].update(step_max_before=round(part_before, 4), step_max_after=round(part_after, 4))
        tried.update({
            "rest": {"windows": [[round(v, 4) for v in flow["fractions"][w]] for w in rest],
                     "step_max_bound": [round(float(step_bound[w]), 4) for w in rest],
                     "step_max_after": [round(float(v), 4) for v in rest_after],
                     "faster": [[round(v, 4) for v in flow["fractions"][w]] for w in faster]},
            "drift": {"measures": list(DRIFT_MEASURES), "bound": [round(float(v), 3) for v in bound],
                      "moved": [round(float(v), 3) for v in moved], "over": over,
                      "body_mass": {"bound": mass_step([frames[q] for q in stretch]), "moved": mass_step([new[q] for q in stretch])}},
            "off_max": {"before": round(float(off_before[stretch].max()), 4), "after": round(float(off_after[stretch].max()), 4)},
            "rushes": rushes, "faults": wrong, "look": sorted({w for r in made_rows for w in r["look"]}),
            "outcome": "rejected" if rejected else "accepted"})
        if rejected:
            tried["rejected_for"] = rejected
        record["tries"].append(tried)
        if not rejected:
            record.update(side=side, width=width, frames=shown, seam_after=round(seam_after, 4))
            return new, record
    return frames, record


def _give_way(frames: list[Image.Image], j: int, ghosts: dict[int, float], interpolate: Interpolate | None,
              out: list[Image.Image], overlapped: set[int] = frozenset()) -> dict[str, Any]:
    """The round of a filmed ghost at `j` (`why` ghost), its cell replaced in `out` where it gives way.

    Where both frames beside it are clean, RIFE's frame half way between them is proposed and taken
    without a fault (`taken` rife); else, or where there is no interpolator, the clean frame beside it
    the cycle alignment would take (`interpolation_quality.clean_beside`, `taken` {source}); where
    both are filmed ghosts too it is kept (`taken` None). A frame the overlapped wrap made (`overlapped`) is not
    filmed: nothing is made from it, and a ghost beside it gives way to the filmed frame on its other side."""
    n = len(frames)
    a, b = (j - 1) % n, (j + 1) % n
    measure: dict[str, Any] | None = None
    wrong: list[str] = []
    no_proposal = ("a frame beside it is a filmed ghost too" if a in ghosts or b in ghosts
                   else "a frame beside it was made at the wrap" if a in overlapped or b in overlapped
                   else "no interpolator" if interpolate is None else None)
    if no_proposal is None:
        assert interpolate is not None
        made = interpolate(frames[a], frames[b], 0.5)
        if made.mode != "RGBA" or made.size != frames[j].size:
            raise ValueError("repair interpolator must return an RGBA frame of the original size")
        measure = {**smear(made, frames[a], frames[b]), "outline_shift": outline_shift(made, frames[a], frames[b]),
                   "ghost": ghost(made), "crossfade": crossfade(made, frames[a], frames[b], 0.5)}
        wrong = faults(measure)
        if not made.getchannel("A").getbbox():
            wrong.append("empty")
    beside = clean_beside(j, set(ghosts) | overlapped, n)
    taken: Any = "rife" if measure is not None and not wrong else {"source": beside} if beside is not None else None
    if taken == "rife":
        out[j] = made
    elif taken is not None:
        out[j] = frames[beside]
    return {"why": "ghost", "target": j, "neighbours": [a, b],
            "original": {**smear(frames[j], frames[a], frames[b]), "ghost": ghosts[j]},
            "proposal": measure, **({"no_proposal": no_proposal} if no_proposal else {}), "faults": wrong,
            "look": looks(measure) if measure is not None else [], "taken": taken,
            "outcome": "accepted" if taken == "rife" else "given-way" if taken is not None else "kept",
            **({"replaced": j} if taken is not None else {})}


def repair_jumps(frames: list[Image.Image], interpolate: Interpolate | None, *, facing: str = "right",
                 limit: float = FLOW_LIMIT, span: int = FLOW_SPAN, max_frames: int = MAX_REPAIRS,
                 screen: dict[str, Any] | None = None, ease: bool = True,
                 overlapped: Iterable[int] = (), torso: Torso | None = None) -> tuple[list[Image.Image], dict[str, Any]]:
    """Replace each filmed ghost the screen names, then take out each group of frames off the loop's flow and
    make it again with RIFE between the frames either side, worst first (docs/loop-repair.md section 2).

    `screen` is the ghost screen of `frames` as filmed (`interpolation_quality.ghost_screen`, read
    here when not given). Each ghost it names is a round of its own (`why` ghost, in frame order,
    outside the call budget): RIFE's frame between its two neighbours where both are clean and the
    frame has no fault, else the clean frame beside it (the frame after it, else the one before it),
    else, both being filmed ghosts too, the ghost kept (`_give_way`). The flow is then read on the
    loop as the ghosts left it (`flow_targets`, `why` flow): the worst group first, one call a drawing
    it takes, each drawing made at its own time between the group's neighbours (`between_time`) and
    shown on every frame the drawing was — the loop keeps its length, every frame its time, a drawing
    held on twos its two frames. At most `max_frames` calls; a group the calls left cannot pay for
    stops the stage (`left`). Never made from or beside a frame already made or given way: two made
    frames side by side are made from each other and melt the legs. A group whose made drawings carry
    a shared interpolation-quality fault — a ghost too, on its own coverage, where the screen reads
    the loop — keeps every frame it would take, as filmed, and nothing is made from or beside them
    (`refused`), and a drawing of it the loop as it plays still reads at or over `limit` off the flow is
    `unfixed`, with the faults that refused it (`_refused_left`); a made drawing that cross-fades two drawings inside its
    silhouette is still taken, its round naming it (`look`). `interpolate` may be None: a ghost then gives way to the clean frame
    beside it, and the flow search stops at the first group it would make, naming it (`unmade`). The
    flow is read again after each group, on the union box of the original loop. Then, on the loop as the rounds left
    it, the eased retime (`why` ease, `_ease`; `ease` false reads the rush and makes nothing): the worst rush
    (`surges`, recorded as `surge`) is eased over a stretch of EASE_WIDTHS drawings either side, made from the frames
    as filmed (a frame the flow made inside it is made again, `supersedes`), each drawing at the time `ease_times`
    chooses and shown on every frame it was; the stretch is taken only where no made frame has a fault, no body
    measure moves further than the stretch did and a pixel (`drift`, the body's point the torso, `torso` — the loop's
    `Torso` when not given, recorded as `torso`), the part's largest step falls (`part`), no
    frame is left further off the flow than the limit and before, no new rush appears in the rest of the body, no
    window of the rest of the body steps further than its own largest step over the stretch as it played (`rest`),
    and every one steps in each step of the stretch as far as it did there, to within EASE_BEAT of its usual step
    (`beat`) (`rejected_for` names what failed; a refused stretch leaves the loop as the flow groups left it). Its
    calls are its own, outside `max_frames` (`ease_calls`). `surge_after` is the reading of the loop as it now plays. `facing` reads nothing here: it is recorded for the jump guard of
    `video-loop-compare` (`restoration.jump`)."""
    out = list(frames)
    n = len(out)
    box = union_box(frames)
    screen = screen if screen is not None else ghost_screen(frames)
    reads = bool(screen["reads"])
    record: dict[str, Any] = {
        "reading": "flow", "limit": limit, "span": span, "max_frames": max_frames, "facing": facing,
        "off_max_before": round(float(flow_scores(frames, box=box)["off"].max()), 4), "replaced": [], "rounds": [],
        "refused": [], "attempts": 0,
    }
    if n < 4:
        record.update(stopped="loop shorter than 4 frames", off_max_after=record["off_max_before"])
        return out, record
    replaced: list[int] = []
    overlapped = set(overlapped)
    if overlapped:
        record["overlapped"] = sorted(overlapped)
    ghosts = {g["frame"]: g["ghost"] for g in screen["ghosts"] if g["frame"] not in overlapped}
    for j in sorted(ghosts):
        round_ = _give_way(frames, j, ghosts, interpolate, out, overlapped)
        record["rounds"].append(round_)
        if "replaced" in round_:
            replaced.append(j)
    refused: list[int] = []
    calls = 0
    while True:
        plan = flow_targets(out, limit=limit, span=span, box=box, fixed=[*replaced, *refused, *overlapped])
        record.setdefault("hold", plan["hold"])
        record.setdefault("drawings", plan["drawings"])
        if not plan["groups"]:
            stopped = ("no frame off the flow" if not plan["unfixed"] else
                       f"no group of up to {span} drawings brings the frames left off the flow under {limit:g} (`unfixed`)")
            break
        group = plan["groups"][0]
        need = len(group["drawings"])
        if calls + need > max_frames:
            stopped = (f"{max_frames} interpolation calls used" if calls >= max_frames else
                       f"the next group needs {need} interpolation calls, {max_frames - calls} left")
            record["left"] = [{"frames": g["frames"], "off": g["off"]} for g in plan["groups"]]
            break
        if interpolate is None:
            record["unmade"] = {k: group[k] for k in ("frames", "neighbours", "off")}
            stopped = "a frame to make off the flow and no interpolator"
            break
        ia, ib = group["neighbours"]
        a, b = out[ia], out[ib]
        made: list[tuple[list[int], Image.Image, dict[str, Any]]] = []
        for drawing in group["drawings"]:
            t = between_time(ia, drawing[0], ib, n)
            frame = interpolate(a, b, t)
            if frame.mode != "RGBA" or frame.size != out[drawing[0]].size:
                raise ValueError("repair interpolator must return an RGBA frame of the original size")
            measure = {**smear(frame, a, b), "outline_shift": outline_shift(frame, a, b),
                       "ghost": ghost(frame) if reads else None, "crossfade": crossfade(frame, a, b, t)}
            wrong = faults(measure) + ([] if frame.getchannel("A").getbbox() else ["empty"])
            made.append((drawing, frame, {
                "frames": drawing, "t": round(t, 4), "proposal": measure, "faults": wrong, "look": looks(measure),
                "original": {**smear(out[drawing[0]], a, b), "ghost": ghost(out[drawing[0]]) if reads else None}}))
        calls += need
        wrong = sorted({f for *_, m in made for f in m["faults"]})
        round_ = {"why": "flow", **group, "made": [m for *_, m in made], "faults": wrong,
                  "look": sorted({w for *_, m in made for w in m["look"]}), "outcome": "rejected" if wrong else "accepted"}
        if wrong:
            refused.extend(group["frames"])
        else:
            for drawing, frame, _ in made:
                for k in drawing:
                    out[k] = frame
            replaced.extend(group["frames"])
            round_["replaced"] = group["frames"]
        record["rounds"].append(round_)
    record.update(replaced=replaced, refused=refused, attempts=calls, stopped=stopped, unfixed=plan["unfixed"],
                  off_max_after=plan["off_max_before"])
    given = {j for j in replaced if j in ghosts}
    blocked = given | set(refused) | overlapped
    out = _ease(frames, out, interpolate, box, blocked, set(replaced) - given, set(replaced) | overlapped, reads, record, ease,
                torso)
    eased = [r for r in record["rounds"] if r["why"] == "ease" and r["outcome"] == "accepted"]
    if eased:
        record["replaced"] = [*replaced, *(t for t in eased[0]["replaced"] if t not in replaced)]
        record["off_max_after"] = round(float(flow_scores(out, box=box)["off"].max()), 4)
    if record["surge"] is not None:
        later = _flow(out, box)
        record["surge_after"] = next((_said_surge(s, later) for s in _surges(later)), None)
    if refused:
        record["unfixed"] = [*record["unfixed"], *_refused_left(out, box, record["rounds"], limit)]
    return out, record


def _refused_left(frames: list[Image.Image], box: tuple[int, int, int, int], rounds: list[dict[str, Any]],
                  limit: float) -> list[dict[str, Any]]:
    """The drawings of the flow groups the rounds refused that the loop as it now plays still reads at or over `limit` off
    its flow: a group refused keeps its frames as filmed, so a jump is left there. Each as `flow_targets` names a drawing
    `unfixed` — its frames and its reading (`off`, `turn`, `into`, `out`, `window`), here on the loop as it plays — and
    the faults that refused its group (`refused`)."""
    flow = _flow(frames, box)
    scores = _drawing_scores(flow)
    faults_of = {t: r["faults"] for r in rounds if r["why"] == "flow" and r["outcome"] == "rejected" for t in r["frames"]}
    left = []
    for d, run in enumerate(flow["runs"]):
        hit = [t for t in run if t in faults_of]
        if not hit or scores["off"][d] < limit:
            continue
        left.append({"frames": run, **{k: round(float(scores[k][d]), 4) for k in ("off", "turn", "into", "out")},
                     "window": [round(v, 4) for v in flow["fractions"][int(scores["window"][d])]], "refused": faults_of[hit[0]]})
    return left


# --- the seam bridge (docs/loop-repair.md section 2, "The seam bridge") -------------------------------------------

# A loop that is not a walk — an idle, an action cut whole — is not read for its flow: an idle's blinks and half-shut
# eyes leave the walk's flow, and the flow repair would make them again. Its wrap alone is read, on the frames as they
# play (`loop.cell_features`, the seam gate's own thumbnail): the step from its last frame to its first against the mean
# of the SURGE_AROUND steps either side of it. A wrap over the gate's limit there jumps, and the frames round it are made
# again by RIFE between the frames either side, the fewest first.
BRIDGE_WIDTHS = (1, 2, 4)  # frames made round the wrap: ceil(m / 2) before it and floor(m / 2) after
BRIDGE_MIN_FRAMES = 2 * SURGE_AROUND + max(BRIDGE_WIDTHS) + 2  # the widest stretch and the steps either side, none shared


def bridge_run(width: int, count: int) -> list[int]:
    """The frames a bridge `width` frames wide makes round the wrap of a loop `count` frames long, in play order."""
    return [*range(count - (width + 1) // 2, count), *range(width // 2)]


def _ring(flat: np.ndarray) -> np.ndarray:
    """A loop's steps as it plays, on its frames' features: `ring[k]` from frame k to the next, the last into the first."""
    return np.abs(np.roll(flat, -1, axis=0) - flat).mean(axis=1)


def _around(ring: np.ndarray, first: int, last: int) -> float:
    """The mean of the SURGE_AROUND steps before step `first` and after step `last` of a loop's steps (`_ring`)."""
    n = len(ring)
    near = [(first - 1 - i) % n for i in range(SURGE_AROUND)] + [(last + 1 + i) % n for i in range(SURGE_AROUND)]
    return max(float(ring[near].mean()), 1e-12)


def seam_bridge(frames: list[Image.Image], interpolate: Interpolate | None, *, limit: float, hold: int | None,
                facing: str = "right", skip: str | None = None) -> tuple[list[Image.Image], dict[str, Any]]:
    """The seam bridge (docs/loop-repair.md section 2, "The seam bridge") of a loop that is not a walk.

    The wrap jumps where its step is over `limit` (the seam gate's) times the mean of the SURGE_AROUND steps either side
    of it, and over `loop.PIN_NOISE_MAX`, the re-render noise of a pinned first frame: a near-still loop moves so
    little a step that its ratios are large where nothing shows. Read on the frames as they play, cropped to their union
    box, on the seam gate's thumbnail (`loop.cell_features`). A loop drawn on twos or threes (`hold`, the cut's own,
    `held.measure_cycle`) is not bridged: a frame made round the wrap would split a drawing, and a loop that changes its
    drawing every other step reads the wrap against steps of nothing.

    A wrap that jumps is bridged BRIDGE_WIDTHS frames at a time, the fewest first (`bridge_run`): each frame made by
    `interpolate` between the frames either side of the run, at its own time (`between_time`), so the loop keeps its
    length. Before a frame is made the straight line between the two (their thumbnails, mixed in steps of one) is read:
    a run whose line leaves a step of the stretch from one to the other over `limit` times the mean of the steps
    either side is not made, a reading RIFE's frames have not brought under it on any loop measured. A run is taken
    where none of its frames carries an interpolation fault (`interpolation_quality.faults`, a ghost read where the
    ghost screen reads the stretch and the steps either side) and, read again with them, every step of the stretch is
    within `limit` times the mean of the steps either side; the first run taken ends the search. Where none is, the
    loop is kept as filmed for the seam gate to judge. At most 1 + 2 + 4 frames are made.

    `interpolate` None reads the wrap and stops at the first run to make (`unmade`). `skip` (why) reads nothing.
    `facing` reads nothing here: it is recorded for the jump guard of `video-loop-compare` (`restoration.jump`)."""
    from sprite_gen.video import loop as loop_mod  # loop imports this module

    n = len(frames)
    record: dict[str, Any] = {"reading": "seam", "limit": limit, "floor": loop_mod.PIN_NOISE_MAX, "around": SURGE_AROUND,
                              "widths": list(BRIDGE_WIDTHS), "facing": facing, "replaced": [], "tries": [], "calls": 0}
    if skip is not None:
        record["skipped"] = skip
        return frames, record
    if n < BRIDGE_MIN_FRAMES:
        record["skipped"] = f"a loop of {n} frames, under {BRIDGE_MIN_FRAMES}: no steps either side of the widest stretch"
        return frames, record
    box = loop_mod.cells_box(frames)
    flat = loop_mod.cell_features(frames, box)
    ring = _ring(flat)
    wrap = float(ring[-1])
    seam = wrap / _around(ring, n - 1, n - 1)
    record.update(seam=round(seam, 4), wrap=round(wrap, 5), hold=hold)
    if hold is not None and hold > 1:
        record["skipped"] = "drawn on twos or threes: a frame made round the wrap would split a drawing"
        return frames, record
    if seam <= limit or wrap <= loop_mod.PIN_NOISE_MAX:
        record["skipped"] = "the wrap reads as a step of the loop"
        return frames, record
    reads: bool | None = None
    for width in BRIDGE_WIDTHS:
        run = bridge_run(width, n)
        a, b = (run[0] - 1) % n, (run[-1] + 1) % n
        stretch = [(a + i) % n for i in range((b - a) % n)]
        line = float(np.abs(flat[b] - flat[a]).mean()) / len(stretch) / _around(ring, stretch[0], stretch[-1])
        tried: dict[str, Any] = {"width": width, "frames": run, "anchors": [a, b], "line": round(line, 4)}
        record["tries"].append(tried)
        if line > limit:
            tried.update(outcome="rejected", rejected_for="line")
            continue
        if interpolate is None:
            record["unmade"] = {k: tried[k] for k in ("frames", "anchors", "line")}
            break
        if reads is None:
            # the ghost screen on the stretch and the steps either side, read once a frame is to be made
            near = sorted({(a - SURGE_AROUND + i) % n for i in range(len(stretch) + 2 * SURGE_AROUND + 1)})
            reads = bool(ghost_screen([frames[k] for k in near])["reads"])
        out = list(frames)
        made = []
        for k in run:
            t = between_time(a, k, b, n)
            frame = interpolate(frames[a], frames[b], t)
            record["calls"] += 1
            if frame.mode != "RGBA" or frame.size != frames[k].size:
                raise ValueError("repair interpolator must return an RGBA frame of the original size")
            measure = {**smear(frame, frames[a], frames[b]), "outline_shift": outline_shift(frame, frames[a], frames[b]),
                       "ghost": ghost(frame) if reads else None, "crossfade": crossfade(frame, frames[a], frames[b], t)}
            made.append({"frame": k, "t": round(t, 4), "proposal": measure, "look": looks(measure),
                         "faults": faults(measure) + ([] if frame.getchannel("A").getbbox() else ["empty"])})
            out[k] = frame
        after_ring = _ring(loop_mod.cell_features(out, box))
        after = float(after_ring[stretch].max()) / _around(after_ring, stretch[0], stretch[-1])
        wrong = sorted({f for m in made for f in m["faults"]})
        tried.update(made=made, faults=wrong, look=sorted({w for m in made for w in m["look"]}), after=round(after, 4))
        if wrong or after > limit:
            tried.update(outcome="rejected", rejected_for="fault" if wrong else "seam")
            continue
        tried["outcome"] = "accepted"
        record.update(replaced=run, width=width, seam_after=tried["after"])
        return out, record
    return frames, record


# --- the jolt index (docs/loop-repair.md section 3) ------------------------------------------

# Reference bounds, at the edge of what was kept on the 2026-10-03 takes (section 3): nothing kept
# exceeds them, and the back-diagonal take refused because "it jumps" does. A loop beyond them is
# warned about; it fails only when a caller passes a bound (--jolt-max / --head-step-max), because
# eleven judged takes are too few to refilm on, and at these values 16 of 30 Lite takes would be.
JOLT_REFERENCE = 0.43  # alpha jolt index; the kept takes reached 0.414 on strip cells, 0.4225 on the cut frames video-loop reads
HEAD_STEP_REFERENCE = 0.75  # head's sideways move in one frame, % of body height; kept <= 0.68, refused 0.82
HEAD_BAND = 0.20  # the head is the top fifth of the body's height over the loop
HEAD_MEDIAN_FLOOR = 0.05  # % of body height: a median step below this is the tracker's rounding
# The top band's step into the loop's first frame, over the loop's median step, beyond which the
# wrap pops (docs/loop-repair.md section 3, "The seam pop"). It sits between walks holding a part
# that sways on its own beat and walks without one, on the cut as it plays and on the source frames
# the cut is chosen from. Above it the cut is chosen again (`--anchor motion-auto`), and it is the
# seam pop gate's default bound (`video-loop --seam-pop-max`): a loop that pops over it is refused,
# with the gate off a warning line.
SEAM_POP_REFERENCE = 10.0
# The held side's seam (docs/loop-repair.md section 3, "The held side"): a held part that swings on
# its own beat misses below its top too — under the hand, where the top band does not reach. Read
# on the silhouette's outer edge on the side the top band sits on, row by row: how far the cut's
# wrap is from the clip's own way on there, in place and in speed, over that row's median step in
# the loop; the HELD_EDGE_QUANTILE-th percentile of the rows. Under HELD_EDGE_REFERENCE the held
# side closes. On a walk without a held part the edge is the hair or an arm, and the same reading
# runs as high as on a staff that does not close, so it is read only on a cut whose top band pops
# (`--anchor motion-auto` chooses again there), where the top band has found the held part and its
# side. The bound sits between cuts that close a held staff and cuts where it swings back at the wrap.
HELD_EDGE_REFERENCE = 1.2
HELD_EDGE_QUANTILE = 80
HELD_EDGE_FLOOR = 0.005  # of the body height, a pixel at least: a row's median step under it is the edge's rounding
HELD_EDGE_ALPHA = 128  # alpha at or above this is the edge (0..255)


def jolt_index(step_values: np.ndarray) -> float:
    """How far each step strays from the mean of its two neighbours, on average, over the median
    step. 0 for a loop whose steps change evenly; alternating big and small steps read high."""
    n = len(step_values)
    med = float(np.median(step_values))
    if n < 3 or med <= 0:
        return 0.0
    return float(np.mean([abs(step_values[k] - (step_values[k - 1] + step_values[(k + 1) % n]) / 2) for k in range(n)]) / med)


def _track_stats(values: np.ndarray) -> dict[str, float]:
    n = len(values)
    d = np.abs(np.array([values[(k + 1) % n] - values[k] for k in range(n)]))
    med = float(np.median(d))
    return {"step_max_pct": round(float(d.max()), 3), "step_median_pct": round(med, 3),
            "max_over_median": round(float(d.max()) / max(med, HEAD_MEDIAN_FLOOR), 3),
            "range_pct": round(float(np.ptp(values)), 3), "worst_into_frame": int((np.argmax(d) + 1) % n)}


def head_track(alphas: list[np.ndarray]) -> dict[str, Any]:
    """The head's place frame by frame, in % of the body's height over the loop: x is the coverage
    centroid of the top fifth (HEAD_BAND), y the body's top line. A take whose head pops sideways
    reads here while its coverage change stays ordinary (2026-10-03, Lite back diagonal)."""
    x, y, height = _head_series(alphas)
    return {"body_height_px": height, "x": _track_stats(x), "y": _track_stats(y)}


def _head_series(alphas: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray, int]:
    """`head_track`'s two places per frame (% of the body height) and the body height in px."""
    rows = np.where(np.max(np.stack(alphas), axis=0).max(axis=1) > 0.1)[0]
    if rows.size == 0:
        raise ValueError("every loop frame is fully transparent")
    top, bottom = int(rows.min()), int(rows.max())
    height = max(1, bottom - top)
    band = slice(top, top + max(1, int(height * HEAD_BAND)))
    xs, ys = [], []
    for a in alphas:
        b = a[band]
        mass = float(b.sum())
        xs.append(float((b.sum(axis=0) * np.arange(b.shape[1])).sum() / mass) if mass > 0 else float("nan"))
        filled = np.where(a.sum(axis=1) > 0.5)[0]
        ys.append(float(filled.min()) if filled.size else float("nan"))
    x = np.array(xs) / height * 100
    y = np.array(ys) / height * 100
    if not (np.isfinite(x).all() and np.isfinite(y).all()):
        raise ValueError("a loop frame has no head to track")
    return x, y, height


def seam_pop(alphas: list[np.ndarray]) -> dict[str, Any]:
    """How far the top of the silhouette jumps into the loop's first frame (docs/loop-repair.md
    section 3, "The seam pop").

    The top band `head_track` reads is the head, or the tip of whatever the body holds higher than its
    head — a staff, a flag, a raised spear. A thin part like that can sway on its own beat, slower than
    the steps: a cut one step long then ends with it somewhere else, and it jumps at the wrap while
    the body closes. The seam ratio is an area measure and hardly sees a thin part move: a tip that
    jumps many times its usual step changes few pixels.

    Per axis, the wrap's step (last frame -> first) over the loop's median step, a pixel at least: a
    step under a pixel is the tracker's rounding. It pops when the wrap is that axis' largest step
    and exceeds SEAM_POP_REFERENCE times the median; `pop` is the larger of the two, 0 when neither
    axis has its largest step at the wrap. A loop whose top jitters more inside than at the wrap
    (hair redrawn every frame) has its wrap ordinary for it."""
    x, y, height = _head_series(alphas)
    floor = max(HEAD_MEDIAN_FLOOR, 100.0 / height)
    record: dict[str, Any] = {"body_height_px": height, "reference": SEAM_POP_REFERENCE}
    pop = 0.0
    for axis, values in (("x", x), ("y", y)):
        n = len(values)
        d = np.abs(np.array([values[(k + 1) % n] - values[k] for k in range(n)]))
        over = float(d[-1]) / max(float(np.median(d)), floor)
        worst = bool(d[-1] >= d.max())
        record[axis] = {"wrap_pct": round(float(d[-1]), 3), "step_median_pct": round(float(np.median(d)), 3),
                        "wrap_over_median": round(over, 3), "wrap_is_largest": worst}
        if worst:
            pop = max(pop, over)
    record["pop"] = round(pop, 3)
    record["pops"] = pop > SEAM_POP_REFERENCE
    return record


def seam_pop_of(frames: list[Image.Image]) -> dict[str, Any]:
    """`seam_pop` of a loop's frames read as `measure_jolt` reads the loop (their alpha in their union box), or
    `skipped` (why) where the top band cannot be read."""
    try:
        return seam_pop(coverage(frames, union_box(frames)))
    except ValueError as exc:
        return {"skipped": str(exc)}


def held_side(masks: list[np.ndarray]) -> str:
    """The side of the body the top band (HEAD_BAND) sits on, "left" or "right": where a part held
    higher than the head is held. `masks` are a cut's frames, True where the body is."""
    stack = np.stack(masks)
    rows = np.where(stack.any(axis=(0, 2)))[0]
    if rows.size == 0:
        raise ValueError("every loop frame is fully transparent")
    top, bottom = int(rows.min()), int(rows.max())
    band = stack[:, top:top + max(1, int(max(1, bottom - top) * HEAD_BAND))]
    cols = np.arange(stack.shape[2])
    body, tip = stack.sum(axis=(0, 1)), band.sum(axis=(0, 1))
    return "right" if float((tip * cols).sum()) / float(tip.sum()) >= float((body * cols).sum()) / float(body.sum()) else "left"


def side_edges(masks: list[np.ndarray], side: str) -> np.ndarray:
    """(frames, rows): each row's outermost body column on `side`, NaN where the row is empty."""
    stack = np.stack(masks)
    filled = stack.any(axis=2)
    if side == "right":
        edge = stack.shape[2] - 1 - stack[:, :, ::-1].argmax(axis=2)
    else:
        edge = stack.argmax(axis=2)
    out = edge.astype(np.float64)
    out[~filled] = np.nan
    return out


def held_edge(edges: np.ndarray, start: int, length: int) -> dict[str, Any]:
    """The held side's seam of a cut (start, length) of a clip whose side edges are `edges`
    (`side_edges`), section 3, "The held side".

    A loop closes where its last frame is the frame before its first and its first the frame after its
    last: per row, the cut's first frame against the clip's frame after its last, its last against the
    clip's frame before its first, and the step into and out of each against the clip's own (a part
    that comes back to its place moving the other way swings back at the wrap). Their mean over the
    row's median step in the loop, a floor of HELD_EDGE_FLOOR; the HELD_EDGE_QUANTILE-th percentile
    over the rows is `seam`, and the held side `closes` under HELD_EDGE_REFERENCE. Raises ValueError
    for a cut with fewer than two clip frames on either side, or no row to read."""
    n = len(edges)
    s, L = start, length
    if s < 2 or s + L + 1 >= n:
        raise ValueError("the clip has no two frames either side of the cut to read its wrap against")
    loop = edges[s:s + L]
    rows = np.where(np.isfinite(loop).any(axis=0))[0]
    if rows.size == 0:
        raise ValueError("every loop frame is fully transparent")
    steps = np.abs(np.diff(np.vstack([loop, loop[:1]]), axis=0))
    terms = np.stack([np.abs(edges[s] - edges[s + L]),
                      np.abs((edges[s + 1] - edges[s]) - (edges[s + L + 1] - edges[s + L])),
                      np.abs(edges[s + L - 1] - edges[s - 1]),
                      np.abs((edges[s + L - 1] - edges[s + L - 2]) - (edges[s - 1] - edges[s - 2]))])
    with np.errstate(invalid="ignore"):
        counted = np.isfinite(steps).sum(axis=0)
        median = np.where(counted > 0, np.nanmedian(np.where(counted > 0, steps, 0.0), axis=0), np.nan)
        read = np.isfinite(terms).sum(axis=0)
        mean = np.where(read > 0, np.nansum(terms, axis=0) / np.maximum(read, 1), np.nan)
    floor = max(1.0, HELD_EDGE_FLOOR * float(rows.max() - rows.min()))
    ratio = mean / np.maximum(median, floor)
    ratio = ratio[np.isfinite(ratio)]
    if ratio.size == 0:
        raise ValueError("no row has the held side's edge in the frames its wrap is read on")
    seam = round(float(np.percentile(ratio, HELD_EDGE_QUANTILE)), 3)
    return {"seam": seam, "closes": seam < HELD_EDGE_REFERENCE, "rows": int(ratio.size), "reference": HELD_EDGE_REFERENCE}


def held_edge_verdict(shape: dict[str, Any] | None) -> list[str]:
    """The held side of a cut chosen again on its top band (`cycle.seam_pop.held_edge`), in words, when
    the chosen cut does not close it or it could not be read; empty otherwise (and for a cut whose top
    band did not pop, where it is not read)."""
    held = (shape or {}).get("held_edge")
    if not held:
        return []
    if "skipped" in held:
        return [f"the top of the silhouette jumps at the first choice, and the side its held part is on could not be read "
                f"({held['skipped']}): whether the part closes below its top at this cut is not known"]
    chosen = held["chosen"]
    if "skipped" in chosen:
        return [f"the held part's side ({held['side']}) could not be read at this cut ({chosen['skipped']}): whether it "
                "closes below its top is not known"]
    if chosen["closes"]:
        return []
    line = (f"the held part does not close at the wrap on the {held['side']} side of the silhouette, below its top: "
            f"{chosen['seam']:.2f}x its rows' median step (over {held['reference']:g}); ")
    capped = held.get("two_step_capped")
    if capped:
        # An explicit --max-len is the caller's ceiling: windows two lengths long past it are not read.
        low, high = capped["lengths_over"]
        return [line + f"no window one length long closes it, and windows two lengths long ({low}-{high} frames) are over "
                f"--max-len {capped['max_len']}, so they were not read"]
    if not held.get("two_step", {}).get("read", True):
        # The steps were counted (video-loop --steps): the cut is the count's, nothing longer is read.
        return [line + "no window of the counted length closes it"]
    return [line + "no window one or two lengths long closes it — it swings on a beat of its own"]


def measure_jolt(frames: list[Image.Image], *, facing: str = "right") -> dict[str, Any]:
    """The jolt index of a loop as it plays, and the head's frame-to-frame moves."""
    al = coverage(frames, union_box(frames))
    whole, hair = steps(al), steps(al, hair_box(facing))
    med = float(np.median(whole))
    try:
        head: dict[str, Any] = head_track(al)
        pop: dict[str, Any] = seam_pop(al)
    except ValueError as exc:
        head = {"skipped": str(exc)}  # recorded, and the head gate says it could not read it
        pop = {"skipped": str(exc)}
    return {
        "index": round(jolt_index(whole), 4),
        "hair_index": round(jolt_index(hair), 4),
        "step_max_over_median": round(float(whole.max()) / med, 4) if med > 0 else None,
        "head": head,
        "seam_pop": pop,
    }


def seam_pop_verdict(measured: dict[str, Any], *, head_step_max: float | None = HEAD_STEP_REFERENCE) -> list[str]:
    """The top band's jump into the loop's first frame, in words, when it pops (section 3, "The seam
    pop"); empty otherwise. A sideways jump the head bound already names (`jolt_verdict`, into frame
    0) is not said twice."""
    pop = measured.get("seam_pop") or {}
    if "skipped" in pop or not pop.get("pops"):
        return []
    head = measured["head"].get("x", {})
    said = head_step_max is not None and head.get("step_max_pct", 0) > head_step_max and head.get("worst_into_frame") == 0
    axes = [(axis, pop[axis]) for axis in ("y", "x") if pop[axis]["wrap_is_largest"]
            and pop[axis]["wrap_over_median"] > pop["reference"] and not (axis == "x" and said)]
    if not axes:
        return []
    return ["the top of the silhouette jumps into the loop's first frame " + _pop_axes(axes)
            + f" (over {pop['reference']:g}x): a part held above the head swings on its own beat and does not close at this cut"]


def _pop_axes(axes: list[tuple[str, dict[str, Any]]]) -> str:
    words = {"x": "sideways", "y": "up or down"}
    return ", ".join(f"{words[a]} {v['wrap_pct']:.2f} % of the body height, {v['wrap_over_median']:.1f}x its median step" for a, v in axes)


def seam_pop_gate(pop: dict[str, Any], *, pop_max: float | None) -> dict[str, Any]:
    """The seam pop as a gate (section 3, "The seam pop"): `pop` (`seam_pop`, or `skipped`) against `pop_max`
    (`video-loop --seam-pop-max`, SEAM_POP_REFERENCE by default; None: off). `verdict` is `refused` where the pop is
    over `pop_max`, `passed` where it is not, `unreadable` where the top band could not be read — not refused, and
    `why` says it — and `off` with the pop as read."""
    if pop_max is None:
        return {"verdict": "off", "max": None, "pop": pop.get("pop")}
    if "skipped" in pop:
        return {"verdict": "unreadable", "max": pop_max, "pop": None, "why": pop["skipped"]}
    return {"verdict": "refused" if pop["pop"] > pop_max else "passed", "max": pop_max, "pop": pop["pop"]}


def seam_pop_words(pop: dict[str, Any], pop_max: float) -> str:
    """Where the top band jumps into the loop's first frame over `pop_max` times its median step, in words: each axis
    whose largest step is the wrap and over the bound, how far (% of the body height) and how many times its step."""
    return _pop_axes([(axis, pop[axis]) for axis in ("y", "x")
                      if pop[axis]["wrap_is_largest"] and pop[axis]["wrap_over_median"] > pop_max])


def jolt_verdict(measured: dict[str, Any], *, jolt_max: float | None = JOLT_REFERENCE,
                 head_step_max: float | None = HEAD_STEP_REFERENCE) -> list[str]:
    """What exceeds the bounds, in words; empty when the loop stays inside. A bound of None is not checked."""
    over = []
    if jolt_max is not None and measured["index"] > jolt_max:
        over.append(f"jolt index {measured['index']:.3f} exceeds {jolt_max}")
    if head_step_max is None:
        return over
    if "skipped" in measured["head"]:
        over.append(f"the head could not be tracked ({measured['head']['skipped']})")
        return over
    head = measured["head"]["x"]
    if head["step_max_pct"] > head_step_max:
        over.append(f"the head moves sideways {head['step_max_pct']:.2f} % of the body height in one frame "
                    f"(into frame {head['worst_into_frame']}), over {head_step_max} %")
    return over
