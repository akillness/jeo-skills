"""Review the joint annotation before the cond is built (bpy-free).

``run --review`` stops after stage 3 and writes, in the output directory:

- ``annotation.json``: every joint (raw name, parent, label, where the label
  came from, and ``check`` with reasons when it deserves a look), the facing
  pair with the alternatives the labels offer, and the label vocabulary;
- ``annotation_preview.png``: the export rest pose with the facing pair, the
  forward direction it implies, and every joint's index and label;
- ``REVIEW.md``: what to check and how, written for a person, an LLM or a
  coding agent, and the command that continues.

A reviewer edits ``annotation.json`` (labels, ``face_pair``); ``run --annotation
annotation.json`` then builds the asset from it (:func:`load_annotation`
validates it against the exported skeleton).
"""

import json
import os
import re

import numpy as np

from data_process.joint_annotation.face_select_rule import SYMMETRIC_PAIR_PRIORITY
from data_process.joint_annotation.name_map import apply_name_map, load_name_map, norm_name
from data_process.joint_annotation.vocab import QUALIFIERS, canonical_parts, is_canonical_label
from data_process.rig_preprocess.annotate import facing_defined
from data_process.rig_preprocess.evaluate import facing_quat

ANNOTATION_FILE = 'annotation.json'
REVIEW_FILE = 'REVIEW.md'
REVIEW_PREVIEW = 'annotation_preview.png'
FORMAT = 'rig_preprocess-annotation/1'
# Mirrored limbs (the same part, Left and Right) whose centres are this far
# apart (share of the skeleton's extent) and point the other way from the
# facing pair (cosine below -SIDE_COS) are flagged.
SIDE_TOL = 0.02
SIDE_COS = 0.5
# Face-pair parts that need no second look: hip / shoulder level, whole-limb
# roots and fins. A pair of any other part (hands, knees, eyes, ...) is flagged.
_SOLID_PARTS = {p.lower() for p in
                SYMMETRIC_PAIR_PRIORITY[:SYMMETRIC_PAIR_PRIORITY.index('Fin') + 1]}
_SOLID_PARTS |= {'manual', 'reviewed', 'body_axis'}
_SIDE_RE = re.compile(r'^(Left|Right) ')
_PLACEHOLDER_RE = re.compile(r'^(?:Left |Right )?(?:Bone|_?\d+)$')


def _side(label):
    m = _SIDE_RE.match(label)
    return m.group(1) if m else ''


def _sources(raw, parents, labels, mode):
    """Per joint: 'template' / 'names' where the reviewed-label lookup gives the
    label, else *mode* ('rule', 'llm', 'dataset', or 'file' for an annotation
    file)."""
    if mode == 'dataset':
        return ['dataset'] * len(raw)
    lookup = load_name_map()
    unset = '\0'
    tmpl, src = apply_name_map(lookup, raw, [unset] * len(raw), parents)
    if src == 'template':
        return ['template' if a != unset and a == b else mode for a, b in zip(tmpl, labels)]
    table, vocab = lookup.get('names', {}), lookup.get('labels', [])
    return ['names' if norm_name(n) in table and vocab[table[norm_name(n)]] == l else mode
            for n, l in zip(raw, labels)]


def _limbs(labels, parents):
    """Sided limbs: ``{(side, part of the limb's first joint): [[joints], ...]}``,
    a limb being a connected run of joints labelled with the same side."""
    limbs = {}
    for i, label in enumerate(labels):
        side, p = _side(label), parents[i]
        if side and not (p >= 0 and _side(labels[p]) == side):
            members, stack = [], [i]
            while stack:
                j = stack.pop()
                members.append(j)
                stack.extend(c for c, q in enumerate(parents) if q == j and _side(labels[c]) == side)
            limbs.setdefault((side, label[len(side) + 1:]), []).append(members)
    return limbs


