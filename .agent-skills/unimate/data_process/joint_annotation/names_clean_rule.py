"""Rule-based joint-name cleaning: ``joint_names.json`` → ``clean_joint_names.json``.

Applies prefix stripping, CamelCase splitting, Japanese translation and
canonical anatomical vocabulary mapping. The vocabulary lives in
:mod:`vocab`; :mod:`names_clean_llm` is the LLM-based complement and uses
this module as its fallback.

Usage:
    python -m data_process.joint_annotation.names_clean_rule \
        --input <export_dir>/joint_names.json [--output ...] [--report]
"""

import argparse
import json
import os
import re
import sys
import tempfile
import unicodedata

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from data_process.joint_annotation.vocab import (
    CANONICAL,
    ELK_MAP,
    FOREIGN_PARTS,
    JAPANESE_COMPOUND_ANIMALS,
    JAPANESE_COMPOUND_NAMES,
    JAPANESE_WORDS_LOWER,
    JT_MAP,
    MIXAMO_MAP,
    NPC_DIRECT,
    PIRRANA_COMPOUNDS,
    REMOVE_PREFIXES,
    SABRECAT_MAP,
    SIDE_WORDS,
    SPIDER_MAP,
    STANDALONE_MAP,
    is_canonical_label,
)


# ---------------------------------------------------------------------------
# Common helpers
# ---------------------------------------------------------------------------

# Explicit ``_L_`` / ``_R_`` / ``.L`` / ``.R`` side token: an isolated L or R
# delimited by an underscore/dot on the left and by a delimiter, a digit or
# the end of the name on the right. This is the strongest side marker a raw
# bone name carries, so it outranks a bare single-letter prefix.
_SIDE_TOKEN_RE = re.compile(r'[._]([LR])(?=[._]|\d|$)')

# A leading single L/R only marks a side when what follows reads as a word
# ("LThigh", "LEar", "LWing01") or as a short side abbreviation followed by a
# word ("LB_foot", "LT_BackFoot_09", "LFT_ankle_09"). All-caps tokens
# ("ROOT_01", "RIG_01", "LOD", "LEG", "RUG_01") and rig namespaces
# ("LP1:Head") must NOT match — there the L/R is part of the word itself.
_SINGLE_SIDE_RE = re.compile(r'^[LR](?:[A-Z][a-z]|[A-Z]{0,2}_[A-Za-z])')

# Trailing Blender/Rigify decorations: '.NNN' duplicate counters, '.NN' chain
# indices, Objaverse '_NN' global indices, '.x' center markers and '.L'/'.R'
# ('.l'/'.r') side tokens stack in any order at the end of a name
# ('thumb.01.R_037', 'Bone.005.R', 'spine_01.x', 'Index.R.001_013_6'). The
# separator requirement keeps lookup keys like 'Spine2' / 'Tail01' intact.
_TRAILING_TOKEN_RE = re.compile(r'[._](\d+|[LRlr]|x)$')

# 3ds Max Biped numeric finger codes (0-based): 'Finger0'/'Finger01' = thumb
# chain; trailing digits after the code are chain position.
_FINGER_CODE_RE = re.compile(r'^[Ff]inger([0-4])\d*(Nub)?$')
_FINGER_CODE = {"0": "Thumb", "1": "Index", "2": "Middle", "3": "Ring",
                "4": "Pinky"}
# 3ds Max CAT digits (1-based finger, then segment): 'Digit21' = index.
_DIGIT_CODE_RE = re.compile(r'^Digit([1-5])\d*$')
# CMU / mocap-style segmented fingers (1-based): 'Finger1Metacarpal' etc.
_FINGER_SEG_RE = re.compile(
    r'^[Ff]inger([1-5])(Metacarpal|Proximal|Medial|Distal|Tip)\d*$')
_FINGER_ORD = {"1": "Thumb", "2": "Index", "3": "Middle", "4": "Ring",
               "5": "Pinky"}

# 'Bone001(mirrored)' and similar editor bookkeeping — anywhere in the name,
# since the Objaverse global index can trail it: 'Bone018(mirrored)_079'.
_PAREN_DECOR_RE = re.compile(r'\s*\([^)]*\)')

# Any leading '<word>:' rig namespace ('RenWu2:', 'candi_aaaaaa2:'). Known
# ones (mixamorig:, Mutant:, Sif:) are handled earlier with their own maps.
_NAMESPACE_RE = re.compile(r'^[A-Za-z][\w .-]*:')

# Generic 3ds Max Biped container prefix: Bip01_/Bip002 /Bip01-/Bip001L...
# (any index; separator optional when a side letter follows), optionally
# behind a BN_ namespace.
_BIP_PREFIX_RE = re.compile(r'^(?:BN_)?Bip\d+(?:[-_ ]+|(?=[LR][A-Z]))')


