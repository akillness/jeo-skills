#!/usr/bin/env python3
"""Cut a music video against its master audio, then verify the result.

Reads a small edit file, conforms every clip onto one timeline, concatenates,
muxes the untouched master, and checks the delivery. One ffmpeg pass.

    python3 scripts/build.py edit.json out.mp4

The master is never re-encoded when its codec can live in MP4 as is, so the
delivered soundtrack is bit for bit the file you supplied.

Set "sound" in the edit file to a linear gain (0.1 to 0.3 is a bed) and the
clips' own audio is mixed under the master at that level instead of dropped.
The master still goes in at unity, but the delivery is then one AAC encode
rather than a copy, so the bit-for-bit guarantee is traded for the sound.
"""
# MIT. Ported from https://github.com/edemaistre/scenario-seedance-2-5-music-video,
# Copyright (c) 2026 Emmanuel de Maistre.

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

# Codecs that MP4 accepts without a re-encode.
COPYABLE = {"aac": "adts", "mp3": "mp3"}


class BuildError(RuntimeError):
    """Anything that should stop the build with a readable message."""


def run(args: list[str]) -> bytes:
    proc = subprocess.run(args, capture_output=True)
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip()[-1200:]
        raise BuildError(f"{args[0]} failed\n{tail}")
    return proc.stdout


def probe(path: Path) -> dict:
    raw = run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)])
    return json.loads(raw)


def streams(info: dict, kind: str) -> list[dict]:
    return [s for s in info.get("streams", []) if s.get("codec_type") == kind]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def audio_fingerprint(path: Path, codec: str) -> str | None:
    """SHA-256 of the audio frames alone, so we can prove the master was copied, not re-encoded.

    Metadata is stripped on the way out. Without that, the mp3 muxer writes an ID3v2 header
    carrying whatever container tags it found, so the same frames hash differently depending
    on whether they came from a bare .mp3 or from inside an .mp4.
    """
    container = COPYABLE.get(codec)
    if container is None:
        return None
    data = run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-c", "copy",
         "-map_metadata", "-1", "-id3v2_version", "0", "-write_xing", "0", "-f", container, "-"]
    )
    return hashlib.sha256(data).hexdigest()


def video_frames(info: dict) -> int:
    video = streams(info, "video")
    if not video:
        raise BuildError("no video stream")
    counted = video[0].get("nb_frames")
    if counted and str(counted).isdigit() and int(counted) > 0:
        return int(counted)
    duration = float(info["format"]["duration"])
    num, den = (int(x) for x in video[0]["r_frame_rate"].split("/"))
    return int(round(duration * num / den))


def frames_at_fps(info: dict, fps: int) -> int:
    """Frame budget of a clip once the graph resamples it to the edit's fps.

    The filter graph applies fps=<target> before the frame trim, so a clip's
    native frame count is its budget only when the rates already agree;
    otherwise the count converts through the native rate (floor, so a clip
    is never credited a frame the resampler will not deliver).
    """
    native = video_frames(info)
    num, den = (int(x) for x in streams(info, "video")[0]["r_frame_rate"].split("/"))
    if num <= 0 or den <= 0 or num == fps * den:
        return native
    return native * den * fps // num


def load_edit(path: Path) -> dict:
    edit = json.loads(path.read_text())
    for key in ("master", "shots"):
        if key not in edit:
            raise BuildError(f"edit file is missing '{key}'")
    if not isinstance(edit["shots"], list) or not edit["shots"]:
        raise BuildError("edit file needs at least one shot")
    return edit


def audio_layout(stream: dict) -> str:
    layout = stream.get("channel_layout")
    if layout:
        return layout
    named = {1: "mono", 2: "stereo"}.get(int(stream.get("channels", 0)))
    if named is None:
        raise BuildError("the master's channel layout is unknown, so clip sound cannot be conformed to it")
    return named


def read_sound(edit: dict) -> float:
    """Gain applied to the clips' own audio. 0, absent or null keeps the master alone."""
    sound = edit.get("sound", 0) or 0
    if isinstance(sound, bool) or not isinstance(sound, (int, float)):
        raise BuildError('"sound" is a linear gain on the clips\' own audio, a number such as 0.2')
    if not 0 <= sound <= 4:
        raise BuildError('"sound" must be between 0 and 4; 0.1 to 0.3 puts a bed under a mastered track')
    return float(sound)


