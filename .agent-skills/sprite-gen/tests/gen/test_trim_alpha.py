from pathlib import Path

import pytest
from PIL import Image

from sprite_gen.gen import trim_to_alpha


def test_trim_to_alpha_crops_to_the_opaque_bbox_and_reports_margins(tmp_path: Path) -> None:
    p = tmp_path / "still.png"
    im = Image.new("RGBA", (100, 150), (0, 0, 0, 0))
    for y in range(20, 120):  # subject occupies y 20..119, x 30..69 — 30 px of empty alpha below the feet
        for x in range(30, 70):
            im.putpixel((x, y), (200, 60, 60, 255))
    im.save(p)
    stats = trim_to_alpha(p)
    with Image.open(p) as out:
        assert out.size == (40, 100)
    assert stats["bbox"] == [30, 20, 70, 120]
    assert stats["before"] == [100, 150] and stats["after"] == [40, 100]
    assert stats["margin_px"] == {"left": 30, "top": 20, "right": 30, "bottom": 30}


def test_trim_to_alpha_ignores_faint_alpha_specks(tmp_path: Path) -> None:
    p = tmp_path / "still.png"
    im = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
    im.putpixel((25, 25), (255, 255, 255, 255))
    im.putpixel((2, 48), (255, 255, 255, 3))  # below the threshold: not part of the subject
    im.save(p)
    stats = trim_to_alpha(p)
    assert stats["bbox"] == [25, 25, 26, 26]


def test_trim_to_alpha_refuses_a_fully_transparent_image(tmp_path: Path) -> None:
    p = tmp_path / "empty.png"
    Image.new("RGBA", (10, 10), (0, 0, 0, 0)).save(p)
    with pytest.raises(SystemExit, match="fully transparent"):
        trim_to_alpha(p)