# An end bone's name ending: 'LeftToesEND', 'Foot.L_end', 'Bip01 R Toe0Nub'.
_END_SUFFIX_RE = re.compile(r'(?:[_.\s]end|End|END|Nub)$')
# FBX ASCII escapes in names written by some exporters ('FBXASC032' = space).
_FBX_ESCAPE_RE = re.compile(r'FBXASC(\d{3})')
# Words of a raw name: capital runs ('CAT', 'R'), Capitalized or lower-case
# words, digit runs ('LowManRightUpLeg' -> Low Man Right Up Leg).
_WORD_RE = re.compile(r'[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+')
# Leg codes of legged robots and quadruped rigs: Front / Rear / Back / Hind,
# then the side ('FR_hip', 'RL_calf', 'fl_knee'); the reviewed labels write
# every hind leg as 'Back'. Accepted only when the rest is a known part.
_LEG_CODE_RE = re.compile(r'^([FRBHfrbh])([LRlr])[_.](\w+)$')
_LEG_QUALIFIER = {'F': 'Front', 'R': 'Back', 'B': 'Back', 'H': 'Back'}


def extract_leg_code(name):
    # type: (str) -> Tuple[str, str]
    """``(side, label)`` of a leg-coded name ('RL_calf' -> Left, 'Back Shin'),
    else ``('', '')``. Runs before the generic side rules, which would read
    'RL_' as Right."""
    m = _LEG_CODE_RE.match(name)
    if not m:
        return '', ''
    label = _part_label(_WORD_RE.findall(m.group(3)))
    if not label or label == 'Bone':
        return '', ''
    return ('Left' if m.group(2).upper() == 'L' else 'Right'), \
        f'{_LEG_QUALIFIER[m.group(1).upper()]} {label}'
# A lower-case side letter glued to, or dotted onto, a part word ('rthigh',
# 'l.brazo'); accepted only when the rest is a known part.
_LOWER_SIDE_RE = re.compile(r'^([lr])[._]?([a-z]{2,})\d*$')


def _part_label(tokens):
    """Canonical label of a run of word tokens ('Up', 'Leg' -> 'Thigh';
    'Muslo' -> 'Thigh'), or '' when none of it is a known part."""
    words = [t for t in tokens if not t.isdigit()]
    if not words:
        return ''
    joined = _canon(''.join(w[:1].upper() + w[1:] for w in words))
    if joined:
        return joined
    out = []
    for w in words:
        value = _canon(w)
        if value is None:
            plain = unicodedata.normalize('NFKD', w).encode('ascii', 'ignore').decode().lower()
            value = FOREIGN_PARTS.get(plain)
        if value:
            out.append(value)
    if not out:
        # A canonical part no map lists ('hip'), when nothing else names it.
        out = [w.capitalize() for w in words
               if w.lower() not in ('end', 'nub') and is_canonical_label(w.capitalize())]
    return ' '.join(out)


def extract_inner_side(name):
    # type: (str) -> Tuple[str, str]
    """Side word inside a name that carries rig words around it, for names the
    prefix/suffix rules miss: 'LowManRightUpLeg', 'robo_RightUpLeg',
    'HumanRCollarbone', 'CATRigRLeg1', 'Muslo_Der_01', 'jambe_droite',
    'rthigh_12', 'l.brazo_1'.

    A side word (``vocab.SIDE_WORDS``, any of its languages) or a single
    capital L/R between words marks the side; the label comes from the words
    after the marker, else before it, and must be a known part (``CANONICAL``
    or ``vocab.FOREIGN_PARTS``) — rig words alone never produce a side.
    Returns ``(side, label)``, or ``('', '')``.
    """
    m = _LOWER_SIDE_RE.match(name)
    if m:
        label = _part_label([m.group(2)])
        if label and label != 'Bone':
            return ('Left' if m.group(1) == 'l' else 'Right'), label
    tokens = _WORD_RE.findall(name)
    marks, sides = [], set()
    for i, tok in enumerate(tokens):
        side = SIDE_WORDS.get(tok.lower())
        if side is None and tok in ('L', 'R') and i > 0:
            side = 'Left' if tok == 'L' else 'Right'
        if side:
            marks.append(i)
            sides.add(side)
    if len(sides) != 1:
        return '', ''
    m = re.search(r'Digit([1-5])', name)
    if m:
        return sides.pop(), _FINGER_ORD[m.group(1)] + ' Finger'
    # Words between markers, those after a marker first (a rig prefix sits
    # before the side, a Romance-language side after the part).
    bounds = [-1] + marks + [len(tokens)]
    segments = [tokens[bounds[k] + 1:bounds[k + 1]] for k in range(len(bounds) - 1)]
    labels = [_part_label(segment) for segment in segments[1:] + segments[:1]]
    labels = [label for label in labels if label and label != 'Bone']
    if not labels:
        return '', ''
    if labels[0] == 'End' and len(labels) > 1:
        # 'ankle_left_tip': the end marker after the side ends the part before it
        return sides.pop(), f'{labels[1]} End'
    return sides.pop(), labels[0]


