# SPDX-License-Identifier: Apache-2.0
"""The pixel grid `pixel-draw` asks a model for: its two answer formats, the canonical `grid.txt`,
the palette rules, row repair splicing and the renders.

A grid is a palette (one key per colour, `.` transparent) and per frame `height` rows of `width`
keys. The model answers it as a character grid (a ```pixels block: `PALETTE`, `FRAME <name>`,
rows, `END`) or as JSON (`{"palette": ["transparent", "#RRGGBB", ...], "frames": {name:
[[index, ...], ...]}}`). Either way the truth written to disk is `grid.txt`, the character grid
without its fence: a person can edit it, diff it and render it again (`pixel-draw --grid`).

Parsing is strict and says what it found (`Issue`):

- structural issues (no block, a broken palette, a frame missing or extra, more rows than the
  canvas) leave nothing a row can fix — that answer is drawn again;
- row issues (a row one key too long or short, a key not in the palette, rows missing at the end)
  are what the row repair asks for, one row at a time, and `splice` puts the answers in;
- recovered issues are code-recoverable and recorded, never silent: the fence tagged otherwise or
  missing, a fence never closed, a single frame written without its `FRAME` line or under another
  name, frames in another order, no `END` line, an answer that wrote its block more than once (the
  last block that reads whole is read), and — for a later answer of a set drawn over several, which
  is given the first answer's palette (`hold_palette`) — a colour it added or changed.

`png_bytes` writes a frame as a PNG whose bytes depend only on its pixels — stored deflate
blocks, no compressor in the loop — so the same grid gives the same file on any machine and any
zlib (Pillow's encoder output follows the zlib build it links). Previews, the 3x3 tiling and the
GIF are views for the eye and go through Pillow.
"""
from __future__ import annotations

import json
import re
import string
import struct
import zlib
from collections import Counter
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Sequence

from PIL import Image

from sprite_gen.util.gif_utils import save_clean_gif
from sprite_gen.util.hexcolor import parse_hex

from .base import PNG_MAGIC

FORMATS = ("chargrid", "json")
KEYS = string.ascii_lowercase + string.ascii_uppercase + string.digits
TRANSPARENT_KEY = "."
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
PREVIEW_COLUMNS = 8  # frames a preview row holds before the next row

# PICO-8's 16 colours (lexaloffle.com/pico-8.php, the fixed palette of the console).
PICO8 = ("#000000", "#1D2B53", "#7E2553", "#008751", "#AB5236", "#5F574F", "#C2C3C7", "#FFF1E8",
         "#FF004D", "#FFA300", "#FFEC27", "#00E436", "#29ADFF", "#83769C", "#FF77A8", "#FFCCAA")
FREE_DEFAULT_LIMIT = 16

STRUCTURAL = frozenset({
    "no_block", "json_invalid", "json_shape", "bad_palette_line", "palette_key_duplicate", "dot_redefined",
    "extra_transparent_key", "palette0_not_transparent", "palette_too_large", "frame_missing", "frame_extra",
    "frame_duplicate", "row_count_over", "stray_line",
})
ROW_CODES = frozenset({"row_width", "unknown_symbol", "row_missing"})
RECOVERED = frozenset({"block_tag", "block_unclosed", "block_many", "frame_header_missing", "frame_renamed",
                       "frame_order", "no_end", "palette_added", "palette_changed"})

_PALETTE_LINE = re.compile(r"^(\S)\s+(transparent|#[0-9A-Fa-f]{6})$")
_ROW_ANSWER = re.compile(r"^\s*`?\s*ROW\s+(\S+)\s+(\d+)\s*:\s*(.*?)\s*`?\s*$", re.M)
_FRAME_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$")

Pixel = tuple[int, int, int, int]
TRANSPARENT: Pixel = (0, 0, 0, 0)


def frame_name_ok(name: str) -> bool:
    return bool(_FRAME_NAME.fullmatch(name))


