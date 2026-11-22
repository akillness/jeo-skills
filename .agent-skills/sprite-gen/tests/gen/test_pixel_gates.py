# SPDX-License-Identifier: Apache-2.0
"""Gates G2..G6 and G8 of `pixel-draw` on recorded answers (tests/fixtures/pixel_draw) and on grids
made to break exactly one rule. G2, G3 and G6 fail a candidate; G4, G5 and the walk check only warn.
G3, G4, G5 and G8 ask the engine's own judgments, each tested with its owner: G3 the transparent
background of `gen.chroma.alpha_verdict` (tests/gen/test_alpha_verdict.py), G4 the join measure of
`background.tile.inspect_tile` (tests/background/test_tile.py), G5 the lone pixels of
`frames.extract.isolated_dots` (tests/frames/test_isolated_dots.py), and G8 the safe area of
`frames.extract.safe_area_fit` (tests/frames/test_safe_area_fit.py) - a frame past the physical cap
warns, one past the safe area within the cap is an info line - and a sprite whose feet are off the
floor row warns. The `*-safe-area-pass` answers were drawn under the safe-area prompt; the other
recorded sprites when the prompt asked to fill the canvas."""
from __future__ import annotations

from pathlib import Path

import pytest

from sprite_gen.gen import pixel_gates, prepare
from sprite_gen.gen import pixel_grid as pg
from sprite_gen.gen.pixel_gates import evaluate, g6_frames

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "pixel_draw"
WALK = ("walk1", "walk2", "walk3", "walk4")
FOURDIR = ("down", "up", "left", "right")
FREE16 = pg.palette_rule("free")

INK, SKIN, GRASS = (40, 30, 46, 255), (240, 192, 152, 255), (78, 144, 56, 255)
CLEAR = (0, 0, 0, 0)


def frames_of(name: str, size: int, frames: tuple[str, ...]):
    grid, issues = pg.parse_answer((FIXTURES / name).read_text(encoding="utf-8"), "chargrid", size, size, frames)
    assert issues == []
    return {f: pg.frame_pixels(grid, f) for f in frames}


def blob(size: int = 8, top: int = 2, bottom: int = 5, fill=INK):
    """A transparent square with an opaque block rows top..bottom, columns 2..size-3."""
    return [[fill if top <= y <= bottom and 2 <= x <= size - 3 else CLEAR for x in range(size)] for y in range(size)]


def test_recorded_sprite_passes_every_gate():
    gates = evaluate(frames_of("sprite-16-safe-area-pass.txt", 16, ("sprite",)), kind="sprite", rule=FREE16,
                     walk_cycle=False)
    assert gates["ok"] and gates["failed"] == [] and gates["warnings"] == [] and gates["info"] == []
    assert gates["G2"]["colors_used"] <= 16
    assert gates["G3"]["frames"]["sprite"]["corners_transparent"]
    assert gates["G3"]["frames"]["sprite"]["verdict"] == "real-alpha"
    assert gates["G5"]["isolated_pixels"] == 0 and "G6" not in gates and "G4" not in gates
    assert gates["G8"]["frames"]["sprite"]["bbox"] == [3, 1, 12, 14] and gates["G8"]["floor_row"] == 14


def test_recorded_tile_is_opaque_and_repeats():
    gates = evaluate(frames_of("tile-16-pass.txt", 16, ("tile",)), kind="tile", rule=FREE16, walk_cycle=False)
    assert gates["ok"] and gates["G3"]["frames"]["tile"]["opaque_fraction"] == 1.0 and gates["info"] == []
    assert gates["G3"]["frames"]["tile"]["verdict"] == "no-alpha"
    assert gates["G4"]["needs_review"] == [] and not gates["G4"]["warn"]
    assert {axis: report["status"] for axis, report in gates["G4"]["frames"]["tile"].items()} == {"x": "pass", "y": "pass"}


def test_g2_counts_colours_against_the_limit_and_the_fixed_set():
    frames = frames_of("sprite-16-safe-area-pass.txt", 16, ("sprite",))
    used = evaluate(frames, kind="sprite", rule=FREE16, walk_cycle=False)["G2"]["colors_used"]
    few = evaluate(frames, kind="sprite", rule=pg.palette_rule("free:4"), walk_cycle=False)
    assert not few["ok"] and few["failed"] == ["G2"] and few["G2"]["colors_used"] == used
    pico = evaluate(frames, kind="sprite", rule=pg.palette_rule("pico8"), walk_cycle=False)
    assert not pico["ok"] and pico["G2"]["off_palette"]
    exact = pg.palette_rule(",".join(sorted({"#{:02X}{:02X}{:02X}".format(*p[:3])
                                             for row in frames["sprite"] for p in row if p[3]})))
    assert evaluate(frames, kind="sprite", rule=exact, walk_cycle=False)["G2"]["ok"]


