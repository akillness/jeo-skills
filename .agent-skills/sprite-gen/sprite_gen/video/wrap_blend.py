# SPDX-License-Identifier: Apache-2.0
"""The redrawn wrap of a pinned clip — `video-loop --wrap-blend auto` (docs/loop-repair.md section 6).

A video model given a clip's first frame as its last frame draws that frame again: the pinned last
frame stands where the first stands, but in the model's drawing of it — softer or sharper, another
tone, hair strands a pixel over. `--cycle pinned` drops that frame and gates on its pose (the pin);
the drawing is left, so the wrap (the last cell played back to the first) shows the redraw as one
jump in sharpness where every other step shows the motion.

The ruler is the redraw itself (`measure`): the first cell against the pinned frame, over the cut's
median step, at full size on the first cell's opaque inside over a dark ground. Over `seam_max` the
last half second of the cut takes the redraw's difference (first cell - pin, premultiplied) back in
a ramp, j/(K+1) on the j-th of its K cells (`blend`): each pose stays the cell's own, its drawing
turns into the first cell's by the wrap. At or under `seam_max` nothing is done, byte for byte.

A ramp of the difference draws whatever the two ends hold apart a second time, so only a redraw is
ramped (`gate`), per pixel:
- the first cell and the pin differ by a redraw: after one softness match for the clip (`equalize`),
  no value one holds lies more than `TAU` outside what the other holds within 1 px, on a 7x7 mean
  or a 7 px run, over black or over white (`_over`); and no value one holds lies more than `TAU`
  outside the other's 1 px range where the other's own 1 px range is under `KAPPA` of this one's
  (`_apart`, presence: the other frame has no drawing of that size there — a line, a dot or a part
  that moved 2 px or more, whatever its direction, length, spacing or width);
- the ramp cell stands where the pin stands: its 7x7 mean difference to the pin is within 1.5 x the
  redraw's + 2, and the same two tests against the pin hold.
What fails is widened 3 px and the ramp is feathered 7x7; a pixel whose weight is 0 is the filmed
pixel. A ramp that steps more than the cut already does, or does not shrink the wrap, is not used
(the after check): the cut is delivered as filmed, with a warning line.

The values are the ones docs/loop-repair.md section 6 records with its synthetic readings and limits;
changing one is measuring them again.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any

from PIL import Image

from sprite_gen._deps import np

MODES = ("auto", "off")
RAMP_SECONDS = 0.5  # the ramp: the last half second of the cut, at most a quarter of it
TAU = 12.0  # what a redraw does not do: a value 12 levels outside what the other end holds
KAPPA = 0.5  # presence: the other end's own 1 px range under half of this end's
RADIUS = 3  # 7x7 means, 7 px runs, the 3 px widening and the 7x7 feather
SLACK = 1.5  # a ramp cell stands where the pin stands within 1.5 x the redraw's difference + 2
SIGMAS = (0.0, 0.35, 0.5, 0.7)  # the softness match; no wider: a wider blur thins a moved 1 px line under TAU
DARK = np.array([20, 16, 28], np.float32)  # the ground the ruler composites on


def ramp_length(length: int, fps: float) -> int:
    """K: the cells of the cut the ramp covers — half a second, at most a quarter of the cut."""
    return min(round(RAMP_SECONDS * fps), length // 4)


def _float(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGBA"), dtype=np.float32)


def _pm(c: np.ndarray) -> np.ndarray:
    """Premultiplied RGBA, every channel 0..255."""
    a = c[..., 3:] / 255
    return np.concatenate([c[..., :3] * a, c[..., 3:]], -1)


def _unpm(p: np.ndarray, fallback: np.ndarray) -> np.ndarray:
    a = np.clip(p[..., 3:], 0, 255) / 255
    rgb = np.where(a > 1e-6, np.clip(p[..., :3], 0, None) / np.maximum(a, 1e-6), fallback[..., :3])
    rgb = np.minimum(rgb, 255)
    return np.clip(np.concatenate([rgb, a * 255], -1) + 0.5, 0, 255).astype(np.uint8).astype(np.float32)


def _boxmean(x: np.ndarray, r: int) -> np.ndarray:
    """Mean over the (2r+1)^2 window, edges repeated."""
    p = np.pad(x, r, mode="edge")
    c = np.cumsum(p, 0)
    c = np.concatenate([np.zeros_like(c[:1]), c], 0)
    x = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
    c = np.cumsum(x, 1)
    c = np.concatenate([np.zeros_like(c[:, :1]), c], 1)
    return (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)


def _dilate(m: np.ndarray, r: int) -> np.ndarray:
    return _boxmean(m.astype(np.float32), r) > 0


def _range(x: np.ndarray, h: int) -> tuple[np.ndarray, np.ndarray]:
    """Per channel, the least and the most value within h px (edges repeated)."""
    p = np.pad(x, ((h, h), (h, h), (0, 0)), mode="edge")
    rows, cols = x.shape[:2]
    lo = p[h:h + rows, h:h + cols].copy()
    hi = lo.copy()
    for dy in range(2 * h + 1):
        for dx in range(2 * h + 1):
            s = p[dy:dy + rows, dx:dx + cols]
            np.minimum(lo, s, out=lo)
            np.maximum(hi, s, out=hi)
    return lo, hi


def _grounds(p: np.ndarray) -> np.ndarray:
    """Premultiplied RGBA and the same over white: a sprite lands on any ground. Over black alone, a silhouette's
    transparent neighbour (0, 0, 0, 0) puts every dark value in range."""
    return np.concatenate([p, p[..., :3] + (255 - p[..., 3:])], -1)


@dataclass
class _Reach:
    """A frame on both grounds and what it holds within 1 px: computed once a frame, the pin's once a clip."""
    grounds: np.ndarray
    lo: np.ndarray
    hi: np.ndarray

    @classmethod
    def of(cls, p: np.ndarray) -> _Reach:
        g = _grounds(p)
        return cls(g, *_range(g, 1))


