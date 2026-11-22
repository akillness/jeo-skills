"""Synthetic regressions for the edge decontamination pass (`decontam: "palette"`, and
`auto`, the default of `video-frames` and `video-set`).

Every scene here is drawn at 4x and box-downsampled, so each pixel's true coverage
and true colour are known exactly, then composited on a painted key. Red hair
strands are the case the pass exists for: their blends with green read as barely
key-tinted to the engine's tint axis, stay opaque, and come out olive or orange.
"""
from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

from sprite_gen.frames import decontam
from sprite_gen.frames.cutout import cutout
from sprite_gen.frames.extract import (_key_channel_split, _key_excess_field, detect_background_key_rgb, hard_key_mask,
                                       remove_chroma_background)
from sprite_gen.video import frames as frames_mod

SS = 4
GREEN_PAINTED = (18, 232, 26)
MAGENTA_PAINTED = (232, 20, 226)
HAIR = (200, 34, 44)
LINEART = (92, 14, 24)
HIGHLIGHT = (245, 118, 118)
CLOTH = (236, 234, 230)
GEM = (30, 110, 40)  # key-hued, yet farther than the hard cut from the painted key
PROP = (30, 112, 46)  # a small key-hued part on the subject's edge: a charm, a ribbon
KEY_ARGS = (96.0, 180.0, 18.0)  # the extract CLI's key / fringe thresholds
PROP_BOX = (62, 24, 76, 36)  # x0, y0, x1, y1: on the hair block's top edge, half out on the key


def _render(size=(176, 144), *, subject=HAIR, lineart=LINEART, highlight=HIGHLIGHT, strands=True, gem=False,
            blue_dot=False, shift=0.0, widths=None, prop=False):
    """(F, A): true colour and coverage of a hair block, a cloth block and thin strands.

    `widths` (px) gives the strands their widths in turn; `prop` adds a small key-hued part
    on the hair's top edge, a charm with a ribbon blowing off it, away from the strands."""
    w, h = size
    layers = []  # (mask at SS, colour)

    def canvas():
        return Image.new("L", (w * SS, h * SS), 0)

    def p(x, y):
        return ((x + shift) * SS, y * SS)

    m = canvas(); ImageDraw.Draw(m).rectangle([*p(40, 30), *p(100, 110)], fill=255)
    layers.append((m, subject))
    m = canvas(); draw = ImageDraw.Draw(m)
    draw.rectangle([*p(40, 30), *p(100, 110)], outline=255, width=int(1.5 * SS))
    for x in (58, 74, 90):  # drawn art has ink inside the silhouette too
        draw.line([p(x, 44), p(x - 6, 100)], fill=255, width=int(1.5 * SS))
    layers.append((m, lineart))
    m = canvas(); ImageDraw.Draw(m).rectangle([*p(108, 60), *p(150, 120)], fill=255)
    layers.append((m, CLOTH))
    if gem:
        m = canvas(); ImageDraw.Draw(m).rectangle([*p(56, 50), *p(84, 90)], fill=255)
        layers.append((m, GEM))
    if strands:
        for i in range(9):
            a = math.radians(200 + i * 14)
            x0, y0 = 40, 45 + i * 7
            pts = [p(x0 + math.cos(a) * r * 0.9, y0 + math.sin(a) * r * 0.5 + (r / 30) ** 2) for r in range(0, 38, 2)]
            width = (0.7 + 0.35 * (i % 4)) if widths is None else widths[i % len(widths)]
            m = canvas(); ImageDraw.Draw(m).line(pts, fill=255, width=max(1, int(width * SS)))
            layers.append((m, highlight if i % 4 == 3 else subject))
    if prop:
        m = canvas(); draw = ImageDraw.Draw(m)
        draw.ellipse([*p(PROP_BOX[0], PROP_BOX[1]), *p(PROP_BOX[2], PROP_BOX[3])], fill=255)
        draw.line([p(PROP_BOX[2] - 2, PROP_BOX[1] + 2), p(PROP_BOX[2] + 10, PROP_BOX[1] - 10)], fill=255, width=2 * SS)
        layers.append((m, PROP))
    if blue_dot:
        m = canvas(); ImageDraw.Draw(m).ellipse([*p(96, 67), *p(105, 76)], fill=255)
        layers.append((m, (40, 70, 230)))
    P = np.zeros((h * SS, w * SS, 3)); A = np.zeros((h * SS, w * SS))
    for mask, colour in layers:
        cov = np.asarray(mask, dtype=np.float64) / 255
        P = np.asarray(colour, np.float64) * cov[..., None] + P * (1 - cov[..., None])
        A = cov + A * (1 - cov)
    P = P.reshape(h, SS, w, SS, 3).mean((1, 3)); A = A.reshape(h, SS, w, SS).mean((1, 3))
    F = np.where(A[..., None] > 0, P / np.maximum(A, 1e-9)[..., None], 0)
    return F, A


def _composite_on(F, A, key):
    C = F * A[..., None] + np.asarray(key, np.float64) * (1 - A[..., None])
    return np.clip(np.round(C), 0, 255).astype(np.uint8)


def _subsample_420(rgb: np.ndarray) -> np.ndarray:
    """Decode-like 4:2:0: full-resolution luma, chroma averaged over 2x2 blocks (BT.601)."""
    x = rgb.astype(np.float64)
    y = x @ np.array([0.299, 0.587, 0.114])
    cb = (x[..., 2] - y) * 0.564
    cr = (x[..., 0] - y) * 0.713
    h, w = y.shape
    for c in (cb, cr):
        blk = c[: h // 2 * 2, : w // 2 * 2].reshape(h // 2, 2, w // 2, 2).mean((1, 3))
        c[: h // 2 * 2, : w // 2 * 2] = np.repeat(np.repeat(blk, 2, 0), 2, 1)
    r = y + cr / 0.713
    b = y + cb / 0.564
    g = (y - 0.299 * r - 0.114 * b) / 0.587
    return np.clip(np.round(np.stack([r, g, b], -1)), 0, 255).astype(np.uint8)


def _key(raw: np.ndarray, key=(0, 255, 0), **kwargs) -> tuple[np.ndarray, dict]:
    stats: dict = {}
    image = Image.fromarray(raw, "RGB")
    out = remove_chroma_background(image, key, *KEY_ARGS, decontam_stats=stats, **kwargs)
    return np.array(out), stats


def _hard_cut(raw: np.ndarray, key=(0, 255, 0)) -> np.ndarray:
    """The engine's hard-cut background of a raw frame: what the matte keys outright."""
    painted = detect_background_key_rgb(Image.fromarray(raw, "RGB").convert("RGBA"), key)
    keyed, _ = hard_key_mask(raw.astype(np.int32), np.full(raw.shape[:2], 255), key, painted, KEY_ARGS[0])
    return keyed


def _edge(raw: np.ndarray, key=(0, 255, 0)) -> tuple[np.ndarray, np.ndarray]:
    """(edge, interior): the pass's band+flank region and what lies deeper."""
    keyed = _hard_cut(raw, key)
    depth = decontam._ring_depth(keyed, decontam.BAND_PX)
    flank = keyed & (decontam._ring_depth(~keyed, decontam.FLANK_PX) <= decontam.FLANK_PX)
    band = ~keyed & (depth <= decontam.BAND_PX)
    return band | flank, ~keyed & ~band


def _lab(rgb):
    c = np.clip(np.asarray(rgb, np.float64) / 255, 0, 1)
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = lin @ np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750],
                          [0.0193339, 0.1191920, 0.9503041]]).T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def _toward_key(out, F, A, edge, key_rgb=(0, 255, 0), degrees=12.0, ab=8.0):
    """Share of edge pixels covered in both output and truth whose colour turned toward the key.

    Coloured truth: hue rotated `degrees` or more in the direction of the key's hue (for a red
    strand under green, orange, gold, olive and green all lie that way: the green residue and
    the despill warm drift). Near-grey truth: a*/b* moved the key's way by `ab`. A darker or
    paler colour of the same hue is not contamination and does not count.
    """
    cov = edge & (out[..., 3] >= 26) & (A >= 0.1)
    lo, lt, lk = _lab(out[..., :3][cov]), _lab(F[cov]), _lab(np.array(key_rgb))
    hue = lambda lab: np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360
    ho, ht, hk = hue(lo), hue(lt), float(hue(lk))
    towards = np.sign(((hk - ht + 180) % 360) - 180)
    rotation = (((ho - ht + 180) % 360) - 180) * towards
    coloured = np.hypot(lt[:, 1], lt[:, 2]) >= 12
    grey_shift = ((lo[:, 1] - lt[:, 1]) * np.sign(lk[1]) > ab) | ((lo[:, 2] - lt[:, 2]) * np.sign(lk[2]) > ab)
    return float(((coloured & (rotation >= degrees)) | (~coloured & grey_shift)).mean())


