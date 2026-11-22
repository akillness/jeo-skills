# SPDX-License-Identifier: Apache-2.0
"""Gates G2..G6 and G8 of `pixel-draw`, on the pixels of a grid that passed G1 (it parsed whole).

G3, G4, G5 and G8 ask the judgment sprite-gen already makes of the same question elsewhere — one
function each, called here, never a copy (docs/pixel-draw.md "Gates"):

- G2 palette: the opaque colours used (`colors_used`, also `palette.json`'s) are at most the rule's
  limit; a fixed palette allows only its own colours.
- G3 alpha: whether a frame's background is really transparent is `gen.chroma.alpha_verdict`, the
  judgment `gen` reads a generated raw by — `real-alpha` at least 5 % of the pixels and half the
  one-pixel border alpha 0, `no-alpha` none. A sprite or icon frame is `real-alpha` with something
  drawn and its four corners clear; a tile frame is `no-alpha`.
- G4 tile seam (warning): `background.tile.inspect_tile`, the join `background-tile` measures —
  the wrap edge against the tile's own neighbours — asked of each tile frame along x and along y.
  An axis it says needs review warns: a local measure, never proof that a tile repeats cleanly, so
  look at `tiled-3x3.png`.
- G5 stray pixels (warning): the lone pixels of a sprite or icon, `frames.extract.isolated_dots` —
  opaque, with no opaque pixel among their eight neighbours, the dots the YCbCr matte cleanup
  erases. A pixel that touches another only at a corner, as each pixel of a diagonal stroke does,
  is joined to it.
- G6 frames: every frame stands on the same bottom row, heights differ by at most one pixel and
  no two frames are the same. A sprite's or icon's rows and heights are measured inside its safe
  area: a staff raised or a spark into the margin in one frame is not a taller figure (G8 notes
  the margin). A walk cycle (contact, passing, contact, passing) also warns when
  its two contact frames differ by less than 40% of the mean contact↔passing difference: the legs
  barely change sides.
- G6 of one motion — the frames, in their order, are one motion (`--motion`; a walk cycle is one
  too). This is the rule's one place; docs/pixel-draw.md points here. A motion changes the
  silhouette: an arm goes over the head, a blade swings past it, a pose is held for a beat. So:
  * one ground still fails: every frame stands on the same bottom row (inside the safe area, as
    above);
  * a height that differs from the first frame's by more than the pixel G6 allows is asked of the
    judgment the image path makes of the same question — did the body change size, or only its
    pose? — `video.gait_fallback.size_change`, on `body_size` (height, mass, breadth) of each frame
    against the first, inside the safe area. A pose moves the three apart (an arm over the head adds
    height, not mass); a body drawn larger or smaller moves them together. When all three move one
    way by more than that pixel of the first frame's height, it warns (the body changes size — a
    redraw candidate); otherwise it is an info line (the height changes with the pose);
  * frames drawn the same are a hold, an info line.
  Nothing but the ground fails a motion.
- G8 safe area, on a sprite or icon: the engine's safe area (`safe_area`, the margin `prepare`
  keeps around every cell), a target for the body's average size and not a wall. G8 never fails.
  Its judgment is the one the image path makes when it snaps a sprite to pixels,
  `frames.extract.safe_area_fit`, called on each frame's opaque box: past the physical cap (the
  canvas's width, its height less the margin under the floor row) warns, a reroll candidate; past
  the safe area but within the cap is an info line; nothing fails. G8 also warns when a sprite's
  body box — the rows and columns holding at least a quarter as many opaque pixels as the fullest
  one, so a thin tip drops out of it — does not end on the floor row, the safe area's own bottom
  row, where `prepare`'s fit grounds a frame. Below 11 px the margin is 0: the safe area and the
  cap are the canvas.

A failed gate fails the candidate; a warning is reported and passes; an info line is reported and
asks for nothing.
"""
from __future__ import annotations

from typing import Any, Sequence

from sprite_gen.util.hexcolor import format_hex

from .pixel_grid import Pixel, PaletteRule, image_of

