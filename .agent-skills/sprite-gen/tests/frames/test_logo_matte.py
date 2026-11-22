# SPDX-License-Identifier: Apache-2.0
"""The logo matte against synthetic lettering whose coverage and colour are known.

A logo's glow is a long blend of one colour into the key. These tests hold the matte to
the truth the fixture was composited from: solid letters stay solid and keep their colour,
a glow keeps its fade (no plateau of full coverage, no cut where it grows faint), and no
pixel keeps the key's hue on a dark or a light backdrop.
"""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image, ImageFilter

from logo_lettering import (BUTTER, GREEN_PAINTED, MAGENTA_PAINTED, MINT, SKY, hollow_letters, key_excess, lettering,
                            over, quilt, truth_over, walled_patch)
from sprite_gen.frames import logo_matte


def _cut(item, key="magenta"):
    image, stats = logo_matte.matte(item.image, key=key)
    assert image.mode == "RGBA" and image.size == item.image.size
    return np.asarray(image, dtype=np.float64), stats


def test_solid_letters_stay_opaque_in_their_own_colour() -> None:
    item = lettering()
    cut, _ = _cut(item)
    inside = item.letters
    assert inside.sum() > 500
    assert (cut[..., 3][inside] == 255).all()
    assert np.abs(cut[..., :3][inside] - item.colour[inside]).max() <= 8


def test_a_glow_keeps_its_fade_instead_of_turning_opaque() -> None:
    item = lettering()
    cut, stats = _cut(item)
    glow = (item.alpha > 0.06) & (item.alpha < 0.9) & ~item.letters
    assert glow.sum() > 2000
    est = cut[..., 3][glow] / 255.0
    assert np.abs(est - item.alpha[glow]).mean() < 0.04
    # the sprite matte's failure: a glow half way to white already full coverage
    assert ((est > 0.98) & (item.alpha[glow] < 0.8)).sum() == 0
    assert stats["partial_px"] > 2000


def test_a_faint_glow_is_not_cut_to_a_hard_edge() -> None:
    item = lettering()
    cut, _ = _cut(item)
    faint = (item.alpha > 0.04) & (item.alpha < 0.15)
    assert faint.sum() > 500
    kept = cut[..., 3][faint] > 0
    assert kept.mean() > 0.9


@pytest.mark.parametrize("backdrop", [(18, 20, 28), (245, 245, 240)])
def test_no_key_halo_on_a_dark_or_a_light_backdrop(backdrop) -> None:
    item = lettering()
    cut, _ = _cut(item)
    seen = over(cut, backdrop)
    truth = truth_over(item, backdrop)
    tint = key_excess(seen) - key_excess(truth)
    assert np.quantile(tint, 0.999) <= 10
    assert np.abs(seen - truth).mean() < 3.0


def _far_from_lettering(item, px: int = 6) -> np.ndarray:
    near = Image.fromarray(np.uint8(item.alpha >= 0.004) * 255).filter(ImageFilter.MaxFilter(2 * px + 1))
    return np.asarray(near) == 0


def test_the_background_is_left_fully_transparent() -> None:
    item = lettering()
    cut, _ = _cut(item)
    assert (cut[..., 3][_far_from_lettering(item)] == 0).mean() > 0.999
    # next to a glow's last trace, at most a coverage no backdrop shows
    assert cut[..., 3][item.alpha < 0.004].max() <= 8
    assert (cut[..., :3][cut[..., 3] == 0] == 0).all()


def test_a_shaded_key_background_is_still_background() -> None:
    item = lettering(gradient=28.0)
    cut, stats = _cut(item)
    assert (cut[..., 3][_far_from_lettering(item)] == 0).mean() > 0.999
    assert cut[..., 3][item.alpha < 0.004].max() <= 8
    assert stats["background"]["spread"] > 10


