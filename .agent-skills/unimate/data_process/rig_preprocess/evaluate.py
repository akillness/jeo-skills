"""Score the rule annotation against a dataset's reviewed stage-3 entries (bpy-free).

For every rig of ``dataset/export/<ds>`` it runs ``annotate.rule_annotation``
(what ``rule`` mode does; without the fixes keyed by dataset rig name, which an
unseen asset never gets) on the exported joint names and compares
with ``clean_joint_names.json`` / ``face_joint_names.json`` (LLM output plus
human review and patches):

- joint labels: fraction equal to the reviewed label;
- face pair: the same raw pair (and body-axis flag);
- facing: the root rotation the pair gives the rest pose (the one stage 4
  applies) within ``FACING_TOL_DEG`` of the reviewed pair's. Two different
  pairs often face the same way (shoulders vs hips), and only the facing
  reaches the cond and the canonical GLB. An empty pair is the identity.

Rigs can be restricted to a hash split (``--split dev|test``) so rules are
tuned on one half and judged on the other. With a split, the two learned
artifacts rule mode reads, the vocabulary (``learn_vocab``) and the reviewed-label
lookup (``name_map``), are learned on the other half for the run, so no scored
rig's own labels are looked up (``--shipped`` uses the shipped files instead,
which have seen every rig).

    python -m data_process.rig_preprocess.evaluate --datasets objaverse truebones --split test
"""

import argparse
import json
import os
import sys
from contextlib import contextmanager

import numpy as np

from data_process.joint_annotation import names_clean_rule
from data_process.joint_annotation.learn_vocab import in_split, learn
from data_process.joint_annotation.name_map import learn_name_map
from data_process.rig_preprocess.annotate import rule_annotation
from data_process.tools import patch_annotations
from data_process.utils.kinematics import rest_global
from data_process.utils.skeleton import DegenerateSkeletonError, get_root_facing_quat

FACING_TOL_DEG = 10.0
# Datasets the held-out vocabulary is learned from (learn_vocab's default).
VOCAB_DATASETS = ('truebones', 'mixamo', 'objaverse')


@contextmanager
def _vocabulary(keys):
    """Rule labelling with the learned vocabulary *keys* instead of the shipped one."""
    cache = names_clean_rule._learned_vocab.__defaults__[0]
    saved = list(cache)
    cache[:] = [keys]
    try:
        yield
    finally:
        cache[:] = saved


def _pair(entry):
    return (entry.get('r_hip', {}).get('raw') or '', entry.get('l_hip', {}).get('raw') or '',
            bool(entry.get('body_axis')))


def facing_quat(entry, raw, rest_pos):
    """Root rotation (w, x, y, z) the pair gives the rest pose; None when undefined."""
    r, l, body_axis = _pair(entry)
    if not (r and l):
        return np.array([1.0, 0.0, 0.0, 0.0])
    if r not in raw or l not in raw:
        return None
    try:
        q = get_root_facing_quat(np.asarray(rest_pos)[None], [raw.index(r), raw.index(l)],
                                 body_axis=body_axis)
    except DegenerateSkeletonError:
        return None
    return q.qs[0]


def quat_angle_deg(a, b):
    """Angle in degrees between two unit quaternions (sign-insensitive)."""
    return float(np.degrees(2 * np.arccos(min(1.0, abs(float(np.dot(a, b)))))))


def evaluate(ds, export_root='dataset/export', split=None, rigs=None, held_out=True):
    """Score rule annotation on the rigs of ``<export_root>/<ds>`` (optionally
    one *split* half, or the rigs in *rigs*). With a split and *held_out*, the
    vocabulary and the reviewed-label lookup are learned on the other half.
    Returns ``(summary, rows)``: label accuracy, same pair and same facing over
    the rigs, and one row per rig."""
    root = os.path.join(export_root, ds)
    with open(os.path.join(root, 'joint_names.json')) as f:
        names = json.load(f)
    with open(os.path.join(root, 'clean_joint_names.json')) as f:
        ref_clean = json.load(f)
    with open(os.path.join(root, 'face_joint_names.json')) as f:
        ref_face = json.load(f)
    keep = [r for r in names if r in ref_clean and r in ref_face and in_split(r, split)
            and (rigs is None or r in rigs)]
    names = {r: names[r] for r in keep}
    if split and held_out:
        other = 'test' if split == 'dev' else 'dev'
        with _vocabulary(learn(VOCAB_DATASETS, export_root, split=other)):
            clean, face = rule_annotation(ds, root, names, generic_only=True,
                                          name_map=learn_name_map(export_root, split=other))
    else:
        clean, face = rule_annotation(ds, root, names, generic_only=True)

    n_lab = ok_lab = same_pair = same_facing = undefined = 0
    rows = []
    for rig in keep:
        raw = names[rig]
        ok = sum(a == b for a, b in zip(clean[rig], ref_clean[rig]))
        n_lab += len(raw)
        ok_lab += ok
        pair_ok = _pair(face[rig]) == _pair(ref_face[rig])
        same_pair += pair_ok
        npz = patch_annotations.rig_npz(root, ds, rig)
        angle = None
        if npz:
            with np.load(npz, allow_pickle=True) as d:
                rest = rest_global(d)
            qa, qb = facing_quat(face[rig], raw, rest), facing_quat(ref_face[rig], raw, rest)
            if qa is None or qb is None:
                undefined += 1
            else:
                angle = quat_angle_deg(qa, qb)
        facing_ok = pair_ok or (angle is not None and angle <= FACING_TOL_DEG)
        same_facing += facing_ok
        rows.append({'rig': rig, 'label_acc': ok / max(len(raw), 1), 'same_pair': pair_ok,
                     'facing_ok': facing_ok, 'angle': angle,
                     'rule_pair': _pair(face[rig]), 'ref_pair': _pair(ref_face[rig])})
    n = max(len(keep), 1)
    summary = {'dataset': ds, 'split': split, 'held_out': bool(split and held_out), 'rigs': len(keep),
               'label_acc': ok_lab / max(n_lab, 1), 'same_pair': same_pair / n,
               'same_facing': same_facing / n, 'facing_undefined': undefined}
    return summary, rows


def main():
    """Command line: one summary line (JSON) per dataset."""
    ap = argparse.ArgumentParser(description="Score the rule annotation against a dataset.")
    ap.add_argument('--datasets', nargs='+', default=['truebones', 'mixamo', 'objaverse'])
    ap.add_argument('--export_root', default='dataset/export')
    ap.add_argument('--split', choices=('dev', 'test'), default=None)
    ap.add_argument('--rows', default=None, help="Write the per-rig rows (JSON) here.")
    ap.add_argument('--shipped', action='store_true',
                    help="With --split: use the shipped vocabulary and lookup (learned on "
                         "every rig, so they have seen the scored half) instead of learning "
                         "them on the other half.")
    args = ap.parse_args()
    all_rows = {}
    for ds in args.datasets:
        if not os.path.isfile(os.path.join(args.export_root, ds, 'clean_joint_names.json')):
            print(f"skipping {ds}: no annotated export under {args.export_root}", file=sys.stderr)
            continue
        summary, rows = evaluate(ds, args.export_root, args.split, held_out=not args.shipped)
        all_rows[ds] = rows
        print(json.dumps(summary))
    if args.rows:
        with open(args.rows, 'w') as f:
            json.dump(all_rows, f, indent=1, default=str)


if __name__ == '__main__':
    main()