OPAQUE_MIN = 128  # the alpha at which a pixel is solid, as the engine reads solid pixels
HEIGHT_SPREAD_MAX = 1
WALK_CONTACT_RATIO_MIN = 0.4
BODY_LINE_SHARE = 0.25
# What pixel-draw draws (`--kind`, `pixel_draw.KINDS`): a sprite or an icon on a transparent background, a tile
# that repeats, or an effect over frames of its own. The gates judge each kind by these names.
SPRITE, ICON, TILE, EFFECT = KINDS = ("sprite", "icon", "tile", "effect")

Frame = Sequence[Sequence[Pixel]]


def _opaque(pixel: Pixel) -> bool:
    return pixel[3] >= OPAQUE_MIN


def colors_used(frames: dict[str, Frame]) -> list[str]:
    """The opaque colours of the frames, `#RRGGBB`, sorted: what G2 counts and `palette.json` lists."""
    return sorted({format_hex(p) for frame in frames.values() for row in frame for p in row if _opaque(p)})


def g2_palette(frames: dict[str, Frame], rule: PaletteRule) -> dict[str, Any]:
    used = colors_used(frames)
    off = [c for c in used if rule.fixed and c not in rule.colors]
    return {"ok": len(used) <= rule.limit and not off, "colors_used": len(used), "limit": rule.limit,
            "palette": rule.name, "off_palette": off}


def _frame_alpha(frame: Frame) -> dict[str, Any]:
    # Imported here: the judgment is `gen`'s, made in one place (`chroma` pulls in the matte).
    from .chroma import alpha_verdict

    height, width = len(frame), len(frame[0])
    opaque = sum(1 for row in frame for p in row if _opaque(p))
    corners = (frame[0][0], frame[0][width - 1], frame[height - 1][0], frame[height - 1][width - 1])
    return {
        "opaque_pixels": opaque,
        "opaque_fraction": round(opaque / (width * height), 4),
        "corners_transparent": not any(_opaque(p) for p in corners),
        **alpha_verdict(image_of(frame).getchannel("A")),
    }


def g3_alpha(frames: dict[str, Frame], kind: str) -> dict[str, Any]:
    from .chroma import RAW_ALPHA_NONE, RAW_ALPHA_REAL

    per = {name: _frame_alpha(frame) for name, frame in frames.items()}
    if kind == TILE:
        ok = all(m["verdict"] == RAW_ALPHA_NONE for m in per.values())
    elif kind == EFFECT:
        ok = (any(m["opaque_pixels"] > 0 for m in per.values())
              and all(m["corners_transparent"] and (m["opaque_pixels"] == 0 or m["verdict"] == RAW_ALPHA_REAL)
                      for m in per.values()))
    else:
        ok = all(m["opaque_pixels"] > 0 and m["corners_transparent"] and m["verdict"] == RAW_ALPHA_REAL
                 for m in per.values())
    return {"ok": ok, "kind": kind, "frames": per}


def g4_seam(frames: dict[str, Frame]) -> dict[str, Any]:
    # Imported here: the measure is `background-tile`'s, made in one place.
    from sprite_gen.background.tile import inspect_tile

    per = {name: {axis: inspect_tile(image_of(frame), axis) for axis in ("x", "y")} for name, frame in frames.items()}
    review = _needs_review(per)
    return {"warn": bool(review), "needs_review": list(review), "frames": per}


def _needs_review(per: dict[str, dict[str, dict[str, Any]]]) -> dict[str, list[str]]:
    """`<frame> <axis>` of every join `inspect_tile` did not pass, with the reasons it gave."""
    return {f"{name} {axis}": report["review_reasons"] for name, axes in per.items() for axis, report in axes.items()
            if report["status"] != "pass"}


def _g4_line(g4: dict[str, Any]) -> str:
    said = "; ".join(f"{where}: {' '.join(reasons)}" for where, reasons in _needs_review(g4["frames"]).items())
    return f"G4 tile seam (look at tiled-3x3.png): {said}"


