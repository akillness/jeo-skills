"""Compare a ``rig_preprocess`` output with the dataset's copy of the asset (bpy-free).

For an asset that is also training data, both deliverables are checked:

- ``cond.npy`` against the stage-4 cond entry, field by field, and
- ``<name>.glb`` against the canonical GLB: joints, skinned rest triangles and
  the dominant joint of every vertex.

A cond can differ from the dataset's without describing a different skeleton.
These differences are tolerated and listed under ``notes``; anything else is a
``difference``:

- joint order: the same joints with siblings in another order (Blender's bone
  enumeration differs between versions); compared after reordering by name.
- quaternion sign: ``q`` and ``-q`` are one rotation.
- bone frames: ``offsets`` and the T-pose rotations are expressed in each
  bone's own axes, which another Blender version may orient differently (the
  released Objaverse NPZs carry an older one's). Accepted when the joint
  positions agree and each cond is self-consistent
  (``pos[j] - pos[parent] == rotate(global_rot[parent], offsets[j])`` and
  ``global_rot[j] == global_rot[parent] * local_rot[j]``).
- spectral basis: the Laplacian eigenvectors are unique only up to sign and,
  for repeated eigenvalues, up to a rotation of the eigenspace; when a tie
  straddles the ``max_freqs`` cut-off any subset of it is valid. Accepted when
  each column of both conds lies in the eigenspace of its own eigenvalue
  (ties included) and the columns are orthonormal, so columns of distinct
  eigenvalues may not trade places.

Verdict: ``identical``, ``equivalent`` (notes only) or ``different``.
"""

import os

import numpy as np

from data_process.rig_preprocess.glb import Glb
from data_process.utils.topology import _build_laplacian, _parse_parents

# Joint positions and other geometry, relative to the skeleton's extent. The
# released exports were made with an older Blender, whose float32 rest poses
# differ from a current import by up to about 1.5e-5 of the extent.
POS_TOL = 1e-4
# Scalars and unit quantities (rotations, eigenvectors), absolute.
VAL_TOL = 1e-5
# Skinned triangles of the canonical GLB, relative to the mesh's extent.
MESH_TOL = 1e-4
# Orthonormality of stored (float32) eigenvector columns.
SPEC_ORTHO_TOL = 1e-4

QUAT_FIELDS = ('tpos_local_rotations', 'tpos_global_rotations')
FRAME_FIELDS = ('offsets',) + QUAT_FIELDS
PER_JOINT_FIELDS = ('tpos_first_frame', 'tpos_offsets', 'joint_depths', 'clean_joint_names')
PAIRWISE_FIELDS = ('joint_relations', 'joint_graph_dists')


def _qrot(q, v):
    """Rotate vectors *v* by quaternions *q* ``(w, x, y, z)``."""
    w, u = q[..., :1], q[..., 1:]
    t = 2 * np.cross(u, v)
    return v + w * t + np.cross(u, t)


def _qmul(a, b):
    """Quaternion products ``a * b`` ``(w, x, y, z)``."""
    w1, v1, w2, v2 = a[..., :1], a[..., 1:], b[..., :1], b[..., 1:]
    return np.concatenate([w1 * w2 - (v1 * v2).sum(-1, keepdims=True),
                           w1 * v2 + w2 * v1 + np.cross(v1, v2)], -1)


def _frame_consistency(cond):
    """Whether a cond's bone frames agree with its joint positions:
    ``|pos[j] - pos[parent] - rotate(G[parent], offsets[j])|`` within ``POS_TOL``
    of the extent and ``G[j] == G[parent] * L[j]`` within ``VAL_TOL``."""
    pos = np.asarray(cond['tpos_first_frame'], float)
    glob = np.asarray(cond['tpos_global_rotations'], float)
    loc = np.asarray(cond['tpos_local_rotations'], float)
    off = np.asarray(cond['offsets'], float)
    parents = np.asarray(cond['parents'])
    j = np.flatnonzero(parents >= 0)
    ext = float(np.ptp(pos, 0).max()) or 1.0
    pos_err = float(np.abs(pos[j] - pos[parents[j]] - _qrot(glob[parents[j]], off[j])).max(initial=0) / ext)
    rot_err = _quat_err(glob[j], _qmul(glob[parents[j]], loc[j]))
    return pos_err <= POS_TOL and rot_err <= VAL_TOL


def _quat_err(a, b):
    """Largest component difference of two quaternion arrays, up to the sign of each."""
    if not len(a):
        return 0.0
    return float(np.minimum(np.abs(a - b).max(-1), np.abs(a + b).max(-1)).max())


