"""``preview.png`` of a processed asset: what the model will be told (bpy-free).

Three panels of the cond's canonical T-pose (Y-up, facing +Z, grounded):

- an oblique view with the facing pair (red: right / head, blue: left / tail)
  and the forward direction the model generates toward (grey arrow, +Z);
- the same from the front (looking along -Z): the asset's face or chest should
  be the side shown here, its right side on the image's left;
- every joint with its cleaned label, the names the model embeds.

The two most likely errors on an unseen rig, a wrong facing and wrong joint
labels, are visible at a glance here and invisible in ``cond.npy``.
"""

import imageio
import numpy as np

from data_process.utils.plotting import (
    render_skeleton_tpose_annotated,
    render_skeleton_tpose_facing,
)

PANEL_FIGSIZE = (5.5, 5.5)
PANEL_DPI = 110
# matplotlib camera looking at the asset's front: the plot shows world -Z as
# its +Y axis (plotting._maybe_rotate_y_up), so azimuth -90 looks along -Z.
FRONT_AZIM, FRONT_ELEV = -90, 8


def _fit_height(img, height):
    """Pad *img* (H, W, 3) with white rows to *height* (centred)."""
    if img.shape[0] >= height:
        return img[:height]
    pad = height - img.shape[0]
    top = np.full((pad // 2, img.shape[1], 3), 255, dtype=img.dtype)
    bottom = np.full((pad - pad // 2, img.shape[1], 3), 255, dtype=img.dtype)
    return np.concatenate([top, img, bottom], axis=0)


def render_preview(cond, name, out_path, notes=()):
    """Write the three-panel preview of cond entry *cond* to *out_path*."""
    parents = np.asarray(cond['parents'])
    pos = np.asarray(cond['tpos_first_frame'], dtype=np.float32)
    clean = cond.get('clean_joint_names')
    labels = [str(n) for n in (cond['joint_names'] if clean is None or len(clean) == 0
                               else clean)]
    face = cond.get('face_joint_idxs') or {}
    pair = [int(face.get('r_hip', -1)), int(face.get('l_hip', -1))]
    pair_txt = ('facing pair: {} / {}{}'.format(labels[pair[0]], labels[pair[1]],
                                                '  (head / tail axis)' if face.get('body_axis') else '')
                if min(pair) >= 0 else 'facing pair: none (the asset keeps its authored facing)')
    head = f'{name}: {len(labels)} joints\n{pair_txt}'
    if notes:
        head += '\n' + '\n'.join(notes)
    forward = np.array([0.0, 0.0, 1.0])
    oblique = render_skeleton_tpose_facing(
        parents, pos, pair, target_forward=forward,
        title=head + '\ngrey arrow: forward (+Z), where the model moves the asset',
        figsize=PANEL_FIGSIZE, dpi=PANEL_DPI)
    front = render_skeleton_tpose_facing(
        parents, pos, pair, elev=FRONT_ELEV, azim=FRONT_AZIM,
        title=f'{name}: front view (looking along -Z)\nthe face / chest should be this side, '
              f'right on the image left',
        figsize=PANEL_FIGSIZE, dpi=PANEL_DPI)
    labelled = render_skeleton_tpose_annotated(
        parents, pos, labels, figsize=(PANEL_FIGSIZE[0] * 1.4, PANEL_FIGSIZE[1] * 1.4),
        dpi=PANEL_DPI)
    height = max(p.shape[0] for p in (oblique, front, labelled))
    image = np.concatenate([_fit_height(p, height) for p in (oblique, front, labelled)], axis=1)
    imageio.imwrite(out_path, image)
    return out_path
