# SPDX-License-Identifier: Apache-2.0
"""Weapon motion must not change the size of an unchanged body in an image row."""
import pytest
from PIL import Image, ImageDraw
from sprite_gen.frames import extract


def attack_strip():
    strip = Image.new('RGBA', (720, 240))
    for i in range(3):
        pose = Image.new('RGBA', (240, 240))
        draw = ImageDraw.Draw(pose)
        draw.rectangle((20, 90, 79, 209), fill=(220, 30, 30, 255))
        if i == 1:  # lift a weapon above the unchanged body
            draw.rectangle((40, 10, 49, 89), fill=(30, 30, 220, 255))
        if i == 2:  # extend that weapon to the right
            draw.rectangle((80, 100, 204, 109), fill=(30, 30, 220, 255))
        strip.alpha_composite(pose, (i * 240, 0))
    return strip


def red_body_size(frame):
    mask = Image.new('L', frame.size)
    mask.putdata([255 if r > 180 and g < 80 and b < 80 and a > 128 else 0
                  for r, g, b, a in frame.get_flattened_data()])
    box = mask.getbbox()
    assert box is not None
    return box[2]-box[0], box[3]-box[1]


# The row's one scale is computed before the resampler is chosen; the resampler only fills the new size and
# the cell shape only decides which side binds, so each resampler, each cell shape and each route is met once.
@pytest.mark.parametrize('route, resample, cell', [
    ('components', 'nearest', (128, 128)),
    ('components', 'lanczos', (192, 128)),
    ('components', 'kcentroid', (128, 192)),
    ('slots', 'lanczos', (128, 128)),
])
def test_weapon_pose_changes_preserve_body_scale(route, resample, cell):
    fn = extract.extract_component_frames if route == 'components' else extract.extract_slot_frames
    frames = fn(attack_strip(), 3, *cell, 12, 12,
                {'align_x': 'bbox-center', 'resample': resample})
    assert frames is not None and len(frames) == 3
    bodies = [red_body_size(frame) for frame in frames]
    for axis in (0, 1):
        assert max(size[axis] for size in bodies)-min(size[axis] for size in bodies) <= 1
    for frame in frames:
        assert frame.size == cell and frame.mode == 'RGBA'
        x0, y0, x1, y1 = frame.getbbox()
        assert x0 >= 12 and y0 >= 12 and x1 <= cell[0]-12 and y1 <= cell[1]-12


def red_body_centre_x(frame):
    mask = Image.new('L', frame.size)
    mask.putdata([255 if r > 180 and g < 80 and b < 80 and a > 128 else 0
                  for r, g, b, a in frame.get_flattened_data()])
    box = mask.getbbox()
    assert box is not None
    return (box[0] + box[2]) / 2


@pytest.mark.parametrize('route', ['components'])
@pytest.mark.parametrize('align_x', ['foot-centroid', 'centroid', 'alpha-centroid', 'bbox-center'])
def test_a_reaching_weapon_does_not_push_its_pose_off_its_anchor(route, align_x):
    """The row scale used to fit the widest pose by its own width; placed at its anchor (the legs, by
    default) that pose crossed the cell and was pushed back in, body and all, so the body jumped back
    in that frame alone. The scale now keeps every pose inside the safe area where its anchor puts it."""
    fn = extract.extract_component_frames if route == 'components' else extract.extract_slot_frames
    frames = fn(attack_strip(), 3, 128, 128, 12, 12, {'align_x': align_x})
    assert frames is not None and len(frames) == 3
    for frame in frames:  # inside the safe area, give or take the pixel the shrink rounds
        x0, y0, x1, y1 = frame.getbbox()
        assert x0 >= 12 - 1 and x1 <= 128 - 12 + 1
    if align_x == 'foot-centroid':  # the legs are the body here, so the body stays put
        centres = [red_body_centre_x(frame) for frame in frames]
        assert max(centres) - min(centres) <= 1
