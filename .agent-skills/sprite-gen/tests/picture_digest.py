# SPDX-License-Identifier: Apache-2.0
"""The digest of pictures as decoded, for a pin that holds on every machine the lanes run on.

A file's bytes are its encoder's: the same pixels are other PNG bytes on Linux than on macOS (its zlib), so the
sha256 of a file pinned on one fails on the other with nothing changed. `picture_digest` reads every frame of the
files decoded to RGBA, with each frame's size and how many there are. A lossy file (a JPEG, a lossy WebP) can decode
to other pixels on another build of its decoder: compare it with its counterpart made in the same run instead of
pinning it (docs/release.md).
"""
from __future__ import annotations

import hashlib
from collections.abc import Iterable
from pathlib import Path

from PIL import Image, ImageSequence


def picture_digest(paths: Iterable[Path]) -> str:
    frames = []
    for path in paths:
        with Image.open(path) as im:
            # Each frame converted while the file is seeked to it: a list of the iterator's frames is one image, the
            # last frame, n times.
            frames += [(f.size, f.tobytes()) for f in (frame.convert("RGBA") for frame in ImageSequence.Iterator(im))]
    digest = hashlib.sha256(f"{len(frames)}".encode())
    for size, data in frames:
        digest.update(f"{size}".encode())
        digest.update(data)
    return digest.hexdigest()
