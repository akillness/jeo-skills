# SPDX-License-Identifier: Apache-2.0
"""`sprite-gen pixel-draw` — Claude Opus draws pixel art of 8..48 px directly, as a pixel grid.

The model writes a palette and rows of keys (docs/pixel-draw.md); code checks every answer and
renders it. Measured 2026-10-12 on `claude-opus-5-5` (250 calls, 12 subjects, 16..48 px): single
assets come out shippable, effort high costs a third of xhigh for the same judged quality, and
about one answer in eight breaks the grid (a row one key too long or short, a key outside the
palette, output cut short) — so every answer goes through the gates below, and a broken row is
asked for again on its own.

One run, `--candidates` K answers to the same request:

1. Each candidate is drawn once at `--effort`, in one call of at most FRAMES_MAX frames — the
   frames of one answer share a palette and a design. A set of more frames (up to FRAMES_TOTAL_MAX)
   is drawn over several calls in order: each later call writes the first call's palette again
   (`pixel_grid.hold_palette`: a colour added is refused and its rows repaired) and is shown the
   first frame and the frames just before its own (`drawn_lines`). An answer that used all
   `--max-tokens` thinking and wrote nothing is drawn once more one effort lower; a refusal is
   reported as it came.
2. G1 parse. Row issues are repaired one row at a time (`ROW <frame> <n>: …`, two rounds at most);
   an answer still broken, or broken beyond its rows, is drawn once more. Each call is drawn at
   most twice; a call that fails ends its candidate.
3. G2 palette, G3 alpha and G6 frames fail a candidate, on every frame once all are drawn; G4 tile
   seam, G5 stray pixels, the walk cycle's leg alternation and G8 safe area (a frame past the
   physical cap, a sprite off the floor row) warn, and G8 notes a frame past the safe area within
   the cap in an info line. Frames of one motion (`--motion`, a walk cycle) take G6's motion rule
   (`pixel_gates` header). G3, G4, G5, G6's size reading and G8 are judgments sprite-gen already
   makes elsewhere, called rather than copied (`pixel_gates`). The prompt gives a sprite or icon the
   engine's safe area (`safe_area_lines`) in rows and columns, as a target for the body's size that
   a pose may go past.
4. G7: of two or more candidates that passed, one vision call (effort low) picks, or a person
   does (`--pick human`). One that passed alone is the pick.

Every model call is kept under `calls/` and is read back instead of asked again on `--resume`;
a batch (`--batch`, half price) is recorded under `batches/` the moment it is submitted, so a run
cut short collects it on `--resume` instead of buying it twice. Nothing falls back to another
model, provider or effort beyond the one lowered draw above.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import random
import re
import shutil
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Generator

from PIL import Image, ImageDraw

from sprite_gen.qa.preview import checker
from sprite_gen.spec.runio import atomic_write_text
from sprite_gen.util.cli_kwargs import namespace_from_kwargs
from . import anthropic_api as api
from . import claude_login, refusal
from .anthropic_api import EFFORTS, ApiError, Reply
from .base import announce_api_billing, flags_over_spec, print_json
from .pixel_gates import EFFECT, KINDS, SPRITE, TILE, colors_used, evaluate, safe_area
from .pixel_grid import (
    FORMATS, PREVIEW_COLUMNS, Grid, Issue, PaletteRule, check_rows, frame_name_ok, frame_pixels, hold_palette,
    joined, palette_rule, parse_answer, parse_row_answers, png_bytes, preview_scale, preview_strip, read_grid_text,
    recovered, row_issues, row_text, save_gif, splice, structural, tiled_3x3, to_text, image_of,
)
from sprite_gen.util.console import utf8_streams

VERB = "pixel-draw"
SIZE_MIN, SIZE_MAX, SIZE_DEFAULT = 8, 48, 32
FRAMES_MAX = 4  # frames one call draws: one answer, one palette, one design
FRAMES_TOTAL_MAX = 64  # frames one request draws, FRAMES_MAX a call
DRAWN_SHOWN = 4  # frames just before a later call's own that it is shown, with the first frame
# Characters of a written grid per token, for the estimate said before a long set is drawn: Opus's
# own answers recorded 2026-10-12..14 wrote 2.0 characters a token at 32 px, 2.5 at 48 px.
GRID_CHARS_PER_TOKEN = 2
EFFECT_FRAMES_MAX = 8
EFFECT_FRAMES = ("birth", "peak", "decay", "gone")
CANDIDATES_MIN, CANDIDATES_MAX, CANDIDATES_DEFAULT = 1, 6, 2
EFFORT_CHOICES = ("medium", "high", "xhigh")
EFFORT_DEFAULT = "high"
LOWER_EFFORT = {"max": "xhigh", "xhigh": "high", "high": "medium", "medium": "low"}
MAX_TOKENS_SINGLE, MAX_TOKENS_MULTI = 32000, 64000
MAX_TOKENS_MIN = 1024
REPAIR_EFFORT, REPAIR_MAX_TOKENS, REPAIR_ROUNDS = "medium", 16000, 2
PICK_EFFORT, PICK_MAX_TOKENS = "low", 16000
PICKS = ("vision", "human")
BATCH_WAIT_DEFAULT = 3600.0
BATCH_POLL_SECONDS = 30.0
GIF_FRAME_MS = 150
DURATION_MS_MIN = 10  # a GIF times its frames in hundredths of a second
SPEC_KEYS = ("subject", "size", "kind", "frames", "walk_cycle", "palette", "style", "motion", "duration_ms")
RUN_FLAGS = ("candidates", "effort", "answer_format", "batch", "max_tokens", "pick")
REPORT_KIND = "sprite-gen-pixel-draw-report"

# The style sentence a kind is drawn in unless `--style` gives one; what a kind must be — a transparent
# background, the safe area and the floor, a tile's seams, an effect's centre — stays outside it.
SPRITE_STYLE = ("clean, readable pixel art for a 2D RPG: a dark (not pure black) outline around the silhouette, "
                "2-3 shades per material, light from the top-left, no anti-aliasing noise and no stray single pixels.")
TILE_STYLE = ("clean, readable pixel art for a 2D RPG: 2-3 shades per material, light from the top-left, no noisy "
              "single-pixel speckle.")

SYSTEM = ("You are an expert pixel artist who draws game assets directly as pixel data. "
          "What you write is converted to a PNG mechanically, pixel for pixel, with no cleanup: "
          "what you write is exactly what ships.")

PICK_SCHEMA = {
    "type": "object",
    "properties": {
        "candidates": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "label": {"type": "string"},
                "subject_read": {"type": "integer", "enum": [1, 2, 3, 4, 5]},
                "craft": {"type": "integer", "enum": [1, 2, 3, 4, 5]},
                "consistency": {"type": "integer", "enum": [0, 1, 2, 3, 4, 5]},
                "verdict": {"type": "string", "enum": ["ship", "touch_up", "redraw"]},
                "note": {"type": "string"},
            },
            "required": ["label", "subject_read", "craft", "consistency", "verdict", "note"],
            "additionalProperties": False}},
        "best": {"type": "string"},
        "any_shippable": {"type": "boolean"},
    },
    "required": ["candidates", "best", "any_shippable"],
    "additionalProperties": False,
}


# ----------------------------------------------------------------------------- the request

@dataclass(frozen=True)
class PixelRequest:
    subject: str
    size: int
    kind: str
    frames: tuple[str, ...]
    walk_cycle: bool
    palette: PaletteRule
    candidates: int
    effort: str
    answer_format: str
    batch: bool
    max_tokens: int
    pick: str
    style: str | None = None  # in place of the kind's style sentence, in the drawing and the pick
    motion: str | None = None  # the frames, in order, are this one motion
    poses: dict[str, str] = field(default_factory=dict)  # frame name -> what that frame shows
    duration_ms: int = GIF_FRAME_MS  # each frame of anim.gif

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["frames"] = list(self.frames)
        data["palette"] = self.palette.to_dict()
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PixelRequest":
        palette = data["palette"]
        return cls(**{**data, "frames": tuple(data["frames"]),
                      "palette": PaletteRule(palette["name"], palette["limit"], tuple(palette["colors"]))})


def _refuse(message: str) -> SystemExit:
    return SystemExit(f"{VERB}: {message}")


def _frames(value: Any, kind: str = SPRITE) -> tuple[tuple[str, ...], dict[str, str]]:
    """The frame names, and what each frame shows where a spec gave it (`{"name": ..., "pose": ...}`)."""
    items = [n.strip() for n in value.split(",")] if isinstance(value, str) else value
    if not isinstance(items, list) or not items:
        raise _refuse("--frames takes comma-separated frame names, e.g. down,up,left,right")
    names, poses = [], {}
    for item in items:
        if isinstance(item, dict) and set(item) == {"name", "pose"} and isinstance(item["name"], str) \
                and isinstance(item["pose"], str) and item["pose"].strip():
            names.append(item["name"])
            poses[item["name"]] = item["pose"].strip()
        elif isinstance(item, str) and item:
            names.append(item)
        else:
            raise _refuse('a frame is a name or {"name": ..., "pose": ...} with a pose in words, got ' + repr(item))
    bad = [n for n in names if not frame_name_ok(n)]
    if bad:
        raise _refuse("frame names are letters, digits, '_' or '-' (at most 32): " + ", ".join(map(repr, bad)))
    if len(set(names)) != len(names):
        raise _refuse("frame names must differ: " + ", ".join(names))
    if kind == EFFECT and not 2 <= len(names) <= EFFECT_FRAMES_MAX:
        raise _refuse(f"an effect needs 2..{EFFECT_FRAMES_MAX} frames, got {len(names)}")
    if kind != EFFECT and len(names) > FRAMES_TOTAL_MAX:
        raise _refuse(f"at most {FRAMES_TOTAL_MAX} frames, got {len(names)}")
    return tuple(names), poses


def _duration(value: Any) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < DURATION_MS_MIN:
        raise _refuse(f"--duration-ms is at least {DURATION_MS_MIN}, got {value!r}")
    return value


def _words(value: Any, flag: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise _refuse(f"{flag} is a sentence of words, got {value!r}")
    return value.strip()


def _motion(motion: str | None, kind: str, frames: tuple[str, ...]) -> None:
    if motion is not None and kind == EFFECT:
        raise _refuse("--motion does not apply to an effect (its frames are a lifetime already)")
    if motion is not None and len(frames) < 2:
        raise _refuse(f"--motion is two or more frames in order, got {len(frames)}")


def _load_spec(path: Path) -> dict[str, Any]:
    try:
        spec = json.loads(Path(path).expanduser().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise _refuse(f"--spec {path}: {exc}") from exc
    if not isinstance(spec, dict):
        raise _refuse(f"--spec {path}: expected a JSON object with {', '.join(SPEC_KEYS)}")
    unknown = sorted(set(spec) - set(SPEC_KEYS))
    if unknown:
        raise _refuse(f"--spec {path}: unknown key(s) {', '.join(unknown)}; a spec holds {', '.join(SPEC_KEYS)}")
    if isinstance(spec.get("palette"), list):
        spec["palette"] = ",".join(spec["palette"])
    return spec


def resolve_request(args: argparse.Namespace) -> PixelRequest:
    spec = _load_spec(args.spec) if args.spec else {}
    given = {key: getattr(args, key) for key in SPEC_KEYS if getattr(args, key) is not None}
    merged = flags_over_spec(spec, given, verb=VERB, source="--spec")
    subject = merged.get("subject")
    if not isinstance(subject, str) or not subject.strip():
        raise _refuse("nothing to draw — pass --subject TEXT or --spec FILE with a subject")
    size = merged.get("size", SIZE_DEFAULT)
    if not isinstance(size, int) or isinstance(size, bool) or not SIZE_MIN <= size <= SIZE_MAX:
        raise _refuse(f"--size is {SIZE_MIN}..{SIZE_MAX} pixels, got {size!r}")
    kind = merged.get("kind", SPRITE)
    if kind not in KINDS:
        raise _refuse(f"--kind is one of {', '.join(KINDS)}, got {kind!r}")
    frames, poses = _frames(merged["frames"], kind) if "frames" in merged else (
        EFFECT_FRAMES if kind == EFFECT else (kind,), {})
    style, motion = _words(merged.get("style"), "--style"), _words(merged.get("motion"), "--motion")
    _motion(motion, kind, frames)
    duration_ms = _duration(merged.get("duration_ms", GIF_FRAME_MS))
    walk_cycle = bool(merged.get("walk_cycle", False))
    if walk_cycle and kind == EFFECT:
        raise _refuse("--walk-cycle does not apply to an effect")
    if walk_cycle and len(frames) != 4:
        raise _refuse(f"--walk-cycle is four frames (contact, passing, contact, passing), got {len(frames)}")
    try:
        rule = palette_rule(str(merged.get("palette", "free")))
    except ValueError as exc:
        raise _refuse(str(exc)) from exc
    candidates = CANDIDATES_DEFAULT if args.candidates is None else args.candidates
    if not CANDIDATES_MIN <= candidates <= CANDIDATES_MAX:
        raise _refuse(f"--candidates is {CANDIDATES_MIN}..{CANDIDATES_MAX}, got {candidates}")
    max_tokens = args.max_tokens or (MAX_TOKENS_SINGLE if len(frames) == 1 else MAX_TOKENS_MULTI)
    if not MAX_TOKENS_MIN <= max_tokens <= api.MODEL_MAX_TOKENS:
        raise _refuse(f"--max-tokens is {MAX_TOKENS_MIN}..{api.MODEL_MAX_TOKENS}, got {max_tokens}")
    return PixelRequest(
        subject=subject.strip(), size=size, kind=kind, frames=frames, walk_cycle=walk_cycle, palette=rule,
        candidates=candidates, effort=args.effort or EFFORT_DEFAULT, answer_format=args.answer_format or "chargrid",
        batch=bool(args.batch), max_tokens=max_tokens, pick=args.pick or "vision", style=style, motion=motion,
        poses=poses, duration_ms=duration_ms,
    )


# ----------------------------------------------------------------------------- calls of at most four frames

@dataclass(frozen=True)
class Part:
    """One call's share of a request's frames: call `number` of `count`."""

    number: int
    count: int
    frames: tuple[str, ...]


def call_parts(request: PixelRequest) -> list[Part]:
    """The request's frames, FRAMES_MAX a call, in order. An effect is one call of its 2..8 frames."""
    frames = request.frames
    if request.kind == EFFECT or len(frames) <= FRAMES_MAX:
        return [Part(1, 1, frames)]
    chunks = [frames[i:i + FRAMES_MAX] for i in range(0, len(frames), FRAMES_MAX)]
    return [Part(number, len(chunks), chunk) for number, chunk in enumerate(chunks, 1)]


