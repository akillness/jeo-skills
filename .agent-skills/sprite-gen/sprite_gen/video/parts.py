# SPDX-License-Identifier: Apache-2.0
"""A part on a beat of its own — a tail — told apart from the body it hangs on, in any frame of a loop, filmed or made
between two, and laid on a frame in place of that frame's own without changing a pixel of its body.

A tail that swings round every 41 frames on a walk of 26 closes on no cut of two steps, and a frame RIFE makes is the
whole picture at one time: given the tail's time, the legs take it too. Giving the part its own time and the body its
own needs the part apart from the body, and a video model draws no layer for it and need not give it a colour of its
own: a tail may be the colour of the sleeves and of the hand that swings across it.

The mask (`Masker.mask`) reads where the part is from the clip itself. The body's parts come back to where they were a
cycle later, or within `SEARCH` of it; a part on its own beat does not. So a frame is read against the clip's frames a
cycle or two away at the same walk phase (`SIBLING_PHASE`), the one of each cycle whose feet match best: a pixel whose
3 x 3 patch is found nowhere within `SEARCH` of the body's height in such a frame differs (`TAU`), and of what differs,
what the frame alone shows solid is the part's rim. The rim seeds the part, and the head and torso the motion anchor
tracks (`auto_motion.discover`) and the band the feet stand in (`FEET`) seed the body: every solid pixel goes to
whichever reaches it at the lesser cost, a step costing the colour change it crosses — a drawn line, a gap to the
background, a colour edge are walls — and then again with each side's own colours, as the first reading gave them,
costing a pixel unlike that side's more to enter. A part that overlaps itself a cycle on is read whole from its rim; a
sleeve of its colour stays the body's, reached from the torso without a wall. A frame made between two filmed ones is
read the same way at the time it shows. Where a frame shows the part over nothing its siblings leave clear — a tail
lying wholly over the body — there is no rim to seed it from, and the mask is empty: no part, never the body.

The order (`Masker.order`): where a frame's part lies, the share its siblings a cycle away show solid body there. A part
behind the body leaves no body there in any frame but where the mask leaks; one in front of it hides body that its
siblings show (`FRONT`). It is read on a mask of its own: a part in front of the body lies over body the anchor and the
feet do not reach, the part's mask, grown against those seeds, may take that body too, and its siblings' masks the same;
body a sibling's mask takes is not counted as body, so the more they take the less the part reads in front. So the
order's mask also seeds the body with every solid pixel of a colour the rims of the frames read show less than `RARE` of
the time, opened by the rim's core. That seed lies beside the part and gives the body the part's dark edge where the two
meet, so it reads the order and nothing else; the rim is read once a frame for both masks. Among frames none of which
has one of its walk phase a cycle or two away that shows its part, there is nothing to read the order from, and it is no
order. A lay reads the order from the frames beside the loop's wrap alone (`WRAP`), where a part on its own beat is
laid.

Laying (`lay`) takes a frame's own part out and lays another drawing's part in its place, in front of the body or
behind it. The body — every pixel of the frame outside its part mask — is laid as the frame drew it: behind, a solid
pixel (`SOLID`) is the frame's own byte for byte and the new part shows only through a body pixel that is not solid;
in front, the new part covers the body where it lies and nothing else. Where the frame's own part lay, behind the body
there was nothing; in front, what it hid is taken from the plates given, frames that show the body there, and is clear
where none does. Where either mask is empty nothing is laid: an empty mask on the frame leaves its own part where it is
(two parts), on the other drawing lays none.

`lay_behind` lays a set of frames' parts behind their bodies only where the clip's frames beside the wrap read its part
behind the body, and lays them all or none. It reads the order first and refuses a part in front of the body, or no
order, before it reads a frame's mask; then a frame or a part with an empty mask. A refusal changes no frame and says
why.

Every distance is a share of the body's height, read at the scale the clip's union box is read at (`READ_EDGE`).
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from typing import Any

from PIL import Image

from sprite_gen._deps import np
from sprite_gen.video import repair
from sprite_gen.video.frames import _components

READ_EDGE = 480  # px: the clip's union box is read at most this tall, shrunk by a whole factor (box averaging)
SEARCH = 0.0135  # of the body's height: how far a body part may go between two cycles of a generated walk
TAU = 0.15  # premultiplied RGBA distance of a 3 x 3 patch's mean at which it is not found
CORE = 0.0116  # of the body's height: the rim's core survives an opening this wide; a sliver beside it is no part
SIBLING_PHASE = 1.0  # frames: a frame a cycle or two away within this much of the walk phase is a sibling
SIBLING_SLACK = 2.5  # siblings whose feet match within this many times the best one's
FEET_ROWS = 0.78  # of the reading's height: the feet are matched below this row ...
FEET_SHIFT = 0.0093  # ... over shifts up to this share of the body's height either way
FEET = 0.08  # of the body's height: the bottom band the feet stand in, the body's seed
SEED_GAP = 0.0093  # of the body's height: the body's seeds keep this far from the part's
SEED_MIN = 20  # px at the reading: a rim with fewer seeds than this is no part
EPS = 0.02  # the cost of a step that crosses no colour change
BINS = 16  # levels per colour channel of each side's own colours
LAMBDA = 0.05  # a pixel that looks e times likelier the other side's costs this much more to enter
GROW = 600  # rounds the rim's two sides grow over what differs, at most
ITERATIONS = 2000  # rounds of the least-cost reading, at most; it stops once a round of 25 changes nothing
SOLID_GROW = 0.3  # alpha over which a pixel is grown over; below it, the part's soft edge beside it is the part's
SOFT = 0.02  # alpha over which a pixel beside the part is its soft edge
OWN = 0.5  # alpha over which a pixel is a frame's own where the other shows under ALONE
ALONE = 0.1
PIECE = 0.2  # the rim's pieces this share of the largest seed the part
KEEP = 0.05  # the part's pieces this share of the largest are kept
RIM_KEEP = 0.1  # the rim's pieces with a core, this share of the largest such
SOLID = 0.9  # alpha at or above which a pixel is solid: laying a part behind the body never changes one of the body's
FRONT = 0.15  # of the part's pixels, the share its siblings show solid body in: over it the part is in front
BODY_GAP = 0.007  # of the body's height: the sibling's body is read this far from its own part
RARE = 0.01  # of a colour's solid pixels in the frames read, the share in a rim under which the order's mask seeds the body
WRAP = 4  # frames: the order is read from the clip's frames this near the loop's wrap on either side, in every cycle
NB = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))


def _moved(h: int, w: int, dy: int, dx: int) -> tuple[tuple[slice, slice], tuple[slice, slice]]:
    """Where an h x w picture moved dy rows down and dx columns right lies, and where in it that came from."""
    return ((slice(max(0, dy), h + min(0, dy)), slice(max(0, dx), w + min(0, dx))),
            (slice(max(0, -dy), h - max(0, dy)), slice(max(0, -dx), w - max(0, dx))))


def _shift(m: np.ndarray, dy: int, dx: int, fill: Any = 0, out: np.ndarray | None = None) -> np.ndarray:
    """`m` moved dy rows down and dx columns right, `fill` where nothing moved in; written into `out` where given."""
    dst, src = _moved(*m.shape[:2], dy, dx)
    if out is None:
        out = np.full_like(m, fill)
    else:
        out.fill(fill)
    out[dst] = m[src]
    return out


def _planes_max(a: np.ndarray, out: np.ndarray) -> np.ndarray:
    """`a.max(-1)` written into `out`, plane by plane: the same values, without a reduction over a short last axis."""
    np.maximum(a[..., 0], a[..., 1], out=out)
    for k in range(2, a.shape[-1]):
        np.maximum(out, a[..., k], out=out)
    return out


def _disk(r: int) -> list[tuple[int, int]]:
    return [(dy, dx) for dy in range(-r, r + 1) for dx in range(-r, r + 1) if dy * dy + dx * dx <= r * r]


def _dilate(m: np.ndarray, r: int) -> np.ndarray:
    out = m.copy()
    for dy, dx in _disk(r):
        out |= _shift(m, dy, dx, False)
    return out


def _erode(m: np.ndarray, r: int) -> np.ndarray:
    return ~_dilate(~m, r)


def _opened(m: np.ndarray, r: int) -> np.ndarray:
    return _dilate(_erode(m, r), r)


def _blur(a: np.ndarray) -> np.ndarray:
    """The mean over each pixel's 3 x 3 square, the edges clamped."""
    out = a.astype(np.float32)
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (2, 1)
        c = np.cumsum(np.pad(out, pad, mode="edge"), axis=axis)
        n = out.shape[axis]
        out = (np.take(c, np.arange(3, 3 + n), axis=axis) - np.take(c, np.arange(n), axis=axis)) / 3
    return out


