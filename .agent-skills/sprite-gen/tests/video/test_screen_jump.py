# SPDX-License-Identifier: Apache-2.0
"""A take that jumps (docs/loop-repair.md section 4, sprite_gen/video/cadence.py `screen_record`).

Two drawings filmed a pose apart move the feet little and change the picture much: the beat, read on the leg path, does
not see it. The screen step does: how much of the picture changes from one frame of the cut to the next, over the box and
on its leg rows. A step SCREEN_JUMP times the cycle's typical step (its upper quartile: a drawing change, whether the
cut is on ones or threes) and SCREEN_ALONE times every other step is a jump — inside the cut the take's own
(`filmed-jump`), at its seam the cut's (`seam-jump`); either is cut again from a cycle the clip films without it, or
filmed again. A cycle whose drawing
changes are all alike has none, nor one with two steps alike however large.

Synthetic figures only: an outlined body over an outlined bar 80 px wide in the leg rows, which slides along by the
drawing; a step changes the picture in proportion to how far the bar slides."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from sprite_gen.video import align, cadence
from sprite_gen.video import loop as loop_mod

W, H = 220, 160
LINE, BODY, BAR = (0, 0, 0, 255), (230, 230, 230, 255), (150, 90, 60, 255)


def _frame(x: float) -> Image.Image:
    """A body over a bar from column 10 + `x` in the leg rows (rows 104 to 149, the lowest 30 % of the box from row 10)."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([60, 10, 139, 99], fill=LINE)
    d.rectangle([62, 12, 137, 97], fill=BODY)
    x = 10 + round(x)
    d.rectangle([x, 104, x + 79, 149], fill=LINE)
    d.rectangle([x + 2, 106, x + 77, 147], fill=BAR)
    return im


def _cut(places: list[float], hold: int = 3) -> list[Image.Image]:
    """A cut drawn on `hold`s: drawing d with the bar at `places[d]`."""
    return [_frame(x) for x in places for _ in range(hold)]


EVEN = [4 * min(d, 18 - d) for d in range(18)]  # 4 px a drawing out and back: every drawing change alike
JUMP = [0, 4, 8, 12, 16, 36, 40, 44, 48, 52] + [round(52 - 52 * k / 9, 2) for k in range(1, 9)]  # 20 px from drawing 4 to 5
TWICE = [0, 4, 8, 28, 32, 36, 56, 60, 64, 68] + [round(68 - 68 * k / 9, 2) for k in range(1, 9)]  # 20 px twice
SEAM = [4 * d for d in range(18)]  # out all the way, back in one step at the seam


def test_a_step_far_larger_than_the_cuts_drawing_changes_and_than_any_other_is_a_jump():
    rec = cadence.screen_record(cadence.screen_steps(_cut(JUMP)))
    assert [(j["step"], j["seam"]) for j in rec["jumps"]] == [([14, 15], False)]  # drawing 4 ends at frame 14, 5 begins at 15
    jump = rec["jumps"][0]
    for region in ("whole", "legs"):
        change, of_typical, alone = jump[region]
        assert of_typical >= cadence.SCREEN_JUMP and alone >= cadence.SCREEN_ALONE
    assert rec["typical"]["legs"] > 0 and rec["limits"] == {"jump": cadence.SCREEN_JUMP, "alone": cadence.SCREEN_ALONE,
                                                            "rows": cadence.SCREEN_ROWS}
    assert len(rec["whole"]) == len(rec["legs"]) == 54


@pytest.mark.parametrize("hold", [1, 2, 3])
def test_a_cut_whose_drawing_changes_are_all_alike_has_no_jump_whatever_it_is_drawn_on(hold):
    """On twos and threes most steps change nothing; the typical step is the upper quartile, a drawing change."""
    rec = cadence.screen_record(cadence.screen_steps(_cut(EVEN, hold)))
    assert rec["jumps"] == []


def test_two_steps_alike_however_large_are_no_jump():
    rec = cadence.screen_record(cadence.screen_steps(_cut(TWICE)))
    steps = rec["legs"]
    big = sorted(range(len(steps)), key=lambda k: -steps[k])[:2]
    assert sorted(big) == [8, 17] and min(steps[k] for k in big) / rec["typical"]["legs"] >= cadence.SCREEN_JUMP
    assert rec["jumps"] == []  # each is no more than SCREEN_ALONE times the other