def _halo(out, F, A, edge):
    """Mean absolute composite error against the truth on black and on white, edge pixels."""
    a = out[..., 3:4] / 255.0
    errors = []
    for bg in (0.0, 255.0):
        got = out[..., :3] * a + bg * (1 - a)
        want = F * A[..., None] + bg * (1 - A[..., None])
        errors.append(float(np.abs(got - want)[edge].mean()))
    return errors


def _recall(out, A, edge):
    strand = edge & (A >= 0.1)
    return float((out[..., 3][strand] >= 26).mean())


# --------------------------------------------------------------------------- default path

def test_off_is_the_engine_byte_for_byte():
    F, A = _render()
    raw = _composite_on(F, A, GREEN_PAINTED)
    default = np.array(remove_chroma_background(Image.fromarray(raw), (0, 255, 0), *KEY_ARGS))
    off, stats = _key(raw, decontam="off")
    assert np.array_equal(default, off)
    assert stats == {}


def test_cutout_default_is_off_and_auto_runs_where_it_applies(tmp_path: Path):
    F, A = _render()
    src = tmp_path / "raw.png"
    raw = _composite_on(F, A, GREEN_PAINTED)
    Image.fromarray(raw).save(src)
    default = cutout(src, tmp_path / "default.png", key="green")
    auto = cutout(src, tmp_path / "auto.png", key="green", decontam="auto")
    palette = cutout(src, tmp_path / "palette.png", key="green", decontam="palette")
    assert "decontam" not in default
    engine = np.array(remove_chroma_background(Image.fromarray(raw), (0, 255, 0), *KEY_ARGS))
    assert np.array_equal(np.array(Image.open(tmp_path / "default.png")), engine)
    assert auto["decontam"]["mode"] == "auto" and auto["decontam"]["applied"] is True
    assert np.array_equal(np.array(Image.open(tmp_path / "auto.png")), np.array(Image.open(tmp_path / "palette.png")))
    assert palette["decontam"]["mode"] == "palette"


def test_auto_reports_why_it_did_not_run(tmp_path: Path):
    # the white matte has no key colour to remove
    img = Image.new("RGB", (64, 64), (250, 250, 248))
    ImageDraw.Draw(img).ellipse([16, 16, 48, 48], fill=(200, 40, 40))
    img.save(tmp_path / "white.png")
    stats = cutout(tmp_path / "white.png", tmp_path / "white-out.png", key="auto", decontam="auto")
    assert stats["route"] == "matte" and stats["decontam"] == {
        "mode": "auto", "applied": False, "reason": "the white matte has no key colour to remove"}
    # a subject with no interior to learn from: auto keys it as before and says why
    bar = np.full((80, 160, 3), GREEN_PAINTED, np.uint8)
    bar[38:41, 20:140] = HAIR
    Image.fromarray(bar).save(tmp_path / "bar.png")
    auto = cutout(tmp_path / "bar.png", tmp_path / "bar-auto.png", key="green", decontam="auto")
    cutout(tmp_path / "bar.png", tmp_path / "bar-off.png", key="green")
    assert auto["decontam"]["applied"] is False and "deeper than" in auto["decontam"]["reason"]
    assert np.array_equal(np.array(Image.open(tmp_path / "bar-auto.png")), np.array(Image.open(tmp_path / "bar-off.png")))
    with pytest.raises(SystemExit, match="no subject pixel lies deeper"):
        cutout(tmp_path / "bar.png", tmp_path / "bar-palette.png", key="green", decontam="palette")


# --------------------------------------------------------------------------- what the pass is for

@pytest.mark.parametrize("video", [False, True], ids=["still", "4:2:0"])
def test_palette_halves_key_contamination_without_growing_halo_or_losing_strands(video):
    F, A = _render()
    raw = _composite_on(F, A, GREEN_PAINTED)
    if video:
        raw = _subsample_420(raw)
    edge, _ = _edge(raw)
    off, _ = _key(raw)
    pal, stats = _key(raw, decontam="palette", decontam_fit="video" if video else "still")
    assert stats["palette_keyfree"] is True and stats["changed_px"] > 0
    before, after = _toward_key(off, F, A, edge), _toward_key(pal, F, A, edge)
    assert before > 0.02  # the engine leaves red strand edges olive/orange
    assert after <= 0.5 * before
    halo_off, halo_pal = _halo(off, F, A, edge), _halo(pal, F, A, edge)
    assert halo_pal[0] <= halo_off[0] and halo_pal[1] <= halo_off[1]
    assert _recall(pal, A, edge) >= _recall(off, A, edge) - 0.05


def test_red_strand_blend_comes_back_red_with_partial_coverage():
    """One pixel, the textbook case: 70 % red hair over the painted key."""
    F, A = _render()
    raw = _composite_on(F, A, GREEN_PAINTED)
    blend = np.round(0.7 * np.array(HAIR) + 0.3 * np.array(GREEN_PAINTED)).astype(np.uint8)
    raw[10:14, 10:14] = GREEN_PAINTED
    raw[12, 12] = blend  # an isolated strand pixel beside the key, next to nothing else
    raw[12, 13] = blend
    off, _ = _key(raw)
    pal, _ = _key(raw, decontam="palette")
    r, g, b, a = (int(v) for v in pal[12, 12])
    assert g < 0.35 * r and b < 0.4 * r  # red, not olive
    assert 140 <= a <= 220  # partial coverage, near the true 0.7
    ro, go, bo, _ = (int(v) for v in off[12, 12])
    assert go > 0.35 * ro  # the engine's result is not red


def test_same_input_same_bytes():
    F, A = _render()
    raw = _subsample_420(_composite_on(F, A, GREEN_PAINTED))
    first, s1 = _key(raw, decontam="palette", decontam_fit="video")
    second, s2 = _key(raw, decontam="palette", decontam_fit="video")
    assert np.array_equal(first, second) and s1 == s2


