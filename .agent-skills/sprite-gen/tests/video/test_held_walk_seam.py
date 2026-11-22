# SPDX-License-Identifier: Apache-2.0
"""A walk held on twos or threes has its seam read between its drawings, as its steps are (`loop.seam_drawings`).

Read frame by frame, a walk held on twos or threes steps nothing and then a drawing's step: a wrap from its last drawing
into its first reads two or three times the mean step though the walk closes, and a step into a drawing as much where
nothing jumps. The step gate reads such a walk between its drawings (`loop.drawing_steps`); the three readings that
judge its seam read it so too, one reading, the step gate's drawings:

- the seam gate, on the source frames of a cut gated as filmed and on the cells of a cut gated on its rendered cells
  (`seam_read` records the drawings the ratio was read on);
- the body anchor's ramp rule (563b887): a cut whose source frames refuse its wrap is read again on the cells that
  play, their wrap and every step;
- `--anchor motion-auto`'s seam gate on a cut before it is cut (`loop.seam_on_cells`, through `loop.wrap_on_cells`), which
  chooses among the cuts of two steps the walk's crossings show.

What a held walk does not close between its drawings is refused as before: a drawing moved at the wrap, and a jump the
ramp moves into the loop. A walk drawn a frame each is every frame either way, and reads as it did.

Synthetic frames only: the body anchor gate's side walk, standing in place or sliding, and the step count's side walker,
held on twos or threes."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from sprite_gen.video import auto_motion, motion_anchor
from sprite_gen.video import loop as loop_mod
from tests.video.test_body_anchor_gate import PERIOD, _cut, _holed, _keyed, _moved, _refused, _walk
from tests.video.test_walk_steps import _side

SLIDE = 0.3  # pixels a frame the sliding walk slides: 7.2 px over a stride, a wrap its drawings do not close


def _held(frames: list[Image.Image], hold: int) -> list[Image.Image]:
    """Each drawing shown for `hold` frames: frame k shows frame k - k % hold."""
    return [frames[k - k % hold] for k in range(len(frames))]


def _by_frame(frames: list[Image.Image]) -> float:
    """The wrap of a loop's frames over their mean step, read frame by frame on the analysis features."""
    flat = np.stack([loop_mod._small_features(f) for f in frames])
    return float(np.abs(flat[-1] - flat[0]).mean() / np.abs(flat[1:] - flat[:-1]).mean())


def _cells(root: Path, name: str, report: dict) -> list[Image.Image]:
    meta = report["strip"]
    strip = Image.open(root / name / "walk-side.strip.png")
    return [strip.crop((k * meta["w"], 0, (k + 1) * meta["w"], meta["h"])) for k in range(meta["frames"])]