def strip_trailing_decorations(name):
    # type: (str) -> Tuple[str, str]
    """Peel stacked trailing ``[._]``-separated tokens off *name*.

    Digit groups and ``x`` center markers are dropped; the innermost ``L``/
    ``R`` token wins as the side. Returns ``(side, base)`` with ``side`` one
    of ``""`` / ``"Left"`` / ``"Right"``.
    """
    side = ""
    while True:
        m = _TRAILING_TOKEN_RE.search(name)
        if not m:
            return side, name
        tok = m.group(1)
        if tok in ("L", "l"):
            side = "Left"
        elif tok in ("R", "r"):
            side = "Right"
        name = name[:m.start()]


def _canon(token):
    # type: (str) -> Optional[str]
    """CANONICAL lookup, tolerating all-lower/all-upper raw tokens
    ('thumb' -> 'Thumb Finger'). Exact match wins so CamelCase keys like
    'UpLeg' are never shadowed by their capitalize() form."""
    value = CANONICAL.get(token)
    if value is None and token and token != token.capitalize():
        value = CANONICAL.get(token.capitalize())
    return value


def extract_side_prefix(name):
    # type: (str) -> Tuple[str, str]
    """Extract Left/Right side from common prefix/suffix patterns.

    Handles: R_/L_ prefix, Left_/Right_ prefix, single R/L followed by
    uppercase, _L_NN/_R_NN suffix, _L/_R suffix. Guards against false
    positives on words that begin with R or L followed by a lowercase letter
    (e.g. "Ribcage", "Lower..."), on all-caps tokens that merely start with
    one ("ROOT_01", "RIG_01", "LEG") and on rig namespaces ("LP1:Head").

    Markers are ranked: an explicit ``_L_``/``_R_``/``.L``/``.R`` token beats
    a bare single-letter prefix, because rigs that carry both use the token as
    the real side ("LLeg.R_08" is the RIGHT leg, "LB_R_Shoulder_DEF" the RIGHT
    shoulder). A wrong side here silently rotates the clip 180 degrees, since
    the side flows into face_select -> get_root_facing_quat.

    Returns:
        (side, remaining_name) where side is "" | "Left" | "Right".
    """
    # Trailing Blender/Rigify decorations first: '.L'/'.R' side tokens mixed
    # with '.NNN'/'_NN' counters ('thumb.01.R_037' -> Right 'thumb'). When no
    # side is found the stripped base still flows into the prefix checks.
    side, name = strip_trailing_decorations(name)
    if side:
        # A symmetrized bone keeps its pre-mirror text: Blender renames only
        # the suffix, so 'mixamorig:LeftShoulder.R' / 'r_toe.L' carry a STALE
        # leading side word. The trailing token is the real side — drop the
        # leftover prefix so it can't pollute the vocabulary lookup.
        stripped = re.sub(
            r'^(?:Left|Right)(?=[A-Z])|^(?:Left|Right)[_ ]|^[LR][-_]|^[lr]_',
            '', name)
        return side, stripped or name

    # R_X / L_X / R-X / L-X / R.X / L.X prefix
    if re.match(r'^[RL][-_.]', name):
        side = "Left" if name[0] == "L" else "Right"
        return side, name[2:]

    # "R X" / "L X" prefix with space separator (e.g. "Bip01 L UpperArm"
    # becomes "L UpperArm" after prefix strip, then "UpperArm").
    m = re.match(r'^([RL]) +', name)
    if m:
        side = "Left" if m.group(1) == "L" else "Right"
        return side, name[m.end():]

    # Left_X or Right_X prefix (case-insensitive)
    m = re.match(r'^(Left|Right)_', name, re.IGNORECASE)
    if m:
        return m.group(1).capitalize(), name[len(m.group(0)):]

    # "Left" / "Right" directly followed by uppercase (Mixamo: LeftHandThumb1).
    m = re.match(r'^(Left|Right)(?=[A-Z])', name)
    if m:
        return m.group(1), name[len(m.group(1)):]

    # Single L/R followed by uppercase (e.g., LThigh, RArm). The weakest of
    # the side markers, so it is deliberately narrow:
    #   * an explicit _L_/_R_/.L/.R token later in the name is the real
    #     marker and wins ("LLeg.R_08" is the RIGHT leg, "LB_R_Shoulder_DEF"
    #     the RIGHT shoulder);
    #   * all-caps tokens ("ROOT_01", "RIG_01", "LEG") and rig namespaces
    #     ("LP1:Head") carry no side at all.
    if len(name) > 1 and name[0] in "LR" and name[1].isupper():
        m = _SIDE_TOKEN_RE.search(name, 1)
        if m:
            side = "Left" if m.group(1) == "L" else "Right"
            rest = (name[:m.start()] + name[m.end():]).strip("._")
            return side, rest or name
        if _SINGLE_SIDE_RE.match(name):
            side = "Left" if name[0] == "L" else "Right"
            return side, name[1:]

    # _L_NN or _R_NN suffix
    m = re.search(r'_([LR])_(\d+)$', name)
    if m:
        side = "Left" if m.group(1) == "L" else "Right"
        return side, name[:m.start()] + "_" + m.group(2)

    # _L or _R suffix
    m = re.search(r'_([LR])$', name)
    if m:
        side = "Left" if m.group(1) == "L" else "Right"
        return side, name[:m.start()]

    return "", name


