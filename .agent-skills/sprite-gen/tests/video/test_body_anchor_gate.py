# SPDX-License-Identifier: Apache-2.0
"""The seam gate of a cut the body anchor ramps (`--anchor body`, a walk's or run's default).

The body anchor reads the last frame's sideways offset against the first once and shifts frame k by that offset times
k/L, so the loop plays cells that are not the source frames. Where no frame was made the gate reads the source frames,
and a walk that slides a little sideways every frame is refused there although the ramp closed its wrap. Such a cut is
read again on the cells that play (`seam_after_anchor`) and passes on them (`seam_measurement: rendered-cells`) where the
wrap and every step of the loop are within the same limit: the ramp spreads whatever offset the wrap shows, so a jump of
a few frames comes out moved into the loop, not closed, and a step there is as much a seam as the wrap. A cut the source
frames pass, a pinned clip (gated by its pin) and a refusal the cells that play do not overrule are as before: the
refusal is the source frames' own, word for word the one `--anchor none` gives the same cut.

The fixtures are synthetic: a side walk of 24 frames a stride (two legs of two colours and widths swinging, a bobbing
body and head, a swinging arm) whose body slides `drift` pixels to the right every frame, cut with `--body-height 400
--strip-height 640` and `--cycle fixed`, and frames of it moved, torn or holed at the cut's wrap."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from sprite_gen.video import loop as loop_mod
from tests.video.test_loop_repair import _no_rife

PERIOD = 24
DRIFT = 0.10  # pixels a frame: 2.4 px over a stride, a wrap the source frames read three times an ordinary step


def _walk(drift: float = DRIFT, n: int = 60) -> list[Image.Image]:
    """The side walk, its body `drift` pixels further right every frame."""
    out = []
    for i in range(n):
        im = Image.new("RGBA", (220, 180), (0, 0, 0, 0))
        draw = ImageDraw.Draw(im)
        cx = 70 + drift * i
        bob = 2 * math.sin(2 * math.pi * i / PERIOD)
        for x_off, phase, colour, width in ((30, math.pi, (110, 110, 140, 255), 5), (40, 0.0, (40, 40, 60, 255), 9)):
            swing = 16 * math.sin(2 * math.pi * i / PERIOD + phase)
            draw.line([(cx + x_off, 106 + bob), (cx + x_off + swing, 150)], fill=colour, width=width)
        draw.rounded_rectangle([cx + 20, 56 + bob, cx + 56, 108 + bob], 8, fill=(70, 110, 200, 255))
        draw.ellipse([cx + 18, 18 + bob, cx + 58, 58 + bob], fill=(220, 160, 90, 255))
        arm = 12 * math.sin(2 * math.pi * i / PERIOD + math.pi / 2)
        draw.line([(cx + 38, 66 + bob), (cx + 38 + arm, 100 + bob)], fill=(200, 90, 70, 255), width=7)
        out.append(im)
    return out


def _moved(im: Image.Image, dx: int, dy: int = 0) -> Image.Image:
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im, (dx, dy))
    return out


def _torn(im: Image.Image, dx: int, below: int = 80) -> Image.Image:
    """The rows above `below` (head and torso) moved dx sideways, the legs left where they were."""
    out = im.copy()
    out.paste(Image.new("RGBA", (im.width, below), (0, 0, 0, 0)), (0, 0))
    out.paste(_moved(im.crop((0, 0, im.width, below)), dx), (0, 0))
    return out


def _holed(im: Image.Image, y0: int = 50, y1: int = 90) -> Image.Image:
    """A band of the body (rows y0..y1) gone."""
    out = im.copy()
    out.paste(Image.new("RGBA", (im.width, y1 - y0), (0, 0, 0, 0)), (0, y0))
    return out


def _keyed(root: Path, name: str, frames: list[Image.Image]) -> Path:
    keyed = root / f"{name}-keyed"
    keyed.mkdir(parents=True)
    for k, im in enumerate(frames):
        im.save(keyed / f"frame-{k:03d}.png")
    return keyed


def _cut(root: Path, keyed: Path, name: str, **kw) -> dict:
    """`video-loop --state walk` of the keyed frames, the anchor the walk's default (body) unless one is given."""
    kw = {"cycle_mode": "fixed", "start": 0, "length": PERIOD, "repair": "off", "seam_max": loop_mod.SEAM_RATIO_MAX, **kw}
    return loop_mod.run_loop(keyed, root / name, fps=24.0, state="walk", min_len=None, max_len=None, n_out=None,
                             name="walk-side", report_path=root / f"{name}.json", body_height=400, strip_height=640, **kw)


