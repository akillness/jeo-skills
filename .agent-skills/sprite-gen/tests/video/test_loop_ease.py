# SPDX-License-Identifier: Apache-2.0
"""The eased retime (docs/loop-repair.md section 2, "The eased retime"): where a part rushes — a run of one or
two steps far faster than the steps around it, going the way it was going — the frames either side are made
again at times the search chooses, so the part's speed rises and falls gradually; the body's feet, torso and
ground line move no further in a step than they did anywhere in that stretch, nor any window of the rest of the
body further than its own largest step there, read on the frames made; the loop keeps its length, and every
frame outside the stretch is the video's own. A frame flung against the way is the flow repair's, not a rush;
an ordinary walk has none.

The loops are the walker of tests/video/test_loop_flow.py, whose tail can run short of the cycle so that it
rushes on at the wrap (`lag`). The interpolator is a stand-in that draws the walker between two frames the way
an optical-flow in-between does: the body at the time between them, the tail moved on between its two places.
Drawn over 36 frames a cycle, the stand-in's frames made at the times the search chooses step further in the
legs, the arm and the head than the line between the frames as filmed the search reads them on, and every such
stretch is refused on the frames made. The walkers drawn over 14 to 48 frames have frames made that keep the rest
of the body within its own steps.

A frame made is the whole picture at one time, the legs with the tail: the time that spreads the tail's rush
stops the legs where the tail is given its time and hurries them on after. A stretch is delivered only where the
rest of the body keeps its own beat on the frames made, step by step (`repair.EASE_BEAT`), and on every walker
here it does not: the stretch is read, made and recorded, and refused for that, and the loop stays as the flow
repair left it, the legs on their steps as filmed. The tests that took these stretches (2.45.0) read the same
stretches and their frames made, and now say they are refused; with the beat bound lifted, one is played as made."""

from __future__ import annotations

import json
import math

import numpy as np
import pytest
from PIL import Image, ImageOps

from sprite_gen.video import loop as loop_mod
from sprite_gen.video import repair
from tests.video.test_loop_flow import N, _against, _frame, _loop
from tests.video.test_loop_repair import _keyed, _no_rife

LAG = 0.25  # the tail a quarter of a cycle short: the flow repair takes one frame at the wrap, and a rush is left
WRAP = 24  # frames a cycle of the walker eased after the flow repair's frame at the wrap
SHORT, SHORT_LAG = 16, 0.15  # a walker whose tail rushes at the wrap under the flow reading's limit


def _walk(n: int = N, *, lag: float = 0.0, hold: int = 1, flung: dict[int, float] | None = None) -> list[Image.Image]:
    """`_loop` of tests/video/test_loop_flow.py with every dark part drawn whole (`dark_whole`), so that a
    frame drawn between two phases has no more dark pixels than they have (the smear reading counts them)."""
    flung = flung or {}
    drawn = [t - t % hold for t in range(n)]
    return [_frame(d, n, tail_off=_against(d, n) * flung.get(d, 0.0), tail_lag=lag * d / n, dark_whole=True) for d in drawn]


class Lerp:
    """A stand-in RIFE for the walker: between filmed frames a and b at t, the body at the time t of the way from
    a to b and the tail moved on t of the way from its place in a to its place in b (forward, as it sways). Records
    each call as (a, b, t) by the filmed frames' indices, and refuses a frame it did not film."""

    def __init__(self, filmed: list[Image.Image], *, lag: float = 0.0, hold: int = 1, n: int = N):
        self.at = {id(f): k for k, f in enumerate(filmed)}
        self.n, self.lag, self.hold = n, lag, hold
        self.calls: list[tuple[int, int, float]] = []
        self.made: list[Image.Image] = []

    def _sway(self, k: int) -> float:
        d = k - k % self.hold
        return 2 * math.pi * d * (1 - self.lag) / self.n

    def __call__(self, a: Image.Image, b: Image.Image, t: float) -> Image.Image:
        ka, kb = self.at[id(a)], self.at[id(b)]  # KeyError: made from a frame that was not filmed
        self.calls.append((ka, kb, round(t, 4)))
        da, db = ka - ka % self.hold, kb - kb % self.hold
        body = da + t * ((db - da) % self.n)
        sa, sb = self._sway(ka), self._sway(kb)
        while sb < sa:
            sb += 2 * math.pi
        sway = sa + t * (sb - sa)
        self.made.append(_frame(body, self.n, tail_lag=(2 * math.pi * body / self.n - sway) / (2 * math.pi),
                                dark_whole=True))
        return self.made[-1]


