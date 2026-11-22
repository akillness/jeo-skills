"""Small ffmpeg-backed fixtures. Everything here is synthetic and disposable."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-seedance-music-video" / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))


def ffmpeg(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True, capture_output=True)


def make_clip(
    path: Path,
    seconds: float,
    color: str = "blue",
    fps: int = 24,
    size: str = "320x240",
    tone: int | None = None,
    gain: float = 1.0,
) -> Path:
    """A flat colour clip. With a tone it also carries its own audio, as a generated shot does."""
    args = ["-f", "lavfi", "-i", f"color=c={color}:s={size}:r={fps}:d={seconds}"]
    if tone is not None:
        args += [
            "-f", "lavfi", "-i", f"sine=frequency={tone}:duration={seconds}",
            "-filter_complex", f"[1:a]volume={gain},aformat=channel_layouts=stereo[a]",
            "-map", "0:v", "-map", "[a]", "-c:a", "aac",
        ]
    args += ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(path)]
    ffmpeg(args)
    return path


def make_master(path: Path, seconds: float = 4.0, codec: str = "mp3", gain: float = 1.0) -> Path:
    codec_args = {
        "mp3": ["-c:a", "libmp3lame", "-b:a", "128k"],
        "wav": ["-c:a", "pcm_s16le"],
        "aac": ["-c:a", "aac", "-b:a", "128k"],
    }[codec]
    ffmpeg(
        [
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
            "-af", f"volume={gain}", "-ac", "2", *codec_args, str(path),
        ]
    )
    return path


def make_music(path: Path) -> Path:
    """A quiet stretch then a loud stretch, so section detection has something to find."""
    ffmpeg(
        [
            "-f", "lavfi", "-i", "sine=frequency=220:duration=3",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-filter_complex", "[0:a]volume=0.04[a];[1:a]volume=0.9[b];[a][b]concat=n=2:v=0:a=1[out]",
            "-map", "[out]", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k", str(path),
        ]
    )
    return path


def write_edit(path: Path, master: str, shots: list[dict], **extra) -> Path:
    payload = {"master": master, "fps": 24, "width": 320, "height": 240, "shots": shots}
    payload.update(extra)
    path.write_text(json.dumps(payload))
    return path


def probe_json(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        check=True, capture_output=True,
    ).stdout
    return json.loads(out)
