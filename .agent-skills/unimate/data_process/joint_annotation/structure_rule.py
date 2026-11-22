"""Rig-level refinements of rule joint labels: what one name cannot tell but
the rig's other names and its hierarchy can.

``rig_context(labels, raw, parents)`` runs after the per-name cleaner
(``names_clean_rule.clean_joint_name``) and ``limb_context``; every step
follows a convention of the reviewed labels in ``dataset/export/*/
clean_joint_names.json`` and none is keyed by rig name:

- labels that are a word of the asset's name rather than a part (a word the
  cleaner could not map, repeated over much of the rig) become placeholders;
- a known part behind or before unknown words keeps the part ('Rex Toe' ->
  'Toe', 'Index Finger Bn' -> 'Index Finger'; 'Thigh Rear' -> 'Hind Thigh');
- joint words map to the part the reviewed labels use for the bone
  ('Collar' -> 'Shoulder', a sided 'Point' -> 'Index Finger', single foreign
  words through ``vocab.FOREIGN_PARTS``);
- front / hind markers in a leg name qualify its Leg / Toe / Foot / Paw;
- numbered fingers follow the rig's numbering: 0-based (3ds Max Biped,
  'Finger0' = thumb) when any finger is numbered 0, else 1-based from the
  thumb when five are numbered, else from the index finger;
- positional limb names along a chain get segment labels ('Arm1', 'Arm2' ->
  Upper Arm, Forearm; 'Leg1', 'Leg2' -> Thigh, Shin), except the legs of a
  rig with more than four of them;
- finger labels below a foot are toes; 'Middle' fingers of a rig with legs
  and no hands are middle legs;
- a side marked in a way the per-name cleaner skips ('lIndex3', 'lefthand',
  'Lf_Wrist', 'PinkR3') is kept when the rig then has the part on both sides.

``fill_unnamed(labels, parents, rest)`` gives a rig whose joints are mostly
placeholders the geometric labels of ``skeleton_parse``.
"""

import re
from collections import Counter

from data_process.joint_annotation.skeleton_parse import parse_labels
from data_process.joint_annotation.vocab import FOREIGN_PARTS, is_canonical_label

_SIDE_RE = re.compile(r'^(Left|Right) ')


def split_side(label):
    m = _SIDE_RE.match(label)
    return (m.group(1), label[m.end():]) if m else ('', label)


def join_side(side, part):
    return f'{side} {part}' if side else part


def _children(parents):
    kids = {}
    for j, p in enumerate(parents):
        kids.setdefault(int(p), []).append(j)
    return kids


# ---------------------------------------------------------------------------
# Label-level fixes
# ---------------------------------------------------------------------------

# Joint words whose reviewed label is the bone they start.
LABEL_MAP = {
    'Collar': 'Shoulder',
    'Collar Bone': 'Shoulder',
    'Coler Bone': 'Shoulder',
    'Clavical': 'Shoulder',
    'Back Leg': 'Hind Leg',
    'Side Leg': 'Middle Leg',
    'Patte Arr': 'Hind Leg',
    'Patte Av': 'Front Leg',
    'Leg Upper': 'Thigh',
    'Leg Lower': 'Shin',
    'Leg Trochanter': 'Thigh',
    'Leg Twist': 'Shin Twist',
    'Ankle Bone': 'Toe',
    'Talons': 'Claw',
    'Talon': 'Claw',
    'Braid': 'Hair',
    'Proboscis': 'Appendage',
    'Mustache': 'Whisker',
    'Moustache': 'Whisker',
    'Lit': 'Pinky Finger',
    'Fins': 'Fin',
    'Ornamentalhorn': 'Horn',
    'Head Top': 'Head',
    'Head Vertex': 'Head',
    'Labrum': 'Lip',
}
# Unsided joint words.
UNSIDED_MAP = {
    'Back': 'Spine',
    'Point': 'Bone',        # a 3ds Max helper
}
# Sided joint words.
SIDED_MAP = {
    'Point': 'Index Finger',
}


def _end(part):
    return part.endswith(' End'), (part[:-4] if part.endswith(' End') else part)


def map_labels(labels):
    out = list(labels)
    for j, label in enumerate(labels):
        side, part = split_side(label)
        end, base = _end(part)
        base = base.rstrip('-_. ')
        new = LABEL_MAP.get(base)
        if new is None and ' ' not in base and not is_canonical_label(base):
            new = FOREIGN_PARTS.get(base.lower())
        if new is None and not side:
            new = UNSIDED_MAP.get(base)
        if new is None and side:
            new = SIDED_MAP.get(base)
        if new:
            out[j] = join_side(side, new + (' End' if end else ''))
    return out


