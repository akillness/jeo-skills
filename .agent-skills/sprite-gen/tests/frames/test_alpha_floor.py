# SPDX-License-Identifier: Apache-2.0
"""Alpha haze cleanup for transparent sheets (`sprite_gen.frames.alpha_floor.clear_haze`).

Synthetic sheets: a solid object wrapped in a faint haze ring, loose haze specks, and thin
strokes with anti-aliased edges. The cleanup must clear the haze and leave every solid pixel
and every edge pixel next to one exactly as it was; the report must measure that.
"""

import numpy as np
import pytest
from PIL import Image

from sprite_gen.frames.alpha_floor import clear_haze


def hazy_sheet():
    pixels = np.zeros((64, 96, 4), dtype=np.uint8)
    y, x = np.indices((64, 96))
    distance = np.hypot(x - 30, y - 32)
    pixels[..., :3] = (180, 140, 90)
    # a solid disc of radius 12, a one-pixel anti-aliased rim, then a haze ring out to radius 20
    pixels[..., 3] = np.where(distance <= 12, 250, 0)
    rim = (distance > 12) & (distance <= 13)
    pixels[rim, 3] = 120
    tail = (distance > 13) & (distance <= 14)
    pixels[tail, 3] = 40
    ring = (distance > 14) & (distance <= 20)
    pixels[ring, 3] = 24
    # loose specks far from anything
    for sx, sy, a in ((5, 5, 30), (90, 60, 63), (60, 4, 1)):
        pixels[sy, sx] = (200, 200, 200, a)
    return pixels


def thin_strokes():
    pixels = np.zeros((40, 40, 4), dtype=np.uint8)
    pixels[..., :3] = (230, 230, 255)
    # a one-pixel vertical stroke at full alpha
    pixels[2:38, 5, 3] = 255
    # a hairline at a fractional height: 70 % coverage on one row, 30 % on the next
    pixels[10, 10:38, 3] = 178
    pixels[11, 10:38, 3] = 77
    # a diagonal one pixel wide, anti-aliased onto both sides at low alpha
    for i in range(25):
        pixels[14 + i, 12 + i, 3] = 200
        pixels[14 + i, 13 + i, 3] = 35
        pixels[15 + i, 12 + i, 3] = 20
    # a stroke that just reaches the floor
    pixels[30, 2:20, 3] = 64
    pixels[31, 2:20, 3] = 10
    return pixels


def test_haze_is_cleared_and_the_object_and_its_edge_are_untouched():
    source = hazy_sheet()
    before = source.copy()
    image, report = clear_haze(Image.fromarray(source), floor=64, edge=2)
    out = np.asarray(image)
    assert np.array_equal(source, before)
    alpha = before[..., 3]
    solid = alpha >= 64
    # every solid pixel and every faint pixel within two pixels of one is kept byte for byte
    near = np.zeros_like(solid)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            near |= np.roll(np.roll(solid, dy, 0), dx, 1)
    keep = solid | (near & (alpha > 0))
    assert np.array_equal(out[keep], before[keep])
    # haze becomes (0, 0, 0, 0); pixels that were already fully transparent are left as they were
    haze = (alpha > 0) & ~keep
    assert not out[haze].any()
    assert np.array_equal(out[alpha == 0], before[alpha == 0])
    total = alpha.size
    faint = (alpha > 0) & (alpha < 64)
    assert report["floor"] == 64 and report["edge_px"] == 2 and report["pixels"] == total
    assert report["faint_fraction_before"] == pytest.approx(np.count_nonzero(faint) / total)
    assert report["haze_fraction_before"] == pytest.approx(np.count_nonzero(faint & ~near) / total)
    assert report["haze_fraction_after"] == 0
    assert report["faint_fraction_after"] == pytest.approx(np.count_nonzero(faint & near) / total)
    assert report["cleared_pixels"] == np.count_nonzero(faint & ~near)
    assert report["changed_solid_pixels"] == 0 and report["changed_edge_pixels"] == 0
    assert report["haze_fraction_before"] > 0.04


def test_thin_strokes_and_their_antialiased_edges_survive():
    source = thin_strokes()
    image, report = clear_haze(Image.fromarray(source), floor=64, edge=2)
    assert np.asarray(image).tobytes() == source.tobytes()
    assert report["cleared_pixels"] == 0
    assert report["haze_fraction_before"] == 0


def test_a_stroke_entirely_below_the_floor_is_haze_and_a_lower_floor_keeps_it():
    pixels = np.zeros((10, 30, 4), dtype=np.uint8)
    pixels[5, 2:28] = (255, 255, 255, 40)
    cleared, _ = clear_haze(Image.fromarray(pixels), floor=64, edge=2)
    assert not np.asarray(cleared)[..., 3].any()
    kept, report = clear_haze(Image.fromarray(pixels), floor=32, edge=2)
    assert np.asarray(kept).tobytes() == pixels.tobytes()
    assert report["cleared_pixels"] == 0


def test_edge_zero_keeps_only_solid_pixels():
    source = hazy_sheet()
    image, report = clear_haze(Image.fromarray(source), floor=64, edge=0)
    out = np.asarray(image)
    solid = source[..., 3] >= 64
    assert np.array_equal(out[solid], source[solid])
    assert not out[~solid][..., 3].any()
    assert report["faint_fraction_after"] == 0


def test_rgb_input_and_bad_settings():
    image, report = clear_haze(Image.new("RGB", (4, 4), "red"), floor=64, edge=2)
    assert image.mode == "RGBA" and report["cleared_pixels"] == 0
    for floor, edge in ((0, 2), (256, 2), (64, -1), (64.5, 2), (True, 2)):
        with pytest.raises((ValueError, TypeError)):
            clear_haze(Image.new("RGBA", (4, 4)), floor=floor, edge=edge)
