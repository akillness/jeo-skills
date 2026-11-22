# SPDX-License-Identifier: Apache-2.0
"""The logo matte: title lettering drawn on a flat key, cut out with its glow kept (`sprite-gen logo`).

The sprite matte (`extract.remove_chroma_background_ycbcr`) is made for a sprite's edge, a
pixel or two between subject and key. Its coverage ramps from chroma distance 24 to 72, so
a white glow is already fully opaque half way to white and keeps the pink mix of glow and key
as its colour (a key halo round the letters), and fades below a fifth of the way are cut to
nothing (a glow that ends in a hard edge). A logo's glow is a long blend of one colour into
the key, so this matte explains each pixel as a mix

    observed = alpha * colour + (1 - alpha) * background

and writes the colour with the key's share taken out, so no coverage keeps the key's hue:

- *Background.* The key as painted, measured as a smooth field (a quadratic surface per
  channel) fitted to the pixels of the key's chroma family, so a vignette or a gentle
  gradient on the key stays background. Its noise (`sigma`) is measured on the same pixels.
  The border band must be mostly key, or the picture is refused: lettering whose scenery
  reaches the edges has no background to remove.
- *Solid.* A pixel far from the key in chroma (`SOLID_CHROMA`) and without the key's hue
  (`key_hued`: magenta min(R, B) - G, green G - max(R, B) above `KEY_HUE_TOL`, or a pale colour
  whose cast is mostly the key's) is the lettering's own material: fully opaque, its colour as
  drawn. Every mix of a light glow with the key carries the key's hue, so it is never here. Its
  rim is checked against the colour just inside it (`refine_edges`): a rim pixel that is a mix
  of the key with that colour is a letter's antialiased edge, not more material.
- *Blend.* Any other pixel off the background is a mix with some colour. Next to a solid
  pixel (`PALETTE_REACH`), the lettering's own colours are tried first: a palette learned
  from the solid pixels at a steep edge (`steep_edge`), where a letter's colour meets the
  key, none when fewer than `PALETTE_MIN_PX` do. The colour whose line to the background
  passes closest gives the coverage by projection when it explains the pixel: a letter's
  antialiased edge, in the letter's colour.
- *Unmix.* What no palette colour explains (a glow of another colour) takes the least
  coverage any colour could have: the share of the way from the background to the edge of
  the RGB cube (`alpha_floor`), which is exact for the bright, saturated colours glows are.
- *Faint.* Where a pixel is within `FAINT_SIGMAS` of the background noise, its offset is the
  mean over the faint pixels of its 5x5 window, so a glow's tail fading under the noise of
  one pixel is still measured (and a letter's edge, not faint, is never smeared into it).

The colour written is the observation with the background's share removed, clipped to the
cube. Coverage too faint to see (`MIN_ALPHA8`), isolated faint specks of noise and faint
coverage on the picture's outermost rows and columns (`FRAME_SEAM_PX`: a generated picture's
edge often carries a seam a few levels off the key) are cleared.
No font is ever drawn here or anywhere in the logo path.

Known limit: the dense part of a glow, past the coverage where its mix with the key still
shows the key's hue, cannot be told from a letter of that mixed colour by its pixels, and is
kept opaque in it: a cyan glow pooled in an O's counter on magenta (past about half), the
ring round a small gold sparkle's white core on green (past about three quarters, an olive
cast). A glow keeps the key's hue far longer on the key whose hue it shares more (a cyan or
a yellow glow on green, an orange one on magenta; a white glow on either): `--chroma-key`
picks it; the letters' own colours weigh more in that choice, since a letter in the key's
hue is lost entirely.

The other side of it: a letter's own colour in the key's hue (mint on green) is, by its
pixels, a mix with the key, and is cut see-through. `choose_key` keeps such a key off the
lettering, and `see_through_inside` finds what was cut see-through inside the letters, where
no glow reaches.
"""

from __future__ import annotations

from typing import Any

from PIL import Image

from sprite_gen._deps import np
from sprite_gen.frames.cutout import KEY_TARGETS, MAGENTA
from sprite_gen.frames.decontam import _box_sum, _ring_depth, learn_palette
from sprite_gen.frames.extract import _grow_into

