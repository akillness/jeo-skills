# SPDX-License-Identifier: Apache-2.0
"""A limb seen through (docs/loop-repair.md section 4): a frame made between two source frames where one has a gap beside a
limb and the other has the limb there can blend the two coverages, so the limb is left part-covered over the gap and the
background shows through it. Over the whole figure the band is a small share and `rife.ghost` reads under GHOST_WARN; the
hole reading does not see it either (the band is open to the gap beside the limb, the first source frame's own); read in
windows a tenth of the body high (`rife.ghost_window`) it is a large share of the rows it lies in, and the alignment's
made frame is judged a ghost.

Synthetic figures only: a wide body over two legs, the near leg's outer side cut back in the first source frame (a gap
open to the space between the legs) and whole in the second; the frame made between them has the cut-back strip
part-covered in the leg's colour."""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from sprite_gen.video import align, rife
from sprite_gen.video.interpolation_quality import GHOST_WARN, GHOST_WINDOW_WARN, faults

W, H = 400, 420
BODY, LEG = (210, 180, 150, 255), (150, 110, 90, 255)  # light enough that no pixel counts as a dark line


def _figure(*, cut: bool = False, seen_through: float | None = None) -> Image.Image:
    """A body 300 px wide over two legs 50 px wide; `cut` takes the near leg's outer 8 columns out over 60 rows (a gap
    open to the space between the legs); `seen_through` leaves them at that alpha in the leg's colour instead."""
    a = np.zeros((H, W, 4), dtype=np.uint8)
    a[20:260, 50:350] = BODY
    a[260:400, 110:160] = LEG  # far leg
    a[260:400, 240:290] = LEG  # near leg
    if cut:
        a[300:360, 240:248] = 0
    if seen_through is not None:
        a[300:360, 240:248] = (*LEG[:3], round(255 * seen_through))
    return Image.fromarray(a, "RGBA")


def test_a_limb_seen_through_reads_under_the_whole_body_ghost_and_over_the_window():
    a, b, made = _figure(cut=True), _figure(), _figure(seen_through=0.35)
    m = align.measure_made(made, a, b, 0.4, reads=True)
    assert m["ghost"] < GHOST_WARN and m["hole"] == 0.0  # the whole figure's band, and no hole: what 3.3.0 judged by
    assert faults({k: v for k, v in m.items() if not k.startswith("ghost_window")}) == []
    assert m["ghost_window"] > GHOST_WINDOW_WARN and faults(m) == ["ghost"]
    lo, hi = m["ghost_window_at"]
    assert 0.6 < lo < hi < 1.0  # the window lies in the legs
    # the same frame whole is clean in every window
    assert rife.ghost_window(b)[0] == 0.0 and faults(align.measure_made(b, a, b, 0.4, reads=True)) == []


def test_the_alignment_judges_a_made_frame_with_a_limb_seen_through_a_ghost():
    """Two source frames resampled to four: the frame made between the first and the second is the limb seen through.
    Under rife it is kept and named a ghost (3.3.0 kept it with no fault)."""
    a, b, made = _figure(cut=True), _figure(), _figure(seen_through=0.35)
    out, facts = align.resample([a, b], 4, lambda x, y, t: made.copy() if x is a else y.copy(), between="rife")
    row = next(m for m in facts["smear"] if m["at"] == 1)
    assert row["method"] == "rife" and row["faults"] == ["ghost"] and row["ghost"] < GHOST_WARN < GHOST_WINDOW_WARN < row["ghost_window"]


def test_a_ghost_read_in_a_window_says_so_in_its_warning():
    m = {"at": 7, "method": "nearest", "faults": ["ghost"], "ghost": 0.0018, "ghost_window": 0.024, "ghost_window_at": [0.6, 0.7],
         "dark_excess": 0.0, "outline_loss": 0.0, "outline_shift": 0.0, "hole": 0.0, "doubled": 0.0}
    line = align._fault_line("walk", m)
    assert "2.40 % of the solid pixels in a band 10 % of its body high (60 to 70 % down it)" in line
    assert "though 0.18 % of its whole body — a limb seen through, a ghost" in line and "nearer source frame was taken" in line


@pytest.mark.parametrize("band", [25 / 255, 230 / 255])
def test_a_band_at_the_edges_of_part_cover_is_not_part_covered(band):
    """Alpha 25 and 230 of 255 lie just outside PARTIAL_ALPHA (0.1, 0.9): no band."""
    assert rife.ghost_window(_figure(seen_through=band))[0] == 0.0
