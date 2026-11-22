# SPDX-License-Identifier: Apache-2.0
"""A walk whose body turns inside its clip, read frame by frame (`video-loop --anchor motion-auto`, `--body-turn`;
docs/video-pipeline.md section 4, "The body turn").

A clip filmed from a still walks at the still's angle, or should: a back-diagonal walk that turns to a full back view
half way and back holds no two steps in one facing, and a cut across the turn plays the body swinging round. The
reading (`torso-side-v2`) puts each frame's torso between the clip's first frame — the still it was filmed from, a
standing pose, lead-in or not — and that frame mirrored about its head: `side = (v.s - v.m) / (1 - s.m)`, 1 where the
torso shows the side the still's does, 0 where it is as near the still as its mirror (a body seen square, from behind or
in front), under 0 past it. A pose the walk changes moves both correlations alike; a turn moves them apart. Each clip is
read against its own first frame, never against a kind of motion or a direction's name. Not against the first frame
after a lead-in (the video model reframing the still to the walk's size, which the search leaves out): that frame is a
stride's pose, whose mirror the walk draws half a cycle on, so a walk that does not turn reads a turn every stride (a
synthetic one, least -0.34). The still filmed small reads blurred, but hardly: a synthetic walk filmed from 0.6 of its
size for 8 frames reads +0.87 at least where it does not turn (+0.92 filmed from its own size), and where it turns,
the turn over the frames it reads it over filmed from its own size, a turn of 4 frames too (turning over frames 30-40,
least -0.71 against -0.63).

Four named bounds:

- SIDE_SHOWN_MIN: how far the still's head and shoulders (the top 45 % of its body) lie off their nearest mirror
  (1 - s.m; GUARD, below) for the clip to be read at all. Under it the still is seen square — a front or back walk,
  whose far step lays the torso nearer its mirror each step — and its facing is not read: a square still that turns to
  a diagonal is not seen. 0.08 lies between the synthetic walkers seen at an angle, 0.090 off it or more (the hooded
  one; the plain one 0.102), and the one seen square from behind with a 36 px piece beside its head in the still,
  0.060 at most.
- WALK_SIDE_MIN: how much nearer the still's head and shoulders than their mirror the walk's lie at the median, or
  nearer the mirror's, for the clip to be read (`walk_side`: each frame after the still, its top 45 % cropped about its
  own head as wide as the still's, against the still's and against its mirror, each at its nearest about the axes
  within GUARD px of the still's centre, v.s - v.m). Under it either way the walk is seen square: a front or back walk
  whose still shows a side its walk does not — a piece beside the head in the still alone, or the still taken where
  the arms swing apart — lies as near the still's mirror as the still, each frame's mirror a frame of the walk half a
  stride on, and read against the still it reads a turn every stride (the synthetic walker seen square from behind,
  taken 6 frames into its stride, its still 0.148 off its mirror: turns over frames 7-17, 31-41 and 55-65; its walk
  0.000 at the median). The median is of the walk's drawings, not of the time the clip gives each: a frame that holds
  the drawing last counted (the still the first) is not counted again. Each frame of a square walk lies as near the
  still's mirror as its frame half a stride on lies near the still, and a clip that holds one half of the stride longer
  than the other lay toward the half held longer at the median of its frames: the same walker, each drawing of the first
  half of each stride held 3 frames and each of the second 1 (147 frames), 0.075, and it read turns over frames 19-29,
  67-77 and 115-125; each drawing counted once, 0.000, as on ones. A frame holds the drawing last counted where under
  HELD_MAX (0.5 %) of that drawing's solid pixels flip in it, not only where it is the same pixels: the codec and the
  key leave hardly a held frame of a clip as it was. Through libx264 at crf 0 to 28 and `video-frames`' key, at most 2
  of that clip's 74 held frames came back the frame before's pixels, and the rest with up to 0.9 % of their solid pixels
  flipped (under 0.5 % in 99 of 100 at crf 23, the default): counted again wherever not the same pixels, the walk lay
  0.076 to 0.083 off and read the turns; counted once under HELD_MAX, 0.013 at most, and not read. Against the drawing
  last counted, not the frame before: a walk whose every frame flips under HELD_MAX of the one before (a large or slow
  body; the synthetic square walker stepped from each drawing to the next over such frames) is counted each time it has
  moved HELD_MAX from the drawing last counted, and its walk lies under WALK_SIDE_MIN, as its drawings' does; held
  against the frame before, no frame of it was counted, and it was read with no walk's side to hold it. A drawing of the
  synthetic walkers flips 1.9 % of the one before's solid pixels at least, but the front walker of
  tests/video/test_walk_steps.py with a 70 px tail: 0.44 % at one drawing and none at another, square either way. A walk
  seen at an angle lies nearer the still's side (the plain walker 0.101, the hooded one 0.090); one turned past the
  still's mirror over most of its frames lies nearer the mirror's, under 0, and is read with its turn. 0.045 lies
  between the synthetic walkers seen at an angle, 0.061 at least (the side walker of tests/video/test_walk_steps.py with
  a 60 px tail on a beat of its own), and those seen square: 0.000 with a piece beside the head or the arms swung apart
  in the still, or the front walker of tests/video/test_walk_steps.py with a 70 px tail. The frames alone do not tell a
  front or back walk whose still shows a side from a body that turned for much of its walk, to face the camera or to its
  mirror (its frames square at the median, its still at an angle; the named limits below): each is left unread, and
  `video-loop` says so in a warning line (`square`), the cut as the search alone cuts it.
- TURN_SIDE_MAX: a frame whose torso reads under it is turned.
- TURN_RUN_MIN: a turn is that many turned frames in a row or more, counted in frames — the time the clip plays them —
  not in drawings: a walk held on twos holds a turn as long as one drawn on ones does, in half the drawings. A shorter
  dip is the walk's own.

Each frame is read by its mass (MASS_SHARE, the speck bound of sprite_gen/video/frames.py: a hundredth). Its box tops at
the row with a hundredth of its solid pixels over it, and the still's torso is held as wide, about the head, as the
columns of its torso rows with a hundredth of those rows' pixels beside them. A fleck apart from the body, a part of its
own cut loose (its toes, a tail's tip, an ornament) or a thin part (an antenna, a whisker) is under a hundredth and
moves neither: `torso-side-v1` read the box from the frame's topmost and outermost solid pixel, and a 3 px fleck over
the head for 10 frames read a turn over them, while an ornament cut loose beside the head hid the turn the walk made
(synthetic walkers, tests/video/test_loop_body_turn.py). The box's bottom is its last solid row, as `torso-side-v1`
read it — the one end the mass does not set: where the legs cross each stride they lay their pixels over each other,
and a bottom read by mass rises with them (the synthetic lead-in walker's, a row over its last solid row in most
frames, 3 where they cross), the crop's rows with it; its turns read over the same frames either way.

Each crop is centred on the head: the middle of the top 15 % of the body (HEAD_SHARE), of its columns holding at least
HEAD_CORE (half) of the fullest one's solid pixels — a fleck or an ornament beside the head, a few rows of each column,
does not count — read again on those within HEAD_REACH of the body's height of it until it settles. A part swung up
beside the head (a tail on a beat of its own, a held prop) would pull a plain mass centre aside every swing, and the
torso would read as turning with it (a synthetic side walk with a 60 px tail on a 45-frame beat read a turn every
swing, least -0.19); where nothing lies that far out, the middle is the mass centre itself. Where nothing lies within
HEAD_REACH of the middle — the top's parts lie apart either side of it: a prop held as high as the head and apart from
it, or a body too small for a pixel to lie that near — the top does not tell which part is the head, and the frame is
not read (None in `side`, its why in `unread`); a still not read so leaves the clip unread, cut as the search alone cuts
it. The largest part is not taken for the head: a prop can weigh what the head does in those rows (a synthetic staff's
ornament beside the head weighs the same), and a crop about the prop would read turns the body does not make, which the
cut search would leave out, or `--body-turn refuse` refuse.

The crop's axis is the middle of the centre's column (column c spans c to c + 1), and its edges lie where they fall,
between pixels too, the crop resampled from the frame about them: a body that is its own mirror about its head crops as
its own mirror wherever its centre falls (`torso-side-v1` rounded each edge to a whole pixel, and the synthetic walker
drawn in one grey lay 0.050 off its mirror, a side its silhouette does not show). A part holding over HEAD_CORE of the
fullest column in each of its own columns still moves the centre — a column 3 wide and 12 tall beside a head 19 rows
tall, 1.4 px — and read about a centre 0.75 px off, `torso-side-v1` read a walk that does not turn as turning every
stride. So each crop is read about the axes STEP (a quarter of a pixel) apart either side of the centre as well, each
as wide as the centre's:

- GUARD: the still's head and shoulders lie off their nearest mirror about any axis within 2.5 px of the centre — the
  side SIDE_SHOWN_MIN bounds — and each frame's lie nearer them or their mirror, each at its nearest (WALK_SIDE_MIN).
  The walker seen square from behind with that column 6 px beside its head in the still lies 0.060 off it; about the
  axes within 2 px, or a pixel apart, 0.093, and its walk, 0.000 at the median, is not read either way: read with
  WALK_SIDE_MIN at 0, it reads turns it does not make.
- TOL: each frame's torso is read against the still's torso and against its mirror, each at its nearest about any axis
  within 2 px of the still's centre. The walk with the still's centre read up to a pixel off reads no turn, no frame's
  side 0.07 from where it reads; the walker filmed small with that column beside its head over frames 30-39 reads no
  turn there, where read about the still's centre alone (TOL 0) it reads one. Under it, HEAD_CORE moves no synthetic
  walker's reading anywhere from 0 to 0.9: a fleck beside the head moving the centre 1.5 px (at 0.3), or an ornament
  0.9 px (at 0.35), is read within TOL.

A crop reads only what it holds. A still with no solid pixel across its torso's rows (a part apart above the body tops
its box, its narrowest row in the gap between), a crop of no width, or one of a single value throughout (an empty crop)
is not read — the still leaving the clip unread, a frame None — never read as a torso at 0, as near the still as its
mirror.

The torso (`torso_rows`) is the rows from the neck — the narrowest row of the first frame between NECK_RANGE of its
height — down half the body below it. A body with no neck narrower than its head (a hood, a robe) has its narrowest row
at the range's top, so its crop starts in the head and holds the head and the chest, which turn with it.

Named limits. A piece apart over a hundredth of the body is the body's own: it tops the box, and the frames it lies in
read as a turn where it moves the crop far enough (a synthetic 7 px fleck over the head, 49 px of a 3849 px walker,
reads its frames turned, as `torso-side-v1` did). A piece apart under the feet runs the box down to it (no turn reads
over the frames it lies in; in the still, far enough down, the still's torso reads its own mirror and the clip is not
read). The neck is read on the still's rows 2 % of its height apart: a box a pixel taller or shorter can read it a row
of the grid higher or lower, and every frame's torso rows with it. A piece beside the still's head and shoulders (its
head or an arm) can lay them under SIDE_SHOWN_MIN off their nearest mirror though the still is seen at an angle, and the
clip is not read (34 of 2191 synthetic pieces under a hundredth of the body, placed about the heads and torsos of four
walkers). A walk turned over about half its frames lies as near the still's mirror as the still at the median, as a
square walk does, and is not read: the synthetic walker turned to its mirror over 39 to 41 of its 73 frames about their
middle (38 to 41 hooded), or over 14 to 16 frames of each 24-frame cycle; over 38 or fewer (37 hooded), or 42 or more,
it is read and its turn with it. One turned to square — a back-diagonal walk turned to a full back view — and held there
over 41 of its 73 frames or more (40 hooded) is a square walk by its frames, and is not read either. Each of the three
is left unread with the warning line (`square`), not in silence. A frame is counted once only where it flips under
HELD_MAX of the drawing last counted's solid pixels: a part of the stride a clip plays slower in drawings of its own, or
a held frame under noise over HELD_MAX (at crf 28, some of the synthetic walker's), counts frame by frame, and a square
walk so played lies off the still's mirror at the median toward that part, and over WALK_SIDE_MIN it is read, and reads
turns it does not make; a drawing under HELD_MAX of the drawing last counted (a large or slow walker where its stride
turns) is taken for it held, and not counted. GUARD and TOL are pixels of the frame, not shares of the body: a piece
beside the head that moves the centre further than TOL is read about axes that do not reach the head's, and a larger
body's margin is narrower (the plain walker drawn three times as large, the column beside its head in the still three
times as large, under a hundredth: the centre moves 4.0 px, and the walk reads no turn, least +0.31 against +0.94
without the column)."""
from __future__ import annotations

