#!/usr/bin/env python3
"""Render a text-overlay payload to a transparent PNG for compositing.

The payload is a JSON file holding one layer. Two kinds:

  text layer  (text_template + font and box fields): plain styled text
  rich layer  (html_template, optional css): full HTML/CSS typography

Both kinds substitute Mustache {{variables}} strictly (a missing variable
is an error) and render on a transparent canvas of canvas_width x
canvas_height. The exact payload JSON is embedded into the output PNG as a
tEXt chunk (keyword scenario-text-overlay:payload) so any render can be
reproduced from the file alone.

Engines: a Chromium-family browser (found automatically, or named via
--browser or $SCENARIO_TEXT_OVERLAY_BROWSER) renders both kinds; without
one, text layers fall back to Pillow (plain typography) and rich layers
fail with instructions.

Usage:
  overlay.py --payload card.json --out card.png
  overlay.py --payload super.json --out super.png --engine pillow

Field reference: references/payloads.md next to this skill's SKILL.md.
Requires chevron; the fallback engine also needs Pillow.
"""

import argparse
import json
import re
import struct
import sys
import zlib
from pathlib import Path

from templating import MissingVariableError, render_strict, variables_to_dict

PAYLOAD_TEXT_CHUNK_KEYWORD = "scenario-text-overlay:payload"

_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}\Z")
_FONT_FAMILY_RE = re.compile(r"^[A-Za-z0-9 +\-]{1,64}\Z")
_FONT_WEIGHTS = (100, 200, 300, 400, 500, 600, 700, 800, 900)
_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _fail(message):
    raise SystemExit(f"invalid payload: {message}")


def _check_int(value, field, low, high):
    if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
        _fail(f"{field} must be an integer in [{low}, {high}]")
    return value