def _glow_holds(item, cut, key, *, error=0.06, tint=12) -> None:
    assert (cut[..., 3][item.letters] == 255).all()
    glow = (item.alpha > 0.06) & (item.alpha < 0.9) & ~item.letters
    est = cut[..., 3][glow] / 255.0
    assert np.abs(est - item.alpha[glow]).mean() < error
    for backdrop in ((18, 20, 28), (245, 245, 240)):
        shift = key_excess(over(cut, backdrop), key) - key_excess(truth_over(item, backdrop), key)
        assert np.quantile(shift, 0.999) <= tint


def test_a_seam_on_the_pictures_edge_is_not_lettering() -> None:
    # generated pictures often end in a row or column a few levels off the key
    item = lettering()
    pixels = np.asarray(item.image).astype(np.int64)
    pixels[-1] = (236, 36, 236)
    pixels[:, 0] = (246, 6, 248)
    pixels[:2, :] += np.array([-4, 6, -3])
    seamed = Image.fromarray(np.uint8(np.clip(pixels, 0, 255)), "RGB")
    image, stats = logo_matte.matte(seamed, key="magenta")
    alpha = np.asarray(image)[..., 3]
    assert stats["frame_seam_cleared_px"] > 0
    assert alpha[-1].max() == 0 and alpha[:, 0].max() == 0 and alpha[:2].max() == 0
    trimmed, trim = logo_matte.trim(image)
    reference, _ = logo_matte.trim(logo_matte.matte(item.image, key="magenta")[0])
    assert trim["after"] == list(reference.size)


def test_an_outlined_letter_with_a_glow_of_another_colour() -> None:
    # an outer glow at a design tool's usual density (80 %) round dark-outlined gold letters
    item = lettering(fill=(232, 182, 52), outline=(20, 24, 40), glow=(40, 230, 255), glow_radius=4.0,
                     glow_strength=0.8)
    cut, _ = _cut(item)
    _glow_holds(item, cut, "magenta")


def test_a_dense_glow_pooled_in_a_counter_keeps_its_fade_on_the_key_whose_hue_it_shares() -> None:
    # a cyan glow keeps green's hue to about 85 % coverage, so on green its pool in the O stays a glow
    item = lettering(fill=(232, 182, 52), outline=(20, 24, 40), glow=(40, 230, 255), glow_radius=9.0,
                     key=GREEN_PAINTED)
    cut, _ = _cut(item, key="green")
    _glow_holds(item, cut, "green")


def test_the_known_limit_a_dense_glow_without_the_keys_hue_reads_as_lettering() -> None:
    # The same pooled cyan glow on magenta: past about half coverage it carries no magenta hue, and a
    # pixel cannot tell a dense cyan glow from a periwinkle letter. It is kept opaque (docs/logo.md,
    # "Known limit"); the green key above is the remedy. Improve the matte, then change this test.
    item = lettering(fill=(232, 182, 52), outline=(20, 24, 40), glow=(40, 230, 255), glow_radius=9.0)
    cut, _ = _cut(item)
    pooled = (item.alpha > 0.55) & (item.alpha < 0.8) & ~item.letters
    assert (cut[..., 3][pooled] == 255).mean() > 0.5


def test_the_green_key() -> None:
    item = lettering(fill=(255, 214, 40), glow=(255, 120, 20), glow_radius=5.0, glow_strength=0.7,
                     key=GREEN_PAINTED)
    cut, stats = _cut(item, key="green")
    assert stats["key"] == "green"
    _glow_holds(item, cut, "green", tint=10)


def test_pixel_lettering_stays_hard_edged() -> None:
    item = lettering(glow=None, pixel=True, noise=0.0, size=(96, 48))
    cut, _ = _cut(item)
    alpha = cut[..., 3]
    assert set(np.unique(alpha)) <= {0.0, 255.0}
    assert ((alpha == 255) == (item.alpha >= 0.999)).all()


def test_a_border_that_is_not_the_key_is_refused() -> None:
    scene = Image.new("RGB", (120, 80), (40, 90, 160))
    with pytest.raises(SystemExit, match="border is not the magenta key"):
        logo_matte.matte(scene, key="magenta")