def plan(edit: dict, root: Path) -> dict:
    """Turn 'at' times into exact frame spans and check every clip is long enough."""
    fps = int(edit.get("fps", 24))
    width = int(edit.get("width", 1280))
    height = int(edit.get("height", 720))
    if fps <= 0 or width <= 0 or height <= 0:
        raise BuildError("fps, width and height must be positive")
    sound = read_sound(edit)

    master = (root / edit["master"]).resolve()
    if not master.is_file():
        raise BuildError(f"master not found: {master}")
    master_info = probe(master)
    if not streams(master_info, "audio"):
        raise BuildError("master has no audio stream")
    master_duration = float(master_info["format"]["duration"])

    shots = edit["shots"]
    starts = [float(shot.get("at", 0.0)) for shot in shots]
    if starts[0] != 0.0:
        raise BuildError("the first shot must start at 0")
    for earlier, later in zip(starts, starts[1:]):
        if later <= earlier:
            raise BuildError("shot 'at' times must increase, and no two shots may share one")
    if starts[-1] >= master_duration:
        raise BuildError("the last shot starts at or after the end of the master")

    # Visuals must cover the whole master, so round the final boundary up.
    total_frames = math.ceil(master_duration * fps - 1e-9)
    bounds = [int(round(start * fps)) for start in starts] + [total_frames]

    planned = []
    for index, shot in enumerate(shots):
        span = bounds[index + 1] - bounds[index]
        if span <= 0:
            raise BuildError(f"shot {index} ('{shot.get('clip')}') has no frames")
        clip = (root / shot["clip"]).resolve()
        if not clip.is_file():
            raise BuildError(f"clip not found: {clip}")
        head = int(round(float(shot.get("in", 0.0)) * fps))
        if head < 0:
            raise BuildError(f"shot {index} has a negative 'in'")
        clip_info = probe(clip)
        available = frames_at_fps(clip_info, fps) - head
        if available < span:
            raise BuildError(
                f"{clip.name} gives {available} frames after the head trim but the edit needs {span}. "
                f"Generate it longer, or move the following shot later."
            )
        planned.append({
            "clip": clip,
            "head": head,
            "span": span,
            "start_frame": bounds[index],
            "has_audio": bool(streams(clip_info, "audio")),
        })

    if sound and not any(shot["has_audio"] for shot in planned):
        raise BuildError(
            'no clip carries audio, so "sound" has nothing to mix. Generate the shots with '
            'generateAudio: true, or drop "sound" and deliver the master alone.'
        )

    return {
        "fps": fps,
        "width": width,
        "height": height,
        "sound": sound,
        "master": master,
        "master_info": master_info,
        "master_duration": master_duration,
        "total_frames": total_frames,
        "shots": planned,
    }


def filter_graph(job: dict) -> str:
    fps, width, height = job["fps"], job["width"], job["height"]
    parts, labels = [], []
    for index, shot in enumerate(job["shots"]):
        label = f"v{index}"
        labels.append(f"[{label}]")
        parts.append(
            f"[{index}:v]fps={fps},"
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:-1:-1:color=black,setsar=1,"
            f"trim=start_frame={shot['head']}:end_frame={shot['head'] + shot['span']},"
            f"setpts=PTS-STARTPTS,format=yuv420p[{label}]"
        )
    parts.append(f"{''.join(labels)}concat=n={len(labels)}:v=1:a=0[vcat]")
    parts.append(f"[vcat]trim=end_frame={job['total_frames']},setpts=PTS-STARTPTS[vout]")
    return ";".join(parts)


def inputs(job: dict) -> tuple[list[str], dict[int, int]]:
    """Every clip, then the master, then one silence source per clip that has no audio.

    Returns the -i arguments and, for those silent clips, the input index standing in
    for them, so the sound graph can reach them by number.
    """
    args: list[str] = []
    for shot in job["shots"]:
        args += ["-i", str(shot["clip"])]
    args += ["-i", str(job["master"])]

    silence: dict[int, int] = {}
    if job["sound"]:
        master_audio = streams(job["master_info"], "audio")[0]
        source = f"anullsrc=channel_layout={audio_layout(master_audio)}:sample_rate={master_audio['sample_rate']}"
        for index, shot in enumerate(job["shots"]):
            if shot["has_audio"]:
                continue
            silence[index] = len(job["shots"]) + 1 + len(silence)
            args += ["-f", "lavfi", "-t", f"{shot['span'] / job['fps']:.9f}", "-i", source]
    return args, silence


