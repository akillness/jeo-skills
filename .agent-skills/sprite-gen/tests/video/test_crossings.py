# SPDX-License-Identifier: Apache-2.0
"""The step count of a walk's cut, read only from the crossings the clip shows (sprite_gen/video/crossings.py,
docs/loop-repair.md section 3, "The step count").

Each bait is a way something the clip never showed could pass for a step: a walk that stalls, a stand with the feet
together, a stomp, the stance a clip opens on, a pass the clip's first frame cuts, a wrap half a step off, a wrap
that slips a frame of feet together in, noise at the reading's threshold, a stop wobbling at the axis, a clip that
ends on a change it never confirms. Two readings that counted them as two steps were refused before this one: one
divided a cut's length by the median step (a cut with no crossing counted two), one read the loop as played, its
wrap included (a side change the wrap made counted as a crossing). Each bait names the cuts they took for two.

The signals are synthetic: the foot band's gap (`gap`, seen apart from 0.03 of the body's height), its lean about
the body's axis (`lean`, a step a half wave) and its mass."""

from __future__ import annotations

import math

import numpy as np
import pytest
from PIL import Image, ImageDraw

from sprite_gen.video import crossings, legs


def _gap_walk(n: int, centres: list[int], width: int = 2, still: tuple[tuple[int, int], ...] = ()) -> dict[str, list[float]]:
    """Feet together for 2 x width + 1 frames about each centre, apart (0.1 of the height) between; the foot band
    moving throughout but over the `still` frames, held as the frame before them (the first moving one for a head)."""
    gap = np.full(n, 0.1)
    for c in centres:
        gap[max(0, c - width):c + width + 1] = 0.0
    t = np.arange(n, dtype=float)
    mass, lean = 1.0 + 0.5 * np.cos(2 * np.pi * t / 15), np.sin(np.pi * t / 15)
    for a, b in still:
        src = a - 1 if a > 0 else b + 1
        mass[a:b + 1], lean[a:b + 1] = mass[src], lean[src]
    return {"gap": list(gap), "lean": list(lean), "mass": list(mass)}


def _sine(n: int, half: int = 13) -> np.ndarray:
    """The nearer foot changing side every `half` frames."""
    return np.sin(np.pi * (np.arange(n) + .5) / half)


def _sign_walk(lean: np.ndarray) -> dict[str, list[float]]:
    return {"gap": [0.0] * len(lean), "lean": list(lean), "mass": [1.0] * len(lean)}


def _points(n: int, at: list[int]) -> crossings.Reading:
    return crossings.Reading(n, "points", [(x, x) for x in at])


def _verdicts(reading: crossings.Reading, cases: dict[tuple[int, int], str]) -> dict[tuple[int, int], str]:
    return {cut: reading.judge(*cut)["verdict"] for cut in cases}


# --- stalls: a cut that plays a step the walk does not take ------------------------------------------------------

def test_a_walk_that_stalls_proves_no_two_steps_across_the_stall():
    """Crossings 5, 20, 35, 80, 95, 110: the walk stalls between 35 and 80. A cut with no crossing (40/30), one that
    plays the stall on either side of its wrap and one that ends where the stall starts its step are not two; the
    length reading counted 40/30, 30/30 and 6/31 two, the loop reading 6/31."""
    cases = {(40, 30): "uncertain", (30, 30): "uncertain", (33, 50): "uncertain", (18, 40): "uncertain",
             (6, 31): "uncertain", (6, 30): "two", (2, 30): "two", (7, 15): "refuted", (82, 30): "two"}
    assert _verdicts(_points(116, [5, 20, 35, 80, 95, 110]), cases) == cases
    assert _points(116, [5, 20, 35, 80, 95, 110]).judge(40, 30)["code"] == "step-long"


def test_a_hold_after_the_cut_is_read_on_both_sides_of_the_wrap():
    """The nearer foot changes side every 13 frames and holds from 135 to 174. The loop reading counted 117/26,
    112/26 and 110/30 two: the wrap flips the foot back, and the step before the cut (115.5 to 130.5, 15 frames) is
    ordinary. The step after it is the hold (130.5 to 174.5, 44 frames): not two."""
    lean = _sine(400)
    lean[135:175] = lean[134]
    reading = crossings.read(_sign_walk(lean))
    cases = {(117, 26): "uncertain", (112, 26): "uncertain", (110, 30): "uncertain", (100, 30): "two", (60, 26): "two"}
    assert _verdicts(reading, cases) == cases


def test_a_hold_before_the_cut_leaves_no_two_anywhere_near_it():
    """The mirror: a hold from 200 to 239, one change after it; every cut from 222 to 241, 22 to 30 frames long. The
    loop reading took 16 of the 180 for two, the length reading 104."""
    lean = _sine(400)
    lean[200:240] = lean[199]
    reading = crossings.read(_sign_walk(lean))
    assert not [(s, L) for s in range(222, 242) for L in range(22, 31) if reading.judge(s, L)["verdict"] == "two"]