@pytest.mark.slow
@pytest.mark.parametrize("hold", [2, 3])
def test_a_held_walk_whose_wrap_falls_between_its_drawings_passes_the_seam_gate(tmp_path: Path, hold: int):
    """The walk standing in place, cut one stride from a drawing's first frame: its wrap is the step from its last
    drawing into its first. Frame by frame the wrap is two or three times the frames' mean step, and the gate refused the
    cut; between its drawings it is one more step of the walk."""
    frames = _held(_walk(drift=0.0), hold)
    assert _by_frame(frames[:PERIOD]) > loop_mod.SEAM_RATIO_MAX
    report = _cut(tmp_path, _keyed(tmp_path, "held", frames), "cut", anchor="none")
    assert report["status"] == "passed" and report["seam_measurement"] == "source-frames"
    assert report["seam_read"] == {"read": "drawings", "drawings": PERIOD // hold, "hold": hold}
    assert report["resampled_seam_ratio"] <= loop_mod.SEAM_RATIO_MAX


@pytest.mark.slow
def test_a_walk_drawn_a_frame_each_is_read_on_every_frame(tmp_path: Path):
    """Unheld, every frame is a drawing: the seam is read on every frame, its ratio the frames' own."""
    frames = _walk(drift=0.0)
    report = _cut(tmp_path, _keyed(tmp_path, "walk", frames), "cut", anchor="none")
    assert report["status"] == "passed" and report["seam_read"] == {"read": "drawings", "drawings": PERIOD, "hold": 1}
    D = loop_mod._distances(np.stack([loop_mod._small_features(f) for f in frames[:PERIOD]]))
    assert report["resampled_seam_ratio"] == round(float(D[PERIOD - 1, 0]) / float(np.mean([D[k, k + 1] for k in range(PERIOD - 1)])), 4)


@pytest.mark.parametrize("hold", [2, 3])
def test_a_held_walk_whose_last_drawing_is_moved_is_refused_between_its_drawings(tmp_path: Path, hold: int):
    """The walk standing in place, its last drawing moved 10 px sideways: between its drawings the wrap still jumps,
    and the gate refuses it with the line it gave before."""
    frames = _held(_walk(drift=0.0), hold)
    for k in range(PERIOD - hold, PERIOD):
        frames[k] = _moved(frames[k], 10)
    message, report = _refused(tmp_path, _keyed(tmp_path, "held", frames), "cut", anchor="none")
    assert message.startswith("video-loop: loop seam ratio ") and "the cycle does not close — " in message
    assert report["seam_read"] == {"read": "drawings", "drawings": PERIOD // hold, "hold": hold}
    assert report["seam_refusal"]["reading"] == "wrap" and report["seam_refusal"]["ratio"] > loop_mod.SEAM_RATIO_MAX


@pytest.mark.slow
@pytest.mark.parametrize("hold", [2, 3])
def test_a_held_walk_that_slides_passes_on_the_drawings_the_ramp_plays(tmp_path: Path, hold: int):
    """The walk sliding SLIDE px a frame, held: between its drawings the source frames do not close its wrap, the body
    anchor's ramp moves it back, and the cells that play close between their drawings, wrap and every step. Read frame
    by frame those cells step a drawing's step at every drawing, over the limit, and the ramp rule refused the cut. The
    ramp moves each cell a whole pixel at a time, so a drawing's cells can stand a pixel apart and read as two: the
    cells are read on the drawings they show, held, not on the source frames' count."""
    report = _cut(tmp_path, _keyed(tmp_path, "held", _held(_walk(drift=SLIDE), hold)), "cut")
    assert report["status"] == "passed" and report["seam_measurement"] == "rendered-cells"
    after = report["seam_after_anchor"]
    assert after["source_seam_ratio"] > loop_mod.SEAM_RATIO_MAX
    assert after["read"] == "drawings" and after["hold"] > 1 and PERIOD // hold <= after["drawings"] < PERIOD
    assert after["seam_ratio"] == report["resampled_seam_ratio"] <= loop_mod.SEAM_RATIO_MAX
    assert after["largest_step_ratio"] <= loop_mod.SEAM_RATIO_MAX
    assert report["seam_read"] == {k: after[k] for k in ("read", "drawings", "hold")}
    mean, _, steps = loop_mod._seam_on_cells(_cells(tmp_path, "cut", report))
    assert float(steps.max()) / mean > loop_mod.SEAM_RATIO_MAX


@pytest.mark.slow
@pytest.mark.parametrize("hold", [2, 3])
def test_a_jump_the_ramp_moves_into_a_held_walk_is_refused_as_the_source_frames_refuse_it(tmp_path: Path, hold: int):
    """The sliding walk held, its last drawing moved 10 px right: the ramp spreads the jump over the loop, and between the
    drawings it plays a step is over the limit. The refusal is the source frames', the line `--anchor none` gives."""
    frames = _held(_walk(drift=SLIDE), hold)
    for k in range(PERIOD - hold, PERIOD):
        frames[k] = _moved(frames[k], 10)
    keyed = _keyed(tmp_path, "held", frames)
    message, report = _refused(tmp_path, keyed, "cut")
    assert report["seam_measurement"] == "source-frames" and report["source_projection"]["wrap_dx_px"] != 0
    after = report["seam_after_anchor"]
    assert after["read"] == "drawings" and max(after["seam_ratio"], after["largest_step_ratio"]) > loop_mod.SEAM_RATIO_MAX
    assert f"loop seam ratio {after['source_seam_ratio']:.2f} exceeds" in message
    assert message == _refused(tmp_path, keyed, "none", anchor="none")[0]


@pytest.mark.slow
@pytest.mark.parametrize("walker, hold", [("side walk", 2), ("side walker", 3)])
def test_a_held_walk_motion_auto_cuts_passes_the_seam_gate_on_its_cells_between_their_drawings(tmp_path: Path, walker: str,
                                                                                               hold: int):
    """`--anchor motion-auto` of a held walk, its cut's wrap between two drawings: the gate reads the cells that play
    (`rendered-cells`), frame by frame two or three times their mean step at the wrap, and between their drawings one
    more step. The body anchor gate's side walk on twos, and the step count's side walker on threes."""
    walk = _walk(drift=0.0, n=73) if walker == "side walk" else [_side(k, cycle=24) for k in range(73)]
    keyed = _keyed(tmp_path, "held", _held(walk, hold))
    report = loop_mod.run_loop(keyed, tmp_path / "cut", fps=24.0, state="walk", min_len=None, max_len=None, n_out=None,
                               seam_max=loop_mod.SEAM_RATIO_MAX, name="walk-side", report_path=tmp_path / "cut.json",
                               anchor="motion-auto", repair="off")
    assert report["status"] == "passed" and report["seam_measurement"] == "rendered-cells"
    assert report["seam_read"] == {"read": "drawings", "drawings": report["cycle"]["length"] // hold, "hold": hold}
    assert report["resampled_seam_ratio"] <= loop_mod.SEAM_RATIO_MAX
    mean, wrap, _ = loop_mod._seam_on_cells(_cells(tmp_path, "cut", report))
    assert wrap / mean > loop_mod.SEAM_RATIO_MAX


def _corrected(frames: list[Image.Image]) -> list[Image.Image]:
    """The frames of a motion-auto cut corrected as the cut will be (`loop.seam_on_cells`)."""
    regions, _ = auto_motion.discover(frames, reference_index=0)
    corrected, _ = auto_motion.correct_cycle(frames, regions, coarse_dx=loop_mod.body_wrap_offset(frames, search=motion_anchor.COARSE_SEARCH))
    return corrected


@pytest.mark.slow
@pytest.mark.parametrize("hold", [2, 3])
def test_motion_autos_seam_gate_reads_a_held_cut_between_its_drawings(hold: int):
    """A cut of the held walk from a drawing's first frame, as `--anchor motion-auto` reads a cut of two steps before it
    takes it: corrected, its wrap is two or three times the frames' mean step frame by frame, and between its drawings
    one more step. A last drawing with a band of its body gone, which no correction moves back, is over the limit
    between the drawings too."""
    frames = _held(_walk(drift=0.0), hold)[:PERIOD]
    flat = loop_mod.cell_features(_corrected(frames))
    assert float(np.abs(flat[-1] - flat[0]).mean() / np.abs(flat[1:] - flat[:-1]).mean()) > loop_mod.SEAM_RATIO_MAX
    assert loop_mod.seam_on_cells(frames) <= loop_mod.SEAM_RATIO_MAX
    holed = frames[:PERIOD - hold] + [_holed(f) for f in frames[PERIOD - hold:]]
    assert loop_mod.seam_on_cells(holed) > loop_mod.SEAM_RATIO_MAX
