# SPDX-License-Identifier: Apache-2.0
"""`pixel-draw` past four frames, in a style of its own, as one motion: a set of more than four
frames is drawn four at a time, each later call holding the first call's palette and shown the
frames already drawn; `--style` replaces the kind's style sentence in the drawing and the pick
alike (the default prompts stay byte for byte); `--motion` says the frames are one motion and G6
lets a pose change the height and a hold repeat a frame; `--duration-ms` times `anim.gif`. No key,
no network: a fake Claude at the transport seam, and synthetic grids."""
from __future__ import annotations

import io
import json
import math
from pathlib import Path

import pytest
from PIL import Image, ImageSequence

from test_pixel_draw import KEY, asked, claude, draw, pixel_request, reply, report_of  # noqa: F401 (fixture)
from sprite_gen.gen import pixel_draw
from sprite_gen.gen import pixel_grid as pg

INK, GOLD = "#2a1f2e", "#c8a040"
NAMES = tuple(f"f{i}" for i in range(1, 7))


def figure_rows(i: int, size: int = 16) -> list[str]:
    """A 16 px figure on the floor row (columns 5-10, rows 5-15 counted from 1) with a gold mark that
    moves one column a frame, so no two frames are the same."""
    rows = []
    for y in range(size):
        row = ["."] * size
        if 4 <= y <= 14:
            row[5:11] = ["a"] * 6
        if y == 8:
            row[5 + i] = "b"
        rows.append("".join(row))
    return rows


def answer(names, *, extra: str = "", rows: dict[str, list[str]] | None = None) -> str:
    frames = "".join(f"FRAME {n}\n" + "\n".join((rows or {}).get(n) or figure_rows(int(n[1:]) - 1)) + "\n"
                     for n in names)
    return f"```pixels\nPALETTE\n. transparent\na {INK}\nb {GOLD}\n{extra}{frames}END\n```"


def prompt_of(fake, call_id: str) -> str:
    return dict(fake.asked)[call_id]["messages"][0]["content"]


def lantern_spec(tmp_path: Path) -> Path:
    spec = tmp_path / "spec.json"
    spec.write_text(json.dumps({
        "subject": "a guard swinging a lantern", "size": 16, "motion": "one swing of the lantern",
        "frames": list(NAMES[:4]) + [{"name": "f5", "pose": "the lantern at the top of its swing"},
                                     {"name": "f6", "pose": "the lantern coming down"}]}), encoding="utf-8")
    return spec


# ----------------------------------------------------------------------------- more than four frames

