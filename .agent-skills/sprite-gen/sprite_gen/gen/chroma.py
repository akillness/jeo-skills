# SPDX-License-Identifier: Apache-2.0
"""Transparent-PNG contracts for generated images — one per strategy.

- `key_transparent` (strategy `chroma`): the model cannot return alpha, so the
  generated key background is routed through the same YCbCr matte used by frame
  extraction.
- `verify_native_alpha` (strategy `native`): the model returned its own alpha
  channel (codex `image_gen`, 2026-09-08); the raw alpha is measured, transparent
  pixels are scrubbed of stale RGB, and the stats are published.

No silent success on either path: an output with no measurable transparent area,
no alpha channel at all, or transparent pixels that retain RGB fails before any
output is published. A key background painted as a transparency checkerboard
(`painted_checkerboard`) is refused before it is keyed, with its own reason.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from PIL import Image

from sprite_gen._deps import np
from sprite_gen.frames import extract as extract_mod
from sprite_gen.frames.cutout import GREEN, KEY_TARGETS, MAGENTA
from sprite_gen.frames.extract import CHROMA_YCBCR, remove_chroma_background_ycbcr
from sprite_gen.spec.runio import atomic_save_image

from .base import TRANSPARENCY_NATIVE


KEYS: dict[str, dict[str, tuple[int, int, int]]] = {name: {"target": rgb} for name, rgb in KEY_TARGETS.items()}

# The sentence that asks a model for a key background, per key. A still redrawn from a
# reference for a clip (`video.batch.walk_start_prompt`) and a ref run whose transparency
# `auto` planned as a chroma key (`gen.generate_image`) both end their prompt with it.
KEY_BACKGROUND_TEXT = {
    GREEN: ("The entire background is one perfectly flat, uniform pure green chroma-key fill (#00FF00) with no gradient, "
              "no texture, no shadow and no ground line."),
    MAGENTA: ("The entire background is one perfectly flat, uniform pure magenta chroma-key fill (#FF00FF) with no "
                "gradient, no texture, no shadow and no ground line."),
}


def _key_background_pattern(key: str) -> re.Pattern[str]:
    hex_code = "".join(f"{channel:02x}" for channel in KEYS[key]["target"])
    return re.compile(rf"(?<![0-9a-z])#?{hex_code}(?![0-9a-z])"
                      rf"|\b{key}\s+(?:chroma[- ]?key|key|screen|background|backdrop)\b", re.IGNORECASE)


def named_key_background(prompt: str) -> str | None:
    """The key a prompt already asks for as its background, or None.

    A prompt names a key when it carries the key's hex code (`#FF00FF`, `00ff00`) or the key's
    name right before "background", "backdrop", "chroma key", "key" or "screen" ("a green
    screen", "magenta chroma-key background"). A colour in the subject ("a green frog on
    white") is not a key. The first key named wins; the matte reads the key off the borders,
    so a prompt naming the other key than `--chroma-key` is keyed on the one drawn.
    """
    found = [(match.start(), key) for key in KEYS if (match := _key_background_pattern(key).search(prompt))]
    return min(found)[1] if found else None


# What a generated raw is, before a planned chroma key runs on it (`classify_raw_alpha`).
# A drawn checkerboard or a painted key background is an RGB picture: it has no alpha
# band, or an alpha band with nothing transparent in it, and only keying can make it
# transparent. A real cut-out has an alpha band whose zeros are the background, so they
# cover a real part of the picture and reach its edge — keying that picture again
# reads the RGB left under alpha 0 as the background colour and mattes the subject's
# own outline and light fills away (2026-10-04, a fox's outline and cream belly).
RAW_ALPHA_REAL = "real-alpha"
RAW_ALPHA_NONE = "no-alpha"
RAW_ALPHA_AMBIGUOUS = "ambiguous"
RAW_ALPHA_MIN_ZERO_PCT = 5.0
RAW_ALPHA_MIN_BORDER_ZERO_PCT = 50.0


def classify_raw_alpha(path: Path) -> dict[str, Any]:
    """Say whether a generated raw already carries a real transparent background.

    `verdict` is `real-alpha` when the PNG has an alpha band, at least
    RAW_ALPHA_MIN_ZERO_PCT % of its pixels are alpha 0 and at least
    RAW_ALPHA_MIN_BORDER_ZERO_PCT % of its one-pixel border is alpha 0; `no-alpha`
    when it has no alpha band or no alpha-0 pixel (a checkerboard, a key background,
    an opaque RGBA); `ambiguous` for alpha-0 pixels that miss either bar. The alpha
    band is the one `verify_native_alpha` reads, so a `real-alpha` raw is one it accepts.
    The judgment of the band is `alpha_verdict`.
    """
    with Image.open(path) as source:
        mode = source.mode
        has_alpha = "A" in source.getbands()
        alpha = source.getchannel("A") if has_alpha else None
    stats: dict[str, Any] = {"mode": mode, "has_alpha_band": has_alpha}
    if alpha is None:
        return {**stats, "verdict": RAW_ALPHA_NONE, "alpha_zero_pct": 0.0, "border_alpha_zero_pct": 0.0}
    return {**stats, **alpha_verdict(alpha)}


def alpha_verdict(alpha: Image.Image) -> dict[str, Any]:
    """Whether an alpha band is a real transparent background: `verdict` `real-alpha`,
    `no-alpha` or `ambiguous` by the bars `classify_raw_alpha` names, with the two
    shares it judged by. One judgment: `classify_raw_alpha` asks it of a generated raw,
    and `pixel-draw`'s G3 of each frame it drew (docs/gen.md)."""
    width, height = alpha.size
    total = width * height
    alpha_zero = alpha.histogram()[0]
    edges = [(0, 0, width, 1), (0, height - 1, width, height),
             (0, 1, 1, height - 1), (width - 1, 1, width, height - 1)]
    edges = [box for box in edges if box[2] > box[0] and box[3] > box[1]]
    border_total = sum((r - l) * (b - t) for l, t, r, b in edges)
    border_zero = sum(alpha.crop(box).histogram()[0] for box in edges)
    # judged on the counts, reported rounded: a single alpha-0 pixel is not "none"
    alpha_zero_pct = alpha_zero / total * 100 if total else 0.0
    border_alpha_zero_pct = border_zero / border_total * 100 if border_total else 0.0
    if alpha_zero == 0:
        verdict = RAW_ALPHA_NONE
    elif alpha_zero_pct >= RAW_ALPHA_MIN_ZERO_PCT and border_alpha_zero_pct >= RAW_ALPHA_MIN_BORDER_ZERO_PCT:
        verdict = RAW_ALPHA_REAL
    else:
        verdict = RAW_ALPHA_AMBIGUOUS
    return {"verdict": verdict, "alpha_zero_pct": round(alpha_zero_pct, 2),
            "border_alpha_zero_pct": round(border_alpha_zero_pct, 2)}


# A painted transparency checkerboard (`painted_checkerboard`): the grey and white squares an editor shows
# behind transparent pixels, painted where a key background was asked for; the matte would key nearly the whole
# image away. Each edge is read on its CHECKER_LINES nearest lines; a line is a checkerboard row when nearly
# all of it is grey, it holds two greys at least CHECKER_STEP apart, and it alternates between them at least
# CHECKER_MIN_RUNS times in runs of one length (most within a quarter of their median, which lies in
# CHECKER_SQUARE).
CHECKER_LINES = 8
CHECKER_GREY = 24
CHECKER_GREY_SHARE = 0.9
CHECKER_STEP = 12
CHECKER_MIN_RUNS = 6
CHECKER_SQUARE = (4, 128)
CHECKER_REGULAR = 0.75


def _checker_square(line: Any) -> int | None:
    """The square size of a checkerboard row along ``line`` (pixels x RGB), or None when it is not one."""
    if ((line.max(axis=-1) - line.min(axis=-1)) <= CHECKER_GREY).mean() < CHECKER_GREY_SHARE:
        return None
    luma = line.mean(axis=-1)
    low, high = np.percentile(luma, (10, 90))
    if high - low < CHECKER_STEP:
        return None
    runs = np.diff(np.flatnonzero(np.diff((luma > (low + high) / 2).astype(np.int8))))
    if len(runs) < CHECKER_MIN_RUNS:
        return None
    median = float(np.median(runs))
    if not CHECKER_SQUARE[0] <= median <= CHECKER_SQUARE[1]:
        return None
    if (np.abs(runs - median) <= max(2.0, median / 4)).mean() < CHECKER_REGULAR:
        return None
    return round(median)


def painted_checkerboard(image: Image.Image) -> dict[str, Any] | None:
    """Whether ``image``'s background is a painted transparency checkerboard: ``{"edges", "square_px"}`` or None.

    An edge shows the checkerboard when one of its CHECKER_LINES nearest lines is a checkerboard row
    (`_checker_square`). A checkerboard alternates along both axes, so the image is one when the top or the bottom
    edge and the left or the right edge show it; stripes alternate along one axis only. `square_px` is the median
    square size of the edges that show it. A key background is not grey, and a subject drawn inside it does not
    reach the edges."""
    rgb = np.asarray(image.convert("RGB")).astype(np.int16)
    columns = rgb.transpose(1, 0, 2)
    lines = {"top": rgb[:CHECKER_LINES], "bottom": rgb[::-1][:CHECKER_LINES],
             "left": columns[:CHECKER_LINES], "right": columns[::-1][:CHECKER_LINES]}
    squares = {}
    for edge, band in lines.items():
        found = next((square for square in map(_checker_square, band) if square is not None), None)
        if found is not None:
            squares[edge] = found
    if not ({"top", "bottom"} & set(squares) and {"left", "right"} & set(squares)):
        return None
    return {"edges": list(squares), "square_px": round(float(np.median(list(squares.values()))))}


def _and_list(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def write_white_check(image: Image.Image, path: Path) -> None:
    bg = Image.new("RGBA", image.size, (255, 255, 255, 255))
    bg.alpha_composite(image)
    bg.convert("RGB").save(path)


def key_transparent(
    input_path: Path,
    out_path: Path,
    *,
    key: str = MAGENTA,
    white_check: Path | None = None,
    decontam: str = extract_mod.OFF,
) -> dict[str, Any]:
    """Key a chroma-background PNG to a clean transparent RGBA PNG.

    Returns a stats dict (keyed/fringe/cleaned pixel counts, alpha_zero_pct).
    `decontam` is the edge decontamination pass after the matte, reported under
    `decontam`: "off" (the default) publishes the matte as it is, "auto" runs it where
    it applies, "palette" demands it. Raises SystemExit before publishing if no
    measurable transparent area was made, or if a transparent pixel keeps non-zero RGB, and
    before keying if the background is a painted transparency checkerboard (`painted_checkerboard`).
    """
    if key not in KEYS:
        raise SystemExit(f"chroma: unknown key {key!r}; expected one of {sorted(KEYS)}")
    source = Image.open(input_path).convert("RGBA")
    # The matte reads its key off the borders: on a painted checkerboard it reads the checkerboard and keys the
    # whole image away, so the image is refused before keying and the caller generates it again.
    checker = painted_checkerboard(source)
    if checker is not None:
        raise SystemExit(
            f"chroma: the background is a painted transparency checkerboard ({checker['square_px']} px squares "
            f"along the {_and_list(checker['edges'])} edges), not the {key} key the image was asked for; keying it "
            "would erase the image — generate it again"
        )
    source_pixels = source.load()
    warnings: list[str] = []
    decontam_stats: dict[str, Any] = {}
    # the default call keeps its pre-decontam signature, so a caller's matte stand-in still fits
    extra = {} if decontam == extract_mod.OFF else {"decontam": decontam, "decontam_stats": decontam_stats}
    image = remove_chroma_background_ycbcr(source, KEYS[key]["target"], warnings, **extra)
    pixels = image.load()
    width, height = image.size
    total = width * height
    alpha_zero = stale_rgb = keyed = fringe = cleaned_rgb = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            source_a = source_pixels[x, y][3]
            if a == 0:
                alpha_zero += 1
                if source_a > 0:
                    keyed += 1
                if r or g or b:
                    pixels[x, y] = (0, 0, 0, 0)
                    cleaned_rgb += 1
            elif source_a > a:
                fringe += 1

    for r, g, b, a in image.getdata():
        if a == 0 and (r or g or b):
            stale_rgb += 1

    alpha_zero_pct = round(alpha_zero / total * 100, 2) if total else 0.0

    stats: dict[str, Any] = {
        "out": str(out_path),
        "mode": "RGBA",
        "method": CHROMA_YCBCR,
        "size": f"{width}x{height}",
        "key": key,
        "keyed_pixels": keyed,
        "fringe_pixels": fringe,
        "cleaned_transparent_rgb_pixels": cleaned_rgb,
        "alpha_zero_pct": alpha_zero_pct,
        "stale_transparent_rgb_pixels": stale_rgb,
    }
    if warnings:
        stats["warnings"] = warnings
    if decontam != extract_mod.OFF:
        stats["decontam"] = decontam_stats
    if white_check is not None:
        stats["white_check"] = str(white_check)
    if alpha_zero_pct == 0.0:
        raise SystemExit(
            f"chroma: generated 0.0% transparent pixels for {key} key; refusing successful transparent output"
        )
    if stale_rgb:
        raise SystemExit(f"chroma: transparent pixels still contain non-zero RGB ({stale_rgb} px) in {out_path}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    atomic_save_image(image, out_path)
    if white_check is not None:
        white_check.parent.mkdir(parents=True, exist_ok=True)
        write_white_check(image, white_check)
    return stats


def verify_native_alpha(
    input_path: Path,
    out_path: Path,
    *,
    white_check: Path | None = None,
) -> dict[str, Any]:
    """Publish a provider-returned RGBA PNG after measuring that its alpha is real.

    Returns a stats dict (alpha_zero_pct / partial_alpha_pct / opaque_pct and the
    transparent-RGB scrub count). Raises SystemExit before publishing when the PNG
    has no alpha band or no transparent pixel at all — a drawn checkerboard or a
    flat background is an RGB image, and no post-process can recover alpha from it.
    Partial alpha (1..254) is left exactly as the model produced it and only
    reported (2026-09-08 실측: 본체 알파 ≈253).
    """
    source = Image.open(input_path)
    if "A" not in source.getbands():
        raise SystemExit(
            f"native-alpha: provider returned mode={source.mode!r} with no alpha channel for "
            f"{input_path} — the transparent background was drawn, not generated; refusing "
            "to publish a transparent output"
        )
    image = source.convert("RGBA")
    width, height = image.size
    total = width * height
    histogram = image.getchannel("A").histogram()
    alpha_zero = histogram[0]
    opaque = histogram[255]
    partial = total - alpha_zero - opaque
    alpha_zero_pct = round(alpha_zero / total * 100, 2) if total else 0.0
    if alpha_zero_pct == 0.0:
        raise SystemExit(
            f"native-alpha: 0.0% transparent pixels in {input_path} (alpha band present but "
            "nothing is transparent); refusing successful transparent output"
        )

    pixels = image.load()
    cleaned_rgb = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0 and (r or g or b):
                pixels[x, y] = (0, 0, 0, 0)
                cleaned_rgb += 1

    stats: dict[str, Any] = {
        "out": str(out_path),
        "mode": "RGBA",
        "method": TRANSPARENCY_NATIVE,
        "size": f"{width}x{height}",
        "alpha_zero_pct": alpha_zero_pct,
        "partial_alpha_pct": round(partial / total * 100, 2) if total else 0.0,
        "opaque_pct": round(opaque / total * 100, 2) if total else 0.0,
        "cleaned_transparent_rgb_pixels": cleaned_rgb,
        "stale_transparent_rgb_pixels": 0,
    }
    if white_check is not None:
        stats["white_check"] = str(white_check)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    atomic_save_image(image, out_path)
    if white_check is not None:
        white_check.parent.mkdir(parents=True, exist_ok=True)
        write_white_check(image, white_check)
    return stats
