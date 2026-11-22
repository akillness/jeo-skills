# SPDX-License-Identifier: Apache-2.0
"""`slice-sheet` on a sheet that is already transparent (`--chroma-key none`) and with the
shared alpha haze cleanup (`--alpha-floor`): a hazy ring around each prop would otherwise
join the prop's part and enlarge its measured height."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from sprite_gen import cli
from sprite_gen.frames.slice_sheet import slice_sheet

PROP = (60, 90, 140, 250)


def hazy_prop_sheet() -> Image.Image:
    pixels = np.zeros((200, 300, 4), dtype=np.uint8)
    for col in range(3):
        for row in range(2):
            x0, y0 = col * 100 + 30, row * 100 + 20
            pixels[y0:y0 + 60, x0:x0 + 40] = PROP
    solid = pixels[..., 3] > 0
    near = np.zeros_like(solid)
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            near |= np.roll(np.roll(solid, dy, 0), dx, 1)
    pixels[near & ~solid] = (200, 200, 220, 20)
    pixels[3, 3] = (255, 255, 255, 30)
    return Image.fromarray(pixels)


def opaque_height(path: Path) -> int:
    with Image.open(path) as image:
        alpha = np.asarray(image.convert("RGBA"))[..., 3]
    rows = np.flatnonzero((alpha >= 128).any(axis=1))
    return int(rows[-1] - rows[0] + 1)


def slice_(tmp_path, name, **kwargs):
    sheet = tmp_path / "props.png"
    hazy_prop_sheet().save(sheet)
    return slice_sheet(sheet, tmp_path / name, None, canvas=(128, 192), baseline_y=180.0,
                       target_height=120.0, **kwargs)


def test_alpha_floor_clears_the_haze_ring_before_measuring_parts(tmp_path):
    hazy = slice_(tmp_path, "hazy")
    clean = slice_(tmp_path, "clean", alpha_floor=64)
    # the ring adds 6 px above and below the 60 px prop; cleaned, only the 2 px edge band stays
    assert opaque_height(clean[0]) > opaque_height(hazy[0])
    assert abs(opaque_height(clean[0]) - round(120 * 60 / 64)) <= 1
    report = json.loads((tmp_path / "clean" / "alpha-cleanup.json").read_text())
    assert report["floor"] == 64 and report["edge_px"] == 2
    assert report["haze_fraction_before"] > 0 and report["haze_fraction_after"] == 0
    assert report["changed_solid_pixels"] == 0
    assert not (tmp_path / "hazy" / "alpha-cleanup.json").exists()
    # the slice report names the cleanup report
    assert json.loads((tmp_path / "clean" / "slice-sheet.json").read_text())["alpha_cleanup"] == "alpha-cleanup.json"


def test_cli_takes_none_and_the_floor(tmp_path):
    sheet = tmp_path / "props.png"
    hazy_prop_sheet().save(sheet)
    out = tmp_path / "out"
    assert cli.main(["slice-sheet", "--sheet", str(sheet), "--out-dir", str(out), "--chroma-key", "none",
                     "--alpha-floor", "64", "--prefix", "prop_", "--cell-width", "128", "--cell-height", "192",
                     "--baseline-y", "180", "--target-height", "120"]) == 0
    assert (out / "prop_alpha-cleanup.json").is_file()
    assert len(list(out.glob("prop_cell-*.png"))) == 6