def split_and_map_tokens(name):
    # type: (str) -> str
    """Split a CamelCase/underscore name and map tokens via CANONICAL.

    Tokens mapping to ``""`` (rig noise like 'Joint'/'Jnt') are dropped.
    """
    tokens = re.split(r'(?=[A-Z])|_', name)
    mapped = []
    for t in tokens:
        if not t:
            continue
        base = re.sub(r'\d+$', '', t)
        value = _canon(base)
        if value is not None:
            if value:
                mapped.append(value)
        elif base and len(base) > 1:
            mapped.append(base)
    return " ".join(mapped)


def with_side(side, result):
    # type: (str, str) -> str
    """Prepend side to result, replacing any side the mapping already carries.

    A side extracted from the raw name (``R_``/``L_``, ``_L_``/``_R_``, ...)
    is an explicit marker and outranks one baked into a vocabulary entry, so
    ``with_side("Right", "Left Wing")`` yields ``"Right Wing"`` — otherwise
    ``R_LWing`` would clean to ``Left Wing`` via ``CANONICAL["LWing"]``.
    """
    if not side:
        return result
    m = re.match(r'^(Left|Right)\b\s*', result)
    if m:
        result = result[m.end():]
    return (side + " " + result).strip()


# ---------------------------------------------------------------------------
# Skeleton-specific cleaners
# ---------------------------------------------------------------------------

def clean_japanese_name(name):
    """Handle fully Japanese joint names (Alligator, Pirrana, Tukan style)."""
    side, name = extract_side_prefix(name)

    base = re.sub(r'\d+$', '', name)
    lower = base.lower()
    if lower in JAPANESE_WORDS_LOWER:
        return with_side(side, JAPANESE_WORDS_LOWER[lower])

    # Pirrana-specific compound words (side already encoded in the value)
    if name in PIRRANA_COMPOUNDS:
        return PIRRANA_COMPOUNDS[name]

    return with_side(side, name)


def clean_prefixed_name(raw, prefix, rig_map, strip_trailing_c=False, skip_substrs=()):
    # type: (str, str, dict, bool, tuple) -> str
    """Generic cleaner for rigs with a fixed prefix and a lookup table.

    Strips ``prefix``, optionally drops a trailing ``_C`` (jt center bones),
    extracts Left/Right side, and maps via ``rig_map`` — exact match first,
    then digit-stripped base. Falls back to CANONICAL via
    :func:`split_and_map_tokens`. Names containing any of ``skip_substrs``
    (e.g. ``"Jiggle"`` for NPC physics bones) are dropped.
    """
    name = raw[len(prefix):]
    if strip_trailing_c and name.endswith("_C"):
        name = name[:-2]
    side, name = extract_side_prefix(name)

    for sub in skip_substrs:
        if sub in name:
            return ""  # post_process converts empty -> "Bone"

    result = rig_map.get(name)
    if result is None:
        result = rig_map.get(re.sub(r'\d+$', '', name))
    if result is None:
        result = split_and_map_tokens(name) or name

    return with_side(side, result).strip()


def clean_spider_name(raw):
    """Special handling for Spider skeleton names."""
    if raw in SPIDER_MAP:
        return SPIDER_MAP[raw]

    m = re.match(r'Fang([RL])_(\d+)_', raw)
    if m:
        side = "Right" if m.group(1) == "R" else "Left"
        return "{} Fang".format(side)

    m = re.match(r'Leg_([RL])_(\d)(\d)_', raw)
    if m:
        side = "Right" if m.group(1) == "R" else "Left"
        return "{} Leg".format(side)

    m = re.match(r'_([RL])Toe(\d)_', raw)
    if m:
        side = "Right" if m.group(1) == "R" else "Left"
        return "{} Leg Tip".format(side)

    return raw.strip("_")


