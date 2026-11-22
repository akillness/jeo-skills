"""List still stretches (under 1.5% of the frame changing), with the beat each one starts on.

usage: holds.py <video> [min_s] [bpm]

min_s is the shortest stretch listed (default 0.3 s), bpm the film's tempo for the beat labels (default
120). The video is read at 60 fps like dyn.py, so seconds are right for any source frame rate.
"""

import argparse
import subprocess
import sys

import cv2
import numpy as np

W, H, FPS = 320, 180, 60
STILL = 0.015


def changed_area(src):
    """Share of the frame that changes (luma diff > 24), per frame pair at 60 fps."""
    cmd = ["ffmpeg", "-v", "error", "-i", src, "-vf", f"fps={FPS},scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    except FileNotFoundError:
        sys.exit("ffmpeg was not found: install ffmpeg")
    prev, area = None, []
    while True:
        b = p.stdout.read(W * H)
        if len(b) < W * H:
            break
        g = np.frombuffer(b, np.uint8).reshape(H, W)
        if prev is not None:
            area.append(float((cv2.absdiff(g, prev) > 24).mean()))
        prev = g
    p.stdout.close()
    p.wait()
    return np.array(area)


def find_holds(area, min_s=0.3):
    """[(start_s, length_s, mean_change)] for every still stretch of at least min_s seconds."""
    still = area < STILL
    holds, s0 = [], None
    for i, v in enumerate(list(still) + [False]):
        if v and s0 is None:
            s0 = i
        if not v and s0 is not None:
            if (i - s0) / FPS >= min_s:
                holds.append((s0 / FPS, (i - s0) / FPS, float(area[s0:i].mean())))
            s0 = None
    return holds


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("video")
    ap.add_argument("min_s", type=float, nargs="?", default=0.3, help="shortest stretch to list, in seconds")
    ap.add_argument("bpm", type=float, nargs="?", default=120, help="the film's tempo, for the beat labels")
    a = ap.parse_args(argv)
    area = changed_area(a.video)
    if not len(area):
        sys.exit(f"no frames decoded from {a.video}")
    beat = 60 / a.bpm
    for start, length, mean in find_holds(area, a.min_s):
        print(f"{start:6.2f}s (beat {start / beat:6.1f})  {length:.2f}s  mean change {mean * 100:.2f}%")
    print("still share", round(float((area < STILL).mean()), 3))


if __name__ == "__main__":
    main()