KEYS = KEY_TARGETS
LETTERING_BOX = "lettering-box"  # `choose_key`'s region when it read the colours in the title's box
UNMIX = "logo-unmix"  # `matte`'s method: the lettering cut off its key here (`native` keeps the image's own alpha)
KEY_FAMILY_DIST = 64.0  # CbCr distance from the declared key that a background sample may sit at
BORDER_FRACTION = 1 / 64  # the border band read for the key: this share of the short side, at least 4 px
MIN_BORDER_KEY_SHARE = 0.5  # share of that band that must be the key
SOLID_CHROMA = 72.0  # extract._YCC_CHROMA_OUT: this far from the background in chroma is material or a dense mix
KEY_HUE_TOL = 16.0  # a colour carrying more of the key's hue than this is a mix with the key, not material
NOISE_SIGMAS = 3.0
MIN_HEADROOM = 24.0  # a channel with less room than this between the background and the cube edge says nothing
EXPLAIN_RATIO = 0.25  # a colour inside the material explains a rim pixel as a mix missing by at most this share
PALETTE_RATIO = 0.1  # a palette colour explains a mix only this closely: a letter's antialiased edge lies on its
#                      line; a glow of another colour, projected on it, would read denser and keep the key's hue
PALETTE_SIZE = 16
MIN_ALPHA8 = 3  # coverage below 3/255 is not seen on any backdrop and is cleared
SPECK_RADIUS = 2  # a faint pixel with fewer than SPECK_MIN_NEIGHBOURS visible in its 5x5 window is noise
SPECK_MIN_NEIGHBOURS = 4
SPECK_MAX_ALPHA8 = 64
FRAME_SEAM_PX = 4  # within this many px of the picture's edge, faint coverage (below SEAM_MAX_ALPHA8) is the
SEAM_MAX_ALPHA8 = 64  # model's edge seam, not lettering: the lettering is asked for with an empty margin
TRIM_PAD_PX = 2  # the trimmed logo keeps this much transparent margin round its outermost visible pixel
SEE_THROUGH_WARN_SHARE = 0.25  # fewer opaque pixels than this among the visible ones: the lettering is see-through
SAMPLE_STRIDE = 2  # background samples are read on this grid
RAMP_COS = 0.996  # two offsets from the background this close in direction lie on one line (about 5 degrees)
STEEP_RADIUS = 3  # a letter's edge reaches the background, or half way to it, within this many px
STEEP_SHARE = 0.5
FAINT_SIGMAS = 6.0  # a pixel this close to the background (in noise) is measured on its faint neighbours' mean
FAINT_RADIUS = 2
PALE_CAST = 0.2  # a pale colour (every channel above PALE_MIN) whose colour cast is this much the key's ...
PALE_MIN = 128.0  # ... is a light glow laid over the key, whatever the size of the cast (above PALE_FLOOR)
PALE_FLOOR = 2.0
DEEP_RADIUS = 1  # material whose whole 3x3 window is material is inside it ...
RIM_REACH = 3  # ... and a rim pixel is checked against each such pixel this close
PALETTE_REACH = 3  # a palette colour explains a mix only this close to a solid pixel: a letter's own edge
PALETTE_MIN_PX = 32  # fewer solid pixels at a steep edge than this: no palette, every mix takes alpha_floor
FAINT_FLOOR = 4.0  # the background model's own error (levels): a faint mean below it is not lettering
CHOICE_KEY_EXCESS = 240.0  # the key's own excess as a model paints it (#FF00FF a few levels off)
CHOICE_HUED_WEIGHT = 4.0  # a lettering pixel in the key's hue costs this much more than a glow held less long
# A key whose hue is this share of the title's box in the mood image is one of the title's colours, and is not chosen
# (a letter in the key's hue comes out see-through on it); when the brief names a colour of the key's hue, this smaller
# share already is (the box holds scenery too: a word alone never rules a key out)
CLASH_HUED_PCT = 5.0
NAMED_CLASH_HUED_PCT = 1.0
INSIDE_ALPHA8 = 240  # coverage under this is see-through (`see_through_inside`)
INSIDE_CHANNEL_PX = 2  # a channel this narrow or narrower between see-through pixels and the background is no way out
INSIDE_EDGE_PX = 2  # see-through this close to the opaque lettering is its antialiased rim
INSIDE_REACH_QUANTILE = 0.99  # how far a glow reaches beside the letters: this quantile of its distance from them
INSIDE_MAX_REACH_PX = 64
INSIDE_MAX_PCT = 1.0  # see-through inside the letters on this share of the visible lettering is wide: refused
_LUMA = (0.299, 0.587, 0.114)


