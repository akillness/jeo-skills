"""Reviewed joint labels as a lookup for rule annotation: ``learned_name_map.json.gz``.

UniML3D's reviewed stage-3 labels (LLM output, human review and patches) are
very consistent across rigs built from the same template: Mixamo, Biped,
Rigify and other rigging tools give many assets the same bones. Two lookups,
learned from a dataset export and applied after the rules
(``rig_preprocess.annotate.rule_annotation``):

- **templates**: a rig whose bone tree equals a reviewed rig's, by normalized
  bone names (:func:`norm_name`) and their parents, takes that template's
  majority label at every joint. The tree is compared in a canonical order
  (:func:`canonical_order`), so the same rig with its bones enumerated in
  another order (an FBX and the GLB made from it) still matches. Where sibling
  subtrees are identical by names (two legs whose bones carry no side) and
  their reviewed labels differ, the template cannot tell them apart and the
  rule label is kept;
- **names**: otherwise, a normalized bone name whose reviewed label agreed in at
  least ``min_purity`` of its occurrences takes that label, but only where the
  rules left a placeholder or a non-canonical label: a valid rule label is
  never overridden by a name seen in another dataset's convention.

Learned from the released datasets (``DATASETS``) only.

    python -m data_process.joint_annotation.name_map                 # all reviewed rigs
    python -m data_process.joint_annotation.name_map --split dev --out /tmp/m.json.gz
"""

import argparse
import datetime
import gzip
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

import numpy as np  # noqa: E402

from data_process.joint_annotation.learn_vocab import in_split  # noqa: E402
from data_process.joint_annotation.names_clean_rule import is_canonical_label  # noqa: E402
from data_process.tools.patch_annotations import rig_npz  # noqa: E402

DEFAULT_PATH = os.path.join(os.path.dirname(__file__), 'learned_name_map.json.gz')
# Datasets the map is learned from.
DATASETS = ('objaverse', 'mixamo', 'truebones')
MIN_PURITY = 0.9

_NAMESPACE_RE = re.compile(r'^.*[:|]')
_COUNTER_RE = re.compile(r'(?:[._]\d+)+$')
# Rule labels the per-name lookup may replace: placeholders ('Bone', numeric
# pass-throughs, sided or not) and labels outside the canonical vocabulary.
_PLACEHOLDER_RE = re.compile(r'^(?:Left |Right )?(?:Bone|_?\d+)$')


def norm_name(raw):
    """A bone name without namespace and trailing counters, lower-cased
    ('mixamorig:LeftUpLeg' -> 'leftupleg', 'Foot.R_035_34' -> 'foot.r'). Side
    markers stay: they are part of the label."""
    return _COUNTER_RE.sub('', _NAMESPACE_RE.sub('', str(raw).strip())).lower()


def _tree(norm_names, parents):
    """``(children, roots, sig)``: child lists, roots, and each joint's subtree
    signature (its name and its children's signatures, sorted)."""
    children, roots = defaultdict(list), []
    for i, p in enumerate(parents):
        (children[p] if p >= 0 else roots).append(i)
    signature = {}

    def sig(i):
        if i not in signature:
            signature[i] = norm_names[i] + '(' + ','.join(sorted(sig(c) for c in children[i])) + ')'
        return signature[i]

    return children, roots, sig


def canonical_order(norm_names, parents):
    """Joint indices in a depth-first order that does not depend on how the
    bones were enumerated: roots and siblings sorted by their subtree (names,
    recursively). Sibling subtrees that are identical by names (see
    :func:`tied_blocks`) keep their enumeration order."""
    children, roots, sig = _tree(norm_names, parents)
    order, stack = [], sorted(roots, key=sig, reverse=True)
    while stack:
        i = stack.pop()
        order.append(i)
        stack.extend(sorted(children[i], key=sig, reverse=True))
    return order


def tied_blocks(norm_names, parents, order):
    """Sibling subtrees identical by names, whose relative order is the
    enumeration's (the two legs of a rig whose bones carry no side): one list
    of ``(start, size)`` ranges of *order* per set of such siblings."""
    children, roots, sig = _tree(norm_names, parents)
    size = {}
    for i in reversed(order):
        size[i] = 1 + sum(size[c] for c in children[i])
    pos = {i: k for k, i in enumerate(order)}
    groups = []
    for siblings in [roots, *children.values()]:
        by_sig = defaultdict(list)
        for i in siblings:
            by_sig[sig(i)].append(i)
        groups += [sorted((pos[i], size[i]) for i in same)
                   for same in by_sig.values() if len(same) > 1]
    return groups


def _template(norm_names, parents):
    """``(key, order)``: the tree's template key and its canonical joint order.
    Each joint enters the key as its name and its parent's position in that
    order, so trees whose bones share one name (``Bone.001``, ``Bone.002``)
    still get different keys when their shapes differ."""
    order = canonical_order(norm_names, parents)
    pos = {i: k for k, i in enumerate(order)}
    edges = [f'{norm_names[i]}<{pos[parents[i]] if parents[i] >= 0 else ""}' for i in order]
    return hashlib.sha1('\n'.join(edges).encode()).hexdigest()[:20], order


