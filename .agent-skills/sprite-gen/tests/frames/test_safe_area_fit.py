# SPDX-License-Identifier: Apache-2.0
"""The safe-area judgment is one function, `frames.extract.safe_area_fit` (maintainer 2026-07-14): a
frame past the physical cap - the cell's width, its height less one margin - is a reroll candidate (a
warning); one past the safe area but within the cap is informational; nothing fails. The pixel snap of
`extract` and `pixel-draw`'s G8 both call it: what it answers is what both say, and the snap's two
lines read as they always have."""
from __future__ import annotations

import json
import random

import pytest
from PIL import Image

import sprite_gen.frames.extract as extract_module
from sprite_gen.frames.extract import safe_area_fit
from sprite_gen.gen import pixel_grid as pg
from sprite_gen.gen.pixel_gates import evaluate

MAGENTA = (255, 0, 255)
INK, CLEAR = (40, 30, 46, 255), (0, 0, 0, 0)


@pytest.mark.parametrize("size,over,soft", [
    ((26, 26), [], []),   # the safe area itself
    ((27, 26), [], [0]),  # a column past it
    ((26, 27), [], [0]),  # a row past it
    ((32, 29), [], [0]),  # the physical cap itself: the cell's width, its height less one margin
    ((32, 30), [0], []),  # a row past the cap
    ((33, 20), [0], []),  # wider than the cell
])
def test_the_tiers_of_a_32_px_cell(size, over, soft):
    assert safe_area_fit([size], 32, 32, 3, 3) == {"cap": [32, 29], "safe": [26, 26], "over": over, "soft": soft}


def test_the_tiers_count_logical_pixels_and_each_margin_on_its_own():
    """A 64 px cell at two cell pixels a logical pixel, margins 6 across and 4 down: cap 32x30, safe area 26x28."""
    fit = safe_area_fit([(26, 28), (27, 28), (26, 29), (32, 30), (32, 31)], 64, 64, 6, 4, scale=2)
    assert fit == {"cap": [32, 30], "safe": [26, 28], "over": [4], "soft": [1, 2, 3]}


def _logical_art(width: int, height: int, seed: int) -> Image.Image:
    rng = random.Random(seed)
    art = Image.new("RGB", (width, height), MAGENTA)
    for y in range(height):
        for x in range(width):
            if rng.random() < 0.55:
                art.putpixel((x, y), (rng.randrange(30, 220), rng.randrange(30, 220), rng.randrange(30, 220)))
    return art


def _snap_run(root, cell: int, margin: int):
    """Two frames of 20x36 logical pixels drawn at a pitch of 8, snapped 1:1 into a `cell` px cell."""
    run_dir = root / "run"
    (run_dir / "raw").mkdir(parents=True)
    pitch, gap = 8, 40
    frame = _logical_art(20, 36, seed=7).resize((20 * pitch, 36 * pitch), Image.Resampling.NEAREST)
    strip = Image.new("RGB", (frame.width * 2 + gap * 3, frame.height + gap * 2), MAGENTA)
    strip.paste(frame, (gap, gap))
    strip.paste(frame, (frame.width + gap * 2, gap))
    strip.save(run_dir / "raw" / "walk.png")
    request = {
        "version": 1,
        "kind": "sprite-gen-request",
        "engine": "component-row",
        "character": {"id": "safebot", "description": "safe area fixture", "base_image": None},
        "cell": {"shape": "square", "width": cell, "height": cell, "safe_margin_x": margin, "safe_margin_y": margin,
                 "size": cell, "safe_margin": margin},
        "chroma_key": {"name": "magenta", "hex": "#FF00FF", "rgb": [255, 0, 255], "selection": "fallback"},
        "states": {"walk": {"frames": 2, "fps": 8, "loop": True, "action": "synthetic safe area fixture"}},
        "fit": {"pixel_unfake": True},
    }
    (run_dir / "sprite-request.json").write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")
    return run_dir


