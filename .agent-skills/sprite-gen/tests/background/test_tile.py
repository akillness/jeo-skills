# SPDX-License-Identifier: Apache-2.0
"""Synthetic pixel oracles for periodic cropping and RGBA quilting. The join measure, `inspect_tile`,
is also `pixel-draw`'s G4 tile seam (below)."""

import json

import numpy as np
import pytest
from PIL import Image

from sprite_gen.background.tile import inspect_tile, make_tile


def pattern(period=16, height=13, repeats=4):
    y, x = np.indices((height, period))
    angle = 2 * np.pi * x / period
    pixels = np.stack((90 + 60 * np.sin(angle) + y,
                       120 + 40 * np.cos(angle) + y * 2,
                       80 + 30 * np.sin(angle + y / 3),
                       np.full_like(x, 255)), axis=-1).astype(np.uint8)
    return Image.fromarray(np.tile(pixels, (1, repeats, 1)))


def test_periodic_pattern_keeps_exact_detail_and_does_not_mutate_input():
    source = pattern()
    before = source.tobytes()
    tile, report = make_tile(source, 16, overlap=5)
    left, top, right, bottom = report["source_crop"]
    assert (right - left, bottom - top) == (21, 13)
    assert tile.size == (16, 13)
    assert tile.mode == "RGBA"
    assert tile.tobytes() == source.crop((left, top, left + 16, bottom)).tobytes()
    assert source.tobytes() == before
    assert report["status"] == "pass"
    assert report["requires_visual_review"] is True
    assert report["search"]["evaluated_candidates"] <= report["search"]["candidate_limit"]
    json.dumps(report, allow_nan=False)


def test_minimum_error_seam_follows_a_connected_curved_match():
    pixels = np.full((7, 15, 4), (20, 40, 60, 255), dtype=np.uint8)
    pixels[:, 10:, :3] = 200
    expected = [0, 1, 2, 3, 2, 1, 0]
    for row, col in enumerate(expected):
        pixels[row, 10 + col, :3] = (20, 40, 60)
    _, report = make_tile(Image.fromarray(pixels), 10, overlap=5)
    assert report["quilt_seam"]["positions"] == expected
    assert report["quilt_seam"]["mean_squared_error"] == 0


def test_bounded_search_includes_last_available_crop():
    pixels = np.random.default_rng(12).integers(0, 256, (11, 100, 4), dtype=np.uint8)
    pixels[..., 3] = 255
    pixels[:, 96:100] = pixels[:, 84:88]
    _, report = make_tile(Image.fromarray(pixels), 12, overlap=4)
    assert report["source_crop"] == [84, 0, 100, 11]
    assert report["search"]["evaluated_candidates"] <= 32
    assert report["quilt_seam"]["mean_squared_error"] == 0


@pytest.mark.parametrize("overlap", [1, 4])
def test_alpha_silhouettes_copy_whole_pixels_and_select_tail_at_zero(overlap):
    period = 8
    y, x = np.indices((9, period + overlap))
    alpha = np.where(y > (x * 3) % 7, 255, np.where(y == (x * 3) % 7, 97, 0))
    pixels = np.stack((x * 11, y * 21, (x + y) * 7, alpha), axis=-1).astype(np.uint8)
    source = Image.fromarray(pixels)
    tiled, report = make_tile(source, period, overlap=overlap)
    result = np.asarray(tiled)
    assert np.array_equal(result[:, 0], pixels[:, period])
    assert np.array_equal(result[:, overlap:], pixels[:, overlap:period])
    seam = np.asarray(report["quilt_seam"]["positions"])
    assert np.all(np.abs(np.diff(seam)) <= 1)
    for row, cut in enumerate(seam):
        assert np.array_equal(result[row, :cut + 1], pixels[row, period:period + cut + 1])
        assert np.array_equal(result[row, cut + 1:], pixels[row, cut + 1:period])
    if overlap > 1:
        assert np.array_equal(result[:, overlap - 1], pixels[:, overlap - 1])
    assert set(np.unique(result[..., 3])) <= {0, 97, 255}
    assert source.tobytes() == pixels.tobytes()


def test_y_axis_is_transposed_x_quilting_with_real_crop_coordinates():
    source = pattern(period=9, height=7, repeats=3)
    x_tile, x_report = make_tile(source, 9, overlap=3)
    vertical = source.transpose(Image.Transpose.TRANSPOSE)
    y_tile, y_report = make_tile(vertical, 9, axis="y", overlap=3)
    assert y_tile.tobytes() == x_tile.transpose(Image.Transpose.TRANSPOSE).tobytes()
    l, t, r, b = x_report["source_crop"]
    assert y_report["source_crop"] == [t, l, b, r]
    assert y_report["axis"] == "y"
    assert y_report["edge_color_difference"] == x_report["edge_color_difference"]
    assert inspect_tile(y_tile, "y")["edge_color_difference"] == x_report["edge_color_difference"]


@pytest.mark.parametrize("period,overlap,axis", [
    (0, 2, "x"), (5, 0, "x"), (5, 5, "x"), (19, 2, "x"),
    (5, 2, "z"), (5.5, 2, "x"), (True, 2, "x"),
])
def test_impossible_geometry_is_rejected(period, overlap, axis):
    with pytest.raises((ValueError, TypeError)):
        make_tile(Image.new("RGBA", (20, 10)), period, overlap=overlap, axis=axis)