# ----------------------------------------------------------------------------- palette rules

@dataclass(frozen=True)
class PaletteRule:
    """What a request allows: at most `limit` colours (free), or only `colors` (fixed)."""

    name: str  # "free:<n>" | "pico8" | "fixed"
    limit: int
    colors: tuple[str, ...] = ()  # "#RRGGBB" upper case; empty for a free palette

    @property
    def fixed(self) -> bool:
        return bool(self.colors)

    def to_dict(self) -> dict:
        return {"name": self.name, "limit": self.limit, "colors": list(self.colors)}


def _fixed(colors: Sequence[str], name: str, where: str) -> PaletteRule:
    normalized = []
    for raw in colors:
        value = raw.strip()
        if not value.startswith("#"):
            value = "#" + value
        if not HEX.fullmatch(value):
            raise ValueError(f"{where}: {raw!r} is not a #RRGGBB colour")
        normalized.append(value.upper())
    if not normalized:
        raise ValueError(f"{where}: no colours")
    duplicates = sorted({c for c in normalized if normalized.count(c) > 1})
    if duplicates:
        raise ValueError(f"{where}: colours listed twice: {', '.join(duplicates)}")
    if len(normalized) > len(KEYS):
        raise ValueError(f"{where}: at most {len(KEYS)} colours (one key each), got {len(normalized)}")
    return PaletteRule(name=name, limit=len(normalized), colors=tuple(normalized))


def palette_rule(value: str) -> PaletteRule:
    """`--palette`: `free` / `free:N`, `pico8`, `#hex,#hex,...`, or a file of colours.

    A file is JSON (a list of colours, or `{"colors": [...]}`) or text with one `#RRGGBB` /
    `RRGGBB` per line (blank lines and lines starting `;` skipped — Lospec's .hex is this)."""
    text = value.strip()
    if text == "free" or text.startswith("free:"):
        number = text.partition(":")[2] or str(FREE_DEFAULT_LIMIT)
        if not number.isdigit() or not 1 <= int(number) <= len(KEYS):
            raise ValueError(f"--palette {value!r}: free:N takes 1..{len(KEYS)} colours")
        return PaletteRule(name=f"free:{int(number)}", limit=int(number))
    if text == "pico8":
        return PaletteRule(name="pico8", limit=len(PICO8), colors=PICO8)
    if text.startswith("#"):
        return _fixed(text.split(","), "fixed", f"--palette {value!r}")
    path = Path(text).expanduser()
    if not path.is_file():
        raise ValueError(f"--palette {value!r}: not free[:N], pico8, a #RRGGBB list or a palette file that exists")
    raw = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(f"--palette {path}: not JSON ({exc.msg})") from exc
        colors = data.get("colors") if isinstance(data, dict) else data
        if not isinstance(colors, list) or not all(isinstance(c, str) for c in colors):
            raise ValueError(f"--palette {path}: expected a list of colours or {{\"colors\": [...]}}")
    else:
        colors = [line for line in (l.strip() for l in raw.splitlines()) if line and not line.startswith(";")]
    return _fixed(colors, "fixed", f"--palette {path}")


# ----------------------------------------------------------------------------- the grid

@dataclass(frozen=True)
class Issue:
    code: str
    frame: str | None = None
    row: int | None = None  # 1-based
    detail: str = ""

    def to_dict(self) -> dict:
        return {k: v for k, v in (("code", self.code), ("frame", self.frame), ("row", self.row),
                                  ("detail", self.detail)) if v not in (None, "")}


@dataclass(frozen=True)
class Grid:
    """A palette and frames of rows of keys, as written (keys of a JSON answer are its indices)."""

    fmt: str
    width: int
    height: int
    palette: dict[str, str | None]  # key -> "#RRGGBB" as written, None for transparent
    frames: dict[str, list[list[str]]]

    def key_map(self) -> dict[str, str]:
        """The character each key is written with in grid.txt."""
        if self.fmt == "chargrid":
            return {key: key for key in self.palette}
        mapping = {}
        for key, color in self.palette.items():
            index = int(key)
            mapping[key] = TRANSPARENT_KEY if color is None else KEYS[index - 1]
        return mapping