def _apart(a: _Reach, b: _Reach, tau: float, kappa: float) -> tuple[np.ndarray, np.ndarray]:
    """Per pixel, how far a value one frame holds lies outside what the other holds within 1 px, either way, the
    largest channel (`outside`: a part one frame has and the other has not within 1 px keeps its whole contrast; a line
    moved under 1 px, a softer edge, values between two neighbours keep nothing) — and where one frame has drawing the
    other has none of within 1 px (`present`: a value more than tau outside the other's range where the other's own range
    is under kappa of this one's, in any channel; a line drawn softer or half a pixel over keeps a share of its range in
    the other frame, a line moved 2 px or more does not, whatever its direction, length, spacing or width)."""
    oa = np.maximum(np.maximum(a.grounds - b.hi, b.lo - a.grounds), 0)
    ob = np.maximum(np.maximum(b.grounds - a.hi, a.lo - b.grounds), 0)
    ra, rb = a.hi - a.lo, b.hi - b.lo
    present = (((oa > tau) & (rb < kappa * ra)) | ((ob > tau) & (ra < kappa * rb))).any(-1)
    return np.maximum(oa, ob).max(-1), present


def _runs(x: np.ndarray, h: int) -> np.ndarray:
    """Per pixel, the largest mean over a 7 px run through it, across, down or along either diagonal (edges repeated):
    a 1 px line keeps its whole value here, where a 7x7 mean thins it seven times."""
    p = np.pad(x, h, mode="edge")
    rows, cols = x.shape
    best = None
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        s = sum(p[h + k * dy:h + k * dy + rows, h + k * dx:h + k * dx + cols] for k in range(-h, h + 1)) / (2 * h + 1)
        best = s if best is None else np.maximum(best, s)
    return best


def _over(outside: np.ndarray, r: int, tau: float) -> np.ndarray:
    """A part (a 7x7 mean) or a line (a 7 px run) held apart by more than tau."""
    return np.maximum(_boxmean(outside, r), _runs(outside, r)) > tau


