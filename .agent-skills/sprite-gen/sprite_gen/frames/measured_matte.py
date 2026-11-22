# SPDX-License-Identifier: Apache-2.0
"""The measured background matte: a flat background of any colour, keyed from what the image painted.

The chroma engine (`extract.remove_chroma_background`) keys magenta and green backgrounds it
recognises as a key (`extract.is_border_key_candidate`), and the white matte (`cutout._matte_route`)
keys bright achromatic ones. A model asked for a key background often paints neither: a muted
yellow-green, an off-cyan, a grey, with noise, a gradient, a darker same-colour shadow round the
subject and thin dark strips along the edges. This matte keys those from a measurement of the image
itself, so no colour needs a route of its own (docs/chroma-alpha.md "The measured background").

1. Edge strips: thin lines along an edge in one colour that is not the background (a letterbox bar).
2. The background colour and its spread, read on a ring inside the strips (`measure_background`).
3. Background-like pixels: within the spread of the colour, or, on a saturated background, its hue
   in shade (`background_like`), so a drop shadow and a gradient are background too.
4. What is keyed: the background-like pixels connected to the edges, the strips, and, on a
   saturated background, enclosed pockets of it thick enough not to be a speck of the subject.
5. The edge: within `band` px of the keyed set, each pixel is unmixed between the local background
   and the nearest solid subject colour, giving partial alpha and the subject's own colour back.

Numpy only, no per-pixel Python loop, so a clip's frames key at the speed of a still.
"""

from __future__ import annotations

from typing import Any

from PIL import Image, ImageFilter

from sprite_gen._deps import np

STRIP_MAX_FRACTION = 0.03  # an edge strip is at most this share of the side it runs across (min 2 px)
STRIP_LINE_SHARE = 0.6  # a strip line: this share of it is one colour
RING_WIDTH = 8  # px of the measuring ring, inside the deepest a strip may go
MODE_BIN = 8  # RGB histogram bin of the background mode
INLIER_TOLERANCE = 24  # max-channel distance from the mode that counts as the background when measuring it
MIN_BACKGROUND_SHARE = 0.2  # the background holds at least this share of the ring
TOLERANCE_FLOOR = 26  # max-channel distance from the colour that is background (the white matte's 26)
SPREAD_SCALE = 4.0  # ... or this many spreads of the measured background, if wider
SATURATED_CHROMA = 40  # max - min channel at which a background's colour is its own (shade is then read)
SHADE_HUE = 30.0  # degrees of hue from the background's that are its shade (a model shades by hue, not by scale)
SHADE_SATURATION = 0.5  # ... at this share of its saturation or more
SHADE_CHROMA = (20.0, 0.15)  # ... and at least max(this, this share of its chroma): near-black lineart is not shade
HOLE_THICKNESS = 2  # an enclosed pocket survives this many erosions to be keyed (5 px across)
EDGE_BAND = 2  # px of edge unmixed outside the keyed set
ALPHA_FLOOR = 4  # alpha below this (of 255) is keyed outright
FULL_BACKGROUND_SHARE = 0.999  # keyed share at which nothing of a subject is left


def _shift_or(mask: np.ndarray) -> np.ndarray:
    """The mask grown by one px in the four directions."""
    grown = mask.copy()
    grown[1:] |= mask[:-1]
    grown[:-1] |= mask[1:]
    grown[:, 1:] |= mask[:, :-1]
    grown[:, :-1] |= mask[:, 1:]
    return grown


def _reconstruct(seed: np.ndarray, allowed: np.ndarray) -> np.ndarray:
    """The pixels of `allowed` connected (4-way) to `seed` inside it: geodesic reconstruction."""
    mask = seed & allowed
    while True:
        before = mask
        for _ in range(16):
            mask = _shift_or(mask) & allowed
        if np.array_equal(mask, before):
            return mask


def _erode(mask: np.ndarray, times: int) -> np.ndarray:
    for _ in range(times):
        inner = mask.copy()
        inner[1:] &= mask[:-1]
        inner[:-1] &= mask[1:]
        inner[:, 1:] &= mask[:, :-1]
        inner[:, :-1] &= mask[:, 1:]
        mask = inner
    return mask


def _filled_mean(rgb: np.ndarray, weight: np.ndarray, radii: tuple[int, ...]) -> tuple[np.ndarray, np.ndarray]:
    """Per pixel the mean colour of the weighted pixels nearby, at the smallest radius that has any.

    Returns (colour, found): `found` is False where no radius reached a weighted pixel."""
    height, width = weight.shape
    colour = np.zeros((height, width, 3), dtype=np.float32)
    found = np.zeros((height, width), dtype=bool)
    w8 = Image.fromarray((weight * 255).astype(np.uint8))
    channels = [Image.fromarray((rgb[..., c] * weight).astype(np.uint8)) for c in range(3)]
    for radius in radii:
        bw = np.asarray(w8.filter(ImageFilter.BoxBlur(radius))).astype(np.float32) / 255
        new = ~found & (bw > 0.02)
        if not new.any():
            continue
        for c in range(3):
            bc = np.asarray(channels[c].filter(ImageFilter.BoxBlur(radius))).astype(np.float32)
            colour[..., c][new] = (bc / np.maximum(bw, 1e-4))[new]
        found |= new
    return colour, found