def test_more_than_four_frames_are_drawn_four_at_a_time_from_the_frames_before(tmp_path, claude, capsys):
    broken = figure_rows(5)
    broken[8] = broken[8][:12] + "c" + broken[8][13:]  # a colour the first answer did not choose
    fake = claude({"c1-part1-gen1": reply(answer(NAMES[:4])),
                   "c1-part2-gen1": reply(answer(NAMES[4:], extra="c #ff0000\n", rows={"f6": broken})),
                   "c1-part2-gen1-fix1": reply(f"ROW f6 9: {figure_rows(5)[8]}")})
    out = tmp_path / "run"
    assert draw(out, "--spec", str(lantern_spec(tmp_path)), "--candidates", "1") == 0
    assert asked(fake) == ["c1-part1-gen1", "c1-part2-gen1", "c1-part2-gen1-fix1"]

    first, second = prompt_of(fake, "c1-part1-gen1"), prompt_of(fake, "c1-part2-gen1")
    motion = "Motion: the frames, in this order, are one continuous motion: one swing of the lantern"
    assert motion in first and motion in second
    assert "Frames: f1, f2, f3, f4, f5, f6. All frames share one palette" in first
    assert "This is answer 1 of 2: it draws f1, f2, f3, f4 (frames 1-4)." in first
    assert "Frames in this order: f1, f2, f3, f4." in first
    assert "Frames already drawn" not in first and "- f5:" not in first
    assert "This is answer 2 of 2: it draws f5, f6 (frames 5-6)." in second
    assert "Frames in this order: f5, f6." in second
    assert ("What each frame shows:\n- f5: the lantern at the top of its swing\n- f6: the lantern coming down"
            in second)
    assert "write it again exactly as it is" in second and "at most 16 colors" not in second
    drawn = ("```reference\nPALETTE\n. transparent\na #2a1f2e\nb #c8a040\n"
             + "".join(f"FRAME {n}\n" + "\n".join(figure_rows(i)) + "\n" for i, n in enumerate(NAMES[:4]))
             + "END\n```")
    assert drawn in second
    fix = prompt_of(fake, "c1-part2-gen1-fix1")
    assert "Rows to write: f6 9" in fix and "c #ff0000" not in fix and "b #c8a040" in fix

    report = report_of(out)
    (candidate,) = report["candidates"]
    assert candidate["status"] == "passed" and candidate["generations"] == ["c1-part1-gen1", "c1-part2-gen1"]
    assert candidate["parts"] == [{"part": 1, "frames": list(NAMES[:4]), "effort": "high"},
                                  {"part": 2, "frames": list(NAMES[4:]), "effort": "high"}]
    assert {"code": "palette_added", "detail": "c #ff0000"} in candidate["G1"]["recovered"]
    assert candidate["repairs"][0]["rows_asked"] == ["f6 9"] and candidate["repairs"][0]["rows_still_broken"] == []
    assert [c["id"] for c in report["calls"]] == ["c1-part1-gen1", "c1-part2-gen1", "c1-part2-gen1-fix1"]
    assert report["request"]["poses"] == {"f5": "the lantern at the top of its swing", "f6": "the lantern coming down"}
    assert report["request"]["motion"] == "one swing of the lantern" and report["request"]["frames"] == list(NAMES)
    grid, issues = pg.read_grid_text((out / "grid.txt").read_text(encoding="utf-8"))
    assert pg.row_issues(issues) == [] and list(grid.frames) == list(NAMES)
    assert grid.palette == {".": None, "a": INK, "b": GOLD}
    assert grid.frames["f6"] == [list(row) for row in figure_rows(5)]
    with Image.open(out / "anim.gif") as gif:
        assert gif.n_frames == 6
    err = capsys.readouterr().err
    assert "6 frames (at most 64): 2 calls a candidate of at most 4 frames each, 2 drawings in all" in err

    again = claude({})
    assert pixel_draw.main(["--out-dir", str(out), "--resume"]) == 0
    assert again.asked == [] and pg.read_grid_text((out / "grid.txt").read_text(encoding="utf-8"))[0] == grid


def test_a_later_call_shows_the_first_frame_and_the_four_just_before():
    names = tuple(f"f{i}" for i in range(1, 11))
    request = pixel_request(size=16, frames=names, max_tokens=64000)
    drawn, _ = pg.parse_answer(answer(names[:8]), "chargrid", 16, 16, names[:8])
    part = pixel_draw.call_parts(request)[2]
    assert part == pixel_draw.Part(3, 3, ("f9", "f10"))
    prompt = pixel_draw.generation_prompt(request, part, drawn)
    shown = [line[6:] for line in prompt.splitlines() if line.startswith("FRAME f")]
    assert shown == ["f1", "f5", "f6", "f7", "f8"]
    assert "This is answer 3 of 3: it draws f9, f10 (frames 9-10)." in prompt
    assert [p.frames for p in pixel_draw.call_parts(request)] == [names[:4], names[4:8], names[8:]]


def test_a_part_drawn_again_is_drawn_again_on_its_own(tmp_path, claude, capsys):
    fake = claude({"c1-part1-gen1": reply(answer(NAMES[:4])),
                   "c1-part2-gen1": reply("", stop="max_tokens", output=64000, thinking=64000),
                   "c1-part2-gen2": reply(answer(NAMES[4:]))})
    out = tmp_path / "run"
    assert draw(out, "--spec", str(lantern_spec(tmp_path)), "--candidates", "1") == 0
    assert asked(fake) == ["c1-part1-gen1", "c1-part2-gen1", "c1-part2-gen2"]
    assert [body["output_config"]["effort"] for _, body in fake.asked] == ["high", "high", "medium"]
    (candidate,) = report_of(out)["candidates"]
    assert candidate["redraws"] == [{"after": "c1-part2-gen1", "why": "max_tokens", "effort": "medium"}]
    assert [p["effort"] for p in candidate["parts"]] == ["high", "medium"] and candidate["effort"] == "medium"
    assert "drawing c1 part 2 once more at effort medium" in capsys.readouterr().err
    assert prompt_of(fake, "c1-part2-gen2") == prompt_of(fake, "c1-part2-gen1")


