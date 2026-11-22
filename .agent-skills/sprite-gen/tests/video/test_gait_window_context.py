"""A locally convincing seam must not outrank a coherent repeating trajectory."""
from __future__ import annotations

import math

import pytest

from sprite_gen._deps import np
from sprite_gen.video import loop


def _changing_cadence(*, reverse: bool) -> np.ndarray:
    """Steady fractional-period motion followed by an irregular cadence.

    A chance endpoint match in the irregular section looks like a normal playback
    step, although the neighbouring poses do not repeat at that interval.
    Reversing time places the coherent region at the end instead.
    """
    t = np.arange(150, dtype=float)
    phase = t * 2 * math.pi / 24.5
    phase[75:] += 0.7 * np.sin(np.arange(75) * 0.63)
    points = np.stack([np.cos(phase), np.sin(phase)], axis=1)
    if reverse:
        points = points[::-1]
    return np.linalg.norm(points[:, None] - points[None, :], axis=-1).astype(np.float32)


@pytest.mark.parametrize("reverse", [False, True])
def test_gait_prefers_a_coherent_region_over_a_lucky_seam(reverse: bool) -> None:
    D = _changing_cadence(reverse=reverse)
    result = loop.detect_cycle(D, min_len=20, max_len=28, gait_floor=8)
    start, length = result["start"], result["length"]
    if reverse:
        assert start >= 75, "the clean region can be at the end, not only at the beginning"
    else:
        assert start + length <= 75, "an accidental seam in irregular motion must lose"
    assert length == 24
    assert 0.75 < result["ratio"] < 2.0


def test_context_measurement_is_reported_at_the_selected_boundary() -> None:
    D = _changing_cadence(reverse=False)
    result = loop.detect_cycle(D, min_len=20, max_len=28, gait_floor=8)
    evidence = result["selection"]
    start, length = result["start"], result["length"]
    first, stop = evidence["context_pair_range"]
    assert 0 <= first <= start < stop <= len(D) - length
    measured = float(np.mean([D[j, j + length] for j in range(first, stop)]))
    assert evidence["context_repeat_error"] == pytest.approx(measured)
    assert evidence["context_repeat_over_step"] == pytest.approx(measured / result["inner_mean_adjacent"])
    assert evidence["method"] == "repeat-context-and-wrap"


def test_non_gait_keeps_its_wrap_only_selection() -> None:
    result = loop.detect_cycle(_changing_cadence(reverse=False), min_len=20, max_len=28)
    assert result["start"] == 102
    assert result["length"] == 23
    assert "selection" not in result


def test_exact_gait_remains_a_single_period() -> None:
    t = np.arange(96) % 24
    phase = t * 2 * math.pi / 24
    points = np.stack([np.cos(phase), np.sin(phase)], axis=1)
    D = np.linalg.norm(points[:, None] - points[None, :], axis=-1).astype(np.float32)
    result = loop.detect_cycle(D, min_len=10, max_len=40, gait_floor=8)
    assert result["length"] == 24
    assert not result["half_period_guard"]["applied"]
    assert result["ratio"] == pytest.approx(1.0)
