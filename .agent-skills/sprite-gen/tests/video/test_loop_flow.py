# SPDX-License-Identifier: Apache-2.0
"""The flow reading (docs/loop-repair.md section 2, "The flow reading"): a frame is taken when it lies off
the path its neighbours draw — against the way a part is going, or a sudden change of its speed — not
when its step is large. An ordinary walk, whose legs swing fast and plant slow, has no frame taken; a
frame whose tail is flung against its sway is the one frame taken; a tail that snaps back at a wrap
that does not close has the frames at the wrap taken; and which way the body faces does not matter.
The repair (`repair.repair_jumps`) takes those frames out and makes them again between the frames
either side, each at its own time: the loop keeps its length, and a loop on twos its hold.

The loops are drawn here: a body, two legs swinging quick through the swing and slow through the
stance, an arm, and a tail behind that sways once a cycle."""

from __future__ import annotations

import math

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageOps

from sprite_gen.video import repair

W, H, N = 240, 300, 36
SIZE_JUMP = 1.4  # a step this many times the loop's median: the size reading's jump, which picked frames before the flow reading


def _frame(t: float, n: int, *, tail_off: float = 0.0, tail_lag: float = 0.0, dark_whole: bool = False) -> Image.Image:
    """Phase t/n of one gait cycle; `tail_off` puts the tail that many px off its sway, `tail_lag` its sway
    that many cycles behind. The arm is drawn over the torso's outline and the second leg over the first leg (as dark
    as a line) and foot, each covering more or less of them by the phase; `dark_whole` draws the arm behind the torso,
    the first leg lighter than a line and both feet over both legs, so every phase shows its dark parts whole."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    phi = 2 * math.pi * t / n
    bob = 3 * math.cos(2 * phi)
    sway = phi - 2 * math.pi * tail_lag
    tx, ty = 70 + 22 * math.sin(sway) + tail_off, 130 + bob - 10 * math.cos(sway)
    d.polygon([(110, 120 + bob), (110, 150 + bob), (tx - 20, ty + 20), (tx - 30, ty - 25)], fill=(220, 120, 40, 255))
    d.ellipse((tx - 50, ty - 40, tx - 10, ty + 10), fill=(240, 150, 60, 255))
    arm = 0.4 * math.sin(phi + math.pi + 0.6 * math.sin(phi)) + 0.3
    if dark_whole:
        d.line((150, 110 + bob, 150 + 60 * math.sin(arm), 110 + bob + 60 * math.cos(arm)), fill=(240, 210, 180, 255), width=12)
    # quick through the swing, slow through the stance: the coverage step varies a lot over an ordinary cycle
    swing = 0.5 * math.sin(phi + 0.6 * math.sin(phi))
    feet = []
    near = (80, 70, 130, 255) if dark_whole else (70, 60, 120, 255)  # the darker is as dark as a line
    for hip, angle, colour in ((120, swing, near), (128, -swing, (90, 80, 150, 255))):
        x1, y1 = hip + 95 * math.sin(angle), 175 + bob + 95 * math.cos(angle)
        d.line((hip, 175 + bob, x1, y1), fill=colour, width=16)
        feet.append((x1 - 12, y1 - 7, x1 + 14, y1 + 7))
        if not dark_whole:
            d.ellipse(feet[-1], fill=(40, 30, 30, 255))
    for foot in feet if dark_whole else ():
        d.ellipse(foot, fill=(40, 30, 30, 255))
    d.rectangle((100, 100 + bob, 150, 185 + bob), fill=(200, 200, 220, 255), outline=(20, 20, 20, 255), width=3)
    d.ellipse((96, 40 + bob, 156, 102 + bob), fill=(240, 210, 180, 255), outline=(20, 20, 20, 255), width=3)
    if not dark_whole:
        d.line((150, 110 + bob, 150 + 60 * math.sin(arm), 110 + bob + 60 * math.cos(arm)), fill=(240, 210, 180, 255), width=12)
    return im


def _against(t: int, n: int) -> float:
    """The sign against the tail's sway at frame t: the way it is not going."""
    return -math.copysign(1.0, math.cos(2 * math.pi * t / n))