def _warnings(run_dir) -> list[str]:
    return json.loads((run_dir / "frames" / "frames-manifest.json").read_text(encoding="utf-8"))["warnings"]


@pytest.fixture
def calls(monkeypatch):
    """Every call to the judgment, with what it answered."""
    real, seen = extract_module.safe_area_fit, []

    def recording(*args, **kwargs):
        seen.append((args, kwargs, real(*args, **kwargs)))
        return seen[-1][2]

    monkeypatch.setattr(extract_module, "safe_area_fit", recording)
    return seen


def test_the_snap_notes_a_frame_past_the_safe_area_in_its_own_words(tmp_path, calls):
    run_dir = _snap_run(tmp_path, 48, 8)  # safe area 32x32, cap 48x40: 36 rows are past one, within the other
    assert extract_module.run(run_dir=run_dir) == 0
    ((args, kwargs, fit),) = calls
    assert args == ([(20, 36), (20, 36)], 48, 48, 8, 8, 1) and kwargs == {}
    assert fit == {"cap": [48, 40], "safe": [32, 32], "over": [], "soft": [0, 1]}
    warnings = _warnings(run_dir)
    assert ("walk: frames exceed the safe area 32x32 but fit within the margin zone (informational, no action): "
            "0:20x36, 1:20x36") in warnings
    assert not any("physical cap" in line for line in warnings)


def test_the_snap_warns_a_frame_past_the_physical_cap_in_its_own_words(tmp_path, calls):
    run_dir = _snap_run(tmp_path, 40, 6)  # cap 40x34: 36 rows are past it
    assert extract_module.run(run_dir=run_dir) == 0
    ((args, _, fit),) = calls
    assert args[1:] == (40, 40, 6, 6, 1) and fit["over"] == [0, 1] and fit["soft"] == []
    warnings = _warnings(run_dir)
    assert ("walk: native logical exceeds the physical cap 40x34 — capped frames (reroll candidates): "
            "0:20x36, 1:20x36") in warnings
    assert not any("margin zone" in line for line in warnings)


def test_pixel_draw_asks_it_with_the_canvas_and_the_engines_margin(calls):
    frame = [[INK if 3 <= y <= 28 and 8 <= x <= 23 else CLEAR for x in range(32)] for y in range(32)]
    gates = evaluate({"f": frame}, kind="sprite", rule=pg.palette_rule("free"), walk_cycle=False)
    ((args, kwargs, fit),) = calls
    assert args == ([(16, 26)], 32, 32, 3, 3) and kwargs == {}
    assert gates["G8"]["physical_cap"] == fit["cap"] and gates["G8"]["safe_area"] == fit["safe"]


def test_both_paths_say_what_it_answers(tmp_path, monkeypatch):
    """Answer that every frame is past the safe area: the snap and G8 both say so of frames well inside it."""
    real = extract_module.safe_area_fit

    def past(sizes, *args, **kwargs):
        return {**real(sizes, *args, **kwargs), "over": [], "soft": list(range(len(sizes)))}

    monkeypatch.setattr(extract_module, "safe_area_fit", past)
    small = [[INK if 19 <= y <= 28 and 11 <= x <= 20 else CLEAR for x in range(32)] for y in range(32)]
    gates = evaluate({"f": small}, kind="sprite", rule=pg.palette_rule("free"), walk_cycle=False)
    assert gates["ok"] and gates["warnings"] == []
    assert gates["info"] == ["G8: frames exceed the safe area 26x26 but fit within the margin zone (informational, "
                             "no action): f:10x10"]
    run_dir = _snap_run(tmp_path, 96, 8)  # safe area 80x80
    assert extract_module.run(run_dir=run_dir) == 0
    assert ("walk: frames exceed the safe area 80x80 but fit within the margin zone (informational, no action): "
            "0:20x36, 1:20x36") in _warnings(run_dir)
