# SPDX-License-Identifier: Apache-2.0
"""A walk whose body turns inside its clip (docs/video-pipeline.md section 4, "The body turn";
sprite_gen/video/body_turn.py): each frame's torso is read between the clip's first frame and that frame mirrored
(`torso-side-v2`), a turn is the torso under TURN_SIDE_MAX for TURN_RUN_MIN frames or more, and `video-loop --anchor
motion-auto` takes no cut that holds a frame of one while another holds a cycle. Where none does, `--body-turn warn`
(the default) takes the cut it took before and says so; `--body-turn refuse` refuses the clip in a line of its own. Each
frame is read by its mass: its box tops at the row with a hundredth of its solid pixels over it (MASS_SHARE), its head's
centre is read on the head's fullest columns (HEAD_CORE), and the still's torso is held as wide as the columns with a
hundredth of its torso rows' pixels beside them — a fleck or a thin part apart from the body moves none of them. Each
crop is cut about the middle of the head's centre column, its edges where they fall, between pixels too, and each frame
is read against the still and against its mirror, each at its best about any axis within TOL px of the still's head's
centre (the still's own side about any within GUARD px): a body that is its own mirror crops as its own mirror, and a
piece beside the head that moves a centre a pixel or two moves no turn.

The walker is a back diagonal seen from behind: legs side by side swinging half a cycle apart, arms either side swinging
opposite, the arm on the facing side bright and the other dim, a light panel on the torso and the cheek on the head
toward the facing. Over a turn the facing goes over to the still's mirror and back (`facing` 1 the still's three-quarter
view, 0 square from behind, under 0 past it), the arms' tones crossing. A walker drawn square from behind (`square`) is
the back walk whose still shows no side; taken into its stride, or with a piece beside its head in the still, its still
shows one its walk does not, each frame's mirror a frame of the walk half a stride on, and the walk, as near the still's
mirror as the still at the median (WALK_SIDE_MIN), is not read — as a walk that turned to square and stayed is not: the
frames alone do not tell the two apart, and a warning line says so. A frame the reading cannot read — no head to centre
on, no solid pixel across the still's torso rows, a crop of no width or with nothing in it, no frames — is not read,
never read as 0 or as a middle no pixel holds. Synthetic frames only."""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

from conftest import feet_unseen
from sprite_gen.video import local_cycle, loop

FRAMES = 73
CYCLE = 24
W, H = 300, 240
TURN = (30, 40)  # the frames the turning walker turns over, the still's mirror reached at their middle
LOW = -0.6  # the facing the turn reaches
APART = 240  # how much lower the walker is drawn, on a canvas as much taller, where a part is apart above it
SPECK = (179, 0)  # a fleck's top left on the canvas: over the head (its top row 37-43) and right of it, apart
NEAR = (26, -18)  # ... or from the head's top middle: 6 px square, 13 px above and right of its corner
BESIDE = (20, 2)  # ... or 6 px square, 6 px right of the head's edge and 2 under its top: in its rows, not over them


def _facing(turns, t: float, low: float = LOW, edge: int = 3) -> float:
    """1 outside the turns; inside each (a, b), down to `low` over `edge` frames either end."""
    f = 1.0
    for a, b in turns:
        if a <= t <= b:
            f = min(f, 1.0 - (1.0 - low) * min(1.0, (min(t - a, b - t) + 1) / (edge + 1)))
    return f