def clean_standard_name(raw):
    """Clean standard Bip01/BN prefixed names."""
    name = _NAMESPACE_RE.sub("", raw) or raw
    name = _BIP_PREFIX_RE.sub("", name)

    for prefix in REMOVE_PREFIXES:
        if name.startswith(prefix):
            name = name[len(prefix):]
            break

    name = name.lstrip("_").strip()
    if not name:
        return raw.strip("_")

    code_side, label = extract_leg_code(name)
    if code_side:
        return with_side(code_side, label)
    side, name = extract_side_prefix(name)
    if not side:
        inner_side, label = extract_inner_side(name)
        if inner_side:
            return with_side(inner_side, label)

    # Numeric finger codes, before the chain-index strip eats the code digit:
    # CMU segments ('Finger1Metacarpal', 1-based) and 3ds Max Biped codes
    # ('Finger0'/'Finger01'/'Finger21', 0-based).
    m = _FINGER_SEG_RE.match(name)
    if m:
        label = _FINGER_ORD[m.group(1)] + " Finger"
        if m.group(2) == "Tip":
            label += " End"
        return with_side(side, label)
    m = _FINGER_CODE_RE.match(name)
    if m:
        label = _FINGER_CODE[m.group(1)] + " Finger"
        if m.group(2):
            label += " End"
        return with_side(side, label)
    m = _DIGIT_CODE_RE.match(name)
    if m:
        return with_side(side, _FINGER_ORD[m.group(1)] + " Finger")

    # Strip a trailing chain index: "Thigh_4" -> "Thigh", "Spine02" -> "Spine".
    m = re.match(r'^(.+?)_?(\d+)$', name)
    base = m.group(1).rstrip("_") if m else name

    mapped_base = _canon(base)
    if mapped_base is not None:
        # Placeholders and skip-tokens carry no side ('Bone.005.R' -> 'Bone').
        if not mapped_base or mapped_base == "Bone":
            return "Bone"
        return with_side(side, mapped_base)

    # Handle compound names with underscores
    parts = [p for p in base.split("_") if p]
    mapped = []
    for p in parts:
        # A bare L/R token only fills in a side that extract_side_prefix did
        # not already find; it must NOT override one, because the side it
        # returned came from a stronger marker (an explicit _L_/_R_/.L/.R
        # token). 'r_index_00_L_049' is the LEFT rear-paw index finger — the
        # leading 'r' means "rear", not "right".
        if p in ("L", "l"):
            side = side or "Left"
            continue
        if p in ("R", "r"):
            side = side or "Right"
            continue

        sub_base = re.sub(r'\d+$', '', p)
        sub_mapped = _canon(sub_base)
        if sub_mapped is not None:
            if sub_mapped:
                mapped.append(sub_mapped)
        elif sub_base:
            sub_tokens = [t for t in re.split(r'(?=[A-Z])', sub_base) if t]
            for st in sub_tokens:
                st_mapped = _canon(st)
                if st_mapped is not None:
                    if st_mapped:
                        mapped.append(st_mapped)
                elif st and len(st) > 1:
                    mapped.append(st)

    result = " ".join(mapped)
    if not result:
        # Nothing anatomical survived (pure counters like '1.L', skip tokens
        # like 'internal50.L') -> placeholder, without a side.
        return "Bone"
    if result == "Bone":
        return "Bone"
    return with_side(side, result).strip() or raw


# ---------------------------------------------------------------------------
# Main dispatcher
# ---------------------------------------------------------------------------

# Matches any mixamorig-style namespace: mixamorig:, mixamorig1:, mixamorig7:,
# Mixamorig1:, MIXAMORIG:, ... The trailing digits and case both vary across
# rigs but the vocabulary beneath is the same.
_MIXAMORIG_RE = re.compile(r'^mixamorig\d*[:_]', re.IGNORECASE)


def name_words(raw):
    """Words of a raw joint name for the learned vocabulary: namespace,
    Biped prefix, counters and side markers dropped, lower-cased
    ('mixamorig:LeftUpLeg_012' -> up, leg; 'JNT_Muslo_Der_01' -> jnt, muslo)."""
    name = _PAREN_DECOR_RE.sub('', raw).strip() or raw
    name = _FBX_ESCAPE_RE.sub(lambda m: chr(int(m.group(1))), name)
    name = re.sub(r'^.*:', '', name)
    name = _BIP_PREFIX_RE.sub('', name)
    _, name = strip_trailing_decorations(name)
    words = [w.lower() for w in _WORD_RE.findall(name) if not w.isdigit()]
    return [w for w in words if w not in SIDE_WORDS and w not in ('l', 'r')]


def name_keys(raw):
    """Lookup keys of a raw name, longest first: its words and every shorter
    tail of them, so a rig-specific prefix ('doberman_ref_haunch') still
    reaches a learned tail ('haunch')."""
    words = name_words(raw)
    return ['_'.join(words[i:]) for i in range(len(words))]


def _learned_vocab(_cache=[]):
    """``{name_key: part label}`` learned from reviewed annotations
    (``learned_vocab.json``, written by ``learn_vocab.py``); empty if absent."""
    if not _cache:
        path = os.path.join(os.path.dirname(__file__), 'learned_vocab.json')
        keys = {}
        if os.path.isfile(path):
            with open(path) as f:
                keys = json.load(f).get('keys', {})
        _cache.append(keys)
    return _cache[0]


def _name_side(raw):
    bare = _NAMESPACE_RE.sub('', raw) or raw
    side, _ = extract_side_prefix(_BIP_PREFIX_RE.sub('', bare))
    return side or extract_inner_side(bare)[0]


