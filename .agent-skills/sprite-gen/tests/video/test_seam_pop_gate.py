# SPDX-License-Identifier: Apache-2.0
"""The seam pop is a gate (docs/loop-repair.md section 3, "The seam pop"): a walk's or run's loop whose top — the head,
or a part held above it — jumps into its first frame more than `--seam-pop-max` times its median step (default 10,
`repair.SEAM_POP_REFERENCE`) is refused, a cut fixed by hand as one `--anchor motion-auto` chooses, by one reading:
`jolt.seam_pop`, the loop as it plays (`seam_pop_gate` in the report). Before it cuts, motion-auto reads the cuts it
chooses among the same way — their frames corrected as the cut will be — and takes the next where the gate would refuse
the first, as its seam gate does. `--seam-pop-max off` turns the gate off, the pop a warning line as before; `--seam-max`
does not lift it. A cut whose top cannot be read is not refused, and the report says it could not be read.

Synthetic frames: the body anchor gate's side walk standing in place, drawn a frame each or held on twos, a 3 px rod on
its head whose tip rises a pixel a drawing for the first `rise` drawings of each stride and stands there: the wrap drops
`rise` pixels, the loop's median step is under a pixel, and the pop reads `rise`."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from conftest import feet_unseen
from sprite_gen.video import crossings, local_cycle, repair
from sprite_gen.video import loop as loop_mod
from tests.video.test_body_anchor_gate import PERIOD, _cut, _keyed, _walk
from tests.video.test_held_walk_seam import _held
from tests.video.test_walk_steps import FRAMES, _distances

ROD_X, ROD_FOOT, TIP = 108, 30, 16  # the rod's middle column (the head's), its foot inside the head, its tip unrisen
NO_HEAD = "a loop frame has no head to track"


def _rodded(rise: int, hold: int = 1, *, room: int = 0, flung: int | None = None, drop: int = 0) -> list[Image.Image]:
    """The walk standing in place with the rod on its head, held on `hold` (each drawing shown `hold` frames), on a
    canvas `room` px taller above; drawing d of a stride counted from frame `drop` (where the tip drops back) has its
    tip min(d, rise) px above TIP. Frame `flung` has its rod up to the canvas top: every other frame then has nothing
    in the top band, and the top cannot be read."""
    frames = []
    for j, im in enumerate(_walk(drift=0.0)):
        canvas = Image.new("RGBA", (im.width, im.height + room))
        canvas.paste(im, (0, room))
        tip = 0 if j == flung else room + TIP - min(((j - drop) % PERIOD) // hold, rise)
        ImageDraw.Draw(canvas).rectangle((ROD_X - 1, tip, ROD_X + 1, room + ROD_FOOT), fill=(240, 200, 40, 255))
        frames.append(canvas)
    return _held(frames, hold)


def _refused_by_pop(root: Path, keyed: Path, name: str, **kw) -> tuple[str, dict]:
    with pytest.raises(SystemExit) as exc:
        _cut(root, keyed, name, **kw)
    return str(exc.value), json.loads((root / f"{name}.json").read_text())


def _files(folder: Path) -> dict[str, bytes]:
    return {p.name: p.read_bytes() for p in sorted(folder.iterdir()) if p.is_file() and p.suffix in (".png", ".json", ".gif", ".webp")}


@pytest.mark.slow
@pytest.mark.parametrize("hold", [1, 2])
def test_a_cut_whose_top_jumps_over_the_bound_is_refused(tmp_path: Path, hold: int):
    """The cut again by hand (`--cycle fixed`, the body anchor): its seam and its steps pass, and its top drops 11 px
    at the wrap, eleven times its step — a pop the gate refuses, held or not; before, a warning line and the loop kept."""
    message, report = _refused_by_pop(tmp_path, _keyed(tmp_path, "rod", _rodded(11, hold)), "cut")
    assert message.startswith("video-loop: loop seam pop 11.00 exceeds 10 (fixed length 24 frames from 0): ")
    assert "the top of the silhouette jumps into the loop's first frame up or down" in message
    assert "11.0x its median step" in message
    assert report["status"] == "failed" and report["error"] == message
    assert report["seam_pop_gate"] == {"verdict": "refused", "max": 10.0, "pop": 11.0}
    assert report["jolt"]["seam_pop"]["pop"] == 11.0
    # Refused for the pop alone: its seam and its steps pass, read between its drawings.
    assert report["resampled_seam_ratio"] <= loop_mod.SEAM_RATIO_MAX
    assert report["step_gate"]["largest_ratio"] <= loop_mod.STEP_RATIO_MAX
    assert report["seam_read"]["hold"] == hold
    # Said in the refusal, not in a line that keeps the loop.
    assert not any("jumps into the loop's first frame" in line for line in report["jolt"]["warnings"])


@pytest.mark.slow
@pytest.mark.parametrize("hold", [1, 2])
def test_a_cut_whose_top_jumps_under_the_bound_passes(tmp_path: Path, hold: int):
    """The same walk, its top dropping 9 px at the wrap: nine times its step, under the bound — passed and said so."""
    report = _cut(tmp_path, _keyed(tmp_path, "rod", _rodded(9, hold)), "cut")
    assert report["status"] == "passed"
    assert report["seam_pop_gate"] == {"verdict": "passed", "max": 10.0, "pop": 9.0}


def test_the_gate_refuses_only_over_its_bound():
    """`repair.seam_pop_gate`: a pop at the bound passes, one over it is refused; off says the pop; a top that cannot be
    read is neither, and says why."""
    def pop(value):
        return {"pop": value, "x": {}, "y": {}}
    assert repair.seam_pop_gate(pop(10.0), pop_max=10.0) == {"verdict": "passed", "max": 10.0, "pop": 10.0}
    assert repair.seam_pop_gate(pop(10.001), pop_max=10.0) == {"verdict": "refused", "max": 10.0, "pop": 10.001}
    assert repair.seam_pop_gate(pop(14.4), pop_max=None) == {"verdict": "off", "max": None, "pop": 14.4}
    assert repair.seam_pop_gate({"skipped": NO_HEAD}, pop_max=10.0) == {"verdict": "unreadable", "max": 10.0, "pop": None,
                                                                       "why": NO_HEAD}


@pytest.mark.slow
def test_the_bound_is_its_flag_and_off_keeps_the_loop_with_the_warning_line(tmp_path: Path, capsys):
    """The cut whose top drops 11 px: kept under a bound of 12 and with the gate off, the same loop either way, and the
    warning line of a pop over the reference bound (10) as before."""
    keyed = _keyed(tmp_path, "rod", _rodded(11))
    above = _cut(tmp_path, keyed, "above", seam_pop_max=12.0)
    assert above["status"] == "passed" and above["seam_pop_gate"] == {"verdict": "passed", "max": 12.0, "pop": 11.0}
    off = _cut(tmp_path, keyed, "off", seam_pop_max=None)
    assert off["status"] == "passed" and off["seam_pop_gate"] == {"verdict": "off", "max": None, "pop": 11.0}
    for report in (above, off):
        assert sum("jumps into the loop's first frame up or down" in line for line in report["jolt"]["warnings"]) == 1
    assert _files(tmp_path / "above") == _files(tmp_path / "off")
    assert capsys.readouterr().err.count("video-loop: warning: the top of the silhouette jumps into the loop's first frame") == 2


@pytest.mark.slow
def test_seam_max_does_not_lift_it_and_the_forced_argv_turns_it_off(tmp_path: Path, capsys):
    """A delivery forced past the gates (`--seam-max 1000`, the app's) is refused for the pop all the same; with
    `--seam-pop-max off` beside it the loop goes out, the pop a warning line."""
    keyed = _keyed(tmp_path, "rod", _rodded(11))
    argv = ["--frames-dir", str(keyed), "--state", "walk", "--fps", "24", "--name", "walk", "--body-height", "400",
            "--strip-height", "640", "--cycle", "fixed", "--start", "0", "--length", str(PERIOD), "--anchor", "body",
            "--repair", "off", "--seam-max", "1000"]
    with pytest.raises(SystemExit, match="video-loop: loop seam pop 11.00 exceeds 10"):
        loop_mod.main([*argv, "--out-dir", str(tmp_path / "lifted"), "--report", str(tmp_path / "lifted.json")])
    assert loop_mod.main([*argv, "--out-dir", str(tmp_path / "forced"), "--report", str(tmp_path / "forced.json"),
                          "--seam-pop-max", "off"]) == 0
    report = json.loads((tmp_path / "forced.json").read_text())
    assert report["seam_pop_gate"] == {"verdict": "off", "max": None, "pop": 11.0}
    assert "(reference bound; the loop is kept" in capsys.readouterr().err


def test_the_flag_reads_a_bound_over_zero_or_off():
    parser = argparse.ArgumentParser()
    loop_mod.add_arguments(parser)
    base = ["--frames-dir", "x", "--out-dir", "y"]
    assert parser.parse_args(base).seam_pop_max == repair.SEAM_POP_REFERENCE == 10.0
    assert parser.parse_args([*base, "--seam-pop-max", "12.5"]).seam_pop_max == 12.5
    assert parser.parse_args([*base, "--seam-pop-max", "OFF"]).seam_pop_max is None
    for value in ("0", "-1", "nan", "inf", "ten"):
        with pytest.raises(SystemExit):
            parser.parse_args([*base, "--seam-pop-max", value])


@pytest.mark.slow
def test_a_cut_whose_top_cannot_be_read_is_not_refused_and_the_report_says_so(tmp_path: Path, capsys):
    """Frame 5's rod reaches the canvas top: the top band is its tip, and no other frame has anything in it. The pop
    cannot be read — not refused, not passed quietly: `seam_pop_gate` says unreadable and why, and the warning line
    that the head could not be tracked stays."""
    report = _cut(tmp_path, _keyed(tmp_path, "rod", _rodded(11, room=100, flung=5)), "cut", seam_max=1000.0)
    assert report["status"] == "passed"
    assert report["jolt"]["seam_pop"] == {"skipped": NO_HEAD}
    assert report["seam_pop_gate"] == {"verdict": "unreadable", "max": 10.0, "pop": None, "why": NO_HEAD}
    assert f"video-loop: warning: the head could not be tracked ({NO_HEAD})" in capsys.readouterr().err


@pytest.mark.slow
def test_a_pinned_clip_is_gated_by_its_pin(tmp_path: Path):
    """A walk filmed pinned to end on its first frame (`--cycle pinned`, the app's retry of a walk whose cycle was not
    found): its gate is the pin, as it is the seam ratio's — the pop is not gated, and stays a warning line."""
    report = _cut(tmp_path, _keyed(tmp_path, "rod", _rodded(11)[:PERIOD + 1]), "pinned", cycle_mode="pinned", start=None,
                  length=None)
    assert report["status"] == "passed" and report["cycle"]["kind"] == "pinned"
    assert report["jolt"]["seam_pop"]["pop"] == 11.0
    assert report["seam_pop_gate"] == {"verdict": "not-applicable", "why": "a pinned cut is gated by its pin"}
    assert any("jumps into the loop's first frame" in line for line in report["jolt"]["warnings"])


# --- `--anchor motion-auto`: a cut the gate would refuse gives way to the next -------------------------------------


def _gate(table: dict, pop_max: float = 10.0):
    """A `pop_gate` reading a table: (start, length) -> pop (0 where not listed), or a reason for a top it cannot read."""
    def gate(start: int, length: int) -> dict:
        value = table.get((start, length), 0.0)
        if isinstance(value, str):
            return {"skipped": value, "max": pop_max}
        return {"pop": value, "over": value > pop_max, "max": pop_max}
    return gate


ROWS = [{"start": s, "length": 24, "score": 1.0 + s / 100} for s in (0, 3, 6, 9, 12)]


@pytest.mark.parametrize("table, picked, said", [
    ({}, 0, ["passed"]),
    ({(0, 24): 14.0, (3, 24): 12.0}, 6, ["refused", "refused", "passed"]),
    ({(0, 24): 14.0, (3, 24): NO_HEAD}, 3, ["refused", "unreadable"]),
    ({(s, 24): 14.0 for s in (0, 3, 6, 9, 12)}, 0, ["refused"] * local_cycle.SEAM_TRIES),
])
def test_a_chosen_cut_the_gate_would_refuse_gives_way_to_the_next(table, picked, said):
    """`local_cycle._pop_gate`: the first of SEAM_TRIES cuts the gate does not refuse is taken, a top that cannot be read
    not refused; where it refuses them all, the first choice stays and the gate refuses it on the loop."""
    rows = [dict(r) for r in ROWS]
    chosen, record = local_cycle._pop_gate(rows[0], rows[1:], _gate(table))
    assert chosen["start"] == picked
    assert [t["pop_gate"] for t in record["tried"]] == said
    assert [t["start"] for t in record["tried"]] == [0, 3, 6, 9][:len(said)]
    assert record["max"] == 10.0 and record["applied"] is (picked != 0)
    assert ("why" in record) is (said[-1] == "refused")


def test_the_search_takes_the_next_cut_where_the_gate_would_refuse_its_choice():
    """`local_cycle.detect` with `pop_gate`: the cut it chose without it is read first; refused, the next of its
    candidates in its order is, and the record says each."""
    D = _distances()
    kw = dict(min_len=12, max_len=14, gait_floor=8, periodicity_min=loop_mod.PERIODICITY_MIN,
              double_tolerance=loop_mod.GAIT_DOUBLE_TOL, double_search=loop_mod.GAIT_DOUBLE_SEARCH)
    first = local_cycle.detect(D, D[0] * 0, **kw)
    assert "seam_pop_gate" not in first
    kept = local_cycle.detect(D, D[0] * 0, pop_gate=_gate({}), **kw)
    assert (kept["start"], kept["length"]) == (first["start"], first["length"])
    assert kept["seam_pop_gate"]["tried"] == [{"start": first["start"], "length": first["length"], "pop": 0.0, "pop_gate": "passed"}]
    moved = local_cycle.detect(D, D[0] * 0, pop_gate=_gate({(first["start"], first["length"]): 14.0}), **kw)
    tried = moved["seam_pop_gate"]["tried"]
    assert tried[0] == {"start": first["start"], "length": first["length"], "pop": 14.0, "pop_gate": "refused"}
    assert tried[1]["pop_gate"] == "passed" and (moved["start"], moved["length"]) == (tried[1]["start"], tried[1]["length"])
    assert moved["seam_pop_gate"]["applied"] is True


def _two_steps(found: dict, *, pop_gate, seam: float, search_seam: float = 1.0) -> tuple[dict, dict]:
    """`by_steps` as tests/video/test_walk_steps.py `_choose` calls it (a clip whose picture goes round every 30 frames,
    its feet passing every 15), with `pop_gate`."""
    D = _distances(period=30, frames=FRAMES)
    middles = (8, 23, 38, 53, 68)
    reading = crossings.Reading(FRAMES, "gap", [(float(c), float(c)) for c in middles], runs=[(c - 4, c + 4) for c in middles])
    return local_cycle.by_steps(
        D, D[0] * 0, reading, found=dict(found), refused=None, min_len=12, max_len=FRAMES,
        seam_flow=lambda s, L: {"off": [1.0, 1.0], "turn": [0.0, 0.0], "window": [[0, 0, 1, 1], [0, 0, 1, 1]]},
        wrap_pop=lambda s, L: {"pops": False, "pop": 0.1},
        seam_gate=lambda s, L: search_seam if (s, L) == (found["start"], found["length"]) else seam, flow_limit=3.0, seam_max=2.0,
        gait_floor=12, periodicity_min=loop_mod.PERIODICITY_MIN, signals=None, pop_gate=pop_gate)


def test_a_two_step_cut_the_gate_would_refuse_gives_way_to_the_next():
    """The search's cut is one step (refuted): of the two-step cuts, whose seams all pass, the first is read popping —
    the next is taken, as the seam gate takes the next where a seam fails."""
    calls = []

    def gate(start, length):
        calls.append((start, length))
        return _gate({}, 10.0)(start, length) if len(calls) > 1 else {"pop": 12.0, "over": True, "max": 10.0}
    picked, record = _two_steps({"start": 10, "length": 15}, pop_gate=gate, seam=1.0)
    tried = record["seam_gate"]["tried"]
    assert [t["pop_gate"] for t in tried] == ["refused", "passed"] and [t["seam"] for t in tried] == [1.0, 1.0]
    assert record["chosen_by"] == "two steps" and (picked["start"], picked["length"]) == (tried[1]["start"], tried[1]["length"])


@pytest.mark.parametrize("search_pop, stands", [(0.0, True), (12.0, False)])
def test_a_search_cut_stands_only_where_the_gate_passes_it_too(search_pop: float, stands: bool):
    """The search's cut 10/33 covers two steps out of phase (not refuted) and its seam passes; no two-step cut's seam
    does. It stands where the gate passes it; refused, it gives way as a cut the seam gate refuses does."""
    picked, record = _two_steps({"start": 10, "length": 33}, pop_gate=_gate({(10, 33): search_pop}), seam=3.0)
    assert record["search"]["pop_gate"] == ("passed" if stands else "refused")
    assert record["chosen_by"] == ("search" if stands else "two steps")
    assert ((picked["start"], picked["length"]) == (10, 33)) is stands


@pytest.mark.slow
@pytest.mark.parametrize("hold, drop", [(1, 4), (2, 6)])
def test_motion_auto_reads_the_cut_before_it_cuts_as_the_gate_reads_the_loop(tmp_path: Path, hold: int, drop: int):
    """The rod walk, its tip dropping 6 px where the search's cut starts (frame `drop`), its feet unread (the pixel
    search's cut): the cut taken is read before it is cut as the gate reads the loop — the same pop, cut as filmed — and
    passed. Under a bound its first choice is over, motion-auto takes the next the gate passes, and the loop passes on
    it. Off, nothing is read before the cut, and the loop is the bytes of the gate's own cut."""
    keyed = _keyed(tmp_path, "rod", _rodded(6, hold, drop=drop))

    def cut(name: str, *flags: str) -> dict:
        assert loop_mod.main(["--frames-dir", str(keyed), "--out-dir", str(tmp_path / name), "--state", "walk",
                              "--anchor", "motion-auto", "--repair", "off", "--report", str(tmp_path / f"{name}.json"),
                              *flags]) == 0
        return json.loads((tmp_path / f"{name}.json").read_text())

    with feet_unseen():
        on = cut("on")
        gate = on["cycle"]["seam_pop_gate"]
        first = gate["tried"][0]
        assert gate["applied"] is False and first["pop_gate"] == "passed" and on["cycle"]["start"] == drop
        assert (first["start"], first["length"]) == (on["cycle"]["start"], on["cycle"]["length"])
        assert first["pop"] == on["jolt"]["seam_pop"]["pop"] == on["seam_pop_gate"]["pop"] > 3
        bound = 3.0
        under = cut("under", "--seam-pop-max", f"{bound}")
        tried = under["cycle"]["seam_pop_gate"]["tried"]
        assert tried[0] == {**first, "pop_gate": "refused"}
        assert tried[-1]["pop_gate"] != "refused" and under["cycle"]["seam_pop_gate"]["applied"] is True
        assert (tried[-1]["start"], tried[-1]["length"]) == (under["cycle"]["start"], under["cycle"]["length"])
        assert under["seam_pop_gate"]["verdict"] == "passed" and under["seam_pop_gate"]["pop"] == tried[-1]["pop"] <= bound
        off = cut("off", "--seam-pop-max", "off")
    assert "seam_pop_gate" not in off["cycle"] and off["seam_pop_gate"]["verdict"] == "off"
    assert (off["cycle"]["start"], off["cycle"]["length"]) == (on["cycle"]["start"], on["cycle"]["length"])
    assert _files(tmp_path / "off") == _files(tmp_path / "on")
