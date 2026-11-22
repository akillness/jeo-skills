#!/usr/bin/env python3
"""ffmpeg helpers: probe, decode frames to float RGB, encode RGB back to video."""
import json
import subprocess
from pathlib import Path

import numpy as np

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}


def is_image(path):
    return Path(path).suffix.lower() in IMAGE_EXT


def probe(path):
    """-> dict(w, h, frames, fps, fps_str, audio)."""
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    streams = json.loads(out)["streams"]
    v = next(s for s in streams if s["codec_type"] == "video")
    num, den = (v.get("r_frame_rate") or "24/1").split("/")
    fps = float(num) / float(den or 1)
    frames = int(v.get("nb_frames") or 0)
    if not frames and not is_image(path):
        frames = int(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v",
                                     "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(path)],
                                    capture_output=True, text=True, check=True).stdout.strip() or 0)
    return dict(w=int(v["width"]), h=int(v["height"]), frames=max(frames, 1), fps=fps,
                fps_str=v.get("r_frame_rate") or "24/1",
                audio=any(s["codec_type"] == "audio" for s in streams) and not is_image(path))


def frames(path, w, h):
    """Yield every frame as float64 RGB (h*w, 3) in 0-1 (Rec.709, 16-bit decode)."""
    p = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", str(path),
                          "-vf", "scale=in_color_matrix=bt709:in_range=auto", "-f", "rawvideo",
                          "-pix_fmt", "rgb48le", "-"], stdout=subprocess.PIPE)
    size = w * h * 6
    try:
        while True:
            buf = p.stdout.read(size)
            if len(buf) < size:
                break
            yield np.frombuffer(buf, "<u2").reshape(h * w, 3) / 65535.0
    finally:
        p.stdout.close()
        p.wait()


def frame_at(path, n, w, h):
    """One frame (float RGB, flat) by index."""
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-vf",
                          f"select=eq(n\\,{n}),scale=in_color_matrix=bt709:in_range=auto,format=rgb48le",
                          "-frames:v", "1", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, "<u2").reshape(h * w, 3) / 65535.0


def encoder(dest, w, h, fps_str, vf="null", audio_from=None, crf=16):
    """ffmpeg process that takes rgb48le frames on stdin and writes an H.264 mp4 (audio copied over)."""
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb48le", "-s", f"{w}x{h}",
           "-r", fps_str, "-i", "-"]
    if audio_from:
        cmd += ["-i", str(audio_from), "-map", "0:v", "-map", "1:a?", "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-vf", f"{vf},format=yuv420p", "-c:v", "libx264", "-crf", str(crf), "-preset", "slow",
            "-movflags", "+faststart", str(dest)]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def write(enc, rgb):
    enc.stdin.write((np.clip(rgb, 0, 1) * 65535 + 0.5).astype("<u2").tobytes())


def save_image(rgb, w, h, dest, vf=None):
    """Save float RGB to an image file, optionally through an ffmpeg filter chain (LUT, finishing)."""
    raw = (np.clip(rgb, 0, 1) * 65535 + 0.5).astype("<u2").tobytes()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb48le", "-s", f"{w}x{h}",
                    "-i", "-", "-vf", vf or "null", "-frames:v", "1", str(dest)], input=raw, check=True)


def mask_frames(path, w, h):
    """Yield every frame of a mask video as bool (h, w): white = object."""
    p = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", str(path), "-vf", f"scale={w}:{h},format=gray",
                          "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    try:
        while True:
            buf = p.stdout.read(w * h)
            if len(buf) < w * h:
                break
            yield np.frombuffer(buf, np.uint8).reshape(h, w) > 127
    finally:
        p.stdout.close()
        p.wait()


def mask_at(path, n, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-vf",
                          f"select=eq(n\\,{n}),scale={w}:{h},format=gray", "-frames:v", "1", "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(h, w) > 127
