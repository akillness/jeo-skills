# SPDX-License-Identifier: Apache-2.0
"""A clip made elsewhere (a video MCP on the user's agent, such as ZCRE) enters the loop pipeline
through `video-prompt` and `video-frames`: the prompt is the one `video-set` sends, a source with no
end frame cannot film a pinned state unless asked to film it unpinned, and a clip's audio track and
cover image are recorded and left out of the frames."""

from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from sprite_gen import cli
from sprite_gen.video import batch as batch_mod
from sprite_gen.video import clip_prompt
from sprite_gen.video import frames as frames_mod

HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
PUNCH = "It throws one straight punch with its front fist and pulls the fist back to its chest."


def punch_frames(out: Path, size: tuple[int, int], count: int = 36) -> Path:
    """Keyed frames of one punch filmed pinned to its first frame: a body that stands still while an arm
    reaches out and comes back, the last frame the first one's pose."""
    keyed = out / "keyed"
    keyed.mkdir(parents=True)
    w, h = size
    for k in range(count):
        reach = round(0.3 * w * math.sin(math.pi * k / (count - 1)))
        im = Image.new("RGBA", size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(im)
        draw.rectangle((w // 2 - 8, h // 4, w // 2 + 8, h * 3 // 4), fill=(200, 80, 30, 255))
        draw.rectangle((w // 2 + 8, h // 3, w // 2 + 14 + reach, h // 3 + 6), fill=(230, 190, 150, 255))
        im.save(keyed / f"frame-{k:04d}.png")
    return keyed


def test_an_item_films_its_play_mode_and_motion_text_once_back_to_its_first_pose(tmp_path, monkeypatch) -> None:
    """A motion the engine has no state for — a punch — filmed as a video-set item with play mode once-return and
    the caller's motion text: the clip is asked for with that text, pinned to end on its first frame, and its strip
    plays once (`loop: false`) from the first pose back to the first pose."""
    base = tmp_path / "side.png"
    still = Image.new("RGB", (96, 96), (0, 255, 0))
    ImageDraw.Draw(still).rectangle((40, 20, 56, 86), fill=(200, 80, 30))
    still.save(base)
    sent = []

    def video_stub(image, prompt, out, report, **kw):
        sent.append((prompt, kw.get("last_frame")))
        out.write_bytes(b"clip")
        report.write_text(json.dumps({"prompt": prompt}))
        return 0

    def frames_stub(clip, out, **kw):
        with Image.open(kw["reference"]) as canvas:
            keyed = punch_frames(out, canvas.size)
        return {"fps": 24.0, "frames": 36, "alpha_zero_pct_min": 0, "alpha_zero_pct_max": 0, "keyed_dir": str(keyed)}

    monkeypatch.setattr(batch_mod.frames_mod, "run_frames", frames_stub)
    monkeypatch.setattr(batch_mod.facing_mod.vision, "grok_inspect", lambda *a, **kw: ("right", {}))
    root = tmp_path / "set"
    report = batch_mod.run_set(bases={"side": base}, states=["punch"], root=root, character=None, duration=None,
                               resolution="480p", key="green", concurrency=1, force=False, gap=0, video_runner=video_stub,
                               play={"punch": "once-return"}, motion={"punch": PUNCH})
    assert report["ok"] == 1, report["items"]
    [(prompt, last_frame)] = sent
    assert prompt == batch_mod.build_prompt("side", "punch", None, motion=PUNCH, play="once-return")
    assert PUNCH in prompt and "repeating" not in prompt and "so the animation loops" not in prompt
    assert last_frame == root / "side-punch" / "canvas.png"
    [item] = report["items"]
    assert item["play"] == "once-return" and item["loop"]["kind"] == "once-return"
    meta = json.loads((root / "side-punch" / "loop" / "side-punch.strip.json").read_text())
    assert meta["loop"] is False and meta["hold_last"] is False and meta["returns"] is True
    assert meta["source_cut"]["samples"][0] == 0 and meta["source_cut"]["samples"][-1] == 35
    strip = Image.open(root / "side-punch" / "loop" / "side-punch.strip.png").convert("RGBA")
    cells = [strip.crop((k * meta["w"], 0, (k + 1) * meta["w"], meta["h"])) for k in range(meta["frames"])]
    assert cells[0].tobytes() == cells[-1].tobytes()
    assert cells[len(cells) // 2].tobytes() != cells[0].tobytes()


@pytest.mark.parametrize("direction,state", [("side", "walk"), ("side", "jump")])
def test_the_prompt_is_the_one_video_set_sends(direction, state) -> None:
    record = clip_prompt.plan_prompt(direction=direction, state=state, facing="left", character="The knight",
                                     last_frame=False)
    assert record["prompt"] == batch_mod.build_prompt(direction, state, "The knight", facing="left",
                                                      model=clip_prompt.DEFAULT_MODEL)
    assert record["duration"] == batch_mod.duration_for(state, None)
    assert record["last_frame"] is None and record["cycle"] == "auto" and record["warnings"] == []


@pytest.mark.parametrize("direction,state", [("side", "idle"), ("front_diagonal", "walk")])
def test_no_end_frame_refuses_a_pinned_state(direction, state) -> None:
    assert batch_mod.pins_last_frame(state, direction)
    with pytest.raises(SystemExit, match="no end frame"):
        clip_prompt.plan_prompt(direction=direction, state=state, last_frame=False)


def test_unpinned_films_a_pinned_state_as_a_searched_loop_with_a_warning() -> None:
    record = clip_prompt.plan_prompt(direction="side", state="idle", last_frame=False, unpinned=True)
    assert record["prompt"] == batch_mod.build_prompt("side", "idle", None, pinned=False, model=clip_prompt.DEFAULT_MODEL)
    assert "evenly paced" in record["prompt"] and "returns to the exact pose of the first frame" not in record["prompt"]
    assert record["last_frame"] is None and record["cycle"] == "auto"
    assert record["warnings"] and "end-frame pin" in record["warnings"][0]
    with pytest.raises(SystemExit, match="goes with --no-last-frame"):
        clip_prompt.plan_prompt(direction="side", state="idle", unpinned=True)


def test_a_source_with_an_end_frame_films_pinned_states_as_video_set_does() -> None:
    idle = clip_prompt.plan_prompt(direction="side", state="idle")
    assert idle["last_frame"] == "canvas" and idle["cycle"] == "pinned"
    assert idle["prompt"] == batch_mod.build_prompt("side", "idle", None, model=clip_prompt.DEFAULT_MODEL)
    assert "end frame <dir>/canvas.png" in idle["commands"]["clip"]
    diagonal = clip_prompt.plan_prompt(direction="back_diagonal", state="walk")
    assert diagonal["last_frame"] == "canvas" and diagonal["cycle"] == "auto"  # a pinned gait is still searched


def test_a_front_walk_carries_its_mid_step_redraw() -> None:
    record = clip_prompt.plan_prompt(direction="front", state="walk", last_frame=False, key="magenta")
    assert record["start_still"]["prompt"] == batch_mod.walk_start_prompt("front", "magenta")
    assert "--still <dir>/walk-start.png" in record["commands"]["canvas"]
    assert "start_still" not in clip_prompt.plan_prompt(direction="side", state="walk", last_frame=False)


@pytest.mark.slow
def test_the_cli_prints_the_prompt_alone_or_the_record() -> None:
    args = [sys.executable, "-m", "sprite_gen.cli", "video-prompt", "--direction", "side", "--state", "walk", "--no-last-frame"]
    plain = subprocess.run(args, capture_output=True, encoding="utf-8")
    assert plain.returncode == 0, plain.stderr
    assert plain.stdout.strip() == batch_mod.build_prompt("side", "walk", None, model=clip_prompt.DEFAULT_MODEL)
    record = json.loads(subprocess.run([*args, "--json"], capture_output=True, encoding="utf-8", check=True).stdout)
    assert record["kind"] == "sprite-gen-video-prompt" and record["state"] == "walk"
    refused = subprocess.run([*args[:-3], "attack", "--no-last-frame"], capture_output=True, encoding="utf-8")
    assert refused.returncode != 0 and "--unpinned" in refused.stderr and not refused.stdout


def test_probe_reads_the_picture_past_a_cover_image(monkeypatch) -> None:
    """A cover image (`attached_pic`) is not the clip, wherever it sits; the audio is counted."""
    streams = [
        {"index": 0, "codec_type": "video", "codec_name": "mjpeg", "width": 64, "height": 64, "r_frame_rate": "90000/1", "disposition": {"attached_pic": 1}},
        {"index": 1, "codec_type": "audio", "codec_name": "aac", "disposition": {"attached_pic": 0}},
        {"index": 2, "codec_type": "video", "codec_name": "h264", "pix_fmt": "yuv420p", "width": 960, "height": 960, "r_frame_rate": "24/1", "nb_frames": "73", "disposition": {"attached_pic": 0}},
    ]
    out = json.dumps({"streams": streams, "format": {"duration": "3.041667"}})
    monkeypatch.setattr(frames_mod, "_require", lambda binary: binary)
    monkeypatch.setattr(frames_mod.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0, out, ""))
    meta = frames_mod.probe(Path("clip.mp4"))
    assert meta["stream_index"] == 2 and (meta["width"], meta["height"], meta["fps"], meta["nb_frames"]) == (960, 960, 24.0, 73)
    assert (meta["codec"], meta["pix_fmt"], meta["audio_streams"], meta["cover_streams"]) == ("h264", "yuv420p", 1, 1)
    only_cover = json.dumps({"streams": streams[:2], "format": {}})
    monkeypatch.setattr(frames_mod.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0, only_cover, ""))
    with pytest.raises(SystemExit, match="no video stream"):
        frames_mod.probe(Path("clip.mp4"))


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg/ffprobe not installed")
def test_frames_of_a_clip_with_audio_and_a_cover_are_the_pictures_frames(tmp_path: Path) -> None:
    """The shape a ZCRE clip comes in: H.264 4:2:0, an AAC track and an mjpeg cover image."""
    src = tmp_path / "src"
    src.mkdir()
    for i in range(12):
        im = Image.new("RGB", (64, 64), (0, 255, 0))
        for y in range(20, 50):
            for x in range(20 + i, 34 + i):
                im.putpixel((x, y), (200, 40, 40))
        im.save(src / f"f-{i:04d}.png")
    Image.new("RGB", (64, 64), (10, 10, 200)).save(tmp_path / "cover.png")
    plain = tmp_path / "plain.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "24", "-i", str(src / "f-%04d.png"), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
                    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", "-c:a", "aac", "-t", "0.5", str(plain)], check=True)
    clip = tmp_path / "clip.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp_path / "cover.png"), "-i", str(plain), "-map", "0", "-map", "1", "-c", "copy",
                    "-c:v:0", "mjpeg", "-disposition:v:0", "attached_pic", str(clip)], check=True)
    report = frames_mod.run_frames(clip, tmp_path / "frames", key="green", allow_edge_contact=False, report_path=None)
    assert report["frames"] == 12 and len(list((tmp_path / "frames" / "raw").glob("frame-*.png"))) == 12
    assert (report["codec"], report["pix_fmt"], report["audio_streams"], report["cover_streams"]) == ("h264", "yuv420p", 1, 1)
    saved = json.loads((tmp_path / "frames" / "frames.report.json").read_text(encoding="utf-8"))
    assert saved["audio_streams"] == 1 and saved["stream_index"] == report["stream_index"]


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg/ffprobe not installed")
def test_the_video_frames_command_hands_over_keyed_frames_and_prints_the_report_it_wrote(tmp_path: Path, capsys) -> None:
    """`sprite-gen video-frames` from its argv to its files: a green-keyed H.264 clip comes out as raw and keyed
    frames, the report says the run passed, and the printed summary names the report and the keyed frames."""
    src = tmp_path / "src"
    src.mkdir()
    for i in range(6):
        im = Image.new("RGB", (64, 64), (0, 255, 0))
        ImageDraw.Draw(im).rectangle((20 + i, 20, 33 + i, 49), fill=(200, 40, 40))
        im.save(src / f"f-{i:04d}.png")
    clip = tmp_path / "clip.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "24", "-i", str(src / "f-%04d.png"), "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", "-crf", "12", str(clip)], check=True)
    out = tmp_path / "frames"
    assert cli.main(["video-frames", "--clip", str(clip), "--out-dir", str(out), "--key", "green"]) == 0
    keyed = sorted((out / "keyed").glob("frame-*.png"))
    assert len(keyed) == len(list((out / "raw").glob("frame-*.png"))) == 6
    first = Image.open(keyed[0])
    assert first.mode == "RGBA" and first.getpixel((0, 0))[3] == 0 and first.getpixel((26, 35))[3] == 255
    report = json.loads((out / "frames.report.json").read_text(encoding="utf-8"))
    assert report["status"] == "passed" and report["frames"] == 6
    printed = json.loads(capsys.readouterr().out)
    assert printed["report"] == str((out / "frames.report.json").resolve()) and printed["keyed_dir"] == report["keyed_dir"]
    assert (printed["frames"], printed["width"], printed["height"], printed["fps"]) == (6, 64, 64, 24.0)