def _drift(frames: list[Image.Image], segment: list[int], torso: repair.Torso) -> np.ndarray:
    """The largest step over the segment's steps, in play order, of where the body stands: the foot line's centre,
    the torso (`torso`: the head and torso the motion anchor tracks) and the lowest solid row."""
    points = [repair.drift_points(frames[k], torso) for k in segment]
    return np.max(np.abs(np.diff(points, axis=0)), axis=0)


def _ease(record: dict) -> dict:
    (round_,) = [r for r in record["rounds"] if r["why"] == "ease"]
    return round_


def _rest(frames: list[Image.Image], before: list[Image.Image], after: list[Image.Image], round_: dict
          ) -> tuple[np.ndarray, np.ndarray]:
    """Every window the rush is not read in, its largest step over the stretch on the loop `before` the ease and on the
    loop `after` it: the flow reading's own steps, on the union box of `frames` (the loop as filmed) and the drawings of
    `before`."""
    box = repair.union_box(frames)
    flow = repair._flow(before, box)
    then = repair._flow(after, box, (flow["runs"], flow["hold"]))
    first = [run[0] for run in flow["runs"]]
    stretch = [first.index(k) for k in (round_["anchors"][0], *(d[0] for d in round_["drawings"]), round_["anchors"][1])]
    part = [w for w, fraction in enumerate(flow["fractions"]) if [round(v, 4) for v in fraction] in round_["part"]["windows"]]
    rest = [w for w in range(len(flow["windows"])) if w not in part]
    return flow["step"][stretch[:-1]][:, rest].max(axis=0), then["step"][stretch[:-1]][:, rest].max(axis=0)


def _kept_rest(frames: list[Image.Image], flow_only: list[Image.Image], out: list[Image.Image], round_: dict) -> None:
    """The stretch taken kept every window the rush is not read in within the largest step it took over the stretch as
    it played, read again here on the loop as it now plays, and the round says so (`rest`)."""
    before, after = _rest(frames, flow_only, out, round_)
    assert np.all(after <= before + 1e-9)
    assert round_["rest"]["faster"] == [] and len(round_["rest"]["windows"]) == len(before)
    assert all(a <= b + 1e-4 for a, b in zip(round_["rest"]["step_max_after"], round_["rest"]["step_max_before"]))


def _made(loop: list[Image.Image], frames: list[Image.Image], round_: dict, made: list[Image.Image]) -> list[Image.Image]:
    """The loop a stretch would have played, taken or refused: `loop` as the flow left it, each drawing of the stretch
    shown as it was made — the interpolator's last `calls` frames `made`, in order — or as the frame as filmed its time
    falls on."""
    new, calls = list(loop), iter(made[len(made) - round_["calls"]:])
    for row in round_["made"]:
        if row["from"] is None:
            continue
        frame = next(calls) if row["proposal"] is not None else frames[row["from"][0]]
        for k in row["frames"]:
            new[k] = frame
    return new


LEGS = {"near leg": (80, 70, 130), "far leg": (90, 80, 150), "feet": (40, 30, 30)}  # the walker's colours, dark parts whole
BEAT = 0.25  # of a leg's ordinary step: a step of the legs this far off the same step as filmed is off the walk's beat