def canonical_tail(labels):
    """'Rex Toe' -> 'Toe', 'Index Finger Bn' -> 'Index Finger': a non-canonical
    label whose last words (else first words) form a canonical part keeps
    that part; a trailing position word moves in front ('Thigh Rear' ->
    'Hind Thigh')."""
    out = list(labels)
    for j, label in enumerate(labels):
        side, part = split_side(label)
        if part == 'Bone' or is_canonical_label(part) or part in LABEL_MAP:
            continue
        end, base = _end(part)
        m = re.match(r'^(.+) (Front|Rear|Hind|Back)$', base)
        if m:
            q = 'Front' if m.group(2) == 'Front' else 'Hind'
            if is_canonical_label(f'{q} {m.group(1)}'):
                out[j] = join_side(side, f'{q} {m.group(1)}' + (' End' if end else ''))
                continue
        words = base.split()
        spans = [words[k:] for k in range(1, len(words))] + \
                [words[:k] for k in range(len(words) - 1, 0, -1)]
        for span in spans:
            cand = ' '.join(span)
            if cand != 'Bone' and is_canonical_label(cand):
                out[j] = join_side(side, cand + (' End' if end else ''))
                break
    return out


def asset_word_placeholders(labels, min_share=0.3, min_joints=4):
    """A non-canonical label carried by much of the rig names the asset, not
    a part ('Frog', 'Racoon'): placeholder."""
    parts = Counter(_end(split_side(l)[1])[1] for l in labels)
    common = {p for p, n in parts.items()
              if n >= min_joints and n >= min_share * len(labels)
              and p != 'Bone' and not is_canonical_label(p)}
    if not common:
        return list(labels)
    out = []
    for label in labels:
        side, part = split_side(label)
        end, base = _end(part)
        out.append(join_side(side, 'Bone') if base in common else label)
    return out


# Front / hind markers in a raw leg name: words ('FrontLeg', 'frount toe',
# 'HindLeg', 'Rear'), a capital F/B/H glued to the part ('FLeg01', 'BLeg03'),
# or a side+position code ('b_LF_leg', 'LB_Leg1').
_FRONT_RE = re.compile(r'(?i:front|frnt|frount|fore)|(?<![A-Za-z])F(?=Leg|Foot|Toe|Paw)'
                       r'|(?:^|_)[LR]F(?=_|$)|(?:^|_)F[LR](?=_|$)')
_HIND_RE = re.compile(r'(?i:hind|rear|back)|(?<![A-Za-z])[BH](?=Leg|Foot|Toe|Paw)'
                      r'|(?:^|_)[LR][BH](?=_|$)|(?:^|_)[BH][LR](?=_|$)')
_QUALIFIABLE = {'Leg', 'Toe', 'Foot', 'Paw'}


def leg_qualifiers(labels, raw):
    """'Leg' / 'Toe' / 'Foot' / 'Paw' of a name marked front or hind take the
    qualifier ('FLeg01' -> 'Front Leg', 'BLeg01' -> 'Hind Leg',
    'frount toe.L' -> 'Front Toe'); hind legs are 'Hind', other hind parts
    'Back', as the reviewed labels write them."""
    out = list(labels)
    for j, label in enumerate(labels):
        side, part = split_side(label)
        end, base = _end(part)
        if base not in _QUALIFIABLE:
            continue
        name = re.sub(r'^.*:', '', raw[j])
        front, hind = bool(_FRONT_RE.search(name)), bool(_HIND_RE.search(name))
        if front == hind:
            continue
        q = 'Front' if front else ('Hind' if base == 'Leg' else 'Back')
        out[j] = join_side(side, f'{q} {base}' + (' End' if end else ''))
    return out


# ---------------------------------------------------------------------------
# Finger numbering
# ---------------------------------------------------------------------------

# 'Finger1' / 'Finger12' (finger 1, segment 2) or 'finger_2' / 'finger_2_1';
# behind a separator the whole number is the finger ('Finger_07' is a chain
# counter, not finger 0).
_FINGER_NUM_RE = re.compile(r'finger(?:(\d)|[ _-](\d+))(?!\d*[A-Za-z]{2})', re.IGNORECASE)
_FINGERS_1 = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']


