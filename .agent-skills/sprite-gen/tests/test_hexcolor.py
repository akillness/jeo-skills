# SPDX-License-Identifier: Apache-2.0
"""A colour written `#RRGGBB` is read by one function and written by one, `sprite_gen.util.hexcolor`:
six hex digits, the `#` optional, blanks around them ignored — a sign, an underscore or a seventh
character is not a colour. Every verb that takes a hex colour reads it there and words the error with
its own flag; recolor writes lower case, everything else upper case."""
from __future__ import annotations

import argparse
import importlib

import pytest

from sprite_gen.util.hexcolor import format_hex, parse_hex


@pytest.mark.parametrize(("text", "rgb"), [
    ("#A1b2C3", (0xA1, 0xB2, 0xC3)), ("a1b2c3", (0xA1, 0xB2, 0xC3)), ("  #00ff7f\n", (0, 255, 127)),
])
def test_six_hex_digits_are_a_colour(text, rgb):
    assert parse_hex(text) == rgb


@pytest.mark.parametrize("text", ["#-1-1-1", "#1_0_00", "#1234567", ""])
def test_anything_else_is_not(text):
    """`int(…, 16)` alone takes `-1`, `+f` and `1_0`: three of the copies this replaced read `#-1-1-1`
    as the colour (-1, -1, -1). One `fullmatch` refuses them all, so one case per class of refusal:
    a sign, an underscore, the wrong length, nothing."""
    with pytest.raises(ValueError, match="expected #RRGGBB"):
        parse_hex(text)


def test_it_writes_upper_case_and_lower_case_for_recolor():
    assert format_hex((10, 200, 255)) == "#0AC8FF"
    assert format_hex((10, 200, 255, 128)) == "#0AC8FF"
    assert format_hex((10, 200, 255), lower=True) == "#0ac8ff"


# (module, how the verb reads a colour, what it says when it cannot)
READERS = [
    ("sprite_gen.effects.recolor", lambda m: m._resolve_map({"#-1-1-1": "#000000"}, "spec.json", "gold"), SystemExit),
    ("sprite_gen.gen.prepare", lambda m: m.parse_hex_color("#-1-1-1"), SystemExit),
    ("sprite_gen.frames.slice_sheet", lambda m: m.parse_chroma_key("#-1-1-1"), ValueError),
    ("sprite_gen.qa.handed", lambda m: m.parse_marker("#-1-1-1"), SystemExit),
    ("sprite_gen.effects.shadow", lambda m: m._parse_color("#-1-1-1"), argparse.ArgumentTypeError),
]


@pytest.mark.parametrize(("module", "read", "refusal"), READERS, ids=[m.rsplit(".", 1)[-1] for m, _, _ in READERS])
def test_every_verb_reads_a_colour_through_it(monkeypatch, module, read, refusal):
    mod = importlib.import_module(module)
    seen = []

    def spy(text):
        seen.append(text)
        return parse_hex(text)

    monkeypatch.setattr(mod, "parse_hex", spy)
    with pytest.raises(refusal):
        read(mod)
    assert seen and seen[0].strip().lower() == "#-1-1-1"


def test_the_pixel_grid_reads_and_the_gates_write_through_it(monkeypatch):
    from sprite_gen.gen import pixel_gates, pixel_grid

    read, written = [], []
    monkeypatch.setattr(pixel_grid, "parse_hex", lambda text: read.append(text) or parse_hex(text))
    monkeypatch.setattr(pixel_gates, "format_hex", lambda rgb: written.append(rgb) or format_hex(rgb))
    pixel = pixel_grid.hex_pixel("#0AC8FF")
    assert pixel == (10, 200, 255, 255) and read == ["#0AC8FF"]
    assert pixel_gates.colors_used({"f": [[pixel, (0, 0, 0, 0)]]}) == ["#0AC8FF"] and written == [pixel]


def test_recolor_writes_lower_case_through_it(monkeypatch, tmp_path):
    from PIL import Image

    from sprite_gen.effects import recolor

    calls = []
    monkeypatch.setattr(recolor, "format_hex", lambda rgb, **kw: calls.append(kw) or format_hex(rgb, **kw))
    base = tmp_path / "base.png"
    Image.new("RGBA", (2, 1), (10, 200, 255, 255)).save(base)
    palette = recolor.extract_palette(base)
    assert [color["hex"] for color in palette["colors"]] == ["#0ac8ff"] and calls == [{"lower": True}]
