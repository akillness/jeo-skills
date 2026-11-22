# SPDX-License-Identifier: Apache-2.0
"""The part pop (docs/loop-repair.md section 2, "The part pop"): a part the size of a hand that jumps 2 to 5 % of the
body's height at a walk loop's wrap and stays there passes the flow reading and the surge reading, which read the loop in
windows half the body's box each way; the part reading follows the parts themselves and names it. The loop is cut as
it was, the search's cut or the cut given, to the same bytes: the pop is named in a warning line, the report records a
take to film again (`retake`, reason `part-pop`; `remedy` `retake` for the search's cut, `recut-or-retake` for a cut
given), and `--unfixed refuse` refuses the loop. A walk whose tail swings, whose foot lifts and whose eye blinks across
the wrap has no part pop, and its loop is the bytes it was.

The boundary is pinned on parts' paths: each of the floor, the speed, the curve and the lead flips the pop where it is
crossed, the share of it the next step takes back flips `flung` and `stays`, and a part that eases through a fast stretch
is not a pop. The walkers are drawn here. Synthetic frames only."""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

from sprite_gen.video import loop, part_pop, repair

W, H, N = 240, 300, 36
STANCE_END = 0.16  # of a cycle: where the legs' swing turns, at the loop's first frame


# --- the boundary, on parts' paths ------------------------------------------------------------------------------------


def _path(steps: list[tuple[float, float]]) -> np.ndarray:
    """A part's places from its steps: n steps, n + 1 places, the last step the wrap."""
    return np.concatenate([[[0.0, 0.0]], np.cumsum(np.array(steps, dtype=float), axis=0)])


def _wrap(steps: list[tuple[float, float]], usual: float) -> dict:
    """The part's reading over the wrap step alone (the last)."""
    n = len(steps)
    return part_pop.part_runs(_path(steps), usual, [[n - 1]])[0]


def _ordinary(n: int, size: float = 1.0) -> list[tuple[float, float]]:
    return [(size, 0.0)] * n


FLOOR_PX = part_pop.PART_POP_FLOOR * part_pop.PART_READ  # 8 px at a body height of 400
HAIR = 1e-6  # a hair's breadth either side of a bound, as a share of it


def _far(said: dict, *but: str) -> None:
    """Every term of the run but `but` is well past its bound."""
    bounds = {"px": FLOOR_PX, "speed": repair.SURGE_LIMIT, "curve": part_pop.PART_POP_CURVE, "lead": part_pop.PART_POP_LEAD}
    assert all(said[k] >= 1.1 * v for k, v in bounds.items() if k not in but), said


@pytest.mark.parametrize("wrap,pops", [(FLOOR_PX, True), (FLOOR_PX - 1 / 64, False)])
def test_the_floor_flips_the_pop_at_two_percent_of_the_body(wrap, pops):
    said = _wrap(_ordinary(23) + [(wrap, 0.0)], usual=1.0)
    _far(said, "px")
    assert said["px"] == wrap and said["jerk"] == pytest.approx(wrap - 1.0)  # a still curve: one px a step
    assert said["pops"] is pops


@pytest.mark.parametrize("usual,pops", [(4.0 * (1 - HAIR), True), (4.0 * (1 + HAIR), False)])
def test_the_speed_flips_the_pop_at_three_usual_steps_off_the_curve(usual, pops):
    # 12.5 px where the curve gives 0.5: 12 px off it, three usual steps of 4
    said = _wrap(_ordinary(23, 0.5) + [(12.5, 0.0)], usual=usual)
    _far(said, "speed")
    assert said["pops"] is pops