def test_a_part_that_fails_ends_its_candidate(tmp_path, claude):
    fake = claude({"c1-part1-gen1": reply(answer(NAMES[:4])), "c1-part2-gen1": reply("no grid"),
                   "c1-part2-gen2": reply("still no grid")})
    with pytest.raises(SystemExit, match=r"c1: G1: no_block"):
        draw(tmp_path / "run", "--spec", str(lantern_spec(tmp_path)), "--candidates", "1")
    assert asked(fake) == ["c1-part1-gen1", "c1-part2-gen1", "c1-part2-gen2"]


def test_batches_draw_each_part_in_its_own_round(tmp_path, claude):
    fake = claude({"c1-part1-gen1": reply(answer(NAMES[:4])), "c1-part2-gen1": reply(answer(NAMES[4:]))})
    out = tmp_path / "run"
    assert draw(out, "--spec", str(lantern_spec(tmp_path)), "--candidates", "1", "--batch") == 0
    assert [[cid for cid, _ in requests] for _, requests in fake.submitted] == [["c1-part1-gen1"], ["c1-part2-gen1"]]
    assert "Frames already drawn" in fake.submitted[1][1][0][1]["messages"][0]["content"]


# The 64-frame limit is checked after the spec/flag split, as for --frames (tests/gen/test_pixel_effect.py).
@pytest.mark.parametrize("frames,message", [
    ([{"name": "a", "pose": ""}, "b"], "a frame is a name or {\"name\": ..., \"pose\": ...}"),
    ([{"name": "a", "pose": "up", "hold": 2}, "b"], "a frame is a name or {\"name\": ..., \"pose\": ...}"),
])
def test_spec_frames_refused(tmp_path, claude, frames, message):
    spec = tmp_path / "spec.json"
    spec.write_text(json.dumps({"subject": "x", "frames": frames}), encoding="utf-8")
    fake = claude({})
    with pytest.raises(SystemExit) as caught:
        draw(tmp_path / "run", "--spec", str(spec))
    assert message in str(caught.value) and fake.asked == []


def test_sixty_four_frames_are_sixteen_calls():
    names = tuple(f"f{i}" for i in range(64))
    assert len(pixel_draw.call_parts(pixel_request(frames=names, max_tokens=64000))) == 16
    effect = pixel_request(kind="effect", frames=tuple(f"e{i}" for i in range(8)))
    assert pixel_draw.call_parts(effect) == [pixel_draw.Part(1, 1, effect.frames)]


# ----------------------------------------------------------------------------- --style

STYLE = "no outline: selective outlining only where a shape meets its own colour, hue-shifted shadows"


# An icon shares the sprite's branch of `generation_prompt`.
@pytest.mark.parametrize("kind,frames", [("sprite", ("sprite",)), ("tile", ("tile",)),
                                         ("effect", ("birth", "peak", "decay", "gone"))])
def test_a_style_replaces_the_kinds_style_sentence_and_keeps_its_structure(kind, frames):
    default = pixel_draw.generation_prompt(pixel_request(kind=kind, frames=frames))
    styled = pixel_draw.generation_prompt(pixel_request(kind=kind, frames=frames, style=STYLE))
    assert f"\nStyle: {STYLE}\n" in styled and styled.count("Style:") == 1
    assert "2D RPG" not in styled and "outline around the silhouette" not in styled
    for line in default.splitlines():
        if not line.startswith("Style:"):
            assert line in styled.splitlines(), line
    if kind == "tile":
        assert "No border or outline around the tile." in styled
    if kind in ("sprite", "icon"):
        assert "Background: transparent." in styled and "Safe area:" in styled


def test_the_pick_judges_craft_against_the_same_style():
    pick = pixel_draw.pick_prompt(pixel_request(frames=("down", "up"), style=STYLE), ["A", "B"])
    craft = next(line for line in pick.splitlines() if line.startswith("- craft"))
    assert STYLE in craft and "outline" not in craft.replace(STYLE, "")
    default = pixel_draw.pick_prompt(pixel_request(frames=("down", "up")), ["A", "B"])
    assert "clean silhouette and outline" in default