# Bookkeeping names that say nothing about the body part: a placeholder.
_GENERIC_NAMES = frozenset({'extra', 'helper', 'dummy', 'null', 'joint', 'node', 'bone'})


def clean_joint_name(raw, animal, refine=True):
    """Clean one joint name: the rules below, then (*refine*) the label
    refinements the reviewed annotations support:

    - a placeholder or non-canonical label takes the learned vocabulary's part
      for the name (``learned_vocab.json``), keeping the name's side;
    - a placeholder keeps the side its name marks ('1.L' -> 'Left Bone');
    - a name ending in ``END`` / ``_end`` / ``Nub`` is an end bone
      ('LeftToesEND' -> 'Left Toe End').

    ``refine=False`` is the label set the face resolver uses
    (``rig_preprocess.annotate.rule_annotation``).
    """
    out = _clean_joint_name_rules(raw, animal)
    if not refine or not raw or not raw.strip():
        return out
    cleaned = post_process(out)
    side_m = re.match(r'^(Left|Right) ', cleaned)
    if re.sub(r'^(Left|Right) ', '', cleaned).lower() in _GENERIC_NAMES:
        out = cleaned = with_side(side_m.group(1) if side_m else None, 'Bone')
    if cleaned == 'Bone' or not is_canonical_label(cleaned):
        vocab = _learned_vocab()
        label = next((vocab[k] for k in name_keys(raw) if k in vocab), None)
        if label:
            side = re.match(r'^(Left|Right)\b', cleaned)
            out = with_side(side.group(1) if side else _name_side(raw), label)
            cleaned = post_process(out)
    if cleaned == 'Bone':
        side, _ = strip_trailing_decorations(_PAREN_DECOR_RE.sub('', raw).strip() or raw)
        return with_side(side, 'Bone')
    if (_END_SUFFIX_RE.search(re.sub(r'[._]\d+$', '', raw)) and not cleaned.endswith(' End')
            and not re.match(r'^_?\d+$', cleaned)):
        return out + ' End'
    return out


def _clean_joint_name_rules(raw, animal):
    """Main dispatcher for cleaning a single joint name."""
    if not raw or not raw.strip():
        return raw

    # Editor bookkeeping suffixes: 'Bone001(mirrored)' -> 'Bone001'
    raw = _PAREN_DECOR_RE.sub("", raw).strip() or raw
    raw = _FBX_ESCAPE_RE.sub(lambda m: chr(int(m.group(1))), raw)

    # Generic "BoneNN" placeholders -> "Bone" (dot forms via clean_standard_name)
    if re.match(r'^Bone\d+$', raw):
        return "Bone"

    # Numeric only names — return unchanged
    if re.match(r'^_?\d+$', raw.strip("_")):
        return raw

    m = _MIXAMORIG_RE.match(raw)
    if m:
        return clean_prefixed_name(raw, m.group(0), MIXAMO_MAP)

    if raw in STANDALONE_MAP:
        return STANDALONE_MAP[raw]

    if raw in SABRECAT_MAP:
        return SABRECAT_MAP[raw]

    if animal == "Spider":
        return clean_spider_name(raw)

    if raw.startswith("Sabrecat"):
        return SABRECAT_MAP.get(raw, raw)

    if raw.startswith("NPC_"):
        return clean_prefixed_name(raw, "NPC_", NPC_DIRECT, skip_substrs=("Jiggle",))

    if raw.startswith("Elk"):
        return clean_prefixed_name(raw, "Elk", ELK_MAP)

    if raw.startswith("jt_"):
        return clean_prefixed_name(raw, "jt_", JT_MAP, strip_trailing_c=True)

    # Japanese names: strip side + trailing digits, check vocabulary
    base_lower = re.sub(r'^[RL]_', '', raw).lower()
    base_lower = re.sub(r'\d+$', '', base_lower)
    if base_lower in JAPANESE_WORDS_LOWER:
        return clean_japanese_name(raw)

    if animal in JAPANESE_COMPOUND_ANIMALS and raw in JAPANESE_COMPOUND_NAMES:
        return clean_japanese_name(raw)

    return clean_standard_name(raw)


def limb_context(labels, parents):
    """Resolve the generic limb words a rig's hierarchy disambiguates (Mixamo
    convention, which the reviewed labels follow): a ``Leg`` whose parent is
    a ``Thigh`` is the shin; an ``Arm`` with a ``Forearm`` child is the upper
    arm. Returns a new list."""
    def part(label):
        return re.sub(r'^(Left|Right) ', '', label)

    def side(label):
        m = re.match(r'^(Left|Right) ', label)
        return m.group(1) if m else ''

    out = list(labels)
    for j, label in enumerate(labels):
        p = int(parents[j])
        if part(label) == 'Leg' and p >= 0 and part(labels[p]) == 'Thigh':
            out[j] = with_side(side(label), 'Shin')
        elif part(label) == 'Arm' and any(int(parents[k]) == j and part(labels[k]) == 'Forearm'
                                          for k in range(len(labels))):
            out[j] = with_side(side(label), 'Upper Arm')
    return quadruped_leg_chains(out, parents)