def structural(issues: Sequence[Issue]) -> list[Issue]:
    return [i for i in issues if i.code in STRUCTURAL]


def row_issues(issues: Sequence[Issue]) -> list[Issue]:
    return [i for i in issues if i.code in ROW_CODES]


def recovered(issues: Sequence[Issue]) -> list[Issue]:
    return [i for i in issues if i.code in RECOVERED]


def check_rows(grid: Grid) -> list[Issue]:
    """Every row issue of `grid`: a row of the wrong length, a key not in the palette, rows missing."""
    issues: list[Issue] = []
    for name, rows in grid.frames.items():
        for number, row in enumerate(rows, 1):
            if len(row) != grid.width:
                issues.append(Issue("row_width", name, number, f"{len(row)} values, needs {grid.width}"))
            unknown = sorted({token for token in row if token not in grid.palette})
            if unknown:
                issues.append(Issue("unknown_symbol", name, number, "not in the palette: " + " ".join(map(repr, unknown))))
        for number in range(len(rows) + 1, grid.height + 1):
            issues.append(Issue("row_missing", name, number))
    return issues


def _fenced(text: str, tag: str) -> tuple[str | None, str | None]:
    """The body of the ```<tag> block and how it was found: as asked (None), in a fence tagged
    otherwise or in no fence at all (`block_tag`), or in a fence never closed (`block_unclosed` —
    an answer cut off keeps the rows it wrote)."""
    match = re.search(r"```" + re.escape(tag) + r"[ \t]*\r?\n(.*?)```", text, re.S)
    if match:
        return match.group(1), None
    opener = r"PALETTE" if tag == "pixels" else r"\{"
    match = re.search(r"```[A-Za-z0-9_-]*[ \t]*\r?\n(\s*" + opener + r".*?)```", text, re.S)
    if match:
        return match.group(1), "block_tag"
    match = re.search(r"```" + re.escape(tag) + r"[ \t]*\r?\n(.*)\Z", text, re.S)
    if match:
        return match.group(1), "block_unclosed"
    if tag == "pixels":
        match = re.search(r"(?m)^PALETTE[ \t]*$.*", text, re.S)
        if match:
            return match.group(0), "block_tag"
    return None, None


def _settle_frames(written: dict[str, list[list[str]]], order: list[str], frames: Sequence[str],
                   issues: list[Issue]) -> dict[str, list[list[str]]]:
    """The requested frames out of what was written; one frame under another name is recovered."""
    if len(frames) == 1 and frames[0] not in written and len(written) == 1:
        (other,) = written
        issues.append(Issue("frame_renamed", frames[0], None, f"written as FRAME {other}"))
        written = {frames[0]: written[other]}
        order = [frames[0]]
    settled = {}
    for name in frames:
        if name not in written:
            issues.append(Issue("frame_missing", name))
        else:
            settled[name] = written[name]
    for name in order:
        if name not in frames:
            issues.append(Issue("frame_extra", name))
    if [n for n in order if n in frames] != [n for n in frames if n in order]:
        issues.append(Issue("frame_order", None, None, "written as " + ", ".join(order)))
    return settled


