"""Stage 3 for one asset: cleaned joint names and the facing pair.

Three sources, each producing the two stage-3 entries stage 4 reads
(``clean_joint_names.json``, ``face_joint_names.json``):

- ``dataset``: the dataset's own (reviewed and patched) entries for the asset,
  matched by raw joint name (a joint the dataset's skeleton lacks gets the rule
  label); reproduces a training asset exactly.
- ``rule``: the rule-based cleaner, its rig-level refinements
  (``joint_annotation/structure_rule.py``; geometric labels of
  ``skeleton_parse`` for a mostly unnamed rig) and the face resolver, then the
  automatic fixes ``tools/patch_annotations.py`` applies to every rig (root
  label unification, side-from-x on object datasets, face-label resync), then
  the reviewed-label lookup (``joint_annotation/name_map.py``: a known rig
  tree's labels, else confident per-name labels where the rules left a
  placeholder). Offline.
- ``llm``: the LLM cleaner and face selector (``joint_annotation/llm.py``
  backends), then the same automatic fixes; a failed or timed-out call, or
  an LLM pair without horizontal separation, keeps the ``rule`` result.

Outside ``dataset`` mode the joint names and the face pair can come from
different sources (``names_mode`` / ``face_mode``), e.g. rule names with an
LLM face pair.

A face pair given by hand (``face_r`` / ``face_l`` raw names) replaces the
selected one in any mode. A selected pair without horizontal separation in the
rest pose (coincident or vertical joints, which define no facing) is dropped
for the identity facing; a hand-given one is an error.
"""

import json
import os
import re
from collections import Counter, OrderedDict

from loguru import logger

import numpy as np

from data_process.joint_annotation.face_select_rule import empty_entry, resolve_face_joints
from data_process.joint_annotation.name_map import apply_name_map, load_name_map
from data_process.joint_annotation.names_clean_rule import (
    clean_joint_name,
    limb_context,
    post_process,
)
from data_process.joint_annotation.structure_rule import fill_unnamed, rig_context
from data_process.tools import patch_annotations
from data_process.utils.kinematics import rest_global
from data_process.utils.skeleton import FACING_EPS

MODES = ('rule', 'llm', 'dataset')


def _patch_labels(ds, root, clean, names, log, generic_only):
    stats = Counter()
    saved = patch_annotations.CHAIN_RIGS, patch_annotations.X_SIDE_RIGS
    if generic_only:
        patch_annotations.CHAIN_RIGS, patch_annotations.X_SIDE_RIGS = {}, {}
    try:
        patch_annotations.patch_joint_labels(ds, root, clean, names, {}, stats, log)
    finally:
        patch_annotations.CHAIN_RIGS, patch_annotations.X_SIDE_RIGS = saved


def rule_annotation(ds, root, names, log=None, generic_only=False, name_map=None):
    """Rule labels and face pairs for the rigs of *names* (``{rig: raw names}``)
    exported under *root*.

    Labels: the rule cleaner with its refinements (learned vocabulary, sided
    placeholders, end bones), the hierarchy's limb context, then the automatic
    label fixes of ``patch_annotations`` (root unification, side-from-x), then
    the reviewed-label lookup of *name_map* (default: the shipped
    ``learned_name_map.json.gz``; ``False``: none): a known rig tree's labels,
    else confident per-name labels in place of weak rule labels.

    The face pair is resolved on the rule labels without the learned
    vocabulary (richer labels steer the resolver to other parts more often than
    they help), except that a thigh pair of the refined labels wins over a
    plain pair of another part. The lookup does not move the pair. *generic_only* leaves out the
    fixes keyed by dataset rig name (``CHAIN_RIGS``, ``X_SIDE_RIGS``), which an
    unseen asset never gets.
    """
    log = [] if log is None else log
    clean = {r: [post_process(clean_joint_name(n, r)) for n in raw] for r, raw in names.items()}
    plain = {r: [post_process(clean_joint_name(n, r, refine=False)) for n in raw]
             for r, raw in names.items()}
    rest, parents = {}, {}
    for rig in names:
        npz = patch_annotations.rig_npz(root, ds, rig)
        if npz:
            with np.load(npz, allow_pickle=True) as data:
                parents[rig] = data['parents']
                rest[rig] = rest_global(data)
            clean[rig] = rig_context(limb_context(clean[rig], parents[rig]), list(names[rig]),
                                     parents[rig])
            clean[rig] = fill_unnamed(clean[rig], parents[rig], rest[rig])
    _patch_labels(ds, root, clean, names, log, generic_only)
    _patch_labels(ds, root, plain, names, [], generic_only)
    face = {}
    for rig in names:
        raw = list(names[rig])
        usable = _separation_check(rest[rig]) if rig in rest else None
        # the plain rule labels first; a rig they give no pair (unnamed joints),
        # or a pair of another part where the refined labels find thighs, takes
        # the refined labels' pair
        face[rig] = resolve_face_joints(plain[rig], raw, usable)
        refined = resolve_face_joints(clean[rig], raw, usable)
        if not face[rig]['r_hip']['raw'] or (
                _part(refined, raw, clean[rig]) == 'Thigh'
                and _part(face[rig], raw, clean[rig]) != 'Thigh'):
            face[rig] = refined
    if name_map is not False:
        lookup = load_name_map() if name_map is None else name_map
        for rig in names:
            clean[rig], _ = apply_name_map(lookup, list(names[rig]), clean[rig], parents.get(rig))
    patch_annotations.patch_face_pairs(ds, face, clean, names, {}, Counter(), log)
    return clean, face