def _hue_chroma_saturation(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """HSV hue (degrees), chroma (max - min) and saturation (chroma / max) of RGB in 0..255."""
    high, low = rgb.max(axis=-1), rgb.min(axis=-1)
    chroma = high - low
    safe = np.maximum(chroma, 1e-4)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(high == r, ((g - b) / safe) % 6, np.where(high == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 60
    return hue, chroma, chroma / np.maximum(high, 1.0)


def background_like(rgb: np.ndarray, colour: np.ndarray, tolerance: float, shade: bool) -> np.ndarray:
    """Pixels that are the background `colour` (one RGB, or one per pixel): within `tolerance` on
    every channel, or, when `shade`, its hue in shade: within `SHADE_HUE` of its hue, at
    `SHADE_SATURATION` of its saturation and with chroma over `SHADE_CHROMA`, at any brightness.
    A model darkens a green background toward a deeper, purer green, not toward black along the
    same RGB line, so the shade is read in hue."""
    like = np.abs(rgb - colour).max(axis=-1) <= tolerance
    if shade:
        hue, chroma, saturation = _hue_chroma_saturation(rgb)
        key_hue, key_chroma, key_saturation = _hue_chroma_saturation(np.broadcast_to(colour, rgb.shape))
        turn = np.abs(hue - key_hue) % 360
        like |= ((np.minimum(turn, 360 - turn) <= SHADE_HUE) & (saturation >= SHADE_SATURATION * key_saturation)
                 & (chroma >= np.maximum(SHADE_CHROMA[0], SHADE_CHROMA[1] * key_chroma)))
    return like


def _strip_depth(height: int, width: int) -> int:
    return max(2, round(min(height, width) * STRIP_MAX_FRACTION))


def _ring(height: int, width: int) -> np.ndarray:
    inset = _strip_depth(height, width) + 2
    ring = np.zeros((height, width), dtype=bool)
    outer = min(inset + RING_WIDTH, height // 2, width // 2)
    if outer <= inset:  # a tiny image: the whole border
        ring[:2] = ring[-2:] = True
        ring[:, :2] = ring[:, -2:] = True
        return ring
    ring[inset:outer, inset:width - inset] = True
    ring[height - outer:height - inset, inset:width - inset] = True
    ring[inset:height - inset, inset:outer] = True
    ring[inset:height - inset, width - outer:width - inset] = True
    return ring


def measure_background(rgb: np.ndarray) -> dict[str, Any] | None:
    """The flat background's colour and spread, read on a ring just inside where an edge strip may
    reach: the mode of the ring's colours, then the mean and spread of the ring pixels within
    `INLIER_TOLERANCE` of it. None when no colour holds `MIN_BACKGROUND_SHARE` of the ring."""
    height, width = rgb.shape[:2]
    samples = rgb[_ring(height, width)]
    if not len(samples):
        return None
    bins = samples.astype(np.int32) // MODE_BIN
    slots = (bins[:, 0] << 10) | (bins[:, 1] << 5) | bins[:, 2]
    counts = np.bincount(slots)
    mode = int(np.argmax(counts))
    seed = samples[slots == mode].mean(axis=0)
    inliers = samples[np.abs(samples - seed).max(axis=-1) <= INLIER_TOLERANCE]
    share = len(inliers) / len(samples)
    if share < MIN_BACKGROUND_SHARE:
        return None
    colour = inliers.mean(axis=0)
    spread = float(inliers.std(axis=0).max())
    chroma = float(colour.max() - colour.min())
    return {"colour": colour, "spread": spread, "share": share, "chroma": chroma,
            "shade": chroma >= SATURATED_CHROMA,
            "tolerance": max(float(TOLERANCE_FLOOR), SPREAD_SCALE * spread)}


def _edge_strips(rgb: np.ndarray, like: np.ndarray) -> tuple[np.ndarray, dict[str, int]]:
    """Lines along each edge in one colour that is not the background: (their pixels, depth per side).

    A line is a strip line when `STRIP_LINE_SHARE` of it is within `TOLERANCE_FLOOR` of its median
    and that colour is not mostly background; the strip is the run of such lines from the edge, at
    most `_strip_depth` deep. Only the strip colour's pixels (and the background's) are taken, so a
    subject drawn over the strip keeps its own pixels."""
    height, width = like.shape
    depth_max = _strip_depth(height, width)
    strip = np.zeros((height, width), dtype=bool)
    depths: dict[str, int] = {}
    views = {"top": (rgb, like, strip), "bottom": (rgb[::-1], like[::-1], strip[::-1]),
             "left": (rgb.transpose(1, 0, 2), like.T, strip.T),
             "right": (rgb.transpose(1, 0, 2)[::-1], like.T[::-1], strip.T[::-1])}
    for side, (lines, line_like, out) in views.items():
        depth = 0
        for k in range(min(depth_max, len(lines))):
            line = lines[k]
            if line_like[k].mean() >= STRIP_LINE_SHARE:
                break
            median = np.median(line, axis=0)
            same = np.abs(line - median).max(axis=-1) <= TOLERANCE_FLOOR
            if same.mean() < STRIP_LINE_SHARE:
                break
            out[k] |= same | line_like[k]
            depth = k + 1
        if depth:
            depths[side] = depth
    return strip, depths


def measured_matte(image: Image.Image, *, band: int = EDGE_BAND) -> tuple[Image.Image, dict[str, Any]]:
    """Key ``image``'s flat background of whatever colour it was painted. Returns (RGBA, stats).

    Raises SystemExit when no flat background is found on the ring, or when keying it would leave
    nothing of a subject."""
    rgba = np.asarray(image.convert("RGBA"))
    rgb = rgba[..., :3].astype(np.float32)
    height, width = rgb.shape[:2]
    measured = measure_background(rgb)
    if measured is None:
        raise SystemExit("cutout: no flat background colour holds the image's border ring; "
                         "is the background one colour?")
    colour, tolerance, shade = measured["colour"], measured["tolerance"], measured["shade"]

    like = background_like(rgb, colour, tolerance, shade) | (rgba[..., 3] == 0)
    strip, strips = _edge_strips(rgb, like)
    edge_seed = np.zeros_like(like)
    reach = _strip_depth(height, width) + 2 + RING_WIDTH
    edge_seed[:reach] = edge_seed[-reach:] = True
    edge_seed[:, :reach] = edge_seed[:, -reach:] = True
    connected = _reconstruct((edge_seed & like) | strip, like | strip)

    # a gradient: the background read again against its own colour nearby, the subject kept out
    local, found = _filled_mean(rgb, connected.astype(np.float32), (8, 32, 128))
    local = np.where(found[..., None], local, colour)
    like = background_like(rgb, local, tolerance, shade) | (rgba[..., 3] == 0)
    connected = _reconstruct((edge_seed & like) | strip, like | strip)

    # enclosed pockets of the background (between an arm and the body), thick enough not to be a speck;
    # only a saturated background's colour is its own: a pale one's pockets may be the subject's own
    # highlight or skin, so it is keyed by position alone (the white matte's rule)
    pockets = like & ~connected if shade else np.zeros_like(like)
    pockets = _reconstruct(_erode(pockets, HOLE_THICKNESS), pockets) if pockets.any() else pockets
    keyed = connected | pockets

    keyed_share = float(keyed.mean())
    if keyed_share >= FULL_BACKGROUND_SHARE:
        raise SystemExit(f"cutout: the measured background {tuple(int(v) for v in colour)} covers "
                         f"{keyed_share:.1%} of the image; there is no subject to cut out")

    # the edge: unmixed between the local background and the nearest solid subject colour
    near = keyed.copy()
    for _ in range(band):
        near = _shift_or(near)
    edge = near & ~keyed
    solid = ~near
    background, found = _filled_mean(rgb, keyed.astype(np.float32), (2, 8, 32, 128))
    background = np.where(found[..., None], background, colour)
    subject, found = _filled_mean(rgb, solid.astype(np.float32), (1, 2, 4, 8, 16, 64))
    subject = np.where(found[..., None], subject, rgb)
    toward = subject - background
    offset = rgb - background
    span = (toward * toward).sum(axis=-1)
    alpha = np.where(span > 900.0, (offset * toward).sum(axis=-1) / np.maximum(span, 1.0),
                     (np.abs(offset).max(axis=-1) - tolerance) / 60.0)
    alpha = np.clip(alpha, 0.0, 1.0)
    unmixed = np.clip((rgb - (1.0 - alpha[..., None]) * background) / np.maximum(alpha[..., None], 1e-3), 0, 255)
    edge_rgb = alpha[..., None] * unmixed + (1.0 - alpha[..., None]) * subject

    out = rgba.astype(np.float32).copy()
    out[edge, :3] = edge_rgb[edge]
    out[edge, 3] = np.minimum(out[edge, 3], np.round(alpha[edge] * 255))
    out[keyed] = 0
    faint = out[..., 3] < ALPHA_FLOOR
    out[faint] = 0
    result = Image.fromarray(np.clip(np.round(out), 0, 255).astype(np.uint8), "RGBA")

    residue = int((background_like(np.asarray(result)[..., :3].astype(np.float32), background, tolerance, False)
                   & (np.asarray(result)[..., 3] >= 128) & near).sum())
    return result, {
        "route": "measured",
        "background": [int(round(v)) for v in colour],
        "background_spread": round(measured["spread"], 2),
        "background_ring_share": round(measured["share"], 4),
        "shade": shade,
        "tolerance": round(tolerance, 1),
        "edge_strips": strips,
        "keyed_pixels": int((out[..., 3] == 0).sum()),
        "pocket_pixels": int(pockets.sum()),
        "edge_pixels": int(edge.sum()),
        "band": band,
        "key_residue_px": residue,
    }