def _valid_eigenbasis(parents, spec, tol=1e-6):
    """Whether column ``c`` of *spec* lies in the eigenspace of the ``c+1``-th
    smallest eigenvalue of the skeleton's Laplacian (every eigenvector tied with
    it included), and the columns are orthonormal."""
    if not spec.shape[1]:
        return True
    vals, vecs = np.linalg.eigh(_build_laplacian(_parse_parents(parents), norm='sym'))
    if np.abs(spec.T @ spec - np.eye(spec.shape[1])).max() > SPEC_ORTHO_TOL:
        return False
    for c in range(spec.shape[1]):
        space = vecs[:, np.abs(vals - vals[c + 1]) <= tol]
        if np.abs(spec[:, c] - space @ (space.T @ spec[:, c])).max() > VAL_TOL:
            return False
    return True


def _parent_names(cond, names):
    return [names[p] if p >= 0 else None for p in cond['parents']]


def _edges(cond, names):
    return {(names[i], names[j]) for i, j in np.asarray(cond['edge_indexs']).T}


def _chains(cond, names):
    return sorted(tuple(names[i] for i in chain) for chain in cond['kinematic_chains'])


def _chain_edges(cond, names):
    return {(names[c[i]], names[c[i + 1]]) for c in cond['kinematic_chains']
            for i in range(len(c) - 1)}


def _face(face, names):
    return tuple(names[face[k]] if face[k] >= 0 else None for k in ('r_hip', 'l_hip')) \
        + (bool(face.get('body_axis')),)


def compare_cond(ours, theirs):
    """Compare two cond entries of one asset; returns a dict with ``verdict``."""
    na = [str(n) for n in ours['joint_names']]
    nb = [str(n) for n in theirs['joint_names']]
    notes, diffs = [], []
    if sorted(na) != sorted(nb):
        missing, extra = sorted(set(nb) - set(na)), sorted(set(na) - set(nb))
        return {'verdict': 'different', 'notes': [], 'differences': [
            f'joint sets differ ({len(na)} vs {len(nb)}; missing {missing[:5]}, extra {extra[:5]})']}
    perm = np.array([na.index(n) for n in nb])          # ours' index of each dataset joint
    if not np.array_equal(perm, np.arange(len(nb))):
        notes.append('joint order: same joints, siblings ordered differently')
    parents_a = _parent_names(ours, na)
    if [parents_a[i] for i in perm] != _parent_names(theirs, nb):
        diffs.append('hierarchy')

    pos_b = np.asarray(theirs['tpos_first_frame'], float)
    ext = float(np.ptp(pos_b, 0).max()) or 1.0
    pos_err = float(np.abs(np.asarray(ours['tpos_first_frame'], float)[perm] - pos_b).max() / ext)
    for key in PER_JOINT_FIELDS:
        a, b = np.asarray(ours[key])[perm], np.asarray(theirs[key])
        same = (np.abs(a - b).max() / ext <= POS_TOL) if a.dtype.kind == 'f' \
            else np.array_equal(a.astype(str), b.astype(str))
        if not same:
            diffs.append(key)
    for key in PAIRWISE_FIELDS:
        if not np.array_equal(np.asarray(ours[key])[np.ix_(perm, perm)], np.asarray(theirs[key])):
            diffs.append(key)
    if _edges(ours, na) != _edges(theirs, nb):
        diffs.append('edge_indexs')
    if _chains(ours, na) != _chains(theirs, nb):
        # Chains continue through a branch's first child, so another sibling
        # order splits the same tree differently.
        if _chain_edges(ours, na) == _chain_edges(theirs, nb):
            notes.append('kinematic_chains: same tree, split differently at a branch')
        else:
            diffs.append('kinematic_chains')

    # Bone-frame fields: exact (quaternions up to sign), else frame-equivalent.
    frame_exact = True
    for key in FRAME_FIELDS:
        a, b = np.asarray(ours[key], float)[perm], np.asarray(theirs[key], float)
        if key in QUAT_FIELDS:
            if _quat_err(a, b) > VAL_TOL:
                frame_exact = False
            elif np.abs(a - b).max() > VAL_TOL:
                notes.append(f'{key}: some quaternions stored with the opposite sign')
        elif np.abs(a - b).max() / ext > POS_TOL:
            frame_exact = False
    if not frame_exact:
        if pos_err <= POS_TOL and _frame_consistency(ours) and _frame_consistency(theirs):
            notes.append('bone frames: offsets / T-pose rotations in other bone axes, '
                         'joint positions identical')
        else:
            diffs.append('offsets / T-pose rotations')

    # Spectral features: within the (possibly degenerate) eigenspace.
    spec_a = np.asarray(ours['spectral_feats'], float)[perm]
    spec_b = np.asarray(theirs['spectral_feats'], float)
    if spec_a.shape != spec_b.shape:
        diffs.append('spectral_feats shape')
    else:
        k = int((np.abs(spec_b).sum(0) > 0).sum())       # zero-padded for tiny skeletons
        a, b = spec_a[:, :k], spec_b[:, :k]
        if np.abs(spec_a[:, k:]).max(initial=0) > 0:
            diffs.append('spectral_feats')
        elif np.minimum(np.abs(a - b).max(0), np.abs(a + b).max(0)).max(initial=0) <= VAL_TOL:
            if np.abs(a - b).max(initial=0) > VAL_TOL:
                notes.append('spectral_feats: some eigenvectors stored with the opposite sign')
        elif _valid_eigenbasis(theirs['parents'], a) and _valid_eigenbasis(theirs['parents'], b):
            notes.append('spectral_feats: another basis of a repeated eigenvalue')
        else:
            diffs.append('spectral_feats')

    fa, fb = ours.get('face_joint_idxs'), theirs.get('face_joint_idxs')
    if (fa is None) != (fb is None) or (fa is not None and _face(fa, na) != _face(fb, nb)):
        diffs.append('face_joint_idxs')
    for key in ('scale_factor', 'ground_height'):
        a, b = ours.get(key), theirs.get(key)
        if (a is None) != (b is None) or (a is not None and abs(a - b) > VAL_TOL * max(1, abs(b))):
            diffs.append(key)
    if ours.get('ground_height_mode') != theirs.get('ground_height_mode'):
        diffs.append('ground_height_mode')
    if dict(ours.get('captions') or {}) != dict(theirs.get('captions') or {}):
        notes.append('captions differ (training-clip captions, not a skeleton property)')

    verdict = 'different' if diffs else ('equivalent' if notes else 'identical')
    return {'verdict': verdict, 'differences': diffs, 'notes': notes,
            'joint_position_err': pos_err}


