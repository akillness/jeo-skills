"""One-shot acceptance by moved subject mass (2026-09-20 jump field test).

The MAD contrast rejects a hop when the rest is not one pose: a body that walks a few
steps, hops once and then freezes has its distance-to-rest spread between the walking
preamble and the frozen tail, so the "rest noise" is inflated and a 42 px hop scores
under 3 MADs. The moved-mass rule admits it; a jittering stand still fails both.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from sprite_gen.video import loop as loop_mod
from tests.video.test_video_pipeline import _one_shot_frames


def _walk_hop_freeze(tmp_path: Path, *, n: int = 96, walk_until: int = 40, hop: tuple[int, int] = (42, 56), shift: int = 5, lift: int = 16, jitter: int = 1, seed: int = 1, size=(64, 96)) -> list[Path]:
    """Walking sway on a stance a few px over for the first frames, one hop, then a stand
    that never moves again (a little jitter so no two frames are byte-identical). The rest
    pose (the stand) is the medoid, and the walking frames sit far enough from it that the
    MAD of every frame's distance to rest is inflated well past the rest noise."""
    d = tmp_path / "keyed"
    d.mkdir()
    files = []
    rng = np.random.default_rng(seed)
    for t in range(n):
        im = Image.new("RGBA", size, (0, 0, 0, 0))
        lf = 0
        if hop[0] <= t < hop[1]:
            lf = round(lift * math.sin(math.pi * (t - hop[0]) / (hop[1] - hop[0])))
        walking = t < walk_until
        dx = (shift if walking else 0) + int(rng.integers(-jitter, jitter + 1))
        dy = int(rng.integers(-jitter, jitter + 1))
        for y in range(30 - lf + dy, 70 - lf + dy):
            for x in range(24 + dx, 40 + dx):
                im.putpixel((x, y), (200, 60, 60, 255))
        leg = 32 + dx + (round(8 * math.sin(2 * math.pi * t / 12)) if walking else 0)
        for y in range(70 - lf + dy, 88 - lf + dy):
            for x in range(leg - 3, leg + 3):
                im.putpixel((x, y), (60, 60, 200, 255))
        p = d / f"frame-{t:04d}.png"
        im.save(p)
        files.append(p)
    return files


def test_moved_mass_admits_a_hop_the_mad_contrast_rejects(tmp_path: Path) -> None:
    files = _walk_hop_freeze(tmp_path)
    D = loop_mod.distance_matrix(files)
    with pytest.raises(SystemExit, match="never leaves its rest pose"):
        loop_mod.detect_one_shot(D, min_len=8, max_len=86)  # no masses: the old rule alone
    cycle = loop_mod.detect_one_shot(D, min_len=8, max_len=86, frame_mass=loop_mod.frame_masses(files))
    assert cycle["kind"] == "one-shot" and cycle["excursion_rule"] == "moved"
    assert cycle["excursion_contrast"] < loop_mod.ONE_SHOT_MIN_CONTRAST
    assert cycle["excursion_moved"] >= loop_mod.ONE_SHOT_MIN_MOVED
    a, b = cycle["excursion"]
    assert 42 <= a <= b < 56  # the hop, not the walking preamble
    assert cycle["ratio"] < 2.0  # rest -> rest seam within the gate


def test_moved_mass_does_not_admit_a_jittering_stand(tmp_path: Path) -> None:
    files = _one_shot_frames(tmp_path, hop=(0, 0), jitter=4)
    D = loop_mod.distance_matrix(files)
    with pytest.raises(SystemExit, match="no complete one-shot return"):
        loop_mod.detect_one_shot(D, min_len=8, max_len=130, frame_mass=loop_mod.frame_masses(files))


def test_contrast_rule_still_wins_when_it_clears_the_bar(tmp_path: Path) -> None:
    files = _one_shot_frames(tmp_path)
    D = loop_mod.distance_matrix(files)
    plain = loop_mod.detect_one_shot(D, min_len=9, max_len=65)
    with_mass = loop_mod.detect_one_shot(D, min_len=9, max_len=65, frame_mass=loop_mod.frame_masses(files))
    assert with_mass["excursion_rule"] == "contrast"
    assert (with_mass["start"], with_mass["length"], with_mass["excursion"]) == (plain["start"], plain["length"], plain["excursion"])


def test_frame_masses_are_positive_and_per_frame(tmp_path: Path) -> None:
    files = _one_shot_frames(tmp_path, n=12)
    m = loop_mod.frame_masses(files)
    assert m.shape == (12,) and bool(np.all(m > 0))