# The opaque border and the tile's hole are `alpha_verdict`'s, tested in tests/gen/test_alpha_verdict.py.
@pytest.mark.parametrize("frame,kind", [
    ([[INK] + [CLEAR] * 7] + [[CLEAR] * 8 for _ in range(7)], "sprite"),   # an opaque corner
    ([[CLEAR] * 8 for _ in range(8)], "sprite"),                            # nothing drawn
])
def test_g3_alpha_failures(frame, kind):
    gates = evaluate({"f": frame}, kind=kind, rule=FREE16, walk_cycle=False)
    assert not gates["ok"] and "G3" in gates["failed"]


def test_recorded_four_directions_stand_on_one_line():
    gates = evaluate(frames_of("fourdir-16-pass.txt", 16, FOURDIR), kind="sprite", rule=FREE16, walk_cycle=False)
    assert gates["G6"]["ok"] and gates["G6"]["identical_pairs"] == []
    assert len(set(gates["G6"]["baselines"].values())) == 1 and "walk" not in gates["G6"]
    # drawn to fill the canvas: plume to boots 16 rows, where a 16 px cell has 15 above its bottom margin
    assert gates["ok"] and gates["failed"] == [] and gates["info"] == []
    assert gates["warnings"] == [
        "G8: frames exceed the physical cap 16x15 (reroll candidates): down:12x16, up:12x16, left:10x16, right:10x16",
        "G8 the feet are not on the floor row (the safe area's bottom row): down 1 px below it, up 1 px below it, "
        "left 1 px below it, right 1 px below it"]


def test_recorded_walk_passes_with_the_weak_leg_warning():
    gates = evaluate(frames_of("walk-32-safe-area-pass.txt", 32, WALK), kind="sprite", rule=FREE16, walk_cycle=True)
    g6 = gates["G6"]
    assert gates["ok"] and g6["ok"] and g6["height_spread"] == 1  # the passing pose is a pixel higher
    assert g6["rule"] == "motion"  # a walk cycle is a motion
    assert g6["walk"]["warn"] and g6["walk"]["ratio"] < 0.4
    assert [w[:30] for w in gates["warnings"]] == ["G6 weak leg alternation: the c"] and gates["info"] == []
    assert set(g6["baselines"].values()) == {gates["G8"]["floor_row"]} == {28}  # row 29 of 32, counted from 1


def test_g6_failures():
    low, high, tall = blob(), blob(top=1, bottom=4), blob(top=0, bottom=5)
    assert not g6_frames({"a": low, "b": [row[:] for row in low]}, walk_cycle=False)["ok"]  # the same frame twice
    shifted = g6_frames({"a": low, "b": high}, walk_cycle=False)
    assert not shifted["ok"] and shifted["baselines"] == {"a": 5, "b": 4}
    spread = g6_frames({"a": low, "b": [r[:] for r in tall]}, walk_cycle=False)
    assert spread["height_spread"] == 2 and not spread["ok"]
    gates = evaluate({"a": low, "b": [row[:] for row in low]}, kind="sprite", rule=FREE16, walk_cycle=False)
    assert gates["failed"] == ["G6"]


# ----------------------------------------------------------------------------- G8 safe area

def canvas(size: int = 32):
    return [[CLEAR] * size for _ in range(size)]


