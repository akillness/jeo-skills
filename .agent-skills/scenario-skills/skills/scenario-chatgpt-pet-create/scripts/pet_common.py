"""Layout facts and pixel helpers shared by the ChatGPT pet scripts. Not run directly."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

CELL_W, CELL_H, COLUMNS = 192, 208, 8
MARGIN = 5
SHEET_SIZES = {1: (1536, 1872), 2: (1536, 2288)}
MAX_BYTES = 20 * 1024 * 1024
VISIBLE = 16  # alpha above this counts as sprite

# Sheet order: (job id, frame count, preview durations in ms). Row index is the position.
ROWS = [
    ("idle", 6, [280, 110, 110, 140, 140, 320]),
    ("running-right", 8, [120] * 7 + [220]),
    ("running-left", 8, [120] * 7 + [220]),
    ("waving", 4, [140] * 3 + [280]),
    ("jumping", 5, [140] * 4 + [280]),
    ("failed", 8, [140] * 7 + [240]),
    ("waiting", 6, [150] * 5 + [260]),
    ("running", 6, [120] * 5 + [220]),
    ("review", 6, [150] * 5 + [280]),
    ("look-9", 8, [140] * 8),
    ("look-10", 8, [140] * 8),
]
STANDARD = [job for job, _, _ in ROWS[:9]]
# Look directions in screen coordinates, clockwise from up; rows 9 and 10 in this order.
LOOK_LABELS = ["000", "022.5", "045", "067.5", "090", "112.5", "135", "157.5"]
LOOK_LABELS += ["180", "202.5", "225", "247.5", "270", "292.5", "315", "337.5"]
EXPECTED = dict(
    zip(
        LOOK_LABELS,
        ["up", *["up-right"] * 3, "right", *["down-right"] * 3]
        + ["down", *["down-left"] * 3, "left", *["up-left"] * 3],
    )
)
CARDINALS = ("000", "090", "180", "270")
# The frame that shows the pet at full height. The row prompts make jumping end,
# and failed start, in the idle stance; every other row is upright throughout.
HEIGHT_FRAME = {"jumping": -1, "failed": 0}

KEY_CANDIDATES = [
    ("magenta", (255, 0, 255)),
    ("cyan", (0, 255, 255)),
    ("yellow", (255, 255, 0)),
    ("blue", (0, 0, 255)),
    ("orange", (255, 127, 0)),
    ("green", (0, 255, 0)),
]


class PetError(Exception):
    """A problem the agent has to fix: reported as JSON, exit code 1."""


def fail(message: str):
    raise SystemExit(f"error: {message}")


def rows_for(version: int) -> list:
    return ROWS[:9] if version == 1 else ROWS


def row_index(job: str) -> int:
    for index, (name, _, _) in enumerate(ROWS):
        if name == job:
            return index
    raise KeyError(job)


def frame_count(job: str) -> int:
    return ROWS[row_index(job)][1]


def version_for_size(width: int, height: int):
    for version, size in SHEET_SIZES.items():
        if size == (width, height):
            return version
    return None


def reference_height(job: str, heights) -> float:
    if job in HEIGHT_FRAME:
        return float(heights[HEIGHT_FRAME[job]])
    return float(np.median(heights))


def parse_key(text: str) -> tuple:
    value = text.strip()
    if len(value) != 7 or not value.startswith("#"):
        raise ValueError(f"expected #RRGGBB, got {text!r}")
    return tuple(int(value[i : i + 2], 16) for i in (1, 3, 5))


def key_hex(rgb) -> str:
    return "#%02X%02X%02X" % tuple(int(c) for c in rgb)


def load_rgba(path) -> np.ndarray:
    with Image.open(path) as image:
        return np.array(image.convert("RGBA"))


def save_png(arr: np.ndarray, path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.ascontiguousarray(arr)).save(path, "PNG")


def save_webp(arr: np.ndarray, path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.ascontiguousarray(arr)).save(
        path, "WEBP", lossless=True, quality=100, method=6, exact=True
    )


def read_json(path):
    return json.loads(Path(path).read_text())


def write_json(path, data) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, indent=2) + "\n")


def cell(arr: np.ndarray, row: int, col: int) -> np.ndarray:
    return arr[row * CELL_H : (row + 1) * CELL_H, col * CELL_W : (col + 1) * CELL_W]


def key_distance(arr: np.ndarray, key) -> np.ndarray:
    rgb = arr[..., :3].astype(np.float32)
    return np.sqrt(((rgb - np.asarray(key, np.float32)) ** 2).sum(-1))


def to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def key_like(rgb: np.ndarray, key, tolerance: float = 0.15, min_saturation: float = 0.1) -> np.ndarray:
    """Colors carrying the key's hue (a dark or light blend with it), compared in linear light."""
    lin = to_linear(np.asarray(rgb, np.float64) / 255)
    key_lin = to_linear(np.asarray(key, np.float64) / 255)
    top, bottom = lin.max(-1), lin.min(-1)
    saturation = (top - bottom) / np.maximum(top, 1e-6)
    centered = lin - lin.mean(-1, keepdims=True)
    key_centered = key_lin - key_lin.mean()
    norms = np.linalg.norm(centered, axis=-1) * np.linalg.norm(key_centered)
    similarity = np.where(norms > 1e-9, (centered @ key_centered) / np.maximum(norms, 1e-9), -1.0)
    return (saturation >= min_saturation) & (similarity >= 1 - tolerance)


def remove_key(arr: np.ndarray, key, threshold: float = 96.0) -> np.ndarray:
    out = arr.copy()
    out[key_distance(arr, key) <= threshold] = 0
    return out