def sound_graph(job: dict, silence: dict[int, int], mix: bool = True) -> str:
    """The clips' own audio, cut to the same spans as the picture and mixed under the master.

    The master enters amix first at unity with normalize=0, so nothing rescales it:
    the gain rides on the bed alone. With mix off the graph stops at the gained bed,
    which is what a failed headroom check measures to size the gain that would fit.
    """
    master_audio = streams(job["master_info"], "audio")[0]
    conform = (
        f"aformat=sample_fmts=fltp:sample_rates={master_audio['sample_rate']}"
        f":channel_layouts={audio_layout(master_audio)}"
    )
    parts, labels = [], []
    for index, shot in enumerate(job["shots"]):
        seconds = shot["span"] / job["fps"]
        if shot["has_audio"]:
            head = shot["head"] / job["fps"]
            source = f"[{index}:a]atrim=start={head:.9f}:end={head + seconds:.9f},asetpts=PTS-STARTPTS,"
        else:
            source = f"[{silence[index]}:a]"
        labels.append(f"[a{index}]")
        # apad before the final atrim: a clip whose audio stops short of its picture
        # would otherwise pull every later shot's sound early.
        parts.append(f"{source}{conform},apad,atrim=end={seconds:.9f},asetpts=PTS-STARTPTS[a{index}]")
    parts.append(f"{''.join(labels)}concat=n={len(labels)}:v=0:a=1[bed]")
    parts.append(f"[bed]volume={job['sound']}[bedgain]")
    if not mix:
        return ";".join(parts)
    parts.append(f"[{len(job['shots'])}:a:0]{conform}[master]")
    parts.append("[master][bedgain]amix=inputs=2:duration=first:normalize=0[aout]")
    return ";".join(parts)


def level(dbfs: float) -> float:
    """A dBFS reading as a linear amplitude, where full scale is 1."""
    return 10 ** (dbfs / 20)


def measure(args: list[str], graph: str, label: str) -> dict[str, float]:
    """Peak level in dBFS and sample count of one graph output, from a single decode.

    The stats run on float samples, so an over reads above 0 instead of being clamped
    out of sight. Overall values accumulate frame by frame, so the largest is the total.
    """
    printed = run(
        ["ffmpeg", "-v", "error", *args, "-filter_complex",
         f"{graph};[{label}]astats=metadata=1:reset=0:measure_perchannel=none"
         ":measure_overall=Peak_level+Number_of_samples,ametadata=mode=print:file=-[stats]",
         "-map", "[stats]", "-f", "null", "-"]
    ).decode("utf-8", "replace")
    stats: dict[str, float] = {}
    for line in printed.splitlines():
        name, _, value = line.partition("=")
        key = name.removeprefix("lavfi.astats.Overall.")
        if key == name:
            continue
        try:
            stats[key] = max(stats.get(key, float("-inf")), float(value))
        except ValueError:
            continue
    if "Peak_level" not in stats or "Number_of_samples" not in stats:
        raise BuildError("ffmpeg reported no audio statistics, so the mix could not be checked")
    return stats


def check_headroom(job: dict) -> dict[str, float]:
    """Measure the mix before paying for the video encode, and never reshape the song to fit."""
    args, silence = inputs(job)
    stats = measure(args, sound_graph(job, silence), "aout")
    peak = stats["Peak_level"]
    if peak > 0:
        # Scaling the whole mix down would be the wrong sum: the master rides at unity and
        # only the bed carries the gain, so the gain that fits is the one leaving the bed
        # exactly the room the master's own peak does not use.
        master_peak = measure(["-i", str(job["master"])], "[0:a:0]anull[m]", "m")["Peak_level"]
        master_level = level(master_peak)
        bed_level = level(measure(args, sound_graph(job, silence, mix=False), "bedgain")["Peak_level"])
        room = level(-0.3) - master_level
        if room <= 0 or bed_level <= 0:
            raise BuildError(
                f"the master already peaks at {master_peak:.2f} dBFS, so any bed clips it. "
                f'Deliver without "sound", or supply a master with headroom.'
            )
        raise BuildError(
            f'the mix peaks at {peak:.2f} dBFS and would clip. Lower "sound" from {job["sound"]} '
            f"to at most {job['sound'] * room / bed_level:.3f} and build again."
        )
    return {"peak_dbfs": peak, "samples": stats["Number_of_samples"]}


def render(job: dict, output: Path, crf: int) -> str:
    master_codec = streams(job["master_info"], "audio")[0]["codec_name"]
    copyable = master_codec in COPYABLE and not job["sound"]
    audio_index = len(job["shots"])
    args, silence = inputs(job)

    graph = filter_graph(job)
    if job["sound"]:
        graph = f"{graph};{sound_graph(job, silence)}"

    command = ["ffmpeg", "-y", "-v", "error", *args]
    command += [
        "-filter_complex", graph,
        "-map", "[vout]",
        "-map", "[aout]" if job["sound"] else f"{audio_index}:a:0",
        # No -frames:v here. It ends the whole output once the video hits the limit, which
        # truncates the master whenever the audio runs past the last video frame. The trim
        # filter in the graph already fixes the count exactly.
        "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
        "-pix_fmt", "yuv420p", "-r", str(job["fps"]),
    ]
    command += ["-c:a", "copy"] if copyable else ["-c:a", "aac", "-b:a", "320k"]
    command += ["-movflags", "+faststart", str(output)]

    output.parent.mkdir(parents=True, exist_ok=True)
    run(command)
    if copyable:
        return "copy"
    return "mix_aac_320k" if job["sound"] else "aac_320k"