def _mirror_conflicts(labels, parents, pos, face, raw, extent):
    """``(conflicts, pairs)``: the mirrored limb pairs whose Right limb lies on
    the left of the Left limb, judged by the facing pair's lateral axis (limb
    centres, so a crossing clavicle in an otherwise sided arm does not count),
    as ``(right root, left root, part)``; *pairs* how many pairs were judged."""
    r, l = face.get('r_hip', {}).get('raw'), face.get('l_hip', {}).get('raw')
    if not (r and l) or face.get('body_axis'):
        return [], 0
    across = pos[raw.index(r)] - pos[raw.index(l)]
    across[1] = 0.0
    if np.linalg.norm(across) < 1e-8:
        return [], 0
    across /= np.linalg.norm(across)
    limbs, conflicts, pairs = _limbs(labels, parents), [], 0
    for (side, part), right in limbs.items():
        left = limbs.get(('Left', part), [])
        if side != 'Right' or len(right) != 1 or len(left) != 1:
            continue
        gap = pos[right[0]].mean(0) - pos[left[0]].mean(0)
        gap[1] = 0.0
        if np.linalg.norm(gap) < SIDE_TOL * extent:
            continue
        pairs += 1
        if float(gap @ across) / np.linalg.norm(gap) < -SIDE_COS:
            conflicts.append((right[0][0], left[0][0], part))
    return conflicts, pairs


def _candidates(raw, labels, rest_pos):
    """Mirrored pairs the labels offer: ``[right raw, left raw, part]``, ranked
    parts first, each only when it defines a facing."""
    by_part = {}
    for i, label in enumerate(labels):
        side = _side(label)
        if side:
            by_part.setdefault(label[len(side) + 1:], {}).setdefault(side, []).append(i)
    out = []
    for part, sides in by_part.items():
        if 'Left' in sides and 'Right' in sides:
            r, l = sides['Right'][0], sides['Left'][0]
            entry = {'r_hip': {'raw': raw[r]}, 'l_hip': {'raw': raw[l]}}
            if facing_defined(entry, raw, rest_pos):
                out.append([raw[r], raw[l], part])
    rank = {p: i for i, p in enumerate(SYMMETRIC_PAIR_PRIORITY)}
    return sorted(out, key=lambda c: (rank.get(c[2], len(rank)), c[2]))


def build_annotation(name, raw, parents, rest_pos, labels, face, mode='rule', notes=()):
    """The ``annotation.json`` dict for one asset: *raw* the exported joint
    names, *parents* and *rest_pos* (export space, Y-up) the skeleton, *labels*
    and *face* the stage-3 result, *mode* where it came from, *notes* the run's
    notes (``summary.json``)."""
    raw = [str(n) for n in raw]
    pos = np.asarray(rest_pos, dtype=float)
    extent = float(np.ptp(pos, axis=0).max()) or 1.0
    sources = _sources(raw, parents, labels, mode)
    r, l = face.get('r_hip', {}).get('raw'), face.get('l_hip', {}).get('raw')
    conflicts, judged = _mirror_conflicts(labels, parents, pos, face, raw, extent)
    mirrored = {}
    for ri, li, part in conflicts:
        for i in (ri, li):
            mirrored[i] = (f"the Left / Right {part} limbs lie on the opposite sides from the "
                           f"facing pair's: swap their sides, or the pair")
    joints = []
    for i, (n, label) in enumerate(zip(raw, labels)):
        reasons = []
        if sources[i] not in ('template', 'dataset'):
            if _PLACEHOLDER_RE.match(label):
                reasons.append('placeholder: give it a part name if it is a body part')
            elif not is_canonical_label(label):
                reasons.append('not in the label vocabulary')
        if i in mirrored:
            reasons.append(mirrored[i])
        joints.append({'index': i, 'raw': n,
                       'parent': raw[parents[i]] if parents[i] >= 0 else None,
                       'label': label, 'source': sources[i], 'check': bool(reasons),
                       **({'reasons': reasons} if reasons else {})})
    face_reasons = []
    if not (r and l):
        face_reasons.append('no facing pair: the asset keeps its authored facing')
    elif face.get('body_axis'):
        face_reasons.append('head / tail axis: check that `right` is the head end')
    elif str(face.get('source', '')).lower() not in _SOLID_PARTS:
        face_reasons.append(f"chosen from '{face.get('source') or 'fallback'}' joints, not hip "
                            f"or shoulder level: prefer the thighs or shoulders if the asset "
                            f"has them")
    if judged >= 2 and len(conflicts) * 2 > judged:
        face_reasons.append(f'{len(conflicts)} of {judged} mirrored limb pairs lie the other '
                            f'way round: the pair is likely swapped')
    return {
        'format': FORMAT,
        'asset': name,
        'notes': list(notes),
        'face_pair': {'right': r or '', 'left': l or '', 'body_axis': bool(face.get('body_axis')),
                      'source': face.get('source', ''), 'check': bool(face_reasons),
                      **({'reasons': face_reasons} if face_reasons else {})},
        'face_pair_alternatives': _candidates(raw, labels, pos),
        'n_flagged': sum(j['check'] for j in joints),
        'joints': joints,
        'vocabulary': {
            'format': "[Left |Right ][Qualifier ]Part[ End], e.g. 'Left Front Leg', "
                      "'Right Index Finger End'. Qualifier: " + ', '.join(QUALIFIERS)
                      + ". No numbers: every joint of a chain takes the same label "
                        "(Spine, Spine, Spine; Tail, Tail), its last joint 'End' "
                        "('Tail End'). 'Bone' only for a joint that is no body part.",
            'parts': sorted(canonical_parts()),
        },
    }


