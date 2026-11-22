# SPDX-License-Identifier: Apache-2.0
"""A walk whose first frames the automatic motion anchor cannot track is searched after them, as after a lead-in.

A clip filmed from a still opens on that still and on the standing pose the body sets off from, and the two regions
the middle of the clip shows may be out of the anchor's reach there: `--anchor motion-auto` refused the whole clip
(`automatic motion anchor needs two separated regions trackable throughout the clip`) before its search, and the gait
fallback after the search never ran. Here the walker's first frames carry its head and torso far forward over its legs,
further than the anchor searches round the body's centre."""
from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from sprite_gen.video import loop
from tests.video import test_gait_fallback as walks

LEAN = 90  # px the head and torso are carried forward: past the anchor's reach round the body's centre
OPENING = 3


def _shaded(k: int, *, lean: int = 0) -> Image.Image:
    """The front walker with its head and torso shaded round (brightest in the middle, so a patch of them matches at
    one place only), and carried `lean` px forward over its legs."""
    image = walks.walker(k)
    a = np.asarray(image).astype(np.float64)
    hips = walks.FOOT[1] - 41
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    shade = 0.45 + 0.55 * np.exp(-((xx - walks.FOOT[0]) ** 2 + (yy - (walks.FOOT[1] - 85)) ** 2) / (2 * 22.0 ** 2))
    upper = (yy < hips) & (a[:, :, 3] > 0)
    a[upper, :3] *= shade[upper, None]
    out = Image.fromarray(a.round().astype(np.uint8), "RGBA")
    if not lean:
        return out
    top = out.crop((0, 0, out.width, hips))
    moved = out.copy()
    moved.paste((0, 0, 0, 0), (0, 0, out.width, hips))
    moved.alpha_composite(top, (lean, 0))
    return moved


def _clip(leaning: range | tuple[int, ...]) -> list[Image.Image]:
    return [_shaded(k, lean=LEAN if k in leaning else 0) for k in range(73)]


@pytest.mark.slow
def test_a_walk_the_anchor_tracks_only_after_its_opening_is_searched_after_it(tmp_path, capsys):
    (tmp_path / "opening").mkdir()
    code, report, _ = walks.run(tmp_path / "opening", _clip(range(OPENING)), "--size-hold", "off")
    assert code == 0
    opened = report["untracked_opening"]
    assert opened["frames"] == OPENING and opened["first"] == 0
    assert opened["refused"] == "automatic motion anchor needs two separated regions trackable throughout the clip"
    assert opened["shorter_than"] == loop.profile_for("walk").window(73, 24.0)[0]
    # Searched as after a lead-in: every frame number is the clip's own, none in the opening.
    assert report["lead_in"]["frames"] == 0 and report["lead_in"]["search_from"] == OPENING
    assert report["window"] == list(loop.profile_for("walk").window(73 - OPENING, 24.0))
    cycle = report["cycle"]
    assert abs(cycle["length"] - 24) <= 1 and cycle["start"] >= OPENING
    assert all(row["start"] >= OPENING for row in cycle["candidates"])
    err = capsys.readouterr().err
    assert "the automatic motion anchor found its two regions from frame 3 on" in err
    # The warning is not the refusal's line: a caller matching the stderr for it reads no refusal here.
    assert "needs two separated regions" not in err

    # The walker the anchor tracks from its first frame is searched from it, and says nothing of an opening.
    (tmp_path / "plain").mkdir()
    code, plain, _ = walks.run(tmp_path / "plain", _clip(()), "--size-hold", "off")
    assert code == 0 and "untracked_opening" not in plain and plain["lead_in"]["search_from"] == 0


@pytest.mark.slow
def test_a_walk_the_anchor_cannot_track_after_any_short_opening_is_refused_as_before(tmp_path):
    # The same lean again in the middle of the clip: no opening shorter than the shortest cut leaves it tracked.
    code, report, _ = walks.run(tmp_path, _clip((0, 1, 2, 40, 41, 42)), "--size-hold", "off")
    shortest = loop.profile_for("walk").window(73, 24.0)[0]
    assert str(code) == (
        "video-loop: automatic motion anchor needs two separated regions trackable throughout the clip — nor through the "
        f"clip after any of its first 1 to {shortest - 1} frames left out (an opening shorter than the shortest cut, "
        f"{shortest} frames)")
    assert report["status"] == "failed" and "untracked_opening" not in report and report["lead_in"]["search_from"] == 0