def compare_glb(ours, theirs):
    """Joints and skinned rest triangles of two GLBs; returns a dict with ``verdict``."""
    a, b = Glb(ours), Glb(theirs)
    ja, jb = a.joints(), b.joints()
    if sorted(ja) != sorted(jb):
        return {'verdict': 'different', 'differences': ['joint names']}
    names = sorted(jb)
    pa = np.stack([ja[n][:3, 3] for n in names])
    pb = np.stack([jb[n][:3, 3] for n in names])
    ext = float(np.ptp(pb, 0).max()) or 1.0
    out = {'joint_err': float(np.abs(pa - pb).max() / ext)}
    ta, da = a.skinned_triangles()
    tb, db = b.skinned_triangles()
    out['triangles'] = [len(ta), len(tb)]
    diffs = [] if out['joint_err'] <= POS_TOL else ['joint positions']
    if len(ta) != len(tb):
        diffs.append('triangle count')
    elif len(ta):
        from scipy.spatial import cKDTree
        mext = float(np.ptp(tb.reshape(-1, 3), 0).max()) or 1.0
        dist, idx = cKDTree(tb).query(ta)
        out['triangle_err'] = float(dist.max() / mext)
        out['dominant_joint_agree'] = float((da == db[idx]).all(1).mean())
        if out['triangle_err'] > MESH_TOL:
            diffs.append('mesh')
    out.update(verdict='different' if diffs else 'identical', differences=diffs)
    return out


def verify(output_dir, name, profile, dataset_root='dataset'):
    """Compare ``<output_dir>/cond.npy`` and ``<output_dir>/<name>.glb`` with the
    dataset's cond entry and canonical GLB of the same asset."""
    report = {'name': name, 'profile': profile}
    ours = np.load(os.path.join(output_dir, 'cond.npy'), allow_pickle=True).item()[name]
    theirs = np.load(os.path.join(dataset_root, 'features', profile, 'cond.npy'),
                     allow_pickle=True).item().get(name)
    report['cond'] = (compare_cond(ours, theirs) if theirs is not None
                      else {'verdict': 'no reference', 'differences': ['not in the dataset cond']})
    glb = os.path.join(output_dir, f'{name}.glb')
    ref = os.path.join(dataset_root, 'canonical_assets', profile, f'{name}.glb')
    report['canonical_glb'] = (compare_glb(glb, ref) if os.path.isfile(ref)
                               else {'verdict': 'no reference',
                                     'differences': ['no dataset canonical GLB']})
    return report
