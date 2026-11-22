#!/usr/bin/env python3
"""Build sprite layout guides from the adjacent JSON manifest; requires Pillow."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

MANIFEST = Path(__file__).resolve().parent.parent / "grid-templates.json"


def render(template, role):
    width, height = template["canvas"]
    cell_width, cell_height = template["cell_size"]
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    for x in range(0, width, cell_width):
        draw.line((x, 0, x, height - 1), fill="#6b7280")
    for y in range(0, height, cell_height):
        draw.line((0, y, width - 1, y), fill="#6b7280")
    draw.rectangle((0, 0, width - 1, height - 1), outline="#6b7280")
    if role == "alignment-guide":
        guide = template["cell_guides"]
        inset = guide["inset"]
        for cell in template["cells"]:
            x, y, w, h = cell["box"]
            right, bottom = x + w - inset - 1, y + h - inset - 1
            draw.rectangle((x + inset, y + inset, right, bottom), outline="#d1d5db")
            baseline = y + guide["baseline_y"]
            draw.line((x + inset, baseline, right, baseline), fill="#2563eb", width=2)
            center = x + guide["center_x"]
            for dy in range(inset, h - inset, 12):
                draw.line((center, y + dy, center, min(y + dy + 5, bottom)), fill="#9ca3af")
    elif role != "grid":
        raise ValueError(f"Unknown role: {role}")
    return image


def build(destination, template_name=None):
    manifest = json.loads(MANIFEST.read_text())
    selected = [t for t in manifest["templates"]
                if template_name is None or t["name"] == template_name]
    if not selected:
        raise ValueError(f"Unknown template: {template_name}")
    destination.mkdir(parents=True, exist_ok=True)
    for template in selected:
        for role, entry in template["files"].items():
            entry.pop("asset_id", None)
            path = destination / entry["file"]
            render(template, role).save(path)
            entry["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest["templates"] = selected
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--template", help="One template name from grid-templates.json; default: all")
    args = parser.parse_args()
    build(args.output, args.template)