def test_a_style_rides_the_request_and_the_report(tmp_path, claude):
    fake = claude({"c1-gen1": reply(answer(("f1",)).replace("FRAME f1", "FRAME sprite"))})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a guard", "--size", "16", "--candidates", "1", "--style", STYLE) == 0
    assert f"Style: {STYLE}" in prompt_of(fake, "c1-gen1")
    assert report_of(out)["request"]["style"] == STYLE
    assert json.loads((out / "request.json").read_text(encoding="utf-8"))["style"] == STYLE


# The prompts as they were before --style, --motion and calls past four frames: a request that
# uses none of them asks the same bytes, so a run started before reads its calls back on --resume.
SPRITE_PROMPT = "\n".join([
    "Draw: a knight",
    "Canvas: exactly 32x32 pixels per frame.",
    "Frames: down, up. All frames share one palette and show the same subject with the same proportions, colors "
    "and size.",
    "Palette: at most 16 colors plus transparent.",
    "Background: transparent.",
    "Safe area: draw the subject's body about the size of the central 26x26 pixels - rows 4-29 and columns 4-29, "
    "counting rows and columns from 1 - inside a 3-pixel margin on every side. That is a target for its average "
    "size, not a wall: when a pose or a detail needs the room (a raised weapon, a long blade, an effect, a wide "
    "stance), it may reach past the safe area into the margin, up to the canvas edge. Keep the four corner pixels "
    "transparent.",
    "Floor: row 29, the bottom row of the safe area, is the ground: the feet (or the lowest point the subject rests "
    "on) stand on row 29 in every frame.",
    "Style: clean, readable pixel art for a 2D RPG: a dark (not pure black) outline around the silhouette, 2-3 "
    "shades per material, light from the top-left, no anti-aliasing noise and no stray single pixels.",
    "",
    "Output format: exactly one fenced code block tagged `pixels`, and nothing after it:",
    "```pixels",
    "PALETTE",
    ". transparent",
    "a #RRGGBB",
    "b #RRGGBB",
    "...",
    "FRAME <frame name>",
    "<32 lines, each exactly 32 characters>",
    "...",
    "END",
    "```",
    "- Each palette line is one key character and one #RRGGBB color. Keys are single characters from a-z, A-Z, "
    "0-9; `.` is always transparent and is never redefined.",
    "- Each frame is exactly 32 lines of exactly 32 characters, every character a palette key, with no spaces.",
    "- Frames in this order: down, up. Write `FRAME <name>` before each frame and `END` once after the last frame.",
])
TILE_PROMPT_HEAD = "\n".join([
    "Draw: grass",
    "Canvas: exactly 32x32 pixels per frame.",
    "Palette: at most 8 colors plus transparent.",
    "This is a tile: fill every pixel (no transparency) and make it repeat seamlessly in a grid, so the left edge "
    "continues into the right edge and the top edge into the bottom edge. No border or outline around the tile.",
    "Style: clean, readable pixel art for a 2D RPG: 2-3 shades per material, light from the top-left, no noisy "
    "single-pixel speckle.",
    "",
    "Output format: exactly one fenced code block tagged `pixels`, and nothing after it:",
])
PICK_PROMPT = "\n".join([
    "You are judging pixel-art game assets for a game asset service.",
    "The image shows 2 candidates labelled A, B for the same request. Each is enlarged with nearest-neighbour "
    "scaling, so every square block is one pixel; the grey checkerboard stands for transparency.",
    "Each candidate is a row of 2 frames in this order: down, up.",
    "The request was: a knight Canvas 32x32 pixels per frame, the body about the size of the central 26x26, inside "
    "a 3-pixel margin a pose may reach into.",
    "Score every candidate:",
    "- subject_read 1-5: how clearly it reads as the requested subject (5 instantly, 1 unrecognisable).",
    "- craft 1-5: pixel-art craft: clean silhouette and outline, consistent shading and light, no noise, sensible "
    "use of the canvas (5 professional, 3 acceptable indie, 1 broken).",
    "- consistency 1-5: the same subject, proportions and colours across frames, and correct poses/directions for "
    "the frame names.",
    "- verdict: ship (usable in a game as is), touch_up (usable after a few pixel fixes), redraw (not usable).",
    "- note: one short sentence naming the main flaw or strength.",
    "Then best: the label of the candidate you would ship; any_shippable: whether at least one is ship or touch_up.",
    "Judge only what is visible.",
])