def test_magenta_key_is_handled_by_the_same_pass():
    # a teal subject, the kind a magenta key is chosen for (red would be magenta-adjacent)
    F, A = _render(subject=(30, 150, 140), lineart=(12, 52, 60), highlight=(150, 235, 225))
    raw = _composite_on(F, A, MAGENTA_PAINTED)
    edge, _ = _edge(raw, (255, 0, 255))
    off, _ = _key(raw, (255, 0, 255))
    pal, stats = _key(raw, (255, 0, 255), decontam="palette")
    assert stats["palette_keyfree"] is True
    before = _toward_key(off, F, A, edge, key_rgb=(255, 0, 255))
    after = _toward_key(pal, F, A, edge, key_rgb=(255, 0, 255))
    assert before > 0.02 and after <= 0.5 * before


# Grok's "magenta" comes back darker and bluer than the painted key (the values measured in
# test_chroma_key_relative). Warm colours carry no magenta hue of their own (min(R, B) - G < 0).
GROK_MAGENTA = (216, 46, 147)


def test_key_hue_cap_touches_only_key_hued_colours():
    colours = np.array([[110, 70, 50], [40, 70, 230], [232, 180, 150], [200, 40, 30],  # no magenta hue
                        [210, 60, 120], [190, 150, 190], [60, 200, 70], [30, 110, 40]], np.float64)
    green = decontam._cap_key_hue(colours, [1], [0, 2], 8.0)
    classic = colours.copy()
    classic[:, 1] = np.minimum(colours[:, 1], colours[:, [0, 2]].max(1) + 8)  # G <= max(R, B) + 8
    assert np.array_equal(green, classic)
    magenta = decontam._cap_key_hue(colours, [0, 2], [1], 8.0)
    assert np.array_equal(magenta[:4], colours[:4])  # warm, blue, skin and red are not magenta
    assert magenta[4].tolist() == [158, 60, 68]  # a red with a magenta cast stays red
    assert magenta[5].tolist() == [158, 150, 158]  # a grey with a magenta cast comes back grey
    assert np.array_equal(magenta[6:], colours[6:]) and (magenta <= colours).all()


@pytest.mark.parametrize("painted", [MAGENTA_PAINTED, GROK_MAGENTA], ids=["painted", "grok"])
def test_magenta_key_leaves_an_opaque_warm_subject_alone(painted):
    """A hard-edged brown square: nothing on its edge is a blend, so nothing may change."""
    raw = np.full((128, 128, 3), painted, np.uint8)
    raw[32:96, 32:96] = (110, 70, 50)
    raw[56:72, 56:72] = (230, 210, 190)
    off, _ = _key(raw, (255, 0, 255))
    pal, stats = _key(raw, (255, 0, 255), decontam="palette")
    assert stats["palette_keyfree"] is True
    assert [110, 70, 50] in stats["palette"] and [230, 210, 190] in stats["palette"]
    assert np.array_equal(pal, off)


@pytest.mark.parametrize("video", [False, True], ids=["still", "4:2:0"])
def test_magenta_key_keeps_a_skin_tone_and_cleans_its_edge(video):
    F, A = _render(subject=(232, 180, 150), lineart=(90, 50, 40), highlight=(250, 215, 195))
    raw = _composite_on(F, A, GROK_MAGENTA)
    if video:
        raw = _subsample_420(raw)
    edge, interior = _edge(raw, (255, 0, 255))
    off, _ = _key(raw, (255, 0, 255))
    pal, stats = _key(raw, (255, 0, 255), decontam="palette", decontam_fit="video" if video else "still")
    assert any(r > g + 40 for r, g, _b in stats["palette"])  # the skin tone is learned, not greyed toward G + 8
    if video:
        # The video fit gives the keyed flank nothing (in a decoded frame its faint coverage is the codec's blur),
        # and on this frame the flank's coverage is all that keeps half the halo: the band gets cleaner, the flank
        # stays as the matte keyed it.
        keyed = _hard_cut(raw, (255, 0, 255))
        band = edge & ~keyed
        halo_off, halo_pal = _halo(off, F, A, band), _halo(pal, F, A, band)
        assert halo_pal[0] <= 0.9 * halo_off[0] and halo_pal[1] <= 0.9 * halo_off[1]
        assert np.array_equal(off[keyed], pal[keyed])
    else:
        halo_off, halo_pal = _halo(off, F, A, edge), _halo(pal, F, A, edge)
        assert halo_pal[0] <= 0.5 * halo_off[0] and halo_pal[1] <= 0.5 * halo_off[1]
    assert _recall(pal, A, edge) >= _recall(off, A, edge)
    assert np.array_equal(off[interior], pal[interior])


# --------------------------------------------------------------------------- guards

def test_subject_that_owns_key_material_keeps_it():
    F, A = _render(gem=True)
    raw = _composite_on(F, A, GREEN_PAINTED)
    pal, stats = _key(raw, decontam="palette")
    assert stats["palette_keyfree"] is False
    assert stats["key_material_share"] > decontam.KEY_MATERIAL_MAX_SHARE
    gem = pal[62:78, 62:78]
    assert (gem[..., 1] > gem[..., 0] + 60).all()  # the green gem is still green


def test_a_colour_the_palette_never_saw_keeps_the_engine_bytes():
    F, A = _render(blue_dot=True)
    raw = _composite_on(F, A, GREEN_PAINTED)
    off, _ = _key(raw)
    pal, stats = _key(raw, decontam="palette")
    dot = (slice(70, 73), slice(99, 102))
    assert np.array_equal(off[dot], pal[dot])
    assert (pal[dot][..., 2] > pal[dot][..., 0] + 60).all()  # still blue


def test_degenerate_key_fails_loud():
    F, A = _render()
    raw = _composite_on(F, A, (128, 128, 128))
    with pytest.raises(SystemExit, match="no key hue"):
        _key(raw, (128, 128, 128), decontam="palette")


def test_unknown_mode_and_fit_fail_loud():
    raw = _composite_on(*_render(), GREEN_PAINTED)
    with pytest.raises(SystemExit, match="unknown mode"):
        _key(raw, decontam="restore")
    with pytest.raises(SystemExit, match="unknown fit"):
        _key(raw, decontam="palette", decontam_fit="film")


def test_white_matte_refuses_decontam(tmp_path: Path):
    img = Image.new("RGB", (64, 64), (250, 250, 248))
    ImageDraw.Draw(img).ellipse([16, 16, 48, 48], fill=(200, 40, 40))
    img.save(tmp_path / "white.png")
    with pytest.raises(SystemExit, match="needs a chroma key background"):
        cutout(tmp_path / "white.png", tmp_path / "out.png", key="auto", decontam="palette")


# --------------------------------------------------------------------------- entry points

def test_cutout_reports_what_the_pass_did(tmp_path: Path):
    F, A = _render()
    src = tmp_path / "raw.png"
    Image.fromarray(_composite_on(F, A, GREEN_PAINTED)).save(src)
    stats = cutout(src, tmp_path / "out.png", key="green", decontam="palette")
    done = stats["decontam"]
    assert done["mode"] == "palette" and done["fit"] == "still" and done["palette_source"] == "frame"
    assert done["changed_px"] > 0 and len(done["palette"]) == done["palette_size"]
    json.dumps(stats)  # the report is plain JSON