def paint(frame, x0: int, y0: int, x1: int, y1: int, fill=INK):
    """`frame` with columns x0..x1 of rows y0..y1 opaque (inclusive)."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            frame[y][x] = fill
    return frame


def figure(size: int = 32):
    """A body filling the safe area's height: at 32 px columns 8..23 of rows 3..28, the 26x26 box's
    rows from top to the floor row."""
    m = int(size * prepare.DEFAULT_SAFE_MARGIN_RATIO)
    return paint(canvas(size), size // 4, m, size - 1 - size // 4, size - 1 - m)


# `normalize_cell` is `int(width * RATIO)` with no branch on the size; the 0 px margin is its own test below.
@pytest.mark.parametrize("size,margin,inner", [(32, 3, 26)])
def test_the_safe_area_is_the_engines(size, margin, inner):
    area = pixel_gates.safe_area(size, size)
    cell = prepare.normalize_cell({"width": size, "height": size}, size, None)
    assert area["margin"] == [margin, margin] == [cell["safe_margin_x"], cell["safe_margin_y"]]
    assert margin == int(size * prepare.DEFAULT_SAFE_MARGIN_RATIO)
    assert area["size"] == [inner, inner]
    assert area["box"] == [margin, margin, size - 1 - margin, size - 1 - margin]
    assert area["floor_row"] == size - 1 - margin  # where prepare's fit grounds a frame: the safe area's last row


def test_the_safe_area_follows_prepares_ratio(monkeypatch):
    monkeypatch.setattr(prepare, "DEFAULT_SAFE_MARGIN_RATIO", 0.125)
    assert pixel_gates.safe_area(32, 32)["margin"] == [4, 4]
    assert pixel_gates.safe_area(32, 16)["margin"] == [4, 2]  # an edited grid need not be square


def test_g8_passes_a_body_inside_the_safe_area():
    gates = evaluate({"f": figure()}, kind="sprite", rule=FREE16, walk_cycle=False)
    g8 = gates["G8"]
    assert gates["ok"] and gates["warnings"] == [] and gates["info"] == [] and not g8["warn"]
    assert g8["margin"] == [3, 3] and g8["safe_area"] == [26, 26] and g8["physical_cap"] == [32, 29]
    assert g8["floor_row"] == 28 and g8["over_cap"] == [] and g8["past_safe_area"] == []
    assert g8["frames"]["f"] == {"bbox": [8, 3, 23, 28], "size": [16, 26], "body_box": [8, 3, 23, 28]}


# The side blades take the thin-tip path and the bottom tail the floor path, each tested below.
@pytest.mark.parametrize("stroke,info", [
    ((15, 0, 15, 2), ["f:16x29"]),    # a staff to the top edge: 29 rows, past the safe area, within the cap
])
def test_g8_never_fails_a_pose_that_reaches_the_canvas_edge(stroke, info):
    """The safe area is a target for the body's size, not a wall: a pose may reach the canvas edge."""
    frame = paint(figure(), *stroke)
    gates = evaluate({"f": frame}, kind="sprite", rule=FREE16, walk_cycle=False)
    assert gates["ok"] and gates["failed"] == [] and gates["warnings"] == []
    assert gates["info"] == [f"G8: frames exceed the safe area 26x26 but fit within the margin zone (informational, "
                             f"no action): {where}" for where in info]


def test_g8_lets_a_thin_tip_into_the_margin():
    frame = paint(figure(), 24, 15, 30, 15)  # a blade from the body's right side to 2 px past the safe area
    gates = evaluate({"f": frame}, kind="sprite", rule=FREE16, walk_cycle=False)
    measure = gates["G8"]["frames"]["f"]
    assert gates["ok"] and gates["warnings"] == [] and gates["info"] == []
    assert measure["bbox"] == [8, 3, 30, 28] and measure["body_box"] == [8, 3, 23, 28]


def test_g8_warns_a_frame_past_the_physical_cap():
    """The cap is the canvas's width and its height less the margin under the floor row: 32x29 at 32 px."""
    over = paint(figure(), 20, 0, 20, 29)  # a staff from the top edge to a row under the floor row: 30 rows
    for kind in ("sprite", "icon"):  # the same judgment for both
        gates = evaluate({"f": over}, kind=kind, rule=FREE16, walk_cycle=False)
        assert gates["ok"] and gates["failed"] == [] and gates["G8"]["warn"] and gates["info"] == []
        assert "ok" not in gates["G8"]
        assert gates["G8"]["over_cap"] == ["f"] and gates["G8"]["frames"]["f"]["body_box"][3] == 28
        assert gates["warnings"] == ["G8: frames exceed the physical cap 32x29 (reroll candidates): f:16x30"]