def isolated_pixels(frame: Frame) -> int:
    # Imported here: the judgment is the matte cleanup's, made in one place.
    from sprite_gen.frames.extract import isolated_dots

    opaque = image_of(frame).getchannel("A").point(lambda a: 1 if a >= OPAQUE_MIN else 0)
    return isolated_dots(opaque).histogram()[255]


def g5_isolated(frames: dict[str, Frame]) -> dict[str, Any]:
    per = {name: isolated_pixels(frame) for name, frame in frames.items()}
    total = sum(per.values())
    return {"warn": total > 0, "isolated_pixels": total, "frames": per}


def _bbox_rows(frame: Frame, box: Sequence[int] | None) -> tuple[int, int] | None:
    left, top, right, bottom = box or (0, 0, len(frame[0]) - 1, len(frame) - 1)
    rows = [y for y in range(top, bottom + 1) if any(_opaque(p) for p in frame[y][left:right + 1])]
    return (rows[0], rows[-1]) if rows else None


def _difference(a: Frame, b: Frame) -> int:
    return sum(1 for y in range(len(a)) for x in range(len(a[0])) if a[y][x] != b[y][x])


def _sizes(frames: dict[str, Frame], heights: dict[str, int], box: Sequence[int] | None) -> dict[str, dict[str, Any]]:
    """Per frame whose height differs from the first frame's by more than HEIGHT_SPREAD_MAX: how much
    larger its body is than the first's, by the image path's reading (`gait_fallback.size_change`: the
    least of height, mass and breadth when all three move one way, 0 when they part), inside `box`."""
    # Imported here: the judgment is the video path's, made in one place (it pulls in NumPy).
    from sprite_gen.video.gait_fallback import body_size, size_change

    names = list(frames)
    first = names[0]
    crop = (box[0], box[1], box[2] + 1, box[3] + 1) if box else None

    def size(name: str):
        image = image_of(frames[name])
        return body_size(image.crop(crop) if crop else image)

    out = {}
    for name in names[1:]:
        if abs(heights[name] - heights[first]) > HEIGHT_SPREAD_MAX:
            change = size_change(size(first), [size(name)])
            out[name] = {key: change[key] for key in ("change", "height", "mass", "breadth")}
    return out


def g6_frames(frames: dict[str, Frame], *, walk_cycle: bool, box: Sequence[int] | None = None,
              motion: bool = False) -> dict[str, Any]:
    """`box` (first and last column and row) is where the rows and heights are measured: a sprite's
    or icon's safe area, the whole frame without one. `motion` (a walk cycle is one) takes the rule of
    one motion in this module's header."""
    names = list(frames)
    spans = {name: _bbox_rows(frames[name], box) for name in names}
    baselines = {name: (span[1] if span else None) for name, span in spans.items()}
    heights = {name: (span[1] - span[0] + 1 if span else 0) for name, span in spans.items()}
    identical = [[names[i], names[j]] for i in range(len(names)) for j in range(i + 1, len(names))
                 if frames[names[i]] == frames[names[j]]]
    spread = max(heights.values()) - min(heights.values())
    grounded = len(set(baselines.values())) == 1 and None not in baselines.values()
    result: dict[str, Any] = {
        "ok": grounded and spread <= HEIGHT_SPREAD_MAX and not identical,
        "baselines": baselines, "heights": heights, "height_spread": spread, "identical_pairs": identical,
        "measured_in": list(box) if box else None,
    }
    if motion or walk_cycle:
        sizes = _sizes(frames, heights, box)
        first = heights[names[0]]
        resized = [name for name, size in sizes.items() if abs(size["change"]) * first > HEIGHT_SPREAD_MAX]
        result.update(ok=grounded, rule="motion", size_change=sizes, resized=resized,
                      posed=[name for name in sizes if name not in resized], holds=identical)
    if walk_cycle:
        a, b, c, d = (frames[n] for n in names)
        contact = _difference(a, c)
        crossing = (_difference(a, b) + _difference(b, c) + _difference(c, d) + _difference(d, a)) / 4
        ratio = round(contact / crossing, 3) if crossing else 0.0
        result["walk"] = {"warn": ratio < WALK_CONTACT_RATIO_MIN, "contact_difference": contact,
                          "contact_passing_difference": round(crossing, 1), "ratio": ratio,
                          "min": WALK_CONTACT_RATIO_MIN}
    return result