def test_video_frames_learn_one_palette_per_clip(tmp_path: Path):
    raws = []
    for t in range(3):
        F, A = _render(shift=0.4 * t)
        path = tmp_path / f"frame-{t + 1:04d}.png"
        Image.fromarray(_subsample_420(_composite_on(F, A, GREEN_PAINTED))).save(path)
        raws.append(path)
    report = frames_mod.key_frames(raws, tmp_path / "keyed", key="green", check_edges=False, spill="full",
                                   decontam="palette")
    done = report["decontam"]
    assert done["mode"] == "palette" and done["fit"] == frames_mod.DECONTAM_FIT
    assert done["palette_source"] == "clip (learned on frame-0001.png)"
    assert all("decontam" in row for row in report["rows"])
    assert done["totals"]["changed_px"] == sum(row["decontam"]["changed_px"] for row in report["rows"])
    off = frames_mod.key_frames(raws, tmp_path / "plain", key="green", check_edges=False, spill="full",
                                decontam="off")
    assert off["decontam"] == {"mode": "off", "applied_frames": 0}
    assert done["applied_frames"] == len(raws)
    assert all("decontam" not in row for row in off["rows"])


def _head_under_the_top_edge(t: int) -> np.ndarray:
    """A decoded frame of a dark head whose matte edge sits 6 px under the top of the frame.

    Above it the head's blur runs on into the key as a decoded clip shows it: coverage
    0.3, 0.15, 0.08, 0.03 on rows 5 to 2, which the hard cut keys, and rows 0 to 1 are key.
    """
    F = np.zeros((96, 96, 3))
    A = np.zeros((96, 96))
    F[6:90, 30 + t:66 + t] = (60, 62, 66)
    F[40:70, 40 + t:56 + t] = (150, 148, 152)  # a lighter patch, so the palette has two colours
    A[6:90, 30 + t:66 + t] = 1.0
    for row, coverage in ((5, 0.3), (4, 0.15), (3, 0.08), (2, 0.03)):
        F[row, 30 + t:66 + t] = (60, 62, 66)
        A[row, 30 + t:66 + t] = coverage
    return _subsample_420(_composite_on(F, A, GREEN_PAINTED))


def test_video_frames_keep_the_frame_edge_as_the_matte_left_it(tmp_path: Path):
    """A clip that passes the edge gate with decontam off passes it with decontam on.

    Each blur row above the head fits a faint blend. Rows 3 to 5 lie within the flank,
    and row 3 inside the gate's edge band too: recovering it put the subject's grey on
    the frame edge, and the gate read it as the key surviving the matte. The video fit
    gives the keyed flank no coverage at all now, so every blur row stays keyed.
    """
    raws = []
    for t in range(2):
        path = tmp_path / f"frame-{t + 1:04d}.png"
        Image.fromarray(_head_under_the_top_edge(t)).save(path)
        raws.append(path)
    off = frames_mod.key_frames(raws, tmp_path / "plain", key="green", spill="full", decontam="off")
    on = frames_mod.key_frames(raws, tmp_path / "keyed", key="green", spill="full", decontam="palette")
    assert off["edge_contacts"] == on["edge_contacts"] == []
    assert on["decontam"]["applied_frames"] == 2 and on["decontam"]["edge_band"] == frames_mod.EDGE_ROWS
    band = np.zeros((96, 96), dtype=bool)
    band[:frames_mod.EDGE_ROWS] = band[:, :frames_mod.EDGE_ROWS] = band[:, -frames_mod.EDGE_ROWS:] = True
    for raw in raws:
        plain = np.array(Image.open(tmp_path / "plain" / raw.name))[..., 3]
        keyed = np.array(Image.open(tmp_path / "keyed" / raw.name))[..., 3]
        assert not keyed[band & (plain == 0)].any()
        # nor below it: the blur rows under the edge band stay as the matte keyed them
        assert not keyed[2:6][plain[2:6] == 0].any()
    assert on["decontam"]["totals"]["recovered_px"] == 0


def test_video_frames_rejects_an_unknown_mode(tmp_path: Path):
    with pytest.raises(SystemExit, match="unknown --decontam"):
        frames_mod.run_frames(tmp_path / "missing.mp4", tmp_path / "out", key="green", allow_edge_contact=True,
                              report_path=None, spill="small", decontam="restore")


def test_row_extractor_reads_and_records_chroma_decontam(fixture_run_dir: Path):
    from conftest import run_script

    request_path = fixture_run_dir / "sprite-request.json"
    plain = run_script("extract_sprite_row_frames.py", "--run-dir", str(fixture_run_dir))
    assert plain.returncode == 0, plain.stderr
    chroma = json.loads(request_path.read_text())["chroma"]
    assert "decontam" not in chroma
    assert chroma["mode"] == "rgb"
    frames_off = {p.name: p.read_bytes() for p in sorted((fixture_run_dir / "frames").rglob("frame-*.png"))}

    with_flag = run_script("extract_sprite_row_frames.py", "--run-dir", str(fixture_run_dir), "--decontam", "palette")
    assert with_flag.returncode == 0, with_flag.stderr
    request = json.loads(request_path.read_text())
    assert request["chroma"]["decontam"] == "palette"
    frames_on = {p.name: p.read_bytes() for p in sorted((fixture_run_dir / "frames").rglob("frame-*.png"))}
    assert frames_on.keys() == frames_off.keys()


def test_cli_exposes_the_flag_on_every_entry_point():
    from sprite_gen import cli

    parser = cli._build_parser()
    for argv in (["cutout", "x.png", "--decontam", "palette"],
                 ["gen", "--out", "x.png", "--transparent", "--decontam", "palette"],
                 ["video-frames", "--clip", "c.mp4", "--out-dir", "o", "--decontam", "palette"],
                 ["video-set", "--out-dir", "o", "--decontam", "palette"],
                 ["extract", "--run-dir", "r", "--decontam", "palette"],
                 ["inspect", "--run-dir", "r", "--decontam", "palette"]):
        assert parser.parse_args(argv).decontam == "palette"


def _choices_of(flag: str) -> dict[str, object]:
    """`flag`'s choices on every verb and module parser that has it, by parser name."""
    import argparse

    from sprite_gen import cli
    from sprite_gen.frames import extract
    from sprite_gen.qa import inspect

    verbs = next(a for a in cli._build_parser()._actions if isinstance(a, argparse._SubParsersAction)).choices
    parsers = {**verbs, "frames.extract module": extract._build_parser(), "qa.inspect module": inspect._build_parser()}
    return {name: action.choices for name, parser in parsers.items()
            for action in parser._actions if flag in action.option_strings}


def test_every_decontam_flag_reads_the_one_declaration():
    """Every `--decontam` takes its choices from the one tuple, and the names other modules read it by are that tuple."""
    from sprite_gen.frames import extract

    readers = _choices_of("--decontam")
    assert [name for name, choices in readers.items() if choices is not decontam.DECONTAM_MODES] == [], sorted(readers)
    assert decontam.DECONTAM_MODES is extract.DECONTAM_MODES and frames_mod.DECONTAM_MODES is extract.DECONTAM_MODES


def test_every_chroma_mode_flag_reads_the_one_declaration():
    from sprite_gen.frames import extract

    readers = _choices_of("--chroma-mode")
    assert [name for name, choices in readers.items() if choices is not extract.CHROMA_MODES] == [], sorted(readers)


# --------------------------------------------------------------------------- gen (YCbCr matte)

