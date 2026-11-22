"""Synthetic pets, strips and runs for the pet script tests."""

import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-chatgpt-pet-create" / "scripts"
sys.path.insert(0, str(SCRIPTS))

MAGENTA = (255, 0, 255)


def sprite(height=160, color=(40, 110, 200), arm=False, tag=None):
    """A simple pet: head, body, two feet, an eye, an optional raised arm on the right.

    `tag` paints a small patch on the body so tests can tell frames apart.
    """
    width = int(height * 0.7)
    yy, xx = np.mgrid[0:height, 0:width]
    cx = width / 2
    head = (xx - cx) ** 2 + (yy - height * 0.25) ** 2 <= (height * 0.22) ** 2
    body = ((xx - cx) / (width * 0.42)) ** 2 + ((yy - height * 0.62) / (height * 0.3)) ** 2 <= 1
    feet = (yy >= height * 0.88) & (
        ((xx > cx - width * 0.32) & (xx < cx - width * 0.06))
        | ((xx > cx + width * 0.06) & (xx < cx + width * 0.32))
    )
    mask = head | body | feet
    if arm:
        mask |= (xx > cx + width * 0.3) & (xx < cx + width * 0.45) & (yy > height * 0.1) & (yy < height * 0.6)
    out = np.zeros((height, width, 4), np.uint8)
    out[mask, :3] = color
    out[mask, 3] = 255
    eye = (xx - cx - width * 0.08) ** 2 + (yy - height * 0.22) ** 2 <= (height * 0.035) ** 2
    out[eye & mask, :3] = (20, 20, 20)
    if tag is not None:
        patch = (abs(xx - cx) < width * 0.1) & (abs(yy - height * 0.6) < height * 0.06)
        out[patch & mask, :3] = tag
    return out


def strip(sprites, lifts=None, key=MAGENTA, gap=50, margin=30):
    """Sprites in one row on a flat key background, feet on one ground line minus each lift."""
    lifts = lifts or [0] * len(sprites)
    height = max(s.shape[0] + lift for s, lift in zip(sprites, lifts)) + 2 * margin
    width = sum(s.shape[1] for s in sprites) + gap * (len(sprites) - 1) + 2 * margin
    canvas = np.empty((height, width, 4), np.uint8)
    canvas[..., :3] = key
    canvas[..., 3] = 255
    x, ground = margin, height - margin
    for s, lift in zip(sprites, lifts):
        h, w = s.shape[:2]
        top = ground - lift - h
        region = canvas[top : top + h, x : x + w]
        solid = s[..., 3] > 0
        region[solid] = s[solid]
        x += w + gap
    return canvas


def tmpdir(case):
    """A temporary folder removed after the test (or after the class, given a class)."""
    path = Path(tempfile.mkdtemp())
    cleanup = case.addClassCleanup if isinstance(case, type) else case.addCleanup
    cleanup(shutil.rmtree, path, True)
    return path


def save(arr, path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.ascontiguousarray(arr)).save(path)


def semantics(verdicts=None):
    """Direction verdicts in the contract's format, every label passing unless overridden."""
    import pet_common as pc

    verdicts = verdicts or {}
    return {
        "directions": [
            {
                "label": label,
                "expected": pc.EXPECTED[label],
                "observed": f"looks {pc.EXPECTED[label]}",
                "verdict": verdicts.get(label, "pass"),
                "evidence": "pupils and nose toward that edge",
            }
            for label in pc.LOOK_LABELS
        ]
    }


def tag_color(i):
    return (200, 40 + 20 * i, 30)


def row_strip(job, frames, height):
    """A plausible strip for a job: jumping lifts, waving raises the arm, every frame tagged."""
    lifts = [0] * frames
    if job == "jumping":
        lifts = [0, 30, 60, 30, 0]
    sprites = [sprite(height, arm=(job == "waving" and 0 < i < frames - 1), tag=tag_color(i)) for i in range(frames)]
    if job == "running-right":
        sprites = [sprite(height, arm=True, tag=tag_color(i)) for i in range(frames)]
    return strip(sprites, lifts)


def make_run(tmp, version=1, heights=None, extra=()):
    """A prepared run whose generated strips are extracted: ready for pet_build."""
    import pet_frames
    import pet_prepare

    run = Path(tmp) / "run"
    pet_prepare.main(["init", "--name", "Blob", "--notes", "a round blue blob", "--version", str(version), "--out", str(run), *extra])
    heights = heights or {}
    import pet_common as pc

    for job, frames, _ in pc.rows_for(version):
        if job.startswith("look-"):
            continue
        save(row_strip(job, frames, heights.get(job, 160)), run / "generated" / f"{job}.png")
        pet_frames.main(["extract", str(run), "--job", job])
    if version == 2:
        for job in ("look-9", "look-10"):
            sprites = [sprite(heights.get(job, 160), tag=tag_color(i)) for i in range(8)]
            save(strip(sprites), run / "generated" / f"{job}.png")
            pet_frames.main(["extract", str(run), "--job", job])
    return run
