"""One render worker: runs render.mjs, averages each frame's sub-samples, adds bloom and grain, encodes.

usage: post.py <dsf> <frame0> <frame1> <out.mp4> [fps]

render.py starts several and joins their parts; serve the film at FILM_URL first. dsf is the device
scale (1 for 1080p, 2 for 4K). ENC overrides the encoder arguments (default H.264 CRF 12.4, preset
slower, Level 5.2 at 4K and 4.2 below, so Macs and phones play it). GRAIN=0 turns the grain off.
"""

import os
import struct
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
GRAIN = float(os.environ.get("GRAIN", "2.2"))


def read_exact(stream, n):
    b = stream.read(n)
    return b if b is not None and len(b) == n else None


def read_frames(stream):
    """Yield (frame number, [decoded samples]) from render.mjs's stream: u32 frame, u32 n, n x (u32 len, jpeg)."""
    while True:
        header = read_exact(stream, 8)
        if header is None:
            return
        k, n = struct.unpack("<II", header)
        samples = []
        for _ in range(n):
            size = read_exact(stream, 4)
            data = size and read_exact(stream, struct.unpack("<I", size)[0])
            if not data:
                return
            samples.append(cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR).astype(np.float32))
        yield k, samples


def blend(samples):
    """Motion blur: the mean of a frame's sub-frame samples."""
    acc = samples[0].copy()
    for s in samples[1:]:
        acc += s
    return acc / len(samples)


def bloom(img, scale):
    """A bright pass (over 175) at quarter resolution, blurred at two radii, added back."""
    h, w = img.shape[:2]
    small = cv2.resize(img, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    bright = np.clip(small - 175, 0, None)
    glow = 0.6 * cv2.GaussianBlur(bright, (0, 0), 5 * scale) + 0.4 * cv2.GaussianBlur(bright, (0, 0), 20 * scale)
    return img + cv2.resize(glow, (w, h), interpolation=cv2.INTER_LINEAR) * 0.75


def grain_tiles(w, h):
    """Eight half-resolution noise tiles, seeded, so a re-render matches frame for frame."""
    return [np.random.default_rng(i).normal(0, 1, (h // 2, w // 2)).astype(np.float32) for i in range(8)]


def finish_frame(samples, k, tiles, dsf, grain=GRAIN):
    img = bloom(blend(samples), dsf / 2)
    if grain:
        h, w = img.shape[:2]
        img += cv2.resize(tiles[k % 8], (w, h), interpolation=cv2.INTER_LINEAR)[..., None] * grain
    return np.clip(img + 0.5, 0, 255).astype(np.uint8)


def encoder_args(h):
    """The master encode for a frame h px tall. A slower preset with no level came out Level 6.0, which no Mac plays."""
    level = "5.2" if h > 1440 else "4.2"
    return ["-c:v", "libx264", "-crf", "12.4", "-preset", "slower", "-level", level, "-rc-lookahead", "40", "-threads", "8"]


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) < 4:
        sys.exit(__doc__.split("\n\n")[1])
    dsf, f0, f1, out = float(args[0]), int(args[1]), int(args[2]), args[3]
    fps = args[4] if len(args) > 4 else "60"
    w, h = int(1920 * dsf), int(1080 * dsf)
    enc = os.environ.get("ENC", "").split() or encoder_args(h)
    node = subprocess.Popen(["node", os.path.join(HERE, "render.mjs"), str(dsf), str(f0), str(f1)], stdout=subprocess.PIPE, bufsize=1 << 24)
    color = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]
    ff = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", fps, "-i", "-", *enc, "-pix_fmt", "yuv420p", *color, out],
        stdin=subprocess.PIPE,
    )
    tiles = grain_tiles(w, h) if GRAIN else None
    done = 0
    for k, samples in read_frames(node.stdout):
        if not samples:
            break
        ff.stdin.write(finish_frame(samples, k, tiles, dsf).tobytes())
        done += 1
    ff.stdin.close()
    ff.wait()
    node.wait()
    print(f"{out}: {done} frames (expected {f1 - f0})", flush=True)
    sys.exit(0 if done == f1 - f0 else 1)


if __name__ == "__main__":
    main()
