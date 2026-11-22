"""Flag render faults frame by frame, at quarter scale (960x540 luma).

usage: audit.py <video> [frame_offset]

Reports frozen frames between moving ones (a stale capture), frames whose bottom band is blank (a cropped
capture) and single-frame brightness spikes (a flash: may be intended, look at it). frame_offset is added
to every reported frame number, for a clip cut from a longer render.
"""

import argparse
import sys

import cv2
import numpy as np


def read_luma(path):
    """Per frame: mean absolute change from the previous frame, mean luma, mean luma of the bottom 30 rows."""
    cap = cv2.VideoCapture(path)
    prev, diffs, lum, band = None, [], [], []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        g = cv2.resize(f, (960, 540), interpolation=cv2.INTER_AREA)
        g = cv2.cvtColor(g, cv2.COLOR_BGR2GRAY).astype(np.float32)
        diffs.append(0 if prev is None else float(np.abs(g - prev).mean()))
        lum.append(float(g.mean()))
        band.append(float(g[-30:].mean()))
        prev = g
    return np.array(diffs), np.array(lum), np.array(band)


def stale_frames(d):
    return [i for i in range(2, len(d) - 1) if d[i] < 0.02 and d[i - 1] > 0.6 and d[i + 1] > 0.6]


def blank_band(band):
    return [i for i in range(len(band)) if band[i] < 3.0]


def spikes(lum):
    return [i for i in range(1, len(lum) - 1) if lum[i] - max(lum[i - 1], lum[i + 1]) > 25]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("video")
    ap.add_argument("frame_offset", type=int, nargs="?", default=0, help="added to every frame number")
    a = ap.parse_args(argv)
    d, lum, band = read_luma(a.video)
    if not len(d):
        sys.exit(f"no frames decoded from {a.video}")
    off = a.frame_offset
    print(f"{len(d)} frames; median diff {np.median(d):.2f}; mean luma {lum.mean():.1f}")
    print("stale (frozen between moving frames):", [i + off for i in stale_frames(d)][:30])
    print("blank bottom band (<3.0):", [i + off for i in blank_band(band)][:30])
    print("single-frame luma spikes:", [i + off for i in spikes(lum)][:30])


if __name__ == "__main__":
    main()
