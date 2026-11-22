#!/usr/bin/env python3
"""Post-stage-3 QA patch for the export sidecars (joint labels, face pairs,
captions).

The stage-2/3 outputs are produced by rules plus LLM passes and were audited
by hand. This script applies the resulting corrections so that
they are reproducible on a fresh run of the pipeline and recorded in one
place. Two kinds of fixes:

  rules (in this file)
    - unsided ``Pelvis`` / ``Hip`` -> ``Hips`` (one label for the root pelvis
      bone across every rig; ``Left Hip`` / ``Right Hip`` are untouched);
    - numeric pass-through labels (``_2``, ``_1045``) -> ``Bone``;
    - numbered leg / claw-arm chains of the arthropod rigs get anatomical
      positions (Thigh, Shin, Foot, Toe ... / Upper Arm, Forearm, Hand, Claw)
      instead of ``Leg`` repeated along the chain;
    - rigs whose second side is a Blender/Maya duplicate (``LeftUpLeg.001``,
      ``Leg_L1``, ``UPLEG.001`` ...) get their side prefixes from the rest-pose
      X coordinate (+X = the character's left). About 6% of objaverse rigs face
      the other way, so this runs only on the hand-verified rigs listed below
      and, automatically, on rigs whose own side-carrying raw names confirm the
      orientation and where one sided label sits on both sides of the body
      (a duplicated chain) — there only that chain is relabelled;
    - the ``clean`` fields of face_joint_names.json are re-synced;
    - objaverse (and general) rigs are flagged in ``rig_flags.json``: automatically when the
      facing pair cannot be trusted (``source: empty``, a Bone/Bone pair, a body
      axis through unnamed bones), plus the hand-reviewed categories. Only the
      ``FILTER_CATEGORIES`` rigs (``tpose_wrong``, ``not_in_legacy_raw``) are also
      written to ``filtered_objects.txt``, which stage 4 skips; every other flag is
      informational and the rig is kept;
    - caption grammar (``breaksdance`` -> ``breakdances``) and the one corpus
      subject phrase (``An object``, the same in all three datasets);
    - locomotion qualifiers grounded in the root trajectory: ``<verb> forward``
      with no root travel -> ``<verb> in place``; ``<verb> in place`` with clear
      travel -> ``<verb> forward|backward`` when the travel is clearly along the
      facing axis (|cos| > 0.8 averaged over the clip), otherwise the qualifier
      is dropped (thresholds in body heights, see ``--still`` / ``--travel``).

  manual overrides (JSON files in ``--patch_dir``; a step whose file is absent
  leaves its earlier output, e.g. a downloaded export's, as it is)
    <ds>_joint_labels.json   {rig: {raw_joint_name: clean_label}}
    <ds>_face_pairs.json     {rig: {"r_hip": raw, "l_hip": raw, "source": s,
                                    ["body_axis": true]}}
    <ds>_captions.json       {clip: caption}   (applied before the rules)
    <ds>_captions_llm.json   {clip: {"old", "new", "ok", "tries"}}   (vlm_caption/caption_rewrite_llm.py
                             output: an entry with ok true replaces the caption while it still equals
                             "old"; <ds>_captions.json wins for the same clip)
    <ds>_captions_generic.json  {clip: caption}   (the second, generic caption of every clip; the
                             patch is its only source. Same rules as above ->
                             export/<ds>/motion_captions_generic.json)
    <ds>_captions_detail.json   {clip: caption}   (the third, detail caption, 7-19 words; the same
                             way -> export/<ds>/motion_captions_detail.json)
    <ds>_categories.json     {rig: category}   (moves the rig in category_groups.json)
    <ds>_filtered_clips.txt  <clip>   # <reason>   (any dataset: individual clips ->
                             export/<ds>/filtered_clips.txt, skipped by stage 4)
    <ds>_clip_trims.txt      <clip> <N>   # <reason>   (any dataset: drop the first N frames of the clip's
                             export NPZ -> export/<ds>/clip_trims.txt, applied by stage 4 on load)
    <ds>_activity_keep.txt   <clip>   # <reason>   (any dataset: small but real motions exempt from
                             stage 4's low-activity filter -> export/<ds>/activity_keep.txt)
    <ds>_root_offsets.json   {clip: {"quat": [w, x, y, z], "reason": s}}   (any dataset: the source
                             file keyed the root joint with a constant extra rotation for the whole clip, so
                             the animal is tilted; export/<ds>/motions/<clip>.npz is REWRITTEN with
                             anim_local_rot[:, 0] = anim_local_rot[:, 0] * quat on every frame. Idempotent,
                             and undone when the entry is removed; see apply_root_offsets)
    <ds>_rest_orientation.json  {rig: {"quat": [w, x, y, z], "offset": [x, y, z], "reason": s}}   (any
                             dataset: the rig's rest pose lies, leans or is upside down; every
                             export/<ds>/motions/<rig>-*.npz is REWRITTEN with its rest pose moved by
                             p -> quat * p + offset in export space (offset optional); the
                             processed GLB applies the same rotation. Idempotent, undone when the entry
                             is removed; see apply_rest_orientations)
                             A zero or non-finite quat / offset in either JSON stops the run before any
                             file is written (check_quat_patches; apply_* check their own file too).
    <ds>_rig_flags.txt       <rig>    # <category>: <reason>   (objaverse / general: hand-reviewed rig
                             flags -> export/<ds>/rig_flags.json; only tpose_wrong / not_in_legacy_raw
                             also go to export/<ds>/filtered_objects.txt, which stage 4 skips)

  ``general`` (extra assets of your own in dataset/raw/general/animation, objaverse layout) gets the
  objaverse treatment: automatic side-from-x on duplicated chains and rig flags. Its patch
  files, if you write any, are named general_*.

Usage (from the repo root; ``dataset/export/<ds>`` may be symlinks):
    python data_process/tools/patch_annotations.py [--dry_run] [--datasets truebones mixamo]
    python data_process/tools/patch_annotations.py --export_root dataset/export \\
        --patch_dir dataset/UniML3D/patches

Pure numpy; reads one NPZ per rig for the rest pose and every clip NPZ once
for the root trajectory (cached in ``<patch_dir>/.root_motion_cache.json``).
"""

import argparse
import glob
import json
import os
import re
import sys
import tempfile
from collections import Counter, OrderedDict

import numpy as np

# Usually run as a script (`python data_process/tools/patch_annotations.py`),
# so the repo root is not on sys.path and `data_process` is not importable.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from data_process.utils.kinematics import (  # noqa: E402
    frame_global, qmul, qrot, rest_global,
)

DATASETS = ('truebones', 'mixamo', 'objaverse', 'general')
# Multi-object layouts (one rigged asset per object type, arbitrary rigs): automatic
# side-from-x on duplicated chains, rig_flags.json and filtered_objects.txt.
OBJECT_DATASETS = ('objaverse', 'general')
# One subject for the whole corpus. The three datasets are trained as one
# mixture, so a per-dataset subject ('An animal' / 'A person') would hand the
# text encoder a free dataset label and defeat the topology-agnostic
# conditioning. Keep this in sync with the `subject=` fields in
# data_process/vlm_caption/prompts.py.
SUBJECT = {ds: 'An object' for ds in DATASETS}

