# SPDX-License-Identifier: Apache-2.0
"""Synthetic title lettering on a key background, with the ground truth it was made from.

No font is drawn: the "letters" are strokes and rings drawn with ImageDraw shapes, so the
fixture is the same on every machine. A glow is the letters' mask blurred and laid under
them in its own colour, which is how a lettering model paints one. The composite onto the
key is exact alpha blending, so the truth (coverage and colour of every pixel) is known.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

MAGENTA_PAINTED = (250, 6, 245)
GREEN_PAINTED = (8, 248, 12)


@dataclass
class Lettering:
    image: Image.Image  # the RGB picture a model would return: lettering on the key
    alpha: np.ndarray  # (H, W) true coverage 0..1
    colour: np.ndarray  # (H, W, 3) true colour where alpha > 0
    letters: np.ndarray  # (H, W) bool: inside a letter's solid body (eroded by 2 px)
    background: np.ndarray  # (H, W, 3) the key field the lettering was laid on


def _letter_mask(size: tuple[int, int], *, pixel: bool = False) -> Image.Image:
    """Three thick 'letters' (an I, an O ring and an L) as a soft or hard mask."""
    width, height = size
    scale = 4 if not pixel else 1
    mask = Image.new("L", (width * scale, height * scale), 0)
    draw = ImageDraw.Draw(mask)
    s = scale
    top, bottom = int(height * 0.32) * s, int(height * 0.68) * s
    stroke = max(4, int(height * 0.09)) * s
    left = int(width * 0.18) * s
    draw.rectangle((left, top, left + stroke, bottom), fill=255)
    cx, cy, r = int(width * 0.47) * s, (top + bottom) // 2, (bottom - top) // 2
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    draw.ellipse((cx - r + stroke, cy - r + stroke, cx + r - stroke, cy + r - stroke), fill=0)
    lx = int(width * 0.68) * s
    draw.rectangle((lx, top, lx + stroke, bottom), fill=255)
    draw.rectangle((lx, bottom - stroke, lx + stroke * 3, bottom), fill=255)
    if scale > 1:
        mask = mask.resize((width, height), Image.Resampling.LANCZOS)
    return mask


def hollow_letters(size: tuple[int, int], *, pixel: bool = False) -> Image.Image:
    """Two big 'letters' whose counters the key shows through, as a soft or hard mask: an O ring, and an A whose
    crossbar closes its counter and whose legs stand open below it."""
    width, height = size
    s = 4 if not pixel else 1
    mask = Image.new("L", (width * s, height * s), 0)
    draw = ImageDraw.Draw(mask)
    top, bottom = int(height * 0.12) * s, int(height * 0.88) * s
    tall = bottom - top
    stroke = max(4, int(height * 0.12)) * s
    cx, cy, r = int(width * 0.28) * s, (top + bottom) // 2, tall // 2
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    draw.ellipse((cx - r + stroke, cy - r + stroke, cx + r - stroke, cy + r - stroke), fill=0)
    ax, half = int(width * 0.72) * s, tall * 55 // 100
    draw.polygon([(ax, top), (ax + half, bottom), (ax - half, bottom)], fill=255)

    def leg(y: float, side: int) -> float:  # a leg's inner edge at row y: its outer edge moved a stroke inward
        return ax + side * (half * (y - top) / tall - stroke)

    apex, bar_top, bar_bottom = top + stroke * tall / half, top + tall * 55 // 100, top + tall * 70 // 100
    draw.polygon([(ax, apex), (leg(bar_top, 1), bar_top), (leg(bar_top, -1), bar_top)], fill=0)
    draw.polygon([(leg(bar_bottom, -1), bar_bottom), (leg(bar_bottom, 1), bar_bottom),
                  (leg(bottom + s, 1), bottom + s), (leg(bottom + s, -1), bottom + s)], fill=0)
    if s > 1:
        mask = mask.resize((width, height), Image.Resampling.LANCZOS)
    return mask


def lettering(
    *,
    size: tuple[int, int] = (320, 160),
    fill: tuple[int, int, int] = (250, 246, 236),
    outline: tuple[int, int, int] | None = None,
    glow: tuple[int, int, int] | None = (255, 255, 255),
    glow_radius: float = 9.0,
    glow_strength: float = 0.95,
    key: tuple[int, int, int] = MAGENTA_PAINTED,
    gradient: float = 0.0,
    noise: float = 2.0,
    pixel: bool = False,
    seed: int = 7,
    shapes: Callable[..., Image.Image] = _letter_mask,
) -> Lettering:
    width, height = size
    mask = np.asarray(shapes(size, pixel=pixel), dtype=np.float64) / 255.0
    body = mask
    colour = np.broadcast_to(np.array(fill, dtype=np.float64), (height, width, 3)).copy()
    if outline is not None:
        grown = np.asarray(shapes(size, pixel=pixel).filter(ImageFilter.MaxFilter(7)), dtype=np.float64) / 255.0
        inner = np.asarray(shapes(size, pixel=pixel).filter(ImageFilter.MinFilter(3)), dtype=np.float64) / 255.0
        body = grown
        # outline ink where the grown mask covers and the eroded fill does not
        colour = inner[..., None] * np.array(fill, dtype=np.float64) + (1 - inner[..., None]) * np.array(outline, dtype=np.float64)
    alpha_glow = np.zeros((height, width))
    if glow is not None:
        blurred = Image.fromarray(np.uint8(np.round(body * 255))).filter(ImageFilter.GaussianBlur(glow_radius))
        alpha_glow = np.asarray(blurred, dtype=np.float64) / 255.0 * glow_strength
    alpha = 1 - (1 - body) * (1 - alpha_glow)
    glow_rgb = np.array(glow if glow is not None else (0, 0, 0), dtype=np.float64)
    true_colour = np.where(alpha[..., None] > 0,
                           (body[..., None] * colour + (1 - body[..., None]) * alpha_glow[..., None] * glow_rgb)
                           / np.maximum(alpha[..., None], 1e-9), 0.0)
    yy, xx = np.mgrid[0:height, 0:width]
    vignette = gradient * (((xx / width - 0.5) ** 2 + (yy / height - 0.5) ** 2) / 0.5)
    background = np.clip(np.array(key, dtype=np.float64) - vignette[..., None] * np.array([1.0, -0.4, 1.0]), 0, 255)
    rng = np.random.default_rng(seed)
    observed = alpha[..., None] * true_colour + (1 - alpha[..., None]) * background
    observed = observed + rng.normal(0.0, noise, observed.shape)
    image = Image.fromarray(np.uint8(np.clip(np.round(observed), 0, 255)), "RGB")
    solid = np.asarray(Image.fromarray(np.uint8(body >= 0.999) * 255).filter(ImageFilter.MinFilter(5))) > 0
    return Lettering(image=image, alpha=alpha, colour=true_colour, letters=solid, background=background)


PINK, BUTTER, MINT, SKY = (240, 140, 200), (250, 230, 140), (150, 235, 190), (140, 200, 240)
PLUM = (90, 40, 80)
QUILT = (PINK, BUTTER, MINT, SKY)  # pink and plum are in magenta's hue, mint in green's


def quilt(*, size: tuple[int, int] = (320, 160), key: tuple[int, int, int] = GREEN_PAINTED,
          colours: tuple[tuple[int, int, int], ...] = QUILT, outline: tuple[int, int, int] = PLUM, noise: float = 2.0,
          patch: int = 14, seed: int = 7) -> tuple[Image.Image, np.ndarray]:
    """Patchwork pixel letters: three outlined blocks (the middle one with a counter the key shows through)
    filled with square fabric patches (pink, butter yellow, mint and sky blue in a plum outline), on a key.
    Returns (the RGB picture, the mint patches' mask)."""
    width, height = size
    rgb = np.broadcast_to(np.array(key, dtype=np.float64), (height, width, 3)).copy()
    mint = np.zeros((height, width), dtype=bool)
    top, bottom, wide, rim = int(height * 0.18), int(height * 0.82), int(width * 0.2), 4
    for number, left in enumerate((int(width * 0.08), int(width * 0.4), int(width * 0.72))):
        rgb[top:bottom, left:left + wide] = outline
        for row, y in enumerate(range(top + rim, bottom - rim, patch)):
            for column, x in enumerate(range(left + rim, left + wide - rim, patch)):
                y1, x1 = min(y + patch, bottom - rim), min(x + patch, left + wide - rim)
                colour = colours[(row + column + number) % len(colours)]
                rgb[y:y1, x:x1] = colour
                mint[y:y1, x:x1] = colour == MINT
        if number == 1:  # a counter, outlined, with the key showing through it
            cy, cx, half_h, half_w = (top + bottom) // 2, left + wide // 2, height // 8, wide // 6
            rgb[cy - half_h - rim:cy + half_h + rim, cx - half_w - rim:cx + half_w + rim] = outline
            rgb[cy - half_h:cy + half_h, cx - half_w:cx + half_w] = key
            mint[cy - half_h - rim:cy + half_h + rim, cx - half_w - rim:cx + half_w + rim] = False
    rgb += np.random.default_rng(seed).normal(0.0, noise, rgb.shape)
    return Image.fromarray(np.uint8(np.clip(np.round(rgb), 0, 255)), "RGB"), mint


NAVY, KEY_GREEN = (30, 34, 70), (0, 255, 0)


def walled_patch(*, patch: tuple[int, int, int, int] = (65, 135, 100, 220), holes: tuple[tuple[int, int, int], ...] = (),
                 opening: tuple[int, int] | None = None) -> Image.Image:
    """One navy letter block (rows 20-180, columns 20-300 of a 200x320 picture) on pure green, flat and without
    noise, with a mint patch walled in by it (`patch`: top, bottom, left, right), which the matte cuts see-through on
    green. `holes` (top, left, side) are squares of the key painted into the letter, which it cuts to nothing;
    `opening` (row, column) is one pixel of the key. The default patch is the end validator's counterexample."""
    rgb = np.full((200, 320, 3), KEY_GREEN, dtype=np.uint8)
    rgb[20:180, 20:300] = NAVY
    top, bottom, left, right = patch
    rgb[top:bottom, left:right] = MINT
    for y, x, side in holes:
        rgb[y:y + side, x:x + side] = KEY_GREEN
    if opening is not None:
        rgb[opening] = KEY_GREEN
    return Image.fromarray(rgb, "RGB")


def key_excess(rgb: np.ndarray, key: str = "magenta") -> np.ndarray:
    """How much of the key's hue a colour carries: min(R,B)-G for magenta, G-max(R,B) for green."""
    rgb = np.asarray(rgb, dtype=np.float64)
    if key == "magenta":
        return np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
    return rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])


def over(rgba: np.ndarray, backdrop: tuple[int, int, int]) -> np.ndarray:
    """An RGBA array composited over a flat backdrop, as float RGB."""
    rgba = np.asarray(rgba, dtype=np.float64)
    a = rgba[..., 3:4] / 255.0
    return a * rgba[..., :3] + (1 - a) * np.array(backdrop, dtype=np.float64)


def truth_over(item: Lettering, backdrop: tuple[int, int, int]) -> np.ndarray:
    a = item.alpha[..., None]
    return a * item.colour + (1 - a) * np.array(backdrop, dtype=np.float64)