def _pieces(m: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """The pieces of `m`, side by side: (each pixel's piece, -1 outside; each piece's pixels)."""
    lab = np.full(m.shape, -1, np.int64)
    if not m.any():
        return lab, np.zeros(0, np.int64)
    ys, starts, stops, roots, _ = _components(m)
    _, piece = np.unique(roots, return_inverse=True)
    lengths = stops - starts
    rows = np.repeat(ys, lengths)
    cols = np.repeat(starts, lengths) + (np.arange(lengths.sum()) - np.repeat(np.cumsum(lengths) - lengths, lengths))
    lab[rows, cols] = np.repeat(piece, lengths)
    return lab, np.bincount(piece, weights=lengths).astype(np.int64)


def _keep(m: np.ndarray, share: float, among: np.ndarray | None = None) -> np.ndarray:
    """The pieces of `m` at least `share` of the largest (of those that meet `among`, and only those)."""
    lab, sizes = _pieces(m)
    if not sizes.size:
        return m.copy()
    ids = np.unique(lab[among & (lab >= 0)]) if among is not None else np.arange(sizes.size)
    if not ids.size:
        return np.zeros_like(m)
    big = sizes[ids].max()
    return np.isin(lab, ids[sizes[ids] >= share * big])


def _premul(a: np.ndarray) -> np.ndarray:
    out = a.copy()
    out[..., :3] *= a[..., 3:4]
    return out


def _code(a: np.ndarray) -> np.ndarray:
    """Each pixel's colour, BINS levels a channel, as one number."""
    q = np.clip((a[..., :3] * BINS).astype(int), 0, BINS - 1)
    return (q[..., 0] * BINS + q[..., 1]) * BINS + q[..., 2]


def _least(seed: np.ndarray, cost_to: list[np.ndarray]) -> np.ndarray:
    """The least cost of a path from `seed` to every pixel, a step from a neighbour costing cost_to[k] of that pixel.
    Each step is taken in place, over the pixels the neighbour moves between (elsewhere it adds to inf and changes
    nothing), in the costs' precision. No array is made and dropped a step: in a long-lived process whose heap earlier
    work left scattered, each one costs kernel time, and a reading takes thousands of steps."""
    d = np.where(seed, 0.0, np.inf).astype(np.result_type(np.float32, *cost_to))
    step = np.empty_like(d)
    moves = [_moved(*d.shape, dy, dx) for dy, dx in NB]
    for k in range(ITERATIONS):
        old = d.copy() if k % 25 == 24 else None
        for c, (dst, src) in zip(cost_to, moves):
            np.add(d[src], c[dst], out=step[dst])
            np.minimum(d[dst], step[dst], out=d[dst])
        if old is not None and np.array_equal(d, old):
            break
    return d


class Masker:
    """The part masks of a loop's frames from its clip. `clip` is the clip's frames placed where the loop's frames are
    (as `loop.cycle_apart` places them), by their time on the loop's clock — the loop's frame k at k, the clip's frame a
    cycle after it at k + `length` — at least a cycle either side of the frames read; `length` is the loop's frames a
    cycle; `body` the head and torso the motion anchor tracks, boxes in the frames' pixels (`auto_motion.discover`)."""

    def __init__(self, clip: dict[int, Image.Image], length: int, body: Sequence[Sequence[int]]):
        self.clip, self.length = clip, length
        self.times = sorted(clip)
        self.box = repair.union_box([clip[t] for t in self.times])
        x0, y0, x1, y1 = self.box
        self.factor = max(1, math.ceil((y1 - y0) / READ_EDGE))
        self.size = ((x1 - x0) // self.factor, (y1 - y0) // self.factor)
        h = self.size[1]
        self.search = max(1, round(SEARCH * h))
        self.core = max(1, round(CORE * h))
        self.feet_shift = max(1, round(FEET_SHIFT * h))
        self.seed_gap = max(1, round(SEED_GAP * h))
        self.body_gap = max(1, round(BODY_GAP * h))
        self.read = {t: self._read(clip[t]) for t in self.times}
        self.premul = {t: _premul(a) for t, a in self.read.items()}
        self.blurred = {t: _blur(p) for t, p in self.premul.items()}
        self.anchor = np.zeros((h, self.size[0]), bool)
        for bx0, by0, bx1, by1 in body:
            ry0, rx0 = max(0, (by0 - y0) // self.factor), max(0, (bx0 - x0) // self.factor)
            self.anchor[ry0:max(ry0, (by1 - y0) // self.factor), rx0:max(rx0, (bx1 - x0) // self.factor)] = True
        self._rims: dict[int, tuple[np.ndarray, list[int]]] = {}
        self._masks: dict[int, np.ndarray] = {}
        self._order_masks: dict[tuple[int, float, tuple[int, ...]], np.ndarray] = {}
        self._rim_shares: dict[tuple[int, ...], np.ndarray] = {}

    def _read(self, frame: Image.Image) -> np.ndarray:
        """`frame` at the reading's scale, straight RGBA in 0..1."""
        im = frame.convert("RGBA").crop(self.box)
        if self.factor > 1:
            im = im.resize(self.size, Image.Resampling.BOX)
        return np.asarray(im, dtype=np.float32) / 255.0

    def _feet(self, a: np.ndarray, b: np.ndarray) -> float:
        """How far apart two frames' feet are: the mean of the nearer three quarters of the differences below
        FEET_ROWS, at the best shift. Only those rows are read, into arrays made once a call (see `_least`)."""
        top = int(FEET_ROWS * a.shape[0])
        best = math.inf
        r = self.feet_shift
        feet = a[top:]
        on_a = feet[..., 3] > 0.05
        moved, diff = np.empty_like(b), np.empty_like(feet)
        d, on = np.empty(feet.shape[:2], feet.dtype), np.empty(feet.shape[:2], bool)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                bb = _shift(b, dy, dx, out=moved)[top:]
                _planes_max(np.abs(np.subtract(feet, bb, out=diff), out=diff), d)
                np.logical_or(on_a, np.greater(bb[..., 3], 0.05, out=on), out=on)
                v = np.sort(d[on])
                if v.size:
                    best = min(best, float(v[: max(1, int(0.75 * v.size))].mean()))
        return best

    def _far(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        """Per pixel of `a`, the least distance of its patch to `b`'s within SEARCH, in arrays made once a call (see
        `_least`)."""
        best = np.full(a.shape[:2], np.inf, np.float32)
        moved, diff, near = np.empty_like(b), np.empty_like(a), np.empty(a.shape[:2], a.dtype)
        for dy, dx in _disk(self.search):
            _planes_max(np.abs(np.subtract(a, _shift(b, dy, dx, out=moved), out=diff), out=diff), near)
            np.minimum(best, near, out=best)
        return best

    def _siblings(self, p: np.ndarray, at: float) -> list[int]:
        best: dict[int, tuple[int, float]] = {}
        phase = at % self.length
        for g in self.times:
            dphase = (g % self.length - phase + self.length / 2) % self.length - self.length / 2
            cycle = round((g - at) / self.length)
            if abs(dphase) <= SIBLING_PHASE and cycle != 0:
                c = self._feet(p, self.premul[g]) + 0.01 * abs(dphase)
                if cycle not in best or c < best[cycle][1]:
                    best[cycle] = (g, c)
        if not best:
            return []
        least = min(c for _, c in best.values())
        return sorted(g for g, c in best.values() if c <= SIBLING_SLACK * least)

    def rim(self, a: np.ndarray, at: float) -> tuple[np.ndarray, list[int]]:
        """Where a frame (`a`, straight RGBA at the reading) shown at clip time `at` differs from its siblings and shows
        solid what they do not: (the rim, the siblings)."""
        p = _premul(a)
        pb = _blur(p)
        sibs = self._siblings(p, at)
        rim = np.zeros(a.shape[:2], bool)
        for g in sibs:
            mine, theirs = p[..., 3], self.premul[g][..., 3]
            mark = _opened((self._far(pb, self.blurred[g]) > TAU) | (self._far(self.blurred[g], pb) > TAU), 1)
            own = _opened(mark & (mine > OWN) & (theirs < ALONE), 1)
            other = _opened(mark & (theirs > OWN) & (mine < ALONE), 1)
            for _ in range(GROW):
                grow_own = _dilate(own, 1) & mark & ~other & ~own
                grow_other = _dilate(other, 1) & mark & ~own & ~other
                both = grow_own & grow_other
                grow_own &= ~both
                grow_other &= ~both
                if not grow_own.any() and not grow_other.any():
                    break
                own |= grow_own
                other |= grow_other
            rim |= own
        return _keep(rim, RIM_KEEP, _opened(rim, self.core)), sibs

    def mask_read(self, a: np.ndarray, at: float, *, rim: tuple[np.ndarray, list[int]] | None = None,
                  seed: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray, list[int]]:
        """The part mask of a frame (`a`, straight RGBA at the reading) shown at clip time `at`, at the reading:
        (mask, rim, siblings). `rim` is the frame's rim and siblings where they are read already; `seed`, pixels that
        seed the body besides the anchor and the feet."""
        rim, sibs = self.rim(a, at) if rim is None else rim
        p = _premul(a)
        solid = p[..., 3] > SOLID_GROW
        seed_part = _keep(_erode(rim, 1) & solid, PIECE)
        if seed_part.sum() < SEED_MIN:
            return np.zeros_like(solid), rim, sibs
        rows = np.nonzero(solid.any(axis=1))[0]
        feet = np.zeros_like(solid)
        feet[int(rows.max() - FEET * (rows.max() - rows.min())):] = True
        body = self.anchor | feet if seed is None else self.anchor | feet | seed
        seed_body = body & solid & ~_dilate(seed_part, self.seed_gap)
        cost_to = []
        for dy, dx in NB:
            c = np.abs(p - np.stack([_shift(p[..., k], dy, dx) for k in range(4)], -1)).max(-1) + EPS
            c[~solid] = np.inf
            cost_to.append(c * (math.sqrt(2) if dy and dx else 1.0))
        part = solid & (_least(seed_part, cost_to) < _least(seed_body, cost_to))
        code = _code(a)
        own = np.bincount(code[part], minlength=BINS ** 3) + 1.0
        rest = np.bincount(code[solid & ~part], minlength=BINS ** 3) + 1.0
        unlike_part, unlike_body = -np.log(own / own.sum())[code], -np.log(rest / rest.sum())[code]
        to_part = LAMBDA * np.maximum(unlike_part - unlike_body, 0)
        to_body = LAMBDA * np.maximum(unlike_body - unlike_part, 0)
        part = solid & (_least(seed_part, [c + to_part for c in cost_to]) < _least(seed_body, [c + to_body for c in cost_to]))
        part = _keep(part, KEEP)
        part |= _dilate(part, 1) & (p[..., 3] > SOFT) & ~solid
        return part, rim, sibs

    def mask(self, frame: Image.Image, at: float) -> np.ndarray:
        """The part mask of `frame` shown at clip time `at` (a frame made between two shows a time between theirs), in
        the frame's pixels. The clip's own frame at its time, pixel for pixel, is read once (`clip_mask`)."""
        own = self.clip.get(at)
        if own is not None and (own is frame or (own.size == frame.size
                                                 and own.convert("RGBA").tobytes() == frame.convert("RGBA").tobytes())):
            return self.clip_mask(at)
        part, _, _ = self.mask_read(self._read(frame), at)
        return self._full(part, frame)

    def _full(self, part: np.ndarray, frame: Image.Image) -> np.ndarray:
        """A mask at the reading in `frame`'s pixels: each pixel of the reading over the factor's square, where the
        frame shows anything."""
        x0, y0, _, _ = self.box
        up = np.repeat(np.repeat(part, self.factor, 0), self.factor, 1)
        out = np.zeros((frame.height, frame.width), bool)
        fy0, fx0 = max(0, y0), max(0, x0)
        fy1, fx1 = min(frame.height, y0 + up.shape[0]), min(frame.width, x0 + up.shape[1])
        if fy1 > fy0 and fx1 > fx0:
            out[fy0:fy1, fx0:fx1] = up[fy0 - y0:fy1 - y0, fx0 - x0:fx1 - x0]
        return out & (np.asarray(frame.convert("RGBA").getchannel("A")) > 0)

    def _clip_rim(self, t: int) -> tuple[np.ndarray, list[int]]:
        """The rim and siblings of the clip's frame at time `t` (kept: both masks read it)."""
        if t not in self._rims:
            self._rims[t] = self.rim(self.read[t], t)
        return self._rims[t]

    def _clip_read(self, t: int) -> np.ndarray:
        """The part mask of the clip's frame at time `t`, at the reading (kept)."""
        if t not in self._masks:
            self._masks[t] = self.mask_read(self.read[t], t, rim=self._clip_rim(t))[0]
        return self._masks[t]

    def clip_mask(self, t: int) -> np.ndarray:
        """The part mask of the clip's frame at time `t`, in its pixels."""
        return self._full(self._clip_read(t), self.clip[t])

    def near_wrap(self, frames: int = WRAP) -> list[int]:
        """The clip's times within `frames` of the loop's wrap on either side, in every cycle."""
        return [t for t in self.times if t % self.length < frames or t % self.length >= self.length - frames]

    def _rare(self, a: np.ndarray, rare: float, times: tuple[int, ...]) -> np.ndarray:
        """The solid pixels of `a` (at the reading) of a colour the rims of the clip's frames at `times` show less than
        `rare` of the time — of their solid pixels of that colour, the share that lie in a rim — opened by the rim's
        core."""
        if times not in self._rim_shares:
            in_rim, every = np.zeros(BINS ** 3), np.zeros(BINS ** 3)
            for t in times:
                solid = self.read[t][..., 3] > SOLID_GROW
                code = _code(self.read[t])
                every += np.bincount(code[solid], minlength=BINS ** 3)
                in_rim += np.bincount(code[self._clip_rim(t)[0] & solid], minlength=BINS ** 3)
            self._rim_shares[times] = in_rim / np.maximum(every, 1)
        return _opened((a[..., 3] > SOLID_GROW) & (self._rim_shares[times][_code(a)] < rare), self.core)

    def _order_read(self, t: int, rare: float, times: tuple[int, ...]) -> np.ndarray:
        """The order's part mask of the clip's frame at time `t`, at the reading (kept): the body seeded with the
        colours the rims of the frames at `times` show less than `rare` of the time too."""
        if (t, rare, times) not in self._order_masks:
            a = self.read[t]
            self._order_masks[t, rare, times] = self.mask_read(a, t, rim=self._clip_rim(t), seed=self._rare(a, rare, times))[0]
        return self._order_masks[t, rare, times]

    def order(self, times: Iterable[int], rare: float = RARE) -> dict[str, Any]:
        """In front of the body or behind it, from the clip's frames at `times` (their rims alone are read): of their
        part's pixels (the order's mask), the share a frame of the same walk phase a cycle or two away among them shows
        solid body in (its own part kept clear). Where no frame among them that shows its part has such a frame, the
        order is None."""
        times = tuple(sorted(set(times)))
        front = total = 0
        for g in times:
            for s in times:
                if s != g and (s - g) % self.length == 0 and abs(s - g) <= 2 * self.length:
                    body = (self.read[s][..., 3] > SOLID) & ~_dilate(self._order_read(s, rare, times), self.body_gap)
                    front += int((self._order_read(g, rare, times) & body).sum())
                    total += int(self._order_read(g, rare, times).sum())
        if not total:
            return {"order": None, "front_share": None, "part_px": 0}
        share = front / total
        return {"order": "front" if share > FRONT else "behind", "front_share": round(share, 4), "part_px": total}


def lay(frame: Image.Image, mask: np.ndarray, part: Image.Image, part_mask: np.ndarray, order: str, *,
        plates: Sequence[tuple[Image.Image, np.ndarray]] = ()) -> tuple[Image.Image, dict[str, Any]]:
    """`frame` with its own part (`mask`) taken out and `part`'s (`part_mask`, already where it belongs on `frame`)
    laid in its place, in front of the body or behind it (`order`): (the frame made, what was laid). Behind, the part's
    place is clear and the new part goes under the body; in front, its place is taken from the first of `plates` —
    frames placed on `frame`, each with its own part mask — that shows the body there, clear where none does, and the
    new part goes over the body. The body's pixels are the frame's own: behind, every solid one byte for byte; in
    front, every one the new part does not cover. Where `mask` or `part_mask` is empty nothing is laid: `frame` as
    given, refused "empty"."""
    if order not in ("front", "behind"):
        raise ValueError(f"parts.lay: order is 'front' or 'behind', not {order!r}")
    if not mask.any() or not part_mask.any():
        return frame, {"order": order, "refused": "empty", "part_px": int(mask.sum()), "source_px": int(part_mask.sum()),
                       "laid_px": 0}
    f = np.asarray(frame.convert("RGBA")).copy()
    layer = np.asarray(part.convert("RGBA")).copy()
    layer[~part_mask] = 0
    base = f.copy()
    base[mask] = 0
    left = mask.copy()
    plated = 0
    for plate, plate_mask in plates if order == "front" else ():
        if not left.any():
            break
        ok = left & ~plate_mask
        base[ok] = np.asarray(plate.convert("RGBA"))[ok]
        plated += int(ok.sum())
        left &= ~ok
    top, under = (Image.fromarray(base), Image.fromarray(layer)) if order == "behind" else (Image.fromarray(layer), Image.fromarray(base))
    out = np.asarray(Image.alpha_composite(under, top)).copy()
    kept = ~mask & ((f[..., 3] >= round(SOLID * 255)) if order == "behind" else (layer[..., 3] == 0))
    out[kept] = f[kept]
    solid_body = ~mask & (f[..., 3] >= round(SOLID * 255))
    return Image.fromarray(out), {
        "order": order, "refused": None, "part_px": int(mask.sum()), "source_px": int(part_mask.sum()),
        "laid_px": int((layer[..., 3] > 0).sum()), "plated_px": plated, "left_px": int(left.sum()) if order == "front" else 0,
        "covered_px": int((solid_body & (layer[..., 3] > 0)).sum()) if order == "front" else 0,
    }


def lay_behind(masker: Masker, lays: Sequence[tuple[Image.Image, float, Image.Image, float]], *,
               times: Iterable[int] | None = None) -> tuple[list[Image.Image], dict[str, Any]]:
    """Each of `lays` — a frame, the clip time it shows, a frame whose part to lay on it and the time that one shows —
    the first with the second's part laid behind its body in place of its own (`lay`), where the clip's frames at
    `times` (by default those beside the loop's wrap, `Masker.near_wrap`) read the part behind the body
    (`Masker.order`): (the frames, what was done). Or none is laid — the frames as given — and the record says why
    (`refused`): "front", the part is in front of the body; "no pairs", no order is read from `times`; "empty", a
    frame's part mask or a part's is empty. The order is read before any frame's mask."""
    given = [frame for frame, _, _, _ in lays]
    times = masker.near_wrap() if times is None else sorted(set(times))
    order = masker.order(times)
    record: dict[str, Any] = {"order": order, "times": list(times), "refused": None, "lays": []}
    if order["order"] != "behind":
        return given, {**record, "refused": order["order"] or "no pairs"}
    made = []
    for frame, at, part, part_at in lays:
        laid, done = lay(frame, masker.mask(frame, at), part, masker.mask(part, part_at), "behind")
        record["lays"].append({"at": at, "part_at": part_at, **done})
        if done["refused"]:
            return given, {**record, "refused": done["refused"]}
        made.append(laid)
    return made, record
