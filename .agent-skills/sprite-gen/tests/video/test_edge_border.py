# SPDX-License-Identifier: Apache-2.0
"""A drawing cut by its own frame is not a clip framed too tight, and a refused run hands nothing over.

* `video-frames` reads the drawing's own border on the clip's first frame: a side whose outermost row or column
  the subject covers for at least `BORDER_MIN_FRACTION` of its length (a bust's sleeve, hair cut off at the top).
  Contact there is accepted in every frame. Contact on any other side is still the subject framed too tight, and
  leftover key background is still refused, except a piece under `SPECK_MIN_PX` lying wholly within `RIM_REACH` px
  of the frame's body, on a border side the frame's subject reaches: the body's rim the matte cut loose.
* A clip whose first frame crosses no side is judged and worded as before.
* The names a run hands over (`keyed/`; `cycle/`, the strip, the GIF and the WebP) exist only after a run that
  passed. A refused run keeps its frames under a name of their own (`keyed.refused/`, `cycle.refused/`) and its
  report says `status`.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from sprite_gen.video import frames as frames_mod
from sprite_gen.video import loop as loop_mod

GREEN = (0, 255, 0)
DARK_GREEN = (8, 162, 24)  # the key the matte leaves: its hue, 96.38 from pure green
BODY = (180, 60, 30)
W, H = 200, 240
FRAMING = "framed too tight"
LEFTOVER = "leftover chroma background"


def _box(image: Image.Image, x0: int, y0: int, x1: int, y1: int, colour=BODY) -> None:
    image.paste(colour, (max(0, x0), max(0, y0), min(W, x1), min(H, y1)))


def _bust(image: Image.Image, dy: int = 0) -> None:
    """A bust cut by the frame: the sleeve runs off the left, the hair off the top, the chest off the bottom."""
    _box(image, 0, 130 + dy, 60, 240)
    _box(image, 40, 0, 150, 240)
    _box(image, 60, 100 + dy, 170, 240)


def _stain(frame: int, *rect: int):
    """The bust in every frame, a piece of the leftover key at `rect` in `frame`."""
    def paint(k: int, image: Image.Image) -> None:
        _bust(image)
        if k == frame:
            _box(image, *rect, DARK_GREEN)
    return paint


def _hand(k: int, image: Image.Image) -> None:
    _bust(image)
    _box(image, 150, 150, 194, 170)  # a hand two columns clear of the right band


def _lowered(k: int, image: Image.Image) -> None:
    if k == 2:  # the bust 6 rows lower, the head clear of the top band
        _box(image, 0, 136, 60, 240), _box(image, 40, 6, 150, 240), _box(image, 60, 106, 170, 240)
    else:
        _bust(image)


def _raw(tmp_path: Path, paint, n: int = 4) -> list[Path]:
    d = tmp_path / "raw"
    d.mkdir(parents=True, exist_ok=True)
    files = []
    for k in range(n):
        image = Image.new("RGB", (W, H), GREEN)
        paint(k, image)
        files.append(d / f"frame-{k:04d}.png")
        image.save(files[-1])
    return files


def _key(tmp_path: Path, files: list[Path], **kw) -> dict:
    return frames_mod.key_frames(files, tmp_path / "keyed", key="green", **kw)


def _refusal(tmp_path: Path, files: list[Path], **kw) -> SystemExit:
    with pytest.raises(SystemExit) as info:
        _key(tmp_path, files, **kw)
    return info.value


# --- the drawing's own border ------------------------------------------------------------------------------------


def test_a_bust_cut_by_its_own_frame_passes_and_the_report_names_the_border(tmp_path: Path, capsys) -> None:
    # S1: the bust sways 3 px a frame; its sleeve and hair stay on the left and top edges in every frame.
    report = _key(tmp_path, _raw(tmp_path, lambda k, image: _bust(image, dy=(k % 3) * 3)))
    assert report["edge_policy"] == "border"
    border = report["edge_border"]
    assert border["frame"] == "frame-0000.png" and border["sides"] == ["top", "left"]
    assert border["outer_px"] == {"top": 110, "left": 110, "right": 0}
    assert (border["min_fraction"], border["rim_reach"], border["rim_under_px"]) == (0.02, 10, 8)
    assert len(report["edge_contacts"]) == 4
    for contact in report["edge_contacts"]:
        assert contact["off"] == {"top": 0, "left": 0, "right": 0}
        assert contact["border"] == contact["top"] + contact["left"]  # nothing of the bust is in the top-left corner
    assert "the first frame's subject runs off the top and left edges" in capsys.readouterr().err


@pytest.mark.parametrize("name, paint, message", [
    # the head of a padded jump leaves the top: no side is the border, the text is as it was
    ("S2", lambda k, image: _box(image, 60, 50 - (50 if k in (2, 3) else 0), 140, 240),
     "video-frames: the subject touches the frame edge in 2 frame(s) (worst frame-0002.png: top 320 / left 0 / right 0 px)"
     " — the clip was framed too tight; regenerate from a taller/wider canvas (`sprite-gen video-canvas`) or pass"
     " --allow-edge-contact to accept the clipping"),
    # a 2 px wisp on the top in the first frame is under 2 % of the side: the top is not the border
    ("S5", lambda k, image: (_box(image, 60, 40 - (38 if k in (2, 3) else 0), 140, 240),
                             _box(image, 98, 0, 100, 40) if k == 0 else None),
     "video-frames: the subject touches the frame edge in 3 frame(s) (worst frame-0002.png: top 160 / left 0 / right 0 px)"
     " — the clip was framed too tight; regenerate from a taller/wider canvas (`sprite-gen video-canvas`) or pass"
     " --allow-edge-contact to accept the clipping"),
])
def test_a_first_frame_that_crosses_no_side_is_judged_and_worded_as_before(tmp_path: Path, name, paint, message) -> None:
    refused = _refusal(tmp_path, _raw(tmp_path, paint))
    assert str(refused) == message
    assert refused.report["edge_border"]["sides"] == []
    assert all(c["off"] == {s: c[s] for s in ("top", "left", "right")} and c["border"] == 0
               for c in refused.report["edge_contacts"])


def test_leftover_key_with_no_border_is_worded_as_before(tmp_path: Path) -> None:
    # S9: key-only patch on the left in the first frame, the body clear of every edge.
    files = _raw(tmp_path, lambda k, image: (_box(image, 60, 50, 140, 240),
                                             _box(image, 0, 60, 14, 100, DARK_GREEN) if k == 0 else None))
    refused = _refusal(tmp_path, files)
    assert str(refused).startswith("video-frames: leftover chroma background reaches the frame edge in 1 frame(s) "
                                   "(worst frame-0000.png: top 0 / left 160 / right 0 px) — the key survived the matte")
    assert refused.report["edge_border"]["sides"] == []


def test_a_hand_off_a_side_that_is_not_the_border_is_framing_and_the_text_counts_only_that_side(tmp_path: Path) -> None:
    # S3: the bust's top and left are its border; a hand leaving the right is the clip framed too tight. The text's
    # numbers are the pixels the border does not take, so a caller reading them for a taller canvas reads the right.
    files = _raw(tmp_path, lambda k, image: (_bust(image), _box(image, 150, 150, 200 if k in (2, 3) else 180, 170)))
    refused = _refusal(tmp_path, files)
    assert FRAMING in str(refused) and "leftover" not in str(refused)
    assert "in 2 frame(s) (worst frame-0002.png: top 0 / left 0 / right 80 px)" in str(refused)
    rows = {c["frame"]: c for c in refused.report["edge_contacts"]}
    assert rows["frame-0002.png"]["top"] > 0 and rows["frame-0002.png"]["border"] > 0


def test_a_hand_leaving_a_border_side_elsewhere_is_accepted_the_known_limit(tmp_path: Path) -> None:
    # S4: the left is the border; a hand leaving it far from the sleeve cannot be told from the sleeve moving.
    files = _raw(tmp_path, lambda k, image: (_bust(image), _box(image, 0 if k in (2, 3) else 20, 20, 40, 40)))
    assert _key(tmp_path, files)["edge_border"]["sides"] == ["top", "left"]


# --- leftover key: refused unless it is the body's rim -------------------------------------------------------------


@pytest.mark.parametrize("name, paint, side", [
    ("S6 a key-only patch on the right, not a border side", _stain(2, 190, 60, 200, 80), "top 0 / left 0 / right 80"),
    ("S7 a 48 px fringe beside the sleeve", _stain(2, 0, 122, 8, 128), "top 0 / left 24 / right 0"),
    ("S8 the sleeve left the left, a patch stays there",
     lambda k, image: ((_box(image, 40, 0, 150, 240), _box(image, 60, 100, 170, 240), _box(image, 0, 150, 14, 190, DARK_GREEN))
                       if k == 2 else _bust(image)), "top 0 / left 160 / right 0"),
    ("S10 a 20x90 stain 30 rows above the sleeve", _stain(2, 0, 10, 20, 100), "top 0 / left 360 / right 0"),
    ("R1-d11 a 2 px piece 11 px above the sleeve", _stain(2, 0, 119, 2, 120), "top 0 / left 2 / right 0"),
    ("R1-d14 a 2 px piece 14 px above the sleeve", _stain(2, 0, 116, 2, 117), "top 0 / left 2 / right 0"),
    ("R2-L4 an 8 px piece from 2 px above the sleeve", _stain(2, 0, 125, 2, 129), "top 0 / left 8 / right 0"),
    ("R2-L9 an 18 px piece from 2 px above the sleeve", _stain(2, 0, 120, 2, 129), "top 0 / left 18 / right 0"),
    ("R2-L10 a 20 px piece reaching 11 px", _stain(2, 0, 119, 2, 129), "top 0 / left 20 / right 0"),
    ("R3-t3 a 3x60 stripe hugging the head", _stain(2, 36, 0, 39, 60), "top 12 / left 0 / right 0"),
    ("R3-t9 a 9x60 stripe hugging the head", _stain(2, 30, 0, 39, 60), "top 36 / left 0 / right 0"),
    ("R3-t10 a 10x60 stripe hugging the head", _stain(2, 29, 0, 39, 60), "top 40 / left 0 / right 0"),
    ("R4 a 30x40 stain 11 px right of the head", _stain(2, 160, 0, 190, 40), "top 120 / left 0 / right 0"),
    ("R5 a 13x91 stain 3 px left of the head", _stain(2, 25, 0, 38, 91), "top 52 / left 0 / right 0"),
    ("R7 a fringe 3 px from a hand on the right, not a border side",
     lambda k, image: (_hand(k, image), _box(image, 196, 158, 198, 162, DARK_GREEN) if k == 2 else None),
     "top 0 / left 0 / right 8"),
    ("R8 a fringe 5 px above a head clear of the top band",
     lambda k, image: (_lowered(k, image), _box(image, 80, 0, 82, 2, DARK_GREEN) if k == 2 else None),
     "top 4 / left 0 / right 0"),
    # a fleck of the body's colour in a stain, the key between them: the fleck is the subject, the stain is 10 px from
    # it and 29 px from the body — the reach is to the body, not to any piece of the subject
    ("R9 a stain round a fleck of the body's colour",
     lambda k, image: (_bust(image), (_box(image, 0, 101, 12, 121, DARK_GREEN), _box(image, 0, 108, 4, 114, GREEN),
                                      _box(image, 0, 110, 2, 112)) if k == 2 else None),
     "top 0 / left 56 / right 0"),
])
def test_leftover_key_that_is_not_the_bodys_rim_is_refused(tmp_path: Path, name, paint, side) -> None:
    refused = _refusal(tmp_path, _raw(tmp_path, paint))
    assert str(refused).startswith(f"video-frames: {LEFTOVER} reaches the frame edge in 1 frame(s) (worst frame-0002.png: {side} px)")
    assert refused.report["edge_border"]["sides"] == ["top", "left"]


def test_dots_of_leftover_key_are_judged_piece_by_piece(tmp_path: Path) -> None:
    # R6: 1 px dots every other row of the left band. Those within 10 px of the sleeve are its rim; the rest refuse.
    files = _raw(tmp_path, lambda k, image: (_bust(image), [_box(image, 0, y, 1, y + 1, DARK_GREEN) for y in range(60, 129, 2)]
                                                            if k == 2 else None))
    refused = _refusal(tmp_path, files)
    assert LEFTOVER in str(refused) and FRAMING not in str(refused)
    row = next(c for c in refused.report["edge_contacts"] if c["frame"] == "frame-0002.png")
    assert row["rim"] == 5 and row["off"]["left"] == row["residual"] - row["rim"] > 0


@pytest.mark.parametrize("name, rect", [
    ("R1-d2", (0, 128, 2, 129)), ("R1-d6", (0, 124, 2, 125)), ("R1-d10", (0, 120, 2, 121)),
    ("seven pixels, four in the band, 2 px from the sleeve", (0, 128, 7, 129)),
])
def test_a_small_piece_of_the_key_within_reach_of_the_body_is_its_rim(tmp_path: Path, name, rect) -> None:
    report = _key(tmp_path, _raw(tmp_path, _stain(2, *rect)))
    row = next(c for c in report["edge_contacts"] if c["frame"] == "frame-0002.png")
    assert row["residual"] > 0 and row["rim"] == row["residual"]
    assert row["off"] == {"top": 0, "left": 0, "right": 0}


@pytest.mark.parametrize("name, rect, left", [
    # the whole piece counts, not what of it is in the band: eight pixels, four of them in it
    ("eight pixels, four in the band", (0, 128, 8, 129), 4),
    ("seven pixels 11 px from the sleeve", (0, 119, 7, 120), 4),
])
def test_the_rim_is_a_piece_under_eight_pixels_wholly_within_reach(tmp_path: Path, name, rect, left) -> None:
    refused = _refusal(tmp_path, _raw(tmp_path, _stain(1, *rect), n=3))
    assert str(refused).startswith(f"video-frames: {LEFTOVER} reaches the frame edge in 1 frame(s) "
                                   f"(worst frame-0001.png: top 0 / left {left} / right 0 px)")


def test_the_flags_judge_as_they_did(tmp_path: Path) -> None:
    # S10 under --allow-subject-edge-contact: the frame's subject touches the edge, so its key-tinted pixels pass with it.
    files = _raw(tmp_path, _stain(2, 0, 10, 20, 100))
    report = _key(tmp_path, files, allow_subject=True)
    assert report["edge_policy"] == "subject-allowed" and "edge_border" not in report
    # S9 under the same flag: the key alone at the edge
    files = _raw(tmp_path / "s9", lambda k, image: (_box(image, 60, 50, 140, 240),
                                                    _box(image, 0, 60, 14, 100, DARK_GREEN) if k == 0 else None))
    with pytest.raises(SystemExit, match=LEFTOVER):
        frames_mod.key_frames(files, tmp_path / "s9" / "keyed", key="green", allow_subject=True)
    assert frames_mod.key_frames(files, tmp_path / "s9" / "off", key="green", check_edges=False)["edge_policy"] == "off"


def test_classify_edge_contact_counts_the_rim(tmp_path: Path) -> None:
    files = _raw(tmp_path, _stain(2, 0, 128, 2, 129))
    _key(tmp_path, files)
    split = frames_mod.classify_edge_contact(Image.open(files[2]), Image.open(tmp_path / "keyed" / files[2].name), GREEN)
    assert split["residual"] == 2 and split["rim"] == 2 and split["subject"] > 0


# --- what a refused video-frames run leaves -------------------------------------------------------------------------


def _clip(tmp_path: Path, monkeypatch, files: list[Path]) -> Path:
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"synthetic")
    monkeypatch.setattr(frames_mod, "probe", lambda _: {"stream_index": 0, "fps": 24.0, "width": W, "height": H})
    monkeypatch.setattr(frames_mod, "extract", lambda *a: files)
    return clip


def _run(clip: Path, out: Path) -> dict:
    return frames_mod.run_frames(clip, out, key="green", allow_edge_contact=False, report_path=None)


_S3 = lambda k, image: (_bust(image), _box(image, 150, 150, 200 if k in (2, 3) else 180, 170))  # noqa: E731


def test_o1_a_refused_run_hands_over_no_keyed_frames_and_reports_refused(tmp_path: Path, monkeypatch) -> None:
    files = _raw(tmp_path, _S3)
    out = tmp_path / "out"
    with pytest.raises(SystemExit, match=FRAMING) as info:
        _run(_clip(tmp_path, monkeypatch, files), out)
    assert not (out / "keyed").exists()
    assert sorted(p.name for p in (out / "keyed.refused").glob("*.png")) == [f.name for f in files]
    report = json.loads((out / "frames.report.json").read_text())
    assert report["status"] == "refused" and report["error"] == str(info.value)
    assert report["keyed_dir"] is None and report["refused_dir"] == str((out / "keyed.refused").resolve())
    assert report["frames"] == 4 and report["edge_border"]["sides"] == ["top", "left"]


def test_o2_a_pass_after_a_refusal_leaves_keyed_alone(tmp_path: Path, monkeypatch) -> None:
    out = tmp_path / "out"
    with pytest.raises(SystemExit):
        _run(_clip(tmp_path, monkeypatch, _raw(tmp_path / "a", _S3)), out)
    passed = _run(_clip(tmp_path, monkeypatch, _raw(tmp_path / "b", lambda k, image: _bust(image))), out)
    assert passed["status"] == "passed" and passed["keyed_dir"] == str((out / "keyed").resolve())
    assert sorted(p.name for p in out.iterdir()) == ["frames.report.json", "keyed"]
    assert json.loads((out / "frames.report.json").read_text())["status"] == "passed"


def test_o3_a_pass_over_a_longer_one_holds_its_own_frames_only(tmp_path: Path, monkeypatch) -> None:
    out = tmp_path / "out"
    _run(_clip(tmp_path, monkeypatch, _raw(tmp_path / "a", lambda k, image: _bust(image), n=6)), out)
    shorter = _raw(tmp_path / "b", lambda k, image: _bust(image, dy=3), n=3)
    _run(_clip(tmp_path, monkeypatch, shorter), out)
    assert sorted(p.name for p in (out / "keyed").iterdir()) == [f.name for f in shorter]


def test_a_frame_keyed_to_no_transparency_is_refused_the_same_way(tmp_path: Path, monkeypatch) -> None:
    out = tmp_path / "out"
    _run(_clip(tmp_path, monkeypatch, _raw(tmp_path / "a", lambda k, image: _bust(image))), out)
    full = _raw(tmp_path / "b", lambda k, image: _box(image, 0, 0, W, H))
    with pytest.raises(SystemExit, match="keyed to 0% transparency"):
        _run(_clip(tmp_path, monkeypatch, full), out)
    assert not (out / "keyed").exists() and (out / "keyed.refused" / "frame-0000.png").is_file()
    assert json.loads((out / "frames.report.json").read_text())["status"] == "refused"


def test_an_argument_error_touches_nothing(tmp_path: Path, monkeypatch) -> None:
    out = tmp_path / "out"
    clip = _clip(tmp_path, monkeypatch, _raw(tmp_path / "a", lambda k, image: _bust(image)))
    _run(clip, out)
    before = sorted(p.name for p in (out / "keyed").iterdir())
    with pytest.raises(SystemExit, match="unknown --decontam"):
        frames_mod.run_frames(clip, out, key="green", allow_edge_contact=False, report_path=None, decontam="nope")
    assert sorted(p.name for p in (out / "keyed").iterdir()) == before


# --- what a refused video-loop run leaves ---------------------------------------------------------------------------


def _breathing(root: Path, *, end_offset: int = 0, n: int = 48) -> Path:
    """A standing body that breathes by 1 px; the last frame is the first moved by `end_offset`."""
    root.mkdir(parents=True)
    for t in range(n):
        image = Image.new("RGBA", (64, 96), (0, 0, 0, 0))
        lift = round((1 - np.cos(2 * np.pi * t / (n - 1))) / 2)
        dx = end_offset if t == n - 1 else 0
        image.paste((180, 60, 60, 255), (24 + dx, 20 - lift, 40 + dx, 90))
        image.putpixel((26 + t % 12, 40 + t // 12), (90, 200, 90, 255))  # no two frames alike, as filmed
        image.save(root / f"frame-{t:04d}.png")
    return root


def _cut(keyed: Path, out: Path, **kw) -> dict:
    return loop_mod.run_loop(keyed, out, fps=24.0, state="idle", min_len=None, max_len=None, n_out=None,
                             seam_max=loop_mod.SEAM_RATIO_MAX, name="idle", report_path=None, **{"cycle_mode": "pinned", **kw})


HANDED_OVER = ("cycle", "cycle.source", "follow.source.png", "idle.strip.png", "idle.strip.json", "idle.gif", "idle.webp")


def _passed_once(tmp_path: Path) -> Path:
    out = tmp_path / "out"
    _cut(_breathing(tmp_path / "good"), out)
    # what a later alignment and follow-through keep beside the cut
    (out / "cycle.source").mkdir()
    (out / "follow.source.png").write_bytes(b"strip")
    assert all((out / n).exists() for n in HANDED_OVER)
    return out


def test_o4_a_cut_refused_after_it_was_written_hands_nothing_over(tmp_path: Path) -> None:
    out = _passed_once(tmp_path)
    with pytest.raises(SystemExit, match="does not end on its first frame"):
        _cut(_breathing(tmp_path / "moved", end_offset=10), out)
    assert [n for n in HANDED_OVER if (out / n).exists()] == []
    assert len(list((out / "cycle.refused").glob("frame-*.png"))) == 47
    assert json.loads((out / "idle.loop.report.json").read_text())["status"] == "failed"
    # and a pass after it clears the refused cut away
    _cut(_breathing(tmp_path / "good2"), out)
    assert not (out / "cycle.refused").exists() and (out / "idle.gif").is_file()


def test_o5_a_cut_refused_before_it_was_written_hands_nothing_over(tmp_path: Path) -> None:
    out = _passed_once(tmp_path)
    with pytest.raises(SystemExit, match="does not fit"):
        _cut(_breathing(tmp_path / "short"), out, cycle_mode="fixed", start=40, length=20)
    assert [n for n in HANDED_OVER if (out / n).exists()] == []
    assert not (out / "cycle.refused").exists()
    assert json.loads((out / "idle.loop.report.json").read_text())["status"] == "failed"


def test_a_loop_argument_error_touches_nothing(tmp_path: Path) -> None:
    out = _passed_once(tmp_path)
    with pytest.raises(SystemExit, match="unknown --repair"):
        _cut(_breathing(tmp_path / "again"), out, repair="nope")
    assert all((out / n).exists() for n in HANDED_OVER)