def _walker(k: int, *, turns=(), every: tuple[int, int] | None = None, low: float = LOW, hold: int = 1,
            square: bool = False, hood: bool = False, lead: int = 0, staff=(), apart=None, speck=(),
            speck_side: int = 3, speck_at: tuple[int, int] | None = None, speck_xy: tuple[int, int] | None = None,
            loose: str | None = None, joined=(), part: str | None = None, cut=(), droop: int = 0) -> Image.Image:
    """The walker's frame `k`: turning over `turns`, or `every` (at, span) frames of each cycle; drawn on `hold`s;
    square from behind (`square`); hooded, its head and shoulders one shape that widens downward with no neck (`hood`);
    filmed smaller over its first `lead` frames, from 0.6 of its size, about its feet (a lead-in); over the frames in
    `staff`, holding a staff beside it that bobs with it, its ornament as high as the head and apart from it, the handle
    in its hand; where `apart` is given, drawn APART px lower on a canvas as much taller, a pennant apart above it at
    the top over the frames in `apart`; over the frames in `speck`, a fleck `speck_side` px square apart from it, its
    top left at SPECK on the canvas, at `speck_xy` on it, or `speck_at` (dx, dy) from the head's top middle; where
    `loose` is given, a part of it cut loose a transparent row or column from it: its feet's last two rows (`toes`), a
    tail's tip beside its legs (`tail`), or an ornament beside its head (`ornament`, joined to it by a pixel over the
    frames in `joined`); where `part` is given, a thin part of its own joined to its head and cut loose over the frames
    in `cut` (its joining pixel transparent): an antenna over the head's right (`antenna`, a pixel wide, 31 px tall), or
    a whisker right of it (`whisker`, a pixel tall, 30 px from the head joined, 29 px from the pixel after cut loose,
    `droop` rows lower then). A turn goes over to `low`: LOW, past the still's mirror, or 0, square from behind."""
    t = k - k % hold
    ph = 2 * math.pi * t / CYCLE
    if square:
        f = 0.0
    elif every is not None:
        spans = [(every[0] + c * CYCLE, every[0] + c * CYCLE + every[1]) for c in range(-1, FRAMES // CYCLE + 2)]
        f = _facing(spans, t, low)
    else:
        f = _facing(turns, t, low)
    im = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(im)
    x, y = 150, 40 + round(3 * math.cos(2 * ph))
    sw = 6 * math.sin(ph)
    for sign in (1, -1):
        lx = x + 14 * sign * math.sin(ph)
        d.rectangle((lx - 5, y + 86, lx + 5, y + 132), fill=(60, 60, 70, 255))
    for side in (1, -1):
        tone = round(150 + 75 * (1 + side * f) / 2)
        ay = y + 36 + round(side * sw)
        d.rectangle((x + side * 20 - 4, ay, x + side * 20 + 4, ay + 38), fill=(tone, tone, tone, 255))
    d.rectangle((x - 16, y + 32, x + 16, y + 90), fill=(200, 80, 80, 255))
    px = x + round(9 * f)
    d.rectangle((px - 5, y + 36, px + 5, y + 86), fill=(240, 170, 150, 255))
    fx = x + round(8 * f)
    if hood:
        d.polygon([(x - 13, y), (x + 13, y), (x + 17, y + 34), (x - 17, y + 34)], fill=(70, 90, 140, 255))
        d.rectangle((fx - 5, y + 8, fx + 5, y + 26), fill=(230, 200, 170, 255))
    else:
        d.rectangle((x - 5, y + 26, x + 5, y + 34), fill=(210, 180, 150, 255))
        d.rectangle((x - 13, y, x + 13, y + 28), fill=(90, 60, 40, 255))
        d.rectangle((fx - 5, y + 6, fx + 5, y + 24), fill=(230, 200, 170, 255))
    d.point((x - 10, y + 44 + int(t) % 11), fill=(250, 250, 250, 255))  # no two drawings the same picture
    if k in staff:
        d.rectangle((267, y, 293, y + 28), fill=(90, 60, 40, 255))
        d.rectangle((278, y + 28, 282, y + 90), fill=(140, 90, 40, 255))
        d.rectangle((170, y + 70, 282, y + 74), fill=(140, 90, 40, 255))
    if k in speck:
        sx, sy = speck_xy or (SPECK if speck_at is None else (x + speck_at[0], y + speck_at[1]))
        d.rectangle((sx, sy, sx + speck_side - 1, sy + speck_side - 1), fill=(250, 220, 90, 255))
    if loose == "toes":
        d.rectangle((0, y + 130, W - 1, y + 130), fill=(0, 0, 0, 0))
    elif loose == "tail":
        d.rectangle((170, y + 94, 171, y + 105), fill=(90, 60, 40, 255))
    elif loose == "ornament":
        d.rectangle((165, y + 2, 168, y + 8), fill=(250, 220, 90, 255))
        if k in joined:
            d.point((x + 14, y + 5), fill=(250, 220, 90, 255))
    if part == "antenna":
        d.line((x + 12, y - 31, x + 12, y - 1), fill=(250, 220, 90, 255))
        if k in cut:
            d.point((x + 12, y - 1), fill=(0, 0, 0, 0))
    elif part == "whisker" and k in cut:
        d.line((x + 15, y + 5 + droop, x + 43, y + 5 + droop), fill=(250, 220, 90, 255))
    elif part == "whisker":
        d.line((x + 14, y + 5, x + 43, y + 5), fill=(250, 220, 90, 255))
    if k < lead:
        s = 0.6 + 0.4 * k / lead
        small = im.resize((round(W * s), round(H * s)), Image.Resampling.LANCZOS)
        im = Image.new("RGBA", (W, H))
        im.paste(small, (round(150 - 150 * s), round(172 - 172 * s)), small)
    if apart is not None:
        tall = Image.new("RGBA", (W, H + APART))
        tall.paste(im, (0, APART))
        if k in apart:
            ImageDraw.Draw(tall).polygon([(130, 0), (170, 0), (130, 20)], fill=(250, 220, 90, 255))
        im = tall
    return im


def _speck(n: int) -> Image.Image:
    """A frame that holds nothing but `n` solid pixels in a row."""
    im = Image.new("RGBA", (W, H))
    ImageDraw.Draw(im).rectangle((150, 100, 149 + n, 100), fill=(200, 80, 80, 255))
    return im


def _keyed(root: Path, **drawn) -> Path:
    keyed = root / "keyed"
    keyed.mkdir(parents=True)
    for k in range(FRAMES):
        _walker(k, **drawn).save(keyed / f"{k:03}.png")
    return keyed


def _frames(**drawn) -> list[Image.Image]:
    return [_walker(k, **drawn) for k in range(FRAMES)]


def _held(taken: int, hold: tuple[int, int], **drawn) -> list[Image.Image]:
    """The walker's 73 drawings from drawing `taken` on, each of the first half of its stride (drawings 0-11 of each 24)
    held hold[0] frames and each of the second hold[1]: a stride whose two halves the clip plays at two paces."""
    return [_walker(k, **drawn) for k in range(taken, taken + FRAMES)
            for _ in range(hold[0] if k % CYCLE < CYCLE // 2 else hold[1])]


def _flecked(frames: list[Image.Image], n: int) -> list[Image.Image]:
    """`frames` with each frame that holds the frame before it (the same pixels) `n` of its edge pixels cleared, solid
    pixels beside a clear one, spread through the edge from a place of its own: the noise a codec and the key leave over
    a held frame, no held frame the same pixels as the frame before."""
    out = []
    for k, frame in enumerate(frames):
        if k and np.array_equal(np.asarray(frame), np.asarray(frames[k - 1])):
            a = np.asarray(frame).copy()
            solid = a[..., 3] >= 128
            inner = solid.copy()
            inner[1:] &= solid[:-1]
            inner[:-1] &= solid[1:]
            inner[:, 1:] &= solid[:, :-1]
            inner[:, :-1] &= solid[:, 1:]
            ys, xs = np.nonzero(solid & ~inner)
            pick = np.arange(k % 7, len(ys), len(ys) // n)[:n]
            a[ys[pick], xs[pick], 3] = 0
            frame = Image.fromarray(a)
        out.append(frame)
    return out


def _coded(frames: list[Image.Image], root: Path) -> list[Image.Image]:
    """`frames` as a clip comes to the reading: on the key's green, encoded by libx264 (yuv420p, its own crf 23), and
    decoded and keyed by `video-frames` (extract, key_frames: green)."""
    from sprite_gen.video import frames as video_frames

    made = root / "made"
    made.mkdir(parents=True)
    for k, f in enumerate(frames):
        canvas = Image.new("RGB", f.size, (0, 255, 0))
        canvas.paste(f, mask=f.getchannel("A"))
        canvas.save(made / f"frame-{k:04}.png")
    subprocess.run(["ffmpeg", "-v", "error", "-framerate", "24", "-i", str(made / "frame-%04d.png"), "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", str(root / "clip.mp4")], check=True)
    raw = video_frames.extract(root / "clip.mp4", root / "raw")
    video_frames.key_frames(raw, root / "keyed", key="green", check_edges=False)
    return [Image.open(p).convert("RGBA") for p in sorted((root / "keyed").glob("*.png"))]


def _stepped(frames: list[Image.Image], most: float = 0.004) -> list[Image.Image]:
    """`frames` with each drawing reached from the one before over frames of its own, each turning the next share of
    the solid pixels that come and go between the two, under `most` of the fewer solid pixels of the two: a walk whose
    every frame flips under HELD_MAX of the frame before, as a large or slow body's does."""
    out = [frames[0]]
    for a, b in zip(frames, frames[1:]):
        pa, pb = np.asarray(a), np.asarray(b)
        sa, sb = pa[..., 3] >= 128, pb[..., 3] >= 128
        coming, going = np.argwhere(sb & ~sa), np.argwhere(sa & ~sb)
        n = max(1, math.ceil((len(coming) + len(going)) / (most * min(int(sa.sum()), int(sb.sum())))))
        f = pa.copy()
        for c, g in zip(np.array_split(coming, n), np.array_split(going, n)):
            f[c[:, 0], c[:, 1]] = pb[c[:, 0], c[:, 1]]
            f[g[:, 0], g[:, 1]] = pb[g[:, 0], g[:, 1]]
            out.append(Image.fromarray(f.copy()))
        out[-1] = b
    return out


def _cut(out: Path, keyed: Path, *extra: str) -> dict:
    assert loop.main(["--frames-dir", str(keyed), "--out-dir", str(out), "--state", "walk", "--anchor", "motion-auto",
                      "--repair", "off", *extra]) == 0
    return json.loads((out / "loop.loop.report.json").read_text())


def _refused(out: Path, keyed: Path, capsys, *extra: str) -> tuple[str, dict]:
    capsys.readouterr()
    with pytest.raises(SystemExit) as refused:
        loop.main(["--frames-dir", str(keyed), "--out-dir", str(out), "--state", "walk", "--anchor", "motion-auto",
                   "--repair", "off", *extra])
    report = json.loads((out / "loop.loop.report.json").read_text())
    assert report["status"] == "failed"
    return str(refused.value.code), report


def _same_cut(a: Path, b: Path) -> None:
    for name in ("loop.strip.png", "loop.gif", "loop.webp"):
        assert (a / name).read_bytes() == (b / name).read_bytes(), name
    frames = sorted(p.name for p in (a / "cycle").glob("*.png"))
    assert frames and frames == sorted(p.name for p in (b / "cycle").glob("*.png"))
    assert all((a / "cycle" / f).read_bytes() == (b / "cycle" / f).read_bytes() for f in frames)


def _unread(monkeypatch) -> None:
    """The body turn read as nowhere: the search as it was before the reading."""
    from sprite_gen.video import body_turn

    real = body_turn.read
    monkeypatch.setattr(body_turn, "read", lambda frames: {**real(frames), "turns": []})


def _holds(report: dict, frames: range) -> bool:
    s, L = report["cycle"]["start"], report["cycle"]["length"]
    return bool(set(range(s, s + L)) & set(frames))


# --- the reading ---------------------------------------------------------------------------------------------------


def test_a_turn_is_four_frames_in_a_row_under_zero():
    """TURN_SIDE_MAX 0 and TURN_RUN_MIN 4, each where it turns over: a torso at 0 is not turned, one under it is; three
    frames in a row are the walk's own dip, four a turn; a frame not read ends a run."""
    from sprite_gen.video import body_turn

    assert body_turn.TURN_SIDE_MAX == 0.0 and body_turn.TURN_RUN_MIN == 4
    at = lambda side: [(t["from"], t["to"]) for t in body_turn.turns(side)]
    assert at([0.5, 0.0, 0.0, 0.0, 0.0, 0.5]) == []
    assert at([0.5, -1e-4, -1e-4, -1e-4, -1e-4, 0.5]) == [(1, 4)]
    assert at([0.5, -0.3, -0.3, -0.3, 0.5]) == []
    assert at([0.5, -0.3, -0.3, None, -0.3, -0.3, 0.5]) == []
    turn = body_turn.turns([0.5, -0.1, -0.2, -0.3, -0.1, 0.5])
    assert turn == [{"from": 1, "to": 4, "least": -0.3, "at": 3}]


def test_the_frames_a_cut_holds_of_a_turn_are_named_in_runs():
    from sprite_gen.video import body_turn

    assert body_turn.spans([36, 22, 23, 37, 38]) == "22-23 and 36-38" and body_turn.spans([40]) == "40"


def test_the_turning_walker_reads_a_turn_where_it_turns_and_nowhere_else():
    from sprite_gen.video import body_turn

    read = body_turn.read(_frames(turns=[TURN]))
    assert read["read"] and read["still_side"] >= body_turn.SIDE_SHOWN_MIN and read["side"][0] == 1.0
    (turn,) = read["turns"]
    assert TURN[0] <= turn["from"] and turn["to"] <= TURN[1] and turn["to"] - turn["from"] + 1 >= body_turn.TURN_RUN_MIN
    assert turn["least"] < -0.2
    steady = body_turn.read(_frames())
    assert steady["read"] and steady["turns"] == [] and min(steady["side"]) > 0.5


@pytest.mark.parametrize("turns, frames", [((12, 18), 0), ((12, 19), 4)], ids=["three-frames", "four-frames"])
def test_a_dip_of_three_frames_is_the_walks_own_and_four_are_a_turn(turns, frames):
    """The walker facing past its mirror three frames in a row reads no turn, however deep; four in a row, one."""
    from sprite_gen.video import body_turn

    read = body_turn.read(_frames(turns=[turns]))
    under = [k for k, v in enumerate(read["side"]) if v < body_turn.TURN_SIDE_MAX]
    assert len(under) == (frames or 3) and min(read["side"]) < -0.2
    assert [t["to"] - t["from"] + 1 for t in read["turns"]] == ([frames] if frames else [])


def test_a_square_still_is_not_read_and_the_bound_turns_over_at_the_stills_own_side(monkeypatch):
    """SIDE_SHOWN_MIN: the still's head and shoulders off their mirror under it, the clip is not read (a back walk's far
    step lays its torso nearer its mirror each step); at it, read."""
    from sprite_gen.video import body_turn

    square = body_turn.read(_frames(square=True))
    assert square["read"] is False and square["still_side"] < body_turn.SIDE_SHOWN_MIN and "square" in square["why"]
    shown = body_turn.read(_frames(turns=[TURN]))["still_side"]
    monkeypatch.setattr(body_turn, "SIDE_SHOWN_MIN", shown)
    assert body_turn.read(_frames(turns=[TURN]))["read"] is True
    monkeypatch.setattr(body_turn, "SIDE_SHOWN_MIN", shown + 1e-4)
    assert body_turn.read(_frames(turns=[TURN]))["read"] is False


def test_a_turn_is_counted_in_frames_however_the_walk_is_held():
    """Counted in frames, not drawings: the same turn drawn on twos is the same frames as on ones — counted in drawings
    it would be half as long, and a walk held on twos would need a turn twice as long to be one."""
    from sprite_gen.video import body_turn

    ones = body_turn.read(_frames(turns=[TURN]))["turns"]
    twos = body_turn.read(_frames(turns=[TURN], hold=2))["turns"]
    assert len(ones) == len(twos) == 1
    assert abs(ones[0]["from"] - twos[0]["from"]) <= 1 and abs(ones[0]["to"] - twos[0]["to"]) <= 1
    drawings = len({k - k % 2 for k in range(twos[0]["from"], twos[0]["to"] + 1)})
    assert drawings < twos[0]["to"] - twos[0]["from"] + 1


@pytest.mark.slow
def test_a_lead_in_is_read_against_the_still(tmp_path, monkeypatch):
    """The reference is the clip's first frame, the still, lead-in or not (the first 8 frames filmed from 0.6 of the
    size, which the search leaves out): the turn reads over the frames it reads over without the lead-in, and the walk
    where it does not turn stays clear of 0. Read from the first frame after the lead-in — a stride's pose, whose mirror
    the walk draws half a cycle on — a walk that does not turn reads a turn every stride with WALK_SIDE_MIN at 0 (as
    e54dc9c read it); its walk lies as near that frame's mirror as the frame at the median, as a square walk's does, and
    it is not read."""
    from sprite_gen.video import body_turn

    report = _cut(tmp_path / "out", _keyed(tmp_path, turns=[TURN], lead=8))
    turn = report["body_turn"]
    skip = report["lead_in"]["search_from"]
    assert skip > 0 and turn["reference"] == 0
    (led,), (want,) = turn["turns"], body_turn.read(_frames(turns=[TURN]))["turns"]
    assert (led["from"], led["to"]) == (want["from"], want["to"]) and led["least"] < -0.1
    assert min(v for k, v in enumerate(turn["side"]) if k >= skip and not led["from"] - 2 <= k <= led["to"] + 2) > 0.1
    steady = _frames(lead=8)
    assert body_turn.read(steady)["turns"] == []
    after = body_turn.read(steady[skip:])
    assert after["read"] is False and abs(after["walk_side"]) < body_turn.WALK_SIDE_MIN
    monkeypatch.setattr(body_turn, "WALK_SIDE_MIN", 0.0)
    assert len(body_turn.read(steady[skip:])["turns"]) >= 2


def test_a_part_swung_up_beside_the_head_does_not_pull_its_centre(monkeypatch):
    """HEAD_REACH: the side walker with a 60 px tail on a 45-frame beat (tests/video/test_walk_steps.py, the half step),
    its tail swung up into the head's rows every swing. The head's centre read within 0.3 of the body's height of it,
    the walker reads no turn; within 0.35 the tail pulls the centre aside and the torso reads a turn every swing (the
    search then took a cut that does not close)."""
    from sprite_gen.video import body_turn
    from tests.video.test_walk_steps import _side

    frames = [_side(k, cycle=29, tail_cycle=45, tail=60, arms=False) for k in range(FRAMES)]
    assert body_turn.HEAD_REACH == 0.3
    read = body_turn.read(frames)
    assert read["read"] and read["turns"] == [] and min(read["side"]) > 0
    monkeypatch.setattr(body_turn, "HEAD_REACH", 0.35)
    assert len(body_turn.read(frames)["turns"]) == 2


def test_a_body_with_no_neck_reads_its_head_and_chest():
    """A hood widening down to the shoulders has no neck narrower than the head: the narrowest row is the top of the
    range, the crop holds the head and the chest, and the turn reads as on a body with a neck."""
    from sprite_gen.video import body_turn

    hooded = body_turn.read(_frames(turns=[TURN], hood=True))
    assert hooded["neck"] == round(min(float(f) for f in body_turn.ROWS if f >= body_turn.NECK_RANGE[0]), 2)
    assert len(hooded["turns"]) == 1 and TURN[0] <= hooded["turns"][0]["from"] and hooded["turns"][0]["to"] <= TURN[1]
    assert body_turn.read(_frames(hood=True))["turns"] == []


# --- a piece apart from the body, read by its mass -----------------------------------------------------------------


def _flag(far: bool = False) -> list[Image.Image]:
    """The antenna cut loose over frames 30-39, and a 25 px square flag apart from the walker low on the left over those
    frames and on the right in the still (`far`: at the canvas's edges): over a hundredth of the body, read as its
    own."""
    frames = _frames(part="antenna", cut=range(30, 40))
    for k in [0, *range(30, 40)]:
        y = 40 + round(3 * math.cos(4 * math.pi * k / CYCLE))
        x = (275 if far else 260) if k == 0 else (0 if far else 15)
        ImageDraw.Draw(frames[k]).rectangle((x, y + 100, x + 24, y + 124), fill=(60, 120, 60, 255))
    return frames


def _tail() -> list[Image.Image]:
    from tests.video.test_walk_steps import _side

    return [_side(k, cycle=29, tail_cycle=45, tail=60, arms=False) for k in range(FRAMES)]


SHORT = (33, 40)
WHISKER = dict(part="whisker", cut=range(30, 40))
NAMED = [  # (id, read as, the frames a turn lies inside, the clip): a fleck, a part cut loose, a thin part of its own
    ("plain-steady", "none", None, lambda: _frames()),
    ("plain-turning-30-40", "turn", TURN, lambda: _frames(turns=[TURN])),
    ("plain-short-33-40", "turn", SHORT, lambda: _frames(turns=[SHORT])),
    ("hold2-turning", "turn", TURN, lambda: _frames(turns=[TURN], hold=2)),
    ("dip-3-frames", "none", None, lambda: _frames(turns=[(12, 18)])),
    ("dip-4-frames", "turn", (12, 19), lambda: _frames(turns=[(12, 19)])),
    ("hood-steady", "none", None, lambda: _frames(hood=True)),
    ("hood-turning", "turn", TURN, lambda: _frames(turns=[TURN], hood=True)),
    ("square", "unread", None, lambda: _frames(square=True)),
    ("staff-all", "unread", None, lambda: _frames(staff=range(FRAMES))),
    ("pennant-all", "unread", None, lambda: _frames(apart=range(FRAMES))),
    ("side-tail-60-beat45", "none", None, _tail),
    ("fleck3-over-head-30-39", "none", None, lambda: _frames(speck=range(30, 40))),
    ("fleck3-over-head-10-19", "none", None, lambda: _frames(speck=range(10, 20))),
    ("fleck6-near-30-39", "none", None, lambda: _frames(speck=range(30, 40), speck_at=NEAR, speck_side=6)),
    ("fleck6-beside-head-still", "none", None, lambda: _frames(speck=(0,), speck_at=BESIDE, speck_side=6)),
    ("fleck6-beside-head-still-turning", "turn", TURN,
     lambda: _frames(speck=(0,), speck_at=BESIDE, speck_side=6, turns=[TURN])),
    ("fleck3-over-head-30-39-turning", "turn", TURN, lambda: _frames(speck=range(30, 40), turns=[TURN])),
    ("fleck3-where-head-bobs-still", "none", None, lambda: _frames(speck=(0,), speck_xy=(148, 37))),
    ("fleck6-where-head-bobs-10-14", "none", None,
     lambda: _frames(speck=range(10, 15), speck_side=6, speck_xy=(148, 35))),
    ("toes-loose-short-33-40", "turn", SHORT, lambda: _frames(turns=[SHORT], loose="toes")),
    ("tail-loose-turning", "turn", TURN, lambda: _frames(turns=[TURN], loose="tail")),
    ("antenna-cut-30-39", "none", None, lambda: _frames(part="antenna", cut=range(30, 40))),
    ("antenna-cut-30-39+flag25", "none", None, _flag),
    ("antenna-cut-30-39+flag25-farther", "none", None, lambda: _flag(far=True)),
    ("antenna-cut-still", "none", None, lambda: _frames(part="antenna", cut=(0,))),
    ("antenna-cut-0-39", "none", None, lambda: _frames(part="antenna", cut=range(40))),
    ("antenna-joined-still-alone", "none", None, lambda: _frames(part="antenna", cut=range(1, FRAMES))),
    ("antenna-cut-30-39-turning", "turn", TURN, lambda: _frames(part="antenna", cut=range(30, 40), turns=[TURN])),
    ("whisker-cut-30-39", "none", None, lambda: _frames(**WHISKER)),
    ("whisker-joined-still-alone", "none", None, lambda: _frames(part="whisker", cut=range(1, FRAMES))),
    ("whisker-cut-30-39-droop2", "none", None, lambda: _frames(**WHISKER, droop=2)),
    ("ornament-joined-still-alone", "none", None, lambda: _frames(loose="ornament", joined=(0,))),
    ("ornament-cut-30-39", "none", None,
     lambda: _frames(loose="ornament", joined=[k for k in range(FRAMES) if not 30 <= k < 40])),
    ("ornament-loose-steady", "none", None, lambda: _frames(loose="ornament")),
    ("ornament-loose-turning", "turn", TURN, lambda: _frames(loose="ornament", turns=[TURN])),
    ("fleck7-over-head-30-39", "turn", (30, 39), lambda: _frames(speck=range(30, 40), speck_side=7)),
    ("lead8-plain", "none", None, lambda: _frames(lead=8)),
    ("lead8-turning", "turn", TURN, lambda: _frames(lead=8, turns=[TURN])),
    ("lead8-ornament-joined-still", "none", None, lambda: _frames(loose="ornament", joined=(0,), lead=8)),
    ("lead8-ornament-joined-still-turning", "turn", TURN,
     lambda: _frames(loose="ornament", joined=(0,), lead=8, turns=[TURN])),
    ("lead8-antenna-cut-30-39", "none", None, lambda: _frames(lead=8, part="antenna", cut=range(30, 40))),
]


def _outcome(read: dict) -> str:
    return "unread" if not read["read"] else "turn" if read["turns"] else "none"


@pytest.mark.parametrize("expect, inside, clip", [case[1:] for case in NAMED], ids=[case[0] for case in NAMED])
def test_a_piece_apart_from_the_body_moves_no_turn(expect, inside, clip):
    """Each walker reads as drawn: a turn where it turns, inside the frames it turns over, and none where it does not. A
    fleck under a hundredth of the body over the head, near it or beside it, a part of its own cut loose (its toes, a
    tail's tip, an ornament), or a thin part joined to the head and cut loose (an antenna, a whisker) — in some frames,
    in the still alone or in every frame but the still — moves neither the box's top nor the head's centre nor the
    still's torso width, where torso-side-v1, reading the box from its topmost and outermost pixel, read turns the body
    does not make (a 3 px fleck over the head over 10 frames, those frames) or none where it does (an ornament cut loose
    beside the head). A piece apart over a hundredth of the body (a 7 px fleck over the head, 49 px) is the body's own:
    its frames read turned, as torso-side-v1 read them — a limit of the reading, named in docs/video-pipeline.md."""
    from sprite_gen.video import body_turn

    read = body_turn.read(clip())
    assert _outcome(read) == expect, read.get("turns") or read.get("why")
    if expect == "turn":
        assert body_turn.turned(read) <= set(range(inside[0], inside[1] + 1))


@pytest.mark.slow
@pytest.mark.parametrize("part", ["antenna", "whisker"])
def test_a_fleck_and_a_thin_part_cut_loose_over_the_same_frames_read_no_turn(part):
    """The antenna or the whisker cut loose over frames 30-39 and a 3 px fleck over the same frames anywhere along the
    canvas's top (x 119-239 every 4 px, y 0, 2 or 4): no turn at any — each is under a hundredth of the body, and the
    two together too (torso-side-v1, its box topped by whichever is higher, read a turn at 34 of the 186)."""
    from sprite_gen.video import body_turn

    for dy in (0, 2, 4):
        for dx in range(-60, 61, 4):
            read = body_turn.read(_frames(part=part, cut=range(30, 40), speck=range(30, 40), speck_xy=(179 + dx, dy)))
            assert read["read"] and read["turns"] == [], (179 + dx, dy)


FEET = (182, 176)  # under the feet: 13 px right of the farthest a foot swings (x 169), under its lowest row (175)


@pytest.mark.parametrize("side", [3, 6, 7, 10])
def test_a_piece_apart_under_the_feet_in_some_frames_reads_no_turn(side):
    """The box's bottom is its last solid row, not a hundredth of the body up (the one end the mass does not set: the
    legs crossing each stride lay their pixels over each other, and a bottom read by mass rises with them, the crop's
    rows with it). A piece apart under the feet over frames 30-39 — 3 to 10 px square, 1 to 45 px under the lowest the
    feet step — runs the box down to it in those frames: no turn reads, under a hundredth of the body or over it."""
    from sprite_gen.video import body_turn

    for gap in (0, 5, 11, 12, 19, 29, 44):
        read = body_turn.read(_frames(speck=range(30, 40), speck_side=side, speck_xy=(FEET[0], FEET[1] + gap)))
        assert read["read"] and read["turns"] == [], gap


def test_the_box_tops_at_a_hundredth_of_the_body(monkeypatch):
    """MASS_SHARE, the speck bound of sprite_gen/video/frames.py (SPECK_MIN_FRACTION): the box tops at the row with a
    hundredth of the frame's solid pixels over it. A 6 px fleck over the head over frames 30-39 (36 px, under a
    hundredth of the walker) does not top the box there, and no turn reads; a 7 px one (49 px, over it) tops it, its
    frames read turned. Under the bound (0.005) the antenna over the head (31 px, 0.008 of the walker) tops the box 12
    rows over the head and the walk reads a turn every stride; over it (0.0125) the 7 px fleck is under it, and its
    frames read no turn."""
    from sprite_gen.video import body_turn
    from sprite_gen.video.frames import SPECK_MIN_FRACTION

    assert body_turn.MASS_SHARE == SPECK_MIN_FRACTION == 0.01
    six, seven = _frames(speck=range(30, 40), speck_side=6), _frames(speck=range(30, 40), speck_side=7)
    antenna = _frames(part="antenna", cut=range(30, 40))
    walker = sum(_frames()[0].getchannel("A").histogram()[body_turn.SOLID:])
    assert 36 < body_turn.MASS_SHARE * walker < 49
    assert body_turn.read(six)["turns"] == [] and body_turn.read(antenna)["turns"] == []
    assert [(t["from"], t["to"]) for t in body_turn.read(seven)["turns"]] == [(30, 39)]
    monkeypatch.setattr(body_turn, "MASS_SHARE", 0.005)
    assert len(body_turn.read(antenna)["turns"]) == 3
    monkeypatch.setattr(body_turn, "MASS_SHARE", 0.0125)
    assert body_turn.read(seven)["turns"] == []


def test_the_heads_centre_is_read_on_its_fullest_columns(monkeypatch):
    """HEAD_CORE: the head's centre is the middle of the head band's columns holding at least half the fullest one's
    pixels. Of the head band's 19 rows, a 6 px fleck beside the head in the still alone (in the head's rows, not over
    them) holds 6 in each of its columns and an ornament cut loose beside it 7: under half a head column, they move no
    centre. Read on columns of 0.3 of the fullest, the fleck's count, and the still's centre moves 1.5 px; on 0.35, the
    ornament's, 0.9 px. Under TOL either way, the walk reads as it reads (no turn; the ornament's turn): each frame is
    read against the still at its best within TOL px of its centre."""
    from sprite_gen.video import body_turn

    assert body_turn.HEAD_CORE == 0.5
    centre = body_turn._body(_walker(0))[3]
    fleck = _frames(speck=(0,), speck_at=BESIDE, speck_side=6)
    ornament = _frames(loose="ornament", turns=[TURN])
    assert body_turn._body(fleck[0])[3] == centre == body_turn._body(ornament[0])[3]
    assert body_turn.read(fleck)["turns"] == [] and len(body_turn.read(ornament)["turns"]) == 1
    monkeypatch.setattr(body_turn, "HEAD_CORE", 0.3)
    assert body_turn.read(fleck)["turns"] == [] and 1 < body_turn._body(fleck[0])[3] - centre < body_turn.TOL
    monkeypatch.setattr(body_turn, "HEAD_CORE", 0.35)
    assert len(body_turn.read(ornament)["turns"]) == 1 and 0 < body_turn._body(ornament[0])[3] - centre < body_turn.TOL


# --- the crop about the head's axis, the still at its best about it ------------------------------------------------


def _grey(frame: Image.Image) -> Image.Image:
    """The frame's silhouette alone: every pixel one grey, its alpha kept."""
    grey = Image.new("RGBA", frame.size, (128, 128, 128, 0))
    grey.putalpha(frame.getchannel("A"))
    return grey


def _beside(frames: list[Image.Image], at, size: tuple[int, int], gap: int = 6) -> list[Image.Image]:
    """A piece `size` (w, h) px right of the head, `gap` px from its edge (x 163) and 2 rows under its top, in the
    frames `at` — 6 px apart, BESIDE's place."""
    for k in at:
        top = 40 + round(3 * math.cos(4 * math.pi * k / CYCLE))
        x, y = 164 + gap, top + BESIDE[1]
        ImageDraw.Draw(frames[k]).rectangle((x, y, x + size[0] - 1, y + size[1] - 1), fill=(250, 220, 90, 255))
    return frames


def _moved(monkeypatch, frames: list[Image.Image], still: float = 0.0, rest: float = 0.0) -> None:
    """The still's head centre read `still` px right of where it is read, every other frame's `rest` px."""
    from sprite_gen.video import body_turn

    real = body_turn._body

    def moved(frame):
        body = real(frame)
        return (*body[:3], body[3] + (still if frame is frames[0] else rest))

    monkeypatch.setattr(body_turn, "_body", moved)


def test_a_body_that_is_its_own_mirror_crops_as_its_own_mirror():
    """The walker's silhouette is its own mirror about the middle of its head's centre column (the head x 137-163, the
    column 150), its side drawn in tone alone. Cropped about that axis, the box's edges where they fall, the still's
    head and shoulders and its torso, every pixel one grey, are their own mirror. torso-side-v1 rounded each edge of the
    box to a whole pixel and mirrored the crop about the box's middle, the column's edge, half a pixel off the axis: one
    grey, the head and shoulders lay 0.050 off their mirror and the torso 0.028, a side the still does not show (in its
    own tones, the still read 0.146 off its mirror, 0.102 about the axis)."""
    from sprite_gen.video import body_turn

    still = _grey(_walker(0))
    body = body_turn._body(still)
    assert body[3] == 150.0
    for rows in (body_turn.UPPER, body_turn.torso_rows(body_turn.neck(body))):
        v, m, _ = body_turn._crop(still, body, rows)
        assert 1 - float(v @ m) < 1e-6, rows
    assert 0.1 < body_turn.read(_frames())["still_side"] < 0.11


def test_a_still_read_off_its_heads_centre_reads_the_walk_as_it_is(monkeypatch):
    """TOL and STEP: each frame is read against the still and against the still's mirror, each at its best of the crops
    about every axis within 2 px of the still's head's centre, a quarter of a pixel apart. The walker with its still's
    centre read up to a pixel either way of where it is (as a piece beside the head moves it) reads no turn, no frame's
    side 0.07 from where it reads with the still read at its centre. torso-side-v1, reading about the centre alone, its
    box's edges whole pixels, read the walk turned every stride with the still's centre 0.75 px right (least -0.06)."""
    from sprite_gen.video import body_turn

    frames = _frames()
    plain = body_turn.read(frames)["side"]
    for dc in (-1.0, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1.0):
        with monkeypatch.context() as m:
            _moved(m, frames, still=dc)
            read = body_turn.read(frames)
        assert read["read"] and read["turns"] == [], dc
        assert max(abs(a - b) for a, b in zip(read["side"], plain)) < 0.07, dc


@pytest.mark.parametrize("drawn, at, size",
                         [({}, (0,), (6, 6)), ({}, (0,), (3, 12)), ({"lead": 8}, range(30, 40), (3, 12))],
                         ids=["6x6-in-the-still", "3x12-in-the-still", "3x12-over-30-39-lead-in"])
def test_a_piece_beside_the_head_that_moves_its_centre_moves_no_turn(drawn, at, size):
    """36 px BESIDE the head, 6 px right of it and 2 rows under its top — a 6x6 near-square, or a column 3 wide and 12
    tall — in the still alone, or over frames 30-39 of the walker filmed from 0.6 of its size for 8 frames: under a
    hundredth of the walker. Each of the column's columns holds 12 of the head band's 19 rows, over HEAD_CORE's half,
    and moves the head's centre 1.4 px right; read at its best within TOL px, the walk reads no turn, and the walker
    turning over frames 30-40 reads its turn there. torso-side-v1, reading about the centre alone, read the walk with
    either piece in the still turned over frames 1-72 (least -0.14), and with the column over frames 30-39 of the
    lead-in walker turned there (least -0.18)."""
    from sprite_gen.video import body_turn

    read = body_turn.read(_beside(_frames(**drawn), at, size))
    assert read["read"] and read["turns"] == []
    (turn,) = body_turn.read(_beside(_frames(turns=[TURN], **drawn), at, size))["turns"]
    assert TURN[0] <= turn["from"] and turn["to"] <= TURN[1]


def test_a_still_is_read_where_its_head_and_shoulders_lie_0_08_off_their_mirror():
    """SIDE_SHOWN_MIN 0.08, between the stills the synthetic walkers are read by and those seen square: the hooded
    walker's head and shoulders lie 0.090 off their mirror at their best within GUARD px of the head's centre, the
    walker filmed from 0.6 of its size for 8 frames 0.098, the plain walker 0.102; the walker seen square from behind
    0.0002, and with a 36 px piece beside its head in the still alone (a column 3 or 2 wide, a 6x6 near-square, against
    the head or 6 px from it) 0.060 at most — not read, where a front or back walk with a piece beside the head in its
    still, read, reads its walk against the side the piece shows."""
    from sprite_gen.video import body_turn

    for drawn in ({"hood": True}, {"lead": 8}, {}):
        read = body_turn.read(_frames(**drawn))
        assert read["read"] and 0.08 < read["still_side"] < 0.11, drawn
    assert body_turn.SIDE_SHOWN_MIN == 0.08
    sides = []
    for size in ((3, 12), (2, 18), (6, 6)):
        for gap in (0, 6):
            read = body_turn.read(_beside(_frames(square=True), (0,), size, gap))
            assert read["read"] is False and "square" in read["why"], (size, gap)
            sides.append(read["still_side"])
    assert 0.05 < max(sides) < 0.07


def test_the_stills_side_is_read_about_its_nearest_mirror(monkeypatch):
    """GUARD and STEP: the still's head and shoulders are read against their mirror about every axis within 2.5 px of
    the head's centre, a quarter of a pixel apart, and their side is the least of them. The column 3 wide and 12 tall
    6 px right of the head in the still of the walker seen square moves its centre 1.4 px; about its nearest mirror the
    still lies 0.060 off it, under SIDE_SHOWN_MIN, and the walk is not read (torso-side-v1, about the centre the column
    moved, read it 0.199 off its mirror, and turns). About the axes within 2 px (GUARD 2), or a pixel apart (STEP 1), it
    lies 0.093 off its mirror; with SIDE_SHOWN_MIN under its 0.060 (0.06), the still is read too. Its walk lies as near
    the still's mirror as the still (0.000 at the median), under WALK_SIDE_MIN, and is not read; with WALK_SIDE_MIN at
    0 as well, read, it reads turns it does not make. Over the hooded walker's 0.090 (0.095), the hooded walker is not
    read."""
    from sprite_gen.video import body_turn

    square = _beside(_frames(square=True), (0,), (3, 12))
    read = body_turn.read(square)
    assert read["read"] is False and 0.055 < read["still_side"] < body_turn.SIDE_SHOWN_MIN
    assert (body_turn.GUARD, body_turn.STEP) == (2.5, 0.25)
    for bound, value in (("GUARD", 2.0), ("STEP", 1.0), ("SIDE_SHOWN_MIN", 0.06)):
        with monkeypatch.context() as m:
            m.setattr(body_turn, bound, value)
            read = body_turn.read(square)
            assert read["read"] is False and read["still_side"] >= body_turn.SIDE_SHOWN_MIN, bound
            assert abs(read["walk_side"]) < 0.005 and read["why"].startswith("the walk is seen square"), bound
            m.setattr(body_turn, "WALK_SIDE_MIN", 0.0)
            read = body_turn.read(square)
        assert read["read"] and read["turns"], bound
    monkeypatch.setattr(body_turn, "SIDE_SHOWN_MIN", 0.095)
    assert body_turn.read(_frames(hood=True))["read"] is False


@pytest.mark.parametrize("taken, piece", [(6, None), (3, None), (9, None), (1, (6, 6)), (2, (3, 12)), (11, (2, 18))],
                         ids=["half-a-stride-on", "3-frames-on", "9-frames-on", "1-frame-on-6x6-beside",
                              "2-frames-on-3x12-beside", "11-frames-on-2x18-beside"])
def test_a_square_walk_whose_still_shows_a_side_is_not_read(monkeypatch, taken, piece):
    """WALK_SIDE_MIN: the walker seen square from behind, its still taken `taken` frames into its stride (half a stride
    on, the arms swung furthest apart), alone or with a 36 px piece beside its head in the still: its still lies 0.096
    to 0.148 off its mirror, over SIDE_SHOWN_MIN, and read against it the walk reads a turn every stride, each frame's
    mirror a frame of the walk half a stride on (e54dc9c read the walker taken 6 frames on turned over frames 7-17,
    31-41 and 55-65). Its walk's head and shoulders lie as near the still's mirror as the still, 0.000 at the median,
    under WALK_SIDE_MIN: not read, and cut as the search alone cuts it."""
    from sprite_gen.video import body_turn

    frames = [_walker(k + taken, square=True) for k in range(FRAMES)]
    if piece:
        frames = _beside(frames, (0,), piece)
    read = body_turn.read(frames)
    assert read["still_side"] >= body_turn.SIDE_SHOWN_MIN
    assert read["read"] is False and read["turns"] == [] and abs(read["walk_side"]) < 0.005
    assert read["why"].startswith("the walk is seen square: its frames' head and shoulders lie ")
    monkeypatch.setattr(body_turn, "WALK_SIDE_MIN", 0.0)
    assert len(body_turn.read(frames)["turns"]) == 3


@pytest.mark.parametrize("taken, hold, piece", [(6, (3, 1), None), (6, (3, 1), (6, 6)), (3, (1, 3), None),
                                                (9, (4, 1), None), (2, (2, 1), (3, 12)), (11, (1, 4), (2, 18))],
                         ids=["half-a-stride-on-held-3-1", "half-a-stride-on-held-3-1-6x6-beside",
                              "3-frames-on-held-1-3", "9-frames-on-held-4-1", "2-frames-on-held-2-1-3x12-beside",
                              "11-frames-on-held-1-4-2x18-beside"])
def test_a_square_walk_held_longer_over_half_its_stride_is_not_read(monkeypatch, taken, hold, piece):
    """The walk's side is the median of its drawings, not of the time the clip gives each: the walker seen square from
    behind whose still shows a side, each drawing of one half of its stride held longer than each of the other's (half
    a stride on, held three frames and one, 147 frames; alone or with a 36 px piece beside its head in the still, its
    still 0.148 or 0.200 off its mirror). Each frame of one half lies as near the still's mirror as its frame half a
    stride on lies near the still, and the frames of the half held longer are 3 in 4 of the clip: at the median of its
    frames the walk lay 0.075 nearer the still's side (0.074 with the piece), and it was read, and the other half read
    turned, over frames 19-29, 67-77 and 115-125. Each frame that is the frame before it held is counted once, and the
    walk lies where it lies drawn on ones (the same drawings; with the piece, one frame more: the still held, without
    it), as near the still's mirror as the still: not read, with the warning line, and with WALK_SIDE_MIN at 0, read, it
    reads the turns it does not make."""
    from sprite_gen.video import body_turn

    def drawn(hold):
        frames = _held(taken, hold, square=True)
        return _beside(frames, (0,), piece) if piece else frames

    read = body_turn.read(drawn(hold))
    ones = body_turn.read(drawn((1, 1)))
    assert read["still_side"] >= body_turn.SIDE_SHOWN_MIN
    assert read["read"] is False and read["turns"] == [] and abs(read["walk_side"]) < 0.005
    if piece:
        assert abs(read["walk_side"] - ones["walk_side"]) < 0.002
    else:
        assert read["walk_side"] == ones["walk_side"]
    assert read["why"].startswith("the walk is seen square") and "or to its mirror" in body_turn.square(read)
    monkeypatch.setattr(body_turn, "WALK_SIDE_MIN", 0.0)
    assert len(body_turn.read(drawn(hold))["turns"]) >= 2


@pytest.mark.parametrize("drawn, hold", [({}, (3, 1)), ({"hood": True}, (1, 3)), ({"turns": [TURN]}, (3, 1)),
                                         ({"turns": [TURN]}, (1, 4)), ({"turns": [TURN], "hood": True}, (4, 1))],
                         ids=["plain-held-3-1", "hood-held-1-3", "turning-held-3-1", "turning-held-1-4",
                              "hood-turning-held-4-1"])
def test_a_walk_seen_at_an_angle_held_longer_over_half_its_stride_reads_as_on_ones(drawn, hold):
    """The walker seen at an angle, turning over drawings 30-40 or not, each drawing of one half of its stride held
    longer than each of the other's: each drawing counted once, its walk lies where it lies drawn on ones, and it reads
    its turn over the frames that hold the drawings it turns over, and none where it does not turn."""
    from sprite_gen.video import body_turn

    drawing = [k for k in range(FRAMES) for _ in range(hold[0] if k % CYCLE < CYCLE // 2 else hold[1])]
    read = body_turn.read(_held(0, hold, **drawn))
    ones = body_turn.read(_frames(**drawn))
    assert read["read"] and read["walk_side"] == ones["walk_side"]
    assert len(read["turns"]) == len(ones["turns"]) == (1 if "turns" in drawn else 0)
    for turn in read["turns"]:
        assert TURN[0] <= drawing[turn["from"]] and drawing[turn["to"]] <= TURN[1]


@pytest.mark.parametrize("piece", [None, (6, 6)], ids=["alone", "6x6-beside"])
def test_a_held_frame_with_noise_over_it_holds_the_drawing_last_counted(monkeypatch, piece):
    """HELD_MAX: a frame holds the drawing last counted where under 0.5 % of that drawing's solid pixels flip in it,
    not only where it is the same pixels, for a clip comes to the reading through a codec and the key, which leave
    hardly a held frame as it was. The square walker taken half a stride on, each drawing of the first half of its
    stride held 3 frames and each of the second 1, alone or with a 36 px piece beside its head in the still, each held
    frame with 6 of its edge pixels cleared (under 0.2 % of its solid pixels): each drawing counted once, its walk lies
    where it lies held without the noise, as on ones, and it is not read. Counted wherever not the same pixels
    (HELD_MAX at 0: every frame, as the clip plays it), the walk lies 0.075 off and the clip is read, with the turns it
    does not make."""
    from sprite_gen.video import body_turn

    def drawn():
        frames = _held(6, (3, 1), square=True)
        return _beside(frames, (0,), piece) if piece else frames

    clean = body_turn.read(drawn())
    noisy = _flecked(drawn(), 6)
    read = body_turn.read(noisy)
    assert body_turn.HELD_MAX == 0.005
    assert read["read"] is False and read["turns"] == [] and read["walk_side"] == clean["walk_side"]
    assert abs(read["walk_side"]) < 0.005 and read["why"].startswith("the walk is seen square")
    monkeypatch.setattr(body_turn, "HELD_MAX", 0.0)
    read = body_turn.read(noisy)
    assert read["read"] and read["walk_side"] >= body_turn.WALK_SIDE_MIN and len(read["turns"]) >= 2


def test_a_walk_seen_at_an_angle_held_with_noise_over_its_held_frames_reads_its_turn():
    """The walker seen at an angle turning over drawings 30-40, each drawing of the first half of its stride held 3
    frames and each of the second 1, each held frame with 6 of its edge pixels cleared: its walk lies where it lies held
    without the noise, and it reads its turn over the frames that hold the drawings it turns over."""
    from sprite_gen.video import body_turn

    drawing = [k for k in range(FRAMES) for _ in range(3 if k % CYCLE < CYCLE // 2 else 1)]
    clean = body_turn.read(_held(0, (3, 1), turns=[TURN]))
    read = body_turn.read(_flecked(_held(0, (3, 1), turns=[TURN]), 6))
    assert read["read"] and read["walk_side"] == clean["walk_side"]
    (turn,) = read["turns"]
    assert TURN[0] <= drawing[turn["from"]] and drawing[turn["to"]] <= TURN[1]


@pytest.mark.parametrize("square", [True, False], ids=["square", "plain"])
def test_a_walk_whose_every_frame_flips_under_held_max_of_the_one_before_is_read_by_its_drawings(square):
    """HELD_MAX is held against the drawing last counted, not the frame before: a large or slow body can flip under
    0.5 % of its solid pixels from each frame to the next, and held against the frame before, no frame of its walk was
    counted, and it was read with no walk's side to hold it. The walker over one stride, each drawing reached from the
    one before over frames that each flip under 0.4 % of the frame before's solid pixels, is counted each time it has
    moved HELD_MAX from the drawing last counted: seen square from behind, taken 6 frames into its stride (its still a
    side its walk does not show), its walk lies under WALK_SIDE_MIN and it is not read; seen at an angle, its walk lies
    over WALK_SIDE_MIN and it is read."""
    from sprite_gen.video import body_turn

    taken = 6 if square else 0
    frames = _stepped([_walker(k, square=square) for k in range(taken, taken + CYCLE + 1)])
    solid = [np.asarray(f.getchannel("A")) >= body_turn.SOLID for f in frames]
    assert all((a ^ b).sum() < body_turn.HELD_MAX * a.sum() for a, b in zip(solid, solid[1:]))
    read = body_turn.read(frames)
    if square:
        assert read["still_side"] >= body_turn.SIDE_SHOWN_MIN
        assert read["read"] is False and read["turns"] == [] and abs(read["walk_side"]) < body_turn.WALK_SIDE_MIN
        assert read["why"].startswith("the walk is seen square")
    else:
        assert read["read"] and read["walk_side"] >= body_turn.WALK_SIDE_MIN


@pytest.mark.slow
def test_a_held_walk_through_the_codec_and_the_key_reads_as_drawn(tmp_path):
    """The held walkers through the path a clip takes (`_coded`: libx264 at its own crf 23 and `video-frames`' key),
    which leaves hardly a held frame the same pixels as the frame before: the square walker taken half a stride on, each
    drawing of the first half of its stride held 3 frames and each of the second 1, lies under 0.02 off at the median of
    its drawings and is not read (counted wherever not the same pixels, 0.078, and read with turns over frames 19-29,
    67-77 and 115-125); the walker seen at an angle turning over drawings 30-40, held the same way, reads its turn over
    the frames that hold them."""
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg required")
    from sprite_gen.video import body_turn

    square = _coded(_held(6, (3, 1), square=True), tmp_path / "square")
    assert len(square) == 147
    read = body_turn.read(square)
    assert read["read"] is False and abs(read["walk_side"]) < 0.02 and read["turns"] == []
    drawing = [k for k in range(FRAMES) for _ in range(3 if k % CYCLE < CYCLE // 2 else 1)]
    read = body_turn.read(_coded(_held(0, (3, 1), turns=[TURN]), tmp_path / "turning"))
    assert read["read"] and read["walk_side"] > 0.08
    (turn,) = read["turns"]
    assert TURN[0] <= drawing[turn["from"]] and drawing[turn["to"]] <= TURN[1]


def test_a_walk_is_read_where_its_head_and_shoulders_lie_0_045_nearer_either_side():
    """WALK_SIDE_MIN 0.045, between the synthetic walks seen at an angle, their frames' head and shoulders 0.07 nearer
    the still's than their mirror at the median or more (the side walker with a 60 px tail on a beat of its own 0.072;
    the hooded walker turning over frames 30-40 0.086, the plain walker 0.101), and those seen square whose still shows
    a side, 0.000."""
    from sprite_gen.video import body_turn

    assert body_turn.WALK_SIDE_MIN == 0.045
    for drawn in ({}, {"hood": True}, {"lead": 8}, {"turns": [TURN]}, {"turns": [TURN], "hood": True},
                  {"every": (6, 8)}, {"turns": [TURN], "hold": 2}):
        read = body_turn.read(_frames(**drawn))
        assert read["read"] and 0.08 < read["walk_side"] < 0.11, drawn
    read = body_turn.read(_tail())
    assert read["read"] and 0.07 < read["walk_side"] < 0.075
    for taken in (3, 6, 9):
        read = body_turn.read([_walker(k + taken, square=True) for k in range(FRAMES)])
        assert read["read"] is False and abs(read["walk_side"]) < 0.005, taken


@pytest.mark.parametrize("turns, walk, turned", [((18, 53), "read", (20, 51)), ((16, 55), "not read", None),
                                                 ((14, 57), "read", (16, 55))],
                         ids=["36-of-73", "40-of-73", "44-of-73"])
def test_a_walk_turned_over_about_half_its_frames_is_not_read(turns, walk, turned):
    """The walker turned to its mirror over 36 of its 73 frames lies nearer the still's side at the median, over 44
    past its mirror's (walk_side under 0): each is read, its turn with it, and no warning. Over 40, half its frames on
    either side, it lies as near the still's mirror as the still, as a square walk does, and is not read — a limit of
    the reading, named in docs/video-pipeline.md (e54dc9c read its turn over frames 18-53) — with the warning line
    (`square`), as the walker turned over 15 frames of each 24-frame cycle is."""
    from sprite_gen.video import body_turn

    read = body_turn.read(_frames(turns=[turns]))
    if walk == "read":
        assert read["read"] and abs(read["walk_side"]) >= body_turn.WALK_SIDE_MIN
        assert [(t["from"], t["to"]) for t in read["turns"]] == [turned]
        assert (read["walk_side"] < 0) == (turns[1] - turns[0] + 1 > FRAMES / 2)
        assert body_turn.square(read) is None
    else:
        assert read["read"] is False and abs(read["walk_side"]) < 0.005 and read["turns"] == []
        assert "or to its mirror" in body_turn.square(read)
        every = body_turn.read(_frames(every=(8, 15)))
        assert every["read"] is False and abs(every["walk_side"]) < 0.005 and body_turn.square(every)


def test_each_frame_is_read_at_its_best_within_tol(monkeypatch):
    """TOL: each frame is read against the still and its mirror at their best within 2 px of the still's head's centre.
    The column 3 wide and 12 tall beside the head over frames 30-39 of the walker filmed from 0.6 of its size for 8
    frames moves those frames' centres 1.4 px: read about the still's centre alone (TOL 0), they read turned. The side
    walker with the 60 px tail (tests/video/test_walk_steps.py, the half step), its arms drawn: a 36 px column against
    its head moves its centre 2.3 px. With every frame's centre read 3 px left of its own, the walk reads no turn; read
    within 1 px of the still's centre, it reads a turn with them 2.25 px off."""
    from sprite_gen.video import body_turn
    from tests.video.test_walk_steps import _side

    lead = _beside(_frames(lead=8), range(30, 40), (3, 12))
    assert body_turn.read(lead)["turns"] == []
    assert body_turn.TOL == 2.0
    with monkeypatch.context() as m:
        m.setattr(body_turn, "TOL", 0.0)
        assert [(t["from"], t["to"]) for t in body_turn.read(lead)["turns"]] == [(30, 39)]
    arms = [_side(k, cycle=29, tail_cycle=45, tail=60) for k in range(FRAMES)]
    with monkeypatch.context() as m:
        _moved(m, arms, rest=-3.0)
        assert body_turn.read(arms)["turns"] == []
    with monkeypatch.context() as m:
        _moved(m, arms, rest=-2.25)
        m.setattr(body_turn, "TOL", 1.0)
        assert body_turn.read(arms)["turns"]


# --- what the reading cannot read ----------------------------------------------------------------------------------


def _gone(read: dict) -> list[int]:
    return [k for k, v in enumerate(read["side"]) if v is None]


def test_a_prop_as_high_as_the_head_and_apart_from_it_leaves_the_still_unread():
    """HEAD_REACH, where nothing lies within it: a staff held beside the walker, its ornament as high as the head and as
    heavy in the top 15 % of the body, puts the middle of those rows between the two, no pixel within 0.3 of the body's
    height of it. The top does not tell which is the head, and the still is not read — not centred on the middle no
    pixel holds (0/0), nor on the larger part (the two weigh the same)."""
    from sprite_gen.video import body_turn

    read = body_turn.read(_frames(staff=range(FRAMES)))
    assert read["read"] is False and read["still_side"] is None and read["turns"] == []
    assert read["why"].startswith("the clip's first frame has no head to centre on: the top 15 % of its body holds "
                                  "parts apart, none within 0.3 of its height of their middle")


def test_a_frame_with_no_head_to_centre_on_is_not_read_and_the_rest_read_as_before():
    """The staff over frames 20-29 only, and frame 40 a sliver of 2 pixels (too small a body for a pixel to lie within
    reach of their middle): those frames are None, `unread` says why, and every other frame reads what it reads without
    them."""
    from sprite_gen.video import body_turn

    frames = _frames(staff=range(20, 30))
    frames[40] = _speck(2)
    read, plain = body_turn.read(frames), body_turn.read(_frames())
    gone = [*range(20, 30), 40]
    assert read["read"] and read["turns"] == [] and _gone(read) == gone
    assert all(read["side"][k] == plain["side"][k] for k in range(FRAMES) if k not in gone)
    (unread,) = read["unread"]
    assert unread["frames"] == gone and unread["why"].startswith("has no head to centre on")


def test_a_still_whose_torso_rows_hold_no_pixel_is_not_read():
    """A pennant apart above the walker tops the still's box, 240 px over its head: the narrowest row in NECK_RANGE is
    the gap's first, and the torso's rows, from there down half the box, hold no solid pixel. No width is measured
    across them; the still is not read."""
    from sprite_gen.video import body_turn

    read = body_turn.read(_frames(apart=range(FRAMES)))
    assert read["read"] is False and read["neck"] == 0.11 and read["turns"] == []
    assert read["why"].startswith("the clip's first frame has no solid pixel in its rows 0.11-")


def test_a_frame_whose_torso_crop_holds_nothing_is_not_read_as_0():
    """The pennant over frames 20-29 only: those frames' boxes run from it, and their torso crops, the still's rows of a
    box three times the body's height, hold nothing — read, they were a torso at 0, as near the still as its mirror.
    They are None, `unread` says why, and every other frame reads what it reads without them."""
    from sprite_gen.video import body_turn

    read, plain = body_turn.read(_frames(apart=range(20, 30))), body_turn.read(_frames(apart=()))
    gone = list(range(20, 30))
    assert read["read"] and _gone(read) == gone
    assert all(read["side"][k] == plain["side"][k] for k in range(FRAMES) if k not in gone)
    (unread,) = read["unread"]
    assert unread["frames"] == gone and unread["why"].startswith("has nothing to read in its crop of rows")


def test_a_crop_of_no_width_is_not_read():
    """A still whose torso's rows hold one column, under its head's centre (a head on a pole): its torso is 0 wide and
    the still is not read. A frame of one solid pixel, its crop as wide as the still's torso but over a body 1 pixel
    high, crops no column either: it is None."""
    from sprite_gen.video import body_turn

    pole = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(pole)
    d.rectangle((140, 100, 149, 120), fill=(0, 0, 0, 255))
    d.rectangle((150, 100, 160, 120), fill=(255, 255, 255, 255))
    d.line((150, 121, 150, 220), fill=(255, 255, 255, 255))
    read = body_turn.read([pole] * 8)
    assert read["read"] is False and read["still_side"] >= body_turn.SIDE_SHOWN_MIN
    assert read["why"].startswith("the clip's first frame has a crop of no width over its rows")
    frames = _frames()
    frames[40] = _speck(1)
    read = body_turn.read(frames)
    assert read["read"] and _gone(read) == [40] and read["unread"][0]["why"].startswith("has a crop of no width")


def test_a_clip_with_no_frames_is_not_read():
    from sprite_gen.video import body_turn

    read = body_turn.read([])
    assert read["read"] is False and read["why"] == "the clip has no frames" and read["turns"] == []


# --- the cut -------------------------------------------------------------------------------------------------------


@pytest.mark.slow
@pytest.mark.parametrize("turned", [(14, 24), (24, 34), TURN], ids=["14-24", "24-34", "30-40"])
def test_a_cut_that_holds_the_turn_gives_way_to_one_that_does_not(tmp_path, monkeypatch, turned):
    """The walker turns over frames 14-24, 24-34 or 30-40: the search took a cut across the turn (11/24, 17/24, 22/24:
    the body swinging round in the loop). Read, the turn's windows are refused and the cut is one that leaves it out."""
    keyed = _keyed(tmp_path, turns=[turned])
    report = _cut(tmp_path / "read", keyed)
    assert not _holds(report, range(*turned))
    turn = report["body_turn"]
    assert turn["verdict"] == "avoided" and turn["refused"] > 0 and turn["cut"]["holds"] == []
    with monkeypatch.context() as m:
        _unread(m)
        before = _cut(tmp_path / "unread", keyed)
    assert _holds(before, range(*turned))  # the cut as the search took it before


@pytest.mark.slow
def test_a_turn_every_cycle_keeps_the_cut_with_a_warning_or_is_refused(tmp_path, monkeypatch, capsys):
    """A walker that turns in every cycle (as a three-quarter walk that turns to the side each stride): no cut leaves
    the turn out. warn keeps the cut the search took before, byte for byte, and a warning line names the turn; refuse
    refuses the clip in a line of its own, before any other."""
    keyed = _keyed(tmp_path, every=(6, 8))
    capsys.readouterr()
    report = _cut(tmp_path / "warn", keyed)
    err = capsys.readouterr().err
    assert "video-loop: warning: the body turns in the walk — " in err and "--body-turn refuse" in err
    assert report["body_turn"]["verdict"] == "kept" and report["body_turn"]["cut"]["holds"]
    with monkeypatch.context() as m:
        _unread(m)
        _cut(tmp_path / "unread", keyed)
    _same_cut(tmp_path / "warn", tmp_path / "unread")
    said, refused = _refused(tmp_path / "refuse", keyed, capsys, "--body-turn", "refuse")
    assert said.startswith("video-loop: the body turns in the walk — its torso faces nearer the still's mirror")
    assert "film it again with the torso and hips kept at the still's angle" in said
    assert refused["body_turn"]["verdict"] == "refused"
    assert capsys.readouterr().err == ""  # the refusal is the first line the run says
    assert not (tmp_path / "refuse" / "loop.strip.png").exists()


@pytest.mark.slow
@pytest.mark.parametrize("drawn", [{}, {"square": True}], ids=["diagonal", "square"])
def test_a_walk_that_does_not_turn_is_cut_as_before(tmp_path, monkeypatch, capsys, drawn):
    """No turn — read and none found, or a square still not read — and the cut is every byte the search alone made;
    no warning line on either (the square still, showing no side, is left unread before its walk is read)."""
    keyed = _keyed(tmp_path, **drawn)
    capsys.readouterr()
    report = _cut(tmp_path / "read", keyed)
    assert report["body_turn"]["verdict"] == ("none" if not drawn else "not-read")
    assert "the walk reads square" not in capsys.readouterr().err
    with monkeypatch.context() as m:
        _unread(m)
        _cut(tmp_path / "unread", keyed)
    _same_cut(tmp_path / "read", tmp_path / "unread")


@pytest.mark.slow
def test_a_walk_turned_to_face_the_camera_and_held_is_cut_as_before_with_a_warning(tmp_path, monkeypatch, capsys):
    """The walker turned to square at frame 24 and held there to the end (49 of its 73 frames, as a side walk that turns
    to face the camera and walks on toward it): its frames lie as near the still's mirror as the still at the median
    (0.006), as a front walk's do with a piece beside the head in its still — the frames alone do not tell the two
    apart, and e54dc9c read this one turned at every stride after frame 27. Not read, it is cut every byte as the search
    alone cuts it, and a warning line says the walk reads square against a still that shows a side, with both
    readings."""
    keyed = _keyed(tmp_path, turns=[(24, 200)], low=0.0)
    capsys.readouterr()
    report = _cut(tmp_path / "read", keyed)
    turn = report["body_turn"]
    assert turn["read"] is False and turn["verdict"] == "not-read" and abs(turn["walk_side"]) < 0.01
    assert turn["why"].startswith("the walk is seen square")
    (line,) = [x for x in capsys.readouterr().err.splitlines() if "the walk reads square" in x]
    assert line.startswith("video-loop: warning: the walk reads square against a still that shows a side (still_side ")
    assert f"still_side {turn['still_side']:.3f}, walk_side {turn['walk_side']:+.3f}," in line
    assert "to face the camera, or to its mirror" in line and line.endswith("check the loop's facing")
    with monkeypatch.context() as m:
        _unread(m)
        _cut(tmp_path / "unread", keyed)
    _same_cut(tmp_path / "read", tmp_path / "unread")


@pytest.mark.slow
@pytest.mark.parametrize("drawn", [{"staff": range(FRAMES)}, {"apart": (0,)}], ids=["staff", "apart"])
def test_a_walk_whose_still_is_not_read_is_cut_as_before(tmp_path, monkeypatch, drawn):
    """warn, the default, where the still cannot be read — the staff's ornament as high as the head (3.3.0 cut it
    11/24; the reading's 0/0 on it ended the run, `cannot convert float NaN to integer`), or the pennant apart above the
    body in the still alone (over every frame, the box's upper half is the empty gap, where the motion anchor finds no
    textured region to follow): the loop is cut, every byte the search alone cuts, and the report says why the clip
    was not read."""
    keyed = _keyed(tmp_path, **drawn)
    report = _cut(tmp_path / "read", keyed)
    turn = report["body_turn"]
    assert turn["read"] is False and turn["verdict"] == "not-read"
    assert turn["why"].startswith("the clip's first frame has ")
    with monkeypatch.context() as m:
        _unread(m)
        _cut(tmp_path / "unread", keyed)
    _same_cut(tmp_path / "read", tmp_path / "unread")


@pytest.mark.slow
def test_a_walk_with_no_cycle_keeps_its_refusal_and_names_the_turn(tmp_path, monkeypatch, capsys):
    """The walker turns and the search finds no cycle with the turn or without it (every window refused, as on a clip
    that holds no repeat; its feet not read). warn refuses it in the words it was refused in before, after a warning line
    naming the turn; refuse names the turn."""
    def nothing(*args, **kwargs):
        raise ValueError("no periodic cycle found — no supported local two-step repeat after drift analysis")

    keyed = _keyed(tmp_path, turns=[TURN])
    monkeypatch.setattr(local_cycle, "detect", nothing)
    with feet_unseen():
        said, report = _refused(tmp_path / "warn", keyed, capsys)
        err = capsys.readouterr().err
        assert said.startswith("video-loop: no periodic cycle found")
        assert report["body_turn"]["verdict"] == "unfound" and "video-loop: warning: the body turns in the walk" in err
        said, report = _refused(tmp_path / "refuse", keyed, capsys, "--body-turn", "refuse")
    assert said.startswith("video-loop: the body turns in the walk") and report["body_turn"]["verdict"] == "refused"


def test_refuse_needs_motion_auto(tmp_path, capsys):
    keyed = _keyed(tmp_path)
    with pytest.raises(SystemExit, match="--body-turn refuse reads the body's turn"):
        loop.main(["--frames-dir", str(keyed), "--out-dir", str(tmp_path / "out"), "--state", "walk", "--body-turn", "refuse"])