def _refused(root: Path, keyed: Path, name: str, **kw) -> tuple[str, dict]:
    with pytest.raises(SystemExit) as exc:
        _cut(root, keyed, name, **kw)
    return str(exc.value), json.loads((root / f"{name}.json").read_text())


@pytest.mark.slow
@pytest.mark.parametrize("start", [0, 3, 6, 12])
def test_a_walk_that_slides_sideways_passes_on_the_cells_the_ramp_plays(tmp_path: Path, start: int):
    """A cut of one stride, from wherever it starts: the source frames read its wrap about three times an ordinary
    step (the 2.4 px the body slid), the ramp moves it back, and the cells that play close."""
    keyed = _keyed(tmp_path, "walk", _walk())
    report = _cut(tmp_path, keyed, "cut", start=start)
    assert report["status"] == "passed" and report["strip"]["foot_anchor"] == "body" and report["strip"]["wrap_dx_px"] != 0
    assert report["seam_measurement"] == "rendered-cells"
    after = report["seam_after_anchor"]
    assert after["source_seam_ratio"] > loop_mod.SEAM_RATIO_MAX
    assert after["seam_ratio"] == report["resampled_seam_ratio"] < loop_mod.SEAM_RATIO_MAX
    assert after["largest_step_ratio"] <= loop_mod.SEAM_RATIO_MAX
    # the source frames' refusal, as the same cut without the anchor gives it
    message, refused = _refused(tmp_path, keyed, "none", start=start, anchor="none")
    assert f"loop seam ratio {after['source_seam_ratio']:.2f} exceeds" in message
    assert refused["seam_measurement"] == "source-frames" and "seam_after_anchor" not in refused


@pytest.mark.slow
def test_the_walk_passes_as_cut_again_by_hand_with_the_repair_on_and_as_found(tmp_path: Path, monkeypatch):
    """The walk cut again by hand with the repair as it runs by default, and the stride the search finds: the repair
    makes no frame (none is off the flow), so the gate's reading of the cells that play is what passes them."""
    _no_rife(monkeypatch, tmp_path)
    keyed = _keyed(tmp_path, "walk", _walk())
    for name, kw in (("fixed", {"repair": "auto"}), ("found", {"cycle_mode": "auto", "start": None, "length": None, "repair": "auto"})):
        report = _cut(tmp_path, keyed, name, **kw)
        assert report["status"] == "passed" and report["jump_repair"]["replaced"] == []
        assert report["seam_measurement"] == "rendered-cells" and report["strip"]["wrap_dx_px"] != 0
        assert report["seam_after_anchor"]["source_seam_ratio"] > loop_mod.SEAM_RATIO_MAX
        assert report["resampled_seam_ratio"] == report["seam_after_anchor"]["seam_ratio"] < loop_mod.SEAM_RATIO_MAX


def _spoiled(at: tuple[int, ...], spoil) -> list[Image.Image]:
    frames = _walk()
    for k in at:
        frames[k] = spoil(frames[k])
    return frames


REFUSED = {
    # a frame of the wrap moved sideways: the ramp spreads its jump over the loop and leaves it a step into it
    "last frame 10 px right": ((PERIOD - 1,), lambda im: _moved(im, 10), {}),
    "first frame 10 px left": ((0,), lambda im: _moved(im, -10), {}),
    "last frame 4 px right": ((PERIOD - 1,), lambda im: _moved(im, 4), {}),
    # two, three or four frames of the wrap moved together: the jump is as many steps into the loop
    "last two frames 10 px right": ((PERIOD - 2, PERIOD - 1), lambda im: _moved(im, 10), {}),
    "first three frames 10 px right": ((0, 1, 2), lambda im: _moved(im, 10), {}),
    "first four frames 10 px right": ((0, 1, 2, 3), lambda im: _moved(im, 10), {}),
    # torn across, a band gone, moved down: no sideways offset closes these
    "last frame torn 12 px": ((PERIOD - 1,), lambda im: _torn(im, 12), {}),
    "first frame holed": ((0,), _holed, {}),
    "first frame 8 px down": ((0,), lambda im: _moved(im, 0, 8), {}),
    # a cut off the stride: the pose at the wrap is not the first
    "a cut of 18": ((), None, {"length": 18}),
    "a cut of 28": ((), None, {"length": 28}),
}


