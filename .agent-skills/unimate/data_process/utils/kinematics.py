"""Forward kinematics for export-stage NPZs (numpy only, no bpy, no Motion).

Quaternions are ``w, x, y, z`` — the order the exporter writes (Blender's
``Matrix.to_quaternion``). Export space is Blender rotated -90 deg about X
(a proper rotation, so handedness is preserved): **Y-up**, ground at the
minimum Y.

Batched over any number of leading axes, so the same call serves one rest
pose ``(J, .)`` and a whole clip ``(T, J, .)``.
"""

from typing import Sequence

import numpy as np


def qmul(a, b):
    """Hamilton product of two ``w, x, y, z`` quaternion arrays."""
    w1, x1, y1, z1 = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    w2, x2, y2, z2 = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
                     w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
                     w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2], -1)


def qrot(q, v):
    """Rotate vectors *v* ``(..., 3)`` by quaternions *q* ``(..., 4)``."""
    qv = np.concatenate([np.zeros(v.shape[:-1] + (1,)), v], -1)
    return qmul(qmul(q, qv), q * np.array([1, -1, -1, -1]))[..., 1:]


def fk(local_pos, local_rot, parents: Sequence[int]) -> np.ndarray:
    """Global joint positions from local positions / rotations and a parent list.

    ``local_pos`` and ``local_rot`` are ``(..., J, 3)`` and ``(..., J, 4)``;
    the result is ``(..., J, 3)``. ``parents[i] < 0`` marks the root.
    """
    local_pos = np.asarray(local_pos, dtype=np.float64)
    local_rot = np.asarray(local_rot, dtype=np.float64)
    parents = np.asarray(parents)
    lead = local_pos.shape[:-2]
    g = np.zeros(lead + local_pos.shape[-2:])
    gr = np.zeros(lead + local_rot.shape[-2:])
    for i in range(len(parents)):
        p = int(parents[i])
        if p < 0:
            g[..., i, :] = local_pos[..., i, :]
            gr[..., i, :] = local_rot[..., i, :]
        else:
            g[..., i, :] = g[..., p, :] + qrot(gr[..., p, :], local_pos[..., i, :])
            gr[..., i, :] = qmul(gr[..., p, :], local_rot[..., i, :])
    return g


def rest_global(d) -> np.ndarray:
    """Global rest-pose joint positions ``(J, 3)`` from a loaded export NPZ."""
    return fk(d['rest_local_pos'], d['rest_local_rot'], d['parents'])


def clip_global(d, max_frames: int = 0) -> np.ndarray:
    """Global joint positions ``(T, J, 3)`` for a whole export clip.

    ``max_frames`` > 0 truncates, which is how callers match
    ``blender_render.MAX_RENDER_FRAMES`` — the range the captioner actually saw.
    """
    pos, rot = d['anim_local_pos'], d['anim_local_rot']
    if max_frames and len(pos) > max_frames:
        pos, rot = pos[:max_frames], rot[:max_frames]
    return fk(pos, rot, d['parents'])


def frame_global(d, t: int = 0) -> np.ndarray:
    """Global joint positions ``(J, 3)`` at a single frame of an export clip."""
    return fk(d['anim_local_pos'][t], d['anim_local_rot'][t], d['parents'])
