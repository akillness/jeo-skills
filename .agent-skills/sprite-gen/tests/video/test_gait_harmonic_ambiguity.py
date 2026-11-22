"""Ambiguous gaits retain both phases without a fixed cut or a slower frame rate."""
from __future__ import annotations

import numpy as np
import pytest

from sprite_gen.video import loop


def _repeat_distances(period=13, *, noise=0.0, drift=0.0):
    t = np.arange(period * 12)
    angle = t * 2 * np.pi / period
    points = np.column_stack([np.cos(angle), np.sin(angle), drift * t])
    rng = np.random.default_rng(31)
    nuisance = rng.normal(0, noise, (len(t), 12))
    points = np.column_stack([points, nuisance])
    return np.abs(points[:, None] - points[None, :]).mean(axis=2).astype(np.float32)


def test_noisy_harmonic_above_duration_floor_retains_both_occurrences():
    D = _repeat_distances(noise=0.02)
    plain = loop.detect_cycle(D, min_len=7, max_len=29)
    gait = loop.detect_cycle(D, min_len=7, max_len=29, gait_floor=8)
    assert plain['period_global'] == 13
    assert gait['period_global'] == 26
    assert gait['length'] in (25, 26, 27)
    assert gait['half_period_guard']['reason'] == 'ambiguous-harmonic'
    assert gait['half_period_guard']['from'] == 13
    assert gait['review_recommended'] is True


@pytest.mark.parametrize('noise', [0.0001])
def test_exact_or_near_exact_fast_repeat_is_not_doubled(noise):
    cycle = loop.detect_cycle(_repeat_distances(noise=noise), min_len=7, max_len=29, gait_floor=8)
    assert cycle['period_global'] == 13
    assert cycle['half_period_guard']['applied'] is False
    assert cycle['review_recommended'] is False


def test_ambiguity_policy_never_expands_the_callers_window():
    cycle = loop.detect_cycle(_repeat_distances(noise=0.02), min_len=7, max_len=20, gait_floor=8)
    assert cycle['period_global'] == 13
    assert cycle['length'] <= 20
    assert cycle['half_period_guard']['applied'] is False


def test_worsening_repeat_does_not_trigger_harmonic_extension():
    cycle = loop.detect_cycle(_repeat_distances(noise=0.02, drift=0.08), min_len=7, max_len=29, gait_floor=8)
    assert cycle['period_global'] == 13
    assert cycle['half_period_guard']['applied'] is False


def test_non_gait_keeps_the_shortest_credible_repeat():
    cycle = loop.detect_cycle(_repeat_distances(noise=0.02), min_len=7, max_len=29)
    assert cycle['period_global'] == 13
    assert cycle['review_recommended'] is False