def _parse_chargrid_body(body: str, width: int, height: int, frames: Sequence[str],
                         issues: list[Issue]) -> Grid | None:
    lines = [line.rstrip() for line in body.splitlines()]
    palette: dict[str, str | None] = {}
    written: dict[str, list[list[str]]] = {}
    order: list[str] = []
    section = None
    current = None
    saw_end = False
    header_may_be_missing = len(frames) == 1 and not any(_frame_header(l.strip()) is not None for l in lines)
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped == "PALETTE" and section is None:
            section = "palette"
            continue
        name = _frame_header(stripped)
        if name is not None and section in ("palette", "frame"):
            if name in written:
                issues.append(Issue("frame_duplicate", name))
            written[name] = []
            order.append(name)
            current, section = name, "frame"
            continue
        if stripped == "END" and section in ("palette", "frame"):
            saw_end, section = True, "after"
            continue
        if section == "palette":
            match = _PALETTE_LINE.fullmatch(stripped)
            if match:
                key, value = match.group(1), match.group(2)
                if key in palette:
                    issues.append(Issue("palette_key_duplicate", None, None, key))
                elif key == TRANSPARENT_KEY and value != "transparent":
                    issues.append(Issue("dot_redefined", None, None, value))
                elif value == "transparent" and key != TRANSPARENT_KEY:
                    issues.append(Issue("extra_transparent_key", None, None, key))
                else:
                    palette[key] = None if value == "transparent" else value
                continue
            if header_may_be_missing and not written:
                issues.append(Issue("frame_header_missing", frames[0], None, "rows follow the palette"))
                current, section = frames[0], "frame"
                written[current] = []
                order.append(current)
            else:
                issues.append(Issue("bad_palette_line", None, None, stripped[:80]))
                continue
        if section == "frame":
            written[current].append(list(line))
        else:
            issues.append(Issue("stray_line", None, None, stripped[:80]))
    if section is None and not palette:
        issues.append(Issue("no_block", None, None, "no PALETTE line"))
        return None
    palette.setdefault(TRANSPARENT_KEY, None)
    palette = {TRANSPARENT_KEY: None, **{k: v for k, v in palette.items() if k != TRANSPARENT_KEY}}
    if not saw_end:
        issues.append(Issue("no_end"))
    settled = _settle_frames(written, order, frames, issues)
    for name, rows in settled.items():
        if len(rows) > height:
            issues.append(Issue("row_count_over", name, None, f"{len(rows)} rows, needs {height}"))
    return Grid("chargrid", width, height, palette, settled)


def _frame_header(stripped: str) -> str | None:
    if stripped == "FRAME":
        return ""
    if stripped.startswith(("FRAME ", "FRAME\t")):
        return stripped[5:].strip()
    return None


def _parse_json_body(body: str, width: int, height: int, frames: Sequence[str], issues: list[Issue]) -> Grid | None:
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        issues.append(Issue("json_invalid", None, None, f"{exc.msg} at line {exc.lineno} column {exc.colno}"))
        return None
    raw_palette = data.get("palette") if isinstance(data, dict) else None
    raw_frames = data.get("frames") if isinstance(data, dict) else None
    if not isinstance(raw_palette, list) or not isinstance(raw_frames, dict) \
            or not all(isinstance(rows, list) for rows in raw_frames.values()):
        issues.append(Issue("json_shape", None, None, 'expected {"palette": [...], "frames": {name: [[...]]}}'))
        return None
    palette: dict[str, str | None] = {}
    for index, value in enumerate(raw_palette):
        if index == 0:
            if value != "transparent":
                issues.append(Issue("palette0_not_transparent", None, None, repr(value)[:40]))
            palette["0"] = None
        elif value == "transparent":
            issues.append(Issue("extra_transparent_key", None, None, str(index)))
        elif isinstance(value, str) and HEX.fullmatch(value):
            palette[str(index)] = value
        else:
            issues.append(Issue("bad_palette_line", None, None, f"palette[{index}] = {value!r}"[:80]))
    if len(raw_palette) - 1 > len(KEYS):
        issues.append(Issue("palette_too_large", None, None, f"{len(raw_palette) - 1} colours, at most {len(KEYS)}"))
    written = {name: [_json_row(row) for row in rows] for name, rows in raw_frames.items()}
    settled = _settle_frames(written, list(raw_frames), frames, issues)
    for name, rows in settled.items():
        if len(rows) > height:
            issues.append(Issue("row_count_over", name, None, f"{len(rows)} rows, needs {height}"))
    return Grid("json", width, height, palette, settled)


