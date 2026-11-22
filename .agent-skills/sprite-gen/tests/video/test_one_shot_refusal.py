# SPDX-License-Identifier: Apache-2.0
"""A one-shot refusal says the condition the clip failed (docs/video-pipeline.md, "One-shot actions"). Where no pair of
frames comes back to a pose it left within a quarter of its departure, the line names the closest return: the pair, how
far it is from its departure and its moved, not the moved of the returned pairs, of which there are none. A clip that
never departs still says it never leaves its rest pose. A body that crosses the canvas is refused so, as are a pose that
does not come back and a stand that jitters; the same leap that comes back in place is cut. Figures drawn with
rectangles; no real footage."""

from __future__ import annotations

import json
import math
import os
import re
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from sprite_gen.video import loop as loop_mod
from tests.video.held_fill_inputs import save

W, H = 360, 160
FLOOR = 150
REST, ACTION = 30, 24  # rest long enough that a cut from rest to rest fits the jump's window (`CutWindow`)
X0, X1 = 40, 280  # where the body stands before the leap, and after it where it crosses the canvas
CLOSEST = re.compile(r"no complete one-shot return — the clip does not come back to a pose it left: the closest return, "
                     r"frames (\d+)-(\d+), is ([\d.]+) of its departure away, over 0\.25 \(moved ([\d.]+), need 0\.4\)$")


def figure(x: int, *, crouch: float = 0.0, lift: int = 0, arms: str = "down", legs: str = "together") -> Image.Image:
    """A body of rectangles standing with its feet at `x`: legs bent by `crouch` (0..1), `together`, `tucked` up under
    it or `apart` in a wide stance, raised `lift` px off the floor, arms hanging (`down`), overhead (`up`) or held out in
    front (`out`)."""
    a = np.zeros((H, W, 4), dtype=np.uint8)
    leg = round(40 * (1 - 0.35 * crouch) * (0.5 if legs == "tucked" else 1))
    feet = FLOOR - lift - (20 if legs == "tucked" else 0)
    hip = feet - leg
    spread = 7 if legs == "apart" else 0
    a[hip:feet, x - 7 - spread:x - 1 - spread] = (60, 60, 200, 255)  # legs
    a[hip:feet, x + 1 + spread:x + 7 + spread] = (60, 60, 200, 255)
    a[hip - 40:hip, x - 8:x + 8] = (200, 80, 30, 255)  # torso
    a[hip - 54:hip - 42, x - 6:x + 6] = (230, 190, 160, 255)  # head
    if arms == "down":
        a[hip - 38:hip - 4, x + 8:x + 14] = (60, 60, 60, 255)
    elif arms == "up":
        a[hip - 72:hip - 38, x + 8:x + 14] = (60, 60, 60, 255)
    else:
        a[hip - 38:hip - 32, x + 8:x + 42] = (60, 60, 60, 255)
    return Image.fromarray(a, "RGBA")


def leap(*, x1: int = X1, comes_back: bool = True) -> list[Image.Image]:
    """Standing still at X0; a crouch deepening into the take-off, legs together and arms down; up with the arms overhead
    and the legs tucked, down with the arms out and the legs apart, the body carried to `x1`; a landing crouch easing up
    in the wide stance, arms out; standing still at `x1` as at X0, or, `comes_back` False, staying in the landing's
    stance. No two frames of the take-off, the air and the landing are one picture: the clip comes back to its rest
    pose, or to no pose it left."""
    frames = [figure(X0)] * REST
    for k in range(ACTION):
        t = (k + 1) / (ACTION + 1)
        x = round(X0 + (x1 - X0) * min(1.0, max(0.0, (t - 0.2) / 0.6)))
        if t < 0.2:
            frames.append(figure(x, crouch=t / 0.2))
        elif t < 0.8:  # in the air, off the floor: at 0.8 the feet are down, the landing's deepest crouch
            up = t < 0.5
            frames.append(figure(x, lift=round(30 * math.sin(math.pi * (t - 0.2) / 0.6)), arms="up" if up else "out",
                                 legs="tucked" if up else "apart"))
        else:
            frames.append(figure(x, crouch=(1.0 - t) / 0.2, arms="out", legs="apart"))
    return frames + [figure(x1) if comes_back else figure(x1, arms="out", legs="apart")] * REST


def jitter(count: int = 2 * REST + ACTION, seed: int = 0) -> list[Image.Image]:
    """The body standing in place, moved up to 3 px along and up or down every frame: no action."""
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(count):
        im = np.asarray(figure(X0 + int(rng.integers(-3, 4))))
        out.append(Image.fromarray(np.roll(im, int(rng.integers(-3, 4)), axis=0), "RGBA"))
    return out