import math
from typing import Any

from PIL import Image

from sprite_gen._deps import np
from sprite_gen.video.frames import SPECK_MIN_FRACTION

READING = "torso-side-v2"
SIDE_SHOWN_MIN = 0.08
WALK_SIDE_MIN = 0.045
TURN_SIDE_MAX = 0.0
TURN_RUN_MIN = 4
MODES = ("warn", "refuse")  # --body-turn: a cut that holds a turn, where none without it holds a cycle, warned of or refused
SOLID = 128  # an alpha at least this is the body
HELD_MAX = 0.005  # a frame that flips under this share of the drawing last counted's solid pixels holds it (WALK_SIDE_MIN)
# The box's top, and the still's torso width: the row (the columns) with more than this share of the solid pixels over
# (beside) it — frames.py's speck bound, a fleck or a thin part apart from the body under it.
MASS_SHARE = SPECK_MIN_FRACTION
HEAD_SHARE = 0.15  # the head's centre: the middle of the solid pixels of the top 15 % of the body's box
HEAD_CORE = 0.5  # ... in the columns holding at least this share of the fullest one
HEAD_REACH = 0.3  # ... of those within this share of the body's height of it, read again until it settles
# The axes the still is read about besides its head's centre, STEP px apart: its head and shoulders against their
# nearest mirror about any within GUARD px (the side SIDE_SHOWN_MIN bounds), and each frame's against them and their
# mirror (the walk's side, WALK_SIDE_MIN); each frame against its torso and its torso's mirror, each at its best, about
# any within TOL px.
GUARD = 2.5
TOL = 2.0
STEP = 0.25
PAD = 4  # px of the frame either side of a crop's box, read by the resampling filter
UPPER = (0.0, 0.45)  # the head and shoulders, read for SIDE_SHOWN_MIN and WALK_SIDE_MIN
NECK_RANGE = (0.10, 0.55)  # where the neck is looked for, in shares of the body's height from its top
ROWS = np.arange(0.01, 1.0, 0.02)  # the rows the profile is read at, each 2 % of the height tall
CROP = (48, 64)  # every crop is read at this size
LUMA = np.array([0.299, 0.587, 0.114])