def _json_token(value: object) -> str:
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    return json.dumps(value)  # never a palette key: an unknown symbol


def _json_row(row: object) -> list[str]:
    return [_json_token(v) for v in row] if isinstance(row, list) else []


def _blocks(text: str, tag: str) -> list[tuple[str, str | None]]:
    """Every ```<tag> block of an answer, in order, and how each was found: as asked (None), or never
    closed before the next block or the end of the answer (`block_unclosed`)."""
    openers = list(re.finditer(r"```" + re.escape(tag) + r"[ \t]*\r?\n", text))
    out: list[tuple[str, str | None]] = []
    for number, opener in enumerate(openers):
        end = openers[number + 1].start() if number + 1 < len(openers) else len(text)
        close = text.find("```", opener.end(), end)
        out.append((text[opener.end():close], None) if close >= 0 else (text[opener.end():end], "block_unclosed"))
    return out


def _read_body(body: str, found: str | None, fmt: str, width: int, height: int,
               frames: Sequence[str]) -> tuple[Grid | None, list[Issue]]:
    issues = [Issue(found)] if found else []
    parse = _parse_chargrid_body if fmt == "chargrid" else _parse_json_body
    grid = parse(body, width, height, frames, issues)
    if grid is not None and not structural(issues):
        issues.extend(check_rows(grid))
    return grid, issues


def _last_whole(blocks: list[tuple[str, str | None]], fmt: str, width: int, height: int,
                frames: Sequence[str]) -> tuple[Grid | None, list[Issue]]:
    """An answer that wrote its block more than once — a first try, then "Corrected:" and the block
    again: the last block that reads whole is the answer; when none does, the last whose rows the
    row repair can fix; when none can, the last. Which one was read is recorded (`block_many`)."""
    read = [_read_body(body, found, fmt, width, height, frames) for body, found in blocks]
    numbers = range(len(read) - 1, -1, -1)
    chosen = next((n for n in numbers if read[n][0] is not None and not structural(read[n][1])
                   and not row_issues(read[n][1])), None)
    if chosen is None:
        chosen = next((n for n in numbers if read[n][0] is not None and not structural(read[n][1])), len(read) - 1)
    grid, issues = read[chosen]
    return grid, [Issue("block_many", None, None, f"{len(read)} blocks, read block {chosen + 1}"), *issues]


def parse_answer(text: str, fmt: str, width: int, height: int, frames: Sequence[str]) -> tuple[Grid | None, list[Issue]]:
    """Read a model's answer. Returns the grid (None when nothing could be read) and every issue."""
    if fmt not in FORMATS:
        raise ValueError(f"unknown format {fmt!r}")
    tag = "pixels" if fmt == "chargrid" else "json"
    blocks = _blocks(text, tag)
    if len(blocks) > 1:
        return _last_whole(blocks, fmt, width, height, frames)
    body, found = _fenced(text, tag)
    if body is None and fmt == "json":
        start, end = text.find("{"), text.rfind("}")
        body, found = (text[start:end + 1], "block_tag") if 0 <= start < end else (None, None)
    if body is None:
        return None, [Issue("no_block", None, None, f"no ```{tag} block")]
    return _read_body(body, found, fmt, width, height, frames)


def hold_palette(grid: Grid, issues: list[Issue], palette: dict[str, str | None]) -> tuple[Grid, list[Issue]]:
    """`grid` under the palette it was given — a later answer of a set drawn over several, which writes
    the first answer's palette again. A key it added is refused, so its rows become row issues for the
    row repair; a colour it changed is put back. Both are recorded."""
    found = []
    for key, color in grid.palette.items():
        if key not in palette:
            found.append(Issue("palette_added", None, None, f"{key} {color}"))
        elif (color or "").lower() != (palette[key] or "").lower():
            found.append(Issue("palette_changed", None, None, f"{key} {color}, kept {palette[key]}"))
    held = replace(grid, palette=dict(palette))
    return held, [i for i in issues if i.code not in ROW_CODES] + found + check_rows(held)


