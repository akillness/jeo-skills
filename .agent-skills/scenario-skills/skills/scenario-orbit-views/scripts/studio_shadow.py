"""No-background frame: the cutout of a repainted view laid over the real cast shadow of the same camera.

The shadow comes from clay_<key>.png (render_grounded.py): semi-transparent pixels
are shadow, opaque pixels are the clay body. The body is removed with a margin so no
clay outline shows around the painted cutout, the shadow is softened and faded near
the frame edge, and the cutout's edge pixels are defringed so background color does
not travel with it. It then prints how much of the clay body the cutout covers, how
much of the cutout lies outside it, and whether the frame corners are transparent.

  python3 studio_shadow.py clay_00.png cut_00.png out_00.png [--size 1024] [--strength 0.55]
"""
import sys

import numpy as np
from PIL import Image, ImageFilter


def defringe(cut, radius=6):
    """Recolor semi-transparent edge pixels with color bled from the opaque interior."""
    arr = np.asarray(cut.convert("RGBA"), dtype=np.float32)
    a = arr[..., 3] / 255
    solid = (a > 0.95).astype(np.float32)
    acc = np.zeros_like(arr[..., :3])
    weight = np.zeros_like(a)
    pre = Image.fromarray((arr[..., :3] * solid[..., None]).clip(0, 255).astype(np.uint8))
    msk = Image.fromarray((solid * 255).astype(np.uint8))
    for r in (2, radius, radius * 3):
        acc += np.asarray(pre.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32)
        weight += np.asarray(msk.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255
    bled = acc / np.maximum(weight[..., None], 1e-3)
    edge = ((a > 0.01) & (a <= 0.95))[..., None]
    rgb = np.where(edge, bled, arr[..., :3])
    return Image.fromarray(np.dstack([rgb, arr[..., 3]]).clip(0, 255).astype(np.uint8), "RGBA")


def shadow_alpha(clay, size, cut_alpha=None):
    """Shadow opacity (0..1) from a clay pass: body removed with a margin, restored under the cutout."""
    a = np.asarray(clay.convert("RGBA").resize((size, size), Image.LANCZOS), dtype=np.float32)[..., 3] / 255
    body = Image.fromarray(((a > 0.9) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))
    sh = np.where(np.asarray(body) > 0, 0.0, np.where(a < 0.9, a, 0.0))
    if cut_alpha is not None:  # keep contact shadow under the subject; the cutout covers it
        sh = np.maximum(sh, np.where(cut_alpha > 0.5, a * (a < 0.9), 0))
    return sh


def cutout_check(clay, cut_alpha):
    """(share of the clay body the cutout covers, share of the cutout outside the body, max corner alpha)."""
    size = cut_alpha.shape[0]
    a = np.asarray(clay.convert("RGBA").resize((size, size), Image.LANCZOS), dtype=np.float32)[..., 3] / 255
    body = Image.fromarray(((a > 0.9) * 255).astype(np.uint8))
    core = np.asarray(body.filter(ImageFilter.MinFilter(9))) > 0
    halo = np.asarray(body.filter(ImageFilter.MaxFilter(25))) > 0
    fg = cut_alpha > 0.5
    k = max(1, size // 64)
    corners = max(cut_alpha[:k, :k].max(), cut_alpha[:k, -k:].max(), cut_alpha[-k:, :k].max(), cut_alpha[-k:, -k:].max())
    return float((fg & core).sum() / max(core.sum(), 1)), float((fg & ~halo).sum() / max(fg.sum(), 1)), float(corners)


def studio_rgba(clay_path, cut_path, size=1024, strength=0.55, color=(34, 26, 18)):
    cut = defringe(Image.open(cut_path).convert("RGBA").resize((size, size), Image.LANCZOS))
    ca = np.asarray(cut, dtype=np.float32)[..., 3] / 255
    sh = shadow_alpha(Image.open(clay_path), size, ca)
    sh_img = Image.fromarray((np.clip(sh, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
    sh = np.asarray(sh_img, dtype=np.float32) / 255
    y, x = np.mgrid[0:size, 0:size] / (size - 1)
    edge = np.clip(np.minimum.reduce([x, 1 - x, y, 1 - y]) / 0.12, 0, 1)
    out = np.zeros((size, size, 4), np.uint8)
    out[..., :3] = color
    out[..., 3] = (sh * edge * strength * 255).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    im.alpha_composite(cut)
    return im


def main(argv):
    if len(argv) < 3:
        raise SystemExit(__doc__)
    size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 1024
    strength = float(argv[argv.index("--strength") + 1]) if "--strength" in argv else 0.55
    studio_rgba(argv[0], argv[1], size, strength).save(argv[2])
    cut = Image.open(argv[1]).convert("RGBA").resize((size, size), Image.LANCZOS)
    covered, outside, corner = cutout_check(Image.open(argv[0]), np.asarray(cut, dtype=np.float32)[..., 3] / 255)
    corners = "clear" if corner < 0.05 else "OPAQUE"
    print(f"wrote {argv[2]}: covers {covered:.0%} of the clay body, {outside:.0%} outside it, corners {corners}")


if __name__ == "__main__":
    main(sys.argv[1:])
