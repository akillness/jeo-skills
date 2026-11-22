# SPDX-License-Identifier: Apache-2.0
"""Regression tests for chroma-key alpha cleanup and auto key selection.

These guard three ways the extractor used to silently destroy real subject
colors:

1. ``remove_chroma_background`` ran a "neutralize key tint" pass on every pixel
   whose channels leaned toward the key's channels, *regardless of color
   distance* — so a saturated red/orange/blue subject was clamped toward
   olive/grey under a magenta key even though it sat >200 away from magenta.
   The destructive pass is gone; near-key antialias fringe is still cleaned.
2. ``choose_chroma_key`` ranked candidates by the 1st-percentile distance to
   subject pixels, which discards sub-1% features (eyes, gems, ear lamps): the
   auto key could look safe while its nearest subject pixel was still inside the
   extraction erase radius and would be deleted. Its guards are in
   ``test_chroma_key_auto.py``, beside the function.
3. The old fringe cut erased every pixel inside the fringe color band *anywhere
   in the image* — hot pink (~129 from magenta) and purple (~153) subjects fell
   in the band and were bleached wholesale. Soft-alpha unmix now treats boundary
   antialiasing as coverage while deeper interior subject pixels survive.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from PIL import Image

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


extract = _load("extract_sprite_row_frames")

MAGENTA = (255, 0, 255)
# extract_sprite_row_frames.py main() defaults
KEY_THRESHOLD = 96.0
FRINGE_THRESHOLD = 180.0
FRINGE_DELTA = 18.0
LEGACY_PEEL_DEPTH = 2

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
MOE_FIXTURES = FIXTURES / "moe"

# Subject colors that sit inside the magenta key's fringe trap band — the
# position-blind fringe cut used to erase them wholesale. Both are ~129/~153
# from magenta, i.e. close enough to the key to be trapped, far enough to be
# real subject material.
HOT_PINK = (250, 77, 150)  # ~129 from magenta
PURPLE = (213, 112, 246)  # ~153 from magenta


def _key(pixel: tuple[int, int, int], chroma_key=MAGENTA):
    image = Image.new("RGBA", (1, 1), (*pixel, 255))
    out = extract.remove_chroma_background(
        image,
        chroma_key,
        threshold=KEY_THRESHOLD,
        fringe_threshold=FRINGE_THRESHOLD,
        fringe_delta=FRINGE_DELTA,
    )
    return out.getpixel((0, 0))


def _clean(image: Image.Image, chroma_key=MAGENTA) -> Image.Image:
    return extract.remove_chroma_background(
        image,
        chroma_key,
        threshold=KEY_THRESHOLD,
        fringe_threshold=FRINGE_THRESHOLD,
        fringe_delta=FRINGE_DELTA,
    )


def test_optional_chroma_tunables_are_keyword_only() -> None:
    image = Image.new("RGBA", (1, 1), (*MAGENTA, 255))
    with pytest.raises(TypeError):
        extract.remove_chroma_background(image, MAGENTA, KEY_THRESHOLD, FRINGE_THRESHOLD, FRINGE_DELTA, 2)


def _open_moe(name: str) -> Image.Image:
    with Image.open(MOE_FIXTURES / name) as opened:
        return opened.convert("RGBA")


def _fringe_peel_candidates(image: Image.Image, chroma_key: tuple[int, int, int]) -> list[tuple[int, int]]:
    """Pixels the legacy in-band peel would erase before soft-alpha unmix.

    Key distance is what the engine measures: the smaller of the distance to the
    declared key and to the background colour actually painted on the borders
    (`detect_background_key_rgb`) — the moe fixtures were painted a few units
    off the pure key, and the hard-cut sphere sits where the paint is.
    """
    width, height = image.size
    pixels = image.load()
    painted_key = extract.detect_background_key_rgb(image, chroma_key)
    classes = bytearray(width * height)
    keyed: list[int] = []

    def key_distance(color: tuple[int, int, int]) -> float:
        return min(extract.color_distance(color, chroma_key), extract.color_distance(color, painted_key))

    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            index = y * width + x
            color = (red, green, blue)
            if alpha == 0 or key_distance(color) <= KEY_THRESHOLD:
                classes[index] = extract._KEYED
                keyed.append(index)
            elif extract.key_tint_score(color, chroma_key) < FRINGE_DELTA:
                classes[index] = extract._SUBJECT
            elif key_distance(color) <= FRINGE_THRESHOLD:
                classes[index] = extract._BLEND_IN_BAND
            else:
                classes[index] = extract._BLEND_OUT_OF_BAND

    frontier = keyed
    peeled: list[tuple[int, int]] = []
    for _ in range(LEGACY_PEEL_DEPTH):
        next_frontier = []
        for index in frontier:
            x = index % width
            y = index // width
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= height:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if nx < 0 or nx >= width:
                        continue
                    neighbor = ny * width + nx
                    if classes[neighbor] != extract._BLEND_IN_BAND:
                        continue
                    classes[neighbor] = extract._KEYED
                    next_frontier.append(neighbor)
                    peeled.append((nx, ny))
        if not next_frontier:
            break
        frontier = next_frontier
    return peeled


def _heart_material_pixels(name: str, image: Image.Image) -> list[tuple[int, int]]:
    pixels = image.load()
    if name == "moe_heart.png":
        return [
            (x, y)
            for y in range(image.height)
            for x in range(image.width)
            if pixels[x, y][0] >= 240 and 60 <= pixels[x, y][1] <= 115 and 130 <= pixels[x, y][2] <= 175
        ]
    if name == "moe_mirror.png":
        return [
            (x, y)
            for y in range(image.height)
            for x in range(image.width)
            if pixels[x, y][0] <= 30 and 180 <= pixels[x, y][1] <= 225 and 105 <= pixels[x, y][2] <= 145
        ]
    raise AssertionError(f"no heart material mask for {name}")


MOE_PEEL_REMOVAL_CASES = [
    ("moe_heart.png", MAGENTA, 160, 260),
    ("moe_mirror.png", (0, 255, 0), 70, 120),
]


def test_moe_legacy_peel_band_becomes_soft_alpha_not_opaque_crust() -> None:
    for name, chroma_key, _min_mid_alpha, _max_mid_alpha in MOE_PEEL_REMOVAL_CASES:
        source = _open_moe(name)
        peeled = _fringe_peel_candidates(source, chroma_key)
        assert peeled, f"{name}: fixture lost the legacy peel band"

        out = _clean(source, chroma_key).load()
        transparent = [(x, y) for x, y in peeled if out[x, y][3] == 0]
        opaque = [(x, y) for x, y in peeled if out[x, y][3] == 255]
        assert not transparent, f"{name}: {len(transparent)} legacy peel pixels were still erased"
        assert not opaque, f"{name}: {len(opaque)} legacy peel pixels survived as opaque crust"


def test_moe_fixtures_keep_meaningful_mid_alpha_edges() -> None:
    for name, chroma_key, min_mid_alpha, max_mid_alpha in MOE_PEEL_REMOVAL_CASES:
        out = _clean(_open_moe(name), chroma_key)
        histogram = out.getchannel("A").histogram()
        mid_alpha = sum(histogram[1:255])
        assert min_mid_alpha <= mid_alpha <= max_mid_alpha, f"{name}: {mid_alpha} mid-alpha pixels"


def test_key_tinted_heart_material_survives_byte_identical() -> None:
    for name, chroma_key, _min_mid_alpha, _max_mid_alpha in MOE_PEEL_REMOVAL_CASES:
        source = _open_moe(name)
        material = _heart_material_pixels(name, source)
        assert material, f"{name}: fixture lost its heart material pixels"

        source_pixels = source.load()
        out = _clean(source, chroma_key).load()
        changed = [(x, y) for x, y in material if out[x, y] != source_pixels[x, y]]
        assert not changed, f"{name}: {len(changed)} heart material pixels changed, e.g. {changed[:5]}"


def test_despill_preserves_far_subject_colors() -> None:
    # All of these sit >200 color-distance away from magenta: they are the
    # subject, not key fringe, and must survive completely untouched.
    for pixel in [(196, 54, 38), (224, 96, 40), (208, 44, 40), (40, 70, 200)]:
        assert extract.color_distance(pixel, MAGENTA) > FRINGE_THRESHOLD
        assert _key(pixel) == (*pixel, 255), f"{pixel} was mangled by despill"


FRINGE = (147, 90, 157)  # magenta blended with a green subject edge


def test_boundary_fringe_gets_soft_alpha() -> None:
    # Green subject on magenta background with a one-pixel antialias fringe
    # ring between them: the background must go, the fringe becomes coverage,
    # and the subject must stay.
    assert extract.color_distance(FRINGE, MAGENTA) <= FRINGE_THRESHOLD
    assert extract.key_tint_score(FRINGE, MAGENTA) >= FRINGE_DELTA
    green = (60, 170, 70)
    image = Image.new("RGBA", (16, 16), (*MAGENTA, 255))
    pixels = image.load()
    for y in range(4, 12):
        for x in range(4, 12):
            pixels[x, y] = (*green, 255)
    for x in range(3, 13):  # fringe ring just outside the subject block
        for y in (3, 12):
            pixels[x, y] = (*FRINGE, 255)
            pixels[y, x] = (*FRINGE, 255)
    out = _clean(image).load()
    assert out[0, 0][3] == 0  # background gone
    assert 0 < out[3, 3][3] < 255 and 0 < out[12, 8][3] < 255  # fringe ring is soft alpha
    assert out[8, 8] == (*green, 255)  # subject intact


def test_isolated_fringe_band_pixel_is_subject_not_fringe() -> None:
    # The same fringe-band color *inside* a subject, nowhere near background,
    # is a real material color and must survive (this is what the old
    # position-blind cut destroyed).
    green = (60, 170, 70)
    image = Image.new("RGBA", (16, 16), (*green, 255))
    image.load()[8, 8] = (*FRINGE, 255)
    out = _clean(image).load()
    assert out[8, 8] == (*FRINGE, 255)


def test_key_tinted_subject_interior_survives() -> None:
    # Hot pink / purple blocks on a magenta background: only the edge layers
    # nearest the keyed-out background may become soft alpha; the interior must
    # keep its exact color.
    for subject in (HOT_PINK, PURPLE):
        distance = extract.color_distance(subject, MAGENTA)
        assert KEY_THRESHOLD < distance <= FRINGE_THRESHOLD  # inside the trap band
        assert extract.key_tint_score(subject, MAGENTA) >= FRINGE_DELTA
        image = Image.new("RGBA", (32, 32), (*MAGENTA, 255))
        pixels = image.load()
        for y in range(8, 24):
            for x in range(8, 24):
                pixels[x, y] = (*subject, 255)
        out = _clean(image).load()
        assert out[0, 0][3] == 0  # background gone
        # In-band unmix is bounded to the nearest two key-depth layers.
        for offset in range(8 + LEGACY_PEEL_DEPTH, 24 - LEGACY_PEEL_DEPTH):
            assert out[offset, offset] == (*subject, 255), f"{subject} interior erased at {offset}"


def _trap_band_subject(subject: tuple[int, int, int], size: int = 100, margin: int = 6) -> Image.Image:
    """A magenta-keyed canvas with a solid subject block whose color sits inside
    the key's fringe trap band. Generated deterministically so the fringe-survival
    guard needs no sample art shipped alongside the tests."""
    canvas = Image.new("RGBA", (size + 2 * margin, size + 2 * margin), (*MAGENTA, 255))
    pixels = canvas.load()
    for y in range(margin, margin + size):
        for x in range(margin, margin + size):
            pixels[x, y] = (*subject, 255)
    return canvas


def test_key_tinted_subject_opaque_pixels_do_not_regress() -> None:
    # A 100x100 in-band subject block is ~10k opaque pixels; interior is
    # untouchable and only the outer despill layers may go, so the vast majority
    # must remain opaque after cleanup.
    for subject in (HOT_PINK, PURPLE):
        out = _clean(_trap_band_subject(subject))
        opaque = out.getchannel("A").histogram()[255]
        assert opaque >= 9000, f"{subject}: opaque subject pixels regressed to {opaque}"