def _no_rife(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.delenv("SPRITE_GEN_RIFE", raising=False)
    path = [d for d in os.environ.get("PATH", "").split(os.pathsep) if d and not (Path(d) / "rife-ncnn-vulkan").exists()]
    monkeypatch.setenv("PATH", os.pathsep.join(path))
    monkeypatch.setenv("SPRITE_GEN_DATA_DIR", str(tmp_path / "data"))


def _cut(tmp_path: Path, frames: list[Image.Image], name: str) -> dict:
    """`video-loop --cycle one-shot --anchor none --state jump`, as a single play with no end frame is cut."""
    keyed = save(frames, tmp_path / f"{name}-keyed")
    return loop_mod.run_loop(keyed, tmp_path / f"{name}-out", fps=24.0, min_len=None, max_len=None, n_out=None,
                             seam_max=loop_mod.SEAM_RATIO_MAX, name=name, report_path=tmp_path / f"{name}.json",
                             state="jump", cycle_mode="one-shot", anchor="none")


def _closest(tmp_path: Path, frames: list[Image.Image], name: str) -> tuple[re.Match, dict]:
    with pytest.raises(SystemExit) as refused:
        _cut(tmp_path, frames, name)
    said = CLOSEST.search(str(refused.value))
    assert said, str(refused.value)
    report = json.loads((tmp_path / f"{name}.json").read_text())
    assert report["status"] == "failed" and report["cycle"]["candidates"] == []
    return said, report


def test_a_body_that_crosses_the_canvas_is_refused_on_its_closest_return(tmp_path, monkeypatch):
    """No pair of frames comes back to a pose it left (the body lands where it did not leave): the line says the pair that
    came closest, how far from its departure, and how far it moved, which was not none."""
    _no_rife(monkeypatch, tmp_path)
    frames = leap()
    said, report = _closest(tmp_path, frames, "leap")
    start, end, ratio, moved = int(said[1]), int(said[2]), float(said[3]), float(said[4])
    assert ratio > loop_mod.ONE_SHOT_RETURN_MAX and moved > 0
    closest = report["cycle"]["closest_return"]
    assert closest["pair"] == [start, end]
    assert f"{closest['ratio']:.2f}" == said[3] and f"{closest['moved']:.2f}" == said[4]
    # The least return over departure of every pair the search read, in the window it searched.
    files = sorted((tmp_path / "leap-keyed").glob("*.png"))
    D = loop_mod.distance_matrix(files)
    lo, hi = report["window"]
    shortest, longest = loop_mod.ONE_SHOT_MIN_LEN, hi
    ratios = {}
    for s in range(len(D) - loop_mod.ONE_SHOT_MIN_LEN + 1):
        for e in range(s + shortest - 1, min(len(D), s + longest)):
            departure = float(((D[s] + D[e]) / 2)[s:e + 1].max()) - float(D[s, e]) / 2
            if departure > 0:
                ratios[s, e] = float(D[s, e]) / departure
    best = min(ratios, key=ratios.get)
    assert list(best) == closest["pair"] and ratios[best] == pytest.approx(closest["ratio"])
    assert hi >= ACTION + 2 * loop_mod.ONE_SHOT_PAD  # the leap and a rest frame or two each side fit the window searched


def test_the_same_leap_in_place_is_cut_from_rest_to_rest(tmp_path, monkeypatch):
    """The fixture's return is one the search reads: in place, the leap that comes back is cut, the take-off's rest to
    the landing's."""
    _no_rife(monkeypatch, tmp_path)
    cycle = _cut(tmp_path, leap(x1=X0), "hop")["cycle"]
    assert cycle["kind"] == "one-shot"
    start, end = cycle["return_pair"]
    assert start < REST and end >= REST + ACTION


def test_a_pose_that_does_not_come_back_is_refused_on_its_closest_return(tmp_path, monkeypatch):
    """In place, but the take-off's crouch and the landing's are two pictures and the clip ends in the landing's stance:
    nothing in it comes back to a pose it left."""
    _no_rife(monkeypatch, tmp_path)
    said, _ = _closest(tmp_path, leap(x1=X0, comes_back=False), "stays")
    assert float(said[3]) > loop_mod.ONE_SHOT_RETURN_MAX


def test_a_stand_that_jitters_in_place_is_refused(tmp_path, monkeypatch):
    """A body moved a few px along and up or down every frame performs no action, so no cut."""
    _no_rife(monkeypatch, tmp_path)
    with pytest.raises(SystemExit, match="no complete one-shot return"):
        _cut(tmp_path, jitter(), "jitter")


def test_a_clip_that_never_departs_still_says_it_never_leaves_its_rest_pose():
    """No pair departs, so there is no closest return to name: the line is the one it was."""
    D = np.zeros((20, 20), dtype=np.float32)
    with pytest.raises(loop_mod.CycleSelectionError,
                       match=r"never leaves its rest pose and returns with observed endpoints \(moved 0\.00, need 0\.4\)") as refused:
        loop_mod.detect_one_shot(D, min_len=4, max_len=20, frame_mass=np.ones(20))
    assert "closest_return" not in refused.value.diagnostics
