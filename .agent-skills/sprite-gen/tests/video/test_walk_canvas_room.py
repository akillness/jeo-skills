# SPDX-License-Identifier: Apache-2.0
"""A walk or run filmed from the side is framed on a square that keeps GAIT_ROOM of the silhouette's height clear in
front of it and, more, behind it: a still that leaves less — a big tail reaching for the frame's edge behind the body — gets
the columns it lacks on that side, the square's rows to match above it, and the report says why
(`canvas.gait_room`, docs/video-pipeline.md section 1). A still that leaves the room keeps its square to the byte.
Front, back and diagonal walks are not read."""
from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from PIL import Image, ImageOps

from sprite_gen.video import batch, canvas

GREEN = (0, 255, 0)
FUR = (150, 90, 40)
TAILED_H = 320  # the tailed still's silhouette, rows 60..380


def _tailed(facing: str = "right") -> Image.Image:
    """A side still 400 square, silhouette rows 60..380 (320 tall): a body, a head in front, and a tail behind it
    reaching to 6 px of the frame's edge (0.019 of the silhouette's height); 60 px clear in front (0.188, as much as
    the stride needs)."""
    still = Image.new("RGB", (400, 400), GREEN)
    still.paste(FUR, (120, 160, 300, 380))  # body and legs
    still.paste(FUR, (260, 60, 340, 170))  # head, in front
    still.paste(FUR, (6, 150, 120, 200))  # tail, behind
    return still if facing == "right" else ImageOps.mirror(still)


def _lacks(room_px: int, side: str = "behind", height: int = TAILED_H) -> int:
    return max(0, math.ceil(canvas.GAIT_ROOM[side] * height - room_px))


def _narrow() -> Image.Image:
    """A person's side still: 60 px wide, 350 tall, 170 px clear on either side."""
    still = Image.new("RGB", (400, 400), GREEN)
    still.paste(FUR, (170, 40, 230, 390))
    return still


def _clip_runner(sizes: list[tuple[int, int]]):
    """A clip runner that records the canvas it is given and makes no clip (the item fails after its canvas)."""
    def video(image, prompt, out, report, **kw):
        with Image.open(image) as im:
            sizes.append(im.size)
        return 1
    return video


def _side_item(tmp_path: Path, still: Image.Image, facing: str, **options):
    base = tmp_path / f"base-{facing}.png"
    still.save(base)
    sizes: list[tuple[int, int]] = []
    result = batch.run_item(item=f"side-{facing}-walk", direction="side", state=options.pop("state", "walk"), base=base,
                            root=tmp_path / "set", character=None, duration=3, resolution="720p", key="green", force=False,
                            gap=0, video_runner=_clip_runner(sizes), facing=facing,
                            prepare_side=lambda b: (b, {"requested": facing, "fix": "none", "action": "none"}), **options)
    item = tmp_path / "set" / f"side-{facing}-walk"
    return result, json.loads((item / "canvas.report.json").read_text()), sizes, Image.open(item / "canvas.png")


