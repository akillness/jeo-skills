# SPDX-License-Identifier: Apache-2.0
"""A synthetic talking character for the face layer's tests (`sprite_gen.video.face_layer`, `face_pack`, `face_bake`).

A cartoon head on a still body, drawn area-sampled on a transparent 480 px cell (the key's colour left under no
coverage, as a keyer leaves it): a skin face in a dark outline, a hair cap and side locks, two eyes, a nose, a mouth, a
headset boom that crosses the lower face to the mouth's corner, a neck with a dark grey choker, shoulders. The head moves by a similarity about the mouth (place, size, tilt); the body does
not. A mouth is closed neutral (corners down), closed smiling (corners up) or open (an ellipse of `size` 1..4, a
tongue in it). A hand can be raised over the right cheek from a sleeve below, a finger at the open mouth's corner. A view draws a square of the cell at another size: the talking
clip is drawn at twice the size, as a face cut from the reference.

`write_case(root)` writes the reference, a talking clip, five body clips (an idle loop, a greeting that talks with its
own mouth and closes in a smile, a hand over the cheek, a head that goes 60 px up and back, a head that turns: it
tilts about its mouth and its hair, headset and cheeks move further, its mouth stays), the greeting's mouth timeline
and a face request naming them all.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 480
SS = 2
MOUTH = (240.0, 262.0)
SKIN = (250, 220, 200)
OUTLINE = (60, 30, 30)
HAIR = (180, 40, 40)
STRAND = (120, 25, 25)
BLUSH = (240, 185, 185)
EYE = (50, 25, 35)
LIP = (150, 60, 60)
MOUTH_IN = (120, 30, 40)
BOOM = (35, 35, 38)
CHOKER = (40, 40, 44)
CLOTH = (90, 110, 160)
SLEEVE = (230, 225, 215)
HAND = (245, 205, 190)
TONGUE = (245, 160, 170)  # light and warm, as a hand's skin
KEY = (0, 160, 70)  # left under no coverage, as a keyer leaves it
GEOMETRY = {"mouth": [240, 262], "eyes": [[175, 174, 215, 206], [265, 174, 305, 206]],
            "lower_face": {"top": 228, "box": [120, 228, 360, 400], "seeds": [[195, 255], [285, 255], [240, 305], [215, 280]]},
            "band_bottom": 300}
TALK_PLACE = [110, 90, 260]

# the talking clip: neutral closed frames round openings, a turn, then smiling closed frames round openings
TALK = ["neutral", "neutral", "neutral", 1, 2, 3, 4, "neutral", 2, 3, "neutral", 2, "smile", "smile", 3, 4, "smile", "smile"]
TALK_SETS = {"neutral": list(range(0, 11)), "smile": list(range(12, 18)), "turn": [11]}
# the greeting: its own mouth talks (voiced 2..8), closes and smiles from frame 10
GREET = ["neutral", "neutral", 1, 3, 2, 4, 3, 2, 1, 1, "smile", "smile", "smile", "smile", "smile", "smile"]
GREET_VOICED = range(2, 9)
GREET_OWN_END = 10
HAND_FRAMES = range(4, 9)
JUMP = [-60 * math.sin(math.pi * k / 8) for k in range(9)]
# a head that turns: it tilts 5 degrees about its mouth, and its hair, headset and cheeks go 12 px right as well; its
# mouth stays where it is. Closed but for two frames that open
TURN_NEAR, TURN_FAR = 45.0, 85.0
TURN = [math.sin(math.pi * k / 10) for k in range(11)]
TURN_MOUTH = ["neutral"] * 4 + [1, 2] + ["neutral"] * 5


def _pose(dx: float = 0.0, dy: float = 0.0, s: float = 1.0, th: float = 0.0) -> np.ndarray:
    """Cell pixel -> head pixel (the inverse of the head's similarity about the mouth)."""
    a = math.radians(th)
    rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]]) * s
    inv = np.linalg.inv(rot)
    c = np.array(MOUTH)
    m = np.eye(3)
    m[:2, :2] = inv
    m[:2, 2] = c - inv @ (c + np.array([dx, dy]))
    return m