def shown_frames(drawn: Grid) -> list[str]:
    """What a later call is shown of the frames already drawn: the first, and the DRAWN_SHOWN just before
    its own. At 48 px a frame written as keys is about 1,200 tokens (GRID_CHARS_PER_TOKEN), so the five
    add about 6,000 input tokens to a call whose answer and thinking run to tens of thousands."""
    names = list(drawn.frames)
    return list(dict.fromkeys([names[0], *names[-DRAWN_SHOWN:]]))


def drawn_lines(request: PixelRequest, drawn: Grid) -> list[str]:
    """The palette and the shown frames already drawn, written as the answer writes them."""
    names = shown_frames(drawn)
    if request.answer_format == "chargrid":
        block = "```reference\n" + to_text(replace(drawn, frames={n: drawn.frames[n] for n in names})) + "```"
    else:
        palette = json.dumps(["transparent" if c is None else c for c in drawn.palette.values()])
        frames = ",\n".join(f' "{n}": [\n' + ",\n".join("  [" + ", ".join(row) + "]" for row in drawn.frames[n]) + "]"
                            for n in names)
        block = "```reference\n" + f'{{"palette": {palette}, "frames": {{\n{frames}}}}}' + "\n```"
    return ["Frames already drawn - the first frame and the frames just before this answer's - with the palette, "
            "for reference; do not write them again:", block]


# ----------------------------------------------------------------------------- prompts

def _format_spec(request: PixelRequest, frames: tuple[str, ...]) -> str:
    w = h = request.size
    names = ", ".join(frames)
    if request.answer_format == "chargrid":
        return (
            "Output format: exactly one fenced code block tagged `pixels`, and nothing after it:\n"
            "```pixels\nPALETTE\n. transparent\na #RRGGBB\nb #RRGGBB\n...\n"
            f"FRAME <frame name>\n<{h} lines, each exactly {w} characters>\n...\nEND\n```\n"
            "- Each palette line is one key character and one #RRGGBB color. Keys are single "
            "characters from a-z, A-Z, 0-9; `.` is always transparent and is never redefined.\n"
            f"- Each frame is exactly {h} lines of exactly {w} characters, every character a "
            "palette key, with no spaces.\n"
            f"- Frames in this order: {names}. Write `FRAME <name>` before each frame and `END` "
            "once after the last frame.")
    return (
        "Output format: exactly one fenced code block tagged `json` holding one JSON object, "
        "and nothing after it:\n"
        '{"palette": ["transparent", "#RRGGBB", ...], "frames": {"<frame name>": '
        f"[[...{w} integers...], ...{h} rows...]}}}}\n"
        '- palette[0] is always "transparent"; every other entry is a #RRGGBB color.\n'
        f"- Each frame is a list of exactly {h} rows; each row is a list of exactly {w} "
        "integers indexing into palette.\n"
        f"- Frames: {names}.")