def _loop(n: int = N, *, flung: dict[int, float] | None = None, lag: float = 0.0, hold: int = 1) -> list[Image.Image]:
    """A walk loop of n frames. `flung[t]` puts the tail at frame t that many px against its sway; `lag`
    makes the tail run that many cycles short over the loop, so it snaps back at the wrap. `hold` 2 films
    it on twos: each drawing shown for two frames (a drawing flung is flung in both)."""
    flung = flung or {}
    drawn = [t - t % hold for t in range(n)]
    return [_frame(d, n, tail_off=_against(d, n) * flung.get(d, 0.0), tail_lag=lag * d / n) for d in drawn]


def test_an_ordinary_walk_has_no_frame_off_its_flow_where_the_size_reading_names_jumps():
    frames = _loop()
    record = repair.flow_targets(frames)
    assert record["groups"] == [] and record["unfixed"] == []
    assert record["off_max_before"] < repair.FLOW_LIMIT
    # The size reading counts how much a step changes: the quick swing reads as a jump to it.
    assert (repair.jump_scores(frames)["score"] >= SIZE_JUMP).sum() >= 5


def test_a_frame_flung_against_the_sway_is_the_one_frame_taken():
    frames = _loop(flung={10: 12})
    scores = repair.flow_scores(frames)
    assert int(scores["off"].argmax()) == 10 and scores["turn"][10] < 0  # it goes back the way it came
    record = repair.flow_targets(frames)
    assert [g["frames"] for g in record["groups"]] == [[10]] and record["unfixed"] == []
    group = record["groups"][0]
    assert group["off"] >= repair.FLOW_LIMIT > group["off_after"] and group["turn"] < 0
    x0, y0, x1, y1 = group["window"]
    assert x0 < 0.45 and y0 < 0.5  # read where the tail is: behind the body, above the legs


def test_a_tail_that_snaps_back_at_the_wrap_has_the_frames_at_the_wrap_taken():
    frames = _loop(lag=0.25)
    record = repair.flow_targets(frames)
    assert len(record["groups"]) == 1 and record["unfixed"] == []
    assert set(record["groups"][0]["frames"]) <= {N - 1, 0}


def test_it_reads_the_same_whichever_way_the_body_faces():
    frames = _loop(flung={10: 12})
    mirrored = [ImageOps.mirror(f) for f in frames]
    assert [g["frames"] for g in repair.flow_targets(mirrored)["groups"]] == [[10]]


def test_a_walk_on_twos_is_read_on_its_drawings():
    # Each drawing shown twice: a step of nothing then a step of two, at every drawing. On its drawings the
    # path is as smooth as the walk drawn every frame, and a drawing flung is the two frames that show it.
    frames = _loop(hold=2)
    record = repair.flow_targets(frames)
    assert record["hold"] == 2 and record["drawings"] == N // 2
    assert record["groups"] == [] and record["off_max_before"] < repair.FLOW_LIMIT
    # A drawing's step is two frames' step: flung as far against its sway, it is half as far off its path.
    record = repair.flow_targets(_loop(flung={10: 20}, hold=2))
    assert [g["frames"] for g in record["groups"]] == [[10, 11]]
    scores = repair.flow_scores(_loop(flung={10: 20}, hold=2))
    assert scores["off"][10] == scores["off"][11] == scores["off"].max()


def test_two_flung_frames_in_a_row_are_one_group_of_two():
    # Two frames flung as far are a plateau: each of its edges half as far off the path as one flung frame.
    record = repair.flow_targets(_loop(flung={10: 20, 11: 20}))
    assert [sorted(g["frames"]) for g in record["groups"]] == [[10, 11]]


