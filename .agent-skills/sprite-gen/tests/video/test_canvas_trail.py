"""A wide canvas keeps `trail` of its width empty behind the subject.

A long weapon drawn back before a strike reaches behind the body; with every
spare pixel placed in front, that swing met the back edge and the frames gate
refused the clip. The attack profile now reserves room on both sides.
"""
from __future__ import annotations

import pytest
from PIL import Image

from sprite_gen.video import canvas


def _still(w: int = 200, h: int = 200) -> Image.Image:
    img = Image.new("RGB", (w, h), (0, 255, 0))
    img.paste((120, 80, 40), (60, 40, 140, 200))
    return img


def test_attack_profile_reserves_room_behind_and_reports_it():
    padded, report = canvas.pad_canvas(_still(), canvas.STATE_CANVAS["attack"], facing="right")
    canvas_w, canvas_h = padded.size
    x, y = report["offset"]
    assert report["trail"] == canvas.STATE_CANVAS["attack"].trail > 0
    assert x == round(canvas_w * report["trail"])
    assert x + 200 <= canvas_w and y == canvas_h - 200
    # still pixels are preserved at the offset
    assert padded.getpixel((x + 100, y + 100)) == (120, 80, 40)
    assert padded.getpixel((x // 2, canvas_h - 1)) == (0, 255, 0)


def test_trail_zero_keeps_the_old_placement():
    _, report = canvas.pad_canvas(_still(), canvas.STATE_CANVAS["attack"], facing="right", trail=0.0)
    assert report["offset"][0] == 0 and report["trail"] == 0.0


def test_other_wide_profiles_are_unchanged():
    for state in ("projectile", "cheer", "wave", "celebrate"):
        _, report = canvas.pad_canvas(_still(), canvas.STATE_CANVAS[state], facing="right")
        assert report["trail"] == 0.0 and report["offset"][0] == 0


def test_lead_and_trail_are_bounded():
    with pytest.raises(SystemExit):
        canvas.pad_canvas(_still(), canvas.STATE_CANVAS["attack"], trail=0.95)
    with pytest.raises(SystemExit):
        canvas.pad_canvas(_still(), canvas.STATE_CANVAS["attack"], lead=0.5, trail=0.45)


def test_cli_trail_reaches_the_report(tmp_path):
    still = tmp_path / "still.png"
    _still().save(still)
    payload = canvas.run_canvas(still, tmp_path / "out.png", state="attack", shape=None, facing="right", headroom=None, lead=None, report_path=tmp_path / "r.json", trail=0.1)
    assert payload["trail"] == 0.1 and payload["offset"][0] == round(payload["canvas"][0] * 0.1)
