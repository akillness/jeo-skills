"""6D rotation representation → rotation matrix conversions.

The 6D representation is from Zhou et al., "On the Continuity of Rotation
Representations in Neural Networks", CVPR 2019
(http://arxiv.org/abs/1812.07035): the first two rows of the rotation matrix,
orthonormalized via Gram-Schmidt on decode.

Convention: rotation matrices act on column vectors via post-multiplication,
i.e. ``transformed_point = R @ point``.
"""

import numpy as np
import torch


# The 6D vector of the identity rotation: what a degenerate 6D vector decodes to.
IDENTITY_6D = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)
# A 6D vector with an axis shorter than this (a zero axis, after the decoder's
# +1e-8), or whose two axes are closer than PARALLEL_TOL (sine of their angle),
# is degenerate.
AXIS_TOL = 1e-6
PARALLEL_TOL = 1e-6


def _gram_schmidt(cont6d: torch.Tensor) -> torch.Tensor:
    x_raw = cont6d[..., 0:3]
    y_raw = cont6d[..., 3:6]
    x = x_raw / torch.linalg.norm(x_raw, dim=-1, keepdims=True)
    z = torch.cross(x, y_raw, dim=-1)
    z = z / torch.linalg.norm(z, dim=-1, keepdims=True)
    y = torch.cross(z, x, dim=-1)
    return torch.cat([x[..., None], y[..., None], z[..., None]], dim=-1)


def _degenerate(cont6d: torch.Tensor) -> torch.Tensor:
    """Rows that do not define a rotation: an axis shorter than ``AXIS_TOL``,
    axes less than ``PARALLEL_TOL`` apart (parallel or antiparallel), or any
    other input whose decode is not finite."""
    x_raw = cont6d[..., 0:3]
    y_raw = cont6d[..., 3:6]
    nx = torch.linalg.norm(x_raw, dim=-1, keepdims=True)
    ny = torch.linalg.norm(y_raw, dim=-1, keepdims=True)
    sine = torch.linalg.norm(torch.cross(x_raw / nx, y_raw / ny, dim=-1), dim=-1)
    finite = torch.isfinite(_gram_schmidt(cont6d)).flatten(-2).all(-1)
    return ~(finite & (nx[..., 0] > AXIS_TOL) & (ny[..., 0] > AXIS_TOL) & (sine > PARALLEL_TOL))


def rotation_6d_to_matrix_safe(cont6d: torch.Tensor) -> torch.Tensor:
    """Convert 6D rotation to matrix with NaN protection and epsilon offset.

    Every component gets +1e-8. A vector with a non-finite component, or one
    that is degenerate (see :func:`_degenerate`) before or after the epsilon
    (zero padding; parallel axes the epsilon would tilt apart), decodes to the
    identity: it is replaced by ``IDENTITY_6D`` before the decode that
    gradients flow through, so a degenerate vector yields no NaN, in the
    result or in its gradient. Every other vector is decoded exactly as
    without the check. Runs outside autocast; half-precision input is decoded
    in float32 and the result cast back (the gradient of a nearly degenerate
    vector, an axis just longer than ``AXIS_TOL``, can still exceed the
    half-precision range).

    Args:
        cont6d: 6D rotation representation (*, 6).

    Returns:
        Rotation matrices (*, 3, 3).
    """
    assert cont6d.shape[-1] == 6, "The last dimension must be 6"
    dtype = cont6d.dtype
    with torch.autocast(device_type=cont6d.device.type, enabled=False):
        if dtype in (torch.float16, torch.bfloat16):
            cont6d = cont6d.float()
        epsilon = 1e-8
        with torch.no_grad():
            degenerate = ~torch.isfinite(cont6d).all(-1) | _degenerate(torch.nan_to_num(cont6d))
        cont6d = torch.nan_to_num(cont6d) + epsilon
        with torch.no_grad():
            degenerate |= _degenerate(cont6d)
        identity = torch.tensor(IDENTITY_6D, dtype=cont6d.dtype, device=cont6d.device)
        cont6d = torch.where(degenerate[..., None], identity, cont6d)
        return _gram_schmidt(cont6d).to(dtype)


