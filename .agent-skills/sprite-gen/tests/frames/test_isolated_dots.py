# SPDX-License-Identifier: Apache-2.0
"""A lone pixel is one judgment, `frames.extract.isolated_dots`: an opaque pixel with no opaque pixel
among its eight neighbours - one that touches another only at a corner is joined to it, as every
component the engine reads is. The YCbCr matte's cleanup erases a matte's dots by it
(`_cleanup_alpha_ycc`, byte for byte as before: tests/frames/test_extract_perf_equivalence.py), and
`pixel-draw`'s G5 counts a grid's stray pixels by it."""
from __future__ import annotations

from PIL import Image

import sprite_gen.frames.extract as extract_module
from sprite_gen.frames.extract import isolated_dots
from sprite_gen.gen import pixel_grid as pg
from sprite_gen.gen.pixel_gates import evaluate

INK, CLEAR = (40, 30, 46, 255), (0, 0, 0, 0)
FREE16 = pg.palette_rule("free")


def mask(rows: list[str]) -> Image.Image:
    """An L mask, 1 where a row says `#`."""
    image = Image.new("L", (len(rows[0]), len(rows)))
    image.putdata([1 if c == "#" else 0 for row in rows for c in row])
    return image


def marked(image: Image.Image) -> list[str]:
    values = list(image.getdata())
    return ["".join("#" if values[y * image.width + x] else "." for x in range(image.width)) for y in range(image.height)]


def stroke_and_speck(size: int = 16):
    """A block (rows and columns 6..11), a one-pixel diagonal stroke off its top-left corner, and a speck."""
    frame = [[INK if 6 <= y <= 11 and 6 <= x <= 11 else CLEAR for x in range(size)] for y in range(size)]
    for step in (3, 4, 5):
        frame[step][step] = INK
    frame[2][12] = INK
    return frame


def test_a_dot_has_no_opaque_neighbour_of_eight():
    dots = isolated_dots(mask(["#.....",
                               ".#....",
                               "......",
                               "...#..",
                               "......",
                               ".....#"]))
    assert marked(dots) == ["......",
                            "......",
                            "......",
                            "...#..",
                            "......",
                            ".....#"]


def test_the_matte_cleanup_erases_exactly_the_dots():
    rows = ["..........",
            ".####.....",
            ".####..#..",
            ".####.....",
            "......#...",
            ".......#..",
            "..#.......",
            ".........."]
    image = Image.new("RGBA", (len(rows[0]), len(rows)))
    image.putdata([INK if c == "#" else CLEAR for row in rows for c in row])
    dots = marked(isolated_dots(image.getchannel("A").point(lambda a: 1 if a > 10 else 0)))
    extract_module._cleanup_alpha_ycc(image)
    after = marked(image.getchannel("A"))
    erased = [(x, y) for y, row in enumerate(rows) for x, c in enumerate(row) if c == "#" and after[y][x] == "."]
    assert erased == [(x, y) for y, row in enumerate(dots) for x, c in enumerate(row) if c == "#"] == [(7, 2), (2, 6)]


def test_pixel_draw_g5_counts_them(monkeypatch):
    real, seen = extract_module.isolated_dots, []

    def recording(op):
        seen.append((op.copy(), real(op)))
        return seen[-1][1]

    monkeypatch.setattr(extract_module, "isolated_dots", recording)
    frame = stroke_and_speck()
    gates = evaluate({"f": frame}, kind="icon", rule=FREE16, walk_cycle=False)
    ((op, dots),) = seen
    assert list(op.getdata()) == [1 if p[3] >= 128 else 0 for row in frame for p in row]
    assert gates["G5"]["isolated_pixels"] == dots.histogram()[255] == 1
    assert gates["warnings"] == ["G5 1 stray pixel(s) with no opaque neighbour"]


def test_pixel_draw_g5_says_what_it_answers(monkeypatch):
    """Answer that every opaque pixel is a dot: G5 counts every one, and still only warns."""
    monkeypatch.setattr(extract_module, "isolated_dots", lambda op: op.point(lambda v: 255 if v else 0))
    gates = evaluate({"f": stroke_and_speck()}, kind="icon", rule=FREE16, walk_cycle=False)
    assert gates["ok"] and gates["G5"]["isolated_pixels"] == 36 + 3 + 1
    assert gates["warnings"] == ["G5 40 stray pixel(s) with no opaque neighbour"]