def test_g8_warns_a_sprite_off_the_floor_row():
    floating = paint(canvas(), 8, 3, 23, 26)
    gates = evaluate({"a": floating, "b": paint(canvas(), 9, 3, 23, 26)}, kind="sprite", rule=FREE16, walk_cycle=False)
    assert gates["ok"] and gates["G6"]["ok"] and gates["G8"]["warn"] and gates["info"] == []
    assert gates["warnings"] == ["G8 the feet are not on the floor row (the safe area's bottom row): "
                                 "a 2 px above it, b 2 px above it"]
    below = evaluate({"f": paint(canvas(), 8, 3, 23, 29)}, kind="sprite", rule=FREE16, walk_cycle=False)
    assert below["ok"] and below["warnings"] == [
        "G8 the feet are not on the floor row (the safe area's bottom row): f 1 px below it"]
    assert below["info"] == ["G8: frames exceed the safe area 26x26 but fit within the margin zone (informational, "
                             "no action): f:16x27"]
    icon = evaluate({"f": floating}, kind="icon", rule=FREE16, walk_cycle=False)
    assert icon["warnings"] == [] and icon["G8"]["floor_row"] is None


def test_g8_reads_the_floor_from_the_body_not_a_tip_below_it():
    staff = paint(figure(), 20, 29, 20, 30)  # a staff's foot 2 px into the bottom margin, the feet on the floor row
    gates = evaluate({"f": staff}, kind="sprite", rule=FREE16, walk_cycle=False)
    assert gates["ok"] and gates["warnings"] == []
    assert gates["G8"]["frames"]["f"]["bbox"][3] == 30 and gates["G8"]["frames"]["f"]["body_box"][3] == 28


def test_g8_below_a_one_pixel_margin_the_safe_area_and_the_cap_are_the_canvas():
    plus = paint(paint(canvas(8), 3, 0, 4, 7), 0, 3, 7, 4)  # touches every side, corners clear
    gates = evaluate({"f": plus}, kind="icon", rule=FREE16, walk_cycle=False)
    assert gates["ok"] and gates["warnings"] == [] and gates["info"] == []
    assert gates["G8"]["margin"] == [0, 0] and gates["G8"]["safe_area"] == [8, 8] and gates["G8"]["physical_cap"] == [8, 8]


def test_g8_leaves_tiles_alone():
    gates = evaluate({"tile": [[GRASS] * 32 for _ in range(32)]}, kind="tile", rule=FREE16, walk_cycle=False)
    assert gates["ok"] and "G8" not in gates and gates["info"] == []


def test_a_recorded_blade_reaches_into_the_margin_and_the_body_stays_inside():
    frames = frames_of("attack-32-safe-area-pass.txt", 32, ("attack1", "attack2", "attack3", "attack4"))
    gates = evaluate(frames, kind="sprite", rule=FREE16, walk_cycle=False)
    measures = gates["G8"]["frames"]
    assert gates["ok"] and gates["warnings"] == [] and gates["info"] == []
    assert measures["attack1"]["bbox"][0] == 2 and measures["attack3"]["bbox"][2] == 29  # the blade, 1 px past it
    assert all(3 <= m["body_box"][0] and m["body_box"][2] <= 28 and m["body_box"][3] == 28 for m in measures.values())


def test_g6_measures_the_frames_inside_the_safe_area():
    """What reaches into the margin - a staff raised in one frame, a spark in another - is G8's to
    judge; G6 compares the figures inside the safe area."""
    still, raised = figure(), paint(figure(), 20, 1, 20, 2)  # the staff 2 px into the top margin
    g6 = evaluate({"a": still, "b": raised}, kind="sprite", rule=FREE16, walk_cycle=False)["G6"]
    assert g6["ok"] and g6["heights"] == {"a": 26, "b": 26} and g6["baselines"] == {"a": 28, "b": 28}
    taller = paint(canvas(), 8, 5, 23, 28)  # the body itself 2 px shorter inside the safe area
    assert not evaluate({"a": still, "b": taller}, kind="sprite", rule=FREE16, walk_cycle=False)["G6"]["ok"]


def test_a_recorded_staff_and_spark_in_the_margin_pass():
    """Drawn under the safe-area prompt: the staff pulled back reaches 2 px into the top margin and the
    spark 1 px, the figure is the same height in every frame. The two frames they make taller or wider
    than the safe area are an info line."""
    frames = frames_of("attack-32-margin-detail.txt", 32, ("attack1", "attack2", "attack3", "attack4"))
    gates = evaluate(frames, kind="sprite", rule=FREE16, walk_cycle=False)
    assert gates["ok"] and gates["warnings"] == [] and gates["G6"]["height_spread"] == 0
    assert gates["info"] == ["G8: frames exceed the safe area 26x26 but fit within the margin zone (informational, "
                             "no action): attack2:19x28, attack3:26x27"]
    assert [m["bbox"][1] for m in gates["G8"]["frames"].values()] == [3, 1, 2, 3]