# Segment labels of a quadruped leg chain, root to tip, in the Truebones
# convention the reviewed labels follow: hind legs by chain length, front
# legs after an optional shoulder (a paw tip is a 'Thumb Finger').
_HIND_CHAINS = {1: ['Thigh'], 2: ['Thigh', 'Shin'], 3: ['Thigh', 'Shin', 'Foot'],
                4: ['Thigh', 'Shin', 'Fetlock', 'Foot']}
_HIND_LONG = ['Thigh', 'Shin', 'Fetlock', 'Foot', 'Toe']
_FRONT_CHAIN = ['Upper Arm', 'Forearm', 'Hand', 'Thumb Finger']
_LEG_SEGMENT_RE = re.compile(r'^(Left|Right) (Front|Back|Hind|Rear) Leg\b(.*)$')


def _chain_labels(template, n):
    return [template[min(i, len(template) - 1)] for i in range(n)]


def quadruped_leg_chains(labels, parents):
    """Relabel leg chains named by position rather than by part
    (``Back_Leg_Upper_L`` -> 'Left Back Leg Upper'): every non-canonical
    '<Side> <Front|Back> Leg ...' joint, the joints of its chain (single
    same-side children below, a same-side Shoulder / Hips-like joint above)
    get the segment labels of their position in the chain, except joints
    that already carry a canonical part label. Chains with no such joint are
    left alone. Returns a new list."""
    parents = [int(p) for p in parents]
    children = {}
    for j, p in enumerate(parents):
        children.setdefault(p, []).append(j)
    out = list(labels)
    done = set()
    for j, label in enumerate(labels):
        m = _LEG_SEGMENT_RE.match(label)
        if j in done or not m or is_canonical_label(label):
            continue
        side, front = m.group(1), m.group(2) == 'Front'
        top = j                       # climb to the chain's first leg-segment joint
        while parents[top] >= 0:
            pm = _LEG_SEGMENT_RE.match(labels[parents[top]])
            if not (pm and pm.group(1) == side and (pm.group(2) == 'Front') == front):
                break
            top = parents[top]
        p = parents[top]
        if front and p >= 0 and labels[p] in (f'{side} Shoulder', f'{side} Clavicle'):
            top = p
        chain = [top]
        while True:
            kids = [k for k in children.get(chain[-1], [])
                    if labels[k].startswith(side + ' ')]
            if len(kids) != 1:
                break
            chain.append(kids[0])
        done.update(chain)
        ends = [labels[k].endswith(' End') for k in chain]
        core = [k for k, e in zip(chain, ends) if not e]
        if not core:
            continue
        if front:
            # A shoulder-like first joint, or one more joint than the arm
            # template names before the paw tip, is the shoulder.
            shoulder = (any(w in labels[core[0]] for w in ('Shoulder', 'Clavicle', 'Scapula'))
                        or len(core) > len(_FRONT_CHAIN))
            names = (['Shoulder'] if shoulder else []) + _chain_labels(
                _FRONT_CHAIN, len(core) - shoulder)
        else:
            names = _HIND_CHAINS.get(len(core)) or _chain_labels(_HIND_LONG, len(core))
        last = None
        for k, e in zip(chain, ends):
            if e:
                if last and _replaceable(labels[k][:-len(' End')]):
                    out[k] = with_side(side, f'{last} End')
            else:
                last = names.pop(0)
                if _replaceable(labels[k]):
                    out[k] = with_side(side, last)
                else:
                    last = re.sub(r'^(Left|Right) ', '', labels[k])
    return out


def _replaceable(label):
    """A chain joint's label the position label replaces: a positional leg
    name or any non-canonical one; a canonical part label is kept."""
    return bool(_LEG_SEGMENT_RE.match(label)) or not is_canonical_label(label)


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------