def _legs(frames: list[Image.Image]) -> dict[str, np.ndarray]:
    """Per step of the loop as it plays (cyclic), how far each leg and the feet move: the centre of their colour, px."""
    centres = []
    for f in frames:
        p = np.asarray(f)
        at = {}
        for part, colour in LEGS.items():
            ys, xs = np.nonzero((p[..., 3] > 0) & np.all(p[..., :3] == colour, axis=-1))
            at[part] = np.array([xs.mean(), ys.mean()])
        centres.append(at)
    n = len(frames)
    return {part: np.array([np.linalg.norm(centres[(k + 1) % n][part] - centres[k][part]) for k in range(n)]) for part in LEGS}


def _legs_off(frames: list[Image.Image], loop: list[Image.Image]) -> float:
    """How far a step of the legs or the feet over `loop` as it plays is off the same step as filmed, at most, in their
    ordinary steps (the median of their steps as filmed that move)."""
    filmed, played = _legs(frames), _legs(loop)
    return max(float((np.abs(played[p] - filmed[p]) / np.median(filmed[p][filmed[p] > 0])).max()) for p in LEGS)


@pytest.mark.slow
def test_a_tail_that_rushes_on_at_the_wrap_is_spread_over_the_frames_either_side_and_refused_for_the_legs_beat():
    # 2.45.0 took this stretch. Its frames made spread the tail and keep the feet, the torso, the ground line and the rest
    # of the body within the stretch's own steps, and stop the legs where the tail is given its time: refused for the
    # legs' beat alone, and the loop is the flow repair's.
    n = WRAP
    frames = _walk(n, lag=LAG)
    flow_only, before = repair.repair_jumps(frames, Lerp(frames, lag=LAG, n=n), ease=False)
    assert [r["why"] for r in before["rounds"]] == ["flow"]  # the flow takes one frame at the wrap, and leaves a rush
    assert before["surge"] is not None and before["surge_after"] is not None
    lerp = Lerp(frames, lag=LAG, n=n)
    out, record = repair.repair_jumps(frames, lerp)
    round_ = _ease(record)
    assert round_["outcome"] == "rejected" and round_["rejected_for"] == ["the body off its beat"]
    assert round_["width"] in repair.EASE_WIDTHS
    segment = [*[round_["anchors"][0]], *round_["frames"], round_["anchors"][1]]
    assert [(k - segment[0]) % n for k in segment] == list(range(len(segment)))  # one stretch, in play order
    assert {n - 1, 0} <= set(round_["frames"]) and len(round_["frames"]) == 2 * round_["width"] + round_["surge"]["steps"] - 1
    # every frame is made from two frames as filmed, never from a frame made — the flow's frame at the wrap is made again
    flow_frames = set(before["rounds"][0]["frames"])
    assert flow_frames <= set(round_["frames"]) and round_["supersedes"] == sorted(flow_frames)
    assert all(not {a, b} & flow_frames for a, b, _ in lerp.calls)
    # on the frames made, the rush is spread: the part's largest step over the stretch falls by a quarter or more, its
    # speed changes less from step to step, and no rush is left
    made = _made(flow_only, frames, round_, lerp.made)
    assert round_["part"]["step_max_after"] <= 3 / 4 * round_["part"]["step_max_before"]
    assert round_["accel"]["chosen"] < round_["accel"]["before"] / 2 and repair.surges(made, box=repair.union_box(frames)) == []
    # no drift: the feet, the torso and the ground line move no further in a step than they did there, to within the pixel
    # they are read on — the torso read on the loop as filmed, as the round read it; the body's mass reported beside it;
    # and the rest of the body no faster
    torso = repair.Torso(frames)
    assert record["torso"] == torso.said() and record["torso"]["regions"]
    assert np.all(_drift(made, segment, torso) <= _drift(flow_only, segment, torso) + repair.DRIFT_PIXEL)
    assert round_["drift"]["measures"] == ["foot_centre", "torso_centre", "ground"] and set(round_["drift"]["body_mass"]) == {"bound", "moved"}
    _kept_rest(frames, flow_only, made, round_)
    assert len({k for k in round_["frames"] if made[k] is not frames[k]}) >= len(round_["frames"]) - 2
    # and the legs off their beat there, read on their colours; the round reads it on the rest of the body, step by step
    assert _legs_off(frames, made) > BEAT and round_["beat"]["off_max"] > repair.EASE_BEAT
    assert len(round_["beat"]["off"]) == len(segment) - 1 and round_["beat"]["bound"] == repair.EASE_BEAT
    # delivered: the loop as the flow repair left it, the legs on their steps as filmed, the rush still named
    assert [f.tobytes() for f in out] == [f.tobytes() for f in flow_only] and "replaced" not in round_
    assert set(record["replaced"]) == flow_frames and record["surge_after"] is not None
    assert _legs_off(frames, out) <= BEAT