def _cbcr(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """BT.601 chroma, centred on 128 (`extract.rgb_to_ycc`)."""
    luma = rgb[..., 0] * _LUMA[0] + rgb[..., 1] * _LUMA[1] + rgb[..., 2] * _LUMA[2]
    return (rgb[..., 2] - luma) * 0.564 + 128.0, (rgb[..., 0] - luma) * 0.713 + 128.0


def key_excess(rgb: np.ndarray, key: str) -> np.ndarray:
    """How much of the key's hue a colour carries (`extract._key_excess_field`)."""
    if key == MAGENTA:
        return np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
    return rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])


def key_hued(rgb: np.ndarray, key: str) -> np.ndarray:
    """A colour that leans to the key's hue: by more than KEY_HUE_TOL, or a pale colour whose small cast is
    mostly the key's (a white glow nine tenths over magenta is a pinkish white, cast 15 of 27)."""
    excess = key_excess(rgb, key)
    spread = rgb.max(-1) - rgb.min(-1)
    pale = (excess > PALE_FLOOR) & (excess > PALE_CAST * spread) & (rgb.min(-1) > PALE_MIN)
    return (excess > KEY_HUE_TOL) | pale


def _check_key(key: str) -> tuple[int, int, int]:
    if key not in KEYS:
        raise SystemExit(f"logo: unknown key {key!r}; expected one of {', '.join(KEYS)}")
    return KEYS[key]


def choose_key(mood: Image.Image, box: list[float] | None = None,
               named: dict[str, list[str]] | None = None) -> dict[str, Any]:
    """The key the lettering is redrawn on, from the colours of the mood image's lettering (`box`: left,
    top, right, bottom as shares of the image, where the text check found the title; the whole image
    without one), or None when the title's colours carry both keys' hues.

    The lettering keeps those colours on the key. A letter in the key's own hue is lost to it: a key
    whose hue is CLASH_HUED_PCT of the box is one of the title's colours and is not chosen, and one the
    brief names a colour of (`named`: the words, per key) already at NAMED_CLASH_HUED_PCT. Between the
    keys left, the share of key-hued pixels counts hard against a key, and a glow's mix with the key
    keeps the key's hue (and so its fade) up to a coverage that depends on the pair (`hold`): the key
    that keeps more of it wins. Magenta on a tie: it is the engine's default key."""
    rgb = np.asarray(mood.convert("RGB"), dtype=np.float64)
    region = "image"
    if box is not None:
        height, width = rgb.shape[:2]
        left, top, right, bottom = (int(round(v * n)) for v, n in zip(box, (width, height, width, height)))
        if right - left >= 8 and bottom - top >= 8:
            rgb = rgb[max(0, top):bottom, max(0, left):right]
            region = LETTERING_BOX
    scores = {}
    for key in KEYS:
        excess = key_excess(rgb, key)
        hued = float(key_hued(rgb, key).mean())
        hold = np.where(excess < KEY_HUE_TOL,
                        np.clip((CHOICE_KEY_EXCESS - KEY_HUE_TOL) / np.maximum(CHOICE_KEY_EXCESS - excess, 1e-9), 0, 1),
                        0.0)
        words = list((named or {}).get(key, []))
        clash_at = NAMED_CLASH_HUED_PCT if words else CLASH_HUED_PCT
        scores[key] = {"hued_pct": round(hued * 100, 2), "hold": round(float(hold.mean()), 4),
                       "score": round(float(hold.mean()) - CHOICE_HUED_WEIGHT * hued, 4), "named": words,
                       "clash_at_pct": clash_at, "clashes": hued * 100 >= clash_at}
    left = [key for key in KEYS if not scores[key]["clashes"]]
    key = max(left, key=lambda k: (scores[k]["score"], k == MAGENTA)) if left else None
    return {"key": key, "region": region, "scores": scores}


def border_key(image: Image.Image) -> str | None:
    """The key a lettering image was drawn on, read off its border band (None when neither covers it)."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.float64)
    height, width = rgb.shape[:2]
    band = max(4, int(min(height, width) * BORDER_FRACTION))
    border = np.zeros((height, width), dtype=bool)
    border[:band] = border[-band:] = True
    border[:, :band] = border[:, -band:] = True
    cb, cr = _cbcr(rgb[border])
    shares = {}
    for key, target in KEYS.items():
        key_cb, key_cr = _cbcr(np.array(target, dtype=np.float64))
        shares[key] = float((np.hypot(cb - key_cb, cr - key_cr) <= KEY_FAMILY_DIST).mean())
    best = max(shares, key=shares.get)
    return best if shares[best] >= MIN_BORDER_KEY_SHARE else None


def _design(height: int, width: int, rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    """The quadratic surface's terms (1, u, v, u^2, uv, v^2) at the given pixels, u and v in [-0.5, 0.5]."""
    u = cols / max(width - 1, 1) - 0.5
    v = rows / max(height - 1, 1) - 0.5
    return np.stack([np.ones_like(u), u, v, u * u, u * v, v * v], axis=-1)


