"""Synthetic return/repeat contracts; no private production images or measurements."""
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from sprite_gen.video import loop


def distances(values):
    values = np.asarray(values, dtype=np.float32)
    return np.abs(values[:, None] - values[None, :])


@pytest.mark.parametrize('period', [37, 43])
def test_attack_window_observes_slow_repeats(period):
    n = 73
    values = np.sin(2 * np.pi * np.arange(n) / period)
    lo, hi = loop.profile_for('attack').window(n, 24)
    cycle = loop.detect_cycle(distances(values), min_len=lo, max_len=hi)
    assert cycle['period_global'] == period
    assert cycle['repeat_pairs'] == n - period
    assert cycle['periodicity'] >= loop.periodicity_floor(n, period, partial_repeat=True)
    assert cycle['ratio'] <= 2


def test_sparse_repeat_evidence_needs_a_deeper_dip():
    floors = [loop.periodicity_floor(73, lag, partial_repeat=True) for lag in (20, 37, 43, 60, 71)]
    assert floors == sorted(floors)
    assert floors[0] == loop.PERIODICITY_MIN
    assert floors[2] > .4 and floors[-1] > .95
    assert loop.periodicity_floor(73, 44, partial_repeat=True) > .30


@pytest.mark.parametrize('values', [
    np.zeros(48),
    np.linspace(0, 1, 48),
    np.linspace(1, 0, 48),
    np.r_[np.zeros(24), np.linspace(0, 1, 24)],
    np.r_[np.linspace(1, 0, 24), np.zeros(24)],
])
def test_one_shot_needs_both_observed_rest_sides(values):
    with pytest.raises(loop.CycleSelectionError, match='no complete one-shot return'):
        loop.detect_one_shot(distances(values), min_len=4, max_len=48, frame_mass=np.ones(48))


def test_later_return_survives_an_initial_truncated_excursion():
    values = np.r_[np.linspace(2, 0, 12), np.zeros(8),
                   np.sin(np.linspace(0, np.pi, 20)), np.zeros(8)]
    cycle = loop.detect_one_shot(distances(values), min_len=4, max_len=48, frame_mass=np.ones(48))
    a, b = cycle['excursion']
    assert 20 <= a <= b < 40
    assert cycle['start'] < a and cycle['start'] + cycle['length'] - 1 > b
    assert cycle['ratio'] <= 2


def test_extended_strike_is_not_assumed_to_be_rest():
    values = np.r_[np.zeros(6), np.linspace(0, 1, 6), np.ones(26), np.linspace(1, 0, 6), np.zeros(6)]
    D = distances(values)
    assert values[int(np.argmin(D.mean(axis=1)))] == 1
    cycle = loop.detect_one_shot(D, min_len=4, max_len=50, frame_mass=np.ones(50))
    assert cycle['start'] < 12 and cycle['start'] + cycle['length'] > 38
    assert cycle['return_distance_over_departure'] <= .25


def test_failure_report_preserves_periodic_and_return_attempts(tmp_path: Path):
    import json
    keyed = tmp_path / 'keyed'
    keyed.mkdir()
    for i in range(48):
        im = Image.new('RGBA', (32, 32))
        im.paste((200, 80, 40, 255), (12, 8, 20, 28))
        im.save(keyed / f'{i:04d}.png')
    target = tmp_path / 'report.json'
    with pytest.raises(SystemExit):
        loop.run_loop(keyed, tmp_path / 'out', fps=24, state='attack', min_len=None,
                      max_len=None, n_out=None, seam_max=2, name='attack', report_path=target)
    report = json.loads(target.read_text(), parse_constant=lambda value: pytest.fail(value))
    assert report['status'] == 'failed'
    assert report['cycle']['kind'] == 'one-shot'
    assert report['cycle']['candidates'] == []
    attempt = report['periodic_attempt']
    assert attempt['window'] == report['window']
    assert attempt['repeat_pairs'] > 0
    assert attempt['candidates'][0]['inner_mean_adjacent'] == 0
    assert attempt['candidates'][0]['ratio'] is None


def test_weak_partial_repeat_is_refused_and_reported(tmp_path, monkeypatch):
    import json
    n = 73
    keyed = tmp_path / 'keyed'
    keyed.mkdir()
    for i in range(n):
        Image.new('RGBA', (8, 8)).save(keyed / f'{i:04d}.png')
    D = np.ones((n, n), dtype=np.float32)
    np.fill_diagonal(D, 0)
    for i in range(n - 44):
        D[i, i + 44] = D[i + 44, i] = .7
    monkeypatch.setattr(loop, 'distance_matrix', lambda files: D)
    monkeypatch.setattr(loop, 'frame_masses', lambda files: np.ones(n))
    target = tmp_path / 'weak.json'
    with pytest.raises(SystemExit, match='no periodic cycle'):
        loop.run_loop(keyed, tmp_path / 'out', fps=24, state='attack', min_len=None,
                      max_len=None, n_out=None, seam_max=2, name='weak', report_path=target,
                      cycle_mode='periodic')
    report = json.loads(target.read_text())
    cycle = report['cycle']
    assert cycle['period_global'] == 44
    assert .15 < cycle['periodicity'] < cycle['periodicity_min']
    assert cycle['repeat_pairs'] == 29
    assert report['status'] == 'failed'