def test_a_jump_at_the_cuts_last_step_is_its_seam():
    rec = cadence.screen_record(cadence.screen_steps(_cut(SEAM)))
    assert [(j["step"], j["seam"]) for j in rec["jumps"]] == [([53, 0], True)]


def _retake(screen):
    return align.retake({"hold": 1}, {"between": "auto", "to": 24, "nearest_at": [], "smear": []}, [], fps=24.0, screen=screen)


def test_a_jump_inside_the_cut_and_one_at_its_seam_are_cuts_to_make_again_or_takes_to_film_again():
    filmed = {"step": [30, 31], "seam": False, "whole": [22.0, 2.1, 1.5], "legs": [36.0, 2.5, 1.8], "at": [[13, 14]]}
    seam = {"step": [53, 0], "seam": True, "whole": [30.0, 2.5, 2.0], "legs": [41.0, 2.6, 2.1], "at": [[3, 4]]}
    limits = {"screen_jump": cadence.SCREEN_JUMP, "screen_alone": cadence.SCREEN_ALONE, "screen_rows": cadence.SCREEN_ROWS}
    assert _retake({"jumps": [filmed]}) == {
        "reason": "filmed-jump", "reasons": ["filmed-jump"],
        "filmed_jump": {"steps": [[30, 31]], "at": [[[13, 14]]], "whole": [[22.0, 2.1, 1.5]], "legs": [[36.0, 2.5, 1.8]], "remedy": "recut-or-retake"},
        "limits": limits}
    both = _retake({"jumps": [filmed, seam]})
    assert both["reasons"] == ["filmed-jump", "seam-jump"] and both["seam_jump"]["remedy"] == "recut-or-retake"
    assert both["seam_jump"]["steps"] == [[53, 0]] and both["limits"] == limits
    assert _retake({"jumps": []}) is None and _retake(None) is None
    line = align._retake_line("walk-front_diagonal", both, "filmed-jump")
    assert line.startswith("walk-front_diagonal: cut it again or film this direction again (filmed-jump): the take jumps between two of its frames")
    assert line.endswith("Where the clip films another cycle without the jump, a cut there fixes it; where it does not, a new take does "
                         "(docs/loop-repair.md section 4)")
    assert ("from frame 30 to 31 of cycle.source/ the picture changes 22 of 255 over the figure's box and 36 on its legs, "
            "2.10 and 2.50 times the cut's typical step and 1.50 and 1.80 times any other step (the loop's frames 13 to 14)") in line
    assert align._retake_line("walk-front_diagonal", both, "seam-jump").startswith(
        "walk-front_diagonal: cut it again or film this direction again (seam-jump): the cut's seam jumps")


def _loop(tmp_path: Path, places: list[float]) -> Path:
    keyed = tmp_path / "keyed"
    keyed.mkdir()
    for k, f in enumerate(_cut(places) * 2):
        f.save(keyed / f"{k:04d}.png")
    out = tmp_path / "walk"
    loop_mod.run_loop(keyed, out, fps=24.0, state="walk", min_len=None, max_len=None, n_out=None, seam_max=1000.0,
                      name="walk", report_path=None, cycle_mode="fixed", start=0, length=54, anchor="none", repair="off")
    return out


@pytest.mark.slow
def test_an_aligned_loop_whose_take_jumps_is_named_with_the_frames_that_show_it(tmp_path):
    """Aligned at its own length (nothing made): the jump stands between the frames the cut's step 14 to 15 lands in."""
    d = _loop(tmp_path, JUMP)
    done = align.align_set([d], multi_cycle="warn")
    row = done["loops"][0]
    jumps = row["screen"]["jumps"]
    assert [(j["step"], j["seam"]) for j in jumps] == [([14, 15], False)]
    start = row["turned_by"]
    assert jumps[0]["at"] == [[(14 - start) % 54, (15 - start) % 54]]
    assert row["retake"]["reasons"] == ["filmed-jump"] and row["retake"]["filmed_jump"]["remedy"] == "recut-or-retake"
    assert sum("cut it again or film this direction again (filmed-jump)" in w for w in done["warnings"]) == 1
    assert json.loads((d / "walk.strip.json").read_text())["cycle_align"]["screen"]["jumps"][0]["step"] == [14, 15]


@pytest.mark.slow
def test_an_aligned_loop_whose_drawing_changes_are_alike_names_no_jump(tmp_path):
    done = align.align_set([_loop(tmp_path, EVEN)], multi_cycle="warn")
    assert done["loops"][0]["screen"]["jumps"] == [] and done["loops"][0]["retake"] is None
