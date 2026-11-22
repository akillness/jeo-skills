#!/usr/bin/env python3
"""Measure color statistics for a "match to reference" look (Reinhard color transfer).

  python3 match.py <source video|image> <reference image> <out_stats.json> [--crop w:h:x:y]

Compares the source's average color and contrast (CIE Lab mean + spread) with the
reference image's and saves both. A look then uses {"op": "match", "stats": "<path>"}.
The transfer is a fixed per-color function, so it bakes into an ordinary LUT.
Re-run it whenever the source changes (the stats describe the source too).
--crop removes borders, titles or UI from the reference before measuring.
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

import grade
import media


def stats(rgb):
    lab = grade.rgb_to_lab(rgb)
    return lab.mean(0).tolist(), lab.std(0).tolist()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("reference")
    ap.add_argument("out")
    ap.add_argument("--crop", default=None)
    ap.add_argument("--force", action="store_true", help="overwrite an existing stats file")
    a = ap.parse_args()
    if Path(a.out).exists() and not a.force:
        ap.error(f"refusing to overwrite {a.out} (pass --force)")

    info = media.probe(a.source)
    W, H = info["w"], info["h"]
    step = max(1, info["frames"] // 24)
    samples = [rgb.reshape(H, W, 3)[::4, ::4].reshape(-1, 3)
               for i, rgb in enumerate(media.frames(a.source, W, H)) if i % step == 0]
    src_mean, src_std = stats(np.concatenate(samples))

    ref = Path(a.reference)
    if a.crop:
        tmp = Path(tempfile.mkdtemp()) / "ref.png"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(ref), "-vf", f"crop={a.crop}", str(tmp)], check=True)
        ref = tmp
    px = np.asarray(Image.open(ref).convert("RGB"), np.float64).reshape(-1, 3) / 255.0
    ref_mean, ref_std = stats(px[:: max(1, len(px) // 400000)])

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps({"reference": Path(a.reference).name, "src_mean": src_mean, "src_std": src_std,
                                       "ref_mean": ref_mean, "ref_std": ref_std}, indent=2), encoding="utf-8")
    print(f"source Lab mean {np.round(src_mean, 1)} std {np.round(src_std, 1)}")
    print(f"ref    Lab mean {np.round(ref_mean, 1)} std {np.round(ref_std, 1)}")
    print("wrote", a.out)


if __name__ == "__main__":
    main()