def background_field(rgb: np.ndarray, key: str) -> tuple[np.ndarray, dict[str, Any]]:
    """The key as painted: a quadratic surface per channel over the key-family pixels, and its noise."""
    declared = np.array(_check_key(key), dtype=np.float64)
    height, width = rgb.shape[:2]
    cb, cr = _cbcr(rgb)
    key_cb, key_cr = _cbcr(declared[None, None, :])
    family = np.hypot(cb - key_cb[0, 0], cr - key_cr[0, 0]) <= KEY_FAMILY_DIST
    band = max(4, int(min(height, width) * BORDER_FRACTION))
    border = np.zeros((height, width), dtype=bool)
    border[:band] = border[-band:] = True
    border[:, :band] = border[:, -band:] = True
    border_share = float(family[border].mean()) if border.any() else 0.0
    if border_share < MIN_BORDER_KEY_SHARE:
        raise SystemExit(
            f"logo: the lettering image's border is not the {key} key ({border_share * 100:.1f}% of a {band} px border "
            f"band is the key, at least {MIN_BORDER_KEY_SHARE * 100:.0f}% is needed); the model drew more than the "
            "lettering on a flat key — generate it again")
    start = np.median(rgb[border & family], axis=0)
    spread0 = 1.4826 * np.median(np.abs(rgb[border & family] - start), axis=0) + 1.0
    grid = np.zeros((height, width), dtype=bool)
    grid[::SAMPLE_STRIDE, ::SAMPLE_STRIDE] = True
    near = family & grid & (np.abs(rgb - start) <= 3 * spread0 + 4).all(-1)
    rows, cols = np.nonzero(near)
    if len(rows) < 32:
        raise SystemExit(f"logo: too little of the {key} key is left to measure the background on")
    samples = rgb[rows, cols]
    design = _design(height, width, rows.astype(np.float64), cols.astype(np.float64))
    keep = np.ones(len(rows), dtype=bool)
    for _ in range(3):
        coef, *_ = np.linalg.lstsq(design[keep], samples[keep], rcond=None)
        residual = samples - design @ coef
        sigma = 1.4826 * np.median(np.abs(residual[keep]), axis=0)
        keep = (np.abs(residual) <= NOISE_SIGMAS * np.maximum(sigma, 1.0) + 2.0).all(-1)
    sigma = np.maximum(1.4826 * np.median(np.abs(residual[keep]), axis=0), 0.5)
    u = (np.arange(width, dtype=np.float64) / max(width - 1, 1) - 0.5)[None, :]
    v = (np.arange(height, dtype=np.float64) / max(height - 1, 1) - 0.5)[:, None]
    field = np.clip(np.stack([c[0] + c[1] * u + c[2] * v + c[3] * u * u + c[4] * u * v + c[5] * v * v
                              for c in coef.T], axis=-1), 0, 255)
    stats = {
        "mean": [round(float(c), 1) for c in field.reshape(-1, 3).mean(0)],
        "spread": round(float((field.reshape(-1, 3).max(0) - field.reshape(-1, 3).min(0)).max()), 1),
        "sigma": [round(float(s), 2) for s in sigma],
        "border_key_pct": round(border_share * 100, 1),
        "samples": int(keep.sum()),
    }
    return field, {**stats, "_sigma": sigma}


def alpha_floor(offset: np.ndarray, background: np.ndarray, sigma: np.ndarray) -> np.ndarray:
    """The least coverage any colour could have to make `background + offset`: the share of the
    way to the cube's edge, per channel, after a sigma of noise is taken off. Exact for colours on the
    cube's surface (white, black, saturated hues), a lower bound for every other."""
    headroom = np.where(offset > 0, 255.0 - background, background)
    excess = np.maximum(np.abs(offset) - sigma, 0.0)  # one sigma: a channel of noise must not lead the max
    share = np.where(headroom >= MIN_HEADROOM, excess / np.maximum(headroom, 1e-9), 0.0)
    return np.clip(share.max(-1), 0.0, 1.0)