def safe_area(width: int, height: int) -> dict[str, Any]:
    """The engine's safe area of a width x height canvas, as `prepare` keeps it around a cell
    (`normalize_cell`: DEFAULT_SAFE_MARGIN_RATIO of each side, floored — 32 px keeps 3 and 26
    inside). `box` is its first and last column and row, `floor_row` its bottom row."""
    # Imported here: `prepare` owns the margin and pulls in the row machinery.
    from .prepare import normalize_cell

    cell = normalize_cell({"width": width, "height": height}, width, None)
    mx, my = cell["safe_margin_x"], cell["safe_margin_y"]
    return {"margin": [mx, my], "size": [width - 2 * mx, height - 2 * my],
            "box": [mx, my, width - 1 - mx, height - 1 - my], "floor_row": height - 1 - my}


def _body_lines(counts: list[int]) -> list[int]:
    fullest = max(counts)
    return [i for i, n in enumerate(counts) if n and n >= BODY_LINE_SHARE * fullest]


def _frame_boxes(frame: Frame) -> dict[str, Any]:
    """The opaque box of a frame and its size, and its body box. The opaque box is the image path's,
    `frames.extract.solid_alpha_bbox` (alpha at least OPAQUE_MIN), its last column and row inclusive."""
    # Imported here, as `safe_area_fit` below: the box is the image path's, measured in one place.
    from sprite_gen.frames.extract import solid_alpha_bbox

    box = solid_alpha_bbox(image_of(frame), OPAQUE_MIN)
    if box is None:
        return {"bbox": None, "size": [0, 0], "body_box": None}
    left, top, right, bottom = box
    height, width = len(frame), len(frame[0])
    rows = [sum(1 for p in row if _opaque(p)) for row in frame]
    columns = [sum(1 for y in range(height) if _opaque(frame[y][x])) for x in range(width)]
    body_rows, body_columns = _body_lines(rows), _body_lines(columns)
    return {
        "bbox": [left, top, right - 1, bottom - 1],
        "size": [right - left, bottom - top],
        "body_box": [body_columns[0], body_rows[0], body_columns[-1], body_rows[-1]],
    }


def g8_safe_area(frames: dict[str, Frame], kind: str, area: dict[str, Any]) -> dict[str, Any]:
    # Imported here, as `prepare` above: the judgment is the image path's, made in one place.
    from sprite_gen.frames.extract import safe_area_fit

    names = list(frames)
    per = {name: _frame_boxes(frames[name]) for name in names}
    first = frames[names[0]]
    mx, my = area["margin"]
    fit = safe_area_fit([tuple(per[name]["size"]) for name in names], len(first[0]), len(first), mx, my)
    floor = area["floor_row"] if kind == SPRITE else None
    off_floor = {name: m["body_box"][3] - floor for name, m in per.items()
                 if floor is not None and m["body_box"] and m["body_box"][3] != floor}
    return {"warn": bool(fit["over"] or off_floor), "margin": area["margin"], "safe_area": fit["safe"],
            "physical_cap": fit["cap"], "safe_box": area["box"], "floor_row": floor,
            "over_cap": [names[i] for i in fit["over"]], "past_safe_area": [names[i] for i in fit["soft"]],
            "off_floor": off_floor, "frames": per}


def _g8_lines(g8: dict[str, Any]) -> tuple[list[str], list[str]]:
    """G8's warnings (a reroll candidate) and its info lines (nothing is asked), in the image path's words."""
    def sizes(names: list[str]) -> str:
        return ", ".join(f"{name}:{g8['frames'][name]['size'][0]}x{g8['frames'][name]['size'][1]}" for name in names)

    warnings, info = [], []
    if g8["over_cap"]:
        width, height = g8["physical_cap"]
        warnings.append(f"G8: frames exceed the physical cap {width}x{height} (reroll candidates): {sizes(g8['over_cap'])}")
    if g8["off_floor"]:
        where = ", ".join(f"{name} {abs(d)} px {'below' if d > 0 else 'above'} it" for name, d in g8["off_floor"].items())
        warnings.append(f"G8 the feet are not on the floor row (the safe area's bottom row): {where}")
    if g8["past_safe_area"]:
        width, height = g8["safe_area"]
        info.append(f"G8: frames exceed the safe area {width}x{height} but fit within the margin zone (informational, "
                    f"no action): {sizes(g8['past_safe_area'])}")
    return warnings, info