@pytest.mark.slow
@pytest.mark.parametrize("n, lag, hold", [(WRAP, LAG, 1), (SHORT, SHORT_LAG, 1), (14, 0.15, 1), (48, LAG, 2)])
def test_whatever_spreads_a_rush_the_legs_keep_their_own_beat(n, lag, hold):
    # Every frame of the stretch is made whole, the legs with the tail: a time that gives the tail's rush more steps gives
    # the legs the same, and they slow to a stop where the tail is given its time and hurry on after. The body walks on its
    # own beat whatever the repair does to the tail: each step of the loop as delivered moves the legs and the feet as far
    # as that step did as filmed, to within a quarter of their ordinary step. The flow repair, whose frames are each made at
    # their own time, reads so.
    frames = _walk(n, lag=lag, hold=hold)
    flow_only, _ = repair.repair_jumps(frames, Lerp(frames, lag=lag, hold=hold, n=n), ease=False)
    out, _ = repair.repair_jumps(frames, Lerp(frames, lag=lag, hold=hold, n=n))
    filmed = _legs(frames)
    for name, loop in (("the flow repair", flow_only), ("the repair", out)):
        played = _legs(loop)
        for part in LEGS:
            ordinary = float(np.median(filmed[part][filmed[part] > 0]))
            off = np.abs(played[part] - filmed[part]) / ordinary
            assert off.max() <= BEAT, f"{name}, {part}: step {int(off.argmax())} is {off.max():.2f} of an ordinary step off"


@pytest.mark.slow
def test_a_rush_the_flow_reading_lets_pass_is_read_too_and_refused_for_the_legs_beat():
    # A tail 15 % of a cycle short over 16 frames reads under the flow's limit: no frame is taken out, and it still rushes.
    # 2.45.0 took its stretch; the frames made spread the rush and stop the legs where the tail is given its time.
    frames = _walk(SHORT, lag=SHORT_LAG)
    assert repair.flow_targets(frames)["groups"] == []
    flow_only, _ = repair.repair_jumps(frames, Lerp(frames, lag=SHORT_LAG, n=SHORT), ease=False)
    lerp = Lerp(frames, lag=SHORT_LAG, n=SHORT)
    out, record = repair.repair_jumps(frames, lerp)
    round_ = _ease(record)
    assert round_["outcome"] == "rejected" and round_["rejected_for"] == ["the body off its beat"] and round_["supersedes"] == []
    assert record["surge"]["ratio"] >= repair.SURGE_RATIO and record["surge_after"] is not None
    made = _made(flow_only, frames, round_, lerp.made)
    assert repair.surges(made, box=repair.union_box(frames)) == [] and _legs_off(frames, made) > BEAT
    _kept_rest(frames, flow_only, made, round_)
    assert all(o is f for o, f in zip(out, frames)) and record["replaced"] == []


