"""Motion expansion: chain text-conditioned generations into a long motion.

Given a list of N text prompts and a target skeleton, generate:

  * ``seg_1``: free generation under ``prompt_1`` (no GT clamp).
  * ``seg_i`` for ``i in [2, N]``: replacement-style sampling under
    ``prompt_i`` with ``x1_known[:, :, :, :overlap] = seg_{i-1}[:, :, :, -overlap:]``
    and a ``(B, 1, 1, T)`` keep_mask True for the first ``overlap`` frames.

The concatenated output stitches segments at the overlap seam:

  ``chain = [seg_1, seg_2[overlap:], seg_3[overlap:], ..., seg_N[overlap:]]``

so the seam frames appear once and motion continuity is enforced by the
flow ODE's clamping (same machinery as in-betweening — only the mask
construction differs).

The model only ever saw windows whose frame 0 faces +Z (stage-4
canonicalization, ``realign_unimate_clip`` after a crop). The tail of a
segment that turned does not, so each seed is re-aligned to its own frame 0
before sampling, and the new segment is rotated back into the chain's frame
afterwards. RIFKE positions and local velocities live in the per-frame
facing frame, so only the rotation channels change and the trajectory stays
continuous across the seam.

Total length: ``max_T + (max_T - overlap) * (N - 1)``.
"""

from typing import List

import numpy as np
import torch
from Quaternions import Quaternions

from unimate.utils.logger import get_logger
from unimate.utils.motion_utils import rotate_unimate_facing
from unimate.utils.rotation_conversions import matrix_to_quaternion_np, rotation_6d_to_matrix_np
from unimate.inference.generate import generate_samples

logger = get_logger(file_name=__file__)


# ---------------------------------------------------------------------------
# Mask + seed helpers
# ---------------------------------------------------------------------------


def build_overlap_keep_mask(
    batch_size: int, overlap: int, max_T: int, device: torch.device,
) -> torch.Tensor:
    """``(B, 1, 1, T)`` bool mask: True for the first ``overlap`` frames.

    Broadcasts uniformly over the joint and feature axes — same shape
    convention as :func:`unimate.inference.motion_inbetweening.build_keep_mask`, so the
    shared ``inbetween_sample_ode`` clamps without per-axis logic.
    """
    mask = torch.zeros((batch_size, 1, 1, max_T), dtype=torch.bool, device=device)
    mask[:, :, :, :overlap] = True
    return mask


def seed_expansion_x1(
    prev_seq: torch.Tensor, overlap: int, motion_shape, device: torch.device,
) -> torch.Tensor:
    """Build ``x1_known`` for the next segment.

    Frames ``[0, overlap)`` are copied from ``prev_seq[..., -overlap:]``;
    the remaining slots are zero. Only the kept slice is read by the
    sampler, so the zero tail is inert.
    """
    x1 = torch.zeros(motion_shape, device=device)
    x1[:, :, :, :overlap] = prev_seq[:, :, :, -overlap:]
    return x1


# Normalized channels whose std is below this are constant by construction
# (root X/Z and the yaw-only facing's fixed 6-D entries; their std is floored
# at 1e-8). Facing rotations leave them unchanged, and renormalizing them
# would only amplify float error, so they keep their normalized values.
_CONST_STD = 1e-6


def rotate_segment_facing(seq, cond, q_per_sample):
    """Apply :func:`rotate_unimate_facing` to every sample of a batch.

    Args:
        seq: normalized motion ``(B, J, D, T)``.
        cond: conditioning dict with ``mean`` / ``std`` ``(B, J, D)``,
            ``n_joints`` ``(B,)`` and ``parents`` (list of ``(J_i,)``).
        q_per_sample: one single-element ``Quaternions`` per sample.

    Returns:
        Normalized ``(B, J, D, T)`` motion with the rotated facing; padded
        joints are left untouched.
    """
    out = seq.clone()
    for b, q in enumerate(q_per_sample):
        nj = int(cond['n_joints'][b])
        mean = cond['mean'][b, :nj].double().cpu().numpy()[None]   # (1, J, D)
        std = cond['std'][b, :nj].double().cpu().numpy()[None]
        norm = seq[b, :nj].double().cpu().numpy().transpose(2, 0, 1)  # (T, J, D)
        rotated = rotate_unimate_facing(norm * std + mean, cond['parents'][b], q)
        renorm = np.where(std < _CONST_STD, norm, (rotated - mean) / std)
        out[b, :nj] = torch.from_numpy(renorm.transpose(1, 2, 0)).to(seq)
    return out