class _FakeKeyProvider:
    """Paints the hair scene on a green key, the way a chroma-strategy provider returns it."""

    name = "fake"

    def __init__(self, transparency: str) -> None:
        self.transparency = transparency
        self.calls = 0

    def generate(self, request, workdir):
        from sprite_gen.gen import base as gen_base

        self.calls += 1
        F, A = _render()
        Image.fromarray(_composite_on(F, A, GREEN_PAINTED)).save(request.raw)
        return gen_base.ProviderRun(provider=self.name, elapsed_seconds=0.1, model=request.model)


def _gen(tmp_path: Path, monkeypatch, provider, **overrides) -> int:
    from sprite_gen import gen

    monkeypatch.setattr(gen, "_make_provider", lambda name, *, keep_session: provider)
    kwargs = dict(provider="fake", prompt="a red-haired girl", out=tmp_path / "girl.png", ref=[], model=None,
                  aspect_ratio=None, transparent=True, alpha_mode="auto", chroma_key="green", white_check=None,
                  keep_session=False, report=tmp_path / "girl.json", prompt_file=None, workdir=None)
    kwargs.update(overrides)
    return gen.run(**kwargs)


def test_gen_decontam_runs_after_the_ycbcr_matte_and_reports(tmp_path: Path, monkeypatch):
    from sprite_gen.gen import base as gen_base

    provider = _FakeKeyProvider(gen_base.TRANSPARENCY_CHROMA)
    # the default publishes the matte as it is; auto adds the pass
    assert _gen(tmp_path, monkeypatch, provider, out=tmp_path / "off.png", report=tmp_path / "off.json") == 0
    assert _gen(tmp_path, monkeypatch, provider, decontam="auto") == 0
    off = json.loads((tmp_path / "off.json").read_text())
    on = json.loads((tmp_path / "girl.json").read_text())
    assert "decontam" not in off["chroma"]
    assert on["chroma"]["decontam"]["mode"] == "auto" and on["chroma"]["decontam"]["changed_px"] > 0
    raw = np.array(Image.open(tmp_path / "girl.png.raw.png").convert("RGB"))
    _, interior = _edge(raw)
    before, after = np.array(Image.open(tmp_path / "off.png")), np.array(Image.open(tmp_path / "girl.png"))
    assert np.array_equal(before[interior], after[interior])
    F, A = _render()
    edge, _ = _edge(raw)
    assert _toward_key(after, F, A, edge) <= 0.5 * _toward_key(before, F, A, edge)


def test_gen_decontam_refuses_native_alpha_before_generating(tmp_path: Path, monkeypatch):
    from sprite_gen.gen import base as gen_base

    provider = _FakeKeyProvider(gen_base.TRANSPARENCY_NATIVE)
    with pytest.raises(SystemExit, match="removes a chroma key"):
        _gen(tmp_path, monkeypatch, provider, decontam="palette")
    assert provider.calls == 0  # refused before a paid generation


def test_gen_decontam_needs_a_transparent_image(tmp_path: Path, monkeypatch):
    from sprite_gen.gen import base as gen_base

    provider = _FakeKeyProvider(gen_base.TRANSPARENCY_CHROMA)
    with pytest.raises(SystemExit, match="add --transparent"):
        _gen(tmp_path, monkeypatch, provider, transparent=False, decontam="palette")
    assert provider.calls == 0


def test_gen_auto_leaves_native_alpha_and_opaque_images_alone(tmp_path: Path, monkeypatch):
    from sprite_gen.gen import base as gen_base

    class _Native(_FakeKeyProvider):
        def generate(self, request, workdir):
            self.calls += 1
            image = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
            for y in range(2, 6):
                for x in range(2, 6):
                    image.putpixel((x, y), (200, 90, 20, 255))
            image.save(request.raw)
            return gen_base.ProviderRun(provider=self.name, elapsed_seconds=0.1, model=request.model)

    native = _Native(gen_base.TRANSPARENCY_NATIVE)
    assert _gen(tmp_path, monkeypatch, native, out=tmp_path / "native.png", report=tmp_path / "native.json",
                decontam="auto") == 0
    payload = json.loads((tmp_path / "native.json").read_text())
    assert payload["alpha"]["strategy"] == "native" and payload["chroma"] is None
    opaque = _FakeKeyProvider(gen_base.TRANSPARENCY_CHROMA)
    assert _gen(tmp_path, monkeypatch, opaque, transparent=False, out=tmp_path / "opaque.png",
                report=tmp_path / "opaque.json", decontam="auto") == 0
    assert opaque.calls == 1 and json.loads((tmp_path / "opaque.json").read_text())["chroma"] is None


# --------------------------------------------------------------------------- video-frames default (auto)

STRANDS_1_TO_3 = (1.0, 1.5, 2.0, 3.0)  # px: the strand widths a 4:2:0 decode blends with the key


def _alpha_error(out, A, edge):
    return float(np.abs(out[..., 3] / 255.0 - A)[edge].mean())


def _key_part_lost(out, F, A, edge, key_rgb=(0, 255, 0)):
    """Share of the edge's key-hued truth (a green part's rim) that lost half its key hue or coverage."""
    keyed_channels, unkeyed_channels = _key_channel_split(key_rgb)
    truth = _key_excess_field(F, keyed_channels, unkeyed_channels)
    got = _key_excess_field(out[..., :3].astype(np.float64), keyed_channels, unkeyed_channels)
    part = edge & (A >= 0.1) & (truth > 8)
    lost = part & ((got < 0.5 * truth) | (out[..., 3] / 255.0 < 0.5 * A))
    return float(lost.sum() / max(1, part.sum()))


def _clip(tmp_path: Path, painted, frames=3, **render):
    """A decoded clip: (raw frame files, [(F, A, raw)]) of the scene moving a fraction of a pixel a frame."""
    files, truth = [], []
    for t in range(frames):
        F, A = _render(shift=0.4 * t, **render)
        raw = _subsample_420(_composite_on(F, A, painted))
        path = tmp_path / f"frame-{t + 1:04d}.png"
        Image.fromarray(raw).save(path)
        files.append(path)
        truth.append((F, A, raw))
    return files, truth


def _keyed(directory: Path, path: Path) -> np.ndarray:
    return np.array(Image.open(directory / path.name).convert("RGBA"))


def _mean(metric, directory, files, truth, key=(0, 255, 0)):
    return float(np.mean([metric(_keyed(directory, f), F, A, _edge(raw, key)[0])
                          for f, (F, A, raw) in zip(files, truth)]))


def test_video_frames_and_video_set_default_to_auto():
    import inspect

    from sprite_gen import cli
    from sprite_gen.video import batch

    parser = cli._build_parser()
    assert parser.parse_args(["video-frames", "--clip", "c.mp4", "--out-dir", "o"]).decontam == "auto"
    assert parser.parse_args(["video-set", "--out-dir", "o"]).decontam == "auto"
    for function in (frames_mod.key_frames, frames_mod.run_frames, batch.run_item, batch.run_set):
        assert inspect.signature(function).parameters["decontam"].default == "auto", function.__name__
    # the row extractor and the still verbs keep the matte as it is unless asked
    for argv in (["cutout", "x.png"], ["gen", "--out", "x.png", "--transparent"], ["extract", "--run-dir", "r"]):
        assert parser.parse_args(argv).decontam in (None, "off"), argv


