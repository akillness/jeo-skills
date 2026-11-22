# SPDX-License-Identifier: Apache-2.0
"""The pixel grid of `pixel-draw`: both answer formats, the issues G1 tells apart, row splicing,
the canonical grid.txt, the palette rules and the byte-reproducible PNG.

The answers under tests/fixtures/pixel_draw are claude-opus-5-5's own, recorded 2026-10-12 from the
prompts this verb sends: six that parse whole, and the failure shapes it actually wrote — a row one
key too long, a Cyrillic 'о' for an 'o', a single frame with no FRAME line, output cut off at row
16 after a stray CJK character, spaces inside rows — with the row-repair answers it gave for four
of them (`*.repair.txt`).
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from PIL import Image

from sprite_gen.gen import pixel_grid as pg

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "pixel_draw"
WALK = ("walk1", "walk2", "walk3", "walk4")
FOURDIR = ("down", "up", "left", "right")


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def codes(issues):
    return sorted({i.code for i in issues})


# The other recorded answers (tile-16, fourdir-16, sprite-16-safe-area, walk-32-safe-area, attack-32-safe-area,
# attack-32-margin-detail) are parsed whole by the recorded tests of tests/gen/test_pixel_gates.py.
PASSING = [
    ("sprite-16-pass.txt", "chargrid", 16, ("front",)),
    ("icon-32-pass.txt", "chargrid", 32, ("icon",)),
    ("walk-16-pass.txt", "chargrid", 16, WALK),
    ("icon-16-json-pass.txt", "json", 16, ("icon",)),
]


@pytest.mark.parametrize("name,fmt,size,frames", PASSING)
def test_recorded_answers_that_parse_whole(name, fmt, size, frames):
    grid, issues = pg.parse_answer(fixture(name), fmt, size, size, frames)
    assert issues == []
    assert list(grid.frames) == list(frames)
    for rows in grid.frames.values():
        assert len(rows) == size and all(len(row) == size for row in rows)


def test_a_row_one_key_too_long_is_a_row_issue():
    grid, issues = pg.parse_answer(fixture("icon-32-row-width.txt"), "chargrid", 32, 32, ("icon",))
    assert [i.to_dict() for i in issues] == [{"code": "row_width", "frame": "icon", "row": 16, "detail": "33 values, needs 32"}]
    assert pg.structural(issues) == [] and pg.row_issues(issues) == issues


def test_a_lookalike_letter_outside_the_palette_is_an_unknown_symbol():
    grid, issues = pg.parse_answer(fixture("fourdir-16-unknown-symbol.txt"), "chargrid", 16, 16, FOURDIR)
    assert [(i.code, i.frame, i.row) for i in issues] == [("unknown_symbol", "up", 8)]
    assert "'о'" in issues[0].detail  # U+043E, not the palette's 'o'


def test_a_single_frame_without_its_frame_line_is_recovered_and_said():
    grid, issues = pg.parse_answer(fixture("sprite-32-frame-header-missing.txt"), "chargrid", 32, 32, ("front",))
    assert codes(issues) == ["frame_header_missing"]
    assert pg.recovered(issues) == issues
    assert len(grid.frames["front"]) == 32


def test_output_cut_short_is_one_broken_row_and_the_missing_rows():
    grid, issues = pg.parse_answer(fixture("tile-32-truncated.txt"), "chargrid", 32, 32, ("tile",))
    assert [(i.code, i.row) for i in pg.row_issues(issues) if i.code != "row_missing"] == [
        ("row_width", 16), ("unknown_symbol", 16)]
    assert [i.row for i in issues if i.code == "row_missing"] == list(range(17, 33))
    assert codes(pg.recovered(issues)) == ["no_end"]
    assert pg.structural(issues) == []


def test_spaces_inside_rows_are_unknown_symbols():
    grid, issues = pg.parse_answer(fixture("icon-32-space-in-row.txt"), "chargrid", 32, 32, ("icon",))
    spaced = [i for i in issues if i.code == "unknown_symbol"]
    assert spaced and all("' '" in i.detail for i in spaced)
    assert pg.structural(issues) == []


def test_an_answer_with_no_block_is_structural():
    grid, issues = pg.parse_answer("", "chargrid", 16, 16, ("front",))
    assert grid is None and codes(issues) == ["no_block"] and pg.structural(issues) == issues


def _block(palette: str, frames: dict[str, list[str]], end: bool = True, tag: str = "pixels") -> str:
    body = ["PALETTE", palette]
    for name, rows in frames.items():
        body += [f"FRAME {name}", *rows]
    if end:
        body.append("END")
    return f"```{tag}\n" + "\n".join(body) + "\n```\n"


ROWS8 = ["." * 8] + [".aaaaaa."] * 6 + ["." * 8]


@pytest.mark.parametrize("text,frames,expected", [
    (_block(". transparent\na #112233", {"x": ROWS8 + ["." * 8]}), ("x",), "row_count_over"),
    (_block(". transparent\na #112233", {"a1": ROWS8}), ("a1", "a2"), "frame_missing"),
    (_block(". transparent\na #112233", {"a1": ROWS8, "a2": ROWS8, "zz": ROWS8}), ("a1", "a2"), "frame_extra"),
    (_block(". transparent\na #112233\na #445566", {"x": ROWS8}), ("x",), "palette_key_duplicate"),
    (_block(". #000000\na #112233", {"x": ROWS8}), ("x",), "dot_redefined"),
    (_block(". transparent\nt transparent\na #112233", {"x": ROWS8}), ("x",), "extra_transparent_key"),
    (_block(". transparent\na #112233", {"a1": ROWS8, "a1 ": ROWS8}), ("a1", "a2"), "frame_duplicate"),
])
def test_structural_issues(text, frames, expected):
    grid, issues = pg.parse_answer(text, "chargrid", 8, 8, frames)
    assert expected in codes(pg.structural(issues))


def test_recovered_shapes_are_recorded_and_pass():
    renamed = _block(". transparent\na #112233", {"front": ROWS8})
    grid, issues = pg.parse_answer(renamed, "chargrid", 8, 8, ("icon",))
    assert codes(issues) == ["frame_renamed"] and list(grid.frames) == ["icon"]
    swapped = _block(". transparent\na #112233", {"b": ROWS8, "a": ROWS8}, end=False, tag="text")
    grid, issues = pg.parse_answer(swapped, "chargrid", 8, 8, ("a", "b"))
    assert codes(issues) == ["block_tag", "frame_order", "no_end"]
    assert list(grid.frames) == ["a", "b"]


def test_a_block_cut_off_or_unfenced_keeps_its_rows():
    text = fixture("sprite-16-pass.txt")
    cut = text[:text.index("END")].rsplit("\n", 7)[0]  # the last six rows, END and the fence never came
    grid, issues = pg.parse_answer(cut, "chargrid", 16, 16, ("front",))
    assert codes(pg.recovered(issues)) == ["block_unclosed", "no_end"]
    assert [i.row for i in issues if i.code == "row_missing"] == list(range(11, 17))
    bare = text.replace("```pixels\n", "").replace("```", "")
    grid, issues = pg.parse_answer("Here it is:\n" + bare, "chargrid", 16, 16, ("front",))
    assert codes(issues) == ["block_tag"]


def test_json_answers_and_their_issues():
    rows = [[0] * 8] + [[0, 1, 1, 1, 1, 1, 1, 0]] * 6 + [[0] * 8]
    good = {"palette": ["transparent", "#112233"], "frames": {"x": rows}}
    grid, issues = pg.parse_answer("```json\n" + json.dumps(good) + "\n```", "json", 8, 8, ("x",))
    assert issues == [] and grid.frames["x"][1][1] == "1"
    bare, issues = pg.parse_answer("here: " + json.dumps(good), "json", 8, 8, ("x",))
    assert codes(issues) == ["block_tag"]
    long_row = {**good, "frames": {"x": [[0] * 9] + rows[1:]}}
    assert codes(pg.parse_answer(json.dumps(long_row), "json", 8, 8, ("x",))[1]) == ["block_tag", "row_width"]
    outside = {**good, "frames": {"x": [[0, 7, 0, 0, 0, 0, 0, 0]] + rows[1:]}}
    assert "unknown_symbol" in codes(pg.parse_answer(json.dumps(outside), "json", 8, 8, ("x",))[1])
    first = {**good, "palette": ["#000000", "#112233"]}
    assert "palette0_not_transparent" in codes(pg.structural(pg.parse_answer(json.dumps(first), "json", 8, 8, ("x",))[1]))
    assert codes(pg.parse_answer("```json\n{not json}\n```", "json", 8, 8, ("x",))[1]) == ["json_invalid"]


def test_the_recorded_repair_answer_is_spliced_into_its_row():
    grid, issues = pg.parse_answer(fixture("icon-32-row-width.txt"), "chargrid", 32, 32, ("icon",))
    wanted = {(i.frame, i.row) for i in pg.row_issues(issues)}
    fixes, ignored = pg.parse_row_answers(fixture("icon-32-row-width.repair.txt"), grid, wanted)
    assert ignored == [] and list(fixes) == [("icon", 16)]
    fixed = pg.splice(grid, fixes)
    assert pg.check_rows(fixed) == []
    assert "".join(fixed.frames["icon"][15]) == ".ooooooooooooGGooGgoooooooooooo."
    assert [r for n, r in enumerate(fixed.frames["icon"]) if n != 15] == \
        [r for n, r in enumerate(grid.frames["icon"]) if n != 15]


def test_a_repair_round_can_leave_a_row_still_broken():
    grid, issues = pg.parse_answer(fixture("tile-32-truncated.txt"), "chargrid", 32, 32, ("tile",))
    wanted = {(i.frame, i.row) for i in pg.row_issues(issues)}
    fixes, _ = pg.parse_row_answers(fixture("tile-32-truncated.repair.txt"), grid, wanted)
    left = pg.check_rows(pg.splice(grid, fixes))
    assert [(i.code, i.row, i.detail) for i in left] == [("row_width", 25, "33 values, needs 32")]


def test_rows_not_asked_for_are_ignored():
    grid, issues = pg.parse_answer(fixture("icon-32-row-width.txt"), "chargrid", 32, 32, ("icon",))
    answer = "ROW icon 16: " + "." * 32 + "\nROW icon 3: " + "o" * 32 + "\nROW other 1: x"
    fixes, ignored = pg.parse_row_answers(answer, grid, {("icon", 16)})
    assert list(fixes) == [("icon", 16)] and ignored == ["icon 3", "other 1"]


def test_grid_text_is_canonical_and_reads_back():
    grid, _ = pg.parse_answer(fixture("walk-16-pass.txt"), "chargrid", 16, 16, WALK)
    text = pg.to_text(grid)
    assert text.startswith("PALETTE\n. transparent\no #2a1e2e\n") and text.endswith("END\n")
    again, issues = pg.read_grid_text(text)
    assert issues == [] and again.frames == grid.frames and again.palette == grid.palette
    assert (again.width, again.height) == (16, 16)


def test_a_json_answer_becomes_a_chargrid_grid_text():
    grid, _ = pg.parse_answer(fixture("icon-16-json-pass.txt"), "json", 16, 16, ("icon",))
    text = pg.to_text(grid)
    assert text.splitlines()[1:4] == [". transparent", "a #2b1b2e", "b #6b3f22"]
    again, issues = pg.read_grid_text(text)
    assert issues == []
    assert pg.frame_pixels(again, "icon") == pg.frame_pixels(grid, "icon")


def test_an_edited_grid_text_with_one_broken_row_reports_that_row():
    grid, _ = pg.parse_answer(fixture("sprite-16-pass.txt"), "chargrid", 16, 16, ("front",))
    lines = pg.to_text(grid).splitlines()
    first_row = lines.index("FRAME front") + 1
    lines[first_row] = lines[first_row][:-1]
    again, issues = pg.read_grid_text("\n".join(lines))
    assert (again.width, again.height) == (16, 16)
    assert [(i.code, i.row) for i in issues] == [("row_width", 1)]


GOLDEN_2X2 = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000200000002080600000072b60d240000001d494441547801011200edff00ff0000ff"
    "000000000000ff00ff0000ff802d65057c18ea43280000000049454e44ae426082")


def test_png_bytes_are_a_function_of_the_pixels_alone():
    pixels = [[(255, 0, 0, 255), (0, 0, 0, 0)], [(0, 255, 0, 255), (0, 0, 255, 128)]]
    data = pg.png_bytes(pixels)
    assert data == GOLDEN_2X2  # assembled from the PNG spec by hand, not by this code
    with Image.open(io.BytesIO(data)) as image:
        assert image.mode == "RGBA" and list(image.get_flattened_data()) == [p for row in pixels for p in row]


def test_palette_rules(tmp_path):
    assert pg.palette_rule("free") == pg.PaletteRule("free:16", 16)
    assert pg.palette_rule("free:8") == pg.PaletteRule("free:8", 8)
    assert pg.palette_rule("pico8").colors == pg.PICO8 and pg.palette_rule("pico8").limit == 16
    fixed = pg.palette_rule("#aabbcc,#112233")
    assert fixed.colors == ("#AABBCC", "#112233") and fixed.limit == 2 and fixed.fixed
    hexfile = tmp_path / "pal.hex"
    hexfile.write_text("; lospec\nff0044\n\n#00AAFF\n", encoding="utf-8")
    assert pg.palette_rule(str(hexfile)).colors == ("#FF0044", "#00AAFF")
    jsonfile = tmp_path / "pal.json"
    jsonfile.write_text(json.dumps({"colors": ["#000000", "#ffffff"]}), encoding="utf-8")
    assert pg.palette_rule(str(jsonfile)).colors == ("#000000", "#FFFFFF")
    for bad in ("free:0", "free:63", "free:x", "#12345", "#aabbcc,#AABBCC", str(tmp_path / "missing.hex")):
        with pytest.raises(ValueError):
            pg.palette_rule(bad)


# ----------------------------------------------------------------------------- several blocks in one answer

def test_several_blocks_read_the_last_one_that_reads_whole():
    """An answer that writes a block, then 'Corrected:' and the block again: the last block that reads
    whole is the answer, recorded. Seen 2026-10-15 on a 16 px icon - a first block of the palette alone
    and END, then the whole block."""
    half = _block(". transparent\na #112233", {})
    whole = _block(". transparent\na #112233", {"icon": ROWS8})
    text = "Here:\n" + half + "\nWait, the frame belongs inside the block. Corrected:\n\n" + whole
    grid, issues = pg.parse_answer(text, "chargrid", 8, 8, ("icon",))
    assert grid.frames["icon"] == [list(row) for row in ROWS8]
    assert [i.to_dict() for i in issues] == [{"code": "block_many", "detail": "2 blocks, read block 2"}]
    assert pg.recovered(issues) == issues


def test_a_whole_block_before_a_broken_one_is_the_one_read():
    whole = _block(". transparent\na #112233", {"icon": ROWS8})
    cut = "```pixels\nPALETTE\n. transparent\na #112233\nFRAME icon\n........\n.aaa"
    grid, issues = pg.parse_answer(whole + "\nLet me redo it:\n" + cut, "chargrid", 8, 8, ("icon",))
    assert codes(issues) == ["block_many"] and issues[0].detail == "2 blocks, read block 1"
    assert grid.frames["icon"] == [list(row) for row in ROWS8]


def test_of_several_broken_blocks_the_last_with_rows_to_repair_is_read():
    first = _block(". transparent\nEND_PALETTE_PLACEHOLDER", {"icon": ROWS8})
    second = _block(". transparent\na #112233", {"icon": ROWS8[:7] + [".aaaaaaa."]})
    grid, issues = pg.parse_answer(first + second, "chargrid", 8, 8, ("icon",))
    assert codes(issues) == ["block_many", "row_width"] and grid is not None
    assert [(i.code, i.row) for i in pg.row_issues(issues)] == [("row_width", 8)]


def test_one_block_reads_as_it_always_did():
    whole = _block(". transparent\na #112233", {"icon": ROWS8})
    assert pg.parse_answer(whole, "chargrid", 8, 8, ("icon",))[1] == []
    assert pg.parse_answer("text then " + whole + " and a note", "chargrid", 8, 8, ("icon",))[1] == []


# ----------------------------------------------------------------------------- the palette held across answers

def test_a_later_answer_keeps_the_palette_it_was_given():
    """A later answer of a set larger than one call writes the first answer's palette again: a key it
    adds is refused (its rows go to the row repair) and a colour it changes is put back, both recorded."""
    held = {".": None, "a": "#2a1f2e", "b": "#c8a040"}
    rows = ["........", ".aaaaaa.", ".abbbba.", ".acccca.", ".aaaaaa.", ".aaaaaa.", ".aaaaaa.", "........"]
    text = _block(". transparent\na #2a1f2e\nb #ffffff\nc #ff0000", {"f5": rows})
    grid, issues = pg.parse_answer(text, "chargrid", 8, 8, ("f5",))
    assert issues == []
    grid, issues = pg.hold_palette(grid, issues, held)
    assert grid.palette == held
    assert [i.to_dict() for i in pg.recovered(issues)] == [
        {"code": "palette_changed", "detail": "b #ffffff, kept #c8a040"}, {"code": "palette_added", "detail": "c #ff0000"}]
    assert [(i.code, i.frame, i.row) for i in pg.row_issues(issues)] == [("unknown_symbol", "f5", 4)]


def test_parts_are_joined_in_order_under_the_first_palette():
    one, _ = pg.parse_answer(_block(". transparent\na #112233", {"f1": ROWS8, "f2": ROWS8}), "chargrid", 8, 8, ("f1", "f2"))
    two, _ = pg.parse_answer(_block(". transparent\na #112233", {"f3": ROWS8}), "chargrid", 8, 8, ("f3",))
    joined = pg.joined([one, two])
    assert list(joined.frames) == ["f1", "f2", "f3"] and joined.palette == one.palette
    assert pg.to_text(joined).count("FRAME ") == 3


def test_a_preview_of_more_than_eight_frames_wraps_into_rows():
    frame = [[(17, 34, 51, 255)] * 8 for _ in range(8)]
    four = pg.preview_strip([frame] * 4, 2)
    assert four.size == (4 * 16 + 3 * 4, 16)  # one row, as before
    ten = pg.preview_strip([frame] * 10, 2)
    assert ten.size == (8 * 16 + 7 * 4, 2 * 16 + 4)
    assert ten.getpixel((0, 20)) == (17, 34, 51, 255) and ten.getpixel((40, 20)) == (0, 0, 0, 0)  # the third place of the second row is empty