def first_frame_facing(seq, cond):
    """Frame-0 root facing of each sample of a normalized ``(B, J, D, T)`` batch."""
    root_6d = seq[:, 0, 3:9, 0].double() * cond['std'][:, 0, 3:9].double() \
        + cond['mean'][:, 0, 3:9].double()                          # (B, 6)
    mats = rotation_6d_to_matrix_np(root_6d.cpu().numpy())
    return [Quaternions(matrix_to_quaternion_np(m[None]))[0] for m in mats]


# ---------------------------------------------------------------------------
# Chain generation
# ---------------------------------------------------------------------------


def expand_motion_chain(
    cond_per_segment: List[dict],
    motion_shape,
    overlap: int,
    sample_model,
    diff_model: str,
    diffusion,
    gen_diffusion,
    cfg_scale: float,
    device: torch.device,
) -> torch.Tensor:
    """Generate a chain of motion segments and concatenate at the seam.

    Args:
        cond_per_segment: per-segment conditioning dicts (already on
            device). All entries must share the same skeleton fields
            (``tpos_first_frame``, ``parents``, ``mean``/``std``, etc.) —
            only ``caption_emb`` (and ``caption`` for logging) should
            differ across entries.
        motion_shape: ``(B, J, D, max_T)`` for each segment generation.
        overlap: number of frames pinned between consecutive segments.
            Must be in ``(0, max_T)``.
        sample_model: denoising network. CFG-wrapping handled inside
            ``generate_samples`` based on ``cfg_scale``.
        diff_model, diffusion, gen_diffusion, cfg_scale, device: forwarded
            to ``generate_samples``.

    Returns:
        ``(B, J, D, T_total)`` concatenated chain, where
        ``T_total = max_T + (max_T - overlap) * (N - 1)``.
    """
    max_T = motion_shape[3]
    if overlap <= 0 or overlap >= max_T:
        raise ValueError(
            f"overlap must be in (0, max_T={max_T}), got {overlap}."
        )
    if not cond_per_segment:
        raise ValueError("cond_per_segment is empty — need at least one prompt.")

    segments: List[torch.Tensor] = []
    prev_seq = None
    for i, cond in enumerate(cond_per_segment):
        if prev_seq is None:
            x1_known = None
            keep_mask = None
            q_seed = None
        else:
            # Seed in the frame the model was trained on: the tail's own
            # frame 0 faces +Z.
            tail = prev_seq[:, :, :, -overlap:]
            q_seed = first_frame_facing(tail, cond)
            tail = rotate_segment_facing(tail, cond, q_seed)
            x1_known = seed_expansion_x1(tail, overlap, motion_shape, device)
            keep_mask = build_overlap_keep_mask(
                motion_shape[0], overlap, max_T, device,
            )

        sample = generate_samples(
            model=sample_model,
            cond=cond,
            motion_shape=motion_shape,
            diff_model=diff_model,
            diffusion=diffusion,
            gen_diffusion=gen_diffusion,
            device=device,
            cfg_scale=cfg_scale,
            x1_known=x1_known,
            keep_mask=keep_mask,
        )
        if q_seed is not None:
            # Back into the chain's frame; the pinned overlap then reproduces
            # the previous segment's tail.
            sample = rotate_segment_facing(sample, cond, [-q for q in q_seed])
        segments.append(sample)
        prev_seq = sample
        logger.info(
            f"motion_expansion: segment {i + 1}/{len(cond_per_segment)} done "
            f"(T={sample.shape[-1]})."
        )

    parts = [segments[0]]
    for seg in segments[1:]:
        parts.append(seg[:, :, :, overlap:])
    chain = torch.cat(parts, dim=-1)
    logger.info(
        f"motion_expand: chained {len(segments)} segments → total T={chain.shape[-1]}."
    )
    return chain