@pytest.mark.parametrize("off,pops", [(10.0 * (1 + HAIR), True), (10.0 * (1 - HAIR), False)])
def test_the_curve_flips_the_pop_at_five_times_the_step_it_predicts(off, pops):
    # the part steps 2 px a step; at the wrap `off` px past that: five times the 2 px the curve gives there
    said = _wrap(_ordinary(23, 2.0) + [(2.0 + off, 0.0)], usual=1.0)
    _far(said, "curve")
    assert said["predicted"] == pytest.approx(2.0) and said["fit"] == pytest.approx(0.0, abs=1e-9)
    assert said["pops"] is pops


@pytest.mark.parametrize("elsewhere,pops", [(6.0 * (1 - HAIR), True), (6.0 * (1 + HAIR), False)])
def test_the_lead_flips_the_pop_at_twice_the_parts_largest_jerk_elsewhere(elsewhere, pops):
    # a part that leaves its curve by `elsewhere` in one step inside the loop (a tail's flick) leaves it at the wrap as its
    # own motion: 12 px off at the wrap is twice 6
    steps = _ordinary(24)
    steps[10] = (1.0 + elsewhere, 0.0)
    steps[23] = (13.0, 0.0)
    said = _wrap(steps, usual=1.0)
    _far(said, "lead")
    assert said["lead"] == pytest.approx(12.0 / elsewhere)
    assert said["pops"] is pops


@pytest.mark.parametrize("back,kind", [(6.0, "flung"), (6.0 - 1 / 64, "stays")])
def test_a_pop_the_next_step_takes_half_of_back_is_flung_else_it_stays(back, kind):
    steps = _ordinary(24)
    steps[23] = (12.0, 0.0)
    steps[0] = (-back, 0.0)
    said = _wrap(steps, usual=1.0)
    assert said["kind"] == kind and said["back"] == pytest.approx(back / 12.0)


def test_a_pop_over_two_steps_is_read_as_their_mean_against_the_curve_beyond_them():
    steps = _ordinary(24)
    steps[22], steps[23] = (10.0, 0.0), (10.0, 0.0)
    one, two = part_pop.part_runs(_path(steps), 1.0, [[23], [22, 23]])
    assert not one["pops"]  # the step beside it pulls its curve up: the one step is half explained
    assert two["pops"] and two["jerk"] == pytest.approx(9.0) and two["predicted"] == pytest.approx(1.0)


