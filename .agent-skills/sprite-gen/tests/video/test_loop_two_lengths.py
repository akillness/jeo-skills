# SPDX-License-Identifier: Apache-2.0
"""A walk or run cut one step long that nothing counted is cut two lengths long where the clip, as filmed, comes back
nearer two lengths on than one.

The walker's legs swing every 8 frames (0.33 s, under the run's gait floor), the same silhouette each time, while a
shirt down its torso lightens and darkens every 16: the steps' shading differs, the silhouette does not. Its first
frames stand a few pixels higher, which tilts the one vertical slope the motion anchor's analysis fits over the clip,
so on the search's distances 16 frames on reads no nearer than 8 and the search cuts one step. On the frames as filmed
16 frames on is the same picture (`loop._two_lengths`, docs/video-pipeline.md section 4)."""
from __future__ import annotations

import math

import numpy as np
import pytest
from PIL import Image, ImageDraw

from sprite_gen.video import loop
from tests.video import test_gait_fallback as walks
from tests.video.test_loop_half_step import REFUSALS


def shaded(k, *, shirt=20, opening=4):
    """walks.walker on 8 frames a cycle, with a shirt whose grey swings by `shirt` every 16 frames, its first 12 frames
    `opening` px higher."""
    image = walks.walker(k, period=8)
    if shirt:
        x, y = walks.FOOT[0]-15, walks.FOOT[1]-120
        grey = round(140+shirt*math.cos(2*math.pi*k/16))
        ImageDraw.Draw(image).rectangle((x+17, y+40, x+27, y+74), fill=(grey, grey, grey, 255))
    if opening and k < 12:
        raised = Image.new('RGBA', image.size)
        raised.paste(image, (0, -opening))
        image = raised
    return image


def test_two_lengths_on_reads_the_same_frames_two_lengths_and_one_length_on():
    n = 40
    D = np.ones((n, n), dtype=np.float32)
    for j in range(n-16):
        D[j, j+16] = D[j+16, j] = 0.25
    read = loop.two_lengths_on(D, 10, 16, 8)
    assert read == {'context_pair_range': [8, 12], 'near': 0.25, 'one': 1.0, 'ratio': 0.25}
    # Near the clip's end only the frames with one two lengths on are read; past it, none is.
    assert loop.two_lengths_on(D, 25, 16, 8)['context_pair_range'] == [23, 24]
    assert loop.two_lengths_on(D, 30, 16, 8) is None
    # One length on the same picture: two lengths on can come back no nearer, and no ratio is read.
    for j in range(n-8):
        D[j, j+8] = 0
    assert loop.two_lengths_on(D, 10, 16, 8)['ratio'] is None


def test_a_half_step_the_clip_gives_no_two_says_why():
    cycle = {'kind': 'periodic', 'start': 2, 'length': 8, 'step_count': {'readable': False, 'why': 'no feet'},
             'two_lengths': {'taken': False, 'why': 'about the wrap of the nearest, 4/16, the clip two lengths on is 1.02x '
                                                   'as far as one length on, over 0.85: the step comes back no nearer two steps on'}}
    said = loop.half_step(cycle, loop.profile_for('run'), 24.0, state='run', clip_frames=73)
    assert said['two_lengths'] == cycle['two_lengths']['why']
    line, = loop.half_step_verdict({**cycle, 'half_step': said})
    assert '(a half step), and the clip gives it no two (about the wrap of the nearest, 4/16' in line
    assert not any(words in line for words in REFUSALS)


@pytest.mark.slow
def test_a_run_cut_one_step_long_whose_shading_comes_back_two_lengths_on_is_cut_two_lengths_long(tmp_path, capsys):
    code, report, _ = walks.run(tmp_path, [shaded(k) for k in range(73)], '--size-hold', 'off', state='run')
    assert code == 0 and report['status'] == 'passed'
    cycle = report['cycle']
    doubled = cycle['two_lengths']
    # The search cut one step; the clip as filmed comes back two lengths on, at 16 frames and no other.
    assert doubled['taken'] and doubled['first_cut']['length'] == 8
    assert cycle['length'] == 16 and doubled['cut'] == {'start': cycle['start'], 'length': 16}
    assert cycle['steps']['by'] == 'two-lengths' and cycle['steps']['count'] == 2 and 'given' not in cycle['steps']
    ratios = {row['length']: row['ratio'] for row in doubled['tried']}
    assert set(ratios) == {15, 16, 17} and ratios[16] <= loop.period_mod.STEP_RATIO_MAX < min(ratios[15], ratios[17])
    assert 'half_step' not in cycle
    assert '(a half step)' not in capsys.readouterr().err


@pytest.mark.slow
def test_a_run_cut_one_step_long_alike_two_lengths_on_stays_one_step_and_is_named(tmp_path, capsys):
    code, report, _ = walks.run(tmp_path, [shaded(k, shirt=0) for k in range(73)], '--size-hold', 'off', state='run')
    assert code == 0 and report['status'] == 'passed'
    cycle = report['cycle']
    assert cycle['length'] == 8 and 'steps' not in cycle
    assert not cycle['two_lengths']['taken'] and 'no nearer' in cycle['two_lengths']['why']
    assert cycle['half_step']['two_lengths'] == cycle['two_lengths']['why']
    err = capsys.readouterr().err
    warned = [line for line in err.splitlines() if '(a half step)' in line]
    assert len(warned) == 1 and 'the clip gives it no two' in warned[0]
    assert not any(words in err for words in REFUSALS)
