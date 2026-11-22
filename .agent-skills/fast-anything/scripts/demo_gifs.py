"""Renders the README demo GIFs from transcripts of real fast-anything runs.

    python scripts/demo_gifs.py      (needs Pillow; Windows fonts by default, set FA_FONT/FA_SYMBOL_FONT elsewhere)
"""

import os
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "docs" / "assets"
FONT = os.environ.get("FA_FONT", "C:/Windows/Fonts/consola.ttf")
BOLD = os.environ.get("FA_FONT_BOLD", "C:/Windows/Fonts/consolab.ttf")
SYMBOL = os.environ.get("FA_SYMBOL_FONT", "C:/Windows/Fonts/seguisym.ttf")
SIZE, LINE, PAD, BAR = 17, 24, 22, 34
COLORS = {
    "": (201, 209, 217), "o": (255, 135, 0), "g": (63, 185, 80), "r": (248, 81, 73),
    "d": (125, 133, 144), "b": (240, 246, 252), "y": (210, 153, 34), "p": (63, 185, 80),
}
BG, CHROME = (13, 17, 23), (22, 27, 34)
SYMBOLS = set("⚡▸✓✗→·●○↳")
BLOCKS = {"█": 1.0, "▉": 7 / 8, "▊": 6 / 8, "▋": 5 / 8, "▌": 4 / 8, "▍": 3 / 8, "▎": 2 / 8, "▏": 1 / 8}

font = ImageFont.truetype(FONT, SIZE)
bold = ImageFont.truetype(BOLD, SIZE)
symbol = ImageFont.truetype(SYMBOL, SIZE + 1)
CELL = font.getlength("M")


def spans(markup):
    """'[o]orange[/] plain' -> [(color, text), ...]"""
    out, color = [], ""
    for part in re.split(r"(\[[a-z]?\]|\[/\])", markup):
        if re.fullmatch(r"\[[a-z]?\]", part):
            color = part[1:-1]
        elif part == "[/]":
            color = ""
        elif part:
            out.append((color, part))
    return out


def render(lines, width, height, cursor=False):
    img = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, width, BAR], fill=CHROME)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([16 + i * 22, 11, 28 + i * 22, 23], fill=c)
    d.text((width / 2, BAR / 2), "fast-anything", font=font, fill=COLORS["d"], anchor="mm")
    y = BAR + PAD - 4
    last_x = PAD
    for line in lines:
        x = PAD
        for color, text in spans(line):
            for ch in text:
                fill = COLORS[color]
                if ch in BLOCKS:
                    d.rectangle([x, y + 3, x + CELL * BLOCKS[ch] - 1, y + LINE - 5], fill=fill)
                elif ch in SYMBOLS:
                    d.text((x + CELL / 2, y + LINE / 2 - 2), ch, font=symbol, fill=fill, anchor="mm")
                else:
                    d.text((x, y + 2), ch, font=bold if color in ("b", "o") else font, fill=fill)
                x += CELL
        last_x = x
        y += LINE
    if cursor:
        d.rectangle([last_x + 2, y - LINE + 4, last_x + CELL - 1, y - 4], fill=COLORS[""])
    return img