# Rigs whose multi-segment legs / claw arms are labelled by chain position.
CHAIN_RIGS = {
    'truebones': {
        'Crab': {'Leg': ('Thigh', 'Shin', 'Foot', 'Toe'), 'Upper Arm': ('Upper Arm', 'Forearm', 'Hand', 'Claw')},
        'HermitCrab': {'Leg': ('Thigh', 'Shin', 'Foot', 'Toe')},
        'Isopetra': {'Leg': ('Thigh', 'Shin', 'Foot', 'Toe')},
        'Spider': {'Leg': ('Thigh', 'Shin', 'Foot', 'Toe')},
        'SpiderG': {'Leg': ('Thigh', 'Shin', 'Foot', 'Toe')},
    },
}
# Rigs whose second side was created by duplicating the first (same side word
# or no side word in the raw names): side prefixes come from rest-pose X.
# Every rig here was checked to face +Z (so +X is its left) — by a foot->toe
# cue, by its own side-carrying raw names, or by its T-pose render.
X_SIDE_RIGS = {
    'objaverse': (
        '630247504c4b4f4b9b5c0371d89338c0',   # mixamorig:Left*.001 duplicates
        'b9d748ccc31344e2966d3f8176aed656',   # *Links / *Links.001 (Dutch "left")
        '669a872557bbceb71e864bc9_fbx',       # Leg_L / Leg_L1
        '669a6d9b57bbceb71e65252f_gltf',      # UPLEG / UPLEG.001 (unsided)
        '669a6f7f57bbceb71e679870_fbx',       # UPLEG / UPLEG.001 (unsided)
        '669a66c457bbceb71e5c8274_fbx',       # HIP_1 / HIP_2 (unsided)
        '669a858957bbceb71e84351d_fbx',       # shoulder_R / shoulder_R1
        '7f37f239817f41a2ad21b5f77cd0ff65',   # thigh.L / thigh.L.001
        '669a72e657bbceb71e6bfe20_fbx',       # Lhand / Rhand (unsided labels; names agree with X)
    ),
}
# Automatic candidates for side_from_x: a sided label that occurs on BOTH
# sides of the body (a duplicated appendage / whisker / finger chain labelled
# with one side) on a rig whose own raw names confirm the +X = left
# orientation (agreement >= X_SIDE_MIN_AGREE over >= X_SIDE_MIN_JOINTS sided
# joints). Rigs facing the other way are left alone.
X_SIDE_MIN_AGREE = 0.9
X_SIDE_MIN_JOINTS = 6
_RAW_SIDE_L = ('l', 'left', 'links', 'gauche', 'lewa', 'izq')
_RAW_SIDE_R = ('r', 'right', 'rechts', 'droit', 'prawa', 'der')

CENTER_LABELS = {'Root', 'Hips', 'Pelvis', 'Spine', 'Chest', 'Body', 'Neck', 'Head', 'Head End',
                 'Jaw', 'Tail', 'Bone', 'Center', 'Root End', 'Bone End', 'Abdomen', 'Ribcage'}

NUMERIC_RE = re.compile(r'^_?\d+$')
LOCO_VERBS = ('walks|runs|trots|jogs|sprints|marches|gallops|crawls|slithers|swims|flies|hops|'
              'bounds|scurries|waddles|limps|sneaks|strides|paddles|glides|dashes|skips|struts|'
              'creeps|prowls|stalks|shuffles|scampers|canters|flutters|soars|hovers|strolls|'
              'wanders|races')
CAPTION_FRAMES = 200   # blender_render.MAX_RENDER_FRAMES
FACING_COS = 0.8   # |cos(travel, facing)| needed to call travel forward / backward
LOCO_RE = re.compile(r'\b(%s)((?: \w+ly)?) (forward|in place)\b' % LOCO_VERBS)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path, default=None):
    if not os.path.isfile(path):
        return default
    with open(path) as f:
        return json.load(f, object_pairs_hook=OrderedDict)


def load_overrides(path):
    """Override JSON; keys starting with '_' (``_comment``) are documentation."""
    data = load_json(path, OrderedDict())
    return OrderedDict((k, v) for k, v in data.items() if not k.startswith('_'))