def _ambiguous(seq, groups):
    """Positions of label sequence *seq* (canonical order) inside tied sibling
    subtrees whose labels differ at that position: there the template cannot
    tell which subtree is which."""
    out = set()
    for group in groups:
        for k in range(group[0][1]):
            if len({seq[start + k] for start, _ in group}) > 1:
                out.update(start + k for start, _ in group)
    return out


def weak_label(label):
    """Whether a rule label is a placeholder or outside the canonical vocabulary."""
    return bool(_PLACEHOLDER_RE.match(label)) or not is_canonical_label(label)


def learn_name_map(export_root='dataset/export', split=None, min_purity=MIN_PURITY,
                   datasets=DATASETS):
    """Learn the map from ``<export_root>/<ds>/{joint_names,clean_joint_names}.json``
    and each rig's export NPZ (its parents), for one *split* half of the rigs,
    or all."""
    labels, label_index = [], {}

    def idx(label):
        if label not in label_index:
            label_index[label] = len(labels)
            labels.append(label)
        return label_index[label]

    templates, ambiguous, names = defaultdict(list), defaultdict(set), defaultdict(Counter)
    for ds in datasets:
        root = os.path.join(export_root, ds)
        path = os.path.join(root, 'clean_joint_names.json')
        if not os.path.isfile(path):
            continue
        with open(os.path.join(root, 'joint_names.json')) as f:
            raw_names = json.load(f)
        with open(path) as f:
            clean = json.load(f)
        for rig, raw in raw_names.items():
            lab = clean.get(rig)
            if not lab or len(lab) != len(raw) or not in_split(rig, split):
                continue
            normed = [norm_name(n) for n in raw]
            npz = rig_npz(root, ds, rig)
            if npz:
                with np.load(npz, allow_pickle=True) as data:
                    parents = [int(p) for p in data['parents']]
                if len(parents) == len(raw):
                    key, order = _template(normed, parents)
                    seq = [lab[i] for i in order]
                    templates[key].append(seq)
                    ambiguous[key] |= _ambiguous(seq, tied_blocks(normed, parents, order))
            for n, label in zip(normed, lab):
                names[n][label] += 1
    out_templates = {
        key: [-1 if i in ambiguous[key] else idx(Counter(rig[i] for rig in rigs).most_common(1)[0][0])
              for i in range(len(rigs[0]))]
        for key, rigs in templates.items()}
    out_names = {}
    for n, counts in names.items():
        label, count = counts.most_common(1)[0]
        if count / sum(counts.values()) >= min_purity:
            out_names[n] = idx(label)
    return {'labels': labels, 'templates': out_templates, 'names': out_names}


def save_name_map(name_map, path, meta):
    with gzip.open(path, 'wt', encoding='utf-8') as f:
        json.dump({'_meta': meta, **name_map}, f, separators=(',', ':'))


def load_name_map(path=DEFAULT_PATH, _cache={}):
    """The shipped (or given) map; an empty one when the file is absent."""
    if path not in _cache:
        if os.path.isfile(path):
            with gzip.open(path, 'rt', encoding='utf-8') as f:
                data = json.load(f)
            data.pop('_meta', None)
        else:
            data = {'labels': [], 'templates': {}, 'names': {}}
        _cache[path] = data
    return _cache[path]


def apply_name_map(name_map, raw_names, labels, parents=None):
    """``(labels, source)``: *labels* (one per raw name) with the template of the
    rig's tree (needs *parents*), else with the confident per-name labels in
    place of weak rule labels. *source* is 'template', 'names' or 'none'."""
    vocab = name_map.get('labels', [])
    normed = [norm_name(n) for n in raw_names]
    if parents is not None and len(parents) == len(labels):
        key, order = _template(normed, [int(p) for p in parents])
        tmpl = name_map.get('templates', {}).get(key)
        if tmpl is not None and len(tmpl) == len(labels):
            out = list(labels)
            for pos, i in enumerate(order):
                if tmpl[pos] >= 0:
                    out[i] = vocab[tmpl[pos]]
            return out, 'template'
    table = name_map.get('names', {})
    out = [vocab[table[n]] if n in table and weak_label(label) else label
           for n, label in zip(normed, labels)]
    return out, ('names' if out != list(labels) else 'none')


def main():
    ap = argparse.ArgumentParser(description="Learn learned_name_map.json.gz from reviewed labels.")
    ap.add_argument('--export_root', default='dataset/export')
    ap.add_argument('--split', choices=('dev', 'test'), default=None,
                    help="Learn from one half of the rigs only (to evaluate on the other).")
    ap.add_argument('--min_purity', type=float, default=MIN_PURITY)
    ap.add_argument('--out', default=DEFAULT_PATH)
    args = ap.parse_args()
    name_map = learn_name_map(args.export_root, args.split, args.min_purity)
    meta = {'datasets': list(DATASETS), 'split': args.split, 'min_purity': args.min_purity,
            'date': datetime.date.today().isoformat(),
            'templates': len(name_map['templates']), 'names': len(name_map['names'])}
    save_name_map(name_map, args.out, meta)
    print(f"{meta['templates']} templates, {meta['names']} names -> {args.out} "
          f"({os.path.getsize(args.out) / 1e6:.2f} MB)")


if __name__ == '__main__':
    main()