def post_process(name):
    """Final cleanup pass."""
    # rstrip only: a leading '_' marks the untouched numeric passthrough
    # names ('_00') and must survive.
    name = re.sub(r'\s+', ' ', name).strip().rstrip('._ ')

    # Strip trailing chain indices: "Tail 3" -> "Tail"
    name = re.sub(r'\s+\d+$', '', name)

    # Strip numbers before End: "Toe0 End" -> "Toe End"
    name = re.sub(r'(\w)\d+\s+End', r'\1 End', name)

    # Canonical-format rewrites for compositional leftovers. The finger
    # chain's 'Hand' segment is context, not a label word; UE/mixamo split
    # forms collapse to their canonical terms.
    name = re.sub(r'\bHand (Thumb|Index|Middle|Ring|Pinky) Finger\b', r'\1 Finger', name)
    name = re.sub(r'\b(Thumb|Index|Middle|Ring|Pinky) Finger Finger\b', r'\1 Finger', name)
    name = re.sub(r'\bFinger (Thumb|Index|Middle|Ring|Pinky) Finger\b', r'\1 Finger', name)
    name = re.sub(r'\b(?:Up|Upper) Leg$', 'Thigh', name)
    name = re.sub(r'\bLower Leg$', 'Shin', name)
    name = re.sub(r'\b(?:Lower|Fore) Arm$', 'Forearm', name)
    name = re.sub(r'\bToe Base$', 'Toe', name)
    # Trailing side word -> canonical leading position ('Index Finger Left')
    name = re.sub(r'^(?!Left |Right )(.+) (Left|Right)$', r'\2 \1', name)
    name = re.sub(r'^Head Top End$', 'Head End', name)
    name = name.replace('. ', ' ')

    # Dog-specific patches for misrouted head/spine subparts (with or
    # without the chain digit, which earlier passes may already strip)
    name = re.sub(r'^Spine ?\d* ?Tail$', 'Tail', name)
    name = re.sub(r'^Head ?\d* ?Jaw$', 'Jaw', name)
    name = re.sub(r'^Head ?\d* ?Eyelid$', 'Eyelid', name)
    name = re.sub(r'^Head Muzzle$', 'Muzzle', name)
    name = re.sub(r'^Head Jaw End$', 'Jaw End', name)
    name = re.sub(r'^Head Brain$', 'Head', name)

    # Clean leftover Bip01 fragments
    name = re.sub(r'Bip \d+ ', '', name)

    # "Spine Spine" -> "Spine"
    name = re.sub(r'^(\w+) \1$', r'\1', name)

    if re.match(r'^Xtra', name):
        name = "Bone"

    name = re.sub(r'Ponytail\d*.*', 'Appendage', name)

    # Title case consistency: "Right leg" -> "Right Leg"
    words = name.split()
    name = " ".join(w.capitalize() if w[0].islower() and len(w) > 1 else w for w in words)

    name = re.sub(r'^Spine (Left|Right) Wing$', r'\1 Wing', name)
    name = re.sub(r'\s+\d+$', '', name)

    if not name:
        return "Bone"
    return name


# ---------------------------------------------------------------------------
# Coverage reporting
# ---------------------------------------------------------------------------

_UNMAPPED_PATTERN = re.compile(r'[_\d]|[a-z]{2,}[A-Z]')


def _looks_unmapped(cleaned):
    """Heuristic: residual underscores, digits, or CamelCase runs suggest
    the name fell through the rules without hitting a canonical mapping."""
    return bool(_UNMAPPED_PATTERN.search(cleaned))


def report_coverage(clean_data):
    """Per-rig conformance to the shared canonical label format
    (:func:`vocab.is_canonical_label`); 'Bone' counts as conforming."""
    from data_process.joint_annotation.vocab import is_canonical_label
    total = 0
    unmapped = 0
    print("\n=== Canonical-format report ===")
    for animal, labels in clean_data.items():
        bad = [l for l in labels
               if l != "Bone" and not is_canonical_label(l)]
        total += len(labels)
        unmapped += len(bad)
        if bad:
            preview = ", ".join(sorted(set(bad))[:5])
            print("  {:20s} {:3d}/{:3d} residual: {}".format(
                animal, len(bad), len(labels), preview))
    pct = 100.0 * (1 - unmapped / max(total, 1))
    print("Overall: {}/{} labels clean ({:.1f}%)".format(
        total - unmapped, total, pct))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Rule-based joint-name cleaning.")
    parser.add_argument("--input", required=True,
                        help="Path to the raw joint_names.json")
    parser.add_argument("--output", default=None,
                        help="Output path (default: sibling 'clean_joint_names.json')")
    parser.add_argument("--report", action="store_true",
                        help="Print a per-rig coverage report")
    args = parser.parse_args()

    input_path = args.input
    output_path = args.output or os.path.join(
        os.path.dirname(input_path), "clean_joint_names.json")

    with open(input_path, "r") as f:
        data = json.load(f)

    clean_data = {}
    for animal, joints in data.items():
        clean_data[animal] = [post_process(clean_joint_name(j, animal)) for j in joints]

    # Atomic write (temp file + os.replace), like every other annotation
    # writer: a crash mid-dump must not leave a truncated
    # clean_joint_names.json that the LLM pass would then "resume" from.
    fd, tmp = tempfile.mkstemp(prefix=os.path.basename(output_path) + ".",
                               suffix=".tmp",
                               dir=os.path.dirname(output_path) or ".")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(clean_data, f, indent=2)
        os.replace(tmp, output_path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise

    print("Written {} entries to {}".format(len(clean_data), output_path))

    for animal in list(data.keys())[:5]:
        print("\n--- {} ---".format(animal))
        for raw, clean in zip(data[animal], clean_data[animal]):
            print("  {:50s} -> {}".format(raw, clean))

    if args.report:
        report_coverage(clean_data)


if __name__ == "__main__":
    main()