def test_the_default_prompts_are_byte_for_byte_what_they_were():
    assert pixel_draw.generation_prompt(pixel_request(frames=("down", "up"), max_tokens=64000)) == SPRITE_PROMPT
    tile = pixel_draw.generation_prompt(pixel_request(kind="tile", frames=("tile",), subject="grass",
                                                      palette=pg.palette_rule("free:8")))
    assert tile.startswith(TILE_PROMPT_HEAD + "\n```pixels\n")
    assert pixel_draw.pick_prompt(pixel_request(frames=("down", "up")), ["A", "B"]) == PICK_PROMPT


# ----------------------------------------------------------------------------- --motion and --duration-ms

def test_the_motion_sentence_follows_the_frames_line():
    prompt = pixel_draw.generation_prompt(pixel_request(frames=("a", "b"), motion="a bow"))
    lines = prompt.splitlines()
    assert lines[lines.index(next(l for l in lines if l.startswith("Frames:"))) + 1] == (
        "Motion: the frames, in this order, are one continuous motion: a bow")
    pick = pixel_draw.pick_prompt(pixel_request(frames=("a", "b"), motion="a bow"), ["A", "B"])
    assert "one motion in their order (a bow)" in pick


def swing_grid(count: int = 46, size: int = 48) -> str:
    """A synthetic 48 px figure twirling a blade, one turn over the set: the arm raised above the head
    for frames 11-20, those held for frames 21-24, every other frame its own drawing, the feet on the
    floor row (44 counted from 1) throughout."""
    def frame(i: int) -> list[str]:
        px = [["."] * size for _ in range(size)]
        for y in range(16, 44):
            for x in range(18, 30):
                px[y][x] = "a"
        for y in range(10, 16):
            for x in range(21, 27):
                px[y][x] = "b"
        raised = 11 <= i <= 24
        hand = (6, 31) if raised else (26, 31)
        for y in range(hand[0], hand[0] + 8):
            px[y][30] = px[y][31] = "c"
        angle = 2 * math.pi * (min(i, 20) if 21 <= i <= 24 else i) / count
        for step in range(1, 10):
            y = round(hand[0] - step * math.cos(angle))
            x = round(hand[1] + step * math.sin(angle))
            if 4 <= y <= 43 and 0 <= x < size:
                px[y][x] = "d"
        return ["".join(row) for row in px]

    body = "".join(f"FRAME s{i:02d}\n" + "\n".join(frame(i)) + "\n" for i in range(1, count + 1))
    return "PALETTE\n. transparent\na #3a2f4e\nb #e8b890\nc #d8a880\nd #c0c8d8\n" + body + "END\n"


def test_forty_six_frames_of_one_motion_pass_as_a_grid(tmp_path, capsys):
    grid = tmp_path / "swing.txt"
    grid.write_text(swing_grid(), encoding="utf-8")
    out = tmp_path / "out"
    assert pixel_draw.main(["--grid", str(grid), "--out-dir", str(out), "--motion", "a sword twirl",
                            "--duration-ms", "100"]) == 0
    report = report_of(out)
    assert json.loads(capsys.readouterr().out) == report
    g6 = report["gates"]["G6"]
    assert report["status"] == "ok" and g6["ok"] and g6["rule"] == "motion"
    assert len(set(g6["baselines"].values())) == 1 and g6["resized"] == []
    assert g6["posed"] == [f"s{i:02d}" for i in range(11, 25)]
    assert g6["holds"] == [["s20", "s21"], ["s20", "s22"], ["s20", "s23"], ["s20", "s24"], ["s21", "s22"],
                           ["s21", "s23"], ["s21", "s24"], ["s22", "s23"], ["s22", "s24"], ["s23", "s24"]]
    assert not any(w.startswith("G6") for w in report["warnings"])
    assert [line[:40] for line in report["info"] if line.startswith("G6")] == [
        "G6 the height changes with the pose, not", "G6 frames drawn the same, a hold (inform"]
    assert report["request"]["motion"] == "a sword twirl" and report["request"]["duration_ms"] == 100
    with Image.open(out / "anim.gif") as gif:  # the four frames held are one GIF frame, shown five times as long
        durations = [frame.info["duration"] for frame in ImageSequence.Iterator(gif)]
    assert len(durations) == 42 and sum(durations) == 46 * 100 and durations[19] == 500
    with Image.open(out / report["files"]["preview"]) as preview:
        assert preview.size == (8 * 240 + 7 * 10, 6 * 240 + 5 * 10)  # rows of eight frames
    with pytest.raises(SystemExit, match="fails G6"):
        pixel_draw.main(["--grid", str(grid), "--out-dir", str(tmp_path / "still")])


