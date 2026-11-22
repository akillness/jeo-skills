"""Small synthetic inputs shared by the suites: sheets, magenta stills, layers, a run clip, a whole art set."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-blender-2d-animation" / "scripts"
MAGENTA = (255, 0, 255)
HAS_FFMPEG = bool(shutil.which("ffmpeg"))
BLENDER = os.environ.get("BLENDER") or shutil.which("blender")


def run(script, *args, cwd=None):
    return subprocess.run([sys.executable, "-B", str(SCRIPTS / script), *map(str, args)],
                          capture_output=True, text=True, cwd=cwd)


def alpha(path):
    return pixels(path)[..., 3]


def pixels(path):
    with Image.open(path) as im:
        return np.asarray(im.convert("RGBA"))


def size(path):
    with Image.open(path) as im:
        return im.size


def rgba(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def props_sheet(path, speck=False):
    """Three blobs in two rows (reading order: wide, tall, round), optionally a speck."""
    im = rgba(400, 300)
    d = ImageDraw.Draw(im)
    d.rectangle((20, 20, 159, 79), fill=(200, 120, 40, 255))      # row 1, left: 140 x 60
    d.rectangle((240, 10, 299, 109), fill=(40, 90, 200, 255))     # row 1, right: 60 x 100
    d.ellipse((120, 170, 219, 269), fill=(60, 160, 60, 255))      # row 2: 100 x 100
    if speck:
        d.rectangle((350, 250, 354, 254), fill=(255, 255, 255, 255))
    im.save(path)


def magenta_still(path, ear=(230, 120, 200)):
    """A dark figure on magenta with two enclosed holes: a pink inner ear and a pure magenta gap."""
    im = Image.new("RGB", (200, 200), MAGENTA)
    d = ImageDraw.Draw(im)
    d.rectangle((50, 40, 149, 169), fill=(40, 40, 60))
    d.rectangle((70, 60, 89, 79), fill=ear)          # enclosed pink: part of the character
    d.rectangle((110, 110, 129, 129), fill=MAGENTA)  # enclosed magenta: background seen through the figure
    im.save(path)


def wide_layer(path, w=400, h=120):
    """A low strip whose red drifts from 30 to 230 across the width, so its two ends do not match, like a
    generated layer's; a tall landmark in the middle; a tall tree at the right end and a low bush near the left
    end, which the other end does not have."""
    im = rgba(w, h)
    d = ImageDraw.Draw(im)
    for x in range(w):
        d.line((x, 80, x, h - 1), fill=(30 + 200 * x // (w - 1), 120, 60, 255))
    d.rectangle((150, 10, 170, 79), fill=(120, 110, 100, 255))
    d.rectangle((380, 30, w - 1, h - 1), fill=(90, 60, 40, 255))
    d.rectangle((20, 72, 40, 79), fill=(70, 140, 50, 255))
    im.save(path)


def run_clip(path, frames=60, period=10, size_px=96, background=None):
    """A figure on magenta whose leg swings with the given period; lossless, so keys and loops are exact.

    background(i) returns the frame's background color (default: always magenta)."""
    tmp = Path(path).with_suffix("")
    tmp.mkdir(parents=True, exist_ok=True)
    for i in range(frames):
        im = Image.new("RGB", (size_px, size_px), background(i) if background else MAGENTA)
        d = ImageDraw.Draw(im)
        d.rectangle((38, 20, 57, 69), fill=(40, 60, 160))
        phase = 2 * np.pi * i / period      # sine and cosine together: no two phases share a pose
        swing, lift = round(12 * np.sin(phase)), round(6 * np.cos(phase))
        d.rectangle((44 + swing, 64, 51 + swing, 85 - lift), fill=(230, 200, 60))   # always joined to the body
        im.save(tmp / f"f_{i:04d}.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "24", "-i", str(tmp / "f_%04d.png"),
                    "-c:v", "png", str(path)], check=True)
    shutil.rmtree(tmp)


def _sprite(path, w, h, box, shape="rect", color=(150, 100, 60, 255)):
    im = rgba(w, h)
    d = ImageDraw.Draw(im)
    (d.ellipse if shape == "ellipse" else d.rectangle)(box, fill=color)
    im.save(path)


def art_set(set_dir, run_n=9, canvas=192):
    """Every picture build_scene.py reads, with the numbers measure_set.py and trace_hulls.py would find."""
    g = Path(set_dir) / "game"
    (g / "hero_run").mkdir(parents=True, exist_ok=True)
    Image.new("RGBA", (256, 144), (90, 140, 220, 255)).save(g / "sky.png")
    _sprite(g / "sea_tile.png", 384, 144, (0, 72, 383, 143), color=(40, 90, 160, 255))          # horizon at 0.5
    _sprite(g / "jungle_tile.png", 384, 144, (0, 64, 383, 143), color=(40, 120, 60, 255))
    _sprite(g / "ground_tile.png", 256, 100, (0, 30, 255, 99), color=(110, 80, 40, 255))         # walkable at 0.3
    for name in ("fg_bush", "fg_fern", "fg_hibiscus", "fg_boulder", "fg_curl"):
        _sprite(g / f"{name}.png", 64, 64, (4, 8, 59, 63), shape="ellipse", color=(20, 60, 30, 255))
    _sprite(g / "island.png", 192, 64, (0, 6, 191, 40), color=(120, 100, 70, 255))                # top at row 6
    _sprite(g / "pedestal.png", 160, 64, (0, 10, 159, 63), color=(150, 150, 140, 255))            # top at row 10
    _sprite(g / "palm.png", 96, 256, (36, 10, 59, 239), color=(90, 60, 30, 255))                  # 16 empty rows below
    _sprite(g / "coin.png", 32, 32, (2, 2, 29, 29), shape="ellipse", color=(240, 200, 40, 255))
    for name, shape in (("jar", "rect"), ("pot_round", "ellipse"), ("idol", "rect"), ("amphora", "ellipse"),
                        ("coconut", "ellipse")):
        _sprite(g / f"{name}.png", 64, 96, (6, 6, 57, 89), shape=shape)
    _sprite(g / "hero_jump.png", canvas, canvas, (70, 60, 121, 150), color=(40, 60, 160, 255))   # feet row 150
    for i in range(1, run_n + 1):
        _sprite(g / "hero_run" / f"run_{i:03d}.png", 64, 100, (12 + i % 3, 8, 51, 91), color=(40, 60, 160, 255))
    config = {"run_n": run_n, "run_fig_px": 84, "run_pad_px": 8, "run_canvas_px": canvas * 4 // 5,
              "jump_base_px": 150, "island_top_px": 6, "pedestal_top_px": 10}
    (g / "config.json").write_text(json.dumps(config))
    return g