def test_a_stall_with_the_feet_apart_and_a_stand_with_them_together():
    """No crossing from 37 to 82 with the feet apart (the length reading counted 45/30 and 30/30 two); the feet
    together from 50 to 89 (the loop reading, joining the run across its wrap, counted 23/30 two)."""
    cases = {(45, 30): "uncertain", (30, 30): "uncertain", (0, 30): "two"}
    assert _verdicts(crossings.read(_gap_walk(110, [7, 22, 37, 82, 97])), cases) == cases
    sig = _gap_walk(150, [7, 22, 37, 97, 112, 127, 142])
    sig["gap"][50:90] = [0.0] * 40
    stand = crossings.read(sig)
    cases = {(23, 30): "uncertain", (8, 30): "two", (99, 30): "two"}
    assert _verdicts(stand, cases) == cases
    assert stand.judge(23, 30)["code"] in ("stand", "step-long")


def test_a_stomp_in_place_is_a_step_out_of_range():
    """The foot set down again in place 7 frames after the pass at 37: the loop reading counted 46/30 two."""
    sig = _gap_walk(100, [7, 22, 37, 52, 67, 82])
    sig["gap"][44:46] = [0.0, 0.0]
    cases = {(30, 30): "uncertain", (46, 30): "uncertain", (53, 30): "two"}
    assert _verdicts(crossings.read(sig), cases) == cases


# --- the clip's head and tail -------------------------------------------------------------------------------------

def test_the_stance_a_clip_opens_on_is_no_step():
    """Feet together 20 frames, or the lean held 40, before the walk starts: the length reading counted 5/30 and
    25/26 two."""
    sig = _gap_walk(100, [32, 47, 62, 77, 92])
    sig["gap"][0:20] = [0.0] * 20
    cases = {(5, 30): "uncertain", (35, 30): "two"}
    assert _verdicts(crossings.read(sig), cases) == cases
    lean = _sine(400)
    lean[:40] = lean[40]
    cases = {(25, 26): "uncertain", (60, 26): "two"}
    assert _verdicts(crossings.read(_sign_walk(lean)), cases) == cases


@pytest.mark.parametrize("sig, cases", [
    # Six frames seen, its twin five: longer than the pass it would be — a stance, unconfirmed.
    (dict(n=80, centres=[3, 18, 33, 48, 63], head=6), {(10, 30): "two", (2, 30): "uncertain"}),
    # A pass cut by the first frame, its twin whole, longer and moving like it: a crossing, its middle bounded.
    (dict(n=80, centres=[2, 17, 32, 47, 62]), {(4, 30): "two", (5, 15): "refuted"}),
    # As long as its twin but still: a stance, not a pass (the loop reading counted 4/30 two).
    (dict(n=80, centres=[2, 17, 32, 47, 62], still=((0, 4),)), {(4, 30): "uncertain", (6, 30): "two"}),
])
def test_a_run_the_first_frame_cuts_counts_only_where_its_twin_confirms_it(sig, cases):
    walk = _gap_walk(sig["n"], sig["centres"], still=sig.get("still", ()))
    if "head" in sig:
        walk["gap"][0:sig["head"]] = [0.0] * sig["head"]
    assert _verdicts(crossings.read(walk), cases) == cases


def test_a_change_the_clip_ends_on_before_the_other_side_is_seen_is_unseen():
    lean = _sine(105)
    lean[100:] = 0.15  # past the axis, short of the tenth of the swing a side needs
    reading = crossings.read(_sign_walk(lean))
    assert _verdicts(reading, {(77, 26): "", (70, 26): ""}) == {(77, 26): "uncertain", (70, 26): "two"}
    assert reading.judge(77, 26)["code"] == "partial"


# --- the wrap ---------------------------------------------------------------------------------------------------

def test_the_wrap_joins_the_walk_at_its_own_point():
    """Half a cycle (one step), three steps (the stomp of a cut a step and a half too long: the wrap puts the nearer
    foot back), a wrap half a step off, the open first step: only two steps joined in phase are two."""
    sign = crossings.read(_sign_walk(_sine(120)))
    cases = {(19, 13): "refuted", (19, 26): "two", (20, 27): "two", (19, 39): "refuted", (19, 33): "uncertain",
             (19, 20): "uncertain", (0, 26): "uncertain", (1, 26): "uncertain", (6, 26): "two"}
    assert _verdicts(sign, cases) == cases
    assert sign.judge(19, 13)["k"] == [1] and sign.judge(19, 39)["k"] == [3] and sign.judge(19, 33)["code"] == "seam"
    gap = crossings.read(_gap_walk(90, [7, 22, 37, 52, 67, 82]))
    cases = {(10, 30): "two", (7, 30): "two", (8, 28): "two", (6, 32): "two", (22, 16): "refuted", (15, 15): "refuted",
             (0, 45): "refuted", (10, 37): "uncertain"}
    assert _verdicts(gap, cases) == cases