def finger_numbering(labels, raw):
    """Generic 'Finger' labels of numbered finger names get the finger the
    rig's numbering gives them."""
    nums = {}
    for j, (label, name) in enumerate(zip(labels, raw)):
        _, part = split_side(label)
        if _end(part)[1] != 'Finger':
            continue
        m = _FINGER_NUM_RE.search(name)
        if m:
            n = int(m.group(1) if m.group(1) is not None else m.group(2))
            if n <= 5:
                nums[j] = n
    if not nums:
        return list(labels)
    digits = set(nums.values())
    has_thumb = any(_end(split_side(l)[1])[1] == 'Thumb Finger' for l in labels)
    if 0 in digits:
        base = 0            # 0 = thumb
    elif 5 in digits or (not has_thumb and max(digits) >= 5):
        base = 1            # 1 = thumb
    else:
        base = 2            # 1 = index (no thumb among the numbered fingers)
    out = list(labels)
    for j, n in nums.items():
        k = n - 1 if base == 1 else n          # index into _FINGERS_1 (0 = thumb)
        if 0 <= k < 5:
            side, part = split_side(labels[j])
            end, _ = _end(part)
            out[j] = join_side(side, _FINGERS_1[k] + ' Finger' + (' End' if end else ''))
    return out


# ---------------------------------------------------------------------------
# Hierarchy
# ---------------------------------------------------------------------------

_CHAIN_SEGMENTS = {
    'Arm': ['Upper Arm', 'Forearm'],
    'Leg': ['Thigh', 'Shin'],
}


def limb_chains(labels, parents, max_len=2, max_leg_runs=4):
    """Runs of one same-side positional limb word down a chain ('Arm1',
    'Arm2'): segment labels by position. A run longer than *max_len* (a
    tentacle-like limb) keeps the word, except that 'Arm' becomes 'Upper Arm'."""
    parents = [int(p) for p in parents]
    kids = _children(parents)
    starts = [j for j, label in enumerate(labels)
              if split_side(label)[1] in _CHAIN_SEGMENTS
              and not (parents[j] >= 0 and labels[parents[j]] == label)]
    many_legs = sum(split_side(labels[j])[1] == 'Leg' for j in starts) > max_leg_runs
    out = list(labels)
    for j in starts:
        label = labels[j]
        side, part = split_side(label)
        if part == 'Leg' and many_legs:
            continue                      # a spider or insect keeps its legs
        p = parents[j]
        run = [j]
        while True:
            nxt = [k for k in kids.get(run[-1], []) if labels[k] == label]
            if len(nxt) != 1:
                break
            run.append(nxt[0])
        seg = _CHAIN_SEGMENTS[part]
        parent_part = split_side(labels[p])[1] if p >= 0 else ''
        if len(run) <= max_len:
            # a run that continues a chain already holding its first segment
            start = 1 if parent_part in (seg[0], 'Hip' if part == 'Leg' else '') else 0
            for i, k in enumerate(run):
                out[k] = join_side(side, seg[min(start + i, len(seg) - 1)])
        elif part == 'Arm':
            for k in run:
                out[k] = join_side(side, 'Upper Arm')
    return out


_HAND_PARTS = {'Hand', 'Wrist', 'Palm', 'Forearm', 'Upper Arm', 'Elbow'}
_FOOT_PARTS = {'Foot', 'Ankle', 'Toe', 'Heel'}
_LEG_PARTS = {'Shin', 'Thigh', 'Knee'}
_FINGER_PARTS = {'Thumb Finger', 'Index Finger', 'Middle Finger', 'Ring Finger',
                 'Pinky Finger', 'Finger'}


def _limb_ancestor(labels, parents, j):
    """'hand' / 'foot' / '' for the nearest ancestor that tells a hand chain
    from a foot chain."""
    p = int(parents[j])
    while p >= 0:
        part = _end(split_side(labels[p])[1])[1]
        part = re.sub(r'^(Front|Back|Hind|Rear|Middle) ', '', part)
        if part in _HAND_PARTS:
            return 'hand'
        if part in _FOOT_PARTS:
            return 'foot'
        if part in _LEG_PARTS or part.endswith('Leg'):
            return 'leg'
        p = int(parents[p])
    return ''


def hand_and_foot_digits(labels, parents):
    """Finger labels below a foot are toes."""
    out = list(labels)
    for j, label in enumerate(labels):
        side, part = split_side(label)
        end, base = _end(part)
        if base in _FINGER_PARTS and _limb_ancestor(labels, parents, j) == 'foot':
            out[j] = join_side(side, 'Toe' + (' End' if end else ''))
    return out


def middle_legs(labels, parents):
    """'Middle Finger' joints of a rig with legged parts and no hand chain
    above them are the middle legs of an insect or spider."""
    has_legs = any(re.search(r'\b(Front|Back|Hind) Leg\b', l) for l in labels)
    if not has_legs:
        return list(labels)
    out = list(labels)
    for j, label in enumerate(labels):
        side, part = split_side(label)
        end, base = _end(part)
        if base == 'Middle Finger' and _limb_ancestor(labels, parents, j) != 'hand':
            out[j] = join_side(side, 'Middle Leg' + (' End' if end else ''))
    return out