def _gram_schmidt_np(cont6d: np.ndarray) -> np.ndarray:
    x_raw = cont6d[..., 0:3]
    y_raw = cont6d[..., 3:6]
    x = x_raw / np.linalg.norm(x_raw, axis=-1, keepdims=True)
    z = np.cross(x, y_raw, axis=-1)
    z = z / np.linalg.norm(z, axis=-1, keepdims=True)
    y = np.cross(z, x, axis=-1)
    return np.concatenate([x[..., None], y[..., None], z[..., None]], axis=-1)


def rotation_6d_to_matrix_np(cont6d: np.ndarray) -> np.ndarray:
    """Convert 6D rotation to matrix (numpy version).

    A vector with a non-finite component, an axis shorter than ``AXIS_TOL``,
    or axes less than ``PARALLEL_TOL`` apart decodes to the identity; every
    other vector is decoded as is, with no epsilon.

    Args:
        cont6d: 6D rotation representation (*, 6).

    Returns:
        Rotation matrices (*, 3, 3).
    """
    assert cont6d.shape[-1] == 6, "The last dimension must be 6"
    with np.errstate(divide='ignore', invalid='ignore', over='ignore'):
        mats = _gram_schmidt_np(cont6d)
        nx = np.linalg.norm(cont6d[..., 0:3], axis=-1, keepdims=True)
        ny = np.linalg.norm(cont6d[..., 3:6], axis=-1, keepdims=True)
        sine = np.linalg.norm(np.cross(cont6d[..., 0:3] / nx, cont6d[..., 3:6] / ny, axis=-1), axis=-1)
        valid = (np.isfinite(cont6d).all(-1) & np.isfinite(mats).reshape(*mats.shape[:-2], 9).all(-1)
                 & (nx[..., 0] > AXIS_TOL) & (ny[..., 0] > AXIS_TOL) & (sine > PARALLEL_TOL))
    if valid.all():
        return mats
    identity = np.asarray(IDENTITY_6D, dtype=mats.dtype)
    return _gram_schmidt_np(np.where(valid[..., None], cont6d, identity))


def matrix_to_quaternion_np(mats: np.ndarray) -> np.ndarray:
    """Convert rotation matrices to unit quaternions (numpy version).

    Shepperd's method with one branch per matrix, chosen by the largest of
    ``|w|, |x|, |y|, |z|``. ``Quaternions.from_transforms`` (Motion library)
    applies every branch whose candidate ties for the largest, so a rotation
    with two equal components (e.g. exactly 90 deg about one axis) comes back
    as a different rotation; use this instead.

    Args:
        mats: Rotation matrices (*, 3, 3).

    Returns:
        Quaternions (*, 4) as ``(w, x, y, z)``, ``w >= 0``.
    """
    m = np.asarray(mats, dtype=np.float64)
    d0, d1, d2 = m[..., 0, 0], m[..., 1, 1], m[..., 2, 2]
    cand = np.stack([1 + d0 + d1 + d2, 1 + d0 - d1 - d2,
                     1 - d0 + d1 - d2, 1 - d0 - d1 + d2], axis=-1)   # 4 * component^2
    branch = np.argmax(cand, axis=-1)
    s = 2.0 * np.sqrt(np.maximum(np.take_along_axis(cand, branch[..., None], -1)[..., 0], 1e-12))
    m21_m12, m02_m20, m10_m01 = m[..., 2, 1] - m[..., 1, 2], m[..., 0, 2] - m[..., 2, 0], m[..., 1, 0] - m[..., 0, 1]
    m21p12, m02p20, m10p01 = m[..., 2, 1] + m[..., 1, 2], m[..., 0, 2] + m[..., 2, 0], m[..., 1, 0] + m[..., 0, 1]
    q = np.where(branch[..., None] == 0, np.stack([s / 4, m21_m12 / s, m02_m20 / s, m10_m01 / s], -1),
        np.where(branch[..., None] == 1, np.stack([m21_m12 / s, s / 4, m10p01 / s, m02p20 / s], -1),
        np.where(branch[..., None] == 2, np.stack([m02_m20 / s, m10p01 / s, s / 4, m21p12 / s], -1),
                 np.stack([m10_m01 / s, m02p20 / s, m21p12 / s, s / 4], -1))))
    q = q / np.linalg.norm(q, axis=-1, keepdims=True)
    return np.where(q[..., :1] < 0, -q, q)