def _ends(mass: np.ndarray, cut: float) -> tuple[int, int]:
    """The first and the last index of `mass` with more than `cut` of it before (after) them."""
    first = int(np.searchsorted(np.cumsum(mass), cut, side="right"))
    return first, len(mass) - 1 - int(np.searchsorted(np.cumsum(mass[::-1]), cut, side="right"))


def _body(frame: Image.Image) -> tuple[np.ndarray, int, int, float] | str:
    """The frame's solid pixels, its box's top row and height, and its head's centre column (HEAD_SHARE, HEAD_CORE,
    HEAD_REACH); where they are not read, why, said of the frame: no solid pixel, or no head to centre on — the top's
    parts lie apart either side of their middle, none within HEAD_REACH of it."""
    solid = np.asarray(frame.getchannel("A")) >= SOLID
    mass = solid.sum(axis=1)
    rows = np.nonzero(mass)[0]
    if not len(rows):
        return "has no solid body to read"
    top = _ends(mass, MASS_SHARE * float(mass.sum()))[0]
    height = int(rows[-1]) - top + 1
    mass = solid[top:top + max(2, int(HEAD_SHARE * height))].sum(axis=0).astype(np.float64)
    mass[mass < HEAD_CORE * mass.max()] = 0.0
    cols = np.arange(len(mass))
    centre = float((mass * cols).sum() / mass.sum())
    for _ in range(20):
        near = np.abs(cols - centre) <= HEAD_REACH * height
        if not mass[~near].any():
            break
        if not mass[near].any():
            return (f"has no head to centre on: the top {HEAD_SHARE * 100:g} % of its body holds parts apart, none "
                    f"within {HEAD_REACH:g} of its height of their middle")
        moved = float((mass * near * cols).sum() / (mass * near).sum())
        settled = abs(moved - centre) < 0.25
        centre = moved
        if settled:
            break
    return solid, top, height, centre


