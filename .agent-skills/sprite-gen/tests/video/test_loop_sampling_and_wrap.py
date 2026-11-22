"""Loop cuts preserve an ordinary playback step at the wrap."""

from __future__ import annotations

import math
from pathlib import Path

import pytest
from PIL import Image

from sprite_gen._deps import np
from sprite_gen.video import loop as loop_mod


def _walker(tmp_path: Path, *, period: int, n: int, size=(64, 64)) -> list[Path]:
    """A walker whose stride is `period` frames, with a near/far marker so the half
    period is distinguishable — the same body in a 1 s, 2 s or 3 s clip."""
    d = tmp_path / "keyed"
    d.mkdir(parents=True, exist_ok=True)
    files = []
    for t in range(n):
        im = Image.new("RGBA", size, (0, 0, 0, 0))
        for y in range(10, 40):
            for x in range(26, 38):
                im.putpixel((x, y), (200, 60, 60, 255))
        phase = 2 * math.pi * t / period
        leg_x = 32 + round(10 * math.sin(phase))
        for y in range(40, 58):
            for x in range(leg_x - 3, leg_x + 3):
                if 0 <= x < size[0]:
                    im.putpixel((x, y), (60, 60, 200, 255))
        if math.sin(phase) >= 0:
            im.putpixel((leg_x, 50), (255, 255, 0, 255))
        f = d / f"f{t:03d}.png"
        im.save(f)
        files.append(f)
    return files


def test_the_cut_is_scored_on_the_step_that_plays_not_the_frame_after_it(tmp_path: Path) -> None:
    """A non-integer period is where the two metrics disagree, and the wrap step is the
    one a viewer sees: too small means the last frame repeats the first and the loop
    freezes for a frame."""
    files = _walker(tmp_path, period=12, n=96)
    D = loop_mod.distance_matrix(files)
    cycle = loop_mod.detect_cycle(D, min_len=4, max_len=40)
    i, L = cycle["start"], cycle["length"]
    adjacent = np.array([D[k, k + 1] for k in range(len(files) - 1)])
    inner = float(adjacent[i : i + L - 1].mean())
    # `seam`/`ratio` report D[i+L-1, i] — the transition from the last shown frame back
    # to the first — not D[i, i+L].
    assert cycle["seam"] == pytest.approx(float(D[i + L - 1, i]), rel=1e-9)
    assert cycle["ratio"] == pytest.approx(cycle["seam"] / inner, rel=1e-9)
    # and it is a real step of the cycle, never a stall
    assert cycle["ratio"] > 0.5


def test_a_stall_at_the_wrap_loses_to_an_ordinary_step() -> None:
    """A non-integer period is exactly where the two metrics disagree.

    Frames walk around a circle with a synthetic 24.5-frame period. L=25 puts the last shown frame half a step from the
    first (wrap 0.50x: the loop freezes for a frame); L=24 plays an ordinary step.
    """
    period, n = 24.5, 60
    angle = np.arange(n) * 2 * math.pi / period
    points = np.stack([np.cos(angle), np.sin(angle)], axis=1)
    D = np.linalg.norm(points[:, None, :] - points[None, :, :], axis=-1).astype(np.float32)
    adjacent = float(np.mean([D[k, k + 1] for k in range(n - 1)]))
    # the situation, stated: L=25 stalls, L=24 does not
    assert D[24, 0] / adjacent == pytest.approx(0.50, abs=0.05)
    assert D[23, 0] / adjacent == pytest.approx(1.49, abs=0.05)

    cycle = loop_mod.detect_cycle(D, min_len=20, max_len=28)
    assert cycle["length"] == 24
    assert cycle["ratio"] > 0.75, "a cut that repeats its first frame at the wrap must lose"
