"""Synthetic clips for the dynamism_check.py suite: gray frames encoded by ffmpeg's libx264.
The content is built in numpy, so it reads the same on every ffmpeg version CI runs."""

import json
import subprocess

import numpy as np

W, H, FPS = 320, 180, 60


def texture(seed=3, width=4000, height=H + 80):
    """Gaussian-smoothed noise at four scales, gray 30-220: footage-like detail for optical flow."""
    import cv2

    rng = np.random.default_rng(seed)
    acc = np.zeros((height, width), np.float32)
    for sigma, weight in ((1.5, 1), (4, 1.5), (10, 2), (25, 3)):
        n = cv2.GaussianBlur(rng.uniform(0, 1, acc.shape).astype(np.float32), (0, 0), sigma)
        acc += weight * (n - n.mean()) / n.std()
    return cv2.normalize(acc, None, 30, 220, cv2.NORM_MINMAX).astype(np.uint8)


def viewer(tex, w=W, h=H):
    def view(x, y=0):
        x, y = int(round(x)) % (tex.shape[1] - w), int(round(y)) % (tex.shape[0] - h)
        return np.ascontiguousarray(tex[y : y + h, x : x + w])

    return view


def encode(path, frames, fps=FPS, size=(W, H), pix_fmt="gray"):
    p = subprocess.Popen(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", pix_fmt, "-s", f"{size[0]}x{size[1]}",
         "-r", str(fps), "-i", "-", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", str(path)],
        stdin=subprocess.PIPE,
    )
    for f in frames:
        p.stdin.write(np.ascontiguousarray(f).tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError(f"ffmpeg failed to encode {path}")


def pan(view, px_per_frame_1920, seconds=2.0, source_fps=60, w=W):
    """A constant pan at a speed in px per 1/60 s on a 1920 px long side, shown at source_fps in a 60 fps clip:
    24 repeats each picture 2 or 3 times, as 24 fps footage does in a 60 fps render."""
    step = px_per_frame_1920 * w / 1920
    return [view(200 + int(i * source_fps / FPS) * step * FPS / source_fps) for i in range(int(seconds * FPS))]


def drift(tex, px_per_frame_1920, seconds=2.0, w=W, h=H):
    """A sub-pixel pan at a speed in px per 1/60 s on a 1920 px long side, over a tex of at least 2w + 800 by 2h,
    resampled bilinearly at twice the size and downscaled by area, as a render would be. Whole-pixel views would
    step once every few frames and hold in between; bilinear steps at the clip size let libx264 hold some too."""
    import cv2

    step, tex, out = 2 * px_per_frame_1920 * w / 1920, tex.astype(np.float32), []
    for i in range(int(seconds * FPS)):
        shift = np.float32([[1, 0, -(400 + i * step)], [0, 1, 0]])
        frame = cv2.warpAffine(tex, shift, (2 * w, 2 * h), flags=cv2.INTER_LINEAR)
        out.append(cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA).clip(0, 255).astype(np.uint8))
    return out


def held(frames, source_fps):
    """A 60 fps move shown at source_fps in a 60 fps clip: each picture repeats until the next, 2 or 3 times at 24."""
    return [frames[int(int(i * source_fps / FPS) * FPS / source_fps)] for i in range(len(frames))]


def push_in(tex, total, seconds=2.0, w=W, h=H):
    """A centered zoom from 1 to 1 + total on the top left 2w x 2h of tex, downscaled by area as a render would be."""
    import cv2

    big, n, out = tex[: 2 * h, : 2 * w].astype(np.float32), int(seconds * FPS), []
    for i in range(n):
        zoom = cv2.getRotationMatrix2D((w, h), 0, 1 + total * i / (n - 1))
        frame = cv2.warpAffine(big, zoom, (2 * w, 2 * h), flags=cv2.INTER_LINEAR)
        out.append(cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA).clip(0, 255).astype(np.uint8))
    return out


def grain(frame, sigma, seconds=2.0, seed=1):
    """One frame held, under fresh Gaussian grain of sigma gray levels on every frame."""
    rng = np.random.default_rng(seed)
    n = int(seconds * FPS)
    return [(frame + rng.normal(0, sigma, frame.shape)).clip(0, 255).astype(np.uint8) for _ in range(n)]


def five_segments(view):
    """footage24 [0,3), frozen [3,4.2), moving60 [4.2,6), strobe [6,7), card [7,9)."""
    out = [view(4 * int(i / FPS * 24)) for i in range(180)]
    out += [view(900)] * 72
    out += [view(1500 + 2 * i) for i in range(108)]
    out += [np.full((H, W), 235 if (i // 6) % 2 else 16, np.uint8) for i in range(60)]
    out += [view(2600)] * 120
    return out


def audio_json(duration=9.0, quiet=(3.0, 4.2), level=0.2):
    """Beats every 0.5 s, downbeats every 2 s, env.mix at level in the quiet span and 0.6 elsewhere, sampled at the
    real envelope rate: 22050 Hz over a hop of 22050 // 60 = 367 samples is 60.08 Hz, not the env_fps of 60."""
    rate = 22050 / (22050 // 60)
    n = int(round(duration * rate))
    mix = [level if quiet[0] <= k / rate < quiet[1] else 0.6 for k in range(n)]
    return json.dumps({"duration": duration, "beats": [k * 0.5 for k in range(int(duration * 2))],
                       "downbeats": [k * 2.0 for k in range(int(duration / 2) + 1)], "env_fps": 60, "env": {"mix": mix}})