def _g6_motion_lines(g6: dict[str, Any]) -> tuple[list[str], list[str]]:
    """G6's warning (a body drawn at another size) and info lines (a height that changed with the pose,
    a hold) for one motion."""
    first = next(iter(g6["heights"]))
    warnings, info = [], []
    if g6["resized"]:
        said = ", ".join(f"{name} {g6['size_change'][name]['change']:+.0%}" for name in g6["resized"])
        warnings.append("G6 the body changes size, not only its pose - its height, mass and breadth all grow or "
                        f"shrink by more than a pixel: {said} against {first}")
    if g6["posed"]:
        said = ", ".join(f"{name} {g6['heights'][name]} px" for name in g6["posed"])
        info.append("G6 the height changes with the pose, not the body's size (informational, no action): "
                    f"{said} against {first} {g6['heights'][first]} px")
    if g6["holds"]:
        info.append("G6 frames drawn the same, a hold (informational, no action): "
                    + ", ".join(f"{a}={b}" for a, b in g6["holds"]))
    return warnings, info


def evaluate(frames: dict[str, Frame], *, kind: str, rule: PaletteRule, walk_cycle: bool,
             motion: bool = False) -> dict[str, Any]:
    """Every gate of one candidate. `ok` is G2, G3 and G6 together; `warnings` say what G4, G5, the
    walk check, G6 of a motion and G8 found that may want a redraw, `info` what G6 of a motion and G8
    found that asks for nothing, one line each. `motion`: the frames are one motion (the header)."""
    gates: dict[str, Any] = {"G2": g2_palette(frames, rule), "G3": g3_alpha(frames, kind)}
    warnings: list[str] = []
    info: list[str] = []
    first = next(iter(frames.values()))
    area = None if kind in (TILE, EFFECT) else safe_area(len(first[0]), len(first))
    if kind == TILE:
        gates["G4"] = g4_seam(frames)
        if gates["G4"]["warn"]:
            warnings.append(_g4_line(gates["G4"]))
    elif kind != EFFECT:
        gates["G5"] = g5_isolated(frames)
        if gates["G5"]["warn"]:
            warnings.append(f"G5 {gates['G5']['isolated_pixels']} stray pixel(s) with no opaque neighbour")
    if kind == EFFECT:
        gates["G6"] = {"ok": 2 <= len(frames) <= 8 and any(frame != first for frame in frames.values()),
                       "rule": "2..8 frames with a visible change; extent, height and empty frames may differ"}
    elif len(frames) > 1:
        gates["G6"] = g6_frames(frames, walk_cycle=walk_cycle, box=area["box"] if area else None, motion=motion)
        walk = gates["G6"].get("walk")
        if walk and walk["warn"]:
            warnings.append(f"G6 weak leg alternation: the contact frames differ by {walk['contact_difference']} "
                            f"pixels, {walk['ratio']:.0%} of the contact-passing difference (under "
                            f"{WALK_CONTACT_RATIO_MIN:.0%}) — touch up the legs")
        if gates["G6"].get("rule") == "motion":
            g6_warnings, g6_info = _g6_motion_lines(gates["G6"])
            warnings += g6_warnings
            info += g6_info
    if area is not None:
        gates["G8"] = g8_safe_area(frames, kind, area)
        g8_warnings, g8_info = _g8_lines(gates["G8"])
        warnings += g8_warnings
        info += g8_info
    failed = [name for name in ("G2", "G3", "G6") if name in gates and not gates[name]["ok"]]
    return {"ok": not failed, "failed": failed, "warnings": warnings, "info": info, **gates}