@pytest.mark.parametrize("width", [3, 4, 5, 6, 8])
@pytest.mark.parametrize("peak", [12.0, 20.0, 40.0])
def test_a_part_that_eases_through_a_fast_stretch_does_not_pop_where_the_mean_of_its_neighbours_named_it(width, peak):
    """Slow, fast, slow: a tail that flicks over `width` steps, its speed a sin² bell to `peak` px a step (up to a tenth of
    the body), across the wrap. Its curve follows the ease; the mean of the steps either side, the first definition's
    baseline, does not (6 times it and 1.5 times the part's largest step elsewhere named every bell of three and four
    steps)."""
    n = 36
    steps = [(1.0 + 0.3 * math.sin(2 * math.pi * k / n), 0.4 * math.cos(2 * math.pi * k / n)) for k in range(n)]
    first = (n - width // 2 - 1) % n
    for i in range(width):
        x, y = steps[(first + i) % n]
        steps[(first + i) % n] = (x + peak * math.sin(math.pi * (i + 0.5) / width) ** 2, y)
    said = part_pop.part_runs(_path(steps), 1.0, [[n - 1], [n - 2, n - 1], [n - 1, 0]])
    assert not any(x["pops"] for x in said), said


# --- the side walker -----------------------------------------------------------------------------------------------


# Spots drawn on the torso and the head where they are, as a painted body has shading to follow: px from the torso's and
# the head's top left, radius and shade.
_SPOTS = random.Random(7)
TORSO_SPOTS = [(_SPOTS.uniform(6, 44), _SPOTS.uniform(6, 79), _SPOTS.uniform(1.5, 3.0), _SPOTS.choice((90, 150, 250))) for _ in range(28)]
HEAD_SPOTS = [(_SPOTS.uniform(10, 50), _SPOTS.uniform(6, 22), _SPOTS.uniform(1.5, 2.5), _SPOTS.choice((120, 180))) for _ in range(10)]


def _hand_slip(slip_pct: float) -> float:
    return slip_pct / 100 * 243  # px: the walker's height over its loop, head to feet


def _walker(phase: float, *, hand: tuple[float, float], eye_shut: bool = False, lift: float = 0.0) -> Image.Image:
    """The walker at `phase` of its cycle (0..1), seen from the side: a tail behind it swinging once a cycle, two legs
    quick through the swing and slow through the stance (the loop's wrap at the stance's end, where they hardly move), the
    far foot `lift` px off its line, a torso and a head with an eye (shut: a line), and a forearm held out in front ending
    in a fist, held where it is as the body bobs, the two `hand` px off their place."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    phi = 2 * math.pi * (phase + STANCE_END)
    bob = 3 * math.cos(2 * phi)
    tx, ty = 62 + 26 * math.sin(phi), 135 + bob - 12 * math.cos(phi)
    d.polygon([(104, 120 + bob), (104, 150 + bob), (tx - 18, ty + 20), (tx - 28, ty - 24)], fill=(220, 120, 40, 255))
    d.ellipse((tx - 48, ty - 38, tx - 8, ty + 10), fill=(240, 150, 60, 255), outline=(120, 60, 20, 255), width=3)
    swing = 0.5 * math.sin(phi + 0.6 * math.sin(phi))
    for hip, angle, colour, up in ((120, swing, (70, 60, 120, 255), 0.0), (128, -swing, (90, 80, 150, 255), lift)):
        x1, y1 = hip + 95 * math.sin(angle), 175 + bob + 95 * math.cos(angle) - up
        d.line((hip, 175 + bob, x1, y1), fill=colour, width=16)
        d.ellipse((x1 - 12, y1 - 7, x1 + 14, y1 + 7), fill=(40, 30, 30, 255))
    d.rectangle((100, 100 + bob, 150, 185 + bob), fill=(200, 200, 220, 255), outline=(20, 20, 20, 255), width=3)
    for x, y, r, v in TORSO_SPOTS:
        d.ellipse((100 + x - r, 100 + bob + y - r, 100 + x + r, 100 + bob + y + r), fill=(v, v, v + 5, 255))
    d.ellipse((96, 40 + bob, 156, 102 + bob), fill=(240, 210, 180, 255), outline=(20, 20, 20, 255), width=3)
    for x, y, r, v in HEAD_SPOTS:
        d.ellipse((96 + x - r, 40 + bob + y - r, 96 + x + r, 40 + bob + y + r), fill=(v + 60, v, v - 40, 255))
    if eye_shut:
        d.line((134, 64 + bob, 146, 64 + bob), fill=(20, 20, 20, 255), width=3)
    else:
        d.ellipse((136, 58 + bob, 144, 70 + bob), fill=(20, 20, 20, 255))
    hx, hy = 196 + hand[0], 150 + hand[1]
    d.line((hx - 34, hy - 14, hx - 8, hy - 4), fill=(225, 195, 165, 255), width=10)  # the forearm, out of the sleeve
    d.ellipse((hx - 13, hy - 12, hx + 13, hy + 12), fill=(240, 205, 170, 255), outline=(30, 20, 20, 255), width=3)
    d.line((hx + 2, hy - 8, hx + 2, hy + 8), fill=(120, 70, 50, 255), width=3)  # the knuckles
    return im


def _hand(k: float, n: int, slip: float) -> tuple[float, float]:
    """The fist's place at frame k of a loop of n: a little loop with the walk, and `slip` px over the loop, which it
    jumps back at the wrap and stays."""
    phi = 2 * math.pi * k / n
    return 1.5 * math.sin(phi) + slip * k / n, math.cos(phi)


def _lift(k: float, n: int) -> float:
    """The far foot lifted round the wrap: up to 16 px, over the frames either side of it."""
    d = min((k + 0.5) % n, n - (k + 0.5) % n)  # frames from the wrap, between the last frame and the first
    return 16 * math.exp(-(d / 2.5) ** 2)


def _side(n: int = N, *, slip: float = 0.0, blink: tuple[int, ...] = (), lift: bool = False) -> list[Image.Image]:
    """The side walker's loop of `n` frames, its fist `slip` px off at the wrap, its eye shut at `blink`, its far foot
    lifted round the wrap where `lift`."""
    return [_walker(k / n, hand=_hand(k, n, slip), eye_shut=k in blink, lift=_lift(k, n) if lift else 0.0) for k in range(n)]


def _keyed(root: Path, frames: list[Image.Image]) -> Path:
    keyed = root / "keyed"
    keyed.mkdir(parents=True)
    for k, f in enumerate(frames):
        f.save(keyed / f"{k:03}.png")
    return keyed


def _cut(root: Path, frames: list[Image.Image], **kw) -> dict:
    """The loop cut whole as `video-loop --state walk --cycle fixed --anchor none` cuts it; the report, passed or not."""
    keyed = _keyed(root, frames)
    try:
        loop.run_loop(keyed, root / "out", fps=24.0, state="walk", min_len=None, max_len=None, n_out=None,
                      seam_max=loop.SEAM_RATIO_MAX, name="loop", report_path=root / "loop.json", cycle_mode="fixed", start=0,
                      length=len(frames), anchor="none", repair="off", **kw)
    except SystemExit as exc:
        (root / "exit.txt").write_text(str(exc))
    return json.loads((root / "loop.json").read_text())


def _files(root: Path) -> dict[str, bytes]:
    out = root / "out"
    return {str(f.relative_to(out)): f.read_bytes() for f in sorted(out.rglob("*")) if f.suffix in (".png", ".gif", ".webp")}


def _near_hand(pop: dict) -> bool:
    """The pop is the arm's held out in front: the part's square seeded over the fist or the arm's end on the first frame."""
    x, y = pop["seed"]
    return 160 <= x <= 225 and 110 <= y <= 180


@pytest.mark.slow
@pytest.mark.parametrize("slip_pct", [2.5, 3.5, 5.0])
def test_a_hand_that_pops_at_the_wrap_passes_the_flow_reading_and_the_part_reading_names_it(slip_pct):
    frames = _side(slip=_hand_slip(slip_pct))
    # the loop stage as it was: no frame off the flow, no rush — the hand is a small share of every window it is read in
    assert repair.flow_targets(frames)["groups"] == [] and repair.surges(frames) == []
    reading = part_pop.read(frames)
    assert reading["pops"], reading["nearest"]
    pop = reading["pops"][0]
    assert _near_hand(pop) and pop["kind"] == "stays" and (pop["from"], pop["to"]) == (N - 1, 0)
    (x0, y0), (x1, y1) = _hand(N - 1, N, _hand_slip(slip_pct)), _hand(0, N, _hand_slip(slip_pct))
    assert pop["body_pct"] == pytest.approx(100 * math.hypot(x1 - x0, y1 - y0) / reading["body_px"], abs=0.4)
    assert pop["margin"] >= 1.0 and all(_near_hand(p) for p in reading["pops"])


@pytest.mark.slow
def test_an_ordinary_walk_whose_tail_foot_and_eye_move_across_the_wrap_has_no_part_pop_anywhere():
    # its tail swings once a cycle, its far foot lifts 16 px and its eye shuts across the wrap: no part pops at the wrap,
    # nor at any step inside the loop
    frames = _side(blink=(N - 1, 0), lift=True)
    assert part_pop.read(frames)["pops"] == []
    assert part_pop.read(frames, steps=range(N))["pops"] == []


def test_a_run_drawn_fast_has_no_part_pop_anywhere():
    # the same walker at 16 frames a cycle, a run: its legs swing 12 % of the body a frame and its foot lifts in three
    # frames across the wrap; the parts it moves fastest leave the search and are not followed, and none that is pops
    frames = _side(16, blink=(15, 0), lift=True)
    reading = part_pop.read(frames)
    assert reading["pops"] == [] and reading["followed"] < reading["parts"]
    assert part_pop.read(frames, steps=range(16))["pops"] == []


@pytest.mark.slow
def test_an_ordinary_walk_is_cut_to_the_bytes_it_was(tmp_path, monkeypatch):
    frames = _side(blink=(N - 1, 0), lift=True)
    report = _cut(tmp_path / "read", frames)
    assert report["status"] == "passed" and report["part_pop"]["pops"] == [] and report["part_pop"]["outcome"] == "none"
    assert report["retake"] is None
    # the same loop with the part reading reading nothing: every file the cut writes is the same bytes
    _unread(monkeypatch)
    _cut(tmp_path / "unread", frames)
    assert _files(tmp_path / "read") == _files(tmp_path / "unread")


def _unread(monkeypatch) -> None:
    """The part reading reading nothing, as a cut was before it."""
    monkeypatch.setattr(part_pop, "read", lambda frames, **kw: {"pops": [], "nearest": None})


@pytest.mark.slow
def test_a_cut_given_whose_hand_pops_is_named_a_take_to_film_again_and_unfixed_refuse_refuses_it(tmp_path, capsys, monkeypatch):
    frames = _side(slip=_hand_slip(3.5))
    report = _cut(tmp_path / "warn", frames)
    assert report["status"] == "passed"
    pop = report["part_pop"]
    assert pop["outcome"] == "named" and pop["left"] == pop["pops"] and len(pop["pops"]) > 1 and _near_hand(pop["pops"][0])
    retake = report["retake"]
    assert (retake["reason"], retake["reasons"], retake["remedy"]) == ("part-pop", ["part-pop"], "recut-or-retake")
    assert retake["part_pop"]["cut"] == [0, N] and retake["part_pop"]["searched"] is False
    assert retake["limits"] == {"floor": part_pop.PART_POP_FLOOR, "speed": repair.SURGE_LIMIT, "curve": part_pop.PART_POP_CURVE,
                                "lead": part_pop.PART_POP_LEAD}
    # the squares seeded on the one fist pop together: one line says the worst and how many pop with it
    err = capsys.readouterr().err
    lines = [line for line in err.splitlines() if "film this direction again (part-pop)" in line]
    assert len(lines) == 1 and f"; {len(pop['pops']) - 1} parts beside it pop with it)" in lines[0]
    assert lines[0].startswith("video-loop: warning: film this direction again (part-pop) — the part at")
    assert ("the cut was given (--cycle fixed or pinned): cut it where no part pops, or film it again; --unfixed refuse "
            "refuses such a loop" in lines[0])
    refused = _cut(tmp_path / "refuse", frames, unfixed="refuse")
    assert refused["status"] == "failed" and refused["error"].startswith(
        "video-loop: a part pops at the loop's wrap — film this direction again (part-pop) — the part at")
    assert refused["retake"]["reason"] == "part-pop"
    # the loop the pop is named in is the bytes it is with no part read at all
    _unread(monkeypatch)
    _cut(tmp_path / "unread", frames)
    assert _files(tmp_path / "warn") == _files(tmp_path / "unread")


# --- the search, on a clip: a front walker whose fist drifts ---------------------------------------------------------

FRAMES, CYCLE = 73, 26


def _front(k: float, hand: float) -> Image.Image:
    """The front walker of tests/video/test_loop_overlap.py with its tail on the walk's own beat, and a fist held out at
    its right `hand` px aside of its place, held where it is as the body bobs."""
    from tests.video.test_loop_overlap import _walker as front_walker

    phase = 2 * math.pi * k / CYCLE
    im = front_walker(k, (12 * math.sin(phase), 6 * math.cos(phase)))
    d = ImageDraw.Draw(im)
    cx, y = 150, 40 + round(2 * math.cos(2 * 2 * math.pi * (k + 5) / CYCLE))
    hx, hy = cx + 46 + hand, 100
    d.line((cx + 20, y + 40, hx - 4, hy), fill=(225, 225, 225, 255), width=5)
    d.ellipse((hx - 7, hy - 6, hx + 7, hy + 6), fill=(240, 205, 170, 255), outline=(30, 20, 20, 255), width=2)
    d.line((hx + 1, hy - 4, hx + 1, hy + 4), fill=(120, 70, 50, 255), width=2)
    return im


def _drift(rate: float, until: int = FRAMES):
    """The fist's place at clip frame k: `rate` px a frame aside up to frame `until`, held there after."""
    return lambda k: rate * min(k, until)


def _search(root: Path, hand, **kw) -> dict:
    """The front walker's clip cut as `video-loop --state walk --anchor motion-auto` cuts it; the report."""
    keyed = _keyed(root, [_front(k, hand(k)) for k in range(FRAMES)])
    try:
        loop.run_loop(keyed, root / "out", fps=24.0, state="walk", min_len=None, max_len=None, n_out=None,
                      seam_max=loop.SEAM_RATIO_MAX, name="loop", report_path=root / "loop.json", anchor="motion-auto", **kw)
    except SystemExit as exc:
        (root / "exit.txt").write_text(str(exc))
    return json.loads((root / "loop.json").read_text())



@pytest.mark.slow
def test_a_clip_whose_fist_drifts_through_every_cut_keeps_the_search_s_cut_and_records_a_take_to_film_again(tmp_path, capsys, monkeypatch):
    """The fist drifts 0.18 px a frame through the whole clip: every cut of two steps, 26 frames, jumps it back 4.7 px at
    its wrap (3 % of the body). The search's cut is cut as it was, to the same bytes, and the pop is named: a take to
    film again, `remedy` `retake` (the search chose the cut)."""
    report = _search(tmp_path / "read", _drift(0.18))
    c = report["cycle"]
    assert report["status"] == "passed" and c["steps"] == {"count": 2, "by": "crossings"} and c["length"] == CYCLE
    assert "part_gate" not in c and "part_gate" not in (c.get("step_count") or {})
    pop = report["part_pop"]
    assert pop["outcome"] == "named" and pop["left"]
    retake = report["retake"]
    assert (retake["reason"], retake["remedy"]) == ("part-pop", "retake")
    assert retake["part_pop"]["searched"] is True and retake["part_pop"]["cut"] == [c["start"], c["length"]]
    err = capsys.readouterr().err
    assert ("film this direction again (part-pop) — the part at" in err
            and "the search's cut is kept as cut, and no other cut is taken for a part: film it again; --unfixed refuse "
                "refuses such a loop" in err)
    _unread(monkeypatch)
    unread = _search(tmp_path / "unread", _drift(0.18))
    assert unread["cycle"]["start"] == c["start"] and _files(tmp_path / "read") == _files(tmp_path / "unread")


@pytest.mark.slow
def test_a_clip_no_part_pops_in_is_cut_to_the_bytes_it_was(tmp_path, monkeypatch):
    """The fist held still: no part pops, nothing is recorded to film again, and the loop is the bytes it is with no part
    read at all."""
    report = _search(tmp_path / "read", _drift(0.0))
    assert report["status"] == "passed" and report["part_pop"]["outcome"] == "none" and report["retake"] is None
    _unread(monkeypatch)
    unread = _search(tmp_path / "unread", _drift(0.0))
    assert unread["cycle"]["start"] == report["cycle"]["start"] and _files(tmp_path / "read") == _files(tmp_path / "unread")