@pytest.mark.slow
@pytest.mark.parametrize("case", list(REFUSED))
def test_a_wrap_the_ramp_does_not_close_is_refused_as_the_source_frames_refuse_it(tmp_path: Path, case: str):
    at, spoil, kw = REFUSED[case]
    keyed = _keyed(tmp_path, "walk", _spoiled(at, spoil) if at else _walk())
    message, report = _refused(tmp_path, keyed, "cut", **kw)
    assert report["seam_measurement"] == "source-frames" and report["source_projection"]["wrap_dx_px"] != 0
    after = report["seam_after_anchor"]
    assert max(after["seam_ratio"], after["largest_step_ratio"]) > loop_mod.SEAM_RATIO_MAX
    assert f"loop seam ratio {after['source_seam_ratio']:.2f} exceeds" in message
    assert message == _refused(tmp_path, keyed, "none", anchor="none", **kw)[0]


@pytest.mark.slow
def test_a_cut_the_source_frames_pass_is_not_read_again(tmp_path: Path):
    """The walk with no slide (the anchor moves nothing), the sliding walk under a limit its source frames pass, and a
    walk whose first frame moved 3 px, which the source frames pass: the gate's reading is the source frames', the
    ratio of the same cut without the anchor. The 3 px take up the slide's 2.3 px at the wrap and put the jump on the
    step into frame 1, which the step gate refuses after the seam gate passed the wrap."""
    still = _keyed(tmp_path, "still", _walk(drift=0.0))
    sliding = _keyed(tmp_path, "sliding", _walk())
    nudged = _keyed(tmp_path, "nudged", _spoiled((0,), lambda im: _moved(im, 3)))
    reports = {}
    for keyed, kw in ((still, {}), (sliding, {"seam_max": 1000.0})):
        report = reports[keyed] = _cut(tmp_path, keyed, f"{keyed.name}-body", **kw)
        plain = _cut(tmp_path, keyed, f"{keyed.name}-none", anchor="none", **kw)
        assert report["status"] == "passed" and report["seam_measurement"] == "source-frames"
        assert "seam_after_anchor" not in report
        assert report["resampled_seam_ratio"] == plain["resampled_seam_ratio"]
    assert reports[still]["strip"]["wrap_dx_px"] == 0 and reports[sliding]["strip"]["wrap_dx_px"] != 0
    # the sliding walk's source frames read over the default limit: the forced limit passes them as they read
    assert reports[sliding]["resampled_seam_ratio"] > loop_mod.SEAM_RATIO_MAX
    message, report = _refused(tmp_path, nudged, "nudged-body")
    plain = _refused(tmp_path, nudged, "nudged-none", anchor="none")[1]
    assert report["seam_measurement"] == "source-frames" and "seam_after_anchor" not in report
    assert report["source_projection"]["wrap_dx_px"] != 0
    assert report["resampled_seam_ratio"] == plain["resampled_seam_ratio"] <= loop_mod.SEAM_RATIO_MAX
    assert message.startswith("video-loop: loop step ratio") and "into frame 1," in message
    assert report["seam_refusal"]["reading"] == plain["seam_refusal"]["reading"] == "steps"


@pytest.mark.slow
def test_a_pinned_walk_is_gated_by_its_pin_and_read_on_its_source_frames(tmp_path: Path):
    """A clip pinned to end on its first frame: the cut is every frame but the last, and the gate is the pin. The
    sliding walk's wrap reads over the seam limit on the source frames and the ramp moves its cells, but nothing is
    refused, so nothing is read again."""
    frames = _walk()[:PERIOD]
    keyed = _keyed(tmp_path, "pinned", [*frames, frames[0]])
    report = _cut(tmp_path, keyed, "cut", cycle_mode="pinned", start=None, length=None)
    assert report["status"] == "passed" and report["cycle"]["kind"] == "pinned" and report["strip"]["wrap_dx_px"] != 0
    assert report["resampled_seam_ratio"] > loop_mod.SEAM_RATIO_MAX
    assert report["seam_measurement"] == "source-frames" and "seam_after_anchor" not in report
