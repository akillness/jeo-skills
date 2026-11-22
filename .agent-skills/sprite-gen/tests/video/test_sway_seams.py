"""`video-sway-inspect` seams with three regions: a point where a third region moves more than the pair is no seam.

`video-sway` moves a pixel by the largest of every region's weighted move. Where two regions meet, the move's gradient
jumps from one's to the other's and a line bends — unless a third region moves that pixel more than both: then neither
of the two moves it, and the curve where they are equal is no seam there. Counted two at a time, a pair's seam was read
under a third region that covers it. On the synthetic figure of the inspection's tests.
"""
import math

from sprite_gen.video import sway_inspect

from tests.video.test_follow_inspect import strip_dir

A, B = (52.0, 72.0, 12.0, 12.0), (68.0, 72.0, 12.0, 12.0)  # side by side: they meet down x = 60, carried


def weight(x, y, ellipse):
    cx, cy, rx, ry = ellipse
    r = math.hypot((x-cx)/rx, (y-cy)/ry)
    return math.cos(r*math.pi/2)**2 if r < 1 else 0.0


def carried(cell, i):
    return tuple(cell['regions'][i]['ellipse'])


def inspect(tmp_path, name, regions):
    return sway_inspect.inspect_loop(strip_dir(tmp_path/f'loop-{name}'), regions, tmp_path/f'out-{name}', gain=1.0, on_fold='lower')


def pair_seams(record, pair):
    return [(cell, seam) for cell in record['cells'] for seam in cell['seams'] if seam['regions'] == pair]


def test_two_regions_meet_where_their_weights_cross(tmp_path):
    record = inspect(tmp_path, 'two', [A, B])
    assert record['schema_version'] == 3
    found = pair_seams(record, [0, 1])
    assert found and record['seams'] and record['seams'][0]['regions'] == [0, 1]


def test_a_third_region_over_the_whole_curve_leaves_the_pair_no_seam(tmp_path):
    over = (60.0, 72.0, 26.0, 26.0)  # at every point of x = 60 inside both, its weight is the larger
    record = inspect(tmp_path, 'covered', [A, B, over])
    assert pair_seams(record, [0, 1]) == []
    assert all(entry['regions'] != [0, 1] for entry in record['seams'])
    assert record['seams'], 'the third region meets the two, and those seams are kept'


def test_a_third_region_over_part_of_the_curve_leaves_the_rest(tmp_path):
    top = (60.0, 66.0, 5.0, 5.0)  # over the top of x = 60 only
    record = inspect(tmp_path, 'part', [A, B, top])
    found = pair_seams(record, [0, 1])
    assert found
    for cell, seam in found:
        x, y = seam['at']
        assert weight(x, y, carried(cell, 2)) <= max(weight(x, y, carried(cell, 0)), weight(x, y, carried(cell, 1))) + 1e-6
    alone = inspect(tmp_path, 'alone', [A, B])
    # The largest seam of the two alone is under the top region's reach in no cell where it is kept here.
    assert max(seam['jump'] for _, seam in found) <= max(seam['jump'] for _, seam in pair_seams(alone, [0, 1])) + 1e-9