def safe_area_lines(request: PixelRequest) -> list[str]:
    """The engine's safe area of a sprite or icon (`pixel_gates.safe_area`, G8), in rows and columns
    counted from 1: a target for the body's average size that a pose may go past, as far as the canvas
    edge, and a sprite's feet on its bottom row."""
    size = request.size
    area = safe_area(size, size)
    margin, inner, floor = area["margin"][0], area["size"][0], area["floor_row"] + 1
    sprite = request.kind == SPRITE
    if margin == 0:
        lines = [f"Safe area: at {size}x{size} there is no margin; {'the subject' if sprite else 'the icon'} may use "
                 "the whole canvas, with the four corner pixels transparent."]
    else:
        first, last = margin + 1, size - margin
        body = "the subject's body" if sprite else "the icon"
        lines = [f"Safe area: draw {body} about the size of the central {inner}x{inner} pixels - rows {first}-{last} "
                 f"and columns {first}-{last}, counting rows and columns from 1 - inside a {margin}-pixel margin on "
                 "every side. That is a target for its average size, not a wall: when a pose or a detail needs the "
                 "room (a raised weapon, a long blade, an effect, a wide stance), it may reach past the safe area into "
                 "the margin, up to the canvas edge. Keep the four corner pixels transparent."]
    if sprite:
        every = " in every frame" if len(request.frames) > 1 else ""
        lines.append(f"Floor: row {floor}, the bottom row of the safe area, is the ground: the feet (or the lowest point "
                     f"the subject rests on) stand on row {floor}{every}.")
    return lines


def _part_line(request: PixelRequest, part: Part) -> str:
    first = request.frames.index(part.frames[0]) + 1
    last = first + len(part.frames) - 1
    which = f"frame {first}" if first == last else f"frames {first}-{last}"
    line = (f"The {len(request.frames)} frames are drawn {FRAMES_MAX} at a time, over {part.count} answers in order. "
            f"This is answer {part.number} of {part.count}: it draws {', '.join(part.frames)} ({which}).")
    if part.number == 1:
        line += " The answers after it keep this answer's palette and design, so choose them for the whole set."
    return line


def generation_prompt(request: PixelRequest, part: Part | None = None, drawn: Grid | None = None) -> str:
    """The drawing prompt; for a set drawn over several calls, the prompt of call `part`, shown the
    frames `drawn` so far after the first call."""
    frames = request.frames
    own = part.frames if part is not None else frames
    lines = [f"Draw: {request.subject}", f"Canvas: exactly {request.size}x{request.size} pixels per frame."]
    if request.kind == EFFECT:
        lines.append(f"Frames: {', '.join(frames)}. One effect's lifetime: appears, grows to a peak, then disappears. "
                     "Keep its origin fixed at the center of every frame. The final frame may be empty. "
                     "Share a palette with several brightness levels for the glow; extent and shape change over time.")
    elif len(frames) > 1:
        lines.append(f"Frames: {', '.join(frames)}. All frames share one palette and show the same subject with "
                     "the same proportions, colors and size.")
    if request.walk_cycle:
        a, b, c, d = frames
        lines.append(f"The frames are one looping walk cycle: {a} = contact pose with the front leg forward, "
                     f"{b} = passing pose (legs together, body one pixel higher), {c} = contact pose with the "
                     f"other leg forward, {d} = passing pose.")
    if request.motion:
        lines.append(f"Motion: the frames, in this order, are one continuous motion: {request.motion}")
    if part is not None and part.count > 1:
        lines.append(_part_line(request, part))
    posed = [(name, request.poses[name]) for name in own if name in request.poses]
    if posed:
        lines += ["What each frame shows:", *(f"- {name}: {pose}" for name, pose in posed)]
    if drawn is not None:
        lines.append("Palette: keep the palette of the frames already drawn, shown below: write it again exactly as "
                     "it is - the same keys and the same colors, no color added and none changed.")
    elif request.palette.fixed:
        lines.append(f"Palette: use only these {len(request.palette.colors)} colors and transparent, no others: "
                     + " ".join(request.palette.colors) + ".")
    else:
        lines.append(f"Palette: at most {request.palette.limit} colors plus transparent.")
    if request.kind == TILE:
        lines.append("This is a tile: fill every pixel (no transparency) and make it repeat seamlessly in a grid, "
                     "so the left edge continues into the right edge and the top edge into the bottom edge. "
                     "No border or outline around the tile.")
        lines.append(f"Style: {request.style or TILE_STYLE}")
    elif request.kind == EFFECT:
        lines.append("Background: transparent. Draw readable clusters of light; detached sparks are intentional. "
                     "No dark outline, no ground plane, no antialiasing. Use the full canvas around its fixed center.")
        if request.style:
            lines.append(f"Style: {request.style}")
    else:
        lines.append("Background: transparent.")
        lines += safe_area_lines(request)
        lines.append(f"Style: {request.style or SPRITE_STYLE}")
    if drawn is not None:
        lines += ["", *drawn_lines(request, drawn)]
    lines += ["", _format_spec(request, own)]
    return "\n".join(lines)


def _ruler(n: int) -> str:
    return "".join(str(i % 10) for i in range(1, n + 1))


def repair_prompt(request: PixelRequest, grid: Grid, issues: list[Issue]) -> tuple[str, list[tuple[str, int]]]:
    """The broken rows with their neighbours (and a column ruler), and the rows to write."""
    order = list(grid.frames)  # this call's frames, in order
    wanted = sorted({(i.frame, i.row) for i in issues}, key=lambda fr: (order.index(fr[0]), fr[1]))
    broken = {(i.frame, i.row): [] for i in issues}
    for issue in issues:
        broken[(issue.frame, issue.row)].append(issue)
    chargrid = grid.fmt == "chargrid"
    parts: list[str] = []
    for name in order:
        rows = grid.frames[name]
        for number, row in enumerate(rows, 1):
            found = broken.get((name, number))
            if not found:
                continue
            what = "; ".join(f"{len(row)} {'characters' if chargrid else 'values'}" if i.code == "row_width"
                             else i.detail for i in found)
            head = f"  row {number} (BROKEN, {what}): "
            context = []
            if number > 1:
                context.append(f"  row {number - 1} ({'also broken' if (name, number - 1) in broken else 'correct'}): "
                               f"{row_text(grid, rows[number - 2])}")
            context.append(head + row_text(grid, row))
            if chargrid:
                context.append("  ruler" + " " * (len(head) - len("  ruler")) + _ruler(max(len(row), grid.width)))
            if number < len(rows):
                context.append(f"  row {number + 1} ({'also broken' if (name, number + 1) in broken else 'correct'}): "
                               f"{row_text(grid, rows[number])}")
            parts.append(f"frame {name} row {number}:\n" + "\n".join(context))
        if len(rows) < grid.height:
            parts.append(f"frame {name} rows {len(rows) + 1}-{grid.height} are MISSING. The rows so far:\n"
                         + "\n".join(f"  row {k}: {row_text(grid, r)}" for k, r in enumerate(rows, 1)))
    if chargrid:
        palette = "\n".join(f"{k} {'transparent' if c is None else c}" for k, c in grid.palette.items())
        unit = f"<exactly {grid.width} characters>"
        rule = f"Every row must be exactly {grid.width} characters, each a palette key."
        how = ("Change as few pixels as possible (a row that is one too long usually has one duplicated pixel; "
               "one too short has one dropped), keep the drawing, use only palette keys.")
    else:
        palette = json.dumps(["transparent" if c is None else c for c in grid.palette.values()])
        unit = f"[<exactly {grid.width} integers>]"
        rule = f"Every row must be a list of exactly {grid.width} integers, each an index into the palette."
        how = "Change as few pixels as possible, keep the drawing, use only palette indices."
    prompt = (
        f"A {grid.width}x{grid.height} pixel-art grid ({request.subject}) failed a mechanical check. {rule}\n"
        "Palette:\n" + palette + "\n\n" + "\n\n".join(parts) + "\n\n"
        f"Answer with one line per row listed below and nothing else, in the form `ROW <frame> <row number>: {unit}`. "
        f"{how} For missing rows, continue the drawing in the same style.\n"
        "Rows to write: " + ", ".join(f"{n} {i}" for n, i in wanted))
    return prompt, wanted


def _kept(request: PixelRequest) -> str:
    """The safe area in the pick's words, so a margin the prompt asked for is not read as wasted canvas."""
    area = safe_area(request.size, request.size)
    if request.kind in (TILE, EFFECT) or area["margin"][0] == 0:
        return ""
    inner = area["size"][0]
    return (f", the body about the size of the central {inner}x{inner}, inside a {area['margin'][0]}-pixel margin a "
            "pose may reach into")


