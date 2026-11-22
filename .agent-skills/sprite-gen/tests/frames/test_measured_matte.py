# SPDX-License-Identifier: Apache-2.0
"""The measured background matte keys a flat background of whatever colour was painted.

Synthetic stand-ins for what a model paints when asked for a key: a muted or shifted colour with
noise and a gradient, a darker shade of it round the subject, dark strips along two edges, and a
pocket of background enclosed by the subject. The subject keeps its dark outline and its colours.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from sprite_gen.frames.cutout import cutout, extract_route, key_recognised
from sprite_gen.frames.measured_matte import measure_background, measured_matte

W, H = 160, 200
SKIN = (242, 220, 203)
HAIR = (246, 164, 164)
LINE = (25, 35, 25)
BACKGROUNDS = {
    "muted-green": ((147, 189, 94), (60, 100, 30)),  # the colour, and its shade as a model paints it
    "deep-green": ((69, 224, 122), (0, 104, 0)),
    "off-cyan": ((80, 200, 210), (20, 95, 110)),
    "yellowish": ((220, 210, 90), (120, 110, 30)),
}


def _ellipse(cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
    y, x = np.mgrid[0:H, 0:W]
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0


def _scene(colour: tuple[int, int, int], shade: tuple[int, int, int] | None, *, strips: bool = True,
           seed: int = 0) -> tuple[Image.Image, dict[str, np.ndarray]]:
    rng = np.random.default_rng(seed)
    gradient = np.linspace(-10, 10, H)[:, None, None]
    img = np.clip(np.array(colour, dtype=np.float32) + gradient + rng.normal(0, 3, (H, W, 3)), 0, 255)
    body = _ellipse(80, 105, 40, 62)
    halo = _ellipse(84, 110, 47, 70) & ~body
    if shade is not None:
        img[halo] = shade
    img[body] = LINE
    inner = _ellipse(80, 105, 37, 59)
    img[inner] = HAIR
    face = _ellipse(80, 80, 22, 22)
    img[face] = SKIN
    pocket = _ellipse(80, 135, 9, 12)  # background seen through the subject
    img[pocket] = colour
    line_ring = _ellipse(80, 135, 11, 14) & ~pocket
    img[line_ring] = LINE
    if strips:
        img[:4] = (14, 15, 14)
        img[-3:] = (14, 15, 14)
    masks = {"body": inner & ~line_ring & ~pocket, "outline": body & ~inner, "face": face, "pocket": pocket,
             "halo": halo, "corner": np.zeros((H, W), bool)}
    masks["corner"][5:12, 5:12] = True
    return Image.fromarray(img.astype(np.uint8), "RGB").convert("RGBA"), masks


@pytest.mark.parametrize("name", sorted(BACKGROUNDS))
def test_a_flat_background_of_any_colour_is_keyed_and_the_subject_kept(name: str) -> None:
    colour, shade = BACKGROUNDS[name]
    image, masks = _scene(colour, shade)
    out, stats = measured_matte(image)
    alpha = np.asarray(out)[..., 3]
    rgb = np.asarray(out)[..., :3]
    assert stats["route"] == "measured"
    assert np.abs(np.array(stats["background"]) - colour).max() <= 6
    assert (alpha[masks["corner"]] == 0).all()
    assert (alpha[masks["halo"]] == 0).mean() > 0.97, "the background's shade round the subject is background"
    assert (alpha[masks["pocket"]] == 0).mean() > 0.9, "background enclosed by the subject is keyed"
    assert (alpha[:4] == 0).all() and (alpha[-3:] == 0).all(), "the dark edge strips are keyed"
    assert set(stats["edge_strips"]) == {"top", "bottom"}
    assert (alpha[masks["body"]] == 255).all() and (alpha[masks["face"]] == 255).all()
    assert (rgb[masks["face"]] == SKIN).all(), "the subject's colour is byte-identical"
    assert (alpha[masks["outline"]] > 0).mean() > 0.97, "the dark outline is subject, not shade"
    assert stats["key_residue_px"] == 0


def test_an_off_white_background_is_measured_when_asked() -> None:
    image, masks = _scene((232, 232, 222), None, strips=False)
    out, stats = measured_matte(image)
    alpha = np.asarray(out)[..., 3]
    assert stats["shade"] is False  # an achromatic background is read within its spread only
    assert (alpha[masks["corner"]] == 0).all()
    assert (alpha[masks["face"]] == 255).all() and (alpha[masks["body"]] == 255).all()


def test_the_measurement_skips_edge_strips() -> None:
    image, _ = _scene((147, 189, 94), (60, 100, 30))
    measured = measure_background(np.asarray(image.convert("RGB"), dtype=np.float32))
    assert measured is not None and np.abs(measured["colour"] - (147, 189, 94)).max() <= 6


def test_a_green_request_on_a_muted_green_is_measured_instead_of_keying_nothing(tmp_path: Path) -> None:
    image, masks = _scene((147, 189, 94), (60, 100, 30))
    assert key_recognised(image, "green")[0] is False
    keyed, stats = extract_route(image, "green")
    assert stats["route"] == "measured"
    assert stats["chroma_key"] == [0, 255, 0]
    assert np.abs(np.array(stats["chroma_key_painted"]) - (147, 189, 94)).max() <= 6
    assert (np.asarray(keyed)[..., 3][masks["corner"]] == 0).all()

    src = tmp_path / "muted.png"
    image.save(src)
    for key in ("green", "auto", "measured"):
        result = cutout(src, tmp_path / f"out_{key}.png", key=key, decontam="auto")
        assert result["route"] == "measured"
        assert result["alpha_zero_pct"] > 20
        assert result["decontam"]["applied"] is False


def test_a_pure_key_still_goes_to_the_chroma_engine() -> None:
    image, _ = _scene((0, 255, 0), None, strips=False)
    assert key_recognised(image, "green")[0] is True
    _, stats = extract_route(image, "green")
    assert stats["route"] == "extract:green"


def test_a_cutout_that_keys_nothing_fails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import sprite_gen.frames.cutout as cutout_mod

    src = tmp_path / "flat.png"
    image, _ = _scene((147, 189, 94), (60, 100, 30))
    image.save(src)
    monkeypatch.setattr(cutout_mod, "_measured_route", lambda image, *a, **k: (image, {"route": "measured"}))
    with pytest.raises(SystemExit, match="nothing of"):
        cutout(src, tmp_path / "o.png", key="measured")


def test_a_clip_on_a_muted_green_keys_frame_by_frame(tmp_path: Path) -> None:
    """`video-canvas` normalises such a still to the exact key through `extract_route`; a clip's frames cut one
    by one with `cutout` are measured each; `video-frames` keeps the engine (`measure_unrecognised=False`) and
    refuses such a clip itself."""
    from sprite_gen.video.canvas import normalize_key

    still, masks = _scene((147, 189, 94), (60, 100, 30), seed=1)
    normalized, report = normalize_key(still.convert("RGB"), "green")
    data = np.asarray(normalized)
    assert (data[masks["corner"]] == (0, 255, 0)).all(), "the still's background is repainted to the exact key"
    assert (data[masks["face"]] == SKIN).all()
    for i in range(3):
        frame, masks = _scene((147, 189, 94), (60, 100, 30), seed=10 + i)
        src = tmp_path / f"f{i:04d}.png"
        frame.save(src)
        stats = cutout(src, tmp_path / f"k{i:04d}.png", key="green")
        alpha = np.asarray(Image.open(tmp_path / f"k{i:04d}.png"))[..., 3]
        assert stats["route"] == "measured"
        assert (alpha[masks["halo"]] == 0).mean() > 0.97 and (alpha[masks["face"]] == 255).all()
    keyed, stats = extract_route(frame, "green", measure_unrecognised=False)
    assert stats["route"] == "extract:green"
    quiet = cutout(src, tmp_path / "quiet.png", key="green", measure_unrecognised=False, refuse_empty=False)
    assert quiet["route"] == "extract:green"