def test_a_wrap_that_slips_feet_together_in_is_not_two():
    """Wide and narrow steps: 30/38 covers two steps, but its wrap joins the end of a
    pass to its own start, and the loop as played shows three runs of feet together."""
    reading = crossings.read(_gap_walk(90, [7, 27, 42, 62, 82], width=3))
    assert _verdicts(reading, {(30, 38): "", (31, 38): ""}) == {(30, 38): "uncertain", (31, 38): "two"}
    assert reading.judge(30, 38)["code"] == "ring" and reading.judge(30, 38)["ring"] == 3


def test_phase_is_how_far_the_wrap_is_from_the_walks_own_point_in_frames():
    reading = crossings.read(_sign_walk(_sine(120)))
    assert abs(reading.judge(19, 26)["phase"]) <= 0.5 and reading.in_phase(reading.judge(19, 26))
    assert reading.judge(20, 27)["verdict"] == "two" and 0 < reading.judge(20, 27)["phase"] <= crossings.PHASE_TOLERANCE


# --- what the reading cannot see, and what it does not read -------------------------------------------------------

def test_noise_at_the_threshold_and_a_wobble_at_the_axis_are_no_steps():
    sig = _gap_walk(110, [7, 22, 37, 82, 97])
    sig["gap"][40:80] = [0.022] * 40
    sig["gap"][50:53] = [0.018] * 3
    sig["gap"][65:68] = [0.018] * 3
    assert crossings.read(sig).judge(45, 30)["verdict"] == "uncertain"
    lean = _sine(300)
    lean[100:160] *= 0.03
    assert crossings.read(_sign_walk(lean)).judge(110, 26)["verdict"] == "uncertain"


@pytest.mark.parametrize("hold, verdict", [(4, "two"), (8, "uncertain")])
def test_a_hold_inside_a_step_the_range_absorbs_stays_two(hold, verdict):
    """The limit by design: a 13-frame step held 4 frames is 17, inside the step range — two; held 8, outside."""
    lean = _sine(200)
    lean[60:60 + hold] = lean[59]
    lean[60 + hold:] = _sine(200 - hold)[60:]
    assert crossings.read(_sign_walk(lean)).judge(45, 26 + hold)["verdict"] == verdict


def test_two_crossings_set_no_step_range():
    reading = _points(60, [20, 40])
    assert not reading.readable and reading.judge(10, 40)["verdict"] == "uncertain"


def test_a_lean_that_does_not_turn_over_a_step_on_is_not_feet():
    """A body that wobbles about its axis, nothing stepping, changes side now and then, but a step on its lean has
    not turned over: not read, so nothing is counted on it."""
    lean = np.random.default_rng(7).normal(0, 1, 150)
    reading = crossings.read(_sign_walk(lean))
    assert len(reading.crossings) >= 3 and not reading.readable and "does not turn over" in reading.why
    assert reading.judge(10, 40)["code"] == "unread"
    walk = crossings.read(_sign_walk(_sine(120)))
    assert walk.readable and walk.alternation is not None and walk.alternation <= crossings.ALTERNATION_MAX


def test_a_body_that_never_parts_its_feet_and_never_leans_reads_nothing():
    still = crossings.read({"gap": [0.0] * 60, "lean": [0.0] * 60, "mass": [1.0] * 60})
    assert not still.readable and still.twos(8, 60) == []


def test_every_two_lies_in_the_lengths_two_steps_can_cover():
    reading = crossings.read(_gap_walk(90, [7, 22, 37, 52, 67, 82]))
    every = [(s, L) for L in range(8, 91) for s in range(91 - L) if reading.judge(s, L)["verdict"] == "two"]
    assert every and all(L in reading.lengths(1, 90) for _, L in every)
    assert [tuple(r["cut"]) for r in reading.twos(1, 90)] == sorted(every, key=lambda c: (c[1], c[0]))


# --- the signals off the frames -----------------------------------------------------------------------------------

def _frame(drop: float, apart: float) -> Image.Image:
    """A body over two legs: the left foot `drop` px lower than the right, the legs `apart` px apart."""
    im = Image.new("RGBA", (200, 200))
    d = ImageDraw.Draw(im)
    d.rectangle((80, 20, 120, 110), fill=(200, 80, 80, 255))
    d.rectangle((88 - apart / 2, 110, 99 - apart / 2, 170 + drop), fill=(60, 60, 70, 255))
    d.rectangle((101 + apart / 2, 110, 112 + apart / 2, 170), fill=(60, 60, 70, 255))
    return im


def test_the_foot_bands_lean_and_gap_off_the_frames():
    sig = crossings.foot_signals([_frame(0, 0), _frame(8, 0), _frame(0, 30)])
    assert sig["gap"] == legs.strike_signals([_frame(0, 0), _frame(8, 0), _frame(0, 30)])["gap"]
    assert abs(sig["lean"][0]) < 0.05 and sig["lean"][1] > 0.2  # the lower foot fills the band
    assert sig["gap"][2] >= legs.FEET_APART > sig["gap"][0]
    assert all(m > 0 for m in sig["mass"])
    with pytest.raises(ValueError, match="no solid body"):
        crossings.foot_signals([Image.new("RGBA", (10, 10))])
    assert math.isclose(crossings.SEAM_BAND[1] - crossings.SEAM_BAND[0], math.sqrt(2) - 1 / math.sqrt(2))