def pick_prompt(request: PixelRequest, labels: list[str]) -> str:
    multi = len(request.frames) > 1
    lines = [
        "You are judging pixel-art game assets for a game asset service.",
        f"The image shows {len(labels)} candidates labelled {', '.join(labels)} for the same request. Each is "
        "enlarged with nearest-neighbour scaling, so every square block is one pixel; the grey checkerboard stands "
        "for transparency.",
    ]
    if request.kind == TILE:
        lines.append("Each tile is shown alone and, to its right, repeated 3x3 so seams are visible.")
    if multi and len(request.frames) > PREVIEW_COLUMNS:
        lines.append(f"Each candidate's {len(request.frames)} frames run left to right in rows of {PREVIEW_COLUMNS}, top "
                     f"to bottom, in this order: {', '.join(request.frames)}.")
    elif multi:
        lines.append(f"Each candidate is a row of {len(request.frames)} frames in this order: {', '.join(request.frames)}.")
    lines += [
        f"The request was: {request.subject} Canvas {request.size}x{request.size} pixels per frame{_kept(request)}.",
        "Score every candidate:",
        "- subject_read 1-5: how clearly it reads as the requested subject (5 instantly, 1 unrecognisable).",
        (f"- craft 1-5: pixel-art craft judged against the style the request asked for - {request.style} - consistent "
         "shading and light, no noise, sensible use of the canvas (5 professional, 3 acceptable indie, 1 broken)."
         if request.style else
         "- craft 1-5: pixel-art craft: clean silhouette and outline, consistent shading and light, no noise, sensible "
         "use of the canvas (5 professional, 3 acceptable indie, 1 broken).")
        + (" For tiles, visible seams in the 3x3 repeat count against craft." if request.kind == TILE else ""),
        ("- consistency 1-5: a readable lifetime around a fixed center, with a peak and decay; "
         "changing extent, detached sparks and an empty final frame are intentional." if request.kind == EFFECT else
         "- consistency 1-5: the same subject, proportions and colours across frames, and the frames following one "
         f"another as one motion in their order ({request.motion})." if multi and request.motion else
         "- consistency 1-5: the same subject, proportions and colours across frames, and correct poses/directions "
         "for the frame names." if multi else "- consistency: 0 (single frame)."),
        "- verdict: ship (usable in a game as is), touch_up (usable after a few pixel fixes), redraw (not usable).",
        "- note: one short sentence naming the main flaw or strength.",
        "Then best: the label of the candidate you would ship; any_shippable: whether at least one is ship or touch_up.",
        "Judge only what is visible.",
    ]
    return "\n".join(lines)


# ----------------------------------------------------------------------------- calls

