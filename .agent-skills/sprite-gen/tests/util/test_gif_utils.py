# SPDX-License-Identifier: Apache-2.0
"""GIF frame disposal must preserve each preview's declared background."""
from PIL import Image
import pytest

from sprite_gen.util.gif_utils import save_clean_gif
from sprite_gen._deps import np


# `loop` is one conditional keyword, apart from the opaque/transparent split, so pairing the two axes
# covers both values of each (the full grid adds nothing).
@pytest.mark.parametrize("loop,starts_empty", [(None, True), (0, False)])
def test_opaque_sequence_keeps_black_canvas_and_empty_endpoint(tmp_path, loop, starts_empty):
    frames = []
    for k in range(64):
        frame = Image.new("RGBA", (24, 24), "black")
        if k != 63 and (k or not starts_empty):
            radius = 2 + k % 6
            frame.paste((240, 96 + k * 2, 32, 255),
                        (12 - radius, 12 - radius, 12 + radius, 12 + radius))
        frames.append(frame)
    path = tmp_path / "opaque.gif"
    sources = [frame.convert("RGB") for frame in frames]
    for frame in sources:
        frame.info["transparency"] = (0, 0, 0)
    save_clean_gif(sources, path, duration_ms=60, loop=loop, opaque=True)

    data = path.read_bytes()
    assert data.count(b"GIF89a") + data.count(b"GIF87a") == 1
    with Image.open(path) as preview:
        assert preview.n_frames == 64
        assert preview.info.get("loop") == loop
        assert "transparency" not in preview.info
        for k, expected in enumerate(frames):
            preview.seek(k)
            assert preview.convert("RGBA").tobytes() == expected.tobytes(), k
            assert preview.info["duration"] == 60


def test_default_transparency_clears_moving_subject_and_preserves_playback(tmp_path):
    loop = 0  # the unset `loop` is held by the opaque test above
    frames = []
    for x in (2, 12, None):
        frame = Image.new("RGBA", (24, 24))
        if x is not None:
            frame.paste((40, 160, 240, 255), (x, 8, x + 6, 14))
        frames.append(frame)
    path = tmp_path / "transparent.gif"
    save_clean_gif(frames, path, duration_ms=70, loop=loop)

    with Image.open(path) as preview:
        assert preview.n_frames == len(frames)
        assert preview.info.get("loop") == loop
        for k, expected in enumerate(frames):
            preview.seek(k)
            assert preview.convert("RGBA").tobytes() == expected.tobytes(), k
            assert preview.disposal_method == 2
            assert preview.info["duration"] == 70


def test_opaque_palette_retains_a_rare_light_colour(tmp_path):
    y, x = np.mgrid[:128, :128]
    rgb = np.stack([x * 2, y * 2, np.zeros_like(x)], axis=2).astype(np.uint8)
    rgb[:64, :, 2] = rgb[:64, :, 1]
    rgb[-2, -2] = (128, 128, 200)
    path = tmp_path / "light.gif"
    save_clean_gif([Image.fromarray(rgb)], path, duration_ms=60, opaque=True)

    with Image.open(path) as preview:
        decoded = preview.convert("RGB")
        assert decoded.getpixel((0, 0)) == (0, 0, 0)
        error = np.abs(np.asarray(decoded, dtype=int) - rgb)
    assert error[-2, -2].max() <= 16
    assert error.mean() < 4