def read_annotation(path):
    """The dict of annotation file *path*, with its structure checked: the
    format, a list of joints with string ``raw`` and non-empty string ``label``,
    and a ``face_pair`` of two different joint names (or none) with a boolean
    ``body_axis``. Raises ValueError saying what is wrong."""
    try:
        with open(path) as f:
            data = json.load(f)
    except ValueError as exc:
        raise ValueError(f"{path}: not valid JSON ({exc})") from None
    if not isinstance(data, dict) or data.get('format') != FORMAT:
        raise ValueError(f"{path}: not a rig_preprocess annotation (needs \"format\": "
                         f"\"{FORMAT}\")")
    joints = data.get('joints')
    if not isinstance(joints, list) or not joints:
        raise ValueError(f"{path}: 'joints' must be a non-empty list")
    seen = set()
    for j in joints:
        if not (isinstance(j, dict) and isinstance(j.get('raw'), str)
                and isinstance(j.get('label'), str)):
            raise ValueError(f"{path}: every joint needs a string 'raw' and a string 'label' "
                             f"(got {j!r:.80})")
        if not j['label'].strip():
            raise ValueError(f"{path}: empty label for joint {j['raw']!r}")
        if j['raw'] in seen:
            raise ValueError(f"{path}: joint {j['raw']!r} is listed twice")
        seen.add(j['raw'])
    fp = data.get('face_pair')
    if not isinstance(fp, dict) or not {'right', 'left'} <= set(fp):
        raise ValueError(f"{path}: 'face_pair' must be an object with 'right', 'left' and "
                         f"'body_axis' (both names empty for no pair)")
    r, l, axis = fp.get('right') or '', fp.get('left') or '', fp.get('body_axis', False)
    if not (isinstance(r, str) and isinstance(l, str)):
        raise ValueError(f"{path}: face_pair 'right' and 'left' must be joint names (strings)")
    if not isinstance(axis, bool):
        raise ValueError(f"{path}: face_pair 'body_axis' must be true or false, got {axis!r}")
    if bool(r) != bool(l):
        raise ValueError(f"{path}: face_pair needs both 'right' and 'left', or neither")
    if r and r == l:
        raise ValueError(f"{path}: face_pair names {r!r} twice; give two different joints")
    if axis and not r:
        raise ValueError(f"{path}: face_pair 'body_axis' is true but no joints are given")
    return data


def load_annotation(path, raw, rest_pos):
    """``(labels, face_entry, notes)`` from a reviewed ``annotation.json``,
    labels in the order of the exported skeleton's raw names *raw*. Raises
    ValueError saying what is wrong."""
    data = read_annotation(path)
    by_raw = {j['raw']: j['label'].strip() for j in data['joints']}
    raw = [str(n) for n in raw]
    missing = [n for n in raw if n not in by_raw]
    unknown = [n for n in by_raw if n not in raw]
    if missing or unknown:
        raise ValueError(f"{path}: joints do not match the exported skeleton (missing "
                         f"{missing[:5]}, unknown {unknown[:5]}); edit labels only, never the "
                         f"raw names")
    labels = [by_raw[n] for n in raw]
    fp = data.get('face_pair', {})
    r, l = fp.get('right') or '', fp.get('left') or ''
    if r:
        for joint in (r, l):
            if joint not in raw:
                raise ValueError(f"{path}: face_pair joint {joint!r} is not a joint of the asset")
        face = {'r_hip': {'raw': r, 'clean': labels[raw.index(r)]},
                'l_hip': {'raw': l, 'clean': labels[raw.index(l)]},
                'source': 'reviewed'}
        if fp.get('body_axis'):
            face['body_axis'] = True
            face['source'] = 'body_axis'
        if not facing_defined(face, raw, rest_pos):
            raise ValueError(f"{path}: face_pair {r} / {l} has no horizontal separation in the "
                             f"rest pose; choose two joints side by side (or a head / tail pair "
                             f"with body_axis true)")
    else:
        face = {'r_hip': {'raw': '', 'clean': ''}, 'l_hip': {'raw': '', 'clean': ''},
                'source': 'empty'}
    notes = [f'annotation from {path}']
    off = sorted({lab for lab in labels if not is_canonical_label(lab)})
    if off:
        notes.append(f'{len(off)} label(s) outside the vocabulary kept as given: {off[:5]}')
    return labels, face, notes


