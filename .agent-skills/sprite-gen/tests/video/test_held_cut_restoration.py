# SPDX-License-Identifier: Apache-2.0
"""A walk cut by hand (`--cycle fixed`) and held at its size and on its row (`size_hold`, docs/video-pipeline.md
section 4) is restored from its source frames: the report records the move each frame of the cut was held by
(`size_hold.cut_frames`), and `video-loop-repair` holds each source frame of the cut by it again before it reads it,
as the cut read it (sprite_gen/video/source.py). A held cut whose report does not record the moves stays unknown.

The fixtures are synthetic: the walk away from the camera of tests/video/test_gait_fallback.py (15 % smaller by the
end, its feet 20 px higher), cut by hand on its second cycle with the walk's default anchor, and one cell of the loop
smeared dark where the jump repair would have made it (`jump_repair.replaced`), as tests/video/test_source_restoration.py
damages its cells."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from sprite_gen.cli import main
from sprite_gen.util.gif_utils import save_clean_gif
from sprite_gen.video import gait_fallback, source
from sprite_gen.video import loop as loop_mod
from sprite_gen.video.compare import Loop
from tests.video.test_gait_fallback import walking_away

START, L = 24, 24
TARGET = 9  # the cell smeared: inside the loop, away from its first and last cells
ARTIFACTS = {"strip": "walk.strip.png", "meta": "walk.strip.json", "report": "walk.loop.report.json",
             "gif": "walk.gif", "webp": "walk.webp"}


def _cells(paths: dict[str, Path]) -> list[Image.Image]:
    meta = json.loads(paths["meta"].read_text())
    strip = Image.open(paths["strip"]).convert("RGBA")
    return [strip.crop((k * meta["w"], 0, (k + 1) * meta["w"], meta["h"])) for k in range(meta["frames"])]


def _write(paths: dict[str, Path], cells: list[Image.Image]) -> None:
    """The strip, GIF and WebP of `cells`, as `video-loop` writes them."""
    meta = json.loads(paths["meta"].read_text())
    strip = Image.new("RGBA", (meta["w"] * len(cells), meta["h"]))
    for k, cell in enumerate(cells):
        strip.paste(cell, (k * meta["w"], 0))
    strip.save(paths["strip"])
    delay = json.loads(paths["report"].read_text())["delay_ms"]
    save_clean_gif(cells, paths["gif"], duration_ms=delay, loop=0, alpha_threshold=128)
    loop_mod.write_webp(cells, paths["webp"], delay_ms=delay)


def _smear(cell: Image.Image) -> Image.Image:
    """A dark block in the middle of the torso (the walker's blue), the smear a bad made frame leaves."""
    rgba = np.asarray(cell).astype(int)
    ys, xs = np.nonzero((np.abs(rgba[..., :3] - (20, 90, 180)).max(axis=-1) <= 12) & (rgba[..., 3] == 255))
    cy, cx = int(np.median(ys)), int(np.median(xs))
    out = cell.copy()
    out.paste((10, 10, 10, 255), (cx - 2, cy - 2, cx + 3, cy + 3))
    return out


def _body(cell: Image.Image) -> tuple[float, float]:
    """The body's height and the row its feet stand on (its solid box)."""
    x0, y0, x1, y1 = gait_fallback.subject_boxes([cell])[0]
    return float(y1 - y0), float(y1)


@pytest.fixture(scope="module")
def held(tmp_path_factory: pytest.TempPathFactory) -> dict:
    """The walk away cut by hand on its second cycle, held, its loop as cut and its source: the keyed frames, a clip
    of them and their manifest."""
    if not shutil.which("ffmpeg") or not loop_mod.img2webp_supports_exact():
        pytest.skip("ffmpeg and img2webp >=1.5 required")
    root = tmp_path_factory.mktemp("held")
    keyed = root / "keyed"
    keyed.mkdir()
    for k in range(73):
        walking_away(k).save(keyed / f"{k:04d}.png")
    out = root / "cut"
    loop_mod.run_loop(keyed, out, fps=24.0, state="walk", min_len=None, max_len=None, n_out=None,
                      seam_max=loop_mod.SEAM_RATIO_MAX, name="walk", report_path=None, cycle_mode="fixed", start=START,
                      length=L, anchor="body", repair="off")
    files = sorted(keyed.glob("*.png"))
    w, h = Image.open(files[0]).size
    frames_report = root / "frames.json"
    frames_report.write_text(json.dumps({"kind": "sprite-gen-video-frames-report", "fps": 24.0, "frames": len(files),
                                         "width": w, "height": h, "stream_index": 0, "key": "green"}))
    clip = root / "clip.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-framerate", "24", "-i", str(keyed / "%04d.png"), "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", str(clip)], check=True)
    manifest = root / "source.json"
    manifest.write_text(json.dumps(source.manifest(clip=clip, canvas=files[0], frames_report=frames_report, files=files,
                                                   timestamps=source.timestamps(clip, 0))))
    inputs = {"source_manifest": manifest, "source_frames_dir": keyed, "source_clip": clip, "source_canvas": files[0],
              "source_frames_report": frames_report}
    return {"cut": out, "inputs": inputs, "keyed": [Image.open(f).convert("RGBA") for f in files]}


