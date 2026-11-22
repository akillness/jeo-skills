# SPDX-License-Identifier: Apache-2.0
"""A walk or run cut shorter than its state's gait floor, its steps not counted, is named a half step where the clip
gives it no two.

A walk or run loops on two steps. The half-period guard reads the gait floor in whole frames, rounded, so a run cut 8
frames long at 24 fps (0.33 s, under the run's 0.35 s) is taken as a cycle. This walker repeats exactly every 8 frames,
so two lengths on comes back no nearer (tests/video/test_loop_two_lengths.py has one that does): the cut stays as it
was, and the report and a warning line say it is one step (`cycle.half_step`, docs/video-pipeline.md section 4)."""
from __future__ import annotations

import pytest

from sprite_gen.video import loop
from tests.video import test_gait_fallback as walks

# The lines a caller matches on the loop's stderr to read a refusal (spritegen-app modal/pipeline.py): a warning that
# keeps the loop carries none of them.
REFUSALS = ("no periodic cycle found", "loop seam ratio", "loop step ratio", "loop step count refutes", "loop seam pop")


def _cut(length, **more):
    return {"kind": "periodic", "start": 2, "length": length,
            "step_count": {"readable": False, "why": "0 crossings in the clip: under two steps, no step range"}, **more}


def test_a_run_cut_under_the_floor_in_seconds_is_one_step():
    run = loop.profile_for("run")
    assert round(run.min_seconds * 24) == 8  # the guard's floor in frames: an 8-frame cut passes it
    said = loop.half_step(_cut(8), run, 24.0, state="run", clip_frames=73)
    assert said == {"rule": loop.HALF_STEP_RULE, "state": "run", "seconds": 0.3333,
                    "gait_floor": {"seconds": 0.35, "frames": 8}, "steps": "not counted",
                    "why": "0 crossings in the clip: under two steps, no step range",
                    "two_steps": {"frames": 16, "in_clip": True}}
    line, = loop.half_step_verdict({**_cut(8), "half_step": said})
    assert line.startswith("the cut 2/8 plays 0.33 s, under the run's gait floor of 0.35 s")
    assert "(a half step)" in line and "--steps 1" in line
    assert not any(words in line for words in REFUSALS)


@pytest.mark.parametrize("cycle, state, fps", [
    (_cut(9), "run", 24.0),  # 0.375 s: over the floor
    (_cut(12), "run", 24.0),
    (_cut(8, steps={"count": 2, "by": "crossings"}), "run", 24.0),  # counted two steps
    (_cut(8, steps={"count": 2, "by": "given", "given": 2}), "run", 24.0),  # --steps 2
    ({**_cut(8), "kind": "fixed"}, "run", 24.0),  # a cut the caller named
    (_cut(8), "idle", 24.0),  # not a gait
    (_cut(5), "run", 12.0),  # 0.42 s at 12 fps
])
def test_a_cut_at_or_over_the_floor_or_counted_is_not_named(cycle, state, fps):
    assert loop.half_step(cycle, loop.profile_for(state), fps, state=state, clip_frames=73) is None
    assert loop.half_step_verdict(cycle) == []


def test_the_floor_is_read_in_seconds_at_any_rate_and_a_short_clip_says_two_steps_do_not_fit():
    # 4 frames at 12 fps is 0.33 s, and the guard's floor rounds to 4 frames there too.
    said = loop.half_step(_cut(4), loop.profile_for("run"), 12.0, state="run", clip_frames=36)
    assert said["seconds"] == 0.3333 and said["gait_floor"] == {"seconds": 0.35, "frames": 4}
    # A walk a frame under its floor at 24 fps (0.58 s, the guard's floor 14 frames), in a clip too short for two lengths.
    said = loop.half_step(_cut(14), loop.profile_for("walk"), 24.0, state="walk", clip_frames=20)
    assert said["seconds"] == 0.5833 and said["gait_floor"] == {"seconds": 0.6, "frames": 14}
    assert said["two_steps"] == {"frames": 28, "in_clip": False}


@pytest.mark.slow
def test_a_run_cut_one_step_long_is_kept_and_named(tmp_path, capsys):
    (tmp_path / "eight").mkdir()
    code, report, _ = walks.run(tmp_path / "eight", [walks.walker(k, period=8) for k in range(73)], "--size-hold", "off",
                                state="run")
    assert code == 0 and report["status"] == "passed"
    cycle = report["cycle"]
    assert cycle["length"] == 8 and "steps" not in cycle and not cycle["step_count"]["readable"]
    assert cycle["half_step"]["seconds"] == 0.3333 and cycle["half_step"]["two_steps"] == {"frames": 16, "in_clip": True}
    err = capsys.readouterr().err
    warned = [line for line in err.splitlines() if "(a half step)" in line]
    assert len(warned) == 1 and warned[0].startswith(f"video-loop: warning: the cut {cycle['start']}/8 plays 0.33 s")
    assert not any(words in err for words in REFUSALS)
    assert any("(a half step)" in line for line in report["jolt"]["warnings"])

    # Counted, it is not named: --steps 2 keeps the cut, --steps 1 cuts it two lengths long.
    for steps, length in (("2", 8), ("1", 16)):
        (tmp_path / steps).mkdir()
        code, counted, _ = walks.run(tmp_path / steps, [walks.walker(k, period=8) for k in range(73)], "--size-hold", "off",
                                     "--steps", steps, state="run")
        assert code == 0 and abs(counted["cycle"]["length"] - length) <= 1
        assert "half_step" not in counted["cycle"]
    assert "(a half step)" not in capsys.readouterr().err


@pytest.mark.slow
def test_a_run_cut_two_steps_long_says_nothing(tmp_path, capsys):
    code, report, _ = walks.run(tmp_path, [walks.walker(k, period=12) for k in range(73)], "--size-hold", "off", state="run")
    assert code == 0 and report["cycle"]["length"] == 12 and "half_step" not in report["cycle"]
    assert "(a half step)" not in capsys.readouterr().err