def _forward(face, raw, rest_pos):
    q = facing_quat(face, raw, rest_pos)
    if q is None:
        return None
    from Quaternions import Quaternions
    return (-Quaternions(np.asarray(q)[None]) * np.array([[0.0, 0.0, 1.0]]))[0]


def write_review(out_dir, annotation, raw, parents, rest_pos, face, resume_cmd):
    """Write ``annotation.json``, ``annotation_preview.png`` and ``REVIEW.md``."""
    path = os.path.join(out_dir, ANNOTATION_FILE)
    with open(path, 'w') as f:
        json.dump(annotation, f, indent=1)
    labels = [j['label'] for j in annotation['joints']]
    try:
        _render(os.path.join(out_dir, REVIEW_PREVIEW), annotation['asset'], raw, parents,
                rest_pos, labels, face)
    except Exception as exc:  # noqa: BLE001 — the annotation file is what matters
        from loguru import logger
        logger.warning(f"annotation preview failed: {exc}")
    with open(os.path.join(out_dir, REVIEW_FILE), 'w') as f:
        f.write(_review_text(annotation, resume_cmd))
    return path


def _render(path, name, raw, parents, rest_pos, labels, face):
    import imageio
    from data_process.rig_preprocess.preview import PANEL_DPI, PANEL_FIGSIZE, _fit_height
    from data_process.utils.plotting import (
        render_skeleton_tpose_annotated,
        render_skeleton_tpose_facing,
    )
    pos = np.asarray(rest_pos, dtype=np.float32)
    r, l = face.get('r_hip', {}).get('raw'), face.get('l_hip', {}).get('raw')
    pair = [raw.index(r), raw.index(l)] if r and l else [-1, -1]
    forward = _forward(face, list(raw), rest_pos)
    title = (f'{name}: rest pose as exported (not yet canonical)\n'
             f'facing pair: {r or "none"} / {l or "none"}'
             f'{"  (head / tail)" if face.get("body_axis") else ""}\n'
             f'green arrow: the forward direction this pair gives')
    facing = render_skeleton_tpose_facing(np.asarray(parents), pos, pair, forward=forward,
                                          title=title, figsize=PANEL_FIGSIZE, dpi=PANEL_DPI)
    labelled = render_skeleton_tpose_annotated(
        np.asarray(parents), pos, labels,
        figsize=(PANEL_FIGSIZE[0] * 1.4, PANEL_FIGSIZE[1] * 1.4), dpi=PANEL_DPI)
    height = max(facing.shape[0], labelled.shape[0])
    imageio.imwrite(path, np.concatenate([_fit_height(facing, height),
                                          _fit_height(labelled, height)], axis=1))