def test_video_frames_off_is_the_engine_byte_for_byte(tmp_path: Path):
    files, _ = _clip(tmp_path, GREEN_PAINTED, frames=2, widths=STRANDS_1_TO_3)
    off = frames_mod.key_frames(files, tmp_path / "off", key="green", decontam="off")
    assert off["decontam"] == {"mode": "off", "applied_frames": 0}
    for path in files:
        cutout(path, tmp_path / f"engine-{path.name}", key="green")
        engine, _ = frames_mod.drop_specks(Image.open(tmp_path / f"engine-{path.name}").convert("RGBA"))
        assert np.array_equal(_keyed(tmp_path / "off", path), np.array(engine))


def test_video_set_hands_its_decontam_to_video_frames_and_lists_the_warning(tmp_path: Path, monkeypatch):
    from sprite_gen.video import batch

    seen = []

    def frames_stub(clip, out, **kw):
        seen.append(kw.get("decontam", "<left out>"))
        return {"fps": 24, "frames": 10, "alpha_zero_pct_min": 50, "alpha_zero_pct_max": 60, "keyed_dir": str(out),
                "decontam": {"mode": kw.get("decontam"), "applied_frames": 0, "reason": "a reason"}}

    def video(image, prompt, out, report, **kw):
        out.write_bytes(b"test-video")
        report.write_text(json.dumps({"prompt": prompt}))
        return 0

    monkeypatch.setattr(batch.facing_mod.vision, "grok_inspect", lambda *a, **kw: ("left", {}))
    monkeypatch.setattr(batch.frames_mod, "run_frames", frames_stub)
    monkeypatch.setattr(batch.loop_mod, "run_loop", lambda *a, **kw: {
        "cycle": {"length": 10, "period_global": 10, "ratio": 0.2},
        "resampled_seam_ratio": 0.2, "held_fill": {"cells": 10, "poses": 10, "held_runs": [], "made": [], "before": {"cells": 10, "poses": 10, "held_runs": []}}, "n_out": 10, "gif": {"file": "loop.gif"},
        "webp": {"file": "loop.webp"}, "strip": {"path": "strip.png"}})
    monkeypatch.setattr(batch, "_staggered_start", lambda gap: None)
    still = Path(__file__).parents[1] / "fixtures" / "facing" / "left.png"
    common = dict(bases={"front": still}, states=["attack"], character=None, duration=3, resolution="720p",
                  key="green", concurrency=1, force=False, gap=0, video_runner=video)
    default = batch.run_set(root=tmp_path / "default", **common)
    off = batch.run_set(root=tmp_path / "off", decontam="off", **common)
    assert seen == ["auto", "off"]
    assert default["warnings"] == ["front-attack: decontam auto did not run (a reason): the frames are the matte's, "
                                   "the same as --decontam off"]
    assert off["warnings"] == []


def _white_clip(tmp_path: Path) -> list[Path]:
    files = []
    for t in range(2):
        image = Image.new("RGB", (96, 96), (250, 250, 248))
        ImageDraw.Draw(image).ellipse([24 + t, 24, 72 + t, 80], fill=(200, 40, 40))
        image.save(tmp_path / f"frame-{t + 1:04d}.png")
        files.append(tmp_path / f"frame-{t + 1:04d}.png")
    return files


def _thin_clip(tmp_path: Path) -> list[Path]:
    files = []
    for t in range(2):
        bar = np.full((80, 160, 3), GREEN_PAINTED, np.uint8)
        bar[38 + t:41 + t, 20:140] = HAIR
        Image.fromarray(bar).save(tmp_path / f"frame-{t + 1:04d}.png")
        files.append(tmp_path / f"frame-{t + 1:04d}.png")
    return files


@pytest.mark.parametrize("scene,reason", [(_white_clip, "the white matte has no key colour to remove"),
                                          (_thin_clip, "deeper than")], ids=["white-key", "no-interior"])
def test_video_frames_default_keeps_the_matte_where_the_pass_cannot_run_and_says_why(tmp_path: Path, scene, reason):
    files = scene(tmp_path)
    default = frames_mod.key_frames(files, tmp_path / "default", key="auto")
    off = frames_mod.key_frames(files, tmp_path / "off", key="auto", decontam="off")
    for path in files:
        assert np.array_equal(_keyed(tmp_path / "default", path), _keyed(tmp_path / "off", path))
    done = default["decontam"]
    assert done["mode"] == "auto" and done["applied_frames"] == 0 and reason in done["reason"]
    assert all(row["decontam"]["applied"] is False for row in default["rows"])
    warning = frames_mod.decontam_warning(done)
    assert warning.startswith("decontam auto did not run (") and reason in warning
    assert warning.endswith("the same as --decontam off")
    assert frames_mod.decontam_warning(off["decontam"]) is None


def test_video_frames_default_on_brightness_alpha_is_off_with_its_reason(tmp_path: Path):
    src = tmp_path / "frame-0001.png"
    rgb = np.zeros((16, 16, 3), dtype=np.uint8)
    rgb[4:12, 4:12] = (240, 120, 30)
    Image.fromarray(rgb).save(src)
    default = frames_mod.key_frames([src], tmp_path / "default", alpha_mode="brightness")
    off = frames_mod.key_frames([src], tmp_path / "off", alpha_mode="brightness", decontam="off")
    assert np.array_equal(_keyed(tmp_path / "default", src), _keyed(tmp_path / "off", src))
    assert default["decontam"] == {"mode": "auto", "applied_frames": 0,
                                   "reason": "brightness alpha has no key colour to remove"}
    assert frames_mod.decontam_warning(default["decontam"]) is None
    with pytest.raises(SystemExit, match="brightness alpha does not use --decontam"):
        frames_mod.key_frames([src], tmp_path / "palette", alpha_mode="brightness", decontam="palette")


def test_video_frames_default_halves_key_contamination_on_thin_red_strands(tmp_path: Path):
    """Red strands 1 to 3 px wide on green, chroma shared by each aligned 2x2 block as a decode does."""
    files, truth = _clip(tmp_path, GREEN_PAINTED, widths=STRANDS_1_TO_3)
    off = frames_mod.key_frames(files, tmp_path / "off", key="green", decontam="off")
    on = frames_mod.key_frames(files, tmp_path / "on", key="green")
    assert on["decontam"]["mode"] == "auto" and on["decontam"]["applied_frames"] == len(files)
    assert on["decontam"]["palette_keyfree"] is True and on["decontam"]["key_material_share"] == 0
    assert frames_mod.decontam_warning(on["decontam"]) is None
    before = _mean(_toward_key, tmp_path / "off", files, truth)
    after = _mean(_toward_key, tmp_path / "on", files, truth)
    assert before > 0.05 and after <= 0.5 * before
    halo = lambda out, F, A, edge: _halo(out, F, A, edge)[0]
    halo_white = lambda out, F, A, edge: _halo(out, F, A, edge)[1]
    for metric in (halo, halo_white):
        assert _mean(metric, tmp_path / "on", files, truth) <= _mean(metric, tmp_path / "off", files, truth)
    recall = lambda out, F, A, edge: _recall(out, A, edge)
    assert _mean(recall, tmp_path / "on", files, truth) >= _mean(recall, tmp_path / "off", files, truth) - 0.05