def _loop(held: dict, root: Path, edit=None) -> dict[str, Path]:
    """A copy of the held loop in `root`, its cell TARGET smeared as a cell the jump repair made (`jump_repair`), and
    `edit` applied to its report."""
    root.mkdir()
    paths = {k: root / name for k, name in ARTIFACTS.items()}
    for k, name in ARTIFACTS.items():
        shutil.copy(held["cut"] / name, paths[k])
    report = json.loads(paths["report"].read_text())
    report["jump_repair"] = {"replaced": [TARGET], "facing": "right"}
    if edit is not None:
        edit(report)
    paths["report"].write_text(json.dumps(report, indent=2) + "\n")
    cells = _cells(paths)
    cells[TARGET] = _smear(cells[TARGET])
    _write(paths, cells)
    return paths


def _repair(held: dict, paths: dict[str, Path], root: Path) -> dict:
    """`video-loop-repair` on the loop as both baseline and origin (a first request)."""
    args = [a for side in ("baseline", "origin") for k, p in paths.items() for a in (f"--{side}-{k}", str(p))]
    args += [a for k, p in held["inputs"].items() for a in ("--" + k.replace("_", "-"), str(p))]
    report = root / "repair.json"
    assert main(["video-loop-repair", *args, "--out-dir", str(root / "candidate"), "--report", str(report)]) == 0
    return json.loads(report.read_text())


@pytest.mark.slow
def test_a_held_cut_is_restored_from_its_source_frames_held_again(held, tmp_path):
    """The cut is held (the walk away shrinks and climbs as filmed), and its report records the move of each of its
    frames. Its source projection holds each source frame by its move and reproduces every cell of the loop as cut
    exactly; `video-loop-repair` restores the smeared cell to the held cut's own cell, the body's height and the row
    its feet stand on included, where the source frame as filmed stands smaller and higher. Before: the held cut was
    refused as `source-processing-unsupported`, and nothing was restored."""
    report = json.loads((held["cut"] / ARTIFACTS["report"]).read_text())
    hold = report["size_hold"]
    assert hold["applied"] is True and hold["feet"]["held"] is True
    as_cut = _cells({k: held["cut"] / name for k, name in ARTIFACTS.items()})
    paths = _loop(held, tmp_path / "loop")
    result = _repair(held, paths, tmp_path)
    assert (result["status"], result["reasons"], result.get("target")) == ("candidate", [], TARGET)
    assert len(hold["cut_frames"]) == L
    assert result["projection"]["size_hold"] == {"padding_ltrb": hold["padding_ltrb"], "cut_frames": hold["cut_frames"]}
    assert result["comparison"]["verdict"] == "improved", result["comparison"]["reasons"]
    restored = _cells({k: Path(p) for k, p in result["outputs"].items()})
    # Every cell of the candidate is the held cut's own: the one restored and the others, kept.
    assert [c.tobytes() for c in restored] == [c.tobytes() for c in as_cut]
    # As filmed, the cell's source frame stands smaller and higher than the clip's first frame; held, the loop stands
    # at that frame's size on its row, and the restored cell with it: as tall as the loop's first cell, on its row.
    (h0, f0), (hk, fk) = _body(held["keyed"][0]), _body(held["keyed"][START + TARGET])
    assert hk / h0 < 0.95 and f0 - fk >= 8, (h0, f0, hk, fk)
    (hc, fc), (hr, fr) = _body(as_cut[0]), _body(restored[TARGET])
    assert abs(hr - hc) <= 1 and abs(fr - fc) <= 1, (hc, fc, hr, fr)