@pytest.mark.slow
def test_with_the_beat_bound_lifted_a_stretch_that_keeps_every_other_reading_is_played_as_made(monkeypatch):
    # The delivery itself. Lifted, the beat refuses nothing: the same stretch is taken, every frame of it shown as it was
    # made, every frame outside it the video's own, and no rush is left.
    monkeypatch.setattr(repair, "EASE_BEAT", math.inf)
    frames = _walk(SHORT, lag=SHORT_LAG)
    lerp = Lerp(frames, lag=SHORT_LAG, n=SHORT)
    out, record = repair.repair_jumps(frames, lerp)
    round_ = _ease(record)
    assert round_["outcome"] == "accepted" and record["surge_after"] is None
    assert all(o is m for o, m in zip(out, _made(frames, frames, round_, lerp.made)))
    assert all(out[k] is frames[k] for k in range(SHORT) if k not in round_["frames"])
    assert record["replaced"] == round_["replaced"] and round_["replaced"]


@pytest.mark.slow
def test_a_stretch_whose_frames_made_hurry_the_rest_of_the_body_is_refused():
    # Over 36 frames, easing a tail a tenth of a cycle short gives the rush more time and the steps around it less; the
    # search reads the rest of the body on the line between the frames as filmed and finds times that keep it, and the
    # frames made, which go the body's own way between them, step further there (a validator's counterexample on 9dd5050:
    # the arm's window 1.736 to 2.030, the stretch taken). Read on the frames made, the stretch is refused for that, and
    # for the legs' beat that the same frames made break; the loop stays as the flow left it.
    frames = _walk(lag=0.1)
    flow_only, _ = repair.repair_jumps(frames, Lerp(frames, lag=0.1), ease=False)
    out, record = repair.repair_jumps(frames, Lerp(frames, lag=0.1))
    round_ = _ease(record)
    assert round_["outcome"] == "rejected" and round_["rejected_for"] == ["the rest faster", "the body off its beat"]
    faster = [i for i, w in enumerate(round_["rest"]["windows"]) if w in round_["rest"]["faster"]]
    assert faster and all(round_["rest"]["step_max_after"][i] > round_["rest"]["step_max_before"][i] for i in faster)
    assert [f.tobytes() for f in out] == [f.tobytes() for f in flow_only] and record["replaced"] == []
    assert record["surge_after"] is not None and "replaced" not in round_


@pytest.mark.slow
def test_an_ordinary_walk_has_no_rush_and_nothing_is_made():
    for frames in (_loop(), _loop(hold=2), _walk(), _walk(hold=2)):
        assert repair.surges(frames) == []
        out, record = repair.repair_jumps(frames, lambda a, b, t: pytest.fail("nothing to make"))
        assert record["surge"] is None and all(o is f for o, f in zip(out, frames))
        assert not [r for r in record["rounds"] if r["why"] == "ease"]


def test_a_frame_flung_against_the_way_is_not_a_rush():
    # Its steps in and out are large, and the second goes back the way the first came: the flow repair's frame.
    assert repair.surges(_loop(flung={12: 12})) == [] and repair.surges(_walk(flung={12: 12})) == []


@pytest.mark.slow
def test_on_twos_each_drawing_is_made_once_for_both_its_frames_and_the_stretch_refused_for_the_legs_beat():
    # 2.45.0 took this stretch; read on its drawings, the frames made stop the legs where the tail is given its time.
    n = 48  # 24 drawings on twos
    frames = _walk(n, lag=LAG, hold=2)
    flow_only, _ = repair.repair_jumps(frames, Lerp(frames, lag=LAG, hold=2, n=n), ease=False)
    lerp = Lerp(frames, lag=LAG, hold=2, n=n)
    out, record = repair.repair_jumps(frames, lerp)
    round_ = _ease(record)
    assert record["hold"] == 2 and round_["outcome"] == "rejected" and round_["rejected_for"] == ["the body off its beat"]
    made = _made(flow_only, frames, round_, lerp.made)
    assert all(len(d) == 2 and made[d[0]] is made[d[1]] for d in round_["drawings"])
    assert len(lerp.calls) <= len(round_["drawings"]) + len(record["rounds"][0]["drawings"])
    assert _legs_off(frames, made) > BEAT
    _kept_rest(frames, flow_only, made, round_)
    assert [f.tobytes() for f in out] == [f.tobytes() for f in flow_only]