def _ellipse(x, y, cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2


def draw(pose: dict | None = None, mouth: object = "neutral", hand: bool = False, view: tuple[int, int, int] = (0, 0, SIZE),
         turn: dict | None = None) -> Image.Image:
    """One cell: the head at `pose` (dx, dy, s, th) with `mouth`, on the still body, seen through `view` (x, y, side:
    the square of the cell drawn at SIZE). A head that `turn`s is at `turn` from TURN_FAR px of the mouth out (its hair,
    headset and cheeks) and at `pose` within TURN_NEAR px (the mouth and the skin round it), smoothly between."""
    n = SIZE * SS
    v, u = np.mgrid[0:n, 0:n]
    x0, y0, side = view
    X = x0 + (u + 0.5) / SS * side / SIZE
    Y = y0 + (v + 0.5) / SS * side / SIZE
    m = _pose(**(pose or {}))
    hx = m[0, 0] * X + m[0, 1] * Y + m[0, 2]
    hy = m[1, 0] * X + m[1, 1] * Y + m[1, 2]
    if turn is not None:
        far = _pose(**turn)
        t = np.clip((np.hypot(X - MOUTH[0], Y - MOUTH[1]) - TURN_NEAR) / (TURN_FAR - TURN_NEAR), 0, 1)
        w = t * t * (3 - 2 * t)
        hx = (1 - w) * hx + w * (far[0, 0] * X + far[0, 1] * Y + far[0, 2])
        hy = (1 - w) * hy + w * (far[1, 0] * X + far[1, 1] * Y + far[1, 2])
    rgb = np.zeros(X.shape + (3,))
    a = np.zeros(X.shape)

    def paint(mask, colour):
        rgb[mask] = colour
        a[mask] = 1.0

    # the body, still
    shoulders = _ellipse(X, Y, 240, 470, 200, 110)
    paint(shoulders < 1.06, OUTLINE)
    paint(shoulders < 1, CLOTH)
    paint((np.abs(X - 240) < 34) & (Y > 290) & (Y < 392), OUTLINE)
    paint((np.abs(X - 240) < 31) & (Y > 290) & (Y < 392), SKIN)
    paint((np.abs(X - 240) < 31) & (Y > 352) & (Y < 362), CHOKER)
    # the head, posed
    head = _ellipse(hx, hy, 240, 215, 105, 125)
    paint(head < 1.07, OUTLINE)
    paint(head < 1, SKIN)
    hair = (head < 1.07) & ((hy < 150) | ((hy < 250) & ((hx < 152) | (hx > 328))))
    paint(hair, HAIR)
    paint((head < 1) & (np.abs(hy - 150 - 6 * np.sin(hx / 9)) < 1.6), OUTLINE)
    for sx in (138, 145, 335, 342):  # strands in the side locks, and a blush under each eye: what the anchor reads
        paint(hair & (hy > 150) & (np.abs(hx - sx - 0.1 * (hy - 150)) < 0.9), STRAND)
    for bx in (190, 290):
        paint((head < 1) & ~hair & (_ellipse(hx, hy, bx, 236, 16, 5) < 1), BLUSH)
    for ex in (195, 285):
        eye = _ellipse(hx, hy, ex, 190, 18, 14)
        paint(eye < 1, EYE)
        paint(_ellipse(hx, hy, ex - 5, 184, 4, 4) < 1, (250, 250, 250))
    paint((np.abs(hx - 240) < 5) & (np.abs(hy - 229) < 1.2), (200, 150, 140))
    if mouth in ("neutral", "smile"):
        k = 0.006 if mouth == "neutral" else -0.012
        paint((np.abs(hx - 240) < 18) & (np.abs(hy - (262 + k * (hx - 240) ** 2)) < 1.6), LIP)
    else:
        size = int(mouth)  # type: ignore[call-overload]
        rim = _ellipse(hx, hy, 240, 262 + 2 * size, 11 + 3 * size, 3 + 4 * size)
        paint(rim < 1.25, OUTLINE)
        paint(rim < 1, MOUTH_IN)
        paint((rim < 1) & (_ellipse(hx, hy, *_tongue(size)) < 1), TONGUE)
    # the headset's boom, from beside the head to the mouth's corner
    t = np.clip(((hx - 335) * (272 - 335) + (hy - 215) * (266 - 215)) / ((272 - 335) ** 2 + (266 - 215) ** 2), 0, 1)
    paint(np.hypot(hx - (335 + t * (272 - 335)), hy - (215 + t * (266 - 215))) < 2.2, BOOM)
    if hand:  # its first finger at the corner of a mouth open to size 3
        sleeve = (X > 258) & (X < 324) & (Y > 330)
        paint(sleeve & ((X < 261) | (X > 321)), OUTLINE)
        paint(sleeve & (X >= 261) & (X <= 321), SLEEVE)
        palm = _ellipse(X, Y, 288, 305, 30, 34)
        paint(palm < 1.12, OUTLINE)
        paint(palm < 1, HAND)
        for fx in (268, 282, 296, 310):
            finger = (np.abs(X - fx) < 6.5) & (Y > 248) & (Y < 300)
            paint(finger & ~((np.abs(X - fx) < 4.5) & (Y > 251)), OUTLINE)
            paint((np.abs(X - fx) < 4.5) & (Y > 251) & (Y < 302), HAND)
    pm = np.concatenate([rgb * a[..., None], a[..., None]], -1).reshape(SIZE, SS, SIZE, SS, 4).mean((1, 3))
    alpha = pm[..., 3]
    colour = np.where(alpha[..., None] > 0, pm[..., :3] / np.maximum(alpha[..., None], 1e-6), KEY)
    return Image.fromarray(np.dstack([np.round(colour), np.round(alpha * 255)]).clip(0, 255).astype(np.uint8), "RGBA")


def _tongue(size: int) -> tuple[float, float, float, float]:
    ry = 3 + 4 * size
    return 240.0, 262 + 2 * size + 0.45 * ry, 0.55 * (11 + 3 * size), 0.45 * ry


def tongue_mask(size: int) -> np.ndarray:
    """Where an open mouth's tongue is on a cell, the head at rest."""
    yy, xx = np.mgrid[0:SIZE, 0:SIZE] + 0.5
    return _ellipse(xx, yy, *_tongue(size)) < 1


def hand_mask() -> np.ndarray:
    """Where the raised hand and its sleeve are solid on a cell (the outline included)."""
    on = np.asarray(draw(hand=True), np.int32)
    off = np.asarray(draw(hand=False), np.int32)
    return np.abs(on - off).max(-1) > 0


def _clip(folder: Path, cells: list[Image.Image]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for k, im in enumerate(cells):
        im.save(folder / f"frame-{k:04d}.png")


def write_case(root: Path) -> Path:
    """Every file of the synthetic case under `root`; returns the request's path."""
    root.mkdir(parents=True, exist_ok=True)
    draw().save(root / "reference.png")
    talk = [draw({"dx": 0.6 * math.sin(k / 3), "dy": 0.8 * math.cos(k / 4), "th": 0.4 * math.sin(k / 5)}, mouth, view=tuple(TALK_PLACE))
            for k, mouth in enumerate(TALK)]
    _clip(root / "talk", talk)
    _clip(root / "idle", [draw({"dx": math.cos(2 * math.pi * k / 12), "dy": 2 * math.sin(2 * math.pi * k / 12)}) for k in range(12)])
    greet = []
    for k, mouth in enumerate(GREET):
        w = math.sin(math.pi * k / 15)
        greet.append(draw({"dx": -10 * w, "dy": -12 * w, "s": 1 + 0.02 * w, "th": 3 * w}, mouth))
    _clip(root / "greet", greet)
    _clip(root / "cheek", [draw({"dy": 0.5 * math.sin(k)}, 3 if k in HAND_FRAMES else "neutral", hand=k in HAND_FRAMES) for k in range(10)])
    _clip(root / "jump", [draw({"dy": dy}) for dy in JUMP])
    _clip(root / "turn", [draw({"th": -5 * w}, mouth, turn={"dx": 12 * w, "th": -5 * w}) for w, mouth in zip(TURN, TURN_MOUTH)])
    rows = ["frame\tt_s\tstate\tsound"]
    for k, mouth in enumerate(GREET):
        state = "closed" if mouth in ("neutral", "smile") else "open"
        rows.append(f"{k}\t{k / 24:.3f}\t{state}\t{'voiced' if k in GREET_VOICED else 'silent'}")
    (root / "greet-mouth.tsv").write_text("\n".join(rows) + "\n", encoding="utf-8")
    request = {"kind": "sprite-gen-face-request", "version": 1, "fps": 24, "reference": "reference.png", "face": GEOMETRY,
               "talk": {"frames": "talk", "place": TALK_PLACE},
               "body": [{"name": "idle", "loop": True, "frames": "idle"},
                        {"name": "greet", "frames": "greet", "mouth_timeline": "greet-mouth.tsv"},
                        {"name": "cheek", "frames": "cheek"},
                        {"name": "jump", "frames": "jump"},
                        {"name": "turn", "frames": "turn"}]}
    path = root / "face-request.json"
    path.write_text(json.dumps(request, indent=1), encoding="utf-8")
    return path


def voice(rate: int = 48000) -> np.ndarray:
    """A line of five syllables of different loudness, 1.6 s, mono."""
    t = np.arange(int(1.6 * rate)) / rate
    x = np.zeros_like(t)
    for at, loud in ((0.2, 0.5), (0.45, 0.9), (0.7, 0.6), (1.0, 1.0), (1.3, 0.4)):
        w = np.clip((t - at) / 0.14, 0, 1)
        burst = np.sin(math.pi * w) ** 2 * (w > 0) * (w < 1)
        x += loud * burst * (np.sin(2 * math.pi * 220 * t) + 0.5 * np.sin(2 * math.pi * 440 * t))
    return (0.4 * x / np.abs(x).max()).astype(np.float32)