# ---------------------------------------------------------------------------
# Sides
# ---------------------------------------------------------------------------

# Parts that sit on the body's midline and never take a side.
CENTER_PARTS = {'Root', 'Hips', 'Pelvis', 'Spine', 'Chest', 'Body', 'Neck', 'Head', 'Jaw',
                'Tail', 'Bone', 'Center', 'Abdomen', 'Ribcage', 'Waist', 'Upper Body',
                'Lower Body', 'Torso', 'Mouth', 'Tongue', 'Nose', 'Chin', 'Base'}
_SIDE_TOKENS = {'l': 'Left', 'r': 'Right', 'lf': 'Left', 'rt': 'Right', 'lft': 'Left',
                'rgt': 'Right', 'lt': 'Left', 'left': 'Left', 'right': 'Right'}


def token_side(raw):
    """Side marked anywhere in a raw name in the less common ways the
    per-name cleaner skips ('lIndex3', 'lefthand', 'Lf_Wrist', 'PinkR3',
    'finger middle 3 l', 'RrightEar'); '' when none or both sides."""
    name = re.sub(r'^.*:', '', raw).lstrip('-_ ')
    found = set()
    m = re.match(r'^([LR])(right|left)', name, re.IGNORECASE)
    if m:
        found.add(_SIDE_TOKENS[m.group(2).lower()])
    m = re.match(r'^(left|right)(?=[a-z])', name)
    if m:
        found.add(_SIDE_TOKENS[m.group(1)])
    for m in re.finditer(r'(?:^|[^A-Za-z])([lr])(?=[A-Z][a-z])', name):
        found.add(_SIDE_TOKENS[m.group(1)])
    m = re.search(r'[a-z]([LR])\d*$', name)
    if m:
        found.add(_SIDE_TOKENS[m.group(1).lower()])
    for tok in re.split(r'[^A-Za-z]+|(?<=[a-z])(?=[A-Z])', name):
        side = _SIDE_TOKENS.get(tok.lower())
        if side:
            found.add(side)
    return found.pop() if len(found) == 1 else ''


def fill_sides(labels, raw):
    """Sides the per-name cleaner leaves out, from side markers anywhere in
    the raw name (``token_side``), for parts the rig then has on both sides.
    Unmarked joints stay unsided: the reviewed labels do not side them by
    position either."""
    cand = {}
    for j, label in enumerate(labels):
        side, part = split_side(label)
        if side or _end(part)[1] in CENTER_PARTS:
            continue
        t = token_side(raw[j])
        if t:
            cand[j] = join_side(t, part)
    trial = list(labels)
    for j, l in cand.items():
        trial[j] = l
    seen = {}
    for l in trial:
        side, part = split_side(l)
        if side:
            seen.setdefault(_end(part)[1], set()).add(side)
    out = list(labels)
    for j, l in cand.items():
        if len(seen.get(_end(split_side(l)[1])[1], ())) == 2:
            out[j] = l
    return out

def rig_context(labels, raw, parents, steps=None):
    """All rig-level refinements, in order. *steps* restricts them (names of
    the functions above) for evaluation."""
    pipeline = [
        ('asset_word_placeholders', lambda l: asset_word_placeholders(l)),
        ('canonical_tail', canonical_tail),
        ('map_labels', map_labels),
        ('leg_qualifiers', lambda l: leg_qualifiers(l, raw)),
        ('finger_numbering', lambda l: finger_numbering(l, raw)),
        ('limb_chains', lambda l: limb_chains(l, parents)),
        ('hand_and_foot_digits', lambda l: hand_and_foot_digits(l, parents)),
        ('middle_legs', lambda l: middle_legs(l, parents)),
        ('fill_sides', lambda l: fill_sides(l, raw)),
    ]
    out = list(labels)
    for name, fn in pipeline:
        if steps is None or name in steps:
            out = fn(out)
    return out


def fill_unnamed(labels, parents, rest, min_share=0.5):
    """A rig whose joints are mostly placeholders ('Bone.012', 'joint5') takes
    the geometric labels of ``skeleton_parse.parse_labels`` for them. On a rig
    with names the placeholders stay: there the geometric guess loses more
    reviewed labels than it gains."""
    bone = [_end(split_side(l)[1])[1] == 'Bone' for l in labels]
    if not labels or sum(bone) <= min_share * len(labels):
        return list(labels)
    proposal = parse_labels(parents, rest)
    return [p if b and p else l for l, p, b in zip(labels, proposal, bone)]