def _gauss(x: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian blur of every channel, edges repeated."""
    if sigma <= 0:
        return x
    h = int(np.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-h, h + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(x, ((h, h), (0, 0), (0, 0)), mode="edge")
    y = sum(k[i] * p[i:i + x.shape[0]] for i in range(2 * h + 1))
    p = np.pad(y, ((0, 0), (h, h), (0, 0)), mode="edge")
    return sum(k[i] * p[:, i:i + x.shape[1]] for i in range(2 * h + 1))


def equalize(still: np.ndarray, pin: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """The clip's one softness difference: which end is the sharper and the Gaussian (`SIGMAS`) that brings it nearest
    the other over the figure (mean max-channel |difference| of premultiplied RGBA). Returns both ends premultiplied,
    the sharper one blurred, and the choice."""
    a, b = _pm(still), _pm(pin)
    fig = (still[..., 3] > 0) | (pin[..., 3] > 0)
    best: tuple[float, float, str, np.ndarray, np.ndarray] = (math.inf, 0.0, "none", a, b)
    for sigma in SIGMAS:
        for side in (("still", "pin") if sigma else ("none",)):
            x = _gauss(a, sigma) if side == "still" else a
            y = _gauss(b, sigma) if side == "pin" else b
            m = float(np.abs(x - y).max(-1)[fig].mean())
            if m < best[0]:
                best = (m, sigma, side, x, y)
    _, sigma, side, x, y = best
    return x, y, {"sigma": sigma, "blurred": side}


def _erode(m: np.ndarray, r: int) -> np.ndarray:
    out = m.copy()
    for _ in range(r):
        o = out.copy()
        o[1:, :] &= out[:-1, :]
        o[:-1, :] &= out[1:, :]
        o[:, 1:] &= out[:, :-1]
        o[:, :-1] &= out[:, 1:]
        out = o
    return out


def _comp(c: np.ndarray) -> np.ndarray:
    a = c[..., 3:] / 255
    return c[..., :3] * a + DARK * (1 - a)


def _step(a: np.ndarray, b: np.ndarray, mask: np.ndarray) -> float:
    """One step on the ruler: the mean over `mask` of the max-channel |b - a|, composited on the dark ground."""
    return float(np.abs(b - a).max(-1)[mask].mean())


@dataclass
class Reading:
    """The ruler (`measure`): every step of the cut (the last, the wrap), its median (the wrap left out) and the
    redraw's difference (the first cell against the pin), on `mask`, the first cell's opaque inside."""
    mask: np.ndarray
    steps: list[float]
    median: float
    residual: float


def measure(cells: list[Image.Image], pin: Image.Image) -> Reading | None:
    """The cut's steps and the redraw's difference at full size, on the first cell's opaque inside (alpha 250 and up,
    eroded 3 px) over a dark ground; None where the first cell has no such inside. One frame at a time: a long cut at
    full size is never held whole."""
    first = _float(cells[0])
    mask = _erode(first[..., 3] >= 250, 3)
    if not mask.any():
        return None
    c0 = _comp(first)
    steps, prev = [], c0
    for image in cells[1:]:
        c = _comp(_float(image))
        steps.append(_step(prev, c, mask))
        prev = c
    steps.append(_step(prev, c0, mask))
    return Reading(mask, steps, float(np.median(steps[:-1])), _step(c0, _comp(_float(pin)), mask))


def gate(still: np.ndarray, pin: np.ndarray, ramp: list[np.ndarray], *, tau: float = TAU, kappa: float = KAPPA,
         ) -> tuple[list[np.ndarray], dict[str, Any]]:
    """Per ramp cell, where the ramp may change a pixel (module docstring): the first cell and the pin differ there by a
    redraw, and the cell stands where the pin stands. What fails is widened `RADIUS` px. Also returns what it held:
    `pose_share` (the figure the two ends hold apart), `presence_share` (of it, what the presence test holds) and the
    softness match (`equalize`)."""
    r = RADIUS
    pinned = _pm(pin)
    reach_pin = _Reach.of(pinned)
    reach_still = _Reach.of(_pm(still))
    _, present = _apart(reach_still, reach_pin, tau, kappa)
    a, b, softness = equalize(still, pin)
    sharp_a = _Reach.of(a) if softness["blurred"] == "still" else reach_still
    sharp_b = _Reach.of(b) if softness["blurred"] == "pin" else reach_pin
    outside, _ = _apart(sharp_a, sharp_b, tau, kappa)
    pose = _over(outside, r, tau) | present
    floor = _boxmean(np.abs(reach_still.grounds[..., :4] - pinned).max(-1), r)
    settled = []
    for cell in ramp:
        p = _pm(cell)
        old = _boxmean(np.abs(p - pinned).max(-1), r) > SLACK * floor + 2
        outside, present_here = _apart(_Reach.of(p), reach_pin, tau, kappa)
        settled.append(~_dilate(pose | old | _over(outside, r, tau) | present_here, r))
    fig = still[..., 3] > 0
    area = max(int(fig.sum()), 1)
    return settled, {"pose_share": round(float((pose & fig).sum() / area), 4),
                     "presence_share": round(float((present & fig).sum() / area), 4), "equalize": softness}


def blend(still: np.ndarray, pin: np.ndarray, ramp: list[np.ndarray], settled: list[np.ndarray],
          ) -> tuple[list[np.ndarray], np.ndarray]:
    """The residual ramp over the K ramp cells: per pixel from the ramp cell on which it stands through to the end
    (`start`), j/(K+1) of the redraw's difference on the j-th, ramped over the cells left; the weight feathered 7x7. A
    pixel whose weight is 0 is the filmed pixel, byte for byte. Returns the cells and `start` (K: never stands)."""
    K = len(ramp)
    e = _pm(still) - _pm(pin)
    through = np.ones_like(settled[0])
    start = np.full(settled[0].shape, K, np.int32)
    for j in range(K - 1, -1, -1):
        through = through & settled[j]
        start[through] = j
    out = []
    for j, cell in enumerate(ramp):
        weight = np.where(start <= j, (j - start + 1) / (K - start + 1.0), 0.0).astype(np.float32)
        weight = _boxmean(weight, RADIUS)[..., None]
        p = _pm(cell) + weight * e
        p[..., 3:] = np.clip(p[..., 3:], 0, 255)
        p[..., :3] = np.clip(p[..., :3], 0, p[..., 3:])  # premultiplied: no colour over no cover
        out.append(np.where(weight > 0, _unpm(p, cell), cell))
    return out, start


def apply(cells: list[Image.Image], pin: Image.Image, *, fps: float, seam_max: float,
          ) -> tuple[list[Image.Image], dict[str, Any]]:
    """The cut's cells with its wrap blended where the pin redraws the first frame (module docstring), and the record
    (`wrap_blend` in the loop report). A cell the ramp leaves as it was is the same image; a cut not blended is the cut
    as given, its record saying why."""
    started = time.perf_counter()
    length = len(cells)
    K = ramp_length(length, fps)
    record: dict[str, Any] = {"applied": False, "K": K, "cells": []}

    def kept(why: str) -> tuple[list[Image.Image], dict[str, Any]]:
        record.update(why=why, seconds=round(time.perf_counter() - started, 2))
        return list(cells), record

    if K < 2:
        return kept(f"a cut of {length} frames holds no ramp of two cells (half a second, at most a quarter of the cut)")
    reading = measure(cells, pin)
    if reading is None:
        return kept("the first frame has no opaque inside to read the redraw on")
    if reading.median <= 0:
        return kept("the cut does not move: no step to read the redraw against")
    ratio = reading.residual / reading.median
    record.update(residual_ratio=round(ratio, 4), wrap_ratio_before=round(reading.steps[-1] / reading.median, 4))
    if not ratio > seam_max:
        return kept(f"the pinned frame draws the first as it is (the redraw {ratio:.2f}x the median step, "
                    f"within {seam_max:g})")
    still, last = _float(cells[0]), _float(pin)
    first_ramp = length - K
    ramp = [_float(cells[k]) for k in range(first_ramp, length)]
    settled, held = gate(still, last, ramp)
    out, start = blend(still, last, ramp, settled)
    fig = still[..., 3] > 0
    record.update(held, never_settled=round(float(((start == K) & fig).sum() / max(int(fig.sum()), 1)), 4))
    # The after check, on the ruler: the steps into and through the ramp, and the wrap, as the blend plays them.
    mask, median = reading.mask, reading.median
    c0 = _comp(still)
    prev = _comp(_float(cells[first_ramp - 1]))
    ramp_steps = []
    for c in out:
        here = _comp(c)
        ramp_steps.append(_step(prev, here, mask))
        prev = here
    wrap_after = _step(prev, c0, mask)
    bound = max(max(reading.steps[:-1]), seam_max * median)
    record.update(wrap_ratio_after=round(wrap_after / median, 4), ramp_step_max_ratio=round(max(ramp_steps) / median, 4),
                  bound_ratio=round(bound / median, 4))
    if max(ramp_steps) > bound or not wrap_after < reading.steps[-1]:
        record["after_check"] = "refused"
        return kept("the ramp steps more than the cut already does" if max(ramp_steps) > bound
                    else "the ramp does not shrink the wrap")
    blended = list(cells)
    for j, c in enumerate(out):
        image = Image.fromarray(c.astype(np.uint8), "RGBA")
        if image.tobytes() != cells[first_ramp + j].tobytes():
            blended[first_ramp + j] = image
            record["cells"].append(first_ramp + j)
    record.update(applied=bool(record["cells"]), after_check="passed",
                  why=(f"the pinned frame draws the first again (the redraw {ratio:.2f}x the median step, over "
                       f"{seam_max:g})" if record["cells"] else "every pixel the redraw changes is held"),
                  seconds=round(time.perf_counter() - started, 2))
    return blended, record


def warnings(record: dict[str, Any], *, seam_max: float) -> list[str]:
    """What a wrap the pin redraws became, in words (`video-loop: warning:` lines): a blend the after check refused, and
    a wrap still over `seam_max` after the blend. A wrap that needs no blend, or one blended within the limit, says
    nothing."""
    said = (f"the pinned last frame draws the first again (the redraw {record.get('residual_ratio', 0):.2f}x the cut's "
            f"median step)")
    if record.get("after_check") == "refused":
        return [f"{said} and the wrap blend was not used — {record['why']} (the ramp's largest step "
                f"{record['ramp_step_max_ratio']:.2f}x the median against {record['bound_ratio']:.2f}x, the wrap "
                f"{record['wrap_ratio_before']:.2f}x before and {record['wrap_ratio_after']:.2f}x after): the loop is cut "
                "as filmed and its wrap shows the redraw (docs/loop-repair.md section 6)"]
    if record.get("applied") and record["wrap_ratio_after"] > seam_max:
        return [f"{said}; blended, its wrap still steps {record['wrap_ratio_after']:.2f}x the median, over {seam_max:g}, "
                f"where the two ends hold a part apart ({100 * record['pose_share']:.2f} % of the figure held as filmed) — "
                "look at the wrap (docs/loop-repair.md section 6)"]
    return []