def _near_key_part(plain, raw):
    """Where the video fit's guard keeps the matte: within `KEY_PART_GUARD_PX` of the opaque, key-hued interior."""
    _edge_region, interior = _edge(raw)
    green = plain[..., 1].astype(np.int32) - np.maximum(plain[..., 0], plain[..., 2]) > decontam.KEY_HUE_TINT
    part = interior & (plain[..., 3] == 255) & green
    return part, decontam._ring_depth(part, decontam.KEY_PART_GUARD_PX) <= decontam.KEY_PART_GUARD_PX


def test_video_fit_leaves_the_rim_of_a_small_key_coloured_part_as_the_matte_keyed_it(tmp_path: Path):
    """A green charm on red hair, too small for the palette to keep: no palette colour explains its rim,
    and without the guard the rim was repainted the hair's colour."""
    files, truth = _clip(tmp_path, GREEN_PAINTED, widths=STRANDS_1_TO_3, prop=True)
    frames_mod.key_frames(files, tmp_path / "off", key="green", decontam="off")
    auto = frames_mod.key_frames(files, tmp_path / "auto", key="green", decontam="auto")
    lost_off = _mean(_key_part_lost, tmp_path / "off", files, truth)
    assert lost_off > 0.3  # the matte itself keeps less than the whole rim
    assert _mean(_key_part_lost, tmp_path / "auto", files, truth) <= lost_off + 0.1
    for path, (_F, _A, raw) in zip(files, truth):
        plain = _keyed(tmp_path / "off", path)
        part, near = _near_key_part(plain, raw)
        assert part.any() and (near & _edge(raw)[0]).any()
        assert np.array_equal(_keyed(tmp_path / "auto", path)[near], plain[near])
    done = auto["decontam"]
    assert done["palette_keyfree"] is True and 0 < done["key_material_share"] <= decontam.KEY_MATERIAL_MAX_SHARE
    assert done["totals"]["key_part_kept_px"] > 0


def test_video_frames_default_keeps_a_small_key_coloured_part_and_still_cleans_the_strands(tmp_path: Path):
    files, truth = _clip(tmp_path, GREEN_PAINTED, widths=STRANDS_1_TO_3, prop=True)
    frames_mod.key_frames(files, tmp_path / "off", key="green", decontam="off")
    on = frames_mod.key_frames(files, tmp_path / "on", key="green")
    assert on["decontam"]["mode"] == "auto" and on["decontam"]["applied_frames"] == len(files)
    assert _mean(_key_part_lost, tmp_path / "on", files, truth) <= _mean(_key_part_lost, tmp_path / "off", files, truth) + 0.1
    # away from the part and its ribbon, the strands are cleaned as on a subject without one. The ribbon's far
    # end is thin, with no key-coloured interior beside it, and is repainted (docs/chroma-alpha.md, limits)
    keyed_channels, unkeyed_channels = _key_channel_split((0, 255, 0))
    before, after = [], []
    for path, (F, A, raw) in zip(files, truth):
        plain = _keyed(tmp_path / "off", path)
        _part, near = _near_key_part(plain, raw)
        green = (_key_excess_field(F, keyed_channels, unkeyed_channels) > decontam.KEY_HUE_TINT) & (A > 0)
        elsewhere = _edge(raw)[0] & ~near & (decontam._ring_depth(green, decontam.BAND_PX) > decontam.BAND_PX)
        before.append(_toward_key(plain, F, A, elsewhere))
        after.append(_toward_key(_keyed(tmp_path / "on", path), F, A, elsewhere))
    assert np.mean(before) > 0.05 and np.mean(after) <= 0.5 * np.mean(before)
    warning = frames_mod.decontam_warning(on["decontam"])
    assert "small key-coloured parts" in warning and warning.endswith("--decontam off keeps the matte as it is")


@pytest.mark.parametrize("painted", [MAGENTA_PAINTED, GROK_MAGENTA], ids=["magenta", "grok-magenta"])
def test_video_frames_default_on_magenta_lowers_halo_and_alpha_error(tmp_path: Path, painted):
    files, truth = _clip(tmp_path, painted, widths=STRANDS_1_TO_3)
    frames_mod.key_frames(files, tmp_path / "off", key="magenta", decontam="off")
    on = frames_mod.key_frames(files, tmp_path / "on", key="magenta")
    assert on["decontam"]["applied_frames"] == len(files)
    key = (255, 0, 255)
    for index in (0, 1):
        halo = lambda out, F, A, edge: _halo(out, F, A, edge)[index]
        assert _mean(halo, tmp_path / "on", files, truth, key) <= _mean(halo, tmp_path / "off", files, truth, key)
    alpha = lambda out, F, A, edge: _alpha_error(out, A, edge)
    assert _mean(alpha, tmp_path / "on", files, truth, key) <= _mean(alpha, tmp_path / "off", files, truth, key)


def test_video_frames_default_keeps_the_frame_edge_as_the_matte_left_it(tmp_path: Path):
    """The head 6 px under the top of the frame passes the edge gate with the default as with off."""
    raws = []
    for t in range(2):
        path = tmp_path / f"frame-{t + 1:04d}.png"
        Image.fromarray(_head_under_the_top_edge(t)).save(path)
        raws.append(path)
    off = frames_mod.key_frames(raws, tmp_path / "plain", key="green", spill="full", decontam="off")
    on = frames_mod.key_frames(raws, tmp_path / "keyed", key="green", spill="full")
    assert off["edge_contacts"] == on["edge_contacts"] == []
    assert on["decontam"]["mode"] == "auto" and on["decontam"]["applied_frames"] == 2


def test_a_few_key_hued_pixels_deep_inside_raise_no_warning():
    """Codec noise can leave a few key-hued pixels inside a subject that has no key-coloured part: they guard no edge."""
    noise = {"mode": "auto", "applied_frames": 6, "palette_keyfree": True, "key_material_share": 2e-05,
             "totals": {"key_part_kept_px": 0}}
    assert frames_mod.decontam_warning(noise) is None
    assert "small key-coloured parts: 12 edge pixel(s)" in frames_mod.decontam_warning(
        noise | {"totals": {"key_part_kept_px": 12}})


def test_video_frames_prints_the_warning_line(tmp_path: Path, monkeypatch, capsys):
    files = _white_clip(tmp_path)
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"synthetic")
    monkeypatch.setattr(frames_mod, "probe", lambda _: {"stream_index": 0, "fps": 24.0, "width": 96, "height": 96,
                                                        "codec": "h264", "pix_fmt": "yuv420p", "audio_streams": 0})
    monkeypatch.setattr(frames_mod, "extract", lambda clip, raw_dir, index: files)
    assert frames_mod.run(clip=clip, out_dir=tmp_path / "out", key="auto") == 0
    err = capsys.readouterr().err.strip().splitlines()
    assert err == ["video-frames: warning: decontam auto did not run (the white matte has no key colour to remove): "
                   "the frames are the matte's, the same as --decontam off"]
    assert frames_mod.run(clip=clip, out_dir=tmp_path / "off", key="auto", decontam="off") == 0
    assert capsys.readouterr().err == ""


# --------------------------------------------------------------------------- video fit over time

