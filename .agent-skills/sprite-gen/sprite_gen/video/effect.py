# SPDX-License-Identifier: Apache-2.0
"""Emissive effects on black: straight-alpha conversion and generation framing.

RGB on black is already multiplied by its coverage. The maximum channel is the
smallest alpha that can reconstruct every channel without clipping. The shared
black noise floor removes near-zero values; surviving light is not rescaled.
"""
from pathlib import Path
from typing import Any

from PIL import Image

from sprite_gen._deps import np

STATE = "effect"
ALPHA_MODES = ("chroma", "brightness")
BRIGHTNESS_NOISE_FLOOR = 2


def brightness_alpha(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    alpha = rgb.max(axis=2)
    alpha[alpha <= BRIGHTNESS_NOISE_FLOOR] = 0
    color = np.zeros_like(rgb)
    np.divide(rgb * 255, alpha[:, :, None], out=color, where=alpha[:, :, None] > 0)
    return Image.fromarray(np.dstack((np.rint(color), alpha)).astype(np.uint8), "RGBA")


def key_frames(files: list[Path], directory: Path) -> dict[str, Any]:
    from sprite_gen.frames import extract
    if not files:
        raise SystemExit("video-frames: no frames to convert")
    directory.mkdir(parents=True, exist_ok=True)
    rows = []
    for src in files:
        with Image.open(src) as raw:
            image = brightness_alpha(raw)
        image.save(directory / src.name)
        zero = image.getchannel("A").histogram()[0]
        rows.append({"frame": src.name, "alpha_zero_pct": round(100 * zero / (image.width * image.height), 2),
                     "route": "brightness", "specks": 0})
    return {"alpha_mode": "brightness", "brightness_noise_floor": BRIGHTNESS_NOISE_FLOOR,
            "blend": "add", "frames": len(rows), "rows": rows,
            "alpha_zero_pct_min": min(r["alpha_zero_pct"] for r in rows),
            "alpha_zero_pct_max": max(r["alpha_zero_pct"] for r in rows),
            "specks": {"dropped": 0, "frames": 0, "policy": "off"},
            "edge_contacts": [], "edge_policy": "off", "decontam": {"mode": extract.OFF, "applied_frames": 0},
            "warnings": ["Brightness alpha represents emitted light. Dark smoke becomes faint; "
                         "black cannot occlude the scene. Use chroma alpha for opaque smoke."]}


def prompt(character: str | None, motion: str | None) -> str:
    subject = character.strip().rstrip(".") if character else "A luminous game effect"
    if motion is not None and not motion.strip():
        raise SystemExit("video: motion description is empty")
    action = f" {' '.join(motion.split())}" if motion else ""
    return (f"2D game effect animation. {subject}.{action} One complete lifetime: the effect appears, "
            "grows to its brightest peak, decays, and disappears completely. Its origin stays at the center "
            "of the image. A perfectly black background (RGB 0,0,0), no scenery, ground, characters, "
            "text or shadows. Only the effect emits light; sparks, glow and wisps are part of it. "
            "Camera locked, no zoom, no pan, no reframing. End on the supplied empty black frame and "
            "hold complete black with no remaining glow. Perform the effect once.")


def on_black(image: Image.Image) -> Image.Image:
    """Composite emitted light onto an opaque black canvas without changing its frame."""
    rgba = image.convert("RGBA")
    black = Image.new("RGBA", rgba.size, (0, 0, 0, 255))
    return Image.alpha_composite(black, rgba).convert("RGB")


def canvas(image: Image.Image) -> tuple[Image.Image, dict[str, Any]]:
    """Keep the effect's frame and centre; composite transparent artwork onto black."""
    result = on_black(image)
    return result, {"fit": "state", "shape": "source", "canvas": list(result.size), "offset": [0, 0],
                    "key": "black", "key_rgb": [0, 0, 0], "why": "fixed effect origin on black"}


def empty_end(canvas_path: Path, out: Path) -> Path:
    with Image.open(canvas_path) as source:
        blank = Image.new("RGB", source.size, (0, 0, 0))
    blank.save(out)
    return out


def frame_masses(files: list[Path]) -> np.ndarray:
    """Full-resolution emitted coverage; thumbnails can erase a dim isolated spark."""
    values = []
    for path in files:
        with Image.open(path) as image:
            values.append(float(np.asarray(image.convert("RGBA").getchannel("A"), dtype=np.float64).mean() / 255))
    return np.array(values)


def lifetime_ending(D: np.ndarray, masses: np.ndarray, fps: float) -> tuple[int, int, dict[str, Any]]:
    """The same single-play cutter's terminal condition: visible light followed by actual emptiness."""
    active = np.flatnonzero(masses > 0)
    if not len(active):
        raise ValueError("lifetime is entirely empty; no effect appeared")
    if masses[-1] > 0:
        raise ValueError("lifetime has no empty end frame; regenerate with an empty black end-frame pin")
    start, end = max(0, int(active[0]) - 1), int(active[-1]) + 1
    return start, end, {"kind": "empty", "frames": len(masses) - end,
                        "start": end, "peak_frame": int(np.argmax(masses)), "alpha_max": 0}
