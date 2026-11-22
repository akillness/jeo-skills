"""How dynamic is a piece of motion design? Measured at 320x180 on every frame, resampled to 60 fps.

usage: dyn.py <video> [t0] [t1] [out.json]

Per frame pair:
  flow   mean optical-flow speed (px per 1/60 s at 1920 px width): how fast things move
  area   share of the frame that changes (luma diff > 24): how much of the screen is in motion
  still  frames where under 1.5% of the frame changes: holds
  cuts   frames where most of the frame changes at once (hard cuts, flashes, color swaps)
  flips  big changes in mean frame brightness (full-bleed background swaps)
Prints the summary as JSON; out.json also gets the per-second numbers. A clip below 60 fps is read with
each frame repeated, so its repeats count as still: compare references with the film at the same rate.
"""

import argparse
import json
import subprocess
import sys

import cv2
import numpy as np

W, H, FPS = 320, 180, 60
STILL = 0.015


def frame_rows(src, t0=0.0, t1=None):
    """Per frame pair: changed area, flow, mean luma and luma change, from t0 to t1 seconds."""
    span = ["-t", str(t1 - t0)] if t1 is not None else []
    cmd = ["ffmpeg", "-v", "error", "-ss", str(t0), *span, "-i", src]
    cmd += ["-vf", f"fps={FPS},scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    except FileNotFoundError:
        sys.exit("ffmpeg was not found: install ffmpeg")
    prev, rows = None, []
    while True:
        b = p.stdout.read(W * H * 3)
        if len(b) < W * H * 3:
            break
        g = cv2.cvtColor(np.frombuffer(b, np.uint8).reshape(H, W, 3), cv2.COLOR_BGR2GRAY)
        if prev is not None:
            d = cv2.absdiff(g, prev)
            fl = cv2.calcOpticalFlowFarneback(prev, g, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            mag = np.hypot(fl[..., 0], fl[..., 1])
            # count flow only where something is there (textured or changing), scaled to 1920 px
            m = (d > 10) | (cv2.Laplacian(g, cv2.CV_16S) != 0)
            rows.append(
                {
                    "area": float((d > 24).mean()),
                    "flow": float(mag[m].mean() * 1920 / W) if m.any() else 0.0,
                    "luma": float(g.mean()),
                    "dl": float(abs(g.mean() - prev.mean())),
                }
            )
        prev = g
    p.stdout.close()
    p.wait()
    return rows


def still_runs(still):
    """Lengths, in frames, of every run of still frames."""
    runs, c = [], 0
    for s in still.tolist():
        if s:
            c += 1
            continue
        if c:
            runs.append(c)
        c = 0
    if c:
        runs.append(c)
    return runs


def summarize(rows, src=""):
    n = len(rows)
    area = np.array([r["area"] for r in rows])
    flow = np.array([r["flow"] for r in rows])
    dl = np.array([r["dl"] for r in rows])
    still = area < STILL
    runs = still_runs(still)
    cuts = int(((area > 0.45) & ((dl > 18) | (area > 0.6))).sum())
    per_second = [
        {
            "s": i,
            "area": round(float(area[i * FPS : (i + 1) * FPS].mean()), 3),
            "flow": round(float(flow[i * FPS : (i + 1) * FPS].mean()), 1),
            "still": round(float(still[i * FPS : (i + 1) * FPS].mean()), 2),
        }
        for i in range(n // FPS)
    ]
    summary = {
        "src": src,
        "seconds": round(n / FPS, 2),
        "mean_area": round(float(area.mean()), 4),
        "mean_flow": round(float(flow.mean()), 2),
        "median_flow": round(float(np.median(flow)), 2),
        "p90_flow": round(float(np.percentile(flow, 90)), 1),
        "still_share": round(float(still.mean()), 3),
        "holds_over_0_5s": int(sum(1 for r in runs if r >= FPS // 2)),
        "longest_hold_s": round(max(runs) / FPS if runs else 0, 2),
        "cuts": cuts,
        "cuts_per_10s": round(cuts / (n / FPS) * 10, 2),
        "flips": int((dl > 40).sum()),
        "high_motion_share": round(float((area > 0.12).mean()), 3),
    }
    return summary, per_second


def measure(src, t0=0.0, t1=None):
    """(summary, per_second) for src between t0 and t1 seconds, or None when no frame decodes."""
    rows = frame_rows(src, t0, t1)
    return summarize(rows, src) if rows else None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("video")
    ap.add_argument("t0", type=float, nargs="?", default=0.0, help="start, in seconds (default 0)")
    ap.add_argument("t1", type=float, nargs="?", help="end, in seconds (default: the end)")
    ap.add_argument("out", nargs="?", help="write the summary and per-second numbers here as JSON")
    a = ap.parse_args(argv)
    if a.t1 is not None and a.t1 <= a.t0:
        sys.exit(f"t1 ({a.t1}) must come after t0 ({a.t0})")
    result = measure(a.video, a.t0, a.t1)
    if result is None:
        sys.exit(f"no frames decoded from {a.video} between {a.t0} and {a.t1 if a.t1 is not None else 'the end'} s")
    summary, per_second = result
    if a.out:
        with open(a.out, "w") as fh:
            json.dump({"summary": summary, "per_second": per_second}, fh, indent=1)
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