def _noisy_420(rgb: np.ndarray, rng: np.random.Generator, sigma: float) -> np.ndarray:
    """`_subsample_420` with a decoder's noise on top: luma per pixel, chroma per aligned 2x2 block (BT.601)."""
    x = rgb.astype(np.float64)
    luma = x @ np.array([0.299, 0.587, 0.114])
    y = luma + rng.normal(0.0, sigma, luma.shape)
    cb = (x[..., 2] - luma) * 0.564
    cr = (x[..., 0] - luma) * 0.713
    h, w = y.shape
    for c in (cb, cr):
        blk = c[: h // 2 * 2, : w // 2 * 2].reshape(h // 2, 2, w // 2, 2).mean((1, 3))
        blk = blk + rng.normal(0.0, sigma, blk.shape)
        c[: h // 2 * 2, : w // 2 * 2] = np.repeat(np.repeat(blk, 2, 0), 2, 1)
    r = y + cr / 0.713
    b = y + cb / 0.564
    g = (y - 0.299 * r - 0.114 * b) / 0.587
    return np.clip(np.round(np.stack([r, g, b], -1)), 0, 255).astype(np.uint8)


def _still_clip(tmp_path: Path, frames=8, sigma=2.0) -> tuple[list[Path], tuple[np.ndarray, np.ndarray]]:
    """The red-strand scene standing still while a decoder's noise changes every frame: (raw frame files, (F, A))."""
    F, A = _render(widths=STRANDS_1_TO_3)
    clean = _composite_on(F, A, GREEN_PAINTED)
    files = []
    for t in range(frames):
        path = tmp_path / f"frame-{t + 1:04d}.png"
        Image.fromarray(_noisy_420(clean, np.random.default_rng(1000 + t), sigma)).save(path)
        files.append(path)
    return files, (F, A)


def _edge_change(directory: Path, files: list[Path]) -> tuple[float, float]:
    """Mean and 99th percentile of the change of each edge pixel between consecutive keyed frames, composited on a
    dark background; the edge is the pass's band and flank in either frame of the pair."""
    dark = np.array([21.0, 17.0, 29.0])
    shown, edges = [], []
    for path in files:
        out = _keyed(directory, path).astype(np.float64)
        a = out[..., 3:4] / 255.0
        shown.append(np.round(out[..., :3] * a + dark * (1 - a)))
        edges.append(_edge(np.array(Image.open(path).convert("RGB")))[0])
    change = np.abs(np.diff(np.stack(shown), axis=0)).mean(-1)
    edge = np.stack(edges)
    edge = edge[1:] | edge[:-1]
    return float(change[edge].mean()), float(np.percentile(change[edge], 99))


def test_video_frames_default_edge_changes_no_more_than_off_from_frame_to_frame(tmp_path: Path):
    """A still scene under a decoder's noise. With the pass off the edge follows the noise smoothly; without the
    hold, the noise carried edge pixels across the pass's tests and back, and each crossing changed the colour
    written by far more than the noise did, so the edge sparkled where off does not."""
    files, (F, A) = _still_clip(tmp_path)
    frames_mod.key_frames(files, tmp_path / "off", key="green", decontam="off")
    on = frames_mod.key_frames(files, tmp_path / "on", key="green")
    off_mean, off_p99 = _edge_change(tmp_path / "off", files)
    on_mean, on_p99 = _edge_change(tmp_path / "on", files)
    assert on_mean <= off_mean and on_p99 <= off_p99
    # and the edge is still the hair's colour, not the olive the matte leaves
    edges = [_edge(np.array(Image.open(path).convert("RGB")))[0] for path in files]
    before = np.mean([_toward_key(_keyed(tmp_path / "off", path), F, A, edge) for path, edge in zip(files, edges)])
    after = np.mean([_toward_key(_keyed(tmp_path / "on", path), F, A, edge) for path, edge in zip(files, edges)])
    assert before > 0.05 and after <= 0.5 * before
    totals = on["decontam"]["totals"]
    assert totals["held_px"] > 0 and totals["settled_px"] > 0
    assert on["rows"][0]["decontam"]["held_px"] == on["rows"][0]["decontam"]["settled_px"] == 0  # nothing to hold yet


def _premultiplied(rgba: np.ndarray) -> np.ndarray:
    """RGBA as what it adds to any background: colour times coverage, and the coverage, both 0-255."""
    x = rgba.astype(np.float64)
    return np.concatenate([x[..., :3] * x[..., 3:4] / 255.0, x[..., 3:4]], -1)


def test_video_fit_spreads_a_changed_call_over_frames_on_a_still_edge(tmp_path: Path):
    """One decoded frame, then another held still: the noise between them moved some edge pixels across the pass's
    tests, past the hold. Shown at once, such a pixel changed by the whole gap between the matte's colour and the
    fit's in one frame (kept to written, a tint to a blend, one palette colour to another): on a still edge, the rare
    large jump that off does not have. The video fit moves it from what it showed toward its new call a step a frame
    instead, never more than VIDEO_STEP while the source stands still, until it arrives."""
    F, A = _render(widths=STRANDS_1_TO_3)
    clean = _composite_on(F, A, GREEN_PAINTED)
    first = _noisy_420(clean, np.random.default_rng(1000), 3.0)
    held = _noisy_420(clean, np.random.default_rng(1001), 3.0)
    files = []
    for t in range(20):
        path = tmp_path / f"frame-{t + 1:04d}.png"
        Image.fromarray(first if t == 0 else held).save(path)
        files.append(path)
    on = frames_mod.key_frames(files, tmp_path / "on", key="green")
    shown = [_premultiplied(_keyed(tmp_path / "on", path)) for path in files]
    moves = [np.abs(b - a).max(-1) for a, b in zip(shown[1:], shown[2:])]  # the source no longer changes
    assert max(float(m.max()) for m in moves) > 2.0  # still on its way to the new calls ...
    assert all(float(m.max()) <= decontam.VIDEO_STEP + 1.0 for m in moves)  # ... a step a frame (+1: uint8 rounding)
    assert not moves[-1].any()  # ... and arrived
    assert on["decontam"]["totals"]["blending_px"] > 0
    assert on["rows"][0]["decontam"]["blending_px"] == 0  # the first frame shows its own calls


def test_video_frames_give_a_frame_shown_twice_the_same_bytes(tmp_path: Path):
    """The history holds and settles toward what a frame shows: a frame repeated comes out as it did."""
    files, _ = _clip(tmp_path, GREEN_PAINTED, frames=1, widths=STRANDS_1_TO_3)
    again = tmp_path / "frame-0002.png"
    shutil.copyfile(files[0], again)
    on = frames_mod.key_frames([files[0], again], tmp_path / "on", key="green")
    assert np.array_equal(_keyed(tmp_path / "on", files[0]), _keyed(tmp_path / "on", again))
    assert on["rows"][1]["decontam"]["settled_px"] > 0


def test_video_fit_gives_the_keyed_flank_no_coverage(tmp_path: Path):
    """In a decoded frame every keyed pixel near the subject reads as a faint blend (its blur), and the codec's
    noise carried those across the floor and back from frame to frame: the dark gaps between strands filled with a
    faint smear that came and went. The video fit leaves what the hard cut keyed transparent; the still fit does not."""
    files, truth = _clip(tmp_path, GREEN_PAINTED, widths=STRANDS_1_TO_3)
    on = frames_mod.key_frames(files, tmp_path / "on", key="green")
    for path, (_F, _A, raw) in zip(files, truth):
        assert not _keyed(tmp_path / "on", path)[..., 3][_hard_cut(raw)].any()
    assert on["decontam"]["totals"]["recovered_px"] == 0
    F, A = _render(widths=STRANDS_1_TO_3)
    _, still = _key(_composite_on(F, A, GREEN_PAINTED), decontam="palette", decontam_fit="still")
    assert still["recovered_px"] > 0