def test_nothing_but_key_is_refused() -> None:
    flat = Image.new("RGB", (120, 80), (250, 6, 245))
    with pytest.raises(SystemExit, match="no lettering"):
        logo_matte.matte(flat, key="magenta")


def test_trim_keeps_every_visible_pixel_and_a_margin() -> None:
    item = lettering()
    image, _ = logo_matte.matte(item.image, key="magenta")
    trimmed, stats = logo_matte.trim(image)
    alpha = np.asarray(image)[..., 3]
    rows, cols = np.nonzero(alpha)
    left, top, right, bottom = stats["bbox"]
    assert (left, top) ==(max(0, cols.min() - logo_matte.TRIM_PAD_PX), max(0, rows.min() - logo_matte.TRIM_PAD_PX))
    assert trimmed.size == (right - left, bottom - top)
    assert int(np.asarray(trimmed)[..., 3].astype(np.int64).sum()) == int(alpha.astype(np.int64).sum())


def test_coverage_counts_opaque_partial_and_empty() -> None:
    image = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    for x in range(10):
        image.putpixel((x, 0), (255, 255, 255, 255))
        image.putpixel((x, 1), (255, 255, 255, 100))
    cover = logo_matte.coverage(image)
    assert cover == {"size": [10, 10], "opaque_pct": 10.0, "partial_pct": 10.0, "empty_pct": 80.0,
                     "visible_opaque_share": 0.5}


def test_the_key_is_chosen_away_from_the_lettering_colours() -> None:
    pink = Image.new("RGB", (60, 40), (230, 60, 210))
    choice = logo_matte.choose_key(pink)
    assert choice["key"] == "green" and choice["scores"]["magenta"]["hued_pct"] > 50
    assert logo_matte.choose_key(Image.new("RGB", (60, 40), (40, 200, 60)))["key"] == "magenta"
    assert logo_matte.choose_key(Image.new("RGB", (60, 40), (120, 120, 120)))["key"] == "magenta"


def test_the_key_keeps_a_glows_hue_longest() -> None:
    # a cyan glow keeps green's hue to ~85 % coverage and magenta's to ~half; an orange one the other way
    assert logo_matte.choose_key(Image.new("RGB", (60, 40), (40, 230, 255)))["key"] == "green"
    assert logo_matte.choose_key(Image.new("RGB", (60, 40), (255, 120, 20)))["key"] == "magenta"


def test_a_title_in_both_keys_hues_gets_neither_key() -> None:
    # patchwork letters: pink patches and a plum outline in magenta's hue, mint patches in green's
    choice = logo_matte.choose_key(quilt(key=(30, 40, 90))[0])
    assert choice["scores"]["magenta"]["hued_pct"] >= logo_matte.CLASH_HUED_PCT
    assert choice["scores"]["green"]["hued_pct"] >= logo_matte.CLASH_HUED_PCT
    assert choice["scores"]["green"]["clashes"] and choice["scores"]["magenta"]["clashes"]
    assert choice["key"] is None


def _cyan_title_with_mint(mint_pct: float) -> Image.Image:
    # cyan lettering keeps green's hue longest (it would win green), with a few mint patches in it
    mood = np.full((50, 100, 3), (40, 230, 255), dtype=np.uint8)
    mood.reshape(-1, 3)[:int(round(mint_pct / 100 * 5000))] = (150, 235, 190)
    return Image.fromarray(mood, "RGB")


def test_a_colour_in_a_keys_hue_rules_the_key_out() -> None:
    assert logo_matte.choose_key(_cyan_title_with_mint(0))["key"] == "green"
    choice = logo_matte.choose_key(_cyan_title_with_mint(6))
    assert choice["scores"]["green"]["clashes"] and choice["key"] == "magenta"