def clear_transparent_rgb(arr: np.ndarray) -> np.ndarray:
    out = arr.copy()
    out[out[..., 3] == 0] = 0
    return out


def on_key(arr: np.ndarray, key, pad: int = 0) -> np.ndarray:
    """Composite a sprite over a flat key-colored canvas, padded on every side."""
    height, width = arr.shape[:2]
    canvas = np.empty((height + 2 * pad, width + 2 * pad, 4), np.uint8)
    canvas[..., :3] = key
    canvas[..., 3] = 255
    alpha = arr[..., 3:4].astype(np.float32) / 255
    region = canvas[pad : pad + height, pad : pad + width, :3].astype(np.float32)
    blended = arr[..., :3] * alpha + region * (1 - alpha)
    canvas[pad : pad + height, pad : pad + width, :3] = blended.round().astype(np.uint8)
    return canvas


def visible(arr: np.ndarray) -> np.ndarray:
    return arr[..., 3] > VISIBLE


def bbox(mask: np.ndarray):
    ys, xs = np.nonzero(mask)
    if not len(ys):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def anchor_x(mask: np.ndarray) -> float:
    """Mean x of the lowest 28% of the sprite: the planted part that should not drift."""
    ys, xs = np.nonzero(mask)
    top, bottom = ys.min(), ys.max() + 1
    band = ys >= top + 0.72 * (bottom - top)
    return float(xs[band].mean())


def shift(arr: np.ndarray, dy: int, dx: int) -> np.ndarray:
    """out[y, x] = arr[y + dy, x + dx], zero outside."""
    out = np.zeros_like(arr)
    height, width = arr.shape[:2]
    out[max(-dy, 0) : height - max(dy, 0), max(-dx, 0) : width - max(dx, 0)] = arr[
        max(dy, 0) : height - max(-dy, 0), max(dx, 0) : width - max(-dx, 0)
    ]
    return out


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    """True within Chebyshev distance `radius` of a True pixel."""
    rows = mask.copy()
    for d in range(1, radius + 1):
        rows |= shift(mask, 0, d) | shift(mask, 0, -d)
    out = rows.copy()
    for d in range(1, radius + 1):
        out |= shift(rows, d, 0) | shift(rows, -d, 0)
    return out


def label(mask: np.ndarray):
    """4-connected components of a boolean mask, by row runs: (int32 labels, count)."""
    height, width = mask.shape
    parent: list = []

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    runs = []
    previous: list = []
    for y in range(height):
        row = mask[y]
        if not row.any():
            previous = []
            continue
        edges = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
        starts = np.flatnonzero(edges == 1).tolist()
        ends = np.flatnonzero(edges == -1).tolist()
        current = []
        j = 0
        for start, end in zip(starts, ends):
            run_id = len(parent)
            parent.append(run_id)
            while j < len(previous) and previous[j][1] <= start:
                j += 1
            k = j
            while k < len(previous) and previous[k][0] < end:
                a, b = find(run_id), find(previous[k][2])
                if a != b:
                    parent[max(a, b)] = min(a, b)
                k += 1
            current.append((start, end, run_id))
            runs.append((y, start, end, run_id))
        previous = current
    labels = np.zeros((height, width), np.int32)
    compact: dict = {}
    for y, start, end, run_id in runs:
        root = find(run_id)
        if root not in compact:
            compact[root] = len(compact) + 1
        labels[y, start:end] = compact[root]
    return labels, len(compact)


def components(mask: np.ndarray):
    """Labels plus one record per component: id, area, box (x0, y0, x1, y1)."""
    labels, count = label(mask)
    if not count:
        return labels, []
    ys, xs = np.nonzero(labels)
    ids = labels[ys, xs]
    area = np.bincount(ids, minlength=count + 1)
    big = np.iinfo(np.int64).max
    x0 = np.full(count + 1, big, np.int64)
    y0 = np.full(count + 1, big, np.int64)
    x1 = np.zeros(count + 1, np.int64)
    y1 = np.zeros(count + 1, np.int64)
    np.minimum.at(x0, ids, xs)
    np.minimum.at(y0, ids, ys)
    np.maximum.at(x1, ids, xs + 1)
    np.maximum.at(y1, ids, ys + 1)
    return labels, [
        {"id": i, "area": int(area[i]), "box": (int(x0[i]), int(y0[i]), int(x1[i]), int(y1[i]))}
        for i in range(1, count + 1)
    ]


def sample_pixels(arr: np.ndarray, side: int = 128) -> np.ndarray:
    image = Image.fromarray(np.ascontiguousarray(arr))
    image.thumbnail((side, side), Image.Resampling.LANCZOS)
    small = np.array(image)
    return small[small[..., 3] > VISIBLE][:, :3]


def choose_key(pixels: np.ndarray):
    """The candidate key farthest from the pet: best distance at the pet's 1st percentile."""
    px = pixels.reshape(-1, 3).astype(np.float32)
    not_white = ~(px > 244).all(axis=1)
    if not_white.any():
        px = px[not_white]
    if not len(px):
        return KEY_CANDIDATES[0][0], KEY_CANDIDATES[0][1], 0.0
    best = None
    for name, rgb in KEY_CANDIDATES:
        distances = np.sort(np.sqrt(((px - np.asarray(rgb, np.float32)) ** 2).sum(1)))
        score = float(distances[int(len(distances) * 0.01)])
        if best is None or score > best[2]:
            best = (name, rgb, round(score, 2))
    return best
