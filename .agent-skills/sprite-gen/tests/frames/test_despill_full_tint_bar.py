"""Full spill correction removes faint tint and preserves reference material."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from sprite_gen._deps import np
from sprite_gen.frames.cutout import KEY_TARGETS, extract_route
from sprite_gen.frames.extract import _SPILL_FULL_MIN_TINT, _SPILL_MIN_TINT, key_material_pixels
from sprite_gen.video import frames as frames_mod


def _green_canvas_with_tinted_subject(path: Path, *, tint: int, share: float = 1.0) -> Path:
    """A pale subject on a green field. `share` of the subject's area carries `tint`
    added to its green channel — the key light bouncing off it, which is what a video
    model can paint onto a neutral subject.
    """
    key = KEY_TARGETS["green"]
    size, box = 160, (32, 32, 128, 128)  # a 96x96 subject: 9,216 px, so 1 px is 0.01 %
    im = Image.new("RGB", (size, size), key)
    left, top, right, bottom = box
    area = (right - left) * (bottom - top)
    lit = max(1, round(area * share))
    painted = 0
    for y in range(top, bottom):
        for x in range(left, right):
            on = painted < lit
            im.putpixel((x, y), (230, min(255, 225 + (tint if on else 0)), 225))
            painted += on
    im.save(path)
    return path


def _residual_tint(image: Image.Image) -> np.ndarray:
    data = np.asarray(image.convert("RGBA")).astype(np.int32)
    opaque = data[..., 3] > 0
    tint = data[..., 1] - (data[..., 0] + data[..., 2]) / 2.0
    return tint[opaque]


def test_the_full_bar_reaches_a_tint_the_default_bar_leaves_alone(tmp_path: Path) -> None:
    src = _green_canvas_with_tinted_subject(tmp_path / "in.png", tint=20)  # between the bars
    image = Image.open(src).convert("RGBA")

    default_keyed, _ = extract_route(image, "green", spill_max_fraction=1.0)
    full_keyed, _ = extract_route(image, "green", spill_max_fraction=1.0,
                                  spill_min_tint=_SPILL_FULL_MIN_TINT)

    assert _SPILL_FULL_MIN_TINT < 20 < _SPILL_MIN_TINT
    assert _residual_tint(default_keyed).max() > 15, "the default bar is above this tint"
    assert _residual_tint(full_keyed).max() < 15, "the full bar has to reach it"


def test_a_subject_that_owns_key_material_is_still_judged_small(tmp_path: Path) -> None:
    """The decision reads the bar the treatment will use, so a genuinely green subject
    keeps its green: it is `small`, and `full`'s lowered bar never touches it."""
    # a subject that is green material: most of it carries the key hue
    owns_green = _green_canvas_with_tinted_subject(tmp_path / "green-subject.png", tint=90)
    # a clean subject carrying only what the key bounced onto its lower edge
    clean = _green_canvas_with_tinted_subject(tmp_path / "pale-subject.png", tint=20, share=0.003)
    assert frames_mod.decide_spill(owns_green, "green")["mode"] == "small"
    assert frames_mod.decide_spill(clean, "green")["mode"] == "full"


def test_key_material_is_measured_at_the_bar_it_is_given(tmp_path: Path) -> None:
    src = _green_canvas_with_tinted_subject(tmp_path / "in.png", tint=20)
    keyed, _ = extract_route(Image.open(src).convert("RGBA"), "green")
    at_default, subject = key_material_pixels(keyed, KEY_TARGETS["green"])
    at_full, subject_again = key_material_pixels(keyed, KEY_TARGETS["green"], _SPILL_FULL_MIN_TINT)
    assert subject == subject_again
    assert at_default < at_full, "a lower bar must see at least as much key material"