def test_a_colour_the_brief_names_rules_its_key_out_at_a_smaller_share() -> None:
    named = {"green": ["mint"], "magenta": []}
    choice = logo_matte.choose_key(_cyan_title_with_mint(2), named=named)
    assert choice["scores"]["green"]["named"] == ["mint"] and choice["key"] == "magenta"
    assert logo_matte.choose_key(_cyan_title_with_mint(2))["key"] == "green"  # not named: 2 % may be scenery
    assert logo_matte.choose_key(_cyan_title_with_mint(0), named=named)["key"] == "green"  # a word alone does not


def test_see_through_inside_the_letters_is_found() -> None:
    # on green the mint patches are a mix with the key, cut see-through inside the plum-outlined letters
    image, mint = quilt()
    cut, _ = logo_matte.matte(image, key="green")
    inside = logo_matte.see_through_inside(cut)
    alpha = np.asarray(cut)[..., 3]
    assert ((alpha[mint] > 0) & (alpha[mint] < 255)).mean() > 0.9
    assert inside["px"] >= 0.4 * mint.sum() and inside["wide"]
    assert inside["pct_of_visible"] >= logo_matte.INSIDE_MAX_PCT


def test_the_other_key_keeps_the_mint_patches_and_finds_nothing_inside() -> None:
    # the same letters with peach for pink in a navy outline: nothing in magenta's hue, so magenta keeps them all
    image, mint = quilt(key=MAGENTA_PAINTED, colours=((240, 170, 120), BUTTER, MINT, SKY), outline=(30, 34, 70))
    cut, _ = logo_matte.matte(image, key="magenta")
    assert (np.asarray(cut)[..., 3][mint] == 255).mean() > 0.95
    assert not logo_matte.see_through_inside(cut)["wide"]


@pytest.mark.parametrize("item, key", [
    (lambda: lettering(), "magenta"),
    (lambda: lettering(fill=(232, 182, 52), outline=(20, 24, 40), glow=(40, 230, 255), glow_radius=4.0,
                       glow_strength=0.8), "magenta"),
    (lambda: lettering(fill=(232, 182, 52), outline=(20, 24, 40), glow=(40, 230, 255), glow_radius=9.0,
                       key=GREEN_PAINTED), "green"),  # a glow pooled in the counter of the O
    (lambda: lettering(fill=(232, 182, 52), outline=(20, 24, 40), glow=(40, 230, 255), glow_radius=9.0), "magenta"),
    (lambda: lettering(fill=(255, 214, 40), glow=(255, 120, 20), glow_radius=5.0, glow_strength=0.7,
                       key=GREEN_PAINTED), "green"),
    (lambda: lettering(glow=None, pixel=True, noise=0.0, size=(96, 48)), "magenta"),
], ids=["white-glow", "outlined-cyan-glow", "pooled-glow-green", "pooled-glow-magenta", "orange-glow-green", "pixel"])
def test_a_glow_is_not_see_through_inside(item, key) -> None:
    cut, _ = logo_matte.matte(item().image, key=key)
    assert not logo_matte.see_through_inside(cut)["wide"]


KEY_ISLAND = (96, 156, 9)  # the end validator's counterexample: a 9x9 square of the key in the middle of the patch


@pytest.mark.parametrize("holes", [
    (),
    (KEY_ISLAND,),
    (KEY_ISLAND, (70, 105, 5), (65, 130, 4), (120, 205, 15)),  # one more on its own, two glued to the patch's wall
], ids=["no-hole", "one-hole", "four-holes"])
def test_a_hole_cut_to_nothing_opens_no_way_out_of_the_letter(holes) -> None:
    # the mint patch walled in by the navy letter is cut see-through on green and the squares of the key in it are cut
    # to nothing: walled in by the letter, joined to no edge of the picture, so the patch round them is still inside
    # and the glow's reach (no glow here) stays a letter's rim
    cut, _ = logo_matte.matte(walled_patch(holes=holes), key="green")
    alpha = np.asarray(cut)[..., 3]
    for y, x, side in holes:
        assert (alpha[y:y + side, x:x + side] == 0).all()
    patch = alpha[65:135, 100:220]
    see = int(((patch > 0) & (patch < logo_matte.INSIDE_ALPHA8)).sum())
    assert see >= 8400 - sum(side * side for *_, side in holes)
    inside = logo_matte.see_through_inside(cut)
    assert inside["wide"] and inside["glow_reach_px"] == logo_matte.INSIDE_EDGE_PX
    assert inside["px"] >= 0.85 * see