def test_two_frames_flung_with_one_between_are_two_groups_or_named_unfixed():
    # One made, the frame between reads under the limit: each its own group. Flung farther, the frame between still
    # reads over it while the other stands, no group of up to two straightens either, and they are kept, named.
    record = repair.flow_targets(_loop(flung={12: 20, 14: 20}))
    assert sorted(g["frames"] for g in record["groups"]) == [[12], [14]] and record["unfixed"] == []
    record = repair.flow_targets(_loop(flung={12: 30, 14: 30}))
    assert record["groups"] == [] and {12, 13, 14} <= {t for u in record["unfixed"] for t in u["frames"]}


def test_each_flung_frame_is_a_group_of_its_own_never_made_from_a_frame_taken_before():
    record = repair.flow_targets(_loop(flung={4: 20, 14: 20, 24: 20}))
    assert sorted(g["frames"] for g in record["groups"]) == [[4], [14], [24]] and record["unfixed"] == []
    taken: set[int] = set()
    for group in record["groups"]:
        frames = group["frames"]
        beside = {(frames[0] - 1) % N, (frames[-1] + 1) % N}
        assert not (set(frames) | beside) & taken
        taken |= set(frames)


def test_a_jump_its_span_does_not_close_is_named_unfixed():
    frames = _loop(lag=0.25)
    record = repair.flow_targets(frames, span=1, limit=1.5)
    assert record["unfixed"] and all(u["off_after"] >= 1.5 for u in record["unfixed"])
    assert all(set(u["frames"]) <= {N - 2, N - 1, 0, 1} for u in record["unfixed"])


def test_a_loop_too_short_to_read_is_left_alone():
    record = repair.flow_targets(_loop(3))
    assert record["groups"] == [] and record["stopped"] == "loop shorter than 4 drawings"


def test_a_loop_with_no_body_raises():
    with pytest.raises(ValueError, match="fully transparent"):
        repair.flow_states([Image.new("RGBA", (40, 40))] * 6)


# --- the repair: the frames off the flow taken out and made again (docs/loop-repair.md section 2) ----------------


class Between:
    """A stand-in RIFE: the walker as drawn at the time t of the way from frame a to frame b of `filmed` (found
    by identity), with no tail flung. Records each call as (a, b, t) and keeps what it made. (The walker's own
    frames 10 and 34 read a smear against their neighbours — the arm drawn over the torso's outline — so the
    frames flung here are others.)"""

    def __init__(self, filmed: list[Image.Image], n: int = N):
        self.at = {id(f): k for k, f in enumerate(filmed)}
        self.n = n
        self.calls: list[tuple[int, int, float]] = []
        self.made: list[Image.Image] = []

    def __call__(self, a: Image.Image, b: Image.Image, t: float) -> Image.Image:
        ka, kb = self.at[id(a)], self.at[id(b)]
        self.calls.append((ka, kb, round(t, 4)))
        self.made.append(_frame(ka + t * ((kb - ka) % self.n), self.n))
        return self.made[-1]


def test_the_repair_leaves_an_ordinary_walk_alone_where_the_size_reading_names_jumps():
    frames = _loop()
    between = Between(frames)
    out, record = repair.repair_jumps(frames, between)
    assert record["replaced"] == [] and between.calls == [] and all(o is f for o, f in zip(out, frames))
    assert record["off_max_before"] == record["off_max_after"] < repair.FLOW_LIMIT
    assert (repair.jump_scores(frames)["score"] >= SIZE_JUMP).sum() >= 5


def test_the_repair_takes_the_flung_frame_out_and_makes_it_again_between_its_neighbours():
    frames = _loop(flung={12: 12})
    between = Between(frames)
    out, record = repair.repair_jumps(frames, between)
    assert record["replaced"] == [12] and between.calls == [(11, 13, 0.5)]
    assert len(out) == N and out[12] is between.made[0]
    assert all(out[k] is frames[k] for k in range(N) if k != 12)  # every other frame stays the video's own
    (round_,) = record["rounds"]
    assert round_["why"] == "flow" and round_["outcome"] == "accepted" and round_["frames"] == [12]
    assert round_["neighbours"] == [11, 13] and round_["t"] == [0.5] and round_["turn"] < 0
    assert record["off_max_before"] >= repair.FLOW_LIMIT > record["off_max_after"]