def _review_text(annotation, resume_cmd):
    fp = annotation['face_pair']
    flagged = [j for j in annotation['joints'] if j['check']]
    pair = (f"`{fp['right']}` / `{fp['left']}`" + (" (head / tail axis)" if fp['body_axis'] else '')
            if fp['right'] else 'none')
    alternatives = ', '.join(f"`{r}` / `{l}` ({part})"
                             for r, l, part in annotation['face_pair_alternatives'][:6])
    lines = [
        f"# Review the joint annotation of `{annotation['asset']}`",
        "",
        "The model is conditioned on two things decided here: a **label** for every joint,",
        "from one anatomical vocabulary shared by all training assets, and a **facing pair**,",
        "the two joints that say which way the asset faces. The labels and pair in",
        "`annotation.json` come from the annotation step (rules and a lookup of reviewed",
        "training rigs, or an LLM). Check them now: they are easy to fix here and invisible",
        "in the finished `cond.npy`.",
        "",
        f"- {len(annotation['joints'])} joints, {len(flagged)} flagged (`\"check\": true`).",
        f"- Facing pair: {pair}"
        + (f". **Flagged**: {'; '.join(fp.get('reasons', []))}" if fp['check'] else ''),
        "- `annotation_preview.png`: left, the rest pose with the pair (red right, blue left)",
        "  and the forward direction it gives (green arrow); right, every joint as",
        "  `[index] label`.",
        "",
    ]
    if annotation.get('notes'):
        lines += ["Notes from the run (an upside-down or lying rest pose needs `--rest_rotation`,",
                  "e.g. `x180`, added to the command under *Continue*):", ""]
        lines += [f"- {note}" for note in annotation['notes']] + [""]
    if flagged:
        lines += ["Flagged joints:", "", "| index | raw | label | why |", "|---|---|---|---|"]
        for j in flagged[:40]:
            lines.append(f"| {j['index']} | `{j['raw']}` | {j['label']} | "
                         f"{'; '.join(j['reasons'])} |")
        if len(flagged) > 40:
            lines.append(f"| ... | {len(flagged) - 40} more in `annotation.json` | | |")
        lines.append("")
    lines += [
        "## What to check",
        "",
        "1. **Labels** (`joints[].label`). Flags catch the obvious cases only; read the whole",
        "   list against the raw names and the hierarchy (`parent`).",
        "   - Form: `[Left |Right ][Qualifier ]Part[ End]`, with parts from",
        "     `vocabulary.parts`: `Left Thigh`, `Right Front Leg`, `Left Index Finger End`.",
        "   - **Left and Right are the asset's own sides**, as seen by the character, not by",
        "     the viewer.",
        "   - No numbers: every joint of a chain takes the same label (`Spine`, `Spine`,",
        "     `Spine`), and a chain's last joint may add `End` (`Tail End`).",
        "   - `Bone` only for joints that are not body parts (props, helpers).",
        "   - `source` says where a label came from: `template` (a training rig with the same",
        "     bone tree) and `names` (bone names whose reviewed label is consistent) are",
        "     usually right; `rule` labels deserve the closer look.",
        "2. **Facing pair** (`face_pair`). Two joints side by side, the asset's right one in",
        "   `right`: preferably the thighs, else the shoulders or the upper legs."
        + (f" Candidates the labels offer: {alternatives}." if alternatives else ''),
        "   For a body with no left / right (snake, fish, worm) give a head / tail pair, the",
        "   head end in `right`, and set `body_axis` to true. Leave both empty only if no pair",
        "   makes sense: the asset then keeps its authored facing.",
        "   The green arrow must point where the asset faces. If it points backwards, the",
        "   rig's Left / Right names are mirrored: swap `right` and `left`, and the sides of",
        "   the labels.",
        "",
        "Edit only `label`, `face_pair.right`, `face_pair.left` and `face_pair.body_axis`",
        "(`true` or `false`). Never change `raw` names and keep `format`; the other fields",
        "are information, ignored when loading.",
        "",
        "## Continue",
        "",
        "```bash",
        resume_cmd,
        "```",
        "",
        "The file is validated first (every joint labelled, the pair two joints of the asset",
        "that define a facing); the run then builds `cond.npy`, the canonical GLB and",
        "`preview.png` from it. To check an edited file before building, add `--review` to",
        "the command: the review files, `annotation.json` included, are written again from it",
        "(fields you added are dropped).",
        "",
        "## Asking an LLM or a coding agent",
        "",
        "Give it `annotation.json` (and `annotation_preview.png` if it reads images) with:",
        "",
        "> This is the joint annotation of a rigged 3D asset for a motion model. Check every",
        "> joint's `label` against its raw name, its parent and its place in the hierarchy, and",
        "> correct wrong ones using only the form and parts in `vocabulary` and the asset's own",
        "> left / right; the joints with `\"check\": true` list reasons. Then check",
        "> `face_pair`: two side-by-side joints, the asset's right one first, preferably the",
        "> thighs (for a limbless body a head / tail pair with `body_axis: true`). Change only",
        "> `label` values and the `face_pair` fields, keep every `raw` name and the JSON",
        "> structure, and return the whole corrected file.",
        "",
        "Save the answer over `annotation.json` and continue.",
        "",
    ]
    return '\n'.join(lines)
