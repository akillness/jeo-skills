# SPDX-License-Identifier: Apache-2.0
"""Whether a picture's background is really transparent is one judgment, `gen.chroma.alpha_verdict`
(docs/gen.md): `real-alpha` when at least 5 % of its pixels and half of its one-pixel border are
alpha 0, `no-alpha` when no pixel is, `ambiguous` between. `classify_raw_alpha` asks it of a generated
raw before a chroma key runs, and `pixel-draw`'s G3 of every frame it drew: a sprite or icon frame must
be `real-alpha`, with something drawn and its four corners clear; a tile frame `no-alpha`."""
from __future__ import annotations

import pytest
from PIL import Image

from sprite_gen.gen import chroma
from sprite_gen.gen import pixel_grid as pg
from sprite_gen.gen.pixel_gates import evaluate

INK, CLEAR = (40, 30, 46, 255), (0, 0, 0, 0)
FREE16 = pg.palette_rule("free")


def icon(size: int = 16):
    """A block of ink rows 3..12, columns 4..11, on a clear canvas."""
    return [[INK if 3 <= y <= 12 and 4 <= x <= 11 else CLEAR for x in range(size)] for y in range(size)]


@pytest.fixture
def calls(monkeypatch):
    """Every call to the judgment: the alpha band it was asked about and what it answered."""
    real, seen = chroma.alpha_verdict, []

    def recording(alpha):
        seen.append((alpha.copy(), real(alpha)))
        return seen[-1][1]

    monkeypatch.setattr(chroma, "alpha_verdict", recording)
    return seen


def test_a_generated_raw_is_read_by_it(tmp_path, calls):
    image = Image.new("RGBA", (20, 20), (255, 0, 255, 255))
    for y in range(4, 16):
        for x in range(4, 16):
            image.putpixel((x, y), (0, 0, 0, 0))
    path = tmp_path / "raw.png"
    image.save(path)
    stats = chroma.classify_raw_alpha(path)
    ((alpha, verdict),) = calls
    assert alpha.tobytes() == image.getchannel("A").tobytes()
    assert verdict == {"verdict": "ambiguous", "alpha_zero_pct": 36.0, "border_alpha_zero_pct": 0.0}
    assert stats == {"mode": "RGBA", "has_alpha_band": True, **verdict}


def test_g3_asks_it_of_every_frame(calls):
    frame = icon()
    gates = evaluate({"f": frame}, kind="icon", rule=FREE16, walk_cycle=False)
    ((alpha, verdict),) = calls
    assert alpha.tobytes() == pg.image_of(frame).getchannel("A").tobytes()
    assert verdict["verdict"] == "real-alpha"
    assert gates["G3"]["ok"] and gates["G3"]["frames"]["f"] == {
        "opaque_pixels": 80, "opaque_fraction": 0.3125, "corners_transparent": True, **verdict}


def test_g3_says_what_it_answers(monkeypatch):
    """Answer `ambiguous`: G3 fails a sprite on a clear canvas. Answer `real-alpha`: G3 fails a tile,
    which must be `no-alpha`, however opaque it is."""
    monkeypatch.setattr(chroma, "alpha_verdict",
                        lambda alpha: {"verdict": "ambiguous", "alpha_zero_pct": 1.0, "border_alpha_zero_pct": 50.0})
    sprite = evaluate({"f": icon()}, kind="sprite", rule=FREE16, walk_cycle=False)
    assert not sprite["ok"] and sprite["failed"] == ["G3"]
    monkeypatch.setattr(chroma, "alpha_verdict",
                        lambda alpha: {"verdict": "real-alpha", "alpha_zero_pct": 9.0, "border_alpha_zero_pct": 90.0})
    tile = evaluate({"tile": [[INK] * 8 for _ in range(8)]}, kind="tile", rule=FREE16, walk_cycle=False)
    assert not tile["ok"] and tile["failed"] == ["G3"]


def test_a_canvas_filled_but_for_half_its_border_has_no_transparent_background():
    """48 px of ink with its top row, its left column and its four corners clear: half the border is
    alpha 0, but 96 pixels are not 5 % of 2,304 - `ambiguous`, and G3 fails it."""
    size = 48
    frame = [[INK] * size for _ in range(size)]
    for x in range(size):
        frame[0][x] = CLEAR
    for y in range(size):
        frame[y][0] = CLEAR
    frame[size - 1][size - 1] = CLEAR
    gates = evaluate({"f": frame}, kind="icon", rule=FREE16, walk_cycle=False)
    measured = gates["G3"]["frames"]["f"]
    assert measured["corners_transparent"] and measured["border_alpha_zero_pct"] == 51.06
    assert measured["verdict"] == "ambiguous" and measured["alpha_zero_pct"] == 4.17
    assert not gates["ok"] and gates["failed"] == ["G3"]