def test_the_frame_time_is_a_flag_with_its_default_kept(tmp_path):
    grid = tmp_path / "swing.txt"
    grid.write_text(swing_grid(count=4), encoding="utf-8")
    assert pixel_draw.main(["--grid", str(grid), "--out-dir", str(tmp_path / "a"), "--motion", "x"]) == 0
    with Image.open(tmp_path / "a" / "anim.gif") as gif:
        assert gif.info["duration"] == 150
    with pytest.raises(SystemExit, match="--duration-ms is at least 10, got 5"):
        pixel_draw.main(["--grid", str(grid), "--out-dir", str(tmp_path / "b"), "--duration-ms", "5"])
    with pytest.raises(SystemExit, match="--grid checks and renders a grid as it is; drop --style"):
        pixel_draw.main(["--grid", str(grid), "--out-dir", str(tmp_path / "c"), "--style", "x"])


def test_an_effect_strip_takes_the_frame_time(tmp_path):
    rows = "\n".join("." * 8 for _ in range(8))
    spark = "\n".join(("...aa..." if y in (3, 4) else "." * 8) for y in range(8))
    grid = tmp_path / "fx.txt"
    grid.write_text(f"PALETTE\n. transparent\na #ffcc00\nFRAME birth\n{spark}\nFRAME gone\n{rows}\nEND\n",
                    encoding="utf-8")
    out = tmp_path / "out"
    assert pixel_draw.main(["--grid", str(grid), "--kind", "effect", "--out-dir", str(out), "--duration-ms", "80"]) == 0
    meta = json.loads((out / "effect.strip.json").read_text(encoding="utf-8"))
    assert meta["delay_ms"] == 80


# ----------------------------------------------------------------------------- the pick sheet

def test_a_sheet_of_many_frames_fits_what_the_vision_model_reads_unscaled(tmp_path):
    """Forty-six 48 px frames in rows of eight, two candidates: drawn at x5 the sheet is past the
    2576 px long edge and the 4784 patches Claude reads unscaled, so it is drawn at the largest whole
    enlargement that fits - x3 - nearest-neighbour, every pixel still a square block."""
    by_label = {}
    for label, cid in (("A", "c1"), ("B", "c2")):
        (tmp_path / cid).mkdir()
        Image.new("RGBA", (8 * 240 + 7 * 10, 6 * 240 + 5 * 10), (40, 30, 46, 255)).save(tmp_path / cid / "p.png")
        by_label[label] = pixel_draw.Candidate(cid, files={"preview": f"{cid}/p.png"})
    sheet = Image.open(io.BytesIO(pixel_draw.pick_sheet(tmp_path, by_label, tile=False, scale=5)))
    assert sheet.size == (16 + 56 + 8 * 144 + 7 * 6 + 16, 16 + 2 * (6 * 144 + 5 * 6 + 16))
    assert max(sheet.size) <= 2576 and math.ceil(sheet.width / 28) * math.ceil(sheet.height / 28) <= 4784
    small = pixel_draw.pick_sheet(tmp_path, {"A": by_label["A"]}, tile=False, scale=1)
    assert Image.open(io.BytesIO(small)).size == (16 + 56 + 1990 + 16, 16 + 1490 + 16)


def test_the_pick_reads_many_frames_in_rows():
    names = tuple(f"s{i:02d}" for i in range(1, 47))
    pick = pixel_draw.pick_prompt(pixel_request(frames=names, size=48, max_tokens=64000), ["A", "B"])
    assert "Each candidate's 46 frames run left to right in rows of 8, top to bottom, in this order: s01, s02" in pick