def steep_edge(offset: np.ndarray, distance: np.ndarray, off_background: np.ndarray) -> np.ndarray:
    """Pixels where the lettering meets the key: within STEEP_RADIUS px, the background, or a pixel on the
    same line from it (`RAMP_COS`) at most STEEP_SHARE of the way out — a letter's antialiased edge. A
    letter's own colour is the one it shows there."""
    height, width = distance.shape
    r = STEEP_RADIUS
    padded = np.pad(offset, ((r, r), (r, r), (0, 0)))
    padded_distance = np.pad(distance, r)
    padded_off = np.pad(off_background, r, constant_values=True)
    steep = np.zeros((height, width), dtype=bool)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy == 0 and dx == 0:
                continue
            window = (slice(r + dy, r + dy + height), slice(r + dx, r + dx + width))
            other_off = padded_off[window]
            other_distance = padded_distance[window]
            collinear = other_off & ((offset * padded[window]).sum(-1) >= RAMP_COS * distance * other_distance)
            steep |= ~other_off | (collinear & (other_distance <= STEEP_SHARE * distance))
    return steep & off_background


def refine_edges(material: np.ndarray, rgb: np.ndarray, field: np.ndarray, offset: np.ndarray,
                 distance: np.ndarray, noise: float) -> np.ndarray:
    """The solid pixels: material, less its rim pixels that are a mix of the key with material just inside
    them. A letter's antialiased edge over a glow, or a glow's dense fringe round a thin bright core (a
    sparkle's ray, a swoosh), can carry less than KEY_HUE_TOL of the key's hue and still be part key: yellow
    a quarter over green is a yellow-green, gold four fifths over green an olive. A rim pixel that one of the
    pixels inside the material (whose 3x3 window is all material) within RIM_REACH px explains as such a mix,
    short of full, is a blend."""
    height, width = material.shape
    inner = _box_sum(material.astype(np.float64), DEEP_RADIUS) >= (2 * DEEP_RADIUS + 1) ** 2
    near_inner = _box_sum(inner.astype(np.float64), RIM_REACH) > 0
    rows, cols = np.nonzero(material & ~inner & near_inner)
    if not len(rows):
        return material
    obs = offset[rows, cols]
    bg = field[rows, cols]
    spread = EXPLAIN_RATIO * distance[rows, cols] + NOISE_SIGMAS * noise
    mixed = np.zeros(len(rows), dtype=bool)
    for dy in range(-RIM_REACH, RIM_REACH + 1):
        for dx in range(-RIM_REACH, RIM_REACH + 1):
            if not (dy or dx):
                continue
            qy, qx = rows + dy, cols + dx
            inside = (qy >= 0) & (qy < height) & (qx >= 0) & (qx < width)
            qy, qx = np.clip(qy, 0, height - 1), np.clip(qx, 0, width - 1)
            inside &= inner[qy, qx]
            line = rgb[qy, qx] - bg
            length = np.sqrt(np.maximum((line * line).sum(-1), 1e-9))
            along = (obs * line).sum(-1) / (length * length)
            miss = np.linalg.norm(obs - along[:, None] * line, axis=-1)
            mixed |= inside & (along > 0) & (along < 1.0 - NOISE_SIGMAS * noise / length) & (miss <= spread)
    solid = material.copy()
    solid[rows[mixed], cols[mixed]] = False
    return solid