def make(name, script, width, rows):
    """script: list of ("type", text) | ("out", line, ms) | ("spin", label, seconds) | ("wait", ms) | ("clear",)"""
    height = BAR + PAD * 2 + rows * LINE
    frames, durations, lines = [], [], []

    def snap(ms, cursor=False):
        frames.append(render(lines[-rows:], width, height, cursor))
        durations.append(ms)

    for step in script:
        kind = step[0]
        if kind == "type":
            lines.append("[p]$[/] ")
            text = step[1]
            for i in range(0, len(text), 3):
                lines[-1] = "[p]$[/] [b]" + text[: i + 3] + "[/]"
                snap(45, cursor=True)
            snap(450, cursor=True)
        elif kind == "out":
            lines.append(step[1])
            snap(step[2] if len(step) > 2 else 90)
        elif kind == "spin":
            lines.append("")
            for i in range(int(step[2] * 8)):
                lines[-1] = "[o]" + "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"[i % 10] + "[/] " + step[1]
                snap(110)
            lines[-1] = "[o]▸[/] " + step[1]
            snap(60)
        elif kind == "wait":
            snap(step[1])
        elif kind == "clear":
            lines.clear()

    palette = frames[-1].convert("P", palette=Image.ADAPTIVE, colors=64)
    frames = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    frames[0].save(OUT / name, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print(name, len(frames), "frames,", (OUT / name).stat().st_size // 1024, "KB")


SYMBOL_SPIN = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
SYMBOLS.update(SYMBOL_SPIN)

GO = [
    ("type", "fast-anything go --agent claude -- python app.py"),
    ("out", "[o]⚡ fast-anything[/] [d]v0.1.0[/]"),
    ("spin", "profiling [b]python app.py[/]", 1.2),
    ("out", "[g]✓[/] [b]python app.py[/] ran in 21.73s [d](under the profiler)[/]"),
    ("out", ""),
    ("out", "[d]   #  function                time              calls  verdict[/]"),
    ("out", "   1  fuzzy.find_duplicates   [o]█████████[/]  99.9%        1  [g]✓ port it[/]", 160),
    ("out", "[d]   2  fuzzy.levenshtein       █████████  99.6%  244,650  ↳ ported inside it[/]"),
    ("out", "[d]   3  fuzzy.normalize                     0.0%      700  ↳ ported inside it[/]"),
    ("out", "[d]   4  app.py:main             █████████ 100.0%        1  ✗ lives in the entry script[/]"),
    ("out", ""),
    ("spin", "recording real calls to [b]fuzzy.find_duplicates[/]", 0.8),
    ("spin", "[b]claude[/] is writing the Rust port [d](attempt 1/3)[/]", 2.0),
    ("spin", "building [b]fa_fuzzy_find_duplicates[/] [d](release)[/]", 0.8),
    ("spin", "replaying recorded + derived calls against the Rust port", 0.6),
    ("out", "[g]✓[/] 26/26 calls give the same result [d](1 recorded + 25 derived)[/]", 300),
    ("out", "[g]✓[/] [b]fuzzy.find_duplicates[/] now runs in Rust"),
    ("spin", "timing [b]python app.py[/] [d](5 runs each, interleaved)[/]", 1.0),
    ("out", ""),
    ("out", "  Python      [d]████████████████████████[/] 5.05s", 200),
    ("out", "  Rust        [o]▎[/]                        49ms", 200),
    ("out", ""),
    ("out", "[g]✓[/] [b]python app.py[/] is [o]103× faster[/] end to end", 4500),
]

VERIFY = [
    ("type", "fast-anything verify"),
    ("spin", "building [b]fa_fuzzy_levenshtein[/] [d](release)[/]", 0.6),
    ("spin", "replaying 500 recorded calls against the Rust port", 0.6),
    ("out", "[r]✗[/] 148/500 recorded calls don't match", 250),
    ("out", "    levenshtein('neah larsen', 'josé smita')"),
    ("out", "      expected [g]10[/]"),
    ("out", "      got      [r]11[/]", 250),
    ("out", "    levenshtein('fatima haddad', 'łukasz kowalski')"),
    ("out", "      expected [g]13[/]"),
    ("out", "      got      [r]14[/]", 2200),
    ("out", ""),
    ("out", "[d]# the port compared bytes, Python compares characters. Fixed:[/]", 1500),
    ("type", "fast-anything verify"),
    ("spin", "building [b]fa_fuzzy_levenshtein[/] [d](release)[/]", 0.6),
    ("spin", "replaying 500 recorded calls against the Rust port", 0.6),
    ("out", "[g]✓[/] 500/500 recorded calls give the same result", 300),
    ("out", "[g]✓[/] [b]fuzzy.levenshtein[/] per call: 18.9µs in Python, 450ns in Rust: [o]42× faster[/]", 4000),
]

if __name__ == "__main__":
    make("demo.gif", GO, 920, 22)
    make("verify.gif", VERIFY, 920, 17)