def test_a_hole_joined_to_the_outside_is_outside_however_narrow() -> None:
    # the patch fills the letter but for its 4 px outline, and a hole is glued to the letter's edge: one pixel of navy
    # between it and the key round the letter. Sealed, the hole is walled in and the patch round it is inside; with
    # that one pixel of the key, the hole is joined to the outside and the patch has a way out through it
    patch, holes = (24, 176, 24, 296), ((96, 21, 9),)
    sealed, _ = logo_matte.matte(walled_patch(patch=patch, holes=holes), key="green")
    opened, _ = logo_matte.matte(walled_patch(patch=patch, holes=holes, opening=(100, 20)), key="green")
    assert np.asarray(opened)[100, 19:30, 3].max() == 0  # nothing from the outside into the hole
    assert logo_matte.see_through_inside(sealed)["wide"]
    found = logo_matte.see_through_inside(opened)
    assert found["px"] == 0 and not found["wide"]


def test_big_letters_with_counters_are_not_see_through_inside() -> None:
    # an O's counter and an A's are transparent and walled in by the letters, so not outside; nothing see-through lies
    # in them past the letters' antialiased rim, so nothing is inside
    cut, _ = logo_matte.matte(lettering(shapes=hollow_letters, size=(640, 320), glow=None, key=GREEN_PAINTED).image,
                              key="green")
    alpha = np.asarray(cut)[..., 3]
    assert alpha[160, 179] == 0 and alpha[150, 460] == 0  # the middle of the O's counter and of the A's
    inside = logo_matte.see_through_inside(cut)
    assert inside["px"] == 0 and not inside["wide"]


@pytest.mark.parametrize("item, key", [
    (lambda: lettering(shapes=hollow_letters, size=(640, 320)), "magenta"),
    (lambda: lettering(shapes=hollow_letters, size=(640, 320), fill=(232, 182, 52), outline=(20, 24, 40),
                       glow=(40, 230, 255), glow_radius=6.0, key=GREEN_PAINTED), "green"),
    (lambda: lettering(shapes=hollow_letters, size=(640, 320), fill=(255, 214, 40), glow=(255, 120, 20),
                       glow_radius=5.0, glow_strength=0.7, key=GREEN_PAINTED), "green"),
], ids=["white-glow", "outlined-cyan-glow-green", "orange-glow-green"])
def test_a_glow_pooled_in_a_big_counter_is_not_see_through_inside(item, key) -> None:
    # the glow pools round a counter whose middle stays transparent, walled in by the letter: it reaches no farther
    # from the letter there than beside it
    cut, _ = logo_matte.matte(item().image, key=key)
    assert np.asarray(cut)[160, 179, 3] == 0  # the middle of the O's counter
    assert not logo_matte.see_through_inside(cut)["wide"]


def test_the_key_is_read_off_the_lettering_box_not_the_scene() -> None:
    mood = Image.new("RGB", (100, 50), (40, 200, 60))  # a forest scene ...
    for x in range(40, 60):
        for y in range(20, 30):
            mood.putpixel((x, y), (40, 230, 255))  # ... with cyan lettering in it
    assert logo_matte.choose_key(mood)["key"] == "magenta"
    choice = logo_matte.choose_key(mood, box=[0.4, 0.4, 0.6, 0.6])
    assert choice["key"] == "green" and choice["region"] == "lettering-box"