@pytest.mark.slow
def test_the_projection_reads_the_held_cut_cell_for_cell(held):
    """Every cell of the held cut as delivered is its source frame held by the recorded move, cleaned, ramped, cut to
    the strip's crop and resampled: the projection proves the unmodified cells and also gives the others exactly."""
    paths = {k: held["cut"] / name for k, name in ARTIFACTS.items()}
    projection, issue = source.project(Loop.read(paths["strip"], paths["meta"], paths["report"]),
                                       source.Source.read(**held["inputs"]))
    assert issue is None
    assert [f.tobytes() for f in projection.frames] == [c.tobytes() for c in _cells(paths)]
    assert projection.record["samples"] == list(range(START, START + L))


@pytest.mark.slow
def test_a_held_cut_whose_report_does_not_record_its_moves_stays_unknown(held, tmp_path):
    """A report written before the moves were recorded (3.1.0): the held cut is not read from its source frames,
    as before."""
    paths = _loop(held, tmp_path / "loop", edit=lambda r: r["size_hold"].pop("cut_frames", None))
    result = _repair(held, paths, tmp_path)
    assert (result["status"], result["reasons"], result["common_failure"]) == ("unknown", ["source-processing-unsupported"], True)
    assert result["outputs"] == {}


@pytest.mark.slow
@pytest.mark.parametrize("edit", [
    lambda r: r["size_hold"]["cut_frames"].pop(),
    lambda r: r["size_hold"]["cut_frames"][3].update(scale=0),
    lambda r: r["size_hold"]["cut_frames"][3].update(foot_point_px=[1.0]),
    lambda r: r["size_hold"].update(padding_ltrb=[0, -1, 0, 0]),
], ids=["one-move-short", "scale-0", "one-foot-coordinate", "negative-room"])
def test_malformed_moves_are_an_error(held, tmp_path, edit):
    """Moves recorded that are not one per frame of the cut, each a scale over 0 about a foot point, are malformed
    input, an error with no candidate."""
    paths = _loop(held, tmp_path / "loop", edit=edit)
    with pytest.raises(SystemExit, match="invalid size_hold.cut_frames"):
        _repair(held, paths, tmp_path)
    assert not (tmp_path / "candidate").exists()


@pytest.mark.slow
def test_the_move_of_the_cell_the_repair_replaced_is_proven_too(held, tmp_path):
    """The cell the jump repair replaced is not among the cells the projection proves its crop on, so its move is
    proven on the cut's frames before repair (`source_projection`): that move a hair larger, the source frame is
    not read as the cut read it, and the projection is refused before any source pixel is used."""
    def larger(report: dict) -> None:
        report["size_hold"]["cut_frames"][TARGET]["scale"] *= 1.01

    result = _repair(held, _loop(held, tmp_path / "loop", edit=larger), tmp_path)
    assert (result["status"], result["reasons"], result["common_failure"]) == (
        "unknown", ["source-processing-receipt-mismatch"], True)


def test_the_recorded_move_holds_a_frame_as_the_hold_does():
    """`frame_hold` is the move `undo_scale` makes on a frame, in floats JSON carries exactly: through a report and back,
    `hold_frame` gives the held frame byte for byte, its feet held on the first frame's row or left where filmed."""
    frames = [walking_away(k) for k in range(73)]
    measured = gait_fallback.cycle_drift(frames, min_lag=10, max_lag=36)
    lift = gait_fallback.foot_drift(frames, measured)["lift"]
    assert lift is not None
    for feet in (lift, None):
        pad = gait_fallback.undo_padding(frames, measured, feet)
        held = gait_fallback.undo_scale(frames, measured, pad=pad, lift=feet)
        for k in (0, 30, 72):
            move = json.loads(json.dumps(gait_fallback.frame_hold(k, measured, feet)))
            assert move == gait_fallback.frame_hold(k, measured, feet)
            assert gait_fallback.hold_frame(frames[k], move, pad).tobytes() == held[k].tobytes()