def _part(entry, raw, labels):
    """The refined label of a face entry's right joint, without its side
    ('' for an empty pair)."""
    joint = entry.get('r_hip', {}).get('raw')
    if not joint or entry.get('body_axis'):
        return ''
    return re.sub(r'^(Left|Right) ', '', labels[raw.index(joint)])


def _separation_check(pos):
    """The resolver's pair predicate: horizontal separation in rest pose *pos*."""
    def usable(ri, li):
        return _separated(pos[ri], pos[li])
    return usable


def _separated(a, b):
    across = np.asarray(a, dtype=float) - np.asarray(b, dtype=float)
    across = across / max(np.linalg.norm(across), 1e-8)
    return bool(np.linalg.norm(np.cross([0.0, 1.0, 0.0], across)) > FACING_EPS)


def manual_face(raw, clean, face_r, face_l, body_axis=False):
    """A ``face_joint_names.json`` entry for the hand-given pair *face_r* /
    *face_l* (raw names of the exported skeleton, right or head first)."""
    for joint in (face_r, face_l):
        if joint not in raw:
            raise ValueError(f"face joint {joint!r} is not a joint of the exported skeleton")
    entry = OrderedDict([
        ('r_hip', {'raw': face_r, 'clean': clean[raw.index(face_r)]}),
        ('l_hip', {'raw': face_l, 'clean': clean[raw.index(face_l)]}),
        ('source', 'body_axis' if body_axis else 'manual'),
    ])
    if body_axis:
        entry['body_axis'] = True
    return entry


def facing_defined(face, raw, rest_pos):
    """Whether the pair has horizontal separation in the rest pose (export
    space, Y-up), the condition stage 4's facing needs; an empty pair counts."""
    r, l = face.get('r_hip', {}).get('raw'), face.get('l_hip', {}).get('raw')
    if not (r and l):
        return True
    across = np.asarray(rest_pos[raw.index(r)]) - np.asarray(rest_pos[raw.index(l)])
    across = across / max(np.linalg.norm(across), 1e-8)
    return bool(np.linalg.norm(np.cross([0.0, 1.0, 0.0], across)) > FACING_EPS)