def test_two_flung_frames_in_a_row_are_made_again_as_two_each_at_its_own_time():
    frames = _loop(flung={12: 20, 13: 20})
    between = Between(frames)
    out, record = repair.repair_jumps(frames, between)
    assert record["replaced"] == [12, 13] and record["attempts"] == 2
    assert between.calls == [(11, 14, 0.3333), (11, 14, 0.6667)]  # a third and two thirds of the way: their own times
    assert len(out) == N and out[12] is between.made[0] and out[13] is between.made[1]


def test_on_twos_a_flung_drawing_is_made_once_and_shown_for_both_its_frames():
    frames = _loop(flung={12: 20}, hold=2)
    between = Between(frames)
    out, record = repair.repair_jumps(frames, between)
    # The drawing before shows from frame 10, the one after from frame 14: the drawing made is half way, held as filmed.
    assert record["replaced"] == [12, 13] and between.calls == [(10, 14, 0.5)] and record["attempts"] == 1
    assert out[12] is out[13] is between.made[0] and len(out) == N
    assert all(out[k] is frames[k] for k in range(N) if k not in (12, 13))
    assert record["rounds"][0]["drawings"] == [[12, 13]] and record["hold"] == 2


@pytest.mark.slow
def test_a_group_with_a_frame_at_fault_keeps_every_frame_it_would_take_and_is_not_tried_again():
    frames = _loop(flung={12: 20, 13: 20})
    between = Between(frames)

    def melted(a: Image.Image, b: Image.Image, t: float) -> Image.Image:
        made = between(a, b, t)
        if t < 0.5:
            return made
        pixels = np.asarray(made).copy()
        dark = (pixels[..., :3].max(axis=2) < 70) & (pixels[..., 3] > 0)
        pixels[dark, :3] = (200, 200, 220)  # the outlines melted into the fill
        return Image.fromarray(pixels, "RGBA")

    out, record = repair.repair_jumps(frames, melted)
    assert record["replaced"] == [] and all(o is f for o, f in zip(out, frames))
    (round_,) = record["rounds"]
    assert round_["outcome"] == "rejected" and "outline" in round_["faults"] and round_["frames"] == [12, 13]
    assert [m["faults"] for m in round_["made"]][0] == [] and "outline" in round_["made"][1]["faults"]
    assert record["attempts"] == len(between.calls) == 2  # both calls spent; the group is not made again


def test_the_calls_go_to_the_worst_frame_first_and_stop_at_the_budget():
    frames = _loop(flung={4: 20, 14: 20, 24: 20, 32: 20})
    between = Between(frames)
    out, record = repair.repair_jumps(frames, between)
    assert len(record["replaced"]) == record["attempts"] == repair.MAX_REPAIRS == len(between.calls)
    assert set(record["replaced"]) < {4, 14, 24, 32} and record["stopped"] == f"{repair.MAX_REPAIRS} interpolation calls used"
    offs = [r["off"] for r in record["rounds"]]
    assert offs == sorted(offs, reverse=True)
    (left,) = record["left"]
    assert set(left["frames"]) | set(record["replaced"]) == {4, 14, 24, 32}


def test_without_an_interpolator_the_first_group_is_named_and_nothing_is_made():
    frames = _loop(flung={12: 12})
    out, record = repair.repair_jumps(frames, None)
    assert record["replaced"] == [] and all(o is f for o, f in zip(out, frames))
    assert record["unmade"]["frames"] == [12] and record["unmade"]["off"] >= repair.FLOW_LIMIT
    assert record["stopped"] == "a frame to make off the flow and no interpolator"


def test_the_repair_reads_the_same_whichever_way_the_body_faces():
    frames = [ImageOps.mirror(f) for f in _loop(flung={12: 12})]
    calls: list[float] = []
    out, record = repair.repair_jumps(frames, lambda a, b, t: calls.append(t) or ImageOps.mirror(_frame(12, N)))
    assert record["replaced"] == [12] and calls == [0.5]