def _unit(*planes: np.ndarray) -> np.ndarray:
    v = np.concatenate([p.ravel() for p in planes])
    v = v - v.mean()
    return v / (np.linalg.norm(v) or 1.0)


def _crop(frame: Image.Image, body: tuple[np.ndarray, int, int, float], rows: tuple[float, float],
          held: float | None = None) -> tuple[np.ndarray, np.ndarray, float] | str:
    """The crop of `rows` (shares of the body's height from its top) about the head's centre, `held` wide (a share of
    the height; where None, the frame's own extent across those rows, about the head), read at CROP: unit vectors of
    its luma times alpha and its alpha, of the same mirrored about the head's centre, and the width held. The axis is
    the middle of the centre's column (column c spans c to c + 1), and the box's edges lie where they fall, between
    pixels too, the crop resampled from the frame about them: a body that is its own mirror about its head crops as its
    own mirror, wherever its centre falls. Where it holds nothing to read, why, said of the frame — no solid pixel
    across those rows (the width the frame's own), a crop of no width (a torso of one column, nothing beside the axis
    to mirror, or a box under a pixel wide), or one of a single value throughout (an empty crop's 0): not read as a
    torso at 0."""
    solid, top, height, centre = body
    r0 = top + int(rows[0] * height)
    r1 = max(r0 + 2, top + int(rows[1] * height))
    span = f"rows {rows[0]:.2f}-{rows[1]:.2f} of its height"
    axis = centre + 0.5
    if held is None:
        mass = solid[r0:r1].sum(axis=0)
        if not mass.any():
            return f"has no solid pixel in its {span}"
        lo, hi = _ends(mass, MASS_SHARE * float(mass.sum()))
        if hi <= lo:
            return f"has a crop of no width over its {span}"
        held = 2 * max(axis - lo, hi + 1 - axis) / height
    x0, x1 = axis - held * height / 2, axis + held * height / 2
    if x1 - x0 < 1:
        return f"has a crop of no width over its {span}"
    left = math.floor(x0) - PAD
    y = np.asarray(frame.crop((left, r0, math.ceil(x1) + PAD, r1)).resize(
        CROP, Image.Resampling.LANCZOS, box=(x0 - left, 0.0, x1 - left, float(r1 - r0))), dtype=np.float64) / 255.0
    luma, alpha = (y[..., :3] @ LUMA) * y[..., 3], y[..., 3]
    v = _unit(luma, alpha)
    if not v.any():
        return f"has nothing to read in its crop of {span}"
    return v, _unit(luma[:, ::-1], alpha[:, ::-1]), held


