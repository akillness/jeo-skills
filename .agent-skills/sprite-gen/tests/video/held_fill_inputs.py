# SPDX-License-Identifier: Apache-2.0
"""Synthetic clips for the held-cell tests (tests/video/test_held_fill.py): figures that move every frame, and the same
figures with frames shown again. No real footage."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 120, 140
N = 24  # a walk's cycle, frames


def walker(phase: float) -> Image.Image:
    """A torso and head that bob a pixel with the step, and a dark foot going round a circle at an even speed, far enough
    a frame that a third of one moves it a pixel or more: every frame moves, and every time between two frames."""
    a = np.zeros((H, W, 4), dtype=np.uint8)
    bob = round(2 * (1 + math.cos(2 * phase)) / 2)
    a[30 + bob:100, 50:70] = (90, 90, 200, 255)
    a[10 + bob:30 + bob, 48:72] = (230, 190, 160, 255)
    fx, fy = 60 + round(28 * math.cos(phase)), 105 + round(28 * math.sin(phase))
    a[fy - 6:fy + 6, fx - 6:fx + 6] = (60, 60, 60, 255)
    return Image.fromarray(a, "RGBA")


def walk(frames: int = N + 6) -> list[Image.Image]:
    return [walker(2 * math.pi * k / N) for k in range(frames)]


def hopper(y: int, *, x: int = 52) -> Image.Image:
    """A block body standing `y` px off the floor, with an arm across it."""
    a = np.zeros((H, W, 4), dtype=np.uint8)
    top = 40 - y
    a[top:top + 80, x:x + 18] = (200, 80, 30, 255)
    a[top + 20:top + 26, x - 10:x + 28] = (60, 60, 60, 255)
    return Image.fromarray(a, "RGBA")


def hop(rest: int = 12, air: int = 14) -> list[Image.Image]:
    """Standing still, one hop up and down over `air` frames (a different height every frame), standing still again."""
    heights = [round(36 * math.sin(math.pi * (k + 1) / (air + 1))) + k % 2 for k in range(air)]
    return [hopper(0)] * rest + [hopper(h) for h in heights] + [hopper(0)] * rest


def swing(frames: int = 25) -> list[Image.Image]:
    """An arm swung out and back once, the last frame drawing the first again (a clip pinned to end on its start)."""
    out = []
    for k in range(frames):
        a = np.zeros((H, W, 4), dtype=np.uint8)
        a[30:110, 50:70] = (90, 90, 200, 255)
        # even reaches, an odd pixel more every other frame: no two neighbours alike, the last the first again
        reach = 2 * round(15 * math.sin(math.pi * k / (frames - 1))) + (k % 2 if 0 < k < frames - 1 else 0)
        a[50:58, 70:76 + reach] = (60, 60, 60, 255)
        out.append(Image.fromarray(a, "RGBA"))
    return out


def topple(count: int = 60) -> list[Image.Image]:
    """A body that stands still, sinks to the ground a pixel or more every frame, then lies still (a once cut's end)."""
    out = []
    for k in range(count):
        t = min(1.0, max(0.0, (k - 6) / 30))
        a = np.zeros((96, 128, 4), dtype=np.uint8)
        height = round(64 - 40 * t)
        width = round(16 + 36 * t)
        a[86 - height:86, 40:40 + width] = (200, 80, 30, 255)
        out.append(Image.fromarray(a, "RGBA"))
    return out


def save(frames: list[Image.Image], d: Path) -> Path:
    d.mkdir(parents=True)
    for k, f in enumerate(frames):
        f.save(d / f"{k:04d}.png")
    return d


def shown_again(frames: list[Image.Image], at: dict[int, int]) -> list[Image.Image]:
    """`frames` with frame k shown `at[k]` times (its copies byte for byte the same), the rest once: a clip that stalls."""
    out = []
    for k, f in enumerate(frames):
        out.extend([f] * at.get(k, 1))
    return out


def planter(reach: float) -> Image.Image:
    """A body standing on a foot planted on the floor (a light block, the same in every frame), an arm reaching out
    `reach` px."""
    a = np.zeros((H, W, 4), dtype=np.uint8)
    a[30:110, 50:70] = (90, 90, 200, 255)
    a[110:H - 8, 52:68] = (200, 160, 40, 255)
    a[50:58, 70:76 + round(reach)] = (60, 60, 60, 255)
    return Image.fromarray(a, "RGBA")


def slid(image: Image.Image, dx: int = 3) -> Image.Image:
    """`image` with its planted foot moved `dx` px along the floor: an in-between that drags a contact."""
    a = np.asarray(image).copy()
    foot = a[110:H - 8].copy()  # under the body: the foot alone
    a[110:H - 8] = 0
    a[110:H - 8, dx:] = foot[:, : W - dx]
    return Image.fromarray(a, "RGBA")


class Between:
    """Stand-in interpolator: the true frame of a synthetic clip between two of its frames, drawn again at its own
    time. Each frame is known by its pixels — `draw` at each of `times`, and every frame it makes — so a frame made
    from a frame made is known too. With a `period`, a later frame drawn at an earlier time is the next cycle's
    (a loop's wrap). `calls` lists (time of a, time of b, t) of each frame asked for."""

    def __init__(self, draw, times, *, period: float | None = None, after=None):
        self.draw, self.period, self.after = draw, period, after
        self.known: dict[bytes, float] = {}
        for t in times:
            self.known.setdefault(draw(t).tobytes(), float(t) % period if period else float(t))
        self.calls: list[tuple[float, float, float]] = []

    def __call__(self, a: Image.Image, b: Image.Image, t: float) -> Image.Image:
        ta, tb = self.known[a.tobytes()], self.known[b.tobytes()]
        if self.period and tb <= ta:
            tb += self.period
        at = ta + t * (tb - ta)
        im = self.draw(at % self.period if self.period else at)
        self.known.setdefault(im.tobytes(), at % self.period if self.period else at)
        self.calls.append((ta, tb, round(t, 4)))
        return self.after(im) if self.after else im


def walk_at(time: float) -> Image.Image:
    """The walker `time` frames into its cycle."""
    return walker(2 * math.pi * time / N)
