# SPDX-License-Identifier: Apache-2.0
"""Vertical centering in the pixel-unfake row-placement path."""

from PIL import Image

from sprite_gen.frames.extract import place_row_frame, row_placement


def _disc(size: int, canvas: int = 40) -> Image.Image:
    frame = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    start = (canvas - size) // 2
    for y in range(start, start + size):
        for x in range(start, start + size):
            frame.putpixel((x, y), (255, 160, 40, 255))
    return frame


def _content_center_y(cell: Image.Image) -> float:
    bbox = cell.getbbox()
    assert bbox is not None
    return (bbox[1] + bbox[3]) / 2


GROWING = [_disc(8), _disc(24), _disc(12)]


def test_row_placement_defaults_to_bottom() -> None:
    _, default_top = row_placement(GROWING, 64, 64, 2, 1, {})
    _, explicit_top = row_placement(GROWING, 64, 64, 2, 1, {"align_y": "bottom"})
    assert default_top == explicit_top


def test_growing_subject_climbs_when_bottom_anchored() -> None:
    left, top = row_placement(GROWING, 64, 64, 2, 1, {})
    centers = [
        _content_center_y(place_row_frame(frame, 64, 64, 1, left, top, 2, True, "bottom"))
        for frame in GROWING
    ]
    assert max(centers) - min(centers) > 4


def test_center_holds_the_center_while_the_subject_grows() -> None:
    left, top = row_placement(GROWING, 64, 64, 2, 1, {"align_y": "center"})
    centers = [
        _content_center_y(place_row_frame(frame, 64, 64, 1, left, top, 2, True, "center"))
        for frame in GROWING
    ]
    assert max(centers) - min(centers) <= 1
    assert all(abs(center - 32) <= 1 for center in centers)


def test_center_without_ground_uses_the_shared_row_offset() -> None:
    left, top = row_placement(GROWING, 64, 64, 2, 1, {"align_y": "center"})
    placed = [
        place_row_frame(frame, 64, 64, 1, left, top, 2, False, "center")
        for frame in GROWING
    ]
    assert len({cell.getbbox()[1] for cell in placed if cell.getbbox() is not None}) > 1


def test_empty_frame_stays_empty() -> None:
    blank = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
    assert place_row_frame(blank, 64, 64, 1, 0, 0, 2, True, "center").getbbox() is None