def _windows(frame: Image.Image, body: tuple[np.ndarray, int, int, float], rows: tuple[float, float],
             reach: float) -> tuple[np.ndarray, np.ndarray, float] | str:
    """The crops of `rows` about the head's centre and about every axis within `reach` px of it, STEP apart, each as
    wide as the centre's own (`_crop`): their unit vectors and their mirrors', stacked in the order of the axes (the
    centre's in the middle), and the width held; where one holds nothing to read, why."""
    centred = _crop(frame, body, rows)
    if isinstance(centred, str):
        return centred
    solid, top, height, centre = body
    n = round(reach / STEP)
    crops = [_crop(frame, (solid, top, height, centre + j * STEP), rows, centred[2]) if j else centred
             for j in range(-n, n + 1)]
    for crop in crops:
        if isinstance(crop, str):
            return crop
    return np.stack([crop[0] for crop in crops]), np.stack([crop[1] for crop in crops]), centred[2]


def neck(body: tuple[np.ndarray, int, int, float]) -> float:
    """The neck: of the rows in NECK_RANGE, the narrowest (the span holding the middle 96 % of the row's solid pixels,
    over the height), the topmost on a tie — a share of the body's height."""
    solid, top, height, _ = body
    widths = {}
    for f in ROWS:
        if not NECK_RANGE[0] <= f <= NECK_RANGE[1]:
            continue
        lo = top + int((f - 0.01) * height)
        mass = solid[lo:max(lo + 1, top + int((f + 0.01) * height))].sum(axis=0)
        share = np.cumsum(mass) / max(1.0, float(mass.sum()))
        widths[float(f)] = float(np.searchsorted(share, 0.98) - np.searchsorted(share, 0.02)) / height
    return min(widths, key=lambda f: (widths[f], f))


def torso_rows(at: float) -> tuple[float, float]:
    """The torso's rows: from the neck `at` down half the body below it."""
    return at, at + (1 - at) / 2


def turns(side: list[float | None]) -> list[dict[str, Any]]:
    """The turns of a clip read `side`: each run of TURN_RUN_MIN frames or more in a row whose side is under
    TURN_SIDE_MAX (a frame not read, None, ends a run), its first and last frame and its least side and where."""
    out = []
    k = 0
    while k < len(side):
        end = k
        while end < len(side) and side[end] is not None and side[end] < TURN_SIDE_MAX:
            end += 1
        if end - k >= TURN_RUN_MIN:
            at = min(range(k, end), key=lambda j: side[j])
            out.append({"from": k, "to": end - 1, "least": side[at], "at": at})
        k = max(end, k + 1)
    return out


