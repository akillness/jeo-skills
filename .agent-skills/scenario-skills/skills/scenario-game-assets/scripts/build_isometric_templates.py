#!/usr/bin/env python3
"""Build neutral geometry references and masks; requires Pillow."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

SIZE = 1024
ANCHOR = (512, 704)
TAG = "skill:scenario-game-assets:isometric"


def geometry(shape):
    if shape == "diamond":
        offsets = [(0, -192), (384, 0), (0, 192), (-384, 0)]
        steps = [(384, 192), (-384, 192)]
    elif shape == "hex":
        # A regular ground-plane hex projected at 30 degrees, rounded to pixels.
        offsets = [(-192, -166), (192, -166), (384, 0),
                   (192, 166), (-192, 166), (-384, 0)]
        steps = [(576, 166), (0, 332)]
    else:
        raise ValueError(shape)
    return [(x + ANCHOR[0], y + ANCHOR[1]) for x, y in offsets], steps


def mask(points):
    result = Image.new("L", (SIZE, SIZE))
    ImageDraw.Draw(result).polygon(points, fill=255)
    return result


def build(shape, thickness):
    points, steps = geometry(shape)
    ground = mask(points)
    whole = ground.copy()
    reference = Image.new("RGBA", (SIZE, SIZE))
    draw = ImageDraw.Draw(reference)
    if thickness:
        for a, b in zip(points, points[1:] + points[:1]):
            if b[0] < a[0]:
                face = [a, b, (b[0], b[1] + thickness),
                        (a[0], a[1] + thickness)]
                draw.polygon(face, fill=(154, 160, 166, 255))
                ImageDraw.Draw(whole).polygon(face, fill=255)
    draw.polygon(points, fill=(215, 219, 222, 255))
    envelope = whole.copy()
    # Sweep the footprint upward: this is editing space, not a final alpha matte.
    for offset in range(1, 449):
        ImageDraw.Draw(envelope).polygon(
            [(x, y - offset) for x, y in points], fill=255)
    return {
        "reference": reference,
        "ground-region": ground,
        "side-region": ImageChops.subtract(whole, ground),
        "object-region": envelope,
    }, points, steps


def write_bundle(destination):
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "tag": TAG, "canvas": [SIZE, SIZE],
                "region_convention": "white=region; adapt to the model schema",
                "templates": []}
    sheet = Image.new("RGB", (1440, 960), "#f1f0ec")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=24)
    draw.text((40, 24), "ISOMETRIC BASES / v1", font=font, fill="#242d35")
    for index, (shape, thickness) in enumerate(
            [("diamond", 0), ("diamond", 32), ("hex", 0), ("hex", 32)]):
        name = f"{shape}-{'slab' if thickness else 'ground'}-v1"
        images, points, steps = build(shape, thickness)
        files = {}
        for role, image in images.items():
            filename = f"{name}-{role}.png"
            if role == "side-region" and not image.getbbox():
                filename = "empty-side-region-v1.png"
            image.save(destination / filename)
            files[role] = {"file": filename, "sha256": hashlib.sha256(
                (destination / filename).read_bytes()).hexdigest()}
        manifest["templates"].append({
            "name": name, "anchor": list(ANCHOR), "ground_polygon": points,
            "grid_steps": steps, "thickness": thickness,
            "projection": "2:1 dimetric" if shape == "diamond" else "30 degree hex",
            "files": files,
        })
        x, y = 40 + (index % 2) * 700, 90 + (index // 2) * 420
        preview = images["reference"].resize((390, 390), Image.Resampling.LANCZOS)
        sheet.paste(preview, (x, y), preview)
        draw.text((x, y), name, font=font, fill="#242d35")
        draw.text((x + 400, y + 125), "Ground region", fill="#42525e", font=font)
        draw.text((x + 400, y + 275), "Object space", fill="#42525e", font=font)
        for role, dy in [("ground-region", 15), ("object-region", 165)]:
            small = images[role].resize((120, 120), Image.Resampling.NEAREST)
            sheet.paste(small, (x + 430, y + dy))
    draw.text((40, 930), "Neutral geometry only. White masks mark regions; object space is not a clipping mask.",
              fill="#42525e", font=ImageFont.load_default(size=18))
    sheet.save(destination / "contact-sheet.png")
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    write_bundle(parser.parse_args().output)