def joined(grids: Sequence[Grid]) -> Grid:
    """The frames of several answers, in order, under the first answer's palette (`hold_palette`)."""
    frames = {name: rows for grid in grids for name, rows in grid.frames.items()}
    return replace(grids[0], frames=frames)


def read_grid_text(text: str) -> tuple[Grid | None, list[Issue]]:
    """Read a `grid.txt` (the character grid with or without its fence); the frames and the canvas
    size are what it holds — the commonest row length is the width, the commonest row count the
    height, so one row broken by an edit is reported as that row."""
    body, _ = _fenced(text, "pixels")
    body = text if body is None else body
    rows: dict[str, list[str]] = {}
    names: list[str] = []
    for line in body.splitlines():
        stripped = line.strip()
        name = _frame_header(stripped)
        if name is not None:
            names.append(name)
            rows.setdefault(name, [])
        elif stripped == "END":
            break
        elif names and stripped:
            rows[names[-1]].append(line.rstrip())
    if not names:
        return None, [Issue("frame_missing", None, None, "no FRAME line")]
    bad = [n for n in names if not frame_name_ok(n)]
    if bad:
        return None, [Issue("frame_missing", None, None, "frame names are letters, digits, '_' or '-': "
                            + ", ".join(map(repr, bad)))]
    lengths = Counter(len(row) for frame in rows.values() for row in frame)
    counts = Counter(len(frame) for frame in rows.values())
    width = lengths.most_common(1)[0][0] if lengths else 0
    height = counts.most_common(1)[0][0]
    issues: list[Issue] = []
    grid = _parse_chargrid_body(body, width, height, list(dict.fromkeys(names)), issues)
    if grid is not None and not structural(issues):
        issues.extend(check_rows(grid))
    return grid, issues


# ----------------------------------------------------------------------------- repair splicing

def row_text(grid: Grid, row: Sequence[str]) -> str:
    """A row as the model wrote it: keys for a character grid, a JSON list for a JSON answer."""
    if grid.fmt == "chargrid":
        return "".join(row)
    return "[" + ", ".join(row) + "]"


def parse_row_answers(text: str, grid: Grid, wanted: set[tuple[str, int]]) -> tuple[dict[tuple[str, int], list[str]], list[str]]:
    """`ROW <frame> <n>: <row>` lines of a repair answer: the rows asked for, and what was ignored."""
    fixes: dict[tuple[str, int], list[str]] = {}
    ignored: list[str] = []
    for match in _ROW_ANSWER.finditer(text):
        frame, number, value = match.group(1), int(match.group(2)), match.group(3).strip().strip("`").strip()
        if (frame, number) not in wanted:
            ignored.append(f"{frame} {number}")
            continue
        if grid.fmt == "chargrid":
            fixes[(frame, number)] = list(value)
        else:
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                parsed = None
            fixes[(frame, number)] = _json_row(parsed)
    return fixes, ignored


def splice(grid: Grid, fixes: dict[tuple[str, int], list[str]]) -> Grid:
    """`grid` with each fixed row put in its place; a missing row is added where it belongs."""
    frames = {name: [list(row) for row in rows] for name, rows in grid.frames.items()}
    for (name, number), row in sorted(fixes.items(), key=lambda item: (item[0][0], item[0][1])):
        rows = frames[name]
        while len(rows) < number:
            rows.append([])
        rows[number - 1] = list(row)
    return replace(grid, frames=frames)


# ----------------------------------------------------------------------------- grid.txt and renders