def read(frames: list[Image.Image]) -> dict[str, Any]:
    """The clip's facing against its first frame (`frames`, the clip as keyed, RGBA): the record the loop report keeps
    (`body_turn`) — the reading, its bounds, the frame read against (`reference`), the still's own side (`still_side`),
    whether it was read (`why` where not), the neck, the walk's side (`walk_side`: the median of the frames after the
    still, a frame that holds the drawing last counted, under HELD_MAX of its solid pixels flipped, not counted, where
    any is read), each frame's `side` and the `turns`. A frame not read is None in `side`, and `unread` says why,
    each why with its frames (where any is)."""
    out: dict[str, Any] = {"reading": READING, "bounds": {"SIDE_SHOWN_MIN": SIDE_SHOWN_MIN, "WALK_SIDE_MIN": WALK_SIDE_MIN,
                                                          "TURN_SIDE_MAX": TURN_SIDE_MAX, "TURN_RUN_MIN": TURN_RUN_MIN},
                           "reference": 0, "turns": []}
    if not frames:
        return {**out, "read": False, "still_side": None, "why": "the clip has no frames"}
    first = frames[0]
    still = _body(first)
    if isinstance(still, str):
        return {**out, "read": False, "still_side": None, "why": f"the clip's first frame {still}"}
    upper = _windows(first, still, UPPER, GUARD)
    if isinstance(upper, str):
        return {**out, "read": False, "still_side": None, "why": f"the clip's first frame {upper}"}
    uppers, umirrors, uheld = upper
    out["still_side"] = round(1 - float((umirrors @ uppers[len(uppers) // 2]).max()), 4)
    if out["still_side"] < SIDE_SHOWN_MIN:
        return {**out, "read": False,
                "why": f"the still is seen square: its head and shoulders lie {out['still_side']:.2f} off their mirror, under "
                       f"{SIDE_SHOWN_MIN:g} (a front or back view), and its facing is not read"}
    at = neck(still)
    out["neck"] = round(at, 2)
    rows = torso_rows(at)
    torso = _windows(first, still, rows, TOL)
    if isinstance(torso, str):
        return {**out, "read": False, "why": f"the clip's first frame {torso}, its torso's from the neck down"}
    crops, mirrors, held = torso
    shown = 1 - float((mirrors @ crops[len(crops) // 2]).max())
    out["torso_still_side"] = round(shown, 4)
    if shown <= 1e-6:
        return {**out, "read": False, "why": "the still's torso is its own mirror: no side to read it by"}
    side: list[float | None] = []
    walk: list[float] = []
    unread: dict[str, list[int]] = {}
    counted = None  # the solid pixels of the drawing last counted (the still the first)
    for k, frame in enumerate(frames):
        solid = np.asarray(frame.getchannel("A")) >= SOLID
        drawn = (counted is None or counted.shape != solid.shape
                 or float((solid ^ counted).sum()) / max(1, int(counted.sum())) >= HELD_MAX)
        if drawn:
            counted = solid
        body = _body(frame)
        crop = body if isinstance(body, str) else _crop(frame, body, rows, held)
        if isinstance(crop, str):
            side.append(None)
            unread.setdefault(crop, []).append(k)
            continue
        v, _, _ = crop
        side.append(round((float((crops @ v).max()) - float((mirrors @ v).max())) / shown, 4))
        if k and drawn:
            top = _crop(frame, body, UPPER, uheld)
            if not isinstance(top, str):
                walk.append(float((uppers @ top[0]).max()) - float((umirrors @ top[0]).max()))
    if walk:
        out["walk_side"] = round(float(np.median(walk)), 4)
        if abs(out["walk_side"]) < WALK_SIDE_MIN:
            return {**out, "read": False,
                    "why": f"the walk is seen square: its frames' head and shoulders lie {out['walk_side']:+.3f} "
                           f"nearer the still's than their mirror at the median, under {WALK_SIDE_MIN:g} either way (a "
                           "front or back walk, or a body that turned for much of the walk), and its facing is not "
                           "read"}
    out = {**out, "read": True, "side": side, "turns": turns(side)}
    if unread:
        out["unread"] = [{"frames": ks, "why": why} for why, ks in unread.items()]
    return out


def spans(frames: list[int]) -> str:
    """Frames in runs, in words: `40-42`, `22-23 and 36-45`."""
    runs: list[list[int]] = []
    for k in sorted(frames):
        if runs and k == runs[-1][1] + 1:
            runs[-1][1] = k
        else:
            runs.append([k, k])
    return " and ".join(f"{a}-{b}" if b > a else f"{a}" for a, b in runs)


def turned(reading: dict[str, Any]) -> set[int]:
    """The clip frames inside the reading's turns."""
    return {k for turn in reading["turns"] for k in range(turn["from"], turn["to"] + 1)}


class Turn:
    """A cut's word on the turn, for the cut search (`local_cycle.detect`'s, `by_steps`' and `counted`'s `turn`): why
    the cut s/L (in the search's frames, the clip's after its first `skip`) is refused — it holds a frame of a turn —
    or None. Each refusal is counted (`refused`)."""

    def __init__(self, reading: dict[str, Any], skip: int = 0):
        self.frames = turned(reading)
        self.skip = skip
        self.refused = 0

    def held(self, start: int, length: int) -> list[int]:
        """The turned frames of the clip a cut s/L in the search's frames holds."""
        return sorted(self.frames & set(range(start + self.skip, start + self.skip + length)))

    def __call__(self, start: int, length: int) -> str | None:
        held = self.held(start, length)
        if not held:
            return None
        self.refused += 1
        return f"the body turns (clip frames {spans(held)})"


def _over(reading: dict[str, Any]) -> str:
    spans = [f"{t['from']}-{t['to']}" for t in reading["turns"]]
    least = min(reading["turns"], key=lambda t: t["least"])
    return (f"its torso faces nearer the still's mirror than the still over frames {' and '.join(spans)} (least "
            f"{least['least']:+.2f} at frame {least['at']}; a turn is a torso under {TURN_SIDE_MAX:g} for {TURN_RUN_MIN} "
            "frames or more)")


def square(reading: dict[str, Any]) -> str | None:
    """The warning of `video-loop` where the still is read and its walk reads square (WALK_SIDE_MIN): a front or back
    walk whose still shows a side, or a body that turned for much of the walk — to face the camera (or away from it),
    or to its mirror over about half of it — the frames alone not telling which; the clip not read, cut as the search
    alone cuts it. None where it was not left unread so."""
    side = reading.get("walk_side")
    bound = reading["bounds"].get("WALK_SIDE_MIN", WALK_SIDE_MIN)
    if reading.get("read") is not False or side is None or abs(side) >= bound:
        return None
    return (f"the walk reads square against a still that shows a side (still_side {reading['still_side']:.3f}, "
            f"walk_side {side:+.3f}, under {bound:g} either way): a front or back walk, or a body that turned for much "
            "of the walk — to face the camera, or to its mirror; its facing is not read; check the loop's facing")


def refusal(reading: dict[str, Any], *, cut: tuple[int, int] | None = None, held: list[int] | None = None) -> str:
    """The refusal of `--body-turn refuse`, after `video-loop: `: the turn, and that no cut without it holds two steps
    that repeat — or, where a cut was found that holds it (`cut`, in the clip's frames, and its turned frames `held`),
    which — and the clip to be filmed again at the still's angle."""
    found = (f", and the cut {cut[0]}/{cut[1]} holds frames {spans(held)} of it" if cut is not None and held
             else ", and no cut that leaves those frames out holds two steps that repeat")
    return f"the body turns in the walk — {_over(reading)}{found}: film it again with the torso and hips kept at the still's angle"


def kept(reading: dict[str, Any], *, cut: tuple[int, int], held: list[int]) -> str:
    """The warning of `--body-turn warn` over a cut that holds the turn (in the clip's frames), where no cut without it
    holds two steps that repeat."""
    return (f"the body turns in the walk — {_over(reading)}, and the cut {cut[0]}/{cut[1]} holds frames {spans(held)} "
            "of it: no cut that leaves those frames out holds two steps that repeat — kept as cut; --body-turn refuse "
            "refuses such a clip, to be filmed again at the still's angle")


def unfound(reading: dict[str, Any]) -> str:
    """The warning of `--body-turn warn` where no cut holds two steps that repeat, with the turn or without it."""
    return (f"the body turns in the walk — {_over(reading)}: no cut holds two steps that repeat, with those frames or "
            "without them; --body-turn refuse names the turn as the reason, to be filmed again at the still's angle")
