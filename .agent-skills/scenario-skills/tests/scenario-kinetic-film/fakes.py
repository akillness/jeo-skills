"""A stand-in `node` for the Python suites, so render, mix and finish run in CI with no browser.

It answers the two scripts the Python side calls:
- render.mjs <dsf> <f0> <f1>: frames in render.mjs's stream format, two JPEG samples each (black, white),
  so a blended frame is mid gray; FAKE_NODE_FRAMES caps how many frames it sends.
- info.mjs: prints FAKE_NODE_INFO (JSON) and exits 0, or prints FAKE_NODE_ERROR to stderr and exits 1.
Every call is logged as a JSON line to FAKE_NODE_LOG when set.
"""

import os
import sys
from pathlib import Path

SCRIPT = r'''#!{python}
import json, os, struct, sys
import cv2
import numpy as np

args = sys.argv[1:]
if os.environ.get("FAKE_NODE_LOG"):
    with open(os.environ["FAKE_NODE_LOG"], "a") as log:
        log.write(json.dumps({{"args": args, "film_url": os.environ.get("FILM_URL"), "film_dir": os.environ.get("FILM_DIR")}}) + "\n")
script = os.path.basename(args[0]) if args else ""
if script == "info.mjs":
    if os.environ.get("FAKE_NODE_ERROR"):
        sys.stderr.write(os.environ["FAKE_NODE_ERROR"] + "\n")
        sys.exit(1)
    sys.stderr.write("warning: a test warning\n")
    print(os.environ["FAKE_NODE_INFO"])
    sys.exit(0)
if script == "render.mjs":
    dsf, f0, f1 = float(args[1]), int(args[2]), int(args[3])
    w, h = int(1920 * dsf), int(1080 * dsf)
    cap = int(os.environ.get("FAKE_NODE_FRAMES", "1000000"))
    samples = [cv2.imencode(".jpg", np.full((h, w, 3), v, np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 100])[1].tobytes() for v in (0, 255)]
    out = sys.stdout.buffer
    for k in range(f0, min(f1, f0 + cap)):
        out.write(struct.pack("<II", k, len(samples)))
        for s in samples:
            out.write(struct.pack("<I", len(s)) + s)
    out.flush()
    sys.exit(0)
sys.exit(f"fake node: unexpected arguments {{args}}")
'''


def install(bin_dir):
    """Write the fake node into bin_dir; return an env with it first on PATH."""
    bin_dir = Path(bin_dir)
    bin_dir.mkdir(parents=True, exist_ok=True)
    node = bin_dir / "node"
    node.write_text(SCRIPT.format(python=sys.executable))
    node.chmod(0o755)
    return {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