@pytest.mark.slow
def test_a_made_frame_that_moves_the_body_further_than_the_stretch_did_refuses_the_ease():
    n = WRAP
    frames = _walk(n, lag=LAG)
    flow_only, _ = repair.repair_jumps(frames, Lerp(frames, lag=LAG, n=n), ease=False)
    lerp = Lerp(frames, lag=LAG, n=n)

    def pushed(a: Image.Image, b: Image.Image, t: float) -> Image.Image:
        made = lerp(a, b, t)
        if len(lerp.calls) <= 1:  # the flow's frame at the wrap, as before
            return made
        moved = Image.new("RGBA", made.size, (0, 0, 0, 0))
        moved.paste(made, (12 if len(lerp.calls) % 2 else 0, 0))  # every other made frame pushed sideways
        return moved

    out, record = repair.repair_jumps(frames, pushed)
    round_ = _ease(record)
    assert round_["outcome"] == "rejected" and "drift" in round_["rejected_for"] and round_["drift"]["over"]
    assert [f.tobytes() for f in out] == [f.tobytes() for f in flow_only]  # the loop as the flow left it
    assert set(record["replaced"]) == set(record["rounds"][0]["frames"])


@pytest.mark.slow
def test_a_made_frame_at_fault_refuses_the_ease_and_the_loop_stays_as_the_flow_left_it():
    n = WRAP
    frames = _walk(n, lag=LAG)
    flow_only, _ = repair.repair_jumps(frames, Lerp(frames, lag=LAG, n=n), ease=False)
    lerp = Lerp(frames, lag=LAG, n=n)

    def melted(a: Image.Image, b: Image.Image, t: float) -> Image.Image:
        made = lerp(a, b, t)
        if len(lerp.calls) != 3:
            return made
        pixels = np.asarray(made).copy()
        dark = (pixels[..., :3].max(axis=2) < 70) & (pixels[..., 3] > 0)
        pixels[dark, :3] = (200, 200, 220)  # the outlines melted into the fill
        return Image.fromarray(pixels, "RGBA")

    out, record = repair.repair_jumps(frames, melted)
    round_ = _ease(record)
    assert round_["outcome"] == "rejected" and "outline" in round_["faults"] and "fault" in round_["rejected_for"]
    assert [f.tobytes() for f in out] == [f.tobytes() for f in flow_only]


@pytest.mark.slow
def test_without_an_interpolator_a_rush_is_named_and_nothing_is_made():
    frames = _walk(lag=0.1)
    out, record = repair.repair_jumps(frames, None)
    assert record["surge"] is not None and record["ease_skipped"] == "no interpolator"
    assert all(o is f for o, f in zip(out, frames)) and record["replaced"] == []


@pytest.mark.slow
def test_it_reads_the_same_stretch_and_refuses_it_alike_whichever_way_the_body_faces():
    # 2.45.0 took the same stretch either way; either way the frames made stop the legs where the tail is given its time.
    frames = _walk(SHORT, lag=SHORT_LAG)
    mirrored = [ImageOps.mirror(f) for f in frames]
    lerp = Lerp(frames, lag=SHORT_LAG, n=SHORT)
    index = {id(m): k for k, m in enumerate(mirrored)}

    def mirror_lerp(a: Image.Image, b: Image.Image, t: float) -> Image.Image:
        return ImageOps.mirror(lerp(frames[index[id(a)]], frames[index[id(b)]], t))

    _, record = repair.repair_jumps(frames, Lerp(frames, lag=SHORT_LAG, n=SHORT))
    _, flipped = repair.repair_jumps(mirrored, mirror_lerp)
    assert _ease(flipped)["frames"] == _ease(record)["frames"]
    assert _ease(flipped)["rejected_for"] == _ease(record)["rejected_for"] == ["the body off its beat"]
    # the path's grid drops the box's columns past its last whole block and its windows round down, on one side only:
    # mirrored, the body reads a little apart
    assert _ease(flipped)["beat"]["off"] == pytest.approx(_ease(record)["beat"]["off"], abs=0.05)


