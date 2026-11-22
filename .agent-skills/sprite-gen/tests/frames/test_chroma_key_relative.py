# SPDX-License-Identifier: Apache-2.0
"""Regression: a flat background that is the *declared key's hue* but darker than
the pure key must key out completely.

Image models asked for #00FF00 / #FF00FF return a slightly different flat color
every time. Measured 2026-09-11 (Grok, samurai-b-walk rev1): the background came
back as (8, 162, 24). Its absolute RGB distance to (0, 255, 0) is 96.38 — a hair
over the 96.0 hard-key threshold — so the *entire* background survived as opaque
pixels, while a one-step-brighter (7, 163, 24) at 95.34 keyed out. Nothing about
the frame changed; only the model's brightness did. `video-frames` then reported
the surviving background as "framed too tight" (edge contact).

The fixtures below are synthetic (no binary assets): a flat background of the
dark key plus a subject square that shares no hue with the key. The contract is
pixel-exact — zero residual background pixels and the subject byte-preserved —
because a partial result is exactly the failure mode (a half-keyed background
is not "mostly fine", it is what breaks every downstream gate).

Before the relative-threshold fix these cases fail on both the `cutout` route
and the underlying `remove_chroma_background` engine. (5, 200, 10) is within 96
of its key and passes on the old code; it is kept so the fix cannot regress the
easy case.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from sprite_gen.frames.cutout import (
    _EXTRACT_FRINGE_DELTA,
    _EXTRACT_FRINGE_THRESHOLD,
    _EXTRACT_KEY_THRESHOLD,
    cutout,
)
from sprite_gen.frames.extract import remove_chroma_background

SUBJECT = (110, 70, 50)  # warm brown — no green/magenta tint
HIGHLIGHT = (230, 210, 190)
SIZE = 128
SUBJECT_BOX = (32, 32, 96, 96)  # x0, y0, x1, y1 (exclusive)
HIGHLIGHT_BOX = (56, 56, 72, 72)

# (declared key name, key rgb, model-returned flat background, rgb distance to key)
# One case per ball the engine keys from: the pure key's (the easy case), the detected
# family colour's (the measured green, the dark magenta) and the border candidate's (Grok).
DARK_KEY_CASES = [
    pytest.param("green", (0, 255, 0), (8, 162, 24), id="green-measured-8-162-24-dist96.38"),
    pytest.param("green", (0, 255, 0), (5, 200, 10), id="green-easy-5-200-10-dist56.12"),
    pytest.param("magenta", (255, 0, 255), (170, 8, 180), id="magenta-dark-170-8-180-dist113.64"),
    # Grok's #FF00FF (measured 2026-09-11, samurai-village rev3 objects): the blue channel
    # sits well under the red one (147/216 = 0.68), so the keyed-channel balance rule of
    # `is_key_family` says "not the key's family" even though the whole border is this one
    # flat colour — the detector falls back to the declared key and the ~124 distance keeps
    # the entire background opaque.
    pytest.param("magenta", (255, 0, 255), (216, 46, 147), id="magenta-grok-216-46-147-dist123.70"),
    # A green screen whose blue channel leans toward cyan, lit over the unkeyed channels' dark bar
    # (64) while red stays at 0: the studio chroma-key green #00B140, and a brighter lean. Both sit
    # past 96 from pure green, and neither is interior family (blue over 35% of green).
    pytest.param("green", (0, 255, 0), (0, 177, 64), id="green-studio-0-177-64-dist100.90"),
    pytest.param("green", (0, 255, 0), (0, 200, 90), id="green-lean-cyan-0-200-90-dist105.48"),
    # and its twin leaning the other way, red lit toward yellow
    pytest.param("green", (0, 255, 0), (90, 210, 0), id="green-lean-yellow-90-210-0-dist100.62"),
]
GROK_MAGENTA_CASES = [c for c in DARK_KEY_CASES if "grok" in c.id]
LEAN_GREEN_CASES = [c for c in DARK_KEY_CASES if "lean" in c.id or "studio" in c.id]
# `cutout --key` hands an explicit key to the engine above, which checks the pixels per colour:
# one green, one Grok magenta and one lean green show the route.
CUTOUT_KEY_CASES = [c for c in DARK_KEY_CASES if c.id.startswith(("green-measured", "magenta-grok", "green-lean-cyan"))]


def make_flat_key_still(background: tuple[int, int, int]) -> Image.Image:
    """SIZE x SIZE flat `background`, centered subject square with a highlight inside."""
    img = Image.new("RGBA", (SIZE, SIZE), background + (255,))
    px = img.load()
    x0, y0, x1, y1 = SUBJECT_BOX
    for y in range(y0, y1):
        for x in range(x0, x1):
            px[x, y] = SUBJECT + (255,)
    hx0, hy0, hx1, hy1 = HIGHLIGHT_BOX
    for y in range(hy0, hy1):
        for x in range(hx0, hx1):
            px[x, y] = HIGHLIGHT + (255,)
    return img


def _in_subject(x: int, y: int) -> bool:
    x0, y0, x1, y1 = SUBJECT_BOX
    return x0 <= x < x1 and y0 <= y < y1


def audit(result: Image.Image, source: Image.Image) -> tuple[int, int]:
    """(residual background px with alpha>0, subject px changed in RGBA)."""
    out = result.convert("RGBA").load()
    src = source.load()
    residual = subject_changed = 0
    for y in range(SIZE):
        for x in range(SIZE):
            if _in_subject(x, y):
                if out[x, y] != src[x, y]:
                    subject_changed += 1
            elif out[x, y][3] != 0:
                residual += 1
    return residual, subject_changed


@pytest.mark.parametrize(("key", "key_rgb", "background"), DARK_KEY_CASES)
def test_remove_chroma_background_keys_out_dark_flat_key(
    key: str, key_rgb: tuple[int, int, int], background: tuple[int, int, int]
) -> None:
    """Engine level: the extract CLI defaults (as cutout passes them) must clear the flat bg."""
    source = make_flat_key_still(background)
    result = remove_chroma_background(
        source, key_rgb, _EXTRACT_KEY_THRESHOLD, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA
    )
    residual, subject_changed = audit(result, source)
    assert residual == 0, f"{background} on key {key}: {residual} background px survived"
    assert subject_changed == 0, f"{background} on key {key}: {subject_changed} subject px altered"


@pytest.mark.parametrize(("key", "key_rgb", "background"), CUTOUT_KEY_CASES)
def test_cutout_explicit_key_keys_out_dark_flat_key(
    tmp_path: Path, key: str, key_rgb: tuple[int, int, int], background: tuple[int, int, int]
) -> None:
    """`cutout --key green|magenta` (the video-canvas / gen chroma entry): bg 100% transparent."""
    source = make_flat_key_still(background)
    src_path = tmp_path / f"{key}-{'-'.join(map(str, background))}.png"
    source.save(src_path)
    out_path = tmp_path / "cutout.png"

    stats = cutout(src_path, out_path, key=key)

    assert stats["route"] == f"extract:{key}"
    residual, subject_changed = audit(Image.open(out_path), source)
    assert residual == 0, f"{background} on key {key}: {residual} background px survived"
    assert subject_changed == 0, f"{background} on key {key}: {subject_changed} subject px altered"
    subject_area = (SUBJECT_BOX[2] - SUBJECT_BOX[0]) * (SUBJECT_BOX[3] - SUBJECT_BOX[1])
    expected_alpha_zero_pct = round((SIZE * SIZE - subject_area) / (SIZE * SIZE) * 100, 2)
    assert stats["alpha_zero_pct"] == expected_alpha_zero_pct


# --- the detection layer itself ----------------------------------------------
# `remove_chroma_background` keys from the smaller of the distance to the
# declared key and to the background colour it detects on the borders. These
# pin the detector's contract: what counts as "the key's family", that the mode
# wins over the mean, and that the opt-out reproduces the single-key result.

from sprite_gen.frames.extract import detect_background_key_rgb, is_key_family  # noqa: E402

GREEN = (0, 255, 0)
MAGENTA = (255, 0, 255)
HOT_PINK = (250, 77, 150)  # ~129 from magenta — subject material the trap-band tests protect
PURPLE = (213, 112, 246)  # ~153 from magenta — same


# The border rule is the family rule OR more, so a colour it refuses (its table below) is never
# family; the false rows here are the ones only the family rule refuses: keyed channels out of
# balance, and the degenerate key.
@pytest.mark.parametrize(
    ("color", "key", "expected"),
    [
        ((8, 162, 24), GREEN, True),
        ((20, 120, 25), GREEN, True),  # brightness is free
        ((170, 8, 180), MAGENTA, True),
        ((255, 0, 128), MAGENTA, False),  # keyed channels out of balance
        ((216, 46, 147), MAGENTA, False),  # Grok magenta: out of balance too — interior rule stays strict
        ((8, 162, 24), (128, 128, 128), False),  # degenerate key has no family
    ],
)
def test_is_key_family(color: tuple[int, int, int], key: tuple[int, int, int], expected: bool) -> None:
    assert is_key_family(color, key) is expected


def test_detect_returns_declared_key_when_background_is_exact_despite_border_fringe() -> None:
    """A few antialiased fringe pixels on the border must not drag the key off — mode, not mean."""
    img = Image.new("RGBA", (64, 48), GREEN + (255,))
    px = img.load()
    for x in range(0, 64, 3):  # sparse family-coloured fringe along the top border
        px[x, 0] = (10, 200, 20, 255)
    assert detect_background_key_rgb(img, GREEN) == GREEN


def test_detect_picks_dominant_cluster_not_midpoint() -> None:
    """Two family clusters on the border: the dominant one wins outright."""
    img = Image.new("RGBA", (60, 60), (8, 162, 24, 255))
    px = img.load()
    for y in range(60):
        for x in range(0, 10):  # minority stripe of a different green
            px[x, y] = (5, 230, 10, 255)
    assert detect_background_key_rgb(img, GREEN) == (8, 162, 24)


def test_detect_ignores_family_coloured_subject_when_background_dominates() -> None:
    """A green-family subject touching the borders does not become the key."""
    img = Image.new("RGBA", (120, 120), GREEN + (255,))
    px = img.load()
    for y in range(0, 120):  # subject column touching top and bottom borders
        for x in range(50, 70):
            px[x, y] = (20, 140, 30, 255)
    assert detect_background_key_rgb(img, GREEN) == GREEN


def test_detect_returns_declared_key_without_family_background() -> None:
    img = Image.new("RGBA", (40, 40), (248, 247, 242, 255))
    assert detect_background_key_rgb(img, GREEN) == GREEN
    assert detect_background_key_rgb(img, (128, 128, 128)) == (128, 128, 128)


def test_detect_skips_transparent_border_pixels() -> None:
    img = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
    px = img.load()
    for y in range(8, 32):
        for x in range(8, 32):
            px[x, y] = (8, 162, 24, 255)
    # Only transparent pixels are sampled → nothing to detect from.
    assert detect_background_key_rgb(img, GREEN) == GREEN


def test_background_key_opt_out_reproduces_single_key_behaviour() -> None:
    """`background_key=<declared>` pins the pre-detection result (the byte-identity gate relies on it)."""
    source = make_flat_key_still((8, 162, 24))
    pinned = remove_chroma_background(
        source, GREEN, _EXTRACT_KEY_THRESHOLD, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA,
        background_key=GREEN,
    )
    assert audit(pinned, source)[0] == SIZE * SIZE - 64 * 64  # every background pixel survives


def test_cutout_auto_routes_dark_green_corners_to_extract(tmp_path: Path) -> None:
    source = make_flat_key_still((8, 162, 24))
    src_path = tmp_path / "dark-green.png"
    source.save(src_path)
    stats = cutout(src_path, tmp_path / "out.png", key="auto")
    assert stats["route"] == "extract:green"
    assert stats["chroma_key"] == [0, 255, 0]
    assert stats["chroma_key_painted"] == [8, 162, 24]
    assert audit(Image.open(tmp_path / "out.png"), source) == (0, 0)


def test_cutout_auto_route_uses_the_engine_family_rule() -> None:
    """Route detection and the engine share one family rule: key variants → extract, subject colours → matte."""
    from sprite_gen.frames.cutout import _detect_key_kind

    assert _detect_key_kind((8, 162, 24)) == "green"
    assert _detect_key_kind((170, 8, 180)) == "magenta"
    assert _detect_key_kind((0, 200, 90)) == "green"  # a green screen leaning toward cyan
    assert _detect_key_kind(HOT_PINK) == "white"
    assert _detect_key_kind((248, 247, 242)) == "white"


# --- border key candidate: a flat border is already evidence of "background" --------------
# The interior family rule (`is_key_family`) keeps its keyed-channel balance test so hot pink
# and purple inside the subject are never keyed. A colour that fills the *border* is a
# different question: it is the background, and only needs the key's hue signature — lit
# keyed channels, dark unkeyed channels — to be accepted as the painted key. Every entry
# point that classifies the border (engine detector, `cutout --key auto`, `video-canvas`)
# must share that one rule.


@pytest.mark.parametrize(("key", "key_rgb", "background"), GROK_MAGENTA_CASES)
def test_cutout_auto_routes_grok_magenta_corners_to_extract(
    tmp_path: Path, key: str, key_rgb: tuple[int, int, int], background: tuple[int, int, int]
) -> None:
    """`cutout --key auto` on the Grok magenta: extract route, painted key recorded, bg fully cleared."""
    from sprite_gen.frames.cutout import _detect_key_kind

    assert _detect_key_kind(background) == key
    source = make_flat_key_still(background)
    src_path = tmp_path / "grok-magenta.png"
    source.save(src_path)
    stats = cutout(src_path, tmp_path / "out.png", key="auto")
    assert stats["route"] == f"extract:{key}"
    assert stats["chroma_key"] == list(key_rgb)
    assert stats["chroma_key_painted"] == list(background)
    assert audit(Image.open(tmp_path / "out.png"), source) == (0, 0)


def test_border_candidate_rule_still_rejects_subject_colours_and_non_keys() -> None:
    """Relaxing the border rule must not let hot pink / purple / ivory / cyan become a key, nor the
    greens past the lean: teal, sea green, a grey-green and a green as near cyan as green."""
    for colour in (HOT_PINK, PURPLE, (248, 247, 242), (0, 255, 255), (30, 60, 30),
                   (0, 128, 128), (46, 139, 87), (70, 200, 90), (0, 200, 100)):
        assert detect_background_key_rgb(make_flat_key_still(colour), MAGENTA) == MAGENTA
        assert detect_background_key_rgb(make_flat_key_still(colour), GREEN) == GREEN


@pytest.mark.slow
def test_the_lean_green_widens_only_the_green_key_and_only_toward_green() -> None:
    """The colours the leaning-green branch adds, over the whole RGB cube: none for magenta (a key with
    one unkeyed channel keeps that channel dark — hot pink's 77 included), none dropped for either key,
    and for green only hues nearer green (120 degrees) than yellow or cyan (90 and 180, past 150)."""
    from sprite_gen._deps import np
    from sprite_gen.frames.extract import (_BORDER_KEY_MAX_UNKEYED_RATIO, _KEY_CHANNEL_DARK, _border_key_candidate_field,
                                           _key_channel_split, _key_family_field)

    values = np.arange(256, dtype=np.int32)
    lean = {GREEN: 0, MAGENTA: 0}
    for key in (GREEN, MAGENTA):
        keyed_channels, unkeyed_channels = _key_channel_split(key)
        for red in range(256):
            rgb = np.stack(np.meshgrid([red], values, values, indexing="ij"), axis=-1).reshape(-1, 3)
            border = _border_key_candidate_field(rgb, keyed_channels, unkeyed_channels)
            keyed_min = rgb[:, keyed_channels].min(axis=-1)
            keyed_max = rgb[:, keyed_channels].max(axis=-1)
            unkeyed_max = rgb[:, unkeyed_channels].max(axis=-1)
            # every unkeyed channel dark: the signature before the lean
            dark = ((keyed_min >= _KEY_CHANNEL_DARK) & (unkeyed_max < _KEY_CHANNEL_DARK)
                    & (unkeyed_max <= keyed_max * _BORDER_KEY_MAX_UNKEYED_RATIO))
            before = dark | _key_family_field(rgb, keyed_channels, unkeyed_channels)
            assert not (before & ~border).any(), (key, rgb[before & ~border][:4])
            # without the lean the field is the rule as it was, colour for colour
            strict = _border_key_candidate_field(rgb, keyed_channels, unkeyed_channels, lean=False)
            assert (strict == before).all(), (key, rgb[strict != before][:4])
            added = rgb[border & ~before]
            lean[key] += len(added)
            if key == GREEN and len(added):
                r, g, b = added[:, 0], added[:, 1], added[:, 2]  # green is the largest channel of each
                hue = 120 + 60 * (b - r) / (g - np.minimum(r, b))
                assert ((hue > 90) & (hue < 150)).all(), added[(hue <= 90) | (hue >= 150)][:4]
    assert lean[MAGENTA] == 0
    assert lean[GREEN] > 0


def test_hot_pink_block_inside_the_subject_survives_a_grok_magenta_key() -> None:
    """Interior protection with the relaxed border: a hot-pink patch inside the brown subject stays."""
    background = (216, 46, 147)
    source = make_flat_key_still(background)
    px = source.load()
    for y in range(40, 52):
        for x in range(40, 52):
            px[x, y] = HOT_PINK + (255,)
    result = remove_chroma_background(
        source, MAGENTA, _EXTRACT_KEY_THRESHOLD, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA
    )
    residual, subject_changed = audit(result, source)
    assert residual == 0, f"{residual} background px survived"
    assert subject_changed == 0, f"{subject_changed} subject px altered (hot-pink block must be untouched)"


from sprite_gen.frames.extract import is_border_key_candidate  # noqa: E402


# One row per branch of the rule: the interior rule's colours, the off-balance painted keys, the
# leaning green, and each of the hue signature's conditions failing. Purple, ivory and cyan are
# refused through the detector in `test_border_candidate_rule_still_rejects_subject_colours_and_non_keys`.
@pytest.mark.parametrize(
    ("color", "key", "expected"),
    [
        ((216, 46, 147), MAGENTA, True),  # Grok, 2026-09-11 (blue/red 0.68)
        ((236, 59, 161), MAGENTA, True),  # prop-fence-bamboo raw border
        ((170, 8, 180), MAGENTA, True),  # everything the interior rule admits, the border rule admits
        ((0, 177, 64), GREEN, True),  # studio chroma green: blue lit (64), red dark — nearer green than cyan
        ((0, 200, 90), GREEN, True),  # a green leaning toward cyan, blue 0.45 of green
        ((90, 210, 0), GREEN, True),  # the same lean toward yellow, on red
        (HOT_PINK, MAGENTA, False),  # unkeyed (green) channel lit: 77 >= 64, and it is the only one
        ((30, 60, 30), GREEN, False),  # keyed channel not lit
        ((70, 60, 65), MAGENTA, False),  # dark grey-mauve: unkeyed dark but not saturated (60/70)
        ((70, 200, 90), GREEN, False),  # both unkeyed channels lit: a grey-green, not a lean
        ((0, 200, 100), GREEN, False),  # blue at half of green: as near cyan as green, past the lean
        ((216, 46, 147), (128, 128, 128), False),  # degenerate key has no candidates
    ],
)
def test_is_border_key_candidate(color: tuple[int, int, int], key: tuple[int, int, int], expected: bool) -> None:
    assert is_border_key_candidate(color, key) is expected


def test_border_rule_is_a_superset_of_the_interior_rule_and_matches_its_vector_form() -> None:
    """Every interior-family colour is a border candidate (detection cannot regress), and the
    vectorised rule the detector and engine use agrees with the scalar one on a colour grid."""
    import itertools

    from sprite_gen._deps import np
    from sprite_gen.frames.extract import _border_key_candidate_field, _key_channel_split

    grid = list(itertools.product(range(0, 256, 17), repeat=3))
    for key in (GREEN, MAGENTA):
        scalar = [is_border_key_candidate(color, key) for color in grid]
        vector = _border_key_candidate_field(np.array(grid, dtype=np.int32), *_key_channel_split(key))
        assert vector.tolist() == scalar
        for color, border in zip(grid, scalar):
            if is_key_family(color, key):
                assert border, (color, key)


# The painted key blended half and half with a subject colour, as an antialiased rim is: for Grok's
# magenta the highlight (its green lit), for the lean greens the brown (its red lit past the lean).
PAINTED_BALL_CASES = [pytest.param(*c.values, HIGHLIGHT, id=c.id) for c in GROK_MAGENTA_CASES] + [
    pytest.param(*c.values, SUBJECT, id=c.id) for c in LEAN_GREEN_CASES
]


@pytest.mark.parametrize(("key", "key_rgb", "background", "partner"), PAINTED_BALL_CASES)
def test_painted_key_ball_is_bounded_by_connectivity_to_the_background(
    key: str, key_rgb: tuple[int, int, int], background: tuple[int, int, int], partner: tuple[int, int, int]
) -> None:
    """The cut around the painted colour erases the background it is connected to, not look-alikes inside the subject.

    Two patches of the same off-signature blend colour (the painted key mixed with
    a lit subject colour, as an antialiased rim is): one on the subject's rim, touching
    the background, and one buried inside the subject. The rim patch is background
    residue and goes; the buried patch has no border evidence and stays. The declared
    key's own ball is unchanged — position-blind — so a patch *within 96 of the pure key*
    inside the subject is still erased, as it always was.
    """
    blend = tuple((b + s) // 2 for b, s in zip(background, partner))  # e.g. (223, 128, 168): G lit, ~90 from bg
    assert not is_border_key_candidate(blend, key_rgb)
    assert color_dist(blend, background) <= _EXTRACT_KEY_THRESHOLD < color_dist(blend, key_rgb)
    source = make_flat_key_still(background)
    px = source.load()
    x0, y0, x1, y1 = SUBJECT_BOX
    for y in range(y0, y0 + 4):  # rim patch: inside the subject box, touching the background above
        for x in range(x0 + 8, x0 + 24):
            px[x, y] = blend + (255,)
    for y in range(76, 88):  # buried patch: surrounded by brown
        for x in range(76, 88):
            px[x, y] = blend + (255,)
    result = remove_chroma_background(
        source, key_rgb, _EXTRACT_KEY_THRESHOLD, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA
    )
    out = result.load()
    assert all(out[x, y][3] == 0 for y in range(y0, y0 + 4) for x in range(x0 + 8, x0 + 24)), "rim residue must be cut"
    assert all(out[x, y] == px[x, y] for y in range(76, 88) for x in range(76, 88)), "buried look-alike must survive"
    assert all(out[x, y][3] == 0 for y in range(SIZE) for x in range(SIZE) if not _in_subject(x, y)), "background gone"


@pytest.mark.parametrize("patch", [(0, 160, 75), (10, 120, 50)], ids=["emerald", "dark-lean"])
def test_a_leaning_green_patch_in_the_subject_is_the_painted_colours_only_when_the_background_leans(
    patch: tuple[int, int, int]
) -> None:
    """The lean is evidence about the background that leans. On the dark green the rule took before it
    (family, no lean), a leaning-green patch buried in the subject within the painted ball is kept byte for
    byte, as it was before the lean; on a background that leans, the same patch carries the painted colour's
    signature and is keyed with it, as any signature colour inside the painted ball is."""
    for background, kept in (((8, 162, 24), True), ((0, 200, 90), False)):
        assert color_dist(patch, background) <= _EXTRACT_KEY_THRESHOLD < color_dist(patch, GREEN)
        source = make_flat_key_still(background)
        px = source.load()
        for y in range(76, 88):  # buried in the brown, away from the highlight
            for x in range(76, 88):
                px[x, y] = patch + (255,)
        result = remove_chroma_background(
            source, GREEN, _EXTRACT_KEY_THRESHOLD, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA
        )
        out = result.load()
        assert audit(result, source)[0] == 0, background
        buried = [out[x, y] for y in range(76, 88) for x in range(76, 88)]
        if kept:
            assert buried == [patch + (255,)] * len(buried), background
        else:
            assert all(pixel[3] == 0 for pixel in buried), background


# --- the lean is read only where the rule before it finds no background ----------------------
# (0, 200, 71) is admitted only through the lean (blue just over 35% of green) and shares the 8-wide
# histogram bin of the interior-family background (0, 200, 64). Read with it, it moved the mean the
# detector returns one step toward itself, and the painted ball's edge with it: the teal subject
# (0, 154, 149) sits 96.65 from (0, 200, 64), just outside the ball, and 95.77 from (0, 200, 65),
# inside it, so the ball grew from the background into all of it. In a bin of its own, (0, 200, 90)
# outnumbering the background was the mode. Either way a border the rule before the lean takes
# changed colour. Each variant spreads the lean over the top-left 24 x 24 (20.5% of the samples) or
# over everything but a 32 x 32 block of the background in the bottom-right corner (77.3%).

LEAN_MIX_BACKGROUND = (0, 200, 64)
LEAN_MIX_SUBJECT = (0, 154, 149)
LEAN_MIX_SUBJECT_BOX = (40, 40, 88, 88)  # x0, y0, x1, y1 (exclusive): 48 x 48


def make_lean_mix_still(lean: tuple[int, int, int], spread: str) -> Image.Image:
    """SIZE x SIZE: the background with the leaning green in the top-left 24 x 24 (`corner`) or the leaning
    green with the background in the bottom-right 32 x 32 (`around`), and the teal subject in the middle."""
    base, block, box = ((LEAN_MIX_BACKGROUND, lean, (0, 0, 24, 24)) if spread == "corner"
                        else (lean, LEAN_MIX_BACKGROUND, (96, 96, SIZE, SIZE)))
    img = Image.new("RGBA", (SIZE, SIZE), base + (255,))
    px = img.load()
    for colour, (x0, y0, x1, y1) in ((block, box), (LEAN_MIX_SUBJECT, LEAN_MIX_SUBJECT_BOX)):
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = colour + (255,)
    return img


@pytest.mark.parametrize(
    ("lean", "spread"),
    [
        pytest.param((0, 200, 71), "corner", id="same-bin-minority"),
        pytest.param((0, 200, 71), "around", id="same-bin-majority"),
        pytest.param((0, 200, 90), "corner", id="own-bin-minority"),
        pytest.param((0, 200, 90), "around", id="own-bin-majority"),
    ],
)
def test_lean_samples_leave_the_background_the_rule_before_the_lean_finds(
    lean: tuple[int, int, int], spread: str
) -> None:
    """Where the colours the rule admitted before the lean make up 12% of the samples, the detector returns the
    colour they give, unmoved by the lean's samples, and the frame keys exactly as it does from that colour
    pinned: the subject just outside its ball keeps every pixel, and the background goes, its leaning part too."""
    from sprite_gen._deps import np
    from sprite_gen.frames.extract import _KEY_DETECT_MIN_FRACTION, _key_detect_sample_mask

    assert is_border_key_candidate(lean, GREEN) and not is_key_family(lean, GREEN)  # admitted through the lean only
    assert color_dist(LEAN_MIX_SUBJECT, (0, 200, 65)) <= _EXTRACT_KEY_THRESHOLD < color_dist(LEAN_MIX_SUBJECT, LEAN_MIX_BACKGROUND)
    source = make_lean_mix_still(lean, spread)
    samples = _key_detect_sample_mask(SIZE, SIZE)
    found_before = samples & (np.asarray(source)[..., :3] == LEAN_MIX_BACKGROUND).all(axis=-1)
    assert found_before.sum() >= samples.sum() * _KEY_DETECT_MIN_FRACTION  # a border the rule before the lean takes

    assert detect_background_key_rgb(source, GREEN) == LEAN_MIX_BACKGROUND
    result = remove_chroma_background(
        source, GREEN, _EXTRACT_KEY_THRESHOLD, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA
    )
    pinned = remove_chroma_background(
        source, GREEN, _EXTRACT_KEY_THRESHOLD, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA,
        background_key=LEAN_MIX_BACKGROUND,
    )
    assert result.tobytes() == pinned.tobytes()
    out = result.load()
    x0, y0, x1, y1 = LEAN_MIX_SUBJECT_BOX
    subject = [(x, y) for y in range(y0, y1) for x in range(x0, x1)]
    assert sum(out[x, y][3] == 0 for x, y in subject) == 0, "the subject just outside the ball is erased"
    assert all(out[x, y][3] == 0 for y in range(SIZE) for x in range(SIZE)
               if not (x0 <= x < x1 and y0 <= y < y1)), "background gone"


@pytest.mark.parametrize("block", [0, 16], ids=["none-before-the-lean", "under-12pct-before-the-lean"])
def test_lean_samples_find_the_background_the_rule_before_the_lean_does_not(block: int) -> None:
    """A leaning green fills the border and the rule before the lean finds nothing there: no colour it admits,
    or a 16 x 16 block of an interior-family green, 9.1% of the samples, under the 12% it needs. The lean's
    samples are read with the others then: their mode is the painted colour and the background keys out."""
    lean = (0, 200, 90)
    source = make_flat_key_still(lean)
    px = source.load()
    for y in range(block):
        for x in range(block):
            px[x, y] = LEAN_MIX_BACKGROUND + (255,)
    assert detect_background_key_rgb(source, GREEN) == lean
    result = remove_chroma_background(
        source, GREEN, _EXTRACT_KEY_THRESHOLD, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA
    )
    assert audit(result, source) == (0, 0)


def test_the_colour_found_before_the_lean_never_leans_itself() -> None:
    """The cut reads a painted colour as it did before the lean unless the colour leans itself
    (`_painted_key_leans`), so a border the rule before the lean takes keys as before only if the colour found
    there does not lean. It is the floor of the mean of one 8-wide bin of colours that rule admits, and a floor
    can cross the rule's line (an unkeyed channel at most 35% of green). Checked exactly for green over every
    bin of green and one unkeyed channel, the other at 0 where the bin leaves the most room (the rule reads both
    alike): the means a bin's members give are their convex hull, and none floors to a colour the rule refuses.
    Bins 16 wide would not hold."""
    from fractions import Fraction

    from sprite_gen._deps import np
    from sprite_gen.frames.extract import _KEY_DETECT_BIN_SHIFT, _border_key_candidate_field, _key_channel_split

    width = 1 << _KEY_DETECT_BIN_SHIFT
    values = np.arange(256, dtype=np.int32)
    green, unkeyed = np.meshgrid(values, values, indexing="ij")
    rgb = np.stack([unkeyed, green, np.zeros_like(green)], axis=-1)
    admitted = _border_key_candidate_field(rgb, *_key_channel_split(GREEN), lean=False)  # [green, unkeyed]
    for g0 in range(0, 256, width):
        for u0 in range(0, 256, width):
            block = admitted[g0:g0 + width, u0:u0 + width]
            if not block.any() or block.all():
                continue  # no member, or no floor to cross
            # a green's members are the low end of its column: its highest member bounds the column
            tops = [(g0 + i, u0 + int(np.flatnonzero(column).max())) for i, column in enumerate(block) if column.any()]
            hull: list[tuple[int, int]] = []  # the hull's upper edge, left to right
            for point in tops:
                while len(hull) >= 2 and ((hull[-1][0] - hull[-2][0]) * (point[1] - hull[-2][1])
                                          >= (point[0] - hull[-2][0]) * (hull[-1][1] - hull[-2][1])):
                    hull.pop()
                hull.append(point)

            def highest_mean(g: int) -> Fraction:  # the highest unkeyed mean the members give at mean green g
                for (ga, ua), (gb, ub) in zip(hull, hull[1:]):
                    if ga <= g <= gb:
                        return ua + Fraction(ub - ua, gb - ga) * (g - ga)
                return Fraction(hull[0][1])

            last = hull[-1][0]
            for g in range(hull[0][0], last + 1):
                refused = np.flatnonzero(~block[g - g0])
                if not len(refused):
                    continue
                lowest = u0 + int(refused.min())  # the floor must stay under it at green g
                assert highest_mean(g) < lowest and (g == last or highest_mean(g + 1) <= lowest), (g, lowest, hull)


# --- the lean is read only where the declared key's own cut leaves the background ------------------------
# Under the 12% the rule before the lean needs, a leaning border was read whatever the declared key did with
# it. (0, 210, 80) sits 91.8 from pure green, inside its cut: the key clears that background by itself, and
# the teal subject (0, 154, 149), 180 from the key but 88.9 from the leaning colour, stays. Read as the
# painted colour, the leaning ball reached the subject through the background and erased it: a subject lost
# for no background gained. The same happened through a second key-coloured colour on the border (a leaf of
# the subject, another green) and through a subject's soft rim crossing the cut. The lean is now read only
# where the key's cut leaves the border's dominant colour and the border holds no other key-coloured one.

LEFT_INSIDE_THE_CUT = (0, 210, 80)  # 91.8 from pure green


def make_leaning_frame(background: tuple[int, int, int]):
    """SIZE x SIZE RGBA array of `background`, opaque."""
    from sprite_gen._deps import np

    data = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    data[..., 3] = 255
    data[..., :3] = background
    return data


def key_both_ways(data) -> tuple[Image.Image, Image.Image]:
    """(the engine with its own detection, the engine with the declared key pinned) on the frame `data`."""
    source = Image.fromarray(data, "RGBA")
    result = remove_chroma_background(source, GREEN, _EXTRACT_KEY_THRESHOLD, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA)
    pinned = remove_chroma_background(source, GREEN, _EXTRACT_KEY_THRESHOLD, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA,
                                      background_key=GREEN)
    return result, pinned


@pytest.mark.parametrize("share", [0, 11], ids=["nothing-before-the-lean", "11pct-before-the-lean"])
def test_a_leaning_border_the_declared_key_clears_keeps_the_declared_key(share: int) -> None:
    """The declared key clears (0, 210, 80) by itself. The detector keeps the key and the frame keys as it does from
    the key pinned: the background goes, the teal subject the leaning ball would reach loses no pixel. With nothing on
    the border the rule before the lean admits, and with 11% of the samples an interior-family green, under its 12%."""
    from sprite_gen._deps import np
    from sprite_gen.frames.extract import _key_detect_sample_mask

    assert color_dist(LEFT_INSIDE_THE_CUT, GREEN) <= _EXTRACT_KEY_THRESHOLD  # the key's cut clears it
    assert color_dist(LEAN_MIX_SUBJECT, LEFT_INSIDE_THE_CUT) <= _EXTRACT_KEY_THRESHOLD < color_dist(LEAN_MIX_SUBJECT, GREEN)
    data = make_leaning_frame(LEFT_INSIDE_THE_CUT)
    coords = np.argwhere(_key_detect_sample_mask(SIZE, SIZE))
    count = round(len(coords) * share / 100)
    data[coords[:count, 0], coords[:count, 1], :3] = LEAN_MIX_BACKGROUND
    x0, y0, x1, y1 = LEAN_MIX_SUBJECT_BOX
    data[y0:y1, x0:x1, :3] = LEAN_MIX_SUBJECT

    assert detect_background_key_rgb(Image.fromarray(data, "RGBA"), GREEN) == GREEN
    result, pinned = key_both_ways(data)
    assert result.tobytes() == pinned.tobytes()
    alpha = np.asarray(result)[..., 3]
    subject = np.zeros((SIZE, SIZE), dtype=bool)
    subject[y0:y1, x0:x1] = True
    assert (alpha[subject] != 0).all(), "the teal subject is erased"
    assert (alpha[~subject] == 0).all(), "background left"


def test_a_leaning_leaf_of_the_subject_on_the_border_is_not_read_as_the_background() -> None:
    """A leaning-green leaf of the subject runs along the bottom edge, over a leaning background the declared key
    clears by itself. The leaf is a second key-coloured colour on the border, past the key's cut and inside the
    leaning background's ball: the detector keeps the key, the background goes and the leaf loses no pixel."""
    from sprite_gen._deps import np

    background, leaf = (0, 215, 80), (20, 140, 60)
    assert color_dist(background, GREEN) <= _EXTRACT_KEY_THRESHOLD < color_dist(leaf, GREEN)
    assert color_dist(leaf, background) <= _EXTRACT_KEY_THRESHOLD
    assert is_border_key_candidate(leaf, GREEN) and not is_key_family(leaf, GREEN)  # admitted through the lean only
    data = make_leaning_frame(background)
    x0, y0, x1, y1 = SUBJECT_BOX
    data[y0:y1, x0:x1, :3] = SUBJECT
    data[SIZE - 24:, :, :3] = leaf  # the leaf along the bottom edge
    data[y1:SIZE - 24, 60:68, :3] = leaf  # its stem, joined to the subject
    subject = (data[..., :3] == SUBJECT).all(axis=-1) | (data[..., :3] == leaf).all(axis=-1)

    assert detect_background_key_rgb(Image.fromarray(data, "RGBA"), GREEN) == GREEN
    result, pinned = key_both_ways(data)
    assert result.tobytes() == pinned.tobytes()
    alpha = np.asarray(result)[..., 3]
    assert (alpha[subject] != 0).all(), "the leaf is erased"
    assert (alpha[~subject] == 0).all(), "background left"


def test_a_second_key_coloured_cluster_on_the_border_keeps_the_declared_key() -> None:
    """The border holds two leaning greens: the dominant one inside the declared key's cut, another past the cut and
    past the first one's ball, in the top-left corner patch. The border is not one background, so the detector keeps
    the key: the teal subject inside the dominant colour's ball keeps every pixel, as it did before the lean."""
    from sprite_gen._deps import np

    dominant, other = (0, 215, 80), (0, 120, 55)
    assert color_dist(dominant, GREEN) <= _EXTRACT_KEY_THRESHOLD < color_dist(other, GREEN)
    assert color_dist(other, dominant) > _EXTRACT_KEY_THRESHOLD  # the dominant colour's ball does not reach it
    assert color_dist(LEAN_MIX_SUBJECT, dominant) <= _EXTRACT_KEY_THRESHOLD
    assert all(is_border_key_candidate(c, GREEN) and not is_key_family(c, GREEN) for c in (dominant, other))
    data = make_leaning_frame(dominant)
    data[:SIZE // 5, :SIZE // 5, :3] = other
    x0, y0, x1, y1 = LEAN_MIX_SUBJECT_BOX
    data[y0:y1, x0:x1, :3] = LEAN_MIX_SUBJECT

    assert detect_background_key_rgb(Image.fromarray(data, "RGBA"), GREEN) == GREEN
    result, pinned = key_both_ways(data)
    assert result.tobytes() == pinned.tobytes()
    assert (np.asarray(result)[y0:y1, x0:x1, 3] != 0).all(), "the teal subject is erased"


def test_a_soft_rim_crossing_the_cut_on_the_border_is_not_read_as_the_background() -> None:
    """A leaning background just inside the declared key's cut, and a teal subject filling the bottom of the frame
    behind a soft six-row rim. The rim's first row crosses the cut in the bin beside the background's, but it reaches
    the border only where it meets the side edges, far under 2% of the samples: the key clears the background by
    itself and stays, and the subject the leaning ball would reach loses no pixel."""
    from sprite_gen._deps import np

    background, top = (0, 212, 84), 84  # the subject from row 84 down
    assert color_dist(background, GREEN) <= _EXTRACT_KEY_THRESHOLD
    assert color_dist(LEAN_MIX_SUBJECT, background) <= _EXTRACT_KEY_THRESHOLD < color_dist(LEAN_MIX_SUBJECT, GREEN)
    data = make_leaning_frame(background)
    for step in range(1, 7):  # rows 78..83 blend the background into the subject
        blend = tuple(round(b + (s - b) * step / 7) for b, s in zip(background, LEAN_MIX_SUBJECT))
        data[top - 7 + step, :, :3] = blend
    first = tuple(int(v) for v in data[top - 6, 0, :3])
    assert is_border_key_candidate(first, GREEN) and color_dist(first, GREEN) > _EXTRACT_KEY_THRESHOLD  # it crosses
    data[top:, :, :3] = LEAN_MIX_SUBJECT

    assert detect_background_key_rgb(Image.fromarray(data, "RGBA"), GREEN) == GREEN
    result, pinned = key_both_ways(data)
    assert result.tobytes() == pinned.tobytes()
    alpha = np.asarray(result)[..., 3]
    assert (alpha[top:] != 0).all(), "the subject is erased"
    assert (alpha[:top - 6] == 0).all(), "background left"


@pytest.mark.parametrize(("share", "detected"), [(1.5, GREEN), (2.5, (0, 212, 84))], ids=["under-2pct", "over-2pct"])
def test_the_leaning_colour_is_read_once_the_key_leaves_2pct_of_the_border(
    share: float, detected: tuple[int, int, int]
) -> None:
    """A leaning background just inside the declared key's cut, with a share of its border a step past the cut in the
    bin beside it, as a background painted on the cut's edge leaves. Under 2% of the samples the key stays; over it the
    leaning colour is read, the mean of its own bin (the samples past the cut sit in the bin beside it)."""
    from sprite_gen._deps import np
    from sprite_gen.frames.extract import _key_detect_sample_mask

    background, past = (0, 212, 84), (0, 210, 88)
    assert color_dist(background, GREEN) <= _EXTRACT_KEY_THRESHOLD < color_dist(past, GREEN)
    assert is_border_key_candidate(past, GREEN) and not is_key_family(past, GREEN)
    data = make_leaning_frame(background)
    x0, y0, x1, y1 = SUBJECT_BOX
    data[y0:y1, x0:x1, :3] = SUBJECT
    coords = np.argwhere(_key_detect_sample_mask(SIZE, SIZE))
    count = round(len(coords) * share / 100)
    data[coords[:count, 0], coords[:count, 1], :3] = past

    assert detect_background_key_rgb(Image.fromarray(data, "RGBA"), GREEN) == detected


def test_the_lean_is_read_against_the_cut_the_caller_keys_with() -> None:
    """(0, 200, 90) sits 105.5 from pure green: past the default cut, so the leaning colour is read, and inside a cut
    of 110, which clears it by itself, so the key stays. The engine hands the detector the cut it keys with."""
    source = make_flat_key_still((0, 200, 90))
    assert detect_background_key_rgb(source, GREEN, threshold=_EXTRACT_KEY_THRESHOLD) == (0, 200, 90)
    assert detect_background_key_rgb(source, GREEN, threshold=110) == GREEN
    wide = remove_chroma_background(source, GREEN, 110, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA)
    pinned = remove_chroma_background(source, GREEN, 110, _EXTRACT_FRINGE_THRESHOLD, _EXTRACT_FRINGE_DELTA,
                                      background_key=GREEN)
    assert wide.tobytes() == pinned.tobytes()


def test_every_answer_is_the_one_before_the_lean_or_the_one_reading_it() -> None:
    """Over a sweep of borders around the declared key's cut (leaning backgrounds inside it, across it and past it, with
    pixel noise, a second green in a corner, a subject reaching an edge), the detector answers as the rule before the
    lean does (its candidates' mode bin, or the key), or as that rule does with the lean's samples read together. Both
    answers occur, and so do borders where the two differ and the key is kept."""
    from sprite_gen._deps import np
    from sprite_gen.frames.extract import (_KEY_DETECT_BIN_SHIFT, _KEY_DETECT_MIN_FRACTION, _border_key_candidate_field,
                                           _key_channel_split, _key_detect_sample_mask)

    keyed_channels, unkeyed_channels = _key_channel_split(GREEN)
    side = 64
    sample = _key_detect_sample_mask(side, side)

    def mode_mean(colors) -> tuple[int, int, int]:
        bins = (colors >> _KEY_DETECT_BIN_SHIFT).astype(np.int64)
        slots = (bins[:, 0] << 16) | (bins[:, 1] << 8) | bins[:, 2]
        values, inverse, counts = np.unique(slots, return_inverse=True, return_counts=True)
        members = colors[inverse == int(np.argmax(counts))]
        return tuple(int(v) for v in members.sum(axis=0, dtype=np.int64) // len(members))

    rng = np.random.default_rng(1021)
    seen = {"before": 0, "together": 0, "kept-where-they-differ": 0}
    for _ in range(240):
        while True:  # a leaning background 85..115 from the key
            colour = (int(rng.integers(0, 12)), int(rng.integers(150, 241)), int(rng.integers(64, 121)))
            if is_border_key_candidate(colour, GREEN) and not is_key_family(colour, GREEN) and 85 <= color_dist(colour, GREEN) <= 115:
                break
        frame = np.clip(np.asarray(colour) + rng.normal(0, rng.choice([0, 1, 2, 3]), (side, side, 3)), 0, 255)
        if rng.random() < 0.3:  # a second green in a corner
            frame[:side // 5, :side // 5] = (int(rng.integers(0, 30)), int(rng.integers(90, 200)), int(rng.integers(20, 70)))
        top = int(rng.integers(16, 40))
        bottom = side if rng.random() < 0.3 else int(rng.integers(44, 56))  # sometimes the subject reaches the bottom edge
        frame[top:bottom, 16:48] = rng.integers(0, 256, 3)
        data = np.dstack([np.rint(frame).astype(np.uint8), np.full((side, side), 255, np.uint8)])
        rgb = data[..., :3].astype(np.int32)
        before_field = sample & _border_key_candidate_field(rgb, keyed_channels, unkeyed_channels, lean=False)
        together_field = sample & _border_key_candidate_field(rgb, keyed_channels, unkeyed_channels)
        bar = sample.sum() * _KEY_DETECT_MIN_FRACTION
        before = mode_mean(rgb[before_field]) if before_field.sum() >= bar else GREEN
        together = before if before_field.sum() >= bar else (mode_mean(rgb[together_field]) if together_field.sum() >= bar else GREEN)

        answer = detect_background_key_rgb(Image.fromarray(data, "RGBA"), GREEN)
        assert answer in (before, together), (colour, answer, before, together)
        if before != together:
            seen["together" if answer == together else "kept-where-they-differ"] += 1
        else:
            seen["before"] += 1
    assert all(seen.values()), seen


def color_dist(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return sum((p - q) ** 2 for p, q in zip(a, b)) ** 0.5


@pytest.mark.parametrize(
    ("key", "painted", "residue", "near_subject", "residual"),
    [
        pytest.param(MAGENTA, None, (216, 46, 147), HOT_PINK, 10, id="grok-magenta"),
        # sea green: past the lean, subject
        pytest.param(GREEN, (0, 200, 90), (0, 200, 90), (46, 139, 87), 10, id="lean-green"),
        # the frame keyed from a background that does not lean: a piece of leaning green is the subject's, as it was
        pytest.param(GREEN, (8, 162, 24), (0, 200, 90), (46, 139, 87), 0, id="lean-piece-on-unleaning-background"),
    ],
)
def test_edge_contact_split_reads_painted_key_residue_as_residual(
    key: tuple[int, int, int], painted: tuple[int, int, int] | None, residue: tuple[int, int, int],
    near_subject: tuple[int, int, int], residual: int,
) -> None:
    """`video-frames` edge classification uses the same border rule: leftover painted key (Grok magenta, a lean green)
    is residue, a subject colour near it (hot pink, sea green) is subject. A residue is a piece of the keyed frame with
    nothing but the key's colour in it; joined to the subject, the same pixels are its rim. A leaning green is the
    key's colour only when the background the frame was keyed from leans itself."""
    from sprite_gen.video.frames import classify_edge_contact

    raw = Image.new("RGB", (40, 40), (110, 70, 50))
    keyed = Image.new("RGBA", (40, 40), (110, 70, 50, 255))
    for x in range(0, 10):
        raw.putpixel((x, 0), residue)
        raw.putpixel((x, 2), near_subject)
    joined = classify_edge_contact(raw, keyed, key, painted)
    assert joined == {"subject": 40 * 40 - (40 - 4 * 2) * (40 - 4), "residual": 0, "rim": 0}  # every band pixel is opaque subject
    for x in range(0, 11):  # a transparent row and column cut the residue off
        keyed.putpixel((x, 1), (0, 0, 0, 0))
    keyed.putpixel((10, 0), (0, 0, 0, 0))
    split = classify_edge_contact(raw, keyed, key, painted)
    assert split["residual"] == residual
    assert split["subject"] == 40 * 40 - residual - 12 - (40 - 4 * 2) * (40 - 4)  # every other opaque band pixel is subject


# --- real stills (opt-in) ---------------------------------------------------------------
# Binary stills from image models are not committed (private data, and every regeneration
# would pile up in the public history). Point SPRITE_GEN_CHROMA_REAL_STILLS at them to run
# the same contract on the model's own output: `os.pathsep`-separated `<key>=<path.png>`
# entries, e.g. `magenta=/data/a.png:green=/data/b.png`. Skipped when unset.

_REAL_STILLS_ENV = "SPRITE_GEN_CHROMA_REAL_STILLS"


def _real_stills() -> list[pytest.ParameterSet]:
    import os

    raw = os.environ.get(_REAL_STILLS_ENV, "")
    params: list[pytest.ParameterSet] = []
    for entry in filter(None, raw.split(os.pathsep)):
        key, _, path = entry.partition("=")
        params.append(pytest.param(key, Path(path), id=f"{key}:{Path(path).name}"))
    return params


@pytest.mark.skipif(not _real_stills(), reason=f"{_REAL_STILLS_ENV} not set")
@pytest.mark.parametrize(("key", "still"), _real_stills())
def test_real_still_keys_out_its_painted_border(tmp_path: Path, key: str, still: Path) -> None:
    """`cutout --key <key>` on a model still: the flat border colour is gone, untinted subject untouched."""
    from sprite_gen._deps import np
    from sprite_gen.frames.extract import _key_channel_split, _key_tint_field
    from sprite_gen.frames.cutout import KEY_TARGETS

    source = Image.open(still).convert("RGBA")
    data = np.array(source).astype(np.int32)
    rgb, alpha = data[..., :3], data[..., 3]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    painted = np.median(border, axis=0)
    dist = np.sqrt(((rgb - painted) ** 2).sum(axis=-1))
    background = (alpha != 0) & (dist <= 48)  # the painted key and its near-flat neighbours
    # The engine's own `_SUBJECT` class: not key-tinted (below fringe_delta) — never touched.
    tint = _key_tint_field(rgb, *_key_channel_split(KEY_TARGETS[key]))
    subject = (alpha != 0) & (dist > 140) & (tint < _EXTRACT_FRINGE_DELTA)

    stats = cutout(still, tmp_path / "out.png", key=key)
    out = np.array(Image.open(tmp_path / "out.png").convert("RGBA")).astype(np.int32)

    assert stats["route"] == f"extract:{key}"
    painted_to_key = float(np.sqrt(((painted - np.array(stats["chroma_key"])) ** 2).sum()))
    assert stats["chroma_key_painted"] != stats["chroma_key"] or painted_to_key <= 16, (
        f"the painted border {tuple(int(v) for v in painted)} was not detected as the key (fell back to the declared key)"
    )
    residual = int((background & (out[..., 3] != 0)).sum())
    assert residual == 0, f"{residual} px of the painted background {tuple(int(v) for v in painted)} survived"
    assert (out[subject] == data[subject]).all(), "untinted subject pixels must stay byte-identical"