def test_g8_reads_a_frames_opaque_box_off_the_image_paths_judgment(monkeypatch):
    """The opaque box G8 sizes a frame by is `frames.extract.solid_alpha_bbox` (alpha at least 128), the
    box the image path crops a sprite to — one measure, not a second count of opaque rows here."""
    from sprite_gen.frames import extract

    real, seen = extract.solid_alpha_bbox, []

    def recording(image, threshold=128):
        seen.append((image.getchannel("A").tobytes(), threshold))
        return real(image, threshold)

    monkeypatch.setattr(extract, "solid_alpha_bbox", recording)
    frame = blob(size=16, top=3, bottom=12)
    g8 = evaluate({"f": frame}, kind="sprite", rule=FREE16, walk_cycle=False)["G8"]
    assert seen == [(pg.image_of(frame).getchannel("A").tobytes(), pixel_gates.OPAQUE_MIN)]
    assert g8["frames"]["f"]["bbox"] == [2, 3, 13, 12] and g8["frames"]["f"]["size"] == [12, 10]
    # What it answers is what G8 measures: a box it says is wider is a wider frame.
    monkeypatch.setattr(extract, "solid_alpha_bbox", lambda image, threshold=128: (0, 3, 16, 13))
    g8 = evaluate({"f": frame}, kind="sprite", rule=FREE16, walk_cycle=False)["G8"]
    assert g8["frames"]["f"]["bbox"] == [0, 3, 15, 12] and g8["frames"]["f"]["size"] == [16, 10]


# ----------------------------------------------------------------------------- G6 of one motion

def lifted(frame, rows: int):
    """`frame` drawn `rows` rows higher."""
    return frame[rows:] + [[CLEAR] * len(frame[0]) for _ in range(rows)]


def test_g6_of_a_motion_lets_a_raised_arm_and_a_hold_through_and_still_fails_the_ground():
    """One motion (`--motion`, or a walk cycle): the frames must stand on one ground row, but an arm
    raised over the head changes the height with the pose - its height, mass and breadth part, so the
    image path's size reading (`gait_fallback.size_change`) says the body did not grow - and a frame
    drawn twice is a hold."""
    side = paint(paint(canvas(), 8, 10, 23, 28), 24, 14, 25, 20)  # a body and an arm at its side
    raised = paint(paint(canvas(), 8, 10, 23, 28), 24, 3, 25, 9)  # the same arm over the head
    frames = {"a": side, "b": raised, "c": [r[:] for r in raised]}
    still = evaluate(frames, kind="sprite", rule=FREE16, walk_cycle=False)
    assert still["failed"] == ["G6"]  # without --motion, as before
    gates = evaluate(frames, kind="sprite", rule=FREE16, walk_cycle=False, motion=True)
    g6 = gates["G6"]
    assert gates["ok"] and g6["ok"] and g6["rule"] == "motion"
    assert g6["heights"] == {"a": 19, "b": 26, "c": 26} and g6["posed"] == ["b", "c"] and g6["resized"] == []
    assert g6["size_change"]["b"]["change"] == 0.0 and g6["holds"] == [["b", "c"]]
    assert not any(w.startswith("G6") for w in gates["warnings"])
    assert [line for line in gates["info"] if line.startswith("G6")] == [
        "G6 the height changes with the pose, not the body's size (informational, no action): b 26 px, c 26 px "
        "against a 19 px",
        "G6 frames drawn the same, a hold (informational, no action): b=c"]
    off = evaluate({**frames, "d": lifted(frames["a"], 2)}, kind="sprite", rule=FREE16, walk_cycle=False, motion=True)
    assert off["failed"] == ["G6"] and off["G6"]["baselines"]["d"] == 26


def test_g6_of_a_motion_warns_a_body_drawn_larger():
    small = paint(canvas(), 10, 12, 21, 28)
    large = paint(canvas(), 8, 7, 23, 28)
    gates = evaluate({"a": small, "b": large}, kind="sprite", rule=FREE16, walk_cycle=False, motion=True)
    g6 = gates["G6"]
    assert gates["ok"] and g6["resized"] == ["b"] and g6["posed"] == []
    assert g6["size_change"]["b"]["change"] > 0.25
    assert [w for w in gates["warnings"] if w.startswith("G6")] == [
        "G6 the body changes size, not only its pose - its height, mass and breadth all grow or shrink by more "
        "than a pixel: b +29% against a"]