def _sha(body: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _prompt_text(body: dict[str, Any]) -> str:
    content = body["messages"][0]["content"]
    if isinstance(content, str):
        return content
    return "\n".join(block.get("text", "") for block in content if block.get("type") == "text")


@dataclass
class Ask:
    """A generation call a candidate is waiting on."""

    call_id: str
    candidate: str
    effort: str
    body: dict[str, Any]


class Unfinished(Exception):
    """A batch the run cannot finish now: still processing after --batch-wait, or results not read."""

    def __init__(self, batch_id: str, waited: float, why: str) -> None:
        super().__init__(batch_id)
        self.batch_id = batch_id
        self.waited = waited
        self.why = why


class Calls:
    """Every model call of a run: asked on `credential` (`claude_login.resolve_credential`), or read back
    from `calls/<id>.json` on --resume. `announce` runs once, before the first request that leaves —
    a run read back whole asks nothing and says nothing."""

    def __init__(self, run_dir: Path, credential: claude_login.Credential, *, sleep: Callable[[float], None],
                 note: Callable[[str], None], announce: Callable[[], None] = lambda: None) -> None:
        self.dir = run_dir / "calls"
        self.batch_dir = run_dir / "batches"
        self.credential = credential
        self.token = credential.token
        self.sleep = sleep
        self.note = note
        self.announce = announce
        self.announced = False
        self.announce_lock = threading.Lock()
        self.lock = threading.Lock()
        self.summaries: dict[str, dict[str, Any]] = {}
        self.batches: dict[str, dict[str, Any]] = {}
        self.dir.mkdir(parents=True, exist_ok=True)
        for path in sorted(self.batch_dir.glob("*.json")):
            record = json.loads(path.read_text(encoding="utf-8"))
            self.batches[record["id"]] = record

    def _path(self, call_id: str) -> Path:
        return self.dir / f"{call_id}.json"

    def _leaving(self) -> None:
        """Say the charge once, before the first request leaves. A thread that comes while it is being said
        waits until it has been: no request of any candidate leaves ahead of the line."""
        with self.announce_lock:
            if not self.announced:
                self.announce()
                self.announced = True

    def cached(self, call_id: str, body: dict[str, Any]) -> Reply | None:
        path = self._path(call_id)
        if not path.is_file():
            return None
        record = json.loads(path.read_text(encoding="utf-8"))
        if record.get("outcome") != "reply":
            return None
        if record.get("body_sha256") != _sha(body):
            raise _refuse(f"--resume: {path} was asked with another request than this run builds now; "
                          "start a new --out-dir")
        with self.lock:
            self.summaries[call_id] = self._summary(record)
        return Reply(**record["reply"])

    @staticmethod
    def _summary(record: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in record.items() if k not in ("prompt", "reply", "body_sha256")}

    def save(self, call_id: str, purpose: str, candidate: str | None, body: dict[str, Any],
             outcome: Reply | ApiError, *, image: str | None = None) -> None:
        reply = outcome if isinstance(outcome, Reply) else outcome.partial
        subscription = self.credential.source == claude_login.AUTH_SOURCE_LOGIN
        mode = reply.mode if reply is not None else ("subscription" if subscription else "realtime")
        usage = reply.usage if reply is not None else {}
        record: dict[str, Any] = {
            "id": call_id, "purpose": purpose, "candidate": candidate,
            "outcome": "reply" if isinstance(outcome, Reply) else "error",
            "mode": mode, "auth_source": self.credential.source, "model": body["model"],
            "effort": body["output_config"]["effort"], "max_tokens": body["max_tokens"],
            "request_id": reply.request_id if reply else getattr(outcome, "request_id", None),
            "message_id": reply.message_id if reply else None,
            "batch_id": reply.batch_id if reply else None,
            "stop_reason": reply.stop_reason if reply else None,
            "stop_details": reply.stop_details if reply else None,
            "usage": usage or None,
            "thinking_tokens": api.thinking_tokens(usage) if usage else None,
            "cost_usd": _cost_usd(usage, mode),
            "seconds": reply.seconds if reply else None,
            "finished_at": _now(),
        }
        if isinstance(outcome, ApiError):
            record["error"] = outcome.line
            record["billed"] = outcome.billed
        if image:
            record["image"] = image
        record["body_sha256"] = _sha(body)
        record["prompt"] = _prompt_text(body)
        record["reply"] = asdict(reply) if reply is not None else None
        atomic_write_text(self._path(call_id), json.dumps(record, ensure_ascii=False, indent=1) + "\n")
        with self.lock:
            self.summaries[call_id] = self._summary(record)

    def realtime(self, call_id: str, purpose: str, candidate: str | None, body: dict[str, Any], *,
                 image: str | None = None) -> Reply | ApiError:
        cached = self.cached(call_id, body)
        if cached is not None:
            self.note(f"{call_id}: read back from calls/{call_id}.json (not asked again)")
            return cached
        self._leaving()
        try:
            if self.credential.source == claude_login.AUTH_SOURCE_LOGIN:
                outcome: Reply | ApiError = claude_login.send_message(body, label=f"{VERB} {call_id}")
            else:
                outcome = api.stream_message(self.token, body, sleep=self.sleep, label=f"{VERB} {call_id}")
        except ApiError as exc:
            outcome = exc
        self.save(call_id, purpose, candidate, body, outcome, image=image)
        self.note(_call_line(call_id, outcome))
        return outcome

    # -- Message Batches

    def _save_batch(self, record: dict[str, Any]) -> None:
        self.batch_dir.mkdir(parents=True, exist_ok=True)
        atomic_write_text(self.batch_dir / f"{record['id']}.json", json.dumps(record, ensure_ascii=False, indent=1) + "\n")
        with self.lock:
            self.batches[record["id"]] = record

    def batch_round(self, asks: list[Ask], wait: float) -> dict[str, Reply | ApiError]:
        """One answer per ask: read back, collected from a batch already recorded, or from a new batch."""
        out: dict[str, Reply | ApiError] = {}
        need: dict[str, Ask] = {}
        for ask in asks:
            cached = self.cached(ask.call_id, ask.body)
            if cached is not None:
                out[ask.call_id] = cached
            else:
                need[ask.call_id] = ask
        for record in list(self.batches.values()):
            held = [cid for cid in record["custom_ids"] if cid in need]
            if held and not record.get("collected"):
                self.note(f"batch {record['id']} was submitted earlier with {', '.join(held)}; collecting it")
                out.update(self._collect(record, need, wait))
        need = {cid: ask for cid, ask in need.items() if cid not in out}
        if need:
            self._leaving()
            try:
                batch = api.submit_batch(self.token, [(cid, ask.body) for cid, ask in need.items()],
                                         sleep=self.sleep, label=VERB)
            except ApiError as exc:
                for cid, ask in need.items():
                    self.save(cid, "generate", ask.candidate, ask.body, exc)
                    out[cid] = exc
                self.note(f"batch not submitted: {exc.line}")
                return out
            record = {"id": batch["id"], "submitted_at": _now(), "custom_ids": list(need), "collected": False}
            self._save_batch(record)
            self.note(f"batch {batch['id']} submitted: {', '.join(need)} (half price; waiting up to {wait:g}s)")
            out.update(self._collect(record, need, wait))
        return out

    def _collect(self, record: dict[str, Any], asks: dict[str, Ask], wait: float) -> dict[str, Reply | ApiError]:
        started = time.monotonic()
        # --batch-wait holds the reads too: a refused one is asked again only while its wait ends before it.
        deadline = started + wait
        while True:
            try:
                batch = api.get_batch(self.token, record["id"], sleep=self.sleep, label=VERB, deadline=deadline)
            except ApiError as exc:
                self.note(f"batch {record['id']}: status not read ({exc.line}); asking again")
                batch = {}
            if batch.get("processing_status") == "ended":
                break
            if time.monotonic() - started >= wait:
                raise Unfinished(record["id"], time.monotonic() - started, "has not ended")
            self.sleep(BATCH_POLL_SECONDS)
        try:
            results = api.batch_results(self.token, batch, sleep=self.sleep, label=VERB, deadline=deadline)
        except ApiError as exc:
            raise Unfinished(record["id"], time.monotonic() - started, f"has ended but its results were not read ({exc.line})") from exc
        seconds = round(time.monotonic() - started, 3)
        out: dict[str, Reply | ApiError] = {}
        for cid in record["custom_ids"]:
            outcome = results.get(cid) or ApiError(f"{VERB}: batch {record['id']} has no result for {cid} (not billed)",
                                                   billed=False)
            if cid in asks:
                ask = asks[cid]
                self.save(cid, "generate", ask.candidate, ask.body, outcome)
                self.note(_call_line(cid, outcome))
                out[cid] = outcome
        self._save_batch({**record, "collected": True, "ended_at": batch.get("ended_at"), "waited_seconds": seconds,
                          "request_counts": batch.get("request_counts")})
        return out


def _cost_usd(usage: dict[str, Any], mode: str) -> float:
    """What one call charged: nothing on the subscription (it counts against the plan's usage limits
    instead), the published price on the API key, half of it in a Message Batch."""
    if not usage or mode == "subscription":
        return 0.0
    return api.cost_usd(usage, batch=mode == "batch")


def _call_line(call_id: str, outcome: Reply | ApiError) -> str:
    if isinstance(outcome, ApiError):
        return f"{call_id}: {outcome.line}"
    usage = outcome.usage
    paid = "subscription" if outcome.mode == "subscription" else f"${_cost_usd(usage, outcome.mode):.4f}"
    took = f" {outcome.seconds:.0f}s" if outcome.seconds is not None else ""
    return (f"{call_id}: {outcome.stop_reason} — {usage.get('output_tokens')} output tokens "
            f"({api.thinking_tokens(usage)} thinking), {paid}{took}")


# ----------------------------------------------------------------------------- candidates

@dataclass
class Candidate:
    id: str
    status: str = "pending"  # passed | failed | refused | error
    reason: str | None = None
    effort: str | None = None
    generations: list[str] = field(default_factory=list)
    redraws: list[dict[str, Any]] = field(default_factory=list)
    repairs: list[dict[str, Any]] = field(default_factory=list)
    g1: dict[str, Any] | None = None
    gates: dict[str, Any] | None = None
    warnings: list[str] = field(default_factory=list)
    info: list[str] = field(default_factory=list)
    grid: Grid | None = None
    files: dict[str, Any] = field(default_factory=dict)
    parts: list[dict[str, Any]] = field(default_factory=list)  # per call of a set drawn over several

    def end(self, status: str, reason: str | None = None) -> "Candidate":
        self.status, self.reason = status, reason
        return self

    def to_dict(self) -> dict[str, Any]:
        data = {"id": self.id, "status": self.status, "reason": self.reason, "effort": self.effort,
                "generations": self.generations, "redraws": self.redraws, "repairs": self.repairs, "G1": self.g1,
                "gates": self.gates, "warnings": self.warnings, "info": self.info, "files": self.files}
        return {**data, "parts": self.parts} if self.parts else data


def _g1(issues: list[Issue]) -> dict[str, Any]:
    failing = structural(issues) + row_issues(issues)
    return {"ok": not failing, "issues": [i.to_dict() for i in failing],
            "recovered": [i.to_dict() for i in recovered(issues)]}


def _refusal_reason(reply: Reply) -> str:
    details = reply.stop_details or {}
    category = refusal.identifier(details.get("category"))
    return f"{refusal.CONTENT_POLICY} (stop_reason=refusal{' category=' + category if category else ''})"


class Run:
    """One pixel-draw run: its request, its calls and its candidates."""

    def __init__(self, request: PixelRequest, run_dir: Path, calls: Calls, *, batch_wait: float,
                 note: Callable[[str], None]) -> None:
        self.request = request
        self.run_dir = run_dir
        self.calls = calls
        self.batch_wait = batch_wait
        self.note = note

    def generation_body(self, effort: str, part: Part | None = None, drawn: Grid | None = None) -> dict[str, Any]:
        return api.message_body(system=SYSTEM, content=generation_prompt(self.request, part, drawn), effort=effort,
                                max_tokens=self.request.max_tokens)

    def flow(self, cid: str) -> Generator[Ask, Reply | ApiError, Candidate]:
        """A candidate's calls, one part after another; the gates once every frame is drawn."""
        request = self.request
        candidate = Candidate(cid)
        parts = call_parts(request)
        drawn: Grid | None = None
        issues: list[Issue] = []
        efforts: list[str] = []
        for part in parts:
            outcome = yield from self.draw_part(candidate, part, drawn, issues)
            if isinstance(outcome, Candidate):
                return outcome
            grid, part_issues, effort = outcome
            drawn = grid if drawn is None else joined([drawn, grid])
            issues += part_issues
            efforts.append(effort)
            if len(parts) > 1:
                candidate.parts.append({"part": part.number, "frames": list(part.frames), "effort": effort})
        candidate.g1 = _g1(issues)
        candidate.effort, candidate.grid = min(efforts, key=EFFORTS.index), drawn
        pixels = {name: frame_pixels(drawn, name) for name in request.frames}
        candidate.gates = evaluate(pixels, kind=request.kind, rule=request.palette, walk_cycle=request.walk_cycle,
                                   motion=bool(request.motion))
        candidate.warnings, candidate.info = candidate.gates["warnings"], candidate.gates["info"]
        if candidate.gates["ok"]:
            return candidate.end("passed")
        return candidate.end("failed", "failed " + ", ".join(candidate.gates["failed"]))

    def draw_part(self, candidate: Candidate, part: Part, drawn: Grid | None, earlier: list[Issue]
                  ) -> Generator[Ask, Reply | ApiError, Candidate | tuple[Grid, list[Issue], str]]:
        """One call's frames: drawn, held to the palette of the frames `drawn` before it, repaired, and
        drawn once more when they still do not read whole. Returns the part's grid, its issues and the
        effort it was drawn at, or the candidate ended."""
        request = self.request
        cid = candidate.id
        prefix, who = (cid, cid) if part.count == 1 else (f"{cid}-part{part.number}", f"{cid} part {part.number}")
        effort, number, redrawn = request.effort, 1, False
        while True:
            ask = Ask(f"{prefix}-gen{number}", cid, effort, self.generation_body(effort, part, drawn))
            outcome = yield ask
            candidate.generations.append(ask.call_id)
            if isinstance(outcome, ApiError):
                return candidate.end("error", outcome.line)
            if outcome.stop_reason == "refusal":
                return candidate.end("refused", _refusal_reason(outcome))
            grid, issues = parse_answer(outcome.text, request.answer_format, request.size, request.size, part.frames)
            if drawn is not None and grid is not None and not structural(issues):
                grid, issues = hold_palette(grid, issues, drawn.palette)
            if outcome.stop_reason == "max_tokens" and grid is None:  # nothing readable was written
                lower = LOWER_EFFORT.get(effort)
                if not redrawn and lower:
                    self.note(f"{ask.call_id}: all {request.max_tokens} tokens went to thinking and nothing was "
                              f"written; drawing {who} once more at effort {lower}")
                    candidate.redraws.append({"after": ask.call_id, "why": "max_tokens", "effort": lower})
                    effort, number, redrawn = lower, number + 1, True
                    continue
                return candidate.end("failed", f"max_tokens: {ask.call_id} used all {request.max_tokens} tokens "
                                               f"at effort {effort} and wrote nothing")
            grid, issues = self.repair(candidate, ask.call_id, grid, issues)
            candidate.g1 = _g1(earlier + issues)
            if not candidate.g1["ok"]:
                if not redrawn:
                    self.note(f"{ask.call_id}: G1 still fails ({_issue_list(issues)}); drawing {who} once more")
                    candidate.redraws.append({"after": ask.call_id, "why": "G1", "effort": effort})
                    number, redrawn = number + 1, True
                    continue
                return candidate.end("failed", f"G1: {_issue_list(issues)}")
            return grid, issues, effort

    def repair(self, candidate: Candidate, gen_id: str, grid: Grid | None,
               issues: list[Issue]) -> tuple[Grid | None, list[Issue]]:
        """Row repair: the broken rows go back with their neighbours, the answers are spliced in."""
        if grid is None or structural(issues):
            return grid, issues
        for round_number in range(1, REPAIR_ROUNDS + 1):
            broken = row_issues(issues)
            if not broken:
                break
            prompt, wanted = repair_prompt(self.request, grid, broken)
            call_id = f"{gen_id}-fix{round_number}"
            body = api.message_body(system=SYSTEM, content=prompt, effort=REPAIR_EFFORT, max_tokens=REPAIR_MAX_TOKENS)
            outcome = self.calls.realtime(call_id, "repair", candidate.id, body)
            entry: dict[str, Any] = {"call": call_id, "rows_asked": [f"{n} {i}" for n, i in wanted]}
            if isinstance(outcome, ApiError) or outcome.stop_reason == "refusal":
                entry["error"] = outcome.line if isinstance(outcome, ApiError) else _refusal_reason(outcome)
                candidate.repairs.append(entry)
                break
            fixes, ignored = parse_row_answers(outcome.text, grid, set(wanted))
            grid = splice(grid, fixes)
            issues = [i for i in issues if i not in broken] + check_rows(grid)
            entry.update(rows_answered=[f"{n} {i}" for n, i in sorted(fixes)], ignored=ignored,
                         rows_still_broken=sorted({f"{i.frame} {i.row}" for i in row_issues(issues)}))
            candidate.repairs.append(entry)
        return grid, issues

    # -- drivers

    def _realtime(self, cid: str) -> Candidate:
        flow = self.flow(cid)
        try:
            ask = next(flow)
            while True:
                ask = flow.send(self.calls.realtime(ask.call_id, "generate", cid, ask.body))
        except StopIteration as stop:
            return stop.value

    def _batched(self, cids: list[str]) -> dict[str, Candidate]:
        flows = {cid: self.flow(cid) for cid in cids}
        done: dict[str, Candidate] = {}

        def step(cid: str, value: Reply | ApiError | None) -> Ask | Candidate:
            try:
                return next(flows[cid]) if value is None else flows[cid].send(value)
            except StopIteration as stop:
                return stop.value

        with ThreadPoolExecutor(max_workers=len(cids)) as pool:
            asks: dict[str, Ask] = {}
            for cid, out in zip(cids, pool.map(lambda c: step(c, None), cids)):
                (asks.__setitem__ if isinstance(out, Ask) else done.__setitem__)(cid, out)
            while asks:
                answers = self.calls.batch_round(list(asks.values()), self.batch_wait)
                waiting = list(asks)
                outs = list(pool.map(lambda c: step(c, answers[asks[c].call_id]), waiting))
                asks = {}
                for cid, out in zip(waiting, outs):
                    (asks.__setitem__ if isinstance(out, Ask) else done.__setitem__)(cid, out)
        return done

    def candidates(self) -> list[Candidate]:
        cids = [f"c{n}" for n in range(1, self.request.candidates + 1)]
        if self.request.batch:
            done = self._batched(cids)
            return [done[cid] for cid in cids]
        with ThreadPoolExecutor(max_workers=len(cids)) as pool:
            return list(pool.map(self._realtime, cids))

    # -- G7

    def pick(self, passed: list[Candidate]) -> dict[str, Any]:
        if len(passed) == 1:
            return {"by": "only", "best": passed[0].id}
        if self.request.pick == "human":
            return {"by": "human", "best": None, "candidates": [c.id for c in passed]}
        labels = "ABCDEFGH"[:len(passed)]
        order = list(passed)
        random.Random(_sha(self.request.to_dict())).shuffle(order)
        by_label = {label: c for label, c in zip(labels, order)}
        sheet = pick_sheet(self.run_dir, by_label, tile=self.request.kind == TILE,
                           scale=preview_scale(self.request.size))
        sheet_path = self.run_dir / "pick-sheet.png"
        sheet_path.write_bytes(sheet)
        content = [{"type": "image", "source": {"type": "base64", "media_type": "image/png",
                                                "data": base64.standard_b64encode(sheet).decode("ascii")}},
                   {"type": "text", "text": pick_prompt(self.request, list(labels))}]
        body = api.message_body(system=None, content=content, effort=PICK_EFFORT, max_tokens=PICK_MAX_TOKENS,
                                schema=PICK_SCHEMA)
        record: dict[str, Any] = {"by": "vision", "call": "pick", "sheet": sheet_path.name,
                                  "labels": {label: c.id for label, c in by_label.items()}, "best": None}
        outcome = self.calls.realtime("pick", "pick", None, body, image=sheet_path.name)
        if isinstance(outcome, ApiError):
            return {**record, "error": outcome.line}
        if outcome.stop_reason == "refusal":
            return {**record, "error": _refusal_reason(outcome)}
        try:
            verdict = json.loads(outcome.text)
            best = verdict["best"]
        except (json.JSONDecodeError, TypeError, KeyError):
            return {**record, "error": f"the pick answer is not the verdict JSON: {outcome.text[:200]!r}"}
        if best not in by_label:
            return {**record, "error": f"the pick named {best!r}, not one of {', '.join(labels)}", "verdict": verdict}
        return {**record, "best": by_label[best].id, "verdict": verdict}


def _issue_list(issues: list[Issue]) -> str:
    failing = structural(issues) + row_issues(issues)
    shown = [f"{i.code}" + (f" {i.frame}" if i.frame else "") + (f" row {i.row}" if i.row else "") for i in failing[:6]]
    return ", ".join(shown) + (f" and {len(failing) - 6} more" if len(failing) > 6 else "")


PICK_CHECKER_SQUARE = 8  # sheet pixels a square of the checker under a preview
# What Claude reads of an image unscaled, on Claude 4.7 and later models (Opus 5.5 among them): a long
# edge of at most 2576 px and at most 4784 patches of 28x28 px; a larger image is scaled down, which
# blurs pixel art (platform.claude.com/docs/en/build-with-claude/vision, "Resolution and token cost",
# read 2026-10-15). An image past 8000 px a side is refused outright.
PICK_SHEET_LONG_EDGE, PICK_SHEET_PATCHES, PICK_SHEET_PATCH = 2576, 4784, 28
PICK_PAD, PICK_LABEL_WIDTH = 16, 56


def _sheet_size(rows: list[tuple[str, Image.Image, Image.Image | None]]) -> tuple[int, int]:
    width = max(PICK_LABEL_WIDTH + p.width + (t.width + PICK_PAD if t else 0) for _, p, t in rows) + PICK_PAD * 2
    height = sum(max(p.height, t.height if t else 0) + PICK_PAD for _, p, t in rows) + PICK_PAD
    return width, height


def _fits(size: tuple[int, int]) -> bool:
    width, height = size
    patches = -(-width // PICK_SHEET_PATCH) * -(-height // PICK_SHEET_PATCH)
    return max(size) <= PICK_SHEET_LONG_EDGE and patches <= PICK_SHEET_PATCHES


def _rescaled(image: Image.Image | None, scale: int, step: int) -> Image.Image | None:
    """A preview enlarged `scale` times, enlarged `step` times instead — nearest-neighbour, exact: every
    side is a whole number of `scale`-pixel units, and each becomes `step` pixels."""
    if image is None or step == scale:
        return image
    return image.resize((image.width * step // scale, image.height * step // scale), Image.NEAREST)


def pick_sheet(run_dir: Path, by_label: dict[str, Candidate], *, tile: bool, scale: int = 1) -> bytes:
    """One sheet of the candidates' previews (and 3x3 tilings), each row labelled, a preview's
    transparency on the engine's preview checker (`qa.preview.checker`). The previews are enlarged
    `scale` times; when the sheet is larger than Claude reads unscaled — many frames, many candidates —
    they are drawn at the largest smaller whole enlargement at which it fits."""
    loaded = []
    for label, candidate in by_label.items():
        preview = Image.open(run_dir / candidate.files["preview"]).convert("RGBA")
        tiled = Image.open(run_dir / candidate.files["tiled"]).convert("RGBA") if tile else None
        loaded.append((label, preview, tiled))
    for step in range(scale, 0, -1):
        rows = [(label, _rescaled(p, scale, step), _rescaled(t, scale, step)) for label, p, t in loaded]
        if _fits(_sheet_size(rows)):
            break
    pad, label_width = PICK_PAD, PICK_LABEL_WIDTH
    width, height = _sheet_size(rows)
    sheet = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    y = pad
    for label, preview, tiled in rows:
        draw.text((pad, y + 4), label, fill=(0, 0, 0, 255), font_size=36)
        x = pad + label_width
        sheet.alpha_composite(Image.alpha_composite(checker(preview.size, PICK_CHECKER_SQUARE), preview), (x, y))
        if tiled is not None:
            sheet.alpha_composite(tiled, (x + preview.width + pad, y))
        y += max(preview.height, tiled.height if tiled is not None else 0) + pad
    buffer = io.BytesIO()
    sheet.convert("RGB").save(buffer, format="PNG")
    return buffer.getvalue()


# ----------------------------------------------------------------------------- files and report

def write_files(directory: Path, grid: Grid, request_frames: tuple[str, ...], kind: str, rule: PaletteRule,
                pixels_used: list[str], duration_ms: int = GIF_FRAME_MS) -> dict[str, Any]:
    """grid.txt, palette.json, frame-<name>.png, preview-x<s>.png (rows of PREVIEW_COLUMNS frames),
    tiled-3x3.png (tile), anim.gif (2+ frames, `duration_ms` each)."""
    directory.mkdir(parents=True, exist_ok=True)
    frames = {name: frame_pixels(grid, name) for name in request_frames}
    scale = preview_scale(max(grid.width, grid.height))
    files: dict[str, Any] = {"grid": "grid.txt", "palette": "palette.json", "frames": {}}
    (directory / "grid.txt").write_text(to_text(grid), encoding="utf-8")
    keys = grid.key_map()
    palette = {"rule": rule.to_dict(), "transparent": ".",
               "keys": {keys[k]: (None if c is None else c.upper()) for k, c in grid.palette.items()},
               "colors_used": pixels_used}
    (directory / "palette.json").write_text(json.dumps(palette, indent=1) + "\n", encoding="utf-8")
    for name, pixels in frames.items():
        (directory / f"frame-{name}.png").write_bytes(png_bytes(pixels))
        files["frames"][name] = f"frame-{name}.png"
    preview_strip(list(frames.values()), scale).save(directory / f"preview-x{scale}.png")
    files["preview"] = f"preview-x{scale}.png"
    if kind == TILE:
        tiled_3x3(frames[request_frames[0]], scale).save(directory / "tiled-3x3.png")
        files["tiled"] = "tiled-3x3.png"
    if len(frames) > 1:
        save_gif(list(frames.values()), scale, directory / "anim.gif", duration_ms, loop=None if kind == EFFECT else 0)
        files["gif"] = "anim.gif"
    if kind == EFFECT:
        strip = Image.new("RGBA", (grid.width * len(frames), grid.height))
        for i, pixels in enumerate(frames.values()):
            strip.paste(image_of(pixels), (i * grid.width, 0))
        strip.save(directory / "effect.strip.png")
        meta = {"kind": EFFECT, "frames": len(frames), "w": grid.width, "h": grid.height,
                "loop": False, "hold_last": False, "end_frame": len(frames) - 1,
                "events": [], "blend": "add", "anchor": [grid.width / 2, grid.height / 2],
                "delay_ms": duration_ms, "frame_names": list(frames)}
        atomic_write_text(directory / "effect.strip.json", json.dumps(meta, indent=2) + "\n")
        files.update(strip="effect.strip.png", metadata="effect.strip.json")
    return files


def _flat(files: dict[str, Any]) -> list[str]:
    names = [v for k, v in files.items() if k != "frames"]
    return names + list(files.get("frames", {}).values())


def _prefixed(files: dict[str, Any], prefix: str) -> dict[str, Any]:
    out = {k: f"{prefix}/{v}" for k, v in files.items() if k != "frames"}
    out["frames"] = {n: f"{prefix}/{v}" for n, v in files.get("frames", {}).items()}
    return out


def _totals(calls: list[dict[str, Any]]) -> tuple[dict[str, int], float]:
    usage = {"input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0, "cache_creation_input_tokens": 0,
             "cache_read_input_tokens": 0}
    for call in calls:
        for key in usage:
            value = call.get("thinking_tokens") if key == "thinking_tokens" else (call.get("usage") or {}).get(key)
            usage[key] += value if isinstance(value, int) else 0
    return usage, round(sum(call.get("cost_usd") or 0.0 for call in calls), 6)


def _write_report(run_dir: Path, report: dict[str, Any]) -> Path:
    path = run_dir / "report.json"
    atomic_write_text(path, json.dumps(report, ensure_ascii=False, indent=1) + "\n")
    return path


# ----------------------------------------------------------------------------- the verb

def add_arguments(parser: argparse.ArgumentParser) -> None:
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--subject", help="what to draw, in words (the frames' poses or views included)")
    source.add_argument("--spec", type=Path, help=f"a JSON object holding {', '.join(SPEC_KEYS)} instead of the flags")
    source.add_argument("--grid", type=Path, help="check and render an edited grid.txt; no model call")
    parser.add_argument("--size", type=int, help=f"canvas side in pixels, {SIZE_MIN}..{SIZE_MAX} (default {SIZE_DEFAULT}; "
                                                 "measured best at 32 or less)")
    parser.add_argument("--kind", choices=KINDS, help="sprite (default) and icon have a transparent background; a tile is "
                                                     "opaque and repeats; an effect has a centered lifetime")
    parser.add_argument("--frames", help=f"comma-separated frame names, at most {FRAMES_TOTAL_MAX}, drawn {FRAMES_MAX} a "
                                         "call (effect: 2..8 in one call, default birth,peak,decay,gone; others: one "
                                         "named after --kind); a --spec frame may be {\"name\": ..., \"pose\": ...}")
    parser.add_argument("--walk-cycle", action="store_true", default=None,
                        help="the four frames are one walk cycle (contact, passing, contact, passing): says so in the "
                             "prompt and checks the legs change sides")
    parser.add_argument("--motion", help="the frames, in this order, are one motion, in words: says so in the prompt, "
                                         "and G6 fails only a frame off the ground row (a pose's height and a hold "
                                         "are reported)")
    parser.add_argument("--style", help="the style to draw in, in words, in place of the kind's (a dark outline, 2-3 "
                                        "shades, light from the top-left); the pick judges craft against it")
    parser.add_argument("--duration-ms", type=int, help=f"each frame of anim.gif, in milliseconds (default "
                                                        f"{GIF_FRAME_MS}; at least {DURATION_MS_MIN})")
    parser.add_argument("--palette", help="free[:N] (default free:16), pico8, #RRGGBB,#RRGGBB,..., or a palette file "
                                          "(.json list, or one colour per line)")
    parser.add_argument("--candidates", type=int, help=f"answers drawn for the request, {CANDIDATES_MIN}..{CANDIDATES_MAX} "
                                                       f"(default {CANDIDATES_DEFAULT})")
    parser.add_argument("--effort", choices=EFFORT_CHOICES, help=f"thinking effort of each drawing (default {EFFORT_DEFAULT})")
    parser.add_argument("--format", dest="answer_format", choices=FORMATS,
                        help="how the model writes the grid: chargrid (default) or json; grid.txt is a chargrid either way")
    parser.add_argument("--batch", action="store_true", default=None,
                        help="draw through Message Batches at half price; waits for the batch (repairs and the pick stay realtime)")
    parser.add_argument("--batch-wait", type=float, help=f"seconds to wait for one batch before the run ends unfinished "
                                                         f"(default {BATCH_WAIT_DEFAULT:g}; --resume collects it later)")
    parser.add_argument("--max-tokens", type=int, help=f"output cap of each drawing, thinking included (default "
                                                       f"{MAX_TOKENS_SINGLE} for one frame, {MAX_TOKENS_MULTI} for more)")
    parser.add_argument("--pick", choices=PICKS, help="who picks among candidates that passed: vision (default, one Opus "
                                                     "call at effort low) or human (none is copied to the top)")
    parser.add_argument("--out-dir", required=True, type=Path, help="the run folder: new or empty, or the run to --resume")
    parser.add_argument("--resume", action="store_true",
                        help="continue the run in --out-dir from its request.json: calls already answered are read back, "
                             "a batch already submitted is collected")


def _given(args: argparse.Namespace, names: tuple[str, ...]) -> list[str]:
    return ["--" + n.replace("answer_format", "format").replace("_", "-") for n in names if getattr(args, n) is not None]


def _fresh_dir(out_dir: Path) -> None:
    if out_dir.exists() and (not out_dir.is_dir() or any(out_dir.iterdir())):
        raise _refuse(f"--out-dir {out_dir} exists and is not an empty folder; choose a new one "
                      "(or --resume the run it holds)")
    out_dir.mkdir(parents=True, exist_ok=True)


def _note_printer() -> Callable[[str], None]:
    lock = threading.Lock()

    def note(line: str) -> None:
        with lock:
            print(f"[{VERB}] {line}", file=sys.stderr, flush=True)

    return note


def _run_grid(args: argparse.Namespace) -> int:
    extra = _given(args, ("size", "frames", "style") + RUN_FLAGS + ("batch_wait",)) + (["--resume"] if args.resume else [])
    if extra:
        raise _refuse(f"--grid checks and renders a grid as it is; drop {', '.join(extra)}")
    try:
        text = Path(args.grid).expanduser().read_text(encoding="utf-8")
    except OSError as exc:
        raise _refuse(f"--grid {args.grid}: {exc}") from exc
    try:
        rule = palette_rule(args.palette or "free")
    except ValueError as exc:
        raise _refuse(str(exc)) from exc
    kind = args.kind or SPRITE
    motion = _words(args.motion, "--motion")
    duration_ms = _duration(GIF_FRAME_MS if args.duration_ms is None else args.duration_ms)
    grid, issues = read_grid_text(text)
    if grid is not None and not (SIZE_MIN <= grid.width <= SIZE_MAX and SIZE_MIN <= grid.height <= SIZE_MAX):
        raise _refuse(f"--grid {args.grid}: {grid.width}x{grid.height}; each side is {SIZE_MIN}..{SIZE_MAX} pixels")
    frames = tuple(grid.frames) if grid is not None else ()
    if kind == EFFECT and grid is not None:
        _frames(list(frames), kind)
        if args.walk_cycle:
            raise _refuse("--walk-cycle does not apply to an effect")
    if args.walk_cycle and len(frames) != 4:
        raise _refuse(f"--walk-cycle is four frames, the grid holds {len(frames)}")
    if grid is not None:
        _motion(motion, kind, frames)
    out_dir = Path(args.out_dir).expanduser().resolve()
    _fresh_dir(out_dir)
    report: dict[str, Any] = {"kind": REPORT_KIND, "status": "failed", "out_dir": str(out_dir), "source": "grid",
                              "grid_source": str(Path(args.grid).expanduser().resolve()), "model": None,
                              "request": {"kind": kind, "frames": list(frames), "walk_cycle": bool(args.walk_cycle),
                                          "motion": motion, "palette": rule.to_dict(), "duration_ms": duration_ms},
                              "G1": _g1(issues), "gates": None, "warnings": [], "info": [], "files": {}, "calls": [],
                              "cost_usd": 0.0}
    if grid is None or not report["G1"]["ok"]:
        path = _write_report(out_dir, report)
        raise _refuse(f"{args.grid} does not parse whole: {_issue_list(issues)}; report {path}")
    pixels = {name: frame_pixels(grid, name) for name in frames}
    gates = evaluate(pixels, kind=kind, rule=rule, walk_cycle=bool(args.walk_cycle), motion=bool(motion))
    files = write_files(out_dir, grid, frames, kind, rule, colors_used(pixels), duration_ms)
    report.update(status="ok" if gates["ok"] else "failed", gates=gates, warnings=gates["warnings"], info=gates["info"],
                  files=files, request={**report["request"], "size": [grid.width, grid.height]})
    path = _write_report(out_dir, report)
    if not gates["ok"]:
        raise _refuse(f"{args.grid} fails {', '.join(gates['failed'])}; files and report in {out_dir} ({path.name})")
    print_json(report)
    return 0


def _run(args: argparse.Namespace, *, sleep: Callable[[float], None] = time.sleep) -> int:
    if args.grid is not None:
        return _run_grid(args)
    out_dir = Path(args.out_dir).expanduser().resolve()
    if args.resume:
        extra = _given(args, SPEC_KEYS + RUN_FLAGS) + (["--spec"] if args.spec else [])
        if extra:
            raise _refuse(f"--resume reads the request from {out_dir / 'request.json'}; drop {', '.join(extra)}")
        try:
            request = PixelRequest.from_dict(json.loads((out_dir / "request.json").read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
            raise _refuse(f"--resume: {out_dir} holds no readable request.json ({exc})") from exc
    else:
        request = resolve_request(args)
    batch_wait = BATCH_WAIT_DEFAULT if args.batch_wait is None else args.batch_wait
    if batch_wait < 0:
        raise _refuse(f"--batch-wait is seconds, at least 0, got {batch_wait:g}")
    credential = claude_login.resolve_credential(batch=request.batch)
    if not args.resume:
        _fresh_dir(out_dir)
        atomic_write_text(out_dir / "request.json", json.dumps(request.to_dict(), ensure_ascii=False, indent=1) + "\n")
    note = _note_printer()

    def announce() -> None:
        if credential.source == claude_login.AUTH_SOURCE_API_KEY:
            announce_api_billing("claude", api.AUTH_ENV,
                                 f" (model={api.MODEL}, effort={request.effort}, candidates={request.candidates}, "
                                 f"{'Message Batches at half price' if request.batch else 'realtime'})"
                                 + ("." if request.batch else f" — {claude_login.LOGIN_HINT}."))

    started = time.monotonic()
    calls = Calls(out_dir, credential, sleep=sleep, note=note, announce=announce)
    run = Run(request, out_dir, calls, batch_wait=batch_wait, note=note)
    _say_parts(request, note)
    report: dict[str, Any] = {"kind": REPORT_KIND, "status": None, "out_dir": str(out_dir), "source": "model",
                              "model": api.MODEL, "auth_source": credential.source, "request": request.to_dict(),
                              "chosen": None, "files": {},
                              "pick": None, "candidates": [], "warnings": [], "info": []}
    try:
        candidates = run.candidates()
    except Unfinished as unfinished:
        report.update(status="unfinished", unfinished={"batch_id": unfinished.batch_id, "why": unfinished.why,
                                                       "waited_seconds": round(unfinished.waited, 3)})
        path = _finish(report, calls, started)
        raise _refuse(f"batch {unfinished.batch_id} {unfinished.why} after {unfinished.waited:.0f}s; nothing is asked "
                      f"twice — collect it with `sprite-gen pixel-draw --out-dir {out_dir} --resume`; report {path}")
    for candidate in candidates:
        if candidate.grid is not None:
            pixels = {name: frame_pixels(candidate.grid, name) for name in request.frames}
            files = write_files(out_dir / "candidates" / candidate.id, candidate.grid, request.frames, request.kind,
                                request.palette, colors_used(pixels), request.duration_ms)
            candidate.files = _prefixed(files, f"candidates/{candidate.id}")
    passed = [c for c in candidates if c.status == "passed"]
    report["candidates"] = [c.to_dict() for c in candidates]
    if not passed:
        refused_all = all(c.status == "refused" for c in candidates)
        report["status"] = "refused" if refused_all else "failed"
        path = _finish(report, calls, started)
        if refused_all:
            raise _refuse(f"{candidates[0].reason}; every candidate was refused; report {path}")
        reasons = "; ".join(f"{c.id}: {c.reason}" for c in candidates)
        raise _refuse(f"no candidate passed the gates ({reasons}); report {path}")
    pick = run.pick(passed)
    report["pick"] = pick
    chosen = next((c for c in passed if c.id == pick.get("best")), None)
    if chosen is not None:
        source = out_dir / "candidates" / chosen.id
        top = {k: v.split("/", 2)[-1] if k != "frames" else {n: p.split("/", 2)[-1] for n, p in v.items()}
               for k, v in chosen.files.items()}
        for name in _flat(top):
            shutil.copyfile(source / name, out_dir / name)
        report.update(chosen=chosen.id, files=top, warnings=chosen.warnings, info=chosen.info)
    if pick.get("error"):
        report["status"] = "pick_failed"
        path = _finish(report, calls, started)
        raise _refuse(f"{len(passed)} candidates passed but the pick failed ({pick['error']}); they are in "
                      f"{out_dir / 'candidates'}; report {path}")
    report["status"] = "ok"
    _finish(report, calls, started)
    print_json(report)
    return 0


def run_auth_source(summaries: list[dict[str, Any]], resolved: str) -> dict[str, Any]:
    """What a run's calls ran on, as their records say: one route, or `mixed` with each route named (a run
    resumed under another credential). A run with no call yet names the credential it resolved."""
    sources = sorted({s["auth_source"] for s in summaries if s.get("auth_source")})
    if not sources:
        return {"auth_source": resolved}
    if len(sources) == 1:
        return {"auth_source": sources[0]}
    return {"auth_source": "mixed", "auth_sources": sources}


def _finish(report: dict[str, Any], calls: Calls, started: float) -> Path:
    summaries = [calls.summaries[cid] for cid in sorted(calls.summaries, key=_call_order)]
    usage, cost = _totals(summaries)
    report.pop("auth_sources", None)
    report.update(calls=summaries, batches=list(calls.batches.values()), usage=usage, cost_usd=cost,
                  seconds=round(time.monotonic() - started, 3),
                  **run_auth_source(summaries, calls.credential.source))
    return _write_report(Path(report["out_dir"]), report)


def _call_order(call_id: str) -> tuple:
    """c<candidate>[-part<n>]-gen<n>[-fix<n>] in the order the calls were made; the pick last."""
    if call_id == "pick":
        return (10**6,)
    return tuple(int(n) for n in re.findall(r"\d+", call_id))


def _say_parts(request: PixelRequest, note: Callable[[str], None]) -> None:
    """Before a set of more than FRAMES_MAX frames is drawn: how many calls, and what they may spend."""
    parts = call_parts(request)
    if len(parts) == 1:
        return
    shown = min(len(request.frames) - len(parts[-1].frames), 1 + DRAWN_SHOWN)
    reads = shown * request.size * (request.size + 1) // GRID_CHARS_PER_TOKEN
    note(f"{len(request.frames)} frames (at most {FRAMES_TOTAL_MAX}): {len(parts)} calls a candidate of at most "
         f"{FRAMES_MAX} frames each, {len(parts) * request.candidates} drawings in all; each may write up to "
         f"{request.max_tokens} output tokens, thinking included, and each call after a candidate's first also "
         f"reads its palette and up to {shown} frames already drawn, about {reads} input tokens")


def run(**kwargs: Any) -> int:
    parser = argparse.ArgumentParser()
    add_arguments(parser)
    return _run(namespace_from_kwargs(parser, kwargs))


def main(argv: list[str] | None = None) -> int:
    utf8_streams()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_arguments(parser)
    return _run(parser.parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
