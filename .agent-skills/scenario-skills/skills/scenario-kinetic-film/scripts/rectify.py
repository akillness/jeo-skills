"""Flatten a screen filmed with a phone: track the camera on the static surroundings, warp the screen to 16:9.

usage: rectify.py <video> <out.mp4> <end_s> <ref_t> '<quad>' '<caption band>' [--size 1600x900]

quad: the screen's corners at ref_t seconds as JSON, top-left, top-right, bottom-right, bottom-left:
'[[x,y],[x,y],[x,y],[x,y]]'. caption band: '[y0,y1]', rows of a burnt-in caption to ignore while tracking.
SIFT features on everything outside the screen (and the band) give a homography per frame; the screen
quad follows it. Writes <out.mp4> up to end_s and <out.mp4>.quads.json (the quad in every frame).
"""

import argparse
import json
import subprocess
import sys

import cv2
import numpy as np

SCALE = 0.5  # features are found at half resolution


def parse_points(text, n, what):
    try:
        v = np.float32(json.loads(text))
    except (ValueError, TypeError):
        sys.exit(f"{what} must be JSON, got {text!r}")
    if v.shape != ((n, 2) if n == 4 else (2,)):
        sys.exit(f"{what} needs {'4 [x,y] corners' if n == 4 else '2 values [y0,y1]'}, got {text!r}")
    return v


def mask_for(h, w, quad, band, homography=None):
    """Track on everything but the screen (grown 8%, its content changes) and the caption band."""
    m = np.full((h, w), 255, np.uint8)
    q = quad.copy() if homography is None else cv2.perspectiveTransform(quad[None], homography)[0]
    c = q.mean(0)
    cv2.fillPoly(m, [np.int32(((q - c) * 1.08 + c) * SCALE)], 0)
    m[int(band[0] * SCALE) : int(band[1] * SCALE), :] = 0
    return m


def gray(frame):
    return cv2.cvtColor(cv2.resize(frame, None, fx=SCALE, fy=SCALE), cv2.COLOR_BGR2GRAY)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("video")
    ap.add_argument("out")
    ap.add_argument("end_s", type=float, help="stop after this many seconds")
    ap.add_argument("ref_t", type=float, help="the time the quad was measured at, in seconds")
    ap.add_argument("quad", help="'[[x,y],[x,y],[x,y],[x,y]]': top-left, top-right, bottom-right, bottom-left")
    ap.add_argument("band", help="'[y0,y1]': a caption band to ignore")
    ap.add_argument("--size", default="1600x900", help="output size WxH (default 1600x900)")
    a = ap.parse_args(argv)
    quad = parse_points(a.quad, 4, "quad")
    band = parse_points(a.band, 2, "caption band")
    try:
        ow, oh = (int(v) for v in a.size.lower().split("x"))
    except ValueError:
        sys.exit(f"--size must be WxH, got {a.size!r}")

    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps:
        sys.exit(f"could not read {a.video} as a video")
    sift = cv2.SIFT_create(4000)
    cap.set(cv2.CAP_PROP_POS_MSEC, a.ref_t * 1000)
    ok, ref = cap.read()
    if not ok:
        sys.exit(f"no frame at ref_t {a.ref_t} s in {a.video}")
    rg = gray(ref)
    kr, dr = sift.detectAndCompute(rg, mask_for(*rg.shape, quad, band))
    if dr is None:
        sys.exit(f"no features to track outside the screen at {a.ref_t} s: check the quad and the band")
    matcher = cv2.BFMatcher()
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    enc = ["-c:v", "libx264", "-crf", "14", "-preset", "fast", "-pix_fmt", "yuv420p"]
    ff = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{ow}x{oh}", "-r", str(fps), "-i", "-", *enc, a.out],
        stdin=subprocess.PIPE,
    )
    dst = np.float32([[0, 0], [ow, 0], [ow, oh], [0, oh]])
    quads, last_h, n = [], np.eye(3), 0
    while True:
        ok, fr = cap.read()
        if not ok or n / fps > a.end_s:
            break
        g = gray(fr)
        k, d = sift.detectAndCompute(g, mask_for(*g.shape, quad, band, last_h))
        h = last_h
        if d is not None and len(k) > 30:
            pairs = (m for m in matcher.knnMatch(dr, d, k=2) if len(m) == 2)
            good = [m for m, second in pairs if m.distance < 0.7 * second.distance]
            if len(good) > 25:
                p0 = np.float32([kr[m.queryIdx].pt for m in good]) / SCALE
                p1 = np.float32([k[m.trainIdx].pt for m in good]) / SCALE
                hn, inliers = cv2.findHomography(p0, p1, cv2.RANSAC, 3.0)
                if hn is not None and inliers.sum() > 20:
                    h = hn
        last_h = h
        q = cv2.perspectiveTransform(quad[None], h)[0]
        quads.append(q.tolist())
        warp = cv2.getPerspectiveTransform(q, dst)
        ff.stdin.write(cv2.warpPerspective(fr, warp, (ow, oh), flags=cv2.INTER_CUBIC).tobytes())
        n += 1
        if n % 300 == 0:
            print(n, flush=True)
    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit(f"ffmpeg could not write {a.out}")
    with open(a.out + ".quads.json", "w") as fh:
        json.dump(quads, fh)
    print("frames", n)


if __name__ == "__main__":
    main()