# --- the search (repair.ease_times) -------------------------------------------------------------------------------


def test_the_search_keeps_every_frame_at_its_own_time_where_the_part_moves_evenly():
    times = np.arange(0, 8.0 + 1e-9, 1 / repair.EASE_GRID)
    progress = times[None, :] * 1.0  # one usual step a frame
    body = np.stack([times * 2.0, times * 0.5, np.zeros_like(times)])  # the body walks on evenly
    result = repair.ease_times(times, progress, body, np.array([2.0, 0.5, 1.0]), np.array([1.0]), np.array([1.0]),
                               own=list(range(1, 8)))
    assert result["accel"] == pytest.approx(0.0, abs=1e-9) and result["times"] == pytest.approx(list(range(1, 8)))


def test_the_search_spreads_a_rush_as_far_as_the_body_lets_it():
    # The part covers nine usual steps in the fourth of eight steps, one in each of the others. The body moves one
    # px a step and may move up to two: the times can bunch round the rush, but no step may cover more than two.
    times = np.arange(0, 8.0 + 1e-9, 1 / repair.EASE_GRID)
    per_step = np.array([1, 1, 1, 9, 1, 1, 1, 1], dtype=float)
    progress = np.interp(times, np.arange(9), np.concatenate([[0], np.cumsum(per_step)]))[None, :]
    body = np.stack([times, np.zeros_like(times), np.zeros_like(times)])
    result = repair.ease_times(times, progress, body, np.array([2.0, 1.0, 1.0]), np.array([1.0]), np.array([1.0]),
                               own=list(range(1, 8)))
    chosen = np.array([0.0, *result["times"], 8.0])
    assert np.all(np.diff(chosen) <= 2.0 + 1e-9) and np.all(np.diff(chosen) > 0)
    steps = np.diff(np.interp(chosen, times, progress[0]))
    assert steps.max() < 9 and result["accel"] < 8  # spread over more than one step
    assert np.all(np.abs(np.diff(np.concatenate([[1.0], steps, [1.0]]))) <= result["accel"] + 1e-9)


# --- video-loop --repair auto (sprite_gen/video/loop.py) ---------------------------------------------------------


class NearestLerp(Lerp):
    """`Lerp` for frames as video-loop hands them over (read back from disk and cleaned): each is the filmed frame
    nearest it."""

    def __init__(self, filmed: list[Image.Image], **kw):
        super().__init__(filmed, **kw)
        self.filmed = [np.asarray(f, dtype=np.int16) for f in filmed]

    def __call__(self, a: Image.Image, b: Image.Image, t: float) -> Image.Image:
        near = [int(np.argmin([np.abs(np.asarray(x, dtype=np.int16) - f).mean() for f in self.filmed])) for x in (a, b)]
        self.at = {id(a): near[0], id(b): near[1]}
        return super().__call__(a, b, t)


def _cut(tmp_path, frames: list[Image.Image], **kw):
    return loop_mod.run_loop(_keyed(tmp_path, frames), tmp_path / "out", fps=24.0, state="walk", min_len=None, max_len=None,
                             n_out=None, seam_max=1000.0, name="w", report_path=tmp_path / "w.json", cycle_mode="fixed",
                             start=0, length=len(frames), anchor="none", **kw)


