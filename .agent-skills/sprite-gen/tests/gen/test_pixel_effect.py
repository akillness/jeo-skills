# SPDX-License-Identifier: Apache-2.0
"""Effect grids have a lifetime and a centre, not a character's feet and fixed height."""
import argparse
import json

import pytest
from PIL import Image

from sprite_gen.gen import pixel_draw as draw


def request(*args):
    parser = argparse.ArgumentParser()
    draw.add_arguments(parser)
    return draw.resolve_request(parser.parse_args(["--subject", "a spark", "--out-dir", "unused", *args]))


def test_only_effects_accept_two_to_eight_frames():
    names = ",".join(f"f{i}" for i in range(8))
    assert len(request("--kind", "effect", "--frames", names).frames) == 8
    assert len(request("--kind", "effect").frames) >= 2
    many = ",".join(f"f{i}" for i in range(65))
    for kind in ("sprite", "icon", "tile"):
        assert len(request("--kind", kind, "--frames", names).frames) == 8  # drawn four at a time
        with pytest.raises(SystemExit, match="at most 64"):
            request("--kind", kind, "--frames", many)
    for names in ("only", ",".join(f"f{i}" for i in range(9))):
        with pytest.raises(SystemExit, match="2.*8"):
            request("--kind", "effect", "--frames", names)
    with pytest.raises(SystemExit, match="walk-cycle"):
        request("--kind", "effect", "--walk-cycle")
    with pytest.raises(SystemExit, match="--motion does not apply to an effect"):
        request("--kind", "effect", "--motion", "a burst")
    prompt = draw.generation_prompt(request("--kind", "effect"))
    assert "center" in prompt and "empty" in prompt and "brightness" in prompt
    assert "same proportions" not in prompt and "floor" not in prompt


def grid_text():
    rows = lambda points: "\n".join("".join("a" if (x, y) in points else "." for x in range(8)) for y in range(8))
    return "PALETTE\n. transparent\na #FF6600\n" + "\n".join(
        f"FRAME {name}\n{rows(points)}" for name, points in [
            ("birth", {(4, 4)}), ("peak", {(2, 2), (4, 4), (6, 6)}), ("gone", set())]) + "\nEND\n"


def test_effect_grid_keeps_sparks_changed_extent_and_empty_end(tmp_path):
    grid = tmp_path / "effect.txt"
    grid.write_text(grid_text())
    out = tmp_path / "out"
    assert draw.main(["--grid", str(grid), "--kind", "effect", "--out-dir", str(out)]) == 0
    report = json.loads((out / "report.json").read_text())
    assert report["status"] == "ok"
    meta = json.loads((out / report["files"]["metadata"]).read_text())
    assert meta["loop"] is False and meta["hold_last"] is False
    assert meta["anchor"] == [4, 4] and meta["frames"] == 3
    strip = Image.open(out / report["files"]["strip"]).convert("RGBA")
    assert strip.size == (24, 8)
    assert strip.getpixel((8 + 2, 2)) == (255, 102, 0, 255)
    assert strip.crop((16, 0, 24, 8)).getchannel("A").getbbox() is None
    with Image.open(out / report["files"]["gif"]) as gif:
        assert "loop" not in gif.info
    with pytest.raises(SystemExit, match="G3"):
        draw.main(["--grid", str(grid), "--kind", "sprite", "--out-dir", str(tmp_path / "sprite")])
