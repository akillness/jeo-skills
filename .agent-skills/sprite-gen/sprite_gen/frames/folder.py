# SPDX-License-Identifier: Apache-2.0
"""A folder of a loop's frames, worked on whole and written whole into a new folder.

`sprite-gen breathe <frames> <out>` and `video-sway --frames <frames> --out <out>` read the frames — the folder's PNGs
in name order, all one size — and write the same frames under the same names, with their record beside them, into a
new folder. The new folder is never the frames folder, inside it or holding it, read by real paths (a link or another
spelling of one folder is that folder), and it is new or empty; all of that is looked at before anything is made.
Everything is written into a staging folder beside it and renamed into place once all of it is written: a run that
stops on the way leaves no half folder, and of two runs on one out the later stops at the full out. Nothing is written
in the frames folder.

A frame's time is what a loop's strip meta writes (`delay_ms`), in ms rounded to hundredths (`frame_ms`). A loop's
`cycle/` folder has it in the loop's strip meta; any other folder is given it (`--fps`)."""

from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from sprite_gen.spec.runio import inside_folder, new_stage, same_folder


def frame_ms(seconds: float, frames: float) -> float:
    """One frame's time, ms, of `frames` frames in `seconds`, as a loop's strip meta writes it (`delay_ms`)."""
    return round(1000 * seconds / frames, 2)


@dataclass(frozen=True, eq=False)
class Frames:
    """A frames folder as read: its PNGs in name order, their pictures (RGBA), and the new folder's real path."""

    paths: list[Path]
    images: list[Image.Image]
    out: Path

    @property
    def names(self) -> list[str]:
        return [path.name for path in self.paths]


def open_frames(frames: Path, out: Path, verb: str) -> Frames:
    """The frames of `frames`, read, and the real path of `out` to write them into — refused before anything is made
    where there are none, where the two folders overlap, where `out` is not a new or empty folder, or where the frames
    are not all one size."""
    paths = sorted(frames.glob("*.png"))
    if not paths:
        raise SystemExit(f"{verb}: {frames} 에 PNG 프레임이 없다")
    src_real, out_real = frames.resolve(), out.resolve()
    if same_folder(out_real, src_real):
        raise SystemExit(f"{verb}: out 이 frames 와 같은 폴더다 — 원본 프레임 위에 덮어쓰지 않는다")
    if inside_folder(out_real, src_real):
        raise SystemExit(f"{verb}: out 이 frames 안에 있다 ({out_real}) — 원본 폴더 안에는 쓰지 않는다")
    if inside_folder(src_real, out_real):
        raise SystemExit(f"{verb}: frames 가 out 안에 있다 ({src_real}) — 원본이 든 폴더에 내놓지 않는다")
    if out_real.exists() and not out_real.is_dir():
        raise SystemExit(f"{verb}: {out} 는 폴더가 아니다")
    if out_real.exists() and any(out_real.iterdir()):
        raise SystemExit(f"{verb}: {out} 가 비어 있지 않다 — 새 폴더를 주라")
    images = []
    for path in paths:
        with Image.open(path) as opened:
            images.append(opened.convert("RGBA"))
    if len({im.size for im in images}) != 1:
        raise SystemExit(f"{verb}: 프레임 크기가 서로 다르다 — {sorted({im.size for im in images})}")
    return Frames(paths, images, out_real)


def reference_frame(path: Path | str | None, frames: Frames, verb: str) -> tuple[Image.Image, dict[str, Any] | None]:
    """The frame the frames are read against (`--reference`) and its record (path and sha256 of its file): `path`, a loop
    set's first cell for a stretch of the loop that starts elsewhere, one size with the frames — or, without it, the first
    frame and no record."""
    if path is None:
        return frames.images[0], None
    path = Path(path).expanduser()
    try:
        data = path.read_bytes()
        with Image.open(path) as opened:
            image = opened.convert("RGBA")
    except OSError as exc:
        raise SystemExit(f"{verb}: --reference {path}: not read ({exc})") from exc
    if image.size != frames.images[0].size:
        raise SystemExit(f"{verb}: --reference {path} is {image.size[0]}x{image.size[1]} and the frames are "
                         f"{frames.images[0].size[0]}x{frames.images[0].size[1]}; it is a cell of the same loop set")
    return image, {"path": str(path), "sha256": hashlib.sha256(data).hexdigest()}


def publish(frames: Frames, images: list[Image.Image], record_name: str, record: dict[str, Any]) -> None:
    """`images` under the frames' names and `record` (JSON) as `record_name`, written whole into `frames.out`.

    Staged beside `out` and renamed into place: a run that stops on the way leaves no half folder. Runs on one out
    each write their own staging folder and the first rename wins (a later one stops at the full out). Only this
    run's staging folder is removed."""
    out = frames.out
    out.parent.mkdir(parents=True, exist_ok=True)
    stage = new_stage(out, ".partial")
    try:
        for name, image in zip(frames.names, images):
            image.save(stage / name)
        (stage / record_name).write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if out.exists():
            out.rmdir()  # seen empty before; anything that came in since stops this with an OSError
        stage.rename(out)
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def cycle_frame_ms(frames: Path, count: int, fps: float | None, verb: str) -> float | None:
    """The frame time of the `count` frames in `frames`, ms: `--fps` given, as `frame_ms` writes it; a loop's `cycle/`
    folder holding its whole cycle has it in the loop's strip meta (`cycle_seconds` over `cycle_frames`), and a
    `--fps` that says another is refused. None when neither says it."""
    asked = None
    if fps is not None:
        if not fps > 0:  # a NaN is not
            raise SystemExit(f"{verb}: --fps must be above 0, got {fps:g}")
        asked = frame_ms(1, fps)
    recorded = None
    metas = sorted(frames.resolve().parent.glob("*.strip.json")) if frames.resolve().name == "cycle" else []
    if len(metas) == 1:
        meta = json.loads(metas[0].read_text(encoding="utf-8"))
        if meta.get("cycle_frames") == count and meta.get("cycle_seconds"):
            recorded = frame_ms(float(meta["cycle_seconds"]), count)
    if asked is not None and recorded is not None and asked != recorded:
        raise SystemExit(f"{verb}: --fps {fps:g} is a frame of {asked:g} ms, and the loop's {metas[0].name} says its "
                         f"{count} cycle frames are {recorded:g} ms each; give its own or none")
    return recorded if asked is None else asked