@pytest.mark.parametrize("facing", ["right", "left"])
def test_video_set_widens_a_side_walks_square_by_the_room_its_tail_lacks(tmp_path, facing):
    result, report, sizes, made = _side_item(tmp_path, _tailed(facing), facing)
    # Not filmed on the still's own 400 square, whose edge the tail is 6 px from: on a larger square.
    assert len(sizes) == 1 and sizes[0][0] == sizes[0][1] > 400, f"filmed on {sizes}"
    add = _lacks(6)
    side = 400 + add
    assert _lacks(60, "front") == 0
    # Square still, the columns the tail lacks behind it, the rows to match above the still; nothing scaled.
    assert add > 0 and sizes == [(side, side)] and report["shape"] == "square" and report["canvas"] == [side, side]
    x = add if facing == "right" else 0
    assert report["offset"] == [x, add]
    assert made.crop((x, add, x + 400, add + 400)).tobytes() == _tailed(facing).tobytes()
    behind = (0, add) if facing == "right" else (400, side)
    assert made.crop((behind[0], 0, behind[1], side)).getextrema() == ((0, 0), (255, 255), (0, 0))
    room = report["room"]
    assert room["view"] == "side" and room["short"] == ["behind"] and room["added_px"] == {"front": 0, "behind": add}
    assert room["added_rows"] == add
    assert (room["behind_px"], room["front_px"]) == (6, 60) and room["silhouette"][1:4:2] == [60, 380]
    assert room["behind"] == round(6 / TAILED_H, 4) and room["need"] == canvas.GAIT_ROOM
    assert room["need_px"] == {side: round(canvas.GAIT_ROOM[side] * TAILED_H, 1) for side in ("front", "behind")}
    assert report["why"] == canvas.GAIT_ROOM_WHY
    # The set's report says it too: the view read, the room behind, the columns and rows the square gained, and why.
    said = result["canvas"]["room"]
    assert result["canvas"]["canvas"] == [side, side] and said["view"] == "side" and said["short"] == ["behind"]
    assert (said["behind_px"], said["added_px"], said["added_rows"]) == (6, {"front": 0, "behind": add}, add)
    assert result["canvas"]["why"] == canvas.GAIT_ROOM_WHY


def test_a_side_walk_with_room_keeps_the_square_byte_for_byte(tmp_path):
    result, report, sizes, made = _side_item(tmp_path, _narrow(), "right")
    assert sizes == [(400, 400)] and report["shape"] == "square" and report["offset"] == [0, 0]
    assert report["room"]["short"] == [] and report["room"]["added_px"] == {"front": 0, "behind": 0}
    assert report["why"] == canvas.STATE_CANVAS["default"].why
    assert "why" not in result["canvas"] and result["canvas"]["room"]["front"] == round(170 / 350, 4)
    # The canvas is the one the default row makes, and the report that row's plus the room it read.
    padded, before = canvas.pad_canvas(_narrow(), canvas.STATE_CANVAS["default"], facing="right")
    assert made.tobytes() == padded.tobytes()
    assert {k: v for k, v in report.items() if k in before} == json.loads(json.dumps(before))


@pytest.mark.parametrize("view", ["front", "back", "front_diagonal", "back_diagonal", None])
def test_a_walk_not_filmed_from_the_side_is_not_read(tmp_path, view):
    still = tmp_path / "still.png"
    _tailed().save(still)
    report = canvas.run_canvas(still, tmp_path / "c.png", state="walk", shape=None, facing="right", headroom=None,
                               lead=None, report_path=None, view=view)
    assert report["shape"] == "square" and report["canvas"] == [400, 400] and "room" not in report


def test_the_bounds_are_gait_room_of_the_silhouettes_height_more_behind_than_in_front():
    assert canvas.GAIT_ROOM["behind"] > canvas.GAIT_ROOM["front"] > 0
    need = {side: canvas.GAIT_ROOM[side] * 300 for side in ("front", "behind")}
    for behind, short in ((math.ceil(need["behind"]), []), (math.ceil(need["behind"]) - 1, ["behind"])):
        still = Image.new("RGB", (400, 400), GREEN)
        still.paste(FUR, (behind, 50, 300, 350))  # 300 tall, 100 px clear in front
        _, report = canvas.pad_canvas(still, canvas.profile_for("walk"), facing="right", view="side")
        assert report["room"]["behind_px"] == behind and report["room"]["short"] == short
        assert report["canvas"] == ([400, 400] if not short else [401, 401]) and report["offset"][0] == len(short)
    # In front too, at its own bound: a stride reaches ahead of the silhouette. Both short: each side gains what it lacks.
    still = Image.new("RGB", (400, 400), GREEN)
    still.paste(FUR, (2, 50, 400 - math.ceil(need["front"]) + 1, 350))
    _, report = canvas.pad_canvas(still, canvas.profile_for("walk"), facing="right", view="side")
    lacks = {"front": 1, "behind": math.ceil(need["behind"] - 2)}
    assert report["room"]["short"] == ["front", "behind"] and report["room"]["added_px"] == lacks
    assert report["room"]["added_rows"] == lacks["front"] + lacks["behind"]
    side = 400 + lacks["front"] + lacks["behind"]
    assert report["canvas"] == [side, side] and report["offset"] == [lacks["behind"], side - 400]