def _check_number(value, field, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _fail(f"{field} must be a number in [{low}, {high}]")
    if not low <= value <= high:
        _fail(f"{field} must be a number in [{low}, {high}]")
    return float(value)


def _check_text(value, field):
    # A JSON \ud800-\udfff escape decodes to a lone surrogate that no
    # renderer can encode back to UTF-8; reject it as payload data.
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        _fail(f"{field} contains an unpaired surrogate escape")
    return value


def _check_choice(value, field, choices):
    if value not in choices:
        _fail(f"{field} must be one of {list(choices)}")
    return value


def _check_value(value, field):
    # A {{name}} substitution takes a string; Mustache section data may be
    # a boolean or nest lists and objects, but every leaf is still a string
    # (numbers would render with float formatting drift, so stringify them).
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return _check_text(value, field)
    if isinstance(value, list):
        for index, item in enumerate(value):
            _check_value(item, f"{field}[{index}]")
        return value
    if not isinstance(value, dict):
        _fail(f"{field} must be a string (stringify numbers), boolean, list, or object")
    for key, item in value.items():
        if not isinstance(key, str) or not key:
            _fail(f"{field} needs non-empty string keys")
        _check_text(key, f"{field} key")
        _check_value(item, f"{field}.{key}")
    return value


def _check_variables(payload):
    variables = payload.get("variables", [])
    if not isinstance(variables, list):
        _fail("variables must be a list of {key, value} objects")
    for entry in variables:
        if not isinstance(entry, dict) or not entry.get("key") or not isinstance(entry["key"], str):
            _fail("each variable needs a non-empty string key")
        _check_text(entry["key"], "variable key")
        if "value" not in entry:
            _fail(f"variable {entry['key']!r} needs a value")
        _check_value(entry["value"], f"variable {entry['key']!r}")
    return variables


def _validate_rich(data):
    if not isinstance(data["html_template"], str) or not data["html_template"]:
        _fail("html_template must be a non-empty string")
    _check_text(data["html_template"], "html_template")
    css = data.get("css")
    if css is not None and not isinstance(css, str):
        _fail("css must be a string")
    if css is not None:
        _check_text(css, "css")
    data["css"] = css
    data["device_scale_factor"] = _check_number(
        data.get("device_scale_factor", 1.0), "device_scale_factor", 0.5, 4.0
    )
    prefixes = data.get("allowed_url_prefixes", [])
    if not isinstance(prefixes, list) or not all(isinstance(p, str) for p in prefixes):
        _fail("allowed_url_prefixes must be a list of strings")
    for prefix in prefixes:
        if not prefix.startswith("https://"):
            _fail(f"allowed_url_prefixes entries must start with https:// ({prefix!r})")
        if "@" in prefix or ".." in prefix:
            _fail(f"allowed_url_prefixes entries must not contain '@' or '..' ({prefix!r})")
    data["allowed_url_prefixes"] = prefixes
    return data


def _validate_text(data):
    if not isinstance(data["text_template"], str) or not data["text_template"]:
        _fail("text_template must be a non-empty string")
    _check_text(data["text_template"], "text_template")
    family, url = data.get("font_family"), data.get("font_url")
    if (family is None) == (url is None):
        _fail("provide exactly one of font_family or font_url")
    if family is not None and (not isinstance(family, str) or not _FONT_FAMILY_RE.match(family)):
        _fail("font_family may only contain letters, digits, spaces, '+' and '-' (max 64 chars)")
    if url is not None and (not isinstance(url, str) or not url.startswith("https://")):
        _fail("font_url must be an https:// URL")
    data["font_family"], data["font_url"] = family, url
    weight = data.get("font_weight", 400)
    if isinstance(weight, bool) or not isinstance(weight, int):
        _fail("font_weight must be an integer")
    data["font_weight"] = _check_choice(weight, "font_weight", _FONT_WEIGHTS)
    data["font_style"] = _check_choice(
        data.get("font_style", "normal"), "font_style", ("normal", "italic")
    )
    data["size"] = _check_int(data.get("size"), "size", 4, 2048)
    color = data.get("color", "#000000")
    if not isinstance(color, str) or not _HEX_COLOR_RE.match(color):
        _fail("color must be #RRGGBB hex (e.g. '#1A2B3C')")
    data["color"] = color
    data["align"] = _check_choice(data.get("align", "left"), "align", ("left", "center", "right"))
    bbox = data.get("bbox")
    if not isinstance(bbox, list) or len(bbox) != 1 or not isinstance(bbox[0], dict):
        _fail("bbox must be a list holding exactly one {x, y, w, h} object")
    box = bbox[0]
    x = _check_int(box.get("x"), "bbox.x", 0, 8192)
    y = _check_int(box.get("y"), "bbox.y", 0, 8192)
    w = _check_int(box.get("w"), "bbox.w", 1, 8192)
    h = _check_int(box.get("h"), "bbox.h", 1, 8192)
    if x + w > data["canvas_width"] or y + h > data["canvas_height"]:
        _fail(
            f"bbox ({x}, {y}, {w}, {h}) does not fit inside canvas "
            f"{data['canvas_width']}x{data['canvas_height']}"
        )
    data["bbox"] = [{"x": x, "y": y, "w": w, "h": h}]
    data["line_height"] = _check_number(data.get("line_height", 1.2), "line_height", 0.5, 4.0)
    data["letter_spacing"] = _check_number(
        data.get("letter_spacing", 0.0), "letter_spacing", -1000, 1000
    )
    data["overflow"] = _check_choice(
        data.get("overflow", "wrap"), "overflow", ("clip", "wrap", "shrink")
    )
    return data


def validate_payload(payload):
    """Return ("text" | "rich", payload with defaults applied) or exit."""
    if not isinstance(payload, dict):
        _fail("payload must be a JSON object")
    has_text = "text_template" in payload
    has_rich = "html_template" in payload
    if has_text == has_rich:
        _fail("provide exactly one of text_template (text layer) or html_template (rich layer)")
    data = dict(payload)
    data["variables"] = _check_variables(payload)
    _check_int(data.get("canvas_width"), "canvas_width", 1, 8192)
    _check_int(data.get("canvas_height"), "canvas_height", 1, 8192)
    if has_rich:
        return "rich", _validate_rich(data)
    return "text", _validate_text(data)


def embed_payload(png_bytes, payload):
    """Insert the payload JSON as a tEXt chunk right after IHDR.

    The value is compact ASCII JSON, so the PNG alone carries everything
    needed to reproduce its own render.
    """
    if png_bytes[:8] != _PNG_SIGNATURE:
        raise SystemExit("renderer did not produce a PNG")
    serialized = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    body = PAYLOAD_TEXT_CHUNK_KEYWORD.encode("latin-1") + b"\x00" + serialized.encode("latin-1")
    chunk = (
        struct.pack(">I", len(body))
        + b"tEXt"
        + body
        + struct.pack(">I", zlib.crc32(b"tEXt" + body) & 0xFFFFFFFF)
    )
    ihdr_end = 8 + 4 + 4 + struct.unpack(">I", png_bytes[8:12])[0] + 4
    return png_bytes[:ihdr_end] + chunk + png_bytes[ihdr_end:]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--payload", required=True, help="path to the payload JSON file")
    parser.add_argument("--out", required=True, help="output PNG path")
    parser.add_argument(
        "--engine",
        choices=["auto", "browser", "pillow"],
        default="auto",
        help="auto tries a browser first, then Pillow for text layers",
    )
    parser.add_argument("--browser", help="path or command of a Chromium-family browser")
    args = parser.parse_args(argv)

    try:
        payload = json.loads(Path(args.payload).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SystemExit(f"cannot read payload {args.payload!r}: {error}")
    kind, data = validate_payload(payload)
    try:
        variables = variables_to_dict(data["variables"])
    except ValueError as error:
        _fail(str(error))

    template = data["html_template"] if kind == "rich" else data["text_template"]
    try:
        rendered = render_strict(template, variables)
    except MissingVariableError as error:
        _fail(str(error))

    import html_render

    browser = None if args.engine == "pillow" else html_render.find_browser(args.browser)

    if kind == "rich":
        if browser is None:
            raise SystemExit(
                "rich layers need a Chromium-family browser (Chrome, Chromium, Edge, "
                "or Brave); install one or point --browser or "
                f"${html_render.BROWSER_ENV} at it"
            )
        document = html_render.assemble_html(rendered, data["css"])
        html_render.warn_remote_urls(document, tuple(data["allowed_url_prefixes"]))
        html_render.screenshot(
            browser,
            document,
            args.out,
            data["canvas_width"],
            data["canvas_height"],
            data["device_scale_factor"],
        )
    else:
        if browser is not None:
            size = data["size"]
            if data["overflow"] == "shrink":
                measure = html_render.text_layer_html(data, rendered, size, measure=True)
                size = html_render.fitted_size(browser, measure)
                if size < 0:
                    box = data["bbox"][0]
                    raise SystemExit(
                        f"text cannot fit in bbox ({box['w']}x{box['h']}) "
                        f"even at size {html_render.MIN_SHRINK_SIZE}"
                    )
            document = html_render.text_layer_html(data, rendered, size)
            html_render.screenshot(
                browser, document, args.out, data["canvas_width"], data["canvas_height"]
            )
        else:
            if args.engine == "browser":
                raise SystemExit(
                    "no Chromium-family browser found; install one or use --engine pillow"
                )
            print(
                "note: no browser found; using the Pillow fallback (plain typography)",
                file=sys.stderr,
            )
            import pillow_render

            pillow_render.render_text_payload(data, rendered).save(args.out, "PNG")

    out = Path(args.out)
    out.write_bytes(embed_payload(out.read_bytes(), payload))
    print(args.out)


if __name__ == "__main__":
    main()
