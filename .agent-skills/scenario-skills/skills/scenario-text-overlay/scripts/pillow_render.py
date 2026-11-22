"""Pillow fallback for text-layer payloads when no browser is available.

Plain typography only: font, size, color, alignment, line height, letter
spacing, and the overflow modes are honored, but none of the HTML/CSS a
browser render offers, and rich layers are out of reach entirely. Fonts
resolve in order: font_url (.ttf/.otf download), font_family via Google
Fonts (TrueType variant), then a local system font as a last resort.

Requires Pillow (pip install pillow).
"""

import re
import sys
import tempfile
import urllib.request
from pathlib import Path

from html_render import MIN_SHRINK_SIZE, google_fonts_url

_FONT_FETCH_TIMEOUT_S = 20

_SYSTEM_FONT_CANDIDATES = (
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
)


def _download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "python-urllib"})
    with urllib.request.urlopen(request, timeout=_FONT_FETCH_TIMEOUT_S) as response:
        return response.read()


def _cache_font(data, suffix):
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(data)
    return handle.name


def resolve_font_file(payload):
    """Return a local font path for the payload, or None for a system font.

    The Google Fonts css2 endpoint serves TrueType URLs to non-browser
    user agents, which is what Pillow can read.
    """
    font_url = payload.get("font_url")
    if font_url:
        if not font_url.lower().endswith((".ttf", ".otf")):
            raise SystemExit(
                "the fallback engine reads only .ttf/.otf font_url files; "
                "use a browser engine for woff/woff2"
            )
        return _cache_font(_download(font_url), Path(font_url).suffix)
    try:
        css_url = google_fonts_url(
            payload["font_family"], payload["font_weight"], payload["font_style"]
        )
        css = _download(css_url).decode("utf-8")
        match = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+\.ttf)\)", css)
        if match:
            return _cache_font(_download(match.group(1)), ".ttf")
        detail = "no TrueType URL in the css2 response"
    except OSError as error:
        detail = error
    print(
        f"warning: could not fetch Google Font {payload['font_family']!r} "
        f"({detail}); falling back to a system font",
        file=sys.stderr,
    )
    return None


def _load_font(font_path, size):
    from PIL import ImageFont

    candidates = [font_path] if font_path else list(_SYSTEM_FONT_CANDIDATES)
    for candidate in candidates:
        try:
            return ImageFont.truetype(str(candidate), size)
        except OSError:
            if font_path:
                raise SystemExit(f"cannot load font {font_path!r}")
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _line_width(draw, line, font, letter_spacing):
    width = draw.textlength(line, font=font)
    if letter_spacing and len(line) > 1:
        width += letter_spacing * (len(line) - 1)
    return width


def _wrap(draw, text, font, max_width, letter_spacing):
    lines = []
    for paragraph in text.split("\n"):
        current = ""
        for word in paragraph.split():
            trial = f"{current} {word}".strip()
            if _line_width(draw, trial, font, letter_spacing) <= max_width:
                current = trial
                continue
            if current:
                lines.append(current)
            # A word wider than the box breaks across lines, matching the
            # browser engine's overflow-wrap:break-word.
            current = word
            while _line_width(draw, current, font, letter_spacing) > max_width and len(current) > 1:
                head = current
                while len(head) > 1 and _line_width(draw, head, font, letter_spacing) > max_width:
                    head = head[:-1]
                lines.append(head)
                current = current[len(head):]
        lines.append(current)
    return lines


def _draw_line(draw, x, y, line, font, color, letter_spacing):
    if not letter_spacing:
        draw.text((x, y), line, font=font, fill=color)
        return
    for char in line:
        draw.text((x, y), char, font=font, fill=color)
        x += draw.textlength(char, font=font) + letter_spacing


def _layout(draw, payload, text, size, font_path):
    font = _load_font(font_path, size)
    lines = _wrap(draw, text, font, payload["bbox"][0]["w"], payload["letter_spacing"])
    line_height = round(size * payload["line_height"])
    return font, lines, line_height


def _shrink_size(draw, payload, text, font_path):
    """Binary-search the largest size in [MIN_SHRINK_SIZE, size] that fits."""
    box = payload["bbox"][0]

    def height_at(size):
        # Some fonts cannot be measured at tiny sizes (Pillow raises
        # OSError); treat those sizes as not fitting.
        try:
            _, lines, line_height = _layout(draw, payload, text, size, font_path)
        except OSError:
            return None
        return line_height * len(lines)

    lo, hi = MIN_SHRINK_SIZE, payload["size"]
    floor = None
    for size in range(lo, hi + 1):
        floor = height_at(size)
        if floor is not None:
            lo = size
            break
    if floor is None or floor > box["h"]:
        raise SystemExit(
            f"text cannot fit in bbox ({box['w']}x{box['h']}) even at size {lo}"
        )
    while lo < hi:
        mid = (lo + hi + 1) // 2
        height = height_at(mid)
        if height is not None and height <= box["h"]:
            lo = mid
        else:
            hi = mid - 1
    return lo


def render_text_payload(payload, rendered_text):
    """Render a validated text-layer payload to a transparent RGBA image."""
    from PIL import Image, ImageDraw

    canvas = Image.new(
        "RGBA", (payload["canvas_width"], payload["canvas_height"]), (0, 0, 0, 0)
    )
    draw = ImageDraw.Draw(canvas)
    font_path = resolve_font_file(payload)
    box = payload["bbox"][0]

    size = payload["size"]
    if payload["overflow"] == "shrink":
        size = _shrink_size(draw, payload, rendered_text, font_path)
    font, lines, line_height = _layout(draw, payload, rendered_text, size, font_path)

    clip = payload["overflow"] == "clip"
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0)) if clip else canvas
    layer_draw = ImageDraw.Draw(layer)
    y = box["y"]
    for line in lines:
        width = _line_width(layer_draw, line, font, payload["letter_spacing"])
        if payload["align"] == "center":
            x = box["x"] + (box["w"] - width) / 2
        elif payload["align"] == "right":
            x = box["x"] + box["w"] - width
        else:
            x = box["x"]
        _draw_line(layer_draw, x, y, line, font, payload["color"], payload["letter_spacing"])
        y += line_height
    if clip:
        region = (box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"])
        canvas.paste(layer.crop(region), region)
    return canvas