@pytest.mark.slow
def test_video_loop_reads_the_rush_refuses_the_stretch_for_the_legs_beat_and_plays_the_frames_as_cut(tmp_path, capsys):
    # 2.45.0 played this stretch's frames made; their legs stop where the tail is given its time. The stretch is made and
    # recorded, and the cells are the frames as cut.
    frames = _walk(SHORT, lag=SHORT_LAG)
    lerp = NearestLerp(frames, lag=SHORT_LAG, n=SHORT)
    rep = _cut(tmp_path, frames, interpolate=lerp)
    jr = rep["jump_repair"]
    round_ = _ease(jr)
    assert round_["outcome"] == "rejected" and round_["rejected_for"] == ["the body off its beat"]
    assert round_["calls"] == len(lerp.made) > 0 and jr["ease_calls"] == round_["calls"]
    assert jr["applied"] is False and jr["replaced"] == [] and jr["surge_after"] is not None
    assert rep["seam_measurement"] == "source-frames"  # no frame made is played
    cells = sorted((tmp_path / "out" / "cycle").glob("frame-*.png"))
    assert len(cells) == SHORT  # the loop keeps its length
    cut = [Image.open(p).convert("RGBA") for p in sorted((tmp_path / "keyed").glob("*.png"))][:SHORT]
    for cell, frame in zip(cells, cut):
        assert np.array_equal(np.asarray(Image.open(cell)), np.asarray(frame))
    written = json.loads((tmp_path / "w.json").read_text())["jump_repair"]["rounds"][-1]
    assert written["why"] == "ease" and written["rejected_for"] == ["the body off its beat"]


@pytest.mark.slow
def test_a_rush_without_rife_is_cut_as_filmed_with_a_warning(tmp_path, monkeypatch, capsys):
    _no_rife(monkeypatch, tmp_path)
    frames = _walk(lag=0.1)
    rep = _cut(tmp_path, frames)
    jr = rep["jump_repair"]
    assert jr["applied"] is False and jr["replaced"] == [] and jr["ease_skipped"] == "no interpolator"
    assert jr["why"] == "RIFE not installed — the rush cut as filmed" and jr["install"] == "sprite-gen rife install"
    warning = [line for line in capsys.readouterr().err.splitlines() if "rushes" in line]
    assert len(warning) == 1 and "sprite-gen rife install" in warning[0] and "not eased" in warning[0]


@pytest.mark.slow
def test_repair_on_without_rife_refuses_a_rush(tmp_path, monkeypatch):
    _no_rife(monkeypatch, tmp_path)
    with pytest.raises(SystemExit, match=r"for a part that rushes.*sprite-gen rife install"):
        _cut(tmp_path, _walk(lag=0.1), repair="on")


@pytest.mark.slow
def test_a_stretch_never_takes_more_than_half_the_loop_and_is_refused_for_the_legs_beat(monkeypatch):
    # Fourteen frames: four drawings a side would remake eight, more than the seven video-loop-compare reads back as the
    # repair's; three a side remakes six. 2.45.0 took the six; their legs stop where the tail is given its time.
    frames = _walk(14, lag=0.15)
    monkeypatch.setattr(repair, "MADE_SHARE", 1.0)
    _, unbound = repair.repair_jumps(frames, Lerp(frames, lag=0.15, n=14))
    assert _ease(unbound)["width"] == 4 and len(_ease(unbound)["frames"]) == 8
    monkeypatch.setattr(repair, "MADE_SHARE", 0.5)
    flow_only, _ = repair.repair_jumps(frames, Lerp(frames, lag=0.15, n=14), ease=False)
    lerp = Lerp(frames, lag=0.15, n=14)
    out, record = repair.repair_jumps(frames, lerp)
    round_ = _ease(record)
    assert round_["width"] == 3 and len(set(record["replaced"]) | set(round_["frames"])) <= 14 // 2
    assert round_["outcome"] == "rejected" and round_["rejected_for"] == ["the body off its beat"]
    made = _made(flow_only, frames, round_, lerp.made)
    _kept_rest(frames, flow_only, made, round_)
    assert _legs_off(frames, made) > BEAT and [f.tobytes() for f in out] == [f.tobytes() for f in flow_only]
