# SPDX-License-Identifier: Apache-2.0
"""A synthetic jump for the root motion tests (tests/video/test_root_motion.py): a figure that crouches on the floor,
leaps, tucks its legs in the air with its mass centre on a parabola under a known gravity, lands and stands up with an
arm raised. Every frame shows a picture of its own but the held end pose. No real footage."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 240, 200
FLOOR = 186  # the lowest body row of a frame on the floor
FPS = 24.0
TAKEOFF, LANDING = 5, 15  # the last frame on the floor before the air, the first after
END = 19  # the frame from which the end pose is held
FRAMES = 25
X_TAKEOFF, X_LANDING = 60, 140  # the torso's middle on the floor at take-off and at landing
APEX = 40  # px the mass centre rises over the take-off's
AIR = (LANDING - TAKEOFF) / FPS  # seconds from take-off to landing
GRAVITY = 8 * APEX / AIR ** 2  # px a second squared: the parabola g·t·(T - t)/2 rises APEX at T/2
METERS_PER_PX = 9.81 / GRAVITY  # so the clip's gravity is the earth's


def pose(tuck: float, crouch: int, arm: int, raised: bool = False) -> np.ndarray:
    """The figure on a canvas of its own: a torso, a head, two legs that bend `tuck` (0..1) and lower the hip `crouch`
    px, and an arm reaching out `arm` px, or raised."""
    a = np.zeros((140, 120, 4), dtype=np.uint8)
    hip = 80 + crouch
    a[hip - 40:hip, 50:70] = (90, 90, 200, 255)
    a[hip - 58:hip - 40, 52:68] = (230, 190, 160, 255)
    leg = 40 - crouch - round(18 * tuck)
    lean = round(10 * tuck)
    for x in (51, 61):
        a[hip:hip + leg, x + lean:x + lean + 8] = (60, 60, 60, 255)
    if raised:
        a[hip - 70:hip - 34, 70:76] = (200, 80, 30, 255)
    else:
        a[hip - 34:hip - 28, 70:70 + arm] = (200, 80, 30, 255)
    return a


def centre(a: np.ndarray) -> tuple[float, float]:
    ys, xs = np.nonzero(a[..., 3] > 0)
    return float(xs.mean() + 0.5), float(ys.mean() + 0.5)


def _on_floor(a: np.ndarray, x: int) -> Image.Image:
    """`a` placed with its lowest row on the floor and its torso's middle at `x`."""
    bottom = int(np.nonzero(a[..., 3].any(axis=1))[0][-1])
    out = Image.new("RGBA", (W, H))
    out.paste(Image.fromarray(a, "RGBA"), (x - 60, FLOOR - bottom))
    return out


def _at(a: np.ndarray, x: float, y: float) -> Image.Image:
    """`a` placed with its mass centre at the whole pixel nearest (x, y)."""
    cx, cy = centre(a)
    out = Image.new("RGBA", (W, H))
    out.paste(Image.fromarray(a, "RGBA"), (round(x - cx), round(y - cy)))
    return out


def takeoff_root() -> tuple[float, float]:
    """The take-off frame's mass centre, where the parabola starts."""
    a = pose(0.0, 6, 16)
    bottom = int(np.nonzero(a[..., 3].any(axis=1))[0][-1])
    cx, cy = centre(a)
    return cx + X_TAKEOFF - 60, cy + FLOOR - bottom


def path(t: float) -> tuple[float, float]:
    """The mass centre `t` frames after take-off, on the parabola (px, y down)."""
    xa, ya = takeoff_root()
    s = t / FPS
    return xa + (X_LANDING - X_TAKEOFF) * s / AIR, ya - GRAVITY * s * (AIR - s) / 2


def draw(t: float) -> Image.Image:
    """The jump `t` frames in."""
    if t <= TAKEOFF:
        return _on_floor(pose(0.0, round(1.2 * t), 6 + round(2 * t)), X_TAKEOFF)
    if t < LANDING:
        u = (t - TAKEOFF) / (LANDING - TAKEOFF)
        return _at(pose(math.sin(math.pi * u), 6, 16 + round(4 * math.sin(math.pi * u))), *path(t - TAKEOFF))
    if t < END:
        return _on_floor(pose(0.0, 6 - round(1.5 * (t - LANDING)), 16), X_LANDING)
    return _on_floor(pose(0.0, 0, 16, raised=True), X_LANDING)


def jump() -> list[Image.Image]:
    return [draw(k) for k in range(FRAMES)]


def save(frames: list[Image.Image], d: Path) -> Path:
    d.mkdir(parents=True)
    for k, f in enumerate(frames):
        f.save(d / f"{k:04d}.png")
    return d