def verify(job: dict, output: Path, audio_mode: str, master_sha_before: str) -> dict:
    info = probe(output)
    video = streams(info, "video")
    audio = streams(info, "audio")
    checks: dict[str, bool] = {}

    checks["one_video_stream"] = len(video) == 1
    checks["one_audio_stream"] = len(audio) == 1
    if not (checks["one_video_stream"] and checks["one_audio_stream"]):
        return {"passed": False, "checks": checks, "detail": {}}

    frames = video_frames(info)
    checks["frame_count_exact"] = frames == job["total_frames"]
    checks["geometry"] = (video[0]["width"], video[0]["height"]) == (job["width"], job["height"])
    checks["frame_rate"] = video[0]["r_frame_rate"] == f"{job['fps']}/1"

    master_audio = streams(job["master_info"], "audio")[0]
    checks["audio_channels"] = int(audio[0]["channels"]) == int(master_audio["channels"])
    checks["audio_starts_at_zero"] = abs(float(audio[0].get("start_time", 0.0))) < 1e-6

    master_codec = master_audio["codec_name"]
    if audio_mode == "copy":
        before = audio_fingerprint(job["master"], master_codec)
        after = audio_fingerprint(output, audio[0]["codec_name"])
        checks["audio_bit_exact"] = before is not None and before == after
    else:
        # MP4 cannot carry this codec, so one documented AAC encode is the honest best case.
        # There is nothing to compare bit for bit, but it must still be a single pass.
        checks["audio_encoded_once"] = audio[0]["codec_name"] == "aac"

    # A mix delivers decoded samples, so it lands on the master's true length; the container
    # duration of an MP3 counts the encoder's padding on top of it and would read as a drift.
    mix = job.get("mix")
    expected_audio = mix["samples"] / int(master_audio["sample_rate"]) if mix else job["master_duration"]
    final_audio_duration = float(audio[0].get("duration", expected_audio))
    checks["audio_duration_preserved"] = abs(final_audio_duration - expected_audio) <= 1.0 / job["fps"]

    checks["master_untouched"] = sha256_file(job["master"]) == master_sha_before

    return {
        "passed": all(checks.values()),
        "checks": checks,
        "detail": {
            "frames": frames,
            "expected_frames": job["total_frames"],
            "size": f"{video[0]['width']}x{video[0]['height']}",
            "fps": video[0]["r_frame_rate"],
            "video_codec": video[0]["codec_name"],
            "audio_codec": audio[0]["codec_name"],
            "audio_mode": audio_mode,
            "master_duration_seconds": round(job["master_duration"], 6),
            "output_duration_seconds": round(float(info["format"]["duration"]), 6),
        },
    }


def build(edit_path: Path, output: Path, root: Path | None = None, crf: int = 18) -> dict:
    edit_path = Path(edit_path)
    root = Path(root) if root else edit_path.parent
    job = plan(load_edit(edit_path), root)
    master_sha = sha256_file(job["master"])
    if job["sound"]:
        job["mix"] = check_headroom(job)
    audio_mode = render(job, Path(output), crf)
    report = verify(job, Path(output), audio_mode, master_sha)
    report["output"] = str(output)
    report["master_sha256"] = master_sha
    if job["sound"]:
        report["detail"]["sound_gain"] = job["sound"]
        report["detail"]["mix_peak_dbfs"] = round(job["mix"]["peak_dbfs"], 2)
    report["shots"] = [
        {
            "clip": shot["clip"].name,
            "timeline_start_frame": shot["start_frame"],
            "frames": shot["span"],
            "head_trim_frames": shot["head"],
        }
        for shot in job["shots"]
    ]
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cut a music video against its master audio.")
    parser.add_argument("edit", type=Path, help="edit file, format shown in SKILL.md")
    parser.add_argument("output", type=Path, help="delivery MP4 to write")
    parser.add_argument("--root", type=Path, default=None, help="base for relative paths, defaults to the edit file's folder")
    parser.add_argument("--crf", type=int, default=18, help="x264 quality, lower is better (default 18)")
    args = parser.parse_args(argv)

    try:
        report = build(args.edit, args.output, args.root, args.crf)
    except BuildError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    print(json.dumps(report, indent=2))
    if not report["passed"]:
        failed = [name for name, ok in report["checks"].items() if not ok]
        print(f"\nFAILED: {', '.join(failed)}", file=sys.stderr)
        return 1
    print(f"\nOK  {report['detail']['frames']} frames, audio {report['detail']['audio_mode']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