def save_json(path, obj, dry_run):
    """Atomic write (temp file in the target dir + ``os.replace``). The temp
    name is unique per process so two concurrent runs cannot clobber each
    other's half-written file."""
    if dry_run:
        return
    fd, tmp = tempfile.mkstemp(prefix=os.path.basename(path) + '.',
                               suffix='.tmp', dir=os.path.dirname(path) or '.')
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(obj, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def object_type_of(ds, clip):
    return 'mixamo' if ds == 'mixamo' else clip.split('-', 1)[0]


def rig_npz(root, ds, rig):
    if ds == 'mixamo':
        files = sorted(glob.glob(os.path.join(root, 'motions', '*.npz')))
    else:
        files = sorted(glob.glob(os.path.join(root, 'motions', rig + '-*.npz')))
    return files[0] if files else None


def split_side(label):
    m = re.match(r'^(Left|Right) (.+)$', label)
    return (m.group(1), m.group(2)) if m else ('', label)


# ---------------------------------------------------------------------------
# Joint labels
# ---------------------------------------------------------------------------

def unify_root_labels(clean, stats):
    for rig, labels in clean.items():
        # a lone unsided 'Hip' is the pelvis; several unsided 'Hip' labels are
        # lateral hip bones (HIP_1 / HIP_2) and keep their base for side_from_x
        lone_hip = labels.count('Hip') == 1
        for i, lab in enumerate(labels):
            if lab == 'Pelvis' or (lab == 'Hip' and lone_hip):
                labels[i] = 'Hips'
                stats['pelvis->hips'] += 1
            elif NUMERIC_RE.match(lab):
                labels[i] = 'Bone'
                stats['numeric->bone'] += 1


def relabel_chains(names, labels, parents, spec, stats):
    """Chains of identical '<Side> <Base>' labels get positional labels."""
    children = {i: [] for i in range(len(names))}
    for i, p in enumerate(parents):
        if p >= 0:
            children[p].append(i)
    for i in range(len(names)):
        side, base = split_side(labels[i])
        if base not in spec:
            continue
        p = parents[i]
        if p >= 0 and labels[p] == labels[i]:
            continue  # not the chain root
        seq = spec[base]
        j, k = i, 0
        while True:
            labels[j] = (side + ' ' + seq[min(k, len(seq) - 1)]).strip()
            stats['chain-relabel'] += 1
            nxt = [c for c in children[j] if split_side(labels[c]) == (side, base)]
            if len(nxt) != 1:
                break
            j, k = nxt[0], k + 1


def raw_side(name):
    """'L' / 'R' when a raw joint name carries a side token, else None."""
    n = name.lower()
    for prefix in ('mixamorig:', 'bip01', 'bip001'):
        n = n.replace(prefix, '')
    toks = [t for t in re.split(r'[^a-z]+', n) if t]
    if any(t in _RAW_SIDE_L or t.startswith('left') for t in toks):
        return 'L'
    if any(t in _RAW_SIDE_R or t.startswith('right') for t in toks):
        return 'R'
    return None


def needs_side_from_x(names, labels, d):
    """Base labels that sit on both sides of the body (a duplicated chain
    labelled with one side), or None — only for rigs whose raw names
    confirm the +X = left orientation."""
    g = rest_global(d)
    height = float(np.ptp(g, axis=0).max()) or 1.0
    x = (g[:, 0] - g[0, 0]) / height
    agree = total = 0
    seen = {}
    for i, (raw, lab) in enumerate(zip(names, labels)):
        if abs(x[i]) < 0.03:
            continue
        side, base = split_side(lab)
        if side:
            key = (side, base)
            seen.setdefault(key, set()).add(x[i] > 0)
        rs = raw_side(raw)
        if rs:
            total += 1
            agree += int((rs == 'L') == (x[i] > 0))
    both = {base for (_, base), v in seen.items() if len(v) == 2}
    if not both or total < X_SIDE_MIN_JOINTS:
        return None
    return both if agree / total >= X_SIDE_MIN_AGREE else None


def side_from_x(labels, d, stats, only_bases=None, min_dx=0.03):
    """+X = left, -X = right (rest pose); joints near the midline keep their label.

    ``only_bases`` restricts the relabel to those base labels (the duplicated
    chains of an auto-detected rig); the explicit rigs relabel every
    off-centre joint.
    """
    g = rest_global(d)
    height = float(np.ptp(g, axis=0).max()) or 1.0
    x0 = g[0, 0]
    for i, lab in enumerate(labels):
        _, base = split_side(lab)
        if base in CENTER_LABELS or (only_bases is not None and base not in only_bases):
            continue
        dx = (g[i, 0] - x0) / height
        if abs(dx) < min_dx:
            continue
        new = ('Left ' if dx > 0 else 'Right ') + base
        if new != lab:
            labels[i] = new
            stats['side-from-x'] += 1


def patch_joint_labels(ds, root, clean, names, overrides, stats, log):
    unify_root_labels(clean, stats)
    for rig, spec in CHAIN_RIGS.get(ds, {}).items():
        if rig not in clean:
            continue
        f = rig_npz(root, ds, rig)
        if not f:
            log.append(f'[{ds}] {rig}: no NPZ, chain relabel skipped')
            continue
        relabel_chains(names[rig], clean[rig], np.load(f, allow_pickle=True)['parents'], spec, stats)
    explicit = set(X_SIDE_RIGS.get(ds, ()))
    for rig in sorted(explicit):
        if rig not in clean:
            continue
        f = rig_npz(root, ds, rig)
        if not f:
            log.append(f'[{ds}] {rig}: no NPZ, side-from-x skipped')
            continue
        side_from_x(clean[rig], np.load(f, allow_pickle=True), stats)
    if ds in OBJECT_DATASETS:  # auto: duplicated-side chains on rigs that face +Z per their names
        for rig in clean:
            if rig in explicit:
                continue
            f = rig_npz(root, ds, rig)
            if not f:
                continue
            d = np.load(f, allow_pickle=True)
            bases = needs_side_from_x(names[rig], clean[rig], d)
            if bases:
                stats['side-from-x-auto-rig'] += 1
                side_from_x(clean[rig], d, stats, only_bases=bases, min_dx=0.05)
    for rig, mapping in (overrides or {}).items():
        if rig not in clean:
            log.append(f'[{ds}] override for unknown rig {rig!r} ignored')
            continue
        for raw, label in mapping.items():
            if raw not in names[rig]:
                log.append(f'[{ds}] {rig}: override for unknown joint {raw!r} ignored')
                continue
            idx = names[rig].index(raw)
            if clean[rig][idx] != label:
                clean[rig][idx] = label
                stats['manual-label'] += 1


# ---------------------------------------------------------------------------
# Face pairs
# ---------------------------------------------------------------------------

def unreliable_facing(entry):
    if not entry or entry.get('source') == 'empty' or not entry['r_hip']['raw']:
        return 'empty'
    r, l = entry['r_hip']['clean'], entry['l_hip']['clean']
    if r == l == 'Bone':
        return 'bone/bone pair'
    if entry.get('body_axis') and ('Bone' in (r, l)):
        return 'body axis through unnamed bones'
    return ''


def patch_face_pairs(ds, face, clean, names, overrides, stats, log):
    for rig, spec in (overrides or {}).items():
        if rig not in names:
            log.append(f'[{ds}] face override for unknown rig {rig!r} ignored')
            continue
        entry = OrderedDict()
        for key in ('r_hip', 'l_hip'):
            raw = spec[key]
            if raw not in names[rig]:
                raise SystemExit(f'[{ds}] {rig}: face override joint {raw!r} not in rig')
            entry[key] = {'raw': raw, 'clean': ''}
        entry['source'] = spec.get('source', 'manual')
        if spec.get('body_axis'):
            entry['body_axis'] = True
        face[rig] = entry
        stats['manual-face-pair'] += 1
    # re-sync clean labels
    for rig, entry in face.items():
        if rig not in names or not entry.get('r_hip', {}).get('raw'):
            continue
        for key in ('r_hip', 'l_hip'):
            raw = entry[key]['raw']
            if raw in names[rig]:
                new = clean[rig][names[rig].index(raw)]
                if entry[key].get('clean') != new:
                    entry[key]['clean'] = new
                    stats['face-clean-resync'] += 1
        # re-sync source: it names what the pair is, so it follows the labels
        # ('manual' overrides and relabelled Bone pairs otherwise keep a stale tag)
        if entry.get('body_axis'):
            src = 'body_axis'
        else:
            parts = {re.sub(r'^(Left|Right)\s+|\s+End$', '', entry[k]['clean']).lower()
                     for k in ('r_hip', 'l_hip')}
            src = parts.pop() if len(parts) == 1 else entry.get('source')
        if src and entry.get('source') != src:
            entry['source'] = src
            stats['face-source-resync'] += 1


# Rig flag categories. Only FILTER_CATEGORIES end up in filtered_objects.txt (stage 4 skips
# them); every other category is just recorded in rig_flags.json.
AUTO_FLAG = {'empty': 'empty_pair', 'bone/bone pair': 'bone_pair',
             'body axis through unnamed bones': 'body_axis_unnamed'}
FILTER_CATEGORIES = ('tpose_wrong', 'not_in_legacy_raw')

# One line per filtering category for the filtered_objects.txt header, so adding a
# category to FILTER_CATEGORIES does not leave the header describing only the first one.
FILTER_CATEGORY_NOTES = {
    'tpose_wrong': 'the exported rest pose lies flat / is rotated / upside-down, so the stage-4 T-pose is unusable',
    'not_in_legacy_raw': 'the raw GLB is absent from the legacy 6,974-asset raw set and is held out of training',
}


def load_rig_flags(ds, path, names, log):
    """``patches/<ds>_rig_flags.txt``: one ``<rig>    # <category>: <reason>`` per line — hand-reviewed
    rigs (``tpose_wrong`` = rest pose lying / rotated, ``not_in_legacy_raw`` = raw GLB absent from the legacy
    raw set and held out, ``facing_wrong`` = the facing pair does not give the real front, ``object_no_front``
    = prop without a front, ``verified_ok`` = hand-checked, clears an automatic flag). Unknown rigs are
    reported and ignored.

    A rig listed twice keeps the LAST line, which is how a later decision overrides an earlier
    one, but the override is reported: two lines with different categories mean the earlier
    verdict (often a ``verified_ok`` review) silently disappears from ``rig_flags.json``, and
    which one wins depends on the order of the file rather than on anything meaningful."""
    out = OrderedDict()
    if not os.path.isfile(path):
        return out
    with open(path) as f:
        for line in f:
            body, _, comment = line.partition('#')
            rig = body.strip()
            if not rig:
                continue
            if rig not in names:
                log.append(f'[{ds}] rig flag for unknown rig {rig!r} ignored')
                continue
            cat, _, reason = comment.strip().partition(':')
            cat = cat.strip() or 'flagged'
            if rig in out:
                prev = out[rig][0]
                log.append(f'[{ds}] rig {rig!r} is listed twice in {os.path.basename(path)}: '
                           f'{prev!r} then {cat!r}; ' +
                           (f'{cat!r} wins and the {prev!r} entry is dropped'
                            if prev != cat else 'the duplicate line is redundant'))
            out[rig] = (cat, reason.strip())
    return out


def write_filtered_clips(ds, root, patch_dir, frames, dry_run, log):
    """export/<ds>/filtered_clips.txt — hand-reviewed individual clips that stage 4 skips.

    Every dataset may have one: stage 4 applies the clip list before it groups
    clips into object types, so it is not limited to objaverse / general the way
    filtered_objects.txt is. patches/<ds>_filtered_clips.txt holds
    ``<clip stem>    # <reason>`` lines (motion discontinuity, skeletons that
    disagree with the object's reference rig, and anything else reviewed by hand).
    """
    src = os.path.join(patch_dir, f'{ds}_filtered_clips.txt')
    path = os.path.join(root, 'filtered_clips.txt')
    if not os.path.isfile(src):
        return {}
    clips = OrderedDict()
    with open(src) as f:
        for line in f:
            body, _, comment = line.partition('#')
            clip = body.strip()
            if not clip:
                continue
            if frames and clip not in frames:
                log.append(f'[{ds}] filtered clip {clip!r} is not in clip_frames.json; kept anyway')
            if clip in clips:
                log.append(f'[{ds}] filtered clip {clip!r} is listed twice in '
                           f'{os.path.basename(src)}; the last reason wins')
            clips[clip] = comment.strip()
    lines = ['# Individual export clips skipped by stage 4 (extract_features.py reads this file',
             '# automatically; --filtered_clips auto). The clip-level twin of filtered_objects.txt.',
             f'# Generated by data_process/tools/patch_annotations.py from '
             f'patches/{ds}_filtered_clips.txt — {len(clips)} clips.',
             '# Delete this file to keep them (they then go through the stage-4 quality checks only).']
    for clip, why in clips.items():
        lines.append(f'{clip}    # {why}' if why else clip)
    if not dry_run:
        with open(path, 'w') as f:
            f.write('\n'.join(lines) + '\n')
    kinds = Counter(w.split(':')[0] for w in clips.values())
    log.append(f'[{ds}] filtered_clips.txt: {len(clips)} clips ({kinds.most_common()})')
    return clips


def write_clip_trims(ds, root, patch_dir, frames, dry_run, log):
    """export/<ds>/clip_trims.txt — hand-reviewed head trims that stage 4 applies.

    patches/<ds>_clip_trims.txt holds ``<clip stem> <N>    # <reason>`` lines: the
    first N frames of that clip are a bind pose or a foreign pose that snaps into
    the motion. N counts frames of the export NPZ itself (its own fps), so any
    reader applies ``anim[N:]``; stage 4 does so on load, before downsampling and
    its static trim. The NPZs are not rewritten: a stage-1 rerun would undo that.
    """
    src = os.path.join(patch_dir, f'{ds}_clip_trims.txt')
    path = os.path.join(root, 'clip_trims.txt')
    if not os.path.isfile(src):
        return {}
    trims = OrderedDict()
    with open(src) as f:
        for lineno, line in enumerate(f, 1):
            body, _, comment = line.partition('#')
            parts = body.split()
            if not parts:
                continue
            if len(parts) != 2 or not parts[1].isdigit() or int(parts[1]) < 1:
                raise ValueError(f'{src}:{lineno}: expected "<clip> <N>" with N >= 1, got {line.strip()!r}')
            clip, n = parts[0], int(parts[1])
            if frames and clip not in frames:
                log.append(f'[{ds}] clip trim {clip!r} is not in clip_frames.json; kept anyway')
            elif frames and n >= frames[clip]:
                raise ValueError(f'{src}:{lineno}: trimming {n} frames removes all {frames[clip]} of {clip}')
            if clip in trims:
                log.append(f'[{ds}] clip trim {clip!r} is listed twice in {os.path.basename(src)}; the last wins')
            trims[clip] = (n, comment.strip())
    lines = ['# Hand-reviewed head trims applied by stage 4 (extract_features.py reads this file',
             '# automatically; --clip_trims auto): "<clip> <N>" drops the first N frames of the',
             "# clip's export NPZ (motions/<clip>.npz, its own fps): anim_local_rot/pos[N:].",
             f'# Generated by data_process/tools/patch_annotations.py from '
             f'patches/{ds}_clip_trims.txt — {len(trims)} clips.']
    for clip, (n, why) in trims.items():
        lines.append(f'{clip} {n}    # {why}' if why else f'{clip} {n}')
    if not dry_run:
        with open(path, 'w') as f:
            f.write('\n'.join(lines) + '\n')
    log.append(f'[{ds}] clip_trims.txt: {len(trims)} clips, {sum(n for n, _ in trims.values())} frames dropped')
    return trims


def write_activity_keep(ds, root, patch_dir, frames, dry_run, log):
    """export/<ds>/activity_keep.txt — clips exempt from stage 4's low-activity filter.

    patches/<ds>_activity_keep.txt holds ``<clip stem>    # <reason>`` lines: a real
    motion confined to a few joints (a head turn, a clap, a wave) that the joint-activity
    gate reads as a held pose. Stage 4 still applies every other filter to them.
    """
    src = os.path.join(patch_dir, f'{ds}_activity_keep.txt')
    path = os.path.join(root, 'activity_keep.txt')
    if not os.path.isfile(src):
        return {}
    keep = OrderedDict()
    with open(src) as f:
        for lineno, line in enumerate(f, 1):
            body, _, comment = line.partition('#')
            parts = body.split()
            if not parts:
                continue
            if len(parts) != 1:
                raise ValueError(f'{src}:{lineno}: expected "<clip>", got {line.strip()!r}')
            clip = parts[0]
            if frames and clip not in frames:
                log.append(f'[{ds}] activity keep {clip!r} is not in clip_frames.json; kept anyway')
            if clip in keep:
                log.append(f'[{ds}] activity keep {clip!r} is listed twice in {os.path.basename(src)}')
            keep[clip] = comment.strip()
    lines = ['# Hand-reviewed exemptions from the low-activity filter, applied by stage 4',
             '# (extract_features.py reads this file automatically; --activity_keep auto).',
             f'# Generated by data_process/tools/patch_annotations.py from '
             f'patches/{ds}_activity_keep.txt — {len(keep)} clips.']
    for clip, why in keep.items():
        lines.append(f'{clip}    # {why}' if why else clip)
    if not dry_run:
        with open(path, 'w') as f:
            f.write('\n'.join(lines) + '\n')
    log.append(f'[{ds}] activity_keep.txt: {len(keep)} clips')
    return keep


ROOT_OFFSET_KEY = 'root_offset_applied'   # the quat currently baked into this NPZ (w, x, y, z)


def _vector_error(value, size, nonzero=False):
    """Why *value* is not *size* finite numbers (non-zero ones when
    *nonzero*), or ''."""
    try:
        arr = np.asarray(value, dtype=np.float64)
    except (TypeError, ValueError):
        return f'expected {size} numbers, got {value!r}'
    if arr.shape != (size,):
        return f'expected {size} numbers, got {value!r}'
    if not np.all(np.isfinite(arr)):
        return f'non-finite value in {value!r}'
    if nonzero and np.linalg.norm(arr) < 1e-6:
        return f'zero vector {value!r} has no direction'
    return ''


# Quaternion patches: file suffix -> the vector fields of an entry.
QUAT_PATCHES = {'root_offsets': ('quat',), 'rest_orientation': ('quat', 'offset')}


def quat_patch_errors(src, fields):
    """Every malformed entry of the quaternion patch *src*: no ``quat``, or a
    *fields* value that is not finite numbers (a zero quat has no rotation and
    would be written into the export NPZs as NaN)."""
    errors = []
    for key, entry in load_overrides(src).items():
        if not isinstance(entry, dict) or 'quat' not in entry:
            errors.append(f'{os.path.basename(src)}: {key}: expected {{"quat": [w, x, y, z], ...}}')
            continue
        for field in fields:
            if field in entry:
                why = _vector_error(entry[field], 4 if field == 'quat' else 3,
                                    nonzero=field == 'quat')
                if why:
                    errors.append(f'{os.path.basename(src)}: {key}: {field}: {why}')
    return errors


def load_quat_patch(src, fields):
    """The entries of the quaternion patch *src*, or ValueError listing the
    malformed ones before anything is applied."""
    errors = quat_patch_errors(src, fields)
    if errors:
        raise ValueError('Malformed quaternion patch entries (nothing applied):\n  '
                         + '\n  '.join(errors))
    return load_overrides(src)


def check_quat_patches(patch_dir, datasets):
    """Raise SystemExit listing every malformed entry of every dataset's
    quaternion patches, so a bad entry stops the run before any file of any
    dataset is written."""
    errors = []
    for ds in datasets:
        for suffix, fields in QUAT_PATCHES.items():
            src = os.path.join(patch_dir, f'{ds}_{suffix}.json')
            if os.path.isfile(src):
                errors.extend(quat_patch_errors(src, fields))
    if errors:
        raise SystemExit('Malformed quaternion patch entries (nothing applied):\n  '
                         + '\n  '.join(errors))


def _save_npz_atomic(path, data):
    fd, tmp = tempfile.mkstemp(prefix=os.path.basename(path) + '.', suffix='.tmp',
                               dir=os.path.dirname(path) or '.')
    try:
        with os.fdopen(fd, 'wb') as f:
            np.savez(f, **data)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def apply_root_offsets(ds, root, patch_dir, dry_run, log):
    """Remove a constant whole-body orientation error from export clips, in place.

    Some vendor FBX files key the root joint with a fixed extra rotation for the whole
    clip (Truebones: nine Dog clips rolled 44.6 deg about the pelvis's local X axis,
    Dog-Stare 134.6 deg, Flamingo-One_Leg_Bent 27.5 deg), so the animal floats tilted
    while every child joint animates correctly. patches/<ds>_root_offsets.json maps
    ``clip -> {"quat": [w, x, y, z], "reason": ...}``; the fix post-multiplies the
    root's local rotation on every frame, ``q0[t] <- q0[t] * quat``, which turns the
    whole body rigidly about the root in body coordinates (so it stays right when the
    clip turns). The quats were estimated by hand review and checked against Dog2, which
    carries the same animations upright.

    Unlike clip_trims this rewrites the NPZ, so every reader (stage 4, previews, mesh
    driving, audits) sees the fixed motion. To stay reproducible it is idempotent: the
    applied quat is stored in the NPZ under ``root_offset_applied``. A matching entry is
    skipped; a changed entry undoes the old quat first; an NPZ that carries the key but
    is no longer listed is restored. A stage-1 rerun writes fresh NPZs without the key,
    and the next run of this script fixes them again. Returns the clips whose NPZ
    changed (their cached root motion is stale).
    """
    src = os.path.join(patch_dir, f'{ds}_root_offsets.json')
    if not os.path.isfile(src):
        return []           # no patch file: leave earlier fixes in place
    want = load_quat_patch(src, QUAT_PATCHES['root_offsets'])
    mdir = os.path.join(root, 'motions')
    changed, n_ok = [], 0
    targets = set(want)
    for f in glob.glob(os.path.join(mdir, '*.npz')):          # previously fixed clips no longer listed
        clip = os.path.basename(f)[:-4]
        if clip not in targets:
            with np.load(f, allow_pickle=True) as d:
                if ROOT_OFFSET_KEY in d.files:
                    targets.add(clip)
    for clip in sorted(targets):
        path = os.path.join(mdir, clip + '.npz')
        if not os.path.isfile(path):
            log.append(f'[{ds}] root offset for {clip!r}: no export NPZ; ignored')
            continue
        with np.load(path, allow_pickle=True) as d:
            data = {k: d[k] for k in d.files}
        have = data.pop(ROOT_OFFSET_KEY, None)
        new = want.get(clip)
        q_new = None
        if new is not None:
            q_new = np.asarray(new['quat'], dtype=np.float64)
            q_new = q_new / np.linalg.norm(q_new)
        if have is not None and q_new is not None and np.allclose(have, q_new, atol=1e-6):
            n_ok += 1
            continue
        rot = data['anim_local_rot'].astype(np.float64)
        q0 = rot[:, 0]
        if have is not None:                                  # undo what is baked in
            q0 = qmul(q0, np.asarray(have, dtype=np.float64) * np.array([1, -1, -1, -1]))
        if q_new is not None:
            q0 = qmul(q0, np.broadcast_to(q_new, q0.shape))
            data[ROOT_OFFSET_KEY] = q_new.astype(np.float32)
        rot[:, 0] = q0 / np.linalg.norm(q0, axis=-1, keepdims=True)
        data['anim_local_rot'] = rot.astype(data['anim_local_rot'].dtype)
        what = 'restored (entry removed)' if q_new is None else \
            f'{np.degrees(2 * np.arccos(min(1.0, abs(q_new[0])))):.1f} deg'
        log.append(f'[{ds}] root offset {clip}: {what}' + (' (dry run)' if dry_run else ''))
        if not dry_run:
            _save_npz_atomic(path, data)
        changed.append(clip)
    if want or changed:
        log.append(f'[{ds}] root_offsets: {len(want)} listed, {len(changed)} rewritten, {n_ok} already applied')
    return changed


REST_ORIENTATION_KEY = 'rest_orientation_applied'   # the quat currently baked into the rest pose


def apply_rest_orientations(ds, root, patch_dir, dry_run, log):
    """Stand a rig's rest pose up, in place, in every export NPZ of the rig.

    A rest pose can lie flat, lean or stand upside down while the clips play
    upright: the bind pose was authored in another orientation. Since the rest is
    one rigid pose, a single rotation fixes it. patches/<ds>_rest_orientation.json
    maps ``rig -> {"quat": [w, x, y, z], "offset": [x, y, z], "reason": ...}``, a
    rotation and an optional translation in export space (the offset puts the
    turned pose back on the ground); ``p -> quat * p + offset`` is applied to the
    root's rest transform (``rest_local_rot[0]``, ``rest_local_pos[0]``,
    ``offsets[0]``), moving the whole rest pose rigidly. Clip frames are untouched,
    so every clip keeps its motion and only the reference pose changes.
    The export GLB applies the same rotation to its armature
    (``processed_assets.export_asset_glb``), so the two stay aligned.

    Idempotent like apply_root_offsets: the applied quat is stored in each NPZ under
    ``rest_orientation_applied`` (quat then offset, 7 values); a changed entry undoes
    the old transform first, and an
    NPZ that carries the key but whose rig is no longer listed is restored. Returns
    the rigs whose NPZs changed (their processed GLBs must be rebuilt).
    """
    src = os.path.join(patch_dir, f'{ds}_rest_orientation.json')
    if not os.path.isfile(src):
        return []           # no patch file: leave earlier fixes in place
    want = load_quat_patch(src, QUAT_PATCHES['rest_orientation'])
    mdir = os.path.join(root, 'motions')
    by_rig = {}
    for f in glob.glob(os.path.join(mdir, '*.npz')):
        # Mixamo clips share one rig and carry no object-type prefix.
        rig = 'mixamo' if ds == 'mixamo' else os.path.basename(f).split('-')[0]
        by_rig.setdefault(rig, []).append(f)
    targets = set(want)
    for rig, paths in by_rig.items():                       # previously fixed rigs no longer listed
        if rig not in targets:
            with np.load(paths[0], allow_pickle=True) as d:
                if REST_ORIENTATION_KEY in d.files:
                    targets.add(rig)
    changed, n_ok = [], 0
    for rig in sorted(targets):
        paths = sorted(by_rig.get(rig, []))
        if not paths:
            log.append(f'[{ds}] rest orientation for {rig!r}: no export NPZ; ignored')
            continue
        new = want.get(rig)
        fix_new = None
        if new is not None:
            q = np.asarray(new['quat'], dtype=np.float64)
            fix_new = np.concatenate([q / np.linalg.norm(q),
                                      np.asarray(new.get('offset', [0, 0, 0]), dtype=np.float64)])
        rig_changed = False
        for path in paths:
            with np.load(path, allow_pickle=True) as d:
                data = {k: d[k] for k in d.files}
            have = data.pop(REST_ORIENTATION_KEY, None)
            if have is not None and fix_new is not None and have.shape == fix_new.shape \
                    and np.allclose(have, fix_new, rtol=1e-6, atol=1e-6):
                n_ok += 1
                continue
            rot = data['rest_local_rot'].astype(np.float64)
            q0, p0 = rot[0], data['rest_local_pos'][0].astype(np.float64)
            if have is not None:                              # undo what is baked in
                have = np.asarray(have, dtype=np.float64)
                inv = have[:4] * np.array([1, -1, -1, -1])
                t = have[4:7] if len(have) >= 7 else np.zeros(3)
                q0, p0 = qmul(inv, q0), qrot(inv, p0 - t)
            if fix_new is not None:
                q0, p0 = qmul(fix_new[:4], q0), qrot(fix_new[:4], p0) + fix_new[4:]
                data[REST_ORIENTATION_KEY] = fix_new
            rot[0] = q0 / np.linalg.norm(q0)
            data['rest_local_rot'] = rot.astype(data['rest_local_rot'].dtype)
            for key in ('rest_local_pos', 'offsets'):
                if key in data:
                    arr = data[key].copy()
                    arr[0] = p0
                    data[key] = arr
            if not dry_run:
                _save_npz_atomic(path, data)
            rig_changed = True
        if rig_changed:
            what = 'restored (entry removed)' if fix_new is None else \
                f'{np.degrees(2 * np.arccos(min(1.0, abs(fix_new[0])))):.1f} deg'
            log.append(f'[{ds}] rest orientation {rig}: {what}, {len(paths)} clip(s)'
                       + (' (dry run)' if dry_run else ''))
            changed.append(rig)
    if want or changed:
        log.append(f'[{ds}] rest_orientation: {len(want)} listed, {len(changed)} rig(s) rewritten, '
                   f'{n_ok} clip(s) already applied')
    return changed


def write_rig_flags(ds, root, face, frames, manual, dry_run, log):
    """rig_flags.json (every flagged rig with its category) + filtered_objects.txt (FILTER_CATEGORIES only)."""
    flags = OrderedDict()
    for rig, entry in face.items():
        why = unreliable_facing(entry)
        if why:
            flags[rig] = {'category': AUTO_FLAG.get(why, why), 'reason': why, 'origin': 'auto'}
    verified = OrderedDict()
    for rig, (cat, reason) in (manual or {}).items():
        if cat == 'verified_ok':       # hand-checked: drop any automatic flag
            verified[rig] = reason
            flags.pop(rig, None)
            continue
        flags[rig] = {'category': cat, 'reason': reason, 'origin': 'manual'}
    cats = OrderedDict()
    for rig, fl in sorted(flags.items()):
        cats.setdefault(fl['category'], []).append(rig)
    bad = OrderedDict((rig, fl) for rig, fl in flags.items() if fl['category'] in FILTER_CATEGORIES)
    clips = [c for c in frames if object_type_of(ds, c) in bad]
    out = OrderedDict([
        ('_comment', 'Per-rig flags. Automatic facing checks (empty_pair: no bilateral joint pair; '
                     'bone_pair: the pair consists of unnamed Bone joints; body_axis_unnamed) plus the '
                     'hand-reviewed categories (tpose_wrong: the exported rest pose is unusable; '
                     'not_in_legacy_raw: the raw GLB is absent from the legacy raw set and is held out of '
                     'training; facing_wrong: the pair does not give the real front). Only '
                     + ', '.join(FILTER_CATEGORIES) +
                     ' is written to filtered_objects.txt, which stage 4 skips; every other flag is '
                     'informational and those rigs are kept. verified_ok lists rigs whose automatic flag was '
                     'cleared after review.'),
        ('filtered', list(FILTER_CATEGORIES)),
        ('counts', OrderedDict((c, len(r)) for c, r in cats.items())),
        ('categories', cats),
        ('rigs', OrderedDict(sorted(flags.items()))),
        ('verified_ok', verified),   # automatic flags cleared by hand review
    ])
    lines = ['# Object types skipped by stage 4 (extract_features.py reads this file automatically):',
             '# rigs flagged ' + ' / '.join(FILTER_CATEGORIES) + f' in patches/{ds}_rig_flags.txt.']
    lines += [f'#   {c}: {FILTER_CATEGORY_NOTES[c]}' for c in FILTER_CATEGORIES if c in FILTER_CATEGORY_NOTES]
    lines += ['# Other flags (empty_pair, bone_pair, facing_wrong, object_no_front, ...) are recorded in',
             '# rig_flags.json only and are NOT filtered.',
             f'# Generated by data_process/tools/patch_annotations.py — {len(bad)} rigs, {len(clips)} clips.',
             '# Delete this file to keep them (they then get the rest-pose facing as exported).']
    for rig, fl in bad.items():
        lines.append(f"{rig}    # {fl['category']}: {fl['reason']}")
    if not dry_run:
        with open(os.path.join(root, 'rig_flags.json'), 'w') as f:
            json.dump(out, f, indent=1)
        with open(os.path.join(root, 'filtered_objects.txt'), 'w') as f:
            f.write('\n'.join(lines) + '\n')
    log.append(f'[{ds}] rig_flags.json: {dict(out["counts"])} (+{len(verified)} verified_ok); filtered_objects.txt: '
               f'{len(bad)} rigs / {len(clips)} clips ({", ".join(FILTER_CATEGORIES)})')
    return bad


# ---------------------------------------------------------------------------
# Body-plan categories
# ---------------------------------------------------------------------------

def patch_categories(ds, groups, overrides, names, stats, log):
    """Move rigs between the {category: [rigs]} buckets of category_groups.json."""
    for rig, cat in (overrides or {}).items():
        if rig not in names:
            log.append(f'[{ds}] category override for unknown rig {rig!r} ignored')
            continue
        current = next((c for c, members in groups.items() if rig in members), None)
        if current == cat:
            continue
        if current is not None:
            groups[current].remove(rig)
        groups.setdefault(cat, []).append(rig)
        groups[cat].sort()
        stats['manual-category'] += 1
    for cat in [c for c, members in groups.items() if not members]:
        del groups[cat]


# ---------------------------------------------------------------------------
# Captions
# ---------------------------------------------------------------------------

def root_motion(root, ds, clips, cache_path, face, log):
    """Per clip: net XZ root displacement in body heights and the travel
    direction relative to the facing pair at frame 0."""
    cache = load_json(cache_path, OrderedDict()) if cache_path else OrderedDict()
    key = lambda c: f'{ds}/{c}@{CAPTION_FRAMES}'   # window-scoped: rows of other windows are ignored
    todo = [c for c in clips if key(c) not in cache]
    if todo:
        log.append(f'[{ds}] computing root motion for {len(todo)} clips')
    for n, clip in enumerate(todo, 1):
        f = os.path.join(root, 'motions', clip + '.npz')
        if not os.path.isfile(f):
            continue
        d = np.load(f, allow_pickle=True)
        g0 = rest_global(d)
        height = float(np.ptp(g0, axis=0).max()) or 1.0
        # Only the first MAX_RENDER_FRAMES frames count. That is the window the
        # captioner was shown, the window the released video covers, and the only
        # window stage 4 keeps - so it is the window the caption describes.
        # Measuring endpoint-to-endpoint over the WHOLE clip silently breaks every
        # looping animation: the root returns to its start, net comes out 0.000,
        # and a clip that visibly crosses six body lengths gets pinned at
        # "in place" (and the reverse for clips that only travel after frame 200).
        r = d['anim_local_pos'][:CAPTION_FRAMES, 0, :]
        disp = r[-1] - r[0]
        net = float(np.hypot(disp[0], disp[2]) / height)
        direction = ''
        rig = object_type_of(ds, clip)
        entry = face.get(rig)
        if net > 0 and entry and not unreliable_facing(entry):
            nm = list(d['names'])
            try:
                ri, li = nm.index(entry['r_hip']['raw']), nm.index(entry['l_hip']['raw'])
                dxz = np.array([disp[0], 0.0, disp[2]]) / (np.hypot(disp[0], disp[2]) or 1.0)
                cos = []
                nf = len(r)
                for t in range(0, nf, max(1, nf // 8)):     # facing averaged over the clip
                    gf = frame_global(d, t)
                    if entry.get('body_axis'):
                        fwd = gf[ri] - gf[li]          # head - tail
                    else:
                        fwd = np.cross(gf[li] - gf[ri], [0.0, 1.0, 0.0])   # left x up
                    fwd[1] = 0.0
                    if np.linalg.norm(fwd) > 1e-6:
                        cos.append(float(np.dot(dxz, fwd / np.linalg.norm(fwd))))
                if cos:
                    c = float(np.mean(cos))
                    # Strict: only a clear along-axis travel gets a word. Sideways or
                    # twisted-pelvis gaits (strafes) are left unqualified.
                    if c > FACING_COS:
                        direction = 'forward'
                    elif c < -FACING_COS:
                        direction = 'backward'
            except ValueError:
                pass
        cache[key(clip)] = {'net': round(net, 3), 'dir': direction}
        if cache_path and (n % 500 == 0 or n == len(todo)):  # derived data: cached even on --dry_run
            save_json(cache_path, cache, False)
    return {c: cache[key(c)] for c in clips if key(c) in cache}


def normalize_locomotion(caption, motion, still, travel, stats):
    if not motion:
        return caption

    def repl(m):
        verb, adv, qual = m.group(1), m.group(2), m.group(3)
        net, direction = motion['net'], motion['dir']
        if qual == 'forward' and net < still:
            stats['forward->in place'] += 1
            return f'{verb}{adv} in place'
        if qual == 'in place' and net >= travel:
            if direction:
                stats[f'in place->{direction}'] += 1
                return f'{verb}{adv} {direction}'
            stats['in place->(dropped)'] += 1
            return f'{verb}{adv}'
        return m.group(0)

    return LOCO_RE.sub(repl, caption)


def load_caption_rewrites(ds, path, caps, log):
    """``{clip: new caption}`` from a ``caption_rewrite_llm.py`` patch: the
    entries that passed its validation (``ok``) and whose ``old`` caption is
    still the current one (a rewrite of a caption that changed since is stale)."""
    out, stale = {}, 0
    for clip, entry in load_overrides(path).items():
        if (not isinstance(entry, dict) or not entry.get('ok') or not entry.get('new')
                or not entry.get('old') or clip not in caps):
            continue
        current = caps[clip].strip().rstrip('.')
        if current == entry['new'].strip().rstrip('.'):
            continue                    # applied by an earlier run
        if current != entry['old'].strip().rstrip('.'):
            stale += 1
            continue
        out[clip] = entry['new']
    if stale:
        log.append(f'[{ds}] {stale} caption rewrites in {os.path.basename(path)} skipped: '
                   f'the caption changed since')
    return out


def patch_captions(ds, caps, overrides, motion, args, stats, log):
    subject = SUBJECT[ds]
    for clip, text in (overrides or {}).items():
        if clip not in caps:
            log.append(f'[{ds}] caption override for unknown clip {clip!r} ignored')
            continue
        if caps[clip] != text:
            caps[clip] = text
            stats['manual-caption'] += 1
    for clip, text in caps.items():
        new = text.strip()
        new = re.sub(r'\bbreaksdance\b', 'breakdances', new)
        if not new.startswith(subject):
            fixed = re.sub(r'^(?:An?|The) [A-Za-z-]+\b', subject, new, count=1)
            if fixed.startswith(subject):
                new = fixed
                stats['subject-fixed'] += 1
            else:
                log.append(f'[{ds}] {clip}: caption does not start with {subject!r}: {new!r}')
        new = re.sub(r'\s+', ' ', new)
        if new and not new.endswith('.'):
            new += '.'
        new = normalize_locomotion(new, motion.get(clip), args.still, args.travel, stats)
        if new != text:
            caps[clip] = new
            stats['caption-changed'] += 1


# Extra caption versions beside motion_captions.json (HumanML3D-style multiple
# captions): the short generic one and the longer detail one.
EXTRA_CAPTION_VERSIONS = ('generic', 'detail')


def build_extra_captions(ds, version, caps, patch_dir, motion, args, stats, log):
    """One extra caption version per clip (``generic`` or ``detail``).

    The source is the reviewed patch ``<ds>_captions_<version>.json`` itself:
    no pipeline stage generates these captions. Only clips present in the
    export captions are kept, in their key order; the same subject / grammar /
    locomotion rules as the normal captions run on the result. Returns None
    when there is no patch; ``run_dataset`` then keeps an existing
    ``motion_captions_<version>.json``.
    """
    src = load_overrides(os.path.join(patch_dir, f'{ds}_captions_{version}.json'))
    if not src:
        return None
    unknown = [c for c in src if c not in caps]
    if unknown:
        log.append(f'[{ds}] {len(unknown)} {version} captions for unknown clips ignored, e.g. {unknown[:3]}')
    out = {c: src[c] for c in caps if c in src}
    vstats = Counter()
    patch_captions(ds, out, None, motion, args, vstats, log)
    for k, v in vstats.items():
        stats[f'{version}-{k}'] += v
    stats[f'{version}-captions'] += len(out)
    missing = len(caps) - len(out)
    if missing:
        stats[f'{version}-missing'] += missing
    return out


# ---------------------------------------------------------------------------

def write_report(ds, report_dir, before, clean, face, caps, names, motion, extra=None):
    """TSV of every change: kind, key, joint/-, old, new, note. Extra caption
    versions (``extra``: {version: {clip: caption} or None}) are compared with
    their export files as they were before this run (kind ``caption_<v>``)."""
    os.makedirs(report_dir, exist_ok=True)
    rows = []
    for rig, labels in clean.items():
        old = before['clean'].get(rig, [])
        for i, lab in enumerate(labels):
            if i < len(old) and old[i] != lab:
                rows.append(('label', rig, names[rig][i], old[i], lab, ''))
    for rig, entry in face.items():
        o = before['face'].get(rig)
        if o != entry:
            fmt = lambda e: f"{e['r_hip']['raw']} ({e['r_hip']['clean']}) / {e['l_hip']['raw']} ({e['l_hip']['clean']}) src={e.get('source')}" if e and e.get('r_hip') else str(e)
            rows.append(('face', rig, '-', fmt(o), fmt(entry), ''))
    for clip, text in caps.items():
        o = before['caps'].get(clip)
        if o != text:
            m = motion.get(clip, {})
            note = f"net={m.get('net')} dir={m.get('dir')}" if m else ''
            rows.append(('caption', clip, '-', o, text, note))
    for version, new in (extra or {}).items():
        if new is None:         # no patch: the file is kept, nothing changes
            continue
        old = before.get('extra', {}).get(version) or {}
        new = new or {}
        for clip in list(new) + [c for c in old if c not in new]:
            if old.get(clip) != new.get(clip):
                rows.append((f'caption_{version}', clip, '-', old.get(clip), new.get(clip), ''))
    path = os.path.join(report_dir, f'{ds}_changes.tsv')
    with open(path, 'w') as f:
        f.write('kind\tkey\tjoint\told\tnew\tnote\n')
        for r in rows:
            f.write('\t'.join(str(x) for x in r) + '\n')
    return path


def run_dataset(ds, args, log):
    root = os.path.join(args.export_root, ds)
    names = load_json(os.path.join(root, 'joint_names.json'))
    clean = load_json(os.path.join(root, 'clean_joint_names.json'))
    face = load_json(os.path.join(root, 'face_joint_names.json'))
    caps = load_json(os.path.join(root, 'motion_captions.json'))
    groups = load_json(os.path.join(root, 'category_groups.json'))
    frames = load_json(os.path.join(root, 'clip_frames.json'), {})
    if names is None or clean is None:
        log.append(f'[{ds}] no joint_names/clean_joint_names under {root}; skipped')
        return
    pd = args.patch_dir
    stats = Counter()
    before = {'clean': json.loads(json.dumps(clean)), 'face': json.loads(json.dumps(face)) if face else {},
              'caps': dict(caps) if caps else {},
              'extra': {v: load_json(os.path.join(root, f'motion_captions_{v}.json'))
                        for v in EXTRA_CAPTION_VERSIONS}}

    patch_joint_labels(ds, root, clean, names, load_overrides(os.path.join(pd, f'{ds}_joint_labels.json')), stats, log)
    if face is not None:
        patch_face_pairs(ds, face, clean, names, load_overrides(os.path.join(pd, f'{ds}_face_pairs.json')), stats, log)
        flags_src = os.path.join(pd, f'{ds}_rig_flags.txt')
        if ds in OBJECT_DATASETS and os.path.isfile(flags_src):
            manual = load_rig_flags(ds, flags_src, names, log)
            write_rig_flags(ds, root, face, frames, manual, args.dry_run, log)
            stats['manual-rig-flag'] += len(manual)
        elif ds in OBJECT_DATASETS:
            log.append(f'[{ds}] no {ds}_rig_flags.txt in {pd}; rig_flags.json / '
                       f'filtered_objects.txt left as they are')
    stats['manual-filtered-clip'] += len(
        write_filtered_clips(ds, root, pd, frames, args.dry_run, log))
    stats['manual-clip-trim'] += len(
        write_clip_trims(ds, root, pd, frames, args.dry_run, log))
    stats['manual-activity-keep'] += len(
        write_activity_keep(ds, root, pd, frames, args.dry_run, log))
    rewritten = apply_root_offsets(ds, root, pd, args.dry_run, log)
    stats['root-offset-rewritten'] += len(rewritten)
    stats['rest-orientation-rewritten'] += len(
        apply_rest_orientations(ds, root, pd, args.dry_run, log))
    if rewritten and not args.dry_run:
        # the cached travel direction was measured against the old (tilted) facing
        cache_path = os.path.join(pd, '.root_motion_cache.json')
        cache = load_json(cache_path, OrderedDict())
        stale = [k for k in cache if k.split('@')[0] in {f'{ds}/{c}' for c in rewritten}]
        for k in stale:
            del cache[k]
        if stale:
            save_json(cache_path, cache, False)
    if groups is not None:
        patch_categories(ds, groups, load_overrides(os.path.join(pd, f'{ds}_categories.json')), names, stats, log)
    extra = {}
    if caps is not None:
        motion = root_motion(root, ds, list(caps), os.path.join(pd, '.root_motion_cache.json'),
                             face or {}, log) if not args.skip_locomotion else {}
        overrides = load_caption_rewrites(ds, os.path.join(pd, f'{ds}_captions_llm.json'), caps, log)
        overrides.update(load_overrides(os.path.join(pd, f'{ds}_captions.json')))
        patch_captions(ds, caps, overrides, motion, args, stats, log)
        extra = {v: build_extra_captions(ds, v, caps, pd, motion, args, stats, log)
                 for v in EXTRA_CAPTION_VERSIONS}

    save_json(os.path.join(root, 'clean_joint_names.json'), clean, args.dry_run)
    if face is not None:
        save_json(os.path.join(root, 'face_joint_names.json'), face, args.dry_run)
    if caps is not None:
        save_json(os.path.join(root, 'motion_captions.json'), caps, args.dry_run)
    for version in EXTRA_CAPTION_VERSIONS:
        path = os.path.join(root, f'motion_captions_{version}.json')
        if extra.get(version) is not None:
            save_json(path, extra[version], args.dry_run)
        elif caps is not None and os.path.isfile(path):
            # No patch file: keep the captions an earlier run (or the released
            # export) wrote; deleting them is a manual decision.
            log.append(f'[{ds}] no {ds}_captions_{version}.json in {pd}; kept {path}')
    if groups is not None:
        save_json(os.path.join(root, 'category_groups.json'), groups, args.dry_run)
    if args.report_dir:
        write_report(ds, args.report_dir, before, clean, face or {}, caps or {}, names,
                     motion if caps is not None and not args.skip_locomotion else {},
                     extra=extra)
    log.append(f'[{ds}] ' + ', '.join(f'{k}={v}' for k, v in sorted(stats.items())))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, '..', '..'))
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--export_root', default=os.path.join(repo, 'dataset', 'export'))
    ap.add_argument('--patch_dir', default=os.path.join(repo, 'dataset', 'UniML3D', 'patches'))
    ap.add_argument('--datasets', nargs='+', default=list(DATASETS))
    ap.add_argument('--still', type=float, default=0.15,
                    help='net root XZ travel (body heights) below which locomotion is "in place"')
    ap.add_argument('--travel', type=float, default=0.5,
                    help='net root XZ travel (body heights) above which "in place" is replaced')
    ap.add_argument('--skip_locomotion', action='store_true', help='do not touch forward/in place')
    ap.add_argument('--report_dir', default=None,
                    help='write <ds>_changes.tsv (every label / face / caption change) here')
    ap.add_argument('--dry_run', action='store_true', help='report only; writes nothing but the root-motion cache '
                         '(<patch_dir>/.root_motion_cache.json)')
    args = ap.parse_args()
    os.makedirs(args.patch_dir, exist_ok=True)
    check_quat_patches(args.patch_dir, args.datasets)
    log = []
    for ds in args.datasets:
        run_dataset(ds, args, log)
    print('\n'.join(log))
    if args.dry_run:
        print('(dry run — no annotation written; only the root-motion cache)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