def to_text(grid: Grid) -> str:
    """The canonical grid.txt of a grid with no row issues: the character grid, unfenced."""
    keys = grid.key_map()
    lines = ["PALETTE", f"{TRANSPARENT_KEY} transparent"]
    lines += [f"{keys[key]} {color}" for key, color in grid.palette.items() if color is not None]
    for name, rows in grid.frames.items():
        lines.append(f"FRAME {name}")
        lines += ["".join(keys[token] for token in row) for row in rows]
    lines.append("END")
    return "\n".join(lines) + "\n"


def hex_pixel(color: str | None) -> Pixel:
    if color is None:
        return TRANSPARENT
    return (*parse_hex(color), 255)


def frame_pixels(grid: Grid, name: str) -> list[list[Pixel]]:
    colors = {key: hex_pixel(color) for key, color in grid.palette.items()}
    return [[colors[token] for token in row] for row in grid.frames[name]]


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def _stored_zlib(data: bytes) -> bytes:
    """A zlib stream of stored (uncompressed) deflate blocks: its bytes are a function of `data` alone."""
    out = bytearray(b"\x78\x01")
    blocks = [data[i:i + 0xFFFF] for i in range(0, len(data), 0xFFFF)] or [b""]
    for index, block in enumerate(blocks):
        out.append(1 if index == len(blocks) - 1 else 0)
        out += struct.pack("<HH", len(block), len(block) ^ 0xFFFF)
        out += block
    out += struct.pack(">I", zlib.adler32(data) & 0xFFFFFFFF)
    return bytes(out)


def png_bytes(pixels: Sequence[Sequence[Pixel]]) -> bytes:
    """An 8-bit RGBA PNG of `pixels`, byte for byte the same for the same pixels."""
    height, width = len(pixels), len(pixels[0])
    raw = b"".join(b"\x00" + bytes(channel for pixel in row for channel in pixel) for row in pixels)
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return PNG_MAGIC + _chunk(b"IHDR", header) + _chunk(b"IDAT", _stored_zlib(raw)) + _chunk(b"IEND", b"")


def image_of(pixels: Sequence[Sequence[Pixel]]) -> Image.Image:
    image = Image.new("RGBA", (len(pixels[0]), len(pixels)))
    image.putdata([pixel for row in pixels for pixel in row])
    return image


def preview_scale(size: int) -> int:
    """The nearest-neighbour enlargement that makes a frame about 256 px."""
    return max(1, 256 // size)


def preview_strip(frames: Sequence[Sequence[Sequence[Pixel]]], scale: int,
                  columns: int = PREVIEW_COLUMNS) -> Image.Image:
    """The frames side by side, each enlarged `scale` times, two enlarged pixels apart; past `columns`
    frames they go on in rows, left to right and top to bottom, so a long set stays readable."""
    images = [image_of(f).resize((len(f[0]) * scale, len(f) * scale), Image.NEAREST) for f in frames]
    gap = 2 * scale
    across = min(columns, len(images))
    down = -(-len(images) // across)
    width, height = max(i.width for i in images), max(i.height for i in images)
    strip = Image.new("RGBA", (width * across + gap * (across - 1), height * down + gap * (down - 1)))
    for number, image in enumerate(images):
        strip.paste(image, ((number % across) * (width + gap), (number // across) * (height + gap)))
    return strip


def tiled_3x3(pixels: Sequence[Sequence[Pixel]], scale: int) -> Image.Image:
    tile = image_of(pixels)
    tiled = Image.new("RGBA", (tile.width * 3, tile.height * 3))
    for ty in range(3):
        for tx in range(3):
            tiled.paste(tile, (tx * tile.width, ty * tile.height))
    return tiled.resize((tiled.width * scale, tiled.height * scale), Image.NEAREST)


def save_gif(frames: Sequence[Sequence[Sequence[Pixel]]], scale: int, path: Path, duration_ms: int, *, loop: int | None = 0) -> None:
    images = [image_of(f).resize((len(f[0]) * scale, len(f) * scale), Image.NEAREST) for f in frames]
    save_clean_gif(images, path, duration_ms=duration_ms, loop=loop)
