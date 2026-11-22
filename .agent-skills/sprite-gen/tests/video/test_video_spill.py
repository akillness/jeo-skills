"""Synthetic regressions for key spill a video model paints into the subject.

A video model reflects the chroma key onto the subject — a green sheen across a
silver gauntlet — in patches far larger than the engine's trapped-spill cap, and
deeper than the fringe unmix reaches. `--spill full` treats every key tint as
spill; `auto` decides from the still the clip was made from.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from sprite_gen.video import frames as frames_mod

GREEN = (0, 255, 0)
SILVER = (205, 210, 215)
SHEEN = (150, 232, 160)  # silver with the key reflected on it
LEAF = (40, 190, 60)  # a subject that is green of its own
LEAN_GREEN = (0, 200, 90)  # a green screen leaning toward cyan: 105 from pure green, blue lit over the dark bar


def _frame(path: Path, *, patch: tuple[int, int, int] | None, size=(160, 160),
           background: tuple[int, int, int] = GREEN) -> Path:
    """A silver block on the key; `patch` paints a large inner region (well past the
    fringe reach and far above the trapped-spill cluster cap)."""
    im = Image.new("RGB", size, background)
    px = im.load()
    for y in range(30, 130):
        for x in range(40, 120):
            px[x, y] = SILVER
    if patch is not None:
        for y in range(50, 110):
            for x in range(55, 105):
                px[x, y] = patch
    im.save(path)
    return path


def _green_excess(path: Path) -> int:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(int)
    return int(((a[..., 3] > 0) & (a[..., 1] > np.maximum(a[..., 0], a[..., 2]) + 12)).sum())


def test_small_keeps_a_large_reflection_and_full_removes_it(tmp_path: Path) -> None:
    raw = _frame(tmp_path / "raw.png", patch=SHEEN)
    small = frames_mod.key_frames([raw], tmp_path / "small", key="green", check_edges=False, spill="small")
    full = frames_mod.key_frames([raw], tmp_path / "full", key="green", check_edges=False, spill="full")
    assert small["frames"] == full["frames"] == 1
    kept = _green_excess(tmp_path / "small" / "raw.png")
    left = _green_excess(tmp_path / "full" / "raw.png")
    assert kept >= 2500  # the 50x60 sheen is a "large cluster" to the default pass
    assert left <= kept * 0.02
    # correction, not coverage: the reflected patch stays opaque
    a = np.asarray(Image.open(tmp_path / "full" / "raw.png").convert("RGBA"))
    assert (a[50:110, 55:105, 3] == 255).all()


def test_full_does_not_touch_colours_without_key_tint(tmp_path: Path) -> None:
    raw = _frame(tmp_path / "raw.png", patch=(200, 60, 50))  # a red emblem
    frames_mod.key_frames([raw], tmp_path / "small", key="green", check_edges=False, spill="small")
    frames_mod.key_frames([raw], tmp_path / "full", key="green", check_edges=False, spill="full")
    a = np.asarray(Image.open(tmp_path / "small" / "raw.png"))
    b = np.asarray(Image.open(tmp_path / "full" / "raw.png"))
    assert (a == b).all()


def test_auto_is_full_for_a_still_without_key_material(tmp_path: Path) -> None:
    still = _frame(tmp_path / "still.png", patch=None)
    decision = frames_mod.decide_spill(still, "auto")
    assert decision["mode"] == "full"
    assert decision["key"] == "green" and decision["key_material_px"] == 0


def test_auto_is_small_for_a_still_that_is_green_of_its_own(tmp_path: Path) -> None:
    still = _frame(tmp_path / "still.png", patch=LEAF)
    decision = frames_mod.decide_spill(still, "auto")
    assert decision["mode"] == "small"
    assert decision["key_material_share"] > frames_mod.SPILL_REFERENCE_MAX


@pytest.mark.parametrize("decontam", ["off", "palette"])
def test_auto_on_a_lean_green_screen_erases_the_background_instead_of_despilling_it(tmp_path: Path, decontam: str) -> None:
    """A green screen leaning toward cyan is the key the model painted: the reference judgment reads it as
    background (no key material, so `full`), and keying the frame leaves none of it — no opaque pixel off the
    subject for the full spill pass to turn blue-grey, nothing at the edge — with the silver block untouched."""
    still = _frame(tmp_path / "still.png", patch=None, background=LEAN_GREEN)
    raw = _frame(tmp_path / "raw.png", patch=None, background=LEAN_GREEN)
    decision = frames_mod.decide_spill(still, "auto")
    assert decision["mode"] == "full" and decision["key_material_px"] == 0
    report = frames_mod.key_frames([raw], tmp_path / "k", key="green", check_edges=True, spill=decision["mode"],
                                   decontam=decontam)
    assert report["edge_contacts"] == []
    a = np.asarray(Image.open(tmp_path / "k" / "raw.png").convert("RGBA"))
    block = np.zeros(a.shape[:2], dtype=bool)
    block[30:130, 40:120] = True
    assert int((a[~block][:, 3] > 0).sum()) == 0, "background px survived the key"
    assert (a[block] == SILVER + (255,)).all(), "the silver block must stay byte-identical"


def test_auto_without_a_reference_fails_loud(tmp_path: Path) -> None:
    with pytest.raises(SystemExit, match="--reference"):
        frames_mod.run_frames(tmp_path / "missing.mp4", tmp_path / "out", key="green", allow_edge_contact=True,
                              report_path=None, spill="auto", reference=None)


def test_key_frames_refuses_an_unresolved_mode(tmp_path: Path) -> None:
    raw = _frame(tmp_path / "raw.png", patch=None)
    with pytest.raises(SystemExit, match="resolved spill mode"):
        frames_mod.key_frames([raw], tmp_path / "k", key="green", check_edges=False, spill="auto")
