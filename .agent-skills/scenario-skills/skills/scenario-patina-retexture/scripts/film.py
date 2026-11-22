#!/usr/bin/env python3
"""Drive Blender and ffmpeg to produce a matched before/after comparison film.

    python3 scripts/film.py <config.json> pilot     # half-resolution shot endpoints, both passes
    python3 scripts/film.py <config.json> run       # full render, resume, assemble, verify
    python3 scripts/film.py <config.json> assemble  # redo the ffmpeg stage only
    python3 scripts/film.py <config.json> status    # progress as compact JSON

Add --blender PATH when Blender is not on PATH or in $BLENDER. Needs Pillow, ffmpeg and
ffprobe with libx264. No network calls; the Scenario side is the agent's job.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))

from common import (  # noqa: E402
    dump,
    expected,
    read_config,
    resolve_blender,
    run_directory,
    shot_frames,
)

MODES = ("original", "patina")
# One 5.5 second shot at 24 fps. EEVEE memory grows across frames in one process, so a
# pass is rendered as bounded worker batches rather than one long-lived Blender.
BATCH_FRAMES = 132
SWEEP_FPS = 2
SWEEP_COLUMNS = 8
BACKGROUND = (14, 20, 26)
FONTS = {
    "font": (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ),
    "bold_font": (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ),
}


def valid_png(path: Path) -> bool:
    try:
        with Image.open(path) as image:
            image.verify()
        return True
    except (OSError, SyntaxError):
        return False


def valid_still(path: Path) -> bool:
    # JPEG verify() is a no-op in Pillow; only a full load() sees a truncated file.
    try:
        with Image.open(path) as image:
            image.load()
        return True
    except (OSError, SyntaxError):
        return False


def archive(path: Path) -> None:
    """Move a stale or corrupt output aside instead of deleting it."""
    if path.exists():
        folder = path.parent / "archive"
        folder.mkdir(exist_ok=True)
        path.rename(folder / f"{path.stem}_{time.time_ns()}{path.suffix}")


def command(args: list[str], log: Path) -> None:
    with open(log, "w") as handle:
        result = subprocess.run(args, stdout=handle, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(f"{log}: " + log.read_text()[-1800:])


def load_font(config: dict, size: int, bold: bool = False):
    key = "bold_font" if bold else "font"
    configured = config.get(key)
    if configured:
        if not Path(configured).is_file():
            raise FileNotFoundError(f"{key} {configured} does not exist")
        return ImageFont.truetype(configured, size)
    for candidate in FONTS[key]:
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    try:
        return ImageFont.load_default(size)
    except TypeError:  # Pillow before 10.1 has no sized built-in font
        raise FileNotFoundError(
            f'No caption font found: set "{key}" in the film config to a .ttf file, or'
            " upgrade Pillow to 10.1 or newer for the built-in fallback"
        ) from None


def frame_path(run_dir: Path, kind: str, mode: str, frame: int) -> Path:
    return run_dir / ("pilot" if kind == "pilot" else "frames") / mode / f"{frame:04d}.png"


def status(config: dict, run_dir: Path) -> dict:
    frames = expected(config, "run")
    counts = {
        mode: sum(frame_path(run_dir, "run", mode, f).exists() for f in frames) for mode in MODES
    }
    verification = run_dir / "verification.json"
    stage = "prepared"
    if verification.exists():
        outputs = json.loads(verification.read_text())["outputs"]
        if all(Path(o["path"]).is_file() for o in outputs):
            stage = "encoded"
    if stage != "encoded" and any(counts.values()):
        stage = "rendering"
    report = {
        "stage": stage,
        "frames": counts,
        "required_per_pass": len(frames),
        "run": str(run_dir),
    }
    estimate = run_dir / "pilot_estimate.json"
    if estimate.exists():
        report["pilot"] = json.loads(estimate.read_text())
    (run_dir / "status.json").write_text(json.dumps(report, indent=2))
    return report


def worker_command(
    blender: str, source: str, mode: str, job: Path, run_dir: Path, kind: str, config_path: Path
) -> list[str]:
    worker = Path(__file__).with_name("worker.py")
    return [
        blender,
        "--factory-startup",
        "--background",
        source,
        "--python-exit-code",
        "1",
        "--python",
        str(worker),
        "--",
        mode,
        str(job),
        str(run_dir),
        kind,
        str(config_path),
    ]


def render_pass(config: dict, config_path: Path, run_dir: Path, kind: str, mode: str) -> None:
    blender = resolve_blender(config)
    env = dict(os.environ, PATINA_CONFIG=str(config_path))
    source = config["before" if mode == "original" else "after"]
    pending = []
    for frame in expected(config, kind):
        target = frame_path(run_dir, kind, mode, frame)
        if valid_png(target):
            continue
        archive(target)
        pending.append(frame)
    for start in range(0, len(pending), BATCH_FRAMES):
        batch = pending[start : start + BATCH_FRAMES]
        job = run_dir / f"{kind}_{mode}_{start}.json"
        job.write_text(json.dumps(batch))
        log = run_dir / f"{kind}_{mode}_{start}.log"
        with log.open("w") as handle:
            result = subprocess.run(
                worker_command(blender, source, mode, job, run_dir, kind, config_path),
                env=env,
                stdout=handle,
                stderr=subprocess.STDOUT,
            )
        if result.returncode:
            raise RuntimeError(f"{log}: " + log.read_text()[-1800:])
        missing = [f for f in batch if not valid_png(frame_path(run_dir, kind, mode, f))]
        if missing:
            raise RuntimeError(f"{mode} {kind}: worker exited cleanly, frames missing: {missing}")
        print(dump(status(config, run_dir)), flush=True)


def compare_contracts(run_dir: Path) -> None:
    contracts = [json.loads((run_dir / f"{mode}_contract.json").read_text()) for mode in MODES]
    for key in ("camera_sha256", "settings", "geometry_sha256"):
        if contracts[0][key] != contracts[1][key]:
            raise RuntimeError(f"Before/after mismatch: {key}")


def render(config: dict, config_path: Path, run_dir: Path, kind: str) -> None:
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=config["workers"]) as pool:
        list(pool.map(lambda mode: render_pass(config, config_path, run_dir, kind, mode), MODES))
    compare_contracts(run_dir)
    if kind == "pilot":
        elapsed = time.monotonic() - started
        per_frame = elapsed / max(1, len(expected(config, "pilot")))
        estimate = run_dir / "pilot_estimate.json"
        if not estimate.exists():
            estimate.write_text(
                json.dumps(
                    {
                        "pilot_elapsed_seconds": round(elapsed, 2),
                        "rough_render_estimate_seconds": round(
                            per_frame * len(expected(config, "run")) * 4
                        ),
                        "note": "Half-resolution endpoint pilot scaled by 4 for pixels, includes"
                        " process startup; refine from actual batch throughput.",
                    },
                    indent=2,
                )
            )
        contact(config, run_dir, kind)


def contact_path(run_dir: Path, kind: str) -> Path:
    if kind == "pilot":
        return run_dir / "Pilot Contact.jpg"
    return run_dir / "review" / "Final Contact.jpg"


def contact(config: dict, run_dir: Path, kind: str) -> Path:
    """Pilot: both endpoints of every shot, before over after. Final: one still per shot."""
    output = contact_path(run_dir, kind)
    if output.exists():
        return output
    output.parent.mkdir(parents=True, exist_ok=True)
    font = load_font(config, 22)
    count = shot_frames(config)
    shots = config["shots"]
    page = Image.new("RGB", (1600, 640 * ((len(shots) + 3) // 4)), BACKGROUND)
    draw = ImageDraw.Draw(page)
    for index, shot in enumerate(shots):
        x, y = index % 4 * 400, index // 4 * 640
        title = f"{index + 1:02d} {shot['name']}"[:28]
        draw.text((x + 12, y + 10), title, font=font, fill="white")
        if kind != "pilot":
            with Image.open(run_dir / "review" / f"{index + 1:02d}.jpg") as image:
                image.thumbnail((380, 560))
                page.paste(image, (x + 10, y + 45))
            continue
        for mode, dy in zip(MODES, (45, 345)):
            for j, frame in enumerate((index * count + 1, (index + 1) * count)):
                with Image.open(frame_path(run_dir, "pilot", mode, frame)) as image:
                    image.thumbnail((380, 140))
                    page.paste(image, (x + 10, y + dy + j * 148))
    page.save(output, quality=94)
    return output


def layout(width: int, height: int) -> dict:
    """Padded vertical stack: title header, before panel, gap with the after label, footer.

    Every margin is even (the header and side padding multiples of 8) so the stacked
    frame stays yuv420p-friendly at any panel size; 2368x1332 panels give 2560x3200.
    """
    pad = 8 * max(1, round(width * 0.04 / 8))
    header = 8 * max(1, round(width * 0.10 / 8))
    gap = 2 * max(1, round(width * 0.07 / 2))
    bottom = 2 * max(1, round(width * 0.055 / 2))
    return {
        "pad": pad,
        "header": header,
        "gap": gap,
        "bottom": bottom,
        "width": width + 2 * pad,
        "height": header + 2 * height + gap + bottom,
        "after_y": header + height + gap,
    }


def draw_plate(config: dict, path: Path) -> Path:
    """Caption overlay with transparent holes where the two panels show through."""
    if path.exists():
        return path
    w, h = config["width"], config["height"]
    geometry = layout(w, h)
    pad, header, after_y = geometry["pad"], geometry["header"], geometry["after_y"]
    image = Image.new("RGBA", (geometry["width"], geometry["height"]), BACKGROUND + (255,))
    draw = ImageDraw.Draw(image)
    bold = load_font(config, max(12, round(w * 0.018)), bold=True)
    font = load_font(config, max(9, round(w * 0.012)))
    radius = max(4, round(w * 0.006))
    for y in (header, after_y):
        draw.rounded_rectangle((pad, y, pad + w - 1, y + h - 1), radius=radius, fill=(0, 0, 0, 0))
    draw.text((pad, round(header * 0.15)), config["title"], font=bold, fill="white")
    before = "BEFORE  /  " + config["before_label"]
    draw.text((pad, round(header * 0.69)), before, font=font, fill="white")
    draw.text(
        (pad, after_y - round(geometry["gap"] * 0.52)),
        "AFTER  /  " + config["after_label"],
        font=font,
        fill="#8ed9c4",
    )
    draw.text(
        (pad, geometry["height"] - round(geometry["bottom"] * 0.62)),
        "IDENTICAL GEOMETRY / CAMERA / LIGHTING",
        font=font,
        fill="#8b9ba4",
    )
    image.save(path)
    return path


def ffmpeg(config: dict, args: list[str], run_dir: Path, label: str) -> None:
    command(
        [config["ffmpeg"], "-hide_banner", "-loglevel", "warning", "-n", *args],
        run_dir / f"encode_{label}.log",
    )


def probe(config: dict, path: Path) -> dict:
    raw = subprocess.check_output(
        [
            config["ffprobe"],
            "-v",
            "error",
            "-count_frames",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(path),
        ],
        stderr=subprocess.DEVNULL,
    )
    return json.loads(raw)


def video_stream(info: dict) -> dict:
    return next(s for s in info["streams"] if s["codec_type"] == "video")


def frame_count(config: dict, path: Path) -> int:
    return int(video_stream(probe(config, path))["nb_read_frames"])


def keep_if_complete(config: dict, path: Path, frames: int) -> bool:
    """True when an existing encode already has the right frame count; archive it otherwise."""
    if not path.exists():
        return False
    try:
        if frame_count(config, path) == frames:
            return True
    except (subprocess.CalledProcessError, StopIteration, KeyError, ValueError):
        pass
    archive(path)
    return False


def final_duration(config: dict) -> float:
    shots = len(config["shots"])
    return shots * config["shot_seconds"] - (shots - 1) * config["transition"]


def encode_clip(config: dict, run_dir: Path, mode: str, index: int) -> Path:
    fps, count = config["fps"], shot_frames(config)
    out = run_dir / "clips" / f"{mode}_{index:02d}.mp4"
    out.parent.mkdir(exist_ok=True)
    if keep_if_complete(config, out, count):
        return out
    stage = run_dir / "sequence" / mode / f"{index:02d}"
    stage.mkdir(parents=True, exist_ok=True)
    step = fps // config["source_fps"]
    for j, frame in enumerate(range(index * count + 1, (index + 1) * count + 1, step)):
        dest = stage / f"{j:04d}.png"
        if not dest.exists():
            source = frame_path(run_dir, "run", mode, frame)
            try:
                os.link(source, dest)
            except OSError:
                shutil.copyfile(source, dest)
    filters = ""
    if config["source_fps"] != fps:
        # Clone the last frame briefly so the interpolator has a tail to blend into.
        filters = (
            "tpad=stop_mode=clone:stop_duration=0.25,"
            f"framerate=fps={fps}:interp_start=0:interp_end=255:scene=100,"
        )
    filters += "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"
    ffmpeg(
        config,
        [
            "-framerate", str(config["source_fps"]),
            "-start_number", "0",
            "-i", str(stage / "%04d.png"),
            "-frames:v", str(count),
            "-vf", filters,
            "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-threads", "4",
            "-movflags", "+faststart",
            str(out),
        ],
        run_dir,
        f"{mode}_{index}",
    )
    return out


def join_clips(config: dict, run_dir: Path, mode: str) -> Path:
    shots = len(config["shots"])
    fps = config["fps"]
    final_frames = round(final_duration(config) * fps)
    joined = run_dir / f"{mode.title()} Matched Camera.mp4"
    if keep_if_complete(config, joined, final_frames):
        return joined
    inputs, filters = [], []
    for index in range(shots):
        inputs += ["-i", str(run_dir / "clips" / f"{mode}_{index:02d}.mp4")]
        # Since ffmpeg 7.0, setpts reports an unknown frame rate, which xfade rejects; fps
        # restores it. settb comes after fps: a 1/24 time base shifts the fade's blend weights.
        filters.append(
            f"[{index}:v]setpts=PTS-STARTPTS,fps={fps},settb=AVTB,format=yuv420p[v{index}]"
        )
    last = "v0"
    for index in range(1, shots):
        offset = index * (config["shot_seconds"] - config["transition"])
        filters.append(
            f"[{last}][v{index}]xfade=transition=fade:duration={config['transition']}"
            f":offset={offset}[x{index}]"
        )
        last = f"x{index}"
    filters.append(f"[{last}]format=yuv420p[out]")
    ffmpeg(
        config,
        [
            *inputs,
            "-filter_complex_threads", "2",
            "-filter_complex", ";".join(filters),
            "-map", "[out]",
            "-frames:v", str(final_frames),
            "-r", str(fps),
            "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-threads", "6",
            "-movflags", "+faststart",
            str(joined),
        ],
        run_dir,
        f"{mode}_joined",
    )
    frames = frame_count(config, joined)
    if frames != final_frames:
        raise RuntimeError(f"{joined}: {frames} frames after the join, expected {final_frames}")
    return joined


def stack(config: dict, run_dir: Path, joined: dict) -> Path:
    fps = config["fps"]
    final_frames = round(final_duration(config) * fps)
    geometry = layout(config["width"], config["height"])
    master = run_dir / "PATINA Comparison.mp4"
    if keep_if_complete(config, master, final_frames):
        return master
    plate = draw_plate(config, run_dir / "Layout.png")
    color = "0x{:02x}{:02x}{:02x}".format(*BACKGROUND)
    filters = (
        f"[0:v]pad={geometry['width']}:{geometry['height']}:{geometry['pad']}:{geometry['header']}"
        f":color={color}[a];[a][1:v]overlay={geometry['pad']}:{geometry['after_y']}:shortest=1[b];"
        "[b][2:v]overlay=0:0:shortest=1,format=yuv420p[out]"
    )
    ffmpeg(
        config,
        [
            "-i", str(joined["original"]),
            "-i", str(joined["patina"]),
            "-loop", "1", "-framerate", str(fps), "-i", str(plate),
            "-filter_complex_threads", "2",
            "-filter_complex", filters,
            "-map", "[out]",
            "-frames:v", str(final_frames),
            "-r", str(fps),
            "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-threads", "6",
            "-movflags", "+faststart",
            str(master),
        ],
        run_dir,
        "comparison",
    )
    return master


def share_copy(config: dict, run_dir: Path, master: Path) -> Path:
    final_frames = round(final_duration(config) * config["fps"])
    share = run_dir / "PATINA Comparison Share.mp4"
    if keep_if_complete(config, share, final_frames):
        return share
    width = min(1440, layout(config["width"], config["height"])["width"])
    ffmpeg(
        config,
        [
            "-i", str(master),
            "-vf", f"scale={width}:-2:flags=lanczos",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-threads", "4",
            "-movflags", "+faststart",
            str(share),
        ],
        run_dir,
        "share",
    )
    return share


def review_stills(config: dict, run_dir: Path, master: Path) -> list[Path]:
    """One still from the middle of each shot."""
    review = run_dir / "review"
    review.mkdir(exist_ok=True)
    stills = []
    for index in range(len(config["shots"])):
        still = review / f"{index + 1:02d}.jpg"
        if not valid_still(still):
            # ffmpeg -n writes nothing over an existing file, and a sheet built from the
            # old still would be stale.
            archive(still)
            archive(contact_path(run_dir, "final"))
            shot_seconds = config["shot_seconds"]
            seek = index * (shot_seconds - config["transition"]) + shot_seconds / 2
            ffmpeg(
                config,
                ["-ss", str(seek), "-i", str(master), "-frames:v", "1", "-q:v", "2", str(still)],
                run_dir,
                f"review_{index}",
            )
        stills.append(still)
    return stills


def tile(paths: list[Path], columns: int, labels: list[str], font, max_width: int = 320):
    """Grid of thumbnails with a caption strip above each one."""
    columns = max(1, min(columns, len(paths)))
    rows = math.ceil(len(paths) / columns)
    with Image.open(paths[0]) as first:
        scale = min(1.0, max_width / first.width)
        cell_w, cell_h = round(first.width * scale), round(first.height * scale)
    label_h = 24
    sheet = Image.new("RGB", (columns * cell_w, rows * (cell_h + label_h)), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    for index, (path, label) in enumerate(zip(paths, labels)):
        x = index % columns * cell_w
        y = index // columns * (cell_h + label_h)
        draw.text((x + 4, y + 4), label, font=font, fill="white")
        with Image.open(path) as image:
            image.thumbnail((cell_w, cell_h))
            sheet.paste(image, (x, y + label_h))
    return sheet


def sweep_contact(config: dict, run_dir: Path, master: Path) -> tuple[Path, int]:
    """Sample the whole master at SWEEP_FPS: a defect that fades in mid-shot shows up here
    when the one-still-per-shot review misses it."""
    output = run_dir / "review" / "Sweep Contact.jpg"
    folder = run_dir / "review" / "sweep"
    frames = sorted(folder.glob("*.jpg")) if folder.is_dir() else []
    if not output.exists() or not frames or not all(valid_still(f) for f in frames):
        # ffmpeg writes the frames one file at a time, so a killed extraction leaves a valid
        # partial set: only the sheet proves the folder complete.
        shutil.rmtree(folder, ignore_errors=True)
        archive(output)
        folder.mkdir(parents=True)
        ffmpeg(
            config,
            ["-i", str(master), "-vf", f"fps={SWEEP_FPS}", "-q:v", "2", str(folder / "%04d.jpg")],
            run_dir,
            "sweep",
        )
        frames = sorted(folder.glob("*.jpg"))
        labels = [f"{index / SWEEP_FPS:.1f}s" for index in range(len(frames))]
        tile(frames, SWEEP_COLUMNS, labels, load_font(config, 14)).save(output, quality=90)
    return output, len(frames)


def check_frames(config: dict, run_dir: Path) -> None:
    size = (config["width"], config["height"])
    for mode in MODES:
        for frame in expected(config, "run"):
            path = frame_path(run_dir, "run", mode, frame)
            if not valid_png(path):
                raise RuntimeError(f"{path}: missing or corrupt source frame")
            with Image.open(path) as image:
                if image.size != size:
                    raise RuntimeError(f"{path}: size {image.size}, expected {size}")


def assemble(config: dict, run_dir: Path) -> dict:
    fps = config["fps"]
    duration = final_duration(config)
    final_frames = round(duration * fps)
    check_frames(config, run_dir)
    joined = {}
    for mode in MODES:
        for index in range(len(config["shots"])):
            encode_clip(config, run_dir, mode, index)
        joined[mode] = join_clips(config, run_dir, mode)
    master = stack(config, run_dir, joined)
    share = share_copy(config, run_dir, master)
    outputs = []
    for path in (master, share, joined["original"], joined["patina"]):
        info = probe(config, path)
        stream = video_stream(info)
        frames = int(stream["nb_read_frames"])
        if frames != final_frames:
            raise RuntimeError(f"{path}: {frames} frames, expected {final_frames}")
        if abs(float(info["format"]["duration"]) - duration) >= 1 / fps:
            actual = info["format"]["duration"]
            raise RuntimeError(f"{path}: duration {actual}, expected {duration}")
        outputs.append(
            {
                "path": str(path),
                "width": stream["width"],
                "height": stream["height"],
                "frames": frames,
                "duration": float(info["format"]["duration"]),
            }
        )
    stills = review_stills(config, run_dir, master)
    final_contact = contact(config, run_dir, "final")
    sweep, sweep_frames = sweep_contact(config, run_dir, master)
    verification = {
        "status": "technical_checks_passed_visual_review_required",
        "source_fps": config["source_fps"],
        "output_fps": fps,
        "duration_seconds": duration,
        "final_frames": final_frames,
        "camera_lighting_geometry_match": True,
        "outputs": outputs,
        "review_stills": [str(p) for p in stills],
        "final_contact": str(final_contact),
        "sweep_contact": str(sweep),
        "sweep_fps": SWEEP_FPS,
        "sweep_frames": sweep_frames,
    }
    (run_dir / "verification.json").write_text(json.dumps(verification, indent=2))
    return verification


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("config", help="film config JSON")
    parser.add_argument("mode", choices=("pilot", "run", "assemble", "status"))
    parser.add_argument("--blender", help="Blender executable; overrides the config and $BLENDER")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> dict:
    args = parse_args(argv)
    config, config_path = read_config(args.config)
    if args.blender:
        config["blender"] = args.blender
    run_dir = run_directory(config)
    run_dir.mkdir(parents=True, exist_ok=True)
    if args.mode in ("pilot", "run"):
        render(config, config_path, run_dir, args.mode)
    if args.mode in ("run", "assemble"):
        assemble(config, run_dir)
    result = status(config, run_dir)
    print(dump(result), flush=True)
    return result


if __name__ == "__main__":
    main()
