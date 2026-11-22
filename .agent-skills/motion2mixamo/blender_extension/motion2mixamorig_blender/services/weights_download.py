"""First-run model download: bytes on disk, speed, and time left. No Blender imports.

`m2mr run` downloads its checkpoints into <project>/weights/ on the first run.
Hugging Face downloads grow as `.incomplete` files under weights/.cache/ and are
renamed into place when done, so summing both never counts a file twice.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path

# Relative path under weights/ -> size in bytes.
EXPECTED_WEIGHTS = {
    "gvhmr/gvhmr_siga24_release.ckpt": 163_508_011,
    "hmr2/epoch=10-step=25000.ckpt": 2_709_494_041,
    "vitpose/vitpose-h-multi-coco.pth": 2_549_075_546,
    "yolo/yolov8x.pt": 136_867_539,
}
TOTAL_BYTES = sum(EXPECTED_WEIGHTS.values())

_WINDOW_S = 15.0
_MIN_SPAN_S = 2.0


def weights_dir(project_dir: str | Path) -> Path:
    return Path(project_dir) / "weights"


def downloaded_bytes(weights: Path) -> int:
    done = 0
    for rel, size in EXPECTED_WEIGHTS.items():
        try:
            done += min(size, (weights / rel).stat().st_size)
        except OSError:
            pass
    for partial in (weights / ".cache").glob("**/*.incomplete"):
        try:
            done += partial.stat().st_size
        except OSError:
            pass
    return min(done, TOTAL_BYTES)


def weights_complete(weights: Path) -> bool:
    for rel, size in EXPECTED_WEIGHTS.items():
        try:
            if (weights / rel).stat().st_size < size:
                return False
        except OSError:
            return False
    return True


@dataclass
class DownloadSnapshot:
    done: int
    total: int
    rate: float  # bytes/s over the recent window; 0 until measurable
    eta_s: float  # -1 when unknown


class DownloadTracker:
    """Samples the weights folder; speed is averaged over the last ~15 s so the ETA doesn't jump."""

    def __init__(self, weights: Path) -> None:
        self.weights = weights
        self._samples: deque[tuple[float, int]] = deque()

    def sample(self, now: float | None = None) -> DownloadSnapshot:
        now = time.monotonic() if now is None else now
        done = downloaded_bytes(self.weights)
        self._samples.append((now, done))
        while self._samples and now - self._samples[0][0] > _WINDOW_S:
            self._samples.popleft()
        rate = 0.0
        t0, b0 = self._samples[0]
        if now - t0 >= _MIN_SPAN_S and done > b0:
            rate = (done - b0) / (now - t0)
        eta = (TOTAL_BYTES - done) / rate if rate > 0 else -1.0
        return DownloadSnapshot(done=done, total=TOTAL_BYTES, rate=rate, eta_s=eta)