def test_the_room_is_read_in_the_square_the_row_makes_of_the_still():
    # 300 wide and 400 tall: the square is 400 wide with the still centred, 50 px of it on either side of the still.
    still = Image.new("RGB", (300, 400), GREEN)
    still.paste(FUR, (6, 60, 250, 380))  # 6 px from the still's own edge behind, 50 in front
    padded, report = canvas.pad_canvas(still, canvas.profile_for("walk"), facing="right", view="side")
    assert (report["room"]["behind_px"], report["room"]["front_px"]) == (56, 100)
    add = _lacks(56)
    assert padded.size == (400 + add, 400 + add) and report["offset"] == [50 + add, add]


def test_a_white_base_is_read_on_its_corner_colour():
    ivory = (246, 244, 236)
    still = Image.new("RGB", (400, 400), ivory)
    still.paste(FUR, (120, 160, 300, 380))
    still.paste(FUR, (260, 60, 340, 170))
    still.paste(FUR, (6, 150, 120, 200))
    still.putpixel((2, 2), (250, 250, 250))  # within the corner tolerance: background, not subject
    padded, report = canvas.pad_canvas(still, canvas.profile_for("walk"), facing="right", key="white", view="side")
    assert report["room"]["behind_px"] == 6 and padded.size == (400 + _lacks(6),) * 2
    assert padded.getpixel((0, 0)) == ivory


def test_a_run_is_read_at_the_walks_bound_and_a_named_shape_or_tight_fit_is_not_read(tmp_path):
    still = tmp_path / "still.png"
    _tailed().save(still)
    def frame(**kw):
        options = {"state": "walk", "shape": None, "facing": "right", "headroom": None, "lead": None, "report_path": None,
                   "view": "side", **kw}
        return canvas.run_canvas(still, tmp_path / "c.png", **options)
    widened = [400 + _lacks(6)] * 2
    assert frame()["canvas"] == widened and frame(state="run")["canvas"] == widened
    assert frame(state="run")["room"]["short"] == ["behind"]
    # `--shape square` keeps the still's square whatever its room; `--shape wide` is the walk's wide row, as before.
    assert frame(shape="square")["canvas"] == [400, 400] and "room" not in frame(shape="square")
    forced = frame(shape="wide")
    assert forced["shape"] == "wide" and forced["why"] == canvas.GAIT_WIDE.why and "room" not in forced
    # A tight canvas adds no room, by its own rule.
    assert "room" not in frame(fit="tight") and frame(fit="tight")["fit"] == "tight"
    # Any other state keeps its row.
    assert frame(state="idle")["canvas"] == [400, 400] and "room" not in frame(state="idle")


def test_video_canvas_view_from_the_command_line(tmp_path, capsys):
    still = tmp_path / "still.png"
    _tailed("left").save(still)
    report = tmp_path / "r.json"
    assert canvas.main(["--still", str(still), "--out", str(tmp_path / "c.png"), "--state", "walk", "--facing", "left",
                        "--view", "side", "--report", str(report)]) == 0
    written = json.loads(report.read_text())
    add = _lacks(6)
    assert written["canvas"] == [400 + add] * 2 and written["offset"] == [0, add]
    assert written["room"]["short"] == ["behind"] and written["room"]["behind_px"] == 6
    assert json.loads(capsys.readouterr().out) == written
    with pytest.raises(SystemExit):
        canvas.main(["--still", str(still), "--out", str(tmp_path / "c.png"), "--state", "walk", "--view", "top"])