def test_smallest_quilt_and_single_scanline_are_supported():
    source = Image.new("RGBA", (3, 1), (11, 22, 33, 97))
    tiled, report = make_tile(source, 2, overlap=1)
    assert tiled.size == (2, 1)
    assert tiled.tobytes() == source.crop((0, 0, 2, 1)).tobytes()
    assert report["quilt_seam"]["positions"] == [0]
    json.dumps(report, allow_nan=False)


def test_inspection_measures_real_color_edge_against_interior():
    ramp = np.zeros((40, 64, 4), dtype=np.uint8)
    ramp[..., :3] = np.arange(64, dtype=np.uint8)[None, :, None] * 3
    ramp[..., 3] = 255
    report = inspect_tile(Image.fromarray(ramp))
    assert report["edge_color_difference"]["mean"] == pytest.approx(189)
    assert report["interior_color_difference"]["mean"] == pytest.approx(3)
    assert report["edge_to_interior_color_ratio"] == pytest.approx(63)
    assert report["status"] == "needs-review"
    assert report["review_reasons"]


def test_inspection_ignores_invisible_rgb_but_detects_alpha_break():
    pixels = np.zeros((20, 40, 4), dtype=np.uint8)
    pixels[:, 0, :3] = 255
    hidden = inspect_tile(Image.fromarray(pixels))
    assert hidden["edge_color_difference"]["max"] == 0
    assert hidden["seam_alpha_mismatch"]["max"] == 0
    pixels[:, -1, 3] = 255
    broken = inspect_tile(Image.fromarray(pixels))
    assert broken["seam_alpha_mismatch"]["mean"] == 255
    assert broken["status"] == "needs-review"
    assert any("alpha" in reason for reason in broken["review_reasons"])


def test_low_error_wrap_does_not_hide_bad_internal_quilt_cut():
    pixels = np.zeros((20, 40, 4), dtype=np.uint8)
    pixels[..., 3] = 255
    pixels[..., :3] = np.arange(40, dtype=np.uint8)[None, :, None] * 6
    tiled, report = make_tile(Image.fromarray(pixels), 32, overlap=8)
    assert report["edge_color_difference"]["mean"] == pytest.approx(6)
    assert report["quilt_seam"]["color_difference"]["mean"] > 150
    assert report["status"] == "needs-review"
    assert any("quilt" in reason for reason in report["review_reasons"])
    assert inspect_tile(tiled)["edge_color_difference"] == report["edge_color_difference"]


def test_inspection_handles_one_pixel_and_rejects_empty_or_bad_axis():
    report = inspect_tile(Image.new("RGBA", (1, 1)))
    assert report["status"] == "needs-review"
    json.dumps(report, allow_nan=False)
    for image, axis in [(Image.new("RGBA", (0, 3)), "x"),
                        (Image.new("RGBA", (2, 2)), "diagonal")]:
        with pytest.raises(ValueError):
            inspect_tile(image, axis)


GRASS, INK = (78, 144, 56, 255), (40, 30, 46, 255)


@pytest.fixture
def tile_calls(monkeypatch):
    """Every call to the join measure: the image and axis it was asked about, and what it answered."""
    from sprite_gen.background import tile as tile_module

    real, seen = tile_module.inspect_tile, []

    def recording(image, axis="x"):
        seen.append((image.copy(), axis, real(image, axis)))
        return seen[-1][2]

    monkeypatch.setattr(tile_module, "inspect_tile", recording)
    return seen


def test_pixel_draw_g4_asks_it_of_each_frame_along_both_axes(tile_calls):
    """`pixel-draw`'s G4 tile seam is this measure, asked of a tile frame along x and along y; what it
    says needs review warns, in its words, and nothing fails."""
    from sprite_gen.gen import pixel_grid as pg
    from sprite_gen.gen.pixel_gates import evaluate

    seam = [[GRASS if x < 7 else INK for x in range(8)] for _ in range(8)]
    gates = evaluate({"tile": seam}, kind="tile", rule=pg.palette_rule("free"), walk_cycle=False)
    assert [axis for _, axis, _ in tile_calls] == ["x", "y"]
    assert all(image.tobytes() == pg.image_of(seam).tobytes() for image, _, _ in tile_calls)
    x_report, y_report = (report for _, _, report in tile_calls)
    assert x_report["status"] == "needs-review" and y_report["status"] == "pass"
    assert gates["ok"] and gates["G4"]["warn"] and gates["G4"]["needs_review"] == ["tile x"]
    assert gates["G4"]["frames"] == {"tile": {"x": x_report, "y": y_report}}
    assert gates["warnings"] == ["G4 tile seam (look at tiled-3x3.png): tile x: "
                                 "Wrap edge color difference exceeds interior variation."]


def test_pixel_draw_g4_says_what_it_answers(monkeypatch):
    """Answer that every join needs review: G4 warns of a tile that wraps cleanly, and still passes it."""
    from sprite_gen.background import tile as tile_module
    from sprite_gen.gen import pixel_grid as pg
    from sprite_gen.gen.pixel_gates import evaluate

    real = tile_module.inspect_tile
    monkeypatch.setattr(tile_module, "inspect_tile", lambda image, axis="x": {
        **real(image, axis), "status": "needs-review", "review_reasons": ["Said so."]})
    flat = [[GRASS] * 8 for _ in range(8)]
    gates = evaluate({"tile": flat}, kind="tile", rule=pg.palette_rule("free"), walk_cycle=False)
    assert gates["ok"] and gates["G4"]["needs_review"] == ["tile x", "tile y"]
    assert gates["warnings"] == ["G4 tile seam (look at tiled-3x3.png): tile x: Said so.; tile y: Said so."]
