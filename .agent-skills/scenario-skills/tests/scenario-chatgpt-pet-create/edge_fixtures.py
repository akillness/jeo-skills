"""Cheap fixtures for the edge-case pet tests: hand-made sheets and runs without a full pipeline."""

import contextlib
import io
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402

import pet_common as pc  # noqa: E402
import pet_frames  # noqa: E402
import pet_prepare  # noqa: E402


def quiet(fn, argv):
    """Run a script's main with stdout captured: (return code, stdout text)."""
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = fn(argv)
    return code, out.getvalue()


def synthetic_sheet(version=1, height=150, color=(40, 110, 200)):
    """A structurally valid sheet: the same pet standing in every used cell."""
    width, sheet_height = pc.SHEET_SIZES[version]
    sheet = np.zeros((sheet_height, width, 4), np.uint8)
    pet = synth.sprite(height, color=color)
    for row, (_, frames, _) in enumerate(pc.rows_for(version)):
        for col in range(frames):
            pc.cell(sheet, row, col)[40 : 40 + height, 40 : 40 + pet.shape[1]] = pet
    return sheet


def init_run(tmp, version=1, *extra):
    run = Path(tmp) / "run"
    quiet(pet_prepare.main, ["init", "--name", "Pip", "--version", str(version), "--out", str(run), *extra])
    return run


def extract(run, job, height=160):
    synth.save(synth.row_strip(job, pc.frame_count(job), height), run / "generated" / f"{job}.png")
    return quiet(pet_frames.main, ["extract", str(run), "--job", job])[0]


def script(name, *argv):
    """Run a shipped pet script as a separate process, the way an agent calls it."""
    return subprocess.run(
        [sys.executable, str(synth.SCRIPTS / name), *map(str, argv)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