def annotate(mode, ds, name, raw, export_dir, dataset_export_dir=None,
             face_r=None, face_l=None, body_axis=False, llm_client=None, llm_options=None,
             rest_pos=None, names_mode=None, face_mode=None):
    """Return ``(clean_names, face_entry, notes)`` for one asset.

    *raw* is the exported skeleton's joint names; *ds* the profile name (it
    selects dataset-specific automatic fixes); *dataset_export_dir* the
    dataset export holding the entries for ``mode='dataset'``; *llm_options*
    ``max_tokens`` / ``max_retries`` / ``timeout_seconds`` for both LLM calls.
    Outside ``dataset`` mode, *names_mode* and *face_mode* ('rule' / 'llm',
    default *mode*) choose the source of the joint names and of the face pair
    separately; an LLM call that fails falls back to the rule result.
    """
    log = []
    if mode == 'dataset':
        if not dataset_export_dir:
            raise ValueError("mode 'dataset' needs the dataset export directory")
        entries = {}
        for key, fname in (('raw', 'joint_names.json'), ('clean', 'clean_joint_names.json'),
                           ('face', 'face_joint_names.json')):
            with open(os.path.join(dataset_export_dir, fname)) as f:
                entries[key] = json.load(f).get(name)
        if any(v is None for v in entries.values()):
            raise ValueError(f"'{name}' has no stage-3 entry in {dataset_export_dir}")
        # By raw joint name: a skeleton exported without animation can keep
        # joints the dataset's export pruned; those get the rule label.
        label = dict(zip(entries['raw'], entries['clean']))
        extra = [n for n in raw if n not in label]
        clean = [label[n] if n in label else post_process(clean_joint_name(n, name)) for n in raw]
        if extra:
            log.append(f'{len(extra)} joint(s) not in the dataset skeleton, rule-labelled: '
                       f'{extra[:5]}')
        face = entries['face']
        for key in ('r_hip', 'l_hip'):
            joint = face.get(key, {}).get('raw')
            if joint and joint not in raw:
                raise ValueError(f"'{name}': dataset face joint {joint!r} is not in the "
                                 f"exported skeleton")
    elif mode in ('rule', 'llm'):
        names_mode, face_mode = names_mode or mode, face_mode or mode
        for m in (names_mode, face_mode):
            if m not in ('rule', 'llm'):
                raise ValueError(f"names / face source must be 'rule' or 'llm', got {m!r}")
        if 'llm' in (names_mode, face_mode) and llm_client is None:
            raise ValueError("an 'llm' names / face source needs an LLM client")
        # The rule result: the 'rule' source, and the fallback of a failed LLM call.
        clean_d, face_d = rule_annotation(ds, export_dir, {name: list(raw)}, log)
        clean, face = clean_d[name], face_d[name]
        opts = dict(llm_options or {})
        names = {name: list(raw)}
        if names_mode == 'llm':
            from data_process.joint_annotation.names_clean_llm import clean_rig
            llm_clean, fell_back = clean_rig(name, list(raw), llm_client, **opts)
            if fell_back:
                log.append('joint names: LLM failed, rule labels kept')
            else:
                llm_d = {name: list(llm_clean)}
                _patch_labels(ds, export_dir, llm_d, names, log, generic_only=False)
                clean = llm_d[name]
        if face_mode == 'llm':
            from data_process.joint_annotation.face_select_llm import resolve_rig
            llm_face, fell_back = resolve_rig(name, list(raw), list(clean), llm_client, **opts)
            if fell_back:
                log.append('face pair: LLM failed, rule pair kept')
            elif rest_pos is not None and not facing_defined(llm_face, list(raw), rest_pos):
                log.append(f"face pair: the LLM's {llm_face['r_hip']['raw']} / "
                           f"{llm_face['l_hip']['raw']} has no horizontal separation in "
                           f"the rest pose, rule pair kept")
            else:
                face = llm_face
        face_d = {name: face}
        patch_annotations.patch_face_pairs(ds, face_d, {name: clean}, names, {}, Counter(), log)
        face = face_d[name]
        log.append(f'sources: joint names {names_mode}, face pair {face_mode}')
    else:
        raise ValueError(f"mode must be one of {MODES}, got {mode!r}")

    if face_r or face_l:
        if not (face_r and face_l):
            raise ValueError("give both face_r and face_l")
        face = manual_face(list(raw), clean, face_r, face_l, body_axis)
        log.append(f'face pair given by hand: {face_r} / {face_l}')
        if rest_pos is not None and not facing_defined(face, list(raw), rest_pos):
            raise ValueError(f"face pair {face_r} / {face_l} has no horizontal separation "
                             f"in the rest pose; choose another")
    elif rest_pos is not None and not facing_defined(face, list(raw), rest_pos):
        # Stage 4 would skip the asset; the authored facing is the better fallback.
        log.append(f"face pair {face['r_hip']['raw']} / {face['l_hip']['raw']} has no "
                   f"horizontal separation in the rest pose; using none (identity facing)")
        face = empty_entry()
    for line in log:
        logger.info(f"[annotate] {line}")
    return list(clean), face, log