def _coverage(obs: np.ndarray, bg: np.ndarray, sigma: np.ndarray, noise: np.ndarray,
              palette: np.ndarray, near: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Coverage of mixes `bg + obs` (N pixels): a palette colour's projection where one explains a pixel
    `near` a solid one, else the least coverage any colour could have (`alpha_floor`). `sigma` (N, 3) and
    `noise` (N,) are the noise of `obs`. Returns (coverage, explained)."""
    floor = alpha_floor(obs, bg, sigma)
    if not len(palette) or not len(obs):
        return floor, np.zeros(len(obs), dtype=bool)
    distance = np.linalg.norm(obs, axis=-1)
    best_miss = np.full(len(obs), np.inf)
    best_along = np.zeros(len(obs))
    for colour in palette:
        line = colour - bg
        length = np.sqrt(np.maximum((line * line).sum(-1), 1e-9))
        along = np.clip((obs * line).sum(-1) / (length * length), 0.0, 1.0)
        # within the noise of the palette colour itself is the colour itself: opaque
        along = np.where(along >= 1.0 - NOISE_SIGMAS * noise / length, 1.0, along)
        miss = np.linalg.norm(obs - along[:, None] * line, axis=-1)
        closer = miss < best_miss
        best_miss[closer] = miss[closer]
        best_along[closer] = along[closer]
    explained = near & (best_miss <= PALETTE_RATIO * distance + NOISE_SIGMAS * noise)
    return np.where(explained, np.maximum(best_along, floor), floor), explained


def _snap(cover: np.ndarray, obs: np.ndarray, noise: np.ndarray) -> np.ndarray:
    """Coverage within the noise of full is full: a solid colour the noise moved off the cube's edge."""
    distance = np.linalg.norm(obs, axis=-1)
    near_full = (cover >= 0.5) & (cover >= 1.0 - NOISE_SIGMAS * noise / np.maximum(distance, 1e-9))
    return np.where(near_full, 1.0, cover)


def matte(image: Image.Image, *, key: str) -> tuple[Image.Image, dict[str, Any]]:
    """Lettering on a flat `key` background -> (RGBA of the same size, stats). Refuses a picture whose
    border is not the key and one with no lettering left on it."""
    _check_key(key)
    rgba = np.asarray(image.convert("RGBA"))
    rgb = rgba[..., :3].astype(np.float64)
    source_alpha = rgba[..., 3].astype(np.float64) / 255.0
    field, background = background_field(rgb, key)
    sigma = background.pop("_sigma")
    sigma_norm = float(np.sqrt((sigma ** 2).sum()))
    offset = rgb - field
    distance = np.linalg.norm(offset, axis=-1)
    off_background = distance > NOISE_SIGMAS * sigma_norm
    cb, cr = _cbcr(rgb)
    field_cb, field_cr = _cbcr(field)
    chroma = np.hypot(cb - field_cb, cr - field_cr)
    material = (chroma >= SOLID_CHROMA) & ~key_hued(rgb, key)
    solid = refine_edges(material, rgb, field, offset, distance, sigma_norm)
    edge_solid = solid & steep_edge(offset, distance, off_background)
    near_solid = _box_sum(solid.astype(np.float64), PALETTE_REACH) > 0
    # a letter's own colour is the one it shows where it meets the key; colours seen only inside the
    # lettering may be a glow's dense part, and a palette of those would read the whole glow as denser
    palette = (learn_palette(np.round(rgb[edge_solid]).astype(np.int64), PALETTE_SIZE)
               if edge_solid.sum() >= PALETTE_MIN_PX else np.zeros((0, 3)))

    alpha = np.zeros(rgb.shape[:2])
    colour = np.zeros(rgb.shape)
    alpha[solid] = 1.0
    colour[solid] = rgb[solid]
    explained_px = unexplained_px = 0
    # strong mixes on their own pixel; faint ones on the mean of their faint neighbours
    strong = off_background & ~solid & (distance >= FAINT_SIGMAS * sigma_norm)
    faint_zone = ~solid & ~strong
    count = _box_sum(faint_zone.astype(np.float64), FAINT_RADIUS)
    mean = _box_sum(offset * faint_zone[..., None], FAINT_RADIUS) / np.maximum(count, 1.0)[..., None]
    faint_noise = np.maximum(sigma_norm / np.sqrt(np.maximum(count, 1.0)), FAINT_FLOOR / NOISE_SIGMAS)
    faint = faint_zone & (np.linalg.norm(mean, axis=-1) > NOISE_SIGMAS * faint_noise)
    for mask, obs_field, scale in ((strong, offset, None), (faint, mean, faint_noise)):
        rows, cols = np.nonzero(mask)
        if not len(rows):
            continue
        obs = obs_field[rows, cols]
        bg = field[rows, cols]
        if scale is None:
            pixel_sigma = np.broadcast_to(sigma, obs.shape)
            noise = np.full(len(rows), sigma_norm)
        else:
            shrink = (scale[rows, cols] / sigma_norm)[:, None]
            pixel_sigma = sigma[None, :] * shrink
            noise = scale[rows, cols]
        cover, explained = _coverage(obs, bg, pixel_sigma, noise, palette, near_solid[rows, cols])
        cover = _snap(cover, obs, noise)
        explained_px += int((explained & (cover > 0)).sum())
        unexplained_px += int((~explained & (cover > 0)).sum())
        alpha[rows, cols] = cover
        lit = cover > 0
        colour[rows[lit], cols[lit]] = np.clip(bg[lit] + obs[lit] / cover[lit, None], 0, 255)

    alpha8 = np.round(alpha * source_alpha * 255).astype(np.int64)
    alpha8[alpha8 < MIN_ALPHA8] = 0
    visible = alpha8 > 0
    neighbours = _box_sum(visible.astype(np.float64), SPECK_RADIUS)
    specks = visible & (neighbours < SPECK_MIN_NEIGHBOURS) & (alpha8 < SPECK_MAX_ALPHA8)
    alpha8[specks] = 0
    # the outermost rows and columns of a generated picture often carry a seam a few levels off the key
    frame = np.zeros(alpha8.shape, dtype=bool)
    edge = FRAME_SEAM_PX
    frame[:edge] = frame[-edge:] = True
    frame[:, :edge] = frame[:, -edge:] = True
    seam = frame & (alpha8 > 0) & (alpha8 < SEAM_MAX_ALPHA8)
    alpha8[seam] = 0
    if not (alpha8 > 0).any():
        raise SystemExit(f"logo: no lettering is left once the {key} key is removed — the model drew an empty key; "
                         "generate it again")
    out = np.zeros(rgba.shape, dtype=np.uint8)
    shown = alpha8 > 0
    out[shown, :3] = np.round(colour[shown]).astype(np.uint8)
    out[..., 3] = alpha8.astype(np.uint8)
    stats = {
        "method": UNMIX,
        "key": key,
        "background": background,
        "solid_px": int(solid.sum()),
        "edge_px": int(edge_solid.sum()),
        "blend_px": explained_px,
        "unmix_px": unexplained_px,
        "faint_px": int(faint.sum()),
        "partial_px": int(((alpha8 > 0) & (alpha8 < 255)).sum()),
        "specks_cleared_px": int(specks.sum()),
        "frame_seam_cleared_px": int(seam.sum()),
        "palette_size": int(len(palette)),
    }
    return Image.fromarray(out, "RGBA"), stats


def native(image: Image.Image) -> tuple[Image.Image, dict[str, Any]]:
    """A lettering image that came back with its own transparent background: kept on its alpha,
    the colour under alpha 0 scrubbed."""
    rgba = np.array(image.convert("RGBA"))
    rgba[rgba[..., 3] == 0] = 0
    if not (rgba[..., 3] > 0).any():
        raise SystemExit("logo: the lettering image came back fully transparent; generate it again")
    return Image.fromarray(rgba, "RGBA"), {"method": "native-alpha", "key": None,
                                           "partial_px": int(((rgba[..., 3] > 0) & (rgba[..., 3] < 255)).sum())}


def trim(image: Image.Image, *, pad: int = TRIM_PAD_PX) -> tuple[Image.Image, dict[str, Any]]:
    """Crop to every visible pixel and `pad` px of margin (no glow is cut: the box takes any alpha > 0)."""
    alpha = np.asarray(image.convert("RGBA"))[..., 3]
    rows, cols = np.nonzero(alpha)
    if not len(rows):
        raise SystemExit("logo: the logo is fully transparent; nothing to keep")
    width, height = image.size
    box = (max(0, int(cols.min()) - pad), max(0, int(rows.min()) - pad),
           min(width, int(cols.max()) + 1 + pad), min(height, int(rows.max()) + 1 + pad))
    return image.crop(box), {"bbox": list(box), "before": [width, height],
                             "after": [box[2] - box[0], box[3] - box[1]], "pad_px": pad}


def coverage(image: Image.Image) -> dict[str, Any]:
    """Shares of opaque, partial and empty pixels, and the opaque share of what is visible."""
    alpha = np.asarray(image.convert("RGBA"))[..., 3]
    total = alpha.size
    opaque = int((alpha == 255).sum())
    partial = int(((alpha > 0) & (alpha < 255)).sum())
    visible = opaque + partial
    return {"size": list(image.size), "opaque_pct": round(opaque / total * 100, 2),
            "partial_pct": round(partial / total * 100, 2), "empty_pct": round((total - visible) / total * 100, 2),
            "visible_opaque_share": round(opaque / visible, 4) if visible else 0.0}


def key_hue_left(image: Image.Image, key: str) -> dict[str, Any]:
    """Visible pixels (alpha >= 10 %) whose colour still carries the key's hue: the halo a viewer would see."""
    rgba = np.asarray(image.convert("RGBA")).astype(np.float64)
    seen = rgba[..., 3] >= 26
    hued = seen & (key_excess(rgba[..., :3], key) > KEY_HUE_TOL)
    return {"px": int(hued.sum()), "pct_of_visible": round(float(hued.sum()) / max(int(seen.sum()), 1) * 100, 3)}


def _way_out(alpha: np.ndarray) -> np.ndarray:
    """The pixels with a way out of the lettering: those reached from the transparent pixels on the picture's edge
    through transparent pixels and see-through ones (a channel of INSIDE_CHANNEL_PX or less not counting as a way),
    and the not-opaque pixels within INSIDE_CHANNEL_PX of them. Only what is joined to the edge is outside, however
    narrowly: a transparent hole walled in by the letters (a counter, or a letter's colour cut to nothing) is not a
    way out."""
    transparent = alpha == 0
    not_opaque = alpha < 255
    r = INSIDE_CHANNEL_PX // 2  # a pixel of a wider channel has its whole (2r+1)^2 window in the channel
    wide = not_opaque & (_box_sum(not_opaque.astype(np.float64), r) >= (2 * r + 1) ** 2)
    edge = np.zeros(alpha.shape, dtype=bool)
    edge[0] = edge[-1] = True
    edge[:, 0] = edge[:, -1] = True
    way_out = _grow_into(transparent & edge, wide | transparent)
    return way_out | (not_opaque & (_box_sum(way_out.astype(np.float64), INSIDE_CHANNEL_PX) > 0))


def see_through_inside(image: Image.Image) -> dict[str, Any]:
    """See-through pixels inside the letters (coverage under INSIDE_ALPHA8): walled in by the lettering — no way out
    to the picture's edge but across opaque pixels (`_way_out`) — and farther from the opaque lettering than its glow
    reaches beside it (`glow_reach_px`: the INSIDE_REACH_QUANTILE of how far the see-through pixels with a way out
    lie from it, at least INSIDE_EDGE_PX for a letter's antialiased rim). A glow fades out beside the letters and
    pools in a counter no farther than it reaches there; a letter's own colour in the key's hue, cut as a mix with
    the key, is see-through inside the letter, and a hole cut to nothing in it opens no way out. `wide` when that is
    INSIDE_MAX_PCT of the visible lettering or more."""
    alpha = np.asarray(image.convert("RGBA"))[..., 3]
    transparent = alpha == 0
    see = ~transparent & (alpha < INSIDE_ALPHA8)
    way_out = _way_out(alpha)
    depth = _ring_depth(alpha == 255, INSIDE_MAX_REACH_PX)
    beside = depth[see & way_out]
    reach = max(INSIDE_EDGE_PX, int(np.quantile(beside, INSIDE_REACH_QUANTILE)) if len(beside) else 0)
    inside = see & ~way_out & (depth > reach)
    visible = int((~transparent).sum())
    share = float(inside.sum()) / max(visible, 1) * 100
    return {"px": int(inside.sum()), "pct_of_visible": round(share, 2), "glow_reach_px": reach,
            "max_pct": INSIDE_MAX_PCT, "wide": share >= INSIDE_MAX_PCT}


def preview(image: Image.Image, *, dark: tuple[int, int, int] = (22, 24, 32),
            light: tuple[int, int, int] = (238, 236, 230), pad: int = 24) -> Image.Image:
    """The logo on a dark and on a light backdrop, side by side: where a halo or a hard edge shows."""
    logo = image.convert("RGBA")
    width, height = logo.size
    sheet = Image.new("RGB", (2 * (width + 2 * pad), height + 2 * pad), dark)
    sheet.paste(Image.new("RGB", (width + 2 * pad, height + 2 * pad), light), (width + 2 * pad, 0))
    sheet.paste(logo, (pad, pad), logo)
    sheet.paste(logo, (width + 3 * pad, pad), logo)
    return sheet


def reading_backdrop(image: Image.Image) -> Image.Image:
    """The logo on the plain backdrop it contrasts with most, for reading its text."""
    rgba = np.asarray(image.convert("RGBA")).astype(np.float64)
    seen = rgba[..., 3] > 128
    luma = float((rgba[..., :3][seen] @ np.array(_LUMA)).mean()) if seen.any() else 128.0
    backdrop = (24, 26, 34) if luma >= 128 else (236, 234, 228)
    flat = Image.new("RGB", image.size, backdrop)
    flat.paste(image.convert("RGBA"), (0, 0), image.convert("RGBA"))
    return flat
