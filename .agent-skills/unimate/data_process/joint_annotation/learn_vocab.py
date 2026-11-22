"""Learn a raw-name vocabulary from reviewed joint labels: ``learned_vocab.json``.

For every rig of the given dataset exports, each raw joint name is reduced to
its words (``names_clean_rule.name_words``: namespace, Biped prefix,
counters and side markers dropped) and paired with the part of its reviewed
label in ``clean_joint_names.json`` (LLM output, human review and patches;
side removed, ``End`` kept). Every word tail of a name (``doberman_ref_haunch``,
``ref_haunch``, ``haunch``) is counted. A key enters the vocabulary when the
rigs it occurs in agree on one part: at least ``--min_rigs`` distinct rigs and
a share of at least ``--min_purity`` of its joints. Placeholder labels
('Bone', numeric passthroughs) are not learned, nor single-letter keys
('t'), nor a generic word (``link``, ``joint``), nor a one-word key whose own use as a whole joint name disagrees with
what it was learned as (``base`` is the tail of ``toe_base``, Toe, but alone
names a root).

``names_clean_rule.clean_joint_name`` consults the vocabulary only for a name
its rules leave as a placeholder or a non-canonical label, longest key first.

    python -m data_process.joint_annotation.learn_vocab                       # all rigs
    python -m data_process.joint_annotation.learn_vocab --split dev --out /tmp/v.json
"""

import argparse
import datetime
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

import hashlib  # noqa: E402

from data_process.joint_annotation.names_clean_rule import name_words  # noqa: E402

DEFAULT_OUT = os.path.join(os.path.dirname(__file__), 'learned_vocab.json')
# Generic structural words that name no body part on their own (robot '<part>_link').
GENERIC_WORDS = frozenset({'link', 'joint', 'jnt', 'bone', 'node'})


def in_split(rig, split):
    """Deterministic half of the rigs: 'dev' or 'test' (None: all)."""
    if split is None:
        return True
    bucket = int(hashlib.sha1(rig.encode()).hexdigest(), 16) % 2
    return bucket == (0 if split == 'dev' else 1)


def part_of(label):
    """Reviewed label without its side ('Right Upper Arm' -> 'Upper Arm')."""
    return re.sub(r'^(Left|Right)\s+', '', label).strip()


def learn(datasets, export_root='dataset/export', split=None, min_rigs=3, min_purity=0.9):
    parts = defaultdict(Counter)        # key -> part -> joints
    rigs = defaultdict(set)             # key -> rigs it occurs in
    alone = defaultdict(Counter)        # one-word key -> part, as a whole name
    for ds in datasets:
        root = os.path.join(export_root, ds)
        if not os.path.isfile(os.path.join(root, 'clean_joint_names.json')):
            continue
        with open(os.path.join(root, 'joint_names.json')) as f:
            names = json.load(f)
        with open(os.path.join(root, 'clean_joint_names.json')) as f:
            clean = json.load(f)
        for rig, raw in names.items():
            labels = clean.get(rig)
            if not labels or len(labels) != len(raw) or not in_split(rig, split):
                continue
            for name, label in zip(raw, labels):
                words = name_words(name)
                if len(words) == 1:
                    alone[words[0]][part_of(label)] += 1
                part = part_of(label)
                if not part or part == 'Bone' or re.match(r'^_?\d+$', part):
                    continue
                for i in range(len(words)):
                    key = '_'.join(words[i:])
                    parts[key][part] += 1
                    rigs[key].add(f'{ds}/{rig}')
    vocab = {}
    for key, counter in parts.items():
        part, n = counter.most_common(1)[0]
        if len(rigs[key]) < min_rigs or n / sum(counter.values()) < min_purity:
            continue
        if key in GENERIC_WORDS:
            continue
        if '_' not in key and (len(key) < 2 or (
                alone[key] and alone[key].most_common(1)[0][0] != part)):
            continue
        vocab[key] = part
    return dict(sorted(vocab.items()))


def main():
    ap = argparse.ArgumentParser(description="Learn learned_vocab.json from reviewed labels.")
    ap.add_argument('--datasets', nargs='+', default=['truebones', 'mixamo', 'objaverse'])
    ap.add_argument('--export_root', default='dataset/export')
    ap.add_argument('--split', choices=('dev', 'test'), default=None,
                    help="Learn from one half of the rigs only (to evaluate on the other).")
    ap.add_argument('--min_rigs', type=int, default=3)
    ap.add_argument('--min_purity', type=float, default=0.9)
    ap.add_argument('--out', default=DEFAULT_OUT)
    args = ap.parse_args()
    vocab = learn(args.datasets, args.export_root, args.split, args.min_rigs, args.min_purity)
    meta = {'datasets': args.datasets, 'split': args.split, 'min_rigs': args.min_rigs,
            'min_purity': args.min_purity, 'keys': len(vocab),
            'date': datetime.date.today().isoformat()}
    with open(args.out, 'w') as f:
        json.dump({'_meta': meta, 'keys': vocab}, f, indent=1, sort_keys=False)
    print(f"{len(vocab)} keys -> {args.out}")


if __name__ == '__main__':
    main()
